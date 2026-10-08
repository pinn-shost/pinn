// pb_hooks/pinn-sitzungen.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden
// (Routen, Anmelde-Hook und Prüfung je Anfrage in sitzungen.pb.js).
//
// Geräteverwaltung: Jede Anmeldung eines Profils (Passwort, Familien-Dashboard, Verlängern beim
// App-Start) gehört zu einer „Sitzung“ in der gesperrten Sammlung "sitzungen" – ein Datensatz je
// Gerät und Profil. In der App: Konto → „Angemeldete Geräte“ (eigene) bzw. für Admins unter
// Profil verwalten → „Geräte & Anmeldung“, für den Hauptadmin auf seinem Bildschirm.
//
//  - Die Sitzungs-ID steckt als zusätzlicher Wert „sid“ im Anmelde-Token (gleiche Signatur wie bei
//    PocketBase, Token bleibt für PocketBase ganz normal gültig). Jede Anfrage mit Token prüft, ob
//    es die Sitzung noch gibt – „Abmelden“ eines Geräts löscht sie, das Gerät bekommt danach nur
//    noch 401 mit dem Kopf „X-Pinn-Abgemeldet: 1“ und löscht seine pinn.-Daten.
//  - Die Prüfung je Anfrage ist schonend: das Ergebnis bleibt 60 Sekunden im Arbeitsspeicher,
//    „zuletzt aktiv“ wird höchstens alle 5 Minuten gespeichert.
//  - Ein Gerät meldet sich mit einer zufälligen Geräte-Kennung (X-Pinn-Geraet-Id) und einem
//    lesbaren Namen (X-Pinn-Geraet, z. B. „iPhone · App“). Meldet sich dasselbe Gerät mit demselben
//    Profil erneut an (z. B. am Familien-Dashboard), wird die vorhandene Sitzung weiterverwendet.
//  - Wiedererkennen eines Geräts (ohne Netzwerk-Adresse – die wechselt ständig), in dieser Reihenfolge:
//      1. Sitzungs-ID im bisherigen Token
//      2. Geräte-Cookie „pinn_geraet“ – setzt der Server selbst (HttpOnly, 400 Tage). Es übersteht
//         App-Updates und das Leeren des App-Speichers, weil die App es weder lesen noch löschen kann.
//      3. Geräte-Kennung der App (X-Pinn-Geraet-Id)
//      4. Gerätemerkmale: Profil + Art (App/Dashboard) + Gerätename + Gerätetyp/Browser (ohne
//         Versionsnummern, damit auch ein iOS- oder Browser-Update nichts ändert)
//    Damit legt ein Update der App kein neues Gerät mehr an.
//  - Doppelte Einträge von früher (gleiche Gerätemerkmale, das ältere seitdem nicht mehr benutzt)
//    werden beim Serverstart und nachts zusammengeführt – die Push-Adresse wandert dabei mit.
//  - Push: Die Push-Adresse eines Geräts wird seiner Sitzung zugeordnet. Wird das Gerät abgemeldet,
//    bekommt es auch keine Benachrichtigungen mehr.
//  - „Überall abmelden“ erneuert zusätzlich den Token-Schlüssel des Profils – damit sind auch ältere
//    Anmeldungen ohne Sitzungs-ID sofort ungültig.
//  - Anmeldungen von vor diesem Update haben noch keine Sitzungs-ID; sie bekommen eine beim
//    nächsten Öffnen der App (die App verlängert die Anmeldung bei jedem Start).
//
// Schutz gegen Durchprobieren (zusätzlich zur Sperre je Profil in pinn-dashboard.js):
//  - Zählt fehlgeschlagene Anmeldungen und unbekannte Familiennamen je Netzwerk-Adresse (IP).
//    Ab 20 Fehlversuchen innerhalb von 30 Minuten wird die Adresse gesperrt: 1 Minute, danach jeweils
//    doppelt so lang, höchstens 30 Minuten. Nur im Arbeitsspeicher, nach einem Neustart wieder bei 0.
//  - Wird ein Profil wegen zu vieler falscher Passwörter gesperrt, bekommen die Admins der Familie
//    (bzw. der Hauptadmin) eine Push-Nachricht und es steht im Fehlerprotokoll (Bereich „Anmeldung“).
//    Ein Admin kann die Sperre in der Geräteverwaltung des Profils aufheben.

