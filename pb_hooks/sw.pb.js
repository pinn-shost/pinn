// pb_hooks/sw.pb.js
// Liefert den Service Worker von pinn. unter /sw.js direkt aus PocketBase aus - mit korrektem
// JavaScript-Typ, ohne Zwischenspeicher und mit "Service-Worker-Allowed: /".
// Damit hängt der Service Worker nicht mehr davon ab, ob pb_public/sw.js vorhanden ist bzw. vom
// statischen Datei-Server / Reverse-Proxy richtig ausgeliefert wird (iOS meldete sonst
// "Script https://…/sw.js load failed").
// Diese Route hat Vorrang vor der Datei pb_public/sw.js.
//
// Aufgaben des Service Workers:
//  1. Offline-Start: Die App-Seite (index.html), Symbole, Manifest, Schriften und die selbst
//     gehosteten Bibliotheken unter /vendor/ (pinn.css, PocketBase-Client, pdf.js) werden auf dem
//     Gerät vorgehalten. Code von fremden Servern (CDNs) lädt und speichert pinn. nicht mehr –
//     alte CDN-Einträge im Speicher werden beim Aktualisieren entfernt. Die Seite selbst wird immer
//     zuerst frisch vom Server geholt (Updates kommen sofort an) - nur ohne Verbindung bzw. wenn der
//     Server nicht antwortet, startet pinn. mit der zuletzt geladenen Version.
//     Rezeptbilder (/api/files/...) werden nach dem ersten Anzeigen ebenfalls vorgehalten, ebenso die
//     gewählte Sprachdatei (/lang/<code>.js). Die App-Dateien unter /js/ (ab 1.40 aus der index.html
//     ausgelagert) werden mit jeder frisch geladenen App-Seite gleich mit vorgehalten, alte Fassungen
//     danach aus dem Speicher entfernt. pdf.js (groß, nur beim PDF-Import gebraucht) wird erst
//     beim ersten Benutzen vorgehalten, nicht schon bei der Installation.
//     Alle anderen Server-Aufrufe (/api/...) laufen unverändert direkt zum Server - Daten, die offline
//     angelegt werden, sichert die App selbst und trägt sie nach.
//  2. Push-Benachrichtigungen:
//     SOS (Tag „sos-…“): bleibt stehen bis zur Reaktion, vibriert lang, meldet sich erneut und
//     sagt geöffneten Fenstern sofort Bescheid (Popup mit Karte und Notruf).
//     Jede Mitteilung sagt geöffneten Fenstern Bescheid („pinn-push“), damit die 🔔 Glocke sie sofort
//     zeigt; ein Tipp auf die Mitteilung öffnet in einem offenen Fenster direkt die passende Stelle.
//     Die Texte kommen schon in der Sprache des Profils (pinn-pushtext.js); ist keine Nachricht
//     abholbar, zeigt der Worker einen allgemeinen Hinweis in dieser Sprache.
//  3. App-Badge: Beim Abholen einer Meldung liefert der Server die Zahl der offenen, fälligen
//     Aufgaben des Profils mit ("badge"); der Worker setzt sie am App-Symbol (iPhone, Computer).
//     Android zeigt stattdessen einen Punkt am App-Symbol, solange eine Mitteilung offen ist.
//  4. Statusleisten-Symbol für Android: /pinn-badge.png (weiße Pinnnadel auf durchsichtigem
//     Grund) wird ebenfalls von dieser Datei ausgeliefert. Android zeigt dort nur die Umrisse eines
//     Bildes - ein farbiges Symbol würde als weißes Quadrat erscheinen.
// Tauscht der Browser die Push-Adresse aus, meldet der Worker das Gerät selbst neu an
// (pushsubscriptionchange -> /api/pinn/push/abo-erneuern).
// Der Server schickt einen inhaltslosen Weckruf; der Text wird mit der geheimen Geräte-Adresse
// (endpoint) bei /api/pinn/push/abholen abgeholt und dann angezeigt.

