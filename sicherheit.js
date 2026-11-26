/* pinn. – Security overview (js/sicherheit.js, since 1.153.0)
   Classic script, no build step; the load order is listed in src/rahmen.html and in pinn-setup.sh.
   Contents:
   - Settings → Security (family admins only): groups of Home Assistant devices (windows & doors, locks, cameras,
     garage door / shutters, smoke & water detectors, alarm system, motion), where to show them, evening check.
     The group editor is the popup #secGroupModal (src/teile/popups/sicherheit.html).
   - Overview tile "Security" (renderSecurityTile, secTileAvailable) with a lock button for adults.
   - Bottom bar of the family dashboard (secDashStart / secDashStop, called from js/profilauswahl.js).
   The server (pb_hooks/pinn-sicherheit.js) reads Home Assistant and answers with structured groups:
   { id, name, art, icon, stufe: ok | warn | alarm | aus | info | offline, anzahl, aktiv: [{ name, zustand, alarm, entity? }], offline: [...] }.
   The sentences ("All closed", "Kitchen window is open", "1 camera is on" …) are built here in the language of the device. */

const SEC_KINDS = [
  { id: 'oeffnung', icon: '🪟', evening: true },
  { id: 'schloss', icon: '🔐', evening: true },
  { id: 'kamera', icon: '📷', evening: false },
  { id: 'rollladen', icon: '🚗', evening: true },
  { id: 'melder', icon: '🔥', evening: true },
  { id: 'alarm', icon: '🚨', evening: true },
  { id: 'bewegung', icon: '🏃', evening: false },
];
const SEC_ICONS = ['🪟', '🚪', '🔐', '🔑', '📷', '🚗', '🏠', '🔥', '💧', '🚨', '🏃', '🛡️'];
const SEC_DASH_POLL_MS = 30 * 1000;
const SEC_APP_POLL_MS = 60 * 1000;

let secStatus = null;          // last answer of /api/pinn/sicherheit/status (app)
let secStatusAt = 0;           // last successful answer
let secTriedAt = 0;            // last attempt (also when offline) - keeps the tile from asking in a loop
let secStatusFamily = '';      // family of secStatus (another profile may log in on the same device)
let secStatusLoading = false;
let secSettings = null;        // { gruppen, dashboard, uebersicht, abend } (admin)
let secHaConnected = false;
let secEntities = null;        // [{ id, name, domain, dc, state }] from Home Assistant (admin, group editor)
let secEditGroup = null;       // group being edited in the popup
let secLocking = new Set();
let secDashTimer = null;
let secDashKey = '';

function secKind(id) { return SEC_KINDS.find(k => k.id === id) || SEC_KINDS[0]; }
function secKindLabel(id) { return tk('security.kind.' + secKind(id).id); }
function secNames(list) { return list.map(d => d.name).join(', '); }
function secTimeText(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d) ? '' : d.toLocaleTimeString(PINN_I18N.language.locale, { hour: '2-digit', minute: '2-digit' });
}

