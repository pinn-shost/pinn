/* pinn. – Household: rooms, cleaning tasks & bins (js/haushalt.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the household page (renderHousehold, filters, room cards), the room, bin and cleaning-task popups
   (icon/colour, waste type, weekdays/interval, category, shared person picker with pendingHouseholdAssignedIds),
   the household-task maintenance (immediate resync after changes, progress polling, cleaning up completed tasks,
   regenerate/delete household tasks, the task animation setting) and – historically here – the info popup that
   opens when an "i" icon next to a setting is tapped. The server creates the tasks (pb_hooks/pinn-aufgaben.js). */

/* ==========================================================
   Household: rooms (with icon/colour), indented below them cleaning tasks (weekdays/interval,
   with a selectable category) and bins - all in a card matching the room colour.
   ========================================================== */
function renderHousehold() {
  renderRoomList();
  renderHouseholdFairness();
  renderHouseholdMaintenance();
  // One-time clean-up: if rooms with an old, endlessly repeating
  // cleaning series still exist (from an earlier version), remove them automatically now.
  rooms.filter(r => r.cleaningTaskHref).forEach(r => cleanupLegacyCleaningSeries(r).then(() => persistState()));
}

function scheduleSummary(s) {
  if (s.scheduleType === 'weekdays') {
    return (s.weekdays || []).map(wd => (WEEKDAYS.find(w => w.id === wd) || {}).label || wd).join(', ') || 'Keine Tage gewählt';
  }
  if (s.intervalDays === 1) return 'Täglich';
  if (s.intervalDays === 7) return 'Wöchentlich';
  if (s.intervalDays === 14) return 'Alle 2 Wochen';
  return 'Alle ' + s.intervalDays + ' Tage';
}

