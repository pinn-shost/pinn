// pb_hooks/pinn-kalender.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Calendars per profile (Settings → Calendar → Add calendar)
//
// - Every profile of a family (except guests) signs in with THEIR iCloud or Google account and
//   ticks the calendars from it in two columns:
//     geteilt = false  "For me" - only this profile sees the calendar and its events
//     geteilt = true   "Family" - all profiles of the family (also guests) see and use it; the
//                      others only see a note in the settings with a masked
//                      account (e.g. m**l@g***l.com)
//   (saveSelection). Calendars without an account (events only on the pinn. server) still exist.
//   The former family calendars from iCloud/Google (calendar-sync.js) keep running unchanged.
// - The events live on this server. In the app the calendars are called "pinn:<id>" (X-PINN-CALNAME),
//   their events "pinn-termin:<id>" (X-PINN-HREF).
// - Calendars from the profile's PERSONAL iCloud or Google account are linked
//   (quelle = "apple" | "google", accounts: pinn-kalender-konten.js).
//   Then iCloud/Google is the storage location: creating, changing and deleting go directly there, and every
//   15 minutes (or on "Refresh now") syncLinkedCalendar() fetches the state from there and
//   mirrors it into "kalender_termine" (field extern = address of the resource at iCloud/Google). This way
//   the calendar file, offline display, moving and push work for these events exactly as for
//   all other own calendars. "Remove" or unticking only deletes the link in pinn.,
//   never the calendar in iCloud/Google. Events in family calendars of an account are created by pinn. via the
//   owner's account.
// - GET /api/pinn/kalender (benutzer.pb.js) appends to the family's calendar file the events
//   that the signed-in profile may see, and before them one line per calendar
//   X-PINN-KALENDER:{"id","name","farbe","geteilt","mein","von","darf"} - so the list arrives with
//   the same request and is also available offline (cached calendar file).
// - Creating/changing/deleting/raw text of events run via the known routes
//   (create_/update_/delete_calendar_event.pb.js, get_calendar_event_raw.pb.js), which branch here for "pinn:"
//   calendars or "pinn-termin:" addresses. Moving between iCloud/Google and
//   own calendars works in both directions.
// - Push (pinn-push.js) reads all events of the family via icsAllForFamily(); private ones carry
//   X-PINN-OWNER and only go to their profile.
//
// Collections (locked, only via the routes):
//   kalender_eigene:  familie, besitzer (profile ID), name, farbe, geteilt,
//                     quelle ("" | "apple" | "google"), extern (calendar address), extern_name, nur_lesen
//   kalender_termine: familie, kalender (ID from kalender_eigene), uid, ics (VEVENT blocks only),
//                     extern (address of the event resource at iCloud/Google, only for linked calendars)

const COL_KAL = "kalender_eigene";
const COL_TER = "kalender_termine";
const CAL_PREFIX = "pinn:";
const HREF_PREFIX = "pinn-termin:";
const ID_RE = /^[a-z0-9]{15}$/;
const MAX_ICS = 60000;
const FARBEN = ["#2F4B41", "#3E7CA6", "#7A5C8E", "#B85C5C", "#B9842E", "#5C8A3E", "#2A9D8F", "#C0567A", "#D9822B", "#546E7A"];

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function benutzerLib() {
    return require(`${__hooks}/pinn-benutzer.js`);
}
function cleanText(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 60);
}
function cleanColor(v) {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : "";
}
function userIdOf(e) {
    try { return e.auth ? String(e.auth.id || "") : ""; } catch (err) { return ""; }
}
function isPinnCalName(name) {
    const s = String(name || "");
    return s.indexOf(CAL_PREFIX) === 0 && ID_RE.test(s.slice(CAL_PREFIX.length));
}
function isPinnHref(href) {
    const s = String(href || "");
    return s.indexOf(HREF_PREFIX) === 0 && ID_RE.test(s.slice(HREF_PREFIX.length));
}
function kontenLib() {
    return require(`${__hooks}/pinn-kalender-konten.js`);
}
function cs() {
    return require(`${__hooks}/calendar-sync.js`);
}
function isLinked(cal) {
    const q = cal ? cal.getString("quelle") : "";
    return q === "apple" || q === "google";
}
function hrefPath(url) {
    return String(url || "").replace(/^https?:\/\/[^\/]+/i, "");
}
function syncErrKey(calId) { return "pinnKalSyncErr:" + calId; }
function setSyncError(calId, msg) { try { $app.store().set(syncErrKey(calId), String(msg || "")); } catch (e) { /* ignore */ } }
function clearSyncError(calId) { try { $app.store().remove(syncErrKey(calId)); } catch (e) { /* ignore */ } }
function getSyncError(calId) { try { const v = $app.store().get(syncErrKey(calId)); return v ? String(v) : ""; } catch (e) { return ""; } }
function nameOfUser(id) {
    if (!id) return "";
    try { return $app.findRecordById("benutzer", id).getString("username"); } catch (e) { return ""; }
}

