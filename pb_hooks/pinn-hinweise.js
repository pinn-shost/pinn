// pb_hooks/pinn-hinweise.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require()
// (set-up, retrieval and documents hook in hinweise.pb.js; calls from save_family_data.pb.js,
// aufgaben.pb.js, create_calendar_event.pb.js, pinn-push.js, pinn-finanzen.js and pinn-kassen.js).
//
// Everything that appears under the 🔔 bell in the app (except ways home, open shopping amounts
// and version news, which the app knows itself):
//
//   1. Push messages (kind "push"): EVERY personal push message additionally ends up as a notice
//      for the recipient - even if no notification is arriving on their device right now. With a link to the
//      matching place (the same address as when tapping the notification). Identical messages
//      (same day/"tag") on the same day replace each other, reminders expire after their event.
//   2. Family news - what the others enter or change:
//      - Shopping:  new items, ticked-off/removed items, new/renamed/deleted shopping lists
//      - Lists:     packing list / checklist / idea list / wish list: new, renamed, deleted,
//                   new and ticked-off entries (gift lists and private lists NEVER - surprises
//                   stay secret; for wish lists only what the person puts on their own list themselves)
//      - Meals:     newly planned meals             - Recipes:  new recipes
//      - Tasks:     newly created and completed tasks
//      - Events:    newly entered events            - Pantry:   new pantry items
//      - Board:     new notes and replies           - Family:   new family members, emergency pass changed
//      - Finance:   new bookings (shopping with an amount, fuel & co. from "Vehicles", settlements) -
//                   ONLY to the members of the respective fund; who still owes whom something is calculated
//                   by the app when displaying, from the fund's bookings
//      - Contracts & vehicles: newly created (only members of the fund)
//      - Documents: newly filed (only whoever may see the document)
//
// Stored in the collection "hinweise" (access only via /api/pinn/hinweise, collection API locked):
//   art, ziel, typ, wer (profile ID), mitglied (member ID), name (user name as a fallback),
//   titel, text (push text), link (push address), an (",profile ID,profile ID," = only for these
//   profiles; empty = whole family), bis (ms - do not show after that; 0 = never), anzahl,
//   eintraege (JSON text: [{ id, t, d?, z?, k?, b?, f? }]), familie, created, updated
//   k = key against duplicates ("aufgabe:<ID>"): if someone already has a personal push message
//       in the bell for the same thing, the general family notice is dropped for them.
//
// Gentle on CPU and memory:
//   - The family data is not additionally read: only the old state is compared with the one just
//     received, which save_family_data.pb.js has in hand anyway (lookup via maps).
//   - Several changes by the same person at the same place within 20 minutes are merged into
//     ONE notice ("Anna put 5 items on Rewe").
//   - Notices older than 4 days are deleted when new notices of the family are created - no schedule.
//   - An error here never prevents the saving or the sending itself.

const COL = "hinweise";
const MIN_MS = 60000, HOUR_MS = 3600000, DAY_MS = 86400000;
const MERGE_MS = 20 * MIN_MS;     // merge within 20 minutes
const PUSH_MERGE_MS = 14 * HOUR_MS; // an identical push message (same tag) replaces the previous one
const KEEP_MS = 4 * DAY_MS;       // keep on the server
const SHOW_MS = 3 * DAY_MS;       // deliver to the app
const MAX_ENTRIES = 40;           // stored entries per notice
const ITEM_MAX_AGE = 3 * DAY_MS;  // do not report older items (e.g. after a long offline sync)
// The bell already shows these push messages in its own way (way-home card, add shopping amount)
const PUSH_SKIP_URL = /[?&](heimweg|hinweise)=/;
// Order in which the key against duplicates is formed from a push address
const DK_KEYS = ["aufgabe", "ausgabe", "dokument", "vertrag", "pinnwand", "rezept", "mitglied", "sos", "fahrzeug"];

