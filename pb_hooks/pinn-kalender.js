// pb_hooks/pinn-kalender.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Kalender je Profil (Einstellungen → Kalender → Kalender hinzufügen)
//
// - Jedes Profil einer Familie (außer Gästen) meldet sich mit SEINEM iCloud- oder Google-Konto an und
//   hakt die Kalender daraus in zwei Spalten an:
//     geteilt = false  „Für mich“ – nur dieses Profil sieht den Kalender und seine Termine
//     geteilt = true   „Familie“  – alle Profile der Familie (auch Gäste) sehen und nutzen ihn; die
//                      übrigen sehen in den Einstellungen nur einen Hinweis mit unkenntlich gemachtem
//                      Konto (z. B. m**l@g***l.com)
//   (saveSelection). Kalender ohne Konto (Termine nur auf dem pinn.-Server) gibt es weiterhin.
//   Die früheren Familienkalender aus iCloud/Google (calendar-sync.js) laufen unverändert weiter.
// - Die Termine liegen auf diesem Server. In der App heißen die Kalender „pinn:<id>“ (X-PINN-CALNAME),
//   ihre Termine „pinn-termin:<id>“ (X-PINN-HREF).
// - Kalender aus dem PERSÖNLICHEN iCloud- oder Google-Konto des Profils sind verknüpft
//   (quelle = "apple" | "google", Konten: pinn-kalender-konten.js).
//   Dann ist iCloud/Google der Speicherort: Anlegen, Ändern und Löschen gehen direkt dorthin, und alle
//   15 Minuten (bzw. bei „Jetzt aktualisieren“) holt syncLinkedCalendar() den Stand von dort und
//   spiegelt ihn in „kalender_termine“ (Feld extern = Adresse der Ressource bei iCloud/Google). So
//   funktionieren Kalenderdatei, Offline-Anzeige, Verschieben und Push für diese Termine genau wie bei
//   allen anderen eigenen Kalendern. „Entfernen“ bzw. Haken raus löscht nur die Verknüpfung in pinn.,
//   nie den Kalender in iCloud/Google. Termine in Familien-Kalendern eines Kontos legt pinn. über das
//   Konto des Besitzers an.
// - GET /api/pinn/kalender (benutzer.pb.js) hängt an die Kalenderdatei der Familie die Termine an,
//   die das angemeldete Profil sehen darf, und davor je Kalender eine Zeile
//   X-PINN-KALENDER:{"id","name","farbe","geteilt","mein","von","darf"} – so kommt die Liste mit
//   derselben Anfrage und steht auch offline (zwischengespeicherte Kalenderdatei) zur Verfügung.
// - Anlegen/Ändern/Löschen/Rohtext von Terminen laufen über die bekannten Routen
//   (create_/update_/delete_calendar_event.pb.js, get_calendar_event_raw.pb.js), die bei „pinn:“-
//   Kalendern bzw. „pinn-termin:“-Adressen hierher verzweigen. Verschieben zwischen iCloud/Google und
//   eigenen Kalendern geht in beide Richtungen.
// - Push (pinn-push.js) liest über icsAllForFamily() alle Termine der Familie; private tragen
//   X-PINN-OWNER und gehen nur an ihr Profil.
//
// Sammlungen (gesperrt, nur über die Routen):
//   kalender_eigene:  familie, besitzer (Profil-ID), name, farbe, geteilt,
//                     quelle ("" | "apple" | "google"), extern (Kalender-Adresse), extern_name, nur_lesen
//   kalender_termine: familie, kalender (ID aus kalender_eigene), uid, ics (nur VEVENT-Blöcke),
//                     extern (Adresse der Termin-Ressource bei iCloud/Google, nur bei verknüpften Kalendern)

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
function setSyncError(calId, msg) { try { $app.store().set(syncErrKey(calId), String(msg || "")); } catch (e) { /* egal */ } }
function clearSyncError(calId) { try { $app.store().remove(syncErrKey(calId)); } catch (e) { /* egal */ } }
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
    // Felder für verknüpfte Kalender (iCloud/Google) in bestehenden Sammlungen ergänzen
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
// Kalender: Sichtbarkeit und Rechte
// ---------------------------------------------------------------------------------------------
function calRecord(id) {
    if (!ID_RE.test(String(id || ""))) return null;
    try { return $app.findRecordById(COL_KAL, String(id)); } catch (e) { return null; }
}
function canSee(rec, familyId, userId) {
    if (!rec || !familyId || rec.getString("familie") !== familyId) return false;
    return rec.getBool("geteilt") || (!!userId && rec.getString("besitzer") === userId);
}
// Ändern/Löschen: der Besitzer immer; geteilte Kalender zusätzlich die Admins der Familie
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

