// pb_hooks/smarthome.pb.js
// Smarthome (Einstellungen → Smarthome bzw. Haushalt → Haus-Symbol). Die Logik steckt in pinn-smarthome.js.
//
// Beim Start: legt die gesperrte Sammlung "smarthome_zugaenge" an bzw. ergänzt das Feld "ha".
// Zeitplan: jede Minute – Home Assistant: fällige Automatik-Starts, eingereihte Aktionen, „Beim Abhaken“.
//
// Öffentlich, nur mit Token (für den Apple-Kurzbefehl „pinn Automatik“):
//   GET  /api/pinn/smart/automatik?token=...   -> { aktionen: [{ kurzbefehl, eingabe, aktion, geraet, aufgabe, art }], anzahl, wartend, zeit }
// Angemeldet:
//   GET  /api/pinn/smart/status                -> { aktiv, token, abruf, belegt, wartend, ha: { verbunden, url, version, ... } }
//   POST /api/pinn/smart/gemeldet              { taskId, art: "start" | "done", actionId? }  App hat Apple-Kurzbefehl gestartet
//   POST /api/pinn/smart/ha/ausfuehren         { taskId?, actionId, art: "start" | "done" } -> { gestartet } | { eingereiht, ab }
// Angemeldet, keine Gäste:
//   POST /api/pinn/smart/einrichten            Apple-Automatik: neuen Link erzeugen (alter wird ungültig)
//   POST /api/pinn/smart/ausschalten           Apple-Automatik: Link löschen
//   POST /api/pinn/smart/ha/verbinden          { url, token? }  prüft und speichert den Zugang
//   POST /api/pinn/smart/ha/trennen
//   GET  /api/pinn/smart/ha/entitaeten         -> { entitaeten: [{ id, name, domain, state }] }
//   POST /api/pinn/smart/ha/test               { entity, service, data? } | { ha: { kind: "segments", … }, raum }
//   POST /api/pinn/smart/ha/sauger             { entity: vacuum.… } -> { raeume, fanSpeeds, water, mopMode, sensoren, … }

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

// Nur Nicht-Gäste: Einrichtung (Handler einzeln - PocketBase führt jeden isoliert aus)
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
