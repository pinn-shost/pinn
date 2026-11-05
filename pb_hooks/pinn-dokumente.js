// pb_hooks/pinn-dokumente.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Documents (menu item "Documents")
//  - Fund (field "kasse"): every document can be assigned to a fund (see pinn-kassen.js).
//    Then only the members of this fund see it - also the files and reminders. Empty = family:
//    all profiles of the family that may open documents (no guests).
//  - Every document is a record in the collection "dokumente": title, category, person, date,
//    issuer/merchant, note and - depending on the kind - purchase data (purchase date, price, statutory warranty,
//    manufacturer's warranty) or an expiry date ("valid until", e.g. ID card, vehicle inspection).
//  - The pages are stored as protected files in the field "dateien" (up to 20 photos/PDFs per document).
//    Retrievable only with sign-in or a short-lived file token - never public, only for the own
//    family and not for guest accounts.
//  - The categories themselves are stored small in the family record (documentCategories) and, like
//    everything else, are synchronised between the devices offline-capable.
//  - Reminders: if "Remind X days before" is set on a document, a personal push message comes
//    before the expiry date or before the end of the warranty/guarantee - to the assigned adult
//    family member, otherwise to all adults of the family.
//
// Gentle on CPU and memory:
//  - The schedule runs hourly, but only really works once a day (from 8 a.m.). Only the documents
//    with a reminder set are read then (small records, no files).
//  - The large family data is only read if a reminder is actually due
//    (to exclude children as recipients) - and at most once per run per family.
//  - Sent reminders are remembered in pb_data (pinn_dokumente_erinnert.json), so that nothing comes
//    twice after a restart.

const DOKS = "dokumente";
const STATUS_FILE = "/pb_data/pinn_dokumente_erinnert.json";
const SEND_FROM_HOUR = 8;   // remind at 8 a.m. at the earliest
const SEND_UNTIL_HOUR = 21; // immediate check after saving only until 9 p.m.
const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024;
const MIME_TYPES = [
    "application/pdf",
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// ---------------------------------------------------------------------------------------------
// Set-up: collection "dokumente"
// ---------------------------------------------------------------------------------------------
// Visibility (field "sichtbar"): empty = whole family, otherwise the profile IDs (separated by commas) that
// may see the document - e.g. only oneself. Whoever is not included does not get it from the server
// (not even the files) and no reminder about it. You can only enter yourself inclusively.
const BASE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && familie = @request.auth.familie";
const VIS_RULE = "(sichtbar = '' || sichtbar ~ @request.auth.id)";
const BODY_VIS_RULE = "(@request.body.sichtbar:isset = false || @request.body.sichtbar = '' || @request.body.sichtbar ~ @request.auth.id)";
const READ_RULE = BASE_RULE + " && " + VIS_RULE;
const CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && @request.body.familie = @request.auth.familie && " + BODY_VIS_RULE;
const UPDATE_RULE = READ_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie) && " + BODY_VIS_RULE;
// Rules without visibility - in case the field cannot be created (yet)
// Fund: empty = whole family, otherwise only members of the fund (all = true: all profiles of the family)
const KASSE_RULE = "(kasse = '' || (@collection.kassen:dk.id ?= kasse && (@collection.kassen:dk.alle ?= true || @collection.kassen:dk.mitglieder ?~ @request.auth.id)))";
const BODY_KASSE_RULE = "(@request.body.kasse:isset = false || @request.body.kasse = '' || (@collection.kassen:ck.id ?= @request.body.kasse && (@collection.kassen:ck.alle ?= true || @collection.kassen:ck.mitglieder ?~ @request.auth.id)))";
const K_READ_RULE = READ_RULE + " && " + KASSE_RULE;
const K_CREATE_RULE = CREATE_RULE + " && " + BODY_KASSE_RULE;
const K_UPDATE_RULE = K_READ_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie) && " + BODY_VIS_RULE + " && " + BODY_KASSE_RULE;
const OLD_READ_RULE = BASE_RULE;
const OLD_CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && @request.body.familie = @request.auth.familie";
const OLD_UPDATE_RULE = BASE_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie)";

