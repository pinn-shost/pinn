// pb_hooks/pinn-google.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
//
// Google calendar (Android) PER FAMILY - the counterpart to pinn-apple.js.
//
// Android phones store their calendars in the Google account. pinn. accesses it the same way as
// iCloud: via CalDAV (read, create, change, delete events, raw text for "Edit"). Only the
// sign-in is different: Google does not allow app passwords for calendars, only signing in
// via Google itself (OAuth). Flow:
//  1. An admin of the family taps "Connect with Google" in the settings (startAuth).
//  2. Google asks for the account and permission and sends the browser back to
//     /api/pinn/google/callback (finishAuth).
//  3. pinn. receives a permanent access key (refresh token) for it. Only this is
//     stored - encrypted (same key as with Apple, see pinn-apple.js) in the
//     locked collection "google_zugaenge". pinn. never sees the Google password.
//  4. For every access, the server uses it to fetch a short-lived access key (valid for 1 hour,
//     remembered in the server memory).
//
// Birthdays: from the Google contacts via the People API (read only, only name + date of birth,
// see fetchBirthdays - used by pinn-geburtstage.js). For this, the Google sign-in additionally asks
// for read permission for contacts. Older connections (calendar only) have to be
// "reconnected" once for this; the calendar keeps working even without the contacts permission.
//
// Personal Google accounts: in addition, every profile can connect its OWN Google account in order to link
// own "only for me" calendars with Google calendars (pinn-kalender-konten.js). The
// sign-in runs via the same return address (CALLBACK_PATH); the one-time "state" remembers whether
// it is about the family or a single profile (startPersonalAuth / finishAuth). Only the
// calendar is released for this, not the contacts.
//
// Calendar list: via the Google Calendar API. Events: via the Google CalDAV interface
// (https://apidata.googleusercontent.com/caldav/v2/<calendar ID>/events/). Google calendars are called
// "<name> (Google)" in pinn. - this is how calendar-sync.js recognises which account is responsible.
//
// One-time set-up on the server (.env next to docker-compose.yaml):
//   PINN_GOOGLE_CLIENT_ID     = OAuth client ID from the Google Cloud Console
//   PINN_GOOGLE_CLIENT_SECRET = the matching client secret
//   PINN_ADRESSE              = optional, fixed address of pinn. (e.g. https://deine-subdomain.duckdns.org:8443).
//                               Empty = the address through which the app is currently opened.
// Enabled in the Google Cloud project: Google Calendar API, CalDAV API and (for birthdays) People API.

const GOOGLE = "google_zugaenge";
const CLIENT_ID_ENV = "PINN_GOOGLE_CLIENT_ID";
const CLIENT_SECRET_ENV = "PINN_GOOGLE_CLIENT_SECRET";
const ADDRESS_ENV = "PINN_ADRESSE";
const CALLBACK_PATH = "/api/pinn/google/callback";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
// Checks whether a scope appears exactly like this in the list delivered by Google (separated by spaces).
function scopeGranted(scopeText, wanted) {
    const list = String(scopeText || wanted).split(/\s+/);
    for (let i = 0; i < list.length; i++) {
        if (list[i] === wanted) return true;
    }
    return false;
}
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
// OAuth client: preferably from the .env. If it is missing there (e.g. because the container was not
// recreated after entering it - a simple restart does not re-read the .env), an admin can store it
// in the app (Settings → Calendar → Add calendar → Google). It is then stored
// encrypted in the locked collection "google_client".
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
                if (!res.current) { try { rec.set("secret", apple().encrypt(res.text)); $app.save(rec); } catch (e) { /* later */ } }
            }
        } catch (e) { /* none stored */ }
    }
    storeSet(CLIENT_CACHE_KEY, out);
    return out;
}
function clientId() { return envClientSet() ? readEnv(CLIENT_ID_ENV) : storedClient().id; }
function clientSecret() { return envClientSet() ? readEnv(CLIENT_SECRET_ENV) : storedClient().secret; }
function isAvailable() { return !!(clientId() && clientSecret()); }
// "env" = from the .env, "app" = stored in the app, "" = missing
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
// Store the OAuth client in the app (only if it is not in the .env)
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
    try { return JSON.parse(res.raw || ""); } catch (e) { /* continue */ }
    try { if (res.json && typeof res.json === "object") return res.json; } catch (e) { /* ignore */ }
    return {};
}

