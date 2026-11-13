// pb_hooks/pinn-gesundheit.js
// Health page per person (since 1.149.0): blocks such as drinking, medication & vitamins, hand washing,
// values (weight, blood pressure), vaccinations and doctor's appointments. The emergency pass stays in the
// family data (area "notfall") and is visible to the whole family as before.
//
// Collection "gesundheit" (one record per family member):
//   familie (relation, deleted with the family), mitglied (member ID), daten (JSON, see js/gesundheit.js),
//   created, updated. Collection API locked for everyone - only the routes in gesundheit.pb.js.
//
// Who may see and change the data of a member:
//   - the profile linked to that member (the person themself)
//   - for a child: every adult of the family (profiles that are not children, admins included)
//   Guests never. A child is a member with child lock, an active kids' page or younger than 18
//   (birthday of the member or of the emergency pass).
//
// Push reminders (since 1.149.1, runCron every 5 minutes from gesundheit.pb.js): the settings live in the
// health data of the member (drink.remind, meds.remind, hands.remind). A reminder goes ONLY to the profile(s)
// linked to that member - never to other family members. Texts come from the key files (push.health.*) in the
// language of the receiving profile. Markers against double sending: pb_data/pinn_gesundheit_push.json
// (one day, then discarded). Tapping the message opens /?gesundheit=<trinken|medikamente|haende>&person=<member ID>.

