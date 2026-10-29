/* pinn. – Push notifications (js/mitteilungen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: personal push notifications per profile: state and wish on the device (pushWanted, setPushWanted), device checks (pushSupported, isStandaloneApp, isAppleMobile, isAndroidDevice), offering the app install on Android, service worker and subscription (getPushRegistration, currentPushSubscription, sendSubscriptionToServer), enabling/disabling (enablePushOnThisDevice, disablePushOnThisDevice), automatic re-registration (syncPushSubscription, syncPushSubscriptionSoon) and Settings → Notifications (renderPushSettings with test and options). Server side: pb_hooks/pinn-push.js. The file is deliberately not called push.js: browser ad blockers and DNS filters often block that file name. */

/* ==========================================================
   Push notifications (personal per profile, see pb_hooks/pinn-push.js)
   ========================================================== */
let pushConfig = null;
let pushRegPromise = null;
let pushLastError = '';
let pushAutoSyncEnabled = false; // only after the app has started (not for the main admin)
let pushLastAutoSync = 0;
let pushSyncRunning = null;

// Remembers on the device that notifications are wanted. If the registration gets lost
// (server restart, update, new server key, the browser swaps the push address), the
// app registers the device again by itself the next time it opens. Only "Deaktivieren" or logging out clears it.
const LS_PUSH_WANTED = 'pinn.pushGewuenscht';
function pushWanted() {
  try { return localStorage.getItem(LS_PUSH_WANTED) === '1'; } catch (e) { return false; }
}
function setPushWanted(on) {
  try {
    if (on) localStorage.setItem(LS_PUSH_WANTED, '1');
    else localStorage.removeItem(LS_PUSH_WANTED);
  } catch (e) { /* ignore */ }
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function isStandaloneApp() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isAppleMobile() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || '');
}
// Android/Chrome: offer installing as an app. Chrome fires "beforeinstallprompt" as soon as pinn.
// can be installed (manifest with icons, service worker, HTTPS) – the event is remembered and
// only triggered on a tap in Settings → Notifications.
let pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaInstallPrompt = e;
  updateAndroidInstallUi();
});
window.addEventListener('appinstalled', () => {
  pwaInstallPrompt = null;
  updateAndroidInstallUi();
});
function updateAndroidInstallUi() {
  const box = document.getElementById('pushAndroidInstallBox');
  if (!box) return;
  const show = isAndroidDevice() && !isStandaloneApp() && pushSupported();
  box.classList.toggle('hidden', !show);
  document.getElementById('pushAndroidInstallBtn').classList.toggle('hidden', !show || !pwaInstallPrompt);
  document.getElementById('pushAndroidInstallManual').classList.toggle('hidden', !show || !!pwaInstallPrompt);
}
function base64UrlToUint8Array(b64) {
  const padded = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || isAppleMobile()) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Browser';
}
function pushWithTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}
function sameKey(a, b) {
  if (!a || !b) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// Register the service worker exactly once and wait for an ACTIVE worker.
// iOS rejects pushManager.subscribe() as long as the worker is not active yet.
function getPushRegistration() {
  if (!('serviceWorker' in navigator)) return Promise.reject(new Error(tk('account.push.err.noServiceWorker')));
  if (!pushRegPromise) {
    pushRegPromise = (async () => {
      let reg = null;
      try { reg = await navigator.serviceWorker.getRegistration('/'); } catch (e) { reg = null; }
      if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      if (reg.active) return reg;
      return await pushWithTimeout(navigator.serviceWorker.ready, 15000, tk('account.push.err.swNotStarting'));
    })().catch(e => { pushRegPromise = null; throw e; });
  }
  return pushRegPromise;
}
async function currentPushSubscription() {
  if (!pushSupported()) return null;
  try {
    const reg = await getPushRegistration();
    if (!reg || !reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch (e) {
    return null;
  }
}
async function sendSubscriptionToServer(sub) {
  const j = sub.toJSON();
  await postJson('/api/pinn/push/abo', { endpoint: j.endpoint, keys: j.keys, geraet: deviceLabel() });
  // Tell the service worker the current address (for a later change of address)
  try {
    const reg = await getPushRegistration();
    const worker = (reg && reg.active) || navigator.serviceWorker.controller;
    if (worker) worker.postMessage({ type: 'pinn-endpoint', endpoint: j.endpoint });
  } catch (e) { /* ignore */ }
}
async function loadPushConfig() {
  const res = await apiFetch('/api/pinn/push/config', { cache: 'no-store' });
  pushConfig = await res.json();
  return pushConfig;
}

// Works with the promise variant and the old callback variant (older Safari versions)
function requestNotificationPermission() {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v || Notification.permission); } };
    try {
      const p = Notification.requestPermission(finish);
      if (p && typeof p.then === 'function') p.then(finish, () => finish(Notification.permission));
    } catch (e) {
      finish(Notification.permission);
    }
  });
}