// ---------------------------------------------------------------------------------------------
// Sammlungen
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (!findCol(COL_KAL)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: COL_KAL,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "besitzer", type: "text", max: 40, required: true },
                    { name: "name", type: "text", max: 80 },
                    { name: "farbe", type: "text", max: 20 },
                    { name: "geteilt", type: "bool" },
                    { name: "quelle", type: "text", max: 10 },
                    { name: "extern", type: "text", max: 1000 },
                    { name: "extern_name", type: "text", max: 200 },
                    { name: "nur_lesen", type: "bool" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE INDEX `idx_kal_eigene_familie` ON `" + COL_KAL + "` (`familie`)",
                    "CREATE INDEX `idx_kal_eigene_besitzer` ON `" + COL_KAL + "` (`besitzer`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Kalender] Sammlung \"" + COL_KAL + "\" angelegt.");
        } catch (err) {
            console.log("[Kalender] Konnte Sammlung \"" + COL_KAL + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(COL_TER)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: COL_TER,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "kalender", type: "text", max: 40, required: true },
                    { name: "uid", type: "text", max: 200 },
                    { name: "ics", type: "text", max: MAX_ICS },
                    { name: "extern", type: "text", max: 1000 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE INDEX `idx_kal_termine_familie` ON `" + COL_TER + "` (`familie`)",
                    "CREATE INDEX `idx_kal_termine_kalender` ON `" + COL_TER + "` (`kalender`)",
                    "CREATE INDEX `idx_kal_termine_uid` ON `" + COL_TER + "` (`uid`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Kalender] Sammlung \"" + COL_TER + "\" angelegt.");
        } catch (err) {
            console.log("[Kalender] Konnte Sammlung \"" + COL_TER + "\" nicht anlegen: " + err.message);
        }
    }
    // Add fields for linked calendars (iCloud/Google) to existing collections
    addFields(COL_KAL, [
        { name: "quelle", type: "text", max: 10 },
        { name: "extern", type: "text", max: 1000 },
        { name: "extern_name", type: "text", max: 200 },
        { name: "nur_lesen", type: "bool" },
    ]);
    addFields(COL_TER, [{ name: "extern", type: "text", max: 1000 }]);
    try { kontenLib().setup(); } catch (err) { console.log("[Kalender] Sammlung für persönliche Konten nicht anlegbar: " + err.message); }
}
function addFields(colName, defs) {
    const col = findCol(colName);
    if (!col) return;
    const lib = benutzerLib();
    let changed = false;
    defs.forEach(def => {
        if (lib.hasField(col, def.name)) return;
        try { col.fields.add(lib.makeField(def)); changed = true; } catch (err) { console.log("[Kalender] Feld \"" + def.name + "\" nicht anlegbar: " + err.message); }
    });
    if (!changed) return;
    try {
        $app.save(col);
        console.log("[Kalender] Felder in \"" + colName + "\" ergänzt.");
    } catch (err) {
        console.log("[Kalender] Felder in \"" + colName + "\" nicht speicherbar: " + err.message);
    }
}
function ready() {
    return !!(findCol(COL_KAL) && findCol(COL_TER));
}

// ---------------------------------------------------------------------------------------------
// Calendars: visibility and permissions
// ---------------------------------------------------------------------------------------------
function calRecord(id) {
    if (!ID_RE.test(String(id || ""))) return null;
    try { return $app.findRecordById(COL_KAL, String(id)); } catch (e) { return null; }
}
function canSee(rec, familyId, userId) {
    if (!rec || !familyId || rec.getString("familie") !== familyId) return false;
    return rec.getBool("geteilt") || (!!userId && rec.getString("besitzer") === userId);
}
// Change/delete: always the owner; for shared calendars additionally the admins of the family
function canManage(e, rec) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    if (!rec || !familyId || lib.isGuest(e) || rec.getString("familie") !== familyId) return false;
    if (rec.getString("besitzer") === userIdOf(e)) return true;
    return rec.getBool("geteilt") && lib.isAdmin(e);
}
function visibleCalendars(familyId, userId) {
    if (!familyId || !ready()) return [];
    try {
        return $app.findRecordsByFilter(COL_KAL, "familie = {:f} && (geteilt = true || besitzer = {:u})", "created", 0, 0,
            { f: String(familyId), u: String(userId || "-") });
    } catch (e) { return []; }
}
function calJson(rec, userId, isAdmin, isGuest, names) {
    const owner = rec.getString("besitzer");
    const mine = !!userId && owner === userId;
    let von = "";
    if (!mine) {
        if (!(owner in names)) names[owner] = nameOfUser(owner);
        von = names[owner];
    }
    const linked = isLinked(rec);
    let konto = "";
    if (linked) {
        const key = "k:" + owner + ":" + rec.getString("quelle");
        if (!(key in names)) {
            let raw = "";
            try { raw = kontenLib().kontoName(owner, rec.getString("quelle")); } catch (err) { raw = ""; }
            names[key] = raw;
        }
        konto = mine ? names[key] : kontenLib().maskAccount(names[key]);
    }
    return {
        id: rec.id,
        name: rec.getString("name") || "Kalender",
        farbe: rec.getString("farbe") || FARBEN[0],
        geteilt: rec.getBool("geteilt"),
        mein: mine,
        von: von,
        darf: !isGuest && (mine || (rec.getBool("geteilt") && isAdmin)),
        quelle: linked ? rec.getString("quelle") : "",
        externName: linked ? rec.getString("extern_name") : "",
        nurLesen: linked && rec.getBool("nur_lesen"),
        konto: konto,
        fehler: (linked && mine) ? getSyncError(rec.id) : "",
    };
}
function listFor(e) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    const userId = userIdOf(e);
    const isAdmin = lib.isAdmin(e), isGuest = lib.isGuest(e);
    const names = {};
    return visibleCalendars(familyId, userId).map(r => calJson(r, userId, isAdmin, isGuest, names));
}

// Find a calendar in the personal account (via its address)
function findExternCal(acc, href) {
    const want = cs().normUrl(href);
    return (acc.calendars || []).find(c => cs().normUrl(c.href) === want) || null;
}

