// pb_hooks/get_calendar_event_raw.pb.js
// Lädt den rohen ICS-Text eines einzelnen Termins - wird beim Öffnen von "Bearbeiten" aufgerufen,
// damit die App Wiederholung/Erinnerung/Link auslesen kann, die sie sonst nicht kennt.
// Funktioniert für iCloud- und Google-Termine (Android); das Konto ergibt sich aus der Adresse.
// Termine in eigenen Kalendern ("pinn-termin:<id>") kommen von diesem Server (pinn-kalender.js).
// Es werden immer die Zugangsdaten der EIGENEN Familie verwendet (calendarSync.fetchRawEventForFamily).

// Nur für Profile einer Familie (siehe pinn-benutzer.js).
routerAdd("POST", "/api/get-calendar-event-raw", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    const body = e.requestInfo().body;
    const href = body.href;

    if (!href) {
        return e.json(400, { error: "href fehlt." });
    }

    try {
        if (/^pinn-termin:[a-z0-9]{15}$/.test(String(href))) {
            return e.json(200, { ics: require(`${__hooks}/pinn-kalender.js`).rawEvent(e, href) });
        }
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        // Validate href to prevent SSRF
        const url = new URL(href);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error("Ungültiges Protokoll für href.");
        }
        // Add more specific host validation if needed, e.g., only allow specific calendar providers
        // if (!['calendar.google.com', 'pXX-calendarws.icloud.com'].some(host => url.hostname.endsWith(host))) {
        //     throw new Error("Ungültiger Host für href.");
        // }
        const ics = calendarSync.fetchRawEventForFamily(lib.familyOf(e), href);
        return e.json(200, { ics: ics });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));