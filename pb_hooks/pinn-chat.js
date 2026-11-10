// pb_hooks/pinn-chat.js
// Not a *.pb.js file -> not loaded as a hook by itself, only through require() (routes: chat.pb.js).
//
// Family chat with end-to-end encryption (since 1.127.0; photos and videos since 1.127.1; own groups, pinned chats and
// chat pictures since 1.127.3; since 1.127.4: voice messages, locations, polls, PDF files, muting, dissolving groups and an
// optional "no end-to-end encryption" mode per family).
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
//   chat_dateien      (1.127.1) one record per photo/video: the ENCRYPTED file (protected, only reachable through the routes)
//   chat_familie      (1.127.1) per family: automatic deletion of old messages / old photos and videos (days, 0 = keep)
//   chat_gruppen      (1.127.3) groups made by the family members: name, members (profile IDs), creator
//   chat_markierungen (1.127.3) per profile: pinned chats and chats marked as unread (JSON { room: { p, u } })
//   chat_bilder       (1.127.3) picture of the family chat / of a group (small JPEG as a data URL)
//
// 1.127.4 - the mode of a family (chat_familie.klartext, set by an admin):
//   default (false): end-to-end encrypted as described above, the push message only says "someone wrote".
//   true: messages are stored readable ("daten" = { v: 2, s: <sender>, p: <message object> }), everybody of the room gets them
//         (also profiles without a chat key) and the push message carries the text; for photos/videos the app uploads a small
//         preview picture that the push message links to (GET vorschau, protected by a random token). Switching the mode
//         never changes old messages. Silent messages ("leise", used for poll votes) never push and never count as unread.
//
// 1.127.6 - a deleted message keeps its place (geloescht = true, daten wiped); "dart" = "p" when the sender deleted a poll,
// so the app can show "the poll was deleted".
//
// Rooms: "familie" (everybody of the family with a profile), "dm:<idA>:<idB>" (two profile IDs, sorted) and
// "gr:<ID of the group record>" (the members chosen by the creator - they are in the group right away, no invitation).
// Names and pictures of groups are NOT encrypted (the server needs the members for the keys); messages still are.
//
// The encrypted package ("daten", JSON) is made and opened in the app (js/chat.js):
//   { v: 1, s: <sender profile ID>, sp: <sender public key>, salt, iv, ct, w: { <profile ID>: { iv, k } } }
//   ct = AES-GCM of the message with a random message key; w[x] = that message key, encrypted for profile x
//   with a key derived from ECDH(sender private key, x public key). The server only checks the shape.

const KEYS = "chat_schluessel";
const MSGS = "chat_nachrichten";
const MAX_DATA = 100000;         // size of one encrypted package (a message with a photo carries a small preview)
const FILES = "chat_dateien";
const FAM = "chat_familie";
const MAX_FILE = 60 * 1024 * 1024; // one encrypted photo/video
const KEEP_CHOICES = [0, 7, 30, 90, 180, 365]; // days, 0 = keep for ever
const ORPHAN_MS = 24 * 60 * 60 * 1000;     // uploaded but never sent
const MAX_BACKUP = 8000;         // size of the encrypted private key copy
const MAX_RECIPIENTS = 40;
const GROUPS = "chat_gruppen";
const MARKS = "chat_markierungen";
const PICS = "chat_bilder";
const MAX_GROUP_NAME = 40;
const MAX_PIC = 130000;          // a chat picture: small JPEG as a data URL (the app makes about 15-40 KB)
const MAX_MARKS = 300;
const DM_RE = /^dm:([a-z0-9]{15}):([a-z0-9]{15})$/;
const GR_RE = /^gr:([a-z0-9]{15})$/;
const UNREAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE = 60;
const LANGS = ["de", "en", "fr", "es", "it", "pt", "zh", "ja", "ko", "ru", "nl", "tr", "pl", "uk"];
const MAX_PREVIEW = 200 * 1024;  // preview picture of a photo/video push message (plain mode only)
const MUTE_MAX_MS = 400 * 24 * 60 * 60 * 1000;
const PUSH_TEXT = {
    de: { group: "Neue Nachricht im Gruppenchat", dm: "Neue Nachricht", photo: "Foto", video: "Video", voice: "Sprachnachricht", file: "Datei", loc: "Standort", poll: "Umfrage" },
    en: { group: "New message in the group chat", dm: "New message", photo: "Photo", video: "Video", voice: "Voice message", file: "File", loc: "Location", poll: "Poll" },
    fr: { group: "Nouveau message dans le chat de groupe", dm: "Nouveau message", photo: "Photo", video: "Vidéo", voice: "Message vocal", file: "Fichier", loc: "Position", poll: "Sondage" },
    es: { group: "Mensaje nuevo en el chat grupal", dm: "Mensaje nuevo", photo: "Foto", video: "Vídeo", voice: "Mensaje de voz", file: "Archivo", loc: "Ubicación", poll: "Encuesta" },
    it: { group: "Nuovo messaggio nella chat di gruppo", dm: "Nuovo messaggio", photo: "Foto", video: "Video", voice: "Messaggio vocale", file: "File", loc: "Posizione", poll: "Sondaggio" },
    pt: { group: "Nova mensagem no chat em grupo", dm: "Nova mensagem", photo: "Foto", video: "Vídeo", voice: "Mensagem de voz", file: "Arquivo", loc: "Localização", poll: "Enquete" },
    zh: { group: "群聊中有新消息", dm: "新消息", photo: "照片", video: "视频", voice: "语音消息", file: "文件", loc: "位置", poll: "投票" },
    ja: { group: "グループチャットに新しいメッセージ", dm: "新しいメッセージ", photo: "写真", video: "動画", voice: "ボイスメッセージ", file: "ファイル", loc: "位置情報", poll: "アンケート" },
    ko: { group: "그룹 채팅에 새 메시지", dm: "새 메시지", photo: "사진", video: "동영상", voice: "음성 메시지", file: "파일", loc: "위치", poll: "투표" },
    ru: { group: "Новое сообщение в групповом чате", dm: "Новое сообщение", photo: "Фото", video: "Видео", voice: "Голосовое сообщение", file: "Файл", loc: "Местоположение", poll: "Опрос" },
    nl: { group: "Nieuw bericht in de groepschat", dm: "Nieuw bericht", photo: "Foto", video: "Video", voice: "Spraakbericht", file: "Bestand", loc: "Locatie", poll: "Peiling" },
    tr: { group: "Grup sohbetinde yeni mesaj", dm: "Yeni mesaj", photo: "Fotoğraf", video: "Video", voice: "Sesli mesaj", file: "Dosya", loc: "Konum", poll: "Anket" },
    pl: { group: "Nowa wiadomość na czacie grupowym", dm: "Nowa wiadomość", photo: "Zdjęcie", video: "Wideo", voice: "Wiadomość głosowa", file: "Plik", loc: "Lokalizacja", poll: "Ankieta" },
    uk: { group: "Нове повідомлення в груповому чаті", dm: "Нове повідомлення", photo: "Фото", video: "Відео", voice: "Голосове повідомлення", file: "Файл", loc: "Місцезнаходження", poll: "Опитування" },
};

