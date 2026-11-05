/* pinn. – Chat: photos and videos (js/chatmedien.js, since 1.127.1)
   Part of the chat (js/chat.js). Contents: the attach button and the "send photo or video" sheet with the HD switch,
   shrinking of photos (canvas) and videos (MediaRecorder, only where the browser can record MP4), end-to-end encryption of
   the file, upload with progress, the picture in the message bubble, the full-screen viewer, sharing / saving on the device
   and "file in pinn." (as a document, linked to a home, a defect or a vehicle), and the automatic-deletion setting.

   How a file is protected: it gets its own random AES-GCM key in the browser, the encrypted bytes go to the server
   (/api/pinn/chat/upload), and the key travels inside the encrypted chat message together with a small preview picture.
   The server therefore never sees a photo, a video or its name.

   Limits (decided with the NAS in mind): photos are shrunk to 1600 px (about 0.3 MB) unless HD is switched on; HD photos up
   to 20 MB, videos up to 50 MB. The user chooses per sending (HD button, like in WhatsApp). Files are encrypted as a whole,
   so the viewer loads the complete file before it shows it. */

const CHATM = { PDF_MAX: 20 * 1024 * 1024, SIDE: 1600, Q: 0.8, THUMB: 240, THUMB_Q: 0.6, IMG_MAX: 20 * 1024 * 1024, VID_MAX: 50 * 1024 * 1024, VID_BITS: 1500000, VID_SHRINK_MAX_S: 300, FILES_MAX: 10 };
const chatMBlobs = new Map();   // file id -> { blob, url } of everything opened in this session

