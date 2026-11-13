// pb_hooks/zeit.pb.js
// Time zone per profile (since 1.150.0). The logic lives in pinn-zeit.js.
//
//   GET  /api/pinn/zeit                          -> { zone, bis, standard }  (what the server knows about this profile)
//   POST /api/pinn/zeit  { zone, wechsel, bis }  -> { zone, bis, standard }  (the app sends the time zone of the device
//                                                  with a table of its UTC offsets; see pinn-zeit.js)
// Guests have no time zone of their own (they never receive reminders).

routerAdd("GET", "/api/pinn/zeit", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-zeit.js`).view(e.auth.id));
    } catch (err) {
        return e.json(200, { zone: "Europe/Berlin", bis: 0, standard: true, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zeit", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-zeit.js`).setForUser(e.auth.id, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
