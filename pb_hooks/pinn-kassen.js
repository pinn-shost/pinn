// pb_hooks/pinn-kassen.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Kassen: getrennte Finanzbereiche innerhalb einer Familie (bzw. WG)
// ---------------------------------------------------------------------------------------------
// Jede Kasse hat eigene Finanzdaten (Budget, Kategorien, regelmäßige Buchungen, Depots, Taschengeld,
// Verträge, Fahrzeuge …) und eigene Buchungen (Sammlung "ausgaben", Feld "kasse"). Wer kein Mitglied
// einer Kasse ist, bekommt von ihr NICHTS - weder die Daten noch die Buchungen noch die Belege.
//
//   art "gemeinsam" - jede neu angelegte Kasse (z. B. Haushalts-, WG-, Urlaubs-, Paar- oder eigene
//                     Kasse). Mitglieder wählt, wer sie angelegt hat (Besitzer); nur für sich selbst =
//                     nur der Besitzer als Mitglied. Mitglieder können sie verlassen.
//   art "familie"   - die Familien-Gruppe (genau eine je Familie, legt sich von selbst an, gehört
//                     automatisch allen Profilen außer Gästen). Hier landen Verträge, die keiner Kasse
//                     zugeordnet sind. In Ausgaben und Sparen erscheint sie nicht als Kasse.
//   art "haushalt"  - (älterer Stand) die frühere Haushaltskasse mit den Finanzdaten von vor den
//                     Kassen. Gibt es nur noch, wenn sie tatsächlich Daten enthält.
//   art "privat"    - (älterer Stand) die frühere automatisch angelegte eigene Kasse. Wird nicht mehr
//                     angelegt; leere werden beim Start entfernt.
//
// Neue Familien haben keine Kasse: Finanzen → Ausgaben/Sparen zeigt dann nur den Hinweis, zuerst eine
// Kasse anzulegen.
//
// "aufteilen" = Ausgaben werden zwischen den Mitgliedern aufgeteilt (wer hat bezahlt, wer schuldet
// wem) - die Rechnung macht die App aus den Buchungen (Felder "bezahlt_von" und "aufteilung").
//
// Felder der Sammlung "kassen":
//   familie (Relation), name, symbol (Emoji), farbe, art, mitglieder (JSON: Profil-IDs), alle (bool),
//   besitzer (Profil-ID), aufteilen (bool), daten (JSON: Finanzdaten der Kasse, wie früher "finance"
//   im Familien-Datensatz), gaeste (JSON: Gäste ohne Profil - [{ id: 'gast-…', name, color, removed? }]),
//   created, updated
//
// Gäste: Personen ohne Profil in der Familie (z. B. Freunde im Urlaub). Sie sehen die Kasse nicht, zählen
// aber beim Aufteilen wie Mitglieder - ihre ID steht in "bezahlt_von" bzw. "aufteilung" der Buchungen.
// Entfernte Gäste bleiben mit removed: true erhalten, damit alte Buchungen ihren Namen behalten.
// Zugriff nur über die Routen in kassen.pb.js (Sammlungs-API gesperrt).
//
// Umzug: Beim ersten Start nach dem Update bekommt jede Familie ihre Haushaltskasse. Die bisherigen
// Finanzdaten (familien_daten → "finance") wandern hinein, alle bisherigen Buchungen und Belege werden
// ihr zugeordnet, und "finance" wird aus dem Familien-Datensatz entfernt. Mitglieder: alle Profile -
// damit sieht nach dem Update jeder genau das, was er vorher gesehen hat.
//
// Schonend für CPU und Speicher: Für Berechtigungen wird nur die kleine Mitgliederliste gelesen (nie die
// Finanzdaten). Die App schickt mit, welchen Stand sie schon hat - Finanzdaten gehen nur über die
// Leitung, wenn sie sich geändert haben.

