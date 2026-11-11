// pb_hooks/sitzungen.pb.js
// Device management: signed-in devices per profile with "Sign out". The logic lives in pinn-sitzungen.js.
//
// On start: creates the locked collection "sitzungen" (one record per device and profile),
//   adds the fields for device recognition if needed and merges duplicate devices
//   (e.g. from earlier app updates that each created a new device).
//
// On every sign-in of a profile (password, family dashboard, renewal at app start):
//   create or reuse a session and issue the token with the session ID.
// On every request with a token: if the session no longer exists, pinn. answers with 401 and
//   "X-Pinn-Abgemeldet: 1" - the app then deletes its data on the device.
//
// Signed in (own profile; family admins for profiles of their family; main admin for all):
//   GET  /api/pinn/sitzungen?benutzer=          { benutzer, eigenes, sitzungen[], sperre? }
//   GET  /api/pinn/sitzungen/uebersicht?familie= (admins) per profile: number of devices and lock
//   POST /api/pinn/sitzungen/abmelden           { id }  session ID, "dieses" or "push:<id>" (push subscription
//                                               without a session, since 1.147.0)
//   POST /api/pinn/sitzungen/alle-abmelden      { benutzer? }  own profile: all other devices
//                                               (response: new sign-in for this device),
//                                               other profile: sign out everywhere
//   POST /api/pinn/sitzungen/entsperren         { benutzer }  (admins) lift the lock after failed attempts
//   POST /api/pinn/sitzungen/geraet             { name, typ, id, push? }  the app reports its device (since 1.147.0)
//   POST /api/pinn/sitzungen/umbenennen         { id, name }  own name for a device ("" = detected name again)
//
// Schedule: at night 03:52 - merge duplicate devices and delete sessions whose
//   sign-in expired long ago.

onBootstrap((e) => {
    e.next();
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { /* ignore */ }
    try {
        const sitz = require(`${__hooks}/pinn-sitzungen.js`);
        if (sitz.ensureSchema()) sitz.doppelteZusammenfuehren();
    } catch (err) {
        console.log("[Geräte] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Every request with a token: is the session still valid? (gentle, see pinn-sitzungen.js)
routerUse((e) => {
    if (e.auth) {
        let ok = true;
        try { ok = require(`${__hooks}/pinn-sitzungen.js`).pruefe(e); } catch (err) { ok = true; }
        if (!ok) {
            e.response.header().set("X-Pinn-Abgemeldet", "1");
            e.response.header().set("Cache-Control", "no-store");
            return e.json(401, { error: "Dieses Gerät wurde in pinn. abgemeldet. Bitte melde dich erneut an.", abgemeldet: true });
        }
    }
    return e.next();
});

// Sign-in: create the session and issue the token with the session ID
onRecordAuthRequest((e) => {
    try {
        require(`${__hooks}/pinn-sitzungen.js`).beimAnmelden(e);
    } catch (err) {
        console.log("[Geräte] Anmeldung nicht erfasst: " + err.message);
    }
    return e.next();
}, "benutzer");

cronAdd("pinnSitzungenAufraeumen", "52 3 * * *", () => {
    try {
        require(`${__hooks}/pinn-sitzungen.js`).aufraeumen();
    } catch (err) {
        console.log("[Geräte] Aufräumen fehlgeschlagen: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/sitzungen", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const id = String(e.request.url.query().get("benutzer") || "");
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).liste(e, id));
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/sitzungen/uebersicht", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const fam = String(e.request.url.query().get("familie") || "");
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).uebersicht(e, fam));
    } catch (err) {
        return e.json(403, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/abmelden", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).abmelden(e, body.id));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/alle-abmelden", (e) => {
    const body = e.requestInfo().body || {};
    let r = null;
    try {
        r = require(`${__hooks}/pinn-sitzungen.js`).alleAbmelden(e, body.benutzer);
    } catch (err) {
        return e.json(400, { error: err.message });
    }
    // Own profile: this device gets a new, valid sign-in (same session)
    if (r.own && r.rec) return $apis.recordAuthResponse(e, r.rec);
    return e.json(200, { success: true, abgemeldet: r.anzahl });
}, $apis.requireAuth("benutzer"));

// The app reports its device on every start (name, kind, device identifier; since 1.147.0)
routerAdd("POST", "/api/pinn/sitzungen/geraet", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).geraetMelden(e, body));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

// Own name for a device (since 1.147.0)
routerAdd("POST", "/api/pinn/sitzungen/umbenennen", (e) => {
    const body = e.requestInfo().body || {};
    try {
        return e.json(200, require(`${__hooks}/pinn-sitzungen.js`).umbenennen(e, body.id, body.name));
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/sitzungen/entsperren", (e) => {
    const body = e.requestInfo().body || {};
    try {
        require(`${__hooks}/pinn-sitzungen.js`).entsperren(e, body.benutzer);
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(400, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));