// Create or change a calendar: { id?, name, farbe, geteilt?, quelle?, extern? }
// quelle/extern only when creating: links the new calendar with a calendar from the personal
// iCloud (quelle "apple") or Google account (quelle "google"). When changing, "geteilt" stays as it is if it is
// not sent along.
function saveCalendar(e, body) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    const userId = userIdOf(e);
    if (!familyId || !userId) throw new Error("Eigene Kalender gibt es nur für Profile einer Familie.");
    if (lib.isGuest(e)) throw new Error("Gäste können keine Kalender anlegen.");
    ensureSchema();
    if (!ready()) throw new Error("Die Kalender-Sammlungen konnten auf dem Server nicht angelegt werden.");
    const name = cleanText(body.name, 60);
    if (!name) throw new Error("Bitte einen Namen für den Kalender angeben.");
    const farbe = cleanColor(body.farbe) || FARBEN[0];
    let rec;
    let neuVerknuepft = false;
    if (body.id) {
        rec = calRecord(body.id);
        if (!rec || !canSee(rec, familyId, userId)) throw new Error("Kalender nicht gefunden.");
        if (!canManage(e, rec)) throw new Error("Diesen Kalender kann nur sein Besitzer (bzw. bei geteilten Kalendern ein Admin) ändern.");
        // Only the owner decides whether a calendar is "For me" or "Family"
        if (rec.getString("besitzer") === userId && typeof body.geteilt === "boolean") rec.set("geteilt", body.geteilt);
    } else {
        rec = new Record(findCol(COL_KAL));
        rec.set("familie", familyId);
        rec.set("besitzer", userId);
        const quelle = String(body.quelle || "");
        if (quelle === "apple" || quelle === "google") {
            const konten = kontenLib();
            if (!konten.isConnected(userId, quelle)) throw new Error("Bitte zuerst dein " + konten.label(quelle) + "-Konto verbinden.");
            const href = String(body.extern || "").trim();
            if (!href || href.length > 1000) throw new Error("Bitte einen Kalender aus deinem " + konten.label(quelle) + "-Konto auswählen.");
            const acc = konten.account(userId, quelle, true);
            const ext = findExternCal(acc, href);
            if (!ext) throw new Error("Dieser Kalender wurde in deinem " + konten.label(quelle) + "-Konto nicht gefunden.");
            const dup = findLinked(userId, quelle, ext.href);
            if (dup) throw new Error("Dieser Kalender ist bereits als „" + (dup.getString("name") || "Kalender") + "“ verknüpft.");
            rec.set("quelle", quelle);
            rec.set("extern", String(ext.href));
            rec.set("extern_name", cleanText(konten.displayName(acc, ext.name), 200));
            rec.set("nur_lesen", quelle === "google" && ext.writable === false);
            rec.set("geteilt", !!body.geteilt);
            neuVerknuepft = true;
        } else {
            rec.set("geteilt", !!body.geteilt);
        }
    }
    rec.set("name", name);
    rec.set("farbe", farbe);
    $app.save(rec);
    let hinweis = "";
    if (neuVerknuepft) {
        // Fetch events right away so that the calendar is not empty until the next sync
        try {
            const n = syncLinkedCalendar(rec);
            hinweis = n + " Termin" + (n === 1 ? "" : "e") + " aus " + kontenLib().label(rec.getString("quelle")) + " übernommen.";
        } catch (err) {
            hinweis = "Verknüpft – die Termine konnten aber noch nicht geladen werden: " + err.message;
        }
    }
    return { kalender: listFor(e), id: rec.id, hinweis: hinweis };
}
function findLinked(userId, quelle, href) {
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && quelle = {:q}", "", 0, 0, { u: String(userId), q: String(quelle) }); } catch (e) { recs = []; }
    const want = cs().normUrl(href);
    return recs.find(r => cs().normUrl(r.getString("extern")) === want) || null;
}

// Take over the selection from an account (ticks "For me" / "Family"):
//   { art: "apple"|"google", auswahl: [{ href, ziel: "ich" | "familie" | "" }] }
// Newly ticked -> link the calendar (name from the account, free colour) and fetch events right away;
// column changed -> only switch "geteilt"; tick removed -> remove the link in pinn. (everything
// in the account stays). Calendars that do not appear in the selection stay unchanged.
function saveSelection(e, body) {
    const p = requireOwnProfile(e);
    ensureSchema();
    if (!ready()) throw new Error("Die Kalender-Sammlungen konnten auf dem Server nicht angelegt werden.");
    const art = String(body.art || "");
    const konten = kontenLib();
    if (!konten.validArt(art)) throw new Error("Unbekannte Kontoart.");
    if (!konten.isConnected(p.userId, art)) throw new Error("Bitte zuerst dein " + konten.label(art) + "-Konto verbinden.");
    const auswahl = Array.isArray(body.auswahl) ? body.auswahl.slice(0, 200) : [];
    const acc = konten.account(p.userId, art, true);
    const col = findCol(COL_KAL);
    let mine = [];
    try { mine = $app.findRecordsByFilter(COL_KAL, "familie = {:f}", "", 0, 0, { f: p.familyId }); } catch (err) { mine = []; }
    const usedColors = mine.map(r => String(r.getString("farbe") || "").toUpperCase());
    const neu = [];
    let added = 0, changed = 0, removed = 0;
    auswahl.forEach(item => {
        if (!item || typeof item !== "object") return;
        const href = String(item.href || "").trim();
        if (!href || href.length > 1000) return;
        const ziel = item.ziel === "ich" || item.ziel === "familie" ? item.ziel : "";
        const rec = findLinked(p.userId, art, href);
        if (!ziel) {
            if (rec) { try { removeCalendarWithEvents(rec); removed++; } catch (err) { /* next time */ } }
            return;
        }
        const geteilt = ziel === "familie";
        if (rec) {
            if (rec.getBool("geteilt") !== geteilt) { rec.set("geteilt", geteilt); $app.save(rec); changed++; }
            return;
        }
        const ext = findExternCal(acc, href);
        if (!ext) return; // not (any more) in the account
        const farbe = FARBEN.find(c => usedColors.indexOf(c.toUpperCase()) === -1) || FARBEN[(mine.length + added) % FARBEN.length];
        usedColors.push(farbe.toUpperCase());
        const extName = cleanText(konten.displayName(acc, ext.name), 200);
        const r = new Record(col);
        r.set("familie", p.familyId);
        r.set("besitzer", p.userId);
        r.set("name", cleanText(extName, 60) || "Kalender");
        r.set("farbe", farbe);
        r.set("geteilt", geteilt);
        r.set("quelle", art);
        r.set("extern", String(ext.href));
        r.set("extern_name", extName);
        r.set("nur_lesen", art === "google" && ext.writable === false);
        $app.save(r);
        neu.push(r);
        added++;
    });
    // Fetch the events of the new calendars right away so that they are not empty until the next sync
    let termine = 0;
    const fehler = [];
    neu.forEach(r => {
        try { termine += syncLinkedCalendar(r); } catch (err) { fehler.push((r.getString("name") || "Kalender") + ": " + err.message); }
    });
    const teile = [];
    if (added) teile.push(added + " Kalender hinzugefügt" + (termine ? " (" + termine + " Termin" + (termine === 1 ? "" : "e") + ")" : ""));
    if (changed) teile.push(changed + " umgestellt");
    if (removed) teile.push(removed + " entfernt");
    let hinweis = teile.length ? teile.join(", ") + "." : "Keine Änderungen.";
    if (fehler.length) hinweis += " Noch nicht geladen – " + fehler.join("; ");
    return { kalender: listFor(e), hinweis: hinweis };
}

