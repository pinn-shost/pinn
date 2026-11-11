// pb_hooks/pinn-sitzungen.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require()
// (routes, sign-in hook and per-request check in sitzungen.pb.js).
//
// Device management: every sign-in of a profile (password, family dashboard, renewal at
// app start) belongs to a "session" in the locked collection "sitzungen" - one record per
// device and profile. In the app: Account → "Signed-in devices" (own ones) or, for admins, under
// Manage profile → "Devices & sign-in", for the main admin on their screen.
//
//  - The session ID is stored as an additional value "sid" in the sign-in token (same signature as with
//    PocketBase, the token stays perfectly valid for PocketBase). Every request with a token checks whether
//    the session still exists - "Sign out" of a device deletes it, after which the device only gets
//    401 with the header "X-Pinn-Abgemeldet: 1" and deletes its pinn. data.
//  - The check per request is gentle: the result stays in memory for 60 seconds,
//    "last active" is saved at most every 5 minutes.
//  - A device signs in with a random device identifier (X-Pinn-Geraet-Id) and a
//    readable name (X-Pinn-Geraet, e.g. "iPhone · App"). If the same device signs in again with the same
//    profile (e.g. at the family dashboard), the existing session is reused.
//  - Recognising a device (without a network address - it changes constantly), in this order:
//      1. Session ID in the previous token
//      2. Device cookie "pinn_geraet" - set by the server itself (HttpOnly, 400 days). It survives
//         app updates and clearing the app storage, because the app can neither read nor delete it.
//      3. Device identifier of the app (X-Pinn-Geraet-Id)
//      4. Device characteristics: profile + kind (app/dashboard) + device name + device type/browser (without
//         version numbers, so that even an iOS or browser update changes nothing)
//    This way an app update no longer creates a new device.
//  - The network address (IP) is neither stored nor shown for devices - it plays no role in
//    the recognition. Old stored addresses are cleared on server start.
//  - If the same push address registers for another session of the same profile, it is the same
//    device: the older entry is merged with the current one (instead of staying as a duplicate).
//  - Duplicate entries from earlier (same device characteristics, the older one not used since)
//    are merged on server start and at night - the push address moves along in the process.
//  - Push: a device's push address is assigned to its session. If the device is signed out,
//    it also gets no notifications any more.
//  - "Sign out everywhere" additionally renews the profile's token key - so older
//    sign-ins without a session ID become invalid immediately as well.
//  - Sign-ins from before this update have no session ID yet; they get one the
//    next time the app is opened (the app renews the sign-in on every start).
//
// Protection against brute-forcing (in addition to the lock per profile in pinn-dashboard.js):
//  - The only place where the network address still counts (in memory only):
//    counts failed sign-ins and unknown family names per network address (IP).
//    After 20 failed attempts within 30 minutes the address is blocked: 1 minute, then each time
//    twice as long, 30 minutes at most. In memory only, back to 0 after a restart.
//  - If a profile is locked because of too many wrong passwords, the admins of the family
//    (or the main admin) get a push message and it appears in the error log (area "Sign-in").
//    An admin can lift the lock in the profile's device management.
//
// Since 1.147.0:
//  - The app reports its device on every start (POST /api/pinn/sitzungen/geraet, geraetMelden): readable name, kind of
//    device (typ: phone | tablet | desktop) and its device identifier. The entry thus always shows the right device,
//    also when the name of the sign-in was too vague ("Browser"). The list shows a short ID (first characters of the
//    device identifier) so two devices of the same kind can be told apart.
//  - Own name per device (eigenname, "umbenennen") – wins over the detected name.
//  - Push subscriptions of the profile that belong to no session are no longer listed as an entry of their own
//    (since 1.147.1). A leftover subscription of a device that already has a session with a push address
//    (same device name) is removed instead - otherwise that device would get every message twice.
//
// Since 1.147.1:
//  - Entries of the same profile with the same device identifier (geraet_id) are one device: the list shows them
//    once (most recently used entry), they count once, and signing out removes all of them. Two sign-ins at the
//    same moment (family dashboard) used to leave two entries with the same short ID.

