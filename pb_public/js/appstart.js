/* pinn. – js/appstart.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, before js/pinnwand.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.46.0, only the comments were translated):
   - App start – bootApp(): login check, loading the family data and profiles, restrictions by role,
     first view, links from push messages, background timers (calendar, tasks, home/weather, waste)
   index.html only calls this function from js/ausblick.js at the very end, never while it is
   still loading – that is why this file may come after the inline script. */

/* ==========================================================
   App start (after login: data of the own family)
   ========================================================== */
async function bootApp() {
  registerOfflineWorker(); // keep the app on the device so that it also starts offline
  await ensureAuthenticated();
  if (isCurrentUserMainAdmin()) {
    showMainAdminScreen(); // the main admin only manages the families
    return;
  }
  if (!currentUser() || !currentUser().familie) {
    hideDashboardScreen();
    alert('Dein Profil gehört zu keiner Familie. Bitte wende dich an den Hauptadmin.');
    pb.authStore.clear();
    location.reload();
    return;
  }
  try {
    await loadFamilyData();
  } catch (err) {
    console.error('Konnte Familiendaten nicht laden', err);
    hideDashboardScreen();
    alert('Verbindung zum PocketBase-Server (' + PB_URL + ') fehlgeschlagen. Bitte NAS/Netzwerk prüfen und Seite neu laden.');
    return;
  }
  await enforceDashboardPin(); // the family has a dashboard and this profile has no PIN yet: set it now

  await loadFamilyProfiles();
  setTimeout(() => { try { kidStarsHandleUrl(); } catch (e) { /* ignore */ } }, 0);
  // Personal notifications: not on the family dashboard (shared device) and not for guests
  const dashSession = isDashboardSession();
  const guest = isCurrentUserGuest();
  pushAutoSyncEnabled = !dashSession && !isDashboardDevice() && !guest;
  if (pushAutoSyncEnabled) {
    syncPushSubscription().then(() => { if (!pushConfig) loadPushConfig().catch(() => { /* settings later */ }); });
  }
  applyRoleRestrictions();
  applyDashboardChrome();

  document.querySelector('.mode-btn[data-mode="week"]').classList.add('active');
  document.querySelector('.recipe-input-mode-btn[data-mode="freitext"]').classList.add('active');
  document.querySelector('.display-mode-btn[data-display="name"]').classList.add('active');
  renderBottomTabBar();
  renderLastName();
  renderMemberChips();
  document.body.classList.toggle('mobile-mode', isMobile());
  attachSwipeNavigation(document.getElementById('calendarBody'));
  checkForAppUpdate(false); // set the base value for the update detection
  setView('uebersicht');
  openDashboardKidPageIfNeeded(); // child profile on the dashboard: go straight to the kids page
  setTimeout(() => { try { bdayCheck(); } catch (e) { /* ignore */ } }, 1500); // birthday: play Happy Birthday once
  setTimeout(() => { try { if (!new URLSearchParams(location.search).get('wobistdu')) wbCheckIncoming(); } catch (e) { /* ignore */ } }, 2500); // open "Where are you?" question
  vtOpenFromUrl(); // from a push reminder: open the contract directly
  if (!guest) kasseOpenFromUrl(); // from a push message: open the cash box
  pwAfterBoot(); // Pinboard: tidy the archive, upload the queued photos, open the note from a push message
  docOpenFromUrl(); // from a push reminder: open the document directly
  sysOpenFromUrl(); // from the update push message: Settings → System with the update popup
  famOpenFromUrl(); // from a location message: open Family with the person on the map
  sosStart(); // SOS from Traccar Client: check running alarms, open ?sos=<ID> from the push message
  googleReturnFromUrl(); // return from the Google login (Android calendar): open the calendar settings
  hideDashboardScreen();
  if (dashSession) startDashboardIdleWatch();

  await syncAppleCalendarFile(true);
  await loadAufgaben(); // also submits tasks/events created offline
  ntStart(); // Bell: open expenses of planned shopping trips, news; supply shop addresses later
  if (!guest) loadAusgaben(); // load Finances in the background (and submit anything booked offline)
  if (!guest) docStart(); // Documents: submit anything filed offline
  if (!guest) fzStart(); // Vehicles: create a task for due inspection (HU), service, tyre change …
  setInterval(() => syncAppleCalendarFile(false), 60 * 1000); // check for changes every 60 s
  setInterval(() => { if (document.visibilityState === 'visible') loadAufgaben(); }, 60 * 1000); // tasks from other devices
  setInterval(pullRemoteChanges, 60 * 1000); // fetch changes from other devices
  setInterval(() => { if (document.visibilityState === 'visible' && currentView === 'finanzen') loadAusgaben(); }, 60 * 1000); // expenses from other devices
  document.getElementById('refreshCalendarBtn').addEventListener('click', () => triggerFullCalendarResync());

  // Home (weather, public/school holidays, sun times): first the state from the device, then from the server
  homeLoadCache(outboxFamily());
  hcInvalidate();
  rebuildEvents();
  renderCalendar();
  initWeather();
  loadHome().then(() => hcLoadSchoolHolidays(false));
  muellLoadCache(outboxFamily());
  if (muellData) { rebuildEvents(); renderCalendar(); }
  loadMuell(false);
  setInterval(() => { initWeather(); loadHome(); hcLoadSchoolHolidays(false); loadMuell(false); }, 30 * 60 * 1000); // fetch again every 30 minutes

  migrateEmbeddedRecipeImages(); // move old embedded recipe images out in the background
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('appstart');
