// pb_hooks/household_tasks_progress.pb.js
// Returns the current progress of a running household operation (deleting or re-
// generating) so that the settings page can show a live counter ("X of Y").
// Called by the app by polling (about every second) as long as an operation is running.

routerAdd("GET", "/api/household-tasks-progress", (e) => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        return e.json(200, calendarSync.getHouseholdProgress());
    } catch (err) {
        return e.json(200, { active: false, label: "", total: 0, done: 0, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