const COL = "sitzungen";
const USERS = "benutzer";
const CACHE_PREFIX = "pinnSitz:";
const SCHEMA_KEY = "pinnSitzSchema";
const CHECK_MS = 60 * 1000;          // Check the session in the database at most once per minute
const TOUCH_MS = 5 * 60 * 1000;      // save "last active" at most every 5 minutes
const PIN_LOCK_PREFIX = "pinnPinSperre:"; // as in pinn-dashboard.js
const IP_PREFIX = "pinnIpSperre:";
const IP_MAX = 20;
const IP_FENSTER_MS = 30 * 60 * 1000;
const IP_MAX_SPERRE_S = 30 * 60;
const MELDUNG_PREFIX = "pinnSperrMeldung:";
const FELDER_KEY = "pinnSitzFelder3";
const COOKIE = "pinn_geraet";
const COOKIE_TAGE = 400;
// Fields that were added after the first version (are added when needed)
const NEUE_FELDER = [
    { name: "kennung", max: 64 },   // Device cookie
    { name: "merkmal", max: 64 },   // Device characteristics (checksum)
    { name: "typ", max: 16 },       // phone | tablet | desktop (since 1.147.0)
    { name: "eigenname", max: 60 }, // own name given in the app (since 1.147.0)
];
const TYPEN = ["phone", "tablet", "desktop"];

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
function schemaReady() {
    try { if ($app.store().get(SCHEMA_KEY) === "1") return true; } catch (e) { /* check */ }
    const ok = !!findCol(COL);
    if (ok) { try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* ignore */ } }
    return ok;
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
// Add missing newer fields (once per server start)
function ensureFelder() {
    try { if ($app.store().get(FELDER_KEY) === "1") return true; } catch (e) { /* check */ }
    const col = findCol(COL);
    if (!col) return false;
    let changed = false;
    NEUE_FELDER.forEach(f => {
        if (hasField(col, f.name)) return;
        try { col.fields.add(new TextField({ name: f.name, max: f.max })); changed = true; }
        catch (err) { console.log("[Geräte] Feld \"" + f.name + "\" nicht ergänzbar: " + err.message); }
    });
    if (changed) {
        try { $app.save(col); console.log("[Geräte] Sammlung \"" + COL + "\" um Geräte-Erkennung ergänzt."); }
        catch (err) { console.log("[Geräte] Felder nicht gespeichert: " + err.message); return false; }
    }
    try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* ignore */ }
    return true;
}
function ensureSchema() {
    if (schemaReady()) { ensureFelder(); return true; }
    const users = findCol(USERS);
    if (!users) return false;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "benutzer", type: "relation", collectionId: users.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
                { name: "familie", type: "text", max: 40 },
                { name: "name", type: "text", max: 100 },
                { name: "agent", type: "text", max: 400 },
                { name: "ip", type: "text", max: 60 },
                { name: "geraet_id", type: "text", max: 64 },
                { name: "kennung", type: "text", max: 64 },
                { name: "merkmal", type: "text", max: 64 },
                { name: "typ", type: "text", max: 16 },
                { name: "eigenname", type: "text", max: 60 },
                { name: "art", type: "text", max: 20 },
                { name: "push", type: "text", max: 2000 },
                { name: "gebunden", type: "bool" },
                { name: "zuletzt", type: "text", max: 30 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: [
                "CREATE INDEX `idx_sitzungen_benutzer` ON `" + COL + "` (`benutzer`)",
                "CREATE INDEX `idx_sitzungen_geraet` ON `" + COL + "` (`geraet_id`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Geräte] Sammlung \"" + COL + "\" angelegt.");
        try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* ignore */ }
        try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* ignore */ }
        return true;
    } catch (err) {
        console.log("[Geräte] Sammlung \"" + COL + "\" nicht anlegbar: " + err.message);
        protokoll().fehler("system", "Geräteverwaltung: Sammlung „sitzungen“ konnte nicht angelegt werden.", { details: err.message });
        return false;
    }
}

function protokoll() {
    try { return require(`${__hooks}/pinn-protokoll.js`); }
    catch (e) { return { fehler: function () {}, warnung: function () {}, info: function () {} }; }
}

