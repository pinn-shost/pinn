// pb_hooks/calendar-sync.js
// Kein *.pb.js -> wird NICHT automatisch als Hook geladen, sondern nur per require() eingebunden.
// Enthält die komplette CalDAV-Logik als wiederverwendbare Funktionen - genutzt sowohl vom
// Kalenderlisten-Endpunkt (discover_calendars.pb.js) als auch vom Cron-Sync (cron_calendar.pb.js).
// Die Apple-Zugangsdaten liegen JE FAMILIE verschlüsselt in der gesperrten Sammlung "apple_zugaenge"
// (pinn-apple.js), siehe getAppleCredentials() weiter unten.
// Zusätzlich kann jede Familie ein Google-Konto (Android-Kalender) verbinden (pinn-google.js, Sammlung
// "google_zugaenge"). Die Konto-Funktionen (appleAccount, createEventInAccount …) nutzt außerdem
// pinn-kalender.js für eigene Kalender „Nur für mich“, die mit dem persönlichen iCloud-/Google-Konto
// eines Profils verknüpft sind (pinn-kalender-konten.js).
// Google spricht ebenfalls CalDAV - alle Termin-Funktionen arbeiten deshalb mit
// einem "Konto"-Objekt (siehe Abschnitt "Konten" weiter unten), egal ob iCloud oder Google.

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

// Schritt 1+2+3: Principal -> calendar-home-set -> Kalenderliste.
// Gibt { host, xmlHeaders, calendars: [{name, href}] } zurück oder wirft einen Error mit
// einer für Endnutzer verständlichen Meldung.
// Fragt ALLE Sammlungen im Konto ab (Kalender UND Erinnerungslisten laufen technisch über
// dasselbe CalDAV-Protokoll) und liest zusätzlich ab, ob eine Sammlung Termine (VEVENT) oder
// Erinnerungen (VTODO) enthält - damit wir beides sauber auseinanderhalten können, statt sie in
// einer Liste zu vermischen.
// Die Kalender-Suche (3 Anfragen an iCloud) ändert sich praktisch nie, lief aber bei JEDEM Vorgang
// (Abhaken, Bearbeiten, Anlegen, Sync) mehrfach. Ergebnis deshalb 10 Minuten im gemeinsamen
// App-Speicher von PocketBase merken. Die Einstellungen-Seite ("Kalender laden") fragt immer frisch.
// Die erzeugten Kalenderdateien (eine je Familie, siehe kalenderPfad()) liegen in pb_data (nicht
// öffentlich) und werden nur über die angemeldete Route /api/pinn/kalender (benutzer.pb.js) an die
// eigene Familie ausgeliefert.

// Byte-Array (z.B. von $os.readFile) in Text umwandeln: bevorzugt nativ, sonst per JavaScript.
function bytesToText(raw) {
    try {
        if (typeof toString === "function") {
            const t = toString(raw);
            if (typeof t === "string" && t.indexOf("[object") !== 0) return t;
        }
    } catch (e) { /* weiter mit JS-Variante */ }
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
        } catch (e) { /* ohne Cache weiter */ }
    }
    const fresh = discoverAllCollectionsUncached(email, password);
    try {
        $app.store().set(cacheKey, { ts: Date.now(), host: fresh.host, xmlHeaders: fresh.xmlHeaders, collections: fresh.collections });
    } catch (e) { /* Cache ist optional */ }
    return fresh;
}

