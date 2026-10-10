// pb_hooks/sprache.pb.js
// Sprachsteuerung (Einstellungen → Sprachsteuerung). Die Logik steckt in pinn-sprache.js.
//
// Beim Start: legt die gesperrte Sammlung "sprache_zugaenge" an.
//
// Öffentlich, nur mit persönlichem Token (für den Siri-Kurzbefehl bzw. „HTTP Shortcuts“ unter Android):
//   POST /api/pinn/sprache?token=...        { text }  -> Antwort als Text zum Vorlesen
//   GET  /api/pinn/sprache?token=...&text=...          (z. B. für Home Assistant)
//   mit &json=1: { ok, antwort, art, geaendert }
// Angemeldet (keine Gäste):
//   GET  /api/pinn/sprache/status           -> { aktiv, token, kind }
//   POST /api/pinn/sprache/einrichten       { neu? }  persönlichen Link anlegen bzw. erneuern
//   POST /api/pinn/sprache/ausschalten      Link löschen
// Aufräumen: wird ein Profil gelöscht, verschwindet sein Link.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-sprache.js`).ensureSchema();
    } catch (err) {
        console.log("[Sprache] Einrichtung fehlgeschlagen: " + err.message);
    }
});

function pinnSpracheAntwort(e) {
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
}

routerAdd("POST", "/api/pinn/sprache", (e) => pinnSpracheAntwort(e));
routerAdd("GET", "/api/pinn/sprache", (e) => pinnSpracheAntwort(e));

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
    try { require(`${__hooks}/pinn-sprache.js`).cleanupUser(e.record.id); } catch (err) { /* egal */ }
    e.next();
}, "benutzer");
