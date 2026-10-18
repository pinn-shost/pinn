/* pinn. – Merging family data (js/zusammenfuehren.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the three-way merge of the family data set (pinnJsonEqual, pinnIsPlainObject, pinnIsIdList, pinnMergeValue,
   pinnMergeIdList, mergeFamilyData), used when local changes meet a newer state on the server.
   Loading, saving and syncing run in js/speichern.js and js/familiensync.js. */

/* ---------- Loading & saving via PocketBase ---------- */
// Three-way merge: base = last common state, local = own changes,
// remote = current state on the server (with changes from other devices).
// Rules:
// - What only one side changed is taken over.
// - Lists of entries with "id" (recipes, meals, members, rooms ...) are merged entry by
//   entry, and within an entry field by field.
// - New entries from both sides are kept.
// - An entry is only deleted if the other side has not changed it. If device A deleted something
//   that device B edited at the same time, the edit is kept.
// - Only if both sides changed the same field differently, the own change wins.
function pinnJsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function pinnIsPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function pinnIsIdList(v) {
  return Array.isArray(v) && v.length > 0 && v.every(x => pinnIsPlainObject(x) && x.id !== undefined && x.id !== null);
}
function pinnMergeValue(base, local, remote) {
  if (pinnJsonEqual(local, remote)) return local;
  if (pinnJsonEqual(local, base)) return remote;
  if (pinnJsonEqual(remote, base)) return local;
  const listish = x => x === undefined || (Array.isArray(x) && (x.length === 0 || pinnIsIdList(x)));
  if ((pinnIsIdList(local) || pinnIsIdList(remote)) && listish(base) && listish(local) && listish(remote)) {
    return pinnMergeIdList(base || [], local || [], remote || []);
  }
  if (pinnIsPlainObject(local) && pinnIsPlainObject(remote)) {
    const b = pinnIsPlainObject(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(b)]);
    keys.forEach(k => {
      const inL = k in local, inR = k in remote, inB = k in b;
      if (inL && inR) { out[k] = pinnMergeValue(b[k], local[k], remote[k]); return; }
      if (inL && !inR) { if (!inB || !pinnJsonEqual(local[k], b[k])) out[k] = local[k]; return; }
      if (!inL && inR) { if (!inB || !pinnJsonEqual(remote[k], b[k])) out[k] = remote[k]; return; }
    });
    return out;
  }
  return local; // real conflict on the same value: own change wins
}
function pinnMergeIdList(base, local, remote) {
  const bMap = new Map(base.map(x => [String(x.id), x]));
  const lMap = new Map(local.map(x => [String(x.id), x]));
  const rMap = new Map(remote.map(x => [String(x.id), x]));
  const decide = id => {
    const b = bMap.get(id), l = lMap.get(id), r = rMap.get(id);
    if (l && r) return pinnMergeValue(b, l, r);
    if (l && !r) {
      if (!b) return l; // created locally
      return pinnJsonEqual(l, b) ? undefined : l; // deleted remotely; edited locally -> keep
    }
    if (!l && r) {
      if (!b) return r; // created remotely
      return pinnJsonEqual(r, b) ? undefined : r; // deleted locally; edited remotely -> keep
    }
    return undefined;
  };
  const out = [];
  const seen = new Set();
  local.forEach(x => {
    const id = String(x.id);
    seen.add(id);
    const v = decide(id);
    if (v !== undefined) out.push(v);
  });
  remote.forEach((x, i) => {
    const id = String(x.id);
    if (seen.has(id)) return;
    seen.add(id);
    const v = decide(id);
    if (v === undefined) return;
    // Insert new entries from other devices at their position there if possible
    const prev = i > 0 ? String(remote[i - 1].id) : null;
    const pos = prev === null ? 0 : out.findIndex(o => String(o.id) === prev) + 1;
    if (prev !== null && pos === 0) out.push(v); else out.splice(pos, 0, v);
  });
  return out;
}
function mergeFamilyData(base, local, remote) {
  return pinnMergeValue(base || {}, local || {}, remote || {});
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('zusammenfuehren');
