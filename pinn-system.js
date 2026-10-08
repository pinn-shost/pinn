// pb_hooks/pinn-system.js
// Sicherungen, Wiederherstellung und Updates per Knopf – gemeinsame Funktionen für system.pb.js.
// Kein *.pb.js -> wird nur per require() eingebunden.
//
// Zusammenspiel mit dem Container „wartung“ (pinn-wartung.sh im Projektordner):
//  - Ordner /pinn_wartung (auf dem NAS: <Projekt>/wartung) ist in beiden Containern eingebunden.
//  - pinn. schreibt nur den Auftrag:  auftrag.json  { id, art: sichern|wiederherstellen|update, datei, umfang, tag }
//  - wartung liest ihn, arbeitet ihn ab und schreibt:
//      status.json   Zustand des letzten Auftrags { id, art, zustand, schritt, fehler, meldung, … }
//      backups.json  Liste der Sicherungen (neueste zuerst)
//      lebt.json     Lebenszeichen alle 2 Minuten (+ ob Docker erreichbar ist, Uhrzeit, Aufbewahrung)
//      update.log    Ausgabe von pinn-setup.sh beim letzten Update
//  - Wiederherstellen und Updates halten PocketBase kurz an bzw. starten es neu – die App fragt den
//    Status währenddessen über /api/pinn/system/status ab (ohne Anmeldung, nur Zustand ohne Details).
//
// Rechte: Sicherungen ansehen und „Jetzt sichern“ dürfen Admins. Wiederherstellen und Updates
// betreffen den ganzen Server – das darf der Hauptadmin, ein Familien-Admin, solange es auf dem Server
// genau eine Familie gibt, und jeder Familien-Admin, dem der Hauptadmin das Recht gegeben hat
// (Feld „systemrechte“ im Profil, verborgen; Hauptadmin → Familien → „🛟 darf Updates & Wiederherstellung“).
//
// Neue Versionen: GitHub-API (releases/latest) des Repositorys pinn-shost/pinn, höchstens alle
// 6 Stunden (oder auf Knopfdruck), Ergebnis im Speicher von PocketBase – kein Zeitplan, keine Last.

const DIR = "/pinn_wartung";
const F_AUFTRAG = DIR + "/auftrag.json";
const F_STATUS = DIR + "/status.json";
const F_LISTE = DIR + "/backups.json";
const F_LEBT = DIR + "/lebt.json";
const F_UPDATE_LOG = DIR + "/update.log";
const INDEX_HTML = "/pb_public/index.html";
const STANDARD_REPO = "pinn-shost/pinn";
const RELEASE_KEY = "pinnSystemRelease";
const VERSION_KEY = "pinnSystemVersion";
const RELEASE_TTL = 6 * 3600 * 1000;
const LEBT_MAX = 6 * 60;         // Sekunden: so alt darf das Lebenszeichen sein
const LAEUFT_MAX = 2 * 3600;     // Sekunden: länger „läuft“ = hängt

