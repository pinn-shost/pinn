// pb_hooks/geburtstage.pb.js
// Birthdays from the iCloud and Google contacts (logic: pinn-geburtstage.js). Uses the family accounts
// from Settings → Calendar and - since 1.103 - also the profile's own iCloud account (only for this profile).
// No further setup.
//
//   GET  /api/pinn/geburtstage               -> { eingerichtet, stand, liste: [{n, m, d, y, q}], fehler,
//                                                 quellen: {apple, google}, anzahl: {apple, google} }
//                                                 (q: "a" = iCloud, "g" = Google)
//   POST /api/pinn/geburtstage/aktualisieren -> sync right away (at most every 2 minutes)
//
// Guest accounts get no birthdays (contact data of the family).
// Schedule: once a day at 4:30 all families and profiles with a connected account, one after another.

cronAdd("pinnGeburtstageCron", "30 4 * * *", () => {
    try {
        require(`${__hooks}/pinn-geburtstage.js`).runCron();
    } catch (err) {
        console.log("[Geburtstage] Zeitplan fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/geburtstage", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    e.response.header().set("Cache-Control", "no-store");
    const leer = { eingerichtet: false, stand: "", liste: [], fehler: "" };
    if (lib.isGuest(e)) return e.json(200, leer);
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, leer);
    try {
        return e.json(200, require(`${__hooks}/pinn-geburtstage.js`).forFamily(familyId, e.auth ? e.auth.id : ""));
    } catch (err) {
        return e.json(200, Object.assign({}, leer, { fehler: "Geburtstage konnten nicht gelesen werden: " + err.message }));
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/geburtstage/aktualisieren", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Kontakte." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(400, { error: "Dein Profil gehört zu keiner Familie." });
    try {
        const data = require(`${__hooks}/pinn-geburtstage.js`).refreshNow(familyId, e.auth ? e.auth.id : "");
        return e.json(200, Object.assign({ success: !data.fehler }, data));
    } catch (err) {
        return e.json(429, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
