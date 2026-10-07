// pb_hooks/dokumente.pb.js
// Menüpunkt „Dokumente“: Sammlung für Dokumente und Erinnerungen an Ablaufdaten/Garantien.
// Die Logik steckt in pinn-dokumente.js.
//
// Beim Start: legt die Sammlung "dokumente" an (Fotos/PDFs als geschützte Dateien, nur für die
// eigene Familie, nicht für Gastkonten). Hoch-/runtergeladen wird direkt über die PocketBase-
// Sammlungs-API mit Anmeldung bzw. Datei-Token.
//
// Route (nur angemeldet, nicht für Gastkonten):
//   POST /api/pinn/dokumente/pruefen   fällige Erinnerungen der eigenen Familie jetzt verschicken
//                                      (die App ruft das nach dem Speichern eines Dokuments mit
//                                      Erinnerung auf; nur zwischen 8 und 21 Uhr, nichts doppelt)
//
// Zeitplan: stündlich (Minute 27) - die eigentliche Prüfung läuft aber nur einmal am Tag ab 8 Uhr.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-dokumente.js`).ensureSchema();
    } catch (err) {
        console.log("[Dokumente] Einrichtung fehlgeschlagen: " + err.message);
    }
});

cronAdd("pinnDokumente", "27 * * * *", () => {
    try {
        require(`${__hooks}/pinn-dokumente.js`).runReminders({});
    } catch (err) {
        console.log("[Dokumente] Zeitplan-Fehler: " + err.message);
    }
});

routerAdd("POST", "/api/pinn/dokumente/pruefen", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (lib.isGuest(e)) return e.json(403, { error: "Gastkonten haben keinen Zugriff auf die Dokumente." });
    const familyId = lib.familyOf(e);
    if (!familyId) return e.json(200, { success: false });
    try {
        const r = require(`${__hooks}/pinn-dokumente.js`).runReminders({ familyId: familyId });
        return e.json(200, Object.assign({ success: true }, r));
    } catch (err) {
        return e.json(200, { success: false, error: err.message });
    }
}, $apis.requireAuth("benutzer"));
