// pb_hooks/discover_calendars.pb.js
// POST /api/discover-calendars
// Returns the list of ALL calendar names of the OWN family - from iCloud (Apple ID) and from
// the connected Google account (Android, names with the suffix " (Google)"), so that they can be chosen in
// the settings. The credentials are stored encrypted in the locked collections
// "apple_zugaenge" (pinn-apple.js) or "google_zugaenge" (pinn-google.js) - the browser never sends
// or receives them.
// If only one of the two accounts is connected or one of them fails, the other calendars still
// come through; the error is then in the field "warning".

// Only for profiles of a family (see pinn-benutzer.js).
routerAdd("POST", "/api/discover-calendars", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const result = calendarSync.discoverCalendarsForFamily(lib.familyOf(e));
        if (result.error) return e.json(200, { error: result.error });
        return e.json(200, { calendars: result.calendars, warning: result.warning || "" });
    } catch (err) {
        // Return errors as a normal 200 response with an "error" field, so that the frontend can show the
        // message cleanly instead of only seeing a generic HTTP error.
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
