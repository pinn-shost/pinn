/* pinn. – Offline queue for tasks and appointments (js/offline.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the offline queue (localStorage "pinn.outbox": outbox…, queueTask…, queueEvent…, flushOutbox – sends the
   actions in order as soon as the server is reachable again), the cached tasks and calendar file (writeAufgabenCache,
   readAufgabenCache, writeIcsCache, readIcsCache, loadEventIcsForEdit), queued appointments in iCal form
   (buildLocalEventIcs, pendingEventsFromPayload), rebuilding the shown tasks and appointments from the server state plus
   pending actions (rebuildAufgaben, rebuildEvents) and registering the service worker for the offline start
   (registerOfflineWorker). Reminders/input tasks, the app badge and trips are in js/aufgabenextras.js, js/appbadge.js
   and js/reisen.js. */

/* ==========================================================
   Offline queue for tasks and appointments
   ----------------------------------------------------------
   Creating, changing, checking off and deleting tasks as well as creating, changing and deleting
   appointments also work without a connection: every action is first saved on the device
   (localStorage "pinn.outbox") and shown right away. As soon as the server can be reached again,
   the actions are sent one after the other - even after the app has been restarted.
   New tasks and appointments get their ID on the device already. If an action is sent again after
   a dropped connection, this does not create a duplicate entry.
   The most recently loaded tasks and appointments are cached so they are shown offline too
   (e.g. after a restart without network).
   ========================================================== */
const LS_OUTBOX = 'pinn.outbox';
const LS_AUFGABEN_CACHE = 'pinn.aufgabenCache';
const LS_ICS_CACHE = 'pinn.icsCache';
const LS_PROFILE_CACHE = 'pinn.profileCache';
const OFFLINE_DATA_CACHE = 'pinn-daten';
const OFFLINE_EVENT_PREFIX = 'pinn-offline:';
const PENDING_MARK = '\u23F3 ';
let outboxMemory = [];
let outboxFlushing = false;
let outboxRerun = false;
let outboxRetryTimer = null;
let outboxBlocked = false; // last attempt did not go through (offline / server not reachable)
let aufgabenServer = []; // tasks as last delivered by the server
let eventsServer = [];   // appointments from the most recently loaded kalender.ics
let icsCacheText = '';

function outboxFamily() { return (currentUser() && currentUser().familie) || ''; }
function outboxReadAll() {
  try {
    const raw = localStorage.getItem(LS_OUTBOX);
    if (raw) { const list = JSON.parse(raw); if (Array.isArray(list)) return list; }
  } catch (e) { /* localStorage may not be available */ }
  return outboxMemory;
}
function outboxWriteAll(list) {
  outboxMemory = list;
  try {
    if (list.length) localStorage.setItem(LS_OUTBOX, JSON.stringify(list));
    else localStorage.removeItem(LS_OUTBOX);
  } catch (e) { /* in memory only */ }
}
// Only the actions of the own family (in case someone else was signed in on this device)
function outboxRead() { const f = outboxFamily(); return outboxReadAll().filter(op => op.familie === f); }
function outboxReplaceOwn(list) {
  const f = outboxFamily();
  outboxWriteAll([...outboxReadAll().filter(op => op.familie !== f), ...list]);
}
function outboxNewOp(op) {
  return { opId: newRecordId(), familie: outboxFamily(), at: Date.now(), tries: 0, ...op };
}
function outboxHasPending() { try { return outboxRead().length > 0; } catch (e) { return false; } }

function refreshOfflineBadge() {
  const badge = document.getElementById('offlineBadge');
  if (!badge) return;
  const familyOffline = familySyncState === 'offline' || familySyncState === 'error';
  badge.classList.toggle('hidden', !(familyOffline || (outboxBlocked && outboxHasPending())));
}

// Short notice when an action could only be saved on the device for now
function notifyIfQueuedOffline() {
  if (outboxBlocked && outboxHasPending()) finShowToast('Ohne Verbindung gespeichert – wird automatisch nachgetragen.');
}

