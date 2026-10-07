// pb_hooks/delete_today_household_task.pb.js
// Löscht - falls vorhanden - die HEUTIGE Haushalts-Aufgabe einer Regel (Titel = Regel-Schlüssel).
// Wird aufgerufen, wenn eine Haushalts-Regel geändert oder gelöscht wird. Erwartet POST mit
// {title: "..."} im Body.
// NEU: Aufgaben liegen in der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js), nicht mehr im
// Apple-Aufgaben-Kalender. Die bisherige Kalender-Variante steht unten ausgeklammert.

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

/* ===== AUSGEKLAMMERT: bisherige Variante über den Apple-Aufgaben-Kalender =====
// pb_hooks/delete_today_household_task.pb.js
// Löscht - falls vorhanden - die HEUTIGE Aufgabe mit genau dem übergebenen Titel-Präfix. Wird
// aufgerufen, wenn eine Haushalts-Regel so bearbeitet wird, dass sich ihr Titel ändert (z.B.
// andere Kategorie gewählt) - die dadurch verwaiste, alte Aufgabe von heute soll nicht liegen
// bleiben, bis der nächste reguläre Takt läuft. Erwartet POST mit {title: "..."} im Body.
// Apple-Zugangsdaten kommen aus der .env (calendarSync.loadAppleConfig), nicht aus familien_daten.

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
        calendarSync.syncCalendarFileOnly(); // nur Kalenderdatei aktualisieren - KEINE Haushalts-Erkennung (sonst kommt die gerade geloeschte Aufgabe sofort wieder)
        return e.json(200, { success: true, deleted: deleted });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
===== ENDE AUSGEKLAMMERT ===== */