const COL = "sitzungen";
const USERS = "benutzer";
const CACHE_PREFIX = "pinnSitz:";
const SCHEMA_KEY = "pinnSitzSchema";
const CHECK_MS = 60 * 1000;          // Sitzung höchstens einmal je Minute in der Datenbank prüfen
const TOUCH_MS = 5 * 60 * 1000;      // „zuletzt aktiv“ höchstens alle 5 Minuten speichern
const PIN_LOCK_PREFIX = "pinnPinSperre:"; // wie in pinn-dashboard.js
const IP_PREFIX = "pinnIpSperre:";
const IP_MAX = 20;
const IP_FENSTER_MS = 30 * 60 * 1000;
const IP_MAX_SPERRE_S = 30 * 60;
const MELDUNG_PREFIX = "pinnSperrMeldung:";
const FELDER_KEY = "pinnSitzFelder2";
const COOKIE = "pinn_geraet";
const COOKIE_TAGE = 400;
// Felder, die nach der ersten Version dazugekommen sind (werden bei Bedarf ergänzt)
const NEUE_FELDER = [
    { name: "kennung", max: 64 },   // Geräte-Cookie
    { name: "merkmal", max: 64 },   // Gerätemerkmale (Prüfsumme)
];

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function nowIso() { return new Date().toISOString(); }

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
function schemaReady() {
    try { if ($app.store().get(SCHEMA_KEY) === "1") return true; } catch (e) { /* prüfen */ }
    const ok = !!findCol(COL);
    if (ok) { try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* egal */ } }
    return ok;
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
// Fehlende neuere Felder ergänzen (einmal je Serverstart)
function ensureFelder() {
    try { if ($app.store().get(FELDER_KEY) === "1") return true; } catch (e) { /* prüfen */ }
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
    try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* egal */ }
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
        try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* egal */ }
        try { $app.store().set(FELDER_KEY, "1"); } catch (e) { /* egal */ }
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
// Anfrage: Token, Sitzungs-ID, Gerät, Adresse
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
// Sitzungs-ID aus dem Token der Anfrage ("" = keine)
function sidOf(e) {
    const c = claimsOf(tokenOf(e));
    return c ? cleanSid(c.sid) : "";
}
function clientIp(e) {
    let ip = "";
    // Caddy setzt X-Forwarded-For selbst (eingehende Werte von außen verwirft es) -> letzter Eintrag
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
    try { s = decodeURIComponent(s); } catch (err) { /* so lassen */ }
    return s.replace(/[\u0000-\u001F<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}
// Lesbarer Name aus dem Browser-Kennzeichen (falls die App keinen mitschickt, z. B. ältere Version)
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

// ---------------------------------------------------------------------------------------------
// Geräte-Cookie und Gerätemerkmale (Wiedererkennen ohne Netzwerk-Adresse)
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
    try { e.response.header().add("Set-Cookie", parts.join("; ")); } catch (err) { /* egal */ }
}
// Geräte-Cookie lesen bzw. neu vergeben. Rückgabe { id, neu }.
// Das Cookie wird bei jeder Anmeldung erneuert, damit es nicht abläuft.
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
// Browser-Kennzeichen ohne Versionsnummern (ein iOS-/Browser-Update ändert damit nichts)
function agentOhneVersion(ua) {
    return String(ua || "").replace(/\d+(?:[._]\d+)*/g, "#").replace(/\s+/g, " ").trim().slice(0, 400);
}
// Prüfsumme der Gerätemerkmale: Art + Gerätename + Browser-Kennzeichen (ohne Versionen)
function merkmalOf(art, name, agent) {
    const key = String(art || "app") + "|" + String(name || "").toLowerCase() + "|" + agentOhneVersion(agent);
    try { return String($security.sha256("pinn-geraet:" + key)).slice(0, 48); } catch (err) { return ""; }
}
function merkmalVon(rec) {
    return rec.getString("merkmal") || merkmalOf(rec.getString("art") || "app", rec.getString("name") || nameFromAgent(rec.getString("agent")), rec.getString("agent"));
}
// PocketBase-Datum ("2026-10-08 10:00:00.000Z") oder ISO-Text -> Millisekunden (0 = unbekannt)
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
// Zwischenspeicher je Sitzung: "1|<geprüft ms>|<zuletzt gespeichert ms>|<benutzer>" oder "0" (abgemeldet)
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
    try { $app.store().set(CACHE_PREFIX + sid, "1|" + checked + "|" + touched + "|" + user); } catch (e) { /* egal */ }
}
function markRevoked(sid) {
    try { $app.store().set(CACHE_PREFIX + sid, "0"); } catch (e) { /* egal */ }
}

