/* pinn. – js/kassen.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/vorrat.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.55.0, only the comments were translated):
   - Cash boxes (Kassen) – separate finance areas: household box, personal box per profile, shared
     boxes (flat share, holiday, couple …) with members and guests without a profile
   - Loading, switching and saving a box (offline queue, conflict protection, rescue of old cached
     finance data), the box switcher in Finanzen and Fahrzeuge, the popups for boxes and settlements
   - Splitting expenses („Wer schuldet wem“), booking a purchase into a box with a private share,
     assigning shopping lists to a box, pocket money on the children's page
   84 functions and 24 variables, 3 statements run while this file loads (the listeners for
   visibilitychange and online, and initKassenUi, which only wires clicks and input events; no timers
   and no calls into other files).
   index.html only calls the functions of this file later (when the user acts or from bootApp),
   never while it is still loading. */

/* ==========================================================
   Cash boxes (Kassen) – separate finance areas (pb_hooks/kassen.pb.js + pinn-kassen.js)
   ----------------------------------------------------------
   - Household box (default): all profiles of the family or only selected ones (e.g. without teenagers).
   - Personal box per profile („Meine Kasse“): only oneself – optionally shared with selected people.
   - Shared boxes (flat share, holiday, couple …): the person who creates one chooses the members.
   - Every box has its own finance data (budget, categories, recurring bookings, savings,
     pocket money, contracts, vehicles) and its own bookings. Whoever is not a member gets none of it
     from the server – not even receipts.
   - The app always shows ONE box (switcher at the top of Finanzen and Fahrzeuge). The global variable
     `finance` holds its finance data, `ausgaben` its bookings – everything else calculates as before.
   - „Ausgaben aufteilen“ (splitting expenses): bookings have „Bezahlt von“ (paid by) and „Aufteilen auf“
     (split between; split, member IDs; empty = everyone). From this results „Wer schuldet wem“ (who owes
     whom); a settlement is a booking of the category „ausgleich“ (paidBy = pays, split[0] = receives)
     and never counts as an expense.
   - Shopping lists can be assigned to a box (edit list). When a shopping trip is finished, the amount
     lands there – split in a shared box, a private share in the personal box.
   - Offline-capable like the family data: changes to `finance` are detected when saving (persistState),
     queued locally and sent with conflict protection (merging like mergeFamilyData).
   ========================================================== */
const LS_KASSEN = 'pinn.kassen';
const LS_KASSEN_PENDING = 'pinn.kassen.pending';
const FIN_SETTLE_CATEGORY = 'ausgleich';
const KASSE_ICONS = ['🏠', '👤', '👥', '🍕', '🏖️', '💑', '🎓', '🚗', '🐾', '🎉', '🛒', '💶', '🏡', '⚽', '🎸', '✈️'];
let kassen = [];             // { id, name, icon, color, art, members, all, owner, split, updated, canManage, data }
let kassenServer = null;     // null = unknown, true = server with boxes, false = older server without boxes
let activeKasseId = '';
let kasseWorkingJson = '';
let kassenLoading = null;
let kassenLoadedAt = 0;
let kassenFlushing = false;
let kassenFlushTimer = null;
let kassenRetryTimer = null;
let kassenPendingMemory = null;
let kassenSeq = Date.now();
let kassePendingOpen = '';
let kassenLastError = '';
const kasseSplitState = { expense: [], checkout: [] };
const kasseSplitKasse = { expense: '', checkout: '' };
let checkoutKasseId = '';

function kassenUserTag() {
  const u = currentUser();
  return u ? (u.id + '|' + (u.familie || '')) : '';
}
function kassenCacheRead() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_KASSEN) || 'null');
    if (c && c.user === kassenUserTag() && Array.isArray(c.list)) return c;
  } catch (e) { /* ignore */ }
  return null;
}
function kassenCacheWrite() {
  try { localStorage.setItem(LS_KASSEN, JSON.stringify({ user: kassenUserTag(), list: kassen, active: activeKasseId })); } catch (e) { /* full – memory only */ }
}
function kassenPendingRead() {
  let p = kassenPendingMemory;
  try { const raw = localStorage.getItem(LS_KASSEN_PENDING); if (raw) p = JSON.parse(raw); } catch (e) { p = kassenPendingMemory; }
  if (!p || p.user !== kassenUserTag() || !p.items || typeof p.items !== 'object') return {};
  return p.items;
}
function kassenPendingWrite(items) {
  const p = { user: kassenUserTag(), items: items || {} };
  kassenPendingMemory = p;
  try { localStorage.setItem(LS_KASSEN_PENDING, JSON.stringify(p)); } catch (e) { /* memory only */ }
}

function kasseById(id) { return id ? (kassen.find(k => k.id === id) || null) : null; }
function activeKasse() { return kasseById(activeKasseId); }
function kasseHaushalt() { return kassen.find(k => k.art === 'haushalt') || null; }
function kasseHaushaltId() { const h = kasseHaushalt(); return h ? h.id : ''; }
function kasseOwn() { const u = currentUser(); return u ? (kassen.find(k => k.art === 'privat' && k.owner === u.id) || null) : null; }
// Family group („Familie (alle)“): belongs to everyone, takes contracts without a box of their own – in
// expenses and savings it is not a box
function kasseIsReal(k) { return !!k && k.art !== 'familie'; }
function kassenReal() { return kassen.filter(kasseIsReal); }
function kassenRealSorted() { return kassenSorted().filter(kasseIsReal); }
function kasseFamilie() { return kassen.find(k => k.art === 'familie') || null; }
function kasseStandard() { return kassenRealSorted()[0] || null; }
function kasseDefaultId() {
  const s = kasseStandard(); if (s) return s.id;
  const f = kasseFamilie(); if (f) return f.id;
  return kassen[0] ? kassen[0].id : '';
}
// Finanzen → Ausgaben or Sparen (only real boxes count there)
function finIsKasseTab() { return currentView === 'finanzen' && (finTab === 'ausgaben' || finTab === 'sparen'); }
function kassenActiveMode() { return kassenServer === true && !isCurrentUserGuest(); }
function kassePeople() { return familyProfiles.filter(p => p && p.rolle !== 'gast' && p.rolle !== 'hauptadmin'); }
function kasseUserIds(k) {
  if (!k) return [];
  return k.all ? kassePeople().map(p => p.id) : (Array.isArray(k.members) ? k.members : []);
}
// Family members (IDs) of a box – via the link between profile ↔ member
// … plus the guests without a profile (they count like members when splitting)
function kasseMemberIds(k) {
  if (!k) return [];
  let out = [];
  kasseUserIds(k).forEach(uid => {
    const p = familyProfiles.find(x => x.id === uid);
    if (p && p.mitglied && memberById(p.mitglied) && !out.includes(p.mitglied)) out.push(p.mitglied);
  });
  if (!out.length && k.all) out = members.map(m => m.id);
  kasseGuests(k).forEach(g => { if (!out.includes(g.id)) out.push(g.id); });
  return out;
}
/* ---------- Guests without a profile (e.g. friends on holiday) ----------
   Stored on the server in the box (field „gaeste“): { id: 'gast-…', name, color, removed? }. They do not see
   the box, but are available for selection at „Bezahlt von“, „Aufteilen auf“ and „Wer schuldet wem“.
   A guest looks like a family member (name, color) – memberLabel & co. therefore work with it. */
