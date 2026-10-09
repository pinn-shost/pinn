// pb_hooks/pinn-vorrat.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Vorrat 2.0 (pinn. 1.30)
//  1. Erinnerung an das Mindesthaltbarkeitsdatum (MHD):
//     - Die Vorrats-Artikel liegen wie bisher im Familien-Datensatz (pantryItems, Feld "bestBefore",
//       ISO-Datum). Wie viele Tage vorher erinnert wird, steht in pantrySettings.mhdDays (1–14, Standard 3).
//     - Je Familie EINE Sammel-Nachricht am Morgen (ab 9 Uhr): einmal, wenn ein Artikel in den
//       Vorlauf kommt, und einmal am Tag des Ablaufs. Ist ein Artikel schon abgelaufen, ohne dass es
//       je eine Meldung gab (z. B. abgelaufen eingetragen), kommt einmal „abgelaufen“ (bis 3 Tage danach).
//     - Empfänger: alle Profile der Familie außer Gästen und Kindern, die unter Einstellungen →
//       Benachrichtigungen „Vorrat läuft ab“ eingeschaltet haben (Standard: an).
//     - Gemerkt wird in pb_data/pinn_vorrat_erinnert.json - nach einem Neustart kommt nichts doppelt.
//  2. Barcode-Abfrage: Produktname, Marke, Menge und eine passende Vorrats-Kategorie aus den freien
//     Datenbanken Open Food Facts, Open Beauty Facts, Open Products Facts und Open Pet Food Facts.
//     Abgefragt wird nur die Barcode-Nummer. Treffer werden 60 Tage, Fehlanzeigen 3 Tage im
//     Zwischenspeicher (pb_data/pinn_barcodes.json, höchstens 3000 Einträge) gehalten.
//
// Schonend für CPU und Speicher: der Zeitplan läuft stündlich, arbeitet aber nur einmal am Tag
// wirklich (dann wird jeder Familien-Datensatz genau einmal gelesen). Nach dem Speichern prüft die App
// nur die eigene Familie (9–21 Uhr); gemeldet wird dann nur, was noch nicht gemeldet wurde.

const STATUS_FILE = "/pb_data/pinn_vorrat_erinnert.json";
const CACHE_FILE = "/pb_data/pinn_barcodes.json";
const CACHE_STORE_KEY = "pinnBarcodeCache";
const CACHE_MAX = 3000;
const HIT_TTL_MS = 60 * 24 * 3600 * 1000;
const MISS_TTL_MS = 3 * 24 * 3600 * 1000;
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 21;
const MHD_DAYS = [1, 2, 3, 5, 7, 14];
const UA = "pinn/1.30 (self-hosted family organizer; https://github.com/pinn-shost/pinn)";

