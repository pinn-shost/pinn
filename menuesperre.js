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
     replace the screen lock of the device. Not for guests, the main admin and the family dashboard.
   - Since 1.168.0 single areas of a menu can be locked as well (MLS_SUBS: Family → School, Pets, Location, Health;
     Finance → Expenses, Savings, Pocket money, Contracts; Home → Defects, Costs, Meters, Maintenance, Garden). They are
     stored in the same list as "<menu>:<area>" (e.g. "familie:gesundheit"). The menu stays usable, only the locked tab
     shows a lock card instead of its content (mlsSubLocked / mlsLockedPaneHtml, asked by renderFamily, renderFinance and
     renderHouse). One unlock opens the area for the chosen time; "immediately" locks it again when another tab or menu is
     opened. Health also covers the emergency pass in the profile of a member.
   - Outside their page the content of locked menus and areas is left out as well: overview tiles, shortcuts, search
     results and activities of the bell (mlsHidden, since 1.168.0). The SOS shortcut and the way home stay. */

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
// Lockable areas inside a menu (since 1.168.0): view -> [[area id, text key]]; Home takes its names from HS_MODULES
var MLS_SUBS = {
  familie: [['schule', 'school.title'], ['tiere', 'pet.pets4'], ['ortung', 'family.location3'], ['gesundheit', 'gh.title']],
  finanzen: [['ausgaben', 'fin.expenses'], ['sparen', 'fin.savings'], ['taschengeld', 'depot.pocketMoney'], ['vertraege', 'contract.contracts']],
  haus: [['maengel', ''], ['kosten', ''], ['zaehler', ''], ['wartung', ''], ['garten', '']],
};
function mlsIsKey(k) {
  if (MLS_VIEWS.some(function (x) { return x[0] === k; })) return true;
  var i = String(k).indexOf(':');
  if (i < 0) return false;
  var list = MLS_SUBS[k.slice(0, i)];
  return !!list && list.some(function (x) { return x[0] === k.slice(i + 1); });
}
function mlsSubName(view, sub) {
  var list = MLS_SUBS[view] || [];
  var hit = list.find(function (x) { return x[0] === sub; });
  if (hit && hit[1]) return tk(hit[1]);
  if (view === 'haus' && typeof HS_MODULES !== 'undefined') {
    var m = HS_MODULES.find(function (x) { return x.id === sub; });
    if (m) return m.tabLabel || m.label;
  }
  return sub;
}

