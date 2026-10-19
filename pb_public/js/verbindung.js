/* pinn. – PocketBase connection and device ID (js/verbindung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the PocketBase client (PB_URL, pb), the device ID and name for the device management (pinnDeviceId, pinnDeviceName), the fetch wrapper that adds them to login requests (PINN_AUTH_URL), pb.afterSend and handleRemoteLogout for a device that was logged out remotely. It must load before every file in js/ that uses pb (only js/grundlagen.js and js/popups.js come earlier; they do not use pb). */

/* ==========================================================
   PocketBase connection
   ========================================================== */
// The app lives in pb_public and is served directly by PocketBase – that is why
// we use the same address the page itself was opened with
// (window.location.origin). This works automatically whether you open PocketBase directly on
// port 8090 OR via nginx on another port/domain/HTTPS – so port 8090
// does NOT have to be hard-coded any more. The fallback only applies if the file is ever
// not loaded via http(s):// (e.g. opened locally by double-click) - then please enter the
// address of your own PocketBase server below.
const PB_URL = (location.protocol === 'http:' || location.protocol === 'https:')
  ? location.origin
  : 'http://localhost:8090'; // <- enter your own PocketBase address here if needed
const pb = new PocketBase(PB_URL);

/* ---------- Device management: ID and name of this device (pb_hooks/sitzungen.pb.js) ----------
   With every login (password, family dashboard, renewal at start, password change) the app
   sends a random device ID and a readable name (e.g. „iPhone · App“). If
   the same device logs in again, the server continues the existing session.
   If the device was logged out (Account → Logged-in devices or by an admin), the
   server answers with 401 and "X-Pinn-Abgemeldet: 1" – then the app deletes its data on the device. */
const LS_DEVICE_ID = 'pinn.geraetId';
function pinnDeviceId() {
  try {
    let id = localStorage.getItem(LS_DEVICE_ID) || '';
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const b = new Uint8Array(18);
      window.crypto.getRandomValues(b);
      id = Array.from(b, x => ('0' + x.toString(16)).slice(-2)).join('');
      localStorage.setItem(LS_DEVICE_ID, id);
    }
    return id;
  } catch (e) { return ''; }
}
function pinnDeviceName() {
  const ua = navigator.userAgent || '';
  let dev = 'Browser';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) dev = 'iPad';
  else if (/iPhone|iPod/.test(ua)) dev = 'iPhone';
  else if (/Android/.test(ua)) dev = /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet';
  else if (/Macintosh|Mac OS X/.test(ua)) dev = 'Mac';
  else if (/Windows/.test(ua)) dev = 'Windows-PC';
  else if (/CrOS/.test(ua)) dev = 'Chromebook';
  else if (/Linux/.test(ua)) dev = 'Linux-PC';
  let br = '';
  if (/EdgA?\/|EdgiOS/.test(ua)) br = 'Edge';
  else if (/SamsungBrowser/.test(ua)) br = 'Samsung Internet';
  else if (/Firefox|FxiOS/.test(ua)) br = 'Firefox';
  else if (/OPR\//.test(ua)) br = 'Opera';
  else if (/Chrome|CriOS/.test(ua)) br = 'Chrome';
  else if (/Safari/.test(ua)) br = 'Safari';
  let standalone = false;
  try { standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (e) { standalone = false; }
  let name = dev + (standalone ? ' · App' : (br ? ' · ' + br : ''));
  try {
    const d = JSON.parse(localStorage.getItem('pinn.dashboard') || 'null');
    if (d && d.key) name = 'Familien-Dashboard' + (d.name ? ' „' + String(d.name).slice(0, 40) + '“' : '') + ' · ' + dev;
  } catch (e) { /* ignore */ }
  return name.slice(0, 100);
}
// Login requests get the ID and name of the device (also those of the PocketBase SDK)
const PINN_AUTH_URL = /\/api\/(pinn\/(login|password|dashboard\/login|sitzungen\/alle-abmelden)|collections\/benutzer\/auth-)/;
(function () {
  if (!window.fetch) return;
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : ((input && input.url) || '');
      if (PINN_AUTH_URL.test(url)) {
        const opts = Object.assign({}, init || {});
        const h = new Headers(opts.headers || (typeof input !== 'string' && input && input.headers) || undefined);
        const id = pinnDeviceId();
        if (id) h.set('X-Pinn-Geraet-Id', id);
        h.set('X-Pinn-Geraet', encodeURIComponent(pinnDeviceName()));
        opts.headers = h;
        return origFetch(input, opts);
      }
    } catch (e) { /* carry on normally */ }
    return origFetch(input, init);
  };
})();
// SDK responses: detect a logged-out device
pb.afterSend = function (response, data) {
  try {
    if (response && response.status === 401 && response.headers.get('X-Pinn-Abgemeldet') === '1') handleRemoteLogout();
  } catch (e) { /* ignore */ }
  return data;
};
// This device was logged out remotely: delete the login, data, push and cache on the
// device. At the family dashboard it simply goes back to the profile selection.
let remoteLogoutDone = false;
async function handleRemoteLogout() {
  if (remoteLogoutDone) return;
  remoteLogoutDone = true;
  try { if (typeof isDashboardDevice === 'function' && isDashboardDevice()) { returnToDashboard(); return; } } catch (e) { /* carry on */ }
  try { localStorage.removeItem('pinn.pushGewuenscht'); } catch (e) { /* ignore */ }
  try {
    const reg = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration('/') : null;
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
  } catch (e) { /* ignore */ }
  try { if (typeof clearAppBadgeNow === 'function') clearAppBadgeNow(); } catch (e) { /* ignore */ }
  pb.authStore.clear();
  try {
    ['pinn.cache', 'pinn.pendingSync', 'pinn.outbox', 'pinn.aufgabenCache', 'pinn.icsCache', 'pinn.profileCache', 'pinn.sessionOnly'].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem('pinn.sessionAlive');
  } catch (e) { /* ignore */ }
  try { if (window.caches) await caches.delete('pinn-daten'); } catch (e) { /* ignore */ }
  alert('Dieses Gerät wurde in pinn. abgemeldet. Die pinn.-Daten auf diesem Gerät wurden gelöscht – bitte melde dich erneut an.');
  location.reload();
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('verbindung');
