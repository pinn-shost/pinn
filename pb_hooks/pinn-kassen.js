// pb_hooks/pinn-kassen.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Funds: separate finance areas within a family (or flat share)
// ---------------------------------------------------------------------------------------------
// Each fund has its own finance data (budget, categories, recurring bookings, depots, pocket money,
// contracts, vehicles ...) and its own bookings (collection "ausgaben", field "kasse"). Whoever is not a member
// of a fund gets NOTHING from it - neither the data nor the bookings nor the receipts.
//
//   art "gemeinsam" - every newly created fund (e.g. household, flat-share, holiday, couple's or own
//                     fund). The members are chosen by whoever created it (owner); only for oneself =
//                     only the owner as a member. Members can leave it.
//   art "familie"   - the family group (exactly one per family, creates itself, belongs
//                     automatically to all profiles except guests). Contracts that are not assigned to
//                     any fund end up here. It does not appear as a fund in Expenses and Savings.
//   art "haushalt"  - (older state) the former household fund with the finance data from before the
//                     funds. Only exists if it actually contains data.
//   art "privat"    - (older state) the former automatically created own fund. Is no longer
//                     created; empty ones are removed on start.
//
// New families have no fund: Finance → Expenses/Savings then only shows the hint to create a
// fund first.
//
// "aufteilen" = expenses are split between the members (who paid, who owes
// whom) - the calculation is done by the app from the bookings (fields "bezahlt_von" and "aufteilung").
//
// Fields of the collection "kassen":
//   familie (relation), name, symbol (emoji), farbe, art, mitglieder (JSON: profile IDs), alle (bool),
//   besitzer (profile ID), aufteilen (bool), daten (JSON: finance data of the fund, as formerly "finance"
//   in the family record), gaeste (JSON: guests without a profile - [{ id: 'gast-…', name, color, removed? }]),
//   created, updated
//
// Guests: people without a profile in the family (e.g. friends on holiday). They do not see the fund, but
// count like members when splitting - their ID is in "bezahlt_von" or "aufteilung" of the bookings.
// Removed guests are kept with removed: true so that old bookings keep their name.
// Access only via the routes in kassen.pb.js (collection API locked).
//
// Migration: on the first start after the update, every family gets its household fund. The previous
// finance data (familien_daten → "finance") moves into it, all previous bookings and receipts are
// assigned to it, and "finance" is removed from the family record. Members: all profiles -
// so after the update everyone sees exactly what they saw before.
//
// Gentle on CPU and memory: for permissions only the small member list is read (never the
// finance data). The app sends along which state it already has - finance data only goes over the
// wire if it has changed.