function pushSubscribeErrorText(e) {
  const name = (e && e.name) || '';
  const msg = (e && e.message) || String(e || '');
  if (name === 'NotAllowedError') {
    if (isAppleMobile()) return tk('account.push.err.iosRejected');
    if (isAndroidDevice()) return tk('account.push.err.androidRejected');
    return tk('account.push.err.notAllowed');
  }
  if (name === 'InvalidStateError' || name === 'AbortError') {
    return tk('account.push.err.subscribeRetry', { error: name + ': ' + msg });
  }
  return tk('account.push.err.subscribeFailed', { error: (name ? '(' + name + ') ' : '') + msg });
}

async function enablePushOnThisDevice() {
  // Ask for permission first - Safari requires this to follow the tap directly
  const permission = await requestNotificationPermission();
  if (permission === 'denied') {
    throw new Error(tk(isAppleMobile() ? 'account.push.err.blockedIos'
      : (isAndroidDevice() ? 'account.push.err.blockedAndroid' : 'account.push.err.blockedBrowser')));
  }
  if (permission !== 'granted') throw new Error(tk('account.push.err.dismissed'));

  if (!pushConfig || !pushConfig.publicKey) await loadPushConfig();
  if (!pushConfig.available || !pushConfig.publicKey) throw new Error(pushConfig.message || tk('account.push.err.serverUnavailable'));

  const reg = await getPushRegistration();
  if (!reg || !reg.pushManager) throw new Error(tk('account.push.err.deviceUnsupported'));
  const key = base64UrlToUint8Array(pushConfig.publicKey);

  let sub = null;
  try { sub = await reg.pushManager.getSubscription(); } catch (e) { sub = null; }
  if (sub && sub.options && sub.options.applicationServerKey && !sameKey(sub.options.applicationServerKey, key)) {
    // The server key has changed (e.g. key file regenerated) -> register again
    try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
    sub = null;
  }
  if (!sub) {
    try {
      sub = await pushWithTimeout(
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
        20000, tk('account.push.err.serviceTimeout'));
    } catch (e) {
      throw new Error(e && e.name ? pushSubscribeErrorText(e) : (e.message || String(e)));
    }
  }
  if (!sub) throw new Error(tk('account.push.err.noAddress'));

  setPushWanted(true);
  try {
    await sendSubscriptionToServer(sub);
  } catch (e) {
    throw new Error(tk('account.push.err.serverRegister', { error: e.message }));
  }
  return sub;
}
async function disablePushOnThisDevice() {
  setPushWanted(false);
  const sub = await currentPushSubscription();
  if (!sub) return;
  try { await postJson('/api/pinn/push/abo-loeschen', { endpoint: sub.endpoint }); } catch (e) { /* ignore */ }
  try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
}
// On app start and when returning to the app: update the service worker, assign the subscription to the
// logged-in profile and - if wanted but lost - register again.
// Result: the current subscription or null.
function syncPushSubscription() {
  if (!pushSupported() || !window.isSecureContext) return Promise.resolve(null);
  if (pushSyncRunning) return pushSyncRunning;
  pushSyncRunning = (async () => {
    try {
      const reg = await getPushRegistration();
      if (!reg || !reg.pushManager) return null;
      try { reg.update().catch(() => { /* ignore */ }); } catch (e) { /* ignore */ }
      let sub = null;
      try { sub = await reg.pushManager.getSubscription(); } catch (e) { sub = null; }
      if (sub) setPushWanted(true); // remember devices that were already activated
      if (!pushWanted() || Notification.permission === 'denied') return sub;

      let cfg = null;
      try { cfg = await loadPushConfig(); } catch (e) { cfg = null; }
      const serverKey = cfg && cfg.available && cfg.publicKey ? base64UrlToUint8Array(cfg.publicKey) : null;
      if (sub && serverKey && sub.options && sub.options.applicationServerKey && !sameKey(sub.options.applicationServerKey, serverKey)) {
        // The server has a new key -> register the device again with the new key
        try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
        sub = null;
      }
      if (!sub && serverKey && Notification.permission === 'granted') {
        try {
          sub = await pushWithTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey }),
            20000, tk('account.push.err.timeout'));
        } catch (e) { sub = null; }
      }
      if (sub) await sendSubscriptionToServer(sub);
      return sub;
    } catch (e) {
      return null; // next attempt the next time the app opens
    }
  })().finally(() => { pushSyncRunning = null; pushLastAutoSync = Date.now(); });
  return pushSyncRunning;
}
// When returning to the app / when the network is back (at most every 10 minutes)
function syncPushSubscriptionSoon() {
  if (!pushAutoSyncEnabled || !pb.authStore.isValid) return;
  if (Date.now() - pushLastAutoSync < 10 * 60 * 1000) return;
  pushLastAutoSync = Date.now();
  syncPushSubscription();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncPushSubscriptionSoon(); });