function findSession(sid) {
    if (!sid || !schemaReady()) return null;
    try { return $app.findRecordById(COL, sid); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Prüfung je Anfrage (Middleware in sitzungen.pb.js). false = Sitzung abgemeldet -> 401
// ---------------------------------------------------------------------------------------------
function pruefe(e) {
    const a = e.auth;
    if (!a) return true;
    try { if (a.collection().name !== USERS) return true; } catch (err) { return true; }
    const sid = sidOf(e);
    if (!sid) return true;                 // Anmeldung von vor der Geräteverwaltung
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
        const ip = clientIp(e);
        if (ip) rec.set("ip", ip);
        $app.save(rec);
    } catch (err) { /* nächstes Mal */ }
}
function touch(sid, e, userId, now) {
    const rec = findSession(sid);
    if (!rec) { markRevoked(sid); return; }
    saveTouch(rec, e, now);
    writeCache(sid, now, now, userId);
}

// ---------------------------------------------------------------------------------------------
// Anmeldung (onRecordAuthRequest): Sitzung anlegen bzw. weiterverwenden, Token mit "sid" ausstellen
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
        // Gegenprobe: akzeptiert PocketBase das Token? Sonst bleibt es beim normalen Token.
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

    // 1) Dieselbe Sitzung weiterführen (Verlängern, Passwort ändern, „andere abmelden“)
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
    // 2) Geräte-Cookie – übersteht App-Updates und das Leeren des App-Speichers
    if (!sess && felder && kennung.id && !kennung.neu) {
        try { sess = $app.findFirstRecordByFilter(COL, "benutzer = {:u} && kennung = {:k}", { u: userId, k: kennung.id }); } catch (err) { sess = null; }
    }
    // 3) Geräte-Kennung der App (z. B. Familien-Dashboard, erneute Anmeldung)
    const deviceId = cleanDeviceId(header(e, "X-Pinn-Geraet-Id"));
    if (!sess && deviceId) {
        try { sess = $app.findFirstRecordByFilter(COL, "benutzer = {:u} && geraet_id = {:d}", { u: userId, d: deviceId }); } catch (err) { sess = null; }
    }
    // 4) Gerätemerkmale: gleiches Profil, gleiche Art, gleicher Gerätename und Browser
    //    (ohne Versionsnummern). Hat das Gerät schon ein eigenes Cookie, zählen nur Einträge
    //    ohne bzw. mit genau diesem Cookie – ein zweites, baugleiches Gerät bleibt so getrennt.
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
    const name = headerName || sess.getString("name") || nameFromAgent(agent);
    sess.set("familie", rec.getString("familie"));
    sess.set("name", name);
    if (agent) sess.set("agent", agent);
    const ip = clientIp(e);
    if (ip) sess.set("ip", ip);
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
        try { $app.save(sess); } catch (err) { /* egal */ }
    }
    if (!bound) {
        protokoll().warnung("system", "Geräteverwaltung: Eine Anmeldung konnte nicht mit ihrem Gerät verknüpft werden – einzelnes Abmelden geht dafür nur über „Überall abmelden“.", { benutzer: userId });
    }
    writeCache(sess.id, Date.now(), Date.now(), userId);
}

