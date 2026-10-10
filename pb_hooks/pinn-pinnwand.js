// pb_hooks/pinn-pinnwand.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden
// (Einrichtung und Zeitplan in pinnwand.pb.js, Aufruf nach dem Speichern in save_family_data.pb.js).
//
// Pinnwand der Familie
//  - Die Zettel selbst liegen klein im Familien-Datensatz (Schlüssel "pinboard") und werden wie alles
//    andere zwischen den Geräten abgeglichen - offline anleg- und änderbar:
//      { id, type: 'note'|'list'|'photo'|'poll'|'kudos'|'countdown', title, text, color,
//        author (Mitglied), authorUser (Profil), authorName, createdAt, updatedAt,
//        to: [Mitglied, ...] (leer = ganze Familie), pinned, important, archived,
//        remindAt ('JJJJ-MM-TTTHH:MM'), remindAtMs, expires ('JJJJ-MM-TT'), date (Countdown),
//        items: [{ id, text, done, by, at }], options: [{ id, text }], votes: { <Wer>: <Option> },
//        closed, photo: { rec, file } | { pending }, reactions: { <Wer>: <Emoji> },
//        comments: [{ id, author, authorUser, authorName, text, at }], doneBy: { <Wer>: <ms> } }
//    <Wer> = Mitglieds-ID bzw. "u:<Profil-ID>" für Profile ohne Mitglied (z. B. Gäste).
//  - Fotos liegen als geschützte Dateien in der Sammlung "pinnwand_bilder" (nur die eigene Familie,
//    Abruf nur mit Anmeldung bzw. kurzlebigem Datei-Token).
//
// Push-Nachrichten (persönliche Einstellungen in pinn-push.js):
//  - pwAlle:       neuer Zettel für die ganze Familie
//  - pwMich:       Zettel an mich, Dankeschöns an mich und wichtige Zettel
//  - pwAntworten:  Antworten, Reaktionen und Stimmen zu meinen Zetteln (bzw. Zetteln, auf die ich
//                  geantwortet habe)
//  - pwErinnerung: Erinnerung eines Zettels zur eingestellten Zeit (an die Adressaten bzw. alle)
//
// Schonend für CPU und Speicher:
//  - Nach jedem Speichern der Familiendaten vergleicht afterSave() die gerade empfangenen Daten mit
//    einer kleinen Liste bereits bekannter Zettel/Antworten/Reaktionen (keine erneute Datenbankabfrage).
//    Neues wird nur vorgemerkt - verschickt wird ca. 20 Sekunden später vom minütlichen Zeitplan.
//    So kommt nichts, wenn ein Zettel gleich wieder gelöscht wird, und mehrere Reaktionen werden zu
//    einer Nachricht zusammengefasst. Das Speichern wartet nie auf den Push-Versand.
//  - Der minütliche Zeitplan liest nur diesen kleinen Stand aus dem Zwischenspeicher. Die (großen)
//    Familiendaten werden nur gelesen, wenn für diese Familie wirklich etwas zu verschicken ist.
//  - Einmal täglich (ab 3 Uhr) werden Fotos gelöscht, die zu keinem Zettel mehr gehören.
//  - Der Stand wird zusätzlich in pb_data gesichert (pinn_pinnwand.json), damit nach einem Neustart
//    nichts doppelt kommt.