function discoverAllCollectionsUncached(email, password) {
    // Einstiegspunkt für die Principal-Discovery. Der TATSÄCHLICHE Server für die Kalender
    // (z.B. p182 statt p102) wird danach automatisch aus der calendar-home-set-Antwort übernommen -
    // das muss man nicht mehr manuell herausfinden.
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

    // Schritt 2: calendar-home-set (liefert oft einen ANDEREN Host als ENTRY_HOST)
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

    // Schritt 3: alle Sammlungen im echten Ordner abfragen, inkl. unterstützter Komponenten-Art
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
            // Depth:1 liefert bei manchen Servern den abgefragten Ordner selbst mit zurück (hier
            // erkennbar am Namen des Kontos statt eines echten Kalender-/Listennamens) - das ist
            // keine echte Sammlung und muss rausgefiltert werden.
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

// Nur die Kalender (Termine, VEVENT) aus der Sammlung herausfiltern.
function discoverCalendarList(email, password, forceFresh) {
    const { host, xmlHeaders, collections } = discoverAllCollections(email, password, forceFresh);
    const calendars = collections.filter(c => c.supportsVevent).map(c => ({ name: c.name, href: c.href }));
    return { host, xmlHeaders, calendars };
}

// Nur die Erinnerungslisten (Aufgaben, VTODO) aus der Sammlung herausfiltern.
function discoverReminderLists(email, password) {
    const { host, xmlHeaders, collections } = discoverAllCollections(email, password);
    const lists = collections.filter(c => c.supportsVtodo).map(c => ({ name: c.name, href: c.href }));
    return { host, xmlHeaders, lists };
}

// Für den Einstellungen-Dialog: nur die Namen der verfügbaren Kalender.
function discoverCalendars(email, password) {
    const { calendars } = discoverCalendarList(email, password, true); // Einstellungen: immer frisch
    return calendars.map(c => c.name);
}

// Für den Einstellungen-Dialog: nur die Namen der verfügbaren Erinnerungslisten.
function discoverReminders(email, password) {
    const { lists } = discoverReminderLists(email, password);
    return lists.map(l => l.name);
}

// Lädt Termine und gibt sie GRUPPIERT NACH RESSOURCE zurück (href + die VEVENT-Blöcke darin) -
// wichtig, damit wir später gezielt genau DIESE eine Ressource in iCloud löschen können. Eine
// Ressource kann mehrere VEVENT-Blöcke enthalten (z.B. bei wiederkehrenden Terminen mit
// Ausnahme-Terminen), die teilen sich dann dieselbe href.
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
    // Grob nach einzelnen <d:response>-Blöcken aufteilen, damit href und calendar-data zusammenbleiben
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

// Für den Cron-Sync: lädt Termine aller AUSGEWÄHLTEN Kalender und schreibt sie zusammen in eine ICS-Datei.
// Jeder VEVENT-Block bekommt zusätzlich zwei eigene X-Properties (X-PINN-HREF, X-PINN-CALNAME)
// eingebettet - Standard-Kalenderprogramme ignorieren unbekannte X-Properties einfach, aber unsere
// eigene App liest sie aus: X-PINN-HREF, um zu wissen, welche iCloud-Ressource beim Bearbeiten/
// Abhaken/Löschen angesprochen werden muss, X-PINN-CALNAME, um Aufgaben vom Aufgaben-Kalender
// zu erkennen. NICHT entfernen - ohne diese Zeilen funktionieren Aufgaben und Bearbeiten nicht.
function syncSelectedCalendars(email, password, selectedNames, outputPath) {
    const result = { blocks: [], synced: [], skipped: [] };
    collectAccountBlocks(appleAccount(email, password), selectedNames, result);
    const finalIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + result.blocks.join("\r\n") + "\r\nEND:VCALENDAR\r\n";
    $os.writeFile(outputPath, finalIcs, 420);
    return { syncedCalendars: result.synced, eventCount: result.blocks.length, veventBlocks: result.blocks };
}

// Lädt die Termine der ausgewählten Kalender EINES Kontos (iCloud oder Google) und hängt sie mit
// X-PINN-HREF / X-PINN-CALNAME an result.blocks an. Bei Google werden einzelne Kalender, die sich
// grundsätzlich nicht per CalDAV lesen lassen (z. B. manche abonnierten Sonderkalender, Status
// 403/404/405), übersprungen statt den ganzen Abgleich abzubrechen. Netzwerk- oder Serverfehler
// brechen weiterhin ab - dann bleibt die bisherige Kalenderdatei stehen, statt Termine zu verlieren.
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
// Konten: iCloud (Apple-ID) und Google (Android)
// Ein Konto-Objekt { kind: "apple"|"google", host, xmlHeaders, calendars: [{name, href, timeZone}] }
// kapselt den Unterschied (Anmeldung per App-Passwort bzw. per Google-Zugriffsschlüssel, eigene
// Kalenderliste). Anlegen, Ändern, Löschen, Rohtext und Sync arbeiten nur noch mit diesem Objekt.
// Welches Konto zuständig ist, ergibt sich
//  - bei bestehenden Terminen aus der Adresse (X-PINN-HREF): Google-Termine liegen unter /caldav/v2/
//  - bei Kalendernamen am Zusatz " (Google)" (pinn-google.js)
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
// Konto zu einem bestehenden Termin (anhand seiner Adresse)
function accountForHref(familyId, href) {
    return isGoogleHref(href) ? googleAccountForFamily(familyId) : appleAccountForFamily(familyId);
}
// Konto zu einem Kalendernamen
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
// Adressen vergleichbar machen (Google liefert z. B. "@" mal als %40, mal direkt)
function normUrl(u) {
    let s = String(u || "");
    try { s = decodeURIComponent(s); } catch (e) { /* so lassen */ }
    return s.toLowerCase();
}
function utcStampNow() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) +
        'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
}
function newEventUid(ev) {
    // Die App kann die UID mitbringen (ev.clientUid, bei offline angelegten Terminen). Dann landet ein
    // erneut gesendeter Termin in derselben Ressource statt doppelt im Kalender.
    const clientUid = (ev && typeof ev.clientUid === 'string') ? ev.clientUid : '';
    return /^pinn-[A-Za-z0-9-]{4,80}$/.test(clientUid)
        ? clientUid
        : 'pinn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
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

// --- Termin-Funktionen je Konto ---

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
    // 404/410 = schon nicht mehr vorhanden -> für uns auch ein Erfolg (Ziel "ist weg" ist erreicht)
    if (res.statusCode !== 204 && res.statusCode !== 200 && res.statusCode !== 404 && res.statusCode !== 410) {
        if (acc.kind === "google" && googleLib().isApiDisabled(res.raw)) throw new Error(googleLib().CALDAV_DISABLED_MESSAGE);
        throw new Error("Löschen in " + providerLabel(acc) + " fehlgeschlagen (Status " + res.statusCode + ").");
    }
    console.log("[Kalender-Loeschen] Erfolgreich gelöscht.");
    return true;
}

