/* pinn. – Automatic dark mode (js/dunkelzeit.js, since 1.138.0)
   Classic script, no build step: loaded after js/einstellungen.js (the load order is listed in src/rahmen.html and in pinn-setup.sh).
   Contents: dark mode by time of day or from sunset to sunrise. The three values live in the personal design of the
   profile (darkAuto: 'aus' | 'zeit' | 'sonne', darkFrom, darkTo – see currentDesignValues in js/design.js) and
   therefore apply on every device of the profile.
   - 'zeit':  dark from darkFrom until darkTo (may run past midnight).
   - 'sonne': dark from sunset to sunrise at the home of the family (homeInfo, else the weather location). The times are
              calculated on the device (no request, no location access). Without a saved place darkFrom/darkTo are used.
   Switching the toggle by hand stays in force until the next automatic change: the page is only touched when the wanted
   state changes (every 30 seconds and when the app comes back to the front). Automatic changes are not saved. */

var darkAuto = 'aus';          // 'aus' | 'zeit' | 'sonne'
var darkFrom = '20:00';
var darkTo = '07:00';
var darkAutoLast = null;       // state wanted at the last check (null = not checked yet)
var darkAutoTimer = null;
var DARK_AUTO_MODES = ['aus', 'zeit', 'sonne'];

function darkTimeOk(v) { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
function darkMinutes(v) { const p = String(v).split(':'); return Number(p[0]) * 60 + Number(p[1]); }

// Sunrise and sunset (NOAA approximation, about ±2 minutes). Returns { rise, set } as Dates,
// { polar: 'night' } when the sun does not rise, { polar: 'day' } when it does not set.
function darkSunTimes(date, lat, lon) {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const g = (2 * Math.PI / 365) * (dayOfYear - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosHa > 1) return { polar: 'night' };
  if (cosHa < -1) return { polar: 'day' };
  const ha = Math.acos(cosHa) / rad;
  const base = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    rise: new Date(base + (720 - 4 * (lon + ha) - eqTime) * 60000),
    set: new Date(base + (720 - 4 * (lon - ha) - eqTime) * 60000),
  };
}

// Place for the sun times: home address of the family, else the weather location; null = none saved
function darkSunPlace() {
  let p = null;
  try { if (typeof homeInfo !== 'undefined' && homeInfo && isFinite(homeInfo.lat) && isFinite(homeInfo.lon)) p = { lat: Number(homeInfo.lat), lon: Number(homeInfo.lon) }; } catch (e) { p = null; }
  if (!p) {
    try { if (typeof weatherLocation !== 'undefined' && weatherLocation && weatherLocation.lat != null && weatherLocation.lon != null && isFinite(weatherLocation.lat) && isFinite(weatherLocation.lon)) p = { lat: Number(weatherLocation.lat), lon: Number(weatherLocation.lon) }; } catch (e) { p = null; }
  }
  return p;
}

// Fixed times: dark between darkFrom and darkTo (past midnight allowed)
function darkByTimes(now) {
  const f = darkMinutes(darkFrom), t = darkMinutes(darkTo), m = now.getHours() * 60 + now.getMinutes();
  if (f === t) return false;
  return f < t ? (m >= f && m < t) : (m >= f || m < t);
}

// Should dark mode be on right now? Only meaningful while darkAuto is not 'aus'.
function darkWanted(now) {
  if (darkAuto === 'zeit') return darkByTimes(now);
  const p = darkSunPlace();
  if (!p) return darkByTimes(now);
  const s = darkSunTimes(now, p.lat, p.lon);
  if (s.polar) return s.polar === 'night';
  return now.getTime() >= s.set.getTime() || now.getTime() < s.rise.getTime();
}

function darkAutoApply(force) {
  if (darkAuto === 'aus') { darkAutoLast = null; return; }
  const want = darkWanted(new Date());
  if (!force && want === darkAutoLast) return;
  darkAutoLast = want;
  document.documentElement.classList.toggle('dark', want);
  try { updateThemeColorMeta(); } catch (e) { /* not ready yet */ }
  const t = document.getElementById('darkModeToggle');
  if (t) t.checked = want;
}

function darkAutoStartTimer() {
  if (darkAuto === 'aus') {
    if (darkAutoTimer) { clearInterval(darkAutoTimer); darkAutoTimer = null; }
    return;
  }
  if (!darkAutoTimer) darkAutoTimer = setInterval(() => darkAutoApply(false), 30000);
}

// Takes the values from the personal design (called by applyPersonalDesign)
function darkAutoLoad(w) {
  w = w || {};
  darkAuto = DARK_AUTO_MODES.includes(w.darkAuto) ? w.darkAuto : 'aus';
  darkFrom = darkTimeOk(w.darkFrom) ? w.darkFrom : '20:00';
  darkTo = darkTimeOk(w.darkTo) ? w.darkTo : '07:00';
  darkAutoApply(true);
  darkAutoStartTimer();
  darkAutoSyncInputs();
}

function darkFmtTime(d) {
  try { return d.toLocaleTimeString((window.PINN_I18N && PINN_I18N.language && PINN_I18N.language.locale) || undefined, { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

// Shows the current values in the settings
function darkAutoSyncInputs() {
  const sel = document.getElementById('darkAutoSelect');
  if (!sel) return;
  sel.value = darkAuto;
  document.getElementById('darkFromInput').value = darkFrom;
  document.getElementById('darkToInput').value = darkTo;
  const p = darkSunPlace();
  const needTimes = darkAuto === 'zeit' || (darkAuto === 'sonne' && !p);
  document.getElementById('darkAutoTimes').classList.toggle('hidden', !needTimes);
  document.getElementById('darkAutoNote').classList.toggle('hidden', darkAuto === 'aus');
  const hint = document.getElementById('darkAutoHint');
  let text = '';
  if (darkAuto === 'sonne' && !p) {
    text = tk('settings.display.darkSunNoPlace');
  } else if (darkAuto === 'sonne') {
    const now = new Date(), tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    const a = darkSunTimes(now, p.lat, p.lon), b = darkSunTimes(tomorrow, p.lat, p.lon);
    if (!a.polar && !b.polar) text = tk('settings.display.darkSunToday', { from: darkFmtTime(a.set), to: darkFmtTime(b.rise) });
  }
  hint.textContent = text;
  hint.classList.toggle('hidden', !text);
}

function darkAutoChanged() {
  const sel = document.getElementById('darkAutoSelect');
  darkAuto = DARK_AUTO_MODES.includes(sel.value) ? sel.value : 'aus';
  const f = document.getElementById('darkFromInput').value, t = document.getElementById('darkToInput').value;
  if (darkTimeOk(f)) darkFrom = f;
  if (darkTimeOk(t)) darkTo = t;
  darkAutoApply(true);
  darkAutoStartTimer();
  darkAutoSyncInputs();
  savePersonalDesign();
}
document.getElementById('darkAutoSelect').addEventListener('change', darkAutoChanged);
document.getElementById('darkFromInput').addEventListener('change', darkAutoChanged);
document.getElementById('darkToInput').addEventListener('change', darkAutoChanged);
document.addEventListener('visibilitychange', () => { if (!document.hidden) darkAutoApply(false); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dunkelzeit');
