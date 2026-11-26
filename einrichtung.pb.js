// pb_hooks/einrichtung.pb.js
// Initial set-up of pinn. - routes for the main admin's set-up wizard.
// The actual work lives in pinn-einrichtung.js (saving, checking, restart).
//
//  GET  /api/pinn/einrichtung/offen        without sign-in: only { offen, fertig } for the sign-in form
//  GET  /api/pinn/einrichtung              main admin: all values (keys only masked), status
//  POST /api/pinn/einrichtung/speichern    main admin: { werte, meta } store temporarily
//  POST /api/pinn/einrichtung/test         main admin: { art, werte } - DuckDNS, Google, AI, Traccar, Home Assistant
//  POST /api/pinn/einrichtung/abschliessen main admin: { werte, meta } save, mark as finished, restart
//  POST /api/pinn/einrichtung/neustart     main admin: restart pinn. (takes over stored values)

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

// Fallback in case the immediate restart did not work
cronAdd("pinnEinrichtungNeustart", "* * * * *", () => {
    try {
        const lib = require(`${__hooks}/pinn-einrichtung.js`);
        if (lib.neustartFaellig()) {
            console.log("[Einrichtung] Neustart für neue Einstellungen …");
            lib.neustartErledigt();
            $os.exit(0);
        }
    } catch (err) { /* ignore */ }
});

// Error response: is directly in every handler (helper functions at file level are not visible in
// PocketBase's isolated handlers).

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
        return e.json(400, { error: err.message, code: err.pinnCode || "fehler", feld: err.pinnFeld || "" });
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
        return e.json(400, { error: err.message, code: err.pinnCode || "fehler", feld: err.pinnFeld || "" });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/einrichtung/neustart", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (!require(`${__hooks}/pinn-benutzer.js`).isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann pinn. neu starten." });
    const ok = require(`${__hooks}/pinn-einrichtung.js`).neustart();
    return e.json(200, { neustart: true, sofort: ok });
}, $apis.requireAuth("benutzer"));
