// pb_hooks/pinn-haustiere.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Erinnerungen für die Haustiere der Familie (Familiendaten → pets):
//   pets: [{ id, name, emoji, birth, gone, push, owners: [Mitglied-IDs],
//            care: [{ id, type, title, last, every (Tage, 0 = einmalig), next }] }]
//   Fällig ist eine Vorsorge am Datum „next“ – oder, wenn es fehlt, „last“ + „every“ Tage.
//
// Schonend wie die übrigen Erinnerungen: die (großen) Familiendaten liest der Zeitplan höchstens einmal
// am Tag je Familie – und neu nur, wenn sie sich seitdem geändert haben. Merker in
// pb_data/pinn_haustiere.json, ältere Tage werden verworfen. Nach 21 Uhr keine Nachricht mehr.

const STATUS_FILE = "/pb_data/pinn_haustiere.json";
const SEND_UNTIL_HOUR = 21;
const DEFAULT_TIME = "07:00";
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = { runCron, duesFromData };

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
function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function isIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function utcOf(iso) { const p = iso.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function addDays(iso, n) { return new Date(utcOf(iso) + n * DAY_MS).toISOString().slice(0, 10); }
function diffDays(a, b) { return Math.round((utcOf(b) - utcOf(a)) / DAY_MS); }
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

// ---------------------------------------------------------------------------------------------
// Merker in pb_data
// ---------------------------------------------------------------------------------------------
function readStatus(today) {
    let o = null;
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
    } catch (e) { o = null; }
    if (!o || typeof o !== "object" || o.datum !== today) o = { datum: today, familien: {}, gesendet: {} };
    if (!o.familien || typeof o.familien !== "object") o.familien = {};
    if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
    return o;
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Haustiere] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}

