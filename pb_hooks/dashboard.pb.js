// pb_hooks/dashboard.pb.js
// Family dashboard (e.g. an iPad in the kitchen): profile selection with a PIN.
// The logic lives in pinn-dashboard.js, the collection is created by pinn-benutzer.js at startup.
//
// Without login (only with the key of the dashboard device):
//   POST /api/pinn/dashboard/profile          {key}                        -> family + profiles (with PIN length)
//   POST /api/pinn/dashboard/login            {key, id, pin?, passwort?}  -> login as this profile
//        Since 1.118.4: a profile without a PIN (not a guest) needs its password ("passwort") -
//        without it the answer is 401 { passwort: true }. The app then asks for a new PIN.
//   POST /api/pinn/dashboard/hintergrund-bild {key}                        -> background picture of the family
//
// Logged in:
//   POST /api/pinn/dashboard/aktivieren       {name}            (admin) this device as a dashboard
//   GET  /api/pinn/dashboard/pins                               own PIN length, pflicht (PIN required)
//                                                               (+ all profiles for admins)
//   POST /api/pinn/dashboard/pin              {pin}             set the own PIN ("" = remove, not while required)
//   POST /api/pinn/dashboard/pin-entfernen    {id}              (admin) remove the PIN of a profile
//   GET  /api/pinn/dashboard/geraete                            (admin) dashboard devices of the family
//   POST /api/pinn/dashboard/geraet-entfernen {id}              (admin) remove a dashboard device
//   GET  /api/pinn/dashboard/hintergrund                        background of the own family (with picture)
//   POST /api/pinn/dashboard/hintergrund      {stil, bild?}     (admin) save the background
//        leave out bild = picture stays, bild "" = remove the picture, otherwise new image data (data:image/…)
//
// No schedule - something only runs when somebody uses the dashboard.
// At server start duplicate dashboard devices are merged once (earlier app updates created a new
// device each time it was set up again).

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { /* ignore */ }
    try {
        const dash = require(`${__hooks}/pinn-dashboard.js`);
        if (dash.ensureSchema()) dash.doppelteZusammenfuehren();
    } catch (err) {
        console.log("[Dashboard] Zusammenführen fehlgeschlagen: " + err.message);
    }
});

// ---------------------------------------------------------------------------------------------
// Dashboard device (without login)
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

// Background picture for the dashboard device (only if the stamp changed - the app remembers it)
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
            sleep(400); // slows down trying out PINs
            const lock = dash.registerFail(rec.id);
            if (lock) {
                return e.json(429, { error: "Falsche PIN. Zu viele Fehlversuche – bitte in " + dash.waitText(lock) + " erneut versuchen.", sperre: lock });
            }
            return e.json(400, { error: "Falsche PIN.", falsch: true });
        }
        dash.clearFails(rec.id);
    } else if (dash.needsPin(rec)) {
        // No PIN yet: only with the password of the profile (the app asks for a new PIN right after)
        const password = String(body.passwort || "");
        if (!password) {
            return e.json(401, { error: "Dieses Profil hat noch keine PIN. Bitte einmal mit dem Passwort anmelden.", passwort: true });
        }
        const wait = dash.lockedFor(rec.id);
        if (wait) {
            return e.json(429, { error: "Zu viele Fehlversuche. Bitte in " + dash.waitText(wait) + " erneut versuchen.", sperre: wait });
        }
        let ok = false;
        try { ok = rec.validatePassword(password); } catch (err) { ok = false; }
        if (!ok) {
            sleep(400); // slows down trying out passwords
            const lock = dash.registerFail(rec.id);
            if (lock) {
                return e.json(429, { error: "Falsches Passwort. Zu viele Fehlversuche – bitte in " + dash.waitText(lock) + " erneut versuchen.", sperre: lock });
            }
            return e.json(400, { error: "Falsches Passwort.", falsch: true, passwort: true });
        }
        dash.clearFails(rec.id);
    }
    dash.touchDevice(dev);
    return $apis.recordAuthResponse(e, rec);
});

// ---------------------------------------------------------------------------------------------
// Setting up and managing (logged in)
// ---------------------------------------------------------------------------------------------
routerAdd("POST", "/api/pinn/dashboard/aktivieren", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const familyId = lib.familyOf(e);
    if (!lib.isAdmin(e) || !familyId) return e.json(403, { error: "Nur ein Admin der Familie kann ein Dashboard einrichten." });
    const body = e.requestInfo().body;
    try {
        // Same device set up again? Then the existing entry is used further
        // (device cookie or device type/browser, not the network address)
        let opts = {};
        try {
            const sitz = require(`${__hooks}/pinn-sitzungen.js`);
            const k = sitz.geraetKennung(e);
            let agent = "";
            try { agent = String(e.request.header.get("User-Agent") || ""); } catch (err2) { agent = ""; }
            opts = { kennung: k.id, kennungNeu: k.neu, merkmal: sitz.merkmalOf("dashboard-geraet", "", agent) };
        } catch (err2) { opts = {}; }
        const d = dash.newDevice(familyId, body.name, e.auth.id, opts);
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
    let me = null;
    try { me = $app.findRecordById(lib.USERS, e.auth.id); own = dash.pinLength(me); } catch (err) { own = 0; }
    const profiles = {};
    const familyId = lib.familyOf(e);
    // PIN required: the family has a dashboard and this profile is not a guest
    const required = !!me && dash.needsPin(me) && dash.pinRequired(familyId);
    if (lib.isAdmin(e) && familyId) {
        try {
            $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: familyId }).forEach(r => {
                profiles[r.id] = dash.pinLength(r);
            });
        } catch (err) { /* empty */ }
    }
    return e.json(200, { eigene: own, profile: profiles, pflicht: required });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/dashboard/pin", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keine PIN." });
    if (!lib.familyOf(e)) return e.json(400, { error: "Eine PIN gibt es nur für Profile einer Familie." });
    const body = e.requestInfo().body;
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, e.auth.id); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!String(body.pin || "").trim() && dash.needsPin(rec) && dash.pinRequired(lib.familyOf(e))) {
        return e.json(400, { error: "Solange ein Familien-Dashboard eingerichtet ist, braucht jedes Profil eine PIN.", pflicht: true });
    }
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
// Background of the dashboard (per family)
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
