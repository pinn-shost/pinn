// pb_hooks/pinn-benutzer.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
// Shared functions for sign-in, families, profiles and the link profile <-> family member.
// (PocketBase runs every hook handler in isolation - helper functions at file level of a
// *.pb.js would not be visible there. That is why they live here and are fetched via require().)
//
// Families:
//  - Collection "familien" (name, kalender). Each family has its own profiles, family data,
//    recipe images and tasks (field "familie" in benutzer / familien_daten / rezept_bilder / aufgaben).
//    Publicly shared recipes (and their images) are kept when a family is deleted and
//    end up in the "Rezepte Familie" (see pinn-rezepte.js).
//  - The main admin (role "hauptadmin", profile "Admin" from the beginning) belongs to no family. They create
//    families, rename them, delete them and assign the first family admin.
//  - Family admins (role "admin" with a family) only manage their own family. There can be
//    several admins per family.
//  - Each family can connect its own Apple calendar: the family admins store
//    Apple ID and app-specific password in the settings; it is stored encrypted in
//    the locked collection "apple_zugaenge" (pinn-apple.js). The field "kalender" in "familien"
//    is now only needed for the one-time migration of the old .env credentials.
//  - Usernames are only unique within a family. Sign-in goes through the dedicated
//    route /api/pinn/login (family + profile + password).
//  - Guests (role "gast") belong to a family, but have no known password and no
//    family member. They only get into the app via the family dashboard (pinn-dashboard.js)
//    and have no access to the finances.
//  - Optional dashboard PIN per profile in the hidden field "dashboard_pin" (pinn-dashboard.js).

const USERS = "benutzer";
const FAMILIEN = "familien";
const AUTH_RULE = "@request.auth.id != ''";
const FAM_READ_RULE = "@request.auth.id != '' && @request.auth.familie != '' && familie = @request.auth.familie";
const FAM_CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.body.familie = @request.auth.familie";
const FAM_UPDATE_RULE = FAM_READ_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie)";
const FAMILIEN_READ_RULE = "@request.auth.id != '' && id = @request.auth.familie";
const CALENDAR_OTHER_FAMILY = "Der Apple-Kalender ist nur für Profile einer Familie verfügbar (der Hauptadmin gehört zu keiner Familie).";

