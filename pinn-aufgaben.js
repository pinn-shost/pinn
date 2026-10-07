// pb_hooks/pinn-aufgaben.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Aufgaben liegen jetzt direkt auf dem NAS in der PocketBase-Sammlung "aufgaben" - nicht mehr im
// Apple-Aufgaben-Kalender. Die bisherige Kalender-Variante ist in calendar-sync.js ausgeklammert
// (Suche nach "AUSGEKLAMMERT"), falls sie noch einmal gebraucht wird.
//
// Schonend für CPU und Speicher:
//  - kein iCloud-Zugriff: Anlegen, Abhaken, Bearbeiten und Löschen sind einzelne Datenbank-Zugriffe
//  - Haushalts-Aufgaben (Reinigung, Mülleimer, Abholtermine) werden nur einmal pro Stunde geprüft
//    (plus sofort, wenn eine Haushalts-Regel geändert wird)
//  - die Familiendaten werden nur neu gelesen, wenn sie sich geändert haben (Zwischenspeicher)
//  - der Kalender wird für die Abholtermin-Erkennung nur aus der ohnehin vorhandenen Datei gelesen
//    und nur dann zerlegt, wenn für morgen überhaupt etwas darin steht
//  - erledigte Aufgaben werden je nach Einstellung spätestens nach 2 Tagen gelöscht
//
// Felder der Sammlung "aufgaben":
//   titel, notizen (inkl. "Zugewiesen: ..."-Zeile wie bisher), faellig (JJJJ-MM-TT),
//   von/bis (HH:MM, leer = ganztägig), erledigt, erledigt_am (ISO-Zeit),
//   haushalt (Regel-Schlüssel bei automatisch erzeugten Aufgaben, sonst leer),
//   verpasst (wie oft die Haushalts-Aufgabe vorher nicht erledigt wurde),
//   familie (zu welcher Familie die Aufgabe gehört - jede Familie sieht nur ihre eigenen)
// Zugriff nur über die angemeldeten Routen in aufgaben.pb.js (Sammlungs-API gesperrt).

const AUFGABEN = "aufgaben";
const HOUR_MS = 3600000, DAY_MS = 86400000;
const FAMILY_CACHE_KEY = "pinnAufgabenFamilie:"; // + Familien-ID
const LOCK_KEY = "pinnAufgabenLock";

// --- Zeit (Mitteleuropa, feste EU-Sommerzeitregel - unabhängig von der Zeitzone des Containers) ---
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 2 * HOUR_MS : HOUR_MS;
}
function wallNow() { const n = Date.now(); return n + tzOffsetMs(n); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function wallIso(wall) { const d = new Date(wall); return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()); }
function isoToWall(iso) { const p = String(iso).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function isIsoDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function isTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || "")); }

// =============================================================================================
// Sammlung anlegen (beim Start, nur wenn sie fehlt)
// =============================================================================================
function familyCollection() {
    try { return $app.findCollectionByNameOrId("familien"); } catch (e) { return null; }
}