const COL = "pinnwand_bilder";
const STATE_FILE = "/pb_data/pinn_pinnwand.json";
const STORE_KEY = "pinnPinnwandStand";
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000;
const SEND_DELAY_MS = 20000;          // Vormerkung -> Versand frühestens nach 20 Sekunden
const QUEUE_MAX_AGE = 6 * HOUR_MS;    // ältere Vormerkungen verwerfen (z. B. nach langem Ausfall)
const NEW_MAX_AGE = 3 * DAY_MS;       // nur Zettel/Antworten der letzten 3 Tage melden
const REMIND_LATE_MS = 30 * MIN_MS;   // Erinnerungen bis 30 Minuten nach der Zeit noch nachholen
const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Einrichtung: Sammlung "pinnwand_bilder"
// ---------------------------------------------------------------------------------------------
const READ_RULE = "@request.auth.id != '' && @request.auth.familie != '' && familie = @request.auth.familie";
const CREATE_RULE = "@request.auth.id != '' && @request.auth.familie != '' && @request.body.familie = @request.auth.familie";

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureSchema() {
    const fam = findCol("familien");
    const col = findCol(COL);
    if (!col) {
        if (!fam) {
            console.log("[Pinnwand] Sammlung \"familien\" fehlt noch - Fotos werden beim nächsten Start eingerichtet.");
            return;
        }
        try {
            $app.save(new Collection({
                type: "base",
                name: COL,
                fields: [
                    { name: "bild", type: "file", maxSelect: 1, maxSize: PHOTO_MAX_BYTES, mimeTypes: PHOTO_MIME, protected: true, thumbs: ["640x0"] },
                    { name: "erstellt_von", type: "text", max: 30 },
                    { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                listRule: READ_RULE,
                viewRule: READ_RULE,
                createRule: CREATE_RULE,
                updateRule: null,
                deleteRule: READ_RULE,
            }));
            console.log("[Pinnwand] Sammlung \"" + COL + "\" angelegt.");
        } catch (err) {
            console.log("[Pinnwand] Konnte Sammlung \"" + COL + "\" nicht anlegen: " + err.message);
        }
        return;
    }
    try {
        let changed = false;
        const want = { listRule: READ_RULE, viewRule: READ_RULE, createRule: CREATE_RULE, deleteRule: READ_RULE };
        Object.keys(want).forEach(k => { if (col[k] !== want[k]) { col[k] = want[k]; changed = true; } });
        if (changed) { $app.save(col); console.log("[Pinnwand] Regeln für \"" + COL + "\" gesetzt."); }
    } catch (err) {
        console.log("[Pinnwand] Regeln nicht setzbar: " + err.message);
    }
}

// ---------------------------------------------------------------------------------------------
// Kleiner Stand (Zwischenspeicher + pb_data)
// { families: { <Familie>: { seen: { key: 1 }, reminders: [{ note, at }], sent: { key: ms } } },
//   queue: { key: { familyId, typ, note, ..., dueAt, createdAt } }, cleanupDay: 'JJJJ-MM-TT' }
// ---------------------------------------------------------------------------------------------
function readText(path) {
    try {
        return require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(path));
    } catch (e) {
        return "";
    }
}
function emptyState() { return { families: {}, queue: {}, cleanupDay: "" }; }
function normState(o) {
    const s = (o && typeof o === "object") ? o : {};
    if (!s.families || typeof s.families !== "object") s.families = {};
    if (!s.queue || typeof s.queue !== "object" || Array.isArray(s.queue)) s.queue = {};
    if (typeof s.cleanupDay !== "string") s.cleanupDay = "";
    return s;
}
function readState() {
    try {
        const raw = $app.store().get(STORE_KEY);
        if (raw) return normState(JSON.parse(String(raw)));
    } catch (e) { /* aus der Datei */ }
    let s = emptyState();
    const txt = readText(STATE_FILE);
    if (txt) {
        try { s = normState(JSON.parse(txt)); } catch (e) { s = emptyState(); }
    }
    try { $app.store().set(STORE_KEY, JSON.stringify(s)); } catch (e) { /* egal */ }
    return s;
}
function writeState(s) {
    const txt = JSON.stringify(s);
    try { $app.store().set(STORE_KEY, txt); } catch (e) { /* egal */ }
    try { $os.writeFile(STATE_FILE, txt, 420); } catch (e) {
        console.log("[Pinnwand] Stand konnte nicht gesichert werden: " + e.message);
    }
}

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function str(v, max) { return String(v == null ? "" : v).slice(0, max || 200); }
function cleanId(v) { return String(v || "").replace(/[^A-Za-z0-9_:\-]/g, "").slice(0, 40); }
function todayBerlin() {
    // grobe, aber für "abgelaufen?" ausreichende Tagesgrenze in Mitteleuropa
    const d = new Date(Date.now() + berlinOffset(Date.now()));
    const p = n => (n < 10 ? "0" : "") + n;
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}
function lastSundayUtc(year, month) {
    const d = new Date(Date.UTC(year, month + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
}
function berlinOffset(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    const start = Date.UTC(y, 2, lastSundayUtc(y, 2), 1);
    const end = Date.UTC(y, 9, lastSundayUtc(y, 9), 1);
    return (utcMs >= start && utcMs < end) ? 2 * HOUR_MS : HOUR_MS;
}
function berlinHour() { return new Date(Date.now() + berlinOffset(Date.now())).getUTCHours(); }

function isArchived(n, today) {
    if (!n) return true;
    if (n.archived) return true;
    if (n.expires && /^\d{4}-\d{2}-\d{2}$/.test(n.expires) && n.expires < today) return true;
    if (n.type === "countdown" && n.date && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && n.date < today) return true;
    return false;
}
function snippet(text, max) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const m = max || 120;
    return t.length > m ? t.slice(0, m - 1) + "…" : t;
}
function dayDiff(fromIso, toIso) {
    const a = fromIso.split("-").map(Number), b = toIso.split("-").map(Number);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY_MS);
}
function joinNames(list) {
    const l = list.filter(Boolean);
    if (l.length <= 1) return l.join("");
    return l.slice(0, -1).join(", ") + " und " + l[l.length - 1];
}

// Name zu <Wer> (Mitglied oder "u:<Profil>")
function whoName(key, members, fallback) {
    const k = String(key || "");
    if (k.indexOf("u:") === 0) {
        try { return $app.findRecordById("benutzer", k.slice(2)).getString("username"); } catch (e) { return fallback || "Jemand"; }
    }
    const m = (members || []).find(x => x.id === k);
    return m ? (m.name || "Jemand") : (fallback || "Jemand");
}
// <Wer>-Schlüssel eines Empfängers
function personKeys(p) {
    const keys = ["u:" + p.userId];
    if (p.memberId) keys.push(p.memberId);
    return keys;
}
function isPerson(p, whoKey) {
    return !!whoKey && personKeys(p).indexOf(String(whoKey)) !== -1;
}
function isAuthor(p, n) {
    return (n.authorUser && n.authorUser === p.userId) || (n.author && p.memberId && n.author === p.memberId);
}
function isAddressed(p, n) {
    const to = Array.isArray(n.to) ? n.to : [];
    return to.some(k => isPerson(p, k));
}

// ---------------------------------------------------------------------------------------------
// Nach dem Speichern: Neues erkennen und vormerken
// ---------------------------------------------------------------------------------------------
function afterSave(familyId, data, actorUserId) {
    if (!familyId || !data || typeof data !== "object") return;
    const notes = Array.isArray(data.pinboard) ? data.pinboard : [];
    const state = readState();
    const first = !state.families[familyId];
    const fam = state.families[familyId] || { seen: {}, reminders: [], sent: {} };
    if (!fam.seen || typeof fam.seen !== "object") fam.seen = {};
    const now = Date.now();
    const today = todayBerlin();
    // Beim allerersten Mal (Umstellung) alles Vorhandene als bekannt übernehmen - nur ganz frisch
    // Angelegtes (letzte 2 Minuten) wird noch gemeldet.
    const recentLimit = first ? now - 2 * MIN_MS : now - NEW_MAX_AGE;
    const seenNow = {};
    const reminders = [];
    let queued = 0;

    const queue = (key, entry) => {
        const old = state.queue[key];
        entry.familyId = familyId;
        entry.dueAt = now + SEND_DELAY_MS;
        entry.createdAt = old ? old.createdAt : now;
        if (old && Array.isArray(old.who) && Array.isArray(entry.who)) {
            entry.who = old.who.concat(entry.who.filter(w => !old.who.some(o => o.k === w.k && o.e === w.e))).slice(0, 20);
        }
        state.queue[key] = entry;
        queued++;
    };

    notes.forEach(n => {
        if (!n || typeof n !== "object") return;
        const nid = cleanId(n.id);
        if (!nid) return;
        const archived = isArchived(n, today);
        const kN = "n|" + nid;
        seenNow[kN] = 1;
        if (!fam.seen[kN] && !archived && (Number(n.createdAt) || 0) > recentLimit) {
            queue(familyId + "|neu|" + nid, { typ: "neu", note: nid, actorUser: str(n.authorUser, 30), actor: str(n.author, 40) });
        }
        (Array.isArray(n.comments) ? n.comments : []).forEach(c => {
            const cid = cleanId(c && c.id);
            if (!cid) return;
            const kC = "c|" + nid + "|" + cid;
            seenNow[kC] = 1;
            if (!fam.seen[kC] && (Number(c.at) || 0) > recentLimit) {
                queue(familyId + "|antwort|" + nid + "|" + cid, { typ: "antwort", note: nid, comment: cid, actorUser: str(c.authorUser, 30), actor: str(c.author, 40) });
            }
        });
        const reactions = (n.reactions && typeof n.reactions === "object") ? n.reactions : {};
        Object.keys(reactions).forEach(k => {
            const emo = str(reactions[k], 8);
            if (!emo) return;
            const kR = "r|" + nid + "|" + cleanId(k) + "|" + emo;
            seenNow[kR] = 1;
            if (!fam.seen[kR] && !first) queue(familyId + "|reaktion|" + nid, { typ: "reaktion", note: nid, who: [{ k: cleanId(k), e: emo }] });
        });
        const votes = (n.votes && typeof n.votes === "object") ? n.votes : {};
        Object.keys(votes).forEach(k => {
            const kV = "v|" + nid + "|" + cleanId(k);
            seenNow[kV] = 1;
            if (!fam.seen[kV] && !first) queue(familyId + "|stimme|" + nid, { typ: "stimme", note: nid, who: [{ k: cleanId(k), e: "" }] });
        });
        const at = Number(n.remindAtMs) || 0;
        if (at && !archived && at > now - REMIND_LATE_MS && at < now + 400 * DAY_MS) reminders.push({ note: nid, at: at });
    });

    fam.seen = seenNow;
    fam.reminders = reminders.sort((a, b) => a.at - b.at).slice(0, 200);
    // gesendete Erinnerungen 7 Tage merken
    const sent = fam.sent && typeof fam.sent === "object" ? fam.sent : {};
    Object.keys(sent).forEach(k => { if (!(sent[k] > now - 7 * DAY_MS)) delete sent[k]; });
    fam.sent = sent;
    state.families[familyId] = fam;
    writeState(state);
    if (queued) console.log("[Pinnwand] " + queued + " Hinweis(e) vorgemerkt.");
}

// ---------------------------------------------------------------------------------------------
// Nachrichten bauen
// ---------------------------------------------------------------------------------------------
function noteHeadline(n) {
    if (n.type === "list") return str(n.title, 80) || "Liste";
    if (n.type === "poll") return str(n.title, 80) || "Umfrage";
    if (n.type === "countdown") return str(n.title, 80) || "Countdown";
    if (n.type === "photo") return snippet(n.text, 60) || "Foto";
    return snippet(n.title || n.text, 60) || "Zettel";
}

function newNoteMessage(n, members, today) {
    const author = whoName(n.author || (n.authorUser ? "u:" + n.authorUser : ""), members, n.authorName);
    const to = Array.isArray(n.to) ? n.to : [];
    const toNames = to.map(k => whoName(k, members, "")).filter(Boolean);
    const imp = n.important ? "❗ " : "";
    let titel = "", text = "";
    if (n.type === "kudos") {
        titel = "💛 " + author + " sagt Danke";
        text = (toNames.length ? joinNames(toNames) + ": " : "") + (snippet(n.text, 160) || "Einfach so. 💛");
    } else if (n.type === "list") {
        const items = (Array.isArray(n.items) ? n.items : []).filter(i => i && !i.done).map(i => str(i.text, 40));
        titel = imp + "✅ " + author + ": " + (str(n.title, 60) || "neue Liste");
        text = items.length ? snippet(items.slice(0, 4).join(", ") + (items.length > 4 ? " …" : ""), 160) : "Tippe zum Ansehen.";
    } else if (n.type === "photo") {
        titel = imp + "📷 " + author + " hat ein Foto angepinnt";
        text = snippet(n.text, 160) || "Tippe zum Ansehen.";
    } else if (n.type === "poll") {
        titel = imp + "📊 Umfrage von " + author;
        text = (snippet(n.title, 120) || "Neue Umfrage") + " – jetzt abstimmen";
    } else if (n.type === "countdown") {
        let when = "";
        if (n.date && /^\d{4}-\d{2}-\d{2}$/.test(n.date)) {
            const d = dayDiff(today, n.date);
            when = d <= 0 ? "Heute!" : d === 1 ? "Morgen!" : "Noch " + d + " Tage";
        }
        titel = imp + "⏳ " + (str(n.title, 60) || "Countdown");
        text = [when, snippet(n.text, 100)].filter(Boolean).join(" – ") || ("Neuer Countdown von " + author);
    } else {
        titel = imp + "📌 " + author + (n.important ? "" : " hat etwas angepinnt");
        text = snippet(n.title ? n.title + ": " + (n.text || "") : n.text, 180) || "Tippe zum Ansehen.";
    }
    if (toNames.length && n.type !== "kudos") titel += " (für " + joinNames(toNames) + ")";
    return { titel: titel, text: text };
}

// ---------------------------------------------------------------------------------------------
// Zeitplan (jede Minute): Vormerkungen und Erinnerungen verschicken
// ---------------------------------------------------------------------------------------------
function runCron() {
    const state = readState();
    const now = Date.now();
    const dueByFamily = {};
    let changed = false;

    Object.keys(state.queue).forEach(k => {
        const q = state.queue[k];
        if (!q || typeof q.dueAt !== "number" || q.dueAt < now - QUEUE_MAX_AGE) { delete state.queue[k]; changed = true; return; }
        if (q.dueAt <= now) {
            (dueByFamily[q.familyId] = dueByFamily[q.familyId] || { queue: [], reminders: [] }).queue.push({ key: k, entry: q });
        }
    });
    Object.keys(state.families).forEach(fid => {
        const fam = state.families[fid];
        (fam.reminders || []).forEach(r => {
            const sk = r.note + "|" + r.at;
            if (r.at <= now && r.at > now - REMIND_LATE_MS && !(fam.sent && fam.sent[sk])) {
                (dueByFamily[fid] = dueByFamily[fid] || { queue: [], reminders: [] }).reminders.push(r);
            }
        });
    });

    const fids = Object.keys(dueByFamily);
    if (!fids.length) {
        if (changed) writeState(state);
        dailyCleanup(state);
        return;
    }

    const processedKeys = [];
    const sentReminders = {};
    fids.forEach(fid => {
        const due = dueByFamily[fid];
        due.queue.forEach(x => processedKeys.push(x.key));
        try {
            sendForFamily(fid, due, sentReminders);
        } catch (err) {
            console.log("[Pinnwand] Versand fehlgeschlagen: " + err.message);
        }
    });

    // Neu einlesen (zwischendurch kann gespeichert worden sein) und nur das Erledigte austragen
    const fresh = readState();
    processedKeys.forEach(k => {
        const q = fresh.queue[k];
        if (q && q.dueAt <= now) delete fresh.queue[k];
    });
    Object.keys(sentReminders).forEach(fid => {
        const fam = fresh.families[fid];
        if (!fam) return;
        fam.sent = fam.sent || {};
        sentReminders[fid].forEach(sk => { fam.sent[sk] = now; });
    });
    Object.keys(fresh.queue).forEach(k => {
        const q = fresh.queue[k];
        if (!q || typeof q.dueAt !== "number" || q.dueAt < now - QUEUE_MAX_AGE) delete fresh.queue[k];
    });
    writeState(fresh);
    dailyCleanup(fresh);
}

function sendForFamily(familyId, due, sentReminders) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const push = require(`${__hooks}/pinn-push.js`);
    const data = lib.loadFamilyDataFor(familyId) || {};
    const members = Array.isArray(data.members) ? data.members : [];
    const notes = Array.isArray(data.pinboard) ? data.pinboard : [];
    const byId = {};
    notes.forEach(n => { if (n && n.id) byId[cleanId(n.id)] = n; });
    const today = todayBerlin();
    sentReminders[familyId] = sentReminders[familyId] || [];

    if (!push.engineSupportsPush()) {
        due.reminders.forEach(r => sentReminders[familyId].push(r.note + "|" + r.at));
        return;
    }
    const people = push.subscribedPeople(familyId, members);
    if (!people.length) {
        due.reminders.forEach(r => sentReminders[familyId].push(r.note + "|" + r.at));
        return;
    }
    const deliver = (p, n, msg, urgency) => {
        try {
            push.notifyUser(p.userId, {
                titel: msg.titel,
                text: msg.text,
                url: "/?pinnwand=" + encodeURIComponent(n.id),
                tag: msg.tag || ("pinnwand-" + cleanId(n.id)),
                urgency: urgency || "normal",
            });
        } catch (e) {
            console.log("[Pinnwand] Nachricht nicht zustellbar: " + e.message);
        }
    };

    due.queue.forEach(x => {
        const q = x.entry;
        const n = byId[q.note];
        if (!n || isArchived(n, today)) return; // inzwischen gelöscht oder abgenommen

        if (q.typ === "neu") {
            const msg = newNoteMessage(n, members, today);
            const forAll = !Array.isArray(n.to) || !n.to.length;
            people.forEach(p => {
                if ((q.actorUser && p.userId === q.actorUser) || (q.actor && p.memberId && p.memberId === q.actor)) return;
                const s = p.settings || {};
                const addressed = isAddressed(p, n);
                let ok = false;
                if (addressed || n.important) ok = s.pwMich !== false;
                if (!ok && forAll) ok = s.pwAlle !== false;
                if (!forAll && !addressed) ok = false; // Zettel an andere: nicht stören
                if (ok) deliver(p, n, msg, n.important ? "high" : "normal");
            });
        } else if (q.typ === "antwort") {
            const c = (Array.isArray(n.comments) ? n.comments : []).find(x2 => cleanId(x2 && x2.id) === q.comment);
            if (!c) return;
            const who = whoName(c.author || (c.authorUser ? "u:" + c.authorUser : ""), members, c.authorName);
            const msg = { titel: "💬 " + who + " hat geantwortet", text: "„" + noteHeadline(n) + "“ – " + (snippet(c.text, 150) || "…"), tag: "pinnwand-antwort-" + cleanId(n.id) };
            const others = (Array.isArray(n.comments) ? n.comments : []).filter(x2 => x2 && x2 !== c);
            people.forEach(p => {
                if ((c.authorUser && p.userId === c.authorUser) || (c.author && p.memberId && p.memberId === c.author)) return;
                const involved = isAuthor(p, n) || isAddressed(p, n) ||
                    others.some(o => (o.authorUser && o.authorUser === p.userId) || (o.author && p.memberId && o.author === p.memberId));
                if (!involved || (p.settings || {}).pwAntworten === false) return;
                deliver(p, n, msg);
            });
        } else if (q.typ === "reaktion" || q.typ === "stimme") {
            const who = (Array.isArray(q.who) ? q.who : []).filter(w => {
                if (q.typ === "reaktion") return n.reactions && n.reactions[w.k] === w.e;
                return n.votes && n.votes[w.k] !== undefined;
            });
            if (!who.length) return;
            people.forEach(p => {
                if (!isAuthor(p, n) || (p.settings || {}).pwAntworten === false) return;
                const list = who.filter(w => !isPerson(p, w.k));
                if (!list.length) return;
                const msg = q.typ === "reaktion"
                    ? { titel: list.map(w => w.e).filter((e, i, a) => a.indexOf(e) === i).join("") + " Reaktion auf deinen Zettel", text: joinNames(list.map(w => whoName(w.k, members, "") + " " + w.e)) + " – „" + noteHeadline(n) + "“", tag: "pinnwand-reaktion-" + cleanId(n.id) }
                    : { titel: "📊 Neue Stimmen", text: joinNames(list.map(w => whoName(w.k, members, ""))) + (list.length === 1 ? " hat" : " haben") + " abgestimmt – „" + noteHeadline(n) + "“", tag: "pinnwand-stimme-" + cleanId(n.id) };
                deliver(p, n, msg);
            });
        }
    });

    due.reminders.forEach(r => {
        sentReminders[familyId].push(r.note + "|" + r.at);
        const n = byId[r.note];
        if (!n || isArchived(n, today) || Number(n.remindAtMs) !== r.at) return; // geändert/gelöscht
        const forAll = !Array.isArray(n.to) || !n.to.length;
        const headline = n.type === "note" || !n.type ? snippet(n.title || n.text, 70) : noteHeadline(n);
        const msg = {
            titel: "⏰ " + (headline || "Erinnerung von der Pinnwand"),
            text: (n.type === "note" || !n.type) ? (snippet(n.title ? n.text : "", 150) || "Erinnerung von der Pinnwand") : (snippet(n.text, 150) || "Erinnerung von der Pinnwand"),
            tag: "pinnwand-erinnerung-" + cleanId(n.id),
        };
        people.forEach(p => {
            if ((p.settings || {}).pwErinnerung === false) return;
            if (!forAll && !isAddressed(p, n) && !isAuthor(p, n)) return;
            deliver(p, n, msg, "high");
        });
    });
}

