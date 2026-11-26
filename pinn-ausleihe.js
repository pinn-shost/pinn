// pb_hooks/pinn-ausleihe.js
// Not a *.pb.js -> NOT loaded automatically as a hook, only included via require() (ausleihe.pb.js).
//
// Reminders for the lending list (family data → loans, area "ausleihe", since 1.163.0):
//   loans: [{ id, thing, from: { m: member ID } | { n: "Name" }, to: { m } | { n }, date, due, again (1 | 3 | 7),
//             remind, priv, by (user ID), back (YYYY-MM-DD when returned, "" = still out) }]
// Only things that are still out, have a due date and keep "remind" on are looked at. Who gets what:
//   - the person who has it (borrower, if a family member): the day before, on the due day, then again every
//     "again" days while it is overdue ("Give … back")
//   - the person who lent it (lender, if a family member): on the due day, then again every "again" days
//     while it is overdue ("… has not returned … yet")
//   - private entries only reach the profile that made them
// One push per profile and day at the time of the own daily overview (Settings → Notifications, default 07:00),
// several things are put into one message. Reminders stop 180 days after the due date.
//
// Gentle like the other reminders: the family data is read at most once a day per family – and again only if it
// changed. Markers in pb_data/pinn_ausleihe.json, entries older than two days are dropped. No message after 21:00.
// Texts are built in German; pinn-pushtext.js translates them per recipient (tag "ausleihe-<date>").

const STATUS_FILE = "/pb_data/pinn_ausleihe.json";
const SEND_UNTIL_HOUR = 21;
const DEFAULT_TIME = "07:00";
const MAX_OVERDUE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = { runCron, messagesFor };

function wallNow(clock) { return require(`${__hooks}/pinn-zeit.js`).wallOf(clock); }
function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function isIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function utcOf(iso) { const p = iso.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function diffDays(a, b) { return Math.round((utcOf(b) - utcOf(a)) / DAY_MS); }
function clean(v, n) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n); }

function readStatus() {
    let o = null;
    try { o = JSON.parse(require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(STATUS_FILE))); } catch (e) { o = null; }
    if (!o || typeof o !== "object") o = { familien: {}, gesendet: {} };
    if (!o.familien || typeof o.familien !== "object") o.familien = {};
    if (!o.gesendet || typeof o.gesendet !== "object") o.gesendet = {};
    const limit = Date.now() - 2 * DAY_MS;
    Object.keys(o.gesendet).forEach(k => { if (!(Number(o.gesendet[k]) > limit)) delete o.gesendet[k]; });
    Object.keys(o.familien).forEach(k => { if (!(Number(o.familien[k] && o.familien[k].at) > limit)) delete o.familien[k]; });
    return o;
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Ausleihe] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}

// Only what the reminders need from the family data: open loans with a due date and the member names
function snapshot(familyId, status, w) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const stamp = lib.familyDataStamp(familyId);
    const ck = familyId + "|" + w.iso;
    const c = status.familien[ck];
    if (c && c.stamp === stamp && Array.isArray(c.loans)) return c;
    let data = {};
    try { data = lib.loadFamilyDataFor(familyId) || {}; } catch (e) { data = {}; }
    const names = {};
    (Array.isArray(data.members) ? data.members : []).forEach(m => {
        if (m && m.id) names[String(m.id)] = clean((m.displayMode === "role" && m.role) ? m.role : m.name, 60);
    });
    const party = p => (p && p.m) ? { m: String(p.m) } : { n: clean(p && p.n, 60) };
    const loans = (Array.isArray(data.loans) ? data.loans : [])
        .filter(l => l && l.id && l.thing && !l.back && l.remind !== false && isIso(l.due))
        .map(l => ({ id: String(l.id), thing: clean(l.thing, 80), from: party(l.from), to: party(l.to), due: l.due,
            again: [1, 3, 7].indexOf(Number(l.again)) >= 0 ? Number(l.again) : 3, priv: !!l.priv, by: String(l.by || "") }));
    const out = { stamp: stamp, loans: loans, names: names, at: Date.now() };
    status.familien[ck] = out;
    status.dirty = true;
    return out;
}

// Messages for one profile today -> [German sentence, …]
function messagesFor(snap, userId, memberId, todayIso) {
    const out = [];
    const nameOf = p => (p.m ? (snap.names[p.m] || "") : p.n) || "?";
    snap.loans.forEach(l => {
        if (l.priv && l.by !== userId) return;
        const lender = !!(l.from.m && l.from.m === memberId);
        const borrower = !!(l.to.m && l.to.m === memberId);
        if (!lender && !borrower) return;
        const d = diffDays(todayIso, l.due);
        if (d < -MAX_OVERDUE_DAYS) return;
        const overdueNow = d < 0 && ((-d - 1) % l.again === 0);
        const thing = "„" + l.thing + "“";
        if (borrower) {
            const to = nameOf(l.from);
            if (d === 1) out.push("Morgen zurückgeben: " + thing + " an " + to);
            else if (d === 0) out.push("Heute zurückgeben: " + thing + " an " + to);
            else if (overdueNow) out.push("Überfällig: " + thing + " an " + to + " zurückgeben");
        } else {
            const who = nameOf(l.to);
            if (d === 0) out.push("Heute fällig: " + who + " gibt " + thing + " zurück");
            else if (overdueNow) out.push(who + " hat " + thing + " noch nicht zurückgegeben");
        }
    });
    return out;
}

function sendTime(push, u) {
    let st = null;
    try { st = push.readSettings(u); } catch (e) { st = null; }
    const t = toMin(st && st.uhrzeit);
    return t == null ? toMin(DEFAULT_TIME) : t;
}

function runCron() {
    const Z = require(`${__hooks}/pinn-zeit.js`);
    const status = readStatus();
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie != ''", "", 0, 0); } catch (e) { users = []; }
    users = users.filter(u => { const r = u.getString("rolle"); return r !== "hauptadmin" && r !== "gast"; });
    let push = null, sent = 0;
    users.forEach(u => {
        const familyId = u.getString("familie");
        const me = u.getString("mitglied");
        if (!familyId || !me) return;
        const w = wallNow(Z.clockOfUser(u.id, familyId));
        if (w.hour >= SEND_UNTIL_HOUR) return;
        const nowMin = w.hour * 60 + w.min;
        if (nowMin < 4 * 60) return;
        const key = w.iso + "|" + u.id;
        if (status.gesendet[key]) return;
        const snap = snapshot(familyId, status, w);
        if (!snap.loans.length) return;
        const list = messagesFor(snap, u.id, me, w.iso);
        if (!list.length) return;
        if (!push) push = require(`${__hooks}/pinn-push.js`);
        if (nowMin < sendTime(push, u)) return;
        status.gesendet[key] = Date.now();
        status.dirty = true;
        try {
            sent += push.notifyUser(u.id, {
                titel: "🤝 Ausleihe", text: list.join(" · "), url: "/?leihe=1", tag: "ausleihe-" + w.iso, urgency: "normal",
            }) || 0;
        } catch (e) { console.log("[Ausleihe] Push: " + e.message); }
    });
    if (status.dirty) { delete status.dirty; writeStatus(status); }
    if (sent) console.log("[Ausleihe] " + sent + " Erinnerung(en) verschickt.");
    return { gesendet: sent };
}
