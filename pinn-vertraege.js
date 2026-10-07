// pb_hooks/pinn-vertraege.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Finanzen → Verträge
//  - Die Verträge selbst (Name, Anbieter, Kategorie, Laufzeit, Kündigungsfrist, Erinnerung, Kontakt …)
//    liegen in den Finanzdaten ihrer Kasse (pinn-kassen.js, daten.contracts) und werden wie alles
//    andere zwischen den Geräten abgeglichen - offline-fähig. Erinnerungen bekommen nur Mitglieder
//    der Kasse; Dokumente einer Kasse (Feld "kasse") sehen nur ihre Mitglieder.
//  - Die Kosten eines Vertrags sind eine ganz normale regelmäßige Buchung (finance.recurring, Feld
//    "contract" = Vertrags-ID) und erscheinen dadurch automatisch in den Ausgaben. Wird ein Vertrag
//    gekündigt, endet die Buchung zum Vertragsende.
//  - Dokumente (Vertrag, Rechnung, Kündigung, Bestätigung …) und Belege zu einzelnen Ausgaben liegen
//    als Dateien in der Sammlung "finanz_dokumente" (geschützte Dateien, nur für die eigene Familie,
//    nicht für Gastkonten). Feld "bezug": "vertrag:<Vertrags-ID>" bzw. "ausgabe:<Ausgaben-ID>".
//  - Erinnerungen an Kündigungsfristen kommen als persönliche Push-Nachricht (pinn-push.js).
//
// Schonend für CPU und Speicher:
//  - Der Zeitplan läuft stündlich, arbeitet aber nur einmal am Tag (ab 8 Uhr) wirklich: dann werden
//    die Familiendaten jeder Familie genau einmal gelesen.
//  - Nach dem Speichern eines Vertrags prüft die App nur die eigene Familie sofort (zwischen 8 und
//    21 Uhr) - so kommt eine schon fällige Erinnerung nicht erst am nächsten Morgen.
//  - Gesendete Erinnerungen werden in pb_data gemerkt (pinn_vertraege_erinnert.json), damit nach
//    einem Neustart nichts doppelt kommt.

const DOKS = "finanz_dokumente";
const STATUS_FILE = "/pb_data/pinn_vertraege_erinnert.json";
const SEND_FROM_HOUR = 8;   // frühestens um 8 Uhr erinnern
const SEND_UNTIL_HOUR = 21; // sofortige Prüfung nach dem Speichern nur bis 21 Uhr
const DOC_MIME_TYPES = [
    "application/pdf",
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
];
const DOC_MAX_BYTES = 25 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Einrichtung: Sammlung "finanz_dokumente"
// ---------------------------------------------------------------------------------------------
const DOC_BASE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && familie = @request.auth.familie";
const DOC_READ_RULE = DOC_BASE_RULE + " && (kasse = '' || (@collection.kassen:dk.id ?= kasse && (@collection.kassen:dk.alle ?= true || @collection.kassen:dk.mitglieder ?~ @request.auth.id)))";
const DOC_CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && @request.body.familie = @request.auth.familie"
    + " && (@request.body.kasse:isset = false || @request.body.kasse = '' || (@collection.kassen:ck.id ?= @request.body.kasse && (@collection.kassen:ck.alle ?= true || @collection.kassen:ck.mitglieder ?~ @request.auth.id)))";
const DOC_UPDATE_RULE = DOC_READ_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie) && @request.body.kasse:isset = false";
// Ältere Regeln ohne Kassen - falls die neuen (noch) nicht gespeichert werden können
const DOC_FALLBACK = { listRule: DOC_BASE_RULE, viewRule: DOC_BASE_RULE, createRule: "@request.auth.id != '' && @request.auth.familie != '' && @request.auth.rolle != 'gast' && @request.body.familie = @request.auth.familie", updateRule: DOC_BASE_RULE + " && (@request.body.familie:isset = false || @request.body.familie = @request.auth.familie)", deleteRule: DOC_BASE_RULE };

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function makeField(def) {
    const tmp = new Collection({ type: "base", name: "pinn_tmp_" + def.name, fields: [def] });
    return tmp.fields.getByName(def.name);
}

