/* pinn. – Backups & updates (js/sicherungen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: Settings → System → backups & updates (also on the main admin screen): summary, update check
   and install, backups (list, back up now, restore), progress across the restart of pinn., shared helpers
   pinnModalToTop, sysCanUse, sysLocale (also used by other files at runtime).
   Since 1.66.0 also the developer area for pre-releases (search, warnings, install with automatic backup).
   Since 1.112.1 all texts come from text keys (maint.*, tk()); messages from the server are shown as they come. */

/* ==========================================================
   Backups & updates at the push of a button (Settings → System, main admin)
   ----------------------------------------------------------
   Server: pb_hooks/system.pb.js + pinn-system.js; the work is done by the container „wartung“
   (pinn-wartung.sh in the project folder). Viewing backups and „Jetzt sichern“: admins.
   Restore and updates: main admin, or an admin as long as there is only one family.
   During a restore/update pinn. is gone for a moment – progress then comes from
   /api/pinn/system/status (no sign-in needed, only the state of the job).
   ========================================================== */
let sysInfo = null;          // last response of /api/pinn/system
let sysShowAll = false;      // show all backups
let sysRestoreFile = '';     // selected backup
let sysPolling = false;
const SYS_ROWS = 8;
let sysDevInfo = null;       // last pre-release search (developer area), null = not searched yet
let sysDevBusy = false;

