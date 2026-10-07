// pb_hooks/pinn-push.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
// Persönliche Push-Benachrichtigungen für pinn.:
//  - Terminerinnerungen (Vorlaufzeit je Profil einstellbar)
//  - Tagesübersicht zur Wunschzeit (eigene Termine, Aufgaben, Essen des Tages) - Aufgaben kommen
//    aus der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js), nicht mehr aus dem Kalender
//  - Hinweis, wenn einem jemand einen Termin / eine Aufgabe zuweist
//  - Hinweis, wenn jemand alle bis jetzt fälligen Aufgaben erledigt hat
//  - Hinweis, wenn ein Kind eine Aufgabe (Kinderseite oder Aufgabenliste) bzw. alle erledigt hat
//  - Pinnwand: neue Zettel, Antworten/Reaktionen und Zettel-Erinnerungen (Versand in pinn-pinnwand.js,
//    die Einstellungen pwAlle / pwMich / pwAntworten / pwErinnerung liegen hier mit den übrigen)
//    Erledigt-Meldungen gehen erst 10 Sekunden nach dem Abhaken raus (versehentliches Abhaken
//    wird so nicht gemeldet). Wird eine Aufgabe zurückgesetzt und neu abgehakt, kommt die
//    Meldung erneut.
//  - Sprache und Wohnform: Jede Nachricht wird vor dem Versand für den Empfänger umgeschrieben
//    (Sprache seines Profils, Familie/WG aus den Familiendaten) - Übersetzungen in pinn-pushtext.js.
//  - Jede Nachricht erscheint zusätzlich unter der 🔔 Glocke des Empfängers (pinn-hinweise.js#pushMirror),
//    mit Link zur passenden Stelle (?termin=, ?aufgabe= …) - Terminerinnerungen und Tagesübersicht
//    verschwinden dort wieder, wenn sie vorbei sind.
// Zugeordnet wird über die "Zugewiesen: ..."-Zeile der Termine und die Verknüpfung
// Profil (Sammlung "benutzer", Feld "mitglied") <-> Familienmitglied.
//
// Technik: Standard-Web-Push (VAPID, ES256). Die Signatur wird hier in reinem JavaScript
// gerechnet, weil PocketBase dafür keine eingebaute Funktion hat. Gesendet wird nur ein
// inhaltsloser "Weckruf"; der Service Worker (pb_public/sw.js) holt den Text anschließend selbst
// über /api/pinn/push/abholen ab. Dadurch entfällt die aufwendige Payload-Verschlüsselung und es
// liegen keine Inhalte bei Apple/Google.
// Zeiten: Kalenderzeiten werden als mitteleuropäische Zeit (MEZ/MESZ) behandelt.
// Neustart/Update: Geräte-Anmeldungen (Sammlung push_abos) und der Schlüssel (pb_data) bleiben
// erhalten. Zusätzlich werden vorgemerkte Meldungen, "schon gesendet"-Sperren und das Zeitfenster
// der Terminerinnerungen in pb_data gesichert, damit nach einem Neustart nichts verloren geht,
// nichts doppelt kommt und Erinnerungen aus der Ausfallzeit (bis 30 Min.) nachgeholt werden.
// Tauscht ein Gerät seine Push-Adresse aus, meldet der Service Worker das über
// /api/pinn/push/abo-erneuern - das Gerät bleibt so ohne erneutes Aktivieren angemeldet.

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
// Jacobi-Koordinaten [X, Y, Z]
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

// --- Zeit & Kalender ---
// --- Zeit (Mitteleuropa, feste EU-Sommerzeitregel) ---
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
            else if (name === "X-PINN-OWNER") ev.owner = value.trim(); // privater eigener Kalender (pinn-kalender.js)
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
// Liefert alle Beginn-Zeitpunkte (Wandzeit-ms) eines Termins im Bereich [fromWall, toWall].
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
        const weekStart = start - ((sp.wd + 6) % 7) * DAY_MS; // Montag der Startwoche
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
// Web-Push: Schlüssel, Versand, Warteschlange
// =============================================================================================
const PUSH_ABOS = "push_abos";
const PUSH_NACHRICHTEN = "push_nachrichten";
const PINN_USERS_P = "benutzer";
const VAPID_FILE = "/pb_data/pinn_push_vapid.json";
const HEX = "0123456789abcdef";

