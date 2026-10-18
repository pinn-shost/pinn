/* pinn. – Member popup (js/mitglied.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: who may edit a member (canEditMember), the member popup (openMemberModal, closeMemberModal), the login part
   (create a profile or link an existing one: applyMemberLoginMode, renderMemberLoginSection), colour and display mode,
   and saving (profile is created/linked if missing). The generic popup helpers (wireModalOutsideClick, attemptCloseModal,
   armModalSnapshot, "popups open at the top") stay in index.html, because the inline script needs them while loading. */

// Who may edit a family member? Admins everyone, everyone themselves - children (child lock)
// only the admin. Guests nobody.
function canEditMember(m) {
  if (!m || isCurrentUserGuest()) return false;
  if (isCurrentUserAdmin()) return true;
  const me = currentMember();
  return !!(me && me.id === m.id && !m.childLock);
}

function openMemberModal(existingId = null) {
  if (isCurrentUserGuest()) return; // Guests don't edit family members
  if (existingId && !canEditMember(memberById(existingId))) {
    const target = memberById(existingId);
    alert(target && target.childLock && currentMember() && currentMember().id === target.id
      ? 'Dein Profil kann nur ein Admin bearbeiten.'
      : 'Du kannst nur dein eigenes Familienmitglied bearbeiten – alle anderen bearbeitet ein Admin.');
    return;
  }
  if (!existingId && !isCurrentUserAdmin()) {
    alert('Neue Familienmitglieder kann nur ein Admin anlegen, weil dabei auch ein Profil zum Anmelden erstellt wird.');
    return;
  }
  editingMemberId = existingId;
  const existing = existingId ? memberById(existingId) : null;

  document.getElementById('memberModalTitle').textContent = existing ? 'Familienmitglied bearbeiten' : 'Familienmitglied hinzufügen';
  document.getElementById('saveMember').textContent = existing ? 'Speichern' : 'Hinzufügen';
  document.getElementById('newMemberName').value = existing ? existing.name : '';
  document.getElementById('newMemberRole').value = existing ? (existing.role || '') : '';
  document.getElementById('memberPhotoFile').value = '';

  selectedDisplayMode = existing ? existing.displayMode : 'name';
  document.querySelectorAll('.display-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.display === selectedDisplayMode));

  pendingMemberPhoto = existing ? (existing.photo || null) : null;
  pendingMemberAvatar = existing ? (existing.avatar || null) : null;
  document.querySelectorAll('.avatar-option').forEach(b => b.classList.toggle('border-pine', pendingMemberAvatar && b.textContent === pendingMemberAvatar));

  selectedMemberColor = existing ? (existing.color || PALETTE[0]) : PALETTE[members.length % PALETTE.length];
  const picker = document.getElementById('colorPicker');
  const customInput = document.getElementById('customColorInput');
  picker.innerHTML = '';
  PALETTE.forEach(c => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'w-7 h-7 rounded-full border-2';
    dot.style.backgroundColor = c;
    dot.style.borderColor = c === selectedMemberColor ? '#25231F' : 'transparent';
    dot.addEventListener('click', () => {
      selectedMemberColor = c;
      [...picker.children].forEach(ch => ch.style.borderColor = 'transparent');
      dot.style.borderColor = '#25231F';
      customInput.style.borderColor = 'transparent';
      renderMemberAvatarPreview();
    });
    picker.appendChild(dot);
  });
  const transparentDot = document.createElement('button');
  transparentDot.type = 'button';
  transparentDot.title = 'Transparent';
  transparentDot.className = 'w-7 h-7 rounded-full border-2 bg-white relative overflow-hidden';
  transparentDot.style.backgroundImage = 'linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)';
  transparentDot.style.backgroundSize = '8px 8px';
  transparentDot.style.backgroundPosition = '0 0, 4px 4px';
  transparentDot.style.borderColor = selectedMemberColor === 'transparent' ? '#25231F' : 'transparent';
  transparentDot.addEventListener('click', () => {
    selectedMemberColor = 'transparent';
    [...picker.children].forEach(ch => ch.style.borderColor = 'transparent');
    transparentDot.style.borderColor = '#25231F';
    customInput.style.borderColor = 'transparent';
    renderMemberAvatarPreview();
  });
  picker.appendChild(transparentDot);

  const isCustomColor = selectedMemberColor !== 'transparent' && !PALETTE.includes(selectedMemberColor);
  customInput.value = isCustomColor ? selectedMemberColor : selectedMemberColor === 'transparent' ? '#2F4B41' : selectedMemberColor;
  customInput.style.borderColor = isCustomColor ? '#25231F' : 'transparent';

  renderMemberAvatarPreview();
  renderMemberLoginSection(existing);
  initMemberKidSection(existing);
  document.getElementById('memberModal').classList.remove('hidden');
  document.getElementById('newMemberName').focus();
  armModalSnapshot('memberModal');
}