module.exports = { ensureSchema, unreadCountsForFamily, roster, saveKey, saveBackup, saveSettings, overview, list, send, markRead, remove, upload, download, saveRetention, cleanup,
    saveGroup, leaveGroup, setRoomMark, getPicture, savePicture, saveMode, dissolveGroup, preview };

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
    if (!findCol(FILES)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: FILES,
                fields: [
                    { name: "datei", type: "file", maxSelect: 1, maxSize: MAX_FILE, protected: true },
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "raum", type: "text", max: 100 },
                    { name: "von", type: "text", max: 40 },
                    { name: "zeit", type: "number" },
                    { name: "groesse", type: "number" },
                    { name: "nachricht", type: "text", max: 40 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE INDEX `idx_chat_dateien_familie` ON `" + FILES + "` (`familie`, `zeit`)",
                    "CREATE INDEX `idx_chat_dateien_nachricht` ON `" + FILES + "` (`nachricht`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + FILES + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + FILES + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(FAM)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: FAM,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "text_tage", type: "number" },
                    { name: "medien_tage", type: "number" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: ["CREATE UNIQUE INDEX `idx_chat_familie_familie` ON `" + FAM + "` (`familie`)"],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + FAM + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + FAM + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(GROUPS)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: GROUPS,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "name", type: "text", max: 120, required: true },
                    { name: "mitglieder", type: "text", max: 3000 },
                    { name: "ersteller", type: "text", max: 40 },
                    { name: "zeit", type: "number" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: ["CREATE INDEX `idx_chat_gruppen_familie` ON `" + GROUPS + "` (`familie`)"],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + GROUPS + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + GROUPS + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(MARKS)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: MARKS,
                fields: [
                    { name: "benutzer", type: "text", max: 40, required: true },
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "daten", type: "text", max: 20000 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: ["CREATE UNIQUE INDEX `idx_chat_markierungen_benutzer` ON `" + MARKS + "` (`benutzer`)"],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + MARKS + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + MARKS + "\" nicht anlegen: " + err.message);
        }
    }
    if (!findCol(PICS)) {
        try {
            $app.save(new Collection({
                type: "base",
                name: PICS,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "raum", type: "text", max: 100, required: true },
                    { name: "bild", type: "text", max: MAX_PIC + 100 },
                    { name: "zeit", type: "number" },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: ["CREATE UNIQUE INDEX `idx_chat_bilder_raum` ON `" + PICS + "` (`familie`, `raum`)"],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Chat] Sammlung \"" + PICS + "\" angelegt.");
        } catch (err) {
            console.log("[Chat] Konnte Sammlung \"" + PICS + "\" nicht anlegen: " + err.message);
        }
    }
    // 1.127.4: fields that older installations do not have yet
    addFields(MSGS, [{ name: "leise", type: "bool" }, { name: "vtoken", type: "text", max: 40 }, { name: "dart", type: "text", max: 4 }]);
    addFields(FAM, [{ name: "klartext", type: "bool" }]);
    addFields(FILES, [{ name: "art", type: "text", max: 4 }]);
    return !!(findCol(KEYS) && findCol(MSGS) && findCol(FILES) && findCol(FAM) && findCol(GROUPS) && findCol(MARKS) && findCol(PICS));
}
function makeField(def) {
    try { if (def.type === "bool" && typeof BoolField === "function") return new BoolField({ name: def.name }); } catch (e) { /* use the fallback */ }
    try { if (def.type === "text" && typeof TextField === "function") return new TextField({ name: def.name, max: def.max }); } catch (e) { /* use the fallback */ }
    return new Collection({ type: "base", name: "pinn_tmp_chat_feld", fields: [def] }).fields.getByName(def.name);
}
// Adds fields to a collection that already exists (cheap when everything is there: this runs with every request)
function addFields(name, defs) {
    const col = findCol(name);
    if (!col) return;
    let changed = false;
    defs.forEach(def => {
        let has = false;
        try { has = !!col.fields.getByName(def.name); } catch (e) { has = false; }
        if (has) return;
        try { col.fields.add(makeField(def)); changed = true; } catch (err) { console.log("[Chat] Feld \"" + def.name + "\" nicht anlegbar: " + err.message); }
    });
    if (changed) {
        try { $app.save(col); console.log("[Chat] Felder in \"" + name + "\" ergänzt."); } catch (err) { console.log("[Chat] Felder in \"" + name + "\" nicht gespeichert: " + err.message); }
    }
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
// ---- groups (1.127.3)
function groupRec(id) {
    try { return $app.findRecordById(GROUPS, String(id)); } catch (err) { return null; }
}
function groupIds(rec) {
    try { const a = JSON.parse(rec.getString("mitglieder") || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; } catch (err) { return []; }
}
function groupOut(rec) {
    return { id: rec.id, raum: "gr:" + rec.id, name: rec.getString("name"), mitglieder: groupIds(rec), ersteller: rec.getString("ersteller"), zeit: Number(rec.get("zeit") || 0) };
}
// The groups this profile is a member of
function groupsOf(u) {
    let recs = [];
    try { recs = $app.findRecordsByFilter(GROUPS, "familie = {:f}", "-zeit", 0, 0, { f: u.getString("familie") }); } catch (err) { recs = []; }
    return recs.filter(r => groupIds(r).indexOf(u.id) >= 0);
}
// Members of a room (user records) or an error when this profile may not use the room
function roomMembers(u, room) {
    const fam = u.getString("familie");
    const all = familyUsers(fam);
    if (room === "familie") return all;
    const g = GR_RE.exec(String(room || ""));
    if (g) {
        const rec = groupRec(g[1]);
        if (!rec || rec.getString("familie") !== fam || groupIds(rec).indexOf(u.id) < 0) throw new Error("Unbekannter Chat.");
        const ids = groupIds(rec);
        const members = all.filter(x => ids.indexOf(x.id) >= 0);
        if (!members.length) throw new Error("Unbekannter Chat.");
        return members;
    }
    const m = DM_RE.exec(String(room || ""));
    if (!m || m[1] >= m[2] || (m[1] !== u.id && m[2] !== u.id)) throw new Error("Unbekannter Chat.");
    const members = all.filter(x => x.id === m[1] || x.id === m[2]);
    if (members.length !== 2) throw new Error("Unbekannter Chat.");
    return members;
}
// cache: optional object, so that a loop over many messages looks up each group only once
function canSeeRoom(u, room, cache) {
    room = String(room || "");
    if (room === "familie") return true;
    const m = DM_RE.exec(room);
    if (m) return m[1] === u.id || m[2] === u.id;
    const g = GR_RE.exec(room);
    if (!g) return false;
    const c = cache || {};
    if (!(room in c)) {
        const rec = groupRec(g[1]);
        c[room] = !!rec && rec.getString("familie") === u.getString("familie") && groupIds(rec).indexOf(u.id) >= 0;
    }
    return c[room];
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
        empf: rec.getString("empf"), gelesen: shown, geloescht: deleted, leise: rec.getBool("leise"),
        dart: deleted ? rec.getString("dart") : "",
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
    const keep = retentionOf(fam);
    return { ich: u.id, profile: profiles, mein: mine, jetzt: Date.now(), aufbewahrung: keep, speicher: storageOf(fam), admin: u.getString("rolle") === "admin",
        gruppen: groupsOf(u).map(groupOut), bilder: pictureVersions(u), klartext: isPlain(fam) };
}
// true = this family chose to run the chat without end-to-end encryption (push messages with text / picture preview)
function isPlain(familyId) {
    const r = famRec(familyId);
    return !!r && r.getBool("klartext");
}
// Only admins of the family switch the mode; it only applies to new messages
function saveMode(e, body) {
    const u = authUser(e);
    if (u.getString("rolle") !== "admin") throw new Error("Nur für Admins.");
    if (!body || typeof body.klartext !== "boolean") throw new Error("Wert ungültig.");
    let rec = famRec(u.getString("familie"));
    if (!rec) { rec = new Record($app.findCollectionByNameOrId(FAM)); rec.set("familie", u.getString("familie")); }
    rec.set("klartext", body.klartext);
    $app.save(rec);
    return { ok: true, klartext: body.klartext };
}
function famRec(familyId) {
    try { return $app.findFirstRecordByFilter(FAM, "familie = {:f}", { f: familyId }); } catch (err) { return null; }
}
function retentionOf(familyId) {
    const r = famRec(familyId);
    return { text: r ? Number(r.get("text_tage") || 0) : 0, medien: r ? Number(r.get("medien_tage") || 0) : 0 };
}
// Space used by the photos and videos of a family (bytes of the encrypted files)
function storageOf(familyId) {
    let sum = 0;
    try { $app.findRecordsByFilter(FILES, "familie = {:f}", "", 20000, 0, { f: familyId }).forEach(r => { sum += Number(r.get("groesse") || 0); }); } catch (err) { /* none */ }
    return sum;
}
// Only admins of the family set the automatic deletion
function saveRetention(e, body) {
    const u = authUser(e);
    if (u.getString("rolle") !== "admin") throw new Error("Nur für Admins.");
    const text = Number(body && body.text), medien = Number(body && body.medien);
    if (KEEP_CHOICES.indexOf(text) < 0 || KEEP_CHOICES.indexOf(medien) < 0) throw new Error("Wert ungültig.");
    let rec = famRec(u.getString("familie"));
    if (!rec) { rec = new Record($app.findCollectionByNameOrId(FAM)); rec.set("familie", u.getString("familie")); }
    rec.set("text_tage", text);
    rec.set("medien_tage", medien);
    $app.save(rec);
    return { ok: true, aufbewahrung: { text, medien } };
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
    const seen = {};
    recs.forEach(r => {
        const room = r.getString("raum");
        if (!canSeeRoom(u, room, seen)) return;
        if (!hasId(r.getString("empf"), u.id) && r.getString("von") !== u.id) return;
        if (r.getBool("leise")) return; // poll votes: never the latest message, never unread
        const o = rooms[room] || (rooms[room] = { raum: room, letzte: null, ungelesen: 0 });
        if (!o.letzte) o.letzte = msgOut(r, u.id, receipts);
        const mine = r.getString("von") === u.id;
        if (!mine && !r.getBool("geloescht") && hasId(r.getString("empf"), u.id) && !parseObj(r.getString("gelesen"))[u.id]) o.ungelesen++;
    });
    const list = Object.keys(rooms).map(k => rooms[k]);
    return { raeume: list, gesamt: list.reduce((n, x) => n + x.ungelesen, 0), jetzt: Date.now(), markierungen: marksOf(u) };
}
// Unread chats per profile of ONE family for the dashboard profile selection (since 1.144.0): { <profile ID>: number }.
// Same rule as the number behind "Chat" in the menu of the app (js/chat.js → chatUpdateBadge): unread messages of all
// chats that are not muted, plus chats marked as unread by hand that have no unread message. Only counts - nothing is
// decrypted, the server never sees the text anyway. One pass over the messages, one look-up of groups and marks.
function unreadCountsForFamily(familyId, userIds) {
    const fam = String(familyId || "");
    const out = {};
    const ids = (Array.isArray(userIds) ? userIds : []).map(String).filter(Boolean);
    ids.forEach(id => { out[id] = 0; });
    if (!fam || !ids.length) return out;
    const now = Date.now();
    const groups = {};
    try {
        $app.findRecordsByFilter(GROUPS, "familie = {:f}", "", 0, 0, { f: fam }).forEach(g => { groups["gr:" + g.id] = groupIds(g); });
    } catch (err) { /* no groups yet */ }
    const sees = (id, room) => {
        if (room === "familie") return true;
        const m = DM_RE.exec(room);
        if (m) return m[1] === id || m[2] === id;
        return !!groups[room] && groups[room].indexOf(id) >= 0;
    };
    const perRoom = {}; // { <profile ID>: { <room>: unread messages } }
    ids.forEach(id => { perRoom[id] = {}; });
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(MSGS, "familie = {:f} && zeit > {:z}", "-zeit", 1500, 0, { f: fam, z: now - UNREAD_WINDOW_MS });
    } catch (err) { recs = []; }
    recs.forEach(r => {
        if (r.getBool("leise") || r.getBool("geloescht")) return;
        const room = r.getString("raum");
        const from = r.getString("von");
        const to = r.getString("empf");
        let read = null;
        ids.forEach(id => {
            if (id === from || !hasId(to, id) || !sees(id, room)) return;
            if (read === null) read = parseObj(r.getString("gelesen"));
            if (read[id]) return;
            perRoom[id][room] = (perRoom[id][room] || 0) + 1;
        });
    });
    ids.forEach(id => {
        const rec = marksRec(id);
        const marks = rec ? parseObj(rec.getString("daten")) : {};
        const muted = room => {
            const v = marks[room] && marks[room].m ? Number(marks[room].m) : 0;
            return v === 1 || v > now;
        };
        let n = 0;
        Object.keys(perRoom[id]).forEach(room => { if (!muted(room)) n += perRoom[id][room]; });
        Object.keys(marks).forEach(room => {
            if (marks[room] && marks[room].u && !muted(room) && !perRoom[id][room] && sees(id, room)) n++;
        });
        out[id] = n;
    });
    return out;
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
    const map = { de: ["DE", "AT", "CH", "LI", "LU"], fr: ["FR", "BE", "MC"], es: ["ES", "MX", "AR", "CO", "CL", "PE"], it: ["IT", "SM", "VA"], pt: ["BR", "PT", "AO", "MZ"], zh: ["CN"], ja: ["JP"], ko: ["KR"], ru: ["RU"], nl: ["NL", "SR", "AW", "CW", "SX"], tr: ["TR"], pl: ["PL"], uk: ["UA"] };
    const hit = Object.keys(map).find(k => map[k].indexOf(land) >= 0);
    return hit || "en";
}
// Text for a push message of a message that is readable on the server (plain mode only)
function plainPushText(p, t) {
    const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
    const cap = clip(p && p.x, 140);
    if (!p || typeof p !== "object") return "";
    if (p.p && typeof p.p === "object") return "📊 " + t.poll + (p.p.q ? ": " + clip(p.p.q, 100) : "");
    if (p.l && typeof p.l === "object") return "📍 " + t.loc + (p.l.n ? ": " + clip(p.l.n, 80) : "");
    if (p.m && typeof p.m === "object") {
        const k = p.m.k;
        if (k === "aud") return "🎤 " + t.voice;
        if (k === "pdf") return "📄 " + (clip(p.m.n, 60) || t.file) + (cap ? " – " + cap : "");
        if (k === "vid") return "🎥 " + (cap || t.video);
        return "📷 " + (cap || t.photo);
    }
    if (cap) return cap;
    if (p.r && typeof p.r === "object") return clip(p.r.ti, 100);
    return "";
}
function isMuted(userId, room, now) {
    const rec = marksRec(userId);
    if (!rec) return false;
    const o = parseObj(rec.getString("daten"))[room];
    return !!(o && o.m && (Number(o.m) === 1 || Number(o.m) > now));
}
// Push: end-to-end encrypted chat = only "someone wrote" (the server cannot read the text). Plain mode = the text (info.plain)
// and for photos/videos a link to the preview picture (info.preview = { id, token }).
function notify(familyId, sender, room, recipients, info) {
    let push = null;
    try { push = require(`${__hooks}/pinn-push.js`); } catch (err) { return 0; }
    info = info || {};
    const name = senderName(familyId, sender);
    let title = "💬 " + name;
    if (room.indexOf("gr:") === 0) {
        const g = GR_RE.exec(room);
        const rec = g ? groupRec(g[1]) : null;
        if (rec && info.plain) title += " · " + rec.getString("name").slice(0, 40);
    }
    const now = Date.now();
    let sent = 0;
    recipients.forEach(r => {
        try {
            if (push.readSettings(r).chat === false) return;
            if (isMuted(r.id, room, now)) return;
            const t = PUSH_TEXT[langOf(r)] || PUSH_TEXT.en;
            let text = (room === "familie" || room.indexOf("gr:") === 0) ? t.group : t.dm;
            const msg = { titel: title, text: text, url: "/?chat=" + encodeURIComponent(room), tag: "chat-" + room, urgency: "high", hinweis: false };
            if (info.plain) {
                const own = plainPushText(info.plain, t);
                if (own) { msg.text = own; msg.roh = true; }
                if (info.preview) msg.bild = "/api/pinn/chat/vorschau?m=" + encodeURIComponent(info.preview.msgId) + "&t=" + encodeURIComponent(info.preview.token);
            }
            sent += push.notifyUser(r.id, msg) || 0;
        } catch (err) { /* next recipient */ }
    });
    return sent;
}
function randomToken() {
    try { if (typeof $security !== "undefined" && $security.randomString) return $security.randomString(24); } catch (err) { /* fall back */ }
    let t = "";
    for (let i = 0; i < 24; i++) t += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    return t;
}
// An uploaded file of this profile for this room that is not attached to a message yet (art: "" = the encrypted file, "v" = preview picture)
function freeFile(u, room, id, art) {
    let rec = null;
    try { rec = $app.findRecordById(FILES, id); } catch (err) { rec = null; }
    if (!rec || rec.getString("von") !== u.id || rec.getString("raum") !== room || rec.getString("nachricht") || rec.getString("art") !== art) throw new Error("Datei ungültig.");
    return rec;
}
function send(e, body) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const room = String((body && body.raum) || "");
    const members = roomMembers(u, room);
    const daten = String((body && body.daten) || "");
    if (!daten || daten.length > MAX_DATA) throw new Error("Nachricht ungültig.");
    let pack = null;
    try { pack = JSON.parse(daten); } catch (err) { pack = null; }
    const plain = !!pack && pack.v === 2;
    let empf = [];
    if (plain) {
        // readable mode: only allowed when the family switched it on; everybody of the room receives it
        if (!isPlain(fam)) throw new Error("Nachricht ungültig.");
        if (pack.s !== u.id || !pack.p || typeof pack.p !== "object" || Array.isArray(pack.p)) throw new Error("Nachricht ungültig.");
        empf = members.map(m => m.id).slice(0, MAX_RECIPIENTS);
        if (empf.indexOf(u.id) < 0) throw new Error("Nachricht ungültig.");
    } else {
        if (!pack || pack.v !== 1 || pack.s !== u.id || typeof pack.ct !== "string" || typeof pack.iv !== "string" || typeof pack.salt !== "string" || typeof pack.sp !== "string" || !pack.w || typeof pack.w !== "object") throw new Error("Nachricht ungültig.");
        const ids = members.map(m => m.id);
        empf = Object.keys(pack.w).filter(id => ids.indexOf(id) >= 0).slice(0, MAX_RECIPIENTS);
        if (empf.indexOf(u.id) < 0) throw new Error("Nachricht ungültig.");
        const mine = keyRec(u.id);
        if (!mine || mine.getString("oeffentlich") !== pack.sp) throw new Error("Der Chat-Schlüssel ist nicht aktuell.");
    }
    // optional photo/video/voice/PDF: an uploaded file of this profile for this room that is not attached yet
    let fileRec = null;
    const fileId = String((body && body.datei) || "");
    if (fileId) fileRec = freeFile(u, room, fileId, "");
    // optional preview picture for the push message (plain mode only)
    let previewRec = null;
    const previewId = String((body && body.vorschau) || "");
    if (previewId && plain) previewRec = freeFile(u, room, previewId, "v");
    const quiet = !!(body && body.leise === true);
    const now = Date.now();
    const rec = new Record($app.findCollectionByNameOrId(MSGS));
    rec.set("familie", fam);
    rec.set("raum", room);
    rec.set("von", u.id);
    rec.set("zeit", now);
    rec.set("aktualisiert", now);
    rec.set("daten", daten);
    rec.set("empf", "," + empf.join(",") + ",");
    rec.set("gelesen", "{}");
    if (quiet) rec.set("leise", true);
    let token = "";
    if (previewRec) { token = randomToken(); rec.set("vtoken", token); }
    $app.save(rec);
    if (fileRec) { fileRec.set("nachricht", rec.id); $app.save(fileRec); }
    if (previewRec) { previewRec.set("nachricht", rec.id); $app.save(previewRec); }
    let pushed = 0;
    if (!quiet) {
        try {
            pushed = notify(fam, u, room, members.filter(m => m.id !== u.id && empf.indexOf(m.id) >= 0),
                plain ? { plain: pack.p, preview: previewRec ? { msgId: rec.id, token } : null } : null);
        } catch (err) { console.log("[Chat] Push: " + err.message); }
    }
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
    // kind of the deleted message, told by the sender (the server cannot read it): "p" = poll, so the chat can say
    // "the poll was deleted" instead of "this message was deleted"
    if (String((body && body.art) || "") === "p") rec.set("dart", "p");
    rec.set("aktualisiert", Date.now());
    $app.save(rec);
    dropFiles(rec.id);
    return { ok: true };
}
function dropFiles(messageId) {
    try { $app.findRecordsByFilter(FILES, "nachricht = {:m}", "", 20, 0, { m: messageId }).forEach(f => { try { $app.delete(f); } catch (err) { /* next */ } }); } catch (err) { /* none */ }
}

