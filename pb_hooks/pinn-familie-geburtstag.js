// pb_hooks/pinn-familie-geburtstag.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Birthdays in the family (date of birth from the emergency pass, family data → emergencyPasses):
//   - Push to all OTHER profiles of the family: "🎂 Malea has a birthday today!" - at the same time
//     as the own daily overview (Settings → Notifications, default 07:00). The
//     birthday child themselves gets no message (they get the birthday animation in the app),
//     nor do guest accounts or the main admin. Several birthdays on the same day come in
//     one joint message. Link: /?geburtstag=<member ID> opens the person in pinn.
//   - "Animation already seen" per member and day (only once on all devices):
//       GET  /api/pinn/geburtstag          { heute, gesehen: [<member ID>, ...] }
//       POST /api/pinn/geburtstag/gesehen  { mitglied }
//
// Gentle:
//   - The schedule runs every 5 minutes. It reads the (large) family data at most once a day per
//     family - and only anew if the family data has changed since then (change time).
//   - Marker in pb_data/pinn_familie_geburtstag.json, older days are discarded.
//   - After 9 p.m. (e.g. server was off) no more message for the day.
//
// Time: like the other reminders in Europe/Berlin (summer/winter time is calculated itself).

const STATUS_FILE = "/pb_data/pinn_familie_geburtstag.json";
const SEND_UNTIL_HOUR = 21;
const DEFAULT_TIME = "07:00";

module.exports = { runCron, stateFor, markSeen, birthdaysToday };

// ---------------------------------------------------------------------------------------------
// Uhrzeit (Europe/Berlin)
// ---------------------------------------------------------------------------------------------
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}
function wallNow() {
    const now = Date.now();
    const d = new Date(now + tzOffsetMs(now));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return { y: y, m: m, d: day, hour: d.getUTCHours(), min: d.getUTCMinutes(), iso: y + "-" + pad2(m) + "-" + pad2(day) };
}
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ---------------------------------------------------------------------------------------------
// Merker in pb_data
// ---------------------------------------------------------------------------------------------
function readStatus(today) {
    let o = null;
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
    } catch (e) { o = null; }
    if (!o || typeof o !== "object" || o.datum !== today) o = { datum: today, familien: {}, gesendet: {}, gesehen: {} };
    if (!o.familien || typeof o.familien !== "object") o.familien = {};
    if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
    if (!o.gesehen || typeof o.gesehen !== "object") o.gesehen = {};
    return o;
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Geburtstag] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}

// ---------------------------------------------------------------------------------------------
// Who has a birthday today?
// ---------------------------------------------------------------------------------------------
function memberName(m) {
    if (!m) return "";
    if (m.displayMode === "role" && m.role) return String(m.role);
    return String(m.name || m.role || "");
}
// List from the family data: [{ id, name, alter }]
function birthdaysFromData(data, w) {
    const members = Array.isArray(data && data.members) ? data.members : [];
    const passes = (data && data.emergencyPasses && typeof data.emergencyPasses === "object") ? data.emergencyPasses : {};
    const out = [];
    members.forEach(m => {
        if (!m || !m.id) return;
        const p = passes[m.id];
        const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String((p && p.birth) || ""));
        if (!mm) return;
        let bm = Number(mm[2]), bd = Number(mm[3]);
        if (bm === 2 && bd === 29 && !isLeap(w.y)) bd = 28; // 29 February: in other years on the 28th
        if (bm !== w.m || bd !== w.d) return;
        const alter = w.y - Number(mm[1]);
        out.push({ id: String(m.id), name: memberName(m), alter: alter > 0 && alter < 130 ? alter : null });
    });
    return out;
}
// With a cache: only read the family data if it has changed today
function birthdaysToday(familyId, status, w) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const stamp = lib.familyDataStamp(familyId);
    const c = status.familien[familyId];
    if (c && c.stamp === stamp && Array.isArray(c.liste)) return c.liste;
    let data = {};
    try { data = lib.loadFamilyDataFor(familyId) || {}; } catch (e) { data = {}; }
    const liste = birthdaysFromData(data, w);
    status.familien[familyId] = { stamp: stamp, liste: liste };
    status.dirty = true;
    return liste;
}

