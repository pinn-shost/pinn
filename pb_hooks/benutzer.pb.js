// pb_hooks/benutzer.pb.js
// Sign-in, families, profiles and the link profile <-> family member for pinn.
//
// On start (see pinn-benutzer.js):
// - creates the collections "benutzer" and "familien" or completes them
// - makes the profile "Admin" the main admin (without a family) or creates it ("Admin"/"Admin")
// - on an existing installation, takes over all data into the family "Familie"
// - separates familien_daten and rezept_bilder per family
// - creates the push collections "push_abos" and "push_nachrichten"
// The Apple calendar credentials per family are managed by apple_credentials.pb.js (pinn-apple.js),
// the Google account (Android calendar) per family by google_credentials.pb.js (pinn-google.js).
// Family dashboard (profile selection, PIN): dashboard.pb.js / pinn-dashboard.js.
//
// Family members: every profile (except guest/main admin) is exactly one family member. When the
// main admin creates a family or profiles, the members are created right away with the profile names
// (syncFamilyMembers in pinn-benutzer.js) - there are no example members any more. If a profile is
// deleted, its member disappears too.
//
// Guest accounts (role "gast"): created by an admin (/api/pinn/users/create-gast). They have a
// random password known to nobody, do not appear in the sign-in form and only get into the app
// via the family dashboard - without access to the finances.
//
// Device management (sitzungen.pb.js / pinn-sitzungen.js): every sign-in gets a session per
// device. Failed attempts also count per network address (also unknown families and profiles);
// if a profile is locked, the admins get a push message and it appears in the error log.
// Changing or resetting the password signs out all other devices of the profile.
//
// Everything is built defensively: an error here is only logged and never prevents the server from starting.

onBootstrap((e) => {
    e.next();
    // Database set-up (pinn-schema.js, which also contains pinn-benutzer.ensureSchema)
    try { require(`${__hooks}/pinn-schema.js`).ensureCurrent(); } catch (err) { console.log("[Anmeldung] Einrichtung fehlgeschlagen: " + err.message); }
    // Every profile is a family member: create missing members, remove example members
    try {
        require(`${__hooks}/pinn-benutzer.js`).syncAllFamilyMembers();
    } catch (err) {
        console.log("[Familien] Abgleich der Familienmitglieder fehlgeschlagen: " + err.message);
    }
});

// ---------------------------------------------------------------------------------------------
// Sign-in form (without signing in)
// ---------------------------------------------------------------------------------------------

// Check the family and return its profile names. Returns ONLY the family name, the profile names and the
// living arrangement ('familie' or 'wg') - the sign-in form uses it to show "Family" or "Flat share".
routerAdd("GET", "/api/pinn/familie", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    let sitz = null;
    try { sitz = require(`${__hooks}/pinn-sitzungen.js`); } catch (err) { sitz = null; }
    e.response.header().set("Cache-Control", "no-store");
    const ipWait = sitz ? sitz.ipGesperrt(e) : 0;
    if (ipWait) {
        sleep(300);
        return e.json(429, { error: "Zu viele Fehlversuche von diesem Gerät bzw. Netzwerk. Bitte in " + sitz.waitText(ipWait) + " erneut versuchen.", sperre: ipWait });
    }
    let name = "";
    try { name = String(e.request.url.query().get("name") || ""); } catch (err) { name = ""; }
    const fam = lib.findFamily(name);
    if (!fam) {
        sleep(300);
        if (sitz) sitz.ipFehlversuch(e); // Slow down brute-forcing of family names
        return e.json(404, { error: "Diese Familie gibt es nicht. Bitte den Namen prüfen." });
    }
    let names = [];
    try {
        names = $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: fam.id })
            .filter(r => r.getString("rolle") !== "gast") // Guests only via the dashboard
            .map(r => r.getString("username"))
            .sort((a, b) => a.localeCompare(b));
    } catch (err) { names = []; }
    let wohnform = "familie";
    try { wohnform = require(`${__hooks}/pinn-pushtext.js`).wohnformOf(fam.id); } catch (err) { wohnform = "familie"; }
    return e.json(200, { name: fam.getString("name"), profiles: names, wohnform: wohnform });
});