// Aktualisiert einen bestehenden Termin. src = Konto, in dem der Termin liegt, dst = Konto des
// Zielkalenders (ev.calendarName). Gleicher Kalender: einfach überschreiben. Anderer Kalender (auch
// zwischen iCloud und Google): im Zielkalender neu anlegen (gleiche UID) und danach den alten löschen.
function updateEventAcrossAccounts(src, dst, eventHref, uid, ev) {
    const targetCal = calendarIn(dst, ev.calendarName);
    const targetCalUrl = collectionUrl(dst, targetCal);
    const oldFullUrl = resolveHref(src.host, eventHref);
    const icsBody = buildVEventICS(uid, utcStampNow(), ev, dst.kind === "google" ? targetCal.timeZone : "");
    const sameAccount = src.kind === dst.kind;

    if (sameAccount && normUrl(oldFullUrl).indexOf(normUrl(targetCalUrl)) === 0) {
        // Normalfall: Kalender bleibt gleich, Termin einfach überschreiben.
        try {
            putIcs(dst, oldFullUrl, icsBody);
        } catch (e) {
            throw new Error(e.status ? "Aktualisieren in " + providerLabel(dst) + " fehlgeschlagen (Status " + e.status + ")." : e.message);
        }
        return true;
    }

    // Kalender wurde geändert: CalDAV kennt kein direktes "Verschieben" zwischen Kalendern (und
    // schon gar nicht zwischen iCloud und Google) - deshalb im Zielkalender neu anlegen (gleiche UID)
    // und danach die alte Ressource im ursprünglichen Kalender löschen.
    const newUrl = resourceUrlFor(dst, targetCal, uid);
    try {
        putIcs(dst, newUrl, icsBody);
    } catch (e) {
        throw new Error(e.status ? "Verschieben fehlgeschlagen (Anlegen im neuen Kalender, Status " + e.status + ")." : e.message);
    }
    if (sameAccount && normUrl(newUrl) === normUrl(oldFullUrl)) return true; // Sicherheitsnetz: nie den gerade geschriebenen Termin löschen
    const deleteRes = sendDelete(src, oldFullUrl);
    if (deleteRes.statusCode !== 204 && deleteRes.statusCode !== 200 && deleteRes.statusCode !== 404 && deleteRes.statusCode !== 410) {
        throw new Error("Verschieben nur teilweise gelungen: im neuen Kalender angelegt, aber die alte Version im ursprünglichen Kalender konnte nicht gelöscht werden (Status " + deleteRes.statusCode + "). Bitte den alten Termin manuell im " + (src.kind === "google" ? "Google" : "Apple") + "-Kalender löschen.");
    }
    return true;
}

// --- Termin-Funktionen je Familie (wählen das passende Konto selbst) ---

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

// Alle Kalendernamen der Familie (iCloud + Google) für die Einstellungen. Ist nur eines der beiden
// Konten verbunden oder schlägt eines fehl, kommen die übrigen trotzdem - der Fehler steht in "warning".
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

/* ===== AUSGEKLAMMERT: Aufgaben über den Apple-Aufgaben-Kalender =====
   Aufgaben liegen jetzt in der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js).
   Dieser Block bleibt nur zur Sicherheit erhalten, falls die Kalender-Variante noch gebraucht wird.
// Gängige Müllarten (gespiegelt aus der App, da beide Seiten unabhängig laufen) - "keywords" dienen
// dazu, Abholtermine anhand ihres Titels im synchronisierten Kalender zu erkennen.
const WASTE_TYPE_KEYWORDS_SERVER = [
    { id: 'restmuell', label: 'Restmüll', icon: '\ud83d\uddd1\ufe0f', taskLabel: 'Restmüll', keywords: ['restmüll', 'restabfall', 'restmülltonne', 'hausmüll'] },
    { id: 'biomuell', label: 'Biomüll', icon: '\ud83c\udf42', taskLabel: 'Biomüll', keywords: ['biomüll', 'bioabfall', 'biotonne'] },
    { id: 'papier', label: 'Papier/Pappe', icon: '\ud83d\udce6', taskLabel: 'Papiermüll', keywords: ['papier', 'pappe', 'papiertonne'] },
    { id: 'gelbersack', label: 'Gelber Sack / Verpackungen', icon: '\u267b\ufe0f', taskLabel: 'Gelber Sack', keywords: ['gelber sack', 'gelbe tonne', 'verpackung', 'wertstoff'] },
    { id: 'glas', label: 'Glas', icon: '\ud83c\udf7e', taskLabel: 'Altglas', keywords: ['glas', 'altglas'] },
];

// Liest aus rohen VEVENT-Blöcken Titel+Datum NICHT wiederkehrender Termine heraus (für einfache,
// je Tag einzeln eingetragene Termine, wie sie kommunale Abfuhrkalender typischerweise liefern).
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
        if (hasRrule) return; // wiederkehrende Termine hier bewusst nicht berücksichtigen
        if (summary !== null && dtstartRaw) {
            results.push({
                title: summary.trim(),
                date: dtstartRaw.slice(0, 4) + '-' + dtstartRaw.slice(4, 6) + '-' + dtstartRaw.slice(6, 8),
                // Zeitpunkt der letzten Änderung - beim Abhaken schreibt die App den Termin neu, damit
                // ist das der Erledigt-Zeitpunkt (Grundlage fürs automatische Löschen).
                changedRaw: lastModifiedRaw || dtstampRaw,
            });
        }
    });
    return results;
}

===== ENDE AUSGEKLAMMERT ===== */

