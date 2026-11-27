/* pinn. – Family data: load, save & sync (js/familiensync.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Since 1.166.0 the family data live only in the family areas (js/bereiche.js, collection "familien_bereiche" on
   the server): recipes, meal plan, shopping, pantry, board, lists, school, pets, maintenance plan, members,
   emergency passes, settings, tasks, household, calendar selection, lending list and date polls. The old family
   record ("familien_daten") is no longer read or written – the server dissolves it.
   Contents: the complete state of the app (collectFamilyState), loading (loadFamilyData, offline with the last
   known state), saving (persistState: every changed area is queued and sent with conflict protection), fetching
   changes of other devices (pullRemoteChanges, rerenderAfterRemoteChange) and the save shortcuts (saveMembers,
   saveMealPlan, saveRecipes, saveTasks).
   familyRecordId: set to the family ID once the data are loaded – many parts of the app use it as "the family
   data are ready". */

// Complete state of the app – areasCapture picks the keys of each area out of it
function collectFamilyState() {
  const payload = {
    members, mealPlan, recipes, recipeFavorites, recipeTrash, shoppingItems, shoppingHistory, shoppingLists, shoppingTransferred, shoppingPlans, shoppingListOrder, shoppingMealTarget, shoppingIngredientRules, shoppingCategoryOrder, shoppingReceiptRules, shoppingReceipts, pantryItems, pantryCategories, pantryLocations, pantrySettings, pinboard, familyLists, listTemplates, documentCategories, emergencyPasses, schoolProfiles, schoolHomework, schoolLetters, schoolClosures, pets, petLog, loans, eventPolls, tasks, lastName, wohnform: householdType, themeColors, categoryActive, recipeCategories, appleCalendar, weatherLocation, rooms, roomSchedules, trashBins, smartDevices, houseMaintenance, cleaningCategories, kitchenTools, guestHiddenViews, dashboardCounts, doneTaskCleanupDays,
    defaultViewModeDesktop, defaultViewScopeDesktop, defaultViewModeMobile, defaultViewScopeMobile,
    darkMode: document.documentElement.classList.contains('dark'),
  };
  // The design belongs to the own profile - the family settings keep their default values
  if (familyDesign) {
    payload.themeColors = familyDesign.themeColors;
    payload.darkMode = familyDesign.darkMode;
    payload.defaultViewModeDesktop = familyDesign.defaultViewModeDesktop;
    payload.defaultViewScopeDesktop = familyDesign.defaultViewScopeDesktop;
    payload.defaultViewModeMobile = familyDesign.defaultViewModeMobile;
    payload.defaultViewScopeMobile = familyDesign.defaultViewScopeMobile;
  }
  return payload;
}
// Default values + current state of the areas, ready for applyFamilyData
function composeFamilyState() {
  return { ...defaultFamilyData(), ...areaOverlay() };
}

// After a merge or a change from another device, refresh the display
// without disturbing an open recipe detail page or the settings.
function rerenderAfterRemoteChange() {
  try {
    applyRoleRestrictions(); // Guest menus and child lock
    renderLastName();
    renderMemberChips();
    try { rebuildEvents(); } catch (e) { /* ignore */ } // Closing days & deadlines (school & daycare) from other devices
    renderCalendar();
    renderTasks();
    if (kidPageMemberId) renderKidPage();
    const detail = document.getElementById('recipeDetailView');
    if (!detail || detail.classList.contains('hidden')) renderRecipesForCurrentView();
    if (currentView === 'einkauf') renderShoppingList();
    if (currentView === 'vorrat') renderPantry();
    if (currentView === 'haushalt') renderHousehold();
    if (currentView === 'haus') renderHouse();
    if (currentView === 'finanzen') renderFinance();
    if (currentView === 'dokumente') renderDocuments();
    if (currentView === 'fahrzeuge') renderVehicles();
    if (currentView === 'familie') renderFamily();
    if (currentView === 'pinnwand') renderPinboard();
    if (pwDetailId) renderPinboardDetail();
    pwUpdateBadges();
    refreshOverviewTiles();
  } catch (e) { console.warn('Neuzeichnen nach Sync fehlgeschlagen', e); }
  try { if (typeof ntActFetch === 'function') ntActFetch(false); } catch (e) { /* bell not ready yet */ }
}

// Leftovers of the old family record on this device (an app from before 1.166 that was offline during the
// update): a change still waiting there is handed to the areas (merged with their server state), then the old
// cache and queue are removed. Only if they belong to this family – the cache knows the family, the queue the
// record ID of that cache.
function adoptOldFamilyCache(familyId) {
  const p = readPending();
  const c = readCache();
  if (p && p.local && c && c.familie === familyId && c.recordId && p.recordId === c.recordId) {
    try { areaAdoptFamilyPending(p); } catch (e) { console.warn('Alte Änderungen nicht übernehmbar', e); }
  }
  if (p) clearPending();
  try { localStorage.removeItem(LS_CACHE_KEY); } catch (e) { /* ignore */ }
}

async function loadFamilyData() {
  kassenStashRescue(); // back up old finance data of this device before the old cache is removed
  const myFamily = (currentUser() && currentUser().familie) || '';
  const loadedBefore = areaLoadedAt;
  await areasLoad(true); // never throws: offline it keeps the state stored on this device
  if (!areasActive()) {
    // Neither the server nor a stored state: nothing to show
    throw new Error(areaServer === false ? 'Server ohne Familienbereiche' : 'Familiendaten nicht erreichbar');
  }
  familyRecordId = myFamily;
  adoptOldFamilyCache(myFamily);
  applyFamilyData(composeFamilyState());
  if (areaLoadedAt === loadedBefore) {
    // Server not reachable: work with the stored state; changes are queued and sent later
    setSyncStatus('offline');
    scheduleSyncRetry();
  } else {
    setSyncStatus(areasHavePending() ? 'pending' : 'ok');
  }
  if (areasHavePending()) setTimeout(() => areasFlush(), 0);
  setTimeout(() => { shrinkOversizedMemberPhotos().catch(err => console.warn('Profilbilder verkleinern fehlgeschlagen', err)); }, 0);
}

async function persistState() {
  if (!familyRecordId) return;
  kassenCapture(); // note changed finance data of the fund shown
  areasCapture(collectFamilyState()); // every changed area is queued and sent separately (js/bereiche.js)
  // Shops: report open items per list to the server (delayed, only on change)
  try { if (typeof ladenPlansSync === 'function') ladenPlansSync(false); } catch (e) { /* ignore */ }
  // When persistState returns, the changes are on the server (or queued on the device when offline)
  await areasSettle();
}

function scheduleSyncRetry() {
  clearTimeout(syncRetryTimer);
  syncRetryTimer = setTimeout(() => pullRemoteChanges(), 20 * 1000);
}

// Fetch changes from other devices regularly. Own changes still queued are sent first (areasPull).
async function pullRemoteChanges() {
  if (!familyRecordId) return;
  kassenLoad(false); // Funds of other devices (throttled)
  await areasPull();
  if (!areasHavePending()) setSyncStatus(areaLoadFailed ? 'offline' : 'ok');
}
window.addEventListener('online', () => { pullRemoteChanges(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { pullRemoteChanges(); loadAufgaben(); } });

async function saveMembers() { await persistState(); }
async function saveMealPlan() { await persistState(); }
async function saveRecipes() { await persistState(); }
async function saveTasks() { await persistState(); }

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familiensync');