function ensureSchema() {
    const fam = findCol("familien");
    let col = findCol(DOKS);
    if (!col) {
        if (!fam) {
            console.log("[Verträge] Sammlung \"familien\" fehlt noch - Dokumente werden beim nächsten Start eingerichtet.");
            return;
        }
        try {
            $app.save(new Collection({
                type: "base",
                name: DOKS,
                fields: [
                    { name: "datei", type: "file", maxSelect: 1, maxSize: DOC_MAX_BYTES, mimeTypes: DOC_MIME_TYPES, protected: true },
                    { name: "bezug", type: "text", max: 80 },
                    { name: "name", type: "text", max: 200 },
                    { name: "typ", type: "text", max: 30 },
                    { name: "datum", type: "text", max: 10 },
                    { name: "groesse", type: "number" },
                    { name: "erstellt_von", type: "text", max: 30 },
                    { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE INDEX `idx_finanz_dokumente_bezug` ON `" + DOKS + "` (`bezug`)",
                ],
                listRule: DOC_READ_RULE,
                viewRule: DOC_READ_RULE,
                createRule: DOC_CREATE_RULE,
                updateRule: DOC_UPDATE_RULE,
                deleteRule: DOC_READ_RULE,
            }));
            console.log("[Verträge] Sammlung \"" + DOKS + "\" angelegt.");
        } catch (err) {
            console.log("[Verträge] Konnte Sammlung \"" + DOKS + "\" nicht anlegen: " + err.message);
        }
        return;
    }
    // Feld "kasse" (Kassen) vor den Regeln anlegen - die Regeln verwenden es
    if (!hasField(col, "kasse")) {
        try {
            col = findCol(DOKS);
            col.fields.add(makeField({ name: "kasse", type: "text", max: 30 }));
            $app.save(col);
            console.log("[Verträge] Feld \"kasse\" in \"" + DOKS + "\" ergänzt.");
        } catch (err) {
            console.log("[Verträge] Feld \"kasse\" nicht anlegbar: " + err.message);
        }
        col = findCol(DOKS);
    }
    // Regeln aktuell halten (z. B. nach einer Änderung von Hand); Kassen-Regeln erst, wenn es Kassen gibt
    if (!findCol("kassen") || !hasField(col, "kasse")) {
        try {
            let changed = false;
            Object.keys(DOC_FALLBACK).forEach(k => { if (col[k] !== DOC_FALLBACK[k]) { col[k] = DOC_FALLBACK[k]; changed = true; } });
            if (changed) $app.save(col);
        } catch (err) { console.log("[Verträge] Regeln nicht setzbar: " + err.message); }
    } else try {
        let changed = false;
        const want = { listRule: DOC_READ_RULE, viewRule: DOC_READ_RULE, createRule: DOC_CREATE_RULE, updateRule: DOC_UPDATE_RULE, deleteRule: DOC_READ_RULE };
        Object.keys(want).forEach(k => { if (col[k] !== want[k]) { col[k] = want[k]; changed = true; } });
        if (changed) { $app.save(col); console.log("[Verträge] Regeln für \"" + DOKS + "\" gesetzt (mit Kassen)."); }
    } catch (err) {
        console.log("[Verträge] Kassen-Regeln nicht setzbar (" + err.message + ") - Dokumente bleiben für die ganze Familie sichtbar.");
        try {
            col = findCol(DOKS);
            Object.keys(DOC_FALLBACK).forEach(k => { col[k] = DOC_FALLBACK[k]; });
            $app.save(col);
        } catch (e2) { /* egal */ }
    }
    [{ name: "groesse", type: "number" }, { name: "erstellt_von", type: "text", max: 30 }].forEach(def => {
        const name = def.name;
        if (hasField(col, name)) return;
        try {
            col = findCol(DOKS);
            col.fields.add(makeField(def));
            $app.save(col);
            console.log("[Verträge] Feld \"" + name + "\" in \"" + DOKS + "\" ergänzt.");
        } catch (err) {
            console.log("[Verträge] Feld \"" + name + "\" nicht anlegbar: " + err.message);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Datumsrechnung (identisch zur App, reine Texte "JJJJ-MM-TT")
// ---------------------------------------------------------------------------------------------
function vtIsIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function vtParts(iso) { return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]; }
function vtPad(n) { return (n < 10 ? "0" : "") + n; }
function vtIso(y, m, d) { return y + "-" + vtPad(m) + "-" + vtPad(d); }
function vtDim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function vtAddDays(iso, n) {
    const p = vtParts(iso);
    const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return vtIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
// keepEom: liegt der Tag auf dem Monatsletzten, bleibt er auf dem Monatsletzten (31.12. + 3 Monate = 31.03.)
function vtAddMonths(iso, n, keepEom) {
    const p = vtParts(iso);
    const eom = keepEom && p[2] === vtDim(p[0], p[1]);
    const idx = p[0] * 12 + (p[1] - 1) + n;
    const ny = Math.floor(idx / 12), nm = idx - ny * 12 + 1;
    const dim = vtDim(ny, nm);
    return vtIso(ny, nm, eom ? dim : Math.min(p[2], dim));
}
function vtMonthEnd(iso) { const p = vtParts(iso); return vtIso(p[0], p[1], vtDim(p[0], p[1])); }
function vtDiffDays(a, b) {
    const pa = vtParts(a), pb = vtParts(b);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function vtNotice(c) {
    const n = (c && c.notice && typeof c.notice === "object") ? c.notice : {};
    const v = Math.max(0, Math.min(120, parseInt(n.value, 10) || 0));
    const unit = ["days", "weeks", "months"].indexOf(n.unit) >= 0 ? n.unit : "months";
    return { value: v, unit: unit };
}
function vtMinusNotice(iso, notice) {
    if (!notice.value) return iso;
    if (notice.unit === "days") return vtAddDays(iso, -notice.value);
    if (notice.unit === "weeks") return vtAddDays(iso, -7 * notice.value);
    return vtAddMonths(iso, -notice.value, true);
}
function vtPlusNotice(iso, notice) {
    if (!notice.value) return iso;
    if (notice.unit === "days") return vtAddDays(iso, notice.value);
    if (notice.unit === "weeks") return vtAddDays(iso, 7 * notice.value);
    return vtAddMonths(iso, notice.value, false);
}
function vtTermType(c) { return ["fixed", "open", "once"].indexOf(c && c.termType) >= 0 ? c.termType : "fixed"; }
function vtFirstEnd(c) {
    if (vtIsIso(c.firstEnd)) return c.firstEnd;
    const m = parseInt(c.minMonths, 10) || 0;
    if (vtIsIso(c.start) && m > 0) return vtAddDays(vtAddMonths(c.start, m, false), -1);
    return "";
}
function vtRenew(c) {
    const r = parseInt(c.renewMonths, 10);
    return [1, 3, 6, 12, 24, 36].indexOf(r) >= 0 ? r : 12;
}
// Zustand eines Vertrags an einem Tag.
// { state: 'aktiv'|'gekuendigt'|'beendet', kind, end, termEnd, nextEnd, deadline, daysLeft, earliestEnd, unknown }
function vtStatus(c, today) {
    const kind = vtTermType(c);
    const cancel = c && c.cancel && vtIsIso(c.cancel.effective) ? c.cancel : null;
    if (cancel) return { kind: kind, state: cancel.effective < today ? "beendet" : "gekuendigt", end: cancel.effective };
    const notice = vtNotice(c);
    if (kind === "once") {
        const end = vtFirstEnd(c);
        if (!end) return { kind: kind, state: "aktiv", unknown: true };
        return { kind: kind, state: end < today ? "beendet" : "aktiv", end: end, daysLeft: vtDiffDays(today, end) };
    }
    if (kind === "open") {
        let earliest = vtPlusNotice(today, notice);
        if (c.noticeMonthEnd) earliest = vtMonthEnd(earliest);
        return { kind: kind, state: "aktiv", earliestEnd: earliest };
    }
    const first = vtFirstEnd(c);
    if (!first) return { kind: kind, state: "aktiv", unknown: true };
    const R = vtRenew(c);
    let k = 0;
    let end = first;
    if (end < today) {
        const p1 = vtParts(first), p2 = vtParts(today);
        k = Math.max(0, Math.floor(((p2[0] - p1[0]) * 12 + (p2[1] - p1[1])) / R) - 1);
        end = vtAddMonths(first, k * R, true);
        for (let g = 0; g < 400 && end < today; g++) { k++; end = vtAddMonths(first, k * R, true); }
    }
    const termEnd = end;
    let kk = k, nextEnd = end, deadline = vtMinusNotice(end, notice);
    for (let g = 0; g < 400 && deadline < today; g++) { kk++; nextEnd = vtAddMonths(first, kk * R, true); deadline = vtMinusNotice(nextEnd, notice); }
    return { kind: kind, state: "aktiv", termEnd: termEnd, nextEnd: nextEnd, deadline: deadline, daysLeft: vtDiffDays(today, deadline), renew: R, missed: nextEnd !== termEnd };
}
function vtReminder(c) {
    const r = (c && c.reminder && typeof c.reminder === "object") ? c.reminder : {};
    const days = [7, 14, 30, 60, 90].indexOf(parseInt(r.days, 10)) >= 0 ? parseInt(r.days, 10) : 30;
    return { on: r.on !== false, days: days, last: r.last !== false, to: Array.isArray(r.to) ? r.to.filter(x => typeof x === "string") : [] };
}

// ---------------------------------------------------------------------------------------------
// Zeit (Mitteleuropa, feste EU-Sommerzeitregel - wie pinn-push.js)
// ---------------------------------------------------------------------------------------------
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}
function wallNow() {
    const now = Date.now();
    const d = new Date(now + tzOffsetMs(now));
    return { iso: vtIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()), hour: d.getUTCHours() };
}
function fmtDe(iso) { return vtIsIso(iso) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }
function inDays(n) { return n <= 0 ? "heute" : n === 1 ? "morgen" : "in " + n + " Tagen"; }

// ---------------------------------------------------------------------------------------------
// Merkliste gesendeter Erinnerungen
// ---------------------------------------------------------------------------------------------
function readStatus() {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(STATUS_FILE)));
        if (o && typeof o === "object") {
            if (!o.sent || typeof o.sent !== "object") o.sent = {};
            return o;
        }
    } catch (e) { /* noch keine Datei */ }
    return { lastDaily: "", sent: {} };
}
function writeStatus(s) {
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Verträge] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}
function pruneStatus(s, today) {
    const cutoff = vtAddDays(today, -400);
    Object.keys(s.sent).forEach(k => { if (typeof s.sent[k] !== "string" || s.sent[k] < cutoff) delete s.sent[k]; });
}

