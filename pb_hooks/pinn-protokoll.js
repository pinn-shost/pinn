// pb_hooks/pinn-protokoll.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require()
// (routes and schedule in protokoll.pb.js).
//
// Admin error log: errors of the server hooks (calendar sync, push, waste calendar, sign-in ...)
// end up, in addition to the Docker log, in the locked collection "protokoll". Admins see them in the
// app under Settings → System → "Error log", the main admin via "🧾 Error log".
//
//  - Identical messages (same area, same family, same text) within 24 hours
//    are merged into ONE entry - with a counter ("12×") and the time of the last occurrence.
//    This way a sync error that returns every 15 minutes does not fill the database.
//  - behoben(bereich, familie): if something works again (e.g. the next sync), the open
//    errors of this area are marked as "ok again". So that this does not query
//    the database on every successful run, the memory remembers whether there are any open errors at all.
//  - Retention: 30 days, 1000 entries at most (cleaned up at night, see protokoll.pb.js).
//  - Visibility: main admin everything; family admins the entries of their family - and the entries
//    without a family (server in general) if there is only one family on the server.
//  - An error while logging itself is only logged and never changes the actual flow.

const COL = "protokoll";
const BEREICHE = ["sync", "push", "muell", "anmeldung", "sicherheit", "system"]; // "sicherheit" since 1.152.0 (pinn-alarm.js)
const STUFEN = ["fehler", "warnung", "info"];
const ZUSAMMENFASSEN_MS = 24 * 60 * 60 * 1000;
const AUFBEWAHREN_TAGE = 30;
const MAX_EINTRAEGE = 1000;
const OFFEN_PREFIX = "pinnProtOffen:";
const SCHEMA_KEY = "pinnProtSchema";

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    try { if ($app.store().get(SCHEMA_KEY) === "1") return true; } catch (e) { /* check again */ }
    if (findCol(COL)) {
        try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* ignore */ }
        return true;
    }
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "bereich", type: "text", max: 20 },
                { name: "stufe", type: "text", max: 10 },
                { name: "meldung", type: "text", max: 500 },
                { name: "details", type: "text", max: 4000 },
                { name: "familie", type: "text", max: 40 },
                { name: "benutzer", type: "text", max: 40 },
                { name: "schluessel", type: "text", max: 64 },
                { name: "anzahl", type: "number" },
                { name: "zuletzt", type: "text", max: 30 },
                { name: "behoben", type: "bool" },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: [
                "CREATE INDEX `idx_protokoll_schluessel` ON `" + COL + "` (`schluessel`)",
                "CREATE INDEX `idx_protokoll_zuletzt` ON `" + COL + "` (`zuletzt`)",
                "CREATE INDEX `idx_protokoll_familie` ON `" + COL + "` (`familie`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Protokoll] Sammlung \"" + COL + "\" angelegt.");
        try { $app.store().set(SCHEMA_KEY, "1"); } catch (e) { /* ignore */ }
        return true;
    } catch (err) {
        console.log("[Protokoll] Sammlung \"" + COL + "\" nicht anlegbar: " + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------
function clean(s, max) {
    return String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
// For merging: long numbers (timestamps, sizes) and IDs do not count as a difference
function normForKey(s) {
    return String(s || "").toLowerCase().replace(/\d{4,}/g, "#").replace(/[a-z0-9]{15}/g, "~").replace(/\s+/g, " ").trim();
}
function familyOfUser(userId) {
    if (!userId) return "";
    try { return $app.findRecordById("benutzer", String(userId)).getString("familie"); } catch (e) { return ""; }
}

// opts: { familie, benutzer, details }
function eintrag(bereich, stufe, meldung, opts) {
    const o = opts || {};
    const b = BEREICHE.indexOf(bereich) >= 0 ? bereich : "system";
    const st = STUFEN.indexOf(stufe) >= 0 ? stufe : "fehler";
    const msg = clean(meldung, 500);
    if (!msg) return;
    try {
        if (!ensureSchema()) return;
        let fam = clean(o.familie, 40);
        const user = clean(o.benutzer, 40);
        if (!fam && user) fam = familyOfUser(user);
        const details = clean(o.details, 4000);
        const key = $security.sha256(b + "|" + st + "|" + fam + "|" + normForKey(msg)).slice(0, 48);
        const now = new Date();
        const nowIso = now.toISOString();
        let rec = null;
        try {
            rec = $app.findFirstRecordByFilter(COL, "schluessel = {:k} && zuletzt >= {:t}", {
                k: key, t: new Date(now.getTime() - ZUSAMMENFASSEN_MS).toISOString(),
            });
        } catch (e) { rec = null; }
        if (rec) {
            rec.set("anzahl", (rec.getInt("anzahl") || 1) + 1);
            rec.set("zuletzt", nowIso);
            rec.set("meldung", msg);
            if (details) rec.set("details", details);
            rec.set("behoben", false);
        } else {
            rec = new Record($app.findCollectionByNameOrId(COL));
            rec.set("bereich", b);
            rec.set("stufe", st);
            rec.set("meldung", msg);
            rec.set("details", details);
            rec.set("familie", fam);
            rec.set("benutzer", user);
            rec.set("schluessel", key);
            rec.set("anzahl", 1);
            rec.set("zuletzt", nowIso);
            rec.set("behoben", false);
        }
        $app.save(rec);
        if (st === "fehler") {
            try { $app.store().set(OFFEN_PREFIX + b + ":" + fam, "1"); } catch (e) { /* ignore */ }
        }
    } catch (err) {
        console.log("[Protokoll] Eintrag nicht gespeichert: " + err.message);
    }
}
function fehler(bereich, meldung, opts) { eintrag(bereich, "fehler", meldung, opts); }
function warnung(bereich, meldung, opts) { eintrag(bereich, "warnung", meldung, opts); }
function info(bereich, meldung, opts) { eintrag(bereich, "info", meldung, opts); }

// It worked again: mark open errors of this area (and this family) as "ok again".
// Only queries the database if an error of this area has been logged since the start - or
// once after a restart (then the memory is empty and there could be old open ones).
function behoben(bereich, familie) {
    const fam = clean(familie, 40);
    const key = OFFEN_PREFIX + bereich + ":" + fam;
    let flag = null;
    try { flag = $app.store().get(key); } catch (e) { flag = null; }
    if (flag === "0") return;
    try {
        if (findCol(COL)) {
            const recs = $app.findRecordsByFilter(COL, "bereich = {:b} && familie = {:f} && stufe = 'fehler' && behoben = false", "", 200, 0, { b: bereich, f: fam });
            recs.forEach(r => {
                r.set("behoben", true);
                try { $app.save(r); } catch (e) { /* next time */ }
            });
        }
        $app.store().set(key, "0");
    } catch (err) {
        console.log("[Protokoll] Markieren fehlgeschlagen: " + err.message);
    }
}

// ---------------------------------------------------------------------------------------------
// Reading (for the routes)
// ---------------------------------------------------------------------------------------------
function nurEineFamilie() {
    try { return $app.countRecords("familien") <= 1; } catch (e) { return false; }
}
// Filter (SQL-like for PocketBase) for what the signed-in user may see. null = nothing.
function sichtFilter(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isMainAdmin(e)) return { filter: "id != ''", params: {}, alle: true };
    if (!lib.isAdmin(e) || lib.isGuest(e)) return null;
    const fam = lib.familyOf(e);
    if (!fam) return null;
    if (nurEineFamilie()) return { filter: "(familie = {:f} || familie = '')", params: { f: fam }, alle: true };
    return { filter: "familie = {:f}", params: { f: fam }, alle: false };
}

// ---------------------------------------------------------------------------------------------
// Language of the entries (since 1.153.2)
// ---------------------------------------------------------------------------------------------
// The server writes its messages in German. Whoever reads the log in German sees them as they are, everybody
// else gets English: the entries are translated when they are READ (the stored text never changes, so merging
// of identical messages keeps working). Free text that comes from outside (e.g. the error text of a library) stays
// as it is. Rules are tried in order; "„...“" quotes become English quotes at the end.
const EN_RULES = [
    // security warnings (pinn-alarm.js)
    [/Viele falsche Anmeldeversuche von einer Adresse – sie ist vorübergehend gesperrt\./g, "Many wrong sign-in attempts from one address – it is temporarily blocked."],
    [/Zu viele falsche Passwörter für „(.*?)“\. Das Profil ist vorübergehend gesperrt – die Sperre lässt sich unter Konto → Profile verwalten aufheben\./g, "Too many wrong passwords for “$1”. The profile is temporarily locked – the lock can be lifted under Account → Manage profiles."],
    [/Zu viele falsche PINs für „(.*?)“ am Familien-Dashboard – das Profil ist vorübergehend gesperrt\./g, "Too many wrong PINs for “$1” on the family dashboard – the profile is temporarily locked."],
    [/Jemand hat versucht, sich aus dem Internet mit dem Start-Passwort anzumelden – abgewiesen\./g, "Someone tried to sign in from the internet with the start password – rejected."],
    [/Zugriffsversuche auf die PocketBase-Verwaltung aus dem Internet – abgewiesen\./g, "Access attempts to the PocketBase admin from the internet – rejected."],
    [/Viele Ortungsmeldungen mit unbekannten Geräte-IDs – die Adresse wird 1 Stunde ignoriert\./g, "Many location reports with unknown device IDs – the address is ignored for 1 hour."],
    [/Viele ungültige Zugangsschlüssel \(Familien-Dashboard, Widget oder Smart Home\) von einer Adresse – abgewiesen\./g, "Many invalid access keys (family dashboard, widget or smart home) from one address – rejected."],
    [/Adresse: (.*?) \(aus dem Internet\)/g, "Address: $1 (from the internet)"],
    [/Adresse: (.*?) \(Heimnetz\)/g, "Address: $1 (home network)"],
    // sign-in locks (pinn-sitzungen.js)
    [/Viele fehlgeschlagene Anmeldungen von der Adresse (.*?) – für (.*?) gesperrt\./g, "Many failed sign-ins from address $1 – blocked for $2."],
    [/Zu viele falsche Passwörter für „(.*?)“ – Profil für (.*?) gesperrt\./g, "Too many wrong passwords for “$1” – profile locked for $2."],
    [/Geräteverwaltung: Sammlung „sitzungen“ konnte nicht angelegt werden\./g, "Device management: the collection “sitzungen” could not be created."],
    [/Geräteverwaltung: Eine Anmeldung konnte nicht mit ihrem Gerät verknüpft werden – einzelnes Abmelden geht dafür nur über „Überall abmelden“\./g, "Device management: a sign-in could not be linked to its device – signing out just that device does not work for it, only “Sign out everywhere”."],
    // database set-up (pinn-schema.js)
    [/Datenbank-Einrichtung „(.*?)“ fehlgeschlagen: /g, "Database set-up „$1“ failed: "],
    [/Datenbank-Schema: Sammlung "(.*?)" nicht anlegbar: /g, "Database schema: collection \"$1\" could not be created: "],
    [/Datenbank-Schema: Schritt (\d+) „(.*?)“ fehlgeschlagen: /g, "Database schema: step $1 „$2“ failed: "],
    [/Datenbank-Schema: Schritt (\d+) lief, ließ sich aber nicht vermerken: /g, "Database schema: step $1 ran but could not be recorded: "],
    [/Die Datenbank hat Schema (\d+), diese pinn\.-Version kennt nur bis (\d+)\. Es wird nichts verändert – bitte die passende neuere Version installieren oder eine Sicherung zurückspielen\./g, "The database has schema $1, this pinn. version only knows up to $2. Nothing is changed – please install the matching newer version or restore a backup."],
    [/Schritt meldet einen Fehler\./g, "Step reports an error."],
    [/: nicht eingerichtet$/g, ": not set up"],
    // automatic update (pinn-system.js)
    [/Automatisches Update auf (.*?) fehlgeschlagen \(/g, "Automatic update to $1 failed ("],
    [/Automatisches Update nicht gestartet: /g, "Automatic update not started: "],
    // hooks (prefix before the error text)
    [/^Geburtstage in der Familie: /, "Birthdays in the family: "],
    [/^Abgleich verknüpfter Kalender fehlgeschlagen: /, "Sync of linked calendars failed: "],
    [/^Vorgemerkte Meldungen nach dem Neustart nicht wiederhergestellt: /, "Queued notifications could not be restored after the restart: "],
    [/^Push ist auf dem Server nicht verfügbar: /, "Push is not available on the server: "],
    [/^Push-Selbsttest fehlgeschlagen: /, "Push self-test failed: "],
    [/^Verzögerte Meldungen: /, "Delayed notifications: "],
    [/^Push-Zeitplan fehlgeschlagen: /, "Push schedule failed: "],
    [/^Müllkalender-Zeitplan fehlgeschlagen: /, "Waste calendar schedule failed: "],
    [/^Müllkalender-Suche fehlgeschlagen: /, "Waste calendar search failed: "],
    [/^Ausblick \(Wochenvorschau\/Monatsausblick\): /, "Outlook (weekly preview / monthly outlook): "],
    [/^Kalender-Sync-Zeitplan fehlgeschlagen: /, "Calendar sync schedule failed: "],
    [/^Packliste: /, "Packing list: "],
    [/^Gesundheit: /, "Health: "],
    [/^Haustiere: /, "Pets: "],
    [/^Futterautomat: /, "Pet feeder: "],
    // frequent error texts that the hooks pass on
    [/Die KI ist auf dem Server nicht eingerichtet \(PINN_GEMINI_KEY fehlt in der \.env\)\./g, "The AI is not set up on the server (PINN_GEMINI_KEY is missing in the .env)."],
    [/Der Gemini-Schlüssel \(PINN_GEMINI_KEY\) ist ungültig\./g, "The Gemini key (PINN_GEMINI_KEY) is invalid."],
    // wait times (pinn-dashboard.js waitText)
    [/einer Minute/g, "one minute"],
    [/(\d+) Minuten/g, "$1 minutes"],
    [/(\d+) Sekunden/g, "$1 seconds"],
    // detail lines of the security warnings (start of a line)
    [/^Art: /gm, "Kind: "],
    [/^Zeit: /gm, "Time: "],
    [/^Direkter Absender \(Proxy\): /gm, "Direct sender (proxy): "],
    [/^Gerät: /gm, "Device: "],
    [/^Gerätename aus der App: /gm, "Device name from the app: "],
    [/^Browser-Kennung: /gm, "Browser ID: "],
    [/^Sprache: /gm, "Language: "],
    [/^Anfrage: /gm, "Request: "],
    [/^Familie: /gm, "Family: "],
    [/^Profil: /gm, "Profile: "],
    [/^Familien-Dashboard: /gm, "Family dashboard: "],
    [/^Versuche: /gm, "Attempts: "],
    [/^Gesperrt für: /gm, "Locked for: "],
    [/^Selbst nachschlagen \(öffnet eine fremde Seite\): /gm, "Look it up yourself (opens a third-party page): "],
];
// German is shown as stored; every other language gets English
function inLanguage(text, lang) {
    const t = String(text || "");
    if (!t || String(lang || "").toLowerCase().slice(0, 2) === "de") return t;
    let out = t;
    for (let i = 0; i < EN_RULES.length; i++) out = out.replace(EN_RULES[i][0], EN_RULES[i][1]);
    return out.replace(/„([^“”]*)“/g, "“$1”");
}

function familienNamen() {
    const out = {};
    try { $app.findRecordsByFilter("familien", "", "", 0, 0).forEach(f => { out[f.id] = f.getString("name"); }); } catch (e) { /* ignore */ }
    return out;
}

function liste(e, opts) {
    const sicht = sichtFilter(e);
    if (!sicht) throw new Error("Das Fehlerprotokoll sehen nur Admins.");
    if (!findCol(COL)) return { eintraege: [], alle: sicht.alle, hauptadmin: require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e) };
    const o = opts || {};
    let filter = sicht.filter;
    const params = Object.assign({}, sicht.params);
    if (o.bereich && BEREICHE.indexOf(o.bereich) >= 0) {
        filter += " && bereich = {:b}";
        params.b = o.bereich;
    }
    const limit = Math.max(1, Math.min(500, parseInt(o.limit, 10) || 300));
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, filter, "-zuletzt", limit, 0, params); } catch (err) { recs = []; }
    const isMain = require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e);
    const namen = isMain ? familienNamen() : {};
    return {
        hauptadmin: isMain,
        alle: sicht.alle,
        eintraege: recs.map(r => ({
            id: r.id,
            bereich: r.getString("bereich"),
            stufe: r.getString("stufe"),
            meldung: inLanguage(r.getString("meldung"), o.sprache),
            details: inLanguage(r.getString("details"), o.sprache),
            familie: r.getString("familie"),
            familienName: r.getString("familie") ? (namen[r.getString("familie")] || "") : "",
            anzahl: r.getInt("anzahl") || 1,
            erstes: r.getString("created"),
            zuletzt: r.getString("zuletzt"),
            behoben: r.getBool("behoben"),
        })),
    };
}