// Readable error message from a Google response (OAuth: {error, error_description},
// API: {error: {code, message, status}})
function errorText(obj, status) {
    if (!obj || typeof obj !== "object") return "Status " + status;
    if (typeof obj.error === "string") return obj.error + (obj.error_description ? " – " + obj.error_description : "");
    if (obj.error && typeof obj.error === "object") return String(obj.error.message || obj.error.status || ("Status " + status));
    return "Status " + status;
}

// Recognises "This API is not enabled in the cloud project" in a Google response.
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
    try { $app.store().set(key, value); } catch (e) { /* the store is optional */ }
}
function storeRemove(key) {
    try { $app.store().remove(key); } catch (e) { /* ignore */ }
}

function setError(familyId, message) { storeSet("pinnGoogleErr:" + familyId, String(message || "")); }
function clearError(familyId) { storeRemove("pinnGoogleErr:" + familyId); }
function clearCaches(familyId) {
    storeRemove("pinnGoogleTok:" + familyId);
    storeRemove("pinnGoogleCals:" + familyId);
    clearError(familyId);
}

// ---------------------------------------------------------------------------------------------
// Collection (locked like apple_zugaenge)
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
// Credentials
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

// Returns the stored refresh token (decrypted) or "".
function refreshTokenOf(rec) {
    if (!rec) return "";
    let res = null;
    try { res = apple().decrypt(rec.getString("token")); } catch (e) { res = null; }
    if (!res) return "";
    if (!res.current) {
        // Encrypted with the old key -> switch to the current one
        try {
            rec.set("token", apple().encrypt(res.text));
            $app.save(rec);
            console.log("[Google-Zugang] Zugang einer Familie mit dem neuen Schlüssel neu verschlüsselt.");
        } catch (e) { /* again next time */ }
    }
    return res.text;
}

// Disconnect: revoke at Google (best effort) and delete the record.
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
            } catch (e) { /* revoking is optional */ }
        }
        $app.delete(rec);
    }
    clearCaches(familyId);
}

// ---------------------------------------------------------------------------------------------
// Access key (valid for 1 hour, remembered in the shared server memory)
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

// Fetch an access key from any refresh token (personal accounts, pinn-kalender-konten.js).
// Returns { token, ttlMs }; errors carry err.code (e.g. "invalid_grant" = revoked/expired).
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

