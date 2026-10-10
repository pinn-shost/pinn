// pb_hooks/pinn-familie-geburtstag.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Geburtstage in der Familie (Geburtsdatum aus dem Notfallpass, Familiendaten → emergencyPasses):
//   - Push an alle ANDEREN Profile der Familie: „🎂 Malea hat heute Geburtstag!“ – zur selben Uhrzeit
//     wie die eigene Tagesübersicht (Einstellungen → Benachrichtigungen, Standard 07:00). Das
//     Geburtstagskind selbst bekommt keine Nachricht (es bekommt in der App die Geburtstags-Animation),
//     ebenso keine Gastkonten und nicht der Hauptadmin. Mehrere Geburtstage am selben Tag kommen in
//     einer gemeinsamen Nachricht. Link: /?geburtstag=<Mitglied-ID> öffnet die Person in pinn.
//   - „Animation schon gesehen“ je Mitglied und Tag (auf allen Geräten nur einmal):
//       GET  /api/pinn/geburtstag          { heute, gesehen: [<Mitglied-ID>, …] }
//       POST /api/pinn/geburtstag/gesehen  { mitglied }
//
// Schonend:
//   - Der Zeitplan läuft alle 5 Minuten. Die (großen) Familiendaten liest er höchstens einmal am Tag je
//     Familie – und nur neu, wenn sich die Familiendaten seitdem geändert haben (Änderungszeitpunkt).
//   - Merker in pb_data/pinn_familie_geburtstag.json, ältere Tage werden verworfen.
//   - Nach 21 Uhr (z. B. Server war aus) keine Nachricht mehr für den Tag.
//
// Uhrzeit: wie die übrigen Erinnerungen in Europe/Berlin (Sommer-/Winterzeit wird selbst berechnet).

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
// Wer hat heute Geburtstag?
// ---------------------------------------------------------------------------------------------
function memberName(m) {
    if (!m) return "";
    if (m.displayMode === "role" && m.role) return String(m.role);
    return String(m.name || m.role || "");
}
// Liste aus den Familiendaten: [{ id, name, alter }]
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
        if (bm === 2 && bd === 29 && !isLeap(w.y)) bd = 28; // 29. Februar: in anderen Jahren am 28.
        if (bm !== w.m || bd !== w.d) return;
        const alter = w.y - Number(mm[1]);
        out.push({ id: String(m.id), name: memberName(m), alter: alter > 0 && alter < 130 ? alter : null });
    });
    return out;
}
// Mit Zwischenspeicher: Familiendaten nur lesen, wenn sie sich heute geändert haben
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
// Texte (Sprache des Profils)
// ---------------------------------------------------------------------------------------------
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
function joinNames(lang, names) {
    if (names.length <= 1) return names[0] || "";
    const und = { de: " und ", en: " and ", fr: " et ", es: " y " }[lang] || " and ";
    return names.slice(0, -1).join(", ") + und + names[names.length - 1];
}
function message(lang, list) {
    if (list.length === 1) {
        const b = list[0];
        const n = b.name;
        if (lang === "de") return { titel: "🎂 " + n + " hat heute Geburtstag!", text: (b.alter ? n + " wird heute " + b.alter + ". " : "") + "Vergesst nicht zu gratulieren 🎉" };
        if (lang === "fr") return { titel: "🎂 C'est l'anniversaire de " + n + " !", text: (b.alter ? n + " a " + b.alter + " ans aujourd'hui. " : "") + "N'oubliez pas de le souhaiter 🎉" };
        if (lang === "es") return { titel: "🎂 ¡Hoy es el cumpleaños de " + n + "!", text: (b.alter ? n + " cumple " + b.alter + " años. " : "") + "No olvidéis felicitarle 🎉" };
        return { titel: "🎂 It's " + n + "'s birthday today!", text: (b.alter ? n + " turns " + b.alter + " today. " : "") + "Don't forget to say happy birthday 🎉" };
    }
    const names = joinNames(lang, list.map(b => b.name));
    if (lang === "de") return { titel: "🎂 Heute haben Geburtstag: " + names, text: "Vergesst nicht zu gratulieren 🎉" };
    if (lang === "fr") return { titel: "🎂 Anniversaires aujourd'hui : " + names, text: "N'oubliez pas de les souhaiter 🎉" };
    if (lang === "es") return { titel: "🎂 Hoy cumplen años: " + names, text: "No olvidéis felicitarles 🎉" };
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
            const others = liste.filter(b => b.id !== me); // das Geburtstagskind selbst bekommt nichts
            if (!others.length) return;
            const key = u.id + "|" + others.map(b => b.id).sort().join(",");
            if (status.gesendet[key]) return;
            if (!push) push = require(`${__hooks}/pinn-push.js`);
            if (nowMin < sendTime(push, u)) return;
            // zuerst merken: auch bei einem Fehler unterwegs kommt die Nachricht nie doppelt
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
// Für die App: Geburtstags-Animation nur einmal je Mitglied und Tag (auf allen Geräten)
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
