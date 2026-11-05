// pb_hooks/pinn-kurse.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Prices for ETFs / securities (Savings → savings goal with ISIN).
// The app only requests the ISINs that a family is saving for, and only when someone views "Savings" -
// there is no schedule and no background work.
//
// Cache: collection "kurse" (shared by all families, prices are public; collection API
// locked, access only via the route in kurse.pb.js). One record per ISIN:
//   isin, name, waehrung, kurs, kurs_datum, vortag, quelle, abgerufen (ISO time of the last price retrieval),
//   verlauf (JSON text: [["YYYY-MM-DD", closing price], ...]), verlauf_ab (completely loaded from this day on),
//   verlauf_geprueft (day of the last history retrieval), versuch (ISO time of the last failed retrieval),
//   fehler (last error message)
//
// Gentle:
//  - current price renewed at most every 15 minutes (with "fresh" at most every minute)
//  - price history reloaded at most once a day (only the last days), completely only if an
//    earlier deposit lies further back than the history loaded so far
//  - after an error a 15-minute pause for this ISIN
//
// Sources (without an API key, unofficial - may change):
//  1. justETF (ETFs, directly in euro): /api/etfs/<ISIN>/quote and /api/etfs/<ISIN>/performance-chart
//  2. Fallback Yahoo Finance (also shares): search for the ISIN, then price history of the exchange in euro
//     (preferring Xetra/German trading venues)

const KURSE = "kurse";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const QUOTE_TTL_MS = 15 * 60 * 1000;
const FRESH_TTL_MS = 60 * 1000;
const RETRY_PAUSE_MS = 15 * 60 * 1000;
const MIN_DATE = "2000-01-01";

