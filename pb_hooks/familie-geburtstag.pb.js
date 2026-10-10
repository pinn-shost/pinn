// pb_hooks/familie-geburtstag.pb.js
// Geburtstage in der Familie (Geburtsdatum aus dem Notfallpass). Die Logik steckt in
// pinn-familie-geburtstag.js.
//
// Zeitplan: alle 5 Minuten – Push „… hat heute Geburtstag“ an die anderen Profile der Familie, zur
// Uhrzeit ihrer Tagesübersicht (Standard 07:00), je Profil und Tag nur einmal.
//
// Routen (nur angemeldet):
//   GET  /api/pinn/geburtstag          { heute, gesehen: [<Mitglied-ID>, …] }  Geburtstags-Animation schon gezeigt?
//   POST /api/pinn/geburtstag/gesehen  { mitglied }                            Animation gezeigt (alle Geräte)

cronAdd("pinnFamilieGeburtstag", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-familie-geburtstag.js`).runCron();
    } catch (err) {
        console.log("[Geburtstag] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Geburtstage in der Familie: " + err.message); } catch (e2) { /* egal */ }
    }
});

routerAdd("GET", "/api/pinn/geburtstag", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-familie-geburtstag.js`).stateFor(e.auth));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/geburtstag/gesehen", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, Object.assign({ success: true }, require(`${__hooks}/pinn-familie-geburtstag.js`).markSeen(e.auth, body.mitglied)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