// Short version for Settings → System: open errors of the last 7 days and the latest entry
function kurz(e) {
    const sicht = sichtFilter(e);
    if (!sicht) return { darf: false };
    if (!findCol(COL)) return { darf: true, offen: 0, warnungen: 0, neueste: "" };
    const seit = new Date(Date.now() - 7 * 86400000).toISOString();
    let offen = 0, warnungen = 0, neueste = "";
    try {
        offen = $app.findRecordsByFilter(COL, sicht.filter + " && stufe = 'fehler' && behoben = false && zuletzt >= {:s}", "", 0, 0, Object.assign({ s: seit }, sicht.params)).length;
        warnungen = $app.findRecordsByFilter(COL, sicht.filter + " && stufe = 'warnung' && zuletzt >= {:s}", "", 0, 0, Object.assign({ s: seit }, sicht.params)).length;
        const last = $app.findRecordsByFilter(COL, sicht.filter, "-zuletzt", 1, 0, sicht.params);
        if (last.length) neueste = last[0].getString("zuletzt");
    } catch (err) { /* leave empty */ }
    return { darf: true, offen: offen, warnungen: warnungen, neueste: neueste };
}

// Delete: art = "behoben" (only ok again / warnings / notices), "alle" or a single id
function leeren(e, art, id) {
    const sicht = sichtFilter(e);
    if (!sicht) throw new Error("Das Fehlerprotokoll sehen nur Admins.");
    if (!findCol(COL)) return 0;
    let filter = sicht.filter;
    const params = Object.assign({}, sicht.params);
    if (id) { filter += " && id = {:id}"; params.id = String(id); }
    else if (art === "behoben") filter += " && (behoben = true || stufe != 'fehler')";
    let n = 0;
    try {
        $app.findRecordsByFilter(COL, filter, "", 2000, 0, params).forEach(r => {
            try { $app.delete(r); n++; } catch (err) { /* ignore */ }
        });
    } catch (err) { /* ignore */ }
    return n;
}

// At night: delete old entries, limit the total number
function aufraeumen() {
    if (!findCol(COL)) return;
    try {
        const grenze = new Date(Date.now() - AUFBEWAHREN_TAGE * 86400000).toISOString();
        $app.db().newQuery("DELETE FROM `" + COL + "` WHERE zuletzt < {:g}").bind({ g: grenze }).execute();
        $app.db().newQuery("DELETE FROM `" + COL + "` WHERE id NOT IN (SELECT id FROM `" + COL + "` ORDER BY zuletzt DESC LIMIT " + MAX_EINTRAEGE + ")").execute();
    } catch (err) {
        console.log("[Protokoll] Aufräumen fehlgeschlagen: " + err.message);
    }
}

module.exports = {
    COL, BEREICHE,
    ensureSchema, eintrag, fehler, warnung, info, behoben, familyOfUser,
    liste, kurz, leeren, aufraeumen, inLanguage,
};
