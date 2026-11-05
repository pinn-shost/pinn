/* pinn. – Chat with end-to-end encryption (js/chat.js, since 1.127.0)
   Contents: the "Chat" page (list of chats, conversation, composer, info sheet), the encryption in the browser
   (Web Crypto: ECDH P-256 key per profile, AES-GCM per message, PBKDF2 recovery code for the key backup), reading
   and writing through the server routes /api/pinn/chat/* (pb_hooks/pinn-chat.js), the menu badge and the push link ?chat=<room>.

   How a message is protected
   - Every profile has one key pair. The private key stays on the devices (IndexedDB); the server only keeps a copy
     that is encrypted with a recovery code (shown once, never sent to the server).
   - A message gets a random key; the text is encrypted with it (AES-GCM). That message key is wrapped once for every
     recipient (and for the sender) with a key derived from ECDH(own private key, other public key). Because the wrapping
     key needs the sender's private key, nobody else - the server included - can write in someone else's name.
   - Room and sender are bound to the ciphertext (additional authenticated data), so the server cannot move a message.
   - Public keys are remembered on this device (pins). When a key changes, sending stops until the person accepts the new
     safety number - protection against a server that swaps keys. People compare the safety numbers in person or by phone.

   Messages are plain objects { x: text, q: { i, u, x } reply, r: { k, id, ti } reference to a task, note, ... }.
   Since 1.127.4: voice messages (js/chatstimme.js), polls, locations, PDF files, search, muting, the switch for end-to-end encryption
   (js/chatextras.js). Messages are { x, q, r, m: { k: img|vid|aud|pdf ... }, l: location, p: poll, v: vote }. In the mode without
   end-to-end encryption (an admin switches it off for the family) a message is { v: 2, s, p: <message object> } and needs no key.
   Since 1.127.3: own groups (room "gr:<id>"), pinned chats, "mark as unread", swipe actions in the list and the pictures of the family
   chat / groups live in js/chatgruppen.js; this file calls it through the functions chatG... and chatPic....
   Other parts of the app can open a chat with a reference: pinnChat.compose(room, { k: 'task', id, ti }), or let the person
   pick the chat first: pinnChat.share({ k: 'task', id, ti }, onPick) (used by the "discuss in chat" buttons).
   All visible text comes from tk('chat.*'); user text is only ever put into the page with textContent (no innerHTML). */

const CHAT_API = '/api/pinn/chat/';
const CHAT_PBKDF2 = 200000;
const CHAT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters, no I, O, 0, 1
const CHAT_POLL_MS = 3000;
const CHAT_BADGE_MS = 20000;
const CHAT_REF_VIEWS = { task: 'aufgaben', pin: 'pinnwand', contract: 'finanzen', event: 'termine', doc: 'dokumente', vehicle: 'fahrzeuge', expense: 'finanzen', goal: 'finanzen' };
const CHAT_REF_ICONS = { task: '✅', pin: '📌', contract: '📄', event: '📅', doc: '🗂️', vehicle: '🚗', expense: '💶', goal: '🎯' };
const chatEnc = new TextEncoder();
const chatDec = new TextDecoder();
let chatS = null;          // state of the logged-in profile (see chatNewState)
let chatBadgeTimer = null;

function chatNewState(uid) {
  return {
    uid, phase: 'loading', roster: [], me: null, mineSrv: null, priv: null, pub: '', pins: {}, code: '', err: '',
    rooms: new Map(), room: '', ov: new Map(), plain: new Map(), prev: new Map(), reply: null, ref: null,
    groups: [], bilder: {}, mark: {}, swipeOpen: '', drag: false, listDirty: false, plainMode: false,
    pollTimer: null, tick: 0, sheet: null, busy: false, receipts: true,
  };
}

/* ---------------------------------------------------------------- helpers */
function chatEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function chatSvg(d, size) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 20); s.setAttribute('height', size || 20);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.appendChild(p);
  return s;
}
function chatB64e(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function chatB64d(str) {
  const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/'));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}
function chatLocale() { try { return PINN_I18N.language.locale || undefined; } catch (e) { return undefined; } }
function chatTime(ms) { try { return new Date(ms).toLocaleTimeString(chatLocale(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function chatDayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function chatDayLabel(ms) {
  const now = Date.now();
  if (chatDayKey(ms) === chatDayKey(now)) return tk('chat.today');
  if (chatDayKey(ms) === chatDayKey(now - 86400000)) return tk('chat.yesterday');
  try { return new Date(ms).toLocaleDateString(chatLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); } catch (e) { return ''; }
}
function chatEnabled() {
  try { return !!currentUser() && !isCurrentUserGuest() && isViewAllowed('chat'); } catch (e) { return false; }
}

/* ---------------------------------------------------------------- key storage on this device (IndexedDB) */
function chatDbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('pinn-chat', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function chatKeyGet(uid) {
  const db = await chatDbOpen();
  return new Promise((res, rej) => { const q = db.transaction('keys', 'readonly').objectStore('keys').get(uid); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
}
async function chatKeyPut(uid, val) {
  const db = await chatDbOpen();
  return new Promise((res, rej) => { const q = db.transaction('keys', 'readwrite').objectStore('keys').put(val, uid); q.onsuccess = () => res(); q.onerror = () => rej(q.error); });
}
async function chatKeyDel(uid) {
  const db = await chatDbOpen();
  return new Promise((res, rej) => { const q = db.transaction('keys', 'readwrite').objectStore('keys').delete(uid); q.onsuccess = () => res(); q.onerror = () => rej(q.error); });
}

/* ---------------------------------------------------------------- cryptography */
const CHAT_CURVE = { name: 'ECDH', namedCurve: 'P-256' };
async function chatGenerateIdentity() {
  const pair = await crypto.subtle.generateKey(CHAT_CURVE, true, ['deriveBits']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const pub = chatB64e(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pkcs8, pub };
}
// Extractable on purpose: a new recovery code has to wrap the key again later
function chatImportPrivate(pkcs8) { return crypto.subtle.importKey('pkcs8', pkcs8, CHAT_CURVE, true, ['deriveBits']); }
function chatImportPublic(b64) { return crypto.subtle.importKey('raw', chatB64d(b64), CHAT_CURVE, false, []); }
function chatNewCode() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, x => CHAT_CODE_CHARS[x & 31]).join('');
}
function chatShowCode(code) { return String(code).match(/.{1,5}/g).join('-'); }
function chatNormCode(s) { return String(s || '').toUpperCase().split('').filter(c => CHAT_CODE_CHARS.indexOf(c) >= 0).join(''); }
async function chatBackupKey(code, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', chatEnc.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function chatMakeBackup(pkcs8, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await chatBackupKey(code, salt, CHAT_PBKDF2);
  const d = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pkcs8);
  return JSON.stringify({ v: 1, it: CHAT_PBKDF2, s: chatB64e(salt), iv: chatB64e(iv), d: chatB64e(d) });
}
// Throws when the code is wrong
async function chatOpenBackup(json, code) {
  const o = JSON.parse(json);
  const key = await chatBackupKey(code, chatB64d(o.s), Math.min(Number(o.it) || CHAT_PBKDF2, 1000000));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: chatB64d(o.iv) }, key, chatB64d(o.d)));
}
async function chatWrapKey(priv, otherPub, salt, info) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: await chatImportPublic(otherPub) }, priv, 256);
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: chatEnc.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
// Encrypts a message object for everybody in the room that has a key; returns the JSON text for the server
async function chatEncrypt(room, payload, members, me, priv, pub) {
  const msgKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12)), salt = crypto.getRandomValues(new Uint8Array(16));
  const aad = chatEnc.encode('pinn.chat.v1|' + room + '|' + me);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, msgKey, chatEnc.encode(JSON.stringify(payload)));
  const raw = await crypto.subtle.exportKey('raw', msgKey);
  const w = {};
  for (const p of members) {
    if (!p.oeffentlich) continue;
    const wk = await chatWrapKey(priv, p.oeffentlich, salt, 'pinn.chat.wrap.v1|' + me + '|' + p.id);
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    w[p.id] = { iv: chatB64e(wiv), k: chatB64e(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, wk, raw)) };
  }
  return JSON.stringify({ v: 1, s: me, sp: pub, salt: chatB64e(salt), iv: chatB64e(iv), ct: chatB64e(ct), w });
}
// Opens a message package; returns the message object or throws an Error whose message is the reason
async function chatOpenPackage(m, me, priv, accepted) {
  const o = JSON.parse(m.daten);
  if (o.v !== 1 || o.s !== m.von) throw new Error('bad');
  const mine = o.w && o.w[me];
  if (!mine) throw new Error('nokey');
  if (!accepted(m.von, o.sp)) throw new Error('unverified');
  const wk = await chatWrapKey(priv, o.sp, chatB64d(o.salt), 'pinn.chat.wrap.v1|' + m.von + '|' + me);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: chatB64d(mine.iv) }, wk, chatB64d(mine.k));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: chatB64d(o.iv), additionalData: chatEnc.encode('pinn.chat.v1|' + m.raum + '|' + m.von) }, key, chatB64d(o.ct));
  return JSON.parse(chatDec.decode(pt));
}
// Safety number: 10 groups of 5 digits from one or more public keys (the same on every device)
async function chatNumber(pubs) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', chatEnc.encode('pinn.chat.number.v1|' + pubs.slice().sort().join('|'))));
  const out = [];
  for (let i = 0; i < 10; i++) out.push(String(((h[i * 3] << 16) | (h[i * 3 + 1] << 8) | h[i * 3 + 2]) % 100000).padStart(5, '0'));
  return out.join(' ');
}