// Sammlung anlegen, falls sie fehlt. Das Feld "familie" bei bestehender Sammlung ergänzt
// pinn-benutzer.js. Angelegt wird im Format new Collection({...}) - das funktioniert in dieser
// PocketBase-Version zuverlässig.
function ensureSchema() {
    let col = null;
    try { col = $app.findCollectionByNameOrId(AUFGABEN); } catch (err) { col = null; }
    if (col) return;
    try {
        const fam = familyCollection();
        const fields = [
            { name: "titel", type: "text", required: true, max: 300 },
            { name: "notizen", type: "text", max: 5000 },
            { name: "faellig", type: "text", max: 10 },
            { name: "von", type: "text", max: 5 },
            { name: "bis", type: "text", max: 5 },
            { name: "erledigt", type: "bool" },
            { name: "erledigt_am", type: "text", max: 30 },
            { name: "haushalt", type: "text", max: 300 },
            { name: "verpasst", type: "number", onlyInt: true },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ];
        if (fam) fields.push({ name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false });
        // Nur über die geprüften Routen erreichbar
        $app.save(new Collection({
            type: "base",
            name: AUFGABEN,
            fields: fields,
            indexes: [
                "CREATE INDEX `idx_aufgaben_haushalt` ON `" + AUFGABEN + "` (`haushalt`)",
                "CREATE INDEX `idx_aufgaben_erledigt` ON `" + AUFGABEN + "` (`erledigt`, `erledigt_am`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Aufgaben] Sammlung \"" + AUFGABEN + "\" angelegt.");
    } catch (err) {
        console.log("[Aufgaben] Konnte Sammlung nicht anlegen: " + err.message);
    }
}

// =============================================================================================
// Lesen / Schreiben
// =============================================================================================
function toClient(r) {
    return {
        id: r.id,
        title: r.getString("titel"),
        notes: r.getString("notizen"),
        dueDate: r.getString("faellig"),
        fromTime: r.getString("von"),
        toTime: r.getString("bis"),
        done: r.getBool("erledigt"),
        doneAt: r.getString("erledigt_am"),
        household: r.getString("haushalt"),
        missed: r.getInt("verpasst"),
    };
}

function listAll(familyId) {
    if (!familyId) return [];
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { recs = []; }
    return recs.map(toClient);
}

// Aufgabe nur finden, wenn sie zur angegebenen Familie gehört
function findOwn(familyId, id) {
    const rec = $app.findRecordById(AUFGABEN, String(id || ""));
    if (!familyId || rec.getString("familie") !== familyId) throw new Error("Aufgabe nicht gefunden.");
    return rec;
}

// Legt eine Aufgabe an oder ändert sie. body: {id?, neu?, title, notes, dueDate, fromTime?, toTime?}
function saveTask(body, actorUserId, familyId) {
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    const title = String(body.title || "").trim().slice(0, 300);
    if (!title) throw new Error("Bitte einen Titel eingeben.");
    const dueDate = String(body.dueDate || "");
    if (!isIsoDate(dueDate)) throw new Error("Bitte ein Fälligkeitsdatum angeben.");
    const fromTime = isTime(body.fromTime) ? String(body.fromTime) : "";
    const toTime = isTime(body.toTime) ? String(body.toTime) : "";
    const hasWindow = !!(fromTime && toTime);
    const notes = String(body.notes || "").slice(0, 5000);

    // Neue Aufgaben können ihre Kennung schon von der App mitbringen (body.neu + body.id), damit sie
    // offline angelegt und später ohne Doppelte nachgetragen werden können: Gibt es die Aufgabe mit
    // dieser Kennung schon (z. B. weil die erste Übertragung ankam, die Antwort aber nicht), wird sie
    // nur aktualisiert.
    let rec = null;
    let previousNotes = "";
    let isUpdate = false;
    const clientId = String(body.id || "");
    if (clientId) {
        try { rec = findOwn(familyId, clientId); } catch (e) { rec = null; }
        if (rec) {
            isUpdate = true;
            previousNotes = rec.getString("notizen");
        } else if (!body.neu || !/^[a-z0-9]{15}$/.test(clientId)) {
            throw new Error("Aufgabe nicht gefunden.");
        }
    }
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(AUFGABEN));
        if (clientId) rec.set("id", clientId);
        rec.set("erledigt", false);
        rec.set("erledigt_am", "");
        rec.set("haushalt", "");
        rec.set("verpasst", 0);
        rec.set("familie", familyId);
    }
    rec.set("titel", title);
    rec.set("notizen", notes);
    rec.set("faellig", dueDate);
    rec.set("von", hasWindow ? fromTime : "");
    rec.set("bis", hasWindow ? toTime : "");
    $app.save(rec);

    try {
        require(`${__hooks}/pinn-push.js`).notifyAssignment({
            isTask: true,
            title: title,
            notes: notes,
            startDate: dueDate,
            allDay: !hasWindow,
            startTime: fromTime,
            uid: rec.id,
        }, actorUserId, isUpdate ? previousNotes : []);
    } catch (err) {
        console.log("[Push] " + err.message);
    }
    return toClient(rec);
}

// Abhaken / Häkchen entfernen. Beim Abhaken wird geprüft, ob die Person (Mitglied des angemeldeten
// Profils) damit alle Aufgaben erledigt hat, die bis jetzt fällig sind:
//  - fällig an einem früheren Tag oder heute
//  - heute mit Zeitfenster: nur, wenn das Zeitfenster schon begonnen hat
//  - der Person zugewiesen oder "Alle"
// Das Ergebnis geht sofort an die App (Animation). Die Benachrichtigungen (pinn-push.js) gehen erst
// 10 Sekunden später raus - wird das Häkchen vorher wieder entfernt, entfällt die Meldung.
// Wird eine Aufgabe später zurückgesetzt und erneut abgehakt, wird wieder benachrichtigt
// (die Sperre gegen Doppelmeldungen hängt am Abhak-Zeitpunkt "erledigt_am").
function setDone(familyId, id, done, actorUserId) {
    const rec = findOwn(familyId, id);
    rec.set("erledigt", !!done);
    rec.set("erledigt_am", done ? new Date().toISOString() : "");
    $app.save(rec);
    const out = toClient(rec);
    out.alleErledigt = false;
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (err) { push = null; }
    const key = "aufgabe:" + rec.id;
    if (!done) {
        // Noch nicht verschickte Meldung zu dieser Aufgabe verwerfen
        if (push) try { push.cancelDelayed(key); } catch (err) { /* egal */ }
        return out;
    }
    try {
        const ev = evaluateDone(familyId, rec, actorUserId, false);
        if (ev) out.alleErledigt = ev.own.allDone;
    } catch (err) {
        console.log("[Aufgaben] Prüfung \"alle erledigt\" fehlgeschlagen: " + err.message);
    }
    if (push) try {
        push.queueDelayed(key, {
            type: "aufgabe",
            familyId: familyId,
            taskId: rec.id,
            actorUserId: actorUserId || "",
            stamp: rec.getString("erledigt_am"),
        });
    } catch (err) {
        console.log("[Push] Meldung konnte nicht vorgemerkt werden: " + err.message);
    }
    return out;
}

// Wer hat abgehakt, gehört die Aufgabe ihm/ihr, sind damit alle fälligen Aufgaben erledigt
// und welche Kinder sind betroffen? withChildren = false spart die Kinder-Prüfung (nur für die App).
function evaluateDone(familyId, rec, actorUserId, withChildren) {
    const members = loadHouseholdData(familyId).members || [];
    if (!members.length) return null;
    const push = require(`${__hooks}/pinn-push.js`);
    let memberId = "";
    if (actorUserId) {
        try { memberId = $app.findRecordById("benutzer", actorUserId).getString("mitglied"); } catch (e) { memberId = ""; }
        if (!members.some(m => m.id === memberId)) memberId = "";
    }
    const assignOf = r => push.assigneesFromText(r.getString("notizen"), members);
    const assign = assignOf(rec);
    const assignedTo = mid => r => assignOf(r).memberIds.indexOf(mid) !== -1;

    // Abhakende Person
    const taskIsOwn = !!memberId && assign.memberIds.indexOf(memberId) !== -1;
    const own = taskIsOwn ? allDoneUntilNow(familyId, assignedTo(memberId)) : { allDone: false, signature: "" };

    // Kinder, denen die Aufgabe gehört: ausdrücklich zugewiesen - oder bei "Alle" das Kind,
    // das selbst abhakt
    const children = !withChildren ? [] : members.filter(m => push.isChildMember(m) && (
        (!assign.all && assign.memberIds.indexOf(m.id) !== -1) || (assign.all && m.id === memberId)
    )).map(m => {
        const c = m.id === memberId ? own : allDoneUntilNow(familyId, assignedTo(m.id));
        return { memberId: m.id, allDone: c.allDone, signature: c.signature };
    });
    return { members: members, memberId: memberId, taskIsOwn: taskIsOwn, own: own, children: children };
}

// Vorgemerkte Meldung nach Ablauf der 10 Sekunden verschicken (aufgerufen aus pinn-push.js).
// Nur, wenn die Aufgabe noch genau so abgehakt ist wie beim Vormerken.
function notifyDoneDelayed(entry) {
    let rec = null;
    try { rec = findOwn(entry.familyId, entry.taskId); } catch (e) { return false; }
    if (!rec.getBool("erledigt") || rec.getString("erledigt_am") !== entry.stamp) return false;
    const ev = evaluateDone(entry.familyId, rec, entry.actorUserId, true);
    if (!ev) return false;
    require(`${__hooks}/pinn-push.js`).notifyTaskDone({
        familyId: entry.familyId,
        members: ev.members,
        actorUserId: entry.actorUserId || "",
        actorMemberId: ev.memberId,
        task: { id: rec.id, title: rec.getString("titel"), stamp: entry.stamp },
        taskIsOwn: ev.taskIsOwn,
        allDone: ev.own.allDone,
        allSignature: ev.own.signature,
        children: ev.children,
    });
    return true;
}

// Sind alle bis jetzt fälligen Aufgaben dieser Person erledigt? (nur eine Datenbank-Abfrage)
function allDoneUntilNow(familyId, assigned) {
    const nowWall = wallNow();
    const todayIso = wallIso(nowWall);
    const d = new Date(nowWall);
    const hm = pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && faellig != '' && faellig <= {:d}", "", 0, 0, { f: familyId, d: todayIso }); } catch (e) { recs = []; }
    const ids = [];
    for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        const due = r.getString("faellig");
        if (!isIsoDate(due) || due > todayIso) continue;
        const from = r.getString("von");
        if (due === todayIso && from && from > hm) continue; // Zeitfenster hat noch nicht begonnen
        if (!assigned(r)) continue;
        if (!r.getBool("erledigt")) return { allDone: false, signature: "" };
        ids.push(r.id + "@" + r.getString("erledigt_am")); // neu abgehakt = neue Signatur = neue Meldung
    }
    ids.sort();
    return { allDone: ids.length > 0, signature: ids.join(",") };
}

