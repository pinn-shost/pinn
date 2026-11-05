// pb_hooks/rezepte.pb.js
// Public recipes across all families. The logic lives in pinn-rezepte.js.
//
// On start (via pinn-schema.js): creates the collection "oeffentliche_rezepte" or adds missing fields.
// It is filled when saving the family data (save_family_data.pb.js) - every recipe with the
// tick "Share recipe publicly" set ends up there, removed ticks/deleted recipes
// disappear again.
//
// If a family is deleted, its public recipes (including images) are kept and
// afterwards appear for everyone under "Rezepte Familie" (see pinn-rezepte.js, detachFamily).
//
// Route (signed in only):
//   GET /api/pinn/rezepte/oeffentlich   all public recipes of all families
//                                        (own ones are marked with "eigene: true")

// Before deleting a family: move public recipes into the "Rezepte Familie".
// An error here is only logged and does not prevent the deletion.
onRecordDelete((e) => {
    try {
        require(`${__hooks}/pinn-rezepte.js`).detachFamily(e.app, e.record.id);
    } catch (err) {
        console.log("[Rezepte] Öffentliche Rezepte der Familie konnten nicht gesichert werden: " + err.message);
    }
    e.next();
}, "familien");

routerAdd("GET", "/api/pinn/rezepte/oeffentlich", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const list = require(`${__hooks}/pinn-rezepte.js`).listPublic(e.auth.getString("familie"));
        return e.json(200, { rezepte: list });
    } catch (err) {
        return e.json(200, { rezepte: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));
