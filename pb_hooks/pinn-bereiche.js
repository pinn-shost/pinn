// pb_hooks/pinn-bereiche.js
// Not a *.pb.js -> not loaded as a hook automatically, only included via require().
//
// Family areas: parts of the family data move out of the one big JSON block in "familien_daten"
// into records of their own (collection "familien_bereiche", one record per family and area).
// Every area is saved on its own with its own conflict protection: two phones editing different
// areas no longer get in each other's way, and saving a shopping item no longer sends every recipe.
//
// Areas (AREAS below – later versions add more, the move itself needs no further changes):
//   rezepte     recipes, recipeFavorites, recipeCategories        (since 1.104.0)
//   essensplan  mealPlan                                           (since 1.104.0)
//
// Fields of "familien_bereiche":
//   familie (relation, deleted together with the family), bereich (name of the area),
//   data (JSON: the keys of this area, exactly as they used to be in familien_daten),
//   altbestand (JSON: copy of the state at the time of the move), altbestand_bis (YYYY-MM-DD: until
//   then the copy is kept), created, updated.
// Access only through the routes in bereiche.pb.js (collection API locked for everyone).
//
// The move (migrateFamily, at every start for all families and lazily on the first request):
//   1. Before anything is changed, the complete family record is written to
//      pb_data/pinn_umzug/familien_daten_<family>_<date>.json (kept for COPY_DAYS days). If that file
//      cannot be written, nothing is moved – the next start tries again.
//   2. In one transaction: the area record is created with the keys of this area, the same state is
//      kept in "altbestand" for COPY_DAYS days, and the keys are removed from familien_daten.
//
// Safety net for devices that still run an older app version:
//   - They keep seeing everything: when familien_daten is read through the collection API without
//     ?bereiche=1 (only the new app sends it), the areas are added to the answer (overlay).
//   - What they still send in the old block is added to the areas (absorb): missing entries are added,
//     empty values filled – never deleted or overwritten. After COPY_DAYS days this stops; by then
//     every device has long had the new app.
//   - Leftovers in familien_daten itself (e.g. a family record created by the app after the move) are
//     always added and then removed from the block.