window.addEventListener('online', () => { pushLastAutoSync = 0; syncPushSubscriptionSoon(); });

function fillPushSettingsForm(st) {
  document.getElementById('pushOptTermine').checked = !!st.termine;
  document.getElementById('pushOptVorlauf').value = String(st.vorlauf);
  document.getElementById('pushOptTages').checked = !!st.tagesuebersicht;
  document.getElementById('pushOptUhrzeit').value = st.uhrzeit || '07:00';
  document.getElementById('pushOptZuweisungen').checked = !!st.zuweisungen;
  document.getElementById('pushOptOhneZuweisung').checked = !!st.ohneZuweisung;
  document.getElementById('pushOptAlleErledigt').checked = st.alleErledigt !== false;
  document.getElementById('pushOptKindAufgabe').checked = st.kindAufgabe !== false;
  document.getElementById('pushOptKindAlle').checked = st.kindAlle !== false;
  document.getElementById('pushOptPwMich').checked = st.pwMich !== false;
  document.getElementById('pushOptPwAlle').checked = st.pwAlle !== false;
  document.getElementById('pushOptPwAntworten').checked = st.pwAntworten !== false;
  document.getElementById('pushOptPwErinnerung').checked = st.pwErinnerung !== false;
  document.getElementById('pushOptVorrat').checked = st.vorrat !== false;
  document.getElementById('pushOptUpdates').checked = st.updates !== false;
  // Update messages only matter for admins (the server sends them only to those allowed to update)
  document.getElementById('pushUpdatesWrap').classList.toggle('hidden', !isCurrentUserAdmin());
  document.getElementById('pushOptMuell').checked = st.muell !== false;
  document.getElementById('pushOptMuellZeit').value = st.muellZeit || '18:00';
  document.getElementById('pushOptMuellZeit').disabled = st.muell === false;
  document.getElementById('pushOptVorlauf').disabled = !st.termine;
  document.getElementById('pushOptUhrzeit').disabled = !st.tagesuebersicht;
}
function readPushSettingsForm() {
  return {
    termine: document.getElementById('pushOptTermine').checked,
    vorlauf: parseInt(document.getElementById('pushOptVorlauf').value, 10),
    tagesuebersicht: document.getElementById('pushOptTages').checked,
    uhrzeit: document.getElementById('pushOptUhrzeit').value || '07:00',
    zuweisungen: document.getElementById('pushOptZuweisungen').checked,
    ohneZuweisung: document.getElementById('pushOptOhneZuweisung').checked,
    animation: !(pushConfig && pushConfig.settings && pushConfig.settings.animation === false), // set under Settings → task animation
    alleErledigt: document.getElementById('pushOptAlleErledigt').checked,
    kindAufgabe: document.getElementById('pushOptKindAufgabe').checked,
    kindAlle: document.getElementById('pushOptKindAlle').checked,
    pwMich: document.getElementById('pushOptPwMich').checked,
    pwAlle: document.getElementById('pushOptPwAlle').checked,
    pwAntworten: document.getElementById('pushOptPwAntworten').checked,
    pwErinnerung: document.getElementById('pushOptPwErinnerung').checked,
    vorrat: document.getElementById('pushOptVorrat').checked,
    updates: document.getElementById('pushOptUpdates').checked,
    muell: document.getElementById('pushOptMuell').checked,
    muellZeit: document.getElementById('pushOptMuellZeit').value || '18:00',
  };
}

