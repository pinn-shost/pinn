/* pinn. – Views & sidebar (js/ansichten.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: side menu (setSidebar, closing on taps outside the open menu without triggering the page behind it),
   switching pages (setView – locked menus for guests, overview tiles, default list/calendar view, tasks | household),
   the mobile tab bar with its drawer (renderBottomTabBar, open/close/toggleBottomTabDrawer, swipe on the bar),
   responsive mode (MOBILE_BREAKPOINT, isMobile, isPortraitOrientation, mobile overview tabs, updateResponsiveMode
   on resize/rotation) and swipe navigation in the calendar (attachSwipeNavigation).
   setView, isMobile and the other functions are called by the inline script and most files in js/ – only at
   runtime, never while loading. */

/* ==========================================================
   Views & sidebar
   ========================================================== */
function setSidebar(open) {
  sidebarOpen = open;
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('w-64', open);
  sidebar.classList.toggle('w-0', !open);
  // An open menu locks the page behind it completely (see CSS "body.sidebar-open")
  document.body.classList.toggle('sidebar-open', open);
  if (open) {
    const active = document.activeElement;
    if (active && active !== document.body && !sidebar.contains(active)) active.blur(); // Close the keyboard/focus of the page
  }
  ['appShell', 'bottomTabBar'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  });
  if (open && typeof closeBottomTabDrawer === 'function') closeBottomTabDrawer();
}
document.getElementById('menuToggle').addEventListener('click', () => setSidebar(!sidebarOpen));

// Menu open: every tap outside the menu only closes the menu - the page behind it
// (incl. buttons, links, input fields, tab bar) does not react to it.
// It closes on release (touchend/pointerup), because iOS sends no "click" after a blocked
// touchstart. The click that may still follow is swallowed,
// so that it does not trigger a button on the (then free again) page.
let sidebarSwallowClickUntil = 0;
function isOutsideSidebarOnPage(target) {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.contains(target)) return false;
  // Open dialogs/overlays outside the page (e.g. search, PIN) stay usable
  const appRoot = document.getElementById('appRoot');
  const bottomTabBar = document.getElementById('bottomTabBar');
  return appRoot.contains(target) || (bottomTabBar && bottomTabBar.contains(target))
    || target === document.body || target === document.documentElement;
}
function sidebarBlockEvent(e) {
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}
function sidebarOutsideRelease(e) {
  if (!sidebarOpen || !isOutsideSidebarOnPage(e.target)) return;
  sidebarBlockEvent(e);
  sidebarSwallowClickUntil = Date.now() + 600;
  setSidebar(false);
}
// Press outside: only block (no focus, no scrolling, no page handlers)
['pointerdown', 'mousedown', 'touchstart', 'touchmove'].forEach(type => {
  document.addEventListener(type, (e) => {
    if (sidebarOpen && isOutsideSidebarOnPage(e.target)) sidebarBlockEvent(e);
  }, { capture: true, passive: false });
});
// Release outside: close the menu
document.addEventListener('touchend', sidebarOutsideRelease, { capture: true, passive: false });
document.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') sidebarOutsideRelease(e); }, { capture: true });
// Clicks: block outside while the menu is open (and close it if no touchend/pointerup came);
// swallow the trailing click right after closing
document.addEventListener('click', (e) => {
  if (Date.now() < sidebarSwallowClickUntil) {
    sidebarSwallowClickUntil = 0;
    if (!document.getElementById('sidebar').contains(e.target)) sidebarBlockEvent(e);
    return;
  }
  if (!sidebarOpen || !isOutsideSidebarOnPage(e.target)) return;
  sidebarBlockEvent(e);
  setSidebar(false);
}, { capture: true });

