/* pinn. – Calendar views (js/kalenderansicht.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: renderCalendar and the views day, week (timeline, list, phone list), month and year, the time window of the
   timeline, hour labels, drag & drop of meals onto days, and the mode switch (day/week/month/year) with previous/next/today.
   Appointment data comes from js/offline.js (rebuildEvents), the meal popup is in js/essenplanen.js. */

/* ==========================================================
   Calendar rendering (day + week + month + year)
   ========================================================== */
// Phone overview in list view: the calendar is only as high as its appointments (no empty
// placeholder). In the timeline view (day with times) the fixed height of 65vh stays.
function isCompactOverviewCalendarList() {
  return currentView === 'uebersicht' && isMobile() && calendarMode === 'day' && dayViewDisplayMode === 'list';
}
function applyOverviewCalendarHeight() {
  const sec = document.getElementById('calendarSection');
  const body = document.getElementById('calendarBody');
  if (!sec || !body) return;
  const stacked = currentView === 'uebersicht' && (isMobile() || isPortraitOrientation());
  const compact = isCompactOverviewCalendarList();
  if (stacked) sec.style.height = compact ? 'auto' : '65vh';
  body.style.flex = compact ? '0 0 auto' : '';
  body.style.overflowY = compact ? 'visible' : '';
}

function renderCalendar() {
  applyOverviewCalendarHeight();
  if (currentView === 'uebersicht' && calendarMode === 'day') { renderDayView(); return; }
  if (currentView === 'termine') {
    if (calendarMode === 'day') { renderDayView(); return; }
    if (calendarMode === 'month') { renderMonthGrid(); return; }
    if (calendarMode === 'year') { renderYearGrid(); return; }
  }
  renderWeekGrid();
}

function currentWeekRange() {
  const base = new Date();
  base.setDate(base.getDate() + weekOffset * 7);
  const monday = startOfWeek(base);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

/* ---------- Drag & drop helpers for meals ---------- */
function attachMealDragSource(el, mealId) {
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', mealId);
    e.dataTransfer.effectAllowed = 'move';
  });
}
function attachDayDropTarget(el, dayISO, mealTypeOverride) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('ring-2', 'ring-mustard'); });
  el.addEventListener('dragleave', () => el.classList.remove('ring-2', 'ring-mustard'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('ring-2', 'ring-mustard');
    const mealId = e.dataTransfer.getData('text/plain');
    const entry = mealPlan.find(p => p.id === mealId);
    if (!entry) return;
    if (entry.date !== dayISO) { delete entry.cooked; delete entry.cookedAt; }
    entry.date = dayISO;
    if (mealTypeOverride) entry.mealType = mealTypeOverride;
    saveMealPlan();
    renderCalendar();
    if (currentView === 'uebersicht') renderRecipesForCurrentView();
  });
}

// Determines a sensible time window for a timeline from the appointments actually present,
// instead of always rigidly showing 00:00-24:00. This way the height adapts flexibly: if
// appointments are far apart (e.g. 00:00 and 23:45), the whole day is shown compressed;
// if they are close together (e.g. 12:00-13:00), exactly this range is stretched/enlarged.
function computeTimeRange(eventsList) {
  const timed = eventsList.filter(e => e.time);
  if (timed.length === 0) return { start: 8 * 60, end: 20 * 60 }; // Default window without appointments
  let minStart = Infinity, maxEnd = -Infinity;
  timed.forEach(e => {
    const s = toMinutes(e.time);
    const en = e.endTime ? toMinutes(e.endTime) : Math.min(s + 60, 1439);
    if (s < minStart) minStart = s;
    if (en > maxEnd) maxEnd = en;
  });
  const PAD = 30; // some margin so appointments don't stick right at the edge
  let start = Math.max(0, minStart - PAD);
  let end = Math.min(1440, maxEnd + PAD);
  const MIN_SPAN = 120; // At least a 2h span, so a single short appointment is not zoomed in too extremely
  if (end - start < MIN_SPAN) {
    const mid = (start + end) / 2;
    start = Math.max(0, mid - MIN_SPAN / 2);
    end = Math.min(1440, start + MIN_SPAN);
    start = Math.max(0, end - MIN_SPAN);
  }
  return { start, end };
}