// ---------------------------------------------------------------------------------------------
// Request: token, session ID, device, address
// ---------------------------------------------------------------------------------------------
function header(e, name) {
    try { return String(e.request.header.get(name) || ""); } catch (err) { return ""; }
}
function tokenOf(e) {
    let t = header(e, "Authorization").trim();
    if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "");
    return t;
}
function claimsOf(token) {
    if (!token || token.split(".").length !== 3) return null;
    try { return $security.parseUnverifiedJWT(token) || null; } catch (err) { return null; }
}
function cleanSid(v) {
    const s = String(v || "");
    return /^[a-z0-9]{15}$/.test(s) ? s : "";
}
// Session ID from the request's token ("" = none)
function sidOf(e) {
    const c = claimsOf(tokenOf(e));
    return c ? cleanSid(c.sid) : "";
}
function clientIp(e) {
    let ip = "";
    // Caddy sets X-Forwarded-For itself (it discards incoming values from outside) -> last entry
    const xff = header(e, "X-Forwarded-For");
    if (xff) {
        const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
        ip = parts[parts.length - 1] || "";
    }
    if (!ip) { try { ip = String(e.realIP() || ""); } catch (err) { ip = ""; } }
    if (!ip) { try { ip = String(e.remoteIP() || ""); } catch (err) { ip = ""; } }
    return ip.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 60);
}
function cleanDeviceId(v) {
    const s = String(v || "").trim();
    return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : "";
}
function cleanName(v) {
    let s = String(v || "");
    try { s = decodeURIComponent(s); } catch (err) { /* leave as is */ }
    return s.replace(/[\u0000-\u001F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}
// Readable name from the browser identifier (in case the app sends none, e.g. an older version)
function nameFromAgent(ua) {
    const s = String(ua || "");
    let dev = "Browser";
    if (/iPad/.test(s)) dev = "iPad";
    else if (/iPhone/.test(s)) dev = "iPhone";
    else if (/Android/.test(s)) dev = /Mobile/.test(s) ? "Android-Handy" : "Android-Tablet";
    else if (/Macintosh|Mac OS X/.test(s)) dev = "Mac";
    else if (/Windows/.test(s)) dev = "Windows-PC";
    else if (/CrOS/.test(s)) dev = "Chromebook";
    else if (/Linux/.test(s)) dev = "Linux-PC";
    let br = "";
    if (/EdgA?\/|EdgiOS/.test(s)) br = "Edge";
    else if (/SamsungBrowser/.test(s)) br = "Samsung Internet";
    else if (/Firefox|FxiOS/.test(s)) br = "Firefox";
    else if (/OPR\//.test(s)) br = "Opera";
    else if (/Chrome|CriOS/.test(s)) br = "Chrome";
    else if (/Safari/.test(s)) br = "Safari";
    return br ? dev + " · " + br : dev;
}

// Does a name say which device it is? ("Browser" alone does not – then the browser identifier is asked)
const DEVICE_WORDS = /iPhone|iPad|iPod|Android|Mac|Windows|Chromebook|Linux|PC|Pixel|Galaxy/i;
function betterName(name, agent) {
    const n = String(name || "");
    if (!n || DEVICE_WORDS.test(n)) return n;
    const fromAgent = nameFromAgent(agent);
    return DEVICE_WORDS.test(fromAgent) ? fromAgent : n;
}
function cleanTyp(v) { const s = String(v || ""); return TYPEN.indexOf(s) >= 0 ? s : ""; }
// Short, readable ID of a device: first 4 characters of the device identifier (or of the cookie)
function kurzId(v) { return String(v || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase(); }

// ---------------------------------------------------------------------------------------------
// Device cookie and device characteristics (recognition without a network address)
// ---------------------------------------------------------------------------------------------
function cookieValue(e, name) {
    const raw = header(e, "Cookie");
    if (!raw) return "";
    const parts = raw.split(";");
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i].trim();
        const at = p.indexOf("=");
        if (at > 0 && p.slice(0, at) === name) return p.slice(at + 1).trim();
    }
    return "";
}
function isHttps(e) {
    if (/^https$/i.test(header(e, "X-Forwarded-Proto").split(",")[0].trim())) return true;
    try { return !!e.request.tls; } catch (err) { return false; }
}
function setzeCookie(e, id) {
    const parts = [COOKIE + "=" + id, "Path=/", "Max-Age=" + (COOKIE_TAGE * 86400), "HttpOnly", "SameSite=Lax"];
    if (isHttps(e)) parts.push("Secure");
    try { e.response.header().add("Set-Cookie", parts.join("; ")); } catch (err) { /* ignore */ }
}
// Read the device cookie or assign a new one. Returns { id, neu }.
// The cookie is renewed on every sign-in so that it does not expire.
function geraetKennung(e) {
    let id = cleanDeviceId(cookieValue(e, COOKIE));
    let neu = false;
    if (!id) {
        try { id = $security.randomString(32); } catch (err) { id = ""; }
        neu = true;
    }
    if (id) setzeCookie(e, id);
    return { id: id, neu: neu };
}
// Browser identifier without version numbers (an iOS/browser update thus changes nothing)
function agentOhneVersion(ua) {
    return String(ua || "").replace(/\d+(?:[._]\d+)*/g, "#").replace(/\s+/g, " ").trim().slice(0, 400);
}
// Checksum of the device characteristics: kind + device name + browser identifier (without versions)
function merkmalOf(art, name, agent) {
    const key = String(art || "app") + "|" + String(name || "").toLowerCase() + "|" + agentOhneVersion(agent);
    try { return String($security.sha256("pinn-geraet:" + key)).slice(0, 48); } catch (err) { return ""; }
}
function merkmalVon(rec) {
    return rec.getString("merkmal") || merkmalOf(rec.getString("art") || "app", rec.getString("name") || nameFromAgent(rec.getString("agent")), rec.getString("agent"));
}
// PocketBase date ("2026-10-08 10:00:00.000Z") or ISO text -> milliseconds (0 = unknown)
function msOf(v) {
    const s = String(v || "").trim();
    if (!s) return 0;
    const t = Date.parse(s.replace(" ", "T"));
    return isFinite(t) ? t : 0;
}
function aktivMs(rec) {
    return Math.max(msOf(rec.getString("zuletzt")), msOf(rec.getString("created")));
}

// ---------------------------------------------------------------------------------------------
// Cache per session: "1|<checked ms>|<last saved ms>|<user>" or "0" (signed out)
// ---------------------------------------------------------------------------------------------
function readCache(sid) {
    try {
        const raw = String($app.store().get(CACHE_PREFIX + sid) || "");
        if (!raw) return null;
        if (raw === "0") return { ok: false };
        const p = raw.split("|");
        return { ok: true, checked: parseInt(p[1], 10) || 0, touched: parseInt(p[2], 10) || 0, user: p[3] || "" };
    } catch (e) { return null; }
}
function writeCache(sid, checked, touched, user) {
    try { $app.store().set(CACHE_PREFIX + sid, "1|" + checked + "|" + touched + "|" + user); } catch (e) { /* ignore */ }
}
function markRevoked(sid) {
    try { $app.store().set(CACHE_PREFIX + sid, "0"); } catch (e) { /* ignore */ }
}

function findSession(sid) {
    if (!sid || !schemaReady()) return null;
    try { return $app.findRecordById(COL, sid); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Check per request (middleware in sitzungen.pb.js). false = session signed out -> 401
// ---------------------------------------------------------------------------------------------
function pruefe(e) {
    const a = e.auth;
    if (!a) return true;
    try { if (a.collection().name !== USERS) return true; } catch (err) { return true; }
    const sid = sidOf(e);
    if (!sid) return true;                 // Sign-in from before the device management
    if (!schemaReady()) return true;
    const now = Date.now();
    const c = readCache(sid);
    if (c && !c.ok) return false;
    if (c && c.ok && c.user === a.id && now - c.checked < CHECK_MS) {
        if (now - c.touched >= TOUCH_MS) touch(sid, e, a.id, now);
        return true;
    }
    const rec = findSession(sid);
    if (!rec || rec.getString("benutzer") !== a.id) {
        markRevoked(sid);
        return false;
    }
    let touched = 0;
    const z = Date.parse(rec.getString("zuletzt") || "");
    if (isFinite(z)) touched = z;
    if (now - touched >= TOUCH_MS) {
        saveTouch(rec, e, now);
        touched = now;
    }
    writeCache(sid, now, touched, a.id);
    return true;
}
function saveTouch(rec, e, now) {
    try {
        rec.set("zuletzt", new Date(now).toISOString());
        if (rec.getString("ip")) rec.set("ip", "");
        $app.save(rec);
    } catch (err) { /* next time */ }
}
function touch(sid, e, userId, now) {
    const rec = findSession(sid);
    if (!rec) { markRevoked(sid); return; }
    saveTouch(rec, e, now);
    writeCache(sid, now, now, userId);
}

// ---------------------------------------------------------------------------------------------
// Sign-in (onRecordAuthRequest): create or reuse a session, issue a token with "sid"
// ---------------------------------------------------------------------------------------------
function signedToken(rec, baseToken, sid) {
    try {
        const claims = claimsOf(baseToken);
        if (!claims || !claims.exp) return "";
        const col = rec.collection();
        const secret = String(col.authToken.secret || "");
        if (!secret) return "";
        const rest = Math.floor(Number(claims.exp) - Date.now() / 1000);
        if (!(rest > 60)) return "";
        const payload = {};
        Object.keys(claims).forEach(k => { if (k !== "exp" && k !== "iat" && k !== "nbf") payload[k] = claims[k]; });
        payload.sid = sid;
        const tok = $security.createJWT(payload, rec.tokenKey() + secret, rest);
        // Cross-check: does PocketBase accept the token? Otherwise it stays with the normal token.
        const check = $app.findAuthRecordByToken(tok, "auth");
        return (check && check.id === rec.id) ? tok : "";
    } catch (err) {
        return "";
    }
}

function beimAnmelden(e) {
    const rec = e.record;
    if (!rec) return;
    try { if (rec.collection().name !== USERS) return; } catch (err) { return; }
    if (!ensureSchema()) return;
    const userId = rec.id;
    let path = "";
    try { path = String(e.request.url.path || ""); } catch (err) { path = ""; }
    const isDashboard = path.indexOf("/api/pinn/dashboard/") === 0;

    // 1) Continue the same session (renewing, changing the password, "sign out others")
    let sess = null;
    const oldSid = sidOf(e);
    if (oldSid) {
        sess = findSession(oldSid);
        if (sess && sess.getString("benutzer") !== userId) sess = null;
    }
    const felder = ensureFelder();
    const kennung = geraetKennung(e);
    const agent = header(e, "User-Agent").slice(0, 400);
    const headerName = cleanName(header(e, "X-Pinn-Geraet"));
    const art = isDashboard ? "dashboard" : "app";
    // 2) Device cookie - survives app updates and clearing the app storage
    if (!sess && felder && kennung.id && !kennung.neu) {
        try { sess = $app.findFirstRecordByFilter(COL, "benutzer = {:u} && kennung = {:k}", { u: userId, k: kennung.id }); } catch (err) { sess = null; }
    }
    // 3) Device identifier of the app (e.g. family dashboard, signing in again)
    const deviceId = cleanDeviceId(header(e, "X-Pinn-Geraet-Id"));
    if (!sess && deviceId) {
        try { sess = $app.findFirstRecordByFilter(COL, "benutzer = {:u} && geraet_id = {:d}", { u: userId, d: deviceId }); } catch (err) { sess = null; }
    }
    // 4) Device characteristics: same profile, same kind, same device name and browser
    //    (without version numbers). If the device already has its own cookie, only entries
    //    without or with exactly this cookie count - a second, identical device thus stays separate.
    if (!sess && felder) {
        const m = merkmalOf(art, headerName || nameFromAgent(agent), agent);
        let kandidaten = [];
        try { kandidaten = $app.findRecordsByFilter(COL, "benutzer = {:u}", "-zuletzt", 200, 0, { u: userId }); } catch (err) { kandidaten = []; }
        for (let i = 0; i < kandidaten.length; i++) {
            const k = kandidaten[i];
            if ((k.getString("art") || "app") !== art) continue;
            if (merkmalVon(k) !== m) continue;
            const kk = k.getString("kennung");
            if (!kennung.neu && kk && kk !== kennung.id) continue;
            sess = k;
            break;
        }
    }
    if (!sess) {
        sess = new Record($app.findCollectionByNameOrId(COL));
        sess.set("benutzer", userId);
    }
    const name = betterName(headerName, agent) || sess.getString("name") || nameFromAgent(agent);
    sess.set("familie", rec.getString("familie"));
    sess.set("name", name);
    if (agent) sess.set("agent", agent);
    if (sess.getString("ip")) sess.set("ip", "");
    if (deviceId) sess.set("geraet_id", deviceId);
    if (isDashboard) sess.set("art", "dashboard");
    else if (!sess.getString("art")) sess.set("art", "app");
    if (felder) {
        if (kennung.id) sess.set("kennung", kennung.id);
        sess.set("merkmal", merkmalOf(sess.getString("art") || art, name, agent));
    }
    sess.set("zuletzt", nowIso());
    $app.save(sess);

    const tok = signedToken(rec, e.token, sess.id);
    let bound = false;
    if (tok) {
        try { e.token = tok; bound = e.token === tok; } catch (err) { bound = false; }
    }
    if (bound !== sess.getBool("gebunden")) {
        sess.set("gebunden", bound);
        try { $app.save(sess); } catch (err) { /* ignore */ }
    }
    if (!bound) {
        protokoll().warnung("system", "Geräteverwaltung: Eine Anmeldung konnte nicht mit ihrem Gerät verknüpft werden – einzelnes Abmelden geht dafür nur über „Überall abmelden“.", { benutzer: userId });
    }
    writeCache(sess.id, Date.now(), Date.now(), userId);
}

// ---------------------------------------------------------------------------------------------
// Rights: own profile; family admins the profiles of their family; main admin all
// ---------------------------------------------------------------------------------------------
function targetUser(e, id) {
    const want = String(id || "").trim();
    if (!want || want === e.auth.id) return $app.findRecordById(USERS, e.auth.id);
    let rec = null;
    try { rec = $app.findRecordById(USERS, want); } catch (err) { rec = null; }
    if (!rec) throw new Error("Profil nicht gefunden.");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.canManage(e, rec)) throw new Error("Die Geräte dieses Profils kannst du nicht verwalten.");
    return rec;
}

// ---------------------------------------------------------------------------------------------
// Locks (display and lifting)
// ---------------------------------------------------------------------------------------------
function lockIdsOf(userRec) {
    const ids = [];
    const rolle = userRec.getString("rolle");
    if (rolle === "hauptadmin") ids.push("login:hauptadmin");
    else if (userRec.getString("familie")) ids.push("login:" + userRec.getString("familie") + ":" + userRec.getString("username"));
    ids.push(userRec.id); // Dashboard-PIN
    return ids;
}
function readPinLock(id) {
    try {
        const p = String($app.store().get(PIN_LOCK_PREFIX + id) || "").split("|");
        return { n: parseInt(p[0], 10) || 0, until: parseInt(p[1], 10) || 0 };
    } catch (e) { return { n: 0, until: 0 }; }
}
function lockStatus(userRec) {
    let sekunden = 0, fehlversuche = 0, pin = 0;
    const ids = lockIdsOf(userRec);
    ids.forEach((id, i) => {
        const l = readPinLock(id);
        const rest = l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0;
        if (i === ids.length - 1) { pin = rest; }
        else { sekunden = Math.max(sekunden, rest); fehlversuche = Math.max(fehlversuche, l.n); }
    });
    return { sekunden: sekunden, fehlversuche: fehlversuche, pin: pin };
}
function entsperren(e, userId) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) throw new Error("Sperren heben nur Admins auf.");
    const rec = targetUser(e, userId);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    lockIdsOf(rec).forEach(id => dash.clearFails(id));
    return true;
}

// ---------------------------------------------------------------------------------------------
// List and sign out
// ---------------------------------------------------------------------------------------------
function rowOf(r, currentSid) {
    const erkannt = r.getString("name") || nameFromAgent(r.getString("agent"));
    return {
        id: r.id,
        name: r.getString("eigenname") || erkannt,
        erkannt: erkannt,
        eigenname: r.getString("eigenname"),
        typ: r.getString("typ"),
        kurz: kurzId(r.getString("geraet_id") || r.getString("kennung")),
        art: r.getString("art") || "app",
        ip: "",
        zuletzt: r.getString("zuletzt"),
        seit: r.getString("created"),
        push: !!r.getString("push"),
        gebunden: r.getBool("gebunden"),
        dieses: r.id === currentSid,
    };
}
// Device name without the kind suffix ("iPhone · App" -> "iphone"), to compare names of one device
function baseName(v) { return String(v || "").split("·")[0].trim().toLowerCase(); }

// Remove leftover push subscriptions of a profile: no session owns the address, but a session of the same
// device (same name) already has its own push address - the leftover would only send every message twice.
function waisenPushEntfernen(userId) {
    if (!schemaReady()) return 0;
    let recs = [];
    let abos = [];
    try { recs = $app.findRecordsByFilter(COL, "benutzer = {:u}", "", 200, 0, { u: String(userId) }); } catch (err) { return 0; }
    try { abos = $app.findRecordsByFilter("push_abos", "benutzer = {:u}", "", 50, 0, { u: String(userId) }); } catch (err) { return 0; }
    const owned = {};
    const withPush = {};
    recs.forEach(r => {
        const ep = r.getString("push");
        if (!ep) return;
        owned[ep] = true;
        withPush[baseName(r.getString("name") || nameFromAgent(r.getString("agent")))] = true;
    });
    let n = 0;
    abos.forEach(a => {
        if (owned[a.getString("endpoint")]) return;
        const nm = baseName(a.getString("geraet"));
        if (!nm || !withPush[nm]) return;
        try { $app.delete(a); n++; } catch (err) { /* already gone */ }
    });
    return n;
}

function liste(e, userId) {
    const rec = targetUser(e, userId);
    const currentSid = sidOf(e);
    let recs = [];
    if (schemaReady()) {
        try { recs = $app.findRecordsByFilter(COL, "benutzer = {:u}", "-zuletzt", 200, 0, { u: rec.id }); } catch (err) { recs = []; }
    }
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    try { waisenPushEntfernen(rec.id); } catch (err) { /* ignore */ }
    // Sorted by last use: the first entry of a device is the one shown; "this device" wins if it is among them
    const rows = [];
    const byGid = {};
    recs.forEach(r => {
        const gid = r.getString("geraet_id");
        const row = rowOf(r, currentSid);
        if (!gid) { rows.push(row); return; }
        const first = byGid[gid];
        if (!first) { byGid[gid] = row; rows.push(row); return; }
        if (row.dieses && !first.dieses) {
            // keep the position of the first entry but show the current session
            const at = rows.indexOf(first);
            row.zuletzt = first.zuletzt;
            if (first.push && !row.push) row.push = true;
            rows[at] = row;
            byGid[gid] = row;
        } else if (r.getString("push") && !first.push) {
            first.push = true;
        }
    });
    const out = {
        benutzer: { id: rec.id, username: rec.getString("username"), rolle: rec.getString("rolle") },
        eigenes: rec.id === e.auth.id,
        sitzungen: rows,
        aktuellOhneSitzung: rec.id === e.auth.id && !currentSid,
    };
    if (lib.isAdmin(e)) out.sperre = lockStatus(rec);
    return out;
}

// Overview for "Manage profiles": per profile of the family the number of devices + lock
function uebersicht(e, familyId) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) throw new Error("Nur für Admins.");
    let fam = lib.familyOf(e);
    if (lib.isMainAdmin(e)) fam = String(familyId || "");
    if (!fam) return { profile: {} };
    let users = [];
    try { users = $app.findRecordsByFilter(USERS, "familie = {:f}", "", 0, 0, { f: fam }); } catch (err) { users = []; }
    const counts = {};
    if (schemaReady() && users.length) {
        try {
            const seenDev = {};
            $app.findRecordsByFilter(COL, "familie = {:f}", "", 0, 0, { f: fam }).forEach(r => {
                const u = r.getString("benutzer");
                const gid = r.getString("geraet_id");
                if (gid) { if (seenDev[u + "|" + gid]) return; seenDev[u + "|" + gid] = true; }
                counts[u] = (counts[u] || 0) + 1;
            });
        } catch (err) { /* ignore */ }
    }
    const out = {};
    users.forEach(u => { out[u.id] = { geraete: counts[u.id] || 0, sperre: lockStatus(u) }; });
    return { profile: out };
}

