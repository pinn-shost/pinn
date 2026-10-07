// pb_hooks/pinn-einrichtung.js
// Ersteinrichtung von pinn. (Assistent für den Hauptadmin) – gemeinsame Funktionen für einrichtung.pb.js.
// In PocketBase läuft jeder Handler in einer eigenen Umgebung, deshalb liegt alles hier und wird per
// require() geladen.
//
// Ablauf:
//  - Der Assistent (pb_public/einrichtung.js) schickt die Werte (DuckDNS, Google, KI, Home Assistant …).
//  - Gespeichert wird im Ordner /pinn_konfig (auf dem NAS: <Projekt>/konfig):
//      einrichtung.json  = Quelle aller Werte (nur für root lesbar)
//      pinn.env          = dieselben Werte als Shell-Datei – wird von den Containern pocketbase, caddy,
//                          duckdns, ha-netz und tailscale beim Start gelesen (siehe docker-compose.yaml)
//  - caddy, duckdns, ha-netz und tailscale bemerken Änderungen selbst und starten sich neu.
//  - pocketbase liest die Werte nur beim Start: nach dem Abschließen startet sich pinn. selbst neu
//    (Docker holt den Container mit „restart: unless-stopped“ sofort zurück).
//  - Werte aus der .env bzw. docker-compose.yaml gelten weiter, solange sie im Assistenten nicht
//    geändert wurden. Ein im Assistenten geleertes Feld überschreibt die .env mit „leer“.

const DIR = "/pinn_konfig";
const JSON_FILE = DIR + "/einrichtung.json";
const ENV_FILE = DIR + "/pinn.env";
const NEUSTART_FILE = DIR + "/.neustart";
const HA_STATUS_FILE = DIR + "/ha-netz.status";
const PORT_STANDARD = "8443";
const BOOT_KEY = "pinnEinrichtungBoot";

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

// Alle Werte, die der Assistent verwaltet. geheim = wird nie im Klartext an die App zurückgegeben.
const FELDER = {
    NAS_IP: { geheim: false, pruef: (v) => IPV4.test(v) },
    DUCKDNS_SUBDOMAIN: {
        geheim: false,
        sauber: (v) => v.toLowerCase().replace(/^https?:\/\//, "").replace(/\.duckdns\.org.*$/, "").replace(/[\/:].*$/, ""),
        pruef: (v) => /^[a-z0-9][a-z0-9-]{0,62}$/.test(v),
    },
    DUCKDNS_TOKEN: { geheim: true, sauber: (v) => v.replace(/\s+/g, "").toLowerCase(), pruef: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) },
    PINN_ADRESSE: { geheim: false, sauber: (v) => v.replace(/\s+/g, "").replace(/\/+$/, ""), pruef: (v) => /^https:\/\/[a-z0-9.-]+(:\d{2,5})?$/i.test(v) },
    PINN_GOOGLE_CLIENT_ID: { geheim: false, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => /^[0-9a-z-]+\.apps\.googleusercontent\.com$/i.test(v) },
    PINN_GOOGLE_CLIENT_SECRET: { geheim: true, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => /^[A-Za-z0-9_\-]{10,200}$/.test(v) },
    PINN_GEMINI_KEY: { geheim: true, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => /^[A-Za-z0-9_\-]{20,120}$/.test(v) },
    PINN_GEMINI_MODELL: { geheim: false, sauber: (v) => v.replace(/\s+/g, "").toLowerCase(), pruef: (v) => /^[a-z0-9.\-]{3,80}$/.test(v) },
    PINN_TRACCAR_EMAIL: { geheim: false, pruef: (v) => v.length <= 200 && v.indexOf("@") > 0 },
    PINN_TRACCAR_PASSWORT: { geheim: true, pruef: (v) => v.length <= 200 },
    PINN_PUSH_KONTAKT: { geheim: false, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => /^(mailto:)?[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) || /^https:\/\/\S+$/i.test(v) },
    HA_IP: { geheim: false, pruef: (v) => IPV4.test(v) },
    HILFS_IP: { geheim: false, pruef: (v) => IPV4.test(v) },
    NAS_NETZWERKKARTE: { geheim: false, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => v === "auto" || /^[A-Za-z0-9._-]{1,15}$/.test(v) },
    TS_AUTHKEY: { geheim: true, sauber: (v) => v.replace(/\s+/g, ""), pruef: (v) => /^tskey-[A-Za-z0-9_-]{10,200}$/.test(v) },
};
// Zusatzangaben ohne Umgebungsvariable (Auswahl im Assistenten)
const META = {
    fernzugriff: ["wireguard", "tailscale", "keiner", ""],
    homeassistant: ["keiner", "geraet", "vm", ""],
    sprache: ["de", "en", "fr", "es", ""],
    rebind: ["ja", ""],
};