// Popups inside the fixed #appRoot always sit below the main admin screen (own
// stacking context) – so attach them directly to <body> when opening.
function pinnModalToTop(id) {
  const el = document.getElementById(id);
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
  return el;
}
function sysCanUse() {
  return isCurrentUserAdmin() || isCurrentUserMainAdmin();
}
function sysLocale() {
  return (window.PINN_I18N && PINN_I18N.language && PINN_I18N.language.locale) || 'de-DE';
}
function sysFmtWhen(sec) {
  if (!sec) return '';
  const d = new Date(sec * 1000);
  try {
    return d.toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      + ' · ' + d.toLocaleTimeString(sysLocale(), { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return d.toLocaleString(); }
}
function sysFmtSize(b) {
  const nf = (v, f) => { try { return new Intl.NumberFormat(sysLocale(), { maximumFractionDigits: f }).format(v); } catch (e) { return v.toFixed(f); } };
  if (b >= 1073741824) return nf(b / 1073741824, 1) + ' GB';
  if (b >= 1048576) return nf(b / 1048576, b >= 104857600 ? 0 : 1) + ' MB';
  return nf(Math.max(1, Math.round(b / 1024)), 0) + ' KB';
}
function sysSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Kind of a backup → icon + label (daily backups older than the retention days are weekly backups)
function sysBackupKind(b) {
  if (b.art === 'manuell') return { ico: '✋', label: tk('maint.kind.manual') };
  if (b.art === 'vor-update') return { ico: '⬆️', label: tk('maint.kind.beforeUpdate') };
  if (b.art === 'vor-wiederherstellung') return { ico: '↩️', label: tk('maint.kind.beforeRestore') };
  const tage = (sysInfo && sysInfo.wartung && sysInfo.wartung.tage) || 7;
  const alt = (Date.now() / 1000 - b.zeit) > (tage + 0.5) * 86400;
  return alt ? { ico: '📅', label: tk('maint.kind.weekly') } : { ico: '🌙', label: tk('maint.kind.daily') };
}

async function sysFetch(pruefen, vorab) {
  const q = [];
  if (pruefen) q.push('pruefen=1');
  if (vorab) q.push('vorab=1');
  const res = await apiFetch('/api/pinn/system' + (q.length ? '?' + q.join('&') : ''), { cache: 'no-store' });
  if (res.status === 404) { const e = new Error(tk('maint.serverMissing')); e.code = 'alt'; throw e; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || tk('common.failed'));
  return body;
}

/* ---------- Settings → System: summary ---------- */
async function sysRefreshSummary() {
  const sub = document.getElementById('sysBackupSub');
  const hint = document.getElementById('sysUpdateHint');
  if (!sub) return;
  const show = sysCanUse() && !(typeof childLockActive === 'function' && childLockActive());
  sub.classList.toggle('hidden', !show);
  if (!show) { hint.classList.add('hidden'); return; }
  const sum = document.getElementById('sysBackupSummary');
  if (!navigator.onLine) { sum.textContent = tk('common.noConnection'); return; }
  try {
    sysInfo = await sysFetch(false);
  } catch (e) {
    sum.textContent = e.message;
    hint.classList.add('hidden');
    return;
  }
  sum.textContent = sysSummaryText(sysInfo);
  const u = sysInfo.update || {};
  if (u.neuer && u.version) {
    document.getElementById('sysUpdateHintText').textContent = tk('maint.versionAvailable', { version: u.version });
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}
function sysSummaryText(info) {
  const w = info.wartung || {};
  if (!w.eingerichtet || !w.aktiv) return tk('maint.notRunningShort');
  const list = info.backups || [];
  if (!list.length) return tk('maint.noBackupYet');
  return tk('maint.lastBackup', { when: sysFmtWhen(list[0].zeit), n: list.length });
}

/* ---------- Modal ---------- */
function sysModalOpen() {
  return !document.getElementById('sysMaintModal').classList.contains('hidden');
}
async function openSysMaint(opts = {}) {
  const modal = pinnModalToTop('sysMaintModal');
  modal.classList.remove('hidden');
  document.getElementById('sysMaintProgress').classList.add('hidden');
  sysShowView('main');
  document.getElementById('sysMaintVersion').textContent = APP_VERSION;
  document.getElementById('sysUpdState').textContent = tk(opts.pruefen ? 'maint.checking' : 'common.loading');
  document.getElementById('sysBackupList').innerHTML = '';
  document.getElementById('sysBackupInfo').textContent = '';
  sysDevReset();
  await sysLoad(!!opts.pruefen);
}
function closeSysMaint() {
  if (sysPolling) return; // do not close while a job is running
  document.getElementById('sysMaintModal').classList.add('hidden');
  sysRefreshSummary();
}
function sysShowView(v) {
  document.getElementById('sysMaintMain').classList.toggle('hidden', v !== 'main');
  document.getElementById('sysRestorePanel').classList.toggle('hidden', v !== 'restore');
  const sc = document.querySelector('#sysMaintModal .sm-scroll');
  if (sc) sc.scrollTop = 0;
}
function sysNotice(text) {
  const n = document.getElementById('sysMaintNotice');
  n.classList.toggle('hidden', !text);
  document.getElementById('sysMaintNoticeText').textContent = text || '';
}

async function sysLoad(pruefen) {
  if (!navigator.onLine) { sysNotice(tk('common.noConnection')); document.getElementById('sysUpdState').textContent = ''; return; }
  try {
    sysInfo = await sysFetch(pruefen);
  } catch (e) {
    sysNotice(e.message);
    document.getElementById('sysUpdState').textContent = '';
    document.getElementById('sysBackupNowBtn').disabled = true;
    return;
  }
  sysRender();
  // Is a job running right now (e.g. started on another device)? Then show its progress right away.
  const j = sysInfo.job;
  if (j && (j.zustand === 'laeuft' || j.zustand === 'wartet') && !sysPolling) sysFollow(j.id, j.art, j.version);
}

function sysRender() {
  const info = sysInfo || {};
  const w = info.wartung || {};
  document.getElementById('sysMaintVersion').textContent = info.version || APP_VERSION;

  // Notes about the setup or the permissions
  let notice = '';
  if (!w.eingerichtet || !w.aktiv) notice = tk('maint.notRunning');
  else if (!w.docker) notice = tk('maint.noDocker');
  else if (!info.darf) notice = tk('maint.noPermission');
  sysNotice(notice);
  const kannAktion = !!(info.darf && w.aktiv && w.docker);

  // Updates
  const u = info.update || {};
  const st = document.getElementById('sysUpdState');
  const rel = document.getElementById('sysUpdRelease');
  const inst = document.getElementById('sysUpdInstallBtn');
  let text = '';
  if (u.neuer) text = tk('maint.versionAvailable', { version: u.version });
  else if (u.keine) text = tk('maint.noRelease');
  else if (u.fehler === 'limit') text = tk('maint.rateLimit');
  else if (u.fehler && !u.tag) text = tk('maint.githubDown');
  else if (u.tag) text = tk('maint.upToDate');
  const teile = [];
  if (text) teile.push(text);
  if (u.geprueft) teile.push(tk('maint.lastChecked', { when: sysFmtWhen(Math.floor(u.geprueft / 1000)) }));
  st.textContent = teile.join(' ');
  if (u.neuer) {
    rel.classList.remove('hidden');
    document.getElementById('sysUpdRelTitle').textContent = u.titel || ('pinn. ' + u.version);
    let datum = '';
    try { datum = u.datum ? new Date(u.datum).toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch (e) { datum = ''; }
    document.getElementById('sysUpdRelDate').textContent = datum;
    document.getElementById('sysUpdRelNotes').innerHTML = sysMarkdown(u.notizen || '');
    document.getElementById('sysUpdRelLink').href = u.url || ('https://github.com/' + (info.repo || 'pinn-shost/pinn') + '/releases');
  } else {
    rel.classList.add('hidden');
  }
  inst.classList.toggle('hidden', !u.neuer);
  inst.disabled = !kannAktion;
  if (u.neuer) inst.textContent = tk('maint.installVersion', { version: u.version });

  // Pre-release running on this server? Then say so and point to the bug report
  const vs = info.vorabStand;
  const pre = document.getElementById('sysVorabActive');
  pre.classList.toggle('hidden', !vs);
  if (vs) {
    document.getElementById('sysVorabActiveText').textContent = tk('maint.preReleaseRunning', { version: vs.version });
    document.getElementById('sysVorabActiveIssue').href = sysIssueUrl(info, vs.version);
  }
  sysRenderDev();

  // Backups
  document.getElementById('sysBackupNowBtn').disabled = !w.aktiv;
  document.getElementById('sysBackupInfo').textContent = w.aktiv
    ? tk('maint.schedule', { time: w.uhrzeit || '03:30', days: w.tage || 7, weeks: w.wochen || 4 })
    : '';
  const list = info.backups || [];
  const box = document.getElementById('sysBackupList');
  if (!list.length) {
    box.innerHTML = `<p class="sm-empty">${escapeHtml(tk(w.aktiv ? 'maint.noBackupYet' : 'maint.noBackups'))}</p>`;
  } else {
    const rows = sysShowAll ? list : list.slice(0, SYS_ROWS);
    box.innerHTML = rows.map(b => {
      const k = sysBackupKind(b);
      return `<div class="sm-row">
        <span class="sm-row-ico">${k.ico}</span>
        <span class="sm-row-main"><span class="sm-row-title" data-no-i18n>${escapeHtml(sysFmtWhen(b.zeit))}</span><span class="sm-row-sub">${escapeHtml(k.label)} · ${escapeHtml(sysFmtSize(b.groesse))}</span></span>
        ${kannAktion ? `<button type="button" class="sm-btn sm-small" data-sys-restore="${escapeHtml(b.datei)}">${escapeHtml(tk('maint.restore'))}</button>` : ''}
      </div>`;
    }).join('');
  }
  const more = document.getElementById('sysBackupMore');
  more.classList.toggle('hidden', list.length <= SYS_ROWS);
  more.textContent = sysShowAll ? tk('maint.showLess') : tk('maint.showAll', { n: list.length });
}

/* ---------- Developer area: pre-releases ----------
   Normal updates only ever show finished versions (GitHub releases/latest). Here an admin can search
   explicitly for a pre-release, read the warnings, confirm and install it – the server makes a backup
   before every update, so nothing is lost. */
function sysRepo(info) {
  const r = String(((info || sysInfo || {}).repo) || '');
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r) ? r : 'pinn-shost/pinn';
}
// "New issue" on GitHub, pre-filled with version and device so a report is useful right away
function sysIssueUrl(info, version) {
  const v = version || ((info || sysInfo || {}).version) || APP_VERSION;
  const sch = (info || sysInfo || {}).schema;
  const body = [
    'Version: ' + v,
    ...(sch && sch.version ? ['Schema: ' + sch.version + (sch.ok ? '' : ' (!)')] : []),
    tk('maint.issue.device') + ': ' + navigator.userAgent,
    '',
    tk('maint.issue.what'),
    '',
    tk('maint.issue.expected'),
    '',
    tk('maint.issue.steps'),
    '1. ',
  ].join('\n');
  return 'https://github.com/' + sysRepo(info) + '/issues/new?title=' + encodeURIComponent('[' + v + '] ') + '&body=' + encodeURIComponent(body);
}
function sysDevReset() {
  sysDevInfo = null;
  const box = document.getElementById('sysDevBox');
  if (box) box.open = false;
  const cb = document.getElementById('sysDevConfirm');
  if (cb) cb.checked = false;
  sysRenderDev();
}
function sysRenderDev() {
  const info = sysInfo || {};
  const w = info.wartung || {};
  const kannAktion = !!(info.darf && w.aktiv && w.docker);
  const v = sysDevInfo;
  const st = document.getElementById('sysDevState');
  const rel = document.getElementById('sysDevRelease');
  const row = document.getElementById('sysDevConfirmRow');
  const inst = document.getElementById('sysDevInstallBtn');
  const cb = document.getElementById('sysDevConfirm');
  document.getElementById('sysDevIssueLink').href = sysIssueUrl(info);
  document.getElementById('sysDevCheckBtn').disabled = sysDevBusy;
  let text = '';
  if (sysDevBusy) text = tk('maint.dev.checking');
  else if (!v) text = '';
  else if (v.neuer) text = tk('maint.dev.available', { version: v.version });
  else if (v.fehler === 'limit') text = tk('maint.rateLimit');
  else if (v.fehler && !v.tag) text = tk('maint.githubDown');
  else if (v.keine || !v.tag) text = tk('maint.dev.none');
  else if (v.ueberholt) text = tk('maint.dev.released', { version: v.version });
  else text = tk('maint.dev.notNewer', { version: v.version });
  st.textContent = text;
  const show = !!(v && v.neuer && !sysDevBusy);
  rel.classList.toggle('hidden', !show);
  row.classList.toggle('hidden', !show);
  inst.classList.toggle('hidden', !show);
  if (show) {
    document.getElementById('sysDevRelTitle').textContent = v.titel || ('pinn. ' + v.version);
    let datum = '';
    try { datum = v.datum ? new Date(v.datum).toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch (e) { datum = ''; }
    document.getElementById('sysDevRelDate').textContent = datum;
    document.getElementById('sysDevRelNotes').innerHTML = sysMarkdown(v.notizen || '');
    document.getElementById('sysDevRelLink').href = v.url || ('https://github.com/' + sysRepo(info) + '/releases');
    inst.textContent = tk('maint.dev.install', { version: v.version });
  } else if (cb) {
    cb.checked = false;
  }
  // installing needs the right to update, a working „wartung“ container and the confirmation
  inst.disabled = !(show && kannAktion && cb && cb.checked);
}
async function sysDevCheck() {
  if (sysDevBusy) return;
  if (!navigator.onLine) { sysDevInfo = { fehler: 'netz' }; sysRenderDev(); return; }
  sysDevBusy = true;
  sysRenderDev();
  try {
    const info = await sysFetch(false, true);
    sysInfo = info;
    sysDevInfo = info.vorab || { keine: true };
  } catch (e) {
    sysDevInfo = null;
    sysDevBusy = false;
    sysRenderDev();
    document.getElementById('sysDevState').textContent = e.message;
    return;
  }
  sysDevBusy = false;
  sysRender();
}
async function sysStartPreUpdate() {
  const v = sysDevInfo || {};
  if (!v.neuer || !document.getElementById('sysDevConfirm').checked) return;
  if (!confirm(tk('maint.dev.installConfirm', { version: v.version }))) return;
  const btn = document.getElementById('sysDevInstallBtn');
  btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/system/update', { vorab: true });
    sysFollow(r.id, 'update', r.version || v.version);
  } catch (e) {
    alert(e.message);
    sysRenderDev();
  }
}

// Show release notes (Markdown from GitHub) plainly – without foreign HTML
function sysMarkdown(md) {
  const inline = (t) => escapeHtml(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
  let html = '', inList = false;
  String(md).replace(/\r/g, '').split('\n').forEach(line => {
    const l = line.trim();
    const li = l.match(/^[-*•]\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + inline(li[1]) + '</li>'; return; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l || /^(-{3,}|<\/?[a-z][^>]*>)$/i.test(l)) return;
    const h = l.match(/^#{1,6}\s+(.*)$/);
    html += h ? '<h5>' + inline(h[1]) + '</h5>' : '<p>' + inline(l) + '</p>';
  });
  if (inList) html += '</ul>';
  return html || '<p>–</p>';
}

/* ---------- Restore ---------- */
function sysOpenRestore(file) {
  const b = ((sysInfo && sysInfo.backups) || []).find(x => x.datei === file);
  if (!b) return;
  sysRestoreFile = file;
  document.getElementById('sysRestoreWhen').textContent = sysFmtWhen(b.zeit);
  document.getElementById('sysRestoreMeta').textContent = sysBackupKind(b).label + ' · ' + sysFmtSize(b.groesse);
  document.querySelector('input[name="sysRestoreScope"][value="daten"]').checked = true;
  const cb = document.getElementById('sysRestoreConfirm');
  cb.checked = false;
  document.getElementById('sysRestoreGo').disabled = true;
  sysShowView('restore');
}
async function sysStartRestore() {
  const umfang = (document.querySelector('input[name="sysRestoreScope"]:checked') || {}).value === 'alles' ? 'alles' : 'daten';
  const btn = document.getElementById('sysRestoreGo');
  btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/system/wiederherstellen', { datei: sysRestoreFile, umfang });
    sysShowView('main');
    sysFollow(r.id, 'wiederherstellen', '');
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
}

/* ---------- Backup & update ---------- */
async function sysStartBackup() {
  const btn = document.getElementById('sysBackupNowBtn');
  btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/system/sichern', {});
    sysFollow(r.id, 'sichern', '');
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
}
async function sysStartUpdate() {
  const u = (sysInfo && sysInfo.update) || {};
  if (!u.neuer) return;
  if (!confirm(tk('maint.updateConfirm', { version: u.version }))) return;
  const btn = document.getElementById('sysUpdInstallBtn');
  btn.disabled = true;
  try {
    const r = await postJson('/api/pinn/system/update', {});
    sysFollow(r.id, 'update', r.version || u.version);
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
  }
}

/* ---------- Progress ---------- */
// Steps of each job: [step name reported by the server, text key]
const SYS_STEPS = {
  sichern: [['sichern', 'maint.step.backup']],
  wiederherstellen: [['sichern', 'maint.step.saveCurrent'], ['entpacken', 'maint.step.checkBackup'], ['stoppen', 'maint.step.stop'], ['einspielen', 'maint.step.restoreData'], ['starten', 'maint.step.start']],
  update: [['sichern', 'maint.step.saveCurrent'], ['laden', 'maint.step.download'], ['entpacken', 'maint.step.checkPackage'], ['installieren', 'maint.step.install'], ['neustart', 'maint.step.restart']],
};
// Error codes of the „wartung“ container → text key
const SYS_FEHLER = {
  sichern: 'maint.err.backup',
  datei: 'maint.err.file',
  docker: 'maint.err.docker',
  entpacken: 'maint.err.unpack',
  defekt: 'maint.err.damaged',
  start: 'maint.err.start',
  laden: 'maint.err.download',
  paket: 'maint.err.package',
  setup: 'maint.err.setup',
  abbruch: 'maint.err.aborted',
  beschaeftigt: 'maint.err.busy',
  wartung: 'maint.err.container',
};
function sysRenderProgress(art, version, step, state) {
  const titles = {
    sichern: [tk('maint.prog.backupRunning'), tk('maint.prog.backupDone'), tk('maint.prog.backupFailed')],
    wiederherstellen: [tk('maint.prog.restoreRunning'), tk('maint.prog.restoreDone'), tk('maint.prog.restoreFailed')],
    update: [tk('maint.prog.updateRunning', { version: version || '' }), tk('maint.prog.updateDone'), tk('maint.prog.updateFailed')],
  }[art] || ['…', tk('maint.prog.done'), tk('common.error')];
  const spin = document.getElementById('sysProgSpin');
  spin.classList.toggle('ok', state === 'fertig');
  spin.classList.toggle('err', state === 'fehler');
  document.getElementById('sysProgTitle').textContent = state === 'fertig' ? titles[1] : state === 'fehler' ? titles[2] : titles[0];
  const steps = SYS_STEPS[art] || [];
  const idx = steps.findIndex(s => s[0] === step);
  document.getElementById('sysProgSteps').innerHTML = steps.map((s, i) => {
    let cls = '';
    if (state === 'fertig' || (idx >= 0 && i < idx)) cls = 'done';
    else if (i === idx) cls = state === 'fehler' ? 'err' : 'on';
    return `<li class="${cls}">${escapeHtml(tk(s[1]))}</li>`;
  }).join('');
}
function sysProgMsg(text) {
  document.getElementById('sysProgMsg').textContent = text || '';
}

// Follows a job until it ends – also across the restart of pinn.
async function sysFollow(id, art, version) {
  if (sysPolling) return;
  sysPolling = true;
  const prog = document.getElementById('sysMaintProgress');
  prog.classList.remove('hidden');
  document.getElementById('sysMaintClose').classList.add('hidden');
  document.getElementById('sysProgDone').classList.add('hidden');
  document.getElementById('sysProgLog').classList.add('hidden');
  sysRenderProgress(art, version, art === 'sichern' ? 'sichern' : '', 'laeuft');
  sysProgMsg(tk('maint.prog.waiting'));
  const t0 = Date.now();
  let warWeg = false, gesehen = false, ende = null;
  while (Date.now() - t0 < 45 * 60 * 1000) {
    let st = null, alt = false;
    try {
      const r = await fetch('/api/pinn/system/status', { cache: 'no-store' });
      if (r.ok) st = await r.json();
      else if (r.status === 404) alt = true; // after „Alles“ from an older backup without system.pb.js
    } catch (e) { st = null; }
    const j = st && st.job;
    if (alt && warWeg) { ende = { zustand: 'fertig', schritt: 'fertig' }; break; }
    if (!st && !alt) {
      warWeg = true;
      sysProgMsg(tk(art === 'update' ? 'maint.prog.renewing' : 'maint.prog.restarting'));
    } else if (j && j.id === id) {
      gesehen = true;
      if (j.version) version = j.version;
      if (j.zustand === 'fertig' || j.zustand === 'fehler') { ende = j; break; }
      sysRenderProgress(art, version, j.schritt, 'laeuft');
      sysProgMsg(tk(j.zustand === 'wartet' ? 'maint.prog.waiting'
        : (art === 'sichern' ? 'maint.prog.backupTakesTime' : 'maint.prog.keepOpen')));
    } else if (!gesehen && Date.now() - t0 > 20 * 60 * 1000) {
      ende = { zustand: 'fehler', fehler: 'wartung' };
      break;
    } else if (!gesehen && Date.now() - t0 > 30 * 1000) {
      // e.g. the nightly backup is running right now – the job starts right after it
      sysProgMsg(tk('maint.prog.busy'));
    }
    await sysSleep(2500);
  }
  if (!ende) ende = { zustand: 'fehler', fehler: 'abbruch' };
  sysRenderProgress(art, version, ende.schritt, ende.zustand === 'fertig' ? 'fertig' : 'fehler');

  if (ende.zustand === 'fertig' && (art === 'wiederherstellen' || art === 'update')) {
    // pinn. must answer again, then reload fresh
    for (let i = 0; i < 60; i++) {
      try { const h = await fetch('/api/health', { cache: 'no-store' }); if (h.ok) break; } catch (e) { /* still starting */ }
      await sysSleep(1500);
    }
    if (art === 'wiederherstellen') sysClearLocalData();
    sysProgMsg(art === 'update' ? tk('maint.prog.installed', { version: version || '' }) : tk('maint.prog.restored'));
    await sysSleep(2500);
    sysPolling = false;
    hardReload();
    return;
  }

  sysPolling = false;
  document.getElementById('sysMaintClose').classList.remove('hidden');
  const done = document.getElementById('sysProgDone');
  done.classList.remove('hidden');
  if (ende.zustand === 'fertig') {
    sysProgMsg(tk('maint.prog.backupLocation'));
  } else {
    let msg = tk(SYS_FEHLER[ende.fehler] || 'common.failed');
    if (ende.meldung && ende.fehler !== 'setup') msg += ' (' + ende.meldung + ')';
    sysProgMsg(msg);
    if (art === 'update') {
      try {
        const info = await sysFetch(false);
        if (info.updateLog && info.updateLog.length) {
          const log = document.getElementById('sysProgLog');
          log.textContent = info.updateLog.join('\n');
          log.classList.remove('hidden');
        }
      } catch (e) { /* ignore */ }
    }
  }
}
// After a restore: clear this device's cache so the restored state is loaded
// and not overwritten by old changes remembered locally.
function sysClearLocalData() {
  [LS_CACHE_KEY, LS_PENDING_KEY, LS_OUTBOX, LS_AUFGABEN_CACHE, LS_ICS_CACHE, LS_PROFILE_CACHE,
   LS_FIN_QUEUE, LS_FIN_CACHE, LS_KASSEN, LS_KASSEN_PENDING, LS_FIN_DOCS, LS_DOCS, LS_AREAS_KEY, LS_AREAS_PENDING_KEY].forEach(k => {
    try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
  });
}

/* ---------- Controls ---------- */
document.getElementById('sysMaintClose').addEventListener('click', closeSysMaint);
document.getElementById('sysMaintModal').addEventListener('click', (e) => { if (e.target.id === 'sysMaintModal') closeSysMaint(); });
document.getElementById('sysProgDone').addEventListener('click', () => {
  document.getElementById('sysMaintProgress').classList.add('hidden');
  sysLoad(false);
});
document.getElementById('sysUpdCheckBtn').addEventListener('click', async () => {
  const b = document.getElementById('sysUpdCheckBtn');
  b.disabled = true;
  document.getElementById('sysUpdState').textContent = tk('maint.checking');
  await sysLoad(true);
  b.disabled = false;
});
document.getElementById('sysUpdInstallBtn').addEventListener('click', sysStartUpdate);
document.getElementById('sysBackupNowBtn').addEventListener('click', sysStartBackup);
document.getElementById('sysBackupMore').addEventListener('click', () => { sysShowAll = !sysShowAll; sysRender(); });
document.getElementById('sysBackupList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sys-restore]');
  if (b) sysOpenRestore(b.dataset.sysRestore);
});
document.getElementById('sysRestoreBack').addEventListener('click', () => sysShowView('main'));
document.getElementById('sysRestoreCancel').addEventListener('click', () => sysShowView('main'));
document.getElementById('sysRestoreConfirm').addEventListener('change', (e) => {
  document.getElementById('sysRestoreGo').disabled = !e.target.checked;
});
document.getElementById('sysRestoreGo').addEventListener('click', sysStartRestore);
document.getElementById('openSysMaintBtn').addEventListener('click', () => openSysMaint());
document.getElementById('sysUpdateHintBtn').addEventListener('click', () => openSysMaint());
document.getElementById('mainAdminSystemBtn').addEventListener('click', () => openSysMaint());
document.getElementById('sysDevCheckBtn').addEventListener('click', () => sysDevCheck());
document.getElementById('sysDevConfirm').addEventListener('change', () => sysRenderDev());
document.getElementById('sysDevInstallBtn').addEventListener('click', sysStartPreUpdate);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sicherungen');