function setView(view) {
  if (!isViewAllowed(view)) view = firstAllowedView(); // Guests: locked menus
  if (view !== 'pinnwand' && typeof pwArr !== 'undefined' && pwArr.on) pwArrangeEnd(); // Board: end arranging
  closeBottomTabDrawer();
  const isNavigatingToNewView = view !== currentView;
  if (isNavigatingToNewView && (view === 'uebersicht' || view === 'rezepte')) {
    weekSliderNeedsAutoScroll = true;
  }
  currentView = view;
  try { lpRenderBanner(); } catch (e) { /* Shopping notice: hide on the lists page */ }
  if (view !== 'uebersicht') { expandedMealCardId = null; }
  applyMealCardLayout();
  const mainGrid = document.getElementById('mainGrid');
  const settingsView = document.getElementById('settingsView');
  const calendarSection = document.getElementById('calendarSection');
  const recipeSection = document.getElementById('recipeSection');
  const taskSection = document.getElementById('taskSection');
  const householdSection = document.getElementById('householdSection');
  const einkaufSection = document.getElementById('einkaufSection');
  const financeSection = document.getElementById('financeSection');
  const pantrySection = document.getElementById('pantrySection');
  const pinboardSection = document.getElementById('pinboardSection');
  const documentsSection = document.getElementById('documentsSection');
  const vehiclesSection = document.getElementById('vehiclesSection');
  const houseSection = document.getElementById('houseSection');
  const familySection = document.getElementById('familySection');
  const recipeControls = document.getElementById('recipeControls');
  const calendarModeToggle = document.getElementById('calendarModeToggle');
  const mobileSectionTabs = document.getElementById('mobileSectionTabs');

  const navView = view === 'haushalt' ? 'aufgaben' : view; // Household belongs to "Tasks"
  document.querySelectorAll('.nav-item').forEach(btn => {
    const active = btn.dataset.view === navView;
    btn.classList.toggle('bg-white/10', active);
    btn.classList.toggle('border-mustard', active);
    btn.classList.toggle('border-transparent', !active);
  });
  document.querySelectorAll('.bottom-tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === navView);
  });

  if (view === 'einstellungen' || view === 'konto') {
    const accountView = document.getElementById('accountView');
    mainGrid.classList.add('hidden');
    mobileSectionTabs.classList.add('hidden');
    settingsView.classList.toggle('hidden', view !== 'einstellungen');
    settingsView.classList.toggle('flex', view === 'einstellungen');
    settingsView.classList.toggle('flex-col', view === 'einstellungen');
    accountView.classList.toggle('hidden', view !== 'konto');
    accountView.classList.toggle('flex', view === 'konto');
    accountView.classList.toggle('flex-col', view === 'konto');
    renderSettings();
    setSidebar(false);
    return;
  }

  document.getElementById('accountView').classList.add('hidden');
  document.getElementById('accountView').classList.remove('flex', 'flex-col');
  settingsView.classList.add('hidden');
  settingsView.classList.remove('flex', 'flex-col');
  mainGrid.classList.remove('hidden');
  mobileSectionTabs.classList.add('hidden');
  mainGrid.style.gridTemplateRows = '';
  householdSection.classList.add('hidden');
  householdSection.classList.remove('flex');
  einkaufSection.classList.add('hidden');
  einkaufSection.classList.remove('flex');
  financeSection.classList.add('hidden');
  financeSection.classList.remove('flex');
  pantrySection.classList.add('hidden');
  pantrySection.classList.remove('flex');
  pinboardSection.classList.add('hidden');
  pinboardSection.classList.remove('flex');
  documentsSection.classList.add('hidden');
  documentsSection.classList.remove('flex');
  vehiclesSection.classList.add('hidden');
  vehiclesSection.classList.remove('flex');
  houseSection.classList.add('hidden');
  houseSection.classList.remove('flex');
  familySection.classList.add('hidden');
  familySection.classList.remove('flex');
  if (view !== 'familie') famStopPolling();
  // Reset adjustments left over from the mobile overview scroll view before
  // another view (events/recipes/tasks) is built normally in the grid layout.
  mainGrid.classList.remove('flex', 'flex-col', 'overflow-y-auto');
  mainGrid.classList.add('grid');
  if (view !== 'uebersicht') mainGrid.style.gridTemplateColumns = '';
  [calendarSection, taskSection, recipeSection].forEach(sec => {
    sec.style.order = '';
    sec.style.flex = '';
    sec.style.height = '';
    sec.style.gridColumn = '';
    sec.style.gridRow = '';
    sec.classList.remove('shrink-0', 'border-t', 'border-l');
  });
  // Overview tiles (weather, birthdays, cancellation deadlines) only exist there
  ['weatherTileSection', 'birthdayTileSection', 'contractTileSection', 'boardTileSection', 'familyTileSection'].forEach(id => {
    const sec = document.getElementById(id);
    sec.classList.add('hidden');
    sec.style.order = '';
    sec.style.flex = '';
    sec.style.gridColumn = '';
    sec.style.gridRow = '';
    sec.classList.remove('shrink-0', 'border-t', 'border-l');
  });
  taskSection.classList.add('border-l');

  if (view === 'termine') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    calendarSection.classList.remove('hidden', 'border-r');
    recipeSection.classList.add('hidden');
    taskSection.classList.add('hidden');
    calendarModeToggle.classList.remove('hidden');
    calendarModeToggle.classList.add('flex');
    document.querySelectorAll('.termine-only-mode').forEach(b => b.classList.remove('hidden'));
    // On the phone start with the day view when opening; after that switch freely between day/week/month/year
    if (isMobile() && isNavigatingToNewView) calendarMode = 'day';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === calendarMode));
  } else if (view === 'rezepte') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    recipeSection.classList.remove('hidden');
    calendarSection.classList.add('hidden');
    taskSection.classList.add('hidden');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
  } else if (view === 'aufgaben') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.remove('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
  } else if (view === 'haushalt') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    householdSection.classList.remove('hidden');
    householdSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    renderHousehold();
  } else if (view === 'einkauf') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    einkaufSection.classList.remove('hidden');
    einkaufSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    initShoppingListDatesIfEmpty();
    // When opening shopping, always start with the overview of all lists - but not when it is only
    // rebuilt (e.g. when rotating the phone): then the open list stays open.
    if (isNavigatingToNewView) {
      currentShoppingListId = null;
      currentShoppingPlanTaskId = null;
      shoppingBackToPlanTaskId = null;
      listsDetailId = null;
    }
    renderShoppingList();
  } else if (view === 'vorrat') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    pantrySection.classList.remove('hidden');
    pantrySection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    renderPantry();
  } else if (view === 'pinnwand') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    pinboardSection.classList.remove('hidden');
    pinboardSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    renderPinboard();
    pwScheduleMarkSeen();
  } else if (view === 'finanzen') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    financeSection.classList.remove('hidden');
    financeSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    if (isNavigatingToNewView) { finOffset = 0; finCategoryFilter = null; }
    renderFinance();
    loadAusgaben();
  } else if (view === 'dokumente') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    documentsSection.classList.remove('hidden');
    documentsSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    renderDocuments();
    loadDocuments();
    docFlush();
  } else if (view === 'fahrzeuge') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    vehiclesSection.classList.remove('hidden');
    vehiclesSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    if (isNavigatingToNewView) { fzDetailId = fzDetailId && fzVehicle(fzDetailId) ? fzDetailId : null; }
    renderVehicles();
    loadAusgaben();
    loadFinDocs();
    ensureFinDocToken().then(refreshDocLinks);
  } else if (view === 'haus') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    houseSection.classList.remove('hidden');
    houseSection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    renderHouse();
    loadAusgaben();
    loadDocuments();
  } else if (view === 'familie') {
    mainGrid.classList.remove('lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    taskSection.classList.add('hidden');
    calendarSection.classList.add('hidden');
    recipeSection.classList.add('hidden');
    familySection.classList.remove('hidden');
    familySection.classList.add('flex');
    calendarModeToggle.classList.add('hidden');
    calendarModeToggle.classList.remove('flex');
    if (isNavigatingToNewView) famFitted = false;
    renderFamily();
    if (famPollWanted()) famStartPolling(); else famStopPolling();
  } else {
    // Overview: tiles in the personally chosen order (Settings → Overview).
    // If the calendar is hidden for guests, it is missing here as well.
    document.querySelectorAll('.termine-only-mode').forEach(b => b.classList.add('hidden'));
    applyOverviewLayout();
    renderWeatherTile();
    renderBirthdayTile();
    renderFamilyTile();
    renderContractTile();
    renderBoardTile();
  }

  // Switch tasks | household (not in the overview)
  document.querySelectorAll('.task-kind-tabs .ls-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.taskKind === view);
    b.setAttribute('aria-selected', String(b.dataset.taskKind === view));
  });
  document.getElementById('taskKindTabsMain').classList.toggle('is-off', view !== 'aufgaben');
  recipeControls.classList.toggle('hidden', view !== 'rezepte');
  recipeControls.classList.toggle('flex', view === 'rezepte');
  document.getElementById('addMealOverviewBtn').classList.toggle('hidden', view !== 'uebersicht');

  // When entering the overview or events, apply the default view chosen in the settings
  // (list/calendar) - separately for iPad/desktop and phone, and only if its
  // scope includes this view.
  const defaultViewMode = isMobile() ? defaultViewModeMobile : defaultViewModeDesktop;
  const defaultViewScope = isMobile() ? defaultViewScopeMobile : defaultViewScopeDesktop;
  if ((view === 'uebersicht' && (defaultViewScope === 'both' || defaultViewScope === 'uebersicht')) ||
      (view === 'termine' && (defaultViewScope === 'both' || defaultViewScope === 'termine'))) {
    dayViewDisplayMode = defaultViewMode;
    const toggleBtn = document.getElementById('dayListToggleBtn');
    if (toggleBtn) toggleBtn.textContent = dayViewDisplayMode === 'timeline' ? '📋' : '🗓';
  }

  renderCalendar();
  renderRecipesForCurrentView();
  renderTasks();
  setSidebar(false);
}
document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
document.querySelectorAll('.task-kind-tabs .ls-tab').forEach(btn => btn.addEventListener('click', () => {
  if (btn.dataset.taskKind !== currentView) setView(btn.dataset.taskKind);
}));

