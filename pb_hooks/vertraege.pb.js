// pb_hooks/vertraege.pb.js
// Finance → Contracts: documents collection and reminders of notice periods.
// The logic lives in pinn-vertraege.js.
//
// On start (via pinn-schema.js): creates the collection "finanz_dokumente" (contract documents and receipts for expenses;
// protected files, only for the own family, not for guest accounts). Uploading/downloading goes
// directly via the PocketBase collection API with sign-in or a file token.
//
// Route (signed in only, not for guest accounts):
//   POST /api/pinn/vertraege/pruefen   send due reminders of the own family now
//                                      (the app calls this after saving a contract;
//                                      only between 8 a.m. and 9 p.m., nothing is sent twice)
//
// Schedule: hourly (minute 23) - the actual check of all families only runs once a
// day from 8 a.m.

cronAdd("pinnVertraege", "23 * * * *", () => {
    try {
        require(`${__hooks}/pinn-vertraege.js`).runReminders({});
    } catch (err) {
        console.log("[Verträge] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/vertraege/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    try {
        const r = require(`${__hooks}/pinn-vertraege.js`).runReminders({ familyId: familyId });
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
