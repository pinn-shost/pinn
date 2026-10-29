/* pinn. – Overview: tiles & grid (js/uebersicht.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the overview tiles (OVERVIEW_TILES, default order, personal order/visibility), which tiles can appear
   (overviewTileAvailable, visibleOverviewTiles), building the grid for phone, iPad and computer (applyOverviewLayout) and
   refreshOverviewTiles. The single tiles are in js/familienkachel.js, js/wetterkachel.js and js/geburtstage.js. */

/* ==========================================================
   Overview: personally adjustable tiles
   ----------------------------------------------------------
   Order and visibility per profile (stored with the personal design, i.e.
   across devices and sent later when offline). Large tiles: calendar, meals, tasks.
   Small tiles: weather (3 days) and birthdays (iCloud and Google contacts, pb_hooks/geburtstage.pb.js).
   - Phone / iPad portrait: all visible tiles one below the other in the chosen order.
   - iPad landscape / computer: calendar over the full height on the left (or right, if another large
     tile comes before it), all other tiles next to it one below the other.
   ========================================================== */
const OVERVIEW_TILES = [
  { id: 'wetter', icon: '🌤️', get label() { return tk('overview.tile.weather'); }, get hint() { return tk('overview.tileHint.weather'); }, big: false },
  { id: 'geburtstage', icon: '🎂', get label() { return tk('overview.tile.birthdays'); }, get hint() { return tk('overview.tileHint.birthdays'); }, big: false },
  { id: 'familie', icon: '👨‍👩‍👧', get label() { return tk('overview.tile.members'); }, get hint() { return tk('overview.tileHint.members'); }, big: false },
  { id: 'vertraege', icon: '📄', get label() { return tk('overview.tile.contracts'); }, get hint() { return tk('overview.tileHint.contracts'); }, big: false },
  { id: 'pinnwand', icon: '📌', get label() { return tk('overview.tile.board'); }, get hint() { return tk('overview.tileHint.board'); }, big: false },
  { id: 'kalender', icon: '📅', get label() { return tk('overview.tile.calendar'); }, get hint() { return tk('overview.tileHint.calendar'); }, big: true },
  { id: 'essen', icon: '🍽️', get label() { return tk('overview.tile.meals'); }, get hint() { return tk('overview.tileHint.meals'); }, big: true },
  { id: 'aufgaben', icon: '✅', get label() { return tk('overview.tile.tasks'); }, get hint() { return tk('overview.tileHint.tasks'); }, big: true },
];
const OVERVIEW_DEFAULT_ORDER = OVERVIEW_TILES.map(t => t.id);
const OVERVIEW_SECTION_IDS = {
  kalender: 'calendarSection', essen: 'recipeSection', aufgaben: 'taskSection',
  wetter: 'weatherTileSection', geburtstage: 'birthdayTileSection', vertraege: 'contractTileSection',
  pinnwand: 'boardTileSection', familie: 'familyTileSection',
};
const OVERVIEW_BDAY_DAY_OPTIONS = [7, 14, 30, 60];
let overviewOrder = OVERVIEW_DEFAULT_ORDER.slice();
let overviewHidden = [];
let overviewBdayDays = 14;
let overviewBdayOnlyUpcoming = true;
// Birthdays hidden by swiping (short keys, stored personally). "var": may be read before this line
var overviewBdayHidden = new Set();
// Contract deadlines hidden by swiping on the overview (key per contract and date, since 1.118)
var overviewVtHidden = new Set();
let lastOverviewTileKey = '';
let overviewGridColumns = '';
let overviewCalendarSide = ''; // 'links' | 'rechts' | '' (no calendar next to other tiles)

function overviewTile(id) { return OVERVIEW_TILES.find(t => t.id === id); }
function overviewSection(id) { return document.getElementById(OVERVIEW_SECTION_IDS[id]); }