/* ---------------------------------------------------------------- small helpers */
// Only object URLs made by this page may be put into a src/href attribute: anything else becomes an empty string.
// An object URL looks like blob:<origin>/<id>; it never contains spaces, quotes, angle brackets or the ampersand, so the
// HTML escaping at the end changes nothing for a real one - it only makes sure that no file text can ever reach the
// page as markup (this is what the code scanner checks, 1.127.6).
const CHATM_BLOB_RE = /^blob:[A-Za-z0-9.:/_~%+-]{1,300}$/;
function chatMBlobSrc(u) {
  const s = String(u || '');
  if (!CHATM_BLOB_RE.test(s) || s.indexOf('/') < 0) return '';
  return escapeHtml(s);
}
function chatMSize(n) {
  const mb = Number(n) / (1024 * 1024);
  let f; try { f = new Intl.NumberFormat(chatLocale(), { maximumFractionDigits: 1 }); } catch (e) { f = { format: x => String(Math.round(x * 10) / 10) }; }
  return mb >= 1 ? f.format(mb) + ' MB' : f.format(Math.max(1, Math.round(Number(n) / 1024))) + ' KB';
}
function chatMKind(file) {
  const t = String(file.type || ''), n = String(file.name || '');
  if (/^image\//.test(t) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(n)) return 'img';
  if (/^video\//.test(t) || /\.(mp4|mov|m4v|webm)$/i.test(n)) return 'vid';
  if (t === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
  return '';
}
function chatMDuration(s) { s = Math.max(0, Math.round(Number(s) || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function chatMErr(code, extra) { const e = new Error(code); Object.assign(e, extra || {}); return e; }
function chatMToBlob(canvas, type, q) { return new Promise(res => canvas.toBlob(b => res(b), type, q)); }
function chatMName(mm) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf', 'audio/mp4': 'm4a', 'audio/wav': 'wav' }[mm.mt] || (mm.k === 'vid' ? 'mp4' : mm.k === 'pdf' ? 'pdf' : mm.k === 'aud' ? 'm4a' : 'jpg');
  const n = String(mm.n || '').trim();
  if (n && /\.[a-z0-9]{2,4}$/i.test(n)) return n;
  return 'pinn-' + new Date().toISOString().slice(0, 10) + '.' + ext;
}

/* ---------------------------------------------------------------- photos */
async function chatMDecode(file) {
  if (window.createImageBitmap) {
    try { const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); return { src: bmp, w: bmp.width, h: bmp.height, close: () => { try { bmp.close(); } catch (e) { /* ignore */ } } }; } catch (e) { /* try an image element */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({ src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) });
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = chatMBlobSrc(url);
  });
}
async function chatMScale(dec, side, q) {
  const k = Math.min(1, side / Math.max(dec.w, dec.h));
  const w = Math.max(1, Math.round(dec.w * k)), h = Math.max(1, Math.round(dec.h * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(dec.src, 0, 0, w, h);
  return { canvas: c, w, h, blob: q ? await chatMToBlob(c, 'image/jpeg', q) : null };
}
async function chatMThumb(dec) {
  const s = await chatMScale(dec, CHATM.THUMB, 0);
  return s.canvas.toDataURL('image/jpeg', CHATM.THUMB_Q).split(',')[1] || '';
}
// hd = true keeps the original bytes. Returns { blob, mt, w, h, th, hd }
async function chatMPrepareImage(file, hd) {
  let dec = null;
  try { dec = await chatMDecode(file); } catch (e) { dec = null; }
  if (!dec) { // cannot be shown here (e.g. HEIC in some browsers): send as it is
    if (file.size > CHATM.IMG_MAX) throw chatMErr('toobig', { max: CHATM.IMG_MAX, name: file.name });
    return { blob: file, mt: file.type || 'application/octet-stream', w: 0, h: 0, th: '', hd: true };
  }
  try {
    const th = await chatMThumb(dec);
    if (hd) {
      if (file.size > CHATM.IMG_MAX) throw chatMErr('toobig', { max: CHATM.IMG_MAX, name: file.name });
      return { blob: file, mt: file.type || 'image/jpeg', w: dec.w, h: dec.h, th, hd: true };
    }
    const sc = await chatMScale(dec, CHATM.SIDE, CHATM.Q);
    if (file.size <= sc.blob.size && dec.w <= CHATM.SIDE && dec.h <= CHATM.SIDE && /^image\/(jpeg|png|webp)$/.test(file.type || '')) return { blob: file, mt: file.type, w: dec.w, h: dec.h, th, hd: false };
    return { blob: sc.blob, mt: 'image/jpeg', w: sc.w, h: sc.h, th, hd: false };
  } finally { dec.close(); }
}

/* ---------------------------------------------------------------- videos */
function chatMVideoOpen(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', ''); v.src = chatMBlobSrc(url);
    v.onloadedmetadata = () => res({ v, url, d: isFinite(v.duration) ? v.duration : 0, w: v.videoWidth || 0, h: v.videoHeight || 0 });
    v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
  });
}
async function chatMVideoThumb(v) {
  try {
    await new Promise((res) => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = Math.min(0.3, (isFinite(v.duration) && v.duration ? v.duration : 1) / 2); setTimeout(done, 1500); });
    const k = Math.min(1, CHATM.THUMB / Math.max(v.videoWidth || 1, v.videoHeight || 1));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((v.videoWidth || 1) * k)); c.height = Math.max(1, Math.round((v.videoHeight || 1) * k));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', CHATM.THUMB_Q).split(',')[1] || '';
  } catch (e) { return ''; }
}
function chatMShrinkMime() {
  if (!(window.MediaRecorder && HTMLVideoElement.prototype.captureStream && MediaRecorder.isTypeSupported)) return '';
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
}
// Re-encodes in real time (the video plays while it is recorded). Only MP4 so that every phone can play the result.
async function chatMShrinkVideo(op, onProgress, ctl) {
  const mime = chatMShrinkMime();
  const v = op.v;
  const stream = v.captureStream();
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: CHATM.VID_BITS, audioBitsPerSecond: 96000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res, rej) => { rec.onstop = () => res(); rec.onerror = (e) => rej((e && e.error) || new Error('rec')); });
  v.onended = () => { if (rec.state !== 'inactive') rec.stop(); };
  v.ontimeupdate = () => { if (onProgress && v.duration) onProgress(v.currentTime / v.duration); if (ctl && ctl.cancelled && rec.state !== 'inactive') { v.pause(); rec.stop(); } };
  v.currentTime = 0;
  rec.start(1000);
  try { await v.play(); } catch (e) { if (rec.state !== 'inactive') rec.stop(); throw new Error('noplay'); }
  await stopped;
  if (ctl && ctl.cancelled) throw new Error('cancelled');
  return new Blob(chunks, { type: 'video/mp4' });
}
// Returns { blob, mt, w, h, d, th, hd, note }; note = 'noshrink' when the original was sent although Standard was chosen
async function chatMPrepareVideo(file, hd, onProgress, ctl) {
  let op;
  try { op = await chatMVideoOpen(file); } catch (e) { op = null; }
  const mt = file.type || 'video/mp4';
  if (!op) { // cannot be read here: send as it is
    if (file.size > CHATM.VID_MAX) throw chatMErr('toobig', { max: CHATM.VID_MAX, name: file.name });
    return { blob: file, mt, w: 0, h: 0, d: 0, th: '', hd: true };
  }
  try {
    const th = await chatMVideoThumb(op.v);
    const base = { w: op.w, h: op.h, d: op.d, th };
    if (hd) {
      if (file.size > CHATM.VID_MAX) throw chatMErr('toobig', { max: CHATM.VID_MAX, name: file.name });
      return { blob: file, mt, hd: true, ...base };
    }
    let out = null;
    if (chatMShrinkMime() && op.d > 0 && op.d <= CHATM.VID_SHRINK_MAX_S) {
      try { out = await chatMShrinkVideo(op, onProgress, ctl); } catch (e) { if (e.message === 'cancelled') throw e; out = null; }
    }
    if (out && out.size > 0 && out.size < file.size) return { blob: out, mt: 'video/mp4', hd: false, ...base };
    if (file.size > CHATM.VID_MAX) throw chatMErr('toobig', { max: CHATM.VID_MAX, name: file.name });
    return { blob: file, mt, hd: true, note: 'noshrink', ...base };
  } finally { try { op.v.pause(); } catch (e) { /* ignore */ } URL.revokeObjectURL(op.url); }
}