async function renderPushSettings(knownSub) {
  const status = document.getElementById('pushStatus');
  const who = document.getElementById('pushWhoText');
  const enableBtn = document.getElementById('pushEnableBtn');
  const disableBtn = document.getElementById('pushDisableBtn');
  const testBtn = document.getElementById('pushTestBtn');
  const box = document.getElementById('pushSettingsBox');
  const iosHint = document.getElementById('pushIosHint');
  const androidBrowserHint = document.getElementById('pushAndroidBrowserHint');
  const androidBatteryHint = document.getElementById('pushAndroidBatteryHint');
  [enableBtn, disableBtn, testBtn].forEach(b => b.classList.add('hidden'));
  [androidBrowserHint, androidBatteryHint].forEach(el => el.classList.add('hidden'));
  status.classList.remove('text-red-500');
  updateAndroidInstallUi();

  const me = currentMember();
  who.textContent = me ? tk('account.push.who', { name: me.name }) : tk('account.push.notLinked');

  try {
    await loadPushConfig();
  } catch (e) {
    status.textContent = tk('common.noConnection');
    return;
  }
  fillPushSettingsForm(pushConfig.settings || {});
  box.classList.remove('hidden');
  if (!pushConfig.available) {
    status.textContent = tk('account.push.serverUnavailableDetail', { error: pushConfig.message || tk('common.unknownError') });
    return;
  }
  if (!window.isSecureContext) {
    status.textContent = tk('account.push.httpsOnly');
    return;
  }
  if (!pushSupported()) {
    const needsHomeScreen = isAppleMobile() && !isStandaloneApp();
    iosHint.classList.toggle('hidden', !needsHomeScreen);
    androidBrowserHint.classList.toggle('hidden', !isAndroidDevice());
    status.textContent = tk(needsHomeScreen ? 'account.push.notYetPossible'
      : (isAppleMobile() ? 'account.push.iosTooOld' : 'account.push.browserUnsupported'));
    return;
  }
  iosHint.classList.add('hidden');
  androidBatteryHint.classList.toggle('hidden', !isAndroidDevice());

  // Check the subscription independently of Notification.permission - iOS does not always report the
  // permission in web apps reliably.
  let sub = knownSub || (Notification.permission !== 'denied' ? await currentPushSubscription() : null);
  let lostSub = false;
  if (!sub && pushWanted() && Notification.permission === 'granted') {
    // Wanted, but the registration got lost -> silently register again
    sub = await syncPushSubscription();
    if (sub) { try { await loadPushConfig(); } catch (e) { /* ignore */ } }
    else lostSub = true;
  }

  if (sub) {
    // The device is registered - make sure the server knows it too (if it was removed
    // there, e.g. after the push service rejected it, it is added again here).
    let serverErr = '';
    try {
      await sendSubscriptionToServer(sub);
      await loadPushConfig();
    } catch (e) {
      serverErr = e.message || tk('common.unknownError');
    }
    const others = Math.max(0, (pushConfig.geraete || 0) - 1);
    if (serverErr) {
      status.textContent = tk('account.push.onButNotRegistered', { error: serverErr });
      status.classList.add('text-red-500');
      enableBtn.classList.remove('hidden');
      disableBtn.classList.remove('hidden');
      return;
    }
    if (pushLastError) {
      status.textContent = pushLastError;
      status.classList.add('text-red-500');
    } else {
      status.textContent = others ? tk('account.push.activeHereAndOthers', { n: others }) : tk('account.push.activeHere');
    }
    disableBtn.classList.remove('hidden');
    testBtn.classList.remove('hidden');
    return;
  }
  const others = Math.max(0, pushConfig.geraete || 0);
  if (Notification.permission === 'denied') {
    status.textContent = tk(isAppleMobile() ? 'account.push.blockedIosReopen'
      : (isAndroidDevice() ? 'account.push.blockedAndroidReopen' : 'account.push.blockedBrowserDevice'));
    status.classList.add('text-red-500');
    return;
  }
  if (pushLastError) {
    status.textContent = pushLastError;
    status.classList.add('text-red-500');
  } else if (lostSub) {
    status.textContent = tk('account.push.lostRegistration');
    status.classList.add('text-red-500');
  } else {
    status.textContent = others ? tk('account.push.inactiveHereActiveOthers', { n: others }) : tk('account.push.inactiveHere');
  }
  enableBtn.classList.remove('hidden');
  if (others) testBtn.classList.remove('hidden');
}

