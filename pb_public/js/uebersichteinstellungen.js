/* pinn. – Settings → Overview (js/uebersichteinstellungen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the overview settings (renderOverviewSettings: order and visibility of the tiles, birthday options, reset)
   and saving them with the personal design (saveOverviewPrefs), plus the manual contact sync for birthdays. */

/* ---------- Settings → Overview ---------- */
function renderOverviewSettings() {
  const list = document.getElementById('overviewTileSettingsList');
  if (!list) return;
  const shownCount = overviewOrder.filter(id => !overviewHidden.includes(id)).length;
  list.innerHTML = overviewOrder.map((id, i) => {
    const t = overviewTile(id);
    const on = !overviewHidden.includes(id);
    const lastOn = on && shownCount <= 1;
    return `
      <div class="ov-set-row${on ? '' : ' is-off'}">
        <span class="ov-set-icon">${t.icon}</span>
        <div class="ov-set-text">
          <div class="ov-set-label">${escapeHtml(t.label)}</div>
          <div class="ov-set-hint">${escapeHtml(t.hint)}</div>
        </div>
        <button type="button" class="ov-set-move" data-ov-move="-1" data-ov-id="${id}" aria-label="${escapeHtml(tk('settings.overview.moveUp', { name: t.label }))}" ${i === 0 ? 'disabled' : ''}>▲</button>
        <button type="button" class="ov-set-move" data-ov-move="1" data-ov-id="${id}" aria-label="${escapeHtml(tk('settings.overview.moveDown', { name: t.label }))}" ${i === overviewOrder.length - 1 ? 'disabled' : ''}>▼</button>
        <label class="ov-set-switch" title="${escapeHtml(lastOn ? tk('settings.overview.keepOne') : (on ? tk('settings.overview.hide') : tk('settings.overview.show')))}">
          <input type="checkbox" data-ov-toggle="${id}" aria-label="${escapeHtml(tk('settings.overview.showTile', { name: t.label }))}" ${on ? 'checked' : ''} ${lastOn ? 'disabled' : ''} />
          <span class="ov-track"></span>
          <span class="ov-knob"></span>
        </label>
      </div>`;
  }).join('');
  const sel = document.getElementById('overviewBdayDaysSelect');
  if (sel) sel.value = String(overviewBdayDays);
  const only = document.getElementById('overviewBdayOnlyToggle');
  if (only) only.checked = overviewBdayOnlyUpcoming;
  const resetHidden = document.getElementById('resetHiddenBirthdaysBtn');
  if (resetHidden) {
    const n = overviewBdayHidden ? overviewBdayHidden.size : 0;
    resetHidden.disabled = !n;
    resetHidden.classList.toggle('opacity-40', !n);
    resetHidden.textContent = n ? tk('settings.birthdays.showHidden', { n }) : tk('settings.birthdays.noneHidden');
  }
  renderBirthdaySettingsStatus();
}
function renderBirthdaySettingsStatus() {
  const el = document.getElementById('birthdaySyncStatus');
  if (!el) return;
  if (isCurrentUserGuest()) { el.textContent = ''; return; }
  if (!birthdayData.geladen) { el.textContent = tk('common.notLoadedYet'); return; }
  if (!birthdayData.eingerichtet) { el.textContent = tk('settings.birthdays.noAccount'); return; }
  const n = birthdayData.liste.length;
  const stand = birthdayData.stand ? new Date(birthdayData.stand).toLocaleString(PINN_I18N.language.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const q = birthdayData.quellen || {};
  const parts = [];
  if (q.apple) parts.push(`iCloud ${birthdayData.anzahl.apple}`);
  if (q.google) parts.push(`Google ${birthdayData.anzahl.google}`);
  let text = tk('settings.birthdays.contacts', { n }) + (parts.length ? ' (' + parts.join(', ') + ')' : '') +
    (stand ? ' · ' + tk('settings.birthdays.asOf', { date: stand }) : '') + ' · ' + tk('settings.birthdays.daily');
  if (birthdayData.fehler) text += ' · ' + tk('settings.birthdays.lastSyncFailed', { error: birthdayData.fehler });
  el.textContent = text;
}
function saveOverviewPrefs() {
  renderOverviewSettings();
  savePersonalDesign();
  refreshOverviewTiles();
}
document.getElementById('overviewTileSettingsList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ov-move]');
  if (!btn || btn.disabled) return;
  const id = btn.dataset.ovId;
  const i = overviewOrder.indexOf(id);
  const j = i + Number(btn.dataset.ovMove);
  if (i < 0 || j < 0 || j >= overviewOrder.length) return;
  const order = overviewOrder.slice();
  [order[i], order[j]] = [order[j], order[i]];
  overviewOrder = order;
  saveOverviewPrefs();
  // Keep the focus on the moved entry (convenient for moving several times)
  const again = document.querySelector(`#overviewTileSettingsList [data-ov-id="${id}"][data-ov-move="${btn.dataset.ovMove}"]`);
  if (again && !again.disabled) again.focus();
});
document.getElementById('overviewTileSettingsList').addEventListener('change', (e) => {
  const box = e.target.closest('[data-ov-toggle]');
  if (!box) return;
  const id = box.dataset.ovToggle;
  if (box.checked) {
    overviewHidden = overviewHidden.filter(x => x !== id);
  } else {
    if (overviewOrder.filter(x => !overviewHidden.includes(x)).length <= 1) { box.checked = true; return; }
    overviewHidden = [...overviewHidden.filter(x => x !== id), id];
  }
  saveOverviewPrefs();
});
document.getElementById('overviewBdayDaysSelect').addEventListener('change', (e) => {
  const n = Number(e.target.value);
  overviewBdayDays = OVERVIEW_BDAY_DAY_OPTIONS.includes(n) ? n : 14;
  saveOverviewPrefs();
});
document.getElementById('overviewBdayOnlyToggle').addEventListener('change', (e) => {
  overviewBdayOnlyUpcoming = !!e.target.checked;
  saveOverviewPrefs();
});
document.getElementById('resetHiddenBirthdaysBtn').addEventListener('click', () => {
  overviewBdayHidden = new Set();
  saveOverviewPrefs();
});
document.getElementById('resetOverviewBtn').addEventListener('click', () => {
  overviewOrder = OVERVIEW_DEFAULT_ORDER.slice();
  overviewHidden = [];
  overviewBdayDays = 14;
  overviewBdayOnlyUpcoming = true;
  saveOverviewPrefs();
});
document.getElementById('refreshBirthdaysBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshBirthdaysBtn');
  const status = document.getElementById('birthdaySyncStatus');
  if (!navigator.onLine) { status.textContent = tk('common.noConnectionLater'); return; }
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = tk('settings.birthdays.syncing');
  try {
    const res = await apiFetch('/api/pinn/geburtstage/aktualisieren', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) {
      status.textContent = tk('settings.birthdays.hookMissing');
    } else if (!res.ok) {
      status.textContent = body.error || tk('settings.birthdays.syncFailed', { status: res.status });
    } else {
      birthdayData = normalizeBirthdayData(body);
      birthdayLastFetch = Date.now();
      writeBirthdayCache();
      renderBirthdaySettingsStatus();
      refreshOverviewTiles();
    }
  } catch (e) {
    status.textContent = tk('common.noConnectionLater');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('uebersichteinstellungen');
