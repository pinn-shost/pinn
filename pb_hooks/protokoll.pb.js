// pb_hooks/protokoll.pb.js
// Admin-Fehlerprotokoll – Fehler der Server-Hooks (Kalender-Sync, Push, Müllkalender, Anmeldung …)
// in der App statt nur im Docker-Log. Die Logik steckt in pinn-protokoll.js.
//
// Beim Start: legt die gesperrte Sammlung "protokoll" an.
//
// Nur Admins (Hauptadmin: alles; Familien-Admins: ihre Familie, bei nur einer Familie auch die
// allgemeinen Server-Einträge):
//   GET  /api/pinn/protokoll?bereich=&limit=   { eintraege[], alle, hauptadmin }
//   GET  /api/pinn/protokoll/kurz              { darf, offen, warnungen, neueste }
//   POST /api/pinn/protokoll/leeren            { art: "behoben" | "alle" } oder { id }
//
// Zeitplan: nachts 03:47 Uhr – Einträge älter als 30 Tage löschen, höchstens 1000 behalten.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-protokoll.js`).ensureSchema();
    } catch (err) {
        console.log("[Protokoll] Einrichtung fehlgeschlagen: " + err.message);
    }
});

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
