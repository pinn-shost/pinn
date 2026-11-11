/* pinn. – Unlock with Face ID, Touch ID or fingerprint (js/entsperren.js, since 1.147.0)
   Classic script, no build step: loaded after js/geraete.js (the load order is listed in src/rahmen.html and in
   pinn-setup.sh).
   Contents:
   - Account → "Face ID / fingerprint": switch per device plus "lock after" (immediately, 1, 5 or 15 minutes).
   - Switching it on creates a key in the secure chip of the device (Web Authentication, "platform authenticator").
     The device itself checks the face or the finger – pinn. and the server never see any of it, nothing is sent.
   - Lock screen: when pinn. is opened and when it comes back from the background after the chosen time. A tap on
     "Unlock" asks the device for Face ID / Touch ID / fingerprint; "Sign in with password" signs this device out,
     so a forgotten or broken sensor never locks anybody out.
   - Works on iPhone/iPad (Face ID, Touch ID), Android (fingerprint, face unlock) and on computers with Touch ID or
     Windows Hello. Needs an https address. Not on the family dashboard and not for guests (no password).
   - Stored on the device only (localStorage pinn.entsperren): { id: key ID, user: profile ID, after: minutes }. */

var BIO_KEY = 'pinn.entsperren';
var BIO_AWAY_KEY = 'pinn.entsperren.weg';    // time pinn. went to the background
var bioLocked = false;
var bioBusy = false;
var bioOverlay = null;

function bioCfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(BIO_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !c.id || !c.user) return null;
  return c;
}
function bioSaveCfg(c) {
  try {
    if (c) localStorage.setItem(BIO_KEY, JSON.stringify(c));
    else localStorage.removeItem(BIO_KEY);
  } catch (e) { /* storage full or blocked */ }
}
function bioUserId() {
  try { var u = pb.authStore.record || pb.authStore.model; return (u && u.id) || ''; } catch (e) { return ''; }
}
function bioUserRole() {
  try { var u = pb.authStore.record || pb.authStore.model; return (u && u.rolle) || ''; } catch (e) { return ''; }
}
// Lock only applies on a personal device, to the profile that switched it on
function bioApplies() {
  var c = bioCfg();
  if (!c) return false;
  try { if (!pb.authStore.isValid) return false; } catch (e) { return false; }
  if (c.user !== bioUserId()) return false;
  if (bioUserRole() === 'gast' || bioUserRole() === 'hauptadmin') return false;
  try { if (typeof isDashboardDevice === 'function' && isDashboardDevice()) return false; } catch (e) { /* not known yet */ }
  return true;
}
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

/* ---------- Switching on and off ---------- */
async function bioEnable() {
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
  var old = bioCfg();
  bioSaveCfg({ id: bioToB64(cred.rawId), user: u.id, after: old && old.user === u.id ? old.after : 1 });
}
function bioDisable() {
  bioSaveCfg(null);
  bioUnlockDone();
}