// Legt die Sammlungen "push_abos" und "push_nachrichten" an, falls sie fehlen.
// Wirft einen verständlichen Fehler, wenn das nicht klappt.
function findCollectionOrNull(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
// Neue Sammlung im Format der PocketBase-JavaScript-Umgebung (new Collection({...})).
function newBaseCollection(def) {
    if (typeof Collection === "function") return new Collection(Object.assign({ type: "base" }, def));
    throw new Error("Diese PocketBase-Version kann aus Hooks keine Sammlungen anlegen.");
}
function hasFieldNamed(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
// Feld "push_einstellungen" im Profil sicherstellen - sonst werden Uhrzeit & Co. nicht gespeichert
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
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                ],
            }, closed)));
            console.log("[Push] Sammlung \"" + PUSH_NACHRICHTEN + "\" angelegt.");
        } catch (e) {
            throw new Error("Sammlung \"" + PUSH_NACHRICHTEN + "\" konnte nicht angelegt werden: " + e.message);
        }
    }
    return abos;
}

const STATUS_FILE = "/pb_data/pinn_push_status.json";
function loadPushStatus() {
    try {
        const s = JSON.parse(readTextFile(STATUS_FILE));
        return (s && typeof s === "object") ? s : {};
    } catch (e) { return {}; }
}
function savePushStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s)); } catch (e) { console.log("[Push] Status nicht speicherbar: " + e.message); }
}

// --- Dauerhafte Sicherung (übersteht Neustarts und Updates) ---
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
    try { $os.writeFile(path, JSON.stringify(obj), 420); } catch (e) { console.log("[Push] " + path + " nicht speicherbar: " + e.message); }
}
function pruneSent(map) {
    const cutoff = Date.now() - SENT_MAX_AGE;
    Object.keys(map).forEach(k => { if (typeof map[k] !== "number" || map[k] < cutoff) delete map[k]; });
    return map;
}
// Beim Start: gesicherte Vormerkungen, Sperren und Zeitfenster in den Zwischenspeicher laden
function restorePersisted() {
    const store = $app.store();
    const info = { verzoegert: 0, gesendet: 0, fenster: false };
    const delayed = readJsonFile(DELAYED_FILE);
    if (delayed && Object.keys(delayed).length) {
        try { store.set(DELAY_KEY, JSON.stringify(delayed)); info.verzoegert = Object.keys(delayed).length; } catch (e) { /* egal */ }
    }
    const sent = pruneSent(readJsonFile(SENT_FILE) || {});
    try { store.set(SENT_KEY, JSON.stringify(sent)); info.gesendet = Object.keys(sent).length; } catch (e) { /* egal */ }
    const win = readJsonFile(WINDOW_FILE);
    if (win && typeof win.bis === "number") {
        try { store.set(WINDOW_KEY, win.bis); info.fenster = true; } catch (e) { /* egal */ }
    }
    return info;
}
function countSubscriptions() {
    try { return $app.findAllRecords(PUSH_ABOS).length; } catch (e) { return 0; }
}

// Der Service Worker meldet eine neue Push-Adresse seines Geräts (der Browser hat sie getauscht).
// Nur wer die alte, geheime Adresse kennt, kann sie ersetzen - also nur das Gerät selbst.
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

