/* pinn. – Personal design per profile (js/design.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the personal design stored in the own profile (colours, dark mode, default views, overview tiles, hidden depots,
   language and region) – cache, applying (applyPersonalDesign), current values, region/language checks and saving/loading
   (savePersonalDesign, pushPersonalDesign, loadPersonalDesign). The language & region settings are in js/sprache.js. */

/* ---------- Personal design per profile (across devices, pb_hooks/design.pb.js) ----------
   Stored in the own profile: { werte: {...}, stand: <ms> }. The server always keeps the newer
   state. Settings changed offline are remembered locally and sent later. */
const DESIGN_VIEW_MODES = ['timeline', 'list'];
const DESIGN_VIEW_SCOPES = ['both', 'uebersicht', 'termine'];
let familyDesign = null;
let personalDesign = { werte: {}, stand: 0 };
let personalDesignLoadedFor = null;
let personalDesignSaveTimer = null;
// Savings: depots that do NOT flow into the total overview in the own profile (personal, across devices)
let finDepotsOut = [];

function designCacheKey() {
  const u = currentUser();
  return u && u.id ? 'pinn.design.' + u.id : '';
}
function readDesignCache() {
  const k = designCacheKey();
  if (!k) return null;
  try {
    const c = JSON.parse(localStorage.getItem(k) || 'null');
    if (c && c.design && c.design.werte && typeof c.design.werte === 'object') return c;
  } catch (e) { /* broken cache */ }
  return null;
}
function writeDesignCache(pending) {
  const k = designCacheKey();
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify({ design: personalDesign, pending: !!pending })); } catch (e) { /* full */ }
}
function captureFamilyDesign(data) {
  familyDesign = {
    themeColors: { ...defaultFamilyData().themeColors, ...(data.themeColors || {}) },
    darkMode: !!data.darkMode,
    defaultViewModeDesktop, defaultViewScopeDesktop, defaultViewModeMobile, defaultViewScopeMobile,
  };
}
function applyPersonalDesign() {
  const fd = familyDesign || {
    themeColors: { ...defaultFamilyData().themeColors }, darkMode: false,
    defaultViewModeDesktop: 'timeline', defaultViewScopeDesktop: 'both', defaultViewModeMobile: 'timeline', defaultViewScopeMobile: 'both',
  };
  const w = (personalDesign && personalDesign.werte) || {};
  const col = (k, fb) => (typeof w[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(w[k])) ? w[k] : fb;
  const pick = (k, allowed, fb) => allowed.includes(w[k]) ? w[k] : fb;
  themeColors = {
    paper: col('colorPaper', fd.themeColors.paper),
    pine: col('colorPine', fd.themeColors.pine),
    mustard: col('colorMustard', fd.themeColors.mustard),
  };
  defaultViewModeDesktop = pick('defaultViewModeDesktop', DESIGN_VIEW_MODES, fd.defaultViewModeDesktop);
  defaultViewScopeDesktop = pick('defaultViewScopeDesktop', DESIGN_VIEW_SCOPES, fd.defaultViewScopeDesktop);
  defaultViewModeMobile = pick('defaultViewModeMobile', DESIGN_VIEW_MODES, fd.defaultViewModeMobile);
  defaultViewScopeMobile = pick('defaultViewScopeMobile', DESIGN_VIEW_SCOPES, fd.defaultViewScopeMobile);
  document.documentElement.classList.toggle('dark', typeof w.darkMode === 'boolean' ? w.darkMode : fd.darkMode);
  applyOverviewPrefs(w);
  finDepotsOut = Array.isArray(w.finDepotsOut) ? w.finDepotsOut.filter(x => typeof x === 'string' && x).slice(0, 30) : [];
  try { if (currentView === 'finanzen' && finTab === 'sparen' && finance) renderSavings(); } catch (e) { /* finance not ready yet */ }
  updateThemeColorMeta();
  applyTheme();
  syncDesignSettingsInputs();
  renderOverviewSettings();
  refreshOverviewTiles();
  // Remember the region stored in the profile (country, currency, number format) on the device
  let regionChanged = false;
  if (typeof w.land === 'string' && window.PINN_REGION) {
    regionChanged = PINN_REGION.save({ land: w.land, waehrung: w.waehrung, zahlen: w.zahlen });
  }
  // Take over the language stored in the profile (reloads pinn. once for a different language)
  let reloading = false;
  if (typeof w.sprache === 'string' && window.PINN_I18N && PINN_I18N.find(w.sprache) && w.sprache !== PINN_I18N.current) {
    reloading = PINN_I18N.switchTo(w.sprache);
  } else if (typeof w.sprache === 'string' && window.PINN_I18N && PINN_I18N.find(w.sprache)) {
    PINN_I18N.switchTo(w.sprache, true);
  }
  // Different region: reload once so amounts, numbers and emergency numbers are right everywhere
  if (!reloading && regionChanged && PINN_REGION.reload()) reloading = true;
  if (reloading) regionReloading = true;
}
function syncDesignSettingsInputs() {
  const dm = document.getElementById('darkModeToggle');
  if (!dm) return;
  dm.checked = document.documentElement.classList.contains('dark');
  document.getElementById('colorPaper').value = themeColors.paper;
  document.getElementById('colorPine').value = themeColors.pine;
  document.getElementById('colorMustard').value = themeColors.mustard;
  document.querySelectorAll('.default-view-mode-btn-desktop').forEach(b => b.classList.toggle('active', b.dataset.defaultViewMode === defaultViewModeDesktop));
  document.getElementById('defaultViewScopeSelectDesktop').value = defaultViewScopeDesktop;
  document.querySelectorAll('.default-view-mode-btn-mobile').forEach(b => b.classList.toggle('active', b.dataset.defaultViewMode === defaultViewModeMobile));
  document.getElementById('defaultViewScopeSelectMobile').value = defaultViewScopeMobile;
}
function currentDesignValues() {
  return {
    darkMode: document.documentElement.classList.contains('dark'),
    colorPaper: themeColors.paper, colorPine: themeColors.pine, colorMustard: themeColors.mustard,
    defaultViewModeDesktop, defaultViewScopeDesktop, defaultViewModeMobile, defaultViewScopeMobile,
    // Overview (tiles)
    ovOrder: overviewOrder.slice(), ovHidden: overviewHidden.slice(),
    ovBdayDays: overviewBdayDays, ovBdayOnlyUpcoming: overviewBdayOnlyUpcoming, ovBdayHidden: bdayPackHidden(),
    // Savings: depots hidden from the total overview
    finDepotsOut: finDepotsOut.slice(0, 30),
    // Language of the app (pinnLangCode: stored on the device or currently active)
    sprache: pinnLangCode(),
    // Country, currency, number format and emergency numbers (Settings → Language & region)
    ...regionDesignValues(),
  };
}
// Region for the profile – incl. ready-made details the server needs (amounts in push messages,
// emergency numbers in the SOS push)
function regionDesignValues() {
  return window.PINN_REGION ? PINN_REGION.werte() : {};
}
// Does the profile still hold a different (or no) region state than this device?
function regionProfileOutdated(w) {
  if (!window.PINN_REGION || !w) return false;
  const r = PINN_REGION.werte();
  return Object.keys(r).some(k => JSON.stringify(w[k]) !== JSON.stringify(r[k]));
}
// No (valid) language in the profile? Then the server doesn't know it and sends notifications in German.
function languageProfileOutdated(w) {
  if (!window.PINN_I18N || !w) return false;
  return !(typeof w.sprache === 'string' && PINN_I18N.find(w.sprache));
}
let regionReloading = false;
// After every change in "Darstellung": save only in the own profile (not in the family data)
function savePersonalDesign() {
  if (!currentUser()) return;
  personalDesign = { werte: currentDesignValues(), stand: Date.now() };
  writeDesignCache(true);
  clearTimeout(personalDesignSaveTimer);
  personalDesignSaveTimer = setTimeout(pushPersonalDesign, 600);
}
async function pushPersonalDesign() {
  if (!currentUser() || !navigator.onLine) return;
  const sent = personalDesign;
  try {
    const res = await apiFetch('/api/pinn/design', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent),
    });
    if (res.status === 404) return; // Server hook still missing - it stays remembered locally
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) return; // try again later
    if (body.uebernommen === false && body.design && body.design.werte) {
      personalDesign = { werte: body.design.werte, stand: Number(body.design.stand) || 0 };
      writeDesignCache(false);
      applyPersonalDesign();
      return;
    }
    if (personalDesign === sent) writeDesignCache(false);
  } catch (e) { /* offline - sent later */ }
}
async function loadPersonalDesign(localPending) {
  if (!navigator.onLine) return;
  const uid = personalDesignLoadedFor;
  try {
    const res = await apiFetch('/api/pinn/design', { cache: 'no-store' });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    const remote = body && body.design;
    if (!remote || !remote.werte || typeof remote.werte !== 'object') return;
    if (uid !== personalDesignLoadedFor) return; // another profile signed in meanwhile
    const remoteStand = Number(remote.stand) || 0;
    const localStand = Number(personalDesign.stand) || 0;
    if (localPending && localStand > remoteStand) { pushPersonalDesign(); return; }
    if (remoteStand >= localStand) {
      personalDesign = { werte: remote.werte, stand: remoteStand };
      writeDesignCache(false);
      applyPersonalDesign();
      // Region in the profile missing or outdated (e.g. stored before version 1.17): add it,
      // so the server knows the emergency numbers and the currency format of this profile
      if (!regionReloading && (regionProfileOutdated(remote.werte) || languageProfileOutdated(remote.werte))) savePersonalDesign();
    } else {
      pushPersonalDesign();
    }
  } catch (e) { /* offline: the cached design stays */ }
}
window.addEventListener('online', () => {
  const c = readDesignCache();
  if (c && c.pending) pushPersonalDesign();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('design');
