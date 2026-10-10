// pb_hooks/pinn-google.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
//
// Google-Kalender (Android) JE FAMILIE - das Gegenstück zu pinn-apple.js.
//
// Android-Handys speichern ihre Kalender im Google-Konto. pinn. greift darauf genauso zu wie auf
// iCloud: über CalDAV (Termine lesen, anlegen, ändern, löschen, Rohtext für "Bearbeiten"). Nur die
// Anmeldung ist anders: Google erlaubt für Kalender keine App-Passwörter, sondern nur die Anmeldung
// über Google selbst (OAuth). Ablauf:
//  1. Ein Admin der Familie tippt in den Einstellungen auf "Mit Google verbinden" (startAuth).
//  2. Google fragt nach Konto und Erlaubnis und schickt den Browser zurück an
//     /api/pinn/google/callback (finishAuth).
//  3. pinn. bekommt dafür einen dauerhaften Zugangsschlüssel (Refresh-Token). Nur dieser wird
//     gespeichert - verschlüsselt (gleicher Schlüssel wie bei Apple, siehe pinn-apple.js) in der
//     gesperrten Sammlung "google_zugaenge". Das Google-Passwort sieht pinn. nie.
//  4. Für jeden Zugriff holt der Server damit einen kurzlebigen Zugriffsschlüssel (1 Stunde gültig,
//     im Server-Speicher gemerkt).
//
// Geburtstage: aus den Google-Kontakten über die People API (nur Lesen, nur Name + Geburtsdatum,
// siehe fetchBirthdays - genutzt von pinn-geburtstage.js). Dafür fragt die Google-Anmeldung zusätzlich
// nach der Leseberechtigung für Kontakte. Ältere Verbindungen (nur Kalender) müssen dafür einmal
// "Neu verbinden"; der Kalender läuft auch ohne Kontakt-Freigabe weiter.
//
// Persönliche Google-Konten: Zusätzlich kann jedes Profil sein EIGENES Google-Konto verbinden, um
// eigene Kalender „Nur für mich“ mit Google-Kalendern zu verknüpfen (pinn-kalender-konten.js). Die
// Anmeldung läuft über dieselbe Rückkehr-Adresse (CALLBACK_PATH); der einmalige "state" merkt sich, ob
// es um die Familie oder ein einzelnes Profil geht (startPersonalAuth / finishAuth). Dafür wird nur
// der Kalender freigegeben, nicht die Kontakte.
//
// Kalenderliste: über die Google Calendar API. Termine: über die Google-CalDAV-Schnittstelle
// (https://apidata.googleusercontent.com/caldav/v2/<Kalender-ID>/events/). Google-Kalender heißen in
// pinn. "<Name> (Google)" - daran erkennt calendar-sync.js, welches Konto zuständig ist.
//
// Einmalige Einrichtung auf dem Server (.env neben der docker-compose.yaml):
//   PINN_GOOGLE_CLIENT_ID     = OAuth-Client-ID aus der Google Cloud Console
//   PINN_GOOGLE_CLIENT_SECRET = zugehöriger Clientschlüssel
//   PINN_ADRESSE              = optional, feste Adresse von pinn. (z. B. https://deine-subdomain.duckdns.org:8443).
//                               Leer = die Adresse, über die die App gerade geöffnet ist.
// Im Google-Cloud-Projekt aktiviert: Google Calendar API, CalDAV API und (für Geburtstage) People API.

const GOOGLE = "google_zugaenge";
const CLIENT_ID_ENV = "PINN_GOOGLE_CLIENT_ID";
const CLIENT_SECRET_ENV = "PINN_GOOGLE_CLIENT_SECRET";
const ADDRESS_ENV = "PINN_ADRESSE";
const CALLBACK_PATH = "/api/pinn/google/callback";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const PEOPLE_URL = "https://people.googleapis.com/v1/people/me/connections";
const PEOPLE_MAX_PAGES = 10;
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_LIST_URL = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const CALDAV_HOST = "https://apidata.googleusercontent.com";
const NAME_SUFFIX = " (Google)";
const STATE_TTL_MS = 15 * 60 * 1000;
const LIST_CACHE_MS = 10 * 60 * 1000;
const CLOSED_RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];
const CLIENT_COL = "google_client";
const CLIENT_CACHE_KEY = "pinnGoogleClient";

