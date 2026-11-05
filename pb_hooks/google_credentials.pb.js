// pb_hooks/google_credentials.pb.js
// Google calendar (Android) PER FAMILY - counterpart to apple_credentials.pb.js.
// The logic lives in pinn-google.js, the access is stored encrypted in the locked collection
// "google_zugaenge".
//
// This file
// - creates the locked collection on start,
// - provides the routes for the settings:
//     GET  /api/pinn/google-status       status of the own family (never the token)
//     POST /api/pinn/google/start        {origin} -> {url} start the Google sign-in (family admins only)
//     GET  /api/pinn/google/callback     return from Google (without pinn. sign-in, secured via
//                                        a one-time "state" valid for 15 minutes) - also for the
//                                        personal Google accounts of the own calendars (kalender.pb.js)
//     POST /api/pinn/google/loeschen     disconnect the own family's connection (admins only)
//
// Everything defensive: an error here is only logged and never prevents the server from starting.

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { /* ignore */ }
    try {
        const google = require(`${__hooks}/pinn-google.js`);
        google.setup();
        const count = google.familiesWithCredentials().length;
        console.log("[Google-Zugang] " + (google.isAvailable() ? "eingerichtet" : "nicht eingerichtet (PINN_GOOGLE_CLIENT_ID / PINN_GOOGLE_CLIENT_SECRET fehlen)") + ", " + count + " Familie(n) mit verbundenem Google-Konto.");
    } catch (err) {
        console.log("[Google-Zugang] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Status for the settings. The token is NEVER delivered.
routerAdd("GET", "/api/pinn/google-status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const empty = { available: false, configured: false, account: "", error: "", redirectUri: "", lastSync: null, canEdit: false };
    try {
        const lib = require(`${__hooks}/pinn-benutzer.js`);
        const denied = lib.calendarDenied(e);
        if (denied) return e.json(200, Object.assign(empty, { error: denied }));
        const familyId = lib.familyOf(e);
        const status = require(`${__hooks}/pinn-google.js`).getStatus(familyId);
        status.lastSync = require(`${__hooks}/calendar-sync.js`).getLastSync(familyId);
        status.canEdit = lib.isAdmin(e);
        return e.json(200, status);
    } catch (err) {
        return e.json(200, Object.assign(empty, { error: err.message }));
    }
}, $apis.requireAuth("benutzer"));

// Start the Google sign-in. Response: address to which the app redirects.
routerAdd("POST", "/api/pinn/google/start", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    if (!lib.isAdmin(e)) return e.json(200, { error: "Nur Admins deiner Familie können ein Google-Konto verbinden." });
    try {
        const body = e.requestInfo().body || {};
        const url = require(`${__hooks}/pinn-google.js`).startAuth(lib.familyOf(e), e.auth.id, body.origin);
        return e.json(200, { url: url });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Return from Google. Runs in the browser as a normal page (without pinn. sign-in) and then redirects
// back into the app: /?google=verbunden or /?google=fehler&grund=...
routerAdd("GET", "/api/pinn/google/callback", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    let q = {};
    try { q = e.requestInfo().query || {}; } catch (err) { q = {}; }
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const page = (title, text, target) => '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<meta http-equiv="refresh" content="2;url=' + esc(target) + '">' +
        '<title>pinn.</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;' +
        'background:#F6F3EC;color:#2b2a26;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px;box-sizing:border-box}' +
        '.k{max-width:360px;background:#fff;border-radius:18px;padding:24px;box-shadow:0 6px 24px rgba(0,0,0,.06);text-align:center}' +
        'h1{font-size:18px;margin:0 0 8px;color:#2F4B41}p{font-size:14px;line-height:1.45;margin:0 0 16px;color:#5c5a54}' +
        'a{display:inline-block;background:#2F4B41;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px}</style></head>' +
        '<body><div class="k"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><a href="' + esc(target) + '">Zurück zu pinn.</a></div>' +
        '<script>setTimeout(function(){location.replace(' + JSON.stringify(target) + ')},1200)</script></body></html>';

    // Personal sign-in (own "only for me" calendars)? Then the return leads to the own
    // calendars instead of the family calendars (&privat=1).
    let personal = false;
    try { personal = require(`${__hooks}/pinn-google.js`).isPersonalState(q.state); } catch (err) { personal = false; }
    const tail = personal ? "&privat=1" : "";
    if (q.error) {
        const reason = q.error === "access_denied" ? "Die Anmeldung bei Google wurde abgebrochen." : "Google meldet: " + q.error;
        return e.html(200, page("Nicht verbunden", reason, "/?google=fehler&grund=" + encodeURIComponent(reason) + tail));
    }
    let result;
    try {
        result = require(`${__hooks}/pinn-google.js`).finishAuth(q.state, q.code);
    } catch (err) {
        console.log("[Google-Zugang] Verbinden fehlgeschlagen: " + err.message);
        return e.html(200, page("Nicht verbunden", err.message, "/?google=fehler&grund=" + encodeURIComponent(err.message) + tail));
    }
    if (result.personal) {
        // Sync already linked own Google calendars right away (e.g. after reconnecting)
        try { require(`${__hooks}/pinn-kalender.js`).syncLinkedForUser(result.userId, "google"); } catch (err) { /* next cron run */ }
        let ptarget = "/?google=verbunden&privat=1";
        if (result.warning) ptarget += "&hinweis=" + encodeURIComponent(result.warning);
        return e.html(200, page("Google verbunden", "Verbunden mit " + result.account + ". Jetzt in pinn. einen Google-Kalender für dich auswählen.", ptarget));
    }
    // Sync the existing calendar selection right away (e.g. after reconnecting)
    try { require(`${__hooks}/calendar-sync.js`).syncFamily(result.familyId); } catch (err) { /* next cron run */ }
    let target = "/?google=verbunden";
    if (result.warning) target += "&hinweis=" + encodeURIComponent(result.warning);
    return e.html(200, page("Google-Kalender verbunden", "Verbunden mit " + result.account + ". Jetzt in pinn. die Kalender auswählen.", target));
});

// Disconnect the own family's connection and rewrite the calendar file (iCloud events stay).
routerAdd("POST", "/api/pinn/google/loeschen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const denied = lib.calendarDenied(e);
    if (denied) return e.json(200, { error: denied });
    if (!lib.isAdmin(e)) return e.json(200, { error: "Nur Admins deiner Familie können das Google-Konto trennen." });
    const familyId = lib.familyOf(e);
    try {
        require(`${__hooks}/pinn-google.js`).deleteCredentials(familyId);
    } catch (err) {
        return e.json(200, { error: err.message });
    }
    try { require(`${__hooks}/calendar-sync.js`).syncFamily(familyId); } catch (err) { /* ignore */ }
    console.log("[Google-Zugang] Google-Konto für Familie " + familyId + " getrennt.");
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
