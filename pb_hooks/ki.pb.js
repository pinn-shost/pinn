// pb_hooks/ki.pb.js
// AI evaluation with Google Gemini (recipes, meter readings, timetables, parent letters). The logic lives in pinn-ki.js.
//
// Routes (signed-in profiles of a family only):
//   GET  /api/pinn/ki/status   { aktiv, modell } - is a Gemini key entered on the server?
//   POST /api/pinn/ki/rezept   { text, dateien: [{ mime, daten }], kategorien[], geraete[] }
//                              -> { rezept: { title, ingredients, steps, servings, prepTime, cookTime,
//                                              categories, tools, bild, quelle } }
//                              Error -> { error } with status 4xx/5xx; the app then evaluates
//                              by itself as before.
//   POST /api/pinn/ki/zaehler  { dateien: [{ mime, daten }], art, einheit, letzter, nummer }
//                              -> { zaehler: { stand, nummer, sicher, hinweis } }  (menu "House" → Meters;
//                              not for guest accounts)
//   POST /api/pinn/ki/stundenplan  { dateien: [{ mime, daten }], kind, klasse }
//                              -> { stundenplan: { zeiten: [{ von, bis }], stunden: [{ tag, stunde, fach, raum }], hinweis } }
//   POST /api/pinn/ki/elternbrief  { dateien: [{ mime, daten }], heute, kinder[], einrichtungen[] }
//                              -> { brief: { titel, absender, aktion, frist, betrag, zusammenfassung,
//                                            schliesstage: [{ von, bis, grund }], hinweis } }
//                              (Family → School & daycare; not for guest accounts)
// The Gemini key is only in the .env (PINN_GEMINI_KEY) and is never delivered.

routerAdd("GET", "/api/pinn/ki/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-ki.js`).status());
    } catch (err) {
        return e.json(200, { aktiv: false, modell: "", error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ki/rezept", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-ki.js`);
    if (!lib.isAvailable()) return e.json(503, { error: "Die KI ist auf dem Server nicht eingerichtet." });
    if (!e.auth.getString("familie")) return e.json(403, { error: "Nur für Profile einer Familie." });
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
    const started = Date.now();
    try {
        const rezept = lib.analyzeRecipe(body);
        console.log("[KI] Rezept \"" + rezept.title + "\" ausgewertet (" + rezept.modell + ", "
            + Math.round((Date.now() - started) / 100) / 10 + " s, " + rezept.ingredients.length + " Zutaten, "
            + rezept.steps.length + " Schritte).");
        return e.json(200, { rezept: rezept });
    } catch (err) {
        console.log("[KI] Rezept-Auswertung fehlgeschlagen: " + err.message);
        return e.json(422, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ki/zaehler", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-ki.js`);
    if (!lib.isAvailable()) return e.json(503, { error: "Die KI ist auf dem Server nicht eingerichtet." });
    if (!e.auth.getString("familie") || e.auth.getString("rolle") === "gast") return e.json(403, { error: "Nur für Profile einer Familie." });
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
    try {
        const z = lib.analyzeMeter(body);
        console.log("[KI] Zählerstand abgelesen (" + z.modell + ", sicher " + Math.round(z.sicher * 100) + " %).");
        return e.json(200, { zaehler: z });
    } catch (err) {
        console.log("[KI] Zählerstand nicht lesbar: " + err.message);
        return e.json(422, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ki/stundenplan", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-ki.js`);
    if (!lib.isAvailable()) return e.json(503, { error: "Die KI ist auf dem Server nicht eingerichtet." });
    if (!e.auth.getString("familie") || e.auth.getString("rolle") === "gast") return e.json(403, { error: "Nur für Profile einer Familie." });
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
    try {
        const r = lib.analyzeTimetable(body);
        console.log("[KI] Stundenplan ausgelesen (" + r.modell + ", " + r.stunden.length + " Stunden).");
        return e.json(200, { stundenplan: r });
    } catch (err) {
        console.log("[KI] Stundenplan nicht lesbar: " + err.message);
        return e.json(422, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ki/elternbrief", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-ki.js`);
    if (!lib.isAvailable()) return e.json(503, { error: "Die KI ist auf dem Server nicht eingerichtet." });
    if (!e.auth.getString("familie") || e.auth.getString("rolle") === "gast") return e.json(403, { error: "Nur für Profile einer Familie." });
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
    try {
        const r = lib.analyzeLetter(body);
        console.log("[KI] Elternbrief ausgelesen (" + r.modell + ", " + r.schliesstage.length + " Schließtage).");
        return e.json(200, { brief: r });
    } catch (err) {
        console.log("[KI] Elternbrief nicht lesbar: " + err.message);
        return e.json(422, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