// Mitglieder der Familie (aus dem Zwischenspeicher) - z. B. für die Kinderseiten-Benachrichtigung
function familyMembers(familyId) {
    if (!familyId) return [];
    return loadHouseholdData(familyId).members || [];
}

function removeTask(familyId, id) {
    try {
        $app.delete(findOwn(familyId, id));
    } catch (e) { /* schon weg */ }
    return true;
}

// Alle automatisch erzeugten Haushalts-Aufgaben löschen (selbst angelegte bleiben).
function deleteHouseholdTasks(familyId) {
    if (!familyId) return 0;
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt != ''", "", 0, 0, { f: familyId }); } catch (e) { recs = []; }
    let count = 0;
    recs.forEach(r => { try { $app.delete(r); count++; } catch (e) { /* egal */ } });
    return count;
}

// Die HEUTIGE Aufgabe einer Haushalts-Regel löschen (Regel geändert oder gelöscht).
function deleteTodayHouseholdTask(familyId, baseTitle) {
    const key = String(baseTitle || "");
    if (!key || !familyId) return false;
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt = {:k} && faellig = {:d}", "", 0, 0, { f: familyId, k: key, d: wallIso(wallNow()) }); } catch (e) { recs = []; }
    recs.forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
    return recs.length > 0;
}

