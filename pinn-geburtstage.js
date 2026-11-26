// pb_hooks/pinn-geburtstage.js
// Not a *.pb.js -> NOT loaded automatically as a hook, only included via require()
// (routes and schedule in geburtstage.pb.js).
//
// Birthdays from contacts - merged from these sources:
//  - Family accounts (Settings → Calendar → "Edit", the older way):
//     - iCloud contacts (CardDAV): the same Apple ID + app-specific password as the family calendar
//       (encrypted in "apple_zugaenge", see pinn-apple.js).
//     - Google contacts (People API): the same Google account as the family's Android calendar
//       (encrypted in "google_zugaenge", see pinn-google.js - fetched there in fetchBirthdays).
//  - Personal iCloud account of a profile (since 1.103): since the calendar settings were rebuilt, every
//    profile signs in with its OWN iCloud account (pinn-kalender-konten.js, collection "kalender_konten").
//    Its contacts are private: they only appear for this one profile, never for the rest of the family.
//    (Personal Google sign-ins only grant the calendar, not the contacts - so only iCloud here.)
//  No further setup needed. Only name + date of birth are taken over (photos, phone numbers, addresses
//  etc. are not stored). The same person with the same date in several accounts appears only once.
//  - Result per family in pb_data/pinn_geburtstage_<family id>.json and per profile in
//    pb_data/pinn_geburtstage_u_<profile id>.json (not public, only delivered via the signed-in route).
//    Every entry remembers its source (q: "a" = iCloud, "g" = Google), so the last state of a source is
//    kept when it fails, and entries of a disconnected account disappear right away.
//  - Gentle on CPU and network: synced once a day at night (schedule) or with the button in the settings
//    (at most every 2 minutes). If an account is added, removed or changed, the next request syncs once.
//    The app only reads the finished file.
//  - Without any connected account the birthday file is deleted.

const ENTRY_HOST = "https://contacts.icloud.com";
const MANUAL_WAIT_MS = 2 * 60 * 1000;
const FIRST_TRY_WAIT_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 3000;
const NS = 'xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"';