const COL = "gesundheit";
const DATA_MAX = 400 * 1024;
const MEMBER_RE = /^[A-Za-z0-9_-]{1,40}$/;

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureSchema() {
    if (findCol(COL)) return true;
    const fam = findCol("familien");
    if (!fam) {
        console.log("[Gesundheit] Collection \"familien\" missing - set up at the next start.");
        return false;
    }
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                { name: "mitglied", type: "text", max: 40, required: true },
                { name: "daten", type: "json", maxSize: DATA_MAX },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE INDEX `idx_gesundheit_familie` ON `" + COL + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Gesundheit] Collection \"" + COL + "\" created.");
        return true;
    } catch (err) {
        console.log("[Gesundheit] Could not create the collection: " + err.message);
        return false;
    }
}

// ---------------------------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------------------------
function ageOf(birth) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birth || ""));
    if (!m) return null;
    const now = new Date();
    let age = now.getFullYear() - Number(m[1]);
    if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) age--;
    return age;
}
function isChild(member, passes) {
    if (!member) return false;
    if (member.childLock) return true;
    if (member.kid && member.kid.enabled) return true;
    const pass = passes && passes[member.id];
    const age = ageOf(member.birthday) !== null ? ageOf(member.birthday) : ageOf(pass && pass.birth);
    return age !== null && age < 18;
}
function familyContext(familyId) {
    const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {};
    const members = Array.isArray(data.members) ? data.members.filter(m => m && m.id) : [];
    const passes = (data.emergencyPasses && typeof data.emergencyPasses === "object") ? data.emergencyPasses : {};
    return { members, passes };
}
// Member IDs whose health data the signed-in profile may see
function visibleMembers(e, ctx) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    if (!e.auth || lib.isGuest(e)) return [];
    const own = e.auth.getString("mitglied");
    const ownMember = ctx.members.find(m => m.id === own) || null;
    const adult = (ownMember ? !isChild(ownMember, ctx.passes) : lib.isAdmin(e));
    return ctx.members.filter(m => m.id === own || (adult && isChild(m, ctx.passes))).map(m => m.id);
}

// ---------------------------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------------------------
function recordOf(familyId, memberId) {
    try { return $app.findFirstRecordByFilter(COL, "familie = {:f} && mitglied = {:m}", { f: familyId, m: memberId }); } catch (e) { return null; }
}
function parse(raw) {
    try {
        const v = require(`${__hooks}/calendar-sync.js`).parseRecordData(raw);
        return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
}

function list(e) {
    const familyId = require(`${__hooks}/pinn-benutzer.js`).familyOf(e);
    if (!familyId) return { personen: [] };
    ensureSchema();
    const ctx = familyContext(familyId);
    const ids = visibleMembers(e, ctx);
    const personen = ids.map(id => {
        const rec = recordOf(familyId, id);
        return { mitglied: id, kind: isChild(ctx.members.find(m => m.id === id), ctx.passes), daten: rec ? parse(rec.get("daten")) : {}, updated: rec ? rec.getString("updated") : "" };
    });
    return { personen, ich: e.auth.getString("mitglied") };
}

function save(e, body) {
    const familyId = require(`${__hooks}/pinn-benutzer.js`).familyOf(e);
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    const memberId = String((body && body.mitglied) || "");
    if (!MEMBER_RE.test(memberId)) throw new Error("Unbekannte Person.");
    const daten = body && body.daten;
    if (!daten || typeof daten !== "object" || Array.isArray(daten)) throw new Error("daten fehlt.");
    let size = 0;
    try { size = JSON.stringify(daten).length; } catch (err) { size = DATA_MAX + 1; }
    if (size > DATA_MAX) throw new Error("Die Gesundheitsdaten sind zu groß.");
    if (!ensureSchema()) throw new Error("Die Sammlung für Gesundheit fehlt auf dem Server.");
    const ctx = familyContext(familyId);
    if (visibleMembers(e, ctx).indexOf(memberId) < 0) {
        const err = new Error("Diese Gesundheitsdaten darfst du nicht ändern.");
        err.status = 403;
        throw err;
    }
    let result = null;
    $app.runInTransaction((tx) => {
        let rec = null;
        try { rec = tx.findFirstRecordByFilter(COL, "familie = {:f} && mitglied = {:m}", { f: familyId, m: memberId }); } catch (err) { rec = null; }
        const current = rec ? rec.getString("updated") : "";
        if (body.expected !== undefined && String(body.expected || "") !== current) {
            result = { status: 409, body: { conflict: true, updated: current, daten: rec ? parse(rec.get("daten")) : {} } };
            return;
        }
        if (!rec) {
            rec = new Record(tx.findCollectionByNameOrId(COL));
            rec.set("familie", familyId);
            rec.set("mitglied", memberId);
        }
        rec.set("daten", daten);
        tx.save(rec);
        result = { status: 200, body: { success: true, updated: rec.getString("updated") } };
    });
    return result;
}

// ---------------------------------------------------------------------------------------------
// Push reminders
// ---------------------------------------------------------------------------------------------
const STATUS_FILE = "/pb_data/pinn_gesundheit_push.json";
const GRACE_MIN = 12;          // a due reminder is still sent up to 12 minutes late (the schedule runs every 5 minutes)
const MED_WINDOW_MIN = 90;     // medication: made up for up to 90 minutes after the planned time (e.g. after a restart)
const DRINK_EVERY = [30, 45, 60, 90, 120, 150, 180, 240];

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}
// Europe/Berlin wall clock
function wallNow() {
    const now = Date.now();
    const d = new Date(now + tzOffsetMs(now));
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    return { min: d.getUTCHours() * 60 + d.getUTCMinutes(), iso: y + "-" + pad2(m) + "-" + pad2(day) };
}
function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    if (!m) return null;
    const v = Number(m[1]) * 60 + Number(m[2]);
    return Number(m[1]) < 24 && Number(m[2]) < 60 ? v : null;
}
function hhmm(min) { return pad2(Math.floor(min / 60)) + ":" + pad2(min % 60); }

// Reminder settings with defaults (same defaults as js/gesundheit.js)
function remindSettings(daten) {
    const d = daten && typeof daten === "object" ? daten : {};
    const dr = Object.assign({ on: false, every: 120, from: "08:00", to: "20:00" }, (d.drink && d.drink.remind) || {});
    const every = Number(dr.every);
    const out = {
        drink: { on: dr.on === true, every: DRINK_EVERY.indexOf(every) >= 0 ? every : 120, from: toMin(dr.from) !== null ? toMin(dr.from) : 480, to: toMin(dr.to) !== null ? toMin(dr.to) : 1200 },
        meds: { on: !!(d.meds && d.meds.remind && d.meds.remind.on === true) },
        hands: { on: false, times: [] },
    };
    const hr = (d.hands && d.hands.remind) || {};
    out.hands.on = hr.on === true;
    const times = Array.isArray(hr.times) ? hr.times : ["10:00", "14:00", "18:00"];
    out.hands.times = times.map(toMin).filter(v => v !== null).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b).slice(0, 6);
    return out;
}

function readStatus(today) {
    let o = null;
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
    } catch (e) { o = null; }
    if (!o || typeof o !== "object" || o.datum !== today) o = { datum: today, gesendet: {} };
    if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
    return o;
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Gesundheit] " + STATUS_FILE + " not writable: " + e.message); }
}

// Texts in the language of the receiving profile (key files, "push.health.*")
function text(lang, key, vals) {
    let t = null;
    try { t = require(`${__hooks}/pinn-pushtext.js`).tk(lang, key, vals || {}, false); } catch (e) { t = null; }
    return t || "";
}

// Due reminders of one member: [{ key, kind, titel, text, url, tag }] - nothing is sent here
function dueReminders(rec, daten, rs, w, lang) {
    const out = [];
    const memberId = rec.getString("mitglied");
    const person = encodeURIComponent(memberId);
    const today = w.iso;

    if (rs.drink.on && rs.drink.to > rs.drink.from) {
        const log = (daten.drink && daten.drink.log && Array.isArray(daten.drink.log[today])) ? daten.drink.log[today] : [];
        const total = log.reduce((s, x) => s + (Number(x && x.ml) || 0), 0);
        const goal = Number(daten.drink && daten.drink.goal) || 2000;
        let slot = null;
        for (let t = rs.drink.from; t <= rs.drink.to; t += rs.drink.every) { if (t <= w.min) slot = t; }
        if (slot !== null && w.min - slot < GRACE_MIN) {
            // Already reached the goal, or drank something shortly before: no message for this time
            let lastDrink = -1;
            log.forEach(x => { const m = toMin(x && x.t); if (m !== null && m > lastDrink) lastDrink = m; });
            const recent = lastDrink >= 0 && w.min - lastDrink < Math.min(rs.drink.every / 2, 60);
            const rest = goal - total;
            out.push({
                key: "d|" + rec.id + "|" + slot, kind: "drink", skip: rest <= 0 || recent,
                titel: text(lang, "push.health.drinkTitle"),
                text: text(lang, "push.health.drinkText", { ml: String(total), goal: String(goal), rest: String(Math.max(0, rest)) }),
                url: "/?gesundheit=trinken&person=" + person, tag: "gesundheit-trinken-" + today,
            });
        }
    }

    if (rs.meds.on && daten.meds && Array.isArray(daten.meds.list)) {
        const taken = (daten.meds.taken && Array.isArray(daten.meds.taken[today])) ? daten.meds.taken[today] : [];
        const byTime = {};
        daten.meds.list.forEach(med => {
            if (!med || !med.id || !Array.isArray(med.times)) return;
            med.times.forEach(tm => {
                const m = toMin(tm);
                if (m === null || w.min < m || w.min >= m + MED_WINDOW_MIN) return;
                if (taken.indexOf(med.id + "@" + tm) >= 0) return;
                const label = String(med.name || "").slice(0, 80) + (med.dose ? " (" + String(med.dose).slice(0, 40) + ")" : "");
                (byTime[m] = byTime[m] || []).push(label);
            });
        });
        Object.keys(byTime).forEach(m => {
            out.push({
                key: "m|" + rec.id + "|" + m, kind: "meds", skip: false,
                titel: text(lang, "push.health.medsTitle", { time: hhmm(Number(m)) }),
                text: byTime[m].join(", "),
                url: "/?gesundheit=medikamente&person=" + person, tag: "gesundheit-med-" + today + "-" + hhmm(Number(m)).replace(":", ""),
            });
        });
    }

    if (rs.hands.on) {
        const n = Number(daten.hands && daten.hands.log && daten.hands.log[today]) || 0;
        rs.hands.times.forEach(t => {
            if (w.min < t || w.min - t >= GRACE_MIN) return;
            out.push({
                key: "h|" + rec.id + "|" + t, kind: "hands", skip: false,
                titel: text(lang, "push.health.handsTitle"),
                text: text(lang, "push.health.handsText", { count: String(n) }),
                url: "/?gesundheit=haende&person=" + person, tag: "gesundheit-haende-" + today,
            });
        });
    }
    return out;
}

// Called every 5 minutes: sends the reminders that are due. Returns { gesendet }.
function runCron() {
    if (!findCol(COL)) return { skipped: "no collection" };
    const w = wallNow();
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "mitglied != ''", "", 0, 0); } catch (e) { return { skipped: e.message }; }
    if (!recs.length) return { gesendet: 0 };
    const status = readStatus(w.iso);
    let dirty = false, sent = 0, push = null;
    recs.forEach(rec => {
        const daten = parse(rec.get("daten"));
        const rs = remindSettings(daten);
        if (!rs.drink.on && !rs.meds.on && !rs.hands.on) return;
        let users = [];
        try { users = $app.findRecordsByFilter("benutzer", "familie = {:f} && mitglied = {:m}", "", 5, 0, { f: rec.getString("familie"), m: rec.getString("mitglied") }); } catch (e) { users = []; }
        users = users.filter(u => u.getString("rolle") !== "gast");
        if (!users.length) return;
        users.forEach(u => {
            const lang = require(`${__hooks}/pinn-pushtext.js`).langOfUser(u);
            dueReminders(rec, daten, rs, w, lang).forEach(r => {
                const key = u.id + "|" + r.key;
                if (status.gesendet[key]) return;
                // remember first: even on an error along the way, a message never comes twice
                status.gesendet[key] = Date.now();
                dirty = true;
                if (r.skip || !r.titel) return;
                if (!push) push = require(`${__hooks}/pinn-push.js`);
                try {
                    sent += push.notifyUser(u.id, { titel: r.titel, text: r.text, url: r.url, tag: r.tag, urgency: "normal", roh: true }) || 0;
                } catch (e) {
                    console.log("[Gesundheit] Push: " + e.message);
                }
            });
        });
    });
    if (dirty) writeStatus(status);
    if (sent) console.log("[Gesundheit] " + sent + " reminder(s) sent.");
    return { gesendet: sent };
}

module.exports = { COL, ensureSchema, isChild, visibleMembers, list, save, runCron, remindSettings, dueReminders };
