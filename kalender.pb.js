// pb_hooks/kalender.pb.js
// Eigene Kalender je Profil (Einstellungen → Kalender → Eigene Kalender). Die Logik steckt in pinn-kalender.js.
//
// Beim Start: legt die gesperrten Sammlungen "kalender_eigene" und "kalender_termine" an.
//
// Angemeldet (Profile einer Familie):
//   GET  /api/pinn/kalender/eigene            { kalender: [{ id, name, farbe, geteilt, mein, von, darf }] }
// Angemeldet, keine Gäste:
//   POST /api/pinn/kalender/eigene/speichern  { id?, name, farbe, geteilt }  -> { kalender, id }
//   POST /api/pinn/kalender/eigene/loeschen   { id }                         -> { kalender }  (mit allen Terminen)
//
// Persönliche Konten je Profil (iCloud/Google, pinn-kalender-konten.js), keine Gäste:
//   GET  /api/pinn/kalender/konten?origin=…        { apple: {verbunden, konto, fehler},
//                                                    google: {verfuegbar, verbunden, konto, fehler, client, weiterleitung, einrichtbar} }
//   POST /api/pinn/kalender/konten/apple           { appleId, appPassword }  -> { konten, extern }
//   POST /api/pinn/kalender/konten/liste           { art }                   -> { extern: [{name, href, nurLesen, ziel, id}] }
//   POST /api/pinn/kalender/konten/auswahl         { art, auswahl: [{href, ziel: "ich"|"familie"|""}] } -> { kalender, hinweis }
//   POST /api/pinn/kalender/konten/google/start    { origin }                -> { url }      (Rückkehr über /api/pinn/google/callback)
//   POST /api/pinn/kalender/konten/trennen         { art }                   -> { konten, kalender }
//   POST /api/pinn/kalender/konten/google-client   { clientId, clientSecret, origin } -> { konten }  (nur Admins, nur ohne .env-Eintrag)
// Abgleich der verknüpften Kalender: Cron alle 15 Minuten (versetzt zum Familien-Abgleich) und bei
// „Jetzt aktualisieren“ (trigger_sync.pb.js).
//
// Die Termine selbst laufen über die bekannten Termin-Routen (create_/update_/delete_calendar_event.pb.js,
// get_calendar_event_raw.pb.js); die Kalenderdatei /api/pinn/kalender (benutzer.pb.js) enthält sie.
//
// Aufräumen: wird ein Profil gelöscht, verschwinden seine privaten Kalender (geteilte bleiben der
// Familie erhalten); wird eine Familie gelöscht, alle ihre eigenen Kalender.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-kalender.js`).ensureSchema();
    } catch (err) {
        console.log("[Kalender] Einrichtung fehlgeschlagen: " + err.message);
    }
});

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

// Verknüpfte Kalender (iCloud/Google) aller Profile abgleichen – versetzt zum Familien-Cron (*/15)
cronAdd("pinnEigeneKalenderSync", "7,22,37,52 * * * *", () => {
    try { require(`${__hooks}/pinn-kalender.js`).syncAllLinked(); } catch (err) { console.log("[Kalender] Abgleich verknüpfter Kalender fehlgeschlagen: " + err.message); }
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
