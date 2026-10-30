/* pinn. – js/vorrat2.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/sparen.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.53.0, only the comments were translated):
   - Pantry 2.0 (page "Vorrat") – best-before dates with badge, filter, sorting and notice bar; barcode
     scanner with its own EAN-13 / EAN-8 / UPC-A detection and product lookup; "Was kann ich kochen?"
     (recipes matched against the pantry)
   - Shopping plan – task linked with shopping lists, "Einkauf erledigt" with amounts per store, finishing
     a shopping trip with booking into Finanzen
   - The popup "Finanzen einrichten" and the CSV export
   85 functions and 22 variables, 26 statements run while this file loads (only click, key and
   visibility listeners; no timers and no calls into other files). The functions and variables of the
   pantry list itself (pantryNum, pantrySettings, pantryOnlyExpiring …) stay in the inline script of
   index.html, which loads before this file. index.html only calls the functions of this file later
   (when the user acts or from bootApp), never while it is still loading. */

/* ==========================================================
   Pantry 2.0
   ----------------------------------------------------------
   1. Best-before date (MHD): one date per item (the earliest one if there are several packs).
      Shown as a badge, filter "Läuft ab", sorting "MHD", notice bar. The push message
      comes from the server (pb_hooks/pinn-vorrat.js) - in the morning as a collective message, once x days before
      (pantry settings) and once on the day itself. After saving, the app checks its own
      family right away (as with the contracts) so that nothing waits until the next morning.
   2. Barcode scan by camera: own detection (EAN-13, EAN-8, UPC-A) directly in pinn. - works on
      the iPhone too; where the browser has a built-in detector (Android/Chrome), that one is
      used. No third-party code. Product names are looked up by the NAS at Open Food / Beauty / Products /
      Pet Food Facts (only the number). pinn. stores barcodes on the item (barcodes: [...]) -
      named once, known to the whole family.
   3. "Was kann ich kochen?" (what can I cook?): matches the own recipes with the pantry via the ingredient names
      ("Weizenmehl" in the pantry matches "Mehl"), amounts are compared where the units fit.
      Recipes that use up expiring items come first.
   ========================================================== */