/* ---------- Lock screen ---------- */
function bioBuildOverlay() {
  if (bioOverlay && bioOverlay.isConnected) return bioOverlay;
  var dark = document.documentElement.classList.contains('dark');
  var el = document.createElement('div');
  el.id = 'bioLockScreen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:14px;padding:24px;text-align:center;' +
    'padding-top:calc(24px + env(safe-area-inset-top, 0px));padding-bottom:calc(24px + env(safe-area-inset-bottom, 0px));' +
    'background:' + (dark ? '#141416' : 'var(--c-paper, #FFFBFB)') + ';color:' + (dark ? '#f2f2f2' : '#1f2328') + ';';
  var btnBase = 'border-radius:12px;padding:12px 22px;font-size:16px;font-weight:600;cursor:pointer;min-width:220px;';
  el.innerHTML =
    '<div style="font-size:52px;line-height:1">🔒</div>' +
    '<div class="font-serif" style="font-size:24px;font-weight:600"></div>' +
    '<div data-bio="msg" style="font-size:14px;opacity:.65;min-height:20px;max-width:320px"></div>' +
    '<button type="button" data-bio="go" style="' + btnBase + 'border:0;background:var(--c-pine, #00374A);color:#fff"></button>' +
    '<button type="button" data-bio="pw" style="' + btnBase + 'font-weight:500;background:none;border:1px solid ' +
    (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)') + ';color:inherit"></button>';
  el.children[1].textContent = tk('lock.title');
  el.querySelector('[data-bio="go"]').textContent = tk('lock.unlock', { method: bioMethodName() });
  el.querySelector('[data-bio="pw"]').textContent = tk('lock.password');
  el.querySelector('[data-bio="go"]').addEventListener('click', function () { bioTryUnlock(true); });
  el.querySelector('[data-bio="pw"]').addEventListener('click', bioUsePassword);
  bioOverlay = el;
  return el;
}
function bioShowLock() {
  if (!bioApplies()) return;
  bioLocked = true;
  var el = bioBuildOverlay();
  if (!el.isConnected) (document.body || document.documentElement).appendChild(el);
  el.querySelector('[data-bio="msg"]').textContent = '';
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
}
function bioUnlockDone() {
  bioLocked = false;
  if (bioOverlay) { bioOverlay.remove(); bioOverlay = null; }
}
async function bioTryUnlock(byTap) {
  if (!bioLocked || bioBusy) return;
  var c = bioCfg();
  if (!c || !bioApplies()) { bioUnlockDone(); return; }
  if (document.hidden) return;
  bioBusy = true;
  var msg = bioOverlay ? bioOverlay.querySelector('[data-bio="msg"]') : null;
  try {
    var res = await navigator.credentials.get({
      publicKey: {
        challenge: bioRandom(32),
        allowCredentials: [{ type: 'public-key', id: bioFromB64(c.id), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    if (res) bioUnlockDone();
  } catch (e) {
    // Without a tap some browsers refuse at once – then the button is the way (no message for that first try)
    if (msg && byTap) msg.textContent = tk('lock.failed');
  } finally {
    bioBusy = false;
  }
}
function bioUsePassword() {
  if (!confirm(tk('lock.passwordConfirm'))) return;
  bioSaveCfg(null);
  bioUnlockDone();
  if (typeof logout === 'function') logout();
}

/* ---------- Account → Face ID / fingerprint ---------- */
async function renderBioSection() {
  var sec = document.getElementById('bioSection');
  if (!sec) return;
  var role = bioUserRole();
  var dash = false;
  try { dash = typeof isDashboardDevice === 'function' && isDashboardDevice(); } catch (e) { dash = false; }
  var hide = !bioUserId() || role === 'gast' || role === 'hauptadmin' || dash;
  sec.classList.toggle('hidden', hide);
  if (hide) return;
  var title = document.getElementById('bioTitle');
  if (title) title.textContent = tk('account.bio.title', { method: bioMethodName() });
  var ok = await bioAvailable();
  var c = bioCfg();
  var on = !!(c && c.user === bioUserId());
  var toggle = document.getElementById('bioToggle');
  var after = document.getElementById('bioAfter');
  var afterRow = document.getElementById('bioAfterRow');
  var note = document.getElementById('bioUnavailable');
  toggle.checked = on;
  toggle.disabled = !ok && !on;
  note.classList.toggle('hidden', ok || on);
  afterRow.classList.toggle('hidden', !on);
  after.value = String(on && c.after != null ? c.after : 1);
}
async function bioToggleChanged() {
  var toggle = document.getElementById('bioToggle');
  var status = document.getElementById('bioStatus');
  status.textContent = '';
  if (toggle.checked) {
    toggle.disabled = true;
    try {
      await bioEnable();
      status.textContent = tk('account.bio.on', { method: bioMethodName() });
    } catch (e) {
      toggle.checked = false;
      status.textContent = (e && e.message && e.name !== 'NotAllowedError') ? e.message : tk('account.bio.failed');
    }
    toggle.disabled = false;
  } else {
    bioDisable();
    status.textContent = tk('account.bio.off');
  }
  renderBioSection();
}
function bioAfterChanged() {
  var c = bioCfg();
  if (!c) return;
  var v = Number(document.getElementById('bioAfter').value);
  c.after = [0, 1, 5, 15].indexOf(v) >= 0 ? v : 1;
  bioSaveCfg(c);
}

(function bioInit() {
  // Cold start: locked right away, before anything of the family is visible
  if (bioApplies()) {
    bioShowLock();
    setTimeout(function () { bioTryUnlock(false); }, 350);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { localStorage.setItem(BIO_AWAY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
      // "Immediately": cover pinn. already now, so the app switcher shows no family data
      var c = bioCfg();
      if (c && Number(c.after) === 0 && bioApplies()) bioShowLock();
      return;
    }
    var cfg = bioCfg();
    if (!cfg || !bioApplies()) { if (bioLocked) bioUnlockDone(); return; }
    var away = 0;
    try { away = Date.now() - Number(localStorage.getItem(BIO_AWAY_KEY) || Date.now()); } catch (e) { away = 0; }
    if (bioLocked || away >= Number(cfg.after || 0) * 60000) {
      bioShowLock();
      setTimeout(function () { bioTryUnlock(false); }, 350);
    }
  });
  var toggle = document.getElementById('bioToggle');
  if (toggle) toggle.addEventListener('change', bioToggleChanged);
  var after = document.getElementById('bioAfter');
  if (after) after.addEventListener('change', bioAfterChanged);
  // The account page calls renderBioSection when it opens (js/konto.js)
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('entsperren');