// Filters of the household page (dropdowns in the style of the pantry page)
const HOUSEHOLD_FILTER_BINS = '__bins';
let householdFilterRoom = '';
let householdFilterCategory = '';
function renderHouseholdFilters() {
  const bar = document.getElementById('householdFilterBar');
  const roomSel = document.getElementById('householdRoomFilter');
  const catSel = document.getElementById('householdCategoryFilter');
  if (householdFilterRoom && !rooms.some(r => r.id === householdFilterRoom)) householdFilterRoom = '';
  const usedCats = new Set(roomSchedules.map(s => s.category));
  const cats = cleaningCategories.filter(c => c.active !== false || usedCats.has(c.id));
  if (householdFilterCategory && householdFilterCategory !== HOUSEHOLD_FILTER_BINS && !cats.some(c => c.id === householdFilterCategory)) householdFilterCategory = '';
  roomSel.innerHTML = '<option value="">Alle Räume</option>' + rooms.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml((r.icon ? r.icon + ' ' : '') + r.name)}</option>`).join('');
  catSel.innerHTML = '<option value="">Alle Kategorien</option>'
    + cats.map(c => `<option value="${escapeHtml(c.id)}">🧹 ${escapeHtml(c.label)}</option>`).join('')
    + `<option value="${HOUSEHOLD_FILTER_BINS}">🗑️ Mülleimer</option>`;
  roomSel.value = householdFilterRoom;
  catSel.value = householdFilterCategory;
  bar.classList.toggle('hidden', !rooms.length);
}

function renderRoomList() {
  const list = document.getElementById('roomList');
  const empty = document.getElementById('emptyRooms');
  list.innerHTML = '';
  renderHouseholdFilters();
  const catFilter = householdFilterCategory;
  const filtered = !!(householdFilterRoom || catFilter);
  const shownRooms = rooms.filter(room => {
    if (householdFilterRoom && room.id !== householdFilterRoom) return false;
    if (!catFilter) return true;
    if (catFilter === HOUSEHOLD_FILTER_BINS) return trashBins.some(b => b.roomId === room.id);
    return roomSchedules.some(s => s.roomId === room.id && s.category === catFilter);
  });
  empty.textContent = rooms.length ? 'Keine Einträge für diese Auswahl.' : 'Noch keine Räume – füge einen hinzu.';
  empty.classList.toggle('hidden', shownRooms.length > 0);

  shownRooms.forEach(room => {
    const schedules = roomSchedules.filter(s => s.roomId === room.id && (!catFilter || s.category === catFilter));
    const bins = trashBins.filter(b => b.roomId === room.id && (!catFilter || catFilter === HOUSEHOLD_FILTER_BINS));

    const card = document.createElement('div');
    card.className = 'rounded-xl border overflow-hidden flex';
    card.style.borderColor = hexToRgba(room.color, 0.4);
    card.innerHTML = `
      <div class="w-1.5 shrink-0" style="background:${room.color}"></div>
      <div class="flex-1 min-w-0 p-3" style="background:${hexToRgba(room.color, 0.07)}">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0">${room.icon}</span>
            <span class="font-serif text-base truncate">${escapeHtml(room.name)}</span>
          </div>
          <button class="edit-room-btn text-xs text-ink/40 hover:text-pine shrink-0">Bearbeiten</button>
        </div>
        <div class="pl-4 flex flex-col gap-1.5">
          ${schedules.map(s => `
            <button class="edit-schedule-btn flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/70 hover:bg-white transition text-left w-full" data-id="${s.id}">
              <span>🧹 ${escapeHtml((cleaningCategoryById(s.category) || {}).label || s.category)} · ${escapeHtml(scheduleSummary(s))}${s.rotate ? ' · 🔄' : ''}</span>
              <span class="text-ink/30">›</span>
            </button>`).join('')}
          ${bins.map(b => {
            const waste = wasteTypeById(b.wasteType);
            const scheduleLabel = b.schedule ? ' · ' + scheduleSummary(b.schedule) : '';
            return `<button class="edit-bin-btn flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/70 hover:bg-white transition text-left w-full" data-id="${b.id}">
              <span>${waste ? waste.icon : '🗑️'} ${waste ? escapeHtml(waste.label) : 'Unbekannt'}${escapeHtml(scheduleLabel)}${b.rotate ? ' · 🔄' : ''}</span>
              <span class="text-ink/30">›</span>
            </button>`;
          }).join('')}
          ${(!schedules.length && !bins.length && !filtered) ? '<p class="text-xs text-ink/30 italic">Noch nichts hinzugefügt.</p>' : ''}
          <div class="flex gap-2 mt-1">
            <button class="add-bin-btn px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-pine hover:border-pine transition">+ Mülleimer</button>
            <button class="add-schedule-btn px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-pine hover:border-pine transition">+ Reinigung hinzufügen</button>
          </div>
        </div>
      </div>
    `;
    card.querySelector('.edit-room-btn').addEventListener('click', () => openRoomModal(room.id));
    card.querySelector('.add-bin-btn').addEventListener('click', () => openTrashBinModal(null, room.id));
    card.querySelector('.add-schedule-btn').addEventListener('click', () => openRoomScheduleModal(null, room.id));
    card.querySelectorAll('.edit-schedule-btn').forEach(btn => btn.addEventListener('click', () => openRoomScheduleModal(btn.dataset.id, room.id)));
    card.querySelectorAll('.edit-bin-btn').forEach(btn => btn.addEventListener('click', () => openTrashBinModal(btn.dataset.id, room.id)));
    list.appendChild(card);
  });
}

function renderRoomIconPicker(selected) {
  const wrap = document.getElementById('roomIconPicker');
  wrap.innerHTML = '';
  ROOM_ICONS.forEach(icon => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-10 h-10 rounded-lg border text-lg grid place-items-center transition ' + (icon === selected ? 'border-pine bg-pine/10' : 'border-ink/15 hover:border-pine/50');
    btn.textContent = icon;
    btn.addEventListener('click', () => {
      pendingRoomIcon = icon;
      renderRoomIconPicker(icon);
    });
    wrap.appendChild(btn);
  });
}

function renderRoomColorPicker(selected) {
  const wrap = document.getElementById('roomColorPicker');
  wrap.innerHTML = '';
  PALETTE.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-8 h-8 rounded-full transition' + (color === selected ? ' ring-2 ring-offset-2 ring-ink/70' : '');
    btn.style.background = color;
    btn.addEventListener('click', () => {
      pendingRoomColor = color;
      renderRoomColorPicker(color);
    });
    wrap.appendChild(btn);
  });
}

let editingRoomId = null;
let pendingRoomIcon = ROOM_ICONS[0];
let pendingRoomColor = PALETTE[0];

function openRoomModal(existingId = null) {
  editingRoomId = existingId;
  const room = existingId ? rooms.find(r => r.id === existingId) : null;
  document.getElementById('roomModalTitle').textContent = room ? 'Raum bearbeiten' : 'Neuer Raum';
  document.getElementById('roomNameInput').value = room ? room.name : '';
  document.getElementById('roomFormStatus').textContent = '';
  document.getElementById('deleteRoomBtn').classList.toggle('hidden', !room);
  pendingRoomIcon = room ? room.icon : ROOM_ICONS[0];
  pendingRoomColor = room ? room.color : PALETTE[0];
  renderRoomIconPicker(pendingRoomIcon);
  renderRoomColorPicker(pendingRoomColor);
  document.getElementById('roomModal').classList.remove('hidden');
  armModalSnapshot('roomModal');
}
document.getElementById('openRoomModalBtn').addEventListener('click', () => openRoomModal(null));
function closeRoomModal() { document.getElementById('roomModal').classList.add('hidden'); }
document.getElementById('cancelRoom').addEventListener('click', () => attemptCloseModal('roomModal', closeRoomModal));
wireModalOutsideClick('roomModal', closeRoomModal);

document.getElementById('saveRoom').addEventListener('click', async () => {
  const name = document.getElementById('roomNameInput').value.trim();
  const statusEl = document.getElementById('roomFormStatus');
  if (!name) { statusEl.textContent = 'Bitte einen Namen eingeben.'; return; }

  if (editingRoomId) {
    const room = rooms.find(r => r.id === editingRoomId);
    Object.assign(room, { name, icon: pendingRoomIcon, color: pendingRoomColor });
  } else {
    rooms.push({ id: 'room' + Date.now(), name, icon: pendingRoomIcon, color: pendingRoomColor, createdDate: isoDate(new Date()) });
  }
  await persistState();
  document.getElementById('roomModal').classList.add('hidden');
  renderRoomList();
});

document.getElementById('deleteRoomBtn').addEventListener('click', async () => {
  if (!editingRoomId) return;
  const room = rooms.find(r => r.id === editingRoomId);
  if (!confirm(`"${room.name}" wirklich löschen? Zugeordnete Reinigungen und Mülleimer werden mit gelöscht.`)) return;
  await cleanupLegacyCleaningSeries(room);
  rooms = rooms.filter(r => r.id !== editingRoomId);
  roomSchedules = roomSchedules.filter(s => s.roomId !== editingRoomId);
  trashBins = trashBins.filter(b => b.roomId !== editingRoomId);
  await persistState();
  document.getElementById('roomModal').classList.add('hidden');
  renderHousehold();
  syncAppleCalendarFile(false);
});

// Cleans up a possibly still existing, endlessly repeating cleaning series from an earlier
// app version. Cleaning tasks are now created day by day by the server.
async function cleanupLegacyCleaningSeries(room) {
  if (!room.cleaningTaskHref) return;
  try {
    await apiFetch('/api/delete-calendar-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ href: room.cleaningTaskHref }) });
  } catch (err) { /* best-effort */ }
  room.cleaningTaskHref = '';
  room.cleaningTaskUid = '';
  await syncAppleCalendarFile(false);
}

/* ---------- Bins (now opened per room) ---------- */
function renderTrashBinWasteTypePicker(selected) {
  const wrap = document.getElementById('trashBinWasteTypePicker');
  wrap.innerHTML = '';
  WASTE_TYPES.forEach(w => {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/5 cursor-pointer';
    row.innerHTML = `<input type="radio" name="trashBinWasteType" value="${w.id}" ${w.id === selected ? 'checked' : ''} /><span>${w.icon} ${escapeHtml(w.label)}</span>`;
    wrap.appendChild(row);
  });
}

let editingTrashBinId = null;
let pendingTrashBinRoomId = null;

let pendingBinScheduleType = 'weekdays';
let pendingBinScheduleWeekdays = [];

function setBinScheduleTypeChoice(type) {
  pendingBinScheduleType = type;
  document.querySelectorAll('.bin-schedule-type-btn').forEach(b => b.classList.toggle('active', b.dataset.scheduletype === type));
  document.getElementById('trashBinWeekdaysWrap').classList.toggle('hidden', type !== 'weekdays');
  document.getElementById('trashBinIntervalWrap').classList.toggle('hidden', type !== 'interval');
}
document.querySelectorAll('.bin-schedule-type-btn').forEach(btn => btn.addEventListener('click', () => setBinScheduleTypeChoice(btn.dataset.scheduletype)));

function renderBinWeekdayPicker() {
  const wrap = document.getElementById('trashBinWeekdayPicker');
  wrap.innerHTML = '';
  WEEKDAYS.forEach(wd => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-9 h-9 rounded-full text-xs font-medium border transition ' + (pendingBinScheduleWeekdays.includes(wd.id) ? 'bg-pine text-white border-pine' : 'border-ink/15 text-ink/60 hover:border-pine/50');
    btn.textContent = wd.label;
    btn.addEventListener('click', () => {
      if (pendingBinScheduleWeekdays.includes(wd.id)) pendingBinScheduleWeekdays = pendingBinScheduleWeekdays.filter(d => d !== wd.id);
      else pendingBinScheduleWeekdays.push(wd.id);
      renderBinWeekdayPicker();
    });
    wrap.appendChild(btn);
  });
}
document.getElementById('trashBinManualScheduleCheckbox').addEventListener('change', (e) => {
  document.getElementById('trashBinScheduleFields').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('trashBinIntervalSelect').addEventListener('change', (e) => {
  document.getElementById('trashBinCustomIntervalWrap').classList.toggle('hidden', e.target.value !== 'custom');
  document.getElementById('trashBinFirstDateWrap').classList.toggle('hidden', e.target.value === '1');
});

// Shared person picker for the cleaning/bin popups: multiple choice by clicking
// avatar chips, the state lives in pendingHouseholdAssignedIds until saving.
let pendingHouseholdAssignedIds = [];
function renderHouseholdMemberPicker(containerId) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  members.forEach(m => {
    const isSelected = pendingHouseholdAssignedIds.includes(m.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs font-medium bg-ink/5 transition ' + (isSelected ? 'ring-2 ring-offset-1 ring-pine' : 'opacity-50 hover:opacity-100');
    chip.innerHTML = `<span class="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span><span>${escapeHtml(memberLabel(m))}</span>`;
    chip.addEventListener('click', () => {
      if (pendingHouseholdAssignedIds.includes(m.id)) pendingHouseholdAssignedIds = pendingHouseholdAssignedIds.filter(id => id !== m.id);
      else pendingHouseholdAssignedIds.push(m.id);
      renderHouseholdMemberPicker(containerId);
    });
    wrap.appendChild(chip);
  });
  if (!members.length) wrap.innerHTML = '<p class="text-xs text-ink/30 italic">Keine Familienmitglieder angelegt.</p>';
  if (typeof hhRotateUi === 'function') hhRotateUi(containerId);
}

