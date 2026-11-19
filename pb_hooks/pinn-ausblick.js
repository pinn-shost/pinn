// pb_hooks/pinn-ausblick.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Outlook: weekly preview (every Sunday from 6 p.m.), monthly finance outlook (on the last day of the
// month from 6 p.m.) and, since 1.142.0, the year in review (28 December from 6 p.m.). What is in it is calculated by the app itself from the data it has anyway - the
// server only takes care of
//   - the push message (once per week, month or year and profile, in the profile's language),
//   - the "already seen" marker per profile, so that the banner only appears once on all devices,
//   - the personal switches "Weekly preview by push" / "Monthly outlook by push" / "Year in review by push".
//
// Gentle on CPU and memory:
//   - The schedule runs every 10 minutes, but only does something on Sundays, on the last day of the month or on 28 December
//     between 6 and 10 p.m. - and then exactly once (marker in pb_data/pinn_ausblick.json).
//   - No collection of its own, no family data when sending (only for the monthly outlook once per
//     family, to exclude children with parental controls).
//
// Since 1.142.2 the server also keeps a small counter of completed tasks per family and year (completed tasks are
// deleted after a few days, so they cannot be counted afterwards): zaehler[familyId][YYYY] = { a: all, h: household }.
//
// Time: since 1.150.3 every profile is on its own clock (pinn-zeit.js: time zone of the device; Europe/Berlin without a stored zone).
// "Already sent" is remembered per profile (versendet.woche / .monat / .jahr: profile ID -> key).

const STATUS_FILE = "/pb_data/pinn_ausblick.json";
const SEND_FROM_HOUR = 18;
const SEND_UNTIL_HOUR = 22; // after 10 p.m. (e.g. server was off) no more push - the banner still comes

