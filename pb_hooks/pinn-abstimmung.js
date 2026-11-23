// pb_hooks/pinn-abstimmung.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Date polls in the calendar (since 1.163.0). The polls themselves live in the family data (key "eventPolls",
// area "abstimmung", see pinn-bereiche.js) and are synchronised between the devices like everything else.
// This file only sends the push messages. The app calls POST /api/pinn/abstimmung/push after saving; the server
// reads the saved poll itself (it never takes a text from the request), so nobody can send arbitrary messages:
//   kind "neu"        a new poll   -> everybody invited except the sender
//   kind "komplett"   everybody has answered -> the creator
//   kind "entschieden" the creator picked a date -> everybody invited except the sender
// Every message is sent once per poll (and winning date): markers in pb_data/pinn_abstimmung.json, kept 120 days.
// Texts are built in German here and translated per recipient by pinn-pushtext.js (tag "abstimmung-<ID>").

const STATUS_FILE = "/pb_data/pinn_abstimmung.json";
const KEEP_DAYS = 120;

function readStatus() {
    try {
        const o = JSON.parse(require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(STATUS_FILE)));
        if (o && typeof o === "object" && o.sent && typeof o.sent === "object") return o;
    } catch (e) { /* no file yet */ }
    return { sent: {} };
}
function writeStatus(s) {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    Object.keys(s.sent).forEach(k => { if (!(s.sent[k] > cutoff)) delete s.sent[k]; });
    try { $os.writeFile(STATUS_FILE, JSON.stringify(s), 420); } catch (e) { console.log("[Abstimmung] " + STATUS_FILE + " nicht speicherbar: " + e.message); }
}
function isIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function fmtDe(iso) { return isIso(iso) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }
function clean(v, n) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n); }

function memberName(data, id) {
    const list = Array.isArray(data.members) ? data.members : [];
    const m = list.find(x => x && x.id === id);
    return m ? clean((m.displayMode === "role" && m.role) ? m.role : m.name, 60) : "";
}
// Members invited to the poll (empty list = every member)
function inviteeIds(poll, data) {
    const all = (Array.isArray(data.members) ? data.members : []).filter(m => m && m.id).map(m => String(m.id));
    const ids = Array.isArray(poll.invitees) ? poll.invitees.map(String).filter(id => all.indexOf(id) >= 0) : [];
    return ids.length ? ids : all;
}
function winText(poll) {
    const o = (Array.isArray(poll.options) ? poll.options : []).find(x => x && x.id === poll.win);
    if (!o || !isIso(o.date)) return "";
    // "dd.mm.yyyy · hh:mm Uhr" - the pieces are translated one by one by pinn-pushtext.js
    return fmtDe(o.date) + (/^\d{2}:\d{2}$/.test(o.start || "") ? " · " + o.start + " Uhr" : "");
}

// body: { poll: ID, kind: "neu" | "komplett" | "entschieden" } -> { sent: n }
function send(familyId, senderRec, body) {
    const kind = String((body && body.kind) || "");
    const pollId = String((body && body.poll) || "");
    if (["neu", "komplett", "entschieden"].indexOf(kind) < 0 || !pollId) return { sent: 0, skipped: "ungültig" };
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const data = lib.loadFamilyDataFor(familyId) || {};
    const poll = (Array.isArray(data.eventPolls) ? data.eventPolls : []).find(p => p && p.id === pollId);
    if (!poll) return { sent: 0, skipped: "unbekannt" };
    const senderId = senderRec.id;
    const isOwner = poll.by === senderId || senderRec.getString("rolle") === "admin";
    if ((kind === "neu" || kind === "entschieden") && !isOwner) return { sent: 0, skipped: "nicht erlaubt" };
    if (kind === "entschieden" && (poll.status !== "decided" || !winText(poll))) return { sent: 0, skipped: "nicht entschieden" };
    if (kind === "komplett" && poll.status !== "open") return { sent: 0, skipped: "nicht offen" };

    const status = readStatus();
    const key = [familyId, pollId, kind, kind === "entschieden" ? poll.win : ""].join("|");
    if (status.sent[key]) return { sent: 0, skipped: "schon gesendet" };

    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    const invited = inviteeIds(poll, data);
    let targets;
    if (kind === "komplett") targets = users.filter(u => u.id === poll.by);
    else targets = users.filter(u => invited.indexOf(u.getString("mitglied")) >= 0);
    targets = targets.filter(u => u.id !== senderId && u.getString("rolle") !== "gast" && u.getString("rolle") !== "hauptadmin");

    const title = clean(poll.title, 100) || "Termin";
    let titel, text;
    if (kind === "neu") {
        const by = memberName(data, poll.byMember) || "Jemand";
        titel = "📊 Terminabstimmung: " + title;
        text = by + " hat eine Terminabstimmung gestartet – bitte antworte.";
    } else if (kind === "komplett") {
        titel = "✅ Alle haben geantwortet: " + title;
        text = "Du kannst jetzt den Termin festlegen.";
    } else {
        titel = "📅 Termin steht: " + title;
        text = winText(poll) + (clean(poll.place, 80) ? " · " + clean(poll.place, 80) : "");
    }
    const push = require(`${__hooks}/pinn-push.js`);
    let sent = 0;
    targets.forEach(u => {
        try {
            sent += push.notifyUser(u.id, { titel: titel, text: text, url: "/?abstimmung=" + encodeURIComponent(pollId), tag: "abstimmung-" + pollId, urgency: "normal" }) || 0;
        } catch (e) { console.log("[Abstimmung] Push fehlgeschlagen: " + e.message); }
    });
    status.sent[key] = Date.now();
    writeStatus(status);
    return { sent: sent };
}

module.exports = { send };