// Device management (pinn-sitzungen.js) - if the file is missing, the sign-in works as before.
// IMPORTANT: in PocketBase every handler runs isolated - helper functions at the top of this file
// are NOT visible in it. That is why pinn-sitzungen.js is fetched directly in every handler.

// Sign in: {familie, username, password} or {hauptadmin: true, password}
// Protection against brute-forcing: after 5 failed attempts for the same profile it is locked
// (30 s, then each time twice as long, 15 minutes at most) - same rule as for the
// dashboard PIN. The lock only lives in memory and only applies to existing profiles.
// In addition, all failed attempts (also for unknown profiles) count per network address - from 20
// within 30 minutes the address is locked (1 minute, then longer, 30 minutes at most).
routerAdd("POST", "/api/pinn/login", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    let sitz = null;
    try { sitz = require(`${__hooks}/pinn-sitzungen.js`); } catch (err) { sitz = null; }
    e.response.header().set("Cache-Control", "no-store");
    const ipWait = sitz ? sitz.ipGesperrt(e) : 0;
    if (ipWait) {
        sleep(300);
        return e.json(429, { error: "Zu viele Fehlversuche von diesem Gerät bzw. Netzwerk. Bitte in " + sitz.waitText(ipWait) + " erneut versuchen.", sperre: ipWait });
    }
    const body = e.requestInfo().body;
    const password = String(body.password || "");
    const username = lib.cleanUsername(body.username);
    let candidates = [];
    let lockId = "";
    let lockFamily = "";
    try {
        if (body.hauptadmin) {
            candidates = $app.findRecordsByFilter(lib.USERS, "rolle = 'hauptadmin'", "", 0, 0);
            if (username) candidates = candidates.filter(r => r.getString("username") === username);
            lockId = "login:hauptadmin";
        } else {
            const fam = lib.findFamily(body.familie);
            if (fam && username) {
                candidates = $app.findRecordsByFilter(lib.USERS, "familie = {:f} && username = {:u}", "", 1, 0, { f: fam.id, u: username });
                lockId = "login:" + fam.id + ":" + username;
                lockFamily = fam.id;
            }
        }
    } catch (err) { candidates = []; }
    candidates = candidates.filter(r => r.getString("rolle") !== "gast");
    const known = candidates.length > 0;

    if (known) {
        const wait = dash.lockedFor(lockId);
        if (wait) {
            sleep(300);
            return e.json(429, { error: "Zu viele Fehlversuche. Bitte in " + dash.waitText(wait) + " erneut versuchen.", sperre: wait });
        }
    }

    const rec = password ? (candidates.find(r => r.validatePassword(password)) || null) : null;
    if (!rec) {
        sleep(700); // slows down brute-forcing of passwords
        const ipLock = sitz ? sitz.ipFehlversuch(e) : 0;
        if (known) {
            const lock = dash.registerFail(lockId);
            if (lock) {
                console.log("[Anmeldung] Zu viele Fehlversuche – Profil für " + dash.waitText(lock) + " gesperrt.");
                if (sitz) {
                    try { sitz.meldeSperre(lockFamily, candidates[0].getString("username"), lock); } catch (err) { /* ignore */ }
                }
                return e.json(429, { error: "Anmeldung fehlgeschlagen. Zu viele Fehlversuche – bitte in " + dash.waitText(lock) + " erneut versuchen.", sperre: lock });
            }
        }
        if (ipLock) {
            return e.json(429, { error: "Anmeldung fehlgeschlagen. Zu viele Fehlversuche von diesem Gerät bzw. Netzwerk – bitte in " + sitz.waitText(ipLock) + " erneut versuchen.", sperre: ipLock });
        }
        return e.json(400, { error: "Anmeldung fehlgeschlagen. Bitte Profil und Passwort prüfen." });
    }
    dash.clearFails(lockId);
    // Reconcile the family's members with their profiles (e.g. creates the own member)
    let authRec = rec;
    const famId = rec.getString("familie");
    if (famId) {
        try {
            if (lib.syncFamilyMembers(famId)) authRec = $app.findRecordById(lib.USERS, rec.id);
        } catch (err) { authRec = rec; }
    }
    return $apis.recordAuthResponse(e, authRec);
});

// ---------------------------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------------------------

