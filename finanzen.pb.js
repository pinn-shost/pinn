// pb_hooks/finanzen.pb.js
// Finance: expenses on the NAS (PocketBase collection "ausgaben"). The logic lives in pinn-finanzen.js.
//
// Routes (all signed-in only; every profile only sees the bookings of the funds of which it is a
// member - see pinn-kassen.js):
//   GET  /api/pinn/finanzen             all expenses of the family
//   POST /api/pinn/finanzen/speichern   {id, amount, date, category, title?, store?, listId?, items?, paidBy?, note?, link?, kasse?, split?}
//   POST /api/pinn/finanzen/loeschen    {id}
//
// No schedule - something only runs when someone books or views an expense in the app.
// Guest accounts (role "gast") have no access to the finances.

routerAdd("GET", "/api/pinn/finanzen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    try {
        return e.json(200, { ausgaben: require(`${__hooks}/pinn-finanzen.js`).listAll(e.auth) });
    } catch (err) {
        return e.json(200, { ausgaben: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/finanzen/speichern", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    try {
        const saved = require(`${__hooks}/pinn-finanzen.js`).saveExpense(e.requestInfo().body, e.auth);
        return e.json(200, { success: true, ausgabe: saved });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/finanzen/loeschen", (e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    const body = e.requestInfo().body;
    try {
        require(`${__hooks}/pinn-finanzen.js`).removeExpense(e.auth, body.id);
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
