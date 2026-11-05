/* pinn. – Chat extras (js/chatextras.js, since 1.127.4)
   Part of the chat (js/chat.js calls the functions chatX... of this file; everything here only runs on the chat page).
   Contents:
   - the "+" menu of the composer (photo/video, PDF, location, poll)
   - polls: a poll is a message { p: { q, o: [{ id, t }], mu, pn } }. Votes are small silent messages { v: { p: <poll message id>, s: [option ids] } }
     (the newest vote of a person counts; silent = no push, never unread, not shown). A poll that is also on the pin board (pn = note id)
     reads and writes the votes of that pin board note instead, so the result is the same in both places.
   - locations: { l: { la, lo, ac, n } } with a small map in the bubble and a viewer with "show on the location map" (js/familie.js, famShowPoint)
   - search inside a conversation (client side: the messages are only readable on the device)
   - muting a chat, the switch "end-to-end encryption on/off" (admins), dissolving a group
   All visible text comes from tk('chat.*'); user text is only ever put into the page with textContent (no innerHTML). */

const CHATX = { OPTS_MAX: 8, OPT_LEN: 60, Q_LEN: 120, PDF_MAX: 20 * 1024 * 1024, MAP_Z: 16 };
let chatXSrch = null;      // running search { q, hits: [message ids], idx, token }

/* ---------------------------------------------------------------- sending any kind of message */
// Sends a message object (poll, location, vote ...) into the open chat. extra: { leise: true } for silent messages (votes)
async function chatXSendPayload(payload, extra) {
  const S = chatS;
  const room = S.room;
  if (!room || S.phase !== 'ready') return false;
  if (!S.plainMode && chatRoomMembers(room).some(p => p.changed)) { chatRenderConv(); return false; }
  const tmp = { id: 'tmp' + Date.now() + Math.random().toString(36).slice(2, 6), raum: room, von: S.uid, zeit: Date.now(), aktualisiert: 0, daten: '', gelesen: {}, pending: true, leise: !!(extra && extra.leise) };
  S.plain.set(tmp.id, { msg: payload });
  chatMerge(room, [tmp]);
  chatRenderConv(true);
  await chatDeliver(room, tmp, payload, extra);
  return true;
}

