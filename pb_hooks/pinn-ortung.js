// pb_hooks/pinn-ortung.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Family -> Location (live locations, known places, "I'm on my way")
//
// Technology (since 1.34 without a Traccar container for phones):
//  - pinn. stores the phones' positions ITSELF (pb_data/pinn_positionen.json, trail of the last
//    48 hours per device in pb_data/pinn_spuren/). Two ways:
//      1. The "Traccar Client" app (iOS/Android, also in the background) sends to <pinn.>/api/pinn/ortung/osmand
//         (OsmAnd protocol, old and new app version). For the battery, one location every few minutes is enough.
//      2. pinn. itself (web app): "Share location" sends the location once and - as long as pinn.
//         is open - new locations while on the move (route /standort, /standort-teilen).
//  - The "traccar" container is only needed for GPS trackers with a SIM card (e.g. a dog) - they send
//    directly to its ports via the GT06/H02/Watch protocol. If it is running, pinn. reads their positions via the
//    Traccar API (credentials never in the app; without an .env entry pinn. creates an account itself,
//    pb_data/pinn_traccar.json) and additionally passes phone reports on to it. If it is not running,
//    pinn. remembers that for 2 minutes and does not ask during that time (no waiting).
//  - PINN_TRACCAR=aus in the .env switches Traccar off completely.
//  - Location sharing with a duration: per device "bis" (point in time, 0 = until it is ended) and "endeZuhause"
//    (ends on arriving at home). The per-minute schedule ends expired shares.
//  - Map tiles (OpenStreetMap) and the address search also go through the server, so that the
//    app only talks to the NAS. Tiles are cached in pb_data/pinn_kacheln.
//  - Home: If an address is set under Settings → Home (pinn-zuhause.js), the place
//    "Home" exists automatically (push on arrival and departure). Its position always follows the address from
//    the settings; name, radius and push settings remain editable here (syncHome).
//
// Data per family: collection "ortung" (locked, only via the routes in ortung.pb.js), field "daten":
//   { geraete: [{ id, memberId, name, emoji, typ: 'handy'|'tracker', uniqueId, traccarId (0 = without Traccar), teilen,
//                 bis (ms, 0 = no expiry), endeZuhause, geteiltSeit, erstellt, auto (created from "Share location") }],
//     orte:    [{ id, name, emoji, lat, lon, radius, zuhause, ankunft, verlassen, geraete: [], empfaenger: [],
//                // stores only (address of a shopping list, created from Lists → Edit list):
//                laden: <list ID>, adresse, verweil (min.), abhaken, erinnern, erledigtPush }],
//                // A store can have several branches (e.g. two Rewe shops): one place per branch with the
//                // same list ID. Dwell time, ticking off, reminding, push apply to all branches together.
//     unterwegs: { <device ID>: { seit, von, teilenVorher, name } },
//     heimwege: [{ id, geraet, memberId, name, seit, ende, grund: 'angekommen'|'beendet'|'abgelaufen', minuten }]
//                // finished ways home (for the "arrived" notice in the app, remembered for 6 hours at most),
//     plaene:   [{ aufgabe, titel, listen: [], besucht: { <list ID>: ms }, erinnert: {}, besucher, minuten, versuche }],
//     erledigt: [{ aufgabe, titel, zeit, memberId, wer, listen, minuten }],
//     offen:    { <list ID>: number of open items } }   // from the app, for the reminder in the store
//
// Stores & planned shopping trips:
//  - The app reports its open "plan shopping" tasks together with their stores (route /einkaeufe) - so the
//    schedule never has to read the large family data.
//  - If a device stays within the radius of a store (whichever
//    branch) for at least "verweil" minutes (default 10), the store counts as visited. Once all stores of a plan (those with an address) are visited, the server ticks off the
//    task (pinn-aufgaben.js → setDone) and, if wanted, sends a push message "Enter the amount".
//    The app then shows the open amount under the bell at the top next to the family name.
//  - Reminder on arrival ("You are at Rewe - are you going shopping?") as soon as the store's list
//    has something on it or a shopping trip is planned there (switch "remind" on the store). How many items are open
//    is reported by the app with the same route (/einkaeufe → offen: { <list ID>: count }). If
//    several stores are nearby at the same time, one joint push message is sent.
//  - As long as the own phone is within the radius of a store, /sos returns the stores under "laeden" -
//    the app uses them to show the shopping notice (banner) at the top with a link to the list.
//  Deliberately NOT in familien_daten: the schedule runs every minute and must never have to read the large
//  family data.
//
// Way home ("I'm on my way home"):
//  - Besides the distress calls, the route /sos also returns the family's ongoing ways home with the current
//    location, address and distance to home (as the crow flies) as well as those finished in the last hour.
//    The app uses them to show a notice (banner) at the top and a popup with a map and call buttons.
//  - The ID of a way home is "<device ID>-<start time>", which is how the app recognises new ways home.
//
// SOS (emergency call from "Traccar Client", from the SOS button of a GPS tracker or from the SOS button in the
//      way-home popup of pinn. - route /sos-ausloesen, source "pinn"):
//  - Immediately: The "Traccar Client" app sends its distress call via <pinn.>/api/pinn/ortung/osmand
//    (parameter alarm=sos). pinn. recognises it already when passing it on - even if Traccar is currently
//    not running - and immediately alerts the whole family by push.
//  - Safety net (every minute): alarm events "sos" from Traccar (phones that send directly to
//    port 5055, GPS trackers with an SOS button). Duplicate reports are merged.
//  - Data per family in "ortung", field sos: [{ id, geraet, memberId, name, zeit, pos, adresse,
//    quelle, anzahl, push, ende: { zeit, wer } }]. Active until the all-clear (12 hours at most).
//  - During an SOS the family sees the person's current location even if they
//    do not share their location otherwise (they triggered the distress call themselves).
//  - Push to all profiles of the family (except guest accounts), feedback to the person themselves.
//    In the app, a warning popup opens with a map, address, time, accuracy and call.
//
// Gentle on resources:
//  - Positions are requested from Traccar at most every 5 seconds (for all families together).
//  - The per-minute schedule only asks Traccar if any family has places or "on the move".
//  - Place events only for new positions (timestamp remembered in pb_data/pinn_ortung_status.json).
//
// No duplicate reports:
//  - Lock per family (withLock) when reading-changing-saving; the schedule saves its
//    changes on the current state (saveCronCfg) instead of the state from the start of the run.
//  - A schedule run never runs twice at the same time (CRON_LOCK).
//  - SOS: the same report (same timestamp) triggers nothing new, not even after the all-clear.
//  - Arrive/leave: leaving only for a position that is surely outside; the same report
//    again no earlier than PUSH_PAUSE_MS; after the way-home arrival no second "arrived" report.