// Kalender im persönlichen Konto suchen (über seine Adresse)
function findExternCal(acc, href) {
    const want = cs().normUrl(href);
    return (acc.calendars || []).find(c => cs().normUrl(c.href) === want) || null;
}

// Kalender anlegen oder ändern: { id?, name, farbe, geteilt?, quelle?, extern? }
// quelle/extern nur beim Anlegen: verknüpft den neuen Kalender mit einem Kalender aus dem persönlichen
// iCloud- (quelle "apple") oder Google-Konto (quelle "google"). Beim Ändern bleibt „geteilt“, wenn es
// nicht mitgeschickt wird.
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
        // Nur der Besitzer entscheidet, ob ein Kalender „Für mich“ oder „Familie“ ist
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
        // Termine gleich holen, damit der Kalender nicht bis zum nächsten Abgleich leer ist
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

// Auswahl aus einem Konto übernehmen (Häkchen „Für mich“ / „Familie“):
//   { art: "apple"|"google", auswahl: [{ href, ziel: "ich" | "familie" | "" }] }
// Neu angehakt -> Kalender verknüpfen (Name aus dem Konto, freie Farbe) und Termine gleich holen;
// Spalte gewechselt -> nur „geteilt“ umstellen; Haken raus -> Verknüpfung in pinn. entfernen (im Konto
// bleibt alles). Kalender, die in der Auswahl nicht vorkommen, bleiben unverändert.
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
            if (rec) { try { removeCalendarWithEvents(rec); removed++; } catch (err) { /* nächstes Mal */ } }
            return;
        }
        const geteilt = ziel === "familie";
        if (rec) {
            if (rec.getBool("geteilt") !== geteilt) { rec.set("geteilt", geteilt); $app.save(rec); changed++; }
            return;
        }
        const ext = findExternCal(acc, href);
        if (!ext) return; // nicht (mehr) im Konto
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
    // Termine der neuen Kalender gleich holen, damit sie nicht bis zum nächsten Abgleich leer sind
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

// Kalender mit allen seinen Terminen löschen. Bei verknüpften Kalendern nur die Verknüpfung in pinn. –
// der Kalender und seine Termine in iCloud/Google bleiben unangetastet.
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
    terms.forEach(t => { try { $app.delete(t); } catch (e) { /* nächstes Mal */ } });
    clearSyncError(rec.id);
    $app.delete(rec);
}

