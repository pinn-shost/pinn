/* pinn. – Family dashboard: account settings (js/dashboardkonto.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the dashboard parts of Settings → Account: own dashboard PIN (dashPinInfo, loadDashboardPins, renderDashPinSection, startSetOwnPin), this device as a dashboard (renderDashDeviceSection), the family's dashboard devices (renderDashDeviceList), the background editor for admins (dashBgEdit, renderDashBgPreview, renderDashBgControls, renderDashBgSettings, readDashBgImageFile) and creating a guest account (openGuestModal, closeGuestModal, saveGuestFromModal). */

/* ---------- Account: own dashboard PIN ---------- */
let dashPinInfo = { eigene: 0, profile: {} };
async function loadDashboardPins() {
  try {
    const res = await apiFetch('/api/pinn/dashboard/pins', { cache: 'no-store' });
    if (res.ok) {
      const body = await res.json();
      dashPinInfo = { eigene: Number(body.eigene) || 0, profile: body.profile || {} };
    }
  } catch (e) { /* offline - last known state */ }
  return dashPinInfo;
}
function renderDashPinSection() {
  const guest = isCurrentUserGuest();
  document.getElementById('dashPinSection').classList.toggle('hidden', guest);
  if (guest) return;
  const len = dashPinInfo.eigene;
  document.getElementById('dashPinStatus').textContent = len
    ? `Dein Profil ist mit einer ${len}-stelligen PIN geschützt.`
    : 'Du hast keine PIN – dein Profil öffnet sich am Dashboard mit einem Tipp.';
  document.getElementById('dashPinSetBtn').textContent = len ? 'PIN ändern' : 'PIN festlegen';
  document.getElementById('dashPinRemoveBtn').classList.toggle('hidden', !len);
}
function startSetOwnPin() {
  let first = null;
  const me = currentMember();
  const u = currentUser();
  openPinPad({
    title: dashPinInfo.eigene ? 'PIN ändern' : 'PIN festlegen',
    sub: 'Neue PIN eingeben',
    length: dashPinInfo.eigene === 6 ? 6 : 4,
    lengthChoice: true,
    avatarHtml: dashAvatarHtml(me, u ? { username: u.username, rolle: u.rolle } : null, true),
    onComplete: async (pin, pad) => {
      if (first === null) {
        first = pin;
        pad.showLengthChoice(false);
        pad.reset('PIN zur Bestätigung wiederholen');
        return;
      }
      if (pin !== first) {
        first = null;
        pad.showLengthChoice(true);
        pad.setSub('Neue PIN eingeben');
        pad.fail('Die beiden PINs stimmen nicht überein. Bitte noch einmal.');
        return;
      }
      try {
        await postJson('/api/pinn/dashboard/pin', { pin });
      } catch (e) {
        first = null;
        pad.showLengthChoice(true);
        pad.setSub('Neue PIN eingeben');
        pad.fail(e.message);
        return;
      }
      dashPinInfo.eigene = pin.length;
      pad.close();
      renderDashPinSection();
      document.getElementById('dashPinMsg').textContent = 'PIN gespeichert.';
    },
  });
}
document.getElementById('dashPinSetBtn').addEventListener('click', () => {
  document.getElementById('dashPinMsg').textContent = '';
  startSetOwnPin();
});
document.getElementById('dashPinRemoveBtn').addEventListener('click', async () => {
  const msg = document.getElementById('dashPinMsg');
  if (!confirm('PIN wirklich entfernen? Dein Profil öffnet sich am Dashboard dann mit einem Tipp.')) return;
  try {
    await postJson('/api/pinn/dashboard/pin', { pin: '' });
    dashPinInfo.eigene = 0;
    renderDashPinSection();
    msg.textContent = 'PIN entfernt.';
  } catch (e) {
    msg.textContent = e.message;
  }
});

