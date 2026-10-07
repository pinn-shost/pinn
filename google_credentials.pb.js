// pb_hooks/google_credentials.pb.js
// Google-Kalender (Android) JE FAMILIE - Gegenstück zu apple_credentials.pb.js.
// Die Logik steckt in pinn-google.js, der Zugang liegt verschlüsselt in der gesperrten Sammlung
// "google_zugaenge".
//
// Diese Datei
// - legt beim Start die gesperrte Sammlung an,
// - stellt die Routen für die Einstellungen bereit:
//     GET  /api/pinn/google-status       Status der eigenen Familie (nie den Token)
//     POST /api/pinn/google/start        {origin} -> {url} Google-Anmeldung starten (nur Familien-Admins)
//     GET  /api/pinn/google/callback     Rückkehr von Google (ohne pinn.-Anmeldung, abgesichert über
//                                        einen einmaligen, 15 Minuten gültigen "state") – auch für die
//                                        persönlichen Google-Konten der eigenen Kalender (kalender.pb.js)
//     POST /api/pinn/google/loeschen     Verbindung der eigenen Familie trennen (nur Admins)
//
// Alles defensiv: Ein Fehler hier wird nur geloggt und verhindert nie den Serverstart.

onBootstrap((e) => {
    e.next();
    try {
        const google = require(`${__hooks}/pinn-google.js`);
        google.setup();
        const count = google.familiesWithCredentials().length;
        console.log("[Google-Zugang] " + (google.isAvailable() ? "eingerichtet" : "nicht eingerichtet (PINN_GOOGLE_CLIENT_ID / PINN_GOOGLE_CLIENT_SECRET fehlen)") + ", " + count + " Familie(n) mit verbundenem Google-Konto.");
    } catch (err) {
        console.log("[Google-Zugang] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Status für die Einstellungen. Der Token wird NIE ausgeliefert.
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

// Google-Anmeldung starten. Antwort: Adresse, zu der die App weiterleitet.
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

// Rückkehr von Google. Läuft im Browser als normale Seite (ohne pinn.-Anmeldung) und leitet danach
// zurück in die App: /?google=verbunden bzw. /?google=fehler&grund=...
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

    // Persönliche Anmeldung (eigene Kalender „Nur für mich“)? Dann führt die Rückkehr zu den eigenen
    // Kalendern statt zu den Familienkalendern (&privat=1).
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
        // Bereits verknüpfte eigene Google-Kalender gleich abgleichen (z. B. nach erneutem Verbinden)
        try { require(`${__hooks}/pinn-kalender.js`).syncLinkedForUser(result.userId, "google"); } catch (err) { /* nächster Cron-Lauf */ }
        let ptarget = "/?google=verbunden&privat=1";
        if (result.warning) ptarget += "&hinweis=" + encodeURIComponent(result.warning);
        return e.html(200, page("Google verbunden", "Verbunden mit " + result.account + ". Jetzt in pinn. einen Google-Kalender für dich auswählen.", ptarget));
    }
    // Bestehende Kalenderauswahl gleich abgleichen (z. B. nach erneutem Verbinden)
    try { require(`${__hooks}/calendar-sync.js`).syncFamily(result.familyId); } catch (err) { /* nächster Cron-Lauf */ }
    let target = "/?google=verbunden";
    if (result.warning) target += "&hinweis=" + encodeURIComponent(result.warning);
    return e.html(200, page("Google-Kalender verbunden", "Verbunden mit " + result.account + ". Jetzt in pinn. die Kalender auswählen.", target));
});

// Verbindung der eigenen Familie trennen und die Kalenderdatei neu schreiben (iCloud-Termine bleiben).
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
    try { require(`${__hooks}/calendar-sync.js`).syncFamily(familyId); } catch (err) { /* egal */ }
    console.log("[Google-Zugang] Google-Konto für Familie " + familyId + " getrennt.");
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));
