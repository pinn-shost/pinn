// pb_hooks/pinn-aufgaben.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Tasks now live directly on the NAS in the PocketBase collection "aufgaben" - no longer in the
// Apple tasks calendar. The former calendar variant is commented out in calendar-sync.js
// (search for "AUSGEKLAMMERT") in case it is needed once more.
//
// Gentle on CPU and memory:
//  - no iCloud access: creating, ticking off, editing and deleting are single database accesses
//  - household tasks (cleaning, trash bin, collection dates) are only checked once per hour
//    (plus immediately when a household rule is changed)
//  - the family data is only re-read when it has changed (cache)
//  - for the collection date detection, the calendar is only read from the file that exists anyway
//    and only parsed if there is anything in it for tomorrow
//  - completed tasks are deleted after 2 days at the latest, depending on the setting
//
// Fields of the collection "aufgaben":
//   titel, notizen (incl. "Zugewiesen: ..." line as before), faellig (YYYY-MM-DD),
//   von/bis (HH:MM, empty = all day), erledigt, erledigt_am (ISO time),
//   haushalt (rule key for automatically generated tasks, otherwise empty),
//   verpasst (how often the household task was not completed before),
//   familie (which family the task belongs to - each family only sees its own)
// Access only via the signed-in routes in aufgaben.pb.js (collection API locked).
//
// Rotation & statistics (since 1.26): collection "haushalt_verlauf" - one small entry per generated household task
// (regel, titel, aufgabe, faellig, zustaendig, erledigt_von, status: offen|erledigt|verpasst).
// It stays even if the task itself is deleted after ticking off (entries older than 400 days
// are cleared away by the hourly run). From it result:
//  - Rotation (rule with rotate = 'reihum' | 'fair' and at least two responsible people): each new task
//    goes to exactly one person - in turn, or to whoever has completed the least
//    in the last 30 days. If the previous task was missed, the same person stays responsible.
//  - Statistics "Who does how much?" (GET /api/pinn/aufgaben/statistik).
//
// Maintenance plan (since 1.28, menu "House"): familien_daten → houseMaintenance
//   [{ id, title, icon, months, next ('YYYY-MM-DD', next due date set by hand), nextSet (when it was set),
//      last (last completed, maintained by the app), lead (create this many days beforehand), assignedMemberIds, rotate, active }]
//   Unlike cleaning/waste: the task stays open until it is completed (no "missed"). The next
//   due date counts from the completion day (+ interval in months). History entries with rule "w:<ID>";
//   if a maintenance task is deleted, it counts as skipped (status "uebersprungen") - it then
//   only comes back in the next cycle.
//
// Waste collection (since 1.31): collection dates come from the family's waste calendar (pinn-muell.js) AND as
// before from the calendar file. For every bin whose waste type is collected tomorrow, the task
// "... take out" is created today (on the day before). Once the collection is over (collection day from 12 o'clock), the still
// open task is ticked off automatically - it then does not count as missed (in the history: completed by the
// responsible person). The reminder on the day before is sent by pinn-push.js (muellInfo).
//
// Extra reminder (since 1.57): field "erinnerung" (HH:MM, empty = off). On the due date,
// pinn-push.js (runTaskReminders) sends a push to the responsible people at this time. Automatically generated
// tasks take over the time from their rule when created (remindAt for cleaning, trash bin and
// maintenance); vehicle tasks bring it along from the app. After that it can be changed per task.

const AUFGABEN = "aufgaben";
const HOUR_MS = 3600000, DAY_MS = 86400000;
const FAMILY_CACHE_KEY = "pinnAufgabenFamilie:"; // + family ID
const LOCK_KEY = "pinnAufgabenLock";
const VERLAUF = "haushalt_verlauf";

// --- Time (Central Europe, fixed EU daylight saving rule - independent of the container's time zone) ---
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
// Create the collection (on start, only if it is missing)
// =============================================================================================
function familyCollection() {
    try { return $app.findCollectionByNameOrId("familien"); } catch (e) { return null; }
}

// Create the collection if it is missing. The field "familie" on an existing collection is added by
// pinn-benutzer.js. It is created in the format new Collection({...}) - this works reliably in this
// PocketBase version.
function ensureSchema() {
    ensureVerlauf();
    let col = null;
    try { col = $app.findCollectionByNameOrId(AUFGABEN); } catch (err) { col = null; }
    if (col) { ensureReminderField(col); return; }
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
            { name: "erinnerung", type: "text", max: 5 },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ];
        if (fam) fields.push({ name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false });
        // Reachable only via the checked routes
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

// Add the field "erinnerung" (since 1.57) to an already existing collection
function ensureReminderField(col) {
    try {
        try { if (col.fields.getByName("erinnerung")) return; } catch (e) { /* missing */ }
        let field = null;
        try { if (typeof TextField === "function") field = new TextField({ name: "erinnerung", max: 5 }); } catch (e) { field = null; }
        if (!field) {
            const tmp = new Collection({ type: "base", name: "pinn_tmp_erinnerung", fields: [{ name: "erinnerung", type: "text", max: 5 }] });
            field = tmp.fields.getByName("erinnerung");
        }
        col.fields.add(field);
        $app.save(col);
        console.log("[Aufgaben] Feld \"erinnerung\" ergänzt.");
    } catch (err) {
        console.log("[Aufgaben] Feld \"erinnerung\" nicht anlegbar: " + err.message);
    }
}
function remindOf(v) { return isTime(v) ? String(v) : ""; }
function hasReminderField(rec) {
    try { return !!rec.collection().fields.getByName("erinnerung"); } catch (e) { return false; }
}