routerAdd("GET", "/sw.js", (e) => {
    const code = `// pinn. Service Worker (ausgeliefert von pb_hooks/sw.pb.js)
const META_CACHE = 'pinn-push-meta';
const META_URL = '/__pinn-push-endpoint';

// ---------- Offline-Start ----------
const SHELL_CACHE = 'pinn-app-v3'; // v3: /vendor/ statt CDN – alter Speicher wird verworfen
const IMG_CACHE = 'pinn-bilder-v1';
const OWN_CACHES = [SHELL_CACHE, IMG_CACHE, META_CACHE, 'pinn-daten'];
const SHELL_URL = '/';
const STATIC_FILES = ['/manifest.json', '/apple-touch-icon.png', '/favicon-32x32.png', '/favicon-16x16.png', '/pinn-logo.png', '/pinn-badge.png'];
// Selbst gehostete Bibliotheken (pb_public/vendor/) – bei der Installation vorgehalten
const VENDOR_FILES = ['/vendor/pinn.css', '/vendor/pocketbase/pocketbase.umd.js'];
// Nur noch Schriften kommen von außen (kein Code)
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_IMAGES = 400;

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const own = [SHELL_URL].concat(STATIC_FILES, VENDOR_FILES).map(u => fetch(u, { cache: 'no-store', credentials: 'same-origin' })
    .then(r => (r && r.ok ? cache.put(u, r) : null)).catch(() => null));
  await Promise.all(own);
  const shell = await cache.match(SHELL_URL);
  if (shell) await cacheAppScripts(shell);
}

// App-Dateien unter /js/ (in der App-Seite als <script src="js/…?v=…">): alle, die die frisch
// geladene Seite nennt, gleich mit vorhalten – damit startet pinn. auch offline vollständig.
// Fassungen, die die aktuelle Seite nicht mehr nennt, werden aus dem Speicher entfernt.
async function cacheAppScripts(res) {
  try {
    const html = await res.text();
    const urls = html.split('src="js/').slice(1).map(part => new URL('js/' + part.split('"')[0], self.location.origin + '/').href);
    if (!urls.length) return;
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(urls.map(async (u) => {
      if (await cache.match(u)) return;
      const r = await fetch(u, { cache: 'no-store', credentials: 'same-origin' });
      if (r && r.ok) await cache.put(u, r);
    }));
    const keys = await cache.keys();
    await Promise.all(keys.filter(k => new URL(k.url).pathname.indexOf('/js/') === 0 && urls.indexOf(k.url) === -1).map(k => cache.delete(k)));
  } catch (e) { /* beim nächsten Laden erneut */ }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache().catch(() => { /* beim nächsten Start erneut */ }));
});
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.indexOf('pinn-') === 0 && OWN_CACHES.indexOf(k) === -1).map(k => caches.delete(k)));
  } catch (e) { /* egal */ }
  await self.clients.claim();
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) await rememberEndpoint(sub.endpoint);
  } catch (e) { /* egal */ }
})()));

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// App-Seite: immer zuerst frisch vom Server, ohne Verbindung die zuletzt geladene Version
async function appShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const network = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(res => {
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 0));
    cache.put(SHELL_URL, res.clone()).catch(() => { /* egal */ });
    cacheAppScripts(res.clone());
    return res;
  });
  network.catch(() => { /* wird unten behandelt */ });
  try {
    return await withTimeout(network, 8000);
  } catch (e) {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    try { return await network; } catch (e2) { /* nichts vorhanden */ }
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>pinn.</title>' +
      '<body style="font-family:system-ui;padding:2rem;text-align:center;color:#2F4B41;background:#F6F3EC">' +
      '<h2>pinn. ist gerade nicht erreichbar</h2><p>Bitte Verbindung prüfen und erneut öffnen.</p></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// Symbole, Schriften, Skripte: sofort aus dem Speicher, im Hintergrund auffrischen
async function staleWhileRevalidate(event, key) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(key);
  const network = fetch(event.request).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone()).catch(() => { /* egal */ });
    return res;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || new Response('', { status: 504 });
}

// Rezeptbilder ändern sich unter derselben Adresse nie - einmal geladen, bleiben sie offline sichtbar
async function cacheFirstImage(event) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(event.request.url);
  if (cached) return cached;
  const res = await fetch(event.request);
  if (res && res.ok) {
    event.waitUntil((async () => {
      await cache.put(event.request.url, res.clone());
      const keys = await cache.keys();
      if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map(k => cache.delete(k)));
    })().catch(() => { /* egal */ }));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      if (url.pathname === '/' || url.pathname === '/index.html') event.respondWith(appShell(req));
      return;
    }
    if (url.pathname.indexOf('/api/files/') === 0) { event.respondWith(cacheFirstImage(event)); return; }
    if (STATIC_FILES.indexOf(url.pathname) !== -1) { event.respondWith(staleWhileRevalidate(event, url.pathname)); return; }
    // Selbst gehostete Bibliotheken (pb_public/vendor/…): sofort aus dem Speicher, im Hintergrund
    // auffrischen. Ohne Versions-Anhang unter dem Pfad gespeichert (passt zur Vorab-Speicherung).
    if (url.pathname.indexOf('/vendor/') === 0) { event.respondWith(staleWhileRevalidate(event, url.search ? req.url : url.pathname)); return; }
    // Sprachdateien (pb_public/lang/…): je Version (?v=…) einmal geladen, danach auch offline da
    if (url.pathname.indexOf('/lang/') === 0) { event.respondWith(staleWhileRevalidate(event, req.url)); return; }
    // App-Dateien (pb_public/js/…): je Version (?v=…) gespeichert, sofort aus dem Speicher
    if (url.pathname.indexOf('/js/') === 0) { event.respondWith(staleWhileRevalidate(event, req.url)); return; }
    return; // alles andere (v. a. /api/...) direkt zum Server
  }
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) event.respondWith(staleWhileRevalidate(event, req.url));
});

// ---------- Push-Benachrichtigungen ----------

// Die zuletzt bekannte Push-Adresse merken - damit kann der Server sie später zuordnen,
// wenn der Browser die Adresse austauscht.
async function rememberEndpoint(endpoint) {
  if (!endpoint) return;
  try {
    const c = await caches.open(META_CACHE);
    await c.put(META_URL, new Response(endpoint));
  } catch (e) { /* egal */ }
}
async function lastEndpoint() {
  try {
    const c = await caches.open(META_CACHE);
    const r = await c.match(META_URL);
    return r ? await r.text() : '';
  } catch (e) { return ''; }
}
function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, Object.assign({}, options, { signal: ctrl.signal })).finally(() => clearTimeout(timer));
}
function b64ToBytes(b64) {
  const padded = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchPendingMessage() {
  const sub = await self.registration.pushManager.getSubscription();
  if (!sub) return null;
  rememberEndpoint(sub.endpoint);
  // Kurzes Zeitlimit: startet der Server gerade neu, wird trotzdem sofort eine Mitteilung
  // angezeigt. iOS meldet das Gerät sonst ab, wenn nach einem Weckruf nichts erscheint.
  const res = await fetchWithTimeout('/api/pinn/push/abholen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
    cache: 'no-store',
  }, 8000);
  if (!res.ok) return null;
  const data = await res.json();
  if (data && typeof data.badge === 'number') await applyBadge(data.badge);
  if (data && data.ersatz && data.ersatz.text) await rememberFallback(data.ersatz);
  return data && data.nachricht ? data.nachricht : null;
}

// Allgemeiner Hinweis, wenn keine Nachricht abholbar ist - in der Sprache des Profils (vom Server,
// zuletzt bekannt), sonst in der Sprache des Geräts.
const FALLBACK_URL = '/__pinn-push-ersatz';
const FALLBACK_TEXT = {
  de: 'Es gibt Neuigkeiten in pinn.',
  en: 'There’s something new in pinn.',
  fr: 'Il y a du nouveau dans pinn.',
  es: 'Hay novedades en pinn.',
};
async function rememberFallback(msg) {
  try {
    const c = await caches.open(META_CACHE);
    await c.put(FALLBACK_URL, new Response(JSON.stringify({ titel: String(msg.titel || 'pinn.'), text: String(msg.text || '') })));
  } catch (e) { /* egal */ }
}
async function fallbackMessage() {
  let m = null;
  try {
    const c = await caches.open(META_CACHE);
    const r = await c.match(FALLBACK_URL);
    if (r) m = JSON.parse(await r.text());
  } catch (e) { m = null; }
  if (!m || !m.text) {
    const code = String((self.navigator && self.navigator.language) || 'de').slice(0, 2).toLowerCase();
    m = { titel: 'pinn.', text: FALLBACK_TEXT[code] || FALLBACK_TEXT.de };
  }
  return { titel: m.titel || 'pinn.', text: m.text, tag: 'pinn-allgemein', url: '/' };
}

// ---------- App-Badge (Zahl am App-Symbol) ----------
async function applyBadge(n) {
  try {
    const nav = self.navigator;
    if (!nav || !('setAppBadge' in nav)) return;
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v > 0) await nav.setAppBadge(v);
    else await nav.clearAppBadge();
  } catch (e) { /* egal */ }
}

async function showNextNotification(event) {
  let msg = null;
  try { if (event.data) msg = event.data.json(); } catch (e) { msg = null; }
  if (!msg) {
    try { msg = await fetchPendingMessage(); } catch (e) { msg = null; }
  }
  if (!msg) msg = await fallbackMessage();
  const sos = String(msg.tag || '').indexOf('sos-') === 0;
  const opts = {
    body: msg.text || '',
    tag: msg.tag || undefined,
    icon: '/apple-touch-icon.png',
    badge: '/pinn-badge.png', // einfarbiges Symbol für die Android-Statusleiste
    data: { url: msg.url || '/' },
  };
  if (sos) {
    // Hilferuf: bleibt stehen, bis jemand reagiert, vibriert lang und meldet sich erneut
    opts.requireInteraction = true;
    opts.renotify = true;
    opts.silent = false;
    opts.vibrate = [600, 200, 600, 200, 600, 200, 1200, 300, 600, 200, 600];
    opts.timestamp = Date.now();
  }
  await self.registration.showNotification(msg.titel || 'pinn.', opts);
  if (sos) await tellWindows({ type: 'pinn-sos', url: msg.url || '/' });
  // Offene pinn.-Fenster: Glocke sofort neu laden (die Nachricht steht dort jetzt auch)
  await tellWindows({ type: 'pinn-push', url: msg.url || '/' });
}

// Geöffnete pinn.-Fenster benachrichtigen (z. B. SOS-Popup sofort zeigen)
async function tellWindows(data) {
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(w => { try { w.postMessage(data); } catch (e) { /* egal */ } });
  } catch (e) { /* egal */ }
}

self.addEventListener('push', (event) => {
  event.waitUntil(showNextNotification(event));
});

// Die App teilt die aktuelle Push-Adresse mit, sobald sie das Gerät beim Server anmeldet
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type === 'pinn-endpoint' && d.endpoint) event.waitUntil(rememberEndpoint(String(d.endpoint)));
  if (d.type === 'pinn-badge' && typeof d.count === 'number') event.waitUntil(applyBadge(d.count));
});

// Der Browser hat die Push-Adresse ausgetauscht (oder verworfen): selbst neu anmelden und dem
// Server die neue Adresse melden - ohne dass jemand die App öffnen oder neu aktivieren muss.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const oldSub = event.oldSubscription || null;
    const alt = (oldSub && oldSub.endpoint) || await lastEndpoint();
    let neu = event.newSubscription || null;
    if (!neu) {
      try { neu = await self.registration.pushManager.getSubscription(); } catch (e) { neu = null; }
    }
    if (!neu) {
      let key = oldSub && oldSub.options ? oldSub.options.applicationServerKey : null;
      if (!key) {
        const r = await fetchWithTimeout('/api/pinn/push/schluessel', { cache: 'no-store' }, 10000);
        const d = r.ok ? await r.json() : null;
        if (d && d.publicKey) key = b64ToBytes(d.publicKey);
      }
      if (!key) return;
      neu = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    }
    if (!neu) return;
    if (alt && alt !== neu.endpoint) {
      await fetchWithTimeout('/api/pinn/push/abo-erneuern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alt: alt, neu: neu.endpoint }),
        cache: 'no-store',
      }, 10000);
    }
    await rememberEndpoint(neu.endpoint);
  })().catch(() => { /* beim nächsten App-Start wird das Gerät erneut abgeglichen */ }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if (w.url.indexOf(self.location.origin) === 0 && 'focus' in w) {
        // Fenster ist schon offen: Ziel mitteilen (z. B. ?sos=… öffnet das SOS-Popup)
        try { w.postMessage({ type: 'pinn-open', url: target }); } catch (e) { /* egal */ }
        return w.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
`;
    const h = e.response.header();
    h.set("Content-Type", "application/javascript; charset=utf-8");
    h.set("Cache-Control", "no-cache, no-store, must-revalidate");
    h.set("Service-Worker-Allowed", "/");
    h.set("X-Content-Type-Options", "nosniff");
    return e.string(200, code);
});