// ---------------------------------------------------------------------------------------------
// Rechte: eigenes Profil; Familien-Admins die Profile ihrer Familie; Hauptadmin alle
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
// Sperren (Anzeige und Aufheben)
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
// Liste und Abmelden
// ---------------------------------------------------------------------------------------------
function rowOf(r, currentSid) {
    return {
        id: r.id,
        name: r.getString("name") || nameFromAgent(r.getString("agent")),
        art: r.getString("art") || "app",
        ip: r.getString("ip"),
        zuletzt: r.getString("zuletzt"),
        seit: r.getString("created"),
        push: !!r.getString("push"),
        gebunden: r.getBool("gebunden"),
        dieses: r.id === currentSid,
    };
}
function liste(e, userId) {
    const rec = targetUser(e, userId);
    const currentSid = sidOf(e);
    let recs = [];
    if (schemaReady()) {
        try { recs = $app.findRecordsByFilter(COL, "benutzer = {:u}", "-zuletzt", 200, 0, { u: rec.id }); } catch (err) { recs = []; }
    }
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const out = {
        benutzer: { id: rec.id, username: rec.getString("username"), rolle: rec.getString("rolle") },
        eigenes: rec.id === e.auth.id,
        sitzungen: recs.map(r => rowOf(r, currentSid)),
        aktuellOhneSitzung: rec.id === e.auth.id && !currentSid,
    };
    if (lib.isAdmin(e)) out.sperre = lockStatus(rec);
    return out;
}

// Übersicht für „Profile verwalten“: je Profil der Familie Anzahl Geräte + Sperre
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
            $app.findRecordsByFilter(COL, "familie = {:f}", "", 0, 0, { f: fam }).forEach(r => {
                const u = r.getString("benutzer");
                counts[u] = (counts[u] || 0) + 1;
            });
        } catch (err) { /* leer */ }
    }
    const out = {};
    users.forEach(u => { out[u.id] = { geraete: counts[u.id] || 0, sperre: lockStatus(u) }; });
    return { profile: out };
}

// Push-Abos einer Sitzung entfernen (das Gerät bekommt dann keine Benachrichtigungen mehr)
function removePushOf(sess) {
    const endpoint = sess.getString("push");
    if (!endpoint) return;
    try {
        const abo = $app.findFirstRecordByFilter("push_abos", "endpoint = {:e}", { e: endpoint });
        if (abo.getString("benutzer") === sess.getString("benutzer")) $app.delete(abo);
    } catch (err) { /* schon weg */ }
}

// Echtzeit-Verbindungen eines Profils trennen – die anderen Geräte verbinden sich sofort neu,
// ein abgemeldetes Gerät bekommt dabei keinen Zugang mehr.
function trenneEchtzeit(userId) {
    try {
        const clients = $app.subscriptionsBroker().clients();
        Object.keys(clients).forEach(k => {
            try {
                const c = clients[k];
                const a = c.get("auth");
                if (a && a.id === userId) c.discard();
            } catch (err) { /* egal */ }
        });
    } catch (err) { /* nicht verfügbar */ }
}

function deleteSession(sess) {
    removePushOf(sess);
    markRevoked(sess.id);
    try { $app.delete(sess); } catch (err) { /* schon weg */ }
}

// Ein Gerät abmelden. id = Sitzungs-ID oder "dieses" (das anfragende Gerät)
function abmelden(e, id) {
    const want = String(id || "");
    const sid = want === "dieses" ? sidOf(e) : cleanSid(want);
    if (!sid) {
        if (want === "dieses") return { success: true };
        throw new Error("Gerät nicht gefunden.");
    }
    const sess = findSession(sid);
    if (!sess) { markRevoked(sid); return { success: true }; }
    targetUser(e, sess.getString("benutzer")); // Rechte prüfen (wirft)
    const userId = sess.getString("benutzer");
    const gebunden = sess.getBool("gebunden");
    deleteSession(sess);
    trenneEchtzeit(userId);
    return { success: true, dieses: sid === sidOf(e), gebunden: gebunden };
}