// VAPID-Schlüsselpaar: wird beim ersten Bedarf zufällig erzeugt und in pb_data abgelegt (nicht in
// der Datenbank, nicht im Code). Wer die Datei löscht, muss Push auf allen Geräten neu aktivieren.
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
// Apple (web.push.apple.com) lehnt den Weckruf mit "403 BadJwtToken" ab, wenn der Absender (sub)
// keine echte Domain nennt - z. B. eine IP-Adresse, localhost, *.local oder example.org.
// Deshalb wird nur ein Absender verwendet, den Apple akzeptiert.
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
// Aus einer Adresse wie "https://deine-subdomain.duckdns.org:8443" wird "https://deine-subdomain.duckdns.org"
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
// Merkt sich die öffentliche Adresse von pinn. aus einer App-Anfrage (Origin bzw. Proxy-Header)
function rememberSubjectFromRequest(e) {
    const header = name => { try { return String(e.request.header.get(name) || ""); } catch (err) { return ""; } };
    let host = "";
    try { host = String(e.request.host || ""); } catch (err) { host = ""; }
    const s = subjectFromOrigin(header("Origin")) ||
        subjectFromOrigin(header("Referer")) ||
        subjectFromOrigin(header("X-Forwarded-Host").split(",")[0]) ||
        subjectFromOrigin(host);
    if (s) { try { saveVapidSubject(s); } catch (err) { /* egal */ } }
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

// Selbsttest beim Start: Schlüssel erzeugen/laden, signieren und die Signatur wieder prüfen.
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
    } catch (e) { /* kein Cache */ }
    const exp = nowSec + 12 * 3600;
    const input = b64urlText(JSON.stringify({ typ: "JWT", alg: "ES256" })) + "." +
        b64urlText(JSON.stringify({ aud: aud, exp: exp, sub: sub }));
    const sig = ecdsaSign($security.sha256(input), big("0x" + v.privateHex), randHex);
    const header = "vapid t=" + input + "." + b64url(sig) + ", k=" + v.publicKey;
    try { store.set(cacheKey, { header: header, exp: exp }); } catch (e) { /* egal */ }
    return header;
}

// Schickt einen (inhaltslosen) Weckruf an ein Gerät. Den eigentlichen Text holt sich der Service
// Worker danach selbst über /api/pinn/push/abholen - so ist keine Payload-Verschlüsselung nötig.
// Android (Google/FCM): Weckrufe mit „normal“ hält Android im Energiesparmodus (Doze) oft bis zum
// nächsten Wartungsfenster zurück - Erinnerungen kämen dann viel zu spät. Da pinn. jeden Weckruf
// sichtbar anzeigt, gehen sie dort mit „high“ raus (verbraucht keinen zusätzlichen Akku).
function isGoogleEndpoint(endpoint) { return /googleapis\.com|fcm\./i.test(String(endpoint || "")); }
function sendWakeup(endpoint, urgency) {
    if (isGoogleEndpoint(endpoint) && urgency !== "very-low" && urgency !== "low") urgency = "high";
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
    else if (/VapidPkHashMismatch|BadWebPushTopic|UnauthorizedRegistration|authorization header|sender id/i.test(reason) || status === 403) text += " - bitte auf dem Gerät deaktivieren und neu aktivieren";
    else if (status === 429) text += " - zu viele Nachrichten in kurzer Zeit, bitte später erneut versuchen";
    return text;
}

// Legt die Nachricht für jedes Gerät des Profils in die Warteschlange und weckt das Gerät.
// Ergebnis: { sent, geraete, fehler: [Text, ...] }
function notifyUserDetailed(userId, msg) {
    const result = { sent: 0, geraete: 0, fehler: [] };
    // Text in der Sprache des Empfängers und passend zur Wohnform (Familie/WG) – siehe pinn-pushtext.js.
    // Gilt für das Handy und die 🔔 Glocke; bei einem Fehler bleibt der deutsche Text.
    try { msg = require(`${__hooks}/pinn-pushtext.js`).localize(userId, msg); }
    catch (e) { console.log("[Push] Übersetzung nicht verfügbar: " + e.message); }
    // Jede Nachricht erscheint zusätzlich als Hinweis unter der 🔔 Glocke des Empfängers (auch ohne
    // angemeldetes Gerät). msg.hinweis = false verhindert das (z. B. Test-Nachricht).
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
            $app.save(rec);
            const endpoint = abo.getString("endpoint");
            const r = sendWakeup(endpoint, msg.urgency);
            const status = r.status;
            if (status === 404 || status === 410) {
                console.log("[Push] Gerät abgemeldet (Status " + status + "), Abo wird entfernt.");
                result.fehler.push("Gerät ist beim " + pushServiceName(endpoint) + "-Dienst nicht mehr angemeldet - bitte neu aktivieren");
                $app.delete(abo);
                try { $app.delete(rec); } catch (e2) { /* egal */ }
            } else if (status < 200 || status >= 300) {
                const text = describeFailure(endpoint, status, r.body);
                console.log("[Push] Versand fehlgeschlagen: " + text + " | Antwort: " + r.body);
                result.fehler.push(text);
                try { $app.delete(rec); } catch (e2) { /* egal */ }
            } else {
                result.sent++;
            }
        } catch (e) {
            console.log("[Push] Fehler beim Versand: " + e.message);
            result.fehler.push("Server erreicht den Push-Dienst nicht: " + e.message);
            if (rec) { try { $app.delete(rec); } catch (e3) { /* egal */ } }
        }
    });
    return result;
}
function notifyUser(userId, msg) {
    return notifyUserDetailed(userId, msg).sent;
}