// ---------------------------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------------------------
function textOf(raw) {
    try { return require(`${__hooks}/calendar-sync.js`).bytesToText(raw); } catch (e) { /* weiter */ }
    try { return toString(raw); } catch (e) { return String(raw || ""); }
}
function readText(path) {
    try { return textOf($os.readFile(path)); } catch (e) { return ""; }
}
function readJson(path) {
    const t = readText(path);
    if (!t) return null;
    try { return JSON.parse(t); } catch (e) { return null; }
}
function exists(path) {
    try { $os.stat(path); return true; } catch (e) { return false; }
}
function env(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function store() {
    try { return $app.store(); } catch (e) { return null; }
}
function storeGet(key) {
    const s = store();
    try { return s ? s.get(key) : null; } catch (e) { return null; }
}
function storeSet(key, val) {
    const s = store();
    try { if (s) s.set(key, val); } catch (e) { /* egal */ }
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function repo() {
    const r = env("PINN_REPO");
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r) ? r : STANDARD_REPO;
}
function fehler(code, text) {
    const e = new Error(text);
    e.pinnCode = code;
    return e;
}

// Versionen vergleichen: "1.24.0" vs "v1.23" → 1 / 0 / -1
function teile(v) {
    return String(v || "").replace(/^v/i, "").split(/[.\-+]/).slice(0, 4).map(x => parseInt(x, 10) || 0);
}
function vergleiche(a, b) {
    const x = teile(a), y = teile(b);
    for (let i = 0; i < 4; i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

// ---------------------------------------------------------------------------------------------
// Installierte Version (aus pb_public/index.html, zwischengespeichert)
// ---------------------------------------------------------------------------------------------
function installierteVersion() {
    let stamp = "";
    try { stamp = String($os.stat(INDEX_HTML).modTime().unix()); } catch (e) { stamp = ""; }
    const c = storeGet(VERSION_KEY);
    if (c && c.v && stamp && c.stamp === stamp) return c.v;
    if (c && c.v && !stamp && Date.now() - (c.zeit || 0) < 600000) return c.v;
    const html = readText(INDEX_HTML);
    const m = html.match(/const APP_VERSION = '([^']+)'/);
    const v = m ? m[1] : "";
    storeSet(VERSION_KEY, { v, stamp, zeit: Date.now() });
    return v;
}

// ---------------------------------------------------------------------------------------------
// Container „wartung“
// ---------------------------------------------------------------------------------------------
function ordnerOk() {
    if (!exists(DIR)) return false;
    try {
        $os.writeFile(DIR + "/.schreibtest", "ok", 384);
        $os.remove(DIR + "/.schreibtest");
        return true;
    } catch (e) { return false; }
}
function wartung() {
    const eingerichtet = exists(DIR);
    const l = readJson(F_LEBT) || {};
    const zeit = Number(l.zeit) || 0;
    // Während eines langen Auftrags kommt kein Lebenszeichen – ein frischer Auftragsstatus zählt auch
    const j = job();
    const arbeitet = !!(j && (j.zustand === "laeuft" || j.zustand === "wartet"));
    const aktiv = eingerichtet && ((zeit > 0 && nowSec() - zeit < LEBT_MAX) || arbeitet);
    return {
        eingerichtet,
        aktiv,
        docker: aktiv && l.docker === true,
        zuletzt: zeit,
        uhrzeit: String(l.uhrzeit || "03:30"),
        tage: Number(l.tage) || 7,
        wochen: Number(l.wochen) || 4,
    };
}
function liste() {
    const l = readJson(F_LISTE);
    if (!Array.isArray(l)) return [];
    return l.filter(b => b && typeof b.datei === "string" && /^pinn_[A-Za-z0-9_.-]+\.tar\.gz$/.test(b.datei))
        .map(b => ({ datei: b.datei, art: String(b.art || "auto"), groesse: Number(b.groesse) || 0, zeit: Number(b.zeit) || 0 }))
        .sort((a, b) => b.zeit - a.zeit);
}
function job() {
    const s = readJson(F_STATUS);
    if (!s || typeof s !== "object") return null;
    const out = {
        id: String(s.id || ""), art: String(s.art || ""), zustand: String(s.zustand || ""),
        schritt: String(s.schritt || ""), fehler: String(s.fehler || ""), meldung: String(s.meldung || "").slice(0, 400),
        datei: String(s.datei || ""), version: String(s.version || ""), umfang: String(s.umfang || ""),
        start: Number(s.start) || 0, zeit: Number(s.zeit) || 0,
    };
    // Hängt ein Auftrag (Container mittendrin entfernt)? Dann nicht mehr als „läuft“ melden.
    if ((out.zustand === "laeuft" || out.zustand === "wartet") && out.zeit && nowSec() - out.zeit > LAEUFT_MAX) {
        out.zustand = "fehler"; out.fehler = "abbruch";
    }
    return out;
}
// Läuft gerade ein Auftrag oder wartet einer?
function beschaeftigt() {
    if (exists(F_AUFTRAG)) return true;
    const j = job();
    return !!(j && (j.zustand === "laeuft" || j.zustand === "wartet"));
}

// ---------------------------------------------------------------------------------------------
// Rechte
// ---------------------------------------------------------------------------------------------
function familienAnzahl() {
    try { return $app.countRecords("familien"); } catch (e) { return 0; }
}
// { admin, darf, grund }
function rechte(e) {
    const b = require(`${__hooks}/pinn-benutzer.js`);
    const admin = b.isAdmin(e);
    if (!admin) return { admin: false, darf: false, grund: "admin" };
    if (b.isMainAdmin(e)) return { admin: true, darf: true, grund: "" };
    if (familienAnzahl() <= 1) return { admin: true, darf: true, grund: "" };
    let erlaubt = false;
    try { erlaubt = e.auth.getBool("systemrechte"); } catch (err) { erlaubt = false; }
    if (erlaubt) return { admin: true, darf: true, grund: "" };
    return { admin: true, darf: false, grund: "hauptadmin" };
}

// ---------------------------------------------------------------------------------------------
// Neue Version auf GitHub
// ---------------------------------------------------------------------------------------------
function releasePruefen(erzwingen) {
    const c = storeGet(RELEASE_KEY);
    if (!erzwingen && c && Date.now() - (c.geprueft || 0) < RELEASE_TTL) return c;
    const out = { geprueft: Date.now(), fehler: "", keine: false, tag: "", version: "", titel: "", notizen: "", datum: "", url: "" };
    try {
        const res = $http.send({
            url: "https://api.github.com/repos/" + repo() + "/releases/latest",
            method: "GET",
            headers: { "Accept": "application/vnd.github+json", "User-Agent": "pinn-update-check", "X-GitHub-Api-Version": "2022-11-28" },
            timeout: 15,
        });
        if (res.statusCode === 404) {
            out.keine = true;
        } else if (res.statusCode !== 200) {
            out.fehler = res.statusCode === 403 || res.statusCode === 429 ? "limit" : "github";
        } else {
            let j = res.json;
            if (!j || typeof j !== "object") { try { j = JSON.parse(textOf(res.body)); } catch (e2) { j = null; } }
            if (!j || !j.tag_name) {
                out.fehler = "github";
            } else {
                out.tag = String(j.tag_name).slice(0, 40);
                out.version = out.tag.replace(/^v/i, "");
                out.titel = String(j.name || "").slice(0, 200);
                out.notizen = String(j.body || "").slice(0, 6000);
                out.datum = String(j.published_at || "");
                out.url = String(j.html_url || "");
                if (!/^v?\d+(\.\d+){1,3}$/.test(out.tag)) { out.fehler = "tag"; }
            }
        }
    } catch (err) {
        out.fehler = "netz";
    }
    // Bei einem Fehler das zuletzt erfolgreich Gefundene behalten
    if (out.fehler && c && c.tag && !c.fehler) {
        const alt = Object.assign({}, c);
        alt.fehler = out.fehler;
        alt.geprueft = out.geprueft;
        storeSet(RELEASE_KEY, alt);
        return alt;
    }
    storeSet(RELEASE_KEY, out);
    return out;
}
function updateInfo(erzwingen) {
    const r = releasePruefen(!!erzwingen);
    const v = installierteVersion();
    return Object.assign({}, r, { installiert: v, neuer: !!(r.tag && r.version && v) && vergleiche(r.version, v) > 0 });
}

// ---------------------------------------------------------------------------------------------
// Gesamtstatus für die App
// ---------------------------------------------------------------------------------------------
function status(e, pruefen) {
    const r = rechte(e);
    const w = wartung();
    const j = job();
    const out = {
        admin: r.admin,
        darf: r.darf,
        grund: r.grund,
        version: installierteVersion(),
        wartung: w,
        backups: liste(),
        job: j,
        update: updateInfo(pruefen),
        repo: repo(),
    };
    if (r.darf && j && j.art === "update" && j.zustand === "fehler") {
        out.updateLog = readText(F_UPDATE_LOG).replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(-40);
    }
    return out;
}
// Ohne Anmeldung (während pinn. neu startet): nur der Zustand des Auftrags
function kurzStatus() {
    const j = job();
    return {
        version: installierteVersion(),
        job: j ? { id: j.id, art: j.art, zustand: j.zustand, schritt: j.schritt, fehler: j.fehler, version: j.version, zeit: j.zeit } : null,
    };
}

// ---------------------------------------------------------------------------------------------
// Aufträge
// ---------------------------------------------------------------------------------------------
function auftrag(daten) {
    if (!exists(DIR)) throw fehler("ordner", "Der Ordner „wartung“ ist nicht eingebunden – bitte einmal sudo sh pinn-setup.sh ausführen.");
    if (!ordnerOk()) throw fehler("ordner", "Der Ordner „wartung“ ist schreibgeschützt.");
    if (beschaeftigt()) throw fehler("beschaeftigt", "Es läuft gerade schon eine Sicherung oder ein Update.");
    const w = wartung();
    if (!w.aktiv) throw fehler("wartung", "Der Container „wartung“ läuft nicht – bitte einmal sudo sh pinn-setup.sh ausführen.");
    if ((daten.art === "wiederherstellen" || daten.art === "update") && !w.docker) {
        throw fehler("docker", "Der Container „wartung“ hat keinen Zugriff auf Docker.");
    }
    const id = $security.randomString(12);
    const a = Object.assign({ id, zeit: nowSec() }, daten);
    const tmp = F_AUFTRAG + ".neu";
    $os.writeFile(tmp, JSON.stringify(a), 384);
    $os.rename(tmp, F_AUFTRAG);
    return { id, art: daten.art };
}
function sichern() {
    return auftrag({ art: "sichern" });
}
function wiederherstellen(datei, umfang) {
    datei = String(datei || "");
    if (!/^pinn_[A-Za-z0-9_.-]+\.tar\.gz$/.test(datei) || !liste().some(b => b.datei === datei)) {
        throw fehler("datei", "Diese Sicherung gibt es nicht (mehr).");
    }
    return auftrag({ art: "wiederherstellen", datei, umfang: umfang === "alles" ? "alles" : "daten" });
}
function update() {
    const u = updateInfo(true);
    if (u.fehler && !u.tag) throw fehler("github", "GitHub ist gerade nicht erreichbar.");
    if (!u.tag || !u.neuer) throw fehler("aktuell", "Es gibt keine neuere Version.");
    const r = auftrag({ art: "update", tag: u.tag });
    r.version = u.version;
    return r;
}

// ---------------------------------------------------------------------------------------------
// Systemrechte für Familien-Admins (vergibt der Hauptadmin)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    try {
        const b = require(`${__hooks}/pinn-benutzer.js`);
        const col = b.findCol(b.USERS);
        if (!col || b.hasField(col, "systemrechte")) return;
        col.fields.add(b.makeField({ name: "systemrechte", type: "bool", hidden: true }));
        $app.save(col);
        console.log("[System] Feld \"systemrechte\" im Profil ergänzt.");
    } catch (err) {
        console.log("[System] Feld \"systemrechte\" nicht anlegbar: " + err.message);
    }
}
function setzeRechte(userId, an) {
    ensureSchema();
    const b = require(`${__hooks}/pinn-benutzer.js`);
    let rec = null;
    try { rec = $app.findRecordById(b.USERS, String(userId || "")); } catch (err) { throw fehler("profil", "Profil nicht gefunden."); }
    if (rec.getString("rolle") !== "admin") throw fehler("rolle", "Das geht nur bei Admins einer Familie.");
    rec.set("systemrechte", !!an);
    $app.save(rec);
    return { success: true, id: rec.id, systemrechte: !!an };
}

module.exports = {
    ensureSchema, setzeRechte,
    status, kurzStatus, rechte, sichern, wiederherstellen, update, installierteVersion, vergleiche, releasePruefen,
};
