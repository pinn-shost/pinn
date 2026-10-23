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
//   einkauf     shoppingItems, shoppingHistory, shoppingLists, shoppingTransferred, shoppingPlans,
//               shoppingListOrder, shoppingMealTarget, shoppingIngredientRules,
//               shoppingCategoryOrder                              (since 1.105.0)
//   vorrat      pantryItems, pantryCategories, pantryLocations, pantrySettings (since 1.105.0)
//   pinnwand    pinboard                                           (since 1.106.0)
//   listen      familyLists, listTemplates                         (since 1.106.0)
//   schule      schoolProfiles, schoolHomework, schoolLetters, schoolClosures (since 1.106.0)
//   haustiere   pets, petLog                                       (since 1.106.0)
//   zuhause     houseMaintenance                                   (since 1.106.0)
//   mitglieder  members                                            (since 1.108.0)
//   notfall     emergencyPasses                                    (since 1.108.0)
//   einstellungen  lastName, wohnform, themeColors, darkMode, default views, categoryActive,
//               weatherLocation, kitchenTools, favoriteTabs, guestHiddenViews,
//               documentCategories                                 (since 1.108.0)
//   aufgaben    tasks, doneTaskCleanupDays                         (since 1.109.0)
//   haushalt    rooms, roomSchedules, trashBins, cleaningCategories, smartDevices (since 1.109.0)
//   kalender    appleCalendar (calendar selection and colours – never the Apple ID or password,
//               see cleanArea)                                     (since 1.109.0)
// Still in familien_daten: only the old finance block (before the funds) and old default views
// (defaultViewMode / defaultViewScope).
//
// Server code reads the family data through pinn-benutzer.js: loadFamilyDataFor() contains the areas
// (overlay) and familyDataStamp() changes with every area as well, so caches built on it stay correct.
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
//   - They keep seeing everything: when familien_daten is read through the collection API, every area
//     the device does not know yet is added to the answer (overlay). The app tells which areas it handles
//     itself: ?bereiche=<names, comma separated> (1.104 sent ?bereiche=1 = rezepte,essensplan); the same
//     list comes with /api/pinn/save as "bereiche" (1.104 sent true). No list = app without areas.
//   - What they still send in the old block is added to the areas (absorb): missing entries are added,
//     empty values filled – never deleted or overwritten. After COPY_DAYS days this stops; by then
//     every device has long had the new app.
//   - Leftovers in familien_daten itself (e.g. a family record created by the app after the move) are
//     always added and then removed from the block.

