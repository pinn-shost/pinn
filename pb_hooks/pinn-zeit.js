// pb_hooks/pinn-zeit.js
// Central clock per profile (since 1.150.0). All reminders and schedules that depend on the time of day
// must use this module instead of a fixed time zone: the times follow the region of the person
// (and so the summer / winter time rules of that region).
//
// How it works: the PocketBase JavaScript engine has no time zone database. So the app sends the time zone
// of the device (e.g. "America/New_York") together with a small table of its UTC offsets for the next years:
//   zone: "America/New_York", wechsel: [[utc seconds, offset minutes], ...], bis: utc seconds (end of the table)
// (first row = offset from then on, then one row per change between summer and winter time).
// The table is stored per profile in pb_data/pinn_zeit.json:  { benutzer: { <profile id>: { zone, wechsel, bis, gesetzt } } }
// Past the end of the table the same date one year earlier is used (the app renews the table quietly).
//
// Which clock applies:
//   1. clockOfUser(profileId, familyId)  - the table of that profile; without one the table of a family admin,
//      then of any other profile of the family; without any table Europe/Berlin (like before 1.150.0).
//   2. clockOfFamily(familyId)           - for messages that belong to the whole family (birthdays, pets ...).
//   3. berlinClock()                     - fallback only.
//
// A clock object: { zone, offsetMs(utcMs), wall(utcMs?) -> { y, m (0-11), d, wd (0 = Sunday), min, iso },
//                   toUtc(y, m, d, minutes) -> utcMs }
//
// Usage in a new feature: const Z = require(`${__hooks}/pinn-zeit.js`); const w = Z.clockOfUser(u.id, familyId).wall();

const FILE = "/pb_data/pinn_zeit.json";
const ZONE_RE = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,3}$/;
const YEAR_S = 31556952;       // average year in seconds (365.2425 days)
const MAX_ENTRIES = 2000;
const cache = { at: 0, data: null };

function pad2(n) { return (n < 10 ? "0" : "") + n; }

// ---------------------------------------------------------------------------------------------
// Fallback: Europe/Berlin with its own summer time rule (last Sunday of March / October, 01:00 UTC)
// ---------------------------------------------------------------------------------------------
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function berlinOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}

// ---------------------------------------------------------------------------------------------
// Table check and clock
// ---------------------------------------------------------------------------------------------
// Strict check of a table from the app; anything odd -> null
function cleanTable(r) {
    if (!r || typeof r !== "object") return null;
    const zone = String(r.zone || "");
    const t = r.wechsel;
    if (!ZONE_RE.test(zone) || zone.length > 64 || !Array.isArray(t) || !t.length || t.length > 60) return null;
    const out = [];
    for (let i = 0; i < t.length; i++) {
        const row = t[i];
        if (!Array.isArray(row) || row.length !== 2) return null;
        const sec = Math.floor(Number(row[0])), min = Math.round(Number(row[1]));
        if (!isFinite(sec) || !isFinite(min) || Math.abs(min) > 18 * 60) return null;
        if (out.length && sec <= out[out.length - 1][0]) return null;
        out.push([sec, min]);
    }
    let bis = Math.floor(Number(r.bis) || 0);
    if (bis < out[out.length - 1][0]) bis = out[out.length - 1][0];
    return { zone, wechsel: out, bis };
}

// Clock of a table (null table -> Berlin)
function makeClock(table) {
    const t = table && table.wechsel;
    const has = Array.isArray(t) && t.length > 0;
    const bis = has ? Math.max(Number(table.bis) || 0, t[t.length - 1][0]) : 0;
    function offsetMs(utcMs) {
        if (!has) return berlinOffsetMs(utcMs);
        let s = Math.floor(utcMs / 1000);
        if (s > bis) s -= Math.ceil((s - bis) / YEAR_S) * YEAR_S;
        let off = t[0][1];
        for (let i = 0; i < t.length && t[i][0] <= s; i++) off = t[i][1];
        return off * 60000;
    }
    function wall(utcMs) {
        const ms = utcMs === undefined ? Date.now() : Number(utcMs);
        const w = new Date(ms + offsetMs(ms));
        const y = w.getUTCFullYear(), m = w.getUTCMonth(), d = w.getUTCDate();
        return { y, m, d, wd: w.getUTCDay(), min: w.getUTCHours() * 60 + w.getUTCMinutes(), iso: y + "-" + pad2(m + 1) + "-" + pad2(d) };
    }
    // Wall clock of this zone -> moment (ms since 1970)
    function toUtc(y, m, d, minutes) {
        const local = Date.UTC(y, m, d, 0, minutes, 0, 0);
        return local - offsetMs(local - offsetMs(local));
    }
    return { zone: has ? table.zone : "Europe/Berlin", offsetMs, wall, toUtc, bis: has ? bis : 0, standard: !has };
}

