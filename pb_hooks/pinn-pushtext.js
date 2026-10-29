// pb_hooks/pinn-pushtext.js
// Not a *.pb.js file -> PocketBase does NOT load it as a hook by itself, it is only included with require().
//
// Push texts of the server in the recipient's language and matching the household type (family or flat share).
//
// Every push of the server goes through pinn-push.js#notifyUserDetailed. There each message is rewritten once per
// recipient with localize(userId, msg) – before it goes into the queue for the phone and under the 🔔 bell.
// The modules (location, board, funds, contracts …) keep building their texts in German; this file recognises
// them by fixed patterns per kind of message (tag of the message, e.g. "sos-…", "termin-…").
//
// Since 1.117.0 the translations are no longer in this file: every pattern names a text key ("push.…") and the
// texts come from the same language files as the app (pb_public/i18n/<code>.i18n.js). Plural forms and
// placeholders are filled by pinn-textkern.js – the same table the app uses. A flat share uses the variant
// "<key>#wg" of the language file (created by .github/scripts/i18n-keys.js from the TERMS of js/sprachen.js).
//
//  - Language: from the profile (personal design, value "sprache": de, en, fr, es, it, pt, zh, ja, ko). Without one: German.
//  - Household type: from the family settings (field "wohnform": 'familie' or 'wg'). Only this one field is read
//    via SQL (json_extract), not the big family data; the result stays cached until the family data changes.
//  - Freely entered content (names, event titles, note texts, addresses) stays unchanged. Whatever matches no
//    pattern stays as it is (German, or already translated by the module itself) – an unknown message is never lost.
//    For a flat share such texts still get the flat share terms (applyTerms, same rules as TERMS in js/sprachen.js).

const LANGS = ["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko"];

// ---------------------------------------------------------------------------------------------
// Language and household type of the recipient
// ---------------------------------------------------------------------------------------------
function langOfUser(userRec) {
    try {
        const w = require(`${__hooks}/pinn-design.js`).readDesign(userRec).werte || {};
        const c = String(w.sprache || "").slice(0, 2).toLowerCase();
        return LANGS.indexOf(c) >= 0 ? c : (c ? "en" : "de");
    } catch (e) { return "de"; }
}

const WF_KEY = "pinnWohnform:";
function wohnformOf(familyId) {
    if (!familyId) return "familie";
    let stamp = "";
    try { stamp = require(`${__hooks}/pinn-benutzer.js`).familyDataStamp(familyId); } catch (e) { stamp = ""; }
    try {
        const raw = $app.store().get(WF_KEY + familyId);
        if (raw) {
            const c = JSON.parse(String(raw));
            if (c && c.s === stamp && stamp) return c.w === "wg" ? "wg" : "familie";
        }
    } catch (e) { /* read again */ }
    let w = "";
    try {
        // Since 1.108 in the area "einstellungen" (pinn-bereiche.js), before in familien_daten - fieldText reads both
        w = require(`${__hooks}/pinn-bereiche.js`).fieldText(familyId, "einstellungen", "wohnform");
    } catch (e) {
        // SQLite without JSON functions (should not exist): read the family data once
        try { w = String((require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {}).wohnform || ""); } catch (e2) { w = ""; }
    }
    w = w === "wg" ? "wg" : "familie";
    try { $app.store().set(WF_KEY + familyId, JSON.stringify({ s: stamp, w: w })); } catch (e) { /* never mind */ }
    return w;
}

