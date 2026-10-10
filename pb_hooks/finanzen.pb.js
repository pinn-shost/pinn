// pb_hooks/finanzen.pb.js
// Finanzen: Ausgaben auf dem NAS (PocketBase-Sammlung "ausgaben"). Die Logik steckt in pinn-finanzen.js.
//
// Routen (alle nur angemeldet; jedes Profil sieht nur die Buchungen der Kassen, in denen es Mitglied
// ist - siehe pinn-kassen.js):
//   GET  /api/pinn/finanzen             alle Ausgaben der Familie
//   POST /api/pinn/finanzen/speichern   {id, amount, date, category, title?, store?, listId?, items?, paidBy?, note?, link?, kasse?, split?}
//   POST /api/pinn/finanzen/loeschen    {id}
//
// Kein Zeitplan - es läuft nur etwas, wenn jemand in der App eine Ausgabe bucht oder ansieht.
// Gastkonten (Rolle "gast") haben keinen Zugriff auf die Finanzen.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-finanzen.js`).ensureSchema();
    } catch (err) {
        console.log("[Finanzen] Einrichtung fehlgeschlagen: " + err.message);
    }
});

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
