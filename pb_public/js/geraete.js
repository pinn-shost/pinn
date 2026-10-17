/* pinn. – Device management (js/geraete.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: signed-in devices (Account → own devices, Manage profiles → devices & sign-in of a profile,
   main admin screen): list, sign out one/all others/everywhere, lift the lock after wrong passwords,
   device count per profile, and the date helpers devFmtDate/devFmtWhen (also used by js/fehlerprotokoll.js). */

/* ==========================================================
   Device management – signed-in devices per profile (pb_hooks/sitzungen.pb.js)
   ----------------------------------------------------------
   - Account → „Angemeldete Geräte“: own devices, sign out one by one or „Alle anderen Geräte abmelden“
   - Manage profiles → „📱 Geräte & Anmeldung“ (admins) or 📱 for the main admin: devices of a profile,
     „Überall abmelden“ and – after too many wrong passwords – „Sperre aufheben“
   - A signed-out device deletes its pinn. data (handleRemoteLogout further up at the PocketBase connection)
   ========================================================== */
function devFmtDate(iso) {
  const t = Date.parse(iso || '');
  if (!isFinite(t)) return '';
  try { return new Date(t).toLocaleDateString(sysLocale(), { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch (e) { return new Date(t).toLocaleDateString(); }
}
function devFmtWhen(iso) {
  const t = Date.parse(iso || '');
  if (!isFinite(t)) return '';
  const diff = Date.now() - t;
  if (diff < 2 * 60000) return 'gerade eben';
  if (diff < 60 * 60000) return 'vor ' + Math.round(diff / 60000) + ' Min.';
  const d = new Date(t), now = new Date();
  let time = '';
  try { time = d.toLocaleTimeString(sysLocale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { time = d.toLocaleTimeString(); }
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days === 0) return 'heute, ' + time;
  if (days === 1) return 'gestern, ' + time;
  return devFmtDate(iso) + ', ' + time;
}
function devWait(sec) {
  const s = Math.max(1, Math.round(Number(sec) || 0));
  return s < 60 ? s + ' Sek.' : Math.ceil(s / 60) + ' Min.';
}
function devIcon(s) {
  const n = String(s.name || '');
  if (s.art === 'dashboard' || /^Familien-Dashboard/.test(n)) return '🖥️';
  if (/iPhone|Android-Handy/.test(n)) return '📱';
  if (/iPad|Tablet/.test(n)) return '📲';
  return '💻';
}
function devRowsHtml(list) {
  if (!list.length) return '<p class="sm-empty">Keine angemeldeten Geräte.</p>';
  return list.map(s => {
    const sub = ['Zuletzt aktiv: ' + devFmtWhen(s.zuletzt)];
    if (s.seit) sub.push('angemeldet seit ' + devFmtDate(s.seit));
    if (s.push) sub.push('🔔 Push');
    if (s.ip) sub.push(s.ip);
    return `<div class="sm-row dev-row">
      <div class="sm-row-ico">${devIcon(s)}</div>
      <div class="sm-row-main">
        <span class="sm-row-title">${escapeHtml(s.name || 'Gerät')}${s.dieses ? ' <span class="sm-tag">Dieses Gerät</span>' : ''}</span>
        <span class="sm-row-sub">${escapeHtml(sub.join(' · '))}</span>
      </div>
      <button type="button" class="sm-btn sm-small dev-out shrink-0" data-id="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name || '')}" data-dieses="${s.dieses ? '1' : ''}">Abmelden</button>
    </div>`;
  }).join('');
}
async function devFetchList(userId) {
  const res = await apiFetch('/api/pinn/sitzungen' + (userId ? '?benutzer=' + encodeURIComponent(userId) : ''), { cache: 'no-store' });
  if (res.status === 404) { const e = new Error('Auf dem Server fehlt noch pb_hooks/sitzungen.pb.js (und pinn-sitzungen.js).'); e.code = 'alt'; throw e; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Geräte konnten nicht geladen werden.');
  return body;
}
// Sign out one device; „Dieses Gerät“ (this device) = sign out the normal way
async function devLogoutOne(btn, statusEl, after) {
  const name = btn.dataset.name || 'Gerät';
  if (btn.dataset.dieses === '1') {
    if (confirm('Dieses Gerät abmelden?')) logout();
    return;
  }
  if (!confirm(`„${name}“ abmelden? Das Gerät verliert sofort den Zugriff auf pinn.`)) return;
  btn.disabled = true;
  statusEl.textContent = '';
  try {
    await postJson('/api/pinn/sitzungen/abmelden', { id: btn.dataset.id });
    statusEl.textContent = 'Gerät abgemeldet.';
  } catch (e) {
    statusEl.textContent = e.message;
  }
  after();
}
// Own profile: sign out all other devices – this device gets a new sign-in
async function devLogoutOthers(statusEl, after) {
  if (!confirm('Alle anderen Geräte abmelden? Nur dieses Gerät bleibt angemeldet.')) return;
  statusEl.textContent = '';
  try {
    const res = await apiFetch('/api/pinn/sitzungen/alle-abmelden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.token) throw new Error(body.error || 'Das hat nicht geklappt.');
    pb.authStore.save(body.token, body.record);
    statusEl.textContent = 'Alle anderen Geräte sind abgemeldet.';
    // Re-assign this device's push right away (in case it did not belong to the session yet)
    try { if (pushAutoSyncEnabled) { pushLastAutoSync = 0; syncPushSubscription(); } } catch (e) { /* ignore */ }
  } catch (e) {
    statusEl.textContent = e.message;
  }
  after();
}

/* ---------- Account: own devices ---------- */
let devSectionLoading = false;
async function renderDevicesSection() {
  const sec = document.getElementById('devicesSection');
  if (!sec) return;
  const hide = isCurrentUserGuest() || isCurrentUserMainAdmin();
  sec.classList.toggle('hidden', hide);
  if (hide || devSectionLoading) return;
  const list = document.getElementById('devicesList');
  const btn = document.getElementById('devicesLogoutOthersBtn');
  if (!navigator.onLine) { list.innerHTML = '<p class="sm-empty">Keine Verbindung zum Server.</p>'; btn.classList.add('hidden'); return; }
  devSectionLoading = true;
  let data = null;
  try {
    data = await devFetchList('');
  } catch (e) {
    devSectionLoading = false;
    if (e.code === 'alt') { sec.classList.add('hidden'); return; }
    list.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message)}</p>`;
    return;
  }
  devSectionLoading = false;
  const ses = data.sitzungen || [];
  list.innerHTML = devRowsHtml(ses);
  btn.classList.toggle('hidden', !ses.some(s => !s.dieses) && !data.aktuellOhneSitzung);
  const status = document.getElementById('devicesStatus');
  list.querySelectorAll('.dev-out').forEach(b => b.addEventListener('click', () => devLogoutOne(b, status, renderDevicesSection)));
}
document.getElementById('devicesLogoutOthersBtn').addEventListener('click', () =>
  devLogoutOthers(document.getElementById('devicesStatus'), renderDevicesSection));

/* ---------- Manage profiles: number of devices and lock per profile ---------- */
async function renderProfileDeviceInfo() {
  if (!isCurrentUserAdmin() || !navigator.onLine) return;
  let data = null;
  try {
    const res = await apiFetch('/api/pinn/sitzungen/uebersicht', { cache: 'no-store' });
    if (!res.ok) return;
    data = await res.json();
  } catch (e) { return; }
  const map = (data && data.profile) || {};
  document.querySelectorAll('#profileList .pdev-info').forEach(el => {
    const x = map[el.dataset.id];
    if (!x) { el.textContent = ''; return; }
    const parts = [];
    if (x.geraete) parts.push(' · 📱 ' + x.geraete);
    const locked = x.sperre && (x.sperre.sekunden > 0 || x.sperre.pin > 0);
    el.innerHTML = escapeHtml(parts.join('')) + (locked ? ' · <span class="text-red-500">🔒 gesperrt</span>' : '');
  });
}

/* ---------- Popup: devices & sign-in of a profile ---------- */
let devModalUser = null; // { id, name, own }
function openDevModal(userId, name) {
  devModalUser = { id: String(userId || ''), name: String(name || ''), own: false };
  document.getElementById('devModalName').textContent = devModalUser.name;
  document.getElementById('devModalStatus').textContent = '';
  document.getElementById('devModalLock').classList.add('hidden');
  document.getElementById('devModalList').innerHTML = '<p class="sm-empty">Wird geladen …</p>';
  pinnModalToTop('devModal').classList.remove('hidden');
  loadDevModal();
}
function closeDevModal() {
  document.getElementById('devModal').classList.add('hidden');
  devModalUser = null;
  if (typeof currentView !== 'undefined' && currentView === 'konto') { renderProfileDeviceInfo(); renderDevicesSection(); }
}
async function loadDevModal() {
  const u = devModalUser;
  if (!u) return;
  const list = document.getElementById('devModalList');
  const allBtn = document.getElementById('devModalAllBtn');
  if (!navigator.onLine) { list.innerHTML = '<p class="sm-empty">Keine Verbindung zum Server.</p>'; return; }
  let data = null;
  try {
    data = await devFetchList(u.id);
  } catch (e) {
    if (devModalUser !== u) return;
    list.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message)}</p>`;
    allBtn.classList.add('hidden');
    return;
  }
  if (devModalUser !== u) return;
  u.own = !!data.eigenes;
  if (data.benutzer && data.benutzer.username) u.name = data.benutzer.username;
  document.getElementById('devModalName').textContent = u.name;
  // Lock after failed attempts
  const lock = data.sperre || null;
  const parts = [];
  if (lock) {
    if (lock.sekunden > 0) parts.push('Anmeldung gesperrt – noch ' + devWait(lock.sekunden) + '.');
    else if (lock.fehlversuche > 0) parts.push(lock.fehlversuche + ' falsche Passwörter seit der letzten Anmeldung.');
    if (lock.pin > 0) parts.push('Dashboard-PIN gesperrt – noch ' + devWait(lock.pin) + '.');
  }
  document.getElementById('devModalLock').classList.toggle('hidden', !parts.length);
  document.getElementById('devModalLockText').textContent = parts.join(' ');
  document.getElementById('devModalUnlockBtn').classList.toggle('hidden', !(lock && (lock.sekunden > 0 || lock.pin > 0 || lock.fehlversuche > 0)));
  // Devices
  const ses = data.sitzungen || [];
  list.innerHTML = devRowsHtml(ses);
  const status = document.getElementById('devModalStatus');
  list.querySelectorAll('.dev-out').forEach(b => b.addEventListener('click', () => devLogoutOne(b, status, loadDevModal)));
  allBtn.textContent = u.own ? 'Alle anderen Geräte abmelden' : 'Überall abmelden';
  allBtn.classList.toggle('hidden', u.own ? (!ses.some(s => !s.dieses) && !data.aktuellOhneSitzung) : false);
}
document.getElementById('devModalClose').addEventListener('click', closeDevModal);
document.getElementById('devModal').addEventListener('click', (e) => { if (e.target.id === 'devModal') closeDevModal(); });
document.getElementById('devModalReload').addEventListener('click', () => { document.getElementById('devModalStatus').textContent = ''; loadDevModal(); });
document.getElementById('devModalAllBtn').addEventListener('click', async () => {
  const u = devModalUser;
  if (!u) return;
  const status = document.getElementById('devModalStatus');
  if (u.own) { await devLogoutOthers(status, loadDevModal); return; }
  if (!confirm(`„${u.name}“ auf allen Geräten abmelden? Benachrichtigungen auf diesen Geräten enden ebenfalls.`)) return;
  status.textContent = '';
  try {
    await postJson('/api/pinn/sitzungen/alle-abmelden', { benutzer: u.id });
    status.textContent = 'Auf allen Geräten abgemeldet.';
  } catch (e) {
    status.textContent = e.message;
  }
  loadDevModal();
});
document.getElementById('devModalUnlockBtn').addEventListener('click', async () => {
  const u = devModalUser;
  if (!u) return;
  const status = document.getElementById('devModalStatus');
  status.textContent = '';
  try {
    await postJson('/api/pinn/sitzungen/entsperren', { benutzer: u.id });
    status.textContent = 'Sperre aufgehoben – die Anmeldung ist wieder möglich.';
  } catch (e) {
    status.textContent = e.message;
  }
  loadDevModal();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('geraete');