/* ---------- Tasks: queue actions ---------- */
function queueTaskSave(data, isNew) {
  const list = outboxRead();
  const prev = list.find(op => op.kind === 'task-save' && op.data && op.data.id === data.id);
  if (prev) {
    prev.data = { ...data, neu: !!(isNew || prev.data.neu) }; // replace in the same place (order is kept)
    prev.tries = 0;
  } else {
    list.push(outboxNewOp({ kind: 'task-save', data: { ...data, neu: !!isNew } }));
  }
  outboxReplaceOwn(list);
}
function queueTaskDone(id, done) {
  const list = outboxRead().filter(op => !(op.kind === 'task-done' && op.id === id));
  list.push(outboxNewOp({ kind: 'task-done', id, done: !!done }));
  outboxReplaceOwn(list);
}
function queueTaskDelete(id) {
  const all = outboxRead();
  const wasOnlyLocal = all.some(op => op.kind === 'task-save' && op.data && op.data.id === id && op.data.neu);
  const list = all.filter(op => !((op.kind === 'task-save' && op.data && op.data.id === id) || ((op.kind === 'task-done' || op.kind === 'task-delete') && op.id === id)));
  if (!wasOnlyLocal) list.push(outboxNewOp({ kind: 'task-delete', id }));
  outboxReplaceOwn(list);
}

// Server state + own actions still pending = tasks shown
function rebuildAufgaben() {
  const map = new Map(aufgabenServer.map(a => [a.id, { ...a }]));
  outboxRead().forEach(op => {
    if (op.kind === 'task-save' && op.data) {
      const d = op.data;
      const old = map.get(d.id);
      if (!old && !d.neu) return; // deleted on the server in the meantime
      map.set(d.id, {
        ...(old || { done: false, doneAt: '', household: '', missed: 0 }),
        id: d.id, title: d.title, notes: d.notes, dueDate: d.dueDate, fromTime: d.fromTime || '', toTime: d.toTime || '',
        remindAt: d.remindAt !== undefined ? (d.remindAt || '') : ((old && old.remindAt) || ''),
        pending: true,
      });
    } else if (op.kind === 'task-done') {
      const old = map.get(op.id);
      if (old) map.set(op.id, { ...old, done: !!op.done, doneAt: op.done ? new Date(op.at).toISOString() : '', pending: true });
    } else if (op.kind === 'task-delete') {
      map.delete(op.id);
    }
  });
  childLockTasksState = childLockActive();
  aufgaben = [...map.values()].filter(childLockTaskVisible);
  updateAppBadge();
}

function writeAufgabenCache() {
  try { localStorage.setItem(LS_AUFGABEN_CACHE, JSON.stringify({ familie: outboxFamily(), list: aufgabenServer })); } catch (e) { /* ignore */ }
}
function readAufgabenCache() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_AUFGABEN_CACHE) || 'null');
    if (c && c.familie === outboxFamily() && Array.isArray(c.list)) return c.list;
  } catch (e) { /* ignore */ }
  return null;
}

/* ---------- Appointments: queue actions ---------- */
function newOfflineEventUid() {
  return 'pinn-' + Date.now() + '-' + newRecordId().slice(0, 8);
}
function queueEventCreate(payload) {
  const list = outboxRead();
  list.push(outboxNewOp({ kind: 'event-create', uid: newOfflineEventUid(), payload }));
  outboxReplaceOwn(list);
}
function queueEventUpdate(href, uid, payload) {
  const list = outboxRead();
  if (href.startsWith(OFFLINE_EVENT_PREFIX)) {
    // Appointment was itself only created offline: simply change the queued creation
    const localUid = href.slice(OFFLINE_EVENT_PREFIX.length);
    const create = list.find(op => op.kind === 'event-create' && op.uid === localUid);
    if (create) { create.payload = payload; create.tries = 0; }
    else list.push(outboxNewOp({ kind: 'event-create', uid: localUid, payload }));
  } else {
    const prev = list.find(op => op.kind === 'event-update' && op.href === href);
    if (prev) { prev.payload = payload; prev.uid = uid || prev.uid; prev.tries = 0; }
    else list.push(outboxNewOp({ kind: 'event-update', href, uid, payload }));
  }
  outboxReplaceOwn(list);
}
function queueEventDelete(href) {
  let list = outboxRead();
  if (href.startsWith(OFFLINE_EVENT_PREFIX)) {
    const localUid = href.slice(OFFLINE_EVENT_PREFIX.length);
    list = list.filter(op => !(op.kind === 'event-create' && op.uid === localUid));
  } else {
    list = list.filter(op => !((op.kind === 'event-update' || op.kind === 'event-delete') && op.href === href));
    list.push(outboxNewOp({ kind: 'event-delete', href }));
  }
  outboxReplaceOwn(list);
}
function pendingEventOpForHref(href) {
  const ops = outboxRead();
  if (href.startsWith(OFFLINE_EVENT_PREFIX)) {
    const localUid = href.slice(OFFLINE_EVENT_PREFIX.length);
    return ops.find(op => op.kind === 'event-create' && op.uid === localUid) || null;
  }
  return ops.find(op => op.kind === 'event-update' && op.href === href) || null;
}

