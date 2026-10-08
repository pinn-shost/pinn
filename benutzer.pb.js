// pb_hooks/benutzer.pb.js
// Anmeldung, Familien, Profile und Verknüpfung Profil <-> Familienmitglied für pinn.
//
// Beim Start (siehe pinn-benutzer.js):
// - legt die Sammlungen "benutzer" und "familien" an bzw. ergänzt sie
// - macht das Profil "Admin" zum Hauptadmin (ohne Familie) bzw. legt es an ("Admin"/"Admin")
// - übernimmt bei einer bestehenden Installation alle Daten in die Familie "Familie"
// - trennt familien_daten und rezept_bilder je Familie
// - legt die Push-Sammlungen "push_abos" und "push_nachrichten" an
// Die Apple-Kalender-Zugangsdaten je Familie verwaltet apple_credentials.pb.js (pinn-apple.js),
// das Google-Konto (Android-Kalender) je Familie google_credentials.pb.js (pinn-google.js).
// Familien-Dashboard (Profilauswahl, PIN): dashboard.pb.js / pinn-dashboard.js.
//
// Familienmitglieder: Jedes Profil (außer Gast/Hauptadmin) ist genau ein Familienmitglied. Legt der
// Hauptadmin eine Familie oder Profile an, entstehen die Mitglieder mit den Profilnamen sofort mit
// (syncFamilyMembers in pinn-benutzer.js) - es gibt keine Beispiel-Mitglieder mehr. Wird ein Profil
// gelöscht, verschwindet auch sein Mitglied.
//
// Gastkonten (Rolle "gast"): legt ein Admin an (/api/pinn/users/create-gast). Sie haben ein
// zufälliges, niemandem bekanntes Passwort, erscheinen nicht in der Anmeldemaske und kommen nur
// über das Familien-Dashboard in die App - ohne Zugriff auf die Finanzen.
//
// Geräteverwaltung (sitzungen.pb.js / pinn-sitzungen.js): Jede Anmeldung bekommt eine Sitzung je
// Gerät. Fehlversuche zählen zusätzlich je Netzwerk-Adresse (auch unbekannte Familien und Profile);
// wird ein Profil gesperrt, bekommen die Admins eine Push-Nachricht und es steht im Fehlerprotokoll.
// Passwort ändern bzw. zurücksetzen meldet alle anderen Geräte des Profils ab.
//
// Alles ist defensiv gebaut: Ein Fehler hier wird nur geloggt und verhindert nie den Serverstart.

onBootstrap((e) => {
    e.next();
    try {
        require(`${__hooks}/pinn-benutzer.js`).ensureSchema();
    } catch (err) {
        console.log("[Anmeldung] Einrichtung fehlgeschlagen: " + err.message);
    }
    // Jedes Profil ist ein Familienmitglied: fehlende Mitglieder anlegen, Beispiel-Mitglieder entfernen
    try {
        require(`${__hooks}/pinn-benutzer.js`).syncAllFamilyMembers();
    } catch (err) {
        console.log("[Familien] Abgleich der Familienmitglieder fehlgeschlagen: " + err.message);
    }
});

// ---------------------------------------------------------------------------------------------
// Anmeldemaske (ohne Anmeldung)
// ---------------------------------------------------------------------------------------------

// Familie prüfen und ihre Profilnamen liefern. Gibt NUR den Familiennamen, die Profilnamen und die
// Wohnform ('familie' oder 'wg') heraus - die Anmeldemaske zeigt damit „Familie“ bzw. „WG“.
routerAdd("GET", "/api/pinn/familie", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const sitz = sitzungenLib();
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
        if (sitz) sitz.ipFehlversuch(e); // Durchprobieren von Familiennamen bremsen
        return e.json(404, { error: "Diese Familie gibt es nicht. Bitte den Namen prüfen." });
    }
    let names = [];
    try {
        names = $app.findRecordsByFilter(lib.USERS, "familie = {:f}", "", 0, 0, { f: fam.id })
            .filter(r => r.getString("rolle") !== "gast") // Gäste nur über das Dashboard
            .map(r => r.getString("username"))
            .sort((a, b) => a.localeCompare(b));
    } catch (err) { names = []; }
    let wohnform = "familie";
    try { wohnform = require(`${__hooks}/pinn-pushtext.js`).wohnformOf(fam.id); } catch (err) { wohnform = "familie"; }
    return e.json(200, { name: fam.getString("name"), profiles: names, wohnform: wohnform });
});

