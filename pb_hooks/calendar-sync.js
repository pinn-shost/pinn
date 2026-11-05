// pb_hooks/calendar-sync.js
// Not a *.pb.js file -> it is NOT loaded automatically as a hook, only pulled in via require().
// Contains the complete CalDAV logic as reusable functions - used both by the
// calendar list endpoint (discover_calendars.pb.js) and by the cron sync (cron_calendar.pb.js).
// The Apple credentials are stored PER FAMILY, encrypted, in the locked collection "apple_zugaenge"
// (pinn-apple.js), see getAppleCredentials() further below.
// In addition, each family can connect a Google account (Android calendar) (pinn-google.js, collection
// "google_zugaenge"). The account functions (appleAccount, createEventInAccount ...) are also used by
// pinn-kalender.js for private "only for me" calendars that are linked to the personal iCloud/Google
// account of a profile (pinn-kalender-konten.js).
// Google speaks CalDAV as well - so all event functions work with
// an "account" object (see the section "Accounts" further below), whether iCloud or Google.

function base64Encode(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let str = String(input);
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
         str.charAt(i | 0) || (map = '=', i % 1);
         output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))) {
        charCode = str.charCodeAt(i += 3 / 4);
        if (charCode > 0xFF) throw new Error("base64Encode: nur ASCII-Zeichen unterstützt");
        block = (block << 8) | charCode;
    }
    return output;
}

function authHeaderFor(email, password) {
    return "Basic " + base64Encode(email + ":" + password);
}

function resolveHref(host, href) {
    if (/^https?:\/\//i.test(href)) return href;
    return host + href;
}

// Steps 1+2+3: principal -> calendar-home-set -> calendar list.
// Returns { host, xmlHeaders, calendars: [{name, href}] } or throws an Error with
// a message that end users can understand.
// Queries ALL collections in the account (calendars AND reminder lists technically use
// the same CalDAV protocol) and additionally reads whether a collection contains events (VEVENT) or
// reminders (VTODO) - so that we can keep the two apart cleanly instead of mixing them in
// one list.
// The calendar discovery (3 requests to iCloud) practically never changes, but ran several times on EVERY
// operation (ticking off, editing, creating, sync). The result is therefore kept for 10 minutes in the shared
// PocketBase app store. The settings page ("Load calendars") always asks afresh.
// The generated calendar files (one per family, see kalenderPfad()) live in pb_data (not
// public) and are only delivered to the family itself through the signed-in route /api/pinn/kalender
// (benutzer.pb.js).

// Convert a byte array (e.g. from $os.readFile) into text: natively if possible, otherwise via JavaScript.
function bytesToText(raw) {
    try {
        if (typeof toString === "function") {
            const t = toString(raw);
            if (typeof t === "string" && t.indexOf("[object") !== 0) return t;
        }
    } catch (e) { /* continue with the JS variant */ }
    return bytesToUtf8String(raw);
}

const DISCOVERY_CACHE_MS = 10 * 60 * 1000;
function discoverAllCollections(email, password, forceFresh) {
    const cacheKey = "pinnDiscovery:" + email + ":" + password;
    if (!forceFresh) {
        try {
            const cached = $app.store().get(cacheKey);
            if (cached && (Date.now() - cached.ts) < DISCOVERY_CACHE_MS) {
                return { host: cached.host, xmlHeaders: cached.xmlHeaders, collections: cached.collections };
            }
        } catch (e) { /* continue without cache */ }
    }
    const fresh = discoverAllCollectionsUncached(email, password);
    try {
        $app.store().set(cacheKey, { ts: Date.now(), host: fresh.host, xmlHeaders: fresh.xmlHeaders, collections: fresh.collections });
    } catch (e) { /* the cache is optional */ }
    return fresh;
}

function discoverAllCollectionsUncached(email, password) {
    // Entry point for the principal discovery. The ACTUAL server for the calendars
    // (e.g. p182 instead of p102) is then taken automatically from the calendar-home-set response -
    // there is no need to find it out manually any more.
    const ENTRY_HOST = "https://p102-caldav.icloud.com";
    const authHeader = authHeaderFor(email, password);
    const xmlHeaders = { "Content-Type": "text/xml; charset=utf-8", "Authorization": authHeader };

    // Schritt 1: current-user-principal
    const principalRes = $http.send({
        url: ENTRY_HOST + "/",
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "0" }, xmlHeaders),
        body: '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    });
    if (principalRes.statusCode === 401) {
        throw new Error("Anmeldung fehlgeschlagen (401) - E-Mail oder App-spezifisches Passwort falsch.");
    }
    if (principalRes.statusCode !== 207 && principalRes.statusCode !== 200) {
        throw new Error("Unerwarteter Status bei der Anmeldung: " + principalRes.statusCode);
    }
    const principalMatch = (principalRes.raw || "").match(/<[^>]*current-user-principal[^>]*>\s*<[^>]*href[^>]*>(.*?)<\/[^>]*href[^>]*>/s);
    if (!principalMatch) {
        throw new Error("current-user-principal nicht in der Antwort gefunden.");
    }
    const principalPath = principalMatch[1];

    // Step 2: calendar-home-set (often returns a DIFFERENT host than ENTRY_HOST)
    const homeSetRes = $http.send({
        url: resolveHref(ENTRY_HOST, principalPath),
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "0" }, xmlHeaders),
        body: '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    });
    if (homeSetRes.statusCode !== 207 && homeSetRes.statusCode !== 200) {
        throw new Error("calendar-home-set konnte nicht geladen werden (Status " + homeSetRes.statusCode + ").");
    }
    const homeSetMatch = (homeSetRes.raw || "").match(/<[^>]*calendar-home-set[^>]*>\s*<[^>]*href[^>]*>(.*?)<\/[^>]*href[^>]*>/s);
    if (!homeSetMatch) {
        throw new Error("calendar-home-set nicht in der Antwort gefunden.");
    }
    const calendarHomeUrl = resolveHref(ENTRY_HOST, homeSetMatch[1]);
    const hostMatch = calendarHomeUrl.match(/^https?:\/\/[^\/]+/);
    const realHost = hostMatch ? hostMatch[0] : ENTRY_HOST;
    const calendarHomePath = calendarHomeUrl.replace(/^https?:\/\/[^\/]+/, '');

    // Step 3: query all collections in the real folder, including the supported component type
    const calRes = $http.send({
        url: calendarHomeUrl,
        method: "PROPFIND",
        timeout: 30,
        headers: Object.assign({ "Depth": "1" }, xmlHeaders),
        body: '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
              '<d:prop><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>',
    });
    if (calRes.statusCode !== 207 && calRes.statusCode !== 200) {
        throw new Error("Sammlungsliste konnte nicht geladen werden (Status " + calRes.statusCode + ").");
    }
    const segments = (calRes.raw || "").split(/<\/?[^>]*response[^>]*>/);
    const collections = [];
    for (const seg of segments) {
        const nameMatch = seg.match(/<[^>]*displayname[^>]*>(.*?)<\/[^>]*displayname[^>]*>/);
        const hrefMatch = seg.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href[^>]*>/);
        if (nameMatch && hrefMatch && nameMatch[1].trim()) {
            const itemPath = hrefMatch[1].replace(/^https?:\/\/[^\/]+/, '');
            // With some servers, Depth:1 also returns the queried folder itself (recognisable here
            // by the account name instead of a real calendar/list name) - that is
            // not a real collection and must be filtered out.
            if (itemPath === calendarHomePath) continue;
            collections.push({
                name: nameMatch[1].trim(),
                href: hrefMatch[1],
                supportsVevent: /VEVENT/.test(seg),
                supportsVtodo: /VTODO/.test(seg),
            });
        }
    }
    console.log("[Sammlungen-Diagnose] " + collections.length + " gefunden: " + JSON.stringify(collections.map(c => ({ name: c.name, href: c.href, vevent: c.supportsVevent, vtodo: c.supportsVtodo }))));
    return { host: realHost, xmlHeaders, collections };
}

// Filter out only the calendars (events, VEVENT) from the collection.
function discoverCalendarList(email, password, forceFresh) {
    const { host, xmlHeaders, collections } = discoverAllCollections(email, password, forceFresh);
    const calendars = collections.filter(c => c.supportsVevent).map(c => ({ name: c.name, href: c.href }));
    return { host, xmlHeaders, calendars };
}

// Filter out only the reminder lists (tasks, VTODO) from the collection.
function discoverReminderLists(email, password) {
    const { host, xmlHeaders, collections } = discoverAllCollections(email, password);
    const lists = collections.filter(c => c.supportsVtodo).map(c => ({ name: c.name, href: c.href }));
    return { host, xmlHeaders, lists };
}