// ---------------------------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------------------------
function isUsersAuth(e) {
    try { return !!(e.auth && e.auth.collection().name === USERS); } catch (err) { return false; }
}
function isMainAdmin(e) {
    return isUsersAuth(e) && e.auth.getString("rolle") === "hauptadmin";
}
// Family admin (own family) or main admin
function isAdmin(e) {
    if (!isUsersAuth(e)) return false;
    const r = e.auth.getString("rolle");
    return r === "hauptadmin" || (r === "admin" && !!e.auth.getString("familie"));
}
function familyOf(e) {
    return isUsersAuth(e) ? e.auth.getString("familie") : "";
}
// Guest account (only via the dashboard, without finances)
function isGuest(e) {
    return isUsersAuth(e) && e.auth.getString("rolle") === "gast";
}
// The same for any profile record (e.g. requestInfo.auth in onRecordEnrich)
function isGuestRecord(rec) {
    try { return !!(rec && rec.collection().name === USERS && rec.getString("rolle") === "gast"); } catch (e) { return false; }
}
// May the signed-in user manage this profile? (main admin profiles never via these routes)
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
// Profile of the same family that is already linked to this family member (except exceptId), otherwise null.
function profileLinkedTo(familyId, memberId, exceptId) {
    if (!memberId) return null;
    try {
        const recs = $app.findRecordsByFilter(USERS, "familie = {:f} && mitglied = {:m}", "", 0, 0, { f: String(familyId || ""), m: memberId });
        return recs.find(r => r.id !== exceptId) || null;
    } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------------------------
function allFamilies() {
    try { return $app.findRecordsByFilter(FAMILIEN, "", "created", 0, 0); } catch (e) { return []; }
}
// Family by name (case-insensitive) or by ID
function findFamily(nameOrId) {
    const v = cleanFamilyName(nameOrId);
    if (!v) return null;
    const lower = v.toLowerCase();
    const list = allFamilies();
    return list.find(f => f.id === v) || list.find(f => f.getString("name").toLowerCase() === lower) || null;
}
// Only for the migration of the old .env credentials: the family that formerly owned the Apple calendar.
function calendarFamilyId() {
    try { return $app.findFirstRecordByFilter(FAMILIEN, "kalender = true").id; } catch (e) { return ""; }
}
// Every profile of a family may use the Apple calendar of its own family.
function isCalendarUser(e) {
    return !!familyOf(e);
}
// Empty text = allowed, otherwise an error message
function calendarDenied(e) {
    return isCalendarUser(e) ? "" : CALENDAR_OTHER_FAMILY;
}
function familyDataRecord(familyId) {
    if (!familyId) return null;
    try { return $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
// Family data including areas (recipes, shopping, board ... have lived in "familien_bereiche" since 1.104,
// pinn-bereiche.js) - so all server functions keep seeing the complete state. For reading only:
// familien_daten is always written via familyDataRecord() and the areas via pinn-bereiche.js.
function loadFamilyDataFor(familyId) {
    const rec = familyDataRecord(familyId);
    let data = {};
    if (rec) {
        try { data = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {}; } catch (e) { data = {}; }
    }
    if (!familyId) return data;
    try { require(`${__hooks}/pinn-bereiche.js`).overlay(familyId, data); } catch (e) { /* without areas yet */ }
    return data;
}
// Change time of the family data (incl. areas), without loading the (large) data itself
function familyDataStamp(familyId) {
    if (!familyId) return "";
    let stamp = "";
    try {
        const m = new DynamicModel({ updated: "" });
        $app.db().newQuery("SELECT updated FROM familien_daten WHERE familie = {:f} LIMIT 1").bind({ f: String(familyId) }).one(m);
        stamp = String(m.updated || "");
    } catch (e) { stamp = ""; }
    let bereiche = "";
    try { bereiche = require(`${__hooks}/pinn-bereiche.js`).areasStamp(familyId); } catch (e) { bereiche = ""; }
    return bereiche ? stamp + "|" + bereiche : stamp;
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
    } catch (e) { /* ignore */ }
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

// Remember errors of the set-up (for the display at the main admin) and log them
const SETUP_ERRORS_KEY = "pinnSetupErrors";
function setupError(msg) {
    console.log("[Familien] " + msg);
    try {
        const list = $app.store().get(SETUP_ERRORS_KEY) || [];
        const arr = [];
        for (let i = 0; i < list.length; i++) arr.push(String(list[i]));
        if (arr.indexOf(msg) === -1) arr.push(msg);
        $app.store().set(SETUP_ERRORS_KEY, arr.slice(-10));
    } catch (e) { /* ignore */ }
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
    try { $app.store().remove(SETUP_ERRORS_KEY); } catch (e) { /* ignore */ }
}

// New collection in the format of the PocketBase JavaScript environment: new Collection({type, name, fields, ...}).
// (pinn-push.js creates its collections this way as well - it works in this installation.)
function createCollection(def) {
    $app.save(new Collection(def));
    const c = findCol(def.name);
    if (!c) throw new Error("Sammlung \"" + def.name + "\" wurde nicht gespeichert.");
    return c;
}
// Create a single field from a definition (via a helper collection that is never saved)
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

// Add missing roles ("hauptadmin", "gast") to the select field "rolle". true = all present.
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
// Before creating a guest account: does the role "gast" exist yet?
function ensureGuestRole() {
    return ensureRoles();
}

// Creates collections/fields or completes them. Runs on start (and when needed from the routes);
// an error is only logged or remembered for the main admin.
function ensureSchema() {
    clearSetupErrors();

    // 1) Profile collection (only on a fresh install)
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
            try { users.fields.getByName("email").required = false; users.fields.getByName("password").min = 5; $app.save(users); } catch (e2) { /* depending on the version */ }
            users = findCol(USERS);
            console.log("[Anmeldung] Profil-Sammlung \"" + USERS + "\" angelegt.");
        } catch (err) {
            setupError("Profil-Sammlung nicht anlegbar: " + err.message);
        }
    }

    // 2) Family collection. Rules only in step 9 - "@request.auth.familie" only exists once
    //    the field "familie" exists in the profile.
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

    // 3) Family data + recipe images (only on a fresh install)
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

    // 4) Add the field "familie" everywhere (deleting a family also deletes the records)
    if (famCol) {
        [USERS, "familien_daten", "rezept_bilder", "aufgaben"].forEach(n => addField(n, familyRelationDef(famCol)));
    }

    // 5) Profile collection: fields, role "hauptadmin", sign-in per family
    users = findCol(USERS);
    if (users) {
        addField(USERS, { name: "mitglied", type: "text", max: 100 });
        addField(USERS, { name: "push_einstellungen", type: "json", maxSize: 20000, hidden: true });
        addField(USERS, { name: "dashboard_pin", type: "text", max: 300, hidden: true });
        ensureRoles();
        users = findCol(USERS);

        // Usernames only unique per family now; sign-in goes through /api/pinn/login
        users = findCol(USERS);
        if (users && hasField(users, "familie") && !hasIndex(users, "idx_benutzer_familie_username")) {
            try {
                users.passwordAuth = { enabled: true, identityFields: ["email"] };
                try { users.removeIndex("idx_benutzer_username"); } catch (err2) { /* does not exist */ }
                users.addIndex("idx_benutzer_familie_username", true, "`familie`, `username`", "");
                $app.save(users);
                console.log("[Anmeldung] Benutzernamen sind jetzt je Familie eindeutig.");
            } catch (err) {
                setupError("Anmeldung je Familie nicht einrichtbar: " + err.message);
            }
        }
    }

    // 6) Ensure the main admin: the existing profile "Admin" becomes the main admin (without a family),
    //    if it is missing, "Admin"/"Admin" is created (the password must be changed on the first sign-in).
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

    // 7) Migration of an existing installation: all profiles (except the main admin), family data,
    //    recipe images and tasks without a family go into the family "Familie". Runs on every start
    //    as long as there are still records without a family - even if other families already exist.
    migrateOrphans();

    // 8) Apple calendar: every family stores its own credentials (pinn-apple.js) - no
    //    assignment is needed here any more.

    // 9) Access rules: every family only sees its own data
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

    // 10) Remove the old, publicly retrievable calendar file
    try { $os.remove("/pb_public/kalender.ics"); } catch (err) { /* does not exist */ }

    // 11) pinn-push.js creates the push collections (ensurePushCollections on the start of push.pb.js)

    // 12) Family dashboard: collection of the set-up dashboard devices (pinn-dashboard.js)
    try {
        require(`${__hooks}/pinn-dashboard.js`).ensureSchema();
    } catch (err) {
        setupError("Dashboard-Einrichtung fehlgeschlagen: " + err.message);
    }
}

// Take over everything without a family (except the main admin) into the family "Familie".
// Returns the number of taken-over profiles + family data.
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
        const upd = (sql) => { try { $app.db().newQuery(sql).bind({ f: fam.id }).execute(); } catch (e) { /* collection/field is missing */ } };
        upd("UPDATE benutzer SET familie = {:f} WHERE (familie = '' OR familie IS NULL) AND (rolle IS NULL OR rolle != 'hauptadmin')");
        upd("UPDATE familien_daten SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        // Images of public recipes of deleted families ("Rezepte Familie") stay without a family -
        // otherwise they would be deleted along with the family "Familie" when it is deleted.
        try {
            $app.db().newQuery("UPDATE rezept_bilder SET familie = {:f} WHERE (familie = '' OR familie IS NULL) AND id NOT IN (SELECT bild_id FROM oeffentliche_rezepte WHERE bild_id != '')").bind({ f: fam.id }).execute();
        } catch (e) {
            // The collection "oeffentliche_rezepte" does not exist (yet) -> there are no images to protect either
            upd("UPDATE rezept_bilder SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        }
        upd("UPDATE aufgaben SET familie = {:f} WHERE familie = '' OR familie IS NULL");
        // The previous data contains the Apple calendar selection -> old .env credentials belong to
        // this family (migration in pinn-apple.js)
        if (orphanData > 0) {
            try {
                $app.findRecordsByFilter(FAMILIEN, "kalender = true", "", 0, 0).forEach(f => {
                    if (f.id !== fam.id) { f.set("kalender", false); $app.save(f); }
                });
                const again = $app.findRecordById(FAMILIEN, fam.id);
                again.set("kalender", true);
                $app.save(again);
            } catch (e) { /* ignore */ }
        }
        console.log("[Familien] " + orphanUsers + " Profil(e) und " + orphanData + " Familiendaten in die Familie \"Familie\" übernommen.");
        return orphanUsers + orphanData;
    } catch (err) {
        setupError("Übernahme der bestehenden Daten fehlgeschlagen: " + err.message);
        return 0;
    }
}

// Checks whether everything needed for families is present. Empty text = everything there.
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

// Catch up on the set-up if something is missing (e.g. if the start hook did not run)
function ensureReady() {
    if (!setupProblem()) return "";
    try { ensureSchema(); } catch (err) { setupError("Einrichtung fehlgeschlagen: " + err.message); }
    const p = setupProblem();
    if (!p) return "";
    const errs = setupErrors();
    return p + (errs.length ? " Ursache: " + errs.join(" | ") : "");
}

// ---------------------------------------------------------------------------------------------
// Family members <-> profiles
// Every profile (except guest and main admin) is exactly one family member. If the member is missing,
// it is created with the profile name and linked. The former example members
// (Anna/Jonas/Mia) are removed as long as no profile is linked to them.
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
        // Without sorting: the profile collection has (depending on the installation) no field "created" - sorting
        // by it makes the query fail and no members would be created.
        return $app.findRecordsByFilter(USERS, "familie = {:f}", "", 0, 0, { f: String(familyId) })
            .filter(r => r.getString("rolle") !== "gast" && r.getString("rolle") !== "hauptadmin");
    } catch (e) { return []; }
}
// Removes example members without a profile from data.members. true = changed.
function stripExampleMembers(familyId, data) {
    if (!data || !Array.isArray(data.members) || !data.members.some(isExampleMember)) return false;
    const linked = {};
    familyMemberProfiles(familyId).forEach(p => { const m = p.getString("mitglied"); if (m) linked[m] = true; });
    const before = data.members.length;
    data.members = data.members.filter(m => !isExampleMember(m) || linked[m.id]);
    return data.members.length !== before;
}
// Family name without a leading "Familie" or "WG" (for the heading "Family <name>")
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
// Areas module (pinn-bereiche.js) - null if it cannot be loaded (yet)
function areasLib() {
    try { return require(`${__hooks}/pinn-bereiche.js`); } catch (e) { return null; }
}
// Profiles without a linked member get a new member ID (saved on the profile).
// Always runs OUTSIDE a transaction. -> list of the family's profiles
function linkProfilesToMembers(familyId, members) {
    const used = {};
    (members || []).forEach(m => { if (m && m.id) used[String(m.id)] = true; });
    const profiles = familyMemberProfiles(familyId);
    profiles.forEach(p => {
        if (p.getString("mitglied")) return;
        p.set("mitglied", newMemberId(used));
        $app.save(p);
    });
    return profiles;
}
// Adds to a member list the members of the profiles that are still missing. true = something added.
function addProfileMembers(list, profiles) {
    const ids = {};
    list.forEach(m => { if (m && m.id) ids[String(m.id)] = true; });
    let changed = false;
    profiles.forEach(p => {
        const mid = p.getString("mitglied");
        if (!mid || ids[mid]) return;
        list.push({
            id: mid,
            name: p.getString("username"),
            role: "",
            color: MEMBER_COLORS[list.length % MEMBER_COLORS.length],
            displayMode: "name",
        });
        ids[mid] = true;
        changed = true;
    });
    return changed;
}
// Reconciles a family's members with their profiles. true = something changed.
// Since 1.108 the members live in the area "mitglieder" and the family name in the area "einstellungen"
// (pinn-bereiche.js); as long as a family has not been migrated yet, the old way via familien_daten applies.
function syncFamilyMembers(familyId) {
    if (!familyId) return false;
    const B = areasLib();
    if (B && B.isMoved(familyId, "mitglieder")) return syncFamilyMembersArea(B, familyId);
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
        const profiles = linkProfilesToMembers(familyId, data.members);
        if (addProfileMembers(data.members, profiles)) changed = true;
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
// Reconciliation via the areas. Everything that reads or writes other records (profiles, example members)
// happens beforehand - in the transaction of updateArea only the list is changed.
function syncFamilyMembersArea(B, familyId) {
    try {
        let fam = null;
        try { fam = $app.findRecordById(FAMILIEN, String(familyId)); } catch (e) { return false; }
        const current = (B.readMany(familyId, ["mitglieder"]).members) || [];
        const check = { members: Array.isArray(current) ? current.slice() : [] };
        const strip = stripExampleMembers(familyId, check);
        const keep = {};
        check.members.forEach(m => { if (m && m.id) keep[String(m.id)] = true; });
        const profiles = linkProfilesToMembers(familyId, current);
        const r1 = B.updateArea(familyId, "mitglieder", (data) => {
            let changed = false;
            if (!Array.isArray(data.members)) { data.members = []; changed = true; }
            if (strip) {
                const before = data.members.length;
                data.members = data.members.filter(m => !isExampleMember(m) || (m && keep[String(m.id)]));
                if (data.members.length !== before) changed = true;
            }
            if (addProfileMembers(data.members, profiles)) changed = true;
            return changed;
        });
        let changed = r1.changed;
        if (B.isMoved(familyId, "einstellungen")) {
            const name = lastNameFromFamily(fam.getString("name"));
            const r2 = B.updateArea(familyId, "einstellungen", (data) => {
                if (data.lastName !== undefined && data.lastName !== "Mustermann") return false;
                data.lastName = name;
                return true;
            });
            if (r2.changed) changed = true;
        }
        return changed;
    } catch (err) {
        console.log("[Familien] Abgleich der Familienmitglieder fehlgeschlagen: " + err.message);
        return false;
    }
}
function syncAllFamilyMembers() {
    allFamilies().forEach(f => syncFamilyMembers(f.id));
}
// Remove a member (including emergency pass) from the family data, e.g. when their profile was deleted.
// Since 1.108 from the areas "mitglieder" and "notfall", otherwise (not migrated yet) from familien_daten.
function removeFamilyMember(familyId, memberId) {
    if (!familyId || !memberId) return false;
    const B = areasLib();
    const movedMembers = !!(B && B.isMoved(familyId, "mitglieder"));
    const movedPasses = !!(B && B.isMoved(familyId, "notfall"));
    let removed = false;
    try {
        if (movedMembers) {
            const r = B.updateArea(familyId, "mitglieder", (data) => {
                if (!Array.isArray(data.members) || !data.members.some(m => m && m.id === memberId)) return false;
                data.members = data.members.filter(m => !m || m.id !== memberId);
                return true;
            });
            removed = r.changed;
        }
        if (movedPasses) {
            B.updateArea(familyId, "notfall", (data) => {
                const passes = data.emergencyPasses;
                if (!passes || typeof passes !== "object" || Array.isArray(passes) || !Object.prototype.hasOwnProperty.call(passes, memberId)) return false;
                delete passes[memberId];
                return true;
            });
        }
        if (movedMembers && movedPasses) return removed;
        const rec = familyDataRecord(familyId);
        if (!rec) return removed;
        const data = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {};
        let changed = false;
        if (!movedMembers && Array.isArray(data.members) && data.members.some(m => m && m.id === memberId)) {
            data.members = data.members.filter(m => !m || m.id !== memberId);
            changed = true;
            removed = true;
        }
        if (!movedPasses && data.emergencyPasses && typeof data.emergencyPasses === "object" && Object.prototype.hasOwnProperty.call(data.emergencyPasses, memberId)) {
            delete data.emergencyPasses[memberId];
            changed = true;
        }
        if (!changed) return removed;
        rec.set("data", data);
        $app.save(rec);
        return removed;
    } catch (err) {
        console.log("[Familien] Mitglied konnte nicht entfernt werden: " + err.message);
        return removed;
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
