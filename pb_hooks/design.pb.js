// pb_hooks/design.pb.js
// Persönliche Design-Einstellungen je Profil, geräteübergreifend (Hilfsfunktionen: pinn-design.js).
//
//   GET  /api/pinn/design   -> { design: { werte, stand } }
//   POST /api/pinn/design   { werte, stand } -> { success, uebernommen, design }
//        uebernommen = false: auf einem anderen Gerät wurde später geändert; "design" enthält dann
//        den gültigen (neueren) Stand, den die App übernehmen soll.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-design.js`).ensureField();
    } catch (err) {
        console.log("[Design] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/design", (e) => {
    const lib = require(`${__hooks}/pinn-design.js`);
    e.response.header().set("Cache-Control", "no-store");
    let design = { werte: {}, stand: 0 };
    try { design = lib.readDesign($app.findRecordById("benutzer", e.auth.id)); } catch (err) { /* Standard */ }
    return e.json(200, { design: design });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/design", (e) => {
    const lib = require(`${__hooks}/pinn-design.js`);
    const body = e.requestInfo().body;
    try {
        const r = lib.saveDesign(e.auth.id, body);
        if (r.fehler) return e.json(200, { error: r.fehler, design: r.design });
        return e.json(200, { success: true, uebernommen: r.uebernommen, design: r.design });
    } catch (err) {
        return e.json(500, { error: "Design konnte nicht gespeichert werden: " + err.message });
    }
}, $apis.requireAuth("benutzer"));