// ---------------------------------------------------------------------------------------------
// Photos and videos (encrypted in the app; the server only stores and hands out the encrypted bytes)
// ---------------------------------------------------------------------------------------------
function upload(e) {
    const u = authUser(e);
    const query = e.request.url.query();
    const room = String(query.get("raum") || "");
    roomMembers(u, room);
    // art=v: small preview picture of a photo/video for the push message (plain mode only, stored readable)
    const art = String(query.get("art") || "") === "v" ? "v" : "";
    if (art && !isPlain(u.getString("familie"))) throw new Error("Nicht erlaubt.");
    const files = e.findUploadedFiles("datei");
    if (!files || !files.length) throw new Error("Keine Datei.");
    const f = files[0];
    if (Number(f.size) > (art ? MAX_PREVIEW : MAX_FILE)) throw new Error("Datei zu groß.");
    const rec = new Record($app.findCollectionByNameOrId(FILES));
    if (art) rec.set("art", "v");
    rec.set("familie", u.getString("familie"));
    rec.set("raum", room);
    rec.set("von", u.id);
    rec.set("zeit", Date.now());
    rec.set("groesse", Number(f.size) || 0);
    rec.set("datei", f);
    $app.save(rec);
    return { id: rec.id };
}
// Hands out one encrypted file to somebody who may see the room
function download(e) {
    const u = authUser(e);
    let rec = null;
    try { rec = $app.findRecordById(FILES, String(e.request.url.query().get("id") || "")); } catch (err) { rec = null; }
    if (!rec || rec.getString("familie") !== u.getString("familie") || !canSeeRoom(u, rec.getString("raum")) || !rec.getString("datei")) throw new Error("Nicht gefunden.");
    const fsys = $app.newFilesystem();
    try {
        fsys.serve(e.response, e.request, rec.baseFilesPath() + "/" + rec.getString("datei"), "chat.bin");
    } finally {
        try { fsys.close(); } catch (err) { /* ignore */ }
    }
    return true;
}

