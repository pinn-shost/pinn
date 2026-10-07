// pb_hooks/pinn-kalender-konten.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Persönliche Kalender-Konten JE PROFIL (iCloud und Google).
//
// Jedes Profil (außer Gästen) verbindet sein EIGENES iCloud- und/oder Google-Konto und hakt die
// Kalender daraus an (pinn-kalender.js): „Für mich“ (nur dieses Profil sieht sie) oder „Familie“
// (alle Profile der Familie sehen und nutzen sie). Die übrige Familie erfährt vom Konto nur eine
// unkenntlich gemachte Adresse (maskAccount, z. B. m**l@g***l.com) – nie Passwort oder Token.
// Die früheren Familien-Konten (pinn-apple.js / pinn-google.js, „Bearbeiten“) laufen unverändert weiter.
//
//  - iCloud: Apple-ID + App-spezifisches Passwort (wird vor dem Speichern bei iCloud geprüft)
//  - Google: Anmeldung über Google (OAuth, startPersonalAuth in pinn-google.js); gespeichert wird nur
//    der dauerhafte Zugangsschlüssel (Refresh-Token)
//
// Speicherort: gesperrte Sammlung "kalender_konten" (legt sich selbst an, alle API-Regeln null, Felder
// hidden). Passwort bzw. Token liegen verschlüsselt darin – gleicher Schlüssel wie bei den
// Familien-Konten (pinn-apple.js). Wird ein Profil gelöscht, verschwinden seine Konten mit
// (cascadeDelete); beim Trennen eines Google-Kontos wird der Zugang bei Google widerrufen.

const COL = "kalender_konten";
const ARTEN = ["apple", "google"];
const CLOSED_RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
const LIST_CACHE_MS = 10 * 60 * 1000;

const MISSING_APPLE = "Für dein Profil ist noch kein iCloud-Konto verbunden.";
const MISSING_GOOGLE = "Für dein Profil ist noch kein Google-Konto verbunden.";
const BROKEN_SECRET = "Die gespeicherten Zugangsdaten können nicht entschlüsselt werden (Schlüssel geändert?). Bitte das Konto bei deinen eigenen Kalendern neu verbinden.";
const REVOKED_GOOGLE = "Die Verbindung zu deinem Google-Konto ist abgelaufen oder wurde widerrufen. Bitte unter Einstellungen → Kalender → Eigene Kalender neu mit Google verbinden.";

// ---------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}
function apple() { return require(`${__hooks}/pinn-apple.js`); }
function google() { return require(`${__hooks}/pinn-google.js`); }
function cs() { return require(`${__hooks}/calendar-sync.js`); }
function validId(id) { return /^[a-z0-9]{15}$/.test(String(id || "")); }
function validArt(art) { return ARTEN.indexOf(String(art || "")) !== -1; }
function label(art) { return art === "google" ? "Google" : "iCloud"; }

function storeGet(key) { try { return $app.store().get(key); } catch (e) { return null; } }
function storeSet(key, value) { try { $app.store().set(key, value); } catch (e) { /* optional */ } }
function storeRemove(key) { try { $app.store().remove(key); } catch (e) { /* egal */ } }

function errKey(userId, art) { return "pinnKalKontoErr:" + userId + ":" + art; }
function setError(userId, art, msg) { storeSet(errKey(userId, art), String(msg || "")); }
function clearError(userId, art) { storeRemove(errKey(userId, art)); }
function getError(userId, art) { const v = storeGet(errKey(userId, art)); return v ? String(v) : ""; }
function clearCaches(userId, art) {
    if (art === "google") {
        storeRemove("pinnGoogleUTok:" + userId);
        storeRemove("pinnGoogleUCals:" + userId);
    }
    clearError(userId, art);
}

