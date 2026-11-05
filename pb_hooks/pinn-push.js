// pb_hooks/pinn-push.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
// Personal push notifications for pinn.:
//  - Event reminders (lead time adjustable per profile)
//  - Daily overview at the desired time (own events, tasks, the day's meals) - tasks come
//    from the PocketBase collection "aufgaben" (pinn-aufgaben.js), no longer from the calendar
//  - Notice when someone assigns you an event / a task
//  - Notice when someone has completed all tasks that are due so far
//  - Notice when a child has completed a task (kids' page or task list) or all of them
//  - Pinboard: new notes, replies/reactions and note reminders (sent in pinn-pinnwand.js,
//    the settings pwAlle / pwMich / pwAntworten / pwErinnerung live here with the others)
//    Completion messages only go out 10 seconds after ticking off (accidental ticking off
//    is thus not reported). If a task is reset and ticked off again, the
//    message comes again.
//  - Language and living arrangement: every message is rewritten for the recipient before sending
//    (language of their profile, family/flat share from the family data) - translations in pinn-pushtext.js.
//  - Every message additionally appears under the recipient's 🔔 bell (pinn-hinweise.js#pushMirror),
//    with a link to the matching place (?termin=, ?aufgabe= ...) - event reminders and daily overview
//    disappear there again once they are over.
// Assignment works via the "Zugewiesen: ..." line of the events and the link
// profile (collection "benutzer", field "mitglied") <-> family member.
//
// Technology: standard web push (VAPID, ES256). The signature is computed here in plain JavaScript,
// because PocketBase has no built-in function for it. Only a content-free
// "wake-up call" is sent; the service worker (pb_public/sw.js) then fetches the text itself
// via /api/pinn/push/abholen. This removes the complex payload encryption and
// no content lies with Apple/Google.
// Times: calendar times are treated as Central European Time (CET/CEST).
// Restart/update: device registrations (collection push_abos) and the key (pb_data) are
// kept. In addition, queued messages, "already sent" locks and the time window
// of the event reminders are backed up in pb_data, so that nothing is lost after a restart,
// nothing comes twice and reminders from the downtime (up to 30 min.) are made up for.
// If a device swaps its push address, the service worker reports this via
// /api/pinn/push/abo-erneuern - the device thus stays registered without activating again.

// --- P-256 / ES256 (reines JavaScript, BigInt) ---
function big(v) { return BigInt(v); }
const EC_P = big("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const EC_N = big("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const EC_GX = big("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
const EC_GY = big("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");
const B0 = big(0), B1 = big(1), B2 = big(2), B3 = big(3), B4 = big(4), B8 = big(8);

function emod(a, m) { const r = a % m; return r < B0 ? r + m : r; }
function einv(a, m) {
    let lm = B1, hm = B0, low = emod(a, m), high = m;
    while (low > B1) {
        const r = high / low;
        const nm = hm - lm * r, nw = high - low * r;
        hm = lm; high = low; lm = nm; low = nw;
    }
    return emod(lm, m);
}
// Jacobian coordinates [X, Y, Z]
function jDouble(p) {
    const X = p[0], Y = p[1], Z = p[2];
    if (Y === B0) return [B0, B1, B0];
    const YY = emod(Y * Y, EC_P);
    const S = emod(B4 * X * YY, EC_P);
    const ZZ = emod(Z * Z, EC_P);
    const M = emod(B3 * (X - ZZ) * (X + ZZ), EC_P);
    const X3 = emod(M * M - B2 * S, EC_P);
    const Y3 = emod(M * (S - X3) - B8 * YY * YY, EC_P);
    const Z3 = emod(B2 * Y * Z, EC_P);
    return [X3, Y3, Z3];
}
function jAdd(p, q) {
    if (p[2] === B0) return q;
    if (q[2] === B0) return p;
    const Z1Z1 = emod(p[2] * p[2], EC_P), Z2Z2 = emod(q[2] * q[2], EC_P);
    const U1 = emod(p[0] * Z2Z2, EC_P), U2 = emod(q[0] * Z1Z1, EC_P);
    const S1 = emod(p[1] * q[2] * Z2Z2, EC_P), S2 = emod(q[1] * p[2] * Z1Z1, EC_P);
    if (U1 === U2) return S1 === S2 ? jDouble(p) : [B0, B1, B0];
    const H = emod(U2 - U1, EC_P), R = emod(S2 - S1, EC_P);
    const HH = emod(H * H, EC_P), HHH = emod(H * HH, EC_P), V = emod(U1 * HH, EC_P);
    const X3 = emod(R * R - HHH - B2 * V, EC_P);
    const Y3 = emod(R * (V - X3) - S1 * HHH, EC_P);
    const Z3 = emod(p[2] * q[2] * H, EC_P);
    return [X3, Y3, Z3];
}
function ecMul(k, point) {
    let result = [B0, B1, B0];
    let addend = point ? [point[0], point[1], B1] : [EC_GX, EC_GY, B1];
    let n = k;
    while (n > B0) {
        if ((n & B1) === B1) result = jAdd(result, addend);
        addend = jDouble(addend);
        n = n >> B1;
    }
    const zi = einv(result[2], EC_P), zi2 = emod(zi * zi, EC_P);
    return [emod(result[0] * zi2, EC_P), emod(result[1] * zi2 * zi, EC_P)];
}
function ecAddAffine(a, b) {
    const r = jAdd([a[0], a[1], B1], [b[0], b[1], B1]);
    const zi = einv(r[2], EC_P), zi2 = emod(zi * zi, EC_P);
    return [emod(r[0] * zi2, EC_P), emod(r[1] * zi2 * zi, EC_P)];
}
function ecdsaVerify(hashHex, sigBytes, pub) {
    const r = big("0x" + bytesToHex(sigBytes.slice(0, 32))), s = big("0x" + bytesToHex(sigBytes.slice(32)));
    const w = einv(s, EC_N), z = big("0x" + hashHex);
    const R = ecAddAffine(ecMul(emod(z * w, EC_N)), ecMul(emod(r * w, EC_N), pub));
    return emod(R[0], EC_N) === r;
}
function bytesToHex(b) { let h = ""; for (let i = 0; i < b.length; i++) h += (b[i] < 16 ? "0" : "") + b[i].toString(16); return h; }
function hex64(v) { let h = v.toString(16); while (h.length < 64) h = "0" + h; return h; }
function hexToBytes(h) { const out = []; for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16)); return out; }
function b64url(bytes) {
    const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let o = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, d = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (a << 16) | (b << 8) | d;
        o += c.charAt((n >> 18) & 63) + c.charAt((n >> 12) & 63);
        if (i + 1 < bytes.length) o += c.charAt((n >> 6) & 63);
        if (i + 2 < bytes.length) o += c.charAt(n & 63);
    }
    return o;
}
function b64urlText(s) { const b = []; for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i) & 255); return b64url(b); }
function randomScalar(randHex) { return emod(big("0x" + randHex), EC_N - B1) + B1; }
function publicKeyBytes(d) { const P = ecMul(d); return [4].concat(hexToBytes(hex64(P[0]))).concat(hexToBytes(hex64(P[1]))); }
function ecdsaSign(hashHex, d, randHex) {
    const z = big("0x" + hashHex);
    for (let tries = 0; tries < 10; tries++) {
        const k = randomScalar(randHex(tries));
        const R = ecMul(k);
        const r = emod(R[0], EC_N);
        if (r === B0) continue;
        const s = emod(einv(k, EC_N) * (z + r * d), EC_N);
        if (s === B0) continue;
        return hexToBytes(hex64(r)).concat(hexToBytes(hex64(s)));
    }
    throw new Error("Signatur fehlgeschlagen");
}

// --- Time & calendar ---
// --- Time (Central Europe, fixed EU daylight saving rule) ---
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000;
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 2 * HOUR_MS : HOUR_MS;
}
function utcToWall(utcMs) { return utcMs + tzOffsetMs(utcMs); }
function wallToUtc(wall) { return wall - tzOffsetMs(wall - 2 * HOUR_MS); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function wallParts(wall) { const d = new Date(wall); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }; }
function wallIsoDate(wall) { const p = wallParts(wall); return p.y + "-" + pad2(p.m) + "-" + pad2(p.d); }
function wallHHMM(wall) { const p = wallParts(wall); return pad2(p.h) + ":" + pad2(p.mi); }

