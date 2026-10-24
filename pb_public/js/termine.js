/* pinn. – Create and edit events (js/termine.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the event form (start/end with automatic duration, all-day, repeat, assignees, calendar choice,
   reminder), openAddEventModal / closeAddEventModal, reading a raw ICS event for editing (parseRawEventForEdit,
   openEditEventModal) and saving – the event is queued on the device first and written to iCloud/Google through
   the outbox, also offline.
   openAddEventModal is wrapped by the child lock in index.html (wrapEditorsForChildLock), which only runs
   on DOMContentLoaded, after all files in js/ have loaded – so it is safe that the function lives here. */

/* ==========================================================
   Create a new event (really writes to iCloud)
   ========================================================== */
// Unit after "every [n]" in the repeat options (text keys)
const REPEAT_UNIT_LABELS = {
  get daily() { return tk('repeat.unit.days'); },
  get weekly() { return tk('repeat.unit.weeks'); },
  get monthly() { return tk('repeat.unit.months'); },
  get yearly() { return tk('repeat.unit.years'); },
};

// Remembers the last valid distance between start and end (default: 1 hour) - when
// the start is changed, the end jumps along by the same distance (10-11 -> start
// changed to 12 -> end jumps to 13). Also prevents the end from being before the start.
let lastEventDurationMs = 60 * 60000;