// Emoji-Praefix fuer erledigte Aufgaben (muss zum Client-seitigen DONE_EMOJI passen).
// Einfacher Fortschritts-Zustand fuer lang laufende Haushalts-Operationen (Löschen/Neu-Generieren),
// damit die Einstellungen-Seite per Abfrage einen Live-Zähler anzeigen kann. Lebt nur im
// Server-Prozess-Speicher (kein DB-Feld noetig) - geht bei einem Neustart verloren, was fuer eine
// laufende Operation ohnehin bedeutungslos waere.
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

/* ===== AUSGEKLAMMERT: Aufgaben über den Apple-Aufgaben-Kalender =====
   Aufgaben liegen jetzt in der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js).
   Dieser Block bleibt nur zur Sicherheit erhalten, falls die Kalender-Variante noch gebraucht wird.
const DONE_EMOJI_SERVER = "\u2705 ";
function stripDoneEmojiServer(title) {
    return title.indexOf(DONE_EMOJI_SERVER) === 0 ? title.slice(DONE_EMOJI_SERVER.length) : title;
}

// Laedt ALLE Termine (Titel+Datum+href) aus dem Aufgaben-Kalender - Basis fuer die
// Haushalts-Aufgaben-Erzeugung unten (einmal pro Cron-Durchlauf geladen, nicht pro Regel).
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

// Legt fuer eine faellige Haushalts-Regel (Reinigung/Muelleimer) GENAU EINE Aufgabe pro Zyklus an -
// kein Aufstapeln mehrerer offener Aufgaben. Wurde die vorherige Aufgabe bis zur Frist (Tagesende
// + 4 Stunden, d.h. 4 Uhr morgens des Folgetags) nicht erledigt, wird sie geloescht und durch die
// neue ersetzt, dabei zaehlt ein Rueckstands-Counter im Titel mit ("(2x nicht erledigt)").
// Baut die "Zugewiesen: Name, Name"-Notizzeile aus gespeicherten Mitglieds-IDs - identische
// Konvention wie clientseitig bei normalen Terminen (index.html), damit die App die Zuweisung
// beim Anzeigen/Filtern genauso erkennt. Keine (oder keine mehr gültigen) IDs -> "Alle", damit die
// Aufgabe nicht verschwindet, wenn man nach einer bestimmten Person filtert.
function buildAssignedNotesServer(assignedMemberIds, membersList) {
    const labels = (assignedMemberIds || []).map(id => {
        const m = (membersList || []).find(mm => mm.id === id);
        if (!m) return null;
        return (m.displayMode === "role" && m.role) ? m.role : m.name;
    }).filter(Boolean);
    return "Zugewiesen: " + (labels.length ? labels.join(", ") : "Alle");
}

// Wandelt einen ICS-Zeitstempel (z.B. "20260922T205211Z") in Millisekunden um.
function icsStampToMs(raw) {
    const m = (raw || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!m) return null;
    if (m[7] === "Z") return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

// Löscht erledigte (✅) Aufgaben aus iCloud, sobald sie laut Einstellung lange genug erledigt sind
// (0 = sofort, 1 oder 2 Tage). Nutzt die ohnehin geladene Aufgabenliste - KEIN zusätzlicher Download.
// WICHTIG: Aufgaben mit dem Datum von HEUTE werden nie gelöscht, auch nicht bei "Sofort". Die
// Haushalts-Erkennung erkennt an genau dieser erledigten Aufgabe, dass die heutige Reinigung schon
// erledigt ist - wäre sie weg, würde sie beim nächsten Durchlauf sofort neu angelegt. Bei "Sofort"
// blendet die App erledigte Aufgaben deshalb direkt aus, gelöscht werden sie am Folgetag.
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
    if (matching.some(t => t.date === todayIso)) return; // fuer heute existiert schon eine (Duplikat-Schutz)

    // Notbremse: sollte der Duplikat-Schutz aus irgendeinem Grund nicht greifen (wird gerade
    // untersucht), lieber NICHTS weiter anlegen, als den Kalender mit Dutzenden Kopien zu fluten.
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
            deadline.setDate(deadline.getDate() + 1); // Tagesende + 4h = 4 Uhr des Folgetags
            if (new Date() < deadline) return; // Frist der vorherigen Aufgabe laeuft noch - abwarten
            const counterMatch = stripDoneEmojiServer(last.title).match(/\((\d+)x nicht erledigt\)$/);
            missCount = counterMatch ? parseInt(counterMatch[1], 10) + 1 : 1;
            try {
                deleteCalendarEvent(config.email, config.appPassword, last.href);
                const idx = allTasks.indexOf(last);
                if (idx !== -1) allTasks.splice(idx, 1); // Live-Stand aktualisieren, damit nachfolgende Regeln im selben Durchlauf das sehen
            } catch (e) {
                console.log("[Haushalt-Aufgabe] Konnte ueberfaellige Aufgabe nicht loeschen: " + e.message);
            }
        }
        // war sie erledigt: missCount bleibt 0, ganz normal neu anlegen
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
        allTasks.push({ title, date: todayIso, href: null }); // Live-Stand aktualisieren (href unbekannt, wird beim naechsten echten Sync nachgeladen)
        console.log("[Haushalt-Aufgabe] Angelegt: " + title);
    } catch (e) {
        console.log("[Haushalt-Aufgabe] Fehler beim Anlegen (" + title + "): " + e.message);
    }
}

// Prueft, ob morgen laut Kalender eine Muelltonnen-Abholung ansteht (anhand des Termin-Titels), und
// legt dafuer - pro betroffenem Muelleimer - eine Aufgabe "Muelleimer rausbringen: <Raum>
// (<Muellart>)" fuer HEUTE an (ueber processHouseholdSchedule, also mit Rueckstands-Zaehler statt
// Aufstapeln, falls die letzte noch offen war).
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

const WEEKDAY_IDS_SERVER = ["so", "mo", "di", "mi", "do", "fr", "sa"]; // Index entspricht JS Date.getDay() (0=Sonntag)

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

// Legt fuer jede faellige Raum-Reinigung (Wochentage- oder Intervall-Regel) eine Aufgabe
// "<Kategorie>: <Raum>" an - ueber processHouseholdSchedule (genau eine pro Zyklus, mit
// Rueckstands-Zaehler statt Aufstapeln).
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

// Legt fuer Muelleimer mit manuell gesetztem Rausbring-Rhythmus (Wochentage/Intervall) dieselbe
// Aufgabe an wie die automatische Abholungs-Erkennung (gleicher Titel -> derselbe
// Rueckstands-Mechanismus wirkt fuer beide Ausloeser gemeinsam).
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

===== ENDE AUSGEKLAMMERT ===== */