/* ---------------------------------------------------------------- server */
async function chatApi(path, opts) {
  const res = await apiFetch(CHAT_API + path, opts || {});
  let j = {};
  try { j = await res.json(); } catch (e) { /* no JSON */ }
  if (!res.ok) { const err = new Error(j.error || ('HTTP ' + res.status)); err.status = res.status; throw err; }
  return j;
}
function chatPost(path, body) { return chatApi(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

/* ---------------------------------------------------------------- people, rooms, pins */
function chatName(p) {
  const m = p && p.mitglied && typeof memberById === 'function' ? memberById(p.mitglied) : null;
  return (m && m.name) || (p && p.username) || '?';
}
function chatMemberOf(p) { return p && p.mitglied && typeof memberById === 'function' ? memberById(p.mitglied) : null; }
function chatDmId(a, b) { return 'dm:' + [a, b].sort().join(':'); }
function chatRoomMembers(room) {
  if (room === 'familie') return chatS.roster;
  if (String(room).indexOf('gr:') === 0) {
    const g = (chatS.groups || []).find(x => x.raum === room);
    return g ? chatS.roster.filter(p => g.mitglieder.indexOf(p.id) >= 0) : [];
  }
  const parts = String(room).split(':');
  return chatS.roster.filter(p => p.id === parts[1] || p.id === parts[2]);
}
function chatRoomList() {
  const S = chatS;
  const rooms = [{ id: 'familie', group: true, title: tk('chat.familyChat'), person: null, rank: 0, born: 0 }];
  (S.groups || []).slice().sort((x, y) => String(x.name).localeCompare(String(y.name))).forEach(g => {
    rooms.push({ id: g.raum, group: true, isGroup: true, title: g.name, person: null, g, rank: 1, born: g.zeit || 0 });
  });
  S.roster.filter(p => p.id !== S.uid).sort((a, b) => chatName(a).localeCompare(chatName(b))).forEach(p => {
    rooms.push({ id: chatDmId(S.uid, p.id), group: false, title: chatName(p), person: p, rank: 2, born: 0 });
  });
  const marks = S.mark || {};
  rooms.forEach(r => {
    const o = S.ov.get(r.id);
    r.last = o && o.letzte ? o.letzte : null; r.unread = o ? o.ungelesen : 0;
    r.pinned = !!(marks[r.id] && marks[r.id].p); r.flagged = !!(marks[r.id] && marks[r.id].u);
    r.muted = typeof chatXMuted === 'function' && chatXMuted(r.id);
    r.sortTime = r.last ? r.last.zeit : r.born; // newest message sent or received; a new group without messages counts from its creation
  });
  // pinned chats first, then the newest message (sent or received) on top
  rooms.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.sortTime - a.sortTime || a.rank - b.rank);
  return rooms;
}
function chatRoomById(id) { return chatRoomList().find(r => r.id === id) || null; }
function chatPinsLoad(uid) { try { const o = JSON.parse(localStorage.getItem('pinn.chat.pins.' + uid) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function chatPinsSave() { try { localStorage.setItem('pinn.chat.pins.' + chatS.uid, JSON.stringify(chatS.pins)); } catch (e) { /* storage full or blocked */ } }
function chatPinsSync() {
  const S = chatS;
  S.roster.forEach(p => {
    if (!p.oeffentlich) { p.changed = false; return; }
    const list = S.pins[p.id] || (S.pins[p.id] = []);
    if (p.id === S.uid || !list.length) { if (list.indexOf(p.oeffentlich) < 0) list.push(p.oeffentlich); p.changed = false; }
    else p.changed = list.indexOf(p.oeffentlich) < 0;
  });
  chatPinsSave();
}
function chatAccepted(uid, pub) { return ((chatS.pins[uid] || []).indexOf(pub) >= 0) || (uid === chatS.uid && pub === chatS.pub); }
function chatAcceptKey(uid) {
  const p = chatS.roster.find(x => x.id === uid);
  if (!p || !p.oeffentlich) return;
  const list = chatS.pins[uid] || (chatS.pins[uid] = []);
  if (list.indexOf(p.oeffentlich) < 0) list.push(p.oeffentlich);
  p.changed = false;
  chatPinsSave();
  chatS.plain.forEach((v, k) => { if (v && v.err) chatS.plain.delete(k); });
  chatRenderConv();
}
async function chatLoadRoster() {
  const S = chatS;
  const d = await chatApi('keys');
  S.roster = d.profile || [];
  S.mineSrv = d.mein;
  S.me = S.roster.find(p => p.id === S.uid) || null;
  S.receipts = !d.mein || d.mein.lese !== false;
  S.keep = d.aufbewahrung || null; S.storage = d.speicher != null ? d.speicher : null; S.isAdmin = !!d.admin;
  S.groups = Array.isArray(d.gruppen) ? d.gruppen : []; S.bilder = d.bilder && typeof d.bilder === 'object' ? d.bilder : {};
  S.plainMode = d.klartext === true;
  chatPinsSync();
  if (typeof chatPicsSync === 'function') chatPicsSync();
  // a group this profile was taken out of (or that is gone) cannot stay open
  if (S.room && S.room.indexOf('gr:') === 0 && !S.groups.some(g => g.raum === S.room)) { S.room = ''; S.reply = null; S.ref = null; if (S.phase === 'ready' && currentView === 'chat') chatRender(); }
  // an admin switched the end-to-end encryption on again and this device has no key yet: set it up now
  if (S.phase === 'ready' && !S.plainMode && !S.priv && currentView === 'chat') chatBoot();
}

/* ---------------------------------------------------------------- start: keys on this device */
async function chatBoot() {
  const S = chatS;
  S.phase = 'loading'; S.err = ''; chatRender();
  try {
    if (!window.crypto || !crypto.subtle || !window.indexedDB) { S.phase = 'nocrypto'; chatRender(); return; }
    S.pins = chatPinsLoad(S.uid);
    await chatLoadRoster();
    let local = null;
    try { local = await chatKeyGet(S.uid); } catch (e) { local = null; }
    // The key on this device does not match the one of the server (new key made elsewhere, or the server lost it): drop it
    if (local && (!S.mineSrv || !S.mineSrv.oeffentlich || local.pub !== S.mineSrv.oeffentlich)) { try { await chatKeyDel(S.uid); } catch (e) { /* ignore */ } local = null; }
    if (local) { S.priv = local.priv; S.pub = local.pub; S.phase = 'ready'; }
    else if (S.plainMode) { S.priv = null; S.pub = ''; S.phase = 'ready'; } // no key needed without end-to-end encryption (older encrypted messages stay locked)
    else if (S.mineSrv && S.mineSrv.oeffentlich) S.phase = 'unlock';
    else { await chatSetupNew(false); return; }
  } catch (err) { S.phase = 'error'; S.err = err.message; }
  chatRender();
  if (S.phase === 'ready') chatEnterReady();
}
// New key pair + recovery code; replace = true throws away the old key (older messages become unreadable)
async function chatSetupNew(replace) {
  const S = chatS;
  S.phase = 'loading'; chatRender();
  try {
    const id = await chatGenerateIdentity();
    const code = chatNewCode();
    await chatPost('keys', { oeffentlich: id.pub, gesichert: await chatMakeBackup(id.pkcs8, code), ersetzen: !!replace });
    const priv = await chatImportPrivate(id.pkcs8);
    await chatKeyPut(S.uid, { priv, pub: id.pub });
    S.priv = priv; S.pub = id.pub; S.code = code; S.phase = 'code';
    S.plain.clear(); S.prev.clear(); S.rooms.clear();
    await chatLoadRoster();
  } catch (err) { S.phase = 'error'; S.err = err.message; }
  chatRender();
}
async function chatUnlock(codeText) {
  const S = chatS;
  try {
    const pkcs8 = await chatOpenBackup(S.mineSrv.gesichert, chatNormCode(codeText));
    const priv = await chatImportPrivate(pkcs8);
    await chatKeyPut(S.uid, { priv, pub: S.mineSrv.oeffentlich });
    S.priv = priv; S.pub = S.mineSrv.oeffentlich; S.phase = 'ready';
    chatRender(); chatEnterReady();
    return true;
  } catch (e) { return false; }
}
async function chatNewRecoveryCode() {
  const S = chatS;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', S.priv));
  const code = chatNewCode();
  await chatPost('backup', { oeffentlich: S.pub, gesichert: await chatMakeBackup(pkcs8, code) });
  S.code = code; S.phase = 'code'; S.sheet = null;
  chatRender();
}

/* ---------------------------------------------------------------- messages */
function chatRoomState(room) {
  let r = chatS.rooms.get(room);
  if (!r) { r = { msgs: [], byId: new Map(), seit: 0, more: false, loaded: false }; chatS.rooms.set(room, r); }
  return r;
}
function chatMerge(room, list) {
  const rs = chatRoomState(room);
  let changed = false;
  list.forEach(m => {
    rs.seit = Math.max(rs.seit, m.aktualisiert || 0);
    const old = rs.byId.get(m.id);
    if (old) {
      if (old.aktualisiert !== m.aktualisiert || old.pending) changed = true; // the server repeats the last change on purpose (see pinn-chat.js list)
      Object.assign(old, m, { pending: false });
    } else { rs.byId.set(m.id, m); rs.msgs.push(m); changed = true; }
  });
  rs.msgs.sort((a, b) => a.zeit - b.zeit);
  return changed;
}
async function chatLoadRoom(room, onlyNew) {
  const rs = chatRoomState(room);
  const q = 'messages?raum=' + encodeURIComponent(room) + (onlyNew && rs.loaded ? '&seit=' + rs.seit : '');
  const d = await chatApi(q);
  const changed = chatMerge(room, d.nachrichten || []);
  if (!rs.loaded) { rs.more = !!d.mehr; rs.loaded = true; return true; }
  return changed;
}
async function chatLoadOlder(quiet) {
  const rs = chatRoomState(chatS.room);
  const first = rs.msgs.find(m => !m.pending);
  if (!first) return;
  const d = await chatApi('messages?raum=' + encodeURIComponent(chatS.room) + '&vor=' + first.zeit);
  chatMerge(chatS.room, d.nachrichten || []);
  rs.more = !!d.mehr;
  if (!quiet) chatRenderConv(true);
}
async function chatPlain(m) {
  const S = chatS;
  if (m.geloescht || (!m.daten && !m.pending)) return { del: true, dk: m.dart === 'p' ? 'p' : '' }; // dk 'p': it was a poll
  if (S.plain.has(m.id)) return S.plain.get(m.id);
  let out;
  try {
    const o = JSON.parse(m.daten);
    if (o && o.v === 2) { // readable mode (no end-to-end encryption)
      if (o.s !== m.von || !o.p || typeof o.p !== 'object' || Array.isArray(o.p)) throw new Error('bad');
      out = { msg: o.p };
    } else if (!S.priv) out = { err: 'locked' };
    else out = { msg: await chatOpenPackage(m, S.uid, S.priv, chatAccepted) };
  } catch (e) { out = { err: ['nokey', 'unverified'].indexOf(e.message) >= 0 ? e.message : 'fail' }; }
  if (!out.err || (out.err !== 'unverified' && out.err !== 'locked')) S.plain.set(m.id, out); // "unverified" / "locked" may change later
  return out;
}
function chatRecipients(m) {
  if (m._recips) return m._recips;
  let ids = [];
  try {
    const o = JSON.parse(m.daten);
    if (o && o.v === 2) ids = String(m.empf || (',' + chatRoomMembers(m.raum).map(p => p.id).join(',') + ',')).split(',').filter(Boolean);
    else ids = Object.keys(o.w || {});
  } catch (e) { ids = []; }
  m._recips = ids.filter(id => id !== m.von);
  return m._recips;
}
// 0 = on its way, 1 = on the server, 2 = read by everybody who sends read receipts
function chatTicks(m) {
  if (m.pending) return 0;
  const counted = chatRecipients(m).filter(id => { const p = chatS.roster.find(x => x.id === id); return p && p.lese !== false; });
  if (counted.length && counted.every(id => m.gelesen && m.gelesen[id])) return 2;
  return 1;
}
async function chatSend() {
  const S = chatS;
  const input = document.getElementById('chatInput');
  const text = input ? input.value.trim() : '';
  if ((!text && !S.ref) || S.busy || !S.room || S.phase !== 'ready') return;
  const members = chatRoomMembers(S.room);
  if (!S.plainMode && members.some(p => p.changed)) { chatRenderConv(); return; }
  const payload = { x: text.slice(0, 4000) };
  if (S.reply) payload.q = { i: S.reply.id, u: S.reply.uid, x: S.reply.text.slice(0, 120) };
  if (S.ref) payload.r = { k: S.ref.k, id: S.ref.id, ti: String(S.ref.ti || '').slice(0, 120) };
  input.value = ''; chatGrow(input);
  S.reply = null; S.ref = null;
  const tmp = { id: 'tmp' + Date.now() + Math.random().toString(36).slice(2, 6), raum: S.room, von: S.uid, zeit: Date.now(), aktualisiert: 0, daten: '', gelesen: {}, pending: true };
  S.plain.set(tmp.id, { msg: payload });
  chatMerge(S.room, [tmp]);
  chatRenderConv(true);
  await chatDeliver(S.room, tmp, payload);
}
// The message package: encrypted, or readable when the family switched the encryption off
function chatPackFor(room, payload) {
  const S = chatS;
  if (S.plainMode) return Promise.resolve(JSON.stringify({ v: 2, s: S.uid, p: payload }));
  return chatEncrypt(room, payload, chatRoomMembers(room), S.uid, S.priv, S.pub);
}
// extra: more fields for the server, e.g. { leise: true } for silent messages (poll votes)
async function chatDeliver(room, tmp, payload, extra) {
  const S = chatS;
  try {
    const daten = await chatPackFor(room, payload);
    const r = await chatPost('send', Object.assign({ raum: room, daten }, extra || {}));
    const rs = chatRoomState(room);
    rs.byId.delete(tmp.id); rs.msgs = rs.msgs.filter(m => m.id !== tmp.id);
    S.plain.delete(tmp.id); S.plain.set(r.id, { msg: payload });
    chatMerge(room, [{ id: r.id, raum: room, von: S.uid, zeit: r.zeit, aktualisiert: r.zeit, daten, gelesen: {}, geloescht: false, leise: !!(extra && extra.leise), empf: ',' + chatRoomMembers(room).map(p => p.id).join(',') + ',' }]);
    S.prev.delete(room);
    chatLoadOverview();
  } catch (err) { tmp.failed = true; tmp.retry = () => { tmp.failed = false; chatRenderConv(); chatDeliver(room, tmp, payload, extra); }; }
  chatRenderConv(true);
}
async function chatDelete(m) {
  // tell the server what kind of message it was (only "p" = poll), so everybody sees "the poll was deleted"
  const pl = chatS.plain.get(m.id), art = pl && pl.msg && pl.msg.p ? 'p' : '';
  try { await chatPost('delete', art ? { id: m.id, art } : { id: m.id }); m.geloescht = true; m.daten = ''; m.dart = art; chatS.plain.delete(m.id); chatRenderConv(); } catch (e) { alert(tk('chat.error.send')); }
}
async function chatMarkRead() {
  const S = chatS;
  if (!S.room || document.hidden || currentView !== 'chat') return;
  const rs = chatRoomState(S.room);
  const unread = rs.msgs.some(m => m.von !== S.uid && !m.pending && !m.geloescht && !m.leise && !(m.gelesen && m.gelesen[S.uid]));
  const ov = S.ov.get(S.room);
  if (!unread && !(ov && ov.ungelesen)) return;
  try {
    await chatPost('read', { raum: S.room });
    rs.msgs.forEach(m => { if (m.von !== S.uid) { m.gelesen = m.gelesen || {}; m.gelesen[S.uid] = Date.now(); } });
    if (ov) ov.ungelesen = 0;
    chatUpdateBadge(); chatRenderList();
  } catch (e) { /* next poll tries again */ }
}
async function chatLoadOverview() {
  const S = chatS;
  try {
    const d = await chatApi('overview');
    S.ov = new Map((d.raeume || []).map(r => [r.raum, r]));
    S.mark = d.markierungen && typeof d.markierungen === 'object' ? d.markierungen : {};
    chatUpdateBadge();
    chatRenderList();
    chatRefreshPreviews();
  } catch (e) { /* offline: keep the old list */ }
}
async function chatRefreshPreviews() {
  const S = chatS;
  let changed = false;
  for (const [room, o] of S.ov) {
    if (!o.letzte) continue;
    const cached = S.prev.get(room);
    if (cached && cached.id === o.letzte.id && cached.g === !!o.letzte.geloescht) continue;
    const p = await chatPlain(o.letzte);
    S.prev.set(room, { id: o.letzte.id, g: !!o.letzte.geloescht, text: p.msg ? chatPlainText(p.msg) : '', err: p.err || '', del: !!p.del, dk: p.dk || '' });
    changed = true;
  }
  if (changed) chatRenderList();
}
// Text of a message for lists and quotes: the caption, or a label for a photo or video
function chatPlainText(msg) {
  const cap = String((msg && msg.x) || '');
  if (msg && msg.r && !cap && !msg.m) return (CHAT_REF_ICONS[msg.r.k] || '🔗') + ' ' + String(msg.r.ti || '');
  if (msg && msg.m) {
    const k = msg.m.k;
    if (k === 'aud') return '🎤 ' + tk('chat.voice.label') + (msg.m.d ? ' ' + chatMDuration(msg.m.d) : '');
    if (k === 'pdf') return '📄 ' + String(msg.m.n || tk('chat.file.pdf')) + (cap ? ' ' + cap : '');
    return (k === 'vid' ? '🎥 ' + tk('chat.media.video') : '📷 ' + tk('chat.media.photo')) + (cap ? ' ' + cap : '');
  }
  if (msg && msg.l) return '📍 ' + (msg.l.n ? String(msg.l.n) : tk('chat.loc.label'));
  if (msg && msg.p) return '📊 ' + String(msg.p.q || tk('chat.poll.label'));
  return cap;
}
// Number behind "Chat" in the menu: unread messages of all chats that are not muted, plus chats marked as unread by hand
function chatUpdateBadge() {
  const muted = (room) => typeof chatXMuted === 'function' && chatXMuted(room);
  let n = chatS ? Array.from(chatS.ov.values()).reduce((a, o) => a + (muted(o.raum) ? 0 : (o.ungelesen || 0)), 0) : 0;
  if (chatS && chatS.mark) Object.keys(chatS.mark).forEach(room => { const o = chatS.ov.get(room); if (chatS.mark[room].u && !muted(room) && !(o && o.ungelesen)) n++; });
  const el = document.getElementById('navChatBadge');
  if (el) { el.textContent = n > 99 ? '99+' : String(n); el.classList.toggle('hidden', !n); }
}
// Menu badge while the chat page is not open: only counts, nothing is decrypted
async function chatBadgeTick() {
  if (!chatEnabled() || document.hidden) return;
  if (!chatS || chatS.uid !== currentUser().id) chatS = chatNewState(currentUser().id);
  if (currentView === 'chat') return;
  try { const d = await chatApi('overview'); chatS.ov = new Map((d.raeume || []).map(r => [r.raum, r])); chatS.mark = d.markierungen && typeof d.markierungen === 'object' ? d.markierungen : {}; chatUpdateBadge(); } catch (e) { /* offline */ }
}

/* ---------------------------------------------------------------- opening and leaving the page */
function chatStart() {
  const nav = document.querySelector('#sidebar [data-view="chat"]');
  if (nav) nav.classList.toggle('hidden', !chatEnabled());
  // the timer always runs (the tick itself checks whether the chat may be used), so the number in the menu never depends on the start-up order
  if (chatBadgeTimer) clearInterval(chatBadgeTimer);
  chatBadgeTimer = setInterval(chatBadgeTick, CHAT_BADGE_MS);
  setTimeout(chatBadgeTick, 1500);
  if (!chatEnabled()) return;
  try {
    const room = new URLSearchParams(location.search).get('chat');
    if (room) {
      history.replaceState(null, '', location.pathname + location.hash);
      setTimeout(() => chatOpenRoom(room), 400);
    }
  } catch (e) { /* no address parameters */ }
}
function chatEnter() {
  if (!chatEnabled()) { setView(firstAllowedView()); return; }
  if (!chatS || chatS.uid !== currentUser().id) chatS = chatNewState(currentUser().id);
  if (chatS.phase === 'ready') { chatRender(); chatEnterReady(); } else chatBoot();
}
function chatEnterReady() {
  const S = chatS;
  chatLoadRoster().then(() => { chatRenderConv(); }).catch(() => { /* keep the old list */ });
  chatLoadOverview();
  if (!S.room && window.innerWidth >= 900) S.room = 'familie';
  if (S.room) chatOpenRoom(S.room, true);
  if (S.pollTimer) clearInterval(S.pollTimer);
  S.pollTimer = setInterval(chatPoll, CHAT_POLL_MS);
}
function chatLeave() {
  if (typeof chatVStopAll === 'function') chatVStopAll();
  if (typeof chatXSearchReset === 'function') chatXSearchReset();
  if (typeof chatMRelease === 'function') chatMRelease();
  if (chatS && chatS.pollTimer) { clearInterval(chatS.pollTimer); chatS.pollTimer = null; }
}
async function chatPoll() {
  const S = chatS;
  if (!S || S.phase !== 'ready' || document.hidden || currentView !== 'chat') return;
  S.tick++;
  try {
    if (S.room) {
      const changed = await chatLoadRoom(S.room, true);
      if (changed) { chatRenderConv(); chatMarkRead(); }
      // polls that are also on the pin board live in the family data: fetch them every third round (about 9 s) instead of once a minute
      if (S.tick % 3 === 0 && typeof areasPull === 'function' && chatXHasBoardPoll(S.room)) {
        const before = chatXBoardSig(S.room);
        await areasPull();
        if (chatXBoardSig(S.room) !== before) chatRenderConv();
      }
    }
    if (S.tick % 4 === 0) { chatLoadOverview(); chatLoadRoster().then(() => chatRenderConv()).catch(() => { /* ignore */ }); }
  } catch (e) { /* offline: try again */ }
}
async function chatOpenRoom(room, keep) {
  if (!chatEnabled()) return;
  if (currentView !== 'chat') { if (!chatS || chatS.uid !== currentUser().id) chatS = chatNewState(currentUser().id); chatS.room = room; setView('chat'); return; }
  const S = chatS;
  if (!S || S.phase !== 'ready') { if (S) S.room = room; return; }
  if (!chatRoomById(room)) return;
  S.room = room;
  if (!keep) { S.reply = null; }
  chatRender();
  try { await chatLoadRoom(room, false); } catch (e) { /* shown empty */ }
  chatRenderConv(true);
  chatMarkRead();
  if (S.mark && S.mark[room] && S.mark[room].u && typeof chatSetMark === 'function') chatSetMark(room, { u: false });
}
// For other parts of the app: open a chat with a reference to a task, note, ... in the input line.
// The reference lives in the state, so it survives the start-up of the chat (loading, unlocking with the code).
function chatCompose(room, ref) {
  if (!chatEnabled()) return;
  if (!chatS || chatS.uid !== currentUser().id) chatS = chatNewState(currentUser().id);
  chatS.ref = ref && ref.k && ref.id ? { k: String(ref.k), id: String(ref.id), ti: String(ref.ti || '').replace(/\s+/g, ' ').trim().slice(0, 120) } : null;
  chatS.reply = null;
  chatOpenRoom(room || 'familie');
}
// Small message at the bottom (the target of a reference is gone, no access, ...)
function chatToast(text) {
  const old = document.getElementById('chatToast');
  if (old) old.remove();
  const t = chatEl('div', 'chat-toast', text); t.id = 'chatToast'; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  setTimeout(() => { if (t.parentNode) t.remove(); }, 3200);
}
// Scrolls to an element and lets it flash once
function chatFlash(el) {
  if (!el) return;
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
  el.classList.add('chat-ref-flash');
  setTimeout(() => el.classList.remove('chat-ref-flash'), 1800);
}
// Opens the task of a reference in the task list; false if it does not exist any more
function chatOpenTask(id) {
  setView('aufgaben');
  let found = false;
  try { found = typeof deriveTasks === 'function' && deriveTasks().some(t => String(t.id) === String(id)); } catch (e) { found = false; }
  if (!found) return false;
  setTimeout(() => {
    const btn = document.querySelector('#taskList .task-toggle-done[data-id="' + CSS.escape(String(id)) + '"]');
    chatFlash(btn ? btn.closest('.fade-in') || btn.parentNode : null);
  }, 150);
  return true;
}
function chatOpenRef(r) {
  if (!r) return;
  const view = CHAT_REF_VIEWS[r.k];
  if (!view) return;
  if (!isViewAllowed(view)) { chatToast(tk('chat.ref.noAccess')); return; }
  let ok = true;
  try {
    if (r.k === 'task') ok = chatOpenTask(r.id);
    else if (r.k === 'pin' && typeof pwOpenNote === 'function') ok = pwOpenNote(r.id);
    else if (r.k === 'contract' && typeof vtOpenContract === 'function') ok = vtOpenContract(r.id);
    else if (r.k === 'doc' && typeof docById === 'function') { setView('dokumente'); ok = !!docById(r.id); if (ok) openDocDetail(r.id); }
    else if (r.k === 'vehicle' && typeof fzVehicle === 'function') { ok = !!fzVehicle(r.id); if (ok) fzOpenVehicle(r.id); else setView('fahrzeuge'); }
    else if (r.k === 'expense' && typeof finOpenExpenseRef === 'function') ok = finOpenExpenseRef(r.id);
    else if (r.k === 'goal' && typeof finOpenGoalRef === 'function') ok = finOpenGoalRef(r.id);
    else if (r.k === 'event') { const d = String(r.id).slice(0, 10); setView('termine'); if (/^\d{4}-\d{2}-\d{2}$/.test(d) && typeof jumpToDayView === 'function') jumpToDayView(d); }
    else setView(view);
  } catch (e) { setView(view); }
  if (!ok) chatToast(tk('chat.ref.gone'));
}

/* ---------------------------------------------------------------- "discuss in chat": pick the chat, then compose */
// true if the "discuss in chat" buttons should be shown to this person
function chatCanShare() { return chatEnabled(); }
// Shows the list of chats (family chat + one per person) on top of the current page; onPick runs before the chat opens
async function chatShare(ref, onPick) {
  if (!chatEnabled() || !ref || !ref.k || !ref.id) return;
  if (document.getElementById('chatPick')) return;
  const uid = currentUser().id;
  let profiles = [], groups = [];
  // Only the list of people and groups is read here: the key pins of the chat page stay untouched
  try { const d = await chatApi('keys'); profiles = d.profile || []; groups = d.gruppen || []; } catch (e) { chatToast(tk('chat.error.load')); return; }
  const rooms = [{ id: 'familie', group: true, title: tk('chat.familyChat'), person: null }];
  groups.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(g => rooms.push({ id: g.raum, group: true, isGroup: true, title: g.name, person: null }));
  profiles.filter(p => p.id !== uid).sort((a, b) => chatName(a).localeCompare(chatName(b))).forEach(p => {
    rooms.push({ id: chatDmId(uid, p.id), group: false, title: chatName(p), person: p });
  });
  const back = chatEl('div', 'chat-pick-back'); back.id = 'chatPick';
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.onclick = (e) => { if (e.target === back) close(); };
  const card = chatEl('div', 'chat-sheet'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', tk('chat.pickTitle'));
  card.appendChild(chatEl('h3', 'chat-sheet-title', tk('chat.pickTitle')));
  card.appendChild(chatEl('div', 'chat-sheet-note chat-pick-ref', (CHAT_REF_ICONS[ref.k] || '🔗') + ' ' + String(ref.ti || '')));
  rooms.forEach(r => {
    const b = chatEl('button', 'chat-sheet-act chat-pick-row'); b.type = 'button';
    b.appendChild(chatRoomAvatar(r, 36));
    b.appendChild(chatEl('span', 'chat-pick-name', r.title));
    b.onclick = () => { close(); if (typeof onPick === 'function') { try { onPick(); } catch (e) { /* ignore */ } } chatCompose(r.id, ref); };
    card.appendChild(b);
  });
  const cancel = chatEl('button', 'chat-sheet-act muted', tk('chat.cancel')); cancel.type = 'button'; cancel.onclick = close;
  card.appendChild(cancel);
  back.appendChild(card);
  document.body.appendChild(back);
}
window.pinnChat = { open: chatOpenRoom, compose: chatCompose, share: chatShare, canShare: chatCanShare };

/* ---------------------------------------------------------------- display */
function chatAvatar(p, group, size) {
  const box = chatEl('span', 'chat-avatar');
  box.style.width = box.style.height = (size || 40) + 'px';
  const m = chatMemberOf(p);
  if (group) { box.textContent = (typeof PINN_I18N !== 'undefined' && PINN_I18N.famIcon) ? PINN_I18N.famIcon() : '👥'; box.classList.add('chat-avatar-group'); return box; }
  if (m && m.photo) { const img = document.createElement('img'); img.src = m.photo; img.alt = ''; box.appendChild(img); return box; }
  if (m && m.avatar) { box.textContent = m.avatar; return box; }
  box.textContent = (chatName(p).trim().charAt(0) || '?').toUpperCase();
  box.style.background = (m && m.color && m.color !== 'transparent') ? m.color : '#9A9A92';
  box.classList.add('chat-avatar-initial');
  return box;
}
// Avatar of a chat: its picture if it has one (family chat, group), else the group symbol / the person
function chatRoomAvatar(r, size) {
  const url = typeof chatPicUrl === 'function' ? chatPicUrl(r.id) : '';
  if (url) {
    const box = chatEl('span', 'chat-avatar'); box.style.width = box.style.height = (size || 40) + 'px';
    const img = document.createElement('img'); img.src = url; img.alt = ''; box.appendChild(img);
    return box;
  }
  if (r.isGroup) { const box = chatAvatar(null, true, size); box.textContent = '👥'; return box; }
  return chatAvatar(r.person, r.group, size);
}
function chatRoot() { return document.getElementById('chatRoot'); }
function chatRender() {
  const root = chatRoot();
  if (!root || !chatS) return;
  if (typeof chatVCancel === 'function') chatVCancel(true); // the composer is rebuilt: a running voice recording ends
  if (typeof chatXSearchReset === 'function') chatXSearchReset();
  const S = chatS;
  root.replaceChildren();
  if (S.phase === 'ready') {
    const main = chatEl('div', 'chat-main' + (S.room ? ' show-conv' : ''));
    main.id = 'chatMain';
    main.appendChild(chatBuildList());
    main.appendChild(chatBuildConv());
    root.appendChild(main);
    chatRenderConv(true);
    return;
  }
  root.appendChild(chatBuildGate());
}
function chatBuildGate() {
  const S = chatS;
  const wrap = chatEl('div', 'chat-gate');
  const card = chatEl('div', 'chat-gate-card');
  card.appendChild(chatEl('div', 'chat-gate-lock', '🔒'));
  const add = (el) => { card.appendChild(el); return el; };
  if (S.phase === 'loading') { add(chatEl('p', 'chat-gate-text', tk('chat.loading'))); }
  else if (S.phase === 'nocrypto') { add(chatEl('p', 'chat-gate-text', tk('chat.error.noCrypto'))); }
  else if (S.phase === 'error') {
    add(chatEl('p', 'chat-gate-text', tk('chat.error.load')));
    const b = add(chatEl('button', 'chat-btn', tk('chat.error.retry'))); b.type = 'button'; b.onclick = () => chatBoot();
  } else if (S.phase === 'code') {
    add(chatEl('h2', 'chat-gate-title', tk('chat.setup.title')));
    add(chatEl('p', 'chat-gate-text', tk('chat.setup.intro')));
    add(chatEl('div', 'chat-code', chatShowCode(S.code)));
    const copy = add(chatEl('button', 'chat-btn chat-btn-light', tk('chat.setup.copy'))); copy.type = 'button';
    copy.onclick = async () => { try { await navigator.clipboard.writeText(chatShowCode(S.code)); copy.textContent = tk('chat.setup.copied'); } catch (e) { /* clipboard blocked */ } };
    const ok = add(chatEl('button', 'chat-btn', tk('chat.setup.saved'))); ok.type = 'button';
    ok.onclick = () => { S.code = ''; S.phase = 'ready'; chatRender(); chatEnterReady(); };
  } else if (S.phase === 'unlock') {
    add(chatEl('h2', 'chat-gate-title', tk('chat.unlock.title')));
    add(chatEl('p', 'chat-gate-text', tk('chat.unlock.intro')));
    const input = add(chatEl('input', 'chat-code-input'));
    input.type = 'text'; input.autocomplete = 'off'; input.autocapitalize = 'characters'; input.spellcheck = false; input.maxLength = 30; input.placeholder = 'XXXXX-XXXXX-XXXXX-XXXXX';
    input.setAttribute('aria-label', tk('chat.setup.code'));
    const msg = add(chatEl('p', 'chat-gate-error'));
    const go = add(chatEl('button', 'chat-btn', tk('chat.unlock.button'))); go.type = 'button';
    go.onclick = async () => { go.disabled = true; msg.textContent = ''; const ok = await chatUnlock(input.value); if (!ok) { msg.textContent = tk('chat.unlock.wrong'); go.disabled = false; } };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    const lost = add(chatEl('button', 'chat-link', tk('chat.unlock.lost'))); lost.type = 'button';
    lost.onclick = () => { if (confirm(tk('chat.unlock.lostWarn'))) chatSetupNew(true); };
  }
  wrap.appendChild(card);
  return wrap;
}
function chatBuildList() {
  const list = chatEl('div', 'chat-list');
  const head = chatEl('div', 'chat-list-head');
  head.appendChild(chatEl('h2', 'chat-list-title', tk('chat.title')));
  const tools = chatEl('span', 'chat-list-tools');
  const add = chatEl('button', 'chat-icon-btn'); add.type = 'button'; add.id = 'chatNewGroupBtn'; add.setAttribute('aria-label', tk('chat.group.new')); add.title = tk('chat.group.new');
  add.appendChild(chatSvg('M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M19 8v6 M22 11h-6', 20));
  add.onclick = () => { if (typeof chatGEditSheet === 'function') chatGEditSheet(null); };
  tools.appendChild(add);
  const info = chatEl('button', 'chat-icon-btn'); info.type = 'button'; info.setAttribute('aria-label', tk('chat.info.title')); info.appendChild(chatSvg('M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z M9 12l2 2 4-4', 20));
  info.onclick = () => { chatS.sheet = 'info'; chatRenderSheet(); };
  tools.appendChild(info);
  head.appendChild(tools);
  list.appendChild(head);
  const items = chatEl('div', 'chat-items'); items.id = 'chatItems';
  list.appendChild(items);
  setTimeout(chatRenderList, 0);
  return list;
}
function chatPreviewText(room) {
  const S = chatS;
  const o = S.ov.get(room.id);
  if (!o || !o.letzte) return { text: tk('chat.noMessages'), mine: false, ticks: 0 };
  const pv = S.prev.get(room.id);
  const mine = o.letzte.von === S.uid;
  let text = '';
  if (pv) text = pv.del ? chatDeletedText(pv.dk) : (pv.err ? tk('chat.cantRead') : pv.text);
  else text = '…';
  if (room.group && !mine && pv && !pv.err && !pv.del) { const p = S.roster.find(x => x.id === o.letzte.von); text = chatName(p) + ': ' + text; }
  return { text: text.replace(/\s+/g, ' '), mine, ticks: mine ? chatTicks(o.letzte) : 0 };
}
// One row of the list of chats (without the swipe actions)
function chatListRow(r) {
  const row = chatEl('button', 'chat-item' + (chatS.room === r.id ? ' active' : '')); row.type = 'button';
  row.appendChild(chatRoomAvatar(r, 46));
  const mid = chatEl('span', 'chat-item-mid');
  mid.appendChild(chatEl('span', 'chat-item-title', r.title));
  const pv = chatPreviewText(r);
  const line = chatEl('span', 'chat-item-prev');
  if (pv.mine) line.appendChild(chatEl('span', 'chat-ticks' + (pv.ticks === 2 ? ' read' : ''), pv.ticks === 2 ? '✓✓' : '✓'));
  line.appendChild(document.createTextNode(pv.text));
  mid.appendChild(line);
  row.appendChild(mid);
  const side = chatEl('span', 'chat-item-side');
  const unread = r.unread > 0 || r.flagged;
  if (r.last) side.appendChild(chatEl('span', 'chat-item-time' + (unread && !r.muted ? ' unread' : ''), chatTime(r.last.zeit)));
  const badges = chatEl('span', 'chat-item-badges');
  if (r.muted) { const mu = chatEl('span', 'chat-pin-ico', '🔕'); mu.setAttribute('aria-label', tk('chat.muted')); badges.appendChild(mu); }
  if (r.pinned) { const pin = chatEl('span', 'chat-pin-ico', '📌'); pin.setAttribute('aria-label', tk('chat.pinned')); badges.appendChild(pin); }
  if (r.unread) badges.appendChild(chatEl('span', 'chat-unread' + (r.muted ? ' muted' : ''), r.unread > 99 ? '99+' : String(r.unread)));
  else if (r.flagged) { const dot = chatEl('span', 'chat-unread chat-unread-dot'); dot.setAttribute('aria-label', tk('chat.markUnread')); badges.appendChild(dot); }
  if (badges.childNodes.length) side.appendChild(badges);
  row.appendChild(side);
  row.onclick = () => chatOpenRoom(r.id);
  return row;
}
function chatRenderList() {
  const box = document.getElementById('chatItems');
  if (!box || !chatS || chatS.phase !== 'ready') return;
  if (chatS.drag) { chatS.listDirty = true; return; } // a finger is swiping a row: do not rebuild the list under it
  chatS.listDirty = false;
  box.replaceChildren();
  chatRoomList().forEach(r => box.appendChild(typeof chatGRow === 'function' ? chatGRow(r) : chatListRow(r)));
}
// Picture in the header of a conversation: a button for whoever may change it (admins for the family chat, creator/admins for a group)
function chatHeadAvatar(room) {
  const av = chatRoomAvatar(room, 38);
  let out = av;
  if (typeof chatGCanPicture === 'function' && chatGCanPicture(room)) {
    out = chatEl('button', 'chat-head-avatar'); out.type = 'button'; out.setAttribute('aria-label', tk('chat.pic.change')); out.title = tk('chat.pic.change');
    out.appendChild(av); out.onclick = () => chatGPictureMenu(room.id);
  }
  out.dataset.headAv = '1';
  return out;
}
function chatBuildConv() {
  const S = chatS;
  const conv = chatEl('div', 'chat-conv');
  const room = chatRoomById(S.room);
  if (!room) {
    const ph = chatEl('div', 'chat-placeholder');
    ph.appendChild(chatEl('div', 'chat-gate-lock', '🔒'));
    ph.appendChild(chatEl('p', '', tk('chat.pickChat')));
    ph.appendChild(chatEl('p', 'chat-placeholder-note', tk('chat.e2eeNote')));
    conv.appendChild(ph);
    return conv;
  }
  const head = chatEl('div', 'chat-conv-head');
  const back = chatEl('button', 'chat-icon-btn chat-back'); back.type = 'button'; back.setAttribute('aria-label', tk('chat.back')); back.appendChild(chatSvg('M15 18l-6-6 6-6', 22));
  back.onclick = () => { S.room = ''; S.reply = null; S.ref = null; chatRender(); chatLoadOverview(); };
  head.appendChild(back);
  head.appendChild(chatHeadAvatar(room));
  const t = chatEl('span', 'chat-conv-title');
  t.appendChild(chatEl('span', 'chat-conv-name', room.title));
  t.appendChild(chatEl('span', 'chat-conv-sub', S.plainMode ? '🔓 ' + tk('chat.plain') : '🔒 ' + tk('chat.e2ee')));
  head.appendChild(t);
  const find = chatEl('button', 'chat-icon-btn'); find.type = 'button'; find.id = 'chatSearchBtn'; find.setAttribute('aria-label', tk('chat.search.placeholder')); find.title = tk('chat.search.placeholder');
  find.appendChild(chatSvg('M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.35-4.35', 20));
  find.onclick = () => { if (typeof chatXSearchToggle === 'function') chatXSearchToggle(); };
  head.appendChild(find);
  const info = chatEl('button', 'chat-icon-btn'); info.type = 'button'; info.setAttribute('aria-label', tk('chat.info.title')); info.appendChild(chatSvg('M12 16v-4 M12 8h.01 M12 22a10 10 0 100-20 10 10 0 000 20z', 22));
  info.onclick = () => { if (room.isGroup && typeof chatGInfoSheet === 'function') chatGInfoSheet(room.id); else { S.sheet = 'info'; chatRenderSheet(); } };
  head.appendChild(info);
  conv.appendChild(head);
  const banners = chatEl('div', 'chat-banners'); banners.id = 'chatBanners'; conv.appendChild(banners);
  const msgs = chatEl('div', 'chat-msgs'); msgs.id = 'chatMsgs'; conv.appendChild(msgs);
  const ctx = chatEl('div', 'chat-ctx hidden'); ctx.id = 'chatCtx'; conv.appendChild(ctx);
  const bar = chatEl('div', 'chat-composer');
  if (typeof chatMBuildAttach === 'function') chatMBuildAttach(bar); // photos and videos (js/chatmedien.js)
  const input = chatEl('textarea', 'chat-input'); input.id = 'chatInput'; input.rows = 1; input.maxLength = 4000;
  input.placeholder = tk('chat.placeholder'); input.setAttribute('aria-label', tk('chat.placeholder')); input.setAttribute('enterkeyhint', 'send'); input.autocapitalize = 'sentences';
  input.addEventListener('input', () => chatGrow(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); chatSend(); }
  });
  input.addEventListener('focus', () => setTimeout(() => chatScrollEnd(), 350));
  bar.appendChild(input);
  const send = chatEl('button', 'chat-send'); send.type = 'button'; send.id = 'chatSendBtn'; send.setAttribute('aria-label', tk('chat.send')); send.appendChild(chatSvg('M22 2L11 13 M22 2l-7 20-4-9-9-4 20-7z', 20));
  send.onmousedown = (e) => e.preventDefault(); // keeps the keyboard open
  send.onclick = () => { chatSend(); };
  bar.appendChild(send);
  if (typeof chatXBuildMic === 'function') chatXBuildMic(bar, send, input); // microphone instead of the send button while nothing is typed (js/chatstimme.js)
  conv.appendChild(bar);
  return conv;
}
function chatGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 130) + 'px'; if (typeof window.chatXSyncMic === 'function') window.chatXSyncMic(); }
function chatScrollEnd() { const m = document.getElementById('chatMsgs'); if (m) m.scrollTop = m.scrollHeight; }
function chatLinkify(parent, text) {
  const re = /(https?:\/\/[^\s<>"']+)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    let url = m[1], tail = '';
    const t = /[.,;:!?)\]]+$/.exec(url);
    if (t) { tail = t[0]; url = url.slice(0, url.length - tail.length); }
    const a = chatEl('a', 'chat-link-a', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    parent.appendChild(a);
    if (tail) parent.appendChild(document.createTextNode(tail));
    last = m.index + m[1].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}
async function chatRenderConv(forceBottom) {
  const S = chatS;
  const box = document.getElementById('chatMsgs');
  if (!box || !S || !S.room) { chatRenderBanners(); return; }
  const token = ++S.renderToken || (S.renderToken = 1);
  const rs = chatRoomState(S.room);
  const room = chatRoomById(S.room);
  const items = [];
  for (const m of rs.msgs) items.push({ m, p: await chatPlain(m) });
  if (token !== S.renderToken || S.room !== (room && room.id)) return; // a newer render took over
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  const oldTop = box.scrollTop, oldHeight = box.scrollHeight;
  box.replaceChildren();
  if (rs.more) { const more = chatEl('button', 'chat-more', tk('chat.loadOlder')); more.type = 'button'; more.onclick = () => chatLoadOlder(); box.appendChild(more); }
  if (!items.length && rs.loaded) box.appendChild(chatEl('div', 'chat-empty', S.plainMode ? tk('chat.plainNote') : tk('chat.e2eeNote')));
  let prev = null;
  items.forEach(({ m, p }) => {
    if (m.leise) return; // poll votes are counted, never shown
    if (!prev || chatDayKey(prev.zeit) !== chatDayKey(m.zeit)) box.appendChild(chatEl('div', 'chat-day', chatDayLabel(m.zeit)));
    const first = !prev || prev.von !== m.von || m.zeit - prev.zeit > 5 * 60000 || chatDayKey(prev.zeit) !== chatDayKey(m.zeit);
    box.appendChild(chatBubble(m, p, first, !!(room && room.group)));
    prev = m;
  });
  if (forceBottom || nearBottom) box.scrollTop = box.scrollHeight; else box.scrollTop = oldTop + (box.scrollHeight - oldHeight);
  chatRenderBanners();
  chatRenderContext();
  chatRenderList();
}
function chatBubble(m, p, first, group) {
  const S = chatS;
  const mine = m.von === S.uid;
  const row = chatEl('div', 'chat-row ' + (mine ? 'mine' : 'theirs') + (first ? ' first' : ''));
  const b = chatEl('div', 'chat-bubble');
  row.dataset.id = m.id;
  if (group && !mine && first) {
    const person = S.roster.find(x => x.id === m.von);
    const n = chatEl('div', 'chat-sender', chatName(person));
    const mem = chatMemberOf(person);
    if (mem && mem.color && mem.color !== 'transparent') n.style.color = mem.color;
    b.appendChild(n);
  }
  if (p.del) b.appendChild(chatEl('div', 'chat-text chat-muted', '🚫 ' + chatDeletedText(p.dk)));
  else if (p.err) b.appendChild(chatEl('div', 'chat-text chat-muted', p.err === 'locked' ? '🔒 ' + tk('chat.locked') : p.err === 'nokey' ? '🔒 ' + tk('chat.nokey') : p.err === 'unverified' ? '⚠️ ' + tk('chat.unverified') : '🔒 ' + tk('chat.cantRead')));
  else {
    const x = p.msg || {};
    if (x.q) {
      const q = chatEl('div', 'chat-quote');
      const who = S.roster.find(r => r.id === x.q.u);
      q.appendChild(chatEl('div', 'chat-quote-name', x.q.u === S.uid ? tk('chat.you') : chatName(who)));
      q.appendChild(chatEl('div', 'chat-quote-text', String(x.q.x || '')));
      q.onclick = (e) => { e.stopPropagation(); const t = document.querySelector('#chatMsgs [data-id="' + CSS.escape(String(x.q.i || '')) + '"]'); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1200); } };
      b.appendChild(q);
    }
    if (x.r && chatRefDeleted(x.r)) b.appendChild(chatEl('div', 'chat-text chat-muted', '🚫 ' + tk('chat.ref.pinDeleted', { t: String(x.r.ti || '') })));
    else if (x.r) {
      const r = chatEl('button', 'chat-ref'); r.type = 'button';
      r.appendChild(chatEl('span', 'chat-ref-ico', CHAT_REF_ICONS[x.r.k] || '🔗'));
      r.appendChild(chatEl('span', 'chat-ref-title', String(x.r.ti || '')));
      r.onclick = (e) => { e.stopPropagation(); chatOpenRef(x.r); };
      b.appendChild(r);
    }
    if (x.m && typeof chatMBubble === 'function') b.appendChild(chatMBubble(x.m, m));
    if (x.l && typeof chatXLocBubble === 'function') b.appendChild(chatXLocBubble(x.l));
    if (x.p && typeof chatXPollBubble === 'function') b.appendChild(chatXPollBubble(x.p, m));
    if (x.x || (!x.m && !x.r && !x.l && !x.p)) { const t = chatEl('div', 'chat-text'); chatLinkify(t, String(x.x || '')); b.appendChild(t); }
  }
  const meta = chatEl('div', 'chat-meta');
  meta.appendChild(chatEl('span', 'chat-time', chatTime(m.zeit)));
  if (mine && !p.del) {
    if (m.failed) meta.appendChild(chatEl('span', 'chat-failed', '⚠'));
    else { const ticks = m.pending ? 0 : chatTicks(m); meta.appendChild(chatEl('span', 'chat-ticks' + (ticks === 2 ? ' read' : ''), ticks === 0 ? '🕓' : ticks === 2 ? '✓✓' : '✓')); }
  }
  b.appendChild(meta);
  if (m.failed) { const f = chatEl('div', 'chat-retry', tk('chat.notSent')); f.onclick = (e) => { e.stopPropagation(); if (m.retry) m.retry(); }; b.appendChild(f); }
  b.onclick = () => {
    if (p.err === 'locked') { S.phase = 'unlock'; chatRender(); return; } // older encrypted message: unlock with the recovery code
    if (!p.del && !m.pending && !m.failed) chatMessageSheet(m, p);
  };
  row.appendChild(b);
  return row;
}
// Text for a deleted message: "the poll was deleted" for a poll, else "this message was deleted" (1.127.6)
function chatDeletedText(dk) { return dk === 'p' ? tk('chat.pollDeleted') : tk('chat.deleted'); }
// true if a reference points to a pin board note that was deleted (only checked when the pin board is loaded and allowed)
function chatRefDeleted(r) {
  if (!r || r.k !== 'pin') return false;
  try {
    if (!isViewAllowed('pinnwand') || typeof pinboardLoadedOk !== 'function' || !pinboardLoadedOk()) return false;
    return !pinboard.some(n => n && n.id === r.id);
  } catch (e) { return false; }
}
function chatRenderBanners() {
  const box = document.getElementById('chatBanners');
  if (!box || !chatS) return;
  box.replaceChildren();
  chatRoomMembers(chatS.room).forEach(p => {
    if (p.id === chatS.uid || !p.changed) return;
    const b = chatEl('div', 'chat-banner warn');
    b.appendChild(chatEl('span', '', '⚠️ ' + tk('chat.keyChanged', { name: chatName(p) })));
    const ok = chatEl('button', 'chat-banner-btn', tk('chat.keyAccept')); ok.type = 'button'; ok.onclick = () => chatAcceptKey(p.id);
    b.appendChild(ok); box.appendChild(b);
  });
  const missing = chatRoomMembers(chatS.room).filter(p => p.id !== chatS.uid && !p.oeffentlich).map(chatName);
  if (missing.length) box.appendChild(chatEl('div', 'chat-banner', '🔒 ' + tk('chat.notSetUp', { names: missing.join(', ') })));
}
function chatRenderContext() {
  const S = chatS;
  const ctx = document.getElementById('chatCtx');
  if (typeof window.chatXSyncMic === 'function') window.chatXSyncMic();
  if (!ctx) return;
  ctx.replaceChildren();
  const item = S.reply ? { title: S.reply.uid === S.uid ? tk('chat.you') : chatName(S.roster.find(r => r.id === S.reply.uid)), text: S.reply.text, drop: () => { S.reply = null; chatRenderContext(); } }
    : S.ref ? { title: (CHAT_REF_ICONS[S.ref.k] || '🔗') + ' ' + tk('chat.reference'), text: S.ref.ti || '', drop: () => { S.ref = null; chatRenderContext(); } } : null;
  ctx.classList.toggle('hidden', !item);
  if (!item) return;
  const body = chatEl('div', 'chat-ctx-body');
  body.appendChild(chatEl('div', 'chat-quote-name', item.title));
  body.appendChild(chatEl('div', 'chat-quote-text', item.text));
  ctx.appendChild(body);
  const x = chatEl('button', 'chat-icon-btn dark', '✕'); x.type = 'button'; x.setAttribute('aria-label', tk('chat.cancel')); x.onclick = item.drop;
  ctx.appendChild(x);
}