// Delete a calendar with all its events. For linked calendars only the link in pinn. -
// the calendar and its events in iCloud/Google stay untouched.
function deleteCalendar(e, body) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    const rec = calRecord(body && body.id);
    if (!rec || !canSee(rec, familyId, userIdOf(e))) throw new Error("Kalender nicht gefunden.");
    if (!canManage(e, rec)) throw new Error("Diesen Kalender kann nur sein Besitzer (bzw. bei geteilten Kalendern ein Admin) löschen.");
    removeCalendarWithEvents(rec);
    return { kalender: listFor(e) };
}
function removeCalendarWithEvents(rec) {
    let terms = [];
    try { terms = $app.findRecordsByFilter(COL_TER, "kalender = {:k}", "", 0, 0, { k: rec.id }); } catch (e) { terms = []; }
    terms.forEach(t => { try { $app.delete(t); } catch (e) { /* next time */ } });
    clearSyncError(rec.id);
    $app.delete(rec);
}

// Clean up: profile deleted -> its private calendars (shared ones stay with the family) and
// its personal accounts
function cleanupUser(userId) {
    if (!userId) return;
    if (ready()) {
        let recs = [];
        // private calendars and all linked to an account of the profile (the account goes with it)
        try { recs = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && (geteilt = false || quelle = 'apple' || quelle = 'google')", "", 0, 0, { u: String(userId) }); } catch (e) { recs = []; }
        recs.forEach(r => { try { removeCalendarWithEvents(r); } catch (e) { /* ignore */ } });
    }
    try { kontenLib().removeAll(userId); } catch (e) { /* already deleted with the profile */ }
}
// Family deleted -> everything of this family
function cleanupFamily(familyId) {
    if (!familyId || !ready()) return;
    [COL_TER, COL_KAL].forEach(col => {
        let recs = [];
        try { recs = $app.findRecordsByFilter(col, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { recs = []; }
        recs.forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
    });
}

// ---------------------------------------------------------------------------------------------
// Personal accounts (iCloud/Google) - routes of the settings
// ---------------------------------------------------------------------------------------------
function requireOwnProfile(e) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    const userId = userIdOf(e);
    if (!familyId || !userId) throw new Error("Eigene Kalender gibt es nur für Profile einer Familie.");
    if (lib.isGuest(e)) throw new Error("Gäste können keine Konten verbinden.");
    return { familyId: familyId, userId: userId };
}
function accountStatus(e, origin) {
    const p = requireOwnProfile(e);
    const st = kontenLib().status(p.userId, origin);
    // Admins may store the Google access (OAuth client) in the app - only if it is not in the .env
    st.google.einrichtbar = st.google.client !== "env" && benutzerLib().isAdmin(e);
    return st;
}
// Store Google's OAuth client in the app (admins; only if it is not in the .env)
function saveGoogleClient(e, body) {
    const lib = benutzerLib();
    if (!lib.isAdmin(e)) throw new Error("Den Google-Zugang für pinn. kann nur ein Admin hinterlegen.");
    require(`${__hooks}/pinn-google.js`).saveClient(body.clientId, body.clientSecret);
    let konten = null;
    try { konten = accountStatus(e, body.origin); } catch (err) { konten = null; }
    return { konten: konten };
}
function connectApple(e, body) {
    const p = requireOwnProfile(e);
    const konten = kontenLib();
    konten.saveApple(p.userId, body.appleId, body.appPassword);
    // Sync already linked iCloud calendars again right away (e.g. after a new password)
    try { syncLinkedForUser(p.userId, "apple"); } catch (err) { /* next sync */ }
    let extern = [];
    try { extern = accountCalendars(e, { art: "apple" }).extern; } catch (err) { extern = []; }
    return { konten: accountStatus(e, body.origin), extern: extern };
}
function accountCalendars(e, body) {
    const p = requireOwnProfile(e);
    const art = String(body.art || "");
    const konten = kontenLib();
    if (!konten.validArt(art)) throw new Error("Unbekannte Kontoart.");
    // Per calendar: current selection ("ich" / "familie" / "") from the profile's linked calendars
    let linked = [];
    try { linked = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && quelle = {:q}", "", 0, 0, { u: p.userId, q: art }); } catch (err) { linked = []; }
    const byHref = {};
    linked.forEach(r => { byHref[cs().normUrl(r.getString("extern"))] = r; });
    const extern = konten.listCalendars(p.userId, art).map(c => {
        const r = byHref[cs().normUrl(c.href)];
        return Object.assign({}, c, { ziel: r ? (r.getBool("geteilt") ? "familie" : "ich") : "", id: r ? r.id : "" });
    });
    return { extern: extern };
}
function startGoogle(e, body) {
    const p = requireOwnProfile(e);
    return { url: require(`${__hooks}/pinn-google.js`).startPersonalAuth(p.familyId, p.userId, body.origin) };
}
// Disconnect an account: linked calendars of this account disappear from pinn. (they stay in iCloud/Google)
function disconnect(e, body) {
    const p = requireOwnProfile(e);
    const art = String(body.art || "");
    const konten = kontenLib();
    if (!konten.validArt(art)) throw new Error("Unbekannte Kontoart.");
    if (ready()) {
        let recs = [];
        try { recs = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && quelle = {:q}", "", 0, 0, { u: p.userId, q: art }); } catch (err) { recs = []; }
        recs.forEach(r => { try { removeCalendarWithEvents(r); } catch (err) { /* ignore */ } });
    }
    konten.remove(p.userId, art);
    console.log("[Kalender-Konten] " + konten.label(art) + "-Konto von Profil " + p.userId + " getrennt.");
    return { konten: accountStatus(e, body.origin), kalender: listFor(e) };
}

// ---------------------------------------------------------------------------------------------
// Sync of linked calendars (iCloud/Google -> mirror in kalender_termine)
// ---------------------------------------------------------------------------------------------
function linkedAccount(cal) {
    return kontenLib().account(cal.getString("besitzer"), cal.getString("quelle"));
}
function linkedTarget(cal) {
    const acc = linkedAccount(cal);
    const c = findExternCal(acc, cal.getString("extern"));
    if (!c) {
        throw new Error("Der verknüpfte Kalender „" + (cal.getString("extern_name") || cal.getString("name")) + "“ wurde in " +
            kontenLib().label(cal.getString("quelle")) + " nicht mehr gefunden.");
    }
    return { acc: acc, c: c };
}
function uidOfIcs(ics) {
    const m = String(ics || "").match(/^UID:(.*)$/m);
    return m ? cleanUid(m[1]) : "";
}

// Sync one linked calendar. Returns: number of events. Throws on errors (the previous
// state then stays in place instead of losing events).
function syncLinkedCalendar(cal) {
    if (!isLinked(cal)) return 0;
    try {
        const t = linkedTarget(cal);
        let resources;
        try {
            resources = cs().downloadCalendarEvents(t.acc.host, t.acc.xmlHeaders, t.c.href);
        } catch (err) {
            if (t.acc.kind === "google") {
                const g = require(`${__hooks}/pinn-google.js`);
                if (err.body && g.isApiDisabled(err.body)) throw new Error(g.CALDAV_DISABLED_MESSAGE);
                if (err.status === 403 || err.status === 404 || err.status === 405) throw new Error("Dieser Google-Kalender lässt sich nicht lesen (Status " + err.status + ").");
            }
            throw err;
        }
        // Name/write permission changed at iCloud/Google? Follow along.
        const extName = cleanText(kontenLib().displayName(t.acc, t.c.name), 200);
        const ro = t.acc.kind === "google" && t.c.writable === false;
        if (extName !== cal.getString("extern_name") || ro !== cal.getBool("nur_lesen")) {
            cal.set("extern_name", extName);
            cal.set("nur_lesen", ro);
            try { $app.save(cal); } catch (err) { /* next time */ }
        }
        let existing = [];
        try { existing = $app.findRecordsByFilter(COL_TER, "kalender = {:k}", "", 0, 0, { k: cal.id }); } catch (err) { existing = []; }
        const byExt = {};
        existing.forEach(r => { const k = cs().normUrl(r.getString("extern")); if (k) byExt[k] = r; });
        const seen = {};
        let count = 0;
        const col = findCol(COL_TER);
        resources.forEach(res => {
            const key = cs().normUrl(res.href);
            if (!key || seen[key]) return;
            seen[key] = true;
            const ics = res.veventBlocks.join("\r\n");
            if (ics.length > MAX_ICS) return; // too large - keep the previous state (if there is one)
            count++;
            let rec = byExt[key];
            if (rec && rec.getString("ics") === ics) return; // unchanged
            if (!rec) {
                rec = new Record(col);
                rec.set("familie", cal.getString("familie"));
                rec.set("kalender", cal.id);
                rec.set("extern", hrefPath(res.href));
            }
            rec.set("uid", uidOfIcs(ics));
            rec.set("ics", ics);
            try { $app.save(rec); } catch (err) { console.log("[Kalender] Termin nicht übernommen: " + err.message); }
        });
        // Deleted at iCloud/Google -> here too (events without extern are not uploaded yet: they stay)
        existing.forEach(r => {
            const k = cs().normUrl(r.getString("extern"));
            if (k && !seen[k]) { try { $app.delete(r); } catch (err) { /* next time */ } }
        });
        clearSyncError(cal.id);
        return count;
    } catch (err) {
        setSyncError(cal.id, err.message);
        throw err;
    }
}

function linkedCalendars(filter, params) {
    if (!ready()) return [];
    try { return $app.findRecordsByFilter(COL_KAL, filter, "created", 0, 0, params || {}); } catch (e) { return []; }
}
// Admin error log (pinn-protokoll.js) - if the file is missing, it stays with the Docker log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* log not available */ }
}
function syncList(cals) {
    cals.forEach(c => {
        try {
            const n = syncLinkedCalendar(c);
            console.log("[Kalender] Verknüpfter Kalender " + c.id + " (" + c.getString("quelle") + "): " + n + " Termine.");
            plog("behoben", "sync", c.getString("familie"));
        } catch (err) {
            console.log("[Kalender] Verknüpfter Kalender " + c.id + " – Fehler: " + err.message);
            const label = c.getString("extern_name") || c.getString("name") || c.id;
            plog("fehler", "sync", "Verknüpfter Kalender „" + label + "“ (" + (c.getString("quelle") === "google" ? "Google" : "iCloud") + "): " + err.message,
                { familie: c.getString("familie"), benutzer: c.getString("besitzer") });
        }
    });
}
// Cron: all linked calendars of all families
function syncAllLinked() {
    syncList(linkedCalendars("quelle = 'apple' || quelle = 'google'"));
}
// "Refresh now": the linked calendars that a profile sees (own + family calendars of others)
function syncLinkedVisible(familyId, userId) {
    if (!familyId) { syncLinkedForUser(userId); return; }
    syncList(linkedCalendars("familie = {:f} && (quelle = 'apple' || quelle = 'google') && (geteilt = true || besitzer = {:u})",
        { f: String(familyId), u: String(userId || "-") }));
}
// After (re)connecting: the linked calendars of a profile
function syncLinkedForUser(userId, art) {
    if (!userId) return;
    const q = art ? "besitzer = {:u} && quelle = {:q}" : "besitzer = {:u} && (quelle = 'apple' || quelle = 'google')";
    syncList(linkedCalendars(q, { u: String(userId), q: String(art || "") }));
}

// ---------------------------------------------------------------------------------------------
// Termine
// ---------------------------------------------------------------------------------------------
function escapeICSText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function utcStampNow() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) +
        'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
}
// Random part of a new UID: PocketBase's secure random generator (not a simple random); the counter
// keeps UIDs unique should the generator ever be unavailable.
let uidCounter = 0;
function uidSuffix() {
    try {
        const s = $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789");
        if (typeof s === 'string' && s.length >= 4) return s;
    } catch (e) { /* fall through */ }
    uidCounter += 1;
    return 'c' + uidCounter.toString(36) + Date.now().toString(36);
}
function newUid(ev) {
    const clientUid = (ev && typeof ev.clientUid === 'string') ? ev.clientUid : '';
    return /^pinn-[A-Za-z0-9-]{4,80}$/.test(clientUid)
        ? clientUid
        : 'pinn-' + Date.now() + '-' + uidSuffix();
}
function cleanUid(uid) {
    const s = String(uid || "").replace(/[\r\n]/g, "").trim();
    return s && s.length <= 190 ? s : "";
}
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function validTime(s) { return /^\d{2}:\d{2}$/.test(String(s || "")); }

// VEVENT block as in calendar-sync.js (buildVEventICS) - "floating" local time, all-day with
// exclusive DTEND, repeat and reminder.
function buildVEvent(uid, ev) {
    if (!validDate(ev.startDate) || !validDate(ev.endDate)) throw new Error("Start- und Enddatum sind erforderlich.");
    const lines = [];
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + utcStampNow());
    lines.push('SUMMARY:' + escapeICSText(cleanText(ev.title, 300) || 'Ohne Titel'));
    if (ev.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + ev.startDate.replace(/-/g, ''));
        const p = ev.endDate.split('-').map(Number);
        const endD = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1));
        const pad = n => String(n).padStart(2, '0');
        lines.push('DTEND;VALUE=DATE:' + endD.getUTCFullYear() + pad(endD.getUTCMonth() + 1) + pad(endD.getUTCDate()));
    } else {
        const st = validTime(ev.startTime) ? ev.startTime : '09:00';
        const et = validTime(ev.endTime) ? ev.endTime : st;
        lines.push('DTSTART:' + ev.startDate.replace(/-/g, '') + 'T' + st.replace(':', '') + '00');
        lines.push('DTEND:' + ev.endDate.replace(/-/g, '') + 'T' + et.replace(':', '') + '00');
    }
    if (ev.location) lines.push('LOCATION:' + escapeICSText(String(ev.location).slice(0, 500)));
    if (ev.notes) lines.push('DESCRIPTION:' + escapeICSText(String(ev.notes).slice(0, 8000)));
    if (ev.url) lines.push('URL:' + String(ev.url).replace(/[\r\n]/g, '').slice(0, 1000));
    const freq = String(ev.repeat || 'none').toLowerCase();
    if (['daily', 'weekly', 'monthly', 'yearly'].indexOf(freq) !== -1) {
        let rrule = 'FREQ=' + freq.toUpperCase();
        const interval = parseInt(ev.repeatInterval, 10);
        if (interval > 1) rrule += ';INTERVAL=' + Math.min(interval, 999);
        const count = parseInt(ev.repeatCount, 10);
        if (ev.repeatEnd === 'count' && count > 0) rrule += ';COUNT=' + Math.min(count, 9999);
        if (ev.repeatEnd === 'until' && validDate(ev.repeatUntil)) rrule += ';UNTIL=' + ev.repeatUntil.replace(/-/g, '') + 'T000000Z';
        lines.push('RRULE:' + rrule);
    }
    if (ev.alert && ev.alert !== 'none' && !isNaN(parseInt(ev.alert, 10))) {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:Erinnerung');
        lines.push('TRIGGER:-PT' + parseInt(ev.alert, 10) + 'M');
        lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
    const ics = lines.join('\r\n');
    if (ics.length > MAX_ICS) throw new Error("Der Termin ist zu lang (Notizen kürzen).");
    return ics;
}