// ---------------------------------------------------------------------------------------------
// Zeit (Mitteleuropa, feste EU-Sommerzeitregel - wie pinn-push.js / pinn-vertraege.js)
// ---------------------------------------------------------------------------------------------
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function lastSundayUtc(year, month) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1, 0, 0);
}
function tzOffsetMs(utcMs) {
    const y = new Date(utcMs).getUTCFullYear();
    return (utcMs >= lastSundayUtc(y, 2) && utcMs < lastSundayUtc(y, 9)) ? 7200000 : 3600000;
}
function wallNow() {
    const now = Date.now();
    const d = new Date(now + tzOffsetMs(now));
    return { iso: d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()), hour: d.getUTCHours() };
}
function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function isoToUtc(iso) { const p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function daysBetween(fromIso, toIso) { return Math.round((isoToUtc(toIso) - isoToUtc(fromIso)) / 86400000); }
function addDays(iso, n) {
    const d = new Date(isoToUtc(iso) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

// ---------------------------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------------------------
function readJson(path) {
    try {
        const calendarSync = require(`${__hooks}/calendar-sync.js`);
        const o = JSON.parse(calendarSync.bytesToText($os.readFile(path)));
        return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
}
function writeJson(path, obj) {
    try { $os.writeFile(path, JSON.stringify(obj), 420); } catch (e) { console.log("[Vorrat] " + path + " nicht speicherbar: " + e.message); }
}
function readStatus() {
    const o = readJson(STATUS_FILE) || {};
    if (!o.sent || typeof o.sent !== "object") o.sent = {};
    if (typeof o.lastDaily !== "string") o.lastDaily = "";
    return o;
}
function pruneStatus(s, today) {
    const cutoff = addDays(today, -60);
    Object.keys(s.sent).forEach(k => { if (typeof s.sent[k] !== "string" || s.sent[k] < cutoff) delete s.sent[k]; });
}

// ---------------------------------------------------------------------------------------------
// MHD-Erinnerungen
// ---------------------------------------------------------------------------------------------
function num(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isNaN(n) ? 0 : n; }
function isChild(m) {
    if (!m) return false;
    if (m.kid && m.kid.enabled) return true;
    return /^(kind|tochter|sohn)$/i.test(String(m.role || "").trim());
}
function leadDays(data) {
    const s = (data && data.pantrySettings && typeof data.pantrySettings === "object") ? data.pantrySettings : {};
    const d = parseInt(s.mhdDays, 10);
    return MHD_DAYS.indexOf(d) >= 0 ? d : 3;
}
function whenText(d) {
    if (d < -1) return "seit " + (-d) + " Tagen abgelaufen";
    if (d === -1) return "seit gestern abgelaufen";
    if (d === 0) return "heute";
    if (d === 1) return "morgen";
    return "in " + d + " Tagen";
}

// Was ist für diese Familie heute fällig? -> [{ item, days, keys }]
function dueItems(familyId, data, today, status) {
    const lead = leadDays(data);
    const items = Array.isArray(data.pantryItems) ? data.pantryItems : [];
    const out = [];
    items.forEach(p => {
        if (!p || typeof p.id !== "string" || !p.name || !isIso(p.bestBefore) || num(p.qty) <= 0) return;
        const d = daysBetween(today, p.bestBefore);
        const base = familyId + "|" + p.id + "|" + p.bestBefore + "|";
        const any = ["bald", "heute", "ab"].some(ph => status.sent[base + ph]);
        if (d === 0) {
            if (!status.sent[base + "heute"]) out.push({ item: p, days: d, keys: [base + "heute"] });
        } else if (d > 0 && d <= lead) {
            if (!any) out.push({ item: p, days: d, keys: [base + "bald"] });
        } else if (d < 0 && d >= -3) {
            if (!any) out.push({ item: p, days: d, keys: [base + "ab"] });
        }
    });
    out.sort((a, b) => a.days - b.days || String(a.item.name).localeCompare(String(b.item.name)));
    return out;
}

function messageFor(list) {
    const name = p => String(p.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    let titel;
    if (list.length === 1) {
        const x = list[0];
        titel = x.days < 0 ? "⚠️ Abgelaufen: " + name(x.item)
            : x.days === 0 ? "⏳ Läuft heute ab: " + name(x.item)
            : x.days === 1 ? "⏳ Läuft morgen ab: " + name(x.item)
            : "⏳ Läuft bald ab: " + name(x.item);
    } else {
        titel = "⏳ " + list.length + " Vorrats-Artikel laufen bald ab";
    }
    const shown = list.slice(0, 8).map(x => name(x.item) + " (" + whenText(x.days) + ")");
    let first = shown.join(" · ");
    if (list.length > 8) first += " · +" + (list.length - 8);
    const text = first + "\nTippe hier für Rezeptideen mit dem, was da ist.";
    return { titel: titel, text: text };
}

function recipientsOf(familyId, data) {
    const push = require(`${__hooks}/pinn-push.js`);
    const members = Array.isArray(data.members) ? data.members : [];
    let users = [];
    try { users = $app.findRecordsByFilter("benutzer", "familie = {:f}", "", 0, 0, { f: familyId }); } catch (e) { users = []; }
    return users.filter(u => {
        if (u.getString("rolle") === "gast") return false;
        const mid = u.getString("mitglied");
        const m = mid ? members.find(x => x && x.id === mid) : null;
        if (isChild(m)) return false;
        let st = null;
        try { st = push.readSettings(u); } catch (e) { st = null; }
        return !st || st.vorrat !== false;
    });
}

function remindFamily(familyId, today, status) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const push = require(`${__hooks}/pinn-push.js`);
    const data = lib.loadFamilyDataFor(familyId) || {};
    const due = dueItems(familyId, data, today, status);
    if (!due.length) return 0;
    const msg = messageFor(due);
    let delivered = 0;
    recipientsOf(familyId, data).forEach(u => {
        try {
            delivered += push.notifyUser(u.id, { titel: msg.titel, text: msg.text, url: "/?vorrat=ablauf", tag: "vorrat-ablauf-" + today, urgency: "normal" });
        } catch (e) { console.log("[Vorrat] Push fehlgeschlagen: " + e.message); }
    });
    // Auch ohne angemeldetes Gerät als erledigt merken - sonst käme sie Tage später nach
    due.forEach(x => x.keys.forEach(k => { status.sent[k] = today; }));
    return delivered;
}

// opts: { familyId: nur diese Familie (sofortige Prüfung nach dem Speichern) }
function runReminders(opts) {
    const o = opts || {};
    const now = wallNow();
    if (now.hour < SEND_FROM_HOUR) return { skipped: "zu früh" };
    const status = readStatus();
    pruneStatus(status, now.iso);
    let sent = 0;
    if (o.familyId) {
        if (now.hour >= SEND_UNTIL_HOUR) return { skipped: "zu spät" };
        sent = remindFamily(String(o.familyId), now.iso, status);
        writeJson(STATUS_FILE, status);
        return { sent: sent };
    }
    if (status.lastDaily === now.iso) return { skipped: "heute schon erledigt" };
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    lib.allFamilies().forEach(f => {
        try { sent += remindFamily(f.id, now.iso, status); } catch (e) { console.log("[Vorrat] Familie " + f.id + ": " + e.message); }
    });
    status.lastDaily = now.iso;
    writeJson(STATUS_FILE, status);
    if (sent) console.log("[Vorrat] " + sent + " MHD-Erinnerung(en) verschickt.");
    return { sent: sent };
}

// ---------------------------------------------------------------------------------------------
// Barcode-Abfrage
// ---------------------------------------------------------------------------------------------
const SOURCES = [
    { id: "off", host: "https://world.openfoodfacts.org" },
    { id: "obf", host: "https://world.openbeautyfacts.org" },
    { id: "opf", host: "https://world.openproductsfacts.org" },
    { id: "opff", host: "https://world.openpetfoodfacts.org" },
];
const FIELDS = "product_name,product_name_de,product_name_en,generic_name,generic_name_de,abbreviated_product_name,brands,quantity,categories_tags";

// Kategorie-Hinweis (IDs der Standard-Kategorien in der App, index.html → PANTRY_DEFAULT_CATEGORIES)
const CATEGORY_RULES = [
    [/frozen|surgel|tiefk/, "tiefkuehl"],
    [/beverage|drink|water|juice|soda|coffee|tea|beer|wine|spirit|milk-drink|getraenk/, "getraenke"],
    [/dair|milk|cheese|yogurt|yoghurt|cream|butter|quark|kaese/, "milch"],
    [/meat|fish|seafood|sausage|ham|poultry|chicken|beef|pork|salmon|tuna/, "fleisch_fisch"],
    [/bread|bakery|baked|toast|roll|brioche|croissant/, "brot"],
    [/pasta|rice|noodle|cereal-grain|grain|couscous|quinoa|potato|lentil|legume|bulgur/, "nudeln_reis"],
    [/canned|preserv|tinned|conserve/, "konserven"],
    [/flour|sugar|baking|yeast|cake-mix|dessert-mix/, "backen"],
    [/spice|condiment|sauce|oil|vinegar|salt|pepper|herb|ketchup|mustard|mayonnaise|dressing|stock|broth/, "gewuerze"],
    [/breakfast|muesli|cereal|jam|spread|honey|cornflake|oat/, "fruehstueck"],
    [/snack|sweet|chocolate|candy|confection|biscuit|cookie|chip|crisp|candies|gum/, "suesses"],
    [/fruit|vegetable|salad|plant-based-foods-and-beverages/, "obst_gemuese"],
    [/clean|detergent|dishwash|laundry|washing|household|paper-towel|toilet-paper|trash|bin-bag/, "haushalt"],
];
function categoryHint(source, tags) {
    const t = (Array.isArray(tags) ? tags : []).join(" ").toLowerCase();
    if (source === "obf") return "drogerie";
    for (let i = 0; i < CATEGORY_RULES.length; i++) if (CATEGORY_RULES[i][0].test(t)) return CATEGORY_RULES[i][1];
    if (source === "opf") return "haushalt";
    return "sonstiges";
}
function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }

function bodyText(res) {
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* weiter */ }
    try { return toString(res.body); } catch (e) { /* weiter */ }
    return "";
}
function parseJson(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* weiter */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* egal */ }
    return null;
}

function loadCache() {
    try {
        const raw = $app.store().get(CACHE_STORE_KEY);
        if (raw && typeof raw === "object") return raw;
    } catch (e) { /* aus der Datei */ }
    const o = readJson(CACHE_FILE) || {};
    try { $app.store().set(CACHE_STORE_KEY, o); } catch (e) { /* egal */ }
    return o;
}
function saveCache(c) {
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) {
        keys.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0));
        keys.slice(0, keys.length - CACHE_MAX).forEach(k => { delete c[k]; });
    }
    try { $app.store().set(CACHE_STORE_KEY, c); } catch (e) { /* egal */ }
    writeJson(CACHE_FILE, c);
}