// Remove the push subscriptions of a session (the device then gets no notifications any more)
function removePushOf(sess) {
    const endpoint = sess.getString("push");
    if (!endpoint) return;
    try {
        const abo = $app.findFirstRecordByFilter("push_abos", "endpoint = {:e}", { e: endpoint });
        if (abo.getString("benutzer") === sess.getString("benutzer")) $app.delete(abo);
    } catch (err) { /* already gone */ }
}

// Disconnect a profile's real-time connections - the other devices reconnect immediately,
// a signed-out device gets no access any more in the process.
function trenneEchtzeit(userId) {
    try {
        const clients = $app.subscriptionsBroker().clients();
        Object.keys(clients).forEach(k => {
            try {
                const c = clients[k];
                const a = c.get("auth");
                if (a && a.id === userId) c.discard();
            } catch (err) { /* ignore */ }
        });
    } catch (err) { /* not available */ }
}

function deleteSession(sess) {
    removePushOf(sess);
    markRevoked(sess.id);
    try { $app.delete(sess); } catch (err) { /* already gone */ }
}

// Sign out one device. id = session ID or "dieses" (the requesting device)
function abmelden(e, id) {
    const want = String(id || "");
    // Push subscription without a session: remove it (the device gets no notifications any more)
    if (/^push:[a-z0-9]{15}$/.test(want)) {
        let abo = null;
        try { abo = $app.findRecordById("push_abos", want.slice(5)); } catch (err) { abo = null; }
        if (!abo) return { success: true };
        targetUser(e, abo.getString("benutzer")); // Check the rights (throws)
        try { $app.delete(abo); } catch (err) { /* already gone */ }
        return { success: true, nurPush: true };
    }
    const sid = want === "dieses" ? sidOf(e) : cleanSid(want);
    if (!sid) {
        if (want === "dieses") return { success: true };
        throw new Error("Gerät nicht gefunden.");
    }
    const sess = findSession(sid);
    if (!sess) { markRevoked(sid); return { success: true }; }
    targetUser(e, sess.getString("benutzer")); // Check the rights (throws)
    const userId = sess.getString("benutzer");
    const gebunden = sess.getBool("gebunden");
    // Other entries of the same device (same device identifier) go with it
    const gid = sess.getString("geraet_id");
    if (gid) {
        try {
            $app.findRecordsByFilter(COL, "benutzer = {:u} && geraet_id = {:g} && id != {:i}", "", 20, 0, { u: userId, g: gid, i: sess.id }).forEach(o => {
                if (o.id === sidOf(e)) return; // never the entry of the requesting device
                deleteSession(o);
            });
        } catch (err) { /* ignore */ }
    }
    deleteSession(sess);
    trenneEchtzeit(userId);
    return { success: true, dieses: sid === sidOf(e), gebunden: gebunden };
}

