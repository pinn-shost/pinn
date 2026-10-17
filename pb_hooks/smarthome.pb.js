// pb_hooks/smarthome.pb.js
// Smart home (Settings → Smart home or Household → house icon). The logic lives in pinn-smarthome.js.
//
// On startup: creates the locked collection "smarthome_zugaenge" or adds the field "ha".
// Schedule: every minute – Home Assistant: due automatic starts, queued actions, "When ticked off",
// plants (watering / mowing) and switching off again after a duration.
//
// Public, token only (for the Apple shortcut "pinn Automatik"):
//   GET  /api/pinn/smart/automatik?token=...   -> { aktionen: [{ kurzbefehl, eingabe, aktion, geraet, aufgabe, art }], anzahl, wartend, zeit }
// Signed in:
//   GET  /api/pinn/smart/status                -> { aktiv, token, abruf, belegt, wartend, pflanzen, ha: { verbunden, url, version, ... } }
//   POST /api/pinn/smart/gemeldet              { taskId, art: "start" | "done", actionId? }  the app started an Apple shortcut
//   POST /api/pinn/smart/ha/ausfuehren         { taskId? | plantId?, actionId, art: "start" | "done" } -> { gestartet } | { eingereiht, ab }
// Signed in, no guests:
//   POST /api/pinn/smart/einrichten            Apple automation: create a new link (the old one stops working)
//   POST /api/pinn/smart/ausschalten           Apple automation: delete the link
//   POST /api/pinn/smart/ha/verbinden          { url, token? }  checks and stores the access
//   POST /api/pinn/smart/ha/trennen
//   GET  /api/pinn/smart/ha/entitaeten         -> { entitaeten: [{ id, name, domain, state }] }
//   POST /api/pinn/smart/ha/test               { entity, service, data? } | { ha: { kind: "segments", … }, raum }
//   POST /api/pinn/smart/ha/sauger             { entity: vacuum.… } -> { raeume, fanSpeeds, water, mopMode, sensoren, … }
//   POST /api/pinn/smart/ha/zustand            { entity } -> { state, unit, name }  (e.g. fill level of a pet feeder)

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-smarthome.js`).ensureSchema();
    } catch (err) {
        console.log("[Smarthome] Einrichtung fehlgeschlagen: " + err.message);
    }
});

cronAdd("pinnSmartHomeHa", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-smarthome.js`).haCron();
    } catch (err) {
        console.log("[Smarthome] Zeitplan fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/smart/automatik", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const token = e.request.url.query().get("token") || "";
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).automatik(token));
    } catch (err) {
        return e.json(403, { aktionen: [], anzahl: 0, error: err.message });
    }
});

routerAdd("GET", "/api/pinn/smart/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    try {
        const st = require(`${__hooks}/pinn-smarthome.js`).status(lib.familyOf(e));
        if (lib.isGuest(e)) { st.token = ""; st.gesperrt = true; }
        return e.json(200, st);
    } catch (err) {
        return e.json(200, { aktiv: false, ha: { verbunden: false }, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/gemeldet", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    try {
        const body = e.requestInfo().body || {};
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).gemeldet(lib.familyOf(e), body.taskId, body.art, body.actionId));
    } catch (err) {
        return e.json(200, { ok: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/ausfuehren", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haAusfuehren(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Non-guests only: setup (one handler each - PocketBase runs every handler isolated)
routerAdd("POST", "/api/pinn/smart/einrichten", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).einrichten(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ausschalten", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).ausschalten(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/verbinden", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haVerbinden(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/trennen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haTrennen(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/smart/ha/entitaeten", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haEntitaeten(lib.familyOf(e), {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/test", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haTest(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/sauger", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haSauger(lib.familyOf(e), e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/smart/ha/zustand", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-smarthome.js`).haStateOf(lib.familyOf(e), (e.requestInfo().body || {}).entity));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
