// pb_hooks/pinn-chat.js
// Not a *.pb.js file -> not loaded as a hook by itself, only through require() (routes: chat.pb.js).
//
// Family chat with end-to-end encryption (since 1.127.0).
//
// What the SERVER sees and what it never sees:
//   - never: the text of a message, who is mentioned in it, what it links to (all of that is inside the
//     encrypted package "daten"), and the private keys of the profiles (they only ever live on the devices;
//     the server keeps a copy that is encrypted with a recovery code the server does not know)
//   - yes: who wrote to which room at what time, the size of a message, who has read it (unless the reader
//     switched read receipts off), and the PUBLIC key of each profile
//
// Collections (locked: only reachable through the routes of this module):
//   chat_schluessel   one record per profile: public key, encrypted backup of the private key, read-receipt choice
//   chat_nachrichten  one record per message: room, sender, time, encrypted package, recipients, read marks
//
// Rooms: "familie" (everybody of the family with a profile) and "dm:<idA>:<idB>" (two profile IDs, sorted).
//
// The encrypted package ("daten", JSON) is made and opened in the app (js/chat.js):
//   { v: 1, s: <sender profile ID>, sp: <sender public key>, salt, iv, ct, w: { <profile ID>: { iv, k } } }
//   ct = AES-GCM of the message with a random message key; w[x] = that message key, encrypted for profile x
//   with a key derived from ECDH(sender private key, x public key). The server only checks the shape.

const KEYS = "chat_schluessel";
const MSGS = "chat_nachrichten";
const MAX_DATA = 40000;          // size of one encrypted package
const MAX_BACKUP = 8000;         // size of the encrypted private key copy
const MAX_RECIPIENTS = 40;
const UNREAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 60;
const LANGS = ["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko", "ru", "nl"];
const PUSH_TEXT = {
    de: { group: "Neue Nachricht im Gruppenchat", dm: "Neue Nachricht" },
    en: { group: "New message in the group chat", dm: "New message" },
    fr: { group: "Nouveau message dans le chat de groupe", dm: "Nouveau message" },
    es: { group: "Mensaje nuevo en el chat grupal", dm: "Mensaje nuevo" },
    it: { group: "Nuovo messaggio nella chat di gruppo", dm: "Nuovo messaggio" },
    pt: { group: "Nova mensagem no chat em grupo", dm: "Nova mensagem" },
    zh: { group: "群聊中有新消息", dm: "新消息" },
    ja: { group: "グループチャットに新しいメッセージ", dm: "新しいメッセージ" },
    ko: { group: "그룹 채팅에 새 메시지", dm: "새 메시지" },
    ru: { group: "Новое сообщение в групповом чате", dm: "Новое сообщение" },
    nl: { group: "Nieuw bericht in de groepschat", dm: "Nieuw bericht" },
};

