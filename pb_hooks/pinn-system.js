// pb_hooks/pinn-system.js
// Backups, restore and updates at the push of a button – shared functions for system.pb.js.
// Not a *.pb.js -> only included via require().
//
// Working together with the container „wartung“ (pinn-wartung.sh in the project folder):
//  - The folder /pinn_wartung (on the NAS: <project>/wartung) is mounted in both containers.
//  - pinn. only writes the job:  auftrag.json  { id, art: sichern|wiederherstellen|update, datei, umfang, tag, vorab }
//  - wartung reads it, works through it and writes:
//      status.json   state of the last job { id, art, zustand, schritt, fehler, meldung, … }
//      backups.json  list of backups (newest first)
//      lebt.json     sign of life every 2 minutes (+ whether Docker is reachable, time, retention)
//      update.log    output of pinn-setup.sh during the last update
//  - pinn. itself also writes vorab.json when a pre-release is installed ({ tag, version, zeit, url }),
//    so the app can show "you are running a pre-release" afterwards.
//  - Restore and updates stop PocketBase for a moment or restart it – meanwhile the app asks for the
//    state via /api/pinn/system/status (no sign-in, only the state without details).
//
// Permissions: admins may view backups and use „Jetzt sichern“. Restore and updates affect the whole
// server – allowed for the main admin, for a family admin as long as there is exactly one family on the
// server, and for every family admin the main admin gave the right to (hidden profile field „systemrechte“;
// main admin → families → „🛟 darf Updates & Wiederherstellung“).
//
// New versions: GitHub API (releases/latest) of the repository pinn-shost/pinn, at most every 6 hours
// (or on request), result kept in PocketBase's memory – no schedule, no load. releases/latest never
// returns pre-releases, so normal updates only ever offer finished versions.
// Pre-releases (since 1.66.0): only on explicit request (developer area in the app) via the list
// /releases – the newest pre-release that is newer than the installed version and not yet superseded
// by a finished version. Convention: pre-release tags like v1.67.0-beta.1 with the same APP_VERSION.

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
const VORAB_KEY = "pinnSystemVorab";
const VORAB_TTL = 5 * 60 * 1000;   // pre-release search: only on request, short cache against double taps
const F_VORAB = DIR + "/vorab.json";
// Version tags: 1.2 / v1.2.3 / v1.2.3.4, optionally with a pre-release suffix like -beta.1 / -rc2
const TAG_RE = /^v?\d+(\.\d+){1,3}(-[0-9A-Za-z][0-9A-Za-z.]*)?$/;
const LEBT_MAX = 6 * 60;         // seconds: the sign of life may be this old
const LAEUFT_MAX = 2 * 3600;     // seconds: "running" for longer = stuck

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function textOf(raw) {
    try { return require(`${__hooks}/calendar-sync.js`).bytesToText(raw); } catch (e) { /* continue */ }
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
    try { if (s) s.set(key, val); } catch (e) { /* ignore */ }
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

// Compare versions: "1.24.0" vs "v1.23" → 1 / 0 / -1. A pre-release suffix ranks below the same
// version without suffix (1.67.0-beta.1 < 1.67.0); suffixes are compared part by part (beta.2 < beta.10).
function teile(v) {
    return String(v || "").replace(/^v/i, "").split("-")[0].split(/[.+]/).slice(0, 4).map(x => parseInt(x, 10) || 0);
}
function suffix(v) {
    const s = String(v || "").replace(/^v/i, "");
    const i = s.indexOf("-");
    return i < 0 ? "" : s.slice(i + 1).split("+")[0];
}
function vergleicheSuffix(a, b) {
    if (a === b) return 0;
    if (!a) return 1;           // no suffix = finished version = newer
    if (!b) return -1;
    const x = a.split("."), y = b.split(".");
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (x[i] === undefined) return -1;
        if (y[i] === undefined) return 1;
        const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
        if (nx && ny) { const d = parseInt(x[i], 10) - parseInt(y[i], 10); if (d) return d > 0 ? 1 : -1; continue; }
        if (nx !== ny) return nx ? -1 : 1;
        if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    }
    return 0;
}
function vergleiche(a, b) {
    const x = teile(a), y = teile(b);
    for (let i = 0; i < 4; i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return vergleicheSuffix(suffix(a), suffix(b));
}
function istVorab(v) { return !!suffix(v); }

// ---------------------------------------------------------------------------------------------
// Installed version (from pb_public/index.html, cached)
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
    // No sign of life arrives during a long job – a fresh job status counts as well
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
    // Is a job stuck (container removed halfway)? Then stop reporting it as "running".
    if ((out.zustand === "laeuft" || out.zustand === "wartet") && out.zeit && nowSec() - out.zeit > LAEUFT_MAX) {
        out.zustand = "fehler"; out.fehler = "abbruch";
    }
    return out;
}
// Is a job running or waiting right now?
function beschaeftigt() {
    if (exists(F_AUFTRAG)) return true;
    const j = job();
    return !!(j && (j.zustand === "laeuft" || j.zustand === "wartet"));
}