/* ---------- Mobile tab bar: 4 selectable favourites + settings, drawer for the rest ---------- */
function renderBottomTabBar() {
  const mainRow = document.getElementById('bottomTabMainRow');
  const drawerGrid = document.getElementById('bottomTabDrawerGrid');
  const buildBtn = (tab) => `
    <button type="button" data-view="${tab.id}" class="bottom-tab-item flex flex-col items-center gap-0.5 py-2 text-ink/50">
      <span class="text-lg leading-none">${tab.icon}</span>
      <span class="text-[10px]">${tab.label}</span>
    </button>
  `;
  // Guests see neither finance nor settings - their account takes the place of settings
  const einstellungenTab = isCurrentUserGuest()
    ? { id: 'konto', icon: '👤', label: 'Konto' }
    : { id: 'einstellungen', icon: '⚙️', label: 'Einstellungen' };
  const allowedTabs = ALL_MENU_TABS.filter(t => isViewAllowed(t.id));
  const favorites = favoriteTabs.map(id => allowedTabs.find(t => t.id === id)).filter(Boolean);
  const rest = allowedTabs.filter(t => !favorites.includes(t));
  while (favorites.length < 4 && rest.length) favorites.push(rest.shift());

  mainRow.innerHTML = favorites.map(buildBtn).join('') + buildBtn(einstellungenTab);
  drawerGrid.innerHTML = rest.map(buildBtn).join('');

  document.querySelectorAll('#bottomTabMainRow .bottom-tab-item, #bottomTabDrawerGrid .bottom-tab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      closeBottomTabDrawer();
      setView(btn.dataset.view);
    });
  });
  document.querySelectorAll('.bottom-tab-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === (currentView === 'haushalt' ? 'aufgaben' : currentView));
  });
  try { pwUpdateBadges(); } catch (e) { /* Board not ready yet */ }
}

