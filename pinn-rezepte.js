// pb_hooks/pinn-rezepte.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Öffentliche Rezepte: Rezepte, bei denen in der Rezept-Bearbeitung der Haken "Rezept öffentlich
// teilen" gesetzt ist (Feld "oeffentlich" im Rezept), werden in die eigene Sammlung
// "oeffentliche_rezepte" gespiegelt. Dort können ALLE Familien des Servers sie lesen und in ihre
// eigenen Rezepte übernehmen (Kopie - das Original bleibt bei der teilenden Familie).
//
// Sammlung "oeffentliche_rezepte" (wird automatisch angelegt):
//   familie      Relation auf "familien" (OHNE Mitlöschen - siehe "Rezepte Familie" unten)
//   rezept_id    ID des Rezepts in den Familiendaten der teilenden Familie
//   herkunft     Name der teilenden Familie (bleibt erhalten, auch wenn die Familie gelöscht wird)
//   bild_id      ID des Bild-Datensatzes in "rezept_bilder" (damit das Bild erhalten bleibt)
//   titel        Titel (für Sortierung/Übersicht im PocketBase-Dashboard)
//   data         Rezept-Inhalt: title, ingredients, steps, servings, prepTime, cookTime,
//                categories (Namen), tools (Namen statt familieneigener IDs), image (Pfad),
//                imageFrame (gewählter Bildausschnitt { x, y, z }, nur wenn gesetzt), createdAt
//   fingerprint  Prüfsumme des Inhalts - gespeichert wird nur, wenn sich wirklich etwas geändert hat
//   created / updated
// Zugriff nur über die angemeldete Route in rezepte.pb.js (Sammlungs-API gesperrt), geschrieben
// wird ausschließlich vom Server beim Speichern der Familiendaten (save_family_data.pb.js).
//
// Schonend für CPU: Abgeglichen wird nur beim Speichern, mit den ohnehin schon empfangenen Daten -
// die großen Familiendaten werden dafür nie aus der Datenbank gelesen oder dekodiert.
//
// "Rezepte Familie": Wird eine Familie gelöscht, bleiben ihre öffentlichen Rezepte erhalten. Sie
// verlieren nur die Zuordnung zur Familie (familie = leer) und erscheinen danach für alle unter
// "Rezepte Familie". Das ist bewusst KEINE echte Familie in "familien" - so taucht sie weder in der
// Anmeldung noch in der Familienverwaltung auf, bekommt nie den Apple-Kalender und kann nicht
// versehentlich samt Rezepten gelöscht werden. Die zugehörigen Bilder werden ebenfalls von der
// Familie gelöst, damit sie beim Löschen nicht mitgelöscht werden.

const OEFFENTLICH = "oeffentliche_rezepte";
const FAMILIEN = "familien";
const REZEPTE_FAMILIE = "Rezepte Familie";

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}

// Rezeptbilder: zusätzlich zur quadratischen, mittig beschnittenen Miniatur (400x400) eine
// unbeschnittene (600x600f) erlauben. Die braucht die App für Rezepte mit verschobenem
// Bildausschnitt, sonst würde die Miniatur den gewählten Ausschnitt verfälschen. Erzeugt wird sie
// von PocketBase erst beim ersten Abruf (einmalig je Bild) - schonend für die CPU.
const REZEPT_BILDER = "rezept_bilder";
const REZEPT_BILD_THUMBS = ["400x400", "600x600f"];
let thumbsChecked = false;
function ensureImageThumbsOnce() {
    if (thumbsChecked) return;
    if (!findCol(REZEPT_BILDER)) return; // Sammlung noch nicht da - beim nächsten Aufruf erneut
    thumbsChecked = true;
    ensureImageThumbs();
}
function ensureImageThumbs() {
    const col = findCol(REZEPT_BILDER);
    if (!col) return;
    try {
        const f = col.fields.getByName("bild");
        if (!f) return;
        const have = [];
        try {
            const t = f.thumbs || [];
            for (let i = 0; i < t.length; i++) have.push(String(t[i]));
        } catch (e) { /* leer */ }
        const missing = REZEPT_BILD_THUMBS.filter(t => have.indexOf(t) < 0);
        if (!missing.length) return;
        f.thumbs = have.concat(missing);
        $app.save(col);
        console.log("[Rezepte] Miniaturen für \"" + REZEPT_BILDER + "\" ergänzt: " + missing.join(", "));
    } catch (err) {
        console.log("[Rezepte] Miniaturen für \"" + REZEPT_BILDER + "\" nicht ergänzbar: " + err.message);
    }
}

