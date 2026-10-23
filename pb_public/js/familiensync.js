/* pinn. – Family data: load, save & sync (js/familiensync.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: building the family record (buildFamilyPayload), loading it (loadFamilyData, offline with the last known state),
   saving without overwriting each other (persistState, flushSync with merging), fetching changes of other devices
   (pullRemoteChanges, rerenderAfterRemoteChange) and the save shortcuts (saveMembers, saveMealPlan, saveRecipes, saveTasks).
   Since 1.104.0 some parts (recipes, meal plan, since 1.105 also shopping and pantry, since 1.106 board, lists, school,
   pets and the maintenance plan, since 1.108 members, emergency passes and settings, since 1.109 tasks, the household
   and the calendar selection) live in records of their own
   (js/bereiche.js): they are left out of the family record (buildFamilyPayload) and put back on top whenever a state
   is applied (composeFamilyState). */

// Complete state of the app (family record + areas)
function collectFamilyState() {
  const payload = {
    members, mealPlan, recipes, recipeFavorites, shoppingItems, shoppingHistory, shoppingLists, shoppingTransferred, shoppingPlans, shoppingListOrder, shoppingMealTarget, shoppingIngredientRules, shoppingCategoryOrder, pantryItems, pantryCategories, pantryLocations, pantrySettings, pinboard, familyLists, listTemplates, documentCategories, emergencyPasses, schoolProfiles, schoolHomework, schoolLetters, schoolClosures, pets, petLog, tasks, lastName, wohnform: householdType, themeColors, categoryActive, recipeCategories, appleCalendar, weatherLocation, rooms, roomSchedules, trashBins, smartDevices, houseMaintenance, cleaningCategories, kitchenTools, favoriteTabs, guestHiddenViews, doneTaskCleanupDays, finance,
    defaultViewModeDesktop, defaultViewScopeDesktop, defaultViewModeMobile, defaultViewScopeMobile,
    darkMode: document.documentElement.classList.contains('dark'),
  };
  // Finance data lives in the funds (own collection) - no longer in the family record
  if (kassenServer === true) delete payload.finance;
  // The design belongs to the own profile - the family data keep their default values
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
// What goes into the family record: everything except the areas with records of their own
function buildFamilyPayload() {
  return areaStripPayload(collectFamilyState());
}
// The family data this device is working with (own pending changes, otherwise the server state)
function familyWorkingData() {
  const pending = readPending();
  if (pending && pending.recordId === familyRecordId && pending.local) return pending.local;
  return syncBase || {};
}
// Family data + current state of the areas, ready for applyFamilyData
function composeFamilyState(familyPart) {
  return { ...defaultFamilyData(), ...(familyPart || {}), ...areaOverlay() };
}

// After a merge or a change from another device, refresh the display
// without disturbing an open recipe detail page or the settings.
function rerenderAfterRemoteChange() {
  try {
    applyRoleRestrictions(); renderBottomTabBar(); // Guest menus and child lock
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
    if (currentView === 'haus') renderHouse();
    if (currentView === 'familie') renderFamily();
    if (currentView === 'pinnwand') renderPinboard();
    if (pwDetailId) renderPinboardDetail();
    pwUpdateBadges();
    refreshOverviewTiles();
  } catch (e) { console.warn('Neuzeichnen nach Sync fehlgeschlagen', e); }
  try { if (typeof ntActFetch === 'function') ntActFetch(false); } catch (e) { /* bell not ready yet */ }
}

async function loadFamilyData() {
  kassenStashRescue(); // back up the old intermediate state of the finance data before it is replaced
  // Areas first (recipes, meal plan …): the server moves them out of the family record on the first request
  try { await areasLoad(true); } catch (e) { /* offline – cached state */ }
  // Every family has exactly one record (field "familie"); the server only delivers the own one.
  const myFamily = (currentUser() && currentUser().familie) || '';
  let existing = null;
  let listError = null;
  try {
    // bereiche=<names>: the areas this device loads itself (the server adds the others to the answer)
    const list = await pb.collection(PB_COLLECTION).getList(1, 1, { filter: pb.filter('familie = {:f}', { f: myFamily }), query: { bereiche: areaKnownParam() } });
    existing = list.items[0] || null;
  } catch (err) {
    listError = err;
  }

  if (listError) {
    // Server not reachable: keep working with the last known state (plus own changes still
    // pending) instead of aborting. IMPORTANT: never create a new record here -
    // on a short network error that would create an empty second record.
    const cache = readCache();
    if (!cache) throw listError;
    if (cache.familie && cache.familie !== myFamily) throw listError; // Intermediate state of another family
    familyRecordId = cache.recordId;
    syncBase = cache.data || {};
    syncBaseUpdated = cache.updated || '';
    const pending = readPending();
    const working = (pending && pending.recordId === familyRecordId) ? pending.local : syncBase;
    applyFamilyData(composeFamilyState(working));
    setSyncStatus('offline');
    scheduleSyncRetry();
    setTimeout(() => { shrinkOversizedMemberPhotos().catch(() => {}); }, 0);
    return;
  }

  if (existing) {
    familyRecordId = existing.id;
    syncBase = existing.data || {};
    syncBaseUpdated = existing.updated || '';
  } else {
    const initial = areaStripPayload(defaultFamilyData());
    const created = await pb.collection(PB_COLLECTION).create({ data: initial, familie: myFamily }, { query: { bereiche: areaKnownParam() } });
    familyRecordId = created.id;
    syncBase = initial;
    syncBaseUpdated = created.updated || '';
  }

  // Merge changes still pending from an earlier offline phase with the current server state
  // and send them later.
  const pending = readPending();
  if (pending && pending.recordId === familyRecordId && pending.local) {
    const merged = mergeFamilyData(pending.base || {}, pending.local, syncBase);
    applyFamilyData(composeFamilyState(merged));
    writePending({ seq: ++pendingSeq, recordId: familyRecordId, base: syncBase, baseUpdated: syncBaseUpdated, local: buildFamilyPayload() });
    setTimeout(() => flushSync(), 0);
  } else {
    applyFamilyData(composeFamilyState(syncBase));
  }
  writeCache();
  setTimeout(() => { shrinkOversizedMemberPhotos().catch(err => console.warn('Profilbilder verkleinern fehlgeschlagen', err)); }, 0);
}

async function persistState() {
  if (!familyRecordId) return;
  kassenCapture(); // note changed finance data of the fund shown
  const full = collectFamilyState();
  areasCapture(full); // recipes, meal plan …: queued and sent separately (js/bereiche.js)
  writePending({ seq: ++pendingSeq, recordId: familyRecordId, base: syncBase, baseUpdated: syncBaseUpdated, local: areaStripPayload(full) });
  // Shops: report open items per list to the server (delayed, only on change)
  try { if (typeof ladenPlansSync === 'function') ladenPlansSync(false); } catch (e) { /* ignore */ }
  // Family record and areas are sent side by side; both are on the server when persistState returns
  await Promise.all([flushSync(), areasSettle()]);
}

function scheduleSyncRetry() {
  clearTimeout(syncRetryTimer);
  syncRetryTimer = setTimeout(() => flushSync(), 20 * 1000);
}

async function flushSync() {
  if (syncInFlight) { syncRerun = true; return; }
  syncInFlight = true;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const sent = readPending();
      if (!sent || sent.recordId !== familyRecordId) { setSyncStatus('ok'); return; }
      setSyncStatus('pending');

      let res, body;
      try {
        res = await apiFetch('/api/pinn/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recordId: sent.recordId, expectedUpdated: sent.baseUpdated, data: sent.local, bereiche: areaKnownList() }),
        });
        body = await res.json().catch(() => ({}));
      } catch (netErr) {
        setSyncStatus('offline');
        scheduleSyncRetry();
        return;
      }

      if (res.status === 404 && !body.conflict) {
        // Save hook missing on the server (e.g. not installed yet): save directly as before,
        // so the app doesn't block. Protection against overwriting does not apply then.
        console.warn('pb_hooks/save_family_data.pb.js fehlt - speichere ohne Konfliktschutz.');
        try {
          const rec = await pb.collection(PB_COLLECTION).update(sent.recordId, { data: sent.local });
          syncBase = sent.local; syncBaseUpdated = rec.updated || syncBaseUpdated;
          const latest = readPending();
          if (latest && latest.seq === sent.seq) clearPending();
          else if (latest) writePending({ ...latest, base: syncBase, baseUpdated: syncBaseUpdated });
          writeCache();
          if (!latest || latest.seq === sent.seq) { setSyncStatus('ok'); return; }
          continue;
        } catch (e2) { setSyncStatus('error'); scheduleSyncRetry(); return; }
      }

      if (res.ok && body.success) {
        syncBase = sent.local;
        syncBaseUpdated = body.updated;
        writeCache();
        const latest = readPending();
        if (latest && latest.seq === sent.seq) { clearPending(); setSyncStatus('ok'); return; }
        // Another change came in while saving: build on the state just saved
        // and send that one as well.
        if (latest) writePending({ ...latest, base: syncBase, baseUpdated: syncBaseUpdated });
        continue;
      }

      if (res.status === 409 && body.conflict) {
        // Someone else saved in the meantime: merge both states.
        const remote = body.data || {};
        const latest = readPending() || sent;
        const merged = mergeFamilyData(latest.base || {}, latest.local, remote);
        syncBase = remote;
        syncBaseUpdated = body.updated;
        writeCache();
        applyFamilyData(composeFamilyState(merged));
        rerenderAfterRemoteChange();
        writePending({ seq: ++pendingSeq, recordId: familyRecordId, base: syncBase, baseUpdated: syncBaseUpdated, local: buildFamilyPayload() });
        continue;
      }

      console.error('Speichern fehlgeschlagen', res.status, body);
      setSyncStatus('error');
      scheduleSyncRetry();
      return;
    }
    scheduleSyncRetry(); // unusually many conflicts in a row - try again later
  } finally {
    syncInFlight = false;
    if (syncRerun) { syncRerun = false; flushSync(); }
  }
}

// Fetch changes from other devices regularly. If there are own pending changes,
// flushSync() takes care of merging; otherwise the new server state is shown directly.
async function pullRemoteChanges() {
  if (!familyRecordId) return;
  kassenLoad(false); // Funds of other devices (throttled)
  areasPull(); // Areas (recipes, meal plan …) of other devices
  if (syncInFlight) return;
  if (readPending()) { flushSync(); return; }
  try {
    const rec = await pb.collection(PB_COLLECTION).getOne(familyRecordId, { query: { bereiche: areaKnownParam() } });
    if (rec.updated && rec.updated !== syncBaseUpdated) {
      syncBase = rec.data || {};
      syncBaseUpdated = rec.updated;
      writeCache();
      applyFamilyData(composeFamilyState(syncBase));
      rerenderAfterRemoteChange();
    }
    setSyncStatus('ok');
  } catch (e) {
    setSyncStatus('offline');
  }
}
window.addEventListener('online', () => { flushSync(); pullRemoteChanges(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { pullRemoteChanges(); loadAufgaben(); } });

async function saveMembers() { await persistState(); }
async function saveMealPlan() { await persistState(); }
async function saveRecipes() { await persistState(); }
async function saveTasks() { await persistState(); }

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familiensync');
