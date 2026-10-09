// pb_hooks/pinn-ortung.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Familie → Ortung (Live-Standorte, bekannte Orte, „Ich bin unterwegs“)
//
// Technik:
//  - Traccar (eigener Container „traccar“ in der docker-compose.yaml) sammelt die Positionen.
//    Handys senden mit der App „Traccar Client“ (iOS/Android, auch im Hintergrund), GPS-Tracker
//    (z. B. für den Hund) direkt per GT06/H02/Watch-Protokoll an die Ports des Traccar-Containers.
//  - Handys müssen dafür nichts Neues erreichen: Die Adresse <pinn.>/api/pinn/ortung/osmand nimmt die
//    Positionen an und reicht sie unverändert an Traccar (Port 5055, OsmAnd-Protokoll) weiter.
//  - pinn. liest die Positionen nur hier auf dem Server über die Traccar-API. Zugangsdaten zu Traccar
//    kommen nie in die App. Ohne Eintrag in der .env legt pinn. beim ersten Zugriff selbst ein
//    Traccar-Konto an (Zugang in pb_data/pinn_traccar.json).
//  - Kartenkacheln (OpenStreetMap) und die Adresssuche laufen ebenfalls über den Server, damit die
//    App nur mit dem NAS spricht. Kacheln werden in pb_data/pinn_kacheln zwischengespeichert.
//  - Zuhause: Ist unter Einstellungen → Zuhause eine Adresse festgelegt (pinn-zuhause.js), gibt es den
//    Ort „Zuhause“ automatisch (Push bei Ankunft und Verlassen). Seine Lage folgt immer der Adresse aus
//    den Einstellungen; Name, Umkreis und Push-Einstellungen bleiben hier änderbar (syncHome).
//
// Daten je Familie: Sammlung „ortung“ (gesperrt, nur über die Routen in ortung.pb.js), Feld „daten“:
//   { geraete: [{ id, memberId, name, emoji, typ: 'handy'|'tracker', uniqueId, traccarId, teilen, erstellt }],
//     orte:    [{ id, name, emoji, lat, lon, radius, zuhause, ankunft, verlassen, geraete: [], empfaenger: [],
//                // nur Läden (Adresse einer Einkaufsliste, angelegt aus Listen → Liste bearbeiten):
//                laden: <Listen-ID>, adresse, verweil (Min.), abhaken, erinnern, erledigtPush }],
//                // Ein Laden kann mehrere Filialen haben (z. B. zwei Rewe-Märkte): je Filiale ein Ort mit
//                // derselben Listen-ID. Verweil, Abhaken, Erinnern, Push gelten für alle Filialen gemeinsam.
//     unterwegs: { <Geräte-ID>: { seit, von, teilenVorher, name } },
//     heimwege: [{ id, geraet, memberId, name, seit, ende, grund: 'angekommen'|'beendet'|'abgelaufen', minuten }]
//                // beendete Heimwege (für Hinweis „angekommen“ in der App, höchstens 6 Std. gemerkt),
//     plaene:   [{ aufgabe, titel, listen: [], besucht: { <Listen-ID>: ms }, erinnert: {}, besucher, minuten, versuche }],
//     erledigt: [{ aufgabe, titel, zeit, memberId, wer, listen, minuten }],
//     offen:    { <Listen-ID>: Anzahl offener Artikel } }   // aus der App, für die Erinnerung im Laden
//
// Läden & geplante Einkäufe:
//  - Die App meldet ihre offenen „Einkauf planen“-Aufgaben samt Läden (Route /einkaeufe) – so muss der
//    Zeitplan nie die großen Familiendaten lesen.
//  - Hält sich ein Gerät mindestens „verweil“ Minuten (Standard 10) im Umkreis eines Ladens (egal welche
//    Filiale) auf, gilt der Laden als besucht. Sind alle Läden eines Plans (die eine Adresse haben) besucht, hakt der Server die
//    Aufgabe ab (pinn-aufgaben.js → setDone) und schickt auf Wunsch eine Push-Nachricht „Betrag eintragen“.
//    Die App zeigt den offenen Betrag danach unter der Glocke oben neben dem Familiennamen.
//  - Erinnerung beim Ankommen („Du bist bei Rewe – gehst du einkaufen?“), sobald auf der Liste des Ladens
//    etwas steht oder dort ein Einkauf geplant ist (Schalter „erinnern“ am Laden). Wie viele Artikel offen
//    sind, meldet die App mit derselben Route (/einkaeufe → offen: { <Listen-ID>: Anzahl }). Sind
//    mehrere Läden gleichzeitig in der Nähe, kommt eine gemeinsame Push-Nachricht.
//  - Solange das eigene Handy im Umkreis eines Ladens ist, liefert /sos die Läden unter „laeden“ –
//    die App zeigt daraus oben den Einkaufs-Hinweis (Banner) mit Link zur Liste.
//  Bewusst NICHT in familien_daten: der Zeitplan läuft jede Minute und soll nie die großen
//  Familiendaten lesen müssen.
//
// Heimweg („Ich bin unterwegs nach Hause“):
//  - Die Route /sos liefert neben den Hilferufen auch die laufenden Heimwege der Familie mit aktuellem
//    Standort, Adresse und Entfernung bis Zuhause (Luftlinie) sowie die in der letzten Stunde beendeten.
//    Die App zeigt daraus oben einen Hinweis (Banner) und ein Popup mit Karte und Anruf-Knöpfen.
//  - Die ID eines Heimwegs ist „<Geräte-ID>-<Startzeit>“, so erkennt die App neue Heimwege wieder.
//
// SOS (Notruf aus „Traccar Client“, vom SOS-Knopf eines GPS-Trackers oder vom SOS-Knopf im
//      Heimweg-Popup von pinn. – Route /sos-ausloesen, Quelle „pinn“):
//  - Sofort: Die App „Traccar Client“ schickt ihren Hilferuf über <pinn.>/api/pinn/ortung/osmand
//    (Parameter alarm=sos). pinn. erkennt ihn schon beim Weiterreichen – auch wenn Traccar gerade
//    nicht läuft – und alarmiert sofort die ganze Familie per Push.
//  - Sicherheitsnetz (jede Minute): Alarm-Ereignisse „sos“ aus Traccar (Handys, die direkt an
//    Port 5055 senden, GPS-Tracker mit SOS-Knopf). Doppelte Meldungen werden zusammengefasst.
//  - Daten je Familie in „ortung“, Feld sos: [{ id, geraet, memberId, name, zeit, pos, adresse,
//    quelle, anzahl, push, ende: { zeit, wer } }]. Aktiv bis zur Entwarnung (höchstens 12 Std.).
//  - Während eines SOS sieht die Familie den aktuellen Standort der Person auch dann, wenn sie
//    ihren Standort sonst nicht teilt (sie hat den Hilferuf selbst ausgelöst).
//  - Push an alle Profile der Familie (außer Gastkonten), Rückmeldung an die Person selbst.
//    In der App öffnet sich ein Warn-Popup mit Karte, Adresse, Uhrzeit, Genauigkeit und Anruf.
//
// Schonend:
//  - Positionen werden höchstens alle 5 Sekunden bei Traccar abgefragt (für alle Familien zusammen).
//  - Der Minuten-Zeitplan fragt Traccar nur, wenn irgendeine Familie Orte oder „unterwegs“ hat.
//  - Ortsereignisse nur für neue Positionen (Zeitstempel gemerkt in pb_data/pinn_ortung_status.json).
//
// Keine doppelten Meldungen:
//  - Sperre je Familie (withLock) beim Lesen–Ändern–Speichern; der Zeitplan speichert seine
//    Änderungen auf dem aktuellen Stand (saveCronCfg) statt mit dem Stand vom Beginn des Durchgangs.
//  - Ein Zeitplan-Durchgang läuft nie doppelt (CRON_LOCK).
//  - SOS: dieselbe Meldung (gleicher Zeitstempel) löst nichts Neues aus, auch nicht nach der Entwarnung.
//  - Ankunft/Verlassen: Verlassen nur bei sicher draußen liegender Position; gleiche Meldung
//    frühestens nach PUSH_PAUSE_MS wieder; nach der Heimweg-Ankunft keine zweite „angekommen“-Meldung.

