/* pinn. – Saving & syncing: local state (js/speichern.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the sync state (syncBase, syncBaseUpdated, in-flight/rerun/retry), pending changes and the cache on the device
   (readPending, writePending, clearPending, writeCache, readCache), the sync status (setSyncStatus) and applyFamilyData,
   which takes a data state into the app variables incl. migrations. Loading, saving and merging run in js/familiensync.js. */

/* ==========================================================
   Saving & syncing (works offline, without overwriting each other)
   ----------------------------------------------------------
   - syncBase / syncBaseUpdated: the state last confirmed by the server and its timestamp.
   - Every change is first saved locally (localStorage) as "pending" and then sent to the
     server. The server only saves if its state has not changed since syncBaseUpdated
     (pb_hooks/save_family_data.pb.js). Otherwise the app merges both states
     (mergeFamilyData) and tries again.
   - Without a connection the change stays saved locally and is sent automatically as soon as
     the server can be reached again - even after reloading the page.
   ========================================================== */
const LS_PENDING_KEY = 'pinn.pendingSync';
const LS_CACHE_KEY = 'pinn.cache';
let syncBase = null;
let syncBaseUpdated = '';
let syncInFlight = false;
let syncRerun = false;
let syncRetryTimer = null;
let pendingMemory = null; // Fallback in case localStorage is not available
let pendingSeq = 0;

