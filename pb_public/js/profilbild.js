/* pinn. – Profile pictures (js/profilbild.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: scaling profile pictures down to a small JPEG (shrinkAvatarImage, readAvatarPhotoFile), the crop popup
   (openAvatarCropper with drag, pinch, wheel/trackpad and keyboard zoom), the one-time shrinking of older, too large pictures
   (shrinkOversizedMemberPhotos) and choosing/removing the photo in the member popup. */

/* Profile pictures are stored as a small JPEG directly in the family data. A full-size phone photo
   (several MB) blew up the save call and the device storage – the app then went
   „offline“. So every image is first scaled down to at most AVATAR_MAX_PX (~15–40 KB). */
const AVATAR_MAX_PX = 320;
const AVATAR_MAX_CHARS = 120000; // images stored larger (older states) are scaled down when loading
function shrinkAvatarImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) { reject(new Error(tk('account.dashBg.unreadable'))); return; }
      let max = AVATAR_MAX_PX, quality = 0.82;
      for (let i = 0; i < 6; i++) {
        const scale = Math.min(1, max / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const data = canvas.toDataURL('image/jpeg', quality);
        canvas.width = 0; canvas.height = 0; // free memory on the iPhone right away
        if (/^data:image\/jpeg;base64,/.test(data) && data.length <= AVATAR_MAX_CHARS) { resolve(data); return; }
        if (quality > 0.6) quality -= 0.1; else max = Math.round(max * 0.8);
      }
      reject(new Error(tk('account.dashBg.unreadable')));
    };
    img.onerror = () => reject(new Error(tk('account.dashBg.unreadable')));
    img.src = src;
  });
}
// After choosing, cropping opens directly: a circle with the frame, white-transparent around it.
// Only the round frame is saved as a square – so the image looks the same everywhere.
// Cancel rejects with err.cancelled = true (the callers then show no message).
function readAvatarPhotoFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) return Promise.reject(new Error(tk('account.dashBg.notAnImage')));
  const url = URL.createObjectURL(file);
  return openAvatarCropper(url).then(data => shrinkAvatarImage(data)).finally(() => URL.revokeObjectURL(url));
}

/* ---------- Crop profile picture ----------
   Dragging moves, slider / two fingers / mouse wheel / trackpad zoom, on the Mac also arrow keys and +/−.
   The circle always stays completely filled with image. Very large photos are first scaled down to AVATAR_CROP_SRC_PX
   (saves memory on the iPhone). Result: AVATAR_MAX_PX × AVATAR_MAX_PX as JPEG. */
