// pb_hooks/muell.pb.js
// The family's waste calendar (Settings → Calendar → Waste calendar). The logic lives in pinn-muell.js.
//
// On start (via pinn-schema.js): creates the locked collection "muellkalender" (exactly one calendar per family).
//
// Signed in (all profiles of the family, also guests - read only):
//   GET  /api/pinn/muell?stand=...           { kalender, termine[{d,t}], stand, darfAendern, ki }
//                                            with the same stand only { unveraendert: true }
// Family admins only:
//   POST /api/pinn/muell/suche               { adresse? | strasse, plz, ort | zuhause: true }
//                                            -> { adresse, entsorger, treffer[], seiten[], hinweis }  (AI, takes up to ~2 min.)
//   POST /api/pinn/muell/uebernehmen         { url, anbieter?, titel?, adresse? }  replaces the previous calendar
//   POST /api/pinn/muell/datei               { name, text, adresse? }              upload an ICS file, replaces the previous one
//   POST /api/pinn/muell/optionen            { anzeigen?, ausgeblendet?[] }
//   POST /api/pinn/muell/aktualisieren       reload the link immediately (at most every 2 minutes)
//   POST /api/pinn/muell/entfernen
//
// Errors are additionally in the admin error log (pinn-protokoll.js).
// Schedule: Mondays 5:15 a.m. - reload calendars with a link that were last checked more than 6 days ago.

cronAdd("pinnMuellCron", "15 5 * * 1", () => {
    try {
        require(`${__hooks}/pinn-muell.js`).runCron();
    } catch (err) {
        console.log("[Müll] Zeitplan fehlgeschlagen: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("muell", "Müllkalender-Zeitplan fehlgeschlagen: " + err.message); } catch (e2) { /* ignore */ }
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
        try { require(`${__hooks}/pinn-protokoll.js`).warnung("muell", "Müllkalender-Suche fehlgeschlagen: " + err.message, { familie: e.auth.getString("familie") }); } catch (e2) { /* ignore */ }
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