function applyOverviewPrefs(w) {
  const known = OVERVIEW_DEFAULT_ORDER;
  const order = Array.isArray(w.ovOrder) ? w.ovOrder.filter((id, i, a) => known.includes(id) && a.indexOf(id) === i) : [];
  // Sort tiles added later into their default position
  known.forEach(id => {
    if (!order.includes(id)) order.splice(Math.min(known.indexOf(id), order.length), 0, id);
  });
  overviewOrder = order;
  overviewHidden = Array.isArray(w.ovHidden) ? w.ovHidden.filter((id, i, a) => known.includes(id) && a.indexOf(id) === i) : [];
  if (overviewHidden.length >= known.length) overviewHidden = [];
  overviewBdayDays = OVERVIEW_BDAY_DAY_OPTIONS.includes(w.ovBdayDays) ? w.ovBdayDays : 14;
  overviewBdayOnlyUpcoming = typeof w.ovBdayOnlyUpcoming === 'boolean' ? w.ovBdayOnlyUpcoming : true;
  overviewBdayHidden = bdayUnpackHidden(w.ovBdayHidden);
  overviewVtHidden = bdayUnpackHidden(w.ovVtHidden);
}

// Can the tile appear at all right now (regardless of the setting)?
function overviewTileAvailable(id) {
  if (id === 'kalender') return !isCalendarHiddenForGuest();
  if (id === 'geburtstage') {
    if (isCurrentUserGuest()) return false;
    if (overviewBdayOnlyUpcoming) return visibleUpcomingBirthdays(overviewBdayDays).length > 0;
  }
  if (id === 'vertraege') {
    // Only if a cancellation deadline or reminder is coming up
    try { return !isCurrentUserGuest() && isViewAllowed('finanzen') && !!finance && vtTileList().length > 0; } catch (e) { return false; }
  }
  if (id === 'familie') return !isCurrentUserGuest() && members.length > 0;
  if (id === 'pinnwand') {
    // Only if something is pinned (and the pinboard is not hidden for guests)
    try { return isViewAllowed('pinnwand') && pwTileNotes().length > 0; } catch (e) { return false; }
  }
  return true;
}
function visibleOverviewTiles() {
  let v = overviewOrder.filter(id => !overviewHidden.includes(id) && overviewTileAvailable(id));
  // iPad & computer: the weather sits in the header next to date and time, not as a tile
  if (!isMobile()) v = v.filter(id => id !== 'wetter');
  if (!v.length) v = ['kalender', 'essen', 'aufgaben'].filter(overviewTileAvailable);
  return v;
}

