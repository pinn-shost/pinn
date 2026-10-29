/* pinn. – Appointment details (js/termindetails.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the popover that opens on a long press on an appointment (attachLongPress, showEventDetail, closeEventDetail),
   the links in it (calendar app, trip → packing list, holiday weather) and the delete button (series warning, queued delete).
   Loading the calendar file is in js/kalenderdatei.js. */

/* ==========================================================
   Appointment details on long press ("appointment opens up")
   ========================================================== */
let expandedEventEl = null;

function attachLongPress(el, getEvent) {
  let timer = null;
  let startX = 0, startY = 0, moved = false;
  let fired = false;
  const HOLD_MS = 480;
  const TOLERANCE = 12;

  el.addEventListener('pointerdown', (e) => {
    moved = false;
    fired = false;
    startX = e.clientX; startY = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!moved) {
        fired = true;
        showEventDetail(getEvent(), el);
      }
    }, HOLD_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - startX) > TOLERANCE || Math.abs(e.clientY - startY) > TOLERANCE) {
      moved = true;
      clearTimeout(timer);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
    el.addEventListener(type, () => {
      clearTimeout(timer);
      // Only arm "the next click closes" AFTER the triggering gesture has ended (finger/mouse released) -
      // otherwise the popover closes itself again right away because of leftovers of the same
      // gesture.
      if (fired) { armCloseOnNextInteraction(); fired = false; }
    });
  });
  // Prevents iOS from opening a context menu/text selection on a long press
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function outsidePopoverPointerDown(e) {
  // The calendar link and the delete button should be allowed to trigger the tap, instead of the
  // popover closing first and "swallowing" the click.
  if (e.target.closest('#eventDetailCalendarLink') || e.target.closest('#eventDetailDeleteBtn') || e.target.closest('#eventDetailEditBtn') || e.target.closest('#eventDetailLinks')) return;
  document.removeEventListener('pointerdown', outsidePopoverPointerDown, true);
  closeEventDetail();
}
function armCloseOnNextInteraction() {
  document.removeEventListener('pointerdown', outsidePopoverPointerDown, true);
  setTimeout(() => {
    document.addEventListener('pointerdown', outsidePopoverPointerDown, { capture: true });
  }, 80);
}

let eventDetailHideTimer = null;

let currentDetailEvent = null;
function showEventDetail(ev, anchorEl) {
  currentDetailEvent = ev;
  // Cancel a hide timer of a previous close that may still be running, otherwise it would
  // hide the freshly opened box again right away (that was the bug).
  clearTimeout(eventDetailHideTimer);
  if (expandedEventEl && expandedEventEl !== anchorEl) expandedEventEl.classList.remove('event-expanded');

  expandedEventEl = anchorEl;
  anchorEl.classList.add('event-expanded');

  document.getElementById('eventDetailTitle').textContent = ev.title;
  const dateObj = new Date(ev.date + 'T00:00:00');
  const dateStr = dateObj.toLocaleDateString(sysLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = ev.fullDayFiller || !ev.time ? tk('cal.allDay')
    : (ev.endTime ? tk('cal.timeRange', { from: ev.time, to: ev.endTime }) : tk('cal.timeAt', { time: ev.time }));
  document.getElementById('eventDetailWhen').textContent = `${dateStr} · ${timeStr}`;

  const locEl = document.getElementById('eventDetailLocation');
  if (ev.location) { locEl.textContent = '📍 ' + ev.location; locEl.classList.remove('hidden'); }
  else locEl.classList.add('hidden');

  const calNameEl = document.getElementById('eventDetailCalName');
  if (ev.pinnCalName && calendarCount() > 1) {
    calNameEl.textContent = '🗓 ' + calendarLabel(ev.pinnCalName);
    calNameEl.classList.remove('hidden');
  } else {
    calNameEl.classList.add('hidden');
  }

  const descEl = document.getElementById('eventDetailDescription');
  if (ev.description) { descEl.textContent = localizeNotes(ev.description); descEl.classList.remove('hidden'); }
  else descEl.classList.add('hidden');

  // The "calshow:" link opens Apple's Calendar app directly on this day. Apple unfortunately offers no public
  // way to open exactly THIS one appointment (instead of only the day).
  const calDate = new Date(ev.date + 'T' + (ev.time || '00:00') + ':00');
  const coreDataSeconds = Math.floor(calDate.getTime() / 1000) - 978307200;
  document.getElementById('eventDetailCalendarLink').href = 'calshow:' + coreDataSeconds;

  const deleteBtn = document.getElementById('eventDetailDeleteBtn');
  const deleteStatus = document.getElementById('eventDetailDeleteStatus');
  deleteStatus.textContent = '';
  deleteBtn.disabled = false;
  deleteBtn.textContent = tk('event.delete');
  deleteBtn.classList.toggle('hidden', !ev.pinnHref);
  // Public holidays and school holidays (from the federal state under Settings → Home) are read only
  const isHoliday = !!ev.pinnHoliday;
  if (isHoliday) {
    calNameEl.textContent = ev.pinnHoliday === 'muell' ? tk('event.badge.waste') : ev.pinnHoliday === 'ferien' ? tk('event.badge.schoolHolidays') : ev.pinnHoliday === 'schule' ? tk('event.badge.school') : ev.pinnHoliday === 'urlaub' ? tk('event.badge.trip') : tk('event.badge.holiday');
    calNameEl.classList.remove('hidden');
  }
  renderEventDetailLinks(ev);
  const linkedApple = !!(pinnCalByName(ev.pinnCalName) && pinnCalByName(ev.pinnCalName).quelle === 'apple');
  document.getElementById('eventDetailCalendarLink').classList.toggle('hidden', isHoliday || (isPinnCalName(ev.pinnCalName) && !linkedApple)); // own calendars only exist in Apple's Calendar app if they are linked with iCloud
  const editBtn = document.getElementById('eventDetailEditBtn');
  editBtn.classList.toggle('hidden', isHoliday);
  if (editBtn.parentElement) editBtn.parentElement.classList.toggle('hidden', isHoliday);

  const popover = document.getElementById('eventDetailPopover');
  popover.classList.remove('hidden');
  const rect = anchorEl.getBoundingClientRect();
  const popW = 288;
  let left = rect.left + rect.width / 2 - popW / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popW - 8));
  let top = rect.bottom + 10;
  const estHeight = 140;
  if (top + estHeight > window.innerHeight - 8) top = rect.top - 10 - estHeight;
  top = Math.max(8, top);
  popover.style.left = left + 'px';
  popover.style.top = top + 'px';

  requestAnimationFrame(() => popover.classList.add('open'));
}

