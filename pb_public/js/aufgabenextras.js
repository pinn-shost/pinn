/* pinn. – Task extras: reminders & input tasks (js/aufgabenextras.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the extra reminder via push for tasks and task rules (taskRemindHtml, taskRemindWire, taskRemindLoad,
   taskRemindValue, taskRemindApplyOpen – the push itself is sent by pb_hooks/pinn-push.js) and tasks that are
   completed by an input (taskActionFor, openTaskFromLink – the actions come from js/zuhause.js and js/fahrzeuge.js). */

/* ---------- Extra reminder via push (since 1.57) ----------
   Checkbox + time, stored as remindAt ('HH:MM', empty = off). Directly on tasks, on rules
   (cleaning, bins, maintenance, vehicles) for all tasks generated from them later. The server sends the
   push on the due date at that time (pb_hooks/pinn-push.js → runTaskReminders). */
function taskRemindValid(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }
function taskRemindHtml(prefix, value, opts = {}) {
  const on = taskRemindValid(value);
  const time = on ? value : (opts.def || '09:00');
  const label = opts.label || '🔔 Erinnerung per Push';
  return `<div class="task-remind">
    <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input id="${prefix}RemindOn" type="checkbox" class="w-4 h-4"${on ? ' checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
    <div id="${prefix}RemindWrap" class="${on ? '' : 'hidden '}flex items-center gap-2 mt-2 pl-6 flex-wrap">
      <span class="text-xs text-ink/50">am Fälligkeitstag um</span>
      <input id="${prefix}RemindTime" type="time" value="${escapeHtml(time)}" class="rounded-lg border border-ink/15 px-2 py-1.5 text-sm" />
    </div>
    ${opts.hint ? `<p class="text-[11px] text-ink/40 mt-1">${escapeHtml(opts.hint)}</p>` : ''}
  </div>`;
}
function taskRemindWire(prefix) {
  const cb = document.getElementById(prefix + 'RemindOn');
  if (!cb) return;
  cb.addEventListener('change', () => {
    document.getElementById(prefix + 'RemindWrap').classList.toggle('hidden', !cb.checked);
  });
}
// Insert into a fixed placeholder (task, bin, cleaning)
function taskRemindLoad(containerId, prefix, value, opts) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = taskRemindHtml(prefix, value, opts);
  taskRemindWire(prefix);
}
function taskRemindValue(prefix) {
  const cb = document.getElementById(prefix + 'RemindOn');
  if (!cb || !cb.checked) return '';
  const t = (document.getElementById(prefix + 'RemindTime') || {}).value || '';
  return taskRemindValid(t) ? t : '09:00';
}
// Changed rule: open tasks of this rule get the new time right away
function taskRemindApplyOpen(match, remindAt) {
  if (typeof aufgaben === 'undefined' || isCurrentUserGuest()) return 0;
  const want = taskRemindValid(remindAt) ? remindAt : '';
  let n = 0;
  aufgaben.filter(t => !t.done && match(t) && (t.remindAt || '') !== want).forEach(t => {
    queueTaskSave({ id: t.id, title: t.title, notes: t.notes || '', dueDate: t.dueDate, fromTime: t.fromTime || '', toTime: t.toTime || '', remindAt: want }, false);
    n++;
  });
  if (n) { rebuildAufgaben(); try { renderTasks(); } catch (e) { /* not ready yet */ } flushOutbox(); }
  return n;
}

/* ---------- Tasks completed by an input (since 1.57) ----------
   Some tasks are completed by entering something: „Zählerstände ablesen“ (Home) opens the
   meter-reading window directly, vehicle tasks (MOT, service, tyres …) the matching entry.
   After saving, the task checks itself off. The areas provide the action
   (js/zuhause.js → hsTaskAction, js/fahrzeuge.js → fzTaskAction). */
function taskActionFor(task) {
  if (!task || task.done || isCurrentUserGuest() || childLockActive()) return null;
  try {
    if (typeof hsTaskAction === 'function') { const a = hsTaskAction(task); if (a) return a; }
    if (typeof fzTaskAction === 'function') { const a = fzTaskAction(task); if (a) return a; }
  } catch (e) { /* area not ready */ }
  return null;
}
// From a push, the bell or the family overview: open the input, otherwise edit
function openTaskFromLink(id) {
  const t = aufgaben.find(x => x.id === id);
  if (!t) return;
  const a = taskActionFor(t);
  if (a) { a.run(); return; }
  openEditTaskModal({ id });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('aufgabenextras');