function openTrashBinModal(existingId, roomId) {
  editingTrashBinId = existingId || null;
  const bin = existingId ? trashBins.find(b => b.id === existingId) : null;
  pendingTrashBinRoomId = bin ? bin.roomId : roomId;
  const room = rooms.find(r => r.id === pendingTrashBinRoomId);
  document.getElementById('trashBinModalTitle').textContent = bin ? 'Mülleimer bearbeiten' : 'Neuer Mülleimer';
  document.getElementById('trashBinRoomLabel').textContent = room ? (room.icon + ' ' + room.name) : '';
  renderTrashBinWasteTypePicker(bin ? bin.wasteType : WASTE_TYPES[0].id);
  document.getElementById('deleteTrashBinBtn').classList.toggle('hidden', !bin);
  pendingHouseholdAssignedIds = bin ? [...(bin.assignedMemberIds || [])] : [];
  renderHouseholdMemberPicker('trashBinMemberPicker');
  hhRotateLoad('trashBinMemberPicker', bin ? bin.rotate : '');
  smartPickerLoad(bin ? bin.smart : null, 'trashBinSmartPicker');
  taskRemindLoad('trashBinRemindPicker', 'trashBin', bin ? bin.remindAt : '', { label: '🔔 Extra-Erinnerung per Push', def: '18:00', hint: 'Gilt für jede Aufgabe dieses Mülleimers – zusätzlich zur Müll-Erinnerung am Vortag.' });

  const schedule = bin ? bin.schedule : null;
  document.getElementById('trashBinManualScheduleCheckbox').checked = !!schedule;
  document.getElementById('trashBinScheduleFields').classList.toggle('hidden', !schedule);
  setBinScheduleTypeChoice(schedule ? schedule.scheduleType : 'weekdays');
  pendingBinScheduleWeekdays = (schedule && schedule.scheduleType === 'weekdays') ? [...schedule.weekdays] : [];
  renderBinWeekdayPicker();

  const intervalSel = document.getElementById('trashBinIntervalSelect');
  const presetIntervals = ['1', '2', '3', '4', '5', '6', '7', '14'];
  if (schedule && schedule.scheduleType === 'interval' && presetIntervals.includes(String(schedule.intervalDays))) {
    intervalSel.value = String(schedule.intervalDays);
    document.getElementById('trashBinCustomIntervalWrap').classList.add('hidden');
    document.getElementById('trashBinCustomIntervalInput').value = '';
  } else if (schedule && schedule.scheduleType === 'interval') {
    intervalSel.value = 'custom';
    document.getElementById('trashBinCustomIntervalWrap').classList.remove('hidden');
    document.getElementById('trashBinCustomIntervalInput').value = schedule.intervalDays;
  } else {
    intervalSel.value = '7';
    document.getElementById('trashBinCustomIntervalWrap').classList.add('hidden');
    document.getElementById('trashBinCustomIntervalInput').value = '';
  }
  document.getElementById('trashBinFirstDateWrap').classList.toggle('hidden', intervalSel.value === '1');
  document.getElementById('trashBinFirstDateInput').value = (schedule && schedule.scheduleType === 'interval' && schedule.createdDate) ? schedule.createdDate : isoDate(new Date());

  document.getElementById('trashBinModal').classList.remove('hidden');
  armModalSnapshot('trashBinModal');
}
function closeTrashBinModal() { document.getElementById('trashBinModal').classList.add('hidden'); }
document.getElementById('cancelTrashBin').addEventListener('click', () => attemptCloseModal('trashBinModal', closeTrashBinModal));
wireModalOutsideClick('trashBinModal', closeTrashBinModal);