// Sign out all devices of a profile. Own profile: the requesting device stays signed in and
// gets a new sign-in (returns rec, the route sends it back via recordAuthResponse).
function alleAbmelden(e, userId) {
    const rec = targetUser(e, userId);
    const own = rec.id === e.auth.id;
    const keepSid = own ? sidOf(e) : "";
    let keepPush = "";
    let n = 0;
    if (schemaReady()) {
        let recs = [];
        try { recs = $app.findRecordsByFilter(COL, "benutzer = {:u}", "", 0, 0, { u: rec.id }); } catch (err) { recs = []; }
        recs.forEach(s => {
            if (s.id === keepSid) { keepPush = s.getString("push"); return; }
            deleteSession(s);
            n++;
        });
    }
    // Also remove the remaining push subscriptions of the profile (e.g. from devices without a session)
    try {
        $app.findRecordsByFilter("push_abos", "benutzer = {:u}", "", 0, 0, { u: rec.id }).forEach(a => {
            if (keepPush && a.getString("endpoint") === keepPush) return;
            try { $app.delete(a); } catch (err) { /* ignore */ }
        });
    } catch (err) { /* no push collection */ }
    // Renew the token key: all previous sign-ins (also without a session ID) become invalid
    try {
        rec.refreshTokenKey();
        $app.save(rec);
    } catch (err) {
        console.log("[Geräte] Token-Schlüssel nicht erneuert: " + err.message);
    }
    trenneEchtzeit(rec.id);
    return { rec: own ? $app.findRecordById(USERS, rec.id) : null, anzahl: n, own: own };
}