// Builds an appointment in iCal format from the form data (like the server in calendar-sync.js),
// so queued appointments can be shown and edited just like real ones.
function escapeLocalICSText(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function buildLocalEventIcs(ev, uid, href) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//pinn//DE', 'BEGIN:VEVENT'];
  lines.push('X-PINN-HREF:' + href);
  lines.push('X-PINN-CALNAME:' + (ev.calendarName || ''));
  lines.push('UID:' + uid);
  lines.push('SUMMARY:' + escapeLocalICSText(ev.title));
  const d = (x) => String(x || '').replace(/-/g, '');
  if (ev.allDay) {
    lines.push('DTSTART;VALUE=DATE:' + d(ev.startDate));
    lines.push('DTEND;VALUE=DATE:' + d(addDaysToDateStr(ev.endDate || ev.startDate, 1)));
  } else {
    lines.push('DTSTART:' + d(ev.startDate) + 'T' + String(ev.startTime || '00:00').replace(':', '') + '00');
    lines.push('DTEND:' + d(ev.endDate) + 'T' + String(ev.endTime || ev.startTime || '00:00').replace(':', '') + '00');
  }
  if (ev.location) lines.push('LOCATION:' + escapeLocalICSText(ev.location));
  if (ev.notes) lines.push('DESCRIPTION:' + escapeLocalICSText(ev.notes));
  if (ev.url) lines.push('URL:' + ev.url);
  if (ev.repeat && ev.repeat !== 'none') {
    let rrule = 'FREQ=' + String(ev.repeat).toUpperCase();
    if (ev.repeatInterval && ev.repeatInterval > 1) rrule += ';INTERVAL=' + ev.repeatInterval;
    if (ev.repeatEnd === 'count' && ev.repeatCount) rrule += ';COUNT=' + ev.repeatCount;
    if (ev.repeatEnd === 'until' && ev.repeatUntil) rrule += ';UNTIL=' + d(ev.repeatUntil) + 'T000000Z';
    lines.push('RRULE:' + rrule);
  }
  if (ev.alert && ev.alert !== 'none') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Erinnerung', 'TRIGGER:-PT' + parseInt(ev.alert, 10) + 'M', 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}
function pendingEventsFromPayload(payload, uid, href) {
  const mark = outboxBlocked ? PENDING_MARK : '';
  try {
    return parseICS(buildLocalEventIcs(payload, uid, href)).map(e => ({ ...e, title: mark + e.title, pinnPending: true }));
  } catch (e) { return []; }
}

// Server state + own actions still pending = appointments shown
function rebuildEvents() {
  let school = [];
  try { school = schoolCalendarEvents(); } catch (e) { school = []; }
  try { school = school.concat(tripCalendarEvents()); } catch (e) { /* lists not loaded yet */ }
  const extra = homeCalendarEvents().concat(muellCalendarEvents(), school); // Public & school holidays (Home), waste calendar, school & daycare
  const ops = outboxRead().filter(op => op.kind === 'event-create' || op.kind === 'event-update' || op.kind === 'event-delete');
  if (!ops.length) { events = extra.length ? eventsServer.concat(extra) : eventsServer; return; }
  const replaced = new Set(ops.filter(op => op.kind !== 'event-create').map(op => op.href));
  let list = eventsServer.filter(e => !replaced.has(e.pinnHref));
  ops.forEach(op => {
    if (op.kind === 'event-create') list = list.concat(pendingEventsFromPayload(op.payload, op.uid, OFFLINE_EVENT_PREFIX + op.uid));
    else if (op.kind === 'event-update') list = list.concat(pendingEventsFromPayload(op.payload, op.uid, op.href));
  });
  events = extra.length ? list.concat(extra) : list;
}

// Cache the calendar file on the device (Cache Storage, otherwise localStorage)
function icsCacheKey() { return '/__pinn-offline/kalender/' + encodeURIComponent(outboxFamily()); }
async function writeIcsCache(text) {
  try {
    if (window.caches) {
      const c = await caches.open(OFFLINE_DATA_CACHE);
      await c.put(icsCacheKey(), new Response(text, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } }));
      return;
    }
  } catch (e) { /* fall back to localStorage */ }
  try { localStorage.setItem(LS_ICS_CACHE, JSON.stringify({ familie: outboxFamily(), text })); } catch (e) { /* too big - ignore */ }
}
async function readIcsCache() {
  try {
    if (window.caches) {
      const c = await caches.open(OFFLINE_DATA_CACHE);
      const r = await c.match(icsCacheKey());
      if (r) return await r.text();
    }
  } catch (e) { /* fall back to localStorage */ }
  try {
    const c = JSON.parse(localStorage.getItem(LS_ICS_CACHE) || 'null');
    if (c && c.familie === outboxFamily() && typeof c.text === 'string') return c.text;
  } catch (e) { /* ignore */ }
  return '';
}
// Raw data of an appointment from the cached calendar file (for "Bearbeiten" without network)
function cachedRawEventIcs(href) {
  if (!icsCacheText || !href) return '';
  const blocks = unfoldICS(icsCacheText).split('BEGIN:VEVENT').slice(1).map(b => 'BEGIN:VEVENT' + b.split('END:VEVENT')[0] + 'END:VEVENT');
  const mine = blocks.filter(b => b.split('\n').some(l => l.trim() === 'X-PINN-HREF:' + href));
  if (!mine.length) return '';
  const master = mine.find(b => !/\nRECURRENCE-ID/.test(b)) || mine[0];
  return 'BEGIN:VCALENDAR\nVERSION:2.0\n' + master + '\nEND:VCALENDAR';
}
// Returns the iCal text of an appointment for editing: queued change > server > cache
async function loadEventIcsForEdit(href) {
  const op = pendingEventOpForHref(href);
  if (op) return buildLocalEventIcs(op.payload, op.uid, href);
  let res = null, result = null;
  try {
    res = await apiFetch('/api/get-calendar-event-raw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ href }),
    });
    if (res.ok) result = await res.json().catch(() => null);
  } catch (e) { res = null; }
  if (result && result.error) throw new Error(result.error);
  if (result && result.ics) return result.ics;
  const cached = cachedRawEventIcs(href); // offline or server not reachable
  if (cached) return cached;
  throw new Error('Ohne Verbindung sind die Details dieses Termins nicht verfügbar.');
}

