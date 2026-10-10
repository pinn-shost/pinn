// pb_hooks/aufgaben.pb.js
// Aufgaben auf dem NAS (PocketBase-Sammlung "aufgaben") statt im Apple-Aufgaben-Kalender.
// Die Logik steckt in pinn-aufgaben.js.
//
// Routen (alle nur angemeldet, jede Familie sieht nur ihre eigenen Aufgaben):
//   GET  /api/pinn/aufgaben                  alle Aufgaben
//   POST /api/pinn/aufgaben/speichern        {id?, title, notes, dueDate, fromTime?, toTime?, neu?}
//                                            neu = true: Hinweis für die Glocke der übrigen Familie
//                                            (pinn-hinweise.js)
//   POST /api/pinn/aufgaben/erledigt         {id, done}  -> {aufgabe, alleErledigt}
//                                            beim Abhaken: Benachrichtigung "alle erledigt" bzw.
//                                            Fortschritt eines Kindes (pinn-push.js); die übrige
//                                            Familie sieht es unter der Glocke (pinn-hinweise.js)
//   POST /api/pinn/aufgaben/loeschen         {id}
//   POST /api/pinn/aufgaben/haushalt-jetzt   Haushalts-Aufgaben sofort prüfen/anlegen
//   GET  /api/pinn/aufgaben/statistik?tage=30|90|365   „Wer macht wie viel?“ (Haushalt, inkl. Reihum)
//   POST /api/pinn/aufgaben/belohnung        {memberId, titel, sterne} Kind möchte Sterne eintauschen ->
//                                            Benachrichtigung an die Eltern (Kinderseite)
//
// Zeitplan: einmal pro Stunde (Minute 7) für alle Familien Haushalts-Aufgaben prüfen und erledigte aufräumen.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-aufgaben.js`).ensureSchema();
    } catch (err) {
        console.log("[Aufgaben] Einrichtung fehlgeschlagen: " + err.message);
    }
});

cronAdd("pinnAufgaben", "7 * * * *", () => {
    try {
        require(`${__hooks}/pinn-aufgaben.js`).runCron();
    } catch (err) {
        console.log("[Aufgaben] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("GET", "/api/pinn/aufgaben", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        return e.json(200, { aufgaben: require(`${__hooks}/pinn-aufgaben.js`).listAll(e.auth.getString("familie")) });
    } catch (err) {
        return e.json(200, { aufgaben: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/aufgaben/speichern", (e) => {
    try {
        const body = e.requestInfo().body;
        const task = require(`${__hooks}/pinn-aufgaben.js`).saveTask(body, e.auth.id, e.auth.getString("familie"));
        if (body && body.neu) {
            try {
                require(`${__hooks}/pinn-hinweise.js`).taskCreated(e.auth.getString("familie"), task, e.auth);
            } catch (err) {
                console.log("[Hinweise] " + err.message);
            }
        }
        return e.json(200, { success: true, aufgabe: task });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/aufgaben/erledigt", (e) => {
    const body = e.requestInfo().body;
    try {
        const task = require(`${__hooks}/pinn-aufgaben.js`).setDone(e.auth.getString("familie"), body.id, !!body.done, e.auth.id);
        try {
            require(`${__hooks}/pinn-hinweise.js`).taskDone(e.auth.getString("familie"), task, e.auth, !!body.done);
        } catch (err) {
            console.log("[Hinweise] " + err.message);
        }
        return e.json(200, { success: true, aufgabe: task, alleErledigt: !!task.alleErledigt });
    } catch (err) {
        return e.json(200, { error: "Aufgabe nicht gefunden." });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/aufgaben/loeschen", (e) => {
    const body = e.requestInfo().body;
    try {
        require(`${__hooks}/pinn-aufgaben.js`).removeTask(e.auth.getString("familie"), body.id);
        return e.json(200, { success: true });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/aufgaben/haushalt-jetzt", (e) => {
    try {
        const r = require(`${__hooks}/pinn-aufgaben.js`).runHouseholdNow(e.auth.getString("familie"));
        return e.json(200, { success: true, created: r.created, busy: !!r.busy });
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("GET", "/api/pinn/aufgaben/statistik", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    let tage = 30;
    try { tage = Number(e.request.url.query().get("tage")) || 30; } catch (err) { tage = 30; }
    try {
        return e.json(200, require(`${__hooks}/pinn-aufgaben.js`).statistik(e.auth.getString("familie"), tage));
    } catch (err) {
        return e.json(200, { error: err.message });
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/aufgaben/belohnung", (e) => {
    try {
        const n = require(`${__hooks}/pinn-aufgaben.js`).notifyReward(e.auth.getString("familie"), e.auth.id, e.requestInfo().body || {});
        return e.json(200, { success: true, verschickt: n });
    } catch (err) {
        console.log("[Push] Belohnung: " + err.message);
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