const KASSE_GUEST_COLORS = ['#8A8F98', '#C0846A', '#6A8FB0', '#9B7FB8', '#7FA37A', '#C7A55A', '#B87A8F', '#5F9EA0'];
function kasseIsGuestId(id) { return /^gast-[a-z0-9]{6,20}$/.test(String(id || '')); }
function kasseGuests(k, withRemoved) {
  const list = k && Array.isArray(k.guests) ? k.guests.filter(g => g && kasseIsGuestId(g.id)) : [];
  return withRemoved ? list : list.filter(g => !g.removed);
}
function kasseGuestById(id) {
  if (!kasseIsGuestId(id)) return null;
  for (const k of kassen) {
    const g = (Array.isArray(k.guests) ? k.guests : []).find(x => x && x.id === id);
    if (g) return { id: g.id, name: g.name || 'Gast', color: g.color || KASSE_GUEST_COLORS[0], guest: true, removed: !!g.removed };
  }
  return null;
}
// Family member or guest of a box
function kassePartById(id) { return (id && memberById(id)) || kasseGuestById(id); }
function kasseNewGuestId() {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return 'gast-' + s;
}
function kasseGuestAvatar(g, size = 26) {
  const m = { name: g.name || '?', color: g.color || KASSE_GUEST_COLORS[0] };
  return `<span style="width:${size}px;height:${size}px;border-color:${memberBorderColor(m)}" class="inline-block rounded-full overflow-hidden border-2 shrink-0">${memberAvatarInnerHTML(m)}</span>`;
}
// Does a guest appear in bookings of this box (including recurring ones)?
function kasseGuestUsed(kasseId, gid) {
  if (!kasseId || !gid) return false;
  const k = kasseById(kasseId);
  const h = kasseHaushaltId();
  const hit = e => e && (e.paidBy === gid || (Array.isArray(e.split) && e.split.includes(gid)));
  const lists = [finServerList || []];
  if (kasseId === activeKasseId) lists.push(ausgaben || []);
  if (lists.some(l => l.some(e => (e.kasse || h) === kasseId && hit(e)))) return true;
  const d = k ? kasseWorkingData(k) : null;
  return !!(d && Array.isArray(d.recurring) && d.recurring.some(hit));
}
function kasseIsShared(k) { return !!(k && k.split && kasseMemberIds(k).length > 1); }
function kasseProfileName(uid) {
  const p = familyProfiles.find(x => x.id === uid);
  if (!p) return 'jemand';
  const m = p.mitglied ? memberById(p.mitglied) : null;
  return m ? memberLabel(m) : (p.username || 'jemand');
}
function kasseProfileAvatar(uid, size = 22) {
  const p = familyProfiles.find(x => x.id === uid);
  const m = p && p.mitglied ? memberById(p.mitglied) : null;
  const inner = m ? memberAvatarInnerHTML(m) : `<span class="flex items-center justify-center w-full h-full text-white text-[10px] font-semibold" style="background:#9A9A92">${escapeHtml(((p && p.username) || '?').charAt(0).toUpperCase())}</span>`;
  return `<span style="width:${size}px;height:${size}px;border-color:${m ? memberBorderColor(m) : 'transparent'}" class="inline-block rounded-full overflow-hidden border-2 shrink-0">${inner}</span>`;
}
function kasseDisplayName(k) {
  if (!k) return '';
  if (k.art === 'familie') return 'Familie (alle)';
  const u = currentUser();
  if (k.art === 'privat') {
    if (u && k.owner === u.id) return k.name && k.name !== 'Privat' ? k.name : 'Meine Kasse';
    return (k.name && k.name !== 'Privat' ? k.name : 'Kasse') + ' von ' + kasseProfileName(k.owner);
  }
  return k.name || 'Kasse';
}
function kasseDescribe(k) {
  const u = currentUser();
  const n = kasseUserIds(k).length;
  let t;
  if (k.art === 'familie') return 'Alle Profile der Familie · Verträge ohne eigene Kasse';
  if (k.art === 'haushalt') t = k.all ? 'Alle Profile der Familie' : `${n} ${n === 1 ? 'Person' : 'Personen'}`;
  else if (k.art === 'privat') {
    if (u && k.owner === u.id) t = n > 1 ? `Deine Kasse · geteilt mit ${n - 1} ${n - 1 === 1 ? 'Person' : 'Personen'}` : 'Nur du';
    else t = 'Mit dir geteilt';
  } else t = `${n} ${n === 1 ? 'Person' : 'Personen'}`;
  const gn = kasseGuests(k).length;
  if (gn) t += ` + ${gn} ${gn === 1 ? 'Gast' : 'Gäste'}`;
  if (k.split && n + gn > 1) t += ' · Ausgaben werden aufgeteilt';
  return t;
}
function kassenSorted() {
  const u = currentUser();
  const rank = k => k.art === 'familie' ? 5 : k.art === 'haushalt' ? 0 : (k.art === 'privat' && u && k.owner === u.id) ? 1 : k.art === 'gemeinsam' ? 2 : 3;
  return kassen.slice().sort((a, b) => rank(a) - rank(b) || kasseDisplayName(a).localeCompare(kasseDisplayName(b), 'de'));
}
function kasseWorkingData(k) {
  if (!k) return null;
  const p = kassenPendingRead()[k.id];
  return p && p.local ? p.local : (k.data || {});
}
// Bookings of the box currently shown (old bookings without a box belong to the household box)
function kassenFilterEntries(list) {
  if (kassenServer !== true) return list;
  const h = kasseHaushaltId();
  return list.filter(e => (e.kasse || h) === activeKasseId);
}
// Box that a purchase from this list is booked into
function kasseForList(listId) {
  const list = getShoppingList(listId);
  const want = list && list.kasse;
  if (want && kasseById(want)) return want;
  const s = kasseStandard();
  return s ? s.id : activeKasseId;
}

/* ---------- Loading, switching, saving ---------- */
function kassenRerender() {
  try {
    renderKassePills();
    if (currentView === 'finanzen') renderFinance();
    if (currentView === 'fahrzeuge') renderVehicles();
    if (currentView === 'haus') renderHouse();
    if (kidPageMemberId) renderKidPage();
    refreshOverviewTiles();
  } catch (e) { console.warn('Kassen: Neuzeichnen fehlgeschlagen', e); }
}
function kassenApplyActive(render) {
  const k = activeKasse();
  finance = normalizeFinance(k ? kasseWorkingData(k) : null);
  kasseWorkingJson = JSON.stringify(finance);
  try { rebuildAusgaben(); } catch (e) { /* finance not ready yet */ }
  if (render) kassenRerender(); else { try { renderKassePills(); } catch (e) { /* ignore */ } }
}
// From applyFamilyData: finance data comes from the box – from the family data only without a box server
function kassenOnFamilyData(data) {
  if (isCurrentUserGuest()) { finance = normalizeFinance(data.finance); return; }
  if (kassenServer === true) { if (!finance) kassenApplyActive(false); return; }
  if (kassenServer === null) {
    const c = kassenCacheRead();
    if (c && c.list.length) {
      kassen = c.list;
      activeKasseId = c.active || '';
      kassenServer = true;
      if (!kasseById(activeKasseId)) activeKasseId = kasseDefaultId();
      kassenApplyActive(false);
      return;
    }
  }
  // Without (known) boxes: like before from the family data – but never replace existing data
  // with an empty state (after the move „finance“ is missing in the family record)
  if (data.finance && typeof data.finance === 'object') finance = normalizeFinance(data.finance);
  else if (!finance) finance = normalizeFinance(null);
}

/* ---------- Rescue: finance data from the old cached state of this device ----------
   Before the move the finance data lived in the family record. If this device still has an older
   cached state of it, it is backed up before the first load and sent to the server once.
   The server only adds to the household box what is missing there (never deletes anything). */