const KASSEN = "kassen";
const ARTEN = ["haushalt", "privat", "gemeinsam", "familie"];
const DATA_MAX = 8 * 1024 * 1024;
const FARBEN_STANDARD = { haushalt: "#2F4B41", privat: "#7A5C8E", gemeinsam: "#B9842E", familie: "#5B7B6F" };
const SYMBOL_STANDARD = { haushalt: "🏠", privat: "👤", gemeinsam: "👥", familie: "👨‍👩‍👧" };
const FAMILIE_NAME = "Familie";
// Finanzdaten mit echtem Inhalt (nur Kategorien o. Ä. zählen nicht)
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
    { name: "sicherung", type: "json", maxSize: DATA_MAX },   // Stand vor der ersten Änderung des Tages
    { name: "sicherung_tag", type: "text", max: 10 },
    { name: "altbestand", type: "json", maxSize: DATA_MAX },  // alle geretteten Finanzdaten von vor dem Umzug (wird nie gelöscht)
    { name: "altbestand_stufe", type: "number" },             // Version der Zusammenführung, mit der der Altbestand eingespielt wurde
    { name: "gaeste", type: "json", maxSize: 20000 },         // Gäste ohne Profil (nur fürs Aufteilen)
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
// Hilfen
// ---------------------------------------------------------------------------------------------
function parseJson(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
        const v = require(`${__hooks}/calendar-sync.js`).parseRecordData(raw);
        if (v !== null && v !== undefined) return v;
    } catch (e) { /* weiter unten */ }
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

// Gäste ohne Profil: [{ id: 'gast-…', name, color, removed? }]
const GAST_ID = /^gast-[a-z0-9]{6,20}$/;
const GAESTE_MAX = 30;      // aktive Gäste je Kasse
const GAESTE_GESAMT = 60;   // inkl. entfernter (für die Namen alter Buchungen)
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

// Alle Profile der Familie, die Finanzen haben können (keine Gäste)
function familyUsers(familyId) {
    let list = [];
    try { list = $app.findRecordsByFilter("benutzer", "familie = {:f}", "username", 0, 0, { f: String(familyId) }); } catch (e) { list = []; }
    return list.filter(u => userRole(u) !== "gast" && userRole(u) !== "hauptadmin");
}