const COL = "familien_bereiche";
const AREAS = {
    rezepte: ["recipes", "recipeFavorites", "recipeCategories"],
    essensplan: ["mealPlan"],
};
const DATA_MAX = 50 * 1024 * 1024;   // same limit as familien_daten (recipe photos of old versions are embedded)
const COPY_DAYS = 30;
const BACKUP_DIR = "/pb_data/pinn_umzug";
const CHECK_KEY = "pinnBereicheCheck_";  // app store: stamp of familien_daten at the last leftover check

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function parse(raw) {
    try { return require(`${__hooks}/calendar-sync.js`).parseRecordData(raw) || {}; } catch (e) { return {}; }
}
function parseOrNull(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    const v = parse(raw);
    return (v && typeof v === "object") ? v : null;
}
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isEmptyVal(v) { return v === undefined || v === null || v === "" || v === 0 || v === false; }
function names() { return Object.keys(AREAS); }
function keysOf(name) { return AREAS[name] || []; }
function allKeys() {
    const out = [];
    names().forEach(n => keysOf(n).forEach(k => out.push(k)));
    return out;
}
function areaOfKey(key) {
    return names().find(n => keysOf(n).indexOf(key) >= 0) || "";
}
// Only the keys of an area that are really present
function pick(src, keys) {
    const out = {};
    if (!isObj(src)) return out;
    keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) out[k] = src[k]; });
    return out;
}
function hasAny(src, keys) {
    return isObj(src) && keys.some(k => Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined);
}
function ymd(ms) {
    const d = new Date(ms);
    const p = (n) => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function today() { return ymd(Date.now()); }
function validFamily(id) { return /^[a-z0-9]{15}$/.test(String(id || "")); }
function stamp(familyId) {
    try { return require(`${__hooks}/pinn-benutzer.js`).familyDataStamp(familyId); } catch (e) { return ""; }
}
function storeGet(key) {
    try { return $app.store().get(key); } catch (e) { return null; }
}
function storeSet(key, val) {
    try { $app.store().set(key, val); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    const existing = findCol(COL);
    if (existing) return existing;
    const fam = findCol("familien");
    if (!fam) {
        console.log("[Bereiche] Sammlung \"familien\" fehlt noch - die Bereiche werden später eingerichtet.");
        return null;
    }
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "bereich", type: "text", max: 40 },
                { name: "data", type: "json", maxSize: DATA_MAX },
                { name: "altbestand", type: "json", maxSize: DATA_MAX },
                { name: "altbestand_bis", type: "text", max: 10 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: [
                "CREATE UNIQUE INDEX `idx_familien_bereiche_familie_bereich` ON `" + COL + "` (`familie`, `bereich`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Bereiche] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Bereiche] Sammlung nicht anlegbar: " + err.message);
        return null;
    }
    return findCol(COL);
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------
function areaRecord(familyId, name, app) {
    const a = app || $app;
    try { return a.findFirstRecordByFilter(COL, "familie = {:f} && bereich = {:b}", { f: String(familyId), b: String(name) }); } catch (e) { return null; }
}
// Names of the areas a family already has (small query, without the data)
function movedNames(familyId) {
    if (!familyId || !findCol(COL)) return [];
    try {
        const rows = arrayOf(new DynamicModel({ bereich: "" }));
        $app.db().newQuery("SELECT bereich FROM " + COL + " WHERE familie = {:f}").bind({ f: String(familyId) }).all(rows);
        return rows.map(r => String(r.bereich || "")).filter(n => !!AREAS[n]);
    } catch (e) { return []; }
}
function isMoved(familyId, name) {
    return movedNames(familyId).indexOf(name) >= 0;
}
// Data of several areas of a family as one object (e.g. { recipes, mealPlan, … })
function readMany(familyId, list) {
    const out = {};
    if (!familyId || !findCol(COL)) return out;
    (list || names()).forEach(n => {
        const rec = areaRecord(familyId, n);
        if (!rec) return;
        const d = parse(rec.get("data"));
        keysOf(n).forEach(k => { if (d[k] !== undefined) out[k] = d[k]; });
    });
    return out;
}
// Adds the areas to a family data object (for older app versions and server functions that need them)
function overlay(familyId, data) {
    const base = isObj(data) ? data : {};
    const moved = movedNames(familyId);
    if (!moved.length) return base;
    const extra = readMany(familyId, moved);
    Object.keys(extra).forEach(k => { base[k] = extra[k]; });
    return base;
}
// Kitchen tools of the family (for the public recipes) without parsing the whole family record
function kitchenToolsOf(familyId) {
    try {
        const m = new DynamicModel({ t: "" });
        $app.db().newQuery("SELECT COALESCE(json_extract(data, '$.kitchenTools'), '') AS t FROM familien_daten WHERE familie = {:f} LIMIT 1")
            .bind({ f: String(familyId) }).one(m);
        const t = String(m.t || "");
        if (!t) return [];
        const v = JSON.parse(t);
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}
// Which area keys are still (or again) in familien_daten? Checked in SQLite, without parsing in JS.
function leftoverKeys(familyId) {
    const keys = allKeys().filter(k => /^[A-Za-z0-9_]+$/.test(k));
    if (!keys.length) return [];
    try {
        const fields = {};
        keys.forEach((k, i) => { fields["k" + i] = 0; });
        const m = new DynamicModel(fields);
        const cols = keys.map((k, i) => "(json_type(data, '$." + k + "') IS NOT NULL) AS k" + i).join(", ");
        $app.db().newQuery("SELECT " + cols + " FROM familien_daten WHERE familie = {:f} LIMIT 1").bind({ f: String(familyId) }).one(m);
        return keys.filter((k, i) => Number(m["k" + i]) === 1);
    } catch (e) { return []; }
}

// ---------------------------------------------------------------------------------------------
// Additive merge (never deletes, never overwrites): lists of objects are matched by their ID,
// missing entries are added and empty values of existing ones filled.
// ---------------------------------------------------------------------------------------------
function idOf(x) { return (isObj(x) && x.id !== undefined && x.id !== null && x.id !== "") ? String(x.id) : ""; }
function unionMerge(target, source, stats) {
    if (Array.isArray(target) && Array.isArray(source)) {
        if (source.some(isObj) || target.some(isObj)) {
            const byId = {};
            const seen = {};
            target.forEach(x => { const id = idOf(x); if (id) byId[id] = x; else seen[JSON.stringify(x)] = true; });
            source.forEach(x => {
                const id = idOf(x);
                if (id) {
                    if (!byId[id]) { target.push(x); byId[id] = x; stats.n++; }
                    else if (isObj(byId[id]) && isObj(x)) unionMerge(byId[id], x, stats);
                    return;
                }
                const key = JSON.stringify(x);
                if (!seen[key]) { target.push(x); seen[key] = true; stats.n++; }
            });
            return target;
        }
        source.forEach(x => { if (target.indexOf(x) < 0) { target.push(x); stats.n++; } });
        return target;
    }
    if (isObj(target) && isObj(source)) {
        Object.keys(source).forEach(k => {
            const tv = target[k];
            const sv = source[k];
            if (isEmptyVal(tv)) {
                if (!isEmptyVal(sv) && !(Array.isArray(sv) && !sv.length) && !(isObj(sv) && !Object.keys(sv).length)) { target[k] = sv; stats.n++; }
            } else if ((Array.isArray(tv) && Array.isArray(sv)) || (isObj(tv) && isObj(sv))) {
                target[k] = unionMerge(tv, sv, stats);
            }
        });
        return target;
    }
    return target;
}

// ---------------------------------------------------------------------------------------------
// Backup before the move
// ---------------------------------------------------------------------------------------------
function backupFile(familyId) {
    return BACKUP_DIR + "/familien_daten_" + familyId + "_" + today() + ".json";
}
// -> true if the backup exists afterwards (or there is nothing to back up)
function backupFamilyData(familyId, rec) {
    if (!rec) return true;
    const path = backupFile(familyId);
    try { $os.stat(path); return true; } catch (e) { /* not there yet */ }
    try {
        $os.mkdirAll(BACKUP_DIR, 448); // 0700
        let text = "";
        try { text = toString(rec.get("data")); } catch (e) { text = ""; }
        if (!text || text.charAt(0) !== "{") text = JSON.stringify(parse(rec.get("data")));
        $os.writeFile(path, text, 384); // 0600
        console.log("[Bereiche] Sicherung vor dem Umzug: " + path);
        return true;
    } catch (err) {
        console.log("[Bereiche] Sicherung vor dem Umzug nicht möglich (" + err.message + ") - Umzug verschoben.");
        return false;
    }
}
// Remove backups older than COPY_DAYS days
function cleanupBackups() {
    let entries = [];
    try { entries = $os.readDir(BACKUP_DIR); } catch (e) { return; }
    const limit = ymd(Date.now() - COPY_DAYS * 86400000);
    entries.forEach(en => {
        let n = "";
        try { n = String(en.name()); } catch (e) { n = ""; }
        const m = /^familien_daten_[a-z0-9]+_(\d{4}-\d{2}-\d{2})\.json$/.exec(n);
        if (!m || m[1] >= limit) return;
        try { $os.remove(BACKUP_DIR + "/" + n); } catch (e) { /* ignore */ }
    });
}

// ---------------------------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------------------------
// Creates the missing areas of a family (content from familien_daten) and takes leftovers over.
// -> { created: [names], leftovers: number }
function migrateFamily(familyId) {
    const result = { created: [], leftovers: 0 };
    if (!validFamily(familyId) || !ensureSchema()) return result;
    const missing = names().filter(n => movedNames(familyId).indexOf(n) < 0);
    if (missing.length) {
        let famRec = null;
        try { famRec = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { famRec = null; }
        const needsBackup = famRec && missing.some(n => hasAny(parse(famRec.get("data")), keysOf(n)));
        if (needsBackup && !backupFamilyData(familyId, famRec)) return result;
        try {
            $app.runInTransaction((tx) => {
                let fr = null;
                try { fr = tx.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { fr = null; }
                const data = fr ? parse(fr.get("data")) : {};
                let changed = false;
                const col = tx.findCollectionByNameOrId(COL);
                missing.forEach(n => {
                    if (areaRecord(familyId, n, tx)) return; // created in the meantime
                    const keys = keysOf(n);
                    const content = pick(data, keys);
                    const rec = new Record(col);
                    rec.set("familie", String(familyId));
                    rec.set("bereich", n);
                    rec.set("data", content);
                    if (Object.keys(content).length) {
                        rec.set("altbestand", content);
                        rec.set("altbestand_bis", ymd(Date.now() + COPY_DAYS * 86400000));
                    }
                    tx.save(rec);
                    keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(data, k)) { delete data[k]; changed = true; } });
                    result.created.push(n);
                });
                if (fr && changed) {
                    fr.set("data", data);
                    tx.save(fr);
                }
            });
        } catch (err) {
            console.log("[Bereiche] Umzug für Familie " + familyId + " fehlgeschlagen: " + err.message);
            result.created = [];
            return result;
        }
        if (result.created.length) console.log("[Bereiche] Familie " + familyId + ": " + result.created.join(", ") + " in eigene Datensätze umgezogen.");
    }
    result.leftovers = takeLeftovers(familyId);
    return result;
}
// Area keys that are (again) in familien_daten: add them to the areas, then remove them from the block
function takeLeftovers(familyId) {
    if (!leftoverKeys(familyId).length) return 0;
    const moved = movedNames(familyId);
    let added = 0;
    try {
        $app.runInTransaction((tx) => {
            let fr = null;
            try { fr = tx.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { fr = null; }
            if (!fr) return;
            const data = parse(fr.get("data"));
            let changed = false;
            moved.forEach(n => {
                const keys = keysOf(n);
                if (!hasAny(data, keys)) return;
                const rec = areaRecord(familyId, n, tx);
                if (!rec) return;
                const stats = { n: 0 };
                const current = parse(rec.get("data"));
                const merged = unionMerge(isObj(current) ? current : {}, pick(data, keys), stats);
                if (stats.n) { rec.set("data", merged); tx.save(rec); added += stats.n; }
                keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(data, k)) { delete data[k]; changed = true; } });
            });
            if (changed) { fr.set("data", data); tx.save(fr); }
        });
    } catch (err) {
        console.log("[Bereiche] Reste aus den Familiendaten nicht übernehmbar: " + err.message);
        return 0;
    }
    if (added) console.log("[Bereiche] Familie " + familyId + ": " + added + " Einträge aus den Familiendaten ergänzt.");
    return added;
}
// Takes area keys out of an object about to be saved in familien_daten (sent by an older app version):
// within COPY_DAYS days after the move missing entries are added to the area, afterwards they are only
// dropped. Changes "incoming" in place. -> number of added entries
function absorb(familyId, incoming) {
    if (!validFamily(familyId) || !isObj(incoming) || !hasAny(incoming, allKeys())) return 0;
    const moved = movedNames(familyId);
    if (!moved.length) return 0;
    let added = 0;
    moved.forEach(n => {
        const keys = keysOf(n);
        if (!hasAny(incoming, keys)) return;
        const part = pick(incoming, keys);
        keys.forEach(k => { delete incoming[k]; });
        try {
            $app.runInTransaction((tx) => {
                const rec = areaRecord(familyId, n, tx);
                if (!rec) return;
                const created = Date.parse(String(rec.getString("created") || "").replace(" ", "T"));
                if (isFinite(created) && Date.now() - created > COPY_DAYS * 86400000) return;
                const stats = { n: 0 };
                const current = parse(rec.get("data"));
                const merged = unionMerge(isObj(current) ? current : {}, part, stats);
                if (!stats.n) return;
                rec.set("data", merged);
                tx.save(rec);
                added += stats.n;
            });
        } catch (err) {
            console.log("[Bereiche] Daten eines älteren Geräts nicht übernehmbar: " + err.message);
        }
    });
    if (added) console.log("[Bereiche] Familie " + familyId + ": " + added + " Einträge von einem älteren Gerät ergänzt.");
    return added;
}
// Copies of the move are only kept for COPY_DAYS days
function expireCopies() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "altbestand_bis != '' && altbestand_bis < {:t}", "", 0, 0, { t: today() }); } catch (e) { recs = []; }
    recs.forEach(rec => {
        try {
            rec.set("altbestand", null);
            rec.set("altbestand_bis", "");
            $app.save(rec);
        } catch (err) { console.log("[Bereiche] Kopie nicht entfernbar: " + err.message); }
    });
    cleanupBackups();
}
function migrateAll() {
    if (!ensureSchema()) return;
    let families = [];
    try { families = $app.findRecordsByFilter("familien", "", "created", 0, 0); } catch (e) { families = []; }
    families.forEach(f => {
        try { migrateFamily(f.id); } catch (e) { console.log("[Bereiche] Familie " + f.id + ": " + e.message); }
    });
    try { expireCopies(); } catch (e) { console.log("[Bereiche] Aufräumen: " + e.message); }
}
// Before answering: missing areas or leftovers? Only checked again when familien_daten has changed.
function ensureFamily(familyId) {
    const s = stamp(familyId);
    const key = CHECK_KEY + familyId;
    if (s && storeGet(key) === s && movedNames(familyId).length === names().length) return;
    migrateFamily(familyId);
    storeSet(key, stamp(familyId));
}

