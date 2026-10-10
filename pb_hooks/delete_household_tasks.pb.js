// pb_hooks/delete_household_tasks.pb.js
// Löscht ALLE automatisch erzeugten Haushalts-Aufgaben (Reinigung/Aufräumen/Mülleimer rausbringen).
// Selbst angelegte Aufgaben bleiben unangetastet.
// NEU: Aufgaben liegen in der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js), nicht mehr im
// Apple-Aufgaben-Kalender. Die bisherige Kalender-Variante steht unten ausgeklammert.

routerAdd("POST", "/api/delete-household-tasks", (e) => {
    try {
        const deletedCount = require(`${__hooks}/pinn-aufgaben.js`).deleteHouseholdTasks(e.auth.getString("familie"));
        return e.json(200, { success: true, deletedCount: deletedCount });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

/* ===== AUSGEKLAMMERT: bisherige Variante über den Apple-Aufgaben-Kalender =====
// pb_hooks/delete_household_tasks.pb.js
// Löscht ALLE vom Haushalt-Feature automatisch erzeugten Aufgaben (Reinigungen/Aufräumen/
// Mülleimer rausbringen) aus dem Aufgaben-Kalender. Normale, manuell angelegte Aufgaben bleiben
// unangetastet - erkannt wird anhand des Titel-Präfixes (Kategorie-Name + ":" bzw. das feste
// "🗑️ Mülleimer rausbringen:"-Präfix).
// Apple-Zugangsdaten kommen aus der .env (calendarSync.loadAppleConfig), nicht aus familien_daten.

routerAdd("POST", "/api/delete-household-tasks", (e) => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const { data, config, configured } = calendarSync.loadAppleConfig();

        if (!configured) {
            return e.json(200, { error: calendarSync.MISSING_CREDENTIALS_MESSAGE });
        }
        if (!config.taskCalendarName) {
            return e.json(200, { error: "Kein Aufgaben-Kalender eingerichtet." });
        }

        const deletedCount = calendarSync.deleteHouseholdTasks(config.email, config.appPassword, config.taskCalendarName, data.cleaningCategories || []);
        calendarSync.syncCalendarFileOnly(); // nur Kalenderdatei aktualisieren - KEINE Haushalts-Erkennung (sonst kommen die gerade geloeschten Aufgaben sofort wieder)
        return e.json(200, { success: true, deletedCount: deletedCount });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
===== ENDE AUSGEKLAMMERT ===== */