function validFamilyId(id) {
    return /^[a-z0-9]{15}$/.test(String(id || ""));
}
function dateiPfad(familyId) {
    return validFamilyId(familyId) ? "/pb_data/pinn_geburtstage_" + familyId + ".json" : "";
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function base64Encode(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const str = String(input);
    let out = "";
    for (let i = 0; i < str.length; i += 3) {
        const a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2);
        if (a > 0xFF || (b > 0xFF) || (c > 0xFF)) throw new Error("Die Apple-ID enthält Zeichen, die nicht unterstützt werden.");
        const n = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
        out += chars.charAt((n >> 18) & 63) + chars.charAt((n >> 12) & 63) +
            (isNaN(b) ? "=" : chars.charAt((n >> 6) & 63)) +
            (isNaN(c) ? "=" : chars.charAt(n & 63));
    }
    return out;
}
function resolveHref(host, href) {
    const h = String(href || "").trim();
    if (/^https?:\/\//i.test(h)) return h;
    return host + (h.charAt(0) === "/" ? "" : "/") + h;
}
function hostOf(url) {
    const m = String(url).match(/^https?:\/\/[^\/]+/i);
    return m ? m[0] : ENTRY_HOST;
}
function ok(res) {
    return !!res && (res.statusCode === 207 || res.statusCode === 200);
}
function hrefInside(raw, tag) {
    const re = new RegExp("<[^>]*" + tag + "[^>]*>\\s*<[^>]*href[^>]*>([\\s\\S]*?)<\\/[^>]*href[^>]*>", "i");
    const m = String(raw || "").match(re);
    return m ? m[1].trim() : "";
}
function decodeXml(s) {
    let t = String(s || "");
    const cdata = t.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdata) return cdata[1];
    return t
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (x, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (x, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, "&");
}
function readText(path) {
    try {
        return require(`${__hooks}/calendar-sync.js`).bytesToText($os.readFile(path));
    } catch (e) {
        return "";
    }
}
function maskEmail(email) {
    const s = String(email || "");
    const at = s.indexOf("@");
    return at < 1 ? "***" : s.slice(0, Math.min(2, at)) + "***@***";
}

// ---------------------------------------------------------------------------------------------
// CardDAV (iCloud): find the address books
// ---------------------------------------------------------------------------------------------
function discoverAddressbooks(email, password) {
    const headers = { "Content-Type": "text/xml; charset=utf-8", "Authorization": "Basic " + base64Encode(email + ":" + password) };

    // 1. current-user-principal
    const pRes = $http.send({
        url: ENTRY_HOST + "/",
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "0" }, headers),
        body: '<d:propfind ' + NS + '><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    });
    if (pRes.statusCode === 401) throw new Error("Anmeldung bei iCloud-Kontakten fehlgeschlagen (401) – Apple-ID oder App-spezifisches Passwort prüfen.");
    if (!ok(pRes)) throw new Error("iCloud-Kontakte antworten nicht wie erwartet (Status " + pRes.statusCode + ").");
    const principal = hrefInside(pRes.raw, "current-user-principal");
    if (!principal) throw new Error("iCloud-Kontakte: Konto nicht gefunden (current-user-principal).");

    // 2. addressbook-home-set (usually on another server, e.g. p42-contacts.icloud.com)
    const hRes = $http.send({
        url: resolveHref(ENTRY_HOST, principal),
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "0" }, headers),
        body: '<d:propfind ' + NS + '><d:prop><card:addressbook-home-set/></d:prop></d:propfind>',
    });
    if (!ok(hRes)) throw new Error("iCloud-Kontakte: Adressbuch-Ordner nicht abrufbar (Status " + hRes.statusCode + ").");
    const homeHref = hrefInside(hRes.raw, "addressbook-home-set");
    if (!homeHref) throw new Error("iCloud-Kontakte: Adressbuch-Ordner nicht gefunden.");
    const homeUrl = resolveHref(ENTRY_HOST, homeHref);
    const host = hostOf(homeUrl);
    const homePath = homeUrl.replace(/^https?:\/\/[^\/]+/i, "");

    // 3. Address books in the folder
    const books = [];
    const lRes = $http.send({
        url: homeUrl,
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "1" }, headers),
        body: '<d:propfind ' + NS + '><d:prop><d:resourcetype/></d:prop></d:propfind>',
    });
    if (ok(lRes)) {
        String(lRes.raw || "").split(/<\/[^>]*:?response>/i).forEach(seg => {
            if (!/addressbook/i.test(seg)) return;
            const m = seg.match(/<[^>]*href[^>]*>([\s\S]*?)<\/[^>]*href[^>]*>/i);
            if (!m) return;
            const path = m[1].trim().replace(/^https?:\/\/[^\/]+/i, "");
            if (!path || path === homePath) return;
            books.push(resolveHref(host, path));
        });
    }
    // iCloud practically always has exactly one address book "card" - in case the list stays empty
    if (!books.length) books.push(homeUrl.replace(/\/?$/, "/") + "card/");
    return { headers: headers, books: books };
}

// ---------------------------------------------------------------------------------------------
// CardDAV (iCloud): fetch contacts with a birthday
// ---------------------------------------------------------------------------------------------
function queryBody(withFilter) {
    const data = withFilter
        ? '<card:address-data><card:prop name="FN"/><card:prop name="N"/><card:prop name="BDAY"/></card:address-data>'
        : '<card:address-data/>';
    const filter = withFilter ? '<card:filter><card:prop-filter name="BDAY"/></card:filter>' : '';
    return '<?xml version="1.0" encoding="utf-8"?><card:addressbook-query ' + NS + '><d:prop><d:getetag/>' + data + '</d:prop>' + filter + '</card:addressbook-query>';
}
function addressDataBlocks(raw) {
    const out = [];
    const re = /<(?:[A-Za-z][\w.-]*:)?address-data(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z][\w.-]*:)?address-data>/gi;
    let m;
    while ((m = re.exec(String(raw || ""))) !== null) {
        if (m[1] && m[1].indexOf("VCARD") >= 0) out.push(decodeXml(m[1]));
    }
    return out;
}
function fetchCards(bookUrl, headers) {
    // Lean first: only contacts with a birthday, only name + date. If the server does not support that
    // (error or empty answer), once more without a filter.
    const attempts = [true, false];
    let lastStatus = 0;
    for (let i = 0; i < attempts.length; i++) {
        const res = $http.send({
            url: bookUrl,
            method: "REPORT",
            timeout: 90,
            headers: Object.assign({ "Depth": "1" }, headers),
            body: queryBody(attempts[i]),
        });
        lastStatus = res.statusCode;
        if (res.statusCode === 401) throw new Error("Anmeldung bei iCloud-Kontakten fehlgeschlagen (401).");
        if (!ok(res)) continue;
        const blocks = addressDataBlocks(res.raw);
        if (blocks.length || i === attempts.length - 1) return blocks;
    }
    throw new Error("Kontakte konnten nicht geladen werden (Status " + lastStatus + ").");
}

