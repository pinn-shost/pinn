// pb_hooks/system.pb.js
// Backups, restore and updates at the push of a button (Settings → System or main admin).
// The actual work is done by the container „wartung“ (pinn-wartung.sh); here only jobs are created.
// Shared functions: pinn-system.js
//
//  GET  /api/pinn/system                    admins: version, backups, job state, new version
//                                           (?pruefen=1 asks GitHub right away instead of the cache,
//                                            ?vorab=1 additionally searches for a pre-release – developer area)
//  GET  /api/pinn/system/status             without sign-in: only the state of the running job
//                                           (for the display while pinn. restarts)
//  POST /api/pinn/system/sichern            admins: back up now
//  POST /api/pinn/system/wiederherstellen   { datei, umfang: "daten" | "alles" } – main admin, or an admin
//                                           while there is only one family on the server
//  POST /api/pinn/system/update             install the newest version from GitHub – as above;
//                                           { vorab: true } installs the newest pre-release instead
//  POST /api/pinn/system/rechte             { id, an } main admin only: a family admin may do updates and
//                                           restores (also with several families)

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-system.js`).ensureSchema(); } catch (err) { console.log("[System] Einrichtung: " + err.message); }
});

// Error responses are written directly in every handler (file-level helper functions are not
// visible inside the isolated handlers of PocketBase).

routerAdd("GET", "/api/pinn/system", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).admin) return e.json(403, { error: "Nur Admins sehen Sicherungen und Updates." });
    let pruefen = false;
    try { pruefen = String((e.requestInfo().query || {}).pruefen || "") === "1"; } catch (err) { pruefen = false; }
    if (!pruefen) { try { pruefen = e.request.url.query().get("pruefen") === "1"; } catch (err) { pruefen = false; } }
    let vorab = false;
    try { vorab = String((e.requestInfo().query || {}).vorab || "") === "1"; } catch (err) { vorab = false; }
    if (!vorab) { try { vorab = e.request.url.query().get("vorab") === "1"; } catch (err) { vorab = false; } }
    try {
        return e.json(200, lib.status(e, pruefen, vorab));
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
        return e.json((err.pinnCode || "fehler") === "beschaeftigt" ? 409 : 400, { error: err.message, code: err.pinnCode || "fehler" });
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
        return e.json((err.pinnCode || "fehler") === "beschaeftigt" ? 409 : 400, { error: err.message, code: err.pinnCode || "fehler" });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/system/update", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const lib = require(`${__hooks}/pinn-system.js`);
    if (!lib.rechte(e).darf) return e.json(403, { error: "Updates betreffen alle Familien auf diesem Server – das kann nur der Hauptadmin oder ein von ihm berechtigter Admin." });
    let vorab = false;
    try { vorab = (e.requestInfo().body || {}).vorab === true; } catch (err) { vorab = false; }
    try {
        const out = lib.update(vorab);
        console.log("[System] " + (vorab ? "Vorabversion " : "Update auf ") + out.version + " angestoßen von " + e.auth.getString("username"));
        return e.json(200, out);
    } catch (err) {
        return e.json((err.pinnCode || "fehler") === "beschaeftigt" ? 409 : 400, { error: err.message, code: err.pinnCode || "fehler" });
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