// ---------------------------------------------------------------------------------------------
// Texts (language of the profile)
// ---------------------------------------------------------------------------------------------
function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko", "ru", "nl"].indexOf(s) >= 0) return s;
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
    return "en";
}
function joinNames(lang, names) {
    if (names.length <= 1) return names[0] || "";
    const und = { de: " und ", en: " and ", fr: " et ", es: " y ", it: " e ", pt: " e ", zh: "和", ja: "と", ko: ", ", ru: " и ", nl: " en " }[lang] || " and ";
    return names.slice(0, -1).join(", ") + und + names[names.length - 1];
}
function message(lang, list) {
    if (list.length === 1) {
        const b = list[0];
        const n = b.name;
        if (lang === "de") return { titel: "🎂 " + n + " hat heute Geburtstag!", text: (b.alter ? n + " wird heute " + b.alter + ". " : "") + "Vergesst nicht zu gratulieren 🎉" };
        if (lang === "fr") return { titel: "🎂 C'est l'anniversaire de " + n + " !", text: (b.alter ? n + " a " + b.alter + " ans aujourd'hui. " : "") + "N'oubliez pas de le souhaiter 🎉" };
        if (lang === "es") return { titel: "🎂 ¡Hoy es el cumpleaños de " + n + "!", text: (b.alter ? n + " cumple " + b.alter + " años. " : "") + "No olvidéis felicitarle 🎉" };
        if (lang === "it") return { titel: "🎂 Oggi è il compleanno di " + n + "!", text: (b.alter ? n + " compie " + b.alter + " anni oggi. " : "") + "Non dimenticate di fare gli auguri 🎉" };
        if (lang === "pt") return { titel: "🎂 Hoje é aniversário de " + n + "!", text: (b.alter ? n + " faz " + b.alter + " anos hoje. " : "") + "Não esqueçam de dar os parabéns 🎉" };
        if (lang === "zh") return { titel: "🎂 今天是 " + n + " 的生日！", text: (b.alter ? n + " 今天满 " + b.alter + " 岁。" : "") + "别忘了送上祝福 🎉" };
        if (lang === "ja") return { titel: "🎂 今日は" + n + "の誕生日です！", text: (b.alter ? n + "は今日で" + b.alter + "歳になります。" : "") + "お祝いを忘れずに 🎉" };
        if (lang === "ko") return { titel: "🎂 오늘은 " + n + "님의 생일이에요!", text: (b.alter ? n + "님이 오늘 " + b.alter + "살이 돼요. " : "") + "축하 인사 잊지 마세요 🎉" };
        // Russian: names are never declined, ages are written as an ordinal ("25-й день рождения") to avoid the plural of "год/года/лет"
        if (lang === "ru") return { titel: "🎂 Сегодня день рождения: " + n + "!", text: (b.alter ? "Отмечает " + b.alter + "-й день рождения. " : "") + "Не забудьте поздравить 🎉" };
        if (lang === "nl") return { titel: "🎂 " + n + " is vandaag jarig!", text: (b.alter ? n + " wordt vandaag " + b.alter + ". " : "") + "Vergeet niet te feliciteren 🎉" };
        return { titel: "🎂 It's " + n + "'s birthday today!", text: (b.alter ? n + " turns " + b.alter + " today. " : "") + "Don't forget to say happy birthday 🎉" };
    }
    const names = joinNames(lang, list.map(b => b.name));
    if (lang === "de") return { titel: "🎂 Heute haben Geburtstag: " + names, text: "Vergesst nicht zu gratulieren 🎉" };
    if (lang === "fr") return { titel: "🎂 Anniversaires aujourd'hui : " + names, text: "N'oubliez pas de les souhaiter 🎉" };
    if (lang === "es") return { titel: "🎂 Hoy cumplen años: " + names, text: "No olvidéis felicitarles 🎉" };
    if (lang === "it") return { titel: "🎂 Oggi compiono gli anni: " + names, text: "Non dimenticate di fare gli auguri 🎉" };
    if (lang === "pt") return { titel: "🎂 Aniversariantes de hoje: " + names, text: "Não esqueçam de dar os parabéns 🎉" };
    if (lang === "zh") return { titel: "🎂 今天过生日的人：" + names, text: "别忘了送上祝福 🎉" };
    if (lang === "ja") return { titel: "🎂 今日が誕生日の人：" + names, text: "お祝いを忘れずに 🎉" };
    if (lang === "ko") return { titel: "🎂 오늘 생일인 사람: " + names, text: "축하 인사 잊지 마세요 🎉" };
    if (lang === "ru") return { titel: "🎂 Сегодня день рождения: " + names, text: "Не забудьте поздравить 🎉" };
    if (lang === "nl") return { titel: "🎂 Vandaag jarig: " + names, text: "Vergeet niet te feliciteren 🎉" };
    return { titel: "🎂 Birthdays today: " + names, text: "Don't forget to say happy birthday 🎉" };
}