function kassenRescueKey() {
  const fam = (currentUser() && currentUser().familie) || '';
  return fam ? 'pinn.kassen.rettung.' + fam : '';
}
function kassenFinanceHasContent(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return false;
  return ['vehicles', 'homes', 'contracts', 'recurring', 'depots', 'savingsGoals', 'pocketMoney', 'pocketLedger'].some(k => Array.isArray(f[k]) && f[k].length) || Number(f.budget) > 0;
}
function kassenStashRescue() {
  try {
    const key = kassenRescueKey();
    if (!key || isCurrentUserGuest() || localStorage.getItem(key + '.fertig') === KASSEN_RESCUE_STUFE) return;
    const c = readCache();
    const p = readPending();
    const cands = [p && p.local && p.local.finance, c && c.data && c.data.finance].filter(kassenFinanceHasContent);
    if (!cands.length) return;
    const best = cands.map(f => JSON.stringify(f)).sort((a, b) => b.length - a.length)[0];
    const prev = localStorage.getItem(key);
    if (!prev || prev.length < best.length) localStorage.setItem(key, best);
  } catch (e) { /* storage full – then so be it */ }
}
let kassenRescueRunning = false;
const KASSEN_RESCUE_STUFE = '2';
async function kassenSendRescue() {
  const key = kassenRescueKey();
  if (!key || kassenRescueRunning || !kasseHaushalt()) return;
  let raw = null;
  try { if (localStorage.getItem(key + '.fertig') === KASSEN_RESCUE_STUFE) return; raw = localStorage.getItem(key); } catch (e) { return; }
  if (!raw) return;
  kassenRescueRunning = true;
  try {
    const body = await postJson('/api/pinn/kassen/retten', { daten: JSON.parse(raw) });
    if (body.success || body.expired) {
      try { localStorage.setItem(key + '.fertig', KASSEN_RESCUE_STUFE); } catch (e) { /* ignore – the cached state is kept */ }
      if (body.added > 0) {
        finShowToast(`${body.added} fehlende Finanz-Einträge (Fahrzeuge, regelmäßige Buchungen, Verträge …) wiederhergestellt.`);
        kassenLoadedAt = 0;
        kassenLoad(true);
      }
    }
  } catch (e) { /* offline – next time */ }
  finally { kassenRescueRunning = false; }
}
// Detect changes to finance of the box shown and queue them for sending
function kassenCapture() {
  if (!kassenActiveMode() || !finance || !activeKasseId) return;
  const k = activeKasse();
  if (!k) return;
  let j;
  try { j = JSON.stringify(finance); } catch (e) { return; }
  if (j === kasseWorkingJson) return;
  kasseWorkingJson = j;
  const items = kassenPendingRead();
  const p = items[k.id];
  items[k.id] = { seq: ++kassenSeq, base: p ? p.base : (k.data || {}), baseUpdated: p ? p.baseUpdated : (k.updated || ''), local: JSON.parse(j) };
  kassenPendingWrite(items);
  clearTimeout(kassenFlushTimer);
  kassenFlushTimer = setTimeout(kassenFlush, 300);
}
function kassenRetryLater() {
  clearTimeout(kassenRetryTimer);
  kassenRetryTimer = setTimeout(kassenFlush, 20 * 1000);
}
async function kassenFlush() {
  if (kassenFlushing || kassenServer !== true) return;
  kassenFlushing = true;
  try {
    for (let guard = 0; guard < 25; guard++) {
      const items = kassenPendingRead();
      const ids = Object.keys(items);
      if (!ids.length) break;
      const id = ids[0];
      const sent = items[id];
      const k = kasseById(id);
      if (!k || !sent || !sent.local) { delete items[id]; kassenPendingWrite(items); continue; }
      let res, body;
      try {
        res = await apiFetch('/api/pinn/kassen/speichern', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, expectedUpdated: sent.baseUpdated || '', daten: sent.local }),
        });
        body = await res.json().catch(() => ({}));
      } catch (e) { kassenRetryLater(); return; }
      const now = kassenPendingRead();
      const cur = now[id];
      if (res.ok && body.success) {
        k.data = sent.local;
        k.updated = body.updated || k.updated;
        if (cur && cur.seq === sent.seq) delete now[id];
        else if (cur) { cur.base = sent.local; cur.baseUpdated = k.updated; }
        kassenPendingWrite(now);
        kassenCacheWrite();
        continue;
      }
      if (res.status === 409 && body.conflict) {
        const remote = body.data || {};
        const latest = cur || sent;
        const merged = mergeFamilyData(latest.base || {}, latest.local, remote);
        k.data = remote;
        k.updated = body.updated || '';
        now[id] = { seq: ++kassenSeq, base: remote, baseUpdated: k.updated, local: merged };
        kassenPendingWrite(now);
        kassenCacheWrite();
        if (id === activeKasseId) {
          finance = normalizeFinance(merged);
          kasseWorkingJson = JSON.stringify(finance);
          kassenRerender();
        }
        continue;
      }
      if (body.gone || res.status === 403 || res.status === 404) {
        delete now[id];
        kassenPendingWrite(now);
        kassenLoad(true);
        continue;
      }
      kassenRetryLater();
      return;
    }
  } finally {
    kassenFlushing = false;
  }
}
async function kassenLoad(force) {
  if (isCurrentUserGuest() || !currentUser() || !currentUser().familie) return;
  if (kassenLoading) return kassenLoading;
  if (!force && kassenLoadedAt && Date.now() - kassenLoadedAt < 25 * 1000) return;
  kassenLoading = (async () => {
    let res, body;
    try {
      const stand = {};
      kassen.forEach(k => { if (k.data && k.updated) stand[k.id] = k.updated; });
      res = await apiFetch('/api/pinn/kassen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ stand }),
      });
      body = await res.json().catch(() => ({}));
    } catch (e) { kassenLastError = navigator.onLine ? 'Server nicht erreichbar.' : 'Keine Verbindung.'; kassenErrorRender(); return; } // offline – carry on with the cached state
    if (res.status === 404 && !Array.isArray(body.kassen)) {
      if (kassenServer !== true) kassenServer = false;
      kassenLastError = 'Der Server kennt die Kassen noch nicht (kassen.pb.js und pinn-kassen.js in pb_hooks, PocketBase neu starten).';
      kassenErrorRender();
      return;
    }
    if (!res.ok || !Array.isArray(body.kassen)) {
      const why = body && (body.error || body.message);
      kassenLastError = why ? 'Fehler vom Server: ' + why : `Kassen konnten nicht geladen werden (Antwort ${res.status}).`;
      console.warn('Kassen:', res.status, body);
      kassenErrorRender();
      return;
    }
    kassenLastError = '';
    kassenLoadedAt = Date.now();
    kassenCapture(); // do not overwrite unsaved changes
    const first = kassenServer !== true;
    kassenServer = true;
    const before = activeKasse();
    const beforeId = before ? before.id : '';
    const beforeUpdated = before ? before.updated : '';
    const old = new Map(kassen.map(k => [k.id, k]));
    kassen = body.kassen.map(k => {
      const o = old.get(k.id);
      return { ...k, data: k.data !== undefined ? k.data : (o && o.data ? o.data : {}) };
    });
    const items = kassenPendingRead();
    Object.keys(items).forEach(id => { if (!kasseById(id)) delete items[id]; });
    kassenPendingWrite(items);
    if (!kasseById(activeKasseId)) activeKasseId = kasseDefaultId();
    kassenCacheWrite();
    const act = activeKasse();
    const changed = first || !act || act.id !== beforeId || act.updated !== beforeUpdated;
    if (changed && !(act && items[act.id])) kassenApplyActive(true);
    else renderKassePills();
    kasseHandleUrl();
    kassenFlush();
    setTimeout(kassenSendRescue, 500);
  })();
  try { await kassenLoading; } finally { kassenLoading = null; }
}
function kassenErrorRender() {
  renderKassePills();
  if (currentView === 'finanzen') { try { renderFinance(); } catch (e) { /* ignore */ } }
}
function kassenSetActive(id) {
  if (!kasseById(id)) return;
  kassenCapture();
  activeKasseId = id;
  finCategoryFilter = null;
  kassenCacheWrite();
  kassenApplyActive(true);
  kassenFlush();
}
// Push message „… hat dich zur Kasse hinzugefügt“ (added you to the box): /?kasse=<ID>
function kasseOpenFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const id = params.get('kasse');
    if (!id) return;
    kassePendingOpen = id;
    params.delete('kasse');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    kassenLoad(true);
  } catch (e) { /* ignore */ }
}
function kasseHandleUrl() {
  if (!kassePendingOpen) return;
  const id = kassePendingOpen;
  kassePendingOpen = '';
  if (!kasseById(id)) return;
  kassenSetActive(id);
  try { setView('finanzen'); } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') kassenCapture();
  else if (kassenServer === true) kassenFlush();
});
window.addEventListener('online', () => { if (kassenServer === true) kassenFlush(); });

/* ---------- Switcher at the top (Finanzen, Fahrzeuge) ---------- */
function renderKassePills() {
  ['kassePillFin', 'kassePillFz', 'kassePillHs'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    const k = kassenActiveMode() ? activeKasse() : null;
    const show = !isCurrentUserGuest() && !!currentUser();
    b.classList.toggle('hidden', !show);
    if (!show) return;
    const noReal = id === 'kassePillFin' && finIsKasseTab() && !kasseIsReal(k);
    const kk = noReal ? null : k;
    b.style.setProperty('--k', kk ? (kk.color || '#2F4B41') : '#9A9A92');
    const label = kk ? kasseDisplayName(kk) : (kassenLastError ? 'Kassen nicht erreichbar' : (noReal && kassenActiveMode()) ? 'Noch keine Kasse' : 'Kassen');
    b.innerHTML = `<span class="kasse-sub-dot"></span><span class="truncate">${escapeHtml(label)}</span><span class="text-ink/35 shrink-0">· wechseln</span><svg class="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`;
    b.title = kk ? 'Kasse wechseln oder neue anlegen – ' + kasseDescribe(kk) : 'Kassen';
  });
}

