// pb_hooks/ortung.pb.js
// Familie → Ortung. Die Logik steckt in pinn-ortung.js.
//
// Beim Start: legt die gesperrte Sammlung "ortung" an (je Familie Geräte, Orte, Heimweg).
//
// Routen (angemeldet, nicht für Gastkonten):
//   GET  /api/pinn/ortung/status          Geräte, Orte, aktuelle Positionen (nur bei geteiltem Standort)
//   POST /api/pinn/ortung/geraet          { id?, memberId, name, emoji, typ, uniqueId }   (nur Admins)
//   POST /api/pinn/ortung/geraet-loeschen { id }                                          (nur Admins)
//   POST /api/pinn/ortung/teilen          { id, an }      Standort teilen (die Person selbst oder Admins)
//   POST /api/pinn/ortung/ort             { ort: {...} }  bekannten Ort anlegen/ändern
//   POST /api/pinn/ortung/ort-loeschen    { id } bzw. { laden: <Listen-ID> } (alle Filialen des Ladens)
//   POST /api/pinn/ortung/laden           { laden: <Listen-ID>, name, filialen: [{ id, lat, lon, adresse }],
//                                           verweil, abhaken, erledigtPush, erinnern, ankunft }
//                                         Laden mit allen Filialen (mehrere Adressen, z. B. zwei Rewe) speichern
//                                         Läden: /ort mit { ort: { laden: <Listen-ID>, adresse, verweil, abhaken, erinnern, erledigtPush, ... } }
//   POST /api/pinn/ortung/einkaeufe       { plaene: [{ aufgabe, titel, listen }] }  offene „Einkauf planen“-Aufgaben
//                                         -> { erledigt: [...] }  vom Server abgehakte Einkäufe (für die Glocke)
//   POST /api/pinn/ortung/unterwegs       { an }          „Ich bin unterwegs“ (eigenes Gerät) -> { ok, id }
//   POST /api/pinn/ortung/spur            { geraet, stunden }  Verlauf eines Geräts
//   GET  /api/pinn/ortung/suche?q=...     Adresssuche (bzw. ?lat=&lon= für die Adresse eines Punkts)
//   GET  /api/pinn/ortung/sos             laufende (und gerade beendete) SOS der Familie mit aktuellem Standort
//                                         + heimwege: laufende (und gerade beendete) Heimwege mit Standort
//   POST /api/pinn/ortung/sos-ende        { id }          Entwarnung – Push an alle
//   POST /api/pinn/ortung/sos-ausloesen   { lat?, lon?, genau? }  SOS-Knopf in pinn. (eigenes Gerät) -> { ok, id }
//   POST /api/pinn/ortung/sos-test        { geraet }      SOS-Test, Push und Popup nur für mich  (nur Admins)
//   GET  /api/pinn/ortung/protokoll       letzte Meldungen der eigenen Geräte (Felder, Alarm, SOS erkannt) (nur Admins)
//
// Ohne Anmeldung:
//   GET  /api/pinn/ortung/kachel/{z}/{x}/{y}   Kartenkachel (OpenStreetMap, zwischengespeichert)
//   GET|POST /api/pinn/ortung/osmand           Positionen der App „Traccar Client“ -> Traccar (Port 5055)
//                                              alarm=sos (SOS-Knopf) -> sofort Push an die ganze Familie
//   GET|POST /?id=...&lat=...&alarm=sos         dasselbe, wenn in Traccar Client nur die pinn.-Adresse steht
//
// Zeitplan: jede Minute SOS-Ereignisse aus Traccar prüfen (Tracker, direkt gesendete Handys),
//           Ankommen/Verlassen der Orte (nur wenn Orte oder Heimwege bestehen),
//           Verweilen in Läden -> geplanten Einkauf abhaken.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-ortung.js`).ensureSchema();
    } catch (err) {
        console.log("[Ortung] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Meldungen von „Traccar Client“ an der Hauptadresse abfangen (z. B. /?id=123456&lat=..&lon=..&alarm=sos),
// bevor sie als normale Seite ausgeliefert werden.
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