// =============================================================================================
// Familiendaten (nur der Teil, den die Haushalts-Erkennung braucht) - je Familie zwischengespeichert,
// solange sich der Datensatz nicht ändert. Den Änderungszeitpunkt fragen wir direkt per SQL ab, ohne
// die (großen) Daten selbst zu laden.
// =============================================================================================
function loadHouseholdData(familyId) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const stamp = lib.familyDataStamp(familyId);
    const key = FAMILY_CACHE_KEY + familyId;
    if (stamp) {
        try {
            const cached = $app.store().get(key);
            if (cached && cached.stamp === stamp) return JSON.parse(cached.json);
        } catch (e) { /* ohne Zwischenspeicher weiter */ }
    }
    const data = lib.loadFamilyDataFor(familyId) || {};
    const sub = {
        rooms: data.rooms || [],
        roomSchedules: data.roomSchedules || [],
        trashBins: data.trashBins || [],
        cleaningCategories: data.cleaningCategories || [],
        members: data.members || [],
        doneTaskCleanupDays: data.doneTaskCleanupDays,
    };
    if (stamp) {
        try { $app.store().set(key, { stamp: stamp, json: JSON.stringify(sub) }); } catch (e) { /* egal */ }
    }
    return sub;
}

// =============================================================================================
// Haushalts-Aufgaben (gleiche Regeln wie bisher im Kalender)
// =============================================================================================
const WASTE_TYPES = [
    { id: 'restmuell', icon: '\ud83d\uddd1\ufe0f', taskLabel: 'Restmüll', keywords: ['restmüll', 'restabfall', 'restmülltonne', 'hausmüll'] },
    { id: 'biomuell', icon: '\ud83c\udf42', taskLabel: 'Biomüll', keywords: ['biomüll', 'bioabfall', 'biotonne'] },
    { id: 'papier', icon: '\ud83d\udce6', taskLabel: 'Papiermüll', keywords: ['papier', 'pappe', 'papiertonne'] },
    { id: 'gelbersack', icon: '\u267b\ufe0f', taskLabel: 'Gelber Sack', keywords: ['gelber sack', 'gelbe tonne', 'verpackung', 'wertstoff'] },
    { id: 'glas', icon: '\ud83c\udf7e', taskLabel: 'Altglas', keywords: ['glas', 'altglas'] },
];
const WEEKDAY_IDS = ["so", "mo", "di", "mi", "do", "fr", "sa"]; // Index = getUTCDay() der Wandzeit

