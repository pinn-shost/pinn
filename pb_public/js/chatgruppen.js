/* pinn. – Chat: groups, pinned chats, "mark as unread", swipe actions, chat pictures (js/chatgruppen.js, since 1.127.3)
   Part of the chat (js/chat.js calls the functions chatG... and chatPic... of this file; everything here only runs on the chat page).
   Contents:
   - own groups: the person making a group picks the members, they are in the group right away (no invitation). Room "gr:<id>".
     Creator and admins change name and members, everybody can leave. People added later only read newer messages.
   - pinned chats and "marked as unread" (kept on the server per profile, so they are the same on every device); the list is sorted
     pinned first, then by the newest message sent or received
   - swipe a row to the left: two buttons (pin / unpin, mark as read / unread); on a computer the "..." button or a right click opens the same
   - pictures of the family chat (admins) and of groups (creator, admins): cropped round like the profile pictures (readAvatarPhotoFile).
     The picture itself is not end-to-end encrypted (the server stores it); messages are. */

const CHAT_SWIPE_W = 150;          // width of the two buttons behind a swiped row
const chatPicCache = new Map();    // room -> { v: version, url: data URL }
const chatPicLoading = new Set();

/* ---------------------------------------------------------------- pictures */
function chatPicUrl(room) { const c = chatPicCache.get(room); return c ? c.url : ''; }
// After the list of people came in: load the pictures that are new or changed, forget the ones that are gone
function chatPicsSync() {
  const S = chatS;
  if (!S) return;
  const known = S.bilder || {};
  let changed = false;
  Array.from(chatPicCache.keys()).forEach(r => { if (!(r in known)) { chatPicCache.delete(r); changed = true; } });
  Object.keys(known).forEach(room => {
    const c = chatPicCache.get(room);
    if ((c && c.v === known[room]) || chatPicLoading.has(room)) return;
    chatPicLoading.add(room);
    chatApi('bild?raum=' + encodeURIComponent(room)).then(d => {
      if (d && typeof d.bild === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(d.bild)) chatPicCache.set(room, { v: Number(d.zeit) || known[room], url: d.bild });
    }).catch(() => { /* offline: try again with the next list of people */ }).then(() => { chatPicLoading.delete(room); chatGRefresh(); });
  });
  if (changed) chatGRefresh();
}
// Redraw what shows pictures / names without rebuilding the page (that would throw away a message being typed)
function chatGRefresh() {
  const S = chatS;
  if (!S || S.phase !== 'ready' || typeof currentView === 'undefined' || currentView !== 'chat') return;
  chatRenderList();
  const head = document.querySelector('#chatRoot .chat-conv-head');
  const room = S.room ? chatRoomById(S.room) : null;
  if (!head || !room) return;
  const old = head.querySelector('[data-head-av]');
  if (old) old.replaceWith(chatHeadAvatar(room));
  const nm = head.querySelector('.chat-conv-name');
  if (nm) nm.textContent = room.title;
}
function chatGCanEdit(g) { return !!g && !!chatS && (g.ersteller === chatS.uid || !!chatS.isAdmin); }
function chatGCanPicture(room) {
  if (!room || !chatS) return false;
  if (room.id === 'familie') return !!chatS.isAdmin;
  return !!room.isGroup && chatGCanEdit(room.g);
}
async function chatGSetPicture(room, data) {
  const S = chatS;
  const d = await chatPost('bild', { raum: room, bild: data || null });
  if (data) { chatPicCache.set(room, { v: Number(d.zeit) || Date.now(), url: data }); S.bilder[room] = Number(d.zeit) || Date.now(); }
  else { chatPicCache.delete(room); delete S.bilder[room]; }
  chatGRefresh();
}
// One hidden file field is reused, so no field is left behind when the choice is cancelled
function chatGPickPicture(room) {
  let inp = document.getElementById('chatPicInput');
  if (!inp) {
    inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'chatPicInput'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      const target = inp.dataset.room;
      inp.value = '';
      if (!f || !target) return;
      try {
        const data = await readAvatarPhotoFile(f); // choose + crop round + shrink, like the profile picture
        await chatGSetPicture(target, data);
      } catch (err) { if (!(err && err.cancelled)) chatToast(tk('chat.error.send')); }
    });
    document.body.appendChild(inp);
  }
  inp.dataset.room = room;
  inp.click();
}
function chatGPictureMenu(roomId) {
  const S = chatS;
  const room = chatRoomById(roomId);
  if (!room || !chatGCanPicture(room)) return;
  S.sheet = 'picture';
  const card = chatSheetShell(tk('chat.pic.title'));
  const big = chatEl('div', 'chat-sheet-pic'); big.appendChild(chatRoomAvatar(room, 84)); card.appendChild(big);
  const act = (label, fn, danger) => { const b = chatEl('button', 'chat-sheet-act' + (danger ? ' danger' : ''), label); b.type = 'button'; b.onclick = () => { chatCloseSheet(); fn(); }; card.appendChild(b); };
  act('🖼 ' + tk('chat.pic.change'), () => chatGPickPicture(roomId));
  if (chatPicUrl(roomId)) act('🗑 ' + tk('chat.pic.remove'), async () => { try { await chatGSetPicture(roomId, null); } catch (e) { chatToast(tk('chat.error.send')); } }, true);
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

/* ---------------------------------------------------------------- pinned / unread marks */
async function chatSetMark(room, patch) {
  const S = chatS;
  try {
    const d = await chatPost('raum', Object.assign({ raum: room }, patch));
    S.mark = d.markierungen && typeof d.markierungen === 'object' ? d.markierungen : {};
  } catch (e) { chatToast(tk('chat.error.send')); return false; }
  chatUpdateBadge();
  chatRenderList();
  return true;
}
function chatGTogglePin(r) {
  chatS.swipeOpen = '';
  return chatSetMark(r.id, { p: !r.pinned });
}
// Unread (new messages or marked by hand) -> mark as read; otherwise mark as unread (the chat is left first if it is open)
async function chatGToggleRead(r) {
  const S = chatS;
  S.swipeOpen = '';
  if (r.unread > 0 || r.flagged) {
    if (r.unread > 0) { try { await chatPost('read', { raum: r.id }); } catch (e) { chatToast(tk('chat.error.send')); return; } }
    if (r.flagged) await chatSetMark(r.id, { u: false });
    await chatLoadOverview();
  } else {
    if (S.room === r.id) { S.room = ''; S.reply = null; S.ref = null; chatRender(); }
    await chatSetMark(r.id, { u: true });
  }
}
// The same two actions in a sheet (computer: "..." button or right click)
function chatGRoomMenu(r) {
  const S = chatS;
  S.sheet = 'menu';
  const card = chatSheetShell(r.title);
  const unread = r.unread > 0 || r.flagged;
  const act = (label, fn) => { const b = chatEl('button', 'chat-sheet-act', label); b.type = 'button'; b.onclick = () => { chatCloseSheet(); fn(); }; card.appendChild(b); };
  act('📌 ' + (r.pinned ? tk('chat.unpin') : tk('chat.pin')), () => chatGTogglePin(r));
  act((unread ? '✓ ' + tk('chat.markRead') : '● ' + tk('chat.markUnread')), () => chatGToggleRead(r));
  if (typeof chatXMuteSheet === 'function') act((r.muted ? '🔕 ' : '🔔 ') + tk('chat.mute.title'), () => chatXMuteSheet(r));
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

/* ---------------------------------------------------------------- list rows with swipe actions */
function chatGApplySwipe() {
  const S = chatS;
  document.querySelectorAll('#chatItems .chat-swipe').forEach(w => { if (w._place) w._place(S && S.swipeOpen === w.dataset.room ? -CHAT_SWIPE_W : 0, true); });
}
function chatGRow(r) {
  const S = chatS;
  const wrap = chatEl('div', 'chat-swipe'); wrap.dataset.room = r.id;
  const acts = chatEl('div', 'chat-swipe-acts');
  const unread = r.unread > 0 || r.flagged;
  const bPin = chatEl('button', 'chat-swipe-btn pin', r.pinned ? tk('chat.unpin') : tk('chat.pin')); bPin.type = 'button';
  const bRead = chatEl('button', 'chat-swipe-btn read', unread ? tk('chat.markRead') : tk('chat.markUnread')); bRead.type = 'button';
  bPin.onclick = (e) => { e.stopPropagation(); chatGTogglePin(r); };
  bRead.onclick = (e) => { e.stopPropagation(); chatGToggleRead(r); };
  acts.appendChild(bPin); acts.appendChild(bRead);
  wrap.appendChild(acts);
  const row = chatListRow(r);
  row.classList.add('chat-swipe-row');
  let hideTimer = 0;
  const place = (x, anim) => {
    clearTimeout(hideTimer);
    row.style.transition = anim ? 'transform 0.2s ease' : 'none';
    row.style.transform = x ? 'translateX(' + x + 'px)' : '';
    if (x) acts.style.visibility = 'visible';
    else if (anim) hideTimer = setTimeout(() => { acts.style.visibility = ''; }, 220);
    else acts.style.visibility = '';
  };
  wrap._place = place;
  if (S.swipeOpen === r.id) place(-CHAT_SWIPE_W, false);
  let st = null, swiped = false;
  // touch and pen: swipe to the left; the mouse uses the "..." button (a drag with the mouse would fight with selecting text)
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    st = { x: e.clientX, y: e.clientY, base: S.swipeOpen === r.id ? -CHAT_SWIPE_W : 0, mode: '', id: e.pointerId, pos: 0 };
  });
  row.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      st.mode = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (st.mode === 'h') {
        S.drag = true;
        try { row.setPointerCapture(e.pointerId); } catch (err) { /* not supported: the swipe still works on this row */ }
        if (S.swipeOpen && S.swipeOpen !== r.id) { S.swipeOpen = ''; chatGApplySwipe(); }
      }
    }
    if (st.mode !== 'h') return;
    st.pos = Math.max(-CHAT_SWIPE_W - 24, Math.min(0, st.base + dx));
    place(st.pos, false);
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const was = st; st = null;
    if (was.mode !== 'h') return;
    S.drag = false;
    const open = was.pos < -CHAT_SWIPE_W / 2;
    S.swipeOpen = open ? r.id : '';
    swiped = true; setTimeout(() => { swiped = false; }, 80); // the tap that ends a swipe must not open the chat
    place(open ? -CHAT_SWIPE_W : 0, true);
    if (S.listDirty) setTimeout(chatRenderList, 260);
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.onclick = () => {
    if (swiped) return;
    if (S.swipeOpen) { S.swipeOpen = ''; chatGApplySwipe(); return; } // a tap closes open actions first
    chatOpenRoom(r.id);
  };
  wrap.appendChild(row);
  const more = chatEl('button', 'chat-swipe-more', '⋯'); more.type = 'button'; more.setAttribute('aria-label', tk('chat.more')); more.title = tk('chat.more');
  more.onclick = (e) => { e.stopPropagation(); chatGRoomMenu(r); };
  wrap.appendChild(more);
  wrap.addEventListener('contextmenu', (e) => { e.preventDefault(); chatGRoomMenu(r); });
  return wrap;
}
// A tap anywhere else closes swiped-open actions
document.addEventListener('click', (e) => {
  if (chatS && chatS.swipeOpen && !(e.target.closest && e.target.closest('.chat-swipe'))) { chatS.swipeOpen = ''; chatGApplySwipe(); }
});