const KASSEN = "kassen";
const ARTEN = ["haushalt", "privat", "gemeinsam", "familie"];
const DATA_MAX = 8 * 1024 * 1024;
const FARBEN_STANDARD = { haushalt: "#2F4B41", privat: "#7A5C8E", gemeinsam: "#B9842E", familie: "#5B7B6F" };
const SYMBOL_STANDARD = { haushalt: "🏠", privat: "👤", gemeinsam: "👥", familie: "👨‍👩‍👧" };
const FAMILIE_NAME = "Familie";
// Finance data with real content (only categories or the like do not count)
const INHALT_LISTEN = ["vehicles", "contracts", "recurring", "depots", "savingsGoals", "pocketMoney", "pocketLedger"];
function meaningful(fin) {
    if (!fin || typeof fin !== "object" || Array.isArray(fin)) return false;
    if (INHALT_LISTEN.some(k => Array.isArray(fin[k]) && fin[k].length > 0)) return true;
    return Number(fin.budget) > 0 || Number(fin.budgetAdjust || 0) !== 0;
}

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
const EXTRA_FIELDS = [
    { name: "sicherung", type: "json", maxSize: DATA_MAX },   // State before the first change of the day
    { name: "sicherung_tag", type: "text", max: 10 },
    { name: "altbestand", type: "json", maxSize: DATA_MAX },  // all rescued finance data from before the migration (is never deleted)
    { name: "altbestand_stufe", type: "number" },             // Version of the merge with which the old data was imported
    { name: "gaeste", type: "json", maxSize: 20000 },         // Guests without a profile (only for splitting)
];
function makeField(def) {
    const tmp = new Collection({ type: "base", name: "pinn_tmp_" + def.name, fields: [def] });
    return tmp.fields.getByName(def.name);
}
function ensureSchema() {
    let col = findCol(KASSEN);
    if (col) {
        EXTRA_FIELDS.forEach(def => {
            col = findCol(KASSEN);
            if (hasField(col, def.name)) return;
            try { col.fields.add(makeField(def)); $app.save(col); console.log("[Kassen] Feld \"" + def.name + "\" ergänzt."); }
            catch (err) { console.log("[Kassen] Feld \"" + def.name + "\" nicht anlegbar: " + err.message); }
        });
        return true;
    }
    const fam = findCol("familien");
    if (!fam) {
        console.log("[Kassen] Sammlung \"familien\" fehlt noch - Kassen werden beim nächsten Start eingerichtet.");
        return false;
    }
    try {
        $app.save(new Collection({
            type: "base",
            name: KASSEN,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "name", type: "text", max: 60 },
                { name: "symbol", type: "text", max: 16 },
                { name: "farbe", type: "text", max: 9 },
                { name: "art", type: "text", max: 20 },
                { name: "mitglieder", type: "json", maxSize: 20000 },
                { name: "alle", type: "bool" },
                { name: "besitzer", type: "text", max: 30 },
                { name: "aufteilen", type: "bool" },
                { name: "daten", type: "json", maxSize: DATA_MAX },
                { name: "sicherung", type: "json", maxSize: DATA_MAX },
                { name: "sicherung_tag", type: "text", max: 10 },
                { name: "altbestand", type: "json", maxSize: DATA_MAX },
                { name: "altbestand_stufe", type: "number" },
                { name: "gaeste", type: "json", maxSize: 20000 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: [
                "CREATE INDEX `idx_kassen_familie` ON `" + KASSEN + "` (`familie`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Kassen] Sammlung \"" + KASSEN + "\" angelegt.");
        return true;
    } catch (err) {
        console.log("[Kassen] Konnte Sammlung nicht anlegen: " + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function parseJson(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
        const v = require(`${__hooks}/calendar-sync.js`).parseRecordData(raw);
        if (v !== null && v !== undefined) return v;
    } catch (e) { /* further below */ }
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch (e) { return fallback; } }
    return fallback;
}
function parseIdList(raw) {
    let v;
    if (typeof raw === "string") { try { v = JSON.parse(raw || "[]"); } catch (e) { v = []; } }
    else if (Array.isArray(raw) && raw.every(x => typeof x === "string")) v = raw;
    else v = parseJson(raw, []);
    if (!Array.isArray(v)) return [];
    return v.map(x => String(x || "")).filter(x => /^[a-z0-9]{15}$/.test(x));
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function cleanColor(v, fb) { const s = String(v || ""); return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fb; }
function cleanSymbol(v, fb) { const s = String(v || "").trim(); return s ? s.slice(0, 16) : fb; }
function isId(v) { return /^[a-z0-9]{15}$/.test(String(v || "")); }

// Guests without a profile: [{ id: 'gast-…', name, color, removed? }]
const GAST_ID = /^gast-[a-z0-9]{6,20}$/;
const GAESTE_MAX = 30;      // active guests per fund
const GAESTE_GESAMT = 60;   // including removed ones (for the names in old bookings)
function parseGuests(raw) {
    let v;
    if (Array.isArray(raw)) v = raw;
    else if (typeof raw === "string") { try { v = JSON.parse(raw || "[]"); } catch (e) { v = []; } }
    else v = parseJson(raw, []);
    if (!Array.isArray(v)) return [];
    const out = [];
    v.forEach(g => {
        if (!g || typeof g !== "object") return;
        const id = String(g.id || "");
        const name = cleanText(g.name, 40);
        if (!GAST_ID.test(id) || !name || out.some(x => x.id === id)) return;
        const o = { id: id, name: name, color: cleanColor(g.color, "#8A8F98") };
        if (g.removed) o.removed = true;
        out.push(o);
    });
    return out.slice(0, GAESTE_GESAMT);
}

function userRole(user) { try { return user.getString("rolle"); } catch (e) { return ""; } }
function userFamily(user) { try { return user.getString("familie"); } catch (e) { return ""; } }
function isFinanceUser(user) {
    const r = userRole(user);
    return !!user && !!userFamily(user) && r !== "gast" && r !== "hauptadmin";
}
function isFamilyAdmin(user) { return isFinanceUser(user) && userRole(user) === "admin"; }

// All profiles of the family that can have finances (no guests)
function familyUsers(familyId) {
    let list = [];
    try { list = $app.findRecordsByFilter("benutzer", "familie = {:f}", "username", 0, 0, { f: String(familyId) }); } catch (e) { list = []; }
    return list.filter(u => userRole(u) !== "gast" && userRole(u) !== "hauptadmin");
}

// Small overview of all funds of a family - WITHOUT the (large) finance data
function metaList(familyId, app) {
    if (!familyId || !findCol(KASSEN)) return [];
    const a = app || $app;
    const rows = arrayOf(new DynamicModel({
        id: "", name: "", symbol: "", farbe: "", art: "", mitglieder: "", alle: false, besitzer: "", aufteilen: false, updated: "", created: "", sicherung_tag: "", gaeste: "",
    }));
    try {
        a.db().newQuery("SELECT id, name, symbol, farbe, art, COALESCE(mitglieder, '[]') AS mitglieder, alle, besitzer, aufteilen, updated, created, COALESCE(sicherung_tag, '') AS sicherung_tag, COALESCE(gaeste, '[]') AS gaeste FROM " + KASSEN + " WHERE familie = {:f} ORDER BY created, id").bind({ f: String(familyId) }).all(rows);
    } catch (e) {
        // Fallback (e.g. field does not exist yet): read normal records - slower, but safe
        console.log("[Kassen] Kurz-Übersicht nicht lesbar (" + e.message + ") - lese Datensätze.");
        try {
            return a.findRecordsByFilter(KASSEN, "familie = {:f}", "created", 0, 0, { f: String(familyId) }).map(metaOfRecord);
        } catch (e2) {
            console.log("[Kassen] Übersicht nicht lesbar: " + e2.message);
            return [];
        }
    }
    return rows.map(r => ({
        id: r.id,
        familie: String(familyId),
        name: r.name,
        symbol: r.symbol,
        farbe: r.farbe,
        art: ARTEN.indexOf(r.art) >= 0 ? r.art : "gemeinsam",
        mitglieder: parseIdList(r.mitglieder),
        alle: !!r.alle,
        besitzer: r.besitzer,
        aufteilen: !!r.aufteilen,
        updated: r.updated,
        created: r.created,
        sicherungTag: r.sicherung_tag || "",
        gaeste: parseGuests(r.gaeste),
    }));
}
function metaOfRecord(rec) {
    return {
        id: rec.id,
        familie: rec.getString("familie"),
        name: rec.getString("name"),
        symbol: rec.getString("symbol"),
        farbe: rec.getString("farbe"),
        art: ARTEN.indexOf(rec.getString("art")) >= 0 ? rec.getString("art") : "gemeinsam",
        mitglieder: parseIdList(rec.get("mitglieder")),
        alle: !!rec.getBool("alle"),
        besitzer: rec.getString("besitzer"),
        aufteilen: !!rec.getBool("aufteilen"),
        updated: rec.getString("updated"),
        created: rec.getString("created"),
        sicherungTag: (function () { try { return rec.getString("sicherung_tag"); } catch (e) { return ""; } })(),
        gaeste: (function () { try { return parseGuests(rec.get("gaeste")); } catch (e) { return []; } })(),
    };
}

function isMember(k, user) {
    if (!k || !isFinanceUser(user) || k.familie !== userFamily(user)) return false;
    if (k.art === "familie") return true;
    if (k.art === "haushalt" && k.alle) return true;
    return k.mitglieder.indexOf(user.id) >= 0;
}
function canManage(k, user) {
    if (!k || !isFinanceUser(user) || k.familie !== userFamily(user)) return false;
    if (k.art === "familie") return false;
    if (k.art === "haushalt") return isFamilyAdmin(user);
    return k.besitzer === user.id;
}

// Is the family's finance data already in the funds? (household fund or family group present)
function familyMigrated(familyId) {
    if (!familyId || !findCol(KASSEN)) return false;
    try {
        const m = new DynamicModel({ n: 0 });
        $app.db().newQuery("SELECT COUNT(*) AS n FROM " + KASSEN + " WHERE familie = {:f} AND (art = 'haushalt' OR art = 'familie')").bind({ f: String(familyId) }).one(m);
        return Number(m.n) > 0;
    } catch (e) { return false; }
}

// ---------------------------------------------------------------------------------------------
// Household fund - only still there for migrating old finance data (before the funds). Without old data,
// no fund is created: new families create their funds themselves.
// ---------------------------------------------------------------------------------------------
function legacyFinance(familyId) {
    try {
        const famRec = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
        const d = parseJson(famRec.get("data"), {}) || {};
        return (d.finance && typeof d.finance === "object" && !Array.isArray(d.finance)) ? d.finance : null;
    } catch (e) { return null; }
}
function ensureFamily(familyId) {
    if (!familyId || !ensureSchema()) return null;
    const existing = metaList(familyId).find(k => k.art === "haushalt");
    if (existing) return existing;
    if (!meaningful(legacyFinance(familyId))) return null;
    let created = null;
    try {
        $app.runInTransaction((tx) => {
            // check again within the operation - two simultaneous requests would otherwise create two funds
            const again = metaList(familyId, tx).find(k => k.art === "haushalt");
            if (again) { created = again; return; }
            let finance = null;
            let famRec = null;
            try { famRec = tx.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { famRec = null; }
            let famData = null;
            if (famRec) {
                famData = parseJson(famRec.get("data"), {}) || {};
                if (famData.finance && typeof famData.finance === "object" && !Array.isArray(famData.finance)) finance = famData.finance;
            }
            const rec = new Record(tx.findCollectionByNameOrId(KASSEN));
            rec.set("familie", String(familyId));
            rec.set("name", "Haushaltskasse");
            rec.set("symbol", SYMBOL_STANDARD.haushalt);
            rec.set("farbe", FARBEN_STANDARD.haushalt);
            rec.set("art", "haushalt");
            rec.set("mitglieder", []);
            rec.set("alle", true);
            rec.set("besitzer", "");
            rec.set("aufteilen", false);
            rec.set("daten", finance || {});
            if (finance && hasField(rec.collection(), "altbestand")) { rec.set("altbestand", finance); rec.set("altbestand_stufe", MERGE_STUFE); }
            tx.save(rec);
            // previous bookings and receipts now belong to the household fund
            try {
                const aus = tx.findCollectionByNameOrId("ausgaben");
                if (hasField(aus, "kasse")) {
                    tx.db().newQuery("UPDATE ausgaben SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: rec.id, f: String(familyId) }).execute();
                }
            } catch (e) { /* collection does not exist yet - new bookings get the fund when saved */ }
            try {
                const docs = tx.findCollectionByNameOrId("finanz_dokumente");
                if (hasField(docs, "kasse")) {
                    tx.db().newQuery("UPDATE finanz_dokumente SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: rec.id, f: String(familyId) }).execute();
                }
            } catch (e) { /* ignore */ }
            if (famRec && famData && famData.finance !== undefined) {
                delete famData.finance;
                famRec.set("data", famData);
                tx.save(famRec);
            }
            created = metaOfRecord(rec);
            console.log("[Kassen] Haushaltskasse für Familie " + familyId + " angelegt" + (finance ? " (bisherige Finanzdaten übernommen)." : "."));
        });
    } catch (err) {
        console.log("[Kassen] Haushaltskasse nicht anlegbar: " + err.message);
        return null;
    }
    return created;
}

// Family group: belongs automatically to all profiles of the family (except guests). Storage for contracts
// without their own fund. Created when needed (exactly one per family).
function ensureFamilyGroup(familyId) {
    if (!familyId || !ensureSchema()) return null;
    const existing = metaList(familyId).find(k => k.art === "familie");
    if (existing) return existing;
    let created = null;
    try {
        $app.runInTransaction((tx) => {
            const again = metaList(familyId, tx).find(k => k.art === "familie");
            if (again) { created = again; return; }
            const rec = new Record(tx.findCollectionByNameOrId(KASSEN));
            rec.set("familie", String(familyId));
            rec.set("name", FAMILIE_NAME);
            rec.set("symbol", SYMBOL_STANDARD.familie);
            rec.set("farbe", FARBEN_STANDARD.familie);
            rec.set("art", "familie");
            rec.set("mitglieder", []);
            rec.set("alle", true);
            rec.set("besitzer", "");
            rec.set("aufteilen", false);
            rec.set("daten", {});
            tx.save(rec);
            created = metaOfRecord(rec);
        });
        if (created) console.log("[Kassen] Familien-Gruppe für Familie " + familyId + " bereit.");
    } catch (err) {
        console.log("[Kassen] Familien-Gruppe nicht anlegbar: " + err.message);
        return null;
    }
    return created;
}

// On start: remove empty funds that were created automatically in the past (household fund without data, own funds)
// - so that Finance starts again with the hint "create a fund first". Only removed
// where no finance data, bookings, receipts or documents are attached.
function countRefs(coll, kasseId) {
    try {
        const c = findCol(coll);
        if (!c || !hasField(c, "kasse")) return 0;
        const m = new DynamicModel({ n: 0 });
        $app.db().newQuery("SELECT COUNT(*) AS n FROM " + coll + " WHERE kasse = {:k}").bind({ k: String(kasseId) }).one(m);
        return Number(m.n) || 0;
    } catch (e) { return 1; } // keep when in doubt
}
function cleanupEmpty(familyId) {
    metaList(familyId).forEach(k => {
        if (k.art !== "privat" && k.art !== "haushalt") return;
        try {
            const rec = $app.findRecordById(KASSEN, k.id);
            if (meaningful(parseJson(rec.get("daten"), {}))) return;
            if (hasField(rec.collection(), "altbestand") && meaningful(parseJson(rec.get("altbestand"), {}))) return;
            if (countRefs("ausgaben", k.id) || countRefs("finanz_dokumente", k.id) || countRefs("dokumente", k.id)) return;
            $app.delete(rec);
            console.log("[Kassen] Leere " + (k.art === "haushalt" ? "Haushaltskasse" : "eigene Kasse") + " entfernt (Familie " + familyId + ").");
        } catch (e) { console.log("[Kassen] Aufräumen: " + e.message); }
    });
}

// After the update: assign bookings/receipts without a fund (e.g. from a device that has not been updated yet) to the
// household fund. Runs only on start.
function assignOrphans(familyId, haushaltId) {
    try {
        const aus = findCol("ausgaben");
        if (aus && hasField(aus, "kasse")) $app.db().newQuery("UPDATE ausgaben SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: haushaltId, f: String(familyId) }).execute();
    } catch (e) { /* ignore */ }
    try {
        const docs = findCol("finanz_dokumente");
        if (docs && hasField(docs, "kasse")) $app.db().newQuery("UPDATE finanz_dokumente SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: haushaltId, f: String(familyId) }).execute();
    } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// Rescue: add missing entries from an older state - NOTHING is ever deleted.
// Lists with IDs: missing entries are added, existing ones are completed with missing details.
// Single values: only where the current state is empty (missing, '', 0, false).
// ---------------------------------------------------------------------------------------------
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isEmptyVal(v) { return v === undefined || v === null || v === "" || v === 0 || v === false; }
const MERGE_STUFE = 2;
function idOf(x) { return (isObj(x) && x.id !== undefined && x.id !== null && x.id !== "") ? String(x.id) : ""; }
function unionMerge(target, source, stats) {
    if (Array.isArray(target) && Array.isArray(source)) {
        // Lists of objects: match via the ID (as text) - entries without an ID via their content
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
        // simple lists (texts, numbers): add missing values
        source.forEach(x => { if (target.indexOf(x) < 0) { target.push(x); stats.n++; } });
        return target;
    }
    if (isObj(target) && isObj(source)) {
        Object.keys(source).forEach(k => {
            if (k === "__proto__" || k === "constructor" || k === "prototype") return; // never take over prototype keys
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
function hasContent(fin) {
    if (!isObj(fin)) return false;
    return Object.keys(fin).some(k => {
        const v = fin[k];
        if (Array.isArray(v)) return v.length > 0;
        if (isObj(v)) return Object.keys(v).length > 0;
        return !isEmptyVal(v);
    });
}
const RESCUE_DAYS = 30;
// Take over missing finance data into the household fund. opts.force: also after the deadline
// -> number of entries added (-1 = deadline over, no household fund)
function rescueFinance(familyId, fin, opts) {
    const o = opts || {};
    if (!familyId || !hasContent(fin)) return 0;
    const h = metaList(familyId).find(k => k.art === "haushalt");
    if (!h) return -1;
    if (!o.force) {
        const created = Date.parse(String(h.created || "").replace(" ", "T"));
        if (isFinite(created) && Date.now() - created > RESCUE_DAYS * 86400000) return -1;
    }
    let added = 0;
    try {
        $app.runInTransaction((tx) => {
            const rec = tx.findRecordById(KASSEN, h.id);
            const d = parseJson(rec.get("daten"), {}) || {};
            const stats = { n: 0 };
            const merged = unionMerge(isObj(d) ? d : {}, JSON.parse(JSON.stringify(fin)), stats);
            // Old data: every source is additionally kept (for a later, better merge)
            let altChanged = false;
            if (hasField(rec.collection(), "altbestand")) {
                const alt = parseJson(rec.get("altbestand"), {}) || {};
                const as = { n: 0 };
                const altMerged = unionMerge(isObj(alt) ? alt : {}, JSON.parse(JSON.stringify(fin)), as);
                if (as.n) { rec.set("altbestand", altMerged); altChanged = true; }
            }
            if (!stats.n && !altChanged) return;
            if (stats.n) rec.set("daten", merged);
            tx.save(rec);
            added = stats.n;
        });
    } catch (err) {
        console.log("[Kassen] Rettung fehlgeschlagen: " + err.message);
        return 0;
    }
    if (added) console.log("[Kassen] " + added + " fehlende Finanz-Einträge in der Haushaltskasse der Familie " + familyId + " ergänzt" + (o.quelle ? " (aus " + o.quelle + ")." : "."));
    return added;
}
// On start: merge duplicate household/own funds, take over leftovers of "finance" from the
// family record
function repairFamily(familyId) {
    const list = metaList(familyId);
    const groups = {};
    list.forEach(k => {
        const key = k.art === "haushalt" ? "haushalt" : k.art === "familie" ? "familie" : (k.art === "privat" ? "privat|" + k.besitzer : "");
        if (!key) return;
        (groups[key] = groups[key] || []).push(k);
    });
    Object.keys(groups).forEach(key => {
        const g = groups[key];
        if (g.length < 2) return;
        const keep = g[0];
        try {
            $app.runInTransaction((tx) => {
                const keepRec = tx.findRecordById(KASSEN, keep.id);
                const d = parseJson(keepRec.get("daten"), {}) || {};
                const stats = { n: 0 };
                g.slice(1).forEach(other => {
                    const oRec = tx.findRecordById(KASSEN, other.id);
                    unionMerge(d, parseJson(oRec.get("daten"), {}) || {}, stats);
                    ["ausgaben", "finanz_dokumente"].forEach(coll => {
                        try { tx.db().newQuery("UPDATE " + coll + " SET kasse = {:k} WHERE kasse = {:o}").bind({ k: keep.id, o: other.id }).execute(); } catch (e) { /* ignore */ }
                    });
                    tx.delete(oRec);
                });
                keepRec.set("daten", d);
                tx.save(keepRec);
            });
            console.log("[Kassen] " + (g.length - 1) + " doppelte Kasse(n) (" + key + ") zusammengelegt.");
        } catch (err) {
            console.log("[Kassen] Zusammenlegen fehlgeschlagen: " + err.message);
        }
    });
    // Import the old data again with the current merge (once per level)
    try {
        const h = metaList(familyId).find(k => k.art === "haushalt");
        if (h) {
            $app.runInTransaction((tx) => {
                const rec = tx.findRecordById(KASSEN, h.id);
                if (!hasField(rec.collection(), "altbestand")) return;
                if (Number(rec.get("altbestand_stufe")) >= MERGE_STUFE) return;
                const alt = parseJson(rec.get("altbestand"), null);
                const stats = { n: 0 };
                if (hasContent(alt)) {
                    const d = parseJson(rec.get("daten"), {}) || {};
                    const merged = unionMerge(isObj(d) ? d : {}, alt, stats);
                    if (stats.n) rec.set("daten", merged);
                }
                rec.set("altbestand_stufe", MERGE_STUFE);
                tx.save(rec);
                if (stats.n) console.log("[Kassen] Altbestand: " + stats.n + " Einträge ergänzt (Familie " + familyId + ").");
            });
        }
    } catch (e) { console.log("[Kassen] Altbestand nicht einspielbar: " + e.message); }
    // "finance" still in the family record (e.g. migration aborted)? -> add and remove
    try {
        const famRec = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
        const data = parseJson(famRec.get("data"), {}) || {};
        if (data.finance !== undefined) {
            if (meaningful(data.finance)) rescueFinance(familyId, data.finance, { force: true, quelle: "Familien-Datensatz" });
            if (!meaningful(data.finance) || metaList(familyId).some(k => k.art === "haushalt")) {
                delete data.finance;
                famRec.set("data", data);
                $app.save(famRec);
            }
        }
    } catch (e) { /* no family data */ }
}

// Restore the backup (state before the first change of the day) - only adds, deletes nothing
function restoreBackup(user, id) {
    let rec = null;
    try { rec = $app.findRecordById(KASSEN, String(id || "")); } catch (e) { rec = null; }
    if (!rec) throw new Error("Diese Kasse gibt es nicht mehr.");
    const k = metaOfRecord(rec);
    if (!isMember(k, user)) throw new Error("Kein Zugriff auf diese Kasse.");
    const backup = parseJson(rec.get("sicherung"), null);
    if (!hasContent(backup)) return { added: 0 };
    let added = 0;
    $app.runInTransaction((tx) => {
        const r = tx.findRecordById(KASSEN, k.id);
        const d = parseJson(r.get("daten"), {}) || {};
        const stats = { n: 0 };
        const merged = unionMerge(isObj(d) ? d : {}, backup, stats);
        if (!stats.n) return;
        r.set("daten", merged);
        tx.save(r);
        added = stats.n;
    });
    return { added: added };
}

function migrateAll() {
    if (!ensureSchema()) return;
    let families = [];
    try { families = $app.findRecordsByFilter("familien", "", "created", 0, 0); } catch (e) { families = []; }
    families.forEach(f => {
        try {
            const k = ensureFamily(f.id);
            repairFamily(f.id);
            const h = metaList(f.id).find(x => x.art === "haushalt") || k;
            if (h) assignOrphans(f.id, h.id);
            cleanupEmpty(f.id);
            const g = ensureFamilyGroup(f.id);
            if (g && !metaList(f.id).some(x => x.art === "haushalt")) assignOrphans(f.id, g.id);
        } catch (e) { console.log("[Kassen] Familie " + f.id + ": " + e.message); }
    });
}

// (older state) own fund - is no longer created automatically
function ensurePrivate(user) {
    if (!isFinanceUser(user) || !ensureSchema()) return null;
    const fam = userFamily(user);
    const own = metaList(fam).find(k => k.art === "privat" && k.besitzer === user.id);
    if (own) return own;
    try {
        const rec = new Record($app.findCollectionByNameOrId(KASSEN));
        rec.set("familie", fam);
        rec.set("name", "Privat");
        rec.set("symbol", SYMBOL_STANDARD.privat);
        rec.set("farbe", FARBEN_STANDARD.privat);
        rec.set("art", "privat");
        rec.set("mitglieder", [user.id]);
        rec.set("alle", false);
        rec.set("besitzer", user.id);
        rec.set("aufteilen", false);
        rec.set("daten", {});
        $app.save(rec);
        return metaOfRecord(rec);
    } catch (err) {
        console.log("[Kassen] Eigene Kasse nicht anlegbar: " + err.message);
        return null;
    }
}

// ---------------------------------------------------------------------------------------------
// For the other server parts (bookings, receipts, contracts)
// ---------------------------------------------------------------------------------------------
// Funds the profile has access to -> { ids: [...], haushalt: '<ID>'|'' (only if a member), privat: '<ID>'|'' }
// familie: '<ID of the family group>', real: [IDs of the actual funds without the family group]
function access(user) {
    const out = { ids: [], haushalt: "", privat: "", haushaltAll: "", familie: "", real: [] };
    if (!isFinanceUser(user)) return out;
    const fam = userFamily(user);
    const list = metaList(fam);
    list.forEach(k => {
        if (k.art === "haushalt") out.haushaltAll = k.id;
        if (!isMember(k, user)) return;
        out.ids.push(k.id);
        if (k.art === "familie") out.familie = k.id;
        else out.real.push(k.id);
        if (k.art === "haushalt") out.haushalt = k.id;
        if (k.art === "privat" && k.besitzer === user.id) out.privat = k.id;
    });
    return out;
}
// Default fund for bookings without a specification: household fund, own fund, first fund, family group
function defaultKasse(acc) {
    return acc.haushalt || acc.privat || acc.real[0] || acc.familie || acc.ids[0] || "";
}
// Profile IDs that may see a fund (for push messages)
function memberUserIds(k) {
    if (!k) return [];
    if (k.art === "familie" || (k.art === "haushalt" && k.alle)) return familyUsers(k.familie).map(u => u.id);
    return k.mitglieder.slice();
}
// Contracts of all funds of a family: [{ kasse: meta, contracts: [...], userIds: [...] }]
function contractsOfFamily(familyId) {
    const out = [];
    metaList(familyId).forEach(k => {
        let rec = null;
        try { rec = $app.findRecordById(KASSEN, k.id); } catch (e) { rec = null; }
        if (!rec) return;
        const d = parseJson(rec.get("daten"), {}) || {};
        const contracts = Array.isArray(d.contracts) ? d.contracts.filter(c => c && typeof c.id === "string" && c.id) : [];
        if (!contracts.length) return;
        out.push({ kasse: k, contracts: contracts, userIds: memberUserIds(k) });
    });
    return out;
}

// Plants with a smart home action from all funds of a family (Home → Garden & plants lives in the
// finance data of the fund; since 1.122.0 the smart home server reads them from here instead of from the old family record)
function plantsOfFamily(familyId) {
    const out = [];
    const seen = {};
    metaList(familyId).forEach(k => {
        let rec = null;
        try { rec = $app.findRecordById(KASSEN, k.id); } catch (e) { rec = null; }
        if (!rec) return;
        const d = parseJson(rec.get("daten"), {}) || {};
        (Array.isArray(d.homePlants) ? d.homePlants : []).forEach(p => {
            if (!p || typeof p.id !== "string" || !p.id || !p.smart || seen[p.id]) return;
            seen[p.id] = true;
            out.push(p);
        });
    });
    return out;
}
// Change state of all funds of a family (count + latest change), without loading the finance data
function dataStamp(familyId) {
    if (!familyId || !findCol(KASSEN)) return "";
    try {
        const m = new DynamicModel({ u: "", n: 0 });
        $app.db().newQuery("SELECT COALESCE(MAX(updated), '') AS u, COUNT(*) AS n FROM " + KASSEN + " WHERE familie = {:f}").bind({ f: String(familyId) }).one(m);
        return String(m.n || 0) + ":" + String(m.u || "");
    } catch (e) { return ""; }
}

// ---------------------------------------------------------------------------------------------
// For the app
// ---------------------------------------------------------------------------------------------
function toClient(k, user, data) {
    const out = {
        id: k.id,
        name: k.name,
        icon: k.symbol || SYMBOL_STANDARD[k.art] || "💶",
        color: k.farbe || FARBEN_STANDARD[k.art] || "#2F4B41",
        art: k.art,
        members: k.mitglieder,
        all: !!k.alle,
        owner: k.besitzer,
        split: !!k.aufteilen,
        updated: k.updated,
        canManage: canManage(k, user),
        backupDay: k.sicherungTag || "",
        guests: Array.isArray(k.gaeste) ? k.gaeste : [],
    };
    if (data !== undefined) out.data = data;
    return out;
}

// stand: { <fund ID>: '<updated that the app already has>' } - only changed finance data is sent
function list(user, stand) {
    if (!isFinanceUser(user)) return [];
    const fam = userFamily(user);
    try { ensureFamily(fam); } catch (e) { console.log("[Kassen] Umzug: " + e.message); }
    try { ensureFamilyGroup(fam); } catch (e) { console.log("[Kassen] Familien-Gruppe: " + e.message); }
    const known = (stand && typeof stand === "object" && !Array.isArray(stand)) ? stand : {};
    const out = [];
    metaList(fam).filter(k => isMember(k, user)).forEach(k => {
        try {
            if (known[k.id] && known[k.id] === k.updated) { out.push(toClient(k, user)); return; }
            let rec = null;
            try { rec = $app.findRecordById(KASSEN, k.id); } catch (e) { rec = null; }
            const m = rec ? metaOfRecord(rec) : k;
            let d = {};
            if (rec) { d = parseJson(rec.get("daten"), {}); if (!d || typeof d !== "object" || Array.isArray(d)) d = {}; }
            out.push(toClient(m, user, d));
        } catch (e) {
            console.log("[Kassen] Kasse " + k.id + " nicht lesbar: " + e.message);
        }
    });
    return out;
}

// Save the finance data of a fund - only if the state has not changed since the last load
// (expectedUpdated). Otherwise the current state comes back (409), the app merges.
function saveData(user, body) {
    const id = String(body.id || "");
    let hinweisVorher = null, hinweisMeta = null;
    if (!isId(id)) return { status: 400, body: { error: "Ungültige Kasse." } };
    if (!body.daten || typeof body.daten !== "object" || Array.isArray(body.daten)) return { status: 400, body: { error: "Keine Daten." } };
    let result = null;
    try {
        $app.runInTransaction((tx) => {
            let rec = null;
            try { rec = tx.findRecordById(KASSEN, id); } catch (e) { rec = null; }
            if (!rec) { result = { status: 404, body: { error: "Diese Kasse gibt es nicht mehr.", gone: true } }; return; }
            const k = metaOfRecord(rec);
            if (!isMember(k, user)) { result = { status: 403, body: { error: "Kein Zugriff auf diese Kasse.", gone: true } }; return; }
            const cur = rec.getString("updated");
            if (body.expectedUpdated && cur !== body.expectedUpdated) {
                result = { status: 409, body: { conflict: true, updated: cur, data: parseJson(rec.get("daten"), {}) || {} } };
                return;
            }
            // Daily backup: the state before the first change of the day is kept
            try {
                const today = new Date().toISOString().slice(0, 10);
                if (hasField(rec.collection(), "sicherung") && rec.getString("sicherung_tag") !== today) {
                    const before = parseJson(rec.get("daten"), {}) || {};
                    if (hasContent(before)) { rec.set("sicherung", before); rec.set("sicherung_tag", today); }
                }
            } catch (e) { /* the backup is just an extra */ }
            // For the bell: remember only contract and vehicle IDs of the old state (small)
            try {
                const prev = parseJson(rec.get("daten"), {}) || {};
                hinweisVorher = {
                    contracts: Array.isArray(prev.contracts) ? prev.contracts.map(c => ({ id: c && c.id })) : null,
                    vehicles: Array.isArray(prev.vehicles) ? prev.vehicles.map(v => ({ id: v && v.id })) : null,
                };
                hinweisMeta = k;
            } catch (e) { hinweisVorher = null; }
            rec.set("daten", body.daten);
            tx.save(rec);
            result = { status: 200, body: { success: true, updated: rec.getString("updated") } };
        });
    } catch (err) {
        return { status: 500, body: { error: err.message } };
    }
    // New contracts and vehicles: notice for the other members of the fund (🔔 bell)
    if (result && result.status === 200 && hinweisVorher && hinweisMeta) {
        try { require(`${__hooks}/pinn-hinweise.js`).kasseDataSaved(hinweisMeta, hinweisVorher, body.daten, user); }
        catch (e) { console.log("[Hinweise] Kasse: " + e.message); }
    }
    return result;
}

// Create a fund or change name/icon/colour/members/splitting
// body: { id?, name, icon, color, members: [profile IDs], all (household only), split, guests?: [{ id, name, color, removed? }] }
function saveSettings(user, body) {
    if (!isFinanceUser(user)) throw new Error("Kein Zugriff auf die Finanzen.");
    ensureSchema();
    const fam = userFamily(user);
    const users = familyUsers(fam);
    const validIds = users.map(u => u.id);
    const wanted = Array.isArray(body.members) ? body.members.map(String).filter((x, i, a) => validIds.indexOf(x) >= 0 && a.indexOf(x) === i) : [];
    const id = String(body.id || "");
    let rec = null;
    let k = null;
    let before = [];
    if (id) {
        try { rec = $app.findRecordById(KASSEN, id); } catch (e) { rec = null; }
        if (!rec || rec.getString("familie") !== fam) throw new Error("Diese Kasse gibt es nicht mehr.");
        k = metaOfRecord(rec);
        if (k.art === "familie") throw new Error("Die Familien-Gruppe gehört automatisch allen – sie lässt sich nicht einstellen.");
        if (!canManage(k, user)) throw new Error(k.art === "haushalt" ? "Die Haushaltskasse können nur Admins einstellen." : "Nur wer die Kasse angelegt hat, kann sie einstellen.");
        before = memberUserIds(k);
    } else {
        // new fund - 30 per family at most
        if (metaList(fam).filter(x => x.art !== "familie").length >= 30) throw new Error("Es gibt schon 30 Kassen.");
        rec = new Record($app.findCollectionByNameOrId(KASSEN));
        rec.set("familie", fam);
        rec.set("art", "gemeinsam");
        rec.set("besitzer", user.id);
        rec.set("daten", {});
        k = { art: "gemeinsam", besitzer: user.id, familie: fam, mitglieder: [], alle: false, gaeste: [] };
    }
    const art = k.art;
    const name = cleanText(body.name, 60) || (art === "haushalt" ? "Haushaltskasse" : art === "privat" ? "Privat" : "Kasse");
    rec.set("name", name);
    rec.set("symbol", cleanSymbol(body.icon, SYMBOL_STANDARD[art]));
    rec.set("farbe", cleanColor(body.color, FARBEN_STANDARD[art]));
    rec.set("aufteilen", !!body.split);
    if (art === "haushalt") {
        const all = !!body.all;
        if (!all) {
            if (!wanted.length) throw new Error("Bitte mindestens eine Person auswählen.");
            const admins = users.filter(u => userRole(u) === "admin").map(u => u.id);
            if (!wanted.some(x => admins.indexOf(x) >= 0)) throw new Error("Mindestens ein Admin muss zur Haushaltskasse gehören.");
        }
        rec.set("alle", all);
        rec.set("mitglieder", all ? [] : wanted);
    } else {
        // the owner always belongs to it
        const owner = rec.getString("besitzer") || user.id;
        const list = [owner].concat(wanted.filter(x => x !== owner));
        rec.set("alle", false);
        rec.set("mitglieder", list.slice(0, 30));
    }
    // Guests without a profile (older app versions send none - then everything stays as it is)
    if (Array.isArray(body.guests) && hasField(rec.collection(), "gaeste")) {
        const incoming = parseGuests(body.guests);
        if (incoming.filter(g => !g.removed).length > GAESTE_MAX) throw new Error("Höchstens " + GAESTE_MAX + " Gäste je Kasse.");
        // Guests missing from the list are kept as removed (names in old bookings)
        (Array.isArray(k.gaeste) ? k.gaeste : []).forEach(g => {
            if (!incoming.some(x => x.id === g.id)) incoming.push(Object.assign({}, g, { removed: true }));
        });
        // Space is tight: leave out the oldest removed guests first
        let list = incoming;
        while (list.length > GAESTE_GESAMT) {
            const i = list.findIndex(g => g.removed);
            if (i < 0) break;
            list = list.slice(0, i).concat(list.slice(i + 1));
        }
        rec.set("gaeste", list.slice(0, GAESTE_GESAMT));
    }
    $app.save(rec);
    const meta = metaOfRecord(rec);
    // Notify newly added people by push
    try {
        const after = memberUserIds(meta);
        const added = after.filter(x => before.indexOf(x) < 0 && x !== user.id);
        if (added.length && !(art === "haushalt" && meta.alle)) {
            const push = require(`${__hooks}/pinn-push.js`);
            const who = cleanText(user.getString("name") || user.getString("username"), 60) || "Jemand";
            added.forEach(uid => {
                try {
                    push.notifyUser(uid, {
                        titel: (meta.symbol || "💶") + " " + meta.name,
                        text: who + " hat dich zur Kasse „" + meta.name + "“ hinzugefügt." + (meta.aufteilen ? " Ausgaben werden geteilt." : ""),
                        url: "/?kasse=" + encodeURIComponent(meta.id),
                        tag: "kasse-" + meta.id,
                        urgency: "normal",
                    });
                } catch (e) { /* push is just an extra */ }
            });
        }
    } catch (e) { /* ignore */ }
    return toClient(meta, user, id ? undefined : {});
}

// Delete a fund (including its bookings and receipts) - only whoever may manage it. Documents (menu
// "Documents") of the fund are not deleted, but afterwards are only visible to the person
// who deleted the fund (so that nothing private suddenly becomes visible to everyone).
function remove(user, id) {
    let rec = null;
    try { rec = $app.findRecordById(KASSEN, String(id || "")); } catch (e) { return; }
    const k = metaOfRecord(rec);
    if (k.familie !== userFamily(user)) throw new Error("Diese Kasse gibt es nicht mehr.");
    if (k.art === "familie") throw new Error("Die Familien-Gruppe lässt sich nicht löschen.");
    if (!canManage(k, user)) throw new Error(k.art === "haushalt" ? "Die Haushaltskasse können nur Admins löschen." : "Nur wer die Kasse angelegt hat, kann sie löschen.");
    $app.runInTransaction((tx) => {
        try {
            tx.findRecordsByFilter("ausgaben", "kasse = {:k}", "", 0, 0, { k: k.id }).forEach(r => tx.delete(r));
        } catch (e) { /* none */ }
        try {
            tx.findRecordsByFilter("finanz_dokumente", "kasse = {:k}", "", 0, 0, { k: k.id }).forEach(r => tx.delete(r));
        } catch (e) { /* none */ }
        try {
            const docs = findCol("dokumente");
            if (docs && hasField(docs, "kasse")) {
                tx.findRecordsByFilter("dokumente", "kasse = {:k}", "", 0, 0, { k: k.id }).forEach(r => {
                    r.set("kasse", "");
                    if (hasField(docs, "sichtbar")) r.set("sichtbar", user.id);
                    tx.save(r);
                });
            }
        } catch (e) { /* none */ }
        tx.delete(tx.findRecordById(KASSEN, k.id));
    });
}

// Leave a fund (a shared one or someone else's own fund shared with you)
function leave(user, id) {
    let rec = null;
    try { rec = $app.findRecordById(KASSEN, String(id || "")); } catch (e) { return; }
    const k = metaOfRecord(rec);
    if (k.familie !== userFamily(user)) return;
    if (k.art === "familie") throw new Error("Die Familien-Gruppe gehört automatisch allen.");
    if (k.art === "haushalt") throw new Error("Die Haushaltskasse kann man nicht verlassen – das stellen die Admins ein.");
    if (k.besitzer === user.id) throw new Error(k.art === "privat" ? "Deine eigene Kasse kannst du nicht verlassen." : "Als Besitzer kannst du die Kasse nur löschen.");
    rec.set("mitglieder", k.mitglieder.filter(x => x !== user.id));
    $app.save(rec);
}

// ---------------------------------------------------------------------------------------------
// Helpers for the routes in kassen.pb.js
// (PocketBase runs every route handler in isolation - functions that sit at file level
// in kassen.pb.js are NOT visible in the handler. That is why they live here and are fetched
// via require().)
// ---------------------------------------------------------------------------------------------
// Response as JSON text (own conversion instead of e.json)
function httpSend(e, status, obj) {
    let text = "";
    try { text = JSON.stringify(obj); }
    catch (err) {
        console.log("[Kassen] Antwort nicht umwandelbar: " + err.message);
        status = 500;
        text = JSON.stringify({ error: "Antwort nicht umwandelbar: " + err.message });
    }
    try { e.response.header().set("Cache-Control", "no-store"); } catch (err) { /* ignore */ }
    return e.string(status, text);
}
function httpGuard(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return "Gastkonten haben keinen Zugriff auf die Finanzen.";
    if (!lib.familyOf(e)) return "Dein Profil gehört zu keiner Familie.";
    return "";
}
function httpBody(e) {
    try { const b = e.requestInfo().body; return (b && typeof b === "object") ? b : {}; } catch (err) { return {}; }
}
function httpFail(e, where, ex, status) {
    const msg = (ex && ex.message) ? ex.message : String(ex || "Unbekannter Fehler");
    console.log("[Kassen] " + where + ": " + msg);
    return httpSend(e, status || 200, { error: msg });
}

module.exports = {
    httpSend, httpGuard, httpBody, httpFail,
    KASSEN, ensureSchema, migrateAll, ensureFamily, ensureFamilyGroup, ensurePrivate, familyMigrated, cleanupEmpty,
    metaList, isMember, canManage, access, defaultKasse, memberUserIds, contractsOfFamily, plantsOfFamily, dataStamp, familyUsers, meaningful,
    list, saveData, saveSettings, remove, leave,
    rescueFinance, repairFamily, restoreBackup, hasContent, parseDaten: parseJson,
};