const COL = "ortung";
const USERS = "benutzer";
const STATUS_FILE = "/pb_data/pinn_ortung_status.json";
const ZUGANG_FILE = "/pb_data/pinn_traccar.json";
const TILE_DIR = "/pb_data/pinn_kacheln";
const POS_FILE = "/pb_data/pinn_positionen.json";   // latest position per device ID (stored by ourselves)
const SPUR_DIR = "/pb_data/pinn_spuren";            // history per device (for the "trail" on the map)
const SPUR_MAX_MS = 48 * 60 * 60 * 1000;
const SPUR_MAX_PUNKTE = 1500;
const TRACCAR_AUS_MS = 2 * 60 * 1000;               // Traccar not reachable -> do not ask again for this long
const TEILEN_MAX_MIN = 7 * 24 * 60;                 // longest selectable share (minutes)
const UA = "pinn-familienapp/1.0 (selbst gehostet)";
const POS_TTL_MS = 5000;
const LIVE_MS = 15 * 60 * 1000;          // for this long a location counts as "live"
const EVENT_MAX_AGE_MS = 30 * 60 * 1000; // older positions do not trigger place events
const UNTERWEGS_MAX_MS = 8 * 60 * 60 * 1000;
const MAX_GERAETE = 30;
const MAX_ORTE = 60;
const MAX_PLAENE = 40;
const MAX_FILIALEN = 10;                     // addresses per store (shopping list)
const ERLEDIGT_MAX_MS = 4 * 24 * 60 * 60 * 1000;
const VERWEIL_POS_MAX_MS = 20 * 60 * 1000; // for this long the last position in the store still counts as "there"
const SOS_AKTIV_MS = 12 * 60 * 60 * 1000;    // for this long an SOS stays active without an all-clear
const SOS_BEHALTEN_MS = 24 * 60 * 60 * 1000; // finished SOS are removed after this
const SOS_ZUSAMMEN_MS = 3 * 60 * 1000;       // same report via a second way -> no new alarm
const SOS_WIEDER_MS = 2 * 60 * 1000;         // pressed again: push again no earlier than this
const SOS_EREIGNIS_MAX_MS = 15 * 60 * 1000;  // older Traccar events no longer trigger anything
const PUSH_PAUSE_MS = 10 * 60 * 1000;        // the same arrival/departure by push again no earlier than this
const SPRUNG_MS = 5 * 60 * 1000;             // "left" so shortly after arriving = GPS jump, no push
const CRON_LOCK = "pinnOrtungZeitplanLaeuft";
const CRON_LOCK_MS = 5 * 60 * 1000;          // if a run hangs for longer, the next one may start anyway
const HEIMWEG_ZEIGEN_MS = 60 * 60 * 1000;     // the app keeps showing finished ways home for this long
const HEIMWEG_BEHALTEN_MS = 6 * 60 * 60 * 1000;
const LADEN_PUSH_PAUSE_MS = 45 * 60 * 1000;   // "Are you going shopping?" per store again no earlier than this
const LADEN_HIER_MAX_MS = 60 * 60 * 1000;     // for this long the last position in the store counts for the notice at the top
const MAX_OFFEN = 80;                         // Listen in „offen“
const EMOJI_ORT = ["🏠", "🏫", "🏢", "🌳", "🐕", "🏥", "🛒", "⚽", "👵", "🏊", "🎵", "⛪", "🚉", "📍"];

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function env(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function bodyText(res) {
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* continue */ }
    try { return toString(res.body); } catch (e) { /* continue */ }
    return "";
}
function parseJson(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* continue */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* ignore */ }
    return null;
}
function bytesOf(res) {
    let b = null;
    try { b = res.body; } catch (e) { b = null; }
    if (!b || typeof b === "string") return null;
    return b;
}
function readText(path) {
    try { return require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(path)); } catch (e) { return ""; }
}
function readJsonFile(path) {
    try {
        const o = JSON.parse(readText(path));
        return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
}
function writeJsonFile(path, obj) {
    try { $os.writeFile(path, JSON.stringify(obj), 420); } catch (e) { console.log("[Ortung] " + path + " nicht speicherbar: " + e.message); }
}
function base64Encode(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    // encode as UTF-8 so that umlauts in the password work too
    const src = String(input);
    let utf = "";
    for (let i = 0; i < src.length; i++) {
        let c = src.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < src.length) { c = 0x10000 + ((c - 0xD800) << 10) + (src.charCodeAt(++i) - 0xDC00); }
        if (c < 0x80) utf += String.fromCharCode(c);
        else if (c < 0x800) utf += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) utf += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else utf += String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    let out = "";
    for (let i = 0; i < utf.length; i += 3) {
        const a = utf.charCodeAt(i), b = utf.charCodeAt(i + 1), c = utf.charCodeAt(i + 2);
        const n = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
        out += chars.charAt((n >> 18) & 63) + chars.charAt((n >> 12) & 63) +
            (isNaN(b) ? "=" : chars.charAt((n >> 6) & 63)) +
            (isNaN(c) ? "=" : chars.charAt(n & 63));
    }
    return out;
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80); }
function cleanId(v) { const s = String(v || ""); return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : ""; }
function newId() { return $security.randomStringWithAlphabet(12, "abcdefghijklmnopqrstuvwxyz0123456789"); }
function num(v, min, max, def) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
}
function distM(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function homeOf(familyId) {
    if (!familyId) return null;
    try { return require(`${__hooks}/pinn-zuhause.js`).get(familyId); } catch (e) { return null; }
}
function memberOf(e) {
    try { return e.auth ? e.auth.getString("mitglied") : ""; } catch (err) { return ""; }
}

// ---------------------------------------------------------------------------------------------
// Collection "ortung" (one record per family)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (findCol(COL)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "text", max: 40, required: true },
                { name: "daten", type: "text", max: 500000 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE UNIQUE INDEX `idx_ortung_familie` ON `" + COL + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Ortung] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Ortung] Konnte Sammlung nicht anlegen: " + err.message);
    }
    try { $os.mkdirAll(TILE_DIR, 493); } catch (e) { /* ignore */ }
}

function emptyCfg() { return { geraete: [], orte: [], unterwegs: {}, heimwege: [], plaene: [], erledigt: [], sos: [], offen: {} }; }
// Open items per shopping list (from the app)
function cleanOffen(v) {
    const out = {};
    if (!v || typeof v !== "object" || Array.isArray(v)) return out;
    Object.keys(v).slice(0, MAX_OFFEN).forEach(k => {
        const id = cleanId(k);
        const n = Math.round(Number(v[k]));
        if (id && isFinite(n) && n > 0) out[id] = Math.min(n, 999);
    });
    return out;
}
function normalizeCfg(c) {
    const out = emptyCfg();
    if (!c || typeof c !== "object") return out;
    if (Array.isArray(c.geraete)) out.geraete = c.geraete.filter(g => g && g.id && g.uniqueId);
    if (Array.isArray(c.orte)) out.orte = c.orte.filter(o => o && o.id && isFinite(o.lat) && isFinite(o.lon));
    if (c.unterwegs && typeof c.unterwegs === "object") out.unterwegs = c.unterwegs;
    if (Array.isArray(c.heimwege)) {
        const grenze = Date.now() - HEIMWEG_BEHALTEN_MS;
        out.heimwege = c.heimwege.filter(h => h && h.id && h.geraet && Number(h.ende || 0) > grenze).slice(-20);
    }
    if (Array.isArray(c.plaene)) out.plaene = c.plaene.filter(p => p && p.aufgabe && Array.isArray(p.listen)).slice(0, MAX_PLAENE);
    if (Array.isArray(c.erledigt)) {
        const grenze = Date.now() - ERLEDIGT_MAX_MS;
        out.erledigt = c.erledigt.filter(x => x && x.aufgabe && Number(x.zeit || 0) > grenze).slice(-30);
    }
    if (Array.isArray(c.sos)) {
        const grenze = Date.now() - SOS_BEHALTEN_MS;
        out.sos = c.sos.filter(x => x && x.id && x.geraet && Number(x.zeit || 0) > grenze).slice(-20);
    }
    out.offen = cleanOffen(c.offen);
    return out;
}
function loadRec(familyId) {
    try { return $app.findFirstRecordByFilter(COL, "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
function loadCfg(familyId) {
    const rec = loadRec(familyId);
    if (!rec) return emptyCfg();
    try { return normalizeCfg(JSON.parse(rec.getString("daten") || "{}")); } catch (e) { return emptyCfg(); }
}
function saveCfg(familyId, cfg) {
    ensureSchema();
    let rec = loadRec(familyId);
    if (!rec) {
        rec = new Record(findCol(COL));
        rec.set("familie", String(familyId));
    }
    rec.set("daten", JSON.stringify(normalizeCfg(cfg)));
    $app.save(rec);
}
function allCfgs() {
    let recs = [];
    try { recs = $app.findAllRecords(COL); } catch (e) { recs = []; }
    return recs.map(r => {
        let cfg = emptyCfg();
        try { cfg = normalizeCfg(JSON.parse(r.getString("daten") || "{}")); } catch (e) { /* leer */ }
        return { familyId: r.getString("familie"), cfg: cfg };
    });
}

// Lock per family for read-change-save. Passing on the phone reports (SOS), the
// per-minute schedule and clicks in the app run concurrently in separate environments - without a lock
// the slower one overwrites the other's change, or both create the same distress call.
// $app.store() is shared by all environments.
function lockKey(familyId) { return "pinnOrtungSperre:" + familyId; }
function withLock(key, fn) {
    let store = null;
    try { store = $app.store(); } catch (e) { store = null; }
    if (store) {
        const bis = Date.now() + 8000;
        for (;;) {
            let t = 0;
            try { t = Number(store.get(key) || 0); } catch (e) { t = 0; }
            if (!t || Date.now() - t > 15000 || Date.now() > bis) break;
            try { sleep(80); } catch (e) { break; }
        }
        try { store.set(key, Date.now()); } catch (e) { /* continue without lock */ }
    }
    try {
        return fn();
    } finally {
        if (store) { try { store.remove(key); } catch (e) { /* ignore */ } }
    }
}

// ---------------------------------------------------------------------------------------------
// Take over Home from the settings (pinn-zuhause.js) as a place
// ---------------------------------------------------------------------------------------------
function applyHome(cfg, home) {
    if (!home || !isFinite(home.lat) || !isFinite(home.lon)) return { changed: false, moved: false, id: "" };
    const lat = Math.round(Number(home.lat) * 1e6) / 1e6, lon = Math.round(Number(home.lon) * 1e6) / 1e6;
    let p = cfg.orte.find(o => o.zuhause);
    let changed = false, moved = false;
    if (!p) {
        if (cfg.orte.length >= MAX_ORTE) return { changed: false, moved: false, id: "" };
        p = { id: newId(), name: "Zuhause", emoji: "🏠", lat: lat, lon: lon, radius: 150, zuhause: true, ankunft: true, verlassen: true, geraete: [], empfaenger: [] };
        cfg.orte.unshift(p);
        changed = true;
    } else if (Number(p.lat) !== lat || Number(p.lon) !== lon) {
        p.lat = lat; p.lon = lon;
        changed = true; moved = true;
    }
    cfg.orte.forEach(o => { if (o !== p && o.zuhause) { o.zuhause = false; changed = true; } });
    return { changed: changed, moved: moved, id: p.id };
}
// Remembers "inside/outside" per place - start over after moving (otherwise a false "left" alarm)
function clearPlaceState(placeId) {
    if (!placeId) return;
    const st = readJsonFile(STATUS_FILE);
    if (!st) return;
    let changed = false;
    Object.keys(st).forEach(k => {
        if (k.indexOf("in|") === 0 && k.slice(-(placeId.length + 1)) === "|" + placeId) { delete st[k]; changed = true; }
    });
    if (changed) writeJsonFile(STATUS_FILE, st);
}
// Called by pinn-zuhause.js after the address has been saved
function syncHome(familyId, home) {
    if (!familyId || !home) return false;
    const cfg = loadCfg(familyId);
    const r = applyHome(cfg, home);
    if (!r.changed) return false;
    saveCfg(familyId, cfg);
    if (r.moved) clearPlaceState(r.id);
    return true;
}

// ---------------------------------------------------------------------------------------------
// Traccar
// ---------------------------------------------------------------------------------------------
function traccarUrl() { return (env("PINN_TRACCAR_URL") || "http://traccar:8082").replace(/\/+$/, ""); }
// Traccar is optional: off via .env (PINN_TRACCAR=aus) or currently not reachable (then a 2 min pause)
function traccarAus() { return /^(aus|off|0|nein|false)$/i.test(env("PINN_TRACCAR")); }
function traccarAn() {
    if (traccarAus()) return false;
    try { const t = Number($app.store().get("pinnTraccarAus") || 0); if (t && Date.now() - t < TRACCAR_AUS_MS) return false; } catch (e) { /* ignore */ }
    return true;
}
function traccarWeg() { try { $app.store().set("pinnTraccarAus", Date.now()); } catch (e) { /* ignore */ } }
function traccarDa() { try { $app.store().remove("pinnTraccarAus"); } catch (e) { /* ignore */ } }
function traccarGestoert() {
    try { const t = Number($app.store().get("pinnTraccarAus") || 0); return !!t && Date.now() - t < TRACCAR_AUS_MS; } catch (e) { return false; }
}
function osmandUrl() { return (env("PINN_TRACCAR_OSMAND_URL") || "http://traccar:5055").replace(/\/+$/, ""); }

function zugang() {
    const email = env("PINN_TRACCAR_EMAIL"), pw = env("PINN_TRACCAR_PASSWORT");
    if (email && pw) return { email: email, passwort: pw, ausEnv: true };
    let z = readJsonFile(ZUGANG_FILE);
    if (!z || !z.email || !z.passwort) {
        z = { email: "pinn@pinn.local", passwort: $security.randomString(28), angelegt: false };
        writeJsonFile(ZUGANG_FILE, z);
    }
    return { email: z.email, passwort: z.passwort, ausEnv: false, angelegt: !!z.angelegt };
}

function rawApi(method, path, body, auth) {
    const headers = { "Accept": "application/json" };
    if (auth !== false) {
        const z = zugang();
        headers["Authorization"] = "Basic " + base64Encode(z.email + ":" + z.passwort);
    }
    let b = "";
    if (body !== undefined && body !== null) { headers["Content-Type"] = "application/json"; b = JSON.stringify(body); }
    return $http.send({ url: traccarUrl() + path, method: method, headers: headers, body: b, timeout: 12 });
}

// Create the first account in Traccar. Traccar makes the first account an administrator itself -
// the "administrator" field must NOT be sent without signing in, otherwise Traccar rejects
// the creation with "Administrator access required".
function ensureTraccarUser() {
    const z = zugang();
    if (z.ausEnv) throw new Error("Traccar lehnt die Anmeldung ab – PINN_TRACCAR_EMAIL / PINN_TRACCAR_PASSWORT in der .env prüfen.");
    let res;
    try {
        res = rawApi("POST", "/api/users", { name: "pinn.", email: z.email, password: z.passwort }, false);
    } catch (e) {
        throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?).");
    }
    if (res.statusCode === 0) throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?).");
    if (res.statusCode >= 200 && res.statusCode < 300) {
        writeJsonFile(ZUGANG_FILE, { email: z.email, passwort: z.passwort, angelegt: true });
        console.log("[Ortung] Traccar-Konto für pinn. angelegt.");
        return true;
    }
    const t = bodyText(res);
    console.log("[Ortung] Traccar-Konto nicht angelegt (Status " + res.statusCode + "): " + t.slice(0, 300));
    // An account with this e-mail already exists (e.g. pinn_traccar.json deleted) -> generate a new identifier
    // so that the next attempt does not fail again because of the duplicate e-mail
    if (/duplicate|unique|exists|constraint/i.test(t)) {
        writeJsonFile(ZUGANG_FILE, { email: "pinn-" + $security.randomString(6).toLowerCase() + "@pinn.local", passwort: $security.randomString(28), angelegt: false });
        throw new Error("Traccar-Konto für pinn. war schon vorhanden – bitte noch einmal versuchen.");
    }
    if (/registration/i.test(t)) {
        throw new Error("In Traccar gibt es schon ein anderes Konto. Bitte dessen Zugang als PINN_TRACCAR_EMAIL und PINN_TRACCAR_PASSWORT in die .env eintragen.");
    }
    throw new Error("Traccar hat das pinn.-Konto abgelehnt: " + (t.slice(0, 200) || ("Status " + res.statusCode)));
}

function api(method, path, body) {
    if (!traccarAn()) throw new Error(traccarAus() ? "Traccar ist ausgeschaltet (PINN_TRACCAR=aus)." : "Traccar ist nicht erreichbar (Container „traccar“ gestartet?).");
    let res;
    try { res = rawApi(method, path, body); } catch (e) { traccarWeg(); throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?)."); }
    if (res.statusCode === 401) {
        ensureTraccarUser();
        res = rawApi(method, path, body);
    }
    if (res.statusCode === 0) { traccarWeg(); throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?)."); }
    traccarDa();
    if (res.statusCode >= 400) {
        const t = bodyText(res).slice(0, 200);
        const err = new Error("Traccar: " + (t || ("Status " + res.statusCode)));
        err.status = res.statusCode;
        throw err;
    }
    return parseJson(res);
}

// ---------------------------------------------------------------------------------------------
// Own position store (phones: "Traccar Client" app or pinn. itself) - without a Traccar container
// ---------------------------------------------------------------------------------------------
function uidKey(uid) { return String(uid == null ? "" : uid).replace(/\s+/g, "").toLowerCase().slice(0, 64); }
function spurPath(uid) { return SPUR_DIR + "/" + uidKey(uid).replace(/[^a-z0-9._-]/g, "_") + ".json"; }
function ownPositions() {
    try {
        const c = $app.store().get("pinnEigenePos");
        if (c && c.map) return c.map;
    } catch (e) { /* continue */ }
    const map = readJsonFile(POS_FILE) || {};
    try { $app.store().set("pinnEigenePos", { map: map }); } catch (e) { /* ignore */ }
    return map;
}
// Stores a position (only if it is newer than the stored one) and appends it to the trail.
// p: { lat, lon, zeit, genau, tempo, kurs, akku, laedt }, quelle: "app" | "pinn"
// mitSpur = false: only remember the latest position (e.g. when the person is currently not sharing - for SOS),
// but do not record a history.
function saveOwnPosition(uid, p, quelle, mitSpur) {
    const key = uidKey(uid);
    if (!key || !p || !isFinite(p.lat) || !isFinite(p.lon) || (p.lat === 0 && p.lon === 0)) return false;
    if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) return false;
    const now = Date.now();
    let zeit = Number(p.zeit || 0);
    if (!zeit || zeit > now + 60 * 1000) zeit = now; // The phone's clock is ahead -> use the arrival time
    const fin = (v) => v !== null && v !== undefined && v !== "" && isFinite(Number(v));
    const row = {
        lat: Math.round(Number(p.lat) * 1e6) / 1e6, lon: Math.round(Number(p.lon) * 1e6) / 1e6, zeit: zeit, server: now,
        genau: fin(p.genau) && Number(p.genau) > 0 ? Math.round(Number(p.genau)) : null,
        tempo: fin(p.tempo) && Number(p.tempo) >= 0 ? Math.round(Number(p.tempo)) : null,
        kurs: fin(p.kurs) && Number(p.kurs) >= 0 ? Math.round(Number(p.kurs)) : null,
        akku: fin(p.akku) && Number(p.akku) >= 0 && Number(p.akku) <= 100 ? Math.round(Number(p.akku)) : null,
        laedt: !!p.laedt, quelle: quelle || "app",
    };
    let gespeichert = false;
    withLock("pinnOrtungPosDatei", () => {
        const map = readJsonFile(POS_FILE) || {};
        const alt = map[key];
        if (alt && Number(alt.zeit || 0) > row.zeit) return; // older, late-delivered report: only into the trail
        if (alt && row.akku === null && alt.akku !== null && now - Number(alt.server || 0) < 30 * 60 * 1000) { row.akku = alt.akku; row.laedt = alt.laedt; }
        map[key] = row;
        writeJsonFile(POS_FILE, map);
        try { $app.store().set("pinnEigenePos", { map: map }); } catch (e) { /* ignore */ }
        gespeichert = true;
    });
    // Trail (also late-delivered points - Traccar Client buffers without network)
    if (mitSpur !== false && !(row.genau !== null && row.genau > 300)) {
        try {
            withLock("pinnOrtungSpur:" + key, () => {
                const path = spurPath(key);
                let pts = [];
                try { pts = JSON.parse(readText(path) || "[]"); } catch (e) { pts = []; }
                if (!Array.isArray(pts)) pts = [];
                const grenze = now - SPUR_MAX_MS;
                const pt = [Math.round(row.lat * 1e5) / 1e5, Math.round(row.lon * 1e5) / 1e5, row.zeit];
                if (!pts.some(x => x[2] === pt[2])) pts.push(pt);
                pts = pts.filter(x => Array.isArray(x) && Number(x[2]) > grenze).sort((a, b) => a[2] - b[2]);
                if (pts.length > SPUR_MAX_PUNKTE) pts = pts.slice(-SPUR_MAX_PUNKTE);
                try { $os.mkdirAll(SPUR_DIR, 493); } catch (e) { /* ignore */ }
                writeJsonFile(path, pts);
            });
        } catch (e) { console.log("[Ortung] Spur nicht speicherbar: " + e.message); }
    }
    try { $app.store().remove("pinnOrtungPos"); } catch (e) { /* ignore */ }
    return gespeichert;
}
function deleteOwnPosition(uid) {
    const key = uidKey(uid);
    if (!key) return;
    withLock("pinnOrtungPosDatei", () => {
        const map = readJsonFile(POS_FILE) || {};
        if (!map[key]) return;
        delete map[key];
        writeJsonFile(POS_FILE, map);
        try { $app.store().set("pinnEigenePos", { map: map }); } catch (e) { /* ignore */ }
    });
    try { $os.remove(spurPath(key)); } catch (e) { /* there were none */ }
    try { $app.store().remove("pinnOrtungPos"); } catch (e) { /* ignore */ }
}
function ownTrack(uid, from) {
    let pts = [];
    try { pts = JSON.parse(readText(spurPath(uid)) || "[]"); } catch (e) { pts = []; }
    return (Array.isArray(pts) ? pts : []).filter(x => Array.isArray(x) && Number(x[2]) >= from);
}

// Latest positions of all devices (for all families together, cached for 5 seconds):
// own ones (phones, field uid) and - if Traccar is running - those from Traccar (GPS trackers, field traccarId)
function positionsAll(fresh) {
    const store = $app.store();
    if (!fresh) {
        try {
            const c = store.get("pinnOrtungPos");
            if (c && Date.now() - c.ts < POS_TTL_MS) return c.list;
        } catch (e) { /* continue */ }
    }
    const own = ownPositions();
    const out = Object.keys(own).map(k => {
        const p = own[k] || {};
        return {
            uid: k, traccarId: 0, lat: Number(p.lat), lon: Number(p.lon), zeit: Number(p.zeit || 0), server: Number(p.server || 0),
            genau: p.genau, tempo: p.tempo, kurs: p.kurs, akku: p.akku, laedt: !!p.laedt, alarm: "", quelle: p.quelle || "app",
        };
    }).filter(p => isFinite(p.lat) && isFinite(p.lon));
    if (traccarAn()) {
        let list = [];
        try { list = api("GET", "/api/positions") || []; } catch (e) { list = []; }
        (Array.isArray(list) ? list : []).forEach(p => {
            const a = p.attributes || {};
            let akku = null;
            if (isFinite(a.batteryLevel)) akku = Math.round(Number(a.batteryLevel));
            else if (isFinite(a.battery) && Number(a.battery) <= 100 && Number(a.battery) > 5) akku = Math.round(Number(a.battery));
            const row = {
                uid: "", traccarId: p.deviceId,
                lat: Number(p.latitude), lon: Number(p.longitude),
                zeit: Date.parse(p.fixTime || p.deviceTime || p.serverTime) || 0,
                server: Date.parse(p.serverTime || "") || 0, // Arrival at Traccar (the GPS time can be old)
                genau: isFinite(p.accuracy) ? Math.round(Number(p.accuracy)) : null,
                tempo: isFinite(p.speed) ? Math.round(Number(p.speed) * 1.852) : null, // Knoten -> km/h
                kurs: isFinite(p.course) ? Math.round(Number(p.course)) : null,
                akku: akku,
                laedt: !!a.charge,
                alarm: a.alarm ? String(a.alarm) : "",
                quelle: "traccar",
            };
            if (isFinite(row.lat) && isFinite(row.lon) && !(row.lat === 0 && row.lon === 0)) out.push(row);
        });
    }
    try { store.set("pinnOrtungPos", { ts: Date.now(), list: out }); } catch (e) { /* ignore */ }
    return out;
}
// Latest position of a device - own (via the device ID) or from Traccar, whichever is newer
function posOf(positions, g) {
    if (!g || !Array.isArray(positions)) return null;
    const key = uidKey(g.uniqueId);
    let best = null;
    positions.forEach(p => {
        const hit = (p.uid && key && p.uid === key) || (!p.uid && g.traccarId && p.traccarId === g.traccarId);
        if (hit && (!best || Number(p.zeit || 0) > Number(best.zeit || 0))) best = p;
    });
    return best;
}

function traccarDeviceByUnique(uniqueId) {
    const list = api("GET", "/api/devices?uniqueId=" + encodeURIComponent(uniqueId)) || [];
    return (Array.isArray(list) ? list : []).find(d => String(d.uniqueId) === String(uniqueId)) || null;
}
function createTraccarDevice(name, uniqueId) {
    const existing = (() => { try { return traccarDeviceByUnique(uniqueId); } catch (e) { return null; } })();
    if (existing) return existing.id;
    const d = api("POST", "/api/devices", { name: name, uniqueId: uniqueId });
    if (!d || !d.id) throw new Error("Traccar hat das Gerät nicht angelegt.");
    return d.id;
}
function deleteTraccarDevice(traccarId) {
    if (!traccarId) return;
    try { api("DELETE", "/api/devices/" + Number(traccarId)); } catch (e) { console.log("[Ortung] Gerät in Traccar nicht gelöscht: " + e.message); }
}

// ---------------------------------------------------------------------------------------------
// Status for the app
// ---------------------------------------------------------------------------------------------
function placeAt(cfg, pos) {
    let best = null, bestD = Infinity;
    cfg.orte.forEach(o => {
        const d = distM(pos.lat, pos.lon, Number(o.lat), Number(o.lon));
        if (d <= Number(o.radius || 100) && d < bestD) { best = o; bestD = d; }
    });
    return best ? best.id : "";
}

function status(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const admin = lib.isAdmin(e) && !!familyId;
    const me = memberOf(e);
    const cfg = loadCfg(familyId);
    // Catch up Home from the settings (in case it was set before this version or similar)
    const home = homeOf(familyId);
    if (home) {
        const r = applyHome(cfg, home);
        if (r.changed) {
            try { saveCfg(familyId, cfg); if (r.moved) clearPlaceState(r.id); } catch (err) { /* display only */ }
        }
    }
    const out = {
        verbunden: true, fehler: "", admin: admin, ichMitglied: me,
        geraete: [], orte: cfg.orte.map(o => (home && o.zuhause) ? Object.assign({}, o, { auto: true }) : o),
        zuhause: home ? { lat: home.lat, lon: home.lon, label: home.ort || home.titel || "Zuhause", adresse: home.adresse || "" } : null,
        unterwegs: {}, jetzt: Date.now(),
        traccarAuto: !zugang().ausEnv,
        traccar: traccarAus() ? "aus" : (traccarGestoert() ? "weg" : "an"),
        sos: cfg.sos.filter(a => sosAktiv(a) && !a.test).map(a => ({ id: a.id, geraet: a.geraet, memberId: a.memberId, zeit: a.zeit })),
    };
    let positions = [];
    if (cfg.geraete.length) {
        try { positions = positionsAll(false); } catch (err) { positions = []; }
    }
    // Without Traccar, only GPS trackers do not work - phones send directly to pinn.
    if (cfg.geraete.some(g => g.typ === "tracker") && !traccarAn()) {
        out.fehler = traccarAus()
            ? "GPS-Tracker brauchen den Container „traccar“ – er ist ausgeschaltet (PINN_TRACCAR=aus)."
            : "GPS-Tracker brauchen den Container „traccar“ – er ist gerade nicht erreichbar. Handys sind davon nicht betroffen.";
        out.traccar = traccarAus() ? "aus" : "weg";
    }
    const now = Date.now();
    cfg.geraete.forEach(g => {
        const own = !!me && g.memberId === me;
        const row = { id: g.id, memberId: g.memberId, name: g.name, emoji: g.emoji || "", typ: g.typ, teilen: g.teilen !== false };
        if (admin || own) row.uniqueId = g.uniqueId;
        if (row.teilen) {
            row.bis = Number(g.bis || 0);
            row.endeZuhause = !!g.endeZuhause;
            if (own) row.seit = Number(g.geteiltSeit || 0);
            const p = posOf(positions, g);
            if (p) {
                row.position = { lat: p.lat, lon: p.lon, zeit: p.zeit, genau: p.genau, tempo: p.tempo, kurs: p.kurs, akku: p.akku, laedt: p.laedt, ort: placeAt(cfg, p), quelle: p.quelle || "" };
                row.live = now - p.zeit < LIVE_MS;
            }
        } else if (g.einmal && Number(g.einmal.bis || 0) > now && isFinite(g.einmal.lat)) {
            // "Send once": only this one location, until it expires (later reports stay hidden)
            const x = g.einmal;
            row.teilen = true;
            row.nurEinmal = true;
            row.bis = Number(x.bis);
            row.position = { lat: Number(x.lat), lon: Number(x.lon), zeit: Number(x.zeit), genau: x.genau || null, tempo: null, kurs: null, akku: null, laedt: false, ort: placeAt(cfg, { lat: Number(x.lat), lon: Number(x.lon) }), quelle: "einmal" };
            row.live = now - Number(x.zeit) < LIVE_MS;
        }
        if (own && g.teilen === false) {
            // own latest report even if sharing is switched off (only for me: "is the app sending?")
            const p = posOf(positions, g);
            if (p) row.zuletzt = { zeit: p.zeit, quelle: p.quelle || "" };
        }
        out.geraete.push(row);
    });
    Object.keys(cfg.unterwegs || {}).forEach(k => {
        const u = cfg.unterwegs[k];
        if (u && now - Number(u.seit || 0) < UNTERWEGS_MAX_MS) out.unterwegs[k] = { seit: u.seit };
    });
    return out;
}

// ---------------------------------------------------------------------------------------------
// Devices (family admins only)
// ---------------------------------------------------------------------------------------------
function saveDevice(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId || !lib.isAdmin(e)) throw new Error("Nur Admins der Familie können Geräte verwalten.");
    const cfg = loadCfg(familyId);
    const id = cleanId(body.id);
    const memberId = lib.cleanMemberId ? lib.cleanMemberId(body.memberId) : cleanId(body.memberId);
    const name = cleanText(body.name, 60);
    const uniqueId = String(body.uniqueId || "").trim().replace(/\s+/g, "");
    const typ = body.typ === "tracker" ? "tracker" : "handy";
    if (!memberId) throw new Error("Bitte ein Familienmitglied auswählen.");
    if (!name) throw new Error("Name fehlt.");
    if (!/^[A-Za-z0-9._:-]{3,64}$/.test(uniqueId)) throw new Error("Die Geräte-ID darf nur Buchstaben, Ziffern und . _ : - enthalten (3–64 Zeichen).");
    // The device ID must be unique across all families
    const clash = allCfgs().some(x => x.cfg.geraete.some(g => g.uniqueId === uniqueId && !(x.familyId === familyId && g.id === id)));
    if (clash) throw new Error("Diese Geräte-ID ist schon vergeben.");
    let g = id ? cfg.geraete.find(x => x.id === id) : null;
    if (!g) {
        if (cfg.geraete.length >= MAX_GERAETE) throw new Error("Es sind schon " + MAX_GERAETE + " Geräte eingerichtet.");
        if (cfg.geraete.some(x => x.memberId === memberId && x.typ === typ)) throw new Error("Für dieses Mitglied ist schon ein solches Gerät eingerichtet.");
        g = { id: newId(), erstellt: Date.now(), teilen: true };
        cfg.geraete.push(g);
    }
    if (g.uniqueId && g.uniqueId !== uniqueId) {
        if (g.traccarId && traccarAn()) deleteTraccarDevice(g.traccarId);
        g.traccarId = 0;
        deleteOwnPosition(g.uniqueId);
    }
    g.memberId = memberId;
    g.name = name;
    g.emoji = cleanText(body.emoji, 8);
    g.typ = typ;
    g.uniqueId = uniqueId;
    // Only GPS trackers need Traccar (they send directly to its ports). Phones send to pinn.
    if (typ === "tracker" && !g.traccarId) {
        if (!traccarAn()) throw new Error("GPS-Tracker brauchen den Container „traccar“ auf dem NAS – er ist gerade nicht erreichbar (bzw. per PINN_TRACCAR=aus abgeschaltet). Handys gehen auch ohne.");
        g.traccarId = createTraccarDevice(name + " · " + familyId.slice(0, 6), uniqueId);
    }
    saveCfg(familyId, cfg);
    try { $app.store().remove("pinnOrtungPos"); } catch (err) { /* ignore */ }
    return { id: g.id };
}
function deleteDevice(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId || !lib.isAdmin(e)) throw new Error("Nur Admins der Familie können Geräte verwalten.");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.id));
    if (!g) return { ok: true };
    if (g.traccarId && traccarAn()) deleteTraccarDevice(g.traccarId);
    deleteOwnPosition(g.uniqueId);
    cfg.geraete = cfg.geraete.filter(x => x.id !== g.id);
    delete cfg.unterwegs[g.id];
    cfg.heimwege = cfg.heimwege.filter(h => h.geraet !== g.id);
    cfg.orte.forEach(o => { if (Array.isArray(o.geraete)) o.geraete = o.geraete.filter(x => x !== g.id); });
    saveCfg(familyId, cfg);
    return { ok: true };
}

// Location sharing on/off (the person themselves or an admin)
function setSharing(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.id));
    if (!g) throw new Error("Gerät nicht gefunden.");
    const me = memberOf(e);
    const own = !!me && me === g.memberId;
    if (!own && !lib.isAdmin(e)) throw new Error("Nur die Person selbst oder ein Admin kann das ändern.");
    g.teilen = !!body.an;
    delete g.einmal;
    g.bis = 0;               // switched manually: without expiry
    g.endeZuhause = false;
    g.geteiltSeit = 0;       // no "Share location" from pinn. (the app then does not send live)
    if (!g.teilen) heimwegEnde(cfg, g.id, "beendet", Date.now());
    saveCfg(familyId, cfg);
    if (!own) {
        const who = e.auth.getString("username");
        usersOfFamily(familyId).filter(u => u.mitglied === g.memberId).forEach(u => {
            sendPush(u.id, {
                titel: "📍 Standort " + (g.teilen ? "geteilt" : "nicht mehr geteilt"),
                text: who + " hat deine Standortfreigabe in pinn. " + (g.teilen ? "eingeschaltet." : "ausgeschaltet."),
                url: "/?familie=" + encodeURIComponent(g.memberId), tag: "ortung-teilen-" + g.id,
            });
        });
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Location from pinn. itself (web app, without any further app): share once, with a duration, live while open
// ---------------------------------------------------------------------------------------------
// The person's own phone - if it is missing, it is created (without Traccar, device ID "pinn-..."). The ID can
// later be entered in "Traccar Client", after which the location also arrives in the background.
function ownDevice(cfg, familyId, me, anlegen) {
    let g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy") || null;
    if (g || !anlegen) return { g: g, neu: false };
    if (cfg.geraete.length >= MAX_GERAETE) throw new Error("Es sind schon " + MAX_GERAETE + " Geräte eingerichtet.");
    let uid = "";
    const vergeben = {};
    allCfgs().forEach(x => x.cfg.geraete.forEach(d => { vergeben[uidKey(d.uniqueId)] = true; }));
    for (let i = 0; i < 10 && (!uid || vergeben[uid]); i++) uid = "pinn-" + $security.randomStringWithAlphabet(8, "abcdefghjkmnpqrstuvwxyz23456789");
    g = { id: newId(), erstellt: Date.now(), teilen: false, memberId: me, name: memberName(familyId, me, "Handy"), emoji: "", typ: "handy", uniqueId: uid, traccarId: 0, auto: true };
    cfg.geraete.push(g);
    return { g: g, neu: true };
}
function bodyPos(body) {
    const lat = Number(body && body.lat), lon = Number(body && body.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
    const n = (v) => (v === undefined || v === null || v === "" || !isFinite(Number(v))) ? null : Number(v);
    const tempo = n(body.tempo), kurs = n(body.kurs), genau = n(body.genau), akku = n(body.akku);
    return {
        lat: lat, lon: lon, zeit: Date.now(), genau: genau,
        tempo: tempo !== null && tempo >= 0 ? tempo : null, kurs: kurs !== null && kurs >= 0 ? kurs : null,
        akku: akku !== null && akku >= 0 && akku <= 100 ? akku : null, laedt: !!(body && body.laedt),
    };
}
// start "inside/outside" of a device over (after switching on sharing: no old state from earlier)
function clearDeviceState(familyId, geraetId) {
    const st = readJsonFile(STATUS_FILE);
    if (!st) return;
    const pre = "in|" + familyId + "|" + geraetId + "|";
    let changed = false;
    Object.keys(st).forEach(k => { if (k.indexOf(pre) === 0) { delete st[k]; changed = true; } });
    if (changed) writeJsonFile(STATUS_FILE, st);
}
function bisText(bis, endeZuhause) {
    if (endeZuhause) return "bis zur Ankunft zu Hause";
    if (bis) {
        const heute = new Date(Date.now() + tzOffset(Date.now())).toISOString().slice(0, 10);
        const tag = new Date(bis + tzOffset(bis)).toISOString().slice(0, 10);
        return "bis " + (tag === heute ? "" : (tag.slice(8, 10) + "." + tag.slice(5, 7) + ". ")) + hhmm(bis) + " Uhr";
    }
    return "bis auf Weiteres";
}
// Start/stop sharing. body: { an, minuten (0 = until I end it), zuhause (ends on arrival), push, lat, lon, genau, ... }
function shareStart(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    if (!familyId || !me) throw new Error("Dein Profil ist mit keinem Familienmitglied verknüpft.");
    const now = Date.now();
    const pos = bodyPos(body);
    const an = !!(body && body.an);
    const r = withLock(lockKey(familyId), () => {
        const cfg = loadCfg(familyId);
        const d = ownDevice(cfg, familyId, me, an);
        const g = d.g;
        if (!g) return { ok: true };
        if (an) {
            const zuhause = !!body.zuhause && cfg.orte.some(o => o.zuhause);
            if (body.zuhause && !zuhause) throw new Error("Lege zuerst unter Einstellungen → Zuhause eure Adresse fest.");
            const min = Math.round(num(body.minuten, 0, TEILEN_MAX_MIN, 0));
            const warAn = g.teilen !== false && !d.neu;
            g.teilen = true;
            delete g.einmal;
            g.bis = zuhause ? 0 : (min ? now + min * 60000 : 0);
            g.endeZuhause = zuhause;
            g.geteiltSeit = now;
            saveCfg(familyId, cfg);
            return { ok: true, id: g.id, uid: g.uniqueId, neu: d.neu, warAn: warAn, bis: g.bis, endeZuhause: g.endeZuhause, name: memberName(familyId, me, g.name) };
        }
        if (cfg.unterwegs && cfg.unterwegs[g.id]) heimwegEnde(cfg, g.id, "beendet", now);
        g.teilen = false;
        g.bis = 0;
        g.endeZuhause = false;
        g.geteiltSeit = 0;
        delete g.einmal;
        saveCfg(familyId, cfg);
        return { ok: true, id: g.id };
    });
    if (an && r.uid) {
        if (pos) saveOwnPosition(r.uid, pos, "pinn");
        clearDeviceState(familyId, r.id);
        if (body.push) {
            const wann = bisText(r.bis, r.endeZuhause);
            usersOfFamily(familyId).filter(u => u.mitglied !== me).forEach(u => sendPush(u.id, {
                titel: "📍 " + r.name + " teilt den Standort",
                text: (pos ? "Aktueller Standort " : "Standort ") + wann + ". Antippen für die Karte.",
                url: "/?familie=" + encodeURIComponent(me), tag: "ortung-teilen-" + r.id,
            }));
        }
    }
    return { ok: true, id: r.id || "", bis: r.bis || 0, endeZuhause: !!r.endeZuhause, neu: !!r.neu };
}
// "Send once": show exactly this location for one hour - without sharing permanently.
// If the person shares permanently anyway, it is simply a new location. body: { lat, lon, genau, push }
const EINMAL_MS = 60 * 60 * 1000;
function shareOnce(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    if (!familyId || !me) throw new Error("Dein Profil ist mit keinem Familienmitglied verknüpft.");
    const pos = bodyPos(body);
    if (!pos) throw new Error("Dein Standort war gerade nicht verfügbar – ist der Standortzugriff für pinn. erlaubt?");
    const now = Date.now();
    const r = withLock(lockKey(familyId), () => {
        const cfg = loadCfg(familyId);
        const g = ownDevice(cfg, familyId, me, true).g;
        if (g.teilen === false) {
            g.einmal = { lat: Math.round(pos.lat * 1e6) / 1e6, lon: Math.round(pos.lon * 1e6) / 1e6, genau: pos.genau ? Math.round(pos.genau) : null, zeit: now, bis: now + EINMAL_MS };
        }
        saveCfg(familyId, cfg);
        return { id: g.id, uid: g.uniqueId, dauerhaft: g.teilen !== false, name: memberName(familyId, me, g.name) };
    });
    saveOwnPosition(r.uid, pos, "pinn", r.dauerhaft);
    if (body.push) {
        const adr = shortAddress(pos.lat, pos.lon);
        usersOfFamily(familyId).filter(u => u.mitglied !== me).forEach(u => sendPush(u.id, {
            titel: "📍 " + r.name + " hat den Standort geschickt",
            text: (adr ? adr + " · " : "") + hhmm(now) + " Uhr. Antippen für die Karte.",
            url: "/?familie=" + encodeURIComponent(me), tag: "ortung-einmal-" + r.id,
        }));
    }
    return { ok: true, id: r.id, bis: r.dauerhaft ? 0 : now + EINMAL_MS, dauerhaft: r.dauerhaft };
}
// New location from the opened pinn. app (live, as long as the share is running). Does not change the
// family data - only the position store.
function sharePosition(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    if (!familyId || !me) return { ok: false };
    const pos = bodyPos(body);
    if (!pos) throw new Error("Ungültiger Standort.");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy");
    if (!g || g.teilen === false) return { ok: false, teilen: false };
    // If a more accurate location is just arriving from the phone via "Traccar Client", do not overwrite it
    const alt = ownPositions()[uidKey(g.uniqueId)];
    if (alt && alt.quelle === "app" && Date.now() - Number(alt.zeit || 0) < 60 * 1000 && alt.genau && pos.genau && pos.genau > alt.genau * 2) return { ok: true, teilen: true };
    saveOwnPosition(g.uniqueId, pos, "pinn");
    return { ok: true, teilen: true, bis: Number(g.bis || 0) };
}
// End expired shares (schedule). Runs for all families - also without places.
function expireShares(list, now) {
    list.forEach(f => {
        const ab = f.cfg.geraete.filter(g => g.teilen !== false && Number(g.bis || 0) > 0 && Number(g.bis) <= now && !(f.cfg.unterwegs && f.cfg.unterwegs[g.id]));
        if (!ab.length) return;
        try {
            withLock(lockKey(f.familyId), () => {
                const cur = loadCfg(f.familyId);
                let changed = false;
                cur.geraete.forEach(g => {
                    if (g.teilen === false || !(Number(g.bis || 0) > 0) || Number(g.bis) > now || (cur.unterwegs && cur.unterwegs[g.id])) return;
                    g.teilen = false; g.bis = 0; g.endeZuhause = false; g.geteiltSeit = 0;
                    changed = true;
                    // also in the schedule's list, so that it no longer evaluates this device now
                    const x = f.cfg.geraete.find(y => y.id === g.id);
                    if (x) { x.teilen = false; x.bis = 0; x.endeZuhause = false; }
                });
                if (changed) saveCfg(f.familyId, cur);
            });
        } catch (err) { console.log("[Ortung] Freigabe beenden: " + err.message); }
    });
}

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------
function boolOr(v, def) { return v === undefined || v === null ? !!def : !!v; }
function savePlace(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    const cfg = loadCfg(familyId);
    const o = body && body.ort ? body.ort : {};
    const lat = Number(o.lat), lon = Number(o.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) throw new Error("Bitte den Ort auf der Karte festlegen.");
    const name = cleanText(o.name, 40);
    if (!name) throw new Error("Bitte einen Namen eingeben.");
    const id = cleanId(o.id);
    const ladenId = cleanId(o.laden);
    let place = id ? cfg.orte.find(x => x.id === id) : null;
    // Store of a shopping list: at most one place per list
    if (!place && ladenId) place = cfg.orte.find(x => x.laden === ladenId) || null;
    const homePlaceBefore = cfg.orte.find(x => x.zuhause) || null;
    const isNew = !place;
    if (!place) {
        if (cfg.orte.length >= MAX_ORTE) throw new Error("Es sind schon " + MAX_ORTE + " Orte angelegt.");
        place = { id: newId() };
        cfg.orte.push(place);
    }
    if (ladenId && !place.laden) place.laden = ladenId;
    const isShop = !!place.laden;
    place.name = name;
    place.emoji = isShop ? "🛒" : (EMOJI_ORT.indexOf(o.emoji) >= 0 ? o.emoji : "📍");
    place.lat = Math.round(lat * 1e6) / 1e6;
    place.lon = Math.round(lon * 1e6) / 1e6;
    if (o.radius !== undefined && o.radius !== null) place.radius = Math.round(num(o.radius, 30, 2000, isShop ? 80 : 150));
    else if (isNew || !isFinite(place.radius)) place.radius = isShop ? 80 : 150;
    place.zuhause = isShop ? false : !!o.zuhause;
    place.ankunft = boolOr(o.ankunft, isNew ? !isShop : place.ankunft);
    place.verlassen = boolOr(o.verlassen, isNew ? false : place.verlassen);
    const devIds = cfg.geraete.map(g => g.id);
    if (Array.isArray(o.geraete)) place.geraete = o.geraete.map(cleanId).filter(x => devIds.indexOf(x) >= 0);
    else if (!Array.isArray(place.geraete)) place.geraete = [];
    const userIds = usersOfFamily(familyId).map(u => u.id);
    if (Array.isArray(o.empfaenger)) place.empfaenger = o.empfaenger.map(cleanId).filter(x => userIds.indexOf(x) >= 0);
    else if (!Array.isArray(place.empfaenger)) place.empfaenger = [];
    if (isShop) {
        if (o.adresse !== undefined) place.adresse = cleanText(o.adresse, 200);
        else if (typeof place.adresse !== "string") place.adresse = "";
        place.verweil = Math.round(num(o.verweil !== undefined ? o.verweil : place.verweil, 2, 120, 10));
        place.abhaken = boolOr(o.abhaken, isNew ? true : place.abhaken !== false);
        place.erinnern = boolOr(o.erinnern, isNew ? true : place.erinnern !== false);
        place.erledigtPush = boolOr(o.erledigtPush, isNew ? true : place.erledigtPush !== false);
        // Position moved -> start "inside/outside" over
        if (!isNew) clearPlaceState(place.id);
        // Common settings apply to all branches of the same store
        cfg.orte.forEach(x => {
            if (x === place || x.laden !== place.laden) return;
            x.name = place.name;
            x.verweil = place.verweil;
            x.abhaken = place.abhaken;
            x.erinnern = place.erinnern;
            x.erledigtPush = place.erledigtPush;
        });
    }
    if (place.zuhause) cfg.orte.forEach(x => { if (x.id !== place.id) x.zuhause = false; });
    // With Home from the settings: position and label always come from there
    const home = homeOf(familyId);
    if (home && !isShop) {
        if (homePlaceBefore && homePlaceBefore.id === place.id) {
            place.zuhause = true;
            place.lat = Math.round(Number(home.lat) * 1e6) / 1e6;
            place.lon = Math.round(Number(home.lon) * 1e6) / 1e6;
        } else {
            place.zuhause = false;
            if (homePlaceBefore) homePlaceBefore.zuhause = true;
        }
        applyHome(cfg, home);
    }
    saveCfg(familyId, cfg);
    return { id: place.id };
}
// Save a shopping list's store with all branches at once (Lists → Edit list)
// body: { laden: <list ID>, name, filialen: [{ id?, lat, lon, adresse }], verweil, abhaken, erledigtPush, erinnern, ankunft }
//  - Branches with a known ID are changed, new ones are created (the app assigns the ID itself, so that
//    sending again after a connection loss does not create duplicates), missing ones are removed.
//  - Radius, persons, recipients and "leaving" per branch are kept (adjustable under Family → Places).
function saveShop(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    const cfg = loadCfg(familyId);
    const ladenId = cleanId(body && body.laden);
    if (!ladenId) throw new Error("Die Einkaufsliste fehlt.");
    const name = cleanText(body.name, 40) || "Laden";
    const alt = cfg.orte.filter(o => o.laden === ladenId);
    const list = (Array.isArray(body.filialen) ? body.filialen : []).slice(0, MAX_FILIALEN);
    const neu = [];
    const moved = [];
    list.forEach(f => {
        if (!f || typeof f !== "object") return;
        const lat = Number(f.lat), lon = Number(f.lon);
        if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return;
        const rlat = Math.round(lat * 1e6) / 1e6, rlon = Math.round(lon * 1e6) / 1e6;
        // The same spot chosen twice -> only once
        if (neu.some(x => distM(x.lat, x.lon, rlat, rlon) < 15)) return;
        let fid = cleanId(f.id);
        let p = fid ? alt.find(o => o.id === fid) : null;
        if (!p && fid && cfg.orte.some(o => o.id === fid)) fid = ""; // ID belongs to a different place
        if (!p) {
            p = { id: fid || newId(), laden: ladenId, radius: 80, verlassen: false, geraete: [], empfaenger: [] };
        } else if (Number(p.lat) !== rlat || Number(p.lon) !== rlon) {
            moved.push(p.id);
        }
        p.lat = rlat;
        p.lon = rlon;
        p.adresse = cleanText(f.adresse, 200);
        neu.push(p);
    });
    if (!neu.length) throw new Error("Bitte mindestens eine Adresse auswählen.");
    const andere = cfg.orte.filter(o => o.laden !== ladenId);
    if (andere.length + neu.length > MAX_ORTE) throw new Error("Es sind schon " + MAX_ORTE + " Orte angelegt.");
    const erster = alt[0] || {};
    const verweil = Math.round(num(body.verweil !== undefined ? body.verweil : erster.verweil, 2, 120, 10));
    const abhaken = boolOr(body.abhaken, erster.abhaken !== false);
    const erinnern = boolOr(body.erinnern, erster.erinnern !== false);
    const erledigtPush = boolOr(body.erledigtPush, erster.erledigtPush !== false);
    const ankunft = boolOr(body.ankunft, !!erster.ankunft);
    const userIds = usersOfFamily(familyId).map(u => u.id);
    const devIds = cfg.geraete.map(g => g.id);
    neu.forEach(p => {
        p.laden = ladenId;
        p.name = name;
        p.emoji = "🛒";
        p.zuhause = false;
        if (!isFinite(Number(p.radius))) p.radius = 80;
        p.verlassen = !!p.verlassen;
        p.geraete = (Array.isArray(p.geraete) ? p.geraete : []).filter(x => devIds.indexOf(x) >= 0);
        p.empfaenger = (Array.isArray(p.empfaenger) ? p.empfaenger : []).filter(x => userIds.indexOf(x) >= 0);
        p.verweil = verweil;
        p.abhaken = abhaken;
        p.erinnern = erinnern;
        p.erledigtPush = erledigtPush;
        p.ankunft = ankunft;
    });
    // Insert branches at the position where the store used to be
    const idx = cfg.orte.findIndex(o => o.laden === ladenId);
    if (idx < 0) cfg.orte = andere.concat(neu);
    else cfg.orte = cfg.orte.slice(0, idx).filter(o => o.laden !== ladenId).concat(neu, cfg.orte.slice(idx).filter(o => o.laden !== ladenId));
    saveCfg(familyId, cfg);
    const ids = neu.map(p => p.id);
    // Removed and moved branches: start "inside/outside" over
    alt.filter(o => ids.indexOf(o.id) < 0).forEach(o => clearPlaceState(o.id));
    moved.forEach(clearPlaceState);
    return { ok: true, ids: ids };
}
function deletePlace(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    const cfg = loadCfg(familyId);
    const ladenId = cleanId(body.laden);
    if (ladenId) {
        // Shopping list deleted or all addresses removed: delete all branches of this store
        const weg = cfg.orte.filter(x => x.laden === ladenId);
        if (!weg.length) return { ok: true };
        cfg.orte = cfg.orte.filter(x => x.laden !== ladenId);
        saveCfg(familyId, cfg);
        weg.forEach(x => clearPlaceState(x.id));
        return { ok: true };
    }
    const p = cfg.orte.find(x => x.id === cleanId(body.id));
    if (!p) return { ok: true };
    const id = p.id;
    if (p && p.zuhause && homeOf(familyId)) {
        throw new Error("„Zuhause“ kommt aus Einstellungen → Zuhause und lässt sich hier nicht löschen. Die Push-Nachrichten dafür kannst du hier ausschalten.");
    }
    cfg.orte = cfg.orte.filter(x => x.id !== id);
    saveCfg(familyId, cfg);
    return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// "I'm on my way" (way home): push to the family, ends automatically on arriving at home
// ---------------------------------------------------------------------------------------------
function heimwegId(geraetId, seit) { return String(geraetId) + "-" + String(Number(seit || 0)); }
// Ends a running way home and remembers it (for "arrived" in the app). Returns the entry.
function heimwegEnde(cfg, geraetId, grund, now) {
    const u = cfg.unterwegs && cfg.unterwegs[geraetId];
    if (!u) return null;
    const g = cfg.geraete.find(x => x.id === geraetId);
    if (g && u.teilenVorher === false) g.teilen = false;
    if (g && u.seitVorher !== undefined) g.geteiltSeit = Number(u.seitVorher || 0);
    delete cfg.unterwegs[geraetId];
    const h = {
        id: heimwegId(geraetId, u.seit), geraet: geraetId, memberId: g ? g.memberId : "", name: u.name || (g ? g.name : ""),
        seit: Number(u.seit || now), ende: now, grund: grund,
        minuten: Math.max(1, Math.round((now - Number(u.seit || now)) / 60000)),
    };
    if (!Array.isArray(cfg.heimwege)) cfg.heimwege = [];
    cfg.heimwege = cfg.heimwege.filter(x => x.id !== h.id);
    cfg.heimwege.push(h);
    return h;
}
function setUnterwegs(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    if (!familyId || !me) throw new Error("Dein Profil ist mit keinem Familienmitglied verknüpft.");
    const now = Date.now();
    const r = withLock(lockKey(familyId), () => {
        const cfg = loadCfg(familyId);
        let g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy") || cfg.geraete.find(x => x.memberId === me);
        if (!g && body.an) g = ownDevice(cfg, familyId, me, true).g; // without a set-up phone: the location comes from pinn.
        if (!g) return { ok: true };
        const home = cfg.orte.find(o => o.zuhause);
        if (body.an) {
            if (!home) throw new Error("Lege zuerst unter Einstellungen → Zuhause eure Adresse fest.");
            const alt = cfg.unterwegs[g.id];
            if (alt && now - Number(alt.seit || 0) < UNTERWEGS_MAX_MS) return { ok: true, id: heimwegId(g.id, alt.seit) };
            const name = memberName(familyId, me, g.name);
            cfg.unterwegs[g.id] = { seit: now, von: e.auth.id, teilenVorher: g.teilen !== false, seitVorher: Number(g.geteiltSeit || 0), name: name };
            g.teilen = true;
            if (!g.geteiltSeit) g.geteiltSeit = now; // the open pinn. app sends live along the way
            saveCfg(familyId, cfg);
            return { ok: true, id: heimwegId(g.id, now), push: { name: name, geraet: g.id } };
        }
        if (heimwegEnde(cfg, g.id, "beendet", now)) saveCfg(familyId, cfg);
        return { ok: true };
    });
    if (r.push) {
        const name = r.push.name, gid = r.push.geraet;
        usersOfFamily(familyId).filter(u => u.mitglied !== me).forEach(u => {
            sendPush(u.id, {
                titel: "🚶 " + name + " ist unterwegs nach Hause",
                text: "Antippen für Live-Standort, Karte und Anruf. Meldung kommt beim Ankommen.",
                url: "/?heimweg=" + encodeURIComponent(r.id), tag: "ortung-unterwegs-" + gid,
            });
        });
        delete r.push;
    }
    return r;
}

// ---------------------------------------------------------------------------------------------
// Planned shopping trips (from the app): open "plan shopping" tasks with their stores
// ---------------------------------------------------------------------------------------------
function syncPlans(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    const cfg = loadCfg(familyId);
    const fertig = {};
    cfg.erledigt.forEach(x => { fertig[x.aufgabe] = true; });
    const alt = {};
    cfg.plaene.forEach(p => { alt[p.aufgabe] = p; });
    const list = Array.isArray(body && body.plaene) ? body.plaene : [];
    const neu = [];
    list.slice(0, MAX_PLAENE).forEach(p => {
        const aufgabe = cleanId(p && p.aufgabe);
        if (!aufgabe || fertig[aufgabe] || neu.some(x => x.aufgabe === aufgabe)) return;
        const listen = (Array.isArray(p.listen) ? p.listen : []).map(cleanId).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 12);
        if (!listen.length) return;
        const vorher = alt[aufgabe] || {};
        neu.push({
            aufgabe: aufgabe,
            titel: cleanText(p.titel, 120),
            listen: listen,
            besucht: (vorher.besucht && typeof vorher.besucht === "object") ? vorher.besucht : {},
            erinnert: (vorher.erinnert && typeof vorher.erinnert === "object") ? vorher.erinnert : {},
            besucher: vorher.besucher || "",
            minuten: vorher.minuten || 0,
            versuche: vorher.versuche || 0,
            erstellt: vorher.erstellt || Date.now(),
        });
    });
    let changed = JSON.stringify(neu) !== JSON.stringify(cfg.plaene);
    if (changed) cfg.plaene = neu;
    // Open items per list (older app versions send nothing along -> keep the old state)
    if (body && body.offen !== undefined) {
        const offen = cleanOffen(body.offen);
        if (JSON.stringify(offen) !== JSON.stringify(cfg.offen || {})) { cfg.offen = offen; changed = true; }
    }
    if (changed) saveCfg(familyId, cfg);
    return { ok: true, erledigt: cfg.erledigt };
}

// Places (branches) of a store to which a list is attached
function shopPlaces(cfg, listId) { return cfg.orte.filter(o => o.laden === listId); }

// A device stayed in the store long enough: note it in all open plans with this list
function markShopVisit(cfg, o, g, mins, now) {
    let changed = false;
    cfg.plaene.forEach(p => {
        if (p.listen.indexOf(o.laden) < 0 || (p.besucht && p.besucht[o.laden])) return;
        if (!p.besucht) p.besucht = {};
        p.besucht[o.laden] = now;
        p.besucher = g.memberId;
        p.minuten = Math.max(Number(p.minuten || 0), Math.round(mins));
        changed = true;
    });
    return changed;
}

// Tick off plans whose stores (with an address) have all been visited
function completePlans(familyId, cfg, getUsers, now) {
    let changed = false;
    const rest = [];
    cfg.plaene.forEach(p => {
        // one store per list - it is visited as soon as one of its branches has been visited
        const shops = p.listen.map(id => shopPlaces(cfg, id).filter(o => o.abhaken !== false)).filter(g => g.length);
        if (!shops.length || !shops.every(g => p.besucht && p.besucht[g[0].laden])) { rest.push(p); return; }
        const users = getUsers();
        const u = users.find(x => x.mitglied === p.besucher) || users[0] || null;
        try {
            require(`${__hooks}/pinn-aufgaben.js`).setDone(familyId, p.aufgabe, true, u ? u.id : "");
        } catch (err) {
            // Task not (yet) on the server, e.g. created offline -> try again later
            p.versuche = Number(p.versuche || 0) + 1;
            changed = true;
            if (p.versuche < 30) rest.push(p);
            else console.log("[Ortung] Einkauf " + p.aufgabe + " nicht abhakbar: " + err.message);
            return;
        }
        changed = true;
        const geraet = cfg.geraete.find(x => x.memberId === p.besucher);
        const names = shops.map(g => g[0].name).join(", ");
        cfg.erledigt.push({
            aufgabe: p.aufgabe, titel: p.titel || "", zeit: now, memberId: p.besucher || "",
            wer: geraet ? geraet.name : "", listen: shops.map(g => g[0].laden), minuten: p.minuten || 0,
        });
        if (shops.some(g => g.some(o => o.erledigtPush !== false))) {
            users.filter(x => x.mitglied === p.besucher).forEach(x => sendPush(x.id, {
                titel: "✅ Einkauf abgehakt",
                text: (p.titel ? "„" + p.titel + "“" : "Dein Einkauf") + " ist erledigt (" + (p.minuten || 0) + " Min. bei " + names + "). Tippe hier, um den Betrag einzutragen.",
                url: "/?hinweise=1", tag: "einkauf-" + p.aufgabe,
            }));
        }
    });
    if (changed) {
        cfg.plaene = rest;
        const grenze = now - ERLEDIGT_MAX_MS;
        cfg.erledigt = cfg.erledigt.filter(x => Number(x.zeit || 0) > grenze).slice(-30);
    }
    return changed;
}

// ---------------------------------------------------------------------------------------------
// Trail (history) of a device
// ---------------------------------------------------------------------------------------------
function track(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.geraet));
    if (!g || g.teilen === false) return { punkte: [] };
    const hours = num(body.stunden, 1, 48, 6);
    const to = new Date(), from = new Date(Date.now() - hours * 3600 * 1000);
    // Share with a duration: show only the way since switching on
    const ab = Math.max(from.getTime(), Number(g.geteiltSeit || 0) && (g.bis || g.endeZuhause) ? Number(g.geteiltSeit) : 0);
    let pts = ownTrack(g.uniqueId, ab).map(p => [p[0], p[1], p[2]]);
    if (g.traccarId && traccarAn()) {
        let list = [];
        try { list = api("GET", "/api/positions?deviceId=" + Number(g.traccarId) + "&from=" + encodeURIComponent(new Date(ab).toISOString()) + "&to=" + encodeURIComponent(to.toISOString())) || []; } catch (err) { list = []; }
        pts = pts.concat((Array.isArray(list) ? list : [])
            .filter(p => isFinite(p.latitude) && isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0) && !(isFinite(p.accuracy) && p.accuracy > 300))
            .map(p => [Math.round(p.latitude * 1e5) / 1e5, Math.round(p.longitude * 1e5) / 1e5, Date.parse(p.fixTime) || 0]));
        pts.sort((a, b) => a[2] - b[2]);
    }
    if (pts.length > 600) {
        const step = pts.length / 600;
        const slim = [];
        for (let i = 0; i < 600; i++) slim.push(pts[Math.floor(i * step)]);
        slim.push(pts[pts.length - 1]);
        pts = slim;
    }
    return { punkte: pts };
}

// ---------------------------------------------------------------------------------------------
// Address search (Nominatim, via the server)
// ---------------------------------------------------------------------------------------------
function search(q, lat, lon) {
    let url;
    if (q) {
        url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=de&q=" + encodeURIComponent(String(q).slice(0, 160));
    } else if (isFinite(lat) && isFinite(lon)) {
        url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=de&lat=" + Number(lat) + "&lon=" + Number(lon);
    } else return { treffer: [] };
    const key = "pinnOrtungSuche:" + url;
    try { const c = $app.store().get(key); if (c && Date.now() - c.ts < 6 * 3600 * 1000) return c.data; } catch (e) { /* continue */ }
    const res = $http.send({ url: url, method: "GET", headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" }, timeout: 15 });
    if (res.statusCode !== 200) throw new Error("Adresssuche gerade nicht möglich (Status " + res.statusCode + ").");
    const j = parseJson(res);
    const arr = Array.isArray(j) ? j : (j && j.lat ? [j] : []);
    const data = { treffer: arr.slice(0, 6).map(t => ({ name: String(t.display_name || ""), lat: Number(t.lat), lon: Number(t.lon) })).filter(t => isFinite(t.lat) && isFinite(t.lon)) };
    try { $app.store().set(key, { ts: Date.now(), data: data }); } catch (e) { /* ignore */ }
    return data;
}

// ---------------------------------------------------------------------------------------------
// Map tiles (OpenStreetMap) with a cache
// ---------------------------------------------------------------------------------------------
function tile(z, x, y) {
    z = parseInt(z, 10); x = parseInt(x, 10); y = parseInt(String(y).replace(/\.png$/i, ""), 10);
    if (!(z >= 0 && z <= 19)) return null;
    const n = Math.pow(2, z);
    if (!(x >= 0 && x < n && y >= 0 && y < n)) return null;
    const dir = TILE_DIR + "/" + z + "/" + x;
    const path = dir + "/" + y + ".png";
    try {
        const cached = $os.readFile(path);
        if (cached && cached.length > 100) return cached;
    } catch (e) { /* not in the store */ }
    const res = $http.send({ url: "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png", method: "GET", headers: { "User-Agent": UA }, timeout: 15 });
    if (res.statusCode !== 200) return null;
    const bytes = bytesOf(res);
    if (!bytes) return null;
    try { $os.mkdirAll(dir, 493); $os.writeFile(path, bytes, 420); } catch (e) { /* only pass through */ }
    return bytes;
}

// ---------------------------------------------------------------------------------------------
// Reports from the "Traccar Client" app (OsmAnd protocol): store them ourselves, detect SOS and - if
// the container is running - additionally pass them on to Traccar
// ---------------------------------------------------------------------------------------------
// Old app: ?id=...&lat=...&lon=...&timestamp=...&speed=<knots>&bearing=...&accuracy=...&batt=...&charge=true
// New app (JSON): { device_id, location: { timestamp, coords: { latitude, longitude, accuracy,
//                    speed <m/s>, heading }, battery: { level 0-1, is_charging } } }
function osmandPosition(m, raw) {
    let loc = unpack(m.location);
    if (Array.isArray(loc)) loc = loc[loc.length - 1];
    if (!loc || typeof loc !== "object") loc = {};
    const coords = (loc.coords && typeof loc.coords === "object") ? loc.coords : {};
    const bat = (loc.battery && typeof loc.battery === "object") ? loc.battery : {};
    let uid = String(m.id || m.deviceid || m.device_id || m.deviceId || loc.device_id || "").trim();
    if (!uid) {
        const r = /["']?(device_id|deviceid|id)["']?\s*[:=]\s*["']?([A-Za-z0-9._:-]{3,64})/i.exec(String(raw || ""));
        if (r) uid = r[2];
    }
    const lat = firstNum(m.lat, m.latitude, coords.latitude);
    const lon = firstNum(m.lon, m.lng, m.longitude, coords.longitude);
    if (!uid || !isFinite(lat) || !isFinite(lon)) return { uid: uid, pos: null };
    let tempo = NaN;
    if (isFinite(firstNum(coords.speed))) tempo = Number(coords.speed) * 3.6;           // m/s
    else if (isFinite(firstNum(m.speed))) tempo = Number(m.speed) * 1.852;               // Knoten
    let akku = NaN;
    if (isFinite(firstNum(bat.level))) akku = Number(bat.level) <= 1 ? Number(bat.level) * 100 : Number(bat.level);
    else akku = firstNum(m.batt, m.battery, m.batteryLevel);
    const laedt = bat.is_charging === true || /^(true|1)$/i.test(String(m.charge || ""));
    return {
        uid: uid,
        pos: {
            lat: lat, lon: lon, zeit: parseTime(m.timestamp || loc.timestamp),
            genau: firstNum(m.accuracy, coords.accuracy, m.hdop && Number(m.hdop) * 5),
            tempo: isFinite(tempo) && tempo >= 0 ? tempo : NaN,
            kurs: firstNum(m.bearing, m.heading, coords.heading),
            akku: isFinite(akku) && akku >= 0 ? akku : NaN, laedt: laedt,
        },
    };
}
function knownDevice(uid) {
    const key = uidKey(uid);
    if (!key) return null;
    const fam = allCfgs().find(f => f.cfg.geraete.some(g => uidKey(g.uniqueId) === key));
    return fam ? { familyId: fam.familyId, g: fam.cfg.geraete.find(g => uidKey(g.uniqueId) === key) } : null;
}
function forwardOsmand(e) {
    const info = e.requestInfo();
    const params = [];
    const flat = {}; // all passed values (for the SOS detection)
    const q = info.query || {};
    Object.keys(q).forEach(k => {
        const v = q[k];
        const one = Array.isArray(v) ? v[0] : v;
        flat[k] = one;
        params.push(encodeURIComponent(k) + "=" + encodeURIComponent(one));
    });
    let ct = "";
    try { ct = String(e.request.header.get("Content-Type") || "").toLowerCase(); } catch (err) { ct = ""; }
    const body = info.body || {};
    const headers = { "User-Agent": UA };
    let send = "";
    if (ct.indexOf("json") >= 0 && body && Object.keys(body).length) {
        headers["Content-Type"] = "application/json";
        send = JSON.stringify(body);
    } else if (body && typeof body === "object") {
        Object.keys(body).forEach(k => {
            const v = body[k];
            flat[k] = v;
            params.push(encodeURIComponent(k) + "=" + encodeURIComponent(v && typeof v === "object" ? JSON.stringify(v) : v));
        });
    }

    // 0. Store the position ourselves (only for devices that are set up in pinn.)
    let merged = {}, raw = "", sos = false, sosFehler = "", gespeichert = false, bekannt = false;
    try {
        merged = Object.assign({}, flat, (body && typeof body === "object") ? body : {});
        raw = rawRequestText(e, flat, body);
        const op = osmandPosition(merged, raw);
        const dev = op.uid ? knownDevice(op.uid) : null;
        bekannt = !!dev;
        if (dev && op.pos) {
            const n = (v) => isFinite(v) ? v : null;
            // If the person is currently not sharing ("Send permanently" off), the app keeps sending anyway - pinn. then only remembers
            // the latest location (for SOS), shows it to nobody and records no trail.
            saveOwnPosition(dev.g.uniqueId, { lat: op.pos.lat, lon: op.pos.lon, zeit: op.pos.zeit, genau: n(op.pos.genau), tempo: n(op.pos.tempo), kurs: n(op.pos.kurs), akku: n(op.pos.akku), laedt: op.pos.laedt }, "app", dev.g.teilen !== false);
            gespeichert = true;
        }
    } catch (err) {
        console.log("[Ortung] Meldung speichern: " + err.message);
    }

    // 1. Distress call? Trigger it first - independent of whether Traccar is currently responding.
    //    Example (Traccar Client): /?id=123456&lat=49.8728&lon=8.6512&timestamp=1711800000&batt=85&alarm=sos
    try {
        sos = String(flat.alarm || "").trim().toLowerCase() === "sos" || textHasSos(raw) ||
            (() => { try { return hasSos(merged); } catch (err) { return false; } })();
        if (sos) {
            console.log("[Ortung] SOS von Traccar Client empfangen: " + raw.slice(0, 300));
            sosFromOsmand(merged, raw);
        } else if (/alarm|sos/i.test(raw)) {
            console.log("[Ortung] Meldung mit Alarm, aber ohne SOS erkannt: " + raw.slice(0, 300));
        }
    } catch (err) {
        sosFehler = err.message;
        console.log("[Ortung] SOS aus Traccar Client: " + err.message);
    }

    // 2. Additionally pass it on unchanged to Traccar (OsmAnd, port 5055) - only if it is running
    let status = gespeichert ? 200 : 502;
    let weiter = 0;
    if (traccarAn()) {
        const url = osmandUrl() + "/" + (params.length ? "?" + params.join("&") : "");
        try {
            const res = $http.send({ url: url, method: (send || e.request.method === "POST") ? "POST" : "GET", headers: headers, body: send, timeout: 5 });
            weiter = res.statusCode || 0;
            if (!weiter) traccarWeg();
        } catch (err) {
            traccarWeg();
            weiter = 0;
        }
        if (!gespeichert && weiter) status = weiter;
    }
    // Stored (or distress call detected) = arrived. Unknown devices: still 200, otherwise
    // the app buffers the report and sends it again endlessly (costs battery) - a note is written to the log.
    if (status >= 400 && ((sos && !sosFehler) || !bekannt || !traccarAn())) status = 200;
    logOsmand(merged, raw, sos, status, sosFehler || (!bekannt ? "Geräte-ID ist in pinn. nicht eingerichtet" : ""));
    return status;
}

// Does a report from the "Traccar Client" app arrive at the main address ("/" instead of /api/pinn/ortung/osmand)?
// This way it also works if only https://<pinn.> is entered as the server in the app.
function isOsmandRequest(e) {
    try {
        const path = String(e.request.url.path || "");
        if (path !== "/" && path !== "") return false;
        const q = e.request.url.query();
        const id = q.get("id") || q.get("deviceid") || q.get("device_id");
        if (id && (q.get("lat") !== "" || q.get("alarm") !== "" || q.get("latitude") !== "" || q.get("location") !== "")) return true;
        if (e.request.method === "POST") {
            const ct = String(e.request.header.get("Content-Type") || "").toLowerCase();
            if (ct.indexOf("json") >= 0 || ct.indexOf("form") >= 0 || id) return true;
        }
    } catch (err) { /* not a location report */ }
    return false;
}

// ---------------------------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------------------------
function usersOfFamily(familyId) {
    let recs = [];
    try { recs = $app.findRecordsByFilter(USERS, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { recs = []; }
    return recs.filter(r => r.getString("rolle") !== "gast").map(r => ({ id: r.id, mitglied: r.getString("mitglied"), name: r.getString("username") }));
}
// Emergency numbers that a profile has set in pinn. (Settings → Language & region; they are stored
// with the personal design in the profile). Without a setting: Germany (110/112).
function notrufFuer(userId) {
    const ok = v => (typeof v === "string" && /^[0-9]{2,6}$/.test(v)) ? v : "";
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign($app.findRecordById(USERS, userId)).werte || {}; } catch (e) { w = {}; }
    const polizei = ok(w.notrufPolizei) || "110", rettung = ok(w.notrufRettung) || "112", feuer = ok(w.notrufFeuer) || rettung;
    const alle = [polizei, rettung, feuer].filter((x, i, a) => a.indexOf(x) === i);
    return { polizei: polizei, rettung: rettung, feuer: feuer, text: alle.join("/") };
}
function sendPush(userId, msg) {
    try {
        require(`${__hooks}/pinn-push.js`).notifyUser(userId, { titel: msg.titel, text: msg.text, url: msg.url || "/", tag: msg.tag || "", urgency: "high" });
    } catch (e) { console.log("[Ortung] Push fehlgeschlagen: " + e.message); }
}

// ---------------------------------------------------------------------------------------------
// SOS
// ---------------------------------------------------------------------------------------------
function sosAktiv(a) { return !!a && !a.ende && Date.now() - Number(a.zeit || 0) < SOS_AKTIV_MS; }

// alarm=sos anywhere in the report (old app: parameter, new app: JSON, also nested)
function hasSos(obj, depth) {
    depth = depth || 0;
    if (!obj || typeof obj !== "object" || depth > 4) return false;
    return Object.keys(obj).some(k => {
        const v = obj[k];
        const key = String(k).toLowerCase();
        if ((key === "alarm" || key === "event") && typeof v === "string" && /(^|[,;\s])sos($|[,;\s])/i.test(v)) return true;
        if (key === "sos" && (v === true || v === "true" || v === 1 || v === "1")) return true;
        if (v && typeof v === "object") return hasSos(v, depth + 1);
        return false;
    });
}
// The whole report as text (address line + content) - also finds "alarm=sos" in nested fields
// or fields packed as text (e.g. location={"extras":{"alarm":"sos"}})
function rawRequestText(e, flat, body) {
    const parts = [];
    try { parts.push(String(e.request.url.rawQuery || "")); } catch (err) { /* ignore */ }
    try { parts.push(JSON.stringify(flat || {})); } catch (err) { /* ignore */ }
    try { parts.push(JSON.stringify(body || {})); } catch (err) { /* ignore */ }
    let t = parts.join(" ");
    try { t += " " + decodeURIComponent(t.replace(/\+/g, " ")); } catch (err) { /* ignore */ }
    return t;
}
function textHasSos(t) {
    t = String(t || "");
    return /(^|[?&\s{,])["']?(alarm|event|alarmtype)["']?\s*[:=]\s*["']?sos(["'&,}\s]|$)/i.test(t) ||
        /\\?"(alarm|event)\\?"\s*:\s*\\?"sos\\?"/i.test(t);
}
// Unpack fields that arrive as JSON text
function unpack(v) {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t.charAt(0) !== "{" && t.charAt(0) !== "[") return v;
    try { return JSON.parse(t); } catch (e) { return v; }
}
// Log of the latest reports (in memory only) - for Settings → Location
function logOsmand(m, raw, sos, status, fehler) {
    try {
        const store = $app.store();
        let list = [];
        try { list = store.get("pinnOsmandLog") || []; } catch (e) { list = []; }
        const keys = Object.keys(m || {}).slice(0, 25);
        const am = /["']?(alarm|event)["']?\s*[:=]\s*["']?([A-Za-z0-9_-]{1,30})/i.exec(String(raw || ""));
        list.push({
            zeit: Date.now(), uid: String((m && (m.id || m.deviceid || m.device_id || m.deviceId)) || "").slice(0, 64),
            felder: keys.join(", "), alarm: am ? am[1] + "=" + am[2] : "", sos: !!sos, status: status, fehler: fehler || "",
        });
        store.set("pinnOsmandLog", list.slice(-40));
    } catch (e) { /* ignore */ }
}
function firstNum() {
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i];
        if (v === undefined || v === null || v === "") continue;
        const n = Number(v);
        if (isFinite(n)) return n;
    }
    return NaN;
}
function parseTime(v) {
    if (v === undefined || v === null || v === "") return 0;
    const n = Number(v);
    if (isFinite(n) && n > 0) return n < 1e11 ? n * 1000 : n; // seconds or milliseconds
    const t = Date.parse(String(v));
    return isFinite(t) ? t : 0;
}

// Read position and device ID from the report of the "Traccar Client" app
// Compare device IDs tolerantly (spaces, upper/lower case)
function sameUid(a, b) {
    const x = String(a == null ? "" : a).replace(/\s+/g, "").toLowerCase();
    return !!x && x === String(b == null ? "" : b).replace(/\s+/g, "").toLowerCase();
}

function sosFromOsmand(m, raw) {
    let loc = unpack(m.location);
    if (Array.isArray(loc)) loc = loc[loc.length - 1];
    if (!loc || typeof loc !== "object") loc = {};
    const coords = (loc.coords && typeof loc.coords === "object") ? loc.coords : {};
    let uniqueId = String(m.id || m.deviceid || m.device_id || m.deviceId || loc.device_id || "").trim();
    if (!uniqueId) {
        const r = /["']?(device_id|deviceid|id)["']?\s*[:=]\s*["']?([A-Za-z0-9._:-]{3,64})/i.exec(String(raw || ""));
        if (r) uniqueId = r[2];
    }
    if (!uniqueId) throw new Error("SOS ohne Geräte-ID empfangen.");
    const lat = firstNum(m.lat, m.latitude, coords.latitude);
    const lon = firstNum(m.lon, m.lng, m.longitude, coords.longitude);
    const genau = firstNum(m.accuracy, m.hdop && Number(m.hdop) * 5, coords.accuracy);
    const zeit = parseTime(m.timestamp || loc.timestamp) || Date.now();
    let pos = null;
    if (isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0)) {
        pos = { lat: lat, lon: lon, genau: isFinite(genau) ? Math.round(genau) : null, zeit: Math.min(zeit, Date.now()) };
    }
    const fam = allCfgs().find(f => f.cfg.geraete.some(g => sameUid(g.uniqueId, uniqueId)));
    if (!fam) throw new Error("SOS von unbekanntem Gerät „" + uniqueId.slice(0, 40) + "“ – Geräte-ID in Traccar Client und pinn. vergleichen.");
    const g = fam.cfg.geraete.find(x => sameUid(x.uniqueId, uniqueId));
    if (!pos) pos = livePos(g);
    triggerSos(fam.familyId, g.id, pos, "app");
}

function livePos(g) {
    if (!g) return null;
    try {
        const p = posOf(positionsAll(true), g);
        return p ? { lat: p.lat, lon: p.lon, genau: p.genau, zeit: p.zeit, akku: p.akku } : null;
    } catch (e) { return null; }
}

// Short address ("Musterstraße 5, 12345 Musterstadt"), wait 5 seconds at most
function shortAddress(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return "";
    const key = "pinnSosAdr:" + lat.toFixed(4) + "," + lon.toFixed(4);
    try { const c = $app.store().get(key); if (c && Date.now() - c.ts < 6 * 3600 * 1000) return c.name; } catch (e) { /* continue */ }
    let name = "";
    try {
        const res = $http.send({
            url: "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=de&lat=" + Number(lat) + "&lon=" + Number(lon),
            method: "GET", headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" }, timeout: 5,
        });
        if (res.statusCode === 200) {
            const j = parseJson(res) || {};
            const a = j.address || {};
            const strasse = [a.road || a.pedestrian || a.footway || a.path || a.square || a.hamlet || "", a.house_number || ""].filter(Boolean).join(" ");
            const ort = [a.postcode || "", a.city || a.town || a.village || a.municipality || a.suburb || ""].filter(Boolean).join(" ");
            name = [strasse, ort].filter(Boolean).join(", ") || String(j.display_name || "");
        }
    } catch (e) { name = ""; }
    if (name) { try { $app.store().set(key, { ts: Date.now(), name: name }); } catch (e) { /* ignore */ } }
    return name;
}

function memberName(familyId, memberId, fallback) {
    try {
        const lib = require(`${__hooks}/pinn-benutzer.js`);
        const members = (lib.loadFamilyDataFor(familyId) || {}).members || [];
        const m = members.find(x => x.id === memberId);
        if (m && m.name) return String(m.name);
    } catch (e) { /* device name */ }
    return fallback || "Jemand";
}
function hhmm(ms) {
    const t = new Date(ms + tzOffset(ms));
    return ("0" + t.getUTCHours()).slice(-2) + ":" + ("0" + t.getUTCMinutes()).slice(-2);
}

// Triggers an SOS or updates a running one. quelle: "app" | "traccar" | "pinn"
// Returns the ID of the distress call.
// Against duplicate alarms:
//  - Lock per family: passing on (Traccar Client) and the per-minute check (Traccar event) can
//    run at the same time. Without a lock, neither saw the other's distress call and both
//    created their own - with their own push message.
//  - The distress call is saved BEFORE the address is looked up (up to 5 s) and push is sent.
//  - The same report once more (same timestamp of the position): Traccar Client repeats on
//    a bad network or delivers buffered reports later, Traccar additionally reports them as an
//    event and as a position. This also applies after the all-clear - no new alarm.
//  - "anzahl" (the app shows the popup again) only increases if it was really pressed again
//    and therefore a new push message goes out as well.
function triggerSos(familyId, geraetId, pos, quelle) {
    const now = Date.now();
    // Timestamp of the report (not for the SOS button in pinn. - there the last Traccar position
    // can be the same for two distress calls in a row)
    const pz = (quelle !== "pinn" && pos && Number(pos.zeit) > 0) ? Math.round(Number(pos.zeit)) : 0;
    const r = withLock(lockKey(familyId), () => {
        const cfg = loadCfg(familyId);
        const g = cfg.geraete.find(x => x.id === geraetId);
        if (!g) return null;
        if (pz) {
            const bekannt = cfg.sos.find(x => x.geraet === g.id && !x.test && Array.isArray(x.meldungen) && x.meldungen.indexOf(pz) >= 0);
            if (bekannt) return { a: bekannt, g: g, neu: false, erneut: false, gleich: true };
        }
        let a = cfg.sos.find(x => x.geraet === g.id && !x.test && sosAktiv(x));
        let neu = false, erneut = false;
        if (a) {
            // same report via the second way (app directly + Traccar event): only add the location
            const andererWeg = quelle !== a.quelle && now - Number(a.letzte || a.zeit) < SOS_ZUSAMMEN_MS;
            if (!andererWeg) {
                a.letzte = now;
                if (now - Number(a.push || 0) >= SOS_WIEDER_MS) {
                    erneut = true;
                    a.anzahl = Number(a.anzahl || 1) + 1;
                    a.push = now;
                }
            }
            if (pos && (!a.pos || Number(pos.zeit || 0) >= Number(a.pos.zeit || 0))) a.pos = pos;
        } else {
            a = {
                id: newId(), geraet: g.id, memberId: g.memberId, name: memberName(familyId, g.memberId, g.name),
                zeit: now, letzte: now, pos: pos || null, adresse: "", quelle: quelle, anzahl: 1, push: now,
            };
            cfg.sos.push(a);
            neu = true;
        }
        if (pz) a.meldungen = (Array.isArray(a.meldungen) ? a.meldungen : []).concat([pz]).slice(-20);
        saveCfg(familyId, cfg);
        return { a: JSON.parse(JSON.stringify(a)), g: g, neu: neu, erneut: erneut, gleich: false };
    });
    if (!r) return "";
    const a = r.a, g = r.g, neu = r.neu, erneut = r.erneut;
    console.log("[Ortung] SOS " + (r.gleich ? "– dieselbe Meldung noch einmal, ignoriert" : neu ? "ausgelöst" : erneut ? "erneut gedrückt" : "aktualisiert") + " (" + quelle + ", Familie " + familyId + ")");
    if (r.gleich) return a.id;

    // Address only now (the distress call is already saved) and add it
    if ((neu || erneut || !a.adresse) && a.pos && isFinite(a.pos.lat)) {
        const adr = shortAddress(Number(a.pos.lat), Number(a.pos.lon));
        if (adr && adr !== a.adresse) {
            a.adresse = adr;
            try {
                withLock(lockKey(familyId), () => {
                    const c = loadCfg(familyId);
                    const x = c.sos.find(y => y.id === a.id);
                    if (x) { x.adresse = adr; saveCfg(familyId, c); }
                });
            } catch (e) { console.log("[Ortung] SOS-Adresse speichern: " + e.message); }
        }
    }
    if (!neu && !erneut) return a.id;

    const name = a.name || g.name;
    const wo = a.pos
        ? (a.adresse || ("Standort " + Number(a.pos.lat).toFixed(5) + ", " + Number(a.pos.lon).toFixed(5))) +
          " · " + hhmm(Number(a.pos.zeit || now)) + " Uhr" + (a.pos.genau ? " (± " + a.pos.genau + " m)" : "")
        : "Standort noch unbekannt · " + hhmm(now) + " Uhr";
    const users = usersOfFamily(familyId);
    let erreicht = 0;
    users.filter(u => u.mitglied !== g.memberId).forEach(u => {
        erreicht += sendSosPush(u.id, {
            titel: "🆘 " + (erneut ? "Erneuter Hilferuf: " : "SOS: ") + name + " braucht Hilfe!",
            text: wo + ". Tippe für Karte, Anruf und Notruf " + notrufFuer(u.id).text + ".",
            url: "/?sos=" + encodeURIComponent(a.id), tag: "sos-" + a.id,
        });
    });
    users.filter(u => u.mitglied === g.memberId).forEach(u => sendSosPush(u.id, {
        titel: "🆘 Dein Hilferuf wurde gesendet",
        text: erreicht ? "Deine Familie wurde alarmiert (" + erreicht + " Gerät" + (erreicht === 1 ? "" : "e") + ") und sieht deinen Standort." : "Kein Gerät deiner Familie ist für Push angemeldet – bitte zusätzlich anrufen (" + notrufFuer(u.id).text + ").",
        url: "/?sos=" + encodeURIComponent(a.id), tag: "sos-" + a.id,
    }));
    return a.id;
}
function sendSosPush(userId, msg) {
    try {
        return require(`${__hooks}/pinn-push.js`).notifyUser(userId, { titel: msg.titel, text: msg.text, url: msg.url, tag: msg.tag, urgency: "high" }) || 0;
    } catch (e) { console.log("[Ortung] SOS-Push fehlgeschlagen: " + e.message); return 0; }
}

// Safety net: alarm events "sos" from Traccar (sent directly or GPS tracker)
function checkSosEvents() {
    if (!traccarAn()) return;
    const fams = allCfgs().filter(f => f.cfg.geraete.some(g => g.traccarId));
    if (!fams.length) return;
    const byTraccar = {};
    fams.forEach(f => f.cfg.geraete.forEach(g => { if (g.traccarId) byTraccar[g.traccarId] = { familyId: f.familyId, g: g }; }));
    const ids = Object.keys(byTraccar);
    const now = Date.now();
    const from = new Date(now - SOS_EREIGNIS_MAX_MS).toISOString(), to = new Date(now + 60 * 1000).toISOString();
    let list = [];
    try {
        list = api("GET", "/api/reports/events?" + ids.map(id => "deviceId=" + Number(id)).join("&") + "&type=alarm&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to)) || [];
    } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    const st = readJsonFile(STATUS_FILE) || {};
    let changed = false;
    // Additionally: the latest position of a device carries alarm=sos (in case Traccar does not create an event)
    let positions = [];
    try { positions = positionsAll(true); } catch (e) { positions = []; }
    positions.forEach(p => {
        // Age since arrival at Traccar - the phone's GPS time can be minutes old indoors
        if (!/sos/i.test(p.alarm || "") || now - (p.server || p.zeit) > SOS_EREIGNIS_MAX_MS) return;
        const hit = byTraccar[p.traccarId];
        if (!hit) return;
        const key = "sosev|p" + p.traccarId + "-" + p.zeit;
        if (st[key]) return;
        st[key] = now;
        changed = true;
        try { triggerSos(hit.familyId, hit.g.id, { lat: p.lat, lon: p.lon, genau: p.genau, zeit: p.zeit, akku: p.akku }, "traccar"); } catch (e) { console.log("[Ortung] SOS auslösen: " + e.message); }
    });
    list.forEach(ev => {
        const attr = ev && ev.attributes ? ev.attributes : {};
        if (!/sos/i.test(String(attr.alarm || ""))) return;
        const key = "sosev|" + ev.id;
        if (st[key]) return;
        st[key] = now;
        changed = true;
        const t = Date.parse(ev.eventTime || ev.serverTime || "") || now;
        if (now - t > SOS_EREIGNIS_MAX_MS) return;
        const hit = byTraccar[ev.deviceId];
        if (!hit) return;
        let pos = null;
        if (ev.positionId) {
            try {
                const ps = api("GET", "/api/positions?id=" + Number(ev.positionId)) || [];
                const p = Array.isArray(ps) ? ps[0] : null;
                if (p && isFinite(p.latitude) && !(p.latitude === 0 && p.longitude === 0)) {
                    pos = { lat: Number(p.latitude), lon: Number(p.longitude), genau: isFinite(p.accuracy) && Number(p.accuracy) > 0 ? Math.round(Number(p.accuracy)) : null, zeit: Date.parse(p.fixTime || p.deviceTime || "") || t };
                }
            } catch (e) { pos = null; }
        }
        if (!pos) pos = livePos(hit.g);
        try { triggerSos(hit.familyId, hit.g.id, pos, "traccar"); } catch (e) { console.log("[Ortung] SOS auslösen: " + e.message); }
    });
    // remove old markers
    Object.keys(st).forEach(k => {
        if (k.indexOf("sosev|") === 0 && now - Number(st[k] || 0) > 60 * 60 * 1000) { delete st[k]; changed = true; }
    });
    if (changed) writeJsonFile(STATUS_FILE, st);
}

// SOS button in pinn. (way-home popup "I'm on my way"): triggers the same alarm for the own
// device as the SOS button in "Traccar Client". Location: last Traccar position or - if
// sent along and at least as usable - the location from the browser.
function sosAusloesen(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    const nr = e.auth ? notrufFuer(e.auth.id).text : "110/112";
    if (!familyId || !me) throw new Error("Dein Profil ist mit keinem Familienmitglied verknüpft – bitte direkt anrufen (" + nr + ").");
    let cfg = loadCfg(familyId);
    let g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy") || cfg.geraete.find(x => x.memberId === me);
    if (!g) {
        // no phone set up yet: create it now (without Traccar) - the alarm must not fail because of that
        try {
            g = withLock(lockKey(familyId), () => {
                const c = loadCfg(familyId);
                const d = ownDevice(c, familyId, me, true);
                if (d.neu) saveCfg(familyId, c);
                return d.g;
            });
            cfg = loadCfg(familyId);
        } catch (err) { g = null; }
    }
    if (!g) throw new Error("Für dich ist noch kein Gerät für die Ortung eingerichtet – bitte direkt anrufen (" + nr + ").");
    const now = Date.now();
    let pos = livePos(g);
    const lat = Number(body && body.lat), lon = Number(body && body.lon);
    if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) {
        const gn = Number(body.genau);
        const bp = { lat: lat, lon: lon, genau: isFinite(gn) && gn > 0 ? Math.round(gn) : null, zeit: now };
        const traccarBesser = pos && now - Number(pos.zeit || 0) < 2 * 60 * 1000 && bp.genau && pos.genau && bp.genau > 100 && bp.genau > pos.genau * 3;
        if (!traccarBesser) pos = bp;
    }
    const id = triggerSos(familyId, g.id, pos, "pinn");
    if (!id) throw new Error("Der Alarm konnte nicht ausgelöst werden – bitte direkt anrufen (" + nr + ").");
    return { ok: true, id: id };
}

// For the app: running and just finished SOS of the own family, with the current location -
// plus the running ways home (and those finished in the last hour)
function sosList(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const out = { sos: [], heimwege: [], jetzt: Date.now() };
    if (!familyId) return out;
    const cfg = loadCfg(familyId);
    const now = Date.now();
    const zeigen = cfg.sos.filter(a => (!a.test || a.test === e.auth.id) && (sosAktiv(a) || (a.ende && now - Number(a.ende.zeit || 0) < 60 * 60 * 1000)));
    const hwAktiv = Object.keys(cfg.unterwegs || {}).filter(k => {
        const u = cfg.unterwegs[k];
        return u && now - Number(u.seit || 0) < UNTERWEGS_MAX_MS && cfg.geraete.some(g => g.id === k);
    });
    const hwEnde = (cfg.heimwege || []).filter(h => h.grund !== "abgelaufen" && now - Number(h.ende || 0) < HEIMWEG_ZEIGEN_MS && !hwAktiv.some(k => heimwegId(k, cfg.unterwegs[k].seit) === h.id));
    try { out.laeden = laedenHier(familyId, cfg, memberOf(e), now); } catch (err) { out.laeden = []; }
    if (!zeigen.length && !hwAktiv.length && !hwEnde.length) return out;
    let positions = [];
    if (zeigen.some(sosAktiv) || hwAktiv.length) { try { positions = positionsAll(false); } catch (err) { positions = []; } }
    zeigen.forEach(a => {
        const g = cfg.geraete.find(x => x.id === a.geraet);
        const row = {
            id: a.id, geraet: a.geraet, memberId: a.memberId, name: a.name || (g ? g.name : ""),
            zeit: a.zeit, letzte: a.letzte || a.zeit, anzahl: a.anzahl || 1, quelle: a.quelle,
            pos: a.pos || null, adresse: a.adresse || "", ende: a.ende || null, aktiv: sosAktiv(a),
        };
        if (row.aktiv && g) {
            const p = posOf(positions, g);
            if (p && (!a.pos || p.zeit > Number(a.pos.zeit || 0))) {
                const akt = { lat: p.lat, lon: p.lon, genau: p.genau, zeit: p.zeit, akku: p.akku, tempo: p.tempo, adresse: "" };
                if (a.pos && distM(p.lat, p.lon, Number(a.pos.lat), Number(a.pos.lon)) < 25) akt.adresse = a.adresse || "";
                else akt.adresse = currentAddress(a.id, p.lat, p.lon);
                row.aktuell = akt;
            }
        }
        out.sos.push(row);
    });
    const home = cfg.orte.find(o => o.zuhause) || null;
    if (home) out.zuhause = { lat: Number(home.lat), lon: Number(home.lon), radius: Number(home.radius || 150) };
    hwAktiv.forEach(k => {
        const u = cfg.unterwegs[k];
        const g = cfg.geraete.find(x => x.id === k);
        const row = {
            id: heimwegId(k, u.seit), geraet: k, memberId: g.memberId, name: u.name || g.name,
            seit: Number(u.seit), aktiv: true, aktuell: null, entfernung: null,
        };
        const p = posOf(positions, g);
        if (p && Number(p.zeit || 0) > Number(u.seit) - 30 * 60 * 1000) {
            row.aktuell = { lat: p.lat, lon: p.lon, genau: p.genau, zeit: p.zeit, akku: p.akku, laedt: p.laedt, tempo: p.tempo, adresse: currentAddress("hw-" + k, p.lat, p.lon) };
            if (home) row.entfernung = Math.round(distM(p.lat, p.lon, Number(home.lat), Number(home.lon)));
        }
        out.heimwege.push(row);
    });
    hwEnde.forEach(h => out.heimwege.push({
        id: h.id, geraet: h.geraet, memberId: h.memberId, name: h.name || "",
        seit: h.seit, ende: h.ende, grund: h.grund, minuten: h.minuten, aktiv: false,
    }));
    return out;
}
// Stores within whose radius the own phone currently is (state of the per-minute schedule) - for the
// shopping notice at the top of the app. Only as long as the last position is fresh enough.
function laedenHier(familyId, cfg, me, now) {
    if (!me) return [];
    const shops = cfg.orte.filter(o => o.laden && o.erinnern !== false);
    if (!shops.length) return [];
    const mine = cfg.geraete.filter(g => g.memberId === me && g.teilen !== false);
    if (!mine.length) return [];
    const st = readJsonFile(STATUS_FILE) || {};
    const out = [];
    mine.forEach(g => {
        const pz = Number(st["pos|" + familyId + "|" + g.id] || 0);
        if (!pz || now - pz > LADEN_HIER_MAX_MS) return;
        shops.forEach(o => {
            if (st["in|" + familyId + "|" + g.id + "|" + o.id] !== 1) return;
            if (out.some(x => x.laden === o.laden)) return;
            out.push({ laden: o.laden, ort: o.id, name: o.name || "", seit: Number(st["seit|" + familyId + "|" + g.id + "|" + o.id] || 0) });
        });
    });
    return out;
}
// Address of the current location: only look it up again if the person has moved (spares Nominatim)
function currentAddress(sosId, lat, lon) {
    const key = "pinnSosAkt:" + sosId;
    let c = null;
    try { c = $app.store().get(key); } catch (e) { c = null; }
    if (c && (distM(lat, lon, c.lat, c.lon) < 30 || Date.now() - c.ts < 20000)) return c.name;
    const name = shortAddress(lat, lon) || (c ? c.name : "");
    try { $app.store().set(key, { lat: lat, lon: lon, name: name, ts: Date.now() }); } catch (e) { /* ignore */ }
    return name;
}

// Log of the latest reports of the own devices (admins only)
function osmandLog(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId || !lib.isAdmin(e)) throw new Error("Nur Admins der Familie.");
    const cfg = loadCfg(familyId);
    const uids = cfg.geraete.map(g => g.uniqueId);
    let list = [];
    try { list = $app.store().get("pinnOsmandLog") || []; } catch (err) { list = []; }
    const out = list.filter(x => uids.indexOf(x.uid) >= 0 || (x.sos && !x.uid) || (x.fehler && x.sos)).slice(-20).reverse().map(x => {
        const g = cfg.geraete.find(d => d.uniqueId === x.uid);
        return Object.assign({}, x, { geraet: g ? g.id : "", name: g ? g.name : "" });
    });
    return { meldungen: out, jetzt: Date.now() };
}

// SOS test (admins only): same procedure as a real distress call, but push and popup only for me
function sosTest(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId || !lib.isAdmin(e)) throw new Error("Nur Admins der Familie.");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.geraet)) || cfg.geraete[0];
    if (!g) throw new Error("Noch kein Gerät eingerichtet.");
    const pos = livePos(g);
    const now = Date.now();
    const a = {
        id: newId(), geraet: g.id, memberId: g.memberId, name: memberName(familyId, g.memberId, g.name) + " (Test)",
        zeit: now, letzte: now, pos: pos, adresse: pos ? shortAddress(pos.lat, pos.lon) : "", quelle: "test", anzahl: 1, push: now, test: e.auth.id,
    };
    cfg.sos.push(a);
    saveCfg(familyId, cfg);
    const wo = pos ? (a.adresse || "Standort bekannt") + " · " + hhmm(Number(pos.zeit || now)) + " Uhr" + (pos.genau ? " (± " + pos.genau + " m)" : "") : "Standort noch unbekannt";
    const n = sendSosPush(e.auth.id, {
        titel: "🆘 TEST: " + a.name + " braucht Hilfe!",
        text: wo + ". Nur ein Test – nur du bekommst diese Meldung.",
        url: "/?sos=" + encodeURIComponent(a.id), tag: "sos-" + a.id,
    });
    return { ok: true, id: a.id, push: n };
}

// All-clear (every family member except guest accounts): push to all
function sosEnde(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Keine Familie.");
    let wer = e.auth.getString("username");
    const me = memberOf(e);
    if (me) wer = memberName(familyId, me, wer);
    const a = withLock(lockKey(familyId), () => {
        const cfg = loadCfg(familyId);
        const x = cfg.sos.find(y => y.id === cleanId(body.id));
        if (!x) throw new Error("Dieser Hilferuf ist nicht mehr vorhanden.");
        if (!sosAktiv(x)) return null;
        x.ende = { zeit: Date.now(), wer: wer, von: e.auth.id };
        saveCfg(familyId, cfg);
        return x;
    });
    if (!a) return { ok: true };
    const name = a.name || "Der Hilferuf";
    usersOfFamily(familyId).filter(u => !a.test || u.id === a.test).forEach(u => sendSosPush(u.id, {
        titel: "✅ Entwarnung: " + name,
        text: wer + " hat den Hilferuf von " + hhmm(Number(a.zeit)) + " Uhr beendet.",
        url: "/?sos=" + encodeURIComponent(a.id), tag: "sos-" + a.id,
    }));
    return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Schedule (every minute): arriving at / leaving places, way home
// ---------------------------------------------------------------------------------------------
// If the previous run is still going (slow push delivery, Traccar, address search), this one is
// skipped. Otherwise two runs see the same arrival and send the message twice.
// ---------------------------------------------------------------------------------------------
// "Are you going shopping?" - push on arriving at the store (in the profile's language)
// ---------------------------------------------------------------------------------------------
function langOfUser(userId) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign($app.findRecordById(USERS, userId)).werte || {}; } catch (e) { w = {}; }
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
const LADEN_TEXT = {
    de: { bei: "Du bist bei {laden}", frage: "gehst du einkaufen?", artikel1: "1 Artikel auf der Liste", artikel: "{n} Artikel auf der Liste",
          geplant: "Geplant: {titel}", tipp1: "Tippe hier für die Einkaufsliste.", tippN: "Tippe hier für die Einkaufslisten.", und: " und " },
    en: { bei: "You're at {laden}", frage: "going shopping?", artikel1: "1 item on the list", artikel: "{n} items on the list",
          geplant: "Planned: {titel}", tipp1: "Tap here for the shopping list.", tippN: "Tap here for the shopping lists.", und: " and " },
    fr: { bei: "Tu es chez {laden}", frage: "tu fais les courses ?", artikel1: "1 article sur la liste", artikel: "{n} articles sur la liste",
          geplant: "Prévu : {titel}", tipp1: "Touche ici pour la liste de courses.", tippN: "Touche ici pour les listes de courses.", und: " et " },
    es: { bei: "Estás en {laden}", frage: "¿vas a hacer la compra?", artikel1: "1 artículo en la lista", artikel: "{n} artículos en la lista",
          geplant: "Planeado: {titel}", tipp1: "Toca aquí para la lista de la compra.", tippN: "Toca aquí para las listas de la compra.", und: " y " },
    it: { bei: "Sei da {laden}", frage: "vai a fare la spesa?", artikel1: "1 articolo nella lista", artikel: "{n} articoli nella lista",
          geplant: "Previsto: {titel}", tipp1: "Tocca qui per la lista della spesa.", tippN: "Tocca qui per le liste della spesa.", und: " e " },
    pt: { bei: "Você está em {laden}", frage: "vai fazer compras?", artikel1: "1 item na lista", artikel: "{n} itens na lista",
          geplant: "Planejado: {titel}", tipp1: "Toque aqui para ver a lista de compras.", tippN: "Toque aqui para ver as listas de compras.", und: " e " },
    zh: { bei: "你在 {laden}", frage: "要去购物吗？", artikel1: "清单上有 1 项", artikel: "清单上有 {n} 项",
          geplant: "已计划：{titel}", tipp1: "点按这里查看购物清单。", tippN: "点按这里查看购物清单。", und: "和" },
    ja: { bei: "{laden}にいます", frage: "買い物しますか？", artikel1: "リストに1件", artikel: "リストに{n}件",
          geplant: "予定：{titel}", tipp1: "タップすると買い物リストを開きます。", tippN: "タップすると買い物リストを開きます。", und: "と" },
    ko: { bei: "{laden}에 있어요", frage: "장 볼까요?", artikel1: "목록에 1개", artikel: "목록에 {n}개",
          geplant: "계획: {titel}", tipp1: "여기를 탭하면 장보기 목록이 열려요.", tippN: "여기를 탭하면 장보기 목록이 열려요.", und: ", " },
    ru: { bei: "Вы здесь: {laden}", frage: "идёте за покупками?", artikel1: "в списке 1 позиция", artikel: "в списке позиций: {n}",
          geplant: "Запланировано: {titel}", tipp1: "Нажмите, чтобы открыть список покупок.", tippN: "Нажмите, чтобы открыть списки покупок.", und: " и " },
    nl: { bei: "Je bent bij {laden}", frage: "ga je boodschappen doen?", artikel1: "1 artikel op de lijst", artikel: "{n} artikelen op de lijst",
          geplant: "Gepland: {titel}", tipp1: "Tik hier voor de boodschappenlijst.", tippN: "Tik hier voor de boodschappenlijsten.", und: " en " },
};
function ladenPushText(lang, items, geraetId) {
    const T = LADEN_TEXT[lang] || LADEN_TEXT.en;
    const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : ""));
    const namen = items.map(x => x.o.name || "");
    const nameText = namen.length > 1 ? namen.slice(0, -1).join(", ") + T.und + namen[namen.length - 1] : namen[0];
    const titel = "🛒 " + fill(T.bei, { laden: nameText }) + " – " + T.frage;
    if (items.length === 1) {
        const x = items[0];
        const teile = [];
        if (x.anzahl > 0) teile.push(x.anzahl === 1 ? T.artikel1 : fill(T.artikel, { n: x.anzahl }));
        if (x.plan && x.plan.titel) teile.push(fill(T.geplant, { titel: x.plan.titel }));
        return {
            titel: titel,
            text: (teile.length ? teile.join(" · ") + ". " : "") + T.tipp1,
            url: "/?liste=" + encodeURIComponent(x.o.laden), tag: "laden-" + geraetId,
        };
    }
    const teile = items.filter(x => x.anzahl > 0).map(x => (x.o.name || "") + " " + x.anzahl);
    return {
        titel: titel,
        text: (teile.length ? teile.join(" · ") + ". " : "") + T.tippN,
        url: "/?einkauf=1", tag: "laden-" + geraetId,
    };
}

function runCron() {
    let store = null;
    try { store = $app.store(); } catch (e) { store = null; }
    if (store) {
        let t = 0;
        try { t = Number(store.get(CRON_LOCK) || 0); } catch (e) { t = 0; }
        if (t && Date.now() - t < CRON_LOCK_MS) { console.log("[Ortung] Zeitplan läuft noch – Durchgang ausgelassen."); return; }
        try { store.set(CRON_LOCK, Date.now()); } catch (e) { /* ignore */ }
    }
    try {
        runCronInner();
    } finally {
        if (store) { try { store.remove(CRON_LOCK); } catch (e) { /* ignore */ } }
    }
}

// Saves what the schedule changed on the CURRENT state. The schedule read the data at the
// start; a distress call, a way home that was just started or ended, new places or plans
// from the meantime must not be overwritten in the process.
function saveCronCfg(familyId, cfg, beendet, planIdsVorher, freigabeEnde) {
    withLock(lockKey(familyId), () => {
        const cur = loadCfg(familyId);
        // Share "until I am home" ended (only if it has not been switched on again in the meantime)
        (freigabeEnde || []).forEach(b => {
            const g = cur.geraete.find(x => x.id === b.k);
            if (!g || !g.endeZuhause || Number(g.geteiltSeit || 0) !== b.seit) return;
            g.teilen = false; g.bis = 0; g.endeZuhause = false; g.geteiltSeit = 0;
        });
        // ways home ended by the schedule (only if not restarted in the meantime)
        beendet.forEach(b => {
            const u = cur.unterwegs[b.k];
            if (!u) return;
            if (b.seit !== null && Number(u.seit) !== b.seit) return;
            const g = cur.geraete.find(x => x.id === b.k);
            if (g && u.teilenVorher === false) g.teilen = false;
            if (g && u.seitVorher !== undefined) g.geteiltSeit = Number(u.seitVorher || 0);
            delete cur.unterwegs[b.k];
        });
        const curIds = {};
        cur.heimwege.forEach(h => { curIds[h.id] = true; });
        cfg.heimwege.forEach(h => {
            if (curIds[h.id]) return;
            const u = cur.unterwegs[h.geraet];
            if (u && heimwegId(h.geraet, u.seit) === h.id) return;
            cur.heimwege.push(h);
        });
        // Plans: state of the schedule (visited, reminded ...), remove ticked-off ones, keep new ones from the app
        const jetzt = {};
        cfg.plaene.forEach(p => { jetzt[p.aufgabe] = p; });
        const entfernt = {};
        planIdsVorher.forEach(id => { if (!jetzt[id]) entfernt[id] = true; });
        cur.plaene = cur.plaene.filter(p => !entfernt[p.aufgabe]).map(p => jetzt[p.aufgabe] || p);
        const erl = {};
        cur.erledigt.forEach(x => { erl[x.aufgabe] = true; });
        cfg.erledigt.forEach(x => { if (!erl[x.aufgabe]) cur.erledigt.push(x); });
        saveCfg(familyId, cur);
    });
}

function runCronInner() {
    try { checkSosEvents(); } catch (e) { console.log("[Ortung] SOS-Prüfung: " + e.message); }
    const alle = allCfgs();
    try { expireShares(alle, Date.now()); } catch (e) { console.log("[Ortung] Freigaben: " + e.message); }
    const fams = alle.filter(f => f.cfg.geraete.length && (f.cfg.orte.length || Object.keys(f.cfg.unterwegs || {}).length));
    if (!fams.length) return;
    let positions;
    try { positions = positionsAll(true); } catch (e) { return; }
    const st = readJsonFile(STATUS_FILE) || {};
    let stChanged = false;
    const now = Date.now();

    fams.forEach(f => {
        const familyId = f.familyId, cfg = f.cfg;
        let cfgChanged = false;
        const planIdsVorher = cfg.plaene.map(p => p.aufgabe);
        const beendet = []; // { k: device ID, seit } - ways home ended by the schedule
        const freigabeEnde = []; // { k: device ID, seit } - share "until I am home" ended
        let users = null;
        const getUsers = () => users || (users = usersOfFamily(familyId));

        // End expired ways home
        Object.keys(cfg.unterwegs || {}).forEach(k => {
            const u = cfg.unterwegs[k];
            if (!u || now - Number(u.seit || 0) > UNTERWEGS_MAX_MS || !cfg.geraete.some(g => g.id === k)) {
                beendet.push({ k: k, seit: u ? Number(u.seit) : null });
                if (u && cfg.geraete.some(g => g.id === k)) heimwegEnde(cfg, k, "abgelaufen", now);
                else delete cfg.unterwegs[k];
                cfgChanged = true;
            }
        });

        cfg.geraete.forEach(g => {
            if (g.teilen === false) return;
            const p = posOf(positions, g);
            if (!p || now - p.zeit > EVENT_MAX_AGE_MS) return;
            if (p.genau !== null && p.genau > 500) return;
            const posKey = "pos|" + familyId + "|" + g.id;
            const neu = !(st[posKey] && st[posKey] >= p.zeit);
            if (neu) {
                st[posKey] = p.zeit;
                stChanged = true;
                const unterwegs = cfg.unterwegs && cfg.unterwegs[g.id];
                const imLaden = []; // just arrived: stores with an open list or a planned shopping trip
                cfg.orte.forEach(o => {
                    const key = "in|" + familyId + "|" + g.id + "|" + o.id;
                    const seitKey = "seit|" + familyId + "|" + g.id + "|" + o.id;
                    const dwKey = "dw|" + familyId + "|" + g.id + "|" + o.id;
                    const d = distM(p.lat, p.lon, Number(o.lat), Number(o.lon));
                    const r = Number(o.radius || 150);
                    const puffer = 40 + Math.min(p.genau || 0, 120) * 0.5;
                    const prev = st[key];
                    let inside = prev;
                    if (d <= r) inside = 1;
                    // Leaving only if the position is surely outside even with its inaccuracy -
                    // an inaccurate outlier (e.g. ± 300 m inside the house) would otherwise trigger "left" and right
                    // after it a second "arrived"
                    else if (d > r + puffer && (!p.genau || d - p.genau > r)) inside = 0;
                    if (inside === undefined || inside === prev) return;
                    st[key] = inside;
                    // Dwell time (stores only): remember the start or reset on leaving
                    if (o.laden) {
                        if (inside === 1) st[seitKey] = p.zeit;
                        else { delete st[seitKey]; delete st[dwKey]; }
                    }
                    if (prev === undefined) return; // first observation: only remember
                    // Share "until I am home": ends on arrival (not during a way home -
                    // that ends itself there and restores the share)
                    if (inside === 1 && o.zuhause && g.endeZuhause && g.teilen !== false && !(cfg.unterwegs && cfg.unterwegs[g.id])) {
                        freigabeEnde.push({ k: g.id, seit: Number(g.geteiltSeit || 0) });
                        g.endeZuhause = false;
                        cfgChanged = true;
                        getUsers().filter(u => u.mitglied === g.memberId).forEach(u => sendPush(u.id, {
                            titel: "🏠 Willkommen zu Hause",
                            text: "Deine Standortfreigabe ist beendet.",
                            url: "/?familie=" + encodeURIComponent(g.memberId), tag: "ortung-teilen-" + g.id,
                        }));
                    }
                    // Store: "Are you going shopping?" as soon as the list has something on it or a shopping trip
                    // is planned there (collected - several stores nearby = one message, see below)
                    if (inside === 1 && o.laden && o.erinnern !== false && !imLaden.some(x => x.o.laden === o.laden)) {
                        const plan = cfg.plaene.find(x => x.listen.indexOf(o.laden) >= 0 && !(x.besucht && x.besucht[o.laden]));
                        const anzahl = Number((cfg.offen || {})[o.laden] || 0);
                        const planNeu = !!plan && !(plan.erinnert && plan.erinnert[o.laden]);
                        const lpKey = "lp|" + familyId + "|" + g.id + "|" + o.laden;
                        if ((anzahl > 0 || planNeu) && now - Number(st[lpKey] || 0) >= LADEN_PUSH_PAUSE_MS) {
                            st[lpKey] = now;
                            stChanged = true;
                            if (plan) {
                                if (!plan.erinnert) plan.erinnert = {};
                                plan.erinnert[o.laden] = now;
                                cfgChanged = true;
                            }
                            imLaden.push({ o: o, anzahl: anzahl, plan: plan || null });
                        }
                    }
                    const watched = !Array.isArray(o.geraete) || !o.geraete.length || o.geraete.indexOf(g.id) >= 0;
                    const ankKey = "ank|" + familyId + "|" + g.id + "|" + o.id;
                    const wegKey = "weg|" + familyId + "|" + g.id + "|" + o.id;
                    // Way home ended
                    if (inside === 1 && o.zuhause && unterwegs && cfg.unterwegs[g.id]) {
                        beendet.push({ k: g.id, seit: Number(unterwegs.seit) });
                        const hw = heimwegEnde(cfg, g.id, "angekommen", now);
                        const mins = hw ? hw.minuten : 1;
                        const wer = (hw && hw.name) || g.name;
                        cfgChanged = true;
                        // the normal "arrived at home" message is dropped (otherwise it would come twice)
                        st[ankKey] = now;
                        stChanged = true;
                        getUsers().filter(u => u.mitglied !== g.memberId).forEach(u => sendPush(u.id, {
                            titel: "🏠 " + wer + " ist zu Hause angekommen",
                            text: "Heimweg beendet (" + (mins >= 60 ? Math.floor(mins / 60) + " Std. " + (mins % 60) + " Min." : mins + " Min.") + ").",
                            url: hw ? "/?heimweg=" + encodeURIComponent(hw.id) : "/?familie=" + encodeURIComponent(g.memberId),
                            tag: "ortung-unterwegs-" + g.id,
                        }));
                        return;
                    }
                    if (!watched) return;
                    if ((inside === 1 && !o.ankunft) || (inside === 0 && !o.verlassen)) return;
                    if (inside === 1) {
                        // just reported (way-home arrival or a short GPS jump out and back)
                        if (now - Number(st[ankKey] || 0) < PUSH_PAUSE_MS) return;
                        st[ankKey] = now;
                    } else {
                        if (now - Number(st[ankKey] || 0) < SPRUNG_MS) return;
                        if (now - Number(st[wegKey] || 0) < PUSH_PAUSE_MS) return;
                        st[wegKey] = now;
                    }
                    stChanged = true;
                    const text = inside === 1
                        ? (o.zuhause ? g.name + " ist zu Hause angekommen." : g.name + " ist bei „" + o.name + "“ angekommen.")
                        : (o.zuhause ? g.name + " hat das Zuhause verlassen." : g.name + " hat „" + o.name + "“ verlassen.");
                    const time = new Date(p.zeit + tzOffset(p.zeit));
                    const hhmm = ("0" + time.getUTCHours()).slice(-2) + ":" + ("0" + time.getUTCMinutes()).slice(-2);
                    getUsers()
                        .filter(u => u.mitglied !== g.memberId)
                        .filter(u => !Array.isArray(o.empfaenger) || !o.empfaenger.length || o.empfaenger.indexOf(u.id) >= 0)
                        .forEach(u => sendPush(u.id, {
                            titel: (o.emoji || "📍") + " " + o.name,
                            text: text + " (" + hhmm + " Uhr)",
                            url: "/?familie=" + encodeURIComponent(g.memberId), tag: "ortung-" + g.id + "-" + o.id,
                        }));
                });
                if (imLaden.length) {
                    getUsers().filter(u => u.mitglied === g.memberId).forEach(u => {
                        try { sendPush(u.id, ladenPushText(langOfUser(u.id), imLaden, g.id)); } catch (err) { console.log("[Ortung] Einkaufs-Push: " + err.message); }
                    });
                }
            }
            // Dwelling in the store (also without a new position: the phone rarely reports while standing still)
            cfg.orte.forEach(o => {
                if (!o.laden || o.abhaken === false) return;
                const key = "in|" + familyId + "|" + g.id + "|" + o.id;
                const seitKey = "seit|" + familyId + "|" + g.id + "|" + o.id;
                const dwKey = "dw|" + familyId + "|" + g.id + "|" + o.id;
                if (st[key] !== 1 || !st[seitKey] || st[dwKey]) return;
                const ende = Math.min(now, p.zeit + VERWEIL_POS_MAX_MS);
                const mins = (ende - Number(st[seitKey])) / 60000;
                if (mins < Number(o.verweil || 10)) return;
                st[dwKey] = now;
                stChanged = true;
                if (markShopVisit(cfg, o, g, mins, now)) cfgChanged = true;
            });
        });
        // All stores of a planned shopping trip visited -> tick off the task
        if (cfg.plaene.length && completePlans(familyId, cfg, getUsers, now)) cfgChanged = true;
        if (cfgChanged) { try { saveCronCfg(familyId, cfg, beendet, planIdsVorher, freigabeEnde); } catch (e) { console.log("[Ortung] Speichern fehlgeschlagen: " + e.message); } }
    });

    // Occasionally remove old entries (deleted devices/places)
    if (Math.random() < 0.02) {
        const valid = {};
        fams.forEach(f => f.cfg.geraete.forEach(g => { valid[f.familyId + "|" + g.id] = true; }));
        Object.keys(st).forEach(k => {
            if (k.indexOf("sosev|") === 0) return; // checkSosEvents manages this itself
            const parts = k.split("|");
            if (!valid[parts[1] + "|" + parts[2]]) { delete st[k]; stChanged = true; }
        });
    }
    if (stChanged) {
        // checkSosEvents may already have changed the file in this run -> take over its entries
        const cur = readJsonFile(STATUS_FILE) || {};
        Object.keys(cur).forEach(k => { if (k.indexOf("sosev|") === 0 && st[k] === undefined) st[k] = cur[k]; });
        writeJsonFile(STATUS_FILE, st);
    }
}

// Central European Time (CET/CEST) for the time in the message
function tzOffset(utcMs) {
    const d = new Date(utcMs);
    const y = d.getUTCFullYear();
    const lastSun = (m) => { const t = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, t.getUTCDate() - t.getUTCDay(), 1); };
    return (utcMs >= lastSun(2) && utcMs < lastSun(9)) ? 2 * 3600 * 1000 : 3600 * 1000;
}

module.exports = {
    COL, ensureSchema, status, saveDevice, deleteDevice, setSharing, savePlace, saveShop, deletePlace,
    setUnterwegs, track, search, tile, forwardOsmand, isOsmandRequest, runCron, syncHome, syncPlans,
    sosList, sosEnde, sosTest, sosAusloesen, osmandLog, shareStart, sharePosition, shareOnce,
};
