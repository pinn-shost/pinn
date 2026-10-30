/* pinn. – Family home & sun times (js/wohnort.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the family's home (loadHome, homeApply, cache, federal state), the options of the settings page and
   sunrise/sunset calculated locally (sunTimesFor, homeSunTimes, homeSunLine). Holidays are in js/feiertage.js, the waste
   calendar in js/muellkalender.js, the weather in js/wetter.js. */

/* ==========================================================
   Family home (Settings → Home, pb_hooks/zuhause.pb.js)
   ----------------------------------------------------------
   Stored per family on the server (locked collection "zuhause"), on the device only cached
   (offline, dashboard before signing in). Derived from it:
   - Weather (see above), sunrise/sunset (calculated locally here, also offline)
   - Public holidays (calculated locally) and school holidays (server) of the federal state in the calendar
   - Tracking: the server creates the place "Zuhause" automatically, the map starts there
   ========================================================== */
var LS_HOME = 'pinn.zuhause';            // { familie, zuhause, optionen, darf, ts }
var homeInfo = null;                      // { lat, lon, titel, zusatz, adresse, ort, plz, land, bundesland, bundeslandName, kalender }
var homeOptions = null;                   // { feiertage, ferien, bundesland, bundeslandName }
var homeCanEdit = false;
var homeServerMissing = false;
var homeLoading = false;
var HOME_LAENDER = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg',
  HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
};

function homeLoadCache(familyId) {
  homeInfo = null;
  homeOptions = null;
  if (!familyId) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS_HOME) || 'null');
    if (c && c.familie === familyId) {
      homeInfo = c.zuhause || null;
      homeOptions = c.optionen || null;
      homeCanEdit = !!c.darf;
    }
  } catch (e) { /* broken cache */ }
}
function homeWriteCache(familyId) {
  try { localStorage.setItem(LS_HOME, JSON.stringify({ familie: familyId, zuhause: homeInfo, optionen: homeOptions, darf: homeCanEdit, ts: Date.now() })); } catch (e) { /* full */ }
}
function homeBundesland() {
  return (homeOptions && homeOptions.bundesland) || (homeInfo && homeInfo.bundesland) || '';
}
function homeApply(body, familyId) {
  const before = JSON.stringify([homeInfo, homeOptions]);
  homeInfo = body && body.zuhause ? body.zuhause : null;
  homeOptions = body && body.optionen ? body.optionen : null;
  if (body && typeof body.darfAendern === 'boolean') homeCanEdit = body.darfAendern;
  homeWriteCache(familyId);
  if (before !== JSON.stringify([homeInfo, homeOptions])) homeChanged();
  else { try { renderHomeSettings(); } catch (e) { /* not built yet */ } }
}
function homeChanged() {
  initWeather();
  hcInvalidate();
  hcLoadSchoolHolidays(false);
  try { rebuildEvents(); renderCalendar(); } catch (e) { /* calendar not built yet */ }
  try { renderHomeSettings(); } catch (e) { /* ignore */ }
  try { renderWeatherTile(); } catch (e) { /* ignore */ }
  try { if (kidPageMemberId) renderKidPage(); } catch (e) { /* ignore */ }
  try { if (currentView === 'familie') { famFitted = false; famLoadStatus(); } } catch (e) { /* ignore */ }
}
async function loadHome() {
  const fam = outboxFamily();
  if (!fam || homeLoading) return;
  homeLoading = true;
  try {
    const res = await apiFetch('/api/pinn/zuhause', { cache: 'no-store' });
    if (res.status === 404) { homeServerMissing = true; try { renderHomeSettings(); } catch (e) { /* ignore */ } return; }
    if (!res.ok) return;
    const body = await res.json();
    homeServerMissing = false;
    homeApply(body, fam);
  } catch (e) {
    /* offline: the cache stays */
  } finally {
    homeLoading = false;
  }
}

/* ---------- Sunrise and sunset (calculated locally, NOAA approximation, accurate to ~1 minute) ---------- */
function sunTimesFor(date, lat, lon) {
  const rad = Math.PI / 180;
  const noonMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const n = Math.round(noonMs / 86400000 + 2440587.5 - 2451545.0);
  const jStar = n - lon / 360;
  const M = ((357.5291 + 0.98560028 * jStar) % 360 + 360) % 360;
  const Mr = M * rad;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const L = (M + C + 180 + 102.9372) % 360;
  const Lr = L * rad;
  const jTransit = 2451545.0 + jStar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * Lr);
  const sinD = Math.sin(Lr) * Math.sin(23.4397 * rad);
  const cosD = Math.cos(Math.asin(sinD));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
  if (cosW > 1 || cosW < -1) return { auf: null, unter: null, polar: cosW > 1 ? 'nacht' : 'tag' };
  const w = Math.acos(cosW) / rad;
  const toDate = (J) => new Date((J - 2440587.5) * 86400000);
  return { auf: toDate(jTransit - w / 360), unter: toDate(jTransit + w / 360) };
}
function homeSunTimes(date) {
  if (!homeInfo || !isFinite(homeInfo.lat) || !isFinite(homeInfo.lon)) return null;
  return sunTimesFor(date || new Date(), Number(homeInfo.lat), Number(homeInfo.lon));
}
function homeFmtTime(d) { return d ? d.toLocaleTimeString(PINN_I18N.language.locale, { hour: '2-digit', minute: '2-digit' }) : '–'; }
function homeSunLine(date) {
  const st = homeSunTimes(date);
  if (!st || !st.auf) return '';
  return `🌅 ${homeFmtTime(st.auf)} · 🌇 ${homeFmtTime(st.unter)}`;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('wohnort');
