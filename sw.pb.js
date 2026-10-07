// pb_hooks/sw.pb.js
// Liefert den Service Worker von pinn. unter /sw.js direkt aus PocketBase aus - mit korrektem
// JavaScript-Typ, ohne Zwischenspeicher und mit "Service-Worker-Allowed: /".
// Damit hängt der Service Worker nicht mehr davon ab, ob pb_public/sw.js vorhanden ist bzw. vom
// statischen Datei-Server / Reverse-Proxy richtig ausgeliefert wird (iOS meldete sonst
// "Script https://…/sw.js load failed").
// Diese Route hat Vorrang vor der Datei pb_public/sw.js.
//
// Aufgaben des Service Workers:
//  1. Offline-Start: Die App-Seite (index.html), Symbole, Manifest, Schriften und die Skripte von
//     den CDNs (Tailwind, PocketBase) werden auf dem Gerät vorgehalten. Die Seite selbst wird immer
//     zuerst frisch vom Server geholt (Updates kommen sofort an) - nur ohne Verbindung bzw. wenn der
//     Server nicht antwortet, startet pinn. mit der zuletzt geladenen Version.
//     Rezeptbilder (/api/files/...) werden nach dem ersten Anzeigen ebenfalls vorgehalten, ebenso die
//     gewählte Sprachdatei (/lang/<code>.js).
//     Alle anderen Server-Aufrufe (/api/...) laufen unverändert direkt zum Server - Daten, die offline
//     angelegt werden, sichert die App selbst und trägt sie nach.
//  2. Push-Benachrichtigungen:
//     SOS (Tag „sos-…“): bleibt stehen bis zur Reaktion, vibriert lang, meldet sich erneut und
//     sagt geöffneten Fenstern sofort Bescheid (Popup mit Karte und Notruf).
//     Jede Mitteilung sagt geöffneten Fenstern Bescheid („pinn-push“), damit die 🔔 Glocke sie sofort
//     zeigt; ein Tipp auf die Mitteilung öffnet in einem offenen Fenster direkt die passende Stelle.
//     Die Texte kommen schon in der Sprache des Profils (pinn-pushtext.js); ist keine Nachricht
//     abholbar, zeigt der Worker einen allgemeinen Hinweis in dieser Sprache.
//     Android (Chrome, Samsung Internet, Firefox): einfarbiges Statusleisten-Symbol (badge-96.png),
//     Mitteilungen mit gleichem Tag melden sich erneut (renotify) statt still ersetzt zu werden,
//     Vibration bei jeder Meldung.
//  3. App-Badge: Beim Abholen einer Meldung liefert der Server die Zahl der offenen, fälligen
//     Aufgaben des Profils mit ("badge"); der Worker setzt sie am App-Symbol.
// Tauscht der Browser die Push-Adresse aus, meldet der Worker das Gerät selbst neu an
// (pushsubscriptionchange -> /api/pinn/push/abo-erneuern).
// Der Server schickt einen inhaltslosen Weckruf; der Text wird mit der geheimen Geräte-Adresse
// (endpoint) bei /api/pinn/push/abholen abgeholt und dann angezeigt.

routerAdd("GET", "/sw.js", (e) => {
    const code = `// pinn. Service Worker (ausgeliefert von pb_hooks/sw.pb.js)
const META_CACHE = 'pinn-push-meta';
const META_URL = '/__pinn-push-endpoint';

// ---------- Offline-Start ----------
const SHELL_CACHE = 'pinn-app-v1';
const IMG_CACHE = 'pinn-bilder-v1';
const OWN_CACHES = [SHELL_CACHE, IMG_CACHE, META_CACHE, 'pinn-daten'];
const SHELL_URL = '/';
const STATIC_FILES = ['/manifest.json', '/apple-touch-icon.png', '/favicon-32x32.png', '/favicon-16x16.png', '/pinn-logo.png',
  '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/badge-96.png'];
const CDN_SCRIPTS = ['https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net/npm/pocketbase@0.21.5/dist/pocketbase.umd.js'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const MAX_IMAGES = 400;

async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  const own = [SHELL_URL].concat(STATIC_FILES).map(u => fetch(u, { cache: 'no-store', credentials: 'same-origin' })
    .then(r => (r && r.ok ? cache.put(u, r) : null)).catch(() => null));
  const cdn = CDN_SCRIPTS.map(u => fetch(new Request(u, { mode: 'no-cors' }))
    .then(r => (r && (r.ok || r.type === 'opaque') ? cache.put(u, r) : null)).catch(() => null));
  await Promise.all(own.concat(cdn));
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
    // Sprachdateien (pb_public/lang/…): je Version (?v=…) einmal geladen, danach auch offline da
    if (url.pathname.indexOf('/lang/') === 0) { event.respondWith(staleWhileRevalidate(event, req.url)); return; }
    return; // alles andere (v. a. /api/...) direkt zum Server
  }
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) event.respondWith(staleWhileRevalidate(event, req.url));
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

// Android-Gerät? (Statusleisten-Symbol, Vibration)
const ANDROID = /Android/i.test(String((self.navigator && self.navigator.userAgent) || ''));

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
    // Android zeigt das Symbol neben dem Text, das Badge einfarbig in der Statusleiste
    icon: ANDROID ? '/icon-192.png' : '/apple-touch-icon.png',
    badge: '/badge-96.png',
    lang: (self.navigator && self.navigator.language) || undefined,
    timestamp: Date.now(),
    data: { url: msg.url || '/' },
  };
  // Gleiches Tag: Android ersetzt die alte Mitteilung sonst lautlos - so meldet sie sich erneut
  if (opts.tag) opts.renotify = true;
  if (ANDROID) opts.vibrate = [200, 100, 200];
  if (sos) {
    // Hilferuf: bleibt stehen, bis jemand reagiert, vibriert lang und meldet sich erneut
    opts.requireInteraction = true;
    opts.renotify = true;
    opts.silent = false;
    opts.vibrate = [600, 200, 600, 200, 600, 200, 1200, 300, 600, 200, 600];
  }
  if (!opts.tag) delete opts.tag;
  try {
    await self.registration.showNotification(msg.titel || 'pinn.', opts);
  } catch (e) {
    // Ältere Browser kennen einzelne Optionen nicht - dann schlicht anzeigen
    await self.registration.showNotification(msg.titel || 'pinn.', { body: opts.body, tag: opts.tag, icon: opts.icon, badge: opts.badge, data: opts.data });
  }
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