/* ---------- Account: this device as a dashboard ---------- */
function renderDashDeviceSection() {
  const section = document.getElementById('dashDeviceSection');
  const cfg = readDashboardConfig();
  const show = !isCurrentUserGuest() && (!!cfg || canBeDashboardDevice());
  section.classList.toggle('hidden', !show);
  if (!show) return;
  const admin = isCurrentUserAdmin();
  document.getElementById('dashDeviceStatus').textContent = '';
  document.getElementById('dashDeviceSetup').classList.toggle('hidden', !!cfg);
  document.getElementById('dashDeviceActive').classList.toggle('hidden', !cfg);
  if (!cfg) {
    document.getElementById('dashDeviceSetupForm').classList.toggle('hidden', !admin);
    document.getElementById('dashDeviceNoAdmin').classList.toggle('hidden', admin);
    const nameInput = document.getElementById('dashDeviceNameInput');
    if (!nameInput.value) nameInput.value = deviceLabel() === 'iPad' ? 'iPad' : '';
    document.getElementById('dashDeviceActivateBtn').disabled = false;
    return;
  }
  document.getElementById('dashDeviceActiveText').textContent = `Dieses Gerät ist das Familien-Dashboard „${cfg.name || 'Dashboard'}“.`;
  const select = document.getElementById('dashTimeoutSelect');
  const minutes = String(dashboardTimeoutMinutes());
  select.value = [...select.options].some(o => o.value === minutes) ? minutes : String(DASH_DEFAULT_TIMEOUT);
  document.getElementById('dashDeviceHomeBtn').classList.toggle('hidden', !isDashboardSession());
  document.getElementById('dashDeviceEndBtn').classList.toggle('hidden', !admin);
  document.getElementById('dashDeviceEndHint').classList.toggle('hidden', admin);
}
document.getElementById('dashTimeoutSelect').addEventListener('change', (e) => {
  const cfg = readDashboardConfig();
  if (!cfg) return;
  writeDashboardConfig({ ...cfg, timeout: Number(e.target.value) || 0 });
  noteDashboardActivity();
  document.getElementById('dashDeviceStatus').textContent = 'Gespeichert.';
});
document.getElementById('dashDeviceHomeBtn').addEventListener('click', returnToDashboard);
document.getElementById('dashDeviceActivateBtn').addEventListener('click', async () => {
  if (!isCurrentUserAdmin()) return;
  const btn = document.getElementById('dashDeviceActivateBtn');
  const status = document.getElementById('dashDeviceStatus');
  const name = document.getElementById('dashDeviceNameInput').value.replace(/\s+/g, ' ').trim() || 'Dashboard';
  if (!confirm(`Dieses Gerät als Familien-Dashboard „${name}“ einrichten?\n\nBeim Öffnen von pinn. erscheint dann die Profilauswahl der Familie. Persönliche Benachrichtigungen werden auf diesem Gerät abgeschaltet.`)) return;
  btn.disabled = true;
  status.textContent = 'Wird eingerichtet …';
  try {
    const r = await postJson('/api/pinn/dashboard/aktivieren', { name });
    try { await Promise.race([disablePushOnThisDevice(), new Promise(res => setTimeout(res, 3000))]); } catch (e) { /* ignore */ }
    const u = currentUser();
    writeDashboardConfig({
      key: r.key, id: r.id, name: r.name || name,
      familie: (r.familie && r.familie.id) || (u && u.familie) || '',
      familyName: (r.familie && r.familie.name) || '',
      timeout: DASH_DEFAULT_TIMEOUT,
    });
    returnToDashboard();
  } catch (e) {
    status.textContent = e.message;
    btn.disabled = false;
  }
});
document.getElementById('dashDeviceEndBtn').addEventListener('click', async () => {
  const cfg = readDashboardConfig();
  if (!cfg || !isCurrentUserAdmin()) return;
  if (!confirm('Dashboard auf diesem Gerät beenden?\n\nDanach meldet man sich hier wieder ganz normal mit Familie, Name und Passwort an.')) return;
  try {
    await postJson('/api/pinn/dashboard/geraet-entfernen', { id: cfg.id });
  } catch (e) {
    if (!confirm('Das Gerät konnte auf dem Server nicht entfernt werden (' + e.message + '). Trotzdem auf diesem Gerät beenden?')) return;
  }
  clearDashboardConfig();
  ssSet(SS_DASH_ACTIVE, null);
  ssSet(SS_DASH_KID, null);
  await logout();
});

