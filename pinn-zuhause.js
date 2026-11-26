// pb_hooks/pinn-zuhause.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// The family's "Home" (Settings → Home)
//
// What it is for:
//  - Weather (overview, clock line, dashboard) only uses these coordinates now - the app no longer asks for the
//    location on start (iOS does not remember the permission for home screen apps).
//  - Federal state -> statutory public holidays (calculated by the app itself) and school holidays (here via the
//    server, OpenHolidays API) in the calendar.
//  - Sunrise/sunset (calculated by the app itself from the coordinates, also offline).
//  - Location: the place "Home" for push on arrival/departure is created or moved automatically
//    (pinn-ortung.js -> syncHome), the family map starts at Home.
//
// Only this server talks to third-party servers, never the app:
//  - Address suggestions while typing: Photon (photon.komoot.io, OpenStreetMap, made for search-as-you-type),
//    as a fallback Nominatim.
//  - Weather: Open-Meteo (without a key), cached for 15 minutes per place. 16-day preview with
//    details (feels-like, wind, gusts, UV, sunshine hours, rainfall); the hourly course of a day only on
//    request (tap on the day, cached for 30 min.).
//  - Holiday weather (packing list with destination and period): up to 16 days ahead the forecast, after that
//    empirical values - the average of the same days of the last three years (Open-Meteo archive,
//    cached for 7 days). At the seaside additionally the water temperature (Open-Meteo Marine).
//  - School holidays: OpenHolidays API (openholidaysapi.org), cached per federal state and year in pb_data/pinn_ferien
//    (14 days, without a connection the last state is kept).
//
// Data per family: collection "zuhause" (locked, only via the routes in zuhause.pb.js), field "daten":
//   { lat, lon, titel, zusatz, adresse, ort, plz, land, bundesland, bundeslandName,
//     kalender: { feiertage, ferien }, von, stand }

const COL = "zuhause";
const FERIEN_DIR = "/pb_data/pinn_ferien";
const UA = "pinn-familienapp/1.0 (selbst gehostet)";
const WETTER_TTL_MS = 15 * 60 * 1000;
const SUCHE_TTL_MS = 24 * 60 * 60 * 1000;
const FERIEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const FERIEN_LEER_TTL_MS = 2 * 24 * 60 * 60 * 1000;

const LAENDER = {
    BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg",
    HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen",
    RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen",
};
// further spellings (English, without umlauts) as Photon/Nominatim sometimes return them
const LAENDER_ALIAS = {
    "bavaria": "BY", "lower saxony": "NI", "north rhine-westphalia": "NW", "north rhine westphalia": "NW",
    "rhineland-palatinate": "RP", "saxony": "SN", "saxony-anhalt": "ST", "thuringia": "TH", "hesse": "HE",
    "mecklenburg-western pomerania": "MV", "mecklenburg-west pomerania": "MV", "baden-wuerttemberg": "BW",
    "baden-wurttemberg": "BW", "thueringen": "TH", "thuringen": "TH", "free state of bavaria": "BY",
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
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
function readText(path) {
    try { return require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(path)); } catch (e) { return ""; }
}
function readJsonFile(path) {
    try {
        const o = JSON.parse(readText(path));
        return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
}
function writeJsonFile(path, obj) {
    try { $os.writeFile(path, JSON.stringify(obj), 420); } catch (e) { console.log("[Zuhause] " + path + " nicht speicherbar: " + e.message); }
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 120); }
function round6(n) { return Math.round(Number(n) * 1e6) / 1e6; }
function validCoords(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
}
function cacheGet(key, ttl) {
    try {
        const c = $app.store().get(key);
        if (c && Date.now() - c.ts < ttl) return c.data;
    } catch (e) { /* continue */ }
    return null;
}
function cacheSet(key, data) {
    try { $app.store().set(key, { ts: Date.now(), data: data }); } catch (e) { /* ignore */ }
}
function httpGet(url, timeout) {
    return $http.send({ url: url, method: "GET", headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "de-DE,de;q=0.9" }, timeout: timeout || 12 });
}