function pantryIsoValid(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function pantryDaysUntil(iso) {
  if (!pantryIsoValid(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const a = new Date(y, m - 1, d);
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
}
function pantryExpiryDays(p) {
  if (!p || !pantryIsoValid(p.bestBefore) || (pantryNum(p.qty) || 0) <= 0) return null;
  return pantryDaysUntil(p.bestBefore);
}
function pantryIsExpiring(p) { const d = pantryExpiryDays(p); return d !== null && d <= pantrySettings.mhdDays; }
function pantryExpiryLabel(d) {
  if (d === null) return '';
  if (d < -1) return tk('pantry.exp.since', { n: -d });
  if (d === -1) return tk('pantry.exp.sinceYesterday');
  if (d === 0) return tk('pantry.exp.today');
  if (d === 1) return tk('pantry.exp.tomorrow');
  return tk('pantry.exp.left', { n: d });
}
function pantryShortDate(iso) {
  if (!pantryIsoValid(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit' });
}
function pantryExpiryPillHtml(p) {
  const d = pantryExpiryDays(p);
  if (d === null || d > pantrySettings.mhdDays) return '';
  const cls = d < 0 ? 'pantry-exp-bad' : 'pantry-exp-soon';
  return `<span class="pantry-exp-pill ${cls} shrink-0">⏳ ${escapeHtml(pantryExpiryLabel(d))}</span>`;
}
// The earlier date wins (several packs); if nothing was left, the new date applies
function pantryMergeBestBefore(p, iso) {
  if (!pantryIsoValid(iso)) return (pantryNum(p.qty) || 0) > 0 ? (p.bestBefore || '') : '';
  if ((pantryNum(p.qty) || 0) <= 0 || !pantryIsoValid(p.bestBefore)) return iso;
  return iso < p.bestBefore ? iso : p.bestBefore;
}
// After saving: have the server check the own family right away (only if needed)
let pantryCheckTimer = 0;
function pantryScheduleExpiryCheck() {
  if (!pantryItems.some(pantryIsExpiring)) return;
  clearTimeout(pantryCheckTimer);
  pantryCheckTimer = setTimeout(() => {
    if (!navigator.onLine || (typeof isCurrentUserGuest === 'function' && isCurrentUserGuest())) return;
    apiFetch('/api/pinn/vorrat/pruefen', { method: 'POST' }).catch(() => { /* the schedule takes over */ });
  }, 6000);
}

/* ---------- Barcodes on the item ---------- */
function pantryNormCode(raw) {
  let c = String(raw || '').replace(/\D/g, '');
  if (c.length === 12) c = '0' + c; // UPC-A = EAN-13 with a leading 0
  return /^\d{8}$|^\d{13}$|^\d{14}$/.test(c) ? c : '';
}
function pantryCodeValid(c) {
  if (!/^\d{8}$|^\d{13}$|^\d{14}$/.test(c)) return false;
  const d = c.split('').map(Number);
  const check = d.pop();
  let sum = 0;
  d.reverse().forEach((v, i) => { sum += v * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}
function pantryItemByBarcode(code) {
  return code ? pantryItems.find(p => Array.isArray(p.barcodes) && p.barcodes.includes(code)) || null : null;
}
function pantryAttachBarcode(p, code) {
  if (!code) return p;
  const list = Array.isArray(p.barcodes) ? p.barcodes.filter(x => x !== code) : [];
  return { ...p, barcodes: [code, ...list].slice(0, 12) };
}
function renderPantryBarcodeList() {
  const wrap = document.getElementById('pantryBarcodeWrap');
  const list = document.getElementById('pantryBarcodeList');
  const codes = (pantryDraft && pantryDraft.barcodes) || [];
  wrap.classList.toggle('hidden', !codes.length);
  list.innerHTML = codes.map(c => `<span class="pantry-bc-chip"><span class="tabular-nums">${escapeHtml(c)}</span><button type="button" class="pantry-bc-rm" data-code="${escapeHtml(c)}" aria-label="${escapeHtml(tk('pantry.removeBarcode'))}">×</button></span>`).join('');
  list.querySelectorAll('.pantry-bc-rm').forEach(b => b.addEventListener('click', () => {
    pantryDraft.barcodes = pantryDraft.barcodes.filter(x => x !== b.dataset.code);
    renderPantryBarcodeList();
  }));
}

/* ---------- Barcode detection (EAN-13 / EAN-8 / UPC-A) without third-party code ----------
   A few image rows in the middle of the picture are read horizontally and vertically, converted to
   black/white with a local threshold and compared with the patterns as a sequence of bar widths.
   The check digit has to match; in addition the same code has to be detected twice. */
const PinnEan = (() => {
  const L = [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]];
  const G = L.map(w => w.slice().reverse());
  const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function digit(runs, i, withG) {
    const a = runs[i], b = runs[i + 1], c = runs[i + 2], d = runs[i + 3];
    const sum = a + b + c + d;
    if (!sum) return null;
    const f = 7 / sum;
    const n0 = a * f, n1 = b * f, n2 = c * f, n3 = d * f;
    let best = -1, par = 'L', err = 99;
    const test = (tab, p) => {
      for (let k = 0; k < 10; k++) {
        const w = tab[k];
        const e = Math.abs(n0 - w[0]) + Math.abs(n1 - w[1]) + Math.abs(n2 - w[2]) + Math.abs(n3 - w[3]);
        if (e < err) { err = e; best = k; par = p; }
      }
    };
    test(L, 'L');
    if (withG) test(G, 'G');
    return err <= 1.7 ? { d: best, p: par } : null;
  }
  function near(v, m) { return v > m * 0.35 && v < m * 2.1; }
  function ean13At(runs, i) {
    if (i + 59 > runs.length) return null;
    let total = 0;
    for (let k = 0; k < 59; k++) total += runs[i + k];
    const m = total / 95;
    if (i > 0 && runs[i - 1] < m * 2.5) return null; // Quiet zone on the left
    if (i + 59 < runs.length && runs[i + 59] < m * 2.5) return null; // Quiet zone on the right
    for (const g of [0, 1, 2, 27, 28, 29, 30, 31, 56, 57, 58]) if (!near(runs[i + g], m)) return null;
    let parity = '';
    const out = [];
    for (let k = 0; k < 6; k++) {
      const r = digit(runs, i + 3 + k * 4, true);
      if (!r) return null;
      out.push(r.d); parity += r.p;
    }
    for (let k = 0; k < 6; k++) {
      const r = digit(runs, i + 32 + k * 4, false);
      if (!r) return null;
      out.push(r.d);
    }
    const first = PARITY.indexOf(parity);
    if (first < 0) return null;
    const code = String(first) + out.join('');
    return check(code) ? code : null;
  }
  function ean8At(runs, i) {
    if (i + 43 > runs.length) return null;
    let total = 0;
    for (let k = 0; k < 43; k++) total += runs[i + k];
    const m = total / 67;
    if (i > 0 && runs[i - 1] < m * 2.5) return null;
    if (i + 43 < runs.length && runs[i + 43] < m * 2.5) return null;
    for (const g of [0, 1, 2, 19, 20, 21, 22, 23, 40, 41, 42]) if (!near(runs[i + g], m)) return null;
    const out = [];
    for (let k = 0; k < 4; k++) { const r = digit(runs, i + 3 + k * 4, false); if (!r) return null; out.push(r.d); }
    for (let k = 0; k < 4; k++) { const r = digit(runs, i + 24 + k * 4, false); if (!r) return null; out.push(r.d); }
    const code = out.join('');
    return check(code) ? code : null;
  }
  function check(code) {
    const d = code.split('').map(Number);
    const c = d.pop();
    let sum = 0;
    d.reverse().forEach((v, i) => { sum += v * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === c;
  }
  // Brightness values of one line -> run lengths (starting with white) -> codes
  function decodeLine(lum) {
    const n = lum.length;
    if (n < 60) return null;
    const B = 12, nb = Math.ceil(n / B);
    const bMin = new Float32Array(nb), bMax = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      let mn = 255, mx = 0;
      for (let x = b * B; x < Math.min(n, (b + 1) * B); x++) { const v = lum[x]; if (v < mn) mn = v; if (v > mx) mx = v; }
      bMin[b] = mn; bMax[b] = mx;
    }
    const dark = new Uint8Array(n);
    for (let x = 0; x < n; x++) {
      const b = (x / B) | 0;
      let mn = 255, mx = 0;
      for (let k = Math.max(0, b - 3); k <= Math.min(nb - 1, b + 3); k++) { if (bMin[k] < mn) mn = bMin[k]; if (bMax[k] > mx) mx = bMax[k]; }
      dark[x] = (mx - mn) >= 28 && lum[x] < (mn + mx) / 2 ? 1 : 0;
    }
    const runs = [];
    let cur = 0, len = 0; // starts with white
    for (let x = 0; x < n; x++) {
      if (dark[x] === cur) len++;
      else { runs.push(len); cur = dark[x]; len = 1; }
    }
    runs.push(len);
    // odd indexes = bars
    for (let i = 1; i < runs.length; i += 2) {
      const c = ean13At(runs, i) || ean8At(runs, i);
      if (c) return c;
    }
    return null;
  }
  function scan(img, w, h) {
    const data = img.data;
    const hits = {};
    const lumAt = (x, y) => { const o = (y * w + x) * 4; return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114; };
    const tryLine = (lum) => {
      let c = decodeLine(lum);
      if (!c) c = decodeLine(lum.slice().reverse());
      if (c) hits[c] = (hits[c] || 0) + 1;
    };
    const rows = 9;
    for (let k = 0; k < rows; k++) {
      const y = Math.min(h - 2, Math.max(1, Math.round(h * (0.2 + 0.6 * k / (rows - 1)))));
      const lum = new Float32Array(w);
      for (let x = 0; x < w; x++) lum[x] = (lumAt(x, y - 1) + lumAt(x, y) * 2 + lumAt(x, y + 1)) / 4;
      tryLine(lum);
    }
    for (let k = 0; k < rows; k++) {
      const x = Math.min(w - 2, Math.max(1, Math.round(w * (0.2 + 0.6 * k / (rows - 1)))));
      const lum = new Float32Array(h);
      for (let y = 0; y < h; y++) lum[y] = (lumAt(x - 1, y) + lumAt(x, y) * 2 + lumAt(x + 1, y)) / 4;
      tryLine(lum);
    }
    let best = null, cnt = 0;
    Object.keys(hits).forEach(c => { if (hits[c] > cnt) { best = c; cnt = hits[c]; } });
    return best ? { code: best, count: cnt } : null;
  }
  return { scan, check };
})();

/* ---------- Scanner window ---------- */
const pantryScan = {
  stream: null, track: null, timer: 0, idleTimer: 0, detector: null, detectorTried: false,
  mode: 'in', paused: false, busy: false, last: '', lastAt: 0, canvas: null, ctx: null,
  torch: false, current: null, lookupCache: new Map(), audio: null, wake: null,
};
// Short beep on a hit (Web Audio, no sound file). The sound is unlocked when the scanner is opened,
// because iPhone and Android only allow sounds after a tap.
function pantryScanAudioUnlock() {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!pantryScan.audio) pantryScan.audio = new C();
    if (pantryScan.audio.state === 'suspended') pantryScan.audio.resume();
  } catch (e) { /* without sound */ }
}
function pantryScanBeep() {
  try {
    const ctx = pantryScan.audio;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    [[1568, 0], [2093, 0.09]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + d); o.stop(t + d + 0.13);
    });
  } catch (e) { /* without sound */ }
}
// Screen stays on while the camera runs (a web app may not change the brightness itself)
async function pantryScanWake(on) {
  try {
    if (on) {
      if (pantryScan.wake || !('wakeLock' in navigator)) return;
      pantryScan.wake = await navigator.wakeLock.request('screen');
      pantryScan.wake.addEventListener('release', () => { pantryScan.wake = null; });
    } else if (pantryScan.wake) {
      const w = pantryScan.wake;
      pantryScan.wake = null;
      await w.release();
    }
  } catch (e) { pantryScan.wake = null; }
}
function pantryScanSetStatus(text, isError = false) {
  const el = document.getElementById('pantryScanStatus');
  el.textContent = text;
  el.classList.toggle('text-red-500', isError);
  el.classList.toggle('text-ink/50', !isError);
}
// withPhoto (since 1.119.2): offers "Take a photo of the barcode" – a plain file input with the camera, which also
// works where the live camera is not available (http:// address, camera blocked or failing).
function pantryScanSetCamMsg(text, withResume = false, withPhoto = false) {
  const el = document.getElementById('pantryScanCamMsg');
  if (!text) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  const btnCls = 'mt-2 px-3 py-1.5 rounded-lg bg-white text-pine text-xs font-medium';
  el.innerHTML = `<span>${escapeHtml(text)}</span>`
    + (withResume ? `<button type="button" id="pantryScanResume" class="${btnCls}">${escapeHtml(tk('pantry.scan.resume'))}</button>` : '')
    + (withPhoto ? `<button type="button" id="pantryScanPhotoBtn" class="${btnCls}">${escapeHtml(tk('pantry.scan.photo'))}</button>` : '');
  el.classList.remove('hidden');
  const btn = document.getElementById('pantryScanResume');
  if (btn) btn.addEventListener('click', () => { pantryScanSetCamMsg(''); pantryScanStartCamera(); });
  const photoBtn = document.getElementById('pantryScanPhotoBtn');
  if (photoBtn) photoBtn.addEventListener('click', () => {
    const input = document.getElementById('pantryScanPhotoInput');
    input.value = '';
    input.click();
  });
}
function pantryScanRenderMode() {
  document.querySelectorAll('.pscan-mode').forEach(b => {
    const on = b.dataset.scanmode === pantryScan.mode;
    b.classList.toggle('bg-white', on);
    b.classList.toggle('shadow-sm', on);
    b.classList.toggle('text-pine', on);
    b.classList.toggle('font-medium', on);
    b.classList.toggle('text-ink/60', !on);
  });
}
function openPantryScan() {
  if (typeof childLockActive === 'function' && childLockActive()) { childLockEditNotice(); return; }
  pantryScan.current = null;
  pantryScan.paused = false;
  document.getElementById('pantryScanResult').classList.add('hidden');
  document.getElementById('pantryScanResult').innerHTML = '';
  document.getElementById('pantryScanCodeInput').value = '';
  pantryScanRenderMode();
  pantryScanAudioUnlock();
  pantryScanSetStatus(tk('pantry.scan.hold'));
  document.getElementById('pantryScanModal').classList.remove('hidden');
  pantryScanStartCamera();
}
function closePantryScan() {
  pantryScanStopCamera();
  document.getElementById('pantryScanModal').classList.add('hidden');
  pantryScan.current = null;
  if (currentView === 'vorrat') renderPantry();
}
function pantryScanModalOpen() { return !document.getElementById('pantryScanModal').classList.contains('hidden'); }

async function pantryScanStartCamera() {
  pantryScanStopCamera();
  pantryScanSetCamMsg('');
  const video = document.getElementById('pantryScanVideo');
  // Browsers only give the live camera to pages opened via https:// (iPhone and iPad without exception) –
  // via http://…:8090 navigator.mediaDevices does not even exist. A photo still works.
  if (window.isSecureContext === false) {
    pantryScanSetCamMsg(tk('pantry.scan.needsHttps'), false, true);
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    pantryScanSetCamMsg(tk('pantry.scan.noCamera'), false, true);
    return;
  }
  try {
    pantryScan.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    pantryScanSetCamMsg(denied
      ? tk('pantry.scan.denied')
      : tk('pantry.scan.startFailed'), false, true);
    return;
  }
  if (!pantryScanModalOpen()) { pantryScanStopCamera(); return; }
  video.srcObject = pantryScan.stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  try { await video.play(); } catch (e) { /* starts with autoplay */ }
  pantryScan.track = pantryScan.stream.getVideoTracks()[0] || null;
  const torchBtn = document.getElementById('pantryScanTorch');
  torchBtn.classList.add('hidden');
  torchBtn.classList.remove('on');
  pantryScan.torch = false;
  // Always offer the torch while the camera runs - if the device does not release it, a notice appears on tap
  if (pantryScan.track) torchBtn.classList.remove('hidden');
  if (pantryScan.track) {
    try { await pantryScan.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) { /* ignore */ }
    try { await pantryScan.track.applyConstraints({ advanced: [{ exposureMode: 'continuous' }, { whiteBalanceMode: 'continuous' }] }); } catch (e) { /* ignore */ }
    try {
      const caps = pantryScan.track.getCapabilities ? pantryScan.track.getCapabilities() : {};
      if (caps && caps.torch) torchBtn.classList.remove('hidden'); // (already shown above)
    } catch (e) { /* ignore */ }
  }
  await pantryScanEnsureDetector();
  pantryScanWake(true);
  pantryScanArmIdle();
  pantryScanLoop();
}
// Built-in detector of the browser (Android/Chrome), tried once – otherwise PinnEan does the work
async function pantryScanEnsureDetector() {
  if (pantryScan.detectorTried) return pantryScan.detector;
  pantryScan.detectorTried = true;
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter(f => formats.includes(f));
      if (want.includes('ean_13')) pantryScan.detector = new window.BarcodeDetector({ formats: want });
    }
  } catch (e) { pantryScan.detector = null; }
  return pantryScan.detector;
}

/* ---------- Barcode from a photo (since 1.119.2) ----------
   Fallback when the live camera is not available. The photo is read like a video frame: first the built-in
   detector (if any), then PinnEan on the whole picture and on centred crops, because a barcode often fills only
   a small part of a photo. One hit is enough here (the check digit has to match); the code found most often wins. */
function pantryScanLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
async function pantryScanDecodePhoto(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const draw = (sx, sy, sw, sh, maxSide) => {
    const scale = Math.min(maxSide / Math.max(sw, sh), 3);
    canvas.width = Math.max(80, Math.round(sw * scale));
    canvas.height = Math.max(80, Math.round(sh * scale));
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  };
  const detector = await pantryScanEnsureDetector();
  if (detector) {
    try {
      draw(0, 0, iw, ih, 1600);
      const found = await detector.detect(canvas);
      const hit = (found || []).map(f => pantryNormCode(f.rawValue)).find(c => c && pantryCodeValid(c));
      if (hit) return hit;
    } catch (e) { /* fall back to PinnEan */ }
  }
  const hits = {};
  // [share of the picture, longest side in pixels]
  for (const [part, side] of [[1, 1400], [0.7, 1200], [0.45, 1000], [0.3, 900]]) {
    const sw = Math.round(iw * part), sh = Math.round(ih * part);
    draw(Math.round((iw - sw) / 2), Math.round((ih - sh) / 2), sw, sh, side);
    const res = PinnEan.scan(ctx.getImageData(0, 0, canvas.width, canvas.height), canvas.width, canvas.height);
    if (res) {
      const code = pantryNormCode(res.code);
      if (code && pantryCodeValid(code)) hits[code] = (hits[code] || 0) + res.count;
    }
    await new Promise(r => setTimeout(r, 0)); // keep the page responsive between the passes
  }
  let best = '', cnt = 0;
  Object.keys(hits).forEach(c => { if (hits[c] > cnt) { best = c; cnt = hits[c]; } });
  return best;
}
async function pantryScanFromPhoto(file) {
  if (!file || !pantryScanModalOpen()) return;
  pantryScanStopCamera();
  pantryScan.paused = false;
  pantryScan.current = null;
  document.getElementById('pantryScanResult').classList.add('hidden');
  document.getElementById('pantryScanResult').innerHTML = '';
  pantryScanSetStatus(tk('pantry.scan.photoReading'));
  let code = '';
  try { code = await pantryScanDecodePhoto(await pantryScanLoadImage(file)); } catch (e) { code = ''; }
  if (!pantryScanModalOpen()) return;
  if (!code) { pantryScanSetStatus(tk('pantry.scan.photoNone'), true); return; }
  pantryScanAccept(code);
}

function pantryScanStopCamera() {
  pantryScanWake(false);
  clearTimeout(pantryScan.timer);
  clearTimeout(pantryScan.idleTimer);
  pantryScan.timer = 0;
  if (pantryScan.stream) pantryScan.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* ignore */ } });
  pantryScan.stream = null;
  pantryScan.track = null;
  const video = document.getElementById('pantryScanVideo');
  if (video) { try { video.pause(); } catch (e) { /* ignore */ } video.srcObject = null; }
}
// Save battery: without a hit the camera switches off after 90 seconds
function pantryScanArmIdle() {
  clearTimeout(pantryScan.idleTimer);
  pantryScan.idleTimer = setTimeout(() => {
    if (!pantryScan.stream) return;
    pantryScanStopCamera();
    pantryScanSetCamMsg(tk('pantry.scan.paused'), true);
  }, 90000);
}
function pantryScanLoop() {
  clearTimeout(pantryScan.timer);
  if (!pantryScan.stream) return;
  pantryScan.timer = setTimeout(async () => {
    if (!pantryScan.stream) return;
    if (!pantryScan.paused && !pantryScan.busy && !document.hidden) {
      pantryScan.busy = true;
      try { await pantryScanTick(); } catch (e) { /* next attempt */ }
      pantryScan.busy = false;
    }
    pantryScanLoop();
  }, pantryScan.detector ? 160 : 140);
}
async function pantryScanTick() {
  const video = document.getElementById('pantryScanVideo');
  if (!video || video.readyState < 2 || !video.videoWidth) return;
  if (pantryScan.detector) {
    const found = await pantryScan.detector.detect(video);
    const hit = (found || []).map(f => pantryNormCode(f.rawValue)).find(c => c && pantryCodeValid(c));
    if (hit) pantryScanAccept(hit);
    return;
  }
  const vw = video.videoWidth, vh = video.videoHeight;
  const sx = Math.round(vw * 0.05), sw = Math.round(vw * 0.9);
  const sy = Math.round(vh * 0.15), sh = Math.round(vh * 0.7);
  const scale = Math.min(1, 900 / sw);
  const w = Math.max(80, Math.round(sw * scale)), h = Math.max(80, Math.round(sh * scale));
  if (!pantryScan.canvas) {
    pantryScan.canvas = document.createElement('canvas');
    pantryScan.ctx = pantryScan.canvas.getContext('2d', { willReadFrequently: true });
  }
  const cv = pantryScan.canvas;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  pantryScan.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  const res = PinnEan.scan(pantryScan.ctx.getImageData(0, 0, w, h), w, h);
  if (!res) return;
  const now = Date.now();
  if (res.count >= 2 || (pantryScan.last === res.code && now - pantryScan.lastAt < 1600)) {
    pantryScan.last = '';
    pantryScanAccept(pantryNormCode(res.code));
  } else {
    pantryScan.last = res.code;
    pantryScan.lastAt = now;
  }
}
function pantryScanAccept(code) {
  if (!code || pantryScan.paused) return;
  pantryScan.paused = true;
  clearTimeout(pantryScan.idleTimer);
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
  pantryScanBeep();
  const stage = document.getElementById('pantryScanStage');
  stage.classList.add('pscan-hit');
  setTimeout(() => stage.classList.remove('pscan-hit'), 500);
  pantryScanHandleCode(code);
}
function pantryScanResume() {
  pantryScan.current = null;
  pantryScan.paused = false;
  document.getElementById('pantryScanResult').classList.add('hidden');
  document.getElementById('pantryScanResult').innerHTML = '';
  pantryScanSetStatus(tk('pantry.scan.hold'));
  if (!pantryScan.stream) pantryScanStartCamera(); else pantryScanArmIdle();
}

