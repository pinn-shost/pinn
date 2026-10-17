// pb_hooks/pinn-packliste.js
// Not a *.pb.js -> NOT loaded automatically as a hook, only included via require() (packliste.pb.js).
//
// Offer a packing list in good time (1.62): appointments in the family calendar that sound like a trip
// ("Urlaub", "Dienstreise", "Kurztrip", "vacation", "business trip", "vacances", "voyage", "vacaciones",
// "viaje" …) and start within the next 14 days get ONE push per event – shown under the 🔔 bell as well.
// Tapping it opens a new packing list with name and period of the appointment already filled in
// (link /?packliste=1&titel=…&von=…&bis=…&ort=…).
// Nothing is sent if the family already has a packing list for that time.
//
// Gentle: each family is checked once a day (first run from 09:00, until 20:00). Markers in
// pb_data/pinn_packliste.json – sent events are kept 60 days, so nothing comes twice.
// Recipients: all profiles of the family except guests, the main admin and children with parental
// controls; appointments of a private calendar only reach their owner.

const STATUS_FILE = "/pb_data/pinn_packliste.json";
const LEAD_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = { runCron, travelKind };

// ---------------------------------------------------------------------------------------------
// Time (Europe/Berlin)
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
    return { hour: d.getUTCHours(), iso: d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) };
}
function utcOf(iso) { const p = iso.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function addDays(iso, n) { return new Date(utcOf(iso) + n * DAY_MS).toISOString().slice(0, 10); }
function diffDays(a, b) { return Math.round((utcOf(b) - utcOf(a)) / DAY_MS); }
function isIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }

// ---------------------------------------------------------------------------------------------
// Does the title sound like a trip? "" = no, otherwise "urlaub" | "geschaeftsreise"
// ---------------------------------------------------------------------------------------------
const TRAVEL_WORDS = ["kurztrip", "städtetrip", "staedtetrip", "wochenendtrip", "klassenfahrt", "kreuzfahrt", "roadtrip",
    "vacation", "vacations", "holiday", "holidays", "trip", "travel", "journey", "cruise",
    "vacances", "voyage", "séjour", "sejour", "congés", "conges", "croisière", "croisiere",
    "vacaciones", "viaje", "escapada", "crucero"];
const NOT_TRAVEL = ["preise", "preisen", "kreise", "kreisen", "greise", "reisebüro", "reisekosten", "reisekostenabrechnung"];
function travelKind(title) {
    const t = " " + String(title || "").toLowerCase() + " ";
    if (/(bank holiday|public holiday|feiertag|urlaubsantrag|urlaubsplanung)/.test(t)) return "";
    if (/(dienstreise|geschäftsreise|geschaeftsreise|business trip|viaje de negocios|déplacement|deplacement|voyage d'affaires)/.test(t)) return "geschaeftsreise";
    const words = t.match(/[a-zäöüßéèêàâçñáíóúû]+/g) || [];
    const hit = words.some(w => NOT_TRAVEL.indexOf(w) < 0 && (w.indexOf("urlaub") >= 0 || /reisen?$/.test(w) || TRAVEL_WORDS.indexOf(w) >= 0));
    if (hit || /ferien (in|auf|am|an|bei|im)\b/.test(t)) return "urlaub";
    return "";
}

// ---------------------------------------------------------------------------------------------
// Calendar of a family (shared file + own calendars) – only what is needed here
// ---------------------------------------------------------------------------------------------
function icsDate(value) {
    const m = String(value || "").trim().match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2}))?/);
    if (!m) return null;
    return { iso: m[1] + "-" + m[2] + "-" + m[3], allDay: !m[4] };
}
function unescapeIcs(s) { return String(s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }
function loadEvents(familyId) {
    const cs = require(`${__hooks}/calendar-sync.js`);
    let text = "";
    try { text = cs.readCalendarText(familyId) || ""; } catch (e) { text = ""; }
    try { text += "\n" + require(`${__hooks}/pinn-kalender.js`).icsAllForFamily(familyId); } catch (e) { /* no own calendars */ }
    const blocks = String(text).replace(/\r?\n[ \t]/g, "").match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    const out = [];
    blocks.forEach(b => {
        const ev = {};
        let alarm = false;
        b.split(/\r?\n/).forEach(line => {
            if (/^BEGIN:VALARM/.test(line)) { alarm = true; return; }
            if (/^END:VALARM/.test(line)) { alarm = false; return; }
            if (alarm) return;
            const c = line.indexOf(":");
            if (c < 1) return;
            const head = line.slice(0, c), value = line.slice(c + 1);
            const name = head.split(";")[0].toUpperCase();
            if (name === "SUMMARY") ev.title = unescapeIcs(value);
            else if (name === "LOCATION") ev.location = unescapeIcs(value);
            else if (name === "UID") ev.uid = value.trim();
            else if (name === "DTSTART") ev.start = icsDate(value);
            else if (name === "DTEND") ev.end = icsDate(value);
            else if (name === "STATUS") ev.status = value.trim().toUpperCase();
            else if (name === "RECURRENCE-ID") ev.recurrence = true;
            else if (name === "X-PINN-OWNER") ev.owner = value.trim();
        });
        if (!ev.title || !ev.start || ev.status === "CANCELLED") return;
        let to = ev.start.iso;
        if (ev.end && ev.end.iso > ev.start.iso) to = ev.end.allDay ? addDays(ev.end.iso, -1) : ev.end.iso;
        out.push({ uid: ev.uid || "", title: ev.title, location: ev.location || "", from: ev.start.iso, to: to < ev.start.iso ? ev.start.iso : to, owner: ev.owner || "" });
    });
    return out;
}

// ---------------------------------------------------------------------------------------------
// Texts (language of the profile)
// ---------------------------------------------------------------------------------------------
const T = {
    de: { titel: "🧳 Packliste für „{t}“?", heute: "Heute geht's los", morgen: "Morgen geht's los", tage: "In {n} Tagen geht's los", text: "{w} – antippen, dann ist sie mit Termin und Zeitraum angelegt." },
    en: { titel: "🧳 Packing list for “{t}”?", heute: "It starts today", morgen: "It starts tomorrow", tage: "It starts in {n} days", text: "{w} – tap to create it with the dates already filled in." },
    fr: { titel: "🧳 Liste de bagages pour « {t} » ?", heute: "C'est aujourd'hui", morgen: "C'est demain", tage: "C'est dans {n} jours", text: "{w} – touchez pour la créer avec les dates déjà remplies." },
    es: { titel: "🧳 ¿Lista de equipaje para «{t}»?", heute: "Empieza hoy", morgen: "Empieza mañana", tage: "Empieza en {n} días", text: "{w}: toca para crearla con las fechas ya puestas." },
};
function tx(lang, k, vars) {
    let s = (T[lang] || T.en)[k] || T.en[k];
    Object.keys(vars || {}).forEach(v => { s = s.split("{" + v + "}").join(String(vars[v])); });
    return s;
}
function langOf(u) {
    try { return require(`${__hooks}/pinn-pushtext.js`).langOfUser(u) || "de"; } catch (e) { return "de"; }
}

// ---------------------------------------------------------------------------------------------
// Markers in pb_data
// ---------------------------------------------------------------------------------------------
function readStatus() {
    let o = null;
    try { o = JSON.parse(require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(STATUS_FILE))); } catch (e) { o = null; }
    if (!o || typeof o !== "object") o = {};
    if (!o.familien || typeof o.familien !== "object") o.familien = {};
    if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
    return o;
}
function writeStatus(s) {
    const limit = Date.now() - 60 * DAY_MS;
    Object.keys(s.gesendet).forEach(k => { if (!(s.gesendet[k] > limit)) delete s.gesendet[k]; });
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Packliste] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}