function stateCode(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    if (/^DE-[A-Z]{2}$/.test(raw)) return LAENDER[raw.slice(3)] ? raw.slice(3) : "";
    if (LAENDER[raw.toUpperCase()]) return raw.toUpperCase();
    const n = raw.toLowerCase();
    const hit = Object.keys(LAENDER).find(k => LAENDER[k].toLowerCase() === n);
    if (hit) return hit;
    const plain = n.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    const hit2 = Object.keys(LAENDER).find(k => LAENDER[k].toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue") === plain);
    if (hit2) return hit2;
    return LAENDER_ALIAS[n] || LAENDER_ALIAS[plain] || "";
}

// ---------------------------------------------------------------------------------------------
// Collection "zuhause" (one record per family)
// ---------------------------------------------------------------------------------------------
function ensureSchema() {
    if (findCol(COL)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: COL,
            fields: [
                { name: "familie", type: "text", max: 40, required: true },
                { name: "daten", type: "text", max: 20000 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE UNIQUE INDEX `idx_zuhause_familie` ON `" + COL + "` (`familie`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Zuhause] Sammlung \"" + COL + "\" angelegt.");
    } catch (err) {
        console.log("[Zuhause] Konnte Sammlung nicht anlegen: " + err.message);
    }
    try { $os.mkdirAll(FERIEN_DIR, 493); } catch (e) { /* ignore */ }
}

function loadRec(familyId) {
    if (!familyId || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "familie = {:f}", { f: String(familyId) }); } catch (e) { return null; }
}
function readData(rec) {
    if (!rec) return null;
    try {
        const d = JSON.parse(rec.getString("daten") || "{}");
        return (d && typeof d === "object") ? d : null;
    } catch (e) { return null; }
}
function defaultKalender() { return { feiertage: true, ferien: true }; }

// The family's Home (or null). kalender is always set, even without an address.
function get(familyId) {
    const d = readData(loadRec(familyId));
    if (!d || !validCoords(d.lat, d.lon)) return null;
    return publicHome(d);
}
// Calendar options and federal state - also exist without an address (federal state chosen by hand)
function optionsOf(familyId) {
    const d = readData(loadRec(familyId)) || {};
    const bl = LAENDER[d.bundesland] ? d.bundesland : "";
    return Object.assign(defaultKalender(), (d.kalender && typeof d.kalender === "object") ? d.kalender : {},
        { bundesland: bl, bundeslandName: bl ? LAENDER[bl] : "" });
}
function info(familyId) {
    return { zuhause: get(familyId), optionen: optionsOf(familyId) };
}
function publicHome(d) {
    const land = String(d.land || "").toUpperCase();
    const bl = LAENDER[d.bundesland] ? d.bundesland : "";
    return {
        lat: round6(d.lat), lon: round6(d.lon),
        titel: d.titel || "", zusatz: d.zusatz || "", adresse: d.adresse || "",
        ort: d.ort || "", plz: d.plz || "", land: land,
        bundesland: bl, bundeslandName: bl ? LAENDER[bl] : "",
        kalender: Object.assign(defaultKalender(), (d.kalender && typeof d.kalender === "object") ? d.kalender : {}),
        stand: Number(d.stand) || 0,
    };
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

// ---------------------------------------------------------------------------------------------
// Save / options / remove (family admins only)
// ---------------------------------------------------------------------------------------------
function requireAdmin(e) {
    const lib = require(`${__hooks}/pinn-benutzer.js`);
    const familyId = lib.familyOf(e);
    if (!familyId) throw new Error("Dein Profil gehört zu keiner Familie.");
    if (!lib.isAdmin(e)) throw new Error("Nur Admins der Familie können das Zuhause ändern.");
    return familyId;
}

function save(e, body) {
    const familyId = requireAdmin(e);
    const b = body || {};
    if (!validCoords(b.lat, b.lon)) throw new Error("Bitte eine Adresse aus den Vorschlägen wählen.");
    const old = readData(loadRec(familyId)) || {};
    const d = {
        lat: round6(b.lat), lon: round6(b.lon),
        titel: cleanText(b.titel, 120), zusatz: cleanText(b.zusatz, 160),
        ort: cleanText(b.ort, 80), plz: cleanText(b.plz, 12),
        land: cleanText(b.land, 2).toUpperCase(),
        bundesland: stateCode(b.bundesland) || "",
        kalender: Object.assign(defaultKalender(), (old.kalender && typeof old.kalender === "object") ? old.kalender : {}),
        von: e.auth ? e.auth.id : "", stand: Date.now(),
    };
    d.adresse = cleanText(b.adresse, 300) || [d.titel, d.zusatz].filter(Boolean).join(", ");
    // Federal state/country missing (e.g. "Use current location" without an address) -> look it up ourselves
    if (!d.land || (d.land === "DE" && !d.bundesland)) {
        try {
            const hit = reverse(d.lat, d.lon).treffer[0];
            if (hit) {
                if (!d.land) d.land = hit.land;
                if (!d.bundesland) d.bundesland = hit.bundesland;
                if (!d.titel) { d.titel = hit.titel; d.zusatz = hit.zusatz; d.ort = hit.ort; d.plz = hit.plz; d.adresse = hit.adresse; }
            }
        } catch (err) { /* save without a federal state - selectable in the settings */ }
    }
    if (!d.titel) d.titel = "Zuhause";
    writeData(familyId, d);
    afterChange(familyId);
    return info(familyId);
}

function setOptions(e, body) {
    const familyId = requireAdmin(e);
    const b = body || {};
    const d = readData(loadRec(familyId)) || {};
    const k = Object.assign(defaultKalender(), (d.kalender && typeof d.kalender === "object") ? d.kalender : {});
    if (b.feiertage !== undefined) k.feiertage = !!b.feiertage;
    if (b.ferien !== undefined) k.ferien = !!b.ferien;
    d.kalender = k;
    if (b.bundesland !== undefined) {
        const bl = stateCode(b.bundesland);
        d.bundesland = bl;
        if (bl && !d.land) d.land = "DE";
    }
    d.stand = Date.now();
    writeData(familyId, d);
    return info(familyId);
}

function remove(e) {
    const familyId = requireAdmin(e);
    const d = readData(loadRec(familyId)) || {};
    // Calendar options and federal state stay (public holidays can still be shown)
    const keep = { kalender: Object.assign(defaultKalender(), d.kalender || {}), bundesland: d.bundesland || "", land: d.land || "", stand: Date.now() };
    writeData(familyId, keep);
    return info(familyId);
}

function afterChange(familyId) {
    try { require(`${__hooks}/pinn-ortung.js`).syncHome(familyId, get(familyId)); }
    catch (err) { console.log("[Zuhause] Ortung nicht abgeglichen: " + err.message); }
}

// ---------------------------------------------------------------------------------------------
// Address search (suggestions while typing) and address to coordinates
// ---------------------------------------------------------------------------------------------
function hitFromParts(p) {
    const street = p.street ? (p.street + (p.housenumber ? " " + p.housenumber : "")) : "";
    const ort = p.ort || "";
    let titel = street || p.name || ort;
    if (p.name && street && p.name !== p.street && p.name !== street) titel = p.name + ", " + street;
    const plzOrt = [p.postcode, ort].filter(Boolean).join(" ");
    const land = String(p.countrycode || "").toUpperCase();
    const bundesland = land === "DE" ? stateCode(p.stateIso || p.state) : "";
    const zusatzTeile = [];
    if (plzOrt && plzOrt !== titel) zusatzTeile.push(plzOrt);
    if (p.state && p.state !== ort) zusatzTeile.push(p.state);
    if (land && land !== "DE" && p.country) zusatzTeile.push(p.country);
    const zusatz = zusatzTeile.join(", ");
    return {
        titel: cleanText(titel, 120), zusatz: cleanText(zusatz, 160),
        adresse: cleanText([titel, zusatz].filter(Boolean).join(", "), 300),
        ort: cleanText(ort, 80), plz: cleanText(p.postcode, 12),
        lat: round6(p.lat), lon: round6(p.lon), land: land,
        bundesland: bundesland, bundeslandName: bundesland ? LAENDER[bundesland] : "",
    };
}
function fromPhoton(f) {
    const p = (f && f.properties) || {};
    const c = (f && f.geometry && f.geometry.coordinates) || [];
    return hitFromParts({
        name: p.name, street: p.street, housenumber: p.housenumber, postcode: p.postcode,
        ort: p.city || p.town || p.village || p.locality || p.district || p.county || (p.type === "city" ? p.name : ""),
        state: p.state, country: p.country, countrycode: p.countrycode,
        lat: Number(c[1]), lon: Number(c[0]),
    });
}
function fromNominatim(t) {
    const a = (t && t.address) || {};
    return hitFromParts({
        name: t.name && t.name !== a.road ? t.name : "", street: a.road || a.pedestrian || a.footway || "", housenumber: a.house_number,
        postcode: a.postcode, ort: a.city || a.town || a.village || a.municipality || a.suburb || a.county || "",
        state: a.state, stateIso: a["ISO3166-2-lvl4"], country: a.country, countrycode: a.country_code,
        lat: Number(t.lat), lon: Number(t.lon),
    });
}
function uniqueHits(list) {
    const seen = {};
    return list.filter(h => {
        if (!validCoords(h.lat, h.lon) || !h.titel) return false;
        const k = h.adresse.toLowerCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });
}

function suggest(e, q, weit) {
    const text = cleanText(q, 160);
    if (text.length < 3) return { treffer: [] };
    // For weighting: the family's existing Home (nearby hits first) - not for travel destinations
    let bias = "";
    if (!weit) try {
        const home = get(require(`${__hooks}/pinn-benutzer.js`).familyOf(e));
        if (home) bias = "&lat=" + home.lat + "&lon=" + home.lon;
    } catch (err) { bias = ""; }
    const key = "pinnZuhauseSuche:" + text.toLowerCase() + bias;
    const cached = cacheGet(key, SUCHE_TTL_MS);
    if (cached) return cached;
    let treffer = [];
    let fehler = "";
    try {
        const res = httpGet("https://photon.komoot.io/api/?limit=8&lang=de&q=" + encodeURIComponent(text) + bias, 8);
        if (res.statusCode === 200) {
            const j = parseJson(res);
            treffer = uniqueHits(((j && j.features) || []).map(fromPhoton));
        } else fehler = "Status " + res.statusCode;
    } catch (err) { fehler = err.message; }
    if (!treffer.length && fehler) {
        // Fallback: Nominatim (only if Photon does not respond - Nominatim is not meant for search-as-you-type)
        try {
            const res = httpGet("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=de&q=" + encodeURIComponent(text), 10);
            if (res.statusCode === 200) {
                const j = parseJson(res);
                treffer = uniqueHits((Array.isArray(j) ? j : []).map(fromNominatim));
                fehler = "";
            }
        } catch (err) { /* stays on error */ }
    }
    if (fehler && !treffer.length) throw new Error("Adresssuche gerade nicht möglich – bitte später noch einmal versuchen.");
    const data = { treffer: treffer.slice(0, 6) };
    cacheSet(key, data);
    return data;
}

function reverse(lat, lon) {
    if (!validCoords(lat, lon)) return { treffer: [] };
    const la = round6(lat), lo = round6(lon);
    const key = "pinnZuhauseAdresse:" + la.toFixed(5) + "," + lo.toFixed(5);
    const cached = cacheGet(key, SUCHE_TTL_MS);
    if (cached) return cached;
    let treffer = [];
    try {
        const res = httpGet("https://photon.komoot.io/reverse?lang=de&lat=" + la + "&lon=" + lo, 8);
        if (res.statusCode === 200) {
            const j = parseJson(res);
            treffer = uniqueHits(((j && j.features) || []).map(fromPhoton));
        }
    } catch (err) { treffer = []; }
    if (!treffer.length || (treffer[0].land === "DE" && !treffer[0].bundesland)) {
        try {
            const res = httpGet("https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=de&lat=" + la + "&lon=" + lo, 10);
            if (res.statusCode === 200) {
                const j = parseJson(res);
                if (j && j.lat) {
                    const h = fromNominatim(j);
                    if (validCoords(h.lat, h.lon)) treffer = [h].concat(treffer);
                }
            }
        } catch (err) { /* ignore */ }
    }
    // Keep the device's coordinates (not those of the house number found)
    treffer = treffer.slice(0, 1).map(h => Object.assign({}, h, { lat: la, lon: lo }));
    const data = { treffer: treffer };
    if (treffer.length) cacheSet(key, data);
    return data;
}

// ---------------------------------------------------------------------------------------------
// Weather (Open-Meteo, via the server)
// ---------------------------------------------------------------------------------------------
const DAILY_FIELDS = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min," +
    "precipitation_probability_max,precipitation_sum,precipitation_hours,wind_speed_10m_max,wind_gusts_10m_max," +
    "wind_direction_10m_dominant,uv_index_max,sunshine_duration,sunrise,sunset";
const FORECAST_DAYS = 16;
const PAST_DAYS = 2;       // Home → Garden & plants: did it rain yesterday/the day before?
const DAY_MS = 24 * 60 * 60 * 1000;
function numAt(arr, i, digits) {
    if (!Array.isArray(arr) || arr[i] == null || !isFinite(arr[i])) return null;
    const f = Math.pow(10, digits || 0);
    return Math.round(Number(arr[i]) * f) / f;
}
function isoDay(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : ""; }
function addDays(iso, n) {
    const p = iso.split("-").map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + n * DAY_MS);
    return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY_MS);
}
// Today's date (Europe) - enough for the boundary between forecast and empirical values
function todayIso() { return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10); }
// Daily values from an Open-Meteo response (daily)
function dailyRows(dly, limit) {
    const time = Array.isArray(dly && dly.time) ? dly.time : [];
    return time.slice(0, limit || time.length).map((t, i) => ({
        date: String(t),
        code: Array.isArray(dly.weather_code) && dly.weather_code[i] != null ? Number(dly.weather_code[i]) : null,
        max: numAt(dly.temperature_2m_max, i),
        min: numAt(dly.temperature_2m_min, i),
        gefMax: numAt(dly.apparent_temperature_max, i),
        gefMin: numAt(dly.apparent_temperature_min, i),
        rain: numAt(dly.precipitation_probability_max, i),
        mm: numAt(dly.precipitation_sum, i, 1),
        regenStd: numAt(dly.precipitation_hours, i),
        wind: numAt(dly.wind_speed_10m_max, i),
        boeen: numAt(dly.wind_gusts_10m_max, i),
        richtung: numAt(dly.wind_direction_10m_dominant, i),
        uv: numAt(dly.uv_index_max, i),
        sonne: Array.isArray(dly.sunshine_duration) && isFinite(dly.sunshine_duration[i]) ? Math.round(dly.sunshine_duration[i] / 360) / 10 : null,
        auf: Array.isArray(dly.sunrise) ? String(dly.sunrise[i] || "").slice(11, 16) : "",
        unter: Array.isArray(dly.sunset) ? String(dly.sunset[i] || "").slice(11, 16) : "",
    }));
}
function placeOf(familyId, fallbackLat, fallbackLon) {
    const home = familyId ? get(familyId) : null;
    if (home) return { lat: home.lat, lon: home.lon, label: home.ort || home.titel || "Zuhause", home: true };
    if (validCoords(fallbackLat, fallbackLon)) return { lat: Number(fallbackLat), lon: Number(fallbackLon), label: "", home: false };
    return null;
}