const MISSING_MESSAGE = "Für deine Familie ist noch kein Google-Konto verbunden (Einstellungen → Kalender → Bearbeiten).";
const NOT_AVAILABLE_MESSAGE = "Google ist auf diesem Server noch nicht eingerichtet: PINN_GOOGLE_CLIENT_ID und PINN_GOOGLE_CLIENT_SECRET in der .env eintragen und den Container mit „docker compose up -d“ neu erstellen (ein Neustart reicht nicht) – oder die beiden Werte in pinn. unter Einstellungen → Kalender → Kalender hinzufügen → Google hinterlegen.";
const REVOKED_MESSAGE = "Die Verbindung zu Google ist abgelaufen oder wurde widerrufen. Bitte unter Einstellungen → Kalender → Bearbeiten neu mit Google verbinden.";
const CALDAV_DISABLED_MESSAGE = "Im Google-Cloud-Projekt ist die „CalDAV API“ noch nicht aktiviert (console.cloud.google.com → APIs und Dienste → Bibliothek → „CalDAV API“ → Aktivieren). Danach in pinn. auf „Jetzt aktualisieren“ tippen.";
const PEOPLE_API_DISABLED_MESSAGE = "Im Google-Cloud-Projekt ist die „People API“ noch nicht aktiviert (console.cloud.google.com → APIs und Dienste → Bibliothek → „People API“ → Aktivieren). Danach in pinn. die Geburtstage aktualisieren.";
const CONTACTS_SCOPE_MESSAGE = "Das Google-Konto hat pinn. noch keinen Lesezugriff auf die Kontakte erlaubt. Für die Geburtstage unter Einstellungen → Kalender → Bearbeiten „Neu verbinden“ und bei Google den Haken für die Kontakte setzen.";
const CALENDAR_API_DISABLED_MESSAGE = "Im Google-Cloud-Projekt ist die „Google Calendar API“ noch nicht aktiviert (console.cloud.google.com → APIs und Dienste → Bibliothek → „Google Calendar API“ → Aktivieren).";

// ---------------------------------------------------------------------------------------------
// Kleinkram
// ---------------------------------------------------------------------------------------------
function readEnv(name) {
    try { return String($os.getenv(name) || "").trim(); } catch (e) { return ""; }
}
function validFamilyId(id) {
    return /^[a-z0-9]{15}$/.test(String(id || ""));
}
// OAuth-Client: bevorzugt aus der .env. Fehlt er dort (z. B. weil der Container nach dem Eintragen
// nicht neu erstellt wurde – ein einfacher Neustart liest die .env nicht neu ein), kann ein Admin ihn
// in der App hinterlegen (Einstellungen → Kalender → Kalender hinzufügen → Google). Er liegt dann
// verschlüsselt in der gesperrten Sammlung "google_client".
function envClientSet() { return !!(readEnv(CLIENT_ID_ENV) && readEnv(CLIENT_SECRET_ENV)); }
function storedClient() {
    const cached = storeGet(CLIENT_CACHE_KEY);
    if (cached && typeof cached === "object" && (Date.now() - cached.ts) < 60000) return cached;
    const out = { id: "", secret: "", ts: Date.now() };
    if (findCol(CLIENT_COL)) {
        try {
            const rec = $app.findFirstRecordByFilter(CLIENT_COL, "client_id != ''");
            let res = null;
            try { res = apple().decrypt(rec.getString("secret")); } catch (e) { res = null; }
            if (res && res.text) {
                out.id = rec.getString("client_id");
                out.secret = res.text;
                if (!res.current) { try { rec.set("secret", apple().encrypt(res.text)); $app.save(rec); } catch (e) { /* später */ } }
            }
        } catch (e) { /* keiner hinterlegt */ }
    }
    storeSet(CLIENT_CACHE_KEY, out);
    return out;
}
function clientId() { return envClientSet() ? readEnv(CLIENT_ID_ENV) : storedClient().id; }
function clientSecret() { return envClientSet() ? readEnv(CLIENT_SECRET_ENV) : storedClient().secret; }
function isAvailable() { return !!(clientId() && clientSecret()); }
// "env" = aus der .env, "app" = in der App hinterlegt, "" = fehlt
function clientSource() {
    if (envClientSet()) return "env";
    const c = storedClient();
    return (c.id && c.secret) ? "app" : "";
}
function ensureClientCollection() {
    let col = findCol(CLIENT_COL);
    if (col) {
        let changed = false;
        CLOSED_RULES.forEach(k => { if (col[k] !== null && col[k] !== undefined) { col[k] = null; changed = true; } });
        if (changed) $app.save(col);
        return col;
    }
    $app.save(new Collection({
        type: "base",
        name: CLIENT_COL,
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: "client_id", type: "text", max: 300, hidden: true },
            { name: "secret", type: "text", max: 2000, hidden: true },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
    }));
    col = findCol(CLIENT_COL);
    if (!col) throw new Error("Sammlung \"" + CLIENT_COL + "\" wurde nicht gespeichert.");
    console.log("[Google-Zugang] Gesperrte Sammlung \"" + CLIENT_COL + "\" angelegt.");
    return col;
}
// OAuth-Client in der App hinterlegen (nur wenn er nicht in der .env steht)
function saveClient(idRaw, secretRaw) {
    if (envClientSet()) throw new Error("Der Google-Zugang steht bereits in der .env – er wird von dort verwendet.");
    const id = String(idRaw || "").replace(/\s+/g, "");
    const secret = String(secretRaw || "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(id) || id.length > 300) {
        throw new Error("Die Client-ID endet auf „.apps.googleusercontent.com“ – bitte vollständig aus der Google Cloud Console kopieren.");
    }
    if (secret.length < 10 || secret.length > 200) throw new Error("Bitte den Clientschlüssel (Client Secret) vollständig einfügen.");
    const col = ensureClientCollection();
    let rec = null;
    try { rec = $app.findFirstRecordByFilter(CLIENT_COL, "id != ''"); } catch (e) { rec = null; }
    if (!rec) rec = new Record(col);
    rec.set("client_id", id);
    rec.set("secret", apple().encrypt(secret));
    $app.save(rec);
    storeRemove(CLIENT_CACHE_KEY);
    console.log("[Google-Zugang] OAuth-Client in der App hinterlegt.");
}