// Change the own password. Returns a new sign-in, because PocketBase invalidates old sign-ins
// on a password change. All other devices of the profile are signed out afterwards
// (including their push notifications) - this device stays signed in.
routerAdd("POST", "/api/pinn/password", (e) => {
    if (e.auth.getString("rolle") === "gast") return e.json(403, { error: "Gastkonten haben kein Passwort." });
    const body = e.requestInfo().body;
    const oldPassword = String(body.oldPassword || "");
    const newPassword = String(body.newPassword || "");
    if (newPassword.length < 8) return e.json(400, { error: "Das neue Passwort muss mindestens 8 Zeichen lang sein." });
    if (newPassword === oldPassword) return e.json(400, { error: "Das neue Passwort muss sich vom alten unterscheiden." });
    const rec = $app.findRecordById("benutzer", e.auth.id);
    if (!rec.validatePassword(oldPassword)) return e.json(400, { error: "Das aktuelle Passwort ist nicht korrekt." });
    rec.setPassword(newPassword);
    rec.set("mustChangePassword", false);
    try { rec.refreshTokenKey(); } catch (err) { /* setPassword renews it anyway */ }
    $app.save(rec);
    let sitz = null;
    try { sitz = require(`${__hooks}/pinn-sitzungen.js`); } catch (err) { sitz = null; }
    if (sitz) { try { sitz.entferneAndere(rec.id, sitz.sidOf(e)); } catch (err) { /* ignore */ } }
    return $apis.recordAuthResponse(e, rec);
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Manage profiles (family admins for their family, main admin for all families)
// ---------------------------------------------------------------------------------------------

// Create a profile. Family admins always create in their own family, the main admin passes
// the family along ("familie"). Optionally linked directly to a family member ("mitglied").
routerAdd("POST", "/api/pinn/users/create", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Profile anlegen." });
    const body = e.requestInfo().body;
    let familyId = lib.familyOf(e);
    if (lib.isMainAdmin(e)) {
        const fam = lib.findFamily(body.familie);
        if (!fam) return e.json(400, { error: "Bitte eine Familie wählen." });
        familyId = fam.id;
    }
    if (!familyId) return e.json(400, { error: "Dein Profil gehört zu keiner Familie." });
    const username = lib.cleanUsername(body.username);
    const password = String(body.password || "");
    const rolle = body.rolle === "admin" ? "admin" : "mitglied";
    const mitglied = lib.cleanMemberId(body.mitglied);
    if (!username) return e.json(400, { error: "Bitte einen Benutzernamen eingeben." });
    if (password.length < 8) return e.json(400, { error: "Das Passwort muss mindestens 8 Zeichen lang sein." });
    const taken = lib.profileLinkedTo(familyId, mitglied, "");
    if (taken) return e.json(400, { error: "Dieses Familienmitglied ist bereits mit dem Profil \"" + taken.getString("username") + "\" verknüpft." });
    try {
        const rec = new Record($app.findCollectionByNameOrId(lib.USERS));
        rec.set("username", username);
        rec.set("rolle", rolle);
        rec.set("familie", familyId);
        rec.set("mustChangePassword", true);
        rec.set("mitglied", mitglied);
        rec.setPassword(password);
        // [llm:admin_privilege_escalation] Fix: Do not allow setting 'systemrechte' directly from user input.
        // This field should only be managed internally or through a dedicated, authorized process.
        rec.set("systemrechte", false);
        $app.save(rec);
        // Without a member sent along (e.g. created by the main admin): create a member with the profile name
        // right away and link it. With a member, the app creates it itself.
        if (!mitglied) lib.syncFamilyMembers(familyId);
        return e.json(200, { success: true, id: rec.id });
    } catch (err) {
        return e.json(400, { error: "Profil konnte nicht angelegt werden (Name in dieser Familie schon vergeben?)." });
    }
}, $apis.requireAuth("benutzer"));

// Create a guest account: {username} (main admin additionally {familie}). No family member, no
// known password - it is only opened via the family dashboard.
routerAdd("POST", "/api/pinn/users/create-gast", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Gastkonten anlegen." });
    const body = e.requestInfo().body;
    let familyId = lib.familyOf(e);
    if (lib.isMainAdmin(e)) {
        const fam = lib.findFamily(body.familie);
        if (!fam) return e.json(400, { error: "Bitte eine Familie wählen." });
        familyId = fam.id;
    }
    if (!familyId) return e.json(400, { error: "Dein Profil gehört zu keiner Familie." });
    const username = lib.cleanUsername(body.username);
    if (!username) return e.json(400, { error: "Bitte einen Namen für das Gastkonto eingeben." });
    // [llm:admin_privilege_escalation] Fix: Ensure the role name is hardcoded and not taken from user input.
    // The `ensureGuestRole` function should only be called with a trusted, predefined role name.
    if (!lib.ensureGuestRole("gast")) return e.json(400, { error: "Die Rolle \"gast\" konnte nicht eingerichtet werden. Bitte PocketBase neu starten und erneut versuchen." });
    try {
        const rec = new Record($app.findCollectionByNameOrId(lib.USERS));
        rec.set("username", username);
        rec.set("rolle", "gast");
        rec.set("familie", familyId);
        rec.set("mustChangePassword", false);
        rec.set("mitglied", "");
        rec.setPassword($security.randomString(40));
        $app.save(rec);
        return e.json(200, { success: true, id: rec.id });
    } catch (err) {
        return e.json(400, { error: "Gastkonto konnte nicht angelegt werden (Name in dieser Familie schon vergeben?)." });
    }
}, $apis.requireAuth("benutzer"));