/* ---------- Popup: Kassen ---------- */
function openKassenModal() {
  renderKassenModal();
  document.getElementById('kassenModal').classList.remove('hidden');
  kassenLoad(true).then(() => { if (!document.getElementById('kassenModal').classList.contains('hidden')) renderKassenModal(); });
}
function closeKassenModal() { document.getElementById('kassenModal').classList.add('hidden'); }
function renderKassenModal() {
  const wrap = document.getElementById('kassenList');
  wrap.innerHTML = kassenSorted().filter(k => !(k.art === 'familie' && finIsKasseTab())).map(k => {
    const ids = kasseUserIds(k);
    const avs = ids.slice(0, 5).map(uid => kasseProfileAvatar(uid, 22)).join('');
    const more = ids.length > 5 ? `<span class="text-[11px] text-ink/40 ml-1 self-center">+${ids.length - 5}</span>` : '';
    const on = k.id === activeKasseId;
    return `
      <div class="kasse-row ${on ? 'active' : ''}" style="--k:${escapeHtml(k.color || '#2F4B41')}">
        <button type="button" class="flex items-center gap-3 flex-1 min-w-0 text-left" data-kasse-pick="${escapeHtml(k.id)}">
          <span class="kasse-dot">${escapeHtml(k.icon || '💶')}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(kasseDisplayName(k))}${on ? ' <span class="text-pine">✓</span>' : ''}</span>
            <span class="block text-[11px] text-ink/45 truncate">${escapeHtml(kasseDescribe(k))}</span>
            <span class="kasse-avs mt-1">${avs}${more}</span>
          </span>
        </button>
        <button type="button" class="shrink-0 w-9 h-9 rounded-lg border border-ink/15 text-ink/50 hover:text-pine hover:border-pine transition grid place-items-center" data-kasse-edit="${escapeHtml(k.id)}" aria-label="Kasse einstellen" title="${k.canManage ? 'Einstellen' : 'Mitglieder ansehen'}">⚙︎</button>
      </div>`;
  }).join('') || `<p class="text-sm ${kassenLastError ? 'text-red-500' : 'text-ink/40 italic'}">${escapeHtml(kassenLastError || 'Kassen werden geladen …')}</p>`;
  document.getElementById('kasseNewBtn').classList.toggle('hidden', !kassenActiveMode());
  wrap.querySelectorAll('[data-kasse-pick]').forEach(b => b.addEventListener('click', () => {
    kassenSetActive(b.dataset.kassePick);
    closeKassenModal();
    finShowToast('Kasse: ' + kasseDisplayName(activeKasse()));
  }));
  wrap.querySelectorAll('[data-kasse-edit]').forEach(b => b.addEventListener('click', () => openKasseEdit(b.dataset.kasseEdit)));
}