function formBody(obj) {
    return Object.keys(obj).filter(k => obj[k] !== undefined && obj[k] !== null && obj[k] !== "")
        .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k]))).join("&");
}

function parseJson(res) {
    try { return JSON.parse(res.raw || ""); } catch (e) { /* weiter */ }
    try { if (res.json && typeof res.json === "object") return res.json; } catch (e) { /* egal */ }
    return {};
}

// Lesbare Fehlermeldung aus einer Google-Antwort (OAuth: {error, error_description},
// API: {error: {code, message, status}})
function errorText(obj, status) {
    if (!obj || typeof obj !== "object") return "Status " + status;
    if (typeof obj.error === "string") return obj.error + (obj.error_description ? " – " + obj.error_description : "");
    if (obj.error && typeof obj.error === "object") return String(obj.error.message || obj.error.status || ("Status " + status));
    return "Status " + status;
}

// Erkennt "Diese API ist im Cloud-Projekt nicht aktiviert" in einer Google-Antwort.
function isApiDisabled(text) {
    return /accessNotConfigured|SERVICE_DISABLED|has not been used in project|it is disabled/i.test(String(text || ""));
}

function isGoogleName(name) {
    const s = String(name || "");
    return s.length > NAME_SUFFIX.length && s.slice(-NAME_SUFFIX.length) === NAME_SUFFIX;
}

function storeGet(key) {
    try { return $app.store().get(key); } catch (e) { return null; }
}
function storeSet(key, value) {
    try { $app.store().set(key, value); } catch (e) { /* Speicher ist optional */ }
}
function storeRemove(key) {
    try { $app.store().remove(key); } catch (e) { /* egal */ }
}

function setError(familyId, message) { storeSet("pinnGoogleErr:" + familyId, String(message || "")); }
function clearError(familyId) { storeRemove("pinnGoogleErr:" + familyId); }
function clearCaches(familyId) {
    storeRemove("pinnGoogleTok:" + familyId);
    storeRemove("pinnGoogleCals:" + familyId);
    clearError(familyId);
}

// ---------------------------------------------------------------------------------------------
// Sammlung (gesperrt wie apple_zugaenge)
// ---------------------------------------------------------------------------------------------
function findCol(name) {
    try { return $app.findCollectionByNameOrId(name); } catch (e) { return null; }
}

function ensureCollection() {
    let col = findCol(GOOGLE);
    if (col) {
        let changed = false;
        CLOSED_RULES.forEach(k => {
            if (col[k] !== null && col[k] !== undefined) { col[k] = null; changed = true; }
        });
        if (changed) {
            $app.save(col);
            console.log("[Google-Zugang] Zugriffsregeln von \"" + GOOGLE + "\" wieder gesperrt.");
        }
        return col;
    }
    const fam = findCol("familien");
    if (!fam) throw new Error("Sammlung \"familien\" fehlt noch.");
    $app.save(new Collection({
        type: "base",
        name: GOOGLE,
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: "familie", type: "relation", collectionId: fam.id, cascadeDelete: true, maxSelect: 1, minSelect: 0, required: true },
            { name: "konto", type: "text", max: 200, hidden: true },
            { name: "token", type: "text", max: 4000, hidden: true },
            { name: "created", type: "autodate", onCreate: true, onUpdate: false },
            { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX `idx_pinn_google_familie` ON `" + GOOGLE + "` (`familie`)"],
    }));
    col = findCol(GOOGLE);
    if (!col) throw new Error("Sammlung \"" + GOOGLE + "\" wurde nicht gespeichert.");
    console.log("[Google-Zugang] Gesperrte Sammlung \"" + GOOGLE + "\" angelegt.");
    return col;
}