function isScheduleDue(sched, todayIso, todayWeekday) {
    if (!sched) return false;
    if (sched.scheduleType === "weekdays") return (sched.weekdays || []).indexOf(todayWeekday) !== -1;
    if (sched.scheduleType === "interval" && sched.intervalDays) {
        const ref = isIsoDate(sched.createdDate) ? sched.createdDate : todayIso;
        const daysSince = Math.round((isoToWall(todayIso) - isoToWall(ref)) / DAY_MS);
        return daysSince >= 0 && daysSince % sched.intervalDays === 0;
    }
    return false;
}

function memberLabel(m) { return (m.displayMode === "role" && m.role) ? m.role : m.name; }
function buildAssignedNotes(ids, members) {
    const labels = (ids || []).map(id => {
        const m = (members || []).find(x => x.id === id);
        return m ? memberLabel(m) : null;
    }).filter(Boolean);
    return "Zugewiesen: " + (labels.length ? labels.join(", ") : "Alle");
}
function roomName(rooms, id) { const r = (rooms || []).find(x => x.id === id); return r ? r.name : "Unbekannt"; }
function binTitle(bin, rooms) {
    const wt = WASTE_TYPES.find(w => w.id === bin.wasteType);
    return (wt ? wt.icon : "\ud83d\uddd1\ufe0f") + " " + (wt ? wt.taskLabel : "Müll") + " rausbringen: " + roomName(rooms, bin.roomId);
}
function cleaningTitle(sched, rooms, categories) {
    const cat = (categories || []).find(c => c.id === sched.category);
    return (cat ? cat.label : "Reinigung") + ": " + roomName(rooms, sched.roomId);
}

// Müllarten, für die laut Kalenderdatei der Familie MORGEN eine Abholung ansteht. Liest nur die
// ohnehin vorhandene Datei (kein iCloud-Zugriff) und zerlegt sie nur, wenn das Datum überhaupt vorkommt.
function pickupTypesFor(dateIso, familyId) {
    const found = {};
    let text = "";
    try {
        text = require(`${__hooks}/calendar-sync.js`).readCalendarText(familyId);
    } catch (e) { return found; }
    if (!text) return found;
    const digits = dateIso.replace(/-/g, "");
    if (text.indexOf(digits) === -1) return found;
    const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    blocks.forEach(raw => {
        if (raw.indexOf(digits) === -1) return;
        const block = raw.replace(/\r?\n[ \t]/g, "");
        if (/(^|\n)RRULE[:;]/.test(block)) return; // wiederkehrende Termine wie bisher nicht berücksichtigen
        const start = block.match(/(?:^|\n)DTSTART[^:\n]*:(\d{8})/);
        if (!start || start[1] !== digits) return;
        const sum = block.match(/(?:^|\n)SUMMARY[^:\n]*:([^\r\n]*)/);
        const title = sum ? sum[1].toLowerCase() : "";
        if (!title) return;
        WASTE_TYPES.forEach(wt => {
            if (wt.keywords.some(kw => title.indexOf(kw) !== -1)) found[wt.id] = true;
        });
    });
    return found;
}

