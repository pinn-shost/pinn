// pb_hooks/pinn-dashboard.js
// Not a *.pb.js -> NOT loaded as a hook automatically, only included via require()
// (routes in dashboard.pb.js, setup via pinn-benutzer.js -> ensureSchema).
//
// Family dashboard (e.g. an iPad in the kitchen):
//  - An admin of the family sets up a device as a dashboard. The device gets a random key for it.
//    The server only stores its SHA-256 value in the locked collection "dashboard_geraete"
//    (reachable only via the routes; deleting the family deletes it as well).
//  - If the same device is set up as a dashboard again (e.g. because the key was missing on the
//    device after an app update), the existing entry only gets a new key - no second device is
//    created. It is recognised by the device cookie (pinn-sitzungen.js), otherwise by the same name
//    + the same device type/browser (without version numbers), never by the network address.
//    Duplicate dashboard devices from earlier versions are merged when the server starts.
//  - With this key the device shows the profiles of its family without a login and opens a profile
//    after entering its PIN.
//  - PIN: 4 or 6 digits. Stored in the profile in the hidden field "dashboard_pin" as
//    "<length>$<salt>$<SHA-256(salt:PIN)>" - never in plain text.
//  - Since 1.118.4 a PIN is mandatory as soon as the family has a dashboard (pinRequired): a profile
//    without a PIN can only be opened at the dashboard with its password (login route, field
//    "passwort"); the app then asks for a new PIN right away. Its own PIN cannot be removed while
//    the dashboard exists (an admin can still reset someone else's PIN - that person then logs in
//    with the password once more and sets a new one).
//  - After 5 wrong PINs (or passwords) the profile is locked at the dashboard: 30 seconds, then twice
//    as long each time, at most 15 minutes. The counters only live in memory (no writing to disk,
//    back to 0 after a restart).
//  - Guests (role "gast") have no known password and no PIN - they only enter the app via the
//    dashboard, with a tap.
//
//  - Background per family: an admin chooses default, a colour, a gradient or an own picture under
//    Account → "Dashboard background". Stored in the locked collection "dashboard_hintergruende"
//    (one record per family, deleting the family deletes it as well). The picture is shrunk in the
//    app (JPEG) and stored as image data. Along with the profiles the dashboard device only gets the
//    small style plus its stamp and loads the picture itself only if it changed (after that it is on
//    the device - offline too).
//
// Gentle on CPU and memory: only single database accesses per action, no schedule.
// "last used" is stored at most once a day per device.
// Style and stamp of the background are also kept in memory, so that opening the dashboard does not
// read the big picture from the database every time.

const GERAETE = "dashboard_geraete";
const PIN_FIELD = "dashboard_pin";
const MAX_FAILS = 5;
const LOCK_PREFIX = "pinnPinSperre:";
const HINTERGRUND = "dashboard_hintergruende";
const BG_CACHE_PREFIX = "pinnDashBg:";
const BG_MAX_CHARS = 2600000;          // image data (Base64) at most about 1.9 MB
const BG_ARTEN = ["standard", "farbe", "verlauf", "bild"];
const FELDER_KEY = "pinnDashFelder2";
const NEUE_FELDER = [
    { name: "kennung", max: 64 },   // device cookie
    { name: "merkmal", max: 64 },   // device type/browser (checksum)
];

function base() {
    return require(`${__hooks}/pinn-benutzer.js`);
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------
// Creates the collections "dashboard_geraete" and "dashboard_hintergruende" if they are missing.
// true = both exist.
function ensureSchema() {
    const devices = ensureDeviceSchema();
    const bg = ensureBackgroundSchema();
    return devices && bg;
}

function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
// Adds missing newer fields (once per server start)
function ensureDeviceFields() {
    try { if ($app.store().get(FELDER_KEY) === "1") return true; } catch (e) { /* check */ }
    const col = base().findCol(GERAETE);
    if (!col) return false;
    let changed = false;
    NEUE_FELDER.forEach(f => {
        if (hasField(col, f.name)) return;
        try { col.fields.add(new TextField({ name: f.name, max: f.max })); changed = true; }
        catch (err) { console.log("[Dashboard] Feld \"" + f.name + "\" nicht ergänzbar: " + err.message); }
    });
    if (changed) {
        try { $app.save(col); console.log("[Dashboard] Sammlung \"" + GERAETE + "\" um Geräte-Erkennung ergänzt."); }
        catch (err) { console.log("[Dashboard] Felder nicht gespeichert: " + err.message); return false; }
    }
    try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* ignore */ }
    return true;
}