// After a password change or a reset: remove other sessions including push
function entferneAndere(userId, keepSid) {
    if (!schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "benutzer = {:u}", "", 0, 0, { u: String(userId) }).forEach(s => {
            if (keepSid && s.id === keepSid) return;
            deleteSession(s);
        });
    } catch (err) { /* ignore */ }
    trenneEchtzeit(String(userId));
}

// ---------------------------------------------------------------------------------------------
// The app reports its device (on every start, since 1.147.0): name, kind and device identifier of the current session
// ---------------------------------------------------------------------------------------------
function geraetMelden(e, body) {
    const b = body || {};
    const sid = sidOf(e);
    if (!sid || !schemaReady()) return { success: false, ohneSitzung: true };
    const sess = findSession(sid);
    if (!sess || sess.getString("benutzer") !== e.auth.id) return { success: false, ohneSitzung: true };
    const felder = ensureFelder();
    const agent = header(e, "User-Agent").slice(0, 400);
    const name = betterName(cleanName(b.name), agent);
    const typ = cleanTyp(b.typ);
    const deviceId = cleanDeviceId(b.id);
    let changed = false;
    const put = (field, val) => { if (val && sess.getString(field) !== val) { sess.set(field, val); changed = true; } };
    put("name", name);
    if (agent && sess.getString("agent") !== agent) { sess.set("agent", agent); changed = true; }
    if (deviceId && !sess.getString("geraet_id")) put("geraet_id", deviceId);
    if (felder) {
        put("typ", typ);
        const m = merkmalOf(sess.getString("art") || "app", sess.getString("name"), sess.getString("agent"));
        put("merkmal", m);
    }
    if (changed) { try { $app.save(sess); } catch (err) { return { success: false }; } }
    const endpoint = String(b.push || "");
    if (/^https:\/\//i.test(endpoint) && endpoint.length <= 2000 && sess.getString("push") !== endpoint) {
        // Only an address that really belongs to this profile is taken over
        try {
            const abo = $app.findFirstRecordByFilter("push_abos", "endpoint = {:p}", { p: endpoint });
            if (abo.getString("benutzer") === e.auth.id) merkePush(e, endpoint);
        } catch (err) { /* unknown address */ }
    }
    return { success: true, id: sess.id, kurz: kurzId(sess.getString("geraet_id") || sess.getString("kennung")) };
}