// For the settings dialog: only the names of the available calendars.
function discoverCalendars(email, password) {
    const { calendars } = discoverCalendarList(email, password, true); // settings: always fresh
    return calendars.map(c => c.name);
}

// For the settings dialog: only the names of the available reminder lists.
function discoverReminders(email, password) {
    const { lists } = discoverReminderLists(email, password);
    return lists.map(l => l.name);
}

// Loads events and returns them GROUPED BY RESOURCE (href + the VEVENT blocks in it) -
// important so that we can later delete exactly THIS one resource in iCloud. One
// resource can contain several VEVENT blocks (e.g. for recurring events with
// exception events), which then share the same href.
function downloadCalendarEvents(host, xmlHeaders, href) {
    const icsRes = $http.send({
        url: resolveHref(host, href),
        method: "REPORT",
        timeout: 30,
        headers: Object.assign({ "Depth": "1" }, xmlHeaders),
        body: '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
              '<d:prop><d:getetag/><c:calendar-data/></d:prop>' +
              '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>' +
              '</c:calendar-query>',
    });
    if (icsRes.statusCode !== 207 && icsRes.statusCode !== 200) {
        const err = new Error("Termine konnten nicht geladen werden (Status " + icsRes.statusCode + ").");
        err.status = icsRes.statusCode;
        err.body = String(icsRes.raw || "").slice(0, 2000);
        throw err;
    }
    const raw = icsRes.raw || "";
    // Roughly split into single <d:response> blocks so that href and calendar-data stay together
    const responseChunks = raw.split(/<\/[^>]*response>/i);
    const resources = [];
    responseChunks.forEach(chunk => {
        const hrefMatch = chunk.match(/<[^>]*href[^>]*>(.*?)<\/[^>]*href[^>]*>/);
        const calDataMatch = chunk.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data[^>]*>/);
        if (!hrefMatch || !calDataMatch) return;
        const decoded = calDataMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        const veventBlocks = decoded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g);
        if (veventBlocks && veventBlocks.length) {
            resources.push({ href: hrefMatch[1], veventBlocks: veventBlocks });
        }
    });
    return resources;
}

// For the cron sync: loads events of all SELECTED calendars and writes them together into one ICS file.
// Each VEVENT block additionally gets two custom X properties (X-PINN-HREF, X-PINN-CALNAME)
// embedded - standard calendar programs simply ignore unknown X properties, but our
// own app reads them: X-PINN-HREF, to know which iCloud resource has to be addressed when
// editing/ticking off/deleting, X-PINN-CALNAME, to recognise tasks from the tasks calendar.
// DO NOT remove - without these lines, tasks and editing do not work.
function syncSelectedCalendars(email, password, selectedNames, outputPath) {
    const result = { blocks: [], synced: [], skipped: [] };
    collectAccountBlocks(appleAccount(email, password), selectedNames, result);
    const finalIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + result.blocks.join("\r\n") + "\r\nEND:VCALENDAR\r\n";
    $os.writeFile(outputPath, finalIcs, 420);
    return { syncedCalendars: result.synced, eventCount: result.blocks.length, veventBlocks: result.blocks };
}

// Loads the events of the selected calendars of ONE account (iCloud or Google) and appends them with
// X-PINN-HREF / X-PINN-CALNAME to result.blocks. With Google, individual calendars that fundamentally
// cannot be read via CalDAV (e.g. some subscribed special calendars, status
// 403/404/405) are skipped instead of aborting the whole sync. Network or server errors
// still abort - the previous calendar file then stays in place instead of losing events.
function collectAccountBlocks(acc, selectedNames, result) {
    acc.calendars.forEach(cal => {
        if (selectedNames.indexOf(cal.name) === -1) return;
        let resources;
        try {
            resources = downloadCalendarEvents(acc.host, acc.xmlHeaders, cal.href);
        } catch (e) {
            if (acc.kind === "google") {
                const google = require(`${__hooks}/pinn-google.js`);
                if (e.body && google.isApiDisabled(e.body)) throw new Error(google.CALDAV_DISABLED_MESSAGE);
                if (e.status === 403 || e.status === 404 || e.status === 405) {
                    result.skipped.push(cal.name);
                    console.log("[Kalender-Sync] Google-Kalender \"" + cal.name + "\" übersprungen (Status " + e.status + ").");
                    return;
                }
            }
            throw e;
        }
        result.synced.push(cal.name);
        resources.forEach(res => {
            res.veventBlocks.forEach(block => {
                result.blocks.push(block.replace(
                    'BEGIN:VEVENT',
                    'BEGIN:VEVENT\r\nX-PINN-HREF:' + res.href + '\r\nX-PINN-CALNAME:' + cal.name
                ));
            });
        });
    });
    return result;
}

// ---------------------------------------------------------------------------------------------
// Accounts: iCloud (Apple ID) and Google (Android)
// An account object { kind: "apple"|"google", host, xmlHeaders, calendars: [{name, href, timeZone}] }
// encapsulates the difference (sign-in via app password or via Google access key, own
// calendar list). Creating, changing, deleting, raw text and sync only work with this object.
// Which account is responsible is derived
//  - for existing events from the address (X-PINN-HREF): Google events live under /caldav/v2/
//  - for calendar names from the suffix " (Google)" (pinn-google.js)
// ---------------------------------------------------------------------------------------------
function googleLib() {
    return require(`${__hooks}/pinn-google.js`);
}
function isGoogleHref(href) {
    return /^(https?:\/\/apidata\.googleusercontent\.com)?\/caldav\/v2\//i.test(String(href || ""));
}
function isGoogleCalendarName(name) {
    try { return googleLib().isGoogleName(name); } catch (e) { return false; }
}
function providerLabel(acc) {
    return acc && acc.kind === "google" ? "Google" : "iCloud";
}

function appleAccount(email, password, forceFresh) {
    const r = discoverCalendarList(email, password, forceFresh);
    return { kind: "apple", host: r.host, xmlHeaders: r.xmlHeaders, calendars: r.calendars };
}
function appleAccountForFamily(familyId) {
    const creds = getAppleCredentials(familyId);
    if (!creds.configured) throw new Error(creds.error || MISSING_CREDENTIALS_MESSAGE);
    return appleAccount(creds.email, creds.appPassword);
}
function googleAccountForFamily(familyId, forceFresh) {
    return googleLib().account(familyId, forceFresh);
}
// Account for an existing event (based on its address)
function accountForHref(familyId, href) {
    return isGoogleHref(href) ? googleAccountForFamily(familyId) : appleAccountForFamily(familyId);
}
// account for a calendar name
function accountForCalendar(familyId, calendarName) {
    return isGoogleCalendarName(calendarName) ? googleAccountForFamily(familyId) : appleAccountForFamily(familyId);
}

function calendarIn(acc, name) {
    const cal = acc.calendars.find(c => c.name === name);
    if (!cal) throw new Error('Kalender "' + name + '" wurde nicht gefunden.');
    return cal;
}
function collectionUrl(acc, cal) {
    let url = resolveHref(acc.host, cal.href);
    if (url.charAt(url.length - 1) !== '/') url += '/';
    return url;
}
// Make addresses comparable (Google returns "@" sometimes as %40, sometimes directly)
function normUrl(u) {
    let s = String(u || "");
    try { s = decodeURIComponent(s); } catch (e) { /* leave as is */ }
    return s.toLowerCase();
}
function utcStampNow() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) +
        'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
}
// Random part of a new UID: PocketBase's secure random generator (not a simple random); the counter
// keeps UIDs unique should the generator ever be unavailable.
let uidCounter = 0;
function uidSuffix() {
    try {
        const s = $security.randomStringWithAlphabet(10, "abcdefghijklmnopqrstuvwxyz0123456789");
        if (typeof s === 'string' && s.length >= 4) return s;
    } catch (e) { /* fall through */ }
    uidCounter += 1;
    return 'c' + uidCounter.toString(36) + Date.now().toString(36);
}
function newEventUid(ev) {
    // The app can bring the UID along (ev.clientUid, for events created offline). Then an event
    // that is sent again ends up in the same resource instead of appearing twice in the calendar.
    const clientUid = (ev && typeof ev.clientUid === 'string') ? ev.clientUid : '';
    return /^pinn-[A-Za-z0-9-]{4,80}$/.test(clientUid)
        ? clientUid
        : 'pinn-' + Date.now() + '-' + uidSuffix();
}
function resourceUrlFor(acc, cal, uid) {
    return collectionUrl(acc, cal) + encodeURIComponent(uid) + '.ics';
}
function putIcs(acc, url, icsBody) {
    const res = $http.send({
        url: url, method: "PUT", timeout: 30,
        headers: { "Authorization": acc.xmlHeaders.Authorization, "Content-Type": "text/calendar; charset=utf-8" },
        body: icsBody,
    });
    if (res.statusCode !== 201 && res.statusCode !== 204 && res.statusCode !== 200) {
        if (acc.kind === "google" && googleLib().isApiDisabled(res.raw)) throw new Error(googleLib().CALDAV_DISABLED_MESSAGE);
        const err = new Error("Status " + res.statusCode);
        err.status = res.statusCode;
        throw err;
    }
    return res.statusCode;
}
function sendDelete(acc, url) {
    const res = $http.send({
        url: url, method: "DELETE", timeout: 30,
        headers: { "Authorization": acc.xmlHeaders.Authorization },
    });
    return res;
}