function ensureDeviceSchema() {
    const lib = base();
    if (lib.findCol(GERAETE)) { ensureDeviceFields(); return true; }
    const fam = lib.findCol(lib.FAMILIEN);
    if (!fam) return false; // family collection still missing - try again on the next call
    try {
        lib.createCollection({
            type: "base",
            name: GERAETE,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "name", type: "text", max: 60 },
                { name: "schluessel", type: "text", max: 128 },
                { name: "erstellt_von", type: "text", max: 30 },
                { name: "zuletzt", type: "text", max: 30 },
                { name: "kennung", type: "text", max: 64 },
                { name: "merkmal", type: "text", max: 64 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE INDEX `idx_dashboard_geraete_schluessel` ON `" + GERAETE + "` (`schluessel`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        });
        console.log("[Dashboard] Sammlung \"" + GERAETE + "\" angelegt.");
        try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* ignore */ }
        return true;
    } catch (err) {
        console.log("[Dashboard] Sammlung \"" + GERAETE + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

function ensureBackgroundSchema() {
    const lib = base();
    if (lib.findCol(HINTERGRUND)) return true;
    const fam = lib.findCol(lib.FAMILIEN);
    if (!fam) return false;
    try {
        lib.createCollection({
            type: "base",
            name: HINTERGRUND,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "stil", type: "json", maxSize: 4000 },
                { name: "bild", type: "text", max: BG_MAX_CHARS + 100 },
                { name: "stand", type: "text", max: 30 },
                { name: "geaendert_von", type: "text", max: 30 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE INDEX `idx_dashboard_hintergruende_familie` ON `" + HINTERGRUND + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        });
        console.log("[Dashboard] Sammlung \"" + HINTERGRUND + "\" angelegt.");
        return true;
    } catch (err) {
        console.log("[Dashboard] Sammlung \"" + HINTERGRUND + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------------------------
function hashKey(key) {
    return $security.sha256("pinn-dashboard:" + String(key));
}
function cleanDeviceName(v) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

// Finds an existing dashboard device of the same family: first by the device cookie, otherwise by
// the same name + the same device type/browser. An entry with a different cookie is a different
// device and is only taken if this device has only just been given a new cookie.
function findSameDevice(familyId, name, opts) {
    const o = opts || {};
    if (!ensureDeviceFields()) return null;
    if (o.kennung && !o.kennungNeu) {
        try { return $app.findFirstRecordByFilter(GERAETE, "familie = {:f} && kennung = {:k}", { f: familyId, k: o.kennung }); } catch (e) { /* go on */ }
    }
    if (!o.merkmal) return null;
    let recs = [];
    try { recs = $app.findRecordsByFilter(GERAETE, "familie = {:f} && merkmal = {:m}", "-zuletzt", 50, 0, { f: familyId, m: o.merkmal }); } catch (e) { recs = []; }
    const n = name.toLowerCase();
    for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (r.getString("name").toLowerCase() !== n) continue;
        const k = r.getString("kennung");
        if (k && o.kennung && k !== o.kennung && !o.kennungNeu) continue;
        return r;
    }
    return null;
}

// Sets up a dashboard device. If the same device is already registered, it only gets a new key
// (no second device). The key is returned in plain text only here, once.
// opts: { kennung, kennungNeu, merkmal } from pinn-sitzungen.js (optional)
function newDevice(familyId, name, userId, opts) {
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!ensureDeviceSchema()) throw new Error("Die Sammlung \"" + GERAETE + "\" fehlt.");
    const o = opts || {};
    const cleanName = cleanDeviceName(name) || "Dashboard";
    const key = $security.randomString(48);
    let rec = findSameDevice(String(familyId), cleanName, o);
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(GERAETE));
        rec.set("familie", familyId);
    }
    rec.set("name", cleanName);
    rec.set("schluessel", hashKey(key));
    rec.set("erstellt_von", String(userId || ""));
    rec.set("zuletzt", new Date().toISOString());
    if (o.kennung) rec.set("kennung", String(o.kennung));
    if (o.merkmal) rec.set("merkmal", String(o.merkmal));
    $app.save(rec);
    return { id: rec.id, key: key, name: rec.getString("name") };
}

// Merges duplicate dashboard devices from earlier versions: same family + same name. The most
// recently used entry stays; older ones are only removed if they have not been used since the newer
// one was created (two devices with the same name used at the same time both stay).
function msOf(v) {
    const s = String(v || "").trim();
    if (!s) return 0;
    const t = Date.parse(s.replace(" ", "T"));
    return isFinite(t) ? t : 0;
}
function aktivMs(r) {
    return Math.max(msOf(r.getString("zuletzt")), msOf(r.getString("created")));
}
function doppelteZusammenfuehren() {
    if (!base().findCol(GERAETE)) return 0;
    ensureDeviceFields();
    let recs = [];
    try { recs = $app.findRecordsByFilter(GERAETE, "id != ''", "", 0, 0); } catch (e) { recs = []; }
    if (recs.length < 2) return 0;
    const gruppen = {};
    recs.forEach(r => {
        const key = r.getString("familie") + "|" + r.getString("name").toLowerCase();
        (gruppen[key] = gruppen[key] || []).push(r);
    });
    let n = 0;
    Object.keys(gruppen).forEach(key => {
        const g = gruppen[key];
        if (g.length < 2) return;
        g.sort((a, b) => aktivMs(b) - aktivMs(a));
        const keepSeit = msOf(g[0].getString("created"));
        for (let i = 1; i < g.length; i++) {
            if (!keepSeit || aktivMs(g[i]) >= keepSeit) continue; // still used in parallel
            try { $app.delete(g[i]); n++; } catch (e) { /* already gone */ }
        }
    });
    if (n) console.log("[Dashboard] " + n + " doppelte Dashboard-Geräte zusammengeführt.");
    return n;
}

// Device for a key, or null
function findDevice(key) {
    const k = String(key || "");
    if (k.length < 20 || k.length > 200) return null;
    if (!base().findCol(GERAETE)) return null;
    try {
        return $app.findFirstRecordByFilter(GERAETE, "schluessel = {:h}", { h: hashKey(k) });
    } catch (e) {
        return null;
    }
}

// Stores "last used" at most once a day
function touchDevice(rec) {
    const now = new Date().toISOString();
    if (rec.getString("zuletzt").slice(0, 10) === now.slice(0, 10)) return;
    try {
        rec.set("zuletzt", now);
        $app.save(rec);
    } catch (e) { /* ignore */ }
}

function listDevices(familyId) {
    if (!familyId || !base().findCol(GERAETE)) return [];
    try {
        return $app.findRecordsByFilter(GERAETE, "familie = {:f}", "-created", 0, 0, { f: String(familyId) }).map(r => ({
            id: r.id,
            name: r.getString("name"),
            zuletzt: r.getString("zuletzt"),
            created: r.getString("created"),
        }));
    } catch (e) {
        return [];
    }
}

// Removes a device of the own family. If it is already gone, that counts as done.
function removeDevice(familyId, id) {
    if (!base().findCol(GERAETE)) return;
    let rec = null;
    try { rec = $app.findRecordById(GERAETE, String(id || "")); } catch (e) { return; }
    if (rec.getString("familie") !== String(familyId || "")) throw new Error("Dieses Gerät gehört zu einer anderen Familie.");
    $app.delete(rec);
}

// ---------------------------------------------------------------------------------------------
// Background per family
// ---------------------------------------------------------------------------------------------
function cleanHex(v) {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : "";
}
// Only takes known, simple values
function cleanStyle(input) {
    const src = (input && typeof input === "object" && !Array.isArray(input)) ? input : {};
    let art = String(src.art || "standard");
    if (BG_ARTEN.indexOf(art) < 0) art = "standard";
    let dim = parseInt(src.abdunkeln, 10);
    if (!isFinite(dim)) dim = 25;
    dim = Math.max(0, Math.min(70, dim));
    const verlauf = String(src.verlauf || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 20);
    return {
        art: art,
        farbe: cleanHex(src.farbe) || "#2F4B41",
        verlauf: verlauf || "morgen",
        abdunkeln: dim,
    };
}
// Checks image data: only JPEG/PNG/WebP as Base64, not too big. "" = invalid.
function cleanImage(v) {
    const s = String(v || "");
    if (!s || s.length > BG_MAX_CHARS) return "";
    const m = /^data:image\/(jpeg|png|webp);base64,/.exec(s.slice(0, 40));
    if (!m) return "";
    const data = s.slice(m[0].length);
    if (data.length < 100 || /[^A-Za-z0-9+/=]/.test(data)) return "";
    return s;
}

function backgroundRecord(familyId) {
    if (!familyId || !base().findCol(HINTERGRUND)) return null;
    try {
        return $app.findFirstRecordByFilter(HINTERGRUND, "familie = {:f}", { f: String(familyId) });
    } catch (e) {
        return null;
    }
}
function parseStyle(rec) {
    let raw = {};
    try {
        raw = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("stil")) || {};
    } catch (e) { raw = {}; }
    return cleanStyle(raw);
}
// Small description (without the picture) of a record
function metaOf(rec) {
    if (!rec) return { stil: cleanStyle({}), stand: "", bild: false };
    const stil = parseStyle(rec);
    const hasImage = rec.getString("bild").length > 0;
    if (stil.art === "bild" && !hasImage) stil.art = "standard";
    return { stil: stil, stand: rec.getString("stand"), bild: hasImage };
}
function cacheMeta(familyId, meta) {
    try { $app.store().set(BG_CACHE_PREFIX + familyId, JSON.stringify(meta)); } catch (e) { /* ignore */ }
}
// Style + stamp + "has picture" - from memory, otherwise once from the database
function backgroundMeta(familyId) {
    const fid = String(familyId || "");
    if (!fid) return metaOf(null);
    try {
        const raw = $app.store().get(BG_CACHE_PREFIX + fid);
        if (raw) return JSON.parse(String(raw));
    } catch (e) { /* read again */ }
    const meta = metaOf(backgroundRecord(fid));
    cacheMeta(fid, meta);
    return meta;
}
// Style + image data (for the settings and the dashboard device)
function backgroundFull(familyId) {
    const rec = backgroundRecord(familyId);
    const meta = metaOf(rec);
    return { stil: meta.stil, stand: meta.stand, bild: rec ? rec.getString("bild") : "" };
}
// Saves. bild: undefined = leave unchanged, "" / null = remove, otherwise new image data.
function saveBackground(familyId, userId, stil, bild) {
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!ensureBackgroundSchema()) throw new Error("Die Sammlung \"" + HINTERGRUND + "\" fehlt.");
    let rec = backgroundRecord(familyId);
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(HINTERGRUND));
        rec.set("familie", familyId);
        rec.set("bild", "");
    }
    const clean = cleanStyle(stil);
    if (bild !== undefined) {
        if (bild === null || bild === "") {
            rec.set("bild", "");
        } else {
            const img = cleanImage(bild);
            if (!img) throw new Error("Das Bild ist ungültig oder zu groß.");
            rec.set("bild", img);
        }
    }
    if (clean.art === "bild" && !rec.getString("bild")) throw new Error("Bitte zuerst ein Bild auswählen.");
    rec.set("stil", clean);
    rec.set("stand", String(Date.now()));
    rec.set("geaendert_von", String(userId || ""));
    $app.save(rec);
    const meta = { stil: clean, stand: rec.getString("stand"), bild: rec.getString("bild").length > 0 };
    cacheMeta(String(familyId), meta);
    return meta;
}

// ---------------------------------------------------------------------------------------------
// Profiles for the dashboard (only what is needed, no e-mail address or the like)
// ---------------------------------------------------------------------------------------------
function profilesFor(familyId) {
    const lib = base();
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: String(familyId || "") });
    } catch (e) {
        recs = [];
    }
    return recs
        .filter(r => r.getString("rolle") !== "hauptadmin")
        .map(r => ({
            id: r.id,
            username: r.getString("username"),
            rolle: r.getString("rolle") || "mitglied",
            mitglied: r.getString("mitglied"),
            pin: pinLength(r),
        }))
        .sort((a, b) => a.username.localeCompare(b.username));
}

// ---------------------------------------------------------------------------------------------
// PIN required (since 1.118.4)
// ---------------------------------------------------------------------------------------------
// true = the family has at least one dashboard device -> every profile needs a PIN
function pinRequired(familyId) {
    const f = String(familyId || "");
    if (!f || !base().findCol(GERAETE)) return false;
    try {
        return $app.findRecordsByFilter(GERAETE, "familie = {:f}", "", 1, 0, { f: f }).length > 0;
    } catch (e) {
        return false;
    }
}
// Profiles that must have a PIN: everyone except guests (no known password) and the main admin
function needsPin(rec) {
    const role = rec ? rec.getString("rolle") : "";
    return !!rec && role !== "gast" && role !== "hauptadmin";
}

// ---------------------------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------------------------
function parsePin(rec) {
    let raw = "";
    try { raw = rec.getString(PIN_FIELD); } catch (e) { raw = ""; }
    const parts = String(raw || "").split("$");
    if (parts.length !== 3) return null;
    const len = parseInt(parts[0], 10);
    if ((len !== 4 && len !== 6) || !parts[1] || !parts[2]) return null;
    return { len: len, salt: parts[1], hash: parts[2] };
}
// 0 = no PIN, otherwise 4 or 6
function pinLength(rec) {
    const p = parsePin(rec);
    return p ? p.len : 0;
}
function validPinFormat(pin) {
    return /^(\d{4}|\d{6})$/.test(String(pin || ""));
}
function hashPin(salt, pin) {
    return $security.sha256(String(salt) + ":" + String(pin));
}
// Empty PIN = remove the PIN. Throws on an invalid format.
function setPin(rec, pin) {
    const p = String(pin || "").trim();
    if (!p) {
        rec.set(PIN_FIELD, "");
        return;
    }
    if (!validPinFormat(p)) throw new Error("Die PIN muss aus 4 oder 6 Ziffern bestehen.");
    const salt = $security.randomString(16);
    rec.set(PIN_FIELD, p.length + "$" + salt + "$" + hashPin(salt, p));
}
// true = the PIN is right (or the profile has no PIN at all)
function checkPin(rec, pin) {
    const p = parsePin(rec);
    if (!p) return true;
    const given = String(pin || "");
    if (!validPinFormat(given) || given.length !== p.len) return false;
    return $security.equal(p.hash, hashPin(p.salt, given));
}

// ---------------------------------------------------------------------------------------------
// Lock after too many failed attempts (in memory only)
// ---------------------------------------------------------------------------------------------
function readLock(id) {
    try {
        const raw = $app.store().get(LOCK_PREFIX + id);
        const parts = String(raw || "").split("|");
        return { n: parseInt(parts[0], 10) || 0, until: parseInt(parts[1], 10) || 0 };
    } catch (e) {
        return { n: 0, until: 0 };
    }
}
// Remaining lock in seconds (0 = not locked)
function lockedFor(id) {
    const rest = readLock(id).until - Date.now();
    return rest > 0 ? Math.ceil(rest / 1000) : 0;
}
// Counts a failed attempt. Returns the new lock in seconds (0 = not locked yet).
function registerFail(id) {
    const lock = readLock(id);
    const n = lock.n + 1;
    let until = 0;
    if (n >= MAX_FAILS) {
        const seconds = Math.min(15 * 60, 30 * Math.pow(2, n - MAX_FAILS));
        until = Date.now() + seconds * 1000;
    }
    try { $app.store().set(LOCK_PREFIX + id, n + "|" + until); } catch (e) { /* ignore */ }
    return until ? Math.ceil((until - Date.now()) / 1000) : 0;
}
function clearFails(id) {
    try { $app.store().remove(LOCK_PREFIX + id); } catch (e) { /* ignore */ }
}
function waitText(seconds) {
    const s = Math.max(1, Math.round(seconds));
    if (s < 60) return s + " Sekunden";
    const m = Math.ceil(s / 60);
    return m === 1 ? "einer Minute" : m + " Minuten";
}

module.exports = {
    GERAETE, PIN_FIELD, HINTERGRUND,
    ensureSchema, newDevice, findDevice, doppelteZusammenfuehren, touchDevice, listDevices, removeDevice, cleanDeviceName,
    profilesFor, pinLength, setPin, checkPin, validPinFormat, pinRequired, needsPin,
    lockedFor, registerFail, clearFails, waitText,
    backgroundMeta, backgroundFull, saveBackground,
};
