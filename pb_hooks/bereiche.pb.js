// pb_hooks/bereiche.pb.js
// Family areas: parts of the family data in records of their own (logic: pinn-bereiche.js).
//
// At start: creates the collection "familien_bereiche", moves the areas of every family out of
// familien_daten (with a backup file before, see pinn-bereiche.js) and removes copies of the move
// that are older than 30 days.
//
// Routes (signed in, own family only):
//   POST /api/pinn/bereiche            { stand: { <area>: '<updated>' } } -> { bereiche: [{ name, keys,
//                                      updated, data? }] } – data only for areas that have changed
//   POST /api/pinn/bereiche/speichern  { bereich, expectedUpdated, data } -> 200 { success, updated } |
//                                      409 { conflict, updated, data } (someone else saved in between –
//                                      the app merges both states and tries again)
//                                      Guest accounts cannot change the guest menus (settings area).
//
// IMPORTANT: PocketBase runs every route handler isolated – functions declared at file level are not
// visible inside a handler. Everything lives in pinn-bereiche.js and is fetched with require().
// No schedule – something only runs when the app loads or saves an area.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-bereiche.js`).migrateAll();
    } catch (err) {
        console.log("[Bereiche] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/bereiche", (e) => {
    const B = require(`${__hooks}/pinn-bereiche.js`);
    try {
        const familyId = B.httpFamily(e);
        if (!familyId) return B.httpSend(e, 403, { error: "Dein Profil gehört zu keiner Familie." });
        if (!B.ensureSchema()) return B.httpSend(e, 503, { error: "Die Bereiche sind auf dem Server noch nicht eingerichtet." });
        const body = B.httpBody(e);
        return B.httpSend(e, 200, { bereiche: B.list(familyId, body.stand) });
    } catch (ex) {
        return B.httpFail(e, "Laden", ex, 500);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/bereiche/speichern", (e) => {
    const B = require(`${__hooks}/pinn-bereiche.js`);
    try {
        const familyId = B.httpFamily(e);
        if (!familyId) return B.httpSend(e, 403, { error: "Dein Profil gehört zu keiner Familie." });
        if (!B.ensureSchema()) return B.httpSend(e, 503, { error: "Die Bereiche sind auf dem Server noch nicht eingerichtet." });
        let guest = false;
        try { guest = require(`${__hooks}/pinn-benutzer.js`).isGuest(e); } catch (err) { guest = false; }
        const r = B.save(familyId, B.httpBody(e), { guest: guest });
        if (r.saved) B.afterSave(familyId, r.name, r.previous, r.saved, e.auth);
        return B.httpSend(e, r.status, r.body);
    } catch (ex) {
        return B.httpFail(e, "Speichern", ex, 500);
    }
}, $apis.requireAuth("benutzer"));
