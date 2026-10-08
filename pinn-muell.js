// pb_hooks/pinn-muell.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Müllkalender der Familie (Einstellungen → Kalender → Müllkalender)
//
// - Genau EIN Müllkalender je Familie. Wird ein neuer übernommen, ersetzt er den alten vollständig.
// - Suche mit KI: Der Server fragt Google Gemini (mit Google-Suche) nach der iCal-/ICS-Datei des
//   örtlichen Entsorgers für die Adresse (Zuhause der Familie oder von Hand eingegeben). Jeder
//   gefundene Link wird vom Server selbst heruntergeladen und geprüft – angeboten werden nur echte
//   Kalenderdateien mit Abfuhrterminen. Zusätzlich durchsucht der Server die gefundenen Seiten der
//   Entsorger nach ICS-Links. Findet sich keine Datei, gibt es die Seiten zum Selbst-Herunterladen.
// - Ohne KI (kein PINN_GEMINI_KEY in der .env) oder als Ersatz: Link zur ICS-Datei einfügen oder
//   die heruntergeladene .ics-Datei hochladen.
// - Kalender mit Link prüft der Server einmal pro Woche selbst neu (neue Termine fürs nächste Jahr).
//
// Die App spricht nie mit fremden Servern – nur dieser Server lädt herunter.
//
// Daten je Familie: Sammlung „muellkalender“ (gesperrt, nur über die Routen in muell.pb.js), Feld „daten“:
//   { quelle: { art: "link"|"datei", url, anbieter, titel, adresse, dateiname },
//     termine: [{ d: "2026-10-05", t: "Restmüll" }], arten: [{ name, farbe, anzahl }],
//     ausgeblendet: [name], anzeigen: true, stand, geprueft, fehler, von }

const COL = "muellkalender";
const UA_BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const MAX_ICS_BYTES = 6 * 1024 * 1024;
const MAX_TERMINE = 1500;
const VERGANGEN_TAGE = 45;       // so weit zurück bleiben Termine erhalten
const ZUKUNFT_TAGE = 550;        // so weit voraus werden Wiederholungen ausgerechnet
const SUCHE_BUDGET_MS = 125000;  // die App wartet bis zu 150 s
const MAX_KANDIDATEN = 10;
const MAX_SEITEN = 5;
const REFRESH_TAGE = 6;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODELLE = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function readEnv(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function kiAktiv() {
    try { return require(`${__hooks}/pinn-ki.js`).isAvailable(); } catch (e) { return !!readEnv("PINN_GEMINI_KEY"); }
}
function cleanText(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 160);
}
function pause(ms) {
    try { if (typeof sleep === "function") sleep(ms); } catch (e) { /* egal */ }
}
function bodyText(res) {
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* weiter */ }
    try { return toString(res.body); } catch (e) { /* weiter */ }
    return "";
}
function bytesOf(res) {
    let b = null;
    try { b = res.body; } catch (e) { b = null; }
    if (!b || typeof b === "string") return null;
    try { if (typeof ArrayBuffer !== "undefined" && b instanceof ArrayBuffer) return new Uint8Array(b); } catch (e) { /* weiter */ }
    return b;
}
// ICS-Dateien mancher Entsorger sind noch in ISO-8859-1 gespeichert – dann selbst umwandeln
function textOf(res) {
    let t = bodyText(res);
    if (t && t.indexOf("\uFFFD") >= 0) {
        const bytes = bytesOf(res);
        if (bytes && bytes.length) {
            const parts = [];
            let chunk = "";
            for (let i = 0; i < bytes.length; i++) {
                chunk += String.fromCharCode(bytes[i] & 255);
                if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
            }
            parts.push(chunk);
            t = parts.join("");
        }
    }
    return t;
}
function parseJsonRes(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* weiter */ }
    try { if (res.json && typeof res.json === "object") return res.json; } catch (e) { /* egal */ }
    return {};
}
function isoDate(d) {
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
function todayIso() {
    // Datum in Deutschland (Server läuft meist in UTC)
    return isoDate(new Date(Date.now() + 2 * 3600 * 1000));
}
function addDays(iso, n) {
    const p = iso.split("-").map(Number);
    return isoDate(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)));
}