function renderWeekGrid() {
  const { monday, sunday } = currentWeekRange();
  const days = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
  document.getElementById('periodLabel').classList.add('truncate');
  document.getElementById('periodLabel').textContent = fmtWeekLabel(monday, sunday);

  const todayISO = isoDate(new Date());
  const dayISOs = days.map(isoDate);

  if (isMobile()) { renderWeekAgenda(days, todayISO); return; }
  if (dayViewDisplayMode === 'list') { renderWeekListGrid(days, todayISO); return; }

  // Common time window over ALL appointments of the week, so all days are scaled the same and
  // comparable (as requested: relative to all appointments in the week).
  const weekEvents = events.filter(e => dayISOs.includes(e.date) && isEventVisibleAsCalendarEntry(e));
  const { start: rangeStart, end: rangeEnd } = computeTimeRange(weekEvents);
  const rangeSpan = rangeEnd - rangeStart;
  const hourStepPercent = (60 / rangeSpan) * 100;

  const body = document.getElementById('calendarBody');
  body.innerHTML = `
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex shrink-0 bg-paper/95 backdrop-blur z-20">
        <div class="w-10 shrink-0"></div>
        <div id="weekHeaderRow" class="grid grid-cols-7 flex-1 min-w-0"></div>
      </div>
      <div class="flex shrink-0 border-b border-ink/10">
        <div class="w-10 shrink-0 pt-1.5 pl-0.5"><div class="cal-allday-label text-ink/40">${tk('cal.allDay')}</div></div>
        <div id="weekAllDayRow" class="grid grid-cols-7 flex-1 min-w-0"></div>
      </div>
      <div class="flex-1 min-h-0 flex">
        <div id="weekHourGutter" class="relative w-10 shrink-0">${buildHourGutterHtml(rangeStart, rangeEnd)}</div>
        <div id="weekTimelineRow" class="grid grid-cols-7 h-full flex-1 min-w-0"></div>
      </div>
      <div class="flex shrink-0 border-t border-ink/10">
        <div class="w-10 shrink-0"></div>
        <div id="weekMealsRow" class="grid grid-cols-7 flex-1 min-w-0"></div>
      </div>
    </div>
  `;
  const headerRow = document.getElementById('weekHeaderRow');
  const allDayRow = document.getElementById('weekAllDayRow');
  const timelineRow = document.getElementById('weekTimelineRow');
  const mealsRow = document.getElementById('weekMealsRow');

  days.forEach(d => {
    const dISO = isoDate(d);
    const isToday = dISO === todayISO;
    const allDayEvents = events.filter(e => e.date === dISO && !e.time && isEventVisibleAsCalendarEntry(e))
      .sort((a, b) => memberFilterSortWeight(a) - memberFilterSortWeight(b))
      .sort(minorSortWeight);
    const timedEvents = computeEventLayout(events.filter(e => e.date === dISO && isEventVisibleAsCalendarEntry(e)));
    const dayMeals = mealPlan.filter(p => p.date === dISO)
      .sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType));

    // Header row
    const header = document.createElement('div');
    header.className = 'day-col px-2 pt-3 pb-2 text-center cursor-pointer hover:bg-pine/5 transition';
    header.title = tk('cal.openDayView');
    header.innerHTML = `
      <div class="text-[11px] uppercase tracking-wide text-ink/40">${fmtDay(d)}</div>
      <div class="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${isToday ? 'bg-pine text-white' : 'text-ink/80'}">${d.getDate()}</div>
    `;
    header.addEventListener('click', () => jumpToDayView(dISO));
    headerRow.appendChild(header);

    // All-day
    const allDayCell = document.createElement('div');
    allDayCell.className = 'day-col px-2 py-1 flex flex-col gap-1 min-h-[8px]';
    allDayEvents.forEach(ev => {
      const chip = document.createElement('div');
      const minor = isMinorCalEvent(ev);
      chip.className = 'rounded-md px-1.5 py-1 text-[10px] text-ink truncate' + (minor ? ' cal-minor' : '') + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
      const calColor1 = colorForCalendarEvent(ev);
      chip.style.backgroundColor = hexToRgba(calColor1, minor ? 0.16 : 0.26);
      chip.style.border = `1px solid ${hexToRgba(calColor1, minor ? 0.4 : 0.55)}`;
      chip.textContent = (minor ? '' : '📅 ') + ev.title;
      attachLongPress(chip, () => ev);
      allDayCell.appendChild(chip);
    });
    allDayRow.appendChild(allDayCell);

    // Timeline - the height adapts to the common weekly time window, no scrolling needed
    const timelineCell = document.createElement('div');
    timelineCell.className = 'day-col relative';
    timelineCell.style.backgroundImage = `repeating-linear-gradient(to bottom, rgba(37,35,31,0.06) 0, rgba(37,35,31,0.06) 1px, transparent 1px, transparent ${hourStepPercent}%)`;
    attachDayDropTarget(timelineCell, dISO);
    timedEvents.forEach(ev => {
      const width = 100 / ev._colCount;
      const left = ev._col * width;
      // Appointments that span a complete day without real time info (see expandMultiDaySpan)
      // should NOT be shrunk according to the (possibly shortened to 6-22 h) time-window scale -
      // they fill the column edge to edge from top to bottom. Only the time window around them is
      // shortened, the appointment bar itself stays visually unshortened.
      const top = ev.fullDayFiller ? 0 : Math.min(Math.max((ev.startMin - rangeStart) / rangeSpan * 100, 0), 100);
      const bottom = ev.fullDayFiller ? 100 : Math.min(Math.max((ev.endMin - rangeStart) / rangeSpan * 100, 0), 100);
      const block = document.createElement('div');
      block.className = 'absolute rounded-md px-1.5 py-1 text-[10px] leading-tight text-ink overflow-hidden fade-in' + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
      block.style.top = top + '%';
      block.style.height = Math.max(bottom - top, 3) + '%';
      block.style.left = left + '%';
      block.style.width = `calc(${width}% - 2px)`;
      const calColor = colorForCalendarEvent(ev);
      block.style.backgroundColor = hexToRgba(calColor, ev._col % 2 === 1 ? 0.16 : 0.26);
      block.style.border = `1px solid ${hexToRgba(calColor, 0.55)}`;
      const assignedBar = assignedMembersBarHtml(ev);
      if (assignedBar) block.style.paddingLeft = '0.5rem';
      block.innerHTML = assignedBar + `<div class="font-medium truncate">${escapeHtml(ev.title)}</div>`;
      attachLongPress(block, () => ev);
      timelineCell.appendChild(block);
    });
    timelineRow.appendChild(timelineCell);

    // Meals (always visible, at the very bottom)
    const mealsCell = document.createElement('div');
    mealsCell.className = 'day-col px-2 py-2 flex flex-col gap-1.5';
    attachDayDropTarget(mealsCell, dISO);
    dayMeals.forEach(p => {
      const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
      const title = recipe ? recipe.title : (p.title || tk('common.untitled'));
      const chip = document.createElement('div');
      chip.className = 'group relative rounded-lg px-2 py-1.5 text-xs text-white cursor-grab active:cursor-grabbing fade-in bg-mustard';
      chip.title = mealTypeLabel(p.mealType, true);
      chip.innerHTML = `
        <div class="leading-snug truncate">${mealTypeIcon(p.mealType)} ${escapeHtml(title)}</div>
        <button class="del-meal absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-ink/70 text-[10px] grid place-items-center opacity-0 group-hover:opacity-100 transition" data-id="${p.id}" aria-label="${tk('cal.deleteMeal')}">×</button>
      `;
      attachMealDragSource(chip, p.id);
      mealsCell.appendChild(chip);
    });
    const addMealBtn = document.createElement('button');
    addMealBtn.className = 'add-meal-btn py-1.5 rounded-lg border border-dashed border-ink/20 text-ink/40 text-[10px] hover:text-mustard hover:border-mustard transition';
    addMealBtn.dataset.day = dISO;
    addMealBtn.textContent = tk('cal.addMeal');
    mealsCell.appendChild(addMealBtn);
    mealsRow.appendChild(mealsCell);
  });

  body.querySelectorAll('.add-meal-btn').forEach(btn => btn.addEventListener('click', () => openMealModal(btn.dataset.day, null)));
  body.querySelectorAll('.del-meal').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    mealPlan = mealPlan.filter(p => p.id !== btn.dataset.id);
    saveMealPlan();
    renderCalendar();
    if (currentView === 'uebersicht') renderRecipesForCurrentView();
  }));
}

