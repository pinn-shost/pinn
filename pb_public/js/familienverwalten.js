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
    if (!res.ok) throw new Error(body.error || 'Familien konnten nicht geladen werden.');
    mainAdminFamilies = body.familien || [];
    if (body.warnung) mainAdminStatus('mainAdminListStatus', body.warnung, false);
  } catch (e) {
    list.innerHTML = `<p class="text-xs text-red-500">${escapeHtml(e.message)}</p>`;
    return;
  }
  if (!mainAdminFamilies.length) {
    list.innerHTML = '<p class="text-sm text-ink/50">Noch keine Familie angelegt.</p>';
    return;
  }
  list.innerHTML = mainAdminFamilies.map(f => {
    const admins = f.profiles.filter(p => p.rolle === 'admin').length;
    const profiles = f.profiles.map(p => `
      <div class="flex items-center gap-2 py-1.5 border-t border-ink/5">
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">${escapeHtml(p.username)}${p.mustChangePassword ? ' <span class="text-xs text-mustard">Passwort ausstehend</span>' : ''}</p>
          ${p.rolle === 'admin' ? `<label class="flex items-center gap-1.5 text-[11px] text-ink/50 mt-0.5 cursor-pointer select-none"><input type="checkbox" class="ma-sys" data-id="${p.id}"${p.systemrechte ? ' checked' : ''} /><span>🛟 darf Updates &amp; Wiederherstellung</span></label>` : ''}
        </div>
        <select class="ma-role shrink-0 rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white" data-id="${p.id}">
          <option value="admin"${p.rolle === 'admin' ? ' selected' : ''}>Admin</option>
          <option value="mitglied"${p.rolle !== 'admin' ? ' selected' : ''}>Mitglied</option>
        </select>
        <button type="button" class="ma-dev shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}" title="Geräte &amp; Anmeldung" aria-label="Geräte &amp; Anmeldung">📱</button>
        <button type="button" class="ma-reset shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}">Passwort</button>
        <button type="button" class="ma-del-user shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/50 hover:text-red-500 hover:border-red-500 transition" data-id="${p.id}" data-name="${escapeHtml(p.username)}">✕</button>
      </div>`).join('');
    return `
      <div class="rounded-xl border border-ink/10 p-4 bg-white/60">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="min-w-0">
            <p class="font-medium truncate">${escapeHtml(f.name)}</p>
            <p class="text-xs text-ink/40">${f.wohnform === 'wg' ? '🧑‍🤝‍🧑 WG' : '👨‍👩‍👧 Familie'} · ${f.profiles.length} Profil${f.profiles.length === 1 ? '' : 'e'} · ${admins} Admin${admins === 1 ? '' : 's'}${f.apple ? ' · <span class="text-pine">Apple-Kalender</span>' : ''}${f.google ? ' · <span class="text-pine">Google-Kalender</span>' : ''}</p>
            ${admins ? '' : '<p class="text-xs text-mustard mt-1">Diese Familie hat noch keinen Admin.</p>'}
          </div>
          <button type="button" class="ma-rename shrink-0 px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">Umbenennen</button>
        </div>
        <div class="mb-3">${profiles}</div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="ma-add-user px-3 py-1.5 rounded-lg bg-pine text-white text-xs hover:bg-pine/90 transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">+ Profil</button>
          <button type="button" class="ma-export px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${f.id}" data-no-i18n>${escapeHtml(pinnExportText('kurz'))}</button>
          <button type="button" class="ma-del-family ml-auto px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-red-500 hover:border-red-500 transition" data-id="${f.id}" data-name="${escapeHtml(f.name)}">Familie löschen</button>
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
    run('/api/pinn/system/rechte', { id: el.dataset.id, an: el.checked }, el.checked ? 'Darf jetzt Updates einspielen und Sicherungen zurückholen.' : 'Recht für Updates und Wiederherstellung entzogen.')));
  list.querySelectorAll('.ma-role').forEach(el => el.addEventListener('change', () =>
    run('/api/pinn/users/set-role', { id: el.dataset.id, rolle: el.value }, 'Rolle geändert.')));
  list.querySelectorAll('.ma-reset').forEach(el => el.addEventListener('click', () => {
    const pwNew = prompt(`Neues Start-Passwort für „${el.dataset.name}“ (mind. 8 Zeichen). Es muss beim nächsten Anmelden geändert werden:`);
    if (pwNew) run('/api/pinn/users/reset-password', { id: el.dataset.id, password: pwNew }, 'Passwort zurückgesetzt.');
  }));
  list.querySelectorAll('.ma-del-user').forEach(el => el.addEventListener('click', () => {
    if (!confirm(`Profil „${el.dataset.name}“ wirklich löschen?`)) return;
    run('/api/pinn/users/delete', { id: el.dataset.id }, 'Profil gelöscht.');
  }));
  list.querySelectorAll('.ma-rename').forEach(el => el.addEventListener('click', () => {
    const name = prompt('Neuer Name der Familie:', el.dataset.name);
    if (name && name.trim() && name.trim() !== el.dataset.name) run('/api/pinn/familien/rename', { id: el.dataset.id, name: name.trim() }, 'Familie umbenannt.');
  }));
  list.querySelectorAll('.ma-add-user').forEach(el => el.addEventListener('click', () => {
    const username = prompt(`Name des neuen Profils in „${el.dataset.name}“:`);
    if (!username || !username.trim()) return;
    const password = prompt('Start-Passwort (mind. 8 Zeichen, muss beim ersten Anmelden geändert werden):');
    if (!password) return;
    const rolle = confirm('Soll das Profil Admin dieser Familie sein?\n\nOK = Admin, Abbrechen = Mitglied') ? 'admin' : 'mitglied';
    run('/api/pinn/users/create', { familie: el.dataset.id, username: username.trim(), password, rolle }, 'Profil angelegt.');
  }));
  list.querySelectorAll('.ma-del-family').forEach(el => el.addEventListener('click', () => {
    const typed = prompt(`Familie „${el.dataset.name}“ mit ALLEN Profilen, Terminen, Rezepten und Aufgaben endgültig löschen?\n\nÖffentlich geteilte Rezepte bleiben erhalten und wandern in die „Rezepte Familie“.\n\nZum Bestätigen den Namen der Familie eingeben:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== el.dataset.name.toLowerCase()) { mainAdminStatus('mainAdminListStatus', 'Name stimmt nicht überein – nichts gelöscht.', false); return; }
    run('/api/pinn/familien/delete', { id: el.dataset.id }, 'Familie gelöscht.');
  }));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('familienverwalten');
