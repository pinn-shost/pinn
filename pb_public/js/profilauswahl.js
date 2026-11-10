/* pinn. – Family dashboard: profile selection screen (js/profilauswahl.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the look of the profile selection (cached members, dashAvatarHtml), the profile tiles (buildDashboardTiles), clock and weather on the screen (tickDashboardClock) and showing/hiding it (showDashboardScreen, hideDashboardScreen).
   Since 1.118.4 every profile needs a PIN at the dashboard: a profile without one (not a guest) opens once with its password
   (#dashPwOverlay); right after the login bootApp asks for the new PIN (enforceDashboardPin in js/dashboardkonto.js).
   Since 1.134.0 kids with "kids' page only" open with a tap (no PIN, no password) and only see their kids' page; the
   pictures come from the members area on the device (the members moved out of the family record with 1.108).
   Since 1.144.0 every tile shows unread chats (speech bubble) and open tasks (check mark) under the name (dashCountsHtml) -
   on by default, an admin can switch them off under Account; the numbers are refreshed quietly every minute. */

/* ---------- Look of the profile selection (colours/dark mode from the most recently loaded state) ---------- */
// Current value of an area from the device storage (js/bereiche.js): own pending change first, then
// the last server state. null = not on this device.
function dashboardAreaData(familyId, name) {
  try {
    const raw = localStorage.getItem(LS_AREAS_PENDING_KEY);
    const all = raw ? JSON.parse(raw) : null;
    const p = all && all[name];
    if (p && p.familie === familyId && p.local && typeof p.local === 'object') return p.local;
  } catch (e) { /* no pending changes */ }
  try {
    const raw = localStorage.getItem(LS_AREAS_KEY);
    const c = raw ? JSON.parse(raw) : null;
    if (!c || c.familie !== familyId || !c.areas || !c.areas[name]) return null;
    const b = c.areas[name].base;
    return (b && typeof b === 'object') ? b : null;
  } catch (e) { return null; }
}
function dashboardCachedMembers(dash) {
  const cache = readCache();
  let data = {};
  if (cache && cache.data && (!cache.familie || cache.familie === dash.familie)) {
    data = cache.data;
    const pending = readPending();
    if (pending && pending.recordId === cache.recordId && pending.local) data = pending.local;
  }
  // Members and settings live in their own areas since 1.108 - those win over the old family record
  const fam = String(dash.familie || (cache && cache.familie) || '');
  if (fam) {
    const settings = dashboardAreaData(fam, 'einstellungen');
    const people = dashboardAreaData(fam, 'mitglieder');
    data = { ...data, ...(settings || {}) };
    if (people && Array.isArray(people.members)) data.members = people.members;
  }
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
    // kids' page only: the server says it (kinderseite); an older server without the field -> own data
    const kid = typeof p.kinderseite === 'boolean' ? p.kinderseite : ((p.rolle || 'mitglied') === 'mitglied' && memberKidsOnly(m));
    tiles.push({ profile: p, member: m, kid, name: m.name || p.username });
  });
  profiles
    .filter(p => !used.has(p.id))
    .sort((a, b) => ((a.rolle === 'gast') - (b.rolle === 'gast')) || a.username.localeCompare(b.username))
    .forEach(p => tiles.push({ profile: p, member: null, kid: p.kinderseite === true, name: p.username }));
  return tiles;
}