async function pantryLookupBarcode(code) {
  if (pantryScan.lookupCache.has(code)) return pantryScan.lookupCache.get(code);
  if (!navigator.onLine) return { gefunden: false, offline: true };
  try {
    const res = await apiFetch('/api/pinn/vorrat/barcode?code=' + encodeURIComponent(code), { cache: 'no-store' });
    if (res.status === 404) return { gefunden: false, fehlt: true };
    const body = await res.json().catch(() => ({}));
    const out = body && typeof body === 'object' ? body : { gefunden: false };
    if (!out.error && !out.netz) pantryScan.lookupCache.set(code, out);
    return out;
  } catch (e) {
    return { gefunden: false, offline: true };
  }
}
const PANTRY_CAT_LOCATION = { milch: 'kuehlschrank', fleisch_fisch: 'kuehlschrank', obst_gemuese: 'kuehlschrank', tiefkuehl: 'gefrierschrank', drogerie: 'bad', haushalt: 'sonstiges', getraenke: 'keller' };
function pantryGuessLocation(catId) {
  const want = PANTRY_CAT_LOCATION[catId] || 'vorratsschrank';
  return pantryLocation(want) ? want : (pantryLocation('vorratsschrank') ? 'vorratsschrank' : '');
}

async function pantryScanHandleCode(code) {
  const box = document.getElementById('pantryScanResult');
  const known = pantryItemByBarcode(code);
  if (known) { pantryScanShowKnown(known, code); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="pscan-card text-sm text-ink/60">${escapeHtml(tk('pantry.scan.searching', { code }))}</div>`;
  pantryScanSetStatus('');
  const info = await pantryLookupBarcode(code);
  if (!pantryScanModalOpen() || !pantryScan.paused) return;
  pantryScanShowNew(code, info);
}

function pantryScanQtyHtml(id, value) {
  return `
    <div class="flex items-stretch rounded-lg border border-ink/15 overflow-hidden">
      <button type="button" data-qstep="-1" data-qtarget="${id}" class="pscan-step shrink-0 w-10 text-lg text-ink/60 hover:bg-ink/5">−</button>
      <input id="${id}" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(value)}" class="w-full min-w-0 border-0 px-1 py-2 text-base text-center" />
      <button type="button" data-qstep="1" data-qtarget="${id}" class="pscan-step shrink-0 w-10 text-lg text-ink/60 hover:bg-ink/5">+</button>
    </div>`;
}
function pantryScanWireSteps(box, unitOf) {
  box.querySelectorAll('.pscan-step').forEach(b => {
    b.addEventListener('pointerdown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      const input = document.getElementById(b.dataset.qtarget);
      const step = pantryStepSize(unitOf());
      const next = Math.max(0, Math.round(((pantryNum(input.value) || 0) + Number(b.dataset.qstep) * step) * 100) / 100);
      input.value = fmtPantryNum(next);
    });
  });
}
function pantryScanDefaultQty(unit) { const s = pantryStepSize(unit); return fmtPantryNum(s >= 1 ? 1 : s); }

// Barcode already belongs to an item: stock it up or use it
function pantryScanShowKnown(p, code) {
  pantryScan.current = { kind: 'known', id: p.id, code };
  const box = document.getElementById('pantryScanResult');
  const cat = pantryCategory(p.category);
  const loc = pantryLocation(p.location);
  const isIn = pantryScan.mode === 'in';
  const d = pantryExpiryDays(p);
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="pscan-card">
      <div class="flex items-start gap-3 mb-3">
        <span class="text-2xl leading-none">${escapeHtml(cat.icon || '📦')}</span>
        <div class="flex-1 min-w-0">
          <div class="font-medium truncate">${escapeHtml(p.name)}</div>
          <div class="text-[11px] text-ink/50 truncate">${escapeHtml(tk('pantry.scan.inStock', { stock: pantryStockText(p) }))}${loc ? ' · ' + escapeHtml((loc.icon ? loc.icon + ' ' : '') + i18nT(loc.label)) : ''}</div>
          ${d !== null ? `<div class="text-[11px] text-ink/50">${escapeHtml(tk('pantry.bestBeforeShort', { date: pantryShortDate(p.bestBefore) }))}${d <= pantrySettings.mhdDays ? ' · ' + escapeHtml(pantryExpiryLabel(d)) : ''}</div>` : ''}
        </div>
      </div>
      <div class="grid ${isIn ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-3">
        <div class="min-w-0">
          <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanQty">${escapeHtml(isIn ? tk('pantry.scan.add') : tk('pantry.scan.used'))}${p.unit ? ' (' + escapeHtml(p.unit) + ')' : ''}</label>
          ${pantryScanQtyHtml('pscanQty', pantryScanDefaultQty(p.unit))}
        </div>
        ${isIn ? `<div class="min-w-0">
          <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanMhd">${escapeHtml(tk('pantry.sortBestBefore'))}</label>
          <input id="pscanMhd" type="date" class="w-full rounded-lg border border-ink/15 px-2 py-2 text-base bg-white" />
        </div>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <button type="button" id="pscanCancel" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5">${escapeHtml(tk('common.cancel'))}</button>
        <div class="flex-1"></div>
        <button type="button" id="pscanSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium">${escapeHtml(isIn ? tk('pantry.scan.putAway') : tk('pantry.scan.useUp'))}</button>
      </div>
    </div>`;
  pantryScanWireSteps(box, () => p.unit);
  document.getElementById('pscanCancel').addEventListener('click', pantryScanResume);
  document.getElementById('pscanSave').addEventListener('click', () => {
    const amount = Math.max(0, pantryNum(document.getElementById('pscanQty').value) || 0);
    const mhdEl = document.getElementById('pscanMhd');
    pantryScanBook(p.id, code, amount, mhdEl ? mhdEl.value : '');
  });
}

function pantryScanBook(id, code, amount, mhd) {
  const isIn = pantryScan.mode === 'in';
  let name = '';
  pantryItems = pantryItems.map(p => {
    if (p.id !== id) return p;
    name = p.name;
    let next = { ...p };
    if (isIn) {
      next.bestBefore = pantryMergeBestBefore(p, mhd);
      next.qty = Math.round(((pantryNum(p.qty) || 0) + amount) * 100) / 100;
    } else {
      next.qty = Math.max(0, Math.round(((pantryNum(p.qty) || 0) - amount) * 100) / 100);
      if (next.qty <= 0) next.bestBefore = '';
    }
    next = pantryAttachBarcode(next, code);
    next.updatedAt = Date.now();
    return next;
  });
  const p = pantryItems.find(x => x.id === id);
  const wasOn = shoppingItems.some(it => it.pantryId === id && !it.done);
  pantryCommit();
  pantryScheduleExpiryCheck();
  const isOn = shoppingItems.some(it => it.pantryId === id && !it.done);
  let msg = isIn ? tk('pantry.scan.booked', { name, qty: fmtPantryNum(amount) }) : tk('pantry.scan.consumed', { name, qty: fmtPantryNum(amount) });
  if (p && !wasOn && isOn) msg += ' ' + tk('pantry.scan.nowLow');
  finShowToast(msg);
  pantryScanResume();
}

// Barcode still unknown: create a new item or assign it to an existing one
function pantryScanShowNew(code, info) {
  pantryScan.current = { kind: 'new', code };
  const box = document.getElementById('pantryScanResult');
  const found = !!(info && info.gefunden);
  const catId = found && info.kategorie && pantryCategories.some(c => c.id === info.kategorie) ? info.kategorie : (pantryCategories.some(c => c.id === 'sonstiges') ? 'sonstiges' : (pantryCategories[0] || {}).id || 'sonstiges');
  const locId = pantryGuessLocation(catId);
  const note = found ? [info.marke, info.menge].filter(Boolean).join(' · ') : '';
  const source = found ? ({ off: 'Open Food Facts', obf: 'Open Beauty Facts', opf: 'Open Products Facts', opff: 'Open Pet Food Facts' }[info.quelle] || '') : '';
  let hint;
  if (found) hint = source ? tk('pantry.scan.foundIn', { source }) : tk('pantry.scan.found');
  else if (info && info.fehlt) hint = tk('pantry.scan.hookMissing');
  else if (info && info.offline) hint = tk('pantry.scan.offline');
  else if (info && info.netz) hint = tk('pantry.scan.dbUnreachable');
  else hint = tk('pantry.scan.unknown');
  const isIn = pantryScan.mode === 'in';
  const others = pantryItems.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }));
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="pscan-card">
      <div class="text-[11px] text-ink/50 mb-2">${escapeHtml(hint)}</div>
      ${others.length ? `
      <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanLink">${escapeHtml(tk('pantry.scan.linkExisting'))}</label>
      <select id="pscanLink" class="w-full rounded-lg border border-ink/15 px-2.5 py-2 text-sm bg-white mb-3">
        <option value="">${escapeHtml(tk('pantry.scan.newItemOpt'))}</option>
        ${others.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
      </select>` : ''}
      <div id="pscanNewFields">
        <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanName">${escapeHtml(tk('common.name'))}</label>
        <input id="pscanName" type="text" autocomplete="off" maxlength="80" value="${escapeHtml(found ? info.name || '' : '')}" placeholder="${escapeHtml(tk('pantry.scan.namePlaceholder'))}" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-base mb-2" />
        ${note ? `<div class="text-[11px] text-ink/45 mb-2">${escapeHtml(tk('pantry.scan.noteLine', { note }))}</div>` : ''}
        <div class="grid grid-cols-2 gap-2 mb-2">
          <div class="min-w-0">
            <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanCat">${escapeHtml(tk('pantry.item.category'))}</label>
            <select id="pscanCat" class="w-full rounded-lg border border-ink/15 px-2 py-2 text-sm bg-white">
              ${pantryCategories.map(c => `<option value="${escapeHtml(c.id)}"${c.id === catId ? ' selected' : ''}>${escapeHtml((c.icon ? c.icon + ' ' : '') + i18nT(c.label))}</option>`).join('')}
            </select>
          </div>
          <div class="min-w-0">
            <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanLoc">${escapeHtml(tk('pantry.item.place'))}</label>
            <select id="pscanLoc" class="w-full rounded-lg border border-ink/15 px-2 py-2 text-sm bg-white">
              <option value="">–</option>
              ${pantryLocations.map(l => `<option value="${escapeHtml(l.id)}"${l.id === locId ? ' selected' : ''}>${escapeHtml((l.icon ? l.icon + ' ' : '') + i18nT(l.label))}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="grid ${isIn ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mb-3">
        <div class="min-w-0">
          <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanQty">${escapeHtml(isIn ? tk('shop.entry.quantity') : tk('pantry.scan.used'))}</label>
          ${pantryScanQtyHtml('pscanQty', '1')}
        </div>
        ${isIn ? `<div class="min-w-0">
          <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1" for="pscanMhd">${escapeHtml(tk('pantry.sortBestBefore'))}</label>
          <input id="pscanMhd" type="date" class="w-full rounded-lg border border-ink/15 px-2 py-2 text-base bg-white" />
        </div>` : ''}
      </div>
      <p id="pscanErr" class="hidden text-xs text-red-500 mb-2"></p>
      <div class="flex items-center gap-2">
        <button type="button" id="pscanCancel" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5">${escapeHtml(tk('common.cancel'))}</button>
        <div class="flex-1"></div>
        <button type="button" id="pscanSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium">${escapeHtml(isIn ? tk('pantry.scan.createPut') : tk('pantry.scan.linkUse'))}</button>
      </div>
      <div class="text-[10px] text-ink/35 mt-2 tabular-nums">${escapeHtml(tk('pantry.scan.barcodeLine', { code }))}</div>
    </div>`;
  const linkSel = document.getElementById('pscanLink');
  const newFields = document.getElementById('pscanNewFields');
  const saveBtn = document.getElementById('pscanSave');
  const syncLink = () => {
    const linked = linkSel && linkSel.value;
    newFields.classList.toggle('hidden', !!linked);
    saveBtn.textContent = linked ? (isIn ? tk('pantry.scan.linkPut') : tk('pantry.scan.linkUse')) : (isIn ? tk('pantry.scan.createPut') : tk('pantry.scan.linkUse'));
  };
  if (linkSel) linkSel.addEventListener('change', syncLink);
  if (!isIn && linkSel) { linkSel.value = ''; }
  syncLink();
  if (!isIn && !linkSel) newFields.classList.add('hidden');
  pantryScanWireSteps(box, () => {
    const linked = linkSel && linkSel.value ? pantryItems.find(p => p.id === linkSel.value) : null;
    return linked ? linked.unit : '';
  });
  document.getElementById('pscanCancel').addEventListener('click', pantryScanResume);
  saveBtn.addEventListener('click', () => {
    const err = document.getElementById('pscanErr');
    const amount = Math.max(0, pantryNum(document.getElementById('pscanQty').value) || 0);
    const mhdEl = document.getElementById('pscanMhd');
    const mhd = mhdEl ? mhdEl.value : '';
    const linked = linkSel && linkSel.value ? pantryItems.find(p => p.id === linkSel.value) : null;
    if (linked) { pantryScanBook(linked.id, code, amount, mhd); return; }
    if (!isIn) { err.textContent = tk('pantry.scan.chooseExisting'); err.classList.remove('hidden'); return; }
    const name = document.getElementById('pscanName').value.trim();
    if (!name) { err.textContent = tk('common.needName'); err.classList.remove('hidden'); return; }
    const dup = pantryItems.find(x => pantryNameKey(x.name) === pantryNameKey(name));
    if (dup) { pantryScanBook(dup.id, code, amount, mhd); return; }
    const item = {
      id: 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, qty: amount, unit: '', minQty: null,
      category: document.getElementById('pscanCat').value || 'sonstiges',
      location: document.getElementById('pscanLoc').value || '',
      stores: [], note, bestBefore: amount > 0 && pantryIsoValid(mhd) ? mhd : '',
      barcodes: [code], updatedAt: Date.now(),
    };
    pantryItems = [...pantryItems, item];
    pantryCommit();
    pantryScheduleExpiryCheck();
    finShowToast(tk('pantry.scan.created', { name }));
    pantryScanResume();
  });
}

function pantryScanManualLookup() {
  const input = document.getElementById('pantryScanCodeInput');
  const code = pantryNormCode(input.value);
  if (!code || !pantryCodeValid(code)) { pantryScanSetStatus(tk('pantry.scan.badCode'), true); return; }
  input.blur();
  pantryScan.paused = true;
  pantryScanHandleCode(code);
}

/* ---------- Was kann ich kochen? (what can I cook?) ---------- */
const PCOOK_UNITS = new Set(['g', 'gr', 'gramm', 'kg', 'kilo', 'mg', 'ml', 'l', 'liter', 'cl', 'dl', 'el', 'tl', 'msp', 'messerspitze', 'messerspitzen', 'prise', 'prisen', 'pck', 'päckchen', 'packung', 'packungen', 'pkg', 'dose', 'dosen', 'glas', 'gläser', 'becher', 'bund', 'stück', 'stk', 'st', 'zehe', 'zehen', 'scheibe', 'scheiben', 'tasse', 'tassen', 'tropfen', 'handvoll', 'zweig', 'zweige', 'stiel', 'stiele', 'blatt', 'blätter', 'würfel', 'beutel', 'flasche', 'flaschen', 'kopf', 'köpfe', 'stange', 'stangen', 'knolle', 'knollen', 'tüte', 'tüten', 'schuss', 'spritzer', 'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb', 'can', 'cans', 'pinch', 'clove', 'cloves']);
const PCOOK_STOP = new Set(['frisch', 'frische', 'frischer', 'frisches', 'gross', 'grosse', 'grosser', 'grosses', 'klein', 'kleine', 'kleiner', 'kleines', 'mittelgross', 'mittelgrosse', 'gehackt', 'gehackte', 'gehackter', 'gerieben', 'geriebene', 'geriebener', 'gewurfelt', 'gewurfelte', 'weich', 'weiche', 'kalt', 'kalte', 'kaltes', 'warm', 'warme', 'reif', 'reife', 'fein', 'feine', 'grob', 'grobe', 'getrocknet', 'getrocknete', 'gemahlen', 'gemahlene', 'geschalt', 'geschalte', 'zimmerwarm', 'zimmerwarme', 'etwas', 'evtl', 'und', 'oder', 'mit', 'vom', 'von', 'der', 'die', 'das', 'den', 'fur', 'zum', 'zur', 'nach', 'belieben', 'bio', 'tiefgekuhlt', 'tiefgekuhlte', 'ca', 'circa', 'gut', 'nicht', 'ohne', 'aus', 'dem', 'ein', 'eine', 'einer', 'fresh', 'large', 'small', 'chopped']);
const PCOOK_BASICS = new Set(['salz', 'pfeffer', 'wasser', 'leitungswasser', 'eiswurfel', 'salt', 'pepper', 'water']);
const PCOOK_FORMS = ['zeh', 'zehe', 'zehen', 'wurfel', 'scheib', 'scheibe', 'scheiben', 'streifen', 'stuck', 'stucke', 'blatt', 'blatter', 'knoll', 'knolle'];
const PCOOK_SYN = { ei: 'eier' };
const PCOOK_OPTIONAL = /nach belieben|optional|zum garnieren|zum bestreuen|zum servieren|zum anbraten|zum braten|evtl\.?|n\. ?b\./i;
let pcookOnlyExpiring = false;
let pcookOnlyFav = false;
let pcookShowAll = false;
let pcookResults = [];

function pcookStem(w) {
  if (PCOOK_SYN[w]) return PCOOK_SYN[w];
  for (const suf of ['ern', 'en', 'er', 'n', 'e', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}
function pcookWords(text) {
  return gsNorm(text).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !PCOOK_STOP.has(w) && !/^\d+$/.test(w))
    .map(pcookStem);
}
function pcookWordMatch(a, b) {
  if (a === b) return true;
  const short = a.length <= b.length ? a : b, long = a.length <= b.length ? b : a;
  if (short.length < 4) return false;
  if (long.endsWith(short)) return true; // Weizenmehl ↔ Mehl
  if (long.startsWith(short) && PCOOK_FORMS.includes(long.slice(short.length))) return true; // Knoblauchzehe ↔ Knoblauch
  return false;
}
// Ingredient line -> { core, qty, unit, optional, basic }
function pcookParseLine(line) {
  const raw = String(line || '').trim();
  if (!raw || isLikelyGroupHeader(raw)) return null;
  const optional = PCOOK_OPTIONAL.test(raw);
  let s = raw, qty = null, unit = '';
  const q = parseLeadingQuantity(raw);
  if (q) { s = q.rest; qty = q.max; }
  const um = s.match(/^([A-Za-zÄÖÜäöüß]+)\.?(?:\s+|$)/);
  if (um && PCOOK_UNITS.has(um[1].toLowerCase())) { unit = um[1].toLowerCase(); s = s.slice(um[0].length); }
  s = s.split(/[,(;]| oder | or | – | - /)[0].trim();
  if (!s) return null;
  const words = pcookWords(s);
  const allWords = gsNorm(raw).replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w && !PCOOK_STOP.has(w) && !PCOOK_UNITS.has(w));
  const basic = !!allWords.length && allWords.every(w => PCOOK_BASICS.has(w));
  return { raw, core: s, words, qty, unit, optional, basic };
}
function pcookUnitDim(u) {
  const x = String(u || '').trim().toLowerCase().replace(/\.$/, '');
  if (x === 'g' || x === 'gr' || x === 'gramm') return ['g', 1];
  if (x === 'kg' || x === 'kilo') return ['g', 1000];
  if (x === 'ml') return ['ml', 1];
  if (x === 'l' || x === 'liter') return ['ml', 1000];
  if (x === 'cl') return ['ml', 10];
  if (x === 'dl') return ['ml', 100];
  if (!x || x === 'stück' || x === 'stk' || x === 'st') return ['stk', 1];
  return null;
}
// Match in the pantry: first identical words, then word parts (Weizenmehl ↔ Mehl). exact = same word.
function pcookFindPantry(words, avail) {
  if (!words.length) return null;
  const ex = avail.find(a => words.some(w => a.words.includes(w)));
  if (ex) return { p: ex.p, exact: true };
  const part = avail.find(a => words.some(w => a.words.some(pw => pcookWordMatch(w, pw))));
  return part ? { p: part.p, exact: false } : null;
}
function pcookCompute() {
  const avail = pantryItems.filter(p => (pantryNum(p.qty) || 0) > 0).map(p => ({ p, words: pcookWords(p.name) }));
  const out = [];
  recipes.forEach(r => {
    const lines = (r.ingredients || []).map(pcookParseLine).filter(Boolean);
    const counted = lines.filter(l => !l.optional && !l.basic);
    if (!counted.length) return;
    const have = [], short = [], missing = [], expiring = [];
    counted.forEach(l => {
      const hit = pcookFindPantry(l.words, avail);
      if (!hit) { missing.push(l); return; }
      const p = hit.p;
      if (pantryIsExpiring(p) && !expiring.includes(p)) expiring.push(p);
      const du = l.qty !== null ? pcookUnitDim(l.unit) : null;
      const pu = pcookUnitDim(p.unit);
      // Compare pieces only for the same word (3 Knoblauchzehen ≠ 3 Knollen Knoblauch)
      if (du && pu && du[0] === pu[0] && (du[0] !== 'stk' || hit.exact)) {
        const need = l.qty * du[1];
        const got = (pantryNum(p.qty) || 0) * pu[1];
        if (got + 1e-9 < need) { short.push({ line: l, p }); return; }
      }
      have.push({ line: l, p });
    });
    out.push({ r, total: counted.length, have, short, missing, expiring, fav: isRecipeFavorite(String(r.id)) });
  });
  out.sort((a, b) => (a.missing.length + a.short.length) - (b.missing.length + b.short.length)
    || b.expiring.length - a.expiring.length
    || (b.fav ? 1 : 0) - (a.fav ? 1 : 0)
    || b.have.length - a.have.length
    || String(a.r.title || '').localeCompare(String(b.r.title || ''), 'de', { sensitivity: 'base' }));
  return out;
}
function pcookTimeText(r) {
  const t = (Number(r.prepTime) || 0) + (Number(r.cookTime) || 0);
  return t > 0 ? '⏱ ' + tk('recipe.minutes', { n: t }) : '';
}
function pcookCardHtml(x, idx) {
  const r = x.r;
  const ok = x.have.length;
  const pct = Math.round(ok / x.total * 100);
  const lack = [...x.missing.map(l => ({ t: l.core, cls: 'pcook-miss' })), ...x.short.map(s => ({ t: s.line.core, cls: 'pcook-short' }))];
  const meta = [tk('pantry.cook.have', { n: ok, total: x.total }), pcookTimeText(r)].filter(Boolean).join(' · ');
  return `
    <div class="pcook-card" data-idx="${idx}">
      <div class="flex items-start gap-3">
        <div class="pcook-ring shrink-0" style="--p:${pct}"><span>${ok}/${x.total}</span></div>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm leading-snug">${x.fav ? '❤️ ' : ''}${escapeHtml(r.title || tk('recipe.untitled'))}</div>
          <div class="text-[11px] text-ink/50 mt-0.5">${escapeHtml(meta)}</div>
          ${x.expiring.length ? `<div class="pcook-exp mt-1">⏳ ${escapeHtml(tk('pantry.cook.usesUp'))} ${escapeHtml(x.expiring.map(p => p.name).join(', '))}</div>` : ''}
          ${lack.length ? `<div class="flex flex-wrap gap-1 mt-1.5">${lack.map(l => `<span class="pcook-chip ${l.cls}">${escapeHtml(l.t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-2.5 justify-end">
        <button type="button" data-pc="open" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:border-pine hover:text-pine">${escapeHtml(tk('pantry.cook.view'))}</button>
        <button type="button" data-pc="plan" class="pcook-act px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:border-pine hover:text-pine">${escapeHtml(tk('pantry.cook.plan'))}</button>
        ${lack.length ? '<button type="button" data-pc="shop" class="pcook-act px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium">' + escapeHtml(tk('pantry.cook.missing')) + '</button>' : ''}
      </div>
      <div class="pcook-shop hidden mt-2.5"></div>
    </div>`;
}
function openPantryCook(opts = {}) {
  pcookOnlyExpiring = !!opts.expiring;
  pcookOnlyFav = false;
  pcookShowAll = false;
  renderPantryCook();
  document.getElementById('pantryCookModal').classList.remove('hidden');
}
function closePantryCook() { document.getElementById('pantryCookModal').classList.add('hidden'); }
function renderPantryCook() {
  const list = document.getElementById('pantryCookList');
  const sub = document.getElementById('pantryCookSub');
  document.getElementById('pantryCookExpOnly').classList.toggle('active', pcookOnlyExpiring);
  document.getElementById('pantryCookFavOnly').classList.toggle('active', pcookOnlyFav);
  const stock = pantryItems.filter(p => (pantryNum(p.qty) || 0) > 0).length;
  if (!recipes.length) {
    sub.textContent = '';
    list.innerHTML = '<p class="text-sm text-ink/45 italic text-center py-6">' + escapeHtml(tk('pantry.cook.noRecipes')) + '</p>';
    return;
  }
  if (!stock) {
    sub.textContent = '';
    list.innerHTML = '<p class="text-sm text-ink/45 italic text-center py-6">' + escapeHtml(tk('pantry.cook.noStock')) + '</p>';
    return;
  }
  pcookResults = pcookCompute();
  let rows = pcookResults;
  if (pcookOnlyExpiring) rows = rows.filter(x => x.expiring.length);
  if (pcookOnlyFav) rows = rows.filter(x => x.fav);
  sub.textContent = tk('pantry.cook.stock', { n: stock }) + ' · ' + tk('pantry.cook.checked', { n: pcookResults.length });
  if (!rows.length) {
    list.innerHTML = `<p class="text-sm text-ink/45 italic text-center py-6">${escapeHtml(pcookOnlyExpiring ? tk('pantry.cook.noneExpiring') : tk('pantry.cook.noneMatch'))}</p>`;
    return;
  }
  const all = rows.filter(x => !x.missing.length && !x.short.length);
  const near = rows.filter(x => (x.missing.length || x.short.length) && x.missing.length + x.short.length <= 2);
  const rest = rows.filter(x => x.missing.length + x.short.length > 2);
  const sec = (title, items) => items.length ? `
    <div>
      <h4 class="text-xs uppercase tracking-wide text-ink/40 mb-2">${escapeHtml(title)} <span class="normal-case tracking-normal text-ink/30">· ${items.length}</span></h4>
      <div class="flex flex-col gap-2">${items.map(x => pcookCardHtml(x, pcookResults.indexOf(x))).join('')}</div>
    </div>` : '';
  let html = sec(tk('pantry.cook.allThere'), all) + sec(tk('pantry.cook.nearly'), near);
  if (rest.length) {
    html += pcookShowAll || (!all.length && !near.length)
      ? sec(tk('pantry.cook.more'), rest.slice(0, 30))
      : `<button type="button" id="pcookMoreBtn" class="self-center px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine">${escapeHtml(tk('pantry.cook.showMore', { n: rest.length }))}</button>`;
  }
  list.innerHTML = html;
  const more = document.getElementById('pcookMoreBtn');
  if (more) more.addEventListener('click', () => { pcookShowAll = true; renderPantryCook(); });
  list.querySelectorAll('.pcook-card').forEach(card => {
    const x = pcookResults[Number(card.dataset.idx)];
    if (!x) return;
    card.querySelectorAll('[data-pc]').forEach(b => b.addEventListener('click', () => pcookAction(b.dataset.pc, x, card)));
  });
}
function pcookAction(act, x, card) {
  if (act === 'open') {
    closePantryCook();
    setView('rezepte');
    openRecipeDetailPage(x.r.id);
    return;
  }
  if (act === 'plan') {
    closePantryCook();
    const hour = new Date().getHours();
    openMealModal(isoDate(new Date()), hour < 10 ? 'fruehstueck' : hour < 14 ? 'mittag' : 'abend', x.r.id);
    return;
  }
  if (act === 'shop') {
    const box = card.querySelector('.pcook-shop');
    if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
    const hideMeal = typeof shoppingMealListHidden === 'function' && shoppingMealListHidden();
    const lists = allShoppingLists().filter(sl => !(hideMeal && sl.id === SHOPPING_MEAL_LIST_ID));
    const stamm = shoppingStammladenId();
    box.innerHTML = `<div class="text-[11px] text-ink/50 mb-1.5">${escapeHtml(tk('lists.shop.title'))}</div><div class="ls-shop-grid">${lists.map(sl => `<button type="button" class="ls-shop-btn${sl.id === stamm ? ' border-pine' : ''}" data-sl="${escapeHtml(sl.id)}">${shoppingListLogoHtml(sl, 28)}<span>${escapeHtml(sl.name || tk('shop.shareTitle'))}${sl.id === stamm ? ' ⭐' : ''}</span></button>`).join('') || '<p class="text-sm text-ink/40">' + escapeHtml(tk('lists.shop.none')) + '</p>'}</div>`;
    box.classList.remove('hidden');
    box.querySelectorAll('[data-sl]').forEach(b => b.addEventListener('click', () => pcookToShopping(x, b.dataset.sl)));
  }
}
function pcookToShopping(x, listId) {
  const target = listId === SHOPPING_MEAL_LIST_ID ? '' : listId;
  const lines = [...x.missing, ...x.short.map(s => s.line)];
  let added = 0;
  lines.forEach(l => {
    const name = l.core.charAt(0).toUpperCase() + l.core.slice(1);
    const exists = shoppingItems.some(it => !it.done && (it.listId || '') === target && normalizeForGrouping(it.name || '') === normalizeForGrouping(name));
    if (exists) return;
    const qty = l.qty !== null ? (formatScaledNumber(l.qty) + (l.unit ? ' ' + l.unit : '')) : '';
    shoppingItems = [...shoppingItems, {
      id: 'si' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name, qty, note: tk('lists.forPerson', { name: x.r.title || tk('search.type.recipe') }), done: false, createdAt: Date.now(), listId: target,
    }];
    added++;
  });
  persistState();
  if (currentView === 'einkauf') renderShoppingList();
  const list = getShoppingList(listId);
  const lname = list ? list.name : tk('shop.shareTitle');
  finShowToast(added ? tk('pantry.cook.added', { n: added, name: lname }) : tk('pantry.cook.alreadyAll'));
  renderPantryCook();
}

/* ---------- Wiring for Pantry 2.0 ---------- */
document.getElementById('openPantryScanBtn').addEventListener('click', openPantryScan);
document.getElementById('openPantryCookBtn').addEventListener('click', () => openPantryCook());
document.getElementById('openRecipeCookBtn').addEventListener('click', () => openPantryCook());
document.getElementById('pantryExpCookBtn').addEventListener('click', () => openPantryCook({ expiring: true }));
document.getElementById('pantryExpToggle').addEventListener('click', () => { pantryOnlyExpiring = !pantryOnlyExpiring; renderPantry(); });
document.getElementById('pantryBestBeforeClear').addEventListener('click', () => { document.getElementById('pantryBestBeforeInput').value = ''; });
document.getElementById('pantryScanClose').addEventListener('click', closePantryScan);
document.getElementById('pantryScanDone').addEventListener('click', closePantryScan);
document.getElementById('pantryScanModal').addEventListener('click', (e) => { if (e.target.id === 'pantryScanModal') closePantryScan(); });
document.querySelectorAll('.pscan-mode').forEach(b => b.addEventListener('click', () => {
  pantryScan.mode = b.dataset.scanmode === 'out' ? 'out' : 'in';
  pantryScanRenderMode();
  const cur = pantryScan.current;
  if (cur && cur.kind === 'known') { const p = pantryItems.find(x => x.id === cur.id); if (p) pantryScanShowKnown(p, cur.code); }
  else if (cur && cur.kind === 'new') pantryScanHandleCode(cur.code);
}));
document.getElementById('pantryScanTorch').addEventListener('click', async () => {
  const track = pantryScan.track;
  const btn = document.getElementById('pantryScanTorch');
  if (!track) return;
  const want = !pantryScan.torch;
  const isOn = () => { try { const s = track.getSettings ? track.getSettings() : {}; return typeof s.torch === 'boolean' ? s.torch : null; } catch (e) { return null; } };
  let ok = false;
  for (const c of [{ advanced: [{ torch: want }] }, { torch: want }, { advanced: [{ fillLightMode: want ? 'flash' : 'off' }] }]) {
    try {
      await track.applyConstraints(c);
      const s = isOn();
      if (s === null || s === want) { ok = true; break; }
    } catch (e) { /* next spelling */ }
  }
  if (ok) {
    pantryScan.torch = want;
    btn.classList.toggle('on', want);
    btn.setAttribute('aria-pressed', want ? 'true' : 'false');
  } else {
    pantryScan.torch = false;
    btn.classList.remove('on');
    pantryScanSetStatus(tk('pantry.scan.torchFailed'), true);
  }
});
document.getElementById('pantryScanCodeBtn').addEventListener('click', pantryScanManualLookup);
document.getElementById('pantryScanPhotoInput').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  pantryScanFromPhoto(file);
});
document.getElementById('pantryScanCodeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); pantryScanManualLookup(); } });
document.getElementById('pantryCookClose').addEventListener('click', closePantryCook);
document.getElementById('pantryCookModal').addEventListener('click', (e) => { if (e.target.id === 'pantryCookModal') closePantryCook(); });
document.getElementById('pantryCookExpOnly').addEventListener('click', () => { pcookOnlyExpiring = !pcookOnlyExpiring; renderPantryCook(); });
document.getElementById('pantryCookFavOnly').addEventListener('click', () => { pcookOnlyFav = !pcookOnlyFav; renderPantryCook(); });
// App in the background: camera off (battery); back again: continue as long as nothing is displayed
document.addEventListener('visibilitychange', () => {
  if (!pantryScanModalOpen()) return;
  if (document.hidden) pantryScanStopCamera();
  else if (!pantryScan.paused) pantryScanStartCamera();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (pantryScanModalOpen()) { closePantryScan(); return; }
  if (!document.getElementById('pantryCookModal').classList.contains('hidden')) closePantryCook();
});

/* ---------- Plan a shopping trip: link a task with shopping lists (one per store) ----------
   "Einkauf planen" opens the normal task popup plus a choice of shopping lists. The
   link task <-> lists is kept in the family record (shoppingPlans), so no change to the
   tasks collection on the NAS is needed for it - offline-capable like everything else.
   When the task is ticked off, "Einkauf erledigt" appears: per store the amount, name (default
   "Einkauf bei <store>") and category (automatically from the store or the one chosen last) -
   all changeable. Every store with an amount is booked as its own expense in Finanzen. */
let taskShoppingMode = false;
let pendingTaskShoppingLists = [];
let taskTitleAuto = false; // The title is built from the chosen stores until someone changes it themselves

function shoppingPlanForTask(taskId) { return shoppingPlans.find(p => p.id === taskId) || null; }

function saveShoppingPlan(taskId, listIds) {
  const existing = shoppingPlanForTask(taskId);
  if (existing) {
    shoppingPlans = shoppingPlans.map(p => p.id === taskId ? { ...p, listIds: [...listIds] } : p);
  } else {
    shoppingPlans = [...shoppingPlans, { id: taskId, listIds: [...listIds], createdAt: Date.now(), bookedAt: '' }];
  }
  persistState();
  ladenPlansSync(false);
}
function removeShoppingPlan(taskId) {
  if (!shoppingPlanForTask(taskId)) return;
  shoppingPlans = shoppingPlans.filter(p => p.id !== taskId);
  persistState();
  ladenPlansSync(false);
  ntRefresh();
}
// Remove links to tasks that no longer exist on the NAS (e.g. done ones cleaned up
// after 2 days). Ones that were just created (possibly not yet synced) stay.
function pruneShoppingPlans() {
  if (!shoppingPlans.length) return;
  const known = new Set(aufgabenServer.map(a => a.id));
  outboxRead().forEach(op => { if (op.kind === 'task-save' && op.data) known.add(op.data.id); });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const keep = shoppingPlans.filter(p => known.has(p.id) || (p.createdAt || 0) > cutoff);
  if (keep.length !== shoppingPlans.length) { shoppingPlans = keep; persistState(); }
}

function shoppingPlanBadgeHtml(task) {
  const plan = shoppingPlanForTask(task.id);
  if (!plan) return '';
  const lists = plan.listIds.map(id => getShoppingList(id)).filter(Boolean);
  if (!lists.length) return '';
  return `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${lists.map(l => `
    <span class="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full border border-ink/10 text-[11px] text-ink/60">
      ${shoppingListLogoHtml(l, 18)}<span class="truncate max-w-[7rem]">${escapeHtml(l.name || '')}</span>
    </span>`).join('')}${plan.bookedAt ? '<span class="text-[10px] text-ink/40">· ' + escapeHtml(tk('shop.plan.booked')) + '</span>' : ''}${isViewAllowed('einkauf') ? `<span class="task-shopping-open">${escapeHtml(tk('shop.plan.openLists', { n: lists.length }))}</span>` : ''}</div>`;
}

function shoppingPlanAutoTitle() {
  const names = pendingTaskShoppingLists.map(id => getShoppingList(id)).filter(Boolean).map(l => l.name || '');
  return names.length ? tk('shop.shoppingAt', { names: names.join(', ') }) : tk('shop.plan.shopping');
}

function setTaskShoppingMode(on, selectedIds = []) {
  taskShoppingMode = !!on;
  pendingTaskShoppingLists = on ? [...selectedIds] : [];
  document.getElementById('taskShoppingBlock').classList.toggle('hidden', !on);
  if (on) renderTaskShoppingListPicker();
  else document.getElementById('taskShoppingListPicker').innerHTML = '';
}

function renderTaskShoppingListPicker() {
  const wrap = document.getElementById('taskShoppingListPicker');
  wrap.innerHTML = allShoppingLists().map(list => {
    const active = pendingTaskShoppingLists.includes(list.id);
    const { count } = shoppingListSummary(list.id);
    return `
      <label class="plan-list-chip relative flex flex-col items-center gap-1 rounded-xl border border-ink/10 px-1.5 py-2.5 text-center cursor-pointer select-none ${active ? 'active' : ''}" data-list-id="${escapeHtml(list.id)}">
        <input type="checkbox" class="plan-list-cb" value="${escapeHtml(list.id)}" ${active ? 'checked' : ''} style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;" />
        <span class="plan-check absolute top-1 right-1 w-4 h-4 rounded-full bg-pine text-white grid place-items-center text-[10px] leading-none">✓</span>
        ${shoppingListLogoHtml(list, 34)}
        <span class="text-[11px] leading-tight w-full truncate">${escapeHtml(list.name || '')}</span>
        <span class="text-[10px] leading-none text-ink/40">${escapeHtml(count ? tk('shop.nOpen', { n: count }) : tk('lists.emptySmall'))}</span>
      </label>`;
  }).join('');
  wrap.querySelectorAll('.plan-list-cb').forEach(cb => cb.addEventListener('change', () => {
    const id = cb.value;
    if (cb.checked) { if (!pendingTaskShoppingLists.includes(id)) pendingTaskShoppingLists.push(id); }
    else pendingTaskShoppingLists = pendingTaskShoppingLists.filter(x => x !== id);
    cb.closest('.plan-list-chip').classList.toggle('active', cb.checked);
    if (taskTitleAuto) document.getElementById('taskTitleInput').value = shoppingPlanAutoTitle();
    document.getElementById('taskFormStatus').textContent = '';
  }));
}

function openShoppingPlanModal() {
  openTaskModal();
  // Preselection: all lists that currently have something open
  const preselect = allShoppingLists().filter(l => shoppingListSummary(l.id).count > 0).map(l => l.id);
  setTaskShoppingMode(true, preselect);
  taskTitleAuto = true;
  document.getElementById('taskModalTitle').textContent = tk('shop.plan.title');
  document.getElementById('saveTask').textContent = tk('shop.plan.title');
  document.getElementById('taskTitleInput').value = shoppingPlanAutoTitle();
  if (isMobile()) document.getElementById('taskTitleInput').blur();
  armModalSnapshot('taskModal');
}
document.getElementById('openShoppingPlanBtn').addEventListener('click', () => openShoppingPlanModal());
document.getElementById('taskTitleInput').addEventListener('input', () => { taskTitleAuto = false; });

/* ---------- Planned shopping done: book the amounts per store ----------
   For each list it is recorded which items were bought (bought). Bought ones disappear
   from the list, ones not bought stay. If nothing is ticked off on a list yet, the question
   "Alles eingekauft?" appears - with "Ja, alles" or "Nur einiges" (choose items one by one,
   "Alle auswählen" at the top). If items were already ticked off, exactly those are preselected. */
let planDoneTaskId = null;
let planDoneRows = []; // { listId, category, pickerOpen, itemsOpen, answered, bought:Set }

function planDefaultTitle(list) {
  if (!list || list.id === SHOPPING_MEAL_LIST_ID) return tk('shop.plan.mealExpense');
  return tk('shop.plan.expenseAt', { name: list.name || tk('shop.list.shop') });
}
function planItemsOfList(listId) { return shoppingItemsOfList(listId); }

function openShoppingPlanDone(taskId, taskTitle) {
  const plan = shoppingPlanForTask(taskId);
  if (!plan) return;
  const lists = plan.listIds.map(id => getShoppingList(id)).filter(Boolean);
  if (!lists.length) return;
  planDoneTaskId = taskId;
  planDoneRows = lists.map(l => {
    const items = planItemsOfList(l.id);
    const done = items.filter(it => it.done);
    return {
      listId: l.id,
      category: finDefaultCategoryForList(l.id),
      pickerOpen: false,
      // Something already ticked off: that counts as bought (adjustable). Nothing ticked off: ask the question.
      answered: !items.length || done.length > 0,
      itemsOpen: false,
      bought: new Set(done.map(it => it.id)),
    };
  });
  document.getElementById('planDoneTaskTitle').textContent = taskTitle || tk('lists.type.shop');
  document.getElementById('planDoneDateInput').value = finTodayIso();
  fillFinPaidBySelect('planDonePaidBySelect', currentMember() ? currentMember().id : '');
  document.getElementById('planDoneError').classList.add('hidden');
  document.getElementById('planDoneLists').innerHTML = '';
  renderPlanDoneRows();
  updatePlanDoneTotals();
  document.getElementById('shoppingPlanDoneModal').classList.remove('hidden');
  const first = document.querySelector('#planDoneLists .plan-amount');
  if (first) finAutoFocusAmount(first);
}

function closeShoppingPlanDone() {
  document.getElementById('shoppingPlanDoneModal').classList.add('hidden');
  planDoneTaskId = null;
  planDoneRows = [];
  ntRefresh(); // not booked? -> stays under the bell to be added later
}

function planItemsHtml(row, i) {
  const items = planItemsOfList(row.listId);
  if (!items.length) {
    return listHasRecipeItems(row.listId)
      ? '<p class="text-[11px] text-ink/40 mb-2">' + escapeHtml(tk('shop.done.noOwn')) + '</p>'
      : '<p class="text-[11px] text-ink/40 mb-2">' + escapeHtml(tk('shop.done.noItems')) + '</p>';
  }
  const boughtCount = items.filter(it => row.bought.has(it.id)).length;
  const allSelected = boughtCount === items.length;

  // Question: nothing ticked off yet -> "Alles eingekauft?"
  if (!row.answered) {
    return `
      <div class="rounded-xl bg-mustard/10 border border-mustard/25 px-3 py-2.5 mb-2">
        <div class="text-sm font-medium mb-2">${escapeHtml(tk('shop.done.allBought'))} <span class="text-xs font-normal text-ink/50">(${escapeHtml(tk('shop.done.itemsOnList', { n: items.length }))})</span></div>
        <div class="flex gap-2">
          <button type="button" class="plan-ans-all flex-1 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition">${escapeHtml(tk('shop.done.yesAll'))}</button>
          <button type="button" class="plan-ans-some flex-1 px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:border-pine hover:text-pine transition">${escapeHtml(tk('shop.done.some'))}</button>
        </div>
      </div>`;
  }

  const summary = allSelected
    ? tk('shop.done.allBoughtN', { n: items.length })
    : boughtCount
      ? tk('shop.done.someBought', { done: boughtCount, total: items.length }) + ' – ' + tk('shop.done.stay', { n: items.length - boughtCount })
      : tk('shop.done.noneBought', { n: items.length });

  const listHtml = row.itemsOpen ? `
    <div class="rounded-xl border border-ink/10 mt-2 overflow-hidden">
      <div class="flex items-center justify-between gap-2 px-3 py-2 bg-ink/5">
        <span class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('shop.done.whatGot'))}</span>
        <button type="button" class="plan-select-all px-2.5 py-1 rounded-lg border border-ink/15 bg-white text-xs text-ink/70 hover:border-pine hover:text-pine transition">${escapeHtml(allSelected ? tk('shop.done.selectNone') : tk('shop.done.selectAll'))}</button>
      </div>
      <div class="max-h-60 overflow-y-auto px-3">
        ${items.map(it => {
          const { qty } = manualItemQtyNote(it);
          const on = row.bought.has(it.id);
          return `
          <button type="button" class="plan-item-row w-full flex items-center gap-2.5 py-2 border-b border-dashed border-ink/10 last:border-0 text-left select-none" data-item-id="${escapeHtml(it.id)}">
            <span class="plan-item-dot shrink-0 w-5 h-5 rounded-full border-2 grid place-items-center ${on ? 'bg-pine border-pine' : 'border-ink/30'}">${on ? '<span class="text-white text-[11px] leading-none">✓</span>' : ''}</span>
            <span class="flex-1 min-w-0 flex items-center gap-1.5"><span class="truncate text-sm ${on ? 'text-ink/80' : 'text-ink/50'}">${escapeHtml(it.name || '')}</span>${pantryItemForShopping(it) ? '<span class="pantry-tag shrink-0">' + escapeHtml(tk('shop.pantryTag')) + '</span>' : ''}</span>
            ${qty ? `<span class="shrink-0 text-xs text-ink/40">${escapeHtml(qty)}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    </div>` : '';

  return `
    <div class="mb-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs ${allSelected ? 'text-pine' : 'text-ink/60'} min-w-0">${escapeHtml(summary)}</span>
        <button type="button" class="plan-items-toggle shrink-0 px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:border-pine hover:text-pine transition">${escapeHtml(row.itemsOpen ? tk('shop.done.closeItems') : tk('shop.done.chooseItems'))}</button>
      </div>
      ${listHtml}
    </div>`;
}

function renderPlanDoneRows() {
  const wrap = document.getElementById('planDoneLists');
  // Keep values already typed in (and the scroll position in the popup) when redrawing
  const keep = {};
  wrap.querySelectorAll('.plan-done-card').forEach(card => {
    keep[card.dataset.idx] = {
      amount: card.querySelector('.plan-amount').value,
      title: card.querySelector('.plan-title').value,
      priv: card.querySelector('.plan-private') ? card.querySelector('.plan-private').value : '',
    };
  });
  const scroller = wrap.closest('.overflow-y-auto');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  wrap.innerHTML = planDoneRows.map((row, i) => {
    const list = getShoppingList(row.listId);
    const cat = finCategory(row.category);
    const k = keep[i] || {};
    const titleVal = k.title !== undefined ? k.title : planDefaultTitle(list);
    return `
      <div class="plan-done-card rounded-xl border border-ink/10 p-3" data-idx="${i}">
        <div class="flex items-center gap-2.5 mb-2.5">
          ${shoppingListLogoHtml(list, 36)}
          <div class="min-w-0 flex-1">
            <div class="font-serif text-base leading-tight truncate">${escapeHtml(list ? list.name || '' : '')}</div>
          </div>
          <div class="fin-amount-field flex items-baseline gap-1 rounded-xl border border-ink/15 px-3 py-2 w-32 shrink-0">
            <input type="text" inputmode="decimal" autocomplete="off" placeholder="${curZero()}" class="plan-amount w-full min-w-0 bg-transparent border-0 p-0 text-xl font-semibold tracking-tight text-right" value="${escapeHtml(k.amount || '')}" />
            <span class="cur-sym text-base text-ink/40">${curSym()}</span>
          </div>
        </div>
        ${planItemsHtml(row, i)}
        ${kassePlanRowHtml(row, k)}
        <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1">${escapeHtml(tk('shop.done.expenseName'))}</label>
        <input type="text" autocomplete="off" maxlength="200" class="plan-title w-full rounded-lg border border-ink/15 px-3 py-2 text-base mb-2" value="${escapeHtml(titleVal)}" />
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('shop.entry.category'))}</span>
          <button type="button" class="plan-cat-toggle inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs hover:border-pine transition" style="--cat:${cat.color}">
            <span class="text-base leading-none">${escapeHtml(cat.icon || '')}</span>
            <span class="font-medium">${escapeHtml(i18nT(cat.label))}</span>
            <span class="text-ink/40">${row.pickerOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        <div id="planCatPicker${i}" class="${row.pickerOpen ? '' : 'hidden'} grid grid-cols-4 gap-1.5 mt-2.5"></div>
      </div>`;
  }).join('');
  if (scroller) scroller.scrollTop = scrollTop;

  wrap.querySelectorAll('.plan-done-card').forEach(card => {
    const i = Number(card.dataset.idx);
    const row = planDoneRows[i];
    const allIds = () => planItemsOfList(row.listId).map(it => it.id);
    card.querySelector('.plan-amount').addEventListener('input', updatePlanDoneTotals);
    card.querySelector('.plan-amount').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const next = wrap.querySelector(`.plan-done-card[data-idx="${i + 1}"] .plan-amount`);
      if (next) next.focus(); else e.target.blur();
    });
    const ansAll = card.querySelector('.plan-ans-all');
    if (ansAll) ansAll.addEventListener('click', () => {
      row.answered = true; row.itemsOpen = false; row.bought = new Set(allIds());
      document.getElementById('planDoneError').classList.add('hidden');
      renderPlanDoneRows();
    });
    const ansSome = card.querySelector('.plan-ans-some');
    if (ansSome) ansSome.addEventListener('click', () => {
      row.answered = true; row.itemsOpen = true; row.bought = new Set();
      document.getElementById('planDoneError').classList.add('hidden');
      renderPlanDoneRows();
    });
    const itemsToggle = card.querySelector('.plan-items-toggle');
    if (itemsToggle) itemsToggle.addEventListener('click', () => { row.itemsOpen = !row.itemsOpen; renderPlanDoneRows(); });
    const selAll = card.querySelector('.plan-select-all');
    if (selAll) selAll.addEventListener('click', () => {
      const ids = allIds();
      row.bought = ids.every(id => row.bought.has(id)) ? new Set() : new Set(ids);
      renderPlanDoneRows();
    });
    card.querySelectorAll('.plan-item-row').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.itemId;
      if (row.bought.has(id)) row.bought.delete(id); else row.bought.add(id);
      renderPlanDoneRows();
    }));
    card.querySelector('.plan-cat-toggle').addEventListener('click', () => {
      row.pickerOpen = !row.pickerOpen;
      renderPlanDoneRows();
    });
    if (row.pickerOpen) {
      renderFinCategoryPicker(`planCatPicker${i}`, row.category, id => {
        row.category = id;
        row.pickerOpen = false;
        renderPlanDoneRows();
        updatePlanDoneTotals();
      });
    }
  });
}

function planDoneAmounts() {
  return [...document.querySelectorAll('#planDoneLists .plan-done-card')].map(card => ({
    idx: Number(card.dataset.idx),
    amount: parseEuro(card.querySelector('.plan-amount').value) || 0,
    title: card.querySelector('.plan-title').value.trim(),
    priv: card.querySelector('.plan-private') ? (parseEuro(card.querySelector('.plan-private').value) || 0) : 0,
  }));
}

function updatePlanDoneTotals() {
  const rows = planDoneAmounts();
  const total = rows.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  document.getElementById('planDoneTotal').textContent = fmtEur(total);
  document.getElementById('planDoneError').classList.add('hidden');
  const hint = document.getElementById('planDoneBudgetHint');
  const date = document.getElementById('planDoneDateInput').value || finTodayIso();
  const monthRange = finPeriodRange('month', 0);
  const inMonth = date >= monthRange.startIso && date <= monthRange.endIso;
  const parts = [];
  const monthBudget = finBudgetInfo('month', monthRange).budget;
  if (monthBudget && inMonth && total > 0) {
    const rest = monthBudget - finStats(monthRange).total - total;
    parts.push(rest >= 0
      ? tk('shop.budget.left', { amount: `<b style="color:${FIN_GREEN}">${fmtEur(rest)}</b>`, period: escapeHtml(monthRange.longShort) })
      : tk('shop.budget.over', { amount: `<b style="color:${FIN_RED}">${fmtEur(-rest)}</b>`, period: escapeHtml(monthRange.longShort) }));
  }
  hint.innerHTML = parts.join(' ');
  hint.classList.toggle('hidden', !parts.length);
}

function finishShoppingPlanDone(withAmounts) {
  const taskId = planDoneTaskId;
  if (!taskId) { closeShoppingPlanDone(); return; }
  const errEl = document.getElementById('planDoneError');
  const rows = planDoneAmounts();
  const date = document.getElementById('planDoneDateInput').value || finTodayIso();
  const paidBy = document.getElementById('planDonePaidBySelect').value;
  let toast = tk('shop.done.finished');
  const itemLabel = it => { const { qty } = manualItemQtyNote(it); return (qty ? qty + ' ' : '') + (it.name || ''); };

  if (withAmounts) {
    const booked = rows.filter(r => r.amount > 0);
    if (!booked.length) {
      errEl.textContent = tk('shop.done.needAmount');
      errEl.classList.remove('hidden');
      return;
    }
    // Where it was paid, it also has to be clear what was bought
    const unanswered = booked.map(r => planDoneRows[r.idx]).find(row => !row.answered);
    if (unanswered) {
      const l = getShoppingList(unanswered.listId);
      errEl.textContent = l ? tk('shop.done.answerFor', { name: l.name }) : tk('shop.done.answer');
      errEl.classList.remove('hidden');
      return;
    }
    const tooMuch = booked.find(r => r.priv < 0 || r.priv > r.amount);
    if (tooMuch) {
      errEl.textContent = tk('shop.done.privateTooBig');
      errEl.classList.remove('hidden');
      return;
    }
    const listCats = { ...finance.listCategories };
    let sum = 0;
    let kasseNote = '';
    booked.forEach(r => {
      const row = planDoneRows[r.idx];
      const list = getShoppingList(row.listId);
      if (!list) return;
      const isMeal = row.listId === SHOPPING_MEAL_LIST_ID;
      const items = planItemsOfList(row.listId).filter(it => row.bought.has(it.id)).map(itemLabel).filter(Boolean);
      const res = kasseBookPurchase({
        id: newRecordId(), amount: r.amount, date, category: row.category,
        title: r.title || planDefaultTitle(list),
        store: isMeal ? '' : (list.name || ''),
        listId: row.listId, items,
        paidBy,
        note: '',
        taskId,
        createdBy: (currentUser() && currentUser().id) || '',
        created: new Date().toISOString(),
      }, kasseForList(row.listId), [], r.priv);
      if (res.note && booked.length === 1) kasseNote = res.note;
      listCats[row.listId] = row.category;
      sum += r.amount;
    });
    finance.listCategories = listCats;
    toast = booked.length === 1
      ? tk('shop.done.bookedUnder', { amount: fmtEur(sum), cat: i18nT(finCategory(planDoneRows[booked[0].idx].category).label) }) + (kasseNote || finBudgetToastSuffix(date))
      : tk('shop.done.bookedMany', { n: booked.length, amount: fmtEur(sum) }) + finBudgetToastSuffix(date);
  }

  // Bought items disappear from the list, ones not bought stay (open again).
  // Lists where the question stayed open remain unchanged.
  let removed = 0, kept = 0;
  const answeredRows = planDoneRows.filter(r => r.answered);
  const boughtIds = new Set();
  const keepIds = new Set();
  answeredRows.forEach(row => planItemsOfList(row.listId).forEach(it => {
    if (row.bought.has(it.id)) boughtIds.add(it.id); else keepIds.add(it.id);
  }));
  const pantryBooked = bookPurchasedIntoPantry(shoppingItems.filter(it => boughtIds.has(it.id)));
  shoppingItems = shoppingItems
    .filter(it => { if (boughtIds.has(it.id)) { removed++; return false; } return true; })
    .map(it => { if (keepIds.has(it.id)) { kept++; return it.done ? { ...it, done: false } : it; } return it; });
  if (kept) toast += ' ' + tk('shop.done.keptToast', { n: kept });
  if (pantryBooked) toast += ' ' + tk('shop.done.pantryBooked', { n: pantryBooked });
  syncPantryToShopping();

  shoppingPlans = shoppingPlans.map(p => p.id === taskId ? { ...p, bookedAt: new Date().toISOString() } : p);
  persistState();
  closeShoppingPlanDone();
  renderTasks();
  if (currentView === 'einkauf') renderShoppingList();
  if (currentView === 'finanzen') renderFinance();
  finShowToast(toast.trim());
}

document.getElementById('closePlanDoneBtn').addEventListener('click', closeShoppingPlanDone);
document.getElementById('planDoneSaveBtn').addEventListener('click', () => finishShoppingPlanDone(true));
document.getElementById('planDoneSkipBtn').addEventListener('click', () => finishShoppingPlanDone(false));
document.getElementById('planDoneDateInput').addEventListener('change', updatePlanDoneTotals);
document.getElementById('shoppingPlanDoneModal').addEventListener('click', (e) => {
  if (e.target.id !== 'shoppingPlanDoneModal') return;
  const typed = planDoneAmounts().some(r => r.amount > 0);
  if (typed && !confirm(tk('shop.done.confirmClose'))) return;
  closeShoppingPlanDone();
});

/* ---------- Finish shopping: book the amount instead of only deleting the ticked-off items ---------- */
let checkoutListId = null;
let checkoutCategory = 'lebensmittel';

function openShoppingCheckout(listId) {
  checkoutListId = listId;
  const list = getShoppingList(listId);
  const doneItems = shoppingItemsOfList(listId).filter(it => it.done);
  if (!list || !doneItems.length) return;
  if (isCurrentUserGuest()) {
    // Guests do not book amounts (no finances) - only the ticked-off items are removed
    if (confirm(tk('shop.complete.confirmClear', { n: doneItems.length }))) finishShoppingCheckout(false);
    else checkoutListId = null;
    return;
  }
  document.getElementById('checkoutLogo').innerHTML = shoppingListLogoHtml(list, 40);
  document.getElementById('checkoutListName').textContent = list.name + ' · ' + tk('shop.complete.checkedN', { n: doneItems.length });
  const preview = doneItems.slice(0, 12).map(it => `<span class="inline-block px-2 py-0.5 rounded-full bg-ink/5 text-xs text-ink/60">${escapeHtml(it.name || '')}</span>`).join(' ');
  document.getElementById('checkoutItems').innerHTML = preview + (doneItems.length > 12 ? ` <span class="text-xs text-ink/40">${escapeHtml(tk('shop.moreItems', { n: doneItems.length - 12 }))}</span>` : '');
  document.getElementById('checkoutAmountInput').value = '';
  document.getElementById('checkoutDateInput').value = finTodayIso();
  fillFinPaidBySelect('checkoutPaidBySelect', currentMember() ? currentMember().id : '');
  kasseCheckoutSetup(listId);
  checkoutCategory = finDefaultCategoryForList(listId);
  renderFinCategoryPicker('checkoutCategoryPicker', checkoutCategory, id => { checkoutCategory = id; updateCheckoutBudgetHint(); });
  finHideNewCategoryForm('checkoutCategoryPicker');
  document.getElementById('checkoutError').classList.add('hidden');
  updateCheckoutBudgetHint();
  document.getElementById('shoppingCheckoutModal').classList.remove('hidden');
  finAutoFocusAmount(document.getElementById('checkoutAmountInput'));
}
function closeShoppingCheckout() {
  document.getElementById('shoppingCheckoutModal').classList.add('hidden');
  checkoutListId = null;
}
function updateCheckoutBudgetHint() {
  const hint = document.getElementById('checkoutBudgetHint');
  // Budget notice only if the booking goes into the cash box currently shown
  if (kassenActiveMode() && checkoutKasseId && checkoutKasseId !== activeKasseId) { hint.classList.add('hidden'); return; }
  const date = document.getElementById('checkoutDateInput').value || finTodayIso();
  const amount = parseEuro(document.getElementById('checkoutAmountInput').value) || 0;
  const monthRange = finPeriodRange('month', 0);
  const inMonth = date >= monthRange.startIso && date <= monthRange.endIso;
  const parts = [];
  const monthBudget = finBudgetInfo('month', monthRange).budget;
  if (monthBudget && inMonth) {
    const rest = monthBudget - finStats(monthRange).total - amount;
    parts.push(rest >= 0
      ? tk('shop.budget.left', { amount: `<b style="color:${FIN_GREEN}">${fmtEur(rest)}</b>`, period: escapeHtml(monthRange.longShort) })
      : tk('shop.budget.over', { amount: `<b style="color:${FIN_RED}">${fmtEur(-rest)}</b>`, period: escapeHtml(monthRange.longShort) }));
  }
  const cat = finCategory(checkoutCategory);
  const catBudget = cat.budget;
  if (catBudget && inMonth) {
    const spentCat = finStats(monthRange).byCat.find(c => c.cat.id === cat.id);
    const restCat = catBudget - (spentCat ? spentCat.total : 0) - amount;
    parts.push(`${escapeHtml(i18nT(cat.label))}: ${escapeHtml(restCat >= 0 ? tk('shop.budget.catLeft', { amount: fmtEur(restCat) }) : tk('shop.budget.catOver', { amount: fmtEur(-restCat) }))}.`);
  }
  hint.innerHTML = parts.join(' ');
  hint.classList.toggle('hidden', !parts.length);
}
function finishShoppingCheckout(withAmount) {
  const listId = checkoutListId;
  const list = getShoppingList(listId);
  if (!list) { closeShoppingCheckout(); return; }
  const doneItems = shoppingItemsOfList(listId).filter(it => it.done);
  let toast = tk('shop.complete.removed');
  if (withAmount) {
    const errEl = document.getElementById('checkoutError');
    const amount = parseEuro(document.getElementById('checkoutAmountInput').value);
    if (!(amount > 0)) { errEl.textContent = tk('shop.complete.needAmount'); errEl.classList.remove('hidden'); return; }
    const date = document.getElementById('checkoutDateInput').value || finTodayIso();
    const isMeal = listId === SHOPPING_MEAL_LIST_ID;
    const items = doneItems.map(it => {
      const { qty } = manualItemQtyNote(it);
      return (qty ? qty + ' ' : '') + (it.name || '');
    }).filter(Boolean);
    const booked = kasseBookPurchase({
      id: newRecordId(), amount, date, category: checkoutCategory,
      title: isMeal ? tk('shop.plan.mealExpense') : '',
      store: isMeal ? '' : (list.name || ''),
      listId, items,
      paidBy: document.getElementById('checkoutPaidBySelect').value,
      note: '',
      createdBy: (currentUser() && currentUser().id) || '',
      created: new Date().toISOString(),
    }, checkoutKasseId, kasseSplitValue('checkout'), parseEuro(document.getElementById('checkoutPrivateInput').value) || 0);
    if (booked.error) { errEl.textContent = booked.error; errEl.classList.remove('hidden'); return; }
    finance.listCategories = { ...finance.listCategories, [listId]: checkoutCategory };
    toast = tk('shop.done.bookedUnder', { amount: fmtEur(amount), cat: i18nT(finCategory(checkoutCategory).label) }) + (booked.note || finBudgetToastSuffix(date));
  }
  const doneIds = new Set(doneItems.map(it => it.id));
  const pantryBooked = bookPurchasedIntoPantry(doneItems);
  shoppingItems = shoppingItems.filter(x => !doneIds.has(x.id));
  if (pantryBooked) toast += ' ' + tk('shop.done.pantryBooked', { n: pantryBooked });
  persistState();
  closeShoppingCheckout();
  renderShoppingList();
  finShowToast(toast);
}

/* ---------- Popup: set up finances ---------- */
let finSettingsDraft = null;

function openFinanceSettings(focusBudget = false) {
  finSettingsDraft = finance.categories.map(c => ({ ...c }));
  document.getElementById('finBudgetInput').value = finance.budgetAdjust ? euroInputValue(finance.budgetAdjust) : '';
  updateFinBudgetInfo();
  renderFinCategoryEditor();
  renderFinRecurringEditor();
  const years = new Set([new Date().getFullYear()]);
  ausgaben.forEach(a => a.date && years.add(Number(a.date.slice(0, 4))));
  finance.recurring.forEach(r => { const st = finRecStart(r); if (st) years.add(Number(st.slice(0, 4))); });
  const selYear = finPeriodRange(finPeriod, finOffset).start.getFullYear();
  years.add(selYear);
  const yearSel = document.getElementById('finExportYear');
  yearSel.innerHTML = [...years].sort((a, b) => b - a).map(y => `<option value="${y}">${y}</option>`).join('');
  yearSel.value = String(selYear);
  document.getElementById('financeSettingsModal').classList.remove('hidden');
  if (focusBudget) setTimeout(() => document.getElementById('finBudgetInput').focus(), 50);
}
function closeFinanceSettings() {
  document.getElementById('financeSettingsModal').classList.add('hidden');
  finSettingsDraft = null;
}
function updateFinBudgetInfo() {
  const raw = String(document.getElementById('finBudgetInput').value || '').replace(/^[-−–—]\s*$/, '').trim();
  const parsed = raw ? parseEuro(raw) : 0;
  const adj = isFinite(parsed) ? parsed : 0;
  const info = document.getElementById('finBudgetInfo');
  const range = finPeriodRange('month', 0);
  const income = finBudgetIncomeIn(range.startIso, range.endIso);
  const total = Math.round((income + adj) * 100) / 100;
  let text = tk('fin.settings.incomeOf', { period: range.longShort, amount: fmtEur(income) });
  if (adj) text += ` ${adj > 0 ? '+' : '−'} ${fmtEur(Math.abs(adj))}`;
  text += total > 0 ? ' = ' + tk('fin.settings.budgetIs', { amount: fmtEur(total) }) : ' ' + tk('fin.settings.noBudget');
  if (raw && !isFinite(parsed)) text = tk('fin.settings.invalidAdjust');
  info.textContent = text;
  info.style.color = adj < 0 ? FIN_RED : '';
}
// ± key: on the iPhone the number keyboard has no minus
function toggleFinBudgetSign() {
  const inp = document.getElementById('finBudgetInput');
  const raw = String(inp.value || '').trim();
  inp.value = /^[-−–—]/.test(raw) ? raw.replace(/^[-−–—]\s*/, '') : '-' + raw;
  updateFinBudgetInfo();
}
function renderFinCategoryEditor() {
  const wrap = document.getElementById('finCategoryEditor');
  if (!finSettingsDraft) return;
  wrap.innerHTML = finSettingsDraft.map((c, i) => {
    const isDefault = FIN_DEFAULT_CATEGORIES.some(d => d.id === c.id);
    const inactive = c.active === false;
    return `
      <div class="fin-cat-edit rounded-xl border border-ink/10 p-2.5 ${inactive ? 'opacity-50' : ''}" data-idx="${i}">
        <div class="flex items-center gap-2">
          <input type="text" data-field="icon" value="${escapeHtml(c.icon || '')}" maxlength="4" class="w-11 shrink-0 rounded-lg border border-ink/15 px-1 py-1.5 text-center text-lg" aria-label="${escapeHtml(tk('household.icon'))}" />
          <input type="color" data-field="color" value="${escapeHtml(c.color || '#9A9A9A')}" class="w-9 h-9 shrink-0 rounded-lg border border-ink/15 p-0.5 bg-white cursor-pointer" aria-label="${escapeHtml(tk('account.dashBg.color'))}" />
          <input type="text" data-field="label" value="${escapeHtml(i18nT(c.label || ''))}" maxlength="40" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm" aria-label="${escapeHtml(tk('common.name'))}" />
          ${c.id === 'sonstiges' ? '' : `<button type="button" data-action="toggle" class="shrink-0 px-2 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:border-pine transition">${escapeHtml(inactive ? tk('fin.settings.show') : tk('fin.settings.hide'))}</button>`}
          ${isDefault ? '' : `<button type="button" data-action="delete" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('fin.settings.deleteCat'))}">×</button>`}
        </div>
        <div class="flex items-center gap-2 mt-2 pl-[3.25rem]">
          <span class="text-[11px] text-ink/45 shrink-0">${escapeHtml(tk('fin.settings.monthlyBudget'))}</span>
          <div class="fin-amount-field flex items-center rounded-lg border border-ink/15 px-2 py-1 w-28">
            <input type="text" inputmode="decimal" data-field="budget" value="${escapeHtml(euroInputValue(c.budget))}" placeholder="${escapeHtml(tk('common.optional'))}" class="w-full min-w-0 bg-transparent border-0 p-0 text-sm text-right" />
            <span class="cur-sym text-xs text-ink/40 ml-1">${curSym()}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  wrap.querySelectorAll('.fin-cat-edit').forEach(row => {
    const idx = Number(row.dataset.idx);
    row.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.field;
        if (f === 'budget') { const v = parseEuro(inp.value); finSettingsDraft[idx].budget = v > 0 ? v : null; }
        else finSettingsDraft[idx][f] = inp.value;
      });
    });
    const toggle = row.querySelector('[data-action="toggle"]');
    if (toggle) toggle.addEventListener('click', () => { finSettingsDraft[idx].active = finSettingsDraft[idx].active === false; renderFinCategoryEditor(); });
    const del = row.querySelector('[data-action="delete"]');
    if (del) del.addEventListener('click', () => {
      const cat = finSettingsDraft[idx];
      const used = ausgaben.some(a => a.category === cat.id) || finance.recurring.some(r => r.category === cat.id);
      if (used && !confirm(tk('fin.settings.catInUse', { name: i18nT(cat.label) }))) return;
      finSettingsDraft.splice(idx, 1);
      renderFinCategoryEditor();
    });
  });
}
function renderFinRecurringEditor() {
  const wrap = document.getElementById('finRecurringList');
  if (!wrap) return;
  const todayIso = finTodayIso();
  const list = finance.recurring.slice().sort((a, b) =>
    (finRecIsRunning(a, todayIso) ? 0 : 1) - (finRecIsRunning(b, todayIso) ? 0 : 1)
    || (finRecNext(a, todayIso) || '9999').localeCompare(finRecNext(b, todayIso) || '9999'));
  if (!list.length) {
    wrap.innerHTML = '<p class="text-xs text-ink/40 italic">' + escapeHtml(tk('fin.settings.noRecurring')) + '</p>';
    return;
  }
  const running = list.filter(r => finRecIsRunning(r, todayIso));
  const monthlyOut = running.reduce((s, r) => { const a = finRecMonthly(r, todayIso); return a > 0 ? s + a : s; }, 0);
  const monthlyIn = running.reduce((s, r) => { const a = finRecMonthly(r, todayIso); return a < 0 ? s - a : s; }, 0);
  wrap.innerHTML = list.map(r => {
    const cat = finCategory(r.category);
    const ended = !finRecIsRunning(r, todayIso);
    const linkLabel = finLinkLabel(r.link);
    return `
      <button type="button" class="fin-rec-row w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-ink/5 transition text-left ${ended ? 'opacity-50' : ''}" data-id="${escapeHtml(r.id)}">
        <span class="shrink-0 w-9 h-9 rounded-full grid place-items-center text-lg" style="background:${cat.color}22">${escapeHtml(cat.icon || '')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(r.title || i18nT(cat.label))}</span>
          <span class="block text-xs text-ink/45 truncate">${ended ? escapeHtml(tk('contract.endedLower')) : escapeHtml(finRecDescribe(r))} · ${escapeHtml(i18nT(cat.label))}${linkLabel ? ' · ' + escapeHtml(linkLabel) : ''}</span>
        </span>
        ${(() => { const a = finRecurringAmountFor(r, todayIso); return a < 0 ? `<span class="shrink-0 text-sm font-semibold" style="color:${FIN_GREEN}">+ ${fmtEur(-a)}</span>` : `<span class="shrink-0 text-sm font-semibold">${fmtEur(a)}</span>`; })()}
      </button>`;
  }).join('') + `<p class="text-xs text-ink/50 text-right mt-1 pr-2">${escapeHtml(tk('fin.settings.perMonthOut', { amount: fmtEur(monthlyOut) }))}${monthlyIn > 0 ? ` · <span style="color:${FIN_GREEN}">${escapeHtml(tk('fin.stat.incomePlus', { amount: fmtEur(monthlyIn) }))}</span>` : ''}</p>`;
  wrap.querySelectorAll('.fin-rec-row').forEach(btn => btn.addEventListener('click', () => {
    const r = finance.recurring.find(x => x.id === btn.dataset.id);
    if (r) openExpenseModal({ recurring: r });
  }));
}
function saveFinanceSettings() {
  const budgetRaw = String(document.getElementById('finBudgetInput').value || '').replace(/^[-−–—]\s*$/, '').trim();
  const budgetAdjust = budgetRaw ? parseEuro(budgetRaw) : 0;
  if (!isFinite(budgetAdjust) || Math.abs(budgetAdjust) > 1000000) {
    updateFinBudgetInfo();
    document.getElementById('finBudgetInput').focus();
    return;
  }
  const prevById = new Map(finance.categories.map(c => [c.id, c]));
  const cats = (finSettingsDraft || finance.categories).map(c => {
    const prev = prevById.get(c.id) || {};
    return {
      ...c,
      label: String(c.label || '').trim() || prev.label || tk('fin.settings.category'),
      icon: String(c.icon || '').trim() || prev.icon || '📦',
      color: /^#[0-9a-fA-F]{6}$/.test(c.color || '') ? c.color : (prev.color || '#9A9A9A'),
      budget: (typeof c.budget === 'number' && c.budget > 0) ? c.budget : null,
      active: c.id === 'sonstiges' ? true : c.active !== false,
    };
  });
  finance = normalizeFinance({ ...finance, budgetAdjust: Math.round(budgetAdjust * 100) / 100, categories: cats });
  persistState();
  closeFinanceSettings();
  renderFinance();
  finShowToast(tk('fin.settings.saved'));
}
function addFinCategory() {
  if (!finSettingsDraft) return;
  const palette = FIN_CUSTOM_PALETTE;
  const newCat = { id: 'k' + newRecordId().slice(0, 10), label: tk('fin.settings.newCategory'), icon: '🏷️', color: palette[finSettingsDraft.length % palette.length], active: true, budget: null };
  const idx = finSettingsDraft.findIndex(c => c.id === 'sonstiges');
  if (idx >= 0) finSettingsDraft.splice(idx, 0, newCat); else finSettingsDraft.push(newCat);
  renderFinCategoryEditor();
  const last = document.querySelector(`#finCategoryEditor .fin-cat-edit[data-idx="${finSettingsDraft.indexOf(newCat)}"]`);
  if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const inp = last.querySelector('input[data-field="label"]'); inp.focus(); inp.select(); }
}