// Genau EINE Aufgabe pro Regel und Zyklus. Wurde die vorige bis zur Frist (Fälligkeitstag + 1 Tag,
// 4 Uhr morgens) nicht erledigt, wird sie ersetzt und der Zähler "verpasst" erhöht.
function processRule(byKey, key, notes, todayIso, nowWall, col, familyId) {
    const list = byKey[key] || [];
    if (list.some(r => r.getString("faellig") === todayIso)) return 0;
    const last = list[0]; // absteigend nach Fälligkeit sortiert
    let missed = 0;
    if (last && !last.getBool("erledigt")) {
        const lastDue = last.getString("faellig");
        if (isIsoDate(lastDue) && nowWall < isoToWall(lastDue) + DAY_MS + 4 * HOUR_MS) return 0; // Frist läuft noch
        missed = last.getInt("verpasst") + 1;
        try { $app.delete(last); } catch (e) { /* egal */ }
    }
    const rec = new Record(col);
    rec.set("titel", key);
    rec.set("notizen", notes || "");
    rec.set("faellig", todayIso);
    rec.set("von", "");
    rec.set("bis", "");
    rec.set("erledigt", false);
    rec.set("erledigt_am", "");
    rec.set("haushalt", key);
    rec.set("verpasst", missed);
    rec.set("familie", familyId);
    $app.save(rec);
    byKey[key] = [rec].concat(list);
    console.log("[Haushalt-Aufgabe] Angelegt: " + key + (missed ? " (" + missed + "x nicht erledigt)" : ""));
    return 1;
}