// ---------------------------------------------------------------------------------------------
// Flat share terms for texts without a text key (same rules as the app: js/sprachen.js → TERMS)
// ---------------------------------------------------------------------------------------------
function cap(up, s) { return up ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
const FAM_EMOJI = /\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67(?:\u200D\uD83D\uDC66)?/g;
const WG_EMOJI = "\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1";
const TERMS = {
    de: { keep: /Familienstammbuch|Familienkutsche/g, rules: [
        [/\b([Jj])edes Familienmitglied\b/g, "$1eder Mitbewohner"],
        [/\b([Dd])as Familienmitglied\b/g, "$1er Mitbewohner"],
        [/\b([Ee])in weiteres Familienmitglied\b/g, "$1inen weiteren Mitbewohner"],
        [/\b(an|für|über|Bitte|bitte) ein Familienmitglied\b/g, "$1 einen Mitbewohner"],
        [/\b([Nn])eues Familienmitglied\b/g, "$1euer Mitbewohner"],
        [/Familienmitgliedern/g, "Mitbewohnern"],
        [/Familienmitglieds/g, "Mitbewohners"],
        [/Familienmitglieder/g, "Mitbewohner"],
        [/Familienmitglied/g, "Mitbewohner"],
        [/\b(den|allen|zwischen) Familien(?![-\wÄÖÜäöüß])/g, "$1 Haushalten"],
        [/\bFamilien(?![-\wÄÖÜäöüß])/g, "Haushalte"],
        [/\b[Ff]amilien-(?=[A-Za-zÄÖÜäöü])/g, "WG-"],
        [/\b([Ff])amilien([a-zäöüß])/g, (m, f, c) => "WG-" + (f === "F" ? c.toUpperCase() : c)],
        [/\b[Ff]amilie\b/g, "WG"],
    ] },
    en: { keep: /family register|[Ff]amily bus/g, rules: [
        [/\b([Ff])amily members\b/g, (m, f) => cap(f === "F", "flatmates")],
        [/\b([Ff])amily member\b/g, (m, f) => cap(f === "F", "flatmate")],
        [/\b([Ff])amilies\b/g, (m, f) => cap(f === "F", "households")],
        [/\b([Ff])amily\b/g, (m, f) => cap(f === "F", "flatshare")],
    ] },
    fr: { keep: /livret de famille|nom de famille|voiture familiale/g, rules: [
        [/\b([Mm])embres de (?:la|ta|votre|cette) famille\b/g, (m, f) => cap(f === "M", "colocataires")],
        [/\b([Mm])embre de (?:la|ta|votre|cette) famille\b/g, (m, f) => cap(f === "M", "colocataire")],
        [/\b([Tt])outes les familles\b/g, "$1ous les foyers"],
        [/\b([Ff])amilles\b/g, (m, f) => cap(f === "F", "foyers")],
        [/\bfamili(?:aux|ales|ale|al)\b/g, "de la colocation"],
        [/\b([Ff])amille\b/g, (m, f) => cap(f === "F", "colocation")],
    ] },
    es: { keep: /libro de familia|coche familiar/g, rules: [
        [/\b([Mm])iembros de (?:la|tu|esta) familia\b/g, (m, f) => cap(f === "M", "compañeros de piso")],
        [/\b([Mm])iembro de (?:la|tu|esta) familia\b/g, (m, f) => cap(f === "M", "compañero de piso")],
        [/\b([Tt])odas las familias\b/g, "$1odos los hogares"],
        [/\b([Ll])as familias\b/g, "$1os hogares"],
        [/\b([Ff])amilias\b/g, (m, f) => cap(f === "F", "hogares")],
        [/\bde la familia\b/g, "del piso compartido"],
        [/\ba la familia\b/g, "al piso compartido"],
        [/\b([Tt])oda la familia\b/g, "$1odo el piso compartido"],
        [/\b([Ll])a familia\b/g, (m, f) => cap(f === "L", "el piso compartido")],
        [/\b([Uu])na familia\b/g, (m, f) => cap(f === "U", "un piso compartido")],
        [/\b([Ee])sta familia\b/g, (m, f) => cap(f === "E", "este piso compartido")],
        [/\b([Oo])tra familia\b/g, (m, f) => cap(f === "O", "otro piso compartido")],
        [/\b([Nn])inguna familia\b/g, (m, f) => cap(f === "N", "ningún piso compartido")],
        [/\bfamiliares\b/g, "del piso"],
        [/\bfamiliar\b/g, "del piso"],
        [/\b([Ff])amilia\b/g, (m, f) => cap(f === "F", "piso compartido")],
    ] },
    it: { keep: /libro di famiglia|auto di famiglia/g, rules: [
        [/\b([Mm])embri della famiglia\b/g, (m, f) => cap(f === "M", "coinquilini")],
        [/\b([Mm])embro della famiglia\b/g, (m, f) => cap(f === "M", "coinquilino")],
        [/\b([Tt])utta la famiglia\b/g, "$1utta la casa"],
        [/\b([Tt])utte le famiglie\b/g, "$1utte le case"],
        [/\b([Ll])e famiglie\b/g, "$1e case"],
        [/\b([Ff])amiglie\b/g, (m, f) => cap(f === "F", "case")],
        [/\bfamiliari\b/g, "coinquilini"],
        [/\bfamiliare\b/g, "della casa"],
        [/\b([Ff])amiglia\b/g, (m, f) => cap(f === "F", "casa condivisa")],
    ] },
    pt: { keep: /livro de família|carro de família|carro da família/g, rules: [
        [/\b([Mm])embros da família\b/g, (m, f) => cap(f === "M", "colegas de casa")],
        [/\b([Mm])embro da família\b/g, (m, f) => cap(f === "M", "colega de casa")],
        [/\b([Tt])oda a família\b/g, "$1oda a casa"],
        [/\b([Tt])odas as famílias\b/g, "$1odas as casas"],
        [/\b([Ff])amília toda\b/g, (m, f) => cap(f === "F", "casa toda")],
        [/\b([Ff])amílias\b/g, (m, f) => cap(f === "F", "casas")],
        [/\bfamiliares\b/g, "da casa"],
        [/\bfamiliar\b/g, "da casa"],
        [/\b([Ff])amília\b/g, (m, f) => cap(f === "F", "casa compartilhada")],
    ] },
    zh: { keep: /家庭医生/g, rules: [
        [/家庭成员/g, "室友"],
        [/全家/g, "整个合租"],
        [/家庭/g, "合租"],
    ] },
    ja: { keep: /家族登録簿/g, rules: [
        [/家族メンバー/g, "ルームメイト"],
        [/家族全員/g, "ルームシェア全員"],
        [/家族/g, "ルームシェア"],
    ] },
    ko: { keep: /가족관계 등록부|가족용 밴/g, rules: [
        [/가족 구성원이/g, "룸메이트가"],
        [/가족 구성원은/g, "룸메이트는"],
        [/가족 구성원을/g, "룸메이트를"],
        [/가족 구성원과/g, "룸메이트와"],
        [/가족 구성원으로/g, "룸메이트로"],
        [/가족 구성원/g, "룸메이트"],
        [/온 가족/g, "셰어하우스 전체"],
        [/가족 전체/g, "셰어하우스 전체"],
        [/가족이/g, "셰어하우스가"],
        [/가족은/g, "셰어하우스는"],
        [/가족을/g, "셰어하우스를"],
        [/가족과/g, "셰어하우스와"],
        [/가족으로/g, "셰어하우스로"],
        [/가족/g, "셰어하우스"],
    ] },
};
const TERM_HINT = /[Ff]amil|[Ff]am\u00EDli|[Ff]amigli|\u5BB6\u5EAD|\u5168\u5BB6|\u5BB6\u65CF|\uAC00\uC871|\uD83D\uDC68\u200D\uD83D\uDC69/;
function applyTerms(s, lang) {
    const T = TERMS[lang] || TERMS.de;
    if (!s || !TERM_HINT.test(s)) return s;
    const kept = [];
    s = s.replace(T.keep, m => { kept.push(m); return "\u0001" + (kept.length - 1) + "\u0002"; });
    for (let i = 0; i < T.rules.length; i++) s = s.replace(T.rules[i][0], T.rules[i][1]);
    s = s.replace(FAM_EMOJI, WG_EMOJI);
    if (kept.length) s = s.replace(/\u0001(\d+)\u0002/g, (m, i) => kept[+i]);
    return s;
}

// ---------------------------------------------------------------------------------------------
// Language files (pb_public/i18n/<code>.i18n.js) – only the keys "push.…" are kept
// ---------------------------------------------------------------------------------------------
const KERN = require(`${__hooks}/pinn-textkern.js`);
const PREFIX = "push.";
// Inside the container pb_public is /pb_public; next to the hooks for tests and other set-ups
const I18N_DIRS = ["/pb_public/i18n", `${__hooks}/../pb_public/i18n`];
const STORE_KEY = "pinnPushTexts:";
let LOADED = {};   // per JavaScript engine of PocketBase; the shared app store keeps it for the others

function bytesText(raw) {
    try {
        if (typeof toString === "function") {
            const t = toString(raw);
            if (typeof t === "string" && t.indexOf("[object") !== 0) return t;
        }
    } catch (e) { /* fall back */ }
    return String(raw || "");
}
function readLangFile(code) {
    for (let i = 0; i < I18N_DIRS.length; i++) {
        try { return bytesText($os.readFile(I18N_DIRS[i] + "/" + code + ".i18n.js")); } catch (e) { /* next place */ }
    }
    return "";
}
// The language file is a script: window.PINN_I18N.keys("<code>", { … }). It is run with a stand-in window.
function parseLangFile(src) {
    let data = null;
    if (!src) return null;
    const win = { PINN_I18N: { keys: (c, d) => { data = d; } } };
    try { (new Function("window", src))(win); } catch (e) { console.log("[Push] Language file not readable: " + e.message); return null; }
    if (!data || typeof data !== "object") return null;
    const out = {};
    for (const k in data) if (Object.prototype.hasOwnProperty.call(data, k) && k.indexOf(PREFIX) === 0) out[k] = data[k];
    return out;
}
function texts(code) {
    if (LOADED[code]) return LOADED[code];
    let t = null;
    try { const raw = $app.store().get(STORE_KEY + code); if (raw) t = JSON.parse(String(raw)); } catch (e) { t = null; }
    if (!t) {
        t = parseLangFile(readLangFile(code));
        if (t && Object.keys(t).length) { try { $app.store().set(STORE_KEY + code, JSON.stringify(t)); } catch (e) { /* never mind */ } }
        else t = {};
    }
    LOADED[code] = t;
    return t;
}
// Forget the cached texts (after an update of the language files without a restart, and for tests)
function resetTexts() {
    LOADED = {};
    for (let i = 0; i < LANGS.length; i++) { try { $app.store().remove(STORE_KEY + LANGS[i]); } catch (e) { /* never mind */ } }
}

// Text of a key in a language; null if neither the language nor English has it.
// wg = flat share: the variant "<key>#wg" wins.
function tk(code, key, vals, wg) {
    const order = code === "en" ? ["en"] : [code, "en"];
    for (let i = 0; i < order.length; i++) {
        const t = texts(order[i]);
        const e = wg && t[key + "#wg"] !== undefined ? t[key + "#wg"] : t[key];
        if (e !== undefined) return KERN.text(e, order[i], vals || {});
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Patterns of the German texts
// A rule is [pattern, key, values] – values name the placeholders of the text:
//   "<n>" = part n unchanged (names, titles …) · "{n}" = part n, translated as well (if a pattern fits)
//   "[n]" = part n as a list of names („A, B und C“) · a number = fixed value (e.g. n: 1)
// Instead of key and values a function (g, h) may build the text: h.k(key, values), h.t(part), h.names(part).
// The first group whose tag fits is used; then the patterns that apply everywhere (SHARED).
// ---------------------------------------------------------------------------------------------
const WEEKDAYS = { So: "push.wd.sun", Mo: "push.wd.mon", Di: "push.wd.tue", Mi: "push.wd.wed", Do: "push.wd.thu", Fr: "push.wd.fri", Sa: "push.wd.sat" };

// Words and phrases that also appear as part of other texts (valid everywhere)
const EXACT = {
    "Morgen": "push.word.tomorrowCap",
    "heute": "push.word.today",
    "morgen": "push.word.tomorrow",
    "Zuhause": "push.word.home",
    "Ohne Titel": "push.word.untitled",
    "Standort noch unbekannt": "push.word.locationUnknown",
    "Standort bekannt": "push.word.locationKnown",
    "heute Morgen": "push.word.thisMorning",
    "heute Mittag": "push.word.thisLunchtime",
    "heute Nachmittag": "push.word.thisAfternoon",
    "heute Abend": "push.word.thisEvening",
    "Jemand": "push.word.someone",
    "Der Hilferuf": "push.word.callForHelp",
    "Dein Einkauf": "push.word.yourShopping",
    "Ein Ausgleich": "push.word.aSettlement",
    "Neue Umfrage": "push.word.newPoll",
    "Countdown": "push.word.countdown",
};

// Patterns valid everywhere (date, time, duration …)
const SHARED = [
    [/^(So|Mo|Di|Mi|Do|Fr|Sa), (\d\d)\.(\d\d)\.(?: (\d\d:\d\d))?$/, (g, h) => {
        const v = { wd: h.k(WEEKDAYS[g[1]]), d: Number(g[2]), m: Number(g[3]), time: g[4] || "" };
        return h.k(g[4] ? "push.date.weekdayTime" : "push.date.weekday", v);
    }],
    [/^(\d\d)\.(\d\d)\.(\d{4})$/, "push.date.full", { d: "<1>", m: "<2>", y: "<3>" }],
    [/^(\d\d:\d\d) Uhr$/, "push.time", { time: "<1>" }],
    [/^In (\d+) Minuten$/, "push.inMinutes", { n: "<1>" }],
    [/^In ([\d.]+) Stunden?$/, "push.inHours", { n: "<1>" }],
    [/^Morgen, ([^·]+)$/, "push.tomorrowComma", { when: "{1}" }],
    [/^in (\d+) Tagen$/, "push.inDays", { n: "<1>" }],
    [/^(\d+) Std\. (\d+) Min\.$/, "push.durHM", { h: "<1>", m: "<2>" }],
    [/^(\d+) Min\.$/, "push.durMin", { n: "<1>" }],
];

// Patterns per kind of message (tag)
const GROUPS = [
    // --- Test message (Settings → Notifications) ---
    { tag: /^test$/, rules: [
        [/^Hallo (.+)! 👋$/, "push.test.hello", { name: "<1>" }],
        [/^Benachrichtigungen von pinn\. kommen auf diesem Gerät an\.$/, "push.test.arrives", {}],
    ] },
    // --- Event reminder ---
    { tag: /^termin-/, rules: [
        [/^(.+) um (\d\d:\d\d)$/, "push.event.at", { title: "<1>", time: "<2>" }],
        [/^mit ([^·]+)$/, "push.event.with", { names: "[1]" }],
    ] },
    // --- Daily summary ---
    { tag: /^tagesuebersicht-/, rules: [
        [/^Guten Morgen, (.+)!$/, "push.daily.morning", { name: "<1>" }],
        [/^Hallo, (.+)!$/, "push.daily.hello", { name: "<1>" }],
        [/^Guten Abend, (.+)!$/, "push.daily.evening", { name: "<1>" }],
        [/^Heute steht für dich nichts im Kalender\.$/, "push.daily.nothing", {}],
        [/^([^·]*) \((\d+)x nicht erledigt\)$/, "push.daily.notDone", { task: "<1>", n: "<2>" }],
        [/^Mittag: ([^·]+)$/, "push.daily.lunch", { meal: "{1}" }],
        [/^Abend: ([^·]+)$/, "push.daily.dinner", { meal: "{1}" }],
    ] },
    // --- New assignment (event/task) ---
    { tag: /^zuweisung-/, rules: [
        [/^Neue Aufgabe für dich$/, "push.assign.task", {}],
        [/^Neuer Termin für dich$/, "push.assign.event", {}],
        [/^fällig ([^·]+)$/, "push.assign.due", { when: "{1}" }],
        [/^von ([^·]+)$/, "push.assign.from", { name: "<1>" }],
    ] },
    // --- Children: task done / everything done ---
    { tag: /^kind-/, rules: [
        [/^(.+) hat eine Aufgabe erledigt ✅$/, "push.kid.taskDone", { name: "<1>" }],
        [/^(.+) hat alles geschafft! 🏆$/, "push.kid.allDone", { name: "<1>" }],
        [/^Alle Aufgaben bis jetzt sind erledigt\.$/, "push.kid.allSoFar", {}],
        [/^Alle Aufgaben bis jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, "push.kid.allSoFarLast", { task: "<1>" }],
        [/^Alle Aufgaben für jetzt sind erledigt – zuletzt „([\s\S]*)“\.$/, "push.kid.allNowLast", { task: "<1>" }],
        [/^Alle Aufgaben für (heute Morgen|heute Mittag|heute Nachmittag|heute Abend) sind erledigt – zuletzt „([\s\S]*)“\.$/, "push.kid.allPeriodLast", { period: "{1}", task: "<2>" }],
    ] },
    // --- Someone has done all tasks ---
    { tag: /^alle-erledigt-/, rules: [
        [/^(.+) hat alle Aufgaben erledigt 🎉$/, "push.allDone.title", { name: "<1>" }],
        [/^Alle Aufgaben bis jetzt sind abgehakt – zuletzt „([\s\S]*)“\.$/, "push.allDone.lastChecked", { task: "<1>" }],
    ] },
    // --- SOS ---
    { tag: /^sos-/, rules: [
        [/^SOS: (.+) braucht Hilfe!$/, "push.sos.title", { name: "{1}" }],
        [/^Erneuter Hilferuf: (.+) braucht Hilfe!$/, "push.sos.again", { name: "{1}" }],
        [/^TEST: (.+) braucht Hilfe!$/, "push.sos.test", { name: "{1}" }],
        [/^(.+) \(Test\)$/, "push.sos.testSuffix", { name: "<1>" }],
        [/^Dein Hilferuf wurde gesendet$/, "push.sos.sent", {}],
        [/^Entwarnung: (.+)$/, "push.sos.allClear", { name: "{1}" }],
        [/^([\s\S]+)\. Tippe für Karte, Anruf und Notruf ([^.]+)\.$/, "push.sos.tapFor", { where: "{1}", number: "<2>" }],
        [/^([\s\S]+)\. Nur ein Test – nur du bekommst diese Meldung\.$/, "push.sos.testOnly", { where: "{1}" }],
        [/^Deine Familie wurde alarmiert \((\d+) Geräte?\) und sieht deinen Standort\.$/, "push.sos.familyAlerted", { n: "<1>" }],
        [/^Kein Gerät deiner Familie ist für Push angemeldet – bitte zusätzlich anrufen \(([^)]+)\)\.$/, "push.sos.noDevices", { number: "<1>" }],
        [/^(.+) hat den Hilferuf von (\d\d:\d\d) Uhr beendet\.$/, "push.sos.ended", { name: "<1>", time: "<2>" }],
        [/^([\s\S]+) · (\d\d:\d\d) Uhr( \(± \d+ m\))?$/, "push.sos.whereTime", { where: "{1}", time: "<2>", accuracy: "<3>" }],
        [/^Standort (-?\d+\.\d+), (-?\d+\.\d+)$/, "push.sos.coords", { lat: "<1>", lon: "<2>" }],
    ] },
    // --- Location: location sharing changed ---
    { tag: /^ortung-teilen-/, rules: [
        [/^Standort geteilt$/, "push.share.on", {}],
        [/^Standort nicht mehr geteilt$/, "push.share.off", {}],
        [/^(.+) hat deine Standortfreigabe in pinn\. eingeschaltet\.$/, "push.share.turnedOn", { name: "<1>" }],
        [/^(.+) hat deine Standortfreigabe in pinn\. ausgeschaltet\.$/, "push.share.turnedOff", { name: "<1>" }],
    ] },
    // --- Location: "I'm on my way home" ---
    { tag: /^ortung-unterwegs-/, rules: [
        [/^(.+) ist unterwegs nach Hause$/, "push.wayHome.onWay", { name: "<1>" }],
        [/^(.+) ist zu Hause angekommen$/, "push.wayHome.arrived", { name: "<1>" }],
        [/^Antippen für Live-Standort, Karte und Anruf\. Meldung kommt beim Ankommen\.$/, "push.wayHome.tap", {}],
        [/^Heimweg beendet \((.+)\)\.$/, "push.wayHome.ended", { info: "{1}" }],
    ] },
    // --- Location: arriving at / leaving a place ---
    { tag: /^ortung-/, rules: [
        [/^(.+) \((\d\d:\d\d) Uhr\)$/, "push.place.titleTime", { title: "{1}", time: "<2>" }],
        [/^(.+) ist zu Hause angekommen\.$/, "push.place.arrivedHome", { name: "<1>" }],
        [/^(.+) ist bei „(.+)“ angekommen\.$/, "push.place.arrivedAt", { name: "<1>", place: "<2>" }],
        [/^(.+) hat das Zuhause verlassen\.$/, "push.place.leftHome", { name: "<1>" }],
        [/^(.+) hat „(.+)“ verlassen\.$/, "push.place.left", { name: "<1>", place: "<2>" }],
    ] },
    // --- Location: shopping checked off automatically at the shop ---
    { tag: /^einkauf-/, rules: [
        [/^Einkauf abgehakt$/, "push.shop.checked", {}],
        [/^(.+) ist erledigt \((\d+) Min\. bei (.+)\)\. Tippe hier, um den Betrag einzutragen\.$/, "push.shop.doneTap", { task: "{1}", min: "<2>", shop: "<3>" }],
    ] },
    // --- Location: arrived at a shop ---
    { tag: /^laden-/, rules: [
        [/^Du bist bei (.+)$/, "push.store.youreAt", { shop: "<1>" }],
        [/^Geplant: (.+)\. Tippe hier für die Einkaufsliste\.$/, "push.store.planned", { items: "<1>" }],
        [/^Tippe hier für die Einkaufsliste\.$/, "push.store.tapList", {}],
    ] },
    // --- Board: reaction / votes / reply / reminder / new note ---
    { tag: /^pinnwand-reaktion-/, rules: [
        [/^Reaktion auf deinen Zettel$/, "push.board.reaction", {}],
        [/^([\s\S]+) – „([\s\S]*)“$/, "push.board.reactionLine", { names: "[1]", text: "<2>" }],
    ] },
    { tag: /^pinnwand-stimme-/, rules: [
        [/^Neue Stimmen$/, "push.board.votes", {}],
        [/^(.+) hat abgestimmt – „([\s\S]*)“$/, "push.board.voted", { name: "<1>", text: "<2>" }],
        [/^(.+) haben abgestimmt – „([\s\S]*)“$/, "push.board.votedMany", { names: "[1]", text: "<2>" }],
    ] },
    { tag: /^pinnwand-antwort-/, rules: [
        [/^(.+) hat geantwortet$/, "push.board.replied", { name: "<1>" }],
    ] },
    { tag: /^pinnwand-erinnerung-/, rules: [
        [/^Erinnerung von der Pinnwand$/, "push.board.reminder", {}],
    ] },
    { tag: /^pinnwand-/, rules: [
        [/^(.+) \(für ([^()]+)\)$/, "push.board.forNames", { title: "{1}", names: "[2]" }],
        [/^(.+) sagt Danke$/, "push.board.thanks", { name: "<1>" }],
        [/^(.+): neue Liste$/, "push.board.newList", { name: "<1>" }],
        [/^(.+) hat ein Foto angepinnt$/, "push.board.photo", { name: "<1>" }],
        [/^Umfrage von (.+)$/, "push.board.poll", { name: "<1>" }],
        [/^(.+) hat etwas angepinnt$/, "push.board.pinned", { name: "<1>" }],
        [/^Einfach so\. 💛$/, "push.board.justBecause", {}],
        [/^([^:]+): Einfach so\. 💛$/, "push.board.justBecauseTo", { names: "[1]" }],
        [/^Tippe zum Ansehen\.$/, "push.board.tapView", {}],
        [/^([\s\S]+) – jetzt abstimmen$/, "push.board.voteNow", { question: "{1}" }],
        [/^Heute!( – [\s\S]*)?$/, "push.board.today", { rest: "<1>" }],
        [/^Morgen!( – [\s\S]*)?$/, "push.board.tomorrow", { rest: "<1>" }],
        [/^Noch (\d+) Tage( – [\s\S]*)?$/, "push.board.daysLeft", { n: "<1>", rest: "<2>" }],
        [/^Neuer Countdown von (.+)$/, "push.board.countdownFrom", { name: "<1>" }],
    ] },
    // --- Documents: expiry, manufacturer's warranty, statutory warranty ---
    { tag: /^dokument-/, rules: [
        [/^Läuft ab: (.+)$/, "push.doc.expires", { title: "<1>" }],
        [/^Garantie endet: (.+)$/, "push.doc.warrantyEnds", { title: "<1>" }],
        [/^Gewährleistung endet: (.+)$/, "push.doc.statWarrantyEnds", { title: "<1>" }],
        [/^Gültig bis (\S+) \((.+?)\) – rechtzeitig verlängern oder erneuern\.$/, "push.doc.validUntil", { date: "{1}", when: "{2}" }],
        [/^Die Herstellergarantie endet am (\S+) \((.+?)\)\. Mängel am besten vorher melden\.$/, "push.doc.mfrWarranty", { date: "{1}", when: "{2}" }],
        [/^Die gesetzliche Gewährleistung endet am (\S+) \((.+?)\)\. Mängel vorher beim Händler reklamieren\.$/, "push.doc.statWarranty", { date: "{1}", when: "{2}" }],
    ] },
    // --- Contracts: notice period, end of contract, own reminder ---
    { tag: /^vertrag-/, rules: [
        [/^Letzte Chance: (.+) kündigen$/, "push.contract.lastChance", { name: "<1>" }],
        [/^Kündigungsfrist: (.+)$/, "push.contract.notice", { name: "<1>" }],
        [/^Vertrag endet: (.+)$/, "push.contract.ends", { name: "<1>" }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um einen Monat\.$/, "push.contract.cancelBy", { date: "{1}", when: "{2}", end: "{3}", n: 1 }],
        [/^Kündigung bis (\S+) \((.+?)\) zum (\S+) – sonst verlängert er sich um (\d+) Monate\.$/, "push.contract.cancelBy", { date: "{1}", when: "{2}", end: "{3}", n: "<4>" }],
        [/^Der Vertrag endet am (\S+) \((.+?)\)\.$/, "push.contract.endsOn", { date: "{1}", when: "{2}" }],
        [/^Erinnerung zu diesem Vertrag$/, "push.contract.reminder", {}],
    ] },
    // --- Pantry: best-before date (pinn-vorrat.js) ---
    { tag: /^vorrat-/, rules: [
        [/^Läuft heute ab: (.+)$/, "push.pantry.today", { item: "<1>" }],
        [/^Läuft morgen ab: (.+)$/, "push.pantry.tomorrow", { item: "<1>" }],
        [/^Läuft bald ab: (.+)$/, "push.pantry.soon", { item: "<1>" }],
        [/^Abgelaufen: (.+)$/, "push.pantry.expired", { item: "<1>" }],
        [/^(\d+) Vorrats-Artikel laufen bald ab$/, "push.pantry.many", { n: "<1>" }],
        [/^([^·]+) \(heute\)$/, "push.pantry.itemToday", { item: "<1>" }],
        [/^([^·]+) \(morgen\)$/, "push.pantry.itemTomorrow", { item: "<1>" }],
        [/^([^·]+) \(in (\d+) Tagen\)$/, "push.pantry.itemInDays", { item: "<1>", n: "<2>" }],
        [/^([^·]+) \(seit gestern abgelaufen\)$/, "push.pantry.itemYesterday", { item: "<1>" }],
        [/^([^·]+) \(seit (\d+) Tagen abgelaufen\)$/, "push.pantry.itemDaysAgo", { item: "<1>", n: "<2>" }],
        [/^Tippe hier für Rezeptideen mit dem, was da ist\.$/, "push.pantry.tapIdeas", {}],
    ] },
    // --- Extra reminder for tasks (pinn-push.js) – the task title stays unchanged ---
    { tag: /^aufgabe-erinnerung-/, rules: [
        [/^Heute fällig – du bist dran\.$/, "push.task.dueYourTurn", {}],
        [/^Heute fällig\.$/, "push.task.due", {}],
    ] },
    // --- Bin collection the day before (pinn-push.js) – the waste types stay as in the calendar ---
    { tag: /^muell-/, rules: [
        [/^Morgen ist Müllabfuhr$/, "push.waste.tomorrow", {}],
        [/^Du bist dran: (.+)$/, "push.waste.yourTurn", { bins: "<1>" }],
        [/^Dran: (.+)$/, "push.waste.turn", { names: "<1>" }],
    ] },
    // --- Security: profile locked after too many wrong passwords (pinn-sitzungen.js) ---
    { tag: /^sicherheit-/, rules: [
        [/^🔒 Anmeldung gesperrt$/, "push.security.locked", {}],
        [/^Zu viele falsche Passwörter für „(.+)“\. Das Profil ist vorübergehend gesperrt – die Sperre lässt sich unter Konto → Profile verwalten aufheben\.$/, "push.security.tooMany", { name: "<1>" }],
    ] },
    // --- Funds: settlement recorded / added to a fund ---
    { tag: /^ausgleich-/, rules: [
        [/^Ausgleich: (.+)$/, "push.settle.title", { text: "<1>" }],
        [/^([\s\S]+) wurde für dich eingetragen\.$/, "push.settle.recorded", { what: "{1}" }],
    ] },
    { tag: /^kasse-/, rules: [
        [/^(.+) hat dich zur Kasse „(.+)“ hinzugefügt\.$/, "push.fund.added", { name: "{1}", fund: "<2>" }],
        [/^(.+) hat dich zur Kasse „(.+)“ hinzugefügt\. Ausgaben werden geteilt\.$/, "push.fund.addedShared", { name: "{1}", fund: "<2>" }],
    ] },
];

// ---------------------------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------------------------
const LETTER = /[A-Za-zÄÖÜäöüßÀ-ÿ0-9]/;
// Edges without letters (emojis, ❗, spaces) that are cut off for the second attempt
const EDGE = /^([^A-Za-zÄÖÜäöüßÀ-ÿ0-9„"(¡¿]*)([\s\S]*?)([^A-Za-zÄÖÜäöüßÀ-ÿ0-9“"').!?…]*)$/;

function groupFor(tag) {
    const t = String(tag || "");
    for (let i = 0; i < GROUPS.length; i++) if (GROUPS[i].tag.test(t)) return GROUPS[i];
    return null;
}

function makeTranslator(lang, group, wg) {
    const rules = (group ? group.rules : []).concat(SHARED);
    const k = (key, vals) => {
        const r = tk(lang, key, vals, wg);
        return r === null ? null : r;
    };
    // „A, B und C“ → the list of names of the language
    const names = s => {
        const i = s.lastIndexOf(" und ");
        if (i < 0) return s;
        const r = k("push.namesAnd", { a: s.slice(0, i), b: s.slice(i + 5) });
        return r === null ? s : r;
    };
    function fill(rule, g, depth) {
        const h = { k: (key, vals) => k(key, vals), t: v => valueOf(v, depth), names: names };
        if (typeof rule[1] === "function") return rule[1](g, h);
        const spec = rule[2] || {};
        const vals = {};
        for (const name in spec) {
            const s = spec[name];
            if (typeof s === "number") { vals[name] = s; continue; }
            const m = /^([<{[])(\d)[>}\]]$/.exec(String(s));
            if (!m) { vals[name] = s; continue; }
            const part = g[+m[2]] || "";
            vals[name] = m[1] === "{" ? h.t(part) : m[1] === "[" ? names(part) : part;
        }
        return k(rule[1], vals);
    }
    function core(s, depth) {
        if (!s || !LETTER.test(s)) return null;
        if (Object.prototype.hasOwnProperty.call(EXACT, s)) return k(EXACT[s], {});
        for (let i = 0; i < rules.length; i++) {
            const m = rules[i][0].exec(s);
            if (m) return fill(rules[i], m, depth + 1);
        }
        return null;
    }
    // Whole text, otherwise without emojis/signs at the edges
    function loose(s, depth) {
        if (depth > 6) return null;
        const r = core(s, depth);
        if (r !== null) return r;
        const m = EDGE.exec(s);
        if (m && (m[1] || m[3]) && m[2]) {
            const c = core(m[2], depth);
            if (c !== null) return m[1] + c + m[3];
        }
        return null;
    }
    // Part of another text: translated if a pattern fits, otherwise unchanged
    function valueOf(v, depth) {
        const r = loose(String(v || ""), depth);
        return r === null ? String(v || "") : r;
    }
    // Whole message text: as a whole, otherwise line by line and part by part („ · “).
    // Pieces without a pattern keep their text (flat share: with the flat share terms).
    function text(s, depth) {
        const r = loose(s, depth);
        if (r !== null) return r;
        if (s.indexOf("\n") >= 0) return s.split("\n").map(x => text(x, depth + 1)).join("\n");
        if (s.indexOf(" · ") >= 0) return s.split(" · ").map(x => text(x, depth + 1)).join(" · ");
        return wg ? applyTerms(s, lang) : s;
    }
    return s => text(String(s || ""), 0);
}

function translateFor(lang, wohnform, msg) {
    const out = Object.assign({}, msg);
    const wg = wohnform === "wg";
    const tr = makeTranslator(LANGS.indexOf(lang) >= 0 ? lang : "en", groupFor(msg.tag), wg);
    if (msg.titel) out.titel = tr(msg.titel);
    if (msg.text) out.text = tr(msg.text);
    return out;
}

// Rewrite a message for a profile. Errors never change anything: then the German text stays.
function localize(userId, msg) {
    if (!msg || !userId) return msg;
    try {
        const user = $app.findRecordById("benutzer", String(userId));
        const lang = langOfUser(user);
        const wohnform = wohnformOf(user.getString("familie"));
        if (lang === "de" && wohnform !== "wg") return msg;
        return translateFor(lang, wohnform, msg);
    } catch (e) {
        console.log("[Push] Text not translated: " + e.message);
        return msg;
    }
}

// Stand-in text for the device with this push address (language of its profile), used when a device is
// woken up but the message can no longer be fetched
function fallbackForEndpoint(endpoint) {
    try {
        const abo = $app.findFirstRecordByFilter("push_abos", "endpoint = {:e}", { e: String(endpoint || "") });
        const user = $app.findRecordById("benutzer", abo.getString("benutzer"));
        const lang = langOfUser(user);
        const text = tk(lang, "push.fallback", {}, wohnformOf(user.getString("familie")) === "wg");
        return { tag: "pinn-allgemein", url: "/", titel: "pinn.", text: text || "Es gibt Neuigkeiten in pinn." };
    } catch (e) { return null; }
}

module.exports = { localize, translateFor, fallbackForEndpoint, wohnformOf, langOfUser, applyTerms, tk, resetTexts, GROUPS, SHARED, EXACT };