// Legt die Sammlung an bzw. ergänzt fehlende Felder. Gibt die Sammlung zurück (oder null, solange
// es die Familien-Sammlung noch nicht gibt - dann wird es beim nächsten Aufruf erneut versucht).
function ensureSchema() {
    ensureImageThumbsOnce();
    const famCol = findCol(FAMILIEN);
    if (!famCol) return null;
    let col = findCol(OEFFENTLICH);
    if (!col) {
        const build = (withIndex) => ({
            type: "base",
            name: OEFFENTLICH,
            fields: [
                { name: "familie", type: "relation", collectionId: famCol.id, cascadeDelete: false, maxSelect: 1, minSelect: 0, required: false },
                { name: "rezept_id", type: "text", max: 100 },
                { name: "herkunft", type: "text", max: 60 },
                { name: "bild_id", type: "text", max: 100 },
                { name: "titel", type: "text", max: 300, presentable: true },
                { name: "data", type: "json", maxSize: 2 * 1024 * 1024 },
                { name: "fingerprint", type: "text", max: 40 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: withIndex
                ? ["CREATE UNIQUE INDEX `idx_pinn_oeffentliche_rezepte` ON `" + OEFFENTLICH + "` (`familie`, `rezept_id`)"]
                : [],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        });
        try {
            $app.save(new Collection(build(true)));
            console.log("[Rezepte] Sammlung \"" + OEFFENTLICH + "\" angelegt.");
        } catch (e1) {
            try {
                $app.save(new Collection(build(false)));
                console.log("[Rezepte] Sammlung \"" + OEFFENTLICH + "\" ohne Index angelegt (" + e1.message + ").");
            } catch (e2) {
                console.log("[Rezepte] Sammlung \"" + OEFFENTLICH + "\" nicht anlegbar: " + e2.message);
                return null;
            }
        }
        col = findCol(OEFFENTLICH);
    }
    if (!col) return null;
    // Fehlende Felder ergänzen (z. B. wenn die Sammlung von Hand angelegt wurde)
    const wanted = [
        { name: "familie", type: "relation", collectionId: famCol.id, cascadeDelete: false, maxSelect: 1, minSelect: 0, required: false },
        { name: "rezept_id", type: "text", max: 100 },
        { name: "herkunft", type: "text", max: 60 },
        { name: "bild_id", type: "text", max: 100 },
        { name: "titel", type: "text", max: 300 },
        { name: "data", type: "json", maxSize: 2 * 1024 * 1024 },
        { name: "fingerprint", type: "text", max: 40 },
    ];
    const missing = wanted.filter(d => !hasField(col, d.name));
    if (missing.length) {
        try {
            missing.forEach(d => {
                const tmp = new Collection({ type: "base", name: "pinn_tmp_" + d.name, fields: [d] });
                col.fields.add(tmp.fields.getByName(d.name));
            });
            $app.save(col);
            col = findCol(OEFFENTLICH);
            console.log("[Rezepte] Felder in \"" + OEFFENTLICH + "\" ergänzt: " + missing.map(d => d.name).join(", "));
        } catch (err) {
            console.log("[Rezepte] Felder in \"" + OEFFENTLICH + "\" nicht ergänzbar: " + err.message);
        }
    }
    // Bestehende Sammlung (ältere Version): Rezepte beim Löschen einer Familie NICHT mehr mitlöschen
    try {
        const famField = col.fields.getByName("familie");
        if (famField && famField.cascadeDelete) {
            famField.cascadeDelete = false;
            famField.required = false;
            $app.save(col);
            col = findCol(OEFFENTLICH);
            console.log("[Rezepte] Öffentliche Rezepte bleiben jetzt beim Löschen einer Familie erhalten.");
        }
    } catch (err) {
        console.log("[Rezepte] Mitlöschen nicht abschaltbar: " + err.message);
    }
    return col;
}

// ---------------------------------------------------------------------------------------------
// Aufbereitung
// ---------------------------------------------------------------------------------------------
function cleanText(v, max) {
    return String(v === undefined || v === null ? "" : v).trim().slice(0, max);
}
function cleanList(v, maxItems, maxLen) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (let i = 0; i < v.length && out.length < maxItems; i++) {
        const s = cleanText(v[i], maxLen);
        if (s) out.push(s);
    }
    return out;
}
function cleanNumber(v, max) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n), max);
}

// "/api/files/rezept_bilder/<id>/<datei>" -> "<id>" (nur Bilder aus der Sammlung rezept_bilder)
function imageRecordIdFromPath(path) {
    const parts = String(path || "").split("?")[0].split("/");
    // ["", "api", "files", "rezept_bilder", "<id>", "<datei>"]
    if (parts.length >= 6 && parts[1] === "api" && parts[2] === "files" && parts[3] === "rezept_bilder") {
        return cleanText(parts[4], 100);
    }
    return "";
}

