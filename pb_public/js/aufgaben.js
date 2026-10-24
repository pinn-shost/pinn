/* pinn. – Tasks list & task popup (js/aufgaben.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the task list (renderTasks – sorting, counter, missed count, smart-home start buttons, shopping and input
   tasks), checking off (toggleTaskDone – queue, planned shopping → Finance, celebration animation, "On check-off"
   smart-home action), the "all tasks done" celebration and the task popup (openTaskModal, openEditTaskModal, saving –
   also offline). Two old variants for the Apple tasks calendar are kept commented out.
   openTaskModal and openEditTaskModal are wrapped by the child lock in index.html (wrapEditorsForChildLock), which
   only runs on DOMContentLoaded, after all files in js/ have loaded – so it is safe that they live here. */

function renderTasks() {
  try { ntRefresh(); } catch (e) { /* Bell not ready yet */ }
  updateAppBadge();
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyTasks');
  const count = document.getElementById('taskCount');
  list.innerHTML = '';

  const taskItems = deriveTasks();
  // Sort tasks that were just checked off with their new state already, before the server confirms.
  taskItems.forEach(t => {
    if (taskDoneOverrides.has(t.id)) t.done = taskDoneOverrides.get(t.id);
  });
  // Setting "Delete immediately": hide completed tasks right away (they are deleted on the NAS
  // at the next hourly clean-up). A task that was just checked off stays visible until it is saved.
  const visibleItems = doneTaskCleanupDays === 0
    ? taskItems.filter(t => !t.done || t.pending || pendingTaskToggles.has(t.id))
    : taskItems;
  const sorted = [...visibleItems].sort((a, b) => {
    if (!!a.done !== !!b.done) return a.done ? 1 : -1; // open ones first
    const ad = a.dueDate ? a.dueDate + 'T' + (a.fromTime || '23:59') : '9999';
    const bd = b.dueDate ? b.dueDate + 'T' + (b.fromTime || '23:59') : '9999';
    return ad.localeCompare(bd);
  }).sort((a, b) => memberFilterSortWeight(a) - memberFilterSortWeight(b));

  /* COMMENTED OUT (tasks calendar):
  if (!appleCalendar.taskCalendarName) {
    count.textContent = '';
    empty.textContent = 'Noch kein Aufgaben-Kalender eingerichtet - siehe Einstellungen -> Kalender-Import.';
    empty.classList.remove('hidden');
    return;
  }
  */
  if (!aufgabenLoaded) {
    count.textContent = '';
    empty.textContent = tk('tasks.loading');
    empty.classList.remove('hidden');
    return;
  }
  // Counter: done / all displayed tasks (e.g. 3/8)
  const doneCount = visibleItems.filter(t => t.done).length;
  count.textContent = visibleItems.length ? `${doneCount}/${visibleItems.length}` : '';
  empty.textContent = tk('tasks.empty');
  empty.classList.toggle('hidden', visibleItems.length > 0);

  sorted.forEach(task => {
    const assignees = assigneesForTask(task);
    const barSegments = assignees.length
      ? assignees.map(m => `<span class="flex-1" style="background:${m.color}"></span>`).join('')
      : `<span class="flex-1 bg-ink/15"></span>`;
    const notesDisplay = stripAssignedLine(task.description);
    // How often a household task was not done before - as a separate field at the bottom right.
    const missCount = task.missed || 0;
    const displayTitle = task.title;
    // Smart home: start buttons of the linked cleaning task or bin
    const smartStart = task.done ? [] : smartStartActionsForTask(task);
    const smartAuto = task.done ? null : smartAutoForTask(task);
    // Task with its own input (e.g. reading the meters): tapping opens the input
    const taskAct = taskActionFor(task);

    // Shopping task: tapping opens the shopping list(s)
    const taskPlan = shoppingPlanForTask(task.id);
    const opensShopping = !taskAct && !!(taskPlan && taskPlan.listIds.some(id => getShoppingList(id)) && isViewAllowed('einkauf'));
    const card = document.createElement('div');
    card.className = 'rounded-xl border border-ink/10 bg-white overflow-hidden fade-in flex' + (opensShopping || taskAct ? ' task-card-shopping' : '') + (task.done ? ' opacity-50' : '') + (matchesActiveMemberFilter(task) ? '' : ' opacity-30');
    card.innerHTML = `
      <div class="w-1.5 shrink-0 flex flex-col">${barSegments}</div>
      <div class="flex-1 min-w-0 px-3 py-2.5">
        <div class="flex items-start justify-between gap-2">
          <button class="task-toggle-done shrink-0 w-5 h-5 rounded-full border-2 mt-0.5 ${task.done ? 'bg-pine border-pine' : 'border-ink/25'}" data-id="${task.id}" aria-label="${escapeHtml(tk('tasks.markDone'))}"></button>
          <div class="flex-1 min-w-0">
            <div class="font-serif text-base truncate ${task.done ? 'line-through' : ''}">${escapeHtml(displayTitle)}</div>
            ${notesDisplay ? `<div class="text-xs text-ink/60 mt-0.5 whitespace-pre-line">${escapeHtml(notesDisplay)}</div>` : ''}
            ${shoppingPlanBadgeHtml(task)}
            ${smartAuto ? `<div class="text-[11px] text-ink/50 mt-1.5">${escapeHtml(tk('tasks.autoStarts', { icon: smartAuto.device.icon, action: smartAuto.action.label, time: smartAuto.time }))}</div>` : ''}
            ${taskAct ? `<div class="flex flex-wrap gap-1.5 mt-2"><button type="button" class="task-act-btn sh-run">${escapeHtml(taskAct.label)}</button></div>` : ''}
            ${smartStart.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${smartStart.map(x => `<button type="button" class="smart-run-btn sh-run" data-action="${escapeHtml(x.action.id)}">▶ ${escapeHtml(x.device.icon)} ${escapeHtml(x.action.label)}</button>`).join('')}</div>` : ''}
            <div class="text-[11px] text-ink/40 mt-1.5">
              ${assignees.map(m => escapeHtml(memberLabel(m))).join(', ') || escapeHtml(tk('tasks.unassigned'))}
            </div>
            ${task.dueDate ? `<div class="text-[11px] text-ink/50 font-medium">${escapeHtml(tk('tasks.due', { date: task.hasTimeWindow ? fmtDateTime(task.dueDate, null) + ', ' + tk('cal.timeRange', { from: task.fromTime, to: task.toTime }) : fmtDateTime(task.dueDate, null) }))}</div>` : ''}
            ${task.remindAt && !task.done ? `<div class="text-[11px] text-ink/45">${escapeHtml(tk('tasks.remindAt', { time: task.remindAt }))}</div>` : ''}
            ${task.pending && outboxBlocked ? `<div class="text-[10px] text-mustard font-medium mt-0.5">${PENDING_MARK}${escapeHtml(tk('tasks.pendingSync'))}</div>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button class="edit-task text-ink/30 hover:text-pine text-xs" data-id="${task.id}">${escapeHtml(tk('common.edit'))}</button>
            <button class="del-task text-ink/30 hover:text-red-500 text-xs" data-id="${task.id}">×</button>
          </div>
        </div>
        ${missCount > 0 ? `<div class="flex justify-end mt-1.5"><span class="px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60">${escapeHtml(tk('tasks.missed', { n: missCount }))}</span></div>` : ''}
      </div>
    `;
    if (pendingTaskToggles.has(task.id)) {
      card.querySelectorAll('button').forEach(b => { b.disabled = true; });
    }
    card.querySelector('.task-toggle-done').addEventListener('click', () => toggleTaskDone(task));
    card.querySelectorAll('.smart-run-btn').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hit = smartStart.find(x => x.action.id === btn.dataset.action);
      if (hit) runSmartActionForTask(task, hit);
    }));
    if (taskAct) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button') && !e.target.closest('.task-act-btn')) return; // Check off, edit, delete keep their own action
        taskAct.run();
      });
    }
    if (opensShopping) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Check off, edit, delete keep their own action
        openShoppingForTask(task.id);
      });
    }
    card.querySelector('.edit-task').addEventListener('click', () => openEditTaskModal(task));
    card.querySelector('.del-task').addEventListener('click', async () => {
      if (!confirm(tk('tasks.confirmDelete', { title: task.title }))) return;
      // Remove right away; the deletion on the NAS is submitted (possibly later)
      queueTaskDelete(task.id);
      removeShoppingPlan(task.id);
      rebuildAufgaben();
      renderTasks();
      await flushOutbox();
      notifyIfQueuedOffline();
    });
    list.appendChild(card);
  });
}

