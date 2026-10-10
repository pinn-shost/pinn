// pb_hooks/apple_credentials.pb.js
// Apple-Kalender-Zugangsdaten JE FAMILIE (Apple-ID + App-spezifisches Passwort).
// Sie liegen verschlüsselt in der gesperrten Sammlung "apple_zugaenge" (Logik: pinn-apple.js).
//
// Diese Datei
// - legt beim Start die gesperrte Sammlung an, prüft den Schlüssel und übernimmt einmalig
//   Zugangsdaten, die noch in der .env stehen (PINN_APPLE_ID / PINN_APPLE_APP_PASSWORD),
// - entfernt beim Start alte, im Klartext in familien_daten gespeicherte Zugangsdaten
//   (appleCalendar.email / appleCalendar.appPassword),
// - verhindert, dass sie über die normale Sammlungs-API wieder hineingeschrieben werden,
// - stellt die Routen für die Einstellungen bereit:
//     GET  /api/pinn/apple-status          Status der eigenen Familie (nie das Passwort)
//     POST /api/pinn/apple-zugang          {appleId, appPassword} speichern (nur Familien-Admins,
//                                          wird vorher bei iCloud geprüft)
//     POST /api/pinn/apple-zugang/loeschen Zugangsdaten der eigenen Familie entfernen (nur Admins)
//
// Alles defensiv: Ein Fehler hier wird nur geloggt und verhindert nie den Serverstart.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-apple.js`).setup();
    } catch (err) {
        console.log("[Apple-Zugang] Einrichtung fehlgeschlagen: " + err.message);
    }
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        let records = [];
        try { records = $app.findRecordsByFilter("familien_daten", "", "", 0, 0); } catch (err) { records = []; }
        records.forEach(record => {
            const data = calendarSync.parseRecordData(record.get("data"));
            if (calendarSync.stripAppleSecrets(data)) {
                record.set("data", data);
                $app.save(record);
                console.log("[Apple-Zugang] Alte Zugangsdaten aus familien_daten entfernt.");
            }
        });
        const count = require(`${__hooks}/pinn-apple.js`).familiesWithCredentials().length;
        console.log("[Apple-Zugang] " + count + " Familie(n) mit hinterlegtem Apple-Kalender.");
    } catch (err) {
        console.log("[Apple-Zugang] Bereinigung beim Start fehlgeschlagen: " + err.message);
    }
});

// Schutz für direkte Schreibzugriffe über die Sammlungs-API (z.B. Fallback-Speichern der App).
// Logik bewusst in jedem Handler selbst: Hook-Handler laufen isoliert und sehen keine
// Top-Level-Funktionen dieser Datei.
onRecordCreateRequest((e) => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const data = calendarSync.parseRecordData(e.record.get("data"));
        if (calendarSync.stripAppleSecrets(data)) e.record.set("data", data);
    } catch (err) {
        console.log("[Apple-Zugang] Konnte Datensatz nicht bereinigen: " + err.message);
    }
    return e.next();
}, "familien_daten");

onRecordUpdateRequest((e) => {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const data = calendarSync.parseRecordData(e.record.get("data"));
        if (calendarSync.stripAppleSecrets(data)) e.record.set("data", data);
    } catch (err) {
        console.log("[Apple-Zugang] Konnte Datensatz nicht bereinigen: " + err.message);
    }
    return e.next();
}, "familien_daten");

// Status für die Einstellungen: ob Zugangsdaten gesetzt sind, welche Apple-ID, letzter Sync und ob
// der Angemeldete sie ändern darf. Das Passwort wird NIE ausgeliefert.
routerAdd("GET", "/api/pinn/apple-status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const lib = require(`${__hooks}/pinn-benutzer.js`);
        const denied = lib.calendarDenied(e);
        if (denied) return e.json(200, { configured: false, account: "", hasAppleId: false, hasAppPassword: false, lastSync: null, canEdit: false, error: denied });
        const status = require(`${__hooks}/calendar-sync.js`).getAppleStatus(lib.familyOf(e));
        status.canEdit = lib.isAdmin(e);
        return e.json(200, status);
    } catch (err) {
        return e.json(200, { configured: false, account: "", hasAppleId: false, hasAppPassword: false, lastSync: null, canEdit: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Zugangsdaten der eigenen Familie speichern. Vorher wird die Anmeldung bei iCloud geprüft, damit
// keine falschen Daten gespeichert werden. Antwort enthält direkt die Kalenderliste.
routerAdd("POST", "/api/pinn/apple-zugang", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    if (!lib.isAdmin(e)) return e.json(200, { error: "Nur Admins deiner Familie können die Apple-ID hinterlegen." });
    const apple = require(`${__hooks}/pinn-apple.js`);
    const body = e.requestInfo().body;
    const appleId = apple.cleanAppleId(body.appleId);
    const appPassword = apple.cleanAppPassword(body.appPassword);
    const invalid = apple.validateInput(appleId, appPassword);
    if (invalid) return e.json(200, { error: invalid });
    const familyId = lib.familyOf(e);
    let calendars = [];
    try {
        calendars = require(`${__hooks}/calendar-sync.js`).discoverCalendars(appleId, appPassword);
    } catch (err) {
        return e.json(200, { error: "Anmeldung bei iCloud fehlgeschlagen: " + err.message });
    }
    try {
        apple.saveCredentials(familyId, appleId, appPassword);
    } catch (err) {
        return e.json(200, { error: "Speichern fehlgeschlagen: " + err.message });
    }
    console.log("[Apple-Zugang] Zugangsdaten für Familie " + familyId + " gespeichert.");
    return e.json(200, { success: true, calendars: calendars });
}, $apis.requireAuth("benutzer"));

// Zugangsdaten der eigenen Familie entfernen (Termine eines verbundenen Google-Kontos bleiben).
routerAdd("POST", "/api/pinn/apple-zugang/loeschen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    if (!lib.isAdmin(e)) return e.json(200, { error: "Nur Admins deiner Familie können die Apple-ID entfernen." });
    const familyId = lib.familyOf(e);
    try {
        require(`${__hooks}/pinn-apple.js`).deleteCredentials(familyId);
        try { $app.store().remove("pinnAppleSync:" + familyId); } catch (err) { /* egal */ }
        // Kalenderdatei neu schreiben: ohne Google-Konto wird sie geleert, mit Google-Konto
        // bleiben dessen Termine erhalten (calendar-sync.js)
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        try { calendarSync.syncFamily(familyId); } catch (err) { calendarSync.writeEmptyCalendar(familyId); }
    } catch (err) {
        return e.json(200, { error: err.message });
    }
    console.log("[Apple-Zugang] Zugangsdaten für Familie " + familyId + " entfernt.");
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
