/* pinn. – Settings (js/einstellungen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: family name, living arrangement (family or shared flat), settings page and member list,
   categories directly on the pages, default view, theme colours, dark mode, language setting and data reset. */

/* ==========================================================
   Settings
   ========================================================== */
function renderLastName() { document.getElementById('lastNameDisplay').textContent = lastName; }

/* ---------- Living arrangement: family or shared flat (WG) ----------
   Stored in the family data (field "wohnform"), so it applies to all profiles and devices.
   The language layer (PINN_I18N, see above) swaps the labels – family → WG,
   family members → flatmates etc. –; pinn. reloads once after a change. */
function isHouseholdWG() { return householdType === 'wg'; }
function applyHouseholdType(soft) {
  renderHouseholdTypeSetting();
  if (window.PINN_I18N && PINN_I18N.setWohnform) PINN_I18N.setWohnform(householdType, soft);
}
function renderHouseholdTypeSetting() {
  const admin = isCurrentUserAdmin();
  document.querySelectorAll('.household-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.householdType === householdType);
    b.disabled = !admin;
    b.classList.toggle('opacity-60', !admin && b.dataset.householdType !== householdType);
  });
  const input = document.getElementById('settingsLastName');
  if (input) input.placeholder = isHouseholdWG() ? 'Name der WG' : 'Nachname';
  applyWgKidVisibility();
}

/* ---------- Shared flat: hide child features ----------
   A shared flat usually has no children: child lock, kids page, pocket money, junior depots and
   the child notifications are hidden. Anything already set up (e.g. an active child lock or
   existing pocket money) stays visible so it can still be edited or switched off.
   The data itself is always kept. */
function wgHidesKids() { return isHouseholdWG(); }
function wgHasKidData() {
  try { return members.some(m => isKidPageEnabled(m) || m.childLock || /^(kind|tochter|sohn)$/i.test(String(m.role || '').trim())); } catch (e) { return false; }
}
function wgShowAllowanceTab() {
  if (!wgHidesKids()) return true;
  try { return finAllowanceKids().length > 0; } catch (e) { return true; }
}
function applyWgKidVisibility() {
  const hideKidPush = wgHidesKids() && !wgHasKidData();
  ['pushKidAufgabeRow', 'pushKidAlleRow', 'pushKidHint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', hideKidPush);
  });
  const tab = document.getElementById('finTabTaschengeldBtn');
  if (tab) tab.classList.toggle('hidden', !wgShowAllowanceTab());
}
document.querySelectorAll('.household-type-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const v = btn.dataset.householdType === 'wg' ? 'wg' : 'familie';
    if (v === householdType) return;
    if (!isCurrentUserAdmin()) { alert('Die Wohnform kann nur ein Admin ändern.'); return; }
    if (!confirm('Wohnform ändern? pinn. lädt danach neu und zeigt für alle Profile die passenden Bezeichnungen – alle Daten bleiben erhalten.')) return;
    householdType = v;
    renderHouseholdTypeSetting();
    btn.disabled = true;
    try { await persistState(); } catch (e) { /* stays saved locally and is submitted later */ }
    applyHouseholdType(false);
  });
});

function renderFavoriteTabsPicker() {
  const wrap = document.getElementById('favoriteTabsPicker');
  document.getElementById('favoriteTabsCount').textContent = `${favoriteTabs.length} von 4 ausgewählt`;
  wrap.innerHTML = ALL_MENU_TABS.map(tab => {
    const isChecked = favoriteTabs.includes(tab.id);
    const atLimit = favoriteTabs.length >= 4 && !isChecked;
    return `
      <label class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-ink/10 bg-white ${atLimit ? 'opacity-40' : 'cursor-pointer'}">
        <input type="checkbox" class="favorite-tab-check shrink-0 w-4 h-4" data-id="${tab.id}" ${isChecked ? 'checked' : ''} ${atLimit ? 'disabled' : ''} />
        <span class="text-lg">${tab.icon}</span>
        <span class="text-sm flex-1">${tab.label}</span>
      </label>
    `;
  }).join('');
  wrap.querySelectorAll('.favorite-tab-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (favoriteTabs.length >= 4) { cb.checked = false; return; }
        favoriteTabs.push(cb.dataset.id);
      } else {
        favoriteTabs = favoriteTabs.filter(id => id !== cb.dataset.id);
      }
      renderFavoriteTabsPicker();
      renderBottomTabBar();
      persistState();
    });
  });
}

