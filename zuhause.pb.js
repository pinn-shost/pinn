// pb_hooks/zuhause.pb.js
// Einstellungen → Zuhause (je Familie). Die Logik steckt in pinn-zuhause.js.
//
// Beim Start: legt die gesperrte Sammlung "zuhause" an.
//
// Angemeldet:
//   GET  /api/pinn/zuhause                       { zuhause, optionen, darfAendern }
//   POST /api/pinn/zuhause                       Adresse (Treffer aus der Suche) speichern       (nur Admins)
//   POST /api/pinn/zuhause/optionen              { feiertage?, ferien?, bundesland? }            (nur Admins)
//   POST /api/pinn/zuhause/entfernen                                                              (nur Admins)
//   GET  /api/pinn/zuhause/suche?q=...(&weit=1)  Adressvorschläge beim Tippen (weit: Reiseziele)  (keine Gäste)
//   GET  /api/pinn/zuhause/adresse?lat=&lon=     Adresse zum aktuellen Standort                  (keine Gäste)
//   GET  /api/pinn/zuhause/ferien?jahr=2026      Schulferien des Bundeslands der Familie
//   POST /api/pinn/zuhause/wetter-tag            { datum, lat?, lon? }  Stundenverlauf eines Tages (ohne lat/lon: Zuhause)
//   POST /api/pinn/zuhause/reisewetter           { lat, lon, von, bis } Urlaubswetter: Vorhersage + Erfahrungswerte
//
// Angemeldet ODER mit dem Schlüssel des Familien-Dashboards (Wetter schon vor der Profilauswahl):
//   POST /api/pinn/zuhause/wetter                { key?, lat?, lon? }  lat/lon nur, solange kein Zuhause festgelegt ist
//
// Kein Zeitplan - es läuft nur etwas, wenn die App fragt (Wetter 15 Min., Stundenverlauf und Reisewetter 30 Min.,
// Erfahrungswerte 7 Tage, Ferien 14 Tage zwischengespeichert).

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-zuhause.js`).ensureSchema();
    } catch (err) {
        console.log("[Zuhause] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/zuhause", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { zuhause: null, optionen: null, darfAendern: false });
    try {
        const out = require(`${__hooks}/pinn-zuhause.js`).info(familyId);
        out.darfAendern = lib.isAdmin(e);
        return e.json(200, out);
    } catch (err) {
        return e.json(200, { zuhause: null, optionen: null, darfAendern: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zuhause", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-zuhause.js`).save(e, e.requestInfo().body || {});
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zuhause/optionen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-zuhause.js`).setOptions(e, e.requestInfo().body || {});
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zuhause/entfernen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const out = require(`${__hooks}/pinn-zuhause.js`).remove(e);
        out.darfAendern = true;
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/zuhause/suche", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        const q = e.request.url.query();
        return e.json(200, require(`${__hooks}/pinn-zuhause.js`).suggest(e, q.get("q") || "", q.get("weit") === "1"));
    } catch (err) {
        return e.json(200, { treffer: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/zuhause/adresse", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    const q = e.request.url.query();
    try {
        return e.json(200, require(`${__hooks}/pinn-zuhause.js`).reverse(Number(q.get("lat")), Number(q.get("lon"))));
    } catch (err) {
        return e.json(200, { treffer: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/zuhause/ferien", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { bundesland: "", ferien: [] });
    const z = require(`${__hooks}/pinn-zuhause.js`);
    const jahr = e.request.url.query().get("jahr") || String(new Date().getFullYear());
    try {
        const opt = z.optionsOf(familyId);
        return e.json(200, z.schoolHolidays(opt.bundesland, jahr));
    } catch (err) {
        return e.json(200, { bundesland: "", ferien: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zuhause/wetter", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const body = e.requestInfo().body || {};
    let familyId = "";
    let angemeldet = false;
    try { angemeldet = !!(e.auth && e.auth.collection().name === lib.USERS); } catch (err) { angemeldet = false; }
    if (angemeldet) {
        familyId = lib.familyOf(e);
    } else {
        // Familien-Dashboard vor der Profilauswahl: nur mit gültigem Geräte-Schlüssel
        const dev = require(`${__hooks}/pinn-dashboard.js`).findDevice(body.key);
        if (!dev) {
            sleep(300);
            return e.json(403, { error: "Nicht angemeldet." });
        }
        familyId = dev.getString("familie");
    }
    try {
        return e.json(200, require(`${__hooks}/pinn-zuhause.js`).weather(familyId, body.lat, body.lon));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
});

routerAdd("POST", "/api/pinn/zuhause/wetter-tag", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-zuhause.js`).weatherDay(lib.familyOf(e), body.datum, body.lat, body.lon));
    } catch (err) {
        return e.json(200, { stunden: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/zuhause/reisewetter", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-zuhause.js`).tripWeather(Number(body.lat), Number(body.lon), body.von, body.bis));
    } catch (err) {
        return e.json(200, { tage: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));
