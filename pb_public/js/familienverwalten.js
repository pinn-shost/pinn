/* pinn. – Main admin: manage families (js/familienverwalten.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the family list of the main admin (mainAdminFamilies, mainAdminStatus, loadMainAdminFamilies) with renaming, adding and deleting profiles, changing roles, resetting passwords, devices, export and deleting a family. The start page of the main admin is in js/hauptadminseite.js. */

/* ==========================================================
   Main admin: manage families
   ========================================================== */
let mainAdminFamilies = [];

function mainAdminStatus(elId, text, ok) {
  const el = document.getElementById(elId);
  el.textContent = text || '';
  el.classList.toggle('hidden', !text);
  el.classList.toggle('text-red-500', ok === false);
  el.classList.toggle('text-pine', ok !== false);
}

async function loadMainAdminFamilies() {
  const list = document.getElementById('mainAdminFamilyList');
  try {
    const res = await apiFetch('/api/pinn/familien', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || tk('mainAdmin.fam.familiesCouldNotLoaded'));
    mainAdminFamilies = body.familien || [];
    if (body.warnung) mainAdminStatus('mainAdminListStatus', body.warnung, false);
  } catch (e) {
    list.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message)}</p>`;
    return;
  }
  if (!mainAdminFamilies.length) {
    list.innerHTML = ('<p class="text-sm text-ink/50">' + tk('mainAdmin.fam.noFamilyCreatedYet') + '</p>');
    return;
  }
  list.innerHTML = mainAdminFamilies.map(f => {
    const admins = f.profiles.filter(p => p.rolle === 'admin').length;
    const profiles = f.profiles.map(p => `
      <div class="flex items-center gap-2 py-1.5 border-t border-ink/5">
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">${escapeHtml(p.username)}${p.mustChangePassword ? (' <span class="text-xs text-mustard">' + tk('account.profiles.passwordPending') + '</span>') : ''}</p>
          ${p.rolle === 'admin' ? `<label class="flex items-center gap-1.5 text-[11px] text-ink/50 mt-0.5 cursor-pointer select-none"><input type="checkbox" class="ma-sys" data-id="${p.id}"${p.systemrechte ? ' checked' : ''} /><span>${tk('mainAdmin.fam.mayInstallUpdatesRestore')}</span></label>` : ''}
        </div>
        <select class="ma-role shrink-0 rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white" data-id="${p.id}">
          <option value="admin"${p.rolle === 'admin' ? ' selected' : ''}>${tk('common.admin')}</option>
          <option value="mitglied"${p.rolle !== 'admin' ? ' selected' : ''}>${tk('common.member')}</option>
        </select>
        <button type="button" class="ma-dev shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}" title="${escapeHtml(tk('devices.modalTitle'))}" aria-label="${escapeHtml(tk('devices.modalTitle'))}">📱</button>
        <button type="button" class="ma-reset shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}">${tk('common.password')}</button>
        <button type="button" class="ma-del-user shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/50 hover:text-red-500 hover:border-red-500 transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}">✕</button>
      </div>`).join('');
    return `
      <div class="rounded-xl border border-ink/10 p-4 bg-white/60">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="min-w-0">
            <p class="font-medium truncate">${escapeHtml(f.name)}</p>
            <p class="text-xs text-ink/40">${f.wohnform === 'wg' ? tk('mainAdmin.flatshare') : tk('mainAdmin.family')} · ${escapeHtml(tk('mainAdmin.fam.profilesN', { n: f.profiles.length }))} · ${escapeHtml(tk('mainAdmin.fam.adminsN', { n: admins }))}${f.apple ? (' · <span class="text-pine">' + tk('mainAdmin.fam.appleCalendar') + '</span>') : ''}${f.google ? (' · <span class="text-pine">' + tk('mainAdmin.fam.googleCalendar') + '</span>') : ''}</p>
            ${admins ? '' : ('<p class="text-xs text-mustard mt-1">' + tk('mainAdmin.fam.familyHasNoAdmin') + '</p>')}
          </div>
          <button type="button" class="ma-rename shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">${tk('contract.rename')}</button>
        </div>
        <div class="mb-3">${profiles}</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="ma-add-user px-3 py-1.5 rounded-lg bg-pine text-white text-xs hover:bg-pine/90 transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">${tk('mainAdmin.fam.profile')}</button>
          <button type="button" class="ma-export px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${f.id}" data-no-i18n>${escapeHtml(pinnExportText('kurz'))}</button>
          <button type="button" class="ma-del-family ml-auto px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-red-500 hover:border-red-500 transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">${tk('mainAdmin.fam.deleteFamily')}</button>
        </div>
      </div>`;
  }).join('');

  const run = async (url, payload, okText) => {
    try {
      await postJson(url, payload);
      mainAdminStatus('mainAdminListStatus', okText, true);
    } catch (e) {
      mainAdminStatus('mainAdminListStatus', e.message, false);
    }
    loadMainAdminFamilies();
  };
  list.querySelectorAll('.ma-dev').forEach(el => el.addEventListener('click', () => openDevModal(el.dataset.id, el.dataset.name)));
  list.querySelectorAll('.ma-export').forEach(el => el.addEventListener('click', () => openPinnExport(el.dataset.id)));
  list.querySelectorAll('.ma-sys').forEach(el => el.addEventListener('change', () =>
    run('/api/pinn/system/rechte', { id: el.dataset.id, an: el.checked }, el.checked ? tk('mainAdmin.fam.canNowInstallUpdates') : tk('mainAdmin.fam.permissionUpdatesRestoreRemoved'))));
  list.querySelectorAll('.ma-role').forEach(el => el.addEventListener('change', () =>
    run('/api/pinn/users/set-role', { id: el.dataset.id, rolle: el.value }, tk('mainAdmin.fam.roleChanged'))));
  list.querySelectorAll('.ma-reset').forEach(el => el.addEventListener('click', () => {
    const pwNew = prompt(tk('mainAdmin.fam.newStartPasswordMin', { name: el.dataset.name }));
    if (pwNew) run('/api/pinn/users/reset-password', { id: el.dataset.id, password: pwNew }, tk('account.manage.resetDone'));
  }));
  list.querySelectorAll('.ma-del-user').forEach(el => el.addEventListener('click', () => {
    if (!confirm(tk('mainAdmin.fam.reallyDeleteProfile', { name: el.dataset.name }))) return;
    run('/api/pinn/users/delete', { id: el.dataset.id }, tk('account.manage.deleted'));
  }));
  list.querySelectorAll('.ma-rename').forEach(el => el.addEventListener('click', () => {
    const name = prompt(tk('mainAdmin.fam.newNameFamily'), el.dataset.name);
    if (name && name.trim() && name.trim() !== el.dataset.name) run('/api/pinn/familien/rename', { id: el.dataset.id, name: name.trim() }, tk('mainAdmin.fam.familyRenamed'));
  }));
  list.querySelectorAll('.ma-add-user').forEach(el => el.addEventListener('click', () => {
    const username = prompt(tk('mainAdmin.fam.nameNewProfile', { name: el.dataset.name }));
    if (!username || !username.trim()) return;
    const password = prompt(tk('mainAdmin.fam.startPasswordMin8'));
    if (!password) return;
    const rolle = confirm(tk('mainAdmin.fam.askAdmin')) ? 'admin' : 'mitglied';
    run('/api/pinn/users/create', { familie: el.dataset.id, username: username.trim(), password, rolle }, tk('mainAdmin.fam.profileCreated'));
  }));
  list.querySelectorAll('.ma-del-family').forEach(el => el.addEventListener('click', () => {
    const typed = prompt(tk('mainAdmin.fam.confirmDeleteFamily', { name: el.dataset.name }));
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== el.dataset.name.toLowerCase()) { mainAdminStatus('mainAdminListStatus', tk('mainAdmin.fam.nameDoesntMatchNothing'), false); return; }
    run('/api/pinn/familien/delete', { id: el.dataset.id }, tk('mainAdmin.fam.familyDeleted'));
  }));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familienverwalten');