// Own name of a device (empty = back to the detected name)
function umbenennen(e, id, name) {
    const sid = cleanSid(id);
    const sess = sid ? findSession(sid) : null;
    if (!sess) throw new Error("Gerät nicht gefunden.");
    targetUser(e, sess.getString("benutzer")); // Check the rights (throws)
    if (!ensureFelder()) throw new Error("Gerät nicht gefunden.");
    const n = cleanName(name).slice(0, 60);
    sess.set("eigenname", n);
    $app.save(sess);
    return { success: true, name: n || sess.getString("name") };
}

// ---------------------------------------------------------------------------------------------
// Assign the push address to the session (push.pb.js)
// ---------------------------------------------------------------------------------------------
function merkePush(e, endpoint) {
    const sid = sidOf(e);
    if (!sid || !endpoint) return;
    const sess = findSession(sid);
    if (!sess || sess.getString("benutzer") !== e.auth.id) return;
    // The same push address on a different session:
    //  - same profile -> same device (e.g. an entry from before an app update): merge
    //  - different profile on the same device -> only remove the push address there
    let changed = false;
    try {
        $app.findRecordsByFilter(COL, "push = {:p} && id != {:id}", "", 20, 0, { p: endpoint, id: sid }).forEach(s => {
            if (s.getString("benutzer") === sess.getString("benutzer") && (s.getString("art") || "app") === (sess.getString("art") || "app")) {
                if (!sess.getString("kennung") && s.getString("kennung")) { sess.set("kennung", s.getString("kennung")); changed = true; }
                if (!sess.getString("geraet_id") && s.getString("geraet_id")) { sess.set("geraet_id", s.getString("geraet_id")); changed = true; }
                markRevoked(s.id);
                try { $app.delete(s); } catch (err) { /* already gone */ }
                return;
            }
            s.set("push", "");
            try { $app.save(s); } catch (err) { /* ignore */ }
        });
    } catch (err) { /* ignore */ }
    if (sess.getString("push") !== endpoint) { sess.set("push", endpoint); changed = true; }
    if (changed) { try { $app.save(sess); } catch (err) { /* ignore */ } }
}
function vergissPush(endpoint) {
    if (!endpoint || !schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "push = {:p}", "", 20, 0, { p: String(endpoint) }).forEach(s => {
            s.set("push", "");
            try { $app.save(s); } catch (err) { /* ignore */ }
        });
    } catch (err) { /* ignore */ }
}
function erneuerePush(alt, neu) {
    if (!alt || !neu || !schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "push = {:p}", "", 20, 0, { p: String(alt) }).forEach(s => {
            s.set("push", String(neu));
            try { $app.save(s); } catch (err) { /* ignore */ }
        });
    } catch (err) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// protection per network address
// ---------------------------------------------------------------------------------------------
function readIp(ip) {
    try {
        const p = String($app.store().get(IP_PREFIX + ip) || "").split("|");
        return { n: parseInt(p[0], 10) || 0, until: parseInt(p[1], 10) || 0, last: parseInt(p[2], 10) || 0, locks: parseInt(p[3], 10) || 0 };
    } catch (e) { return { n: 0, until: 0, last: 0, locks: 0 }; }
}
// Remaining lock of the address in seconds (0 = free)
function ipGesperrt(e) {
    const ip = clientIp(e);
    if (!ip) return 0;
    const l = readIp(ip);
    const rest = l.until - Date.now();
    return rest > 0 ? Math.ceil(rest / 1000) : 0;
}
// Count a failed attempt of the address. Returns: new lock in seconds (0 = not locked yet)
function ipFehlversuch(e) {
    const ip = clientIp(e);
    if (!ip) return 0;
    const now = Date.now();
    const l = readIp(ip);
    let n = (now - l.last > IP_FENSTER_MS) ? 1 : l.n + 1;
    let locks = (now - l.last > 2 * IP_FENSTER_MS) ? 0 : l.locks;
    let until = 0;
    if (n >= IP_MAX) {
        const seconds = Math.min(IP_MAX_SPERRE_S, 60 * Math.pow(2, locks));
        until = now + seconds * 1000;
        locks++;
        n = 0; // after the lock expires it counts afresh - the next lock gets longer
        protokoll().warnung("anmeldung", "Viele fehlgeschlagene Anmeldungen von der Adresse " + ip + " – für " + waitText(seconds) + " gesperrt.");
    }
    try { $app.store().set(IP_PREFIX + ip, n + "|" + until + "|" + now + "|" + locks); } catch (err) { /* ignore */ }
    return until ? Math.ceil((until - now) / 1000) : 0;
}
function waitText(seconds) {
    try { return require(`${__hooks}/pinn-dashboard.js`).waitText(seconds); }
    catch (e) { return Math.max(1, Math.round(seconds)) + " Sekunden"; }
}

