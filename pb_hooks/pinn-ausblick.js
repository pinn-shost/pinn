// pb_hooks/pinn-ausblick.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Ausblick: Wochenvorschau (jeden Sonntag ab 18 Uhr) und Monatsausblick Finanzen (am letzten Tag des
// Monats ab 18 Uhr). Was drinsteht, rechnet die App selbst aus den Daten, die sie ohnehin hat – der
// Server kümmert sich nur um
//   - die Push-Nachricht (einmal je Woche bzw. Monat und Profil, in der Sprache des Profils),
//   - den Merker „schon angesehen“ je Profil, damit das Banner auf allen Geräten nur einmal erscheint,
//   - die persönlichen Schalter „Wochenvorschau per Push“ / „Monatsausblick per Push“.
//
// Schonend für CPU und Speicher:
//   - Der Zeitplan läuft alle 10 Minuten, tut aber nur sonntags bzw. am Monatsletzten zwischen 18 und
//     22 Uhr etwas – und dann genau einmal (Merker in pb_data/pinn_ausblick.json).
//   - Keine eigene Sammlung, keine Familiendaten beim Versand (nur für den Monatsausblick einmal je
//     Familie, um Kinder mit Kindersicherung auszunehmen).
//
// Uhrzeit: wie die übrigen Erinnerungen in Europe/Berlin (Sommer-/Winterzeit wird selbst berechnet).

const STATUS_FILE = "/pb_data/pinn_ausblick.json";
const SEND_FROM_HOUR = 18;
const SEND_UNTIL_HOUR = 22; // nach 22 Uhr (z. B. Server war aus) keine Push mehr – das Banner kommt trotzdem

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
// Wanduhr: { y, m (1-12), d, wd (0 = Sonntag), hour, iso }
function wallNow() {
    const now = Date.now();
    const d = new Date(now + tzOffsetMs(now));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return { y: y, m: m, d: day, wd: d.getUTCDay(), hour: d.getUTCHours(), iso: y + "-" + pad2(m) + "-" + pad2(day) };
}
function isoAddDays(iso, n) {
    const p = iso.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
// Woche, um die es gerade geht: ab Sonntag 18 Uhr die kommende, sonst die laufende (Montag als ISO)
function weekKey(w) {
    if (w.wd === 0 && w.hour >= SEND_FROM_HOUR) return isoAddDays(w.iso, 1);
    return isoAddDays(w.iso, -((w.wd + 6) % 7));
}
// Monat, um den es gerade geht: am Monatsletzten ab 18 Uhr der nächste, sonst der laufende (JJJJ-MM)
function monthKey(w) {
    if (w.d === daysInMonth(w.y, w.m) && w.hour >= SEND_FROM_HOUR) {
        const ny = w.m === 12 ? w.y + 1 : w.y, nm = w.m === 12 ? 1 : w.m + 1;
        return ny + "-" + pad2(nm);
    }
    return w.y + "-" + pad2(w.m);
}

// ---------------------------------------------------------------------------------------------
// Merker in pb_data
// ---------------------------------------------------------------------------------------------
function readStatus() {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
        if (o && typeof o === "object") {
            if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
            if (!o.nutzer || typeof o.nutzer !== "object") o.nutzer = {};
            return o;
        }
    } catch (e) { /* noch keine Datei */ }
    return { gesendet: { woche: "", monat: "" }, nutzer: {} };
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Ausblick] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}
function userState(s, userId) {
    const u = s.nutzer[userId];
    const out = { woche: "", monat: "", pushWoche: true, pushMonat: true };
    if (u && typeof u === "object") {
        if (typeof u.woche === "string") out.woche = u.woche;
        if (typeof u.monat === "string") out.monat = u.monat;
        if (u.pushWoche === false) out.pushWoche = false;
        if (u.pushMonat === false) out.pushMonat = false;
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Wer bekommt was?
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
// Sprache des Profils (Einstellungen → Sprache & Region); ohne Angabe nach dem Land, sonst Englisch
function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es"].indexOf(s) >= 0) return s;
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
    return "en";
}

// ---------------------------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------------------------
const MONTHS = {
    de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
    es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
};
function rangeText(lang, mondayIso) {
    const a = mondayIso.split("-").map(Number);
    const b = isoAddDays(mondayIso, 6).split("-").map(Number);
    const M = MONTHS[lang] || MONTHS.en;
    if (lang === "en") return a[1] === b[1] ? (a[2] + "–" + b[2] + " " + M[b[1] - 1]) : (a[2] + " " + M[a[1] - 1] + " – " + b[2] + " " + M[b[1] - 1]);
    if (lang === "de") return a[1] === b[1] ? (a[2] + ".–" + b[2] + ". " + M[b[1] - 1]) : (a[2] + ". " + M[a[1] - 1] + " – " + b[2] + ". " + M[b[1] - 1]);
    if (lang === "es") return a[1] === b[1] ? ("del " + a[2] + " al " + b[2] + " de " + M[b[1] - 1]) : ("del " + a[2] + " de " + M[a[1] - 1] + " al " + b[2] + " de " + M[b[1] - 1]);
    return a[1] === b[1] ? ("du " + a[2] + " au " + b[2] + " " + M[b[1] - 1]) : ("du " + a[2] + " " + M[a[1] - 1] + " au " + b[2] + " " + M[b[1] - 1]);
}
function weekMessage(lang, mondayIso) {
    const r = rangeText(lang, mondayIso);
    if (lang === "de") return { titel: "🗓️ Eure Woche ist da", text: "Termine, Aufgaben, Essen und mehr für " + r + " – alles auf einen Blick." };
    if (lang === "fr") return { titel: "🗓️ Votre semaine est prête", text: "Rendez-vous, tâches, repas et plus " + r + " – tout en un coup d'œil." };
    if (lang === "es") return { titel: "🗓️ Vuestra semana está lista", text: "Citas, tareas, comidas y más " + r + ", todo de un vistazo." };
    return { titel: "🗓️ Your week is ready", text: "Events, tasks, meals and more for " + r + " – all at a glance." };
}
function monthMessage(lang, key) {
    const m = Number(key.slice(5, 7));
    const M = MONTHS[lang] || MONTHS.en;
    const next = M[m - 1], prev = M[(m + 10) % 12];
    if (lang === "de") return { titel: "💶 Finanz-Ausblick " + next, text: "Was im " + next + " ansteht – und wie der " + prev + " gelaufen ist." };
    if (lang === "fr") return { titel: "💶 Perspectives financières : " + next, text: "Ce qui vous attend en " + next + " – et le bilan de " + prev + "." };
    if (lang === "es") return { titel: "💶 Previsión financiera: " + next, text: "Lo que viene en " + next + " y cómo ha ido " + prev + "." };
    return { titel: "💶 Finance outlook: " + next.charAt(0).toUpperCase() + next.slice(1), text: "What's coming up in " + next + " – and how " + prev + " went." };
}

// ---------------------------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------------------------
function allUsers() {
    try { return $app.findRecordsByFilter("benutzer", "familie != ''", "", 0, 0); } catch (e) { return []; }
}
function sendWeek(key, status) {
    const push = require(`${__hooks}/pinn-push.js`);
    let n = 0;
    allUsers().forEach(u => {
        if (role(u) === "hauptadmin") return;
        const st = userState(status, u.id);
        if (!st.pushWoche || st.woche === key) return;
        const msg = weekMessage(langOf(u), key);
        try {
            n += push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: "/?ausblick=woche", tag: "ausblick-woche-" + key, urgency: "normal" }) || 0;
        } catch (e) { console.log("[Ausblick] Push Wochenvorschau: " + e.message); }
    });
    return n;
}
function sendMonth(key, status) {
    const push = require(`${__hooks}/pinn-push.js`);
    const membersByFamily = {};
    let n = 0;
    allUsers().forEach(u => {
        if (role(u) === "hauptadmin" || role(u) === "gast") return;
        const st = userState(status, u.id);
        if (!st.pushMonat || st.monat === key) return;
        if (isChildLocked(u, membersByFamily) || !hasFinances(u)) return;
        const msg = monthMessage(langOf(u), key);
        try {
            n += push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: "/?ausblick=monat", tag: "ausblick-monat-" + key, urgency: "normal" }) || 0;
        } catch (e) { console.log("[Ausblick] Push Monatsausblick: " + e.message); }
    });
    return n;
}

