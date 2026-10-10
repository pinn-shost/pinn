// pb_hooks/pinn-finanzen.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Finanzen: Ausgaben und Einnahmen (Einnahme = negativer Betrag) liegen in einer eigenen PocketBase-Sammlung "ausgaben" (nicht in
// familien_daten), damit der Familien-Datensatz nicht mit jedem Einkauf wächst.
// Budget, Kategorien und regelmäßige Ausgaben sind klein und liegen weiter in familien_daten
// (Schlüssel "finance") - sie werden dort wie alles andere zwischen den Geräten abgeglichen.
//
// Schonend für CPU und Speicher:
//  - nur einzelne Datenbank-Zugriffe je Aktion, kein Zeitplan, keine Hintergrundarbeit
//  - Auswertungen (Wochen/Monate/Jahre, Kategorien) rechnet die App selbst
//  - die App erzeugt die ID eines neuen Eintrags selbst; ein erneut gesendeter Eintrag (z. B. nach
//    einem Verbindungsabbruch im Laden) wird daher nur aktualisiert, nie doppelt angelegt
//
// Felder der Sammlung "ausgaben":
//   betrag (Euro, 2 Nachkommastellen; negativ = Einnahme), datum (JJJJ-MM-TT), kategorie (Kategorie-ID aus der App),
//   titel, laden, liste (ID der Einkaufsliste, falls aus dem Einkauf gebucht),
//   artikel (gekaufte Artikel, eine Zeile je Artikel), bezahlt_von (ID des Familienmitglieds),
//   notiz, erstellt_von (Profil-ID), familie (Relation - jede Familie sieht nur ihre eigenen),
//   bezug (Zuordnung: "spar:<Positions-ID>" bzw. "depot:<Depot-ID>" bei Kategorie Sparen,
//          "kind:<Mitglied-ID>" bei Kategorie Kinder, "fahrzeug:<Fahrzeug-ID>" bei Einträgen aus „Fahrzeuge“),
//   kasse (ID der Kasse, siehe pinn-kassen.js - leer = Haushaltskasse),
//   aufteilung (Mitglied-IDs, auf die eine Ausgabe in einer geteilten Kasse aufgeteilt wird; leer = alle;
//               bei einem Ausgleich (Kategorie "ausgleich") die Person, die das Geld bekommen hat)
// Zugriff nur über die angemeldeten Routen in finanzen.pb.js (Sammlungs-API gesperrt).
// Jedes Profil sieht nur die Buchungen der Kassen, in denen es Mitglied ist.
// Neue Buchungen erscheinen bei den übrigen Mitgliedern der Kasse unter der 🔔 Glocke (pinn-hinweise.js).

const AUSGABEN = "ausgaben";

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
function familyRelationDef(famCol) {
    return { name: "familie", type: "relation", collectionId: famCol.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false };
}