document.getElementById('saveTrashBin').addEventListener('click', async () => {
  const wasteType = (document.querySelector('input[name="trashBinWasteType"]:checked') || {}).value;
  if (!wasteType || !pendingTrashBinRoomId) return;

  let schedule = null;
  if (document.getElementById('trashBinManualScheduleCheckbox').checked) {
    if (pendingBinScheduleType === 'weekdays') {
      if (!pendingBinScheduleWeekdays.length) { alert('Bitte mindestens einen Wochentag wählen.'); return; }
      schedule = { scheduleType: 'weekdays', weekdays: [...pendingBinScheduleWeekdays], intervalDays: null, createdDate: isoDate(new Date()) };
    } else {
      const intervalSelVal = document.getElementById('trashBinIntervalSelect').value;
      let intervalDays;
      if (intervalSelVal === 'custom') {
        intervalDays = parseInt(document.getElementById('trashBinCustomIntervalInput').value, 10);
        if (!intervalDays || intervalDays < 1) { alert('Bitte eine gültige Anzahl Tage angeben.'); return; }
      } else {
        intervalDays = parseInt(intervalSelVal, 10);
      }
      let createdDate = isoDate(new Date());
      if (intervalDays !== 1) {
        const firstDate = document.getElementById('trashBinFirstDateInput').value;
        if (!firstDate) { alert('Bitte den Tag des ersten Rausbringens angeben.'); return; }
        createdDate = firstDate;
      }
      schedule = { scheduleType: 'interval', weekdays: [], intervalDays, createdDate };
    }
  }

  // Clean up today's orphaned task if either the title (waste type) OR only the
  // responsibility changes - both make the task already generated for today outdated.
  let oldBaseTitleToClean = null;
  if (editingTrashBinId) {
    const existing = trashBins.find(b => b.id === editingTrashBinId);
    const assignedChanged = JSON.stringify([...(existing.assignedMemberIds || [])].sort()) !== JSON.stringify([...pendingHouseholdAssignedIds].sort())
      || (existing.rotate || '') !== hhRotateValue('trashBinMemberPicker');
    if (existing && existing.wasteType !== wasteType) {
      const room = rooms.find(r => r.id === existing.roomId);
      const oldWt = WASTE_TYPES.find(w => w.id === existing.wasteType);
      oldBaseTitleToClean = (oldWt ? oldWt.icon : '🗑️') + ' ' + (oldWt ? oldWt.taskLabel : 'Müll') + ' rausbringen: ' + (room ? room.name : 'Unbekannt');
    } else if (existing && assignedChanged) {
      const room = rooms.find(r => r.id === existing.roomId);
      const wt = WASTE_TYPES.find(w => w.id === wasteType);
      oldBaseTitleToClean = (wt ? wt.icon : '🗑️') + ' ' + (wt ? wt.taskLabel : 'Müll') + ' rausbringen: ' + (room ? room.name : 'Unbekannt');
    }
  }

  if (editingTrashBinId) {
    const bin = trashBins.find(b => b.id === editingTrashBinId);
    Object.assign(bin, { wasteType, schedule, assignedMemberIds: [...pendingHouseholdAssignedIds], smart: smartPickerValue(), rotate: hhRotateValue('trashBinMemberPicker'), remindAt: taskRemindValue('trashBin') });
  } else {
    trashBins.push({ id: 'bin' + Date.now(), roomId: pendingTrashBinRoomId, wasteType, schedule, assignedMemberIds: [...pendingHouseholdAssignedIds], smart: smartPickerValue(), rotate: hhRotateValue('trashBinMemberPicker'), remindAt: taskRemindValue('trashBin') });
  }
  if (!oldBaseTitleToClean) {
    const savedBin = editingTrashBinId ? trashBins.find(b => b.id === editingTrashBinId) : trashBins[trashBins.length - 1];
    taskRemindApplyOpen(t => { const hit = householdRuleForTask(t); return !!(hit && hit.rule === savedBin); }, savedBin.remindAt);
  }
  await persistState();
  document.getElementById('trashBinModal').classList.add('hidden');
  renderRoomList();
  triggerHouseholdResync(oldBaseTitleToClean);
});