// ---------------------------------------------------------------------------------------------
// Sammlung
// ---------------------------------------------------------------------------------------------
function ensureCollection() {
    let col = findCol(COL);
    if (col) {
        let changed = false;
        CLOSED_RULES.forEach(k => {
            if (col[k] !== null && col[k] !== undefined) { col[k] = null; changed = true; }
        });
        if (changed) {
            $app.save(col);
            console.log("[Kalender-Konten] Zugriffsregeln von \"" + COL + "\" wieder gesperrt.");
        }
        return col;
    }
    const users = findCol("benutzer");
    if (!users) throw new Error("Sammlung \"benutzer\" fehlt noch.");
    $app.save(new Collection({
        type: "base",
        name: COL,
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: "benutzer", type: "relation", collectionId: users.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
            { name: "art", type: "text", max: 10, required: true },
            { name: "konto", type: "text", max: 200, hidden: true },
            { name: "geheimnis", type: "text", max: 4000, hidden: true },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_pinn_kal_konten` ON `" + COL + "` (`benutzer`, `art`)"],
    }));
    col = findCol(COL);
    if (!col) throw new Error("Sammlung \"" + COL + "\" wurde nicht gespeichert.");
    console.log("[Kalender-Konten] Gesperrte Sammlung \"" + COL + "\" angelegt.");
    return col;
}

function findRec(userId, art) {
    if (!validId(userId) || !validArt(art) || !findCol(COL)) return null;
    try { return $app.findFirstRecordByFilter(COL, "benutzer = {:u} && art = {:a}", { u: String(userId), a: String(art) }); } catch (e) { return null; }
}

// Entschlüsseltes Passwort/Token oder "" (stellt bei Bedarf auf den aktuellen Schlüssel um)
function secretOf(rec) {
    if (!rec || !rec.getString("geheimnis")) return "";
    let res = null;
    try { res = apple().decrypt(rec.getString("geheimnis")); } catch (e) { res = null; }
    if (!res) return "";
    if (!res.current) {
        try { rec.set("geheimnis", apple().encrypt(res.text)); $app.save(rec); } catch (e) { /* beim nächsten Mal */ }
    }
    return res.text;
}

function upsert(userId, art, konto, secret) {
    const col = ensureCollection();
    let rec = findRec(userId, art);
    if (!rec) {
        rec = new Record(col);
        rec.set("benutzer", userId);
        rec.set("art", art);
    }
    rec.set("konto", String(konto || "").slice(0, 200));
    rec.set("geheimnis", apple().encrypt(secret));
    $app.save(rec);
    return rec;
}

// ---------------------------------------------------------------------------------------------
// iCloud
// ---------------------------------------------------------------------------------------------
// Apple-ID speichern (vorher bei iCloud geprüft). Rückgabe: Kalenderliste des Kontos.
function saveApple(userId, appleIdRaw, pwRaw) {
    if (!validId(userId)) throw new Error("Ungültiges Profil.");
    const a = apple();
    const appleId = a.cleanAppleId(appleIdRaw);
    const pw = a.cleanAppPassword(pwRaw);
    const invalid = a.validateInput(appleId, pw);
    if (invalid) throw new Error(invalid);
    let acc;
    try {
        acc = cs().appleAccount(appleId, pw, true);
    } catch (e) {
        throw new Error("Anmeldung bei iCloud fehlgeschlagen: " + e.message);
    }
    upsert(userId, "apple", appleId, pw);
    clearCaches(userId, "apple");
    console.log("[Kalender-Konten] iCloud-Konto für Profil " + userId + " gespeichert.");
    return calendarsOut(acc);
}

function appleAccount(userId, forceFresh) {
    const rec = findRec(userId, "apple");
    if (!rec || !rec.getString("geheimnis")) throw new Error(MISSING_APPLE);
    const pw = secretOf(rec);
    if (!pw) { setError(userId, "apple", BROKEN_SECRET); throw new Error(BROKEN_SECRET); }
    try {
        const acc = cs().appleAccount(rec.getString("konto"), pw, forceFresh);
        clearError(userId, "apple");
        return acc;
    } catch (e) {
        setError(userId, "apple", e.message);
        throw e;
    }
}

// ---------------------------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------------------------
function googleToken(userId, forceNew) {
    const key = "pinnGoogleUTok:" + userId;
    if (!forceNew) {
        const cached = storeGet(key);
        if (cached && cached.token && cached.exp - 60000 > Date.now()) return String(cached.token);
    }
    const rec = findRec(userId, "google");
    if (!rec || !rec.getString("geheimnis")) throw new Error(MISSING_GOOGLE);
    const refresh = secretOf(rec);
    if (!refresh) { setError(userId, "google", BROKEN_SECRET); throw new Error(BROKEN_SECRET); }
    try {
        const r = google().refreshAccessToken(refresh);
        storeSet(key, { token: r.token, exp: Date.now() + r.ttlMs });
        clearError(userId, "google");
        return r.token;
    } catch (e) {
        const msg = e.code === "invalid_grant" ? REVOKED_GOOGLE : e.message;
        setError(userId, "google", msg);
        throw new Error(msg);
    }
}

function googleAccount(userId, forceFresh) {
    const g = google();
    let token = googleToken(userId);
    const cacheKey = "pinnGoogleUCals:" + userId;
    let calendars = null;
    if (!forceFresh) {
        const cached = storeGet(cacheKey);
        if (cached && cached.calendars && (Date.now() - cached.ts) < LIST_CACHE_MS) calendars = cached.calendars;
    }
    if (!calendars) {
        let items;
        try {
            items = g.fetchCalendarItems(token);
        } catch (e) {
            if (e.status !== 401) { setError(userId, "google", e.message); throw e; }
            token = googleToken(userId, true); // Zugriffsschlüssel abgelaufen -> einmal neu holen
            items = g.fetchCalendarItems(token);
        }
        calendars = g.calendarsFromItems(items);
        storeSet(cacheKey, { ts: Date.now(), calendars: calendars });
    }
    return {
        kind: "google",
        host: g.CALDAV_HOST,
        xmlHeaders: { "Content-Type": "text/xml; charset=utf-8", "Authorization": "Bearer " + token },
        calendars: calendars,
    };
}

// Von pinn-google.js nach der Google-Anmeldung aufgerufen
function saveGoogle(userId, accountName, refreshToken, accessToken, ttlMs, calendars) {
    if (!validId(userId)) throw new Error("Ungültiges Profil.");
    const old = findRec(userId, "google");
    const oldToken = old ? secretOf(old) : "";
    upsert(userId, "google", accountName, refreshToken);
    clearCaches(userId, "google");
    storeSet("pinnGoogleUTok:" + userId, { token: String(accessToken), exp: Date.now() + (ttlMs || 3600000) });
    storeSet("pinnGoogleUCals:" + userId, { ts: Date.now(), calendars: calendars || [] });
    // Anderes Google-Konto als vorher? Alten Zugang bei Google widerrufen.
    if (oldToken && oldToken !== refreshToken && old.getString("konto") !== String(accountName || "")) {
        try { google().revokeToken(oldToken); } catch (e) { /* optional */ }
    }
}

// ---------------------------------------------------------------------------------------------
// Allgemein
// ---------------------------------------------------------------------------------------------
function account(userId, art, forceFresh) {
    if (art === "google") return googleAccount(userId, forceFresh);
    if (art === "apple") return appleAccount(userId, forceFresh);
    throw new Error("Unbekannte Kontoart.");
}

function displayName(acc, name) {
    let n = String(name || "");
    if (acc && acc.kind === "google") {
        try { if (google().isGoogleName(n)) n = n.slice(0, n.length - google().NAME_SUFFIX.length); } catch (e) { /* so lassen */ }
    }
    return n;
}

// Kalender eines Kontos für die App: [{ name, href, nurLesen }]
function calendarsOut(acc) {
    return (acc.calendars || []).map(c => ({
        name: displayName(acc, c.name),
        href: String(c.href),
        nurLesen: acc.kind === "google" ? c.writable === false : false,
    }));
}

function listCalendars(userId, art) {
    return calendarsOut(account(userId, art, true));
}

function isConnected(userId, art) {
    const rec = findRec(userId, art);
    return !!(rec && rec.getString("geheimnis"));
}

// Status für die App (nie Passwort oder Token). origin: Adresse der App (für die Weiterleitungs-URI,
// die bei fehlender Google-Einrichtung angezeigt wird)
function status(userId, origin) {
    const a = findRec(userId, "apple");
    const g = findRec(userId, "google");
    let available = false, source = "", redirectUri = "";
    try { available = google().isAvailable(); } catch (e) { available = false; }
    try { source = google().clientSource(); } catch (e) { source = ""; }
    try { redirectUri = google().redirectUriInfo(origin); } catch (e) { redirectUri = ""; }
    return {
        apple: { verbunden: !!(a && a.getString("geheimnis")), konto: a ? a.getString("konto") : "", fehler: a ? getError(userId, "apple") : "" },
        google: {
            verfuegbar: available, verbunden: !!(g && g.getString("geheimnis")), konto: g ? g.getString("konto") : "", fehler: g ? getError(userId, "google") : "",
            client: source, weiterleitung: redirectUri,
        },
    };
}

// Konto-Name (Apple-ID bzw. Google-Adresse) eines Profils – für die Kalenderliste
function kontoName(userId, art) {
    const rec = findRec(userId, art);
    return rec ? rec.getString("konto") : "";
}

// Konto für andere Familienmitglieder unkenntlich machen: name@gmail.com -> n**e@g***l.com
function maskAccount(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const star = (part, n) => {
        if (!part) return "";
        if (part.length <= 2) return part.charAt(0) + "*".repeat(n);
        return part.charAt(0) + "*".repeat(n) + part.charAt(part.length - 1);
    };
    const at = s.lastIndexOf("@");
    if (at < 1) return star(s, 3);
    const local = s.slice(0, at), domain = s.slice(at + 1);
    const dot = domain.lastIndexOf(".");
    const host = dot > 0 ? domain.slice(0, dot) : domain;
    const tld = dot > 0 ? domain.slice(dot) : "";
    return star(local, 2) + "@" + star(host, 3) + tld;
}

// Konto trennen (Google: Zugang bei Google widerrufen)
function remove(userId, art) {
    const rec = findRec(userId, art);
    if (rec) {
        if (art === "google") {
            const token = secretOf(rec);
            if (token) { try { google().revokeToken(token); } catch (e) { /* optional */ } }
        }
        $app.delete(rec);
    }
    clearCaches(userId, art);
}

function removeAll(userId) {
    ARTEN.forEach(art => { try { remove(userId, art); } catch (e) { /* egal */ } });
}

function setup() {
    ensureCollection();
}

module.exports = {
    COL, ARTEN, label, validArt, setup, ensureCollection,
    saveApple, saveGoogle, account, listCalendars, displayName, isConnected, status, remove, removeAll, kontoName, maskAccount,
    setError, clearError, getError,
};
