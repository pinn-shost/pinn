/* pinn. – Account settings (js/konto.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the account card in the settings (renderAccountAvatar, renderAccountSettings with the profile list for admins) and the popup "Change password" (openChangePasswordModal, closeChangePasswordModal) with the logout button. accountProfiles and profileManageId are also used by js/profilverwaltung.js. */

let accountProfiles = []; // most recently loaded profiles, for the "Manage profile" popup
let profileManageId = null; // profile currently being edited in the popup

// Account header card: picture of the linked family member, otherwise the first letter of the profile
function renderAccountAvatar() {
  const el = document.getElementById('accountAvatar');
  if (!el) return;
  const u = currentUser();
  const m = (typeof currentMember === 'function') ? currentMember() : null;
  if (m) {
    el.innerHTML = memberAvatarInnerHTML(m);
    el.style.background = (m.photo || m.avatar) ? 'color-mix(in srgb, var(--c-pine) 12%, transparent)' : '';
    return;
  }
  el.style.background = '';
  el.textContent = u && u.username ? u.username.trim().charAt(0).toUpperCase() : '?';
}

async function renderAccountSettings() {
  const u = currentUser();
  const guest = isCurrentUserGuest();
  document.getElementById('accountName').textContent = u ? u.username : '';
  document.getElementById('accountRole').textContent = u ? '(' + roleLabel(u.rolle) + ')' : '';
  document.getElementById('openChangePasswordBtn').classList.toggle('hidden', guest);
  document.getElementById('accountGuestHint').classList.toggle('hidden', !guest);
  renderAccountAvatar();
  // No personal notifications on a dashboard device and for guests
  const noPush = guest || isDashboardDevice();
  document.getElementById('pushSection').classList.toggle('hidden', noPush);
  renderDashDeviceSection();
  renderDashPinSection();
  renderDevicesSection();
  const pinsLoaded = guest ? Promise.resolve(dashPinInfo) : loadDashboardPins().then(info => { renderDashPinSection(); return info; });
  const famEl = document.getElementById('accountFamily');
  if (famEl && u && u.familie) {
    pb.collection('familien').getOne(u.familie).then(f => { famEl.textContent = 'Familie ' + f.name; }).catch(() => { /* offline */ });
  }
  const adminSection = document.getElementById('profileAdminSection');
  adminSection.classList.toggle('hidden', !isCurrentUserAdmin());
  const loaded = await loadFamilyProfiles();
  renderAccountAvatar();
  renderSettingsMemberList();
  if (!noPush) renderPushSettings();
  if (!isCurrentUserAdmin()) return;
  const list = document.getElementById('profileList');
  if (!loaded) {
    list.innerHTML = '<p class="text-xs text-red-500">Profile konnten nicht geladen werden.</p>';
    return;
  }
  accountProfiles = familyProfiles;
  const pins = await pinsLoaded;
  list.innerHTML = accountProfiles.map(x => {
      const linkedMember = x.mitglied ? memberById(x.mitglied) : null;
      const memberText = x.rolle === 'gast'
        ? ' · nur über das Dashboard'
        : (linkedMember ? ' · ' + escapeHtml(linkedMember.name) : ' · <span class="text-mustard">ohne Familienmitglied</span>');
      const pinText = pins.profile && pins.profile[x.id] ? ' · 🔒 PIN' : '';
      return `
      <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink/10 bg-white">
        <div class="flex-1 min-w-0">
          <p class="text-sm truncate">${escapeHtml(x.username)}${x.id === u.id ? ' <span class="text-xs text-ink/40">(du)</span>' : ''}${x.mustChangePassword ? ' <span class="text-xs text-mustard">Passwort ausstehend</span>' : ''}</p>
          <p class="text-xs text-ink/40">${roleLabel(x.rolle)}${memberText}${pinText}<span class="pdev-info" data-id="${x.id}"></span></p>
        </div>
        <button type="button" class="profile-manage-btn px-2 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" data-id="${x.id}">Verwalten</button>
      </div>`;
    }).join('');
  list.querySelectorAll('.profile-manage-btn').forEach(b => b.addEventListener('click', () => openProfileManageModal(b.dataset.id)));
  renderProfileDeviceInfo();
  renderGuestMenuSettings();
  renderDashBgSettings();
  renderDashDeviceList();
}

/* ---------- Change password (popup) ---------- */
function openChangePasswordModal() {
  ['accountOldPassword', 'accountNewPassword', 'accountRepeatPassword'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('accountStatus').textContent = '';
  document.getElementById('changePasswordModal').classList.remove('hidden');
  armModalSnapshot('changePasswordModal');
}
function closeChangePasswordModal() { document.getElementById('changePasswordModal').classList.add('hidden'); }
document.getElementById('openChangePasswordBtn').addEventListener('click', openChangePasswordModal);
document.getElementById('cancelChangePassword').addEventListener('click', () => attemptCloseModal('changePasswordModal', closeChangePasswordModal));
wireModalOutsideClick('changePasswordModal', closeChangePasswordModal);

document.getElementById('accountChangePasswordBtn').addEventListener('click', async () => {
  const oldPw = document.getElementById('accountOldPassword').value;
  const newPw = document.getElementById('accountNewPassword').value;
  const repeat = document.getElementById('accountRepeatPassword').value;
  const status = document.getElementById('accountStatus');
  if (newPw.length < 8) { status.textContent = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.'; return; }
  if (newPw !== repeat) { status.textContent = 'Die beiden neuen Passwörter stimmen nicht überein.'; return; }
  try {
    await changeOwnPassword(oldPw, newPw);
    status.textContent = 'Passwort geändert.';
    armModalSnapshot('changePasswordModal'); // field contents now count as "unchanged" again
    setTimeout(closeChangePasswordModal, 800);
  } catch (e) {
    status.textContent = e.message;
  }
});
document.getElementById('logoutBtn').addEventListener('click', logout);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('konto');