/* ---------------------------------------------------------------- groups */
// Make a group (g = null) or change name / members of g. Everybody chosen is in the group right away.
function chatGEditSheet(g) {
  const S = chatS;
  S.sheet = 'groupedit';
  const card = chatSheetShell(g ? tk('chat.group.edit') : tk('chat.group.new'));
  const name = document.createElement('input');
  name.type = 'text'; name.className = 'chat-group-name'; name.maxLength = 40; name.autocomplete = 'off';
  name.value = g ? g.name : ''; name.placeholder = tk('chat.group.name'); name.setAttribute('aria-label', tk('chat.group.name'));
  card.appendChild(name);
  card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.group.pickMembers')));
  const chosen = new Set(g ? g.mitglieder.filter(id => id !== S.uid) : []);
  const list = chatEl('div', 'chat-group-pick');
  S.roster.filter(p => p.id !== S.uid).sort((a, b) => chatName(a).localeCompare(chatName(b))).forEach(p => {
    const row = chatEl('label', 'chat-group-row');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = chosen.has(p.id);
    cb.onchange = () => { if (cb.checked) chosen.add(p.id); else chosen.delete(p.id); const e = card.querySelector('.chat-group-err'); if (e) e.textContent = ''; };
    row.appendChild(cb);
    row.appendChild(chatAvatar(p, false, 32));
    row.appendChild(chatEl('span', 'chat-group-name-txt', chatName(p)));
    if (!p.oeffentlich) row.appendChild(chatEl('span', 'chat-group-tag', tk('chat.info.notSetUp')));
    list.appendChild(row);
  });
  card.appendChild(list);
  if (g) card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.group.addHint')));
  const err = chatEl('div', 'chat-sheet-note chat-group-err');
  card.appendChild(err);
  name.addEventListener('input', () => { err.textContent = ''; });
  const save = chatEl('button', 'chat-sheet-act chat-sheet-primary', g ? tk('chat.group.save') : tk('chat.group.create')); save.type = 'button';
  save.onclick = async () => {
    const nm = name.value.replace(/\s+/g, ' ').trim();
    if (!nm || !chosen.size) { err.textContent = tk('chat.group.invalid'); return; }
    save.disabled = true; err.textContent = '';
    try {
      const d = await chatPost('gruppe', { id: g ? g.id : '', name: nm, mitglieder: Array.from(chosen) });
      const grp = d.gruppe;
      const i = S.groups.findIndex(x => x.id === grp.id);
      if (i >= 0) S.groups[i] = grp; else S.groups.push(grp);
      chatCloseSheet();
      if (g) chatGRefresh(); else chatOpenRoom(grp.raum);
    } catch (e) { save.disabled = false; err.textContent = tk('chat.group.invalid'); }
  };
  card.appendChild(save);
  const cancel = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); cancel.type = 'button'; cancel.onclick = chatCloseSheet; card.appendChild(cancel);
  setTimeout(() => { if (!g) { try { name.focus(); } catch (e) { /* ignore */ } } }, 50);
}
// Info about a group: members, change (creator / admins), safety numbers, leave
function chatGInfoSheet(roomId) {
  const S = chatS;
  const g = S.groups.find(x => x.raum === roomId);
  if (!g) return;
  S.sheet = 'group';
  const card = chatSheetShell(g.name);
  const big = chatEl('div', 'chat-sheet-pic'); big.appendChild(chatRoomAvatar({ id: roomId, isGroup: true, group: true }, 72)); card.appendChild(big);
  card.appendChild(chatEl('h4', 'chat-sheet-sub', tk('chat.info.members')));
  S.roster.filter(p => g.mitglieder.indexOf(p.id) >= 0).sort((a, b) => chatName(a).localeCompare(chatName(b))).forEach(p => {
    const row = chatEl('div', 'chat-num-row');
    row.appendChild(chatAvatar(p, false, 32));
    const mid = chatEl('div', 'chat-num-mid');
    mid.appendChild(chatEl('div', 'chat-num-name', p.id === S.uid ? chatName(p) + ' (' + tk('chat.you') + ')' : chatName(p)));
    if (!p.oeffentlich) mid.appendChild(chatEl('div', 'chat-group-tag', tk('chat.info.notSetUp')));
    row.appendChild(mid); card.appendChild(row);
  });
  const act = (label, fn, danger) => { const b = chatEl('button', 'chat-sheet-act' + (danger ? ' danger' : ''), label); b.type = 'button'; b.onclick = fn; card.appendChild(b); };
  if (chatGCanEdit(g)) {
    act('✏️ ' + tk('chat.group.edit'), () => { chatCloseSheet(); chatGEditSheet(g); });
    act('🖼 ' + tk('chat.pic.change'), () => { chatCloseSheet(); chatGPickPicture(roomId); });
  }
  act('🛡 ' + tk('chat.info.title'), () => { S.sheet = 'info'; chatRenderSheet(); });
  if (typeof chatXMuteSheet === 'function') act((chatXMuted(roomId) ? '🔕 ' : '🔔 ') + tk('chat.mute.title'), () => { chatCloseSheet(); chatXMuteSheet({ id: roomId, title: g.name }); });
  act('🚪 ' + tk('chat.group.leave'), () => { if (confirm(tk('chat.group.leaveConfirm'))) chatGLeave(g); }, true);
  if (chatGCanEdit(g) && typeof chatXDissolve === 'function') act('🗑 ' + tk('chat.group.dissolve'), () => { if (confirm(tk('chat.group.dissolveConfirm', { name: g.name }))) chatXDissolve(g); }, true);
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}
async function chatGLeave(g) {
  const S = chatS;
  try { await chatPost('gruppe-verlassen', { id: g.id }); } catch (e) { chatToast(tk('chat.error.send')); return; }
  S.groups = S.groups.filter(x => x.id !== g.id);
  chatPicCache.delete(g.raum);
  if (S.room === g.raum) { S.room = ''; S.reply = null; S.ref = null; }
  chatCloseSheet();
  chatRender();
  chatLoadOverview();
}

(window.PINN_PARTS = window.PINN_PARTS || []).push('chatgruppen');
