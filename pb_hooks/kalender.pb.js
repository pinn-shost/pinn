// pb_hooks/kalender.pb.js
// Own calendars per profile (Settings → Calendar → Own calendars). The logic lives in pinn-kalender.js.
//
// On start (via pinn-schema.js): creates the locked collections "kalender_eigene" and "kalender_termine".
//
// Signed in (profiles of a family):
//   GET  /api/pinn/kalender/eigene            { kalender: [{ id, name, farbe, geteilt, mein, von, darf }] }
// Signed in, no guests:
//   POST /api/pinn/kalender/eigene/speichern  { id?, name, farbe, geteilt }  -> { kalender, id }
//   POST /api/pinn/kalender/eigene/loeschen   { id }                         -> { kalender }  (with all events)
//
// Personal accounts per profile (iCloud/Google, pinn-kalender-konten.js), no guests:
//   GET  /api/pinn/kalender/konten?origin=…        { apple: {verbunden, konto, fehler},
//                                                    google: {verfuegbar, verbunden, konto, fehler, client, weiterleitung, einrichtbar} }
//   POST /api/pinn/kalender/konten/apple           { appleId, appPassword }  -> { konten, extern }
//   POST /api/pinn/kalender/konten/liste           { art }                   -> { extern: [{name, href, nurLesen, ziel, id}] }
//   POST /api/pinn/kalender/konten/auswahl         { art, auswahl: [{href, ziel: "ich"|"familie"|""}] } -> { kalender, hinweis }
//   POST /api/pinn/kalender/konten/google/start    { origin }                -> { url }      (return via /api/pinn/google/callback)
//   POST /api/pinn/kalender/konten/trennen         { art }                   -> { konten, kalender }
//   POST /api/pinn/kalender/konten/google-client   { clientId, clientSecret, origin } -> { konten }  (admins only, only without an .env entry)
// Sync of the linked calendars: cron every 15 minutes (offset from the family sync) and on
// "Refresh now" (trigger_sync.pb.js).
//
// The events themselves run via the known event routes (create_/update_/delete_calendar_event.pb.js,
// get_calendar_event_raw.pb.js); the calendar file /api/pinn/kalender (benutzer.pb.js) contains them.
//
// Clean-up: if a profile is deleted, its private calendars disappear (shared ones stay with the
// family); if a family is deleted, all its own calendars.

onRecordAfterDeleteSuccess((e) => {
    try { require(`${__hooks}/pinn-kalender.js`).cleanupUser(e.record.id); } catch (err) { console.log("[Kalender] Aufräumen (Profil) fehlgeschlagen: " + err.message); }
    e.next();
}, "benutzer");

onRecordAfterDeleteSuccess((e) => {
    try { require(`${__hooks}/pinn-kalender.js`).cleanupFamily(e.record.id); } catch (err) { console.log("[Kalender] Aufräumen (Familie) fehlgeschlagen: " + err.message); }
    e.next();
}, "familien");

routerAdd("GET", "/api/pinn/kalender/eigene", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, { kalender: require(`${__hooks}/pinn-kalender.js`).listFor(e) });
    } catch (err) {
        return e.json(200, { kalender: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/eigene/speichern", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).saveCalendar(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/eigene/loeschen", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).deleteCalendar(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Sync linked calendars (iCloud/Google) of all profiles - offset from the family cron (*/15)
cronAdd("pinnEigeneKalenderSync", "7,22,37,52 * * * *", () => {
    try { require(`${__hooks}/pinn-kalender.js`).syncAllLinked(); } catch (err) {
        console.log("[Kalender] Abgleich verknüpfter Kalender fehlgeschlagen: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("sync", "Abgleich verknüpfter Kalender fehlgeschlagen: " + err.message); } catch (e2) { /* ignore */ }
    }
});

routerAdd("GET", "/api/pinn/kalender/konten", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        let origin = "";
        try { origin = String((e.requestInfo().query || {}).origin || ""); } catch (err) { origin = ""; }
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).accountStatus(e, origin));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/apple", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).connectApple(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/liste", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).accountCalendars(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/google/start", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).startGoogle(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/trennen", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).disconnect(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/auswahl", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).saveSelection(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kalender/konten/google-client", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-kalender.js`).saveGoogleClient(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
