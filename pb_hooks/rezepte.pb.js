// pb_hooks/rezepte.pb.js
// Öffentliche Rezepte über alle Familien hinweg. Die Logik steckt in pinn-rezepte.js.
//
// Beim Start: legt die Sammlung "oeffentliche_rezepte" an bzw. ergänzt fehlende Felder.
// Befüllt wird sie beim Speichern der Familiendaten (save_family_data.pb.js) - jedes Rezept mit
// gesetztem Haken "Rezept öffentlich teilen" landet dort, entfernte Haken/gelöschte Rezepte
// verschwinden wieder.
//
// Wird eine Familie gelöscht, bleiben ihre öffentlichen Rezepte (samt Bildern) erhalten und
// erscheinen danach für alle unter "Rezepte Familie" (siehe pinn-rezepte.js, detachFamily).
//
// Route (nur angemeldet):
//   GET /api/pinn/rezepte/oeffentlich   alle öffentlichen Rezepte aller Familien
//                                        (eigene sind mit "eigene: true" gekennzeichnet)

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-rezepte.js`).ensureSchema();
    } catch (err) {
        console.log("[Rezepte] Einrichtung fehlgeschlagen: " + err.message);
    }
});

// Vor dem Löschen einer Familie: öffentliche Rezepte in die "Rezepte Familie" verschieben.
// Ein Fehler hier wird nur geloggt und verhindert das Löschen nicht.
onRecordDelete((e) => {
    try {
        require(`${__hooks}/pinn-rezepte.js`).detachFamily(e.app, e.record.id);
    } catch (err) {
        console.log("[Rezepte] Öffentliche Rezepte der Familie konnten nicht gesichert werden: " + err.message);
    }
    e.next();
}, "familien");

routerAdd("GET", "/api/pinn/rezepte/oeffentlich", (e) => {
    e.response.header().set("Cache-Control", "no-store");
    try {
        const list = require(`${__hooks}/pinn-rezepte.js`).listPublic(e.auth.getString("familie"));
        return e.json(200, { rezepte: list });
    } catch (err) {
        return e.json(200, { rezepte: [], error: err.message });
    }
}, $apis.requireAuth("benutzer"));