// History of the household tasks (rotation & statistics) - only create if it is missing
function ensureVerlauf() {
    try { if ($app.findCollectionByNameOrId(VERLAUF)) return true; } catch (err) { /* missing */ }
    try {
        const fam = familyCollection();
        const fields = [
            { name: "regel", type: "text", max: 100 },
            { name: "titel", type: "text", max: 300 },
            { name: "aufgabe", type: "text", max: 30 },
            { name: "faellig", type: "text", max: 10 },
            { name: "zustaendig", type: "text", max: 100 },
            { name: "erledigt_von", type: "text", max: 100 },
            { name: "status", type: "text", max: 20 },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ];
        if (fam) fields.push({ name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false });
        $app.save(new Collection({
            type: "base",
            name: VERLAUF,
            fields: fields,
            indexes: [
                "CREATE INDEX `idx_hhverlauf_regel` ON `" + VERLAUF + "` (`regel`, `faellig`)",
                "CREATE INDEX `idx_hhverlauf_aufgabe` ON `" + VERLAUF + "` (`aufgabe`)",
                "CREATE INDEX `idx_hhverlauf_faellig` ON `" + VERLAUF + "` (`faellig`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Aufgaben] Sammlung \"" + VERLAUF + "\" angelegt.");
        return true;
    } catch (err) {
        console.log("[Aufgaben] Konnte Sammlung \"" + VERLAUF + "\" nicht anlegen: " + err.message);
        return false;
    }
}
function verlaufOk() {
    try { return !!$app.findCollectionByNameOrId(VERLAUF); } catch (e) { return false; }
}
function verlaufFor(familyId, taskId) {
    if (!taskId || !verlaufOk()) return null;
    try {
        const r = $app.findRecordsByFilter(VERLAUF, "familie = {:f} && aufgabe = {:a}", "-created", 1, 0, { f: familyId, a: String(taskId) });
        return r.length ? r[0] : null;
    } catch (e) { return null; }
}
function verlaufAdd(familyId, data) {
    if (!verlaufOk()) return null;
    try {
        const rec = new Record($app.findCollectionByNameOrId(VERLAUF));
        rec.set("familie", familyId);
        rec.set("regel", String(data.regel || "").slice(0, 100));
        rec.set("titel", String(data.titel || "").slice(0, 300));
        rec.set("aufgabe", String(data.aufgabe || ""));
        rec.set("faellig", String(data.faellig || ""));
        rec.set("zustaendig", String(data.zustaendig || ""));
        rec.set("erledigt_von", String(data.erledigt_von || ""));
        rec.set("status", data.status || "offen");
        $app.save(rec);
        return rec;
    } catch (e) {
        console.log("[Haushalt-Verlauf] " + e.message);
        return null;
    }
}
// Remove open history entries of deleted tasks (completed ones stay for the statistics)
function verlaufDropOpen(familyId, taskId) {
    const v = verlaufFor(familyId, taskId);
    if (v && v.getString("status") === "offen") { try { $app.delete(v); } catch (e) { /* ignore */ } }
}
// Member behind a profile
function memberOfUser(userId) {
    if (!userId) return "";
    try { return $app.findRecordById("benutzer", userId).getString("mitglied"); } catch (e) { return ""; }
}

// =============================================================================================
// Reading / writing
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
        remindAt: remindOf(r.getString("erinnerung")),
    };
}

function listAll(familyId) {
    if (!familyId) return [];
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { recs = []; }
    return recs.map(toClient);
}

// Only find a task if it belongs to the given family
function findOwn(familyId, id) {
    const rec = $app.findRecordById(AUFGABEN, String(id || ""));
    if (!familyId || rec.getString("familie") !== familyId) throw new Error("Aufgabe nicht gefunden.");
    return rec;
}

// Creates a task or changes it. body: {id?, neu?, title, notes, dueDate, fromTime?, toTime?}
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

    // New tasks can bring their identifier along from the app (body.neu + body.id), so that they can
    // be created offline and submitted later without duplicates: if a task with this identifier
    // already exists (e.g. because the first transmission arrived but the response did not), it is
    // only updated.
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
    // Extra reminder: only change it if the app sends it along (older devices leave it as it is)
    if (body.remindAt !== undefined && body.remindAt !== null && hasReminderField(rec)) rec.set("erinnerung", remindOf(body.remindAt));
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

// Tick off / remove the tick. When ticking off, it is checked whether the person (member of the signed-in
// profile) has thereby completed all tasks that are due so far:
//  - due on an earlier day or today
//  - today with a time window: only if the time window has already started
//  - assigned to the person or "All"
// The result goes to the app immediately (animation). The notifications (pinn-push.js) only go out
// 10 seconds later - if the tick is removed again before that, the message is dropped.
// If a task is reset later and ticked off again, a notification is sent again
// (the lock against duplicate messages hangs on the ticking-off time "erledigt_am").
function setDone(familyId, id, done, actorUserId) {
    const rec = findOwn(familyId, id);
    rec.set("erledigt", !!done);
    rec.set("erledigt_am", done ? new Date().toISOString() : "");
    $app.save(rec);
    if (rec.getString("haushalt")) {
        try { verlaufDone(familyId, rec, !!done, actorUserId); } catch (err) { console.log("[Haushalt-Verlauf] " + err.message); }
    }
    const out = toClient(rec);
    out.alleErledigt = false;
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (err) { push = null; }
    const key = "aufgabe:" + rec.id;
    if (!done) {
        // Discard a not yet sent message for this task
        if (push) try { push.cancelDelayed(key); } catch (err) { /* ignore */ }
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

// Household task ticked off: note in the history who it was (without a linked member: whoever was responsible)
function verlaufDone(familyId, rec, done, actorUserId) {
    if (!verlaufOk()) return;
    let v = verlaufFor(familyId, rec.id);
    const members = loadHouseholdData(familyId).members || [];
    let von = memberOfUser(actorUserId);
    if (!members.some(m => m.id === von)) von = "";
    if (!v) {
        if (!done) return;
        v = verlaufAdd(familyId, { regel: "", titel: rec.getString("haushalt"), aufgabe: rec.id, faellig: rec.getString("faellig"), zustaendig: "", status: "offen" });
        if (!v) return;
    }
    v.set("status", done ? "erledigt" : "offen");
    v.set("erledigt_von", done ? (von || v.getString("zustaendig")) : "");
    $app.save(v);
}

// Who ticked off, does the task belong to them, are all due tasks thereby completed
// and which children are affected? withChildren = false skips the children check (only for the app).
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

    // Person who ticked it off
    const taskIsOwn = !!memberId && assign.memberIds.indexOf(memberId) !== -1;
    const own = taskIsOwn ? allDoneUntilNow(familyId, assignedTo(memberId)) : { allDone: false, signature: "" };

    // Children to whom the task belongs: explicitly assigned - or, for "All", the child
    // who ticks it off themselves
    const children = !withChildren ? [] : members.filter(m => push.isChildMember(m) && (
        (!assign.all && assign.memberIds.indexOf(m.id) !== -1) || (assign.all && m.id === memberId)
    )).map(m => {
        const c = m.id === memberId ? own : allDoneUntilNow(familyId, assignedTo(m.id));
        return { memberId: m.id, allDone: c.allDone, signature: c.signature };
    });
    return { members: members, memberId: memberId, taskIsOwn: taskIsOwn, own: own, children: children };
}

// Send the queued message after the 10 seconds have passed (called from pinn-push.js).
// Only if the task is still ticked off exactly as when it was queued.
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

// Are all tasks of this person that are due so far completed? (just one database query)
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
        if (due === todayIso && from && from > hm) continue; // time window has not started yet
        if (!assigned(r)) continue;
        if (!r.getBool("erledigt")) return { allDone: false, signature: "" };
        ids.push(r.id + "@" + r.getString("erledigt_am")); // newly ticked off = new signature = new message
    }
    ids.sort();
    return { allDone: ids.length > 0, signature: ids.join(",") };
}