// Links in the event popup (1.62): trip → packing list and holiday weather; appointments that sound
// like a trip → open the packing list or create one with name and period already filled in
function renderEventDetailLinks(ev) {
  const box = document.getElementById('eventDetailLinks');
  if (!box) return;
  const links = [];
  const canLists = isViewAllowed('einkauf') && !isCurrentUserGuest();
  if (ev.pinnHoliday === 'urlaub' && ev.pinnTripList) {
    if (canLists) links.push(['list', tk('event.link.packList'), ev.pinnTripList]);
    links.push(['wx', tk('event.link.tripWeather'), ev.pinnTripList]);
  } else if (!ev.pinnHoliday && canLists && calTravelKind(ev.title)) {
    const r = calEventRange(ev);
    const have = calPackListForRange(r.from, r.to);
    if (have) links.push(['list', tk('event.link.packList'), have.id]);
    else links.push(['new', tk('event.link.newPackList'), '']);
  }
  box.innerHTML = links.map(([k, label, id]) => `<button type="button" class="ev-link-btn" data-evlink="${k}" data-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`).join('');
  box.classList.toggle('hidden', !links.length);
  box.querySelectorAll('[data-evlink]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.evlink, id = b.dataset.id;
    closeEventDetail();
    if (k === 'list') { setView('einkauf'); lsOpenList(id); }
    else if (k === 'wx') wxOpen(id);
    else if (k === 'new') {
      const r = calEventRange(ev);
      lsStartPackFromEvent({ titel: ev.title, von: r.from, bis: r.to, ort: ev.location || '', art: calTravelKind(ev.title) });
    }
  }));
}
function closeEventDetail() {
  const popover = document.getElementById('eventDetailPopover');
  popover.classList.remove('open');
  clearTimeout(eventDetailHideTimer);
  eventDetailHideTimer = setTimeout(() => popover.classList.add('hidden'), 160);
  if (expandedEventEl) { expandedEventEl.classList.remove('event-expanded'); expandedEventEl = null; }
}
document.getElementById('closeEventDetailBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  closeEventDetail();
});

document.getElementById('eventDetailDeleteBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  const ev = currentDetailEvent;
  if (!ev || !ev.pinnHref) return;

  const warning = ev.isRecurring
    ? tk('event.confirmDeleteSeries', { title: ev.title })
    : tk('event.confirmDelete', { title: ev.title });
  if (!confirm(warning)) return;

  // Remove immediately (all occurrences with the same iCloud resource, so for series the
  // whole series at once). Deleting in iCloud runs through the queue - without a connection it is
  // sent later automatically.
  queueEventDelete(ev.pinnHref);
  closeEventDetail();
  rebuildEvents();
  renderCalendar();
  renderTasks();
  await flushOutbox();
  notifyIfQueuedOffline();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('termindetails');