/* ---------- Stored settings ---------- */
function mlsNormView(view) { return view === 'haushalt' ? 'aufgaben' : view; }
function mlsCfg() {
  var c = null;
  try { c = JSON.parse(localStorage.getItem(MLS_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !c.user) return null;
  c.views = Array.isArray(c.views) ? c.views.filter(mlsIsKey) : [];
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
  // "Immediately": leaving the menu locks it again (an unlocked area of this menu stays open while the menu is shown)
  if (c.after === 0 && mlsOpenView && mlsOpenView !== v && mlsOpenView.indexOf(v + ':') !== 0) mlsOpenView = '';
  if (c.views.indexOf(v) < 0) { mlsLastFree = v; mlsHideGate(); return; }
  if (mlsIsOpen(c, v)) { if (c.after > 0) mlsOpenUntil = Date.now() + c.after * 60000; mlsHideGate(); return; }
  mlsShowGate(v);
}

/* ---------- Content of locked menus/areas outside their page (since 1.168.0) ----------
   Overview tiles, shortcuts, the search and the activities of the bell ask here before they show something of a
   menu or area. keys: one key or a list (e.g. ["finanzen", "finanzen:vertraege"]). Only asks, changes nothing:
   with "immediately" the content shows only while that page itself is unlocked; with 1/5/15 min. while the time runs. */
function mlsHidden(keys) {
  var c = mlsActive();
  if (!c || !keys) return false;
  var list = Array.isArray(keys) ? keys : [keys];
  return list.some(function (k) {
    if (c.views.indexOf(k) < 0) return false;
    if (c.after > 0) return Date.now() >= mlsOpenUntil;
    return mlsOpenView !== k && mlsOpenView !== String(k).split(':')[0];
  });
}

/* ---------- Locked areas inside a menu (since 1.168.0) ---------- */
// Asked by the page while it draws the tab "sub" of "view": true = show the lock card instead of the content.
// peek: only asks (for small cards of the area shown elsewhere, e.g. the emergency pass in a profile) – the tab that is
// drawn decides what stays unlocked with "immediately".
function mlsSubLocked(view, sub, peek) {
  var c = mlsActive();
  if (!c) return false;
  var key = view + ':' + sub;
  if (!peek && c.after === 0 && mlsOpenView && mlsOpenView !== key && mlsOpenView !== view) mlsOpenView = '';
  if (c.views.indexOf(key) < 0) return false;
  if (c.after === 0 ? (mlsOpenView === key || mlsOpenView === view) : Date.now() < mlsOpenUntil) {
    if (c.after > 0 && !peek) mlsOpenUntil = Date.now() + c.after * 60000;
    return false;
  }
  return true;
}
function mlsLockedPaneHtml(view, sub) {
  var bioOk = lkBioReady(), pinOk = lkHasPin();
  var name = mlsSubName(view, sub);
  var main = 'px-4 py-2.5 rounded-xl bg-pine text-white text-sm font-medium hover:bg-pine/90 transition w-full max-w-xs';
  var second = 'px-4 py-2.5 rounded-xl border border-ink/15 text-sm hover:border-pine transition w-full max-w-xs';
  return '<div class="mls-sub-lock max-w-md mx-auto my-6 rounded-2xl border border-ink/10 bg-white px-6 py-8 text-center flex flex-col items-center gap-3" data-mls-sub="' + escapeHtml(view + ':' + sub) + '">' +
    '<div class="text-4xl leading-none">🔒</div>' +
    '<div class="font-serif text-lg font-semibold">' + escapeHtml(tk('mlock.subTitle', { area: name })) + '</div>' +
    '<p class="text-sm text-ink/55 max-w-xs" data-mls-sub-msg>' + escapeHtml(tk('mlock.subMsg', { method: bioMethodName() })) + '</p>' +
    (bioOk ? '<button type="button" data-mls-sub-act="bio" class="' + main + '">' + escapeHtml(tk('lock.unlock', { method: bioMethodName() })) + '</button>' : '') +
    (pinOk ? '<button type="button" data-mls-sub-act="pin" class="' + (bioOk ? second : main) + '">' + escapeHtml(tk('mlock.enterPin')) + '</button>' : '') +
    '</div>';
}
function mlsRedraw(view) {
  try {
    if (view === 'familie' && typeof renderFamily === 'function') renderFamily();
    else if (view === 'finanzen' && typeof renderFinance === 'function') renderFinance();
    else if (view === 'haus' && typeof renderHouse === 'function') renderHouse();
  } catch (e) { /* page not built */ }
}
async function mlsSubUnlock(box, how) {
  var c = mlsActive();
  var key = box.dataset.mlsSub;
  if (!c || mlsBusy) return;
  var ok = false;
  mlsBusy = true;
  try { ok = how === 'bio' ? await lkBioVerify() : await lkAskPin(); } finally { mlsBusy = false; }
  if (!ok) {
    var msg = box.querySelector('[data-mls-sub-msg]');
    if (msg && how === 'bio') msg.textContent = tk('lock.failed');
    return;
  }
  mlsMarkOpen(c, key);
  mlsRedraw(key.split(':')[0]);
}
document.addEventListener('click', function (ev) {
  var b = ev.target.closest && ev.target.closest('[data-mls-sub-act]');
  if (!b) return;
  var box = b.closest('[data-mls-sub]');
  if (box) mlsSubUnlock(box, b.dataset.mlsSubAct);
});

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
  var hasSub = c.views.some(function (k) { return k.indexOf(v + ':') === 0; });
  if (c.views.indexOf(v) < 0 && !hasSub) return;
  var away = 0;
  try { away = Date.now() - Number(localStorage.getItem(MLS_AWAY_KEY) || Date.now()); } catch (e) { away = 0; }
  if (away < c.after * 60000) return;
  mlsOpenView = ''; mlsOpenUntil = 0;
  if (c.views.indexOf(v) >= 0) mlsShowGate(v);
  else mlsRedraw(v); // a locked area that is shown right now gets its lock card again
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
    mlsSubsCardHtml(c) +
    '<div class="flex items-center gap-3 mb-2"><span class="text-sm">' + escapeHtml(tk('account.bio.after')) + '</span>' +
      '<select id="mlsAfter" class="rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white">' +
      [[0, 'account.bio.now'], [1, 'account.bio.min1'], [5, 'account.bio.min5'], [15, 'account.bio.min15']].map(function (o) {
        return '<option value="' + o[0] + '"' + (c.after === o[0] ? ' selected' : '') + '>' + escapeHtml(tk(o[1])) + '</option>';
      }).join('') + '</select></div>' +
    '<p id="mlsStatus" class="text-xs text-ink/50 mt-2"></p>' +
    (c.views.length ? '<button type="button" data-mls-act="reset" class="mt-2 ' + btnCls + ' text-ink/60">' + escapeHtml(tk('mlock.reset')) + '</button>' : '');
}
// Single areas (since 1.168.0): one small group per menu
function mlsSubsCardHtml(c) {
  var groups = Object.keys(MLS_SUBS).map(function (view) {
    var subs = MLS_SUBS[view].filter(function (x) { return !(view === 'finanzen' && x[0] === 'taschengeld' && typeof wgShowAllowanceTab === 'function' && !wgShowAllowanceTab()); });
    return '<div class="mb-2"><div class="text-[11px] uppercase tracking-wide text-ink/40 mb-0.5">' + escapeHtml(mlsMenuName(view)) + '</div>' +
      '<div class="grid grid-cols-2 gap-x-4">' + subs.map(function (x) {
        var key = view + ':' + x[0];
        return '<label class="flex items-center gap-2 text-sm cursor-pointer py-1"><input type="checkbox" data-mls-view="' + key + '"' + (c.views.indexOf(key) >= 0 ? ' checked' : '') +
          ' class="w-4 h-4 accent-[var(--c-pine)]"><span>' + escapeHtml(mlsSubName(view, x[0])) + '</span></label>';
      }).join('') + '</div></div>';
  }).join('');
  return '<div class="border-t border-ink/10 pt-3 mb-3"><div class="text-sm font-medium">' + escapeHtml(tk('mlock.subsTitle')) + '</div>' +
    '<p class="text-xs text-ink/50 leading-relaxed mb-2">' + escapeHtml(tk('mlock.subsHint')) + '</p>' + groups + '</div>';
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
