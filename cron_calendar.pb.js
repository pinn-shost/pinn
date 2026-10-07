// pb_hooks/cron_calendar.pb.js
// Registriert nur den 15-Minuten-Cron. Die eigentliche Logik steckt in calendar-sync.js und
// gleicht nacheinander jede Familie mit hinterlegter Apple-ID ab (eigene Kalenderdatei je Familie).
// Bewusst KEIN Sync mehr beim Start (onBootstrap): Der lief synchron VOR dem Serverstart und hat
// damit den kompletten Start (inkl. Dashboard /_/ und "superuser upsert") blockiert, solange er
// lief. Einen Sofort-Sync gibt es weiterhin ueber die App (trigger_sync.pb.js).

cronAdd("syncAppleCalendarCron", "*/15 * * * *", () => {
    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    calendarSync.runCronSync();
});