/* ---------------------------------------------------------------- "+" menu */
function chatXAttachMenu(acts) {
  const card = chatSheetShell(tk('chat.attach.title'));
  const add = (icon, label, fn) => {
    const b = chatEl('button', 'chat-sheet-act chat-attach-row'); b.type = 'button';
    b.appendChild(chatEl('span', 'chat-attach-ico', icon)); b.appendChild(chatEl('span', '', label));
    b.onclick = () => { chatCloseSheet(); fn(); }; // the file field / location query must start inside the tap
    card.appendChild(b);
  };
  add('🖼️', tk('chat.attach.photo'), acts.photo);
  add('📄', tk('chat.attach.pdf'), acts.pdf);
  add('📍', tk('chat.attach.location'), chatXLocSheet);
  add('📊', tk('chat.attach.poll'), chatXPollSheet);
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

/* ---------------------------------------------------------------- polls */
function chatXBoardOk() {
  try { return typeof pwCreatePoll === 'function' && !isCurrentUserGuest() && isViewAllowed('pinnwand'); } catch (e) { return false; }
}
function chatXPollSheet() {
  const card = chatSheetShell(tk('chat.poll.title'));
  const q = document.createElement('input'); q.type = 'text'; q.className = 'chat-group-name'; q.maxLength = CHATX.Q_LEN; q.autocomplete = 'off';
  q.placeholder = tk('chat.poll.question'); q.setAttribute('aria-label', tk('chat.poll.question')); card.appendChild(q);
  const list = chatEl('div', 'chat-poll-opts'); card.appendChild(list);
  const inputs = [];
  const addOpt = () => {
    if (inputs.length >= CHATX.OPTS_MAX) return;
    const i = document.createElement('input'); i.type = 'text'; i.className = 'chat-group-name'; i.maxLength = CHATX.OPT_LEN; i.autocomplete = 'off';
    i.placeholder = tk('chat.poll.option', { n: inputs.length + 1 }); i.setAttribute('aria-label', i.placeholder);
    inputs.push(i); list.appendChild(i);
    more.classList.toggle('chat-hide', inputs.length >= CHATX.OPTS_MAX);
  };
  const more = chatEl('button', 'chat-sheet-act', tk('chat.poll.addOption')); more.type = 'button'; more.onclick = () => { addOpt(); inputs[inputs.length - 1].focus(); };
  card.appendChild(more);
  const sw = (text, help) => {
    const rec = chatEl('label', 'chat-switch'); const cb = document.createElement('input'); cb.type = 'checkbox'; rec.appendChild(cb);
    const lab = chatEl('span', 'chat-switch-text'); lab.appendChild(chatEl('span', 'chat-switch-title', text)); if (help) lab.appendChild(chatEl('span', 'chat-switch-help', help));
    rec.appendChild(lab); card.appendChild(rec); return { cb, rec };
  };
  const multi = sw(tk('chat.poll.multi'));
  const board = chatXBoardOk() ? sw(tk('chat.poll.board'), tk('chat.poll.boardHelp')) : null;
  if (board) board.cb.onchange = () => { multi.cb.disabled = board.cb.checked; if (board.cb.checked) multi.cb.checked = false; multi.rec.classList.toggle('chat-dim', board.cb.checked); };
  addOpt(); addOpt();
  const err = chatEl('div', 'chat-sheet-note chat-group-err'); card.appendChild(err);
  const send = chatEl('button', 'chat-sheet-act chat-sheet-primary', tk('chat.poll.create')); send.type = 'button';
  send.onclick = async () => {
    const question = q.value.replace(/\s+/g, ' ').trim();
    const texts = inputs.map(i => i.value.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!question || texts.length < 2) { err.textContent = tk('chat.poll.invalid'); return; }
    send.disabled = true;
    const poll = { q: question, o: texts.map((t, i) => ({ id: 'o' + (i + 1), t })), mu: multi.cb.checked ? 1 : 0 };
    if (board && board.cb.checked) {
      try { const n = pwCreatePoll(question, texts); poll.pn = n.id; poll.mu = 0; poll.o = n.options.map(o => ({ id: o.id, t: o.text })); }
      catch (e) { err.textContent = tk('chat.error.send'); send.disabled = false; return; }
    }
    chatCloseSheet();
    chatXSendPayload({ x: '', p: poll });
  };
  card.appendChild(send);
  const cancel = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); cancel.type = 'button'; cancel.onclick = chatCloseSheet; card.appendChild(cancel);
  setTimeout(() => { try { q.focus(); } catch (e) { /* ignore */ } }, 60);
}
// voter -> { t, s: [option ids] } from the silent vote messages of the open room (the newest vote of a person counts)
function chatXVoteMap(pollId) {
  const S = chatS, out = {};
  chatRoomState(S.room).msgs.forEach(m => {
    if (m.geloescht) return;
    const pl = S.plain.get(m.id), v = pl && pl.msg && pl.msg.v;
    if (!v || v.p !== pollId || !Array.isArray(v.s)) return;
    if (!out[m.von] || out[m.von].t <= m.zeit) out[m.von] = { t: m.zeit, s: v.s.map(String) };
  });
  return out;
}
// true if the open chat holds a poll that is also on the pin board
function chatXHasBoardPoll(room) {
  const S = chatS;
  return chatRoomState(room).msgs.some(m => { const pl = S.plain.get(m.id); return !!(pl && pl.msg && pl.msg.p && pl.msg.p.pn); });
}
// the votes of all board-linked polls of the open chat as one string (to notice a change)
function chatXBoardSig(room) {
  const S = chatS; let out = '';
  chatRoomState(room).msgs.forEach(m => {
    const pl = S.plain.get(m.id), pn = pl && pl.msg && pl.msg.p && pl.msg.p.pn;
    if (!pn) return;
    try { const n = pinboard.find(x => x && x.id === pn); out += pn + ':' + JSON.stringify(n ? [n.votes || {}, !!n.closed] : null) + ';'; } catch (e) { /* ignore */ }
  });
  return out;
}
function chatXPollBubble(p, m) {
  const S = chatS;
  const box = chatEl('div', 'chat-poll');
  box.appendChild(chatEl('div', 'chat-poll-q', '📊 ' + String(p.q || '')));
  const opts = Array.isArray(p.o) ? p.o.slice(0, CHATX.OPTS_MAX) : [];
  let note = null, boardOn = false;
  if (p.pn) {
    boardOn = true;
    try { if (typeof pinboard !== 'undefined' && isViewAllowed('pinnwand')) note = pinboard.find(n => n && n.id === p.pn) || null; } catch (e) { note = null; }
  }
  // who voted for what: option id -> [voter ids]
  const per = {}; let mine = [], voters = 0, closed = false, readOnly = false, gone = false;
  if (boardOn) {
    if (note) {
      const votes = note.votes || {}; closed = !!note.closed;
      Object.keys(votes).forEach(k => { if (opts.some(o => o.id === votes[k])) { (per[votes[k]] = per[votes[k]] || []).push(k); voters++; } });
      try { mine = pwMyKeys().map(k => votes[k]).filter(Boolean).slice(0, 1); } catch (e) { mine = []; }
    } else { readOnly = true; try { gone = isViewAllowed('pinnwand') && typeof pinboard !== 'undefined' && pinboardLoadedOk(); } catch (e) { gone = false; } }
  } else {
    const vm = chatXVoteMap(m.id);
    Object.keys(vm).forEach(u => { const s = vm[u].s.filter(id => opts.some(o => o.id === id)); if (s.length) voters++; s.forEach(id => { (per[id] = per[id] || []).push(u); }); });
    mine = vm[S.uid] ? vm[S.uid].s : [];
  }
  const max = Math.max(0, ...opts.map(o => (per[o.id] || []).length));
  opts.forEach(o => {
    const n = (per[o.id] || []).length;
    const b = chatEl('button', 'chat-poll-opt' + (mine.indexOf(o.id) >= 0 ? ' mine' : '') + (closed && n && n === max ? ' win' : '')); b.type = 'button';
    if (readOnly || closed) b.disabled = true;
    const bar = chatEl('span', 'chat-poll-bar'); bar.style.width = (voters && !readOnly ? Math.round(n / voters * 100) : 0) + '%'; b.appendChild(bar);
    b.appendChild(chatEl('span', 'chat-poll-t', String(o.t || '')));
    if (!readOnly) b.appendChild(chatEl('span', 'chat-poll-n', n ? String(n) : ''));
    b.onclick = (e) => { e.stopPropagation(); chatXVote(m, p, o.id, mine); };
    box.appendChild(b);
  });
  let hint;
  if (readOnly) hint = gone ? tk('chat.poll.gone') : tk('chat.poll.noBoard');
  else hint = tk('board.votesN', { n: voters }) + ' · ' + (closed ? tk('board.pollClosed') : (p.mu ? tk('chat.poll.multiHint') : tk('chat.poll.tapVote'))) + (boardOn ? ' · 📌 ' + tk('chat.poll.onBoard') : '');
  box.appendChild(chatEl('div', 'chat-poll-meta', hint));
  return box;
}
function pinboardLoadedOk() { return typeof pinboard !== 'undefined' && Array.isArray(pinboard) && pinboard.length > 0; }
function chatXVote(m, p, optId, current) {
  if (p.pn) { try { pwVote(p.pn, optId); } catch (e) { /* no access */ } chatRenderConv(); return; }
  let next;
  if (p.mu) next = current.indexOf(optId) >= 0 ? current.filter(x => x !== optId) : current.concat([optId]);
  else next = current.length === 1 && current[0] === optId ? [] : [optId];
  chatXSendPayload({ x: '', v: { p: m.id, s: next } }, { leise: true });
}