// ---------------------------------------------------------------------------------------------
// Permissions
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
// New version on GitHub
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
                if (!TAG_RE.test(out.tag)) { out.fehler = "tag"; }
            }
        }
    } catch (err) {
        out.fehler = "netz";
    }
    // On an error keep what was found successfully last time
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
    let neuer = !!(r.tag && r.version && v) && vergleiche(r.version, v) > 0;
    // Running a pre-release whose APP_VERSION has no suffix (e.g. 1.67.0 from v1.67.0-beta.1): the finished
    // v1.67.0 still counts as newer, compared with the pre-release tag
    const vs = vorabStand();
    if (!neuer && vs && r.tag && r.tag !== vs.tag && vergleiche(r.version, vs.tag) > 0) neuer = true;
    return Object.assign({}, r, { installiert: v, neuer });
}

// ---------------------------------------------------------------------------------------------
// Pre-releases (developer area) – only on explicit request
// ---------------------------------------------------------------------------------------------
function vorabPruefen(erzwingen) {
    const c = storeGet(VORAB_KEY);
    if (!erzwingen && c && Date.now() - (c.geprueft || 0) < VORAB_TTL) return c;
    const out = { geprueft: Date.now(), fehler: "", keine: false, tag: "", version: "", titel: "", notizen: "", datum: "", url: "" };
    try {
        const res = $http.send({
            url: "https://api.github.com/repos/" + repo() + "/releases?per_page=30",
            method: "GET",
            headers: { "Accept": "application/vnd.github+json", "User-Agent": "pinn-update-check", "X-GitHub-Api-Version": "2022-11-28" },
            timeout: 15,
        });
        if (res.statusCode === 404) {
            out.keine = true;
        } else if (res.statusCode !== 200) {
            out.fehler = res.statusCode === 403 || res.statusCode === 429 ? "limit" : "github";
        } else {
            let list = res.json;
            if (!Array.isArray(list)) { try { list = JSON.parse(textOf(res.body)); } catch (e2) { list = null; } }
            if (!Array.isArray(list)) {
                out.fehler = "github";
            } else {
                // newest pre-release by version number (drafts and odd tags are skipped)
                let best = null;
                list.forEach(j => {
                    if (!j || j.draft || !j.prerelease || !j.tag_name) return;
                    const tag = String(j.tag_name).slice(0, 40);
                    if (!TAG_RE.test(tag)) return;
                    if (!best || vergleiche(tag, best.tag_name) > 0) best = j;
                });
                if (!best) {
                    out.keine = true;
                } else {
                    out.tag = String(best.tag_name).slice(0, 40);
                    out.version = out.tag.replace(/^v/i, "");
                    out.titel = String(best.name || "").slice(0, 200);
                    out.notizen = String(best.body || "").slice(0, 6000);
                    out.datum = String(best.published_at || best.created_at || "");
                    out.url = String(best.html_url || "");
                }
            }
        }
    } catch (err) {
        out.fehler = "netz";
    }
    storeSet(VORAB_KEY, out);
    return out;
}
// Pre-release found + is it worth offering? (newer than installed, not superseded by a finished version)
function vorabInfo(erzwingen) {
    const r = vorabPruefen(!!erzwingen);
    const v = installierteVersion();
    const stabil = releasePruefen(false);
    const ueberholt = !!(r.tag && stabil && stabil.tag && !stabil.fehler && vergleiche(stabil.version, r.version) >= 0);
    return Object.assign({}, r, {
        installiert: v,
        ueberholt,
        neuer: !!(r.tag && r.version && v) && !ueberholt && vergleiche(r.version, v) > 0,
    });
}
// Is a pre-release installed right now? (marker from the last pre-release job, or a version with suffix)
function vorabStand() {
    const v = installierteVersion();
    const m = readJson(F_VORAB);
    // Marked when the installed version is the pre-release's version – or, if its APP_VERSION has no
    // suffix, when the version changed since the job and has the same number (1.67.0 from v1.67.0-beta.1)
    const markiert = !!(m && m.version && (String(m.version) === v
        || (m.vorher && m.vorher !== v && teile(m.version).join(".") === teile(v).join("."))));
    if (!markiert && !istVorab(v)) return null;
    return {
        version: v,
        tag: markiert ? String(m.tag || "") : "v" + v,
        url: markiert ? String(m.url || "") : "",
        seit: markiert ? Number(m.zeit) || 0 : 0,
    };
}

