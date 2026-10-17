/* pinn. – Task data (js/aufgabendaten.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the task constants (TASK_ALL, DONE_EMOJI), loading the tasks from the NAS (loadAufgaben – cached state
   first, offline queue, no redraw when nothing changed), deriveTasks, assigneesForTask and fmtDateTime. The old variant
   via the Apple tasks calendar is kept commented out. The task list and popup are in js/aufgaben.js, the server logic
   in pb_hooks/pinn-aufgaben.js. */

/* ==========================================================
   Tasks - now stored directly on the NAS (PocketBase collection "aufgaben", server logic in
   pb_hooks/pinn-aufgaben.js). No more iCloud access when creating, checking off or deleting.
   The earlier variant via the Apple tasks calendar is commented out below.
   ========================================================== */
const TASK_ALL = '__all__';
const DONE_EMOJI = '\u2705 ';

var aufgabenLastRaw = '';
var aufgabenLastRenderAt = 0;
async function loadAufgaben() {
  // The first time, show the cached state right away (important without a connection)
  if (!aufgabenLoaded) {
    const cached = readAufgabenCache();
    if (cached) { aufgabenServer = cached; aufgabenLoaded = true; rebuildAufgaben(); renderTasks(); }
  }
  const hadPending = outboxHasPending();
  await flushOutbox(); // submit what was created/changed offline first
  try {
    const res = await apiFetch('/api/pinn/aufgaben', { cache: 'no-store' });
    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result.aufgaben) && !result.error) {
        // Saving energy: same state as last time -> do not redraw (but at the latest every 10 minutes)
        const raw = JSON.stringify(result.aufgaben);
        if (aufgabenLoaded && raw === aufgabenLastRaw && !hadPending && !outboxHasPending()
            && Date.now() - aufgabenLastRenderAt < 10 * 60 * 1000) {
          try { if (typeof ntActFetch === 'function') ntActFetch(false); } catch (e) { /* Bell not ready yet */ }
          return;
        }
        aufgabenLastRaw = raw;
        aufgabenServer = result.aufgaben;
        aufgabenLoaded = true;
        writeAufgabenCache();
        pruneShoppingPlans();
      }
    }
  } catch (err) {
    // Offline or NAS not reachable - keep working with the cached state
  }
  if (!aufgabenLoaded && outboxHasPending()) aufgabenLoaded = true; // show tasks created offline anyway
  rebuildAufgaben();
  renderTasks();
  aufgabenLastRenderAt = Date.now();
  try { if (typeof ntActFetch === 'function') ntActFetch(false); } catch (e) { /* Bell not ready yet */ }
}

function deriveTasks() {
  return aufgaben.map(a => ({
    id: a.id,
    title: a.title,
    description: a.notes,
    dueDate: a.dueDate,
    hasTimeWindow: !!(a.fromTime && a.toTime),
    fromTime: a.fromTime,
    toTime: a.toTime,
    done: !!a.done,
    household: a.household || '',
    missed: a.missed || 0,
    remindAt: a.remindAt || '',
    pending: !!a.pending,
  }));
}

/* ===== COMMENTED OUT: tasks from the Apple tasks calendar =====
// Derives the task list directly from the loaded calendar events (no separate
// sync/storage needed) - only events from the calendar marked as "Aufgaben-Kalender" (tasks calendar).
function deriveTasksFromEvents() {
  if (!appleCalendar.taskCalendarName) return [];
  return events
    .filter(ev => ev.pinnCalName === appleCalendar.taskCalendarName)
    .map(ev => {
      const done = ev.title.startsWith(DONE_EMOJI);
      return {
        id: ev.id,
        pinnHref: ev.pinnHref,
        title: done ? ev.title.slice(DONE_EMOJI.length) : ev.title,
        description: ev.description,
        dueDate: ev.date,
        hasTimeWindow: !ev.fullDayFiller && !!ev.time,
        fromTime: ev.time,
        toTime: ev.endTime,
        done: done,
      };
    });
}
===== END COMMENTED OUT ===== */

function assigneesForTask(task) {
  return getAssignedMembersForEvent(task);
}

function fmtDateTime(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const dateLabel = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  return timeStr ? `${dateLabel}, ${timeStr} Uhr` : dateLabel;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('aufgabendaten');