const COL = "ortung";
const USERS = "benutzer";
const STATUS_FILE = "/pb_data/pinn_ortung_status.json";
const ZUGANG_FILE = "/pb_data/pinn_traccar.json";
const TILE_DIR = "/pb_data/pinn_kacheln";
const UA = "pinn-familienapp/1.0 (selbst gehostet)";
const POS_TTL_MS = 5000;
const LIVE_MS = 15 * 60 * 1000;          // so lange gilt ein Standort als „live“
const EVENT_MAX_AGE_MS = 30 * 60 * 1000; // ältere Positionen lösen keine Ortsereignisse aus
const UNTERWEGS_MAX_MS = 8 * 60 * 60 * 1000;
const MAX_GERAETE = 30;
const MAX_ORTE = 60;
const MAX_PLAENE = 40;
const MAX_FILIALEN = 10;                     // Adressen je Laden (Einkaufsliste)
const ERLEDIGT_MAX_MS = 4 * 24 * 60 * 60 * 1000;
const VERWEIL_POS_MAX_MS = 20 * 60 * 1000; // so lange gilt die letzte Position im Laden noch als „dort“
const SOS_AKTIV_MS = 12 * 60 * 60 * 1000;    // so lange bleibt ein SOS ohne Entwarnung aktiv
const SOS_BEHALTEN_MS = 24 * 60 * 60 * 1000; // beendete SOS werden danach entfernt
const SOS_ZUSAMMEN_MS = 3 * 60 * 1000;       // gleiche Meldung über zweiten Weg -> kein neuer Alarm
const SOS_WIEDER_MS = 2 * 60 * 1000;         // erneut gedrückt: frühestens dann wieder Push
const SOS_EREIGNIS_MAX_MS = 15 * 60 * 1000;  // ältere Traccar-Ereignisse lösen nichts mehr aus
const PUSH_PAUSE_MS = 10 * 60 * 1000;        // gleiche Ankunft/gleiches Verlassen frühestens dann wieder per Push
const SPRUNG_MS = 5 * 60 * 1000;             // „verlassen“ so kurz nach der Ankunft = GPS-Sprung, kein Push
const CRON_LOCK = "pinnOrtungZeitplanLaeuft";
const CRON_LOCK_MS = 5 * 60 * 1000;          // hängt ein Durchgang länger, darf der nächste trotzdem starten
const HEIMWEG_ZEIGEN_MS = 60 * 60 * 1000;     // beendete Heimwege zeigt die App noch so lange an
const HEIMWEG_BEHALTEN_MS = 6 * 60 * 60 * 1000;
const LADEN_PUSH_PAUSE_MS = 45 * 60 * 1000;   // „Gehst du einkaufen?“ je Laden frühestens dann wieder
const LADEN_HIER_MAX_MS = 60 * 60 * 1000;     // so lange gilt die letzte Position im Laden für den Hinweis oben
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
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* weiter */ }
    try { return toString(res.body); } catch (e) { /* weiter */ }
    return "";
}
function parseJson(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* weiter */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* egal */ }
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
    // UTF-8 kodieren, damit auch Umlaute im Passwort gehen
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
// Sammlung „ortung“ (je Familie ein Datensatz)
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
    try { $os.mkdirAll(TILE_DIR, 493); } catch (e) { /* egal */ }
}

