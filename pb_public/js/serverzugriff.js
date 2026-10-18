/* pinn. – Server access with login (js/serverzugriff.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: apiFetch, which calls the own server routes with the login token and handles an expired or remotely ended login (authExpiredHandled), and applySessionOnlyRule for "Angemeldet bleiben". Almost every part of the app uses apiFetch, but only at runtime. */

// Call own server routes with the login. If the login has expired, go back to the
// login screen (pending changes stay saved locally and are sent afterwards).
let authExpiredHandled = false;
async function apiFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (pb.authStore.token) headers['Authorization'] = pb.authStore.token;
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401 && res.headers.get('X-Pinn-Abgemeldet') === '1') { handleRemoteLogout(); return res; }
  if (res.status === 401 && !authExpiredHandled) {
    authExpiredHandled = true;
    if (isDashboardDevice()) { returnToDashboard(); return res; } // dashboard: simply back to the profile selection
    pb.authStore.clear();
    alert('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.');
    location.reload();
  }
  return res;
}

// "Angemeldet bleiben" not set: the login only counts while the app is open.
function applySessionOnlyRule() {
  try {
    if (localStorage.getItem(LS_SESSION_ONLY) === '1' && !sessionStorage.getItem(SS_SESSION_ALIVE)) {
      pb.authStore.clear();
      localStorage.removeItem(LS_SESSION_ONLY);
    }
  } catch (e) { /* storage not available */ }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('serverzugriff');
