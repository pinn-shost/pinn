// pb_hooks/pinn-smarthome.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Smarthome (Einstellungen → Smarthome bzw. Haushalt → Haus-Symbol)
//
// Geräte (smartDevices in den Familiendaten) gehören zu einem System:
//   - "shortcut": Apple-Kurzbefehle. Die App startet sie per Knopf; zu festen Uhrzeiten holt sich ein
//     Kurzbefehl „pinn Automatik“ (iOS-Automation) die fälligen Aktionen:
//       GET /api/pinn/smart/automatik?token=...  -> { aktionen: [{ kurzbefehl, eingabe, aktion, geraet, aufgabe, art }], wartend, ... }
//   - "ha": Home Assistant. Dieser Server ruft die Dienste selbst auf (REST-API mit langlebigem Token) –
//     per Knopf von jedem Gerät (auch Android) und automatisch per Zeitplan (jede Minute).
//     Mit Status-Entität (z. B. vacuum.roborock) wartet die Schlange, bis das Gerät wirklich fertig ist.
//
// Raumreinigung (Saugroboter, z. B. Roborock): action.ha.kind = "segments"
//   { entity: vacuum.…, rooms: "task" | [Segment-IDs], roomMap: { "16": "Wohnzimmer" }, mode: "vac" | "vacmop" | "mop",
//     fan, water, waterEntity, mopMode, mopModeEntity, repeat }
//   Vor dem Start stellt pinn. Saugstärke und Wassermenge ein (Saugen: Wasser aus, Wischen: Saugen aus) und schickt dann
//   app_segment_clean mit den Räumen. „Raum der Aufgabe“ sucht den Raumnamen der Haushalt-Aufgabe in der Roboter-Karte.
//
// Regeln (roomSchedules / trashBins, Feld smart):
//   smart.start: [Aktions-IDs]  Knöpfe an der Aufgabe
//   smart.done:  Aktions-ID      „Beim Abhaken“ (Home Assistant: Server führt aus; Apple: App, sonst Automatik)
//   smart.auto:  { action, time: "HH:MM", abhaken }  automatisch am Fälligkeitstag ab Uhrzeit
//
// Nacheinander statt gleichzeitig: Aktionen DESSELBEN Geräts laufen in einer Schlange (Uhrzeit, dann
// Reihenfolge der Räume). Belegt ist ein Gerät
//   - für die eingetragene Dauer (action.minutes) bzw.
//   - bei Home Assistant mit Status-Entität, solange diese z. B. „cleaning“/„returning“ meldet
//     (nach dem Start mindestens 2 Minuten, bis der Roboter losgefahren ist).
// Per Knopf gestartete Aktionen belegen das Gerät ebenfalls; ist es belegt, wird die Home-Assistant-
// Aktion eingereiht und startet automatisch, sobald es frei ist.
//
// Daten je Familie: Sammlung „smarthome_zugaenge“ (gesperrt, nur über smarthome.pb.js):
//   familie, token (Automatik-Link für Apple, leer = aus),
//   ha    = { url, token, version, ort }  (Zugang zu Home Assistant – nie in den Familiendaten, nie im Browser)
//   daten = { log: { "<Aufgabe>:auto|done": ISO }, abruf, abrufAnzahl, belegt: { "<Gerät>": { bis, aktion, status } },
//             schlange: [{ taskId, actionId, at }], haLauf, haFehler }
// Zeiten rechnet der Server selbst in deutscher Zeit (Europe/Berlin).