/* ---------------------------------------------------------------- locations */
function chatXRound(v) { return Math.round(Number(v) * 100000) / 100000; }
// Name of a place saved in the location map (Family → Location → Places) when the position is inside it
function chatXPlaceNear(la, lo) {
  try {
    if (typeof famPlaces !== 'function') return '';
    const hit = famPlaces().find(o => {
      const dy = (o.lat - la) * 111320, dx = (o.lon - lo) * 111320 * Math.cos(la * Math.PI / 180);
      return Math.sqrt(dx * dx + dy * dy) <= (Number(o.radius) || 150);
    });
    return hit ? ((hit.emoji ? hit.emoji + ' ' : '') + String(hit.name || '')).trim() : '';
  } catch (e) { return ''; }
}
// A small map without controls: the tiles of the own server around the point (same tiles as the location map)
function chatXStaticMap(la, lo, z) {
  const TS = 256, W = 360, H = 180, n = Math.pow(2, z);
  const r = Math.max(-85.05, Math.min(85.05, la)) * Math.PI / 180;
  const px = (lo + 180) / 360 * n * TS, py = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n * TS;
  const box = chatEl('div', 'chat-map'); const stage = chatEl('div', 'chat-map-stage'); box.appendChild(stage);
  const left = px - W / 2, top = py - H / 2;
  for (let tx = Math.floor(left / TS); tx <= Math.floor((left + W) / TS); tx++) {
    for (let ty = Math.max(0, Math.floor(top / TS)); ty <= Math.min(n - 1, Math.floor((top + H) / TS)); ty++) {
      const wx = ((tx % n) + n) % n;
      const img = document.createElement('img'); img.alt = ''; img.draggable = false; img.className = 'chat-map-tile';
      img.style.transform = 'translate(' + Math.round(tx * TS - left) + 'px,' + Math.round(ty * TS - top) + 'px)';
      img.onerror = () => { if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = 'https://tile.openstreetmap.org/' + z + '/' + wx + '/' + ty + '.png'; } };
      img.src = '/api/pinn/ortung/kachel/' + z + '/' + wx + '/' + ty;
      stage.appendChild(img);
    }
  }
  box.appendChild(chatEl('span', 'chat-map-pin', '📍'));
  return box;
}
function chatXLocSheet() {
  const card = chatSheetShell(tk('chat.loc.title'));
  const status = chatEl('div', 'chat-sheet-note', tk('chat.loc.finding')); card.appendChild(status);
  const prev = chatEl('div', 'chat-loc-prev'); card.appendChild(prev);
  const name = document.createElement('input'); name.type = 'text'; name.className = 'chat-group-name chat-hide'; name.maxLength = 80; name.autocomplete = 'off';
  name.placeholder = tk('chat.loc.name'); name.setAttribute('aria-label', tk('chat.loc.name')); card.appendChild(name);
  const send = chatEl('button', 'chat-sheet-act chat-sheet-primary', tk('chat.loc.send')); send.type = 'button'; send.disabled = true; card.appendChild(send);
  const cancel = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); cancel.type = 'button'; cancel.onclick = chatCloseSheet; card.appendChild(cancel);
  let fix = null;
  send.onclick = () => {
    if (!fix) return;
    chatCloseSheet();
    chatXSendPayload({ x: '', l: { la: chatXRound(fix.la), lo: chatXRound(fix.lo), ac: Math.round(fix.ac || 0), n: name.value.replace(/\s+/g, ' ').trim().slice(0, 80) } });
  };
  if (!navigator.geolocation) { status.textContent = tk('chat.loc.denied'); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    fix = { la: pos.coords.latitude, lo: pos.coords.longitude, ac: pos.coords.accuracy };
    status.textContent = fix.ac ? tk('chat.loc.accuracy', { m: Math.round(fix.ac) }) : '';
    prev.replaceChildren(chatXStaticMap(fix.la, fix.lo, CHATX.MAP_Z));
    name.classList.remove('chat-hide'); name.value = chatXPlaceNear(fix.la, fix.lo);
    send.disabled = false;
  }, () => { status.textContent = tk('chat.loc.denied'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}
function chatXLocBubble(l) {
  const wrap = chatEl('div', 'chat-loc');
  wrap.appendChild(chatXStaticMap(Number(l.la), Number(l.lo), CHATX.MAP_Z));
  const cap = chatEl('div', 'chat-loc-cap'); cap.appendChild(chatEl('b', '', '📍 ' + (l.n ? String(l.n) : tk('chat.loc.label'))));
  if (l.ac) cap.appendChild(chatEl('span', '', tk('chat.loc.accuracy', { m: Number(l.ac) })));
  wrap.appendChild(cap);
  wrap.onclick = (e) => { e.stopPropagation(); chatXLocOpen(l); };
  return wrap;
}
function chatXMapsUrl(la, lo, label) {
  const q = encodeURIComponent(label || '');
  try { if (typeof isAppleMobile === 'function' && isAppleMobile()) return 'https://maps.apple.com/?ll=' + la + ',' + lo + (q ? '&q=' + q : ''); } catch (e) { /* next */ }
  try { if (typeof isAndroidDevice === 'function' && isAndroidDevice()) return 'geo:' + la + ',' + lo + '?q=' + la + ',' + lo + '(' + q + ')'; } catch (e) { /* next */ }
  return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=17/' + la + '/' + lo;
}
function chatXLocOpen(l) {
  const la = Number(l.la), lo = Number(l.lo);
  if (!isFinite(la) || !isFinite(lo)) return;
  const old = document.getElementById('chatViewer'); if (old) old.remove();
  const v = chatEl('div', 'chat-viewer'); v.id = 'chatViewer';
  const top = chatEl('div', 'chat-viewer-top');
  const close = chatEl('button', 'chat-icon-btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', tk('chat.close')); close.onclick = () => v.remove();
  top.appendChild(close); top.appendChild(chatEl('span', 'chat-viewer-title', '📍 ' + (l.n ? String(l.n) : tk('chat.loc.label')))); v.appendChild(top);
  const stage = chatEl('div', 'chat-viewer-stage chat-loc-stage'); v.appendChild(stage);
  chatRoot().appendChild(v);
  let ok = false;
  try {
    if (typeof famCreateMap === 'function') {
      const map = famCreateMap(stage, {});
      map.setMarkers([{ lat: la, lon: lo, html: '<div class="fm-place">📍</div>', cls: 'is-place' }]);
      map.setView(la, lo, CHATX.MAP_Z); ok = true;
    }
  } catch (e) { ok = false; }
  if (!ok) stage.appendChild(chatXStaticMap(la, lo, CHATX.MAP_Z));
  const bar = chatEl('div', 'chat-viewer-bar'); v.appendChild(bar);
  const act = (label, fn) => { const b = chatEl('button', 'chat-viewer-act', label); b.type = 'button'; b.onclick = fn; bar.appendChild(b); };
  let famOk = false; try { famOk = typeof famShowPoint === 'function' && typeof famOrtungAllowed === 'function' && famOrtungAllowed() && isViewAllowed('familie'); } catch (e) { famOk = false; }
  if (famOk) act('🛰️ ' + tk('chat.loc.onMap'), () => { v.remove(); famShowPoint(la, lo, l.n ? String(l.n) : tk('chat.loc.label')); });
  act('↗ ' + tk('chat.loc.openMaps'), () => { const a = document.createElement('a'); a.href = chatXMapsUrl(la, lo, l.n); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); });
  act('⧉ ' + tk('chat.loc.copy'), async () => { try { await navigator.clipboard.writeText(la + ', ' + lo); chatToast(tk('chat.loc.copied')); } catch (e) { /* clipboard blocked */ } });
}

