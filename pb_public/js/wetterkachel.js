/* pinn. – Overview tile: weather (js/wetterkachel.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the weather tile (renderWeatherTile, daily forecast cache, day labels) and the header weather on iPad and computer
   (renderHeaderWeather). Loading the weather is in js/wetter.js. */

/* ---------- Tile: weather (data from fetchWeather, Open-Meteo) ---------- */
// "var" instead of "let": initWeather() may already run at start before these lines are reached
var LS_WEATHER_DAILY = 'pinn.wetterVorschau';
var weatherDaily = null; // { label, ts, days: [{ date, code, max, min, rain }] }
var weatherNoLocation = false;

function readWeatherDailyCache() {
  if (weatherDaily) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS_WEATHER_DAILY) || 'null');
    if (c && Array.isArray(c.days)) weatherDaily = c;
  } catch (e) { /* broken cache */ }
}
function weatherDayLabel(dateStr, index) {
  const today = isoDate(new Date());
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === today) return 'Heute';
  if (dateStr === isoDate(tomorrow)) return 'Morgen';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt) ? '' : dt.toLocaleDateString('de-DE', { weekday: index > 1 ? 'long' : 'short' });
}
function renderWeatherTile() {
  try { renderWeatherTileNow(); } catch (e) { /* app not fully built yet */ }
  try { renderHeaderWeather(); } catch (e) { /* header not ready yet */ }
}
function renderWeatherTileNow() {
  const body = document.getElementById('weatherTileBody');
  const place = document.getElementById('weatherTilePlace');
  if (!body || !place) return;
  readWeatherDailyCache();
  const today = isoDate(new Date());
  const days = weatherDaily && Array.isArray(weatherDaily.days) ? weatherDaily.days.filter(d => d && d.date >= today).slice(0, isMobile() ? 3 : 7) : []; // Phone 3 days, iPad/computer the week
  if (!days.length) {
    place.textContent = '';
    body.innerHTML = `<p class="text-sm text-ink/40 italic">${weatherNoLocation
      ? 'Noch kein Zuhause festgelegt – Einstellungen → Zuhause.'
      : 'Wetter wird geladen …'}</p>${wxTileTripsHtml()}`;
    return;
  }
  const now = weatherData && weatherData.temp != null ? `jetzt ${weatherData.temp}°` : '';
  place.textContent = [weatherDaily.label, now].filter(Boolean).join(' · ');
  const old = Date.now() - (Number(weatherDaily.ts) || 0) > 6 * 60 * 60 * 1000;
  body.innerHTML = `<div class="ov-weather-days" style="grid-template-columns:repeat(${days.length}, minmax(0, 1fr))">${days.map((d, i) => `
      <div class="ov-weather-day${d.date === today ? ' is-today' : ''}">
        <div class="ov-weather-label">${escapeHtml(weatherDayLabel(d.date, days.length > 3 ? 0 : i))}</div>
        <div class="ov-weather-icon">${weatherIconForCode(d.code)}</div>
        <div class="ov-weather-temp">${d.max != null ? d.max + '°' : '–'}<span class="ov-weather-min">${d.min != null ? d.min + '°' : ''}</span></div>
        <div class="ov-weather-rain">${d.rain != null ? '💧 ' + d.rain + ' %' : ''}</div>
      </div>`).join('')}</div>${homeSunLine() ? `<p class="ov-weather-sun">${homeSunLine()}</p>` : ''}${wxTileTripsHtml()}${old ? `<p class="ov-weather-stale">Stand: ${new Date(weatherDaily.ts).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}`;
}

/* ---------- Header weather (iPad & computer, 1.61) ----------
   Today, tomorrow and the day after, right of date and time. Replaces the weather tile on the
   overview there (phone keeps the tile). Hidden when the weather tile is switched off in
   Settings → Overview. Tap opens the weather view like the tile did. */
function renderHeaderWeather() {
  const el = document.getElementById('headerWeather');
  if (!el) return;
  readWeatherDailyCache();
  const today = isoDate(new Date());
  const days = weatherDaily && Array.isArray(weatherDaily.days) ? weatherDaily.days.filter(d => d && d.date >= today).slice(0, 3) : [];
  let tileOff = false;
  try { tileOff = overviewHidden.includes('wetter'); } catch (e) { tileOff = false; }
  const off = isMobile() || tileOff || !days.length;
  el.classList.toggle('hidden', off);
  if (off) { el.innerHTML = ''; tickClock(); return; }
  // Current conditions first, then today, tomorrow and the day after
  const now = weatherData && weatherData.temp != null ? `
    <span class="hw-day is-now">
      <span class="hw-label">Jetzt</span>
      <span class="hw-main"><span class="hw-icon">${weatherIconForCode(weatherData.code)}</span><span class="hw-temp">${weatherData.temp}°</span></span>
      <span class="hw-rain">${weatherData.uv != null ? 'UV ' + weatherData.uv : ''}</span>
    </span>` : '';
  el.innerHTML = now + days.map(d => `
    <span class="hw-day${d.date === today ? ' is-today' : ''}">
      <span class="hw-label">${escapeHtml(weatherDayLabel(d.date, 0))}</span>
      <span class="hw-main"><span class="hw-icon">${weatherIconForCode(d.code)}</span><span class="hw-temp">${d.max != null ? d.max + '°' : ''}<span class="hw-min">${d.min != null ? d.min + '°' : ''}</span></span></span>
      <span class="hw-rain">${d.rain != null ? '💧 ' + d.rain + ' %' : ''}</span>
    </span>`).join('');
  tickClock();
}
document.getElementById('headerWeather').addEventListener('click', () => {
  try { wxOpen('home'); } catch (e) { /* weather view not ready yet */ }
});
let headerWeatherResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(headerWeatherResizeTimer);
  headerWeatherResizeTimer = setTimeout(() => { try { renderHeaderWeather(); } catch (e) { /* not ready */ } }, 200);
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('wetterkachel');