// Builds the "Zugewiesen:" note line from the chosen people (as for events).
function buildAssignedNotes(baseNotes, assigneeIds) {
  if (!assigneeIds || !assigneeIds.length) return baseNotes;
  const label = assigneeIds.includes(TASK_ALL) ? 'Alle' : assigneeIds.map(id => memberLabel(memberById(id))).filter(Boolean).join(', ');
  if (!label) return baseNotes;
  return (baseNotes ? baseNotes + '\n\n' : '') + 'Zugewiesen: ' + label;
}

/* ---------- "All tasks done" ----------
   If the signed-in person has done all tasks that are due so far with this task
   (earlier days + today, with a time window only from its start), a celebration animation appears.
   The push notification to the others is sent by the server (pb_hooks/pinn-aufgaben.js). */
function doneAnimationEnabled() {
  return !(pushConfig && pushConfig.settings && pushConfig.settings.animation === false);
}
function allMyTasksDoneUntilNow(checkedTaskId) {
  const me = currentMember();
  if (!me || !doneAnimationEnabled()) return false;
  const now = new Date();
  const today = isoDate(now);
  const hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  const mine = deriveTasks().filter(t => {
    if (taskDoneOverrides.has(t.id)) t.done = taskDoneOverrides.get(t.id);
    if (!t.dueDate || t.dueDate > today) return false;
    if (t.dueDate === today && t.fromTime && t.fromTime > hm) return false;
    return assigneesForTask(t).some(m => m.id === me.id);
  });
  if (!mine.some(t => t.id === checkedTaskId)) return false; // only if it was your own task
  return mine.length > 0 && mine.every(t => t.done);
}
function showAllTasksDoneCelebration() {
  const me = currentMember();
  const old = document.getElementById('allDoneCelebrate');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'allDoneCelebrate';
  box.className = 'done-celebrate';
  box.innerHTML = `<div class="done-celebrate-box">
    <div class="done-celebrate-icon">🎉</div>
    <div class="font-serif text-2xl mt-2">${escapeHtml(me ? tk('tasks.allDoneName', { name: me.name }) : tk('tasks.allDone'))}</div>
    <div class="text-sm text-ink/60 mt-1">${escapeHtml(tk('tasks.allDoneSub'))}</div>
  </div>`;
  const dismiss = () => {
    if (!box.isConnected) return;
    box.classList.add('out');
    setTimeout(() => box.remove(), 250);
  };
  box.addEventListener('click', dismiss);
  document.body.appendChild(box);
  setTimeout(dismiss, 3800);
  if (navigator.vibrate) { try { navigator.vibrate([30, 60, 30]); } catch (e) { /* ignore */ } }
  kidConfettiRain();
  kidPlaySound('win');
}

