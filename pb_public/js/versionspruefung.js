/* pinn. – Update detection (js/versionspruefung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: shows the installed version (sidebar, Settings → Updates, Settings → GitHub), the GitHub and
   support links (PINN_GITHUB), the update banner with hardReload(), and checkForAppUpdate(), which compares
   the Last-Modified/ETag header of index.html – important when pinn. is used from the iOS home screen,
   because such web apps often don't reload their content by themselves (checked whenever the app becomes
   visible and every 3 minutes). hardReload and checkForAppUpdate are also used by other files at runtime.
   Since 1.146.0 the sign-in screen and the locked family dashboard load a new version on their own.
   Not in here: const APP_VERSION stays in the inline script of index.html, because the release tools bump
   it there and the server (pb_hooks/pinn-system.js, pinn-wartung.sh) reads the installed version from
   pb_public/index.html. */

document.getElementById('sidebarVersionDisplay').textContent = APP_VERSION;
document.getElementById('settingsVersionDisplay').textContent = APP_VERSION;
document.getElementById('githubVersionDisplay').textContent = APP_VERSION;

/* GitHub & support (Settings → GitHub): all links in one place */
const PINN_GITHUB = {
  repo: 'https://github.com/pinn-shost/pinn',
  kofi: 'https://ko-fi.com/pinnapp',
  bmc: 'https://buymeacoffee.com/pinn',
};
[['githubRepoLink', PINN_GITHUB.repo], ['githubIssuesLink', PINN_GITHUB.repo + '/issues'],
 ['githubKofiLink', PINN_GITHUB.kofi], ['githubBmcLink', PINN_GITHUB.bmc]].forEach(([id, url]) => {
  const a = document.getElementById(id);
  if (a) a.href = url;
});

function hardReload() {
  // Instead of location.reload(), navigate to a new URL with a cache buster so that iOS
  // is guaranteed to fetch the file fresh from the server instead of showing a possibly cached version.
  location.href = location.pathname + '?_r=' + Date.now();
}
document.getElementById('updateBannerRefreshBtn').addEventListener('click', hardReload);
document.getElementById('updateBannerDismissBtn').addEventListener('click', () => {
  document.getElementById('updateBanner').classList.add('hidden');
});

let appLoadedVersion = null;
// Stamp of the installed index.html (Last-Modified or ETag); '' when the server does not answer properly –
// e.g. while PocketBase restarts during an update
async function appVersionStamp() {
  const res = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
  if (!res.ok) return '';
  return res.headers.get('Last-Modified') || res.headers.get('ETag') || '';
}
async function checkForAppUpdate(showBannerIfChanged) {
  try {
    const version = await appVersionStamp();
    if (!version) return false;
    if (appLoadedVersion === null) { appLoadedVersion = version; return false; }
    if (version !== appLoadedVersion) {
      if (showBannerIfChanged) {
        document.getElementById('updateBanner').classList.remove('hidden');
        appUpdateReloadWhenFree();
      }
      return true;
    }
    return false;
  } catch (err) {
    // Network problems should not disturb the app - just quietly do nothing
    return false;
  }
}

/* Reload on its own (since 1.146.0): the banner sits in the app frame and is not visible on the sign-in screen or on
   the locked family dashboard – an iPad that shows the dashboard all day kept running the old version after an
   (automatic) update until someone reloaded it by hand. When nobody is using pinn. right now (sign-in or dashboard
   profile selection in front, nothing typed or tapped for a while) the new version is loaded by itself. In the open
   app only the banner appears as before, so nothing that is being typed gets lost. */
const APP_RELOAD_KEY = 'pinn.autoReload';
const APP_RELOAD_WAIT_MS = 60 * 1000;      // the update may still be copying files or restarting the server
const APP_RELOAD_QUIET_MS = 30 * 1000;     // nobody touched the screen for that long
let appUpdateReloadTimer = null;
let appLastTouch = 0;
['pointerdown', 'keydown', 'touchstart'].forEach(t => {
  window.addEventListener(t, () => { appLastTouch = Date.now(); }, { passive: true, capture: true });
});
function appNobodyWorking() {
  const front = ['loginScreen', 'dashboardScreen'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  if (!front) return false;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return false;
  return Date.now() - appLastTouch >= APP_RELOAD_QUIET_MS;
}
function appUpdateReloadWhenFree() {
  if (appUpdateReloadTimer) return;
  appUpdateReloadTimer = setTimeout(async () => {
    appUpdateReloadTimer = null;
    if (document.hidden) return;                       // checked again when pinn. becomes visible
    if (!appNobodyWorking()) { appUpdateReloadWhenFree(); return; }
    let version = '';
    try { version = await appVersionStamp(); } catch (e) { version = ''; }
    if (!version || version === appLoadedVersion) { if (!version) appUpdateReloadWhenFree(); return; }
    // never more than once every 5 minutes (protection against a reload loop)
    let last = 0;
    try { last = Number(sessionStorage.getItem(APP_RELOAD_KEY)) || 0; } catch (e) { last = 0; }
    if (Date.now() - last < 5 * 60 * 1000) return;
    try { sessionStorage.setItem(APP_RELOAD_KEY, String(Date.now())); } catch (e) { /* storage blocked */ }
    hardReload();
  }, APP_RELOAD_WAIT_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForAppUpdate(true);
});
setInterval(() => checkForAppUpdate(true), 3 * 60 * 1000); // check every 3 minutes in the background
// Base value right away – the sign-in screen and the locked dashboard never reach the app start (js/appstart.js)
checkForAppUpdate(false);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('versionspruefung');
