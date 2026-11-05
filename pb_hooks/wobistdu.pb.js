// pb_hooks/wobistdu.pb.js
// "Where are you?" - ask a person for their location. The logic lives in pinn-wobistdu.js.
//
// Routes (signed in only):
//   GET  /api/pinn/wobistdu          own questions (with answers) and questions to me, last 24 hours
//   POST /api/pinn/wobistdu          { an: <member ID>, name, anName }   ask (push to the person)
//   POST /api/pinn/wobistdu/antwort  { id, lat, lon, genau } or { id, text } answer (push back)

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