// List mode of the week view: the same Mon-Sun column layout as the timeline, but each
// column shows its appointments (all-day + timed together, sorted by time) as a simple
// list one below the other instead of positioned proportionally to time - just like the list mode of the
// day view, only all 7 days side by side instead of just one.
// Week view on the phone: seven columns would be too narrow - the days are listed one below the other
function renderWeekAgenda(days, todayISO) {
  const body = document.getElementById('calendarBody');
  body.innerHTML = `<div class="cal-agenda">${days.map(d => {
    const dISO = isoDate(d);
    const isToday = dISO === todayISO;
    const items = events.filter(e => e.date === dISO && isEventVisibleAsCalendarEntry(e))
      .sort(calListCompare);
    const meals = mealPlan.filter(p => p.date === dISO)
      .sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType));
    const evHtml = items.map(ev => {
      const c = colorForCalendarEvent(ev);
      const t = (ev.fullDayFiller || !ev.time) ? tk('cal.allDay') : `${ev.time}${ev.endTime ? '–' + ev.endTime : ''}`;
      return `<div class="cal-agenda-ev${isMinorCalEvent(ev) ? ' cal-minor-ag' : ''}${matchesActiveMemberFilter(ev) ? '' : ' is-dim'}" data-ev="${escapeHtml(ev.id)}" style="border-left-color:${c};background:${hexToRgba(c, isMinorCalEvent(ev) ? 0.08 : 0.13)}">
        <span class="cal-agenda-time">${t}</span><span class="cal-agenda-title">${escapeHtml(ev.title)}</span></div>`;
    }).join('');
    const mealHtml = meals.map(p => {
      const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
      const title = recipe ? recipe.title : (p.title || tk('common.untitled'));
      return `<div class="cal-agenda-meal" title="${mealTypeLabel(p.mealType, true)}">${mealTypeIcon(p.mealType)} ${escapeHtml(title)}</div>`;
    }).join('');
    return `<div class="cal-agenda-day${isToday ? ' is-today' : ''}" data-day="${dISO}">
      <button type="button" class="cal-agenda-head" data-open-day="${dISO}">
        <span class="cal-agenda-num">${d.getDate()}</span>
        <span class="cal-agenda-wd">${d.toLocaleDateString(sysLocale(), { weekday: 'long' })}<small>${d.toLocaleDateString(sysLocale(), { month: 'long', year: 'numeric' })}</small></span>
        ${isToday ? '<span class="cal-agenda-badge">' + tk('common.today') + '</span>' : ''}
      </button>
      <div class="cal-agenda-items">${evHtml || (mealHtml ? '' : '<p class="cal-agenda-empty">' + tk('cal.noEventsLabel') + '</p>')}${mealHtml}</div>
    </div>`;
  }).join('')}</div>`;
  body.querySelectorAll('[data-open-day]').forEach(btn => btn.addEventListener('click', () => jumpToDayView(btn.dataset.openDay)));
  body.querySelectorAll('[data-ev]').forEach(el => {
    const ev = events.find(x => x.id === el.dataset.ev);
    if (ev) attachLongPress(el, () => ev);
  });
  body.querySelectorAll('.cal-agenda-day').forEach(el => attachDayDropTarget(el, el.dataset.day));
}