// --- ICS ---
function icsUnescape(s) { return String(s || "").replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }
function parseIcsDate(value, params) {
    const v = String(value || "").trim();
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) return null;
    const allDay = !m[4] || /VALUE=DATE(?!-)/i.test(params || "");
    let wall = Date.UTC(+m[1], +m[2] - 1, +m[3], allDay ? 0 : +m[4], allDay ? 0 : +m[5], allDay ? 0 : +(m[6] || 0));
    if (!allDay && m[7]) wall = utcToWall(wall);
    return { wall: wall, allDay: allDay };
}
function parseIcsEvents(text) {
    const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
    const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    const events = [];
    blocks.forEach(block => {
        const ev = { exdates: {}, rrule: null };
        let inAlarm = false;
        block.split(/\r?\n/).forEach(line => {
            if (/^BEGIN:VALARM/.test(line)) { inAlarm = true; return; }
            if (/^END:VALARM/.test(line)) { inAlarm = false; return; }
            if (inAlarm) return;
            const colon = line.indexOf(":");
            if (colon < 1) return;
            const head = line.slice(0, colon), value = line.slice(colon + 1);
            const semi = head.indexOf(";");
            const name = (semi === -1 ? head : head.slice(0, semi)).toUpperCase();
            const params = semi === -1 ? "" : head.slice(semi + 1);
            if (name === "SUMMARY") ev.title = icsUnescape(value).trim();
            else if (name === "DESCRIPTION") ev.description = icsUnescape(value);
            else if (name === "LOCATION") ev.location = icsUnescape(value).trim();
            else if (name === "UID") ev.uid = value.trim();
            else if (name === "DTSTART") ev.start = parseIcsDate(value, params);
            else if (name === "RRULE") ev.rrule = value.trim();
            else if (name === "RECURRENCE-ID") ev.recurrenceId = parseIcsDate(value, params);
            else if (name === "STATUS") ev.status = value.trim().toUpperCase();
            else if (name === "X-PINN-CALNAME") ev.calName = value.trim();
            else if (name === "X-PINN-HREF") ev.href = value.trim();
            else if (name === "X-PINN-OWNER") ev.owner = value.trim(); // private own calendar (pinn-kalender.js)
            else if (name === "EXDATE") value.split(",").forEach(x => { const d = parseIcsDate(x, params); if (d) ev.exdates[d.allDay ? wallIsoDate(d.wall) : String(d.wall)] = true; });
        });
        if (ev.start && ev.title) events.push(ev);
    });
    return events;
}
function parseRrule(s) {
    const r = {};
    String(s || "").split(";").forEach(part => { const i = part.indexOf("="); if (i > 0) r[part.slice(0, i).toUpperCase()] = part.slice(i + 1); });
    return r;
}
const RR_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function addMonthsWall(start, months) {
    const p = wallParts(start);
    const total = (p.y * 12 + (p.m - 1)) + months;
    const y = Math.floor(total / 12), m = total % 12;
    return { y: y, m: m, h: p.h, mi: p.mi, day: p.d };
}
function daysInMonth(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function nthWeekdayOfMonth(y, m, wd, nth) {
    if (nth > 0) {
        const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
        const day = 1 + ((wd - first + 7) % 7) + (nth - 1) * 7;
        return day <= daysInMonth(y, m) ? day : null;
    }
    const dim = daysInMonth(y, m);
    const lastWd = new Date(Date.UTC(y, m, dim)).getUTCDay();
    const day = dim - ((lastWd - wd + 7) % 7) + (nth + 1) * 7;
    return day >= 1 ? day : null;
}
// Returns all start points in time (wall-clock ms) of an event within the range [fromWall, toWall].
function occurrencesInRange(ev, fromWall, toWall) {
    const start = ev.start.wall;
    const out = [];
    const push = w => {
        const key = ev.start.allDay ? wallIsoDate(w) : String(w);
        if (w >= fromWall && w <= toWall && !ev.exdates[key]) out.push(w);
    };
    if (!ev.rrule) { push(start); return out; }
    const r = parseRrule(ev.rrule);
    const freq = (r.FREQ || "").toUpperCase();
    const interval = Math.max(1, parseInt(r.INTERVAL || "1", 10) || 1);
    const count = r.COUNT ? parseInt(r.COUNT, 10) : 0;
    let until = Infinity;
    if (r.UNTIL) { const u = parseIcsDate(r.UNTIL, ""); if (u) until = u.allDay ? u.wall + DAY_MS - 1 : u.wall; }
    const limit = Math.min(toWall, until);
    let n = 0, guard = 0;
    const emit = w => { if (w < start) return true; if (w > limit) return false; n++; if (count && n > count) return false; push(w); return true; };
    if (freq === "DAILY" && !r.BYDAY) {
        let i = 0;
        if (!count && fromWall > start) i = Math.max(0, Math.floor((fromWall - start) / (interval * DAY_MS)) - 1);
        for (; guard++ < 5000; i++) { if (!emit(start + i * interval * DAY_MS)) break; }
    } else if (freq === "WEEKLY" || (freq === "DAILY" && r.BYDAY)) {
        const byday = (r.BYDAY ? r.BYDAY.split(",") : [RR_DAYS[wallParts(start).wd]]).map(x => RR_DAYS.indexOf(x.replace(/^[+-]?\d+/, "").toUpperCase())).filter(x => x >= 0).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        const sp = wallParts(start);
        const weekStart = start - ((sp.wd + 6) % 7) * DAY_MS; // Monday of the starting week
        const stepWeeks = freq === "DAILY" ? 1 : interval;
        let w = 0;
        if (!count && fromWall > start) w = Math.max(0, Math.floor((fromWall - weekStart) / (stepWeeks * 7 * DAY_MS)) - 1);
        outer: for (; guard++ < 5000; w++) {
            const base = weekStart + w * stepWeeks * 7 * DAY_MS;
            if (base > limit) break;
            for (let j = 0; j < byday.length; j++) { if (!emit(base + ((byday[j] + 6) % 7) * DAY_MS)) break outer; }
        }
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
        const step = freq === "MONTHLY" ? interval : interval * 12;
        let i = 0;
        if (!count && fromWall > start) i = Math.max(0, Math.floor(((fromWall - start) / (DAY_MS * 30.44)) / step) - 1);
        for (; guard++ < 2000; i++) {
            const t = addMonthsWall(start, i * step);
            let day = t.day;
            if (freq === "MONTHLY" && r.BYDAY) {
                const mm = r.BYDAY.split(",")[0].match(/^([+-]?\d+)?([A-Z]{2})$/i);
                if (mm) day = nthWeekdayOfMonth(t.y, t.m, RR_DAYS.indexOf(mm[2].toUpperCase()), mm[1] ? parseInt(mm[1], 10) : 1);
            }
            const w = Date.UTC(t.y, t.m, 1, t.h, t.mi);
            if (w > limit) break;
            if (!day || day > daysInMonth(t.y, t.m)) continue;
            if (!emit(Date.UTC(t.y, t.m, day, t.h, t.mi))) break;
        }
    } else {
        push(start);
    }
    return out;
}

// =============================================================================================
// Web push: keys, sending, queue
// =============================================================================================
const PUSH_ABOS = "push_abos";
const PUSH_NACHRICHTEN = "push_nachrichten";
const PINN_USERS_P = "benutzer";
const VAPID_FILE = "/pb_data/pinn_push_vapid.json";
const HEX = "0123456789abcdef";

// Creates the collections "push_abos" and "push_nachrichten" if they are missing.
// Throws an understandable error if that does not work.
function findCollectionOrNull(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
// New collection in the format of the PocketBase JavaScript environment (new Collection({...})).
function newBaseCollection(def) {
    if (typeof Collection === "function") return new Collection(Object.assign({ type: "base" }, def));
    throw new Error("Diese PocketBase-Version kann aus Hooks keine Sammlungen anlegen.");
}
function hasFieldNamed(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
// Make sure the field "push_einstellungen" exists in the profile - otherwise time & co. are not saved
function ensureSettingsField() {
    let users = findCollectionOrNull(PINN_USERS_P);
    if (!users || hasFieldNamed(users, "push_einstellungen")) return;
    let field = null;
    try {
        if (typeof JSONField === "function") field = new JSONField({ name: "push_einstellungen", maxSize: 20000, hidden: true });
    } catch (e) { field = null; }
    if (!field) {
        const tmp = newBaseCollection({ name: "pinn_tmp_feld", fields: [{ name: "push_einstellungen", type: "json", maxSize: 20000, hidden: true }] });
        field = tmp.fields.getByName("push_einstellungen");
    }
    users.fields.add(field);
    $app.save(users);
    console.log("[Push] Feld \"push_einstellungen\" im Profil angelegt.");
}
function ensurePushCollections() {
    const users = findCollectionOrNull(PINN_USERS_P);
    if (!users) throw new Error("Sammlung \"" + PINN_USERS_P + "\" fehlt.");
    try { ensureSettingsField(); } catch (e) { console.log("[Push] Feld push_einstellungen nicht anlegbar: " + e.message); }
    const closed = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };

    let abos = findCollectionOrNull(PUSH_ABOS);
    if (!abos) {
        const build = withIndex => newBaseCollection(Object.assign({
            name: PUSH_ABOS,
            fields: [
                { name: "benutzer", type: "relation", collectionId: users.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
                { name: "endpoint", type: "text", required: true, max: 2000 },
                { name: "geraet", type: "text", max: 200 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: withIndex ? ["CREATE UNIQUE INDEX `idx_pinn_push_abos_endpoint` ON `" + PUSH_ABOS + "` (`endpoint`)"] : [],
        }, closed));
        try {
            $app.save(build(true));
        } catch (e1) {
            console.log("[Push] push_abos mit Index nicht anlegbar (" + e1.message + "), versuche ohne Index.");
            try { $app.save(build(false)); } catch (e2) { throw new Error("Sammlung \"" + PUSH_ABOS + "\" konnte nicht angelegt werden: " + e2.message); }
        }
        abos = findCollectionOrNull(PUSH_ABOS);
        if (!abos) throw new Error("Sammlung \"" + PUSH_ABOS + "\" konnte nicht angelegt werden.");
        console.log("[Push] Sammlung \"" + PUSH_ABOS + "\" angelegt.");
    }

    if (!findCollectionOrNull(PUSH_NACHRICHTEN)) {
        try {
            $app.save(newBaseCollection(Object.assign({
                name: PUSH_NACHRICHTEN,
                fields: [
                    { name: "abo", type: "relation", collectionId: abos.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
                    { name: "titel", type: "text", max: 200 },
                    { name: "text", type: "text", max: 1000 },
                    { name: "url", type: "text", max: 300 },
                    { name: "tag", type: "text", max: 200 },
                    { name: "bild", type: "text", max: 300 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                ],
            }, closed)));
            console.log("[Push] Sammlung \"" + PUSH_NACHRICHTEN + "\" angelegt.");
        } catch (e) {
            throw new Error("Sammlung \"" + PUSH_NACHRICHTEN + "\" konnte nicht angelegt werden: " + e.message);
        }
    }
    // 1.127.4: optional image of a notification (photo preview in the chat when the family chat is not end-to-end encrypted)
    try {
        const nm = findCollectionOrNull(PUSH_NACHRICHTEN);
        if (nm && !hasFieldNamed(nm, "bild")) {
            let field = null;
            try { if (typeof TextField === "function") field = new TextField({ name: "bild", max: 300 }); } catch (e) { field = null; }
            if (!field) field = newBaseCollection({ name: "pinn_tmp_feld", fields: [{ name: "bild", type: "text", max: 300 }] }).fields.getByName("bild");
            nm.fields.add(field);
            $app.save(nm);
            console.log("[Push] Feld \"bild\" in \"" + PUSH_NACHRICHTEN + "\" angelegt.");
        }
    } catch (e) { console.log("[Push] Feld bild nicht anlegbar: " + e.message); }
    return abos;
}

// Admin error log (pinn-protokoll.js) - if the file is missing, it stays with the Docker log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* log not available */ }
}

const STATUS_FILE = "/pb_data/pinn_push_status.json";
function loadPushStatus() {
    try {
        const s = JSON.parse(readTextFile(STATUS_FILE));
        return (s && typeof s === "object") ? s : {};
    } catch (e) { return {}; }
}
function savePushStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s)); } catch (e) { console.log("[Push] Status nicht speicherbar: " + e.message); plog("fehler", "push", "Push-Status konnte nicht gespeichert werden (pb_data).", { details: e.message }); }
}

// --- Persistent backup (survives restarts and updates) ---
const DELAYED_FILE = "/pb_data/pinn_push_verzoegert.json";
const SENT_FILE = "/pb_data/pinn_push_gesendet.json";
const WINDOW_FILE = "/pb_data/pinn_push_fenster.json";
const SENT_KEY = "pinnPushGesendet";
const SENT_MAX_AGE = 3 * 86400000;
function readJsonFile(path) {
    try {
        const o = JSON.parse(readTextFile(path));
        return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
}
function writeJsonFile(path, obj) {
    try { $os.writeFile(path, JSON.stringify(obj), 420); } catch (e) { console.log("[Push] " + path + " nicht speicherbar: " + e.message); plog("fehler", "push", "Push: Datei " + path + " nicht speicherbar.", { details: e.message }); }
}
function pruneSent(map) {
    const cutoff = Date.now() - SENT_MAX_AGE;
    Object.keys(map).forEach(k => { if (typeof map[k] !== "number" || map[k] < cutoff) delete map[k]; });
    return map;
}
// On start: load backed-up queued entries, locks and time windows into the cache
function restorePersisted() {
    const store = $app.store();
    const info = { verzoegert: 0, gesendet: 0, fenster: false };
    const delayed = readJsonFile(DELAYED_FILE);
    if (delayed && Object.keys(delayed).length) {
        try { store.set(DELAY_KEY, JSON.stringify(delayed)); info.verzoegert = Object.keys(delayed).length; } catch (e) { /* ignore */ }
    }
    const sent = pruneSent(readJsonFile(SENT_FILE) || {});
    try { store.set(SENT_KEY, JSON.stringify(sent)); info.gesendet = Object.keys(sent).length; } catch (e) { /* ignore */ }
    const win = readJsonFile(WINDOW_FILE);
    if (win && typeof win.bis === "number") {
        try { store.set(WINDOW_KEY, win.bis); info.fenster = true; } catch (e) { /* ignore */ }
    }
    return info;
}
function countSubscriptions() {
    try { return $app.findAllRecords(PUSH_ABOS).length; } catch (e) { return 0; }
}

// The service worker reports a new push address of its device (the browser swapped it).
// Only whoever knows the old, secret address can replace it - i.e. only the device itself.
function renewSubscription(oldEndpoint, newEndpoint) {
    const alt = String(oldEndpoint || ""), neu = String(newEndpoint || "");
    if (!alt || !/^https:\/\//i.test(neu) || neu.length > 2000) return { ok: false, grund: "Ungültige Geräte-Adresse." };
    if (alt === neu) return { ok: true };
    let rec = null;
    try { rec = $app.findFirstRecordByFilter(PUSH_ABOS, "endpoint = {:e}", { e: alt }); } catch (e) { rec = null; }
    if (!rec) return { ok: false, grund: "Altes Gerät unbekannt." };
    let existing = null;
    try { existing = $app.findFirstRecordByFilter(PUSH_ABOS, "endpoint = {:e}", { e: neu }); } catch (e) { existing = null; }
    if (existing) {
        if (existing.getString("benutzer") !== rec.getString("benutzer")) {
            existing.set("benutzer", rec.getString("benutzer"));
            $app.save(existing);
        }
        $app.delete(rec);
    } else {
        rec.set("endpoint", neu);
        $app.save(rec);
    }
    console.log("[Push] Push-Adresse eines Geräts wurde erneuert.");
    return { ok: true };
}

function randHex() { return $security.randomStringWithAlphabet(64, HEX); }
function readTextFile(path) {
    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    return calendarSync.bytesToText($os.readFile(path));
}

function engineSupportsPush() {
    try { return typeof BigInt === "function" && BigInt("0x10") + BigInt(1) === BigInt(17); } catch (e) { return false; }
}

// VAPID key pair: generated randomly on first need and stored in pb_data (not in
// the database, not in the code). Whoever deletes the file has to activate push again on all devices.
function loadVapid(createIfMissing) {
    let v = null;
    try { v = JSON.parse(readTextFile(VAPID_FILE)); } catch (e) { v = null; }
    if (v && v.privateHex && v.publicKey) return v;
    if (!createIfMissing) return null;
    const d = randomScalar(randHex());
    v = { privateHex: hex64(d), publicKey: b64url(publicKeyBytes(d)), subject: "" };
    $os.writeFile(VAPID_FILE, JSON.stringify(v));
    console.log("[Push] Neues VAPID-Schlüsselpaar erzeugt.");
    return v;
}
// Apple (web.push.apple.com) rejects the wake-up call with "403 BadJwtToken" if the sender (sub)
// does not name a real domain - e.g. an IP address, localhost, *.local or example.org.
// Therefore only a sender that Apple accepts is used.
const FALLBACK_SUBJECT = "https://pocketbase.io";
function isUsableSubject(s) {
    s = String(s || "").trim();
    let host = "";
    let m = s.match(/^mailto:[^@\s]+@([^\s>]+)$/i);
    if (m) host = m[1];
    else {
        m = s.match(/^https:\/\/([^\/:?#\s]+)(?::\d+)?(?:[\/?#].*)?$/i);
        if (m) host = m[1];
    }
    if (!host) return false;
    host = host.toLowerCase();
    if (/^\d+(\.\d+){3}$/.test(host) || host.indexOf(":") !== -1) return false; // IP-Adresse
    if (/(^|\.)(localhost|local|lan|home|internal|intranet|invalid|test|example|localdomain|home\.arpa|fritz\.box)$/.test(host)) return false;
    if (/(^|\.)example\.(com|org|net)$/.test(host)) return false;
    return /\.[a-z]{2,}$/.test(host);
}
// An address like "https://deine-subdomain.duckdns.org:8443" becomes "https://deine-subdomain.duckdns.org"
function subjectFromOrigin(origin) {
    const m = String(origin || "").trim().match(/^(?:https?:\/\/)?([^\/:?#\s,]+)/i);
    if (!m) return "";
    const s = "https://" + m[1].toLowerCase();
    return isUsableSubject(s) ? s : "";
}
function saveVapidSubject(subject) {
    if (!isUsableSubject(subject)) return;
    const v = loadVapid(true);
    if (v.subject === subject) return;
    v.subject = subject;
    $os.writeFile(VAPID_FILE, JSON.stringify(v));
    console.log("[Push] Absender für Push-Dienste: " + subject);
}
// Remembers the public address of pinn. from an app request (Origin or proxy header)
function rememberSubjectFromRequest(e) {
    const header = name => { try { return String(e.request.header.get(name) || ""); } catch (err) { return ""; } };
    let host = "";
    try { host = String(e.request.host || ""); } catch (err) { host = ""; }
    const s = subjectFromOrigin(header("Origin")) ||
        subjectFromOrigin(header("Referer")) ||
        subjectFromOrigin(header("X-Forwarded-Host").split(",")[0]) ||
        subjectFromOrigin(host);
    if (s) { try { saveVapidSubject(s); } catch (err) { /* ignore */ } }
}
function vapidSubject(v) {
    let env = "";
    try { env = String($os.getenv("PINN_PUSH_KONTAKT") || "").trim(); } catch (e) { env = ""; }
    if (env) {
        const s = /^(mailto:|https:)/i.test(env) ? env : (env.indexOf("@") !== -1 ? "mailto:" + env : "https://" + env);
        if (isUsableSubject(s)) return s;
    }
    if (v && isUsableSubject(v.subject)) return v.subject;
    return FALLBACK_SUBJECT;
}

// Self-test on start: generate/load the key, sign and verify the signature again.
function selfTest() {
    if (!engineSupportsPush()) return { ok: false, message: "Die JavaScript-Umgebung von PocketBase unterstützt kein BigInt - Push ist mit dieser PocketBase-Version nicht möglich." };
    try {
        const v = loadVapid(true);
        const d = big("0x" + v.privateHex);
        const pubBytes = publicKeyBytes(d);
        if (b64url(pubBytes) !== v.publicKey) return { ok: false, message: "VAPID-Schlüsseldatei ist beschädigt (" + VAPID_FILE + " löschen, dann wird neu erzeugt)." };
        const hash = $security.sha256("pinn-push-selbsttest");
        const sig = ecdsaSign(hash, d, randHex);
        const pubPoint = [big("0x" + bytesToHex(pubBytes.slice(1, 33))), big("0x" + bytesToHex(pubBytes.slice(33)))];
        if (!ecdsaVerify(hash, sig, pubPoint)) return { ok: false, message: "Signatur-Selbsttest fehlgeschlagen." };
        return { ok: true, message: "bereit" };
    } catch (e) {
        return { ok: false, message: "Push-Selbsttest: " + e.message };
    }
}

function vapidAuthHeader(endpoint) {
    const m = String(endpoint).match(/^(https?:\/\/[^\/]+)/i);
    const aud = m ? m[1] : endpoint;
    const store = $app.store();
    const v = loadVapid(true);
    const sub = vapidSubject(v);
    const cacheKey = "pinnVapidJwt:" + aud + "|" + sub + "|" + v.publicKey;
    const nowSec = Math.floor(Date.now() / 1000);
    try {
        const cached = store.get(cacheKey);
        if (cached && cached.exp - 3600 > nowSec) return cached.header;
    } catch (e) { /* no cache */ }
    const exp = nowSec + 12 * 3600;
    const input = b64urlText(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." +
        b64urlText(JSON.stringify({ aud: aud, exp: exp, sub: sub }));
    const sig = ecdsaSign($security.sha256(input), big("0x" + v.privateHex), randHex);
    const header = "vapid t=" + input + "." + b64url(sig) + ", k=" + v.publicKey;
    try { store.set(cacheKey, { header: header, exp: exp }); } catch (e) { /* ignore */ }
    return header;
}

// Sends a (content-free) wake-up call to a device. The service worker then fetches the actual
// text itself via /api/pinn/push/abholen - so no payload encryption is needed.
function sendWakeup(endpoint, urgency) {
    const res = $http.send({
        url: endpoint,
        method: "POST",
        timeout: 15,
        headers: {
            "TTL": "86400",
            "Urgency": urgency || "normal",
            "Authorization": vapidAuthHeader(endpoint),
        },
        body: "",
    });
    let body = "";
    try { body = String(res.raw || ""); } catch (e) { body = ""; }
    return { status: res.statusCode, body: body.slice(0, 300) };
}
function pushServiceName(endpoint) {
    const e = String(endpoint || "");
    if (/push\.apple\.com/i.test(e)) return "Apple";
    if (/googleapis|fcm/i.test(e)) return "Google";
    if (/mozilla/i.test(e)) return "Mozilla";
    if (/windows|notify\.live/i.test(e)) return "Microsoft";
    return "Push-Dienst";
}
function describeFailure(endpoint, status, body) {
    let reason = "";
    try { reason = (JSON.parse(body) || {}).reason || ""; } catch (e) { reason = String(body || "").trim(); }
    let text = pushServiceName(endpoint) + " lehnt ab (Status " + status + (reason ? ", " + reason : "") + ")";
    if (/BadJwtToken/i.test(reason)) text += " - Absender der Anmeldung wird nicht akzeptiert (aktuell: " + vapidSubject(loadVapid(true)) + ")";
    else if (/VapidPkHashMismatch|BadWebPushTopic/i.test(reason) || status === 403) text += " - bitte auf dem Gerät deaktivieren und neu aktivieren";
    return text;
}

// Puts the message into the queue for each device of the profile and wakes the device.
// Result: { sent, geraete, fehler: [text, ...] }
function notifyUserDetailed(userId, msg) {
    const result = { sent: 0, geraete: 0, fehler: [] };
    // Text in the recipient's language and matching the living arrangement (family/flat share) - see pinn-pushtext.js.
    // Applies to the phone and the 🔔 bell; on an error, the German text stays.
    // msg.roh = true: text typed by a person (chat without end-to-end encryption) - is never translated
    if (!(msg && msg.roh === true)) {
        try { msg = require(`${__hooks}/pinn-pushtext.js`).localize(userId, msg); }
        catch (e) { console.log("[Push] Übersetzung nicht verfügbar: " + e.message); }
    }
    // Every message additionally appears as a notice under the recipient's 🔔 bell (even without a
    // registered device). msg.hinweis = false prevents this (e.g. test message).
    if (msg && msg.hinweis !== false) {
        try { require(`${__hooks}/pinn-hinweise.js`).pushMirror(userId, msg); }
        catch (e) { console.log("[Push] Hinweis für die Glocke nicht gespeichert: " + e.message); }
    }
    let abos = [];
    try { abos = $app.findRecordsByFilter(PUSH_ABOS, "benutzer = {:u}", "", 0, 0, { u: userId }); } catch (e) { result.fehler.push("Sammlung \"" + PUSH_ABOS + "\" nicht lesbar: " + e.message); return result; }
    result.geraete = abos.length;
    if (!abos.length) return result;
    let msgCol = null;
    try { msgCol = $app.findCollectionByNameOrId(PUSH_NACHRICHTEN); } catch (e) { result.fehler.push("Sammlung \"" + PUSH_NACHRICHTEN + "\" fehlt."); return result; }
    abos.forEach(abo => {
        let rec = null;
        try {
            rec = new Record(msgCol);
            rec.set("abo", abo.id);
            rec.set("titel", String(msg.titel || "pinn.").slice(0, 200));
            rec.set("text", String(msg.text || "").slice(0, 1000));
            rec.set("url", String(msg.url || "/").slice(0, 300));
            rec.set("tag", String(msg.tag || "").slice(0, 200));
            if (msg.bild) { try { rec.set("bild", String(msg.bild).slice(0, 300)); } catch (e4) { /* old installation without the field */ } }
            $app.save(rec);
            const endpoint = abo.getString("endpoint");
            const r = sendWakeup(endpoint, msg.urgency);
            const status = r.status;
            if (status === 404 || status === 410) {
                console.log("[Push] Gerät abgemeldet (Status " + status + "), Abo wird entfernt.");
                result.fehler.push("Gerät ist beim " + pushServiceName(endpoint) + "-Dienst nicht mehr angemeldet - bitte neu aktivieren");
                $app.delete(abo);
                try { $app.delete(rec); } catch (e2) { /* ignore */ }
            } else if (status < 200 || status >= 300) {
                const text = describeFailure(endpoint, status, r.body);
                console.log("[Push] Versand fehlgeschlagen: " + text + " | Antwort: " + r.body);
                plog("fehler", "push", "Push-Versand fehlgeschlagen: " + text, { benutzer: userId, details: r.body });
                result.fehler.push(text);
                try { $app.delete(rec); } catch (e2) { /* ignore */ }
            } else {
                result.sent++;
            }
        } catch (e) {
            console.log("[Push] Fehler beim Versand: " + e.message);
            plog("fehler", "push", "Push-Dienst nicht erreichbar: " + e.message, { benutzer: userId });
            result.fehler.push("Server erreicht den Push-Dienst nicht: " + e.message);
            if (rec) { try { $app.delete(rec); } catch (e3) { /* ignore */ } }
        }
    });
    return result;
}
function notifyUser(userId, msg) {
    return notifyUserDetailed(userId, msg).sent;
}

// Fetches the NEWEST waiting message of a device (and removes it from the queue).
// Formerly the oldest was taken: if a wake-up call got lost once (device off, iOS discarded
// it), its message stayed around and every following wake-up call showed the previous
// message - e.g. today the daily overview of yesterday. Leftover messages that are older than
// STALE_MS are therefore discarded and never shown any more.
const STALE_MS = 6 * HOUR_MS;
function pbDate(ms) { return new Date(ms).toISOString().replace("T", " "); }
function takeMessage(endpoint) {
    let abo = null;
    try { abo = $app.findFirstRecordByFilter(PUSH_ABOS, "endpoint = {:e}", { e: String(endpoint || "") }); } catch (e) { return null; }
    // Discard outdated messages of this device
    try {
        $app.findRecordsByFilter(PUSH_NACHRICHTEN, "abo = {:a} && created < {:c}", "", 200, 0, { a: abo.id, c: pbDate(Date.now() - STALE_MS) })
            .forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
    let recs = [];
    try { recs = $app.findRecordsByFilter(PUSH_NACHRICHTEN, "abo = {:a}", "-created", 1, 0, { a: abo.id }); } catch (e) { recs = []; }
    if (!recs.length) return null;
    const r = recs[0];
    const out = { titel: r.getString("titel"), text: r.getString("text"), url: r.getString("url") || "/", tag: r.getString("tag") };
    let picture = "";
    try { picture = r.getString("bild"); } catch (e) { picture = ""; }
    if (picture) out.bild = picture;
    try { $app.delete(r); } catch (e) { /* ignore */ }
    return out;
}

// =============================================================================================
// App badge: open tasks of a profile that are due so far (same rule as in the app:
// earlier days + today, with a time window only from its start, only assigned ones or "All").
// The service worker receives the number when fetching a message and sets it on the app icon.
// =============================================================================================
function openTaskCountForUser(userRec) {
    if (!userRec) return 0;
    const familyId = userRec.getString("familie");
    const memberId = userRec.getString("mitglied");
    if (!familyId || !memberId) return 0;
    let members = [];
    try {
        const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {};
        members = data.members || [];
    } catch (e) { members = []; }
    if (!members.length) return 0;
    const nowWall = utcToWall(Date.now());
    const today = wallIsoDate(nowWall), hm = wallHHMM(nowWall);
    let recs = [];
    try {
        recs = $app.findRecordsByFilter("aufgaben", "familie = {:f} && erledigt = false && faellig != '' && faellig <= {:d}", "", 0, 0, { f: familyId, d: today });
    } catch (e) { return 0; }
    let n = 0;
    recs.forEach(r => {
        const due = r.getString("faellig").slice(0, 10);
        if (!due || due > today) return;
        const von = r.getString("von");
        if (due === today && von && von > hm) return;
        const assign = assigneesFromText(r.getString("notizen"), members);
        if (assign.all || assign.memberIds.indexOf(memberId) !== -1) n++;
    });
    return n;
}
// Number for the device with this push address; null if unknown (then the worker leaves it as it is)
function badgeForEndpoint(endpoint) {
    try {
        const abo = $app.findFirstRecordByFilter(PUSH_ABOS, "endpoint = {:e}", { e: String(endpoint || "") });
        const userId = abo.getString("benutzer");
        if (!userId) return null;
        const user = $app.findRecordById(PINN_USERS_P, userId);
        return openTaskCountForUser(user);
    } catch (e) {
        return null;
    }
}

function cleanupOldMessages() {
    try {
        const old = $app.findRecordsByFilter(PUSH_NACHRICHTEN, "created < {:c}", "", 200, 0, { c: pbDate(Date.now() - STALE_MS) });
        old.forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
}

// =============================================================================================
// Personal settings
// =============================================================================================
// alleErledigt: notice when someone (not a child) has completed all tasks that are due so far
// kindAufgabe:  notice when a child has completed a task (kids' page or task list)
// tagesHaushalt: include household tasks (rotation/cleaning plan) in the daily overview (default: yes)
// kindAlle:     notice when a child has completed all tasks
// animation:    celebration animation in the app when you have completed all tasks yourself (no push)
// pwAlle:       pinboard - new note for the whole family
// pwMich:       pinboard - notes to me, thank-yous to me and important notes
// pwAntworten:  pinboard - replies, reactions and votes on my notes
// pwErinnerung: pinboard - reminders attached to a note
// vorrat:       pantry - items expire soon (best-before date, pinn-vorrat.js)
// muell:        waste collection - reminder on the day before at the time muellZeit (waste calendar, since 1.31)
const DEFAULT_SETTINGS = { termine: true, vorlauf: 30, ohneZuweisung: true, tagesuebersicht: true, uhrzeit: "07:00", tagesHaushalt: true, zuweisungen: true, alleErledigt: true, kindAufgabe: true, kindAlle: true, animation: true, pwAlle: true, pwMich: true, pwAntworten: true, pwErinnerung: true, chat: true, vorrat: true, muell: true, muellZeit: "18:00", updates: true };
const BOOL_SETTINGS = ["termine", "ohneZuweisung", "tagesuebersicht", "tagesHaushalt", "zuweisungen", "alleErledigt", "kindAufgabe", "kindAlle", "animation", "pwAlle", "pwMich", "pwAntworten", "pwErinnerung", "chat", "vorrat", "muell", "updates"];
function normalizeSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, (raw && typeof raw === "object") ? raw : {});
    const lead = parseInt(s.vorlauf, 10);
    s.vorlauf = [5, 10, 15, 30, 60, 120, 1440].indexOf(lead) !== -1 ? lead : DEFAULT_SETTINGS.vorlauf;
    s.uhrzeit = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.uhrzeit)) ? String(s.uhrzeit) : DEFAULT_SETTINGS.uhrzeit;
    s.muellZeit = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.muellZeit)) ? String(s.muellZeit) : DEFAULT_SETTINGS.muellZeit;
    BOOL_SETTINGS.forEach(k => { s[k] = !!s[k]; });
    return {
        termine: s.termine, vorlauf: s.vorlauf, ohneZuweisung: s.ohneZuweisung, tagesuebersicht: s.tagesuebersicht, uhrzeit: s.uhrzeit, tagesHaushalt: s.tagesHaushalt, zuweisungen: s.zuweisungen,
        alleErledigt: s.alleErledigt, kindAufgabe: s.kindAufgabe, kindAlle: s.kindAlle, animation: s.animation,
        pwAlle: s.pwAlle, pwMich: s.pwMich, pwAntworten: s.pwAntworten, pwErinnerung: s.pwErinnerung, chat: s.chat,
        vorrat: s.vorrat, muell: s.muell, muellZeit: s.muellZeit, updates: s.updates,
    };
}
function readSettings(userRec) {
    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    return normalizeSettings(calendarSync.parseRecordData(userRec.get("push_einstellungen")));
}

// =============================================================================================
// Familie: Mitglieder <-> Profile
// =============================================================================================
function memberLabelServer(m) { return (m.displayMode === "role" && m.role) ? m.role : m.name; }

// Members and profiles of ONE family including their calendar settings (selection, tasks
// calendar). Credentials are not needed here and are therefore not decrypted either.
function loadPeople(familyId) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const data = familyId ? (lib.loadFamilyDataFor(familyId) || {}) : {};
    const config = (data.appleCalendar && typeof data.appleCalendar === "object") ? data.appleCalendar : {};
    const members = data.members || [];
    let users = [];
    if (familyId) {
        try { users = $app.findRecordsByFilter(PINN_USERS_P, "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    }
    const people = users.map(u => {
        const mid = u.getString("mitglied");
        const m = mid ? members.find(x => x.id === mid) : null;
        return {
            userId: u.id,
            memberId: m ? m.id : "",
            name: m ? m.name : u.getString("username"),
            settings: readSettings(u),
        };
    });
    return { familyId: familyId || "", data: data, config: config, members: members, people: people };
}

// Reads the "Zugewiesen: ..." line. Result: { line: bool, all: bool, memberIds: [] }
function assigneesFromText(text, members) {
    const match = String(text || "").match(/Zugewiesen:\s*(.+)/);
    if (!match) return { line: false, all: false, memberIds: [] };
    const names = match[1].split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (names.indexOf("alle") !== -1) return { line: true, all: true, memberIds: members.map(m => m.id) };
    const ids = members.filter(m => names.indexOf(String(memberLabelServer(m) || "").toLowerCase()) !== -1 || names.indexOf(String(m.name || "").toLowerCase()) !== -1).map(m => m.id);
    return { line: true, all: false, memberIds: ids };
}
function isRelevantFor(person, assign) {
    if (!assign.line) return person.settings.ohneZuweisung;
    if (assign.all) return true;
    return !!person.memberId && assign.memberIds.indexOf(person.memberId) !== -1;
}
function otherNames(person, assign, members) {
    if (!assign.line || assign.all) return [];
    return assign.memberIds.filter(id => id !== person.memberId).map(id => {
        const m = members.find(x => x.id === id);
        return m ? m.name : null;
    }).filter(Boolean);
}

// =============================================================================================
// Reading the calendar
// =============================================================================================
const DONE_PREFIX = "\u2705 ";
// Events from the calendar file of ONE family
function loadCalendarEvents(familyId) {
    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    const path = calendarSync.kalenderPfad(familyId);
    if (!path) return [];
    let text = "";
    try { text = readTextFile(path); } catch (e) { text = ""; }
    // The family's own calendars (shared and private - private ones only for their profile, X-PINN-OWNER)
    try { text += "\n" + require(`${__hooks}/pinn-kalender.js`).icsAllForFamily(familyId); } catch (e) { /* does not exist */ }
    const events = parseIcsEvents(text).filter(ev => ev.status !== "CANCELLED");
    // Individually edited events of a series (RECURRENCE-ID) replace the series event
    const overrides = {};
    events.forEach(ev => {
        if (ev.recurrenceId && ev.uid) {
            (overrides[ev.uid] = overrides[ev.uid] || []).push(ev.recurrenceId.allDay ? wallIsoDate(ev.recurrenceId.wall) : String(ev.recurrenceId.wall));
        }
    });
    events.forEach(ev => {
        if (!ev.recurrenceId && ev.rrule && ev.uid && overrides[ev.uid]) overrides[ev.uid].forEach(k => { ev.exdates[k] = true; });
    });
    return events;
}

const WEEKDAY_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function fmtWallDate(wall) {
    const d = new Date(wall);
    return WEEKDAY_SHORT[d.getUTCDay()] + ", " + pad2(d.getUTCDate()) + "." + pad2(d.getUTCMonth() + 1) + ".";
}
function joinNames(list) {
    if (list.length <= 1) return list.join("");
    return list.slice(0, -1).join(", ") + " und " + list[list.length - 1];
}
function leadText(min) {
    if (min >= 1440) return "Morgen";
    if (min >= 60) return "In " + (min / 60) + (min === 60 ? " Stunde" : " Stunden");
    return "In " + min + " Minuten";
}

// =============================================================================================
// Cron: event reminders + daily overview (every 5 minutes)
// =============================================================================================
const WINDOW_KEY = "pinnPushWindowUntil";
const HALF_STEP = 150000; // 2.5 minutes - the cron runs every 5 minutes, each run covers ±2.5 min

function runPushCron() {
    const now = Date.now();
    const store = $app.store();
    let last = null;
    try { last = store.get(WINDOW_KEY); } catch (e) { last = null; }
    if (typeof last !== "number") {
        // Cache empty (e.g. after a restart) -> use the backed-up time window
        const win = readJsonFile(WINDOW_FILE);
        last = win && typeof win.bis === "number" ? win.bis : null;
    }
    if (typeof last !== "number" || last < now - 30 * 60000 || last > now + 10 * 60000) last = now - HALF_STEP;
    const until = now + HALF_STEP;
    try { store.set(WINDOW_KEY, until); } catch (e) { /* ignore */ }
    writeJsonFile(WINDOW_FILE, { bis: until });
    if (until <= last) return;

    cleanupOldMessages();
    if (!engineSupportsPush()) return;

    let subscribed = {};
    try {
        $app.findAllRecords(PUSH_ABOS).forEach(a => { subscribed[a.getString("benutzer")] = true; });
    } catch (e) { return; }
    const subscribedIds = Object.keys(subscribed);
    if (!subscribedIds.length) return;

    // Determine families with registered devices - each family has its own data
    const families = {};
    subscribedIds.forEach(id => {
        try {
            const fam = $app.findRecordById(PINN_USERS_P, id).getString("familie");
            if (fam) families[fam] = true;
        } catch (e) { /* profile deleted */ }
    });
    const familyIds = Object.keys(families);
    if (!familyIds.length) return;

    const status = loadPushStatus();
    status.tagesuebersicht = status.tagesuebersicht || {};
    let statusChanged = false;

    familyIds.forEach(familyId => {
        try {
            const ctx = loadPeople(familyId);
            const people = ctx.people.filter(p => subscribed[p.userId]);
            if (!people.length) return;
            const events = loadCalendarEvents(familyId); // each family has its own calendar file
            if (runFamilyReminders(ctx, people, events, last, until, now, status)) statusChanged = true;
        } catch (e) {
            console.log("[Push] Fehler bei einer Familie: " + e.message);
            plog("fehler", "push", "Erinnerungen konnten nicht geprüft werden: " + e.message, { familie: familyId });
        }
    });
    if (statusChanged) savePushStatus(status);
}

// Event reminders + daily overview for the registered profiles of ONE family.
// Returns true if the daily overview status has changed.
function runFamilyReminders(ctx, people, events, last, until, now, status) {
    const taskCal = ctx.config.taskCalendarName || "";

    // --- Terminerinnerungen ---
    const reminderPeople = people.filter(p => p.settings.termine);
    if (reminderPeople.length && events.length) try {
        const maxLead = Math.max.apply(null, reminderPeople.map(p => p.settings.vorlauf)) * 60000;
        const fromWall = utcToWall(last) - HALF_STEP;
        const toWall = utcToWall(until + maxLead) + HALF_STEP;
        events.forEach(ev => {
            if (ev.start.allDay || (taskCal && ev.calName === taskCal)) return;
            if (ev.title.indexOf(DONE_PREFIX) === 0) return;
            const assign = assigneesFromText(ev.description, ctx.members);
            occurrencesInRange(ev, fromWall, toWall).forEach(w => {
                const startUtc = wallToUtc(w);
                if (startUtc < now - 60000) return; // The event has already started (during a restart)
                reminderPeople.forEach(p => {
                    const fireAt = startUtc - p.settings.vorlauf * 60000;
                    if (fireAt <= last || fireAt > until) return;
                    if (ev.owner ? ev.owner !== p.userId : !isRelevantFor(p, assign)) return; // private calendars only for their profile
                    const others = otherNames(p, assign, ctx.members);
                    const parts = [leadText(p.settings.vorlauf) + (p.settings.vorlauf >= 1440 ? ", " + fmtWallDate(w) : "")];
                    if (ev.location) parts.push(ev.location);
                    if (others.length) parts.push("mit " + joinNames(others));
                    notifyUser(p.userId, {
                        titel: ev.title + " um " + wallHHMM(w),
                        text: parts.join(" · "),
                        url: "/?termin=" + wallIsoDate(w),
                        tag: "termin-" + (ev.uid || ev.title) + "-" + w,
                        urgency: "high",
                        bis: startUtc + HOUR_MS, // in the bell only until one hour after the start
                    });
                });
            });
        });
    } catch (e) {
        console.log("[Push] Terminerinnerungen fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Terminerinnerungen fehlgeschlagen: " + e.message, { familie: ctx && ctx.familyId ? ctx.familyId : "" });
    }

    // --- Daily overview ---
    // Is sent as soon as the desired time is reached and it has not gone out yet today
    // (made up for up to 3 hours, e.g. after a restart or when a run was skipped).
    // Which day has already been sent is stored in pb_data/pinn_push_status.json.
    let changed = false;
    try {
        const nowWall = utcToWall(now);
        const todayIso = wallIsoDate(nowWall);
        const tp = todayIso.split("-");
        const dayWall = Date.UTC(+tp[0], +tp[1] - 1, +tp[2]);
        people.filter(p => p.settings.tagesuebersicht).forEach(p => {
            if (status.tagesuebersicht[p.userId] === todayIso) return;
            const hm = p.settings.uhrzeit.split(":");
            const fireWall = dayWall + (+hm[0]) * HOUR_MS + (+hm[1]) * MIN_MS;
            if (nowWall + HALF_STEP < fireWall) return;      // not yet time
            if (nowWall - fireWall > 3 * HOUR_MS) return;     // too long ago -> again tomorrow
            const msg = buildDigest(p, ctx, events, taskCal, dayWall, +hm[0]);
            const r = notifyUserDetailed(p.userId, msg);
            if (r.sent > 0 || !r.geraete) {
                status.tagesuebersicht[p.userId] = todayIso;
                changed = true;
                console.log("[Push] Tagesübersicht für " + p.name + " an " + r.sent + " Gerät(e) gesendet.");
            } else {
                console.log("[Push] Tagesübersicht für " + p.name + " nicht zugestellt: " + r.fehler.join(" | "));
                plog("warnung", "push", "Tagesübersicht für „" + p.name + "“ nicht zugestellt: " + r.fehler.filter((x, i, a) => a.indexOf(x) === i).join(" | "), { benutzer: p.userId });
            }
        });
    } catch (e) {
        console.log("[Push] Tagesübersicht fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Tagesübersicht fehlgeschlagen: " + e.message, { familie: ctx && ctx.familyId ? ctx.familyId : "" });
    }
    // --- Extra reminder for tasks (since 1.57) ---
    try {
        if (runTaskReminders(ctx, people, now, status)) changed = true;
    } catch (e) {
        console.log("[Push] Aufgaben-Erinnerung fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Aufgaben-Erinnerung fehlgeschlagen: " + e.message, { familie: ctx && ctx.familyId ? ctx.familyId : "" });
    }
    // --- Waste collection on the day before ---
    try {
        if (runMuellReminder(ctx, people, now, status)) changed = true;
    } catch (e) {
        console.log("[Push] Müll-Erinnerung fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Müll-Erinnerung fehlgeschlagen: " + e.message, { familie: ctx && ctx.familyId ? ctx.familyId : "" });
    }
    return changed;
}

// Extra reminder (since 1.57): open tasks with a time in the field "erinnerung" that are due today.
// Recipients: the assigned ones; for "All" or without assignment all adults (children only if they are
// explicitly assigned). Once per task, profile and day (status.aufgabenErinnerung);
// made up for up to 3 hours, e.g. after a restart.
function runTaskReminders(ctx, people, now, status) {
    if (!people.length) return false;
    const nowWall = utcToWall(now);
    const todayIso = wallIsoDate(nowWall);
    const tp = todayIso.split("-");
    const dayWall = Date.UTC(+tp[0], +tp[1] - 1, +tp[2]);
    const st = status.aufgabenErinnerung = status.aufgabenErinnerung || {};
    let changed = false;
    Object.keys(st).forEach(k => { if (st[k] !== todayIso) { delete st[k]; changed = true; } });
    const list = require(`${__hooks}/pinn-aufgaben.js`).remindersDue(ctx.familyId, todayIso);
    list.forEach(t => {
        const hm = t.erinnerung.split(":");
        const fireWall = dayWall + (+hm[0]) * HOUR_MS + (+hm[1]) * MIN_MS;
        if (nowWall + HALF_STEP < fireWall || nowWall - fireWall > 3 * HOUR_MS) return;
        const assign = assigneesFromText(t.notizen, ctx.members);
        const explicit = assign.line && !assign.all;
        people.forEach(p => {
            const key = t.id + "|" + p.userId;
            if (st[key]) return;
            const member = p.memberId ? ctx.members.find(m => m.id === p.memberId) : null;
            const isChild = !!(member && (isChildMember(member) || member.childLock));
            const mine = explicit && !!p.memberId && assign.memberIds.indexOf(p.memberId) !== -1;
            if (explicit ? !mine : isChild) { st[key] = todayIso; changed = true; return; }
            const r = notifyUserDetailed(p.userId, {
                titel: "🔔 " + t.titel,
                text: mine ? "Heute fällig – du bist dran." : "Heute fällig.",
                url: "/?aufgabe=" + encodeURIComponent(t.id),
                tag: "aufgabe-erinnerung-" + t.id,
                bis: wallToUtc(dayWall + DAY_MS),
            });
            if (r.sent > 0 || !r.geraete) { st[key] = todayIso; changed = true; }
            else plog("warnung", "push", "Aufgaben-Erinnerung für „" + p.name + "“ nicht zugestellt: " + r.fehler.filter((x, i, a) => a.indexOf(x) === i).join(" | "), { benutzer: p.userId });
        });
    });
    return changed;
}

// Reminder on the day before the waste collection at the own time (setting muellZeit). Adults always
// get it (if switched on), children only if it is their turn to take it out. Once per profile and day
// (status.muell); made up for up to 3 hours. If nothing is due tomorrow, the day counts as done.
function runMuellReminder(ctx, people, now, status) {
    const list = people.filter(p => p.settings.muell);
    if (!list.length) return false;
    status.muell = status.muell || {};
    const nowWall = utcToWall(now);
    const todayIso = wallIsoDate(nowWall);
    const tp = todayIso.split("-");
    const dayWall = Date.UTC(+tp[0], +tp[1] - 1, +tp[2]);
    const due = list.filter(p => {
        if (status.muell[p.userId] === todayIso) return false;
        const hm = p.settings.muellZeit.split(":");
        const fireWall = dayWall + (+hm[0]) * HOUR_MS + (+hm[1]) * MIN_MS;
        return nowWall + HALF_STEP >= fireWall && nowWall - fireWall <= 3 * HOUR_MS;
    });
    if (!due.length) return false;
    const info = require(`${__hooks}/pinn-aufgaben.js`).muellInfo(ctx.familyId, ctx.data);
    let changed = false;
    due.forEach(p => {
        if (!info.namen.length) { status.muell[p.userId] = todayIso; changed = true; return; }
        const member = p.memberId ? ctx.members.find(m => m.id === p.memberId) : null;
        const isChild = !!(member && (isChildMember(member) || member.childLock));
        // Whose turn is it? (open waste tasks of today, explicitly assigned)
        const mine = [], others = [];
        info.aufgaben.filter(a => !a.erledigt).forEach(a => {
            const as = assigneesFromText(a.notizen, ctx.members);
            if (!as.line || as.all) return;
            if (p.memberId && as.memberIds.indexOf(p.memberId) !== -1) mine.push(a);
            as.memberIds.filter(id => id !== p.memberId).forEach(id => {
                const m = ctx.members.find(x => x.id === id);
                if (m) others.push(memberLabelServer(m) + " (" + a.typ + ")");
            });
        });
        if (isChild && !mine.length) { status.muell[p.userId] = todayIso; changed = true; return; }
        const lines = [info.namen.join(" · ")];
        if (mine.length) lines.push("Du bist dran: " + mine.map(a => a.typ).filter((x, i, arr) => arr.indexOf(x) === i).join(", "));
        if (others.length) lines.push("Dran: " + others.filter((x, i, arr) => arr.indexOf(x) === i).join(", "));
        const mw = info.morgen.split("-");
        const morgenWall = Date.UTC(+mw[0], +mw[1] - 1, +mw[2]);
        const r = notifyUserDetailed(p.userId, {
            titel: "🗑️ Morgen ist Müllabfuhr",
            text: lines.join("\n"),
            url: mine.length ? "/?aufgabe=" + encodeURIComponent(mine[0].id) : "/?termin=" + info.morgen,
            tag: "muell-" + info.morgen,
            bis: wallToUtc(morgenWall + 12 * HOUR_MS), // in the bell until the collection
        });
        if (r.sent > 0 || !r.geraete) {
            status.muell[p.userId] = todayIso;
            changed = true;
        } else {
            plog("warnung", "push", "Müll-Erinnerung für „" + p.name + "“ nicht zugestellt: " + r.fehler.filter((x, i, a) => a.indexOf(x) === i).join(" | "), { benutzer: p.userId });
        }
    });
    return changed;
}

function buildDigest(person, ctx, events, taskCal, dayWall, hour) {
    const dayEnd = dayWall + DAY_MS - 1;
    const iso = wallIsoDate(dayWall);
    const termine = [], aufgaben = [];
    // A possibly still configured (old) tasks calendar is not shown as events in the app -
    // the same here, unless "also show as events" is set.
    const hideTaskCal = taskCal && !ctx.config.showTaskCalendarAsEvents;
    events.forEach(ev => {
        if (hideTaskCal && ev.calName === taskCal) return;
        const assign = assigneesFromText(ev.description, ctx.members);
        if (ev.owner ? ev.owner !== person.userId : !isRelevantFor(person, assign)) return; // private calendars only for their profile
        occurrencesInRange(ev, dayWall, dayEnd).forEach(w => {
            termine.push({ w: w, text: (ev.start.allDay ? "" : wallHHMM(w) + " ") + ev.title, allDay: ev.start.allDay });
        });
    });
    /* ===== COMMENTED OUT: tasks from the tasks calendar =====
    events.forEach(ev => {
        const isTask = taskCal && ev.calName === taskCal;
        if (isTask && ev.title.indexOf(DONE_PREFIX) === 0) return;
        const assign = assigneesFromText(ev.description, ctx.members);
        if (!isRelevantFor(person, assign)) return;
        occurrencesInRange(ev, dayWall, dayEnd).forEach(w => {
            if (isTask) aufgaben.push(ev.title);
            else termine.push({ w: w, text: (ev.start.allDay ? "" : wallHHMM(w) + " ") + ev.title, allDay: ev.start.allDay });
        });
    });
    ===== END COMMENTED OUT ===== */
    // Tasks of the day from the database (open ones only)
    let taskRecs = [];
    if (ctx.familyId) try { taskRecs = $app.findRecordsByFilter("aufgaben", "familie = {:f} && faellig = {:d} && erledigt = false", "von", 0, 0, { f: ctx.familyId, d: iso }); } catch (e) { taskRecs = []; }
    taskRecs.forEach(r => {
        const assign = assigneesFromText(r.getString("notizen"), ctx.members);
        if (!isRelevantFor(person, assign)) return;
        if (r.getString("haushalt") && !person.settings.tagesHaushalt) return; // household chores only if wanted
        const missed = r.getInt("verpasst");
        const von = r.getString("von");
        aufgaben.push((von ? von + " " : "") + r.getString("titel") + (missed > 0 ? " (" + missed + "x nicht erledigt)" : ""));
    });
    termine.sort((a, b) => (a.allDay === b.allDay ? a.w - b.w : (a.allDay ? -1 : 1)));

    // Meal plan and recipes have lived in their own records since 1.104 (pinn-bereiche.js) - read only
    // once per family, the recipes only if a meal with a recipe is planned today
    if (ctx.bereichPlan === undefined) {
        ctx.bereichPlan = null;
        try { ctx.bereichPlan = require(`${__hooks}/pinn-bereiche.js`).readMany(ctx.familyId, ["essensplan"]).mealPlan || null; } catch (e) { ctx.bereichPlan = null; }
    }
    const plan = ctx.bereichPlan || ctx.data.mealPlan || [];
    const todays = plan.filter(m => m && m.date === iso);
    if (ctx.bereichRezepte === undefined && todays.some(m => m.recipeId)) {
        ctx.bereichRezepte = null;
        try { ctx.bereichRezepte = require(`${__hooks}/pinn-bereiche.js`).readMany(ctx.familyId, ["rezepte"]).recipes || null; } catch (e) { ctx.bereichRezepte = null; }
    }
    const recipes = ctx.bereichRezepte || ctx.data.recipes || [];
    const meals = todays
        .sort((a, b) => (a.mealType === b.mealType ? 0 : a.mealType === "mittag" ? -1 : 1))
        .map(m => {
            const r = m.recipeId ? recipes.find(x => x.id === m.recipeId) : null;
            return (m.mealType === "mittag" ? "Mittag: " : "Abend: ") + (r ? r.title : (m.title || "Ohne Titel"));
        });

    const greeting = hour < 11 ? "Guten Morgen" : hour < 17 ? "Hallo" : "Guten Abend";
    const lines = [];
    if (termine.length) lines.push("📅 " + termine.map(t => t.text).join(" · "));
    if (aufgaben.length) lines.push("✅ " + aufgaben.join(" · "));
    if (meals.length) lines.push("🍽 " + meals.join(" · "));
    if (!termine.length && !aufgaben.length) lines.unshift("Heute steht für dich nichts im Kalender.");
    return {
        titel: greeting + ", " + person.name + "!",
        text: lines.join("\n"),
        url: "/?termin=" + iso,
        tag: "tagesuebersicht-" + iso,
        bis: wallToUtc(dayWall + DAY_MS), // in the bell only until midnight
    };
}

// =============================================================================================
// New assignment (event/task created or edited in the app)
// =============================================================================================
// Member IDs that were previously assigned to the event with this href (from the calendar file).
// For tasks (database), the previous notes text is passed instead of an ID list.
function assigneesForHref(href, familyId) {
    try {
        if (!familyId) return [];
        const ctx = loadPeople(familyId);
        const ev = loadCalendarEvents(familyId).find(x => x.href === href && !x.recurrenceId);
        if (!ev) return [];
        return assigneesFromText(ev.description, ctx.members).memberIds;
    } catch (e) { return []; }
}

// Key against duplicate cards in the bell (same as pinn-hinweise.js#termKey)
function termKeyFor(day, title) {
    try { return require(`${__hooks}/pinn-hinweise.js`).termKey(day, title); } catch (e) { return ""; }
}
function notifyAssignment(body, actorUserId, previousMemberIds) {
    try {
        if (!engineSupportsPush()) return;
        let familyId = "";
        try { familyId = $app.findRecordById(PINN_USERS_P, actorUserId).getString("familie"); } catch (e) { familyId = ""; }
        if (!familyId) return;
        const ctx = loadPeople(familyId);
        const assign = assigneesFromText(body.notes, ctx.members);
        if (!assign.line) return;
        const before = typeof previousMemberIds === "string"
            ? assigneesFromText(previousMemberIds, ctx.members).memberIds
            : (previousMemberIds || []);
        const actor = ctx.people.find(p => p.userId === actorUserId);
        const isTask = !!body.isTask || (!!ctx.config.taskCalendarName && body.calendarName === ctx.config.taskCalendarName);
        const dp = String(body.startDate || "").split("-");
        const when = dp.length === 3 ? fmtWallDate(Date.UTC(+dp[0], +dp[1] - 1, +dp[2])) : "";
        ctx.people.forEach(p => {
            if (p.userId === actorUserId || !p.memberId || !p.settings.zuweisungen) return;
            if (assign.memberIds.indexOf(p.memberId) === -1 || before.indexOf(p.memberId) !== -1) return;
            const parts = [String(body.title || "")];
            if (isTask) parts.push("fällig " + when);
            else parts.push(when + (!body.allDay && body.startTime ? " " + body.startTime : ""));
            if (actor) parts.push("von " + actor.name);
            notifyUser(p.userId, {
                titel: isTask ? "Neue Aufgabe für dich" : "Neuer Termin für dich",
                text: parts.join(" · "),
                url: isTask && body.uid ? "/?aufgabe=" + encodeURIComponent(body.uid) : "/?termin=" + String(body.startDate || "").slice(0, 10),
                dk: isTask ? "" : termKeyFor(body.startDate, body.title),
                tag: "zuweisung-" + (body.uid || body.title) + "-" + body.startDate,
            });
        });
    } catch (e) {
        console.log("[Push] Zuweisungs-Benachrichtigung fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Benachrichtigung über eine Zuweisung fehlgeschlagen: " + e.message);
    }
}

// =============================================================================================
// Completed tasks: "All tasks completed" and the children's progress
// =============================================================================================
// Child = member with the kids' page activated or with the role "Kind" / "Tochter" / "Sohn"
function isChildMember(m) {
    if (!m) return false;
    if (m.kid && m.kid.enabled) return true;
    return /^(kind|tochter|sohn)$/i.test(String(m.role || "").trim());
}
function todayWallIso() { return wallIsoDate(utcToWall(Date.now())); }

// Profiles of the family with a registered device - lightweight: without loading the large family data,
// the members are passed along.
function subscribedPeople(familyId, members) {
    if (!familyId) return [];
    let users = [];
    try { users = $app.findRecordsByFilter(PINN_USERS_P, "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    if (!users.length) return [];
    const subscribed = {};
    try {
        $app.findAllRecords(PUSH_ABOS).forEach(a => { subscribed[a.getString("benutzer")] = true; });
    } catch (e) { return []; }
    return users.filter(u => subscribed[u.id]).map(u => {
        const mid = u.getString("mitglied");
        const m = mid ? (members || []).find(x => x.id === mid) : null;
        return { userId: u.id, memberId: m ? m.id : "", name: m ? m.name : u.getString("username"), settings: readSettings(u) };
    });
}

// One-time lock in the cache, so that ticking on/off several times does not notify several times.
// It is only locked AFTER a successful send - if that fails, it works the next time.
// The locks are additionally backed up in pb_data, so that nothing comes twice after a restart.
function loadSentMap() {
    let raw = null;
    try { raw = $app.store().get(SENT_KEY); } catch (e) { raw = null; }
    if (raw) {
        try {
            const o = JSON.parse(String(raw));
            if (o && typeof o === "object") return o;
        } catch (e) { /* reload */ }
    }
    const m = pruneSent(readJsonFile(SENT_FILE) || {});
    try { $app.store().set(SENT_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
    return m;
}
function alreadySent(key) {
    return !!loadSentMap()[key];
}
function markSent(key) {
    const m = pruneSent(loadSentMap());
    m[key] = Date.now();
    try { $app.store().set(SENT_KEY, JSON.stringify(m)); } catch (e) { /* ignore */ }
    writeJsonFile(SENT_FILE, m);
}

// A child's progress to the other profiles of the family (never to the child themselves).
// info: { title, emoji, taskKey, allDone, allText, excludeUserId, singleKey, allKey }
// Result: { sent, empfaenger }
function sendChildProgress(familyId, members, child, info) {
    const result = { sent: 0, empfaenger: 0 };
    if (!engineSupportsPush() || !child) return result;
    const today = todayWallIso();
    const people = subscribedPeople(familyId, members)
        .filter(p => p.memberId !== child.id && (!info.excludeUserId || p.userId !== info.excludeUserId));
    const wantAll = !!info.allDone && !alreadySent(info.allKey);
    const wantSingle = !alreadySent(info.singleKey);
    if (!people.length) {
        console.log("[Push] " + child.name + ": kein anderes Profil der Familie hat Benachrichtigungen auf einem Gerät aktiviert.");
        return result;
    }
    const single = {
        titel: child.name + " hat eine Aufgabe erledigt ✅",
        text: ((info.emoji ? info.emoji + " " : "") + String(info.title || "")).trim(),
        url: "/?aufgabe=" + encodeURIComponent(info.taskKey || "1"),
        tag: "kind-" + child.id + "-" + (info.taskKey || info.title) + "-" + today,
    };
    const all = {
        titel: child.name + " hat alles geschafft! 🏆",
        text: info.allText || "Alle Aufgaben bis jetzt sind erledigt.",
        url: "/?aufgabe=1",
        tag: "kind-alle-" + child.id + "-" + today,
        urgency: "high",
    };
    let sentSingle = 0, sentAll = 0;
    people.forEach(p => {
        let msg = null;
        if (wantAll && p.settings.kindAlle) msg = all;
        else if (wantSingle && p.settings.kindAufgabe) msg = single;
        if (!msg) return;
        result.empfaenger++;
        const r = notifyUserDetailed(p.userId, msg);
        if (msg === all) sentAll += r.sent; else sentSingle += r.sent;
        if (!r.sent) console.log("[Push] " + child.name + " -> " + p.name + " nicht zugestellt: " + (r.fehler.join(" | ") || "kein Gerät"));
    });
    // Remember as sent as soon as at least one device was reached (or nobody wanted it)
    if (wantSingle && (sentSingle > 0 || sentAll > 0 || !result.empfaenger)) markSent(info.singleKey);
    if (wantAll && (sentAll > 0 || !result.empfaenger)) markSent(info.allKey);
    result.sent = sentSingle + sentAll;
    console.log("[Push] " + child.name + ": \"" + info.title + "\" erledigt" + (info.allDone ? " (alles erledigt)" : "") + " -> " + result.sent + " Gerät(e) benachrichtigt.");
    return result;
}

// After ticking off a task in the task list.
// ctx: { familyId, members, actorUserId, actorMemberId, task: {id, title},
//        taskIsOwn, allDone, allSignature,           <- for the person ticking off
//        children: [{ memberId, allDone, signature }] <- children to whom the task belongs }
// Child notices also come when mum/dad tick off the child's task on their own phone.
function notifyTaskDone(ctx) {
    try {
        if (!engineSupportsPush() || !ctx.familyId) return;
        const members = ctx.members || [];
        const today = todayWallIso();

        (ctx.children || []).forEach(c => {
            const child = members.find(m => m.id === c.memberId);
            if (!child) return;
            sendChildProgress(ctx.familyId, members, child, {
                title: ctx.task.title,
                taskKey: ctx.task.id,
                allDone: c.allDone,
                allText: "Alle Aufgaben bis jetzt sind erledigt – zuletzt „" + ctx.task.title + "“.",
                excludeUserId: ctx.actorUserId,
                singleKey: "pinnKindAufgabe:" + child.id + ":" + ctx.task.id + ":" + (ctx.task.stamp || today),
                allKey: "pinnKindAlle:" + child.id + ":" + today + ":" + c.signature,
            });
        });

        // "All completed" for adults
        const actor = ctx.actorMemberId ? members.find(m => m.id === ctx.actorMemberId) : null;
        if (!actor || isChildMember(actor) || !ctx.taskIsOwn || !ctx.allDone) return;
        const key = "pinnAlleErledigt:" + actor.id + ":" + today + ":" + ctx.allSignature;
        if (alreadySent(key)) return;
        const people = subscribedPeople(ctx.familyId, members)
            .filter(p => p.userId !== ctx.actorUserId && p.memberId !== actor.id && p.settings.alleErledigt);
        let sent = 0;
        people.forEach(p => {
            sent += notifyUser(p.userId, {
                titel: actor.name + " hat alle Aufgaben erledigt 🎉",
                text: "Alle Aufgaben bis jetzt sind abgehakt – zuletzt „" + ctx.task.title + "“.",
                url: "/?aufgabe=" + encodeURIComponent((ctx.task && ctx.task.id) || "1"),
                tag: "alle-erledigt-" + actor.id + "-" + today,
            });
        });
        if (sent > 0 || !people.length) markSent(key);
        console.log("[Push] " + actor.name + " hat alle Aufgaben erledigt -> " + sent + " Gerät(e) benachrichtigt.");
    } catch (e) {
        console.log("[Push] Hinweis \"Aufgabe erledigt\" fehlgeschlagen: " + e.message);
        plog("fehler", "push", "Hinweis „Aufgabe erledigt“ fehlgeschlagen: " + e.message);
    }
}

const KID_PERIOD_LABELS = { morgens: "heute Morgen", mittags: "heute Mittag", nachmittags: "heute Nachmittag", abends: "heute Abend" };
// After ticking off on the kids' page. body: { memberId, taskId, allDone, period }
// The kids' page mostly runs on mum's/dad's device - therefore the
// signed-in profile gets the notice here as well (on its other devices anyway).
function notifyKidPage(familyId, members, body) {
    if (!engineSupportsPush()) return { ok: false, grund: "Push auf dem Server nicht verfügbar" };
    const child = (members || []).find(m => m.id === String(body.memberId || ""));
    if (!child) return { ok: false, grund: "Mitglied nicht gefunden" };
    if (!child.kid || !child.kid.enabled) return { ok: false, grund: "Kinderseite für " + child.name + " nicht aktiviert" };
    const task = (child.kid.tasks || []).find(t => t && t.id === String(body.taskId || ""));
    if (!task) return { ok: false, grund: "Aufgabe nicht (mehr) auf der Kinderseite" };
    const today = todayWallIso();
    const period = KID_PERIOD_LABELS[body.period] ? body.period : "";
    const r = sendChildProgress(familyId, members, child, {
        title: task.title, emoji: task.emoji, taskKey: task.id, allDone: !!body.allDone,
        allText: "Alle Aufgaben " + (period ? "für " + KID_PERIOD_LABELS[period] : "für jetzt") + " sind erledigt – zuletzt „" + task.title + "“.",
        singleKey: "pinnKindSeite:" + child.id + ":" + task.id + ":" + today + (body.stamp ? ":" + body.stamp : ""),
        allKey: "pinnKindSeiteAlle:" + child.id + ":" + today + ":" + period + (body.stamp ? ":" + body.stamp : ""),
    });
    return { ok: true, sent: r.sent, empfaenger: r.empfaenger };
}

// =============================================================================================
// Delayed completion messages (10 seconds)
// =============================================================================================
// When ticking off, the message is only queued. If the tick is removed again within the 10 seconds,
// it is discarded. It is sent as soon as the app asks after the time has passed
// (/api/pinn/push/faellige) - at the latest by the per-minute schedule (app closed).
// The queued entries live in the cache and are additionally backed up in pb_data. After
// a restart they are sent by the per-minute schedule (older than 30 minutes: discarded).
const DELAY_KEY = "pinnPushVerzoegert";
const DELAY_MS = 10000;
const DELAY_MAX_AGE = 30 * 60000;

function loadDelayed() {
    try {
        const raw = $app.store().get(DELAY_KEY);
        if (raw) {
            const o = JSON.parse(String(raw));
            if (o && typeof o === "object") return o;
        }
    } catch (e) { /* leer */ }
    return {};
}
function saveDelayed(map) {
    const empty = !Object.keys(map).length;
    try {
        if (!empty) $app.store().set(DELAY_KEY, JSON.stringify(map));
        else $app.store().remove(DELAY_KEY);
    } catch (e) { /* ignore */ }
    writeJsonFile(DELAYED_FILE, map);
}
// Queue a message (replaces an older queued entry with the same key)
function queueDelayed(key, entry) {
    const map = loadDelayed();
    entry.dueAt = Date.now() + DELAY_MS;
    map[key] = entry;
    saveDelayed(map);
}
// Discard a queued entry. adjust(entry) may adjust other queued entries and then returns true.
function cancelDelayed(key, adjust) {
    const map = loadDelayed();
    let changed = false;
    if (map[key]) { delete map[key]; changed = true; }
    if (adjust) Object.keys(map).forEach(k => { if (adjust(map[k])) changed = true; });
    if (changed) saveDelayed(map);
}
// Send due queued entries - familyId empty = all families (schedule)
function runDelayed(familyId) {
    const map = loadDelayed();
    const now = Date.now();
    const due = [];
    let dropped = false;
    Object.keys(map).forEach(k => {
        const e = map[k];
        if (!e || typeof e.dueAt !== "number" || e.dueAt < now - DELAY_MAX_AGE) { delete map[k]; dropped = true; return; }
        if (familyId && e.familyId !== familyId) return;
        if (e.dueAt <= now + 1000) { due.push(e); delete map[k]; }
    });
    if (!due.length) {
        if (dropped) saveDelayed(map);
        return 0;
    }
    saveDelayed(map);
    let processed = 0;
    due.forEach(e => {
        try {
            if (e.type === "aufgabe") {
                if (require(`${__hooks}/pinn-aufgaben.js`).notifyDoneDelayed(e)) processed++;
            } else if (e.type === "kinderseite") {
                const members = require(`${__hooks}/pinn-aufgaben.js`).familyMembers(e.familyId);
                const r = notifyKidPage(e.familyId, members, e.body || {});
                if (r.ok) processed++;
                else console.log("[Push] Kinderseite: kein Hinweis - " + (r.grund || "unbekannt"));
            }
        } catch (err) {
            console.log("[Push] Verzögerte Meldung fehlgeschlagen: " + err.message);
            plog("fehler", "push", "Verzögerte Meldung fehlgeschlagen: " + err.message, { familie: e && e.familyId ? e.familyId : "" });
        }
    });
    return processed;
}

// Kids' page: queue ticking off or remove the tick.
// body: { memberId, taskId, allDone, period, done }
function queueKidPage(familyId, body) {
    const memberId = String(body.memberId || "");
    const taskId = String(body.taskId || "");
    if (!familyId || !memberId || !taskId) return false;
    const key = "kinderseite:" + memberId + ":" + taskId;
    if (body.done === false) {
        // Tick removed: discard the message and, for the other queued tasks of this
        // child, take back "all done"
        cancelDelayed(key, e => {
            if (!e || e.type !== "kinderseite" || !e.body || e.body.memberId !== memberId || !e.body.allDone) return false;
            e.body.allDone = false;
            return true;
        });
        return true;
    }
    queueDelayed(key, {
        type: "kinderseite",
        familyId: familyId,
        body: { memberId: memberId, taskId: taskId, allDone: !!body.allDone, period: String(body.period || ""), stamp: String(Date.now()) },
    });
    return true;
}

module.exports = {
    queueDelayed, cancelDelayed, runDelayed, queueKidPage,
    restorePersisted, renewSubscription, countSubscriptions,
    engineSupportsPush, selfTest, ensurePushCollections, loadPushStatus, savePushStatus, loadVapid, saveVapidSubject, rememberSubjectFromRequest, subjectFromOrigin,
    notifyUser, notifyUserDetailed, takeMessage, badgeForEndpoint, openTaskCountForUser,
    normalizeSettings, readSettings, runPushCron, assigneesForHref, notifyAssignment,
    assigneesFromText, isChildMember, notifyTaskDone, notifyKidPage,
    subscribedPeople,
    PUSH_ABOS, PUSH_NACHRICHTEN,
};
