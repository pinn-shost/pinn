/* pinn. – database schema: start-up checks and versioned migrations (pb_hooks/pinn-schema.js, since 1.110.0)

   Until 1.109 every module created or extended its collections in its own onBootstrap handler, in no defined
   order. Since 1.110 this file is the one place for the database schema, in two parts:

   CHECKS – idempotent "make sure it exists" functions of the modules (create a missing collection, add a missing
     field, lock the access rules again). They run on EVERY start, in the order listed (dependencies first), so a
     damaged or half-restored database repairs itself as before.
   MIGRATIONS – one-time changes with a version number (the schema version). Each step runs exactly once and is
     recorded in the locked collection "pinn_schema" (version, name, app version, duration). This is where
     anything goes that must not run twice or cannot be expressed as a check: renaming or removing fields,
     moving or cleaning up data, dropping old collections.

   How it runs
   - schema.pb.js calls ensureCurrent() at start. Every other onBootstrap handler that works with the database
     calls ensureCurrent() first as well. PocketBase runs the start-up part of onBootstrap handlers in reverse
     file order, so whichever handler comes first does the work (checks, then pending migrations); the result
     is kept in $app.store() and all later calls return it at once.
   - Migrations run in ascending order after the checks. A step that throws (or returns false) is not recorded,
     is logged to the console and the admin error log, and stops all later steps. The next start tries again –
     so every step has to be safe to repeat after a partial run.
   - A database with a schema version newer than this code (an older pinn. on top of a newer database) is left
     alone: no migration runs, a warning goes to the admin error log. The checks still run (they only add).
   - Restoring a backup brings back its own "pinn_schema"; steps newer than the backup run again on the next
     start. Updates (button or pinn-setup.sh) always make a backup first.

   Adding a database change (contributors)
   - New collection or new field: add it to the module's ensure function. If it is a new module, add its ensure
     function to CHECKS (check-hooks.js fails when a module that creates collections or fields is missing there).
   - Anything else: append a step to MIGRATIONS with the next version number and a short name, e.g.
       { version: 2, name: "alte-ansicht-entfernen", up: () => require(`${__hooks}/pinn-x.js`).cleanupOldView() },
     Never change, reorder or remove a step that was released – add a new one instead. Inside a step use
     $app.runInTransaction((txApp) => { … }) for data changes and only txApp inside it (using $app inside a
     transaction blocks SQLite); keep a backup copy of anything you delete or rewrite.
   - node .github/scripts/check-hooks.js checks both lists and runs the runner against a simulated database. */

const COL = "pinn_schema";
const STATE_KEY = "pinnSchemaState";

// ---------------------------------------------------------------------------------------------
// Start-up checks – every start, in this order. A check fails when it throws or returns false/null.
// ---------------------------------------------------------------------------------------------
function checks() {
    return [
        // Error log first, so every later check can report into it
        ["protokoll", () => require(`${__hooks}/pinn-protokoll.js`).ensureSchema()],
        // Profiles, families, family data, main admin, access rules (also the dashboard collections)
        ["benutzer", () => require(`${__hooks}/pinn-benutzer.js`).ensureSchema()],
        ["system", () => require(`${__hooks}/pinn-system.js`).ensureSchema()],
        ["design", () => require(`${__hooks}/pinn-design.js`).ensureField()],
        ["bereiche", () => require(`${__hooks}/pinn-bereiche.js`).ensureSchema()],
        ["sitzungen", () => require(`${__hooks}/pinn-sitzungen.js`).ensureSchema()],
        ["dashboard", () => require(`${__hooks}/pinn-dashboard.js`).ensureSchema()],
        ["push", () => require(`${__hooks}/pinn-push.js`).ensurePushCollections()],
        ["hinweise", () => require(`${__hooks}/pinn-hinweise.js`).ensureSchema()],
        // Calendar: credentials and accounts before the calendar collections
        ["apple", () => require(`${__hooks}/pinn-apple.js`).ensureCollection()],
        ["google", () => require(`${__hooks}/pinn-google.js`).ensureCollection()],
        ["kalender-konten", () => require(`${__hooks}/pinn-kalender-konten.js`).ensureCollection()],
        ["kalender", () => require(`${__hooks}/pinn-kalender.js`).ensureSchema()],
        ["aufgaben", () => require(`${__hooks}/pinn-aufgaben.js`).ensureSchema()],
        // Finances: bookings and receipts need their "kasse" field before the cash boxes take them over
        // (kassen.pb.js then moves old data into cash boxes and sets the document rules once more)
        ["finanzen", () => require(`${__hooks}/pinn-finanzen.js`).ensureSchema()],
        ["vertraege", () => require(`${__hooks}/pinn-vertraege.js`).ensureSchema()],
        ["kassen", () => require(`${__hooks}/pinn-kassen.js`).ensureSchema()],
        ["dokumente", () => require(`${__hooks}/pinn-dokumente.js`).ensureSchema()],
        ["kurse", () => require(`${__hooks}/pinn-kurse.js`).ensureSchema()],
        ["rezepte", () => require(`${__hooks}/pinn-rezepte.js`).ensureSchema()],
        ["pinnwand", () => require(`${__hooks}/pinn-pinnwand.js`).ensureSchema()],
        ["muell", () => require(`${__hooks}/pinn-muell.js`).ensureSchema()],
        ["ortung", () => require(`${__hooks}/pinn-ortung.js`).ensureSchema()],
        ["smarthome", () => require(`${__hooks}/pinn-smarthome.js`).ensureSchema()],
        ["sprache", () => require(`${__hooks}/pinn-sprache.js`).ensureSchema()],
        ["zuhause", () => require(`${__hooks}/pinn-zuhause.js`).ensureSchema()],
    ];
}