// ---------------------------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------------------------
function allUsers() {
    try { return $app.findRecordsByFilter("benutzer", "familie != ''", "", 0, 0); } catch (e) { return []; }
}
function sendTime(push, u) {
    let st = null;
    try { st = push.readSettings(u); } catch (e) { st = null; }
    const t = toMin(st && st.uhrzeit);
    return t == null ? toMin(DEFAULT_TIME) : t;
}

function runCron() {
    const w = wallNow();
    if (w.hour >= SEND_UNTIL_HOUR) return { skipped: "Uhrzeit" };
    const nowMin = w.hour * 60 + w.min;
    if (nowMin < 4 * 60) return { skipped: "zu früh" };
    const status = readStatus(w.iso);
    const isNewDay = !status.geprueft;
    const users = allUsers().filter(u => {
        const r = u.getString("rolle");
        return r !== "hauptadmin" && r !== "gast";
    });
    const byFamily = {};
    users.forEach(u => {
        const f = u.getString("familie");
        if (!f) return;
        (byFamily[f] = byFamily[f] || []).push(u);
    });
    let push = null;
    let sent = 0;
    Object.keys(byFamily).forEach(familyId => {
        const liste = birthdaysToday(familyId, status, w);
        if (!liste.length) return;
        byFamily[familyId].forEach(u => {
            const me = u.getString("mitglied");
            const others = liste.filter(b => b.id !== me); // the birthday child themselves gets nothing
            if (!others.length) return;
            const key = u.id + "|" + others.map(b => b.id).sort().join(",");
            if (status.gesendet[key]) return;
            if (!push) push = require(`${__hooks}/pinn-push.js`);
            if (nowMin < sendTime(push, u)) return;
            // remember first: even on an error along the way, the message never comes twice
            status.gesendet[key] = Date.now();
            status.dirty = true;
            const msg = message(langOf(u), others);
            try {
                sent += push.notifyUser(u.id, {
                    titel: msg.titel, text: msg.text,
                    url: "/?geburtstag=" + encodeURIComponent(others[0].id),
                    tag: "geburtstag-" + w.iso, urgency: "normal",
                }) || 0;
            } catch (e) {
                console.log("[Geburtstag] Push: " + e.message);
            }
        });
    });
    if (isNewDay) { status.geprueft = true; status.dirty = true; }
    if (status.dirty) { delete status.dirty; writeStatus(status); }
    if (sent) console.log("[Geburtstag] " + sent + " Push-Nachricht(en) zum Geburtstag verschickt.");
    return { gesendet: sent };
}

// ---------------------------------------------------------------------------------------------
// For the app: birthday animation only once per member and day (on all devices)
// ---------------------------------------------------------------------------------------------
function stateFor(user) {
    const w = wallNow();
    const s = readStatus(w.iso);
    const fam = user.getString("familie");
    const gesehen = Object.keys(s.gesehen).filter(k => k.indexOf(fam + "|") === 0).map(k => k.slice(fam.length + 1));
    return { heute: w.iso, gesehen: gesehen };
}
function markSeen(user, memberId) {
    const id = String(memberId || "").trim();
    if (!id || id.length > 100 || id.indexOf("|") >= 0) throw new Error("Ungültiges Mitglied.");
    const fam = user.getString("familie");
    if (!fam) throw new Error("Keine Familie.");
    const w = wallNow();
    const s = readStatus(w.iso);
    s.gesehen[fam + "|" + id] = Date.now();
    writeStatus(s);
    return stateFor(user);
}