function findRecord(familyId) {
    if (!validFamilyId(familyId)) return null;
    try { return $app.findFirstRecordByFilter(GOOGLE, "familie = {:f}", { f: familyId }); } catch (e) { return null; }
}

function apple() { return require(`${__hooks}/pinn-apple.js`); }

// ---------------------------------------------------------------------------------------------
// Zugangsdaten
// ---------------------------------------------------------------------------------------------
function hasCredentials(familyId) {
    const rec = findRecord(familyId);
    return !!(rec && rec.getString("token"));
}

function familiesWithCredentials() {
    try {
        return $app.findRecordsByFilter(GOOGLE, "token != ''", "", 0, 0).map(r => r.getString("familie")).filter(validFamilyId);
    } catch (e) { return []; }
}

function saveCredentials(familyId, account, refreshToken) {
    if (!validFamilyId(familyId)) throw new Error("Ungültige Familie.");
    const col = ensureCollection();
    let rec = findRecord(familyId);
    if (!rec) {
        rec = new Record(col);
        rec.set("familie", familyId);
    }
    rec.set("konto", String(account || "").slice(0, 200));
    rec.set("token", apple().encrypt(refreshToken));
    $app.save(rec);
    clearCaches(familyId);
}

// Liefert den gespeicherten Refresh-Token (entschlüsselt) oder "".
function refreshTokenOf(rec) {
    if (!rec) return "";
    let res = null;
    try { res = apple().decrypt(rec.getString("token")); } catch (e) { res = null; }
    if (!res) return "";
    if (!res.current) {
        // Mit dem alten Schlüssel verschlüsselt -> auf den aktuellen umstellen
        try {
            rec.set("token", apple().encrypt(res.text));
            $app.save(rec);
            console.log("[Google-Zugang] Zugang einer Familie mit dem neuen Schlüssel neu verschlüsselt.");
        } catch (e) { /* beim nächsten Mal erneut */ }
    }
    return res.text;
}

// Verbindung trennen: bei Google widerrufen (best effort) und den Datensatz löschen.
function deleteCredentials(familyId) {
    const rec = findRecord(familyId);
    if (rec) {
        const token = refreshTokenOf(rec);
        if (token) {
            try {
                $http.send({
                    url: REVOKE_URL, method: "POST", timeout: 15,
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: formBody({ token: token }),
                });
            } catch (e) { /* Widerruf ist optional */ }
        }
        $app.delete(rec);
    }
    clearCaches(familyId);
}

// ---------------------------------------------------------------------------------------------
// Zugriffsschlüssel (1 Stunde gültig, im gemeinsamen Server-Speicher gemerkt)
// ---------------------------------------------------------------------------------------------
function accessToken(familyId, forceNew) {
    const key = "pinnGoogleTok:" + familyId;
    if (!forceNew) {
        const cached = storeGet(key);
        if (cached && cached.token && cached.exp - 60000 > Date.now()) return String(cached.token);
    }
    const rec = findRecord(familyId);
    if (!rec || !rec.getString("token")) throw new Error(MISSING_MESSAGE);
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    const refresh = refreshTokenOf(rec);
    if (!refresh) {
        const msg = "Der gespeicherte Google-Zugang kann nicht entschlüsselt werden (Schlüssel geändert?). Bitte neu mit Google verbinden.";
        setError(familyId, msg);
        throw new Error(msg);
    }
    const res = $http.send({
        url: TOKEN_URL, method: "POST", timeout: 30,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ client_id: clientId(), client_secret: clientSecret(), refresh_token: refresh, grant_type: "refresh_token" }),
    });
    const body = parseJson(res);
    if (res.statusCode !== 200 || !body.access_token) {
        if (body.error === "invalid_grant") {
            setError(familyId, REVOKED_MESSAGE);
            throw new Error(REVOKED_MESSAGE);
        }
        const msg = "Anmeldung bei Google fehlgeschlagen: " + errorText(body, res.statusCode);
        setError(familyId, msg);
        throw new Error(msg);
    }
    const ttl = Math.max(300, parseInt(body.expires_in, 10) || 3600) * 1000;
    storeSet(key, { token: String(body.access_token), exp: Date.now() + ttl });
    clearError(familyId);
    return String(body.access_token);
}

// Zugriffsschlüssel aus einem beliebigen Refresh-Token holen (persönliche Konten, pinn-kalender-konten.js).
// Rückgabe { token, ttlMs }; Fehler tragen err.code (z. B. "invalid_grant" = widerrufen/abgelaufen).
function refreshAccessToken(refresh) {
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    const res = $http.send({
        url: TOKEN_URL, method: "POST", timeout: 30,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ client_id: clientId(), client_secret: clientSecret(), refresh_token: String(refresh || ""), grant_type: "refresh_token" }),
    });
    const body = parseJson(res);
    if (res.statusCode !== 200 || !body.access_token) {
        const err = new Error("Anmeldung bei Google fehlgeschlagen: " + errorText(body, res.statusCode));
        err.code = typeof body.error === "string" ? body.error : "";
        throw err;
    }
    return { token: String(body.access_token), ttlMs: Math.max(300, parseInt(body.expires_in, 10) || 3600) * 1000 };
}

