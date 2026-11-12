/* pinn. – Continue where you left off (js/fortsetzen.js)
   Classic script, no build step: shares the global scope with the other files in js/.
   Loaded right before js/appstart.js.

   The app remembers per profile which page was open (and a few details: the opened recipe with its
   servings and scroll position, the tab of the mobile overview, the opened list, the tab in Home and
   Vehicles). bootApp() calls resumeRestore() after the first view was built, so a profile opened again
   at the family dashboard (PIN) – or a page that was reloaded – continues at the same place.
   The note lives in sessionStorage: it only lasts while the app stays open (also in the background)
   and is gone once the app is closed. Nothing is sent to the server.
   Contents: resumeSnapshot, resumeRemember, resumeRestore, resumeForget, resumeStart. */

const SS_RESUME = 'pinn.fortsetzen';          // { <profile id>: { t, view, … } }
const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000; // older notes are ignored: start at the overview
const RESUME_SCROLL_DELAY_MS = 700;            // after scrollRecipeDetailToTop() has finished

function resumeReadAll() {
  try {
    const all = JSON.parse(sessionStorage.getItem(SS_RESUME) || '{}');
    return (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
  } catch (e) { return {}; }
}
function resumeWriteAll(all) {
  try { sessionStorage.setItem(SS_RESUME, JSON.stringify(all)); } catch (e) { /* storage blocked */ }
}
function resumeUserId() {
  try { const u = currentUser(); return u && u.id ? String(u.id) : ''; } catch (e) { return ''; }
}
// Profiles that only see their kids' page have nothing to continue
function resumeApplies() {
  try {
    if (!resumeUserId() || isCurrentUserMainAdmin()) return false;
    if (isDashboardKidSession() || kidsOnlyActive()) return false;
    return true;
  } catch (e) { return false; }
}

// The element of the recipe page that is actually scrolled (the page itself, an area above it or the window)
function resumeRecipeScroll(detail) {
  let depth = 0;
  for (let el = detail; el && el !== document.documentElement; el = el.parentElement, depth++) {
    if (el.scrollTop > 0) return { at: depth, top: Math.round(el.scrollTop) };
  }
  const y = Math.round(window.scrollY || 0);
  return y > 0 ? { at: -1, top: y } : null;
}
function resumeApplyRecipeScroll(detail, pos) {
  if (!pos || !(pos.top > 0)) return;
  if (pos.at === -1) { window.scrollTo(0, pos.top); return; }
  let el = detail;
  for (let i = 0; i < pos.at && el; i++) el = el.parentElement;
  if (el) el.scrollTop = pos.top;
}

// Current place as a small object (only names and ids, no contents)
function resumeSnapshot() {
  if (typeof currentView !== 'string' || !currentView) return null;
  const s = { t: Date.now(), view: currentView };
  try { s.mobileTab = mobileOverviewTab; } catch (e) { /* not loaded */ }
  try {
    const detail = document.getElementById('recipeDetailView');
    const open = detail && !detail.classList.contains('hidden') && recipeDetailCurrent &&
      (currentView === 'rezepte' || currentView === 'uebersicht');
    if (open) {
      s.recipe = { id: recipeDetailCurrent.id || '', pub: recipeDetailCurrent.pub || '', servings: recipeDetailCurrentServings };
      const pos = resumeRecipeScroll(detail);
      if (pos) s.recipe.scroll = pos;
    }
  } catch (e) { /* recipes not loaded */ }
  try {
    if (currentView === 'einkauf') s.lists = { tab: listsTab, detail: listsDetailId || '', shop: currentShoppingListId || '' };
  } catch (e) { /* lists not loaded */ }
  try { if (currentView === 'haus') s.houseTab = hsTab; } catch (e) { /* home not loaded */ }
  try { if (currentView === 'fahrzeuge') s.vehicles = { tab: fzTab, detail: fzDetailId || '' }; } catch (e) { /* vehicles not loaded */ }
  return s;
}

// Note the current place for the logged-in profile
function resumeRemember() {
  if (!resumeApplies()) return;
  const snap = resumeSnapshot();
  if (!snap) return;
  const all = resumeReadAll();
  all[resumeUserId()] = snap;
  resumeWriteAll(all);
}
// Logging out for good: the next login starts at the overview
function resumeForget() {
  const id = resumeUserId();
  if (!id) return;
  const all = resumeReadAll();
  if (!(id in all)) return;
  delete all[id];
  resumeWriteAll(all);
}

// A link from a push message, a widget … decides where the app opens – then nothing is restored
function resumeUrlHasTarget() {
  try {
    const keys = [...new URLSearchParams(location.search).keys()].filter(k => k !== '_r');
    return keys.length > 0;
  } catch (e) { return false; }
}

async function resumeOpenRecipe(rec) {
  let opened = false;
  if (rec.pub) {
    if (!publicRecipes.some(p => p.id === rec.pub)) { try { await loadPublicRecipes(false); } catch (e) { /* offline */ } }
    const entry = publicRecipes.find(p => p.id === rec.pub);
    if (entry && (currentView === 'rezepte' || currentView === 'uebersicht')) { openRecipeDetailPage(null, entry); opened = true; }
  } else if (rec.id && recipes.some(r => r.id === rec.id)) {
    openRecipeDetailPage(rec.id);
    opened = true;
  }
  if (!opened) return;
  const n = Math.round(Number(rec.servings));
  if (n >= 1 && n <= 99 && typeof recipeDetailSetServings === 'function') recipeDetailSetServings(n);
  if (!rec.scroll) return;
  // back to the step you were at – unless you already touched the page
  let userMoved = false;
  const stop = () => { userMoved = true; };
  const evts = ['touchstart', 'wheel', 'mousedown', 'keydown'];
  evts.forEach(t => window.addEventListener(t, stop, { passive: true, capture: true }));
  setTimeout(() => {
    evts.forEach(t => window.removeEventListener(t, stop, { capture: true }));
    const detail = document.getElementById('recipeDetailView');
    if (userMoved || !detail || detail.classList.contains('hidden')) return;
    resumeApplyRecipeScroll(detail, rec.scroll);
  }, RESUME_SCROLL_DELAY_MS);
}

// Called by bootApp() after setView('uebersicht'). Returns true when another place was opened.
function resumeRestore() {
  if (!resumeApplies() || resumeUrlHasTarget()) return false;
  const s = resumeReadAll()[resumeUserId()];
  if (!s || typeof s.view !== 'string' || !(Date.now() - Number(s.t) < RESUME_MAX_AGE_MS)) return false;
  let view = s.view;
  try {
    if (!ALL_MENU_TABS.some(t => t.id === view) && !['konto', 'einstellungen', 'haushalt'].includes(view)) return false;
    if (!isViewAllowed(view)) return false;
  } catch (e) { return false; }
  // details first: the page reads them while it is built (each page checks them itself)
  try { if (['kalender', 'rezepte', 'aufgaben'].includes(s.mobileTab)) mobileOverviewTab = s.mobileTab; } catch (e) { /* ignore */ }
  try {
    if (view === 'einkauf' && s.lists) {
      if (LIST_TYPES.some(t => t.id === s.lists.tab)) listsTab = s.lists.tab;
      listsDetailId = s.lists.detail && lsGetList(s.lists.detail) ? s.lists.detail : null;
      currentShoppingListId = s.lists.shop && getShoppingList(s.lists.shop) ? s.lists.shop : null;
    }
  } catch (e) { /* lists not ready */ }
  try { if (view === 'haus' && typeof s.houseTab === 'string') hsTab = s.houseTab; } catch (e) { /* ignore */ }
  try {
    if (view === 'fahrzeuge' && s.vehicles) {
      if (['liste', 'bilanz', 'rechner'].includes(s.vehicles.tab)) fzTab = s.vehicles.tab;
      fzDetailId = s.vehicles.detail || null;
    }
  } catch (e) { /* ignore */ }
  const changed = view !== 'uebersicht';
  if (changed) setView(view);
  else { try { applyMobileOverviewTab(); } catch (e) { /* ignore */ } }
  if (s.recipe && (view === 'rezepte' || view === 'uebersicht')) {
    resumeOpenRecipe(s.recipe).catch(() => { /* recipe gone */ });
    return true;
  }
  return changed;
}

// Keep the note up to date: when the app goes to the background or the page is left
function resumeStart() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') resumeRemember(); });
  window.addEventListener('pagehide', resumeRemember);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('fortsetzen');
