/* pinn. – Family dashboard: opened profile and role restrictions (js/dashboardsitzung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: back to the profile selection after inactivity (noteDashboardActivity, checkDashboardIdle, startDashboardIdleWatch), the dashboard chrome (applyDashboardChrome, openDashboardKidPageIfNeeded), applying guest and child lock restrictions to the menus and tasks (applyRoleRestrictions) and choosing the guest menus (renderGuestMenuSettings). */

/* ---------- Inside an opened profile: back to the profile selection, automatically after inactivity ---------- */
let dashLastActivity = Date.now();
let dashIdleTimer = null;
function noteDashboardActivity() { dashLastActivity = Date.now(); }
function checkDashboardIdle() {
  if (!isDashboardSession()) return;
  const minutes = dashboardTimeoutMinutes();
  if (!minutes) return;
  if (Date.now() - dashLastActivity >= minutes * 60 * 1000) returnToDashboard();
}
function startDashboardIdleWatch() {
  noteDashboardActivity();
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(ev =>
    document.addEventListener(ev, noteDashboardActivity, { capture: true, passive: true }));
  clearInterval(dashIdleTimer);
  dashIdleTimer = setInterval(checkDashboardIdle, 15 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDashboardIdle(); });
}
// button in the header, kids' page and "Abmelden" adjusted for the dashboard
function applyDashboardChrome() {
  const dashSession = isDashboardSession();
  document.getElementById('dashHomeBtn').classList.toggle('hidden', !dashSession);
  document.getElementById('logoutBtn').textContent = dashSession ? 'Zur Profilauswahl' : 'Abmelden';
  const kidClose = document.getElementById('kidPageClose');
  if (isDashboardKidSession()) {
    kidClose.textContent = '🏠';
    kidClose.setAttribute('aria-label', 'Zurück zur Profilauswahl');
  }
}
document.getElementById('dashHomeBtn').addEventListener('click', returnToDashboard);
// kid profile at the dashboard: open the kids' page right away
function openDashboardKidPageIfNeeded() {
  const kidId = dashboardKidMemberId();
  if (!kidId) return;
  const m = memberById(kidId);
  if (m && isKidPageEnabled(m)) openKidPage(kidId);
  else ssSet(SS_DASH_KID, null); // the kids' page does not exist (any more) - normal profile
}
// guests: hide finances, settings and the menus chosen by the admin
function applyRoleRestrictions() {
  document.body.classList.toggle('child-lock', childLockActive());
  // child lock on/off or family members reloaded: filter the tasks again
  try {
    if (aufgabenLoaded && (childLockActive() || (childLockTasksState !== null && childLockTasksState !== childLockActive()))) {
      rebuildAufgaben();
      renderTasks();
    }
  } catch (e) { /* tasks not ready yet */ }
  document.querySelectorAll('#sidebar .nav-item').forEach(b => b.classList.toggle('hidden', !isViewAllowed(b.dataset.view)));
  // only show separators between visible groups
  const items = [...document.querySelectorAll('#sidebarScroll > .nav-item, #sidebarScroll > .nav-divider')];
  let seenVisible = false;
  items.forEach((el, i) => {
    if (!el.classList.contains('nav-divider')) {
      if (!el.classList.contains('hidden')) seenVisible = true;
      return;
    }
    const laterVisible = items.slice(i + 1).some(x => !x.classList.contains('nav-divider') && !x.classList.contains('hidden'));
    el.classList.toggle('hidden', !(seenVisible && laterVisible));
  });
  if (typeof currentView !== 'undefined' && currentView && familyRecordId && !isViewAllowed(currentView)) setView(firstAllowedView());
  // overview open and the admin just showed or hid the calendar for guests: rebuild it
  else if (typeof currentView !== 'undefined' && currentView === 'uebersicht' && familyRecordId &&
           lastOverviewCalendarHidden !== null && lastOverviewCalendarHidden !== isCalendarHiddenForGuest()) setView('uebersicht');
}
// admins: choose which menus guests see
function renderGuestMenuSettings() {
  const wrap = document.getElementById('guestMenuWrap');
  const list = document.getElementById('guestMenuList');
  if (!wrap || !list) return;
  wrap.classList.toggle('hidden', !isCurrentUserAdmin());
  if (!isCurrentUserAdmin()) return;
  const tabs = GUEST_SELECTABLE_VIEWS.map(id => ALL_MENU_TABS.find(t => t.id === id)).filter(Boolean);
  list.innerHTML = tabs.map(t => `
    <label class="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink/10 bg-white text-sm cursor-pointer select-none">
      <input type="checkbox" class="guest-menu-check w-4 h-4" data-view="${t.id}" ${guestHiddenViews.includes(t.id) ? '' : 'checked'} />
      <span>${t.icon} ${escapeHtml(t.label)}</span>
    </label>`).join('');
  list.querySelectorAll('.guest-menu-check').forEach(cb => cb.addEventListener('change', () => {
    const hidden = [...list.querySelectorAll('.guest-menu-check')].filter(x => !x.checked).map(x => x.dataset.view);
    guestHiddenViews = GUEST_SELECTABLE_VIEWS.filter(id => hidden.includes(id));
    persistState();
    document.getElementById('guestMenuStatus').textContent = hidden.length === GUEST_SELECTABLE_VIEWS.length
      ? 'Gespeichert. Gäste sehen damit nur noch ihr Konto.'
      : 'Gespeichert.';
  }));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dashboardsitzung');