/* ---------- Numbers under the name: unread chats and open tasks (since 1.144.0) ---------- */
// Speech bubble (like a messenger icon, without the phone receiver) and check mark, drawn with the text colour
const DASH_ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4a8.6 8.6 0 0 0-7.45 12.9L3.4 20.6l4.4-1.15A8.6 8.6 0 1 0 12 3.4z"/></svg>';
const DASH_ICON_TASK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 12.6l4.3 4.3L18.8 7.4"/></svg>';
// 0 = nothing, 1-9 as they are, more than 9 = "9" with a raised "+"
function dashCountNumber(n) {
  return n > 9 ? '9<sup>+</sup>' : String(n);
}
// One chip per kind; a kind with 0 (or without a number from the server) is left out completely
function dashCountsHtml(profile) {
  const chats = Math.max(0, Math.floor(Number(profile.chats) || 0));
  const tasks = Math.max(0, Math.floor(Number(profile.offen) || 0));
  if (!chats && !tasks) return '';
  let html = '<span class="dash-counts">';
  if (chats) html += '<span class="dash-cnt chat" role="img" aria-label="' + escapeHtml(tk('dashboard.unreadChatsCount', { n: chats })) + '">' + DASH_ICON_CHAT + '<b>' + dashCountNumber(chats) + '</b></span>';
  if (tasks) html += '<span class="dash-cnt task" role="img" aria-label="' + escapeHtml(tk('dashboard.openTasksCount', { n: tasks })) + '">' + DASH_ICON_TASK + '<b>' + dashCountNumber(tasks) + '</b></span>';
  return html + '</span>';
}