async function toggleTaskDone(task) {
  if (!task.id) return;
  const newDone = !task.done;

  // Re-sort and show right away - saving on the NAS runs through the queue and
  // is submitted automatically when there is no connection.
  queueTaskDone(task.id, newDone);
  rebuildAufgaben();
  renderTasks();
  // Planned shopping checked off? -> book the amounts per shop directly in Finance
  const plan = newDone ? shoppingPlanForTask(task.id) : null;
  const openPlan = !!(plan && !plan.bookedAt && !isCurrentUserGuest() && plan.listIds.some(id => getShoppingList(id)));
  // Last open task so far checked off? -> celebration animation (the server sends the notification 10 s later)
  if (newDone && !openPlan && allMyTasksDoneUntilNow(task.id)) showAllTasksDoneCelebration();
  if (openPlan) openShoppingPlanDone(task.id, task.title);
  if (plan || shoppingPlanForTask(task.id)) ladenPlansSync(false);
  // Smart home: action "On check-off" (e.g. reminder LED off) - let it save briefly first, then start
  const smartDone = newDone ? smartDoneActionForTask(task) : null;
  if (smartDone) {
    await Promise.race([flushOutbox(), new Promise(r => setTimeout(r, 1500))]);
    await smartRunDone(task, smartDone);
    return;
  }
  await flushOutbox();
}