function emptyCfg() { return { geraete: [], orte: [], unterwegs: {}, heimwege: [], plaene: [], erledigt: [], sos: [], offen: {} }; }
// Offene Artikel je Einkaufsliste (aus der App)
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

// Sperre je Familie für Lesen–Ändern–Speichern. Weiterreichen der Handy-Meldungen (SOS), der
// Minuten-Zeitplan und Klicks in der App laufen gleichzeitig in getrennten Umgebungen – ohne Sperre
// überschreibt der Langsamere die Änderung des anderen bzw. beide legen denselben Hilferuf an.
// $app.store() ist für alle Umgebungen gemeinsam.
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
        try { store.set(key, Date.now()); } catch (e) { /* ohne Sperre weiter */ }
    }
    try {
        return fn();
    } finally {
        if (store) { try { store.remove(key); } catch (e) { /* egal */ } }
    }
}

// ---------------------------------------------------------------------------------------------
// Zuhause aus den Einstellungen (pinn-zuhause.js) als Ort übernehmen
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
// Merkt sich „drinnen/draußen“ je Ort - nach dem Verschieben neu beginnen (sonst Fehlalarm „verlassen“)
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
// Wird von pinn-zuhause.js nach dem Speichern der Adresse aufgerufen
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

// Erstes Konto in Traccar anlegen. Traccar macht das erste Konto selbst zum Administrator –
// das Feld „administrator“ darf ohne Anmeldung NICHT mitgeschickt werden, sonst lehnt Traccar
// die Anlage mit „Administrator access required“ ab.
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
    // Konto mit dieser E-Mail gibt es schon (z. B. pinn_traccar.json gelöscht) -> neue Kennung erzeugen,
    // damit der nächste Versuch nicht wieder an der doppelten E-Mail scheitert
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
    let res;
    try { res = rawApi(method, path, body); } catch (e) { throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?)."); }
    if (res.statusCode === 401) {
        ensureTraccarUser();
        res = rawApi(method, path, body);
    }
    if (res.statusCode === 0) throw new Error("Traccar ist nicht erreichbar (Container „traccar“ gestartet?).");
    if (res.statusCode >= 400) {
        const t = bodyText(res).slice(0, 200);
        const err = new Error("Traccar: " + (t || ("Status " + res.statusCode)));
        err.status = res.statusCode;
        throw err;
    }
    return parseJson(res);
}

