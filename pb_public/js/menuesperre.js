/* pinn. – Lock single menus with Face ID / fingerprint or the PIN (js/menuesperre.js, since 1.162.0)
   Classic script, no build step: loaded after js/entsperren.js, whose helpers it uses (lkBioReady, lkHasPin, lkHasMethod,
   lkBioVerify, lkAskPin, lkVerifyForChange, lkPersonalDevice, bioMethodName, bioUserId); the load order is listed in
   src/rahmen.html and in pinn-setup.sh.
   What it does:
   - Settings → "Unlock & lock" → "Lock menus": the person picks which menus are locked (Board, Chat, Finance, Documents …).
     Since 1.164.0 they open with the same methods as everything else: Face ID / Touch ID / fingerprint of the device and
     the PIN of the profile (the PIN of the family dashboard) – both set up once in the same card (js/entsperren.js).
   - When a locked menu is opened (setView in js/ansichten.js calls mlsCheck) a full-screen lock appears over it. After
     unlocking it stays open until the person leaves the menu ("immediately") or for 1 / 5 / 15 minutes of use.
     Coming back from the background re-locks a locked menu that is still open once that time is over.
   - Changing the settings while a lock is active asks for the unlock once (5 minutes), so nobody can simply switch it off.
   - Forgotten PIN or broken sensor: "Sign in with password" signs this device out and removes the locks of this
     device (like js/entsperren.js) – nobody is locked out for good.
   - Stored on the device only (localStorage pinn.menuesperre): { user, views: [view ids], after: minutes }. Until 1.163 it
     also held an own Face ID key ("bio") and an own PIN ("pin"): the key is taken over as the Face ID of the device, the
     own PIN is dropped (the PIN of the profile applies). This is a lock inside the app for a personal device – it does not
     replace the screen lock of the device. Not for guests, the main admin and the family dashboard. */

var MLS_KEY = 'pinn.menuesperre';
var MLS_VIEWS = [
  ['uebersicht', 'nav.overview'], ['pinnwand', 'nav.board'], ['chat', 'nav.chat'], ['termine', 'nav.calendar'],
  ['aufgaben', 'nav.tasks'], ['familie', 'nav.family'], ['rezepte', 'nav.recipes'], ['vorrat', 'nav.pantry'],
  ['einkauf', 'nav.lists'], ['finanzen', 'nav.finance'], ['dokumente', 'nav.documents'], ['fahrzeuge', 'nav.vehicles'],
  ['haus', 'nav.home'],
];
var MLS_AWAY_KEY = 'pinn.menuesperre.weg';
var mlsOpenUntil = 0;                // unlocked until (timestamps), for "after n minutes"
var mlsOpenView = '';                // unlocked view for "immediately"
var mlsLastFree = 'konto';           // last view that was not locked (target of "back")
var mlsGate = null;                  // { view, el }
var mlsBusy = false;

/* ---------- Stored settings ---------- */
function mlsNormView(view) { return view === 'haushalt' ? 'aufgaben' : view; }
function mlsCfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(MLS_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !c.user) return null;
  c.views = Array.isArray(c.views) ? c.views.filter(function (v) { return MLS_VIEWS.some(function (x) { return x[0] === v; }); }) : [];
  c.after = [0, 1, 5, 15].indexOf(Number(c.after)) >= 0 ? Number(c.after) : 5;
  if ('bio' in c || 'pin' in c) {
    // Stored by 1.162/1.163: an own Face ID key becomes the Face ID of this device (if it has none yet), an own PIN is dropped
    try {
      var b = bioCfg();
      if (c.bio && (!b || b.user !== c.user || !b.id)) {
        var nb = (b && b.user === c.user) ? b : { user: c.user, id: '', app: false, after: 1 };
        nb.id = c.bio;
        bioSaveCfg(nb);
      }
    } catch (e) { /* entsperren.js not loaded */ }
    delete c.bio; delete c.pin;
    mlsSave(c);
  }
  return c;
}
function mlsSave(c) {
  try {
    if (c) localStorage.setItem(MLS_KEY, JSON.stringify(c));
    else localStorage.removeItem(MLS_KEY);
  } catch (e) { /* storage full or blocked */ }
}
function mlsAllowedHere() { return lkPersonalDevice(); }
// The lock works only for the profile that set it up, and only with at least one way to unlock
function mlsActive() {
  var c = mlsCfg();
  if (!c || c.user !== bioUserId() || !c.views.length || !lkHasMethod()) return null;
  return mlsAllowedHere() ? c : null;
}
function mlsMenuName(view) {
  var m = MLS_VIEWS.find(function (x) { return x[0] === mlsNormView(view); });
  return m ? tk(m[1]) : view;
}