function weather(familyId, fallbackLat, fallbackLon) {
    const pl = placeOf(familyId, fallbackLat, fallbackLon);
    if (!pl) return { keinOrt: true };
    // round to ~1 km: same cache for everyone, and the weather does not need to be more exact
    const rl = Math.round(pl.lat * 100) / 100, ro = Math.round(pl.lon * 100) / 100;
    const key = "pinnWetter16p:" + rl + "," + ro;
    let data = cacheGet(key, WETTER_TTL_MS);
    if (!data) {
        const url = "https://api.open-meteo.com/v1/forecast?latitude=" + rl + "&longitude=" + ro +
            "&current=temperature_2m,apparent_temperature,weather_code,uv_index,wind_speed_10m,relative_humidity_2m" +
            "&daily=" + DAILY_FIELDS + "&forecast_days=" + FORECAST_DAYS + "&past_days=" + PAST_DAYS + "&timezone=auto";
        const res = httpGet(url, 15);
        if (res.statusCode !== 200) throw new Error("Wetterdienst gerade nicht erreichbar (Status " + res.statusCode + ").");
        const j = parseJson(res) || {};
        const cur = j.current || {};
        data = {
            jetzt: {
                temp: isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null,
                gef: isFinite(cur.apparent_temperature) ? Math.round(cur.apparent_temperature) : null,
                code: isFinite(cur.weather_code) ? Number(cur.weather_code) : null,
                uv: isFinite(cur.uv_index) ? Math.round(cur.uv_index) : null,
                wind: isFinite(cur.wind_speed_10m) ? Math.round(cur.wind_speed_10m) : null,
                feuchte: isFinite(cur.relative_humidity_2m) ? Math.round(cur.relative_humidity_2m) : null,
            },
            // the first PAST_DAYS rows are past days (rainfall for Garden & plants)
            tage: dailyRows(j.daily || {}).slice(PAST_DAYS, PAST_DAYS + FORECAST_DAYS),
            vergangen: dailyRows(j.daily || {}).slice(0, PAST_DAYS).map(r => ({ date: r.date, mm: r.mm, max: r.max, min: r.min })),
        };
        cacheSet(key, data);
    }
    return Object.assign({ ort: pl.label, zuhause: pl.home }, data);
}