// Calendar the signed-in profile may write to (otherwise an error)
function writableCalendar(e, calendarName) {
    const familyId = benutzerLib().familyOf(e);
    const rec = isPinnCalName(calendarName) ? calRecord(String(calendarName).slice(CAL_PREFIX.length)) : null;
    if (!rec || !canSee(rec, familyId, userIdOf(e))) throw new Error("Kalender wurde nicht gefunden.");
    if (isLinked(rec) && rec.getBool("nur_lesen")) throw new Error("Der Kalender „" + (rec.getString("name") || "Kalender") + "“ ist in " + kontenLib().label(rec.getString("quelle")) + " nur lesbar.");
    return rec;
}
// Event the signed-in profile may see (otherwise an error)
function accessibleTerm(e, href) {
    const familyId = benutzerLib().familyOf(e);
    let term = null;
    if (isPinnHref(href)) {
        try { term = $app.findRecordById(COL_TER, String(href).slice(HREF_PREFIX.length)); } catch (err) { term = null; }
    }
    if (!term || term.getString("familie") !== familyId) throw new Error("Termin wurde nicht gefunden.");
    const cal = calRecord(term.getString("kalender"));
    if (!cal || !canSee(cal, familyId, userIdOf(e))) throw new Error("Termin wurde nicht gefunden.");
    return { term: term, cal: cal };
}
function findTermInCal(calId, uid) {
    if (!uid) return null;
    try { return $app.findFirstRecordByFilter(COL_TER, "kalender = {:k} && uid = {:u}", { k: String(calId), u: String(uid) }); } catch (e) { return null; }
}