/* ---------- Login in the member popup: create a profile or link an existing one ---------- */
let memberLoginMode = 'neu';
let memberUsernameTouched = false;
function applyMemberLoginMode() {
  document.querySelectorAll('.member-login-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.loginMode === memberLoginMode));
  document.getElementById('memberLoginNew').classList.toggle('hidden', memberLoginMode !== 'neu');
  document.getElementById('memberLoginExisting').classList.toggle('hidden', memberLoginMode !== 'bestehend');
}
function renderMemberLoginSection(existing) {
  const section = document.getElementById('memberLoginSection');
  const linkedBox = document.getElementById('memberLoginLinked');
  const setupBox = document.getElementById('memberLoginSetup');
  const noAdmin = document.getElementById('memberLoginNoAdmin');
  const linked = existing ? profileForMember(existing.id) : null;
  document.getElementById('memberLoginStatus').textContent = '';
  linkedBox.classList.add('hidden');
  setupBox.classList.add('hidden');
  noAdmin.classList.add('hidden');
  section.classList.remove('hidden');
  if (linked) {
    document.getElementById('memberLoginLinkedName').textContent = linked.username + (linked.rolle === 'admin' ? ' (Admin)' : '');
    linkedBox.classList.remove('hidden');
    return;
  }
  if (!isCurrentUserAdmin()) {
    noAdmin.classList.remove('hidden');
    return;
  }
  setupBox.classList.remove('hidden');
  const free = unlinkedProfiles();
  const select = document.getElementById('memberLoginExistingSelect');
  select.innerHTML = free.length
    ? free.map(p => `<option value="${p.id}">${escapeHtml(p.username)}${p.rolle === 'admin' ? ' (Admin)' : ''}</option>`).join('')
    : '<option value="">Kein freies Profil vorhanden</option>';
  document.querySelector('.member-login-mode-btn[data-login-mode="bestehend"]').disabled = !free.length;
  document.querySelector('.member-login-mode-btn[data-login-mode="bestehend"]').classList.toggle('opacity-40', !free.length);
  memberUsernameTouched = false;
  document.getElementById('memberLoginUsername').value = existing ? existing.name : '';
  document.getElementById('memberLoginPassword').value = '';
  document.getElementById('memberLoginRole').value = 'mitglied';
  memberLoginMode = 'neu';
  applyMemberLoginMode();
}
document.querySelectorAll('.member-login-mode-btn').forEach(btn => btn.addEventListener('click', () => {
  if (btn.disabled) return;
  memberLoginMode = btn.dataset.loginMode;
  applyMemberLoginMode();
}));
document.getElementById('memberLoginUsername').addEventListener('input', () => { memberUsernameTouched = true; });
document.getElementById('newMemberName').addEventListener('input', (e) => {
  if (!memberUsernameTouched && !document.getElementById('memberLoginSetup').classList.contains('hidden')) {
    document.getElementById('memberLoginUsername').value = e.target.value.trim();
  }
});

document.getElementById('customColorInput').addEventListener('input', (e) => {
  selectedMemberColor = e.target.value;
  document.querySelectorAll('#colorPicker button').forEach(b => b.style.borderColor = 'transparent');
  e.target.style.borderColor = '#25231F';
  renderMemberAvatarPreview();
});

document.querySelectorAll('.display-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedDisplayMode = btn.dataset.display;
    document.querySelectorAll('.display-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
  });
});

document.getElementById('settingsAddMember').addEventListener('click', () => openMemberModal(null));
function closeMemberModal() { document.getElementById('memberModal').classList.add('hidden'); }
document.getElementById('cancelMember').addEventListener('click', () => attemptCloseModal('memberModal', closeMemberModal));
wireModalOutsideClick('memberModal', closeMemberModal);

document.getElementById('saveMember').addEventListener('click', async () => {
  const name = document.getElementById('newMemberName').value.trim();
  if (!name) return;
  const role = document.getElementById('newMemberRole').value.trim();
  const status = document.getElementById('memberLoginStatus');
  const btn = document.getElementById('saveMember');
  status.textContent = '';

  const existing = editingMemberId ? memberById(editingMemberId) : null;
  if (!existing && !isCurrentUserAdmin()) {
    status.textContent = 'Neue Familienmitglieder kann nur ein Admin anlegen.';
    return;
  }
  if (existing && !canEditMember(existing)) {
    status.textContent = 'Dieses Familienmitglied kann nur ein Admin bearbeiten.';
    return;
  }
  const memberId = existing ? existing.id : 'm' + Date.now();

  // Every member needs a profile: if it is still missing, it is created or linked now.
  if (isCurrentUserAdmin() && !profileForMember(memberId)) {
    btn.disabled = true;
    try {
      if (memberLoginMode === 'bestehend') {
        const profileId = document.getElementById('memberLoginExistingSelect').value;
        if (!profileId) throw new Error('Bitte ein Profil auswählen.');
        await postJson('/api/pinn/users/link', { id: profileId, mitglied: memberId });
      } else {
        const username = document.getElementById('memberLoginUsername').value.trim();
        const password = document.getElementById('memberLoginPassword').value;
        const rolle = document.getElementById('memberLoginRole').value;
        if (!username) throw new Error('Bitte einen Benutzernamen für das Profil eingeben.');
        if (password.length < 8) throw new Error('Das Start-Passwort muss mindestens 8 Zeichen lang sein.');
        await postJson('/api/pinn/users/create', { username, password, rolle, mitglied: memberId });
      }
      await loadFamilyProfiles();
    } catch (e) {
      status.textContent = e.message;
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
  }

  if (existing) {
    Object.assign(existing, { name, role, color: selectedMemberColor, displayMode: selectedDisplayMode, photo: pendingMemberPhoto, avatar: pendingMemberAvatar });
    if (pendingKidConfig) existing.kid = JSON.parse(JSON.stringify(pendingKidConfig));
  } else {
    const newMember = { id: memberId, name, role, color: selectedMemberColor, displayMode: selectedDisplayMode, photo: pendingMemberPhoto, avatar: pendingMemberAvatar };
    if (pendingKidConfig && (pendingKidConfig.enabled || pendingKidConfig.tasks.length)) newMember.kid = JSON.parse(JSON.stringify(pendingKidConfig));
    members.push(newMember);
  }
  saveMembers();
  renderMemberChips();
  renderCalendar();
  if (currentView === 'einstellungen' || currentView === 'konto') renderSettings();
  document.getElementById('memberModal').classList.add('hidden');
  if (kidPageMemberId) renderKidPage();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('mitglied');
