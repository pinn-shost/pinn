// pb_hooks/pinn-benutzer.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
// Gemeinsame Funktionen für Anmeldung, Familien, Profile und die Verknüpfung Profil <-> Familienmitglied.
// (PocketBase führt jeden Hook-Handler isoliert aus - Hilfsfunktionen auf Dateiebene einer
// *.pb.js wären dort nicht sichtbar. Deshalb liegen sie hier und werden per require() geholt.)
//
// Familien:
//  - Sammlung "familien" (name, kalender). Jede Familie hat ihre eigenen Profile, Familiendaten,
//    Rezeptbilder und Aufgaben (Feld "familie" in benutzer / familien_daten / rezept_bilder / aufgaben).
//    Öffentlich geteilte Rezepte (und ihre Bilder) bleiben beim Löschen einer Familie erhalten und
//    landen in der "Rezepte Familie" (siehe pinn-rezepte.js).
//  - Der Hauptadmin (Rolle "hauptadmin", Profil "Admin" vom Anfang) gehört zu keiner Familie. Er legt
//    Familien an, benennt sie um, löscht sie und vergibt den ersten Familien-Admin.
//  - Familien-Admins (Rolle "admin" mit Familie) verwalten nur ihre eigene Familie. Es kann
//    mehrere Admins je Familie geben.
//  - Jede Familie kann ihren eigenen Apple-Kalender anbinden: Die Familien-Admins hinterlegen
//    Apple-ID und App-spezifisches Passwort in den Einstellungen; gespeichert wird verschlüsselt in
//    der gesperrten Sammlung "apple_zugaenge" (pinn-apple.js). Das Feld "kalender" in "familien"
//    wird nur noch für den einmaligen Umzug der alten .env-Zugangsdaten gebraucht.
//  - Benutzernamen sind nur innerhalb einer Familie eindeutig. Angemeldet wird über die eigene
//    Route /api/pinn/login (Familie + Profil + Passwort).
//  - Gäste (Rolle "gast") gehören zu einer Familie, haben aber kein bekanntes Passwort und kein
//    Familienmitglied. Sie kommen nur über das Familien-Dashboard in die App (pinn-dashboard.js)
//    und haben keinen Zugriff auf die Finanzen.
//  - Optionale Dashboard-PIN je Profil im versteckten Feld "dashboard_pin" (pinn-dashboard.js).

const USERS = "benutzer";
const FAMILIEN = "familien";
const AUTH_RULE = "@request.auth.id != ''";
const FAM_READ_RULE = "@request.auth.id != '' && @request.auth.familie != '' && familie = @request.auth.familie";
const FAM_CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.body.familie = @request.auth.familie";
const FAM_UPDATE_RULE = FAM_READ_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie)";
const FAMILIEN_READ_RULE = "@request.auth.id != '' && id = @request.auth.familie";
const CALENDAR_OTHER_FAMILY = "Der Apple-Kalender ist nur für Profile einer Familie verfügbar (der Hauptadmin gehört zu keiner Familie).";