// Holt die NEUESTE wartende Nachricht eines Geräts ab (und entfernt sie aus der Warteschlange).
// Früher wurde die älteste genommen: ging ein Weckruf einmal verloren (Gerät aus, iOS hat ihn
// verworfen), blieb dessen Nachricht liegen und jeder folgende Weckruf zeigte die vorherige
// Meldung - z. B. heute die Tagesübersicht von gestern. Liegengebliebene Meldungen, die älter als
// STALE_MS sind, werden deshalb verworfen und nie mehr angezeigt.
const STALE_MS = 6 * HOUR_MS;
function pbDate(ms) { return new Date(ms).toISOString().replace("T", " "); }
function takeMessage(endpoint) {
    let abo = null;
    try { abo = $app.findFirstRecordByFilter(PUSH_ABOS, "endpoint = {:e}", { e: String(endpoint || "") }); } catch (e) { return null; }
    // Veraltete Meldungen dieses Geräts verwerfen
    try {
        $app.findRecordsByFilter(PUSH_NACHRICHTEN, "abo = {:a} && created < {:c}", "", 200, 0, { a: abo.id, c: pbDate(Date.now() - STALE_MS) })
            .forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
    } catch (e) { /* egal */ }
    let recs = [];
    try { recs = $app.findRecordsByFilter(PUSH_NACHRICHTEN, "abo = {:a}", "-created", 1, 0, { a: abo.id }); } catch (e) { recs = []; }
    if (!recs.length) return null;
    const r = recs[0];
    const out = { titel: r.getString("titel"), text: r.getString("text"), url: r.getString("url") || "/", tag: r.getString("tag") };
    try { $app.delete(r); } catch (e) { /* egal */ }
    return out;
}

// =============================================================================================
// App-Badge: offene, bis jetzt fällige Aufgaben eines Profils (gleiche Regel wie in der App:
// frühere Tage + heute, mit Zeitfenster erst ab Beginn, nur zugewiesene bzw. "Alle").
// Der Service Worker bekommt die Zahl beim Abholen einer Meldung mit und setzt sie am App-Symbol.
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
// Zahl für das Gerät mit dieser Push-Adresse; null, wenn unbekannt (dann lässt der Worker sie stehen)
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
        old.forEach(r => { try { $app.delete(r); } catch (e) { /* egal */ } });
    } catch (e) { /* egal */ }
}