// Bildausschnitt { x, y, z }: x/y 0-100 (Prozent), z 1-4 (Zoom). Mitte ohne Zoom = undefined,
// damit unveränderte Rezepte dieselbe Prüfsumme behalten wie bisher.
function cleanFrame(f) {
    if (!f || typeof f !== "object") return undefined;
    const num = (v, d, lo, hi) => { const n = Number(v); return Math.min(hi, Math.max(lo, isFinite(n) ? n : d)); };
    const x = Math.round(num(f.x, 50, 0, 100) * 10) / 10;
    const y = Math.round(num(f.y, 50, 0, 100) * 10) / 10;
    const z = Math.round(num(f.z, 1, 1, 4) * 100) / 100;
    if (x === 50 && y === 50 && z === 1) return undefined;
    return { x: x, y: y, z: z };
}

// Einfache, schnelle Prüfsumme (djb2) - reicht zum Erkennen von Änderungen
function fingerprint(obj) {
    const s = JSON.stringify(obj);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return s.length + "-" + h.toString(16);
}

// Alle als öffentlich markierten Rezepte der Familiendaten in das Austauschformat bringen.
// Küchengeräte werden als Namen übergeben, weil ihre IDs nur innerhalb einer Familie gelten.
// Eingebettete Alt-Bilder (data:...) werden nicht geteilt - nur ausgelagerte Bilddateien.
function publicRecipesFrom(data) {
    const recipes = data && Array.isArray(data.recipes) ? data.recipes : [];
    const tools = data && Array.isArray(data.kitchenTools) ? data.kitchenTools : [];
    const toolLabel = (id) => {
        for (let i = 0; i < tools.length; i++) {
            if (tools[i] && tools[i].id === id) return cleanText(tools[i].label, 60);
        }
        return "";
    };
    const seen = {};
    const out = [];
    recipes.forEach(r => {
        if (!r || r.oeffentlich !== true || !r.id) return;
        const rezeptId = cleanText(r.id, 100);
        if (!rezeptId || seen[rezeptId]) return;
        seen[rezeptId] = true;
        const image = (typeof r.image === "string" && r.image.indexOf("/api/files/") === 0) ? cleanText(r.image, 500) : "";
        const recipeTools = Array.isArray(r.tools) ? r.tools.map(toolLabel).filter(Boolean) : [];
        out.push({
            rezeptId: rezeptId,
            bildId: imageRecordIdFromPath(image),
            data: {
                title: cleanText(r.title, 300) || "Unbenanntes Rezept",
                ingredients: cleanList(r.ingredients, 300, 500),
                steps: cleanList(r.steps, 200, 3000),
                servings: cleanNumber(r.servings, 1000) || 2,
                prepTime: cleanNumber(r.prepTime, 100000),
                cookTime: cleanNumber(r.cookTime, 100000),
                categories: cleanList(r.categories, 30, 60),
                tools: recipeTools,
                image: image,
                imageFrame: image ? cleanFrame(r.imageFrame) : undefined,
                createdAt: cleanNumber(r.createdAt, 9999999999999),
            },
        });
    });
    return out;
}

// ---------------------------------------------------------------------------------------------
// Abgleich beim Speichern der Familiendaten
// ---------------------------------------------------------------------------------------------
// Neue/geänderte öffentliche Rezepte eintragen, nicht mehr öffentliche bzw. gelöschte entfernen.
function syncFamily(familyId, data) {
    if (!familyId || !data || typeof data !== "object") return;
    const col = ensureSchema();
    if (!col) return;

    const wanted = publicRecipesFrom(data);
    let herkunft = "";
    try { herkunft = cleanText($app.findRecordById(FAMILIEN, String(familyId)).getString("name"), 60); } catch (e) { herkunft = ""; }
    let existing = [];
    try {
        existing = $app.findRecordsByFilter(OEFFENTLICH, "familie = {:f}", "", 0, 0, { f: String(familyId) });
    } catch (err) { existing = []; }
    if (!wanted.length && !existing.length) return;

    const byRecipe = {};
    existing.forEach(rec => {
        const key = rec.getString("rezept_id");
        if (byRecipe[key]) {
            // doppelter Eintrag (sollte nicht vorkommen) - aufräumen
            try { $app.delete(rec); } catch (e) { /* egal */ }
            return;
        }
        byRecipe[key] = rec;
    });

    let added = 0, changed = 0, removed = 0;
    wanted.forEach(w => {
        const fp = fingerprint({ d: w.data, b: w.bildId, h: herkunft });
        let rec = byRecipe[w.rezeptId] || null;
        if (rec) {
            delete byRecipe[w.rezeptId];
            if (rec.getString("fingerprint") === fp) return;
        }
        try {
            if (!rec) {
                rec = new Record(col);
                rec.set("familie", String(familyId));
                rec.set("rezept_id", w.rezeptId);
                added++;
            } else {
                changed++;
            }
            rec.set("titel", w.data.title);
            rec.set("herkunft", herkunft);
            rec.set("bild_id", w.bildId);
            rec.set("data", w.data);
            rec.set("fingerprint", fp);
            $app.save(rec);
        } catch (err) {
            console.log("[Rezepte] Öffentliches Rezept \"" + w.data.title + "\" nicht speicherbar: " + err.message);
        }
    });
    Object.keys(byRecipe).forEach(k => {
        try { $app.delete(byRecipe[k]); removed++; } catch (err) { /* egal */ }
    });
    if (added || changed || removed) {
        console.log("[Rezepte] Öffentliche Rezepte abgeglichen: " + added + " neu, " + changed + " geändert, " + removed + " entfernt.");
    }
}

