// pb_hooks/save_family_data.pb.js
// Speichert die Familiendaten nur, wenn der Datensatz seit dem letzten Laden durch diesen Client
// NICHT von jemand anderem geändert wurde ("expectedUpdated" = Zeitstempel, den der Client zuletzt
// gesehen hat). Wurde er zwischenzeitlich geändert, wird NICHT überschrieben, sondern der aktuelle
// Stand zurückgegeben (Status 409) - der Client führt dann beide Stände zusammen und versucht es
// erneut. Prüfen und Speichern laufen in einer Transaktion, damit sich zwei gleichzeitige
// Speichervorgänge nicht dazwischen drängen können.
// Apple-Zugangsdaten (appleCalendar.email / appleCalendar.appPassword) werden grundsätzlich
// verworfen - sie gehören in die .env, nicht in familien_daten.
// Gespeichert wird nur in den Datensatz der EIGENEN Familie.
// Nach erfolgreichem Speichern werden die als öffentlich markierten Rezepte in die Sammlung
// "oeffentliche_rezepte" gespiegelt (pinn-rezepte.js) - mit den gerade empfangenen Daten, ohne die
// großen Familiendaten erneut zu lesen. Ein Fehler dabei verhindert nie das Speichern.
// Ebenso bekommt die Pinnwand (pinn-pinnwand.js) die gerade gespeicherten Daten: sie merkt sich neue
// Zettel, Antworten, Reaktionen und Erinnerungen und schickt die Push-Nachrichten kurz darauf über
// ihren eigenen Zeitplan - das Speichern selbst wartet nie auf den Versand.
//
// Kassen (pinn-kassen.js): Sobald die Familie ihre Haushaltskasse hat, liegen die Finanzdaten nur noch
// in den Kassen. Ein mitgeschicktes "finance" (z. B. von einem noch nicht aktualisierten Gerät) wird
// dann verworfen und nie mehr im Familien-Datensatz gespeichert - sonst sähe jedes Profil sie wieder.
//
// Gastkonten (Rolle "gast", nur über das Familien-Dashboard):
// - sehen die Finanz-Einstellungen (Schlüssel "finance": Budget, Kategorien, regelmäßige Ausgaben)
//   nicht - sie werden beim Abruf der Familiendaten entfernt (onRecordEnrich unten)
// - können sie beim Speichern nicht ändern: der gespeicherte Stand bleibt erhalten
// - können auch die vom Admin gewählten Gast-Menüs (Schlüssel "guestHiddenViews") nicht ändern
// - dürfen die Familiendaten nur über diese Route ändern, nicht direkt über die Sammlungs-API

routerAdd("POST", "/api/pinn/save", (e) => {
    const body = e.requestInfo().body;
    if (!body.recordId || !body.data || typeof body.data !== "object") {
        return e.json(400, { error: "recordId und data sind erforderlich." });
    }

    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    const incoming = body.data;
    calendarSync.stripAppleSecrets(incoming);
    const guest = require(`${__hooks}/pinn-benutzer.js`).isGuest(e);
    let kassenAktiv = false;
    try { kassenAktiv = require(`${__hooks}/pinn-kassen.js`).familyMigrated(e.auth.getString("familie")); } catch (err) { kassenAktiv = false; }
    if (kassenAktiv && incoming.finance !== undefined) {
        // Ältere Geräte schicken die Finanzdaten noch mit: Fehlendes in die Haushaltskasse übernehmen
        // (löscht nie etwas, nur in den ersten 30 Tagen nach dem Umzug), dann verwerfen
        try { require(`${__hooks}/pinn-kassen.js`).rescueFinance(e.auth.getString("familie"), incoming.finance, { quelle: "Familiendaten eines älteren Geräts" }); } catch (err) { /* egal */ }
        delete incoming.finance;
    }

    let result = null;
    let savedFamily = "";
    let previous = null;
    try {
        $app.runInTransaction((txApp) => {
            const record = txApp.findRecordById("familien_daten", body.recordId);
            const ownFamily = e.auth.getString("familie");
            if (!ownFamily || record.getString("familie") !== ownFamily) {
                result = { status: 403, body: { error: "Dieser Datensatz gehört zu einer anderen Familie." } };
                return;
            }
            const currentUpdated = record.getString("updated");
            if (body.expectedUpdated && currentUpdated !== body.expectedUpdated) {
                const current = calendarSync.parseRecordData(record.get("data"));
                calendarSync.stripAppleSecrets(current);
                if ((guest || kassenAktiv) && current) delete current.finance;
                result = {
                    status: 409,
                    body: { conflict: true, updated: currentUpdated, data: current },
                };
                return;
            }
            const stored = calendarSync.parseRecordData(record.get("data")) || {};
            previous = stored;
            if (kassenAktiv) delete incoming.finance;
            if (guest) {
                // Finanz-Einstellungen und Gast-Menüs kann ein Gast nicht ändern: gespeicherten Stand behalten
                ["finance", "guestHiddenViews"].forEach(key => {
                    if (stored[key] !== undefined) incoming[key] = stored[key];
                    else delete incoming[key];
                });
            }
            record.set("data", incoming);
            txApp.save(record);
            savedFamily = ownFamily;
            result = { status: 200, body: { success: true, updated: record.getString("updated") } };
        });
    } catch (err) {
        return e.json(500, { error: err.message });
    }
    if (savedFamily) {
        try {
            require(`${__hooks}/pinn-rezepte.js`).syncFamily(savedFamily, incoming);
        } catch (err) {
            console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message);
        }
        try {
            require(`${__hooks}/pinn-pinnwand.js`).afterSave(savedFamily, incoming, e.auth.id);
        } catch (err) {
            console.log("[Pinnwand] Auswertung nach dem Speichern fehlgeschlagen: " + err.message);
        }
        try {
            require(`${__hooks}/pinn-hinweise.js`).afterSave(savedFamily, previous, incoming, e.auth);
        } catch (err) {
            console.log("[Hinweise] Auswertung nach dem Speichern fehlgeschlagen: " + err.message);
        }
    }
    return e.json(result.status, result.body);
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Gastkonten: Finanz-Einstellungen beim Abruf entfernen, direkte Änderungen über die API sperren
// ---------------------------------------------------------------------------------------------
onRecordEnrich((e) => {
    try {
        const auth = e.requestInfo ? e.requestInfo.auth : null;
        if (auth && require(`${__hooks}/pinn-benutzer.js`).isGuestRecord(auth)) {
            const data = require(`${__hooks}/calendar-sync.js`).parseRecordData(e.record.get("data")) || {};
            if (data.finance !== undefined) {
                delete data.finance;
                e.record.set("data", data);
            }
        }
    } catch (err) {
        console.log("[Familiendaten] Gast-Filter fehlgeschlagen: " + err.message);
    }
    e.next();
}, "familien_daten");

onRecordCreateRequest((e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) throw new ForbiddenError("Gastkonten können keine Familiendaten anlegen.");
    e.next();
}, "familien_daten");

onRecordUpdateRequest((e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) throw new ForbiddenError("Gastkonten können die Familiendaten nur über die App ändern.");
    e.next();
}, "familien_daten");

onRecordDeleteRequest((e) => {
    if (require(`${__hooks}/pinn-benutzer.js`).isGuest(e)) throw new ForbiddenError("Gastkonten können keine Familiendaten löschen.");
    e.next();
}, "familien_daten");
