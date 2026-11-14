// pb_hooks/delete_calendar_event.pb.js
// Deletes an event FOR REAL in the calendar (not just on our side in the app) - in iCloud or in the
// connected Google account (Android), depending on the event's address. Expects a POST with
// {href: "..."} in the body - the href comes from the X-PINN-HREF field that the sync embeds
// into every event. Afterwards immediately triggers a new sync so that the calendar file is up to date.
// Events in own calendars ("pinn-termin:<id>", pinn-kalender.js) are deleted on this server.
// The credentials of the OWN family are always used (calendarSync.deleteEventForFamily).

// Only for profiles of a family (see pinn-benutzer.js).
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
        // Own calendar on the pinn. server
        try {
            require(`${__hooks}/pinn-kalender.js`).deleteEvent(e, eventHref);
            return e.json(200, { success: true });
        } catch (err) {
            // Already gone (e.g. calendar deleted in the meantime) -> goal reached
            if (/nicht gefunden/i.test(err.message)) return e.json(200, { success: true });
            return e.json(200, { error: err.message });
        }
    }

    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        // Validate eventHref to prevent SSRF
        if (!/^https?:\/\//.test(eventHref)) {
            console.log("[Kalender-Loeschen] Fehler: Ungültiges href-Format. Nur HTTP(S)-URLs sind erlaubt.");
            return e.json(400, { error: "Ungültiges href-Format." });
        }
        calendarSync.deleteEventForFamily(familyId, eventHref);
        calendarSync.syncCalendarFileOnly(familyId); // only update the calendar file - NO household detection (otherwise deleted tasks that are "still due today" come right back)
        console.log("[Kalender-Loeschen] Endpunkt erfolgreich abgeschlossen.");
        return e.json(200, { success: true });
    } catch (err) {
        console.log("[Kalender-Loeschen] EXCEPTION: " + err.message);
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));