// Hourly course of a day (only on request: tap on a day in the weather view)
function weatherDay(familyId, datum, lat, lon) {
    const day = isoDay(datum);
    if (!day) throw new Error("Ungültiges Datum.");
    let pl = null;
    if (validCoords(lat, lon)) pl = { lat: Number(lat), lon: Number(lon) };
    else pl = placeOf(familyId);
    if (!pl) return { keinOrt: true, stunden: [] };
    const today = todayIso();
    const diff = daysBetween(today, day);
    if (diff < -1 || diff > FORECAST_DAYS) return { stunden: [], ausserhalb: true };
    const rl = Math.round(pl.lat * 100) / 100, ro = Math.round(pl.lon * 100) / 100;
    const key = "pinnWetterTag:" + rl + "," + ro + ":" + day;
    const cached = cacheGet(key, 30 * 60 * 1000);
    if (cached) return cached;
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + rl + "&longitude=" + ro +
        "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day" +
        "&start_date=" + day + "&end_date=" + day + "&timezone=auto";
    const res = httpGet(url, 15);
    if (res.statusCode !== 200) throw new Error("Wetterdienst gerade nicht erreichbar (Status " + res.statusCode + ").");
    const j = parseJson(res) || {};
    const h = j.hourly || {};
    const time = Array.isArray(h.time) ? h.time : [];
    const data = {
        datum: day,
        stunden: time.map((t, i) => ({
            h: String(t).slice(11, 13),
            temp: numAt(h.temperature_2m, i),
            gef: numAt(h.apparent_temperature, i),
            rain: numAt(h.precipitation_probability, i),
            mm: numAt(h.precipitation, i, 1),
            code: Array.isArray(h.weather_code) && h.weather_code[i] != null ? Number(h.weather_code[i]) : null,
            wind: numAt(h.wind_speed_10m, i),
            tag: Array.isArray(h.is_day) ? !!h.is_day[i] : true,
        })),
    };
    cacheSet(key, data);
    return data;
}

