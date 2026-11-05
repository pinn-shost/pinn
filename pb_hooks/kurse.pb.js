// pb_hooks/kurse.pb.js
// Prices for ETFs / securities that are saved for in "Savings". The logic lives in pinn-kurse.js.
//
// Route (signed in only, not for guest accounts):
//   POST /api/pinn/kurse   { isins: [{ isin, ab: "YYYY-MM-DD", bis: "YYYY-MM-DD" }], frisch: false }
//     -> { kurse: { <ISIN>: { name, currency, price, priceDate, prev, source, fetchedAt, histFrom, delta, history, error } } }
//
// No schedule - prices are only fetched when someone views "Savings" in the app.

routerAdd("POST", "/api/pinn/kurse", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    try {
        return e.json(200, { kurse: require(`${__hooks}/pinn-kurse.js`).getKurse(e.requestInfo().body) });
    } catch (err) {
        return e.json(200, { kurse: {}, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
