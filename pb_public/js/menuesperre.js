/* pinn. – Lock single menus with Face ID / fingerprint or a PIN (js/menuesperre.js, since 1.162.0)
   Classic script, no build step: loaded after js/entsperren.js, whose helpers it uses (bioAvailable, bioMethodName,
   bioRandom, bioToB64, bioFromB64, bioUserId, bioUserRole); the load order is listed in src/rahmen.html and in pinn-setup.sh.
   What it does:
   - Settings → "Lock menus": the person picks which menus are locked (Board, Chat, Finance, Documents …) and how they
     are opened: Face ID / Touch ID / fingerprint of the device (Web Authentication, like js/entsperren.js) and / or an
     own PIN of 4 or 6 digits (the PIN pad of the family dashboard, js/pineingabe.js).
   - When a locked menu is opened (setView in js/ansichten.js calls mlsCheck) a full-screen lock appears over it. After
     unlocking it stays open until the person leaves the menu ("immediately") or for 1 / 5 / 15 minutes of use.
     Coming back from the background re-locks a locked menu that is still open once that time is over.
   - Changing the settings while a lock is active asks for the unlock once (5 minutes), so nobody can simply switch it off.
   - Forgotten PIN or broken sensor: "Sign in with password" signs this device out and removes the menu lock of this
     device (like js/entsperren.js) – nobody is locked out for good.
   - Stored on the device only (localStorage pinn.menuesperre): { user, views: [view ids], bio: key ID | '', pin: { salt, hash, len } | null,
     after: minutes }. The PIN is stored as a salted hash. This is a lock inside the app for a personal device – it does not
     replace the screen lock of the device. Not for guests, the main admin and the family dashboard. */

var MLS_KEY = 'pinn.menuesperre';
var MLS_VIEWS = [
  ['uebersicht', 'nav.overview'], ['pinnwand', 'nav.board'], ['chat', 'nav.chat'], ['termine', 'nav.calendar'],
  ['aufgaben', 'nav.tasks'], ['familie', 'nav.family'], ['rezepte', 'nav.recipes'], ['vorrat', 'nav.pantry'],
  ['einkauf', 'nav.lists'], ['finanzen', 'nav.finance'], ['dokumente', 'nav.documents'], ['fahrzeuge', 'nav.vehicles'],
  ['haus', 'nav.home'],
];
var MLS_AWAY_KEY = 'pinn.menuesperre.weg';
var MLS_VERIFY_MS = 5 * 60 * 1000;   // after one unlock the settings can be changed for 5 minutes
var mlsOpenUntil = 0;                // unlocked until (timestamps), for "after n minutes"
var mlsOpenView = '';                // unlocked view for "immediately"
var mlsLastFree = 'konto';           // last view that was not locked (target of "back")
var mlsGate = null;                  // { view, el }
var mlsBusy = false;
var mlsFails = 0;
var mlsBlockedUntil = 0;
var mlsVerifiedUntil = 0;

/* ---------- Stored settings ---------- */
function mlsNormView(view) { return view === 'haushalt' ? 'aufgaben' : view; }
function mlsCfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(MLS_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !c.user) return null;
  c.views = Array.isArray(c.views) ? c.views.filter(function (v) { return MLS_VIEWS.some(function (x) { return x[0] === v; }); }) : [];
  c.after = [0, 1, 5, 15].indexOf(Number(c.after)) >= 0 ? Number(c.after) : 5;
  c.bio = c.bio || '';
  c.pin = c.pin && c.pin.hash && c.pin.salt ? c.pin : null;
  return c;
}
function mlsSave(c) {
  try {
    if (c) localStorage.setItem(MLS_KEY, JSON.stringify(c));
    else localStorage.removeItem(MLS_KEY);
  } catch (e) { /* storage full or blocked */ }
}
function mlsAllowedHere() {
  try { if (!pb.authStore.isValid) return false; } catch (e) { return false; }
  var role = bioUserRole();
  if (!bioUserId() || role === 'gast' || role === 'hauptadmin') return false;
  try { if (typeof isDashboardDevice === 'function' && isDashboardDevice()) return false; } catch (e) { /* not known yet */ }
  return true;
}
// The lock works only for the profile that set it up, and only with at least one way to unlock
function mlsActive() {
  var c = mlsCfg();
  if (!c || c.user !== bioUserId() || !c.views.length || !(c.bio || c.pin)) return null;
  return mlsAllowedHere() ? c : null;
}
function mlsMenuName(view) {
  var m = MLS_VIEWS.find(function (x) { return x[0] === mlsNormView(view); });
  return m ? tk(m[1]) : view;
}