// Members of the family (from the cache) - e.g. for the kids' page notification
function familyMembers(familyId) {
    if (!familyId) return [];
    return loadHouseholdData(familyId).members || [];
}

function removeTask(familyId, id) {
    try {
        const rec = findOwn(familyId, id);
        if (rec.getString("haushalt")) {
            // Maintenance task deleted = skip this cycle (otherwise it would come right back)
            const v = verlaufFor(familyId, rec.id);
            if (v && v.getString("status") === "offen" && v.getString("regel").indexOf("w:") === 0) {
                try { v.set("status", "uebersprungen"); $app.save(v); } catch (e) { /* ignore */ }
            } else verlaufDropOpen(familyId, rec.id);
        }
        $app.delete(rec);
    } catch (e) { /* already gone */ }
    return true;
}

// Delete all automatically generated household tasks (self-created ones stay).
function deleteHouseholdTasks(familyId) {
    if (!familyId) return 0;
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt != ''", "", 0, 0, { f: familyId }); } catch (e) { recs = []; }
    let count = 0;
    recs.forEach(r => { try { verlaufDropOpen(familyId, r.id); $app.delete(r); count++; } catch (e) { /* ignore */ } });
    return count;
}

// Delete TODAY's task of a household rule (rule changed or deleted).
function deleteTodayHouseholdTask(familyId, baseTitle) {
    const key = String(baseTitle || "");
    if (!key || !familyId) return false;
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt = {:k} && faellig = {:d}", "", 0, 0, { f: familyId, k: key, d: wallIso(wallNow()) }); } catch (e) { recs = []; }
    recs.forEach(r => { try { verlaufDropOpen(familyId, r.id); $app.delete(r); } catch (e) { /* ignore */ } });
    return recs.length > 0;
}

// =============================================================================================
// Family data (only the part that the household detection needs) - cached per family
// as long as the record does not change. We query the change time directly via SQL, without
// loading the (large) data itself.
// =============================================================================================
function loadHouseholdData(familyId) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const stamp = lib.familyDataStamp(familyId);
    const key = FAMILY_CACHE_KEY + familyId;
    if (stamp) {
        try {
            const cached = $app.store().get(key);
            if (cached && cached.stamp === stamp) return JSON.parse(cached.json);
        } catch (e) { /* continue without cache */ }
    }
    const data = lib.loadFamilyDataFor(familyId) || {};
    const sub = {
        rooms: data.rooms || [],
        roomSchedules: data.roomSchedules || [],
        trashBins: data.trashBins || [],
        cleaningCategories: data.cleaningCategories || [],
        members: data.members || [],
        doneTaskCleanupDays: data.doneTaskCleanupDays,
        houseMaintenance: Array.isArray(data.houseMaintenance) ? data.houseMaintenance : [],
    };
    if (stamp) {
        try { $app.store().set(key, { stamp: stamp, json: JSON.stringify(sub) }); } catch (e) { /* ignore */ }
    }
    return sub;
}

