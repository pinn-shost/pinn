/* pinn. – Calendar file from the server (js/kalenderdatei.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: syncAppleCalendarFile (loads kalender.ics, skips unchanged files, falls back to the device cache when offline)
   and the sync status line under Settings (updateCalendarSyncStatus). */

var icsLastParsedAt = 0;
async function syncAppleCalendarFile(showErrors) {
  try {
    const res = await apiFetch(ICS_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    // Save energy: don't re-read and redraw an unchanged calendar file every time
    // (still at least every 10 minutes, so e.g. "today" is right after midnight)
    if (!showErrors && text === icsCacheText && icsLastParsedAt && Date.now() - icsLastParsedAt < 10 * 60 * 1000) {
      lastIcsSync = new Date();
      updateCalendarSyncStatus();
      return;
    }
    eventsServer = parseICS(text);
    setPinnCals(readPinnCalsFromIcs(text));
    icsLastParsedAt = Date.now();
    if (text !== icsCacheText) { icsCacheText = text; writeIcsCache(text); }
    rebuildEvents();
    lastIcsSync = new Date();
    updateCalendarSyncStatus();
    renderCalendar();
    renderTasks();
  } catch (err) {
    console.error('Apple-Kalender-Import fehlgeschlagen', err);
    // Without a connection: show the most recently loaded calendar file from the device
    if (!icsCacheText) {
      const cached = await readIcsCache();
      if (cached) {
        icsCacheText = cached;
        try { eventsServer = parseICS(cached); } catch (e) { eventsServer = []; }
        setPinnCals(readPinnCalsFromIcs(cached));
      }
    }
    rebuildEvents();
    renderCalendar();
    renderTasks();
    if (showErrors) updateCalendarSyncStatus(err);
  }
}
function updateCalendarSyncStatus(err) {
  const el = document.getElementById('icsSyncStatus');
  if (!el) return;
  if (err) {
    el.textContent = 'Konnte kalender.ics nicht laden (' + err.message + ')';
    el.classList.add('text-red-500');
  } else {
    el.textContent = lastIcsSync
      ? ('Zuletzt geladen um ' + lastIcsSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' · ' + events.length + ' Termine')
      : 'Noch nicht geladen';
    el.classList.remove('text-red-500');
  }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kalenderdatei');