// --- Event functions per account ---

function createEventInAccount(acc, calendarName, ev) {
    const cal = calendarIn(acc, calendarName);
    const uid = newEventUid(ev);
    const icsBody = buildVEventICS(uid, utcStampNow(), ev, acc.kind === "google" ? cal.timeZone : "");
    try {
        putIcs(acc, resourceUrlFor(acc, cal, uid), icsBody);
    } catch (e) {
        throw new Error(e.status ? "Anlegen in " + providerLabel(acc) + " fehlgeschlagen (Status " + e.status + ")." : e.message);
    }
    return { uid: uid };
}

function fetchRawEventInAccount(acc, href) {
    const url = resolveHref(acc.host, href);
    const res = $http.send({
        url: url, method: "GET", timeout: 30,
        headers: { "Authorization": acc.xmlHeaders.Authorization },
    });
    if (res.statusCode !== 200) {
        throw new Error("Termin konnte nicht geladen werden (Status " + res.statusCode + ").");
    }
    const raw = res.raw || "";
    console.log("[Termin-Rohtext] " + providerLabel(acc) + " - Status: " + res.statusCode + " - Länge: " + raw.length + " - Anfang: " + raw.slice(0, 150));
    return raw;
}

function deleteEventInAccount(acc, eventHref) {
    const fullUrl = resolveHref(acc.host, eventHref);
    console.log("[Kalender-Loeschen] Sende DELETE (" + providerLabel(acc) + ") an: " + fullUrl);
    const res = sendDelete(acc, fullUrl);
    console.log("[Kalender-Loeschen] Antwort-Status: " + res.statusCode + " - Body: " + (res.raw || "").slice(0, 300));
    // 404/410 = already gone -> a success for us as well (the goal "it is gone" is reached)
    if (res.statusCode !== 204 && res.statusCode !== 200 && res.statusCode !== 404 && res.statusCode !== 410) {
        if (acc.kind === "google" && googleLib().isApiDisabled(res.raw)) throw new Error(googleLib().CALDAV_DISABLED_MESSAGE);
        throw new Error("Löschen in " + providerLabel(acc) + " fehlgeschlagen (Status " + res.statusCode + ").");
    }
    console.log("[Kalender-Loeschen] Erfolgreich gelöscht.");
    return true;
}

// Updates an existing event. src = account in which the event lives, dst = account of the
// target calendar (ev.calendarName). Same calendar: simply overwrite. Different calendar (also
// between iCloud and Google): create anew in the target calendar (same UID) and then delete the old one.
function updateEventAcrossAccounts(src, dst, eventHref, uid, ev) {
    const targetCal = calendarIn(dst, ev.calendarName);
    const targetCalUrl = collectionUrl(dst, targetCal);
    const oldFullUrl = resolveHref(src.host, eventHref);
    const icsBody = buildVEventICS(uid, utcStampNow(), ev, dst.kind === "google" ? targetCal.timeZone : "");
    const sameAccount = src.kind === dst.kind;

    if (sameAccount && normUrl(oldFullUrl).indexOf(normUrl(targetCalUrl)) === 0) {
        // Normal case: the calendar stays the same, simply overwrite the event.
        try {
            putIcs(dst, oldFullUrl, icsBody);
        } catch (e) {
            throw new Error(e.status ? "Aktualisieren in " + providerLabel(dst) + " fehlgeschlagen (Status " + e.status + ")." : e.message);
        }
        return true;
    }

    // The calendar was changed: CalDAV has no direct "move" between calendars (and
    // certainly not between iCloud and Google) - so create anew in the target calendar (same UID)
    // and then delete the old resource in the original calendar.
    const newUrl = resourceUrlFor(dst, targetCal, uid);
    try {
        putIcs(dst, newUrl, icsBody);
    } catch (e) {
        throw new Error(e.status ? "Verschieben fehlgeschlagen (Anlegen im neuen Kalender, Status " + e.status + ")." : e.message);
    }
    if (sameAccount && normUrl(newUrl) === normUrl(oldFullUrl)) return true; // Safety net: never delete the event that was just written
    const deleteRes = sendDelete(src, oldFullUrl);
    if (deleteRes.statusCode !== 204 && deleteRes.statusCode !== 200 && deleteRes.statusCode !== 404 && deleteRes.statusCode !== 410) {
        throw new Error("Verschieben nur teilweise gelungen: im neuen Kalender angelegt, aber die alte Version im ursprünglichen Kalender konnte nicht gelöscht werden (Status " + deleteRes.statusCode + "). Bitte den alten Termin manuell im " + (src.kind === "google" ? "Google" : "Apple") + "-Kalender löschen.");
    }
    return true;
}

// --- Event functions per family (they choose the matching account themselves) ---

function createEventForFamily(familyId, calendarName, ev) {
    return createEventInAccount(accountForCalendar(familyId, calendarName), calendarName, ev);
}
function updateEventForFamily(familyId, eventHref, uid, ev) {
    const src = accountForHref(familyId, eventHref);
    const dst = (isGoogleHref(eventHref) === isGoogleCalendarName(ev.calendarName)) ? src : accountForCalendar(familyId, ev.calendarName);
    return updateEventAcrossAccounts(src, dst, eventHref, uid, ev);
}
function deleteEventForFamily(familyId, eventHref) {
    console.log("[Kalender-Loeschen] Angefragt für href: " + eventHref);
    return deleteEventInAccount(accountForHref(familyId, eventHref), eventHref);
}
function fetchRawEventForFamily(familyId, href) {
    return fetchRawEventInAccount(accountForHref(familyId, href), href);
}

// All calendar names of the family (iCloud + Google) for the settings. If only one of the two
// accounts is connected or one of them fails, the others still come through - the error is in "warning".
function discoverCalendarsForFamily(familyId) {
    const names = [];
    const problems = [];
    let anyAccount = false;
    const creds = getAppleCredentials(familyId);
    if (creds.configured) {
        anyAccount = true;
        try { discoverCalendars(creds.email, creds.appPassword).forEach(n => names.push(n)); }
        catch (e) { problems.push("iCloud: " + e.message); }
    } else if (creds.error) {
        problems.push("iCloud: " + creds.error);
    }
    let google = null;
    try { google = googleLib(); } catch (e) { google = null; }
    if (google && google.hasCredentials(familyId)) {
        anyAccount = true;
        try { google.discoverCalendarNames(familyId).forEach(n => names.push(n)); }
        catch (e) { problems.push("Google: " + e.message); }
    }
    if (!anyAccount) return { calendars: [], error: problems.length ? problems.join(" ") : NO_ACCOUNT_MESSAGE };
    if (!names.length) return { calendars: [], error: problems.length ? problems.join(" ") : "Keine Kalender gefunden." };
    return { calendars: names, warning: problems.join(" ") };
}

