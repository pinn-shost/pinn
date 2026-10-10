// pb_hooks/pinn-hinweise.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden
// (Einrichtung, Abruf und Dokumente-Hook in hinweise.pb.js; Aufrufe aus save_family_data.pb.js,
// aufgaben.pb.js, create_calendar_event.pb.js, pinn-push.js, pinn-finanzen.js und pinn-kassen.js).
//
// Alles, was unter der 🔔 Glocke in der App erscheint (außer Heimwegen, offenen Einkaufs-Beträgen
// und Versions-Neuerungen, die die App selbst kennt):
//
//   1. Push-Nachrichten (Art "push"): JEDE persönliche Push-Nachricht landet zusätzlich als Hinweis
//      beim Empfänger - auch wenn auf seinem Gerät gerade keine Mitteilung ankommt. Mit Link zur
//      passenden Stelle (dieselbe Adresse wie beim Antippen der Mitteilung). Gleiche Meldungen
//      (gleicher Tag/"tag") am selben Tag ersetzen sich, Erinnerungen verfallen nach ihrem Termin.
//   2. Neuigkeiten der Familie - was die anderen eintragen oder ändern:
//      - Einkauf:   neue Artikel, abgehakte/entfernte Artikel, neue/umbenannte/gelöschte Einkaufslisten
//      - Listen:    Packliste / Checkliste / Ideenliste / Wunschzettel: neu, umbenannt, gelöscht,
//                   neue und abgehakte Einträge (Geschenkelisten und private Listen NIE - Überraschungen
//                   bleiben geheim; bei Wunschzetteln nur, was die Person selbst auf ihren Zettel setzt)
//      - Essen:     neu geplante Mahlzeiten         - Rezepte:  neue Rezepte
//      - Aufgaben:  neu angelegte und erledigte Aufgaben
//      - Termine:   neu eingetragene Termine        - Vorrat:   neue Vorrats-Artikel
//      - Pinnwand:  neue Zettel und Antworten       - Familie:  neue Familienmitglieder, Notfallpass geändert
//      - Finanzen:  neue Buchungen (Einkauf mit Betrag, Tanken & Co. aus „Fahrzeuge“, Ausgleiche) -
//                   NUR an die Mitglieder der jeweiligen Kasse; wer wem noch etwas schuldet, rechnet
//                   die App beim Anzeigen aus den Buchungen der Kasse
//      - Verträge & Fahrzeuge: neu angelegt (nur Mitglieder der Kasse)
//      - Dokumente: neu abgelegt (nur, wer das Dokument sehen darf)
//
// Gespeichert in der Sammlung "hinweise" (Zugriff nur über /api/pinn/hinweise, Sammlungs-API gesperrt):
//   art, ziel, typ, wer (Profil-ID), mitglied (Mitglieds-ID), name (Benutzername als Rückfall),
//   titel, text (Push-Text), link (Push-Adresse), an (",Profil-ID,Profil-ID," = nur für diese
//   Profile; leer = ganze Familie), bis (ms - danach nicht mehr zeigen; 0 = nie), anzahl,
//   eintraege (JSON-Text: [{ id, t, d?, z?, k?, b?, f? }]), familie, created, updated
//   k = Schlüssel gegen Doppelungen ("aufgabe:<ID>"): hat jemand zur selben Sache schon eine
//       persönliche Push-Nachricht in der Glocke, entfällt für ihn der allgemeine Familien-Hinweis.
//
// Schonend für CPU und Speicher:
//   - Die Familiendaten werden nicht zusätzlich gelesen: verglichen wird nur der alte mit dem gerade
//     empfangenen Stand, den save_family_data.pb.js ohnehin in der Hand hat (Nachschlagen über Maps).
//   - Mehrere Änderungen derselben Person an derselben Stelle innerhalb von 20 Minuten werden zu
//     EINEM Hinweis zusammengefasst ("Anna hat 5 Artikel auf Rewe gesetzt").
//   - Hinweise älter als 4 Tage werden beim Anlegen neuer Hinweise der Familie gelöscht - kein Zeitplan.
//   - Ein Fehler hier verhindert nie das Speichern bzw. den Versand selbst.