/* ---------------------------------------------------------------- PDF */
function chatXPdfBubble(mm, m) {
  const box = chatEl('button', 'chat-pdf'); box.type = 'button';
  box.appendChild(chatEl('span', 'chat-pdf-ico', '📄'));
  const mid = chatEl('span', 'chat-pdf-mid');
  mid.appendChild(chatEl('span', 'chat-pdf-name', String(mm.n || tk('chat.file.pdf'))));
  mid.appendChild(chatEl('span', 'chat-pdf-size', 'PDF' + (mm.s ? ' · ' + chatMSize(mm.s) : '')));
  box.appendChild(mid);
  if (m.pending && !m.failed) box.appendChild(chatEl('span', 'chat-media-prog chat-pdf-prog', tk('chat.media.preparing')));
  box.onclick = (e) => { e.stopPropagation(); if (!m.pending && !m.failed && mm.f) chatMOpen(mm, m); };
  return box;
}

/* ---------------------------------------------------------------- search in the open conversation */
function chatXSearchText(msg) {
  if (!msg) return '';
  const parts = [msg.x];
  if (msg.r) parts.push(msg.r.ti);
  if (msg.m) parts.push(msg.m.n);
  if (msg.l) parts.push(msg.l.n);
  if (msg.p) { parts.push(msg.p.q); (msg.p.o || []).forEach(o => parts.push(o.t)); }
  return parts.filter(Boolean).join(' ').toLowerCase();
}
function chatXSearchToggle() {
  const old = document.getElementById('chatSearch');
  if (old) { old.remove(); chatXSrch = null; return; }
  const conv = document.querySelector('#chatRoot .chat-conv'); const head = conv && conv.querySelector('.chat-conv-head');
  if (!head) return;
  const bar = chatEl('div', 'chat-search'); bar.id = 'chatSearch';
  const input = document.createElement('input'); input.type = 'search'; input.className = 'chat-search-in'; input.placeholder = tk('chat.search.placeholder'); input.setAttribute('aria-label', tk('chat.search.placeholder')); input.autocomplete = 'off';
  const count = chatEl('span', 'chat-search-count');
  const up = chatEl('button', 'chat-icon-btn dark', '↑'); up.type = 'button'; up.setAttribute('aria-label', tk('chat.search.older'));
  const down = chatEl('button', 'chat-icon-btn dark', '↓'); down.type = 'button'; down.setAttribute('aria-label', tk('chat.search.newer'));
  const x = chatEl('button', 'chat-icon-btn dark', '✕'); x.type = 'button'; x.setAttribute('aria-label', tk('chat.close'));
  [input, count, up, down, x].forEach(e => bar.appendChild(e));
  head.after(bar);
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => chatXSearchRun(input.value, count), 250); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatXSearchStep(e.shiftKey ? 1 : -1, count); } });
  up.onclick = () => chatXSearchStep(-1, count);
  down.onclick = () => chatXSearchStep(1, count);
  x.onclick = () => chatXSearchToggle();
  setTimeout(() => { try { input.focus(); } catch (e) { /* ignore */ } }, 30);
}
async function chatXSearchRun(text, countEl) {
  const S = chatS;
  const q = String(text || '').trim().toLowerCase();
  const token = Date.now() + Math.random();
  chatXSrch = { q, hits: [], idx: -1, token };
  if (!q || !S.room) { countEl.textContent = ''; return; }
  const rs = chatRoomState(S.room);
  if (rs.more) {
    countEl.textContent = tk('chat.search.loading');
    for (let i = 0; i < 20 && rs.more; i++) { try { await chatLoadOlder(true); } catch (e) { break; } if (!chatXSrch || chatXSrch.token !== token) return; }
    await chatRenderConv();
  }
  const hits = [];
  for (const m of rs.msgs) {
    if (m.leise || m.geloescht || m.pending) continue;
    const p = await chatPlain(m);
    if (p.msg && chatXSearchText(p.msg).indexOf(q) >= 0) hits.push(m.id);
  }
  if (!chatXSrch || chatXSrch.token !== token) return;
  chatXSrch.hits = hits; chatXSrch.idx = hits.length;
  chatXSearchStep(-1, countEl);
}
function chatXSearchStep(dir, countEl) {
  const s = chatXSrch;
  if (!s) return;
  if (!s.hits.length) { countEl.textContent = s.q ? tk('chat.search.none') : ''; return; }
  s.idx = Math.max(0, Math.min(s.hits.length - 1, s.idx + dir));
  countEl.textContent = tk('chat.search.count', { n: s.idx + 1, total: s.hits.length });
  const el = document.querySelector('#chatMsgs [data-id="' + CSS.escape(String(s.hits[s.idx])) + '"]');
  if (el) { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); } el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }
}
function chatXSearchReset() { chatXSrch = null; const b = document.getElementById('chatSearch'); if (b) b.remove(); }