// Write an event into a calendar. term = existing record in THIS calendar (change) or
// null (new). Linked calendars: first create/change at iCloud/Google, then mirror here
// (the next sync fetches the final version from there).
function writeTerm(familyId, cal, uid, ev, term) {
    if (!term) {
        term = new Record(findCol(COL_TER));
        term.set("familie", familyId);
    }
    if (isLinked(cal)) {
        if (cal.getBool("nur_lesen")) throw new Error("Der Kalender „" + (cal.getString("name") || "Kalender") + "“ ist nur lesbar.");
        const t = linkedTarget(cal);
        const evx = Object.assign({}, ev, { calendarName: t.c.name });
        const ext = term.getString("extern");
        if (ext) {
            cs().updateEventAcrossAccounts(t.acc, t.acc, ext, uid, evx);
        } else {
            const r = cs().createEventInAccount(t.acc, t.c.name, Object.assign({}, evx, { clientUid: uid }));
            uid = r.uid;
            term.set("extern", hrefPath(cs().resourceUrlFor(t.acc, t.c, uid)));
        }
    } else {
        term.set("extern", "");
    }
    term.set("kalender", cal.id);
    term.set("uid", uid);
    term.set("ics", buildVEvent(uid, ev));
    $app.save(term);
    return term;
}