// ---------------------------------------------------------------------------------------------
// Was steht heute an? [{ pet, name, emoji, owners, kind: 'care'|'geburtstag', title, tage, alter }]
// ---------------------------------------------------------------------------------------------
function nextDue(c) {
    if (!c) return "";
    if (isIso(c.next)) return c.next;
    const every = Number(c.every) || 0;
    if (isIso(c.last) && every > 0) return addDays(c.last, every);
    return "";
}
function duesFromData(data, w) {
    const pets = Array.isArray(data && data.pets) ? data.pets : [];
    const out = [];
    pets.forEach(p => {
        if (!p || !p.id || p.gone || p.push === false) return;
        const base = { pet: String(p.id), name: String(p.name || ""), emoji: String(p.emoji || "🐾"), owners: Array.isArray(p.owners) ? p.owners.map(String) : [] };
        (Array.isArray(p.care) ? p.care : []).forEach(c => {
            const due = nextDue(c);
            if (!due) return;
            const tage = diffDays(w.iso, due);
            // 3 Tage vorher, am Tag selbst, danach einmal je Woche
            if (tage === 3 || tage === 0 || (tage < 0 && (-tage) % 7 === 0 && tage >= -84)) {
                out.push(Object.assign({}, base, { kind: "care", type: String(c.type || ""), title: String(c.title || ""), tage: tage }));
            }
        });
        const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(p.birth || ""));
        if (mm) {
            let bm = Number(mm[2]), bd = Number(mm[3]);
            if (bm === 2 && bd === 29 && !isLeap(w.y)) bd = 28;
            if (bm === w.m && bd === w.d) {
                const alter = w.y - Number(mm[1]);
                out.push(Object.assign({}, base, { kind: "geburtstag", alter: alter > 0 && alter < 60 ? alter : null }));
            }
        }
    });
    return out;
}
function duesToday(familyId, status, w) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const stamp = lib.familyDataStamp(familyId);
    const c = status.familien[familyId];
    if (c && c.stamp === stamp && Array.isArray(c.liste)) return c;
    let data = {};
    try { data = lib.loadFamilyDataFor(familyId) || {}; } catch (e) { data = {}; }
    const members = Array.isArray(data.members) ? data.members : [];
    const kinder = members.filter(m => m && m.childLock).map(m => String(m.id));
    const out = { stamp: stamp, liste: duesFromData(data, w), kinder: kinder };
    status.familien[familyId] = out;
    status.dirty = true;
    return out;
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
const T = {
    de: { heute: "heute fällig", in3: "in 3 Tagen fällig", ueber: "seit {n} Tagen überfällig", geb: "{name} hat heute Geburtstag!", gebAlt: "{name} wird heute {n} 🐾",
          gebText: "Heute gibt's ein Leckerli extra 🦴", mehr: "🐾 Für eure Tiere steht etwas an", kurzHeute: "heute", kurzIn3: "in 3 Tagen", kurzUeber: "überfällig" },
    en: { heute: "due today", in3: "due in 3 days", ueber: "overdue for {n} days", geb: "It's {name}'s birthday today!", gebAlt: "{name} turns {n} today 🐾",
          gebText: "Time for an extra treat 🦴", mehr: "🐾 Something's coming up for your pets", kurzHeute: "today", kurzIn3: "in 3 days", kurzUeber: "overdue" },
    fr: { heute: "à faire aujourd'hui", in3: "à faire dans 3 jours", ueber: "en retard de {n} jours", geb: "C'est l'anniversaire de {name} !", gebAlt: "{name} a {n} ans aujourd'hui 🐾",
          gebText: "Une friandise en plus aujourd'hui 🦴", mehr: "🐾 Quelque chose est prévu pour vos animaux", kurzHeute: "aujourd'hui", kurzIn3: "dans 3 jours", kurzUeber: "en retard" },
    es: { heute: "toca hoy", in3: "toca en 3 días", ueber: "con {n} días de retraso", geb: "¡Hoy es el cumpleaños de {name}!", gebAlt: "{name} cumple {n} hoy 🐾",
          gebText: "Hoy toca un premio extra 🦴", mehr: "🐾 Hay algo pendiente para vuestras mascotas", kurzHeute: "hoy", kurzIn3: "en 3 días", kurzUeber: "con retraso" },
};
function tx(lang, k, vars) {
    let s = (T[lang] || T.en)[k] || T.en[k] || k;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (vars[n] != null ? String(vars[n]) : ""));
    return s;
}
const CARE_ICON = { impfung: "💉", wurmkur: "🪱", parasiten: "🛡️", tierarzt: "🩺", medikament: "💊", zahn: "🦷", krallen: "✂️", pflege: "🛁", reinigung: "🧽", sonstiges: "📌" };
function message(lang, list) {
    if (list.length === 1) {
        const x = list[0];
        if (x.kind === "geburtstag") return { titel: "🎂 " + tx(lang, "geb", { name: x.name }), text: x.alter ? tx(lang, "gebAlt", { name: x.name, n: x.alter }) : tx(lang, "gebText") };
        const when = x.tage === 0 ? tx(lang, "heute") : x.tage > 0 ? tx(lang, "in3") : tx(lang, "ueber", { n: -x.tage });
        return { titel: (CARE_ICON[x.type] || "🐾") + " " + x.name + ": " + x.title, text: when };
    }
    const parts = list.map(x => {
        if (x.kind === "geburtstag") return "🎂 " + x.name;
        const when = x.tage === 0 ? tx(lang, "kurzHeute") : x.tage > 0 ? tx(lang, "kurzIn3") : tx(lang, "kurzUeber");
        return x.name + ": " + x.title + " (" + when + ")";
    });
    return { titel: tx(lang, "mehr"), text: parts.join(" · ") };
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
    const users = allUsers().filter(u => {
        const r = u.getString("rolle");
        return r !== "hauptadmin" && r !== "gast";
    });
    const byFamily = {};
    users.forEach(u => {
        const f = u.getString("familie");
        if (f) (byFamily[f] = byFamily[f] || []).push(u);
    });
    let push = null;
    let sent = 0;
    Object.keys(byFamily).forEach(familyId => {
        const info = duesToday(familyId, status, w);
        if (!info.liste.length) return;
        byFamily[familyId].forEach(u => {
            if (status.gesendet[u.id]) return;
            const me = u.getString("mitglied");
            const mine = info.liste.filter(x => {
                if (x.owners.length) return x.owners.indexOf(me) >= 0;
                return info.kinder.indexOf(me) < 0; // ohne Bezugspersonen: keine Kinder mit Kindersicherung
            });
            if (!mine.length) return;
            if (!push) push = require(`${__hooks}/pinn-push.js`);
            if (nowMin < sendTime(push, u)) return;
            status.gesendet[u.id] = Date.now();
            status.dirty = true;
            const msg = message(langOf(u), mine);
            try {
                sent += push.notifyUser(u.id, {
                    titel: msg.titel, text: msg.text,
                    url: "/?haustier=" + encodeURIComponent(mine[0].pet),
                    tag: "haustiere-" + w.iso, urgency: "normal",
                }) || 0;
            } catch (e) {
                console.log("[Haustiere] Push: " + e.message);
            }
        });
    });
    if (status.dirty) { delete status.dirty; writeStatus(status); }
    if (sent) console.log("[Haustiere] " + sent + " Erinnerung(en) verschickt.");
    return { gesendet: sent };
}