function berlinClock() { return makeClock(null); }

// ---------------------------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------------------------
function readAll() {
    const now = Date.now();
    if (cache.data && now - cache.at < 30000) return cache.data;
    let o = null;
    try {
        const text = require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(FILE));
        o = JSON.parse(text);
    } catch (e) { o = null; }
    if (!o || typeof o !== "object" || !o.benutzer || typeof o.benutzer !== "object") o = { benutzer: {} };
    cache.data = o;
    cache.at = now;
    return o;
}
function writeAll(o) {
    try {
        const tmp = FILE + ".neu";
        $os.writeFile(tmp, JSON.stringify(o), 0o644);
        $os.rename(tmp, FILE);
        cache.data = o;
        cache.at = Date.now();
        return true;
    } catch (e) {
        console.log("[Zeit] " + FILE + " not writable: " + e.message);
        return false;
    }
}

function tableOf(userId) {
    const row = readAll().benutzer[String(userId || "")];
    return row ? cleanTable(row) : null;
}

// Table of a family admin, then of any other profile of the family (for family-wide messages)
function familyTable(familyId) {
    const fam = String(familyId || "");
    if (!fam) return null;
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: fam }); } catch (e) { users = []; }
    users.sort((a, b) => (a.getString("rolle") === "admin" ? 0 : 1) - (b.getString("rolle") === "admin" ? 0 : 1));
    for (let i = 0; i < users.length; i++) {
        if (users[i].getString("rolle") === "gast") continue;
        const t = tableOf(users[i].id);
        if (t) return t;
    }
    return null;
}

function clockOfUser(userId, familyId) {
    const own = tableOf(userId);
    if (own) return makeClock(own);
    return makeClock(familyTable(familyId));
}
function clockOfFamily(familyId) {
    return makeClock(familyTable(familyId));
}

// View for the app: { zone, bis, standard }
function view(userId) {
    const t = tableOf(userId);
    return t ? { zone: t.zone, bis: t.bis, standard: false } : { zone: "Europe/Berlin", bis: 0, standard: true };
}

// Save the table of one profile (data: { zone, wechsel, bis }); throws on an invalid table
function setForUser(userId, data) {
    const id = String(userId || "");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new Error("Unbekannte Person.");
    const t = cleanTable(data);
    if (!t) throw new Error("Unbekannte Zeitzone.");
    const all = readAll();
    const old = all.benutzer[id];
    const next = { benutzer: Object.assign({}, all.benutzer) };
    next.benutzer[id] = { zone: t.zone, wechsel: t.wechsel, bis: t.bis, gesetzt: Date.now() };
    const ids = Object.keys(next.benutzer);
    if (ids.length > MAX_ENTRIES) {
        // keep the newest entries
        ids.sort((a, b) => (next.benutzer[b].gesetzt || 0) - (next.benutzer[a].gesetzt || 0));
        const keep = {};
        ids.slice(0, MAX_ENTRIES).forEach(k => { keep[k] = next.benutzer[k]; });
        next.benutzer = keep;
    }
    if (old && old.zone === t.zone && JSON.stringify(old.wechsel) === JSON.stringify(t.wechsel) && Number(old.bis) === t.bis) {
        return view(id);   // nothing changed
    }
    if (!writeAll(next)) throw new Error("Die Zeitzone konnte nicht gespeichert werden.");
    return view(id);
}

module.exports = { FILE, cleanTable, makeClock, berlinClock, clockOfUser, clockOfFamily, view, setForUser };
