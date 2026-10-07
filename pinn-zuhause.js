// pb_hooks/pinn-zuhause.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// „Zuhause“ der Familie (Einstellungen → Zuhause)
//
// Wozu:
//  - Wetter (Übersicht, Uhrzeile, Dashboard) nutzt nur noch diese Koordinaten – die App fragt beim
//    Start nicht mehr nach dem Standort (iOS merkt sich die Freigabe für Home-Bildschirm-Apps nicht).
//  - Bundesland -> gesetzliche Feiertage (rechnet die App selbst) und Schulferien (hier über den
//    Server, OpenHolidays API) im Kalender.
//  - Sonnenauf-/-untergang (rechnet die App selbst aus den Koordinaten, auch offline).
//  - Ortung: Ort „Zuhause“ für Push bei Ankunft/Verlassen wird automatisch angelegt bzw. verschoben
//    (pinn-ortung.js -> syncHome), die Familienkarte startet auf Zuhause.
//
// Fremde Server spricht nur dieser Server an, nie die App:
//  - Adressvorschläge beim Tippen: Photon (photon.komoot.io, OpenStreetMap, für Suche-beim-Tippen gemacht),
//    ersatzweise Nominatim.
//  - Wetter: Open-Meteo (ohne Schlüssel), 15 Minuten zwischengespeichert je Ort.
//  - Schulferien: OpenHolidays API (openholidaysapi.org), je Bundesland und Jahr in pb_data/pinn_ferien
//    zwischengespeichert (14 Tage, ohne Verbindung bleibt der letzte Stand).
//
// Daten je Familie: Sammlung „zuhause“ (gesperrt, nur über die Routen in zuhause.pb.js), Feld „daten“:
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
// weitere Schreibweisen (englisch, ohne Umlaute), wie sie Photon/Nominatim manchmal liefern
const LAENDER_ALIAS = {
    "bavaria": "BY", "lower saxony": "NI", "north rhine-westphalia": "NW", "north rhine westphalia": "NW",
    "rhineland-palatinate": "RP", "saxony": "SN", "saxony-anhalt": "ST", "thuringia": "TH", "hesse": "HE",
    "mecklenburg-western pomerania": "MV", "mecklenburg-west pomerania": "MV", "baden-wuerttemberg": "BW",
    "baden-wurttemberg": "BW", "thueringen": "TH", "thuringen": "TH", "free state of bavaria": "BY",
};

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
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
    } catch (e) { /* weiter */ }
    return null;
}
function cacheSet(key, data) {
    try { $app.store().set(key, { ts: Date.now(), data: data }); } catch (e) { /* egal */ }
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
// Sammlung „zuhause“ (je Familie ein Datensatz)
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
    try { $os.mkdirAll(FERIEN_DIR, 493); } catch (e) { /* egal */ }
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

// Zuhause der Familie (oder null). kalender ist immer gesetzt, auch ohne Adresse.
function get(familyId) {
    const d = readData(loadRec(familyId));
    if (!d || !validCoords(d.lat, d.lon)) return null;
    return publicHome(d);
}
// Kalender-Optionen und Bundesland - gibt es auch ohne Adresse (Bundesland von Hand gewählt)
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
// Speichern / Optionen / Entfernen (nur Admins der Familie)
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
    // Bundesland/Land fehlen (z. B. „Aktuellen Standort übernehmen“ ohne Adresse) -> selbst nachschlagen
    if (!d.land || (d.land === "DE" && !d.bundesland)) {
        try {
            const hit = reverse(d.lat, d.lon).treffer[0];
            if (hit) {
                if (!d.land) d.land = hit.land;
                if (!d.bundesland) d.bundesland = hit.bundesland;
                if (!d.titel) { d.titel = hit.titel; d.zusatz = hit.zusatz; d.ort = hit.ort; d.plz = hit.plz; d.adresse = hit.adresse; }
            }
        } catch (err) { /* ohne Bundesland speichern - in den Einstellungen wählbar */ }
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
    // Kalender-Optionen und Bundesland bleiben (Feiertage weiter anzeigbar)
    const keep = { kalender: Object.assign(defaultKalender(), d.kalender || {}), bundesland: d.bundesland || "", land: d.land || "", stand: Date.now() };
    writeData(familyId, keep);
    return info(familyId);
}

function afterChange(familyId) {
    try { require(`${__hooks}/pinn-ortung.js`).syncHome(familyId, get(familyId)); }
    catch (err) { console.log("[Zuhause] Ortung nicht abgeglichen: " + err.message); }
}

// ---------------------------------------------------------------------------------------------
// Adresssuche (Vorschläge beim Tippen) und Adresse zu Koordinaten
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

function suggest(e, q) {
    const text = cleanText(q, 160);
    if (text.length < 3) return { treffer: [] };
    // Zur Gewichtung: vorhandenes Zuhause der Familie (Treffer in der Nähe zuerst)
    let bias = "";
    try {
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
        // Ersatz: Nominatim (nur wenn Photon nicht antwortet - Nominatim ist nicht für Suche-beim-Tippen gedacht)
        try {
            const res = httpGet("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=de&q=" + encodeURIComponent(text), 10);
            if (res.statusCode === 200) {
                const j = parseJson(res);
                treffer = uniqueHits((Array.isArray(j) ? j : []).map(fromNominatim));
                fehler = "";
            }
        } catch (err) { /* bleibt beim Fehler */ }
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
        } catch (err) { /* egal */ }
    }
    // Koordinaten des Geräts behalten (nicht die der gefundenen Hausnummer)
    treffer = treffer.slice(0, 1).map(h => Object.assign({}, h, { lat: la, lon: lo }));
    const data = { treffer: treffer };
    if (treffer.length) cacheSet(key, data);
    return data;
}

