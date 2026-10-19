/* pinn. – Basic helpers and clock (js/grundlagen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: weatherData, escapeHtml, the date helpers (startOfWeek, isoDate, fmtDay, fmtWeekLabel, monthGridDays), the clock in the header (tickClock – runs once while loading and then every 30 seconds) and weatherIconForCode. The weather itself is loaded in js/wetter.js. */

/* ==========================================================
   State (no localStorage any more – everything comes from PocketBase)
   ========================================================== */
let weatherData = null; // { temp, code, uv } - reloaded periodically from Open-Meteo

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ==========================================================
   Date helpers
   ========================================================== */
function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}
function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fmtDay(d) { return d.toLocaleDateString('de-DE', { weekday: 'short' }); }
function fmtWeekLabel(monday, sunday) {
  const opts = { day: '2-digit', month: 'short' };
  return monday.toLocaleDateString('de-DE', opts) + ' – ' + sunday.toLocaleDateString('de-DE', { ...opts, year: 'numeric' });
}
function monthGridDays(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  return [...Array(42)].map((_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
}

/* ==========================================================
   Clock
   ========================================================== */
function tickClock() {
  const now = new Date();
  let text = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const hw = document.getElementById('headerWeather');
  const headerWeatherShown = !!(hw && !hw.classList.contains('hidden'));
  if (weatherData && !headerWeatherShown) {
    text += ` | ${weatherIconForCode(weatherData.code)} ${weatherData.temp}°`;
    if (weatherData.uv !== null) text += ` | UV ${weatherData.uv}`;
  }
  document.getElementById('clock').textContent = text;
}
tickClock();
setInterval(tickClock, 30000);

/* ==========================================================
   Weather (Open-Meteo, but only via the own server: pb_hooks/zuhause.pb.js)
   ----------------------------------------------------------
   The basis is the family's „Zuhause“ (Settings → Zuhause). pinn. does NOT ask for the location
   at start any more - iOS does not remember the permission for home screen apps and would have asked
   again every time it opened. As long as no home is set, the former weather location
   (weatherLocation in the family data) serves as a fallback.
   ========================================================== */
function weatherIconForCode(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('grundlagen');
