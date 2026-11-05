// pb_hooks/pinn-auth.js
// Shared constants and helper functions for the sign-in. Loaded by benutzer.pb.js via
// require(): in PocketBase every handler runs in its own, isolated environment,
// variables from above in a .pb.js file are NOT visible in it.

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