// ---------------------------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------------------------
function textOf(raw) {
    try { return require(`${__hooks}/calendar-sync.js`).bytesToText(raw); } catch (e) { return String(raw || ""); }
}
function readText(path) {
    try { return textOf($os.readFile(path)); } catch (e) { return ""; }
}
function env(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function exists(path) {
    try { $os.stat(path); return true; } catch (e) { return false; }
}
function store() {
    try { return $app.store(); } catch (e) { return null; }
}
function bootTime() {
    const s = store();
    try { const v = s && s.get(BOOT_KEY); if (v) return Number(v); } catch (e) { /* weiter */ }
    return 0;
}
function markBoot() {
    const s = store();
    try { if (s) s.set(BOOT_KEY, Date.now()); } catch (e) { /* egal */ }
}

// Ist der Ordner /pinn_konfig vom NAS eingebunden und beschreibbar?
// Er wird NICHT selbst angelegt: ohne Einbindung in der docker-compose.yaml ginge alles beim
// nächsten Neustart verloren.
function ordnerStatus() {
    if (!exists(DIR)) return "fehlt";
    try {
        $os.writeFile(DIR + "/.schreibtest", "ok", 384);
        $os.remove(DIR + "/.schreibtest");
        return "ok";
    } catch (e) { return "schreibgeschuetzt"; }
}

// ---------------------------------------------------------------------------------------------
// Laden und Speichern
// ---------------------------------------------------------------------------------------------
function load() {
    let st = null;
    try { st = JSON.parse(readText(JSON_FILE) || "null"); } catch (e) { st = null; }
    if (!st || typeof st !== "object") st = {};
    if (!st.werte || typeof st.werte !== "object") st.werte = {};
    if (!st.meta || typeof st.meta !== "object") st.meta = {};
    st.fertig = !!st.fertig;
    st.gespeichert = Number(st.gespeichert) || 0;
    return st;
}
function shellQuote(v) {
    return "'" + String(v).replace(/'/g, "'\\''") + "'";
}
function envText(st) {
    const lines = [
        "# pinn. – Werte aus der Einrichtung in der App (Hauptadmin → Einrichtung).",
        "# Bitte nicht von Hand ändern – die App schreibt diese Datei bei jedem Speichern neu.",
        "# Gelesen von: pocketbase, caddy, duckdns, ha-netz, tailscale (siehe docker-compose.yaml).",
    ];
    Object.keys(FELDER).forEach(k => {
        if (Object.prototype.hasOwnProperty.call(st.werte, k)) lines.push("export " + k + "=" + shellQuote(st.werte[k]));
    });
    return lines.join("\n") + "\n";
}
function writeAtomic(path, text) {
    const tmp = path + ".neu";
    $os.writeFile(tmp, text, 384); // 0600 – enthält Schlüssel
    $os.rename(tmp, path);
}
function save(st) {
    const o = ordnerStatus();
    if (o === "fehlt") throw fehler("ordner_fehlt", "Der Ordner „konfig“ ist nicht eingebunden – bitte die neue docker-compose.yaml verwenden und „docker compose up -d“ ausführen.");
    if (o !== "ok") throw fehler("ordner_schreibschutz", "Der Ordner „konfig“ ist schreibgeschützt.");
    st.gespeichert = Date.now();
    writeAtomic(JSON_FILE, JSON.stringify(st, null, 1));
    writeAtomic(ENV_FILE, envText(st));
}
function fehler(code, text, feld) {
    const e = new Error(text);
    e.pinnCode = code;
    if (feld) e.pinnFeld = feld;
    return e;
}

// Wirksamer Wert: aus der Einrichtung, sonst aus .env bzw. docker-compose.yaml
function wert(st, key) {
    if (Object.prototype.hasOwnProperty.call(st.werte, key)) return String(st.werte[key] || "");
    return env(key);
}
function quelle(st, key) {
    if (Object.prototype.hasOwnProperty.call(st.werte, key)) return "einrichtung";
    return env(key) ? "env" : "";
}

// Werte aus dem Assistenten übernehmen. null/undefined = unverändert lassen (z. B. Schlüssel, die
// nicht neu eingetippt wurden), "" = bewusst leeren.
function merge(st, werte, meta) {
    const w = werte && typeof werte === "object" ? werte : {};
    Object.keys(w).forEach(k => {
        const def = FELDER[k];
        if (!def) return;
        const raw = w[k];
        if (raw === null || raw === undefined) return;
        let v = String(raw).replace(/[\r\n\t]+/g, " ").trim();
        if (def.sauber) v = def.sauber(v);
        if (v && !def.pruef(v)) throw fehler("ungueltig", "Ungültiger Wert für " + k + ".", k);
        st.werte[k] = v;
    });
    const m = meta && typeof meta === "object" ? meta : {};
    Object.keys(m).forEach(k => {
        if (!META[k]) return;
        const v = String(m[k] || "");
        if (META[k].indexOf(v) === -1) throw fehler("ungueltig", "Ungültige Auswahl für " + k + ".", k);
        st.meta[k] = v;
    });
    return st;
}

// ---------------------------------------------------------------------------------------------
// Status für die App
// ---------------------------------------------------------------------------------------------
function haStatus() {
    const t = readText(HA_STATUS_FILE).trim();
    if (!t) return null;
    // Format: zustand|netzwerkkarte|ha_ip|hilfs_ip|zeit
    const p = t.split("|");
    return { zustand: p[0] || "", karte: p[1] || "", haIp: p[2] || "", hilfsIp: p[3] || "", zeit: p[4] || "" };
}
function status() {
    const st = load();
    const felder = {};
    Object.keys(FELDER).forEach(k => {
        const v = wert(st, k);
        const q = quelle(st, k);
        if (FELDER[k].geheim) felder[k] = { gesetzt: !!v, ende: v ? v.slice(-4) : "", quelle: q };
        else felder[k] = { wert: v, quelle: q };
    });
    let familien = 0;
    try { familien = $app.countRecords("familien"); } catch (e) { familien = 0; }
    const boot = bootTime();
    return {
        fertig: st.fertig,
        meta: st.meta,
        felder: felder,
        ordner: ordnerStatus(),
        neustartNoetig: !!(st.gespeichert && boot && st.gespeichert > boot && neustartRelevantGeaendert(st)),
        gespeichert: st.gespeichert,
        boot: boot,
        familien: familien,
        haNetz: haStatus(),
        portStandard: PORT_STANDARD,
    };
}
// Muss pocketbase für die gespeicherten Werte neu starten? (nur wenn sich ein Wert vom laufenden unterscheidet)
function neustartRelevantGeaendert(st) {
    return Object.keys(st.werte).some(k => String(st.werte[k] || "") !== env(k));
}
function offen() {
    const st = load();
    let familien = 0;
    try { familien = $app.countRecords("familien"); } catch (e) { familien = 0; }
    return { offen: !st.fertig && familien === 0, fertig: st.fertig };
}

// ---------------------------------------------------------------------------------------------
// Neustart von pocketbase
// ---------------------------------------------------------------------------------------------
// pocketbase läuft als Prozess 1 im Container. Ein kleines Hintergrund-Kommando beendet ihn nach
// 2 Sekunden sauber (SIGTERM) – die Antwort an die App ist dann schon raus. Docker startet den
// Container wegen „restart: unless-stopped“ sofort neu, dabei werden die neuen Werte gelesen.
// Klappt das nicht, übernimmt der Cron-Job in einrichtung.pb.js (höchstens eine Minute später).
function neustart() {
    try { $os.writeFile(NEUSTART_FILE, String(Date.now()), 384); } catch (e) { /* Cron fällt dann weg */ }
    try {
        const cmd = $os.cmd("sh", "-c", "sleep 2; kill -TERM 1");
        cmd.start();
        return true;
    } catch (e) {
        console.log("[Einrichtung] Sofortiger Neustart nicht möglich (" + e.message + ") – erfolgt per Cron.");
        return false;
    }
}
function neustartFaellig() {
    const t = Number(readText(NEUSTART_FILE).trim()) || 0;
    return t > 0 && Date.now() - t > 20000 && t > bootTime();
}
function neustartErledigt() {
    try { if (exists(NEUSTART_FILE)) $os.remove(NEUSTART_FILE); } catch (e) { /* egal */ }
}

// ---------------------------------------------------------------------------------------------
// Prüfungen (Knopf „Prüfen“ im Assistenten)
// ---------------------------------------------------------------------------------------------
function http(opts) {
    return $http.send(Object.assign({ method: "GET", timeout: 15 }, opts));
}
function bodyText(res) {
    try { return textOf(res.body); } catch (e) { return ""; }
}
// Wert für eine Prüfung: neu eingetippt (werte) oder gespeichert/wirksam
function probe(st, werte, key) {
    const w = werte && typeof werte === "object" ? werte : {};
    if (w[key] !== null && w[key] !== undefined && String(w[key]).trim() !== "") {
        let v = String(w[key]).trim();
        if (FELDER[key] && FELDER[key].sauber) v = FELDER[key].sauber(v);
        return v;
    }
    return wert(st, key);
}

function testDuckdns(st, werte) {
    const sub = probe(st, werte, "DUCKDNS_SUBDOMAIN");
    const tok = probe(st, werte, "DUCKDNS_TOKEN");
    const ip = probe(st, werte, "NAS_IP");
    if (!sub || !tok) return { ok: false, code: "fehlt" };
    if (!FELDER.DUCKDNS_SUBDOMAIN.pruef(sub)) return { ok: false, code: "ungueltig", feld: "DUCKDNS_SUBDOMAIN" };
    if (!FELDER.DUCKDNS_TOKEN.pruef(tok)) return { ok: false, code: "ungueltig", feld: "DUCKDNS_TOKEN" };
    if (!ip || !IPV4.test(ip)) return { ok: false, code: "ip_fehlt" };
    let res;
    try {
        res = http({ url: "https://www.duckdns.org/update?domains=" + encodeURIComponent(sub) + "&token=" + encodeURIComponent(tok) + "&ip=" + encodeURIComponent(ip) });
    } catch (e) { return { ok: false, code: "netz", details: e.message }; }
    const t = bodyText(res).trim();
    if (/^OK/i.test(t)) return { ok: true, code: "ok", adresse: sub + ".duckdns.org", ip: ip };
    return { ok: false, code: "ko" };
}

function testGemini(st, werte) {
    const key = probe(st, werte, "PINN_GEMINI_KEY");
    if (!key) return { ok: false, code: "fehlt" };
    let res;
    try {
        res = http({ url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers: { "x-goog-api-key": key } });
    } catch (e) { return { ok: false, code: "netz", details: e.message }; }
    if (res.statusCode === 200) return { ok: true, code: "ok" };
    const t = bodyText(res);
    if (res.statusCode === 400 || /API_KEY_INVALID|API key not valid/i.test(t)) return { ok: false, code: "ungueltig" };
    if (res.statusCode === 403) return { ok: false, code: "gesperrt" };
    if (res.statusCode === 429) return { ok: true, code: "ok" }; // Schlüssel gültig, nur gerade ausgelastet
    return { ok: false, code: "netz", details: "HTTP " + res.statusCode };
}

// Google prüft Client-ID und -Schlüssel auch ohne echte Anmeldung: Mit einem erfundenen Code
// antwortet Google bei richtigem Client mit „invalid_grant“, bei falschem mit „invalid_client“.
function testGoogle(st, werte) {
    const id = probe(st, werte, "PINN_GOOGLE_CLIENT_ID");
    const secret = probe(st, werte, "PINN_GOOGLE_CLIENT_SECRET");
    const adresse = probe(st, werte, "PINN_ADRESSE");
    if (!id || !secret) return { ok: false, code: "fehlt" };
    if (!FELDER.PINN_GOOGLE_CLIENT_ID.pruef(id)) return { ok: false, code: "ungueltig", feld: "PINN_GOOGLE_CLIENT_ID" };
    const redirect = (adresse || "https://example.invalid") + "/api/pinn/google/callback";
    const form = [
        "code=pinn-einrichtung-test",
        "client_id=" + encodeURIComponent(id),
        "client_secret=" + encodeURIComponent(secret),
        "redirect_uri=" + encodeURIComponent(redirect),
        "grant_type=authorization_code",
    ].join("&");
    let res;
    try {
        res = http({ url: "https://oauth2.googleapis.com/token", method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    } catch (e) { return { ok: false, code: "netz", details: e.message }; }
    let o = {};
    try { o = JSON.parse(bodyText(res) || "{}"); } catch (e) { o = {}; }
    const err = String(o.error || "");
    if (err === "invalid_grant") return { ok: true, code: "ok", redirect: redirect };
    if (err === "redirect_uri_mismatch") return { ok: false, code: "uri", redirect: redirect };
    if (err === "invalid_client" || err === "unauthorized_client") return { ok: false, code: "ungueltig" };
    if (res.statusCode >= 500) return { ok: false, code: "netz", details: "HTTP " + res.statusCode };
    return { ok: true, code: "ok", redirect: redirect };
}

function testTraccar() {
    const url = (env("PINN_TRACCAR_URL") || "http://traccar:8082").replace(/\/+$/, "");
    try {
        const res = http({ url: url + "/api/server", timeout: 8 });
        return res.statusCode === 200 ? { ok: true, code: "ok" } : { ok: false, code: "aus", details: "HTTP " + res.statusCode };
    } catch (e) { return { ok: false, code: "aus", details: e.message }; }
}

function testHomeAssistant(st, werte) {
    const ip = probe(st, werte, "HA_IP");
    if (!ip) return { ok: false, code: "fehlt" };
    const versuche = ["http://" + ip + ":8123/api/", "https://" + ip + ":8123/api/", "http://" + ip + "/api/"];
    for (let i = 0; i < versuche.length; i++) {
        try {
            const res = http({ url: versuche[i], timeout: 6 });
            if (res.statusCode === 401 || res.statusCode === 200) return { ok: true, code: "ok", url: versuche[i] };
        } catch (e) { /* nächster Versuch */ }
    }
    return { ok: false, code: "aus", ha: haStatus() };
}

function test(art, werte) {
    const st = load();
    if (art === "duckdns") return testDuckdns(st, werte);
    if (art === "gemini") return testGemini(st, werte);
    if (art === "google") return testGoogle(st, werte);
    if (art === "traccar") return testTraccar();
    if (art === "homeassistant") return testHomeAssistant(st, werte);
    return { ok: false, code: "unbekannt" };
}

module.exports = {
    DIR, FELDER, load, save, merge, status, offen, neustart, neustartFaellig, neustartErledigt,
    markBoot, test, fehler, ordnerStatus, wert,
};