// All fields except file and family (are added on older states)
const PLAIN_FIELDS = [
    { name: "titel", type: "text", max: 200 },
    { name: "kategorie", type: "text", max: 40 },
    { name: "mitglied", type: "text", max: 100 },
    { name: "datum", type: "text", max: 10 },
    { name: "aussteller", type: "text", max: 200 },
    { name: "betrag", type: "number" },
    { name: "kaufdatum", type: "text", max: 10 },
    { name: "gewaehrleistung_bis", type: "text", max: 10 },
    { name: "garantie_bis", type: "text", max: 10 },
    { name: "gueltig_bis", type: "text", max: 10 },
    { name: "erinnern", type: "number" },
    { name: "notiz", type: "text", max: 4000 },
    { name: "groesse", type: "number" },
    { name: "erstellt_von", type: "text", max: 30 },
    { name: "sichtbar", type: "text", max: 600 },
    { name: "kasse", type: "text", max: 30 },
];

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function makeField(def) {
    const tmp = new Collection({ type: "base", name: "pinn_tmp_" + def.name, fields: [def] });
    return tmp.fields.getByName(def.name);
}

function ensureSchema() {
    const fam = findCol("familien");
    let col = findCol(DOKS);
    if (!col) {
        if (!fam) {
            console.log("[Dokumente] Sammlung \"familien\" fehlt noch - Dokumente werden beim nächsten Start eingerichtet.");
            return;
        }
        try {
            $app.save(new Collection({
                type: "base",
                name: DOKS,
                fields: [
                    { name: "dateien", type: "file", maxSelect: MAX_FILES, maxSize: MAX_BYTES, mimeTypes: MIME_TYPES, thumbs: ["400x400"], protected: true },
                ].concat(PLAIN_FIELDS).concat([
                    { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ]),
                indexes: [
                    "CREATE INDEX `idx_dokumente_familie` ON `" + DOKS + "` (`familie`)",
                ],
                listRule: READ_RULE,
                viewRule: READ_RULE,
                createRule: CREATE_RULE,
                updateRule: UPDATE_RULE,
                deleteRule: READ_RULE,
            }));
            console.log("[Dokumente] Sammlung \"" + DOKS + "\" angelegt.");
        } catch (err) {
            console.log("[Dokumente] Konnte Sammlung \"" + DOKS + "\" nicht anlegen: " + err.message);
        }
        return;
    }
    PLAIN_FIELDS.forEach(def => {
        if (hasField(col, def.name)) return;
        try {
            col = findCol(DOKS);
            col.fields.add(makeField(def));
            $app.save(col);
            console.log("[Dokumente] Feld \"" + def.name + "\" in \"" + DOKS + "\" ergänzt.");
        } catch (err) {
            console.log("[Dokumente] Feld \"" + def.name + "\" nicht anlegbar: " + err.message);
        }
    });
    // Keep the rules up to date (e.g. after a manual change) - with visibility and funds as soon as
    // the fields (and the collection "kassen") exist
    try {
        col = findCol(DOKS);
        const vis = hasField(col, "sichtbar");
        const kas = vis && hasField(col, "kasse") && !!findCol("kassen");
        const setRules = (kasMode) => {
            const r = kasMode ? K_READ_RULE : (vis ? READ_RULE : OLD_READ_RULE);
            const want = {
                listRule: r, viewRule: r,
                createRule: kasMode ? K_CREATE_RULE : (vis ? CREATE_RULE : OLD_CREATE_RULE),
                updateRule: kasMode ? K_UPDATE_RULE : (vis ? UPDATE_RULE : OLD_UPDATE_RULE),
                deleteRule: r,
            };
            const c = findCol(DOKS);
            let changed = false;
            Object.keys(want).forEach(k => { if (c[k] !== want[k]) { c[k] = want[k]; changed = true; } });
            if (changed) { $app.save(c); console.log("[Dokumente] Regeln für \"" + DOKS + "\" gesetzt" + (kasMode ? " (mit Kassen)." : vis ? " (mit Sichtbarkeit)." : ".")); }
        };
        if (kas) {
            try { setRules(true); }
            catch (err1) { console.log("[Dokumente] Kassen-Regeln nicht setzbar (" + err1.message + ") - nur Sichtbarkeit."); setRules(false); }
        } else setRules(false);
    } catch (err) {
        console.log("[Dokumente] Regeln nicht setzbar: " + err.message);
        try {
            col = findCol(DOKS);
            col.listRule = OLD_READ_RULE; col.viewRule = OLD_READ_RULE; col.createRule = OLD_CREATE_RULE; col.updateRule = OLD_UPDATE_RULE; col.deleteRule = OLD_READ_RULE;
            $app.save(col);
        } catch (e2) { /* ignore */ }
    }
}

// ---------------------------------------------------------------------------------------------
// Date arithmetic (plain texts "YYYY-MM-DD")
// ---------------------------------------------------------------------------------------------
function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function parts(iso) { return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]; }
function pad(n) { return (n < 10 ? "0" : "") + n; }
function isoOf(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
function addDays(iso, n) {
    const p = parts(iso);
    const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return isoOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function diffDays(a, b) {
    const pa = parts(a), pb = parts(b);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function fmtDe(iso) { return isIso(iso) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }
function inDays(n) { return n <= 0 ? "heute" : n === 1 ? "morgen" : "in " + n + " Tagen"; }

// Central European Time (fixed EU daylight saving rule - like pinn-push.js)
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
    return { iso: isoOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), hour: d.getUTCHours() };
}

// ---------------------------------------------------------------------------------------------
// Record of reminders already sent
// ---------------------------------------------------------------------------------------------
function readStatus() {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
        if (o && typeof o === "object") {
            if (!o.sent || typeof o.sent !== "object") o.sent = {};
            return o;
        }
    } catch (e) { /* no file yet */ }
    return { lastDaily: "", sent: {} };
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Dokumente] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}
function pruneStatus(s, today) {
    const cutoff = addDays(today, -400);
    Object.keys(s.sent).forEach(k => { if (typeof s.sent[k] !== "string" || s.sent[k] < cutoff) delete s.sent[k]; });
}