// Nur öffentliche Adressen – nie das Heimnetz
function hostOf(url) {
    const m = String(url).match(/^https?:\/\/(?:[^@\/]*@)?(\[[^\]]+\]|[^\/:?#]+)/i);
    return m ? m[1] : "";
}
function isPrivateHost(host) {
    const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!h || h === "localhost" || /\.(local|lan|home|internal|fritz\.box|duckdns\.org)$/.test(h) || h === "fritz.box") return true;
    if (h.indexOf(":") >= 0) return true;
    const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return /^[a-z0-9-]+$/.test(h);
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function normalizeUrl(u) {
    let s = String(u || "").trim().replace(/&amp;/gi, "&").replace(/[)\].,;'"<>]+$/, "");
    if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, "https://");
    if (/^\/\//.test(s)) s = "https:" + s;
    if (!/^https?:\/\/[^\s]+$/i.test(s)) return "";
    if (isPrivateHost(hostOf(s))) return "";
    return s.slice(0, 2000);
}
function absoluteUrl(base, rel) {
    const r = String(rel || "").trim().replace(/&amp;/gi, "&");
    if (!r || /^(javascript|mailto|tel|data):/i.test(r)) return "";
    if (/^(https?|webcals?):\/\//i.test(r) || /^\/\//.test(r)) return normalizeUrl(r);
    const m = String(base || "").match(/^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i);
    if (!m) return "";
    if (r.charAt(0) === "/") return normalizeUrl(m[1] + r);
    if (r.charAt(0) === "?") return normalizeUrl(m[1] + (m[2] || "/") + r);
    const dir = (m[2] || "/").replace(/[^\/]*$/, "");
    return normalizeUrl(m[1] + dir + r);
}

// ---------------------------------------------------------------------------------------------
// Müllarten: Farbe nach Stichwort (wie die Tonnen in Deutschland)
// ---------------------------------------------------------------------------------------------
const FARBEN = [
    [/schadstoff|sondermüll|problemabfall|giftmobil|umweltmobil/i, "#C0392B"],
    [/sperr/i, "#8E44AD"],
    [/weihnachtsb|tannenb|christb/i, "#1E7A46"],
    [/grün|gruen|garten|baum|strauch|laub|grünschnitt/i, "#4F8A3C"],
    [/bio|kompost|organ/i, "#8B5A2B"],
    [/gelb|wertstoff|verpackung|lvp|leichtverp|plastik|kunststoff/i, "#D9A400"],
    [/papier|pappe|ppk|karton|blau/i, "#2F6FB5"],
    [/glas/i, "#2AA198"],
    [/elektro|schrott|metall/i, "#6D7B8D"],
    [/rest|grau|schwarz|haus/i, "#4A4F57"],
];
function farbeFuer(name) {
    for (let i = 0; i < FARBEN.length; i++) if (FARBEN[i][0].test(name)) return FARBEN[i][1];
    return "#7A6F5A";
}
function sauberTitel(s) {
    let t = String(s || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").replace(/\s+/g, " ").trim();
    t = t.replace(/^(abfuhr|abholung|leerung|termin)\s*[:\-–]\s*/i, "");
    return t.slice(0, 80) || "Abfuhr";
}

// ---------------------------------------------------------------------------------------------
// ICS lesen (inkl. einfacher Wiederholungen)
// ---------------------------------------------------------------------------------------------
function unfold(text) {
    return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}
// Datum (YYYY-MM-DD) aus DTSTART-Wert; UTC-Zeiten auf deutsche Zeit (+2 h Näherung) schieben
function icsDate(value) {
    const v = String(value || "").trim();
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) return "";
    if (m[7] === "Z") {
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + 2 * 3600 * 1000);
        return isoDate(d);
    }
    return m[1] + "-" + m[2] + "-" + m[3];
}
function propValue(line) {
    const i = line.indexOf(":");
    return i < 0 ? "" : line.slice(i + 1);
}
function propName(line) {
    const i = line.search(/[;:]/);
    return (i < 0 ? line : line.slice(0, i)).toUpperCase();
}
const WTAGE = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function expandRule(start, rule, exdates, von, bis) {
    const r = {};
    String(rule).split(";").forEach(p => { const kv = p.split("="); if (kv.length === 2) r[kv[0].toUpperCase()] = kv[1]; });
    const freq = String(r.FREQ || "").toUpperCase();
    const interval = Math.max(1, parseInt(r.INTERVAL, 10) || 1);
    const count = parseInt(r.COUNT, 10) || 0;
    const until = r.UNTIL ? icsDate(r.UNTIL) : "";
    const ende = until && until < bis ? until : bis;
    const byday = r.BYDAY ? r.BYDAY.split(",").map(x => WTAGE[x.replace(/^[+-]?\d+/, "").toUpperCase()]).filter(x => x !== undefined) : [];
    const out = [];
    const p = start.split("-").map(Number);
    const startMs = Date.UTC(p[0], p[1] - 1, p[2]);
    let n = 0;
    const push = (iso) => {
        n++;
        if (iso >= von && iso <= ende && exdates.indexOf(iso) < 0) out.push(iso);
    };
    if (freq === "DAILY" || (freq === "WEEKLY" && !byday.length)) {
        const step = (freq === "DAILY" ? 1 : 7) * interval;
        for (let i = 0; i < 4000; i++) {
            const iso = isoDate(new Date(startMs + i * step * 86400000));
            if (iso > ende || (count && n >= count)) break;
            push(iso);
        }
    } else if (freq === "WEEKLY") {
        const startDow = new Date(startMs).getUTCDay();
        const wkStart = startMs - ((startDow + 6) % 7) * 86400000; // Montag der Startwoche
        for (let w = 0; w < 600; w += interval) {
            let stop = false;
            for (let k = 0; k < 7; k++) {
                const ms = wkStart + (w * 7 + k) * 86400000;
                if (ms < startMs) continue;
                const d = new Date(ms);
                if (byday.indexOf(d.getUTCDay()) < 0) continue;
                const iso = isoDate(d);
                if (iso > ende || (count && n >= count)) { stop = true; break; }
                push(iso);
            }
            if (stop) break;
        }
    } else if (freq === "MONTHLY" || freq === "YEARLY") {
        for (let i = 0; i < 400; i++) {
            const d = freq === "MONTHLY"
                ? new Date(Date.UTC(p[0], p[1] - 1 + i * interval, p[2]))
                : new Date(Date.UTC(p[0] + i * interval, p[1] - 1, p[2]));
            if (d.getUTCDate() !== p[2]) continue; // 31. im Februar o. Ä. auslassen
            const iso = isoDate(d);
            if (iso > ende || (count && n >= count)) break;
            push(iso);
        }
    } else {
        push(start);
    }
    return out;
}
// -> { termine: [{d, t}], name }
function parseIcs(text) {
    const lines = unfold(text);
    if (!lines.some(l => /^BEGIN:VCALENDAR/i.test(l))) throw new Error("Das ist keine Kalenderdatei (iCal/ICS).");
    const von = addDays(todayIso(), -VERGANGEN_TAGE);
    const bis = addDays(todayIso(), ZUKUNFT_TAGE);
    let name = "";
    const termine = [];
    const seen = {};
    let ev = null;
    let depth = 0;
    lines.forEach(line => {
        if (/^BEGIN:VEVENT/i.test(line)) { ev = { ex: [] }; depth = 0; return; }
        if (!ev) {
            if (/^X-WR-CALNAME/i.test(line)) name = cleanText(sauberTitel(propValue(line)), 100);
            return;
        }
        if (/^BEGIN:/i.test(line)) { depth++; return; }  // z. B. VALARM
        if (/^END:VEVENT/i.test(line)) {
            if (ev.start && ev.status !== "CANCELLED") {
                const t = sauberTitel(ev.summary);
                const dates = ev.rrule ? expandRule(ev.start, ev.rrule, ev.ex, von, bis)
                    : (ev.start >= von && ev.start <= bis ? [ev.start] : []);
                dates.forEach(d => {
                    const k = d + "|" + t.toLowerCase();
                    if (seen[k] || termine.length >= MAX_TERMINE) return;
                    seen[k] = true;
                    termine.push({ d: d, t: t });
                });
            }
            ev = null;
            return;
        }
        if (/^END:/i.test(line)) { depth = Math.max(0, depth - 1); return; }
        if (depth > 0) return;
        const pn = propName(line);
        if (pn === "DTSTART") ev.start = icsDate(propValue(line));
        else if (pn === "SUMMARY") ev.summary = propValue(line);
        else if (pn === "RRULE") ev.rrule = propValue(line);
        else if (pn === "STATUS") ev.status = propValue(line).trim().toUpperCase();
        else if (pn === "EXDATE") propValue(line).split(",").forEach(x => { const d = icsDate(x); if (d) ev.ex.push(d); });
    });
    termine.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t < b.t ? -1 : 1));
    return { termine: termine, name: name };
}
function artenAus(termine) {
    const map = {};
    termine.forEach(x => { map[x.t] = (map[x.t] || 0) + 1; });
    return Object.keys(map).sort((a, b) => map[b] - map[a] || (a < b ? -1 : 1))
        .map(n => ({ name: n, farbe: farbeFuer(n), anzahl: map[n] }));
}
function zusammenfassung(termine) {
    const heute = todayIso();
    const kommend = termine.filter(x => x.d >= heute);
    return {
        anzahl: kommend.length,
        bis: termine.length ? termine[termine.length - 1].d : "",
        naechste: kommend.slice(0, 4),
        arten: artenAus(termine),
    };
}

