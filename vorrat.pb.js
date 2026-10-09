// pb_hooks/vorrat.pb.js
// Vorrat 2.0: Mindesthaltbarkeit (Push) und Barcode-Abfrage. Die Logik steckt in pinn-vorrat.js.
//
// Routen (nur angemeldet, nicht für Gastkonten):
//   GET  /api/pinn/vorrat/barcode?code=4006381333931   Produktname, Marke, Menge, Kategorie-Hinweis
//                                                      aus Open Food / Beauty / Products / Pet Food Facts
//   POST /api/pinn/vorrat/pruefen                      fällige MHD-Erinnerungen der eigenen Familie jetzt
//                                                      verschicken (die App ruft das nach dem Speichern auf;
//                                                      nur zwischen 9 und 21 Uhr, nichts wird doppelt geschickt)
//
// Zeitplan: stündlich (Minute 41) - die eigentliche Prüfung aller Familien läuft nur einmal am Tag ab 9 Uhr.

cronAdd("pinnVorrat", "41 * * * *", () => {
    try {
        require(`${__hooks}/pinn-vorrat.js`).runReminders({});
    } catch (err) {
        console.log("[Vorrat] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/vorrat/barcode", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { gefunden: false, error: "Für Gastkonten nicht verfügbar." });
    if (!lib.familyOf(e)) return e.json(200, { gefunden: false });
    let code = "";
    try { code = String(e.request.url.query().get("code") || ""); } catch (err) { code = ""; }
    try {
        return e.json(200, require(`${__hooks}/pinn-vorrat.js`).lookupBarcode(code));
    } catch (err) {
        return e.json(200, { gefunden: false, netz: true, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/vorrat/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Für Gastkonten nicht verfügbar." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    try {
        const r = require(`${__hooks}/pinn-vorrat.js`).runReminders({ familyId: familyId });
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
