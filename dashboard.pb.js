// pb_hooks/dashboard.pb.js
// Familien-Dashboard (z. B. iPad in der Küche): Profilauswahl mit optionaler PIN.
// Die Logik steckt in pinn-dashboard.js, die Sammlung legt pinn-benutzer.js beim Start mit an.
//
// Ohne Anmeldung (nur mit dem Schlüssel des Dashboard-Geräts):
//   POST /api/pinn/dashboard/profile          {key}             -> Familie + Profile (mit PIN-Länge)
//   POST /api/pinn/dashboard/login            {key, id, pin?}   -> Anmeldung als dieses Profil
//   POST /api/pinn/dashboard/hintergrund-bild {key}             -> Hintergrundbild der Familie
//
// Angemeldet:
//   POST /api/pinn/dashboard/aktivieren       {name}            (Admin) dieses Gerät als Dashboard
//   GET  /api/pinn/dashboard/pins                               eigene PIN-Länge (+ alle Profile für Admins)
//   POST /api/pinn/dashboard/pin              {pin}             eigene PIN setzen ("" = entfernen)
//   POST /api/pinn/dashboard/pin-entfernen    {id}              (Admin) PIN eines Profils entfernen
//   GET  /api/pinn/dashboard/geraete                            (Admin) Dashboard-Geräte der Familie
//   POST /api/pinn/dashboard/geraet-entfernen {id}              (Admin) Dashboard-Gerät entfernen
//   GET  /api/pinn/dashboard/hintergrund                        Hintergrund der eigenen Familie (mit Bild)
//   POST /api/pinn/dashboard/hintergrund      {stil, bild?}     (Admin) Hintergrund speichern
//        bild weglassen = Bild bleibt, bild "" = Bild entfernen, sonst neue Bild-Daten (data:image/…)
//
// Kein Zeitplan - es läuft nur etwas, wenn jemand das Dashboard benutzt.

// ---------------------------------------------------------------------------------------------
// Dashboard-Gerät (ohne Anmeldung)
// ---------------------------------------------------------------------------------------------
routerAdd("POST", "/api/pinn/dashboard/profile", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    e.response.header().set("Cache-Control", "no-store");
    const body = e.requestInfo().body;
    const dev = dash.findDevice(body.key);
    if (!dev) {
        sleep(300);
        return e.json(404, { error: "Dieses Gerät ist nicht (mehr) als Familien-Dashboard eingerichtet.", ungueltig: true });
    }
    let fam = null;
    try { fam = $app.findRecordById(lib.FAMILIEN, dev.getString("familie")); } catch (err) { fam = null; }
    if (!fam) return e.json(404, { error: "Die Familie dieses Dashboards gibt es nicht mehr.", ungueltig: true });
    dash.touchDevice(dev);
    return e.json(200, {
        geraet: { id: dev.id, name: dev.getString("name") },
        familie: { id: fam.id, name: fam.getString("name") },
        profile: dash.profilesFor(fam.id),
        hintergrund: dash.backgroundMeta(fam.id),
    });
});

// Hintergrundbild fürs Dashboard-Gerät (nur wenn sich der Stand geändert hat - die App merkt es sich)
routerAdd("POST", "/api/pinn/dashboard/hintergrund-bild", (e) => {
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    e.response.header().set("Cache-Control", "no-store");
    const body = e.requestInfo().body;
    const dev = dash.findDevice(body.key);
    if (!dev) {
        sleep(300);
        return e.json(404, { error: "Dieses Gerät ist nicht (mehr) als Familien-Dashboard eingerichtet.", ungueltig: true });
    }
    const bg = dash.backgroundFull(dev.getString("familie"));
    return e.json(200, { stand: bg.stand, stil: bg.stil, bild: bg.bild });
});

routerAdd("POST", "/api/pinn/dashboard/login", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const body = e.requestInfo().body;
    const dev = dash.findDevice(body.key);
    if (!dev) {
        sleep(300);
        return e.json(404, { error: "Dieses Gerät ist nicht (mehr) als Familien-Dashboard eingerichtet.", ungueltig: true });
    }
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, String(body.id || "")); } catch (err) { rec = null; }
    if (!rec || rec.getString("familie") !== dev.getString("familie") || rec.getString("rolle") === "hauptadmin") {
        return e.json(404, { error: "Dieses Profil gibt es nicht (mehr)." });
    }
    if (dash.pinLength(rec) > 0) {
        const wait = dash.lockedFor(rec.id);
        if (wait) {
            return e.json(429, { error: "Zu viele Fehlversuche. Bitte in " + dash.waitText(wait) + " erneut versuchen.", sperre: wait });
        }
        if (!dash.checkPin(rec, String(body.pin || ""))) {
            sleep(400); // bremst Durchprobieren
            const lock = dash.registerFail(rec.id);
            if (lock) {
                return e.json(429, { error: "Falsche PIN. Zu viele Fehlversuche – bitte in " + dash.waitText(lock) + " erneut versuchen.", sperre: lock });
            }
            return e.json(400, { error: "Falsche PIN.", falsch: true });
        }
        dash.clearFails(rec.id);
    }
    dash.touchDevice(dev);
    return $apis.recordAuthResponse(e, rec);
});

