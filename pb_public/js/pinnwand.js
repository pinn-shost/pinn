/* pinn. – js/pinnwand.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded right after the inline script and before js/listen.js, js/familie.js, js/hinweise.js and
   js/ausblick.js (ausblick.js stays last and starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.45.0, only the comments were translated):
   - Pinboard – notes, lists, photos, polls, thank-you notes, countdowns; archive; moving notes;
     the overview tile; opening a note from a push message (pw…, PW_…, renderPinboard,
     openPinboardEditor, pwAfterBoot)
   index.html only calls these functions later (when the user acts or from bootApp), never while
   it is still loading – that is why this file may come after the inline script.
   The child lock (wrapEditorsForChildLock in index.html) guards openPinboardEditor only after all
   files are loaded (DOMContentLoaded), so it also finds the function in this file. */

/* ==========================================================
   Pinboard
   ----------------------------------------------------------
   - The notes are stored compactly in the family data (key "pinboard") and are synced between the
     devices like everything else - they can be created and edited completely offline. Lists,
     reactions, votes and replies are merged entry by entry, so simultaneous changes on two devices
     are not lost.
   - Note types: note, list (checkable), photo, poll, thank-you (to a family member), countdown.
     Every note can be addressed to specific members, pinned, marked as important, given a push
     reminder and taken down automatically (archive).
   - Photos are stored as protected files in the collection "pinnwand_bilder". Without a connection a
     photo is queued on the device (IndexedDB) and uploaded as soon as the NAS is reachable again.
     Photos that have been viewed stay in the device storage (cache) and are therefore also visible
     offline.
   - Push messages are sent by the server (pb_hooks/pinn-pinnwand.js) after saving - controlled via the
     personal settings under Settings → Notifications → Pinboard.
   - "New" applies per profile and device: everything that was added since the pinboard was last opened.
   - Taken-down/expired notes stay in the archive for 30 days and are then deleted.
   ========================================================== */
const PW_PHOTO_COLLECTION = 'pinnwand_bilder';
const PW_COLORS = [
  { id: 'gelb', c: '#FFF4B8', get label() { return tk('board.color.gelb'); } },
  { id: 'rosa', c: '#FFD9E2', get label() { return tk('board.color.rosa'); } },
  { id: 'mint', c: '#D3F2E3', get label() { return tk('board.color.mint'); } },
  { id: 'himmel', c: '#D5E9FF', get label() { return tk('board.color.himmel'); } },
  { id: 'lavendel', c: '#E7DEFF', get label() { return tk('board.color.lavendel'); } },
  { id: 'pfirsich', c: '#FFE0C4', get label() { return tk('board.color.pfirsich'); } },
  { id: 'weiss', c: '#FFFFFF', get label() { return tk('board.color.weiss'); } },
];
const PW_TYPES = [
  { id: 'note', icon: '📝', get label() { return tk('board.type.note'); }, color: 'gelb' },
  { id: 'list', icon: '✅', get label() { return tk('board.type.list'); }, color: 'mint' },
  { id: 'photo', icon: '📷', get label() { return tk('board.type.photo'); }, color: 'weiss' },
  { id: 'poll', icon: '📊', get label() { return tk('board.type.poll'); }, color: 'himmel' },
  { id: 'kudos', icon: '💛', get label() { return tk('board.type.kudos'); }, color: 'gelb' },
  { id: 'countdown', icon: '⏳', get label() { return tk('board.type.countdown'); }, color: 'lavendel' },
];
const PW_REACTIONS = ['❤️', '👍', '😂', '😮', '🙏', '🎉'];
const PW_FILTERS = [
  { id: 'alle', get label() { return tk('board.filter.alle'); } },
  { id: 'mich', get label() { return tk('board.filter.mich'); } },
  { id: 'wichtig', get label() { return tk('board.filter.wichtig'); } },
  { id: 'listen', get label() { return tk('board.filter.listen'); } },
  { id: 'umfragen', get label() { return tk('board.filter.umfragen'); } },
  { id: 'fotos', get label() { return tk('board.filter.fotos'); } },
  { id: 'danke', get label() { return tk('board.filter.danke'); } },
  { id: 'archiv', get label() { return tk('board.filter.archiv'); } },
];
const PW_ARCHIVE_KEEP_DAYS = 30;
const PW_BOARD_ITEM_LIMIT = 8;
const LS_PW_SEEN_PREFIX = 'pinn.pinnwand.gesehen.';
const PW_IDB_NAME = 'pinn-pinnwand';
const PW_IDB_STORE = 'fotos';
const PW_CACHE_NAME = 'pinn-pinnwand-fotos';

let pinboard = [];
let pwFilter = 'alle';
let pwEditingId = null;
let pwDraft = null;
let pwDetailId = null;
let pwSeenAt = null;
let pwSeenFor = '';
let pwSeenTimer = null;
const pwRenderedIds = new Set();
let pwBoardRenderedOnce = false;
let pwMaintenanceDone = false;