// Einfarbiges Statusleisten-Symbol für Android-Mitteilungen (96 x 96, weiß auf durchsichtig)
routerAdd("GET", "/pinn-badge.png", (e) => {
    const bytes = [
        137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,96,0,0,0,96,8,6,0,0,0,226,152,119,56,0,0,6,166,73,68,65,
        84,120,218,237,157,201,171,92,69,20,198,127,167,187,19,103,212,152,133,113,30,178,9,130,81,17,193,104,84,112,198,17,196,121,227,248,63,136,3,4,
        20,252,3,4,119,46,20,23,46,84,212,157,168,160,68,20,141,34,56,15,25,84,18,99,98,162,25,240,101,120,221,253,185,232,83,166,188,246,147,248,
        250,86,247,173,78,125,208,116,231,189,244,189,167,206,87,167,234,76,183,30,20,20,20,20,20,20,20,76,4,150,131,144,146,204,101,181,131,144,89,225,
        101,102,42,4,204,95,225,45,151,79,102,214,155,231,117,90,126,29,1,253,38,18,98,13,83,124,27,160,170,112,73,11,129,37,192,41,254,126,28,112,
        114,229,235,91,128,29,192,47,192,70,96,179,153,237,25,118,253,38,145,97,13,82,252,223,74,145,116,4,112,1,176,18,184,4,56,7,56,9,56,236,
        32,47,57,11,252,10,124,3,124,8,172,6,214,152,217,174,185,238,121,72,34,154,145,225,223,43,37,61,43,105,131,134,163,47,169,43,105,118,142,87,
        87,82,111,142,239,110,146,244,130,164,107,125,105,26,42,195,161,162,120,139,7,46,233,14,73,171,135,40,59,86,106,95,7,143,190,127,39,144,85,37,
        229,51,73,15,73,58,60,236,21,49,41,211,174,252,120,246,93,47,233,195,33,74,239,169,126,244,135,88,200,151,146,238,62,100,172,33,12,80,210,34,
        73,207,69,138,232,38,82,250,92,232,57,209,1,175,73,58,205,101,235,76,171,242,59,254,126,190,164,31,34,69,140,83,241,195,136,232,250,231,45,146,
        174,153,74,18,34,229,95,33,105,183,15,120,86,205,193,108,68,200,93,83,69,66,180,236,92,38,233,207,104,201,105,26,98,107,188,115,92,123,130,37,
        86,126,136,66,207,0,62,1,22,1,61,160,169,155,93,223,223,123,192,165,102,246,177,164,246,124,35,241,137,18,16,229,111,240,64,104,5,208,5,154,
        110,218,97,130,172,7,150,3,51,41,243,74,41,125,223,150,153,245,129,7,50,82,62,174,252,46,112,22,240,136,143,161,149,149,5,248,236,7,88,8,
        124,7,156,230,75,81,46,193,78,200,168,206,0,103,155,217,86,73,150,194,10,90,9,103,191,128,235,129,211,125,109,205,41,210,52,151,249,104,224,158,
        200,50,178,89,130,130,5,220,26,205,166,220,96,46,247,205,149,13,186,217,4,248,242,19,188,134,229,62,144,28,243,44,161,30,177,76,210,145,102,214,
        143,150,214,102,91,128,153,73,210,209,12,82,200,201,221,221,196,88,12,156,152,106,28,41,103,230,97,28,124,254,190,201,232,164,28,71,74,2,246,248,
        43,119,236,79,57,142,218,9,240,229,199,204,108,134,65,105,48,217,6,54,38,108,5,54,71,238,105,22,22,16,92,182,79,51,246,130,250,46,247,23,
        102,182,79,82,43,167,56,32,8,250,74,198,94,80,216,116,95,77,234,176,36,142,132,91,192,231,192,50,159,81,237,140,102,63,192,239,192,82,51,219,
        153,85,36,236,130,182,60,139,248,68,20,212,228,180,252,180,128,167,93,249,237,84,201,184,212,233,232,182,153,245,36,189,1,220,68,94,217,208,79,57,
        144,68,84,174,4,4,11,59,30,88,3,156,217,112,18,130,242,119,2,23,154,217,90,223,124,147,121,113,73,55,199,32,184,153,109,7,110,100,208,44,
        213,113,18,154,170,252,25,224,22,87,126,59,165,242,147,19,16,72,240,129,124,13,92,233,177,65,135,65,247,90,83,246,133,174,43,127,23,112,131,153,
        189,39,169,147,178,18,54,118,68,181,225,83,37,189,95,105,73,153,20,226,118,152,175,36,157,235,50,78,109,107,74,32,161,35,105,149,164,189,149,78,
        182,113,161,122,191,103,36,29,19,203,56,181,168,116,198,157,39,233,229,9,90,192,91,146,46,27,38,219,180,147,80,237,13,93,225,45,138,169,45,33,
        244,152,126,39,233,218,216,50,83,228,250,27,177,9,207,21,168,121,124,208,146,180,192,204,62,0,126,230,64,41,48,25,247,126,143,223,205,236,77,191,
        127,219,204,122,147,106,83,159,168,201,185,139,215,115,107,72,86,244,24,18,247,44,142,92,204,137,102,106,27,177,230,185,187,55,59,78,159,191,41,46,
        102,147,54,157,156,203,150,83,65,0,133,128,130,66,64,33,160,160,16,80,8,40,40,4,20,2,10,10,1,133,128,130,66,64,33,160,96,234,9,8,
        73,184,30,227,73,13,247,57,240,0,201,196,81,75,241,121,196,58,106,71,18,192,91,192,213,164,109,89,233,251,152,223,115,153,59,64,215,239,63,175,
        235,77,213,121,67,146,94,143,74,135,41,202,145,146,244,65,56,166,134,6,153,255,124,148,101,254,44,192,81,192,229,12,26,154,90,35,200,209,7,142,
        0,30,3,46,30,85,190,170,184,254,254,37,240,20,131,227,205,58,204,191,47,169,7,28,5,124,100,102,219,71,105,220,29,137,0,255,254,2,224,37,
        6,79,68,214,129,89,191,102,10,212,121,237,53,190,100,238,102,132,222,81,27,113,201,8,86,208,6,222,113,75,216,63,194,222,98,164,175,140,105,196,
        153,191,128,193,89,116,43,204,108,199,168,189,163,35,15,54,8,32,105,49,131,3,242,150,210,236,3,57,70,217,192,13,248,3,184,216,204,190,175,227,
        32,143,145,221,208,168,247,115,27,131,22,244,29,126,221,254,20,41,63,88,77,31,184,205,149,95,75,239,104,45,113,128,247,248,116,204,236,91,224,246,
        26,76,189,105,8,22,253,160,153,189,235,99,173,197,93,174,45,16,51,179,174,55,89,189,13,60,236,2,79,67,119,241,172,239,105,171,204,236,121,31,
        99,109,177,74,237,27,158,11,56,43,233,73,224,113,96,95,205,251,129,253,199,245,122,53,91,93,143,193,67,218,207,155,217,125,117,206,252,148,4,24,
        208,118,139,120,17,184,55,115,11,120,23,184,42,85,228,91,123,31,188,187,165,61,39,226,126,96,27,112,44,7,250,50,71,153,44,98,208,194,120,93,
        229,122,225,243,106,96,93,77,78,128,220,165,126,52,244,177,30,210,199,28,71,22,182,36,74,43,244,43,105,134,139,18,221,51,89,108,210,73,172,44,
        171,113,253,15,22,176,215,125,241,19,162,153,26,102,252,14,127,186,165,78,55,184,87,102,126,101,22,74,250,162,210,239,47,73,91,163,167,92,178,233,
        51,205,166,32,19,165,60,0,54,12,137,53,54,154,217,238,156,148,159,21,1,21,175,237,167,97,4,132,49,229,180,100,228,90,146,92,91,241,86,112,
        239,39,137,107,93,8,248,183,178,215,15,81,246,218,28,103,82,174,4,108,140,228,15,36,252,92,249,63,133,128,196,4,236,230,159,103,17,109,40,4,
        140,15,219,25,148,21,195,50,180,139,132,199,138,21,2,254,233,138,134,10,212,198,232,87,91,60,56,43,123,192,24,101,94,31,253,236,39,47,12,101,
        151,175,201,185,51,238,135,232,243,186,92,199,147,51,1,63,70,159,55,228,58,136,28,9,208,16,2,214,23,2,198,135,126,228,138,238,169,16,160,66,
        192,248,240,155,123,62,189,200,5,205,174,19,35,187,147,161,162,163,145,247,73,218,194,160,102,187,53,215,89,148,235,209,92,225,239,188,108,2,22,122,
        253,217,114,44,156,228,126,54,218,38,6,127,167,38,38,165,16,48,70,172,99,80,56,207,22,185,18,16,167,165,103,10,1,147,35,96,157,123,67,89,
        186,160,217,67,210,194,38,61,237,82,80,80,80,80,80,240,127,240,23,101,150,59,206,128,154,100,229,0,0,0,0,73,69,78,68,174,66,96,130
    ];
    const h = e.response.header();
    h.set("Cache-Control", "public, max-age=86400");
    h.set("X-Content-Type-Options", "nosniff");
    return e.blob(200, "image/png", bytes);
});