/* ---------- Account (admins): dashboard devices of the family ---------- */
async function renderDashDeviceList() {
  const wrap = document.getElementById('dashDevicesWrap');
  const list = document.getElementById('dashDevicesList');
  let devices = [];
  try {
    const res = await apiFetch('/api/pinn/dashboard/geraete', { cache: 'no-store' });
    if (!res.ok) { wrap.classList.add('hidden'); return; }
    devices = (await res.json()).geraete || [];
  } catch (e) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.toggle('hidden', !devices.length);
  const cfg = readDashboardConfig();
  const fmt = (iso) => {
    const d = iso ? new Date(iso) : null;
    return d && !isNaN(d) ? d.toLocaleDateString('de-DE') : '–';
  };
  list.innerHTML = devices.map(d => `
    <div class="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink/10 bg-white">
      <div class="flex-1 min-w-0">
        <p class="text-sm truncate">${escapeHtml(d.name || 'Dashboard')}${cfg && cfg.id === d.id ? ' <span class="text-xs text-ink/40">(dieses Gerät)</span>' : ''}</p>
        <p class="text-xs text-ink/40">zuletzt benutzt ${fmt(d.zuletzt)}</p>
      </div>
      <button type="button" class="dash-device-remove px-2 py-1 rounded-lg border border-ink/15 text-xs text-red-500 hover:border-red-500 transition" data-id="${kidAttr(d.id)}" data-name="${kidAttr(d.name || 'Dashboard')}">Entfernen</button>
    </div>`).join('');
  list.querySelectorAll('.dash-device-remove').forEach(btn => btn.addEventListener('click', async () => {
    const own = cfg && cfg.id === btn.dataset.id;
    if (!confirm(own
      ? `„${btn.dataset.name}“ ist dieses Gerät. Dashboard hier wirklich beenden?`
      : `Dashboard „${btn.dataset.name}“ entfernen? Das Gerät zeigt danach wieder die normale Anmeldung.`)) return;
    try {
      await postJson('/api/pinn/dashboard/geraet-entfernen', { id: btn.dataset.id });
    } catch (e) {
      alert(e.message);
      return;
    }
    if (own) {
      clearDashboardConfig();
      ssSet(SS_DASH_ACTIVE, null);
      ssSet(SS_DASH_KID, null);
      applyDashboardChrome();
    }
    renderAccountSettings();
  }));
}

/* ---------- Account (admins): background of the family dashboard ---------- */
let dashBgEdit = { stil: defaultDashBgStyle(), bild: '', bildGeaendert: false, geladen: false };

