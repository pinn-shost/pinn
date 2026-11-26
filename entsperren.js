/* pinn. – Unlock with Face ID / Touch ID / fingerprint or the PIN (js/entsperren.js, since 1.147.0; one set of methods since 1.164.0)
   Classic script, no build step: loaded after js/geraete.js (the load order is listed in src/rahmen.html and in
   pinn-setup.sh). js/menuesperre.js comes right after it and uses the helpers below.
   Contents:
   - The ways to unlock, set up once and used everywhere (Settings → "Unlock & lock"):
     · the PIN of the profile – the same PIN as on the family dashboard. It is stored on the server (js/dashboardkonto.js);
       pinn. checks it there (POST /api/pinn/dashboard/pin-pruefen, with the same lock after wrong attempts as the
       dashboard). A salted hash of the last PIN that was right is kept on this device, so the PIN also works offline.
     · Face ID / Touch ID / fingerprint of this device: a key in the secure chip of the device (Web Authentication,
       "platform authenticator"). The device itself checks the face or the finger – pinn. and the server never see any of it.
   - "Lock pinn.": switch per device plus "lock after" (immediately, 1, 5 or 15 minutes). Lock screen when pinn. is opened and
     when it comes back from the background after the chosen time. With Face ID the device is asked by itself (iOS always puts
     its own "Use passkey" sheet in front of Face ID – the web cannot skip it); with the PIN only, the PIN pad opens.
     "Sign in with password" signs this device out, so a forgotten PIN or a broken sensor never locks anybody out.
   - The same methods unlock the menus locked in js/menuesperre.js. The family dashboard only uses the PIN.
   - Works on iPhone/iPad (Face ID, Touch ID), Android (fingerprint, face unlock) and on computers with Touch ID or
     Windows Hello. Face ID needs an https address. Not on the family dashboard and not for guests (no password).
   - Stored on the device only:
     localStorage pinn.entsperren      { user: profile ID, id: key ID of Face ID ('' = not set up), app: lock pinn. on/off, after: minutes }
     localStorage pinn.entsperren.pin  { user, salt, hash, len } – hash of the PIN for checking it offline
     (until 1.163: { id, user, after } meant "lock pinn. with Face ID" – read as app: true). */

var BIO_KEY = 'pinn.entsperren';
var BIO_AWAY_KEY = 'pinn.entsperren.weg';    // time pinn. went to the background
var LK_PIN_KEY = 'pinn.entsperren.pin';
var LK_VERIFY_MS = 5 * 60 * 1000;            // after one unlock the lock settings can be changed for 5 minutes
var bioLocked = false;
var bioBusy = false;
var bioOverlay = null;
var lkFails = 0;                              // wrong PINs while offline (checked on the device)
var lkBlockedUntil = 0;
var lkVerifiedUntil = 0;

/* ---------- Who and where ---------- */
function bioUserId() {
  try { var u = pb.authStore.record || pb.authStore.model; return (u && u.id) || ''; } catch (e) { return ''; }
}
function bioUserRole() {
  try { var u = pb.authStore.record || pb.authStore.model; return (u && u.rolle) || ''; } catch (e) { return ''; }
}
// Locks (pinn. and menus) only exist on a personal device of a profile with a password
function lkPersonalDevice() {
  try { if (!pb.authStore.isValid) return false; } catch (e) { return false; }
  var role = bioUserRole();
  if (!bioUserId() || role === 'gast' || role === 'hauptadmin') return false;
  try { if (typeof isDashboardDevice === 'function' && isDashboardDevice()) return false; } catch (e) { /* not known yet */ }
  return true;
}

/* ---------- Stored settings of this device ---------- */
function bioCfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(BIO_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !c.user) return null;
  if (typeof c.app !== 'boolean') c.app = !!c.id; // stored by 1.163 or older: a key meant "lock pinn."
  c.id = c.id || '';
  c.after = [0, 1, 5, 15].indexOf(Number(c.after)) >= 0 ? Number(c.after) : 1;
  return c;
}
function bioSaveCfg(c) {
  try {
    if (c && (c.id || c.app)) localStorage.setItem(BIO_KEY, JSON.stringify(c));
    else localStorage.removeItem(BIO_KEY);
  } catch (e) { /* storage full or blocked */ }
}
// Settings of the signed-in profile (a fresh object when there are none yet)
function lkCfg() {
  var c = bioCfg();
  var me = bioUserId();
  if (!c || c.user !== me) c = { user: me, id: '', app: false, after: 1 };
  return c;
}