// Lädt eine ICS-Datei vom Entsorger und wertet sie aus (wirft bei Fehlern)
function ladeIcs(url, timeoutSek) {
    const u = normalizeUrl(url);
    if (!u) throw new Error("Ungültiger oder nicht erlaubter Link.");
    let res;
    try {
        res = $http.send({
            url: u, method: "GET", timeout: timeoutSek || 20,
            headers: { "User-Agent": UA_BROWSER, "Accept": "text/calendar,text/plain;q=0.9,*/*;q=0.5", "Accept-Language": "de-DE,de;q=0.9" },
        });
    } catch (err) {
        throw new Error("Der Server des Entsorgers ist nicht erreichbar (" + err.message + ").");
    }
    if (res.statusCode === 404 || res.statusCode === 410) throw new Error("Unter diesem Link gibt es (nicht mehr) keine Datei.");
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error("Der Server des Entsorgers antwortet mit Status " + res.statusCode + ".");
    const text = textOf(res);
    if (!text) throw new Error("Die Datei war leer.");
    if (text.length > MAX_ICS_BYTES) throw new Error("Die Datei ist zu groß.");
    const p = parseIcs(text);
    if (!p.termine.length) throw new Error("In der Datei stehen keine aktuellen Abfuhrtermine.");
    return { url: u, termine: p.termine, name: p.name };
}

