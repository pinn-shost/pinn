// pb_hooks/system.pb.js
// Sicherungen, Wiederherstellung und Updates per Knopf (Einstellungen → System bzw. Hauptadmin).
// Die eigentliche Arbeit macht der Container „wartung“ (pinn-wartung.sh); hier entstehen nur Aufträge.
// Gemeinsame Funktionen: pinn-system.js
//
//  GET  /api/pinn/system                    Admins: Version, Sicherungen, Auftragsstatus, neue Version
//                                           (?pruefen=1 fragt GitHub sofort statt aus dem Zwischenspeicher)
//  GET  /api/pinn/system/status             ohne Anmeldung: nur Zustand des laufenden Auftrags
//                                           (für die Anzeige, während pinn. neu startet)
//  POST /api/pinn/system/sichern            Admins: Sicherung jetzt
//  POST /api/pinn/system/wiederherstellen   { datei, umfang: "daten" | "alles" } – Hauptadmin bzw. Admin
//                                           bei nur einer Familie auf dem Server
//  POST /api/pinn/system/update             neueste Version von GitHub einspielen – wie oben
//  POST /api/pinn/system/rechte             { id, an } nur Hauptadmin: Familien-Admin darf Updates und
//                                           Wiederherstellung (auch bei mehreren Familien)

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-system.js`).ensureSchema(); } catch (err) { console.log("[System] Einrichtung: " + err.message); }
});

function pinnSystemFehler(e, err) {
    const code = err.pinnCode || "fehler";
    const http = code === "beschaeftigt" ? 409 : 400;
    return e.json(http, { error: err.message, code });
}

routerAdd("GET", "/api/pinn/system", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).admin) return e.json(403, { error: "Nur Admins sehen Sicherungen und Updates." });
    let pruefen = false;
    try { pruefen = String((e.requestInfo().query || {}).pruefen || "") === "1"; } catch (err) { pruefen = false; }
    if (!pruefen) { try { pruefen = e.request.url.query().get("pruefen") === "1"; } catch (err) { pruefen = false; } }
    try {
        return e.json(200, lib.status(e, pruefen));
    } catch (err) {
        return e.json(500, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/system/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-system.js`).kurzStatus());
    } catch (err) {
        return e.json(200, { job: null });
    }
});

routerAdd("POST", "/api/pinn/system/sichern", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).admin) return e.json(403, { error: "Nur Admins können Sicherungen anlegen." });
    try {
        return e.json(200, lib.sichern());
    } catch (err) {
        return pinnSystemFehler(e, err);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/system/wiederherstellen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).darf) return e.json(403, { error: "Wiederherstellen betrifft alle Familien auf diesem Server – das kann nur der Hauptadmin oder ein von ihm berechtigter Admin." });
    const body = e.requestInfo().body || {};
    try {
        const out = lib.wiederherstellen(body.datei, body.umfang);
        console.log("[System] Wiederherstellung angestoßen: " + String(body.datei) + " (" + (body.umfang === "alles" ? "alles" : "daten") + ") von " + e.auth.getString("username"));
        return e.json(200, out);
    } catch (err) {
        return pinnSystemFehler(e, err);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/system/update", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).darf) return e.json(403, { error: "Updates betreffen alle Familien auf diesem Server – das kann nur der Hauptadmin oder ein von ihm berechtigter Admin." });
    try {
        const out = lib.update();
        console.log("[System] Update auf " + out.version + " angestoßen von " + e.auth.getString("username"));
        return e.json(200, out);
    } catch (err) {
        return pinnSystemFehler(e, err);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/system/rechte", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const b = require(`${__hooks}/pinn-benutzer.js`);
    if (!b.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann dieses Recht vergeben." });
    const body = e.requestInfo().body || {};
    try {
        const out = require(`${__hooks}/pinn-system.js`).setzeRechte(body.id, !!body.an);
        console.log("[System] Recht für Updates/Wiederherstellung " + (out.systemrechte ? "erteilt" : "entzogen") + " (Profil " + out.id + ")");
        return e.json(200, out);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