// ---------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------
const DEADLINES = [
    { field: "gueltig_bis", kind: "gueltig" },
    { field: "garantie_bis", kind: "garantie" },
    { field: "gewaehrleistung_bis", kind: "gewaehrleistung" },
];

function isChild(m) {
    if (!m) return false;
    if (m.kid && m.kid.enabled) return true;
    return /^(kind|tochter|sohn)$/i.test(String(m.role || "").trim());
}

// Which reminders are due today for a document? -> [{ key, titel, text }]
function dueMessages(familyId, doc, today) {
    const out = [];
    const days = Math.max(0, Math.min(365, Math.round(Number(doc.get("erinnern")) || 0)));
    if (!days) return out;
    const name = String(doc.getString("titel") || "Dokument").slice(0, 80);
    const seen = {};
    DEADLINES.forEach(dl => {
        const date = doc.getString(dl.field);
        if (!isIso(date) || seen[date]) return;
        if (today < addDays(date, -days) || today > date) return;
        seen[date] = true;
        const left = diffDays(today, date);
        const when = inDays(left);
        let titel = "", text = "";
        if (dl.kind === "gueltig") {
            titel = "⏳ Läuft ab: " + name;
            text = "Gültig bis " + fmtDe(date) + " (" + when + ") – rechtzeitig verlängern oder erneuern.";
        } else if (dl.kind === "garantie") {
            titel = "🛡️ Garantie endet: " + name;
            text = "Die Herstellergarantie endet am " + fmtDe(date) + " (" + when + "). Mängel am besten vorher melden.";
        } else {
            titel = "🧾 Gewährleistung endet: " + name;
            text = "Die gesetzliche Gewährleistung endet am " + fmtDe(date) + " (" + when + "). Mängel vorher beim Händler reklamieren.";
        }
        out.push({ key: familyId + "|" + doc.id + "|" + dl.field + "|" + date, titel: titel, text: text });
    });
    return out;
}

