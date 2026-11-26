// pb_hooks/kinderschutz.pb.js
// Protection for "kids' page only" profiles (since 1.165.1). The logic and the list of allowed requests live in
// pinn-kinderschutz.js.
//
// Such a profile signs in at the family dashboard without PIN and password. The server now only allows what the
// kids' page needs; every other request is answered with 403 (not 401, so that the app does not sign out).

routerUse((e) => {
    let refuse = false;
    try { refuse = require(`${__hooks}/pinn-kinderschutz.js`).refuse(e); } catch (err) { refuse = false; }
    if (!refuse) return e.next();
    e.response.header().set("Cache-Control", "no-store");
    return e.json(403, { error: "Auf der Kinderseite nicht möglich.", kinderseite: true });
});
