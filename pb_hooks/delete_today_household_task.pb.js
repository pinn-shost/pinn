// pb_hooks/delete_today_household_task.pb.js
// Deletes - if present - TODAY's household task of a rule (title = rule key).
// Called when a household rule is changed or deleted. Expects a POST with
// {title: "..."} in the body.
// NEW: tasks live in the PocketBase collection "aufgaben" (pinn-aufgaben.js), no longer in the
// Apple tasks calendar. The previous calendar variant is commented out below.

routerAdd("POST", "/api/delete-today-household-task", (e) => {
    const body = e.requestInfo().body;
    if (!body.title) return e.json(400, { error: "title fehlt." });
    try {
        const deleted = require(`${__hooks}/pinn-aufgaben.js`).deleteTodayHouseholdTask(e.auth.getString("familie"), body.title);
        return e.json(200, { success: true, deleted: deleted });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

/* ===== COMMENTED OUT: previous variant via the Apple tasks calendar =====
// pb_hooks/delete_today_household_task.pb.js
// Deletes - if present - TODAY's task with exactly the given title prefix. Called
// when a household rule is edited in a way that changes its title (e.g.
// a different category was chosen) - the old task from today that is thereby orphaned should not stay
// around until the next regular cycle runs. Expects a POST with {title: "..."} in the body.
// Apple credentials come from the .env (calendarSync.loadAppleConfig), not from familien_daten.

routerAdd("POST", "/api/delete-today-household-task", (e) => {
    const body = e.requestInfo().body;
    const title = body.title;
    if (!title) return e.json(400, { error: "title fehlt." });

    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const { data: familyData, config, configured } = calendarSync.loadAppleConfig();

        if (!configured) {
            return e.json(200, { error: calendarSync.MISSING_CREDENTIALS_MESSAGE });
        }
        if (!config.taskCalendarName) {
            return e.json(200, { error: "Kein Aufgaben-Kalender eingerichtet." });
        }

        const deleted = calendarSync.deleteTodayHouseholdTask(config.email, config.appPassword, config.taskCalendarName, title);
        calendarSync.syncCalendarFileOnly(); // only update the calendar file - NO household detection (otherwise the task that was just deleted comes right back)
        return e.json(200, { success: true, deleted: deleted });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
===== END COMMENTED OUT ===== */
