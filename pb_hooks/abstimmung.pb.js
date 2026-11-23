// pb_hooks/abstimmung.pb.js
// Date polls in the calendar (since 1.163.0). The polls are part of the family data (key "eventPolls"), this file only
// has the route for the push messages; the logic lives in pinn-abstimmung.js.
//
// Route (signed in only, not for guest accounts):
//   POST /api/pinn/abstimmung/push   { poll: <ID>, kind: "neu" | "komplett" | "entschieden" }
//                                    sends the matching message once (the server reads the saved poll itself)

routerAdd("POST", "/api/pinn/abstimmung/push", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    let body = {};
    try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
    try {
        const r = require(`${__hooks}/pinn-abstimmung.js`).send(familyId, e.auth, body);
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        console.log("[Abstimmung] " + err.message);
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