// ---------------------------------------------------------------------------------------------
// Erinnerungen
// ---------------------------------------------------------------------------------------------
function isChild(m) {
    if (!m) return false;
    if (m.kid && m.kid.enabled) return true;
    return /^(kind|tochter|sohn)$/i.test(String(m.role || "").trim());
}
// Empfänger: gewählte Mitglieder; sonst der Vertragsinhaber; sonst alle Erwachsenen (keine Gäste, keine Kinder)
function recipientsFor(c, users, members, allowedIds) {
    if (allowedIds) users = users.filter(u => allowedIds.indexOf(u.id) >= 0);
    const rem = vtReminder(c);
    const byMember = {};
    users.forEach(u => { const mid = u.getString("mitglied"); if (mid) byMember[mid] = u; });
    let ids = rem.to.filter(id => byMember[id]);
    if (!ids.length && c.holder && byMember[c.holder]) ids = [c.holder];
    if (!ids.length) ids = members.filter(m => !isChild(m) && byMember[m.id]).map(m => m.id);
    return ids.map(id => byMember[id]).filter(u => u && u.getString("rolle") !== "gast");
}

// Welche Erinnerungen sind für einen Vertrag heute fällig? -> [{ key, titel, text }]
function dueMessages(familyId, c, today) {
    const out = [];
    const name = String(c.name || "Vertrag").slice(0, 80);
    const rem = vtReminder(c);
    const s = vtStatus(c, today);
    if (rem.on && s.state === "aktiv") {
        if (s.kind === "fixed" && s.deadline && !s.unknown) {
            const dl = s.deadline;
            const renewText = s.renew === 1 ? "um einen Monat" : "um " + s.renew + " Monate";
            const base = "Kündigung bis " + fmtDe(dl) + " (" + inDays(s.daysLeft) + ") zum " + fmtDe(s.nextEnd) + " – sonst verlängert er sich " + renewText + ".";
            const lastDue = rem.last && rem.days > 3 && today >= vtAddDays(dl, -3) && today <= dl;
            const firstDue = today >= vtAddDays(dl, -rem.days) && today <= dl;
            const kFirst = familyId + "|" + c.id + "|frist|" + dl;
            const kLast = familyId + "|" + c.id + "|letzte|" + dl;
            if (lastDue) out.push({ keys: [kLast, kFirst], titel: "⏰ Letzte Chance: " + name + " kündigen", text: base });
            else if (firstDue) out.push({ keys: [kFirst], titel: "📄 Kündigungsfrist: " + name, text: base });
        } else if (s.kind === "once" && s.end && !s.unknown) {
            if (today >= vtAddDays(s.end, -rem.days) && today <= s.end) {
                out.push({ keys: [familyId + "|" + c.id + "|ende|" + s.end], titel: "📄 Vertrag endet: " + name, text: "Der Vertrag endet am " + fmtDe(s.end) + " (" + inDays(s.daysLeft) + ")." });
            }
        }
    }
    const x = (c.extraReminder && typeof c.extraReminder === "object") ? c.extraReminder : {};
    if (vtIsIso(x.date) && today >= x.date && today <= vtAddDays(x.date, 3) && s.state !== "beendet") {
        out.push({ keys: [familyId + "|" + c.id + "|eigene|" + x.date], titel: "🔔 " + name, text: String(x.text || "Erinnerung zu diesem Vertrag").slice(0, 300) });
    }
    return out;
}

