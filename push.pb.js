// pb_hooks/push.pb.js
// Routen und Zeitplan für persönliche Push-Benachrichtigungen. Die Logik steckt in pinn-push.js.
//
// Routen:
//   GET  /api/pinn/push/config         (angemeldet) öffentlicher Schlüssel, Status, eigene Einstellungen
//   POST /api/pinn/push/abo            (angemeldet) dieses Gerät für das eigene Profil anmelden
//   POST /api/pinn/push/abo-loeschen   (angemeldet) dieses Gerät abmelden
//   POST /api/pinn/push/einstellungen  (angemeldet) eigene Benachrichtigungs-Einstellungen speichern
//   POST /api/pinn/push/test           (angemeldet) Test-Benachrichtigung an die eigenen Geräte
//   POST /api/pinn/push/kinderseite    (angemeldet) auf der Kinderseite wurde etwas abgehakt ->
//                                      Hinweis an die anderen Profile der Familie (10 Sek. verzögert,
//                                      {done:false} verwirft eine noch nicht verschickte Meldung)
//   POST /api/pinn/push/faellige       (angemeldet) fällige verzögerte Erledigt-Meldungen der eigenen
//                                      Familie jetzt verschicken (die App fragt 10 Sek. nach dem Abhaken)
//   POST /api/pinn/push/abholen        (ohne Anmeldung) der Service Worker holt die wartende
//                                      Nachricht seines Geräts ab - nur mit der geheimen Geräte-
//                                      Adresse (endpoint) möglich, die nur das Gerät selbst kennt.
//                                      Antwort enthält zusätzlich "badge" = offene, fällige Aufgaben
//                                      des Profils für die Zahl am App-Symbol, und "ersatz" =
//                                      allgemeiner Hinweistext in der Sprache des Profils.
//                                      Texte kommen in der Sprache des Profils und passend zur
//                                      Wohnform (Familie/WG) an - siehe pinn-pushtext.js.
//   GET  /api/pinn/push/schluessel     (ohne Anmeldung) öffentlicher Schlüssel für den Service
//                                      Worker, wenn er das Gerät selbst neu anmelden muss
//   POST /api/pinn/push/abo-erneuern   (ohne Anmeldung) der Service Worker meldet eine neue Push-
//                                      Adresse seines Geräts - nur mit der alten, geheimen Adresse.
//
// Nach einem Neustart oder Update bleiben alle Geräte angemeldet: Geräte stehen in der Datenbank,
// der Schlüssel in pb_data. Vorgemerkte Meldungen und Sperren werden beim Start wiederhergestellt.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-push.js`).ensurePushCollections();
    } catch (err) {
        console.log("[Push] " + err.message);
    }
    try {
        const push = require(`${__hooks}/pinn-push.js`);
        const r = push.restorePersisted();
        if (r.verzoegert) console.log("[Push] " + r.verzoegert + " vorgemerkte Meldung(en) nach dem Neustart wiederhergestellt.");
    } catch (err) {
        console.log("[Push] Wiederherstellen fehlgeschlagen: " + err.message);
    }
    try {
        const push = require(`${__hooks}/pinn-push.js`);
        const t = push.selfTest();
        try { $app.store().set("pinnPushSelfTest", t); } catch (err) { /* egal */ }
        console.log("[Push] " + (t.ok ? "Bereit - " + push.countSubscriptions() + " Gerät(e) angemeldet." : "Nicht verfügbar: " + t.message));
    } catch (err) {
        console.log("[Push] Selbsttest fehlgeschlagen: " + err.message);
    }
});

