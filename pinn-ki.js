// pb_hooks/pinn-ki.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// KI-Auswertung von Rezepten mit Google Gemini.
// Die App spricht NIE direkt mit Google: Text, Fotos, PDFs oder ein Rezept-Link gehen an den
// eigenen Server (ki.pb.js), der sie mit dem Gemini-Schlüssel aus der .env an Google schickt und
// nur das fertig sortierte Rezept zurückgibt. Der Schlüssel verlässt den Server nicht.
//
// Einrichtung (einmalig für den ganzen Server) in der .env neben der docker-compose.yaml:
//   PINN_GEMINI_KEY=<API-Schlüssel aus https://aistudio.google.com/apikey>
//   PINN_GEMINI_MODELL=            (optional, leer = automatisch das aktuelle Flash-Modell)
// Ohne Schlüssel ist die KI aus und die App nutzt wie bisher ihren eigenen Auswerter.
//
// Ergebnis (immer in diesem Format, passend zum Rezept-Formular):
//   { title, ingredients[], steps[], servings, prepTime, cookTime, categories[], tools[], bild, quelle }
//   ingredients: "Menge Einheit Zutat" (z. B. "200 g Spaghetti"), Zwischenüberschriften mit ":"
//   categories/tools: nur Namen, die es in der Familie schon gibt
//   bild: bei Rezept-Links das Rezeptbild als data:-URL (falls ladbar), sonst ""

const KEY_ENV = "PINN_GEMINI_KEY";
const MODEL_ENV = "PINN_GEMINI_MODELL";
// "gemini-flash-latest" zeigt bei Google immer auf das aktuelle Flash-Modell; die festen Namen
// dienen als Ersatz, falls der Alias einmal nicht verfügbar ist.
// Die Lite-Modelle sind bei Google deutlich seltener überlastet und reichen fürs Sortieren eines
// Rezepts völlig aus. Modelle, die es (nicht mehr) gibt, werden automatisch übersprungen.
const DEFAULT_MODELS = [
    "gemini-flash-latest", "gemini-2.5-flash",
    "gemini-flash-lite-latest", "gemini-2.5-flash-lite",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
];
// Wartezeiten bei "überlastet" (503/500) vor dem 2. und 3. Versuch desselben Modells
const BUSY_WAITS = [2000, 5000];
// Gesamtzeit für alle Gemini-Versuche zusammen (die App bricht nach 150 s ab)
const GEMINI_BUDGET_MS = 110000;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const MAX_FILES = 6;
const MAX_TOTAL_BASE64 = 18 * 1024 * 1024;   // Google erlaubt ~20 MB je Anfrage
const MAX_TEXT = 60000;
const MAX_PAGE_TEXT = 45000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

// ---------------------------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------------------------
function readEnv(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function apiKey() { return readEnv(KEY_ENV); }
function isAvailable() { return !!apiKey(); }
function models() {
    const own = readEnv(MODEL_ENV);
    const list = own ? [own] : [];
    DEFAULT_MODELS.forEach(m => { if (list.indexOf(m) < 0) list.push(m); });
    return list;
}

function cleanText(v, max) {
    return String(v === undefined || v === null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
}
function cleanList(v, maxItems, maxLen) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (let i = 0; i < v.length && out.length < maxItems; i++) {
        const s = cleanText(v[i], maxLen);
        if (s) out.push(s);
    }
    return out;
}
function cleanNumber(v, max) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(Math.round(n), max);
}

function bodyText(res) {
    try { if (typeof res.raw === "string" && res.raw) return res.raw; } catch (e) { /* weiter */ }
    try { return toString(res.body); } catch (e) { /* weiter */ }
    return "";
}
function parseJson(res) {
    try { return JSON.parse(bodyText(res) || ""); } catch (e) { /* weiter */ }
    try { if (res.json && typeof res.json === "object") return res.json; } catch (e) { /* egal */ }
    return {};
}
function googleError(obj, status) {
    if (obj && obj.error && typeof obj.error === "object") return String(obj.error.message || obj.error.status || ("Status " + status));
    return "Status " + status;
}
function headerValue(res, name) {
    try {
        const h = res.headers || {};
        const keys = Object.keys(h);
        for (let i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === name.toLowerCase()) {
                const v = h[keys[i]];
                return String(Array.isArray(v) ? v[0] : v || "");
            }
        }
    } catch (e) { /* egal */ }
    return "";
}