function readPending() {
  try {
    const raw = localStorage.getItem(LS_PENDING_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* localStorage may not be available */ }
  return pendingMemory;
}
function writePending(p) {
  pendingMemory = p;
  try { localStorage.setItem(LS_PENDING_KEY, JSON.stringify(p)); } catch (e) { /* in memory only */ }
}
function clearPending() {
  pendingMemory = null;
  try { localStorage.removeItem(LS_PENDING_KEY); } catch (e) { /* ignore */ }
}
function writeCache() {
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ recordId: familyRecordId, familie: (currentUser() && currentUser().familie) || '', updated: syncBaseUpdated, data: syncBase })); } catch (e) { /* ignore */ }
}
function readCache() {
  try { const raw = localStorage.getItem(LS_CACHE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

let familySyncState = 'ok';
function setSyncStatus(state) {
  familySyncState = state;
  const statusEl = document.getElementById('syncStatus');
  const texts = {
    ok: 'synchronisiert',
    pending: 'wird synchronisiert …',
    offline: 'offline – Änderungen werden nachgereicht, sobald wieder Verbindung besteht',
    error: 'nicht synchronisiert – NAS/Verbindung prüfen',
  };
  if (statusEl) {
    statusEl.textContent = texts[state] || '';
    statusEl.classList.toggle('text-red-500', state === 'error' || state === 'offline');
  }
  refreshOfflineBadge();
}

// Takes a data state into the app variables (without saving).
function applyFamilyData(data) {
  members = (Array.isArray(data.members) ? data.members : []).filter(m => m && !(isExampleMember(m) && !profileForMember(m.id)));
  mealPlan = data.mealPlan || [];
  recipes = data.recipes || [];
  // Migration: recipes that still have the old single "category" field (before the switch to
  // several categories per recipe) are converted once to "categories" (array).
  recipes.forEach(r => {
    if (!r.categories) r.categories = r.category ? [r.category] : [];
    delete r.category;
  });
  recipeFavorites = Array.isArray(data.recipeFavorites) ? data.recipeFavorites.filter(x => x && typeof x.id === 'string' && x.id) : [];
  tasks = data.tasks || [];
  shoppingItems = Array.isArray(data.shoppingItems) ? data.shoppingItems : [];
  shoppingHistory = Array.isArray(data.shoppingHistory) ? data.shoppingHistory : [];
  shoppingLists = Array.isArray(data.shoppingLists) ? data.shoppingLists.filter(l => l && l.id && l.id !== 'essensplanung') : [];
  shoppingTransferred = Array.isArray(data.shoppingTransferred) ? data.shoppingTransferred.filter(x => x && x.id) : [];
  shoppingPlans = Array.isArray(data.shoppingPlans) ? data.shoppingPlans.filter(x => x && x.id && Array.isArray(x.listIds)) : [];
  shoppingListOrder = Array.isArray(data.shoppingListOrder) ? data.shoppingListOrder.filter(x => typeof x === 'string' && x) : [];
  shoppingMealTarget = normalizeShoppingMealTarget(data.shoppingMealTarget);
  shoppingIngredientRules = normalizeShoppingIngredientRules(data.shoppingIngredientRules);
  shoppingCategoryOrder = Array.isArray(data.shoppingCategoryOrder) ? data.shoppingCategoryOrder.filter(x => typeof x === 'string' && x) : [];
  pantryItems = Array.isArray(data.pantryItems) ? data.pantryItems.filter(x => x && x.id && x.name) : [];
  pantryCategories = (Array.isArray(data.pantryCategories) && data.pantryCategories.length) ? data.pantryCategories.filter(x => x && x.id) : PANTRY_DEFAULT_CATEGORIES.map(c => ({ ...c }));
  pantryLocations = (Array.isArray(data.pantryLocations) && data.pantryLocations.length) ? data.pantryLocations.filter(x => x && x.id) : PANTRY_DEFAULT_LOCATIONS.map(c => ({ ...c }));
  pantrySettings = normalizePantrySettings(data.pantrySettings);
  pinboard = normalizePinboard(data.pinboard);
  familyLists = normalizeFamilyLists(data.familyLists);
  listTemplates = normalizeListTemplates(data.listTemplates);
  documentCategories = Array.isArray(data.documentCategories) ? data.documentCategories.filter(x => x && x.id && x.label) : [];
  emergencyPasses = (data.emergencyPasses && typeof data.emergencyPasses === 'object' && !Array.isArray(data.emergencyPasses)) ? data.emergencyPasses : {};
  const skList = (v) => Array.isArray(v) ? v.filter(x => x && typeof x.id === 'string' && x.id) : [];
  schoolProfiles = skList(data.schoolProfiles);
  schoolHomework = skList(data.schoolHomework);
  schoolLetters = skList(data.schoolLetters).filter(x => Array.isArray(x.memberIds));
  schoolClosures = skList(data.schoolClosures).filter(x => Array.isArray(x.memberIds));
  pets = skList(data.pets).filter(x => typeof x.name === 'string' && x.name);
  petLog = skList(data.petLog).filter(x => x.pet && x.day);
  lastName = (data.lastName && data.lastName !== 'Mustermann') ? data.lastName : '';
  householdType = data.wohnform === 'wg' ? 'wg' : 'familie';
  applyHouseholdType(true);
  themeColors = { ...defaultFamilyData().themeColors, ...(data.themeColors || {}) };
  // New categories (e.g. "Warme/Kalte Speisen" added later) are active by default for existing
  // families, if not saved explicitly yet.
  categoryActive = { ...Object.fromEntries(CATEGORIES.map(c => [c, true])), ...(data.categoryActive || {}) };
  recipeCategories = (data.recipeCategories && data.recipeCategories.length) ? data.recipeCategories : [...CATEGORIES];
  appleCalendar = { ...defaultFamilyData().appleCalendar, ...(data.appleCalendar || {}) };
  // Credentials are only stored encrypted on the server (collection "apple_zugaenge") - never take over possible old leftovers.
  delete appleCalendar.email;
  delete appleCalendar.appPassword;
  weatherLocation = { ...defaultFamilyData().weatherLocation, ...(data.weatherLocation || {}) };
  rooms = data.rooms || [];
  roomSchedules = data.roomSchedules || [];
  trashBins = data.trashBins || [];
  smartDevices = normalizeSmartDevices(data.smartDevices);
  houseMaintenance = Array.isArray(data.houseMaintenance) ? data.houseMaintenance.filter(m => m && typeof m.id === 'string' && m.id) : [];
  cleaningCategories = Array.isArray(data.cleaningCategories) ? data.cleaningCategories.filter(c => c && c.id) : [];
  // since 1.55.1: the former default categories disappear if no cleaning task uses them (used ones stay)
  (function () {
    const usedIds = new Set(roomSchedules.map(x => x.category));
    const oldDefaults = { reinigung: 'Reinigung', aufraeumen: 'Aufräumen' };
    cleaningCategories = cleaningCategories.filter(c => !(oldDefaults[c.id] === c.label && !usedIds.has(c.id)));
  })();
  kitchenTools = (data.kitchenTools && data.kitchenTools.length) ? data.kitchenTools : defaultFamilyData().kitchenTools;
  // Only take over known tab IDs (in case the offer has changed since) and cap at exactly 4
  // „Haushalt“ is now part of „Aufgaben“ - rewrite old favourites and fill up to 4
  const validFavorites = (data.favoriteTabs || []).map(id => id === 'haushalt' ? 'aufgaben' : id)
    .filter((id, i, a) => ALL_MENU_TABS.some(t => t.id === id) && a.indexOf(id) === i);
  if (validFavorites.length) {
    [...DEFAULT_FAVORITE_TABS, ...ALL_MENU_TABS.map(t => t.id)].forEach(id => { if (validFavorites.length < 4 && !validFavorites.includes(id)) validFavorites.push(id); });
  }
  favoriteTabs = validFavorites.length === 4 ? validFavorites.slice(0, 4) : [...DEFAULT_FAVORITE_TABS];
  doneTaskCleanupDays = [2, 1, 0].includes(data.doneTaskCleanupDays) ? data.doneTaskCleanupDays : 2;
  guestHiddenViews = Array.isArray(data.guestHiddenViews)
    ? data.guestHiddenViews.filter(id => GUEST_SELECTABLE_VIEWS.includes(id))
    : [];
  kassenOnFamilyData(data); // Finance data comes from the fund shown (section „Kassen“)
  // Backwards compatible: if the old device-independent setting is still stored,
  // take it as the starting value for BOTH (iPad/desktop and phone).
  defaultViewModeDesktop = data.defaultViewModeDesktop || data.defaultViewMode || 'timeline';
  defaultViewScopeDesktop = data.defaultViewScopeDesktop || data.defaultViewScope || 'both';
  defaultViewModeMobile = data.defaultViewModeMobile || data.defaultViewMode || 'timeline';
  defaultViewScopeMobile = data.defaultViewScopeMobile || data.defaultViewScope || 'both';
  // Design (colours, dark mode, default views) applies per profile. The values from the family data
  // are only the default for profiles that have not set anything of their own yet.
  captureFamilyDesign(data);
  const designUid = (currentUser() && currentUser().id) || '';
  if (designUid !== personalDesignLoadedFor) {
    personalDesignLoadedFor = designUid;
    const cached = designUid ? readDesignCache() : null;
    personalDesign = cached ? cached.design : { werte: {}, stand: 0 };
    if (designUid) loadPersonalDesign(!!(cached && cached.pending));
  }
  applyPersonalDesign();
  loadBirthdays(false);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('speichern');