/* ---------- Sentences per group ---------- */
function secSummary(g) {
  if (g.stufe === 'offline') return tk('security.sum.offline');
  const a = g.aktiv || [];
  let text = '';
  switch (g.art) {
    case 'oeffnung':
    case 'rollladen':
      text = !a.length ? tk('security.sum.allClosed')
        : a.length === 1 ? tk('security.sum.oneOpen', { name: a[0].name })
          : tk('security.sum.open', { names: secNames(a) });
      break;
    case 'schloss': {
      const jammed = a.filter(d => d.alarm);
      const open = a.filter(d => !d.alarm);
      if (jammed.length) text = tk('security.sum.jammed', { names: secNames(jammed) });
      else if (!open.length) text = tk('security.sum.allLocked');
      else text = open.length === 1 ? tk('security.sum.oneUnlocked', { name: open[0].name }) : tk('security.sum.unlocked', { names: secNames(open) });
      break;
    }
    case 'kamera': {
      const reachable = (g.anzahl || 0) - (g.offline || []).length;
      if (!a.length) text = tk('security.sum.camerasOff');
      else if (a.length === reachable && reachable > 1) text = tk('security.sum.camerasAllOn');
      else text = tk('security.sum.camerasOn', { n: a.length });
      break;
    }
    case 'melder':
      text = a.length ? tk('security.sum.alarm', { names: secNames(a) }) : tk('security.sum.calm');
      break;
    case 'alarm':
      if (a.some(d => d.alarm)) text = tk('security.sum.triggered');
      else if (!a.length) text = tk('security.sum.armed');
      else text = /^(arming|pending)$/.test(a[0].zustand || '') ? tk('security.sum.arming') : tk('security.sum.disarmed');
      break;
    case 'bewegung':
      text = a.length ? tk('security.sum.motion', { names: secNames(a) }) : tk('security.sum.noMotion');
      break;
  }
  if ((g.offline || []).length) text += ' · ' + tk('security.sum.someOffline', { names: secNames(g.offline) });
  return text;
}
function secGroupIcon(g) { return g.icon || secKind(g.art).icon; }
function secGroupName(g) { return g.name || secKindLabel(g.art); }
function secErrorText(st) {
  if (!st || !st.fehler) return '';
  return st.fehler === 'ha' ? tk('security.err.ha') : tk('security.err.connection');
}
// Overall level of all groups (for the shield in the tile header)
function secOverall(groups) {
  const order = ['alarm', 'warn', 'offline', 'info', 'ok'];
  let best = 'ok';
  // "aus" (cameras off) counts like a warning for the shield, it is no alarm
  (groups || []).forEach(g => { const l = g.stufe === 'aus' ? 'warn' : g.stufe; if (order.indexOf(l) < order.indexOf(best)) best = l; });
  return best;
}

/* ---------- Family dashboard: bar at the bottom (display only) ---------- */
function secDashHtml(st) {
  if (!st || !st.aktiv || !(st.gruppen || []).length) return '';
  const err = secErrorText(st);
  const pills = st.gruppen.map(g => `
    <div class="sec-pill lvl-${escapeHtml(g.stufe)}">
      <span class="sec-pill-ico">${escapeHtml(secGroupIcon(g))}</span>
      <span class="sec-pill-txt"><span class="sec-pill-name">${escapeHtml(secGroupName(g))}</span><span class="sec-pill-sum">${escapeHtml(secSummary(g))}</span></span>
      <span class="sec-dot" aria-hidden="true"></span>
    </div>`).join('');
  return `${err ? `<p class="sec-dash-err">${escapeHtml(err)}</p>` : ''}<div class="sec-pills">${pills}</div>`;
}
async function secDashLoad() {
  const box = document.getElementById('dashSecurity');
  if (!box || !secDashKey) return;
  if (document.visibilityState !== 'visible') return;
  let body = null;
  try {
    const res = await fetch('/api/pinn/sicherheit/dashboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: secDashKey }), cache: 'no-store',
    });
    if (!res.ok) { if (res.status === 404) { box.classList.add('hidden'); box.innerHTML = ''; } return; }
    body = await res.json();
  } catch (e) { return; } // offline: keep what is shown
  if (!secDashKey) return;
  const html = secDashHtml(body);
  box.innerHTML = html;
  box.classList.toggle('hidden', !html);
}
function secDashStart(key) {
  secDashKey = String(key || '');
  clearInterval(secDashTimer);
  secDashTimer = secDashKey ? setInterval(secDashLoad, SEC_DASH_POLL_MS) : null;
  secDashLoad();
}
function secDashStop() {
  secDashKey = '';
  clearInterval(secDashTimer);
  secDashTimer = null;
}

