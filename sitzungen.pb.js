// pb_hooks/sitzungen.pb.js
// Geräteverwaltung: angemeldete Geräte je Profil mit „Abmelden“. Die Logik steckt in pinn-sitzungen.js.
//
// Beim Start: legt die gesperrte Sammlung "sitzungen" an (ein Datensatz je Gerät und Profil).
//
// Bei jeder Anmeldung eines Profils (Passwort, Familien-Dashboard, Verlängern beim App-Start):
//   Sitzung anlegen bzw. weiterverwenden und das Token mit der Sitzungs-ID ausstellen.
// Bei jeder Anfrage mit Token: gibt es die Sitzung nicht mehr, antwortet pinn. mit 401 und
//   „X-Pinn-Abgemeldet: 1“ – die App löscht dann ihre Daten auf dem Gerät.
//
// Angemeldet (eigenes Profil; Familien-Admins für Profile ihrer Familie; Hauptadmin für alle):
//   GET  /api/pinn/sitzungen?benutzer=          { benutzer, eigenes, sitzungen[], sperre? }
//   GET  /api/pinn/sitzungen/uebersicht?familie= (Admins) je Profil: Anzahl Geräte und Sperre
//   POST /api/pinn/sitzungen/abmelden           { id }  Sitzungs-ID oder "dieses"
//   POST /api/pinn/sitzungen/alle-abmelden      { benutzer? }  eigenes Profil: alle anderen Geräte
//                                               (Antwort: neue Anmeldung für dieses Gerät),
//                                               anderes Profil: überall abmelden
//   POST /api/pinn/sitzungen/entsperren         { benutzer }  (Admins) Sperre nach Fehlversuchen aufheben
//
// Zeitplan: nachts 03:52 Uhr – Sitzungen löschen, deren Anmeldung längst abgelaufen ist.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-sitzungen.js`).ensureSchema();
    } catch (err) {
        console.log("[Geräte] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Jede Anfrage mit Token: Sitzung noch gültig? (schonend, siehe pinn-sitzungen.js)
routerUse((e) => {
    if (e.auth) {
        let ok = true;
        try { ok = require(`${__hooks}/pinn-sitzungen.js`).pruefe(e); } catch (err) { ok = true; }
        if (!ok) {
            e.response.header().set("X-Pinn-Abgemeldet", "1");
            e.response.header().set("Cache-Control", "no-store");
            return e.json(401, { error: "Dieses Gerät wurde in pinn. abgemeldet. Bitte melde dich erneut an.", abgemeldet: true });
        }
    }
    return e.next();
});

// Anmeldung: Sitzung anlegen und das Token mit der Sitzungs-ID ausstellen
onRecordAuthRequest((e) => {
    try {
        require(`${__hooks}/pinn-sitzungen.js`).beimAnmelden(e);
    } catch (err) {
        console.log("[Geräte] Anmeldung nicht erfasst: " + err.message);
    }
    return e.next();
}, "benutzer");

cronAdd("pinnSitzungenAufraeumen", "52 3 * * *", () => {
    try {
        require(`${__hooks}/pinn-sitzungen.js`).aufraeumen();
    } catch (err) {
        console.log("[Geräte] Aufräumen fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/sitzungen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const id = String(e.request.url.query().get("benutzer") || "");
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).liste(e, id));
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/sitzungen/uebersicht", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const fam = String(e.request.url.query().get("familie") || "");
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).uebersicht(e, fam));
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/abmelden", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).abmelden(e, body.id));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/alle-abmelden", (e) => {
    const body = e.requestInfo().body || {};
    let r = null;
    try {
        r = require(`${__hooks}/pinn-sitzungen.js`).alleAbmelden(e, body.benutzer);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
    // Eigenes Profil: dieses Gerät bekommt eine neue, gültige Anmeldung (gleiche Sitzung)
    if (r.own && r.rec) return $apis.recordAuthResponse(e, r.rec);
    return e.json(200, { success: true, abgemeldet: r.anzahl });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/entsperren", (e) => {
    const body = e.requestInfo().body || {};
    try {
        require(`${__hooks}/pinn-sitzungen.js`).entsperren(e, body.benutzer);
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