module.exports = { ensureSchema, roster, saveKey, saveBackup, saveSettings, overview, list, send, markRead, remove };

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (!findCol(KEYS)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: KEYS,
                fields: [
                    { name: "benutzer", type: "text", max: 40, required: true },
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "oeffentlich", type: "text", max: 300 },
                    { name: "gesichert", type: "text", max: MAX_BACKUP },
                    { name: "lese_aus", type: "bool" },
                    { name: "zeit", type: "number" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: ["CREATE UNIQUE INDEX `idx_chat_schluessel_benutzer` ON `" + KEYS + "` (`benutzer`)"],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + KEYS + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + KEYS + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(MSGS)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: MSGS,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "raum", type: "text", max: 100, required: true },
                    { name: "von", type: "text", max: 40, required: true },
                    { name: "zeit", type: "number" },
                    { name: "aktualisiert", type: "number" },
                    { name: "daten", type: "text", max: MAX_DATA },
                    { name: "empf", type: "text", max: 2000 },
                    { name: "gelesen", type: "text", max: 20000 },
                    { name: "geloescht", type: "bool" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE INDEX `idx_chat_nachrichten_raum` ON `" + MSGS + "` (`familie`, `raum`, `zeit`)",
                    "CREATE INDEX `idx_chat_nachrichten_akt` ON `" + MSGS + "` (`familie`, `raum`, `aktualisiert`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + MSGS + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + MSGS + "\" nicht anlegen: " + err.message);
        }
    }
    return !!(findCol(KEYS) && findCol(MSGS));
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function authUser(e) {
    const u = e.auth;
    if (!u || u.collection().name !== "benutzer") throw new Error("Nicht angemeldet.");
    if (u.getString("rolle") === "gast" || !u.getString("familie")) throw new Error("Nicht erlaubt.");
    ensureSchema();
    return u;
}
function familyUsers(familyId) {
    try { return $app.findRecordsByFilter("benutzer", "familie = {:f} && rolle != 'gast'", "", 0, 0, { f: familyId }); } catch (err) { return []; }
}
function keyRec(userId) {
    try { return $app.findFirstRecordByFilter(KEYS, "benutzer = {:u}", { u: String(userId) }); } catch (err) { return null; }
}
const B64 = /^[A-Za-z0-9+/=_-]+$/;
function cleanB64(v, min, max) {
    const s = String(v || "");
    if (s.length < min || s.length > max || !B64.test(s)) throw new Error("Schlüssel ungültig.");
    return s;
}
function parseObj(text) {
    try { const o = JSON.parse(String(text || "{}")); return (o && typeof o === "object" && !Array.isArray(o)) ? o : {}; } catch (err) { return {}; }
}
// Members of a room (user records) or an error when this profile may not use the room
function roomMembers(u, room) {
    const fam = u.getString("familie");
    const all = familyUsers(fam);
    if (room === "familie") return all;
    const m = /^dm:([a-z0-9]{15}):([a-z0-9]{15})$/.exec(String(room || ""));
    if (!m || m[1] >= m[2] || (m[1] !== u.id && m[2] !== u.id)) throw new Error("Unbekannter Chat.");
    const members = all.filter(x => x.id === m[1] || x.id === m[2]);
    if (members.length !== 2) throw new Error("Unbekannter Chat.");
    return members;
}
function canSeeRoom(userId, room) {
    if (room === "familie") return true;
    const m = /^dm:([a-z0-9]{15}):([a-z0-9]{15})$/.exec(String(room || ""));
    return !!m && (m[1] === userId || m[2] === userId);
}
function hasId(list, id) { return String(list || "").indexOf("," + id + ",") >= 0; }
function msgOut(rec, me, receipts) {
    const gel = parseObj(rec.getString("gelesen"));
    const shown = {};
    Object.keys(gel).forEach(id => { if (id === me || receipts[id]) shown[id] = gel[id]; });
    const deleted = !!rec.getBool("geloescht");
    return {
        id: rec.id, raum: rec.getString("raum"), von: rec.getString("von"), zeit: Number(rec.get("zeit") || 0),
        aktualisiert: Number(rec.get("aktualisiert") || 0), daten: deleted ? "" : rec.getString("daten"),
        empf: rec.getString("empf"), gelesen: shown, geloescht: deleted,
    };
}
// Who counts for read marks: profiles that did not switch read receipts off
function receiptMap(familyId) {
    const out = {};
    familyUsers(familyId).forEach(u => { out[u.id] = true; });
    try {
        $app.findRecordsByFilter(KEYS, "familie = {:f}", "", 0, 0, { f: familyId }).forEach(k => { if (k.getBool("lese_aus")) out[k.getString("benutzer")] = false; });
    } catch (err) { /* none */ }
    return out;
}

