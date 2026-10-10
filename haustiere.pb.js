// pb_hooks/haustiere.pb.js
// Haustiere (Familie → Haustiere). Die Logik steckt in pinn-haustiere.js, die Daten liegen in den
// Familiendaten (Schlüssel „pets“ und „petLog“) – offline änderbar und ohne eigene Sammlung.
//
// Zeitplan: alle 5 Minuten – je Profil höchstens eine Push-Nachricht am Tag, zur Uhrzeit der eigenen
// Tagesübersicht (Einstellungen → Benachrichtigungen, Standard 07:00):
//   - Vorsorge (Impfung, Wurmkur, Floh-/Zeckenschutz, Tierarzt …): 3 Tage vorher, am Tag selbst und
//     danach einmal je Woche, solange sie überfällig ist
//   - Geburtstag eines Haustiers
// Empfänger: die Bezugspersonen des Tiers – ohne Angabe alle Profile der Familie außer Gästen,
// Hauptadmin und Kindern mit Kindersicherung. Je Tier abschaltbar (Schalter „Erinnerungen per Push“).

cronAdd("pinnHaustiere", "*/5 * * * *", () => {
    try {
        require(`${__hooks}/pinn-haustiere.js`).runCron();
    } catch (err) {
        console.log("[Haustiere] Zeitplan-Fehler: " + err.message);
        try { require(`${__hooks}/pinn-protokoll.js`).fehler("push", "Haustiere: " + err.message); } catch (e2) { /* egal */ }
    }
});