function renderWeekListGrid(days, todayISO) {
  const body = document.getElementById('calendarBody');
  body.innerHTML = `
    <div class="flex flex-col flex-1 min-h-0">
      <div id="weekListHeaderRow" class="grid grid-cols-7 shrink-0 bg-paper/95 backdrop-blur z-20"></div>
      <div id="weekListBodyRow" class="grid grid-cols-7 flex-1 min-h-0"></div>
      <div id="weekListMealsRow" class="grid grid-cols-7 flex-1 min-w-0 shrink-0 border-t border-ink/10"></div>
    </div>
  `;
  const headerRow = document.getElementById('weekListHeaderRow');
  const listBodyRow = document.getElementById('weekListBodyRow');
  const mealsRow = document.getElementById('weekListMealsRow');

  days.forEach(d => {
    const dISO = isoDate(d);
    const isToday = dISO === todayISO;
    const allDayEvents = events.filter(e => e.date === dISO && !e.time && isEventVisibleAsCalendarEntry(e))
      .sort((a, b) => memberFilterSortWeight(a) - memberFilterSortWeight(b));
    const dayEventsRaw = events.filter(e => e.date === dISO && isEventVisibleAsCalendarEntry(e));
    const dayMeals = mealPlan.filter(p => p.date === dISO)
      .sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType));

    // Header row (identical to the timeline view)
    const header = document.createElement('div');
    header.className = 'day-col px-2 pt-3 pb-2 text-center cursor-pointer hover:bg-pine/5 transition';
    header.title = tk('cal.openDayView');
    header.innerHTML = `
      <div class="text-[11px] uppercase tracking-wide text-ink/40">${fmtDay(d)}</div>
      <div class="mt-1 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${isToday ? 'bg-pine text-white' : 'text-ink/80'}">${d.getDate()}</div>
    `;
    header.addEventListener('click', () => jumpToDayView(dISO));
    headerRow.appendChild(header);

    // List of this column: all-day + timed appointments together, sorted by time
    const listCell = document.createElement('div');
    listCell.className = 'day-col px-1.5 py-2 flex flex-col gap-1.5 overflow-y-auto min-h-0';
    attachDayDropTarget(listCell, dISO);
    // dayEventsRaw already contains the all-day appointments - deduplicate via Set, otherwise they show up twice
    const allItems = [...new Set([...allDayEvents, ...dayEventsRaw])].sort(calListCompare);
    if (allItems.length === 0) {
      listCell.innerHTML = '<p class="text-[11px] text-ink/30 italic px-0.5">' + tk('cal.noEvents') + '</p>';
    }
    allItems.forEach(ev => {
      const calColor = colorForCalendarEvent(ev);
      const timeLabel = (ev.fullDayFiller || !ev.time) ? tk('cal.allDay') : `${ev.time}${ev.endTime ? '–' + ev.endTime : ''}`;
      const card = document.createElement('div');
      card.className = 'rounded-lg border overflow-hidden fade-in px-1.5 py-1' + (isMinorCalEvent(ev) ? ' cal-minor-wl' : '') + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
      card.style.backgroundColor = hexToRgba(calColor, 0.16);
      card.style.borderColor = hexToRgba(calColor, 0.55);
      card.innerHTML = `
        <div class="text-[9px] text-ink/50 font-medium">${timeLabel}</div>
        <div class="text-[11px] font-serif truncate text-ink leading-tight">${escapeHtml(ev.title)}</div>
      `;
      attachLongPress(card, () => ev);
      listCell.appendChild(card);
    });
    listBodyRow.appendChild(listCell);

    // Meals (identical to the timeline view)
    const mealsCell = document.createElement('div');
    mealsCell.className = 'day-col px-2 py-2 flex flex-col gap-1.5';
    attachDayDropTarget(mealsCell, dISO);
    dayMeals.forEach(p => {
      const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
      const title = recipe ? recipe.title : (p.title || tk('common.untitled'));
      const chip = document.createElement('div');
      chip.className = 'group relative rounded-lg px-2 py-1.5 text-xs text-white cursor-grab active:cursor-grabbing fade-in bg-mustard';
      chip.title = mealTypeLabel(p.mealType, true);
      chip.innerHTML = `
        <div class="leading-snug truncate">${mealTypeIcon(p.mealType)} ${escapeHtml(title)}</div>
        <button class="del-meal absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-ink/70 text-[10px] grid place-items-center opacity-0 group-hover:opacity-100 transition" data-id="${p.id}" aria-label="${tk('cal.deleteMeal')}">×</button>
      `;
      attachMealDragSource(chip, p.id);
      mealsCell.appendChild(chip);
    });
    const addMealBtn = document.createElement('button');
    addMealBtn.className = 'add-meal-btn py-1.5 rounded-lg border border-dashed border-ink/20 text-ink/40 text-[10px] hover:text-mustard hover:border-mustard transition';
    addMealBtn.dataset.day = dISO;
    addMealBtn.textContent = tk('cal.addMeal');
    mealsCell.appendChild(addMealBtn);
    mealsRow.appendChild(mealsCell);
  });

  body.querySelectorAll('.add-meal-btn').forEach(btn => btn.addEventListener('click', () => openMealModal(btn.dataset.day, null)));
  body.querySelectorAll('.del-meal').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    mealPlan = mealPlan.filter(p => p.id !== btn.dataset.id);
    saveMealPlan();
    renderCalendar();
    if (currentView === 'uebersicht') renderRecipesForCurrentView();
  }));
}