// =============================================================================================
// Persönliche Einstellungen
// =============================================================================================
// alleErledigt: Hinweis, wenn jemand (kein Kind) alle bis jetzt fälligen Aufgaben erledigt hat
// kindAufgabe:  Hinweis, wenn ein Kind eine Aufgabe erledigt (Kinderseite oder Aufgabenliste)
// kindAlle:     Hinweis, wenn ein Kind alle Aufgaben erledigt hat
// animation:    Feier-Animation in der App, wenn man selbst alle Aufgaben erledigt hat (kein Push)
// pwAlle:       Pinnwand - neuer Zettel für die ganze Familie
// pwMich:       Pinnwand - Zettel an mich, Dankeschöns an mich und wichtige Zettel
// pwAntworten:  Pinnwand - Antworten, Reaktionen und Stimmen zu meinen Zetteln
// pwErinnerung: Pinnwand - Erinnerungen, die an einem Zettel hängen
const DEFAULT_SETTINGS = { termine: true, vorlauf: 30, ohneZuweisung: true, tagesuebersicht: true, uhrzeit: "07:00", zuweisungen: true, alleErledigt: true, kindAufgabe: true, kindAlle: true, animation: true, pwAlle: true, pwMich: true, pwAntworten: true, pwErinnerung: true };
const BOOL_SETTINGS = ["termine", "ohneZuweisung", "tagesuebersicht", "zuweisungen", "alleErledigt", "kindAufgabe", "kindAlle", "animation", "pwAlle", "pwMich", "pwAntworten", "pwErinnerung"];
function normalizeSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, (raw && typeof raw === "object") ? raw : {});
    const lead = parseInt(s.vorlauf, 10);
    s.vorlauf = [5, 10, 15, 30, 60, 120, 1440].indexOf(lead) !== -1 ? lead : DEFAULT_SETTINGS.vorlauf;
    s.uhrzeit = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.uhrzeit)) ? String(s.uhrzeit) : DEFAULT_SETTINGS.uhrzeit;
    BOOL_SETTINGS.forEach(k => { s[k] = !!s[k]; });
    return {
        termine: s.termine, vorlauf: s.vorlauf, ohneZuweisung: s.ohneZuweisung, tagesuebersicht: s.tagesuebersicht, uhrzeit: s.uhrzeit, zuweisungen: s.zuweisungen,
        alleErledigt: s.alleErledigt, kindAufgabe: s.kindAufgabe, kindAlle: s.kindAlle, animation: s.animation,
        pwAlle: s.pwAlle, pwMich: s.pwMich, pwAntworten: s.pwAntworten, pwErinnerung: s.pwErinnerung,
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

// Mitglieder und Profile EINER Familie inkl. ihrer Kalender-Einstellungen (Auswahl, Aufgaben-
// Kalender). Zugangsdaten werden hier nicht gebraucht und deshalb auch nicht entschlüsselt.
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

// Liest die "Zugewiesen: ..."-Zeile. Ergebnis: { line: bool, all: bool, memberIds: [] }
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
// Kalender lesen
// =============================================================================================
const DONE_PREFIX = "\u2705 ";
// Termine aus der Kalenderdatei EINER Familie
function loadCalendarEvents(familyId) {
    const calendarSync = require(`${__hooks}/calendar-sync.js`);
    const path = calendarSync.kalenderPfad(familyId);
    if (!path) return [];
    let text = "";
    try { text = readTextFile(path); } catch (e) { text = ""; }
    // Eigene Kalender der Familie (geteilte und private - private nur für ihr Profil, X-PINN-OWNER)
    try { text += "\n" + require(`${__hooks}/pinn-kalender.js`).icsAllForFamily(familyId); } catch (e) { /* nicht vorhanden */ }
    const events = parseIcsEvents(text).filter(ev => ev.status !== "CANCELLED");
    // Abweichend bearbeitete Einzeltermine einer Serie (RECURRENCE-ID) ersetzen den Serientermin
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
// Cron: Terminerinnerungen + Tagesübersicht (alle 5 Minuten)
// =============================================================================================
const WINDOW_KEY = "pinnPushWindowUntil";
const HALF_STEP = 150000; // 2,5 Minuten - der Cron läuft alle 5 Minuten, jeder Lauf deckt ±2,5 Min ab

function runPushCron() {
    const now = Date.now();
    const store = $app.store();
    let last = null;
    try { last = store.get(WINDOW_KEY); } catch (e) { last = null; }
    if (typeof last !== "number") {
        // Zwischenspeicher leer (z. B. nach einem Neustart) -> gesichertes Zeitfenster verwenden
        const win = readJsonFile(WINDOW_FILE);
        last = win && typeof win.bis === "number" ? win.bis : null;
    }
    if (typeof last !== "number" || last < now - 30 * 60000 || last > now + 10 * 60000) last = now - HALF_STEP;
    const until = now + HALF_STEP;
    try { store.set(WINDOW_KEY, until); } catch (e) { /* egal */ }
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

    // Familien mit angemeldeten Geräten ermitteln - jede Familie hat ihre eigenen Daten
    const families = {};
    subscribedIds.forEach(id => {
        try {
            const fam = $app.findRecordById(PINN_USERS_P, id).getString("familie");
            if (fam) families[fam] = true;
        } catch (e) { /* Profil gelöscht */ }
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
            const events = loadCalendarEvents(familyId); // jede Familie hat ihre eigene Kalenderdatei
            if (runFamilyReminders(ctx, people, events, last, until, now, status)) statusChanged = true;
        } catch (e) {
            console.log("[Push] Fehler bei einer Familie: " + e.message);
        }
    });
    if (statusChanged) savePushStatus(status);
}

// Terminerinnerungen + Tagesübersicht für die angemeldeten Profile EINER Familie.
// Gibt true zurück, wenn sich der Tagesübersicht-Status geändert hat.
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
                if (startUtc < now - 60000) return; // Termin hat (während eines Neustarts) schon begonnen
                reminderPeople.forEach(p => {
                    const fireAt = startUtc - p.settings.vorlauf * 60000;
                    if (fireAt <= last || fireAt > until) return;
                    if (ev.owner ? ev.owner !== p.userId : !isRelevantFor(p, assign)) return; // private Kalender nur für ihr Profil
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
                        bis: startUtc + HOUR_MS, // in der Glocke nur bis eine Stunde nach Beginn
                    });
                });
            });
        });
    } catch (e) {
        console.log("[Push] Terminerinnerungen fehlgeschlagen: " + e.message);
    }

    // --- Tagesübersicht ---
    // Wird geschickt, sobald die Wunschzeit erreicht ist und sie heute noch nicht rausging
    // (bis zu 3 Stunden nachgeholt, z. B. nach einem Neustart oder wenn ein Lauf ausfiel).
    // Welcher Tag schon verschickt wurde, steht in pb_data/pinn_push_status.json.
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
            if (nowWall + HALF_STEP < fireWall) return;      // noch nicht so weit
            if (nowWall - fireWall > 3 * HOUR_MS) return;     // zu lange her -> morgen wieder
            const msg = buildDigest(p, ctx, events, taskCal, dayWall, +hm[0]);
            const r = notifyUserDetailed(p.userId, msg);
            if (r.sent > 0 || !r.geraete) {
                status.tagesuebersicht[p.userId] = todayIso;
                changed = true;
                console.log("[Push] Tagesübersicht für " + p.name + " an " + r.sent + " Gerät(e) gesendet.");
            } else {
                console.log("[Push] Tagesübersicht für " + p.name + " nicht zugestellt: " + r.fehler.join(" | "));
            }
        });
    } catch (e) {
        console.log("[Push] Tagesübersicht fehlgeschlagen: " + e.message);
    }
    return changed;
}