document.getElementById('deleteTrashBinBtn').addEventListener('click', async () => {
  if (!editingTrashBinId) return;
  const existing = trashBins.find(b => b.id === editingTrashBinId);
  let baseTitleToClean = null;
  if (existing) {
    const room = rooms.find(r => r.id === existing.roomId);
    const wt = WASTE_TYPES.find(w => w.id === existing.wasteType);
    baseTitleToClean = (wt ? wt.icon : '🗑️') + ' ' + (wt ? wt.taskLabel : 'Müll') + ' rausbringen: ' + (room ? room.name : 'Unbekannt');
  }
  trashBins = trashBins.filter(b => b.id !== editingTrashBinId);
  await persistState();
  document.getElementById('trashBinModal').classList.add('hidden');
  renderRoomList();
  if (baseTitleToClean) {
    try { await apiFetch('/api/delete-today-household-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: baseTitleToClean }) }); } catch (err) {}
    await loadAufgaben();
  }
});

/* ---------- Cleaning tasks (weekdays or interval, with a selectable/extendable category) ---------- */
function renderCleaningCategorySelect(selected) {
  const sel = document.getElementById('roomScheduleCategorySelect');
  const visible = cleaningCategories.filter(c => c.active !== false || c.id === selected);
  sel.innerHTML = visible.length
    ? visible.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')
    : '<option value="">– Noch keine Kategorie –</option>';
  if (selected) sel.value = selected;
  const hint = document.getElementById('roomScheduleCategoryHint');
  if (hint) hint.classList.toggle('hidden', visible.length > 0);
}

let pendingScheduleWeekdays = [];
function renderScheduleWeekdayPicker() {
  const wrap = document.getElementById('roomScheduleWeekdayPicker');
  wrap.innerHTML = '';
  WEEKDAYS.forEach(wd => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-9 h-9 rounded-full text-xs font-medium border transition ' + (pendingScheduleWeekdays.includes(wd.id) ? 'bg-pine text-white border-pine' : 'border-ink/15 text-ink/60 hover:border-pine/50');
    btn.textContent = wd.label;
    btn.addEventListener('click', () => {
      if (pendingScheduleWeekdays.includes(wd.id)) pendingScheduleWeekdays = pendingScheduleWeekdays.filter(d => d !== wd.id);
      else pendingScheduleWeekdays.push(wd.id);
      renderScheduleWeekdayPicker();
    });
    wrap.appendChild(btn);
  });
}

let editingScheduleId = null;
let pendingScheduleRoomId = null;
let pendingScheduleType = 'weekdays';

function setScheduleTypeChoice(type) {
  pendingScheduleType = type;
  document.querySelectorAll('.schedule-type-btn').forEach(b => b.classList.toggle('active', b.dataset.scheduletype === type));
  document.getElementById('roomScheduleWeekdaysWrap').classList.toggle('hidden', type !== 'weekdays');
  document.getElementById('roomScheduleIntervalWrap').classList.toggle('hidden', type !== 'interval');
}
document.querySelectorAll('.schedule-type-btn').forEach(btn => btn.addEventListener('click', () => setScheduleTypeChoice(btn.dataset.scheduletype)));

function openRoomScheduleModal(existingId, roomId) {
  editingScheduleId = existingId || null;
  const schedule = existingId ? roomSchedules.find(s => s.id === existingId) : null;
  pendingScheduleRoomId = schedule ? schedule.roomId : roomId;
  const room = rooms.find(r => r.id === pendingScheduleRoomId);

  document.getElementById('roomScheduleModalTitle').textContent = schedule ? 'Reinigung bearbeiten' : 'Reinigung hinzufügen';
  document.getElementById('roomScheduleRoomLabel').textContent = room ? (room.icon + ' ' + room.name) : '';
  document.getElementById('roomScheduleFormStatus').textContent = '';
  document.getElementById('roomScheduleNewCategoryInput').value = '';
  renderCleaningCategorySelect(schedule ? schedule.category : (cleaningCategories[0] ? cleaningCategories[0].id : ''));
  pendingHouseholdAssignedIds = schedule ? [...(schedule.assignedMemberIds || [])] : [];
  renderHouseholdMemberPicker('roomScheduleMemberPicker');
  hhRotateLoad('roomScheduleMemberPicker', schedule ? schedule.rotate : '');
  smartPickerLoad(schedule ? schedule.smart : null, 'roomScheduleSmartPicker');
  taskRemindLoad('roomScheduleRemindPicker', 'roomSchedule', schedule ? schedule.remindAt : '', { label: '🔔 Extra-Erinnerung per Push', def: '10:00', hint: 'Gilt für jede Aufgabe dieser Reinigung.' });

  setScheduleTypeChoice(schedule ? schedule.scheduleType : 'weekdays');

  pendingScheduleWeekdays = (schedule && schedule.scheduleType === 'weekdays') ? [...schedule.weekdays] : [];
  renderScheduleWeekdayPicker();

  const intervalSel = document.getElementById('roomScheduleIntervalSelect');
  const presetIntervals = ['1', '2', '3', '4', '5', '6', '7', '14'];
  if (schedule && schedule.scheduleType === 'interval' && presetIntervals.includes(String(schedule.intervalDays))) {
    intervalSel.value = String(schedule.intervalDays);
    document.getElementById('roomScheduleCustomIntervalWrap').classList.add('hidden');
    document.getElementById('roomScheduleCustomIntervalInput').value = '';
  } else if (schedule && schedule.scheduleType === 'interval') {
    intervalSel.value = 'custom';
    document.getElementById('roomScheduleCustomIntervalWrap').classList.remove('hidden');
    document.getElementById('roomScheduleCustomIntervalInput').value = schedule.intervalDays;
  } else {
    intervalSel.value = '7';
    document.getElementById('roomScheduleCustomIntervalWrap').classList.add('hidden');
    document.getElementById('roomScheduleCustomIntervalInput').value = '';
  }
  document.getElementById('roomScheduleFirstDateWrap').classList.toggle('hidden', intervalSel.value === '1');
  document.getElementById('roomScheduleFirstDateInput').value = (schedule && schedule.scheduleType === 'interval' && schedule.createdDate) ? schedule.createdDate : isoDate(new Date());

  document.getElementById('deleteRoomScheduleBtn').classList.toggle('hidden', !schedule);
  document.getElementById('roomScheduleModal').classList.remove('hidden');
  armModalSnapshot('roomScheduleModal');
}
function closeRoomScheduleModal() { document.getElementById('roomScheduleModal').classList.add('hidden'); }
document.getElementById('cancelRoomSchedule').addEventListener('click', () => attemptCloseModal('roomScheduleModal', closeRoomScheduleModal));
wireModalOutsideClick('roomScheduleModal', closeRoomScheduleModal);

document.getElementById('roomScheduleIntervalSelect').addEventListener('change', (e) => {
  document.getElementById('roomScheduleCustomIntervalWrap').classList.toggle('hidden', e.target.value !== 'custom');
  document.getElementById('roomScheduleFirstDateWrap').classList.toggle('hidden', e.target.value === '1');
});
document.getElementById('addRoomScheduleCategoryBtn').addEventListener('click', async () => {
  const input = document.getElementById('roomScheduleNewCategoryInput');
  const label = input.value.trim();
  if (!label) return;
  const id = 'cat' + Date.now();
  cleaningCategories.push({ id, label, active: true });
  await persistState();
  renderCleaningCategorySelect(id);
  input.value = '';
});

document.getElementById('saveRoomSchedule').addEventListener('click', async () => {
  let category = document.getElementById('roomScheduleCategorySelect').value;
  const scheduleType = pendingScheduleType;
  const statusEl = document.getElementById('roomScheduleFormStatus');
  if (!category && !cleaningCategories.length) {
    // first cleaning task of the family: create the typed name directly as a category
    const typed = document.getElementById('roomScheduleNewCategoryInput').value.trim();
    if (typed) {
      category = 'cat' + Date.now();
      cleaningCategories.push({ id: category, label: typed, active: true });
      renderCleaningCategorySelect(category);
      document.getElementById('roomScheduleNewCategoryInput').value = '';
    } else { statusEl.textContent = 'Bitte eine Kategorie eingeben, z. B. „Reinigung“.'; return; }
  }
  if (!category) { statusEl.textContent = 'Bitte eine Kategorie wählen.'; return; }
  // COMMENTED OUT (tasks calendar): if (!appleCalendar.taskCalendarName) { statusEl.textContent = 'Bitte zuerst einen Aufgaben-Kalender in den Einstellungen festlegen.'; return; }

  let weekdays = [];
  let intervalDays = null;
  let createdDate = isoDate(new Date());
  if (scheduleType === 'weekdays') {
    if (!pendingScheduleWeekdays.length) { statusEl.textContent = 'Bitte mindestens einen Wochentag wählen.'; return; }
    weekdays = [...pendingScheduleWeekdays];
  } else {
    const intervalSelVal = document.getElementById('roomScheduleIntervalSelect').value;
    if (intervalSelVal === 'custom') {
      intervalDays = parseInt(document.getElementById('roomScheduleCustomIntervalInput').value, 10);
      if (!intervalDays || intervalDays < 1) { statusEl.textContent = 'Bitte eine gültige Anzahl Tage angeben.'; return; }
    } else {
      intervalDays = parseInt(intervalSelVal, 10);
    }
    if (intervalDays !== 1) {
      const firstDate = document.getElementById('roomScheduleFirstDateInput').value;
      if (!firstDate) { statusEl.textContent = 'Bitte den Tag der ersten Reinigung angeben.'; return; }
      createdDate = firstDate;
    }
  }

  // Clean up today's orphaned task if either the title (category) OR only the
  // responsibility changes - both make the task already generated for today outdated.
  let oldBaseTitleToClean = null;
  if (editingScheduleId) {
    const existing = roomSchedules.find(s => s.id === editingScheduleId);
    const assignedChanged = JSON.stringify([...(existing.assignedMemberIds || [])].sort()) !== JSON.stringify([...pendingHouseholdAssignedIds].sort())
      || (existing.rotate || '') !== hhRotateValue('roomScheduleMemberPicker');
    const room = rooms.find(r => r.id === existing.roomId);
    if (existing && existing.category !== category) {
      const oldCategory = cleaningCategories.find(c => c.id === existing.category);
      oldBaseTitleToClean = (oldCategory ? oldCategory.label : 'Reinigung') + ': ' + (room ? room.name : 'Unbekannt');
    } else if (existing && assignedChanged) {
      const currentCategory = cleaningCategories.find(c => c.id === category);
      oldBaseTitleToClean = (currentCategory ? currentCategory.label : 'Reinigung') + ': ' + (room ? room.name : 'Unbekannt');
    }
  }

  if (editingScheduleId) {
    const schedule = roomSchedules.find(s => s.id === editingScheduleId);
    Object.assign(schedule, { category, scheduleType, weekdays, intervalDays, createdDate, assignedMemberIds: [...pendingHouseholdAssignedIds], smart: smartPickerValue(), rotate: hhRotateValue('roomScheduleMemberPicker'), remindAt: taskRemindValue('roomSchedule') });
  } else {
    roomSchedules.push({
      id: 'sched' + Date.now(), roomId: pendingScheduleRoomId, category, scheduleType, weekdays, intervalDays,
      createdDate, assignedMemberIds: [...pendingHouseholdAssignedIds], smart: smartPickerValue(), rotate: hhRotateValue('roomScheduleMemberPicker'),
      remindAt: taskRemindValue('roomSchedule'),
    });
  }
  if (!oldBaseTitleToClean) {
    const savedSched = editingScheduleId ? roomSchedules.find(x => x.id === editingScheduleId) : roomSchedules[roomSchedules.length - 1];
    taskRemindApplyOpen(t => { const hit = householdRuleForTask(t); return !!(hit && hit.rule === savedSched); }, savedSched.remindAt);
  }
  await persistState();
  document.getElementById('roomScheduleModal').classList.add('hidden');
  renderRoomList();
  triggerHouseholdResync(oldBaseTitleToClean);
});

document.getElementById('deleteRoomScheduleBtn').addEventListener('click', async () => {
  if (!editingScheduleId) return;
  const existing = roomSchedules.find(s => s.id === editingScheduleId);
  let baseTitleToClean = null;
  if (existing) {
    const room = rooms.find(r => r.id === existing.roomId);
    const category = cleaningCategories.find(c => c.id === existing.category);
    baseTitleToClean = (category ? category.label : 'Reinigung') + ': ' + (room ? room.name : 'Unbekannt');
  }
  roomSchedules = roomSchedules.filter(s => s.id !== editingScheduleId);
  await persistState();
  document.getElementById('roomScheduleModal').classList.add('hidden');
  renderRoomList();
  // When a rule is deleted completely, clean up today's task as well, but do NOT
  // regenerate automatically (the rule is gone, nothing new should be created for it).
  if (baseTitleToClean) {
    try { await apiFetch('/api/delete-today-household-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: baseTitleToClean }) }); } catch (err) {}
    await loadAufgaben();
  }
});

// After creating/editing a household rule, trigger a sync including detection right away
// instead of waiting up to 15 minutes for the next regular cycle. If the title of an
// edited rule has changed, the old task of today orphaned by it is removed first.
async function triggerHouseholdResync(oldBaseTitleToClean) {
  try {
    if (oldBaseTitleToClean) {
      await apiFetch('/api/delete-today-household-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: oldBaseTitleToClean }) });
    }
    await apiFetch('/api/pinn/aufgaben/haushalt-jetzt', { method: 'POST' });
    await loadAufgaben();
    hhFairCache = null;
    renderHouseholdFairness(true);
  } catch (err) {
    // A silent failure here is ok - the next hourly run catches up at the latest.
  }
}

// Info box: appears when clicking an "i" icon next to a setting and shows its
// explanation. Essential notes (e.g. deletion warnings) deliberately stay directly in the
// text or in their confirm() dialog, not here.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.info-btn');
  if (!btn) return;
  document.getElementById('infoPopupText').textContent = btn.dataset.info;
  document.getElementById('infoPopupModal').classList.remove('hidden');
});
document.getElementById('closeInfoPopupBtn').addEventListener('click', () => {
  document.getElementById('infoPopupModal').classList.add('hidden');
});
document.getElementById('infoPopupModal').addEventListener('click', (e) => {
  if (e.target.id === 'infoPopupModal') document.getElementById('infoPopupModal').classList.add('hidden');
});


function pollHouseholdProgress(btn, statusEl, fallbackLabel) {
  const tick = async () => {
    try {
      const res = await apiFetch('/api/household-tasks-progress');
      const p = await res.json();
      if (p.active) {
        btn.textContent = p.total > 0 ? `${p.done} von ${p.total} …` : `${p.label} …`;
      }
    } catch (err) {
      btn.textContent = fallbackLabel;
    }
  };
  tick(); // query once right away, don't wait for the first interval tick
  return setInterval(tick, 400);
}

document.querySelectorAll('.done-task-cleanup-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    doneTaskCleanupDays = Number(btn.dataset.cleanupDays);
    document.querySelectorAll('.done-task-cleanup-btn').forEach(b => b.classList.toggle('active', b === btn));
    persistState();
    renderTasks();
  });
});

