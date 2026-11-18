// pb_hooks/pinn-sicherheit.js
// Not a *.pb.js -> NOT loaded automatically as a hook, only included via require() (routes in sicherheit.pb.js).
//
// Security overview (since 1.153.0): a family admin puts Home Assistant devices into named groups
// (Settings → Security). The dashboard (bottom bar) and the overview tile then show per group e.g.
// "All closed", "Kitchen window is open", "1 camera is on" or "Smoke alarm: Hallway".
//
// Kinds of groups (field "art") and how a device counts:
//   oeffnung   windows & doors      binary_sensor on / cover open|opening|closing  -> "aktiv" (open)
//   schloss    door locks           lock locked -> ok, jammed -> alarm, everything else -> "aktiv" (not locked)
//   kamera     cameras              camera not "off" / switch|binary_sensor on       -> "aktiv" (on, neutral)
//   rollladen  garage door/shutters cover open|opening|closing / binary_sensor on      -> "aktiv" (open)
//   melder     smoke & water        binary_sensor on                                   -> alarm
//   alarm      alarm system         armed_* -> ok, triggered -> alarm, disarmed|arming|pending -> "aktiv"
//   bewegung   motion               binary_sensor on                                   -> "aktiv" (neutral)
//   unavailable / unknown / missing entity -> "offline"
// Level of a group: alarm > warn (something open / unlocked / disarmed) > info (camera on, motion) > ok; "offline" if
// no device answers. The app builds the sentences itself (language of the device) from the structured answer.
//
// Evening check (optional): at a time of day set by the admin, every family admin gets a push if a device of a
// group with "abend: true" is still open, unlocked or disarmed. The time follows each admin's own clock
// (pinn-zeit.js, clockOfUser); the marker against sending twice holds the LOCAL date of that admin.
//
// Locking: signed-in adults (no guests, no children) may lock a lock of a "schloss" group from the app
// (service lock.lock). Unlocking is never offered. The dashboard only shows the state.
//
// Data per family: locked collection "sicherheit" (only reachable via sicherheit.pb.js):
//   familie, einstellungen = { gruppen: [{ id, name, art, icon, abend, geraete: [{ entity, name }] }],
//                              dashboard, uebersicht, abend: { an, zeit: "HH:MM" } }
//            gesendet      = { "<local date>|<profile>": ISO }  (evening check, kept 3 days)
// The access to Home Assistant itself (address + token) stays in pinn-smarthome.js ("smarthome_zugaenge").
// States are read with ONE call (/api/states) and kept for 15 seconds in $app.store(), so many dashboards and
// phones asking at the same time cause only one request to Home Assistant.

