// pb_hooks/delete_calendar_event.pb.js
// Löscht einen Termin WIRKLICH im Kalender (nicht nur bei uns in der App) - in iCloud oder im
// verbundenen Google-Konto (Android), je nach Adresse des Termins. Erwartet POST mit
// {href: "..."} im Body - die href kommt aus dem X-PINN-HREF-Feld, das der Sync in jeden Termin
// einbettet. Löst danach sofort einen neuen Sync aus, damit die Kalenderdatei aktuell ist.
// Termine in eigenen Kalendern ("pinn-termin:<id>", pinn-kalender.js) werden auf diesem Server gelöscht.
// Es werden immer die Zugangsdaten der EIGENEN Familie verwendet (calendarSync.deleteEventForFamily).

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/delete-calendar-event", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    const familyId = lib.familyOf(e);
    const body = e.requestInfo().body;
    const eventHref = body.href;
    console.log("[Kalender-Loeschen] Endpunkt aufgerufen mit href: " + JSON.stringify(eventHref));

    if (!eventHref) {
        console.log("[Kalender-Loeschen] Fehler: keine href im Request-Body.");
        return e.json(400, { error: "href fehlt." });
    }

    if (/^pinn-termin:[a-z0-9]{15}$/.test(String(eventHref))) {
        // Eigener Kalender auf dem pinn.-Server
        try {
            require(`${__hooks}/pinn-kalender.js`).deleteEvent(e, eventHref);
            return e.json(200, { success: true });
        } catch (err) {
            // Schon weg (z. B. Kalender inzwischen gelöscht) -> Ziel erreicht
            if (/nicht gefunden/i.test(err.message)) return e.json(200, { success: true });
            return e.json(200, { error: err.message });
        }
    }

    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        calendarSync.deleteEventForFamily(familyId, eventHref);
        calendarSync.syncCalendarFileOnly(familyId); // nur Kalenderdatei aktualisieren - KEINE Haushalts-Erkennung (sonst kommen geloeschte, aber "heute noch faellige" Aufgaben sofort wieder)
        console.log("[Kalender-Loeschen] Endpunkt erfolgreich abgeschlossen.");
        return e.json(200, { success: true });
    } catch (err) {
        console.log("[Kalender-Loeschen] EXCEPTION: " + err.message);
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
