// pb_hooks/create_calendar_event.pb.js
// Legt einen neuen Termin WIRKLICH im Kalender an (nicht nur bei uns in der App) - in iCloud oder,
// bei Kalendern mit dem Zusatz " (Google)", im verbundenen Google-Konto (Android). Erwartet POST mit
// den Termin-Feldern aus dem "Termin hinzufügen"-Formular im Body. Löst danach sofort einen neuen
// Sync aus, damit der neue Termin gleich in der Kalenderdatei auftaucht.
// Eigene Kalender (Name "pinn:<id>", siehe pinn-kalender.js) speichern den Termin auf diesem Server.
// Zugewiesene Familienmitglieder (außer der Person, die den Termin anlegt) bekommen eine
// Push-Benachrichtigung, sofern sie das in ihren Einstellungen nicht abgeschaltet haben.
// Es werden immer die Zugangsdaten der EIGENEN Familie verwendet (calendarSync.createEventForFamily).
// Die übrige Familie sieht den neuen Termin außerdem unter der Glocke (pinn-hinweise.js) - außer bei
// Terminen in privaten Kalendern ("Nur für mich").

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/create-calendar-event", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    const familyId = lib.familyOf(e);
    const body = e.requestInfo().body;

    if (!body.title || !body.calendarName || !body.startDate || !body.endDate) {
        return e.json(400, { error: "Titel, Kalender, Start- und Enddatum sind erforderlich." });
    }

    let privat = false;
    if (/^pinn:[a-z0-9]{15}$/.test(String(body.calendarName))) {
        // Eigener Kalender auf dem pinn.-Server
        try {
            privat = require(`${__hooks}/pinn-kalender.js`).createEvent(e, body).privat;
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    } else {
        try {
            const calendarSync = require(`${__hooks}/calendar-sync.js`);
            calendarSync.createEventForFamily(familyId, body.calendarName, body);
            calendarSync.syncCalendarFileOnly(familyId); // nur Kalenderdatei aktualisieren - KEINE Haushalts-Erkennung (sonst kommen geloeschte, aber "heute noch faellige" Aufgaben sofort wieder)
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    }
    if (privat) return e.json(200, { success: true });

    try {
        require(`${__hooks}/pinn-push.js`).notifyAssignment(body, e.auth.id, []);
    } catch (err) {
        console.log("[Push] " + err.message);
    }
    try {
        require(`${__hooks}/pinn-hinweise.js`).eventCreated(familyId, body, e.auth);
    } catch (err) {
        console.log("[Hinweise] " + err.message);
    }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