/* ---------- CSV export ---------- */
function exportFinanceCsv(year) {
  const entries = finEntriesInRange(year + '-01-01', year + '-12-31').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cell = v => {
    const s = String(v == null ? '' : v);
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [[tk('fin.csv.date'), tk('fin.csv.kind'), tk('fin.csv.amount'), tk('fin.csv.category'), tk('fin.csv.link'), tk('fin.csv.description'), tk('fin.csv.store'), tk('fin.csv.paidBy'), tk('fin.csv.note'), tk('fin.csv.items'), tk('fin.csv.recurring')]];
  entries.forEach(e => {
    const m = e.paidBy ? kassePartById(e.paidBy) : null;
    const [y, mo, d] = e.date.split('-');
    rows.push([
      `${d}.${mo}.${y}`, finIsIncome(e) ? tk('fin.csv.income') : tk('fin.csv.expense'), numDec(Number(e.amount || 0).toFixed(2)), i18nT(finCategory(e.category).label),
      finLinkLabel(e.link), e.title || '', e.store || '', m ? memberLabel(m) : '', e.note || '', (e.items || []).join(', '),
      e.recurringId ? (() => { const r = finance.recurring.find(x => x.id === e.recurringId); return r ? finIntervalInfo(finRecInterval(r)).label : tk('fin.csv.yes'); })() : '',
    ]);
  });
  const csv = '\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  const name = `pinn-finanzen-${year}.csv`;
  let file = null;
  try { file = new File([csv], name, { type: 'text/csv' }); } catch (e) { file = null; }
  if (file && isMobile() && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(() => {});
    return;
  }
  const blob = file || new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('vorrat2');