// =============================================================================================
// Household tasks (same rules as before in the calendar)
// =============================================================================================
const WASTE_TYPES = [
    { id: 'restmuell', icon: '\ud83d\uddd1\ufe0f', taskLabel: 'Restmüll', keywords: ['restmüll', 'restabfall', 'restmülltonne', 'hausmüll', 'graue tonne', 'schwarze tonne', 'rest-'] },
    { id: 'biomuell', icon: '\ud83c\udf42', taskLabel: 'Biomüll', keywords: ['biomüll', 'bioabfall', 'biotonne', 'bio-tonne', 'braune tonne', 'grünabfall', 'kompost'] },
    { id: 'papier', icon: '\ud83d\udce6', taskLabel: 'Papiermüll', keywords: ['papier', 'pappe', 'papiertonne', 'blaue tonne', 'altpapier', 'ppk'] },
    { id: 'gelbersack', icon: '\u267b\ufe0f', taskLabel: 'Gelber Sack', keywords: ['gelber sack', 'gelbe tonne', 'gelbe säcke', 'verpackung', 'wertstoff', 'leichtverpackung', 'lvp'] },
    { id: 'glas', icon: '\ud83c\udf7e', taskLabel: 'Altglas', keywords: ['altglas', 'glas'] },
];
const WEEKDAY_IDS = ["so", "mo", "di", "mi", "do", "fr", "sa"]; // index = getUTCDay() of the wall time

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

// Waste types for a title ("Gelbe Tonne" -> gelbersack)
function wasteTypesOf(title) {
    const t = String(title || "").toLowerCase();
    return WASTE_TYPES.filter(wt => wt.keywords.some(kw => t.indexOf(kw) !== -1)).map(wt => wt.id);
}
// Collections on a day: { types: { <waste type>: true }, names: ["Restmüll", ...] }
// Sources: the family's waste calendar (Settings → Calendar) and the calendar file (iCloud/Google).
function pickupsFor(dateIso, familyId) {
    const out = { types: {}, names: [] };
    try {
        require(`${__hooks}/pinn-muell.js`).termineAm(familyId, dateIso).forEach(name => {
            if (out.names.indexOf(name) === -1) out.names.push(name);
            wasteTypesOf(name).forEach(id => { out.types[id] = true; });
        });
    } catch (e) { /* no waste calendar */ }
    const cal = pickupTypesFor(dateIso, familyId);
    Object.keys(cal).forEach(id => {
        if (out.types[id]) return;
        out.types[id] = true;
        const wt = WASTE_TYPES.find(w => w.id === id);
        if (wt && out.names.indexOf(wt.taskLabel) === -1) out.names.push(wt.taskLabel);
    });
    return out;
}
// Waste types for which the family's calendar file shows a collection TOMORROW. Reads only the
// file that exists anyway (no iCloud access) and only parses it if the date occurs at all.
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
        if (/(^|\n)RRULE[:;]/.test(block)) return; // do not take recurring events into account, as before
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

// Rotation: who is next? ids = responsible people in their order, mode 'reihum' | 'fair'.
// 'fair' takes the person with the fewest completed household tasks of the last 30 days (in
// case of a tie, in turn).
function lastAssignee(familyId, ruleId) {
    if (!ruleId || !verlaufOk()) return null;
    try {
        const r = $app.findRecordsByFilter(VERLAUF, "familie = {:f} && regel = {:r} && zustaendig != ''", "-faellig,-created", 1, 0, { f: familyId, r: ruleId });
        return r.length ? r[0] : null;
    } catch (e) { return null; }
}
function doneCounts(familyId, days) {
    const out = {};
    if (!verlaufOk()) return out;
    const from = wallIso(wallNow() - days * DAY_MS);
    let recs = [];
    try { recs = $app.findRecordsByFilter(VERLAUF, "familie = {:f} && status = 'erledigt' && faellig >= {:d}", "", 0, 0, { f: familyId, d: from }); } catch (e) { recs = []; }
    recs.forEach(r => { const id = r.getString("erledigt_von"); if (id) out[id] = (out[id] || 0) + 1; });
    return out;
}
function pickNext(familyId, rule, members, counts) {
    const ids = (rule.ids || []).filter(id => (members || []).some(m => m.id === id));
    if (!ids.length) return "";
    const last = lastAssignee(familyId, rule.id);
    const lastId = last ? last.getString("zustaendig") : "";
    const start = ids.indexOf(lastId) + 1; // -1 + 1 = 0: start with the first person
    const order = i => ids[(start + i) % ids.length];
    if (rule.rotate !== "fair") return order(0);
    const c = counts || doneCounts(familyId, 30);
    let best = order(0);
    for (let i = 1; i < ids.length; i++) {
        const id = order(i);
        if ((c[id] || 0) < (c[best] || 0)) best = id;
    }
    return best;
}
function isRotating(rule) {
    return !!(rule && (rule.rotate === "reihum" || rule.rotate === "fair") && (rule.ids || []).length >= 2);
}