function runChecks() {
    const failed = [];
    checks().forEach(([label, fn]) => {
        let res, msg = "";
        try { res = fn(); } catch (err) { msg = err.message; }
        if (!msg && (res === false || res === null)) msg = "nicht eingerichtet";
        if (!msg) return;
        failed.push(label);
        const text = "Datenbank-Einrichtung „" + label + "“ fehlgeschlagen: " + msg;
        console.log("[Schema] " + text);
        report("fehler", text);
    });
    return failed;
}

// ---------------------------------------------------------------------------------------------
// Migrations – append only (see the header)
// ---------------------------------------------------------------------------------------------
// Collections that exist in every installation from 1.110 on (google_client only once a client is stored in the app)
const BASELINE_COLLECTIONS = [
    "benutzer", "familien", "familien_daten", "familien_bereiche", "rezept_bilder", "oeffentliche_rezepte",
    "protokoll", "sitzungen", "dashboard_geraete", "dashboard_hintergruende", "push_abos", "push_nachrichten",
    "hinweise", "apple_zugaenge", "google_zugaenge", "kalender_konten", "kalender_eigene", "kalender_termine",
    "aufgaben", "haushalt_verlauf", "ausgaben", "finanz_dokumente", "kassen", "dokumente", "kurse",
    "pinnwand_bilder", "muellkalender", "ortung", "smarthome_zugaenge", "sprache_zugaenge", "zuhause",
];

// Step 1: the starting point of the schema version – the database as of 1.110, set up by the checks
function baseline() {
    const missing = BASELINE_COLLECTIONS.filter(name => !findCol(name));
    if (missing.length) throw new Error("Sammlung(en) fehlen: " + missing.join(", "));
    return true;
}

const MIGRATIONS = [
    { version: 1, name: "Grundbestand", up: baseline },
];