/* ===== COMMENTED OUT: tasks via the Apple tasks calendar =====
   Tasks now live in the PocketBase collection "aufgaben" (pinn-aufgaben.js).
   This block is only kept for safety in case the calendar variant is still needed.
// Common waste types (mirrored from the app, since both sides run independently) - "keywords" serve
// to recognise collection dates by their title in the synchronised calendar.
const WASTE_TYPE_KEYWORDS_SERVER = [
    { id: 'restmuell', label: 'Restmüll', icon: '\ud83d\uddd1\ufe0f', taskLabel: 'Restmüll', keywords: ['restmüll', 'restabfall', 'restmülltonne', 'hausmüll'] },
    { id: 'biomuell', label: 'Biomüll', icon: '\ud83c\udf42', taskLabel: 'Biomüll', keywords: ['biomüll', 'bioabfall', 'biotonne'] },
    { id: 'papier', label: 'Papier/Pappe', icon: '\ud83d\udce6', taskLabel: 'Papiermüll', keywords: ['papier', 'pappe', 'papiertonne'] },
    { id: 'gelbersack', label: 'Gelber Sack / Verpackungen', icon: '\u267b\ufe0f', taskLabel: 'Gelber Sack', keywords: ['gelber sack', 'gelbe tonne', 'verpackung', 'wertstoff'] },
    { id: 'glas', label: 'Glas', icon: '\ud83c\udf7e', taskLabel: 'Altglas', keywords: ['glas', 'altglas'] },
];

// Extracts title+date of NON-recurring events from raw VEVENT blocks (for simple events
// entered individually per day, as municipal waste collection calendars typically provide them).
function extractSimpleEventSummaries(veventBlocks) {
    const results = [];
    veventBlocks.forEach(block => {
        const lines = block.split(/\r\n|\r|\n/);
        let hasRrule = false;
        let summary = null;
        let dtstartRaw = null;
        let lastModifiedRaw = null;
        let dtstampRaw = null;
        lines.forEach(line => {
            if (line.indexOf('RRULE:') === 0) {
                hasRrule = true;
            } else if (line.indexOf('SUMMARY:') === 0) {
                summary = line.slice('SUMMARY:'.length);
            } else if (line.indexOf('DTSTART') === 0) {
                const colonIdx = line.indexOf(':');
                if (colonIdx !== -1) {
                    const digitsMatch = line.slice(colonIdx + 1).match(/^\d{8}/);
                    if (digitsMatch) dtstartRaw = digitsMatch[0];
                }
            } else if (line.indexOf('LAST-MODIFIED:') === 0) {
                lastModifiedRaw = line.slice('LAST-MODIFIED:'.length).trim();
            } else if (line.indexOf('DTSTAMP:') === 0) {
                dtstampRaw = line.slice('DTSTAMP:'.length).trim();
            }
        });
        if (hasRrule) return; // deliberately ignore recurring events here
        if (summary !== null && dtstartRaw) {
            results.push({
                title: summary.trim(),
                date: dtstartRaw.slice(0, 4) + '-' + dtstartRaw.slice(4, 6) + '-' + dtstartRaw.slice(6, 8),
                // Time of the last change - when ticking off, the app rewrites the event, so
                // this is the completion time (basis for the automatic deletion).
                changedRaw: lastModifiedRaw || dtstampRaw,
            });
        }
    });
    return results;
}

===== END COMMENTED OUT ===== */

// Emoji prefix for completed tasks (must match the client-side DONE_EMOJI).
// Simple progress state for long-running household operations (deleting/regenerating),
// so that the settings page can show a live counter by polling. Lives only in the
// server process memory (no DB field needed) - it is lost on a restart, which would be
// meaningless for a running operation anyway.
let householdProgress = { active: false, label: "", total: 0, done: 0 };
function setHouseholdProgress(label, total, done) {
    householdProgress = { active: true, label: label, total: total, done: done };
}
function bumpHouseholdProgress() {
    if (householdProgress.active) householdProgress.done++;
}
function finishHouseholdProgress(finalLabel) {
    householdProgress = { active: false, label: finalLabel || householdProgress.label, total: householdProgress.total, done: householdProgress.done };
}
function getHouseholdProgress() {
    return householdProgress;
}