// Is there already a packing list for this time? (start of the list within the trip or up to 3 days before)
function hasPackingList(data, ev, key) {
    return (Array.isArray(data.familyLists) ? data.familyLists : []).some(l => {
        if (!l || l.type !== "pack") return false;
        if (l.eventKey === key) return true;
        const from = l.trip && isIso(l.trip.from) ? l.trip.from : (isIso(l.date) ? l.date : "");
        return !!from && from >= addDays(ev.from, -3) && from <= ev.to;
    });
}

function runCron() {
    const w = wallNow();
    if (w.hour < 9 || w.hour >= 20) return { skipped: "Uhrzeit" };
    const status = readStatus();
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie != ''", "", 0, 0); } catch (e) { users = []; }
    const byFamily = {};
    users.forEach(u => {
        const r = u.getString("rolle");
        if (r === "hauptadmin" || r === "gast") return;
        (byFamily[u.getString("familie")] = byFamily[u.getString("familie")] || []).push(u);
    });
    let sent = 0, dirty = false;
    Object.keys(byFamily).forEach(familyId => {
        if (status.familien[familyId] === w.iso) return;
        status.familien[familyId] = w.iso;
        dirty = true;
        let events = [];
        try { events = loadEvents(familyId); } catch (e) { events = []; }
        const trips = events.filter(ev => {
            const n = diffDays(w.iso, ev.from);
            return n >= 0 && n <= LEAD_DAYS && !!travelKind(ev.title);
        });
        if (!trips.length) return;
        let data = {};
        try { data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {}; } catch (e) { data = {}; }
        const kids = (Array.isArray(data.members) ? data.members : []).filter(m => m && m.childLock).map(m => String(m.id));
        let push = null;
        trips.forEach(ev => {
            const key = (ev.uid || ev.title).slice(0, 120) + "|" + ev.from;
            if (status.gesendet[familyId + "|" + key] || hasPackingList(data, ev, key)) return;
            status.gesendet[familyId + "|" + key] = Date.now();
            const n = diffDays(w.iso, ev.from);
            const url = "/?packliste=1&titel=" + encodeURIComponent(ev.title.slice(0, 80)) + "&von=" + ev.from + "&bis=" + ev.to +
                (ev.location ? "&ort=" + encodeURIComponent(ev.location.slice(0, 80)) : "") + "&art=" + travelKind(ev.title) + "&schluessel=" + encodeURIComponent(key);
            if (!push) push = require(`${__hooks}/pinn-push.js`);
            byFamily[familyId].forEach(u => {
                if (ev.owner && ev.owner !== u.id) return;
                if (kids.indexOf(u.getString("mitglied")) >= 0) return;
                const lang = langOf(u);
                const when = n === 0 ? tx(lang, "heute") : n === 1 ? tx(lang, "morgen") : tx(lang, "tage", { n: n });
                try {
                    sent += push.notifyUser(u.id, {
                        titel: tx(lang, "titel", { t: ev.title.slice(0, 60) }), text: tx(lang, "text", { w: when }),
                        url: url.slice(0, 300), tag: "packliste-" + ev.from + "-" + (ev.uid || ev.title).slice(0, 40), urgency: "normal",
                    }) || 0;
                } catch (e) { console.log("[Packliste] Push: " + e.message); }
            });
        });
    });
    if (dirty) writeStatus(status);
    if (sent) console.log("[Packliste] " + sent + " Hinweis(e) verschickt.");
    return { gesendet: sent };
}