// ---------------------------------------------------------------------------------------------
// Einrichten und Verwalten (angemeldet)
// ---------------------------------------------------------------------------------------------
routerAdd("POST", "/api/pinn/dashboard/aktivieren", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const familyId = lib.familyOf(e);
    if (!lib.isAdmin(e) || !familyId) return e.json(403, { error: "Nur ein Admin der Familie kann ein Dashboard einrichten." });
    const body = e.requestInfo().body;
    try {
        const d = dash.newDevice(familyId, body.name, e.auth.id);
        let famName = "";
        try { famName = $app.findRecordById(lib.FAMILIEN, familyId).getString("name"); } catch (err) { famName = ""; }
        return e.json(200, { success: true, id: d.id, key: d.key, name: d.name, familie: { id: familyId, name: famName } });
    } catch (err) {
        return e.json(400, { error: "Dashboard konnte nicht eingerichtet werden: " + err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/dashboard/pins", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    e.response.header().set("Cache-Control", "no-store");
    let own = 0;
    try { own = dash.pinLength($app.findRecordById(lib.USERS, e.auth.id)); } catch (err) { own = 0; }
    const profiles = {};
    const familyId = lib.familyOf(e);
    if (lib.isAdmin(e) && familyId) {
        try {
            $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: familyId }).forEach(r => {
                profiles[r.id] = dash.pinLength(r);
            });
        } catch (err) { /* leer */ }
    }
    return e.json(200, { eigene: own, profile: profiles });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/dashboard/pin", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keine PIN." });
    if (!lib.familyOf(e)) return e.json(400, { error: "Eine PIN gibt es nur für Profile einer Familie." });
    const body = e.requestInfo().body;
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, e.auth.id); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    try {
        dash.setPin(rec, body.pin);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
    $app.save(rec);
    dash.clearFails(rec.id);
    return e.json(200, { success: true, pin: dash.pinLength(rec) });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/dashboard/pin-entfernen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können die PIN eines anderen Profils entfernen." });
    const body = e.requestInfo().body;
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, String(body.id || "")); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!lib.canManage(e, rec)) return e.json(403, { error: "Dieses Profil gehört zu einer anderen Familie." });
    dash.setPin(rec, "");
    $app.save(rec);
    dash.clearFails(rec.id);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/dashboard/geraete", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    e.response.header().set("Cache-Control", "no-store");
    const familyId = lib.familyOf(e);
    if (!lib.isAdmin(e) || !familyId) return e.json(403, { error: "Nur Admins der Familie sehen die Dashboard-Geräte." });
    return e.json(200, { geraete: dash.listDevices(familyId) });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/dashboard/geraet-entfernen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const familyId = lib.familyOf(e);
    if (!lib.isAdmin(e) || !familyId) return e.json(403, { error: "Nur ein Admin der Familie kann ein Dashboard beenden." });
    const body = e.requestInfo().body;
    try {
        dash.removeDevice(familyId, body.id);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Hintergrund des Dashboards (je Familie)
// ---------------------------------------------------------------------------------------------
routerAdd("GET", "/api/pinn/dashboard/hintergrund", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    e.response.header().set("Cache-Control", "no-store");
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(400, { error: "Dein Profil gehört zu keiner Familie." });
    const bg = dash.backgroundFull(familyId);
    return e.json(200, { stand: bg.stand, stil: bg.stil, bild: bg.bild });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/dashboard/hintergrund", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const familyId = lib.familyOf(e);
    if (!lib.isAdmin(e) || !familyId) return e.json(403, { error: "Nur ein Admin der Familie kann den Hintergrund ändern." });
    const body = e.requestInfo().body || {};
    const raw = body.bild;
    const bild = raw === undefined ? undefined : (raw == null ? "" : String(raw));
    try {
        const meta = dash.saveBackground(familyId, e.auth.id, body.stil, bild);
        return e.json(200, { success: true, stil: meta.stil, stand: meta.stand, bild: meta.bild });
    } catch (err) {
        return e.json(400, { error: "Hintergrund konnte nicht gespeichert werden: " + err.message });
    }
}, $apis.requireAuth("benutzer"));