// ---------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------
// Everybody of the family with the public key (null = not set up yet) and the own backup
function roster(e) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const keys = {};
    try { $app.findRecordsByFilter(KEYS, "familie = {:f}", "", 0, 0, { f: fam }).forEach(k => { keys[k.getString("benutzer")] = k; }); } catch (err) { /* none */ }
    const profiles = familyUsers(fam).map(x => ({
        id: x.id, username: x.getString("username"), mitglied: x.getString("mitglied"),
        oeffentlich: keys[x.id] ? (keys[x.id].getString("oeffentlich") || null) : null,
        lese: keys[x.id] ? !keys[x.id].getBool("lese_aus") : true,
    }));
    const mine = keys[u.id] ? { oeffentlich: keys[u.id].getString("oeffentlich"), gesichert: keys[u.id].getString("gesichert"), lese: !keys[u.id].getBool("lese_aus") } : null;
    return { ich: u.id, profile: profiles, mein: mine, jetzt: Date.now() };
}
// Store the public key and the encrypted backup of the private key.
// An existing key is only replaced with ersetzen = true (then older messages can no longer be read by this profile).
function saveKey(e, body) {
    const u = authUser(e);
    const pub = cleanB64(body && body.oeffentlich, 80, 300);
    const backup = String((body && body.gesichert) || "");
    if (!backup || backup.length > MAX_BACKUP) throw new Error("Sicherung ungültig.");
    let rec = keyRec(u.id);
    if (rec && rec.getString("oeffentlich") !== pub && !(body && body.ersetzen === true)) throw new Error("Es gibt schon einen Schlüssel.");
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(KEYS));
        rec.set("benutzer", u.id);
        rec.set("familie", u.getString("familie"));
    }
    rec.set("oeffentlich", pub);
    rec.set("gesichert", backup);
    rec.set("zeit", Date.now());
    $app.save(rec);
    return { ok: true };
}
// New recovery code for the same key: only the encrypted backup changes
function saveBackup(e, body) {
    const u = authUser(e);
    const rec = keyRec(u.id);
    const backup = String((body && body.gesichert) || "");
    if (!rec || rec.getString("oeffentlich") !== String((body && body.oeffentlich) || "")) throw new Error("Schlüssel passt nicht.");
    if (!backup || backup.length > MAX_BACKUP) throw new Error("Sicherung ungültig.");
    rec.set("gesichert", backup);
    $app.save(rec);
    return { ok: true };
}
function saveSettings(e, body) {
    const u = authUser(e);
    const rec = keyRec(u.id);
    if (!rec) throw new Error("Chat nicht eingerichtet.");
    rec.set("lese_aus", !(body && body.lese !== false));
    $app.save(rec);
    return { ok: true, lese: !rec.getBool("lese_aus") };
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------
// Latest message and number of unread messages per room (list of chats and the badge in the menu)
function overview(e) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const receipts = receiptMap(fam);
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(MSGS, "familie = {:f} && zeit > {:z}", "-zeit", 1500, 0, { f: fam, z: Date.now() - UNREAD_WINDOW_MS });
    } catch (err) { recs = []; }
    const rooms = {};
    recs.forEach(r => {
        const room = r.getString("raum");
        if (!canSeeRoom(u.id, room)) return;
        if (!hasId(r.getString("empf"), u.id) && r.getString("von") !== u.id) return;
        const o = rooms[room] || (rooms[room] = { raum: room, letzte: null, ungelesen: 0 });
        if (!o.letzte) o.letzte = msgOut(r, u.id, receipts);
        const mine = r.getString("von") === u.id;
        if (!mine && !r.getBool("geloescht") && hasId(r.getString("empf"), u.id) && !parseObj(r.getString("gelesen"))[u.id]) o.ungelesen++;
    });
    const list = Object.keys(rooms).map(k => rooms[k]);
    return { raeume: list, gesamt: list.reduce((n, x) => n + x.ungelesen, 0), jetzt: Date.now() };
}
// Messages of a room. seit = only what changed since that time (new, read, deleted; ">=" because several changes can share
// one millisecond - the app ignores what it already has);
// otherwise the latest PAGE messages (vor = older than that time)
function list(e, query) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const room = String(query.raum || "");
    roomMembers(u, room);
    const receipts = receiptMap(fam);
    const seit = Number(query.seit || 0);
    const vor = Number(query.vor || 0);
    let recs = [];
    let more = false;
    if (seit > 0) {
        recs = $app.findRecordsByFilter(MSGS, "familie = {:f} && raum = {:r} && aktualisiert >= {:s}", "aktualisiert", 300, 0, { f: fam, r: room, s: seit });
    } else {
        const filter = vor > 0 ? "familie = {:f} && raum = {:r} && zeit < {:v}" : "familie = {:f} && raum = {:r}";
        recs = $app.findRecordsByFilter(MSGS, filter, "-zeit", PAGE + 1, 0, vor > 0 ? { f: fam, r: room, v: vor } : { f: fam, r: room });
        if (recs.length > PAGE) { more = true; recs = recs.slice(0, PAGE); }
        recs.reverse();
    }
    const out = recs.filter(r => r.getString("von") === u.id || hasId(r.getString("empf"), u.id)).map(r => msgOut(r, u.id, receipts));
    return { nachrichten: out, mehr: more, jetzt: Date.now() };
}
function senderName(familyId, u) {
    try {
        const data = require(`${__hooks}/pinn-benutzer.js`).loadFamilyDataFor(familyId) || {};
        const mid = u.getString("mitglied");
        const m = mid ? (data.members || []).find(x => x.id === mid) : null;
        if (m && m.name) return String(m.name).slice(0, 40);
    } catch (err) { /* fall back to the profile name */ }
    return u.getString("username").slice(0, 40);
}
function langOf(u) {
    let w = {};
    try { w = require(`${__hooks}/pinn-design.js`).readDesign(u).werte || {}; } catch (err) { w = {}; }
    const s = String(w.sprache || "");
    if (LANGS.indexOf(s) >= 0) return s;
    if (/^[a-z]{2}$/.test(s)) return "en";
    const land = String(w.land || "").toUpperCase();
    const map = { de: ["DE", "AT", "CH", "LI", "LU"], fr: ["FR", "BE", "MC"], es: ["ES", "MX", "AR", "CO", "CL", "PE"], it: ["IT", "SM", "VA"], pt: ["BR", "PT", "AO", "MZ"], zh: ["CN"], ja: ["JP"], ko: ["KR"], ru: ["RU"], nl: ["NL", "SR", "AW", "CW", "SX"] };
    const hit = Object.keys(map).find(k => map[k].indexOf(land) >= 0);
    return hit || "en";
}
// Push: only "someone wrote" - the text is encrypted, so the server cannot put it into the message
function notify(familyId, sender, room, recipients) {
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (err) { return 0; }
    const name = senderName(familyId, sender);
    let sent = 0;
    recipients.forEach(r => {
        try {
            if (push.readSettings(r).chat === false) return;
            const t = PUSH_TEXT[langOf(r)] || PUSH_TEXT.en;
            sent += push.notifyUser(r.id, {
                titel: "💬 " + name, text: room === "familie" ? t.group : t.dm,
                url: "/?chat=" + encodeURIComponent(room), tag: "chat-" + room, urgency: "high", hinweis: false,
            }) || 0;
        } catch (err) { /* next recipient */ }
    });
    return sent;
}
function send(e, body) {
    const u = authUser(e);
    const room = String((body && body.raum) || "");
    const members = roomMembers(u, room);
    const daten = String((body && body.daten) || "");
    if (!daten || daten.length > MAX_DATA) throw new Error("Nachricht ungültig.");
    let pack = null;
    try { pack = JSON.parse(daten); } catch (err) { pack = null; }
    if (!pack || pack.v !== 1 || pack.s !== u.id || typeof pack.ct !== "string" || typeof pack.iv !== "string" || typeof pack.salt !== "string" || typeof pack.sp !== "string" || !pack.w || typeof pack.w !== "object") throw new Error("Nachricht ungültig.");
    const ids = members.map(m => m.id);
    const empf = Object.keys(pack.w).filter(id => ids.indexOf(id) >= 0).slice(0, MAX_RECIPIENTS);
    if (empf.indexOf(u.id) < 0) throw new Error("Nachricht ungültig.");
    const mine = keyRec(u.id);
    if (!mine || mine.getString("oeffentlich") !== pack.sp) throw new Error("Der Chat-Schlüssel ist nicht aktuell.");
    const now = Date.now();
    const rec = new Record($app.findCollectionByNameOrId(MSGS));
    rec.set("familie", u.getString("familie"));
    rec.set("raum", room);
    rec.set("von", u.id);
    rec.set("zeit", now);
    rec.set("aktualisiert", now);
    rec.set("daten", daten);
    rec.set("empf", "," + empf.join(",") + ",");
    rec.set("gelesen", "{}");
    $app.save(rec);
    let pushed = 0;
    try { pushed = notify(u.getString("familie"), u, room, members.filter(m => m.id !== u.id && empf.indexOf(m.id) >= 0)); } catch (err) { console.log("[Chat] Push: " + err.message); }
    return { id: rec.id, zeit: now, push: pushed };
}
// Mark everything in a room as read by this profile
function markRead(e, body) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const room = String((body && body.raum) || "");
    roomMembers(u, room);
    let recs = [];
    try { recs = $app.findRecordsByFilter(MSGS, "familie = {:f} && raum = {:r} && von != {:u}", "-zeit", 300, 0, { f: fam, r: room, u: u.id }); } catch (err) { recs = []; }
    const now = Date.now();
    let n = 0;
    recs.forEach(r => {
        if (!hasId(r.getString("empf"), u.id) || r.getBool("geloescht")) return;
        const gel = parseObj(r.getString("gelesen"));
        if (gel[u.id]) return;
        gel[u.id] = now;
        r.set("gelesen", JSON.stringify(gel));
        r.set("aktualisiert", now);
        $app.save(r);
        n++;
    });
    return { ok: true, markiert: n };
}
// Delete an own message for everybody (the encrypted package is wiped)
function remove(e, body) {
    const u = authUser(e);
    let rec = null;
    try { rec = $app.findRecordById(MSGS, String((body && body.id) || "")); } catch (err) { rec = null; }
    if (!rec || rec.getString("familie") !== u.getString("familie") || rec.getString("von") !== u.id) throw new Error("Nicht gefunden.");
    rec.set("daten", "");
    rec.set("geloescht", true);
    rec.set("aktualisiert", Date.now());
    $app.save(rec);
    return { ok: true };
}
