/* pinn. – App badge (js/appbadge.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the number of open, due tasks on the app icon (appBadgeSupported, openTaskBadgeCount, setAppBadgeCount,
   updateAppBadge, clearAppBadgeNow) and the timer/listeners that refresh it (every minute while visible, when the app
   comes back to the foreground). While the app is closed the service worker (pb_hooks/sw.pb.js) sets the number. */

/* ---------- App badge: number on the app icon ----------
   Shows the signed-in person's open tasks that are due by now (earlier days +
   today, with a time window only from its start) - the same rule as for „Alle Aufgaben erledigt“.
   Every newly due or newly assigned task counts +1, checking one off -1. While the app is closed
   the service worker sets the number when a push message arrives (value from the server).
   iOS shows the badge only in the home-screen app and only with notifications allowed. */
let appBadgeLast = null;
function appBadgeSupported() {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
}
function openTaskBadgeCount() {
  const me = (typeof currentMember === 'function') ? currentMember() : null;
  if (!me) return null;
  const now = new Date();
  const today = isoDate(now);
  const hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  let n = 0;
  deriveTasks().forEach(t => {
    const done = taskDoneOverrides.has(t.id) ? taskDoneOverrides.get(t.id) : t.done;
    if (done) return;
    if (!t.dueDate || t.dueDate > today) return;
    if (t.dueDate === today && t.fromTime && t.fromTime > hm) return;
    if (assigneesForTask(t).some(m => m.id === me.id)) n++;
  });
  return n;
}
function setAppBadgeCount(n) {
  if (!appBadgeSupported()) return;
  const v = Math.max(0, Number(n) || 0);
  if (v === appBadgeLast) return;
  appBadgeLast = v;
  try {
    const p = v > 0 ? navigator.setAppBadge(v) : navigator.clearAppBadge();
    if (p && typeof p.catch === 'function') p.catch(() => { appBadgeLast = null; });
  } catch (e) { appBadgeLast = null; }
}
function updateAppBadge() {
  try {
    if (!appBadgeSupported() || !aufgabenLoaded) return;
    const n = openTaskBadgeCount();
    if (n === null) return; // Member not loaded yet - don't clear the number by mistake
    setAppBadgeCount(n);
  } catch (e) { /* ignore */ }
}
function clearAppBadgeNow() {
  appBadgeLast = null;
  try {
    if (appBadgeSupported()) { const p = navigator.clearAppBadge(); if (p && p.catch) p.catch(() => { /* ignore */ }); }
  } catch (e) { /* ignore */ }
}
// Time windows („ab 17:30“) and the change of day alter the number even without editing
setInterval(() => { if (document.visibilityState === 'visible') updateAppBadge(); }, 60 * 1000);
document.addEventListener('visibilitychange', () => { appBadgeLast = null; updateAppBadge(); });
window.addEventListener('pageshow', () => { appBadgeLast = null; updateAppBadge(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('appbadge');