// ---------------------------------------------------------------------------------------------
// Base64 (Goja hat kein btoa) - für das Rezeptbild aus einem Link
// ---------------------------------------------------------------------------------------------
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesOf(res) {
    let b = null;
    try { b = res.body; } catch (e) { b = null; }
    if (!b) return null;
    try { if (typeof ArrayBuffer !== "undefined" && b instanceof ArrayBuffer) return new Uint8Array(b); } catch (e) { /* weiter */ }
    if (typeof b === "string") return null;
    return b;
}
function base64FromBytes(bytes) {
    const len = bytes.length;
    const parts = [];
    let chunk = "";
    for (let i = 0; i < len; i += 3) {
        const a = bytes[i] & 255;
        const b = i + 1 < len ? bytes[i + 1] & 255 : 0;
        const c = i + 2 < len ? bytes[i + 2] & 255 : 0;
        const n = (a << 16) | (b << 8) | c;
        chunk += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
            + (i + 1 < len ? B64[(n >> 6) & 63] : "=")
            + (i + 2 < len ? B64[n & 63] : "=");
        if (chunk.length >= 8192) { parts.push(chunk); chunk = ""; }
    }
    parts.push(chunk);
    return parts.join("");
}

// ---------------------------------------------------------------------------------------------
// Rezept-Link: Seite auf dem Server laden (nur öffentliche Adressen, nie das Heimnetz)
// ---------------------------------------------------------------------------------------------
function isUrl(text) {
    return /^https?:\/\/[^\s]+$/i.test(String(text || "").trim());
}
function isPrivateHost(host) {
    const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!h || h === "localhost" || /\.(local|lan|home|internal|fritz\.box|duckdns\.org)$/.test(h) || h === "fritz.box") return true;
    if (h.indexOf(":") >= 0) return true; // IPv6-Adressen direkt: nicht erlaubt
    const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return /^[a-z0-9-]+$/.test(h); // einzelner Rechnername ohne Punkt = Heimnetz
    const a = +m[1], b = +m[2];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function hostOf(url) {
    const m = String(url).match(/^https?:\/\/(?:[^@\/]*@)?(\[[^\]]+\]|[^\/:?#]+)/i);
    return m ? m[1] : "";
}
function absoluteUrl(base, rel) {
    const r = String(rel || "").trim();
    if (!r) return "";
    if (/^https?:\/\//i.test(r)) return r;
    if (/^\/\//.test(r)) return "https:" + r;
    const m = String(base).match(/^(https?:\/\/[^\/?#]+)(\/[^?#]*)?/i);
    if (!m) return "";
    if (r.charAt(0) === "/") return m[1] + r;
    const dir = (m[2] || "/").replace(/[^\/]*$/, "");
    return m[1] + dir + r;
}
function decodeEntities(s) {
    return String(s)
        .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
        .replace(/&frac12;/gi, "1/2").replace(/&frac14;/gi, "1/4").replace(/&frac34;/gi, "3/4")
        .replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö").replace(/&uuml;/g, "ü")
        .replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö").replace(/&Uuml;/g, "Ü").replace(/&szlig;/g, "ß")
        .replace(/&#(\d+);/g, (x, n) => { try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return ""; } })
        .replace(/&#x([0-9a-f]+);/gi, (x, n) => { try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return ""; } });
}
// Lädt die Rezeptseite. Manche Seiten (z. B. Chefkoch) blocken wiederholte Abrufe kurzzeitig -
// dann einmal kurz warten und mit einer Desktop-Browser-Kennung erneut versuchen.
const PAGE_AGENTS = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
];
function fetchText(url) {
    if (isPrivateHost(hostOf(url))) throw new Error("Diese Adresse ist nicht erlaubt – bitte einen öffentlichen Rezept-Link verwenden.");
    let lastStatus = 0;
    for (let i = 0; i < PAGE_AGENTS.length; i++) {
        if (i > 0) pause(1500);
        let res;
        try {
            res = $http.send({
                url: url, method: "GET", timeout: 25,
                headers: {
                    "User-Agent": PAGE_AGENTS[i],
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
                    "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
                },
            });
        } catch (err) {
            if (i < PAGE_AGENTS.length - 1) continue;
            throw new Error("Die Rezeptseite ist nicht erreichbar (" + err.message + ").");
        }
        if (res.statusCode >= 200 && res.statusCode < 300) return bodyText(res);
        lastStatus = res.statusCode;
        if (res.statusCode === 404 || res.statusCode === 410) break; // gibt es nicht - kein zweiter Versuch
    }
    if (lastStatus === 404 || lastStatus === 410) throw new Error("Die Rezeptseite gibt es nicht (mehr) – bitte den Link prüfen.");
    if (lastStatus === 403 || lastStatus === 429) throw new Error("Die Rezeptseite blockt gerade den Abruf (Status " + lastStatus + ") – bitte in ein paar Minuten noch einmal versuchen.");
    throw new Error("Die Rezeptseite antwortet nicht (Status " + lastStatus + ").");
}
function pause(ms) {
    try { if (typeof sleep === "function") sleep(ms); } catch (e) { /* egal */ }
}
// Aus der Seite: strukturierte Rezeptdaten (JSON-LD), Bild-Adresse und lesbarer Text
function pageContent(url) {
    const html = String(fetchText(url) || "").slice(0, 3 * 1024 * 1024);
    if (!html) throw new Error("Die Rezeptseite war leer.");
    const ld = [];
    const ldRe = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRe.exec(html)) && ld.join("").length < 40000) {
        const t = m[1].trim();
        if (/recipe/i.test(t)) ld.push(t.slice(0, 40000));
    }
    let image = "";
    let recipe = null;
    ld.some(t => {
        let obj = null;
        try { obj = JSON.parse(t); } catch (e) { obj = null; }
        const r = findLdRecipe(obj, 0);
        if (!r) return false;
        if (!recipe) recipe = r;
        if (r.image) {
            const img = Array.isArray(r.image) ? r.image[0] : r.image;
            image = typeof img === "string" ? img : (img && (img.url || img.contentUrl)) || "";
        }
        return !!image;
    });
    if (!image) {
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        if (og) image = decodeEntities(og[1]);
    }
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let text = html
        .replace(/<(script|style|noscript|svg|iframe|template|head)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|li|h\d)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ");
    text = decodeEntities(text).replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_PAGE_TEXT);
    return {
        title: titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : "",
        jsonLd: ld.join("\n").slice(0, 40000),
        text: text,
        image: absoluteUrl(url, image),
        recipe: recipe,
    };
}

// ---------------------------------------------------------------------------------------------
// Ersatz ohne KI: Rezept direkt aus den strukturierten Daten der Seite (schema.org/Recipe)
// Fast alle großen Rezeptseiten liefern diese mit. Wird genutzt, wenn Gemini überlastet ist
// oder das Kontingent aufgebraucht ist - dann gibt es das Rezept trotzdem (nur ohne Übersetzung).
// ---------------------------------------------------------------------------------------------
function findLdRecipe(o, depth) {
    if (!o || typeof o !== "object" || depth > 6) return null;
    if (Array.isArray(o)) {
        for (let i = 0; i < o.length; i++) { const r = findLdRecipe(o[i], depth + 1); if (r) return r; }
        return null;
    }
    const type = [].concat(o["@type"] || []).join(" ");
    if (/(^|\s)recipe(\s|$)/i.test(type)) return o;
    return findLdRecipe(o["@graph"], depth + 1) || findLdRecipe(o.mainEntity, depth + 1)
        || findLdRecipe(o.mainEntityOfPage, depth + 1);
}
function ldText(v) {
    if (v === undefined || v === null) return "";
    if (typeof v === "object") v = v.text || v.name || "";
    return decodeEntities(String(v).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
        .replace(/[ \t\r\f\v]+/g, " ").replace(/ ([.,;:!?])/g, "$1").trim();
}
function ldMinutes(v) {
    // ISO 8601: PT1H30M, P0DT0H20M, PT45M ... oder schon eine Zahl
    if (typeof v === "number") return v;
    const s = String(v || "").trim().toUpperCase();
    const m = s.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
    if (!m) { const n = s.match(/\d+/); return n ? Number(n[0]) : 0; }
    return Math.round((Number(m[1] || 0) * 1440) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + (Number(m[4] || 0) / 60));
}
function ldYield(v) {
    const list = [].concat(v || []);
    for (let i = 0; i < list.length; i++) {
        const n = String(list[i]).match(/\d+/);
        if (n) return Number(n[0]);
    }
    return 0;
}
function ldSteps(v, out, depth) {
    if (v === undefined || v === null || depth > 5) return out;
    if (typeof v === "string") {
        ldText(v).split(/\n+/).forEach(line => { const s = line.trim(); if (s) out.push(s); });
        return out;
    }
    if (Array.isArray(v)) { v.forEach(x => ldSteps(x, out, depth + 1)); return out; }
    if (typeof v === "object") {
        const type = [].concat(v["@type"] || []).join(" ");
        if (/HowToSection/i.test(type) || (v.itemListElement && !v.text)) {
            const head = ldText(v.name);
            if (head) out.push(head.replace(/:?\s*$/, ":"));
            ldSteps(v.itemListElement, out, depth + 1);
            return out;
        }
        const t = ldText(v.text || v.name || v.description);
        if (t) out.push(t);
    }
    return out;
}
function recipeFromLd(page, categories) {
    const r = page && page.recipe;
    if (!r) return null;
    const ingredients = [].concat(r.recipeIngredient || r.ingredients || [])
        .map(ldText).map(normalizeIngredient).filter(Boolean).slice(0, 300);
    const steps = ldSteps(r.recipeInstructions, [], 0).map(normalizeStep).filter(Boolean).slice(0, 200);
    if (!ingredients.length || !steps.length) return null;
    // Kategorien: nur vorhandene Familien-Kategorien, die in Kategorie/Küche/Stichworten der Seite vorkommen
    const hay = [].concat(r.recipeCategory || [], r.recipeCuisine || [], r.keywords || [])
        .map(ldText).join(", ").toLowerCase();
    const cats = hay ? categories.filter(c => hay.indexOf(c.toLowerCase()) >= 0).slice(0, 3) : [];
    let prep = ldMinutes(r.prepTime);
    let cook = ldMinutes(r.cookTime);
    if (!prep && !cook && r.totalTime) cook = ldMinutes(r.totalTime);
    return {
        titel: ldText(r.name),
        portionen: ldYield(r.recipeYield),
        vorbereitung_min: prep,
        zubereitung_min: cook,
        zutaten: ingredients,
        schritte: steps,
        kategorien: cats,
        geraete: [],
        ist_rezept: true,
        __modell: "Seitendaten (ohne KI)",
    };
}
// Rezeptbild als data:-URL (für das Bild-Feld im Formular). Fehler = kein Bild.
function fetchImageDataUrl(url) {
    try {
        if (!url || !/^https?:\/\//i.test(url) || isPrivateHost(hostOf(url))) return "";
        const res = $http.send({ url: url, method: "GET", timeout: 20, headers: { "User-Agent": "Mozilla/5.0 (pinn.)", "Accept": "image/*" } });
        if (res.statusCode !== 200) return "";
        let mime = headerValue(res, "Content-Type").split(";")[0].trim().toLowerCase();
        if (!/^image\/(jpeg|jpg|png|webp)$/.test(mime)) return "";
        if (mime === "image/jpg") mime = "image/jpeg";
        const bytes = bytesOf(res);
        if (!bytes || !bytes.length || bytes.length > MAX_IMAGE_BYTES) return "";
        return "data:" + mime + ";base64," + base64FromBytes(bytes);
    } catch (e) {
        console.log("[KI] Rezeptbild nicht ladbar: " + e.message);
        return "";
    }
}

// ---------------------------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------------------------
function instructions(categories, tools) {
    return [
        "Du bist der Rezept-Assistent der deutschen Familien-App pinn.",
        "Du bekommst ein Rezept als Text, Foto(s), PDF oder Webseite und gibst es sauber sortiert als JSON zurück.",
        "Regeln:",
        "- Alles auf Deutsch. Fremdsprachige Rezepte übersetzen, amerikanische Maße (cups, oz, lb, °F) in g/ml/°C umrechnen.",
        "- titel: kurzer, natürlicher Rezeptname ohne Werbung, Blog- oder Seitennamen.",
        "- zutaten: genau eine Zutat je Eintrag im Format \"Menge Einheit Zutat\", Menge immer VORNE, z. B. \"200 g Spaghetti\", \"2 EL Olivenöl\", \"1 Zwiebel\", \"0,5 TL Salz\", \"1-2 Knoblauchzehen\".",
        "  Einheiten: g, kg, ml, l, EL, TL, Prise, Stück, Dose, Bund, Zehe, Packung, Becher, Scheibe. Dezimalkomma, Brüche als \"1/2\" (nie ½).",
        "  Zusätze wie \"fein gehackt\" hinten mit Komma anhängen. Keine Menge erfinden: steht keine da (z. B. \"Salz und Pfeffer\"), die Zutat ohne Menge schreiben.",
        "  Hat das Rezept Teilkomponenten (Teig, Füllung, Soße …), vor deren Zutaten eine kurze Zwischenüberschrift mit Doppelpunkt am Ende, z. B. \"Für die Soße:\".",
        "- schritte: ein Arbeitsschritt je Eintrag, ohne Nummerierung, vollständige Sätze. Zwischenüberschriften wie bei den Zutaten mit Doppelpunkt erlaubt.",
        "  Getrennte Zeilen, Seitenumbrüche oder mehrere Fotos/Screenshots zu einem durchgehenden Rezept zusammensetzen, Überschneidungen nur einmal übernehmen.",
        "- Werbung, Kommentare, Bewertungen, Nährwerte, Navigations- und Cookie-Texte, Bildunterschriften ignorieren.",
        "- portionen: Anzahl Portionen/Personen als Ganzzahl (bei \"für eine Springform\" o. Ä. 12, bei \"1 Blech\" 16; unbekannt: 0).",
        "- vorbereitung_min: aktive Arbeits-/Vorbereitungszeit in Minuten; zubereitung_min: Koch-, Back- oder Garzeit in Minuten (Ruhe-/Kühlzeit nicht mitzählen). Unbekannt: 0.",
        categories.length
            ? "- kategorien: 0 bis 3 passende Kategorien NUR aus dieser Liste: " + categories.join(", ") + "."
            : "- kategorien: leere Liste.",
        tools.length
            ? "- geraete: benötigte Küchengeräte NUR aus dieser Liste (nur wenn im Rezept wirklich gebraucht): " + tools.join(", ") + "."
            : "- geraete: leere Liste.",
        "- ist_rezept: false, wenn der Inhalt erkennbar kein Rezept ist; dann alle Listen leer lassen.",
        "- Nichts dazuerfinden, was nicht im Rezept steht – außer der Übersetzung/Umrechnung und der Kategorien-/Geräte-Zuordnung.",
    ].join("\n");
}
function schema(categories, tools) {
    const strList = (enumList) => {
        const items = { type: "STRING" };
        if (enumList && enumList.length) items.enum = enumList;
        return { type: "ARRAY", items: items };
    };
    return {
        type: "OBJECT",
        properties: {
            ist_rezept: { type: "BOOLEAN" },
            titel: { type: "STRING" },
            portionen: { type: "INTEGER" },
            vorbereitung_min: { type: "INTEGER" },
            zubereitung_min: { type: "INTEGER" },
            zutaten: strList(null),
            schritte: strList(null),
            kategorien: strList(categories),
            geraete: strList(tools),
        },
        required: ["ist_rezept", "titel", "portionen", "vorbereitung_min", "zubereitung_min", "zutaten", "schritte", "kategorien", "geraete"],
        propertyOrdering: ["ist_rezept", "titel", "portionen", "vorbereitung_min", "zubereitung_min", "zutaten", "schritte", "kategorien", "geraete"],
    };
}

function callGemini(parts, categories, tools) {
    const key = apiKey();
    if (!key) throw new Error("Die KI ist auf dem Server nicht eingerichtet (PINN_GEMINI_KEY fehlt in der .env).");
    const payload = JSON.stringify({
        systemInstruction: { parts: [{ text: instructions(categories, tools) }] },
        contents: [{ role: "user", parts: parts }],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: schema(categories, tools),
        },
    });
    const list = models();
    const deadline = Date.now() + GEMINI_BUDGET_MS;
    let lastError = "";
    let quotaHit = false;
    let busyHit = false;
    let netError = "";
    let timeUp = false;
    for (let i = 0; i < list.length && !timeUp; i++) {
        const model = list[i];
        let res = null;
        // Ausgelastet (503/500) kommt bei Gemini oft nur kurz vor: kurz warten und dasselbe
        // Modell erneut versuchen (bis zu 3-mal), danach das nächste Modell.
        for (let attempt = 0; attempt <= BUSY_WAITS.length; attempt++) {
            if (attempt > 0) {
                if (Date.now() + BUSY_WAITS[attempt - 1] + 10000 > deadline) break;
                pause(BUSY_WAITS[attempt - 1]);
            }
            const left = Math.floor((deadline - Date.now()) / 1000);
            if (left < 10) { timeUp = true; break; }
            try {
                res = $http.send({
                    url: API_BASE + encodeURIComponent(model) + ":generateContent",
                    method: "POST", timeout: Math.min(75, left),
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: payload,
                });
            } catch (err) {
                // Zeitüberschreitung/Netzfehler bei einem Modell: nächstes Modell probieren
                res = null;
                netError = err.message;
                console.log("[KI] " + model + " nicht erreichbar: " + err.message);
                break;
            }
            if (res.statusCode < 500) break;
            console.log("[KI] " + model + " ausgelastet (" + res.statusCode + "), Versuch " + (attempt + 1));
        }
        if (!res) continue;
        const body = parseJson(res);
        if (res.statusCode === 404) { lastError = "Modell " + model + " nicht gefunden"; continue; }
        if (res.statusCode === 400 && /API key not valid|API_KEY_INVALID/i.test(bodyText(res))) {
            throw new Error("Der Gemini-Schlüssel (PINN_GEMINI_KEY) ist ungültig.");
        }
        if (res.statusCode === 400 && /schema|enum|propertyOrdering/i.test(googleError(body, 400)) && i < list.length - 1) {
            lastError = googleError(body, 400); continue;
        }
        // Kontingent gilt bei Google je Modell - erst die übrigen Modelle probieren
        if (res.statusCode === 429) { quotaHit = true; lastError = "Kontingent von " + model + " aufgebraucht"; continue; }
        if (res.statusCode === 403) {
            throw new Error("Google lehnt den Zugriff ab (403): " + googleError(body, 403)
                + " – ist die „Generative Language API“ im Projekt des Schlüssels aktiv?");
        }
        if (res.statusCode >= 500) { busyHit = true; lastError = "Google-Fehler " + res.statusCode + ": " + googleError(body, res.statusCode); continue; }
        if (res.statusCode !== 200) throw new Error("Gemini-Fehler: " + googleError(body, res.statusCode));

        if (body.promptFeedback && body.promptFeedback.blockReason) {
            throw new Error("Gemini hat die Anfrage abgelehnt (" + body.promptFeedback.blockReason + ").");
        }
        const cand = body.candidates && body.candidates[0];
        const text = cand && cand.content && Array.isArray(cand.content.parts)
            ? cand.content.parts.filter(p => p && typeof p.text === "string" && !p.thought).map(p => p.text).join("")
            : "";
        if (!text) {
            throw new Error("Gemini hat keine Antwort geliefert" + (cand && cand.finishReason ? " (" + cand.finishReason + ")" : "") + ".");
        }
        let parsed;
        try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
        catch (e) { throw new Error("Die Antwort von Gemini war nicht lesbar."); }
        parsed.__modell = model;
        return parsed;
    }
    if (quotaHit) throw new Error("Das kostenlose Gemini-Kontingent ist gerade aufgebraucht – bitte in einer Minute (oder morgen) noch einmal versuchen.");
    if (busyHit || timeUp) throw new Error("Google Gemini ist gerade überlastet – bitte gleich noch einmal versuchen.");
    if (netError) throw new Error("Google Gemini ist nicht erreichbar: " + netError);
    throw new Error("Kein Gemini-Modell verfügbar (" + lastError + ").");
}

// Kategorien/Geräte nur übernehmen, wenn es sie in der Familie gibt (gleiche Schreibweise wie dort)
function matchNames(list, allowed) {
    const byLower = {};
    allowed.forEach(a => { byLower[a.toLowerCase()] = a; });
    const out = [];
    list.forEach(n => {
        const hit = byLower[String(n).toLowerCase()];
        if (hit && out.indexOf(hit) < 0) out.push(hit);
    });
    return out;
}
function normalizeIngredient(line) {
    return String(line)
        .replace(/½/g, "1/2").replace(/¼/g, "1/4").replace(/¾/g, "3/4").replace(/⅓/g, "1/3").replace(/⅔/g, "2/3")
        .replace(/^\s*[-*•·]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
}
function normalizeStep(line) {
    return String(line).replace(/^\s*(\d+[.)]|schritt\s*\d+[.:]?|[-*•·])\s*/i, "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Einstieg für die Route
// ---------------------------------------------------------------------------------------------
// input: { text, dateien: [{ mime, daten (base64 ohne data:-Präfix), name }], kategorien[], geraete[] }
function analyzeRecipe(input) {
    const data = input && typeof input === "object" ? input : {};
    const categories = cleanList(data.kategorien, 80, 60);
    const tools = cleanList(data.geraete, 80, 60);
    const text = cleanText(data.text, MAX_TEXT);
    const files = Array.isArray(data.dateien) ? data.dateien.slice(0, MAX_FILES) : [];

    const parts = [];
    let quelle = "";
    let imageUrl = "";
    let pageTitle = "";
    let page = null;

    if (text && isUrl(text)) {
        quelle = text;
        page = pageContent(text);
        imageUrl = page.image;
        pageTitle = page.title;
        if (!page.jsonLd && page.text.length < 200 && !files.length) throw new Error("Auf der Seite war kein Rezept zu finden.");
        parts.push({
            text: "Rezept von der Webseite " + text + (page.title ? " (Seitentitel: " + page.title + ")" : "") + ".\n"
                + (page.jsonLd ? "Strukturierte Rezeptdaten der Seite (JSON-LD):\n" + page.jsonLd + "\n\n" : "")
                + "Seitentext:\n" + page.text,
        });
    } else if (text) {
        parts.push({ text: "Rezepttext:\n" + text });
    }

    let total = 0;
    files.forEach((f, i) => {
        if (!f || typeof f !== "object") return;
        let mime = String(f.mime || "").toLowerCase();
        if (mime === "image/jpg") mime = "image/jpeg";
        const b64 = String(f.daten || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
        if (ALLOWED_MIME.indexOf(mime) < 0 || !b64 || !/^[A-Za-z0-9+\/=]+$/.test(b64)) return;
        total += b64.length;
        if (total > MAX_TOTAL_BASE64) throw new Error("Die Dateien sind zusammen zu groß für die KI (max. ca. 13 MB).");
        parts.push({ inline_data: { mime_type: mime, data: b64 } });
    });
    const fileCount = parts.filter(p => p.inline_data).length;
    if (fileCount > 1) parts.unshift({ text: "Die folgenden " + fileCount + " Dateien gehören zu EINEM Rezept (z. B. mehrere Screenshots oder Seiten, Reihenfolge evtl. vertauscht)." });
    if (!parts.length) throw new Error("Kein Rezept übergeben.");

    let r;
    try {
        r = callGemini(parts, categories, tools);
    } catch (err) {
        // Rezept-Link und Gemini klappt gerade nicht: Rezept aus den Seitendaten übernehmen
        const fallback = page ? recipeFromLd(page, categories) : null;
        if (!fallback) throw err;
        console.log("[KI] Gemini nicht nutzbar (" + err.message + ") – Rezept aus den Seitendaten übernommen.");
        r = fallback;
    }
    const ingredients = cleanList(r.zutaten, 300, 500).map(normalizeIngredient).filter(Boolean);
    const steps = cleanList(r.schritte, 200, 3000).map(normalizeStep).filter(Boolean);
    if (r.ist_rezept === false || (!ingredients.length && !steps.length)) {
        throw new Error("Die KI hat darin kein Rezept erkannt.");
    }
    return {
        title: cleanText(r.titel, 300) || pageTitle || "",
        ingredients: ingredients,
        steps: steps,
        servings: cleanNumber(r.portionen, 1000),
        prepTime: cleanNumber(r.vorbereitung_min, 100000),
        cookTime: cleanNumber(r.zubereitung_min, 100000),
        categories: matchNames(cleanList(r.kategorien, 10, 60), categories),
        tools: matchNames(cleanList(r.geraete, 20, 60), tools),
        bild: imageUrl ? fetchImageDataUrl(imageUrl) : "",
        quelle: quelle,
        modell: String(r.__modell || ""),
    };
}

function status() {
    return { aktiv: isAvailable(), modell: readEnv(MODEL_ENV) || DEFAULT_MODELS[0] };
}

module.exports = { isAvailable, status, analyzeRecipe };