function getEventStartDT() {
  const d = document.getElementById('eventStartDate').value;
  if (!d) return null;
  const allDay = document.getElementById('eventAllDay').checked;
  const t = allDay ? '00:00' : (document.getElementById('eventStartTime').value || '00:00');
  return new Date(d + 'T' + t + ':00');
}
function getEventEndDT() {
  const d = document.getElementById('eventEndDate').value;
  if (!d) return null;
  const allDay = document.getElementById('eventAllDay').checked;
  const t = allDay ? '00:00' : (document.getElementById('eventEndTime').value || '00:00');
  return new Date(d + 'T' + t + ':00');
}
function setEventEndDT(dt) {
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('eventEndDate').value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  document.getElementById('eventEndTime').value = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function handleEventStartChange() {
  const start = getEventStartDT();
  if (!start) return;
  setEventEndDT(new Date(start.getTime() + lastEventDurationMs));
}
function handleEventEndChange() {
  const start = getEventStartDT();
  const end = getEventEndDT();
  if (!start || !end) return;
  if (end <= start) {
    // End before (or equal to) start -> reset to the last valid distance after the start
    setEventEndDT(new Date(start.getTime() + lastEventDurationMs));
  } else {
    lastEventDurationMs = end - start;
  }
}
['eventStartDate', 'eventStartTime'].forEach(id => document.getElementById(id).addEventListener('change', handleEventStartChange));
['eventEndDate', 'eventEndTime'].forEach(id => document.getElementById(id).addEventListener('change', handleEventEndChange));

function updateEventAllDayFields() {
  const allDay = document.getElementById('eventAllDay').checked;
  document.getElementById('eventStartTime').classList.toggle('hidden', allDay);
  document.getElementById('eventStartTimeLabel').classList.toggle('hidden', allDay);
  document.getElementById('eventEndTime').classList.toggle('hidden', allDay);
  document.getElementById('eventEndTimeLabel').classList.toggle('hidden', allDay);
}
document.getElementById('eventAllDay').addEventListener('change', updateEventAllDayFields);

document.getElementById('eventRepeatSelect').addEventListener('change', () => {
  const val = document.getElementById('eventRepeatSelect').value;
  document.getElementById('eventRepeatOptions').classList.toggle('hidden', val === 'none');
  if (val !== 'none') document.getElementById('eventRepeatUnitLabel').textContent = REPEAT_UNIT_LABELS[val];
});

function renderEventAssigneeChips() {
  const wrap = document.getElementById('eventAssigneeChips');
  wrap.innerHTML = '';
  members.forEach(m => {
    const isActive = pendingEventAssignees.includes(m.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs font-medium bg-ink/5 transition' + (isActive ? ' ring-2 ring-offset-1 ring-ink/70' : '');
    chip.innerHTML = `<span class="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span><span>${escapeHtml(memberLabel(m))}</span>`;
    chip.addEventListener('click', () => {
      if (pendingEventAssignees.includes(m.id)) pendingEventAssignees = pendingEventAssignees.filter(id => id !== m.id);
      else pendingEventAssignees.push(m.id);
      renderEventAssigneeChips();
    });
    wrap.appendChild(chip);
  });
}

let editingEventHref = null;
let editingEventUid = null;

// Fills the event form either with empty defaults (new event) or with the
// data passed in for an existing event (editing).
function fillEventForm(data) {
  document.getElementById('eventTitleInput').value = data.title || '';
  document.getElementById('eventLocationInput').value = data.location || '';
  document.getElementById('eventNotesInput').value = data.notes || '';
  document.getElementById('eventUrlInput').value = data.url || '';
  pendingEventAssignees = data.assigneeIds ? [...data.assigneeIds] : [];
  renderEventAssigneeChips();

  document.getElementById('eventAllDay').checked = !!data.allDay;
  document.getElementById('eventStartDate').value = data.startDate || '';
  document.getElementById('eventStartTime').value = data.startTime || '09:00';
  document.getElementById('eventEndDate').value = data.endDate || '';
  document.getElementById('eventEndTime').value = data.endTime || '10:00';
  updateEventAllDayFields();
  const startDT = getEventStartDT(), endDT = getEventEndDT();
  lastEventDurationMs = (startDT && endDT && endDT > startDT) ? (endDT - startDT) : 60 * 60000;

  document.getElementById('eventRepeatSelect').value = data.repeat || 'none';
  document.getElementById('eventRepeatOptions').classList.toggle('hidden', !data.repeat || data.repeat === 'none');
  if (data.repeat && data.repeat !== 'none') document.getElementById('eventRepeatUnitLabel').textContent = REPEAT_UNIT_LABELS[data.repeat];
  document.getElementById('eventRepeatInterval').value = data.repeatInterval || 1;
  document.getElementById('eventRepeatCount').value = data.repeatCount || 10;
  document.getElementById('eventRepeatUntil').value = data.repeatUntil || '';
  document.querySelector(`input[name="repeatEnd"][value="${data.repeatEnd || 'never'}"]`).checked = true;
  document.getElementById('eventAlertSelect').value = data.alert || 'none';

  // Calendar choice: family calendar (iCloud/Google), shared own calendars, private own calendars
  const calSelect = document.getElementById('eventCalendarSelect');
  const famCals = appleCalendar.selectedCalendars;
  const sharedCals = pinnCals.filter(c => c.geteilt && !c.nurLesen); // do not offer read-only ones for creating
  const myCals = pinnCals.filter(c => !c.geteilt);
  const opt = (v, l) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`;
  const groups = [];
  if (famCals.length) groups.push([tk('event.familyCalendar'), famCals.map(n => opt(n, n))]);
  const srcTag = c => c.quelle === 'apple' ? ' · iCloud' : c.quelle === 'google' ? ' · Google' : '';
  if (sharedCals.length) groups.push([tk('event.groupFamily'), sharedCals.map(c => opt(PINN_CAL_PREFIX + c.id, c.name + (c.mein ? srcTag(c) : (!c.quelle && c.von ? ' · ' + c.von : ''))))]);
  const myWritable = myCals.filter(c => !c.nurLesen); // do not offer read-only (linked) calendars for creating
  if (myWritable.length) groups.push([tk('event.groupForMe'), myWritable.map(c => opt(PINN_CAL_PREFIX + c.id, '🔒 ' + c.name + srcTag(c)))]);
  calSelect.innerHTML = groups.length > 1
    ? groups.map(g => `<optgroup label="${escapeHtml(g[0])}">${g[1].join('')}</optgroup>`).join('')
    : (groups[0] ? groups[0][1].join('') : '');
  const calValues = [...famCals, ...pinnCals.filter(c => !c.nurLesen).map(c => PINN_CAL_PREFIX + c.id)];
  // Event from a calendar that is no longer in the list (e.g. after deselecting it): show it anyway
  if (data.calendarName && !calValues.includes(data.calendarName)) {
    calSelect.insertAdjacentHTML('afterbegin', opt(data.calendarName, calendarLabel(data.calendarName)));
    calValues.unshift(data.calendarName);
  }
  const hasCalendars = calValues.length > 0;
  document.getElementById('eventNoCalendarHint').classList.toggle('hidden', hasCalendars);
  calSelect.classList.toggle('hidden', !hasCalendars);
  document.getElementById('saveAddEvent').disabled = !hasCalendars;
  if (data.calendarName && calValues.includes(data.calendarName)) calSelect.value = data.calendarName;

  document.getElementById('addEventStatus').textContent = '';
}

function openAddEventModal() {
  editingEventHref = null;
  editingEventUid = null;
  document.getElementById('addEventModalTitle').textContent = tk('event.new');
  document.getElementById('saveAddEvent').textContent = tk('event.createInCalendar');
  const d = new Date(); d.setDate(d.getDate() + dayOffset);
  fillEventForm({ startDate: isoDate(d), endDate: isoDate(d), startTime: '09:00', endTime: '10:00' });
  document.getElementById('addEventModal').classList.remove('hidden');
  armModalSnapshot('addEventModal');
}
document.getElementById('openAddEventModalBtn').addEventListener('click', () => openAddEventModal());
document.getElementById('dayListToggleBtn').addEventListener('click', () => {
  dayViewDisplayMode = dayViewDisplayMode === 'timeline' ? 'list' : 'timeline';
  document.getElementById('dayListToggleBtn').textContent = dayViewDisplayMode === 'timeline' ? '📋' : '🗓';
  renderCalendar();
});
function closeAddEventModal() { document.getElementById('addEventModal').classList.add('hidden'); }
document.getElementById('cancelAddEvent').addEventListener('click', () => attemptCloseModal('addEventModal', closeAddEventModal));
wireModalOutsideClick('addEventModal', closeAddEventModal);

// Reads an X-PT<n>M/H TRIGGER from a VALARM and converts it to minutes (our dropdown value)
function parseAlarmTriggerToMinutes(triggerLine) {
  const m = triggerLine.match(/-PT(\d+)([MH])/);
  if (m) return String(m[2] === 'H' ? parseInt(m[1], 10) * 60 : parseInt(m[1], 10));
  if (/:PT0S\s*$/.test(triggerLine) || /:P0D\s*$/.test(triggerLine)) return '0';
  return 'none';
}

// Parses the raw ICS text of a single event (loaded from "Edit") into the fields
// of our form - incl. repeat, reminder and the "Assigned: ..." line from the notes.
function parseRawEventForEdit(icsText) {
  const lines = unfoldICS(icsText).split('\n');
  const result = {
    uid: '', title: '', location: '', notes: '', url: '', allDay: false,
    startDate: '', startTime: '09:00', endDate: '', endTime: '10:00',
    repeat: 'none', repeatInterval: 1, repeatEnd: 'never', repeatCount: 10, repeatUntil: '',
    alert: 'none', assigneeIds: [],
  };
  let dtStart = null, dtEnd = null, inAlarm = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    if (inAlarm) {
      if (line.startsWith('TRIGGER')) result.alert = parseAlarmTriggerToMinutes(line);
      continue;
    }
    if (line.startsWith('UID')) result.uid = line.slice(line.indexOf(':') + 1).trim();
    else if (line.startsWith('SUMMARY')) result.title = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('LOCATION')) result.location = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('DESCRIPTION')) result.notes = unescapeICSText(line.slice(line.indexOf(':') + 1));
    else if (line.startsWith('URL')) result.url = line.slice(line.indexOf(':') + 1).trim();
    else if (line.startsWith('RRULE')) {
      const rule = parseRRule(line.slice(line.indexOf(':') + 1));
      const freqMap = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };
      result.repeat = freqMap[rule.FREQ] || 'none';
      result.repeatInterval = rule.INTERVAL ? parseInt(rule.INTERVAL, 10) : 1;
      if (rule.COUNT) { result.repeatEnd = 'count'; result.repeatCount = parseInt(rule.COUNT, 10); }
      else if (rule.UNTIL) { result.repeatEnd = 'until'; result.repeatUntil = rule.UNTIL.slice(0, 4) + '-' + rule.UNTIL.slice(4, 6) + '-' + rule.UNTIL.slice(6, 8); }
    }
    else if (line.startsWith('DTSTART')) dtStart = parseICSDateField(line);
    else if (line.startsWith('DTEND')) dtEnd = parseICSDateField(line);
  }
  if (dtStart) {
    result.allDay = !dtStart.time;
    result.startDate = dtStart.date;
    if (dtStart.time) result.startTime = dtStart.time;
  }
  if (dtEnd) {
    result.endDate = dtEnd.date;
    if (dtEnd.time) result.endTime = dtEnd.time;
    if (result.allDay) {
      // DTEND is exclusive for all-day events - for display in the form, subtract one day
      const dEnd = new Date(result.endDate + 'T00:00:00');
      dEnd.setDate(dEnd.getDate() - 1);
      const pad = n => String(n).padStart(2, '0');
      result.endDate = `${dEnd.getFullYear()}-${pad(dEnd.getMonth() + 1)}-${pad(dEnd.getDate())}`;
    }
  }
  const assignMatch = result.notes.match(/Zugewiesen:\s*(.+)/);
  if (assignMatch) {
    const names = assignMatch[1].split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
    result.assigneeIds = members.filter(m => names.includes(memberLabel(m).toLowerCase()) || names.includes(m.name.toLowerCase())).map(m => m.id);
    result.notes = result.notes.replace(/\n*Zugewiesen:\s*.+/, '').trim();
  }
  return result;
}

async function openEditEventModal(ev) {
  if (ev && ev.pinnHoliday === 'urlaub' && ev.pinnTripList) { setView('einkauf'); lsOpenList(ev.pinnTripList); return; } // trip: tap opens the packing list
  if (ev && ev.pinnHoliday) return; // Holidays/school holidays/waste collection cannot be edited
  if (!ev || !ev.pinnHref) {
    alert(tk('event.notEditable'));
    return;
  }
  closeEventDetail();
  document.getElementById('addEventModalTitle').textContent = tk('event.loading');
  document.getElementById('saveAddEvent').disabled = true;
  document.getElementById('addEventModal').classList.remove('hidden');
  try {
    let ics;
    try {
      ics = await loadEventIcsForEdit(ev.pinnHref); // also works offline or for queued events
    } catch (loadErr) {
      alert(tk('event.loadFailed', { error: loadErr.message }));
      document.getElementById('addEventModal').classList.add('hidden');
      return;
    }
    const parsed = parseRawEventForEdit(ics);
    editingEventHref = ev.pinnHref;
    editingEventUid = parsed.uid;
    parsed.calendarName = ev.pinnCalName || '';
    fillEventForm(parsed);
    document.getElementById('addEventModalTitle').textContent = tk('event.edit');
    document.getElementById('saveAddEvent').textContent = tk('common.saveChanges');
    armModalSnapshot('addEventModal');
  } catch (err) {
    alert(tk('common.connectionFailed'));
    document.getElementById('addEventModal').classList.add('hidden');
  } finally {
    document.getElementById('saveAddEvent').disabled = false;
  }
}
document.getElementById('eventDetailEditBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  if (currentDetailEvent) openEditEventModal(currentDetailEvent);
});

document.getElementById('saveAddEvent').addEventListener('click', async () => {
  const title = document.getElementById('eventTitleInput').value.trim();
  if (!title) return;
  const statusEl = document.getElementById('addEventStatus');
  const allDay = document.getElementById('eventAllDay').checked;

  let notes = document.getElementById('eventNotesInput').value.trim();
  if (pendingEventAssignees.length) {
    const names = pendingEventAssignees.map(id => memberLabel(memberById(id))).filter(Boolean);
    if (names.length) notes = (notes ? notes + '\n\n' : '') + 'Zugewiesen: ' + names.join(', ');
  }

  const payload = {
    title,
    calendarName: document.getElementById('eventCalendarSelect').value,
    allDay,
    startDate: document.getElementById('eventStartDate').value,
    startTime: document.getElementById('eventStartTime').value,
    endDate: document.getElementById('eventEndDate').value,
    endTime: document.getElementById('eventEndTime').value,
    location: document.getElementById('eventLocationInput').value.trim(),
    notes,
    url: document.getElementById('eventUrlInput').value.trim(),
    repeat: document.getElementById('eventRepeatSelect').value,
    repeatInterval: parseInt(document.getElementById('eventRepeatInterval').value, 10) || 1,
    repeatEnd: document.querySelector('input[name="repeatEnd"]:checked').value,
    repeatCount: parseInt(document.getElementById('eventRepeatCount').value, 10) || 1,
    repeatUntil: document.getElementById('eventRepeatUntil').value,
    alert: document.getElementById('eventAlertSelect').value,
  };

  if (!payload.calendarName) {
    statusEl.textContent = tk('event.setupCalendarFirst');
    return;
  }
  if (!payload.startDate || !payload.endDate) {
    statusEl.textContent = tk('event.needDates');
    return;
  }

  // First queue the event on the device and show it right away; creating/changing it in iCloud runs
  // through the queue and is submitted automatically when there is no connection.
  const isEditing = !!editingEventHref;
  if (isEditing) queueEventUpdate(editingEventHref, editingEventUid, payload);
  else queueEventCreate(payload);
  statusEl.textContent = '';
  document.getElementById('addEventModal').classList.add('hidden');
  rebuildEvents();
  renderCalendar();
  renderTasks();
  await flushOutbox();
  notifyIfQueuedOffline();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('termine');