// Revoke access at Google (best effort)
function revokeToken(token) {
    if (!token) return;
    try {
        $http.send({
            url: REVOKE_URL, method: "POST", timeout: 15,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formBody({ token: String(token) }),
        });
    } catch (e) { /* revoking is optional */ }
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

// Google entries -> [{name, href, timeZone, id, primary, writable}]
function calendarsFromItems(items) {
    const list = [];
    const used = {};
    (items || []).forEach(it => {
        if (!it || !it.id || it.deleted) return;
        if (it.accessRole === "freeBusyReader") return; // free/busy only - no events readable
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
    // main calendar first, then alphabetical
    list.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.name.localeCompare(b.name));
    return list;
}

// Account object for calendar-sync.js: { kind, host, xmlHeaders, calendars }
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
            token = accessToken(familyId, true); // Access key expired -> fetch once anew
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

// For the settings: only the names (always fresh)
function discoverCalendarNames(familyId) {
    return account(familyId, true).calendars.map(c => c.name);
}

// ---------------------------------------------------------------------------------------------
// Birthdays from the Google contacts (People API, read only)
// ---------------------------------------------------------------------------------------------
function isScopeMissing(text) {
    return /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficientPermissions/i.test(String(text || ""));
}

function pickPrimary(arr, ok) {
    const list = (arr || []).filter(x => x && ok(x));
    return list.find(x => x.metadata && x.metadata.primary) || list[0] || null;
}

// Person of the People API -> { n, m, d, y } or null
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

// All Google contacts of the family with a birthday: [{ n, m, d, y }]. Throws with a readable message.
function fetchBirthdays(familyId) {
    if (!isAvailable()) throw new Error(NOT_AVAILABLE_MESSAGE);
    let token = accessToken(familyId);
    const out = [];
    let pageToken = "";
    for (let page = 0; page < PEOPLE_MAX_PAGES; page++) {
        let res = fetchPeoplePage(token, pageToken);
        if (res.statusCode === 401) {
            token = accessToken(familyId, true); // Access key expired -> fetch once anew
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

// Account name for log output
function connectedAccount(familyId) {
    const rec = findRecord(familyId);
    return rec ? rec.getString("konto") : "";
}

// ---------------------------------------------------------------------------------------------
// Sign-in via Google (OAuth)
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

// Returns the Google sign-in address to which the app redirects.
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

// Sign-in for a profile's PERSONAL Google account (own "only for me" calendars).
// Calendar permission only, no contacts.
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

// Does this (not yet redeemed) state belong to a personal sign-in? For the return page,
// so that it leads back to the right place in the app even on errors.
function isPersonalState(state) {
    if (!state) return false;
    const st = storeGet("pinnGoogleState:" + String(state));
    return !!(st && st.personal);
}

// Exchange the code at Google for access (same for family and personal)
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
    if (!scopeGranted(body.scope, SCOPE)) {
        throw new Error("Bitte bei der Google-Anmeldung den Zugriff auf den Kalender erlauben (Haken setzen) und erneut verbinden.");
    }
    return body;
}

// Short test whether the CalDAV interface is enabled (otherwise events do not work)
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
    } catch (e) { /* the test is optional */ }
    return "";
}

// Return of a personal sign-in: store the access on the profile (pinn-kalender-konten.js)
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

// Checks whether the profile that started the sign-in is still an admin of this family.
function stillAdmin(userId, familyId) {
    try {
        const u = $app.findRecordById("benutzer", userId);
        const rolle = u.getString("rolle");
        return u.getString("familie") === familyId && (rolle === "admin" || rolle === "hauptadmin");
    } catch (e) { return false; }
}

// Return from Google: exchange the code for access, determine the account, store it.
// Returns { familyId, account, warning } or throws an error with a readable message.
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
    if (!scopeGranted(body.scope, SCOPE)) {
        throw new Error("Bitte bei der Google-Anmeldung den Zugriff auf den Kalender erlauben (Haken setzen) und erneut verbinden.");
    }

    // account (e-mail) = ID of the main calendar
    const token = String(body.access_token);
    const items = fetchCalendarItems(token);
    const primary = items.find(it => it && it.primary);
    const accountName = primary ? String(primary.id) : "Google-Konto";

    saveCredentials(familyId, accountName, String(body.refresh_token));
    storeSet("pinnGoogleTok:" + familyId, { token: token, exp: Date.now() + Math.max(300, parseInt(body.expires_in, 10) || 3600) * 1000 });
    storeSet("pinnGoogleCals:" + familyId, { ts: Date.now(), calendars: calendarsFromItems(items) });

    // Short test whether the CalDAV interface is enabled (otherwise events do not work)
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
        } catch (e) { /* the test is optional */ }
    }
    if (warning) setError(familyId, warning);
    // Contacts (birthdays) are optional - if the permission is missing, the calendar still works
    const contacts = !body.scope || granted.indexOf(CONTACTS_SCOPE) !== -1;
    let hint = warning;
    if (!contacts) hint = (hint ? hint + " " : "") + "Die Kontakte wurden nicht freigegeben – Geburtstage aus Google fehlen deshalb. Zum Nachholen „Neu verbinden“ und den Haken für die Kontakte setzen.";
    console.log("[Google-Zugang] Google-Konto für Familie " + familyId + " verbunden" + (contacts ? " (mit Kontakten)." : " (ohne Kontakte)."));
    return { familyId: familyId, account: accountName, warning: hint, contacts: contacts };
}

// ---------------------------------------------------------------------------------------------
// Status for the settings (never the token!)
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

// Redirect URI for the Google Cloud Console (fixed address or the one passed in)
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
    // personal accounts (pinn-kalender-konten.js)
    refreshAccessToken, revokeToken, fetchCalendarItems, calendarsFromItems, startPersonalAuth, isPersonalState,
    // OAuth client from the app (if not in the .env)
    clientSource, saveClient, redirectUriInfo,
};
