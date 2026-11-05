// pb_hooks/update_calendar_event.pb.js
// Updates an EXISTING event FOR REAL in the calendar (PUT to the same resource/UID) - in
// iCloud or in the connected Google account (Android). If the calendar is changed, the event is
// moved, also between iCloud and Google.
// Own calendars (pinn-kalender.js): events with the address "pinn-termin:<id>" or target calendar
// "pinn:<id>" are changed on this server - moving between own calendars and
// iCloud/Google works in both directions.
// Expects a POST with {href, uid, ...event fields as when creating} in the body. Afterwards immediately triggers
// a new sync so that the calendar file is up to date.
// Whoever was NEWLY assigned by the change gets a push notification (not again for those
// already assigned - e.g. when ticking off a task). Not for private calendars.
// The credentials of the OWN family are always used (calendarSync.updateEventForFamily).

// Only for profiles of a family (see pinn-benutzer.js).
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
        // Own calendar involved (change or move)
        try {
            privat = require(`${__hooks}/pinn-kalender.js`).updateEvent(e, body.href, body.uid, body).privat;
        } catch (err) {
            return e.json(200, { error: err.message });
        }
    } else {
        try {
            const calendarSync = require(`${__hooks}/calendar-sync.js`);
            calendarSync.updateEventForFamily(familyId, body.href, body.uid, body);
            calendarSync.syncCalendarFileOnly(familyId); // only update the calendar file - NO household detection (otherwise deleted tasks that are "still due today" come right back)
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