// Kleine Übersicht aller Kassen einer Familie - OHNE die (großen) Finanzdaten
function metaList(familyId, app) {
    if (!familyId || !findCol(KASSEN)) return [];
    const a = app || $app;
    const rows = arrayOf(new DynamicModel({
        id: "", name: "", symbol: "", farbe: "", art: "", mitglieder: "", alle: false, besitzer: "", aufteilen: false, updated: "", created: "", sicherung_tag: "", gaeste: "",
    }));
    try {
        a.db().newQuery("SELECT id, name, symbol, farbe, art, COALESCE(mitglieder, '[]') AS mitglieder, alle, besitzer, aufteilen, updated, created, COALESCE(sicherung_tag, '') AS sicherung_tag, COALESCE(gaeste, '[]') AS gaeste FROM " + KASSEN + " WHERE familie = {:f} ORDER BY created, id").bind({ f: String(familyId) }).all(rows);
    } catch (e) {
        // Rückfallweg (z. B. Feld fehlt noch): normale Datensätze lesen - langsamer, aber sicher
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

// Liegen die Finanzdaten der Familie schon in den Kassen? (Haushaltskasse oder Familien-Gruppe vorhanden)
function familyMigrated(familyId) {
    if (!familyId || !findCol(KASSEN)) return false;
    try {
        const m = new DynamicModel({ n: 0 });
        $app.db().newQuery("SELECT COUNT(*) AS n FROM " + KASSEN + " WHERE familie = {:f} AND (art = 'haushalt' OR art = 'familie')").bind({ f: String(familyId) }).one(m);
        return Number(m.n) > 0;
    } catch (e) { return false; }
}

// ---------------------------------------------------------------------------------------------
// Haushaltskasse - nur noch für den Umzug alter Finanzdaten (vor den Kassen). Ohne alte Daten wird
// keine Kasse angelegt: Neue Familien legen ihre Kassen selbst an.
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
            // im Vorgang nochmal prüfen - zwei gleichzeitige Anfragen legen sonst zwei Kassen an
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
            // bisherige Buchungen und Belege gehören ab jetzt zur Haushaltskasse
            try {
                const aus = tx.findCollectionByNameOrId("ausgaben");
                if (hasField(aus, "kasse")) {
                    tx.db().newQuery("UPDATE ausgaben SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: rec.id, f: String(familyId) }).execute();
                }
            } catch (e) { /* Sammlung fehlt noch - neue Buchungen bekommen die Kasse beim Speichern */ }
            try {
                const docs = tx.findCollectionByNameOrId("finanz_dokumente");
                if (hasField(docs, "kasse")) {
                    tx.db().newQuery("UPDATE finanz_dokumente SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: rec.id, f: String(familyId) }).execute();
                }
            } catch (e) { /* egal */ }
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

// Familien-Gruppe: gehört automatisch allen Profilen der Familie (außer Gästen). Ablage für Verträge
// ohne eigene Kasse. Wird bei Bedarf angelegt (genau eine je Familie).
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

// Beim Start: leere, früher automatisch angelegte Kassen (Haushaltskasse ohne Daten, eigene Kassen)
// entfernen - damit Finanzen wieder mit dem Hinweis „zuerst eine Kasse anlegen“ beginnt. Entfernt wird
// nur, wo weder Finanzdaten noch Buchungen, Belege oder Dokumente dranhängen.
function countRefs(coll, kasseId) {
    try {
        const c = findCol(coll);
        if (!c || !hasField(c, "kasse")) return 0;
        const m = new DynamicModel({ n: 0 });
        $app.db().newQuery("SELECT COUNT(*) AS n FROM " + coll + " WHERE kasse = {:k}").bind({ k: String(kasseId) }).one(m);
        return Number(m.n) || 0;
    } catch (e) { return 1; } // im Zweifel behalten
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

// Nach dem Update: Buchungen/Belege ohne Kasse (z. B. von einem noch nicht aktualisierten Gerät) der
// Haushaltskasse zuordnen. Läuft nur beim Start.
function assignOrphans(familyId, haushaltId) {
    try {
        const aus = findCol("ausgaben");
        if (aus && hasField(aus, "kasse")) $app.db().newQuery("UPDATE ausgaben SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: haushaltId, f: String(familyId) }).execute();
    } catch (e) { /* egal */ }
    try {
        const docs = findCol("finanz_dokumente");
        if (docs && hasField(docs, "kasse")) $app.db().newQuery("UPDATE finanz_dokumente SET kasse = {:k} WHERE familie = {:f} AND (kasse = '' OR kasse IS NULL)").bind({ k: haushaltId, f: String(familyId) }).execute();
    } catch (e) { /* egal */ }
}

// ---------------------------------------------------------------------------------------------
// Rettung: Fehlende Einträge aus einem älteren Stand ergänzen - es wird NIE etwas gelöscht.
// Listen mit IDs: fehlende Einträge kommen dazu, vorhandene werden um fehlende Angaben ergänzt.
// Einzelwerte: nur, wo der aktuelle Stand leer ist (fehlt, '', 0, false).
// ---------------------------------------------------------------------------------------------
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function isEmptyVal(v) { return v === undefined || v === null || v === "" || v === 0 || v === false; }
const MERGE_STUFE = 2;
function idOf(x) { return (isObj(x) && x.id !== undefined && x.id !== null && x.id !== "") ? String(x.id) : ""; }
function unionMerge(target, source, stats) {
    if (Array.isArray(target) && Array.isArray(source)) {
        // Listen von Objekten: über die ID (als Text) abgleichen - Einträge ohne ID über ihren Inhalt
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
        // einfache Listen (Texte, Zahlen): fehlende Werte ergänzen
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
// Fehlende Finanzdaten in die Haushaltskasse übernehmen. opts.force: auch nach der Frist
// -> Anzahl ergänzter Einträge (-1 = Frist vorbei, keine Haushaltskasse)
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
            // Altbestand: jede Quelle wird zusätzlich aufbewahrt (für spätere, bessere Zusammenführung)
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
// Beim Start: doppelte Haushalts-/eigene Kassen zusammenlegen, Reste von "finance" aus dem
// Familien-Datensatz übernehmen
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
                        try { tx.db().newQuery("UPDATE " + coll + " SET kasse = {:k} WHERE kasse = {:o}").bind({ k: keep.id, o: other.id }).execute(); } catch (e) { /* egal */ }
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
    // Altbestand mit der aktuellen Zusammenführung erneut einspielen (einmal je Stufe)
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
    // "finance" noch im Familien-Datensatz (z. B. Umzug abgebrochen)? -> ergänzen und entfernen
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
    } catch (e) { /* keine Familiendaten */ }
}

// Sicherung (Stand vor der ersten Änderung des Tages) zurückholen - ergänzt nur, löscht nichts
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

// (älterer Stand) eigene Kasse - wird nicht mehr automatisch angelegt
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
// Für die anderen Server-Teile (Buchungen, Belege, Verträge)
// ---------------------------------------------------------------------------------------------
// Kassen, auf die das Profil Zugriff hat -> { ids: [...], haushalt: '<ID>'|'' (nur wenn Mitglied), privat: '<ID>'|'' }
// familie: '<ID der Familien-Gruppe>', real: [IDs der eigentlichen Kassen ohne Familien-Gruppe]
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
// Standard-Kasse für Buchungen ohne Angabe: Haushaltskasse, eigene Kasse, erste Kasse, Familien-Gruppe
function defaultKasse(acc) {
    return acc.haushalt || acc.privat || acc.real[0] || acc.familie || acc.ids[0] || "";
}
// Profil-IDs, die eine Kasse sehen dürfen (für Push-Nachrichten)
function memberUserIds(k) {
    if (!k) return [];
    if (k.art === "familie" || (k.art === "haushalt" && k.alle)) return familyUsers(k.familie).map(u => u.id);
    return k.mitglieder.slice();
}
// Verträge aller Kassen einer Familie: [{ kasse: meta, contracts: [...], userIds: [...] }]
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

// ---------------------------------------------------------------------------------------------
// Für die App
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

// stand: { <Kassen-ID>: '<updated, den die App schon hat>' } - nur geänderte Finanzdaten werden geschickt
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

// Finanzdaten einer Kasse speichern - nur, wenn sich der Stand seit dem letzten Laden nicht geändert
// hat (expectedUpdated). Sonst kommt der aktuelle Stand zurück (409), die App führt zusammen.
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
            // Tages-Sicherung: der Stand vor der ersten Änderung des Tages bleibt erhalten
            try {
                const today = new Date().toISOString().slice(0, 10);
                if (hasField(rec.collection(), "sicherung") && rec.getString("sicherung_tag") !== today) {
                    const before = parseJson(rec.get("daten"), {}) || {};
                    if (hasContent(before)) { rec.set("sicherung", before); rec.set("sicherung_tag", today); }
                }
            } catch (e) { /* Sicherung ist nur ein Extra */ }
            // Für die Glocke: nur Vertrags- und Fahrzeug-IDs des alten Stands merken (klein)
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
    // Neue Verträge und Fahrzeuge: Hinweis für die übrigen Mitglieder der Kasse (🔔 Glocke)
    if (result && result.status === 200 && hinweisVorher && hinweisMeta) {
        try { require(`${__hooks}/pinn-hinweise.js`).kasseDataSaved(hinweisMeta, hinweisVorher, body.daten, user); }
        catch (e) { console.log("[Hinweise] Kasse: " + e.message); }
    }
    return result;
}

// Kasse anlegen oder Name/Symbol/Farbe/Mitglieder/Aufteilen ändern
// body: { id?, name, icon, color, members: [Profil-IDs], all (nur Haushalt), split, guests?: [{ id, name, color, removed? }] }
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
        // neue Kasse - höchstens 30 je Familie
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
        // Besitzer gehört immer dazu
        const owner = rec.getString("besitzer") || user.id;
        const list = [owner].concat(wanted.filter(x => x !== owner));
        rec.set("alle", false);
        rec.set("mitglieder", list.slice(0, 30));
    }
    // Gäste ohne Profil (ältere App-Stände schicken keine - dann bleibt alles, wie es ist)
    if (Array.isArray(body.guests) && hasField(rec.collection(), "gaeste")) {
        const incoming = parseGuests(body.guests);
        if (incoming.filter(g => !g.removed).length > GAESTE_MAX) throw new Error("Höchstens " + GAESTE_MAX + " Gäste je Kasse.");
        // Gäste, die in der Liste fehlen, bleiben als entfernt erhalten (Namen in alten Buchungen)
        (Array.isArray(k.gaeste) ? k.gaeste : []).forEach(g => {
            if (!incoming.some(x => x.id === g.id)) incoming.push(Object.assign({}, g, { removed: true }));
        });
        // Platz knapp: zuerst die ältesten entfernten Gäste weglassen
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
    // Neu hinzugekommene Personen per Push benachrichtigen
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
                } catch (e) { /* Push ist nur ein Extra */ }
            });
        }
    } catch (e) { /* egal */ }
    return toClient(meta, user, id ? undefined : {});
}