// ---------------------------------------------------------------------------------------------
// Sammlung „muellkalender“ (je Familie ein Datensatz)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (findCol(COL)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "text", max: 40, required: true },
                { name: "daten", type: "text", max: 400000 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE UNIQUE INDEX `idx_muellkalender_familie` ON `" + COL + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Müll] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Müll] Konnte Sammlung nicht anlegen: " + err.message);
        plog("fehler", "muell", "Müllkalender: Sammlung konnte nicht angelegt werden.", { details: err.message });
    }
}
function loadRec(familyId) {
    if (!familyId || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
function readData(rec) {
    if (!rec) return null;
    try {
        const d = JSON.parse(rec.getString("daten") || "{}");
        return (d && typeof d === "object" && d.quelle) ? d : null;
    } catch (e) { return null; }
}
function writeData(familyId, data) {
    ensureSchema();
    let rec = loadRec(familyId);
    if (!rec) {
        rec = new Record(findCol(COL));
        rec.set("familie", String(familyId));
    }
    rec.set("daten", JSON.stringify(data));
    $app.save(rec);
}
function publicInfo(d) {
    if (!d) return null;
    const z = zusammenfassung(d.termine || []);
    return {
        quelle: d.quelle, arten: z.arten, anzahl: z.anzahl, bis: z.bis,
        ausgeblendet: Array.isArray(d.ausgeblendet) ? d.ausgeblendet : [],
        anzeigen: d.anzeigen !== false, stand: Number(d.stand) || 0, geprueft: Number(d.geprueft) || 0,
        fehler: d.fehler || "",
    };
}
// Für die App. stand = bekannter Stand des Geräts -> bei gleichem Stand nur { unveraendert: true }
function forFamily(familyId, stand) {
    const d = readData(loadRec(familyId));
    if (!d) return { kalender: null, termine: [], stand: 0 };
    if (stand && Number(stand) === Number(d.stand)) return { unveraendert: true, stand: Number(d.stand) };
    const von = addDays(todayIso(), -VERGANGEN_TAGE);
    return { kalender: publicInfo(d), termine: (d.termine || []).filter(x => x.d >= von), stand: Number(d.stand) || 0 };
}

function requireAdmin(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!lib.isAdmin(e)) throw new Error("Nur Admins der Familie können den Müllkalender ändern.");
    return familyId;
}

// Neuer Müllkalender -> ersetzt den bisherigen der Familie
function speichern(familyId, quelle, termine, vonId) {
    const alt = readData(loadRec(familyId)) || {};
    const namen = {};
    termine.forEach(x => { namen[x.t] = true; });
    const d = {
        quelle: quelle,
        termine: termine,
        ausgeblendet: (Array.isArray(alt.ausgeblendet) ? alt.ausgeblendet : []).filter(n => namen[n]),
        anzeigen: alt.anzeigen !== false,
        stand: Date.now(), geprueft: Date.now(), fehler: "", von: vonId || "",
    };
    writeData(familyId, d);
    return d;
}

function uebernehmen(e, body) {
    const familyId = requireAdmin(e);
    const b = body || {};
    const geladen = ladeIcs(b.url, 25);
    const quelle = {
        art: "link", url: geladen.url,
        anbieter: cleanText(b.anbieter, 100) || hostOf(geladen.url).replace(/^www\./, ""),
        titel: cleanText(b.titel, 120) || geladen.name || "Müllkalender",
        adresse: cleanText(b.adresse, 200), dateiname: "",
    };
    speichern(familyId, quelle, geladen.termine, e.auth ? e.auth.id : "");
    console.log("[Müll] Familie " + familyId + ": Kalender von " + hostOf(geladen.url) + " übernommen (" + geladen.termine.length + " Termine).");
    return forFamily(familyId, 0);
}

function datei(e, body) {
    const familyId = requireAdmin(e);
    const b = body || {};
    const text = String(b.text || "");
    if (!text) throw new Error("Die Datei war leer.");
    if (text.length > MAX_ICS_BYTES) throw new Error("Die Datei ist zu groß.");
    const p = parseIcs(text);
    if (!p.termine.length) throw new Error("In der Datei stehen keine aktuellen Abfuhrtermine.");
    const quelle = {
        art: "datei", url: "",
        anbieter: cleanText(b.anbieter, 100),
        titel: p.name || cleanText(String(b.name || "").replace(/\.(ics|ical|ifb|icalendar)$/i, ""), 120) || "Müllkalender",
        adresse: cleanText(b.adresse, 200), dateiname: cleanText(b.name, 120),
    };
    speichern(familyId, quelle, p.termine, e.auth ? e.auth.id : "");
    return forFamily(familyId, 0);
}

function optionen(e, body) {
    const familyId = requireAdmin(e);
    const d = readData(loadRec(familyId));
    if (!d) throw new Error("Es ist noch kein Müllkalender eingerichtet.");
    const b = body || {};
    if (b.anzeigen !== undefined) d.anzeigen = !!b.anzeigen;
    if (Array.isArray(b.ausgeblendet)) {
        const namen = {};
        (d.termine || []).forEach(x => { namen[x.t] = true; });
        d.ausgeblendet = b.ausgeblendet.map(x => cleanText(x, 80)).filter(n => namen[n]).slice(0, 50);
    }
    d.stand = Date.now();
    writeData(familyId, d);
    return forFamily(familyId, 0);
}

function entfernen(e) {
    const familyId = requireAdmin(e);
    const rec = loadRec(familyId);
    if (rec) $app.delete(rec);
    return { kalender: null, termine: [], stand: 0 };
}

// Kalender mit Link neu laden. Fehler -> alte Termine bleiben, Fehler wird vermerkt.
function neuLaden(familyId) {
    const d = readData(loadRec(familyId));
    if (!d) throw new Error("Es ist noch kein Müllkalender eingerichtet.");
    if (d.quelle.art !== "link" || !d.quelle.url) throw new Error("Dieser Müllkalender stammt aus einer Datei – für neue Termine bitte die neue Datei hochladen.");
    try {
        const geladen = ladeIcs(d.quelle.url, 25);
        const vorher = JSON.stringify(d.termine || []);
        d.geprueft = Date.now();
        d.fehler = "";
        if (vorher !== JSON.stringify(geladen.termine)) {
            const namen = {};
            geladen.termine.forEach(x => { namen[x.t] = true; });
            d.termine = geladen.termine;
            d.ausgeblendet = (d.ausgeblendet || []).filter(n => namen[n]);
            d.stand = Date.now();
        }
        writeData(familyId, d);
        return { geaendert: vorher !== JSON.stringify(geladen.termine) };
    } catch (err) {
        d.geprueft = Date.now();
        d.fehler = err.message;
        writeData(familyId, d);
        throw err;
    }
}
function aktualisieren(e) {
    const familyId = requireAdmin(e);
    const key = "pinnMuellAktualisieren:" + familyId;
    try {
        const last = $app.store().get(key);
        if (last && Date.now() - last < 2 * 60 * 1000) throw new Error("Gerade erst aktualisiert – bitte in zwei Minuten noch einmal.");
    } catch (err) { if (/Gerade erst/.test(err.message)) throw err; }
    try { $app.store().set(key, Date.now()); } catch (err) { /* egal */ }
    const r = neuLaden(familyId);
    const out = forFamily(familyId, 0);
    out.geaendert = r.geaendert;
    return out;
}

// Admin-Fehlerprotokoll (pinn-protokoll.js) – fehlt die Datei, bleibt es beim Docker-Log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* Protokoll nicht verfügbar */ }
}

// Wöchentlich: alle Kalender mit Link nacheinander prüfen
function runCron() {
    if (!findCol(COL)) return;
    let recs = [];
    try { recs = $app.findRecordsByFilter(COL, "id != ''", "", 500, 0); } catch (e) { return; }
    const grenze = Date.now() - REFRESH_TAGE * 86400000;
    recs.forEach(rec => {
        const d = readData(rec);
        if (!d || d.quelle.art !== "link" || Number(d.geprueft || 0) > grenze) return;
        const fam = rec.getString("familie");
        try {
            const r = neuLaden(fam);
            console.log("[Müll] Familie " + fam + " geprüft" + (r.geaendert ? " – neue Termine übernommen." : " – unverändert."));
            plog("behoben", "muell", fam);
        } catch (err) {
            console.log("[Müll] Familie " + fam + ": " + err.message);
            plog("fehler", "muell", "Müllkalender konnte nicht neu geladen werden: " + err.message, { familie: fam });
        }
        pause(1500);
    });
}

// ---------------------------------------------------------------------------------------------
// Suche mit KI (Gemini + Google-Suche), Ergebnis wird vom Server geprüft
// ---------------------------------------------------------------------------------------------
function suchPrompt(adresse) {
    return [
        "Finde den offiziellen Abfallkalender (Müllabfuhr-Termine) für diese Adresse in Deutschland:",
        "„" + adresse + "“",
        "",
        "Ziel: ein Link, unter dem die Abfuhrtermine als iCal-/ICS-Datei direkt heruntergeladen werden können",
        "(Restmüll, Bio, Papier, Gelber Sack/Wertstoff usw.) – möglichst genau für diese Straße bzw. diesen Ortsteil.",
        "",
        "So gehst du vor:",
        "1. Finde heraus, welcher Entsorger/Abfallwirtschaftsbetrieb für den Ort zuständig ist und welches System er nutzt",
        "   (z. B. eigene Website, AbfallPlus/abfall.io, AbfallNavi/regioit, Awido, C-Trace, MyMüll, Abfall-App).",
        "2. Suche den ICS-/iCal-/Webcal-Link (oft „Kalender exportieren“, „iCal“, „In Kalender übernehmen“, „.ics“).",
        "   Ist der Link straßenabhängig und kennst du das Muster der Adresse sicher, bau ihn für diese Straße zusammen.",
        "3. Nenne zusätzlich die Seite(n) des Entsorgers, auf denen man den Kalender für die Straße selbst abrufen kann.",
        "",
        "Wichtig: Gib nur Links an, die du in den Suchergebnissen gesehen hast oder deren Aufbau du sicher kennst.",
        "Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (ohne weiteren Text) in diesem Format:",
        "{\"entsorger\": \"Name des Entsorgers\", \"ics\": [{\"url\": \"https://…\", \"beschreibung\": \"kurz, z. B. Abfuhrkalender 2026 Musterstraße\"}],",
        " \"seiten\": [{\"url\": \"https://…\", \"titel\": \"kurz\"}], \"hinweis\": \"ein Satz auf Deutsch, wie man auf der Seite zur ICS-Datei kommt\"}",
        "Höchstens 6 ICS-Links und 4 Seiten. Gibt es nichts, leere Listen.",
    ].join("\n");
}
function jsonAusText(text) {
    const t = String(text || "").replace(/```(?:json)?/gi, "").trim();
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
function geminiSuche(adresse, deadline) {
    const key = readEnv("PINN_GEMINI_KEY");
    if (!key) throw new Error("Die KI ist auf dem Server nicht eingerichtet (PINN_GEMINI_KEY fehlt in der .env).");
    const own = readEnv("PINN_GEMINI_MODELL");
    const list = own ? [own].concat(MODELLE.filter(m => m !== own)) : MODELLE.slice();
    const payload = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: suchPrompt(adresse) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
    });
    let lastError = "", quota = false, busy = false;
    for (let i = 0; i < list.length; i++) {
        const left = Math.floor((deadline - Date.now()) / 1000) - 25; // Zeit fürs Prüfen der Links lassen
        if (left < 15) break;
        let res;
        try {
            res = $http.send({
                url: API_BASE + encodeURIComponent(list[i]) + ":generateContent",
                method: "POST", timeout: Math.min(70, left),
                headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                body: payload,
            });
        } catch (err) { lastError = err.message; continue; }
        const body = parseJsonRes(res);
        if (res.statusCode === 404) { lastError = "Modell " + list[i] + " nicht gefunden"; continue; }
        if (res.statusCode === 429) { quota = true; lastError = "Kontingent aufgebraucht"; continue; }
        if (res.statusCode >= 500) { busy = true; lastError = "Google-Fehler " + res.statusCode; pause(1500); continue; }
        if (res.statusCode === 400 && /API key not valid|API_KEY_INVALID/i.test(bodyText(res))) throw new Error("Der Gemini-Schlüssel (PINN_GEMINI_KEY) ist ungültig.");
        if (res.statusCode === 400) { lastError = (body.error && body.error.message) || "Status 400"; continue; }
        if (res.statusCode !== 200) { lastError = "Status " + res.statusCode; continue; }
        const cand = body.candidates && body.candidates[0];
        const text = cand && cand.content && Array.isArray(cand.content.parts)
            ? cand.content.parts.filter(p => p && typeof p.text === "string" && !p.thought).map(p => p.text).join("") : "";
        const quellen = [];
        try {
            const gm = cand.groundingMetadata || {};
            (gm.groundingChunks || []).forEach(c => { if (c && c.web && c.web.uri) quellen.push({ url: c.web.uri, titel: cleanText(c.web.title, 100) }); });
        } catch (err) { /* ohne Quellen */ }
        const obj = jsonAusText(text) || {};
        obj.__quellen = quellen;
        obj.__modell = list[i];
        return obj;
    }
    if (quota) throw new Error("Das kostenlose Gemini-Kontingent ist gerade aufgebraucht – bitte später noch einmal versuchen oder den Link von Hand einfügen.");
    if (busy) throw new Error("Google Gemini ist gerade überlastet – bitte gleich noch einmal versuchen.");
    throw new Error("Die KI-Suche hat nicht geklappt (" + (lastError || "keine Antwort") + ").");
}

