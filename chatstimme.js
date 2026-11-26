/* pinn. – Chat: voice messages (js/chatstimme.js, since 1.127.4)
   Part of the chat (js/chat.js and js/chatmedien.js call the functions chatV... of this file).
   Recording: MediaRecorder with MP4/AAC where the browser can (iPhone, new Chrome), otherwise the microphone is read directly and
   saved as a small WAV file (16 kHz, mono) - both play on every phone (WebM is avoided on purpose, iPhones do not play it).
   A voice message is a file like a photo: encrypted in the browser, uploaded, and the key travels inside the chat message
   { m: { k: 'aud', f, key, iv, mt, d: seconds, pk: [40 bar heights 1-9], s: bytes } }. Playback loads the whole file first. */

const CHATV = { MAX_S: 300, MIN_S: 1, PEAKS: 40, RATE: 16000, SILENT: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=' };
let chatVRec = null;                                   // the running recording
const chatVPlay = { el: null, f: '', speed: 1, loading: '' }; // the one audio element (reused: iOS only allows it after a tap)

function chatVSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext)); }
function chatVMp4Mime() {
  try { if (window.MediaRecorder && MediaRecorder.isTypeSupported) return ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || ''; } catch (e) { /* none */ }
  return '';
}

/* ---------------------------------------------------------------- recording */
async function chatVStart() {
  if (chatVRec || !chatS || chatS.phase !== 'ready' || !chatS.room) return;
  if (!chatVSupported()) { chatToast(tk('chat.voice.unsupported')); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { chatToast(tk('chat.voice.noMic')); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  const rec = { stream, started: Date.now(), levels: [], chunks: [], pcm: [], mr: null, sp: null, ctx: new AC(), an: null, rate: 0, acc: 0, cnt: 0, pos: 0, room: chatS.room, done: false, timer: 0, ui: null };
  try { await rec.ctx.resume(); } catch (e) { /* already running */ }
  const src = rec.ctx.createMediaStreamSource(stream);
  rec.an = rec.ctx.createAnalyser(); rec.an.fftSize = 512; src.connect(rec.an);
  const mime = chatVMp4Mime();
  try {
    if (mime) {
      rec.mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
      rec.mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
      rec.mr.start(500);
    } else {
      rec.rate = rec.ctx.sampleRate;
      rec.sp = rec.ctx.createScriptProcessor(4096, 1, 1);
      const ratio = rec.rate / CHATV.RATE;
      rec.sp.onaudioprocess = (ev) => { // thin out to 16 kHz while recording, so five minutes stay small
        if (rec.done) return;
        const inp = ev.inputBuffer.getChannelData(0), out = [];
        for (let i = 0; i < inp.length; i++) {
          rec.acc += inp[i]; rec.cnt++; rec.pos += 1;
          if (rec.pos >= ratio) { const v = Math.max(-1, Math.min(1, rec.acc / rec.cnt)); out.push(v < 0 ? v * 0x8000 : v * 0x7fff); rec.acc = 0; rec.cnt = 0; rec.pos -= ratio; }
        }
        rec.pcm.push(Int16Array.from(out));
      };
      src.connect(rec.sp); rec.sp.connect(rec.ctx.destination); // the output stays silent (nothing is written to it)
    }
  } catch (e) { chatVTeardown(rec); chatToast(tk('chat.voice.unsupported')); return; }
  chatVRec = rec;
  rec.timer = setInterval(() => chatVTick(rec), 100);
  chatVBar(rec);
}
function chatVTeardown(rec) {
  rec.done = true; clearInterval(rec.timer);
  try { rec.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* ignore */ }
  try { if (rec.sp) rec.sp.disconnect(); } catch (e) { /* ignore */ }
  try { rec.ctx.close(); } catch (e) { /* ignore */ }
}
function chatVSeconds(rec) { return (Date.now() - rec.started) / 1000; }
function chatVTick(rec) {
  if (rec.done) return;
  const buf = new Uint8Array(rec.an.fftSize); rec.an.getByteTimeDomainData(buf);
  let sum = 0; for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
  const lvl = Math.sqrt(sum / buf.length);
  rec.levels.push(lvl);
  if (rec.ui) {
    rec.ui.time.textContent = chatMDuration(chatVSeconds(rec));
    const bars = rec.ui.bars.children, n = bars.length, from = rec.levels.slice(-n);
    for (let i = 0; i < n; i++) { const v = from[i - (n - from.length)]; bars[i].style.height = (v === undefined ? 12 : Math.max(12, Math.min(100, v * 380))) + '%'; }
  }
  if (chatVSeconds(rec) >= CHATV.MAX_S) { chatToast(tk('chat.voice.max', { minutes: Math.round(CHATV.MAX_S / 60) })); chatVFinish(true); }
}
// The recording bar replaces the composer while recording
function chatVBar(rec) {
  const bar = document.querySelector('#chatRoot .chat-composer');
  if (!bar) { chatVCancel(true); return; }
  bar.classList.add('recording');
  const ui = chatEl('div', 'chat-rec');
  const del = chatEl('button', 'chat-icon-btn dark chat-rec-del', '🗑'); del.type = 'button'; del.setAttribute('aria-label', tk('chat.voice.cancel')); del.onclick = () => chatVCancel(false);
  const dot = chatEl('span', 'chat-rec-dot');
  const time = chatEl('span', 'chat-rec-time', '0:00');
  const bars = chatEl('div', 'chat-rec-bars'); for (let i = 0; i < 28; i++) bars.appendChild(chatEl('i'));
  const send = chatEl('button', 'chat-send'); send.type = 'button'; send.setAttribute('aria-label', tk('chat.send')); send.appendChild(chatSvg('M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z', 20)); send.onclick = () => chatVFinish(true);
  [del, dot, time, bars, send].forEach(e => ui.appendChild(e));
  bar.appendChild(ui);
  rec.ui = { root: ui, time, bars, bar };
}
function chatVBarRemove(rec) {
  if (rec.ui) { rec.ui.bar.classList.remove('recording'); rec.ui.root.remove(); rec.ui = null; }
}
// Stops without sending. quiet = no message
function chatVCancel(quiet) {
  const rec = chatVRec;
  if (!rec) return;
  chatVRec = null;
  try { if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop(); } catch (e) { /* ignore */ }
  chatVTeardown(rec); chatVBarRemove(rec);
}
function chatVPeaks(levels) {
  const n = CHATV.PEAKS, out = [];
  if (!levels.length) return new Array(n).fill(1);
  const size = levels.length / n;
  for (let i = 0; i < n; i++) { let m = 0; for (let j = Math.floor(i * size); j < Math.max(Math.floor(i * size) + 1, Math.floor((i + 1) * size)); j++) m = Math.max(m, levels[j] || 0); out.push(m); }
  const top = Math.max(0.02, ...out);
  return out.map(v => Math.max(1, Math.min(9, Math.round(v / top * 9))));
}
function chatVWav(chunks) {
  let n = 0; chunks.forEach(c => { n += c.length; });
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, CHATV.RATE, true); v.setUint32(28, CHATV.RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let o = 44; chunks.forEach(c => { for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); });
  return new Blob([buf], { type: 'audio/wav' });
}
// Ends the recording and sends it (send = false: only stops)
async function chatVFinish(send) {
  const rec = chatVRec;
  if (!rec) return;
  chatVRec = null;
  const seconds = chatVSeconds(rec);
  if (rec.mr) await new Promise((res) => { rec.mr.onstop = res; try { rec.mr.stop(); } catch (e) { res(); } });
  chatVTeardown(rec); chatVBarRemove(rec);
  if (!send) return;
  if (seconds < CHATV.MIN_S) { chatToast(tk('chat.voice.tooShort')); return; }
  const blob = rec.mr ? new Blob(rec.chunks, { type: 'audio/mp4' }) : chatVWav(rec.pcm);
  if (!blob.size) { chatToast(tk('chat.voice.unsupported')); return; }
  if (chatS.room !== rec.room) return;
  chatMSendOne(rec.room, { kind: 'aud', file: { name: '', size: blob.size, type: blob.type }, prep: { blob, mt: blob.type, w: 0, h: 0, th: '', hd: true, d: Math.round(seconds), pk: chatVPeaks(rec.levels) } }, '', true);
}

/* ---------------------------------------------------------------- composer: microphone button */
// The microphone sits where the send button is while nothing is typed (like in messengers)
function chatXBuildMic(bar, sendBtn, input) {
  const mic = chatEl('button', 'chat-send chat-mic'); mic.type = 'button'; mic.id = 'chatMicBtn'; mic.setAttribute('aria-label', tk('chat.voice.record')); mic.title = tk('chat.voice.record');
  mic.appendChild(chatSvg('M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8', 20));
  mic.onmousedown = (e) => e.preventDefault();
  mic.onclick = () => chatVStart();
  bar.insertBefore(mic, sendBtn);
  window.chatXSyncMic = () => {
    const typed = !!input.value.trim() || !!(chatS && chatS.ref);
    const show = chatVSupported() && !typed;
    mic.classList.toggle('chat-hide', !show);
    sendBtn.classList.toggle('chat-hide', show);
  };
  window.chatXSyncMic();
}

/* ---------------------------------------------------------------- playback */
function chatVAudioEl() {
  if (!chatVPlay.el) {
    const a = new Audio(); a.preload = 'auto';
    a.addEventListener('timeupdate', () => chatVPaint());
    a.addEventListener('play', () => chatVPaint());
    a.addEventListener('pause', () => chatVPaint());
    a.addEventListener('ended', () => { a.currentTime = 0; chatVPaint(); });
    chatVPlay.el = a;
  }
  return chatVPlay.el;
}
function chatVSelector(f) { return '#chatMsgs [data-voice="' + CSS.escape(String(f)) + '"]'; }
function chatVPaintOne(box, playing, frac, cur, dur) {
  const btn = box.querySelector('.chat-voice-play'); if (btn) btn.textContent = playing ? '⏸' : '▶';
  const bars = box.querySelectorAll('.chat-voice-bars i');
  bars.forEach((b, i) => b.classList.toggle('on', frac > 0 && (i + 0.5) / bars.length <= frac));
  const t = box.querySelector('.chat-voice-time'); if (t) t.textContent = chatMDuration(playing || cur > 0 ? cur : dur);
}
function chatVPaint() {
  const a = chatVPlay.el;
  document.querySelectorAll('#chatMsgs .chat-voice').forEach((box) => {
    const dur = Number(box.dataset.dur) || 0;
    if (a && box.dataset.voice === chatVPlay.f) chatVPaintOne(box, !a.paused && !a.ended, (a.duration || dur) ? a.currentTime / (a.duration || dur) : 0, a.currentTime, dur);
    else chatVPaintOne(box, false, 0, 0, dur);
  });
}
async function chatVToggle(mm, m, box) {
  const a = chatVAudioEl();
  if (chatVPlay.f === mm.f && a.src && a.src.indexOf('data:') !== 0) { if (a.paused) a.play().catch(() => { /* blocked */ }); else a.pause(); return; }
  if (chatVPlay.loading === mm.f) return;
  a.pause(); chatVPlay.f = mm.f; chatVPlay.loading = mm.f;
  a.src = CHATV.SILENT; a.play().catch(() => { /* unlocks the element for the real file below */ });
  box.classList.add('loading');
  try {
    const entry = await chatMFetch(mm);
    if (chatVPlay.f !== mm.f) return;
    a.src = chatMBlobSrc(entry.url); a.playbackRate = chatVPlay.speed;
    await a.play();
  } catch (e) { chatVPlay.f = ''; chatToast(e && e.gone ? tk('chat.media.gone') : tk('chat.media.loadFailed')); }
  finally { chatVPlay.loading = ''; document.querySelectorAll('#chatMsgs .chat-voice.loading').forEach(b => b.classList.remove('loading')); chatVPaint(); }
}
function chatVBubble(mm, m) {
  const box = chatEl('div', 'chat-voice'); box.dataset.voice = mm.f || m.id; box.dataset.dur = String(mm.d || 0);
  const btn = chatEl('button', 'chat-voice-play', '▶'); btn.type = 'button'; btn.setAttribute('aria-label', tk('chat.voice.play'));
  const mid = chatEl('div', 'chat-voice-mid');
  const bars = chatEl('div', 'chat-voice-bars');
  const pk = Array.isArray(mm.pk) && mm.pk.length ? mm.pk : new Array(CHATV.PEAKS).fill(3);
  pk.slice(0, 60).forEach(h => { const i = chatEl('i'); i.style.height = (10 + Math.max(1, Math.min(9, Number(h) || 1)) * 10) + '%'; bars.appendChild(i); });
  mid.appendChild(bars);
  const foot = chatEl('div', 'chat-voice-foot');
  foot.appendChild(chatEl('span', 'chat-voice-time', chatMDuration(mm.d || 0)));
  const sp = chatEl('button', 'chat-voice-speed', chatVPlay.speed + '×'); sp.type = 'button'; sp.setAttribute('aria-label', tk('chat.voice.speed'));
  sp.onclick = (e) => { e.stopPropagation(); chatVPlay.speed = chatVPlay.speed === 1 ? 1.5 : chatVPlay.speed === 1.5 ? 2 : 1; if (chatVPlay.el) chatVPlay.el.playbackRate = chatVPlay.speed; document.querySelectorAll('#chatMsgs .chat-voice-speed').forEach(b => { b.textContent = chatVPlay.speed + '×'; }); };
  foot.appendChild(sp); mid.appendChild(foot);
  box.appendChild(btn); box.appendChild(mid);
  const ready = !m.pending && !m.failed && mm.f;
  btn.disabled = !ready;
  btn.onclick = (e) => { e.stopPropagation(); if (ready) chatVToggle(mm, m, box); };
  bars.onclick = (e) => { // tap on the bars: jump there (only for the message that is loaded)
    e.stopPropagation();
    const a = chatVPlay.el;
    if (!ready || !a || chatVPlay.f !== mm.f || !a.duration) return;
    const r = bars.getBoundingClientRect(); a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * a.duration;
  };
  if (m.pending && !m.failed) box.appendChild(chatEl('span', 'chat-voice-prog', tk('chat.media.preparing')));
  setTimeout(chatVPaint, 0);
  return box;
}
// Leaving the chat: stop recording and playing
function chatVStopAll() { chatVCancel(true); try { if (chatVPlay.el) { chatVPlay.el.pause(); chatVPlay.f = ''; } } catch (e) { /* ignore */ } }

(window.PINN_PARTS = window.PINN_PARTS || []).push('chatstimme');