/* ---------- Face ID / Touch ID / fingerprint ---------- */
function bioSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}
async function bioAvailable() {
  if (!bioSupported()) return false;
  try { return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { return false; }
}
function bioRandom(n) {
  var b = new Uint8Array(n);
  window.crypto.getRandomValues(b);
  return b;
}
function bioToB64(buf) {
  var bytes = new Uint8Array(buf), s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bioFromB64(text) {
  var s = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var raw = atob(s), out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
// Name of the method on this device, for the texts
function bioMethodName() {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID / Touch ID';
  if (/Macintosh/.test(ua)) return 'Touch ID';
  if (/Windows/.test(ua)) return 'Windows Hello';
  return tk('account.bio.fingerprint');
}
function lkBioReady() {
  var c = bioCfg();
  return !!(c && c.id && c.user === bioUserId() && bioSupported());
}
// Creates the key in the secure chip; returns its ID
async function bioCreateKey() {
  if (!(await bioAvailable())) throw new Error(tk('account.bio.unavailable'));
  var u = null;
  try { u = pb.authStore.record || pb.authStore.model; } catch (e) { u = null; }
  if (!u || !u.id) throw new Error(tk('account.bio.failed'));
  var label = 'pinn. – ' + String(u.username || u.name || u.id).slice(0, 40);
  var cred = await navigator.credentials.create({
    publicKey: {
      challenge: bioRandom(32),
      rp: { name: 'pinn.' },
      user: { id: bioRandom(16), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred || !cred.rawId) throw new Error(tk('account.bio.failed'));
  return bioToB64(cred.rawId);
}
async function lkBioVerify() {
  var c = bioCfg();
  if (!c || !c.id || c.user !== bioUserId()) return false;
  try {
    var res = await navigator.credentials.get({
      publicKey: {
        challenge: bioRandom(32),
        allowCredentials: [{ type: 'public-key', id: bioFromB64(c.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch (e) { return false; }
}

/* ---------- PIN (the PIN of the profile, as on the family dashboard) ---------- */
function lkPinCache() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(LK_PIN_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || c.user !== bioUserId() || !c.hash || !c.salt) return null;
  return c;
}
// Length of the PIN of the profile: as the server last said, otherwise as cached on this device (0 = no PIN)
function lkPinLen() {
  try {
    if (typeof dashPinInfo !== 'undefined' && dashPinInfo && dashPinInfo.loaded) return Number(dashPinInfo.eigene) || 0;
  } catch (e) { /* not loaded yet */ }
  var c = lkPinCache();
  return c ? (c.len === 6 ? 6 : 4) : 0;
}
function lkHasPin() { return lkPinLen() > 0; }
function lkHasMethod() { return lkBioReady() || lkHasPin(); }
async function lkHash(pin, salt) {
  var text = String(salt) + ':' + String(pin);
  try {
    if (window.crypto && crypto.subtle) {
      var enc = new TextEncoder();
      var key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
      var bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(String(salt)), iterations: 100000, hash: 'SHA-256' }, key, 256);
      return 'p' + bioToB64(bits);
    }
  } catch (e) { /* insecure address: fall back below */ }
  // Fallback without Web Crypto (address without https): a simple iterated 53-bit hash – enough for a lock inside the app
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (var round = 0; round < 3000; round++) {
    for (var i = 0; i < text.length; i++) {
      var ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  }
  return 'f' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Called whenever the PIN was right or was just set on this device (js/dashboardkonto.js)
async function lkCachePin(pin) {
  var me = bioUserId();
  if (!me || !/^(\d{4}|\d{6})$/.test(String(pin || ''))) return;
  var salt = bioToB64(bioRandom(16));
  var hash = await lkHash(pin, salt);
  try { localStorage.setItem(LK_PIN_KEY, JSON.stringify({ user: me, salt: salt, hash: hash, len: String(pin).length })); } catch (e) { /* ignore */ }
}
function lkClearPinCache() {
  try { localStorage.removeItem(LK_PIN_KEY); } catch (e) { /* ignore */ }
}
// Checks a PIN: on the server when it can be reached, otherwise against the hash on this device. { ok, msg }
async function lkCheckPin(pin) {
  var res = null;
  try {
    if (navigator.onLine !== false && typeof apiFetch === 'function') {
      res = await apiFetch('/api/pinn/dashboard/pin-pruefen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: String(pin) }),
      });
    }
  } catch (e) { res = null; }
  if (res && res.status !== 404 && res.status < 500) {
    var body = {};
    try { body = await res.json(); } catch (e) { body = {}; }
    if (res.ok && body.ok) { lkFails = 0; await lkCachePin(pin); return { ok: true }; }
    if (res.ok && body.keine) {
      lkClearPinCache();
      try { if (typeof dashPinInfo !== 'undefined' && dashPinInfo) { dashPinInfo.eigene = 0; dashPinInfo.loaded = true; } } catch (e) { /* ignore */ }
      return { ok: false, msg: tk('lockc.noPin') };
    }
    if (res.status === 429) return { ok: false, msg: tk('mlock.tooMany') };
    return { ok: false, msg: tk('mlock.wrongPin') };
  }
  // No server (offline or an older server without the check): the PIN that was right last time on this device
  var c = lkPinCache();
  if (!c) return { ok: false, msg: tk('lockc.pinOffline') };
  if (Date.now() < lkBlockedUntil) return { ok: false, msg: tk('mlock.tooMany') };
  if ((await lkHash(pin, c.salt)) === c.hash) { lkFails = 0; return { ok: true }; }
  lkFails++;
  if (lkFails >= 5) { lkFails = 0; lkBlockedUntil = Date.now() + 30000; return { ok: false, msg: tk('mlock.tooMany') }; }
  return { ok: false, msg: tk('mlock.wrongPin') };
}
// Asks for the PIN on the PIN pad; resolves true / false. opts.top: above the lock screen of pinn.
function lkAskPin(opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var done = false;
    var overlay = document.getElementById('pinPadOverlay');
    if (opts.top && overlay) overlay.style.zIndex = '2147483100';
    var finish = function (ok) {
      if (done) return;
      done = true;
      if (overlay) overlay.style.zIndex = '';
      resolve(ok);
    };
    openPinPad({
      title: opts.title || tk('mlock.enterPin'), sub: opts.sub || '', length: lkPinLen() === 6 ? 6 : 4,
      cancelLabel: tk('common.cancel'),
      onComplete: async function (pin, pad) {
        var r = await lkCheckPin(pin);
        if (r.ok) { pad.close(); finish(true); return; }
        pad.fail(r.msg);
      },
      onCancel: function () { finish(false); },
    });
  });
}
// One unlock with whatever is set up: Face ID first, then the PIN
async function lkVerifyAny(opts) {
  var ok = false;
  if (lkBioReady()) ok = await lkBioVerify();
  if (!ok && lkHasPin()) ok = await lkAskPin(opts);
  return ok;
}
// Something is locked on this device (pinn. or menus) – changing the lock settings then needs one unlock
function lkSomethingLocked() {
  var c = bioCfg();
  if (c && c.user === bioUserId() && c.app) return true;
  try { if (typeof mlsActive === 'function' && mlsActive()) return true; } catch (e) { /* ignore */ }
  return false;
}
async function lkVerifyForChange() {
  if (!lkPersonalDevice() || !lkSomethingLocked() || !lkHasMethod() || Date.now() < lkVerifiedUntil) return true;
  var ok = await lkVerifyAny();
  if (ok) lkVerifiedUntil = Date.now() + LK_VERIFY_MS;
  else lkStatus(tk('mlock.verifyChange'));
  return ok;
}
function lkStatus(text) {
  var s = document.getElementById('bioStatus');
  if (s) s.textContent = text || '';
}

/* ---------- Lock pinn. ---------- */
// The lock applies on a personal device, to the profile that switched it on, with at least one way to unlock
function bioApplies() {
  var c = bioCfg();
  if (!c || !c.app || c.user !== bioUserId()) return false;
  if (!lkPersonalDevice()) return false;
  return lkHasMethod();
}
function bioBuildOverlay() {
  if (bioOverlay && bioOverlay.isConnected) return bioOverlay;
  var dark = document.documentElement.classList.contains('dark');
  var el = document.createElement('div');
  el.id = 'bioLockScreen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  // Lock symbol and title in the middle, the buttons at the bottom within thumb reach
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;' +
    'padding:24px;text-align:center;' +
    'padding-top:calc(24px + env(safe-area-inset-top, 0px));padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));' +
    'background:' + (dark ? '#141416' : 'var(--c-paper, #FFFBFB)') + ';color:' + (dark ? '#f2f2f2' : '#1f2328') + ';';
  var btnBase = 'width:100%;max-width:360px;border-radius:16px;font-size:16px;font-weight:600;cursor:pointer;';
  var line = dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)';
  el.innerHTML =
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">' +
      '<div style="font-size:52px;line-height:1">🔒</div>' +
      '<div data-bio="title" class="font-serif" style="font-size:24px;font-weight:600"></div>' +
      '<div data-bio="msg" style="font-size:14px;opacity:.65;min-height:20px;max-width:320px"></div>' +
    '</div>' +
    '<div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:10px">' +
      '<button type="button" data-bio="go" style="' + btnBase + 'display:none;align-items:center;justify-content:center;gap:10px;' +
        'min-height:58px;padding:14px 22px;border:0;background:var(--c-pine, #00374A);color:#fff;box-shadow:0 10px 24px -12px rgba(0,0,0,.45)">' +
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/>' +
        '<path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.1 3.6 1.1 5 0"/></svg><span data-bio="golabel"></span></button>' +
      '<button type="button" data-bio="pin" style="' + btnBase + 'display:none;min-height:52px;padding:12px 22px;border:0;background:var(--c-pine, #00374A);color:#fff"></button>' +
      '<button type="button" data-bio="pw" style="' + btnBase + 'min-height:46px;padding:10px 22px;font-weight:500;background:none;border:1px solid ' + line + ';color:inherit"></button>' +
    '</div>';
  el.querySelector('[data-bio="title"]').textContent = tk('lock.title');
  el.querySelector('[data-bio="golabel"]').textContent = tk('lock.unlock', { method: bioMethodName() });
  el.querySelector('[data-bio="pin"]').textContent = tk('mlock.enterPin');
  el.querySelector('[data-bio="pw"]').textContent = tk('lock.password');
  el.querySelector('[data-bio="go"]').addEventListener('click', function () { bioTryUnlock(true); });
  el.querySelector('[data-bio="pin"]').addEventListener('click', function () { bioTryPin(); });
  el.querySelector('[data-bio="pw"]').addEventListener('click', bioUsePassword);
  bioOverlay = el;
  return el;
}
// Shows the buttons of the methods that are set up (the PIN as a second, quieter button next to Face ID)
function bioOverlayButtons() {
  if (!bioOverlay) return;
  var dark = document.documentElement.classList.contains('dark');
  var bio = lkBioReady(), pin = lkHasPin();
  var go = bioOverlay.querySelector('[data-bio="go"]');
  var pb2 = bioOverlay.querySelector('[data-bio="pin"]');
  go.style.display = bio ? 'flex' : 'none';
  pb2.style.display = pin ? 'block' : 'none';
  pb2.style.background = bio ? 'none' : 'var(--c-pine, #00374A)';
  pb2.style.color = bio ? 'inherit' : '#fff';
  pb2.style.border = bio ? '1px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)') : '0';
}
function bioShowLock() {
  if (!bioApplies()) return;
  bioLocked = true;
  var el = bioBuildOverlay();
  if (!el.isConnected) (document.body || document.documentElement).appendChild(el);
  bioOverlayButtons();
  el.querySelector('[data-bio="msg"]').textContent = '';
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
}
function bioUnlockDone() {
  bioLocked = false;
  if (bioOverlay) { bioOverlay.remove(); bioOverlay = null; }
}
// Starts the unlock by itself: Face ID if set up, otherwise the PIN pad
function bioAutoUnlock() {
  if (!bioLocked) return;
  if (lkBioReady()) bioTryUnlock(false);
  else if (lkHasPin()) bioTryPin();
}
async function bioTryUnlock(byTap) {
  if (!bioLocked || bioBusy) return;
  if (!bioApplies()) { bioUnlockDone(); return; }
  if (document.hidden) return;
  bioBusy = true;
  var msg = bioOverlay ? bioOverlay.querySelector('[data-bio="msg"]') : null;
  try {
    if (await lkBioVerify()) bioUnlockDone();
    // Started by itself (byTap false): stay silent, the button is still there; after a tap show the hint
    else if (msg && byTap) msg.textContent = tk('lock.failed');
  } finally {
    bioBusy = false;
  }
}
async function bioTryPin() {
  if (!bioLocked || bioBusy || !lkHasPin()) return;
  if (document.hidden) return;
  bioBusy = true;
  try {
    if (await lkAskPin({ top: true })) bioUnlockDone();
  } finally {
    bioBusy = false;
  }
}
// "Sign in with password": switches off every lock of this device (pinn. and menus) and signs out
function bioUsePassword() {
  if (!confirm(tk('lock.passwordConfirm'))) return;
  bioSaveCfg(null);
  try { if (typeof mlsSave === 'function') mlsSave(null); } catch (e) { /* ignore */ }
  bioUnlockDone();
  try { if (typeof mlsHideGate === 'function') mlsHideGate(); } catch (e) { /* ignore */ }
  if (typeof logout === 'function') logout();
}

/* ---------- Settings → "Unlock & lock" ---------- */
// Face ID row, "Lock pinn.", the menu part (js/menuesperre.js) and the hint when no method is set up.
// The PIN part is rendered by js/dashboardkonto.js (renderDashPinSection).
async function renderLockCard() {
  var card = document.getElementById('settingsLockAccordion');
  if (!card) return;
  var personal = lkPersonalDevice();
  ['bioSection', 'appLockSub', 'lockHint'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !personal);
  });
  if (typeof mlsRenderCardAccess === 'function') mlsRenderCardAccess();
  var need = document.getElementById('lockNeedMethod');
  if (!personal) { if (need) need.classList.add('hidden'); return; }
  var method = bioMethodName();
  var title = document.getElementById('bioTitle');
  if (title) title.textContent = method;
  var ok = await bioAvailable();
  var c = lkCfg();
  var mine = !!c.id && lkBioReady();
  var btnCls = 'px-3 py-1.5 rounded-lg border border-ink/15 text-sm hover:border-pine transition';
  var row = document.getElementById('bioRow');
  if (row) {
    row.innerHTML = mine
      ? '<span class="text-sm flex-1">' + escapeHtml(tk('mlock.bioOn', { method: method })) + '</span><button type="button" data-lk-act="bio-off" class="' + btnCls + '">' + escapeHtml(tk('mlock.remove')) + '</button>'
      : (ok ? '<button type="button" data-lk-act="bio-on" class="' + btnCls + '">' + escapeHtml(tk('mlock.bioSet', { method: method })) + '</button>' : '');
  }
  var note = document.getElementById('bioUnavailable');
  if (note) note.classList.toggle('hidden', ok || mine);
  var has = lkHasMethod();
  var toggle = document.getElementById('bioToggle');
  var afterRow = document.getElementById('bioAfterRow');
  var after = document.getElementById('bioAfter');
  if (toggle) { toggle.checked = !!c.app; toggle.disabled = !c.app && !has; }
  if (afterRow) afterRow.classList.toggle('hidden', !c.app);
  if (after) after.value = String(c.after != null ? c.after : 1);
  if (typeof mlsRenderCard === 'function') mlsRenderCard();
  var menus = false;
  try { var mc = typeof mlsCfg === 'function' ? mlsCfg() : null; menus = !!(mc && mc.user === bioUserId() && mc.views.length); } catch (e) { menus = false; }
  if (need) {
    need.textContent = tk('mlock.needMethod', { method: method });
    need.classList.toggle('hidden', has || !(c.app || menus));
  }
}
async function lkOnClick(ev) {
  var t = ev.target.closest('[data-lk-act]');
  if (!t) return;
  var act = t.dataset.lkAct;
  lkStatus('');
  if (!(await lkVerifyForChange())) return;
  var c = lkCfg();
  try {
    if (act === 'bio-on') { c.id = await bioCreateKey(); lkStatus(tk('mlock.bioOn', { method: bioMethodName() })); }
    else if (act === 'bio-off') { c.id = ''; }
  } catch (e) {
    lkStatus((e && e.message && e.name !== 'NotAllowedError') ? e.message : tk('account.bio.failed'));
    return;
  }
  bioSaveCfg(c);
  if (!bioApplies()) bioUnlockDone();
  renderLockCard();
}
async function bioToggleChanged() {
  var toggle = document.getElementById('bioToggle');
  var want = toggle.checked;
  lkStatus('');
  toggle.checked = !want; // stays as it was until the change is allowed
  if (!(await lkVerifyForChange())) { renderLockCard(); return; }
  var c = lkCfg();
  if (want && !lkHasMethod()) { lkStatus(tk('mlock.needMethod', { method: bioMethodName() })); renderLockCard(); return; }
  c.app = want;
  bioSaveCfg(c);
  lkStatus(tk(want ? 'lockc.appOn' : 'lockc.appOff'));
  if (!want) bioUnlockDone();
  renderLockCard();
}
async function bioAfterChanged() {
  var sel = document.getElementById('bioAfter');
  var v = Number(sel.value);
  if (!(await lkVerifyForChange())) { renderLockCard(); return; }
  var c = lkCfg();
  c.after = [0, 1, 5, 15].indexOf(v) >= 0 ? v : 1;
  bioSaveCfg(c);
}

(function bioInit() {
  // Cold start: locked right away, before anything of the family is visible
  if (bioApplies()) {
    bioShowLock();
    setTimeout(bioAutoUnlock, 350);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { localStorage.setItem(BIO_AWAY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
      // "Immediately": cover pinn. already now, so the app switcher shows no family data
      var c = bioCfg();
      if (c && c.app && Number(c.after) === 0 && bioApplies()) bioShowLock();
      return;
    }
    var cfg = bioCfg();
    if (!cfg || !bioApplies()) { if (bioLocked) bioUnlockDone(); return; }
    var away = 0;
    try { away = Date.now() - Number(localStorage.getItem(BIO_AWAY_KEY) || Date.now()); } catch (e) { away = 0; }
    if (bioLocked || away >= Number(cfg.after || 0) * 60000) {
      bioShowLock();
      setTimeout(bioAutoUnlock, 350);
    }
  });
  var toggle = document.getElementById('bioToggle');
  if (toggle) toggle.addEventListener('change', bioToggleChanged);
  var after = document.getElementById('bioAfter');
  if (after) after.addEventListener('change', bioAfterChanged);
  var row = document.getElementById('bioRow');
  if (row) row.addEventListener('click', lkOnClick);
  var card = document.getElementById('settingsLockAccordion');
  if (card) card.addEventListener('toggle', function () { if (card.open) renderLockCard(); });
  // Signed out: forget that the settings were unlocked a moment ago
  try {
    pb.authStore.onChange(function () {
      var valid = false;
      try { valid = pb.authStore.isValid; } catch (e) { valid = false; }
      if (!valid) { lkVerifiedUntil = 0; lkFails = 0; }
    });
  } catch (e) { /* pb not ready */ }
  // The settings page calls renderLockCard when it opens (js/konto.js)
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('entsperren');