// Alle Geräte eines Profils abmelden. Eigenes Profil: das anfragende Gerät bleibt angemeldet und
// bekommt eine neue Anmeldung (Rückgabe rec, die Route schickt sie per recordAuthResponse zurück).
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
    // Übrige Push-Abos des Profils (z. B. von Geräten ohne Sitzung) ebenfalls entfernen
    try {
        $app.findRecordsByFilter("push_abos", "benutzer = {:u}", "", 0, 0, { u: rec.id }).forEach(a => {
            if (keepPush && a.getString("endpoint") === keepPush) return;
            try { $app.delete(a); } catch (err) { /* egal */ }
        });
    } catch (err) { /* keine Push-Sammlung */ }
    // Token-Schlüssel erneuern: alle bisherigen Anmeldungen (auch ohne Sitzungs-ID) werden ungültig
    try {
        rec.refreshTokenKey();
        $app.save(rec);
    } catch (err) {
        console.log("[Geräte] Token-Schlüssel nicht erneuert: " + err.message);
    }
    trenneEchtzeit(rec.id);
    return { rec: own ? $app.findRecordById(USERS, rec.id) : null, anzahl: n, own: own };
}

// Nach einer Passwortänderung bzw. einem Zurücksetzen: andere Sitzungen samt Push entfernen
function entferneAndere(userId, keepSid) {
    if (!schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "benutzer = {:u}", "", 0, 0, { u: String(userId) }).forEach(s => {
            if (keepSid && s.id === keepSid) return;
            deleteSession(s);
        });
    } catch (err) { /* egal */ }
    trenneEchtzeit(String(userId));
}

// ---------------------------------------------------------------------------------------------
// Push-Adresse der Sitzung zuordnen (push.pb.js)
// ---------------------------------------------------------------------------------------------
function merkePush(e, endpoint) {
    const sid = sidOf(e);
    if (!sid || !endpoint) return;
    const sess = findSession(sid);
    if (!sess || sess.getString("benutzer") !== e.auth.id) return;
    // Dieselbe Adresse gehörte vorher evtl. zu einer anderen Sitzung (anderes Profil auf dem Gerät)
    try {
        $app.findRecordsByFilter(COL, "push = {:p} && id != {:id}", "", 20, 0, { p: endpoint, id: sid }).forEach(s => {
            s.set("push", "");
            try { $app.save(s); } catch (err) { /* egal */ }
        });
    } catch (err) { /* egal */ }
    if (sess.getString("push") === endpoint) return;
    sess.set("push", endpoint);
    try { $app.save(sess); } catch (err) { /* egal */ }
}
function vergissPush(endpoint) {
    if (!endpoint || !schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "push = {:p}", "", 20, 0, { p: String(endpoint) }).forEach(s => {
            s.set("push", "");
            try { $app.save(s); } catch (err) { /* egal */ }
        });
    } catch (err) { /* egal */ }
}
function erneuerePush(alt, neu) {
    if (!alt || !neu || !schemaReady()) return;
    try {
        $app.findRecordsByFilter(COL, "push = {:p}", "", 20, 0, { p: String(alt) }).forEach(s => {
            s.set("push", String(neu));
            try { $app.save(s); } catch (err) { /* egal */ }
        });
    } catch (err) { /* egal */ }
}