/* ---------------------------------------------------------------- muting */
function chatXMuted(room) {
  const o = chatS && chatS.mark ? chatS.mark[room] : null;
  return !!(o && o.m && (o.m === 1 || o.m > Date.now()));
}
function chatXMuteSheet(r) {
  const S = chatS;
  S.sheet = 'mute';
  const card = chatSheetShell(tk('chat.mute.title'));
  const mark = (S.mark && S.mark[r.id]) || {};
  const muted = chatXMuted(r.id);
  card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.mute.help')));
  if (muted) {
    let when = tk('chat.mute.forever');
    if (mark.m !== 1) { try { when = new Date(mark.m).toLocaleString(chatLocale(), { weekday: 'short', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }); } catch (e) { when = ''; } }
    card.appendChild(chatEl('div', 'chat-sheet-note', '🔕 ' + tk('chat.mute.until', { time: when })));
  }
  const act = (label, value) => { const b = chatEl('button', 'chat-sheet-act', label); b.type = 'button'; b.onclick = () => { chatCloseSheet(); chatSetMark(r.id, { m: value }); }; card.appendChild(b); };
  if (muted) act('🔔 ' + tk('chat.unmute'), 0);
  act('🔕 ' + tk('chat.mute.h8'), Date.now() + 8 * 3600 * 1000);
  act('🔕 ' + tk('chat.mute.w1'), Date.now() + 7 * 86400 * 1000);
  act('🔕 ' + tk('chat.mute.forever'), 1);
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

/* ---------------------------------------------------------------- mode: end-to-end encryption on / off (info sheet) */
function chatXModeUi(card) {
  const S = chatS;
  card.appendChild(chatEl('h4', 'chat-sheet-sub', tk('chat.mode.title')));
  const rec = chatEl('label', 'chat-switch');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !S.plainMode; cb.disabled = !S.isAdmin;
  rec.appendChild(cb);
  const lab = chatEl('span', 'chat-switch-text');
  lab.appendChild(chatEl('span', 'chat-switch-title', tk('chat.mode.e2ee')));
  lab.appendChild(chatEl('span', 'chat-switch-help', S.plainMode ? tk('chat.mode.plainHelp') : tk('chat.mode.e2eeHelp')));
  rec.appendChild(lab); card.appendChild(rec);
  if (!S.isAdmin) card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.mode.adminOnly')));
  cb.onchange = async () => {
    const wantPlain = !cb.checked;
    if (!confirm(wantPlain ? tk('chat.mode.offConfirm') : tk('chat.mode.onConfirm'))) { cb.checked = !cb.checked; return; }
    try {
      await chatPost('modus', { klartext: wantPlain });
      chatCloseSheet();
      await chatLoadRoster();
      chatRender();
    } catch (e) { cb.checked = !cb.checked; chatToast(tk('chat.error.send')); }
  };
}

/* ---------------------------------------------------------------- dissolve a group */
async function chatXDissolve(g) {
  const S = chatS;
  try { await chatPost('gruppe-aufloesen', { id: g.id }); } catch (e) { chatToast(tk('chat.error.send')); return; }
  S.groups = S.groups.filter(x => x.id !== g.id);
  if (typeof chatPicCache !== 'undefined') chatPicCache.delete(g.raum);
  if (S.room === g.raum) { S.room = ''; S.reply = null; S.ref = null; }
  chatCloseSheet();
  chatRender();
  chatLoadOverview();
}

(window.PINN_PARTS = window.PINN_PARTS || []).push('chatextras');