// Zugang bei Google widerrufen (best effort)
function revokeToken(token) {
    if (!token) return;
    try {
        $http.send({
            url: REVOKE_URL, method: "POST", timeout: 15,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({ token: String(token) }),
        });
    } catch (e) { /* Widerruf ist optional */ }
}

// ---------------------------------------------------------------------------------------------
// Kalenderliste (Google Calendar API)
// ---------------------------------------------------------------------------------------------
function fetchCalendarItems(token) {
    const items = [];
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
        const url = CALENDAR_LIST_URL + "?maxResults=250" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
        const res = $http.send({ url: url, method: "GET", timeout: 30, headers: { "Authorization": "Bearer " + token } });
        const body = parseJson(res);
        if (res.statusCode === 401) {
            const err = new Error("Google hat den Zugriff abgelehnt (401).");
            err.status = 401;
            throw err;
        }
        if (res.statusCode !== 200) {
            if (isApiDisabled(res.raw)) throw new Error(CALENDAR_API_DISABLED_MESSAGE);
            throw new Error("Google-Kalenderliste konnte nicht geladen werden: " + errorText(body, res.statusCode));
        }
        (body.items || []).forEach(it => items.push(it));
        pageToken = body.nextPageToken || "";
        if (!pageToken) break;
    }
    return items;
}

// Google-Einträge -> [{name, href, timeZone, id, primary, writable}]
function calendarsFromItems(items) {
    const list = [];
    const used = {};
    (items || []).forEach(it => {
        if (!it || !it.id || it.deleted) return;
        if (it.accessRole === "freeBusyReader") return; // nur frei/belegt - keine Termine lesbar
        const base = String(it.summaryOverride || it.summary || it.id).trim() || String(it.id);
        let name = base + NAME_SUFFIX;
        if (used[name]) name = base + " · " + String(it.id).slice(0, 8) + NAME_SUFFIX;
        used[name] = true;
        list.push({
            name: name,
            href: "/caldav/v2/" + encodeURIComponent(String(it.id)) + "/events/",
            timeZone: String(it.timeZone || ""),
            id: String(it.id),
            primary: !!it.primary,
            writable: it.accessRole === "owner" || it.accessRole === "writer",
        });
    });
    // Hauptkalender zuerst, dann alphabetisch
    list.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.name.localeCompare(b.name));
    return list;
}

// Konto-Objekt für calendar-sync.js: { kind, host, xmlHeaders, calendars }
function account(familyId, forceFresh) {
    let token = accessToken(familyId);
    const cacheKey = "pinnGoogleCals:" + familyId;
    let calendars = null;
    if (!forceFresh) {
        const cached = storeGet(cacheKey);
        if (cached && cached.calendars && (Date.now() - cached.ts) < LIST_CACHE_MS) calendars = cached.calendars;
    }
    if (!calendars) {
        let items;
        try {
            items = fetchCalendarItems(token);
        } catch (e) {
            if (e.status !== 401) throw e;
            token = accessToken(familyId, true); // Zugriffsschlüssel abgelaufen -> einmal neu holen
            items = fetchCalendarItems(token);
        }
        calendars = calendarsFromItems(items);
        storeSet(cacheKey, { ts: Date.now(), calendars: calendars });
    }
    return {
        kind: "google",
        host: CALDAV_HOST,
        xmlHeaders: { "Content-Type": "text/xml; charset=utf-8", "Authorization": "Bearer " + token },
        calendars: calendars,
    };
}

// Für die Einstellungen: nur die Namen (immer frisch)
function discoverCalendarNames(familyId) {
    return account(familyId, true).calendars.map(c => c.name);
}

// ---------------------------------------------------------------------------------------------
// Geburtstage aus den Google-Kontakten (People API, nur lesen)
// ---------------------------------------------------------------------------------------------
function isScopeMissing(text) {
    return /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(String(text || ""));
}

function pickPrimary(arr, ok) {
    const list = (arr || []).filter(x => x && ok(x));
    return list.find(x => x.metadata && x.metadata.primary) || list[0] || null;
}

// Person der People API -> { n, m, d, y } oder null
function birthdayFromPerson(p) {
    if (!p) return null;
    const b = pickPrimary(p.birthdays, x => x.date && x.date.month >= 1 && x.date.month <= 12 && x.date.day >= 1 && x.date.day <= 31);
    if (!b) return null;
    const nm = pickPrimary(p.names, x => x.displayName || x.givenName || x.familyName);
    let name = nm ? String(nm.displayName || [nm.givenName, nm.familyName].filter(Boolean).join(" ")) : "";
    name = name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) return null;
    let y = parseInt(b.date.year, 10) || null;
    if (y !== null && (y < 1800 || y > new Date().getFullYear())) y = null;
    return { n: name, m: parseInt(b.date.month, 10), d: parseInt(b.date.day, 10), y: y };
}