function jumpToDayView(dISO) {
  const d = new Date(dISO);
  dayOffset = Math.round((d - new Date(new Date().toDateString())) / 86400000);
  calendarMode = 'day';
  currentView = 'termine';
  setView('termine');
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'day'));
}

// Builds the time labels for the left edge of the timeline (one per full hour
// within the visible time window), at the same percentage positions as the hour lines.
// Weekday names Monday to Sunday in the app language ('short' without a trailing dot, or 'narrow')
function calWeekdayLabels(width) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 1 + i); // 1 January 2024 was a Monday
    let s;
    try { s = d.toLocaleDateString(sysLocale(), { weekday: width }); } catch (e) { s = ''; }
    out.push(s.replace(/\.$/, ''));
  }
  return out;
}

function buildHourGutterHtml(rangeStart, rangeEnd) {
  const rangeSpan = rangeEnd - rangeStart;
  if (rangeSpan <= 0) return '';
  const firstHour = Math.ceil(rangeStart / 60);
  const lastHour = Math.floor(rangeEnd / 60);
  let html = '';
  for (let h = firstHour; h <= lastHour; h++) {
    const pct = (h * 60 - rangeStart) / rangeSpan * 100;
    const label = String(h % 24).padStart(2, '0') + ':00';
    html += `<div class="absolute right-1 -translate-y-1/2 text-[10px] text-ink/40 whitespace-nowrap" style="top:${pct}%">${label}</div>`;
  }
  return html;
}

