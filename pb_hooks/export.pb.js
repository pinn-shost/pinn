// pb_hooks/export.pb.js
// Datenexport: komplette Familie (bzw. WG) als ZIP – Daten + Dokumente.
// Einstellungen → Daten → „Familie exportieren“ (Admins) bzw. Hauptadmin → Familien.
// Die Logik steckt in pinn-export.js, das ZIP baut die App selbst (pb_public/datenexport.js).
//
//  GET /api/pinn/export/uebersicht?familie=<id>                      Inhalt, Anzahl, Größe
//  GET /api/pinn/export/sammlung?familie=<id>&name=<sammlung>        Datensätze einer Sammlung + Dateiliste
//  GET /api/pinn/export/datei?familie=<id>&sammlung=<s>&datensatz=<id>&name=<datei>   eine Datei
//
// „familie“ ist nur für den Hauptadmin nötig (Familien-Admins exportieren immer ihre eigene Familie).
// Kein Zeitplan – es läuft nur etwas, wenn jemand einen Export startet.

// Hinweis: PocketBase führt jeden Handler isoliert aus – Hilfen stehen deshalb im Handler selbst
// bzw. in pinn-export.js.

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