/* ===== COMMENTED OUT: checking off/changing via the Apple tasks calendar =====
// Makes a real change in iCloud, based on the freshly loaded raw data
// (so it keeps repeat/reminder/link, which our form does not know) - only the title and
// any other fields passed in are overwritten.
async function updateTaskEvent(task, overrides) {
  const res = await apiFetch('/api/get-calendar-event-raw', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ href: task.pinnHref }),
  });
  const result = await res.json();
  if (result.error) throw new Error(result.error);
  if (!result.ics) throw new Error('Server hat keinen Termin-Text zurückgegeben.');
  const parsed = parseRawEventForEdit(result.ics);
  const payload = {
    title: parsed.title,
    calendarName: appleCalendar.taskCalendarName,
    allDay: parsed.allDay,
    startDate: parsed.startDate, startTime: parsed.startTime,
    endDate: parsed.endDate, endTime: parsed.endTime,
    location: parsed.location,
    notes: buildAssignedNotes(parsed.notes, parsed.assigneeIds),
    url: parsed.url,
    repeat: parsed.repeat, repeatInterval: parsed.repeatInterval, repeatEnd: parsed.repeatEnd, repeatCount: parsed.repeatCount, repeatUntil: parsed.repeatUntil,
    alert: parsed.alert,
    ...overrides,
    href: task.pinnHref,
    uid: parsed.uid,
  };
  const updateRes = await apiFetch('/api/update-calendar-event', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const updateResult = await updateRes.json();
  if (updateResult.error) throw new Error(updateResult.error);
}


async function toggleTaskDone(task) {
  if (!task.pinnHref || pendingTaskToggles.has(task.pinnHref)) return;
  pendingTaskToggles.add(task.pinnHref);
  const newTitle = task.done ? task.title : (DONE_EMOJI + task.title);

  // Re-sort and show right away instead of waiting for iCloud (that takes several seconds).
  taskDoneOverrides.set(task.pinnHref, !task.done);
  renderTasks();

  try {
    await updateTaskEvent(task, { title: newTitle });
    await syncAppleCalendarFile(false);
    taskDoneOverrides.delete(task.pinnHref);
    pendingTaskToggles.delete(task.pinnHref);
    renderTasks();
  } catch (err) {
    taskDoneOverrides.delete(task.pinnHref);
    pendingTaskToggles.delete(task.pinnHref);
    renderTasks();
    alert('Fehler beim Aktualisieren: ' + err.message);
  }
}

===== END COMMENTED OUT ===== */

