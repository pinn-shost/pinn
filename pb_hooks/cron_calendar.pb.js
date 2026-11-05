// pb_hooks/cron_calendar.pb.js
// Only registers the 15-minute cron. The actual logic lives in calendar-sync.js and
// syncs every family with a stored Apple ID one after another (own calendar file per family).
// Deliberately NO sync on start any more (onBootstrap): it ran synchronously BEFORE the server start and
// thereby blocked the whole start (including the dashboard /_/ and "superuser upsert") for as long as it
// ran. An immediate sync is still available via the app (trigger_sync.pb.js).
// Errors of individual families are logged by calendar-sync.js itself; an error in the whole run additionally
// ends up here in the admin error log (pinn-protokoll.js).

cronAdd("syncAppleCalendarCron", "*/15 * * * *", () => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        calendarSync.runCronSync();
    } catch (err) {
        console.log("[Kalender-Sync] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("sync", "Kalender-Sync-Zeitplan fehlgeschlagen: " + err.message); } catch (e2) { /* ignore */ }
    }
});