/* ---------- Sending queued actions ---------- */
async function outboxPost(url, payload) {
  const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 400 && body.error) return { error: body.error };
  if (!res.ok) { const err = new Error('HTTP ' + res.status); err.retry = true; throw err; } // server/proxy not ready
  if (body.error) return { error: body.error };
  return body;
}

async function sendOutboxOp(op) {
  if (op.kind === 'task-save') {
    const r = await outboxPost('/api/pinn/aufgaben/speichern', op.data);
    if (r.error) return r;
    if (r.aufgabe) aufgabenServer = [...aufgabenServer.filter(a => a.id !== r.aufgabe.id), r.aufgabe];
    return { ok: true, task: true };
  }
  if (op.kind === 'task-done') {
    const r = await outboxPost('/api/pinn/aufgaben/erledigt', { id: op.id, done: op.done });
    if (r.error) return r;
    if (r.aufgabe) aufgabenServer = aufgabenServer.map(a => (a.id === r.aufgabe.id ? r.aufgabe : a));
    if (op.done) scheduleDelayedPush(); // the done notification goes out 10 seconds later
    return { ok: true, task: true };
  }
  if (op.kind === 'task-delete') {
    const r = await outboxPost('/api/pinn/aufgaben/loeschen', { id: op.id });
    if (r.error) return r;
    aufgabenServer = aufgabenServer.filter(a => a.id !== op.id);
    return { ok: true, task: true };
  }
  if (op.kind === 'event-create') {
    const r = await outboxPost('/api/create-calendar-event', { ...op.payload, clientUid: op.uid });
    return r.error ? { ...r, event: true } : { ok: true, event: true };
  }
  if (op.kind === 'event-update') {
    const r = await outboxPost('/api/update-calendar-event', { ...op.payload, href: op.href, uid: op.uid });
    return r.error ? { ...r, event: true } : { ok: true, event: true };
  }
  if (op.kind === 'event-delete') {
    const r = await outboxPost('/api/delete-calendar-event', { href: op.href });
    return r.error ? { ...r, event: true } : { ok: true, event: true };
  }
  return { ok: true }; // unknown action - discard
}