function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureSchema() {
    if (findCol(KURSE)) return;
    try {
        $app.save(new Collection({
            type: "base",
            name: KURSE,
            fields: [
                { name: "isin", type: "text", max: 12, required: true },
                { name: "name", type: "text", max: 200 },
                { name: "waehrung", type: "text", max: 10 },
                { name: "kurs", type: "number" },
                { name: "kurs_datum", type: "text", max: 30 },
                { name: "vortag", type: "number" },
                { name: "quelle", type: "text", max: 40 },
                { name: "symbol", type: "text", max: 40 },
                { name: "abgerufen", type: "text", max: 40 },
                { name: "verlauf", type: "text", max: 2000000 },
                { name: "verlauf_ab", type: "text", max: 10 },
                { name: "verlauf_geprueft", type: "text", max: 10 },
                { name: "versuch", type: "text", max: 40 },
                { name: "fehler", type: "text", max: 300 },
                { name: "created", type: "autodate", onCreate: true, onUpdate: false },
                { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
            ],
            indexes: ["CREATE UNIQUE INDEX `idx_kurse_isin` ON `" + KURSE + "` (`isin`)"],
            listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        }));
        console.log("[Kurse] Sammlung \"" + KURSE + "\" angelegt.");
    } catch (err) {
        console.log("[Kurse] Konnte Sammlung nicht anlegen: " + err.message);
    }
}

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function isValidIsin(s) {
    s = String(s || "");
    if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
    let digits = "";
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        digits += /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
    }
    let sum = 0, dbl = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let d = Number(digits.charAt(i));
        if (dbl) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
        dbl = !dbl;
    }
    return sum % 10 === 0;
}
function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function addDays(iso, days) {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
function num(v) {
    if (v && typeof v === "object" && v.raw !== undefined) v = v.raw;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
}
function httpJson(url) {
    const res = $http.send({
        url: url,
        method: "GET",
        timeout: 20,
        headers: { "User-Agent": UA, "Accept": "application/json, text/plain, */*", "Accept-Language": "de-DE,de;q=0.9" },
    });
    if (res.statusCode !== 200) throw new Error("HTTP " + res.statusCode);
    let data = null;
    try { data = res.json; } catch (e) { data = null; }
    if (!data || typeof data !== "object") {
        try { data = JSON.parse(res.raw || "null"); } catch (e) { data = null; }
    }
    if (!data || typeof data !== "object") throw new Error("Keine gültige Antwort");
    return data;
}
function parseHistory(raw) {
    try {
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr.filter(x => Array.isArray(x) && isIso(x[0]) && isFinite(Number(x[1]))) : [];
    } catch (e) { return []; }
}
function mergeHistory(oldArr, newArr) {
    const map = {};
    oldArr.forEach(x => { map[x[0]] = x[1]; });
    newArr.forEach(x => { map[x[0]] = x[1]; });
    return Object.keys(map).sort().map(d => [d, map[d]]);
}

// ---------------------------------------------------------------------------------------------
// Source 1: justETF (euro)
// ---------------------------------------------------------------------------------------------
function justEtfQuote(isin) {
    const d = httpJson("https://www.justetf.com/api/etfs/" + isin + "/quote?locale=de&currency=EUR");
    const price = num(d.latestQuote);
    if (!(price > 0)) throw new Error("justETF: kein Kurs");
    const prev = num(d.previousQuote);
    return {
        price: price,
        date: isIso(d.latestQuoteDate) ? d.latestQuoteDate : todayIso(),
        prev: prev > 0 ? prev : 0,
        currency: "EUR",
        source: "justETF" + (d.quoteTradingVenue ? " (" + String(d.quoteTradingVenue).slice(0, 20) + ")" : ""),
    };
}
function justEtfHistory(isin, from, to) {
    const d = httpJson("https://www.justetf.com/api/etfs/" + isin + "/performance-chart?locale=de&currency=EUR" +
        "&valuesType=MARKET_VALUE&reduceData=false&includeDividends=false&features=DIVIDENDS" +
        "&dateFrom=" + from + "&dateTo=" + to);
    const series = Array.isArray(d.series) ? d.series : (Array.isArray(d) ? d : []);
    const out = [];
    series.forEach(p => {
        let date = "", val = NaN;
        if (Array.isArray(p)) { date = String(p[0] || "").slice(0, 10); val = num(p[1]); }
        else if (p && typeof p === "object") { date = String(p.date || "").slice(0, 10); val = num(p.value); }
        if (isIso(date) && val > 0) out.push([date, Math.round(val * 10000) / 10000]);
    });
    if (!out.length) throw new Error("justETF: kein Kursverlauf");
    return out;
}

// ---------------------------------------------------------------------------------------------
// Quelle 2: Yahoo Finance
// ---------------------------------------------------------------------------------------------
const YAHOO_EUR_SUFFIX = [".DE", ".F", ".SG", ".MU", ".DU", ".BE", ".HM", ".HA", ".AS", ".PA", ".MI", ".VI", ".MC", ".BR", ".LS", ".IR"];
function yahooFind(isin) {
    const d = httpJson("https://query2.finance.yahoo.com/v1/finance/search?q=" + isin + "&quotesCount=15&newsCount=0&listsCount=0");
    const quotes = Array.isArray(d.quotes) ? d.quotes.filter(q => q && q.symbol) : [];
    if (!quotes.length) throw new Error("Yahoo: ISIN nicht gefunden");
    let best = null;
    for (let i = 0; i < YAHOO_EUR_SUFFIX.length && !best; i++) {
        const suf = YAHOO_EUR_SUFFIX[i];
        best = quotes.find(q => String(q.symbol).toUpperCase().endsWith(suf)) || null;
    }
    best = best || quotes[0];
    return { symbol: String(best.symbol), name: String(best.longname || best.shortname || "").slice(0, 200) };
}
function yahooChart(symbol, from) {
    const p1 = Math.floor(new Date(from + "T00:00:00Z").getTime() / 1000);
    const p2 = Math.floor(Date.now() / 1000) + 86400;
    const d = httpJson("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) +
        "?period1=" + p1 + "&period2=" + p2 + "&interval=1d&includePrePost=false");
    const r = d && d.chart && Array.isArray(d.chart.result) ? d.chart.result[0] : null;
    if (!r || !r.meta) throw new Error("Yahoo: keine Kursdaten");
    const meta = r.meta;
    const off = Number(meta.gmtoffset) || 0;
    const ts = Array.isArray(r.timestamp) ? r.timestamp : [];
    const closes = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
    const history = [];
    ts.forEach((t, i) => {
        const c = Number(closes[i]);
        if (!(c > 0)) return;
        history.push([new Date((t + off) * 1000).toISOString().slice(0, 10), Math.round(c * 10000) / 10000]);
    });
    const price = Number(meta.regularMarketPrice);
    const mt = Number(meta.regularMarketTime);
    const prev = Number(meta.chartPreviousClose || meta.previousClose);
    return {
        currency: String(meta.currency || ""),
        history: history,
        quote: price > 0 ? {
            price: price,
            date: mt ? new Date((mt + off) * 1000).toISOString().slice(0, 10) : todayIso(),
            prev: prev > 0 ? prev : 0,
            currency: String(meta.currency || ""),
            source: "Yahoo Finance (" + symbol + ")",
        } : null,
    };
}

// ---------------------------------------------------------------------------------------------
// Retrieval with a cache
// ---------------------------------------------------------------------------------------------
function findRecord(isin) {
    try { return $app.findFirstRecordByFilter(KURSE, "isin = {:i}", { i: isin }); } catch (e) { return null; }
}

// Fetches price and history of an ISIN (from the cache or anew) and delivers it for the app.
// ab: the history is needed from this day on; bis: the app already has the history up to this day.
function getKurs(isin, ab, bis, frisch) {
    if (!findCol(KURSE)) ensureSchema();
    let rec = findRecord(isin);
    const isNew = !rec;
    if (!rec) {
        rec = new Record($app.findCollectionByNameOrId(KURSE));
        rec.set("isin", isin);
    }
    const now = Date.now();
    const today = todayIso();
    let need = isIso(ab) ? ab : addDays(today, -400);
    if (need < MIN_DATE) need = MIN_DATE;
    if (need > today) need = today;

    const lastTry = Date.parse(rec.getString("versuch") || "") || 0;
    const paused = now - lastTry < RETRY_PAUSE_MS;
    const fetchedAt = Date.parse(rec.getString("abgerufen") || "") || 0;
    const ttl = frisch ? FRESH_TTL_MS : QUOTE_TTL_MS;
    const needQuote = !paused && (!(rec.getFloat("kurs") > 0) || now - fetchedAt > ttl);
    const histAb = rec.getString("verlauf_ab");
    let history = parseHistory(rec.getString("verlauf"));
    const needFull = !paused && (!histAb || need < histAb);
    const needUpdate = !paused && !needFull && rec.getString("verlauf_geprueft") !== today;

    let changed = false;
    const errors = [];

    // Kursverlauf
    if (needFull || needUpdate) {
        const from = needFull ? (histAb && histAb < need ? histAb : need)
            : addDays(history.length ? history[history.length - 1][0] : need, -10);
        let got = null, src = "";
        try { got = justEtfHistory(isin, from, today); src = "justETF"; } catch (err) { errors.push(err.message); }
        if (!got) {
            try {
                let sym = rec.getString("symbol");
                if (!sym) {
                    const f = yahooFind(isin);
                    sym = f.symbol;
                    rec.set("symbol", sym);
                    if (!rec.getString("name") && f.name) rec.set("name", f.name);
                }
                const ch = yahooChart(sym, from);
                if (ch.history.length) {
                    got = ch.history;
                    src = "Yahoo";
                    if (ch.currency) rec.set("waehrung", ch.currency);
                    if (ch.quote && (needQuote || !(rec.getFloat("kurs") > 0))) {
                        rec.set("kurs", ch.quote.price);
                        rec.set("kurs_datum", ch.quote.date);
                        rec.set("vortag", ch.quote.prev);
                        rec.set("quelle", ch.quote.source);
                        rec.set("abgerufen", new Date().toISOString());
                    }
                }
            } catch (err) { errors.push(err.message); }
        }
        if (got) {
            history = needFull ? mergeHistory(history.filter(x => x[0] < from), got) : mergeHistory(history, got);
            rec.set("verlauf", JSON.stringify(history));
            if (needFull) rec.set("verlauf_ab", from < need ? from : need);
            rec.set("verlauf_geprueft", today);
            if (src === "justETF" && !rec.getString("waehrung")) rec.set("waehrung", "EUR");
            changed = true;
        }
    }

    // Current price (unless it just came along via Yahoo)
    const quoteFresh = now - (Date.parse(rec.getString("abgerufen") || "") || 0) < FRESH_TTL_MS;
    if (needQuote && !quoteFresh) {
        let q = null;
        try { q = justEtfQuote(isin); } catch (err) { errors.push(err.message); }
        if (!q) {
            try {
                let sym = rec.getString("symbol");
                if (!sym) {
                    const f = yahooFind(isin);
                    sym = f.symbol;
                    rec.set("symbol", sym);
                    if (!rec.getString("name") && f.name) rec.set("name", f.name);
                }
                const ch = yahooChart(sym, addDays(today, -7));
                q = ch.quote;
            } catch (err) { errors.push(err.message); }
        }
        if (q) {
            rec.set("kurs", Math.round(q.price * 10000) / 10000);
            rec.set("kurs_datum", q.date);
            rec.set("vortag", q.prev || 0);
            rec.set("quelle", q.source);
            rec.set("waehrung", q.currency || rec.getString("waehrung") || "EUR");
            rec.set("abgerufen", new Date().toISOString());
            changed = true;
        }
    }

    // Look up the name once (for display only)
    if (!rec.getString("name") && !paused && (isNew || changed)) {
        try {
            const f = yahooFind(isin);
            if (f.name) { rec.set("name", f.name); changed = true; }
            if (!rec.getString("symbol")) rec.set("symbol", f.symbol);
        } catch (err) { /* the name is not important */ }
    }

    const hasPrice = rec.getFloat("kurs") > 0;
    if ((needQuote || needFull || needUpdate) && !hasPrice && errors.length) {
        rec.set("versuch", new Date().toISOString());
        rec.set("fehler", errors.join(" · ").slice(0, 300));
        changed = true;
    } else if (changed) {
        rec.set("fehler", "");
    }
    if (changed || isNew) {
        try { $app.save(rec); } catch (err) { console.log("[Kurse] Speichern fehlgeschlagen (" + isin + "): " + err.message); }
    }

    // Response: only the part of the history that the app does not have yet
    let sendFrom = need;
    if (isIso(bis) && bis >= need) sendFrom = addDays(bis, -10);
    return {
        isin: isin,
        name: rec.getString("name"),
        currency: rec.getString("waehrung") || "EUR",
        price: hasPrice ? rec.getFloat("kurs") : 0,
        priceDate: rec.getString("kurs_datum"),
        prev: rec.getFloat("vortag") || 0,
        source: rec.getString("quelle"),
        fetchedAt: rec.getString("abgerufen"),
        histFrom: need,
        delta: sendFrom !== need,
        history: history.filter(x => x[0] >= sendFrom),
        error: hasPrice ? "" : (rec.getString("fehler") || errors.join(" · ") || "Kein Kurs gefunden."),
    };
}

// body: { isins: [{ isin, ab, bis }], frisch }
function getKurse(body) {
    const list = Array.isArray(body && body.isins) ? body.isins.slice(0, 12) : [];
    const out = {};
    list.forEach(item => {
        const isin = String((item && item.isin) || "").toUpperCase().trim();
        if (!isValidIsin(isin)) { out[isin || "?"] = { isin: isin, error: "Ungültige ISIN." }; return; }
        try {
            out[isin] = getKurs(isin, item.ab, item.bis, !!(body && body.frisch));
        } catch (err) {
            out[isin] = { isin: isin, error: err.message };
        }
    });
    return out;
}

module.exports = { ensureSchema, getKurse, isValidIsin };