/* ---------------------------------------------------------------- encrypt, upload, download */
async function chatMEncryptFile(blob) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: chatEnc.encode('pinn.chat.file.v1') }, key, await blob.arrayBuffer());
  return { cipher: new Blob([ct], { type: 'application/octet-stream' }), key: chatB64e(await crypto.subtle.exportKey('raw', key)), iv: chatB64e(iv) };
}
// art = 'v': a small preview picture that is stored readable (only for the push message, only without end-to-end encryption)
function chatMUpload(cipher, room, onProgress, art) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', CHAT_API + 'upload?raum=' + encodeURIComponent(room) + (art ? '&art=' + art : ''));
    if (pb.authStore.token) x.setRequestHeader('Authorization', pb.authStore.token);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch (e) { /* no JSON */ } if (x.status >= 200 && x.status < 300 && j.id) res(j.id); else rej(new Error(j.error || ('HTTP ' + x.status))); };
    x.onerror = () => rej(new Error('network'));
    const form = new FormData(); form.append('datei', cipher, art ? 'vorschau.jpg' : 'chat.bin');
    x.send(form);
  });
}
async function chatMFetch(mm, onProgress) {
  if (chatMBlobs.has(mm.f)) return chatMBlobs.get(mm.f);
  const res = await apiFetch(CHAT_API + 'file?id=' + encodeURIComponent(mm.f));
  if (res.status === 404) throw chatMErr('gone', { gone: true });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let buf;
  const total = Number(res.headers.get('Content-Length')) || 0;
  if (res.body && res.body.getReader && total && onProgress) {
    const reader = res.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress(got / total); }
    buf = new Uint8Array(got); let o = 0; parts.forEach(p => { buf.set(p, o); o += p.length; });
  } else buf = new Uint8Array(await res.arrayBuffer());
  const key = await crypto.subtle.importKey('raw', chatB64d(mm.key), 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: chatB64d(mm.iv), additionalData: chatEnc.encode('pinn.chat.file.v1') }, key, buf);
  const blob = new Blob([plain], { type: mm.mt || 'application/octet-stream' });
  const entry = { blob, url: URL.createObjectURL(blob) };
  chatMBlobs.set(mm.f, entry);
  return entry;
}
function chatMRelease() { chatMBlobs.forEach(e => { try { URL.revokeObjectURL(e.url); } catch (err) { /* ignore */ } }); chatMBlobs.clear(); }