// Remove an event - for linked calendars also at iCloud/Google
function removeTerm(term, cal) {
    if (cal && isLinked(cal) && term.getString("extern")) {
        if (cal.getBool("nur_lesen")) throw new Error("Der Kalender „" + (cal.getString("name") || "Kalender") + "“ ist nur lesbar.");
        cs().deleteEventInAccount(linkedAccount(cal), term.getString("extern"));
    }
    $app.delete(term);
}

// New event in an own calendar. Returns { privat } - private events trigger no
// notices/pushes to the rest of the family.
function createEvent(e, ev) {
    const familyId = benutzerLib().familyOf(e);
    if (!familyId) throw new Error("Eigene Kalender gibt es nur für Profile einer Familie.");
    if (!ev || !ev.title || !ev.startDate || !ev.endDate) throw new Error("Titel, Start- und Enddatum sind erforderlich.");
    const cal = writableCalendar(e, ev.calendarName);
    const uid = newUid(ev);
    // Event queued offline that is sent again: update the same record
    writeTerm(familyId, cal, uid, ev, findTermInCal(cal.id, uid));
    return { privat: !cal.getBool("geteilt") };
}

// Change an existing event - also move between own (local and linked) calendars and the
// family calendars from iCloud/Google.
function updateEvent(e, href, uid, ev) {
    const familyId = benutzerLib().familyOf(e);
    if (!familyId) throw new Error("Eigene Kalender gibt es nur für Profile einer Familie.");
    const srcPinn = isPinnHref(href);
    const dstPinn = isPinnCalName(ev.calendarName);
    const calendarSync = cs();
    const partial = (err) => new Error("Verschieben nur teilweise gelungen: im neuen Kalender angelegt, aber die alte Version konnte nicht gelöscht werden (" + err.message + ").");

    if (srcPinn && dstPinn) {
        const src = accessibleTerm(e, href);
        const cal = writableCalendar(e, ev.calendarName);
        const u = cleanUid(src.term.getString("uid")) || newUid(ev);
        if (src.cal.id === cal.id) {
            writeTerm(familyId, cal, u, ev, src.term);
        } else if (!isLinked(src.cal) && !isLinked(cal)) {
            // between two calendars on this server: simply re-attach the record
            src.term.set("kalender", cal.id);
            src.term.set("ics", buildVEvent(u, ev));
            $app.save(src.term);
        } else {
            // iCloud/Google involved: create in the target, then remove the old version
            writeTerm(familyId, cal, u, ev, findTermInCal(cal.id, u));
            try { removeTerm(src.term, src.cal); } catch (err) { throw partial(err); }
        }
        return { privat: !cal.getBool("geteilt") };
    }
    if (srcPinn && !dstPinn) {
        // Own calendar -> family calendar (iCloud/Google): create there, then delete here
        const src = accessibleTerm(e, href);
        const u = cleanUid(src.term.getString("uid"));
        calendarSync.createEventForFamily(familyId, ev.calendarName, Object.assign({}, ev, { clientUid: u }));
        try { removeTerm(src.term, src.cal); } catch (err) { throw partial(err); }
        try { calendarSync.syncCalendarFileOnly(familyId); } catch (err) { /* next sync */ }
        return { privat: false };
    }
    if (!srcPinn && dstPinn) {
        // Family calendar -> own calendar: create here (same UID), then delete there
        const cal = writableCalendar(e, ev.calendarName);
        const u = cleanUid(uid) || newUid(ev);
        const rec = writeTerm(familyId, cal, u, ev, findTermInCal(cal.id, u));
        try {
            calendarSync.deleteEventForFamily(familyId, href);
        } catch (err) {
            try { removeTerm(rec, cal); } catch (e2) { /* ignore */ }
            throw new Error("Verschieben fehlgeschlagen: " + err.message);
        }
        try { calendarSync.syncCalendarFileOnly(familyId); } catch (err) { /* next sync */ }
        return { privat: !cal.getBool("geteilt") };
    }
    throw new Error("Kein eigener Kalender beteiligt.");
}