function renderDayView() {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const dISO = isoDate(d);
  // In the mobile overview "Essen" now has a section of its own (above the tasks) - the
  // meal area at the bottom of the calendar table is left out there to avoid duplicates.
  // In the appointments tab (also on mobile) it stays as usual.
  const showInlineMeals = !(isMobile() && currentView === 'uebersicht');
  // In the overview the calendar column is narrower because of the 3-way split (appointments/tasks/meals)
  // than in its own appointments tab - so ALWAYS the short format there, also on the iPad
  // (which counts as "not mobile" according to isMobile(), but still has little space in the overview).
  const periodLabelEl = document.getElementById('periodLabel');
  if (isMobile()) {
    // Two lines instead of a too narrow one-line short form: "Sa. 19." on top, month centred below.
    const weekdayShort = d.toLocaleDateString(sysLocale(), { weekday: 'short' });
    const monthShort = d.toLocaleDateString(sysLocale(), { month: 'short' });
    periodLabelEl.classList.remove('truncate');
    periodLabelEl.innerHTML = `<span class="block leading-tight">${weekdayShort} ${d.getDate()}.</span><span class="block leading-tight">${monthShort}</span>`;
  } else {
    periodLabelEl.classList.add('truncate');
    periodLabelEl.textContent = currentView === 'uebersicht'
      ? d.toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
      : d.toLocaleDateString(sysLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const allDayEvents = events.filter(e => e.date === dISO && !e.time && isEventVisibleAsCalendarEntry(e))
    .sort((a, b) => memberFilterSortWeight(a) - memberFilterSortWeight(b))
    .sort(minorSortWeight);
  const dayEventsRaw = events.filter(e => e.date === dISO && isEventVisibleAsCalendarEntry(e));
  const timedEvents = computeEventLayout(dayEventsRaw);
  const dayMeals = mealPlan.filter(p => p.date === dISO)
    .sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType));

  const { start: rangeStart, end: rangeEnd } = computeTimeRange(dayEventsRaw);
  const rangeSpan = rangeEnd - rangeStart;
  const hourStepPercent = (60 / rangeSpan) * 100;

  const body = document.getElementById('calendarBody');

  if (dayViewDisplayMode === 'list') {
    const compactList = isCompactOverviewCalendarList();
    body.innerHTML = `
      <div class="flex flex-col w-full${compactList ? '' : ' h-full'}">
        <div id="dayListWrap" class="${compactList ? '' : 'flex-1 min-h-0 overflow-y-auto '}px-4 py-3 flex flex-col gap-2"></div>
        ${showInlineMeals ? `<div class="shrink-0 border-t border-ink/10 px-4 py-3">
          <h3 class="text-xs uppercase tracking-wide text-ink/40 mb-2">${tk('cal.meals')}</h3>
          <div id="dayMealsWrap" class="flex flex-row gap-2 mb-2"></div>
          <button id="dayAddMealBtn" class="w-full py-2 rounded-lg border border-dashed border-ink/20 text-ink/40 text-xs hover:text-mustard hover:border-mustard transition">${tk('cal.addMeal')}</button>
        </div>` : ''}
      </div>
    `;
    const listWrap = document.getElementById('dayListWrap');
    // dayEventsRaw already contains the all-day appointments - deduplicate via Set, otherwise they show up twice
    const allItems = [...new Set([...allDayEvents, ...dayEventsRaw])].sort(calListCompare);
    if (allItems.length === 0) {
      listWrap.innerHTML = '<p class="text-sm text-ink/30 italic px-1">' + tk('cal.noEvents') + '</p>';
    }
    allItems.forEach(ev => {
      const calColor = colorForCalendarEvent(ev);
      const timeLabel = (ev.fullDayFiller || !ev.time) ? tk('cal.allDay') : `${ev.time}${ev.endTime ? '–' + ev.endTime : ''}`;
      const assignedBar = assignedMembersBarHtml(ev);
      const card = document.createElement('div');
      card.className = 'rounded-xl border overflow-hidden fade-in flex relative' + (isMinorCalEvent(ev) ? ' cal-minor-card' : '') + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
      card.style.backgroundColor = hexToRgba(calColor, 0.16);
      card.style.borderColor = hexToRgba(calColor, 0.55);
      card.innerHTML = `
        ${assignedBar}
        <div class="flex-1 min-w-0 px-3 py-2.5" style="${assignedBar ? 'padding-left:0.75rem' : ''}">
          <div class="text-[11px] text-ink/50 font-medium">${timeLabel}</div>
          <div class="font-serif text-base truncate text-ink">${escapeHtml(ev.title)}</div>
          ${ev.location ? `<div class="text-xs text-ink/60 mt-0.5">📍 ${escapeHtml(ev.location)}</div>` : ''}
        </div>
      `;
      attachLongPress(card, () => ev);
      listWrap.appendChild(card);
    });
  } else {
  body.innerHTML = `
    <div class="flex flex-col h-full w-full">
      <div class="flex px-4 pt-3">
        <div class="w-10 shrink-0 pt-0.5"><div class="cal-allday-label text-ink/40">${tk('cal.allDay')}</div></div>
        <div id="dayAllDayWrap" class="flex-1 min-w-0 flex flex-col gap-1.5"></div>
      </div>
      <div class="flex-1 min-h-0 px-4 py-2 flex">
        <div id="dayHourGutter" class="relative w-10 shrink-0">${buildHourGutterHtml(rangeStart, rangeEnd)}</div>
        <div id="dayTimeline" class="relative flex-1 min-w-0" style="background-image: repeating-linear-gradient(to bottom, rgba(37,35,31,0.08) 0, rgba(37,35,31,0.08) 1px, transparent 1px, transparent ${hourStepPercent}%);"></div>
      </div>
      ${showInlineMeals ? `<div class="shrink-0 border-t border-ink/10 px-4 py-3">
        <h3 class="text-xs uppercase tracking-wide text-ink/40 mb-2">${tk('cal.meals')}</h3>
        <div id="dayMealsWrap" class="flex flex-row gap-2 mb-2"></div>
        <button id="dayAddMealBtn" class="w-full py-2 rounded-lg border border-dashed border-ink/20 text-ink/40 text-xs hover:text-mustard hover:border-mustard transition">${tk('cal.addMeal')}</button>
      </div>` : ''}
    </div>
  `;

  const allDayWrap = document.getElementById('dayAllDayWrap');
  allDayEvents.forEach(ev => {
    const row = document.createElement('div');
    const minor = isMinorCalEvent(ev);
    row.className = 'rounded-lg px-3 py-2 text-sm text-ink fade-in' + (minor ? ' cal-minor-row' : '') + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
    const calColor2 = colorForCalendarEvent(ev);
    row.style.backgroundColor = hexToRgba(calColor2, minor ? 0.16 : 0.26);
    row.style.border = `1px solid ${hexToRgba(calColor2, minor ? 0.4 : 0.55)}`;
    row.textContent = (minor ? '' : '📅 ') + ev.title;
    attachLongPress(row, () => ev);
    allDayWrap.appendChild(row);
  });

  const timeline = document.getElementById('dayTimeline');
  attachDayDropTarget(timeline, dISO);
  if (timedEvents.length === 0 && allDayEvents.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'absolute top-2 left-2 text-sm text-ink/30 italic';
    hint.textContent = tk('cal.noEvents');
    timeline.appendChild(hint);
  }
  timedEvents.forEach(ev => {
    const width = 100 / ev._colCount;
    const left = ev._col * width;
    const top = ev.fullDayFiller ? 0 : Math.min(Math.max((ev.startMin - rangeStart) / rangeSpan * 100, 0), 100);
    const bottom = ev.fullDayFiller ? 100 : Math.min(Math.max((ev.endMin - rangeStart) / rangeSpan * 100, 0), 100);
    const block = document.createElement('div');
    block.className = 'absolute rounded-lg px-2 py-1.5 text-xs text-ink overflow-hidden fade-in' + (matchesActiveMemberFilter(ev) ? '' : ' opacity-30');
    block.style.top = top + '%';
    block.style.height = Math.max(bottom - top, 3) + '%';
    block.style.left = left + '%';
    block.style.width = `calc(${width}% - 4px)`;
    const calColor = colorForCalendarEvent(ev);
    block.style.backgroundColor = hexToRgba(calColor, ev._col % 2 === 1 ? 0.16 : 0.26);
    block.style.border = `1px solid ${hexToRgba(calColor, 0.55)}`;
    const assignedBar = assignedMembersBarHtml(ev);
    if (assignedBar) block.style.paddingLeft = '0.75rem';
    block.innerHTML = assignedBar + `<div class="font-medium truncate">${escapeHtml(ev.title)}</div>`;
    attachLongPress(block, () => ev);
    timeline.appendChild(block);
  });
  }

  if (showInlineMeals) {
    const mealsWrap = document.getElementById('dayMealsWrap');
    attachDayDropTarget(mealsWrap, dISO);
    if (dayMeals.length === 0) mealsWrap.innerHTML = '<p class="text-sm text-ink/30 italic">' + tk('cal.noMealsPlanned') + '</p>';
    dayMeals.forEach(p => {
      const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
      const title = recipe ? recipe.title : (p.title || tk('common.untitled'));
      const row = document.createElement('div');
      row.className = 'group relative rounded-lg px-3 py-2 text-sm text-white flex flex-col items-start gap-0.5 fade-in bg-mustard cursor-grab active:cursor-grabbing flex-1 min-w-0';
      row.title = mealTypeLabel(p.mealType, true);
      row.innerHTML = `<span class="truncate w-full font-medium">${mealTypeIcon(p.mealType)} ${escapeHtml(title)}</span>
        <button class="del-meal absolute top-1 right-1 w-5 h-5 rounded-full bg-white text-ink/70 text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition" data-id="${p.id}">×</button>`;
      attachMealDragSource(row, p.id);
      mealsWrap.appendChild(row);
    });
    document.getElementById('dayAddMealBtn').addEventListener('click', () => openMealModal(dISO, null));
  }
  body.querySelectorAll('.del-meal').forEach(btn => btn.addEventListener('click', () => {
    mealPlan = mealPlan.filter(p => p.id !== btn.dataset.id);
    saveMealPlan();
    renderCalendar();
    if (currentView === 'uebersicht') renderRecipesForCurrentView();
  }));
}

