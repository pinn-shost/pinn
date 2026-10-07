// pb_hooks/trigger_sync.pb.js
// Löst einen sofortigen Kalender-Sync für die EIGENE Familie aus, statt bis zu 15 Minuten auf den
// nächsten Cron-Durchlauf zu warten. Wird von der App direkt nach dem Speichern der
// Kalenderauswahl bzw. der Apple-ID in den Einstellungen aufgerufen. Gleicht außerdem die mit
// iCloud/Google verknüpften Kalender ab, die das Profil sieht – eigene und Familien-Kalender (pinn-kalender.js).

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/sync-calendar-now", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        calendarSync.runCronSync(lib.familyOf(e));
        // Mit iCloud/Google verknüpfte Kalender, die das Profil sieht (eigene + Familien-Kalender), gleich mit abgleichen
        try { require(`${__hooks}/pinn-kalender.js`).syncLinkedVisible(lib.familyOf(e), e.auth.id); } catch (err) { /* nächster Cron-Lauf */ }
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
