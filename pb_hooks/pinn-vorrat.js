// pb_hooks/pinn-vorrat.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Pantry 2.0 (pinn. 1.30)
//  1. Reminder of the best-before date (BBD):
//     - Since 1.105 the pantry items live in the own area "vorrat" (pinn-bereiche.js; pantryItems, field "bestBefore",
//       ISO date). How many days beforehand to remind is in pantrySettings.mhdDays (1–14, default 3).
//     - ONE collective message per family in the morning (from 9 a.m.): once when an item enters the
//       lead time, and once on the day of expiry. If an item has already expired without there ever
//       having been a message (e.g. entered as expired), "expired" comes once (up to 3 days afterwards).
//     - Recipients: all profiles of the family except guests and children who have switched on
//       "Pantry expiring" under Settings → Notifications (default: on).
//     - It is remembered in pb_data/pinn_vorrat_erinnert.json - nothing comes twice after a restart.
//  2. Barcode lookup: product name, brand, quantity and a matching pantry category from the free
//     databases Open Food Facts, Open Beauty Facts, Open Products Facts and Open Pet Food Facts.
//     Only the barcode number is queried. Hits are kept in the cache for 60 days, misses for 3 days
//     (pb_data/pinn_barcodes.json, 3000 entries at most).
//
// Gentle on CPU and memory: the schedule runs hourly, but only really works once a day
// (then every family record is read exactly once). After saving, the app only checks the own family
// (9 a.m.–9 p.m.); only what has not been reported yet is reported then.

const STATUS_FILE = "/pb_data/pinn_vorrat_erinnert.json";
const CACHE_FILE = "/pb_data/pinn_barcodes.json";
const CACHE_STORE_KEY = "pinnBarcodeCache";
const CACHE_MAX = 3000;
const CACHE_VERSION = 2; // 2: categories from the most precise specification (1.30.1) - older entries are queried again
const HIT_TTL_MS = 60 * 24 * 3600 * 1000;
const MISS_TTL_MS = 3 * 24 * 3600 * 1000;
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 21;
const MHD_DAYS = [1, 2, 3, 5, 7, 14];
const UA = "pinn/1.30.1 (self-hosted family organizer; https://github.com/pinn-shost/pinn)";

// ---------------------------------------------------------------------------------------------
// Time (Central Europe, fixed EU daylight saving rule - like pinn-push.js / pinn-vertraege.js)
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
// Files
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
// BBD reminders
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

// What is due today for this family? -> [{ item, days, keys }]
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
    // Also remember as done without a registered device - otherwise it would come days later
    due.forEach(x => x.keys.forEach(k => { status.sent[k] = today; }));
    return delivered;
}

// opts: { familyId: only this family (immediate check after saving) }
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
// Barcode lookup
// ---------------------------------------------------------------------------------------------
const SOURCES = [
    { id: "off", host: "https://world.openfoodfacts.org" },
    { id: "obf", host: "https://world.openbeautyfacts.org" },
    { id: "opf", host: "https://world.openproductsfacts.org" },
    { id: "opff", host: "https://world.openpetfoodfacts.org" },
];
const FIELDS = "product_name,product_name_de,product_name_en,generic_name,generic_name_de,abbreviated_product_name,brands,quantity,categories_tags";