function renderMonthGrid() {
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), monthIndex = base.getMonth();
  document.getElementById('periodLabel').classList.add('truncate');
  document.getElementById('periodLabel').textContent = base.toLocaleDateString(sysLocale(), { month: 'long', year: 'numeric' });

  const todayISO = isoDate(new Date());
  const cells = monthGridDays(year, monthIndex);
  const weekdayLabels = calWeekdayLabels('short');
  const mobileMonth = isMobile();

  const body = document.getElementById('calendarBody');
  body.innerHTML = `
    <div class="grid grid-cols-7 text-center text-[11px] uppercase tracking-wide text-ink/40 px-2 pt-2">
      ${weekdayLabels.map(l => `<div class="py-1">${l}</div>`).join('')}
    </div>
    <div class="grid grid-cols-7 flex-1 gap-px bg-ink/10 px-2 pb-2 mt-1 rounded-lg overflow-hidden">
      ${cells.map(d => {
        const dISO = isoDate(d);
        const inMonth = d.getMonth() === monthIndex;
        const isToday = dISO === todayISO;
        const dayEvents = events.filter(e => e.date === dISO && isEventVisibleAsCalendarEntry(e))
          .sort(calListCompare);
        const shown = dayEvents.slice(0, mobileMonth ? 4 : 2);
        const more = dayEvents.length - shown.length;
        const hasMeals = mealPlan.some(p => p.date === dISO);
        return `<button class="month-cell text-left p-1.5 bg-paper hover:bg-pine/5 transition flex flex-col gap-1 min-h-[76px]${mobileMonth ? ' cal-month-cell-m' : ''} ${inMonth ? '' : 'opacity-35'}" data-day="${dISO}">
          <span class="text-xs flex items-center justify-between">
            <span class="${isToday ? 'inline-flex w-5 h-5 rounded-full bg-pine text-white items-center justify-center' : ''}">${d.getDate()}</span>
            ${hasMeals ? '<span title="' + tk('cal.mealPlanned') + '" class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-mustard-50 shadow-sm shrink-0 leading-none">🍽</span>' : ''}
          </span>
          ${mobileMonth
            ? `<span class="cal-month-dots">${shown.map(ev => `<i${isMinorCalEvent(ev) ? ' class="minor"' : ''} style="background:${colorForCalendarEvent(ev)}${matchesActiveMemberFilter(ev) ? '' : ';opacity:.3'}"></i>`).join('')}${more > 0 ? `<em>+${more}</em>` : ''}</span>`
            : `${shown.map(ev => `<span class="block truncate text-[10px] rounded px-1 py-0.5 text-ink${isMinorCalEvent(ev) ? ' cal-minor' : ''}${matchesActiveMemberFilter(ev) ? '' : ' opacity-30'}" style="background:${hexToRgba(colorForCalendarEvent(ev), isMinorCalEvent(ev) ? 0.16 : 0.26)};border:1px solid ${hexToRgba(colorForCalendarEvent(ev), 0.55)}">${escapeHtml(ev.title)}</span>`).join('')}${more > 0 ? `<span class="text-[10px] text-ink/40">+${more} mehr</span>` : ''}`}
        </button>`;
      }).join('')}
    </div>
  `;
  body.querySelectorAll('.month-cell').forEach(btn => {
    btn.addEventListener('click', () => jumpToDayView(btn.dataset.day));
    attachDayDropTarget(btn, btn.dataset.day);
  });
}