/* ===== COMMENTED OUT: tasks via the Apple tasks calendar =====
   Tasks now live in the PocketBase collection "aufgaben" (pinn-aufgaben.js).
   This block is only kept for safety in case the calendar variant is still needed.
const DONE_EMOJI_SERVER = "\u2705 ";
function stripDoneEmojiServer(title) {
    return title.indexOf(DONE_EMOJI_SERVER) === 0 ? title.slice(DONE_EMOJI_SERVER.length) : title;
}

// Loads ALL events (title+date+href) from the tasks calendar - basis for the
// household task generation below (loaded once per cron run, not per rule).
function getAllTaskCalendarEvents(config) {
    const { host, xmlHeaders, calendars } = discoverCalendarList(config.email, config.appPassword);
    const taskCal = calendars.find(c => c.name === config.taskCalendarName);
    if (!taskCal) {
        console.log("[Haushalt-Diagnose] Aufgaben-Kalender \"" + config.taskCalendarName + "\" nicht in der Sammlungsliste gefunden.");
        return [];
    }
    const resources = downloadCalendarEvents(host, xmlHeaders, taskCal.href);
    const result = [];
    resources.forEach(res => {
        extractSimpleEventSummaries(res.veventBlocks).forEach(e => {
            result.push({ title: e.title, date: e.date, href: res.href, changedRaw: e.changedRaw });
        });
    });
    console.log("[Haushalt-Diagnose] Aufgaben-Kalender geladen: " + resources.length + " Ressourcen, " + result.length + " einfache Aufgaben daraus erkannt.");
    return result;
}

// Creates EXACTLY ONE task per cycle for a due household rule (cleaning/trash bin) -
// no piling up of several open tasks. If the previous task was not completed by its deadline (end of day
// + 4 hours, i.e. 4 a.m. on the following day), it is deleted and replaced by the
// new one, with a backlog counter in the title ("(2x not done)").
// Builds the "Zugewiesen: Name, Name" notes line from stored member IDs - same
// convention as on the client side for normal events (index.html), so that the app recognises the assignment
// the same way when displaying/filtering. No (or no longer valid) IDs -> "All", so that the
// task does not disappear when filtering by a specific person.
function buildAssignedNotesServer(assignedMemberIds, membersList) {
    const labels = (assignedMemberIds || []).map(id => {
        const m = (membersList || []).find(mm => mm.id === id);
        if (!m) return null;
        return (m.displayMode === "role" && m.role) ? m.role : m.name;
    }).filter(Boolean);
    return "Zugewiesen: " + (labels.length ? labels.join(", ") : "Alle");
}

// Converts an ICS timestamp (e.g. "20260922T205211Z") to milliseconds.
function icsStampToMs(raw) {
    const m = (raw || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    if (m[7] === "Z") return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

// Deletes completed (✅) tasks from iCloud as soon as they have been completed long enough according to the setting
// (0 = immediately, 1 or 2 days). Uses the task list that is loaded anyway - NO additional download.
// IMPORTANT: tasks dated TODAY are never deleted, not even with "Immediately". The
// household detection recognises from exactly this completed task that today's cleaning is already
// done - if it were gone, it would be created again immediately on the next run. With "Immediately"
// the app therefore hides completed tasks right away; they are deleted the following day.
function cleanupDoneTasks(config, cleanupDays, allTasks, todayIso) {
    const days = (cleanupDays === 0 || cleanupDays === 1 || cleanupDays === 2) ? cleanupDays : 2;
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
    const toDelete = allTasks.filter(t => {
        if (!t.href || t.title.indexOf(DONE_EMOJI_SERVER) !== 0) return false;
        if (!t.date || t.date >= todayIso) return false;
        const changedMs = icsStampToMs(t.changedRaw);
        return changedMs !== null && changedMs <= cutoffMs;
    });
    toDelete.forEach(t => {
        try {
            deleteCalendarEvent(config.email, config.appPassword, t.href);
            const idx = allTasks.indexOf(t);
            if (idx !== -1) allTasks.splice(idx, 1);
            console.log("[Aufgaben-Aufraeumen] Erledigte Aufgabe geloescht: \"" + t.title + "\"");
        } catch (e) {
            console.log("[Aufgaben-Aufraeumen] Konnte \"" + t.title + "\" nicht loeschen: " + e.message);
        }
    });
    return toDelete.length;
}

function processHouseholdSchedule(config, allTasks, baseTitle, todayIso, notes) {
    bumpHouseholdProgress();
    const matching = allTasks.filter(t => stripDoneEmojiServer(t.title).indexOf(baseTitle) === 0);
    if (matching.length) console.log("[Haushalt-Diagnose] \"" + baseTitle + "\": " + matching.length + " bereits vorhanden - " + JSON.stringify(matching.map(t => t.date)));
    if (matching.some(t => t.date === todayIso)) return; // a task for today already exists (duplicate protection)

    // Emergency brake: should the duplicate protection fail for any reason (currently
    // being investigated), rather create NOTHING more than flood the calendar with dozens of copies.
    if (matching.length >= 3) {
        console.log("[Haushalt-Diagnose] NOTBREMSE: bereits " + matching.length + " Aufgaben mit dem Titel \"" + baseTitle + "\" vorhanden - lege trotz Fälligkeit keine weitere an, bis das geklärt ist.");
        return;
    }

    matching.sort((a, b) => b.date.localeCompare(a.date));
    const last = matching[0];
    let missCount = 0;

    if (last) {
        const isDone = last.title.indexOf(DONE_EMOJI_SERVER) === 0;
        if (!isDone) {
            const deadline = new Date(last.date + "T04:00:00");
            deadline.setDate(deadline.getDate() + 1); // end of day + 4h = 4 a.m. of the following day
            if (new Date() < deadline) return; // deadline of the previous task is still running - wait
            const counterMatch = stripDoneEmojiServer(last.title).match(/\((\d+)x nicht erledigt\)$/);
            missCount = counterMatch ? parseInt(counterMatch[1], 10) + 1 : 1;
            try {
                deleteCalendarEvent(config.email, config.appPassword, last.href);
                const idx = allTasks.indexOf(last);
                if (idx !== -1) allTasks.splice(idx, 1); // update the live state so that subsequent rules in the same run see it
            } catch (e) {
                console.log("[Haushalt-Aufgabe] Konnte ueberfaellige Aufgabe nicht loeschen: " + e.message);
            }
        }
        // if it was completed: missCount stays 0, simply create anew as usual
    }

    const title = missCount > 0 ? baseTitle + " (" + missCount + "x nicht erledigt)" : baseTitle;
    try {
        createCalendarEvent(config.email, config.appPassword, config.taskCalendarName, {
            title, allDay: true,
            startDate: todayIso, startTime: "09:00", endDate: todayIso, endTime: "09:00",
            location: "", notes: notes || "", url: "",
            repeat: "none", repeatInterval: 1, repeatEnd: "never", repeatCount: 10, repeatUntil: "",
            alert: "none",
        });
        allTasks.push({ title, date: todayIso, href: null }); // update the live state (href unknown, reloaded on the next real sync)
        console.log("[Haushalt-Aufgabe] Angelegt: " + title);
    } catch (e) {
        console.log("[Haushalt-Aufgabe] Fehler beim Anlegen (" + title + "): " + e.message);
    }
}

// Checks whether the calendar shows a waste bin collection for tomorrow (based on the event title), and
// creates for it - per affected bin - a task "Take out bin: <room>
// (<waste type>)" for TODAY (via processHouseholdSchedule, i.e. with a backlog counter instead of
// piling up if the last one was still open).
function runTrashDetection(veventBlocks, config, rooms, trashBins, allTasks, membersList) {
    if (!config.taskCalendarName || !trashBins || !trashBins.length) return;

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, "0");
    const todayIso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    const tomorrowIso = tomorrow.getFullYear() + "-" + pad(tomorrow.getMonth() + 1) + "-" + pad(tomorrow.getDate());

    const tomorrowEvents = extractSimpleEventSummaries(veventBlocks).filter(e => e.date === tomorrowIso);
    console.log("[Muell-Diagnose] Morgen (" + tomorrowIso + ") gefundene einfache Termine: " + tomorrowEvents.length + (tomorrowEvents.length ? " - Titel: " + JSON.stringify(tomorrowEvents.map(e => e.title)) : ""));
    if (!tomorrowEvents.length) return;

    const matchedWasteTypeIds = new Set();
    WASTE_TYPE_KEYWORDS_SERVER.forEach(wt => {
        const hit = tomorrowEvents.some(ev => wt.keywords.some(kw => ev.title.toLowerCase().indexOf(kw) !== -1));
        if (hit) matchedWasteTypeIds.add(wt.id);
    });
    if (!matchedWasteTypeIds.size) return;

    const relevantBins = trashBins.filter(b => matchedWasteTypeIds.has(b.wasteType));
    if (!relevantBins.length) return;

    relevantBins.forEach(bin => {
        const room = rooms.find(r => r.id === bin.roomId);
        const wt = WASTE_TYPE_KEYWORDS_SERVER.find(w => w.id === bin.wasteType);
        const baseTitle = (wt ? wt.icon : "\ud83d\uddd1\ufe0f") + " " + (wt ? wt.taskLabel : "Muell") + " rausbringen: " + (room ? room.name : "Unbekannt");
        const notes = buildAssignedNotesServer(bin.assignedMemberIds, membersList);
        processHouseholdSchedule(config, allTasks, baseTitle, todayIso, notes);
    });
}

const WEEKDAY_IDS_SERVER = ["so", "mo", "di", "mi", "do", "fr", "sa"]; // index corresponds to JS Date.getDay() (0 = Sunday)

function isScheduleDueToday(sched, todayIso, todayMidnight, todayWeekday) {
    if (sched.scheduleType === "weekdays") {
        return (sched.weekdays || []).indexOf(todayWeekday) !== -1;
    }
    if (sched.scheduleType === "interval" && sched.intervalDays) {
        const refDateStr = sched.createdDate || todayIso;
        const ref = new Date(refDateStr + "T00:00:00");
        const refMidnight = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
        const daysSince = Math.round((todayMidnight - refMidnight) / (24 * 60 * 60 * 1000));
        return daysSince >= 0 && daysSince % sched.intervalDays === 0;
    }
    return false;
}

// Creates a task "<category>: <room>" for each due room cleaning (weekday or interval rule)
// - via processHouseholdSchedule (exactly one per cycle, with a
// backlog counter instead of piling up).
function runCleaningDetection(config, roomsList, roomSchedules, cleaningCategories, allTasks, membersList) {
    if (!config.taskCalendarName || !roomSchedules || !roomSchedules.length) {
        console.log("[Reinigung-Diagnose] Kein Aufgaben-Kalender oder keine Reinigungen hinterlegt (Reinigungen: " + ((roomSchedules || []).length) + ").");
        return;
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const todayIso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayWeekday = WEEKDAY_IDS_SERVER[todayMidnight.getDay()];

    const schedulesDueToday = roomSchedules.filter(sched => isScheduleDueToday(sched, todayIso, todayMidnight, todayWeekday));
    console.log("[Reinigung-Diagnose] " + roomSchedules.length + " Reinigungen insgesamt, heute (" + todayIso + ", " + todayWeekday + ") faellig: " + schedulesDueToday.length + " - " + JSON.stringify(roomSchedules.map(s => ({ roomId: s.roomId, category: s.category, type: s.scheduleType, weekdays: s.weekdays, intervalDays: s.intervalDays, createdDate: s.createdDate }))));
    if (!schedulesDueToday.length) return;

    schedulesDueToday.forEach(sched => {
        const room = roomsList.find(r => r.id === sched.roomId);
        const category = (cleaningCategories || []).find(c => c.id === sched.category);
        const baseTitle = (category ? category.label : "Reinigung") + ": " + (room ? room.name : "Unbekannt");
        const notes = buildAssignedNotesServer(sched.assignedMemberIds, membersList);
        processHouseholdSchedule(config, allTasks, baseTitle, todayIso, notes);
    });
}

// For bins with a manually set take-out rhythm (weekdays/interval), creates the same
// task as the automatic collection detection (same title -> the same
// backlog mechanism works for both triggers together).
function runTrashBinScheduleDetection(config, roomsList, trashBins, allTasks, membersList) {
    const dueBins = (trashBins || []).filter(b => b.schedule);
    if (!config.taskCalendarName || !dueBins.length) {
        console.log("[Muelleimer-Diagnose] Kein Aufgaben-Kalender oder kein Mülleimer mit manuellem Zeitplan (Mülleimer gesamt: " + ((trashBins || []).length) + ", davon mit Zeitplan: " + dueBins.length + ").");
        return;
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const todayIso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayWeekday = WEEKDAY_IDS_SERVER[todayMidnight.getDay()];

    const binsDueToday = dueBins.filter(bin => isScheduleDueToday(bin.schedule, todayIso, todayMidnight, todayWeekday));
    console.log("[Muelleimer-Diagnose] " + dueBins.length + " Mülleimer mit Zeitplan, heute (" + todayIso + ", " + todayWeekday + ") faellig: " + binsDueToday.length);
    if (!binsDueToday.length) return;

    binsDueToday.forEach(bin => {
        const room = roomsList.find(r => r.id === bin.roomId);
        const wt = WASTE_TYPE_KEYWORDS_SERVER.find(w => w.id === bin.wasteType);
        const baseTitle = (wt ? wt.icon : "\ud83d\uddd1\ufe0f") + " " + (wt ? wt.taskLabel : "Muell") + " rausbringen: " + (room ? room.name : "Unbekannt");
        const notes = buildAssignedNotesServer(bin.assignedMemberIds, membersList);
        processHouseholdSchedule(config, allTasks, baseTitle, todayIso, notes);
    });
}

===== END COMMENTED OUT ===== */

// Deletes an event FOR REAL in iCloud (not just on our side). For recurring events, the
// complete resource is deleted - this removes the ENTIRE series, not just a single day
// of it (that would be a larger, separate feature). The app warns the user beforehand.
// (Only for iCloud with fixed credentials - the endpoints use deleteEventForFamily.)
function deleteCalendarEvent(email, password, eventHref) {
    console.log("[Kalender-Loeschen] Angefragt für href: " + eventHref);
    return deleteEventInAccount(appleAccount(email, password), eventHref);
}

