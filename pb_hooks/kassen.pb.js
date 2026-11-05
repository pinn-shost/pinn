// pb_hooks/kassen.pb.js
// Funds: separate finance areas (e.g. household, flat-share, couple's or own fund) plus the
// family group for contracts and documents without a fund of their own. The logic lives in pinn-kassen.js.
//
// On start: creates the collection "kassen", moves old finance data (from before the funds) into a
// household fund, removes empty funds that were created automatically in the past and gives every family its
// family group. New families then have no fund - you create it yourself in Finance.
//
// Routes (all signed-in only, not for guest accounts):
//   POST /api/pinn/kassen                 { stand: { <ID>: '<updated>' } } -> all funds of which one is a
//                                         member (finance data only if it has changed)
//   POST /api/pinn/kassen/speichern       { id, expectedUpdated, daten } -> 200 | 409 (conflict, current state)
//   POST /api/pinn/kassen/einstellungen   { id?, name, icon, color, members, all, split } - create/change
//   POST /api/pinn/kassen/loeschen        { id } - delete a fund including its bookings (only whoever manages it)
//   POST /api/pinn/kassen/verlassen       { id } - leave a fund
//   POST /api/pinn/kassen/retten          { daten } - add missing finance data from an older state of a
//                                         device to the household fund (never deletes anything)
//   POST /api/pinn/kassen/sicherung       { id } - restore the daily backup of a fund (only adds)
//   POST /api/pinn/kassen/diagnose        { schritt, index? } - checks the loading step by step
//                                         (app: Finance → "Error details"). Every step is its
//                                         own request - so it also shows which step makes the server
//                                         crash.
//
// IMPORTANT: PocketBase runs every route handler in isolation - functions at file level of this file
// are not visible in the handler (that was the cause of "Something went wrong ..."). All helpers
// (httpSend, httpGuard, httpBody, httpFail) therefore live in pinn-kassen.js.
//
// Responses are converted to JSON in JavaScript itself (JSON.stringify) and sent as text -
// not via the Go conversion of e.json(). Every route catches errors itself and answers with
// { error: '…' }; errors are additionally in the log (docker logs pocketbase).
//
// No schedule - something only runs when someone opens the finances or changes something.

onBootstrap((e) => {
    e.next();
    try {
        // Bookings, receipts and documents need the field "kasse" before the funds take them over -
        // the database set-up (pinn-schema.js) creates them in this order
        try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { console.log("[Kassen] Einrichtung: " + err.message); }
        require(`${__hooks}/pinn-kassen.js`).migrateAll();
        try { require(`${__hooks}/pinn-dokumente.js`).ensureSchema(); } catch (err) { console.log("[Kassen] Dokumente: " + err.message); }
    } catch (err) {
        console.log("[Kassen] Einrichtung fehlgeschlagen: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/kassen", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        const body = K.httpBody(e);
        const list = require(`${__hooks}/pinn-kassen.js`).list(e.auth, body.stand);
        return K.httpSend(e, 200, { kassen: Array.isArray(list) ? list : [] });
    } catch (ex) {
        return K.httpFail(e, "Laden", ex, 500);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/speichern", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        const r = require(`${__hooks}/pinn-kassen.js`).saveData(e.auth, K.httpBody(e));
        return K.httpSend(e, r.status, r.body);
    } catch (ex) {
        return K.httpFail(e, "Speichern", ex, 500);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/einstellungen", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        const k = require(`${__hooks}/pinn-kassen.js`).saveSettings(e.auth, K.httpBody(e));
        return K.httpSend(e, 200, { success: true, kasse: k });
    } catch (ex) {
        return K.httpFail(e, "Einstellungen", ex);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/loeschen", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        require(`${__hooks}/pinn-kassen.js`).remove(e.auth, K.httpBody(e).id);
        return K.httpSend(e, 200, { success: true });
    } catch (ex) {
        return K.httpFail(e, "Löschen", ex);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/verlassen", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        require(`${__hooks}/pinn-kassen.js`).leave(e.auth, K.httpBody(e).id);
        return K.httpSend(e, 200, { success: true });
    } catch (ex) {
        return K.httpFail(e, "Verlassen", ex);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/retten", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        const lib = require(`${__hooks}/pinn-kassen.js`);
        const body = K.httpBody(e);
        const acc = lib.access(e.auth);
        if (!acc.haushalt) return K.httpSend(e, 200, { success: false, expired: true, notMember: true });
        const n = lib.rescueFinance(e.auth.getString("familie"), body.daten, { force: true, quelle: "Gerät von " + e.auth.getString("username") });
        if (n < 0) return K.httpSend(e, 200, { success: false, expired: true });
        return K.httpSend(e, 200, { success: true, added: n });
    } catch (ex) {
        return K.httpFail(e, "Rettung", ex);
    }
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/kassen/sicherung", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 403, { error: err });
        const r = require(`${__hooks}/pinn-kassen.js`).restoreBackup(e.auth, K.httpBody(e).id);
        return K.httpSend(e, 200, { success: true, added: r.added });
    } catch (ex) {
        return K.httpFail(e, "Sicherung", ex);
    }
}, $apis.requireAuth("benutzer"));