// Verzögerte Erledigt-Meldungen, falls die App vor Ablauf der 10 Sekunden geschlossen wurde
cronAdd("pinnPushVerzoegert", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-push.js`).runDelayed("");
    } catch (err) {
        console.log("[Push] Verzögerte Meldungen: " + err.message);
    }
});

cronAdd("pinnPush", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-push.js`).runPushCron();
    } catch (err) {
        console.log("[Push] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/push/config", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    let test = null;
    try { test = $app.store().get("pinnPushSelfTest"); } catch (err) { test = null; }
    if (!test || !test.ok) {
        test = push.selfTest();
        try { $app.store().set("pinnPushSelfTest", test); } catch (err) { /* egal */ }
    }
    let settings = push.normalizeSettings(null);
    try { settings = push.readSettings($app.findRecordById("benutzer", e.auth.id)); } catch (err) { /* Standard */ }
    let geraete = 0;
    try { geraete = $app.findRecordsByFilter(push.PUSH_ABOS, "benutzer = {:u}", "", 0, 0, { u: e.auth.id }).length; } catch (err) { geraete = 0; }
    const v = test.ok ? push.loadVapid(true) : null;
    return e.json(200, { available: !!test.ok, message: test.message, publicKey: v ? v.publicKey : "", settings: settings, geraete: geraete });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/abo", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    const body = e.requestInfo().body;
    const endpoint = String(body.endpoint || "");
    if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2000) return e.json(400, { error: "Ungültige Geräte-Adresse." });
    let abosCol = null;
    try {
        abosCol = push.ensurePushCollections();
    } catch (err) {
        return e.json(500, { error: err.message });
    }
    try {
        let rec = null;
        try { rec = $app.findFirstRecordByFilter(push.PUSH_ABOS, "endpoint = {:e}", { e: endpoint }); } catch (err) { rec = null; }
        if (!rec) rec = new Record(abosCol);
        rec.set("endpoint", endpoint);
        rec.set("benutzer", e.auth.id); // meldet sich jemand anderes auf dem Gerät an, wandert das Abo mit
        rec.set("geraet", String(body.geraet || "").slice(0, 200));
        $app.save(rec);
        push.rememberSubjectFromRequest(e);
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(500, { error: "Gerät konnte nicht angemeldet werden: " + err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/abo-loeschen", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    const body = e.requestInfo().body;
    try {
        const rec = $app.findFirstRecordByFilter(push.PUSH_ABOS, "endpoint = {:e}", { e: String(body.endpoint || "") });
        if (rec.getString("benutzer") === e.auth.id) $app.delete(rec);
    } catch (err) { /* nicht vorhanden */ }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/einstellungen", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    const body = e.requestInfo().body;
    const settings = push.normalizeSettings(body.settings);
    try { push.ensurePushCollections(); } catch (err) { /* Fehler zeigt sich unten */ }
    const rec = $app.findRecordById("benutzer", e.auth.id);
    let before = null;
    try { before = push.readSettings(rec); } catch (err) { before = null; }
    rec.set("push_einstellungen", settings);
    $app.save(rec);
    // Zurücklesen, damit die App sieht, was wirklich gespeichert ist
    let saved = settings;
    try { saved = push.readSettings($app.findRecordById("benutzer", e.auth.id)); } catch (err) { saved = settings; }
    if (JSON.stringify(saved) !== JSON.stringify(settings)) {
        return e.json(200, { error: "Einstellungen wurden nicht gespeichert (Feld \"push_einstellungen\" fehlt im Profil)." });
    }
    // Neue Uhrzeit: die Tagesübersicht darf heute noch einmal kommen
    if (!before || before.uhrzeit !== saved.uhrzeit || !before.tagesuebersicht) try {
        const status = push.loadPushStatus();
        if (status.tagesuebersicht && status.tagesuebersicht[e.auth.id]) {
            delete status.tagesuebersicht[e.auth.id];
            push.savePushStatus(status);
        }
    } catch (err) { /* egal */ }
    return e.json(200, { success: true, settings: saved });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/test", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    let name = e.auth.getString("username");
    try {
        const lib = require(`${__hooks}/pinn-benutzer.js`);
        const members = (lib.loadFamilyDataFor(e.auth.getString("familie")) || {}).members || [];
        const m = members.find(x => x.id === e.auth.getString("mitglied"));
        if (m) name = m.name;
    } catch (err) { /* Profilname */ }
    push.rememberSubjectFromRequest(e);
    const r = push.notifyUserDetailed(e.auth.id, {
        titel: "Hallo " + name + "! 👋",
        text: "Benachrichtigungen von pinn. kommen auf diesem Gerät an.",
        url: "/",
        tag: "test",
        urgency: "high",
    });
    if (!r.geraete) return e.json(200, { error: "Für dein Profil ist kein Gerät angemeldet. Bitte auf diesem Gerät deaktivieren und neu aktivieren." });
    if (!r.sent) {
        const fehler = r.fehler.filter((x, i, a) => a.indexOf(x) === i).join(" | ");
        return e.json(200, { error: "Kein Gerät erreicht: " + (fehler || "unbekannter Fehler") });
    }
    return e.json(200, { success: true, sent: r.sent, fehler: r.fehler });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/kinderseite", (e) => {
    const body = e.requestInfo().body;
    const familyId = e.auth.getString("familie");
    if (!familyId) return e.json(200, { success: false });
    try {
        const ok = require(`${__hooks}/pinn-push.js`).queueKidPage(familyId, {
            memberId: body.memberId, taskId: body.taskId, allDone: !!body.allDone,
            period: String(body.period || ""), done: body.done !== false,
        });
        return e.json(200, { success: !!ok, verzoegert: true });
    } catch (err) {
        console.log("[Push] Kinderseite: " + err.message);
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/faellige", (e) => {
    const familyId = e.auth.getString("familie");
    if (!familyId) return e.json(200, { success: false });
    try {
        const n = require(`${__hooks}/pinn-push.js`).runDelayed(familyId);
        return e.json(200, { success: true, verschickt: n });
    } catch (err) {
        console.log("[Push] Fällige Meldungen: " + err.message);
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/push/abholen", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    const body = e.requestInfo().body;
    const endpoint = String(body.endpoint || "");
    const msg = push.takeMessage(endpoint);
    let badge = null;
    try { badge = push.badgeForEndpoint(endpoint); } catch (err) { badge = null; }
    // Ersatztext in der Sprache des Profils (falls nichts mehr abzuholen ist); der Worker merkt ihn
    // sich auch für Weckrufe, bei denen der Server gerade nicht erreichbar ist.
    let ersatz = null;
    try { ersatz = require(`${__hooks}/pinn-pushtext.js`).fallbackForEndpoint(endpoint); } catch (err) { ersatz = null; }
    e.response.header().set("Cache-Control", "no-store");
    // badge: Zahl offener Aufgaben fürs App-Symbol (null = unbekannt, Worker ändert nichts)
    return e.json(200, { nachricht: msg, badge: badge, ersatz: ersatz });
});

routerAdd("GET", "/api/pinn/push/schluessel", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    let v = null;
    try { v = push.loadVapid(false); } catch (err) { v = null; }
    e.response.header().set("Cache-Control", "no-store");
    return e.json(200, { publicKey: v ? v.publicKey : "" });
});

routerAdd("POST", "/api/pinn/push/abo-erneuern", (e) => {
    const push = require(`${__hooks}/pinn-push.js`);
    const body = e.requestInfo().body;
    try {
        const r = push.renewSubscription(body.alt, body.neu);
        return e.json(200, r.ok ? { success: true } : { success: false, error: r.grund });
    } catch (err) {
        console.log("[Push] Adresse erneuern: " + err.message);
        return e.json(200, { success: false, error: err.message });
    }
});