// Kasse löschen (samt ihrer Buchungen und Belege) - nur wer sie verwalten darf. Dokumente (Menü
// „Dokumente“) der Kasse werden nicht gelöscht, sondern sind danach nur noch für die Person sichtbar,
// die die Kasse gelöscht hat (damit nichts Privates plötzlich für alle sichtbar wird).
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
        } catch (e) { /* keine */ }
        try {
            tx.findRecordsByFilter("finanz_dokumente", "kasse = {:k}", "", 0, 0, { k: k.id }).forEach(r => tx.delete(r));
        } catch (e) { /* keine */ }
        try {
            const docs = findCol("dokumente");
            if (docs && hasField(docs, "kasse")) {
                tx.findRecordsByFilter("dokumente", "kasse = {:k}", "", 0, 0, { k: k.id }).forEach(r => {
                    r.set("kasse", "");
                    if (hasField(docs, "sichtbar")) r.set("sichtbar", user.id);
                    tx.save(r);
                });
            }
        } catch (e) { /* keine */ }
        tx.delete(tx.findRecordById(KASSEN, k.id));
    });
}

// Eine Kasse verlassen (gemeinsame oder eine mit dir geteilte eigene Kasse eines anderen)
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
// Hilfen für die Routen in kassen.pb.js
// (PocketBase führt jeden Routen-Handler isoliert aus - Funktionen, die in kassen.pb.js auf
// Dateiebene stehen, sind im Handler NICHT sichtbar. Deshalb liegen sie hier und werden per
// require() geholt.)
// ---------------------------------------------------------------------------------------------
// Antwort als JSON-Text (eigene Umwandlung statt e.json)
function httpSend(e, status, obj) {
    let text = "";
    try { text = JSON.stringify(obj); }
    catch (err) {
        console.log("[Kassen] Antwort nicht umwandelbar: " + err.message);
        status = 500;
        text = JSON.stringify({ error: "Antwort nicht umwandelbar: " + err.message });
    }
    try { e.response.header().set("Cache-Control", "no-store"); } catch (err) { /* egal */ }
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
    metaList, isMember, canManage, access, defaultKasse, memberUserIds, contractsOfFamily, familyUsers, meaningful,
    list, saveData, saveSettings, remove, leave,
    rescueFinance, repairFamily, restoreBackup, hasContent, parseDaten: parseJson,
};
