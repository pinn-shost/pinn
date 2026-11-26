/* pinn. – Family areas: the family data in records of their own (js/bereiche.js)
   Classic script, no build step; loaded right after js/familiensync.js (load order: src/rahmen.html).
   The family data live in records of their own on the server (collection "familien_bereiche",
   pb_hooks/pinn-bereiche.js) – recipes and the meal plan (since 1.104), shopping and pantry (1.105), board, lists,
   school & daycare, pets and the maintenance plan (1.106), members, emergency passes and the family settings (1.108),
   tasks, the household and the calendar selection (1.109), lending list and date polls (1.163). Since 1.166.0 there is
   nothing else: the old family record is dissolved. Which keys belong to which area is told by the server, so a new
   area needs no change here.
   The rest of the app does not notice anything: the app variables stay the same, only loading and saving
   is split up here:
   - areasLoad / areasPull: fetch the areas (only those that changed since the last time)
   - areaOverlay: the current state of all areas, applied to the app (composeFamilyState in js/familiensync.js)
   - areasCapture / areasFlush: changes of an area are queued locally (works offline) and sent with
     conflict protection – if someone else saved in between, both states are merged (mergeFamilyData).
   - areasSettle: waits until the queued changes have been sent (persistState awaits it, so a server action
     right after saving – e.g. "create household tasks now" or "sync calendars now" – sees the new state).
   - areaAdoptFamilyPending: hands a change still queued for the old family record (app from before 1.166 that
     was offline during the update) to the areas once. */

const LS_AREAS_KEY = 'pinn.bereiche';                  // { familie, areas: { <name>: { keys, base, updated } } }
const LS_AREAS_PENDING_KEY = 'pinn.bereiche.offen';    // { <name>: { familie, seq, base, baseUpdated, local } }
let areaState = {};          // <name> -> { keys, base, updated } – the state last confirmed by the server
let areaServer = null;       // null = not known yet, true = the server has areas, false = older server without
let areaStateFamily = '';    // family the state above belongs to
let areaPendingMemory = null;
let areaSeq = 0;
let areaFlushing = false;
let areaFlushAgain = false;
let areaRetryTimer = null;
let areaFlushTimer = null;
let areaFlushDone = null;    // promise of the flush that is running right now (areasSettle waits for it)
let areaLoading = null;
let areaLoadedAt = 0;
let areaLoadFailed = false;  // true = the last attempt to reach the server failed (shown as "offline")
let areaSentJson = {};       // <name> -> JSON of the state last queued or applied (avoids needless sending)

function areaFamily() { return (currentUser() && currentUser().familie) || ''; }
function areaPick(src, keys) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  keys.forEach(k => { if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined) out[k] = src[k]; });
  return out;
}
function areasActive() {
  return areaServer === true && areaStateFamily === areaFamily() && Object.keys(areaState).length > 0;
}
/* ---------- Storage on the device ---------- */
function areaCacheWrite() {
  try { localStorage.setItem(LS_AREAS_KEY, JSON.stringify({ familie: areaStateFamily, areas: areaState })); } catch (e) { /* storage full – kept in memory */ }
}
function areaCacheRestore() {
  const fam = areaFamily();
  if (areaStateFamily === fam && Object.keys(areaState).length) return;
  areaState = {};
  areaStateFamily = fam;
  areaSentJson = {};
  try {
    const raw = localStorage.getItem(LS_AREAS_KEY);
    const c = raw ? JSON.parse(raw) : null;
    if (c && c.familie === fam && c.areas && typeof c.areas === 'object') {
      areaState = c.areas;
      if (Object.keys(areaState).length) areaServer = true;
    }
  } catch (e) { /* no cache */ }
}
function areaPendingRead() {
  let all = null;
  try {
    const raw = localStorage.getItem(LS_AREAS_PENDING_KEY);
    if (raw) all = JSON.parse(raw);
  } catch (e) { /* localStorage may not be available */ }
  if (!all) all = areaPendingMemory || {};
  const fam = areaFamily();
  const out = {};
  Object.keys(all).forEach(n => { if (all[n] && all[n].familie === fam) out[n] = all[n]; });
  return out;
}
function areaPendingWrite(items) {
  areaPendingMemory = items;
  try {
    if (Object.keys(items).length) localStorage.setItem(LS_AREAS_PENDING_KEY, JSON.stringify(items));
    else localStorage.removeItem(LS_AREAS_PENDING_KEY);
  } catch (e) { /* in memory only */ }
}
function areasHavePending() { return Object.keys(areaPendingRead()).length > 0; }

