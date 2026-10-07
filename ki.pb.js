// pb_hooks/ki.pb.js
// KI-Auswertung von Rezepten mit Google Gemini. Die Logik steckt in pinn-ki.js.
//
// Routen (nur angemeldete Profile einer Familie):
//   GET  /api/pinn/ki/status   { aktiv, modell } - ist auf dem Server ein Gemini-Schlüssel eingetragen?
//   POST /api/pinn/ki/rezept   { text, dateien: [{ mime, daten }], kategorien[], geraete[] }
//                              -> { rezept: { title, ingredients, steps, servings, prepTime, cookTime,
//                                              categories, tools, bild, quelle } }
//                              Fehler -> { error } mit Status 4xx/5xx; die App wertet dann wie bisher
//                              selbst aus.
// Der Gemini-Schlüssel steht nur in der .env (PINN_GEMINI_KEY) und wird nie ausgeliefert.

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
