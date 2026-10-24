/* pinn. – Family dashboard: profile selection screen (js/profilauswahl.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the look of the profile selection (cached members, dashAvatarHtml), the profile tiles (buildDashboardTiles), clock and weather on the screen (tickDashboardClock) and showing/hiding it (showDashboardScreen, hideDashboardScreen). */

/* ---------- Look of the profile selection (colours/dark mode from the most recently loaded state) ---------- */
function dashboardCachedMembers(dash) {
  const cache = readCache();
  if (!cache || !cache.data || (cache.familie && cache.familie !== dash.familie)) return [];
  let data = cache.data;
  const pending = readPending();
  if (pending && pending.recordId === cache.recordId && pending.local) data = pending.local;
  try {
    themeColors = { ...defaultFamilyData().themeColors, ...(data.themeColors || {}) };
    applyTheme();
    document.documentElement.classList.toggle('dark', !!data.darkMode);
    updateThemeColorMeta();
  } catch (e) { /* default colours */ }
  try {
    weatherLocation = { ...defaultFamilyData().weatherLocation, ...(data.weatherLocation || {}) };
  } catch (e) { /* no fallback location */ }
  return Array.isArray(data.members) ? data.members : [];
}
function dashAvatarHtml(member, profile, small) {
  const cls = 'dash-avatar' + (small ? ' small' : '');
  const hasColor = member && member.color && member.color !== 'transparent';
  const border = hasColor ? ` style="border-color:${kidAttr(member.color)}"` : '';
  if (member && member.photo) return `<div class="${cls}"${border}><img src="${kidAttr(member.photo)}" alt="" /></div>`;
  if (member && member.avatar) return `<div class="${cls}"${border}><span>${escapeHtml(member.avatar)}</span></div>`;
  if (!member && profile && profile.rolle === 'gast') return `<div class="${cls}"><span>👋</span></div>`;
  const name = (member && member.name) || (profile && profile.username) || '?';
  const bg = hasColor ? member.color : '#9A9A92';
  const initial = String(name).trim().charAt(0).toUpperCase() || '?';
  return `<div class="${cls}"${border}><span class="dash-initial" style="background:${kidAttr(bg)}">${escapeHtml(initial)}</span></div>`;
}
// tiles: first the family members in their order, then profiles without a member, guests last
function buildDashboardTiles(profiles, members) {
  const used = new Set();
  const tiles = [];
  members.forEach(m => {
    const p = profiles.find(x => x.mitglied === m.id && !used.has(x.id));
    if (!p) return;
    used.add(p.id);
    tiles.push({ profile: p, member: m, kid: isKidPageEnabled(m), name: m.name || p.username });
  });
  profiles
    .filter(p => !used.has(p.id))
    .sort((a, b) => ((a.rolle === 'gast') - (b.rolle === 'gast')) || a.username.localeCompare(b.username))
    .forEach(p => tiles.push({ profile: p, member: null, kid: false, name: p.username }));
  return tiles;
}

let dashClockTimer = null;
let dashWeatherTimer = null;
function tickDashboardClock() {
  const now = new Date();
  let clockText = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (weatherData) clockText += ` | ${weatherData.temp}° ${weatherIconForCode(weatherData.code)}`;
  document.getElementById('dashClock').textContent = clockText;
  document.getElementById('dashDate').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}
function hideDashboardScreen() {
  const screen = document.getElementById('dashboardScreen');
  if (!screen) return;
  screen.classList.add('hidden');
  document.getElementById('dashBusy').classList.add('hidden');
  clearInterval(dashClockTimer);
  dashClockTimer = null;
  clearInterval(dashWeatherTimer);
  dashWeatherTimer = null;
}

