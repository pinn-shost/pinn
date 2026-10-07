// pb_hooks/einrichtung.pb.js
// Ersteinrichtung von pinn. – Routen für den Einrichtungs-Assistenten des Hauptadmins.
// Die eigentliche Arbeit steckt in pinn-einrichtung.js (Speichern, Prüfen, Neustart).
//
//  GET  /api/pinn/einrichtung/offen        ohne Anmeldung: nur { offen, fertig } für die Anmeldemaske
//  GET  /api/pinn/einrichtung              Hauptadmin: alle Werte (Schlüssel nur maskiert), Status
//  POST /api/pinn/einrichtung/speichern    Hauptadmin: { werte, meta } zwischenspeichern
//  POST /api/pinn/einrichtung/test         Hauptadmin: { art, werte } – DuckDNS, Google, KI, Traccar, Home Assistant
//  POST /api/pinn/einrichtung/abschliessen Hauptadmin: { werte, meta } speichern, fertig markieren, neu starten
//  POST /api/pinn/einrichtung/neustart     Hauptadmin: pinn. neu starten (übernimmt gespeicherte Werte)

onBootstrap((e) => {
    e.next();
    try {
        const lib = require(`${__hooks}/pinn-einrichtung.js`);
        lib.markBoot();
        lib.neustartErledigt();
        const o = lib.ordnerStatus();
        const st = lib.load();
        console.log("[Einrichtung] Ordner konfig: " + o + ", Einrichtung " + (st.fertig ? "abgeschlossen" : "offen") + ".");
    } catch (err) {
        console.log("[Einrichtung] Start: " + err.message);
    }
});

// Fallback, falls der sofortige Neustart nicht geklappt hat
cronAdd("pinnEinrichtungNeustart", "* * * * *", () => {
    try {
        const lib = require(`${__hooks}/pinn-einrichtung.js`);
        if (lib.neustartFaellig()) {
            console.log("[Einrichtung] Neustart für neue Einstellungen …");
            lib.neustartErledigt();
            $os.exit(0);
        }
    } catch (err) { /* egal */ }
});

function pinnEinrichtungFehler(e, err) {
    return e.json(400, { error: err.message, code: err.pinnCode || "fehler", feld: err.pinnFeld || "" });
}

routerAdd("GET", "/api/pinn/einrichtung/offen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-einrichtung.js`).offen());
    } catch (err) {
        return e.json(200, { offen: false, fertig: false });
    }
});

routerAdd("GET", "/api/pinn/einrichtung", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. einrichten." });
    try {
        return e.json(200, require(`${__hooks}/pinn-einrichtung.js`).status());
    } catch (err) {
        return e.json(500, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/einrichtung/speichern", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. einrichten." });
    const lib = require(`${__hooks}/pinn-einrichtung.js`);
    const body = e.requestInfo().body || {};
    try {
        const st = lib.merge(lib.load(), body.werte, body.meta);
        lib.save(st);
        return e.json(200, lib.status());
    } catch (err) {
        return pinnEinrichtungFehler(e, err);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/einrichtung/test", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. einrichten." });
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-einrichtung.js`).test(String(body.art || ""), body.werte || {}));
    } catch (err) {
        return e.json(200, { ok: false, code: "netz", details: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/einrichtung/abschliessen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. einrichten." });
    const lib = require(`${__hooks}/pinn-einrichtung.js`);
    const body = e.requestInfo().body || {};
    try {
        const st = lib.merge(lib.load(), body.werte, body.meta);
        st.fertig = true;
        st.abgeschlossen = Date.now();
        lib.save(st);
        const out = lib.status();
        out.neustart = out.neustartNoetig ? lib.neustart() : false;
        return e.json(200, out);
    } catch (err) {
        return pinnEinrichtungFehler(e, err);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/einrichtung/neustart", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. neu starten." });
    const ok = require(`${__hooks}/pinn-einrichtung.js`).neustart();
    return e.json(200, { neustart: true, sofort: ok });
}, $apis.requireAuth("benutzer"));
