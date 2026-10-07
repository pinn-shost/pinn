// pb_hooks/pinnwand.pb.js
// Pinnwand der Familie (Logik: pinn-pinnwand.js).
//
// Beim Start: legt die Sammlung "pinnwand_bilder" an (Fotos der Zettel; geschützte Dateien, nur für
// die eigene Familie). Hoch-/runtergeladen wird direkt über die PocketBase-Sammlungs-API mit
// Anmeldung bzw. Datei-Token.
//
// Die Zettel selbst liegen in den Familiendaten (Schlüssel "pinboard") und werden über
// /api/pinn/save gespeichert - dort wird nach jedem Speichern pinn-pinnwand.js#afterSave aufgerufen,
// das neue Zettel, Antworten, Reaktionen und Erinnerungen für den Push-Versand vormerkt.
//
// Zeitplan: jede Minute - verschickt Vorgemerktes (ca. 20 Sekunden nach dem Speichern) und fällige
// Zettel-Erinnerungen. Liest dafür nur einen kleinen Stand aus dem Zwischenspeicher; die
// Familiendaten werden nur gelesen, wenn wirklich etwas zu verschicken ist. Einmal täglich (ab 3 Uhr)
// werden Fotos gelöscht, die zu keinem Zettel mehr gehören.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-pinnwand.js`).ensureSchema();
    } catch (err) {
        console.log("[Pinnwand] Einrichtung fehlgeschlagen: " + err.message);
    }
});

cronAdd("pinnPinnwand", "* * * * *", () => {
    try {
        require(`${__hooks}/pinn-pinnwand.js`).runCron();
    } catch (err) {
        console.log("[Pinnwand] Zeitplan-Fehler: " + err.message);
    }
});
