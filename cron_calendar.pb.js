// pb_hooks/cron_calendar.pb.js
// Registriert nur den 15-Minuten-Cron. Die eigentliche Logik steckt in calendar-sync.js und
// gleicht nacheinander jede Familie mit hinterlegter Apple-ID ab (eigene Kalenderdatei je Familie).
// Bewusst KEIN Sync mehr beim Start (onBootstrap): Der lief synchron VOR dem Serverstart und hat
// damit den kompletten Start (inkl. Dashboard /_/ und "superuser upsert") blockiert, solange er
// lief. Einen Sofort-Sync gibt es weiterhin ueber die App (trigger_sync.pb.js).
// Fehler einzelner Familien protokolliert calendar-sync.js selbst; ein Fehler im ganzen Lauf landet
// hier zusätzlich im Admin-Fehlerprotokoll (pinn-protokoll.js).

cronAdd("syncAppleCalendarCron", "*/15 * * * *", () => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        calendarSync.runCronSync();
    } catch (err) {
        console.log("[Kalender-Sync] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("sync", "Kalender-Sync-Zeitplan fehlgeschlagen: " + err.message); } catch (e2) { /* egal */ }
    }
});