// ---------------------------------------------------------------------------------------------
// Einmal täglich: Fotos ohne Zettel löschen (älter als 1 Tag, damit Offline-Uploads Zeit haben)
// ---------------------------------------------------------------------------------------------
function dailyCleanup(state) {
    const today = todayBerlin();
    if (state.cleanupDay === today || berlinHour() < 3) return;
    const fresh = readState();
    fresh.cleanupDay = today;
    writeState(fresh);
    if (!findCol(COL)) return;
    let recs = [];
    try {
        const cutoff = new Date(Date.now() - DAY_MS).toISOString().replace("T", " ");
        recs = $app.findRecordsByFilter(COL, "created < {:c}", "", 2000, 0, { c: cutoff });
    } catch (e) { return; }
    if (!recs.length) return;
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const refsByFamily = {};
    let removed = 0;
    recs.forEach(rec => {
        const fid = rec.getString("familie");
        if (!fid) return;
        if (!refsByFamily[fid]) {
            const refs = {};
            try {
                const data = lib.loadFamilyDataFor(fid) || {};
                (Array.isArray(data.pinboard) ? data.pinboard : []).forEach(n => { if (n && n.photo && n.photo.rec) refs[String(n.photo.rec)] = true; });
                refsByFamily[fid] = refs;
            } catch (e) { refsByFamily[fid] = null; }
        }
        const refs = refsByFamily[fid];
        if (!refs || refs[rec.id]) return;
        try { $app.delete(rec); removed++; } catch (e) { /* nächstes Mal */ }
    });
    if (removed) console.log("[Pinnwand] " + removed + " Foto(s) ohne Zettel gelöscht.");
}

module.exports = { ensureSchema, afterSave, runCron, COL };
