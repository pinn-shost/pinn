// pb_hooks/familie-geburtstag.pb.js
// Birthdays in the family (date of birth from the emergency pass). The logic lives in
// pinn-familie-geburtstag.js.
//
// Schedule: every 5 minutes - push "... has a birthday today" to the other profiles of the family, at the
// time of their daily overview (default 07:00), only once per profile and day.
//
// Routes (signed in only):
//   GET  /api/pinn/geburtstag          { heute, gesehen: [<member ID>, ...] }  birthday animation already shown?
//   POST /api/pinn/geburtstag/gesehen  { mitglied }                            animation shown (all devices)

cronAdd("pinnFamilieGeburtstag", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-familie-geburtstag.js`).runCron();
    } catch (err) {
        console.log("[Geburtstag] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Geburtstage in der Familie: " + err.message); } catch (e2) { /* ignore */ }
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
