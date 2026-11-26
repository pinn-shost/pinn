// pb_hooks/apple_credentials.pb.js
// Apple calendar credentials PER FAMILY (Apple ID + app-specific password).
// They are stored encrypted in the locked collection "apple_zugaenge" (logic: pinn-apple.js).
//
// This file
// - creates the locked collection on start, checks the key and takes over once
//   credentials that are still in the .env (PINN_APPLE_ID / PINN_APPLE_APP_PASSWORD),
// - removes on start old credentials stored in plain text in familien_daten
//   (appleCalendar.email / appleCalendar.appPassword),
// - prevents them from being written back in via the normal collection API,
// - provides the routes for the settings:
//     GET  /api/pinn/apple-status          status of the own family (never the password)
//     POST /api/pinn/apple-zugang          {appleId, appPassword} save (family admins only,
//                                          checked at iCloud beforehand)
//     POST /api/pinn/apple-zugang/loeschen remove the own family's credentials (admins only)
//
// Everything defensive: an error here is only logged and never prevents the server from starting.

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { /* ignore */ }
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

// Protection for direct write access via the collection API (e.g. the app's fallback saving).
// Logic deliberately in every handler itself: hook handlers run isolated and do not see any
// top-level functions of this file.
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

// Status for the settings: whether credentials are set, which Apple ID, last sync and whether
// the signed-in user may change them. The password is NEVER delivered.
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

// Save the own family's credentials. Beforehand, the sign-in at iCloud is checked so that
// no wrong data is saved. The response directly contains the calendar list.
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

// Remove the own family's credentials (events of a connected Google account stay).
routerAdd("POST", "/api/pinn/apple-zugang/loeschen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    if (!lib.isAdmin(e)) return e.json(200, { error: "Nur Admins deiner Familie können die Apple-ID entfernen." });
    const familyId = lib.familyOf(e);
    try {
        require(`${__hooks}/pinn-apple.js`).deleteCredentials(familyId);
        try { $app.store().remove("pinnAppleSync:" + familyId); } catch (err) { /* ignore */ }
        // Rewrite the calendar file: without a Google account it is emptied, with a Google account
        // its events are kept (calendar-sync.js)
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        try { calendarSync.syncFamily(familyId); } catch (err) { calendarSync.writeEmptyCalendar(familyId); }
    } catch (err) {
        return e.json(200, { error: err.message });
    }
    console.log("[Apple-Zugang] Zugangsdaten für Familie " + familyId + " entfernt.");
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