// EXACTLY ONE task per rule and cycle. If the previous one was not completed by its deadline (due date + 1 day,
// 4 a.m.), it is replaced and the counter "verpasst" is increased.
// Rotation: the new task gets exactly one responsible person; after a missed task the same one.
function processRule(byKey, rule, todayIso, nowWall, col, familyId, members) {
    const key = rule.key;
    const list = byKey[key] || [];
    if (list.some(r => r.getString("faellig") === todayIso)) return 0;
    const last = list[0]; // sorted by due date, descending
    let missed = 0;
    let stay = "";
    if (last && !last.getBool("erledigt")) {
        const lastDue = last.getString("faellig");
        if (isIsoDate(lastDue) && nowWall < isoToWall(lastDue) + DAY_MS + 4 * HOUR_MS) return 0; // deadline is still running
        missed = last.getInt("verpasst") + 1;
        const v = verlaufFor(familyId, last.id);
        if (v) {
            stay = v.getString("zustaendig");
            try { v.set("status", "verpasst"); $app.save(v); } catch (e) { /* ignore */ }
        }
        try { $app.delete(last); } catch (e) { /* ignore */ }
    }
    let zust = "";
    let notes = rule.notes;
    if (isRotating(rule)) {
        zust = (stay && rule.ids.indexOf(stay) !== -1) ? stay : pickNext(familyId, rule, members);
        if (zust) notes = buildAssignedNotes([zust], members);
    } else if ((rule.ids || []).length === 1) {
        zust = rule.ids[0];
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
    if (rule.remindAt && hasReminderField(rec)) rec.set("erinnerung", rule.remindAt);
    $app.save(rec);
    verlaufAdd(familyId, { regel: rule.id || "", titel: key, aufgabe: rec.id, faellig: todayIso, zustaendig: zust, status: "offen" });
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

    // Collect due rules (key = task title as before)
    const rules = [];
    const seen = {};
    const add = (key, ids, src) => {
        if (seen[key]) return;
        seen[key] = true;
        rules.push({ key: key, notes: buildAssignedNotes(ids, data.members), ids: (ids || []).slice(), id: String((src && src.id) || ""), rotate: (src && src.rotate) || "", remindAt: remindOf(src && src.remindAt) });
    };
    (data.roomSchedules || []).forEach(s => {
        if (isScheduleDue(s, todayIso, weekday)) add(cleaningTitle(s, data.rooms, data.cleaningCategories), s.assignedMemberIds, s);
    });
    const bins = data.trashBins || [];
    bins.forEach(b => {
        if (b.schedule && isScheduleDue(b.schedule, todayIso, weekday)) add(binTitle(b, data.rooms), b.assignedMemberIds, b);
    });
    // Collection dates: the family's waste calendar and the calendar file (iCloud/Google)
    if (bins.length) {
        const pickups = pickupsFor(tomorrowIso, familyId).types;
        bins.forEach(b => { if (pickups[b.wasteType]) add(binTitle(b, data.rooms), b.assignedMemberIds, b); });
    }
    // Maintenance tasks with the same name would have the same key and share their task - only the first counts
    // (since 1.57 the app renames duplicate entries itself, e.g. "Mow the lawn (2)")
    const maintSeen = {};
    const maint = (data.houseMaintenance || []).filter(maintActive).filter(m => {
        const k = maintKey(m).toLowerCase();
        if (maintSeen[k]) return false;
        maintSeen[k] = true;
        return true;
    });

    let existing = [];
    if (rules.length || maint.length || bins.length) {
        try { existing = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && haushalt != ''", "-faellig", 0, 0, { f: familyId }); } catch (e) { existing = []; }
    }
    const byKey = {};
    existing.forEach(r => { const k = r.getString("haushalt"); (byKey[k] = byKey[k] || []).push(r); });
    // Over: tick off open waste tasks after the collection (before new ones are created)
    if (bins.length) {
        try { closePassedBinTasks(familyId, data, byKey, nowWall, seen); } catch (e) { console.log("[Haushalt-Aufgabe] Müll abhaken: " + e.message); }
    }
    if (!rules.length && !maint.length) return 0;

    const col = $app.findCollectionByNameOrId(AUFGABEN);
    let created = 0;
    rules.forEach(rule => {
        try { created += processRule(byKey, rule, todayIso, nowWall, col, familyId, data.members || []); }
        catch (e) { console.log("[Haushalt-Aufgabe] Fehler bei \"" + rule.key + "\": " + e.message); }
    });
    maint.forEach(item => {
        try { created += processMaintenance(byKey, item, todayIso, col, familyId, data.members || []); }
        catch (e) { console.log("[Wartung] Fehler bei \"" + maintKey(item) + "\": " + e.message); }
    });
    return created;
}

// An open waste task (due D) is over if on D+1 its waste type was collected according to the calendar and
// it is collection day 12 o'clock - or if the next task for the same bin becomes due today.
const BIN_CLOSE_HOUR = 12;
function closePassedBinTasks(familyId, data, byKey, nowWall, dueKeys) {
    const todayIso = wallIso(nowWall);
    const keyTypes = {};
    (data.trashBins || []).forEach(b => { const k = binTitle(b, data.rooms); (keyTypes[k] = keyTypes[k] || []).push(b.wasteType); });
    const pickCache = {};
    const pick = iso => (pickCache[iso] = pickCache[iso] || pickupsFor(iso, familyId).types);
    let closed = 0;
    Object.keys(keyTypes).forEach(key => {
        (byKey[key] || []).forEach(rec => {
            if (rec.getBool("erledigt")) return;
            const due = rec.getString("faellig");
            if (!isIsoDate(due) || due >= todayIso) return; // at the earliest on the collection day
            const pickupDay = wallIso(isoToWall(due) + DAY_MS);
            const passed = nowWall >= isoToWall(pickupDay) + BIN_CLOSE_HOUR * HOUR_MS || !!(dueKeys && dueKeys[key]);
            if (!passed) return;
            const types = pick(pickupDay);
            if (!keyTypes[key].some(t => types[t])) return; // no collection -> normal rule (missed)
            rec.set("erledigt", true);
            rec.set("erledigt_am", new Date().toISOString());
            $app.save(rec);
            const v = verlaufFor(familyId, rec.id);
            if (v) {
                try { v.set("status", "erledigt"); v.set("erledigt_von", v.getString("zustaendig")); $app.save(v); } catch (e) { /* ignore */ }
            }
            closed++;
            console.log("[Haushalt-Aufgabe] Nach der Abholung abgehakt: " + key);
        });
    });
    return closed;
}

// For the reminder on the day before (pinn-push.js): what is collected tomorrow and which waste tasks are
// due today? -> { morgen, namen: [..], aufgaben: [{ id, titel, typ, notizen, erledigt }] }
function muellInfo(familyId, data) {
    const nowWall = wallNow();
    const todayIso = wallIso(nowWall);
    const morgen = wallIso(nowWall + DAY_MS);
    const p = pickupsFor(morgen, familyId);
    const out = { morgen: morgen, namen: p.names, aufgaben: [] };
    if (!p.names.length) return out;
    const bins = (data && data.trashBins) || [];
    const rooms = (data && data.rooms) || [];
    const byKey = {};
    bins.forEach(b => { if (p.types[b.wasteType]) byKey[binTitle(b, rooms)] = b; });
    const keys = Object.keys(byKey);
    if (!keys.length) return out;
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && faellig = {:d} && haushalt != ''", "", 0, 0, { f: familyId, d: todayIso }); } catch (e) { recs = []; }
    recs.forEach(r => {
        const b = byKey[r.getString("haushalt")];
        if (!b) return;
        const wt = WASTE_TYPES.find(w => w.id === b.wasteType);
        out.aufgaben.push({ id: r.id, titel: r.getString("titel"), typ: wt ? wt.taskLabel : "Müll", notizen: r.getString("notizen"), erledigt: r.getBool("erledigt") });
    });
    return out;
}

// For the extra reminder (pinn-push.js): open tasks with a reminder that are due today
// -> [{ id, titel, notizen, erinnerung }]
function remindersDue(familyId, todayIso) {
    if (!familyId) return [];
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && erledigt = false && faellig = {:d} && erinnerung != ''", "", 200, 0, { f: familyId, d: todayIso });
    } catch (e) { return []; } // Field does not exist yet (before the first start with 1.57)
    return recs.map(r => ({ id: r.id, titel: r.getString("titel"), notizen: r.getString("notizen"), erinnerung: remindOf(r.getString("erinnerung")) })).filter(x => x.erinnerung);
}

// =============================================================================================
// Maintenance plan (menu "House"): recurring household tasks in months
// =============================================================================================
function maintActive(m) {
    return !!(m && m.id && m.active !== false && String(m.title || "").trim() && Number(m.months) > 0);
}
// Task title = key (as with the other household tasks)
function maintKey(m) {
    const icon = String(m.icon || "").trim();
    return ((icon ? icon + " " : "") + String(m.title || "").trim()).slice(0, 300);
}
function isoAddMonths(iso, n) {
    const p = String(iso).split("-").map(Number);
    const idx = p[0] * 12 + (p[1] - 1) + n;
    const y = Math.floor(idx / 12), mo = idx - y * 12;
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return y + "-" + pad2(mo + 1) + "-" + pad2(Math.min(p[2], dim));
}
function isoAddDays(iso, n) { return wallIso(isoToWall(iso) + n * DAY_MS); }
function isoOfStamp(s) {
    const t = Date.parse(String(s || "").replace(" ", "T"));
    return isFinite(t) ? wallIso(t + tzOffsetMs(t)) : "";
}
// Last completion: from the history (completed = day of ticking off, skipped = due date),
// from still existing completed tasks and from "last", which the app maintains
function maintLastDone(familyId, item, list) {
    let best = isIsoDate(item.last) ? item.last : "";
    const take = d => { if (isIsoDate(d) && d > best) best = d; };
    (list || []).forEach(r => { if (r.getBool("erledigt")) take(isoOfStamp(r.getString("erledigt_am")) || r.getString("faellig")); });
    if (verlaufOk()) {
        try {
            const recs = $app.findRecordsByFilter(VERLAUF, "familie = {:f} && regel = {:r} && (status = 'erledigt' || status = 'uebersprungen')", "-updated", 3, 0, { f: familyId, r: "w:" + item.id });
            recs.forEach(v => take(v.getString("status") === "erledigt" ? (isoOfStamp(v.getString("updated")) || v.getString("faellig")) : v.getString("faellig")));
        } catch (e) { /* ignore */ }
    }
    return best;
}
function maintNextDue(item, lastDone, todayIso) {
    const months = Math.max(1, Math.min(120, Math.round(Number(item.months) || 12)));
    const manual = isIsoDate(item.next) ? item.next : "";
    const setAt = isIsoDate(item.nextSet) ? item.nextSet : "";
    if (manual && (!lastDone || lastDone < setAt)) return manual;
    if (lastDone) return isoAddMonths(lastDone, months);
    return manual || todayIso;
}
// At most ONE open task per maintenance; it stays until it is completed
function processMaintenance(byKey, item, todayIso, col, familyId, members) {
    const key = maintKey(item);
    const list = byKey[key] || [];
    if (list.some(r => !r.getBool("erledigt"))) return 0;
    const next = maintNextDue(item, maintLastDone(familyId, item, list), todayIso);
    const lead = Math.max(0, Math.min(60, Math.round(Number(item.lead) || 0)));
    if (todayIso < isoAddDays(next, -lead)) return 0;
    const due = next < todayIso ? todayIso : next;
    if (list.some(r => r.getString("faellig") === due)) return 0;
    const rule = { id: "w:" + item.id, ids: Array.isArray(item.assignedMemberIds) ? item.assignedMemberIds.slice() : [], rotate: item.rotate || "" };
    let zust = "";
    let notes = buildAssignedNotes(rule.ids, members);
    if (isRotating(rule)) {
        zust = pickNext(familyId, rule, members);
        if (zust) notes = buildAssignedNotes([zust], members);
    } else if (rule.ids.length === 1) {
        zust = rule.ids[0];
    }
    const extra = String(item.note || "").trim();
    if (extra) notes = notes + "\n" + extra.slice(0, 1000);
    const rec = new Record(col);
    rec.set("titel", key);
    rec.set("notizen", notes);
    rec.set("faellig", due);
    rec.set("von", "");
    rec.set("bis", "");
    rec.set("erledigt", false);
    rec.set("erledigt_am", "");
    rec.set("haushalt", key);
    rec.set("verpasst", 0);
    rec.set("familie", familyId);
    if (remindOf(item.remindAt) && hasReminderField(rec)) rec.set("erinnerung", remindOf(item.remindAt));
    $app.save(rec);
    verlaufAdd(familyId, { regel: rule.id, titel: key, aufgabe: rec.id, faellig: due, zustaendig: zust, status: "offen" });
    byKey[key] = [rec].concat(list);
    console.log("[Wartung] Angelegt: " + key + " (fällig " + due + ")");
    return 1;
}

// Delete completed tasks: 0 = immediately, 1 or 2 days after ticking off (default 2).
// Household tasks from today stay until tomorrow - this is how the detection recognises that
// today's task is already completed (otherwise it would be created again immediately).
function cleanupDone(familyId, days) {
    const d = (days === 0 || days === 1 || days === 2) ? days : 2;
    const cutoff = new Date(Date.now() - d * DAY_MS).toISOString();
    const todayIso = wallIso(wallNow());
    let recs = [];
    try { recs = $app.findRecordsByFilter(AUFGABEN, "familie = {:f} && erledigt = true && erledigt_am != '' && erledigt_am <= {:c}", "", 500, 0, { f: familyId, c: cutoff }); } catch (e) { recs = []; }
    let count = 0;
    recs.forEach(r => {
        if (r.getString("haushalt") && r.getString("faellig") >= todayIso) return;
        try { $app.delete(r); count++; } catch (e) { /* ignore */ }
    });
    if (count) console.log("[Aufgaben-Aufraeumen] " + count + " erledigte Aufgabe(n) gelöscht.");
    return count;
}

// Prevents the hourly run and an immediate run from the app from creating tasks for the
// SAME family at the same time. The lock applies per family - a run for family A does not block family B.
function lockKey(familyId) {
    return LOCK_KEY + ":" + String(familyId || "");
}
function withLock(familyId, fn) {
    const store = $app.store();
    const key = lockKey(familyId);
    let t = null;
    try { t = store.get(key); } catch (e) { t = null; }
    if (typeof t === "number" && Date.now() - t < 60000) return null;
    try { store.set(key, Date.now()); } catch (e) { /* ignore */ }
    try { return fn(); }
    finally { try { store.remove(key); } catch (e) { /* ignore */ } }
}

// Hourly run: check household tasks for every family + clean up completed ones.
// Each family gets its own lock; if a family is currently busy because of an immediate run,
// only that one is skipped in this pass (the next hourly run catches up).
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
    // Clean up history older than 400 days (500 per run at most)
    if (verlaufOk()) {
        try {
            const cut = wallIso(wallNow() - 400 * DAY_MS);
            $app.findRecordsByFilter(VERLAUF, "faellig != '' && faellig < {:d}", "", 500, 0, { d: cut }).forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
        } catch (e) { /* ignore */ }
    }
    // Clean up older tasks without a family (should no longer occur after the migration)
    try {
        $app.findRecordsByFilter(AUFGABEN, "familie = '' && erledigt = true", "", 200, 0).forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
    return { created: created, removed: removed };
}

// Immediate run from the app (after changing a household rule / "Regenerate now").
function runHouseholdNow(familyId) {
    const r = withLock(familyId, () => ({ created: runHousehold(familyId, loadHouseholdData(familyId)) }));
    return r || { created: 0, busy: true };
}

// =============================================================================================
// Statistics "Who does how much?" (household page)
// =============================================================================================
function statistik(familyId, tage) {
    const days = [30, 90, 365].indexOf(Number(tage)) !== -1 ? Number(tage) : 30;
    const out = { tage: days, mitglieder: {}, regeln: [], bereit: verlaufOk() };
    if (!familyId || !out.bereit) return out;
    const from = wallIso(wallNow() - days * DAY_MS);
    let recs = [];
    try { recs = $app.findRecordsByFilter(VERLAUF, "familie = {:f} && faellig >= {:d}", "", 0, 0, { f: familyId, d: from }); } catch (e) { recs = []; }
    const per = out.mitglieder;
    const slot = id => (per[id] = per[id] || { erledigt: 0, verpasst: 0, offen: 0 });
    recs.forEach(r => {
        const st = r.getString("status");
        const z = r.getString("zustaendig");
        if (st === "erledigt") { const v = r.getString("erledigt_von") || z; if (v) slot(v).erledigt++; }
        else if (st === "verpasst") { if (z) slot(z).verpasst++; }
        else if (st === "offen") { if (z) slot(z).offen++; }
    });
    const data = loadHouseholdData(familyId);
    const members = data.members || [];
    const counts = doneCounts(familyId, 30);
    const rules = [];
    (data.roomSchedules || []).forEach(s => rules.push({ id: String(s.id || ""), ids: (s.assignedMemberIds || []).slice(), rotate: s.rotate || "", titel: cleaningTitle(s, data.rooms, data.cleaningCategories) }));
    (data.trashBins || []).forEach(b => rules.push({ id: String(b.id || ""), ids: (b.assignedMemberIds || []).slice(), rotate: b.rotate || "", titel: binTitle(b, data.rooms) }));
    (data.houseMaintenance || []).filter(maintActive).forEach(m => rules.push({ id: "w:" + m.id, ids: (m.assignedMemberIds || []).slice(), rotate: m.rotate || "", titel: maintKey(m) }));
    rules.filter(isRotating).forEach(rule => {
        const last = lastAssignee(familyId, rule.id);
        const lastSt = last ? last.getString("status") : "";
        const jetzt = last && (lastSt === "offen" || lastSt === "verpasst") ? last.getString("zustaendig") : "";
        // After a missed task the same person stays responsible - "danach" then shows the one after next
        const naechster = pickNext(familyId, rule, members, counts);
        out.regeln.push({ id: rule.id, titel: rule.titel, jetzt: jetzt, naechster: naechster !== jetzt ? naechster : "", art: rule.rotate });
    });
    return out;
}

// =============================================================================================
// Kids' page: child wants to exchange stars -> notification to the parents
// (all profiles of the family except the child themselves, children, parental controls and guests)
// =============================================================================================
const REWARD_TEXT = {
    de: { t: "⭐ Belohnung angefragt", b: "{k} möchte „{w}“ für {n} Sterne eintauschen." },
    en: { t: "⭐ Reward requested", b: "{k} would like to trade {n} stars for “{w}”." },
    fr: { t: "⭐ Récompense demandée", b: "{k} aimerait échanger {n} étoiles contre « {w} »." },
    es: { t: "⭐ Recompensa solicitada", b: "{k} quiere canjear {n} estrellas por «{w}»." },
    it: { t: "⭐ Premio richiesto", b: "{k} vorrebbe scambiare {n} stelle con «{w}»." },
    pt: { t: "⭐ Recompensa solicitada", b: "{k} quer trocar {n} estrelas por “{w}”." },
    zh: { t: "⭐ 有人申请兑换奖励", b: "{k} 想用 {n} 颗星星兑换“{w}”。" },
    ja: { t: "⭐ ごほうびのリクエスト", b: "{k}が星{n}個を「{w}」と交換したいそうです。" },
    ko: { t: "⭐ 보상 요청", b: "{k}님이 별 {n}개를 “{w}”(으)로 바꾸고 싶어 해요." },
    ru: { t: "⭐ Запрос награды", b: "{k} хочет обменять {n} ⭐ на «{w}»." },
    nl: { t: "⭐ Beloning aangevraagd", b: "{k} wil {n} sterren inwisselen voor “{w}”." },
    tr: { t: "⭐ Ödül istendi", b: "{k}, {n} yıldızı “{w}” ile takas etmek istiyor." },
};
function notifyReward(familyId, actorUserId, body) {
    if (!familyId) return 0;
    const members = loadHouseholdData(familyId).members || [];
    const kid = members.find(m => m.id === String((body && body.memberId) || ""));
    if (!kid) return 0;
    const wish = String((body && body.titel) || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const stars = Math.max(1, Math.min(9999, Math.round(Number(body && body.sterne) || 0)));
    if (!wish) return 0;
    const push = require(`${__hooks}/pinn-push.js`);
    let pt = null;
    try { pt = require(`${__hooks}/pinn-pushtext.js`); } catch (e) { pt = null; }
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    let sent = 0;
    users.forEach(u => {
        if (u.id === actorUserId) return;
        const rolle = u.getString("rolle");
        if (rolle === "gast" || rolle === "hauptadmin") return;
        const mid = u.getString("mitglied");
        if (mid === kid.id) return;
        const m = members.find(x => x.id === mid);
        if (m && (push.isChildMember(m) || m.childLock) && rolle !== "admin") return;
        let lang = "de";
        try { if (pt && typeof pt.langOfUser === "function") lang = pt.langOfUser(u); } catch (e) { lang = "de"; }
        const tx = REWARD_TEXT[lang] || REWARD_TEXT.de;
        try {
            sent += push.notifyUser(u.id, {
                titel: tx.t,
                text: tx.b.replace("{k}", memberLabel(kid)).replace("{w}", wish).replace("{n}", String(stars)),
                url: "/?sterne=" + encodeURIComponent(kid.id),
                tag: "belohnung-" + kid.id,
            }) ? 1 : 0;
        } catch (e) { console.log("[Push] Belohnung: " + e.message); }
    });
    return sent;
}

module.exports = {
    statistik, notifyReward, ensureVerlauf, muellInfo, pickupsFor, loadHouseholdData, remindersDue,
    AUFGABEN, ensureSchema, listAll, saveTask, setDone, notifyDoneDelayed, removeTask, familyMembers,
    deleteHouseholdTasks, deleteTodayHouseholdTask, runCron, runHouseholdNow,
};