function deleteEvent(e, href) {
    const t = accessibleTerm(e, href);
    removeTerm(t.term, t.cal);
    return true;
}

function rawEvent(e, href) {
    const t = accessibleTerm(e, href);
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//pinn//DE\r\n" + t.term.getString("ics") + "\r\nEND:VCALENDAR\r\n";
}

// ---------------------------------------------------------------------------------------------
// Calendar file
// ---------------------------------------------------------------------------------------------
function blockWithMeta(term, cal, owner) {
    const head = 'BEGIN:VEVENT\r\nX-PINN-HREF:' + HREF_PREFIX + term.id + '\r\nX-PINN-CALNAME:' + CAL_PREFIX + cal.id
        + (owner ? '\r\nX-PINN-OWNER:' + owner : '');
    // A resource can have several VEVENT blocks (exceptions of a series) - mark each one
    return String(term.getString("ics") || "").split('BEGIN:VEVENT').join(head);
}
function termsOfFamily(familyId) {
    try { return $app.findRecordsByFilter(COL_TER, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { return []; }
}

// Lines for the signed-in profile's calendar file (calendar list + visible events)
function icsLinesFor(e) {
    const lib = benutzerLib();
    const familyId = lib.familyOf(e);
    if (!familyId || !ready()) return "";
    const userId = userIdOf(e);
    const cals = visibleCalendars(familyId, userId);
    if (!cals.length) return "";
    const isAdmin = lib.isAdmin(e), isGuest = lib.isGuest(e);
    const names = {};
    const byId = {};
    const out = [];
    cals.forEach(c => {
        byId[c.id] = c;
        out.push("X-PINN-KALENDER:" + JSON.stringify(calJson(c, userId, isAdmin, isGuest, names)));
    });
    termsOfFamily(familyId).forEach(t => {
        const cal = byId[t.getString("kalender")];
        if (cal && t.getString("ics")) out.push(blockWithMeta(t, cal, ""));
    });
    return out.join("\r\n");
}

// Extend the family's calendar file with the profile's own calendars
function mergeInto(text, e) {
    let extra = "";
    try { extra = icsLinesFor(e); } catch (err) { extra = ""; }
    if (!extra) return text;
    let t = String(text || "").replace(/END:VCALENDAR\s*$/, "");
    if (t.indexOf("BEGIN:VCALENDAR") === -1) t = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n";
    if (!/\n$/.test(t)) t += "\r\n";
    return t + extra + "\r\nEND:VCALENDAR\r\n";
}

// For push: all events of the family in own calendars; private ones with X-PINN-OWNER
function icsAllForFamily(familyId) {
    if (!familyId || !ready()) return "";
    let cals = [];
    try { cals = $app.findRecordsByFilter(COL_KAL, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { cals = []; }
    if (!cals.length) return "";
    const byId = {};
    cals.forEach(c => { byId[c.id] = c; });
    const out = [];
    termsOfFamily(familyId).forEach(t => {
        const cal = byId[t.getString("kalender")];
        if (!cal || !t.getString("ics")) return;
        out.push(blockWithMeta(t, cal, cal.getBool("geteilt") ? "" : (cal.getString("besitzer") || "-")));
    });
    return out.join("\r\n");
}

module.exports = {
    ensureSchema, ready, isPinnCalName, isPinnHref, listFor, saveCalendar, deleteCalendar, cleanupUser, cleanupFamily,
    createEvent, updateEvent, deleteEvent, rawEvent, mergeInto, icsAllForFamily, FARBEN,
    // personal accounts + linked calendars (iCloud/Google)
    accountStatus, connectApple, accountCalendars, startGoogle, disconnect, saveSelection, saveGoogleClient,
    syncLinkedCalendar, syncAllLinked, syncLinkedForUser, syncLinkedVisible,
};
