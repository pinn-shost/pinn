// pb_hooks/export.pb.js
// Data export: complete family (or flat share) as a ZIP - data + documents.
// Settings → Data → "Export family" (admins) or main admin → Families.
// The logic lives in pinn-export.js, the ZIP is built by the app itself (pb_public/datenexport.js).
//
//  GET /api/pinn/export/uebersicht?familie=<id>                      content, count, size
//  GET /api/pinn/export/sammlung?familie=<id>&name=<collection>      records of a collection + file list
//  GET /api/pinn/export/datei?familie=<id>&sammlung=<s>&datensatz=<id>&name=<file>   one file
//
// "familie" is only needed for the main admin (family admins always export their own family).
// No schedule - something only runs when someone starts an export.

// Note: PocketBase runs every handler in isolation - helpers therefore live in the handler itself
// or in pinn-export.js.

routerAdd("GET", "/api/pinn/export/uebersicht", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const q = (n) => { try { return String((e.requestInfo().query || {})[n] || ""); } catch (err) { return ""; } };
    try {
        return e.json(200, require(`${__hooks}/pinn-export.js`).uebersicht(e, q("familie")));
    } catch (err) {
        if (!err.pinnStatus) console.log("[Export] Übersicht: " + err.message);
        return e.json(err.pinnStatus || 500, { error: err.message, code: err.pinnCode || "fehler" });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/export/sammlung", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const q = (n) => { try { return String((e.requestInfo().query || {})[n] || ""); } catch (err) { return ""; } };
    try {
        return e.json(200, require(`${__hooks}/pinn-export.js`).sammlung(e, q("familie"), q("name")));
    } catch (err) {
        if (!err.pinnStatus) console.log("[Export] Sammlung " + q("name") + ": " + err.message);
        return e.json(err.pinnStatus || 500, { error: err.message, code: err.pinnCode || "fehler" });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/export/datei", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const q = (n) => { try { return String((e.requestInfo().query || {})[n] || ""); } catch (err) { return ""; } };
    try {
        const out = require(`${__hooks}/pinn-export.js`).datei(e, q("familie"), q("sammlung"), q("datensatz"), q("name"));
        if (out === true) return;
        return out;
    } catch (err) {
        if (!err.pinnStatus) console.log("[Export] Datei: " + err.message);
        return e.json(err.pinnStatus || 500, { error: err.message, code: err.pinnCode || "fehler" });
    }
}, $apis.requireAuth("benutzer"));