function runCron() {
    const w = wallNow();
    if (w.hour < SEND_FROM_HOUR || w.hour >= SEND_UNTIL_HOUR) return { skipped: "Uhrzeit" };
    const isSunday = w.wd === 0;
    const isMonthEnd = w.d === daysInMonth(w.y, w.m);
    if (!isSunday && !isMonthEnd) return { skipped: "kein Ausblick-Tag" };
    const status = readStatus();
    const out = {};
    if (isSunday) {
        const key = weekKey(w);
        if (status.gesendet.woche !== key) {
            // zuerst merken: auch bei einem Fehler unterwegs kommt die Nachricht nie doppelt
            status.gesendet.woche = key;
            writeStatus(status);
            out.woche = sendWeek(key, status);
            console.log("[Ausblick] Wochenvorschau " + key + ": " + out.woche + " Push-Nachricht(en).");
        }
    }
    if (isMonthEnd) {
        const key = monthKey(w);
        if (status.gesendet.monat !== key) {
            status.gesendet.monat = key;
            writeStatus(status);
            out.monat = sendMonth(key, status);
            console.log("[Ausblick] Monatsausblick " + key + ": " + out.monat + " Push-Nachricht(en).");
        }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Für die App
// ---------------------------------------------------------------------------------------------
function stateFor(user) {
    const w = wallNow();
    const st = userState(readStatus(), user.id);
    return {
        woche: weekKey(w),
        monat: monthKey(w),
        gesehen: { woche: st.woche, monat: st.monat },
        push: { woche: st.pushWoche, monat: st.pushMonat },
    };
}
function markSeen(user, art, key) {
    if (art !== "woche" && art !== "monat") throw new Error("Unbekannter Ausblick.");
    key = String(key || "");
    if (art === "woche" && !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Ungültige Woche.");
    if (art === "monat" && !/^\d{4}-\d{2}$/.test(key)) throw new Error("Ungültiger Monat.");
    const s = readStatus();
    const cur = s.nutzer[user.id] && typeof s.nutzer[user.id] === "object" ? s.nutzer[user.id] : {};
    // nie zurück auf eine ältere Woche bzw. einen älteren Monat
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
    s.nutzer[user.id] = cur;
    writeStatus(s);
    return stateFor(user);
}
// Gelöschte Profile aus dem Merker entfernen (einmal beim Start)
function pruneUsers() {
    const s = readStatus();
    const ids = Object.keys(s.nutzer);
    if (!ids.length) return;
    let changed = false;
    ids.forEach(id => {
        try { $app.findRecordById("benutzer", id); } catch (e) { delete s.nutzer[id]; changed = true; }
    });
    if (changed) writeStatus(s);
}

module.exports = { runCron, stateFor, markSeen, savePush, pruneUsers, weekKey, monthKey, wallNow };