function buildDigest(person, ctx, events, taskCal, dayWall, hour) {
    const dayEnd = dayWall + DAY_MS - 1;
    const iso = wallIsoDate(dayWall);
    const termine = [], aufgaben = [];
    // Ein evtl. noch eingestellter (alter) Aufgaben-Kalender wird in der App nicht als Termine
    // angezeigt - hier genauso, außer "auch als Termine anzeigen" ist gesetzt.
    const hideTaskCal = taskCal && !ctx.config.showTaskCalendarAsEvents;
    events.forEach(ev => {
        if (hideTaskCal && ev.calName === taskCal) return;
        const assign = assigneesFromText(ev.description, ctx.members);
        if (ev.owner ? ev.owner !== person.userId : !isRelevantFor(person, assign)) return; // private Kalender nur für ihr Profil
        occurrencesInRange(ev, dayWall, dayEnd).forEach(w => {
            termine.push({ w: w, text: (ev.start.allDay ? "" : wallHHMM(w) + " ") + ev.title, allDay: ev.start.allDay });
        });
    });
    /* ===== AUSGEKLAMMERT: Aufgaben aus dem Aufgaben-Kalender =====
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
    ===== ENDE AUSGEKLAMMERT ===== */
    // Aufgaben des Tages aus der Datenbank (nur offene)
    let taskRecs = [];
    if (ctx.familyId) try { taskRecs = $app.findRecordsByFilter("aufgaben", "familie = {:f} && faellig = {:d} && erledigt = false", "von", 0, 0, { f: ctx.familyId, d: iso }); } catch (e) { taskRecs = []; }
    taskRecs.forEach(r => {
        const assign = assigneesFromText(r.getString("notizen"), ctx.members);
        if (!isRelevantFor(person, assign)) return;
        const missed = r.getInt("verpasst");
        const von = r.getString("von");
        aufgaben.push((von ? von + " " : "") + r.getString("titel") + (missed > 0 ? " (" + missed + "x nicht erledigt)" : ""));
    });
    termine.sort((a, b) => (a.allDay === b.allDay ? a.w - b.w : (a.allDay ? -1 : 1)));

    const recipes = ctx.data.recipes || [];
    const meals = (ctx.data.mealPlan || []).filter(m => m.date === iso)
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
        bis: wallToUtc(dayWall + DAY_MS), // in der Glocke nur bis Mitternacht
    };
}