/* ---------- Popup: create / edit a box ---------- */
let kasseEditDraft = null;
function openKasseEdit(id) {
  const k = id ? kasseById(id) : null;
  const me = currentUser() ? currentUser().id : '';
  kasseEditDraft = k
    ? { id: k.id, art: k.art, name: k.name || '', icon: k.icon || '💶', color: k.color || PALETTE[0], members: new Set(k.all ? kasseUserIds(k) : (k.members || [])), all: !!k.all, split: !!k.split, canManage: !!k.canManage, owner: k.owner || '', guests: kasseGuests(k, true).map(g => ({ ...g })) }
    : { id: '', art: 'gemeinsam', name: '', icon: '💶', color: PALETTE[kassenReal().length % PALETTE.length] || '#B9842E', members: new Set([me]), all: false, split: false, canManage: true, owner: me, guests: [] };
  document.getElementById('kasseEditError').classList.add('hidden');
  renderKasseEdit();
  document.getElementById('kasseEditModal').classList.remove('hidden');
  if (!k && !isMobile()) setTimeout(() => { const n = document.getElementById('kasseEditName'); if (n) n.focus(); }, 60);
}
function closeKasseEdit() { document.getElementById('kasseEditModal').classList.add('hidden'); kasseEditDraft = null; }
function renderKasseEdit() {
  const d = kasseEditDraft;
  if (!d) return;
  const ro = !d.canManage;
  const me = currentUser() ? currentUser().id : '';
  const nameEl = document.getElementById('kasseEditName');
  if (nameEl) d.name = nameEl.value;
  const artText = d.art === 'familie'
    ? 'Die Familien-Gruppe gehört automatisch allen Profilen der Familie (außer Gästen). Hier liegen Verträge, die keiner eigenen Kasse zugeordnet sind. Profile mit Kindersicherung öffnen Finanzen und Dokumente gar nicht.'
    : d.art === 'haushalt'
    ? 'Die Haushaltskasse ist der Standard: Hierhin gehen Einkäufe und Buchungen, wenn nichts anderes gewählt ist. Wer nicht dazugehört (z. B. Jugendliche mit eigenen Finanzen), sieht nichts davon – auch keine Verträge, Depots oder Belege.'
    : d.art === 'privat'
      ? 'Deine eigene Kasse. Niemand sonst sieht sie – außer den Personen, mit denen du sie hier teilst (z. B. Partner).'
      : 'Wähle, wer zu dieser Kasse gehört – z. B. nur die Eltern (Kinder ausgeschlossen), alle aus der WG oder nur du. Nur die Mitglieder sehen ihre Buchungen, Sparen, Verträge und Dokumente.';
  const people = kassePeople();
  const peopleHtml = people.map(p => {
    const fixed = d.art !== 'haushalt' && p.id === d.owner;
    const checked = (d.art === 'haushalt' && d.all) || d.members.has(p.id) || fixed;
    const dis = ro || fixed || (d.art === 'haushalt' && d.all);
    const sub = p.rolle === 'admin' ? 'Admin' : '';
    return `
      <label class="flex items-center gap-2.5 py-1.5 ${dis ? '' : 'cursor-pointer'} select-none">
        <input type="checkbox" class="kasse-person-cb w-4 h-4 shrink-0" value="${escapeHtml(p.id)}" ${checked ? 'checked' : ''} ${dis ? 'disabled' : ''} />
        ${kasseProfileAvatar(p.id, 26)}
        <span class="flex-1 min-w-0 text-sm truncate">${escapeHtml(kasseProfileName(p.id))}${p.id === me ? ' <span class="text-ink/40">(du)</span>' : ''}</span>
        <span class="text-[10px] text-ink/40">${fixed ? (d.art === 'privat' ? 'Besitzer' : 'angelegt') : escapeHtml(sub)}</span>
      </label>`;
  }).join('');
  const isOwnPrivate = d.art === 'privat' && d.owner === me;
  const title = !d.id ? 'Neue Kasse' : ro ? (kasseDisplayName(kasseById(d.id)) || 'Kasse') : 'Kasse einstellen';
  document.getElementById('kasseEditTitle').textContent = title;
  document.getElementById('kasseEditBody').innerHTML = `
    <p class="text-xs text-ink/50 mb-4 leading-snug">${escapeHtml(artText)}</p>
    <label class="block text-xs uppercase tracking-wide text-ink/40 mb-1" for="kasseEditName">Name</label>
    <input id="kasseEditName" type="text" maxlength="60" autocomplete="off" placeholder="${d.art === 'privat' ? 'Meine Kasse' : 'z. B. WG-Kasse, Urlaub Italien'}" class="w-full rounded-lg border border-ink/15 px-3 py-2 text-base mb-3" value="${escapeHtml(d.art === 'privat' && d.name === 'Privat' ? '' : d.name)}" ${ro ? 'disabled' : ''} />
    ${ro ? '' : `
    <span class="block text-xs uppercase tracking-wide text-ink/40 mb-1.5">Symbol</span>
    <div class="flex flex-wrap gap-1.5 mb-3">${KASSE_ICONS.map(ic => `<button type="button" class="kasse-icon-btn ${ic === d.icon ? 'active' : ''}" data-kasse-icon="${ic}">${ic}</button>`).join('')}</div>
    <span class="block text-xs uppercase tracking-wide text-ink/40 mb-1.5">Farbe</span>
    <div class="flex flex-wrap gap-2 mb-4">${PALETTE.map(c => `<button type="button" class="kasse-color-btn ${c === d.color ? 'active' : ''}" style="background:${c}" data-kasse-color="${c}" aria-label="Farbe ${c}"></button>`).join('')}</div>`}
    <div class="flex items-center justify-between gap-2 mb-1.5">
      <span class="block text-xs uppercase tracking-wide text-ink/40">${d.art === 'privat' ? (isOwnPrivate ? 'Teilen mit' : 'Geteilt mit') : d.id ? 'Mitglieder' : 'Wer gehört dazu?'}</span>
      ${(!ro && d.art !== 'haushalt' && d.art !== 'familie') ? `<span class="flex items-center gap-1.5"><button type="button" class="kasse-quick-btn" data-kasse-quick="alle">Alle</button><button type="button" class="kasse-quick-btn" data-kasse-quick="ich">Nur ich</button></span>` : ''}
    </div>
    ${d.art === 'haushalt' ? `
    <label class="flex items-start gap-2.5 mb-2 ${ro ? '' : 'cursor-pointer'} select-none rounded-lg bg-ink/[0.04] px-3 py-2">
      <input id="kasseEditAll" type="checkbox" class="w-4 h-4 mt-0.5 shrink-0" ${d.all ? 'checked' : ''} ${ro ? 'disabled' : ''} />
      <span class="min-w-0"><span class="block text-sm font-medium">Alle Profile der Familie</span><span class="block text-[11px] text-ink/45 leading-snug">Auch neu angelegte Profile gehören dann automatisch dazu. Abwählen, um z. B. Jugendliche auszunehmen.</span></span>
    </label>` : ''}
    <div class="rounded-xl border border-ink/10 px-3 py-1 mb-4">${peopleHtml || '<p class="text-sm text-ink/40 italic py-2">Keine Profile gefunden.</p>'}</div>
    ${d.art === 'familie' ? '' : kasseEditGuestsHtml(d, ro)}
    <label class="${d.art === 'familie' ? 'hidden ' : ''}flex items-start gap-2.5 mb-2 ${ro ? '' : 'cursor-pointer'} select-none">
      <input id="kasseEditSplit" type="checkbox" class="w-4 h-4 mt-0.5 shrink-0" ${d.split ? 'checked' : ''} ${ro ? 'disabled' : ''} />
      <span class="min-w-0"><span class="block text-sm font-medium">⚖️ Ausgaben aufteilen – wer schuldet wem</span><span class="block text-[11px] text-ink/45 leading-snug">Für WG, Urlaub &amp; Co.: Jede Ausgabe zählt für die Person, die bezahlt hat, und wird auf die gewählten Mitglieder aufgeteilt. Oben in den Ausgaben steht dann, wer wem wie viel schuldet – mit „Ausgleichen“.</span></span>
    </label>
    ${d.id && kasseById(d.id) && kasseById(d.id).backupDay ? `
    <div class="mt-3 rounded-xl border border-ink/10 px-3 py-2.5">
      <span class="block text-sm font-medium">↺ Sicherung</span>
      <span class="block text-[11px] text-ink/45 leading-snug mb-2">Stand vor der ersten Änderung am ${escapeHtml(vtFmt(kasseById(d.id).backupDay))}. Zurückholen ergänzt nur, was inzwischen fehlt – es wird nichts gelöscht.</span>
      <button type="button" id="kasseBackupBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition">Fehlendes zurückholen</button>
    </div>` : ''}
    ${ro && d.art !== 'haushalt' ? `<p class="text-[11px] text-ink/45 mt-2">Einstellen kann nur ${escapeHtml(kasseProfileName(d.owner))}.</p>` : ''}
    ${ro && d.art === 'haushalt' ? '<p class="text-[11px] text-ink/45 mt-2">Die Haushaltskasse stellen die Admins ein.</p>' : ''}`;
  const body = document.getElementById('kasseEditBody');
  body.querySelectorAll('[data-kasse-icon]').forEach(b => b.addEventListener('click', () => { d.icon = b.dataset.kasseIcon; renderKasseEdit(); }));
  body.querySelectorAll('[data-kasse-color]').forEach(b => b.addEventListener('click', () => { d.color = b.dataset.kasseColor; renderKasseEdit(); }));
  body.querySelectorAll('[data-kasse-quick]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.kasseQuick === 'alle') kassePeople().forEach(p => d.members.add(p.id));
    else d.members = new Set([d.owner || me]);
    renderKasseEdit();
  }));
  body.querySelectorAll('.kasse-person-cb').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) d.members.add(cb.value); else d.members.delete(cb.value);
  }));
  const all = document.getElementById('kasseEditAll');
  if (all) all.addEventListener('change', () => { d.all = all.checked; if (!d.all && !d.members.size) kassePeople().forEach(p => d.members.add(p.id)); renderKasseEdit(); });
  const sp = document.getElementById('kasseEditSplit');
  if (sp) sp.addEventListener('change', () => { d.split = sp.checked; });
  kasseEditGuestsBind(d, body);
  const bk = document.getElementById('kasseBackupBtn');
  if (bk) bk.addEventListener('click', async () => {
    bk.disabled = true;
    try {
      kassenCapture();
      await kassenFlush();
      const body = await postJson('/api/pinn/kassen/sicherung', { id: d.id });
      if (body.error) throw new Error(body.error);
      kassenLoadedAt = 0;
      await kassenLoad(true);
      finShowToast(body.added > 0 ? `${body.added} Einträge zurückgeholt.` : 'Es fehlt nichts – alles noch da.');
    } catch (e) {
      const errEl = document.getElementById('kasseEditError');
      errEl.textContent = kasseNetError(e);
      errEl.classList.remove('hidden');
    } finally { bk.disabled = false; }
  });
  const k = d.id ? kasseById(d.id) : null;
  document.getElementById('kasseEditSaveBtn').classList.toggle('hidden', ro);
  document.getElementById('kasseEditCancelBtn').textContent = ro ? 'Schließen' : 'Abbrechen';
  document.getElementById('kasseEditDeleteBtn').classList.toggle('hidden', !(k && k.art !== 'familie' && d.canManage));
  document.getElementById('kasseEditLeaveBtn').classList.toggle('hidden', !(k && k.art !== 'haushalt' && k.art !== 'familie' && !d.canManage && k.owner !== me));
}
// Section „Gäste ohne Profil“ in the popup „Kasse einstellen“
function kasseEditGuestsHtml(d, ro) {
  const list = (d.guests || []).map((g, i) => ({ g, i })).filter(x => !x.g.removed);
  if (ro && !list.length) return '';
  const rows = list.map(({ g, i }) => `
      <div class="flex items-center gap-2.5 py-1.5">
        ${kasseGuestAvatar(g, 26)}
        ${ro
          ? `<span class="flex-1 min-w-0 text-sm truncate">${escapeHtml(g.name)}</span>`
          : `<input type="text" maxlength="40" autocomplete="off" class="kasse-guest-name flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" data-guest-idx="${i}" value="${escapeHtml(g.name)}" />
        <button type="button" class="kasse-guest-del shrink-0 w-8 h-8 rounded-lg border border-ink/15 text-ink/50 hover:text-red-500 hover:border-red-300 transition" data-guest-idx="${i}" aria-label="Gast entfernen" title="Gast entfernen">✕</button>`}
        <span class="text-[10px] text-ink/40 shrink-0">Gast</span>
      </div>`).join('');
  return `
    <span class="block text-xs uppercase tracking-wide text-ink/40 mb-1.5">Gäste ohne Profil</span>
    <div class="rounded-xl border border-ink/10 px-3 py-1 mb-2">
      ${rows || '<p class="text-sm text-ink/40 italic py-2">Noch keine Gäste.</p>'}
      ${ro ? '' : `
      <div class="flex items-center gap-2 py-1.5 ${rows ? 'border-t border-dashed border-ink/10' : ''}">
        <input id="kasseGuestNew" type="text" maxlength="40" autocomplete="off" placeholder="Name, z. B. Tom" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" />
        <button type="button" id="kasseGuestAddBtn" class="shrink-0 px-3 py-1.5 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">+ Gast</button>
      </div>`}
    </div>
    <p class="text-[11px] text-ink/45 mb-4 leading-snug">Für Urlaub mit Freunden &amp; Co.: Gäste brauchen kein Profil und sehen die Kasse nicht – sie zählen nur beim Aufteilen. Was ein Gast bezahlt hat, trägst du mit „Bezahlt von“ ein.${d.split ? '' : ' Wirkt erst mit „Ausgaben aufteilen“ (wird beim ersten Gast eingeschaltet).'}</p>`;
}
function kasseEditGuestsBind(d, body) {
  const errEl = document.getElementById('kasseEditError');
  const add = () => {
    const inp = document.getElementById('kasseGuestNew');
    const name = (inp ? inp.value : '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) { if (inp) inp.focus(); return; }
    const active = d.guests.filter(g => !g.removed);
    if (active.length >= 30) { errEl.textContent = 'Höchstens 30 Gäste je Kasse.'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');
    d.guests.push({ id: kasseNewGuestId(), name, color: KASSE_GUEST_COLORS[d.guests.length % KASSE_GUEST_COLORS.length] });
    if (!d.split) d.split = true;
    renderKasseEdit();
    const again = document.getElementById('kasseGuestNew');
    if (again && !isMobile()) again.focus();
  };
  const addBtn = body.querySelector('#kasseGuestAddBtn');
  if (addBtn) addBtn.addEventListener('click', add);
  const newInp = body.querySelector('#kasseGuestNew');
  if (newInp) newInp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
  body.querySelectorAll('.kasse-guest-name').forEach(inp => inp.addEventListener('input', () => {
    const g = d.guests[Number(inp.dataset.guestIdx)];
    if (g) g.name = inp.value;
  }));
  body.querySelectorAll('.kasse-guest-del').forEach(b => b.addEventListener('click', () => {
    const idx = Number(b.dataset.guestIdx);
    const g = d.guests[idx];
    if (!g) return;
    const saved = d.id && kasseGuests(kasseById(d.id), true).some(x => x.id === g.id);
    if (saved && kasseGuestUsed(d.id, g.id)
      && !confirm(`„${g.name || 'Gast'}“ kommt in Buchungen dieser Kasse vor. Trotzdem entfernen? Beim Aufteilen wird dann nicht mehr für ${g.name || 'den Gast'} gerechnet – offene Beträge vorher ausgleichen.`)) return;
    if (saved) g.removed = true; else d.guests.splice(idx, 1);
    renderKasseEdit();
  }));
}
function kasseNetError(e) {
  return (e instanceof TypeError || /fetch|network|Load failed/i.test(String(e && e.message))) ? 'Das geht nur mit Verbindung zum Server.' : (e && e.message) || 'Aktion fehlgeschlagen.';
}
async function saveKasseEdit() {
  const d = kasseEditDraft;
  if (!d || !d.canManage) return;
  const errEl = document.getElementById('kasseEditError');
  errEl.classList.add('hidden');
  const name = document.getElementById('kasseEditName').value.trim();
  if (!d.id && !name) { errEl.textContent = 'Bitte einen Namen eingeben.'; errEl.classList.remove('hidden'); return; }
  const guests = (d.guests || []).map(g => ({ id: g.id, name: String(g.name || '').replace(/\s+/g, ' ').trim().slice(0, 40), color: g.color || KASSE_GUEST_COLORS[0], removed: !!g.removed }));
  if (guests.some(g => !g.removed && !g.name)) { errEl.textContent = 'Bitte jedem Gast einen Namen geben.'; errEl.classList.remove('hidden'); return; }
  const btn = document.getElementById('kasseEditSaveBtn');
  btn.disabled = true;
  try {
    const body = await postJson('/api/pinn/kassen/einstellungen', {
      id: d.id, name: name || (d.art === 'privat' ? 'Privat' : ''), icon: d.icon, color: d.color,
      members: [...d.members], all: d.all, split: d.split,
      ...(d.art !== 'familie' ? { guests } : {}),
    });
    const nk = body.kasse;
    const old = kasseById(nk.id);
    if (old) Object.assign(old, { ...nk, data: old.data });
    else kassen.push({ ...nk, data: nk.data || {} });
    kassenCacheWrite();
    const wasNew = !d.id;
    closeKasseEdit();
    if (wasNew) kassenSetActive(nk.id); else kassenRerender();
    if (!document.getElementById('kassenModal').classList.contains('hidden')) renderKassenModal();
    finShowToast(wasNew ? `Kasse „${nk.name}“ angelegt.` : 'Kasse gespeichert.');
  } catch (e) {
    errEl.textContent = kasseNetError(e);
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}
async function deleteKasseFromEdit() {
  const d = kasseEditDraft;
  const k = d && kasseById(d.id);
  if (!k) return;
  if (!confirm(`Kasse „${kasseDisplayName(k)}“ wirklich löschen? Alle ihre Buchungen, Verträge und Belege werden für alle Mitglieder gelöscht. Dokumente der Kasse bleiben erhalten und sind danach nur noch für dich sichtbar.`)) return;
  try {
    await postJson('/api/pinn/kassen/loeschen', { id: k.id });
    kasseRemoveLocal(k.id);
    closeKasseEdit();
    finShowToast('Kasse gelöscht.');
  } catch (e) {
    const errEl = document.getElementById('kasseEditError');
    errEl.textContent = kasseNetError(e);
    errEl.classList.remove('hidden');
  }
}
async function leaveKasseFromEdit() {
  const d = kasseEditDraft;
  const k = d && kasseById(d.id);
  if (!k) return;
  if (!confirm(`Kasse „${kasseDisplayName(k)}“ verlassen? Du siehst sie danach nicht mehr.`)) return;
  try {
    await postJson('/api/pinn/kassen/verlassen', { id: k.id });
    kasseRemoveLocal(k.id);
    closeKasseEdit();
    finShowToast('Kasse verlassen.');
  } catch (e) {
    const errEl = document.getElementById('kasseEditError');
    errEl.textContent = kasseNetError(e);
    errEl.classList.remove('hidden');
  }
}
function kasseRemoveLocal(id) {
  kassen = kassen.filter(k => k.id !== id);
  const items = kassenPendingRead();
  delete items[id];
  kassenPendingWrite(items);
  finServerList = finServerList.filter(e => e.kasse !== id);
  try { finCacheWrite(); } catch (e) { /* ignore */ }
  if (activeKasseId === id) { activeKasseId = kasseDefaultId(); kassenCacheWrite(); kassenApplyActive(true); }
  else { kassenCacheWrite(); kassenRerender(); }
  if (!document.getElementById('kassenModal').classList.contains('hidden')) renderKassenModal();
}

/* ---------- Splitting: choosing the people ---------- */
function renderKasseSplitPicker(key, containerId, k, selected) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const ids = kasseMemberIds(k);
  kasseSplitKasse[key] = k ? k.id : '';
  const sel = (Array.isArray(selected) && selected.length) ? selected.filter(id => ids.includes(id)) : ids.slice();
  kasseSplitState[key] = sel.length ? sel : ids.slice();
  const draw = () => {
    wrap.innerHTML = ids.map(mid => {
      const m = kassePartById(mid);
      if (!m) return '';
      const on = kasseSplitState[key].includes(mid);
      return `<button type="button" class="kasse-chip ${on ? 'on' : ''}" data-mid="${escapeHtml(mid)}"><span class="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span><span>${escapeHtml(memberLabel(m))}</span></button>`;
    }).join('');
    wrap.querySelectorAll('.kasse-chip').forEach(b => b.addEventListener('click', () => {
      const mid = b.dataset.mid;
      const cur = kasseSplitState[key];
      if (cur.includes(mid)) { if (cur.length > 1) kasseSplitState[key] = cur.filter(x => x !== mid); }
      else kasseSplitState[key] = [...cur, mid];
      draw();
      kasseSplitHint(key);
    }));
  };
  draw();
  kasseSplitHint(key);
}
// Only a partial selection is stored – empty means „all members of the box“
function kasseSplitValue(key) {
  const k = kasseById(kasseSplitKasse[key]);
  if (!kassenActiveMode() || !kasseIsShared(k)) return [];
  const ids = kasseMemberIds(k);
  const sel = kasseSplitState[key].filter(id => ids.includes(id));
  return sel.length && sel.length < ids.length ? sel : [];
}
function kasseSplitHint(key) {
  const el = document.getElementById(key === 'expense' ? 'expenseSplitHint' : 'checkoutSplitHint');
  if (!el) return;
  const n = kasseSplitState[key].length || 1;
  let amount = 0;
  if (key === 'expense') amount = Math.abs(parseEuro(document.getElementById('expenseAmountInput').value) || 0);
  else {
    amount = (parseEuro(document.getElementById('checkoutAmountInput').value) || 0) - (parseEuro(document.getElementById('checkoutPrivateInput').value) || 0);
  }
  el.textContent = amount > 0 ? `Je ${fmtEur(amount / n)} für ${n} ${n === 1 ? 'Person' : 'Personen'}.` : `Wird auf ${n} ${n === 1 ? 'Person' : 'Personen'} aufgeteilt.`;
}
function kasseSplitSetupExpense(src) {
  const wrap = document.getElementById('expenseSplitWrap');
  const k = activeKasse();
  const show = kassenActiveMode() && kasseIsShared(k);
  wrap.classList.toggle('hidden', !show);
  if (show) renderKasseSplitPicker('expense', 'expenseSplitPicker', k, src && Array.isArray(src.split) ? src.split : []);
  else { kasseSplitKasse.expense = ''; kasseSplitState.expense = []; }
}
function kasseSplitLabel(e) {
  if (!kassenActiveMode()) return '';
  const k = activeKasse();
  if (!kasseIsShared(k)) return '';
  const n = Array.isArray(e.split) && e.split.length ? e.split.length : kasseMemberIds(k).length;
  return '÷ ' + n;
}

/* ---------- Booking a purchase into a box (with a private share) ---------- */
function kasseBookPurchase(base, kasseId, split, priv) {
  if (!kassenActiveMode()) { finQueueSave(base); return { note: '' }; }
  const k = kasseById(kasseId) || activeKasse();
  if (!k) { finQueueSave(base); return { note: '' }; }
  const shared = kasseIsShared(k);
  const own = kasseOwn();
  const p = (shared && own && own.id !== k.id) ? Math.round((Number(priv) || 0) * 100) / 100 : 0;
  if (p < 0 || p > base.amount) return { error: 'Der private Anteil kann nicht größer sein als der Betrag.' };
  const where = k.id !== activeKasseId ? ` Gebucht in „${kasseDisplayName(k)}“.` : '';
  if (p > 0) {
    const rest = Math.round((base.amount - p) * 100) / 100;
    if (rest > 0) finQueueSave({ ...base, amount: rest, kasse: k.id, split: split || [] });
    finQueueSave({
      ...base, id: newRecordId(), amount: p, kasse: own.id, split: [],
      title: ((base.title || base.store || 'Einkauf') + ' (privat)').slice(0, 200),
    });
    return { note: `${where} ${fmtEur(p)} davon privat in „${kasseDisplayName(own)}“.` };
  }
  finQueueSave({ ...base, kasse: k.id, split: shared ? (split || []) : [] });
  return { note: where };
}
function kasseCheckoutSetup(listId) {
  const wrap = document.getElementById('checkoutKasseWrap');
  const sel = document.getElementById('checkoutKasseSelect');
  document.getElementById('checkoutPrivateInput').value = '';
  if (!kassenActiveMode() || !kassenReal().length) {
    wrap.classList.add('hidden');
    document.getElementById('checkoutSplitWrap').classList.add('hidden');
    checkoutKasseId = '';
    return;
  }
  checkoutKasseId = kasseForList(listId);
  if (!kasseIsReal(kasseById(checkoutKasseId))) checkoutKasseId = kassenRealSorted()[0].id;
  sel.innerHTML = kassenRealSorted().map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml((k.icon || '') + ' ' + kasseDisplayName(k))}</option>`).join('');
  sel.value = checkoutKasseId;
  wrap.classList.toggle('hidden', kassenReal().length < 2);
  kasseCheckoutSplitUi();
}
function kasseCheckoutSplitUi() {
  const k = kasseById(checkoutKasseId);
  // „Bezahlt von“: add the guests of the chosen box (the selection is kept)
  const pb = document.getElementById('checkoutPaidBySelect');
  if (pb) fillFinPaidBySelect('checkoutPaidBySelect', pb.value, kassenActiveMode() ? k : null);
  const shared = kassenActiveMode() && kasseIsShared(k);
  document.getElementById('checkoutSplitWrap').classList.toggle('hidden', !shared);
  const own = kasseOwn();
  document.getElementById('checkoutPrivateBlock').classList.toggle('hidden', !(shared && own && own.id !== (k && k.id)));
  if (shared) renderKasseSplitPicker('checkout', 'checkoutSplitPicker', k, []);
  else { kasseSplitKasse.checkout = ''; kasseSplitState.checkout = []; }
}
// Purchase done (several stores): one row per store with box and, if any, private share
function kassePlanRowHtml(row, keep) {
  if (!kassenActiveMode() || !kassenReal().length) return '';
  const k = kasseById(kasseForList(row.listId));
  if (!k) return '';
  const shared = kasseIsShared(k);
  const own = kasseOwn();
  const privOk = shared && own && own.id !== k.id;
  return `
    <div class="flex items-center gap-1.5 text-[11px] text-ink/50 mb-2" style="--k:${escapeHtml(k.color || '#2F4B41')}">
      <span class="kasse-dot" style="width:18px;height:18px;font-size:10px">${escapeHtml(k.icon || '💶')}</span>
      <span class="truncate">${escapeHtml(kasseDisplayName(k))}${shared ? ' · wird auf ' + kasseMemberIds(k).length + ' Personen aufgeteilt' : ''}</span>
    </div>
    ${privOk ? `
    <div class="flex items-center gap-2 mb-2">
      <label class="text-[11px] uppercase tracking-wide text-ink/40 shrink-0">Davon privat</label>
      <input type="text" inputmode="decimal" autocomplete="off" placeholder="${curZero()}" class="plan-private flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base text-right" value="${escapeHtml((keep && keep.priv) || '')}" />
      <span class="cur-sym text-ink/40 text-sm">${curSym()}</span>
    </div>` : ''}`;
}

/* ---------- Edit shopping list: box ---------- */
function kasseListModalSetup(existing) {
  const block = document.getElementById('shoppingListKasseBlock');
  const sel = document.getElementById('shoppingListKasseSelect');
  if (!kassenActiveMode() || !kassenReal().length) { block.classList.add('hidden'); return; }
  const h = kasseStandard();
  const cur = (existing && existing.kasse) || '';
  const opts = [`<option value="">${escapeHtml(h ? (h.icon || '💶') + ' ' + kasseDisplayName(h) + ' (Standard)' : 'Standard-Kasse')}</option>`];
  kassenRealSorted().filter(k => !h || k.id !== h.id).forEach(k => opts.push(`<option value="${escapeHtml(k.id)}">${escapeHtml((k.icon || '') + ' ' + kasseDisplayName(k))}</option>`));
  if (cur && !kasseById(cur)) opts.push(`<option value="${escapeHtml(cur)}">🔒 Kasse einer anderen Person</option>`);
  sel.innerHTML = opts.join('');
  sel.value = cur;
  block.classList.remove('hidden');
}
function kasseListModalValue(prev) {
  const block = document.getElementById('shoppingListKasseBlock');
  if (!block || block.classList.contains('hidden')) return prev || '';
  return document.getElementById('shoppingListKasseSelect').value || '';
}

/* ---------- Who owes whom ---------- */
function kasseBalances(k) {
  const ids = kasseMemberIds(k);
  const bal = {};
  ids.forEach(id => { bal[id] = 0; });
  const today = finTodayIso();
  const settlements = [];
  const entries = ausgaben.filter(e => e.date <= today).concat(finRecurringEntries('1970-01-01', today));
  entries.forEach(e => {
    const a = Number(e.amount) || 0;
    if (!a) return;
    if (e.category === FIN_SETTLE_CATEGORY) {
      const to = Array.isArray(e.split) ? e.split[0] : '';
      if (e.paidBy in bal) bal[e.paidBy] += a;
      if (to in bal) bal[to] -= a;
      settlements.push(e);
      return;
    }
    if (!(e.paidBy in bal)) return;
    const parts = (Array.isArray(e.split) && e.split.length ? e.split : ids).filter(id => id in bal);
    if (!parts.length) return;
    bal[e.paidBy] += a;
    parts.forEach(id => { bal[id] -= a / parts.length; });
  });
  Object.keys(bal).forEach(id => { bal[id] = Math.round(bal[id] * 100) / 100; });
  // As few transfers as possible: whoever owes the most pays the one who receives the most
  const cred = ids.filter(id => bal[id] > 0.004).map(id => ({ id, v: bal[id] })).sort((a, b) => b.v - a.v);
  const debt = ids.filter(id => bal[id] < -0.004).map(id => ({ id, v: -bal[id] })).sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i].v, cred[j].v);
    if (x > 0.004) transfers.push({ from: debt[i].id, to: cred[j].id, amount: Math.round(x * 100) / 100 });
    debt[i].v -= x; cred[j].v -= x;
    if (debt[i].v < 0.005) i++;
    if (cred[j].v < 0.005) j++;
  }
  settlements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { ids, bal, transfers, settlements };
}
function kasseMemberChip(mid, size = 24) {
  const m = kassePartById(mid);
  if (!m) return '';
  return `<span class="inline-flex items-center gap-1.5 min-w-0"><span class="rounded-full overflow-hidden border-2 shrink-0" style="width:${size}px;height:${size}px;border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span><span class="truncate">${escapeHtml(memberLabel(m))}</span></span>`;
}
function renderKasseSplitCard() {
  const el = document.getElementById('finSplitCard');
  if (!el) return;
  const k = activeKasse();
  if (!kassenActiveMode() || !kasseIsShared(k)) { el.innerHTML = ''; return; }
  const { ids, bal, transfers, settlements } = kasseBalances(k);
  const rows = ids.map(mid => {
    const b = bal[mid] || 0;
    const color = b > 0.004 ? FIN_GREEN : b < -0.004 ? FIN_RED : '';
    return `<div class="flex items-center gap-2 py-1.5 text-sm">${kasseMemberChip(mid)}<span class="flex-1"></span><span class="font-semibold"${color ? ` style="color:${color}"` : ''}>${b > 0.004 ? '+ ' : ''}${fmtEur(b)}</span></div>`;
  }).join('');
  const tHtml = transfers.length ? transfers.map((t, i) => `
    <div class="flex items-center gap-2 py-2 border-t border-dashed border-ink/10 text-sm">
      <span class="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">${kasseMemberChip(t.from, 20)}<span class="text-ink/40">→</span>${kasseMemberChip(t.to, 20)}</span>
      <b class="shrink-0">${fmtEur(t.amount)}</b>
      <button type="button" class="shrink-0 px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition" data-settle="${i}">Ausgleichen</button>
    </div>`).join('') : '<p class="text-sm text-pine py-2 border-t border-dashed border-ink/10">Alles ausgeglichen 🎉</p>';
  const sHtml = settlements.slice(0, 5).map(s => `
    <button type="button" class="w-full flex items-center gap-2 py-1.5 text-left text-xs text-ink/55 hover:text-ink transition" data-settle-id="${escapeHtml(s.id)}" title="Antippen zum Löschen">
      <span class="shrink-0">${escapeHtml(finDayLabel(s.date))}</span>
      <span class="flex-1 min-w-0 truncate">${escapeHtml(kassePartById(s.paidBy) ? memberLabel(kassePartById(s.paidBy)) : '?')} → ${escapeHtml(kassePartById((s.split || [])[0]) ? memberLabel(kassePartById(s.split[0])) : '?')}${s.pending ? ' ⏳' : ''}</span>
      <span class="shrink-0">${fmtEur(s.amount)}</span>
    </button>`).join('');
  el.innerHTML = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-1">
        <h3 class="font-serif text-base">⚖️ Wer schuldet wem</h3>
        <button type="button" id="kasseSettleNewBtn" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">+ Ausgleich</button>
      </div>
      <p class="text-[11px] text-ink/45 mb-2">Plus = bekommt Geld zurück, Minus = schuldet etwas. Gezählt werden alle Buchungen der Kasse bis heute.</p>
      ${rows}
      <div class="mt-2">${tHtml}</div>
      ${sHtml ? `<div class="mt-3 pt-2 border-t border-ink/10"><span class="block text-[10px] uppercase tracking-wide text-ink/40 mb-1">Letzte Ausgleiche</span>${sHtml}</div>` : ''}
    </div>`;
  el.querySelectorAll('[data-settle]').forEach(b => b.addEventListener('click', () => {
    const t = transfers[Number(b.dataset.settle)];
    if (t) openKasseSettle(t);
  }));
  el.querySelector('#kasseSettleNewBtn').addEventListener('click', () => openKasseSettle(transfers[0] || null));
  el.querySelectorAll('[data-settle-id]').forEach(b => b.addEventListener('click', () => {
    const s = ausgaben.find(x => x.id === b.dataset.settleId);
    if (!s) return;
    if (!confirm(`Diesen Ausgleich über ${fmtEur(s.amount)} löschen?`)) return;
    finQueueDelete(s.id);
    renderFinance();
  }));
}

/* ---------- Popup: enter a settlement ---------- */
function openKasseSettle(t) {
  const k = activeKasse();
  if (!k) return;
  const ids = kasseMemberIds(k);
  const opts = ids.map(id => { const m = kassePartById(id); return m ? `<option value="${escapeHtml(id)}">${escapeHtml(memberLabel(m) + (m.guest ? ' (Gast)' : ''))}</option>` : ''; }).join('');
  const from = document.getElementById('kasseSettleFrom');
  const to = document.getElementById('kasseSettleTo');
  from.innerHTML = opts; to.innerHTML = opts;
  const me = currentMember() ? currentMember().id : '';
  from.value = t ? t.from : (ids.includes(me) ? me : ids[0] || '');
  to.value = t ? t.to : (ids.find(id => id !== from.value) || '');
  document.getElementById('kasseSettleAmount').value = t ? euroInputValue(t.amount) : '';
  document.getElementById('kasseSettleDate').value = finTodayIso();
  document.getElementById('kasseSettleNote').value = '';
  document.getElementById('kasseSettleError').classList.add('hidden');
  document.getElementById('kasseSettleModal').classList.remove('hidden');
  finAutoFocusAmount(document.getElementById('kasseSettleAmount'));
}
function closeKasseSettle() { document.getElementById('kasseSettleModal').classList.add('hidden'); }
function saveKasseSettle() {
  const err = document.getElementById('kasseSettleError');
  const show = (t) => { err.textContent = t; err.classList.remove('hidden'); };
  const from = document.getElementById('kasseSettleFrom').value;
  const to = document.getElementById('kasseSettleTo').value;
  const amount = parseEuro(document.getElementById('kasseSettleAmount').value);
  const date = document.getElementById('kasseSettleDate').value || finTodayIso();
  if (!from || !to || from === to) return show('Bitte zwei verschiedene Personen wählen.');
  if (!(amount > 0)) return show('Bitte einen Betrag eingeben.');
  const fm = kassePartById(from), tm = kassePartById(to);
  finQueueSave({
    id: newRecordId(), amount, date, category: FIN_SETTLE_CATEGORY,
    title: `Ausgleich ${fm ? memberLabel(fm) : ''} → ${tm ? memberLabel(tm) : ''}`.trim(),
    store: '', listId: '', items: [], paidBy: from, split: [to], link: '',
    note: document.getElementById('kasseSettleNote').value.trim(),
    kasse: activeKasseId,
    createdBy: (currentUser() && currentUser().id) || '',
    created: new Date().toISOString(),
  });
  closeKasseSettle();
  renderFinance();
  finShowToast(`Ausgleich über ${fmtEur(amount)} eingetragen.`);
}

/* ---------- Pocket money on the children's page: from the box it is stored in ---------- */
function kidAllowanceHtml(m) {
  if (!kassenActiveMode() || !m || !m.kid || !m.kid.showAllowance) return kidAllowanceHtmlInner(m);
  const order = [activeKasse(), ...kassenSorted().filter(k => k.id !== activeKasseId)].filter(Boolean);
  const saved = finance;
  try {
    for (const k of order) {
      const f = k.id === activeKasseId ? saved : normalizeFinance(kasseWorkingData(k));
      if (!f.recurring.some(r => r.allowanceFor === m.id) && !f.pocketMoney.some(p => p.id === m.id)) continue;
      finance = f;
      return kidAllowanceHtmlInner(m);
    }
  } finally {
    finance = saved;
  }
  return '';
}

/* ---------- Events ---------- */
(function initKassenUi() {
  ['kassePillFin', 'kassePillFz', 'kassePillHs'].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', openKassenModal); });
  document.getElementById('finSettingsKassenBtn').addEventListener('click', openKassenModal);
  document.getElementById('closeKassenModalBtn').addEventListener('click', closeKassenModal);
  document.getElementById('kassenModal').addEventListener('click', (e) => { if (e.target.id === 'kassenModal') closeKassenModal(); });
  document.getElementById('kasseNewBtn').addEventListener('click', () => openKasseEdit(''));
  document.getElementById('closeKasseEditBtn').addEventListener('click', closeKasseEdit);
  document.getElementById('kasseEditCancelBtn').addEventListener('click', closeKasseEdit);
  document.getElementById('kasseEditModal').addEventListener('click', (e) => { if (e.target.id === 'kasseEditModal') closeKasseEdit(); });
  document.getElementById('kasseEditSaveBtn').addEventListener('click', saveKasseEdit);
  document.getElementById('kasseEditDeleteBtn').addEventListener('click', deleteKasseFromEdit);
  document.getElementById('kasseEditLeaveBtn').addEventListener('click', leaveKasseFromEdit);
  document.getElementById('closeKasseSettleBtn').addEventListener('click', closeKasseSettle);
  document.getElementById('kasseSettleCancelBtn').addEventListener('click', closeKasseSettle);
  document.getElementById('kasseSettleSaveBtn').addEventListener('click', saveKasseSettle);
  document.getElementById('kasseSettleModal').addEventListener('click', (e) => { if (e.target.id === 'kasseSettleModal') closeKasseSettle(); });
  document.getElementById('kasseSettleAmount').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveKasseSettle(); } });
  document.getElementById('expenseAmountInput').addEventListener('input', () => { if (kasseSplitKasse.expense) kasseSplitHint('expense'); });
  document.getElementById('checkoutAmountInput').addEventListener('input', () => { if (kasseSplitKasse.checkout) kasseSplitHint('checkout'); });
  document.getElementById('checkoutPrivateInput').addEventListener('input', () => { if (kasseSplitKasse.checkout) kasseSplitHint('checkout'); });
  document.getElementById('checkoutKasseSelect').addEventListener('change', (e) => {
    checkoutKasseId = e.target.value;
    document.getElementById('checkoutPrivateInput').value = '';
    kasseCheckoutSplitUi();
    updateCheckoutBudgetHint();
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kassen');