// For the cron job: reads the credentials/selection directly from PocketBase and syncs.
// IMPORTANT: must live here in the module and not as a top-level function in cron_calendar.pb.js,
// since onBootstrap/cronAdd handlers each run in an isolated environment and do not see any
// top-level functions from the same .pb.js file (see the already known bug).
// Converts a UTF-8 byte array (this is how record.get() returns JSON fields in this PocketBase version -
// as a number array of the raw bytes, not as a string or finished object) correctly into a JS string,
// including multi-byte characters such as umlauts and emojis.
// Decodes the byte array of the JSON field to a string. IMPORTANT: characters are first collected in chunks
// and then joined once - NOT via "result += ..." character by character. The
// old approach had quadratic runtime: since the family data became several MB large through recipe photos,
// every sync (and every endpoint that reads the data) hung for minutes at 99 % CPU.
function bytesToUtf8String(bytes) {
    const len = bytes.length;
    const parts = [];
    let codes = [];
    let i = 0;
    while (i < len) {
        const b1 = bytes[i++];
        if (b1 < 0x80) {
            codes.push(b1);
        } else if ((b1 & 0xE0) === 0xC0) {
            const b2 = bytes[i++];
            codes.push(((b1 & 0x1F) << 6) | (b2 & 0x3F));
        } else if ((b1 & 0xF0) === 0xE0) {
            const b2 = bytes[i++], b3 = bytes[i++];
            codes.push(((b1 & 0x0F) << 12) | ((b2 & 0x3F) << 6) | (b3 & 0x3F));
        } else if ((b1 & 0xF8) === 0xF0) {
            const b2 = bytes[i++], b3 = bytes[i++], b4 = bytes[i++];
            let cp = ((b1 & 0x07) << 18) | ((b2 & 0x3F) << 12) | ((b3 & 0x3F) << 6) | (b4 & 0x3F);
            cp -= 0x10000;
            codes.push(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        }
        if (codes.length >= 8192) {
            parts.push(String.fromCharCode.apply(null, codes));
            codes = [];
        }
    }
    if (codes.length) parts.push(String.fromCharCode.apply(null, codes));
    return parts.join('');
}
function parseRecordData(raw) {
    if (raw && typeof raw === "object" && typeof raw.length === "number") {
        // Byte array. Prefers PocketBase's built-in toString() helper (runs natively in Go and is
        // many times faster than decoding byte by byte in JavaScript - important because
        // the family data is several MB large due to recipe photos and is read on every
        // operation). Only if the helper is missing or returns something unexpected does the JS variant kick in.
        try {
            if (typeof toString === "function") {
                const text = toString(raw);
                if (typeof text === "string" && text.charAt(0) === "{") return JSON.parse(text);
            }
        } catch (e) { /* continue with the JS variant */ }
        try { return JSON.parse(bytesToUtf8String(raw)); } catch (e) { return {}; }
    }
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch (e) { return {}; }
    }
    if (raw && typeof raw === "object") {
        return raw;
    }
    return {};
}

// ---------------------------------------------------------------------------------------------
// Apple credentials PER FAMILY. They are stored encrypted in the locked collection
// "apple_zugaenge" (see pinn-apple.js) - never in familien_daten, never in the browser.
// Each family has its own calendar file (pb_data/pinn_kalender_<family ID>.ics).
// ---------------------------------------------------------------------------------------------
const LEGACY_KALENDER_FILE_PATH = "/pb_data/pinn_kalender.ics"; // previous shared file (is removed on start)
const EMPTY_ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

// Path of a family's calendar file ("" for an invalid ID - then nothing is written)
function kalenderPfad(familyId) {
    const id = String(familyId || "");
    return /^[a-z0-9]{15}$/.test(id) ? "/pb_data/pinn_kalender_" + id + ".ics" : "";
}

// Calendar file of a family as text ("" if it does not exist yet)
function readCalendarText(familyId) {
    const path = kalenderPfad(familyId);
    if (!path) return "";
    try { return bytesToText($os.readFile(path)); } catch (e) { return ""; }
}

function writeEmptyCalendar(familyId) {
    const path = kalenderPfad(familyId);
    if (path) $os.writeFile(path, EMPTY_ICS, 420);
}

function removeCalendarFile(familyId) {
    const path = kalenderPfad(familyId);
    if (path) try { $os.remove(path); } catch (e) { /* does not exist */ }
}

function getAppleCredentials(familyId) {
    return require(`${__hooks}/pinn-apple.js`).getCredentials(familyId);
}

// Removes credentials from a family data object (in place). Returns true if something was
// removed.
function stripAppleSecrets(data) {
    if (!data || typeof data !== "object" || !data.appleCalendar || typeof data.appleCalendar !== "object") return false;
    let changed = false;
    ["email", "appPassword"].forEach(k => {
        if (Object.prototype.hasOwnProperty.call(data.appleCalendar, k)) {
            delete data.appleCalendar[k];
            changed = true;
        }
    });
    return changed;
}

// Reads family data + calendar selection of ONE family and adds its credentials.
// config then contains email/appPassword as usual - all callers can keep working
// with it unchanged. Does not throw an error if the record is missing.
function loadAppleConfig(familyId) {
    let data = {};
    try {
        if (familyId) {
            const record = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
            data = parseRecordData(record.get("data")) || {};
        }
    } catch (e) { data = {}; }
    // From 1.108, family members live in the area "mitglieder"; tasks, household and the calendar selection
    // (appleCalendar) from 1.109 in "aufgaben", "haushalt" and "kalender" (pinn-bereiche.js) - only added for reading
    if (familyId) {
        try { require(`${__hooks}/pinn-bereiche.js`).overlay(familyId, data, ["mitglieder", "aufgaben", "haushalt", "kalender"]); } catch (e) { /* without areas yet */ }
    }
    const creds = getAppleCredentials(familyId);
    const stored = (data && data.appleCalendar && typeof data.appleCalendar === "object") ? data.appleCalendar : {};
    const config = Object.assign({}, stored, { email: creds.email, appPassword: creds.appPassword });
    return { data: data, config: config, configured: creds.configured, error: creds.error || "" };
}

const MISSING_CREDENTIALS_MESSAGE = "Für deine Familie ist noch keine Apple-ID hinterlegt (Einstellungen → Kalender → Bearbeiten).";
const NO_ACCOUNT_MESSAGE = "Für deine Familie ist noch kein Kalender verbunden – unter Einstellungen → Kalender → Bearbeiten eine Apple-ID hinterlegen oder ein Google-Konto verbinden.";

// Result of the last sync per family - in the shared server memory (applies to all hook environments),
// for the status display in the settings.
function setLastSync(familyId, ok, message) {
    try { $app.store().set("pinnAppleSync:" + familyId, { at: new Date().toISOString(), ok: ok, message: message || "" }); } catch (e) { /* does not matter */ }
}
function getLastSync(familyId) {
    try {
        const s = $app.store().get("pinnAppleSync:" + familyId);
        if (s && s.at) return { at: String(s.at), ok: s.ok, message: String(s.message || "") };
    } catch (e) { /* does not matter */ }
    return { at: "", ok: null, message: "" };
}

// Status for the settings (without password!).
function getAppleStatus(familyId) {
    const creds = getAppleCredentials(familyId);
    return {
        configured: creds.configured,
        account: creds.email || "",
        hasAppleId: !!creds.email,
        hasAppPassword: !!creds.appPassword,
        lastSync: getLastSync(familyId),
        error: creds.error || "",
    };
}

// Log e-mail addresses only in shortened form (e.g. "name@example.com" -> "na***@***") so that
// logs can be shared safely.
function maskEmail(email) {
    const s = String(email || "");
    const at = s.indexOf("@");
    if (at < 1) return "***";
    return s.slice(0, Math.min(2, at)) + "***@***";
}

// Rewrite the calendar file of ONE family - from iCloud AND Google (depending on what is connected and
// selected), or empty it if nothing is connected or no calendars are selected.
// If the retrieval fails, the previous file stays in place. The household detection does not run
// here (see pinn-aufgaben.js).
// Admin error log (pinn-protokoll.js) - if the file is missing, it stays with the Docker log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* log not available */ }
}