// ---------------------------------------------------------------------------------------------
// Overall status for the app
// ---------------------------------------------------------------------------------------------
function status(e, pruefen, vorab) {
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
        vorabStand: vorabStand(),
    };
    // Pre-release search only when the developer area asks for it
    if (vorab) out.vorab = vorabInfo(true);
    if (r.darf && j && j.art === "update" && j.zustand === "fehler") {
        out.updateLog = readText(F_UPDATE_LOG).replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(-40);
    }
    return out;
}
// Without sign-in (while pinn. restarts): only the state of the job
function kurzStatus() {
    const j = job();
    return {
        version: installierteVersion(),
        job: j ? { id: j.id, art: j.art, zustand: j.zustand, schritt: j.schritt, fehler: j.fehler, version: j.version, zeit: j.zeit } : null,
    };
}

// ---------------------------------------------------------------------------------------------
// Jobs
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
function update(vorab) {
    if (vorab) {
        // Pre-release: only on explicit request; the backup before the update is made by wartung as usual
        const v = vorabInfo(true);
        if (v.fehler && !v.tag) throw fehler("github", "GitHub ist gerade nicht erreichbar.");
        if (!v.tag) throw fehler("aktuell", "Es gibt zurzeit keine Vorabversion.");
        if (v.ueberholt) throw fehler("aktuell", "Diese Vorabversion ist schon als fertige Version erschienen – bitte das normale Update nutzen.");
        if (!v.neuer) throw fehler("aktuell", "Die Vorabversion ist nicht neuer als die installierte Version.");
        const r = auftrag({ art: "update", tag: v.tag, vorab: true });
        try {
            const tmp = F_VORAB + ".neu";
            $os.writeFile(tmp, JSON.stringify({ tag: v.tag, version: v.version, zeit: nowSec(), url: v.url, vorher: installierteVersion() }), 384);
            $os.rename(tmp, F_VORAB);
        } catch (err) { /* only used for the notice in the app */ }
        r.version = v.version;
        r.vorab = true;
        return r;
    }
    const u = updateInfo(true);
    if (u.fehler && !u.tag) throw fehler("github", "GitHub ist gerade nicht erreichbar.");
    if (!u.tag || !u.neuer) throw fehler("aktuell", "Es gibt keine neuere Version.");
    const r = auftrag({ art: "update", tag: u.tag });
    // A finished version replaces a pre-release: forget the marker
    try { if (exists(F_VORAB)) $os.remove(F_VORAB); } catch (err) { /* ignore */ }
    r.version = u.version;
    return r;
}

// ---------------------------------------------------------------------------------------------
// System rights for family admins (granted by the main admin)
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
    vorabPruefen, vorabInfo, vorabStand,
};
