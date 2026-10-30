/* pinn. – Weather (js/wetter.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: loading the weather for the family's home from the server (fetchWeather, initWeather) and the preview cache for
   the overview. weatherIconForCode stays in index.html, because the clock (tickClock) uses it while loading.
   The home itself is in js/wohnort.js. */

var weatherLoading = false;
async function fetchWeather() {
  if (weatherLoading) return;
  const loggedIn = !!(pb && pb.authStore && pb.authStore.token);
  const payload = {};
  if (!loggedIn) {
    const dash = readDashboardConfig();
    if (!dash) return;
    payload.key = dash.key;
  }
  let fallback = null;
  try { fallback = weatherLocation; } catch (e) { fallback = null; }
  if (!homeInfo && fallback && fallback.lat != null && fallback.lon != null) {
    payload.lat = fallback.lat;
    payload.lon = fallback.lon;
  }
  weatherLoading = true;
  try {
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
    const res = loggedIn ? await apiFetch('/api/pinn/zuhause/wetter', opts) : await fetch('/api/pinn/zuhause/wetter', opts);
    if (res.status === 404) throw new Error(tk('weather.pbHooksZuhausePb'));
    const data = await res.json();
    if (data.keinOrt) {
      weatherNoLocation = true;
      weatherData = null;
    } else if (data.error || !data.jetzt) {
      throw new Error(data.error || tk('weather.noWeatherData'));
    } else {
      weatherData = data.jetzt.temp != null ? { temp: data.jetzt.temp, code: data.jetzt.code, uv: data.jetzt.uv, gef: data.jetzt.gef, wind: data.jetzt.wind, feuchte: data.jetzt.feuchte } : null;
      // Preview for the overview (remembered on the device so it is there offline too)
      weatherDaily = {
        label: data.ort || (fallback && fallback.label) || '',
        ts: Date.now(),
        days: (Array.isArray(data.tage) ? data.tage : []).map(d => ({ ...d, date: String(d.date) })),
        past: (Array.isArray(data.vergangen) ? data.vergangen : []).map(d => ({ date: String(d.date), mm: d.mm, max: d.max, min: d.min })),
      };
      try { if (currentView === 'haus' && (hsTab === 'garten' || hsTab === 'uebersicht')) renderHouse(); } catch (e) { /* not ready yet */ }
      try { localStorage.setItem(LS_WEATHER_DAILY, JSON.stringify(weatherDaily)); } catch (e) { /* full */ }
      weatherNoLocation = false;
    }
  } catch (err) {
    console.error('Weather request failed', err);
  } finally {
    weatherLoading = false;
  }
  tickClock();
  if (dashClockTimer) tickDashboardClock();
  renderWeatherTile();
  try { const ov = document.getElementById('wxOverlay'); if (ov && !ov.classList.contains('hidden') && wxState.place === 'home') wxRender(); } catch (e) { /* not ready yet */ }
}

// No automatic location access any more – only the family's saved home.
function initWeather() {
  fetchWeather();
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('wetter');