// Sammlung anlegen, falls sie fehlt; Feld "familie" nachrüsten, falls die Sammlung vor der
// Familien-Sammlung entstanden ist.
function ensureSchema() {
    const fam = findCol("familien");
    let col = findCol(AUSGABEN);
    if (!col) {
        try {
            const fields = [
                { name: "betrag", type: "number", required: false },
                { name: "datum", type: "text", max: 10 },
                { name: "kategorie", type: "text", max: 60 },
                { name: "titel", type: "text", max: 200 },
                { name: "laden", type: "text", max: 100 },
                { name: "liste", type: "text", max: 60 },
                { name: "artikel", type: "text", max: 6000 },
                { name: "bezahlt_von", type: "text", max: 100 },
                { name: "notiz", type: "text", max: 1000 },
                { name: "erstellt_von", type: "text", max: 30 },
                { name: "bezug", type: "text", max: 60 },
                { name: "kasse", type: "text", max: 30 },
                { name: "aufteilung", type: "text", max: 600 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ];
            if (fam) fields.push(familyRelationDef(fam));
            $app.save(new Collection({
                type: "base",
                name: AUSGABEN,
                fields: fields,
                indexes: [
                    "CREATE INDEX `idx_ausgaben_datum` ON `" + AUSGABEN + "` (`datum`)",
                    "CREATE INDEX `idx_ausgaben_kasse` ON `" + AUSGABEN + "` (`kasse`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Finanzen] Sammlung \"" + AUSGABEN + "\" angelegt.");
        } catch (err) {
            console.log("[Finanzen] Konnte Sammlung nicht anlegen: " + err.message);
        }
        return;
    }
    if (fam && !hasField(col, "familie")) {
        try {
            col.fields.add(makeField(familyRelationDef(fam)));
            $app.save(col);
            console.log("[Finanzen] Feld \"familie\" in \"" + AUSGABEN + "\" ergänzt.");
        } catch (err) {
            console.log("[Finanzen] Feld \"familie\" nicht anlegbar: " + err.message);
        }
    }
    // Zuordnung zu Sparziel bzw. Kind (Sparen / Taschengeld) nachrüsten
    if (!hasField(col, "bezug")) {
        try {
            col = findCol(AUSGABEN);
            col.fields.add(makeField({ name: "bezug", type: "text", max: 60 }));
            $app.save(col);
            console.log("[Finanzen] Feld \"bezug\" in \"" + AUSGABEN + "\" ergänzt.");
        } catch (err) {
            console.log("[Finanzen] Feld \"bezug\" nicht anlegbar: " + err.message);
        }
    }
    // Kassen: Zuordnung der Buchung und Aufteilung nachrüsten
    [{ name: "kasse", type: "text", max: 30 }, { name: "aufteilung", type: "text", max: 600 }].forEach(def => {
        col = findCol(AUSGABEN);
        if (!col || hasField(col, def.name)) return;
        try {
            col.fields.add(makeField(def));
            if (def.name === "kasse") col.indexes.push("CREATE INDEX `idx_ausgaben_kasse` ON `" + AUSGABEN + "` (`kasse`)");
            $app.save(col);
            console.log("[Finanzen] Feld \"" + def.name + "\" in \"" + AUSGABEN + "\" ergänzt.");
        } catch (err) {
            console.log("[Finanzen] Feld \"" + def.name + "\" nicht anlegbar: " + err.message);
        }
    });
}

function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function isRecordId(s) { return /^[a-z0-9]{15}$/.test(String(s || "")); }
function cleanLink(v) {
    const s = String(v == null ? "" : v).trim();
    return /^(spar|kind|depot|fahrzeug):[A-Za-z0-9_-]{1,50}$/.test(s) ? s : "";
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function cleanSplit(v) {
    const arr = Array.isArray(v) ? v : String(v == null ? "" : v).split(",");
    return arr.map(x => String(x || "").trim()).filter((x, i, a) => /^[A-Za-z0-9_-]{1,40}$/.test(x) && a.indexOf(x) === i).slice(0, 30);
}
function kassen() { return require(`${__hooks}/pinn-kassen.js`); }
// Kasse einer Buchung (alte Buchungen ohne Kasse gehören zur Haushaltskasse)
function kasseOf(rec, acc) { return rec.getString("kasse") || acc.haushaltAll || ""; }

function toClient(r) {
    const artikel = r.getString("artikel");
    return {
        id: r.id,
        amount: Math.round(r.getFloat("betrag") * 100) / 100,
        date: r.getString("datum"),
        category: r.getString("kategorie"),
        title: r.getString("titel"),
        store: r.getString("laden"),
        listId: r.getString("liste"),
        items: artikel ? artikel.split("\n").filter(Boolean) : [],
        paidBy: r.getString("bezahlt_von"),
        note: r.getString("notiz"),
        createdBy: r.getString("erstellt_von"),
        link: r.getString("bezug"),
        kasse: r.getString("kasse"),
        split: cleanSplit(r.getString("aufteilung")),
        created: r.getString("created"),
    };
}

// Alle Buchungen der Kassen, in denen das Profil Mitglied ist
function listAll(user) {
    const familyId = user ? user.getString("familie") : "";
    if (!familyId) return [];
    if (!findCol(AUSGABEN)) ensureSchema();
    const acc = kassen().access(user);
    if (!acc.ids.length) return [];
    const params = { f: familyId };
    const parts = acc.ids.map((id, i) => { params["k" + i] = id; return "kasse = {:k" + i + "}"; });
    if (acc.haushalt) parts.push("kasse = ''");
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUSGABEN, "familie = {:f} && (" + parts.join(" || ") + ")", "-datum", 0, 0, params); } catch (e) { recs = []; }
    return recs.map(r => {
        const c = toClient(r);
        if (!c.kasse) c.kasse = acc.haushalt;
        return c;
    });
}

// Legt eine Ausgabe/Einnahme an oder ändert sie (die ID vergibt die App).
// body: {id, amount (negativ = Einnahme), date, category, title?, store?, listId?, items?, paidBy?, note?, link?, kasse?, split?}
// link und split werden nur geändert, wenn sie mitgeschickt werden (ältere App-Stände schicken sie nicht).
// kasse: Kasse, in die gebucht wird (muss eine eigene sein); fehlt sie, landet die Buchung in der
// Haushaltskasse, sonst in der eigenen bzw. ersten Kasse und ohne Kasse in der Familien-Gruppe.
function saveExpense(body, user) {
    const familyId = user ? user.getString("familie") : "";
    const actorUserId = user ? user.id : "";
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    const acc = kassen().access(user);
    if (!acc.ids.length) throw new Error("Du hast keinen Zugriff auf die Finanzen.");
    if (!findCol(AUSGABEN)) ensureSchema();
    const id = String(body.id || "");
    if (!isRecordId(id)) throw new Error("Ungültige ID.");
    const amount = Math.round(Number(body.amount) * 100) / 100;
    // Negativer Betrag = Einnahme (in der App: Minus vor der Summe)
    if (!isFinite(amount) || amount === 0 || Math.abs(amount) > 1000000) throw new Error("Bitte einen gültigen Betrag eingeben.");
    const date = String(body.date || "");
    if (!isIsoDate(date)) throw new Error("Bitte ein Datum angeben.");
    let category = String(body.category || "");
    if (!/^[a-z0-9_-]{1,60}$/.test(category)) category = "sonstiges";
    const items = Array.isArray(body.items) ? body.items.map(x => cleanText(x, 100)).filter(Boolean).slice(0, 200) : [];

    let rec = null;
    try { rec = $app.findRecordById(AUSGABEN, id); } catch (e) { rec = null; }
    let kasse = String(body.kasse || "");
    if (kasse && acc.ids.indexOf(kasse) < 0) throw new Error("Für diese Kasse hast du keine Berechtigung.");
    const isNew = !rec;
    if (rec) {
        if (rec.getString("familie") !== familyId) throw new Error("Ausgabe nicht gefunden.");
        if (acc.ids.indexOf(kasseOf(rec, acc)) < 0) throw new Error("Ausgabe nicht gefunden.");
        if (!kasse) kasse = kasseOf(rec, acc);
    } else {
        rec = new Record($app.findCollectionByNameOrId(AUSGABEN));
        rec.set("id", id);
        rec.set("familie", familyId);
        rec.set("erstellt_von", String(actorUserId || ""));
    }
    rec.set("betrag", amount);
    rec.set("datum", date);
    rec.set("kategorie", category);
    rec.set("titel", cleanText(body.title, 200));
    rec.set("laden", cleanText(body.store, 100));
    rec.set("liste", cleanText(body.listId, 60));
    rec.set("artikel", items.join("\n").slice(0, 6000));
    rec.set("bezahlt_von", cleanText(body.paidBy, 100));
    rec.set("notiz", String(body.note || "").trim().slice(0, 1000));
    if (body.link !== undefined && hasField(rec.collection(), "bezug")) rec.set("bezug", cleanLink(body.link));
    if (!kasse) kasse = kassen().defaultKasse ? kassen().defaultKasse(acc) : (acc.haushalt || acc.privat || acc.ids[0]);
    if (hasField(rec.collection(), "kasse")) rec.set("kasse", kasse);
    if (body.split !== undefined && hasField(rec.collection(), "aufteilung")) rec.set("aufteilung", cleanSplit(body.split).join(","));
    $app.save(rec);
    if (isNew && category === "ausgleich") notifySettlement(user, rec);
    // Übrige Mitglieder der Kasse sehen die neue Buchung unter der 🔔 Glocke (pinn-hinweise.js)
    if (isNew) {
        try { require(`${__hooks}/pinn-hinweise.js`).expenseCreated(rec, user); }
        catch (e) { console.log("[Hinweise] Buchung: " + e.message); }
    }
    return toClient(rec);
}

// Betrag im Format, das ein Profil in pinn. eingestellt hat (Einstellungen → Sprache & Region: Währung,
// Symbol davor/dahinter, Dezimal- und Tausendertrenner – liegen mit dem persönlichen Design im Profil).
// Ohne Angabe wie bisher: 1.234,56 €
function formatBetrag(amount, userId) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign($app.findRecordById("benutzer", userId)).werte || {}; } catch (e) { w = {}; }
    const str = (v, fb) => (typeof v === "string" && v.length && v.length <= 8) ? v : fb;
    const sym = str(w.geldSym, "€"), dez = str(w.geldDez, ","), tsd = typeof w.geldTsd === "string" && w.geldTsd.length <= 2 ? w.geldTsd : ".";
    const nk = (typeof w.geldNk === "number" && w.geldNk >= 0 && w.geldNk <= 3) ? Math.round(w.geldNk) : 2;
    const vorne = w.geldVorne === true;
    const neg = amount < 0;
    const fixed = Math.abs(amount).toFixed(nk).split(".");
    const ganz = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, tsd);
    const zahl = ganz + (nk ? dez + fixed[1] : "");
    const einzeln = sym.length > 1 && /[A-Za-z]$/.test(sym); // „CHF“, „kr“ → mit Leerzeichen
    const mitSym = vorne ? sym + (einzeln ? " " : "") + zahl : zahl + " " + sym;
    return (neg ? "-" : "") + mitSym;
}