const AVATAR_CROP_SRC_PX = 1600;
const AVATAR_CROP_CIRCLE = 0.84; // Share of the circle in the stage (matches .avc-ring: 8 % margin per side)
let avatarCropOpen = false;
function openAvatarCropper(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error(tk('account.dashBg.unreadable')));
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) { reject(new Error(tk('account.dashBg.unreadable'))); return; }
      const k = Math.min(1, AVATAR_CROP_SRC_PX / Math.max(w0, h0));
      const W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = W; srcCanvas.height = H;
      const sctx = srcCanvas.getContext('2d');
      sctx.fillStyle = '#ffffff';
      sctx.fillRect(0, 0, W, H);
      sctx.drawImage(img, 0, 0, W, H);
      avatarCropUi(srcCanvas, resolve, reject);
    };
    img.src = src;
  });
}
function avatarCropUi(srcCanvas, resolve, reject) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const wrap = document.createElement('div');
  wrap.id = 'avatarCropModal';
  wrap.className = 'fixed inset-0 bg-ink/30 backdrop-blur-sm grid place-items-center p-4';
  wrap.style.zIndex = '600'; // above all windows (family member z-[200], pet z-[300])
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `
    <div class="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto fade-in">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="font-serif text-lg">${tk('recipe.edit.crop')}</h3>
        <button type="button" data-avc="reset" class="text-xs text-ink/40 hover:text-pine transition">${tk('common.reset')}</button>
      </div>
      <div class="avc-stage" tabindex="0" aria-label="${escapeHtml(tk('recipe.edit.cropLabel'))}"><div class="avc-ring" aria-hidden="true"></div></div>
      <div class="flex items-center gap-3 mt-3">
        <span class="text-xs text-ink/40" aria-hidden="true">−</span>
        <input data-avc="zoom" type="range" min="100" max="500" step="1" value="100" class="flex-1" style="accent-color: var(--c-pine);" aria-label="${escapeHtml(tk('recipe.edit.zoom'))}" />
        <span class="text-sm text-ink/40" aria-hidden="true">+</span>
      </div>
      <p class="text-[11px] text-ink/40 mt-1.5">${tk('avatar.dragPictureMoveZoom')}</p>
      <div class="flex justify-end gap-2 mt-4">
        <button type="button" data-avc="cancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">${tk('common.cancel')}</button>
        <button type="button" data-avc="ok" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium transition">${tk('common.apply')}</button>
      </div>
    </div>`;
  const stage = wrap.querySelector('.avc-stage');
  stage.insertBefore(srcCanvas, stage.firstChild);
  const zoomEl = wrap.querySelector('[data-avc="zoom"]');
  document.body.appendChild(wrap);
  avatarCropOpen = true;

  // State in image scale: centre of the circle in the image (cx, cy) and zoom (1 = circle just completely filled)
  let cx = W / 2, cy = H / 2, zoom = 1;
  const ZMIN = 1, ZMAX = 5;
  const stageSize = () => stage.clientWidth || 280;
  const scale = () => (stageSize() * AVATAR_CROP_CIRCLE / Math.min(W, H)) * zoom; // screen px per image px
  function clamp() {
    const half = (stageSize() * AVATAR_CROP_CIRCLE / 2) / scale(); // half circle in image px
    cx = Math.min(W - half, Math.max(half, cx));
    cy = Math.min(H - half, Math.max(half, cy));
  }
  function draw() {
    clamp();
    const s = scale(), size = stageSize();
    const left = size / 2 - cx * s, top = size / 2 - cy * s;
    srcCanvas.style.width = W + 'px';
    srcCanvas.style.height = H + 'px';
    srcCanvas.style.transform = `translate(${left}px, ${top}px) scale(${s})`;
    zoomEl.value = String(Math.round(zoom * 100));
  }
  function setZoom(z) { zoom = Math.min(ZMAX, Math.max(ZMIN, z)); draw(); }
  function moveBy(dx, dy) { const s = scale(); cx -= dx / s; cy -= dy / s; draw(); }

  // Drag and zoom with two fingers (pointer events: finger, mouse and pen)
  const pts = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add('is-dragging');
    if (pts.size === 2) {
      const [a, b] = Array.from(pts.values());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom };
    }
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, cur);
    if (pts.size >= 2 && pinch) {
      const [a, b] = Array.from(pts.values());
      setZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d);
      moveBy((cur.x - prev.x) / 2, (cur.y - prev.y) / 2);
    } else if (pts.size === 1) {
      moveBy(cur.x - prev.x, cur.y - prev.y);
    }
    e.preventDefault();
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(zoom * Math.exp(-(e.deltaY || 0) * (e.ctrlKey ? 0.01 : 0.002)));
  }, { passive: false });
  // Safari on the Mac: two-finger zoom on the trackpad
  let gz = 1;
  stage.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = zoom; });
  stage.addEventListener('gesturechange', (e) => { e.preventDefault(); setZoom(gz * (e.scale || 1)); });
  stage.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 30 : 10;
    if (e.key === 'ArrowLeft') moveBy(step, 0);
    else if (e.key === 'ArrowRight') moveBy(-step, 0);
    else if (e.key === 'ArrowUp') moveBy(0, step);
    else if (e.key === 'ArrowDown') moveBy(0, -step);
    else if (e.key === '+' || e.key === '=') setZoom(zoom * 1.1);
    else if (e.key === '-' || e.key === '_') setZoom(zoom / 1.1);
    else return;
    e.preventDefault();
  });
  zoomEl.addEventListener('input', () => setZoom((Number(zoomEl.value) || 100) / 100));

  function close() {
    avatarCropOpen = false;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', draw);
    wrap.remove();
  }
  function cancel() {
    close();
    srcCanvas.width = 0; srcCanvas.height = 0; // free memory on the iPhone right away
    const err = new Error('');
    err.cancelled = true;
    reject(err);
  }
  function finish() {
    clamp();
    const side = (stageSize() * AVATAR_CROP_CIRCLE) / scale();
    const out = document.createElement('canvas');
    out.width = AVATAR_MAX_PX; out.height = AVATAR_MAX_PX;
    const octx = out.getContext('2d');
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(srcCanvas, cx - side / 2, cy - side / 2, side, side, 0, 0, out.width, out.height);
    const data = out.toDataURL('image/jpeg', 0.88);
    out.width = 0; out.height = 0;
    close();
    srcCanvas.width = 0; srcCanvas.height = 0;
    if (/^data:image\/jpeg;base64,/.test(data)) resolve(data);
    else reject(new Error(tk('account.dashBg.unreadable')));
  }
  // Escape only closes the cropping, not the window below
  function onKey(e) {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    cancel();
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', draw);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-avc]');
    if (e.target === wrap) { cancel(); return; }
    if (!b) return;
    if (b.dataset.avc === 'cancel') cancel();
    else if (b.dataset.avc === 'ok') finish();
    else if (b.dataset.avc === 'reset') { cx = W / 2; cy = H / 2; setZoom(1); }
  });
  requestAnimationFrame(() => { draw(); try { stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });
}
// Scale down older, too large profile pictures (stored uncut before 1.31.2) once and save them
let avatarShrinkRunning = false;
async function shrinkOversizedMemberPhotos() {
  if (avatarShrinkRunning || !Array.isArray(members)) return;
  const big = members.filter(m => m && typeof m.photo === 'string' && m.photo.startsWith('data:') && m.photo.length > AVATAR_MAX_CHARS);
  if (!big.length) return;
  avatarShrinkRunning = true;
  try {
    let changed = false;
    for (const m of big) {
      try { m.photo = await shrinkAvatarImage(m.photo); changed = true; }
      catch (e) { m.photo = null; changed = true; } // rather remove an unreadable huge image than block the synchronisation
    }
    if (changed) {
      try { renderMemberChips(); } catch (e) { /* not built yet */ }
      await saveMembers();
    }
  } finally { avatarShrinkRunning = false; }
}

document.getElementById('memberPhotoFile').addEventListener('change', async (e) => {
  const input = e.target;
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('memberAvatarPreview');
  preview.style.opacity = '0.5';
  try {
    const data = await readAvatarPhotoFile(file);
    pendingMemberPhoto = data;
    pendingMemberAvatar = null;
    document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('border-pine'));
  } catch (err) {
    if (!(err && err.cancelled)) alert(err && err.message ? err.message : tk('account.dashBg.unreadable'));
  } finally {
    preview.style.opacity = '';
    input.value = '';
    renderMemberAvatarPreview();
  }
});
document.getElementById('memberRemoveImage').addEventListener('click', () => {
  pendingMemberPhoto = null;
  pendingMemberAvatar = null;
  document.getElementById('memberPhotoFile').value = '';
  document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('border-pine'));
  renderMemberAvatarPreview();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('profilbild');