/* ---------------------------------------------------------------- sending */
function chatMUpdateProgress(id, text) { const el = document.querySelector('#chatMsgs [data-id="' + CSS.escape(id) + '"] .chat-media-prog'); if (el) el.textContent = text; }
// items: [{ file, kind, std? }] ; hd: the user's choice ; caption goes with the first one
async function chatMSendItems(items, caption, hd) {
  const S = chatS, room = S.room;
  let first = true;
  for (const it of items) {
    const cap = first ? caption : ''; first = false;
    await chatMSendOne(room, it, cap, hd);
  }
}
async function chatMSendOne(room, it, caption, hd) {
  const S = chatS;
  const tmp = { id: 'tmp' + Date.now() + Math.random().toString(36).slice(2, 6), raum: room, von: S.uid, zeit: Date.now(), aktualisiert: 0, daten: '', gelesen: {}, pending: true };
  const meta = { k: it.kind, th: '', w: 0, h: 0, hd: !!hd, n: it.file.name || '' };
  const payload = { x: caption || '', m: meta };
  S.plain.set(tmp.id, { msg: payload });
  chatMerge(room, [tmp]);
  const ctl = tmp.ctl = { cancelled: false };
  const run = async () => {
    tmp.failed = false;
    chatRenderConv(true);
    try {
      if (!tmp.prep) {
        chatMUpdateProgress(tmp.id, tk('chat.media.preparing'));
        if (it.prep) tmp.prep = it.prep; // voice message: already recorded (js/chatstimme.js)
        else if (it.kind === 'pdf') {
          if (it.file.size > CHATM.PDF_MAX) throw chatMErr('toobig', { max: CHATM.PDF_MAX, name: it.file.name });
          tmp.prep = { blob: it.file, mt: 'application/pdf', w: 0, h: 0, th: '', hd: true };
        } else tmp.prep = it.kind === 'vid'
          ? await chatMPrepareVideo(it.file, hd, p => chatMUpdateProgress(tmp.id, tk('chat.media.shrinking', { percent: Math.round(p * 100) })), ctl)
          : (!hd && it.std ? it.std : await chatMPrepareImage(it.file, hd));
        Object.assign(meta, { th: tmp.prep.th, w: tmp.prep.w, h: tmp.prep.h, d: tmp.prep.d || 0, hd: !!tmp.prep.hd, mt: tmp.prep.mt, s: tmp.prep.blob.size });
        if (tmp.prep.pk) meta.pk = tmp.prep.pk;
        if (it.kind === 'aud' || it.kind === 'pdf') delete meta.hd;
        if (tmp.prep.note === 'noshrink') chatMToast(tk('chat.media.noShrink'));
        chatRenderConv();
      }
      if (!tmp.enc) tmp.enc = await chatMEncryptFile(tmp.prep.blob);
      if (!tmp.fileId) tmp.fileId = await chatMUpload(tmp.enc.cipher, room, p => chatMUpdateProgress(tmp.id, Math.round(p * 100) + '%'));
      // without end-to-end encryption the push message of a photo/video may carry a small preview picture (stored readable)
      if (S.plainMode && meta.th && (it.kind === 'img' || it.kind === 'vid') && !tmp.pvId) {
        try {
          const bin = chatB64d(meta.th);
          tmp.pvId = await chatMUpload(new Blob([bin], { type: 'image/jpeg' }), room, null, 'v');
        } catch (e) { tmp.pvId = ''; }
      }
      const msg = Object.assign({}, payload, { m: Object.assign({}, meta, { f: tmp.fileId, key: tmp.enc.key, iv: tmp.enc.iv }) });
      const daten = await chatPackFor(room, msg);
      const r = await chatPost('send', Object.assign({ raum: room, daten, datei: tmp.fileId }, tmp.pvId ? { vorschau: tmp.pvId } : {}));
      const rs = chatRoomState(room);
      rs.byId.delete(tmp.id); rs.msgs = rs.msgs.filter(m => m.id !== tmp.id);
      S.plain.delete(tmp.id); S.plain.set(r.id, { msg });
      chatMerge(room, [{ id: r.id, raum: room, von: S.uid, zeit: r.zeit, aktualisiert: r.zeit, daten, gelesen: {}, geloescht: false, empf: ',' + chatRoomMembers(room).map(p => p.id).join(',') + ',' }]);
      S.prev.delete(room);
      chatLoadOverview();
    } catch (err) {
      if (err && err.message === 'cancelled') { const rs = chatRoomState(room); rs.byId.delete(tmp.id); rs.msgs = rs.msgs.filter(m => m.id !== tmp.id); }
      else if (err && err.message === 'toobig') { const rs = chatRoomState(room); rs.byId.delete(tmp.id); rs.msgs = rs.msgs.filter(m => m.id !== tmp.id); alert(tk('chat.media.tooBig', { name: err.name || '', max: chatMSize(err.max) })); }
      else { tmp.failed = true; tmp.retry = run; }
    }
    chatRenderConv(true);
  };
  await run();
}
function chatMToast(text) { try { if (typeof finShowToast === 'function') { finShowToast(text); return; } } catch (e) { /* fall through */ } }

