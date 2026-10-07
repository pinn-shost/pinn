// pb_hooks/household_tasks_progress.pb.js
// Liefert den aktuellen Fortschritt einer laufenden Haushalts-Operation (Löschen oder Neu-
// Generieren) zurück, damit die Einstellungen-Seite einen Live-Zähler ("X von Y") anzeigen kann.
// Wird von der App per Abfrage (alle ~1 Sekunde) aufgerufen, solange eine Operation läuft.

routerAdd("GET", "/api/household-tasks-progress", (e) => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        return e.json(200, calendarSync.getHouseholdProgress());
    } catch (err) {
        return e.json(200, { active: false, label: "", total: 0, done: 0, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