const COL = "familien_bereiche";
const AREAS = {
    rezepte: ["recipes", "recipeFavorites", "recipeCategories"],
    essensplan: ["mealPlan"],
    einkauf: ["shoppingItems", "shoppingHistory", "shoppingLists", "shoppingTransferred", "shoppingPlans",
        "shoppingListOrder", "shoppingMealTarget", "shoppingIngredientRules", "shoppingCategoryOrder"],
    vorrat: ["pantryItems", "pantryCategories", "pantryLocations", "pantrySettings"],
    pinnwand: ["pinboard"],
    listen: ["familyLists", "listTemplates"],
    schule: ["schoolProfiles", "schoolHomework", "schoolLetters", "schoolClosures"],
    haustiere: ["pets", "petLog"],
    zuhause: ["houseMaintenance"],
    mitglieder: ["members"],
    notfall: ["emergencyPasses"],
    einstellungen: ["lastName", "wohnform", "themeColors", "darkMode", "defaultViewModeDesktop", "defaultViewScopeDesktop",
        "defaultViewModeMobile", "defaultViewScopeMobile", "categoryActive", "weatherLocation", "kitchenTools", "favoriteTabs",
        "guestHiddenViews", "documentCategories"],
    aufgaben: ["tasks", "doneTaskCleanupDays"],
    haushalt: ["rooms", "roomSchedules", "trashBins", "cleaningCategories", "smartDevices"],
    kalender: ["appleCalendar"],
};
// Areas app 1.104 knew (it sent bereiche=true / ?bereiche=1)
const AREAS_1104 = ["rezepte", "essensplan"];
// Other areas the bell needs to describe a change (a new meal gets the title of its recipe)
const CONTEXT = { essensplan: ["rezepte"], notfall: ["mitglieder"] };
// Keys of an area a guest account cannot change (the stored value is kept)
const GUEST_LOCKED = { einstellungen: ["guestHiddenViews"] };
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
// 0 and false are real values (e.g. doneTaskCleanupDays 0 = "remove at once", darkMode false) – an older
// device must not replace them with its own setting
function isEmptyVal(v) { return v === undefined || v === null || v === ""; }
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
// Apple ID and app password never belong in an area (they live encrypted in "apple_zugaenge",
// see pinn-apple.js). Changes obj in place. -> true if something was removed
function cleanArea(name, obj) {
    if (name !== "kalender" || !isObj(obj)) return false;
    try { return require(`${__hooks}/calendar-sync.js`).stripAppleSecrets(obj); } catch (e) { return false; }
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
// Adds the areas to a family data object (for older app versions and server functions that need them).
// names: only these areas (default: all moved ones)
function overlay(familyId, data, names) {
    const base = isObj(data) ? data : {};
    const moved = movedNames(familyId).filter(n => !Array.isArray(names) || names.indexOf(n) >= 0);
    if (!moved.length) return base;
    const extra = readMany(familyId, moved);
    Object.keys(extra).forEach(k => { base[k] = extra[k]; });
    return base;
}
// One value of an area as SQLite returns it (json_extract: text as is, lists/objects as JSON text), without
// parsing the area in JS. Until the area has moved (or if the key is missing there) familien_daten is read.
// -> "" if the value is not there
function fieldText(familyId, name, key) {
    if (!familyId || !/^[A-Za-z0-9_]+$/.test(String(key || ""))) return "";
    const fromFamily = "(SELECT json_extract(data, '$." + key + "') FROM familien_daten WHERE familie = {:f} LIMIT 1)";
    const fromArea = "(SELECT json_extract(data, '$." + key + "') FROM " + COL + " WHERE familie = {:f} AND bereich = {:b} LIMIT 1)";
    const sql = findCol(COL) && AREAS[name]
        ? "SELECT COALESCE(" + fromArea + ", " + fromFamily + ", '') AS t"
        : "SELECT COALESCE(" + fromFamily + ", '') AS t";
    try {
        const m = new DynamicModel({ t: "" });
        $app.db().newQuery(sql).bind({ f: String(familyId), b: String(name || "") }).one(m);
        return String(m.t === null || m.t === undefined ? "" : m.t);
    } catch (e) { return ""; }
}
// Kitchen tools of the family (for the public recipes) without parsing the whole family record
function kitchenToolsOf(familyId) {
    const t = fieldText(familyId, "einstellungen", "kitchenTools");
    if (!t) return [];
    try {
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
function backupFile(familyId, list) {
    return BACKUP_DIR + "/familien_daten_" + familyId + "_" + today() + "_" + (list || []).join("-") + ".json";
}
// -> true if the backup exists afterwards (or there is nothing to back up)
function backupFamilyData(familyId, rec, list) {
    if (!rec) return true;
    const path = backupFile(familyId, list);
    try { $os.stat(path); return true; } catch (e) { /* not there yet */ }
    try {
        $os.mkdirAll(BACKUP_DIR, 448); // 0700
        let text = "";
        try { text = toString(rec.get("data")); } catch (e) { text = ""; }
        if (!text || text.charAt(0) !== "{") text = JSON.stringify(parse(rec.get("data")));
        if (/"appleCalendar"/.test(text) && /"(email|appPassword)"/.test(text)) {
            // Never write old Apple credentials into the backup file
            const d = parse(text);
            if (cleanArea("kalender", d)) text = JSON.stringify(d);
        }
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
        const m = /^familien_daten_[a-z0-9]+_(\d{4}-\d{2}-\d{2})(_[a-z-]*)?\.json$/.exec(n);
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
        if (needsBackup && !backupFamilyData(familyId, famRec, missing)) return result;
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
                    cleanArea(n, content);
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
                const part = pick(data, keys);
                cleanArea(n, part);
                const merged = unionMerge(isObj(current) ? current : {}, part, stats);
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
    let toolsAdded = false;
    moved.forEach(n => {
        const keys = keysOf(n);
        if (!hasAny(incoming, keys)) return;
        const part = pick(incoming, keys);
        cleanArea(n, part);
        const before = added;
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
        if (n === "einstellungen" && added > before && part.kitchenTools !== undefined) toolsAdded = true;
    });
    if (added) console.log("[Bereiche] Familie " + familyId + ": " + added + " Einträge von einem älteren Gerät ergänzt.");
    if (toolsAdded) {
        // New kitchen tools from an older device: the public recipes show them as well
        try { syncPublicRecipes(familyId); } catch (err) { console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message); }
    }
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
// Removes Apple credentials that might have reached a calendar area before (safety net at every start)
function scrubSecrets() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "bereich = 'kalender'", "", 0, 0); } catch (e) { recs = []; }
    recs.forEach(rec => {
        try {
            let changed = false;
            ["data", "altbestand"].forEach(f => {
                const d = parseOrNull(rec.get(f));
                if (d && cleanArea("kalender", d)) { rec.set(f, d); changed = true; }
            });
            if (changed) {
                $app.save(rec);
                console.log("[Bereiche] Alte Apple-Zugangsdaten aus der Kalender-Auswahl entfernt.");
            }
        } catch (err) { console.log("[Bereiche] Kalender-Auswahl nicht bereinigt: " + err.message); }
    });
}
function migrateAll() {
    if (!ensureSchema()) return;
    let families = [];
    try { families = $app.findRecordsByFilter("familien", "", "created", 0, 0); } catch (e) { families = []; }
    families.forEach(f => {
        try { migrateFamily(f.id); } catch (e) { console.log("[Bereiche] Familie " + f.id + ": " + e.message); }
    });
    try { expireCopies(); } catch (e) { console.log("[Bereiche] Aufräumen: " + e.message); }
    try { scrubSecrets(); } catch (e) { console.log("[Bereiche] Kalender-Auswahl: " + e.message); }
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
// body: { bereich, expectedUpdated, data }, opts: { guest } -> { status, body, previous, saved }
function save(familyId, body, opts) {
    const name = String((body && body.bereich) || "");
    if (!AREAS[name]) return { status: 400, body: { error: "Unbekannter Bereich.", gone: true } };
    if (!body || !isObj(body.data)) return { status: 400, body: { error: "data fehlt." } };
    const incoming = pick(body.data, keysOf(name));
    cleanArea(name, incoming);
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
        if (opts && opts.guest) {
            // A guest cannot change these keys: keep what is stored
            (GUEST_LOCKED[name] || []).forEach(k => {
                if (previous[k] !== undefined) incoming[k] = previous[k];
                else delete incoming[k];
            });
        }
        rec.set("data", incoming);
        tx.save(rec);
        result = { status: 200, body: { success: true, updated: rec.getString("updated") } };
    });
    return { status: result.status, body: result.body, previous: previous, saved: result.status === 200 ? incoming : null, name: name };
}
// Areas an app handles itself: true / "1" = app 1.104, array or "a,b" = these names, anything else = none
function knownAreas(value) {
    if (value === true || value === "1") return AREAS_1104.slice();
    let list = [];
    if (Array.isArray(value)) list = value;
    else if (typeof value === "string" && value) list = value.split(",");
    return list.map(x => String(x || "").trim()).filter(n => !!AREAS[n]);
}
// Moved areas an app does not know yet (they are added to familien_daten for it)
function unknownAreas(familyId, known) {
    return movedNames(familyId).filter(n => (known || []).indexOf(n) < 0);
}
// Changes one area on the server itself (e.g. voice control). fn(data) changes data in place and returns
// true if something changed. -> { changed, before, after } (before/after: the area keys only)
function updateArea(familyId, name, fn) {
    if (!AREAS[name]) throw new Error("Unbekannter Bereich.");
    if (!areaRecord(familyId, name)) migrateFamily(familyId);
    const out = { changed: false, before: null, after: null };
    $app.runInTransaction((tx) => {
        const rec = areaRecord(familyId, name, tx);
        if (!rec) throw new Error("Bereich " + name + " fehlt.");
        const data = pick(parse(rec.get("data")), keysOf(name));
        out.before = JSON.parse(JSON.stringify(data));
        if (!fn(data)) return;
        cleanArea(name, data);
        rec.set("data", pick(data, keysOf(name)));
        tx.save(rec);
        out.changed = true;
        out.after = data;
    });
    return out;
}
// Latest change of any area of a family (part of pinn-benutzer.familyDataStamp)
function areasStamp(familyId) {
    if (!familyId || !findCol(COL)) return "";
    try {
        const m = new DynamicModel({ u: "", n: 0 });
        $app.db().newQuery("SELECT COALESCE(MAX(updated), '') AS u, COUNT(*) AS n FROM " + COL + " WHERE familie = {:f}").bind({ f: String(familyId) }).one(m);
        return String(m.n || 0) + ":" + String(m.u || "");
    } catch (e) { return ""; }
}
// After a successful save: public recipes, the board and the bell (notifications about new meals, items …)
function afterSave(familyId, name, previous, saved, auth) {
    if (!saved) return;
    if (name === "rezepte") {
        try {
            require(`${__hooks}/pinn-rezepte.js`).syncFamily(familyId, { recipes: saved.recipes || [], kitchenTools: kitchenToolsOf(familyId) });
        } catch (err) { console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message); }
    }
    if (name === "einstellungen" && JSON.stringify((previous && previous.kitchenTools) || null) !== JSON.stringify(saved.kitchenTools || null)) {
        // Kitchen tools are part of the public recipes
        try { syncPublicRecipes(familyId, saved.kitchenTools); }
        catch (err) { console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message); }
    }
    if (name === "pinnwand") {
        // Board: remember new notes, replies and reminders for the push messages
        try { require(`${__hooks}/pinn-pinnwand.js`).afterSave(familyId, saved, auth ? auth.id : ""); }
        catch (err) { console.log("[Pinnwand] Auswertung nach dem Speichern fehlgeschlagen: " + err.message); }
    }
    try {
        // Context areas only where needed (a new meal gets the title of its recipe). A key that was not
        // stored before counts as unchanged – otherwise everything in it would be reported as new.
        const others = readMany(familyId, CONTEXT[name] || []);
        const prev = Object.assign({}, previous || {});
        Object.keys(saved).forEach(k => { if (prev[k] === undefined) prev[k] = saved[k]; });
        const oldView = Object.assign({}, others, prev);
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
    COL, AREAS, COPY_DAYS, GUEST_LOCKED,
    ensureSchema, migrateAll, migrateFamily, ensureFamily, expireCopies, takeLeftovers, absorb,
    names, keysOf, allKeys, areaOfKey, cleanArea, scrubSecrets, movedNames, isMoved, readMany, overlay, fieldText, kitchenToolsOf, leftoverKeys,
    list, save, afterSave, syncPublicRecipes, unionMerge, knownAreas, unknownAreas, updateArea, areasStamp,
    httpSend, httpBody, httpFamily, httpFail,
};