const COL = "hinweise";
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000;
const MERGE_MS = 20 * MIN_MS;     // zusammenfassen innerhalb von 20 Minuten
const PUSH_MERGE_MS = 14 * HOUR_MS; // gleiche Push-Meldung (gleicher tag) ersetzt die vorige
const KEEP_MS = 4 * DAY_MS;       // auf dem Server aufbewahren
const SHOW_MS = 3 * DAY_MS;       // an die App liefern
const MAX_ENTRIES = 40;           // gespeicherte Einträge je Hinweis
const ITEM_MAX_AGE = 3 * DAY_MS;  // ältere Artikel (z. B. nach langem Offline-Abgleich) nicht melden
// Diese Push-Nachrichten zeigt die Glocke schon auf eigene Weise (Heimweg-Karte, Einkauf nachtragen)
const PUSH_SKIP_URL = /[?&](heimweg|hinweise)=/;
// Reihenfolge, nach der aus einer Push-Adresse der Schlüssel gegen Doppelungen gebildet wird
const DK_KEYS = ["aufgabe", "ausgabe", "dokument", "vertrag", "pinnwand", "rezept", "mitglied", "sos", "fahrzeug"];

const EXTRA_FIELDS = [
    { name: "text", type: "text", max: 2000 },
    { name: "link", type: "text", max: 400 },
    { name: "an", type: "text", max: 2000 },
    { name: "bis", type: "number", required: false },
];

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function makeField(def) {
    const tmp = new Collection({ type: "base", name: "pinn_tmp_" + def.name, fields: [def] });
    return tmp.fields.getByName(def.name);
}