// Troubleshooting: one step per request (reveals no finance data, only sizes, kinds and keys)
routerAdd("POST", "/api/pinn/kassen/diagnose", (e) => {
    const K = require(`${__hooks}/pinn-kassen.js`);
    const t0 = Date.now();
    try {
        const err = K.httpGuard(e);
        if (err) return K.httpSend(e, 200, { error: err });
        const lib = require(`${__hooks}/pinn-kassen.js`);
        const body = K.httpBody(e);
        const fam = e.auth.getString("familie");
        const me = e.auth.id;
        let r = null;
        switch (String(body.schritt || "")) {
            case "profil": {
                r = { rolle: e.auth.getString("rolle"), familie: fam, sammlung: !!lib.ensureSchema() };
                break;
            }
            case "liste": {
                r = lib.metaList(fam).map(k => ({
                    id: k.id, art: k.art, name: k.name, alle: k.alle, mitglieder: k.mitglieder.length,
                    besitzer: k.besitzer ? (k.besitzer === me ? "du" : "andere") : "",
                    mitglied: lib.isMember(k, e.auth), updated: k.updated,
                }));
                break;
            }
            case "umzug": {
                const h = lib.ensureFamily(fam);
                r = { haushaltskasse: h ? h.id : null };
                break;
            }
            case "gruppe": {
                const g = lib.ensureFamilyGroup(fam);
                r = { familiengruppe: g ? g.id : null };
                break;
            }
            case "kasse": {
                const list = lib.metaList(fam);
                const k = list[Math.max(0, Number(body.index) || 0)];
                if (!k) { r = { fehlt: true }; break; }
                const rec = $app.findRecordById(lib.KASSEN, k.id);
                const raw = rec.get("daten");
                const d = lib.parseDaten(raw, null);
                let bytes = -1;
                try { bytes = JSON.stringify(d).length; } catch (x) { bytes = -2; }
                r = {
                    id: k.id, art: k.art, mitglied: lib.isMember(k, e.auth),
                    rohtyp: raw === null ? "null" : typeof raw, datentyp: d === null ? "null" : Array.isArray(d) ? "liste" : typeof d,
                    bytes: bytes, schluessel: (d && typeof d === "object" && !Array.isArray(d)) ? Object.keys(d).slice(0, 40) : [],
                };
                break;
            }
            case "antwort": {
                const l = lib.list(e.auth, {});
                const s = JSON.stringify({ kassen: l });
                r = { kassen: l.length, bytes: s.length };
                break;
            }
            default:
                return K.httpSend(e, 200, { error: "Unbekannter Schritt." });
        }
        if (r && typeof r === "object" && !Array.isArray(r)) r.ms = Date.now() - t0;
        return K.httpSend(e, 200, { ergebnis: r });
    } catch (ex) {
        return K.httpFail(e, "Diagnose", ex);
    }
}, $apis.requireAuth("benutzer"));
