// pb_hooks/trigger_sync.pb.js
// Triggers an immediate calendar sync for the OWN family instead of waiting up to 15 minutes for the
// next cron run. Called by the app right after saving the
// calendar selection or the Apple ID in the settings. Also syncs the calendars linked with
// iCloud/Google that the profile sees - own and family calendars (pinn-kalender.js).

// Only for profiles of a family (see pinn-benutzer.js).
routerAdd("POST", "/api/sync-calendar-now", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        calendarSync.runCronSync(lib.familyOf(e));
        // Also sync the calendars linked with iCloud/Google that the profile sees (own + family calendars)
        try { require(`${__hooks}/pinn-kalender.js`).syncLinkedVisible(lib.familyOf(e), e.auth.id); } catch (err) { /* next cron run */ }
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