function renderYearGrid() {
  const base = new Date();
  base.setFullYear(base.getFullYear() + yearOffset);
  const year = base.getFullYear();
  document.getElementById('periodLabel').classList.add('truncate');
  document.getElementById('periodLabel').textContent = String(year);
  const todayISO = isoDate(new Date());
  const weekdayLabels = calWeekdayLabels('narrow');

  const body = document.getElementById('calendarBody');
  body.innerHTML = `<div class="${isMobile() ? 'grid grid-cols-2 gap-2 p-2' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4'}">${
    [...Array(12)].map((_, monthIndex) => {
      const cells = monthGridDays(year, monthIndex);
      const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString(sysLocale(), { month: 'long' });
      return `
        <div class="rounded-xl border border-ink/10 bg-white p-3">
          <button class="year-month-label font-serif text-sm mb-2 hover:text-pine transition" data-month="${monthIndex}">${monthLabel}</button>
          <div class="grid grid-cols-7 gap-[2px] text-center text-[9px] text-ink/30 mb-1">
            ${weekdayLabels.map(l => `<div>${l}</div>`).join('')}
          </div>
          <div class="grid grid-cols-7 gap-[2px]">
            ${cells.map(d => {
              const dISO = isoDate(d);
              const inMonth = d.getMonth() === monthIndex;
              const isToday = dISO === todayISO;
              const hasItems = events.some(e => e.date === dISO) || mealPlan.some(p => p.date === dISO);
              return `<button class="year-day text-[10px] w-full aspect-square rounded grid place-items-center relative ${inMonth ? 'text-ink/70 hover:bg-pine/10' : 'text-ink/20'} ${isToday ? 'bg-pine text-white' : ''}" data-day="${dISO}">
                ${d.getDate()}
                ${hasItems && !isToday ? '<span class="absolute bottom-0.5 w-1 h-1 rounded-full bg-mustard"></span>' : ''}
              </button>`;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')
  }</div>`;

  body.querySelectorAll('.year-day').forEach(btn => btn.addEventListener('click', () => {
    const d = new Date(btn.dataset.day);
    dayOffset = Math.round((d - new Date(new Date().toDateString())) / 86400000);
    calendarMode = 'day';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'day'));
    renderCalendar();
  }));
  body.querySelectorAll('.year-month-label').forEach(btn => btn.addEventListener('click', () => {
    const base2 = new Date(year, parseInt(btn.dataset.month, 10), 1);
    monthOffset = (base2.getFullYear() - new Date().getFullYear()) * 12 + (base2.getMonth() - new Date().getMonth());
    calendarMode = 'month';
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'month'));
    renderCalendar();
  }));
}

/* ---------- Calendar mode toggle (week/month) ---------- */
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    calendarMode = btn.dataset.mode;
    weekOffset = 0; monthOffset = 0; dayOffset = 0; yearOffset = 0;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderCalendar();
    if (currentView === 'uebersicht') renderRecipesForCurrentView();
  });
});
document.getElementById('prevPeriod').addEventListener('click', () => {
  if (calendarMode === 'day') dayOffset--;
  else if (currentView === 'termine' && calendarMode === 'month') monthOffset--;
  else if (currentView === 'termine' && calendarMode === 'year') yearOffset--;
  else weekOffset--;
  renderCalendar();
  if (currentView === 'uebersicht') renderRecipesForCurrentView();
});
document.getElementById('nextPeriod').addEventListener('click', () => {
  if (calendarMode === 'day') dayOffset++;
  else if (currentView === 'termine' && calendarMode === 'month') monthOffset++;
  else if (currentView === 'termine' && calendarMode === 'year') yearOffset++;
  else weekOffset++;
  renderCalendar();
  if (currentView === 'uebersicht') renderRecipesForCurrentView();
});
document.getElementById('todayBtn').addEventListener('click', () => {
  weekOffset = 0; monthOffset = 0; dayOffset = 0; yearOffset = 0;
  renderCalendar();
  if (currentView === 'uebersicht') renderRecipesForCurrentView();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kalenderansicht');
