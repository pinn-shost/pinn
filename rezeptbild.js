/* pinn. – Recipe image frame (js/rezeptbild.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the image frame editor of the recipe popup (RECIPE_FRAME_DEFAULT, pendingRecipeImageFrame, renderRecipeImagePreview,
   applyRecipeFrameEditor, panRecipeFrame, zoomRecipeFrame) with dragging, mouse wheel/trackpad zoom, slider and keyboard.
   The popup itself is in js/rezeptdialog.js. */

// Image frame in the recipe popup: applies to the image currently chosen. If another image is chosen
// (media library, photo, PDF/AI import) or the image is removed, the frame starts centred again.
const RECIPE_FRAME_DEFAULT = { x: 50, y: 50, z: 1 };
let pendingRecipeImageFrame = { ...RECIPE_FRAME_DEFAULT };
let pendingRecipeImageFrameFor = null;

function renderRecipeImagePreview() {
  if (pendingRecipeImage !== pendingRecipeImageFrameFor) {
    pendingRecipeImageFrame = { ...RECIPE_FRAME_DEFAULT };
    pendingRecipeImageFrameFor = pendingRecipeImage;
  }
  const el = document.getElementById('rImagePreview');
  const wrap = document.getElementById('rImageFrameWrap');
  const frameImg = document.getElementById('rImageFrameImg');
  if (pendingRecipeImage) {
    // Full image (loaded in the frame anyway) - so the small preview matches the frame exactly
    const src = recipeImageSrc(pendingRecipeImage, false);
    el.innerHTML = `<img id="rImagePreviewImg" src="${src}" class="w-full h-full object-cover" alt="" draggable="false" />`;
    if (frameImg.getAttribute('src') !== src) frameImg.setAttribute('src', src);
    wrap.classList.remove('hidden');
  } else {
    el.textContent = tk('recipe.noImage');
    frameImg.removeAttribute('src');
    wrap.classList.add('hidden');
  }
  applyRecipeFrameEditor();
}

function applyRecipeFrameEditor() {
  const f = pendingRecipeImageFrame;
  applyRecipeImageFrame(document.getElementById('rImageFrameImg'), f);
  applyRecipeImageFrame(document.getElementById('rImagePreviewImg'), f);
  document.getElementById('rImageFrameX').value = String(Math.round(f.x * 10) / 10);
  document.getElementById('rImageFrameY').value = String(Math.round(f.y * 10) / 10);
  document.getElementById('rImageFrameZoom').value = String(Math.round(f.z * 100));
}

// How far the image can be moved in the frame at the current zoom (in pixels per axis)
function recipeFrameTravel() {
  const frame = document.getElementById('rImageFrame');
  const img = document.getElementById('rImageFrameImg');
  const box = frame.getBoundingClientRect();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh || !box.width || !box.height) return null;
  const cover = Math.max(box.width / nw, box.height / nh);
  const z = pendingRecipeImageFrame.z;
  return { x: z * nw * cover - box.width, y: z * nh * cover - box.height };
}
function panRecipeFrame(dx, dy) {
  const t = recipeFrameTravel();
  if (!t) return;
  const f = pendingRecipeImageFrame;
  if (t.x > 0.5) f.x = Math.min(100, Math.max(0, f.x - dx * 100 / t.x));
  if (t.y > 0.5) f.y = Math.min(100, Math.max(0, f.y - dy * 100 / t.y));
  applyRecipeFrameEditor();
}
function zoomRecipeFrame(z) {
  pendingRecipeImageFrame.z = Math.min(RECIPE_FRAME_MAX_ZOOM, Math.max(1, z));
  applyRecipeFrameEditor();
}

(function wireRecipeFrameEditor() {
  const frame = document.getElementById('rImageFrame');
  const pointers = new Map();
  let pinch = null;
  const dist = () => {
    const p = [...pointers.values()];
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
  };
  frame.addEventListener('pointerdown', (e) => {
    if (!pendingRecipeImage || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { frame.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch = { d: dist(), z: pendingRecipeImageFrame.z };
    frame.classList.add('is-dragging');
  });
  frame.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size === 1) panRecipeFrame(now.x - prev.x, now.y - prev.y);
    else if (pinch) zoomRecipeFrame(pinch.z * dist() / pinch.d);
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) frame.classList.remove('is-dragging');
  };
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  frame.addEventListener('lostpointercapture', end);
  // Mac trackpad: two-finger zoom (Chrome/Firefox as mouse wheel with Ctrl, Safari as a gesture)
  frame.addEventListener('wheel', (e) => {
    if (!pendingRecipeImage || !e.ctrlKey) return;
    e.preventDefault();
    zoomRecipeFrame(pendingRecipeImageFrame.z * Math.exp(-e.deltaY * 0.01));
  }, { passive: false });
  let gestureStartZ = 1;
  frame.addEventListener('gesturestart', (e) => { e.preventDefault(); gestureStartZ = pendingRecipeImageFrame.z; });
  frame.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (pointers.size >= 2 || !pendingRecipeImage) return; // iPhone/iPad: zooming already works via the fingers
    zoomRecipeFrame(gestureStartZ * (e.scale || 1));
  });
  frame.addEventListener('gestureend', (e) => e.preventDefault());
  // Keyboard: arrow keys move, +/- zoom
  frame.addEventListener('keydown', (e) => {
    if (!pendingRecipeImage) return;
    const step = e.shiftKey ? 40 : 10;
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (map[e.key]) { e.preventDefault(); panRecipeFrame(map[e.key][0], map[e.key][1]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomRecipeFrame(pendingRecipeImageFrame.z + 0.1); }
    else if (e.key === '-') { e.preventDefault(); zoomRecipeFrame(pendingRecipeImageFrame.z - 0.1); }
  });
  document.getElementById('rImageFrameZoom').addEventListener('input', (e) => {
    zoomRecipeFrame((parseInt(e.target.value, 10) || 100) / 100);
  });
  document.getElementById('rImageFrameReset').addEventListener('click', () => {
    pendingRecipeImageFrame = { ...RECIPE_FRAME_DEFAULT };
    applyRecipeFrameEditor();
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezeptbild');