// ---------------------------------------------------------------------------------------------
// Familie wird gelöscht: öffentliche Rezepte in die "Rezepte Familie" verschieben
// ---------------------------------------------------------------------------------------------
// Läuft VOR dem eigentlichen Löschen (onRecordDelete in rezepte.pb.js), damit die Bilder nicht
// über das Mitlöschen von "rezept_bilder" verloren gehen. Direkte SQL-Befehle: schnell und ohne
// erneute Prüfung/Hooks. rezept_id bekommt die alte Familien-ID vorangestellt, damit sich Rezepte
// verschiedener gelöschter Familien nie in die Quere kommen.
function detachFamily(app, familyId) {
    const a = app || $app;
    const f = String(familyId || "");
    if (!f || !findCol(OEFFENTLICH)) return 0;
    let count = 0;
    try {
        const m = new DynamicModel({ n: 0 });
        a.db().newQuery("SELECT COUNT(*) AS n FROM " + OEFFENTLICH + " WHERE familie = {:f}").bind({ f: f }).one(m);
        count = Number(m.n || 0);
    } catch (e) { count = 0; }
    if (!count) return 0;
    // Name der Familie festhalten, falls er noch nicht eingetragen ist
    try {
        const name = cleanText(a.findRecordById(FAMILIEN, f).getString("name"), 60);
        if (name) {
            a.db().newQuery("UPDATE " + OEFFENTLICH + " SET herkunft = {:n} WHERE familie = {:f} AND (herkunft = '' OR herkunft IS NULL)")
                .bind({ n: name, f: f }).execute();
        }
    } catch (e) { /* egal */ }
    // Bilder der öffentlichen Rezepte von der Familie lösen (sonst würden sie mitgelöscht)
    try {
        a.db().newQuery("UPDATE rezept_bilder SET familie = '' WHERE id IN (SELECT bild_id FROM " + OEFFENTLICH + " WHERE familie = {:f} AND bild_id != '')")
            .bind({ f: f }).execute();
    } catch (e) {
        console.log("[Rezepte] Bilder konnten nicht gesichert werden: " + e.message);
    }
    a.db().newQuery("UPDATE " + OEFFENTLICH + " SET familie = '', rezept_id = substr({:f} || ':' || rezept_id, 1, 100) WHERE familie = {:f}")
        .bind({ f: f }).execute();
    console.log("[Rezepte] " + count + " öffentliche(s) Rezept(e) in die \"" + REZEPTE_FAMILIE + "\" verschoben.");
    return count;
}

// ---------------------------------------------------------------------------------------------
// Lesen (für alle angemeldeten Familien)
// ---------------------------------------------------------------------------------------------
function parseData(raw) {
    try { return require(`${__hooks}/calendar-sync.js`).parseRecordData(raw) || {}; } catch (e) { return {}; }
}

function listPublic(ownFamilyId) {
    const col = ensureSchema();
    if (!col) return [];
    const names = {};
    try {
        $app.findRecordsByFilter(FAMILIEN, "", "", 0, 0).forEach(f => { names[f.id] = f.getString("name"); });
    } catch (e) { /* ohne Namen */ }
    let recs = [];
    try { recs = $app.findRecordsByFilter(OEFFENTLICH, "", "-updated", 500, 0); } catch (e) { recs = []; }
    const own = String(ownFamilyId || "");
    return recs.map(rec => {
        const fam = rec.getString("familie");
        const verwaist = !fam || !names[fam];
        return {
            id: rec.id,
            rezeptId: rec.getString("rezept_id"),
            familie: verwaist ? REZEPTE_FAMILIE : names[fam],
            herkunft: rec.getString("herkunft"),
            verwaist: verwaist,
            eigene: !verwaist && !!own && fam === own,
            updated: rec.getString("updated"),
            data: parseData(rec.get("data")),
        };
    });
}

module.exports = { OEFFENTLICH, REZEPTE_FAMILIE, ensureSchema, syncFamily, detachFamily, listPublic, publicRecipesFrom };