// =============================================================================================
// Neue Zuweisung (Termin/Aufgabe in der App angelegt oder bearbeitet)
// =============================================================================================
// Mitglieds-IDs, die dem Termin mit dieser href bisher zugewiesen waren (aus der Kalenderdatei).
// Für Aufgaben (Datenbank) wird statt einer ID-Liste der bisherige Notiztext übergeben.
function assigneesForHref(href, familyId) {
    try {
        if (!familyId) return [];
        const ctx = loadPeople(familyId);
        const ev = loadCalendarEvents(familyId).find(x => x.href === href && !x.recurrenceId);
        if (!ev) return [];
        return assigneesFromText(ev.description, ctx.members).memberIds;
    } catch (e) { return []; }
}

// Schlüssel gegen doppelte Karten in der Glocke (gleich wie pinn-hinweise.js#termKey)
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
    }
}

// =============================================================================================
// Erledigte Aufgaben: "Alle Aufgaben erledigt" und Fortschritt der Kinder
// =============================================================================================
// Kind = Mitglied mit aktivierter Kinderseite oder mit der Rolle "Kind" / "Tochter" / "Sohn"
function isChildMember(m) {
    if (!m) return false;
    if (m.kid && m.kid.enabled) return true;
    return /^(kind|tochter|sohn)$/i.test(String(m.role || "").trim());
}
function todayWallIso() { return wallIsoDate(utcToWall(Date.now())); }

// Profile der Familie mit angemeldetem Gerät - leicht: ohne die großen Familiendaten zu laden,
// die Mitglieder werden mitgegeben.
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

// Einmal-Sperre im Zwischenspeicher, damit mehrfaches An-/Abhaken nicht mehrfach benachrichtigt.
// Gesperrt wird erst NACH einem erfolgreichen Versand - schlägt er fehl, klappt es beim nächsten Mal.
// Die Sperren werden zusätzlich in pb_data gesichert, damit nach einem Neustart nichts doppelt kommt.
function loadSentMap() {
    let raw = null;
    try { raw = $app.store().get(SENT_KEY); } catch (e) { raw = null; }
    if (raw) {
        try {
            const o = JSON.parse(String(raw));
            if (o && typeof o === "object") return o;
        } catch (e) { /* neu laden */ }
    }
    const m = pruneSent(readJsonFile(SENT_FILE) || {});
    try { $app.store().set(SENT_KEY, JSON.stringify(m)); } catch (e) { /* egal */ }
    return m;
}
function alreadySent(key) {
    return !!loadSentMap()[key];
}
function markSent(key) {
    const m = pruneSent(loadSentMap());
    m[key] = Date.now();
    try { $app.store().set(SENT_KEY, JSON.stringify(m)); } catch (e) { /* egal */ }
    writeJsonFile(SENT_FILE, m);
}

