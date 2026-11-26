// pb_hooks/save_family_data.pb.js
// The old family record ("familien_daten") is dissolved since 1.166.0: everything the app stores lives in the
// family areas ("familien_bereiche", pinn-bereiche.js / bereiche.pb.js), each with its own conflict protection.
// The app no longer reads or writes familien_daten, and the collection is locked for the interface
// (pinn-benutzer.js) - it only stays so that an old data export can still be imported.
//
// /api/pinn/save remains only for app windows that were still open from before the update: since 1.109 such
// a window sent nothing but keys that are not part of any area here (e.g. an empty object), and its areas
// went through /api/pinn/bereiche/speichern anyway. The request is answered with success and nothing is
// stored, so these windows do not show a sync error until they reload and get the new app.

routerAdd("POST", "/api/pinn/save", (e) => {
    try { e.response.header().set("Cache-Control", "no-store"); } catch (err) { /* ignore */ }
    return e.json(200, { success: true, updated: "", abgebaut: true });
}, $apis.requireAuth("benutzer"));