// Recipients: the assigned adult family member (if they have a profile), otherwise all
// adults of the family (no guests, no children).
function recipientsFor(doc, users, members, kasseIds) {
    // Only members of the document's fund (kasseIds = null: no fund -> whole family)
    if (Array.isArray(kasseIds)) users = users.filter(u => kasseIds.indexOf(u.id) >= 0);
    // Only profiles that may see the document
    const vis = String(doc.getString("sichtbar") || "").split(",").map(x => x.trim()).filter(Boolean);
    if (vis.length) return users.filter(u => vis.indexOf(u.id) >= 0 && u.getString("rolle") !== "gast");
    const byMember = {};
    users.forEach(u => { const mid = u.getString("mitglied"); if (mid) byMember[mid] = u; });
    const mid = doc.getString("mitglied");
    const owner = mid ? members.find(m => m && m.id === mid) : null;
    if (owner && !isChild(owner) && byMember[mid] && byMember[mid].getString("rolle") !== "gast") return [byMember[mid]];
    const adults = users.filter(u => {
        if (u.getString("rolle") === "gast") return false;
        const m = members.find(x => x && x.id === u.getString("mitglied"));
        return !isChild(m);
    });
    return adults;
}

function remindDocs(docs, today, status) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const push = require(`${__hooks}/pinn-push.js`);
    const famCache = {};
    let sent = 0;
    docs.forEach(doc => {
        const familyId = doc.getString("familie");
        if (!familyId) return;
        const msgs = dueMessages(familyId, doc, today).filter(m => !status.sent[m.key]);
        if (!msgs.length) return;
        if (!famCache[familyId]) {
            let users = [];
            try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
            const data = lib.loadFamilyDataFor(familyId) || {};
            famCache[familyId] = { users: users, members: Array.isArray(data.members) ? data.members : [] };
        }
        const fc = famCache[familyId];
        let kasseIds = null;
        const kasseId = (function () { try { return doc.getString("kasse"); } catch (e) { return ""; } })();
        if (kasseId) {
            if (!fc.kassen) { try { fc.kassen = require(`${__hooks}/pinn-kassen.js`).metaList(familyId); } catch (e) { fc.kassen = []; } }
            const k = fc.kassen.find(x => x.id === kasseId);
            try { kasseIds = k ? require(`${__hooks}/pinn-kassen.js`).memberUserIds(k) : []; } catch (e) { kasseIds = []; }
        }
        const targets = recipientsFor(doc, fc.users, fc.members, kasseIds);
        msgs.forEach(msg => {
            targets.forEach(u => {
                try {
                    sent += push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: "/?dokument=" + encodeURIComponent(doc.id), tag: "dokument-" + doc.id, urgency: "normal" });
                } catch (e) { console.log("[Dokumente] Push fehlgeschlagen: " + e.message); }
            });
            // Also remember as done without a registered device - otherwise it would come days later
            status.sent[msg.key] = today;
        });
    });
    return sent;
}

// opts: { familyId: only this family (immediate check after saving) }
function runReminders(opts) {
    const o = opts || {};
    const now = wallNow();
    if (now.hour < SEND_FROM_HOUR) return { skipped: "zu früh" };
    if (!findCol(DOKS)) return { skipped: "Sammlung fehlt" };
    const status = readStatus();
    pruneStatus(status, now.iso);
    let docs = [];
    if (o.familyId) {
        if (now.hour >= SEND_UNTIL_HOUR) return { skipped: "zu spät" };
        try { docs = $app.findRecordsByFilter(DOKS, "erinnern > 0 && familie = {:f}", "", 0, 0, { f: String(o.familyId) }); } catch (e) { docs = []; }
        const sent = remindDocs(docs, now.iso, status);
        writeStatus(status);
        return { sent: sent };
    }
    if (status.lastDaily === now.iso) return { skipped: "heute schon erledigt" };
    try { docs = $app.findRecordsByFilter(DOKS, "erinnern > 0 && familie != ''", "", 0, 0); } catch (e) { docs = []; }
    const sent = remindDocs(docs, now.iso, status);
    status.lastDaily = now.iso;
    writeStatus(status);
    if (sent) console.log("[Dokumente] " + sent + " Erinnerung(en) verschickt.");
    return { sent: sent };
}

module.exports = { ensureSchema, runReminders, DOKS };