// Löscht einen Termin WIRKLICH in iCloud (nicht nur bei uns). Bei wiederkehrenden Terminen wird
// die komplette Ressource gelöscht - das entfernt die GESAMTE Serie, nicht nur einen einzelnen Tag
// daraus (das wäre ein größeres, separates Feature). Die App warnt den Nutzer vorher entsprechend.
// (Nur noch für iCloud mit festen Zugangsdaten - die Endpunkte nutzen deleteEventForFamily.)
function deleteCalendarEvent(email, password, eventHref) {
    console.log("[Kalender-Loeschen] Angefragt für href: " + eventHref);
    return deleteEventInAccount(appleAccount(email, password), eventHref);
}

// Für den Cron-Job: liest die Zugangsdaten/Auswahl direkt aus PocketBase und synct.
// WICHTIG: muss hier im Modul stehen und nicht als Top-Level-Funktion in cron_calendar.pb.js,
// da onBootstrap/cronAdd-Handler jeweils in einer isolierten Umgebung laufen und keine
// Top-Level-Funktionen aus derselben .pb.js-Datei sehen (siehe bereits bekannter Bug).
// Wandelt ein UTF-8-Byte-Array (so liefert record.get() JSON-Felder in dieser PocketBase-Version -
// als Zahlen-Array der Rohbytes, nicht als String oder fertiges Objekt) korrekt in einen JS-String
// um, inkl. mehrbytiger Zeichen wie Umlaute und Emojis.
// Dekodiert das Byte-Array des JSON-Felds zu einem String. WICHTIG: Zeichen werden erst in Blöcken
// gesammelt und dann einmal zusammengefügt - NICHT per "result += ..." Zeichen für Zeichen. Das
// alte Vorgehen hatte quadratische Laufzeit: Seit die Familiendaten durch Rezeptfotos mehrere MB
// groß sind, hing jeder Sync (und jeder Endpunkt, der die Daten liest) minutenlang bei 99 % CPU.
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
        // Byte-Array. Bevorzugt PocketBases eingebaute toString()-Hilfe (läuft nativ in Go und ist
        // um ein Vielfaches schneller als das Dekodieren Byte für Byte in JavaScript - wichtig, weil
        // die Familiendaten durch Rezeptfotos mehrere MB groß sind und bei jedem Vorgang gelesen
        // werden). Nur wenn die Hilfe fehlt oder etwas Unerwartetes liefert, greift die JS-Variante.
        try {
            if (typeof toString === "function") {
                const text = toString(raw);
                if (typeof text === "string" && text.charAt(0) === "{") return JSON.parse(text);
            }
        } catch (e) { /* weiter mit der JS-Variante */ }
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
// Apple-Zugangsdaten JE FAMILIE. Sie liegen verschlüsselt in der gesperrten Sammlung
// "apple_zugaenge" (siehe pinn-apple.js) - nie in familien_daten, nie im Browser.
// Jede Familie hat ihre eigene Kalenderdatei (pb_data/pinn_kalender_<Familien-ID>.ics).
// ---------------------------------------------------------------------------------------------
const LEGACY_KALENDER_FILE_PATH = "/pb_data/pinn_kalender.ics"; // bisherige gemeinsame Datei (wird beim Start entfernt)
const EMPTY_ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