function openBottomTabDrawer() {
  document.getElementById('bottomTabDrawer').classList.remove('hidden');
  document.getElementById('bottomTabBackdrop').classList.remove('hidden');
}
function closeBottomTabDrawer() {
  document.getElementById('bottomTabDrawer').classList.add('hidden');
  document.getElementById('bottomTabBackdrop').classList.add('hidden');
}
function toggleBottomTabDrawer() {
  if (document.getElementById('bottomTabDrawer').classList.contains('hidden')) openBottomTabDrawer();
  else closeBottomTabDrawer();
}
document.getElementById('bottomTabHandle').addEventListener('click', toggleBottomTabDrawer);
document.getElementById('bottomTabBackdrop').addEventListener('click', closeBottomTabDrawer);

// Pushing up (swiping up) on the bar opens the drawer, pushing down on the
// open drawer closes it again - in addition to tapping the handle.
(function attachBottomTabSwipe() {
  const bar = document.getElementById('bottomTabBar');
  let startY = null;
  bar.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
  }, { passive: true });
  bar.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    const isOpen = !document.getElementById('bottomTabDrawer').classList.contains('hidden');
    if (dy < -30 && !isOpen) openBottomTabDrawer();
    else if (dy > 30 && isOpen) closeBottomTabDrawer();
  }, { passive: true });
})();

