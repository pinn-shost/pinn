/* pinn. – Main admin screen (js/hauptadminseite.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the notice about the open setup (refreshMainAdminSetupBanner) and the main admin start screen (showMainAdminScreen: setup, devices, error log, password, create families). The family list of the main admin is in the section "Hauptadmin: Familien verwalten" of index.html. */

// Notice for the main admin: setup still open, or saved values are waiting for a restart.
// autoOpen: after login open the assistant by itself as long as the setup is still open.
async function refreshMainAdminSetupBanner(autoOpen) {
  const banner = document.getElementById('mainAdminSetupBanner');
  if (!banner) return;
  let st = null;
  try {
    const res = await apiFetch('/api/pinn/einrichtung', { cache: 'no-store' });
    if (res.ok) st = await res.json();
  } catch (e) { st = null; }
  if (!st) { banner.classList.add('hidden'); return; } // older hooks or offline: show nothing
  const offen = !st.fertig;
  const neustart = !offen && !!st.neustartNoetig;
  banner.classList.toggle('hidden', !offen && !neustart);
  document.getElementById('mainAdminSetupBannerText').textContent = pinnSetupText(offen ? 'offen' : 'neustart');
  const b = document.getElementById('mainAdminSetupBannerBtn');
  b.disabled = false;
  b.textContent = pinnSetupText(offen ? 'fortsetzen' : 'neustartBtn');
  b.onclick = offen ? () => openPinnSetup() : async () => {
    b.disabled = true;
    b.textContent = pinnSetupText('neustartLaeuft');
    try {
      await postJson('/api/pinn/einrichtung/neustart', {});
      const start = Date.now();
      await new Promise(r => setTimeout(r, 5000));
      while (Date.now() - start < 90000) {
        try { const h = await fetch('/api/health', { cache: 'no-store' }); if (h.ok) break; } catch (e) { /* still starting */ }
        await new Promise(r => setTimeout(r, 1500));
      }
      location.reload();
    } catch (e) {
      alert(e.message);
      b.disabled = false;
      b.textContent = pinnSetupText('neustartBtn');
    }
  };
  let later = false;
  try { later = sessionStorage.getItem('pinn.einrichtung.spaeter') === '1'; } catch (e) { later = false; }
  if (autoOpen && offen && !later) openPinnSetup();
}

function showMainAdminScreen() {
  const u = currentUser();
  document.getElementById('mainAdminName').textContent = u ? tk('mainAdmin.signedInAs', { name: u.username }) : '';
  document.getElementById('mainAdminScreen').classList.remove('hidden');
  document.getElementById('mainAdminLogoutBtn').onclick = logout;
  const setupBtn = document.getElementById('mainAdminSetupBtn');
  setupBtn.textContent = pinnSetupText('btn');
  setupBtn.onclick = () => openPinnSetup();
  refreshMainAdminSetupBanner(true);
  document.getElementById('mainAdminDevicesBtn').onclick = () => { const me = currentUser(); if (me) openDevModal(me.id, me.username); };
  document.getElementById('mainAdminErrLogBtn').onclick = () => openErrLog();
  errLogRefreshSummary();
  document.getElementById('mainAdminPasswordBtn').onclick = async () => {
    const oldPw = prompt(tk('mainAdmin.promptCurrentPassword'));
    if (!oldPw) return;
    const newPw = prompt(tk('mainAdmin.promptNewPassword'));
    if (!newPw) return;
    if (prompt(tk('mainAdmin.promptRepeatPassword')) !== newPw) { alert(tk('login.passwordsMismatch')); return; }
    try { await changeOwnPassword(oldPw, newPw); alert(tk('mainAdmin.passwordChanged')); } catch (e) { alert(e.message); }
  };
  let maWohnform = 'familie';
  const maWohnformRender = () => document.querySelectorAll('.ma-wohnform-btn').forEach(b => {
    const on = b.dataset.maWohnform === maWohnform;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.querySelectorAll('.ma-wohnform-btn').forEach(b => {
    b.onclick = () => { maWohnform = b.dataset.maWohnform === 'wg' ? 'wg' : 'familie'; maWohnformRender(); };
  });
  maWohnformRender();
  document.getElementById('mainAdminCreateForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const name = document.getElementById('mainAdminNewFamily').value.trim();
    const adminName = document.getElementById('mainAdminNewAdmin').value.trim();
    const adminPassword = document.getElementById('mainAdminNewPassword').value;
    if (!name || !adminName || !adminPassword) { mainAdminStatus('mainAdminCreateStatus', tk('mainAdmin.fillAllFields'), false); return; }
    const btn = document.getElementById('mainAdminCreateBtn');
    btn.disabled = true;
    try {
      await postJson('/api/pinn/familien/create', { name, adminName, adminPassword, wohnform: maWohnform });
      ['mainAdminNewFamily', 'mainAdminNewAdmin', 'mainAdminNewPassword'].forEach(id => { document.getElementById(id).value = ''; });
      try { document.activeElement && document.activeElement.blur(); } catch (e) { /* ignore */ }
      mainAdminStatus('mainAdminCreateStatus', maWohnform === 'wg'
        ? tk('mainAdmin.flatshareCreated', { name, admin: adminName })
        : tk('mainAdmin.familyCreated', { name, admin: adminName }), true);
      maWohnform = 'familie';
      maWohnformRender();
      loadMainAdminFamilies();
    } catch (e) {
      mainAdminStatus('mainAdminCreateStatus', e.message, false);
    } finally {
      btn.disabled = false;
    }
  };
  loadMainAdminFamilies();
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('hauptadminseite');
