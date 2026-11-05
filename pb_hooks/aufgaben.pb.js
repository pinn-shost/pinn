// pb_hooks/aufgaben.pb.js
// Tasks on the NAS (PocketBase collection "aufgaben") instead of in the Apple tasks calendar.
// The logic lives in pinn-aufgaben.js.
//
// Routes (all signed-in only, each family only sees its own tasks):
//   GET  /api/pinn/aufgaben                  all tasks
//   POST /api/pinn/aufgaben/speichern        {id?, title, notes, dueDate, fromTime?, toTime?, neu?}
//                                            neu = true: notice for the bell of the rest of the family
//                                            (pinn-hinweise.js)
//   POST /api/pinn/aufgaben/erledigt         {id, done}  -> {aufgabe, alleErledigt}
//                                            when ticking off: notification "all completed" or
//                                            a child's progress (pinn-push.js); the rest of the
//                                            family sees it under the bell (pinn-hinweise.js)
//   POST /api/pinn/aufgaben/loeschen         {id}
//   POST /api/pinn/aufgaben/haushalt-jetzt   check/create household tasks immediately
//   GET  /api/pinn/aufgaben/statistik?tage=30|90|365   "Who does how much?" (household, incl. rotation)
//   POST /api/pinn/aufgaben/belohnung        {memberId, titel, sterne} child wants to exchange stars ->
//                                            notification to the parents (kids' page)
//
// Schedule: once per hour (minute 7) check household tasks for all families and clean up completed ones.

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