// Neueste Positionen aller Geräte (für alle Familien zusammen, 5 Sekunden zwischengespeichert)
function positionsAll(fresh) {
    const store = $app.store();
    if (!fresh) {
        try {
            const c = store.get("pinnOrtungPos");
            if (c && Date.now() - c.ts < POS_TTL_MS) return c.list;
        } catch (e) { /* weiter */ }
    }
    const list = api("GET", "/api/positions") || [];
    const slim = (Array.isArray(list) ? list : []).map(p => {
        const a = p.attributes || {};
        let akku = null;
        if (isFinite(a.batteryLevel)) akku = Math.round(Number(a.batteryLevel));
        else if (isFinite(a.battery) && Number(a.battery) <= 100 && Number(a.battery) > 5) akku = Math.round(Number(a.battery));
        return {
            traccarId: p.deviceId,
            lat: Number(p.latitude), lon: Number(p.longitude),
            zeit: Date.parse(p.fixTime || p.deviceTime || p.serverTime) || 0,
            server: Date.parse(p.serverTime || "") || 0, // Eingang bei Traccar (GPS-Zeit kann alt sein)
            genau: isFinite(p.accuracy) ? Math.round(Number(p.accuracy)) : null,
            tempo: isFinite(p.speed) ? Math.round(Number(p.speed) * 1.852) : null, // Knoten -> km/h
            kurs: isFinite(p.course) ? Math.round(Number(p.course)) : null,
            akku: akku,
            laedt: !!a.charge,
            alarm: a.alarm ? String(a.alarm) : "",
        };
    }).filter(p => isFinite(p.lat) && isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
    try { store.set("pinnOrtungPos", { ts: Date.now(), list: slim }); } catch (e) { /* egal */ }
    return slim;
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
// Status für die App
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
    // Zuhause aus den Einstellungen nachziehen (falls es vor dieser Version festgelegt wurde o. Ä.)
    const home = homeOf(familyId);
    if (home) {
        const r = applyHome(cfg, home);
        if (r.changed) {
            try { saveCfg(familyId, cfg); if (r.moved) clearPlaceState(r.id); } catch (err) { /* nur anzeigen */ }
        }
    }
    const out = {
        verbunden: true, fehler: "", admin: admin, ichMitglied: me,
        geraete: [], orte: cfg.orte.map(o => (home && o.zuhause) ? Object.assign({}, o, { auto: true }) : o),
        zuhause: home ? { lat: home.lat, lon: home.lon, label: home.ort || home.titel || "Zuhause", adresse: home.adresse || "" } : null,
        unterwegs: {}, jetzt: Date.now(),
        traccarAuto: !zugang().ausEnv,
        sos: cfg.sos.filter(a => sosAktiv(a) && !a.test).map(a => ({ id: a.id, geraet: a.geraet, memberId: a.memberId, zeit: a.zeit })),
    };
    let positions = [];
    if (cfg.geraete.length) {
        try { positions = positionsAll(false); } catch (err) { out.verbunden = false; out.fehler = err.message; }
    } else if (admin) {
        try { rawApi("GET", "/api/server", null, false); } catch (err) { out.verbunden = false; out.fehler = "Traccar ist nicht erreichbar (Container „traccar“ gestartet?)."; }
    }
    const now = Date.now();
    cfg.geraete.forEach(g => {
        const own = !!me && g.memberId === me;
        const row = { id: g.id, memberId: g.memberId, name: g.name, emoji: g.emoji || "", typ: g.typ, teilen: g.teilen !== false };
        if (admin || own) row.uniqueId = g.uniqueId;
        if (row.teilen) {
            const p = positions.find(x => x.traccarId === g.traccarId);
            if (p) {
                row.position = { lat: p.lat, lon: p.lon, zeit: p.zeit, genau: p.genau, tempo: p.tempo, kurs: p.kurs, akku: p.akku, laedt: p.laedt, ort: placeAt(cfg, p) };
                row.live = now - p.zeit < LIVE_MS;
            }
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
// Geräte (nur Admins der Familie)
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
    // Geräte-ID muss über alle Familien eindeutig sein
    const clash = allCfgs().some(x => x.cfg.geraete.some(g => g.uniqueId === uniqueId && !(x.familyId === familyId && g.id === id)));
    if (clash) throw new Error("Diese Geräte-ID ist schon vergeben.");
    let g = id ? cfg.geraete.find(x => x.id === id) : null;
    if (!g) {
        if (cfg.geraete.length >= MAX_GERAETE) throw new Error("Es sind schon " + MAX_GERAETE + " Geräte eingerichtet.");
        if (cfg.geraete.some(x => x.memberId === memberId && x.typ === typ)) throw new Error("Für dieses Mitglied ist schon ein solches Gerät eingerichtet.");
        g = { id: newId(), erstellt: Date.now(), teilen: true };
        cfg.geraete.push(g);
    }
    if (g.uniqueId && g.uniqueId !== uniqueId) { deleteTraccarDevice(g.traccarId); g.traccarId = 0; }
    g.memberId = memberId;
    g.name = name;
    g.emoji = cleanText(body.emoji, 8);
    g.typ = typ;
    g.uniqueId = uniqueId;
    if (!g.traccarId) g.traccarId = createTraccarDevice(name + " · " + familyId.slice(0, 6), uniqueId);
    saveCfg(familyId, cfg);
    try { $app.store().remove("pinnOrtungPos"); } catch (err) { /* egal */ }
    return { id: g.id };
}
function deleteDevice(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId || !lib.isAdmin(e)) throw new Error("Nur Admins der Familie können Geräte verwalten.");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.id));
    if (!g) return { ok: true };
    deleteTraccarDevice(g.traccarId);
    cfg.geraete = cfg.geraete.filter(x => x.id !== g.id);
    delete cfg.unterwegs[g.id];
    cfg.heimwege = cfg.heimwege.filter(h => h.geraet !== g.id);
    cfg.orte.forEach(o => { if (Array.isArray(o.geraete)) o.geraete = o.geraete.filter(x => x !== g.id); });
    saveCfg(familyId, cfg);
    return { ok: true };
}

// Standort teilen ein/aus (die Person selbst oder ein Admin)
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
// Orte
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
    // Laden einer Einkaufsliste: höchstens ein Ort je Liste
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
        // Lage verschoben -> „drinnen/draußen“ neu beginnen
        if (!isNew) clearPlaceState(place.id);
        // Gemeinsame Einstellungen gelten für alle Filialen desselben Ladens
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
    // Mit Zuhause aus den Einstellungen: Lage und Kennzeichen kommen immer von dort
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
// Laden einer Einkaufsliste mit allen Filialen auf einmal speichern (Listen → Liste bearbeiten)
// body: { laden: <Listen-ID>, name, filialen: [{ id?, lat, lon, adresse }], verweil, abhaken, erledigtPush, erinnern, ankunft }
//  - Filialen mit bekannter ID werden geändert, neue angelegt (die App vergibt die ID selbst, damit ein
//    wiederholtes Senden nach Verbindungsabbruch keine Doppelten anlegt), fehlende entfernt.
//  - Umkreis, Personen, Empfänger und „Verlassen“ je Filiale bleiben erhalten (einstellbar unter Familie → Orte).
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
        // Dieselbe Stelle doppelt gewählt -> nur einmal
        if (neu.some(x => distM(x.lat, x.lon, rlat, rlon) < 15)) return;
        let fid = cleanId(f.id);
        let p = fid ? alt.find(o => o.id === fid) : null;
        if (!p && fid && cfg.orte.some(o => o.id === fid)) fid = ""; // ID gehört zu einem anderen Ort
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
    // Filialen an der Stelle einfügen, an der der Laden bisher stand
    const idx = cfg.orte.findIndex(o => o.laden === ladenId);
    if (idx < 0) cfg.orte = andere.concat(neu);
    else cfg.orte = cfg.orte.slice(0, idx).filter(o => o.laden !== ladenId).concat(neu, cfg.orte.slice(idx).filter(o => o.laden !== ladenId));
    saveCfg(familyId, cfg);
    const ids = neu.map(p => p.id);
    // Entfernte und verschobene Filialen: „drinnen/draußen“ neu beginnen
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
        // Einkaufsliste gelöscht bzw. alle Adressen entfernt: alle Filialen dieses Ladens löschen
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
// „Ich bin unterwegs“ (Heimweg): Push an die Familie, endet automatisch beim Ankommen zu Hause
// ---------------------------------------------------------------------------------------------
function heimwegId(geraetId, seit) { return String(geraetId) + "-" + String(Number(seit || 0)); }
// Beendet einen laufenden Heimweg und merkt ihn (für „angekommen“ in der App). Gibt den Eintrag zurück.
function heimwegEnde(cfg, geraetId, grund, now) {
    const u = cfg.unterwegs && cfg.unterwegs[geraetId];
    if (!u) return null;
    const g = cfg.geraete.find(x => x.id === geraetId);
    if (g && u.teilenVorher === false) g.teilen = false;
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
        const g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy") || cfg.geraete.find(x => x.memberId === me);
        if (!g) throw new Error("Für dich ist noch kein Gerät für die Ortung eingerichtet.");
        const home = cfg.orte.find(o => o.zuhause);
        if (body.an) {
            if (!home) throw new Error("Lege zuerst unter Einstellungen → Zuhause eure Adresse fest.");
            const alt = cfg.unterwegs[g.id];
            if (alt && now - Number(alt.seit || 0) < UNTERWEGS_MAX_MS) return { ok: true, id: heimwegId(g.id, alt.seit) };
            const name = memberName(familyId, me, g.name);
            cfg.unterwegs[g.id] = { seit: now, von: e.auth.id, teilenVorher: g.teilen !== false, name: name };
            g.teilen = true;
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
// Geplante Einkäufe (aus der App): offene „Einkauf planen“-Aufgaben mit ihren Läden
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
    // Offene Artikel je Liste (ältere App-Stände schicken nichts mit -> alten Stand behalten)
    if (body && body.offen !== undefined) {
        const offen = cleanOffen(body.offen);
        if (JSON.stringify(offen) !== JSON.stringify(cfg.offen || {})) { cfg.offen = offen; changed = true; }
    }
    if (changed) saveCfg(familyId, cfg);
    return { ok: true, erledigt: cfg.erledigt };
}

// Orte (Filialen) eines Ladens, an dem eine Liste hängt
function shopPlaces(cfg, listId) { return cfg.orte.filter(o => o.laden === listId); }

// Gerät war lange genug im Laden: bei allen offenen Plänen mit dieser Liste vermerken
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

// Pläne, deren Läden (mit Adresse) alle besucht sind, abhaken
function completePlans(familyId, cfg, getUsers, now) {
    let changed = false;
    const rest = [];
    cfg.plaene.forEach(p => {
        // je Liste ein Laden – besucht ist er, sobald eine seiner Filialen besucht wurde
        const shops = p.listen.map(id => shopPlaces(cfg, id).filter(o => o.abhaken !== false)).filter(g => g.length);
        if (!shops.length || !shops.every(g => p.besucht && p.besucht[g[0].laden])) { rest.push(p); return; }
        const users = getUsers();
        const u = users.find(x => x.mitglied === p.besucher) || users[0] || null;
        try {
            require(`${__hooks}/pinn-aufgaben.js`).setDone(familyId, p.aufgabe, true, u ? u.id : "");
        } catch (err) {
            // Aufgabe (noch) nicht auf dem Server, z. B. offline angelegt -> später erneut versuchen
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
// Spur (Verlauf) eines Geräts
// ---------------------------------------------------------------------------------------------
function track(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.id === cleanId(body.geraet));
    if (!g || g.teilen === false || !g.traccarId) return { punkte: [] };
    const hours = num(body.stunden, 1, 48, 6);
    const to = new Date(), from = new Date(Date.now() - hours * 3600 * 1000);
    const list = api("GET", "/api/positions?deviceId=" + Number(g.traccarId) + "&from=" + encodeURIComponent(from.toISOString()) + "&to=" + encodeURIComponent(to.toISOString())) || [];
    let pts = (Array.isArray(list) ? list : [])
        .filter(p => isFinite(p.latitude) && isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0) && !(isFinite(p.accuracy) && p.accuracy > 300))
        .map(p => [Math.round(p.latitude * 1e5) / 1e5, Math.round(p.longitude * 1e5) / 1e5, Date.parse(p.fixTime) || 0]);
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
// Adresssuche (Nominatim, über den Server)
// ---------------------------------------------------------------------------------------------
function search(q, lat, lon) {
    let url;
    if (q) {
        url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=de&q=" + encodeURIComponent(String(q).slice(0, 160));
    } else if (isFinite(lat) && isFinite(lon)) {
        url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=de&lat=" + Number(lat) + "&lon=" + Number(lon);
    } else return { treffer: [] };
    const key = "pinnOrtungSuche:" + url;
    try { const c = $app.store().get(key); if (c && Date.now() - c.ts < 6 * 3600 * 1000) return c.data; } catch (e) { /* weiter */ }
    const res = $http.send({ url: url, method: "GET", headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" }, timeout: 15 });
    if (res.statusCode !== 200) throw new Error("Adresssuche gerade nicht möglich (Status " + res.statusCode + ").");
    const j = parseJson(res);
    const arr = Array.isArray(j) ? j : (j && j.lat ? [j] : []);
    const data = { treffer: arr.slice(0, 6).map(t => ({ name: String(t.display_name || ""), lat: Number(t.lat), lon: Number(t.lon) })).filter(t => isFinite(t.lat) && isFinite(t.lon)) };
    try { $app.store().set(key, { ts: Date.now(), data: data }); } catch (e) { /* egal */ }
    return data;
}

// ---------------------------------------------------------------------------------------------
// Kartenkacheln (OpenStreetMap) mit Zwischenspeicher
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
    } catch (e) { /* nicht im Speicher */ }
    const res = $http.send({ url: "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png", method: "GET", headers: { "User-Agent": UA }, timeout: 15 });
    if (res.statusCode !== 200) return null;
    const bytes = bytesOf(res);
    if (!bytes) return null;
    try { $os.mkdirAll(dir, 493); $os.writeFile(path, bytes, 420); } catch (e) { /* nur durchreichen */ }
    return bytes;
}

// ---------------------------------------------------------------------------------------------
// Positionen der Handys an Traccar weiterreichen (OsmAnd-Protokoll)
// ---------------------------------------------------------------------------------------------
function forwardOsmand(e) {
    const info = e.requestInfo();
    const params = [];
    const flat = {}; // alle übergebenen Werte (für die SOS-Erkennung)
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

    // 1. Hilferuf? Zuerst auslösen – unabhängig davon, ob Traccar gerade antwortet.
    //    Beispiel (Traccar Client): /?id=123456&lat=49.8728&lon=8.6512&timestamp=1711800000&batt=85&alarm=sos
    let merged = {}, raw = "", sos = false, sosFehler = "";
    try {
        merged = Object.assign({}, flat, (body && typeof body === "object") ? body : {});
        raw = rawRequestText(e, flat, body);
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

    // 2. Position unverändert an Traccar (OsmAnd, Port 5055) weiterreichen
    const url = osmandUrl() + "/" + (params.length ? "?" + params.join("&") : "");
    let status = 502;
    try {
        const res = $http.send({ url: url, method: (send || e.request.method === "POST") ? "POST" : "GET", headers: headers, body: send, timeout: 10 });
        status = res.statusCode || 502;
    } catch (err) {
        status = 502;
    }
    if (sos && !sosFehler && status >= 400) status = 200; // die App soll den Hilferuf nicht endlos wiederholen
    logOsmand(merged, raw, sos, status, sosFehler);
    return status;
}

// Kommt eine Meldung der App „Traccar Client“ an der Hauptadresse an („/“ statt /api/pinn/ortung/osmand)?
// So funktioniert es auch, wenn in der App nur https://<pinn.> als Server eingetragen ist.
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
    } catch (err) { /* keine Ortungsmeldung */ }
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
// Notrufnummern, die ein Profil in pinn. eingestellt hat (Einstellungen → Sprache & Region; liegen
// mit dem persönlichen Design im Profil). Ohne Angabe: Deutschland (110/112).
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

// alarm=sos irgendwo in der Meldung (alte App: Parameter, neue App: JSON, auch verschachtelt)
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
// Gesamte Meldung als Text (Adresszeile + Inhalt) – findet „alarm=sos“ auch in verschachtelten
// oder als Text verpackten Feldern (z. B. location={"extras":{"alarm":"sos"}})
function rawRequestText(e, flat, body) {
    const parts = [];
    try { parts.push(String(e.request.url.rawQuery || "")); } catch (err) { /* egal */ }
    try { parts.push(JSON.stringify(flat || {})); } catch (err) { /* egal */ }
    try { parts.push(JSON.stringify(body || {})); } catch (err) { /* egal */ }
    let t = parts.join(" ");
    try { t += " " + decodeURIComponent(t.replace(/\+/g, " ")); } catch (err) { /* egal */ }
    return t;
}
function textHasSos(t) {
    t = String(t || "");
    return /(^|[?&\s{,])["']?(alarm|event|alarmtype)["']?\s*[:=]\s*["']?sos(["'&,}\s]|$)/i.test(t) ||
        /\\?"(alarm|event)\\?"\s*:\s*\\?"sos\\?"/i.test(t);
}
// Felder, die als JSON-Text kommen, auspacken
function unpack(v) {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t.charAt(0) !== "{" && t.charAt(0) !== "[") return v;
    try { return JSON.parse(t); } catch (e) { return v; }
}
// Protokoll der letzten Meldungen (nur im Speicher) – für Einstellungen → Ortung
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
    } catch (e) { /* egal */ }
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
    if (isFinite(n) && n > 0) return n < 1e11 ? n * 1000 : n; // Sekunden oder Millisekunden
    const t = Date.parse(String(v));
    return isFinite(t) ? t : 0;
}

// Position und Geräte-ID aus der Meldung der App „Traccar Client“ lesen
// Geräte-IDs tolerant vergleichen (Leerzeichen, Groß-/Kleinschreibung)
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
    if (!g || !g.traccarId) return null;
    try {
        const p = positionsAll(true).find(x => x.traccarId === g.traccarId);
        return p ? { lat: p.lat, lon: p.lon, genau: p.genau, zeit: p.zeit, akku: p.akku } : null;
    } catch (e) { return null; }
}

// Kurze Adresse („Musterstraße 5, 12345 Musterstadt“), höchstens 5 Sekunden warten
function shortAddress(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) return "";
    const key = "pinnSosAdr:" + lat.toFixed(4) + "," + lon.toFixed(4);
    try { const c = $app.store().get(key); if (c && Date.now() - c.ts < 6 * 3600 * 1000) return c.name; } catch (e) { /* weiter */ }
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
    if (name) { try { $app.store().set(key, { ts: Date.now(), name: name }); } catch (e) { /* egal */ } }
    return name;
}

function memberName(familyId, memberId, fallback) {
    try {
        const lib = require(`${__hooks}/pinn-benutzer.js`);
        const members = (lib.loadFamilyDataFor(familyId) || {}).members || [];
        const m = members.find(x => x.id === memberId);
        if (m && m.name) return String(m.name);
    } catch (e) { /* Gerätename */ }
    return fallback || "Jemand";
}
function hhmm(ms) {
    const t = new Date(ms + tzOffset(ms));
    return ("0" + t.getUTCHours()).slice(-2) + ":" + ("0" + t.getUTCMinutes()).slice(-2);
}

// Löst einen SOS aus bzw. aktualisiert einen laufenden. quelle: "app" | "traccar" | "pinn"
// Gibt die ID des Hilferufs zurück.
// Gegen doppelte Alarme:
//  - Sperre je Familie: Weiterreichen (Traccar Client) und Minuten-Prüfung (Traccar-Ereignis) können
//    gleichzeitig laufen. Ohne Sperre sah keiner der beiden den Hilferuf des anderen und beide
//    legten einen eigenen an – mit eigener Push-Nachricht.
//  - Der Hilferuf ist gespeichert, BEVOR die Adresse gesucht (bis 5 s) und Push verschickt wird.
//  - Dieselbe Meldung noch einmal (gleicher Zeitstempel der Position): Traccar Client wiederholt bei
//    schlechtem Netz bzw. reicht gepufferte Meldungen später nach, Traccar meldet sie zusätzlich als
//    Ereignis und als Position. Das gilt auch nach der Entwarnung – kein neuer Alarm.
//  - „anzahl“ (die App zeigt das Popup erneut) steigt nur, wenn wirklich erneut gedrückt wurde und
//    deshalb auch eine neue Push-Nachricht rausgeht.
function triggerSos(familyId, geraetId, pos, quelle) {
    const now = Date.now();
    // Zeitstempel der Meldung (nicht beim SOS-Knopf in pinn. – dort kann die letzte Traccar-Position
    // bei zwei Hilferufen hintereinander dieselbe sein)
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
            // gleiche Meldung über den zweiten Weg (App direkt + Traccar-Ereignis): nur Standort nachtragen
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

    // Adresse erst jetzt (der Hilferuf ist schon gespeichert) und nachtragen
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

// Sicherheitsnetz: Alarm-Ereignisse „sos“ aus Traccar (direkt gesendet oder GPS-Tracker)
function checkSosEvents() {
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
    // Zusätzlich: neueste Position eines Geräts trägt alarm=sos (falls Traccar kein Ereignis anlegt)
    let positions = [];
    try { positions = positionsAll(true); } catch (e) { positions = []; }
    positions.forEach(p => {
        // Alter nach Eingang bei Traccar – die GPS-Zeit des Handys kann drinnen Minuten alt sein
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
    // alte Merker entfernen
    Object.keys(st).forEach(k => {
        if (k.indexOf("sosev|") === 0 && now - Number(st[k] || 0) > 60 * 60 * 1000) { delete st[k]; changed = true; }
    });
    if (changed) writeJsonFile(STATUS_FILE, st);
}

// SOS-Knopf in pinn. (Heimweg-Popup „Ich bin unterwegs“): löst für das eigene Gerät denselben
// Alarm aus wie der SOS-Knopf in „Traccar Client“. Standort: letzte Traccar-Position bzw. – falls
// mitgeschickt und mindestens so brauchbar – der Standort aus dem Browser.
function sosAusloesen(e, body) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const me = memberOf(e);
    const nr = e.auth ? notrufFuer(e.auth.id).text : "110/112";
    if (!familyId || !me) throw new Error("Dein Profil ist mit keinem Familienmitglied verknüpft – bitte direkt anrufen (" + nr + ").");
    const cfg = loadCfg(familyId);
    const g = cfg.geraete.find(x => x.memberId === me && x.typ === "handy") || cfg.geraete.find(x => x.memberId === me);
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

// Für die App: laufende und gerade beendete SOS der eigenen Familie, mit aktuellem Standort –
// dazu die laufenden (und in der letzten Stunde beendeten) Heimwege
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
        if (row.aktiv && g && g.traccarId) {
            const p = positions.find(x => x.traccarId === g.traccarId);
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
        const p = g.traccarId ? positions.find(x => x.traccarId === g.traccarId) : null;
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
// Läden, in deren Umkreis das eigene Handy gerade ist (Stand des Minuten-Zeitplans) – für den
// Einkaufs-Hinweis oben in der App. Nur, solange die letzte Position frisch genug ist.
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
// Adresse des aktuellen Standorts: nur neu nachschlagen, wenn sich die Person bewegt hat (schont Nominatim)
function currentAddress(sosId, lat, lon) {
    const key = "pinnSosAkt:" + sosId;
    let c = null;
    try { c = $app.store().get(key); } catch (e) { c = null; }
    if (c && (distM(lat, lon, c.lat, c.lon) < 30 || Date.now() - c.ts < 20000)) return c.name;
    const name = shortAddress(lat, lon) || (c ? c.name : "");
    try { $app.store().set(key, { lat: lat, lon: lon, name: name, ts: Date.now() }); } catch (e) { /* egal */ }
    return name;
}

// Protokoll der letzten Meldungen der eigenen Geräte (nur Admins)
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

// SOS-Test (nur Admins): gleicher Ablauf wie ein echter Hilferuf, Push und Popup aber nur für mich
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

// Entwarnung (jedes Familienmitglied außer Gastkonten): Push an alle
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
// Zeitplan (jede Minute): Ankommen / Verlassen der Orte, Heimweg
// ---------------------------------------------------------------------------------------------
// Läuft der vorige Durchgang noch (langsamer Push-Versand, Traccar, Adresssuche), wird dieser
// ausgelassen. Sonst sehen zwei Durchgänge dieselbe Ankunft und schicken die Nachricht doppelt.
// ---------------------------------------------------------------------------------------------
// „Gehst du einkaufen?“ – Push beim Ankommen im Laden (in der Sprache des Profils)
// ---------------------------------------------------------------------------------------------
function langOfUser(userId) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign($app.findRecordById(USERS, userId)).werte || {}; } catch (e) { w = {}; }
    const s = String(w.sprache || "");
    if (["de", "en", "fr", "es"].indexOf(s) >= 0) return s;
    const land = String(w.land || "").toUpperCase();
    if (["DE", "AT", "CH", "LI", "LU"].indexOf(land) >= 0) return "de";
    if (["FR", "BE", "MC"].indexOf(land) >= 0) return "fr";
    if (["ES", "MX", "AR", "CO", "CL", "PE"].indexOf(land) >= 0) return "es";
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
        try { store.set(CRON_LOCK, Date.now()); } catch (e) { /* egal */ }
    }
    try {
        runCronInner();
    } finally {
        if (store) { try { store.remove(CRON_LOCK); } catch (e) { /* egal */ } }
    }
}

// Speichert, was der Zeitplan geändert hat, auf dem AKTUELLEN Stand. Der Zeitplan hat die Daten zu
// Beginn gelesen; ein Hilferuf, ein gerade gestarteter oder beendeter Heimweg, neue Orte oder Pläne
// aus der Zwischenzeit dürfen dabei nicht überschrieben werden.
function saveCronCfg(familyId, cfg, beendet, planIdsVorher) {
    withLock(lockKey(familyId), () => {
        const cur = loadCfg(familyId);
        // vom Zeitplan beendete Heimwege (nur, wenn inzwischen nicht neu gestartet)
        beendet.forEach(b => {
            const u = cur.unterwegs[b.k];
            if (!u) return;
            if (b.seit !== null && Number(u.seit) !== b.seit) return;
            const g = cur.geraete.find(x => x.id === b.k);
            if (g && u.teilenVorher === false) g.teilen = false;
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
        // Pläne: Stand des Zeitplans (besucht, erinnert …), abgehakte entfernen, neue aus der App behalten
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
    const fams = allCfgs().filter(f => f.cfg.geraete.length && (f.cfg.orte.length || Object.keys(f.cfg.unterwegs || {}).length));
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
        const beendet = []; // { k: Geräte-ID, seit } – vom Zeitplan beendete Heimwege
        let users = null;
        const getUsers = () => users || (users = usersOfFamily(familyId));

        // Abgelaufene Heimwege beenden
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
            if (g.teilen === false || !g.traccarId) return;
            const p = positions.find(x => x.traccarId === g.traccarId);
            if (!p || now - p.zeit > EVENT_MAX_AGE_MS) return;
            if (p.genau !== null && p.genau > 500) return;
            const posKey = "pos|" + familyId + "|" + g.id;
            const neu = !(st[posKey] && st[posKey] >= p.zeit);
            if (neu) {
                st[posKey] = p.zeit;
                stChanged = true;
                const unterwegs = cfg.unterwegs && cfg.unterwegs[g.id];
                const imLaden = []; // gerade angekommen: Läden mit offener Liste oder geplantem Einkauf
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
                    // Verlassen nur, wenn die Position auch mit ihrer Ungenauigkeit sicher draußen liegt –
                    // ein ungenauer Ausreißer (z. B. ± 300 m im Haus) löste sonst „verlassen“ und gleich
                    // danach ein zweites „angekommen“ aus
                    else if (d > r + puffer && (!p.genau || d - p.genau > r)) inside = 0;
                    if (inside === undefined || inside === prev) return;
                    st[key] = inside;
                    // Verweildauer (nur Läden): Beginn merken bzw. beim Verlassen zurücksetzen
                    if (o.laden) {
                        if (inside === 1) st[seitKey] = p.zeit;
                        else { delete st[seitKey]; delete st[dwKey]; }
                    }
                    if (prev === undefined) return; // erste Beobachtung: nur merken
                    // Laden: „Gehst du einkaufen?“, sobald auf der Liste etwas steht oder dort ein Einkauf
                    // geplant ist (gesammelt – mehrere Läden in der Nähe = eine Nachricht, siehe unten)
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
                    // Heimweg beendet
                    if (inside === 1 && o.zuhause && unterwegs && cfg.unterwegs[g.id]) {
                        beendet.push({ k: g.id, seit: Number(unterwegs.seit) });
                        const hw = heimwegEnde(cfg, g.id, "angekommen", now);
                        const mins = hw ? hw.minuten : 1;
                        const wer = (hw && hw.name) || g.name;
                        cfgChanged = true;
                        // die normale Meldung „ist zu Hause angekommen“ entfällt (sonst kommt sie doppelt)
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
                        // gerade erst gemeldet (Heimweg-Ankunft oder kurzer GPS-Sprung hinaus und zurück)
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
            // Verweilen im Laden (auch ohne neue Position: das Handy meldet sich im Stehen selten)
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
        // Alle Läden eines geplanten Einkaufs besucht -> Aufgabe abhaken
        if (cfg.plaene.length && completePlans(familyId, cfg, getUsers, now)) cfgChanged = true;
        if (cfgChanged) { try { saveCronCfg(familyId, cfg, beendet, planIdsVorher); } catch (e) { console.log("[Ortung] Speichern fehlgeschlagen: " + e.message); } }
    });

    // Alte Einträge (gelöschte Geräte/Orte) gelegentlich entfernen
    if (Math.random() < 0.02) {
        const valid = {};
        fams.forEach(f => f.cfg.geraete.forEach(g => { valid[f.familyId + "|" + g.id] = true; }));
        Object.keys(st).forEach(k => {
            if (k.indexOf("sosev|") === 0) return; // verwaltet checkSosEvents selbst
            const parts = k.split("|");
            if (!valid[parts[1] + "|" + parts[2]]) { delete st[k]; stChanged = true; }
        });
    }
    if (stChanged) {
        // checkSosEvents kann die Datei in diesem Lauf schon geändert haben -> deren Einträge übernehmen
        const cur = readJsonFile(STATUS_FILE) || {};
        Object.keys(cur).forEach(k => { if (k.indexOf("sosev|") === 0 && st[k] === undefined) st[k] = cur[k]; });
        writeJsonFile(STATUS_FILE, st);
    }
}

// Mitteleuropäische Zeit (MEZ/MESZ) für die Uhrzeit in der Nachricht
function tzOffset(utcMs) {
    const d = new Date(utcMs);
    const y = d.getUTCFullYear();
    const lastSun = (m) => { const t = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, t.getUTCDate() - t.getUTCDay(), 1); };
    return (utcMs >= lastSun(2) && utcMs < lastSun(9)) ? 2 * 3600 * 1000 : 3600 * 1000;
}

module.exports = {
    COL, ensureSchema, status, saveDevice, deleteDevice, setSharing, savePlace, saveShop, deletePlace,
    setUnterwegs, track, search, tile, forwardOsmand, isOsmandRequest, runCron, syncHome, syncPlans,
    sosList, sosEnde, sosTest, sosAusloesen, osmandLog,
};