// Builds the grid of the overview (without redrawing contents)
function applyOverviewLayout() {
  const mainGrid = document.getElementById('mainGrid');
  const calendarModeToggle = document.getElementById('calendarModeToggle');
  const visible = visibleOverviewTiles();
  lastOverviewCalendarHidden = isCalendarHiddenForGuest();
  lastOverviewTileKey = visible.join(',');

  OVERVIEW_DEFAULT_ORDER.forEach(id => {
    const sec = overviewSection(id);
    if (!sec) return;
    sec.classList.toggle('hidden', !visible.includes(id));
    sec.style.order = '';
    sec.style.flex = '';
    sec.style.height = '';
    sec.style.gridColumn = '';
    sec.style.gridRow = '';
    sec.classList.remove('shrink-0', 'border-t', 'border-l', 'border-r');
  });
  mainGrid.classList.remove('grid-cols-1', 'lg:grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.1fr_0.8fr_0.8fr]', 'grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
  mainGrid.style.gridTemplateRows = '';
  mainGrid.style.gridTemplateColumns = '';
  overviewGridColumns = '';
  overviewCalendarSide = '';

  const hasCalendar = visible.includes('kalender');
  // On the phone the overview always shows the day (swipe for previous/next) - the switch belongs to „Kalender“
  const showModeToggle = hasCalendar && !isMobile();
  calendarModeToggle.classList.toggle('hidden', !showModeToggle);
  calendarModeToggle.classList.toggle('flex', showModeToggle);
  const isBig = id => !!(overviewTile(id) && overviewTile(id).big);
  const rowSize = id => isBig(id) ? 'minmax(0, 1fr)' : 'auto';

  if (isMobile() || isPortraitOrientation()) {
    // Everything one below the other for scrolling, in the chosen order
    calendarMode = 'day';
    mainGrid.classList.remove('grid');
    mainGrid.classList.add('flex', 'flex-col', 'overflow-y-auto');
    visible.forEach((id, i) => {
      const sec = overviewSection(id);
      sec.style.order = String(i + 1);
      sec.style.flex = '0 0 auto';
      sec.classList.add('shrink-0');
      if (id === 'kalender') sec.style.height = '65vh'; // fixed height so the timeline has room
      if (i > 0) sec.classList.add('border-t');
    });
  } else {
    mainGrid.classList.remove('flex', 'flex-col', 'overflow-y-auto');
    mainGrid.classList.add('grid');
    const others = visible.filter(id => id !== 'kalender');
    if (hasCalendar && others.some(isBig)) {
      // Calendar over the full height, the other tiles next to it one below the other
      const calLeft = visible.filter(isBig)[0] === 'kalender';
      overviewCalendarSide = calLeft ? 'links' : 'rechts';
      overviewGridColumns = calLeft ? '1.3fr minmax(0, 1fr)' : 'minmax(0, 1fr) 1.3fr';
      mainGrid.style.gridTemplateColumns = overviewGridColumns;
      mainGrid.style.gridTemplateRows = others.map(rowSize).join(' ');
      const cal = overviewSection('kalender');
      cal.style.gridColumn = calLeft ? '1' : '2';
      cal.style.gridRow = '1 / span ' + others.length;
      cal.classList.add(calLeft ? 'border-r' : 'border-l');
      others.forEach((id, i) => {
        const sec = overviewSection(id);
        sec.style.gridColumn = calLeft ? '2' : '1';
        sec.style.gridRow = String(i + 1);
        if (i > 0) sec.classList.add('border-t');
      });
    } else {
      // Only one column over the full width
      overviewGridColumns = 'minmax(0, 1fr)';
      mainGrid.style.gridTemplateColumns = overviewGridColumns;
      mainGrid.style.gridTemplateRows = visible.map(rowSize).join(' ');
      visible.forEach((id, i) => {
        const sec = overviewSection(id);
        sec.style.gridColumn = '1';
        sec.style.gridRow = String(i + 1);
        if (i > 0) sec.classList.add('border-t');
      });
    }
    if (hasCalendar && calendarMode !== 'day' && calendarMode !== 'week') calendarMode = 'week';
  }
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === calendarMode));
  // The phone list view is only as high as its appointments – the fixed 65vh above is for the timeline.
  // Without this the list stayed "unfolded" to the timeline height, e.g. after going back from a recipe (fixed in 1.118.4).
  try { applyOverviewCalendarHeight(); } catch (e) { /* calendar not built yet */ }
  try { renderHeaderWeather(); } catch (e) { /* header not ready yet */ }
}

// Redraw the tiles; if this changed which tiles are visible (e.g. a birthday is now
// coming up), adjust the grid of the open overview.
function refreshOverviewTiles() {
  try {
    renderWeatherTile();
    renderBirthdayTile();
    renderFamilyTile();
    renderContractTile();
    renderBoardTile();
    if (currentView !== 'uebersicht' || !familyRecordId || recipeDetailOpenedFromUebersicht) return;
    if (visibleOverviewTiles().join(',') === lastOverviewTileKey) return;
    const prevMode = calendarMode;
    applyOverviewLayout();
    applyMealCardLayout();
    if (calendarMode !== prevMode) renderCalendar();
  } catch (e) { /* app not fully built yet */ }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('uebersicht');