// ---------------------------------------------------------------------------------------------
// For the app
// ---------------------------------------------------------------------------------------------
// stand: { <area>: '<updated>' } of the device -> [{ name, keys, updated, data? }] (data only if changed)
function list(familyId, stand) {
    ensureFamily(familyId);
    const known = isObj(stand) ? stand : {};
    const out = [];
    names().forEach(n => {
        const rec = areaRecord(familyId, n);
        if (!rec) return;
        const updated = rec.getString("updated");
        const item = { name: n, keys: keysOf(n).slice(), updated: updated };
        if (known[n] !== updated) item.data = pick(parse(rec.get("data")), keysOf(n));
        out.push(item);
    });
    return out;
}
// body: { bereich, expectedUpdated, data } -> { status, body, previous, saved }
function save(familyId, body) {
    const name = String((body && body.bereich) || "");
    if (!AREAS[name]) return { status: 400, body: { error: "Unbekannter Bereich.", gone: true } };
    if (!body || !isObj(body.data)) return { status: 400, body: { error: "data fehlt." } };
    const incoming = pick(body.data, keysOf(name));
    let size = 0;
    try { size = JSON.stringify(incoming).length; } catch (e) { size = DATA_MAX + 1; }
    if (size > DATA_MAX) return { status: 413, body: { error: "Die Daten sind zu groß." } };
    if (!areaRecord(familyId, name)) migrateFamily(familyId);
    let result = null;
    let previous = null;
    $app.runInTransaction((tx) => {
        const rec = areaRecord(familyId, name, tx);
        if (!rec) { result = { status: 409, body: { conflict: true, updated: "", data: {} } }; return; }
        const current = rec.getString("updated");
        if (body.expectedUpdated !== undefined && String(body.expectedUpdated || "") !== current) {
            result = { status: 409, body: { conflict: true, updated: current, data: pick(parse(rec.get("data")), keysOf(name)) } };
            return;
        }
        previous = pick(parse(rec.get("data")), keysOf(name));
        rec.set("data", incoming);
        tx.save(rec);
        result = { status: 200, body: { success: true, updated: rec.getString("updated") } };
    });
    return { status: result.status, body: result.body, previous: previous, saved: result.status === 200 ? incoming : null, name: name };
}
// After a successful save: public recipes and the bell (notifications about new meals/recipes)
function afterSave(familyId, name, previous, saved, auth) {
    if (!saved) return;
    if (name === "rezepte") {
        try {
            require(`${__hooks}/pinn-rezepte.js`).syncFamily(familyId, { recipes: saved.recipes || [], kitchenTools: kitchenToolsOf(familyId) });
        } catch (err) { console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message); }
    }
    try {
        // Both areas together, so a new meal gets the title of its recipe
        const others = readMany(familyId, names().filter(n => n !== name));
        const oldView = Object.assign({}, others, previous || {});
        const newView = Object.assign({}, others, saved);
        require(`${__hooks}/pinn-hinweise.js`).afterSave(familyId, oldView, newView, auth);
    } catch (err) { console.log("[Hinweise] Auswertung nach dem Speichern fehlgeschlagen: " + err.message); }
}
// Public recipes after a change of the kitchen tools in familien_daten
function syncPublicRecipes(familyId, kitchenTools) {
    const recipes = readMany(familyId, ["rezepte"]).recipes || [];
    require(`${__hooks}/pinn-rezepte.js`).syncFamily(familyId, { recipes: recipes, kitchenTools: Array.isArray(kitchenTools) ? kitchenTools : kitchenToolsOf(familyId) });
}