// ---------------------------------------------------------------------------------------------
// Wetter (Open-Meteo, über den Server)
// ---------------------------------------------------------------------------------------------
function weather(familyId, fallbackLat, fallbackLon) {
    const home = familyId ? get(familyId) : null;
    let lat, lon, label;
    if (home) {
        lat = home.lat; lon = home.lon; label = home.ort || home.titel || "Zuhause";
    } else if (validCoords(fallbackLat, fallbackLon)) {
        lat = Number(fallbackLat); lon = Number(fallbackLon); label = "";
    } else {
        return { keinOrt: true };
    }
    // auf ~1 km runden: gleicher Zwischenspeicher für alle, und das Wetter braucht es nicht genauer
    const rl = Math.round(lat * 100) / 100, ro = Math.round(lon * 100) / 100;
    const key = "pinnWetter:" + rl + "," + ro;
    let data = cacheGet(key, WETTER_TTL_MS);
    if (!data) {
        const url = "https://api.open-meteo.com/v1/forecast?latitude=" + rl + "&longitude=" + ro +
            "&current=temperature_2m,weather_code,uv_index" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
            "&forecast_days=7&timezone=auto";
        const res = httpGet(url, 12);
        if (res.statusCode !== 200) throw new Error("Wetterdienst gerade nicht erreichbar (Status " + res.statusCode + ").");
        const j = parseJson(res) || {};
        const num = (arr, i) => (Array.isArray(arr) && arr[i] != null && isFinite(arr[i])) ? Math.round(arr[i]) : null;
        const cur = j.current || {};
        const dly = j.daily || {};
        data = {
            jetzt: {
                temp: isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null,
                code: isFinite(cur.weather_code) ? Number(cur.weather_code) : null,
                uv: isFinite(cur.uv_index) ? Math.round(cur.uv_index) : null,
            },
            tage: (Array.isArray(dly.time) ? dly.time : []).slice(0, 7).map((t, i) => ({
                date: String(t),
                code: Array.isArray(dly.weather_code) ? dly.weather_code[i] : null,
                max: num(dly.temperature_2m_max, i),
                min: num(dly.temperature_2m_min, i),
                rain: num(dly.precipitation_probability_max, i),
                auf: Array.isArray(dly.sunrise) ? String(dly.sunrise[i] || "").slice(11, 16) : "",
                unter: Array.isArray(dly.sunset) ? String(dly.sunset[i] || "").slice(11, 16) : "",
            })),
        };
        cacheSet(key, data);
    }
    return Object.assign({ ort: label, zuhause: !!home }, data);
}

// ---------------------------------------------------------------------------------------------
// Schulferien (OpenHolidays API, über den Server, je Bundesland und Jahr zwischengespeichert)
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
    try { $os.mkdirAll(FERIEN_DIR, 493); } catch (e) { /* egal */ }
    const path = FERIEN_DIR + "/DE-" + bl + "_" + y + ".json";
    const cached = readJsonFile(path);
    const ttl = cached && Array.isArray(cached.ferien) && cached.ferien.length ? FERIEN_TTL_MS : FERIEN_LEER_TTL_MS;
    if (cached && Array.isArray(cached.ferien) && Date.now() - Number(cached.ts || 0) < ttl) {
        return { bundesland: bl, jahr: y, ferien: cached.ferien, stand: cached.ts };
    }
    // nicht bei jedem Aufruf neu versuchen, wenn der Dienst gerade nicht antwortet
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
    COL, LAENDER, ensureSchema, get, optionsOf, info, save, setOptions, remove, suggest, reverse, weather, schoolHolidays, stateCode,
};