// Task animation: personal setting, stored on the server with the other profile settings
async function renderDoneAnimationSetting() {
  const toggle = document.getElementById('doneAnimationToggle');
  toggle.checked = doneAnimationEnabled();
  if (!pushConfig) {
    try { await loadPushConfig(); toggle.checked = doneAnimationEnabled(); } catch (e) { /* Default: on */ }
  }
}
document.getElementById('doneAnimationToggle').addEventListener('change', async (e) => {
  const info = document.getElementById('doneAnimationStatus');
  const on = e.target.checked;
  info.textContent = '';
  try {
    if (!pushConfig) await loadPushConfig();
    const settings = { ...((pushConfig && pushConfig.settings) || {}), animation: on };
    const r = await postJson('/api/pinn/push/einstellungen', { settings });
    if (pushConfig) pushConfig.settings = r.settings || settings;
    info.textContent = 'Gespeichert.';
    setTimeout(() => { info.textContent = ''; }, 1500);
  } catch (err) {
    e.target.checked = !on;
    info.textContent = err.message || 'Speichern fehlgeschlagen.';
  }
});

document.getElementById('regenerateHouseholdTasksBtn').addEventListener('click', async () => {
  const btn = document.getElementById('regenerateHouseholdTasksBtn');
  const statusEl = document.getElementById('householdTasksMaintenanceStatus');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-not-allowed');
  btn.textContent = 'Wird geprüft …';
  statusEl.textContent = '';
  try {
    const res = await apiFetch('/api/pinn/aufgaben/haushalt-jetzt', { method: 'POST' });
    const result = await res.json();
    if (result.error) { statusEl.textContent = 'Fehler: ' + result.error; return; }
    if (result.busy) statusEl.textContent = 'Läuft gerade schon - bitte gleich noch einmal versuchen.';
    else statusEl.textContent = result.created ? `${result.created} Aufgabe${result.created === 1 ? '' : 'n'} angelegt.` : 'Alles aktuell - keine neuen Aufgaben nötig.';
    await loadAufgaben();
  } catch (err) {
    statusEl.textContent = 'Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    btn.textContent = originalText;
  }
});

