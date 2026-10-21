// pb_hooks/pinn-smarthome.js
// Not a *.pb.js -> NOT loaded automatically as a hook, only included via require().
//
// Smart home (Settings → Smart home or Household → house icon)
//
// Devices (smartDevices in the family data) belong to one system:
//   - "shortcut": Apple Shortcuts. The app starts them by button; at fixed times a shortcut
//     "pinn Automatik" (iOS automation) fetches the due actions:
//       GET /api/pinn/smart/automatik?token=...  -> { aktionen: [{ kurzbefehl, eingabe, aktion, geraet, aufgabe, art }], wartend, ... }
//   - "ha": Home Assistant. This server calls the services itself (REST API with a long-lived token) –
//     by button from any device (Android too) and automatically by schedule (every minute).
//     With a status entity (e.g. vacuum.roborock) the queue waits until the device is really done.
//
// Room cleaning (robot vacuum, e.g. Roborock): action.ha.kind = "segments"
//   { entity: vacuum.…, rooms: "task" | [segment IDs], roomMap: { "16": "Wohnzimmer" }, mode: "vac" | "vacmop" | "mop",
//     fan, water, waterEntity, mopMode, mopModeEntity, repeat }
//   Before the start pinn. sets suction power and water amount (vacuum: water off, mop: suction off) and then sends
//   app_segment_clean with the rooms. "Room of the task" looks up the room name of the household task in the robot map.
//
// Rules (roomSchedules / trashBins, field smart):
//   smart.start: [action IDs]  buttons at the task
//   smart.done:  action ID      "When ticked off" (Home Assistant: the server runs it; Apple: the app, else the automation)
//   smart.auto:  { action, time: "HH:MM", abhaken }  automatically on the due date from that time
//
// One after another instead of at once: actions of the SAME device run in a queue (time, then
// order of the rooms). A device is busy
//   - for the entered duration (action.minutes) or
//   - with Home Assistant and a status entity, as long as it reports e.g. "cleaning"/"returning"
//     (after the start at least 2 minutes, until the robot has set off).
// Actions started by button make the device busy as well; if it is busy, the Home Assistant
// action is queued and starts automatically as soon as the device is free.
//
// Data per family: collection "smarthome_zugaenge" (locked, only via smarthome.pb.js):
//   familie, token (automation link for Apple, empty = off),
//   ha    = { url, token, version, ort }  (access to Home Assistant – never in the family data, never in the browser)
//   daten = { log: { "<task>:auto|done": ISO }, abruf, abrufAnzahl, belegt: { "<device>": { bis, aktion, status, pending, ok } },
//             schlange: [{ taskId, plantId, actionId, at, versuche }], pflanzen: { "<plant>": "YYYY-MM-DD" }, vac, sensor, aus, haLauf, haFehler }
// The server calculates times itself in German time (Europe/Berlin).

const COL = "smarthome_zugaenge";
const LOG_TAGE = 3;
const HA_ANLAUF_MS = 2 * 60000;          // after the start: the device counts as busy for at least this long
const HA_MAX_BELEGT_MS = 4 * 3600000;    // safety limit in case the status entity gets stuck
const HA_BUSY = ["cleaning", "returning", "paused", "on", "playing", "opening", "closing", "heat", "cool", "running", "mowing"];
const HA_DOMAINS = ["script", "scene", "automation", "button", "input_button", "vacuum", "lawn_mower", "light", "switch", "fan", "input_boolean", "cover", "media_player", "climate", "siren", "lock", "valve", "humidifier", "select", "sensor", "binary_sensor"];
// Robot vacuum: pinn. recognises the water amount ("mop intensity") and mop mode by the options of the select entity
const VAC_WATER_HINTS = ["low", "mild", "medium", "moderate", "high", "intense", "extreme", "max", "custom", "custom_water_flow"];
const VAC_MOPMODE_HINTS = ["standard", "deep", "deep_plus", "fast", "smart_mode"];
const VAC_WATER_DEFAULT = ["medium", "moderate", "standard", "low", "mild", "high"];
const VAC_FAN_DEFAULT = ["balanced", "standard", "medium", "turbo", "quiet"];
const WASTE_TYPES = [
    { id: "restmuell", icon: "\ud83d\uddd1\ufe0f", taskLabel: "Restmüll" },
    { id: "biomuell", icon: "\ud83c\udf42", taskLabel: "Biomüll" },
    { id: "papier", icon: "\ud83d\udce6", taskLabel: "Papiermüll" },
    { id: "gelbersack", icon: "\u267b\ufe0f", taskLabel: "Gelber Sack" },
    { id: "glas", icon: "\ud83c\udf7e", taskLabel: "Altglas" },
];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
// German time (CET/CEST) from a point in time, without relying on the time zone of the container
function berlin(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const lastSunday = (m) => {
        const x = new Date(Date.UTC(y, m + 1, 0, 1, 0, 0)); // last day of the month, 01:00 UTC
        x.setUTCDate(x.getUTCDate() - x.getUTCDay());
        return x.getTime();
    };
    const summer = ms >= lastSunday(2) && ms < lastSunday(9);
    const b = new Date(ms + (summer ? 2 : 1) * 3600000);
    return {
        iso: b.getUTCFullYear() + "-" + pad(b.getUTCMonth() + 1) + "-" + pad(b.getUTCDate()),
        hm: pad(b.getUTCHours()) + ":" + pad(b.getUTCMinutes()),
    };
}
function cleanTime(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m) return "";
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return "";
    return pad(h) + ":" + pad(mi);
}
function parseJson(res) {
    try { if (typeof res.raw === "string" && res.raw) return JSON.parse(res.raw); } catch (e) { /* continue */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* ignore */ }
    try { return JSON.parse(toString(res.body)); } catch (e) { /* ignore */ }
    return null;
}
function actionMinutes(action) {
    const m = parseInt(action && action.minutes, 10);
    return m > 0 && m <= 600 ? m : 0;
}
function deviceSystem(device) {
    return device && device.system === "ha" ? "ha" : "shortcut";
}