// Category hint (IDs of the default categories in the app, index.html → PANTRY_DEFAULT_CATEGORIES)
// The databases return categories from general to specific, e.g. for cornflakes:
// plant-based-foods-and-beverages → … → breakfast-cereals → corn-flakes. They are therefore evaluated
// from the back (the most precise specification first); pure umbrella terms like "Plant-based foods and
// beverages" are skipped - otherwise cornflakes, pasta & co. would end up with the beverages.
const GENERIC_TAGS = [
    "plant-based-foods-and-beverages", "plant-based-foods", "foods", "food", "groceries",
    "non-food-products", "open-beauty-facts", "products", "animal-foods", "fresh-foods",
    "dried-products", "dried-products-to-be-rehydrated", "unsweetened-products", "sweetened-products",
    "organic-products", "vegan-products", "vegetarian-products",
];
const CATEGORY_RULES = [
    [/\bfrozen\b|surgel|tiefk/, "tiefkuehl"],
    [/\b(beverages?|drinks?|waters?|juices?|sodas?|coffees?|teas?|beers?|wines?|spirits|nectars?|lemonades?|syrups?|smoothies?)\b/, "getraenke"],
    [/breakfast|corn ?flakes?|flakes|muesli|granola|porridge|oat|cereal bars?|breakfast cereals?|cereals? with|puffed|extruded cereals?|jams?\b|marmalade|honeys?\b|spreads?\b|nut butters?|hazelnut spreads?/, "fruehstueck"],
    [/snacks?\b|sweets?\b|chocolates?|candies|candy|confection|biscuits?|cookies?|crisps?|chips\b|gums?\b|cakes?\b|pastr|wafers?|gummies|bonbons?/, "suesses"],
    [/dair|\bmilks?\b|cheeses?|yogh?urts?|creams?\b|butters?\b|quark|kaese|eggs?\b/, "milch"],
    [/meats?\b|fish|seafood|sausages?|\bhams?\b|poultry|chicken|beef|pork|salmon|tuna/, "fleisch_fisch"],
    [/breads?\b|bakery|baked goods|toast|rolls?\b|brioche|croissants?/, "brot"],
    [/pastas?\b|\brices?\b|noodles?|couscous|quinoa|potato|lentils?|legumes?|bulgur|cereal grains?|grains?\b/, "nudeln_reis"],
    [/canned|preserv|tinned|conserve|tomato pastes?|tomato concentrates?/, "konserven"],
    [/flours?\b|sugars?\b|baking|yeasts?|cake mix|dessert mix/, "backen"],
    [/spices?\b|condiments?|sauces?\b|\boils?\b|vinegars?|\bsalts?\b|peppers?\b|herbs?\b|ketchup|mustards?|mayonnaise|dressings?|stocks?\b|broths?/, "gewuerze"],
    [/fruits?\b|vegetables?|salads?\b/, "obst_gemuese"],
    [/clean|detergent|dishwash|laundry|washing|household|paper towel|toilet paper|trash|bin bag/, "haushalt"],
];
function categoryHint(source, tags) {
    if (source === "obf") return "drogerie";
    const list = (Array.isArray(tags) ? tags : [])
        .map(x => String(x || "").toLowerCase().replace(/^[a-z]{2}:/, ""))
        .filter(x => x && GENERIC_TAGS.indexOf(x) < 0)
        .map(x => x.replace(/-/g, " "));
    for (let i = list.length - 1; i >= 0; i--) {
        for (let k = 0; k < CATEGORY_RULES.length; k++) if (CATEGORY_RULES[k][0].test(list[i])) return CATEGORY_RULES[k][1];
    }
    if (source === "opf") return "haushalt";
    return "sonstiges";
}
function clean(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }

function bodyText(res) {
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* continue */ }
    try { return toString(res.body); } catch (e) { /* continue */ }
    return "";
}
function parseJson(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* continue */ }
    try { if (res.json !== undefined && res.json !== null) return res.json; } catch (e) { /* ignore */ }
    return null;
}

function loadCache() {
    try {
        const raw = $app.store().get(CACHE_STORE_KEY);
        if (raw && typeof raw === "object") return raw;
    } catch (e) { /* from the file */ }
    const o = readJson(CACHE_FILE) || {};
    try { $app.store().set(CACHE_STORE_KEY, o); } catch (e) { /* ignore */ }
    return o;
}
function saveCache(c) {
    const keys = Object.keys(c);
    if (keys.length > CACHE_MAX) {
        keys.sort((a, b) => (c[a].ts || 0) - (c[b].ts || 0));
        keys.slice(0, keys.length - CACHE_MAX).forEach(k => { delete c[k]; });
    }
    try { $app.store().set(CACHE_STORE_KEY, c); } catch (e) { /* ignore */ }
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
    if (hit && hit.v === CACHE_VERSION && hit.ts && Date.now() - hit.ts < (hit.d && hit.d.gefunden ? HIT_TTL_MS : MISS_TTL_MS)) return hit.d;
    let failures = 0;
    for (let i = 0; i < SOURCES.length; i++) {
        try {
            const r = queryOne(SOURCES[i], code);
            if (r) {
                cache[code] = { v: CACHE_VERSION, ts: Date.now(), d: r };
                saveCache(cache);
                return r;
            }
        } catch (e) {
            failures++;
            console.log("[Vorrat] Barcode-Abfrage " + SOURCES[i].id + ": " + e.message);
        }
    }
    const miss = { gefunden: false };
    // Only remember if really all have answered (otherwise try again later)
    if (!failures) {
        cache[code] = { v: CACHE_VERSION, ts: Date.now(), d: miss };
        saveCache(cache);
    } else if (failures === SOURCES.length) {
        return { gefunden: false, netz: true };
    }
    return miss;
}

module.exports = { runReminders, lookupBarcode, messageFor, dueItems, categoryHint };