/* ---------------------------------------------------------------- sheets */
function chatSheetShell(title) {
  const root = chatRoot();
  let sh = document.getElementById('chatSheet');
  if (sh) sh.remove();
  sh = chatEl('div', 'chat-sheet-back'); sh.id = 'chatSheet';
  sh.onclick = (e) => { if (e.target === sh) { chatS.sheet = null; sh.remove(); } };
  const card = chatEl('div', 'chat-sheet');
  if (title) card.appendChild(chatEl('h3', 'chat-sheet-title', title));
  sh.appendChild(card); root.appendChild(sh);
  return card;
}
function chatCloseSheet() { const sh = document.getElementById('chatSheet'); if (sh) sh.remove(); if (chatS) chatS.sheet = null; }
function chatMessageSheet(m, p) {
  const S = chatS;
  const card = chatSheetShell('');
  const act = (label, fn, danger) => { const b = chatEl('button', 'chat-sheet-act' + (danger ? ' danger' : ''), label); b.type = 'button'; b.onclick = () => { chatCloseSheet(); fn(); }; card.appendChild(b); };
  const text = p.msg ? chatPlainText(p.msg) : '';
  act('↩︎ ' + tk('chat.reply'), () => { S.reply = { id: m.id, uid: m.von, text }; S.ref = null; chatRenderContext(); const i = document.getElementById('chatInput'); if (i) i.focus(); });
  if (p.msg && p.msg.x) act('⧉ ' + tk('chat.copy'), async () => { try { await navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked */ } });
  if (m.von === S.uid) act('🗑 ' + tk('chat.delete'), () => { if (confirm(tk('chat.deleteConfirm'))) chatDelete(m); }, true);
  if (m.von === S.uid) {
    const readers = chatRecipients(m).filter(id => m.gelesen && m.gelesen[id]).map(id => chatName(S.roster.find(r => r.id === id)));
    card.appendChild(chatEl('div', 'chat-sheet-note', readers.length ? tk('chat.readBy', { names: readers.join(', ') }) : tk('chat.notReadYet')));
  }
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}
async function chatRenderSheet() {
  const S = chatS;
  if (S.sheet !== 'info') return;
  const card = chatSheetShell(tk('chat.info.title'));
  card.classList.add('wide');
  card.appendChild(chatEl('p', 'chat-sheet-text', tk('chat.info.limits')));
  card.appendChild(chatEl('h4', 'chat-sheet-sub', tk('chat.info.members')));
  card.appendChild(chatEl('p', 'chat-sheet-text small', tk('chat.info.numberHelp')));
  for (const p of S.roster) {
    const row = chatEl('div', 'chat-num-row');
    row.appendChild(chatAvatar(p, false, 32));
    const mid = chatEl('div', 'chat-num-mid');
    mid.appendChild(chatEl('div', 'chat-num-name', p.id === S.uid ? chatName(p) + ' (' + tk('chat.you') + ')' : chatName(p)));
    const num = chatEl('div', 'chat-num', p.oeffentlich ? '…' : tk('chat.info.notSetUp'));
    mid.appendChild(num); row.appendChild(mid); card.appendChild(row);
    if (p.oeffentlich) chatNumber([p.oeffentlich]).then(n => { num.textContent = n; });
  }
  const rec = chatEl('label', 'chat-switch');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = S.receipts !== false;
  cb.onchange = async () => { try { await chatPost('settings', { lese: cb.checked }); S.receipts = cb.checked; } catch (e) { cb.checked = !cb.checked; } };
  rec.appendChild(cb);
  const lab = chatEl('span', 'chat-switch-text'); lab.appendChild(chatEl('span', 'chat-switch-title', tk('chat.info.receipts'))); lab.appendChild(chatEl('span', 'chat-switch-help', tk('chat.info.receiptsHelp')));
  rec.appendChild(lab); card.appendChild(rec);
  if (typeof chatXModeUi === 'function') chatXModeUi(card);
  if (typeof chatMRetentionUi === 'function') chatMRetentionUi(card);
  const cur = chatRoomById(S.room);
  if (cur && typeof chatXMuteSheet === 'function') { const mu = chatEl('button', 'chat-sheet-act', (chatXMuted(cur.id) ? '🔕 ' : '🔔 ') + tk('chat.mute.title')); mu.type = 'button'; mu.onclick = () => chatXMuteSheet(cur); card.appendChild(mu); }
  const code = chatEl('button', 'chat-sheet-act', '🔑 ' + tk('chat.info.newCode')); code.type = 'button';
  code.onclick = async () => { try { await chatNewRecoveryCode(); } catch (e) { alert(tk('chat.error.send')); } };
  card.appendChild(code);
  const reset = chatEl('button', 'chat-sheet-act danger', '⎋ ' + tk('chat.info.resetDevice')); reset.type = 'button';
  reset.onclick = async () => { if (!confirm(tk('chat.info.resetConfirm'))) return; try { await chatKeyDel(S.uid); } catch (e) { /* ignore */ } chatLeave(); const keep = chatS; chatS = chatNewState(S.uid); chatS.pins = keep.pins; chatBoot(); };
  card.appendChild(reset);
  const close = chatEl('button', 'chat-sheet-act muted', tk('chat.close')); close.type = 'button'; close.onclick = chatCloseSheet; card.appendChild(close);
}

// Reload when the page becomes visible again (new messages came in while the phone was asleep)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (chatS && chatS.phase === 'ready' && typeof currentView !== 'undefined' && currentView === 'chat') chatPoll();
  else chatBadgeTick(); // back in the app: refresh the number in the menu right away
});
window.addEventListener('focus', () => { if (typeof currentView !== 'undefined' && currentView !== 'chat') chatBadgeTick(); });

(window.PINN_PARTS = window.PINN_PARTS || []).push('chat');
