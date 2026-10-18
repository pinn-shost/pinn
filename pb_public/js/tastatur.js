/* pinn. – Keyboard handling (js/tastatur.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: keeping input fields visible above the on-screen keyboard: the login screens follow the visible area (fitAuthScreensToViewport, scrollFocusedAuthField) and every other input field is kept above the keyboard (isKeyboardField, getKeyboardState, syncGlobalKeyboardLayout, ensureKeyboardFieldVisible). The shopping input bar has its own logic in js/einkaufseingabe.js. */

/* ---------- Keyboard: login screens follow the visible area ----------
   On iPhone/iPad an open keyboard only shrinks the visible area (visualViewport), not
   the page. Without adjusting, the password field then lies under the keyboard or under the bar above
   the keyboard and cannot be tapped. That is why the screen is shrunk to the visible area,
   moves up and the tapped field is scrolled to the middle. */
const AUTH_SCREEN_IDS = ['loginScreen', 'forcePasswordScreen', 'mainAdminScreen', 'setupScreen'];
function fitAuthScreensToViewport() {
  const vv = window.visualViewport;
  const kbOpen = !!(vv && window.innerHeight - vv.height > 120);
  AUTH_SCREEN_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (vv && kbOpen) {
      el.style.height = vv.height + 'px';
      el.style.top = vv.offsetTop + 'px';
    } else {
      el.style.height = '';
      el.style.top = '';
    }
    el.classList.toggle('kb-open', kbOpen);
  });
}
function scrollFocusedAuthField(target) {
  if (!target || !target.closest || !target.closest('.pinn-auth-screen')) return;
  if (!/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
  [80, 350, 700].forEach(ms => setTimeout(() => {
    if (document.activeElement !== target) return;
    fitAuthScreensToViewport();
    try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { target.scrollIntoView(); }
  }, ms));
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitAuthScreensToViewport);
  window.visualViewport.addEventListener('scroll', fitAuthScreensToViewport);
}
document.addEventListener('focusin', (ev) => scrollFocusedAuthField(ev.target));
document.addEventListener('focusout', () => setTimeout(fitAuthScreensToViewport, 150));

/* ---------- Keyboard (global): every input field stays visible above the keyboard ----------
   The document itself must not scroll (see the double-tap guard) and #appRoot has a fixed
   position - so iOS cannot push a tapped field above the keyboard by itself.
   Therefore, for ALL input fields:
   - field inside a popup (.fixed.inset-0): the popup is shrunk to the visible area above the
     keyboard, the card scrolls internally.
   - field on a normal page: the whole page (#appRoot) moves up or is shrunk to the
     visible area.
   - afterwards the field is scrolled to the middle of its scroll area if it is covered.
   Login screens, the shopping input bar and the shopping quantity popup have their own
   logic (fitAuthScreensToViewport / syncShoppingKeyboardLayout) and are skipped here.
   NEW input fields need no handling of their own - they are picked up automatically. */
const KB_NO_KEYBOARD_TYPES = /^(checkbox|radio|range|color|button|submit|reset|file|hidden|image)$/i;
function isKeyboardField(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return !el.disabled;
  if (el.tagName === 'INPUT') return !el.disabled && !el.readOnly && !KB_NO_KEYBOARD_TYPES.test(el.type || 'text');
  return !!el.isContentEditable;
}
function isKeyboardFieldHandledElsewhere(el) {
  return !!(el.closest('.pinn-auth-screen') || el.id === 'shoppingAddInput' || el.id === 'globalSearchInput' || el.closest('#shoppingItemModal'));
}
function getKeyboardState() {
  const vv = window.visualViewport;
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  if (!vv) return { open: false, vv: null, top: 0, height: layoutHeight, bottom: layoutHeight };
  const open = layoutHeight - (vv.height + vv.offsetTop) > 80 || layoutHeight - vv.height > 120;
  return { open, vv, top: vv.offsetTop, height: vv.height, bottom: vv.offsetTop + vv.height };
}
let kbFittedOverlay = null;
let kbFittedAppRoot = false;
function resetKbOverlay() {
  if (!kbFittedOverlay) return;
  kbFittedOverlay.classList.remove('kb-fit');
  kbFittedOverlay.style.top = '';
  kbFittedOverlay.style.height = '';
  kbFittedOverlay = null;
}
function resetKbAppRoot() {
  if (!kbFittedAppRoot) return;
  const root = document.getElementById('appRoot');
  if (root) { root.style.top = ''; root.style.height = ''; }
  kbFittedAppRoot = false;
}
function syncGlobalKeyboardLayout() {
  const kb = getKeyboardState();
  const active = document.activeElement;
  const field = isKeyboardField(active) ? active : null;
  document.body.classList.toggle('kb-open', !!(kb.open && field));

  if (!kb.open || !field || isKeyboardFieldHandledElsewhere(field)) {
    resetKbOverlay();
    resetKbAppRoot();
    return;
  }
  const overlay = field.closest('.fixed.inset-0');
  if (overlay && overlay !== document.getElementById('appRoot')) {
    resetKbAppRoot();
    if (kbFittedOverlay && kbFittedOverlay !== overlay) resetKbOverlay();
    overlay.classList.add('kb-fit');
    overlay.style.top = kb.top + 'px';
    overlay.style.height = kb.height + 'px';
    kbFittedOverlay = overlay;
  } else {
    resetKbOverlay();
    const root = document.getElementById('appRoot');
    if (root) {
      root.style.top = kb.top + 'px';
      root.style.height = kb.height + 'px';
      kbFittedAppRoot = true;
    }
  }
}
function ensureKeyboardFieldVisible(field) {
  if (document.activeElement !== field) return;
  const kb = getKeyboardState();
  const rect = field.getBoundingClientRect();
  const margin = 16;
  const hidden = rect.bottom > kb.bottom - margin || rect.top < kb.top + margin;
  if (!hidden) return;
  try { field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); }
  catch (e) { field.scrollIntoView(); }
  // The document itself always stays at the top (double-tap guard).
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
}
document.addEventListener('focusin', (ev) => {
  const field = ev.target;
  if (!isKeyboardField(field) || isKeyboardFieldHandledElsewhere(field)) return;
  // The keyboard slides in animated - measure several times.
  [0, 100, 300, 600, 900].forEach(ms => setTimeout(() => {
    if (document.activeElement !== field) return;
    syncGlobalKeyboardLayout();
    ensureKeyboardFieldVisible(field);
  }, ms));
});
document.addEventListener('focusout', () => setTimeout(syncGlobalKeyboardLayout, 150));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncGlobalKeyboardLayout);
  window.visualViewport.addEventListener('scroll', syncGlobalKeyboardLayout);
}
window.addEventListener('resize', syncGlobalKeyboardLayout);
// While typing (e.g. growing text fields or suggestion lists) keep the field visible.
document.addEventListener('input', (ev) => {
  const field = ev.target;
  if (!isKeyboardField(field) || isKeyboardFieldHandledElsewhere(field)) return;
  if (getKeyboardState().open) ensureKeyboardFieldVisible(field);
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('tastatur');