function renderSettings() {
  renderAccountSettings();
  document.getElementById('settingsLastName').value = lastName;
  renderHouseholdTypeSetting();
  renderAppleCalendarSummary();
  refreshAppleServerStatus();
  renderHomeSettings();
  loadHome();
  renderOverviewSettings();
  loadBirthdays(false);
  document.querySelectorAll('.done-task-cleanup-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.cleanupDays) === doneTaskCleanupDays));
  renderDoneAnimationSetting();

  renderSettingsMemberList();

  document.getElementById('darkModeToggle').checked = document.documentElement.classList.contains('dark');
  document.getElementById('colorPaper').value = themeColors.paper;
  document.getElementById('colorPine').value = themeColors.pine;
  document.getElementById('colorMustard').value = themeColors.mustard;

  document.querySelectorAll('.default-view-mode-btn-desktop').forEach(b => b.classList.toggle('active', b.dataset.defaultViewMode === defaultViewModeDesktop));
  document.getElementById('defaultViewScopeSelectDesktop').value = defaultViewScopeDesktop;
  document.querySelectorAll('.default-view-mode-btn-mobile').forEach(b => b.classList.toggle('active', b.dataset.defaultViewMode === defaultViewModeMobile));
  document.getElementById('defaultViewScopeSelectMobile').value = defaultViewScopeMobile;

  renderShoppingSettings();
}

// Family members in the settings - with their linked profile. Creating and removing only for
// admins, because the profile is created or deleted along with the member.
function renderSettingsMemberList() {
  const list = document.getElementById('settingsMemberList');
  const admin = isCurrentUserAdmin();
  document.getElementById('settingsAddMember').classList.toggle('hidden', !admin);
  list.innerHTML = '';
  const unlinked = members.filter(m => !profileForMember(m.id));
  if (admin && unlinked.length) {
    const hint = document.createElement('p');
    hint.className = 'text-xs text-mustard';
    hint.textContent = unlinked.length === 1
      ? '1 Mitglied hat noch kein Profil – bitte über „Bearbeiten“ anlegen oder verknüpfen.'
      : unlinked.length + ' Mitglieder haben noch kein Profil – bitte über „Bearbeiten“ anlegen oder verknüpfen.';
    list.appendChild(hint);
  }
  members.forEach(m => {
    const profile = profileForMember(m.id);
    const profileText = profile
      ? `<span class="text-ink/40">· Profil: ${escapeHtml(profile.username)}</span>`
      : '<span class="text-mustard">· kein Profil</span>';
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 px-3 py-2 rounded-lg border border-ink/10 bg-white';
    row.innerHTML = `
      <span class="w-8 h-8 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium truncate">${escapeHtml(m.name)}</div>
        <div class="text-xs text-ink/40 truncate">${escapeHtml(m.role || '–')} · zeigt ${m.displayMode === 'role' ? 'Rolle' : 'Name'} ${profileText}${!admin && m.childLock ? ' · 🔒 Kindersicherung' : ''}</div>
        ${admin && !(wgHidesKids() && !m.childLock) ? (() => {
          const me = currentMember();
          const locked = !!(profile && (profile.rolle === 'admin' || profile.rolle === 'gast')) || (me && me.id === m.id);
          const why = me && me.id === m.id ? 'Für dich selbst nicht möglich' : 'Admins können nicht gesperrt werden';
          return `<label class="member-lock-row${locked ? ' is-disabled' : ''}" title="${locked ? why : 'Kein Löschen, kein Zugriff auf Finanzen, Dokumente und Fahrzeuge'}">
            <span class="ov-set-switch"><input type="checkbox" data-child-lock="${m.id}" ${m.childLock && !locked ? 'checked' : ''} ${locked ? 'disabled' : ''} /><span class="ov-track"></span><span class="ov-knob"></span></span>
            <span>🔒 Kindersicherung</span>
          </label>`;
        })() : ''}
      </div>
      ${canEditMember(m) ? `<button class="edit-settings-member text-ink/30 hover:text-pine text-xs shrink-0" data-id="${m.id}">Bearbeiten</button>` : ''}
      ${admin ? `<button class="del-settings-member text-ink/30 hover:text-red-500 text-xs shrink-0" data-id="${m.id}">Entfernen</button>` : ''}
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('.edit-settings-member').forEach(btn => btn.addEventListener('click', () => openMemberModal(btn.dataset.id)));
  list.querySelectorAll('.del-settings-member').forEach(btn => btn.addEventListener('click', () => removeMemberWithProfile(btn.dataset.id)));
  list.querySelectorAll('[data-child-lock]').forEach(cb => cb.addEventListener('change', () => {
    const m = memberById(cb.dataset.childLock);
    if (!m || !isCurrentUserAdmin()) return;
    if (cb.checked) m.childLock = true; else delete m.childLock;
    saveMembers();
    renderSettingsMemberList();
    applyRoleRestrictions();
    renderBottomTabBar();
  }));
  const hint = document.getElementById('childLockHint');
  if (hint) hint.classList.toggle('hidden', !admin || (wgHidesKids() && !members.some(x => x.childLock)));
  applyWgKidVisibility();
}

async function removeMemberWithProfile(memberId) {
  const m = memberById(memberId);
  if (!m) return;
  const profile = profileForMember(memberId);
  const u = currentUser();
  if (profile && u && profile.id === u.id) {
    alert('Du kannst dich nicht selbst entfernen.');
    return;
  }
  const question = profile
    ? `„${m.name}“ und das zugehörige Profil „${profile.username}“ wirklich entfernen? Eine Anmeldung mit diesem Profil ist danach nicht mehr möglich.`
    : `„${m.name}“ wirklich entfernen?`;
  if (!confirm(question)) return;
  if (profile) {
    try {
      await postJson('/api/pinn/users/delete', { id: profile.id });
    } catch (e) {
      alert(e.message);
      return;
    }
    await loadFamilyProfiles();
  }
  members = members.filter(x => x.id !== memberId);
  activeMemberFilter.delete(memberId);
  saveMembers();
  renderMemberChips();
  renderSettings();
}

/* ---------- Categories directly on the pages ----------
   Recipe categories and kitchen appliances (slider icon on the Recipes page) as well as
   household categories (slider icon on the Household page) - in the style of the Pantry page.
   Changes apply immediately: rename when leaving the field, enable/disable with a switch,
   delete with ×. If entries are still in use, the move dialog asks for the target. */
const CAT_EDITOR_TARGETS = { rezepte: 'recipeCategoryEditor', geraete: 'kitchenToolEditor', haushalt: 'cleaningCategoryEditor' };
const CAT_EDITOR_WORDS = { rezepte: ['Rezept', 'Rezepte'], geraete: ['Rezept', 'Rezepte'], haushalt: ['Reinigung', 'Reinigungen'] };
let catEditorNewRow = null; // Area with a freshly added, still empty row

function catEditorEntries(domain) {
  if (domain === 'rezepte') return recipeCategories.map(c => ({ key: c, label: c, active: categoryActive[c] !== false, count: recipes.filter(r => (r.categories || []).includes(c)).length }));
  if (domain === 'geraete') return kitchenTools.map(t => ({ key: t.id, label: t.label, active: t.active !== false, count: recipes.filter(r => (r.tools || []).includes(t.id)).length }));
  return cleaningCategories.map(c => ({ key: c.id, label: c.label, active: c.active !== false, count: roomSchedules.filter(s => s.category === c.id).length }));
}

function renderCategoryEditor(domain) {
  const wrap = document.getElementById(CAT_EDITOR_TARGETS[domain]);
  if (!wrap) return;
  const words = CAT_EDITOR_WORDS[domain];
  const toggleHtml = (checked) => `
      <label class="flex items-center cursor-pointer shrink-0" title="Aktiv">
        <span class="relative inline-block w-11 h-6">
          <input type="checkbox" data-action="toggle" class="peer sr-only" ${checked ? 'checked' : ''} />
          <span class="absolute inset-0 rounded-full bg-ink/20 peer-checked:bg-pine transition"></span>
          <span class="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition peer-checked:translate-x-5"></span>
        </span>
      </label>`;
  let html = catEditorEntries(domain).map(e => `
    <div class="flex items-center gap-2" data-key="${escapeHtml(e.key)}">
      <div class="flex-1 min-w-0">
        <input type="text" data-field="label" data-i18n-value value="${escapeHtml(e.label)}" maxlength="40" enterkeyhint="done" autocomplete="off" class="w-full min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base ${e.active ? '' : 'text-ink/40'}" aria-label="Name" />
        ${e.count ? `<div class="text-[11px] text-ink/40 mt-0.5">${e.count} ${e.count === 1 ? words[0] : words[1]}</div>` : ''}
      </div>
      ${toggleHtml(e.active)}
      <button type="button" data-action="delete" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="Löschen">×</button>
    </div>`).join('');
  if (catEditorNewRow === domain) {
    html += `
    <div class="flex items-center gap-2" data-new="1">
      <input type="text" data-field="new" maxlength="40" enterkeyhint="done" autocomplete="off" placeholder="${domain === 'geraete' ? 'Neues Gerät, z. B. Waffeleisen' : domain === 'haushalt' ? 'Neue Kategorie, z. B. Lüften' : 'Neue Kategorie, z. B. Grillen'}" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="Name" />
      <span class="w-8 shrink-0"></span>
    </div>`;
  }
  wrap.innerHTML = html || '<p class="text-xs text-ink/40 italic">Noch keine Einträge – leg mit „+“ los.</p>';

  wrap.querySelectorAll('[data-key]').forEach(row => {
    const key = row.dataset.key;
    const entry = () => catEditorEntries(domain).find(e => e.key === key);
    const input = row.querySelector('input[data-field="label"]');
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => renameCategoryEntry(domain, key, input.value));
    const toggle = row.querySelector('input[data-action="toggle"]');
    toggle.addEventListener('change', () => {
      const e = entry();
      if (!e) return;
      if (toggle.checked) { setCategoryEntryActive(domain, key); return; }
      requestCategoryChange(domain, key, e.label, 'hide', () => { toggle.checked = true; });
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const e = entry();
      if (!e) return;
      const what = domain === 'geraete' ? 'Küchengerät' : 'Kategorie';
      if (!confirm(`${what} „${e.label}“ wirklich löschen?`)) return;
      requestCategoryChange(domain, key, e.label, 'delete', null);
    });
  });
  const newInput = wrap.querySelector('input[data-field="new"]');
  if (newInput) {
    newInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); newInput.blur(); } });
    newInput.addEventListener('change', () => {
      if (addCategoryEntry(domain, newInput.value)) { catEditorNewRow = null; afterCategoryEdit(domain); }
    });
    newInput.addEventListener('blur', () => setTimeout(() => {
      if (catEditorNewRow !== domain || !newInput.isConnected || newInput.value.trim()) return;
      catEditorNewRow = null;
      renderCategoryEditor(domain);
    }, 0));
  }
}
function renderCategoryEditors() {
  Object.keys(CAT_EDITOR_TARGETS).forEach(renderCategoryEditor);
}
// After every change: redraw popups and the affected page
function afterCategoryEdit(domain) {
  renderCategoryEditors();
  if ((domain === 'rezepte' || domain === 'geraete') && currentView === 'rezepte') {
    const detail = document.getElementById('recipeDetailView');
    if (!detail || detail.classList.contains('hidden')) renderRecipesForCurrentView();
  }
  if (domain === 'haushalt' && currentView === 'haushalt') renderRoomList();
}
function setCategoryEntryActive(domain, key) {
  if (domain === 'rezepte') categoryActive[key] = true;
  else if (domain === 'geraete') { const t = kitchenToolById(key); if (t) t.active = true; }
  else { const c = cleaningCategoryById(key); if (c) c.active = true; }
  persistState();
  afterCategoryEdit(domain);
}
function addCategoryEntry(domain, rawLabel) {
  const label = String(rawLabel || '').trim();
  if (!label) return false;
  if (catEditorEntries(domain).some(e => e.label.toLowerCase() === label.toLowerCase())) {
    alert(`„${label}“ gibt es schon.`);
    return false;
  }
  if (domain === 'rezepte') { recipeCategories.push(label); categoryActive[label] = true; }
  else if (domain === 'geraete') kitchenTools.push({ id: 'tool' + Date.now(), label, active: true });
  else cleaningCategories.push({ id: 'cat' + Date.now(), label, active: true });
  persistState();
  return true;
}
async function renameCategoryEntry(domain, key, rawLabel) {
  const label = String(rawLabel || '').trim();
  const entries = catEditorEntries(domain);
  const cur = entries.find(e => e.key === key);
  if (!cur) return;
  if (!label || label === cur.label || label === i18nT(cur.label)) { renderCategoryEditor(domain); return; }
  if (entries.some(e => e.key !== key && e.label.toLowerCase() === label.toLowerCase())) {
    alert(`„${label}“ gibt es schon.`);
    renderCategoryEditor(domain);
    return;
  }
  let oldHouseholdTitles = [];
  if (domain === 'rezepte') {
    // Recipe categories are assigned by their name - carry all references along
    recipeCategories = recipeCategories.map(c => c === key ? label : c);
    categoryActive[label] = categoryActive[key] !== false;
    delete categoryActive[key];
    recipes.forEach(r => { if (r.categories && r.categories.includes(key)) r.categories = r.categories.map(c => c === key ? label : c); });
    if (recipeFilterCategory === key) recipeFilterCategory = label;
  } else if (domain === 'geraete') {
    const t = kitchenToolById(key);
    if (t) t.label = label;
  } else {
    const c = cleaningCategoryById(key);
    if (!c) return;
    // The household tasks carry the category name in the title ("Category: Room")
    oldHouseholdTitles = roomSchedules.filter(s => s.category === key).map(s => {
      const room = rooms.find(r => r.id === s.roomId);
      return c.label + ': ' + (room ? room.name : 'Unbekannt');
    });
    c.label = label;
  }
  afterCategoryEdit(domain);
  await persistState();
  if (oldHouseholdTitles.length) resyncHouseholdAfterRename([...new Set(oldHouseholdTitles)]);
}
// Remove today's tasks with the old category name and recreate them with the new name
async function resyncHouseholdAfterRename(oldTitles) {
  try {
    for (const title of oldTitles) {
      await apiFetch('/api/delete-today-household-task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    }
    await apiFetch('/api/pinn/aufgaben/haushalt-jetzt', { method: 'POST' });
    await loadAufgaben();
  } catch (err) {
    // A silent failure is ok - the next regular run catches up.
  }
}

// Open/close popups (no confirmation on close - changes are already saved)
function openCategorySettingsModal(modalId) {
  catEditorNewRow = null;
  renderCategoryEditors();
  document.getElementById(modalId).classList.remove('hidden');
}
function closeCategorySettingsModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal.contains(document.activeElement)) document.activeElement.blur(); // apply a pending rename
  modal.classList.add('hidden');
  catEditorNewRow = null;
}
['recipeSettingsModal', 'householdSettingsModal'].forEach(modalId => {
  const modal = document.getElementById(modalId);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeCategorySettingsModal(modalId); });
});
document.getElementById('closeRecipeSettingsBtn').addEventListener('click', () => closeCategorySettingsModal('recipeSettingsModal'));
document.getElementById('doneRecipeSettingsBtn').addEventListener('click', () => closeCategorySettingsModal('recipeSettingsModal'));
document.getElementById('closeHouseholdSettingsBtn').addEventListener('click', () => closeCategorySettingsModal('householdSettingsModal'));
document.getElementById('doneHouseholdSettingsBtn').addEventListener('click', () => closeCategorySettingsModal('householdSettingsModal'));
document.getElementById('openHouseholdSettingsBtn').addEventListener('click', () => openCategorySettingsModal('householdSettingsModal'));
document.getElementById('householdRoomFilter').addEventListener('change', (e) => { householdFilterRoom = e.target.value; renderRoomList(); });
document.getElementById('householdCategoryFilter').addEventListener('change', (e) => { householdFilterCategory = e.target.value; renderRoomList(); });
document.querySelectorAll('.cat-editor-add-btn').forEach(btn => btn.addEventListener('click', () => {
  const domain = btn.dataset.catAdd;
  const open = document.querySelector(`#${CAT_EDITOR_TARGETS[domain]} input[data-field="new"]`);
  if (open) { open.focus(); return; }
  catEditorNewRow = domain;
  renderCategoryEditor(domain);
  const input = document.querySelector(`#${CAT_EDITOR_TARGETS[domain]} input[data-field="new"]`);
  if (input) setTimeout(() => input.focus(), 30);
}));

// Generalized move-before-delete/hide logic, shared by recipe AND
// household categories. "key" is the category name itself for recipes, the
// category ID for household - so a single function serves both areas.
let pendingReassign = null; // { domain: 'rezepte'|'haushalt', key, action: 'hide'|'delete' }

function requestCategoryChange(domain, key, label, action, revertFn) {
  const affected = domain === 'rezepte' ? recipes.filter(r => (r.categories || []).includes(key))
    : domain === 'haushalt' ? roomSchedules.filter(s => s.category === key)
    : recipes.filter(r => (r.tools || []).includes(key));
  const options = domain === 'rezepte' ? recipeCategories.filter(c => c !== key && categoryActive[c] !== false).map(c => ({ key: c, label: c }))
    : domain === 'haushalt' ? cleaningCategories.filter(c => c.id !== key && c.active !== false).map(c => ({ key: c.id, label: c.label }))
    : kitchenTools.filter(t => t.id !== key && t.active !== false).map(t => ({ key: t.id, label: t.label }));
  const itemWordSingular = domain === 'rezepte' ? 'Rezept' : domain === 'haushalt' ? 'Reinigung' : 'Rezept';
  const itemWordPlural = domain === 'rezepte' ? 'Rezepte' : domain === 'haushalt' ? 'Reinigungen' : 'Rezepte';
  const targetWord = domain === 'rezepte' ? 'Rezepte' : domain === 'haushalt' ? 'Reinigungen' : 'Rezepte';

  if (affected.length === 0) {
    applyCategoryChange(domain, key, action, null);
    return;
  }

  if (options.length === 0) {
    if (revertFn) revertFn();
    const actionWord = action === 'hide' ? 'ausgeblendet' : 'gelöscht';
    const itemWord = affected.length === 1 ? itemWordSingular : itemWordPlural;
    alert(`"${label}" kann nicht ${actionWord} werden: ${affected.length} ${itemWord} nutzen diese Kategorie noch, aber es gibt keine andere aktive Kategorie, in die sie verschoben werden könnten. Lege zuerst eine weitere an oder aktiviere eine.`);
    return;
  }

  if (revertFn) revertFn(); // Only switch the UI (toggle) for real after confirmation
  pendingReassign = { domain, key, action };
  const itemWord = affected.length === 1 ? itemWordSingular + ' ist' : itemWordPlural + ' sind';
  const actionWord = action === 'hide' ? 'ausgeblendet' : 'gelöscht';
  document.getElementById('categoryReassignTitle').textContent = action === 'hide' ? 'Kategorie ausblenden?' : 'Kategorie löschen?';
  document.getElementById('categoryReassignText').textContent =
    `${affected.length} ${itemWord} aktuell der Kategorie "${label}" zugeordnet. Wohin sollen sie verschoben werden, bevor die Kategorie ${actionWord} wird?`;
  document.getElementById('categoryReassignTargetLabel').textContent = targetWord + ' verschieben nach';
  const targetSelect = document.getElementById('categoryReassignTarget');
  targetSelect.innerHTML = options.map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('');
  document.getElementById('confirmCategoryReassign').textContent = action === 'hide' ? 'Verschieben & ausblenden' : 'Verschieben & löschen';
  document.getElementById('categoryReassignModal').classList.remove('hidden');
  armModalSnapshot('categoryReassignModal');
}

function applyCategoryChange(domain, key, action, targetKey) {
  if (targetKey) {
    if (domain === 'rezepte') recipes.forEach(r => {
      if (!r.categories || !r.categories.includes(key)) return;
      const withoutOld = r.categories.filter(c => c !== key);
      r.categories = withoutOld.includes(targetKey) ? withoutOld : [...withoutOld, targetKey];
    });
    else if (domain === 'haushalt') roomSchedules.forEach(s => { if (s.category === key) s.category = targetKey; });
    else recipes.forEach(r => {
      if (!r.tools || !r.tools.includes(key)) return;
      const withoutOld = r.tools.filter(t => t !== key);
      r.tools = withoutOld.includes(targetKey) ? withoutOld : [...withoutOld, targetKey];
    });
  } else if (domain === 'geraete' && action === 'delete') {
    // No target selection (nothing affected or no replacement) - simply remove the references
    recipes.forEach(r => { if (r.tools) r.tools = r.tools.filter(t => t !== key); });
  } else if (domain === 'rezepte' && action === 'delete') {
    recipes.forEach(r => { if (r.categories) r.categories = r.categories.filter(c => c !== key); });
  }
  if (action === 'hide') {
    if (domain === 'rezepte') categoryActive[key] = false;
    else if (domain === 'haushalt') { const cat = cleaningCategoryById(key); if (cat) cat.active = false; }
    else { const tool = kitchenToolById(key); if (tool) tool.active = false; }
  } else {
    if (domain === 'rezepte') { recipeCategories = recipeCategories.filter(c => c !== key); delete categoryActive[key]; }
    else if (domain === 'haushalt') cleaningCategories = cleaningCategories.filter(c => c.id !== key);
    else kitchenTools = kitchenTools.filter(t => t.id !== key);
  }
  if (domain === 'rezepte' || domain === 'geraete') saveRecipes();
  persistState();
  afterCategoryEdit(domain);
}

function closeCategoryReassignModal() {
  pendingReassign = null;
  document.getElementById('categoryReassignModal').classList.add('hidden');
  renderCategoryEditors(); // Reset the switch state (entry stays active)
}
document.getElementById('cancelCategoryReassign').addEventListener('click', () => attemptCloseModal('categoryReassignModal', closeCategoryReassignModal));
wireModalOutsideClick('categoryReassignModal', closeCategoryReassignModal);

document.getElementById('confirmCategoryReassign').addEventListener('click', () => {
  if (!pendingReassign) return;
  const target = document.getElementById('categoryReassignTarget').value;
  applyCategoryChange(pendingReassign.domain, pendingReassign.key, pendingReassign.action, target);
  pendingReassign = null;
  document.getElementById('categoryReassignModal').classList.add('hidden');
});

document.getElementById('settingsSaveLastName').addEventListener('click', async () => {
  const val = document.getElementById('settingsLastName').value.trim();
  if (!val) return;
  lastName = val;
  renderLastName();
  await persistState();
});

document.querySelectorAll('.default-view-mode-btn-desktop').forEach(btn => {
  btn.addEventListener('click', () => {
    defaultViewModeDesktop = btn.dataset.defaultViewMode;
    document.querySelectorAll('.default-view-mode-btn-desktop').forEach(b => b.classList.toggle('active', b === btn));
    savePersonalDesign();
  });
});
document.getElementById('defaultViewScopeSelectDesktop').addEventListener('change', (e) => {
  defaultViewScopeDesktop = e.target.value;
  savePersonalDesign();
});
document.querySelectorAll('.default-view-mode-btn-mobile').forEach(btn => {
  btn.addEventListener('click', () => {
    defaultViewModeMobile = btn.dataset.defaultViewMode;
    document.querySelectorAll('.default-view-mode-btn-mobile').forEach(b => b.classList.toggle('active', b === btn));
    savePersonalDesign();
  });
});
document.getElementById('defaultViewScopeSelectMobile').addEventListener('change', (e) => {
  defaultViewScopeMobile = e.target.value;
  savePersonalDesign();
});

function handleThemeColorChange() {
  themeColors = {
    paper: document.getElementById('colorPaper').value,
    pine: document.getElementById('colorPine').value,
    mustard: document.getElementById('colorMustard').value,
  };
  applyTheme();
  savePersonalDesign();
}
document.getElementById('colorPaper').addEventListener('input', handleThemeColorChange);
document.getElementById('colorPine').addEventListener('input', handleThemeColorChange);
document.getElementById('colorMustard').addEventListener('input', handleThemeColorChange);
document.getElementById('resetThemeColorsBtn').addEventListener('click', () => {
  themeColors = { ...defaultFamilyData().themeColors };
  applyTheme();
  document.getElementById('colorPaper').value = themeColors.paper;
  document.getElementById('colorPine').value = themeColors.pine;
  document.getElementById('colorMustard').value = themeColors.mustard;
  savePersonalDesign();
});
initLanguageSettings();

// Updates the colour of the system status bar (time/battery at the top) to match dark mode -
// the operating system draws it, not our page content, and it follows
// this meta tag instead of automatically following the rest of the page.
function updateThemeColorMeta() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('themeColorMeta').setAttribute('content', isDark ? '#1B1B18' : '#FFFBFB');
}