// Pfad der Kalenderdatei einer Familie ("" bei ungültiger ID - dann wird nichts geschrieben)
function kalenderPfad(familyId) {
    const id = String(familyId || "");
    return /^[a-z0-9]{15}$/.test(id) ? "/pb_data/pinn_kalender_" + id + ".ics" : "";
}

// Kalenderdatei einer Familie als Text ("" wenn noch nicht vorhanden)
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
    if (path) try { $os.remove(path); } catch (e) { /* nicht vorhanden */ }
}

function getAppleCredentials(familyId) {
    return require(`${__hooks}/pinn-apple.js`).getCredentials(familyId);
}

// Entfernt Zugangsdaten aus einem Familiendaten-Objekt (in place). Gibt true zurück, wenn etwas
// entfernt wurde.
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

// Liest Familiendaten + Kalenderauswahl EINER Familie und ergänzt deren Zugangsdaten.
// config enthält danach wie gewohnt email/appPassword - alle Aufrufer können unverändert damit
// arbeiten. Wirft keinen Fehler, wenn der Datensatz fehlt.
function loadAppleConfig(familyId) {
    let data = {};
    try {
        if (familyId) {
            const record = $app.findFirstRecordByFilter("familien_daten", "familie = {:f}", { f: String(familyId) });
            data = parseRecordData(record.get("data")) || {};
        }
    } catch (e) { data = {}; }
    const creds = getAppleCredentials(familyId);
    const stored = (data && data.appleCalendar && typeof data.appleCalendar === "object") ? data.appleCalendar : {};
    const config = Object.assign({}, stored, { email: creds.email, appPassword: creds.appPassword });
    return { data: data, config: config, configured: creds.configured, error: creds.error || "" };
}

const MISSING_CREDENTIALS_MESSAGE = "Für deine Familie ist noch keine Apple-ID hinterlegt (Einstellungen → Kalender → Bearbeiten).";
const NO_ACCOUNT_MESSAGE = "Für deine Familie ist noch kein Kalender verbunden – unter Einstellungen → Kalender → Bearbeiten eine Apple-ID hinterlegen oder ein Google-Konto verbinden.";

// Ergebnis des letzten Syncs je Familie - im gemeinsamen Server-Speicher (gilt für alle Hook-Umgebungen),
// für die Statusanzeige in den Einstellungen.
function setLastSync(familyId, ok, message) {
    try { $app.store().set("pinnAppleSync:" + familyId, { at: new Date().toISOString(), ok: ok, message: message || "" }); } catch (e) { /* egal */ }
}
function getLastSync(familyId) {
    try {
        const s = $app.store().get("pinnAppleSync:" + familyId);
        if (s && s.at) return { at: String(s.at), ok: s.ok, message: String(s.message || "") };
    } catch (e) { /* egal */ }
    return { at: "", ok: null, message: "" };
}

// Status für die Einstellungen (ohne Passwort!).
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

// E-Mail-Adressen in Logs nur gekürzt ausgeben (z.B. "name@example.com" -> "na***@***"), damit
// Logs gefahrlos geteilt werden können.
function maskEmail(email) {
    const s = String(email || "");
    const at = s.indexOf("@");
    if (at < 1) return "***";
    return s.slice(0, Math.min(2, at)) + "***@***";
}