/* ---------- Overview tile ---------- */
function secCanLock() {
  if (isCurrentUserGuest()) return false;
  const me = currentMember();
  return !(me && memberIsChild(me));
}
function secTileAvailable() {
  if (isCurrentUserGuest() || (secStatusFamily && secStatusFamily !== familyRecordId)) return false;
  return !!(secStatus && secStatus.aktiv && secStatus.uebersicht !== false && (secStatus.gruppen || []).length);
}
async function secLoadStatus(force) {
  if (secStatusLoading || !familyRecordId || isCurrentUserGuest()) return;
  if (!force && Date.now() - secTriedAt < SEC_APP_POLL_MS - 2000) return;
  secStatusLoading = true;
  secTriedAt = Date.now();
  const before = secTileAvailable();
  try {
    const res = await apiFetch('/api/pinn/sicherheit/status');
    if (res.ok) { secStatus = await res.json(); secStatusAt = Date.now(); secStatusFamily = familyRecordId; }
    else if (res.status === 404 || res.status === 403) { secStatus = null; secStatusAt = Date.now(); secStatusFamily = familyRecordId; } // older server or guest
  } catch (e) { /* offline: keep the last state */ }
  secStatusLoading = false;
  renderSecurityTile();
  // only a change of visibility needs a new grid (refreshOverviewTiles compares the visible tiles itself)
  if (before !== secTileAvailable()) { try { refreshOverviewTiles(); } catch (e) { /* overview not built yet */ } }
}
function renderSecurityTile() {
  const body = document.getElementById('securityTileBody');
  if (!body) return;
  if (secStatusFamily && secStatusFamily !== familyRecordId) { secStatus = null; secStatusAt = 0; secTriedAt = 0; secStatusFamily = ''; }
  if (!secTriedAt) { secLoadStatus(false); return; }
  const st = secStatus;
  const time = document.getElementById('securityTileTime');
  if (!st || !st.aktiv) { body.innerHTML = ''; if (time) time.textContent = ''; return; }
  if (time) time.textContent = tk('security.updated', { time: secTimeText(st.zeit) });
  const err = secErrorText(st);
  const canLock = secCanLock();
  const overall = secOverall(st.gruppen);
  const head = overall === 'ok' && !err
    ? `<div class="sec-allok"><span class="sec-allok-ico">🛡️</span><span>${escapeHtml(tk('security.allSecure'))}</span></div>` : '';
  const rows = (st.gruppen || []).map(g => {
    const locks = canLock && g.art === 'schloss'
      ? (g.aktiv || []).filter(d => !d.alarm && d.entity).map(d => {
        const busy = secLocking.has(d.entity);
        return `<button type="button" class="sec-lock-btn" data-sec-lock="${escapeHtml(d.entity)}" data-sec-name="${escapeHtml(d.name)}" ${busy ? 'disabled' : ''}>🔒 ${escapeHtml(busy ? tk('security.locking') : (g.aktiv.length > 1 ? tk('security.lockName', { name: d.name }) : tk('security.lock')))}</button>`;
      }).join('') : '';
    return `
      <div class="sec-row lvl-${escapeHtml(g.stufe)}">
        <span class="sec-row-ico">${escapeHtml(secGroupIcon(g))}</span>
        <div class="sec-row-txt">
          <div class="sec-row-name">${escapeHtml(secGroupName(g))}</div>
          <div class="sec-row-sum">${escapeHtml(secSummary(g))}</div>
          ${locks ? `<div class="sec-row-acts">${locks}</div>` : ''}
        </div>
        <span class="sec-dot" aria-hidden="true"></span>
      </div>`;
  }).join('');
  body.innerHTML = (err ? `<p class="sec-tile-err">${escapeHtml(err)}</p>` : '') + head + `<div class="sec-rows">${rows}</div>`;
}
async function secLock(entity, name) {
  if (!entity || secLocking.has(entity)) return;
  if (!confirm(tk('security.lockConfirm', { name }))) return;
  secLocking.add(entity);
  renderSecurityTile();
  try {
    const res = await apiFetch('/api/pinn/sicherheit/zusperren', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || tk('smart.serverNoAnswer'));
  } catch (e) {
    alert(tk('security.lockFailed', { error: e.message }));
  }
  // the lock needs a few seconds until Home Assistant reports "locked"
  setTimeout(() => { secLocking.delete(entity); secLoadStatus(true); }, 4000);
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-sec-lock]');
  if (btn) secLock(btn.dataset.secLock, btn.dataset.secName || '');
});
// Quiet refresh while the overview is open and the app is in the foreground
function secTick() {
  if (document.visibilityState !== 'visible' || !familyRecordId) return;
  if (typeof currentView !== 'undefined' && currentView !== 'uebersicht') return;
  secLoadStatus(false);
}
setInterval(secTick, 15 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { secTick(); if (secDashKey) secDashLoad(); }
});