// ---------------------------------------------------------------------------------------------
// Collection "smarthome_zugaenge" (one record per family)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    let col = findCol(COL);
    if (!col) {
        try {
            $app.save(new Collection({
                type: "base",
                name: COL,
                fields: [
                    { name: "familie", type: "text", max: 40, required: true },
                    { name: "token", type: "text", max: 80 },
                    { name: "ha", type: "text", max: 8000 },
                    { name: "daten", type: "text", max: 200000 },
                    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
                ],
                indexes: [
                    "CREATE UNIQUE INDEX `idx_smarthome_familie` ON `" + COL + "` (`familie`)",
                    "CREATE INDEX `idx_smarthome_token` ON `" + COL + "` (`token`)",
                ],
                listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
            }));
            console.log("[Smarthome] Sammlung \"" + COL + "\" angelegt.");
        } catch (err) {
            console.log("[Smarthome] Konnte Sammlung nicht anlegen: " + err.message);
        }
        return;
    }
    // Older version without the Home Assistant field: add it
    if (!hasField(col, "ha")) {
        try {
            const tmp = new Collection({ type: "base", name: "pinn_tmp_ha", fields: [{ name: "ha", type: "text", max: 8000 }] });
            col.fields.add(tmp.fields.getByName("ha"));
            $app.save(col);
            console.log("[Smarthome] Feld \"ha\" ergänzt.");
        } catch (err) {
            console.log("[Smarthome] Feld \"ha\" nicht anlegbar: " + err.message);
        }
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
        rec.set("token", "");
        rec.set("daten", JSON.stringify({ log: {}, belegt: {}, schlange: [] }));
    }
    return rec;
}
function loadRecByToken(token) {
    const t = String(token || "").trim();
    if (t.length < 24 || !/^[A-Za-z0-9]+$/.test(t) || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "token = {:t}", { t: t }); } catch (e) { return null; }
}
function readData(rec) {
    let d = null;
    try { d = JSON.parse((rec && rec.getString("daten")) || "{}"); } catch (e) { d = null; }
    if (!d || typeof d !== "object") d = {};
    if (!d.log || typeof d.log !== "object") d.log = {};
    if (!d.belegt || typeof d.belegt !== "object") d.belegt = {};
    if (!Array.isArray(d.schlange)) d.schlange = [];
    if (!d.pflanzen || typeof d.pflanzen !== "object") d.pflanzen = {};
    if (!d.vac || typeof d.vac !== "object") d.vac = {};
    if (!d.sensor || typeof d.sensor !== "object") d.sensor = {};
    if (!Array.isArray(d.aus)) d.aus = [];
    return d;
}
function writeData(rec, data) {
    rec.set("daten", JSON.stringify(data));
    $app.save(rec);
}
function readHa(rec) {
    try {
        const h = JSON.parse((rec && rec.getString("ha")) || "{}");
        return h && h.url && h.token ? h : null;
    } catch (e) { return null; }
}
function pruneLog(data) {
    const limit = Date.now() - LOG_TAGE * 86400000;
    Object.keys(data.log).forEach(k => {
        const t = Date.parse(data.log[k]);
        if (!t || t < limit) delete data.log[k];
    });
    data.schlange = data.schlange.filter(q => q && q.at && Date.parse(q.at) > Date.now() - 12 * 3600000);
    // Plants started by pinn.: keep 30 days (the app takes the date over as "last watered/mowed")
    const old = berlin(Date.now() - 30 * 86400000).iso;
    Object.keys(data.pflanzen || {}).forEach(k => { if (!(data.pflanzen[k] > old)) delete data.pflanzen[k]; });
    data.aus = (data.aus || []).filter(x => x && x.at && x.at > Date.now() - 6 * 3600000);
}
function newToken() {
    try { return $security.randomString(40); } catch (e) { /* continue */ }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 40; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// ---------------------------------------------------------------------------------------------
// Family data (only the smart home part, cached until the next change)
// ---------------------------------------------------------------------------------------------
function familyStamp(familyId) {
    try {
        const m = new DynamicModel({ updated: "" });
        $app.db().newQuery("SELECT updated FROM familien_daten WHERE familie = {:f} LIMIT 1").bind({ f: String(familyId) }).one(m);
        return String(m.updated || "");
    } catch (e) { return ""; }
}
function familyData(familyId) {
    const key = "pinnSmartData:" + familyId;
    const stamp = familyStamp(familyId);
    try {
        const c = $app.store().get(key);
        if (c && stamp && c.stamp === stamp) return c.data;
    } catch (e) { /* continue */ }
    let full = {};
    try {
        const rec = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
        full = require(`${__hooks}/calendar-sync.js`).parseRecordData(rec.get("data")) || {};
    } catch (e) { full = {}; }
    const data = {
        rooms: Array.isArray(full.rooms) ? full.rooms : [],
        cleaningCategories: Array.isArray(full.cleaningCategories) ? full.cleaningCategories : [],
        roomSchedules: Array.isArray(full.roomSchedules) ? full.roomSchedules : [],
        trashBins: Array.isArray(full.trashBins) ? full.trashBins : [],
        smartDevices: Array.isArray(full.smartDevices) ? full.smartDevices : [],
        // Home → garden & plants (1.62): watering / mowing with a smart action
        plants: full.finance && Array.isArray(full.finance.homePlants) ? full.finance.homePlants.filter(p => p && p.id && p.smart) : [],
    };
    try { $app.store().set(key, { stamp: stamp, data: data }); } catch (e) { /* ignore */ }
    return data;
}
function ruleTitles(data) {
    const rooms = data.rooms;
    const roomOf = id => rooms.find(r => r && r.id === id) || null;
    const out = [];
    data.roomSchedules.forEach(s => {
        if (!s || !s.smart) return;
        const room = roomOf(s.roomId);
        const cat = data.cleaningCategories.find(c => c && c.id === s.category);
        out.push({ title: (cat ? cat.label : "Reinigung") + ": " + (room ? room.name : "Unbekannt"), rule: s, room: room, order: (room ? rooms.indexOf(room) : 999) * 1000 + out.length });
    });
    data.trashBins.forEach(b => {
        if (!b || !b.smart) return;
        const room = roomOf(b.roomId);
        const wt = WASTE_TYPES.find(w => w.id === b.wasteType);
        out.push({ title: (wt ? wt.icon : "\ud83d\uddd1\ufe0f") + " " + (wt ? wt.taskLabel : "Müll") + " rausbringen: " + (room ? room.name : "Unbekannt"), rule: b, room: room, order: (room ? rooms.indexOf(room) : 999) * 1000 + out.length });
    });
    return out;
}
function actionById(data, id) {
    if (!id) return null;
    for (const d of data.smartDevices) {
        const a = (d && Array.isArray(d.actions) ? d.actions : []).find(x => x && x.id === id);
        if (a) return { device: d, action: a };
    }
    return null;
}
function listTasks(familyId) {
    try { return require(`${__hooks}/pinn-aufgaben.js`).listAll(familyId) || []; } catch (e) { return []; }
}
function setTaskDone(familyId, task) {
    try {
        require(`${__hooks}/pinn-aufgaben.js`).setDone(familyId, task.id, true, "");
        task.done = true;
        task.doneAt = new Date().toISOString();
    } catch (err) {
        console.log("[Smarthome] Abhaken fehlgeschlagen: " + err.message);
    }
}
function canRun(hit) {
    if (!hit) return false;
    if (deviceSystem(hit.device) === "ha") return !!(hit.action.ha && hit.action.ha.entity && hit.action.ha.service);
    return !!hit.action.shortcut;
}

// ---------------------------------------------------------------------------------------------
// Home Assistant
// ---------------------------------------------------------------------------------------------
// Take the address as typed into the browser: "192.168.178.10", "192.168.178.10:8123",
// "http://…" or a copied page (the path is ignored). Without http(s):// or without a port the
// server tries the usual variants (port 8123, port 80, https).
function haCandidates(v) {
    const raw = String(v || "").trim().replace(/\s+/g, "");
    const m = /^(?:(https?):\/\/)?([^\/?#]+)/i.exec(raw);
    if (!m || !m[2]) throw new Error("Bitte die Adresse von Home Assistant eingeben, z. B. 192.168.178.10");
    const scheme = m[1] ? m[1].toLowerCase() : "";
    const host = m[2];
    if (/\.local(:\d+)?$/i.test(host)) {
        throw new Error("„" + host + "“ funktioniert im pinn.-Server nicht (.local-Namen löst Docker nicht auf). Bitte die IP-Adresse von Home Assistant eingeben, z. B. 192.168.178.10 – zu finden in Home Assistant unter Einstellungen → System → Netzwerk oder in deinem Router.");
    }
    const hasPort = /:\d+$/.test(host) && !/^\[.*\]$/.test(host);
    const out = [];
    const add = u => { if (out.indexOf(u) < 0) out.push(u); };
    if (scheme) {
        add(scheme + "://" + host);
        if (!hasPort && scheme === "http") add("http://" + host + ":8123");
    } else if (hasPort) {
        add("http://" + host);
        add("https://" + host);
    } else {
        add("http://" + host + ":8123");
        add("http://" + host);
        add("https://" + host);
        add("https://" + host + ":8123");
    }
    return out;
}
// Take the token as pasted - also with "Bearer " or "Authorization: Bearer " in front
// and with line breaks. pinn. adds "Bearer " itself when sending.
function cleanHaToken(v) {
    return String(v || "").trim()
        .replace(/^authorization\s*:\s*/i, "")
        .replace(/^bearer\s+/i, "")
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}
// Check one address: { ok } | { abgelehnt } (Home Assistant found, wrong token) | { fehlt }
function haProbe(url, token) {
    let res;
    try {
        res = $http.send({
            url: url + "/api/", method: "GET", timeout: 6,
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        });
    } catch (err) {
        return { fehlt: true, grund: "nicht erreichbar" };
    }
    const body = parseJson(res);
    if (res.statusCode === 200 && body && body.message) return { ok: true };
    if (res.statusCode === 401 || res.statusCode === 403) return { abgelehnt: true };
    return { fehlt: true, grund: "Status " + res.statusCode };
}
function haRequest(ha, method, path, body) {
    let res;
    try {
        res = $http.send({
            url: ha.url + path, method: method, timeout: 12,
            headers: { "Authorization": "Bearer " + cleanHaToken(ha.token), "Content-Type": "application/json" },
            body: body === undefined ? "" : JSON.stringify(body),
        });
    } catch (err) {
        throw new Error("Home Assistant nicht erreichbar (" + ha.url + "). Läuft es und ist die Adresse vom NAS aus erreichbar?");
    }
    if (res.statusCode === 401 || res.statusCode === 403) throw new Error("Home Assistant lehnt den Zugang ab – Token prüfen.");
    if (res.statusCode === 404) throw new Error("Nicht gefunden (" + path + ") – Entität oder Dienst prüfen.");
    if (res.statusCode === 400) {
        const b = parseJson(res);
        throw new Error("Home Assistant: " + ((b && b.message) || "ungültige Anfrage") + ".");
    }
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error("Home Assistant antwortet mit Status " + res.statusCode + ".");
    return parseJson(res);
}
function haCall(ha, entity, service, data) {
    const svc = String(service || "").trim();
    const ent = String(entity || "").trim();
    let domain, name;
    if (svc.indexOf(".") > 0) { domain = svc.split(".")[0]; name = svc.split(".").slice(1).join("."); }
    else { domain = ent.split(".")[0]; name = svc; }
    if (!/^[a-z0-9_]+$/.test(domain || "") || !/^[a-z0-9_]+$/.test(name || "")) throw new Error("Ungültiger Dienst: " + svc);
    const body = Object.assign({}, data && typeof data === "object" && !Array.isArray(data) ? data : {});
    if (ent) body.entity_id = ent;
    haRequest(ha, "POST", "/api/services/" + domain + "/" + name, body);
}
function haState(ha, entity) {
    const s = haRequest(ha, "GET", "/api/states/" + encodeURIComponent(entity));
    return s && s.state ? String(s.state) : "";
}
function haStateFull(ha, entity) {
    const s = haRequest(ha, "GET", "/api/states/" + encodeURIComponent(entity));
    return s && typeof s === "object" ? s : {};
}
// Switch-off service after a duration (watering: close the valve, turn the switch off again)
function offServiceFor(service) {
    const svc = String(service || "");
    if (svc === "valve.open_valve") return "valve.close_valve";
    const m = /^(switch|light|fan|input_boolean|humidifier|siren)\.turn_on$/.exec(svc);
    return m ? m[1] + ".turn_off" : "";
}
function scheduleOff(store, hit, now) {
    const a = hit.action.ha || {};
    const min = actionMinutes(hit.action);
    const off = offServiceFor(a.service);
    if (!a.offAfter || !min || !off || !a.entity) return;
    store.aus = (store.aus || []).filter(x => !(x.entity === a.entity && x.service === off));
    store.aus.push({ entity: String(a.entity), service: off, at: now + min * 60000, aktion: String(hit.action.label || "") });
}
function runScheduledOff(store, ha, now, fehler) {
    const due = (store.aus || []).filter(x => x.at <= now);
    if (!due.length) return;
    store.aus = store.aus.filter(x => x.at > now);
    due.forEach(x => {
        try { haCall(ha, x.entity, x.service, {}); }
        catch (err) { fehler.push((x.aktion || x.entity) + " (aus): " + err.message); }
    });
}
function runHaAction(ha, hit, inputText) {
    const a = hit.action.ha || {};
    if (a.kind === "segments") { runVacuumSegments(ha, a, inputText); return; }
    let data = a.data;
    if (typeof data === "string") { try { data = data.trim() ? JSON.parse(data) : {}; } catch (e) { throw new Error("Die Zusatzdaten sind kein gültiges JSON."); } }
    // Room name as a variable for scripts: {{ raum }} in Home Assistant
    if (a.service === "script.turn_on" || /^script\./.test(a.service || "")) {
        data = Object.assign({}, data || {});
        if (a.service === "script.turn_on") data.variables = Object.assign({ raum: inputText || "" }, data.variables || {});
    }
    haCall(ha, a.entity, a.service, data);
}

// ---------------------------------------------------------------------------------------------
// Robot vacuum: rooms from the map, suction power / water amount and room cleaning
// ---------------------------------------------------------------------------------------------
function haStates(ha) {
    const list = haRequest(ha, "GET", "/api/states") || [];
    return Array.isArray(list) ? list : [];
}
// All entities of the same device (via the template API of Home Assistant), else the same name prefix
function deviceEntityIds(ha, vac, states) {
    try {
        const ids = haRequest(ha, "POST", "/api/template", { template: "{{ device_entities(device_id('" + vac + "')) | tojson }}" });
        if (Array.isArray(ids) && ids.length) return ids.map(String);
    } catch (e) { /* continue with the name prefix */ }
    const obj = vac.split(".")[1] || "";
    return states.map(s => String(s.entity_id || "")).filter(id => id === vac || (id.split(".")[1] || "").indexOf(obj + "_") === 0);
}
function selectInfo(s) {
    const attrs = (s && s.attributes) || {};
    return {
        id: String(s.entity_id), name: String(attrs.friendly_name || s.entity_id), state: String(s.state || ""),
        options: Array.isArray(attrs.options) ? attrs.options.map(String) : [],
    };
}
function isWaterSelect(sel) {
    return sel.options.indexOf("off") >= 0 && sel.options.some(o => VAC_WATER_HINTS.indexOf(o) >= 0);
}
function isMopModeSelect(sel) {
    return sel.options.indexOf("off") < 0 && sel.options.filter(o => VAC_MOPMODE_HINTS.indexOf(o) >= 0).length >= 2;
}
// Rooms from the robot map (Roborock integration: service roborock.get_maps with response)
function haRooms(ha, vac) {
    const r = haRequest(ha, "POST", "/api/services/roborock/get_maps?return_response", { entity_id: vac });
    const resp = (r && r.service_response) || r || {};
    const forVac = resp[vac] || resp[Object.keys(resp)[0]] || {};
    const maps = Array.isArray(forVac.maps) ? forVac.maps : (Array.isArray(forVac) ? forVac : []);
    const out = [];
    maps.forEach(m => {
        const mapName = String((m && m.name) || "");
        const rooms = m && m.rooms;
        if (Array.isArray(rooms)) {
            rooms.forEach(x => {
                const id = parseInt(x && (x.id !== undefined ? x.id : x.segment_id), 10);
                if (id > 0) out.push({ id: id, name: String((x && x.name) || ("Raum " + id)), map: mapName });
            });
        } else if (rooms && typeof rooms === "object") {
            Object.keys(rooms).forEach(k => {
                const id = parseInt(k, 10);
                const v = rooms[k];
                if (id > 0) out.push({ id: id, name: String((v && typeof v === "object" ? v.name : v) || ("Raum " + id)), map: mapName });
            });
        }
    });
    return out;
}
function normRoom(v) {
    return String(v || "").toLowerCase()
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
        .replace(/[^a-z0-9]/g, "");
}
// Find the room name of the task among the rooms of the map (exact, else contained)
function matchRoom(list, raumName) {
    const n = normRoom(raumName);
    if (!n) return [];
    let hit = list.filter(r => normRoom(r.name) === n);
    if (!hit.length) hit = list.filter(r => { const x = normRoom(r.name); return x && (x.indexOf(n) >= 0 || n.indexOf(x) >= 0); });
    return hit.map(r => r.id);
}
function runVacuumSegments(ha, a, raumName) {
    const vac = String(a.entity || "").trim();
    if (!/^vacuum\.[a-z0-9_]+$/.test(vac)) throw new Error("Bitte beim Gerät den Saugroboter (vacuum.…) wählen.");
    let segs = [];
    if (Array.isArray(a.rooms) && a.rooms.length) {
        segs = a.rooms.map(x => parseInt(x, 10)).filter(x => x > 0);
    } else {
        if (!raumName) throw new Error("Kein Raum: Die Aktion nimmt den Raum der Haushalt-Aufgabe – bitte über eine Reinigung starten oder feste Räume wählen.");
        const map = a.roomMap && typeof a.roomMap === "object" ? a.roomMap : {};
        let list = Object.keys(map).map(k => ({ id: parseInt(k, 10), name: String(map[k]) })).filter(r => r.id > 0);
        segs = matchRoom(list, raumName);
        if (!segs.length) {
            try { list = haRooms(ha, vac); } catch (e) { /* keep the stored list */ }
            segs = matchRoom(list, raumName);
        }
        if (!segs.length) {
            throw new Error("Raum „" + raumName + "“ gibt es in der Karte des Saugroboters nicht" + (list.length ? " (vorhanden: " + list.map(r => r.name).join(", ") + ")" : "") + ". Raum in der Roborock-App gleich benennen oder an der Aktion feste Räume wählen.");
        }
    }
    if (!segs.length) throw new Error("Keine Räume gewählt.");
    const mode = a.mode === "mop" || a.mode === "vac" ? a.mode : "vacmop";
    const repeat = Math.min(3, Math.max(1, parseInt(a.repeat, 10) || 1));

    // Set suction power and water amount to match the mode
    let states = [];
    try { states = haStates(ha); } catch (e) { states = []; }
    const stateOf = id => states.find(s => s && s.entity_id === id) || null;
    const vs = stateOf(vac);
    const fanList = vs && vs.attributes && Array.isArray(vs.attributes.fan_speed_list) ? vs.attributes.fan_speed_list.map(String) : [];
    const fanNow = vs && vs.attributes ? String(vs.attributes.fan_speed || "") : "";
    let waterId = String(a.waterEntity || "");
    let mopModeId = String(a.mopModeEntity || "");
    if (!waterId && states.length) {
        const ids = deviceEntityIds(ha, vac, states);
        const sel = states.filter(s => ids.indexOf(String(s.entity_id)) >= 0 && /^select\./.test(String(s.entity_id))).map(selectInfo);
        const w = sel.find(isWaterSelect);
        if (w) waterId = w.id;
        if (!mopModeId) { const m = sel.find(isMopModeSelect); if (m) mopModeId = m.id; }
    }
    const water = waterId && stateOf(waterId) ? selectInfo(stateOf(waterId)) : null;

    const pickFirst = (list, prefs, not) => prefs.find(p => list.indexOf(p) >= 0) || list.find(o => o !== not) || "";
    if (mode === "vac") {
        if (water && water.options.indexOf("off") >= 0) {
            if (water.state !== "off") haCall(ha, water.id, "select.select_option", { option: "off" });
        } else if (waterId) {
            throw new Error("Wasser lässt sich bei diesem Roboter nicht abschalten – nur Saugen geht hier nicht.");
        }
        let fan = a.fan && fanList.indexOf(a.fan) >= 0 ? a.fan : "";
        if (!fan && fanNow === "off") fan = pickFirst(fanList, VAC_FAN_DEFAULT, "off");
        if (fan && fan !== "off" && fan !== fanNow) haCall(ha, vac, "vacuum.set_fan_speed", { fan_speed: fan });
    } else {
        if (water) {
            let w = a.water && water.options.indexOf(a.water) >= 0 ? a.water : "";
            if (!w && water.state === "off") w = pickFirst(water.options, VAC_WATER_DEFAULT, "off");
            if (w && w !== water.state) haCall(ha, water.id, "select.select_option", { option: w });
        }
        if (mode === "mop") {
            if (fanList.indexOf("off") >= 0) { if (fanNow !== "off") haCall(ha, vac, "vacuum.set_fan_speed", { fan_speed: "off" }); }
            else throw new Error("Saugen lässt sich bei diesem Roboter nicht abschalten – nur Wischen geht hier nicht.");
        } else {
            let fan = a.fan && fanList.indexOf(a.fan) >= 0 && a.fan !== "off" ? a.fan : "";
            if (!fan && fanNow === "off") fan = pickFirst(fanList, VAC_FAN_DEFAULT, "off");
            if (fan && fan !== fanNow) haCall(ha, vac, "vacuum.set_fan_speed", { fan_speed: fan });
        }
        if (a.mopMode && mopModeId && stateOf(mopModeId)) {
            const mm = selectInfo(stateOf(mopModeId));
            if (mm.options.indexOf(a.mopMode) >= 0 && mm.state !== a.mopMode) haCall(ha, mm.id, "select.select_option", { option: a.mopMode });
        }
    }
    haCall(ha, vac, "vacuum.send_command", { command: "app_segment_clean", params: [{ segments: segs, repeat: repeat }] });
}
// For the device popup: rooms, suction levels, water amount, mop mode and sensors of the robot vacuum
function haSauger(familyId, body) {
    const ha = haOf(familyId);
    const vac = String(body.entity || "").trim();
    if (!/^vacuum\.[a-z0-9_]+$/.test(vac)) throw new Error("Bitte den Saugroboter wählen (vacuum.…).");
    const states = haStates(ha);
    const vs = states.find(s => s && s.entity_id === vac);
    if (!vs) throw new Error("Saugroboter nicht gefunden: " + vac);
    const attrs = vs.attributes || {};
    const ids = deviceEntityIds(ha, vac, states);
    const own = states.filter(s => ids.indexOf(String(s.entity_id)) >= 0);
    const selects = own.filter(s => /^select\./.test(String(s.entity_id))).map(selectInfo);
    const water = selects.find(isWaterSelect) || null;
    const mopMode = selects.find(isMopModeSelect) || null;
    let raeume = [], raeumeFehler = "";
    try { raeume = haRooms(ha, vac); } catch (e) { raeumeFehler = e.message; }
    if (!raeume.length && !raeumeFehler) raeumeFehler = "Die Karte enthält keine Räume – in der Roborock-App die Karte aufteilen und Räume benennen.";
    const sensoren = own.filter(s => /^(sensor|binary_sensor)\./.test(String(s.entity_id))).slice(0, 60).map(s => ({
        id: String(s.entity_id), name: String((s.attributes && s.attributes.friendly_name) || s.entity_id),
        state: String(s.state || ""), unit: String((s.attributes && s.attributes.unit_of_measurement) || ""),
    }));
    return {
        entity: vac, name: String(attrs.friendly_name || vac), state: String(vs.state || ""),
        akku: attrs.battery_level !== undefined ? attrs.battery_level : null,
        fanSpeeds: Array.isArray(attrs.fan_speed_list) ? attrs.fan_speed_list.map(String) : [], fan: String(attrs.fan_speed || ""),
        water: water, mopMode: mopMode, raeume: raeume, raeumeFehler: raeumeFehler, sensoren: sensoren,
    };
}

// ---------------------------------------------------------------------------------------------
// Robot vacuums and lawn mowers: live state from Home Assistant (1.62)
// The vacuum entity alone says "docked" while the station washes the mop, empties the bin or dries –
// and also during a wash in the middle of a job. The status sensor of the Roborock integration
// (sensor.<robot>_status) tells these phases apart, so a queued job starts right when the running one
// ends (while the robot is still on its way back) instead of being sent to a busy station and lost.
// ---------------------------------------------------------------------------------------------
const VAC_RUN = ["starting", "cleaning", "segment_cleaning", "zoned_cleaning", "spot_cleaning", "going_to_target", "remote_control_active",
    "manual_mode", "mapping", "room_mopping", "room_clean_mopping", "clean_mop_cleaning", "clean_mop_mopping", "room_clean_mopping_cleaning",
    "paused", "patrol", "egg_attack"];
const VAC_MID = ["going_to_wash_the_mop"];
const VAC_END = ["returning_home", "docking", "emptying_the_bin", "charging", "charging_complete", "idle", "air_drying_stopping",
    "charger_disconnected", "back_to_dock_washing_duster", "drying"];
const MOWER_BUSY = ["mowing", "paused"];
// Error states (vacuum entity "error" or the Roborock status sensor): the robot stopped, e.g. a room could not
// be reached because a door was closed. The job is then given up – never repeated – and reported.
const VAC_ERROR = ["error", "in_error", "charging_problem"];
// Idle at the dock: only in these states a job that never started may be sent again
const VAC_IDLE = ["charging", "charging_complete", "idle", "docked", "charger_disconnected"];
function liveDomain(device) {
    const d = String((device && device.statusEntity) || "").split(".")[0];
    return d === "vacuum" || d === "lawn_mower" ? d : "";
}
// Find the detailed status sensor of a robot vacuum once a day (cheap guess first, then the device's entities)
function vacStatusSensor(ha, store, vac, now) {
    const c = store.sensor[vac];
    if (c && c.at && now - c.at < 86400000) return c.id || "";
    let id = "";
    const isCode = v => /^[a-z][a-z0-9_]*$/.test(String(v || "")) && v !== "unknown" && v !== "unavailable";
    const guess = "sensor." + (vac.split(".")[1] || "") + "_status";
    try { if (isCode(haState(ha, guess))) id = guess; } catch (e) { id = ""; }
    if (!id) {
        try {
            const ids = haRequest(ha, "POST", "/api/template", { template: "{{ device_entities(device_id('" + vac + "')) | tojson }}" });
            const cand = (Array.isArray(ids) ? ids.map(String) : []).filter(x => /^sensor\..*_status$/.test(x));
            for (const x of cand) { try { if (isCode(haState(ha, x))) { id = x; break; } } catch (e) { /* next one */ } }
        } catch (e) { /* no template API - vacuum state only */ }
    }
    store.sensor[vac] = { id: id, at: now };
    return id;
}
// { busy, end, state } – end = the job is over (returning, docking, station work), the next one may start
function liveState(ha, store, device, now) {
    const ent = String(device.statusEntity || "");
    const dom = liveDomain(device);
    const mem = store.vac[device.id] || (store.vac[device.id] = {});
    let state = "";
    try { state = haState(ha, ent); } catch (e) { return { busy: false, end: false, state: "", error: e.message }; }
    if (dom === "lawn_mower") {
        if (state === "error") { mem.err = true; return { busy: true, end: false, state: state, error: true }; }
        mem.err = false;
        // Returning to the dock counts as "done": the next mowing job may start right away
        return { busy: MOWER_BUSY.indexOf(state) >= 0, end: state === "returning", state: state };
    }
    let detail = "";
    const sid = vacStatusSensor(ha, store, ent, now);
    if (sid) { try { detail = haState(ha, sid); } catch (e) { detail = ""; } }
    // Error: the robot waits for help. Further jobs wait until it is back at the dock (no new start while it is
    // still standing somewhere in the flat or on its way back after the error).
    if (state === "error" || VAC_ERROR.indexOf(detail) >= 0) {
        mem.err = true; mem.job = false; mem.end = false;
        return { busy: true, end: false, state: detail || state, error: true };
    }
    if (mem.err) {
        if (state === "docked" || detail === "charging" || detail === "charging_complete") mem.err = false;
        else return { busy: true, end: false, state: detail || state, afterError: true };
    }
    if (detail && detail !== "unknown" && detail !== "unavailable") {
        if (VAC_RUN.indexOf(detail) >= 0 || VAC_MID.indexOf(detail) >= 0) { mem.job = true; mem.end = false; return { busy: true, end: false, state: detail }; }
        if (detail === "washing_the_mop") return mem.end ? { busy: false, end: true, state: detail } : { busy: true, end: false, state: detail };
        if (VAC_END.indexOf(detail) >= 0) { mem.end = true; mem.job = false; return { busy: false, end: true, state: detail }; }
        return { busy: false, end: false, state: detail };
    }
    // Without the status sensor: "returning" only ends a job for sure when nothing was mopped
    if (state === "cleaning" || state === "paused") { mem.job = true; mem.end = false; return { busy: true, end: false, state: state }; }
    if (state === "returning") return mem.mode === "vac" ? { busy: false, end: true, state: state } : { busy: true, end: false, state: state };
    mem.end = true;
    return { busy: false, end: false, state: state };
}

// Is the device busy right now? (duration, status entity, or live state of a robot)
function deviceBusy(store, device, ha, now) {
    const b = store.belegt[device.id];
    const live = ha && deviceSystem(device) === "ha" && liveDomain(device) ? liveState(ha, store, device, now) : null;
    // The robot took the job: it drives, cleans or is already working on it at the station (washing the mop
    // before mopping). Before 1.103 only driving/cleaning counted – a long mop wash then looked like
    // "not accepted" and the job ran a second time later (the last room was mopped again).
    // liveState counts a mop wash as busy only within a job, not the wash after the previous one.
    if (live && b && !b.ok && !live.error && !live.afterError && (live.busy || VAC_RUN.indexOf(live.state) >= 0)) b.ok = true;
    // Error during a job started by pinn. (e.g. door closed): give the job up, report it once, never repeat it
    if (live && live.error && b && !b.fehler) {
        b.fehler = true;
        b.ok = true;
        delete b.pending;
        store.haFehler = { at: new Date(now).toISOString(), text: (device.name || "") + ": " + (b.aktion || "") + " – der Roboter meldet einen Fehler (z. B. Raum nicht erreichbar, Tür zu?). Der Auftrag wurde abgebrochen und wird nicht wiederholt." };
    }
    if (b && b.bis > now) return b;
    // Started by pinn., but the robot never got going (e.g. the station was busy): put the job back in front.
    // Only when the robot really stands idle at the dock – while it works at the station or after an error it waits.
    if (b && b.pending && !b.ok && now - b.seit < HA_ANLAUF_MS + 4 * 60000) {
        if (live && VAC_IDLE.indexOf(live.state) < 0 && live.state !== "docked") return Object.assign({ bis: 0 }, b, { zustand: live.state });
        const p = b.pending;
        delete store.belegt[device.id];
        if ((p.versuche || 0) < 3) {
            // Keep its place: the original start time, so it is not queued behind later jobs
            store.schlange.unshift({ taskId: p.taskId || "", plantId: p.plantId || "", actionId: p.actionId, at: new Date(b.seit || now).toISOString(), versuche: (p.versuche || 0) + 1 });
        } else {
            store.haFehler = { at: new Date(now).toISOString(), text: (device.name || "") + ": " + (p.label || "") + " – das Gerät hat den Auftrag dreimal nicht angenommen." };
        }
        return { bis: 0, aktion: p.label || "", zustand: live ? live.state : "", retry: true };
    }
    if (live) {
        if (live.busy && (!b || !b.seit || now - b.seit < HA_MAX_BELEGT_MS)) return Object.assign({ bis: 0, aktion: b ? b.aktion : "" }, b || {}, { zustand: live.state });
        delete store.belegt[device.id];
        return null;
    }
    if (!b) return null;
    if (b.status && ha && deviceSystem(device) === "ha" && device.statusEntity && b.seit && now - b.seit < HA_MAX_BELEGT_MS) {
        let state = "";
        try { state = haState(ha, device.statusEntity); } catch (e) { state = ""; }
        if (HA_BUSY.indexOf(state) >= 0) return Object.assign({}, b, { zustand: state });
    }
    delete store.belegt[device.id];
    return null;
}
function markBusy(store, hit, now, pending) {
    const min = actionMinutes(hit.action);
    const status = deviceSystem(hit.device) === "ha" && !!hit.device.statusEntity;
    if (!min && !status) return;
    const bis = now + Math.max(min * 60000, status ? HA_ANLAUF_MS : 0);
    const b = { bis: bis, seit: now, status: status, aktion: hit.action.label || "" };
    // Robots: remember the job until the robot really started (see deviceBusy)
    if (pending && liveDomain(hit.device)) b.pending = Object.assign({ label: hit.action.label || "" }, pending);
    store.belegt[hit.device.id] = b;
    if (liveDomain(hit.device) === "vacuum") {
        const mem = store.vac[hit.device.id] || (store.vac[hit.device.id] = {});
        mem.mode = hit.action.ha && hit.action.ha.kind === "segments" ? (hit.action.ha.mode || "vacmop") : "";
        mem.end = false;
    }
}

// ---------------------------------------------------------------------------------------------
// Plants (Home → garden & plants): is watering or mowing due today? Same rules as the app:
// rain from 4 mm (yesterday, the day before or today) counts as watered for outdoor plants that get
// rain, from 28 °C outdoor plants need water twice as often. Mowing waits on rainy days.
// ---------------------------------------------------------------------------------------------
function isIsoDay(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function addDaysIso(iso, n) {
    const p = iso.split("-").map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]) + n * 86400000).toISOString().slice(0, 10);
}
function plantInSeason(p, iso) {
    if (!Array.isArray(p.months) || p.months.length !== 2) return true;
    const m = Number(iso.slice(5, 7)), a = Number(p.months[0]), b = Number(p.months[1]);
    if (!(a >= 1 && a <= 12 && b >= 1 && b <= 12)) return true;
    return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
}
function plantDue(p, store, wx, today) {
    if (!plantInSeason(p, today)) return false;
    const mow = p.act === "mow";
    let last = isIsoDay(p.last) && p.last <= today ? p.last : "";
    const srv = store.pflanzen[p.id];
    if (srv && srv > last && srv <= today) last = srv;
    if (last === today) return false;
    const outdoor = p.place === "balkon" || p.place === "garten";
    const days = wx ? (wx.vergangen || []).concat((wx.tage || []).filter(d => d && d.date === today)) : [];
    const todayWx = wx ? (wx.tage || []).find(d => d && d.date === today) || null : null;
    if (mow) {
        // Wet grass: no mowing today, it stays due for tomorrow
        if (todayWx && Number(todayWx.mm) >= 2 && (todayWx.rain == null || Number(todayWx.rain) >= 60)) return false;
    } else if (p.rain && outdoor) {
        let rained = false;
        days.forEach(d => {
            if (!d || !isIsoDay(d.date) || d.date > today || !(Number(d.mm) >= 4)) return;
            if (d.date === today && d.rain != null && Number(d.rain) < 60) return;
            if (!last || d.date > last) { last = d.date; rained = true; }
        });
        if (last === today) return false;
        if (rained) { /* rain counts as watering */ }
    }
    let every = Math.max(1, Number(p.every) || 7);
    if (!mow && outdoor && todayWx && Number(todayWx.max) >= 28) every = Math.max(1, Math.ceil(every / 2));
    const next = last ? addDaysIso(last, every) : today;
    return next <= today;
}

// ---------------------------------------------------------------------------------------------
// Determine and run the due actions of one family
// system: "shortcut" -> only collect (the Apple shortcut starts them), "ha" -> run here
// ---------------------------------------------------------------------------------------------
function processFamily(familyId, rec, store, system, ha) {
    const now = Date.now();
    const jetzt = berlin(now);
    const data = familyData(familyId);
    const ofSystem = hit => hit && deviceSystem(hit.device) === system && canRun(hit);
    if (!data.smartDevices.some(d => deviceSystem(d) === system)) return { aktionen: [], wartend: [], fehler: [] };

    const regeln = ruleTitles(data);
    const tasks = listTasks(familyId);
    const regelOf = task => regeln.find(r => r.title === String(task.title || "").trim()) || null;
    const aktionen = [], wartend = [], fehler = [];
    if (system === "ha") runScheduledOff(store, ha, now, fehler);
    // Did the robots started a moment ago really get going? (otherwise the job goes back into the queue)
    if (system === "ha") Object.keys(store.belegt).forEach(id => {
        const b = store.belegt[id];
        const dev = data.smartDevices.find(d => d && d.id === id);
        if (b && b.pending && !b.ok && dev && now - b.seit < HA_ANLAUF_MS + 4 * 60000) deviceBusy(store, dev, ha, now);
    });

    const ausfuehren = (hit, task, regel, art, plant) => {
        const eingabe = regel && regel.room ? String(regel.room.name || "") : "";
        if (system === "ha") {
            try { runHaAction(ha, hit, eingabe); }
            catch (err) { fehler.push(hit.action.label + ": " + err.message); return false; }
            scheduleOff(store, hit, now);
        }
        if (plant) store.pflanzen[plant.id] = jetzt.iso;
        aktionen.push({
            kurzbefehl: String(hit.action.shortcut || ""), eingabe: eingabe,
            aktion: String(hit.action.label || ""), geraet: String(hit.device.name || ""),
            aufgabe: String(task ? task.title || "" : (plant ? plant.name || "" : "")), art: art,
        });
        return true;
    };

    // 1) Queue: queued button starts (Home Assistant only), due automatic starts of tasks and plants
    const faellig = [];
    if (system === "ha") {
        store.schlange.forEach(q => {
            const hit = actionById(data, q.actionId);
            const task = q.taskId ? tasks.find(t => t.id === q.taskId) || null : null;
            const plant = q.plantId ? data.plants.find(p => p.id === q.plantId) || { id: q.plantId, name: "" } : null;
            if (!ofSystem(hit)) return;
            faellig.push({ hit, task, plant, regel: task ? regelOf(task) : null, zeit: berlin(Date.parse(q.at)).hm, order: -1, abhaken: false, queued: q });
        });
    }
    tasks.forEach(task => {
        const regel = regelOf(task);
        if (!regel || task.done) return;
        const auto = regel.rule.smart && regel.rule.smart.auto;
        const hit = auto ? actionById(data, auto.action) : null;
        const zeit = auto ? cleanTime(auto.time) : "";
        if (!ofSystem(hit) || !zeit || task.dueDate !== jetzt.iso || jetzt.hm < zeit || store.log[task.id + ":auto"]) return;
        faellig.push({ hit, task, regel, zeit, order: regel.order, abhaken: !!auto.abhaken });
    });
    let wx = null, wxLoaded = false;
    data.plants.forEach(p => {
        const auto = p.smart && p.smart.auto;
        const hit = auto ? actionById(data, auto.action) : null;
        const zeit = auto ? cleanTime(auto.time) : "";
        const key = "plant:" + p.id + ":" + jetzt.iso;
        if (!ofSystem(hit) || !zeit || jetzt.hm < zeit || store.log[key] || p.home === undefined) return;
        if (!wxLoaded) {
            wxLoaded = true;
            try { wx = require(`${__hooks}/pinn-zuhause.js`).weather(familyId); if (wx && wx.keinOrt) wx = null; } catch (e) { wx = null; }
        }
        if (!plantDue(p, store, wx, jetzt.iso)) return;
        faellig.push({ hit, task: null, plant: p, regel: null, zeit, order: 900000, abhaken: false, logKey: key });
    });
    faellig.sort((a, b) => a.zeit.localeCompare(b.zeit) || a.order - b.order);

    const geraete = [];
    faellig.forEach(f => { if (!geraete.includes(f.hit.device.id)) geraete.push(f.hit.device.id); });
    geraete.forEach(deviceId => {
        const schlange = faellig.filter(f => f.hit.device.id === deviceId);
        for (let i = 0; i < schlange.length; i++) {
            const f = schlange[i];
            const busy = deviceBusy(store, f.hit.device, ha, now);
            if (busy) {
                schlange.slice(i).forEach(w => wartend.push({
                    aktion: w.hit.action.label, geraet: w.hit.device.name, aufgabe: w.task ? w.task.title : (w.plant ? w.plant.name || "" : ""),
                    ab: busy.bis > now ? berlin(busy.bis).hm : "", zustand: busy.zustand || "",
                }));
                break;
            }
            if (f.queued) store.schlange = store.schlange.filter(q => q !== f.queued);
            if (f.task) store.log[f.task.id + ":auto"] = new Date(now).toISOString();
            if (f.logKey) store.log[f.logKey] = new Date(now).toISOString();
            if (!ausfuehren(f.hit, f.task, f.regel, "start", f.plant)) {
                // Keep a queued job for another try instead of losing it
                if (f.queued && (f.queued.versuche || 0) < 3) store.schlange.unshift(Object.assign({}, f.queued, { versuche: (f.queued.versuche || 0) + 1 }));
                continue;
            }
            markBusy(store, f.hit, now, system === "ha" ? { taskId: f.task ? f.task.id : "", plantId: f.plant ? f.plant.id : "", actionId: f.hit.action.id, versuche: f.queued ? f.queued.versuche || 0 : 0 } : null);
            if (f.abhaken && f.task) setTaskDone(familyId, f.task);
            // A robot takes one job at a time: the next one waits for the live state
            if (system === "ha" && liveDomain(f.hit.device) && i + 1 < schlange.length) {
                schlange.slice(i + 1).forEach(w => wartend.push({ aktion: w.hit.action.label, geraet: w.hit.device.name, aufgabe: w.task ? w.task.title : (w.plant ? w.plant.name || "" : ""), ab: "", zustand: "" }));
                break;
            }
        }
    });

    // 2) "When ticked off": catch up (Apple) or run (Home Assistant) – only tasks done today
    tasks.forEach(task => {
        const regel = regelOf(task);
        if (!regel || !task.done) return;
        const hit = actionById(data, regel.rule.smart && regel.rule.smart.done);
        const key = task.id + ":done";
        if (!ofSystem(hit) || store.log[key]) return;
        const doneMs = Date.parse(task.doneAt || "");
        const heute = doneMs ? berlin(doneMs).iso === jetzt.iso : task.dueDate === jetzt.iso;
        if (!heute) return;
        store.log[key] = new Date(now).toISOString();
        ausfuehren(hit, task, regel, "abhaken");
    });

    return { aktionen, wartend, fehler };
}

// ---------------------------------------------------------------------------------------------
// Public (with token): Apple shortcut "pinn Automatik"
// ---------------------------------------------------------------------------------------------
function automatik(token) {
    const rec = loadRecByToken(token);
    if (!rec) throw new Error("Unbekannter oder ausgeschalteter Automatik-Link.");
    const familyId = rec.getString("familie");
    const store = readData(rec);
    pruneLog(store);
    const out = processFamily(familyId, rec, store, "shortcut", null);
    const jetzt = berlin(Date.now());
    store.abruf = new Date().toISOString();
    store.abrufAnzahl = out.aktionen.length;
    try { writeData(rec, store); } catch (err) { console.log("[Smarthome] Speichern fehlgeschlagen: " + err.message); }
    return { aktionen: out.aktionen, anzahl: out.aktionen.length, wartend: out.wartend, zeit: jetzt.hm, datum: jetzt.iso };
}

// ---------------------------------------------------------------------------------------------
// Schedule: Home Assistant (every minute, all families with access)
// ---------------------------------------------------------------------------------------------
function haCronFamily(rec, ha) {
    const familyId = rec.getString("familie");
    const store = readData(rec);
    const vorher = JSON.stringify(store);
    pruneLog(store);
    const out = processFamily(familyId, rec, store, "ha", ha);
    if (out.aktionen.length) { store.haLauf = new Date().toISOString(); store.haLaufInfo = out.aktionen.map(a => a.aktion + (a.eingabe ? " (" + a.eingabe + ")" : "")).join(", "); }
    if (out.fehler.length) { store.haFehler = { at: new Date().toISOString(), text: out.fehler.join(" · ") }; console.log("[Smarthome] Home Assistant: " + out.fehler.join(" · ")); }
    store.wartend = out.wartend;
    if (JSON.stringify(store) !== vorher) writeData(rec, store);
    return out;
}
function haCron() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "ha != ''", "", 0, 0); } catch (e) { recs = []; }
    const watch = [];
    recs.forEach(rec => {
        const ha = readHa(rec);
        if (!ha) return;
        try {
            const out = haCronFamily(rec, ha);
            if (out.wartend.length) watch.push(rec.getString("familie"));
        } catch (err) {
            console.log("[Smarthome] Zeitplan für Familie " + rec.getString("familie") + " fehlgeschlagen: " + err.message);
        }
    });
    // Something is waiting for a busy robot: look again every 10 seconds within this minute, so the next
    // job starts while the robot is still on its way back (the schedule itself only runs once a minute)
    if (!watch.length || typeof sleep !== "function") return;
    for (let round = 0; round < 4 && watch.length; round++) {
        sleep(10000);
        for (let k = watch.length - 1; k >= 0; k--) {
            const rec = loadRec(watch[k]);
            const ha = readHa(rec);
            if (!rec || !ha) { watch.splice(k, 1); continue; }
            try {
                const out = haCronFamily(rec, ha);
                if (!out.wartend.length || out.aktionen.length) watch.splice(k, 1);
            } catch (err) { watch.splice(k, 1); }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Signed in: Apple automation
// ---------------------------------------------------------------------------------------------
function status(familyId) {
    const rec = loadRec(familyId);
    const ha = readHa(rec);
    const d = readData(rec);
    if (rec) pruneLog(d);
    return {
        aktiv: !!(rec && rec.getString("token")),
        token: rec ? rec.getString("token") : "",
        abruf: d.abruf || "", abrufAnzahl: d.abrufAnzahl || 0,
        belegt: d.belegt || {}, wartend: d.wartend || [], schlange: d.schlange.length, pflanzen: d.pflanzen || {},
        ha: ha ? { verbunden: true, url: ha.url, version: ha.version || "", ort: ha.ort || "", lauf: d.haLauf || "", laufInfo: d.haLaufInfo || "", fehler: d.haFehler || null } : { verbunden: false },
    };
}
function einrichten(familyId) {
    const rec = loadOrCreateRec(familyId);
    rec.set("token", newToken());
    $app.save(rec);
    return status(familyId);
}
function ausschalten(familyId) {
    const rec = loadRec(familyId);
    if (rec) { rec.set("token", ""); $app.save(rec); }
    return status(familyId);
}
// The app started an Apple shortcut itself -> do not repeat the automation, mark the device busy
function gemeldet(familyId, taskId, art, actionId) {
    const id = String(taskId || "").trim();
    if (!id || id.length > 60) return { ok: false };
    const rec = loadRec(familyId);
    if (!rec) return { ok: true };
    const d = readData(rec);
    pruneLog(d);
    d.log[id + (art === "done" ? ":done" : ":auto")] = new Date().toISOString();
    if (actionId && art !== "done") {
        const hit = actionById(familyData(familyId), String(actionId));
        if (hit) markBusy(d, hit, Date.now());
    }
    writeData(rec, d);
    return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Signed in: Home Assistant
// ---------------------------------------------------------------------------------------------
function haVerbinden(familyId, body) {
    const rec = loadOrCreateRec(familyId);
    const alt = readHa(rec);
    const kandidaten = haCandidates(body.url);
    // Empty token field = keep the previous token (e.g. only the address changed)
    const token = cleanHaToken(body.token) || (alt && alt.url ? cleanHaToken(alt.token) : "");
    if (!token) throw new Error("Bitte einen langlebigen Zugriffstoken eingeben.");
    if (token.length > 1000) throw new Error("Der Token ist zu lang.");
    if (!/^[A-Za-z0-9._-]+$/.test(token)) throw new Error("Der Token enthält ungültige Zeichen – bitte nur den Token selbst einfügen (die lange Zeichenkette aus Home Assistant).");
    let url = "", abgelehnt = "";
    const versucht = [];
    for (const k of kandidaten) {
        const r = haProbe(k, token);
        if (r.ok) { url = k; break; }
        if (r.abgelehnt && !abgelehnt) abgelehnt = k;
        versucht.push(k + " (" + (r.abgelehnt ? "Token abgelehnt" : r.grund) + ")");
    }
    if (!url && abgelehnt) {
        throw new Error("Home Assistant gefunden unter " + abgelehnt + ", aber der Token wird abgelehnt. Bitte in Home Assistant unter Profil → Sicherheit → „Langlebige Zugriffstoken“ einen neuen Token erstellen und komplett einfügen (er wird nur einmal angezeigt).");
    }
    if (!url) {
        throw new Error("Unter dieser Adresse antwortet kein Home Assistant – probiert: " + versucht.join(", ") + ". Läuft Home Assistant und ist die IP richtig? Der pinn.-Server muss sie aus dem Docker-Container erreichen können.");
    }
    const ha = { url: url, token: token };
    let cfg = null;
    try { cfg = haRequest(ha, "GET", "/api/config"); } catch (e) { cfg = null; }
    ha.version = cfg && cfg.version ? String(cfg.version) : "";
    ha.ort = cfg && cfg.location_name ? String(cfg.location_name) : "";
    rec.set("ha", JSON.stringify(ha));
    $app.save(rec);
    return status(familyId);
}
function haTrennen(familyId) {
    const rec = loadRec(familyId);
    if (rec) { rec.set("ha", ""); $app.save(rec); }
    return status(familyId);
}
function haOf(familyId) {
    const ha = readHa(loadRec(familyId));
    if (!ha) throw new Error("Home Assistant ist noch nicht verbunden (Einstellungen → Smarthome → Home Assistant).");
    return ha;
}
function haEntitaeten(familyId) {
    const list = haRequest(haOf(familyId), "GET", "/api/states") || [];
    const out = [];
    (Array.isArray(list) ? list : []).forEach(s => {
        const id = String(s && s.entity_id || "");
        const domain = id.split(".")[0];
        if (HA_DOMAINS.indexOf(domain) < 0) return;
        out.push({ id: id, name: String((s.attributes && s.attributes.friendly_name) || id), domain: domain, state: String(s.state || "") });
    });
    out.sort((a, b) => HA_DOMAINS.indexOf(a.domain) - HA_DOMAINS.indexOf(b.domain) || a.name.localeCompare(b.name));
    return { entitaeten: out.slice(0, 2000) };
}
function haTest(familyId, body) {
    const ha = haOf(familyId);
    if (body.ha && typeof body.ha === "object" && body.ha.kind === "segments") {
        runVacuumSegments(ha, body.ha, String(body.raum || "").slice(0, 80));
        return { ok: true };
    }
    runHaAction(ha, { action: { ha: { entity: body.entity, service: body.service, data: body.data } } }, "Test");
    return { ok: true };
}
// Button at a task or plant, or ticking off in the app: run the Home Assistant action or queue it
function haAusfuehren(familyId, body) {
    const ha = haOf(familyId);
    const art = body.art === "done" ? "done" : "start";
    const taskId = String(body.taskId || "").trim().slice(0, 60);
    const plantId = String(body.plantId || "").trim().slice(0, 60);
    const data = familyData(familyId);
    const hit = actionById(data, String(body.actionId || ""));
    if (!hit || deviceSystem(hit.device) !== "ha" || !canRun(hit)) throw new Error("Aktion nicht gefunden oder unvollständig.");
    const rec = loadOrCreateRec(familyId);
    const store = readData(rec);
    pruneLog(store);
    const now = Date.now();
    let eingabe = "";
    if (taskId) {
        const task = listTasks(familyId).find(t => t.id === taskId);
        const regel = task ? ruleTitles(data).find(r => r.title === String(task.title || "").trim()) : null;
        eingabe = regel && regel.room ? String(regel.room.name || "") : "";
    }
    if (art === "done") {
        if (taskId) store.log[taskId + ":done"] = new Date(now).toISOString();
        writeData(rec, store);
        runHaAction(ha, hit, eingabe);
        return { ok: true, gestartet: true };
    }
    if (taskId) store.log[taskId + ":auto"] = new Date(now).toISOString();
    const busy = deviceBusy(store, hit.device, ha, now);
    const waiting = store.schlange.some(q => q.actionId && actionById(data, q.actionId) && actionById(data, q.actionId).device.id === hit.device.id);
    if (busy || waiting) {
        if (!store.schlange.some(q => q.taskId === taskId && q.plantId === plantId && q.actionId === hit.action.id)) {
            store.schlange.push({ taskId: taskId, plantId: plantId, actionId: hit.action.id, at: new Date(now).toISOString() });
        }
        writeData(rec, store);
        return { ok: true, eingereiht: true, geraet: hit.device.name, belegtMit: (busy && busy.aktion) || "", ab: busy && busy.bis > now ? berlin(busy.bis).hm : "", zustand: (busy && busy.zustand) || "" };
    }
    runHaAction(ha, hit, eingabe);
    markBusy(store, hit, now, { taskId: taskId, plantId: plantId, actionId: hit.action.id, versuche: 0 });
    scheduleOff(store, hit, now);
    if (plantId) store.pflanzen[plantId] = berlin(now).iso;
    writeData(rec, store);
    return { ok: true, gestartet: true };
}
// Current state of one entity (e.g. the fill level of a pet feeder)
function haStateOf(familyId, entity) {
    const ent = String(entity || "").trim();
    if (!/^[a-z_]+\.[a-z0-9_]+$/.test(ent)) throw new Error("Ungültige Entität.");
    const s = haStateFull(haOf(familyId), ent);
    const attrs = s.attributes || {};
    return { entity: ent, state: String(s.state || ""), unit: String(attrs.unit_of_measurement || ""), name: String(attrs.friendly_name || ent), deviceClass: String(attrs.device_class || "") };
}

module.exports = {
    COL, ensureSchema, automatik, status, einrichten, ausschalten, gemeldet, haCron,
    haVerbinden, haTrennen, haEntitaeten, haTest, haAusfuehren, haSauger, haStateOf, offServiceFor,
};
