/* pinn. – Kids page: member settings & routine editor (js/kinderroutine.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the "Kinderseite" section of the member popup (initMemberKidSection, updateMemberKidSection) and the popup to edit
   tasks & times of day (openKidRoutineEditor, renderKidRoutineTimes/-Tasks, kidMoveTask, defaults, apply, cancel).
   openKidRoutineEditor is one of the six functions wrapped by the child lock at DOMContentLoaded – never pass it on directly
   while loading. The kids page itself is in js/kinderseite.js. */

/* ---------- Member popup: section "Kinderseite" ---------- */
function initMemberKidSection(existing) {
  pendingKidConfig = normalizeKidConfig(existing && existing.kid);
  // Flatshare: only show the kids page if it is already switched on for this member
  const sec = document.getElementById('memberKidSection');
  if (sec) sec.classList.toggle('hidden', wgHidesKids() && !pendingKidConfig.enabled);
  updateMemberKidSection();
}
function updateMemberKidSection() {
  const cfg = pendingKidConfig || normalizeKidConfig(null);
  document.getElementById('memberKidMode').checked = cfg.enabled;
  document.getElementById('memberKidShowAllowance').checked = !!cfg.showAllowance;
  document.getElementById('memberKidOptions').classList.toggle('hidden', !cfg.enabled);
  const count = cfg.tasks.length;
  document.getElementById('memberKidSummary').textContent =
    `${tk('kid.tasksN', { n: count })} · ${KID_TIME_LABELS.morgens} ${cfg.times.morgens} · ${KID_TIME_LABELS.abends} ${cfg.times.abends} · ${KID_TIME_LABELS.nacht} ${cfg.times.nacht}`;
  // Stars & rewards
  const st = normalizeKidStars(cfg.stars);
  document.getElementById('memberKidStars').checked = st.on;
  document.getElementById('memberKidStarsOpts').classList.toggle('hidden', !st.on);
  document.getElementById('memberKidStarsSummary').textContent = `${tk('kid.rewardsBonusStarsAll', { n: st.rewards.length, bonus: st.bonus })}`;
  // Hidden field so "Abbrechen" notices unsaved changes to the kids page
  document.getElementById('memberKidConfigState').value = JSON.stringify(cfg);
}
document.getElementById('memberKidMode').addEventListener('change', (e) => {
  if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
  pendingKidConfig.enabled = e.target.checked;
  if (pendingKidConfig.enabled && !pendingKidConfig.tasks.length) pendingKidConfig.tasks = kidDefaultTasks();
  updateMemberKidSection();
});
document.getElementById('memberKidShowAllowance').addEventListener('change', (e) => {
  if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
  pendingKidConfig.showAllowance = e.target.checked;
  updateMemberKidSection();
});
document.getElementById('memberKidEdit').addEventListener('click', () => openKidRoutineEditor());