// A profile was locked because of wrong passwords: error log + push to the admins
// (at most once per 15 minutes and profile)
function meldeSperre(familyId, username, seconds) {
    const fam = String(familyId || "");
    const who = String(username || "");
    protokoll().warnung("anmeldung", "Zu viele falsche Passwörter für „" + who + "“ – Profil für " + waitText(seconds) + " gesperrt.", { familie: fam });
    const key = MELDUNG_PREFIX + fam + ":" + who;
    try {
        const last = parseInt(String($app.store().get(key) || "0"), 10) || 0;
        if (Date.now() - last < 15 * 60 * 1000) return;
        $app.store().set(key, String(Date.now()));
    } catch (e) { /* ignore */ }
    let admins = [];
    try {
        admins = fam
            ? $app.findRecordsByFilter(USERS, "familie = {:f} && rolle = 'admin'", "", 0, 0, { f: fam })
            : $app.findRecordsByFilter(USERS, "rolle = 'hauptadmin'", "", 0, 0);
    } catch (e) { admins = []; }
    if (!admins.length) return;
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (e) { return; }
    admins.forEach(a => {
        try {
            push.notifyUser(a.id, {
                titel: "🔒 Anmeldung gesperrt",
                text: "Zu viele falsche Passwörter für „" + who + "“. Das Profil ist vorübergehend gesperrt – die Sperre lässt sich unter Konto → Profile verwalten aufheben.",
                url: "/?konto=1",
                tag: "sicherheit-sperre-" + (fam || "hauptadmin"),
                urgency: "high",
            });
        } catch (e) { /* ignore */ }
    });
}

// ---------------------------------------------------------------------------------------------
// Clean up (at night): sessions whose sign-in has surely expired
// ---------------------------------------------------------------------------------------------
// Merge duplicate entries: same profile + same device characteristics. The most recently used
// entry stays; older ones are only removed if they have not been used since the newer one was created
// (two really simultaneously used, identical devices thus stay separate).
// The push address moves to the remaining entry if it does not have one yet.
// Remove network addresses stored earlier (a single, fast database command)
function ipsLeeren() {
    if (!schemaReady()) return;
    try { $app.db().newQuery("UPDATE `" + COL + "` SET ip = '' WHERE ip != ''").execute(); }
    catch (err) { /* field missing or similar - ignore */ }
}

function doppelteZusammenfuehren() {
    if (!schemaReady()) return 0;
    ensureFelder();
    ipsLeeren();
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "id != ''", "", 0, 0); } catch (err) { recs = []; }
    const gruppen = {};
    recs.forEach(r => {
        const key = r.getString("benutzer") + "|" + (r.getString("art") || "app") + "|" + merkmalVon(r);
        (gruppen[key] = gruppen[key] || []).push(r);
    });
    let n = 0;
    Object.keys(gruppen).forEach(key => {
        const g = gruppen[key];
        if (g.length < 2) return;
        g.sort((a, b) => aktivMs(b) - aktivMs(a));
        const keep = g[0];
        const keepSeit = msOf(keep.getString("created"));
        let keepChanged = false;
        for (let i = 1; i < g.length; i++) {
            const alt = g[i];
            if (!keepSeit || aktivMs(alt) >= keepSeit) continue; // is still being used in parallel
            const altPush = alt.getString("push");
            let pushUebernommen = false;
            if (altPush && !keep.getString("push")) {
                keep.set("push", altPush);
                keepChanged = true;
                pushUebernommen = true;
            }
            if (!keep.getString("kennung") && alt.getString("kennung")) { keep.set("kennung", alt.getString("kennung")); keepChanged = true; }
            if (!keep.getString("geraet_id") && alt.getString("geraet_id")) { keep.set("geraet_id", alt.getString("geraet_id")); keepChanged = true; }
            if (!pushUebernommen && altPush && altPush !== keep.getString("push")) removePushOf(alt);
            markRevoked(alt.id);
            try { $app.delete(alt); n++; } catch (err) { /* already gone */ }
        }
        if (!keep.getString("merkmal")) { keep.set("merkmal", merkmalVon(keep)); keepChanged = true; }
        if (keepChanged) { try { $app.save(keep); } catch (err) { /* ignore */ } }
    });
    if (n) console.log("[Geräte] " + n + " doppelte Geräte-Einträge zusammengeführt.");
    // Leftover push subscriptions of devices that already have a session with push
    try {
        const users = {};
        recs.forEach(r => { users[r.getString("benutzer")] = true; });
        let m = 0;
        Object.keys(users).forEach(u => { m += waisenPushEntfernen(u); });
        if (m) console.log("[Geräte] " + m + " übrig gebliebene Push-Anmeldungen entfernt.");
    } catch (err) { /* ignore */ }
    return n;
}

function aufraeumen() {
    if (!schemaReady()) return;
    try { doppelteZusammenfuehren(); } catch (err) { console.log("[Geräte] Zusammenführen fehlgeschlagen: " + err.message); }
    let dauer = 0;
    try { dauer = Number(findCol(USERS).authToken.duration) || 0; } catch (e) { dauer = 0; }
    if (!(dauer > 0)) dauer = 30 * 86400;
    const grenze = new Date(Date.now() - (dauer + 86400) * 1000).toISOString();
    try {
        $app.db().newQuery("DELETE FROM `" + COL + "` WHERE zuletzt < {:g}").bind({ g: grenze }).execute();
    } catch (err) {
        console.log("[Geräte] Aufräumen fehlgeschlagen: " + err.message);
    }
}

module.exports = {
    COL,
    ensureSchema, pruefe, beimAnmelden, sidOf, clientIp,
    geraetKennung, merkmalOf, agentOhneVersion, msOf, doppelteZusammenfuehren, betterName, kurzId,
    liste, uebersicht, waisenPushEntfernen, abmelden, alleAbmelden, entferneAndere, entsperren, lockStatus, geraetMelden, umbenennen,
    merkePush, vergissPush, erneuerePush,
    ipGesperrt, ipFehlversuch, meldeSperre, waitText,
    aufraeumen,
};