// Fortschritt eines Kindes an die anderen Profile der Familie (nie an das Kind selbst).
// info: { title, emoji, taskKey, allDone, allText, excludeUserId, singleKey, allKey }
// Ergebnis: { sent, empfaenger }
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
    // Als gesendet merken, sobald mindestens ein Gerät erreicht wurde (oder niemand es haben wollte)
    if (wantSingle && (sentSingle > 0 || sentAll > 0 || !result.empfaenger)) markSent(info.singleKey);
    if (wantAll && (sentAll > 0 || !result.empfaenger)) markSent(info.allKey);
    result.sent = sentSingle + sentAll;
    console.log("[Push] " + child.name + ": \"" + info.title + "\" erledigt" + (info.allDone ? " (alles erledigt)" : "") + " -> " + result.sent + " Gerät(e) benachrichtigt.");
    return result;
}

// Nach dem Abhaken einer Aufgabe in der Aufgabenliste.
// ctx: { familyId, members, actorUserId, actorMemberId, task: {id, title},
//        taskIsOwn, allDone, allSignature,           <- für die abhakende Person
//        children: [{ memberId, allDone, signature }] <- Kinder, denen die Aufgabe gehört }
// Kinder-Hinweise kommen auch, wenn Mama/Papa die Aufgabe des Kindes auf dem eigenen Handy abhakt.
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

        // "Alle erledigt" für Erwachsene
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
    }
}

const KID_PERIOD_LABELS = { morgens: "heute Morgen", mittags: "heute Mittag", nachmittags: "heute Nachmittag", abends: "heute Abend" };
// Nach dem Abhaken auf der Kinderseite. body: { memberId, taskId, allDone, period }
// Die Kinderseite läuft meist auf dem Gerät von Mama/Papa - deshalb bekommt hier auch das
// angemeldete Profil den Hinweis (auf seinen anderen Geräten sowieso).
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
// Verzögerte Erledigt-Meldungen (10 Sekunden)
// =============================================================================================
// Beim Abhaken wird die Meldung nur vorgemerkt. Wird das Häkchen innerhalb der 10 Sekunden wieder
// entfernt, wird sie verworfen. Verschickt wird, sobald die App nach Ablauf nachfragt
// (/api/pinn/push/faellige) - spätestens aber beim minütlichen Zeitplan (App geschlossen).
// Die Vormerkungen liegen im Zwischenspeicher und werden zusätzlich in pb_data gesichert. Nach
// einem Neustart werden sie vom minütlichen Zeitplan verschickt (älter als 30 Minuten: verworfen).
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
    } catch (e) { /* egal */ }
    writeJsonFile(DELAYED_FILE, map);
}
// Meldung vormerken (ersetzt eine ältere Vormerkung mit demselben Schlüssel)
function queueDelayed(key, entry) {
    const map = loadDelayed();
    entry.dueAt = Date.now() + DELAY_MS;
    map[key] = entry;
    saveDelayed(map);
}
// Vormerkung verwerfen. adjust(entry) darf andere Vormerkungen anpassen und gibt dann true zurück.
function cancelDelayed(key, adjust) {
    const map = loadDelayed();
    let changed = false;
    if (map[key]) { delete map[key]; changed = true; }
    if (adjust) Object.keys(map).forEach(k => { if (adjust(map[k])) changed = true; });
    if (changed) saveDelayed(map);
}
// Fällige Vormerkungen verschicken - familyId leer = alle Familien (Zeitplan)
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
        }
    });
    return processed;
}

// Kinderseite: Abhaken vormerken bzw. Häkchen entfernen.
// body: { memberId, taskId, allDone, period, done }
function queueKidPage(familyId, body) {
    const memberId = String(body.memberId || "");
    const taskId = String(body.taskId || "");
    if (!familyId || !memberId || !taskId) return false;
    const key = "kinderseite:" + memberId + ":" + taskId;
    if (body.done === false) {
        // Häkchen entfernt: Meldung verwerfen und bei den anderen vorgemerkten Aufgaben dieses
        // Kindes "alles geschafft" zurücknehmen
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