/* ---------- Who am I / who is this? ---------- */
function pwMyKeys() {
  const out = [];
  const m = currentMember();
  const u = currentUser();
  if (m) out.push(m.id);
  if (u) out.push('u:' + u.id);
  return out;
}
function pwMyKey() { return pwMyKeys()[0] || ''; }
function pwIsMe(key) { return !!key && pwMyKeys().includes(String(key)); }
function pwIsMine(n) {
  const u = currentUser();
  return !!n && ((u && n.authorUser === u.id) || pwIsMe(n.author));
}
function pwIsCommentMine(c) {
  const u = currentUser();
  return !!c && ((u && c.authorUser === u.id) || pwIsMe(c.author));
}
function pwCanEdit(n) { return pwIsMine(n) || isCurrentUserAdmin(); }
function pwAuthorKey(x) { return x.author || (x.authorUser ? 'u:' + x.authorUser : ''); }
// Name and member combined into one <who> key (member ID or "u:<profile ID>")
function pwWho(key, fallback) {
  const k = String(key || '');
  const m = k && !k.startsWith('u:') ? memberById(k) : null;
  if (m) return { name: m.name || memberLabel(m), m };
  if (k.startsWith('u:')) {
    const p = familyProfiles.find(x => x.id === k.slice(2));
    if (p) {
      const pm = p.mitglied ? memberById(p.mitglied) : null;
      if (pm) return { name: pm.name, m: pm };
      return { name: p.username || fallback || tk('lists.someone'), m: null };
    }
  }
  return { name: fallback || tk('lists.someone'), m: null };
}
function pwAvatar(key, size, fallbackName) {
  const w = pwWho(key, fallbackName);
  const cls = 'pw-ava' + (size ? ' ' + size : '');
  if (w.m) return `<span class="${cls}" style="border-color:${memberBorderColor(w.m) === 'transparent' ? 'rgba(255,255,255,0.8)' : memberBorderColor(w.m)}">${memberAvatarInnerHTML(w.m)}</span>`;
  const initial = (w.name || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="${cls}"><span class="flex items-center justify-center w-full h-full text-white text-xs font-semibold" style="background:#9A9A92">${escapeHtml(initial)}</span></span>`;
}

/* ---------- Date & text ---------- */
function pwToday() { return isoDate(new Date()); }
function pwIsIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function pwIsArchived(n, today) {
  if (!n) return true;
  const t = today || pwToday();
  if (n.archived) return true;
  if (pwIsIso(n.expires) && n.expires < t) return true;
  if (n.type === 'countdown' && pwIsIso(n.date) && n.date < t) return true;
  return false;
}
function pwDaysBetween(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00'), b = new Date(toIso + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
function pwAgo(ms) {
  const t = Number(ms) || 0;
  if (!t) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return tk('devices.justNow');
  if (diff < 3600000) return tk('board.minAgo', { n: Math.floor(diff / 60000) });
  const d = new Date(t);
  const days = pwDaysBetween(isoDate(d), pwToday());
  if (days === 0) return tk('board.hrAgo', { n: Math.max(1, Math.floor(diff / 3600000)) });
  if (days === 1) return tk('lists.when.yesterday');
  if (days < 7) return d.toLocaleDateString(sysLocale(), { weekday: 'long' });
  return d.toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit', year: days > 300 ? '2-digit' : undefined });
}
function pwFmtDay(iso) {
  if (!pwIsIso(iso)) return '';
  const diff = pwDaysBetween(pwToday(), iso);
  if (diff === 0) return tk('bell.today');
  if (diff === 1) return tk('bell.tomorrow');
  return new Date(iso + 'T00:00:00').toLocaleDateString(sysLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function pwFmtRemind(ms) {
  const d = new Date(Number(ms) || 0);
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString(sysLocale(), { hour: '2-digit', minute: '2-digit' });
  return `${pwFmtDay(isoDate(d))} ${time}`;
}
function pwLinkify(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"&])/g, '<a href="$1" target="_blank" rel="noopener noreferrer" data-pw-link="1">$1</a>');
}
function pwId(prefix) { return (prefix || 'pw') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pwColor(n) { const c = PW_COLORS.find(x => x.id === (n && n.color)); return c ? c.c : PW_COLORS[0].c; }
function pwRot(id) {
  let h = 0;
  String(id || '').split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) | 0; });
  return ((Math.abs(h) % 7) - 3) * 0.55;
}
function pwType(id) { return PW_TYPES.find(t => t.id === id) || PW_TYPES[0]; }
function pwNote(id) { return pinboard.find(n => n && n.id === id) || null; }

/* ---------- Normalizing (on load) ---------- */
function normalizePinboard(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(n => n && typeof n.id === 'string' && n.id).map(n => ({
    ...n,
    type: PW_TYPES.some(t => t.id === n.type) ? n.type : 'note',
    to: Array.isArray(n.to) ? n.to.filter(x => typeof x === 'string' && x) : [],
    items: Array.isArray(n.items) ? n.items.filter(i => i && i.id) : undefined,
    options: Array.isArray(n.options) ? n.options.filter(o => o && o.id) : undefined,
    comments: Array.isArray(n.comments) ? n.comments.filter(c => c && c.id) : [],
    reactions: (n.reactions && typeof n.reactions === 'object' && !Array.isArray(n.reactions)) ? n.reactions : {},
    votes: (n.votes && typeof n.votes === 'object' && !Array.isArray(n.votes)) ? n.votes : undefined,
    doneBy: (n.doneBy && typeof n.doneBy === 'object' && !Array.isArray(n.doneBy)) ? n.doneBy : {},
  })).map(n => {
    // Do not carry undefined fields along (otherwise the merge sees changes where there are none)
    Object.keys(n).forEach(k => { if (n[k] === undefined) delete n[k]; });
    return n;
  });
}

/* ---------- Read / new ---------- */
function pwSeenKey() { const u = currentUser(); return u ? LS_PW_SEEN_PREFIX + u.id : ''; }
function pwGetSeen() {
  const u = currentUser();
  const uid = u ? u.id : '';
  if (pwSeenAt === null || pwSeenFor !== uid) {
    pwSeenFor = uid;
    let v = 0;
    try { v = Number(localStorage.getItem(pwSeenKey())) || 0; } catch (e) { v = 0; }
    if (!v) {
      v = Date.now();
      try { localStorage.setItem(pwSeenKey(), String(v)); } catch (e) { /* ignore */ }
    }
    pwSeenAt = v;
  }
  return pwSeenAt;
}
function pwMarkSeen() {
  pwSeenAt = Date.now();
  pwSeenFor = (currentUser() && currentUser().id) || '';
  try { localStorage.setItem(pwSeenKey(), String(pwSeenAt)); } catch (e) { /* ignore */ }
  pwUpdateBadges();
  try { renderBoardTile(); } catch (e) { /* ignore */ }
}
function pwScheduleMarkSeen() {
  clearTimeout(pwSeenTimer);
  pwSeenTimer = setTimeout(() => {
    if (currentView === 'pinnwand' && document.visibilityState === 'visible') pwMarkSeen();
  }, 2500);
}
function pwIsNew(n) { return !pwIsMine(n) && (Number(n.createdAt) || 0) > pwGetSeen(); }
function pwHasNewComments(n) {
  const seen = pwGetSeen();
  return (n.comments || []).some(c => !pwIsCommentMine(c) && (Number(c.at) || 0) > seen);
}
function pwIsForMe(n) { return (n.to || []).some(pwIsMe); }
function pwIsDoneByMe(n) { return pwMyKeys().some(k => n.doneBy && n.doneBy[k]); }
function pwUnreadCount() {
  if (!isViewAllowed('pinnwand')) return 0;
  const today = pwToday();
  return pinboard.filter(n => !pwIsArchived(n, today) && (pwIsNew(n) || pwHasNewComments(n))).length;
}
function pwUpdateBadges() {
  const count = pwUnreadCount();
  const nav = document.getElementById('navPinboardBadge');
  if (nav) {
    nav.textContent = count > 9 ? '9+' : String(count);
    nav.classList.toggle('hidden', !count);
  }
  document.querySelectorAll('.bottom-tab-item[data-view="pinnwand"]').forEach(btn => {
    let dot = btn.querySelector('.pw-tab-dot');
    if (!count) { if (dot) dot.remove(); return; }
    if (!dot) { dot = document.createElement('span'); dot.className = 'pw-tab-dot'; btn.appendChild(dot); }
    dot.textContent = count > 9 ? '9+' : String(count);
  });
}

/* ---------- Filtering & sorting ---------- */
function pwMatchesFilter(n, f) {
  if (f === 'mich') return pwIsForMe(n);
  if (f === 'wichtig') return !!n.important;
  if (f === 'listen') return n.type === 'list';
  if (f === 'umfragen') return n.type === 'poll';
  if (f === 'fotos') return n.type === 'photo';
  if (f === 'danke') return n.type === 'kudos';
  return true;
}
function pwSortActive(a, b) {
  // Pinned notes first, then the order set by hand ("pos") – without a position of its own
  // a note counts as "newest first", so new notes always appear at the top.
  return (!!b.pinned - !!a.pinned) || (pwEffPos(a) - pwEffPos(b)) || ((Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}
function pwVisibleNotes() {
  const today = pwToday();
  if (pwFilter === 'archiv') {
    return pinboard.filter(n => pwIsArchived(n, today))
      .sort((a, b) => (Number(b.archivedAt || b.updatedAt || b.createdAt) || 0) - (Number(a.archivedAt || a.updatedAt || a.createdAt) || 0));
  }
  return pinboard.filter(n => !pwIsArchived(n, today) && pwMatchesFilter(n, pwFilter)).sort(pwSortActive);
}

/* ---------- Note as HTML ---------- */
function pwHeadHtml(n) {
  const key = pwAuthorKey(n);
  const w = pwWho(key, n.authorName);
  const who = n.type === 'kudos' ? escapeHtml(tk('board.fromName', { name: w.name })) : escapeHtml(w.name);
  return `<div class="pw-head">${pwAvatar(key, 'sm', n.authorName)}<span class="pw-who">${who}</span><span class="pw-when">${escapeHtml(pwAgo(n.createdAt))}</span></div>`;
}
function pwToHtml(n) {
  if (!n.to || !n.to.length || n.type === 'kudos') return '';
  return `<div class="pw-to">${n.to.map(k => {
    const w = pwWho(k);
    const done = !!(n.doneBy && n.doneBy[k]);
    return `<span class="pw-to-chip${pwIsMe(k) ? ' me' : ''}${done ? ' done' : ''}" title="${done ? escapeHtml(tk('lists.type.done')) : ''}">${pwAvatar(k, 'sm')}${pwIsMe(k) ? escapeHtml(tk('board.forYou')) : escapeHtml(tk('board.forName', { name: w.name }))}${done ? ' ✓' : ''}</span>`;
  }).join('')}</div>`;
}
function pwPhotoInnerHtml(n) {
  const p = n.photo || null;
  const ready = p && ((p.rec && pwPhotoUrls.has(p.rec)) || (p.pending && pwLocalPhotoUrls.has(p.pending)));
  if (ready) {
    const url = p.rec ? pwPhotoUrls.get(p.rec) : pwLocalPhotoUrls.get(p.pending);
    return { html: `<img src="${url}" alt="" />`, loaded: true };
  }
  if (p && p.pending) return { html: ('<div class="pw-photo-wait">' + tk('board.uploadingPhoto') + '</div>'), loaded: false };
  if (p && p.rec) return { html: ('<div class="pw-photo-wait">' + tk('board.loadingPhoto') + '</div>'), loaded: false };
  return { html: ('<div class="pw-photo-wait">' + tk('board.noPhoto') + '</div>'), loaded: false };
}
function pwBodyHtml(n, mode) {
  const board = mode === 'board';
  const archived = pwIsArchived(n);
  const title = n.title ? `<div class="pw-title">${escapeHtml(n.title)}</div>` : '';
  if (n.type === 'list') {
    const items = n.items || [];
    const done = items.filter(i => i.done).length;
    const shown = board ? items.slice(0, PW_BOARD_ITEM_LIMIT) : items;
    const rows = shown.map(i => {
      const by = i.done && i.by ? pwWho(i.by).name : '';
      return `<button type="button" class="pw-item${i.done ? ' done' : ''}" data-pw-item="${escapeHtml(i.id)}" ${archived ? 'disabled' : ''}><span class="pw-box">${i.done ? '✓' : ''}</span><span class="pw-item-text">${escapeHtml(i.text)}</span>${by && !board ? `<span class="pw-item-by">${escapeHtml(by)}</span>` : ''}</button>`;
    }).join('');
    const more = board && items.length > shown.length ? `<div class="text-[11px] opacity-60 mt-1">${escapeHtml(tk('board.moreN', { n: items.length - shown.length }))}</div>` : '';
    const add = mode === 'detail' && !archived ? `<div class="pw-add-item"><input id="pwAddItemInput" type="text" maxlength="120" enterkeyhint="done" autocomplete="off" placeholder="${escapeHtml(tk('board.addItem'))}" /><button type="button" data-pw-add-item="1" aria-label="${escapeHtml(tk('common.add'))}">+</button></div>` : '';
    const pct = items.length ? Math.round(done / items.length * 100) : 0;
    return `${title || ('<div class="pw-title">' + tk('bell.word.list') + '</div>')}<div class="pw-items">${rows}</div>${more}${add}${items.length ? `<div class="pw-progress" title="${escapeHtml(tk('board.progress', { done, n: items.length }))}"><i style="width:${pct}%"></i></div><div class="text-[10px] opacity-60 mt-1">${escapeHtml(tk('board.progress', { done, n: items.length }))}${done === items.length && items.length ? ' 🎉' : ''}</div>` : ''}`;
  }
  if (n.type === 'photo') {
    const ph = pwPhotoInnerHtml(n);
    return `<div class="pw-photo"><div class="pw-photo-frame${ph.loaded ? ' is-loaded' : ''}" data-pw-photo="${escapeHtml(n.id)}">${ph.html}</div>${n.text ? `<div class="pw-photo-cap${board ? ' pw-clamp' : ''}">${pwLinkify(n.text)}</div>` : ''}</div>`;
  }
  if (n.type === 'poll') {
    const opts = n.options || [];
    const votes = n.votes || {};
    const counts = {};
    Object.keys(votes).forEach(k => { counts[votes[k]] = (counts[votes[k]] || 0) + 1; });
    const total = Object.keys(votes).filter(k => opts.some(o => o.id === votes[k])).length;
    const max = Math.max(0, ...opts.map(o => counts[o.id] || 0));
    const mine = pwMyKeys().map(k => votes[k]).find(Boolean) || '';
    const closed = !!n.closed || archived;
    const rows = opts.map(o => {
      const c = counts[o.id] || 0;
      const pct = total ? Math.round(c / total * 100) : 0;
      const voters = Object.keys(votes).filter(k => votes[k] === o.id);
      const avas = voters.slice(0, 4).map(k => pwAvatar(k, 'sm')).join('');
      return `<button type="button" class="pw-opt${mine === o.id ? ' mine' : ''}${closed && c && c === max ? ' win' : ''}" data-pw-vote="${escapeHtml(o.id)}" ${closed ? 'disabled' : ''}>
          <span class="pw-bar" style="width:${pct}%"></span>
          <span class="pw-opt-text">${escapeHtml(o.text)}</span>
          <span class="pw-opt-avas">${avas}</span>
          <span class="pw-opt-n">${c ? c : ''}</span>
        </button>`;
    }).join('');
    const meta = escapeHtml(tk('board.votesN', { n: total }) + ' · ' + tk(closed ? 'board.pollClosed' : (mine ? 'board.tapAgainUndo' : 'board.tapVote')));
    return `<div class="pw-title">${escapeHtml(n.title || tk('bell.word.poll'))}</div><div class="pw-poll">${rows}</div><div class="pw-poll-meta">${meta}</div>`;
  }
  if (n.type === 'kudos') {
    const to = n.to || [];
    const names = to.map(k => pwIsMe(k) ? tk('board.youObj') : pwWho(k).name);
    const avas = to.slice(0, 4).map(k => pwAvatar(k, to.length > 1 ? 'lg' : 'xl')).join('');
    const head = escapeHtml(pwThanksHead(to));
    return `<div class="pw-kudos-hero"><div class="pw-kudos-heart">💛</div>${avas ? `<div class="pw-kudos-avas">${avas}</div>` : ''}<div class="pw-kudos-to">${head}</div></div>${n.text ? `<div class="pw-text${board ? ' pw-clamp' : ''}">${pwLinkify(n.text)}</div>` : ''}`;
  }
  if (n.type === 'countdown') {
    const diff = pwIsIso(n.date) ? pwDaysBetween(pwToday(), n.date) : null;
    let num = '–', unit = '';
    if (diff !== null) {
      if (diff <= 0) { num = escapeHtml(tk('board.todayParty')); unit = ''; }
      else { num = String(diff); unit = escapeHtml(tk('board.daysLeftN', { n: diff })); }
    }
    const dateText = pwIsIso(n.date) ? new Date(n.date + 'T00:00:00').toLocaleDateString(sysLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    return `<div class="pw-count${diff !== null && diff <= 0 ? ' today' : ''}"><div class="pw-count-n">${num}</div>${unit ? `<div class="pw-count-u">${unit}</div>` : ''}<div class="pw-count-t">${escapeHtml(n.title || tk('bell.word.countdown'))}</div><div class="pw-count-d">${escapeHtml(dateText)}</div></div>${n.text ? `<div class="pw-text mt-2${board ? ' pw-clamp' : ''}">${pwLinkify(n.text)}</div>` : ''}`;
  }
  // Note
  const text = String(n.text || '');
  const big = !n.title && text.length <= 70 && !text.includes('\n');
  return `${title}${text ? `<div class="pw-text${big ? ' big' : ''}${board ? ' pw-clamp' : ''}">${pwLinkify(text)}</div>` : ''}`;
}
function pwJoinNames(list) {
  if (list.length <= 1) return list.join('');
  return tk('bell.namesAnd', { a: list.slice(0, -1).join(', '), b: list[list.length - 1] });
}
// Heading of a thank-you note: "Thank you!", "Thanks, Kim and Mia!" or "Thanks to everyone!"
function pwThanksHead(to) {
  to = to || [];
  if (!to.length) return tk('board.thanksEveryone');
  if (to.length === 1 && pwIsMe(to[0])) return tk('board.thanksYou');
  return tk('board.thanksNames', { names: pwJoinNames(to.map(k => pwIsMe(k) ? tk('board.youObj') : pwWho(k).name)) });
}
function pwBadgesHtml(n) {
  const out = [];
  const today = pwToday();
  if (Number(n.remindAtMs) > Date.now() && !pwIsArchived(n, today)) out.push(`<span class="pw-badge">⏰ ${escapeHtml(pwFmtRemind(n.remindAtMs))}</span>`);
  if (pwIsIso(n.expires) && !n.archived) {
    const d = pwDaysBetween(today, n.expires);
    if (d >= 0) out.push(`<span class="pw-badge${d <= 1 ? ' warn' : ''}">${tk('board.until', { date: escapeHtml(pwFmtDay(n.expires)) })}</span>`);
  }
  if (pwIsArchived(n, today)) out.push(`<span class="pw-badge">${escapeHtml(tk('board.takenDown'))}</span>`);
  return out.length ? `<div class="pw-badges">${out.join('')}</div>` : '';
}
function pwFootHtml(n, mode) {
  if (mode === 'preview') return '';
  const reactions = n.reactions || {};
  const byEmoji = {};
  Object.keys(reactions).forEach(k => { const e = reactions[k]; if (e) (byEmoji[e] = byEmoji[e] || []).push(k); });
  const myEmoji = pwMyKeys().map(k => reactions[k]).find(Boolean) || '';
  const chips = PW_REACTIONS.concat(Object.keys(byEmoji).filter(e => !PW_REACTIONS.includes(e))).filter(e => byEmoji[e]).map(e => {
    const names = byEmoji[e].map(k => pwWho(k).name).join(', ');
    return `<button type="button" class="pw-react${myEmoji === e ? ' mine' : ''}" data-pw-react-toggle="${e}" title="${escapeHtml(names)}">${e}<b>${byEmoji[e].length}</b></button>`;
  }).join('');
  const archived = pwIsArchived(n);
  const add = archived ? '' : `<button type="button" class="pw-react pw-react-add" data-pw-react-add="1" aria-label="${escapeHtml(tk('board.react'))}" title="${escapeHtml(tk('board.react'))}">+🙂</button>`;
  const addressedToMe = pwIsForMe(n) && n.type !== 'kudos' && n.type !== 'poll' && !archived;
  const done = addressedToMe ? `<button type="button" class="pw-done-btn${pwIsDoneByMe(n) ? ' is-done' : ''}" data-pw-done="1">${pwIsDoneByMe(n) ? tk('tasks.doneBtn') : tk('board.done')}</button>` : '';
  const cc = (n.comments || []).length;
  const fresh = pwHasNewComments(n);
  const comments = mode === 'board' && (cc || !archived) ? `<span class="pw-comments-n${fresh ? ' fresh' : ''}">💬${cc ? ' ' + cc : ''}${fresh ? ' •' : ''}</span>` : '';
  if (!chips && !add && !done && !comments) return '';
  return `<div class="pw-foot">${done}${chips}${add}${comments}</div>`;
}
function pwNoteHtml(n, mode) {
  const board = mode === 'board';
  const cls = ['pw-note', 't-' + (n.type || 'note')];
  if (n.pinned) cls.push('is-pinned');
  if (n.important) cls.push('is-important');
  if (pwIsArchived(n)) cls.push('is-archived');
  if (mode === 'detail') cls.push('pw-detail-note');
  if (board && pwBoardRenderedOnce && !pwRenderedIds.has(n.id)) cls.push('is-new');
  const rot = board ? pwRot(n.id) : (mode === 'detail' ? pwRot(n.id) / 2 : 0);
  const style = `--pw-c:${pwColor(n)};--pw-rot:${rot}deg`;
  const deco = n.type === 'photo' ? '<span class="pw-tape l"></span><span class="pw-tape r"></span>' : '<span class="pw-pin"></span>';
  const flag = board && pwIsNew(n) ? `<span class="pw-flag new">${escapeHtml(tk('bell.new'))}</span>` : (n.important ? `<span class="pw-flag imp">${escapeHtml(tk('board.importantFlag'))}</span>` : '');
  const attrs = board ? ' role="button" tabindex="0"' : '';
  return `<div class="${cls.join(' ')}" style="${style}" data-pw-note="${escapeHtml(n.id)}"${attrs}>${deco}${flag}${pwHeadHtml(n)}${pwToHtml(n)}${pwBodyHtml(n, mode)}${pwBadgesHtml(n)}${pwFootHtml(n, mode)}</div>`;
}

/* ---------- Page ---------- */
function renderPinboardChips() {
  const wrap = document.getElementById('pinboardChips');
  if (!wrap) return;
  const today = pwToday();
  const active = pinboard.filter(n => !pwIsArchived(n, today));
  const count = f => f === 'archiv' ? pinboard.length - active.length : (f === 'alle' ? active.length : active.filter(n => pwMatchesFilter(n, f)).length);
  wrap.innerHTML = PW_FILTERS.map(f => {
    const c = count(f.id);
    if (f.id !== 'alle' && f.id !== pwFilter && !c) return '';
    return `<button type="button" class="pw-chip${pwFilter === f.id ? ' active' : ''}" data-pw-filter="${f.id}">${f.label}${c ? ` <b>${c}</b>` : ''}</button>`;
  }).join('');
}
function renderPinboard() {
  const board = document.getElementById('pinboardBoard');
  if (!board) return;
  // Do not rebuild while a note is being dragged (or is just sliding into its place)
  if (pwArr.drag || Date.now() < pwArr.quietUntil) {
    pwArr.renderPending = true;
    if (!pwArr.drag) setTimeout(() => { if (pwArr.renderPending && !pwArr.drag) { pwArr.renderPending = false; renderPinboard(); } }, Math.max(30, pwArr.quietUntil - Date.now() + 20));
    return;
  }
  if (pwFilter === 'archiv' && pwArr.on) { pwArr.on = false; }
  renderPinboardChips();
  document.getElementById('pinboardQuick').classList.toggle('hidden', pwFilter === 'archiv');
  const list = pwVisibleNotes();
  if (!list.length) {
    const text = pwFilter === 'archiv'
      ? { art: '🗄️', h: tk('board.archiveEmpty'), p: tk('board.removedExpiredNotesEnd', { n: PW_ARCHIVE_KEEP_DAYS }) }
      : pwFilter !== 'alle'
        ? { art: '🔍', h: tk('board.nothingPinnedHereRight'), p: tk('board.noNotesFilter') }
        : { art: '📌', h: tk('board.boardStillEmpty'), p: tk('board.pinMessageShoppingPacking') };
    board.innerHTML = `<div class="pw-empty"><div class="pw-empty-art">${text.art}</div><h3 class="font-serif text-lg mb-1">${text.h}</h3><p class="text-sm text-ink/50">${text.p}</p></div>`;
    pwBoardRenderedOnce = true;
    pwArr.on = false;
    pwRenderArrangeUi();
    return;
  }
  const pinned = pwFilter !== 'archiv' ? list.filter(n => n.pinned) : [];
  const rest = pwFilter !== 'archiv' ? list.filter(n => !n.pinned) : list;
  let html = '';
  if (pinned.length && rest.length) {
    html += `<div class="pw-section-label">${tk('board.pinned')}</div><div class="pw-board">${pinned.map(n => pwNoteHtml(n, 'board')).join('')}</div><div class="pw-section-label mt-2">${tk('board.moreNotes')}</div>`;
    html += `<div class="pw-board">${rest.map(n => pwNoteHtml(n, 'board')).join('')}</div>`;
  } else {
    html += `<div class="pw-board">${list.map(n => pwNoteHtml(n, 'board')).join('')}</div>`;
  }
  if (pwFilter === 'archiv') html = `<p class="pw-section-label">${tk('board.deletedAutomaticallyAfterDays', { n: PW_ARCHIVE_KEEP_DAYS })}</p>` + html;
  board.innerHTML = html;
  list.forEach(n => pwRenderedIds.add(n.id));
  pwBoardRenderedOnce = true;
  pwHydratePhotos(board);
  pwAfterBoardRender();
  pwRenderArrangeUi();
}
function pwRerenderAll() {
  if (currentView === 'pinnwand') renderPinboard();
  if (pwDetailId) renderPinboardDetail();
  pwUpdateBadges();
  try { refreshOverviewTiles(); } catch (e) { /* ignore */ }
}

/* ---------- Changing ---------- */
function pwUpdate(id, fn, opts = {}) {
  const i = pinboard.findIndex(n => n && n.id === id);
  if (i < 0) return null;
  const n = JSON.parse(JSON.stringify(pinboard[i]));
  fn(n);
  if (!opts.silent) n.updatedAt = Date.now();
  pinboard = pinboard.map((x, j) => (j === i ? n : x));
  persistState();
  pwRerenderAll();
  return n;
}
function pwToggleItem(id, itemId) {
  const me = pwMyKey();
  pwUpdate(id, n => {
    const it = (n.items || []).find(i => i.id === itemId);
    if (!it) return;
    it.done = !it.done;
    if (it.done) { it.by = me; it.at = Date.now(); } else { delete it.by; delete it.at; }
  });
}
function pwVote(id, optId) {
  const keys = pwMyKeys();
  const me = keys[0];
  if (!me) return;
  pwUpdate(id, n => {
    if (n.closed) return;
    n.votes = n.votes || {};
    const current = keys.map(k => n.votes[k]).find(Boolean);
    keys.forEach(k => { delete n.votes[k]; });
    if (current !== optId) n.votes[me] = optId;
  });
}
function pwReact(id, emoji) {
  const keys = pwMyKeys();
  const me = keys[0];
  if (!me) return;
  pwUpdate(id, n => {
    n.reactions = n.reactions || {};
    const current = keys.map(k => n.reactions[k]).find(Boolean);
    keys.forEach(k => { delete n.reactions[k]; });
    if (current !== emoji) n.reactions[me] = emoji;
  });
}
function pwToggleDone(id) {
  const keys = pwMyKeys();
  pwUpdate(id, n => {
    n.doneBy = n.doneBy || {};
    const mine = keys.find(k => (n.to || []).includes(k)) || keys[0];
    if (keys.some(k => n.doneBy[k])) keys.forEach(k => { delete n.doneBy[k]; });
    else n.doneBy[mine] = Date.now();
  });
}
function pwAddItem(id, text) {
  const t = String(text || '').trim().slice(0, 120);
  if (!t) return;
  pwUpdate(id, n => { n.items = (n.items || []).concat([{ id: pwId('pi'), text: t, done: false }]); });
}
function pwAddComment(id, text) {
  const t = String(text || '').trim().slice(0, 1000);
  if (!t) return false;
  const u = currentUser();
  const m = currentMember();
  pwUpdate(id, n => {
    n.comments = (n.comments || []).concat([{ id: pwId('pc'), author: m ? m.id : '', authorUser: u ? u.id : '', authorName: m ? m.name : (u ? u.username || '' : ''), text: t, at: Date.now() }]);
  });
  return true;
}
function pwDeleteComment(id, cid) {
  if (!confirm(tk('board.deleteReply'))) return;
  pwUpdate(id, n => { n.comments = (n.comments || []).filter(c => c.id !== cid); });
}
function pwSetArchived(id, archived) {
  pwUpdate(id, n => {
    n.archived = !!archived;
    if (archived) n.archivedAt = Date.now();
    else {
      delete n.archivedAt;
      if (pwIsIso(n.expires) && n.expires < pwToday()) n.expires = '';
    }
  });
  finShowToast(archived ? tk('board.noteTakenDownNow') : tk('board.pinnedAgain'));
}
function pwDeleteNote(id) {
  const n = pwNote(id);
  if (!n || !confirm(tk('board.reallyDeleteNote'))) return false;
  pinboard = pinboard.filter(x => x.id !== id);
  pwDropPhoto(n.photo);
  persistState();
  if (pwDetailId === id) closePinboardDetail();
  pwRerenderAll();
  return true;
}

/* ---------- Photos ---------- */
const pwPhotoUrls = new Map();      // record ID -> object URL (thumbnail)
const pwLocalPhotoUrls = new Map(); // queued photo (not uploaded yet) -> object URL
const pwPhotoLoading = new Map();
let pwFlushRunning = false;

function pwIdb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB not available')); return; }
    const req = indexedDB.open(PW_IDB_NAME, 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore(PW_IDB_STORE); } catch (e) { /* exists */ } };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function pwIdbDo(mode, fn) {
  const db = await pwIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PW_IDB_STORE, mode);
    const store = tx.objectStore(PW_IDB_STORE);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
function pwIdbPut(key, blob) { return pwIdbDo('readwrite', s => s.put(blob, key)); }
function pwIdbGet(key) { return pwIdbDo('readonly', s => s.get(key)).catch(() => null); }
function pwIdbDel(key) { return pwIdbDo('readwrite', s => s.delete(key)).catch(() => null); }
async function pwCache() {
  try { return ('caches' in window) ? await caches.open(PW_CACHE_NAME) : null; } catch (e) { return null; }
}
function pwPhotoPath(p) { return `/api/files/${PW_PHOTO_COLLECTION}/${encodeURIComponent(p.rec)}/${encodeURIComponent(p.file)}`; }

// Thumbnail of a photo as an object URL (device storage -> server); null if (not yet) available
function pwPhotoObjectUrl(p) {
  if (!p) return Promise.resolve(null);
  if (p.pending) {
    if (pwLocalPhotoUrls.has(p.pending)) return Promise.resolve(pwLocalPhotoUrls.get(p.pending));
    return pwIdbGet(p.pending).then(blob => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      pwLocalPhotoUrls.set(p.pending, url);
      return url;
    });
  }
  if (!p.rec || !p.file) return Promise.resolve(null);
  if (pwPhotoUrls.has(p.rec)) return Promise.resolve(pwPhotoUrls.get(p.rec));
  if (pwPhotoLoading.has(p.rec)) return pwPhotoLoading.get(p.rec);
  const job = (async () => {
    const path = pwPhotoPath(p);
    const cacheKey = path + '?thumb=640x0';
    const cache = await pwCache();
    let blob = null;
    if (cache) { try { const hit = await cache.match(cacheKey); if (hit) blob = await hit.blob(); } catch (e) { blob = null; } }
    if (!blob) {
      if (!navigator.onLine) return null;
      for (let attempt = 0; attempt < 2 && !blob; attempt++) {
        const token = await ensureFinDocToken(attempt > 0);
        if (!token) return null;
        try {
          const res = await fetch(cacheKey + '&token=' + encodeURIComponent(token), { cache: 'no-store' });
          if (res.ok) blob = await res.blob();
          else if (res.status === 404) return null;
        } catch (e) { return null; }
      }
      if (!blob) return null;
      if (cache) { try { await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })); } catch (e) { /* full */ } }
    }
    const url = URL.createObjectURL(blob);
    pwPhotoUrls.set(p.rec, url);
    return url;
  })().finally(() => pwPhotoLoading.delete(p.rec));
  pwPhotoLoading.set(p.rec, job);
  return job;
}
function pwHydratePhotos(root) {
  (root || document).querySelectorAll('[data-pw-photo]').forEach(el => {
    if (el.classList.contains('is-loaded')) return;
    const n = pwNote(el.dataset.pwPhoto);
    if (!n || !n.photo) return;
    pwPhotoObjectUrl(n.photo).then(url => {
      if (!url || !el.isConnected) return;
      el.innerHTML = `<img src="${url}" alt="" />`;
      el.classList.add('is-loaded');
    }).catch(() => { /* stays as a placeholder */ });
  });
}
// Upload the queued photos of this device
async function pwFlushPhotos() {
  if (pwFlushRunning || !navigator.onLine || !currentUser()) return;
  const waiting = pinboard.filter(n => n.photo && n.photo.pending);
  if (!waiting.length) return;
  pwFlushRunning = true;
  try {
    for (const n of waiting) {
      const key = n.photo.pending;
      const blob = await pwIdbGet(key);
      if (!blob) continue; // is on another device
      try {
        const form = new FormData();
        form.append('bild', blob, 'pinnwand.jpg');
        form.append('familie', (currentUser() && currentUser().familie) || '');
        form.append('erstellt_von', (currentUser() && currentUser().id) || '');
        const rec = await pb.collection(PW_PHOTO_COLLECTION).create(form);
        if (pwLocalPhotoUrls.has(key)) pwPhotoUrls.set(rec.id, pwLocalPhotoUrls.get(key));
        const still = pwNote(n.id);
        if (still && still.photo && still.photo.pending === key) {
          pwUpdate(n.id, x => { x.photo = { rec: rec.id, file: rec.bild }; }, { silent: true });
        } else {
          pb.collection(PW_PHOTO_COLLECTION).delete(rec.id).catch(() => {}); // note has been deleted/changed in the meantime
        }
        await pwIdbDel(key);
      } catch (err) {
        console.warn('Pin board: photo could not be uploaded (does the collection "' + PW_PHOTO_COLLECTION + '" exist?)', err);
        break;
      }
    }
  } finally {
    pwFlushRunning = false;
  }
}
function pwDropPhoto(p) {
  if (!p) return;
  if (p.pending) { pwIdbDel(p.pending); pwLocalPhotoUrls.delete(p.pending); }
  if (p.rec && navigator.onLine) pb.collection(PW_PHOTO_COLLECTION).delete(p.rec).catch(() => { /* the server cleans up at night */ });
}
async function pwOpenLightbox(n) {
  if (!n || !n.photo) return;
  const box = document.getElementById('pinboardLightbox');
  const img = document.getElementById('pinboardLightboxImg');
  img.src = (await pwPhotoObjectUrl(n.photo)) || '';
  box.classList.remove('hidden');
  if (n.photo.rec && navigator.onLine) {
    const token = await ensureFinDocToken();
    if (token && !box.classList.contains('hidden')) {
      const full = new Image();
      full.onload = () => { if (!box.classList.contains('hidden')) img.src = full.src; };
      full.src = pwPhotoPath(n.photo) + '?token=' + encodeURIComponent(token);
    }
  }
}
function pwCloseLightbox() {
  document.getElementById('pinboardLightbox').classList.add('hidden');
  document.getElementById('pinboardLightboxImg').src = '';
}

/* ---------- Reaction picker ---------- */
let pwEmojiPop = null;
function pwCloseEmojiPop() { if (pwEmojiPop) { pwEmojiPop.remove(); pwEmojiPop = null; } }
function pwOpenEmojiPop(anchor, noteId) {
  pwCloseEmojiPop();
  const n = pwNote(noteId);
  if (!n) return;
  const mine = pwMyKeys().map(k => (n.reactions || {})[k]).find(Boolean) || '';
  const pop = document.createElement('div');
  pop.className = 'pw-emoji-pop';
  pop.innerHTML = PW_REACTIONS.map(e => `<button type="button" class="${e === mine ? 'mine' : ''}" data-pw-emoji="${e}" aria-label="${e}">${e}</button>`).join('');
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-emoji]');
    if (!b) return;
    e.stopPropagation();
    pwReact(noteId, b.dataset.pwEmoji);
    pwCloseEmojiPop();
  });
  pwEmojiPop = pop;
}
document.addEventListener('click', (e) => {
  if (pwEmojiPop && !pwEmojiPop.contains(e.target) && !e.target.closest('[data-pw-react-add]')) pwCloseEmojiPop();
}, true);
window.addEventListener('resize', pwCloseEmojiPop);
document.addEventListener('scroll', pwCloseEmojiPop, true);

// Clicks inside a note (board and detail view). Returns true if something was handled.
function pwHandleNoteInteraction(e) {
  const noteEl = e.target.closest('[data-pw-note]');
  if (!noteEl) return false;
  const id = noteEl.dataset.pwNote;
  if (e.target.closest('[data-pw-link]')) { e.stopPropagation(); return true; }
  const item = e.target.closest('[data-pw-item]');
  if (item) { e.stopPropagation(); if (!item.disabled) pwToggleItem(id, item.dataset.pwItem); return true; }
  const vote = e.target.closest('[data-pw-vote]');
  if (vote) { e.stopPropagation(); if (!vote.disabled) pwVote(id, vote.dataset.pwVote); return true; }
  const rt = e.target.closest('[data-pw-react-toggle]');
  if (rt) { e.stopPropagation(); pwReact(id, rt.dataset.pwReactToggle); return true; }
  const ra = e.target.closest('[data-pw-react-add]');
  if (ra) { e.stopPropagation(); if (pwEmojiPop) pwCloseEmojiPop(); else pwOpenEmojiPop(ra, id); return true; }
  const dn = e.target.closest('[data-pw-done]');
  if (dn) { e.stopPropagation(); pwToggleDone(id); return true; }
  const ai = e.target.closest('[data-pw-add-item]');
  if (ai) {
    e.stopPropagation();
    const input = document.getElementById('pwAddItemInput');
    if (input && input.value.trim()) { pwAddItem(id, input.value); setTimeout(() => { const i2 = document.getElementById('pwAddItemInput'); if (i2) i2.focus(); }, 30); }
    return true;
  }
  if (e.target.closest('#pwAddItemInput')) { e.stopPropagation(); return true; }
  const ph = e.target.closest('[data-pw-photo]');
  if (ph && ph.classList.contains('is-loaded')) { e.stopPropagation(); pwOpenLightbox(pwNote(id)); return true; }
  return false;
}

/* ---------- Quick note ---------- */
function pwNewNoteBase(type) {
  const u = currentUser();
  const m = currentMember();
  const now = Date.now();
  return {
    id: pwId('pw'), type: type || 'note', title: '', text: '', color: pwType(type).color,
    author: m ? m.id : '', authorUser: u ? u.id : '', authorName: m ? m.name : (u ? u.username || '' : ''),
    createdAt: now, updatedAt: now, to: [], pinned: false, important: false, archived: false,
    remindAt: '', remindAtMs: 0, expires: '', reactions: {}, comments: [], doneBy: {},
  };
}
function pwQuickAdd() {
  const input = document.getElementById('pinboardQuickInput');
  const text = input.value.trim();
  if (!text) { openPinboardEditor(null, 'note'); return; }
  const n = pwNewNoteBase('note');
  n.text = text.slice(0, 2000);
  const soft = PW_COLORS.slice(0, 6);
  n.color = soft[Math.floor(Math.random() * soft.length)].id;
  pinboard = [n, ...pinboard];
  input.value = '';
  pwFilter = 'alle';
  persistState();
  pwRerenderAll();
  const sc = document.getElementById('pinboardScroll');
  if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Editor ---------- */
function pwSwitchRow(id, label, hint) {
  return `<label class="pw-switch-row"><span class="pw-switch"><input id="${id}" type="checkbox" /><i></i></span><span class="pw-switch-text">${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
}
function openPinboardEditor(id, presetType, presetText) {
  const n = id ? pwNote(id) : null;
  if (id && !n) return;
  pwEditingId = n ? n.id : null;
  const type = n ? n.type : (presetType || 'note');
  pwDraft = {
    type,
    color: n ? (n.color || pwType(type).color) : pwType(type).color,
    colorTouched: !!n,
    to: n ? (n.to || []).slice() : [],
    options: n && n.type === 'poll' ? (n.options || []).map(o => ({ ...o })) : [{ id: pwId('po'), text: '' }, { id: pwId('po'), text: '' }],
    photoBlob: null,
    photoPreview: '',
    keepPhoto: n && n.photo ? { ...n.photo } : null,
  };
  document.getElementById('pinboardEditTitle').textContent = n ? tk('board.editNote') : tk('board.newNote');
  document.getElementById('savePinboardNoteBtn').textContent = n ? tk('common.save') : tk('board.pin');
  document.getElementById('deletePinboardNoteBtn').classList.toggle('hidden', !n || !pwCanEdit(n));
  document.getElementById('pwTitleInput').value = n ? (n.title || '') : '';
  document.getElementById('pwTextInput').value = n ? (n.text || '') : (presetText || '');
  document.getElementById('pwItemsInput').value = n && n.type === 'list' ? (n.items || []).map(i => i.text).join('\n') : '';
  document.getElementById('pwDateInput').value = n && n.type === 'countdown' ? (n.date || '') : '';
  document.getElementById('pwPinnedToggle').checked = !!(n && n.pinned);
  document.getElementById('pwImportantToggle').checked = !!(n && n.important);
  const remindOn = !!(n && n.remindAt && Number(n.remindAtMs) > 0);
  document.getElementById('pwRemindToggle').checked = remindOn;
  document.getElementById('pwRemindInput').value = remindOn ? n.remindAt : pwDefaultRemind();
  const expOn = !!(n && pwIsIso(n.expires));
  document.getElementById('pwExpiresToggle').checked = expOn;
  document.getElementById('pwExpiresInput').value = expOn ? n.expires : pwDefaultExpiry();
  document.getElementById('pwEditError').classList.add('hidden');
  document.getElementById('pwPhotoInput').value = '';
  pwRenderEditor();
  document.getElementById('pinboardEditModal').classList.remove('hidden');
  armModalSnapshot('pinboardEditModal');
  if (!n && (type === 'note' || type === 'kudos') && !isMobile()) setTimeout(() => document.getElementById('pwTextInput').focus(), 60);
}
function pwDefaultRemind() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
  return `${isoDate(d)}T08:00`;
}
function pwDefaultExpiry() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return isoDate(d);
}
function closePinboardEditor() {
  document.getElementById('pinboardEditModal').classList.add('hidden');
  if (pwDraft && pwDraft.photoPreview) { try { URL.revokeObjectURL(pwDraft.photoPreview); } catch (e) { /* ignore */ } }
  pwEditingId = null;
  pwDraft = null;
}
function pwRenderEditor() {
  if (!pwDraft) return;
  const t = pwDraft.type;
  const isNew = !pwEditingId;
  // Type (only selectable for new notes)
  const types = document.getElementById('pwTypePicker');
  types.classList.toggle('hidden', !isNew);
  types.innerHTML = PW_TYPES.map(x => `<button type="button" class="pw-type${x.id === t ? ' active' : ''}" data-pw-type="${x.id}"><span>${x.icon}</span>${x.label}</button>`).join('');
  const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
  show('pwFieldTitleWrap', ['note', 'list', 'poll', 'countdown'].includes(t));
  show('pwFieldPhotoWrap', t === 'photo');
  show('pwFieldDateWrap', t === 'countdown');
  show('pwFieldTextWrap', t !== 'list' && t !== 'poll');
  show('pwFieldItemsWrap', t === 'list');
  show('pwFieldOptionsWrap', t === 'poll');
  show('pwColorWrap', t !== 'kudos');
  const titleLabel = { note: tk('board.headingOptional'), list: tk('board.titleList'), poll: tk('board.question'), countdown: tk('board.whatLookingForward') }[t] || tk('board.heading');
  const titlePh = { note: tk('board.eGParentsEvening'), list: tk('board.eGPackingList'), poll: tk('board.eGWhatWe'), countdown: tk('board.eGHolidaySeaside') }[t] || '';
  document.getElementById('pwTitleLabel').textContent = titleLabel;
  document.getElementById('pwTitleInput').placeholder = titlePh;
  const textLabel = { note: tk('bell.hw.message'), photo: tk('board.captionOptional'), kudos: tk('stars.whatOptional'), countdown: tk('pet.noteOptional') }[t] || tk('recipe.ai.text');
  const textPh = { note: tk('board.whatShouldFamilyKnow'), photo: tk('board.eGOurNew'), kudos: tk('board.eGLayingTable'), countdown: tk('board.eGStillBuy') }[t] || '';
  document.getElementById('pwTextLabel').textContent = textLabel;
  document.getElementById('pwTextInput').placeholder = textPh;
  document.getElementById('pwTextInput').rows = t === 'note' ? 4 : 2;
  document.getElementById('pwToLabel').textContent = t === 'kudos' ? tk('board.thanks') : tk('lists.item.forWhom');
  document.getElementById('pwToHint').textContent = t === 'kudos'
    ? tk('board.recipientsGetPushNotification')
    : tk('board.nobodySelectedWholeFamily');
  // People
  const to = pwDraft.to;
  const people = members.map(m => `<button type="button" class="pw-person${to.includes(m.id) ? ' active' : ''}" data-pw-to="${escapeHtml(m.id)}">${pwAvatar(m.id, 'sm')}${escapeHtml(m.name || memberLabel(m))}</button>`).join('');
  document.getElementById('pwToPicker').innerHTML = `<button type="button" class="pw-person all${!to.length ? ' active' : ''}" data-pw-to="">${t === 'kudos' ? tk('board.all') : tk('board.all2')}</button>${people}`;
  // Colors
  document.getElementById('pwColorPicker').innerHTML = PW_COLORS.map(c => `<button type="button" class="pw-color${pwDraft.color === c.id ? ' active' : ''}" style="background:${c.c}" data-pw-color="${c.id}" aria-label="${c.label}" title="${c.label}"></button>`).join('');
  // Poll answers
  if (t === 'poll') pwRenderPollOptions();
  // Photo
  if (t === 'photo') pwRenderPhotoPick();
  document.getElementById('pwRemindWrap').classList.toggle('hidden', !document.getElementById('pwRemindToggle').checked);
  document.getElementById('pwExpiresWrap').classList.toggle('hidden', !document.getElementById('pwExpiresToggle').checked);
}
function pwRenderPollOptions() {
  const wrap = document.getElementById('pwOptionsList');
  wrap.innerHTML = pwDraft.options.map((o, i) => `
    <div class="pw-opt-row">
      <input type="text" data-pw-opt="${escapeHtml(o.id)}" value="${escapeHtml(o.text)}" maxlength="80" autocomplete="off" placeholder="${escapeHtml(tk('board.answerN', { n: i + 1 }))}" class="rounded-lg border border-ink/15 px-3 py-2 text-base" />
      <button type="button" class="pw-opt-del" data-pw-opt-del="${escapeHtml(o.id)}" aria-label="${escapeHtml(tk('board.removeReply'))}" ${pwDraft.options.length <= 2 ? 'disabled style="opacity:.25"' : ''}>✕</button>
    </div>`).join('');
  document.getElementById('pwAddOptionBtn').classList.toggle('hidden', pwDraft.options.length >= 8);
}
function pwSyncPollOptionsFromInputs() {
  if (!pwDraft) return;
  document.querySelectorAll('#pwOptionsList [data-pw-opt]').forEach(inp => {
    const o = pwDraft.options.find(x => x.id === inp.dataset.pwOpt);
    if (o) o.text = inp.value;
  });
}
async function pwRenderPhotoPick() {
  const btn = document.getElementById('pwPhotoPickBtn');
  if (pwDraft.photoPreview) { btn.innerHTML = `<img src="${pwDraft.photoPreview}" alt="" />`; return; }
  if (pwDraft.keepPhoto) {
    btn.innerHTML = ('<span>' + tk('board.loadingPhoto') + '</span>');
    const url = await pwPhotoObjectUrl(pwDraft.keepPhoto).catch(() => null);
    if (pwDraft && !pwDraft.photoPreview && pwDraft.keepPhoto) btn.innerHTML = url ? `<img src="${url}" alt="" />` : ('<span>' + tk('board.replacePhoto') + '</span>');
    return;
  }
  btn.innerHTML = ('<span>' + tk('board.takeChoosePhoto') + '</span>');
}
function pwCompressPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => compressImageDataUrl(reader.result).then(resolve, reject);
    reader.onerror = () => reject(new Error(tk('board.photoCouldNotRead')));
    reader.readAsDataURL(file);
  });
}
async function onPinboardPhotoChosen(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !pwDraft) return;
  const btn = document.getElementById('pwPhotoPickBtn');
  btn.innerHTML = ('<span>' + tk('board.preparingPhoto') + '</span>');
  try {
    const blob = await pwCompressPhoto(file);
    if (!pwDraft) return;
    if (pwDraft.photoPreview) { try { URL.revokeObjectURL(pwDraft.photoPreview); } catch (e2) { /* ignore */ } }
    pwDraft.photoBlob = blob;
    pwDraft.photoPreview = URL.createObjectURL(blob);
    pwRenderPhotoPick();
  } catch (err) {
    btn.innerHTML = ('<span>' + tk('board.takeChoosePhoto') + '</span>');
    pwEditError(err.message || tk('board.photoCouldNotProcessed'));
  }
}
function pwEditError(text) {
  const el = document.getElementById('pwEditError');
  el.textContent = text;
  el.classList.remove('hidden');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function savePinboardFromEditor() {
  if (!pwDraft) return;
  pwSyncPollOptionsFromInputs();
  const t = pwDraft.type;
  const title = document.getElementById('pwTitleInput').value.trim().slice(0, 120);
  const text = document.getElementById('pwTextInput').value.trim().slice(0, 2000);
  const date = document.getElementById('pwDateInput').value;
  const itemsText = document.getElementById('pwItemsInput').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 60);
  const opts = pwDraft.options.map(o => ({ id: o.id, text: String(o.text || '').trim().slice(0, 80) })).filter(o => o.text);
  const remindOn = document.getElementById('pwRemindToggle').checked;
  const remindVal = document.getElementById('pwRemindInput').value;
  const expOn = document.getElementById('pwExpiresToggle').checked;
  const expVal = document.getElementById('pwExpiresInput').value;
  const old = pwEditingId ? pwNote(pwEditingId) : null;

  if (t === 'note' && !text && !title) return pwEditError(tk('board.pleaseWriteSomething'));
  if (t === 'list' && !itemsText.length) return pwEditError(tk('board.pleaseEnterLeastOne'));
  if (t === 'photo' && !pwDraft.photoBlob && !pwDraft.keepPhoto) return pwEditError(tk('board.pleaseSelectPhoto'));
  if (t === 'poll' && !title) return pwEditError(tk('board.pleaseEnterQuestion'));
  if (t === 'poll' && opts.length < 2) return pwEditError(tk('board.pleaseEnterLeastTwo'));
  if (t === 'countdown' && (!title || !pwIsIso(date))) return pwEditError(tk('board.pleaseStateWhatWaiting'));
  let remindAtMs = 0;
  if (remindOn) {
    const d = new Date(remindVal);
    if (!remindVal || isNaN(d)) return pwEditError(tk('board.pleaseChooseDateTime'));
    remindAtMs = d.getTime();
    const unchanged = old && old.remindAt === remindVal;
    if (!unchanged && remindAtMs < Date.now() - 60000) return pwEditError(tk('board.reminderPast'));
  }
  if (expOn && !pwIsIso(expVal)) return pwEditError(tk('board.pleaseChooseDateTaking'));

  const base = old ? JSON.parse(JSON.stringify(old)) : pwNewNoteBase(t);
  base.type = t;
  base.title = ['note', 'list', 'poll', 'countdown'].includes(t) ? title : '';
  base.text = t === 'list' || t === 'poll' ? '' : text;
  base.color = pwDraft.color;
  base.to = pwDraft.to.filter(k => members.some(m => m.id === k) || String(k).startsWith('u:'));
  base.pinned = document.getElementById('pwPinnedToggle').checked;
  base.important = document.getElementById('pwImportantToggle').checked;
  base.remindAt = remindOn ? remindVal : '';
  base.remindAtMs = remindOn ? remindAtMs : 0;
  base.expires = expOn ? expVal : '';
  if (t === 'countdown') base.date = date; else delete base.date;
  if (t === 'list') {
    const oldItems = (old && old.items) || [];
    const used = new Set();
    base.items = itemsText.map(txt => {
      const hit = oldItems.find(i => i.text === txt && !used.has(i.id));
      if (hit) { used.add(hit.id); return hit; }
      return { id: pwId('pi'), text: txt.slice(0, 120), done: false };
    });
  } else delete base.items;
  if (t === 'poll') {
    base.options = opts;
    const valid = new Set(opts.map(o => o.id));
    const votes = { ...(base.votes || {}) };
    Object.keys(votes).forEach(k => { if (!valid.has(votes[k])) delete votes[k]; });
    base.votes = votes;
  } else { delete base.options; delete base.votes; delete base.closed; }
  // Photo
  let oldPhotoToDrop = null;
  if (t === 'photo') {
    if (pwDraft.photoBlob) {
      const key = pwId('pf');
      try {
        await pwIdbPut(key, pwDraft.photoBlob);
      } catch (err) {
        return pwEditError(tk('board.photoCouldNotCached'));
      }
      pwLocalPhotoUrls.set(key, URL.createObjectURL(pwDraft.photoBlob));
      if (base.photo) oldPhotoToDrop = base.photo;
      base.photo = { pending: key };
    }
  } else if (base.photo) { oldPhotoToDrop = base.photo; delete base.photo; }
  if (old && pwIsArchived(old) && !pwIsArchived(base)) delete base.archivedAt;
  base.updatedAt = Date.now();

  if (old) pinboard = pinboard.map(x => (x.id === old.id ? base : x));
  else {
    pinboard = [base, ...pinboard];
    if (pwFilter === 'archiv' || !pwMatchesFilter(base, pwFilter)) pwFilter = 'alle';
  }
  if (oldPhotoToDrop) pwDropPhoto(oldPhotoToDrop);
  const wasNew = !old;
  closePinboardEditor();
  persistState();
  if (currentView !== 'pinnwand' && wasNew) setView('pinnwand');
  pwRerenderAll();
  if (base.photo && base.photo.pending) {
    if (!navigator.onLine) finShowToast(tk('board.offlinePhotoWillUploaded'));
    pwFlushPhotos();
  }
  if (wasNew) {
    const sc = document.getElementById('pinboardScroll');
    if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ---------- Detail view of a note ---------- */
function openPinboardDetail(id) {
  const n = pwNote(id);
  if (!n) return;
  pwDetailId = id;
  document.getElementById('pinboardReplyInput').value = '';
  renderPinboardDetail();
  document.getElementById('pinboardDetailModal').classList.remove('hidden');
}
function closePinboardDetail() {
  document.getElementById('pinboardDetailModal').classList.add('hidden');
  pwDetailId = null;
  pwCloseEmojiPop();
}
function renderPinboardDetail() {
  const n = pwNote(pwDetailId);
  if (!n) { closePinboardDetail(); return; }
  const addInput = document.getElementById('pwAddItemInput');
  const keepAdd = addInput ? addInput.value : '';
  const hadFocus = addInput && document.activeElement === addInput;
  document.getElementById('pinboardDetailBody').innerHTML = pwNoteHtml(n, 'detail');
  const newAdd = document.getElementById('pwAddItemInput');
  if (newAdd) { newAdd.value = keepAdd; if (hadFocus) newAdd.focus(); }
  pwHydratePhotos(document.getElementById('pinboardDetailBody'));
  // Replies
  const thread = document.getElementById('pinboardThread');
  const comments = (n.comments || []).slice().sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  thread.innerHTML = comments.length ? comments.map(c => {
    const key = pwAuthorKey(c);
    const w = pwWho(key, c.authorName);
    const mine = pwIsCommentMine(c);
    const del = mine || isCurrentUserAdmin() ? `<button type="button" class="pw-msg-del" data-pw-cdel="${escapeHtml(c.id)}">${tk('board.delete')}</button>` : '';
    return `<div class="pw-msg${mine ? ' mine' : ''}">${pwAvatar(key, '', c.authorName)}<div class="pw-msg-bubble"><div class="pw-msg-head"><b>${escapeHtml(mine ? tk('bell.you') : w.name)}</b><span>${escapeHtml(pwAgo(c.at))}</span>${del}</div><div class="pw-msg-text">${pwLinkify(c.text)}</div></div></div>`;
  }).join('') : ('<p class="text-xs text-ink/40 italic">' + tk('board.noRepliesYet') + '</p>');
  document.getElementById('pinboardReplyWrap').classList.toggle('hidden', pwIsArchived(n));
  // Actions
  const archived = pwIsArchived(n);
  const acts = [];
  if (pwCanEdit(n)) acts.push(('<button type="button" class="pw-act" data-pw-act="edit">' + tk('home.edit') + '</button>'));
  if (!archived) acts.push(`<button type="button" class="pw-act" data-pw-act="pin">${n.pinned ? tk('board.unpin') : tk('board.pin2')}</button>`);
  if (n.type === 'poll' && pwCanEdit(n) && !archived) acts.push(`<button type="button" class="pw-act" data-pw-act="close">${n.closed ? tk('board.reopen') : tk('board.endPoll')}</button>`);
  if (n.type === 'list' && !archived && (n.items || []).some(i => i.done)) acts.push(('<button type="button" class="pw-act" data-pw-act="cleanup">' + tk('board.removeCompleted') + '</button>'));
  acts.push(archived
    ? ('<button type="button" class="pw-act" data-pw-act="unarchive">' + tk('board.pinAgain') + '</button>')
    : ('<button type="button" class="pw-act" data-pw-act="archive">' + tk('board.takeDown') + '</button>'));
  if (pwCanEdit(n)) acts.push(('<button type="button" class="pw-act danger" data-pw-act="delete">' + tk('board.delete2') + '</button>'));
  document.getElementById('pinboardDetailActions').innerHTML = acts.join('');
  // Count this note as seen while it is open
  if (pwIsNew(n) || pwHasNewComments(n)) {
    clearTimeout(pwSeenTimer);
    pwSeenTimer = setTimeout(() => { if (pwDetailId === n.id) pwMarkSeen(); }, 1500);
  }
}
function pwSendReply() {
  const input = document.getElementById('pinboardReplyInput');
  if (!pwDetailId || !input.value.trim()) return;
  if (pwAddComment(pwDetailId, input.value)) {
    input.value = '';
    input.style.height = '';
    const thread = document.getElementById('pinboardThread');
    setTimeout(() => { if (thread.lastElementChild) thread.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 50);
  }
}

/* ---------- Overview tile ---------- */
function pwTileNotes() {
  const today = pwToday();
  const score = n => (pwIsForMe(n) && !pwIsDoneByMe(n) ? 8 : 0) + (n.important ? 4 : 0) + (pwIsNew(n) || pwHasNewComments(n) ? 2 : 0) + (n.pinned ? 1 : 0);
  return pinboard.filter(n => !pwIsArchived(n, today))
    .sort((a, b) => (score(b) - score(a)) || ((Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)));
}
function pwSummary(n) {
  if (n.type === 'list') {
    const items = n.items || [];
    return `✅ ${n.title || tk('bell.word.list')} (${items.filter(i => i.done).length}/${items.length})`;
  }
  if (n.type === 'photo') return '📷 ' + (n.text || tk('bell.word.photo'));
  if (n.type === 'poll') return '📊 ' + (n.title || tk('bell.word.poll'));
  if (n.type === 'kudos') {
    return `💛 ${pwThanksHead(n.to)} ${n.text || ''}`;
  }
  if (n.type === 'countdown') {
    const d = pwIsIso(n.date) ? pwDaysBetween(pwToday(), n.date) : null;
    const t = n.title || '';
    return '⏳ ' + (d === null ? t : d <= 0 ? tk('board.sumToday', { title: t }) : d === 1 ? tk('board.sumTomorrow', { title: t }) : tk('board.sumInDays', { n: d, title: t }));
  }
  return (n.important ? '❗ ' : '') + (n.title ? n.title + (n.text ? ' – ' + n.text : '') : (n.text || ''));
}
function renderBoardTile() {
  const body = document.getElementById('boardTileBody');
  const count = document.getElementById('boardTileCount');
  if (!body) return;
  const list = pwTileNotes();
  const unread = pwUnreadCount();
  if (count) count.textContent = unread ? tk('board.newN', { n: unread }) : '';
  if (!list.length) { body.innerHTML = ('<p class="text-sm text-ink/40 italic mt-2">' + tk('board.nothingPinnedYet') + '</p>'); return; }
  const shown = list.slice(0, 8);
  body.innerHTML = `<div class="pw-tile-strip">${shown.map(n => {
    const key = pwAuthorKey(n);
    const w = pwWho(key, n.authorName);
    const fresh = pwIsNew(n) || pwHasNewComments(n);
    const meta = pwIsForMe(n) && n.type !== 'kudos' ? (pwIsDoneByMe(n) ? tk('school.done') : ('<b>' + tk('board.forYou') + '</b>')) : escapeHtml(w.name);
    return `<button type="button" class="pw-mini t-${n.type}" style="--pw-c:${pwColor(n)};--pw-rot:${pwRot(n.id) * 0.8}deg" data-pw-tile="${escapeHtml(n.id)}">
        <span class="pw-pin" style="${n.important ? '--pw-pin:#D23B2F' : (n.pinned ? '--pw-pin:var(--c-pine)' : '')}"></span>
        ${fresh ? `<span class="pw-flag new">${escapeHtml(tk('bell.new'))}</span>` : ''}
        <div class="pw-mini-text">${escapeHtml(pwSummary(n))}</div>
        <div class="pw-mini-meta">${pwAvatar(key, 'sm', n.authorName)}<span class="truncate">${meta}</span></div>
      </button>`;
  }).join('')}${list.length > shown.length ? `<button type="button" class="pw-mini-more" data-pw-tile-all="1">${escapeHtml(tk('board.moreN', { n: list.length - shown.length }))}</button>` : ''}</div>`;
}

/* ---------- Push message tapped: /?pinnwand=<ID> ---------- */
function pwOpenFromUrl() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('pinnwand') || ''; } catch (e) { id = ''; }
  if (!id) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  if (!isViewAllowed('pinnwand')) return;
  setView('pinnwand');
  const n = pwNote(id);
  if (n) {
    if (pwIsArchived(n)) { pwFilter = 'archiv'; renderPinboard(); }
    openPinboardDetail(id);
  }
}

/* ---------- Maintenance after start ---------- */
function pwMaintenance() {
  if (pwMaintenanceDone || !familyRecordId) return;
  pwMaintenanceDone = true;
  const today = pwToday();
  const limit = Date.now() - PW_ARCHIVE_KEEP_DAYS * 86400000;
  const cutoffIso = isoDate(new Date(limit));
  const gone = pinboard.filter(n => {
    if (!pwIsArchived(n, today)) return false;
    if (n.archived) return (Number(n.archivedAt || n.updatedAt) || 0) < limit;
    const end = n.type === 'countdown' && pwIsIso(n.date) && (!pwIsIso(n.expires) || n.date < n.expires) ? n.date : n.expires;
    return pwIsIso(end) && end < cutoffIso;
  });
  if (gone.length) {
    const ids = new Set(gone.map(n => n.id));
    pinboard = pinboard.filter(n => !ids.has(n.id));
    gone.forEach(n => pwDropPhoto(n.photo));
    persistState();
  }
  // Remove cached photos that no longer belong to any note from the device storage
  pwCache().then(async cache => {
    if (!cache) return;
    const keep = new Set(pinboard.filter(n => n.photo && n.photo.rec && n.photo.file).map(n => pwPhotoPath(n.photo) + '?thumb=640x0'));
    const keys = await cache.keys();
    keys.forEach(req => {
      const u = new URL(req.url);
      if (!keep.has(u.pathname + u.search)) cache.delete(req);
    });
  }).catch(() => { /* ignore */ });
  pwFlushPhotos();
}
function pwAfterBoot() {
  pwMaintenance();
  pwUpdateBadges();
  pwOpenFromUrl();
}

/* ---------- Wiring ---------- */
/* ---------- Moving notes (like the app icons on the iPhone) ----------
   - Pressing and holding a note (or "Arrange" at the top) starts the arrange mode: all notes
     wiggle, the pressed one hangs on the finger. The others make room live.
   - Only the order is saved (field "pos" of the moved note), no coordinates.
     Each device distributes the notes over its own number of columns - so phone, iPad and
     computer show no distortions, and the order is the same everywhere.
   - New notes still land at the top; pinned notes stay in their own area at the very top.
   - Only the "pos" of the one note is synced - simultaneous changes to others are kept. */

function pwEffPos(n) {
  const p = Number(n && n.pos);
  return Number.isFinite(p) && n.pos !== null && n.pos !== '' && n.pos !== undefined ? p : -(Number(n && n.createdAt) || 0);
}
function pwArrangeAllowed() { return pwFilter !== 'archiv' && currentView === 'pinnwand' && !childLockActive(); }

function pwBoardMetrics() {
  const small = window.matchMedia('(max-width: 640px)').matches;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return { minW: (small ? 9.6 : 15) * rem, gap: (small ? 0.8 : 1.25) * rem, vgap: (small ? 0.9 : 1.25) * rem };
}
// Distributes the notes of a wall over columns. order: order of the IDs (otherwise DOM order).
function pwLayoutBoard(boardEl, order) {
  const W = boardEl.clientWidth;
  if (!W) return;
  const { minW, gap, vgap } = pwBoardMetrics();
  const cols = Math.max(1, Math.floor((W + gap) / (minW + gap)));
  const colW = (W - gap * (cols - 1)) / cols;
  boardEl.classList.add('pw-masonry');
  const all = [...boardEl.children].filter(el => el.dataset && el.dataset.pwNote);
  const byId = new Map(all.map(el => [el.dataset.pwNote, el]));
  const els = order ? order.map(id => byId.get(id)).filter(Boolean) : all;
  els.forEach(el => { el.style.width = colW + 'px'; });
  const heights = els.map(el => el.offsetHeight);
  const colH = new Array(cols).fill(0);
  const slots = new Map();
  els.forEach((el, i) => {
    let c = 0;
    for (let k = 1; k < cols; k++) if (colH[k] < colH[c] - 1) c = k;
    const x = c * (colW + gap), y = colH[c];
    slots.set(el.dataset.pwNote, { x, y, w: colW, h: heights[i] });
    colH[c] += heights[i] + vgap;
    if (!el.classList.contains('pw-dragging')) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
  });
  boardEl.style.height = Math.max(0, Math.max(...colH) - vgap) + 'px';
  boardEl._pwSlots = slots;
}
function pwLayoutAll() {
  const root = document.getElementById('pinboardBoard');
  if (!root) return;
  root.querySelectorAll('.pw-board').forEach(b => {
    const d = pwArr.drag;
    pwLayoutBoard(b, d && d.board === b ? d.order : null);
  });
}
function pwQueueLayout() {
  if (pwArr.layoutQueued) return;
  pwArr.layoutQueued = true;
  requestAnimationFrame(() => { pwArr.layoutQueued = false; pwLayoutAll(); });
}
// After every rebuild of the wall: arrange immediately (before painting), then watch for size changes
function pwAfterBoardRender() {
  const root = document.getElementById('pinboardBoard');
  if (!root) return;
  root.classList.toggle('pw-arrange', pwArr.on);
  pwLayoutAll();
  requestAnimationFrame(() => root.querySelectorAll('.pw-board.pw-masonry').forEach(b => b.classList.add('pw-anim')));
  if (pwArr.ro) pwArr.ro.disconnect();
  if (typeof ResizeObserver === 'function') {
    pwArr.ro = new ResizeObserver(() => pwQueueLayout());
    root.querySelectorAll('.pw-board, .pw-board > .pw-note').forEach(el => pwArr.ro.observe(el));
  }
}
window.addEventListener('resize', () => { if (currentView === 'pinnwand') pwQueueLayout(); });

function pwRenderArrangeUi() {
  const btn = document.getElementById('pinboardArrangeBtn');
  const hint = document.getElementById('pinboardArrangeHint');
  const add = document.getElementById('openPinboardEditorBtn');
  const root = document.getElementById('pinboardBoard');
  if (btn) {
    btn.classList.toggle('on', pwArr.on);
    btn.textContent = pwArr.on ? tk('common.done') : tk('board.arrange');
    btn.classList.toggle('hidden', pwFilter === 'archiv');
  }
  if (add) add.classList.toggle('hidden', pwArr.on);
  if (hint) hint.classList.toggle('hidden', !pwArr.on);
  if (root) root.classList.toggle('pw-arrange', pwArr.on);
}
function pwArrangeStart() {
  if (pwArr.on || !pwArrangeAllowed()) return;
  pwArr.on = true;
  pwRenderArrangeUi();
}
function pwArrangeEnd() {
  if (!pwArr.on && !pwArr.drag) return;
  if (pwArr.drag) pwDragFinish(false);
  pwArr.on = false;
  pwRenderArrangeUi();
  if (pwArr.renderPending) { pwArr.renderPending = false; renderPinboard(); }
}

function pwPressCancel() {
  if (pwArr.press) { clearTimeout(pwArr.press.timer); pwArr.press = null; }
}
function pwDragStart(noteEl, clientX, clientY) {
  const board = noteEl.parentElement;
  if (!board || !board.classList.contains('pw-board')) return;
  if (!board.classList.contains('pw-masonry')) pwLayoutBoard(board);
  const slots = board._pwSlots;
  const id = noteEl.dataset.pwNote;
  const s = slots && slots.get(id);
  if (!s) return;
  const br = board.getBoundingClientRect();
  const order = [...board.children].filter(el => el.dataset && el.dataset.pwNote).map(el => el.dataset.pwNote);
  pwArr.drag = { id, el: noteEl, board, order, startOrder: order.slice(), offX: clientX - br.left - s.x, offY: clientY - br.top - s.y, x: clientX, y: clientY, moved: false };
  board.classList.add('pw-anim');
  noteEl.classList.add('pw-dragging');
  try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
  pwDragMove(clientX, clientY);
  pwAutoScrollLoop();
}
function pwDragMove(clientX, clientY) {
  const d = pwArr.drag;
  if (!d) return;
  d.x = clientX; d.y = clientY;
  const br = d.board.getBoundingClientRect();
  const bx = clientX - br.left, by = clientY - br.top;
  d.el.style.left = (bx - d.offX) + 'px';
  d.el.style.top = (by - d.offY) + 'px';
  // Target: the note whose center the finger is currently over
  const slots = d.board._pwSlots;
  if (!slots) return;
  let target = null;
  slots.forEach((s, id) => {
    if (target || id === d.id) return;
    const padX = s.w * 0.12, padY = Math.min(s.h * 0.2, 28);
    if (bx >= s.x + padX && bx <= s.x + s.w - padX && by >= s.y + padY && by <= s.y + s.h - padY) target = id;
  });
  let next = null;
  if (target) {
    const from = d.order.indexOf(d.id), to = d.order.indexOf(target);
    next = d.order.filter(x => x !== d.id);
    const ti = next.indexOf(target);
    next.splice(from < to ? ti + 1 : ti, 0, d.id);
  } else {
    // released below all notes → to the end
    let bottom = 0;
    slots.forEach((s, id) => { if (id !== d.id) bottom = Math.max(bottom, s.y + s.h); });
    if (by > bottom + 8 && d.order[d.order.length - 1] !== d.id) next = d.order.filter(x => x !== d.id).concat([d.id]);
  }
  if (next && next.join('|') !== d.order.join('|')) {
    d.order = next;
    d.moved = true;
    pwLayoutBoard(d.board, d.order);
  }
}
function pwAutoScrollLoop() {
  cancelAnimationFrame(pwArr.raf);
  const step = () => {
    const d = pwArr.drag;
    if (!d) return;
    const sc = document.getElementById('pinboardScroll');
    if (sc) {
      const r = sc.getBoundingClientRect();
      const edge = 70;
      let v = 0;
      if (d.y < r.top + edge) v = -Math.ceil((r.top + edge - d.y) / 5);
      else if (d.y > r.bottom - edge) v = Math.ceil((d.y - (r.bottom - edge)) / 5);
      if (v) {
        const before = sc.scrollTop;
        sc.scrollTop = before + Math.max(-18, Math.min(18, v));
        if (sc.scrollTop !== before) pwDragMove(d.x, d.y);
      }
    }
    pwArr.raf = requestAnimationFrame(step);
  };
  pwArr.raf = requestAnimationFrame(step);
}
function pwDragFinish(save) {
  const d = pwArr.drag;
  if (!d) return;
  cancelAnimationFrame(pwArr.raf);
  pwArr.drag = null;
  d.el.classList.remove('pw-dragging');
  pwLayoutBoard(d.board, d.order); // slides into its place
  pwArr.quietUntil = Date.now() + 380;
  if (save && d.order.join('|') !== d.startOrder.join('|')) pwSaveOrder(d.id, d.order);
  setTimeout(() => {
    if (pwArr.drag) return;
    if (pwArr.renderPending) { pwArr.renderPending = false; renderPinboard(); }
  }, 400);
}
// Only change the position of the moved note (between its new neighbours)
function pwSaveOrder(id, order) {
  const i = order.indexOf(id);
  const prev = i > 0 ? pwNote(order[i - 1]) : null;
  const next = i < order.length - 1 ? pwNote(order[i + 1]) : null;
  let pos;
  if (prev && next) pos = (pwEffPos(prev) + pwEffPos(next)) / 2;
  else if (next) pos = pwEffPos(next) - 1000;
  else if (prev) pos = pwEffPos(prev) + 1000;
  else return;
  const ok = (!prev || pos > pwEffPos(prev)) && (!next || pos < pwEffPos(next));
  if (ok) {
    pwUpdate(id, n => { n.pos = pos; }, { silent: true });
    return;
  }
  // No room left between the neighbours (very rare): renumber the order of this wall.
  // Base just above "now", so that new notes still appear at the top.
  const base = -Date.now();
  const posOf = new Map(order.map((x, k) => [x, base + (k + 1) * 1000]));
  pinboard = pinboard.map(n => (posOf.has(n.id) ? { ...n, pos: posOf.get(n.id) } : n));
  persistState();
  pwRerenderAll();
}

(function initPinboardArrange() {
  const root = document.getElementById('pinboardBoard');
  const btn = document.getElementById('pinboardArrangeBtn');
  if (!root) return;
  if (btn) btn.addEventListener('click', () => { if (pwArr.on) pwArrangeEnd(); else pwArrangeStart(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pwArr.on) pwArrangeEnd(); });

  root.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || !pwArrangeAllowed()) return;
    const noteEl = e.target.closest('.pw-board > [data-pw-note]');
    if (!noteEl) {
      // A tap on an empty spot ends the arrange mode (like on the iPhone)
      if (pwArr.on && !e.target.closest('.pw-note')) pwArr.press = { empty: true, x: e.clientX, y: e.clientY, timer: 0 };
      return;
    }
    if (pwArr.on) {
      if (e.pointerType === 'mouse') e.preventDefault();
      pwDragStart(noteEl, e.clientX, e.clientY);
      return;
    }
    pwPressCancel();
    pwArr.press = {
      x: e.clientX, y: e.clientY, el: noteEl,
      timer: setTimeout(() => {
        const p = pwArr.press;
        if (!p) return;
        pwArr.press = null;
        pwArr.quietUntil = Date.now() + 600; // the following "click" does not open the note
        pwArrangeStart();
        pwDragStart(p.el, p.x, p.y);
      }, PW_LONGPRESS_MS),
    };
  });
  window.addEventListener('pointermove', (e) => {
    if (pwArr.drag) { pwDragMove(e.clientX, e.clientY); return; }
    const p = pwArr.press;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
      if (p.el) { p.x = e.clientX; p.y = e.clientY; }
      pwPressCancel(); // Finger is moving → it scrolls, no long press
    }
  }, { passive: true });
  const up = (e) => {
    const p = pwArr.press;
    if (p && p.empty && e.type === 'pointerup') { pwPressCancel(); pwArrangeEnd(); return; }
    pwPressCancel();
    if (pwArr.drag) pwDragFinish(e.type === 'pointerup');
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  // Do not scroll while dragging and no context menu (Android/iOS on long press)
  root.addEventListener('touchmove', (e) => { if (pwArr.drag) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => { if (pwArr.on || pwArr.press || pwArr.drag) e.preventDefault(); });
  root.addEventListener('dragstart', (e) => { if (e.target.closest('.pw-note')) e.preventDefault(); });
  // In arrange mode and right after dragging, a tap does not open a note
  root.addEventListener('click', (e) => {
    if (pwArr.on || Date.now() < pwArr.quietUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();

(function initPinboardUi() {
  document.getElementById('openPinboardEditorBtn').addEventListener('click', () => openPinboardEditor(null, 'note'));
  document.getElementById('pinboardQuickAdd').addEventListener('click', pwQuickAdd);
  document.getElementById('pinboardQuickMore').addEventListener('click', () => {
    const input = document.getElementById('pinboardQuickInput');
    const text = input.value.trim();
    input.value = '';
    openPinboardEditor(null, 'note', text);
  });
  document.getElementById('pinboardQuickInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); pwQuickAdd(); }
  });
  document.getElementById('pinboardChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-filter]');
    if (!b) return;
    pwFilter = b.dataset.pwFilter;
    renderPinboard();
    const sc = document.getElementById('pinboardScroll');
    if (sc) sc.scrollTop = 0;
  });
  const board = document.getElementById('pinboardBoard');
  board.addEventListener('click', (e) => {
    if (pwHandleNoteInteraction(e)) return;
    const noteEl = e.target.closest('[data-pw-note]');
    if (noteEl) openPinboardDetail(noteEl.dataset.pwNote);
  });
  board.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const noteEl = e.target.closest('[data-pw-note]');
    if (noteEl && e.target === noteEl) { e.preventDefault(); openPinboardDetail(noteEl.dataset.pwNote); }
  });

  // Tile in the overview
  document.getElementById('boardTileOpenBtn').addEventListener('click', () => setView('pinnwand'));
  document.getElementById('boardTileBody').addEventListener('click', (e) => {
    const all = e.target.closest('[data-pw-tile-all]');
    if (all) { setView('pinnwand'); return; }
    const t = e.target.closest('[data-pw-tile]');
    if (!t) return;
    setView('pinnwand');
    openPinboardDetail(t.dataset.pwTile);
  });

  // View
  document.getElementById('closePinboardDetailBtn').addEventListener('click', closePinboardDetail);
  document.getElementById('pinboardDetailModal').addEventListener('click', (e) => { if (e.target.id === 'pinboardDetailModal') closePinboardDetail(); });
  document.getElementById('pinboardDetailBody').addEventListener('click', (e) => { pwHandleNoteInteraction(e); });
  document.getElementById('pinboardDetailBody').addEventListener('keydown', (e) => {
    if (e.target.id === 'pwAddItemInput' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (pwDetailId && e.target.value.trim()) { pwAddItem(pwDetailId, e.target.value); setTimeout(() => { const i2 = document.getElementById('pwAddItemInput'); if (i2) i2.focus(); }, 30); }
    }
  });
  document.getElementById('pinboardThread').addEventListener('click', (e) => {
    const d = e.target.closest('[data-pw-cdel]');
    if (d && pwDetailId) pwDeleteComment(pwDetailId, d.dataset.pwCdel);
  });
  document.getElementById('pinboardReplyBtn').addEventListener('click', pwSendReply);
  const reply = document.getElementById('pinboardReplyInput');
  reply.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()) { e.preventDefault(); pwSendReply(); }
  });
  reply.addEventListener('input', () => { reply.style.height = 'auto'; reply.style.height = Math.min(reply.scrollHeight, 128) + 'px'; });
  document.getElementById('pinboardDetailActions').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-act]');
    const n = pwNote(pwDetailId);
    if (!b || !n) return;
    const act = b.dataset.pwAct;
    if (act === 'edit') { closePinboardDetail(); openPinboardEditor(n.id); }
    else if (act === 'pin') pwUpdate(n.id, x => { x.pinned = !x.pinned; });
    else if (act === 'close') pwUpdate(n.id, x => { x.closed = !x.closed; });
    else if (act === 'cleanup') pwUpdate(n.id, x => { x.items = (x.items || []).filter(i => !i.done); });
    else if (act === 'archive') { pwSetArchived(n.id, true); closePinboardDetail(); }
    else if (act === 'unarchive') pwSetArchived(n.id, false);
    else if (act === 'delete') pwDeleteNote(n.id);
  });

  // Editor
  document.getElementById('closePinboardEditBtn').addEventListener('click', () => attemptCloseModal('pinboardEditModal', closePinboardEditor));
  document.getElementById('cancelPinboardEditBtn').addEventListener('click', () => attemptCloseModal('pinboardEditModal', closePinboardEditor));
  wireModalOutsideClick('pinboardEditModal', closePinboardEditor);
  document.getElementById('savePinboardNoteBtn').addEventListener('click', savePinboardFromEditor);
  document.getElementById('deletePinboardNoteBtn').addEventListener('click', () => {
    const id = pwEditingId;
    if (id && pwDeleteNote(id)) closePinboardEditor();
  });
  document.getElementById('pwTypePicker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-type]');
    if (!b || !pwDraft) return;
    pwSyncPollOptionsFromInputs();
    pwDraft.type = b.dataset.pwType;
    if (!pwDraft.colorTouched) pwDraft.color = pwType(pwDraft.type).color;
    document.getElementById('pwEditError').classList.add('hidden');
    pwRenderEditor();
  });
  document.getElementById('pwToPicker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-to]');
    if (!b || !pwDraft) return;
    const k = b.dataset.pwTo;
    if (!k) pwDraft.to = [];
    else pwDraft.to = pwDraft.to.includes(k) ? pwDraft.to.filter(x => x !== k) : pwDraft.to.concat([k]);
    pwRenderEditor();
  });
  document.getElementById('pwColorPicker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pw-color]');
    if (!b || !pwDraft) return;
    pwDraft.color = b.dataset.pwColor;
    pwDraft.colorTouched = true;
    document.querySelectorAll('#pwColorPicker .pw-color').forEach(x => x.classList.toggle('active', x.dataset.pwColor === pwDraft.color));
  });
  document.getElementById('pwAddOptionBtn').addEventListener('click', () => {
    if (!pwDraft || pwDraft.options.length >= 8) return;
    pwSyncPollOptionsFromInputs();
    pwDraft.options.push({ id: pwId('po'), text: '' });
    pwRenderPollOptions();
    const inputs = document.querySelectorAll('#pwOptionsList [data-pw-opt]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  document.getElementById('pwOptionsList').addEventListener('click', (e) => {
    const d = e.target.closest('[data-pw-opt-del]');
    if (!d || !pwDraft || pwDraft.options.length <= 2) return;
    pwSyncPollOptionsFromInputs();
    pwDraft.options = pwDraft.options.filter(o => o.id !== d.dataset.pwOptDel);
    pwRenderPollOptions();
  });
  document.getElementById('pwPhotoPickBtn').addEventListener('click', () => document.getElementById('pwPhotoInput').click());
  document.getElementById('pwPhotoInput').addEventListener('change', onPinboardPhotoChosen);
  document.getElementById('pwRemindToggle').addEventListener('change', (e) => document.getElementById('pwRemindWrap').classList.toggle('hidden', !e.target.checked));
  document.getElementById('pwExpiresToggle').addEventListener('change', (e) => document.getElementById('pwExpiresWrap').classList.toggle('hidden', !e.target.checked));

  // Large photo
  document.getElementById('pinboardLightbox').addEventListener('click', pwCloseLightbox);

  // Online again: upload queued photos; back in the app: refresh "new" and countdowns
  window.addEventListener('online', () => pwFlushPhotos());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !familyRecordId) return;
    pwUpdateBadges();
    if (currentView === 'pinnwand') { renderPinboard(); pwScheduleMarkSeen(); }
  });
})();


// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('pinnwand');
