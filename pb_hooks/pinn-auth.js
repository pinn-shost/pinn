// pb_hooks/pinn-auth.js
// Gemeinsame Konstanten und Hilfsfunktionen für die Anmeldung. Wird von benutzer.pb.js per
// require() geladen: In PocketBase läuft jeder Handler in einer eigenen, abgeschotteten Umgebung,
// Variablen von oben in einer .pb.js-Datei sind darin NICHT sichtbar.

const USERS = "benutzer";
const AUTH_RULE = "@request.auth.id != ''";

function isAdmin(e) {
    return !!(e.auth && e.auth.collection().name === USERS && e.auth.getString("rolle") === "admin");
}
function adminCount() {
    return $app.countRecords(USERS, $dbx.hashExp({ rolle: "admin" }));
}
function cleanUsername(v) {
    return String(v || "").trim().slice(0, 60);
}

module.exports = { USERS, AUTH_RULE, isAdmin, adminCount, cleanUsername };