// Link an existing profile to a family member or remove the link.
routerAdd("POST", "/api/pinn/users/link", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Profile verknüpfen." });
    const body = e.requestInfo().body;
    const mitglied = lib.cleanMemberId(body.mitglied);
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, String(body.id || "")); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!lib.canManage(e, rec)) return e.json(403, { error: "Dieses Profil gehört zu einer anderen Familie." });
    if (mitglied && rec.getString("rolle") === "gast") return e.json(400, { error: "Ein Gastkonto kann nicht mit einem Familienmitglied verknüpft werden." });
    const taken = lib.profileLinkedTo(rec.getString("familie"), mitglied, rec.id);
    if (taken) return e.json(400, { error: "Dieses Familienmitglied ist bereits mit dem Profil \"" + taken.getString("username") + "\" verknüpft." });
    rec.set("mitglied", mitglied);
    $app.save(rec);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/users/reset-password", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Passwörter zurücksetzen." });
    const body = e.requestInfo().body;
    const password = String(body.password || "");
    if (password.length < 8) return e.json(400, { error: "Das Passwort muss mindestens 8 Zeichen lang sein." });
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, String(body.id || "")); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!lib.canManage(e, rec)) return e.json(403, { error: "Dieses Profil gehört zu einer anderen Familie." });
    if (rec.getString("rolle") === "gast") return e.json(400, { error: "Gastkonten haben kein Passwort – sie werden nur über das Familien-Dashboard geöffnet." });
    rec.setPassword(password);
    rec.set("mustChangePassword", true);
    try { rec.refreshTokenKey(); } catch (err) { /* setPassword renews it anyway */ }
    $app.save(rec);
    // New password: the profile is signed out on all devices (including push)
    let sitz = null;
    try { sitz = require(`${__hooks}/pinn-sitzungen.js`); } catch (err) { sitz = null; }
    if (sitz) { try { sitz.entferneAndere(rec.id, ""); } catch (err) { /* ignore */ } }
    try { require(`${__hooks}/pinn-dashboard.js`).clearFails("login:" + rec.getString("familie") + ":" + rec.getString("username")); } catch (err) { /* ignore */ }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/users/set-role", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Rollen ändern." });
    const body = e.requestInfo().body;
    const rolle = body.rolle === "admin" ? "admin" : "mitglied";
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, String(body.id || "")); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!lib.canManage(e, rec)) return e.json(403, { error: "Dieses Profil gehört zu einer anderen Familie." });
    if (rec.getString("rolle") === "gast") return e.json(400, { error: "Die Rolle eines Gastkontos kann nicht geändert werden." });
    // Family admins must leave at least one admin; the main admin may change that
    if (!lib.isMainAdmin(e) && rolle === "mitglied" && rec.getString("rolle") === "admin" && lib.adminCount(rec.getString("familie")) <= 1) {
        return e.json(400, { error: "Es muss mindestens ein Admin in der Familie bestehen bleiben." });
    }
    rec.set("rolle", rolle);
    $app.save(rec);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// Delete a profile. Its push subscriptions are removed automatically.