// The preview picture of a photo/video push message: no login (the notification fetches it), the random token of the message is the key
function preview(e) {
    const q = e.request.url.query();
    let msg = null;
    try { msg = $app.findRecordById(MSGS, String(q.get("m") || "")); } catch (err) { msg = null; }
    const token = String(q.get("t") || "");
    if (!msg || !token || msg.getString("vtoken") !== token || msg.getBool("geloescht")) throw new Error("Nicht gefunden.");
    let rec = null;
    try { rec = $app.findFirstRecordByFilter(FILES, "nachricht = {:m} && art = 'v'", { m: msg.id }); } catch (err) { rec = null; }
    if (!rec || !rec.getString("datei")) throw new Error("Nicht gefunden.");
    e.response.header().set("Cache-Control", "private, max-age=3600");
    const fsys = $app.newFilesystem();
    try {
        fsys.serve(e.response, e.request, rec.baseFilesPath() + "/" + rec.getString("datei"), "vorschau.jpg");
    } finally {
        try { fsys.close(); } catch (err) { /* ignore */ }
    }
    return true;
}

// ---------------------------------------------------------------------------------------------
// Groups, pinned / unread-marked chats, chat pictures (1.127.3)
// ---------------------------------------------------------------------------------------------
function isAdmin(u) { return u.getString("rolle") === "admin"; }
// Make a group (id empty) or change name / members of one. Everybody chosen is a member right away.
// Changing: the creator and admins of the family; the person changing always stays in (others use "leave").
function saveGroup(e, body) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const name = String((body && body.name) || "").replace(/\s+/g, " ").trim().slice(0, MAX_GROUP_NAME);
    if (!name) throw new Error("Der Gruppenname fehlt.");
    const valid = {};
    familyUsers(fam).forEach(x => { valid[x.id] = true; });
    let ids = [];
    ((body && Array.isArray(body.mitglieder)) ? body.mitglieder : []).forEach(id => { if (typeof id === "string" && valid[id] && ids.indexOf(id) < 0) ids.push(id); });
    if (ids.indexOf(u.id) < 0) ids.unshift(u.id);
    if (ids.length < 2) throw new Error("Eine Gruppe braucht mindestens zwei Personen.");
    if (ids.length > MAX_RECIPIENTS) throw new Error("Zu viele Personen.");
    const id = String((body && body.id) || "");
    let rec = null;
    if (id) {
        rec = groupRec(id);
        if (!rec || rec.getString("familie") !== fam || groupIds(rec).indexOf(u.id) < 0) throw new Error("Unbekannter Chat.");
        if (rec.getString("ersteller") !== u.id && !isAdmin(u)) throw new Error("Nur der Ersteller oder ein Admin darf die Gruppe ändern.");
    } else {
        rec = new Record($app.findCollectionByNameOrId(GROUPS));
        rec.set("familie", fam);
        rec.set("ersteller", u.id);
        rec.set("zeit", Date.now());
    }
    rec.set("name", name);
    rec.set("mitglieder", JSON.stringify(ids));
    $app.save(rec);
    return { ok: true, gruppe: groupOut(rec) };
}
// Leave a group. The last person leaving deletes the group with its messages, files and picture.
function leaveGroup(e, body) {
    const u = authUser(e);
    const rec = groupRec(String((body && body.id) || ""));
    if (!rec || rec.getString("familie") !== u.getString("familie") || groupIds(rec).indexOf(u.id) < 0) throw new Error("Unbekannter Chat.");
    const rest = groupIds(rec).filter(x => x !== u.id);
    if (!rest.length) { dropGroup(rec); return { ok: true, geloescht: true }; }
    rec.set("mitglieder", JSON.stringify(rest));
    if (rec.getString("ersteller") === u.id) rec.set("ersteller", rest[0]);
    $app.save(rec);
    return { ok: true, geloescht: false };
}
// The creator or an admin of the family dissolves the group for everybody (messages, files and picture are deleted)
function dissolveGroup(e, body) {
    const u = authUser(e);
    const rec = groupRec(String((body && body.id) || ""));
    if (!rec || rec.getString("familie") !== u.getString("familie")) throw new Error("Unbekannter Chat.");
    if (rec.getString("ersteller") !== u.id && !isAdmin(u)) throw new Error("Nur der Ersteller oder ein Admin darf die Gruppe auflösen.");
    dropGroup(rec);
    return { ok: true };
}
function dropGroup(rec) {
    const fam = rec.getString("familie");
    const room = "gr:" + rec.id;
    for (let i = 0; i < 40; i++) {
        let msgs = [];
        try { msgs = $app.findRecordsByFilter(MSGS, "familie = {:f} && raum = {:r}", "zeit", 500, 0, { f: fam, r: room }); } catch (err) { msgs = []; }
        if (!msgs.length) break;
        msgs.forEach(m => { dropFiles(m.id); try { $app.delete(m); } catch (err) { /* next */ } });
    }
    const pic = picRec(fam, room);
    if (pic) { try { $app.delete(pic); } catch (err) { /* ignore */ } }
    try { $app.delete(rec); } catch (err) { /* ignore */ }
}
function marksRec(userId) {
    try { return $app.findFirstRecordByFilter(MARKS, "benutzer = {:u}", { u: String(userId) }); } catch (err) { return null; }
}
// { room: { p: 1 = pinned, u: 1 = marked as unread } } - only for rooms this profile can still see
function marksOf(u) {
    const rec = marksRec(u.id);
    const o = rec ? parseObj(rec.getString("daten")) : {};
    const out = {};
    const seen = {};
    const now = Date.now();
    Object.keys(o).forEach(room => {
        if (!canSeeRoom(u, room, seen)) return;
        const mute = o[room] && o[room].m ? Number(o[room].m) : 0; // 0 = not muted, 1 = for ever, else until that time
        out[room] = { p: o[room] && o[room].p ? 1 : 0, u: o[room] && o[room].u ? 1 : 0, m: (mute === 1 || mute > now) ? mute : 0 };
    });
    return out;
}
// Pin a chat / mark it as unread / mute it (or take the mark away): { raum, p?, u? } with true / false, m: 0 = sound on,
// 1 = muted for ever, a time in ms = muted until then
function setRoomMark(e, body) {
    const u = authUser(e);
    const room = String((body && body.raum) || "");
    if (!canSeeRoom(u, room)) throw new Error("Unbekannter Chat.");
    let rec = marksRec(u.id);
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(MARKS));
        rec.set("benutzer", u.id);
        rec.set("familie", u.getString("familie"));
    }
    const o = parseObj(rec.getString("daten"));
    const cur = o[room] || {};
    if (body && typeof body.p === "boolean") cur.p = body.p ? 1 : 0;
    if (body && typeof body.u === "boolean") cur.u = body.u ? 1 : 0;
    if (body && body.m !== undefined) {
        const m = Number(body.m);
        if (m === 0 || m === 1) cur.m = m;
        else if (isFinite(m) && m > Date.now() && m < Date.now() + MUTE_MAX_MS) cur.m = Math.round(m);
        else throw new Error("Wert ungültig.");
    }
    if (!cur.p && !cur.u && !cur.m) delete o[room]; else o[room] = { p: cur.p ? 1 : 0, u: cur.u ? 1 : 0, m: cur.m ? cur.m : 0 };
    if (Object.keys(o).length > MAX_MARKS) throw new Error("Zu viele Markierungen.");
    rec.set("daten", JSON.stringify(o));
    $app.save(rec);
    return { ok: true, markierungen: marksOf(u) };
}
function picRec(familyId, room) {
    try { return $app.findFirstRecordByFilter(PICS, "familie = {:f} && raum = {:r}", { f: familyId, r: String(room) }); } catch (err) { return null; }
}
// Version (time of the last change) of every picture this profile can see: the app only loads a picture again when it changed
function pictureVersions(u) {
    const out = {};
    const seen = {};
    let recs = [];
    try { recs = $app.findRecordsByFilter(PICS, "familie = {:f}", "", 0, 0, { f: u.getString("familie") }); } catch (err) { recs = []; }
    recs.forEach(r => { const room = r.getString("raum"); if (canSeeRoom(u, room, seen)) out[room] = Number(r.get("zeit") || 0); });
    return out;
}
function getPicture(e, query) {
    const u = authUser(e);
    const room = String((query && query.raum) || "");
    if (!canSeeRoom(u, room)) throw new Error("Unbekannter Chat.");
    const rec = picRec(u.getString("familie"), room);
    return { bild: rec ? rec.getString("bild") : "", zeit: rec ? Number(rec.get("zeit") || 0) : 0 };
}
// Picture of the family chat: only admins of the family. Picture of a group: its creator and admins. bild = null removes it.
function savePicture(e, body) {
    const u = authUser(e);
    const fam = u.getString("familie");
    const room = String((body && body.raum) || "");
    if (room === "familie") {
        if (!isAdmin(u)) throw new Error("Nur für Admins.");
    } else {
        const g = GR_RE.exec(room);
        const grp = g ? groupRec(g[1]) : null;
        if (!grp || grp.getString("familie") !== fam || groupIds(grp).indexOf(u.id) < 0) throw new Error("Unbekannter Chat.");
        if (grp.getString("ersteller") !== u.id && !isAdmin(u)) throw new Error("Nur der Ersteller oder ein Admin darf das Bild ändern.");
    }
    const bild = body ? body.bild : null;
    let rec = picRec(fam, room);
    if (bild === null || bild === undefined || bild === "") {
        if (rec) { try { $app.delete(rec); } catch (err) { /* ignore */ } }
        return { ok: true, zeit: 0 };
    }
    if (typeof bild !== "string" || bild.length > MAX_PIC || !/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(bild)) throw new Error("Bild ungültig.");
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(PICS));
        rec.set("familie", fam);
        rec.set("raum", room);
    }
    const now = Date.now();
    rec.set("bild", bild);
    rec.set("zeit", now);
    $app.save(rec);
    return { ok: true, zeit: now };
}

