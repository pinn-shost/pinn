/* pinn. – Error log (js/fehlerprotokoll.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: error log for admins (Settings → System and the main admin screen: summary with red badge,
   list with filters, details, copy, delete), the „Auf Update prüfen“ button and the settings accordion
   that keeps only one section open. */

/* ==========================================================
   Error log (admins) – pb_hooks/protokoll.pb.js
   ----------------------------------------------------------
   Errors of the server hooks (calendar sync, push, waste calendar, sign-in) shown in the app instead of
   the Docker log. Settings → System → „Fehlerprotokoll“, or for the main admin „🧾 Fehlerprotokoll“.
   New open errors since the last visit show a red number on the button (remembered on the device).
   ========================================================== */
// label is read through a getter, so it always comes in the language of the app (text keys errorLog.area.*)
const ERRLOG_BEREICHE = [
  { id: 'sync', key: 'errorLog.area.sync', ico: '🔄' },
  { id: 'push', key: 'errorLog.area.push', ico: '🔔' },
  { id: 'muell', key: 'errorLog.area.waste', ico: '🗑️' },
  { id: 'anmeldung', key: 'errorLog.area.signIn', ico: '🔒' },
  { id: 'system', key: 'errorLog.area.system', ico: '⚙️' },
].map(b => Object.defineProperty(b, 'label', { get() { return tk(this.key); }, enumerable: true }));
const LS_ERRLOG_SEEN = 'pinn.protokollGesehen';
let errLogData = null;
let errLogFilter = '';
let errLogOpenId = '';
function errLogCanUse() {
  return (isCurrentUserAdmin() || isCurrentUserMainAdmin()) && !isCurrentUserGuest();
}
function errLogSeen() {
  try { return localStorage.getItem(LS_ERRLOG_SEEN) || ''; } catch (e) { return ''; }
}
function errLogBereich(id) {
  return ERRLOG_BEREICHE.find(b => b.id === id) || { id: id, label: id || tk('errorLog.area.system'), ico: '⚙️' };
}
// Summary under Settings → System and the red number on the buttons
async function errLogRefreshSummary() {
  const sub = document.getElementById('errLogSub');
  const show = errLogCanUse() && !(typeof childLockActive === 'function' && childLockActive());
  if (sub) sub.classList.toggle('hidden', !show);
  if (!show || !navigator.onLine) return;
  let k = null;
  try {
    const res = await apiFetch('/api/pinn/protokoll/kurz', { cache: 'no-store' });
    if (res.ok) k = await res.json();
  } catch (e) { k = null; }
  if (!k || !k.darf) { if (sub) sub.classList.add('hidden'); return; }
  const parts = [];
  parts.push(k.offen > 0 ? tk('errorLog.openErrors', { n: k.offen }) : tk('errorLog.noOpenErrors'));
  if (k.warnungen > 0) parts.push(tk('errorLog.warnings', { n: k.warnungen }));
  if (k.neueste) parts.push(tk('errorLog.lastAt', { when: devFmtWhen(k.neueste) }));
  const sum = document.getElementById('errLogSummary');
  if (sum) sum.textContent = parts.join(' · ');
  const fresh = k.offen > 0 && k.neueste && k.neueste > errLogSeen();
  ['errLogBadge', 'mainAdminErrLogBadge'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.textContent = String(k.offen > 9 ? '9+' : k.offen);
    b.classList.toggle('hidden', !fresh);
  });
}
async function openErrLog() {
  pinnModalToTop('errLogModal').classList.remove('hidden');
  errLogOpenId = '';
  await errLogLoad();
}
function closeErrLog() {
  document.getElementById('errLogModal').classList.add('hidden');
  errLogRefreshSummary();
}
async function errLogLoad() {
  const list = document.getElementById('errLogList');
  document.getElementById('errLogStatus').textContent = '';
  if (!navigator.onLine) { list.innerHTML = `<p class="sm-empty">${escapeHtml(tk('common.noConnection'))}</p>`; return; }
  if (!errLogData) list.innerHTML = `<p class="sm-empty">${escapeHtml(tk('common.loading'))}</p>`;
  try {
    const res = await apiFetch('/api/pinn/protokoll?limit=300', { cache: 'no-store' });
    if (res.status === 404) throw new Error(tk('errorLog.serverMissing'));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || tk('errorLog.loadFailed'));
    errLogData = body;
  } catch (e) {
    list.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message)}</p>`;
    document.getElementById('errLogFilter').innerHTML = '';
    return;
  }
  const items = errLogData.eintraege || [];
  if (items.length) { try { localStorage.setItem(LS_ERRLOG_SEEN, items[0].zuletzt || ''); } catch (e) { /* ignore */ } }
  errLogRender();
}
function errLogRender() {
  const items = (errLogData && errLogData.eintraege) || [];
  const counts = {};
  items.forEach(x => { counts[x.bereich] = (counts[x.bereich] || 0) + 1; });
  if (errLogFilter && !counts[errLogFilter]) errLogFilter = '';
  const chips = [{ id: '', label: tk('errorLog.all'), n: items.length }].concat(
    ERRLOG_BEREICHE.filter(b => counts[b.id]).map(b => ({ id: b.id, label: b.ico + ' ' + b.label, n: counts[b.id] })));
  const filterEl = document.getElementById('errLogFilter');
  filterEl.innerHTML = items.length ? chips.map(c =>
    `<button type="button" class="el-chip${c.id === errLogFilter ? ' on' : ''}" data-f="${c.id}">${escapeHtml(c.label)}<small data-no-i18n>${c.n}</small></button>`).join('') : '';
  filterEl.querySelectorAll('.el-chip').forEach(b => b.addEventListener('click', () => { errLogFilter = b.dataset.f; errLogRender(); }));

  const list = document.getElementById('errLogList');
  const shown = errLogFilter ? items.filter(x => x.bereich === errLogFilter) : items;
  if (!shown.length) {
    list.innerHTML = `<p class="sm-empty">${escapeHtml(tk('errorLog.empty'))}</p>`;
  } else {
    const hauptadmin = !!errLogData.hauptadmin;
    list.innerHTML = shown.map(x => {
      const b = errLogBereich(x.bereich);
      const ico = x.stufe === 'fehler' ? '⛔' : (x.stufe === 'warnung' ? '⚠️' : 'ℹ️');
      const sub = [b.label];
      if (hauptadmin) sub.push(x.familie ? (x.familienName || tk('errorLog.deletedFamily')) : tk('errorLog.server'));
      sub.push(devFmtWhen(x.zuletzt));
      if (x.anzahl > 1) sub.push(tk('errorLog.repeatedSince', { n: x.anzahl, when: devFmtWhen(x.erstes) }));
      const open = x.id === errLogOpenId;
      return `<div class="sm-row el-row${x.behoben ? ' done' : ''}" data-id="${escapeHtml(x.id)}">
        <div class="sm-row-ico el-ico-${escapeHtml(x.stufe)}">${ico}</div>
        <div class="sm-row-main">
          <span class="sm-row-title" data-no-i18n>${escapeHtml(x.meldung)}</span>
          <span class="sm-row-sub">${escapeHtml(sub.join(' · '))}${x.behoben ? ` · <span class="el-ok">${escapeHtml(tk('errorLog.okAgain'))}</span>` : ''}</span>
          ${open ? `${x.details ? `<pre class="el-details" data-no-i18n>${escapeHtml(x.details)}</pre>` : ''}
          <div class="flex flex-wrap gap-2 mt-2"><button type="button" class="sm-btn sm-small el-copy" data-id="${escapeHtml(x.id)}">${escapeHtml(tk('common.copy'))}</button><button type="button" class="sm-btn sm-small el-del" data-id="${escapeHtml(x.id)}">${escapeHtml(tk('common.delete'))}</button></div>` : ''}
        </div>
      </div>`;
    }).join('');
  }
  list.querySelectorAll('.el-row').forEach(r => r.addEventListener('click', (ev) => {
    if (ev.target.closest('button')) return;
    errLogOpenId = errLogOpenId === r.dataset.id ? '' : r.dataset.id;
    errLogRender();
  }));
  list.querySelectorAll('.el-del').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await postJson('/api/pinn/protokoll/leeren', { id: btn.dataset.id });
      errLogOpenId = '';
      await errLogLoad();
    } catch (e) { document.getElementById('errLogStatus').textContent = e.message; }
  }));
  list.querySelectorAll('.el-copy').forEach(btn => btn.addEventListener('click', async () => {
    const x = items.find(i => i.id === btn.dataset.id);
    if (!x) return;
    const text = '[' + x.bereich + '/' + x.stufe + '] ' + x.zuletzt + (x.anzahl > 1 ? ' (' + x.anzahl + '×)' : '') + '\n' + x.meldung + (x.details ? '\n' + x.details : '');
    try { await navigator.clipboard.writeText(text); document.getElementById('errLogStatus').textContent = tk('common.copied'); }
    catch (e) { document.getElementById('errLogStatus').textContent = tk('errorLog.copyFailed'); }
  }));
  document.getElementById('errLogClearDone').disabled = !items.some(x => x.behoben || x.stufe !== 'fehler');
  document.getElementById('errLogClearAll').disabled = !items.length;
}
async function errLogClear(art) {
  const q = tk(art === 'alle' ? 'errorLog.clearAllConfirm' : 'errorLog.clearDoneConfirm');
  if (!confirm(q)) return;
  try {
    const r = await postJson('/api/pinn/protokoll/leeren', { art });
    errLogOpenId = '';
    await errLogLoad();
    document.getElementById('errLogStatus').textContent = tk('errorLog.deleted', { n: r.geloescht || 0 });
  } catch (e) {
    document.getElementById('errLogStatus').textContent = e.message;
  }
}
document.getElementById('openErrLogBtn').addEventListener('click', () => openErrLog());
document.getElementById('errLogClose').addEventListener('click', closeErrLog);
document.getElementById('errLogModal').addEventListener('click', (e) => { if (e.target.id === 'errLogModal') closeErrLog(); });
document.getElementById('errLogReload').addEventListener('click', () => errLogLoad());
document.getElementById('errLogClearDone').addEventListener('click', () => errLogClear('behoben'));
document.getElementById('errLogClearAll').addEventListener('click', () => errLogClear('alle'));
(function () {
  const acc = document.getElementById('settingsSystemAccordion');
  if (acc) acc.addEventListener('toggle', () => { if (acc.open) { sysRefreshSummary(); errLogRefreshSummary(); exportRefreshSub(); } });
})();

// „Auf Update prüfen“ (check for update): admins see the new version on GitHub with an install button,
// everyone else checks as before whether the server already has a newer app file.
document.getElementById('checkUpdateBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('versionCheckStatus');
  statusEl.textContent = tk('settings.system.checking');
  const hasUpdate = await checkForAppUpdate(false);
  if (hasUpdate) {
    statusEl.textContent = tk('settings.system.newVersionFound');
    hardReload();
    return;
  }
  if (sysCanUse() && navigator.onLine) {
    statusEl.textContent = '';
    openSysMaint({ pruefen: true });
    return;
  }
  statusEl.textContent = tk('settings.system.upToDate', { version: APP_VERSION });
  setTimeout(() => { statusEl.textContent = ''; }, 4000);
});

/* ---------- Settings: only one section open at a time ----------
   Opening a section closes the one opened last, and the opened one slides up to the top edge with its
   heading – the same on phone, iPad and computer. */
(function settingsAccordionExclusive() {
  const root = document.getElementById('settingsView');
  if (!root) return;
  const all = () => [...root.querySelectorAll('details.settings-accordion')];
  all().forEach(det => det.addEventListener('toggle', () => {
    if (!det.open) return;
    let closedAbove = false;
    all().forEach(o => {
      if (o === det || !o.open) return;
      if (o.compareDocumentPosition(det) & Node.DOCUMENT_POSITION_FOLLOWING) closedAbove = true;
      o.open = false;
    });
    // wait two frames until the previous section has finished collapsing in the layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
      det.scrollIntoView({ block: 'start', behavior: closedAbove ? 'auto' : 'smooth' });
    }));
  }));
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('fehlerprotokoll');