/* ---------------------------------------------------------------- composer: attach button and sheet */
function chatMBuildAttach(bar) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*,video/*'; input.multiple = true; input.className = 'hidden'; input.id = 'chatFileInput';
  input.onchange = () => { const files = Array.from(input.files || []); input.value = ''; if (files.length) chatMCompose(files); };
  const pdf = document.createElement('input');
  pdf.type = 'file'; pdf.accept = 'application/pdf,.pdf'; pdf.multiple = true; pdf.className = 'hidden'; pdf.id = 'chatPdfInput';
  pdf.onchange = () => {
    const files = Array.from(pdf.files || []).filter(f => chatMKind(f) === 'pdf').slice(0, CHATM.FILES_MAX); pdf.value = '';
    const big = files.find(f => f.size > CHATM.PDF_MAX);
    if (big) { alert(tk('chat.media.tooBig', { name: big.name, max: chatMSize(CHATM.PDF_MAX) })); return; }
    if (files.length && chatS.room) chatMSendItems(files.map(f => ({ file: f, kind: 'pdf' })), '', true);
  };
  const btn = chatEl('button', 'chat-attach'); btn.type = 'button'; btn.setAttribute('aria-label', tk('chat.attach'));
  btn.appendChild(chatSvg('M21.4 11.1l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5', 22));
  btn.onmousedown = (e) => e.preventDefault();
  // the menu offers photo/video, PDF, location and poll (js/chatextras.js); without it the button opens the photo choice directly
  btn.onclick = () => { if (typeof chatXAttachMenu === 'function') chatXAttachMenu({ photo: () => input.click(), pdf: () => pdf.click() }); else input.click(); };
  bar.appendChild(input); bar.appendChild(pdf); bar.appendChild(btn);
}
function chatMCompose(files) {
  const S = chatS;
  const items = files.slice(0, CHATM.FILES_MAX).map(f => ({ file: f, kind: chatMKind(f) })).filter(it => it.kind === 'img' || it.kind === 'vid');
  if (!items.length || !S.room) return;
  let hd = false;
  const card = chatSheetShell(tk('chat.media.title'));
  card.classList.add('chat-compose');
  const prev = chatEl('div', 'chat-compose-prev');
  const first = items[0];
  const url = URL.createObjectURL(first.file);
  if (first.kind === 'img') { const im = document.createElement('img'); im.src = chatMBlobSrc(url); im.alt = ''; prev.appendChild(im); }
  else { const v = document.createElement('video'); v.src = chatMBlobSrc(url); v.muted = true; v.playsInline = true; v.preload = 'metadata'; prev.appendChild(v); prev.appendChild(chatEl('span', 'chat-media-play', '▶')); }
  if (items.length > 1) prev.appendChild(chatEl('span', 'chat-compose-count', '+' + (items.length - 1)));
  card.appendChild(prev);
  const cap = chatEl('input', 'chat-compose-cap'); cap.type = 'text'; cap.maxLength = 1000; cap.placeholder = tk('chat.media.caption'); cap.setAttribute('aria-label', tk('chat.media.caption')); cap.setAttribute('enterkeyhint', 'send');
  card.appendChild(cap);
  const row = chatEl('div', 'chat-hd-row');
  const hdBtn = chatEl('button', 'chat-hd', 'HD'); hdBtn.type = 'button'; hdBtn.setAttribute('aria-pressed', 'false');
  const info = chatEl('div', 'chat-hd-info');
  const q = chatEl('div', 'chat-hd-q'); const sz = chatEl('div', 'chat-hd-size');
  info.appendChild(q); info.appendChild(sz);
  row.appendChild(hdBtn); row.appendChild(info); card.appendChild(row);
  const err = chatEl('div', 'chat-compose-err'); card.appendChild(err);
  const total = items.reduce((a, it) => a + it.file.size, 0);
  const anyVideo = items.some(it => it.kind === 'vid');
  let stdSize = null;
  const paint = () => {
    hdBtn.classList.toggle('on', hd); hdBtn.setAttribute('aria-pressed', hd ? 'true' : 'false');
    q.textContent = hd ? tk('chat.media.qualityHd') : tk('chat.media.qualityStd');
    if (stdSize != null) sz.textContent = tk('chat.media.sizes', { std: chatMSize(stdSize), hd: chatMSize(total) });
    else sz.textContent = tk('chat.media.sizeOriginal', { hd: chatMSize(total) });
    err.textContent = '';
    if (!hd && anyVideo && !chatMShrinkMime()) err.textContent = tk('chat.media.noShrink');
  };
  hdBtn.onclick = () => { hd = !hd; paint(); };
  paint();
  // photos: show how small Standard really is
  if (!anyVideo) (async () => { let sum = 0; for (const it of items) { try { it.std = await chatMPrepareImage(it.file, false); sum += it.std.blob.size; } catch (e) { sum += it.file.size; } } stdSize = sum; paint(); })();
  const acts = chatEl('div', 'chat-compose-acts');
  const cancel = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); cancel.type = 'button'; cancel.onclick = () => { URL.revokeObjectURL(url); chatCloseSheet(); };
  const send = chatEl('button', 'chat-btn', tk('chat.send')); send.type = 'button';
  send.onclick = () => {
    const tooBig = items.find(it => it.kind === 'img' ? (hd && it.file.size > CHATM.IMG_MAX) : (it.file.size > CHATM.VID_MAX && (hd || !chatMShrinkMime())));
    if (tooBig) { err.textContent = tk('chat.media.tooBig', { name: tooBig.file.name, max: chatMSize(tooBig.kind === 'img' ? CHATM.IMG_MAX : CHATM.VID_MAX) }); return; }
    URL.revokeObjectURL(url); chatCloseSheet();
    chatMSendItems(items, cap.value.trim(), hd);
  };
  cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') send.click(); });
  acts.appendChild(cancel); acts.appendChild(send); card.appendChild(acts);
}

/* ---------------------------------------------------------------- bubble and viewer */
function chatMBubble(mm, m) {
  if (mm.k === 'aud' && typeof chatVBubble === 'function') return chatVBubble(mm, m);
  if (mm.k === 'pdf' && typeof chatXPdfBubble === 'function') return chatXPdfBubble(mm, m);
  const box = chatEl('div', 'chat-media' + (mm.k === 'vid' ? ' vid' : ''));
  const ratio = (mm.w && mm.h) ? Math.min(1.8, Math.max(0.6, mm.w / mm.h)) : 1.33;
  box.style.aspectRatio = String(ratio);
  if (mm.th) { const im = document.createElement('img'); im.src = 'data:image/jpeg;base64,' + mm.th; im.alt = ''; box.appendChild(im); }
  else box.appendChild(chatEl('span', 'chat-media-ph', mm.k === 'vid' ? '🎞️' : '🖼️'));
  if (mm.k === 'vid') box.appendChild(chatEl('span', 'chat-media-play', '▶'));
  if (mm.k === 'vid' && mm.d) box.appendChild(chatEl('span', 'chat-media-dur', chatMDuration(mm.d)));
  if (mm.hd) box.appendChild(chatEl('span', 'chat-media-hd', 'HD'));
  if (m.pending && !m.failed) {
    const ov = chatEl('span', 'chat-media-prog', tk('chat.media.preparing')); box.appendChild(ov);
    if (m.ctl && mm.k === 'vid') { const x = chatEl('button', 'chat-media-cancel', '✕'); x.type = 'button'; x.setAttribute('aria-label', tk('chat.cancel')); x.onclick = (e) => { e.stopPropagation(); m.ctl.cancelled = true; }; box.appendChild(x); }
  }
  box.onclick = (e) => { e.stopPropagation(); if (!m.pending && !m.failed && mm.f) chatMOpen(mm, m); };
  return box;
}
function chatMOpen(mm, m) {
  const root = chatRoot();
  const old = document.getElementById('chatViewer'); if (old) old.remove();
  const v = chatEl('div', 'chat-viewer'); v.id = 'chatViewer';
  const top = chatEl('div', 'chat-viewer-top');
  const close = chatEl('button', 'chat-icon-btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', tk('chat.close')); close.onclick = () => v.remove();
  top.appendChild(close);
  const who = chatS.roster.find(r => r.id === m.von);
  top.appendChild(chatEl('span', 'chat-viewer-title', (m.von === chatS.uid ? tk('chat.you') : chatName(who)) + ' · ' + chatDayLabel(m.zeit) + ' ' + chatTime(m.zeit)));
  if (mm.hd) top.appendChild(chatEl('span', 'chat-media-hd static', 'HD'));
  v.appendChild(top);
  const stage = chatEl('div', 'chat-viewer-stage'); v.appendChild(stage);
  const bar = chatEl('div', 'chat-viewer-bar'); v.appendChild(bar);
  const status = chatEl('div', 'chat-viewer-status', tk('chat.media.loading', { percent: 0 }));
  if (mm.th) { const im = document.createElement('img'); im.className = 'blur'; im.src = 'data:image/jpeg;base64,' + mm.th; im.alt = ''; stage.appendChild(im); }
  stage.appendChild(status);
  root.appendChild(v);
  chatMFetch(mm, p => { status.textContent = tk('chat.media.loading', { percent: Math.round(p * 100) }); }).then(entry => {
    stage.replaceChildren();
    let el;
    if (mm.k === 'pdf') {
      el = chatEl('div', 'chat-viewer-doc'); el.appendChild(chatEl('div', 'chat-viewer-doc-ico', '📄'));
      el.appendChild(chatEl('div', 'chat-viewer-doc-name', String(mm.n || tk('chat.file.pdf')))); el.appendChild(chatEl('div', 'chat-viewer-doc-size', chatMSize(entry.blob.size)));
    } else if (mm.k === 'vid') { el = document.createElement('video'); el.controls = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.src = chatMBlobSrc(entry.url); }
    else { el = document.createElement('img'); el.src = chatMBlobSrc(entry.url); el.alt = ''; }
    stage.appendChild(el);
    const act = (label, fn) => { const b = chatEl('button', 'chat-viewer-act', label); b.type = 'button'; b.onclick = fn; bar.appendChild(b); };
    if (mm.k === 'pdf') act('↗ ' + tk('chat.pdf.open'), () => { const w = window.open(entry.url, '_blank'); if (!w) chatMSave(entry.blob, mm); });
    act('⇪ ' + tk('chat.media.share'), () => chatMShare(entry.blob, mm));
    act('⤓ ' + tk('chat.media.save'), () => chatMSave(entry.blob, mm));
    act('📥 ' + tk('chat.media.toPinn'), () => chatMPinnSheet(entry.blob, mm, m));
  }).catch(err => {
    status.textContent = err && err.gone ? tk('chat.media.gone') : tk('chat.media.loadFailed');
  });
}
async function chatMShare(blob, mm) {
  const f = new File([blob], chatMName(mm), { type: mm.mt || blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f] }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  chatMSave(blob, mm);
}
function chatMSave(blob, mm) {
  const a = document.createElement('a');
  a.href = chatMBlobSrc(URL.createObjectURL(blob)); a.download = chatMName(mm);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/* ---------------------------------------------------------------- file in pinn. (document, home, defect, vehicle) */
async function chatMCreateDoc(blob, mm, title, catId) {
  if (typeof loadDocuments === 'function') { try { loadDocuments(); } catch (e) { /* ignore */ } }
  const id = newRecordId();
  const name = finSafeFileName(chatMName(mm));
  const file = { id: 'f' + newRecordId(), blob, name, size: blob.size || 0, type: blob.type || mm.mt || '' };
  const fields = { titel: String(title || '').slice(0, 200), kategorie: catId, mitglied: '', datum: finTodayIso(), aussteller: '', betrag: 0, kaufdatum: '', gewaehrleistung_bis: '', garantie_bis: '', gueltig_bis: '', erinnern: 0, notiz: '', sichtbar: '', kasse: '' };
  await docEnqueueSave(id, true, fields, [file], [], []);
  try { docFlush(); } catch (e) { /* the outbox sends it later */ }
  return id;
}
function chatMPinnTargets() {
  const t = [];
  if (typeof docEnqueueSave !== 'function' || isCurrentUserGuest() || !isViewAllowed('dokumente')) return t;
  t.push({ id: 'doc', label: tk('chat.media.pinn.document'), objs: [] });
  try { if (typeof hsHomes === 'function' && hsCanEdit() && isViewAllowed('haus') && hsHomes().length) {
    t.push({ id: 'home', label: tk('chat.media.pinn.home'), objs: hsHomes().map(h => ({ id: h.id, label: hsName(h) })) });
    const dl = hsDefects().filter(d => d.status !== 'behoben');
    if (dl.length) t.push({ id: 'defect', label: tk('chat.media.pinn.defect'), objs: dl.map(d => ({ id: d.id, label: (d.title || tk('home.defect2')) })) });
  } } catch (e) { /* module not ready */ }
  try { if (typeof fzVehicles === 'function' && isViewAllowed('fahrzeuge') && fzVehicles().length) t.push({ id: 'vehicle', label: tk('chat.media.pinn.vehicle'), objs: fzVehicles().map(v => ({ id: v.id, label: fzName(v) })) }); } catch (e) { /* module not ready */ }
  return t;
}
function chatMPinnSheet(blob, mm, m) {
  const card = chatSheetShell(tk('chat.media.pinn.title'));
  card.classList.add('chat-sheet-top');
  const targets = chatMPinnTargets();
  if (mm.k === 'vid' || mm.k === 'aud' || !/^(image\/|application\/pdf)/.test(mm.mt || '')) { card.appendChild(chatEl('p', 'chat-sheet-text', tk('chat.media.pinn.videoNo'))); }
  else if (!targets.length) { card.appendChild(chatEl('p', 'chat-sheet-text', tk('chat.media.pinn.nothing'))); }
  else {
    const mk = (labelKey, el) => { const w = chatEl('label', 'chat-field'); w.appendChild(chatEl('span', 'chat-field-lbl', tk(labelKey))); w.appendChild(el); card.appendChild(w); return w; };
    const type = chatEl('select', 'chat-select'); targets.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.label; type.appendChild(o); });
    mk('chat.media.pinn.where', type);
    const obj = chatEl('select', 'chat-select'); const objW = mk('chat.media.pinn.which', obj);
    const cat = chatEl('select', 'chat-select'); (typeof docCategories === 'function' ? docCategories() : []).forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = (c.icon || '') + ' ' + c.label; cat.appendChild(o); });
    const catW = mk('chat.media.pinn.category', cat);
    const title = chatEl('input', 'chat-compose-cap'); title.type = 'text'; title.maxLength = 200; title.setAttribute('aria-label', tk('chat.media.pinn.name'));
    title.value = (m && chatS.plain.get(m.id) && chatS.plain.get(m.id).msg && chatS.plain.get(m.id).msg.x) ? String(chatS.plain.get(m.id).msg.x).slice(0, 80) : (mm.k === 'pdf' && mm.n ? String(mm.n).replace(/\.pdf$/i, '') : tk('chat.media.photo') + ' ' + chatDayLabel(Date.now()));
    mk('chat.media.pinn.name', title);
    const preset = (id, hint) => { const c = (typeof docCategories === 'function' ? docCategories() : []).find(x => x.id === hint); if (c) cat.value = c.id; };
    const sync = () => {
      const t = targets.find(x => x.id === type.value);
      obj.replaceChildren(); (t.objs || []).forEach(o => { const op = document.createElement('option'); op.value = o.id; op.textContent = o.label; obj.appendChild(op); });
      objW.classList.toggle('hidden', !(t.objs || []).length); catW.classList.toggle('hidden', t.id !== 'doc');
      preset(cat, t.id === 'vehicle' ? 'fahrzeuge' : (t.id === 'doc' ? '' : 'wohnen'));
    };
    type.onchange = sync; sync();
    const err = chatEl('div', 'chat-compose-err'); card.appendChild(err);
    const save = chatEl('button', 'chat-btn', tk('chat.media.pinn.save')); save.type = 'button';
    save.onclick = async () => {
      save.disabled = true;
      try {
        const docCat = cat.value || (docCategories()[0] || {}).id;
        const docId = await chatMCreateDoc(blob, mm, title.value.trim() || tk('chat.media.photo'), docCat);
        if (type.value === 'home') { hsLinkDoc('home:' + obj.value, docId); try { persistState(); hsAfterChange(); } catch (e) { /* ignore */ } }
        else if (type.value === 'defect') { hsLinkDoc('defect:' + obj.value, docId); try { persistState(); hsAfterChange(); } catch (e) { /* ignore */ } }
        else if (type.value === 'vehicle') { if (fzSetDocVehicles(docId, [obj.value])) { try { fzAfterChange(); persistState(); } catch (e) { /* ignore */ } } }
        chatCloseSheet(); chatMToast(tk('chat.media.pinn.done'));
      } catch (e) { err.textContent = tk('chat.error.send'); save.disabled = false; }
    };
    card.appendChild(save);
  }
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