// Every night: delete what the families asked to be deleted, plus uploads that were never sent
function cleanup() {
    if (!ensureSchema()) return;
    const now = Date.now();
    let msgs = 0, files = 0;
    try {
        $app.findRecordsByFilter(FAM, "text_tage > 0 || medien_tage > 0", "", 500, 0, {}).forEach(f => {
            const fam = f.getString("familie");
            const textDays = Number(f.get("text_tage") || 0), mediaDays = Number(f.get("medien_tage") || 0);
            if (textDays > 0) {
                $app.findRecordsByFilter(MSGS, "familie = {:f} && zeit < {:z}", "zeit", 500, 0, { f: fam, z: now - textDays * 86400000 }).forEach(m => {
                    dropFiles(m.id);
                    try { $app.delete(m); msgs++; } catch (err) { /* next */ }
                });
            }
            if (mediaDays > 0) {
                $app.findRecordsByFilter(FILES, "familie = {:f} && zeit < {:z}", "zeit", 500, 0, { f: fam, z: now - mediaDays * 86400000 }).forEach(r => {
                    try { $app.delete(r); files++; } catch (err) { /* next */ }
                });
            }
        });
    } catch (err) { console.log("[Chat] Aufräumen: " + err.message); }
    try {
        $app.findRecordsByFilter(FILES, "nachricht = '' && zeit < {:z}", "zeit", 500, 0, { z: now - ORPHAN_MS }).forEach(r => { try { $app.delete(r); files++; } catch (err) { /* next */ } });
    } catch (err) { /* none */ }
    if (msgs || files) console.log("[Chat] Aufgeräumt: " + msgs + " Nachrichten, " + files + " Dateien.");
}
