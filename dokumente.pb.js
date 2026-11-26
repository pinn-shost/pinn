// pb_hooks/dokumente.pb.js
// Menu item "Documents": collection for documents and reminders of expiry dates/warranties.
// The logic lives in pinn-dokumente.js.
//
// On start (via pinn-schema.js): creates the collection "dokumente" (photos/PDFs as protected files, only for the
// own family, not for guest accounts). Uploading/downloading goes directly via the PocketBase
// collection API with sign-in or a file token.
//
// Route (signed in only, not for guest accounts):
//   POST /api/pinn/dokumente/pruefen   send due reminders of the own family now
//                                      (the app calls this after saving a document with
//                                      a reminder; only between 8 a.m. and 9 p.m., nothing twice)
//
// Schedule: hourly (minute 27) - the actual check only runs once a day from 8 a.m.

cronAdd("pinnDokumente", "27 * * * *", () => {
    try {
        require(`${__hooks}/pinn-dokumente.js`).runReminders({});
    } catch (err) {
        console.log("[Dokumente] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/dokumente/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Dokumente." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    try {
        const r = require(`${__hooks}/pinn-dokumente.js`).runReminders({ familyId: familyId });
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
