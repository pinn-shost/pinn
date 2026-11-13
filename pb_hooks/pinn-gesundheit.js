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

module.exports = { COL, ensureSchema, isChild, visibleMembers, list, save };
