/* pinn. – Family areas: own records for parts of the family data (js/bereiche.js)
   Classic script, no build step; loaded right after js/familiensync.js (load order: src/rahmen.html).
   Since 1.104.0 some parts of the family data live in records of their own on the server
   (collection "familien_bereiche", pb_hooks/pinn-bereiche.js) – for now recipes (recipes, recipeFavorites,
   recipeCategories) and the meal plan (mealPlan). Which keys belong to which area is told by the server.
   The rest of the app does not notice anything: the app variables stay the same, only loading and saving
   is split up here:
   - areasLoad / areasPull: fetch the areas (only those that changed since the last time)
   - areaOverlay: the current state of all areas, put on top of the family data when it is applied
   - areaStripPayload: removes the area keys from what is sent to /api/pinn/save
   - areasCapture / areasFlush: changes of an area are queued locally (works offline) and sent with
     conflict protection – if someone else saved in between, both states are merged (mergeFamilyData).
   Without areas on the server (older server) everything stays in the family record as before. */

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
let areaLoading = null;
let areaLoadedAt = 0;
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
function areaKeyList() {
  const out = [];
  Object.keys(areaState).forEach(n => (areaState[n].keys || []).forEach(k => out.push(k)));
  return out;
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
// Removes the area keys from the family data that goes to /api/pinn/save
function areaStripPayload(payload) {
  if (!areasActive()) return payload;
  areaKeyList().forEach(k => { delete payload[k]; });
  return payload;
}

/* ---------- Loading ---------- */
// Takes changes of an area still pending in the old family record over (device that was offline
// during the update) – merged with the server state of the area, then removed from the family record.
function areaAdoptFamilyPending() {
  const p = readPending();
  if (!p || !p.local) return;
  const keys = areaKeyList();
  if (!keys.some(k => Object.prototype.hasOwnProperty.call(p.local, k))) return;
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
  keys.forEach(k => { delete p.local[k]; if (p.base) delete p.base[k]; });
  writePending(p);
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
    const wasActive = areasActive();
    let res, body;
    try {
      const stand = {};
      Object.keys(areaState).forEach(n => { if (areaState[n].updated) stand[n] = areaState[n].updated; });
      res = await apiFetch('/api/pinn/bereiche', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ stand }),
      });
      body = await res.json().catch(() => ({}));
    } catch (e) { return false; } // offline – carry on with the cached state
    if (res.status === 404 && !Array.isArray(body.bereiche)) {
      // Older server without areas: everything stays in the family record
      if (!areasActive()) areaServer = false;
      return false;
    }
    if (!res.ok || !Array.isArray(body.bereiche)) return false;
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
    if (!wasActive && areasActive()) areaAdoptFamilyPending();
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
function areaApplyToApp() {
  try {
    applyFamilyData(composeFamilyState(familyWorkingData()));
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
  let mergedSomething = false;
  try {
    for (let guard = 0; guard < 20; guard++) {
      const items = areaPendingRead();
      const names = Object.keys(items);
      if (!names.length) break;
      const name = names[0];
      const sent = items[name];
      if (!areaState[name] || !sent || !sent.local) { delete items[name]; areaPendingWrite(items); continue; }
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
    if (!areasHavePending() && !readPending() && (familySyncState === 'offline' || familySyncState === 'error')) setSyncStatus('ok');
  } finally {
    areaFlushing = false;
    if (mergedSomething) areaApplyToApp();
    if (areaFlushAgain) { areaFlushAgain = false; areasFlush(); }
  }
}
window.addEventListener('online', () => { areasFlush(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('bereiche');
