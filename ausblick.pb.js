// pb_hooks/ausblick.pb.js
// Wochenvorschau und Monatsausblick Finanzen. Die Logik steckt in pinn-ausblick.js, die Inhalte
// rechnet die App selbst (index.html, Abschnitt „Ausblick“).
//
// Routen (nur angemeldet):
//   GET  /api/pinn/ausblick              aktuelle Woche/Monat, „schon angesehen“ und Push-Schalter des Profils
//   POST /api/pinn/ausblick/gesehen      {art: 'woche'|'monat', key}  Banner auf allen Geräten ausblenden
//   POST /api/pinn/ausblick/push         {woche?: bool, monat?: bool} persönliche Push-Schalter
//
// Zeitplan: alle 10 Minuten – arbeitet aber nur sonntags bzw. am Monatsletzten zwischen 18 und 22 Uhr,
// und dann nur einmal (Merker in pb_data/pinn_ausblick.json).

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-ausblick.js`).pruneUsers(); } catch (err) { /* egal */ }
});

cronAdd("pinnAusblick", "*/10 * * * *", () => {
    try {
        require(`${__hooks}/pinn-ausblick.js`).runCron();
    } catch (err) {
        console.log("[Ausblick] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Ausblick (Wochenvorschau/Monatsausblick): " + err.message); } catch (e2) { /* egal */ }
    }
});

routerAdd("GET", "/api/pinn/ausblick", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-ausblick.js`).stateFor(e.auth));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ausblick/gesehen", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, Object.assign({ success: true }, require(`${__hooks}/pinn-ausblick.js`).markSeen(e.auth, String(body.art || ""), body.key)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ausblick/push", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, Object.assign({ success: true }, require(`${__hooks}/pinn-ausblick.js`).savePush(e.auth, body)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