// ---------------------------------------------------------------------------------------------
// Holiday weather: forecast (up to 16 days) + empirical values (average of the last three years)
// ---------------------------------------------------------------------------------------------
function shiftYear(iso, years) {
    const y = Number(iso.slice(0, 4)) + years;
    let md = iso.slice(5);
    if (md === "02-29" && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) md = "02-28";
    return y + "-" + md;
}
function modeOf(list) {
    const c = {};
    let best = null, n = 0;
    list.forEach(v => { if (v == null) return; c[v] = (c[v] || 0) + 1; if (c[v] > n) { n = c[v]; best = v; } });
    return best == null ? null : Number(best);
}
// typical weather code from rainfall and sunshine hours (the archive only knows measured values)
function codeFromClimate(mm, sonne, max) {
    if (mm != null && mm >= 4) return (max != null && max <= 1) ? 73 : 63;
    if (mm != null && mm >= 1) return (max != null && max <= 1) ? 71 : 61;
    if (sonne != null && sonne >= 9) return 0;
    if (sonne != null && sonne >= 5) return 2;
    return 3;
}
function climateDays(lat, lon, from, to) {
    const rl = Math.round(lat * 10) / 10, ro = Math.round(lon * 10) / 10;
    const key = "pinnKlima:" + rl + "," + ro + ":" + from + ":" + to;
    const cached = cacheGet(key, 7 * DAY_MS);
    if (cached) return cached;
    const perDay = {}; // MM-DD -> { max:[], min:[], mm:[], sonne:[] }
    let ok = 0;
    for (let back = 1; back <= 3; back++) {
        const a = shiftYear(from, -back), b = shiftYear(to, -back);
        try {
            const url = "https://archive-api.open-meteo.com/v1/archive?latitude=" + rl + "&longitude=" + ro +
                "&start_date=" + a + "&end_date=" + b +
                "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration&timezone=auto";
            const res = httpGet(url, 20);
            if (res.statusCode !== 200) continue;
            const j = parseJson(res) || {};
            const d = j.daily || {};
            (Array.isArray(d.time) ? d.time : []).forEach((t, i) => {
                const md = String(t).slice(5);
                const o = perDay[md] = perDay[md] || { max: [], min: [], mm: [], sonne: [] };
                if (isFinite(d.temperature_2m_max[i])) o.max.push(Number(d.temperature_2m_max[i]));
                if (isFinite(d.temperature_2m_min[i])) o.min.push(Number(d.temperature_2m_min[i]));
                if (isFinite(d.precipitation_sum[i])) o.mm.push(Number(d.precipitation_sum[i]));
                if (Array.isArray(d.sunshine_duration) && isFinite(d.sunshine_duration[i])) o.sonne.push(Number(d.sunshine_duration[i]) / 3600);
            });
            ok++;
        } catch (e) { /* next year */ }
    }
    if (!ok) throw new Error("Erfahrungswerte gerade nicht abrufbar.");
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
    const out = [];
    const n = daysBetween(from, to);
    for (let i = 0; i <= n; i++) {
        const date = addDays(from, i);
        let o = perDay[date.slice(5)];
        if (!o && date.slice(5) === "02-29") o = perDay["02-28"];
        if (!o) { out.push({ date: date, quelle: "klima", code: null, max: null, min: null }); continue; }
        const max = avg(o.max), min = avg(o.min), mm = avg(o.mm), sonne = avg(o.sonne);
        const regenAnteil = o.mm.length ? Math.round(o.mm.filter(v => v >= 1).length / o.mm.length * 100) : null;
        out.push({
            date: date, quelle: "klima",
            max: max == null ? null : Math.round(max), min: min == null ? null : Math.round(min),
            mm: mm == null ? null : Math.round(mm * 10) / 10,
            sonne: sonne == null ? null : Math.round(sonne * 10) / 10,
            rain: regenAnteil, jahre: o.max.length,
            code: codeFromClimate(mm, sonne, max),
        });
    }
    cacheSet(key, out);
    return out;
}
function seaTemps(lat, lon, from, to) {
    const rl = Math.round(lat * 100) / 100, ro = Math.round(lon * 100) / 100;
    const key = "pinnMeer:" + rl + "," + ro + ":" + from + ":" + to;
    const cached = cacheGet(key, 3 * 60 * 60 * 1000);
    if (cached) return cached;
    const out = {};
    try {
        const url = "https://marine-api.open-meteo.com/v1/marine?latitude=" + rl + "&longitude=" + ro +
            "&hourly=sea_surface_temperature&start_date=" + from + "&end_date=" + to + "&timezone=auto";
        const res = httpGet(url, 12);
        if (res.statusCode === 200) {
            const j = parseJson(res) || {};
            const h = j.hourly || {};
            (Array.isArray(h.time) ? h.time : []).forEach((t, i) => {
                const v = Array.isArray(h.sea_surface_temperature) ? h.sea_surface_temperature[i] : null;
                if (v == null || !isFinite(v)) return;
                const d = String(t).slice(0, 10);
                if (out[d] == null || v > out[d]) out[d] = v;
            });
            Object.keys(out).forEach(k => { out[k] = Math.round(out[k]); });
        }
    } catch (e) { /* no sea or service not reachable */ }
    cacheSet(key, out);
    return out;
}
function tripWeather(lat, lon, von, bis) {
    if (!validCoords(lat, lon)) throw new Error("Für das Reiseziel fehlen die Koordinaten.");
    const from = isoDay(von), to = isoDay(bis) || isoDay(von);
    if (!from || !to || to < from) throw new Error("Bitte einen gültigen Zeitraum wählen.");
    if (daysBetween(from, to) > 60) throw new Error("Der Zeitraum ist zu lang (höchstens 60 Tage).");
    const today = todayIso();
    if (to < today) return { von: from, bis: to, tage: [], vorbei: true };
    const last = addDays(today, FORECAST_DAYS - 1);
    const start = from < today ? today : from;
    let tage = [];
    let fehler = "";
    if (start <= last) {
        const fEnd = to < last ? to : last;
        const rl = Math.round(lat * 100) / 100, ro = Math.round(lon * 100) / 100;
        const key = "pinnReise:" + rl + "," + ro + ":" + start + ":" + fEnd;
        let rows = cacheGet(key, 30 * 60 * 1000);
        if (!rows) {
            try {
                const url = "https://api.open-meteo.com/v1/forecast?latitude=" + rl + "&longitude=" + ro +
                    "&daily=" + DAILY_FIELDS + "&start_date=" + start + "&end_date=" + fEnd + "&timezone=auto";
                const res = httpGet(url, 15);
                if (res.statusCode !== 200) throw new Error("Status " + res.statusCode);
                rows = dailyRows((parseJson(res) || {}).daily || {}).map(r => Object.assign(r, { quelle: "prognose", unsicher: daysBetween(today, r.date) >= 7 }));
                cacheSet(key, rows);
            } catch (e) { rows = []; fehler = "Vorhersage gerade nicht abrufbar."; }
        }
        const sea = seaTemps(lat, lon, start, fEnd);
        tage = rows.map(r => (sea[r.date] != null ? Object.assign({}, r, { wasser: sea[r.date] }) : r));
    }
    const cStart = start > last ? start : addDays(last, 1);
    if (cStart <= to) {
        try { tage = tage.concat(climateDays(lat, lon, cStart, to)); }
        catch (e) { fehler = fehler || e.message; }
    }
    return { von: from, bis: to, tage: tage, fehler: fehler, bisVorhersage: last };
}

