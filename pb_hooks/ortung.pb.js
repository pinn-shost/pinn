// pb_hooks/ortung.pb.js
// Family → Location. The logic lives in pinn-ortung.js.
//
// On start (via pinn-schema.js): creates the locked collection "ortung" (per family devices, places, way home).
//
// Routes (signed in, not for guest accounts):
//   GET  /api/pinn/ortung/status          devices, places, current positions (only with a shared location)
//   POST /api/pinn/ortung/geraet          { id?, memberId, name, emoji, typ, uniqueId }   (admins only)
//   POST /api/pinn/ortung/geraet-loeschen { id }                                          (admins only)
//   POST /api/pinn/ortung/teilen          { id, an }      share location (the person themselves or admins)
//   POST /api/pinn/ortung/standort-teilen { an, minuten, zuhause, push, lat?, lon?, genau? }
//                                         start/stop the own share with a duration (creates the
//                                         own phone if needed - without Traccar) -> { ok, id, bis, endeZuhause }
//   POST /api/pinn/ortung/standort-einmal { lat, lon, genau?, push }  "Send once": exactly this location,
//                                         visible for 1 hour, without sharing permanently -> { ok, id, bis }
//   POST /api/pinn/ortung/standort        { lat, lon, genau?, tempo?, kurs? }  new location from the open
//                                         pinn. app (only while a share is running)
//   POST /api/pinn/ortung/ort             { ort: {...} }  create/change a known place
//   POST /api/pinn/ortung/ort-loeschen    { id } or { laden: <list ID> } (all branches of the store)
//   POST /api/pinn/ortung/laden           { laden: <list ID>, name, filialen: [{ id, lat, lon, adresse }],
//                                           verweil, abhaken, erledigtPush, erinnern, ankunft }
//                                         save a store with all branches (several addresses, e.g. two Rewe)
//                                         Stores: /ort with { ort: { laden: <list ID>, adresse, verweil, abhaken, erinnern, erledigtPush, ... } }
//   POST /api/pinn/ortung/einkaeufe       { plaene: [{ aufgabe, titel, listen }] }  open "plan shopping" tasks
//                                         -> { erledigt: [...] }  shopping trips ticked off by the server (for the bell)
//   POST /api/pinn/ortung/unterwegs       { an }          "I'm on my way" (own device) -> { ok, id }
//   POST /api/pinn/ortung/spur            { geraet, stunden }  history of a device
//   GET  /api/pinn/ortung/suche?q=...     address search (or ?lat=&lon= for the address of a point)
//   GET  /api/pinn/ortung/sos             running (and just finished) SOS of the family with the current location
//                                         + heimwege: running (and just finished) ways home with location
//   POST /api/pinn/ortung/sos-ende        { id }          all-clear - push to all
//   POST /api/pinn/ortung/sos-ausloesen   { lat?, lon?, genau? }  SOS button in pinn. (own device) -> { ok, id }
//   POST /api/pinn/ortung/sos-test        { geraet }      SOS test, push and popup only for me  (admins only)
//   GET  /api/pinn/ortung/protokoll       latest reports of the own devices (fields, alarm, SOS detected) (admins only)
//
// Without sign-in:
//   GET  /api/pinn/ortung/kachel/{z}/{x}/{y}   map tile (OpenStreetMap, cached)
//   GET|POST /api/pinn/ortung/osmand           positions from the "Traccar Client" app -> pinn. stores them itself
//                                              (additionally to Traccar, port 5055, if the container is running)
//                                              alarm=sos (SOS button) -> immediate push to the whole family
//   GET|POST /?id=...&lat=...&alarm=sos         the same if only the pinn. address is entered in Traccar Client
//
// Schedule: every minute check SOS events from Traccar (trackers, phones sending directly),
//           arriving at/leaving places (only if places or ways home exist),
//           dwelling in stores -> tick off the planned shopping trip.

// Intercept reports from "Traccar Client" at the main address (e.g. /?id=123456&lat=..&lon=..&alarm=sos)
// before they are delivered as a normal page.
routerUse((e) => {
    let lib = null;
    try { lib = require(`${__hooks}/pinn-ortung.js`); } catch (err) { return e.next(); }
    if (!lib.isOsmandRequest(e)) return e.next();
    try {
        return e.string(lib.forwardOsmand(e), "");
    } catch (err) {
        console.log("[Ortung] Meldung an „/“: " + err.message);
        return e.string(502, "");
    }
});

cronAdd("pinnOrtung", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-ortung.js`).runCron();
    } catch (err) {
        console.log("[Ortung] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/ortung/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten sehen keine Standorte." });
    if (!lib.familyOf(e)) return e.json(200, { geraete: [], orte: [], unterwegs: {}, verbunden: false, fehler: "Keine Familie." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).status(e));
    } catch (err) {
        return e.json(200, { geraete: [], orte: [], unterwegs: {}, verbunden: false, fehler: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/geraet", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).saveDevice(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/geraet-loeschen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).deleteDevice(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/teilen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).setSharing(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/standort-teilen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).shareStart(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/standort-einmal", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).shareOnce(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/standort", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).sharePosition(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/ort", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).savePlace(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/laden", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).saveShop(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/ort-loeschen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).deletePlace(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/einkaeufe", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).syncPlans(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/unterwegs", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).setUnterwegs(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/spur", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).track(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(200, { punkte: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/ortung/suche", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    const q = e.request.url.query();
    try {
        const lat = q.get("lat"), lon = q.get("lon");
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).search(q.get("q") || "", lat === "" ? NaN : Number(lat), lon === "" ? NaN : Number(lon)));
    } catch (err) {
        return e.json(200, { treffer: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/ortung/sos", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(200, { sos: [], heimwege: [], jetzt: Date.now() });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).sosList(e));
    } catch (err) {
        return e.json(200, { sos: [], heimwege: [], jetzt: Date.now(), error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/sos-ende", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).sosEnde(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/sos-ausloesen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).sosAusloesen(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ortung/sos-test", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).sosTest(e, e.requestInfo().body || {}));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/ortung/protokoll", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Nicht erlaubt." });
    try {
        return e.json(200, require(`${__hooks}/pinn-ortung.js`).osmandLog(e));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/ortung/kachel/{z}/{x}/{y}", (e) => {
    let bytes = null;
    try {
        bytes = require(`${__hooks}/pinn-ortung.js`).tile(e.request.pathValue("z"), e.request.pathValue("x"), e.request.pathValue("y"));
    } catch (err) {
        bytes = null;
    }
    if (!bytes) return e.string(404, "");
    e.response.header().set("Cache-Control", "public, max-age=604800");
    return e.blob(200, "image/png", bytes);
});

routerAdd("GET", "/api/pinn/ortung/osmand", (e) => {
    try {
        return e.string(require(`${__hooks}/pinn-ortung.js`).forwardOsmand(e), "");
    } catch (err) {
        return e.string(502, "");
    }
});
routerAdd("POST", "/api/pinn/ortung/osmand", (e) => {
    try {
        return e.string(require(`${__hooks}/pinn-ortung.js`).forwardOsmand(e), "");
    } catch (err) {
        return e.string(502, "");
    }
});