function renderTaskAssigneeOptions() {
  const wrap = document.getElementById('taskAssigneeList');
  wrap.innerHTML = '';

  const allRow = document.createElement('label');
  allRow.className = 'flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/5 cursor-pointer';
  allRow.innerHTML = `<input type="checkbox" class="task-assignee-checkbox" value="${TASK_ALL}" ${pendingTaskAssignees.includes(TASK_ALL) ? 'checked' : ''} /><span class="font-medium">${escapeHtml(tk('tasks.everyone'))}</span>`;
  wrap.appendChild(allRow);

  members.forEach(m => {
    const row = document.createElement('label');
    row.className = 'flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-ink/5 cursor-pointer';
    row.innerHTML = `
      <input type="checkbox" class="task-assignee-checkbox" value="${m.id}" ${pendingTaskAssignees.includes(m.id) ? 'checked' : ''} />
      <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${m.color}"></span>
      <span>${escapeHtml(memberLabel(m))}</span>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('.task-assignee-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.value === TASK_ALL) {
        pendingTaskAssignees = cb.checked ? [TASK_ALL] : [];
      } else {
        pendingTaskAssignees = pendingTaskAssignees.filter(id => id !== TASK_ALL);
        if (cb.checked) pendingTaskAssignees.push(cb.value);
        else pendingTaskAssignees = pendingTaskAssignees.filter(id => id !== cb.value);
      }
      renderTaskAssigneeOptions();
    });
  });
}

function openTaskModal() {
  editingTaskId = null;
  document.getElementById('taskDoneBtn').classList.add('hidden');
  setTaskShoppingMode(false);
  document.getElementById('taskModalTitle').textContent = tk('tasks.new');
  document.getElementById('saveTask').textContent = tk('common.save');
  document.getElementById('taskTitleInput').value = '';
  document.getElementById('taskNotesInput').value = '';
  document.getElementById('taskDueDate').value = isoDate(new Date());
  document.getElementById('taskTimeWindowCheckbox').checked = false;
  document.getElementById('taskTimeWindowFields').classList.add('hidden');
  document.getElementById('taskFromTime').value = '';
  document.getElementById('taskToTime').value = '';
  document.getElementById('taskFormStatus').textContent = '';
  pendingTaskAssignees = [];
  if (childLockActive() && currentMember()) pendingTaskAssignees = [currentMember().id];
  renderTaskAssigneeOptions();
  taskRemindLoad('taskRemindPicker', 'task', '');

  // COMMENTED OUT (tasks calendar): the notice "no tasks calendar" is no longer needed.
  document.getElementById('taskNoListHint').classList.add('hidden');
  document.getElementById('saveTask').disabled = false;

  document.getElementById('taskModal').classList.remove('hidden');
  document.getElementById('taskTitleInput').focus();
  armModalSnapshot('taskModal');
}
document.getElementById('openTaskModalBtn').addEventListener('click', () => openTaskModal());
function closeTaskModal() { document.getElementById('taskModal').classList.add('hidden'); }
document.getElementById('cancelTask').addEventListener('click', () => attemptCloseModal('taskModal', closeTaskModal));
wireModalOutsideClick('taskModal', closeTaskModal);
document.getElementById('taskTimeWindowCheckbox').addEventListener('change', (e) => {
  document.getElementById('taskTimeWindowFields').classList.toggle('hidden', !e.target.checked);
});

// Reads the assignment from the "Zugewiesen: ..." line ("Alle" stays "Alle").
function assigneeIdsFromNotes(notes) {
  const match = (notes || '').match(/Zugewiesen:\s*(.+)/);
  if (!match) return [];
  const names = match[1].split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
  if (names.includes('alle')) return [TASK_ALL];
  return members.filter(m => names.includes(memberLabel(m).toLowerCase()) || names.includes(m.name.toLowerCase())).map(m => m.id);
}

function openEditTaskModal(task) {
  const a = task ? aufgaben.find(x => x.id === task.id) : null;
  if (!a) {
    alert(tk('tasks.gone'));
    return;
  }
  editingTaskId = a.id;
  document.getElementById('taskDoneBtn').classList.toggle('hidden', !!a.done);
  document.getElementById('taskModalTitle').textContent = tk('tasks.edit');
  document.getElementById('saveTask').textContent = tk('common.saveChanges');
  document.getElementById('taskTitleInput').value = a.title;
  document.getElementById('taskNotesInput').value = stripAssignedLine(a.notes);
  document.getElementById('taskDueDate').value = a.dueDate || isoDate(new Date());
  const hasTimeWindow = !!(a.fromTime && a.toTime);
  document.getElementById('taskTimeWindowCheckbox').checked = hasTimeWindow;
  document.getElementById('taskTimeWindowFields').classList.toggle('hidden', !hasTimeWindow);
  document.getElementById('taskFromTime').value = hasTimeWindow ? a.fromTime : '';
  document.getElementById('taskToTime').value = hasTimeWindow ? a.toTime : '';
  document.getElementById('taskFormStatus').textContent = '';
  pendingTaskAssignees = assigneeIdsFromNotes(a.notes);
  renderTaskAssigneeOptions();
  taskRemindLoad('taskRemindPicker', 'task', a.remindAt || '');
  // Planned shopping: show the choice of shopping lists as well and make it changeable
  const plan = shoppingPlanForTask(a.id);
  setTaskShoppingMode(!!plan, plan ? plan.listIds.filter(id => getShoppingList(id)) : []);
  taskTitleAuto = false;
  document.getElementById('taskNoListHint').classList.add('hidden');
  document.getElementById('saveTask').disabled = false;
  document.getElementById('taskModal').classList.remove('hidden');
  armModalSnapshot('taskModal');
}

document.getElementById('taskDoneBtn').addEventListener('click', async () => {
  const t = aufgaben.find(x => x.id === editingTaskId);
  if (!t || t.done) return;
  closeTaskModal();
  await toggleTaskDone(t);
});

document.getElementById('saveTask').addEventListener('click', async () => {
  const title = document.getElementById('taskTitleInput').value.trim();
  if (!title) return;
  // Child lock: your own person always stays assigned, otherwise the task would be invisible afterwards
  if (childLockActive() && currentMember() && !pendingTaskAssignees.includes(TASK_ALL) && !pendingTaskAssignees.includes(currentMember().id)) {
    pendingTaskAssignees = [...pendingTaskAssignees, currentMember().id];
  }
  const notes = buildAssignedNotes(document.getElementById('taskNotesInput').value.trim(), pendingTaskAssignees);
  const dueDate = document.getElementById('taskDueDate').value;
  const hasTimeWindow = document.getElementById('taskTimeWindowCheckbox').checked;
  const fromTime = document.getElementById('taskFromTime').value;
  const toTime = document.getElementById('taskToTime').value;
  const statusEl = document.getElementById('taskFormStatus');

  if (!dueDate) { statusEl.textContent = tk('tasks.needDue'); return; }
  if (hasTimeWindow && (!fromTime || !toTime)) { statusEl.textContent = tk('tasks.needWindow'); return; }
  const shoppingMode = taskShoppingMode;
  const planListIds = pendingTaskShoppingLists.filter(id => getShoppingList(id));
  if (shoppingMode && !planListIds.length) { statusEl.textContent = tk('tasks.needList'); return; }

  // New tasks get their ID right here - so they can be created offline as well and
  // submitted later without duplicates.
  const isNew = !editingTaskId;
  const payload = {
    id: editingTaskId || newRecordId(),
    title,
    notes,
    dueDate,
    fromTime: hasTimeWindow ? fromTime : '',
    toTime: hasTimeWindow ? toTime : '',
    remindAt: taskRemindValue('task'),
  };

  queueTaskSave(payload, isNew);
  statusEl.textContent = '';
  document.getElementById('taskModal').classList.add('hidden');
  aufgabenLoaded = true;
  if (shoppingMode) saveShoppingPlan(payload.id, planListIds);
  setTaskShoppingMode(false);
  rebuildAufgaben();
  renderTasks();
  if (shoppingMode && isNew) finShowToast(tk('tasks.shoppingPlanned'));
  await flushOutbox();
  notifyIfQueuedOffline();
});

/* ===== COMMENTED OUT: editing/saving via the Apple tasks calendar =====
async function openEditTaskModal(task) {
  if (!task || !task.pinnHref) {
    alert('Diese Aufgabe kann nicht bearbeitet werden (keine iCloud-Adresse bekannt).');
    return;
  }
  document.getElementById('taskModalTitle').textContent = 'Aufgabe wird geladen …';
  document.getElementById('saveTask').disabled = true;
  document.getElementById('taskModal').classList.remove('hidden');
  try {
    const res = await apiFetch('/api/get-calendar-event-raw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ href: task.pinnHref }),
    });
    const result = await res.json();
    if (result.error) {
      alert('Aufgabe konnte nicht geladen werden: ' + result.error);
      document.getElementById('taskModal').classList.add('hidden');
      return;
    }
    const parsed = parseRawEventForEdit(result.ics);
    editingTaskHref = task.pinnHref;
    editingTaskUid = parsed.uid;
    const isDone = parsed.title.startsWith(DONE_EMOJI);
    document.getElementById('taskTitleInput').value = isDone ? parsed.title.slice(DONE_EMOJI.length) : parsed.title;
    document.getElementById('taskNotesInput').value = parsed.notes;
    document.getElementById('taskDueDate').value = parsed.endDate;
    const hasTimeWindow = !parsed.allDay;
    document.getElementById('taskTimeWindowCheckbox').checked = hasTimeWindow;
    document.getElementById('taskTimeWindowFields').classList.toggle('hidden', !hasTimeWindow);
    document.getElementById('taskFromTime').value = hasTimeWindow ? parsed.startTime : '';
    document.getElementById('taskToTime').value = hasTimeWindow ? parsed.endTime : '';
    pendingTaskAssignees = parsed.assigneeIds;
    renderTaskAssigneeOptions();
    document.getElementById('taskNoListHint').classList.add('hidden');
    document.getElementById('taskModalTitle').textContent = 'Aufgabe bearbeiten';
    document.getElementById('saveTask').textContent = 'Änderungen speichern';
    document.getElementById('taskFormStatus').textContent = '';
    armModalSnapshot('taskModal');
  } catch (err) {
    alert('Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.');
    document.getElementById('taskModal').classList.add('hidden');
  } finally {
    document.getElementById('saveTask').disabled = false;
  }
}

document.getElementById('saveTask_kalender').addEventListener('click', async () => {
  const title = document.getElementById('taskTitleInput').value.trim();
  if (!title) return;
  const notes = buildAssignedNotes(document.getElementById('taskNotesInput').value.trim(), pendingTaskAssignees);
  const dueDate = document.getElementById('taskDueDate').value;
  const hasTimeWindow = document.getElementById('taskTimeWindowCheckbox').checked;
  const fromTime = document.getElementById('taskFromTime').value;
  const toTime = document.getElementById('taskToTime').value;
  const statusEl = document.getElementById('taskFormStatus');

  if (!appleCalendar.taskCalendarName) { statusEl.textContent = 'Bitte zuerst einen Aufgaben-Kalender in den Einstellungen festlegen.'; return; }
  if (!dueDate) { statusEl.textContent = tk('tasks.needDue'); return; }
  if (hasTimeWindow && (!fromTime || !toTime)) { statusEl.textContent = tk('tasks.needWindow'); return; }

  const isEditing = !!editingTaskHref;
  const payload = hasTimeWindow ? {
    title,
    calendarName: appleCalendar.taskCalendarName,
    allDay: false,
    startDate: dueDate, startTime: fromTime,
    endDate: dueDate, endTime: toTime,
    location: '', notes, url: '',
    repeat: 'none', repeatInterval: 1, repeatEnd: 'never', repeatCount: 10, repeatUntil: '',
    alert: 'none',
  } : {
    title,
    calendarName: appleCalendar.taskCalendarName,
    allDay: true,
    startDate: dueDate, startTime: '09:00',
    endDate: dueDate, endTime: '09:00',
    location: '', notes, url: '',
    repeat: 'none', repeatInterval: 1, repeatEnd: 'never', repeatCount: 10, repeatUntil: '',
    alert: 'none',
  };

  const btn = document.getElementById('saveTask');
  btn.disabled = true;
  statusEl.textContent = isEditing ? 'Änderungen werden in iCloud gespeichert …' : 'Wird in iCloud angelegt …';

  try {
    let url = '/api/create-calendar-event';
    let body = payload;
    if (isEditing) {
      url = '/api/update-calendar-event';
      body = { ...payload, href: editingTaskHref, uid: editingTaskUid };
    }
    const res = await apiFetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (result.error) {
      statusEl.textContent = 'Fehler: ' + result.error;
      btn.disabled = false;
      return;
    }
    document.getElementById('taskModal').classList.add('hidden');
    await syncAppleCalendarFile(false);
  } catch (err) {
    statusEl.textContent = 'Verbindung fehlgeschlagen. Bitte NAS/Netzwerk prüfen.';
  } finally {
    btn.disabled = false;
  }
});

===== END COMMENTED OUT ===== */

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('aufgaben');
