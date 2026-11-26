// pb_hooks/hinweise.pb.js
// Everything for the 🔔 bell (logic: pinn-hinweise.js).
//
// On start (via pinn-schema.js): creates the collection "hinweise" or adds new fields (collection API locked,
// access only via this route).
// The notices are created:
//   - with every personal push message (pinn-push.js) - as a notice for the recipient
//   - after saving the family data (save_family_data.pb.js)
//   - when creating and ticking off tasks (aufgaben.pb.js) and creating events
//     (create_calendar_event.pb.js)
//   - for new bookings (pinn-finanzen.js) and new contracts/vehicles (pinn-kassen.js)
//   - for new documents (hook below - documents are created directly via the collection API)
//
// Route (signed in only, each family only sees its own notices):
//   GET /api/pinn/hinweise   notices of the last 3 days - without those one triggered oneself,
//                            and only those meant for the own profile
//
// No schedule - old notices are cleaned up when new notices are created.

routerAdd("GET", "/api/pinn/hinweise", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, { hinweise: require(`${__hooks}/pinn-hinweise.js`).listFor(e.auth.getString("familie"), e.auth.id) });
    } catch (err) {
        return e.json(200, { hinweise: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// New document: notice for everyone who may see it (only AFTER it was saved successfully)
onRecordCreateRequest((e) => {
    e.next();
    try {
        if (e.auth) require(`${__hooks}/pinn-hinweise.js`).documentCreated(e.record, e.auth);
    } catch (err) {
        console.log("[Hinweise] Dokument: " + err.message);
    }
}, "dokumente");