function setDarkMode(on) {
  document.documentElement.classList.toggle('dark', on);
  updateThemeColorMeta();
  savePersonalDesign();
}
document.getElementById('darkModeToggle').addEventListener('change', (e) => setDarkMode(e.target.checked));

document.getElementById('resetDataBtn').addEventListener('click', async () => {
  if (!confirm('Wirklich alle Termine, Rezepte und Daten löschen? Dies betrifft die gesamte Familie. Familienmitglieder mit Profil bleiben erhalten.')) return;
  const fresh = defaultFamilyData();
  members = members.filter(m => profileForMember(m.id)); events = fresh.events; mealPlan = fresh.mealPlan;
  recipes = fresh.recipes; categoryActive = fresh.categoryActive;
  // the living arrangement is kept on reset
  appleCalendar = fresh.appleCalendar;
  tasks = fresh.tasks;
  shoppingItems = fresh.shoppingItems; shoppingHistory = fresh.shoppingHistory;
  shoppingLists = fresh.shoppingLists; shoppingTransferred = fresh.shoppingTransferred;
  shoppingPlans = fresh.shoppingPlans;
  shoppingListOrder = [];
  shoppingMealTarget = fresh.shoppingMealTarget;
  shoppingIngredientRules = [];
  shoppingCategoryOrder = [];
  pantryItems = fresh.pantryItems; pantryCategories = []; pantryLocations = []; pantrySettings = normalizePantrySettings(null);
  familyLists = []; listTemplates = [];
  documentCategories = [];
  document.documentElement.classList.toggle('dark', fresh.darkMode);
  updateThemeColorMeta();
  await persistState();
  location.reload();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('einstellungen');