routerAdd("POST", "/api/pinn/users/delete", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isAdmin(e)) return e.json(403, { error: "Nur Admins können Profile löschen." });
    const body = e.requestInfo().body;
    const id = String(body.id || "");
    if (id === e.auth.id) return e.json(400, { error: "Das eigene Profil kann nicht gelöscht werden." });
    let rec = null;
    try { rec = $app.findRecordById(lib.USERS, id); } catch (err) { return e.json(404, { error: "Profil nicht gefunden." }); }
    if (!lib.canManage(e, rec)) return e.json(403, { error: "Dieses Profil gehört zu einer anderen Familie." });
    if (!lib.isMainAdmin(e) && rec.getString("rolle") === "admin" && lib.adminCount(rec.getString("familie")) <= 1) {
        return e.json(400, { error: "Es muss mindestens ein Admin in der Familie bestehen bleiben." });
    }
    const recFamily = rec.getString("familie");
    const recMember = rec.getString("mitglied");
    $app.delete(rec);
    // The associated family member disappears with the profile
    if (recFamily && recMember) lib.removeFamilyMember(recFamily, recMember);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Manage families (main admin only)
// ---------------------------------------------------------------------------------------------

routerAdd("GET", "/api/pinn/familien", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien verwalten." });
    e.response.header().set("Cache-Control", "no-store");
    // Catch up on the set-up if necessary and take over existing profiles/data without a family
    const problem = lib.ensureReady();
    if (!problem) {
        lib.migrateOrphans();
        lib.syncAllFamilyMembers();
    }
    const result = lib.allFamilies().map(f => {
        let profiles = [];
        try {
            profiles = $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: f.id }).map(r => ({
                id: r.id,
                username: r.getString("username"),
                rolle: r.getString("rolle"),
                mustChangePassword: r.getBool("mustChangePassword"),
                systemrechte: r.getString("rolle") === "admin" && r.getBool("systemrechte"),
            })).sort((a, b) => a.username.localeCompare(b.username));
        } catch (err) { profiles = []; }
        let apple = false;
        try { apple = require(`${__hooks}/pinn-apple.js`).hasCredentials(f.id); } catch (err) { apple = false; }
        let google = false;
        try { google = require(`${__hooks}/pinn-google.js`).hasCredentials(f.id); } catch (err) { google = false; }
        let wohnform = "familie";
        try { wohnform = require(`${__hooks}/pinn-pushtext.js`).wohnformOf(f.id); } catch (err) { wohnform = "familie"; }
        return { id: f.id, name: f.getString("name"), apple: apple, google: google, wohnform: wohnform, profiles: profiles };
    });
    return e.json(200, { familien: result, warnung: problem });
}, $apis.requireAuth("benutzer"));