document.getElementById('pushEnableBtn').addEventListener('click', async () => {
  const status = document.getElementById('pushStatus');
  const btn = document.getElementById('pushEnableBtn');
  btn.disabled = true;
  status.classList.remove('text-red-500');
  status.textContent = tk('account.push.activating');
  try {
    const sub = await enablePushOnThisDevice();
    pushLastError = '';
    await renderPushSettings(sub);
    if (!pushLastError) {
      status.classList.remove('text-red-500');
    }
  } catch (e) {
    pushLastError = (e && e.message) || tk('account.push.activateFailed');
    await renderPushSettings();
  } finally {
    btn.disabled = false;
  }
});
document.getElementById('pushAndroidInstallBtn').addEventListener('click', async () => {
  if (!pwaInstallPrompt) { updateAndroidInstallUi(); return; }
  const p = pwaInstallPrompt;
  pwaInstallPrompt = null;
  try {
    p.prompt();
    await p.userChoice;
  } catch (e) { /* cancelled */ }
  updateAndroidInstallUi();
});
document.getElementById('pushDisableBtn').addEventListener('click', async () => {
  pushLastError = '';
  await disablePushOnThisDevice();
  renderPushSettings();
});
document.getElementById('pushTestBtn').addEventListener('click', async () => {
  const status = document.getElementById('pushStatus');
  const btn = document.getElementById('pushTestBtn');
  btn.disabled = true;
  status.classList.remove('text-red-500');
  status.textContent = tk('account.push.testSending');
  try {
    let sub = await currentPushSubscription();
    // register the device with the server (again) before the test
    if (sub) await sendSubscriptionToServer(sub);
    let r = null;
    try {
      r = await postJson('/api/pinn/push/test', {});
    } catch (e) {
      // The push service no longer knows the old device address -> register again and send once more
      if (sub && /nicht mehr angemeldet|kein Gerät angemeldet|neu aktivieren/i.test(e.message || '')) {
        status.textContent = tk('account.push.reregistering');
        try { await postJson('/api/pinn/push/abo-loeschen', { endpoint: sub.endpoint }); } catch (e2) { /* ignore */ }
        try { await sub.unsubscribe(); } catch (e2) { /* ignore */ }
        sub = await enablePushOnThisDevice();
        status.textContent = tk('account.push.testSending');
        r = await postJson('/api/pinn/push/test', {});
      } else {
        throw e;
      }
    }
    pushLastError = '';
    status.textContent = tk('account.push.testSent', { n: r.sent }) +
      (r.fehler && r.fehler.length ? ' ' + tk('account.push.testNote', { details: r.fehler.join(' | ') }) : '');
  } catch (e) {
    status.textContent = e.message;
    status.classList.add('text-red-500');
  } finally {
    btn.disabled = false;
  }
});
let pushSettingsSaveTimer = null;
document.querySelectorAll('.push-opt').forEach(el => el.addEventListener('change', () => {
  const st = readPushSettingsForm();
  fillPushSettingsForm(st);
  if (pushConfig) pushConfig.settings = { ...(pushConfig.settings || {}), ...st };
  const info = document.getElementById('pushSettingsStatus');
  clearTimeout(pushSettingsSaveTimer);
  pushSettingsSaveTimer = setTimeout(async () => {
    try {
      const r = await postJson('/api/pinn/push/einstellungen', { settings: st });
      if (pushConfig) pushConfig.settings = r.settings;
      info.textContent = tk('common.saved');
      setTimeout(() => { info.textContent = ''; }, 1500);
    } catch (e) {
      info.textContent = e.message;
    }
  }, 400);
}));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('mitteilungen');