/* ---------- Unlocking (methods from js/entsperren.js) ---------- */
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
  var bioOk = lkBioReady(), pinOk = lkHasPin();
  if (bioOk) { q('bio').style.display = 'block'; q('bio').textContent = tk('lock.unlock', { method: bioMethodName() }); }
  if (pinOk) {
    q('pin').style.display = 'block'; q('pin').textContent = tk('mlock.enterPin');
    if (bioOk) { q('pin').style.background = 'none'; q('pin').style.color = 'inherit'; q('pin').style.border = '1px solid ' + (dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)'); }
  }
  q('bio').addEventListener('click', function () { mlsGateBio(); });
  q('pin').addEventListener('click', function () { mlsGatePin(); });
  q('back').addEventListener('click', mlsGateBack);
  q('pw').addEventListener('click', mlsUsePassword);
  document.body.appendChild(el);
  mlsGate = { view: view, el: el };
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
  // Only a PIN: the PIN pad opens right away; with Face ID the device asks by itself
  if (pinOk && !bioOk) setTimeout(function () { if (mlsGate && mlsGate.view === view) mlsGatePin(); }, 150);
  else if (bioOk) setTimeout(function () { if (mlsGate && mlsGate.view === view) mlsGateBio(true); }, 350);
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
    if (await lkBioVerify()) mlsGateUnlocked();
    else if (!quiet && mlsGate) mlsGate.el.querySelector('[data-mls="msg"]').textContent = tk('lock.failed');
  } finally { mlsBusy = false; }
}
async function mlsGatePin() {
  var c = mlsActive();
  if (!c || !lkHasPin() || !mlsGate) return;
  if (await lkAskPin()) mlsGateUnlocked();
}
function mlsGateBack() {
  mlsHideGate();
  var target = mlsLastFree;
  var c = mlsActive();
  if (c && c.views.indexOf(mlsNormView(target)) >= 0) target = 'konto';
  if (typeof setView === 'function') setView(target || 'konto');
}
function mlsUsePassword() { bioUsePassword(); }

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

/* ---------- Settings → "Unlock & lock" → Lock menus ---------- */
function mlsWorkingCfg() {
  var c = mlsCfg();
  var me = bioUserId();
  if (!c || c.user !== me) c = { user: me, views: [], after: 5 };
  return c;
}
function mlsRenderCardAccess() {
  var sub = document.getElementById('settingsMenuLockAccordion');
  if (sub) sub.classList.toggle('hidden', !mlsAllowedHere());
}
function mlsRenderCard() {
  var box = document.getElementById('mlsBody');
  if (!box || !mlsAllowedHere()) return;
  var c = mlsWorkingCfg();
  var items = MLS_VIEWS.map(function (m) {
    return '<label class="flex items-center gap-2 text-sm cursor-pointer py-1"><input type="checkbox" data-mls-view="' + m[0] + '"' + (c.views.indexOf(m[0]) >= 0 ? ' checked' : '') +
      ' class="w-4 h-4 accent-[var(--c-pine)]"><span>' + escapeHtml(tk(m[1])) + '</span></label>';
  }).join('');
  var btnCls = 'px-3 py-1.5 rounded-lg border border-ink/15 text-sm hover:border-pine transition';
  box.innerHTML =
    '<p class="text-xs text-ink/50 leading-relaxed mb-2">' + escapeHtml(tk('mlock.intro', { method: bioMethodName() })) + '</p>' +
    '<div class="grid grid-cols-2 gap-x-4 mb-3">' + items + '</div>' +
    '<div class="flex items-center gap-3 mb-2"><span class="text-sm">' + escapeHtml(tk('account.bio.after')) + '</span>' +
      '<select id="mlsAfter" class="rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white">' +
      [[0, 'account.bio.now'], [1, 'account.bio.min1'], [5, 'account.bio.min5'], [15, 'account.bio.min15']].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.after === o[0] ? ' selected' : '') + '>' + escapeHtml(tk(o[1])) + '</option>';
      }).join('') + '</select></div>' +
    '<p id="mlsStatus" class="text-xs text-ink/50 mt-2"></p>' +
    (c.views.length ? '<button type="button" data-mls-act="reset" class="mt-2 ' + btnCls + ' text-ink/60">' + escapeHtml(tk('mlock.reset')) + '</button>' : '');
}
function mlsStatus(text) {
  var s = document.getElementById('mlsStatus');
  if (s) s.textContent = text || '';
}
async function mlsOnClick(ev) {
  var t = ev.target.closest('[data-mls-act]');
  if (!t || t.dataset.mlsAct !== 'reset') return;
  if (!(await lkVerifyForChange())) { mlsStatus(tk('mlock.verifyChange')); return; }
  mlsSave(null); mlsHideGate(); mlsOpenUntil = 0; mlsOpenView = '';
  if (typeof renderLockCard === 'function') renderLockCard(); else mlsRenderCard();
}
async function mlsOnChange(ev) {
  var t = ev.target;
  var isView = t.matches && t.matches('[data-mls-view]');
  var isAfter = t.id === 'mlsAfter';
  if (!isView && !isAfter) return;
  if (!(await lkVerifyForChange())) { mlsRenderCard(); mlsStatus(tk('mlock.verifyChange')); return; }
  var c = mlsWorkingCfg();
  if (isView) {
    c.views = c.views.filter(function (v) { return v !== t.dataset.mlsView; });
    if (t.checked) c.views.push(t.dataset.mlsView);
  } else {
    c.after = Number(t.value);
  }
  mlsSave(c);
  mlsOpenUntil = 0; mlsOpenView = '';
  if (typeof renderLockCard === 'function') renderLockCard(); else mlsRenderCard();
}
(function mlsInit() {
  var box = document.getElementById('mlsBody');
  if (box) { box.addEventListener('click', mlsOnClick); box.addEventListener('change', mlsOnChange); }
  // The card "Unlock & lock" renders this part when it opens (renderLockCard in js/entsperren.js)
  // Signed out (profile switch, logout): the lock screen must not stay over the login screen
  try {
    pb.authStore.onChange(function () {
      var valid = false;
      try { valid = pb.authStore.isValid; } catch (e) { valid = false; }
      if (!valid) { mlsHideGate(); mlsOpenUntil = 0; mlsOpenView = ''; }
    });
  } catch (e) { /* pb not ready: the lock screen is replaced on the next menu change anyway */ }
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('menuesperre');
