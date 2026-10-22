/* pinn. – Backups & updates (js/sicherungen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: Settings → System → backups & updates (also on the main admin screen): summary, update check
   and install, backups (list, back up now, restore), progress across the restart of pinn., shared helpers
   pinnModalToTop, sysCanUse, sysLocale, sysT (also used by other files at runtime).
   Since 1.66.0 also the developer area for pre-releases (search, warnings, install with automatic backup). */

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
function sysT(s) {
  try { return (window.PINN_I18N && PINN_I18N.t) ? PINN_I18N.t(s) : s; } catch (e) { return s; }
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
  if (b.art === 'manuell') return { ico: '✋', label: 'Von Hand' };
  if (b.art === 'vor-update') return { ico: '⬆️', label: 'Vor einem Update' };
  if (b.art === 'vor-wiederherstellung') return { ico: '↩️', label: 'Vor einer Wiederherstellung' };
  const tage = (sysInfo && sysInfo.wartung && sysInfo.wartung.tage) || 7;
  const alt = (Date.now() / 1000 - b.zeit) > (tage + 0.5) * 86400;
  return alt ? { ico: '📅', label: 'Wochensicherung' } : { ico: '🌙', label: 'Tägliche Sicherung' };
}

async function sysFetch(pruefen, vorab) {
  const q = [];
  if (pruefen) q.push('pruefen=1');
  if (vorab) q.push('vorab=1');
  const res = await apiFetch('/api/pinn/system' + (q.length ? '?' + q.join('&') : ''), { cache: 'no-store' });
  if (res.status === 404) { const e = new Error('Auf dem Server fehlt noch pb_hooks/system.pb.js (und pinn-system.js).'); e.code = 'alt'; throw e; }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Das hat nicht geklappt.');
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
  if (!navigator.onLine) { sum.textContent = 'Keine Verbindung zum Server.'; return; }
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
    document.getElementById('sysUpdateHintText').textContent = sysT('Version {0} ist verfügbar.').replace('{0}', u.version);
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}
function sysSummaryText(info) {
  const w = info.wartung || {};
  if (!w.eingerichtet || !w.aktiv) return 'Der Container „wartung“ läuft noch nicht – Einrichtung siehe „Sicherungen & Wiederherstellung“.';
  const list = info.backups || [];
  if (!list.length) return 'Noch keine Sicherung vorhanden – die erste entsteht heute Nacht oder mit „Jetzt sichern“.';
  return sysT('Letzte Sicherung: {0} · {1} Sicherungen auf dem NAS').replace('{0}', sysFmtWhen(list[0].zeit)).replace('{1}', String(list.length));
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
  document.getElementById('sysUpdState').textContent = sysT(opts.pruefen ? 'Suche nach Updates …' : 'Wird geladen …');
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
  if (!navigator.onLine) { sysNotice('Keine Verbindung zum Server.'); document.getElementById('sysUpdState').textContent = ''; return; }
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
  if (!w.eingerichtet || !w.aktiv) notice = 'Der Container „wartung“ läuft noch nicht. Einmalig per SSH im pinn.-Ordner „sudo sh pinn-setup.sh“ ausführen – danach gehen Sicherungen, Wiederherstellung und Updates hier per Knopf.';
  else if (!w.docker) notice = 'Der Container „wartung“ hat keinen Zugriff auf Docker – Wiederherstellen und Updates sind deshalb aus. Sichern geht weiterhin.';
  else if (!info.darf) notice = 'Wiederherstellen und Updates betreffen alle Familien auf diesem Server – das kann der Hauptadmin oder ein Admin, dem er es erlaubt hat.';
  sysNotice(notice);
  const kannAktion = !!(info.darf && w.aktiv && w.docker);

  // Updates
  const u = info.update || {};
  const st = document.getElementById('sysUpdState');
  const rel = document.getElementById('sysUpdRelease');
  const inst = document.getElementById('sysUpdInstallBtn');
  let text = '';
  if (u.neuer) text = sysT('Version {0} ist verfügbar.').replace('{0}', u.version);
  else if (u.keine) text = 'Auf GitHub gibt es noch keine veröffentlichte Version.';
  else if (u.fehler === 'limit') text = 'GitHub hat gerade zu viele Anfragen gezählt – bitte in einer Stunde noch einmal versuchen.';
  else if (u.fehler && !u.tag) text = 'GitHub ist gerade nicht erreichbar – bitte später noch einmal versuchen.';
  else if (u.tag) text = 'pinn. ist auf dem neuesten Stand.';
  const teile = [];
  if (text) teile.push(sysT(text));
  if (u.geprueft) teile.push(sysT('Zuletzt geprüft: {0}').replace('{0}', sysFmtWhen(Math.floor(u.geprueft / 1000))));
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
  if (u.neuer) inst.textContent = sysT('Version {0} installieren').replace('{0}', u.version);

  // Pre-release running on this server? Then say so and point to the bug report
  const vs = info.vorabStand;
  const pre = document.getElementById('sysVorabActive');
  pre.classList.toggle('hidden', !vs);
  if (vs) {
    document.getElementById('sysVorabActiveText').textContent = sysT('Auf diesem Server läuft die Vorabversion {0}.').replace('{0}', vs.version);
    document.getElementById('sysVorabActiveIssue').href = sysIssueUrl(info, vs.version);
  }
  sysRenderDev();

  // Backups
  document.getElementById('sysBackupNowBtn').disabled = !w.aktiv;
  document.getElementById('sysBackupInfo').textContent = w.aktiv
    ? sysT('Jeden Tag um {0} – aufbewahrt werden alle Sicherungen der letzten {1} Tage und danach {2} Wochen lang eine pro Woche. Sie liegen auf dem NAS im pinn.-Ordner unter „backups“.')
        .replace('{0}', w.uhrzeit || '03:30').replace('{1}', String(w.tage || 7)).replace('{2}', String(w.wochen || 4))
    : '';
  const list = info.backups || [];
  const box = document.getElementById('sysBackupList');
  if (!list.length) {
    box.innerHTML = `<p class="sm-empty">${escapeHtml(sysT(w.aktiv ? 'Noch keine Sicherung vorhanden – die erste entsteht heute Nacht oder mit „Jetzt sichern“.' : 'Noch keine Sicherungen.'))}</p>`;
  } else {
    const rows = sysShowAll ? list : list.slice(0, SYS_ROWS);
    box.innerHTML = rows.map(b => {
      const k = sysBackupKind(b);
      return `<div class="sm-row">
        <span class="sm-row-ico">${k.ico}</span>
        <span class="sm-row-main"><span class="sm-row-title" data-no-i18n>${escapeHtml(sysFmtWhen(b.zeit))}</span><span class="sm-row-sub">${escapeHtml(sysT(k.label))} · ${escapeHtml(sysFmtSize(b.groesse))}</span></span>
        ${kannAktion ? `<button type="button" class="sm-btn sm-small" data-sys-restore="${escapeHtml(b.datei)}">${escapeHtml(sysT('Wiederherstellen'))}</button>` : ''}
      </div>`;
    }).join('');
  }
  const more = document.getElementById('sysBackupMore');
  more.classList.toggle('hidden', list.length <= SYS_ROWS);
  more.textContent = sysShowAll ? sysT('Weniger anzeigen') : sysT('Alle {0} Sicherungen zeigen').replace('{0}', String(list.length));
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
  const body = [
    'Version: ' + v,
    sysT('Gerät / Browser') + ': ' + navigator.userAgent,
    '',
    sysT('Was ist passiert?'),
    '',
    sysT('Was hätte passieren sollen?'),
    '',
    sysT('Schritte zum Nachstellen:'),
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
  if (sysDevBusy) text = 'Suche nach Vorabversionen …';
  else if (!v) text = '';
  else if (v.neuer) text = sysT('Vorabversion {0} ist verfügbar.').replace('{0}', v.version);
  else if (v.fehler === 'limit') text = 'GitHub hat gerade zu viele Anfragen gezählt – bitte in einer Stunde noch einmal versuchen.';
  else if (v.fehler && !v.tag) text = 'GitHub ist gerade nicht erreichbar – bitte später noch einmal versuchen.';
  else if (v.keine || !v.tag) text = 'Zurzeit gibt es keine Vorabversion.';
  else if (v.ueberholt) text = sysT('Die letzte Vorabversion {0} ist schon als fertige Version erschienen – dafür gibt es das normale Update.').replace('{0}', v.version);
  else text = sysT('Die letzte Vorabversion {0} ist nicht neuer als deine Version – du bist auf dem neuesten Stand.').replace('{0}', v.version);
  st.textContent = text ? sysT(text) : '';
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
    inst.textContent = sysT('Vorabversion {0} installieren').replace('{0}', v.version);
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
  if (!confirm(sysT('Vorabversion {0} jetzt installieren? Sie kann Fehler enthalten und gilt für alle Familien auf diesem Server. Vorher wird automatisch gesichert – über „Wiederherstellen“ kommst du jederzeit zurück. pinn. ist dabei ein paar Minuten nicht erreichbar.').replace('{0}', v.version))) return;
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
  document.getElementById('sysRestoreMeta').textContent = sysT(sysBackupKind(b).label) + ' · ' + sysFmtSize(b.groesse);
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
  if (!confirm(sysT('pinn. jetzt auf Version {0} aktualisieren? Vorher wird automatisch gesichert. pinn. ist dabei ein paar Minuten nicht erreichbar – auf allen Geräten.').replace('{0}', u.version))) return;
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
const SYS_STEPS = {
  sichern: [['sichern', 'Sicherung erstellen']],
  wiederherstellen: [['sichern', 'Jetzigen Stand sichern'], ['entpacken', 'Sicherung prüfen'], ['stoppen', 'pinn. anhalten'], ['einspielen', 'Daten zurückspielen'], ['starten', 'pinn. starten']],
  update: [['sichern', 'Jetzigen Stand sichern'], ['laden', 'Update von GitHub laden'], ['entpacken', 'Paket prüfen'], ['installieren', 'Update einspielen'], ['neustart', 'pinn. neu starten']],
};
const SYS_FEHLER = {
  sichern: 'Die Sicherung ist fehlgeschlagen – ist auf dem NAS noch genug Speicherplatz frei?',
  datei: 'Diese Sicherung wurde nicht gefunden.',
  docker: 'Der Container „wartung“ hat keinen Zugriff auf Docker.',
  entpacken: 'Die Sicherung ließ sich nicht entpacken – es wurde nichts verändert.',
  defekt: 'Die Datenbank in dieser Sicherung ist beschädigt – es wurde nichts verändert.',
  start: 'pinn. startete mit der Sicherung nicht – der vorherige Stand ist wieder aktiv.',
  laden: 'Das Update ließ sich nicht von GitHub laden – bitte die Internetverbindung des NAS prüfen. Es wurde nichts verändert.',
  paket: 'Das heruntergeladene Paket ist unvollständig – es wurde nichts verändert.',
  setup: 'Beim Einspielen meldete pinn-setup.sh einen Fehler (Einzelheiten unten). Die Sicherung von vorher liegt bereit.',
  abbruch: 'Der Vorgang wurde unterbrochen, weil der Container neu gestartet ist.',
  beschaeftigt: 'Es lief gerade schon ein anderer Vorgang – bitte gleich noch einmal versuchen.',
  wartung: 'Der Container „wartung“ reagiert nicht – läuft er? (docker logs wartung)',
};
function sysRenderProgress(art, version, step, state) {
  const titles = {
    sichern: ['Sicherung läuft …', 'Sicherung erstellt', 'Sicherung fehlgeschlagen'],
    wiederherstellen: ['Wiederherstellung läuft …', 'Wiederhergestellt', 'Wiederherstellung fehlgeschlagen'],
    update: [sysT('Update auf {0} läuft …').replace('{0}', version || ''), 'Update installiert', 'Update fehlgeschlagen'],
  }[art] || ['…', 'Fertig', 'Fehler'];
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
    return `<li class="${cls}">${escapeHtml(sysT(s[1]))}</li>`;
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
  sysProgMsg('Wartet auf den Container „wartung“ …');
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
      sysProgMsg(art === 'update' ? 'pinn. wird gerade erneuert und startet neu – einen Moment …' : 'pinn. startet neu – einen Moment …');
    } else if (j && j.id === id) {
      gesehen = true;
      if (j.version) version = j.version;
      if (j.zustand === 'fertig' || j.zustand === 'fehler') { ende = j; break; }
      sysRenderProgress(art, version, j.schritt, 'laeuft');
      sysProgMsg(j.zustand === 'wartet' ? 'Wartet auf den Container „wartung“ …'
        : (art === 'sichern' ? 'Das kann je nach Menge an Fotos und Dokumenten ein paar Minuten dauern.' : 'Bitte die App geöffnet lassen.'));
    } else if (!gesehen && Date.now() - t0 > 20 * 60 * 1000) {
      ende = { zustand: 'fehler', fehler: 'wartung' };
      break;
    } else if (!gesehen && Date.now() - t0 > 30 * 1000) {
      // e.g. the nightly backup is running right now – the job starts right after it
      sysProgMsg('Der Container „wartung“ ist noch beschäftigt – der Auftrag startet direkt danach.');
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
    sysProgMsg(art === 'update' ? sysT('pinn. {0} ist installiert – die App lädt neu …').replace('{0}', version || '') : 'Der gewählte Stand ist zurück – die App lädt neu …');
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
    sysProgMsg('Die Sicherung liegt auf dem NAS im pinn.-Ordner unter „backups“.');
  } else {
    let msg = sysT(SYS_FEHLER[ende.fehler] || 'Das hat nicht geklappt.');
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
  document.getElementById('sysUpdState').textContent = sysT('Suche nach Updates …');
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