/* ---------- PIN: salted hash ---------- */
function mlsRandomSalt() { return bioToB64(bioRandom(16)); }
async function mlsHash(pin, salt) {
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
async function mlsPinMatches(cfg, pin) {
  if (!cfg || !cfg.pin) return false;
  return (await mlsHash(pin, cfg.pin.salt)) === cfg.pin.hash;
}

/* ---------- Unlocking ---------- */
function mlsBioReady(c) { return !!(c && c.bio); }
async function mlsBioVerify(c) {
  try {
    var res = await navigator.credentials.get({
      publicKey: {
        challenge: bioRandom(32),
        allowCredentials: [{ type: 'public-key', id: bioFromB64(c.bio), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return !!res;
  } catch (e) { return false; }
}
// Asks for the PIN on the PIN pad; resolves true / false
function mlsAskPin(c, title) {
  return new Promise(function (resolve) {
    var done = false;
    var finish = function (ok) { if (!done) { done = true; resolve(ok); } };
    openPinPad({
      title: title || tk('mlock.enterPin'), sub: '', length: c.pin.len === 6 ? 6 : 4,
      cancelLabel: tk('common.cancel'),
      onComplete: async function (pin, pad) {
        if (Date.now() < mlsBlockedUntil) { pad.fail(tk('mlock.tooMany')); return; }
        if (await mlsPinMatches(c, pin)) { mlsFails = 0; pad.close(); finish(true); return; }
        mlsFails++;
        if (mlsFails >= 5) { mlsFails = 0; mlsBlockedUntil = Date.now() + 30000; pad.fail(tk('mlock.tooMany')); return; }
        pad.fail(tk('mlock.wrongPin'));
      },
      onCancel: function () { finish(false); },
    });
  });
}
function mlsMarkOpen(c, view) {
  mlsOpenView = mlsNormView(view);
  mlsOpenUntil = Date.now() + c.after * 60000;
}
function mlsIsOpen(c, view) {
  if (c.after === 0) return mlsOpenView === mlsNormView(view);
  return Date.now() < mlsOpenUntil;
}
// Called by setView before a menu is shown
function mlsCheck(view) {
  var c = mlsActive();
  var v = mlsNormView(view);
  if (!c) { mlsHideGate(); return; }
  if (c.after === 0 && mlsOpenView && mlsOpenView !== v) mlsOpenView = '';
  if (c.views.indexOf(v) < 0) { mlsLastFree = v; mlsHideGate(); return; }
  if (mlsIsOpen(c, v)) { if (c.after > 0) mlsOpenUntil = Date.now() + c.after * 60000; mlsHideGate(); return; }
  mlsShowGate(v);
}

/* ---------- Lock screen over a locked menu ---------- */
function mlsHideGate() {
  if (mlsGate) { mlsGate.el.remove(); mlsGate = null; }
}
function mlsShowGate(view) {
  var c = mlsActive();
  if (!c) return;
  if (mlsGate && mlsGate.view === view) return;
  mlsHideGate();
  var dark = document.documentElement.classList.contains('dark');
  var el = document.createElement('div');
  el.id = 'mlsGate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  // z-index below the PIN pad (420), above pages, sidebar and bottom bar
  el.style.cssText = 'position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;align-items:center;padding:24px;text-align:center;' +
    'padding-top:calc(24px + env(safe-area-inset-top, 0px));padding-bottom:calc(20px + env(safe-area-inset-bottom, 0px));' +
    'background:' + (dark ? '#141416' : 'var(--c-paper, #FFFBFB)') + ';color:' + (dark ? '#f2f2f2' : '#1f2328') + ';';
  var btn = 'width:100%;max-width:360px;border-radius:16px;font-size:16px;font-weight:600;cursor:pointer;min-height:52px;padding:12px 22px;';
  el.innerHTML =
    '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">' +
      '<div style="font-size:48px;line-height:1">🔒</div>' +
      '<div data-mls="title" class="font-serif" style="font-size:24px;font-weight:600"></div>' +
      '<div data-mls="msg" style="font-size:14px;opacity:.65;min-height:20px;max-width:320px"></div>' +
    '</div>' +
    '<div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:10px">' +
      '<button type="button" data-mls="bio" style="' + btn + 'border:0;background:var(--c-pine, #00374A);color:#fff;display:none"></button>' +
      '<button type="button" data-mls="pin" style="' + btn + 'border:0;background:var(--c-pine, #00374A);color:#fff;display:none"></button>' +
      '<button type="button" data-mls="back" style="' + btn + 'font-weight:500;background:none;border:1px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)') + ';color:inherit"></button>' +
      '<button type="button" data-mls="pw" style="width:100%;max-width:360px;font-size:13px;opacity:.6;background:none;border:0;padding:8px;color:inherit;cursor:pointer"></button>' +
    '</div>';
  var q = function (n) { return el.querySelector('[data-mls="' + n + '"]'); };
  q('title').textContent = tk('mlock.gateTitle', { menu: mlsMenuName(view) });
  q('msg').textContent = tk('mlock.gateMsg', { method: bioMethodName() });
  q('back').textContent = tk('mlock.back');
  q('pw').textContent = tk('lock.password');
  if (mlsBioReady(c)) { q('bio').style.display = 'block'; q('bio').textContent = tk('lock.unlock', { method: bioMethodName() }); }
  if (c.pin) {
    q('pin').style.display = 'block'; q('pin').textContent = tk('mlock.enterPin');
    if (mlsBioReady(c)) { q('pin').style.background = 'none'; q('pin').style.color = 'inherit'; q('pin').style.border = '1px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)'); }
  }
  q('bio').addEventListener('click', function () { mlsGateBio(); });
  q('pin').addEventListener('click', function () { mlsGatePin(); });
  q('back').addEventListener('click', mlsGateBack);
  q('pw').addEventListener('click', mlsUsePassword);
  document.body.appendChild(el);
  mlsGate = { view: view, el: el };
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
  // Only a PIN: the PIN pad opens right away; with Face ID the device asks by itself
  if (c.pin && !mlsBioReady(c)) setTimeout(function () { if (mlsGate && mlsGate.view === view) mlsGatePin(); }, 150);
  else if (mlsBioReady(c)) setTimeout(function () { if (mlsGate && mlsGate.view === view) mlsGateBio(true); }, 350);
}
function mlsGateUnlocked() {
  var c = mlsActive();
  if (!mlsGate) return;
  var view = mlsGate.view;
  if (c) mlsMarkOpen(c, view);
  mlsHideGate();
}
async function mlsGateBio(quiet) {
  var c = mlsActive();
  if (!c || !mlsGate || mlsBusy || document.hidden) return;
  mlsBusy = true;
  try {
    if (await mlsBioVerify(c)) mlsGateUnlocked();
    else if (!quiet && mlsGate) mlsGate.el.querySelector('[data-mls="msg"]').textContent = tk('lock.failed');
  } finally { mlsBusy = false; }
}
async function mlsGatePin() {
  var c = mlsActive();
  if (!c || !c.pin || !mlsGate) return;
  if (await mlsAskPin(c)) mlsGateUnlocked();
}
function mlsGateBack() {
  mlsHideGate();
  var target = mlsLastFree;
  var c = mlsActive();
  if (c && c.views.indexOf(mlsNormView(target)) >= 0) target = 'konto';
  if (typeof setView === 'function') setView(target || 'konto');
}
function mlsUsePassword() {
  if (!confirm(tk('lock.passwordConfirm'))) return;
  mlsSave(null);
  mlsHideGate();
  if (typeof logout === 'function') logout();
}

// Back from the background: a locked menu that is still open closes again after the chosen time
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    try { localStorage.setItem(MLS_AWAY_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    return;
  }
  var c = mlsActive();
  if (!c || typeof currentView === 'undefined') return;
  var v = mlsNormView(currentView);
  if (c.views.indexOf(v) < 0) return;
  var away = 0;
  try { away = Date.now() - Number(localStorage.getItem(MLS_AWAY_KEY) || Date.now()); } catch (e) { away = 0; }
  if (away >= c.after * 60000) { mlsOpenView = ''; mlsOpenUntil = 0; mlsShowGate(v); }
});

/* ---------- Settings → Lock menus ---------- */
// Changing needs one unlock while a lock is active
async function mlsVerifyForChange() {
  var c = mlsActive();
  if (!c || Date.now() < mlsVerifiedUntil) return true;
  var ok = false;
  if (mlsBioReady(c)) ok = await mlsBioVerify(c);
  if (!ok && c.pin) ok = await mlsAskPin(c);
  if (ok) mlsVerifiedUntil = Date.now() + MLS_VERIFY_MS;
  else mlsStatus(tk('mlock.verifyChange'));
  return ok;
}
function mlsStatus(text) {
  var s = document.getElementById('mlsStatus');
  if (s) s.textContent = text || '';
}
function mlsWorkingCfg() {
  var c = mlsCfg();
  var me = bioUserId();
  if (!c || c.user !== me) c = { user: me, views: [], bio: '', pin: null, after: 5 };
  return c;
}
function mlsRenderCardAccess() {
  var acc = document.getElementById('settingsMenuLockAccordion');
  if (!acc) return;
  var ok = mlsAllowedHere();
  acc.classList.toggle('hidden', !ok);
  if (!ok && acc.open) acc.open = false;
}
async function mlsRenderCard() {
  var box = document.getElementById('mlsBody');
  if (!box || !mlsAllowedHere()) return;
  var c = mlsWorkingCfg();
  var method = bioMethodName();
  var bioOk = await bioAvailable();
  var items = MLS_VIEWS.map(function (m) {
    return '<label class="flex items-center gap-2 text-sm cursor-pointer py-1"><input type="checkbox" data-mls-view="' + m[0] + '"' + (c.views.indexOf(m[0]) >= 0 ? ' checked' : '') +
      ' class="w-4 h-4 accent-[var(--c-pine)]"><span>' + escapeHtml(tk(m[1])) + '</span></label>';
  }).join('');
  var btnCls = 'px-3 py-1.5 rounded-lg border border-ink/15 text-sm hover:border-pine transition';
  var bioRow = c.bio
    ? '<span class="text-sm flex-1">' + escapeHtml(tk('mlock.bioOn', { method: method })) + '</span><button type="button" data-mls-act="bio-off" class="' + btnCls + '">' + escapeHtml(tk('mlock.remove')) + '</button>'
    : (bioOk ? '<button type="button" data-mls-act="bio-on" class="' + btnCls + '">' + escapeHtml(tk('mlock.bioSet', { method: method })) + '</button>'
      : '<span class="text-xs text-ink/45">' + escapeHtml(tk('account.bio.unavailable')) + '</span>');
  var pinRow = c.pin
    ? '<span class="text-sm flex-1">' + escapeHtml(tk('mlock.pinOn')) + '</span><button type="button" data-mls-act="pin-set" class="' + btnCls + '">' + escapeHtml(tk('mlock.pinChange')) + '</button><button type="button" data-mls-act="pin-off" class="' + btnCls + '">' + escapeHtml(tk('mlock.remove')) + '</button>'
    : '<button type="button" data-mls-act="pin-set" class="' + btnCls + '">' + escapeHtml(tk('mlock.pinSet')) + '</button>';
  var noMethod = !(c.bio || c.pin) && c.views.length;
  box.innerHTML =
    '<p class="text-sm text-ink/70 leading-relaxed mb-3">' + escapeHtml(tk('mlock.intro', { method: method })) + '</p>' +
    '<p class="text-xs uppercase tracking-wide text-ink/40 mb-1">' + escapeHtml(tk('mlock.menus')) + '</p>' +
    '<div class="grid grid-cols-2 gap-x-4 mb-4">' + items + '</div>' +
    '<div class="flex items-center gap-2 mb-2 flex-wrap">' + bioRow + '</div>' +
    '<div class="flex items-center gap-2 mb-3 flex-wrap">' + pinRow + '</div>' +
    '<div class="flex items-center gap-3 mb-2"><span class="text-sm">' + escapeHtml(tk('account.bio.after')) + '</span>' +
      '<select id="mlsAfter" class="rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white">' +
      [[0, 'account.bio.now'], [1, 'account.bio.min1'], [5, 'account.bio.min5'], [15, 'account.bio.min15']].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.after === o[0] ? ' selected' : '') + '>' + escapeHtml(tk(o[1])) + '</option>';
      }).join('') + '</select></div>' +
    (noMethod ? '<p class="text-xs text-mustard mt-2">' + escapeHtml(tk('mlock.needMethod', { method: method })) + '</p>' : '') +
    '<p id="mlsStatus" class="text-xs text-ink/50 mt-2"></p>' +
    '<p class="text-[11px] text-ink/40 mt-2">' + escapeHtml(tk('mlock.hint')) + '</p>' +
    ((c.views.length || c.bio || c.pin) ? '<button type="button" data-mls-act="reset" class="mt-3 ' + btnCls + ' text-ink/60">' + escapeHtml(tk('mlock.reset')) + '</button>' : '');
}
async function mlsBioEnable() {
  var u = null;
  try { u = pb.authStore.record || pb.authStore.model; } catch (e) { u = null; }
  if (!u || !u.id) throw new Error(tk('account.bio.failed'));
  var label = 'pinn. – ' + String(u.username || u.name || u.id).slice(0, 40);
  var cred = await navigator.credentials.create({
    publicKey: {
      challenge: bioRandom(32), rp: { name: 'pinn.' },
      user: { id: bioRandom(16), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    },
  });
  if (!cred || !cred.rawId) throw new Error(tk('account.bio.failed'));
  return bioToB64(cred.rawId);
}
// Two PIN entries (set and repeat); resolves the PIN or '' when cancelled
function mlsSetPin() {
  return new Promise(function (resolve) {
    var first = '', done = false;
    var finish = function (v) { if (!done) { done = true; resolve(v); } };
    openPinPad({
      title: tk('mlock.newPin'), sub: '', length: 4, lengthChoice: true, cancelLabel: tk('common.cancel'),
      onComplete: function (pin, pad) {
        if (!first) { first = pin; pad.showLengthChoice(false); pad.reset(tk('mlock.repeatPin')); return; }
        if (pin !== first) { first = ''; pad.showLengthChoice(true); pad.reset(''); pad.fail(tk('mlock.pinMismatch')); return; }
        pad.close(); finish(pin);
      },
      onCancel: function () { finish(''); },
    });
  });
}
async function mlsOnClick(ev) {
  var t = ev.target.closest('[data-mls-act]');
  if (!t) return;
  var act = t.dataset.mlsAct;
  if (!(await mlsVerifyForChange())) return;
  var c = mlsWorkingCfg();
  try {
    if (act === 'bio-on') { c.bio = await mlsBioEnable(); }
    else if (act === 'bio-off') { c.bio = ''; }
    else if (act === 'pin-set') {
      var pin = await mlsSetPin();
      if (!pin) return;
      var salt = mlsRandomSalt();
      c.pin = { salt: salt, hash: await mlsHash(pin, salt), len: pin.length };
    }
    else if (act === 'pin-off') { c.pin = null; }
    else if (act === 'reset') { mlsSave(null); mlsHideGate(); mlsOpenUntil = 0; mlsOpenView = ''; mlsRenderCard(); return; }
  } catch (e) {
    mlsStatus((e && e.message && e.name !== 'NotAllowedError') ? e.message : tk('account.bio.failed'));
    return;
  }
  mlsSave(c);
  mlsRenderCard();
}
async function mlsOnChange(ev) {
  var t = ev.target;
  var isView = t.matches && t.matches('[data-mls-view]');
  var isAfter = t.id === 'mlsAfter';
  if (!isView && !isAfter) return;
  if (!(await mlsVerifyForChange())) { mlsRenderCard(); return; }
  var c = mlsWorkingCfg();
  if (isView) {
    c.views = c.views.filter(function (v) { return v !== t.dataset.mlsView; });
    if (t.checked) c.views.push(t.dataset.mlsView);
  } else {
    c.after = Number(t.value);
  }
  mlsSave(c);
  mlsOpenUntil = 0; mlsOpenView = '';
  mlsRenderCard();
}
(function mlsInit() {
  var acc = document.getElementById('settingsMenuLockAccordion');
  var box = document.getElementById('mlsBody');
  if (box) { box.addEventListener('click', mlsOnClick); box.addEventListener('change', mlsOnChange); }
  if (acc) acc.addEventListener('toggle', function () { if (acc.open) mlsRenderCard(); });
  // Signed out (profile switch, logout): the lock screen must not stay over the login screen
  try {
    pb.authStore.onChange(function () {
      var valid = false;
      try { valid = pb.authStore.isValid; } catch (e) { valid = false; }
      if (!valid) { mlsHideGate(); mlsOpenUntil = 0; mlsOpenView = ''; mlsVerifiedUntil = 0; }
    });
  } catch (e) { /* pb not ready: the lock screen is replaced on the next menu change anyway */ }
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('menuesperre');