// Ausgleich in einer geteilten Kasse: die Person, die das Geld bekommt, per Push benachrichtigen
function notifySettlement(user, rec) {
    try {
        const toMember = cleanSplit(rec.getString("aufteilung"))[0];
        if (!toMember) return;
        const target = $app.findFirstRecordByFilter("benutzer", "familie = {:f} && mitglied = {:m}", { f: rec.getString("familie"), m: toMember });
        if (!target || target.id === user.id) return;
        const amount = Math.round(rec.getFloat("betrag") * 100) / 100;
        const euro = formatBetrag(amount, target.id);
        require(`${__hooks}/pinn-push.js`).notifyUser(target.id, {
            titel: "💸 Ausgleich: " + euro,
            text: (rec.getString("titel") || "Ein Ausgleich") + " wurde für dich eingetragen.",
            url: "/?kasse=" + encodeURIComponent(rec.getString("kasse")) + "&ausgabe=" + encodeURIComponent(rec.id),
            tag: "ausgleich-" + rec.id,
            urgency: "normal",
        });
    } catch (e) { /* Push ist nur ein Extra */ }
}

// Löscht eine Ausgabe aus einer eigenen Kasse. Ist sie schon weg, gilt das als erledigt.
function removeExpense(user, id) {
    const familyId = user ? user.getString("familie") : "";
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    let rec = null;
    try { rec = $app.findRecordById(AUSGABEN, String(id || "")); } catch (e) { return; }
    if (rec.getString("familie") !== familyId) throw new Error("Ausgabe nicht gefunden.");
    const acc = kassen().access(user);
    if (acc.ids.indexOf(kasseOf(rec, acc)) < 0) throw new Error("Ausgabe nicht gefunden.");
    $app.delete(rec);
}

module.exports = { ensureSchema, listAll, saveExpense, removeExpense };