// Kalenderdatei EINER Familie neu schreiben - aus iCloud UND Google (je nachdem, was verbunden und
// ausgewählt ist), bzw. leeren, wenn nichts verbunden oder keine Kalender ausgewählt sind.
// Schlägt der Abruf fehl, bleibt die bisherige Datei stehen. Die Haushalts-Erkennung läuft nicht
// hier (siehe pinn-aufgaben.js).
// Admin-Fehlerprotokoll (pinn-protokoll.js) – fehlt die Datei, bleibt es beim Docker-Log
function plog(art, bereich, meldung, opts) {
    try { require(`${__hooks}/pinn-protokoll.js`)[art](bereich, meldung, opts || {}); } catch (e) { /* Protokoll nicht verfügbar */ }
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
        // AUSGEKLAMMERT: Aufgaben laufen nicht mehr über den Aufgaben-Kalender (siehe pinn-aufgaben.js).
        // const hasTaskCalendar = config.taskCalendarName;

        if (!configured && !googleConnected) {
            // Kein Konto verbunden: Kalenderdatei leeren, statt veraltete Termine stehen zu lassen.
            $os.writeFile(path, EMPTY_ICS, 420);
            setLastSync(familyId, false, error || MISSING_CREDENTIALS_MESSAGE);
            return;
        }
        if (!selected.length) {
            // Keine Kalender ausgewählt (z.B. nach "Auswahl zurücksetzen")
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
        if (googleConnected && googleNames.length) { try { google.clearError(familyId); } catch (e) { /* egal */ } }
        console.log("[Kalender-Sync] Familie " + familyId + " erfolgreich: " + result.synced.join(", ") + " (" + result.blocks.length + " Termine)");
        plog("behoben", "sync", familyId);
        if (result.skipped.length) plog("warnung", "sync", "Kalender-Sync: nicht lesbar und übersprungen: " + result.skipped.join(", "), { familie: familyId });

        /* ===== AUSGEKLAMMERT: Haushalts-Erkennung über den Aufgaben-Kalender (jetzt pinn-aufgaben.js) =====
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

            // Grobe Gesamtzahl fuer den Live-Zähler ermitteln (Reinigungen + Mülleimer-Zeitpläne,
            // die heute fällig sind - die Mülltonnen-Abholungserkennung ist unabhängig vom Datum
            // eines gespeicherten Zeitplans und wird hier bewusst nicht mitgezählt).
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

            // Die Kalenderdatei wurde oben VOR der Erkennung geschrieben - falls dabei gerade neue
            // Aufgaben angelegt wurden, fehlen die in dieser Datei noch. Jetzt, wo alles Nötige
            // angelegt ist, die Datei ein zweites Mal schreiben, damit die App sie sofort sieht statt
            // erst beim naechsten Durchlauf.
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
        ===== ENDE AUSGEKLAMMERT ===== */
    } catch (e) {
        setLastSync(familyId, false, e.message);
        console.log("[Kalender-Sync] Familie " + familyId + " - Fehler: " + e.message);
        plog("fehler", "sync", "Kalender-Sync fehlgeschlagen: " + e.message, { familie: familyId, details: e.body ? String(e.body).slice(0, 1500) : "" });
    }
}

// Aktualisiert NUR die Kalenderdatei einer Familie (kein Auslösen der Haushalts-Erkennung) - für
// Aufrufe direkt nach Anlegen/Ändern/Löschen eines einzelnen Termins, damit die Anzeige sofort
// aktuell ist.
function syncCalendarFileOnly(familyId) {
    syncFamily(familyId);
}

// Cron-Takt (alle 15 Min.) und "Jetzt aktualisieren". Mit Familien-ID nur diese Familie, sonst
// alle Familien: mit Apple-ID und/oder Google-Konto -> Abgleich, ohne -> Kalenderdatei leeren (kein
// Zugriff nach außen, kein Laden der Familiendaten).
function runCronSync(familyId) {
    if (familyId) return syncFamily(familyId);
    let withCreds = [];
    try { withCreds = require(`${__hooks}/pinn-apple.js`).familiesWithCredentials(); } catch (e) { withCreds = []; }
    try {
        googleLib().familiesWithCredentials().forEach(id => { if (withCreds.indexOf(id) === -1) withCreds.push(id); });
    } catch (e) { /* Google nicht eingerichtet */ }
    let all = [];
    try { all = $app.findRecordsByFilter("familien", "", "", 0, 0).map(f => f.id); } catch (e) { all = []; }
    all.forEach(id => {
        if (withCreds.indexOf(id) !== -1) {
            syncFamily(id);
        } else {
            try {
                if (readCalendarText(id) !== EMPTY_ICS) writeEmptyCalendar(id);
            } catch (e) { /* egal */ }
        }
    });
}

// Escaped Sonderzeichen für ICS-Textfelder (Backslash, Semikolon, Komma, Zeilenumbruch) nach RFC 5545.
function escapeICSText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Baut den VEVENT-Text aus den Formular-Daten der App. Für iCloud bewusst "floating" lokale Zeit
// (kein Z, kein TZID) statt eines vollen VTIMEZONE-Blocks - einfacher und für unseren Zweck
// ausreichend, da sowohl die App als auch iCloud dieselbe Systemzeit annehmen.
// Für Google wird die Zeitzone des Zielkalenders mitgegeben (tzid, z. B. "Europe/Berlin"), weil
// Google Zeiten ohne Zeitzone sonst je nach Kalender anders deuten kann.
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
        // DTEND ist bei ganztägigen Terminen exklusiv (s. Lese-Seite) - +1 Tag gegenüber dem
        // vom Nutzer gewählten letzten Tag.
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

// Die folgenden drei Funktionen arbeiten nur mit festen iCloud-Zugangsdaten und bleiben aus
// Kompatibilitätsgründen erhalten. Die Endpunkte nutzen createEventForFamily / fetchRawEventForFamily /
// updateEventForFamily (oben, Abschnitt "Konten"), die iCloud UND Google beherrschen.

