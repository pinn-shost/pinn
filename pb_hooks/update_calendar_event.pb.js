// pb_hooks/update_calendar_event.pb.js
// Aktualisiert einen BESTEHENDEN Termin WIRKLICH im Kalender (PUT auf dieselbe Ressource/UID) - in
// iCloud oder im verbundenen Google-Konto (Android). Wird der Kalender gewechselt, wird der Termin
// verschoben, auch zwischen iCloud und Google.
// Eigene Kalender (pinn-kalender.js): Termine mit der Adresse "pinn-termin:<id>" bzw. Zielkalender
// "pinn:<id>" werden auf diesem Server geändert - Verschieben zwischen eigenen Kalendern und
// iCloud/Google geht in beide Richtungen.
// Erwartet POST mit {href, uid, ...Termin-Feldern wie beim Anlegen} im Body. Löst danach sofort
// einen neuen Sync aus, damit die Kalenderdatei aktuell ist.
// Wer durch die Änderung NEU zugewiesen wurde, bekommt eine Push-Benachrichtigung (bereits
// Zugewiesene nicht erneut - z. B. beim Abhaken einer Aufgabe). Nicht bei privaten Kalendern.
// Es werden immer die Zugangsdaten der EIGENEN Familie verwendet (calendarSync.updateEventForFamily).

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/update-calendar-event", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    const familyId = lib.familyOf(e);
    const body = e.requestInfo().body;

    if (!body.href || !body.uid || !body.title || !body.startDate || !body.endDate) {
        return e.json(400, { error: "href, uid, Titel, Start- und Enddatum sind erforderlich." });
    }

    let previousAssignees = [];
    try {
        previousAssignees = require(`${__hooks}/pinn-push.js`).assigneesForHref(body.href, familyId);
    } catch (err) { previousAssignees = []; }

    let privat = false;
    const pinnInvolved = /^pinn-termin:[a-z0-9]{15}$/.test(String(body.href)) || /^pinn:[a-z0-9]{15}$/.test(String(body.calendarName || ""));
    if (pinnInvolved) {
        // Eigener Kalender beteiligt (ändern oder verschieben)
        try {
            privat = require(`${__hooks}/pinn-kalender.js`).updateEvent(e, body.href, body.uid, body).privat;
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    } else {
        try {
            const calendarSync = require(`${__hooks}/calendar-sync.js`);
            calendarSync.updateEventForFamily(familyId, body.href, body.uid, body);
            calendarSync.syncCalendarFileOnly(familyId); // nur Kalenderdatei aktualisieren - KEINE Haushalts-Erkennung (sonst kommen geloeschte, aber "heute noch faellige" Aufgaben sofort wieder)
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    }
    if (privat) return e.json(200, { success: true });

    try {
        require(`${__hooks}/pinn-push.js`).notifyAssignment(body, e.auth.id, previousAssignees);
    } catch (err) {
        console.log("[Push] " + err.message);
    }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