// ---------------------------------------------------------------------------------------------
// Schutz je Netzwerk-Adresse
// ---------------------------------------------------------------------------------------------
function readIp(ip) {
    try {
        const p = String($app.store().get(IP_PREFIX + ip) || "").split("|");
        return { n: parseInt(p[0], 10) || 0, until: parseInt(p[1], 10) || 0, last: parseInt(p[2], 10) || 0, locks: parseInt(p[3], 10) || 0 };
    } catch (e) { return { n: 0, until: 0, last: 0, locks: 0 }; }
}
// Verbleibende Sperre der Adresse in Sekunden (0 = frei)
function ipGesperrt(e) {
    const ip = clientIp(e);
    if (!ip) return 0;
    const l = readIp(ip);
    const rest = l.until - Date.now();
    return rest > 0 ? Math.ceil(rest / 1000) : 0;
}
// Fehlversuch der Adresse zählen. Rückgabe: neue Sperre in Sekunden (0 = noch nicht gesperrt)
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
        n = 0; // nach Ablauf der Sperre zählt es neu – die nächste Sperre wird länger
        protokoll().warnung("anmeldung", "Viele fehlgeschlagene Anmeldungen von der Adresse " + ip + " – für " + waitText(seconds) + " gesperrt.");
    }
    try { $app.store().set(IP_PREFIX + ip, n + "|" + until + "|" + now + "|" + locks); } catch (err) { /* egal */ }
    return until ? Math.ceil((until - now) / 1000) : 0;
}
function waitText(seconds) {
    try { return require(`${__hooks}/pinn-dashboard.js`).waitText(seconds); }
    catch (e) { return Math.max(1, Math.round(seconds)) + " Sekunden"; }
}

// Profil wurde wegen falscher Passwörter gesperrt: Fehlerprotokoll + Push an die Admins
// (höchstens einmal je 15 Minuten und Profil)
function meldeSperre(familyId, username, seconds) {
    const fam = String(familyId || "");
    const who = String(username || "");
    protokoll().warnung("anmeldung", "Zu viele falsche Passwörter für „" + who + "“ – Profil für " + waitText(seconds) + " gesperrt.", { familie: fam });
    const key = MELDUNG_PREFIX + fam + ":" + who;
    try {
        const last = parseInt(String($app.store().get(key) || "0"), 10) || 0;
        if (Date.now() - last < 15 * 60 * 1000) return;
        $app.store().set(key, String(Date.now()));
    } catch (e) { /* egal */ }
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
        } catch (e) { /* egal */ }
    });
}

// ---------------------------------------------------------------------------------------------
// Aufräumen (nachts): Sitzungen, deren Anmeldung sicher abgelaufen ist
// ---------------------------------------------------------------------------------------------
// Doppelte Einträge zusammenführen: gleiches Profil + gleiche Gerätemerkmale. Der zuletzt benutzte
// Eintrag bleibt; ältere werden nur entfernt, wenn sie seit dem Anlegen des neueren nicht mehr
// benutzt wurden (zwei wirklich gleichzeitig genutzte, baugleiche Geräte bleiben also getrennt).
// Die Push-Adresse wandert zum bleibenden Eintrag, wenn der noch keine hat.
function doppelteZusammenfuehren() {
    if (!schemaReady()) return 0;
    ensureFelder();
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "id != ''", "", 0, 0); } catch (err) { recs = []; }
    if (recs.length < 2) return 0;
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
            if (!keepSeit || aktivMs(alt) >= keepSeit) continue; // wird noch parallel benutzt
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
            try { $app.delete(alt); n++; } catch (err) { /* schon weg */ }
        }
        if (!keep.getString("merkmal")) { keep.set("merkmal", merkmalVon(keep)); keepChanged = true; }
        if (keepChanged) { try { $app.save(keep); } catch (err) { /* egal */ } }
    });
    if (n) console.log("[Geräte] " + n + " doppelte Geräte-Einträge zusammengeführt.");
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
    geraetKennung, merkmalOf, agentOhneVersion, msOf, doppelteZusammenfuehren,
    liste, uebersicht, abmelden, alleAbmelden, entferneAndere, entsperren, lockStatus,
    merkePush, vergissPush, erneuerePush,
    ipGesperrt, ipFehlversuch, meldeSperre, waitText,
    aufraeumen,
};