// Seite des Entsorgers laden und nach ICS-/Webcal-Links durchsuchen
function icsLinksAufSeite(url, deadline) {
    const left = Math.floor((deadline - Date.now()) / 1000);
    if (left < 8) return { links: [], basis: "" };
    let res;
    try {
        res = $http.send({ url: url, method: "GET", timeout: Math.min(10, left - 2),
            headers: { "User-Agent": UA_BROWSER, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "de-DE,de;q=0.9" } });
    } catch (err) { return { links: [], basis: "" }; }
    if (res.statusCode < 200 || res.statusCode >= 300) return { links: [], basis: "" };
    const html = String(bodyText(res) || "").slice(0, 2 * 1024 * 1024);
    // Kalenderdatei statt Seite?
    if (/BEGIN:VCALENDAR/i.test(html.slice(0, 2000))) return { links: [url], basis: url, istIcs: true };
    let basis = url;
    const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
    if (canon && /^https?:\/\//i.test(canon[1])) basis = canon[1];
    const links = [];
    const re = /(?:href|data-href|data-url|value)\s*=\s*["']([^"']+)["']|(webcals?:\/\/[^\s"'<>]+)/gi;
    let m;
    while ((m = re.exec(html)) && links.length < 12) {
        const raw = m[1] || m[2] || "";
        if (!/\.ics(\b|$|\?)|webcal|ical|icalendar|format=ics|\/ics(\/|\?|$)|type=ics|export=ics/i.test(raw)) continue;
        const abs = absoluteUrl(basis, raw);
        if (abs && links.indexOf(abs) < 0) links.push(abs);
    }
    return { links: links, basis: basis };
}

function suche(e, body) {
    const familyId = requireAdmin(e);
    if (!kiAktiv()) throw new Error("Die KI ist auf dem Server nicht eingerichtet – bitte den Link zur ICS-Datei einfügen oder die Datei hochladen.");
    const b = body || {};
    let adresse = cleanText(b.adresse, 200);
    if (!adresse) {
        const teile = [cleanText(b.strasse, 120), [cleanText(b.plz, 12), cleanText(b.ort, 80)].filter(Boolean).join(" ")].filter(Boolean);
        adresse = teile.join(", ");
    }
    if (!adresse && b.zuhause) {
        try {
            const z = require(`${__hooks}/pinn-zuhause.js`).get(familyId);
            if (z) adresse = [z.titel, [z.plz, z.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
        } catch (err) { adresse = ""; }
    }
    if (adresse.length < 3 || !/[a-zäöüß]{2}|\d{5}/i.test(adresse)) throw new Error("Bitte mindestens den Ort oder die Postleitzahl angeben.");
    // nicht mehrfach gleichzeitig / zu oft
    const lockKey = "pinnMuellSuche:" + familyId;
    try {
        const last = $app.store().get(lockKey);
        if (last && Date.now() - last < 20000) throw new Error("Die Suche läuft schon – bitte einen Moment warten.");
    } catch (err) { if (/läuft schon/.test(err.message)) throw err; }
    try { $app.store().set(lockKey, Date.now()); } catch (err) { /* egal */ }

    const started = Date.now();
    const deadline = started + SUCHE_BUDGET_MS;
    const ki = geminiSuche(adresse, deadline);
    const entsorger = cleanText(ki.entsorger, 100);

    // Kandidaten: ICS-Links der KI, dann Links aus den gefundenen Seiten
    const kandidaten = [];
    const beschreibung = {};
    const addK = (u, besch) => {
        const n = normalizeUrl(u);
        if (!n || kandidaten.indexOf(n) >= 0 || kandidaten.length >= MAX_KANDIDATEN) return;
        kandidaten.push(n);
        if (besch) beschreibung[n] = cleanText(besch, 120);
    };
    (Array.isArray(ki.ics) ? ki.ics : []).forEach(x => addK(x && (x.url || x), x && x.beschreibung));

    const seiten = [];
    const addS = (u, titel) => {
        const n = normalizeUrl(u);
        if (!n || seiten.some(s => s.url === n) || seiten.length >= 8) return;
        seiten.push({ url: n, titel: cleanText(titel, 100) || hostOf(n).replace(/^www\./, "") });
    };
    (Array.isArray(ki.seiten) ? ki.seiten : []).forEach(x => addS(x && (x.url || x), x && x.titel));
    const quellen = Array.isArray(ki.__quellen) ? ki.__quellen : [];

    // Seiten nach ICS-Links durchsuchen (KI-Seiten zuerst, dann die Suchquellen von Google)
    const zuScannen = seiten.map(s => s.url).concat(quellen.map(q => q.url)).slice(0, MAX_SEITEN + 3);
    let gescannt = 0;
    for (let i = 0; i < zuScannen.length && gescannt < MAX_SEITEN && kandidaten.length < MAX_KANDIDATEN; i++) {
        if (Date.now() > deadline - 30000) break;
        const r = icsLinksAufSeite(zuScannen[i], deadline);
        gescannt++;
        r.links.forEach(l => addK(l, ""));
        // Suchquellen (Weiterleitungs-Adressen von Google) als echte Seite merken
        if (i >= seiten.length && r.basis && r.basis !== zuScannen[i]) {
            const q = quellen[i - seiten.length];
            addS(r.basis, q && q.titel);
        }
    }

    // Jeden Kandidaten herunterladen und prüfen
    const treffer = [];
    const gleich = {};
    for (let i = 0; i < kandidaten.length; i++) {
        const left = Math.floor((deadline - Date.now()) / 1000);
        if (left < 6) break;
        try {
            const g = ladeIcs(kandidaten[i], Math.min(12, left - 2));
            const sig = JSON.stringify(g.termine.slice(0, 30));
            if (gleich[sig]) continue; // dieselben Termine unter anderem Link
            gleich[sig] = true;
            const z = zusammenfassung(g.termine);
            if (!z.anzahl) continue;
            treffer.push({
                url: g.url, anbieter: entsorger || hostOf(g.url).replace(/^www\./, ""),
                titel: beschreibung[kandidaten[i]] || g.name || "Abfallkalender",
                anzahl: z.anzahl, bis: z.bis, naechste: z.naechste, arten: z.arten,
            });
        } catch (err) { /* kein gültiger Kalender */ }
    }
    // reine Google-Weiterleitungen nicht als Seite anbieten
    const seitenOut = seiten.filter(s => !/vertexaisearch\.cloud\.google\.com|grounding-api-redirect/i.test(s.url)).slice(0, 5);
    console.log("[Müll] Suche „" + adresse + "“: " + treffer.length + " Kalender, " + seitenOut.length + " Seiten ("
        + Math.round((Date.now() - started) / 100) / 10 + " s, " + ki.__modell + ").");
    return {
        adresse: adresse, entsorger: entsorger,
        treffer: treffer, seiten: seitenOut,
        hinweis: cleanText(ki.hinweis, 300),
    };
}

function status() {
    return { ki: kiAktiv() };
}

module.exports = {
    COL, ensureSchema, forFamily, uebernehmen, datei, optionen, entfernen, aktualisieren, runCron, suche, status, parseIcs,
};
