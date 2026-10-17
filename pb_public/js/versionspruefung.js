/* pinn. – Update detection (js/versionspruefung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: shows the installed version (sidebar, Settings → Updates, Settings → GitHub), the GitHub and
   support links (PINN_GITHUB), the update banner with hardReload(), and checkForAppUpdate(), which compares
   the Last-Modified/ETag header of index.html – important when pinn. is used from the iOS home screen,
   because such web apps often don't reload their content by themselves (checked whenever the app becomes
   visible and every 3 minutes). hardReload and checkForAppUpdate are also used by other files at runtime.
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
async function checkForAppUpdate(showBannerIfChanged) {
  try {
    const res = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
    const version = res.headers.get('Last-Modified') || res.headers.get('ETag');
    if (!version) return false;
    if (appLoadedVersion === null) { appLoadedVersion = version; return false; }
    if (version !== appLoadedVersion) {
      if (showBannerIfChanged) document.getElementById('updateBanner').classList.remove('hidden');
      return true;
    }
    return false;
  } catch (err) {
    // Network problems should not disturb the app - just quietly do nothing
    return false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForAppUpdate(true);
});
setInterval(() => checkForAppUpdate(true), 3 * 60 * 1000); // check every 3 minutes in the background

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('versionspruefung');