/* ---------- Popup: edit tasks & times of day ---------- */
function openKidRoutineEditor() {
  const cfg = pendingKidConfig || normalizeKidConfig(null);
  kidEditTasks = cfg.tasks.map(t => ({ ...t }));
  kidEditTimes = { ...cfg.times };
  kidEmojiOpenFor = null;
  const name = document.getElementById('newMemberName').value.trim();
  document.getElementById('kidRoutineTitle').textContent = name ? `${tk('kid.sKidsPage', { name })}` : tk('famTile.kidsPage');
  document.getElementById('kidRoutineStatus').textContent = '';
  renderKidRoutineTimes();
  renderKidRoutineTasks();
  document.getElementById('kidSunEvening').checked = !!cfg.sonne;
  const sunToday = homeSunTimes(new Date());
  document.getElementById('kidSunHint').textContent = sunToday && sunToday.unter
    ? `${tk('kid.todaySunSetsEvening', { homeFmtTime: homeFmtTime(sunToday.unter) })}`
    : tk('kid.needsHomeSettingsHome');
  document.getElementById('kidRoutineModal').classList.remove('hidden');
  armModalSnapshot('kidRoutineModal');
}
function closeKidRoutineModal() { document.getElementById('kidRoutineModal').classList.add('hidden'); }
function renderKidRoutineTimes() {
  document.getElementById('kidTimesGrid').innerHTML = KID_TIME_KEYS.map(key => `
    <label class="block">
      <span class="block text-[11px] text-ink/50 mb-0.5">${KID_TIME_LABELS[key]}</span>
      <input type="time" data-time-key="${key}" value="${kidAttr(kidEditTimes[key])}" class="kid-time-input w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm bg-white" />
    </label>`).join('');
}
function kidRoutineRowHtml(t, list) {
  const idx = list.indexOf(t);
  const options = KID_TASK_GROUPS.map(g => `<option value="${g.id}"${g.id === t.period ? ' selected' : ''}>${g.label}</option>`).join('');
  const picker = kidEmojiOpenFor === t.id
    ? `<div class="flex flex-wrap gap-1 mt-1.5 p-2 rounded-lg bg-ink/5">${KID_EMOJIS.map(e =>
        `<button type="button" class="kid-emoji-pick w-9 h-9 rounded-lg text-xl grid place-items-center hover:bg-white" data-emoji="${kidAttr(e)}">${e}</button>`).join('')}</div>`
    : '';
  return `<div class="kid-edit-row" data-id="${kidAttr(t.id)}">
    <div class="flex items-center gap-1.5">
      <button type="button" class="kid-edit-emoji w-10 h-10 shrink-0 rounded-lg bg-ink/5 text-xl grid place-items-center" title="${escapeHtml(tk('kid.chooseImage'))}">${escapeHtml(t.emoji || '⭐')}</button>
      <input type="text" class="kid-edit-title flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-2 text-sm" maxlength="40" placeholder="${escapeHtml(tk('kid.eGBrushTeeth'))}" value="${kidAttr(t.title)}" />
      <button type="button" class="kid-edit-del w-8 h-8 shrink-0 rounded-lg text-ink/40 hover:text-red-500 transition" title="${escapeHtml(tk('common.remove'))}" aria-label="${escapeHtml(tk('kid.removeTask'))}">✕</button>
    </div>
    <div class="flex items-center gap-1 mt-1 pl-[46px]">
      <select class="kid-edit-period rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white">${options}</select>
      ${pendingKidConfig && pendingKidConfig.stars && pendingKidConfig.stars.on ? `<select class="kid-edit-stars rounded-lg border border-ink/15 px-1.5 py-1 text-xs bg-white" title="${escapeHtml(tk('kid.starsTask'))}" aria-label="${escapeHtml(tk('kid.starsTask'))}" data-no-i18n>${[1, 2, 3].map(n => `<option value="${n}"${(Number(t.stars) || 1) === n ? ' selected' : ''}>${'⭐'.repeat(n)}</option>`).join('')}</select>` : ''}
      <button type="button" class="kid-edit-up w-7 h-7 rounded-lg text-ink/40 hover:text-pine transition${idx === 0 ? ' invisible' : ''}" title="${escapeHtml(tk('common.moveUp'))}" aria-label="${escapeHtml(tk('common.moveUp'))}">↑</button>
      <button type="button" class="kid-edit-down w-7 h-7 rounded-lg text-ink/40 hover:text-pine transition${idx === list.length - 1 ? ' invisible' : ''}" title="${escapeHtml(tk('common.moveDown'))}" aria-label="${escapeHtml(tk('common.moveDown'))}">↓</button>
    </div>
    ${picker}
  </div>`;
}
function renderKidRoutineTasks() {
  document.getElementById('kidTaskGroups').innerHTML = KID_TASK_GROUPS.map(g => {
    const list = kidEditTasks.filter(t => t.period === g.id);
    return `<div>
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-xs uppercase tracking-wide text-ink/40">${g.icon} ${g.label}</p>
        <button type="button" class="kid-add-task text-xs text-pine font-medium px-2 py-1 rounded-lg hover:bg-ink/5" data-period="${g.id}">${tk('kid.task')}</button>
      </div>
      <div class="flex flex-col gap-1.5">
        ${list.length ? list.map(t => kidRoutineRowHtml(t, list)).join('') : ('<p class="text-xs text-ink/30 italic">' + tk('kid.noTasks') + '</p>')}
      </div>
    </div>`;
  }).join('');
}
function kidMoveTask(id, dir) {
  const task = kidEditTasks.find(t => t.id === id);
  if (!task) return;
  const same = kidEditTasks.filter(t => t.period === task.period);
  const other = same[same.indexOf(task) + dir];
  if (!other) return;
  const a = kidEditTasks.indexOf(task), b = kidEditTasks.indexOf(other);
  kidEditTasks[a] = other;
  kidEditTasks[b] = task;
  renderKidRoutineTasks();
}
document.getElementById('kidTimesGrid').addEventListener('input', (e) => {
  const key = e.target.dataset && e.target.dataset.timeKey;
  if (key) kidEditTimes[key] = e.target.value;
});
document.getElementById('kidTaskGroups').addEventListener('input', (e) => {
  if (!e.target.classList.contains('kid-edit-title')) return;
  const row = e.target.closest('.kid-edit-row');
  const task = row && kidEditTasks.find(t => t.id === row.dataset.id);
  if (task) task.title = e.target.value;
});
document.getElementById('kidTaskGroups').addEventListener('change', (e) => {
  if (!e.target.classList.contains('kid-edit-period')) return;
  const row = e.target.closest('.kid-edit-row');
  const task = row && kidEditTasks.find(t => t.id === row.dataset.id);
  if (!task) return;
  // When the time of day changes, append it to the end of the new group
  kidEditTasks = kidEditTasks.filter(t => t !== task);
  task.period = e.target.value;
  kidEditTasks.push(task);
  renderKidRoutineTasks();
});
document.getElementById('kidTaskGroups').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.classList.contains('kid-add-task')) {
    const task = { id: kidUid(), emoji: '⭐', title: '', period: btn.dataset.period, stars: 1 };
    kidEditTasks.push(task);
    kidEmojiOpenFor = null;
    renderKidRoutineTasks();
    const input = document.querySelector(`#kidTaskGroups .kid-edit-row[data-id="${task.id}"] .kid-edit-title`);
    if (input) input.focus();
    return;
  }
  if (btn.classList.contains('kid-emoji-pick')) {
    const task = kidEditTasks.find(t => t.id === kidEmojiOpenFor);
    if (task) task.emoji = btn.dataset.emoji;
    kidEmojiOpenFor = null;
    renderKidRoutineTasks();
    return;
  }
  const row = btn.closest('.kid-edit-row');
  if (!row) return;
  const id = row.dataset.id;
  if (btn.classList.contains('kid-edit-emoji')) {
    kidEmojiOpenFor = kidEmojiOpenFor === id ? null : id;
    renderKidRoutineTasks();
  } else if (btn.classList.contains('kid-edit-del')) {
    kidEditTasks = kidEditTasks.filter(t => t.id !== id);
    if (kidEmojiOpenFor === id) kidEmojiOpenFor = null;
    renderKidRoutineTasks();
  } else if (btn.classList.contains('kid-edit-up')) {
    kidMoveTask(id, -1);
  } else if (btn.classList.contains('kid-edit-down')) {
    kidMoveTask(id, 1);
  }
});
document.getElementById('kidRoutineDefaults').addEventListener('click', () => {
  if (kidEditTasks.length && !confirm(tk('kid.replaceAllTasksTimes'))) return;
  kidEditTasks = kidDefaultTasks();
  kidEditTimes = { ...KID_DEFAULT_TIMES };
  kidEmojiOpenFor = null;
  renderKidRoutineTimes();
  renderKidRoutineTasks();
});
document.getElementById('kidRoutineApply').addEventListener('click', () => {
  const status = document.getElementById('kidRoutineStatus');
  status.textContent = '';
  const mins = KID_TIME_KEYS.map(k => kidToMin(kidEditTimes[k]));
  if (mins.some(v => v === null)) { status.textContent = tk('kid.pleaseFillAllTimes'); return; }
  for (let i = 1; i < mins.length; i++) {
    if (mins[i] <= mins[i - 1]) {
      status.textContent = `${tk('kid.mustLaterThan', { v: KID_TIME_LABELS[KID_TIME_KEYS[i]], v2: KID_TIME_LABELS[KID_TIME_KEYS[i - 1]] })}`;
      return;
    }
  }
  const tasks = kidEditTasks.map(t => ({ ...t, title: (t.title || '').trim() })).filter(t => t.title);
  if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
  pendingKidConfig = { ...pendingKidConfig, times: { ...kidEditTimes }, tasks, sonne: document.getElementById('kidSunEvening').checked };
  updateMemberKidSection();
  closeKidRoutineModal();
});
document.getElementById('kidRoutineCancel').addEventListener('click', () => attemptCloseModal('kidRoutineModal', closeKidRoutineModal));
wireModalOutsideClick('kidRoutineModal', closeKidRoutineModal);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kinderroutine');