/* ---------------------------------------------------------------- automatic deletion (info sheet) */
function chatMRetentionUi(card) {
  const S = chatS;
  if (!S.keep) return;
  card.appendChild(chatEl('h4', 'chat-sheet-sub', tk('chat.retention.title')));
  card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.retention.help')));
  const opts = [[0, 'chat.retention.never'], [7, 'chat.retention.d7'], [30, 'chat.retention.d30'], [90, 'chat.retention.d90'], [180, 'chat.retention.d180'], [365, 'chat.retention.d365']];
  const mk = (field, labelKey) => {
    const w = chatEl('label', 'chat-field'); w.appendChild(chatEl('span', 'chat-field-lbl', tk(labelKey)));
    const sel = chatEl('select', 'chat-select'); opts.forEach(([d, k]) => { const o = document.createElement('option'); o.value = String(d); o.textContent = tk(k); sel.appendChild(o); });
    sel.value = String(S.keep[field] || 0); sel.disabled = !S.isAdmin;
    sel.onchange = async () => {
      const next = Object.assign({}, S.keep, { [field]: Number(sel.value) });
      try { await chatPost('retention', next); S.keep = next; } catch (e) { sel.value = String(S.keep[field] || 0); alert(tk('chat.error.send')); }
    };
    w.appendChild(sel); card.appendChild(w);
  };
  mk('text', 'chat.retention.text'); mk('medien', 'chat.retention.media');
  if (S.storage != null) card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.retention.storage', { size: chatMSize(S.storage) })));
  if (!S.isAdmin) card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.retention.adminOnly')));
}

(window.PINN_PARTS = window.PINN_PARTS || []).push('chatmedien');
