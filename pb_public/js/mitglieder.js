/* pinn. – Family members (js/mitglieder.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: member lookup and labels (memberById, memberLabel, memberAvatarInnerHTML, memberBorderColor), people assigned to
   appointments ("Zugewiesen:" line, colour bar), the member chips and the member filter (passesMemberFilter,
   matchesActiveMemberFilter, memberFilterSortWeight, isEventVisibleAsCalendarEntry) and the emoji/avatar grids of the member
   popup. Profile pictures are in js/profilbild.js, the member popup in js/mitglied.js. */

/* ==========================================================
   Family members
   ========================================================== */
function memberById(id) { return members.find(m => m.id === id); }

// Reads the "Zugewiesen: Name, Name" line from the appointment description (if present) and
// returns the matching family members - this way appointments created via "+ Termin
// hinzufügen" with people assigned can be marked in colour (see eventDetailModal).
function getAssignedMembersForEvent(ev) {
  if (!ev || !ev.description) return [];
  const match = ev.description.match(/Zugewiesen:\s*(.+)/);
  if (!match) return [];
  const names = match[1].split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  if (names.includes('alle')) return members;
  return members.filter(m => names.includes(memberLabel(m).toLowerCase()) || names.includes(m.name.toLowerCase()));
}
// Notes for display in the app language (since 1.118): the "Zugewiesen: ..." line stays German in the
// stored data (server, iCloud and older devices read it) and is only translated here; the same for the
// "Aus pinn. → Fahrzeuge → ..." stamp of older vehicle tasks.
function localizeNotes(text) {
  return String(text || '')
    .replace(/^Zugewiesen:\s*(.+)$/m, (m, names) => tk('event.assignedLine', { names: names.split(',').map(n => n.trim()).map(n => n.toLowerCase() === 'alle' ? tk('tasks.everyone') : n).join(', ') }))
    .replace(/^Aus pinn\. → Fahrzeuge → (.+)$/m, (m, name) => tk('vehicle.task.fromStamp', { name }))
    .replace(/^Eingelagert:\s*(.+)$/m, (m, place) => tk('vehicle.task.storedAt', { place }));
}
// Removes the "Zugewiesen: ..." line from a text again (for display/the edit form).
function stripAssignedLine(text) {
  return (text || '').replace(/\n*Zugewiesen:\s*.+/, '').trim();
}

// Builds a small colour bar pinned to the left (like for tasks) for an appointment -
// empty if no people are assigned. bar is placed as an absolutely positioned element into the
// (already absolutely positioned) appointment block.
function assignedMembersBarHtml(ev) {
  const assigned = getAssignedMembersForEvent(ev);
  if (!assigned.length) return '';
  const segments = assigned.map(m => `<span class="flex-1" style="background:${m.color}"></span>`).join('');
  return `<div class="absolute left-0 top-0 bottom-0 w-1 flex flex-col overflow-hidden">${segments}</div>`;
}
function memberLabel(m) { return (m.displayMode === 'role' && m.role) ? m.role : m.name; }

function memberAvatarInnerHTML(m) {
  if (m.photo) return `<img src="${m.photo}" class="w-full h-full object-cover" alt="" />`;
  if (m.avatar) return `<span class="flex items-center justify-center w-full h-full text-base leading-none">${m.avatar}</span>`;
  const bg = (!m.color || m.color === 'transparent') ? '#9A9A92' : m.color;
  const initial = (m.name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="flex items-center justify-center w-full h-full text-white text-xs font-semibold" style="background:${bg}">${initial}</span>`;
}
function memberBorderColor(m) { return (!m.color || m.color === 'transparent') ? 'transparent' : m.color; }

function renderMemberChips() {
  ['memberChips', 'memberChipsTasks'].forEach(containerId => {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    members.forEach(m => {
      const isDimmed = activeMemberFilter.size > 0 && !activeMemberFilter.has(m.id);
      const isActive = activeMemberFilter.has(m.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs font-medium bg-ink/5 transition ' + (isDimmed ? 'opacity-35' : '') + (isActive ? ' ring-2 ring-offset-1 ring-ink/70' : '');
      const avatarHtml = `<span class="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>`;
      // The kids page is now opened by the overview tile „Familienmitglieder“ (renderFamilyTile)
      chip.innerHTML = `${avatarHtml}<span>${escapeHtml(memberLabel(m))}</span>`;
      chip.title = tk('member.clickHighlightOnlyPersons');
      chip.addEventListener('click', () => {
        if (activeMemberFilter.has(m.id)) activeMemberFilter.delete(m.id);
        else activeMemberFilter.add(m.id);
        renderMemberChips();
        renderCalendar();
        renderTasks();
      });
      wrap.appendChild(chip);
    });
  });
  try { renderFamilyTile(); } catch (e) { /* overview not built yet */ }
}

function passesMemberFilter(memberId) {
  if (!memberId) return true; // imported Apple calendar appointments don't belong to a specific person
  return activeMemberFilter.size === 0 || activeMemberFilter.has(memberId);
}
// Replaces passesMemberFilter for appointments/tasks: checks the REAL assignment (the "Zugewiesen:
// ..." line in the notes) instead of the memberId field, which is unused for imported appointments.
// If no person is selected, everything concerns the active selection (by definition).
function matchesActiveMemberFilter(item) {
  if (activeMemberFilter.size === 0) return true;
  return getAssignedMembersForEvent(item).some(m => activeMemberFilter.has(m.id));
}
// Sort weight: 0 = concerns the active selection (should go to the top), 1 = does not concern it.
// With an empty selection everything gets the same weight (no re-sorting).
function memberFilterSortWeight(item) {
  return matchesActiveMemberFilter(item) ? 0 : 1;
}
// Appointments from the calendar marked as "Aufgaben-Kalender" by default appear ONLY with the
// tasks, not additionally as normal calendar entries - unless the checkbox "Auch als Termine
// anzeigen" is set in the settings.
function isEventVisibleAsCalendarEntry(ev) {
  if (appleCalendar.taskCalendarName && ev.pinnCalName === appleCalendar.taskCalendarName && !appleCalendar.showTaskCalendarAsEvents) {
    return false;
  }
  return true;
}

function renderMemberAvatarPreview() {
  const el = document.getElementById('memberAvatarPreview');
  el.style.borderColor = memberBorderColor({ color: selectedMemberColor });
  el.innerHTML = memberAvatarInnerHTML({ photo: pendingMemberPhoto, avatar: pendingMemberAvatar, color: selectedMemberColor, name: document.getElementById('newMemberName').value });
}

function buildAvatarGrids() {
  Object.keys(AVATARS).forEach(group => {
    const wrap = document.querySelector(`.avatar-group[data-group="${group}"]`);
    wrap.innerHTML = '';
    AVATARS[group].forEach(([emoji, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = label;
      btn.className = 'avatar-option w-9 h-9 rounded-full border-2 border-transparent bg-ink/5 grid place-items-center text-lg hover:border-pine transition';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        pendingMemberAvatar = emoji;
        pendingMemberPhoto = null;
        document.getElementById('memberPhotoFile').value = '';
        document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('border-pine'));
        btn.classList.add('border-pine');
        renderMemberAvatarPreview();
      });
      wrap.appendChild(btn);
    });
  });
}
buildAvatarGrids();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('mitglieder');