const COL = "sicherheit";
const KINDS = ["oeffnung", "schloss", "kamera", "rollladen", "melder", "alarm", "bewegung"];
// default symbol per kind (same as SEC_KINDS in js/sicherheit.js), used in the push text when a group has none
const KIND_ICONS = { oeffnung: "\ud83e\ude9f", schloss: "\ud83d\udd10", kamera: "\ud83d\udcf7", rollladen: "\ud83d\ude97", melder: "\ud83d\udd25", alarm: "\ud83d\udea8", bewegung: "\ud83c\udfc3" };
const DOMAINS = ["binary_sensor", "cover", "lock", "camera", "switch", "alarm_control_panel"];
const MAX_GROUPS = 20;
const MAX_DEVICES = 40;
const CACHE_MS = 15000;
const CACHE_KEY = "pinnSicherheit:";
const ABEND_WINDOW_MIN = 30;      // the evening check is sent at most this many minutes after the set time
const SENT_DAYS = 3;
const ENTITY_RE = /^[a-z_]+\.[a-z0-9_]+$/;

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function cleanTime(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m) return "";
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return "";
    return pad(h) + ":" + pad(mi);
}
function cleanText(v, max) {
    return String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function newId() {
    try { return $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789"); }
    catch (e) { return "g" + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
}
function smart() { return require(`${__hooks}/pinn-smarthome.js`); }

// ---------------------------------------------------------------------------------------------
// Collection "sicherheit" (one record per family)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (findCol(COL)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "text", max: 40, required: true },
                { name: "einstellungen", type: "text", max: 60000 },
                { name: "gesendet", type: "text", max: 20000 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE UNIQUE INDEX `idx_sicherheit_familie` ON `" + COL + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Sicherheit] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Sicherheit] Konnte Sammlung nicht anlegen: " + err.message);
    }
}
function loadRec(familyId) {
    if (!familyId || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
function loadOrCreateRec(familyId) {
    if (!familyId) throw new Error("Keine Familie.");
    ensureSchema();
    let rec = loadRec(familyId);
    if (!rec) {
        rec = new Record(findCol(COL));
        rec.set("familie", String(familyId));
        rec.set("einstellungen", "{}");
        rec.set("gesendet", "{}");
    }
    return rec;
}
function parseObj(s) {
    try { const o = JSON.parse(s || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
function cleanSettings(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const seen = {};
    const gruppen = (Array.isArray(src.gruppen) ? src.gruppen : []).slice(0, MAX_GROUPS).map(g => {
        if (!g || typeof g !== "object") return null;
        const art = KINDS.indexOf(g.art) >= 0 ? g.art : "oeffnung";
        let id = /^[a-z0-9]{4,20}$/.test(String(g.id || "")) ? String(g.id) : newId();
        if (seen[id]) id = newId();
        seen[id] = true;
        const ents = {};
        const geraete = (Array.isArray(g.geraete) ? g.geraete : []).map(d => {
            const entity = String((d && d.entity) || "").trim();
            if (!ENTITY_RE.test(entity) || entity.length > 120 || ents[entity]) return null;
            if (DOMAINS.indexOf(entity.split(".")[0]) < 0) return null;
            ents[entity] = true;
            return { entity: entity, name: cleanText(d.name, 60) || entity };
        }).filter(Boolean).slice(0, MAX_DEVICES);
        return {
            id: id,
            name: cleanText(g.name, 40),
            art: art,
            icon: cleanText(g.icon, 8),
            abend: g.abend === true,
            geraete: geraete,
        };
    }).filter(Boolean);
    const ab = src.abend && typeof src.abend === "object" ? src.abend : {};
    return {
        gruppen: gruppen,
        dashboard: src.dashboard !== false,
        uebersicht: src.uebersicht !== false,
        abend: { an: ab.an === true, zeit: cleanTime(ab.zeit) || "22:00" },
    };
}
function readSettings(rec) {
    return cleanSettings(parseObj(rec ? rec.getString("einstellungen") : ""));
}
function haConnected(familyId) {
    try { smart().haOf(familyId); return true; } catch (e) { return false; }
}
// Admin: settings plus whether Home Assistant is connected at all
function einstellungen(familyId) {
    return { einstellungen: readSettings(loadRec(familyId)), haVerbunden: haConnected(familyId) };
}
function speichern(familyId, body) {
    const rec = loadOrCreateRec(familyId);
    const s = cleanSettings(body && body.einstellungen);
    rec.set("einstellungen", JSON.stringify(s));
    $app.save(rec);
    dropCache(familyId);
    return { einstellungen: s, haVerbunden: haConnected(familyId) };
}

// ---------------------------------------------------------------------------------------------
// States from Home Assistant (one call, short cache)
// ---------------------------------------------------------------------------------------------
function dropCache(familyId) {
    try { $app.store().remove(CACHE_KEY + familyId); } catch (e) { /* never mind */ }
}
// Map entity -> { state, name, dc } of all entities in the security domains
function statesOf(familyId, fresh) {
    if (!fresh) {
        try {
            const raw = $app.store().get(CACHE_KEY + familyId);
            if (raw) {
                const c = JSON.parse(String(raw));
                if (c && c.t > Date.now() - CACHE_MS && c.m) return c.m;
            }
        } catch (e) { /* load again */ }
    }
    const S = smart();
    const ha = S.haOf(familyId);
    const list = S.haRequest(ha, "GET", "/api/states") || [];
    const map = {};
    (Array.isArray(list) ? list : []).forEach(s => {
        const id = String((s && s.entity_id) || "");
        if (DOMAINS.indexOf(id.split(".")[0]) < 0) return;
        const a = s.attributes || {};
        map[id] = { state: String(s.state || ""), name: String(a.friendly_name || id), dc: String(a.device_class || "") };
    });
    try { $app.store().set(CACHE_KEY + familyId, JSON.stringify({ t: Date.now(), m: map })); } catch (e) { /* no cache */ }
    return map;
}

// One device: "ok" | "aktiv" | "alarm" | "offline"
function deviceState(art, entity, s) {
    if (!s) return "offline";
    const st = String(s.state || "").toLowerCase();
    if (!st || st === "unavailable" || st === "unknown") return "offline";
    const domain = entity.split(".")[0];
    const onOff = st === "on" ? "aktiv" : "ok";
    const coverOpen = ["open", "opening", "closing"].indexOf(st) >= 0 ? "aktiv" : "ok";
    switch (art) {
        case "oeffnung":
        case "rollladen":
            return domain === "cover" ? coverOpen : onOff;
        case "schloss":
            if (st === "locked") return "ok";
            if (st === "jammed") return "alarm";
            return "aktiv";
        case "kamera":
            if (domain === "camera") return st === "off" ? "ok" : "aktiv";
            return onOff;
        case "melder":
            return st === "on" ? "alarm" : "ok";
        case "alarm":
            if (st === "triggered") return "alarm";
            if (st.indexOf("armed_") === 0) return "ok";
            return "aktiv";
        case "bewegung":
            return onOff;
    }
    return "offline";
}
function groupLevel(g, counts) {
    if (counts.alarm) return "alarm";
    if (counts.aktiv) return g.art === "kamera" || g.art === "bewegung" ? "info" : "warn";
    if (counts.ok) return "ok";
    return counts.offline ? "offline" : "ok";
}
// Structured state of one group. withEntities: the app gets the entity IDs (for locking), the dashboard does not.
function groupStatus(g, map, withEntities) {
    const counts = { ok: 0, aktiv: 0, alarm: 0, offline: 0 };
    const aktiv = [], offline = [];
    g.geraete.forEach(d => {
        const s = map ? map[d.entity] : null;
        const st = map ? deviceState(g.art, d.entity, s) : "offline";
        counts[st]++;
        const item = { name: d.name, zustand: s ? String(s.state || "") : "" };
        if (withEntities) item.entity = d.entity;
        if (st === "aktiv" || st === "alarm") { item.alarm = st === "alarm"; aktiv.push(item); }
        else if (st === "offline") offline.push(item);
    });
    return {
        id: g.id, name: g.name, art: g.art, icon: g.icon,
        stufe: groupLevel(g, counts), anzahl: g.geraete.length,
        aktiv: aktiv, offline: offline,
    };
}
// where: "dashboard" | "app"
function status(familyId, where) {
    const s = readSettings(loadRec(familyId));
    const groups = s.gruppen.filter(g => g.geraete.length);
    const out = { aktiv: groups.length > 0, dashboard: s.dashboard, uebersicht: s.uebersicht, gruppen: [], zeit: new Date().toISOString() };
    if (where === "dashboard" && !s.dashboard) { out.aktiv = false; return out; }
    if (!out.aktiv) return out;
    let map = null;
    try { map = statesOf(familyId, false); }
    catch (err) { out.fehler = haConnected(familyId) ? "verbindung" : "ha"; }
    out.gruppen = groups.map(g => groupStatus(g, map, where === "app"));
    return out;
}

// ---------------------------------------------------------------------------------------------
// Entities for the admin (group editor)
// ---------------------------------------------------------------------------------------------
function entitaeten(familyId) {
    const map = statesOf(familyId, true);
    const out = Object.keys(map).map(id => ({ id: id, name: map[id].name, domain: id.split(".")[0], dc: map[id].dc, state: map[id].state }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { entitaeten: out.slice(0, 2000) };
}

// ---------------------------------------------------------------------------------------------
// Lock (signed-in adults only, checked in sicherheit.pb.js)
// ---------------------------------------------------------------------------------------------
function zusperren(familyId, entity) {
    const ent = String(entity || "").trim();
    if (!ENTITY_RE.test(ent) || ent.split(".")[0] !== "lock") throw new Error("Ungültiges Schloss.");
    const s = readSettings(loadRec(familyId));
    const known = s.gruppen.some(g => g.art === "schloss" && g.geraete.some(d => d.entity === ent));
    if (!known) throw new Error("Dieses Schloss gehört zu keiner Sicherheits-Gruppe.");
    const S = smart();
    S.haCall(S.haOf(familyId), ent, "lock.lock", {});
    dropCache(familyId);
    return { ok: true };
}
// true = this profile is a child (member with the kids' page / role "Kind") - children may not lock
function isChildProfile(userRec) {
    try {
        const mid = userRec.getString("mitglied");
        if (!mid) return false;
        const members = require(`${__hooks}/pinn-dashboard.js`).membersOf(userRec.getString("familie"));
        const m = members.find(x => x && x.id === mid);
        return require(`${__hooks}/pinn-push.js`).isChildMember(m);
    } catch (e) { return false; }
}

// ---------------------------------------------------------------------------------------------
// Evening check (cron every minute; cheap unless a family switched it on)
// ---------------------------------------------------------------------------------------------
function minutesOf(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
}
function abendCron() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "einstellungen ~ '\"an\":true'", "", 200, 0); } catch (e) { recs = []; }
    recs.forEach(rec => {
        try { abendFamily(rec); } catch (err) { console.log("[Sicherheit] Abend-Check fehlgeschlagen: " + err.message); }
    });
}
function abendFamily(rec) {
    const familyId = rec.getString("familie");
    const s = readSettings(rec);
    if (!s.abend.an) return;
    const groups = s.gruppen.filter(g => g.abend && g.geraete.length);
    if (!groups.length) return;
    const start = minutesOf(s.abend.zeit);
    if (start < 0) return;
    let admins = [];
    try { admins = $app.findRecordsByFilter("benutzer", "familie = {:f} && rolle = 'admin'", "", 50, 0, { f: familyId }); } catch (e) { admins = []; }
    if (!admins.length) return;
    const Z = require(`${__hooks}/pinn-zeit.js`);
    const sent = parseObj(rec.getString("gesendet"));
    const due = [];
    admins.forEach(u => {
        const w = Z.clockOfUser(u.id, familyId).wall();
        if (w.min < start || w.min >= start + ABEND_WINDOW_MIN) return;
        const key = w.iso + "|" + u.id;
        if (sent[key]) return;
        due.push({ u: u, key: key });
    });
    if (!due.length) return;
    // Remember first: even on an error along the way a message never comes twice
    const limit = Date.now() - SENT_DAYS * 86400000;
    Object.keys(sent).forEach(k => { const t = Date.parse(sent[k]); if (!t || t < limit) delete sent[k]; });
    due.forEach(x => { sent[x.key] = new Date().toISOString(); });
    rec.set("gesendet", JSON.stringify(sent));
    $app.save(rec);

    let map;
    try { map = statesOf(familyId, true); }
    catch (err) { console.log("[Sicherheit] Abend-Check: Home Assistant nicht erreichbar – " + err.message); return; }
    const open = groups.map(g => groupStatus(g, map, false))
        .filter(st => st.stufe === "warn" || st.stufe === "alarm");
    if (!open.length) return;
    const PT = require(`${__hooks}/pinn-pushtext.js`);
    const push = require(`${__hooks}/pinn-push.js`);
    const wg = PT.wohnformOf(familyId) === "wg";
    let n = 0;
    due.forEach(x => {
        const lang = PT.langOfUser(x.u);
        const lines = open.map(st => {
            const names = st.aktiv.map(d => st.art === "alarm" && !d.alarm
                ? d.name + " (" + (PT.tk(lang, "push.security.disarmed", {}, wg) || "unscharf") + ")"
                : d.name);
            return (st.icon || KIND_ICONS[st.art] || "") + " " + (st.name || "") + ": " + names.join(", ");
        });
        const titel = PT.tk(lang, "push.security.eveningTitle", {}, wg) || "🛡️ Noch nicht alles zu";
        try {
            n += push.notifyUser(x.u.id, { titel: titel, text: lines.join("\n"), url: "/", tag: "sicherheit-abend", urgency: "normal", roh: true }) || 0;
        } catch (err) { console.log("[Sicherheit] Push: " + err.message); }
    });
    if (n) console.log("[Sicherheit] Abend-Check: " + n + " Mitteilung(en) gesendet.");
}

module.exports = {
    COL, KINDS, DOMAINS,
    ensureSchema, cleanSettings, readSettings, einstellungen, speichern, status, entitaeten, zusperren,
    isChildProfile, deviceState, groupStatus, abendCron,
};
