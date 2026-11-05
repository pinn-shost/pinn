// pb_hooks/save_family_data.pb.js
// Saves the family data only if the record has NOT been changed by someone else since this client
// last loaded it ("expectedUpdated" = timestamp the client last saw). If it was changed in the
// meantime, it is NOT overwritten, but the current state is returned (status 409) - the client
// then merges both states and tries again. Checking and saving run in one transaction, so that
// two simultaneous save operations cannot push in
// between.
// Apple credentials (appleCalendar.email / appleCalendar.appPassword) are always
// discarded - they belong in the .env, not in familien_daten.
// Data is only saved into the record of the OWN family.
// After a successful save, the recipes marked as public are mirrored into the collection
// "oeffentliche_rezepte" (pinn-rezepte.js) - with the data just received, without reading the
// large family data again. An error there never prevents saving.
// Likewise the pinboard (pinn-pinnwand.js) gets the data that was just saved: it remembers new
// notes, replies, reactions and reminders and sends the push messages shortly afterwards via
// its own schedule - saving itself never waits for the sending.
//
// Funds (pinn-kassen.js): as soon as the family has its household fund, the finance data only lives
// in the funds. A "finance" sent along (e.g. from a device that has not been updated yet) is
// then discarded and never stored in the family record again - otherwise every profile would see it again.
//
// Areas (pinn-bereiche.js, since 1.104.0): recipes, meal plan, shopping, pantry, pinboard, lists,
// school & daycare, pets, maintenance plan, since 1.108.0 members, emergency passes and settings and since 1.109.0
// tasks, household (rooms, cleaning plans, trash bins, smart home devices) and the calendar selection live in their own
// records ("familien_bereiche") and are saved via /api/pinn/bereiche/speichern. The app
// sends along which areas it manages itself ("bereiche": list of names; 1.104 sent true =
// recipes and meal plan). What a device still sends in the large block anyway is taken over into the areas
// (never deletes anything) and discarded here. On a conflict and on retrieval, every device gets
// the areas it does not know yet delivered along (?bereiche=<names>), so that until its update it
// keeps seeing everything.
//
// Family members: the former example members (Anna/Jonas/Mia) are discarded when saving
// as long as no profile is linked to them (pinn-benutzer.js).
//
// Guest accounts (role "gast", only via the family dashboard):
// - do not see the finance settings (key "finance": budget, categories, recurring expenses)
//   - they are removed when the family data is retrieved (onRecordEnrich below)
// - cannot change them when saving: the stored state is kept
// - also cannot change the guest menus chosen by the admin (key "guestHiddenViews")
// - may only change the family data via this route, not directly via the collection API

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
        // Older devices still send the finance data along: take over what is missing into the household fund
        // (never deletes anything, only in the first 30 days after the migration), then discard it
        try { require(`${__hooks}/pinn-kassen.js`).rescueFinance(e.auth.getString("familie"), incoming.finance, { quelle: "Familiendaten eines älteren Geräts" }); } catch (err) { /* ignore */ }
        delete incoming.finance;
    }

    // never store example members (Anna/Jonas/Mia) from older devices again
    try { require(`${__hooks}/pinn-benutzer.js`).stripExampleMembers(e.auth.getString("familie"), incoming); } catch (err) { /* ignore */ }

    // Guests never change the guest menus - also not via the areas (since 1.108 in the area "einstellungen")
    if (guest) delete incoming.guestHiddenViews;

    // Areas (recipes, meal plan ...) no longer belong in the family record
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
                // Also deliver the areas the device does not know yet - otherwise e.g. the recipes would disappear there
                if (current) {
                    try {
                        const B = require(`${__hooks}/pinn-bereiche.js`);
                        const fehlen = B.unknownAreas(ownFamily, bekannt);
                        if (fehlen.length) B.overlay(ownFamily, current, fehlen);
                    } catch (err) { /* ignore */ }
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
                // A guest cannot change finance settings and guest menus: keep the stored state
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
                // Recipes live in their own area - here only if the kitchen appliances have changed
                bereiche.syncPublicRecipes(savedFamily, incoming.kitchenTools);
            }
        } catch (err) {
            console.log("[Rezepte] Abgleich öffentlicher Rezepte fehlgeschlagen: " + err.message);
        }
        try {
            // The pinboard has lived in its own area since 1.106 (evaluation there) - here only as long as not migrated yet
            if (incoming.pinboard !== undefined) require(`${__hooks}/pinn-pinnwand.js`).afterSave(savedFamily, incoming, e.auth.id);
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
// Guest accounts: remove finance settings on retrieval, block direct changes via the API
// ---------------------------------------------------------------------------------------------
onRecordEnrich((e) => {
    // Also deliver the areas (recipes, meal plan, shopping, pantry ...) that the device does not load itself yet
    // (?bereiche=<names>; 1.104 sent ?bereiche=1, older versions nothing at all)
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