function fetchPeoplePage(token, pageToken) {
    const url = PEOPLE_URL + "?personFields=names,birthdays&pageSize=1000&sortOrder=FIRST_NAME_ASCENDING"
        + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    return $http.send({ url: url, method: "GET", timeout: 60, headers: { "Authorization": "Bearer " + token } });
}

// Alle Google-Kontakte der Familie mit Geburtstag: [{ n, m, d, y }]. Wirft mit lesbarer Meldung.
function fetchBirthdays(familyId) {
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    let token = accessToken(familyId);
    const out = [];
    let pageToken = "";
    for (let page = 0; page < PEOPLE_MAX_PAGES; page++) {
        let res = fetchPeoplePage(token, pageToken);
        if (res.statusCode === 401) {
            token = accessToken(familyId, true); // Zugriffsschlüssel abgelaufen -> einmal neu holen
            res = fetchPeoplePage(token, pageToken);
        }
        const body = parseJson(res);
        if (res.statusCode !== 200) {
            if (isScopeMissing(res.raw)) throw new Error(CONTACTS_SCOPE_MESSAGE);
            if (isApiDisabled(res.raw)) throw new Error(PEOPLE_API_DISABLED_MESSAGE);
            if (res.statusCode === 401) throw new Error(REVOKED_MESSAGE);
            throw new Error("Google-Kontakte konnten nicht geladen werden: " + errorText(body, res.statusCode));
        }
        (body.connections || []).forEach(p => {
            const b = birthdayFromPerson(p);
            if (b) out.push(b);
        });
        pageToken = body.nextPageToken || "";
        if (!pageToken) break;
    }
    return out;
}

// Konto-Name für Log-Ausgaben
function connectedAccount(familyId) {
    const rec = findRecord(familyId);
    return rec ? rec.getString("konto") : "";
}

// ---------------------------------------------------------------------------------------------
// Anmeldung über Google (OAuth)
// ---------------------------------------------------------------------------------------------
function configuredAddress() {
    return readEnv(ADDRESS_ENV).replace(/\/+$/, "");
}

function redirectUriFor(origin) {
    const base = configuredAddress() || String(origin || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s\/?#]+$/i.test(base)) throw new Error("Die Adresse von pinn. konnte nicht ermittelt werden.");
    if (/^http:\/\//i.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
        throw new Error("Google erlaubt die Anmeldung nur über eine https-Adresse. Bitte pinn. über https://… öffnen (z. B. https://deine-subdomain.duckdns.org:8443) oder PINN_ADRESSE in der .env eintragen.");
    }
    return base + CALLBACK_PATH;
}

// Gibt die Google-Anmeldeadresse zurück, zu der die App weiterleitet.
function startAuth(familyId, userId, origin) {
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    if (!validFamilyId(familyId)) throw new Error("Ungültige Familie.");
    const redirectUri = redirectUriFor(origin);
    const state = $security.randomString(40);
    storeSet("pinnGoogleState:" + state, { familyId: familyId, userId: String(userId || ""), redirectUri: redirectUri, ts: Date.now() });
    return AUTH_URL + "?" + formBody({
        client_id: clientId(),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPE + " " + CONTACTS_SCOPE,
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state: state,
    });
}

// Anmeldung für das PERSÖNLICHE Google-Konto eines Profils (eigene Kalender „Nur für mich“).
// Nur Kalender-Freigabe, keine Kontakte.
function startPersonalAuth(familyId, userId, origin) {
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    if (!validFamilyId(familyId) || !validFamilyId(userId)) throw new Error("Ungültiges Profil.");
    const redirectUri = redirectUriFor(origin);
    const state = $security.randomString(40);
    storeSet("pinnGoogleState:" + state, { personal: true, familyId: familyId, userId: String(userId), redirectUri: redirectUri, ts: Date.now() });
    return AUTH_URL + "?" + formBody({
        client_id: clientId(),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent select_account",
        state: state,
    });
}

// Gehört dieser (noch nicht eingelöste) state zu einer persönlichen Anmeldung? Für die Rückkehr-Seite,
// damit sie auch bei Fehlern an die richtige Stelle in der App zurückführt.
function isPersonalState(state) {
    if (!state) return false;
    const st = storeGet("pinnGoogleState:" + String(state));
    return !!(st && st.personal);
}

// Code bei Google gegen Zugang tauschen (Familie und persönlich gleich)
function exchangeCode(code, redirectUri) {
    const res = $http.send({
        url: TOKEN_URL, method: "POST", timeout: 30,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
            code: String(code), client_id: clientId(), client_secret: clientSecret(),
            redirect_uri: String(redirectUri), grant_type: "authorization_code",
        }),
    });
    const body = parseJson(res);
    if (res.statusCode !== 200 || !body.access_token) {
        throw new Error("Google-Anmeldung fehlgeschlagen: " + errorText(body, res.statusCode));
    }
    if (!body.refresh_token) {
        throw new Error("Google hat keinen dauerhaften Zugang erteilt. Bitte unter myaccount.google.com → Sicherheit → Drittanbieter-Apps den Zugriff von pinn. entfernen und erneut verbinden.");
    }
    const granted = String(body.scope || SCOPE).split(/\s+/);
    if (granted.indexOf(SCOPE) === -1) {
        throw new Error("Bitte bei der Google-Anmeldung den Zugriff auf den Kalender erlauben (Haken setzen) und erneut verbinden.");
    }
    return body;
}

