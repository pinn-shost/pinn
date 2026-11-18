// pb_hooks/sicherheit.pb.js
// Security overview (since 1.153.0): groups of Home Assistant devices (windows & doors, locks, cameras, garage door /
// shutters, smoke & water detectors, alarm system, motion). The logic lives in pinn-sicherheit.js.
//
// On startup (via pinn-schema.js): creates the locked collection "sicherheit".
// Schedule: every minute - evening check (push to the family admins if something is still open at the set time).
//
// Dashboard device (key only, no login):
//   POST /api/pinn/sicherheit/dashboard        { key } -> { aktiv, gruppen: [{ id, name, art, icon, stufe, anzahl, aktiv, offline }], fehler? }
// Signed in, no guests:
//   GET  /api/pinn/sicherheit/status           -> same as above, with entity IDs (for locking)
//   POST /api/pinn/sicherheit/zusperren        { entity: lock.… }  adults only (no children)
// Family admin:
//   GET  /api/pinn/sicherheit/einstellungen    -> { einstellungen, haVerbunden }
//   POST /api/pinn/sicherheit/einstellungen    { einstellungen } -> { einstellungen, haVerbunden }
//   GET  /api/pinn/sicherheit/entitaeten       -> { entitaeten: [{ id, name, domain, dc, state }] }

cronAdd("pinnSicherheitAbend", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-sicherheit.js`).abendCron();
    } catch (err) {
        console.log("[Sicherheit] Zeitplan fehlgeschlagen: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/sicherheit/dashboard", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const body = e.requestInfo().body || {};
    const dev = dash.findDevice(body.key);
    if (!dev) {
        sleep(300);
        try { require(`${__hooks}/pinn-alarm.js`).zaehleUndMelde(e, "schluessel", 20, 15 * 60 * 1000); } catch (err) { /* ignore */ }
        return e.json(404, { error: "Dieses Gerät ist nicht (mehr) als Familien-Dashboard eingerichtet.", ungueltig: true });
    }
    try {
        return e.json(200, require(`${__hooks}/pinn-sicherheit.js`).status(dev.getString("familie"), "dashboard"));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
});

routerAdd("GET", "/api/pinn/sicherheit/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-sicherheit.js`).status(lib.familyOf(e), "app"));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sicherheit/zusperren", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const sec = require(`${__hooks}/pinn-sicherheit.js`);
    if (lib.isGuest(e) || sec.isChildProfile(e.auth)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, sec.zusperren(lib.familyOf(e), (e.requestInfo().body || {}).entity));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/sicherheit/einstellungen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e) || !lib.familyOf(e)) return e.json(403, { error: "Das geht nur bei Admins einer Familie." });
    try {
        return e.json(200, require(`${__hooks}/pinn-sicherheit.js`).einstellungen(lib.familyOf(e)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sicherheit/einstellungen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e) || !lib.familyOf(e)) return e.json(403, { error: "Das geht nur bei Admins einer Familie." });
    try {
        return e.json(200, require(`${__hooks}/pinn-sicherheit.js`).speichern(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/sicherheit/entitaeten", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e) || !lib.familyOf(e)) return e.json(403, { error: "Das geht nur bei Admins einer Familie." });
    try {
        return e.json(200, require(`${__hooks}/pinn-sicherheit.js`).entitaeten(lib.familyOf(e)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
