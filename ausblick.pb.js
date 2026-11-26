// pb_hooks/ausblick.pb.js
// Weekly preview, monthly finance outlook and (since 1.142.0) the year in review. The logic lives in pinn-ausblick.js, the contents are
// calculated by the app itself (index.html, section "Outlook").
//
// Routes (signed in only):
//   GET  /api/pinn/ausblick              current week/month/year, "already seen", push switches of the profile and (since 1.142.2) the counter of completed tasks per year
//   POST /api/pinn/ausblick/gesehen      {art: 'woche'|'monat'|'jahr', key}  hide the banner on all devices
//   POST /api/pinn/ausblick/push         {woche?: bool, monat?: bool, jahr?: bool} personal push switches
//
// Schedule: every 10 minutes - but only works on Sundays, on the last day of the month or on 28 December between 6 and 10 p.m.,
// and then only once (marker in pb_data/pinn_ausblick.json).

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { /* ignore */ }
    try { require(`${__hooks}/pinn-ausblick.js`).pruneUsers(); } catch (err) { /* ignore */ }
});

cronAdd("pinnAusblick", "*/10 * * * *", () => {
    try {
        require(`${__hooks}/pinn-ausblick.js`).runCron();
    } catch (err) {
        console.log("[Ausblick] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Ausblick (Wochenvorschau/Monatsausblick): " + err.message); } catch (e2) { /* ignore */ }
    }
});

routerAdd("GET", "/api/pinn/ausblick", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, require(`${__hooks}/pinn-ausblick.js`).stateFor(e.auth));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ausblick/gesehen", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, Object.assign({ success: true }, require(`${__hooks}/pinn-ausblick.js`).markSeen(e.auth, String(body.art || ""), body.key)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/ausblick/push", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, Object.assign({ success: true }, require(`${__hooks}/pinn-ausblick.js`).savePush(e.auth, body)));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