document.getElementById('deleteHouseholdTasksBtn').addEventListener('click', async () => {
  if (!confirm('Wirklich alle automatisch erzeugten Haushalts-Aufgaben (Reinigung/Aufräumen/Mülleimer rausbringen) löschen? Normale, selbst angelegte Aufgaben bleiben erhalten.')) return;
  const btn = document.getElementById('deleteHouseholdTasksBtn');
  const statusEl = document.getElementById('householdTasksMaintenanceStatus');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-not-allowed');
  btn.textContent = 'Wird gelöscht …';
  statusEl.textContent = '';
  try {
    const res = await apiFetch('/api/delete-household-tasks', { method: 'POST' });
    const result = await res.json();
    if (result.error) { statusEl.textContent = 'Fehler: ' + result.error; return; }
    statusEl.textContent = `${result.deletedCount} Aufgabe${result.deletedCount === 1 ? '' : 'n'} gelöscht.`;
    await loadAufgaben();
  } catch (err) {
    statusEl.textContent = 'Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    btn.textContent = originalText;
  }
});

/* ===== COMMENTED OUT: regenerate/delete via the Apple tasks calendar =====
document.getElementById('regenerateHouseholdTasksBtn_kalender').addEventListener('click', async () => {
  const btn = document.getElementById('regenerateHouseholdTasksBtn');
  const statusEl = document.getElementById('householdTasksMaintenanceStatus');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-not-allowed');
  btn.textContent = 'Wird gestartet …';
  statusEl.textContent = '';
  const pollId = pollHouseholdProgress(btn, statusEl, 'Wird neu generiert …');
  try {
    await apiFetch('/api/sync-calendar-now', { method: 'POST' });
    await syncAppleCalendarFile(false);
    clearInterval(pollId);
    const res = await apiFetch('/api/household-tasks-progress');
    const p = await res.json();
    statusEl.textContent = p.label ? p.label + '.' : 'Erledigt.';
  } catch (err) {
    clearInterval(pollId);
    statusEl.textContent = 'Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    btn.textContent = originalText;
  }
});

document.getElementById('deleteHouseholdTasksBtn_kalender').addEventListener('click', async () => {
  if (!confirm('Wirklich alle automatisch erzeugten Haushalts-Aufgaben (Reinigung/Aufräumen/Mülleimer rausbringen) löschen? Normale, selbst angelegte Aufgaben bleiben erhalten.')) return;
  const btn = document.getElementById('deleteHouseholdTasksBtn');
  const statusEl = document.getElementById('householdTasksMaintenanceStatus');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.add('opacity-60', 'cursor-not-allowed');
  btn.textContent = 'Wird gestartet …';
  statusEl.textContent = '';
  const pollId = pollHouseholdProgress(btn, statusEl, 'Wird gelöscht …');
  try {
    const res = await apiFetch('/api/delete-household-tasks', { method: 'POST' });
    const result = await res.json();
    clearInterval(pollId);
    if (result.error) { statusEl.textContent = 'Fehler: ' + result.error; return; }
    statusEl.textContent = `${result.deletedCount} von ${result.deletedCount} gelöscht.`;
    await syncAppleCalendarFile(false);
  } catch (err) {
    clearInterval(pollId);
    statusEl.textContent = 'Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60', 'cursor-not-allowed');
    btn.textContent = originalText;
  }
});

===== END COMMENTED OUT ===== */

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('haushalt');
