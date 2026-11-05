// pb_hooks/vorrat.pb.js
// Pantry 2.0: best-before date (push) and barcode lookup. The logic lives in pinn-vorrat.js.
//
// Routes (signed in only, not for guest accounts):
//   GET  /api/pinn/vorrat/barcode?code=4006381333931   product name, brand, quantity, category hint
//                                                      from Open Food / Beauty / Products / Pet Food Facts
//   POST /api/pinn/vorrat/pruefen                      send due BBD reminders of the own family now
//                                                      (the app calls this after saving;
//                                                      only between 9 a.m. and 9 p.m., nothing is sent twice)
//
// Schedule: hourly (minute 41) - the actual check of all families only runs once a day from 9 a.m.

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