// Aufräumen: Profil gelöscht -> seine privaten Kalender (geteilte bleiben der Familie erhalten) und
// seine persönlichen Konten
function cleanupUser(userId) {
    if (!userId) return;
    if (ready()) {
        let recs = [];
        // private Kalender und alle mit einem Konto des Profils verknüpften (das Konto geht mit)
        try { recs = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && (geteilt = false || quelle = 'apple' || quelle = 'google')", "", 0, 0, { u: String(userId) }); } catch (e) { recs = []; }
        recs.forEach(r => { try { removeCalendarWithEvents(r); } catch (e) { /* egal */ } });
    }
    try { kontenLib().removeAll(userId); } catch (e) { /* schon mit dem Profil gelöscht */ }
}
// Familie gelöscht -> alles dieser Familie
function cleanupFamily(familyId) {
    if (!familyId || !ready()) return;
    [COL_TER, COL_KAL].forEach(col => {
        let recs = [];
        try { recs = $app.findRecordsByFilter(col, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { recs = []; }
        recs.forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
    });
}

// ---------------------------------------------------------------------------------------------
// Persönliche Konten (iCloud/Google) – Routen der Einstellungen
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
    // Google-Zugang (OAuth-Client) in der App hinterlegen dürfen Admins – nur wenn er nicht in der .env steht
    st.google.einrichtbar = st.google.client !== "env" && benutzerLib().isAdmin(e);
    return st;
}
// OAuth-Client von Google in der App hinterlegen (Admins; nur wenn er nicht in der .env steht)
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
    // Bereits verknüpfte iCloud-Kalender gleich wieder abgleichen (z. B. nach neuem Passwort)
    try { syncLinkedForUser(p.userId, "apple"); } catch (err) { /* nächster Abgleich */ }
    let extern = [];
    try { extern = accountCalendars(e, { art: "apple" }).extern; } catch (err) { extern = []; }
    return { konten: accountStatus(e, body.origin), extern: extern };
}
function accountCalendars(e, body) {
    const p = requireOwnProfile(e);
    const art = String(body.art || "");
    const konten = kontenLib();
    if (!konten.validArt(art)) throw new Error("Unbekannte Kontoart.");
    // Je Kalender: aktuelle Auswahl („ich“ / „familie“ / „“) aus den verknüpften Kalendern des Profils
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
// Konto trennen: verknüpfte Kalender dieses Kontos verschwinden aus pinn. (in iCloud/Google bleiben sie)
function disconnect(e, body) {
    const p = requireOwnProfile(e);
    const art = String(body.art || "");
    const konten = kontenLib();
    if (!konten.validArt(art)) throw new Error("Unbekannte Kontoart.");
    if (ready()) {
        let recs = [];
        try { recs = $app.findRecordsByFilter(COL_KAL, "besitzer = {:u} && quelle = {:q}", "", 0, 0, { u: p.userId, q: art }); } catch (err) { recs = []; }
        recs.forEach(r => { try { removeCalendarWithEvents(r); } catch (err) { /* egal */ } });
    }
    konten.remove(p.userId, art);
    console.log("[Kalender-Konten] " + konten.label(art) + "-Konto von Profil " + p.userId + " getrennt.");
    return { konten: accountStatus(e, body.origin), kalender: listFor(e) };
}

// ---------------------------------------------------------------------------------------------
// Abgleich verknüpfter Kalender (iCloud/Google -> Spiegelung in kalender_termine)
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

// Einen verknüpften Kalender abgleichen. Rückgabe: Anzahl Termine. Wirft bei Fehlern (der bisherige
// Stand bleibt dann stehen, statt Termine zu verlieren).
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
        // Name/Schreibrecht bei iCloud/Google geändert? Mitziehen.
        const extName = cleanText(kontenLib().displayName(t.acc, t.c.name), 200);
        const ro = t.acc.kind === "google" && t.c.writable === false;
        if (extName !== cal.getString("extern_name") || ro !== cal.getBool("nur_lesen")) {
            cal.set("extern_name", extName);
            cal.set("nur_lesen", ro);
            try { $app.save(cal); } catch (err) { /* nächstes Mal */ }
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
            if (ics.length > MAX_ICS) return; // zu groß – bisherigen Stand (falls vorhanden) behalten
            count++;
            let rec = byExt[key];
            if (rec && rec.getString("ics") === ics) return; // unverändert
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
        // Bei iCloud/Google gelöscht -> hier auch (Termine ohne extern sind noch nicht hochgeladen: bleiben)
        existing.forEach(r => {
            const k = cs().normUrl(r.getString("extern"));
            if (k && !seen[k]) { try { $app.delete(r); } catch (err) { /* nächstes Mal */ } }
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
// Admin-Fehlerprotokoll (pinn-protokoll.js) – fehlt die Datei, bleibt es beim Docker-Log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* Protokoll nicht verfügbar */ }
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
// Cron: alle verknüpften Kalender aller Familien
function syncAllLinked() {
    syncList(linkedCalendars("quelle = 'apple' || quelle = 'google'"));
}
// „Jetzt aktualisieren“: die verknüpften Kalender, die ein Profil sieht (eigene + Familien-Kalender anderer)
function syncLinkedVisible(familyId, userId) {
    if (!familyId) { syncLinkedForUser(userId); return; }
    syncList(linkedCalendars("familie = {:f} && (quelle = 'apple' || quelle = 'google') && (geteilt = true || besitzer = {:u})",
        { f: String(familyId), u: String(userId || "-") }));
}
// Nach (Neu-)Verbinden: die verknüpften Kalender eines Profils
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
function newUid(ev) {
    const clientUid = (ev && typeof ev.clientUid === 'string') ? ev.clientUid : '';
    return /^pinn-[A-Za-z0-9-]{4,80}$/.test(clientUid)
        ? clientUid
        : 'pinn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}
function cleanUid(uid) {
    const s = String(uid || "").replace(/[\r\n]/g, "").trim();
    return s && s.length <= 190 ? s : "";
}
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function validTime(s) { return /^\d{2}:\d{2}$/.test(String(s || "")); }

// VEVENT-Block wie in calendar-sync.js (buildVEventICS) – „floating“ lokale Zeit, ganztägig mit
// exklusivem DTEND, Wiederholung und Erinnerung.
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

// Kalender, in den das angemeldete Profil schreiben darf (sonst Fehler)
function writableCalendar(e, calendarName) {
    const familyId = benutzerLib().familyOf(e);
    const rec = isPinnCalName(calendarName) ? calRecord(String(calendarName).slice(CAL_PREFIX.length)) : null;
    if (!rec || !canSee(rec, familyId, userIdOf(e))) throw new Error("Kalender wurde nicht gefunden.");
    if (isLinked(rec) && rec.getBool("nur_lesen")) throw new Error("Der Kalender „" + (rec.getString("name") || "Kalender") + "“ ist in " + kontenLib().label(rec.getString("quelle")) + " nur lesbar.");
    return rec;
}
// Termin, den das angemeldete Profil sehen darf (sonst Fehler)
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

// Termin in einen Kalender schreiben. term = vorhandener Datensatz in DIESEM Kalender (ändern) oder
// null (neu). Verknüpfte Kalender: zuerst bei iCloud/Google anlegen bzw. ändern, dann hier spiegeln
// (der nächste Abgleich holt dort die endgültige Fassung).
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

// Termin entfernen – bei verknüpften Kalendern auch bei iCloud/Google
function removeTerm(term, cal) {
    if (cal && isLinked(cal) && term.getString("extern")) {
        if (cal.getBool("nur_lesen")) throw new Error("Der Kalender „" + (cal.getString("name") || "Kalender") + "“ ist nur lesbar.");
        cs().deleteEventInAccount(linkedAccount(cal), term.getString("extern"));
    }
    $app.delete(term);
}

// Neuer Termin in einem eigenen Kalender. Rückgabe { privat } – private Termine lösen keine
// Hinweise/Pushs an die übrige Familie aus.
function createEvent(e, ev) {
    const familyId = benutzerLib().familyOf(e);
    if (!familyId) throw new Error("Eigene Kalender gibt es nur für Profile einer Familie.");
    if (!ev || !ev.title || !ev.startDate || !ev.endDate) throw new Error("Titel, Start- und Enddatum sind erforderlich.");
    const cal = writableCalendar(e, ev.calendarName);
    const uid = newUid(ev);
    // Offline vorgemerkter Termin, der erneut gesendet wird: denselben Datensatz aktualisieren
    writeTerm(familyId, cal, uid, ev, findTermInCal(cal.id, uid));
    return { privat: !cal.getBool("geteilt") };
}

// Bestehenden Termin ändern – auch zwischen eigenen (lokalen und verknüpften) Kalendern und den
// Familienkalendern aus iCloud/Google verschieben.
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
            // zwischen zwei Kalendern auf diesem Server: Datensatz einfach umhängen
            src.term.set("kalender", cal.id);
            src.term.set("ics", buildVEvent(u, ev));
            $app.save(src.term);
        } else {
            // iCloud/Google beteiligt: im Ziel anlegen, dann die alte Fassung entfernen
            writeTerm(familyId, cal, u, ev, findTermInCal(cal.id, u));
            try { removeTerm(src.term, src.cal); } catch (err) { throw partial(err); }
        }
        return { privat: !cal.getBool("geteilt") };
    }
    if (srcPinn && !dstPinn) {
        // Eigener Kalender -> Familienkalender (iCloud/Google): dort anlegen, dann hier löschen
        const src = accessibleTerm(e, href);
        const u = cleanUid(src.term.getString("uid"));
        calendarSync.createEventForFamily(familyId, ev.calendarName, Object.assign({}, ev, { clientUid: u }));
        try { removeTerm(src.term, src.cal); } catch (err) { throw partial(err); }
        try { calendarSync.syncCalendarFileOnly(familyId); } catch (err) { /* nächster Sync */ }
        return { privat: false };
    }
    if (!srcPinn && dstPinn) {
        // Familienkalender -> eigener Kalender: hier anlegen (gleiche UID), dann dort löschen
        const cal = writableCalendar(e, ev.calendarName);
        const u = cleanUid(uid) || newUid(ev);
        const rec = writeTerm(familyId, cal, u, ev, findTermInCal(cal.id, u));
        try {
            calendarSync.deleteEventForFamily(familyId, href);
        } catch (err) {
            try { removeTerm(rec, cal); } catch (e2) { /* egal */ }
            throw new Error("Verschieben fehlgeschlagen: " + err.message);
        }
        try { calendarSync.syncCalendarFileOnly(familyId); } catch (err) { /* nächster Sync */ }
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
// Kalenderdatei
// ---------------------------------------------------------------------------------------------
function blockWithMeta(term, cal, owner) {
    const head = 'BEGIN:VEVENT\r\nX-PINN-HREF:' + HREF_PREFIX + term.id + '\r\nX-PINN-CALNAME:' + CAL_PREFIX + cal.id
        + (owner ? '\r\nX-PINN-OWNER:' + owner : '');
    // Eine Ressource kann mehrere VEVENT-Blöcke haben (Ausnahmen einer Serie) – jeden kennzeichnen
    return String(term.getString("ics") || "").split('BEGIN:VEVENT').join(head);
}
function termsOfFamily(familyId) {
    try { return $app.findRecordsByFilter(COL_TER, "familie = {:f}", "", 0, 0, { f: String(familyId) }); } catch (e) { return []; }
}

// Zeilen für die Kalenderdatei des angemeldeten Profils (Kalenderliste + sichtbare Termine)
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

// Kalenderdatei der Familie um die eigenen Kalender des Profils ergänzen
function mergeInto(text, e) {
    let extra = "";
    try { extra = icsLinesFor(e); } catch (err) { extra = ""; }
    if (!extra) return text;
    let t = String(text || "").replace(/END:VCALENDAR\s*$/, "");
    if (t.indexOf("BEGIN:VCALENDAR") === -1) t = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n";
    if (!/\n$/.test(t)) t += "\r\n";
    return t + extra + "\r\nEND:VCALENDAR\r\n";
}

// Für Push: alle Termine der Familie in eigenen Kalendern; private mit X-PINN-OWNER
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
    // persönliche Konten + verknüpfte Kalender (iCloud/Google)
    accountStatus, connectApple, accountCalendars, startGoogle, disconnect, saveSelection, saveGoogleClient,
    syncLinkedCalendar, syncAllLinked, syncLinkedForUser, syncLinkedVisible,
};
