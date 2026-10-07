// pb_hooks/hinweise.pb.js
// Alles für die 🔔 Glocke (Logik: pinn-hinweise.js).
//
// Beim Start: legt die Sammlung "hinweise" an bzw. ergänzt neue Felder (Sammlungs-API gesperrt,
// Zugriff nur über diese Route).
// Angelegt werden die Hinweise:
//   - bei jeder persönlichen Push-Nachricht (pinn-push.js) - als Hinweis für den Empfänger
//   - nach dem Speichern der Familiendaten (save_family_data.pb.js)
//   - beim Anlegen und Abhaken von Aufgaben (aufgaben.pb.js) und Anlegen von Terminen
//     (create_calendar_event.pb.js)
//   - bei neuen Buchungen (pinn-finanzen.js) und neuen Verträgen/Fahrzeugen (pinn-kassen.js)
//   - bei neuen Dokumenten (Hook unten - Dokumente werden direkt über die Sammlungs-API angelegt)
//
// Route (nur angemeldet, jede Familie sieht nur ihre eigenen Hinweise):
//   GET /api/pinn/hinweise   Hinweise der letzten 3 Tage - ohne die, die man selbst ausgelöst hat,
//                            und nur die, die für das eigene Profil bestimmt sind
//
// Kein Zeitplan - alte Hinweise werden beim Anlegen neuer Hinweise mit aufgeräumt.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-hinweise.js`).ensureSchema();
    } catch (err) {
        console.log("[Hinweise] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/hinweise", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, { hinweise: require(`${__hooks}/pinn-hinweise.js`).listFor(e.auth.getString("familie"), e.auth.id) });
    } catch (err) {
        return e.json(200, { hinweise: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Neues Dokument: Hinweis für alle, die es sehen dürfen (erst NACH dem erfolgreichen Speichern)
onRecordCreateRequest((e) => {
    e.next();
    try {
        if (e.auth) require(`${__hooks}/pinn-hinweise.js`).documentCreated(e.record, e.auth);
    } catch (err) {
        console.log("[Hinweise] Dokument: " + err.message);
    }
}, "dokumente");