// ---------------------------------------------------------------------------------------------
// Time of day (clock of the profile, pinn-zeit.js)
// ---------------------------------------------------------------------------------------------
function pad2(n) { return (n < 10 ? "0" : "") + n; }
// Wall clock: { y, m (1-12), d, wd (0 = Sunday), hour, iso }; clock = clockOfUser(...) (without one: Europe/Berlin)
function wallNow(clock) { return require(`${__hooks}/pinn-zeit.js`).wallOf(clock); }
function isoAddDays(iso, n) {
    const p = iso.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
// Week in question: from Sunday 6 p.m. the coming one, otherwise the current one (Monday as ISO)
function weekKey(w) {
    if (w.wd === 0 && w.hour >= SEND_FROM_HOUR) return isoAddDays(w.iso, 1);
    return isoAddDays(w.iso, -((w.wd + 6) % 7));
}
// Month in question: on the last day of the month from 6 p.m. the next one, otherwise the current one (YYYY-MM)
function monthKey(w) {
    if (w.d === daysInMonth(w.y, w.m) && w.hour >= SEND_FROM_HOUR) {
        const ny = w.m === 12 ? w.y + 1 : w.y, nm = w.m === 12 ? 1 : w.m + 1;
        return ny + "-" + pad2(nm);
    }
    return w.y + "-" + pad2(w.m);
}
// Year in review (since 1.142.0): from 28 December 6 p.m. until 10 January the year that just ended, otherwise the current one (YYYY)
function yearKey(w) {
    if (w.m === 1 && w.d <= 10) return String(w.y - 1);
    return String(w.y);
}

// ---------------------------------------------------------------------------------------------
// Markers in pb_data
// ---------------------------------------------------------------------------------------------
function readStatus() {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
        if (o && typeof o === "object") {
            if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
            if (!o.nutzer || typeof o.nutzer !== "object") o.nutzer = {};
            if (!o.zaehler || typeof o.zaehler !== "object") o.zaehler = {};
            if (!o.versendet || typeof o.versendet !== "object") o.versendet = {};
            ["woche", "monat", "jahr"].forEach(k => { if (!o.versendet[k] || typeof o.versendet[k] !== "object") o.versendet[k] = {}; });
            return o;
        }
    } catch (e) { /* no file yet */ }
    return { gesendet: { woche: "", monat: "", jahr: "" }, versendet: { woche: {}, monat: {}, jahr: {} }, nutzer: {}, zaehler: {} };
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Ausblick] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}
function userState(s, userId) {
    const u = s.nutzer[userId];
    const out = { woche: "", monat: "", jahr: "", pushWoche: true, pushMonat: true, pushJahr: true };
    if (u && typeof u === "object") {
        if (typeof u.woche === "string") out.woche = u.woche;
        if (typeof u.monat === "string") out.monat = u.monat;
        if (typeof u.jahr === "string") out.jahr = u.jahr;
        if (u.pushWoche === false) out.pushWoche = false;
        if (u.pushMonat === false) out.pushMonat = false;
        if (u.pushJahr === false) out.pushJahr = false;
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Who gets what?
// ---------------------------------------------------------------------------------------------
function role(u) { return u.getString("rolle"); }
function isChildLocked(u, membersByFamily) {
    if (role(u) === "admin" || role(u) === "gast") return false;
    const fam = u.getString("familie");
    if (!(fam in membersByFamily)) {
        let members = [];
        try { members = (require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(fam) || {}).members || []; } catch (e) { members = []; }
        membersByFamily[fam] = Array.isArray(members) ? members : [];
    }
    const mid = u.getString("mitglied");
    const m = membersByFamily[fam].find(x => x && x.id === mid);
    return !!(m && m.childLock);
}
function hasFinances(u) {
    try {
        const acc = require(`${__hooks}/pinn-kassen.js`).access(u);
        return !!(acc && acc.real && acc.real.length);
    } catch (e) {
        return role(u) !== "gast";
    }
}
// Language of the profile (Settings → Language & region); without a setting by the country, otherwise English
function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko", "ru", "nl", "tr", "pl", "uk", "cs", "sv", "da", "nb"].indexOf(s) >= 0) return s;
    if (/^[a-z]{2}$/.test(s)) return "en";
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
    if (["IT", "SM", "VA"].indexOf(land) >= 0) return "it";
    if (["BR", "PT", "AO", "MZ"].indexOf(land) >= 0) return "pt";
    if (["CN"].indexOf(land) >= 0) return "zh";
    if (["JP"].indexOf(land) >= 0) return "ja";
    if (["KR"].indexOf(land) >= 0) return "ko";
    if (["RU"].indexOf(land) >= 0) return "ru";
    if (["NL", "SR", "AW", "CW", "SX"].indexOf(land) >= 0) return "nl";
    if (["TR"].indexOf(land) >= 0) return "tr";
    if (["PL"].indexOf(land) >= 0) return "pl";
    if (["UA"].indexOf(land) >= 0) return "uk";
    if (["CZ"].indexOf(land) >= 0) return "cs";
    if (["SE", "AX"].indexOf(land) >= 0) return "sv";
    if (["DK", "GL", "FO"].indexOf(land) >= 0) return "da";
    if (["NO", "SJ"].indexOf(land) >= 0) return "nb";
    return "en";
}

// ---------------------------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------------------------
const MONTHS = {
    de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    it: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    pt: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    zh: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    ja: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
    ko: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
    ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
    nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
    tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
    pl: ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"],
    uk: ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"],
    cs: ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"],
    sv: ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"],
    da: ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"],
    nb: ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"],
};
// Russian needs the genitive for date ranges and the prepositional case for "in the month" (the list above is the nominative)
const MONTHS_RU_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_RU_PREP = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
// Polish (since 1.132.16): genitive for date ranges ("od 2 do 8 listopada") and locative for "in the month" (the list above is the nominative)
const MONTHS_PL_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const MONTHS_PL_LOC = ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrześniu", "październiku", "listopadzie", "grudniu"];
// Ukrainian (since 1.135.16): genitive for date ranges ("з 2 по 8 листопада") and locative for "in the month" (the list above is the nominative)
const MONTHS_UK_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
const MONTHS_UK_LOC = ["січні", "лютому", "березні", "квітні", "травні", "червні", "липні", "серпні", "вересні", "жовтні", "листопаді", "грудні"];
const MONTHS_CS_GEN = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const MONTHS_CS_LOC = ["lednu", "únoru", "březnu", "dubnu", "květnu", "červnu", "červenci", "srpnu", "září", "říjnu", "listopadu", "prosinci"];
function rangeText(lang, mondayIso) {
    const a = mondayIso.split("-").map(Number);
    const b = isoAddDays(mondayIso, 6).split("-").map(Number);
    const M = MONTHS[lang] || MONTHS.en;
    if (lang === "en") return a[1] === b[1] ? (a[2] + "–" + b[2] + " " + M[b[1] - 1]) : (a[2] + " " + M[a[1] - 1] + " – " + b[2] + " " + M[b[1] - 1]);
    if (lang === "de") return a[1] === b[1] ? (a[2] + ".–" + b[2] + ". " + M[b[1] - 1]) : (a[2] + ". " + M[a[1] - 1] + " – " + b[2] + ". " + M[b[1] - 1]);
    if (lang === "es") return a[1] === b[1] ? ("del " + a[2] + " al " + b[2] + " de " + M[b[1] - 1]) : ("del " + a[2] + " de " + M[a[1] - 1] + " al " + b[2] + " de " + M[b[1] - 1]);
    if (lang === "it") return a[1] === b[1] ? ("dal " + a[2] + " al " + b[2] + " " + M[b[1] - 1]) : ("dal " + a[2] + " " + M[a[1] - 1] + " al " + b[2] + " " + M[b[1] - 1]);
    if (lang === "pt") return a[1] === b[1] ? (a[2] + " a " + b[2] + " de " + M[b[1] - 1]) : (a[2] + " de " + M[a[1] - 1] + " a " + b[2] + " de " + M[b[1] - 1]);
    if (lang === "zh") return a[1] === b[1] ? (M[b[1] - 1] + a[2] + "日–" + b[2] + "日") : (M[a[1] - 1] + a[2] + "日–" + M[b[1] - 1] + b[2] + "日");
    if (lang === "ja") return a[1] === b[1] ? (M[b[1] - 1] + a[2] + "日～" + b[2] + "日") : (M[a[1] - 1] + a[2] + "日～" + M[b[1] - 1] + b[2] + "日");
    if (lang === "ko") return a[1] === b[1] ? (M[b[1] - 1] + " " + a[2] + "일~" + b[2] + "일") : (M[a[1] - 1] + " " + a[2] + "일~" + M[b[1] - 1] + " " + b[2] + "일");
    if (lang === "nl") return a[1] === b[1] ? (a[2] + "–" + b[2] + " " + M[b[1] - 1]) : (a[2] + " " + M[a[1] - 1] + " – " + b[2] + " " + M[b[1] - 1]);
    if (lang === "tr") return a[1] === b[1] ? (a[2] + "–" + b[2] + " " + M[b[1] - 1]) : (a[2] + " " + M[a[1] - 1] + " – " + b[2] + " " + M[b[1] - 1]);
    if (lang === "ru") {
        const from = (a[2] === 2 ? "со " : "с ") + a[2];   // „со 2 по 8 ноября“ (read as „со второго“)
        return a[1] === b[1] ? (from + " по " + b[2] + " " + MONTHS_RU_GEN[b[1] - 1]) : (from + " " + MONTHS_RU_GEN[a[1] - 1] + " по " + b[2] + " " + MONTHS_RU_GEN[b[1] - 1]);
    }
    if (lang === "pl") return a[1] === b[1] ? ("od " + a[2] + " do " + b[2] + " " + MONTHS_PL_GEN[b[1] - 1]) : ("od " + a[2] + " " + MONTHS_PL_GEN[a[1] - 1] + " do " + b[2] + " " + MONTHS_PL_GEN[b[1] - 1]);
    if (lang === "uk") return a[1] === b[1] ? ("з " + a[2] + " по " + b[2] + " " + MONTHS_UK_GEN[b[1] - 1]) : ("з " + a[2] + " " + MONTHS_UK_GEN[a[1] - 1] + " по " + b[2] + " " + MONTHS_UK_GEN[b[1] - 1]);
    if (lang === "cs") return a[1] === b[1] ? ("od " + a[2] + ". do " + b[2] + ". " + MONTHS_CS_GEN[b[1] - 1]) : ("od " + a[2] + ". " + MONTHS_CS_GEN[a[1] - 1] + " do " + b[2] + ". " + MONTHS_CS_GEN[b[1] - 1]);
    // Swedish (since 1.156.0): months are not declined, "2–8 november" / "30 oktober – 5 november"
    if (lang === "sv") return a[1] === b[1] ? (a[2] + "–" + b[2] + " " + M[b[1] - 1]) : (a[2] + " " + M[a[1] - 1] + " – " + b[2] + " " + M[b[1] - 1]);
    // Danish (since 1.157.0): "2.–8. november" / "30. oktober – 5. november"
    if (lang === "da") return a[1] === b[1] ? (a[2] + ".–" + b[2] + ". " + M[b[1] - 1]) : (a[2] + ". " + M[a[1] - 1] + " – " + b[2] + ". " + M[b[1] - 1]);
    // Norwegian (since 1.158.0): "2.–8. november" / "30. oktober – 5. november"
    if (lang === "nb") return a[1] === b[1] ? (a[2] + ".–" + b[2] + ". " + M[b[1] - 1]) : (a[2] + ". " + M[a[1] - 1] + " – " + b[2] + ". " + M[b[1] - 1]);
    return a[1] === b[1] ? ("du " + a[2] + " au " + b[2] + " " + M[b[1] - 1]) : ("du " + a[2] + " " + M[a[1] - 1] + " au " + b[2] + " " + M[b[1] - 1]);
}
function weekMessage(lang, mondayIso) {
    const r = rangeText(lang, mondayIso);
    if (lang === "de") return { titel: "🗓️ Eure Woche ist da", text: "Termine, Aufgaben, Essen und mehr für " + r + " – alles auf einen Blick." };
    if (lang === "fr") return { titel: "🗓️ Votre semaine est prête", text: "Rendez-vous, tâches, repas et plus " + r + " – tout en un coup d'œil." };
    if (lang === "es") return { titel: "🗓️ Vuestra semana está lista", text: "Citas, tareas, comidas y más " + r + ", todo de un vistazo." };
    if (lang === "it") return { titel: "🗓️ La vostra settimana è pronta", text: "Eventi, attività, pasti e altro " + r + ": tutto a colpo d’occhio." };
    if (lang === "pt") return { titel: "🗓️ A semana de vocês está pronta", text: "Compromissos, tarefas, refeições e mais de " + r + " – tudo num relance." };
    if (lang === "zh") return { titel: "🗓️ 你们的一周来了", text: r + "的日程、任务、餐食等——一目了然。" };
    if (lang === "ja") return { titel: "🗓️ 今週の予定が届きました", text: r + "の予定、タスク、食事など – ひと目でわかります。" };
    if (lang === "ko") return { titel: "🗓️ 이번 주가 준비됐어요", text: r + "의 일정, 할 일, 식사 등 – 한눈에 확인하세요." };
    if (lang === "ru") return { titel: "🗓️ Ваша неделя готова", text: "События, задачи, питание и многое другое на период " + r + " – всё на одном экране." };
    if (lang === "nl") return { titel: "🗓️ Jullie week staat klaar", text: "Afspraken, taken, maaltijden en meer voor " + r + " – alles in één oogopslag." };
    if (lang === "tr") return { titel: "🗓️ Haftan hazır", text: r + " için etkinlikler, görevler, yemekler ve daha fazlası – hepsi bir bakışta." };
    if (lang === "pl") return { titel: "🗓️ Twój tydzień jest gotowy", text: "Wydarzenia, zadania, posiłki i więcej – " + r + " – wszystko na jednym ekranie." };
    if (lang === "uk") return { titel: "🗓️ Ваш тиждень готовий", text: "Події, завдання, харчування та багато іншого на період " + r + " – усе на одному екрані." };
    if (lang === "cs") return { titel: "🗓️ Tvůj týden je připraven", text: "Události, úkoly, jídla a další na období " + r + " – vše na jedné obrazovce." };
    if (lang === "sv") return { titel: "🗓️ Din vecka är här", text: "Händelser, uppgifter, måltider och mer för " + r + " – allt på ett ställe." };
    if (lang === "da") return { titel: "🗓️ Din uge er klar", text: "Begivenheder, opgaver, måltider og mere for " + r + " – alt samlet ét sted." };
    if (lang === "nb") return { titel: "🗓️ Uken din er klar", text: "Avtaler, oppgaver, måltider og mer for " + r + " – alt samlet på ett sted." };
    return { titel: "🗓️ Your week is ready", text: "Events, tasks, meals and more for " + r + " – all at a glance." };
}
function monthMessage(lang, key) {
    const m = Number(key.slice(5, 7));
    const M = MONTHS[lang] || MONTHS.en;
    const next = M[m - 1], prev = M[(m + 10) % 12];
    if (lang === "de") return { titel: "💶 Finanz-Ausblick " + next, text: "Was im " + next + " ansteht – und wie der " + prev + " gelaufen ist." };
    if (lang === "fr") return { titel: "💶 Perspectives financières : " + next, text: "Ce qui vous attend en " + next + " – et le bilan de " + prev + "." };
    if (lang === "es") return { titel: "💶 Previsión financiera: " + next, text: "Lo que viene en " + next + " y cómo ha ido " + prev + "." };
    if (lang === "it") return { titel: "💶 Previsione finanziaria: " + next, text: "Cosa c’è in arrivo a " + next + " – e com’è andato " + prev + "." };
    if (lang === "pt") return { titel: "💶 Previsão financeira: " + next, text: "O que vem por aí em " + next + " – e como foi " + prev + "." };
    if (lang === "zh") return { titel: "💶 财务展望：" + next, text: "接下来" + next + "有什么——以及" + prev + "的情况。" };
    if (lang === "ja") return { titel: "💶 家計の見通し：" + next, text: next + "の予定と、" + prev + "の振り返り。" };
    if (lang === "ko") return { titel: "💶 재정 전망: " + next, text: next + "에 예정된 일 – 그리고 " + prev + "은 어땠는지." };
    if (lang === "ru") return { titel: "💶 Финансовый прогноз: " + next, text: "Что ждёт в " + MONTHS_RU_PREP[m - 1] + " – и как прошёл " + prev + "." };
    if (lang === "nl") return { titel: "💶 Financiële vooruitblik: " + next, text: "Wat er in " + next + " op jullie wacht – en hoe " + prev + " is verlopen." };
    if (lang === "tr") return { titel: "💶 Finans ön bakışı: " + next, text: next + " ayında neler var – ve " + prev + " ayı nasıl geçti." };
    if (lang === "pl") return { titel: "💶 Zapowiedź finansów: " + next, text: "Co czeka w " + MONTHS_PL_LOC[m - 1] + " – i jak minął " + prev + "." };
    if (lang === "uk") return { titel: "💶 Фінансовий огляд: " + next, text: "Що очікується у " + MONTHS_UK_LOC[m - 1] + " – і як минув " + prev + "." };
    if (lang === "cs") return { titel: "💶 Výhled financí: " + next, text: "Co přijde v " + MONTHS_CS_LOC[m - 1] + " – a rekapitulace: " + prev + "." };
    if (lang === "sv") return { titel: "💶 Ekonomiutblick: " + next, text: "Vad som väntar i " + next + " – och hur " + prev + " blev." };
    if (lang === "da") return { titel: "💶 Økonomioverblik: " + next, text: "Hvad der venter i " + next + " – og hvordan " + prev + " gik." };
    if (lang === "nb") return { titel: "💶 Økonomioversikt: " + next, text: "Hva som venter i " + next + " – og hvordan " + prev + " gikk." };
    return { titel: "💶 Finance outlook: " + next.charAt(0).toUpperCase() + next.slice(1), text: "What's coming up in " + next + " – and how " + prev + " went." };
}

function yearMessage(lang, year) {
    if (lang === "de") return { titel: "🎁 Euer Jahresrückblick " + year, text: "Ausgaben, gekochte Gerichte und Urlaube – so war euer Jahr." };
    if (lang === "fr") return { titel: "🎁 Votre bilan de l’année " + year, text: "Dépenses, repas cuisinés et voyages – voici votre année." };
    if (lang === "es") return { titel: "🎁 Vuestro resumen del año " + year, text: "Gastos, comidas cocinadas y viajes: así fue vuestro año." };
    if (lang === "it") return { titel: "🎁 Il riepilogo del vostro " + year, text: "Spese, piatti cucinati e viaggi: ecco com’è andato il vostro anno." };
    if (lang === "pt") return { titel: "🎁 O resumo do vosso ano " + year, text: "Despesas, refeições cozinhadas e viagens – assim foi o vosso ano." };
    if (lang === "zh") return { titel: "🎁 你们的 " + year + " 年度回顾", text: "支出、做过的菜和旅行——这就是你们的一年。" };
    if (lang === "ja") return { titel: "🎁 " + year + "年のふりかえり", text: "支出、作った料理、旅行 – 今年のまとめです。" };
    if (lang === "ko") return { titel: "🎁 " + year + "년 돌아보기", text: "지출, 만든 요리, 여행 – 올해를 한눈에 돌아보세요." };
    if (lang === "ru") return { titel: "🎁 Итоги вашего " + year + " года", text: "Расходы, приготовленные блюда и поездки – таким был ваш год." };
    if (lang === "nl") return { titel: "🎁 Jullie jaaroverzicht " + year, text: "Uitgaven, gekookte gerechten en reizen – zo was jullie jaar." };
    if (lang === "tr") return { titel: "🎁 " + year + " yıl özetiniz hazır", text: "Harcamalar, pişirilen yemekler ve geziler – işte yılınız." };
    if (lang === "pl") return { titel: "🎁 Wasze podsumowanie roku " + year, text: "Wydatki, ugotowane dania i wyjazdy – tak wyglądał wasz rok." };
    if (lang === "uk") return { titel: "🎁 Підсумки вашого " + year + " року", text: "Витрати, приготовані страви та подорожі – таким був ваш рік." };
    if (lang === "cs") return { titel: "🎁 Tvůj rok " + year + " v přehledu", text: "Výdaje, uvařená jídla a cesty – takový byl tvůj rok." };
    if (lang === "sv") return { titel: "🎁 Ditt år " + year + " i översikt", text: "Utgifter, lagade måltider och resor – så var ditt år." };
    if (lang === "da") return { titel: "🎁 Dit år " + year + " i overblik", text: "Udgifter, lavede måltider og rejser – sådan var dit år." };
    if (lang === "nb") return { titel: "🎁 Året ditt " + year + " i oversikt", text: "Utgifter, lagde måltider og reiser – slik var året ditt." };
    return { titel: "🎁 Your year in review " + year, text: "Expenses, meals cooked and trips – this was your year." };
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------
function allUsers() {
    try { return $app.findRecordsByFilter("benutzer", "familie != ''", "", 0, 0); } catch (e) { return []; }
}
function runCron() {
    const Z = require(`${__hooks}/pinn-zeit.js`);
    const status = readStatus();
    const membersByFamily = {};
    const out = {};
    let push = null, dirty = false;
    allUsers().forEach(u => {
        if (role(u) === "hauptadmin") return;
        const guest = role(u) === "gast";
        // wall clock of this profile (its own time zone)
        const w = wallNow(Z.clockOfUser(u.id, u.getString("familie")));
        if (w.hour < SEND_FROM_HOUR || w.hour >= SEND_UNTIL_HOUR) return;
        const isSunday = w.wd === 0;
        const isMonthEnd = w.d === daysInMonth(w.y, w.m);
        const isYearDay = w.m === 12 && w.d === 28;
        if (!isSunday && !isMonthEnd && !isYearDay) return;
        const st = userState(status, u.id);
        const lang = langOf(u);
        // remember first: even on an error along the way, the message never comes twice
        function send(art, key, msg, url, tag, label) {
            status.versendet[art][u.id] = key;
            dirty = true;
            if (!push) push = require(`${__hooks}/pinn-push.js`);
            try {
                out[art] = (out[art] || 0) + (push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: url, tag: tag + key, urgency: "normal" }) || 0);
            } catch (e) { console.log("[Ausblick] Push " + label + ": " + e.message); }
        }
        if (isSunday) {
            const key = weekKey(w);
            if (st.pushWoche && st.woche !== key && status.versendet.woche[u.id] !== key) {
                send("woche", key, weekMessage(lang, key), "/?ausblick=woche", "ausblick-woche-", "Wochenvorschau");
            }
        }
        if (isMonthEnd && !guest) {
            const key = monthKey(w);
            if (st.pushMonat && st.monat !== key && status.versendet.monat[u.id] !== key && !isChildLocked(u, membersByFamily) && hasFinances(u)) {
                send("monat", key, monthMessage(lang, key), "/?ausblick=monat", "ausblick-monat-", "Monatsausblick");
            }
        }
        if (isYearDay && !guest) {
            const key = String(w.y);
            if (st.pushJahr && st.jahr !== key && status.versendet.jahr[u.id] !== key) {
                send("jahr", key, yearMessage(lang, key), "/?ausblick=jahr", "ausblick-jahr-", "Jahresrückblick");
            }
        }
    });
    if (dirty) {
        writeStatus(status);
        console.log("[Ausblick] Push-Nachrichten: " + JSON.stringify(out));
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Counter of completed tasks (since 1.142.2) – for the year in review
// ---------------------------------------------------------------------------------------------
// delta = +1 when a task is ticked off, -1 when the tick is removed again; the year is the one of the ticking-off time
// (ISO string, e.g. "2026-11-09T10:00:00.000Z"). Household tasks are counted in "h" as well.
function countDone(familyId, delta, household, whenIso) {
    familyId = String(familyId || "");
    const year = String(whenIso || "").slice(0, 4);
    if (!familyId || !/^\d{4}$/.test(year) || (delta !== 1 && delta !== -1)) return;
    const s = readStatus();
    if (!s.zaehlerSeit) s.zaehlerSeit = wallNow().iso;
    const fam = s.zaehler[familyId] && typeof s.zaehler[familyId] === "object" ? s.zaehler[familyId] : {};
    const cur = fam[year] && typeof fam[year] === "object" ? fam[year] : { a: 0, h: 0 };
    cur.a = Math.max(0, (Number(cur.a) || 0) + delta);
    if (household) cur.h = Math.max(0, (Number(cur.h) || 0) + delta);
    fam[year] = cur;
    s.zaehler[familyId] = fam;
    writeStatus(s);
}
function countsFor(s, familyId) {
    const fam = s.zaehler && s.zaehler[String(familyId || "")];
    const out = {};
    if (fam && typeof fam === "object") {
        Object.keys(fam).forEach(y => {
            if (/^\d{4}$/.test(y) && fam[y]) out[y] = { a: Number(fam[y].a) || 0, h: Number(fam[y].h) || 0 };
        });
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// For the app
// ---------------------------------------------------------------------------------------------
function stateFor(user) {
    const w = wallNow(require(`${__hooks}/pinn-zeit.js`).clockOfUser(user.id, user.getString("familie")));
    const status = readStatus();
    const st = userState(status, user.id);
    return {
        woche: weekKey(w),
        monat: monthKey(w),
        jahr: yearKey(w),
        gesehen: { woche: st.woche, monat: st.monat, jahr: st.jahr },
        push: { woche: st.pushWoche, monat: st.pushMonat, jahr: st.pushJahr },
        zaehler: countsFor(status, user.getString("familie")),
        zaehlerSeit: String(status.zaehlerSeit || ""),
    };
}
function markSeen(user, art, key) {
    if (art !== "woche" && art !== "monat" && art !== "jahr") throw new Error("Unbekannter Ausblick.");
    key = String(key || "");
    if (art === "woche" && !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Ungültige Woche.");
    if (art === "monat" && !/^\d{4}-\d{2}$/.test(key)) throw new Error("Ungültiger Monat.");
    if (art === "jahr" && !/^\d{4}$/.test(key)) throw new Error("Ungültiges Jahr.");
    const s = readStatus();
    const cur = s.nutzer[user.id] && typeof s.nutzer[user.id] === "object" ? s.nutzer[user.id] : {};
    // never back to an older week or month
    if (!cur[art] || String(cur[art]) < key) cur[art] = key;
    s.nutzer[user.id] = cur;
    writeStatus(s);
    return stateFor(user);
}
function savePush(user, body) {
    const s = readStatus();
    const cur = s.nutzer[user.id] && typeof s.nutzer[user.id] === "object" ? s.nutzer[user.id] : {};
    if (typeof body.woche === "boolean") cur.pushWoche = body.woche;
    if (typeof body.monat === "boolean") cur.pushMonat = body.monat;
    if (typeof body.jahr === "boolean") cur.pushJahr = body.jahr;
    s.nutzer[user.id] = cur;
    writeStatus(s);
    return stateFor(user);
}
// Remove deleted profiles from the marker (once on start)
function pruneUsers() {
    const s = readStatus();
    let changed = false;
    // Day from which completed tasks are counted (since 1.142.2) – set once on the first start with this version
    if (!s.zaehlerSeit) { s.zaehlerSeit = wallNow().iso; changed = true; }
    const ids = Object.keys(s.nutzer);
    ids.forEach(id => {
        try { $app.findRecordById("benutzer", id); } catch (e) { delete s.nutzer[id]; changed = true; }
    });
    // markers of "already sent": only the current key per profile is needed, deleted profiles go
    ["woche", "monat", "jahr"].forEach(art => {
        Object.keys(s.versendet[art]).forEach(id => {
            try { $app.findRecordById("benutzer", id); } catch (e) { delete s.versendet[art][id]; changed = true; }
        });
    });
    if (changed) writeStatus(s);
}

module.exports = { runCron, stateFor, markSeen, savePush, pruneUsers, weekKey, monthKey, yearKey, wallNow, countDone };
