// pb_hooks/get_calendar_event_raw.pb.js
// Loads the raw ICS text of a single event - called when opening "Edit",
// so that the app can read repeat/reminder/link that it does not know otherwise.
// Works for iCloud and Google events (Android); the account is derived from the address.
// Events in own calendars ("pinn-termin:<id>") come from this server (pinn-kalender.js).
// The credentials of the OWN family are always used (calendarSync.fetchRawEventForFamily).

// Only for profiles of a family (see pinn-benutzer.js).
routerAdd("POST", "/api/get-calendar-event-raw", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    const body = e.requestInfo().body;
    const href = body.href;

    if (!href) {
        return e.json(400, { error: "href fehlt." });
    }

    try {
        if (/^pinn-termin:[a-z0-9]{15}$/.test(String(href))) {
            return e.json(200, { ics: require(`${__hooks}/pinn-kalender.js`).rawEvent(e, href) });
        }
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const ics = calendarSync.fetchRawEventForFamily(lib.familyOf(e), href);
        return e.json(200, { ics: ics });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
