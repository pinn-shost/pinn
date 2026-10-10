// pb_hooks/kassen.pb.js
// Kassen: getrennte Finanzbereiche (z. B. Haushalts-, WG-, Paar- oder eigene Kasse) plus die
// Familien-Gruppe für Verträge und Dokumente ohne eigene Kasse. Die Logik steckt in pinn-kassen.js.
//
// Beim Start: legt die Sammlung "kassen" an, zieht alte Finanzdaten (von vor den Kassen) in eine
// Haushaltskasse um, entfernt leere, früher automatisch angelegte Kassen und gibt jeder Familie ihre
// Familien-Gruppe. Neue Familien haben danach keine Kasse - die legt man in Finanzen selbst an.
//
// Routen (alle nur angemeldet, nicht für Gastkonten):
//   POST /api/pinn/kassen                 { stand: { <ID>: '<updated>' } } -> alle Kassen, in denen man
//                                         Mitglied ist (Finanzdaten nur, wenn sie sich geändert haben)
//   POST /api/pinn/kassen/speichern       { id, expectedUpdated, daten } -> 200 | 409 (Konflikt, aktueller Stand)
//   POST /api/pinn/kassen/einstellungen   { id?, name, icon, color, members, all, split } - anlegen/ändern
//   POST /api/pinn/kassen/loeschen        { id } - Kasse samt Buchungen löschen (nur wer sie verwaltet)
//   POST /api/pinn/kassen/verlassen       { id } - Kasse verlassen
//   POST /api/pinn/kassen/retten          { daten } - fehlende Finanzdaten aus einem älteren Stand eines
//                                         Geräts in die Haushaltskasse ergänzen (löscht nie etwas)
//   POST /api/pinn/kassen/sicherung       { id } - Tages-Sicherung einer Kasse zurückholen (ergänzt nur)
//   POST /api/pinn/kassen/diagnose        { schritt, index? } - prüft das Laden Schritt für Schritt
//                                         (App: Finanzen → „Fehlerdetails“). Jeder Schritt ist eine
//                                         eigene Anfrage - so zeigt sich auch, welcher Schritt den Server
//                                         abstürzen lässt.
//
// WICHTIG: PocketBase führt jeden Routen-Handler isoliert aus - Funktionen auf Dateiebene dieser Datei
// sind im Handler nicht sichtbar (das war die Ursache für „Something went wrong …“). Alle Hilfen
// (httpSend, httpGuard, httpBody, httpFail) liegen deshalb in pinn-kassen.js.
//
// Antworten werden in JavaScript selbst in JSON umgewandelt (JSON.stringify) und als Text verschickt -
// nicht über die Go-Umwandlung von e.json(). Jede Route fängt Fehler selbst ab und antwortet mit
// { error: '…' }; Fehler stehen zusätzlich im Log (docker logs pocketbase).
//
// Kein Zeitplan - es läuft nur etwas, wenn jemand die Finanzen öffnet oder etwas ändert.

onBootstrap((e) => {
    e.next();
    try {
        // Buchungen, Belege und Dokumente brauchen das Feld "kasse", bevor die Kassen sie übernehmen
        try { require(`${__hooks}/pinn-finanzen.js`).ensureSchema(); } catch (err) { console.log("[Kassen] Buchungen: " + err.message); }
        try { require(`${__hooks}/pinn-vertraege.js`).ensureSchema(); } catch (err) { console.log("[Kassen] Belege: " + err.message); }
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

// Fehlersuche: ein Schritt je Anfrage (verrät keine Finanzdaten, nur Größen, Arten und Schlüssel)
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