const COL = "smarthome_zugaenge";
const LOG_TAGE = 3;
const HA_ANLAUF_MS = 2 * 60000;          // nach dem Start: so lange gilt das Gerät auf jeden Fall als belegt
const HA_MAX_BELEGT_MS = 4 * 3600000;    // Sicherheitsgrenze, falls die Status-Entität hängen bleibt
const HA_BUSY = ["cleaning", "returning", "paused", "on", "playing", "opening", "closing", "heat", "cool", "running", "mowing"];
const HA_DOMAINS = ["script", "scene", "automation", "button", "input_button", "vacuum", "lawn_mower", "light", "switch", "fan", "input_boolean", "cover", "media_player", "climate", "siren", "lock", "valve", "humidifier", "select", "sensor", "binary_sensor"];
// Saugroboter: Wassermenge („Wischintensität“) bzw. Wischmodus erkennt pinn. an den Optionen der Auswahl-Entität
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
// Hilfen
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function hasField(col, name) {
    try { return !!col.fields.getByName(name); } catch (e) { return false; }
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
// Deutsche Zeit (MEZ/MESZ) aus einem Zeitpunkt, ohne auf die Zeitzone des Containers angewiesen zu sein
function berlin(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const lastSunday = (m) => {
        const x = new Date(Date.UTC(y, m + 1, 0, 1, 0, 0)); // letzter Tag des Monats, 01:00 UTC
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
    try { if (typeof res.raw === "string" && res.raw) return JSON.parse(res.raw); } catch (e) { /* weiter */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* egal */ }
    try { return JSON.parse(toString(res.body)); } catch (e) { /* egal */ }
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
// Sammlung „smarthome_zugaenge“ (je Familie ein Datensatz)
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
    // Ältere Version ohne Home-Assistant-Feld: ergänzen
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
}
function newToken() {
    try { return $security.randomString(40); } catch (e) { /* weiter */ }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 40; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// ---------------------------------------------------------------------------------------------
// Familiendaten (nur der Smarthome-Teil, zwischengespeichert bis zur nächsten Änderung)
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
    } catch (e) { /* weiter */ }
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
    };
    try { $app.store().set(key, { stamp: stamp, data: data }); } catch (e) { /* egal */ }
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
// Adresse so nehmen, wie man sie im Browser eintippt: „192.168.178.10“, „192.168.178.10:8123“,
// „http://…“ oder eine kopierte Seite (Pfad wird ignoriert). Ohne http(s):// bzw. ohne Port probiert
// der Server die üblichen Varianten durch (Port 8123, Port 80, https).
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
// Token so nehmen, wie er eingefügt wird - auch mit „Bearer “ oder „Authorization: Bearer “ davor
// und mit Zeilenumbrüchen. pinn. setzt „Bearer “ beim Senden selbst davor.
function cleanHaToken(v) {
    return String(v || "").trim()
        .replace(/^authorization\s*:\s*/i, "")
        .replace(/^bearer\s+/i, "")
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}
// Eine Adresse prüfen: { ok } | { abgelehnt } (Home Assistant gefunden, Token falsch) | { fehlt }
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
function runHaAction(ha, hit, inputText) {
    const a = hit.action.ha || {};
    if (a.kind === "segments") { runVacuumSegments(ha, a, inputText); return; }
    let data = a.data;
    if (typeof data === "string") { try { data = data.trim() ? JSON.parse(data) : {}; } catch (e) { throw new Error("Die Zusatzdaten sind kein gültiges JSON."); } }
    // Raumname als Variable für Skripte: {{ raum }} in Home Assistant
    if (a.service === "script.turn_on" || /^script\./.test(a.service || "")) {
        data = Object.assign({}, data || {});
        if (a.service === "script.turn_on") data.variables = Object.assign({ raum: inputText || "" }, data.variables || {});
    }
    haCall(ha, a.entity, a.service, data);
}

// ---------------------------------------------------------------------------------------------
// Saugroboter: Räume aus der Karte, Saugstärke/Wassermenge und Raumreinigung
// ---------------------------------------------------------------------------------------------
function haStates(ha) {
    const list = haRequest(ha, "GET", "/api/states") || [];
    return Array.isArray(list) ? list : [];
}
// Alle Entitäten desselben Geräts (über die Template-API von Home Assistant), sonst gleicher Namensanfang
function deviceEntityIds(ha, vac, states) {
    try {
        const ids = haRequest(ha, "POST", "/api/template", { template: "{{ device_entities(device_id('" + vac + "')) | tojson }}" });
        if (Array.isArray(ids) && ids.length) return ids.map(String);
    } catch (e) { /* weiter mit dem Namensanfang */ }
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
// Räume aus der Roboter-Karte (Roborock-Integration: Dienst roborock.get_maps mit Antwort)
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
// Raumnamen der Aufgabe in den Räumen der Karte finden (genau, sonst enthalten)
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
            try { list = haRooms(ha, vac); } catch (e) { /* bleibt bei der gespeicherten Liste */ }
            segs = matchRoom(list, raumName);
        }
        if (!segs.length) {
            throw new Error("Raum „" + raumName + "“ gibt es in der Karte des Saugroboters nicht" + (list.length ? " (vorhanden: " + list.map(r => r.name).join(", ") + ")" : "") + ". Raum in der Roborock-App gleich benennen oder an der Aktion feste Räume wählen.");
        }
    }
    if (!segs.length) throw new Error("Keine Räume gewählt.");
    const mode = a.mode === "mop" || a.mode === "vac" ? a.mode : "vacmop";
    const repeat = Math.min(3, Math.max(1, parseInt(a.repeat, 10) || 1));

    // Saugstärke und Wassermenge passend zum Modus einstellen
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
// Für das Geräte-Popup: Räume, Saugstufen, Wassermenge, Wischmodus und Sensoren des Saugroboters
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

