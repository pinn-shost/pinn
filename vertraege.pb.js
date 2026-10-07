// pb_hooks/vertraege.pb.js
// Finanzen → Verträge: Dokumente-Sammlung und Erinnerungen an Kündigungsfristen.
// Die Logik steckt in pinn-vertraege.js.
//
// Beim Start: legt die Sammlung "finanz_dokumente" an (Vertragsdokumente und Belege zu Ausgaben;
// geschützte Dateien, nur für die eigene Familie, nicht für Gastkonten). Hoch-/runtergeladen wird
// direkt über die PocketBase-Sammlungs-API mit Anmeldung bzw. Datei-Token.
//
// Route (nur angemeldet, nicht für Gastkonten):
//   POST /api/pinn/vertraege/pruefen   fällige Erinnerungen der eigenen Familie jetzt verschicken
//                                      (die App ruft das nach dem Speichern eines Vertrags auf;
//                                      nur zwischen 8 und 21 Uhr, nichts wird doppelt geschickt)
//
// Zeitplan: stündlich (Minute 23) - die eigentliche Prüfung aller Familien läuft aber nur einmal am
// Tag ab 8 Uhr.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-vertraege.js`).ensureSchema();
    } catch (err) {
        console.log("[Verträge] Einrichtung fehlgeschlagen: " + err.message);
    }
});

cronAdd("pinnVertraege", "23 * * * *", () => {
    try {
        require(`${__hooks}/pinn-vertraege.js`).runReminders({});
    } catch (err) {
        console.log("[Verträge] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/vertraege/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Finanzen." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    try {
        const r = require(`${__hooks}/pinn-vertraege.js`).runReminders({ familyId: familyId });
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