function remindFamily(familyId, today, status) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const push = require(`${__hooks}/pinn-push.js`);
    // Verträge je Kasse - Erinnerungen nur an Mitglieder der jeweiligen Kasse
    let groups = [];
    try { groups = require(`${__hooks}/pinn-kassen.js`).contractsOfFamily(familyId); } catch (e) { groups = []; }
    let data = null;
    if (!groups.length) {
        // Familie noch ohne Kassen: wie bisher aus dem Familien-Datensatz
        data = lib.loadFamilyDataFor(familyId) || {};
        const fin = (data.finance && typeof data.finance === "object") ? data.finance : {};
        const list = Array.isArray(fin.contracts) ? fin.contracts.filter(c => c && typeof c.id === "string" && c.id) : [];
        if (list.length) groups = [{ contracts: list, userIds: null }];
    }
    if (!groups.length) return 0;
    if (!data) data = lib.loadFamilyDataFor(familyId) || {};
    const members = Array.isArray(data.members) ? data.members : [];
    let users = null;
    let sent = 0;
    groups.forEach(g => g.contracts.forEach(c => {
        dueMessages(familyId, c, today).forEach(msg => {
            if (msg.keys.some(k => status.sent[k])) return;
            if (!users) {
                try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
            }
            const targets = recipientsFor(c, users, members, g.userIds);
            let delivered = 0;
            targets.forEach(u => {
                try {
                    delivered += push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: "/?vertrag=" + encodeURIComponent(c.id), tag: "vertrag-" + c.id, urgency: "normal" });
                } catch (e) { console.log("[Verträge] Push fehlgeschlagen: " + e.message); }
            });
            // Auch ohne angemeldetes Gerät als erledigt merken - sonst käme sie Tage später nach
            msg.keys.forEach(k => { status.sent[k] = today; });
            sent += delivered;
        });
    }));
    return sent;
}

// opts: { familyId: nur diese Familie (sofortige Prüfung nach dem Speichern) }
function runReminders(opts) {
    const o = opts || {};
    const now = wallNow();
    if (now.hour < SEND_FROM_HOUR) return { skipped: "zu früh" };
    const status = readStatus();
    pruneStatus(status, now.iso);
    let sent = 0;
    if (o.familyId) {
        if (now.hour >= SEND_UNTIL_HOUR) return { skipped: "zu spät" };
        sent = remindFamily(String(o.familyId), now.iso, status);
        writeStatus(status);
        return { sent: sent };
    }
    if (status.lastDaily === now.iso) return { skipped: "heute schon erledigt" };
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    lib.allFamilies().forEach(f => {
        try { sent += remindFamily(f.id, now.iso, status); } catch (e) { console.log("[Verträge] Familie " + f.id + ": " + e.message); }
    });
    status.lastDaily = now.iso;
    writeStatus(status);
    if (sent) console.log("[Verträge] " + sent + " Erinnerung(en) verschickt.");
    return { sent: sent };
}

module.exports = { ensureSchema, runReminders, vtStatus, DOKS };
