// pb_hooks/wobistdu.pb.js
// „Wo bist du?“ – eine Person nach ihrem Standort fragen. Die Logik steckt in pinn-wobistdu.js.
//
// Routen (nur angemeldet):
//   GET  /api/pinn/wobistdu          eigene Fragen (mit Antworten) und Fragen an mich, letzte 24 Std.
//   POST /api/pinn/wobistdu          { an: <Mitglied-ID>, name, anName }   fragen (Push an die Person)
//   POST /api/pinn/wobistdu/antwort  { id, lat, lon, genau } oder { id, text } antworten (Push zurück)

routerAdd("GET", "/api/pinn/wobistdu", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-wobistdu.js`).listFor(e));
    } catch (err) {
        return e.json(200, { anfragen: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/wobistdu", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-wobistdu.js`).ask(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/wobistdu/antwort", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-wobistdu.js`).answer(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