function renderDashBgPreview() {
  const preview = document.getElementById('dashBgPreview');
  const layer = document.getElementById('dashBgPreviewLayer');
  const stil = dashBgEdit.stil;
  applyDashBackground(layer, preview, stil.art === 'bild' && !dashBgEdit.bild ? defaultDashBgStyle() : stil, dashBgEdit.bild);
}
function renderDashBgControls() {
  const stil = dashBgEdit.stil;
  document.querySelectorAll('#dashBgArtButtons .dash-bg-art-btn').forEach(b => b.classList.toggle('active', b.dataset.bgArt === stil.art));
  document.getElementById('dashBgColorBox').classList.toggle('hidden', stil.art !== 'farbe');
  document.getElementById('dashBgGradientBox').classList.toggle('hidden', stil.art !== 'verlauf');
  document.getElementById('dashBgImageBox').classList.toggle('hidden', stil.art !== 'bild');
  document.getElementById('dashBgColorList').innerHTML = DASH_BG_COLORS.map(c =>
    `<button type="button" class="dash-bg-swatch${c === stil.farbe ? ' active' : ''}" data-bg-color="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join('');
  document.getElementById('dashBgColorInput').value = stil.farbe.toLowerCase();
  document.getElementById('dashBgGradientBox').innerHTML = DASH_BG_GRADIENTS.map(g =>
    `<button type="button" class="dash-bg-swatch gradient${g.id === stil.verlauf ? ' active' : ''}" data-bg-gradient="${g.id}" style="background:${g.css}" title="${kidAttr(g.label)}" aria-label="${kidAttr(g.label)}"></button>`).join('');
  document.getElementById('dashBgPickLabel').textContent = dashBgEdit.bild ? 'Anderes Bild auswählen' : 'Bild auswählen';
  document.getElementById('dashBgImageRemoveBtn').classList.toggle('hidden', !dashBgEdit.bild);
  document.getElementById('dashBgDim').value = String(stil.abdunkeln);
  document.getElementById('dashBgDimValue').textContent = stil.abdunkeln + ' %';
  document.getElementById('dashBgSaveBtn').disabled = !dashBgEdit.geladen;
  renderDashBgPreview();
}
async function renderDashBgSettings() {
  const wrap = document.getElementById('dashBgWrap');
  if (!wrap) return;
  const show = isCurrentUserAdmin();
  wrap.classList.toggle('hidden', !show);
  if (!show) return;
  const status = document.getElementById('dashBgStatus');
  const famTitle = document.getElementById('dashBgPreviewTitle');
  const famText = (document.getElementById('accountFamily').textContent || '').trim();
  famTitle.textContent = famText || 'Familie';
  dashBgEdit.geladen = false;
  status.textContent = 'Wird geladen …';
  renderDashBgControls();
  try {
    const res = await apiFetch('/api/pinn/dashboard/hintergrund', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || (res.status === 404
      ? 'Der Server kennt den Dashboard-Hintergrund noch nicht (pb_hooks/dashboard.pb.js aktualisieren).'
      : 'Der Hintergrund konnte nicht geladen werden.'));
    dashBgEdit = { stil: cleanDashBgStyle(body.stil), bild: typeof body.bild === 'string' ? body.bild : '', bildGeaendert: false, geladen: true };
    if (dashBgEdit.stil.art === 'bild' && !dashBgEdit.bild) dashBgEdit.stil.art = 'standard';
    status.textContent = '';
  } catch (e) {
    status.textContent = e.message && !/fetch|network|load failed/i.test(e.message)
      ? e.message
      : 'Keine Verbindung zum Server – der Hintergrund lässt sich nur online ändern.';
  }
  const t = (document.getElementById('accountFamily').textContent || '').trim();
  if (t) famTitle.textContent = t;
  renderDashBgControls();
}
// shrink the image (longest side at most 2048 px) and store it as JPEG
function readDashBgImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || 'image/')) { reject(new Error('Bitte eine Bilddatei auswählen.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Das Bild konnte nicht gelesen werden.')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 2048;
      let quality = 0.82;
      for (let attempt = 0; attempt < 8; attempt++) {
        const scale = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', quality);
        if (data.length <= DASH_BG_MAX_CHARS && /^data:image\/jpeg;base64,/.test(data)) { resolve(data); return; }
        if (quality > 0.6) quality -= 0.1; else max = Math.round(max * 0.8);
      }
      reject(new Error('Das Bild ist zu groß. Bitte ein kleineres Bild wählen.'));
    };
    img.src = url;
  });
}
(function initDashBgSettings() {
  const status = () => document.getElementById('dashBgStatus');
  document.getElementById('dashBgArtButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bg-art]');
    if (!btn) return;
    dashBgEdit.stil.art = btn.dataset.bgArt;
    status().textContent = dashBgEdit.stil.art === 'bild' && !dashBgEdit.bild ? 'Wähle jetzt ein Bild aus.' : '';
    renderDashBgControls();
  });
  document.getElementById('dashBgColorList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bg-color]');
    if (!btn) return;
    dashBgEdit.stil.farbe = btn.dataset.bgColor;
    renderDashBgControls();
  });
  document.getElementById('dashBgColorInput').addEventListener('input', (e) => {
    const v = String(e.target.value || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(v)) return;
    dashBgEdit.stil.farbe = v;
    document.querySelectorAll('#dashBgColorList .dash-bg-swatch').forEach(b => b.classList.toggle('active', b.dataset.bgColor === v));
    renderDashBgPreview();
  });
  document.getElementById('dashBgGradientBox').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bg-gradient]');
    if (!btn) return;
    dashBgEdit.stil.verlauf = btn.dataset.bgGradient;
    renderDashBgControls();
  });
  document.getElementById('dashBgDim').addEventListener('input', (e) => {
    dashBgEdit.stil.abdunkeln = Number(e.target.value) || 0;
    document.getElementById('dashBgDimValue').textContent = dashBgEdit.stil.abdunkeln + ' %';
    renderDashBgPreview();
  });
  document.getElementById('dashBgFileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    status().textContent = 'Bild wird vorbereitet …';
    try {
      dashBgEdit.bild = await readDashBgImageFile(file);
      dashBgEdit.bildGeaendert = true;
      dashBgEdit.stil.art = 'bild';
      status().textContent = 'Bild übernommen – zum Übernehmen auf den Dashboards „Hintergrund speichern“ tippen.';
    } catch (err) {
      status().textContent = err.message;
    }
    renderDashBgControls();
  });
  document.getElementById('dashBgImageRemoveBtn').addEventListener('click', () => {
    if (!confirm('Hintergrundbild entfernen?')) return;
    dashBgEdit.bild = '';
    dashBgEdit.bildGeaendert = true;
    if (dashBgEdit.stil.art === 'bild') dashBgEdit.stil.art = 'standard';
    status().textContent = 'Bild entfernt – zum Übernehmen „Hintergrund speichern“ tippen.';
    renderDashBgControls();
  });
  document.getElementById('dashBgSaveBtn').addEventListener('click', async () => {
    if (!isCurrentUserAdmin() || !dashBgEdit.geladen) return;
    const stil = cleanDashBgStyle(dashBgEdit.stil);
    if (stil.art === 'bild' && !dashBgEdit.bild) { status().textContent = 'Bitte zuerst ein Bild auswählen.'; return; }
    const payload = { stil };
    if (dashBgEdit.bildGeaendert) payload.bild = dashBgEdit.bild;
    const btn = document.getElementById('dashBgSaveBtn');
    btn.disabled = true;
    status().textContent = payload.bild ? 'Bild wird hochgeladen …' : 'Wird gespeichert …';
    try {
      const r = await postJson('/api/pinn/dashboard/hintergrund', payload);
      dashBgEdit.bildGeaendert = false;
      dashBgEdit.stil = cleanDashBgStyle(r.stil || stil);
      // if this device itself is a dashboard of the family, apply it right here
      const cfg = readDashboardConfig();
      const u = currentUser();
      if (cfg && u && cfg.familie === u.familie) {
        const withImage = dashBgEdit.stil.art === 'bild' && !!dashBgEdit.bild;
        await dashBgImagePut(withImage ? dashBgEdit.bild : '');
        writeDashBgMeta({ familie: cfg.familie, stand: String(r.stand || ''), stil: dashBgEdit.stil, bild: withImage });
      }
      status().textContent = 'Gespeichert. Die Dashboards zeigen den neuen Hintergrund beim nächsten Öffnen der Profilauswahl.';
    } catch (err) {
      status().textContent = /fetch|network|load failed/i.test(err.message || '')
        ? 'Keine Verbindung zum Server – bitte später erneut speichern.'
        : err.message;
    }
    btn.disabled = false;
    renderDashBgControls();
  });
})();

/* ---------- Account (admins): create a guest account ---------- */
function openGuestModal() {
  document.getElementById('guestNameInput').value = '';
  document.getElementById('guestModalStatus').textContent = '';
  document.getElementById('saveGuestModal').disabled = false;
  document.getElementById('guestModal').classList.remove('hidden');
  armModalSnapshot('guestModal');
  setTimeout(() => document.getElementById('guestNameInput').focus(), 50);
}
function closeGuestModal() { document.getElementById('guestModal').classList.add('hidden'); }
async function saveGuestFromModal() {
  const status = document.getElementById('guestModalStatus');
  const btn = document.getElementById('saveGuestModal');
  const name = document.getElementById('guestNameInput').value.replace(/\s+/g, ' ').trim();
  status.textContent = '';
  if (!name) { status.textContent = 'Bitte einen Namen eingeben.'; return; }
  btn.disabled = true;
  try {
    await postJson('/api/pinn/users/create-gast', { username: name });
    closeGuestModal();
    renderAccountSettings();
  } catch (e) {
    status.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('openAddGuestBtn').addEventListener('click', openGuestModal);
document.getElementById('cancelGuestModal').addEventListener('click', () => attemptCloseModal('guestModal', closeGuestModal));
document.getElementById('saveGuestModal').addEventListener('click', saveGuestFromModal);
document.getElementById('guestNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveGuestFromModal(); }
});
wireModalOutsideClick('guestModal', closeGuestModal);

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dashboardkonto');