function runHousehold(familyId, data) {
    if (!familyId) return 0;
    const nowWall = wallNow();
    const todayIso = wallIso(nowWall);
    const tomorrowIso = wallIso(nowWall + DAY_MS);
    const weekday = WEEKDAY_IDS[new Date(nowWall).getUTCDay()];

    // Fällige Regeln sammeln (Schlüssel = Aufgabentitel wie bisher)
    const rules = [];
    const seen = {};
    const add = (key, ids) => {
        if (seen[key]) return;
        seen[key] = true;
        rules.push({ key: key, notes: buildAssignedNotes(ids, data.members) });
    };
    (data.roomSchedules || []).forEach(s => {
        if (isScheduleDue(s, todayIso, weekday)) add(cleaningTitle(s, data.rooms, data.cleaningCategories), s.assignedMemberIds);
    });
    const bins = data.trashBins || [];
    bins.forEach(b => {
        if (b.schedule && isScheduleDue(b.schedule, todayIso, weekday)) add(binTitle(b, data.rooms), b.assignedMemberIds);
    });
    // Abholtermine stehen im Apple-Kalender der jeweiligen Familie (eigene Kalenderdatei)
    if (bins.length) {
        const pickups = pickupTypesFor(tomorrowIso, familyId);
        bins.forEach(b => { if (pickups[b.wasteType]) add(binTitle(b, data.rooms), b.assignedMemberIds); });
    }
    if (!rules.length) return 0;

    let existing = [];
    try { existing = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt != ''", "-faellig", 0, 0, { f: familyId }); } catch (e) { existing = []; }
    const byKey = {};
    existing.forEach(r => { const k = r.getString("haushalt"); (byKey[k] = byKey[k] || []).push(r); });

    const col = $app.findCollectionByNameOrId(AUFGABEN);
    let created = 0;
    rules.forEach(rule => {
        try { created += processRule(byKey, rule.key, rule.notes, todayIso, nowWall, col, familyId); }
        catch (e) { console.log("[Haushalt-Aufgabe] Fehler bei \"" + rule.key + "\": " + e.message); }
    });
    return created;
}

// Erledigte Aufgaben löschen: 0 = sofort, 1 oder 2 Tage nach dem Abhaken (Standard 2).
// Haushalts-Aufgaben von heute bleiben bis morgen stehen - daran erkennt die Erkennung, dass die
// heutige Aufgabe schon erledigt ist (sonst würde sie sofort neu angelegt).
function cleanupDone(familyId, days) {
    const d = (days === 0 || days === 1 || days === 2) ? days : 2;
    const cutoff = new Date(Date.now() - d * DAY_MS).toISOString();
    const todayIso = wallIso(wallNow());
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && erledigt = true && erledigt_am != '' && erledigt_am <= {:c}", "", 500, 0, { f: familyId, c: cutoff }); } catch (e) { recs = []; }
    let count = 0;
    recs.forEach(r => {
        if (r.getString("haushalt") && r.getString("faellig") >= todayIso) return;
        try { $app.delete(r); count++; } catch (e) { /* egal */ }
    });
    if (count) console.log("[Aufgaben-Aufraeumen] " + count + " erledigte Aufgabe(n) gelöscht.");
    return count;
}

// Verhindert, dass stündlicher Lauf und ein Sofort-Lauf aus der App gleichzeitig Aufgaben für
// DIESELBE Familie anlegen. Die Sperre gilt je Familie - ein Lauf bei Familie A blockiert Familie B nicht.
function lockKey(familyId) {
    return LOCK_KEY + ":" + String(familyId || "");
}
function withLock(familyId, fn) {
    const store = $app.store();
    const key = lockKey(familyId);
    let t = null;
    try { t = store.get(key); } catch (e) { t = null; }
    if (typeof t === "number" && Date.now() - t < 60000) return null;
    try { store.set(key, Date.now()); } catch (e) { /* egal */ }
    try { return fn(); }
    finally { try { store.remove(key); } catch (e) { /* egal */ } }
}

// Stündlicher Lauf: für jede Familie Haushalts-Aufgaben prüfen + erledigte aufräumen.
// Jede Familie bekommt ihre eigene Sperre; ist eine Familie gerade durch einen Sofort-Lauf belegt,
// wird nur sie in diesem Durchlauf übersprungen (der nächste stündliche Lauf holt es nach).
function runCron() {
    let families = [];
    try { families = $app.findRecordsByFilter("familien", "", "created", 0, 0); } catch (e) { families = []; }
    let created = 0, removed = 0;
    families.forEach(f => {
        try {
            const r = withLock(f.id, () => {
                const data = loadHouseholdData(f.id);
                return { created: runHousehold(f.id, data), removed: cleanupDone(f.id, data.doneTaskCleanupDays) };
            });
            if (r) {
                created += r.created;
                removed += r.removed;
            }
        } catch (e) {
            console.log("[Aufgaben] Fehler bei Familie \"" + f.getString("name") + "\": " + e.message);
        }
    });
    // Ältere Aufgaben ohne Familie (sollten nach dem Umzug nicht mehr vorkommen) aufräumen
    try {
        $app.findRecordsByFilter(AUFGABEN, "familie = '' && erledigt = true", "", 200, 0).forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
    } catch (e) { /* egal */ }
    return { created: created, removed: removed };
}

// Sofort-Lauf aus der App (nach Änderung einer Haushalts-Regel / "Jetzt neu generieren").
function runHouseholdNow(familyId) {
    const r = withLock(familyId, () => ({ created: runHousehold(familyId, loadHouseholdData(familyId)) }));
    return r || { created: 0, busy: true };
}

module.exports = {
    AUFGABEN, ensureSchema, listAll, saveTask, setDone, notifyDoneDelayed, removeTask, familyMembers,
    deleteHouseholdTasks, deleteTodayHouseholdTask, runCron, runHouseholdNow,
};