// ---------------------------------------------------------------------------------------------
// Rollen und Rechte
// ---------------------------------------------------------------------------------------------
function isUsersAuth(e) {
    try { return !!(e.auth && e.auth.collection().name === USERS); } catch (err) { return false; }
}
function isMainAdmin(e) {
    return isUsersAuth(e) && e.auth.getString("rolle") === "hauptadmin";
}
// Familien-Admin (eigene Familie) oder Hauptadmin
function isAdmin(e) {
    if (!isUsersAuth(e)) return false;
    const r = e.auth.getString("rolle");
    return r === "hauptadmin" || (r === "admin" && !!e.auth.getString("familie"));
}
function familyOf(e) {
    return isUsersAuth(e) ? e.auth.getString("familie") : "";
}
// Gastkonto (nur über das Dashboard, ohne Finanzen)
function isGuest(e) {
    return isUsersAuth(e) && e.auth.getString("rolle") === "gast";
}
// Dasselbe für einen beliebigen Profil-Datensatz (z. B. requestInfo.auth in onRecordEnrich)
function isGuestRecord(rec) {
    try { return !!(rec && rec.collection().name === USERS && rec.getString("rolle") === "gast"); } catch (e) { return false; }
}
// Darf der Angemeldete dieses Profil verwalten? (Hauptadmin-Profile nie über diese Routen)
function canManage(e, rec) {
    if (!rec || rec.getString("rolle") === "hauptadmin") return false;
    if (isMainAdmin(e)) return true;
    const fam = familyOf(e);
    return isAdmin(e) && !!fam && rec.getString("familie") === fam;
}
function adminCount(familyId) {
    return $app.countRecords(USERS, $dbx.hashExp({ rolle: "admin", familie: String(familyId || "") }));
}
function cleanUsername(v) {
    return String(v || "").trim().slice(0, 60);
}
function cleanMemberId(v) {
    return String(v || "").trim().slice(0, 100);
}
function cleanFamilyName(v) {
    return String(v || "").replace(/\s+/g, " ").trim().slice(0, 60);
}
// Profil derselben Familie, das bereits mit diesem Familienmitglied verknüpft ist (außer exceptId), sonst null.
function profileLinkedTo(familyId, memberId, exceptId) {
    if (!memberId) return null;
    try {
        const recs = $app.findRecordsByFilter(USERS, "familie = {:f} && mitglied = {:m}", "", 0, 0, { f: String(familyId || ""), m: memberId });
        return recs.find(r => r.id !== exceptId) || null;
    } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Familien
// ---------------------------------------------------------------------------------------------
function allFamilies() {
    try { return $app.findRecordsByFilter(FAMILIEN, "", "created", 0, 0); } catch (e) { return []; }
}
// Familie per Name (Groß-/Kleinschreibung egal) oder per ID
function findFamily(nameOrId) {
    const v = cleanFamilyName(nameOrId);
    if (!v) return null;
    const lower = v.toLowerCase();
    const list = allFamilies();
    return list.find(f => f.id === v) || list.find(f => f.getString("name").toLowerCase() === lower) || null;
}
// Nur noch für den Umzug der alten .env-Zugangsdaten: Familie, der der Apple-Kalender früher gehörte.
function calendarFamilyId() {
    try { return $app.findFirstRecordByFilter(FAMILIEN, "kalender = true").id; } catch (e) { return ""; }
}
// Jedes Profil einer Familie darf den Apple-Kalender seiner eigenen Familie nutzen.
function isCalendarUser(e) {
    return !!familyOf(e);
}
// Leerer Text = erlaubt, sonst Fehlermeldung
function calendarDenied(e) {
    return isCalendarUser(e) ? "" : CALENDAR_OTHER_FAMILY;
}
function familyDataRecord(familyId) {
    if (!familyId) return null;
    try { return $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
function loadFamilyDataFor(familyId) {
    const rec = familyDataRecord(familyId);
    if (!rec) return {};
    try {
        return require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {};
    } catch (e) { return {}; }
}
// Änderungszeitpunkt der Familiendaten, ohne die (großen) Daten selbst zu laden
function familyDataStamp(familyId) {
    if (!familyId) return "";
    try {
        const m = new DynamicModel({ updated: "" });
        $app.db().newQuery("SELECT updated FROM familien_daten WHERE familie = {:f} LIMIT 1").bind({ f: String(familyId) }).one(m);
        return String(m.updated || "");
    } catch (e) { return ""; }
}

// ---------------------------------------------------------------------------------------------
// Einrichtung
// ---------------------------------------------------------------------------------------------
function hasField(collection, name) {
    try { return !!collection.fields.getByName(name); } catch (e) { return false; }
}
function hasIndex(collection, name) {
    try {
        const list = collection.indexes || [];
        for (let i = 0; i < list.length; i++) { if (String(list[i]).indexOf(name) !== -1) return true; }
    } catch (e) { /* egal */ }
    return false;
}
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function setRules(col, rules) {
    let changed = false;
    Object.keys(rules).forEach(k => {
        if (col[k] !== rules[k]) { col[k] = rules[k]; changed = true; }
    });
    return changed;
}

// Fehler der Einrichtung merken (für die Anzeige beim Hauptadmin) und loggen
const SETUP_ERRORS_KEY = "pinnSetupErrors";
function setupError(msg) {
    console.log("[Familien] " + msg);
    try {
        const list = $app.store().get(SETUP_ERRORS_KEY) || [];
        const arr = [];
        for (let i = 0; i < list.length; i++) arr.push(String(list[i]));
        if (arr.indexOf(msg) === -1) arr.push(msg);
        $app.store().set(SETUP_ERRORS_KEY, arr.slice(-10));
    } catch (e) { /* egal */ }
}
function setupErrors() {
    try {
        const list = $app.store().get(SETUP_ERRORS_KEY) || [];
        const arr = [];
        for (let i = 0; i < list.length; i++) arr.push(String(list[i]));
        return arr;
    } catch (e) { return []; }
}
function clearSetupErrors() {
    try { $app.store().remove(SETUP_ERRORS_KEY); } catch (e) { /* egal */ }
}

// Neue Sammlung im Format der PocketBase-JavaScript-Umgebung: new Collection({type, name, fields, ...}).
// (So legt auch pinn-push.js seine Sammlungen an - das funktioniert in dieser Installation.)
function createCollection(def) {
    $app.save(new Collection(def));
    const c = findCol(def.name);
    if (!c) throw new Error("Sammlung \"" + def.name + "\" wurde nicht gespeichert.");
    return c;
}
// Einzelnes Feld aus einer Definition erzeugen (über eine nie gespeicherte Hilfs-Sammlung)
function makeField(def) {
    const tmp = new Collection({ type: "base", name: "pinn_tmp_" + def.name, fields: [def] });
    return tmp.fields.getByName(def.name);
}
function addField(colName, def) {
    const col = findCol(colName);
    if (!col) return false;
    if (hasField(col, def.name)) return true;
    try {
        col.fields.add(makeField(def));
        $app.save(col);
        console.log("[Familien] Feld \"" + def.name + "\" in \"" + colName + "\" ergänzt.");
        return true;
    } catch (err) {
        setupError("Feld \"" + def.name + "\" in \"" + colName + "\" nicht anlegbar: " + err.message);
        return false;
    }
}
function familyRelationDef(famCol) {
    return { name: "familie", type: "relation", collectionId: famCol.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false };
}
const CLOSED = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
const ROLES = ["hauptadmin", "admin", "mitglied", "gast"];

// Fehlende Rollen ("hauptadmin", "gast") im Auswahlfeld "rolle" ergänzen. true = alle vorhanden.
function ensureRoles() {
    const users = findCol(USERS);
    if (!users) return false;
    try {
        const roleField = users.fields.getByName("rolle");
        if (!roleField) return false;
        const have = [];
        for (let i = 0; i < roleField.values.length; i++) have.push(String(roleField.values[i]));
        const missing = ROLES.filter(r => have.indexOf(r) === -1);
        if (!missing.length) return true;
        roleField.values = have.concat(missing);
        $app.save(users);
        console.log("[Anmeldung] Rolle(n) " + missing.map(r => "\"" + r + "\"").join(", ") + " ergänzt.");
        return true;
    } catch (err) {
        setupError("Rollen nicht ergänzbar: " + err.message);
        return false;
    }
}
// Vor dem Anlegen eines Gastkontos: gibt es die Rolle "gast" schon?
function ensureGuestRole() {
    return ensureRoles();
}

// Legt Sammlungen/Felder an bzw. ergänzt sie. Läuft beim Start (und bei Bedarf aus den Routen);
// ein Fehler wird nur geloggt bzw. für den Hauptadmin gemerkt.
function ensureSchema() {
    clearSetupErrors();

    // 1) Profil-Sammlung (nur bei Neuinstallation)
    let users = findCol(USERS);
    if (!users) {
        try {
            users = createCollection(Object.assign({
                type: "auth",
                name: USERS,
                fields: [
                    { name: "username", type: "text", required: true, min: 1, max: 60, presentable: true },
                    { name: "rolle", type: "select", values: ROLES, maxSelect: 1 },
                    { name: "mustChangePassword", type: "bool" },
                ],
                passwordAuth: { enabled: true, identityFields: ["email"] },
            }, CLOSED, { listRule: AUTH_RULE, viewRule: AUTH_RULE }));
            try { users.fields.getByName("email").required = false; users.fields.getByName("password").min = 5; $app.save(users); } catch (e2) { /* je nach Version */ }
            users = findCol(USERS);
            console.log("[Anmeldung] Profil-Sammlung \"" + USERS + "\" angelegt.");
        } catch (err) {
            setupError("Profil-Sammlung nicht anlegbar: " + err.message);
        }
    }

    // 2) Familien-Sammlung. Regeln erst in Schritt 9 - "@request.auth.familie" gibt es erst, wenn
    //    das Feld "familie" im Profil existiert.
    let famCol = findCol(FAMILIEN);
    if (!famCol) {
        const build = (withIndex) => Object.assign({
            type: "base",
            name: FAMILIEN,
            fields: [
                { name: "name", type: "text", required: true, min: 1, max: 60, presentable: true },
                { name: "kalender", type: "bool" },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: withIndex ? ["CREATE UNIQUE INDEX `idx_pinn_familien_name` ON `" + FAMILIEN + "` (`name`)"] : [],
        }, CLOSED);
        try {
            famCol = createCollection(build(true));
            console.log("[Familien] Sammlung \"" + FAMILIEN + "\" angelegt.");
        } catch (e1) {
            try {
                famCol = createCollection(build(false));
                console.log("[Familien] Sammlung \"" + FAMILIEN + "\" ohne Index angelegt (" + e1.message + ").");
            } catch (e2) {
                setupError("Sammlung \"" + FAMILIEN + "\" nicht anlegbar: " + e2.message);
            }
        }
    }

    // 3) Familiendaten + Rezeptbilder (nur bei Neuinstallation)
    if (!findCol("familien_daten")) {
        try {
            createCollection(Object.assign({
                type: "base",
                name: "familien_daten",
                fields: [
                    { name: "data", type: "json", maxSize: 50 * 1024 * 1024 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
            }, CLOSED));
            console.log("[Familien] Sammlung \"familien_daten\" angelegt.");
        } catch (err) {
            setupError("Sammlung \"familien_daten\" nicht anlegbar: " + err.message);
        }
    }
    if (!findCol("rezept_bilder")) {
        try {
            createCollection(Object.assign({
                type: "base",
                name: "rezept_bilder",
                fields: [
                    { name: "bild", type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], thumbs: ["400x400"] },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
            }, CLOSED));
            console.log("[Familien] Sammlung \"rezept_bilder\" angelegt.");
        } catch (err) {
            setupError("Sammlung \"rezept_bilder\" nicht anlegbar: " + err.message);
        }
    }

    // 4) Feld "familie" überall ergänzen (Löschen einer Familie löscht die Datensätze mit)
    if (famCol) {
        [USERS, "familien_daten", "rezept_bilder", "aufgaben"].forEach(n => addField(n, familyRelationDef(famCol)));
    }

    // 5) Profil-Sammlung: Felder, Rolle "hauptadmin", Anmeldung je Familie
    users = findCol(USERS);
    if (users) {
        addField(USERS, { name: "mitglied", type: "text", max: 100 });
        addField(USERS, { name: "push_einstellungen", type: "json", maxSize: 20000, hidden: true });
        addField(USERS, { name: "dashboard_pin", type: "text", max: 300, hidden: true });
        ensureRoles();
        users = findCol(USERS);

        // Benutzernamen nur noch je Familie eindeutig; Anmeldung läuft über /api/pinn/login
        users = findCol(USERS);
        if (users && hasField(users, "familie") && !hasIndex(users, "idx_benutzer_familie_username")) {
            try {
                users.passwordAuth = { enabled: true, identityFields: ["email"] };
                try { users.removeIndex("idx_benutzer_username"); } catch (err2) { /* nicht vorhanden */ }
                users.addIndex("idx_benutzer_familie_username", true, "`familie`, `username`", "");
                $app.save(users);
                console.log("[Anmeldung] Benutzernamen sind jetzt je Familie eindeutig.");
            } catch (err) {
                setupError("Anmeldung je Familie nicht einrichtbar: " + err.message);
            }
        }
    }

    // 6) Hauptadmin sicherstellen: bisheriges Profil "Admin" wird zum Hauptadmin (ohne Familie),
    //    fehlt es, wird "Admin"/"Admin" angelegt (Passwort muss beim ersten Anmelden geändert werden).
    users = findCol(USERS);
    if (users) {
        try {
            let main = null;
            try { main = $app.findFirstRecordByFilter(USERS, "rolle = 'hauptadmin'"); } catch (err) { main = null; }
            if (!main) {
                let adm = null;
                try { adm = $app.findFirstRecordByFilter(USERS, "username = 'Admin'"); } catch (err) { adm = null; }
                if (adm) {
                    adm.set("rolle", "hauptadmin");
                    adm.set("familie", "");
                    adm.set("mitglied", "");
                    $app.save(adm);
                    console.log("[Familien] Profil \"Admin\" ist jetzt der Hauptadmin (ohne Familie).");
                } else {
                    const rec = new Record(users);
                    rec.set("username", "Admin");
                    rec.set("rolle", "hauptadmin");
                    rec.set("mustChangePassword", true);
                    rec.setPassword("Admin");
                    $app.save(rec);
                    console.log("[Familien] Hauptadmin \"Admin\" angelegt (Passwort muss beim ersten Anmelden geändert werden).");
                }
            } else if (main.getString("familie")) {
                main.set("familie", "");
                $app.save(main);
            }
        } catch (err) {
            setupError("Hauptadmin nicht einrichtbar: " + err.message);
        }
    }

    // 7) Umzug einer bestehenden Installation: alle Profile (außer dem Hauptadmin), Familiendaten,
    //    Rezeptbilder und Aufgaben ohne Familie kommen in die Familie "Familie". Läuft bei jedem Start,
    //    solange es noch Datensätze ohne Familie gibt - auch wenn schon andere Familien existieren.
    migrateOrphans();

    // 8) Apple-Kalender: jede Familie hinterlegt ihre eigenen Zugangsdaten (pinn-apple.js) - hier
    //    ist keine Zuordnung mehr nötig.

    // 9) Zugriffsregeln: jede Familie sieht nur ihre eigenen Daten
    try {
        const u = findCol(USERS);
        if (u && hasField(u, "familie") && setRules(u, {
            listRule: "@request.auth.id != '' && familie = @request.auth.familie",
            viewRule: "@request.auth.id != '' && familie = @request.auth.familie",
            createRule: null, updateRule: null, deleteRule: null,
        })) { $app.save(u); console.log("[Familien] Regeln für \"" + USERS + "\" gesetzt."); }
    } catch (err) { setupError("Regeln für \"" + USERS + "\" nicht setzbar: " + err.message); }
    try {
        const f = findCol(FAMILIEN);
        const u = findCol(USERS);
        if (f && u && hasField(u, "familie") && setRules(f, { listRule: FAMILIEN_READ_RULE, viewRule: FAMILIEN_READ_RULE, createRule: null, updateRule: null, deleteRule: null })) {
            $app.save(f);
        }
    } catch (err) { setupError("Regeln für \"" + FAMILIEN + "\" nicht setzbar: " + err.message); }
    ["familien_daten", "rezept_bilder"].forEach(name => {
        try {
            const c = findCol(name);
            const u = findCol(USERS);
            if (!c || !hasField(c, "familie") || !u || !hasField(u, "familie")) return;
            if (setRules(c, { listRule: FAM_READ_RULE, viewRule: FAM_READ_RULE, createRule: FAM_CREATE_RULE, updateRule: FAM_UPDATE_RULE, deleteRule: FAM_READ_RULE })) {
                $app.save(c);
                console.log("[Familien] Sammlung \"" + name + "\" ist jetzt je Familie getrennt.");
            }
        } catch (err) { setupError("Regeln für \"" + name + "\" nicht setzbar: " + err.message); }
    });

    // 10) Alte, öffentlich abrufbare Kalenderdatei entfernen
    try { $os.remove("/pb_public/kalender.ics"); } catch (err) { /* nicht vorhanden */ }

    // 11) Push-Sammlungen legt pinn-push.js an (ensurePushCollections beim Start von push.pb.js)

    // 12) Familien-Dashboard: Sammlung der eingerichteten Dashboard-Geräte (pinn-dashboard.js)
    try {
        require(`${__hooks}/pinn-dashboard.js`).ensureSchema();
    } catch (err) {
        setupError("Dashboard-Einrichtung fehlgeschlagen: " + err.message);
    }
}

// Alles ohne Familie (außer dem Hauptadmin) in die Familie "Familie" übernehmen.
// Gibt die Anzahl übernommener Profile + Familiendaten zurück.
function migrateOrphans() {
    const users = findCol(USERS);
    const famCol = findCol(FAMILIEN);
    if (!users || !famCol || !hasField(users, "familie")) return 0;
    try {
        const count = (sql) => {
            try {
                const m = new DynamicModel({ n: 0 });
                $app.db().newQuery(sql).one(m);
                return Number(m.n || 0);
            } catch (e) { return 0; }
        };
        const fdCol = findCol("familien_daten");
        const orphanUsers = count("SELECT COUNT(*) AS n FROM benutzer WHERE (familie = '' OR familie IS NULL) AND (rolle IS NULL OR rolle != 'hauptadmin')");
        const orphanData = (fdCol && hasField(fdCol, "familie")) ? count("SELECT COUNT(*) AS n FROM familien_daten WHERE familie = '' OR familie IS NULL") : 0;
        if (orphanUsers + orphanData === 0) return 0;
        let fam = null;
        try { fam = $app.findFirstRecordByFilter(FAMILIEN, "name = 'Familie'"); } catch (e) { fam = null; }
        if (!fam) {
            fam = new Record(famCol);
            fam.set("name", "Familie");
            $app.save(fam);
        }
        const upd = (sql) => { try { $app.db().newQuery(sql).bind({ f: fam.id }).execute(); } catch (e) { /* Sammlung/Feld fehlt */ } };
        upd("UPDATE benutzer SET familie = {:f} WHERE (familie = '' OR familie IS NULL) AND (rolle IS NULL OR rolle != 'hauptadmin')");
        upd("UPDATE familien_daten SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        // Bilder öffentlicher Rezepte gelöschter Familien ("Rezepte Familie") bleiben ohne Familie -
        // sonst würden sie beim Löschen der Familie "Familie" mitgelöscht.
        try {
            $app.db().newQuery("UPDATE rezept_bilder SET familie = {:f} WHERE (familie = '' OR familie IS NULL) AND id NOT IN (SELECT bild_id FROM oeffentliche_rezepte WHERE bild_id != '')").bind({ f: fam.id }).execute();
        } catch (e) {
            // Sammlung "oeffentliche_rezepte" gibt es (noch) nicht -> es gibt auch keine zu schützenden Bilder
            upd("UPDATE rezept_bilder SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        }
        upd("UPDATE aufgaben SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        // Die bisherigen Daten enthalten die Apple-Kalender-Auswahl -> alte .env-Zugangsdaten gehören
        // dieser Familie (Umzug in pinn-apple.js)
        if (orphanData > 0) {
            try {
                $app.findRecordsByFilter(FAMILIEN, "kalender = true", "", 0, 0).forEach(f => {
                    if (f.id !== fam.id) { f.set("kalender", false); $app.save(f); }
                });
                const again = $app.findRecordById(FAMILIEN, fam.id);
                again.set("kalender", true);
                $app.save(again);
            } catch (e) { /* egal */ }
        }
        console.log("[Familien] " + orphanUsers + " Profil(e) und " + orphanData + " Familiendaten in die Familie \"Familie\" übernommen.");
        return orphanUsers + orphanData;
    } catch (err) {
        setupError("Übernahme der bestehenden Daten fehlgeschlagen: " + err.message);
        return 0;
    }
}

// Prüft, ob alles für Familien Nötige vorhanden ist. Leerer Text = alles da.
function setupProblem() {
    const missing = [];
    const users = findCol(USERS);
    if (!findCol(FAMILIEN)) missing.push("Sammlung \"familien\"");
    if (!findCol("familien_daten")) missing.push("Sammlung \"familien_daten\"");
    if (!users || !hasField(users, "familie")) missing.push("Feld \"familie\" in \"" + USERS + "\"");
    const fd = findCol("familien_daten");
    if (fd && !hasField(fd, "familie")) missing.push("Feld \"familie\" in \"familien_daten\"");
    return missing.length ? ("Einrichtung unvollständig: " + missing.join(", ") + " fehlt.") : "";
}

// Einrichtung nachholen, falls etwas fehlt (z. B. wenn der Start-Hook nicht durchlief)
function ensureReady() {
    if (!setupProblem()) return "";
    try { ensureSchema(); } catch (err) { setupError("Einrichtung fehlgeschlagen: " + err.message); }
    const p = setupProblem();
    if (!p) return "";
    const errs = setupErrors();
    return p + (errs.length ? " Ursache: " + errs.join(" | ") : "");
}

// ---------------------------------------------------------------------------------------------
// Familienmitglieder <-> Profile
// Jedes Profil (außer Gast und Hauptadmin) ist genau ein Familienmitglied. Fehlt das Mitglied,
// wird es mit dem Profilnamen angelegt und verknüpft. Die früheren Beispiel-Mitglieder
// (Anna/Jonas/Mia) werden entfernt, solange kein Profil mit ihnen verknüpft ist.
// ---------------------------------------------------------------------------------------------
const MEMBER_COLORS = ["#2F4B41", "#B9842E", "#7A5C8E", "#B85C5C", "#3E7CA6", "#5C8A3E"];
const EXAMPLE_MEMBERS = {
    m1: { name: "Anna", role: "Mama" },
    m2: { name: "Jonas", role: "Papa" },
    m3: { name: "Mia", role: "Kind" },
};
function isExampleMember(m) {
    if (!m || typeof m !== "object") return false;
    const ex = EXAMPLE_MEMBERS[String(m.id || "")];
    return !!ex && m.name === ex.name && (m.role || "") === ex.role && !m.photo && !m.avatar;
}
function familyMemberProfiles(familyId) {
    if (!familyId) return [];
    try {
        // Ohne Sortierung: Die Profil-Sammlung hat (je nach Installation) kein Feld "created" - eine
        // Sortierung danach lässt die Abfrage scheitern und es würden keine Mitglieder angelegt.
        return $app.findRecordsByFilter(USERS, "familie = {:f}", "", 0, 0, { f: String(familyId) })
            .filter(r => r.getString("rolle") !== "gast" && r.getString("rolle") !== "hauptadmin");
    } catch (e) { return []; }
}
// Entfernt Beispiel-Mitglieder ohne Profil aus data.members. true = geändert.
function stripExampleMembers(familyId, data) {
    if (!data || !Array.isArray(data.members) || !data.members.some(isExampleMember)) return false;
    const linked = {};
    familyMemberProfiles(familyId).forEach(p => { const m = p.getString("mitglied"); if (m) linked[m] = true; });
    const before = data.members.length;
    data.members = data.members.filter(m => !isExampleMember(m) || linked[m.id]);
    return data.members.length !== before;
}
// Familienname ohne vorangestelltes "Familie" bzw. "WG" (für die Überschrift "Familie <Name>")
function lastNameFromFamily(name) {
    return String(name || "").replace(/^(familie|family|famille|familia|wg)\s+/i, "").trim();
}
function newMemberId(taken) {
    let id = "";
    let n = Date.now();
    do { id = "m" + n; n++; } while (taken[id]);
    taken[id] = true;
    return id;
}
// Gleicht die Familienmitglieder einer Familie mit ihren Profilen ab. true = etwas geändert.
function syncFamilyMembers(familyId) {
    if (!familyId) return false;
    try {
        let fam = null;
        try { fam = $app.findRecordById(FAMILIEN, String(familyId)); } catch (e) { return false; }
        let rec = familyDataRecord(familyId);
        let isNew = false;
        if (!rec) {
            const col = findCol("familien_daten");
            if (!col) return false;
            rec = new Record(col);
            rec.set("familie", fam.id);
            isNew = true;
        }
        let data = {};
        if (!isNew) {
            try { data = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {}; } catch (e) { data = {}; }
        }
        let changed = isNew || !Array.isArray(data.members);
        if (!Array.isArray(data.members)) data.members = [];
        if (stripExampleMembers(familyId, data)) changed = true;
        const ids = {};
        data.members.forEach(m => { if (m && m.id) ids[String(m.id)] = true; });
        const used = Object.assign({}, ids);
        familyMemberProfiles(familyId).forEach(p => {
            let mid = p.getString("mitglied");
            if (mid && ids[mid]) return;
            if (!mid) {
                mid = newMemberId(used);
                p.set("mitglied", mid);
                $app.save(p);
            }
            data.members.push({
                id: mid,
                name: p.getString("username"),
                role: "",
                color: MEMBER_COLORS[data.members.length % MEMBER_COLORS.length],
                displayMode: "name",
            });
            ids[mid] = true;
            used[mid] = true;
            changed = true;
        });
        if (data.lastName === undefined || data.lastName === "Mustermann") {
            data.lastName = lastNameFromFamily(fam.getString("name"));
            changed = true;
        }
        if (!changed) return false;
        rec.set("data", data);
        $app.save(rec);
        return true;
    } catch (err) {
        console.log("[Familien] Abgleich der Familienmitglieder fehlgeschlagen: " + err.message);
        return false;
    }
}
function syncAllFamilyMembers() {
    allFamilies().forEach(f => syncFamilyMembers(f.id));
}
// Mitglied (samt Notfallpass) aus den Familiendaten entfernen, z. B. wenn sein Profil gelöscht wurde
function removeFamilyMember(familyId, memberId) {
    if (!familyId || !memberId) return false;
    try {
        const rec = familyDataRecord(familyId);
        if (!rec) return false;
        const data = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {};
        if (!Array.isArray(data.members) || !data.members.some(m => m && m.id === memberId)) return false;
        data.members = data.members.filter(m => !m || m.id !== memberId);
        if (data.emergencyPasses && typeof data.emergencyPasses === "object") delete data.emergencyPasses[memberId];
        rec.set("data", data);
        $app.save(rec);
        return true;
    } catch (err) {
        console.log("[Familien] Mitglied konnte nicht entfernt werden: " + err.message);
        return false;
    }
}

module.exports = {
    USERS, FAMILIEN, AUTH_RULE, CALENDAR_OTHER_FAMILY,
    isMainAdmin, isAdmin, isGuest, isGuestRecord, ensureGuestRole, familyOf, canManage, adminCount, cleanUsername, cleanMemberId, cleanFamilyName,
    profileLinkedTo, allFamilies, findFamily, calendarFamilyId, isCalendarUser, calendarDenied,
    familyDataRecord, loadFamilyDataFor, familyDataStamp, ensureSchema, ensureReady, migrateOrphans,
    setupErrors, findCol, hasField, makeField, createCollection,
    MEMBER_COLORS, isExampleMember, stripExampleMembers, lastNameFromFamily, syncFamilyMembers, syncAllFamilyMembers, removeFamilyMember,
};