// ---------------------------------------------------------------------------------------------
// HTTP helpers (route handlers run isolated – see bereiche.pb.js)
// ---------------------------------------------------------------------------------------------
function httpSend(e, status, obj) {
    let text = "";
    try { text = JSON.stringify(obj); }
    catch (err) {
        console.log("[Bereiche] Antwort nicht umwandelbar: " + err.message);
        status = 500;
        text = JSON.stringify({ error: "Antwort nicht umwandelbar: " + err.message });
    }
    try { e.response.header().set("Cache-Control", "no-store"); } catch (err) { /* ignore */ }
    return e.string(status, text);
}
function httpBody(e) {
    try { const b = e.requestInfo().body; return (b && typeof b === "object") ? b : {}; } catch (err) { return {}; }
}
function httpFamily(e) {
    try { return require(`${__hooks}/pinn-benutzer.js`).familyOf(e); } catch (err) { return ""; }
}
function httpFail(e, where, ex, status) {
    const msg = (ex && ex.message) ? ex.message : String(ex || "Unbekannter Fehler");
    console.log("[Bereiche] " + where + ": " + msg);
    return httpSend(e, status || 500, { error: msg });
}

module.exports = {
    COL, AREAS, COPY_DAYS,
    ensureSchema, migrateAll, migrateFamily, ensureFamily, expireCopies, takeLeftovers, absorb,
    names, keysOf, allKeys, areaOfKey, movedNames, isMoved, readMany, overlay, kitchenToolsOf, leftoverKeys,
    list, save, afterSave, syncPublicRecipes, unionMerge,
    httpSend, httpBody, httpFamily, httpFail,
};