function validCode(code) {
    if (!/^\d{8}$|^\d{13}$|^\d{14}$/.test(code)) return false;
    const d = code.split("").map(Number);
    const check = d.pop();
    let sum = 0;
    d.reverse().forEach((v, i) => { sum += v * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check;
}

function queryOne(src, code) {
    const res = $http.send({
        url: src.host + "/api/v2/product/" + code + ".json?fields=" + FIELDS + "&lc=de",
        method: "GET",
        headers: { "User-Agent": UA, "Accept": "application/json" },
        timeout: 7,
    });
    if (res.statusCode === 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) throw new Error("Status " + res.statusCode);
    const body = parseJson(res);
    if (!body || body.status !== 1 || !body.product) return null;
    const p = body.product;
    const name = clean(p.product_name_de || p.product_name || p.abbreviated_product_name || p.generic_name_de || p.generic_name || p.product_name_en, 80);
    if (!name) return null;
    const brand = clean(String(p.brands || "").split(",")[0], 40);
    return {
        gefunden: true,
        name: name,
        marke: brand && name.toLowerCase().indexOf(brand.toLowerCase()) < 0 ? brand : "",
        menge: clean(p.quantity, 30),
        kategorie: categoryHint(src.id, p.categories_tags),
        quelle: src.id,
    };
}

function lookupBarcode(rawCode) {
    let code = String(rawCode || "").replace(/\D/g, "");
    if (code.length === 12) code = "0" + code;
    if (!validCode(code)) return { gefunden: false, error: "Ungültiger Barcode." };
    const cache = loadCache();
    const hit = cache[code];
    if (hit && hit.ts && Date.now() - hit.ts < (hit.d && hit.d.gefunden ? HIT_TTL_MS : MISS_TTL_MS)) return hit.d;
    let failures = 0;
    for (let i = 0; i < SOURCES.length; i++) {
        try {
            const r = queryOne(SOURCES[i], code);
            if (r) {
                cache[code] = { ts: Date.now(), d: r };
                saveCache(cache);
                return r;
            }
        } catch (e) {
            failures++;
            console.log("[Vorrat] Barcode-Abfrage " + SOURCES[i].id + ": " + e.message);
        }
    }
    const miss = { gefunden: false };
    // Nur merken, wenn wirklich alle geantwortet haben (sonst später noch einmal versuchen)
    if (!failures) {
        cache[code] = { ts: Date.now(), d: miss };
        saveCache(cache);
    } else if (failures === SOURCES.length) {
        return { gefunden: false, netz: true };
    }
    return miss;
}

module.exports = { runReminders, lookupBarcode, messageFor, dueItems };