// Legt einen neuen Termin WIRKLICH in iCloud an (nicht nur bei uns). Gibt die neu vergebene UID zurück.
function createCalendarEvent(email, password, calendarName, ev) {
    return createEventInAccount(appleAccount(email, password), calendarName, ev);
}

// Lädt den rohen ICS-Text einer einzelnen Termin-Ressource (für "Bearbeiten" - damit die App
// Wiederholung/Erinnerung/Link auslesen und beim Speichern nicht versehentlich verwerfen kann).
function fetchRawEvent(email, password, href) {
    return fetchRawEventInAccount(appleAccount(email, password), href);
}

// Aktualisiert einen BESTEHENDEN Termin in iCloud (PUT auf dieselbe Ressource, dieselbe UID -
// das ersetzt seinen Inhalt, statt einen neuen Termin anzulegen).
function updateCalendarEvent(email, password, eventHref, uid, ev) {
    const acc = appleAccount(email, password);
    return updateEventAcrossAccounts(acc, acc, eventHref, uid, ev);
}

// Nur die Erinnerungslisten (falls doch mal gebraucht) - Achtung: moderne, in der App genutzte
// Erinnerungen sind seit iOS 13 NICHT mehr über CalDAV erreichbar (Apple hat sie auf einen
// privaten CloudKit-Speicher umgestellt). Diese Funktion findet daher i.d.R. nur verwaiste
// Alt-Listen, keine echten aktuell genutzten Listen. "Aufgaben" laufen deshalb in pinn über einen
// normalen (zweiten) Kalender statt über Erinnerungen - siehe createCalendarEvent/updateCalendarEvent.

/* ===== AUSGEKLAMMERT: Aufgaben über den Apple-Aufgaben-Kalender =====
   Aufgaben liegen jetzt in der PocketBase-Sammlung "aufgaben" (pinn-aufgaben.js).
   Dieser Block bleibt nur zur Sicherheit erhalten, falls die Kalender-Variante noch gebraucht wird.
// Löscht ALLE vom Haushalt-Feature automatisch erzeugten Aufgaben (Reinigungen/Aufräumen/
// Mülleimer-rausbringen) aus dem Aufgaben-Kalender - erkannt am Titel-Präfix. Normale, manuell
// angelegte Aufgaben bleiben unangetastet. Gibt zurück, wie viele gelöscht wurden.
// Löscht - falls vorhanden - die HEUTIGE Aufgabe mit genau diesem Titel (Präfix-Vergleich wie
// sonst auch, damit ein Rückstands-Zähler im Titel nicht stört). Wird genutzt, wenn eine Regel so
// bearbeitet wird, dass sich ihr Titel ändert (z.B. andere Kategorie) - die alte, jetzt verwaiste
// Aufgabe von heute soll nicht einfach liegen bleiben.
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

    // Die Mülleimer-Präfixe sind jetzt je Müllart unterschiedlich ("Papiermüll rausbringen:",
    // "Biomüll rausbringen:" usw.) - alle Varianten aus WASTE_TYPE_KEYWORDS_SERVER ableiten, statt
    // eines einzelnen festen Textes.
    const prefixes = (cleaningCategories || []).map(c => c.label + ':')
        .concat(WASTE_TYPE_KEYWORDS_SERVER.map(wt => wt.icon + ' ' + wt.taskLabel + ' rausbringen:'));
    const resources = downloadCalendarEvents(host, xmlHeaders, taskCal.href);

    // Erst ALLE betroffenen Ressourcen ermitteln, damit die Gesamtzahl von Anfang an feststeht
    // (fuer den Live-Zähler "X von Y gelöscht" in den Einstellungen).
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

===== ENDE AUSGEKLAMMERT ===== */

module.exports = {
    discoverCalendars, syncSelectedCalendars, runCronSync, syncCalendarFileOnly, syncFamily, deleteCalendarEvent, createCalendarEvent, updateCalendarEvent, fetchRawEvent, parseRecordData, bytesToText,
    kalenderPfad, readCalendarText, writeEmptyCalendar, removeCalendarFile, LEGACY_KALENDER_FILE_PATH, EMPTY_ICS,
    getHouseholdProgress,
    // AUSGEKLAMMERT (Aufgaben-Kalender): deleteHouseholdTasks, deleteTodayHouseholdTask,
    getAppleCredentials, loadAppleConfig, stripAppleSecrets, getAppleStatus, getLastSync, MISSING_CREDENTIALS_MESSAGE, NO_ACCOUNT_MESSAGE,
    // iCloud + Google (Android)
    isGoogleHref, isGoogleCalendarName, createEventForFamily, updateEventForFamily, deleteEventForFamily,
    fetchRawEventForFamily, discoverCalendarsForFamily,
    // Konto-Funktionen für persönliche Konten (eigene Kalender „Nur für mich“, pinn-kalender.js)
    appleAccount, downloadCalendarEvents, createEventInAccount, updateEventAcrossAccounts, deleteEventInAccount,
    fetchRawEventInAccount, resourceUrlFor, normUrl,
};