/* ---------- Mobile mode (iPhone): responsive detection, calendar/recipe tabs, swipe navigation ---------- */
const MOBILE_BREAKPOINT = 768;
// Deliberately check the SHORTER side, not just the width: a phone in landscape is often wider than
// 768px (e.g. iPhone Pro Max ~930px) but stays small in height - the shorter side of a
// phone stays below the limit in EVERY orientation, an iPad is above it in both orientations.
function isMobile() { return Math.min(window.innerWidth, window.innerHeight) < MOBILE_BREAKPOINT; }
// For the iPad (isMobile() is false there): portrait should be stacked like on the phone, only
// landscape has enough width for the 2-column overview (calendar left, recipes/tasks right).
function isPortraitOrientation() { return window.innerHeight > window.innerWidth; }

let mobileOverviewTab = 'kalender';
function applyMobileOverviewTab() {
  const calendarSection = document.getElementById('calendarSection');
  const recipeSection = document.getElementById('recipeSection');
  const taskSection = document.getElementById('taskSection');
  if (!isMobile() || currentView !== 'uebersicht') return;
  calendarSection.classList.toggle('hidden', mobileOverviewTab !== 'kalender');
  recipeSection.classList.toggle('hidden', mobileOverviewTab !== 'rezepte');
  taskSection.classList.toggle('hidden', mobileOverviewTab !== 'aufgaben');
  document.querySelectorAll('.mobile-section-tab').forEach(btn => {
    const active = btn.dataset.section === mobileOverviewTab;
    btn.classList.toggle('text-pine', active);
    btn.classList.toggle('border-pine', active);
    btn.classList.toggle('text-ink/40', !active);
    btn.classList.toggle('border-transparent', !active);
  });
}
document.querySelectorAll('.mobile-section-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    mobileOverviewTab = btn.dataset.section;
    applyMobileOverviewTab();
  });
});

let lastKnownPortrait = null;
function updateResponsiveMode() {
  const wasMobile = document.body.classList.contains('mobile-mode');
  const nowMobile = isMobile();
  const nowPortrait = isPortraitOrientation();
  document.body.classList.toggle('mobile-mode', nowMobile);
  if (wasMobile === nowMobile && lastKnownPortrait === nowPortrait) return;
  lastKnownPortrait = nowPortrait;
  // When switching between mobile/wide OR when rotating (portrait/landscape, esp. iPad), rebuild the current
  // view so that e.g. the forced day/week view, the 2-column overview and the
  // calendar/recipe tabs apply correctly or disappear again.
  if (currentView !== 'einstellungen' && currentView !== 'konto' && familyRecordId) setView(currentView);
}
let responsiveResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(responsiveResizeTimer);
  responsiveResizeTimer = setTimeout(updateResponsiveMode, 150);
});

function attachSwipeNavigation(el) {
  let startX = null, startY = null;
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null; startY = null;
    // Swiping pages forward or back in every view (day, week, month, year)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) document.getElementById('nextPeriod').click();
      else document.getElementById('prevPeriod').click();
      el.classList.remove('cal-swipe-l', 'cal-swipe-r');
      void el.offsetWidth;
      el.classList.add(dx < 0 ? 'cal-swipe-l' : 'cal-swipe-r');
    }
  }, { passive: true });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('ansichten');