// Kurzer Test, ob die CalDAV-Schnittstelle freigeschaltet ist (sonst klappen Termine nicht)
function caldavWarning(token, primary) {
    if (!primary) return "";
    try {
        const t = $http.send({
            url: CALDAV_HOST + "/caldav/v2/" + encodeURIComponent(String(primary.id)) + "/events/",
            method: "PROPFIND", timeout: 20,
            headers: { "Depth": "0", "Content-Type": "text/xml; charset=utf-8", "Authorization": "Bearer " + token },
            body: '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
        });
        if (t.statusCode === 403 && isApiDisabled(t.raw)) return CALDAV_DISABLED_MESSAGE;
        if (t.statusCode !== 207 && t.statusCode !== 200) console.log("[Google-Zugang] CalDAV-Test: Status " + t.statusCode);
    } catch (e) { /* Test ist optional */ }
    return "";
}

// Rückkehr einer persönlichen Anmeldung: Zugang beim Profil speichern (pinn-kalender-konten.js)
function finishPersonalAuth(st, code) {
    const familyId = String(st.familyId), userId = String(st.userId);
    let u = null;
    try { u = $app.findRecordById("benutzer", userId); } catch (e) { u = null; }
    if (!u || u.getString("familie") !== familyId || u.getString("rolle") === "gast") {
        throw new Error("Dieses Profil kann kein eigenes Google-Konto verbinden.");
    }
    if (!code) throw new Error("Google hat keine Freigabe geschickt.");
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    const body = exchangeCode(code, st.redirectUri);
    const token = String(body.access_token);
    const items = fetchCalendarItems(token);
    const primary = items.find(it => it && it.primary);
    const accountName = primary ? String(primary.id) : "Google-Konto";
    const ttlMs = Math.max(300, parseInt(body.expires_in, 10) || 3600) * 1000;
    require(`${__hooks}/pinn-kalender-konten.js`).saveGoogle(userId, accountName, String(body.refresh_token), token, ttlMs, calendarsFromItems(items));
    const warning = caldavWarning(token, primary);
    console.log("[Google-Zugang] Persönliches Google-Konto für Profil " + userId + " verbunden.");
    return { personal: true, familyId: familyId, userId: userId, account: accountName, warning: warning };
}

// Prüft, ob das Profil, das die Anmeldung gestartet hat, noch Admin dieser Familie ist.
function stillAdmin(userId, familyId) {
    try {
        const u = $app.findRecordById("benutzer", userId);
        const rolle = u.getString("rolle");
        return u.getString("familie") === familyId && (rolle === "admin" || rolle === "hauptadmin");
    } catch (e) { return false; }
}