function latest() {
    return MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function storeGet(key) {
    try { return $app.store().get(key) || null; } catch (e) { return null; }
}
function storeSet(key, value) {
    try { $app.store().set(key, value); } catch (e) { /* not available */ }
}
function report(level, text) {
    try {
        const log = require(`${__hooks}/pinn-protokoll.js`);
        if (level === "warnung") log.warnung("system", text);
        else log.fehler("system", text);
    } catch (e) { /* error log not available yet */ }
}
function appVersion() {
    try { return String(require(`${__hooks}/pinn-system.js`).installierteVersion() || ""); } catch (e) { return ""; }
}

// The bookkeeping collection: locked (no API rules), one record per step that ran
function ensureCollection() {
    let col = findCol(COL);
    if (col) return col;
    $app.save(new Collection({
        type: "base",
        name: COL,
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: "version", type: "number", required: true, onlyInt: true, min: 1 },
            { name: "name", type: "text", max: 100 },
            { name: "app", type: "text", max: 40 },
            { name: "dauer", type: "number" },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_pinn_schema_version` ON `" + COL + "` (`version`)"],
    }));
    col = findCol(COL);
    if (!col) throw new Error("Sammlung \"" + COL + "\" wurde nicht gespeichert.");
    console.log("[Schema] Sammlung \"" + COL + "\" angelegt.");
    return col;
}

function appliedVersions() {
    const out = [];
    let records = [];
    try { records = $app.findRecordsByFilter(COL, "", "", 0, 0); } catch (e) { records = []; }
    records.forEach(r => {
        const v = Number(r.get("version")) || 0;
        if (v > 0 && out.indexOf(v) < 0) out.push(v);
    });
    return out.sort((a, b) => a - b);
}

function record(col, m, ms) {
    const rec = new Record(col);
    rec.set("version", m.version);
    rec.set("name", m.name);
    rec.set("app", appVersion());
    rec.set("dauer", ms);
    $app.save(rec);
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------
function run() {
    const target = latest();
    const failedChecks = runChecks();
    let col;
    try { col = ensureCollection(); } catch (err) {
        const text = "Datenbank-Schema: Sammlung \"" + COL + "\" nicht anlegbar: " + err.message;
        console.log("[Schema] " + text);
        report("fehler", text);
        return { ok: false, version: 0, ziel: target, fehler: err.message, pruefungen: failedChecks };
    }
    const done = appliedVersions();
    const current = done.length ? done[done.length - 1] : 0;
    if (current > target) {
        const text = "Die Datenbank hat Schema " + current + ", diese pinn.-Version kennt nur bis " + target +
            ". Es wird nichts verändert – bitte die passende neuere Version installieren oder eine Sicherung zurückspielen.";
        console.log("[Schema] " + text);
        report("warnung", text);
        return { ok: !failedChecks.length, version: current, ziel: target, neuer: true, pruefungen: failedChecks };
    }
    const steps = MIGRATIONS.slice().sort((a, b) => a.version - b.version);
    let ran = 0;
    for (let i = 0; i < steps.length; i++) {
        const m = steps[i];
        if (done.indexOf(m.version) >= 0) continue;
        const start = Date.now();
        try {
            if (m.up() === false) throw new Error("Schritt meldet einen Fehler.");
        } catch (err) {
            const text = "Datenbank-Schema: Schritt " + m.version + " „" + m.name + "“ fehlgeschlagen: " + err.message;
            console.log("[Schema] " + text);
            report("fehler", text);
            return { ok: false, version: done.length ? done[done.length - 1] : 0, ziel: target, schritt: m.version, fehler: err.message, pruefungen: failedChecks };
        }
        const ms = Date.now() - start;
        try { record(col, m, ms); } catch (err) {
            const text = "Datenbank-Schema: Schritt " + m.version + " lief, ließ sich aber nicht vermerken: " + err.message;
            console.log("[Schema] " + text);
            report("fehler", text);
            return { ok: false, version: done.length ? done[done.length - 1] : 0, ziel: target, schritt: m.version, fehler: err.message, pruefungen: failedChecks };
        }
        done.push(m.version);
        done.sort((a, b) => a - b);
        ran++;
        console.log("[Schema] Schritt " + m.version + " „" + m.name + "“ ausgeführt (" + ms + " ms).");
    }
    console.log("[Schema] Datenbank-Schema " + target + (ran ? " – " + ran + " Schritt(e) ausgeführt." : " – aktuell.") +
        (failedChecks.length ? " Einrichtung unvollständig: " + failedChecks.join(", ") + "." : ""));
    return { ok: !failedChecks.length, version: target, ziel: target, pruefungen: failedChecks };
}

// Runs the pending steps once per start; later calls return the stored result
function ensureCurrent() {
    const known = storeGet(STATE_KEY);
    if (known) return known;
    let state;
    try { state = run(); } catch (err) {
        console.log("[Schema] Start fehlgeschlagen: " + err.message);
        state = { ok: false, version: 0, ziel: latest(), fehler: err.message };
    }
    storeSet(STATE_KEY, state);
    return state;
}

// For the system status (Settings → System): { version, ziel, ok, neuer? }
function status() {
    const s = storeGet(STATE_KEY);
    if (s) return { version: s.version, ziel: s.ziel, ok: !!s.ok, neuer: !!s.neuer };
    const done = appliedVersions();
    return { version: done.length ? done[done.length - 1] : 0, ziel: latest(), ok: false, neuer: false };
}

module.exports = { COL, MIGRATIONS, BASELINE_COLLECTIONS, latest, checks, ensureCurrent, run, status };