function syncFamily(familyId) {
    const path = kalenderPfad(familyId);
    if (!path) return;
    try {
        const { config, configured, error } = loadAppleConfig(familyId);
        let google = null;
        let googleConnected = false;
        try { google = googleLib(); googleConnected = google.hasCredentials(familyId); } catch (e) { googleConnected = false; }
        const selected = (config.selectedCalendars || []).slice();
        // COMMENTED OUT: tasks no longer run via the tasks calendar (see pinn-aufgaben.js).
        // const hasTaskCalendar = config.taskCalendarName;

        if (!configured && !googleConnected) {
            // No account connected: empty the calendar file instead of leaving outdated events in place.
            $os.writeFile(path, EMPTY_ICS, 420);
            setLastSync(familyId, false, error || MISSING_CREDENTIALS_MESSAGE);
            return;
        }
        if (!selected.length) {
            // No calendars selected (e.g. after "Reset selection")
            $os.writeFile(path, EMPTY_ICS, 420);
            setLastSync(familyId, true, "Keine Kalender ausgewählt.");
            return;
        }

        const appleNames = selected.filter(n => !isGoogleCalendarName(n));
        const googleNames = selected.filter(n => isGoogleCalendarName(n));
        const result = { blocks: [], synced: [], skipped: [] };

        if (configured && appleNames.length) {
            console.log("[Kalender-Sync] Familie " + familyId + " (iCloud " + maskEmail(config.email) + "): " + appleNames.join(", "));
            collectAccountBlocks(appleAccount(config.email, config.appPassword), appleNames, result);
        }
        if (googleConnected && googleNames.length) {
            console.log("[Kalender-Sync] Familie " + familyId + " (Google): " + googleNames.join(", "));
            collectAccountBlocks(google.account(familyId), googleNames, result);
        }

        const finalIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + result.blocks.join("\r\n") + "\r\nEND:VCALENDAR\r\n";
        $os.writeFile(path, finalIcs, 420);
        let msg = result.blocks.length + " Termine aus " + result.synced.length + " Kalender(n)";
        if (result.skipped.length) msg += " – nicht lesbar: " + result.skipped.join(", ");
        setLastSync(familyId, true, msg);
        if (googleConnected && googleNames.length) { try { google.clearError(familyId); } catch (e) { /* does not matter */ } }
        console.log("[Kalender-Sync] Familie " + familyId + " erfolgreich: " + result.synced.join(", ") + " (" + result.blocks.length + " Termine)");
        plog("behoben", "sync", familyId);
        if (result.skipped.length) plog("warnung", "sync", "Kalender-Sync: nicht lesbar und übersprungen: " + result.skipped.join(", "), { familie: familyId });

        /* ===== COMMENTED OUT: household detection via the tasks calendar (now pinn-aufgaben.js) =====
        try {
            let allTasks = [];
            if (hasTaskCalendar) {
                allTasks = getAllTaskCalendarEvents(config);
                console.log("[Haushalt-Diagnose] Aufgaben-Kalender einmalig geladen: " + allTasks.length + " Aufgaben insgesamt.");
                try {
                    const nowC = new Date();
                    const padC = n => String(n).padStart(2, "0");
                    const todayIsoC = nowC.getFullYear() + "-" + padC(nowC.getMonth() + 1) + "-" + padC(nowC.getDate());
                    cleanupDoneTasks(config, data.doneTaskCleanupDays, allTasks, todayIsoC);
                } catch (eClean) {
                    console.log("[Aufgaben-Aufraeumen] Fehler: " + eClean.message);
                }
            }

            // Rough total count for the live counter (cleanings + trash bin schedules
            // that are due today - the bin collection detection is independent of the date
            // of a stored schedule and is deliberately not counted here).
            const nowP = new Date();
            const padP = n => String(n).padStart(2, "0");
            const todayIsoP = nowP.getFullYear() + "-" + padP(nowP.getMonth() + 1) + "-" + padP(nowP.getDate());
            const todayMidnightP = new Date(nowP.getFullYear(), nowP.getMonth(), nowP.getDate());
            const todayWeekdayP = WEEKDAY_IDS_SERVER[todayMidnightP.getDay()];
            const dueScheduleCount = (data.roomSchedules || []).filter(s => isScheduleDueToday(s, todayIsoP, todayMidnightP, todayWeekdayP)).length;
            const dueBinCount = (data.trashBins || []).filter(b => b.schedule && isScheduleDueToday(b.schedule, todayIsoP, todayMidnightP, todayWeekdayP)).length;
            setHouseholdProgress("Haushalts-Aufgaben werden geprüft", dueScheduleCount + dueBinCount, 0);

            runTrashDetection(result.veventBlocks, config, data.rooms || [], data.trashBins || [], allTasks, data.members || []);
            runCleaningDetection(config, data.rooms || [], data.roomSchedules || [], data.cleaningCategories || [], allTasks, data.members || []);
            runTrashBinScheduleDetection(config, data.rooms || [], data.trashBins || [], allTasks, data.members || []);

            finishHouseholdProgress(householdProgress.done + " Regel" + (householdProgress.done === 1 ? "" : "n") + " geprüft");

            // The calendar file was written above BEFORE the detection - if new tasks
            // were just created in the process, they are still missing in that file. Now that everything needed
            // has been created, write the file a second time so that the app sees it immediately instead of
            // only on the next run.
            try {
                const result2 = syncSelectedCalendars(config.email, config.appPassword, namesToSync, path);
                console.log("[Kalender-Sync] Datei nach Haushalts-Erkennung aktualisiert: " + result2.eventCount + " Termine.");
            } catch (e2) {
                console.log("[Kalender-Sync] Fehler beim erneuten Schreiben nach Erkennung: " + e2.message);
            }
        } catch (e) {
            console.log("[Muell-Erkennung] Fehler: " + e.message);
            finishHouseholdProgress("Fehler: " + e.message);
        }
        ===== END COMMENTED OUT ===== */
    } catch (e) {
        setLastSync(familyId, false, e.message);
        console.log("[Kalender-Sync] Familie " + familyId + " - Fehler: " + e.message);
        plog("fehler", "sync", "Kalender-Sync fehlgeschlagen: " + e.message, { familie: familyId, details: e.body ? String(e.body).slice(0, 1500) : "" });
    }
}

// Updates ONLY the calendar file of a family (does not trigger the household detection) - for
// calls directly after creating/changing/deleting a single event, so that the display is
// up to date immediately.
function syncCalendarFileOnly(familyId) {
    syncFamily(familyId);
}

// Cron tick (every 15 min) and "Refresh now". With a family ID only that family, otherwise
// all families: with Apple ID and/or Google account -> sync, without -> empty the calendar file (no
// outbound access, no loading of the family data).
function runCronSync(familyId) {
    if (familyId) return syncFamily(familyId);
    let withCreds = [];
    try { withCreds = require(`${__hooks}/pinn-apple.js`).familiesWithCredentials(); } catch (e) { withCreds = []; }
    try {
        googleLib().familiesWithCredentials().forEach(id => { if (withCreds.indexOf(id) === -1) withCreds.push(id); });
    } catch (e) { /* Google not set up */ }
    let all = [];
    try { all = $app.findRecordsByFilter("familien", "", "", 0, 0).map(f => f.id); } catch (e) { all = []; }
    all.forEach(id => {
        if (withCreds.indexOf(id) !== -1) {
            syncFamily(id);
        } else {
            try {
                if (readCalendarText(id) !== EMPTY_ICS) writeEmptyCalendar(id);
            } catch (e) { /* does not matter */ }
        }
    });
}