/* ---------- State for the app ---------- */
// Current state of an area: own change still pending, otherwise the server state
function areaCurrent(name) {
  const p = areaPendingRead()[name];
  if (p && p.local) return p.local;
  return (areaState[name] && areaState[name].base) || {};
}
// All area keys with their current values – put on top of the family data (see composeFamilyState)
function areaOverlay() {
  const out = {};
  if (!areasActive()) return out;
  Object.keys(areaState).forEach(n => Object.assign(out, areaPick(areaCurrent(n), areaState[n].keys || [])));
  return out;
}
/* ---------- Loading ---------- */
// Takes a change still queued for the old family record over (device that was offline during the update to
// 1.166): per area it is merged with the server state of the area and queued like any other change.
// p: the old queue entry { base, local }
function areaAdoptFamilyPending(p) {
  if (!p || !p.local || !areasActive()) return;
  const items = areaPendingRead();
  Object.keys(areaState).forEach(n => {
    const ks = areaState[n].keys || [];
    const local = areaPick(p.local, ks);
    const base = areaPick(p.base || {}, ks);
    if (!Object.keys(local).length || JSON.stringify(local) === JSON.stringify(base) || items[n]) return;
    const remote = areaState[n].base || {};
    items[n] = { familie: areaFamily(), seq: ++areaSeq, base: remote, baseUpdated: areaState[n].updated || '', local: mergeFamilyData(base, local, remote) };
  });
  areaPendingWrite(items);
}
// -> true if an area has changed (new data from the server)
async function areasLoad(force) {
  const fam = areaFamily();
  if (!fam) return false;
  areaCacheRestore();
  if (areaServer === false && !force) return false;
  if (areaLoading) return areaLoading;
  if (!force && areaLoadedAt && Date.now() - areaLoadedAt < 20 * 1000) return false;
  areaLoading = (async () => {
    let res, body;
    try {
      const stand = {};
      Object.keys(areaState).forEach(n => { if (areaState[n].updated) stand[n] = areaState[n].updated; });
      res = await apiFetch('/api/pinn/bereiche', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ stand }),
      });
      body = await res.json().catch(() => ({}));
    } catch (e) { areaLoadFailed = true; return false; } // offline – carry on with the cached state
    if (res.status === 404 && !Array.isArray(body.bereiche)) {
      // Server without areas (pinn. older than 1.104 on the server): nothing can be loaded
      if (!areasActive()) areaServer = false;
      areaLoadFailed = true;
      return false;
    }
    if (!res.ok || !Array.isArray(body.bereiche)) { areaLoadFailed = true; return false; }
    areaLoadFailed = false;
    areaLoadedAt = Date.now();
    areaServer = true;
    areaStateFamily = fam;
    let changed = false;
    const items = areaPendingRead();
    const seen = {};
    body.bereiche.forEach(b => {
      if (!b || !b.name) return;
      seen[b.name] = true;
      const prev = areaState[b.name];
      const keys = Array.isArray(b.keys) ? b.keys : ((prev && prev.keys) || []);
      if (b.data && typeof b.data === 'object') {
        areaState[b.name] = { keys, base: b.data, updated: b.updated || '' };
        const p = items[b.name];
        if (p && p.baseUpdated !== b.updated) {
          // Own change still pending and the server state has moved on: merge right away
          items[b.name] = { ...p, seq: ++areaSeq, base: b.data, baseUpdated: b.updated || '', local: mergeFamilyData(p.base || {}, p.local, b.data) };
        }
        delete areaSentJson[b.name];
        changed = true;
      } else if (prev) {
        areaState[b.name] = { ...prev, keys, updated: b.updated || prev.updated };
      }
    });
    Object.keys(areaState).forEach(n => { if (!seen[n]) { delete areaState[n]; delete items[n]; changed = true; } });
    areaPendingWrite(items);
    areaCacheWrite();
    if (areasHavePending()) setTimeout(() => areasFlush(), 0);
    return changed;
  })();
  try { return await areaLoading; } finally { areaLoading = null; }
}
// Regular fetch (pullRemoteChanges): show changes of other devices
async function areasPull() {
  if (!familyRecordId || !areaFamily()) return;
  if (areasHavePending()) { areasFlush(); return; }
  const changed = await areasLoad(false);
  if (changed && areasActive()) areaApplyToApp();
}
// Fetch the areas right away and show changes (e.g. after a profile was deleted: the server removes its member)
async function areasRefresh() {
  if (!familyRecordId || !areaFamily() || areaServer !== true) return;
  if (areasHavePending()) { areasFlush(); return; }
  const changed = await areasLoad(true);
  if (changed && areasActive()) areaApplyToApp();
}
function areaApplyToApp() {
  try {
    applyFamilyData(composeFamilyState());
    rerenderAfterRemoteChange();
  } catch (e) { console.warn('Bereiche: Anzeigen fehlgeschlagen', e); }
}