// Ist das Gerät gerade beschäftigt? (Dauer bzw. Status-Entität bei Home Assistant)
function deviceBusy(store, device, ha, now) {
    const b = store.belegt[device.id];
    if (!b) return null;
    if (b.bis > now) return b;
    if (b.status && ha && deviceSystem(device) === "ha" && device.statusEntity && b.seit && now - b.seit < HA_MAX_BELEGT_MS) {
        let state = "";
        try { state = haState(ha, device.statusEntity); } catch (e) { state = ""; }
        if (HA_BUSY.indexOf(state) >= 0) return Object.assign({}, b, { zustand: state });
    }
    delete store.belegt[device.id];
    return null;
}
function markBusy(store, hit, now) {
    const min = actionMinutes(hit.action);
    const status = deviceSystem(hit.device) === "ha" && !!hit.device.statusEntity;
    if (!min && !status) return;
    const bis = now + Math.max(min * 60000, status ? HA_ANLAUF_MS : 0);
    store.belegt[hit.device.id] = { bis: bis, seit: now, status: status, aktion: hit.action.label || "" };
}

// ---------------------------------------------------------------------------------------------
// Fällige Aktionen einer Familie bestimmen und ausführen
// system: "shortcut" -> nur sammeln (Apple-Kurzbefehl startet sie), "ha" -> hier ausführen
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

    const ausfuehren = (hit, task, regel, art) => {
        const eingabe = regel && regel.room ? String(regel.room.name || "") : "";
        if (system === "ha") {
            try { runHaAction(ha, hit, eingabe); }
            catch (err) { fehler.push(hit.action.label + ": " + err.message); return false; }
        }
        aktionen.push({
            kurzbefehl: String(hit.action.shortcut || ""), eingabe: eingabe,
            aktion: String(hit.action.label || ""), geraet: String(hit.device.name || ""),
            aufgabe: String(task ? task.title || "" : ""), art: art,
        });
        return true;
    };

    // 1) Schlange: eingereihte Knopf-Starts (nur Home Assistant) und fällige Automatik-Starts
    const faellig = [];
    if (system === "ha") {
        store.schlange.forEach(q => {
            const hit = actionById(data, q.actionId);
            const task = tasks.find(t => t.id === q.taskId) || null;
            if (!ofSystem(hit)) return;
            faellig.push({ hit, task, regel: task ? regelOf(task) : null, zeit: berlin(Date.parse(q.at)).hm, order: -1, abhaken: false, queued: q });
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
                    aktion: w.hit.action.label, geraet: w.hit.device.name, aufgabe: w.task ? w.task.title : "",
                    ab: busy.bis > now ? berlin(busy.bis).hm : "", zustand: busy.zustand || "",
                }));
                break;
            }
            if (f.queued) store.schlange = store.schlange.filter(q => q !== f.queued);
            if (f.task) store.log[f.task.id + ":auto"] = new Date(now).toISOString();
            if (!ausfuehren(f.hit, f.task, f.regel, "start")) continue;
            markBusy(store, f.hit, now);
            if (f.abhaken && f.task) setTaskDone(familyId, f.task);
        }
    });

    // 2) „Beim Abhaken“ nachholen bzw. (Home Assistant) ausführen – nur heute erledigte Aufgaben
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
// Öffentlich (mit Token): Apple-Kurzbefehl „pinn Automatik“
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
// Zeitplan: Home Assistant (jede Minute, alle Familien mit Zugang)
// ---------------------------------------------------------------------------------------------
function haCron() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "ha != ''", "", 0, 0); } catch (e) { recs = []; }
    recs.forEach(rec => {
        const ha = readHa(rec);
        if (!ha) return;
        const familyId = rec.getString("familie");
        try {
            const store = readData(rec);
            const vorher = JSON.stringify(store);
            pruneLog(store);
            const out = processFamily(familyId, rec, store, "ha", ha);
            if (out.aktionen.length) { store.haLauf = new Date().toISOString(); store.haLaufInfo = out.aktionen.map(a => a.aktion + (a.eingabe ? " (" + a.eingabe + ")" : "")).join(", "); }
            if (out.fehler.length) { store.haFehler = { at: new Date().toISOString(), text: out.fehler.join(" · ") }; console.log("[Smarthome] Home Assistant: " + out.fehler.join(" · ")); }
            store.wartend = out.wartend;
            if (JSON.stringify(store) !== vorher) writeData(rec, store);
        } catch (err) {
            console.log("[Smarthome] Zeitplan für Familie " + familyId + " fehlgeschlagen: " + err.message);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Angemeldet: Apple-Automatik
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
        belegt: d.belegt || {}, wartend: d.wartend || [], schlange: d.schlange.length,
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
// Die App hat einen Apple-Kurzbefehl selbst gestartet -> Automatik nicht wiederholen, Gerät belegen
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
// Angemeldet: Home Assistant
// ---------------------------------------------------------------------------------------------
function haVerbinden(familyId, body) {
    const rec = loadOrCreateRec(familyId);
    const alt = readHa(rec);
    const kandidaten = haCandidates(body.url);
    // Leeres Token-Feld = bisherigen Token behalten (z. B. nur Adresse geändert)
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
// Knopf an der Aufgabe bzw. Abhaken in der App: Home-Assistant-Aktion ausführen oder einreihen
function haAusfuehren(familyId, body) {
    const ha = haOf(familyId);
    const art = body.art === "done" ? "done" : "start";
    const taskId = String(body.taskId || "").trim().slice(0, 60);
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
    if (busy) {
        if (!store.schlange.some(q => q.taskId === taskId && q.actionId === hit.action.id)) {
            store.schlange.push({ taskId: taskId, actionId: hit.action.id, at: new Date(now).toISOString() });
        }
        writeData(rec, store);
        return { ok: true, eingereiht: true, geraet: hit.device.name, belegtMit: busy.aktion || "", ab: busy.bis > now ? berlin(busy.bis).hm : "" };
    }
    runHaAction(ha, hit, eingabe);
    markBusy(store, hit, now);
    writeData(rec, store);
    return { ok: true, gestartet: true };
}

module.exports = {
    COL, ensureSchema, automatik, status, einrichten, ausschalten, gemeldet, haCron,
    haVerbinden, haTrennen, haEntitaeten, haTest, haAusfuehren, haSauger,
};