// ---------------------------------------------------------------------------------------------
// School holidays (OpenHolidays API, via the server, cached per federal state and year)
// ---------------------------------------------------------------------------------------------
function nameOf(arr) {
    if (!Array.isArray(arr) || !arr.length) return "";
    const de = arr.find(n => n && String(n.language).toUpperCase() === "DE") || arr[0];
    return cleanText(de && de.text, 80);
}
function schoolHolidays(bundesland, jahr) {
    const bl = stateCode(bundesland);
    const y = parseInt(jahr, 10);
    if (!bl) return { bundesland: "", jahr: y, ferien: [] };
    if (!(y >= 2000 && y <= 2100)) throw new Error("Ungültiges Jahr.");
    try { $os.mkdirAll(FERIEN_DIR, 493); } catch (e) { /* ignore */ }
    const path = FERIEN_DIR + "/DE-" + bl + "_" + y + ".json";
    const cached = readJsonFile(path);
    const ttl = cached && Array.isArray(cached.ferien) && cached.ferien.length ? FERIEN_TTL_MS : FERIEN_LEER_TTL_MS;
    if (cached && Array.isArray(cached.ferien) && Date.now() - Number(cached.ts || 0) < ttl) {
        return { bundesland: bl, jahr: y, ferien: cached.ferien, stand: cached.ts };
    }
    // do not retry on every call if the service is currently not responding
    const lockKey = "pinnFerienVersuch:" + bl + ":" + y;
    if (cacheGet(lockKey, 30 * 60 * 1000) && cached) {
        return { bundesland: bl, jahr: y, ferien: cached.ferien || [], stand: cached.ts, alt: true };
    }
    cacheSet(lockKey, true);
    try {
        const url = "https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE" +
            "&subdivisionCode=DE-" + bl + "&validFrom=" + y + "-01-01&validTo=" + y + "-12-31";
        const res = httpGet(url, 15);
        if (res.statusCode !== 200) throw new Error("Status " + res.statusCode);
        const j = parseJson(res);
        const list = (Array.isArray(j) ? j : []).map(h => ({
            name: nameOf(h.name) || "Ferien",
            von: String(h.startDate || "").slice(0, 10),
            bis: String(h.endDate || h.startDate || "").slice(0, 10),
        })).filter(h => /^\d{4}-\d{2}-\d{2}$/.test(h.von) && /^\d{4}-\d{2}-\d{2}$/.test(h.bis) && h.bis >= h.von);
        list.sort((a, b) => a.von < b.von ? -1 : a.von > b.von ? 1 : 0);
        const out = { ts: Date.now(), ferien: list };
        writeJsonFile(path, out);
        return { bundesland: bl, jahr: y, ferien: list, stand: out.ts };
    } catch (err) {
        console.log("[Zuhause] Schulferien " + bl + " " + y + " nicht geladen: " + err.message);
        if (cached) return { bundesland: bl, jahr: y, ferien: cached.ferien || [], stand: cached.ts, alt: true };
        throw new Error("Schulferien gerade nicht abrufbar.");
    }
}

module.exports = {
    COL, LAENDER, ensureSchema, get, optionsOf, info, save, setOptions, remove, suggest, reverse, weather, weatherDay, tripWeather, schoolHolidays, stateCode,
};