/* ---------- Saving ---------- */
// Called by persistState with the complete state of the app: queues every area that has changed
function areasCapture(full) {
  if (!areasActive() || !full) return;
  const items = areaPendingRead();
  let queued = false;
  Object.keys(areaState).forEach(n => {
    const keys = areaState[n].keys || [];
    const local = areaPick(full, keys);
    let json;
    try { json = JSON.stringify(local); } catch (e) { return; }
    if (areaSentJson[n] === undefined) {
      try { areaSentJson[n] = JSON.stringify(areaPick(areaCurrent(n), keys)); } catch (e) { areaSentJson[n] = ''; }
    }
    if (json === areaSentJson[n]) return;
    areaSentJson[n] = json;
    const p = items[n];
    const st = areaState[n];
    items[n] = { familie: areaFamily(), seq: ++areaSeq, base: p ? p.base : (st.base || {}), baseUpdated: p ? p.baseUpdated : (st.updated || ''), local };
    queued = true;
  });
  if (!queued) return;
  areaPendingWrite(items);
  clearTimeout(areaFlushTimer);
  areaFlushTimer = setTimeout(() => areasFlush(), 300);
}
function areaRetryLater() {
  clearTimeout(areaRetryTimer);
  areaRetryTimer = setTimeout(() => areasFlush(), 20 * 1000);
}
async function areasFlush() {
  if (areaServer !== true) return;
  if (areaFlushing) { areaFlushAgain = true; return; }
  areaFlushing = true;
  let flushFinished;
  areaFlushDone = new Promise(r => { flushFinished = r; });
  let mergedSomething = false;
  try {
    for (let guard = 0; guard < 20; guard++) {
      const items = areaPendingRead();
      const names = Object.keys(items);
      if (!names.length) break;
      const name = names[0];
      const sent = items[name];
      if (!areaState[name] || !sent || !sent.local) { delete items[name]; areaPendingWrite(items); continue; }
      if (familySyncState === 'ok') setSyncStatus('pending');
      let res, body;
      try {
        res = await apiFetch('/api/pinn/bereiche/speichern', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bereich: name, expectedUpdated: sent.baseUpdated || '', data: sent.local }),
        });
        body = await res.json().catch(() => ({}));
      } catch (e) {
        setSyncStatus('offline');
        areaRetryLater();
        return;
      }
      const now = areaPendingRead();
      const cur = now[name];
      if (res.ok && body.success) {
        areaState[name] = { ...areaState[name], base: sent.local, updated: body.updated || areaState[name].updated };
        if (cur && cur.seq === sent.seq) delete now[name];
        else if (cur) { cur.base = sent.local; cur.baseUpdated = areaState[name].updated; }
        areaPendingWrite(now);
        areaCacheWrite();
        continue;
      }
      if (res.status === 409 && body.conflict) {
        // Someone else saved this area in the meantime: merge both states and send again
        const remote = body.data || {};
        const latest = cur || sent;
        const merged = mergeFamilyData(latest.base || {}, latest.local, remote);
        areaState[name] = { ...areaState[name], base: remote, updated: body.updated || '' };
        now[name] = { familie: areaFamily(), seq: ++areaSeq, base: remote, baseUpdated: body.updated || '', local: merged };
        try { areaSentJson[name] = JSON.stringify(merged); } catch (e) { delete areaSentJson[name]; }
        areaPendingWrite(now);
        areaCacheWrite();
        mergedSomething = true;
        continue;
      }
      if (body.gone) {
        // The server does not know this area (any more): reload the list of areas
        delete now[name];
        areaPendingWrite(now);
        areasLoad(true);
        continue;
      }
      console.error('Bereich speichern fehlgeschlagen', name, res.status, body);
      setSyncStatus('error');
      areaRetryLater();
      return;
    }
    if (!areasHavePending() && familySyncState !== 'ok') { areaLoadFailed = false; setSyncStatus('ok'); }
  } finally {
    areaFlushing = false;
    flushFinished();
    if (mergedSomething) areaApplyToApp();
    if (areaFlushAgain) { areaFlushAgain = false; areasFlush(); }
  }
}
// Sends the queued area changes right away and waits until they are on the server (or the device is
// offline – then they stay queued and the retry timer takes over). Never throws.
async function areasSettle() {
  if (areaServer !== true) return;
  clearTimeout(areaFlushTimer);
  for (let guard = 0; guard < 6; guard++) {
    try {
      if (areaFlushing) { await areaFlushDone; continue; }
      if (!areasHavePending()) return;
      await areasFlush();
      if (areaFlushing) continue;                  // a new round was started in the meantime
      if (areasHavePending()) return;              // offline or error: retried later
    } catch (e) { return; }
  }
}
window.addEventListener('online', () => { areasFlush(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('bereiche');
