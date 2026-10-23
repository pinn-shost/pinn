// pb_hooks/sprache.pb.js
// Voice control (Settings -> Sprachsteuerung). The logic lives in pinn-sprache.js.
//
// On startup (via pinn-schema.js): creates the locked collection "sprache_zugaenge".
//
// Public, personal token only (for the Siri shortcut or "HTTP Shortcuts" on Android):
//   POST /api/pinn/sprache?token=...        { text }  -> answer as plain text to be read aloud
//   GET  /api/pinn/sprache?token=...&text=...          (e.g. for Home Assistant)
//   with &json=1: { ok, antwort, art, geaendert }
// Signed in (no guests):
//   GET  /api/pinn/sprache/status           -> { aktiv, token, kind }
//   POST /api/pinn/sprache/einrichten       { neu? }  create or renew the personal link
//   POST /api/pinn/sprache/ausschalten      delete the link
// Cleanup: when a profile is deleted, its link is removed as well.
//
// IMPORTANT: PocketBase runs every handler in its own isolated context. A handler must not call
// functions or use variables declared at the top level of this file - only globals such as
// require(), __hooks, $app, $apis. Therefore the shared answer logic is written directly inside
// the handler below (registered for both methods in a loop) instead of in a helper function.

["POST", "GET"].forEach((method) => {
    routerAdd(method, "/api/pinn/sprache", (e) => {
        e.response.header().set("Cache-Control", "no-store");
        const q = e.request.url.query();
        let body = {};
        try { body = e.requestInfo().body || {}; } catch (err) { body = {}; }
        const text = String(body.text || body.Text || body.eingabe || q.get("text") || "").slice(0, 500);
        let r;
        try {
            r = require(`${__hooks}/pinn-sprache.js`).befehl(q.get("token") || "", text);
        } catch (err) {
            r = { ok: false, status: 500, antwort: err.message };
        }
        const status = r.status || 200;
        delete r.status;
        if (q.get("json") === "1") return e.json(status, r);
        e.response.header().set("Content-Type", "text/plain; charset=utf-8");
        return e.string(status, String(r.antwort || ""));
    });
});

routerAdd("GET", "/api/pinn/sprache/status", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        if (e.auth.getString("rolle") === "gast") return e.json(200, { aktiv: false, gesperrt: true });
        return e.json(200, require(`${__hooks}/pinn-sprache.js`).statusFor(e.auth));
    } catch (err) {
        return e.json(200, { aktiv: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sprache/einrichten", (e) => {
    try {
        const body = e.requestInfo().body || {};
        return e.json(200, require(`${__hooks}/pinn-sprache.js`).einrichten(e.auth, !!body.neu));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sprache/ausschalten", (e) => {
    try {
        return e.json(200, require(`${__hooks}/pinn-sprache.js`).ausschalten(e.auth));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

onRecordAfterDeleteSuccess((e) => {
    try { require(`${__hooks}/pinn-sprache.js`).cleanupUser(e.record.id); } catch (err) { /* ignore */ }
    e.next();
}, "benutzer");
