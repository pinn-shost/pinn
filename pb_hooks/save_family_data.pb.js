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
// Bereiche (pinn-bereiche.js, ab 1.104.0): Rezepte, Essensplan, Einkauf und Vorrat liegen in eigenen
// Datensätzen ("familien_bereiche") und werden über /api/pinn/bereiche/speichern gespeichert. Die App
// schickt mit, welche Bereiche sie selbst verwaltet ("bereiche": Liste der Namen; 1.104 schickte true =
// Rezepte und Essensplan). Was ein Gerät trotzdem noch im großen Block schickt, wird in die Bereiche
// übernommen (löscht nie etwas) und hier verworfen. Bei einem Konflikt und beim Abruf bekommt jedes Gerät
// die Bereiche mitgeliefert, die es noch nicht kennt (?bereiche=<Namen>), damit es bis zu seinem Update
// weiter alles sieht.
//
// Familienmitglieder: Die früheren Beispiel-Mitglieder (Anna/Jonas/Mia) werden beim Speichern
// verworfen, solange kein Profil mit ihnen verknüpft ist (pinn-benutzer.js).
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

    // Beispiel-Mitglieder (Anna/Jonas/Mia) von älteren Geräten nie wieder speichern
    try { require(`${__hooks}/pinn-benutzer.js`).stripExampleMembers(e.auth.getString("familie"), incoming); } catch (err) { /* egal */ }

    // Bereiche (Rezepte, Essensplan …) gehören nicht mehr in den Familien-Datensatz
    let bekannt = [];
    try { bekannt = require(`${__hooks}/pinn-bereiche.js`).knownAreas(body.bereiche); } catch (err) { bekannt = []; }
    try { require(`${__hooks}/pinn-bereiche.js`).absorb(e.auth.getString("familie"), incoming); } catch (err) { console.log("[Bereiche] " + err.message); }

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
                // Bereiche, die das Gerät noch nicht kennt, mitliefern - sonst verschwänden dort z. B. die Rezepte
                if (current) {
                    try {
                        const B = require(`${__hooks}/pinn-bereiche.js`);
                        const fehlen = B.unknownAreas(ownFamily, bekannt);
                        if (fehlen.length) B.overlay(ownFamily, current, fehlen);
                    } catch (err) { /* egal */ }
                }
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
            const bereiche = require(`${__hooks}/pinn-bereiche.js`);
            if (!bereiche.isMoved(savedFamily, "rezepte")) {
                require(`${__hooks}/pinn-rezepte.js`).syncFamily(savedFamily, incoming);
            } else if (JSON.stringify((previous && previous.kitchenTools) || null) !== JSON.stringify(incoming.kitchenTools || null)) {
                // Rezepte liegen im eigenen Bereich - hier nur, wenn sich die Küchengeräte geändert haben
                bereiche.syncPublicRecipes(savedFamily, incoming.kitchenTools);
            }
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
    // Bereiche (Rezepte, Essensplan, Einkauf, Vorrat …), die das Gerät noch nicht selbst lädt, mitliefern
    // (?bereiche=<Namen>; 1.104 schickte ?bereiche=1, ältere Versionen gar nichts)
    try {
        let query = null;
        try { query = e.requestInfo ? e.requestInfo.query : null; } catch (err) { query = null; }
        const fam = e.record.getString("familie");
        const bereiche = require(`${__hooks}/pinn-bereiche.js`);
        const fehlen = fam ? bereiche.unknownAreas(fam, bereiche.knownAreas(query ? String(query["bereiche"] || "") : "")) : [];
        if (fehlen.length) {
            const data = require(`${__hooks}/calendar-sync.js`).parseRecordData(e.record.get("data")) || {};
            bereiche.overlay(fam, data, fehlen);
            e.record.set("data", data);
        }
    } catch (err) {
        console.log("[Familiendaten] Bereiche für ältere Geräte nicht ergänzbar: " + err.message);
    }
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