// Geräteverwaltung (pinn-sitzungen.js) – fehlt die Datei, läuft die Anmeldung wie bisher
function sitzungenLib() {
    try { return require(`${__hooks}/pinn-sitzungen.js`); } catch (err) { return null; }
}

// Anmelden: {familie, username, password} oder {hauptadmin: true, password}
// Schutz gegen Durchprobieren: nach 5 Fehlversuchen für dasselbe Profil wird es gesperrt
// (30 s, danach jeweils doppelt so lang, höchstens 15 Minuten) – gleiche Regel wie bei der
// Dashboard-PIN. Die Sperre liegt nur im Arbeitsspeicher und gilt nur für existierende Profile.
// Zusätzlich zählen alle Fehlversuche (auch für unbekannte Profile) je Netzwerk-Adresse – ab 20
// innerhalb von 30 Minuten ist die Adresse gesperrt (1 Minute, dann länger, höchstens 30 Minuten).
routerAdd("POST", "/api/pinn/login", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const dash = require(`${__hooks}/pinn-dashboard.js`);
    const sitz = sitzungenLib();
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
        sleep(700); // bremst Durchprobieren von Passwörtern
        const ipLock = sitz ? sitz.ipFehlversuch(e) : 0;
        if (known) {
            const lock = dash.registerFail(lockId);
            if (lock) {
                console.log("[Anmeldung] Zu viele Fehlversuche – Profil für " + dash.waitText(lock) + " gesperrt.");
                if (sitz) {
                    try { sitz.meldeSperre(lockFamily, candidates[0].getString("username"), lock); } catch (err) { /* egal */ }
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
    // Mitglieder der Familie mit ihren Profilen abgleichen (legt z. B. das eigene Mitglied an)
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
// Eigenes Konto
// ---------------------------------------------------------------------------------------------

// Eigenes Passwort ändern. Gibt eine neue Anmeldung zurück, weil PocketBase alte Anmeldungen
// beim Passwortwechsel ungültig macht. Alle anderen Geräte des Profils sind danach abgemeldet
// (auch ihre Push-Benachrichtigungen) – dieses Gerät bleibt angemeldet.
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
    try { rec.refreshTokenKey(); } catch (err) { /* setPassword erneuert ihn ohnehin */ }
    $app.save(rec);
    const sitz = sitzungenLib();
    if (sitz) { try { sitz.entferneAndere(rec.id, sitz.sidOf(e)); } catch (err) { /* egal */ } }
    return $apis.recordAuthResponse(e, rec);
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Profile verwalten (Familien-Admins für ihre Familie, Hauptadmin für alle Familien)
// ---------------------------------------------------------------------------------------------

// Profil anlegen. Familien-Admins legen immer in ihrer eigenen Familie an, der Hauptadmin gibt
// die Familie mit ("familie"). Optional direkt mit einem Familienmitglied verknüpft ("mitglied").
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
        $app.save(rec);
        // Ohne mitgeschicktes Mitglied (z. B. vom Hauptadmin angelegt): Mitglied mit dem Profilnamen
        // sofort anlegen und verknüpfen. Mit Mitglied legt es die App selbst an.
        if (!mitglied) lib.syncFamilyMembers(familyId);
        return e.json(200, { success: true, id: rec.id });
    } catch (err) {
        return e.json(400, { error: "Profil konnte nicht angelegt werden (Name in dieser Familie schon vergeben?)." });
    }
}, $apis.requireAuth("benutzer"));

// Gastkonto anlegen: {username} (Hauptadmin zusätzlich {familie}). Kein Familienmitglied, kein
// bekanntes Passwort - geöffnet wird es nur über das Familien-Dashboard.
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
    if (!lib.ensureGuestRole()) return e.json(400, { error: "Die Rolle \"gast\" konnte nicht eingerichtet werden. Bitte PocketBase neu starten und erneut versuchen." });
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

// Bestehendes Profil mit einem Familienmitglied verknüpfen bzw. die Verknüpfung lösen.
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
    try { rec.refreshTokenKey(); } catch (err) { /* setPassword erneuert ihn ohnehin */ }
    $app.save(rec);
    // Neues Passwort: das Profil ist auf allen Geräten abgemeldet (samt Push)
    const sitz = sitzungenLib();
    if (sitz) { try { sitz.entferneAndere(rec.id, ""); } catch (err) { /* egal */ } }
    try { require(`${__hooks}/pinn-dashboard.js`).clearFails("login:" + rec.getString("familie") + ":" + rec.getString("username")); } catch (err) { /* egal */ }
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
    // Familien-Admins müssen mindestens einen Admin übrig lassen; der Hauptadmin darf das ändern
    if (!lib.isMainAdmin(e) && rolle === "mitglied" && rec.getString("rolle") === "admin" && lib.adminCount(rec.getString("familie")) <= 1) {
        return e.json(400, { error: "Es muss mindestens ein Admin in der Familie bestehen bleiben." });
    }
    rec.set("rolle", rolle);
    $app.save(rec);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// Profil löschen. Seine Push-Abos werden automatisch mit entfernt.
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
    // Das zugehörige Familienmitglied verschwindet mit dem Profil
    if (recFamily && recMember) lib.removeFamilyMember(recFamily, recMember);
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Familien verwalten (nur Hauptadmin)
// ---------------------------------------------------------------------------------------------

routerAdd("GET", "/api/pinn/familien", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien verwalten." });
    e.response.header().set("Cache-Control", "no-store");
    // Einrichtung ggf. nachholen und bestehende Profile/Daten ohne Familie übernehmen
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

// Neue Familie samt erstem Familien-Admin: {name, adminName, adminPassword, wohnform}
// wohnform: 'familie' (Standard) oder 'wg' - steht danach in den Familiendaten (Feld „wohnform“)
// und lässt sich später unter Einstellungen → Familienmitglieder → Wohnform ändern.
routerAdd("POST", "/api/pinn/familien/create", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien anlegen." });
    const body = e.requestInfo().body;
    const name = lib.cleanFamilyName(body.name);
    const adminName = lib.cleanUsername(body.adminName);
    const adminPassword = String(body.adminPassword || "");
    const wohnform = body.wohnform === "wg" ? "wg" : "familie";
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
            // Keine Beispiel-Mitglieder: Die Familie startet nur mit ihrem Admin als Mitglied
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

// Familie löschen: Profile, Familiendaten, Rezeptbilder und Aufgaben werden mit gelöscht.
routerAdd("POST", "/api/pinn/familien/delete", (e) => {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!lib.isMainAdmin(e)) return e.json(403, { error: "Nur der Hauptadmin kann Familien löschen." });
    const body = e.requestInfo().body;
    let fam = null;
    try { fam = $app.findRecordById(lib.FAMILIEN, String(body.id || "")); } catch (err) { return e.json(404, { error: "Familie nicht gefunden." }); }
    const famId = fam.id;
    try {
        $app.delete(fam); // Apple-Zugangsdaten der Familie werden automatisch mit gelöscht
    } catch (err) {
        return e.json(400, { error: "Familie konnte nicht gelöscht werden: " + err.message });
    }
    // Kalenderdatei der gelöschten Familie entfernen
    try { require(`${__hooks}/calendar-sync.js`).removeCalendarFile(famId); } catch (err) { /* egal */ }
    try { $app.store().remove("pinnAppleSync:" + famId); } catch (err) { /* egal */ }
    return e.json(200, { success: true });
}, $apis.requireAuth("benutzer"));

// ---------------------------------------------------------------------------------------------
// Kalenderdatei der EIGENEN Familie, nur für Angemeldete. Sie liegt in pb_data statt im
// öffentlichen pb_public. Jede Familie bekommt ausschließlich ihre eigene Datei.
// Dazu kommen die eigenen Kalender (pinn-kalender.js), die das angemeldete Profil sehen darf:
// geteilte der Familie und die eigenen privaten - samt Kalenderliste (X-PINN-KALENDER).
// ---------------------------------------------------------------------------------------------
routerAdd("GET", "/api/pinn/kalender", (e) => {
    let text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
    try {
        const familyId = require(`${__hooks}/pinn-benutzer.js`).familyOf(e);
        if (familyId) {
            const own = require(`${__hooks}/calendar-sync.js`).readCalendarText(familyId);
            if (own) text = own;
        }
    } catch (err) { /* noch nicht erzeugt */ }
    try {
        text = require(`${__hooks}/pinn-kalender.js`).mergeInto(text, e);
    } catch (err) { /* pinn-kalender.js (noch) nicht vorhanden */ }
    e.response.header().set("Content-Type", "text/calendar; charset=utf-8");
    e.response.header().set("Cache-Control", "no-store");
    return e.string(200, text);
}, $apis.requireAuth("benutzer"));
