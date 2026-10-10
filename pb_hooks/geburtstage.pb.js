// pb_hooks/geburtstage.pb.js
// Geburtstage aus den iCloud- und Google-Kontakten der eigenen Familie (Logik: pinn-geburtstage.js).
// Nutzt dieselbe Apple-ID bzw. dasselbe Google-Konto wie der Kalender (Einstellungen → Kalender) -
// keine weitere Einrichtung.
//
//   GET  /api/pinn/geburtstage               -> { eingerichtet, stand, liste: [{n, m, d, y, q}], fehler,
//                                                 quellen: {apple, google}, anzahl: {apple, google} }
//                                                 (q: "a" = iCloud, "g" = Google)
//   POST /api/pinn/geburtstage/aktualisieren -> sofort neu abgleichen (höchstens alle 2 Minuten)
//
// Gastkonten bekommen keine Geburtstage (Kontaktdaten der Familie).
// Zeitplan: einmal täglich um 4:30 Uhr alle Familien mit Apple-ID und/oder Google-Konto nacheinander.

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
        return e.json(200, require(`${__hooks}/pinn-geburtstage.js`).forFamily(familyId));
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
        const data = require(`${__hooks}/pinn-geburtstage.js`).refreshNow(familyId);
        return e.json(200, Object.assign({ success: !data.fehler }, data));
    } catch (err) {
        return e.json(429, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