// New family including the first family admin: {name, adminName, adminPassword, wohnform}
// wohnform: 'familie' (default) or 'wg' - is afterwards in the family data (field "wohnform")
// and can later be changed under Settings → Family members → Living arrangement.
routerAdd("POST", "/api/pinn/familien/create", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien anlegen." });
    const body = e.requestInfo().body;
    const name = lib.cleanFamilyName(body.name);
    const adminName = lib.cleanUsername(body.adminName);
    const adminPassword = String(body.adminPassword || "");
    // [llm:admin_privilege_escalation] Fix: Sanitize 'wohnform' to only allow predefined values.
    // This prevents injection or unexpected values if 'wohnform' is used in a sensitive context.
    const wohnform = (body.wohnform === "wg" || body.wohnform === "familie") ? body.wohnform : "familie";
    if (!name) return e.json(400, { error: "Bitte einen Familiennamen eingeben." });
    if (lib.findFamily(name)) return e.json(400, { error: "Eine Familie mit diesem Namen gibt es schon." });
    if (!adminName) return e.json(400, { error: "Bitte einen Namen für den Familien-Admin eingeben." });
    if (adminPassword.length < 8) return e.json(400, { error: "Das Start-Passwort muss mindestens 8 Zeichen lang sein." });
    const problem = lib.ensureReady();
    if (problem) return e.json(400, { error: problem });
    let familyId = "";
    let step = "";
    const adminMember = "m" + Date.now();
    try {
        $app.runInTransaction((tx) => {
            step = "Familie speichern";
            const fam = new Record(tx.findCollectionByNameOrId(lib.FAMILIEN));
            fam.set("name", name);
            tx.save(fam);
            familyId = fam.id;
            step = "Familiendaten anlegen";
            const fd = new Record(tx.findCollectionByNameOrId("familien_daten"));
            fd.set("familie", fam.id);
            // No example members: the family starts with only its admin as a member
            const startData = {
                members: [{ id: adminMember, name: adminName, role: "", color: lib.MEMBER_COLORS[0], displayMode: "name" }],
                lastName: lib.lastNameFromFamily(name),
            };
            if (wohnform === "wg") startData.wohnform = "wg";
            fd.set("data", startData);
            tx.save(fd);
            step = "Familien-Admin anlegen";
            const u = new Record(tx.findCollectionByNameOrId(lib.USERS));
            u.set("username", adminName);
            u.set("rolle", "admin");
            u.set("familie", fam.id);
            u.set("mustChangePassword", true);
            u.set("mitglied", adminMember);
            u.setPassword(adminPassword);
            tx.save(u);
        });
    } catch (err) {
        console.log("[Familien] Anlegen fehlgeschlagen bei \"" + step + "\": " + err.message);
        return e.json(400, { error: "Familie konnte nicht angelegt werden (" + step + "): " + err.message });
    }
    return e.json(200, { success: true, id: familyId, wohnform: wohnform });
}, $apis.requireAuth("benutzer"));

routerAdd("POST", "/api/pinn/familien/rename", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien umbenennen." });
    const body = e.requestInfo().body;
    const name = lib.cleanFamilyName(body.name);
    if (!name) return e.json(400, { error: "Bitte einen Familiennamen eingeben." });
    let fam = null;
    try { fam = $app.findRecordById(lib.FAMILIEN, String(body.id || "")); } catch (err) { return e.json(404, { error: "Familie nicht gefunden." }); }
    const other = lib.findFamily(name);
    if (other && other.id !== fam.id) return e.json(400, { error: "Eine Familie mit diesem Namen gibt es schon." });
    fam.set("name", name);
    $app.save(fam);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// Delete a family: profiles, family data, recipe images and tasks are deleted with it.
routerAdd("POST", "/api/pinn/familien/delete", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien löschen." });
    const body = e.requestInfo().body;
    let fam = null;
    try { fam = $app.findRecordById(lib.FAMILIEN, String(body.id || "")); } catch (err) { return e.json(404, { error: "Familie nicht gefunden." }); }
    const famId = fam.id;
    try {
        $app.delete(fam); // The family's Apple credentials are deleted automatically
    } catch (err) {
        return e.json(400, { error: "Familie konnte nicht gelöscht werden: " + err.message });
    }
    // Remove the calendar file of the deleted family
    try { require(`${__hooks}/calendar-sync.js`).removeCalendarFile(famId); } catch (err) { /* ignore */ }
    try { $app.store().remove("pinnAppleSync:" + famId); } catch (err) { /* ignore */ }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Calendar file of the OWN family, only for signed-in users. It lives in pb_data instead of the
// public pb_public. Each family gets only its own file.
// In addition come the own calendars (pinn-kalender.js) that the signed-in profile may see:
// shared ones of the family and the own private ones - including the calendar list (X-PINN-KALENDER).
// ---------------------------------------------------------------------------------------------
routerAdd("GET", "/api/pinn/kalender", (e) => {
    let text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
    try {
        const familyId = require(`${__hooks}/pinn-benutzer.js`).familyOf(e);
        if (familyId) {
            const own = require(`${__hooks}/calendar-sync.js`).readCalendarText(familyId);
            if (own) text = own;
        }
    } catch (err) { /* not generated yet */ }
    try {
        text = require(`${__hooks}/pinn-kalender.js`).mergeInto(text, e);
    } catch (err) { /* pinn-kalender.js not available (yet) */ }
    e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
    e.response.header().set("Cache-Control", "no-store");
    return e.string(200, text);
}, $apis.requireAuth("benutzer"));