// pb_hooks/gesundheit.pb.js
// Health page per person (since 1.149.0). The logic lives in pinn-gesundheit.js.
//
//   GET  /api/pinn/gesundheit                      -> { personen: [{ mitglied, kind, daten, updated }], ich }
//        only the members the signed-in profile may see (own member; for adults also the children)
//   POST /api/pinn/gesundheit  { mitglied, daten, expected? }
//        saves the health data of one member; with "expected" (updated of the last read) a changed record
//        answers 409 { conflict, updated, daten } so the app can merge and send again.
// Guests get nothing.
//
// Schedule (since 1.149.1): every 5 minutes - push reminders (medication, drinking, hand washing) to the profile
// of the person themself, as set in their health data. The logic lives in pinn-gesundheit.js#runCron.

cronAdd("pinnGesundheit", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-gesundheit.js`).runCron();
    } catch (err) {
        console.log("[Gesundheit] Schedule error: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Gesundheit: " + err.message); } catch (e2) { /* ignore */ }
    }
});

routerAdd("GET", "/api/pinn/gesundheit", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-gesundheit.js`).list(e));
    } catch (err) {
        return e.json(200, { personen: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/gesundheit", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const r = require(`${__hooks}/pinn-gesundheit.js`).save(e, e.requestInfo().body || {});
        return e.json(r.status, r.body);
    } catch (err) {
        return e.json(err.status || 400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