const EXTRA_FIELDS = [
    { name: "text", type: "text", max: 2000 },
    { name: "link", type: "text", max: 400 },
    { name: "an", type: "text", max: 2000 },
    { name: "bis", type: "number", required: false },
];

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
    let col = findCol(COL);
    if (col) {
        // Add fields of later versions
        let changed = false;
        EXTRA_FIELDS.forEach(def => {
            if (hasField(col, def.name)) return;
            try { col.fields.add(makeField(def)); changed = true; }
            catch (err) { console.log("[Hinweise] Feld \"" + def.name + "\" nicht anlegbar: " + err.message); }
        });
        if (changed) {
            try { $app.save(col); console.log("[Hinweise] Neue Felder ergänzt (Push-Spiegel, Empfänger, Links)."); }
            catch (err) { console.log("[Hinweise] Felder nicht gespeichert: " + err.message); }
        }
        return;
    }
    const fam = findCol("familien");
    try {
        const fields = [
            { name: "art", type: "text", max: 30 },
            { name: "ziel", type: "text", max: 80 },
            { name: "typ", type: "text", max: 20 },
            { name: "wer", type: "text", max: 30 },
            { name: "mitglied", type: "text", max: 60 },
            { name: "name", type: "text", max: 80 },
            { name: "titel", type: "text", max: 200 },
            { name: "anzahl", type: "number", required: false },
            { name: "eintraege", type: "text", max: 12000 },
        ].concat(EXTRA_FIELDS).concat([
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ]);
        if (fam) fields.push({ name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: false });
        else fields.push({ name: "familie", type: "text", max: 30 });
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: fields,
            indexes: [
                "CREATE INDEX `idx_hinweise_updated` ON `" + COL + "` (`updated`)",
            ],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Hinweise] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Hinweise] Konnte Sammlung nicht anlegen: " + err.message);
    }
}
let schemaChecked = false;
function ready() {
    if (schemaChecked) return !!findCol(COL);
    schemaChecked = true;
    ensureSchema();
    return !!findCol(COL);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function pbDate(ms) { return new Date(ms).toISOString().replace("T", " "); }
function parseDate(s) {
    const t = Date.parse(String(s || "").replace(" ", "T"));
    return isFinite(t) ? t : 0;
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function arr(v) { return Array.isArray(v) ? v : []; }
function byId(list) {
    const s = {};
    arr(list).forEach(x => { if (x && x.id) s[String(x.id)] = x; });
    return s;
}
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// "2026-10-06" -> "Di 06.10."
function niceDate(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "";
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return WD[d.getUTCDay()] + " " + m[3] + "." + m[2] + ".";
}
function todayYmd() {
    // The server mostly runs in UTC - a day's buffer is enough for "not in the past"
    return new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
}
function readEntries(rec) {
    try {
        const v = JSON.parse(rec.getString("eintraege") || "[]");
        return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
}
function authInfo(auth) {
    if (!auth) return null;
    return {
        id: auth.id,
        mitglied: auth.getString("mitglied"),
        name: auth.getString("username") || "Jemand",
    };
}
function getStr(rec, name) { try { return rec.getString(name); } catch (e) { return ""; } }
// Recipient list -> ",id1,id2," (empty = whole family)
function anText(ids) {
    const list = arr(ids).map(x => String(x || "")).filter(x => /^[a-z0-9]{15}$/.test(x));
    const uniq = list.filter((x, i) => list.indexOf(x) === i);
    return uniq.length ? ("," + uniq.join(",") + ",").slice(0, 2000) : "";
}
// Key against duplicates from an app address ("/?aufgabe=abc" -> "aufgabe:abc")
function dkFromUrl(url) {
    const q = String(url || "").split("?")[1] || "";
    const params = {};
    q.split("&").forEach(p => {
        const i = p.indexOf("=");
        if (i > 0) { try { params[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); } catch (e) { params[p.slice(0, i)] = p.slice(i + 1); } }
    });
    for (let i = 0; i < DK_KEYS.length; i++) {
        const v = params[DK_KEYS[i]];
        if (v && v !== "1") return DK_KEYS[i] + ":" + String(v).slice(0, 60);
    }
    return "";
}
function cleanEntry(x) {
    const o = { id: String(x.id || "").slice(0, 60), t: cleanText(x.t, 120) };
    if (x.d) o.d = String(x.d).slice(0, 10);
    if (x.z) o.z = cleanText(x.z, 60);
    if (x.k) o.k = String(x.k).slice(0, 80);
    if (typeof x.b === "number" && isFinite(x.b)) o.b = Math.round(x.b * 100) / 100;
    if (x.f) o.f = String(x.f).slice(0, 60);
    return o;
}

// Remove old notices of the family (only when creating a new notice, 60 at once at most)
function cleanup(familyId) {
    let old = [];
    try {
        old = $app.findRecordsByFilter(COL, "familie = {:f} && updated < {:d}", "", 60, 0, { f: familyId, d: pbDate(Date.now() - KEEP_MS) });
    } catch (e) { old = []; }
    old.forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
}

// ---------------------------------------------------------------------------------------------
// Create a notice or merge it with a fresh notice of the same person
// items: [{ id, t, d?, z?, k?, b?, f? }]
// opts:  { an: [profile IDs] (only for these), replace: true (replace entries instead of appending) }
// ---------------------------------------------------------------------------------------------
function record(familyId, who, art, ziel, typ, titel, items, opts) {
    if (!familyId || !who || !who.id) return;
    const o = opts || {};
    const list = arr(items).filter(x => x && x.t).map(cleanEntry);
    if (!list.length) return;
    if (!ready()) return;
    const an = o.an ? anText(o.an) : "";
    if (o.an && !an) return; // nobody else may see it
    let rec = null;
    try {
        const found = $app.findRecordsByFilter(COL,
            "familie = {:f} && art = {:a} && ziel = {:z} && wer = {:w} && an = {:an} && updated >= {:s}",
            "-updated", 1, 0,
            { f: familyId, a: art, z: String(ziel || "").slice(0, 80), w: who.id, an: an, s: pbDate(Date.now() - MERGE_MS) });
        rec = found[0] || null;
    } catch (e) { rec = null; }

    if (rec) {
        const old = readEntries(rec);
        const known = {};
        old.forEach(x => { if (x && x.id) known[x.id] = 1; });
        const fresh = list.filter(x => !x.id || !known[x.id]);
        if (!fresh.length) return;
        rec.set("eintraege", JSON.stringify(fresh.concat(old).slice(0, MAX_ENTRIES)));
        rec.set("anzahl", (rec.getInt("anzahl") || old.length) + fresh.length);
        if (titel) rec.set("titel", cleanText(titel, 200));
        $app.save(rec);
        return;
    }
    cleanup(familyId);
    rec = new Record($app.findCollectionByNameOrId(COL));
    rec.set("familie", familyId);
    rec.set("art", art);
    rec.set("ziel", String(ziel || "").slice(0, 80));
    rec.set("typ", String(typ || "").slice(0, 20));
    rec.set("wer", who.id);
    rec.set("mitglied", String(who.mitglied || "").slice(0, 60));
    rec.set("name", cleanText(who.name, 80));
    rec.set("titel", cleanText(titel, 200));
    rec.set("anzahl", list.length);
    rec.set("eintraege", JSON.stringify(list.slice(0, MAX_ENTRIES)));
    if (an) rec.set("an", an);
    $app.save(rec);
}

// Take an entry out again (e.g. tick removed again right away)
function unrecord(familyId, who, art, entryId) {
    if (!familyId || !who || !who.id || !entryId || !ready()) return;
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(COL, "familie = {:f} && art = {:a} && wer = {:w} && updated >= {:s}", "-updated", 3, 0,
            { f: familyId, a: art, w: who.id, s: pbDate(Date.now() - DAY_MS) });
    } catch (e) { recs = []; }
    recs.forEach(rec => {
        const old = readEntries(rec);
        const rest = old.filter(x => !x || x.id !== entryId);
        if (rest.length === old.length) return;
        try {
            if (!rest.length) { $app.delete(rec); return; }
            rec.set("eintraege", JSON.stringify(rest));
            rec.set("anzahl", Math.max(rest.length, (rec.getInt("anzahl") || old.length) - 1));
            $app.save(rec);
        } catch (e) { /* ignore */ }
    });
}

// ---------------------------------------------------------------------------------------------
// 1. Mirror a push message into the recipient's bell (from pinn-push.js#notifyUserDetailed)
// msg: { titel, text, url, tag, bis? (ms), dk? }
// ---------------------------------------------------------------------------------------------
function pushMirror(userId, msg) {
    if (!userId || !msg) return;
    const url = String(msg.url || "/");
    if (PUSH_SKIP_URL.test(url)) return;
    const tag = String(msg.tag || "").slice(0, 80);
    if (tag === "test") return;
    let user = null;
    try { user = $app.findRecordById("benutzer", String(userId)); } catch (e) { return; }
    const familyId = getStr(user, "familie");
    if (!familyId || !ready()) return;
    const an = anText([userId]);
    const titel = cleanText(msg.titel || "pinn.", 200);
    const text = String(msg.text || "").trim().slice(0, 2000);
    const dk = String(msg.dk || dkFromUrl(url) || "").slice(0, 80);
    const bis = Number(msg.bis) > 0 ? Math.round(Number(msg.bis)) : 0;
    let rec = null;
    if (tag) {
        try {
            const found = $app.findRecordsByFilter(COL, "familie = {:f} && art = 'push' && an = {:an} && ziel = {:z} && updated >= {:s}", "-updated", 1, 0,
                { f: familyId, an: an, z: tag, s: pbDate(Date.now() - PUSH_MERGE_MS) });
            rec = found[0] || null;
        } catch (e) { rec = null; }
    }
    if (!rec) {
        cleanup(familyId);
        rec = new Record($app.findCollectionByNameOrId(COL));
        rec.set("familie", familyId);
        rec.set("art", "push");
        rec.set("ziel", tag);
        rec.set("wer", "");
        rec.set("an", an);
        rec.set("anzahl", 1);
    }
    rec.set("typ", (tag.split("-")[0] || "").slice(0, 20));
    rec.set("titel", titel);
    rec.set("text", text);
    rec.set("link", url.slice(0, 400));
    rec.set("bis", bis);
    rec.set("eintraege", JSON.stringify(dk ? [{ id: "p", t: titel.slice(0, 120), k: dk }] : []));
    $app.save(rec);
}

// ---------------------------------------------------------------------------------------------
// 1b. Update notice (since 1.118.1, from pinn-system.js#updateHinweise): ONE card per profile that is
//     refreshed daily - even if it is older than a day. Swiped away, it comes back the
//     next day until the update is installed. true = saved.
// ---------------------------------------------------------------------------------------------
function updateNotice(userId, msg) {
    if (!userId || !msg || !ready()) return false;
    let user = null;
    try { user = $app.findRecordById("benutzer", String(userId)); } catch (e) { return false; }
    const familyId = getStr(user, "familie");
    if (!familyId) return false;
    const an = anText([userId]);
    let rec = null;
    try {
        rec = $app.findRecordsByFilter(COL, "familie = {:f} && art = 'push' && an = {:an} && typ = 'update'", "-updated", 1, 0, { f: familyId, an: an })[0] || null;
    } catch (e) { rec = null; }
    if (!rec) {
        cleanup(familyId);
        rec = new Record($app.findCollectionByNameOrId(COL));
        rec.set("familie", familyId);
        rec.set("art", "push");
        rec.set("wer", "");
        rec.set("an", an);
        rec.set("anzahl", 1);
    }
    rec.set("ziel", String(msg.tag || "update").slice(0, 80));
    rec.set("typ", "update");
    rec.set("titel", cleanText(msg.titel || "pinn.", 200));
    rec.set("text", String(msg.text || "").trim().slice(0, 1900));
    rec.set("link", String(msg.url || "/?system=update").slice(0, 400));
    rec.set("bis", 0);
    rec.set("eintraege", JSON.stringify([{ id: "u", t: new Date().toISOString().slice(0, 10) }]));
    $app.save(rec);
    return true;
}
// Update installed: remove the update cards of all profiles
function updateNoticeClear() {
    if (!ready()) return;
    try {
        $app.findRecordsByFilter(COL, "art = 'push' && typ = 'update'", "", 200, 0)
            .forEach(r => { try { $app.delete(r); } catch (e) { /* ignore */ } });
    } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------------------------
// 2. After saving the family data: compare the old with the new state
// ---------------------------------------------------------------------------------------------
function itemLabel(it) { return it.qty ? it.name + " (" + it.qty + ")" : it.name; }
function afterSave(familyId, oldData, newData, auth) {
    if (!familyId || !oldData || typeof oldData !== "object" || !newData || typeof newData !== "object") return;
    const who = authInfo(auth);
    if (!who) return;
    const now = Date.now();
    const fresh = it => !it.createdAt || Number(it.createdAt) >= now - ITEM_MAX_AGE;

    // --- Shopping lists: new, renamed, deleted ---
    const oldListMap = byId(oldData.shoppingLists);
    const lists = arr(newData.shoppingLists);
    const newListMap = byId(lists);
    const listName = lid => {
        if (lid === "essensplanung") return "Essensplanung";
        const l = newListMap[lid] || oldListMap[lid];
        return l ? (l.name || "Einkaufsliste") : "";
    };
    lists.forEach(l => {
        if (!l || !l.id || l.id === "essensplanung") return;
        const prev = oldListMap[l.id];
        if (!prev) {
            record(familyId, who, "einkaufsliste", l.id, "einkauf", l.name || "Einkaufsliste", [{ id: l.id, t: l.name || "Einkaufsliste" }]);
        } else if (cleanText(prev.name, 80) && cleanText(l.name, 80) && cleanText(prev.name, 80) !== cleanText(l.name, 80)) {
            record(familyId, who, "einkaufsliste-um", l.id, "einkauf", l.name, [{ id: l.id + ":" + cleanText(l.name, 40), t: l.name, z: prev.name }]);
        }
    });
    if (Array.isArray(oldData.shoppingLists)) {
        arr(oldData.shoppingLists).forEach(l => {
            if (!l || !l.id || l.id === "essensplanung" || newListMap[l.id]) return;
            record(familyId, who, "einkaufsliste-weg", l.id, "einkauf", l.name || "Einkaufsliste", [{ id: l.id, t: l.name || "Einkaufsliste" }]);
        });
    }

    // --- Shopping: new, ticked-off and removed items, merged per list ---
    const oldItems = byId(oldData.shoppingItems);
    const newItems = arr(newData.shoppingItems);
    const newItemMap = byId(newItems);
    const added = {}, ticked = {}, removed = {};
    const push = (map, lid, e) => { (map[lid] = map[lid] || []).push(e); };
    newItems.forEach(it => {
        if (!it || !it.id || !it.name) return;
        const lid = it.listId || "essensplanung";
        const prev = oldItems[it.id];
        if (!prev) {
            if (!it.done && fresh(it)) push(added, lid, { id: it.id, t: itemLabel(it) });
        } else if (it.done && !prev.done) {
            push(ticked, lid, { id: it.id, t: itemLabel(it) });
        }
    });
    if (Array.isArray(oldData.shoppingItems)) {
        arr(oldData.shoppingItems).forEach(it => {
            if (!it || !it.id || !it.name || it.done || newItemMap[it.id]) return;
            const lid = it.listId || "essensplanung";
            if (lid !== "essensplanung" && !newListMap[lid]) return; // whole list deleted - already reported above
            push(removed, lid, { id: it.id, t: itemLabel(it) });
        });
    }
    const each = (map, art) => Object.keys(map).forEach(lid => {
        const title = listName(lid);
        if (!title) return; // the list does not exist (any more)
        record(familyId, who, art, lid, "einkauf", title, map[lid]);
    });
    each(added, "einkauf");
    each(ticked, "einkauf-ab");
    each(removed, "einkauf-weg");

    // --- Further lists (packing, checklists, ideas, wishes) ---
    const oldFam = byId(oldData.familyLists);
    const newFamMap = byId(newData.familyLists);
    const secret = l => !l || l.type === "gift" || !!l.privateTo || (l.type === "wish" && (!who.mitglied || l.memberId !== who.mitglied));
    arr(newData.familyLists).forEach(l => {
        if (!l || !l.id || !l.type || secret(l)) return; // Gifts & private stuff stay secret, only own wishes
        const prev = oldFam[l.id];
        if (!prev) {
            // new list (only if there was list data at all before)
            if (Array.isArray(oldData.familyLists)) {
                record(familyId, who, "liste-neu", l.id, l.type, l.name || "Liste", [{ id: l.id, t: l.name || "Liste" }]);
            }
            return;
        }
        if (prev.privateTo) return; // was private - do not report changes from it
        if (cleanText(prev.name, 80) && cleanText(l.name, 80) && cleanText(prev.name, 80) !== cleanText(l.name, 80)) {
            record(familyId, who, "liste-um", l.id, l.type, l.name, [{ id: l.id + ":" + cleanText(l.name, 40), t: l.name, z: prev.name }]);
        }
        const had = byId(prev.items);
        const newEntries = [], doneEntries = [];
        arr(l.items).forEach(it => {
            if (!it || !it.id || !it.text) return;
            const p = had[it.id];
            if (!p) { if (!it.done && fresh(it)) newEntries.push({ id: it.id, t: it.text }); }
            else if (it.done && !p.done) doneEntries.push({ id: it.id, t: it.text });
        });
        if (newEntries.length) record(familyId, who, "liste", l.id, l.type, l.name || "Liste", newEntries);
        if (doneEntries.length) record(familyId, who, "liste-ab", l.id, l.type, l.name || "Liste", doneEntries);
    });
    if (Array.isArray(oldData.familyLists)) {
        arr(oldData.familyLists).forEach(l => {
            if (!l || !l.id || !l.type || newFamMap[l.id] || secret(l)) return;
            record(familyId, who, "liste-weg", l.id, l.type, l.name || "Liste", [{ id: l.id, t: l.name || "Liste" }]);
        });
    }

    // --- Meal planning ---
    const oldMeals = byId(oldData.mealPlan);
    const recipes = arr(newData.recipes);
    const recipeMap = byId(recipes);
    const minDay = todayYmd();
    const meals = arr(newData.mealPlan).filter(m => m && m.id && !oldMeals[m.id] && String(m.date || "") >= minDay).map(m => {
        const r = m.recipeId ? recipeMap[m.recipeId] : null;
        const title = (r && r.title) || m.title || "";
        return title ? { id: m.id, t: title, d: m.date } : null;
    }).filter(Boolean);
    if (meals.length) record(familyId, who, "essen", "plan", "", "Essensplanung", meals);

    // --- Rezepte ---
    const oldRecipes = byId(oldData.recipes);
    // Recipes restored from the recycle bin are not new (since 1.118.3)
    const oldTrash = byId(oldData.recipeTrash);
    const newRecipes = recipes.filter(r => r && r.id && !oldRecipes[r.id] && !oldTrash[r.id] && r.title).map(r => ({ id: r.id, t: r.title, k: "rezept:" + r.id }));
    if (newRecipes.length && newRecipes.length <= 30) record(familyId, who, "rezept", "rezepte", "", "Rezepte", newRecipes);

    // --- Pantry: new items ---
    if (Array.isArray(oldData.pantryItems)) {
        const oldPantry = byId(oldData.pantryItems);
        const newPantry = arr(newData.pantryItems).filter(p => p && p.id && p.name && !oldPantry[p.id])
            .map(p => ({ id: p.id, t: p.name + (p.qty ? " (" + p.qty + (p.unit ? " " + p.unit : "") + ")" : "") }));
        if (newPantry.length && newPantry.length <= 40) record(familyId, who, "vorrat", "vorrat", "", "Vorrat", newPantry);
    }

    // --- Family: new members ---
    if (Array.isArray(oldData.members)) {
        const oldMembers = byId(oldData.members);
        const newMembers = arr(newData.members).filter(m => m && m.id && m.name && !oldMembers[m.id])
            .map(m => ({ id: m.id, t: m.name, z: m.role || "", k: "mitglied:" + m.id }));
        if (newMembers.length) record(familyId, who, "mitglied", "familie", "", "Familie", newMembers);
    }

    // --- Emergency pass changed (per member) ---
    const oldPasses = (oldData.emergencyPasses && typeof oldData.emergencyPasses === "object") ? oldData.emergencyPasses : null;
    const newPasses = (newData.emergencyPasses && typeof newData.emergencyPasses === "object") ? newData.emergencyPasses : null;
    if (oldPasses && newPasses) {
        const memberMap = byId(newData.members);
        Object.keys(newPasses).forEach(mid => {
            let a = "", b = "";
            try { a = JSON.stringify(oldPasses[mid] || null); b = JSON.stringify(newPasses[mid] || null); } catch (e) { return; }
            if (a === b || b === "null") return;
            const m = memberMap[mid];
            if (!m) return;
            record(familyId, who, "notfallpass", mid, "", m.name || "Notfallpass", [{ id: mid + ":" + new Date().toISOString().slice(0, 13), t: m.name || "Notfallpass" }]);
        });
    }

    // --- Board: new notes and replies ---
    if (Array.isArray(oldData.pinboard)) {
        const oldNotes = byId(oldData.pinboard);
        const fresh2 = ms => !ms || Number(ms) >= now - ITEM_MAX_AGE;
        const newNotes = [];
        arr(newData.pinboard).forEach(n => {
            if (!n || !n.id) return;
            const prev = oldNotes[n.id];
            const head = cleanText(n.title || n.text || (n.type === "photo" ? "Foto" : "Zettel"), 80) || "Zettel";
            if (!prev) {
                if (!n.archived && fresh2(n.createdAt)) newNotes.push({ id: n.id, t: head, k: "pinnwand:" + n.id });
                return;
            }
            const hadC = byId(prev.comments);
            const replies = arr(n.comments).filter(c => c && c.id && c.text && !hadC[c.id] && fresh2(c.at))
                .map(c => ({ id: c.id, t: cleanText(c.text, 120) }));
            if (replies.length) record(familyId, who, "pinnwand-antwort", n.id, n.type || "", head, replies);
        });
        if (newNotes.length) record(familyId, who, "pinnwand", "pinnwand", "", "Pinnwand", newNotes);
    }
}

// ---------------------------------------------------------------------------------------------
// Tasks (from aufgaben.pb.js) - household tasks are created by the schedule, those are not reported
// ---------------------------------------------------------------------------------------------
function taskCreated(familyId, task, auth) {
    if (!task || !task.id || !task.title || task.household) return;
    const who = authInfo(auth);
    if (!who) return;
    record(familyId, who, "aufgabe", "aufgaben", "", "Aufgaben", [{ id: task.id, t: task.title, d: task.dueDate || "", k: "aufgabe:" + task.id }]);
}
// Task ticked off (done = true) or tick removed again
function taskDone(familyId, task, auth, done) {
    if (!task || !task.id || !task.title) return;
    const who = authInfo(auth);
    if (!who) return;
    if (!done) { unrecord(familyId, who, "aufgabe-ab", task.id); return; }
    record(familyId, who, "aufgabe-ab", "aufgaben", task.household ? "haushalt" : "", "Aufgaben", [{ id: task.id, t: task.title }]);
}

// New event (from create_calendar_event.pb.js)
function eventCreated(familyId, body, auth) {
    if (!body || !body.title) return;
    const who = authInfo(auth);
    if (!who) return;
    const id = "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const day = String(body.startDate || "").slice(0, 10);
    const when = [niceDate(body.startDate), (!body.allDay && body.startTime) ? String(body.startTime).slice(0, 5) + " Uhr" : ""].filter(Boolean).join(", ");
    record(familyId, who, "termin", "kalender", "", "Kalender", [{ id: id, t: body.title, d: day, z: when, k: termKey(day, body.title) }]);
}
// Same key as for the assignment push (pinn-push.js)
function termKey(day, title) { return "termin:" + String(day || "").slice(0, 10) + ":" + cleanText(title, 40); }

// ---------------------------------------------------------------------------------------------
// Finance: new booking (from pinn-finanzen.js) - only to the members of the fund
// ---------------------------------------------------------------------------------------------
function kasseInfo(familyId, kasseId) {
    if (!kasseId) return null;
    try {
        const kassen = require(`${__hooks}/pinn-kassen.js`);
        const k = kassen.metaList(familyId).find(x => x.id === kasseId);
        if (!k) return null;
        return { meta: k, userIds: kassen.memberUserIds(k) };
    } catch (e) { return null; }
}
function expenseCreated(rec, user) {
    if (!rec || !user) return;
    const familyId = getStr(rec, "familie");
    const kasseId = getStr(rec, "kasse");
    const info = kasseInfo(familyId, kasseId);
    if (!info) return;
    const who = authInfo(user);
    const an = info.userIds.filter(id => id !== who.id);
    if (!an.length) return; // own fund - nobody else
    const betrag = Math.round(rec.getFloat("betrag") * 100) / 100;
    const kat = getStr(rec, "kategorie");
    const laden = cleanText(getStr(rec, "laden"), 60);
    const titel = cleanText(getStr(rec, "titel"), 120) || laden || "Buchung";
    const bezug = getStr(rec, "bezug");
    const fz = /^fahrzeug:/.test(bezug) ? bezug.slice(9) : "";
    const art = kat === "ausgleich" ? "ausgleich" : (fz ? "fahrzeug-log" : "ausgabe");
    const n = getStr(rec, "artikel") ? getStr(rec, "artikel").split("\n").filter(Boolean).length : 0;
    record(familyId, who, art, kasseId, kat.slice(0, 20), info.meta.name || "Kasse", [{
        id: rec.id, t: titel, b: betrag, z: laden || (n ? n + " Artikel" : ""), f: fz,
        k: "ausgabe:" + rec.id, d: getStr(rec, "datum"),
    }], { an: an });
}

// ---------------------------------------------------------------------------------------------
// Fund data saved (from pinn-kassen.js#saveData): new contracts and vehicles
// ---------------------------------------------------------------------------------------------
function kasseDataSaved(meta, oldDaten, newDaten, user) {
    if (!meta || !user || !oldDaten || !newDaten || typeof oldDaten !== "object" || typeof newDaten !== "object") return;
    const who = authInfo(user);
    let ids = [];
    try { ids = require(`${__hooks}/pinn-kassen.js`).memberUserIds(meta); } catch (e) { ids = []; }
    const an = ids.filter(id => id !== who.id);
    if (!an.length) return;
    const familyId = meta.familie;
    const name = meta.name || "Kasse";
    if (Array.isArray(oldDaten.contracts)) {
        const had = byId(oldDaten.contracts);
        const fresh = arr(newDaten.contracts).filter(c => c && c.id && !had[c.id])
            .map(c => ({ id: c.id, t: cleanText(c.name, 100) || cleanText(c.provider, 100) || "Vertrag", z: c.provider && c.name ? cleanText(c.provider, 60) : "", k: "vertrag:" + c.id }));
        if (fresh.length && fresh.length <= 20) record(familyId, who, "vertrag", meta.id, "", name, fresh, { an: an });
    }
    if (Array.isArray(oldDaten.vehicles)) {
        const had = byId(oldDaten.vehicles);
        const fresh = arr(newDaten.vehicles).filter(v => v && v.id && !had[v.id])
            .map(v => ({ id: v.id, t: cleanText(v.name, 80) || [v.make, v.model].filter(Boolean).join(" ") || "Fahrzeug", z: cleanText(v.plate, 20).toUpperCase(), k: "fahrzeug:" + v.id }));
        if (fresh.length && fresh.length <= 10) record(familyId, who, "fahrzeug", meta.id, "", name, fresh, { an: an });
    }
}

// ---------------------------------------------------------------------------------------------
// Document newly filed (from hinweise.pb.js, after creating it via the collection API)
// Recipients: profiles of the family (no guests), restricted to "visible" and the fund
// ---------------------------------------------------------------------------------------------
function documentCreated(rec, auth) {
    if (!rec || !auth) return;
    const familyId = getStr(rec, "familie");
    if (!familyId || getStr(auth, "familie") !== familyId) return;
    const who = authInfo(auth);
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    let ids = users.filter(u => getStr(u, "rolle") !== "gast" && getStr(u, "rolle") !== "hauptadmin").map(u => u.id);
    const vis = getStr(rec, "sichtbar").split(",").map(x => x.trim()).filter(Boolean);
    if (vis.length) ids = ids.filter(id => vis.indexOf(id) >= 0);
    const kasseId = getStr(rec, "kasse");
    if (kasseId) {
        const info = kasseInfo(familyId, kasseId);
        const allowed = info ? info.userIds : [];
        ids = ids.filter(id => allowed.indexOf(id) >= 0);
    }
    ids = ids.filter(id => id !== who.id);
    if (!ids.length) return;
    const titel = cleanText(getStr(rec, "titel"), 120) || "Dokument";
    record(familyId, who, "dokument", "dokumente", "", "Dokumente", [{
        id: rec.id, t: titel, z: cleanText(getStr(rec, "kategorie"), 40), k: "dokument:" + rec.id,
    }], { an: ids });
}

// ---------------------------------------------------------------------------------------------
// Retrieval for the app: notices of the last 3 days, without the own ones - only what is meant for this profile;
// family notices about things for which the profile already has a push message in the
// bell are dropped (key k)
// ---------------------------------------------------------------------------------------------
function listFor(familyId, userId) {
    if (!familyId) return [];
    if (!ready()) return [];
    const me = String(userId || "");
    const now = Date.now();
    let recs = [];
    try {
        recs = $app.findRecordsByFilter(COL,
            "familie = {:f} && wer != {:w} && updated >= {:s} && (an = '' || an ~ {:me}) && (bis = 0 || bis > {:n})",
            "-updated", 100, 0,
            { f: familyId, w: me, s: pbDate(now - SHOW_MS), me: "," + me + ",", n: now });
    } catch (e) {
        // Fallback in case the new fields are (still) missing
        try {
            recs = $app.findRecordsByFilter(COL, "familie = {:f} && wer != {:w} && updated >= {:s}", "-updated", 80, 0,
                { f: familyId, w: me, s: pbDate(now - SHOW_MS) });
        } catch (e2) { recs = []; }
    }
    const pushKeys = {};
    recs.forEach(r => {
        if (r.getString("art") !== "push") return;
        readEntries(r).forEach(x => { if (x && x.k) pushKeys[x.k] = 1; });
    });
    const out = [];
    recs.forEach(r => {
        const art = r.getString("art");
        let eintraege = readEntries(r);
        let anzahl = r.getInt("anzahl");
        if (art !== "push") {
            const before = eintraege.length;
            eintraege = eintraege.filter(x => !(x && x.k && pushKeys[x.k]));
            if (!eintraege.length && before) return; // everything is already there as a personal message
            anzahl = Math.max(eintraege.length, anzahl - (before - eintraege.length));
        }
        out.push({
            id: r.id,
            art: art,
            ziel: r.getString("ziel"),
            typ: r.getString("typ"),
            wer: r.getString("wer"),
            mitglied: r.getString("mitglied"),
            name: r.getString("name"),
            titel: r.getString("titel"),
            text: getStr(r, "text"),
            link: getStr(r, "link"),
            anzahl: anzahl,
            eintraege: eintraege.slice(0, 12),
            zeit: parseDate(r.getString("updated")),
        });
    });
    return out;
}

module.exports = {
    ensureSchema, afterSave, taskCreated, taskDone, eventCreated, termKey, listFor,
    pushMirror, updateNotice, updateNoticeClear, expenseCreated, kasseDataSaved, documentCreated, COL,
};
