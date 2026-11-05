// pb_hooks/create_calendar_event.pb.js
// Creates a new event FOR REAL in the calendar (not just on our side in the app) - in iCloud or,
// for calendars with the suffix " (Google)", in the connected Google account (Android). Expects a POST with
// the event fields from the "Add event" form in the body. Afterwards immediately triggers a new
// sync so that the new event shows up in the calendar file right away.
// Own calendars (name "pinn:<id>", see pinn-kalender.js) store the event on this server.
// Assigned family members (except the person creating the event) get a
// push notification, unless they have switched it off in their settings.
// The credentials of the OWN family are always used (calendarSync.createEventForFamily).
// The rest of the family additionally sees the new event under the bell (pinn-hinweise.js) - except for
// events in private calendars ("Only for me").

// Only for profiles of a family (see pinn-benutzer.js).
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
        // Own calendar on the pinn. server
        try {
            privat = require(`${__hooks}/pinn-kalender.js`).createEvent(e, body).privat;
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    } else {
        try {
            const calendarSync = require(`${__hooks}/calendar-sync.js`);
            calendarSync.createEventForFamily(familyId, body.calendarName, body);
            calendarSync.syncCalendarFileOnly(familyId); // only update the calendar file - NO household detection (otherwise deleted tasks that are "still due today" come right back)
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
