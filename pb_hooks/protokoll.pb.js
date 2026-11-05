// pb_hooks/protokoll.pb.js
// Admin error log - errors of the server hooks (calendar sync, push, waste calendar, sign-in ...)
// in the app instead of only in the Docker log. The logic lives in pinn-protokoll.js.
//
// On start (via pinn-schema.js): creates the locked collection "protokoll".
//
// Admins only (main admin: everything; family admins: their family, with only one family also the
// general server entries):
//   GET  /api/pinn/protokoll?bereich=&limit=   { eintraege[], alle, hauptadmin }
//   GET  /api/pinn/protokoll/kurz              { darf, offen, warnungen, neueste }
//   POST /api/pinn/protokoll/leeren            { art: "behoben" | "alle" } or { id }
//
// Schedule: at night 03:47 - delete entries older than 30 days, keep 1000 at most.

cronAdd("pinnProtokollAufraeumen", "47 3 * * *", () => {
    try {
        require(`${__hooks}/pinn-protokoll.js`).aufraeumen();
    } catch (err) {
        console.log("[Protokoll] Aufräumen fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/protokoll", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    const q = e.request.url.query();
    try {
        return e.json(200, require(`${__hooks}/pinn-protokoll.js`).liste(e, {
            bereich: String(q.get("bereich") || ""),
            limit: String(q.get("limit") || ""),
        }));
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/protokoll/kurz", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-protokoll.js`).kurz(e));
    } catch (err) {
        return e.json(200, { darf: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/protokoll/leeren", (e) => {
    const body = e.requestInfo().body || {};
    try {
        const n = require(`${__hooks}/pinn-protokoll.js`).leeren(e, body.art === "alle" ? "alle" : "behoben", body.id ? String(body.id) : "");
        return e.json(200, { success: true, geloescht: n });
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