// Shows the profile selection. Result: 'ok' (profile opened), 'password' (normal login wanted)
// or 'invalid' (the device is no longer a dashboard on the server).
function showDashboardScreen(dash) {
  return new Promise(resolve => {
    const screen = document.getElementById('dashboardScreen');
    const tilesEl = document.getElementById('dashTiles');
    const statusWrap = document.getElementById('dashStatusWrap');
    const status = document.getElementById('dashStatus');
    const busy = document.getElementById('dashBusy');
    const busyText = document.getElementById('dashBusyText');
    const members = dashboardCachedMembers(dash);
    let finished = false;

    document.getElementById('dashFamilyName').textContent = dash.familyName || '';
    busy.classList.add('hidden');
    applyCachedDashBackground(dash);
    screen.classList.remove('hidden');
    tickDashboardClock();
    clearInterval(dashClockTimer);
    dashClockTimer = setInterval(tickDashboardClock, 15 * 1000);
    // load the weather before login as well (home of the family, via the device key)
    homeLoadCache(dash.familie);
    initWeather();
    clearInterval(dashWeatherTimer);
    dashWeatherTimer = setInterval(initWeather, 30 * 60 * 1000);

    function finish(result) {
      if (finished) return;
      finished = true;
      closePinPad();
      resolve(result);
    }
    function deviceGone(message) {
      closePinPad();
      alert(message || tk('dashboard.deviceGone'));
      clearDashboardConfig();
      hideDashboardScreen();
      finish('invalid');
    }
    function showStatus(text) {
      status.textContent = text;
      statusWrap.classList.remove('hidden');
    }

    async function postDashboard(url, payload) {
      let res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
      } catch (e) {
        const err = new Error(tk('common.noConnectionVpn'));
        err.offline = true;
        throw err;
      }
      const body = await res.json().catch(() => ({}));
      return { res, body };
    }

    async function load() {
      statusWrap.classList.add('hidden');
      tilesEl.innerHTML = '<p class="text-sm text-ink/40">' + escapeHtml(tk('dashboard.loadingProfiles')) + '</p>';
      let r;
      try {
        r = await postDashboard('/api/pinn/dashboard/profile', { key: dash.key });
      } catch (e) {
        tilesEl.innerHTML = '';
        showStatus(e.message);
        return;
      }
      if (r.res.status === 404 && r.body.ungueltig) { deviceGone(r.body.error); return; }
      if (!r.res.ok) {
        tilesEl.innerHTML = '';
        showStatus(r.body.error || (r.res.status === 404
          ? tk('dashboard.notSetUp')
          : tk('dashboard.profilesFailed')));
        return;
      }
      const famName = r.body.familie && r.body.familie.name;
      if (famName && famName !== dash.familyName) {
        dash.familyName = famName;
        const saved = readDashboardConfig();
        if (saved) writeDashboardConfig({ ...saved, familyName: famName });
        document.getElementById('dashFamilyName').textContent = famName;
      }
      render(Array.isArray(r.body.profile) ? r.body.profile : []);
      syncDashBackground(dash, r.body.hintergrund);
    }

    function render(profiles) {
      const tiles = buildDashboardTiles(profiles, members);
      if (!tiles.length) {
        tilesEl.innerHTML = '<p class="text-sm text-ink/50">' + escapeHtml(tk('dashboard.noProfiles')) + '</p>';
        return;
      }
      tilesEl.innerHTML = tiles.map((t, i) => {
        const guest = t.profile.rolle === 'gast';
        const badge = t.kid ? escapeHtml(tk('dashboard.myTasks')) : (guest ? escapeHtml(tk('dashboard.guest')) : '');
        return `<button type="button" class="dash-tile${t.kid ? ' kid' : ''}${guest ? ' guest' : ''}" data-tile="${i}">
          ${t.profile.pin ? '<span class="dash-lock" aria-label="' + escapeHtml(tk('dashboard.pinProtected')) + '">🔒</span>' : ''}
          ${dashAvatarHtml(t.member, t.profile)}
          <span class="dash-name">${escapeHtml(t.name)}</span>
          ${badge ? `<span class="dash-badge">${badge}</span>` : ''}
        </button>`;
      }).join('');
      tilesEl.querySelectorAll('.dash-tile').forEach(btn => btn.addEventListener('click', () => openTile(tiles[Number(btn.dataset.tile)])));
    }

    async function login(tile, pin) {
      const r = await postDashboard('/api/pinn/dashboard/login', { key: dash.key, id: tile.profile.id, pin: pin || '' });
      if (r.res.status === 404 && r.body.ungueltig) { deviceGone(r.body.error); return; }
      if (!r.res.ok || !r.body.token) {
        const err = new Error(r.body.error || tk('dashboard.openFailed'));
        err.status = r.res.status;
        throw err;
      }
      pb.authStore.save(r.body.token, r.body.record);
      ssSet(SS_DASH_ACTIVE, '1');
      ssSet(SS_DASH_KID, tile.kid && tile.member ? tile.member.id : null);
      authExpiredHandled = false;
      busyText.textContent = tile.kid ? tk('dashboard.helloKid', { name: tile.name }) : tk('dashboard.hello', { name: tile.name });
      busy.classList.remove('hidden');
      finish('ok');
    }

    function openTile(tile) {
      if (finished || !tile) return;
      if (tile.profile.pin) {
        openPinPad({
          title: tile.name,
          sub: tk('dashboard.enterPin'),
          length: tile.profile.pin,
          avatarHtml: dashAvatarHtml(tile.member, tile.profile, true),
          onComplete: async (pin, pad) => {
            try {
              await login(tile, pin);
            } catch (e) {
              pad.fail(e.message);
            }
          },
        });
        return;
      }
      busyText.textContent = tk('dashboard.opening');
      busy.classList.remove('hidden');
      login(tile, '').catch(e => {
        busy.classList.add('hidden');
        alert(e.message);
      });
    }

    document.getElementById('dashRetryBtn').onclick = load;
    document.getElementById('dashPasswordLoginBtn').onclick = () => {
      hideDashboardScreen();
      finish('password');
    };
    load();
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('profilauswahl');
