// pb_hooks/discover_calendars.pb.js
// POST /api/discover-calendars
// Liefert die Liste ALLER Kalendernamen der EIGENEN Familie zurück - aus iCloud (Apple-ID) und aus
// dem verbundenen Google-Konto (Android, Namen mit dem Zusatz " (Google)"), damit man sie in den
// Einstellungen auswählen kann. Die Zugangsdaten liegen verschlüsselt in den gesperrten Sammlungen
// "apple_zugaenge" (pinn-apple.js) bzw. "google_zugaenge" (pinn-google.js) - der Browser schickt
// und bekommt sie nie.
// Ist nur eines der beiden Konten verbunden oder schlägt eines fehl, kommen die übrigen Kalender
// trotzdem; der Fehler steht dann im Feld "warning".

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/discover-calendars", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const result = calendarSync.discoverCalendarsForFamily(lib.familyOf(e));
        if (result.error) return e.json(200, { error: result.error });
        return e.json(200, { calendars: result.calendars, warning: result.warning || "" });
    } catch (err) {
        // Fehler als normale 200-Antwort mit "error"-Feld zurückgeben, damit das Frontend die
        // Meldung sauber anzeigen kann statt nur einen generischen HTTP-Fehler zu sehen.
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
