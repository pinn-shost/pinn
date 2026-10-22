/* pinn. – Login and logout (js/anmeldung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: changing the own password (changeOwnPassword), the forced password change (showForcePasswordScreen), making sure a profile is logged in (ensureAuthenticated, incl. the family dashboard) and logout (logout). ensureAuthenticated is called by bootApp in js/appstart.js, only after everything has loaded. */

async function changeOwnPassword(oldPassword, newPassword) {
  const res = await apiFetch('/api/pinn/password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new Error(body.error || body.message || 'Passwort konnte nicht geändert werden.');
  pb.authStore.save(body.token, body.record); // the server replaced the old login
}

function showForcePasswordScreen() {
  return new Promise(resolve => {
    const screen = document.getElementById('forcePasswordScreen');
    const oldWrap = document.getElementById('forcePasswordOldWrap');
    const err = document.getElementById('forcePasswordError');
    oldWrap.classList.toggle('hidden', !!lastLoginPassword);
    screen.classList.remove('hidden');
    document.getElementById('forcePasswordForm').onsubmit = async (ev) => {
      ev.preventDefault();
      const oldPw = lastLoginPassword || document.getElementById('forcePasswordOld').value;
      const newPw = document.getElementById('forcePasswordNew').value;
      const repeat = document.getElementById('forcePasswordRepeat').value;
      err.classList.add('hidden');
      if (newPw.length < 8) { err.textContent = 'Mindestens 8 Zeichen.'; err.classList.remove('hidden'); return; }
      if (newPw !== repeat) { err.textContent = 'Die beiden neuen Passwörter stimmen nicht überein.'; err.classList.remove('hidden'); return; }
      try {
        await changeOwnPassword(oldPw, newPw);
        lastLoginPassword = null;
        screen.classList.add('hidden');
        resolve();
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
        if (/aktuelle Passwort/.test(e.message)) { lastLoginPassword = null; oldWrap.classList.remove('hidden'); }
      }
    };
  });
}

// Before loading the data, make sure a profile is logged in.
async function ensureAuthenticated() {
  // Family dashboard: profile selection instead of login. A profile opened at the dashboard only counts
  // while the app is open (sessionStorage) - after that the profile selection appears again.
  const dash = readDashboardConfig();
  if (dash) {
    if (ssGet(SS_DASH_ACTIVE) !== '1') pb.authStore.clear();
    if (pb.authStore.isValid) {
      try {
        await pb.collection(PINN_USERS).authRefresh();
      } catch (e) {
        if (!(e && e.status === 0)) pb.authStore.clear(); // offline: keep working with the existing login
      }
    }
    if (pb.authStore.isValid) return;
    ssSet(SS_DASH_ACTIVE, null);
    ssSet(SS_DASH_KID, null);
    const result = await showDashboardScreen(dash);
    if (result === 'ok') return; // no forced password change at the dashboard (access via profile/PIN)
    if (result === 'password') {
      await showLoginScreen();
      ssSet(SS_DASH_ACTIVE, '1'); // counts as a dashboard session: afterwards back to the profile selection
      const u0 = currentUser();
      if (u0 && u0.mustChangePassword) await showForcePasswordScreen();
      return;
    }
    // 'invalid': the device is no dashboard any more -> normal login
  }
  applySessionOnlyRule();
  if (pb.authStore.isValid) {
    try {
      await pb.collection(PINN_USERS).authRefresh(); // extends the login at every start
    } catch (e) {
      if (e && e.status === 0) {
        // offline: keep working with the stored login
      } else {
        pb.authStore.clear();
      }
    }
  }
  if (!pb.authStore.isValid) await showLoginScreen();
  try { sessionStorage.setItem(SS_SESSION_ALIVE, '1'); } catch (e) { /* ignore */ }
  const u = currentUser();
  if (u && u.mustChangePassword) await showForcePasswordScreen();
}

async function logout() {
  // At the family dashboard "Abmelden" means: back to the profile selection (data stays on the device)
  if (isDashboardSession()) { returnToDashboard(); return; }
  let hasPending = false;
  try { hasPending = !!localStorage.getItem('pinn.pendingSync') || !!localStorage.getItem('pinn.outbox') || !!localStorage.getItem(LS_AREAS_PENDING_KEY); } catch (e) { /* ignore */ }
  if (hasPending && !confirm('Es gibt noch nicht synchronisierte Änderungen. Beim Abmelden gehen sie verloren. Trotzdem abmelden?')) return;
  clearAppBadgeNow(); // logged out: no number on the app icon any more
  // After logging out, this device should not receive personal notifications any more
  try { await Promise.race([disablePushOnThisDevice(), new Promise(r => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
  // device management: end the session of this device on the server
  remoteLogoutDone = true;
  authExpiredHandled = true;
  try {
    await Promise.race([
      apiFetch('/api/pinn/sitzungen/abmelden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'dieses' }) }),
      new Promise(r => setTimeout(r, 3000)),
    ]);
  } catch (e) { /* ignore */ }
  pb.authStore.clear();
  try {
    ['pinn.cache', 'pinn.pendingSync', 'pinn.outbox', 'pinn.aufgabenCache', 'pinn.icsCache', 'pinn.profileCache', LS_AREAS_KEY, LS_AREAS_PENDING_KEY, LS_SESSION_ONLY].forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem(SS_SESSION_ALIVE);
  } catch (e) { /* ignore */ }
  try { if (window.caches) await caches.delete('pinn-daten'); } catch (e) { /* ignore */ }
  location.reload();
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('anmeldung');