// ---------------------------------------------------------------------------------------------
// Read a vCard
// ---------------------------------------------------------------------------------------------
function unescapeValue(v) {
    return String(v || "")
        .replace(/\\n/gi, " ")
        .replace(/\\([,;:\\])/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}
// { m, d, y|null } or null
function parseBday(params, value) {
    const v = String(value || "").trim();
    let y = null, m = 0, d = 0;
    let mm = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (mm) {
        y = parseInt(mm[1], 10); m = parseInt(mm[2], 10); d = parseInt(mm[3], 10);
    } else {
        mm = v.match(/^--(\d{2})-?(\d{2})/);
        if (!mm) return null;
        m = parseInt(mm[1], 10); d = parseInt(mm[2], 10);
    }
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    // Apple stores "without year" as 1604 (X-APPLE-OMIT-YEAR)
    if (y !== null && (y <= 1604 || /X-APPLE-OMIT-YEAR/i.test(params) || y > new Date().getFullYear())) y = null;
    return { m: m, d: d, y: y };
}
function parseVcard(text) {
    const lines = String(text || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
    let fn = "", n = "", bday = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const idx = line.indexOf(":");
        if (idx < 1) continue;
        const left = line.slice(0, idx);
        const value = line.slice(idx + 1);
        const name = left.split(";")[0].toUpperCase();
        if (name === "FN" && !fn) fn = unescapeValue(value);
        else if (name === "N" && !n) n = value;
        else if (name === "BDAY" && !bday) bday = parseBday(left, value);
    }
    if (!bday) return null;
    let name = fn;
    if (!name && n) {
        const p = n.replace(/\\;/g, "\u0000").split(";").map(x => unescapeValue(x.replace(/\u0000/g, ";")));
        name = [p[1], p[2], p[0]].filter(Boolean).join(" ").trim();
    }
    name = String(name || "").slice(0, 80);
    if (!name) return null;
    return { n: name, m: bday.m, d: bday.d, y: bday.y };
}

// ---------------------------------------------------------------------------------------------
// Sync + file
// ---------------------------------------------------------------------------------------------
function writeFile(familyId, obj) {
    const path = dateiPfad(familyId);
    if (path) $os.writeFile(path, JSON.stringify(obj), 384); // 0600
}
function readFile(familyId) {
    const path = dateiPfad(familyId);
    if (!path) return null;
    const txt = readText(path);
    if (!txt) return null;
    try {
        const o = JSON.parse(txt);
        return (o && Array.isArray(o.liste)) ? o : null;
    } catch (e) {
        return null;
    }
}
function removeFile(familyId) {
    const path = dateiPfad(familyId);
    if (path) try { $os.remove(path); } catch (e) { /* not there */ }
}

function apple() { return require(`${__hooks}/pinn-apple.js`); }
function google() { return require(`${__hooks}/pinn-google.js`); }

// Which family accounts are connected? { apple, google }
function sourcesOf(familyId) {
    let a = false, g = false;
    try { a = apple().hasCredentials(familyId); } catch (e) { a = false; }
    try { g = google().isAvailable() && google().hasCredentials(familyId); } catch (e) { g = false; }
    return { apple: a, google: g };
}
// Sources of a saved state (older files only knew iCloud)
function sourcesOfFile(data) {
    if (data && data.quellen && typeof data.quellen === "object") return { apple: !!data.quellen.apple, google: !!data.quellen.google };
    return { apple: true, google: false };
}
function entrySource(b) { return b && b.q === "g" ? "google" : "apple"; }
function countBySource(liste) {
    const n = { apple: 0, google: 0 };
    (liste || []).forEach(b => { n[entrySource(b)]++; });
    return n;
}

function iCloudBirthdays(creds) {
    const found = discoverAddressbooks(creds.email, creds.appPassword);
    const out = [];
    found.books.forEach(url => {
        fetchCards(url, found.headers).forEach(card => {
            const b = parseVcard(card);
            if (b) out.push(b);
        });
    });
    return out;
}

// Fetch the birthdays of a family again from iCloud and Google and save them. Returns the saved state.
function refreshFamily(familyId) {
    if (!validFamilyId(familyId)) throw new Error("Ungültige Familie.");
    const src = sourcesOf(familyId);
    const creds = src.apple ? apple().getCredentials(familyId) : { configured: false, error: "" };
    if (!src.apple && !src.google) {
        removeFile(familyId);
        return { stand: "", liste: [], fehler: creds.error || "", quellen: src };
    }
    try { $app.store().set("pinnBdayRun:" + familyId, Date.now()); } catch (e) { /* optional */ }
    const old = readFile(familyId);
    const oldSrc = sourcesOfFile(old);
    const oldList = old ? old.liste : [];

    const seen = {};
    const liste = [];
    const fehler = [];
    let anyOk = false;
    const add = (b, q) => {
        if (!b || liste.length >= MAX_ENTRIES) return;
        const key = String(b.n).toLowerCase() + "|" + b.m + "|" + b.d;
        if (seen[key] !== undefined) {
            const prev = liste[seen[key]];
            if (!prev.y && b.y) prev.y = b.y; // add the year from the other source
            return;
        }
        seen[key] = liste.length;
        liste.push({ n: b.n, m: b.m, d: b.d, y: b.y || null, q: q });
    };
    // If a source fails: keep its last state
    const keepOld = (source) => {
        if (!oldSrc[source]) return;
        oldList.forEach(b => { if (entrySource(b) === source) add(b, source === "google" ? "g" : "a"); });
    };

    // iCloud
    if (src.apple) {
        if (!creds.configured) {
            fehler.push("iCloud: " + (creds.error || "Apple-ID nicht lesbar."));
            keepOld("apple");
        } else {
            try {
                const found = iCloudBirthdays(creds);
                found.forEach(b => add(b, "a"));
                anyOk = true;
                console.log("[Geburtstage] iCloud: " + found.length + " Geburtstag(e) für " + maskEmail(creds.email) + ".");
            } catch (err) {
                fehler.push("iCloud: " + String(err.message || err));
                keepOld("apple");
                console.log("[Geburtstage] iCloud-Abgleich fehlgeschlagen (" + maskEmail(creds.email) + "): " + (err.message || err));
            }
        }
    }

    // Google
    if (src.google) {
        let konto = "";
        try { konto = google().connectedAccount(familyId); } catch (e) { konto = ""; }
        try {
            const found = google().fetchBirthdays(familyId);
            found.forEach(b => add(b, "g"));
            anyOk = true;
            console.log("[Geburtstage] Google: " + found.length + " Geburtstag(e) für " + maskEmail(konto) + ".");
        } catch (err) {
            fehler.push("Google: " + String(err.message || err));
            keepOld("google");
            console.log("[Geburtstage] Google-Abgleich fehlgeschlagen (" + maskEmail(konto) + "): " + (err.message || err));
        }
    }

    liste.sort((a, b) => (a.m - b.m) || (a.d - b.d) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    const result = {
        stand: anyOk ? new Date().toISOString() : (old ? old.stand : ""),
        liste: liste,
        fehler: fehler.join(" · "),
        quellen: src,
    };
    if (!anyOk) result.versuch = new Date().toISOString();
    try { writeFile(familyId, result); } catch (e) { console.log("[Geburtstage] Datei konnte nicht geschrieben werden: " + e.message); }
    console.log("[Geburtstage] Familie " + familyId + ": " + liste.length + " Geburtstag(e) gespeichert" + (fehler.length ? " (mit Fehlern)." : "."));
    return result;
}

function lastRun(familyId) {
    try { return Number($app.store().get("pinnBdayRun:" + familyId)) || 0; } catch (e) { return 0; }
}

// ---------------------------------------------------------------------------------------------
// Personal iCloud account of a profile (since 1.103) - only visible for this profile
// ---------------------------------------------------------------------------------------------
function konten() { return require(`${__hooks}/pinn-kalender-konten.js`); }
function personalPath(userId) {
    return validFamilyId(userId) ? "/pb_data/pinn_geburtstage_u_" + userId + ".json" : "";
}
function readAt(path) {
    if (!path) return null;
    const txt = readText(path);
    if (!txt) return null;
    try {
        const o = JSON.parse(txt);
        return (o && Array.isArray(o.liste)) ? o : null;
    } catch (e) {
        return null;
    }
}
function personalRecord(userId) {
    if (!validFamilyId(userId)) return null;
    try {
        return $app.findFirstRecordByFilter(konten().COL, "benutzer = {:u} && art = 'apple'", { u: String(userId) });
    } catch (e) {
        return null;
    }
}
// Apple ID of the profile's own iCloud account ("" = none)
function personalAccount(userId) {
    const rec = personalRecord(userId);
    return rec && rec.getString("geheimnis") ? rec.getString("konto") : "";
}
// { configured, email, appPassword, error } - same shape as pinn-apple.js#getCredentials
function personalCredentials(userId) {
    const rec = personalRecord(userId);
    if (!rec || !rec.getString("geheimnis")) return { configured: false, error: "" };
    let res = null;
    try { res = apple().decrypt(rec.getString("geheimnis")); } catch (e) { res = null; }
    if (!res || !res.text) return { configured: false, error: "Die gespeicherten Zugangsdaten deines iCloud-Kontos können nicht entschlüsselt werden – bitte unter Einstellungen → Kalender neu verbinden." };
    return { configured: true, email: rec.getString("konto"), appPassword: res.text, error: "" };
}
function lastRunUser(userId) {
    try { return Number($app.store().get("pinnBdayRunU:" + userId)) || 0; } catch (e) { return 0; }
}
// Fetch the birthdays of a profile's own iCloud account again and save them. Returns the saved state.
function refreshPersonal(userId) {
    const path = personalPath(userId);
    if (!path) throw new Error("Ungültiges Profil.");
    const creds = personalCredentials(userId);
    if (!creds.configured && !creds.error) {
        try { $os.remove(path); } catch (e) { /* not there */ }
        return null;
    }
    try { $app.store().set("pinnBdayRunU:" + userId, Date.now()); } catch (e) { /* optional */ }
    const old = readAt(path);
    let liste = [], fehler = "", okRun = false;
    if (!creds.configured) {
        fehler = "iCloud: " + creds.error;
    } else {
        try {
            const seen = {};
            iCloudBirthdays(creds).forEach(b => {
                const key = String(b.n).toLowerCase() + "|" + b.m + "|" + b.d;
                if (seen[key] || liste.length >= MAX_ENTRIES) return;
                seen[key] = true;
                liste.push({ n: b.n, m: b.m, d: b.d, y: b.y || null, q: "a" });
            });
            okRun = true;
            console.log("[Geburtstage] iCloud (Profil): " + liste.length + " Geburtstag(e) für " + maskEmail(creds.email) + ".");
        } catch (err) {
            fehler = "iCloud: " + String(err.message || err);
            console.log("[Geburtstage] iCloud-Abgleich (Profil) fehlgeschlagen (" + maskEmail(creds.email) + "): " + (err.message || err));
        }
    }
    // On failure keep the last state of the same account
    if (!okRun && old && old.konto === (creds.email || "")) liste = old.liste || [];
    liste.sort((a, b) => (a.m - b.m) || (a.d - b.d) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    const result = { stand: okRun ? new Date().toISOString() : (old ? old.stand || "" : ""), liste: liste, fehler: fehler, konto: creds.email || "" };
    try { $os.writeFile(path, JSON.stringify(result), 384); } catch (e) { console.log("[Geburtstage] Datei konnte nicht geschrieben werden: " + e.message); }
    return result;
}
// Saved state of the profile's own account (null = no own iCloud account). Synced once right away if
// there is no file yet or the Apple ID changed since.
function personalPart(userId) {
    const path = personalPath(userId);
    if (!path) return null;
    const konto = personalAccount(userId);
    if (!konto) {
        try { $os.remove(path); } catch (e) { /* not there */ }
        return null;
    }
    let data = readAt(path);
    const since = Date.now() - lastRunUser(userId);
    if ((!data && since > FIRST_TRY_WAIT_MS) || (data && data.konto !== konto && since > MANUAL_WAIT_MS)) {
        try { data = refreshPersonal(userId); } catch (e) { /* keep the old state */ }
    }
    if (data && data.konto && data.konto !== konto) data = null; // belongs to the previous account
    return data || { stand: "", liste: [], fehler: "" };
}

// ---------------------------------------------------------------------------------------------
// Family accounts
// ---------------------------------------------------------------------------------------------
// Saved state of the family (null = no family account). If there is no file yet or an account was added
// or removed since, it is synced once right away (afterwards only at night or with the button).
function familyPart(familyId) {
    if (!validFamilyId(familyId)) return null;
    const src = sourcesOf(familyId);
    if (!src.apple && !src.google) {
        removeFile(familyId);
        return null;
    }
    let data = readFile(familyId);
    const fileSrc = sourcesOfFile(data);
    const changed = !!data && (fileSrc.apple !== src.apple || fileSrc.google !== src.google);
    const since = Date.now() - lastRun(familyId);
    if ((!data && since > FIRST_TRY_WAIT_MS) || (changed && since > MANUAL_WAIT_MS)) data = refreshFamily(familyId);
    data = data || { stand: "", liste: [], fehler: "" };
    // Hide entries of accounts that are no longer connected right away
    return { src: src, stand: data.stand || "", liste: (data.liste || []).filter(b => src[entrySource(b)]), fehler: data.fehler || "" };
}

// For the app: birthdays of the own family plus those of the profile's own iCloud account
function forFamily(familyId, userId) {
    const leer = { eingerichtet: false, stand: "", liste: [], fehler: "", quellen: { apple: false, google: false }, anzahl: { apple: 0, google: 0 } };
    const fam = familyPart(familyId);
    let own = null;
    try { own = userId ? personalPart(userId) : null; } catch (e) { own = null; }
    if (!fam && !own) return leer;
    const seen = {};
    const liste = [];
    const add = b => {
        if (!b || liste.length >= MAX_ENTRIES) return;
        const key = String(b.n).toLowerCase() + "|" + b.m + "|" + b.d;
        if (seen[key] !== undefined) {
            const prev = liste[seen[key]];
            if (!prev.y && b.y) prev.y = b.y;
            return;
        }
        seen[key] = liste.length;
        liste.push({ n: b.n, m: b.m, d: b.d, y: b.y || null, q: b.q === "g" ? "g" : "a" });
    };
    if (fam) fam.liste.forEach(add);
    if (own) (own.liste || []).forEach(add);
    liste.sort((a, b) => (a.m - b.m) || (a.d - b.d) || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
    const stands = [fam ? fam.stand : "", own ? own.stand || "" : ""].filter(Boolean).sort();
    const fehler = [fam ? fam.fehler : "", own ? own.fehler || "" : ""].filter(Boolean).join(" · ");
    return {
        eingerichtet: true,
        stand: stands.length ? stands[stands.length - 1] : "",
        liste: liste,
        fehler: fehler,
        quellen: { apple: !!((fam && fam.src.apple) || own), google: !!(fam && fam.src.google) },
        anzahl: countBySource(liste),
    };
}

// With the button. Throws when called too soon after the last sync.
function refreshNow(familyId, userId) {
    const famWait = MANUAL_WAIT_MS - (Date.now() - lastRun(familyId));
    const ownWait = userId ? MANUAL_WAIT_MS - (Date.now() - lastRunUser(userId)) : 0;
    const wait = Math.max(famWait, ownWait);
    if (wait > 0) {
        throw new Error("Die Geburtstage wurden gerade erst abgeglichen. Bitte in " + Math.ceil(wait / 1000) + " Sekunden erneut versuchen.");
    }
    const src = sourcesOf(familyId);
    if (src.apple || src.google) refreshFamily(familyId);
    if (userId && personalAccount(userId)) refreshPersonal(userId);
    return forFamily(familyId, userId);
}

// Nightly sync: all families with a family account and all profiles with their own iCloud account
function runCron() {
    const ids = {};
    try { apple().familiesWithCredentials().forEach(id => { ids[id] = true; }); } catch (e) { /* none */ }
    try { if (google().isAvailable()) google().familiesWithCredentials().forEach(id => { ids[id] = true; }); } catch (e) { /* none */ }
    Object.keys(ids).forEach(id => {
        try { refreshFamily(id); } catch (e) { console.log("[Geburtstage] Fehler: " + e.message); }
    });
    let users = [];
    try {
        users = $app.findRecordsByFilter(konten().COL, "art = 'apple' && geheimnis != ''", "", 0, 0).map(r => r.getString("benutzer")).filter(validFamilyId);
    } catch (e) { users = []; }
    users.forEach(id => {
        try { refreshPersonal(id); } catch (e) { console.log("[Geburtstage] Fehler: " + e.message); }
    });
}

module.exports = { forFamily, refreshNow, refreshFamily, refreshPersonal, runCron, removeFile, parseVcard };