function ensureSchema() {
    let col = findCol(COL);
    if (col) {
        // Felder späterer Versionen nachrüsten
        let changed = false;
        EXTRA_FIELDS.forEach(def => {
            if (hasField(col, def.name)) return;
            try { col.fields.add(makeField(def)); changed = true; }
            catch (err) { console.log("[Hinweise] Feld \"" + def.name + "\" nicht anlegbar: " + err.message); }
        });
        if (changed) {
            try { $app.save(col); console.log("[Hinweise] Neue Felder ergänzt (Push-Spiegel, Empfänger, Links)."); }
            catch (err) { console.log("[Hinweise] Felder nicht gespeichert: " + err.message); }
        }
        return;
    }
    const fam = findCol("familien");
    try {
        const fields = [
            { name: "art", type: "text", max: 30 },
            { name: "ziel", type: "text", max: 80 },
            { name: "typ", type: "text", max: 20 },
            { name: "wer", type: "text", max: 30 },
            { name: "mitglied", type: "text", max: 60 },
            { name: "name", type: "text", max: 80 },
            { name: "titel", type: "text", max: 200 },
            { name: "anzahl", type: "number", required: false },
            { name: "eintraege", type: "text", max: 12000 },
        ].concat(EXTRA_FIELDS).concat([
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ]);
        if (fam) fields.push({ name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false });
        else fields.push({ name: "familie", type: "text", max: 30 });
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: fields,
            indexes: [
                "CREATE INDEX `idx_hinweise_updated` ON `" + COL + "` (`updated`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Hinweise] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Hinweise] Konnte Sammlung nicht anlegen: " + err.message);
    }
}
let schemaChecked = false;
function ready() {
    if (schemaChecked) return !!findCol(COL);
    schemaChecked = true;
    ensureSchema();
    return !!findCol(COL);
}

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function pbDate(ms) { return new Date(ms).toISOString().replace("T", " "); }
function parseDate(s) {
    const t = Date.parse(String(s || "").replace(" ", "T"));
    return isFinite(t) ? t : 0;
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function arr(v) { return Array.isArray(v) ? v : []; }
function byId(list) {
    const s = {};
    arr(list).forEach(x => { if (x && x.id) s[String(x.id)] = x; });
    return s;
}
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// "2026-10-06" -> "Di 06.10."
function niceDate(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return WD[d.getUTCDay()] + " " + m[3] + "." + m[2] + ".";
}
function todayYmd() {
    // Server läuft meist in UTC - ein Tag Puffer reicht für "nicht in der Vergangenheit"
    return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}
function readEntries(rec) {
    try {
        const v = JSON.parse(rec.getString("eintraege") || "[]");
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}
function authInfo(auth) {
    if (!auth) return null;
    return {
        id: auth.id,
        mitglied: auth.getString("mitglied"),
        name: auth.getString("username") || "Jemand",
    };
}
function getStr(rec, name) { try { return rec.getString(name); } catch (e) { return ""; } }
// Empfänger-Liste -> ",id1,id2," (leer = ganze Familie)
function anText(ids) {
    const list = arr(ids).map(x => String(x || "")).filter(x => /^[a-z0-9]{15}$/.test(x));
    const uniq = list.filter((x, i) => list.indexOf(x) === i);
    return uniq.length ? ("," + uniq.join(",") + ",").slice(0, 2000) : "";
}
// Schlüssel gegen Doppelungen aus einer App-Adresse ("/?aufgabe=abc" -> "aufgabe:abc")
function dkFromUrl(url) {
    const q = String(url || "").split("?")[1] || "";
    const params = {};
    q.split("&").forEach(p => {
        const i = p.indexOf("=");
        if (i > 0) { try { params[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (e) { params[p.slice(0, i)] = p.slice(i + 1); } }
    });
    for (let i = 0; i < DK_KEYS.length; i++) {
        const v = params[DK_KEYS[i]];
        if (v && v !== "1") return DK_KEYS[i] + ":" + String(v).slice(0, 60);
    }
    return "";
}
function cleanEntry(x) {
    const o = { id: String(x.id || "").slice(0, 60), t: cleanText(x.t, 120) };
    if (x.d) o.d = String(x.d).slice(0, 10);
    if (x.z) o.z = cleanText(x.z, 60);
    if (x.k) o.k = String(x.k).slice(0, 80);
    if (typeof x.b === "number" && isFinite(x.b)) o.b = Math.round(x.b * 100) / 100;
    if (x.f) o.f = String(x.f).slice(0, 60);
    return o;
}

// Alte Hinweise der Familie entfernen (nur beim Anlegen eines neuen Hinweises, max. 60 auf einmal)
function cleanup(familyId) {
    let old = [];
    try {
        old = $app.findRecordsByFilter(COL, "familie = {:f} && updated < {:d}", "", 60, 0, { f: familyId, d: pbDate(Date.now() - KEEP_MS) });
    } catch (e) { old = []; }
    old.forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
}

// ---------------------------------------------------------------------------------------------
// Hinweis anlegen oder mit einem frischen Hinweis derselben Person zusammenfassen
// items: [{ id, t, d?, z?, k?, b?, f? }]
// opts:  { an: [Profil-IDs] (nur für diese), replace: true (Einträge ersetzen statt anhängen) }
// ---------------------------------------------------------------------------------------------
function record(familyId, who, art, ziel, typ, titel, items, opts) {
    if (!familyId || !who || !who.id) return;
    const o = opts || {};
    const list = arr(items).filter(x => x && x.t).map(cleanEntry);
    if (!list.length) return;
    if (!ready()) return;
    const an = o.an ? anText(o.an) : "";
    if (o.an && !an) return; // niemand sonst darf es sehen
    let rec = null;
    try {
        const found = $app.findRecordsByFilter(COL,
            "familie = {:f} && art = {:a} && ziel = {:z} && wer = {:w} && an = {:an} && updated >= {:s}",
            "-updated", 1, 0,
            { f: familyId, a: art, z: String(ziel || "").slice(0, 80), w: who.id, an: an, s: pbDate(Date.now() - MERGE_MS) });
        rec = found[0] || null;
    } catch (e) { rec = null; }

    if (rec) {
        const old = readEntries(rec);
        const known = {};
        old.forEach(x => { if (x && x.id) known[x.id] = 1; });
        const fresh = list.filter(x => !x.id || !known[x.id]);
        if (!fresh.length) return;
        rec.set("eintraege", JSON.stringify(fresh.concat(old).slice(0, MAX_ENTRIES)));
        rec.set("anzahl", (rec.getInt("anzahl") || old.length) + fresh.length);
        if (titel) rec.set("titel", cleanText(titel, 200));
        $app.save(rec);
        return;
    }
    cleanup(familyId);
    rec = new Record($app.findCollectionByNameOrId(COL));
    rec.set("familie", familyId);
    rec.set("art", art);
    rec.set("ziel", String(ziel || "").slice(0, 80));
    rec.set("typ", String(typ || "").slice(0, 20));
    rec.set("wer", who.id);
    rec.set("mitglied", String(who.mitglied || "").slice(0, 60));
    rec.set("name", cleanText(who.name, 80));
    rec.set("titel", cleanText(titel, 200));
    rec.set("anzahl", list.length);
    rec.set("eintraege", JSON.stringify(list.slice(0, MAX_ENTRIES)));
    if (an) rec.set("an", an);
    $app.save(rec);
}

// Einen Eintrag wieder herausnehmen (z. B. Häkchen gleich wieder entfernt)
function unrecord(familyId, who, art, entryId) {
    if (!familyId || !who || !who.id || !entryId || !ready()) return;
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(COL, "familie = {:f} && art = {:a} && wer = {:w} && updated >= {:s}", "-updated", 3, 0,
            { f: familyId, a: art, w: who.id, s: pbDate(Date.now() - DAY_MS) });
    } catch (e) { recs = []; }
    recs.forEach(rec => {
        const old = readEntries(rec);
        const rest = old.filter(x => !x || x.id !== entryId);
        if (rest.length === old.length) return;
        try {
            if (!rest.length) { $app.delete(rec); return; }
            rec.set("eintraege", JSON.stringify(rest));
            rec.set("anzahl", Math.max(rest.length, (rec.getInt("anzahl") || old.length) - 1));
            $app.save(rec);
        } catch (e) { /* egal */ }
    });
}

// ---------------------------------------------------------------------------------------------
// 1. Push-Nachricht in die Glocke des Empfängers spiegeln (aus pinn-push.js#notifyUserDetailed)
// msg: { titel, text, url, tag, bis? (ms), dk? }
// ---------------------------------------------------------------------------------------------
function pushMirror(userId, msg) {
    if (!userId || !msg) return;
    const url = String(msg.url || "/");
    if (PUSH_SKIP_URL.test(url)) return;
    const tag = String(msg.tag || "").slice(0, 80);
    if (tag === "test") return;
    let user = null;
    try { user = $app.findRecordById("benutzer", String(userId)); } catch (e) { return; }
    const familyId = getStr(user, "familie");
    if (!familyId || !ready()) return;
    const an = anText([userId]);
    const titel = cleanText(msg.titel || "pinn.", 200);
    const text = String(msg.text || "").trim().slice(0, 2000);
    const dk = String(msg.dk || dkFromUrl(url) || "").slice(0, 80);
    const bis = Number(msg.bis) > 0 ? Math.round(Number(msg.bis)) : 0;
    let rec = null;
    if (tag) {
        try {
            const found = $app.findRecordsByFilter(COL, "familie = {:f} && art = 'push' && an = {:an} && ziel = {:z} && updated >= {:s}", "-updated", 1, 0,
                { f: familyId, an: an, z: tag, s: pbDate(Date.now() - PUSH_MERGE_MS) });
            rec = found[0] || null;
        } catch (e) { rec = null; }
    }
    if (!rec) {
        cleanup(familyId);
        rec = new Record($app.findCollectionByNameOrId(COL));
        rec.set("familie", familyId);
        rec.set("art", "push");
        rec.set("ziel", tag);
        rec.set("wer", "");
        rec.set("an", an);
        rec.set("anzahl", 1);
    }
    rec.set("typ", (tag.split("-")[0] || "").slice(0, 20));
    rec.set("titel", titel);
    rec.set("text", text);
    rec.set("link", url.slice(0, 400));
    rec.set("bis", bis);
    rec.set("eintraege", JSON.stringify(dk ? [{ id: "p", t: titel.slice(0, 120), k: dk }] : []));
    $app.save(rec);
}

// ---------------------------------------------------------------------------------------------
// 2. Nach dem Speichern der Familiendaten: alten mit neuem Stand vergleichen
// ---------------------------------------------------------------------------------------------
function itemLabel(it) { return it.qty ? it.name + " (" + it.qty + ")" : it.name; }
function afterSave(familyId, oldData, newData, auth) {
    if (!familyId || !oldData || typeof oldData !== "object" || !newData || typeof newData !== "object") return;
    const who = authInfo(auth);
    if (!who) return;
    const now = Date.now();
    const fresh = it => !it.createdAt || Number(it.createdAt) >= now - ITEM_MAX_AGE;

    // --- Einkaufslisten: neu, umbenannt, gelöscht ---
    const oldListMap = byId(oldData.shoppingLists);
    const lists = arr(newData.shoppingLists);
    const newListMap = byId(lists);
    const listName = lid => {
        if (lid === "essensplanung") return "Essensplanung";
        const l = newListMap[lid] || oldListMap[lid];
        return l ? (l.name || "Einkaufsliste") : "";
    };
    lists.forEach(l => {
        if (!l || !l.id || l.id === "essensplanung") return;
        const prev = oldListMap[l.id];
        if (!prev) {
            record(familyId, who, "einkaufsliste", l.id, "einkauf", l.name || "Einkaufsliste", [{ id: l.id, t: l.name || "Einkaufsliste" }]);
        } else if (cleanText(prev.name, 80) && cleanText(l.name, 80) && cleanText(prev.name, 80) !== cleanText(l.name, 80)) {
            record(familyId, who, "einkaufsliste-um", l.id, "einkauf", l.name, [{ id: l.id + ":" + cleanText(l.name, 40), t: l.name, z: prev.name }]);
        }
    });
    if (Array.isArray(oldData.shoppingLists)) {
        arr(oldData.shoppingLists).forEach(l => {
            if (!l || !l.id || l.id === "essensplanung" || newListMap[l.id]) return;
            record(familyId, who, "einkaufsliste-weg", l.id, "einkauf", l.name || "Einkaufsliste", [{ id: l.id, t: l.name || "Einkaufsliste" }]);
        });
    }

    // --- Einkauf: neue, abgehakte und entfernte Artikel, je Liste zusammengefasst ---
    const oldItems = byId(oldData.shoppingItems);
    const newItems = arr(newData.shoppingItems);
    const newItemMap = byId(newItems);
    const added = {}, ticked = {}, removed = {};
    const push = (map, lid, e) => { (map[lid] = map[lid] || []).push(e); };
    newItems.forEach(it => {
        if (!it || !it.id || !it.name) return;
        const lid = it.listId || "essensplanung";
        const prev = oldItems[it.id];
        if (!prev) {
            if (!it.done && fresh(it)) push(added, lid, { id: it.id, t: itemLabel(it) });
        } else if (it.done && !prev.done) {
            push(ticked, lid, { id: it.id, t: itemLabel(it) });
        }
    });
    if (Array.isArray(oldData.shoppingItems)) {
        arr(oldData.shoppingItems).forEach(it => {
            if (!it || !it.id || !it.name || it.done || newItemMap[it.id]) return;
            const lid = it.listId || "essensplanung";
            if (lid !== "essensplanung" && !newListMap[lid]) return; // ganze Liste gelöscht - steht schon oben
            push(removed, lid, { id: it.id, t: itemLabel(it) });
        });
    }
    const each = (map, art) => Object.keys(map).forEach(lid => {
        const title = listName(lid);
        if (!title) return; // Liste gibt es nicht (mehr)
        record(familyId, who, art, lid, "einkauf", title, map[lid]);
    });
    each(added, "einkauf");
    each(ticked, "einkauf-ab");
    each(removed, "einkauf-weg");

    // --- Weitere Listen (Packen, Checklisten, Ideen, Wünsche) ---
    const oldFam = byId(oldData.familyLists);
    const newFamMap = byId(newData.familyLists);
    const secret = l => !l || l.type === "gift" || !!l.privateTo || (l.type === "wish" && (!who.mitglied || l.memberId !== who.mitglied));
    arr(newData.familyLists).forEach(l => {
        if (!l || !l.id || !l.type || secret(l)) return; // Geschenke & Privates bleiben geheim, nur eigene Wünsche
        const prev = oldFam[l.id];
        if (!prev) {
            // neue Liste (nur, wenn es vorher überhaupt schon Listen-Daten gab)
            if (Array.isArray(oldData.familyLists)) {
                record(familyId, who, "liste-neu", l.id, l.type, l.name || "Liste", [{ id: l.id, t: l.name || "Liste" }]);
            }
            return;
        }
        if (prev.privateTo) return; // war privat - Änderungen daraus nicht melden
        if (cleanText(prev.name, 80) && cleanText(l.name, 80) && cleanText(prev.name, 80) !== cleanText(l.name, 80)) {
            record(familyId, who, "liste-um", l.id, l.type, l.name, [{ id: l.id + ":" + cleanText(l.name, 40), t: l.name, z: prev.name }]);
        }
        const had = byId(prev.items);
        const newEntries = [], doneEntries = [];
        arr(l.items).forEach(it => {
            if (!it || !it.id || !it.text) return;
            const p = had[it.id];
            if (!p) { if (!it.done && fresh(it)) newEntries.push({ id: it.id, t: it.text }); }
            else if (it.done && !p.done) doneEntries.push({ id: it.id, t: it.text });
        });
        if (newEntries.length) record(familyId, who, "liste", l.id, l.type, l.name || "Liste", newEntries);
        if (doneEntries.length) record(familyId, who, "liste-ab", l.id, l.type, l.name || "Liste", doneEntries);
    });
    if (Array.isArray(oldData.familyLists)) {
        arr(oldData.familyLists).forEach(l => {
            if (!l || !l.id || !l.type || newFamMap[l.id] || secret(l)) return;
            record(familyId, who, "liste-weg", l.id, l.type, l.name || "Liste", [{ id: l.id, t: l.name || "Liste" }]);
        });
    }

    // --- Essensplanung ---
    const oldMeals = byId(oldData.mealPlan);
    const recipes = arr(newData.recipes);
    const recipeMap = byId(recipes);
    const minDay = todayYmd();
    const meals = arr(newData.mealPlan).filter(m => m && m.id && !oldMeals[m.id] && String(m.date || "") >= minDay).map(m => {
        const r = m.recipeId ? recipeMap[m.recipeId] : null;
        const title = (r && r.title) || m.title || "";
        return title ? { id: m.id, t: title, d: m.date } : null;
    }).filter(Boolean);
    if (meals.length) record(familyId, who, "essen", "plan", "", "Essensplanung", meals);

    // --- Rezepte ---
    const oldRecipes = byId(oldData.recipes);
    const newRecipes = recipes.filter(r => r && r.id && !oldRecipes[r.id] && r.title).map(r => ({ id: r.id, t: r.title, k: "rezept:" + r.id }));
    if (newRecipes.length && newRecipes.length <= 30) record(familyId, who, "rezept", "rezepte", "", "Rezepte", newRecipes);

    // --- Vorrat: neue Artikel ---
    if (Array.isArray(oldData.pantryItems)) {
        const oldPantry = byId(oldData.pantryItems);
        const newPantry = arr(newData.pantryItems).filter(p => p && p.id && p.name && !oldPantry[p.id])
            .map(p => ({ id: p.id, t: p.name + (p.qty ? " (" + p.qty + (p.unit ? " " + p.unit : "") + ")" : "") }));
        if (newPantry.length && newPantry.length <= 40) record(familyId, who, "vorrat", "vorrat", "", "Vorrat", newPantry);
    }

    // --- Familie: neue Mitglieder ---
    if (Array.isArray(oldData.members)) {
        const oldMembers = byId(oldData.members);
        const newMembers = arr(newData.members).filter(m => m && m.id && m.name && !oldMembers[m.id])
            .map(m => ({ id: m.id, t: m.name, z: m.role || "", k: "mitglied:" + m.id }));
        if (newMembers.length) record(familyId, who, "mitglied", "familie", "", "Familie", newMembers);
    }

    // --- Notfallpass geändert (je Mitglied) ---
    const oldPasses = (oldData.emergencyPasses && typeof oldData.emergencyPasses === "object") ? oldData.emergencyPasses : null;
    const newPasses = (newData.emergencyPasses && typeof newData.emergencyPasses === "object") ? newData.emergencyPasses : null;
    if (oldPasses && newPasses) {
        const memberMap = byId(newData.members);
        Object.keys(newPasses).forEach(mid => {
            let a = "", b = "";
            try { a = JSON.stringify(oldPasses[mid] || null); b = JSON.stringify(newPasses[mid] || null); } catch (e) { return; }
            if (a === b || b === "null") return;
            const m = memberMap[mid];
            if (!m) return;
            record(familyId, who, "notfallpass", mid, "", m.name || "Notfallpass", [{ id: mid + ":" + new Date().toISOString().slice(0, 13), t: m.name || "Notfallpass" }]);
        });
    }

    // --- Pinnwand: neue Zettel und Antworten ---
    if (Array.isArray(oldData.pinboard)) {
        const oldNotes = byId(oldData.pinboard);
        const fresh2 = ms => !ms || Number(ms) >= now - ITEM_MAX_AGE;
        const newNotes = [];
        arr(newData.pinboard).forEach(n => {
            if (!n || !n.id) return;
            const prev = oldNotes[n.id];
            const head = cleanText(n.title || n.text || (n.type === "photo" ? "Foto" : "Zettel"), 80) || "Zettel";
            if (!prev) {
                if (!n.archived && fresh2(n.createdAt)) newNotes.push({ id: n.id, t: head, k: "pinnwand:" + n.id });
                return;
            }
            const hadC = byId(prev.comments);
            const replies = arr(n.comments).filter(c => c && c.id && c.text && !hadC[c.id] && fresh2(c.at))
                .map(c => ({ id: c.id, t: cleanText(c.text, 120) }));
            if (replies.length) record(familyId, who, "pinnwand-antwort", n.id, n.type || "", head, replies);
        });
        if (newNotes.length) record(familyId, who, "pinnwand", "pinnwand", "", "Pinnwand", newNotes);
    }
}

// ---------------------------------------------------------------------------------------------
// Aufgaben (aus aufgaben.pb.js) - Haushalts-Aufgaben legt der Zeitplan an, die werden nicht gemeldet
// ---------------------------------------------------------------------------------------------
function taskCreated(familyId, task, auth) {
    if (!task || !task.id || !task.title || task.household) return;
    const who = authInfo(auth);
    if (!who) return;
    record(familyId, who, "aufgabe", "aufgaben", "", "Aufgaben", [{ id: task.id, t: task.title, d: task.dueDate || "", k: "aufgabe:" + task.id }]);
}
// Aufgabe abgehakt (done = true) bzw. Häkchen wieder entfernt
function taskDone(familyId, task, auth, done) {
    if (!task || !task.id || !task.title) return;
    const who = authInfo(auth);
    if (!who) return;
    if (!done) { unrecord(familyId, who, "aufgabe-ab", task.id); return; }
    record(familyId, who, "aufgabe-ab", "aufgaben", task.household ? "haushalt" : "", "Aufgaben", [{ id: task.id, t: task.title }]);
}

// Neuer Termin (aus create_calendar_event.pb.js)
function eventCreated(familyId, body, auth) {
    if (!body || !body.title) return;
    const who = authInfo(auth);
    if (!who) return;
    const id = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const day = String(body.startDate || "").slice(0, 10);
    const when = [niceDate(body.startDate), (!body.allDay && body.startTime) ? String(body.startTime).slice(0, 5) + " Uhr" : ""].filter(Boolean).join(", ");
    record(familyId, who, "termin", "kalender", "", "Kalender", [{ id: id, t: body.title, d: day, z: when, k: termKey(day, body.title) }]);
}
// Gleicher Schlüssel wie bei der Zuweisungs-Push (pinn-push.js)
function termKey(day, title) { return "termin:" + String(day || "").slice(0, 10) + ":" + cleanText(title, 40); }

// ---------------------------------------------------------------------------------------------
// Finanzen: neue Buchung (aus pinn-finanzen.js) - nur an die Mitglieder der Kasse
// ---------------------------------------------------------------------------------------------
function kasseInfo(familyId, kasseId) {
    if (!kasseId) return null;
    try {
        const kassen = require(`${__hooks}/pinn-kassen.js`);
        const k = kassen.metaList(familyId).find(x => x.id === kasseId);
        if (!k) return null;
        return { meta: k, userIds: kassen.memberUserIds(k) };
    } catch (e) { return null; }
}
function expenseCreated(rec, user) {
    if (!rec || !user) return;
    const familyId = getStr(rec, "familie");
    const kasseId = getStr(rec, "kasse");
    const info = kasseInfo(familyId, kasseId);
    if (!info) return;
    const who = authInfo(user);
    const an = info.userIds.filter(id => id !== who.id);
    if (!an.length) return; // eigene Kasse - niemand sonst
    const betrag = Math.round(rec.getFloat("betrag") * 100) / 100;
    const kat = getStr(rec, "kategorie");
    const laden = cleanText(getStr(rec, "laden"), 60);
    const titel = cleanText(getStr(rec, "titel"), 120) || laden || "Buchung";
    const bezug = getStr(rec, "bezug");
    const fz = /^fahrzeug:/.test(bezug) ? bezug.slice(9) : "";
    const art = kat === "ausgleich" ? "ausgleich" : (fz ? "fahrzeug-log" : "ausgabe");
    const n = getStr(rec, "artikel") ? getStr(rec, "artikel").split("\n").filter(Boolean).length : 0;
    record(familyId, who, art, kasseId, kat.slice(0, 20), info.meta.name || "Kasse", [{
        id: rec.id, t: titel, b: betrag, z: laden || (n ? n + " Artikel" : ""), f: fz,
        k: "ausgabe:" + rec.id, d: getStr(rec, "datum"),
    }], { an: an });
}

// ---------------------------------------------------------------------------------------------
// Kassen-Daten gespeichert (aus pinn-kassen.js#saveData): neue Verträge und Fahrzeuge
// ---------------------------------------------------------------------------------------------
function kasseDataSaved(meta, oldDaten, newDaten, user) {
    if (!meta || !user || !oldDaten || !newDaten || typeof oldDaten !== "object" || typeof newDaten !== "object") return;
    const who = authInfo(user);
    let ids = [];
    try { ids = require(`${__hooks}/pinn-kassen.js`).memberUserIds(meta); } catch (e) { ids = []; }
    const an = ids.filter(id => id !== who.id);
    if (!an.length) return;
    const familyId = meta.familie;
    const name = meta.name || "Kasse";
    if (Array.isArray(oldDaten.contracts)) {
        const had = byId(oldDaten.contracts);
        const fresh = arr(newDaten.contracts).filter(c => c && c.id && !had[c.id])
            .map(c => ({ id: c.id, t: cleanText(c.name, 100) || cleanText(c.provider, 100) || "Vertrag", z: c.provider && c.name ? cleanText(c.provider, 60) : "", k: "vertrag:" + c.id }));
        if (fresh.length && fresh.length <= 20) record(familyId, who, "vertrag", meta.id, "", name, fresh, { an: an });
    }
    if (Array.isArray(oldDaten.vehicles)) {
        const had = byId(oldDaten.vehicles);
        const fresh = arr(newDaten.vehicles).filter(v => v && v.id && !had[v.id])
            .map(v => ({ id: v.id, t: cleanText(v.name, 80) || [v.make, v.model].filter(Boolean).join(" ") || "Fahrzeug", z: cleanText(v.plate, 20).toUpperCase(), k: "fahrzeug:" + v.id }));
        if (fresh.length && fresh.length <= 10) record(familyId, who, "fahrzeug", meta.id, "", name, fresh, { an: an });
    }
}

// ---------------------------------------------------------------------------------------------
// Dokument neu abgelegt (aus hinweise.pb.js, nach dem Anlegen über die Sammlungs-API)
// Empfänger: Profile der Familie (keine Gäste), eingeschränkt auf "sichtbar" und die Kasse
// ---------------------------------------------------------------------------------------------
function documentCreated(rec, auth) {
    if (!rec || !auth) return;
    const familyId = getStr(rec, "familie");
    if (!familyId || getStr(auth, "familie") !== familyId) return;
    const who = authInfo(auth);
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    let ids = users.filter(u => getStr(u, "rolle") !== "gast" && getStr(u, "rolle") !== "hauptadmin").map(u => u.id);
    const vis = getStr(rec, "sichtbar").split(",").map(x => x.trim()).filter(Boolean);
    if (vis.length) ids = ids.filter(id => vis.indexOf(id) >= 0);
    const kasseId = getStr(rec, "kasse");
    if (kasseId) {
        const info = kasseInfo(familyId, kasseId);
        const allowed = info ? info.userIds : [];
        ids = ids.filter(id => allowed.indexOf(id) >= 0);
    }
    ids = ids.filter(id => id !== who.id);
    if (!ids.length) return;
    const titel = cleanText(getStr(rec, "titel"), 120) || "Dokument";
    record(familyId, who, "dokument", "dokumente", "", "Dokumente", [{
        id: rec.id, t: titel, z: cleanText(getStr(rec, "kategorie"), 40), k: "dokument:" + rec.id,
    }], { an: ids });
}

// ---------------------------------------------------------------------------------------------
// Abruf für die App: Hinweise der letzten 3 Tage, ohne die eigenen - nur, was für dieses Profil
// bestimmt ist; Familien-Hinweise zu Dingen, zu denen das Profil schon eine Push-Nachricht in der
// Glocke hat, entfallen (Schlüssel k)
// ---------------------------------------------------------------------------------------------
function listFor(familyId, userId) {
    if (!familyId) return [];
    if (!ready()) return [];
    const me = String(userId || "");
    const now = Date.now();
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(COL,
            "familie = {:f} && wer != {:w} && updated >= {:s} && (an = '' || an ~ {:me}) && (bis = 0 || bis > {:n})",
            "-updated", 100, 0,
            { f: familyId, w: me, s: pbDate(now - SHOW_MS), me: "," + me + ",", n: now });
    } catch (e) {
        // Rückfall, falls die neuen Felder (noch) fehlen
        try {
            recs = $app.findRecordsByFilter(COL, "familie = {:f} && wer != {:w} && updated >= {:s}", "-updated", 80, 0,
                { f: familyId, w: me, s: pbDate(now - SHOW_MS) });
        } catch (e2) { recs = []; }
    }
    const pushKeys = {};
    recs.forEach(r => {
        if (r.getString("art") !== "push") return;
        readEntries(r).forEach(x => { if (x && x.k) pushKeys[x.k] = 1; });
    });
    const out = [];
    recs.forEach(r => {
        const art = r.getString("art");
        let eintraege = readEntries(r);
        let anzahl = r.getInt("anzahl");
        if (art !== "push") {
            const before = eintraege.length;
            eintraege = eintraege.filter(x => !(x && x.k && pushKeys[x.k]));
            if (!eintraege.length && before) return; // alles schon als persönliche Nachricht da
            anzahl = Math.max(eintraege.length, anzahl - (before - eintraege.length));
        }
        out.push({
            id: r.id,
            art: art,
            ziel: r.getString("ziel"),
            typ: r.getString("typ"),
            wer: r.getString("wer"),
            mitglied: r.getString("mitglied"),
            name: r.getString("name"),
            titel: r.getString("titel"),
            text: getStr(r, "text"),
            link: getStr(r, "link"),
            anzahl: anzahl,
            eintraege: eintraege.slice(0, 12),
            zeit: parseDate(r.getString("updated")),
        });
    });
    return out;
}

module.exports = {
    ensureSchema, afterSave, taskCreated, taskDone, eventCreated, termKey, listFor,
    pushMirror, expenseCreated, kasseDataSaved, documentCreated, COL,
};
