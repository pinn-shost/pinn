// pb_hooks/muell.pb.js
// Müllkalender der Familie (Einstellungen → Kalender → Müllkalender). Die Logik steckt in pinn-muell.js.
//
// Beim Start: legt die gesperrte Sammlung "muellkalender" an (je Familie genau ein Kalender).
//
// Angemeldet (alle Profile der Familie, auch Gäste – nur lesen):
//   GET  /api/pinn/muell?stand=...           { kalender, termine[{d,t}], stand, darfAendern, ki }
//                                            bei gleichem stand nur { unveraendert: true }
// Nur Admins der Familie:
//   POST /api/pinn/muell/suche               { adresse? | strasse, plz, ort | zuhause: true }
//                                            -> { adresse, entsorger, treffer[], seiten[], hinweis }  (KI, dauert bis ~2 Min.)
//   POST /api/pinn/muell/uebernehmen         { url, anbieter?, titel?, adresse? }  ersetzt den bisherigen Kalender
//   POST /api/pinn/muell/datei               { name, text, adresse? }              ICS-Datei hochladen, ersetzt den bisherigen
//   POST /api/pinn/muell/optionen            { anzeigen?, ausgeblendet?[] }
//   POST /api/pinn/muell/aktualisieren       Link sofort neu laden (höchstens alle 2 Minuten)
//   POST /api/pinn/muell/entfernen
//
// Fehler stehen zusätzlich im Admin-Fehlerprotokoll (pinn-protokoll.js).
// Zeitplan: montags 5:15 Uhr – Kalender mit Link, die älter als 6 Tage geprüft sind, neu laden.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-muell.js`).ensureSchema();
    } catch (err) {
        console.log("[Müll] Einrichtung fehlgeschlagen: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("muell", "Müllkalender-Einrichtung fehlgeschlagen: " + err.message); } catch (e2) { /* egal */ }
    }
});

cronAdd("pinnMuellCron", "15 5 * * 1", () => {
    try {
        require(`${__hooks}/pinn-muell.js`).runCron();
    } catch (err) {
        console.log("[Müll] Zeitplan fehlgeschlagen: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("muell", "Müllkalender-Zeitplan fehlgeschlagen: " + err.message); } catch (e2) { /* egal */ }
    }
});

routerAdd("GET", "/api/pinn/muell", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    const m = require(`${__hooks}/pinn-muell.js`);
    const extra = { darfAendern: lib.isAdmin(e) && !lib.isGuest(e), ki: m.status().ki };
    if (!familyId) return e.json(200, Object.assign({ kalender: null, termine: [], stand: 0 }, extra));
    try {
        return e.json(200, Object.assign(m.forFamily(familyId, e.request.url.query().get("stand") || ""), extra));
    } catch (err) {
        return e.json(200, Object.assign({ kalender: null, termine: [], stand: 0, error: err.message }, extra));
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/suche", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-muell.js`).suche(e, e.requestInfo().body || {}));
    } catch (err) {
        console.log("[Müll] Suche fehlgeschlagen: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).warnung("muell", "Müllkalender-Suche fehlgeschlagen: " + err.message, { familie: e.auth.getString("familie") }); } catch (e2) { /* egal */ }
        return e.json(422, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/uebernehmen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-muell.js`).uebernehmen(e, e.requestInfo().body || {});
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/datei", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-muell.js`).datei(e, e.requestInfo().body || {});
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/optionen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-muell.js`).optionen(e, e.requestInfo().body || {});
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/aktualisieren", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-muell.js`).aktualisieren(e);
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/muell/entfernen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-muell.js`).entfernen(e);
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