// Rückkehr von Google: Code gegen Zugang tauschen, Konto ermitteln, speichern.
// Gibt { familyId, account, warning } zurück oder wirft einen Fehler mit lesbarer Meldung.
function finishAuth(state, code) {
    const key = "pinnGoogleState:" + String(state || "");
    const st = state ? storeGet(key) : null;
    storeRemove(key);
    if (!st || !st.familyId || (Date.now() - st.ts) > STATE_TTL_MS) {
        throw new Error("Die Anmeldung ist abgelaufen oder ungültig. Bitte in pinn. erneut auf „Mit Google verbinden“ tippen.");
    }
    if (st.personal) return finishPersonalAuth(st, code);
    const familyId = String(st.familyId);
    if (!stillAdmin(String(st.userId), familyId)) throw new Error("Nur Admins deiner Familie können ein Google-Konto verbinden.");
    if (!code) throw new Error("Google hat keine Freigabe geschickt.");
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);

    const res = $http.send({
        url: TOKEN_URL, method: "POST", timeout: 30,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({
            code: String(code), client_id: clientId(), client_secret: clientSecret(),
            redirect_uri: String(st.redirectUri), grant_type: "authorization_code",
        }),
    });
    const body = parseJson(res);
    if (res.statusCode !== 200 || !body.access_token) {
        throw new Error("Google-Anmeldung fehlgeschlagen: " + errorText(body, res.statusCode));
    }
    if (!body.refresh_token) {
        throw new Error("Google hat keinen dauerhaften Zugang erteilt. Bitte unter myaccount.google.com → Sicherheit → Drittanbieter-Apps den Zugriff von pinn. entfernen und erneut verbinden.");
    }
    const granted = String(body.scope || SCOPE).split(/\s+/);
    if (granted.indexOf(SCOPE) === -1) {
        throw new Error("Bitte bei der Google-Anmeldung den Zugriff auf den Kalender erlauben (Haken setzen) und erneut verbinden.");
    }

    // Konto (E-Mail) = ID des Hauptkalenders
    const token = String(body.access_token);
    const items = fetchCalendarItems(token);
    const primary = items.find(it => it && it.primary);
    const accountName = primary ? String(primary.id) : "Google-Konto";

    saveCredentials(familyId, accountName, String(body.refresh_token));
    storeSet("pinnGoogleTok:" + familyId, { token: token, exp: Date.now() + Math.max(300, parseInt(body.expires_in, 10) || 3600) * 1000 });
    storeSet("pinnGoogleCals:" + familyId, { ts: Date.now(), calendars: calendarsFromItems(items) });

    // Kurzer Test, ob die CalDAV-Schnittstelle freigeschaltet ist (sonst klappen Termine nicht)
    let warning = "";
    if (primary) {
        try {
            const t = $http.send({
                url: CALDAV_HOST + "/caldav/v2/" + encodeURIComponent(String(primary.id)) + "/events/",
                method: "PROPFIND", timeout: 20,
                headers: { "Depth": "0", "Content-Type": "text/xml; charset=utf-8", "Authorization": "Bearer " + token },
                body: '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
            });
            if (t.statusCode === 403 && isApiDisabled(t.raw)) warning = CALDAV_DISABLED_MESSAGE;
            else if (t.statusCode !== 207 && t.statusCode !== 200) console.log("[Google-Zugang] CalDAV-Test: Status " + t.statusCode);
        } catch (e) { /* Test ist optional */ }
    }
    if (warning) setError(familyId, warning);
    // Kontakte (Geburtstage) sind freiwillig - fehlt die Freigabe, läuft der Kalender trotzdem
    const contacts = !body.scope || granted.indexOf(CONTACTS_SCOPE) !== -1;
    let hint = warning;
    if (!contacts) hint = (hint ? hint + " " : "") + "Die Kontakte wurden nicht freigegeben – Geburtstage aus Google fehlen deshalb. Zum Nachholen „Neu verbinden“ und den Haken für die Kontakte setzen.";
    console.log("[Google-Zugang] Google-Konto für Familie " + familyId + " verbunden" + (contacts ? " (mit Kontakten)." : " (ohne Kontakte)."));
    return { familyId: familyId, account: accountName, warning: hint, contacts: contacts };
}

// ---------------------------------------------------------------------------------------------
// Status für die Einstellungen (nie den Token!)
// ---------------------------------------------------------------------------------------------
function getStatus(familyId) {
    const rec = findRecord(familyId);
    const err = storeGet("pinnGoogleErr:" + familyId);
    const address = configuredAddress();
    return {
        available: isAvailable(),
        configured: !!(rec && rec.getString("token")),
        account: rec ? rec.getString("konto") : "",
        error: err ? String(err) : "",
        redirectUri: address ? address + CALLBACK_PATH : "",
    };
}

function setup() {
    ensureCollection();
}

// Weiterleitungs-URI für die Google Cloud Console (feste Adresse oder die übergebene)
function redirectUriInfo(origin) {
    try { return redirectUriFor(origin); } catch (e) { return ""; }
}

module.exports = {
    GOOGLE, NAME_SUFFIX, CALDAV_HOST, CALLBACK_PATH,
    MISSING_MESSAGE, NOT_AVAILABLE_MESSAGE, CALDAV_DISABLED_MESSAGE,
    setup, ensureCollection, isAvailable, isGoogleName, isApiDisabled,
    hasCredentials, familiesWithCredentials, saveCredentials, deleteCredentials,
    accessToken, account, discoverCalendarNames, fetchBirthdays, connectedAccount,
    startAuth, finishAuth, getStatus, setError, clearError,
    // persönliche Konten (pinn-kalender-konten.js)
    refreshAccessToken, revokeToken, fetchCalendarItems, calendarsFromItems, startPersonalAuth, isPersonalState,
    // OAuth-Client aus der App (falls nicht in der .env)
    clientSource, saveClient, redirectUriInfo,
};
