/* pinn. – Manage profiles (js/profilverwaltung.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the popup "Manage profile" (change category, link a family member, remove the dashboard PIN, show devices, reset the password, delete the profile) and the button "New profile" (profileManageCall, openProfileManageModal, closeProfileManageModal). The profile list in the settings is in js/konto.js. */

/* ---------- Manage profile (popup): category, reset password, delete ---------- */
function openProfileManageModal(id) {
  const x = accountProfiles.find(p => p.id === id);
  if (!x) return;
  profileManageId = id;
  document.getElementById('profileManageName').textContent = x.username;
  document.getElementById('profileManageRole').value = x.rolle === 'admin' ? 'admin' : 'mitglied';
  document.getElementById('profileManageStatus').textContent = '';
  const memberSelect = document.getElementById('profileManageMember');
  const selectable = members.filter(m => m.id === x.mitglied || !profileForMember(m.id));
  memberSelect.innerHTML = `<option value="">${escapeHtml(tk('account.manage.noMember'))}</option>` +
    selectable.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  memberSelect.value = (x.mitglied && memberById(x.mitglied)) ? x.mitglied : '';
  const u = currentUser();
  const guestProfile = x.rolle === 'gast';
  document.getElementById('profileManageGuestInfo').classList.toggle('hidden', !guestProfile);
  document.getElementById('profileManageMemberFields').classList.toggle('hidden', guestProfile);
  document.getElementById('profileManagePinBtn').classList.toggle('hidden', guestProfile || !(dashPinInfo.profile && dashPinInfo.profile[x.id]));
  document.getElementById('profileManageDeleteBtn').classList.toggle('hidden', u && x.id === u.id);
  document.getElementById('profileManageModal').classList.remove('hidden');
}
function closeProfileManageModal() { document.getElementById('profileManageModal').classList.add('hidden'); profileManageId = null; }
document.getElementById('cancelProfileManage').addEventListener('click', closeProfileManageModal);
document.getElementById('profileManageDevicesBtn').addEventListener('click', () => {
  if (!profileManageId) return;
  openDevModal(profileManageId, document.getElementById('profileManageName').textContent);
});
wireModalOutsideClick('profileManageModal', closeProfileManageModal);

async function profileManageCall(url, payload, okText) {
  const status = document.getElementById('profileManageStatus');
  status.textContent = '';
  const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  status.textContent = res.ok ? okText : (body.error || tk('common.error'));
  renderAccountSettings();
  if (res.ok) areasRefresh().catch(() => {}); // members live in their own record – show what the server changed
  return res.ok;
}

document.getElementById('profileManageRole').addEventListener('change', (e) => {
  if (!profileManageId) return;
  profileManageCall('/api/pinn/users/set-role', { id: profileManageId, rolle: e.target.value }, tk('account.manage.categoryChanged'));
});
document.getElementById('profileManageMember').addEventListener('change', async (e) => {
  if (!profileManageId) return;
  if (!e.target.value && !confirm(tk('account.manage.unlinkConfirm'))) {
    openProfileManageModal(profileManageId);
    return;
  }
  const ok = await profileManageCall('/api/pinn/users/link', { id: profileManageId, mitglied: e.target.value }, tk('account.manage.memberChanged'));
  if (ok) { await loadFamilyProfiles(); openProfileManageModal(profileManageId); }
});
document.getElementById('profileManagePinBtn').addEventListener('click', async () => {
  if (!profileManageId) return;
  const id = profileManageId;
  const name = document.getElementById('profileManageName').textContent;
  if (!confirm(tk('account.manage.removePinConfirm', { name }))) return;
  const ok = await profileManageCall('/api/pinn/dashboard/pin-entfernen', { id }, tk('account.pin.removed'));
  if (ok) {
    if (dashPinInfo.profile) dashPinInfo.profile[id] = 0;
    document.getElementById('profileManagePinBtn').classList.add('hidden');
  }
});
document.getElementById('profileManageResetBtn').addEventListener('click', () => {
  if (!profileManageId) return;
  const name = document.getElementById('profileManageName').textContent;
  const pwNew = prompt(tk('account.manage.resetPrompt', { name }));
  if (pwNew) profileManageCall('/api/pinn/users/reset-password', { id: profileManageId, password: pwNew }, tk('account.manage.resetDone'));
});
document.getElementById('profileManageDeleteBtn').addEventListener('click', async () => {
  if (!profileManageId) return;
  const name = document.getElementById('profileManageName').textContent;
  const profile = accountProfiles.find(p => p.id === profileManageId);
  const linkedMember = profile && profile.mitglied ? memberById(profile.mitglied) : null;
  const question = linkedMember
    ? tk('account.manage.deleteWithMemberConfirm', { name, member: linkedMember.name })
    : tk('account.manage.deleteConfirm', { name });
  if (!confirm(question)) return;
  const ok = await profileManageCall('/api/pinn/users/delete', { id: profileManageId }, tk('account.manage.deleted'));
  if (ok) {
    if (linkedMember) {
      members = members.filter(m => m.id !== linkedMember.id);
      activeMemberFilter.delete(linkedMember.id);
      saveMembers();
      renderMemberChips();
      renderCalendar();
    }
    closeProfileManageModal();
  }
});

/* ---------- New profile = new family member (the profile is created along with it) ---------- */
document.getElementById('openAddProfileBtn').addEventListener('click', () => openMemberModal(null));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('profilverwaltung');
