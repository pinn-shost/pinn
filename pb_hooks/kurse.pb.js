// pb_hooks/kurse.pb.js
// Kurse für ETFs / Wertpapiere, die in „Sparen“ bespart werden. Die Logik steckt in pinn-kurse.js.
//
// Route (nur angemeldet, nicht für Gastkonten):
//   POST /api/pinn/kurse   { isins: [{ isin, ab: "JJJJ-MM-TT", bis: "JJJJ-MM-TT" }], frisch: false }
//     -> { kurse: { <ISIN>: { name, currency, price, priceDate, prev, source, fetchedAt, histFrom, delta, history, error } } }
//
// Kein Zeitplan - Kurse werden nur geholt, wenn jemand in der App „Sparen“ ansieht.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-kurse.js`).ensureSchema();
    } catch (err) {
        console.log("[Kurse] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/kurse", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    try {
        return e.json(200, { kurse: require(`${__hooks}/pinn-kurse.js`).getKurse(e.requestInfo().body) });
    } catch (err) {
        return e.json(200, { kurse: {}, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