// Escapes special characters for ICS text fields (backslash, semicolon, comma, line break) per RFC 5545.
function escapeICSText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Builds the VEVENT text from the app's form data. For iCloud deliberately "floating" local time
// (no Z, no TZID) instead of a full VTIMEZONE block - simpler and sufficient for our purpose,
// since both the app and iCloud assume the same system time.
// For Google, the time zone of the target calendar is passed along (tzid, e.g. "Europe/Berlin"), because
// Google may otherwise interpret times without a time zone differently depending on the calendar.
function buildVEventICS(uid, dtstampUtc, ev, tzid) {
    const tzParam = (tzid && /^[A-Za-z0-9_+\-\/]{2,64}$/.test(tzid)) ? ';TZID=' + tzid : '';
    const lines = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//pinn//DE');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + dtstampUtc);
    lines.push('SUMMARY:' + escapeICSText(ev.title));
    if (ev.allDay) {
        lines.push('DTSTART;VALUE=DATE:' + ev.startDate.replace(/-/g, ''));
        // DTEND is exclusive for all-day events (see the read side) - +1 day compared to the
        // last day chosen by the user.
        const endD = new Date(ev.endDate + 'T00:00:00');
        endD.setDate(endD.getDate() + 1);
        const pad = n => String(n).padStart(2, '0');
        const endStr = '' + endD.getFullYear() + pad(endD.getMonth() + 1) + pad(endD.getDate());
        lines.push('DTEND;VALUE=DATE:' + endStr);
    } else {
        lines.push('DTSTART' + tzParam + ':' + ev.startDate.replace(/-/g, '') + 'T' + ev.startTime.replace(':', '') + '00');
        lines.push('DTEND' + tzParam + ':' + ev.endDate.replace(/-/g, '') + 'T' + ev.endTime.replace(':', '') + '00');
    }
    if (ev.location) lines.push('LOCATION:' + escapeICSText(ev.location));
    if (ev.notes) lines.push('DESCRIPTION:' + escapeICSText(ev.notes));
    if (ev.url) lines.push('URL:' + ev.url);
    if (ev.repeat && ev.repeat !== 'none') {
        let rrule = 'FREQ=' + ev.repeat.toUpperCase();
        if (ev.repeatInterval && ev.repeatInterval > 1) rrule += ';INTERVAL=' + ev.repeatInterval;
        if (ev.repeatEnd === 'count' && ev.repeatCount) rrule += ';COUNT=' + ev.repeatCount;
        if (ev.repeatEnd === 'until' && ev.repeatUntil) rrule += ';UNTIL=' + ev.repeatUntil.replace(/-/g, '') + 'T000000Z';
        lines.push('RRULE:' + rrule);
    }
    if (ev.alert && ev.alert !== 'none') {
        lines.push('BEGIN:VALARM');
        lines.push('ACTION:DISPLAY');
        lines.push('DESCRIPTION:Erinnerung');
        lines.push('TRIGGER:-PT' + parseInt(ev.alert, 10) + 'M');
        lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

// The following three functions only work with fixed iCloud credentials and are kept for
// compatibility reasons. The endpoints use createEventForFamily / fetchRawEventForFamily /
// updateEventForFamily (above, section "Accounts"), which handle iCloud AND Google.

// Creates a new event FOR REAL in iCloud (not just on our side). Returns the newly assigned UID.
function createCalendarEvent(email, password, calendarName, ev) {
    return createEventInAccount(appleAccount(email, password), calendarName, ev);
}

// Loads the raw ICS text of a single event resource (for "Edit" - so that the app can read
// repeat/reminder/link and does not accidentally discard them when saving).
function fetchRawEvent(email, password, href) {
    return fetchRawEventInAccount(appleAccount(email, password), href);
}

// Updates an EXISTING event in iCloud (PUT to the same resource, same UID -
// this replaces its content instead of creating a new event).
function updateCalendarEvent(email, password, eventHref, uid, ev) {
    const acc = appleAccount(email, password);
    return updateEventAcrossAccounts(acc, acc, eventHref, uid, ev);
}

// Only the reminder lists (in case they are needed after all) - note: modern reminders as used in the app
// have NOT been reachable via CalDAV since iOS 13 (Apple moved them to a
// private CloudKit store). This function therefore usually only finds orphaned
// legacy lists, no really used current lists. In pinn, "tasks" therefore run via a
// normal (second) calendar instead of via reminders - see createCalendarEvent/updateCalendarEvent.

/* ===== COMMENTED OUT: tasks via the Apple tasks calendar =====
   Tasks now live in the PocketBase collection "aufgaben" (pinn-aufgaben.js).
   This block is only kept for safety in case the calendar variant is still needed.
// Deletes ALL tasks automatically generated by the household feature (cleanings/tidying/
// taking out bins) from the tasks calendar - recognised by the title prefix. Normal, manually
// created tasks stay untouched. Returns how many were deleted.
// Deletes - if present - TODAY's task with exactly this title (prefix comparison as
// usual, so that a backlog counter in the title does not interfere). Used when a rule is
// edited in a way that changes its title (e.g. a different category) - the old, now orphaned
// task from today should not simply stay around.
function deleteTodayHouseholdTask(email, password, taskCalendarName, baseTitle) {
    const now = new Date();
    const pad = n => String(n).padStart(2, "0");
    const todayIso = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());

    const { host, xmlHeaders, calendars } = discoverCalendarList(email, password);
    const taskCal = calendars.find(c => c.name === taskCalendarName);
    if (!taskCal) return false;

    const resources = downloadCalendarEvents(host, xmlHeaders, taskCal.href);
    let found = false;
    resources.forEach(res => {
        if (found) return;
        extractSimpleEventSummaries(res.veventBlocks).forEach(e => {
            if (found || e.date !== todayIso) return;
            if (stripDoneEmojiServer(e.title).indexOf(baseTitle) !== 0) return;
            try {
                $http.send({
                    url: resolveHref(host, res.href), method: "DELETE", timeout: 30,
                    headers: { "Authorization": xmlHeaders.Authorization },
                });
                found = true;
            } catch (e2) {
                console.log("[Haushalt-Aufgabe] Konnte veraltete Aufgabe nicht loeschen: " + e2.message);
            }
        });
    });
    return found;
}

function deleteHouseholdTasks(email, password, taskCalendarName, cleaningCategories) {
    setHouseholdProgress("Haushalts-Aufgaben werden gesucht", 0, 0);
    const { host, xmlHeaders, calendars } = discoverCalendarList(email, password);
    const taskCal = calendars.find(c => c.name === taskCalendarName);
    if (!taskCal) throw new Error('Aufgaben-Kalender "' + taskCalendarName + '" wurde nicht gefunden.');

    // The bin prefixes now differ per waste type ("Paper waste take-out:",
    // "Organic waste take-out:" etc.) - derive all variants from WASTE_TYPE_KEYWORDS_SERVER instead
    // of a single fixed text.
    const prefixes = (cleaningCategories || []).map(c => c.label + ':')
        .concat(WASTE_TYPE_KEYWORDS_SERVER.map(wt => wt.icon + ' ' + wt.taskLabel + ' rausbringen:'));
    const resources = downloadCalendarEvents(host, xmlHeaders, taskCal.href);

    // First determine ALL affected resources so that the total is known from the start
    // (for the live counter "X of Y deleted" in the settings).
    const toDelete = [];
    resources.forEach(res => {
        res.veventBlocks.forEach(block => {
            const lines = block.split(/\r\n|\r|\n/);
            let title = null;
            lines.forEach(line => {
                if (line.indexOf('SUMMARY:') === 0) title = line.slice('SUMMARY:'.length).trim();
            });
            if (title === null) return;
            if (prefixes.some(p => stripDoneEmojiServer(title).indexOf(p) === 0)) toDelete.push({ href: res.href, title: title });
        });
    });

    setHouseholdProgress("Haushalts-Aufgaben werden gelöscht", toDelete.length, 0);
    let deletedCount = 0;
    toDelete.forEach(item => {
        try {
            const delRes = $http.send({
                url: resolveHref(host, item.href), method: "DELETE", timeout: 30,
                headers: { "Authorization": xmlHeaders.Authorization },
            });
            if (delRes.statusCode === 204 || delRes.statusCode === 200 || delRes.statusCode === 404) deletedCount++;
        } catch (e) {
            console.log("[Haushalt-Aufraeumen] Fehler beim Loeschen von \"" + item.title + "\": " + e.message);
        }
        bumpHouseholdProgress();
    });
    finishHouseholdProgress(deletedCount + " von " + toDelete.length + " gelöscht");
    return deletedCount;
}

===== END COMMENTED OUT ===== */

module.exports = {
    discoverCalendars, syncSelectedCalendars, runCronSync, syncCalendarFileOnly, syncFamily, deleteCalendarEvent, createCalendarEvent, updateCalendarEvent, fetchRawEvent, parseRecordData, bytesToText,
    kalenderPfad, readCalendarText, writeEmptyCalendar, removeCalendarFile, LEGACY_KALENDER_FILE_PATH, EMPTY_ICS,
    getHouseholdProgress,
    // AUSGEKLAMMERT (Aufgaben-Kalender): deleteHouseholdTasks, deleteTodayHouseholdTask,
    getAppleCredentials, loadAppleConfig, stripAppleSecrets, getAppleStatus, getLastSync, MISSING_CREDENTIALS_MESSAGE, NO_ACCOUNT_MESSAGE,
    // iCloud + Google (Android)
    isGoogleHref, isGoogleCalendarName, createEventForFamily, updateEventForFamily, deleteEventForFamily,
    fetchRawEventForFamily, discoverCalendarsForFamily,
    // Account functions for personal accounts (private "only for me" calendars, pinn-kalender.js)
    appleAccount, downloadCalendarEvents, createEventInAccount, updateEventAcrossAccounts, deleteEventInAccount,
    fetchRawEventInAccount, resourceUrlFor, normUrl,
};
