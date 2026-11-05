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
const BEREICHE = ["sync", "push", "muell", "anmeldung", "system"];
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
            meldung: r.getString("meldung"),
            details: r.getString("details"),
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
    liste, kurz, leeren, aufraeumen,
};