let dashClockTimer = null;
let dashWeatherTimer = null;
let dashCountTimer = null;
function tickDashboardClock() {
  const now = new Date();
  let clockText = now.toLocaleTimeString(PINN_I18N.language.locale, { hour: '2-digit', minute: '2-digit' });
  if (weatherData) clockText += ` | ${tDeg(weatherData.temp)} ${weatherIconForCode(weatherData.code)}`;
  document.getElementById('dashClock').textContent = clockText;
  document.getElementById('dashDate').textContent = now.toLocaleDateString(PINN_I18N.language.locale, { weekday: 'long', day: 'numeric', month: 'long' });
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
  clearInterval(dashCountTimer);
  dashCountTimer = null;
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
      closePasswordBox();
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
      render(Array.isArray(r.body.profile) ? r.body.profile : [], countsShown(r.body));
      syncDashBackground(dash, r.body.hintergrund);
      // the numbers change while the screen stays open: ask again quietly every minute
      clearInterval(dashCountTimer);
      dashCountTimer = countsShown(r.body) ? setInterval(refreshCounts, 60 * 1000) : null;
    }
    // true = the server sends the numbers (zahlenAnzeigen since 1.144.0, offenAnzeigen for servers of 1.143.0)
    function countsShown(body) {
      return body.zahlenAnzeigen === true || (body.zahlenAnzeigen === undefined && body.offenAnzeigen === true);
    }
    // Quiet refresh of the numbers (no loading text, no flicker); stops when the screen is hidden
    async function refreshCounts() {
      if (finished || document.visibilityState !== 'visible') return;
      if (!document.getElementById('dashPwOverlay').classList.contains('hidden')) return;
      try {
        const r = await postDashboard('/api/pinn/dashboard/profile', { key: dash.key });
        if (!r.res.ok) return;
        if (!document.getElementById('pinPadOverlay') || document.getElementById('pinPadOverlay').classList.contains('hidden')) {
          render(Array.isArray(r.body.profile) ? r.body.profile : [], countsShown(r.body));
        }
      } catch (e) { /* offline: keep the numbers shown */ }
    }

    function render(profiles, showCounts) {
      const tiles = buildDashboardTiles(profiles, members);
      if (!tiles.length) {
        tilesEl.innerHTML = '<p class="text-sm text-ink/50">' + escapeHtml(tk('dashboard.noProfiles')) + '</p>';
        return;
      }
      tilesEl.innerHTML = tiles.map((t, i) => {
        const guest = t.profile.rolle === 'gast';
        const badge = t.kid ? escapeHtml(tk('dashboard.myTasks')) : (guest ? escapeHtml(tk('dashboard.guest')) : '');
        const icon = t.kid ? '' : t.profile.pin
          ? '<span class="dash-lock" aria-label="' + escapeHtml(tk('dashboard.pinProtected')) + '">🔒</span>'
          : (needsPassword(t) ? '<span class="dash-key" aria-label="' + escapeHtml(tk('dashboard.passwordFirst')) + '">🔑</span>' : '');
        return `<button type="button" class="dash-tile${t.kid ? ' kid' : ''}${guest ? ' guest' : ''}" data-tile="${i}">
          ${icon}
          <span class="dash-avatar-wrap">
            ${dashAvatarHtml(t.member, t.profile)}
          </span>
          <span class="dash-name">${escapeHtml(t.name)}</span>
          ${showCounts ? dashCountsHtml(t.profile) : ''}
          ${badge ? `<span class="dash-badge">${badge}</span>` : ''}
        </button>`;
      }).join('');
      tilesEl.querySelectorAll('.dash-tile').forEach(btn => btn.addEventListener('click', () => openTile(tiles[Number(btn.dataset.tile)])));
    }

    // A profile without a PIN (not a guest, not kids' page only) needs its password once - the PIN is set right after
    function needsPassword(tile) {
      return !tile.kid && !tile.profile.pin && tile.profile.rolle !== 'gast';
    }

    async function login(tile, pin, password) {
      const payload = { key: dash.key, id: tile.profile.id, pin: pin || '' };
      if (password) payload.passwort = password;
      const r = await postDashboard('/api/pinn/dashboard/login', payload);
      if (r.res.status === 404 && r.body.ungueltig) { deviceGone(r.body.error); return; }
      if (!r.res.ok || !r.body.token) {
        let message = r.body.error || tk('dashboard.openFailed');
        if (r.res.status === 400 && r.body.passwort) message = tk('dashboard.wrongPassword');
        else if (r.res.status === 400 && r.body.falsch) message = tk('dashboard.wrongPin');
        const err = new Error(message);
        err.status = r.res.status;
        err.needsPassword = r.res.status === 401 && !!r.body.passwort;
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

    /* ---------- Password of a profile without a PIN ---------- */
    function closePasswordBox() {
      document.getElementById('dashPwOverlay').classList.add('hidden');
      document.getElementById('dashPwInput').value = '';
    }
    function openPasswordBox(tile) {
      const overlay = document.getElementById('dashPwOverlay');
      const form = document.getElementById('dashPwForm');
      const input = document.getElementById('dashPwInput');
      const error = document.getElementById('dashPwError');
      const submit = document.getElementById('dashPwSubmit');
      document.getElementById('dashPwAvatar').innerHTML = dashAvatarHtml(tile.member, tile.profile, true);
      document.getElementById('dashPwName').textContent = tile.name;
      document.getElementById('dashPwUser').value = tile.profile.username || '';
      input.value = '';
      error.textContent = '';
      submit.disabled = false;
      overlay.classList.remove('hidden');
      setTimeout(() => { try { input.focus(); } catch (e) { /* ignore */ } }, 60);
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const password = input.value;
        if (!password) { input.focus(); return; }
        submit.disabled = true;
        error.textContent = '';
        try {
          await login(tile, '', password);
          closePasswordBox();
        } catch (e) {
          submit.disabled = false;
          input.value = '';
          error.textContent = e.message;
          form.classList.remove('shake');
          void form.offsetWidth; // restart the animation
          form.classList.add('shake');
          try { input.focus(); } catch (e2) { /* ignore */ }
        }
      };
      document.getElementById('dashPwCancel').onclick = closePasswordBox;
    }

    function openPinFor(tile) {
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
    }

    function openTile(tile) {
      if (finished || !tile) return;
      if (needsPassword(tile)) { openPasswordBox(tile); return; }
      if (tile.profile.pin && !tile.kid) { openPinFor(tile); return; }
      // Guests and kids' page only: open with a tap
      busyText.textContent = tile.kid ? tk('dashboard.helloKid', { name: tile.name }) : tk('dashboard.opening');
      busy.classList.remove('hidden');
      login(tile, '').catch(e => {
        busy.classList.add('hidden');
        if (e.needsPassword) { openPasswordBox(tile); return; } // e.g. an older list without the PIN state
        if (tile.kid && tile.profile.pin && e.status === 400) { openPinFor(tile); return; } // older server: still asks for the PIN
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