/* ---------- Settings → Security (family admins) ---------- */
function secRenderSettingsAccess() {
  const acc = document.getElementById('settingsSecurityAccordion');
  if (!acc) return;
  const admin = isCurrentUserAdmin();
  acc.classList.toggle('hidden', !admin);
  if (!admin && acc.open) acc.open = false;
}
async function secLoadSettings() {
  const status = document.getElementById('secSettingsStatus');
  if (status) status.textContent = tk('common.loading');
  try {
    const res = await apiFetch('/api/pinn/sicherheit/einstellungen');
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || tk('smart.serverNoAnswer'));
    secSettings = out.einstellungen;
    secHaConnected = !!out.haVerbunden;
    if (status) status.textContent = '';
  } catch (e) {
    secSettings = null;
    if (status) status.textContent = tk('security.loadFailed', { error: e.message });
  }
  renderSecuritySettings();
}
function secToggleHtml(id, on, labelKey) {
  return `
    <label class="flex items-center gap-3 cursor-pointer w-fit sec-toggle">
      <span class="relative inline-block w-11 h-6 shrink-0">
        <input id="${id}" type="checkbox" class="peer sr-only" ${on ? 'checked' : ''} />
        <span class="absolute inset-0 rounded-full bg-ink/20 peer-checked:bg-pine transition"></span>
        <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition peer-checked:translate-x-5"></span>
      </span>
      <span class="text-sm">${escapeHtml(tk(labelKey))}</span>
    </label>`;
}
function renderSecuritySettings() {
  const box = document.getElementById('secSettingsBody');
  if (!box) return;
  const s = secSettings;
  if (!s) { box.innerHTML = ''; return; }
  const haHint = secHaConnected ? '' : `
    <div class="sec-need-ha">
      <p>${escapeHtml(tk('security.needHa'))}</p>
      <button type="button" id="secOpenHaBtn" class="sec-btn">${escapeHtml(tk('security.openHa'))} ›</button>
    </div>`;
  const groups = s.gruppen.length ? s.gruppen.map(g => `
    <button type="button" class="sec-set-row" data-sec-edit="${escapeHtml(g.id)}">
      <span class="sh-icon">${escapeHtml(secGroupIcon(g))}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium truncate">${escapeHtml(secGroupName(g))}</span>
        <span class="block text-[11px] text-ink/50 truncate">${escapeHtml(secKindLabel(g.art))} · ${escapeHtml(tk('security.devicesCount', { n: g.geraete.length }))}${g.abend && s.abend.an ? ' · 🌙' : ''}</span>
      </span>
      <span class="text-ink/30 shrink-0">›</span>
    </button>`).join('') : `<p class="text-xs text-ink/50">${escapeHtml(tk('security.noGroups'))}</p>`;
  box.innerHTML = `
    ${haHint}
    <h4 class="text-sm font-medium mb-2">${escapeHtml(tk('security.groups'))}</h4>
    <div class="flex flex-col gap-2 mb-2">${groups}</div>
    <button type="button" id="secAddGroupBtn" class="sec-add-btn" ${secHaConnected ? '' : 'disabled'}>${escapeHtml(tk('security.addGroup'))}</button>
    <div class="pt-4 mt-4 border-t border-ink/10 flex flex-col gap-3">
      <h4 class="text-sm font-medium">${escapeHtml(tk('security.showWhere'))}</h4>
      ${secToggleHtml('secShowDashboard', s.dashboard, 'security.showOnDashboard')}
      ${secToggleHtml('secShowOverview', s.uebersicht, 'security.showOnOverview')}
      <p class="text-[11px] text-ink/40">${escapeHtml(tk('security.showHint'))}</p>
    </div>
    <div class="pt-4 mt-4 border-t border-ink/10 flex flex-col gap-3">
      <h4 class="text-sm font-medium">🌙 ${escapeHtml(tk('security.evening'))}</h4>
      ${secToggleHtml('secEveningOn', s.abend.an, 'security.eveningToggle')}
      <label class="flex items-center gap-2 text-sm ${s.abend.an ? '' : 'opacity-50'}">
        <span>${escapeHtml(tk('security.eveningAt'))}</span>
        <input id="secEveningTime" type="time" step="300" class="rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white" value="${escapeHtml(s.abend.zeit)}" ${s.abend.an ? '' : 'disabled'} />
      </label>
      <p class="text-[11px] text-ink/40">${escapeHtml(tk('security.eveningHint'))}</p>
    </div>
    <p id="secSettingsSaved" class="text-xs text-ink/50 mt-3"></p>`;
  const openHa = box.querySelector('#secOpenHaBtn');
  if (openHa) openHa.addEventListener('click', () => { try { openSmartHomeModal('ha'); } catch (e) { /* smart home not loaded */ } });
  box.querySelector('#secAddGroupBtn').addEventListener('click', () => secOpenGroup(null));
  box.querySelectorAll('[data-sec-edit]').forEach(b => b.addEventListener('click', () => secOpenGroup(b.dataset.secEdit)));
  box.querySelector('#secShowDashboard').addEventListener('change', (e) => { s.dashboard = e.target.checked; secSaveSettings(); });
  box.querySelector('#secShowOverview').addEventListener('change', (e) => { s.uebersicht = e.target.checked; secSaveSettings(); });
  box.querySelector('#secEveningOn').addEventListener('change', (e) => { s.abend.an = e.target.checked; secSaveSettings(true); });
  box.querySelector('#secEveningTime').addEventListener('change', (e) => { if (e.target.value) { s.abend.zeit = e.target.value; secSaveSettings(); } });
}
async function secSaveSettings(rerender) {
  const saved = document.getElementById('secSettingsSaved');
  try {
    const res = await apiFetch('/api/pinn/sicherheit/einstellungen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ einstellungen: secSettings }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || tk('smart.serverNoAnswer'));
    secSettings = out.einstellungen;
    secHaConnected = !!out.haVerbunden;
    if (rerender) renderSecuritySettings();
    const el = document.getElementById('secSettingsSaved');
    if (el) { el.textContent = tk('security.saved'); setTimeout(() => { if (el.textContent === tk('security.saved')) el.textContent = ''; }, 2500); }
    secLoadStatus(true);
    return true;
  } catch (e) {
    if (saved) saved.textContent = tk('security.saveFailed', { error: e.message });
    else alert(tk('security.saveFailed', { error: e.message }));
    return false;
  }
}
(function () {
  const acc = document.getElementById('settingsSecurityAccordion');
  if (acc) acc.addEventListener('toggle', () => { if (acc.open) secLoadSettings(); });
})();

/* ---------- Group editor (popup) ---------- */
// Which Home Assistant entities fit a kind of group (without "show all")
function secEntityFits(kind, ent) {
  const d = ent.domain, dc = ent.dc || '';
  const text = (ent.id + ' ' + ent.name).toLowerCase();
  switch (kind) {
    case 'oeffnung':
      return (d === 'binary_sensor' && ['door', 'window', 'opening', 'garage_door'].includes(dc))
        || (d === 'cover' && ['door', 'window', 'garage', 'gate'].includes(dc));
    case 'schloss': return d === 'lock';
    case 'kamera': return d === 'camera' || ((d === 'switch' || d === 'binary_sensor') && /cam|kamera/.test(text));
    case 'rollladen': return d === 'cover' || (d === 'binary_sensor' && dc === 'garage_door');
    case 'melder': return d === 'binary_sensor' && ['smoke', 'moisture', 'gas', 'carbon_monoxide', 'heat', 'safety'].includes(dc);
    case 'alarm': return d === 'alarm_control_panel';
    case 'bewegung': return d === 'binary_sensor' && ['motion', 'occupancy', 'presence'].includes(dc);
  }
  return false;
}
async function secLoadEntities(force) {
  if (secEntities && !force) return;
  const list = document.getElementById('secGroupEntities');
  if (list) list.innerHTML = `<p class="text-xs text-ink/50 py-2">${escapeHtml(tk('security.loadingEntities'))}</p>`;
  try {
    const res = await apiFetch('/api/pinn/sicherheit/entitaeten');
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out.error) throw new Error(out.error || tk('smart.serverNoAnswer'));
    secEntities = Array.isArray(out.entitaeten) ? out.entitaeten : [];
  } catch (e) {
    secEntities = null;
    if (list) list.innerHTML = `<p class="text-xs text-red-500 py-2">${escapeHtml(tk('security.loadFailed', { error: e.message }))}</p>`;
  }
}
function secOpenGroup(id) {
  if (!secSettings) return;
  const g = id ? secSettings.gruppen.find(x => x.id === id) : null;
  secEditGroup = g
    ? { id: g.id, name: g.name, art: g.art, icon: g.icon || secKind(g.art).icon, abend: !!g.abend, geraete: g.geraete.map(d => ({ ...d })) }
    : { id: '', name: '', art: 'oeffnung', icon: secKind('oeffnung').icon, abend: true, geraete: [] };
  document.getElementById('secGroupTitle').textContent = tk(g ? 'security.editGroup' : 'security.newGroup');
  document.getElementById('secGroupName').value = secEditGroup.name;
  document.getElementById('secGroupSearch').value = '';
  document.getElementById('secGroupShowAll').checked = false;
  document.getElementById('secGroupDeleteBtn').classList.toggle('hidden', !g);
  document.getElementById('secGroupError').classList.add('hidden');
  document.getElementById('secGroupModal').classList.remove('hidden');
  secRenderGroupEditor();
  secLoadEntities(false).then(secRenderEntities);
}
function secCloseGroup() {
  document.getElementById('secGroupModal').classList.add('hidden');
  secEditGroup = null;
}
function secRenderGroupEditor() {
  const g = secEditGroup;
  if (!g) return;
  document.getElementById('secGroupKinds').innerHTML = SEC_KINDS.map(k =>
    `<button type="button" class="sh-chip${g.art === k.id ? ' active' : ''}" data-sec-kind="${k.id}">${escapeHtml(k.icon)} ${escapeHtml(secKindLabel(k.id))}</button>`).join('');
  document.getElementById('secGroupIcons').innerHTML = SEC_ICONS.map(ic =>
    `<button type="button" class="sh-icon${g.icon === ic ? ' active' : ''}" data-sec-icon="${escapeHtml(ic)}">${escapeHtml(ic)}</button>`).join('');
  const evening = document.getElementById('secGroupEvening');
  evening.checked = g.abend;
  document.getElementById('secGroupEveningRow').classList.toggle('hidden', g.art === 'kamera' || g.art === 'bewegung');
  secRenderEntities();
}
function secRenderEntities() {
  const g = secEditGroup;
  const list = document.getElementById('secGroupEntities');
  const count = document.getElementById('secGroupCount');
  if (!g || !list) return;
  if (count) count.textContent = g.geraete.length ? '(' + g.geraete.length + ')' : '';
  if (!secEntities) return;
  const q = document.getElementById('secGroupSearch').value.trim().toLowerCase();
  const all = document.getElementById('secGroupShowAll').checked;
  const chosen = new Set(g.geraete.map(d => d.entity));
  const known = new Set(secEntities.map(e => e.id));
  const rows = [];
  // chosen devices first (also those Home Assistant does not know any more)
  g.geraete.forEach(d => {
    const ent = secEntities.find(e => e.id === d.entity) || { id: d.entity, name: d.name, domain: d.entity.split('.')[0], dc: '', state: '' };
    if (q && !(ent.id + ' ' + ent.name).toLowerCase().includes(q)) return;
    rows.push({ ent, on: true, missing: !known.has(d.entity) });
  });
  secEntities.forEach(ent => {
    if (chosen.has(ent.id)) return;
    if (!all && !secEntityFits(g.art, ent)) return;
    if (q && !(ent.id + ' ' + ent.name).toLowerCase().includes(q)) return;
    rows.push({ ent, on: false, missing: false });
  });
  if (!rows.length) {
    list.innerHTML = `<p class="text-xs text-ink/50 py-2">${escapeHtml(tk(all || q ? 'security.noMatch' : 'security.noEntities'))}</p>`;
    return;
  }
  list.innerHTML = rows.slice(0, 300).map(r => `
    <label class="sec-ent${r.on ? ' on' : ''}">
      <input type="checkbox" data-sec-ent="${escapeHtml(r.ent.id)}" data-sec-ent-name="${escapeHtml(r.ent.name)}" ${r.on ? 'checked' : ''} />
      <span class="sec-ent-txt">
        <span class="sec-ent-name">${escapeHtml(r.ent.name)}</span>
        <span class="sec-ent-id">${escapeHtml(r.ent.id)}${r.missing ? ' · ' + escapeHtml(tk('security.missing')) : (r.ent.state ? ' · ' + escapeHtml(r.ent.state) : '')}</span>
      </span>
    </label>`).join('');
}
async function secSaveGroup() {
  const g = secEditGroup;
  if (!g || !secSettings) return;
  const err = document.getElementById('secGroupError');
  g.name = document.getElementById('secGroupName').value.trim().slice(0, 40);
  g.abend = document.getElementById('secGroupEvening').checked && g.art !== 'kamera' && g.art !== 'bewegung';
  const fail = (key) => { err.textContent = tk(key); err.classList.remove('hidden'); };
  if (!g.name) return fail('security.nameNeeded');
  if (!g.geraete.length) return fail('security.pickDevice');
  const list = secSettings.gruppen.slice();
  const i = g.id ? list.findIndex(x => x.id === g.id) : -1;
  const clean = { id: g.id, name: g.name, art: g.art, icon: g.icon, abend: g.abend, geraete: g.geraete };
  if (i >= 0) list[i] = clean; else list.push(clean);
  const before = secSettings.gruppen;
  secSettings.gruppen = list;
  const btn = document.getElementById('secGroupSaveBtn');
  btn.disabled = true;
  const ok = await secSaveSettings(true);
  btn.disabled = false;
  if (ok) secCloseGroup();
  else { secSettings.gruppen = before; fail('security.saveFailedShort'); }
}
async function secDeleteGroup() {
  const g = secEditGroup;
  if (!g || !g.id || !secSettings) return;
  if (!confirm(tk('security.confirmDelete', { name: g.name || secKindLabel(g.art) }))) return;
  const before = secSettings.gruppen;
  secSettings.gruppen = before.filter(x => x.id !== g.id);
  if (await secSaveSettings(true)) secCloseGroup();
  else secSettings.gruppen = before;
}
(function () {
  const modal = document.getElementById('secGroupModal');
  if (!modal) return;
  document.getElementById('secGroupCloseBtn').addEventListener('click', secCloseGroup);
  document.getElementById('secGroupCancelBtn').addEventListener('click', secCloseGroup);
  document.getElementById('secGroupSaveBtn').addEventListener('click', secSaveGroup);
  document.getElementById('secGroupDeleteBtn').addEventListener('click', secDeleteGroup);
  modal.addEventListener('click', (e) => { if (e.target === modal) secCloseGroup(); });
  document.getElementById('secGroupSearch').addEventListener('input', secRenderEntities);
  document.getElementById('secGroupShowAll').addEventListener('change', secRenderEntities);
  document.getElementById('secGroupKinds').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec-kind]');
    if (!b || !secEditGroup) return;
    const g = secEditGroup;
    const prev = secKind(g.art);
    g.art = b.dataset.secKind;
    // keep an icon chosen by hand, otherwise take the icon and evening default of the new kind
    if (g.icon === prev.icon) g.icon = secKind(g.art).icon;
    if (!g.geraete.length) g.abend = secKind(g.art).evening;
    secRenderGroupEditor();
  });
  document.getElementById('secGroupIcons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec-icon]');
    if (!b || !secEditGroup) return;
    // the line icons hide the emoji in a span: the button keeps it in data-sec-icon
    secEditGroup.icon = b.dataset.secIcon;
    secRenderGroupEditor();
  });
  document.getElementById('secGroupEntities').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-sec-ent]');
    if (!cb || !secEditGroup) return;
    const g = secEditGroup;
    const id = cb.dataset.secEnt;
    if (cb.checked) {
      if (!g.geraete.some(d => d.entity === id) && g.geraete.length < 40) g.geraete.push({ entity: id, name: cb.dataset.secEntName || id });
    } else {
      g.geraete = g.geraete.filter(d => d.entity !== id);
    }
    // a group without its own name takes the name of the kind, so the admin only has to pick devices
    const nameEl = document.getElementById('secGroupName');
    if (!nameEl.value.trim() && g.geraete.length) nameEl.value = secKindLabel(g.art);
    const count = document.getElementById('secGroupCount');
    if (count) count.textContent = g.geraete.length ? '(' + g.geraete.length + ')' : '';
    cb.closest('.sec-ent').classList.toggle('on', cb.checked);
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sicherheit');