function outboxOpLabel(op) {
  if (op.kind.startsWith('task-')) {
    const title = op.data ? op.data.title : ((aufgaben.find(a => a.id === op.id) || {}).title || '');
    return 'Aufgabe' + (title ? ' "' + title + '"' : '');
  }
  const title = op.payload ? op.payload.title : '';
  return 'Termin' + (title ? ' "' + title + '"' : '');
}

async function flushOutbox() {
  if (outboxFlushing) { outboxRerun = true; return; }
  if (!pb.authStore.isValid || !outboxFamily() || !familyRecordId) return;
  if (!outboxRead().length) { outboxBlocked = false; refreshOfflineBadge(); return; }
  outboxFlushing = true;
  let taskChanged = false, eventChanged = false, blocked = false;
  try {
    for (let guard = 0; guard < 300; guard++) {
      const ops = outboxRead();
      if (!ops.length) break;
      const op = ops[0];
      let r;
      try {
        r = await sendOutboxOp(op);
      } catch (err) {
        blocked = true; // no connection - keep the order and try again later
        break;
      }
      if (r.task) taskChanged = true;
      if (r.event) eventChanged = true;
      if (r.error) {
        // Task errors are final (e.g. deleted in the meantime). For appointments iCloud may also
        // be unreachable for a moment - so give up there only after the third attempt.
        const isEvent = op.kind.startsWith('event-');
        const tries = (op.tries || 0) + 1;
        if (isEvent && tries < 3) {
          outboxReplaceOwn(outboxRead().map(o => (o.opId === op.opId ? { ...o, tries } : o)));
          blocked = true;
          break;
        }
        finShowToast(outboxOpLabel(op) + ' konnte nicht übertragen werden: ' + r.error, true);
        taskChanged = taskChanged || !isEvent;
        eventChanged = eventChanged || isEvent;
      }
      outboxReplaceOwn(outboxRead().filter(o => o.opId !== op.opId));
    }
  } finally {
    outboxFlushing = false;
  }
  outboxBlocked = blocked;
  refreshOfflineBadge();
  if (taskChanged) writeAufgabenCache();
  rebuildAufgaben();
  renderTasks();
  if (eventChanged) await syncAppleCalendarFile(false); // fetches the new calendar file and shows it
  else { rebuildEvents(); renderCalendar(); }
  clearTimeout(outboxRetryTimer);
  if (blocked && outboxRead().length) outboxRetryTimer = setTimeout(flushOutbox, 20 * 1000);
  if (outboxRerun) { outboxRerun = false; flushOutbox(); }
}
window.addEventListener('online', () => flushOutbox());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') flushOutbox(); });

// Register the service worker right at start: it keeps the app (page, icons, fonts, scripts)
// on the device so pinn. also starts without a connection.
function registerOfflineWorker() {
  try {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.getRegistration('/')
      .then(reg => reg || navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }))
      .then(reg => { if (reg && navigator.onLine) reg.update().catch(() => { /* ignore */ }); })
      .catch(() => { /* continue without offline start */ });
  } catch (e) { /* ignore */ }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('offline');
