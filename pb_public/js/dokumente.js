/* pinn. – js/dokumente.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/pdflesen.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.48.0, only the comments were translated):
   - Documents (doc…) – list with filters and "deadlines at a glance", document detail view,
     file and image viewer, create/edit popup, categories, visibility (whole family / only me / selected)
   - Outbox for offline changes (IndexedDB, docOutbox…) – new documents, changes and deletions
     including photos/PDFs are kept on the device and transferred automatically
   - Start after login, push link /?dokument=<ID> and the wiring of all buttons (initDocumentsUi)
   index.html only calls these functions later (when the user acts or from bootApp), never while it
   is still loading – that is why this file may come after the inline script.
   Three statements run while this file loads (initDocumentsUi, the change listener of docKasseSelect
   and the visibility buttons); they only use the page and names declared earlier. */

/* ==========================================================
   Documents
   ----------------------------------------------------------
   - Every document is a record in the PocketBase collection "dokumente" (pb_hooks/dokumente.pb.js
     + pinn-dokumente.js): title, category, person, date, issuer, note and, depending on the type,
     purchase data (purchase date, price, statutory warranty, manufacturer guarantee) or an expiry date.
   - Pages = photos/PDFs in the file field "dateien" (up to 20 per document, protected, only
     retrievable with a file token). Photos are scaled down before uploading.
   - Categories are stored in the family record (documentCategories) and managed on the page
     (slider icon at the top right, like in the pantry).
   - Offline: the list comes from the cache. New documents, changes and deletions
     are first put into the outbox on the device (IndexedDB - including the photos/PDFs) and are
     transferred automatically as soon as the server is reachable. The app assigns the ID itself,
     so that a document can be opened and edited even before it has been uploaded.
   - Push reminder X days before "gültig bis" (valid until) or before the end of the
     guarantee/warranty (sent by the server, once a day from 8 am).
   - The contract documents and receipts from Finances also appear (view only).
   - Vehicles: documents can be assigned to one or more vehicles (popup → "Fahrzeug" = vehicle).
     The assignment is stored on the vehicle (finance.vehicles[].docLinks) and applies in both
     directions; documents uploaded at the vehicle arrive here pre-filled with category and all details.
   ========================================================== */
const DOC_COLLECTION = 'dokumente';
const DOC_MAX_BYTES = 25 * 1024 * 1024;
const DOC_MAX_FILES = 20;
const DOC_REMIND_DAYS = [7, 14, 30, 60, 90];
const LS_DOCS = 'pinn.dokumente';
const DOC_IDB = 'pinn-dokumente';
const DOC_IDB_STORE = 'ausgang';
const DOC_FIN_FILTER = '__finanzen';
const DOC_DEFAULT_CATEGORIES = [
  { id: 'gesundheit', label: 'Gesundheit', icon: '🩺', fields: '' },
  { id: 'kaufbelege', label: 'Kaufbelege & Garantie', icon: '🧾', fields: 'kauf' },
  { id: 'ausweise', label: 'Ausweise & Urkunden', icon: '🪪', fields: 'ablauf' },
  { id: 'versicherungen', label: 'Versicherungen', icon: '🛡️', fields: '' },
  { id: 'wohnen', label: 'Wohnen & Nebenkosten', icon: '🏠', fields: '' },
  { id: 'fahrzeuge', label: 'Auto & Fahrzeuge', icon: '🚗', fields: 'ablauf' },
  { id: 'arbeit', label: 'Arbeit & Gehalt', icon: '💼', fields: '' },
  { id: 'steuern', label: 'Steuern & Behörden', icon: '🏛️', fields: '' },
  { id: 'bank', label: 'Bank & Finanzen', icon: '🏦', fields: '' },
  { id: 'schule', label: 'Schule & Zeugnisse', icon: '🎓', fields: '' },
  { id: 'anleitungen', label: 'Bedienungsanleitungen', icon: '📖', fields: '' },
  { id: 'haustiere', label: 'Haustiere', icon: '🐾', fields: '' },
  { id: 'sonstiges', label: 'Sonstiges', icon: '📦', fields: '' },
];
const DOC_ISSUER_HINTS = {
  gesundheit: ['Praxis / Klinik', 'optional, z. B. Hausarztpraxis, Klinikum'],
  kaufbelege: ['Händler', 'optional, z. B. MediaMarkt, Amazon, Möbelhaus'],
  ausweise: ['Ausgestellt von', 'optional, z. B. Stadt, Standesamt'],
  versicherungen: ['Versicherung', 'optional, z. B. HUK-Coburg'],
  fahrzeuge: ['Aussteller', 'optional, z. B. TÜV, Werkstatt, Zulassungsstelle'],
  arbeit: ['Arbeitgeber', 'optional'],
  steuern: ['Behörde', 'optional, z. B. Finanzamt'],
  bank: ['Bank', 'optional'],
  schule: ['Schule / Einrichtung', 'optional'],
  haustiere: ['Tierarzt / Aussteller', 'optional'],
};

let docServer = [];          // Documents according to the server (or the cache)
let docsLoaded = false;
let docsLoadedAt = 0;
let docsError = '';          // '' | 'offline' | 'missing'
let docsLoading = null;
let docsCacheChecked = false;
let docOutbox = [];          // Outbox: { key, docId, isNew, familie, fields, add:[{id,blob,name,size,type}], remove:[file names], del, by, createdAt, at }
let docOutboxReady = false;
let docIdbBroken = false;
let docFlushing = false;
let docFlushTimer = null;
let docUploadingKey = '';
let docCheckTimer = null;
let docFilterCategory = '';
let docFilterMember = '';
let docSearch = '';
let docOnlyDue = false;
let docGroupMode = 'category'; // 'category' | 'date' | 'alpha'
let docDetailId = null;
let docEditId = null;
let docDraft = null;         // { isNew, files: [{kind:'server'|'pending'|'new', name, id, blob, size}], removed:[names], removedPending:[IDs], filesChanged, catId, lawTouched }
let docPickTarget = null;
let docShareReady = null;    // { id, files } - load first, then (second tap) share
let docViewerState = null;   // { docId, names, index }
const docBlobUrls = new Map();

/* ---------- Categories ---------- */
function docNormalizeCategories(list) {
  const cats = (Array.isArray(list) && list.length ? list : DOC_DEFAULT_CATEGORIES)
    .filter(c => c && c.id)
    .map(c => ({ id: String(c.id), label: String(c.label || '').slice(0, 40) || 'Kategorie', icon: String(c.icon || '').slice(0, 4), fields: ['kauf', 'ablauf'].includes(c.fields) ? c.fields : '' }));
  if (!cats.some(c => c.id === 'sonstiges')) cats.push({ ...DOC_DEFAULT_CATEGORIES[DOC_DEFAULT_CATEGORIES.length - 1] });
  return cats;
}
function docCategories() {
  if (!documentCategories || !documentCategories.length) documentCategories = docNormalizeCategories([]);
  return documentCategories;
}
function docCategory(id) {
  const cats = docCategories();
  return cats.find(c => c.id === id) || cats.find(c => c.id === 'sonstiges') || { id: 'sonstiges', label: 'Sonstiges', icon: '📦', fields: '' };
}

/* ---------- Data ---------- */
function docFromRecord(r) {
  const files = Array.isArray(r.dateien) ? r.dateien.filter(Boolean) : (r.dateien ? [r.dateien] : []);
  return {
    id: r.id, titel: r.titel || '', kategorie: r.kategorie || 'sonstiges', mitglied: r.mitglied || '',
    datum: r.datum || '', aussteller: r.aussteller || '', betrag: Number(r.betrag) || 0,
    kaufdatum: r.kaufdatum || '', gewaehrleistung_bis: r.gewaehrleistung_bis || '', garantie_bis: r.garantie_bis || '',
    gueltig_bis: r.gueltig_bis || '', erinnern: Number(r.erinnern) || 0, notiz: r.notiz || '',
    groesse: Number(r.groesse) || 0, erstellt_von: r.erstellt_von || '', dateien: files, sichtbar: r.sichtbar || '', kasse: r.kasse || '',
    created: r.created || '', updated: r.updated || '',
  };
}
const DOC_FIELD_KEYS = ['titel', 'kategorie', 'mitglied', 'datum', 'aussteller', 'betrag', 'kaufdatum', 'gewaehrleistung_bis', 'garantie_bis', 'gueltig_bis', 'erinnern', 'notiz', 'sichtbar', 'kasse'];
function docServerFields(f) {
  const out = {};
  DOC_FIELD_KEYS.forEach(k => { if (f && k in f) out[k] = f[k]; });
  return out;
}
function docsCacheWrite() {
  try { localStorage.setItem(LS_DOCS, JSON.stringify({ familie: finFamilyKey(), list: docServer })); } catch (e) { /* ignore */ }
}
function docsCacheReadOnce() {
  if (docsCacheChecked) return;
  docsCacheChecked = true;
  if (docsLoaded || docServer.length) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS_DOCS) || 'null');
    if (c && c.familie === finFamilyKey() && Array.isArray(c.list)) docServer = c.list;
  } catch (e) { /* ignore */ }
}
function docUpsertServer(rec) {
  const d = docFromRecord(rec);
  docServer = [d, ...docServer.filter(x => x.id !== d.id)];
  docsLoaded = true;
  return d;
}
async function loadDocuments(force = false) {
  if (isCurrentUserGuest() || !finFamilyKey()) return;
  docsCacheReadOnce();
  if (docsLoading) return docsLoading;
  if (!force && Date.now() - docsLoadedAt < 60 * 1000) return;
  docsLoading = (async () => {
    try {
      const list = await pb.collection(DOC_COLLECTION).getFullList({ filter: pb.filter('familie = {:f}', { f: finFamilyKey() }), sort: '-created', requestKey: null });
      docServer = list.map(docFromRecord);
      docsLoaded = true;
      docsError = '';
      docsCacheWrite();
    } catch (err) {
      docsError = (err && err.status === 404) ? 'missing' : 'offline';
    } finally {
      docsLoadedAt = Date.now();
      docsLoading = null;
    }
    docsChanged();
  })();
  return docsLoading;
}
// Display = server state + the device's outbox
function docAll() {
  const fam = finFamilyKey();
  const map = new Map(docServer.map(d => [d.id, d]));
  docOutbox.filter(op => op.familie === fam).forEach(op => {
    if (op.del) { map.delete(op.docId); return; }
    const base = map.get(op.docId) || { id: op.docId, kategorie: 'sonstiges', dateien: [], created: new Date(op.createdAt || Date.now()).toISOString() };
    const merged = { ...base, ...(op.fields || {}) };
    merged.dateien = (base.dateien || []).filter(n => !(op.remove || []).includes(n));
    merged.pendingFiles = op.add || [];
    merged.pending = true;
    map.set(op.docId, merged);
  });
  return [...map.values()];
}
function docById(id) { return id ? (docAll().find(d => d.id === id) || null) : null; }
function docsChanged() {
  try {
    if (currentView === 'dokumente') renderDocuments();
    const dm = document.getElementById('docDetailModal');
    if (docDetailId && dm && !dm.classList.contains('hidden')) renderDocDetail();
    if (currentView === 'fahrzeuge' && typeof fzTab !== 'undefined' && fzTab === 'liste' && fzDetailId) renderVehicles();
    if (currentView === 'haus') renderHouse();
  } catch (e) { /* page not ready yet */ }
}

/* ---------- Outbox (IndexedDB, also works without a connection) ---------- */
function docIdbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Kein IndexedDB')); return; }
    const req = indexedDB.open(DOC_IDB, 1);
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(DOC_IDB_STORE, { keyPath: 'key' }); } catch (e) { /* already there */ }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB nicht verfügbar'));
  });
}
async function docIdbRun(mode, fn) {
  const db = await docIdbOpen();
  return new Promise((resolve, reject) => {
    let req = null;
    let tx = null;
    try {
      tx = db.transaction(DOC_IDB_STORE, mode);
      req = fn(tx.objectStore(DOC_IDB_STORE));
    } catch (e) { db.close(); reject(e); return; }
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('IndexedDB-Fehler')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB abgebrochen')); };
  });
}
async function docOutboxLoad() {
  if (docOutboxReady) return;
  try {
    const all = await docIdbRun('readonly', s => s.getAll());
    const known = new Set(docOutbox.map(o => o.key));
    docOutbox = [...docOutbox, ...(all || []).filter(op => op && op.key && !known.has(op.key))];
  } catch (e) { docIdbBroken = true; }
  docOutboxReady = true;
}
async function docOutboxPut(op) {
  op.at = Date.now();
  docOutbox = [...docOutbox.filter(o => o.key !== op.key), op];
  if (docIdbBroken) return false;
  try { await docIdbRun('readwrite', s => s.put(op)); return true; }
  catch (e) { docIdbBroken = true; return false; }
}
async function docOutboxRemove(key) {
  docOutbox = docOutbox.filter(o => o.key !== key);
  if (docIdbBroken) return;
  try { await docIdbRun('readwrite', s => s.delete(key)); } catch (e) { /* ignore */ }
}
function docOutboxOp(id) { return docOutbox.find(o => o.key === id && o.familie === finFamilyKey()) || null; }

function docBlobUrl(f) {
  if (!f || !f.blob) return '';
  if (!docBlobUrls.has(f.id)) {
    try { docBlobUrls.set(f.id, URL.createObjectURL(f.blob)); } catch (e) { return ''; }
  }
  return docBlobUrls.get(f.id);
}
function docReleaseBlobUrls() {
  const alive = new Set();
  docOutbox.forEach(op => (op.add || []).forEach(f => alive.add(f.id)));
  if (docDraft) docDraft.files.forEach(f => { if (f.id) alive.add(f.id); });
  [...docBlobUrls.keys()].forEach(id => {
    if (alive.has(id)) return;
    try { URL.revokeObjectURL(docBlobUrls.get(id)); } catch (e) { /* ignore */ }
    docBlobUrls.delete(id);
  });
}

// Put the new data of a document into the outbox (with files and removed files)
async function docEnqueueSave(id, isNew, fields, addFiles, removeNames, removePendingIds) {
  const fam = finFamilyKey();
  const cur = docOutboxOp(id);
  const op = cur
    ? { ...cur, fields: { ...(cur.fields || {}) }, add: [...(cur.add || [])], remove: [...(cur.remove || [])] }
    : { key: id, docId: id, isNew: !!isNew, familie: fam, fields: {}, add: [], remove: [], by: (currentUser() && currentUser().id) || '', createdAt: Date.now() };
  op.del = false;
  Object.assign(op.fields, fields || {});
  if (removePendingIds && removePendingIds.length) op.add = op.add.filter(f => !removePendingIds.includes(f.id));
  op.add = op.add.concat(addFiles || []);
  (removeNames || []).forEach(n => { if (!op.remove.includes(n)) op.remove.push(n); });
  const stored = await docOutboxPut(op);
  if (!stored && (addFiles || []).length) finShowToast('Hinweis: Auf diesem Gerät lassen sich Dateien nicht zwischenspeichern – bitte die App bis zum Hochladen geöffnet lassen.', true);
}
async function docEnqueueDelete(d) {
  const op = docOutboxOp(d.id);
  if (op && op.isNew) { await docOutboxRemove(d.id); return; } // never uploaded yet
  await docOutboxPut({ key: d.id, docId: d.id, isNew: false, familie: finFamilyKey(), del: true, fields: {}, add: [], remove: [] });
}

function docErrorText(err, fileName) {
  if (err && err.local) return err.message;
  const st = err && err.status;
  if (st === 404) return 'Auf dem Server fehlen noch dokumente.pb.js und pinn-dokumente.js (pb_hooks) – danach PocketBase neu starten.';
  if (st === 400) return fileName ? `„${fileName}“ wurde nicht angenommen – erlaubt sind Fotos und PDFs bis 25 MB.` : 'Der Server hat das Dokument nicht angenommen.';
  if (st === 403) return 'Keine Berechtigung für Dokumente.';
  return 'Übertragen fehlgeschlagen: ' + ((err && err.message) || 'unbekannter Fehler');
}
function docIsPermanentError(err) {
  const st = err && err.status;
  return !!st && st >= 400 && st < 500 && st !== 408 && st !== 429;
}
async function docExistsOnServer(id) {
  try { return await pb.collection(DOC_COLLECTION).getOne(id, { requestKey: null }); } catch (e) { return null; }
}

// Process the outbox: create, upload files one by one, remove files, change fields, delete
async function docFlush() {
  if (docFlushing || isCurrentUserGuest()) return;
  const fam = finFamilyKey();
  if (!fam) return;
  await docOutboxLoad();
  const ops = docOutbox.filter(o => o.familie === fam).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!ops.length || !navigator.onLine) return;
  docFlushing = true;
  clearTimeout(docFlushTimer);
  let changed = false;
  let retry = false;
  let remindCheck = false;
  try {
    for (const op0 of ops) {
      if (!docOutbox.some(o => o.key === op0.key)) continue;
      const op = { ...op0, fields: { ...(op0.fields || {}) }, add: [...(op0.add || [])], remove: [...(op0.remove || [])] };
      docUploadingKey = op.key;
      let step = '';
      let stepFile = null;
      try {
        if (op.del) {
          step = 'delete';
          try { await pb.collection(DOC_COLLECTION).delete(op.docId, { requestKey: null }); }
          catch (err) { if (!(err && err.status === 404)) throw err; }
          docServer = docServer.filter(d => d.id !== op.docId);
          await docOutboxRemove(op.key);
          changed = true;
          continue;
        }
        if (op.isNew) {
          step = 'create';
          const f0 = op.add[0] || null;
          stepFile = f0;
          const form = new FormData();
          form.append('id', op.docId);
          const fields = docServerFields(op.fields);
          Object.keys(fields).forEach(k => form.append(k, fields[k] == null ? '' : String(fields[k])));
          form.append('familie', fam);
          form.append('erstellt_von', op.by || '');
          form.append('groesse', String(f0 ? f0.size || 0 : 0));
          if (f0) form.append('dateien', f0.blob, f0.name);
          let rec = null;
          try {
            rec = await pb.collection(DOC_COLLECTION).create(form, { requestKey: null });
          } catch (err) {
            // Already created (connection dropped on the last attempt after saving)?
            rec = (err && err.status === 400) ? await docExistsOnServer(op.docId) : null;
            if (!rec) throw err;
          }
          docUpsertServer(rec);
          op.isNew = false;
          op.fields = {};
          if (f0 && (rec.dateien || []).length) op.add = op.add.slice(1);
          await docOutboxPut(op);
          changed = true;
          docsChanged();
          if (Number(fields.erinnern) > 0) remindCheck = true;
        }
        while (op.add.length) {
          step = 'add';
          const f = op.add[0];
          stepFile = f;
          const known = docServer.find(d => d.id === op.docId);
          const form = new FormData();
          form.append('dateien+', f.blob, f.name);
          form.append('groesse', String(((known && known.groesse) || 0) + (f.size || 0)));
          const rec = await pb.collection(DOC_COLLECTION).update(op.docId, form, { requestKey: null });
          docUpsertServer(rec);
          op.add = op.add.slice(1);
          await docOutboxPut(op);
          changed = true;
          docsChanged();
        }
        stepFile = null;
        if (op.remove.length) {
          step = 'remove';
          const rec = await pb.collection(DOC_COLLECTION).update(op.docId, { 'dateien-': op.remove }, { requestKey: null });
          docUpsertServer(rec);
          op.remove = [];
          await docOutboxPut(op);
          changed = true;
        }
        const fields = docServerFields(op.fields);
        if (Object.keys(fields).length) {
          step = 'fields';
          const rec = await pb.collection(DOC_COLLECTION).update(op.docId, fields, { requestKey: null });
          docUpsertServer(rec);
          if ('erinnern' in fields || 'gueltig_bis' in fields || 'garantie_bis' in fields || 'gewaehrleistung_bis' in fields) remindCheck = true;
        }
        await docOutboxRemove(op.key);
        changed = true;
      } catch (err) {
        if (!docIsPermanentError(err)) { retry = true; break; }
        // Permanent error: discard the affected part so the rest does not get stuck
        finShowToast(docErrorText(err, stepFile && stepFile.name), true);
        if (err.status === 404 && step !== 'create') { await docOutboxRemove(op.key); }
        else if ((step === 'create' || step === 'add') && stepFile && op.add.length) {
          op.add = op.add.filter(f => f.id !== stepFile.id);
          if (step === 'create' && !op.add.length) await docOutboxRemove(op.key);
          else { await docOutboxPut(op); retry = true; }
        } else if (step === 'remove') { op.remove = []; await docOutboxPut(op); retry = true; }
        else await docOutboxRemove(op.key);
        changed = true;
      }
    }
  } finally {
    docFlushing = false;
    docUploadingKey = '';
  }
  if (changed) { docsCacheWrite(); docReleaseBlobUrls(); docsChanged(); }
  if (remindCheck) docScheduleServerCheck();
  if (retry) docFlushTimer = setTimeout(docFlush, 30 * 1000);
}
function docScheduleServerCheck() {
  clearTimeout(docCheckTimer);
  docCheckTimer = setTimeout(() => {
    if (!navigator.onLine || isCurrentUserGuest()) return;
    apiFetch('/api/pinn/dokumente/pruefen', { method: 'POST' }).catch(() => { /* the schedule takes over */ });
  }, 5000);
}

/* ---------- Deadlines (expiry date, guarantee, warranty) ---------- */
const DOC_DEADLINES = [
  { field: 'gueltig_bis', name: 'Gültig', long: 'Gültig bis' },
  { field: 'garantie_bis', name: 'Garantie', long: 'Herstellergarantie bis' },
  { field: 'gewaehrleistung_bis', name: 'Gewährleistung', long: 'Gewährleistung bis' },
];
function docDaysBetween(a, b) {
  const pa = vtParts(a), pb2 = vtParts(b);
  return Math.round((Date.UTC(pb2[0], pb2[1] - 1, pb2[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function docInText(n) {
  if (n <= 0) return 'heute';
  if (n === 1) return 'morgen';
  if (n < 60) return `in ${n} Tagen`;
  const m = Math.round(n / 30.4);
  if (m < 24) return `in ${m} Monaten`;
  return `in ${Math.round(n / 365)} Jahren`;
}
// Most relevant deadline of a document: the next one still open, otherwise the one that expired last
function docDeadline(d, today) {
  const list = DOC_DEADLINES.filter(x => vtIsIso(d[x.field])).map(x => ({ ...x, date: d[x.field], days: docDaysBetween(today, d[x.field]) }));
  if (!list.length) return null;
  const open = list.filter(x => x.days >= 0).sort((a, b) => a.days - b.days);
  const x = open.length ? open[0] : list.sort((a, b) => b.days - a.days)[0];
  const warnDays = Math.max(30, Number(d.erinnern) || 0);
  let tone = 'ok';
  let label = `${x.name} bis ${vtFmt(x.date)}`;
  if (x.days < 0) { tone = 'muted'; label = x.field === 'gueltig_bis' ? 'Abgelaufen' : `${x.name} abgelaufen`; }
  else if (x.days <= 14) { tone = 'urgent'; label = x.field === 'gueltig_bis' ? `Läuft ${docInText(x.days)} ab` : `${x.name} endet ${docInText(x.days)}`; }
  else if (x.days <= warnDays) { tone = 'warn'; label = x.field === 'gueltig_bis' ? `Läuft ${docInText(x.days)} ab` : `${x.name} endet ${docInText(x.days)}`; }
  return { ...x, tone, label };
}
function docDueList(today) {
  return docAll()
    .map(d => ({ d, dl: docDeadline(d, today) }))
    .filter(x => x.dl && (x.dl.tone === 'warn' || x.dl.tone === 'urgent'))
    .sort((a, b) => a.dl.days - b.dl.days);
}

/* ---------- Files & display ---------- */
function docIsImageName(n) { return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(String(n || '')); }
function docIsPdfName(n) { return /\.pdf$/i.test(String(n || '')); }
function docFileUrl(docId, name, thumb) {
  const url = finDocBaseUrl(`/api/files/${DOC_COLLECTION}/${encodeURIComponent(docId)}/${encodeURIComponent(name)}`);
  const q = [];
  if (thumb && /\.(jpe?g|png|webp|gif)$/i.test(name)) q.push('thumb=400x400');
  if (finDocToken) q.push('token=' + encodeURIComponent(finDocToken));
  return q.length ? url + '?' + q.join('&') : url;
}
function docFileLabel(name) {
  // PocketBase appends a suffix to file names ("rechnung_ab12cd34ef.pdf") - remove it for display
  return String(name || '').replace(/_[a-z0-9]{10}(\.[^.]+)$/i, '$1');
}
function docExt(name) { const m = String(name || '').match(/\.([a-z0-9]+)$/i); return m ? m[1].toUpperCase().slice(0, 4) : ''; }
// Load images with a file token afterwards (only once per image - otherwise it reloads with every token)
function docHydrateMedia(root) {
  const imgs = [...(root || document).querySelectorAll('img[data-docimg]')];
  if (!imgs.length) return;
  const apply = () => imgs.forEach(img => {
    if (img.dataset.loaded === '1') return;
    const [id, name, thumb] = img.dataset.docimg.split('|');
    img.dataset.loaded = '1';
    img.onerror = () => {
      if (img.dataset.retried === '1') { img.remove(); return; }
      img.dataset.retried = '1';
      ensureFinDocToken(true).then(() => { img.src = docFileUrl(id, name, thumb === '1'); });
    };
    img.src = docFileUrl(id, name, thumb === '1');
  });
  if (finDocToken && Date.now() - finDocTokenAt < 100 * 1000) apply();
  else ensureFinDocToken().then(apply);
}
function docThumbHtml(d) {
  const cat = docCategory(d.kategorie);
  const files = d.dateien || [];
  const pend = d.pendingFiles || [];
  const total = files.length + pend.length;
  const count = total > 1 ? `<span class="doc-thumb-count">${total}</span>` : '';
  const firstImg = files.find(docIsImageName);
  if (firstImg) return `<span class="doc-thumb"><span>${escapeHtml(cat.icon || '📄')}</span><img data-docimg="${escapeHtml(d.id)}|${escapeHtml(firstImg)}|1" alt="" loading="lazy" />${count}</span>`;
  const pImg = pend.find(f => /^image\//.test(f.type || '') || docIsImageName(f.name));
  if (pImg && docBlobUrl(pImg)) return `<span class="doc-thumb"><img src="${escapeHtml(docBlobUrl(pImg))}" alt="" />${count}</span>`;
  const first = files[0] || (pend[0] && pend[0].name) || '';
  const ext = first && !docIsImageName(first) ? `<span class="doc-thumb-ext">${escapeHtml(docExt(first) || 'DATEI')}</span>` : '';
  return `<span class="doc-thumb">${escapeHtml(cat.icon || '📄')}${ext}${count}</span>`;
}
function docMemberName(id) {
  const m = id ? memberById(id) : null;
  return m ? memberLabel(m) : '';
}
function docRowHtml(d, today) {
  const cat = docCategory(d.kategorie);
  const dl = docDeadline(d, today);
  const meta = [];
  if (docGroupMode !== 'category') meta.push(`${cat.icon || ''} ${cat.label}`.trim());
  const who = docMemberName(d.mitglied);
  if (who) meta.push(who);
  const veh = docVehicleNames(d.id);
  if (veh) meta.push(veh);
  if (d.aussteller) meta.push(d.aussteller);
  if (vtIsIso(d.datum)) meta.push(vtFmt(d.datum));
  const chips = [];
  if (dl) chips.push(`<span class="vt-chip ${dl.tone}">${escapeHtml(dl.label)}</span>`);
  if (d.betrag > 0) chips.push(`<span class="text-[11px] text-ink/45">${escapeHtml(fmtEur(d.betrag))}</span>`);
  if (d.pending) chips.push(`<span class="vt-chip muted">${docUploadingKey === d.id ? '⏳ wird übertragen' : (navigator.onLine ? '⏳ wartet' : '📴 wird nachgereicht')}</span>`);
  return `
    <button type="button" class="doc-row w-full flex items-center gap-3 rounded-2xl bg-white border border-ink/10 shadow-sm p-2.5 text-left transition${d.pending ? ' is-pending' : ''}" data-docopen="${escapeHtml(d.id)}">
      ${docThumbHtml(d)}
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium truncate">${d.sichtbar ? '<span title="Nicht für die ganze Familie sichtbar">🔒 </span>' : ''}${escapeHtml(d.titel || 'Dokument')}</span>
        <span class="block text-[11px] text-ink/45 truncate">${escapeHtml(meta.join(' · ')) || '&nbsp;'}</span>
        ${chips.length ? `<span class="flex items-center gap-1.5 mt-1 flex-wrap">${chips.join('')}</span>` : ''}
      </span>
    </button>`;
}
// Contract documents & receipts from Finances (view only)
function docFinRowsHtml(list) {
  return list.map(fd => {
    const t = finDocType(fd.typ);
    let ref = '';
    if (/^vertrag:/.test(fd.bezug)) { const c = vtContract(fd.bezug.slice(8)); ref = c ? 'Vertrag: ' + (c.name || '') : 'Vertrag'; }
    else if (/^fahrzeug:/.test(fd.bezug)) { const fv = fzVehicle(fd.bezug.slice(9)); ref = fv ? 'Fahrzeug: ' + fzName(fv) : 'Fahrzeug'; }
    else if (/^ausgabe:/.test(fd.bezug)) { const e = ausgaben.find(x => x.id === fd.bezug.slice(8)); ref = e ? 'Ausgabe: ' + (e.title || fmtEur(e.amount)) : 'Beleg zu einer Ausgabe'; }
    const meta = [t.label, ref, vtFmt(fd.datum)].filter(Boolean).join(' · ');
    const icon = docIsImageName(fd.datei) ? '🖼️' : t.icon;
    return `
      <a class="fin-doc-link doc-row w-full flex items-center gap-3 rounded-2xl bg-white border border-ink/10 shadow-sm p-2.5 text-left transition" data-doc="${escapeHtml(fd.id)}" href="${escapeHtml(finDocUrl(fd))}" target="_blank" rel="noopener">
        <span class="doc-thumb">${escapeHtml(icon)}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(fd.name || fd.datei || 'Dokument')}</span>
          <span class="block text-[11px] text-ink/45 truncate">${escapeHtml(meta)}</span>
        </span>
        <span class="shrink-0 text-ink/30 text-sm">↗</span>
      </a>`;
  }).join('');
}
// Linked vehicles of a document as a short text (e.g. "🚗 Golf")
function docVehicleNames(docId) {
  if (isCurrentUserGuest() || typeof fzVehiclesForDoc !== 'function') return '';
  return fzVehiclesForDoc(docId).map(v => fzKind(v.kind).icon + ' ' + fzName(v)).join(', ');
}
function docMatchesSearch(d, q) {
  if (!q) return true;
  const cat = docCategory(d.kategorie);
  const veh = isCurrentUserGuest() ? [] : fzVehiclesForDoc(d.id).flatMap(v => [fzName(v), fzPlateText(v.plate), v.make, v.model]);
  const hay = [d.titel, d.aussteller, d.notiz, cat.label, docMemberName(d.mitglied), vtFmt(d.datum), ...veh, ...(d.dateien || []).map(docFileLabel)].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

function renderDocFilters() {
  const catSel = document.getElementById('docCategoryFilter');
  const memSel = document.getElementById('docMemberFilter');
  const cats = docCategories();
  const finCount = (!isCurrentUserGuest() && typeof finDocs !== 'undefined') ? finDocs.length : 0;
  if (docFilterCategory && docFilterCategory !== DOC_FIN_FILTER && !cats.some(c => c.id === docFilterCategory)) docFilterCategory = '';
  catSel.innerHTML = '<option value="">Alle Kategorien</option>'
    + cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</option>`).join('')
    + (finCount ? `<option value="${DOC_FIN_FILTER}">💶 Aus Finanzen (Verträge &amp; Belege)</option>` : '');
  catSel.value = docFilterCategory;
  if (docFilterMember && docFilterMember !== '__familie' && !memberById(docFilterMember)) docFilterMember = '';
  memSel.innerHTML = '<option value="">Alle Personen</option><option value="__familie">👨‍👩‍👧 Ganze Familie</option>'
    + members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</option>`).join('');
  memSel.value = docFilterMember;
  document.querySelectorAll('.doc-group-btn').forEach(b => b.classList.toggle('active', b.dataset.dgroup === docGroupMode));
  document.getElementById('docDueToggle').classList.toggle('active', docOnlyDue);
  const searchInp = document.getElementById('docSearchInput');
  if (searchInp.value !== docSearch && document.activeElement !== searchInp) searchInp.value = docSearch;
}

function renderDocuments() {
  const section = document.getElementById('documentsSection');
  if (!section) return;
  docsCacheReadOnce();
  if (typeof loadFinDocs === 'function') loadFinDocs(); // Contract documents in the background
  renderDocFilters();
  const today = finTodayIso();
  const listEl = document.getElementById('docList');
  const emptyEl = document.getElementById('docEmpty');
  const dueEl = document.getElementById('docDueBox');
  const statusEl = document.getElementById('docStatusInfo');

  // Notes: server files missing / offline / pending transfers
  const pendingCount = docOutbox.filter(o => o.familie === finFamilyKey()).length;
  let status = '';
  if (docsError === 'missing') status = '<p class="vt-info warn">Auf dem Server fehlen noch dokumente.pb.js und pinn-dokumente.js (pb_hooks) – danach PocketBase neu starten.</p>';
  else if (pendingCount) status = `<p class="vt-info">${navigator.onLine ? '⏳' : '📴'} ${pendingCount === 1 ? '1 Änderung wartet' : pendingCount + ' Änderungen warten'} auf die Übertragung zum NAS${navigator.onLine ? ' …' : ' – wird automatisch nachgereicht, sobald wieder Verbindung besteht.'}</p>`;
  else if (docsError === 'offline' && !docsLoaded && !docServer.length) status = '<p class="vt-info">📴 Offline – die Dokumente erscheinen, sobald wieder Verbindung zum NAS besteht.</p>';
  statusEl.innerHTML = status;
  statusEl.classList.toggle('hidden', !status);

  const all = docAll();
  const q = docSearch.trim().toLowerCase();
  const finOnly = docFilterCategory === DOC_FIN_FILTER;

  // Deadlines at a glance (only without filter/search)
  const due = (!q && !docFilterCategory && !docFilterMember && !docOnlyDue) ? docDueList(today) : [];
  dueEl.innerHTML = due.length ? `
    <div class="rounded-2xl border border-mustard/40 bg-mustard/10 p-4 mb-4">
      <div class="text-sm font-medium mb-2">⏰ Fristen im Blick</div>
      <div class="flex flex-col gap-1.5">${due.slice(0, 5).map(x => `
        <button type="button" class="doc-due-row w-full flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-left" data-docopen="${escapeHtml(x.d.id)}">
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(x.d.titel || 'Dokument')}</span>
            <span class="block text-xs text-ink/55 truncate">${escapeHtml(x.dl.long + ' ' + vtFmt(x.dl.date))}</span>
          </span>
          <span class="vt-chip ${x.dl.tone}">${escapeHtml(docInText(x.dl.days))}</span>
        </button>`).join('')}</div>
    </div>` : '';

  let items = finOnly ? [] : all.filter(d =>
    (!docFilterCategory || docCategory(d.kategorie).id === docFilterCategory) &&
    (!docFilterMember || (docFilterMember === '__familie' ? !memberById(d.mitglied) : d.mitglied === docFilterMember)) &&
    (!docOnlyDue || (docDeadline(d, today) && docDeadline(d, today).days >= 0)) &&
    docMatchesSearch(d, q));
  const byTitle = (a, b) => String(a.titel || '').localeCompare(String(b.titel || ''), 'de', { sensitivity: 'base' });
  const dateKey = d => (vtIsIso(d.datum) ? d.datum : String(d.created || '').slice(0, 10)) || '';

  let groups = [];
  if (docOnlyDue) {
    items.sort((a, b) => docDeadline(a, today).days - docDeadline(b, today).days || byTitle(a, b));
    groups = items.length ? [{ title: 'Nach Frist sortiert', icon: '⏰', items }] : [];
  } else if (docGroupMode === 'alpha') {
    const map = new Map();
    items.slice().sort(byTitle).forEach(d => {
      const letter = (d.titel || '#').trim().charAt(0).toUpperCase().replace(/[ÄÖÜ]/, m => ({ 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' })[m]) || '#';
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ title: k, icon: '', items: v }));
  } else if (docGroupMode === 'date') {
    const map = new Map();
    items.slice().sort((a, b) => dateKey(b).localeCompare(dateKey(a)) || byTitle(a, b)).forEach(d => {
      const key = dateKey(d).slice(0, 4) || 'Ohne Datum';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    groups = [...map.entries()].map(([k, v]) => ({ title: k, icon: '📅', items: v }));
  } else {
    groups = docCategories()
      .map(c => ({ title: c.label, icon: c.icon, items: items.filter(d => docCategory(d.kategorie).id === c.id).sort((a, b) => dateKey(b).localeCompare(dateKey(a)) || byTitle(a, b)) }))
      .filter(g => g.items.length);
  }

  // Contract documents & receipts from Finances
  let finList = [];
  if (!isCurrentUserGuest() && typeof finDocs !== 'undefined' && (finOnly || (!docFilterCategory && !docFilterMember && !docOnlyDue))) {
    finList = finDocs.filter(fd => !q || [fd.name, fd.datei, finDocType(fd.typ).label].join(' ').toLowerCase().includes(q));
    if (!finOnly && !q) finList = []; // without a search only via the filter "Aus Finanzen" (from Finances) - otherwise the list gets too long
  }

  const today2 = today;
  let html = groups.map(g => `
    <div>
      <h3 class="text-xs uppercase tracking-wide text-ink/40 mb-2 flex items-center gap-1.5">${g.icon ? `<span class="text-sm">${escapeHtml(g.icon)}</span>` : ''}${escapeHtml(g.title)}<span class="text-ink/30 normal-case tracking-normal">· ${g.items.length}</span></h3>
      <div class="flex flex-col gap-1.5">${g.items.map(d => docRowHtml(d, today2)).join('')}</div>
    </div>`).join('');
  if (finList.length) {
    html += `
      <div>
        <h3 class="text-xs uppercase tracking-wide text-ink/40 mb-2 flex items-center gap-1.5"><span class="text-sm">💶</span>Aus Finanzen<span class="text-ink/30 normal-case tracking-normal">· ${finList.length}</span></h3>
        <div class="flex flex-col gap-1.5">${docFinRowsHtml(finList)}</div>
        <p class="text-[11px] text-ink/40 mt-1.5">Vertragsdokumente und Belege werden in Finanzen verwaltet.</p>
      </div>`;
  }

  if (!html) {
    listEl.innerHTML = '';
    const filtered = !!(q || docFilterCategory || docFilterMember || docOnlyDue);
    emptyEl.innerHTML = (all.length || filtered)
      ? '<p class="text-sm text-ink/40 italic text-center py-6">Keine Dokumente für diese Auswahl.</p>'
      : `<div class="rounded-2xl bg-white border border-dashed border-ink/20 p-6 text-center">
          <div class="text-3xl mb-2">🗂️</div>
          <div class="font-serif text-lg mb-1">Noch keine Dokumente</div>
          <p class="text-xs text-ink/50 mb-4">Arztbriefe, Kaufbelege mit Garantie, Ausweise, Versicherungspolicen, Zeugnisse … – einfach abfotografieren oder als PDF ablegen. pinn. erinnert rechtzeitig, bevor ein Ausweis abläuft oder die Garantie endet.</p>
          <button type="button" id="docEmptyAddBtn" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">+ Erstes Dokument ablegen</button>
        </div>`;
    emptyEl.classList.remove('hidden');
    const b = document.getElementById('docEmptyAddBtn');
    if (b) b.addEventListener('click', () => openDocEditModal());
  } else {
    emptyEl.classList.add('hidden');
    emptyEl.innerHTML = '';
    listEl.innerHTML = html;
    docHydrateMedia(listEl);
  }
}

/* ---------- Popup: view document ---------- */
function openDocDetail(id) {
  const d = docById(id);
  if (!d) { finShowToast('Dieses Dokument gibt es nicht mehr.', true); return; }
  docDetailId = id;
  docShareReady = null;
  renderDocDetail();
  document.getElementById('docDetailModal').classList.remove('hidden');
}
function closeDocDetail() {
  document.getElementById('docDetailModal').classList.add('hidden');
  docDetailId = null;
  docShareReady = null;
}
function docTileHtml(docId, f, opts = {}) {
  const del = opts.removable ? `<span class="doc-tile-del" role="button" aria-label="Entfernen" data-docfiledel="${escapeHtml(opts.key)}">×</span>` : '';
  const state = opts.state ? `<span class="doc-tile-state">${escapeHtml(opts.state)}</span>` : '';
  if (f.kind === 'server') {
    const isImg = docIsImageName(f.name);
    const label = docFileLabel(f.name);
    return `
      <button type="button" class="doc-tile${isImg ? '' : ' no-img'}" data-docfile="${escapeHtml(opts.key)}" title="${escapeHtml(label)}">
        ${isImg ? `<img data-docimg="${escapeHtml(docId)}|${escapeHtml(f.name)}|1" alt="" loading="lazy" />` : `<span class="doc-tile-icon">${docIsPdfName(f.name) ? '📄' : '📎'}</span><span class="doc-tile-ext">${escapeHtml(docExt(f.name))}</span>`}
        <span class="doc-tile-name">${escapeHtml(label)}</span>${state}${del}
      </button>`;
  }
  const isImg = /^image\//.test(f.type || '') || docIsImageName(f.name);
  const url = isImg ? docBlobUrl(f) : '';
  return `
    <button type="button" class="doc-tile${url ? '' : ' no-img'}" data-docfile="${escapeHtml(opts.key)}" title="${escapeHtml(f.name || '')}">
      ${url ? `<img src="${escapeHtml(url)}" alt="" />` : `<span class="doc-tile-icon">${/pdf/i.test(f.type || '') || docIsPdfName(f.name) ? '📄' : '📎'}</span><span class="doc-tile-ext">${escapeHtml(docExt(f.name))}</span>`}
      <span class="doc-tile-name">${escapeHtml(f.name || 'Datei')}</span>${state}${del}
    </button>`;
}
function renderDocDetail() {
  const body = document.getElementById('docDetailBody');
  const d = docById(docDetailId);
  if (!body) return;
  if (!d) { closeDocDetail(); return; }
  const today = finTodayIso();
  const cat = docCategory(d.kategorie);
  const dl = docDeadline(d, today);
  const who = docMemberName(d.mitglied);
  const sub = [cat.label, who ? 'für ' + who : 'ganze Familie', vtIsIso(d.datum) ? vtFmt(d.datum) : ''].filter(Boolean).join(' · ');

  const files = [
    ...(d.dateien || []).map((name, i) => ({ kind: 'server', name, key: 's' + i })),
    ...(d.pendingFiles || []).map((f, i) => ({ kind: 'pending', ...f, key: 'p' + i })),
  ];
  const tiles = files.map(f => docTileHtml(d.id, f, { key: f.key, state: f.kind === 'pending' ? (docUploadingKey === d.id ? '⏳' : '📴') : '' })).join('');

  const rows = [];
  if (d.aussteller) rows.push([DOC_ISSUER_HINTS[cat.id] ? DOC_ISSUER_HINTS[cat.id][0] : 'Aussteller', d.aussteller]);
  if (vtIsIso(d.kaufdatum)) rows.push(['Kaufdatum', vtFmt(d.kaufdatum)]);
  if (d.betrag > 0) rows.push(['Preis', fmtEur(d.betrag)]);
  DOC_DEADLINES.forEach(x => {
    if (!vtIsIso(d[x.field])) return;
    const n = docDaysBetween(today, d[x.field]);
    rows.push([x.long, vtFmt(d[x.field]) + (n >= 0 ? ` (${docInText(n)})` : ' (abgelaufen)')]);
  });
  if (DOC_DEADLINES.some(x => vtIsIso(d[x.field]))) rows.push(['Erinnerung', d.erinnern > 0 ? `${d.erinnern} Tage vorher per Push` : 'aus']);
  const size = vtFileSize(d.groesse);
  const dateCount = files.length;
  rows.push(['Dateien', `${dateCount} ${dateCount === 1 ? 'Datei' : 'Dateien'}${size ? ' · ' + size : ''}`]);

  let hint = '';
  if (dl && (d.gewaehrleistung_bis || d.garantie_bis) && vtIsIso(d.kaufdatum) && dl.days >= 0) {
    const sinceBuy = docDaysBetween(d.kaufdatum, today);
    hint = sinceBuy <= 365
      ? '<p class="vt-info mt-3">Mangel entdeckt? Im ersten Jahr nach dem Kauf muss der Händler beweisen, dass der Mangel nicht schon beim Kauf bestand – Kaufbeleg und Fotos vom Mangel bereithalten.</p>'
      : '<p class="vt-info mt-3">Mangel entdeckt? Bei der Gewährleistung ist der Händler der Ansprechpartner, bei der Herstellergarantie der Hersteller – Kaufbeleg bereithalten.</p>';
  }

  // Linked vehicles (tapping opens the vehicle)
  const vlinks = isCurrentUserGuest() ? [] : fzVehiclesForDoc(d.id);
  const vehHtml = vlinks.length ? `
    <h4 class="vt-detail-h">🚗 Fahrzeug</h4>
    <div class="flex flex-col gap-1.5">${vlinks.map(v => `
      <button type="button" class="fin-doc-row flex items-center gap-2.5 rounded-xl border border-ink/10 px-2.5 py-2 text-left w-full" data-docveh="${escapeHtml(v.id)}">
        <span class="text-xl leading-none shrink-0">${escapeHtml(fzKind(v.kind).icon)}</span>
        <span class="min-w-0 flex-1"><span class="block text-sm font-medium truncate">${escapeHtml(fzName(v))}</span><span class="block text-[11px] text-ink/45 truncate">${escapeHtml([v.plate ? fzPlateText(v.plate) : '', fzIsArchived(v) ? 'archiviert' : '', 'beim Fahrzeug öffnen'].filter(Boolean).join(' · '))}</span></span>
        <span class="shrink-0 text-ink/30 text-sm">›</span>
      </button>`).join('')}</div>` : '';
  const canShare = !!(navigator.share && d.dateien && d.dateien.length && !d.pending);
  const shareLabel = docShareReady && docShareReady.id === d.id ? '📤 Jetzt teilen' : '📤 Teilen';
  body.innerHTML = `
    <div class="flex items-start gap-3 mb-3 pr-6">
      <span class="shrink-0 w-12 h-12 rounded-full grid place-items-center text-2xl bg-pine/10">${escapeHtml(cat.icon || '📄')}</span>
      <div class="flex-1 min-w-0">
        <h3 class="font-serif text-lg leading-tight">${escapeHtml(d.titel || 'Dokument')}</h3>
        <div class="text-xs text-ink/50 truncate">${escapeHtml(sub)}</div>
        ${d.sichtbar ? `<div class="text-[11px] text-ink/50 mt-0.5">🔒 ${escapeHtml(docVisLabel(d.sichtbar))}</div>` : ''}
        ${d.kasse ? `<div class="text-[11px] text-ink/50 mt-0.5">💶 Kasse: ${escapeHtml(docKasseName(d.kasse))}</div>` : ''}
      </div>
    </div>
    ${dl ? `<div class="vt-status-box ${dl.tone === 'ok' ? '' : dl.tone} mb-3"><div class="text-sm font-semibold">${escapeHtml(dl.label)}</div><div class="text-xs opacity-80">${escapeHtml(dl.tone === 'ok' ? (dl.field === 'gueltig_bis' ? 'läuft ' + docInText(dl.days) + ' ab' : 'endet ' + docInText(dl.days)) : dl.long + ' ' + vtFmt(dl.date))}</div></div>` : ''}
    ${d.pending ? `<p class="vt-info mb-3">${navigator.onLine ? '⏳ Wird gerade zum NAS übertragen …' : '📴 Noch nicht auf dem NAS – wird automatisch übertragen, sobald wieder Verbindung besteht.'}</p>` : ''}
    <div class="doc-file-grid mb-1">${tiles}</div>
    ${files.length ? '' : '<p class="text-xs text-ink/45 italic">Keine Dateien.</p>'}
    <h4 class="vt-detail-h">📋 Angaben</h4>
    <div>${rows.map(r => `<div class="vt-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></div>`).join('')}</div>
    ${vehHtml}
    ${d.notiz ? `<h4 class="vt-detail-h">📝 Notiz</h4><div class="doc-note">${escapeHtml(d.notiz)}</div>` : ''}
    ${hint}
    <div class="flex items-center gap-2 mt-5">
      ${canShare ? `<button type="button" id="docShareBtn" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">${shareLabel}</button>` : ''}
      <div class="flex-1"></div>
      <button type="button" id="docDetailEditBtn" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">✎ Bearbeiten</button>
    </div>`;
  docHydrateMedia(body);
  body.querySelectorAll('[data-docfile]').forEach(b => b.addEventListener('click', () => {
    const f = files.find(x => x.key === b.dataset.docfile);
    if (f) docOpenFile(d, f, files);
  }));
  document.getElementById('docDetailEditBtn').addEventListener('click', () => { const id = d.id; closeDocDetail(); openDocEditModal(id); });
  body.querySelectorAll('[data-docveh]').forEach(b => b.addEventListener('click', () => { const vid = b.dataset.docveh; closeDocDetail(); fzOpenVehicle(vid); }));
  const shareBtn = document.getElementById('docShareBtn');
  if (shareBtn) shareBtn.addEventListener('click', () => docShare(d, shareBtn));
}
// Open file: images in the viewer, everything else (PDF) in a new window
async function docOpenFile(d, f, files) {
  if (f.kind !== 'server') {
    const url = docBlobUrl(f);
    if (url) openFileViewer(url, { name: f.name, pdf: f.blob ? /pdf/i.test(f.blob.type || '') || docIsPdfName(f.name) : undefined });
    return;
  }
  const images = files.filter(x => x.kind === 'server' && docIsImageName(x.name)).map(x => x.name);
  if (docIsImageName(f.name)) { openDocViewer(d, images, images.indexOf(f.name)); return; }
  docOpenOriginal(d.id, f.name);
}
async function docOpenOriginal(docId, name) {
  const ready = (finDocToken && Date.now() - finDocTokenAt < 100 * 1000) ? Promise.resolve() : ensureFinDocToken(true);
  openFileViewer(ready.then(() => docFileUrl(docId, name, false)), { name });
}
// Share (e.g. with an insurance company or a doctor): the first tap loads the files, the second tap shares -
// iOS only allows sharing directly after a tap, not after a longer load.
async function docShare(d, btn) {
  if (docShareReady && docShareReady.id === d.id) {
    const files = docShareReady.files;
    try {
      if (navigator.canShare && !navigator.canShare({ files })) throw new Error('nicht teilbar');
      await navigator.share({ files, title: d.titel || 'Dokument' });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      finShowToast('Teilen wird auf diesem Gerät nicht unterstützt.', true);
    }
    return;
  }
  btn.disabled = true;
  btn.textContent = '⏳ Lädt …';
  try {
    await ensureFinDocToken(true);
    const files = [];
    for (const name of (d.dateien || []).slice(0, 10)) {
      const res = await fetch(docFileUrl(d.id, name, false));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      files.push(new File([blob], docFileLabel(name), { type: blob.type || (docIsPdfName(name) ? 'application/pdf' : 'image/jpeg') }));
    }
    docShareReady = { id: d.id, files };
    btn.textContent = '📤 Jetzt teilen';
  } catch (err) {
    btn.textContent = '📤 Teilen';
    finShowToast('Dateien konnten nicht geladen werden – keine Verbindung zum NAS?', true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- File viewer (PDF/image fullscreen) ---------- */
// src: address or promise for an address. PDFs are drawn page by page with pdf.js
// (reliable on iPhone/iPad, all pages scrollable); if pdf.js is missing, the browser shows them in an iframe.
let fileViewerSeq = 0;
async function openFileViewer(src, opts = {}) {
  const box = document.getElementById('fileViewer');
  const stage = document.getElementById('fileViewerStage');
  const seq = ++fileViewerSeq;
  const msg = (t) => { const el = document.createElement('div'); el.className = 'file-viewer-msg'; el.textContent = t; stage.replaceChildren(el); };
  stage.classList.remove('img-mode');
  msg('Lädt …');
  box.classList.remove('hidden');
  stage.scrollTop = 0;
  let url = null;
  try { url = await src; } catch (e) { url = null; }
  if (seq !== fileViewerSeq) return;
  if (!url) { msg('Datei konnte nicht geladen werden – keine Verbindung zum NAS?'); return; }
  const isPdf = opts.pdf != null ? !!opts.pdf : docIsPdfName(opts.name || String(url).split('?')[0]);
  if (!isPdf) {
    stage.classList.add('img-mode');
    const img = new Image();
    img.alt = '';
    img.onerror = () => { if (seq === fileViewerSeq) msg('Bild konnte nicht geladen werden.'); };
    img.src = url;
    stage.replaceChildren(img);
    return;
  }
  try {
    const lib = await finLoadPdfJs();
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    if (seq !== fileViewerSeq) return;
    const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    stage.replaceChildren();
    const cssWidth = Math.max(240, Math.min(stage.clientWidth - 16, 1000));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let i = 1; i <= pdf.numPages; i++) {
      if (seq !== fileViewerSeq) { pdf.destroy && pdf.destroy(); return; }
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: cssWidth / page.getViewport({ scale: 1 }).width * dpr });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = Math.floor(vp.width / dpr) + 'px';
      stage.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    }
  } catch (err) {
    if (seq !== fileViewerSeq) return;
    const f = document.createElement('iframe');
    f.title = 'PDF';
    f.src = url;
    stage.replaceChildren(f);
  }
}
function closeFileViewer() {
  fileViewerSeq++;
  document.getElementById('fileViewer').classList.add('hidden');
  document.getElementById('fileViewerStage').replaceChildren();
}
function fileViewerOpen() { return !document.getElementById('fileViewer').classList.contains('hidden'); }

/* ---------- Image viewer ---------- */
function openDocViewer(d, names, index) {
  if (!names.length) return;
  docViewerState = { docId: d.id, title: d.titel || 'Dokument', names, index: Math.max(0, index) };
  document.getElementById('docViewer').classList.remove('hidden');
  renderDocViewer();
}
function closeDocViewer() {
  document.getElementById('docViewer').classList.add('hidden');
  document.getElementById('docViewerImg').removeAttribute('src');
  docViewerState = null;
}
async function renderDocViewer() {
  const s = docViewerState;
  if (!s) return;
  const img = document.getElementById('docViewerImg');
  const n = s.names.length;
  document.getElementById('docViewerTitle').textContent = s.title;
  document.getElementById('docViewerCount').textContent = n > 1 ? `Seite ${s.index + 1} von ${n} · wischen zum Blättern` : docFileLabel(s.names[s.index]);
  document.getElementById('docViewerPrev').classList.toggle('hidden', n < 2);
  document.getElementById('docViewerNext').classList.toggle('hidden', n < 2);
  if (!finDocToken || Date.now() - finDocTokenAt > 100 * 1000) await ensureFinDocToken(true);
  if (docViewerState !== s) return;
  img.onerror = () => { if (!img.dataset.retried) { img.dataset.retried = '1'; ensureFinDocToken(true).then(() => { img.src = docFileUrl(s.docId, s.names[s.index], false); }); } };
  img.dataset.retried = '';
  img.src = docFileUrl(s.docId, s.names[s.index], false);
}
function docViewerStep(dir) {
  const s = docViewerState;
  if (!s || s.names.length < 2) return;
  s.index = (s.index + dir + s.names.length) % s.names.length;
  renderDocViewer();
}

/* ---------- Popup: create / edit document ---------- */
function docVal(id) { return document.getElementById(id).value; }
// opts.preset = pre-filling (e.g. from "Fahrzeuge" (vehicles), see fzDocPreset)
function openDocEditModal(id = null, opts = {}) {
  if (isCurrentUserGuest()) return;
  const d = id ? docById(id) : null;
  const pre = !d && opts && opts.preset ? opts.preset : null;
  docEditId = d ? d.id : null;
  const catId = d ? docCategory(d.kategorie).id
    : pre ? docCategory(pre.catId).id
    : ((docFilterCategory && docFilterCategory !== DOC_FIN_FILTER) ? docFilterCategory : (docCategories()[0] || { id: 'sonstiges' }).id);
  const vehIds = d ? fzVehiclesForDoc(d.id).map(v => v.id) : (pre ? (pre.vehicles || []).filter(x => fzVehicle(x)) : []);
  docDraft = {
    isNew: !d,
    catId,
    files: d ? [
      ...(d.dateien || []).map(name => ({ kind: 'server', name })),
      ...(d.pendingFiles || []).map(f => ({ kind: 'pending', ...f })),
    ] : [],
    removed: [],
    removedPending: [],
    filesChanged: false,
    lawTouched: !!(d && d.gewaehrleistung_bis) || !!(pre && pre.lawFixed),
    catTouched: !!d || !!pre,
    dateTouched: !!d,
    pdfRead: false,
    autoTitle: '',
    vehicles: vehIds,
    vehStart: vehIds.slice().sort().join(','),
    vehTouched: !!d || !!pre,
    fzTyp: pre ? pre.typ : '',
    fzTitle: pre ? pre.titel : '',
    buyFields: !!(pre && pre.buy),
    autoBuy: pre ? (pre.kaufdatum || '') : '',
    autoExpiry: pre ? (pre.gueltig_bis || '') : '',
    hsRef: pre && pre.hsRef ? String(pre.hsRef) : '', // House: link (home:/log:/defect:<ID>)
  };
  const preVeh = pre && vehIds.length ? fzVehicle(vehIds[0]) : null;
  document.getElementById('docPdfInfo').classList.add('hidden');
  document.getElementById('docEditTitle').textContent = d ? 'Dokument bearbeiten' : (preVeh ? 'Neues Dokument · ' + fzName(preVeh) : 'Neues Dokument');
  document.getElementById('docTitleInput').value = d ? d.titel : (pre ? pre.titel : '');
  const memSel = document.getElementById('docMemberSelect');
  memSel.innerHTML = '<option value="">Ganze Familie</option>' + members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</option>`).join('');
  memSel.value = d && memberById(d.mitglied) ? d.mitglied
    : (pre ? (memberById(pre.mitglied) ? pre.mitglied : '') : ((docFilterMember && docFilterMember !== '__familie' && memberById(docFilterMember)) ? docFilterMember : ''));
  document.getElementById('docDateInput').value = d ? (d.datum || '') : (pre && vtIsIso(pre.datum) ? pre.datum : finTodayIso());
  document.getElementById('docIssuerInput').value = d ? d.aussteller : (pre ? pre.aussteller : '');
  document.getElementById('docBuyDateInput').value = d ? (d.kaufdatum || '') : (pre ? pre.kaufdatum : '');
  document.getElementById('docPriceInput').value = d && d.betrag > 0 ? euroInputValue(d.betrag) : (pre && pre.betrag > 0 ? euroInputValue(pre.betrag) : '');
  document.getElementById('docWarrantyLawInput').value = d ? (d.gewaehrleistung_bis || '') : (pre ? pre.gewaehrleistung_bis : '');
  // Manufacturer guarantee: if the date matches "purchase date + X years", preselect the years
  let gSel = '';
  if (d && vtIsIso(d.garantie_bis)) {
    gSel = 'x';
    if (vtIsIso(d.kaufdatum)) {
      const y = ['1', '2', '3', '5', '10'].find(n => vtAddMonths(d.kaufdatum, Number(n) * 12, false) === d.garantie_bis);
      if (y) gSel = y;
    }
  }
  document.getElementById('docGuaranteeSelect').value = gSel;
  document.getElementById('docGuaranteeDateInput').value = d && gSel === 'x' ? d.garantie_bis : '';
  document.getElementById('docExpiryInput').value = d ? (d.gueltig_bis || '') : (pre ? pre.gueltig_bis : '');
  const remind = d ? (DOC_REMIND_DAYS.includes(Number(d.erinnern)) ? String(d.erinnern) : '0')
    : pre ? (DOC_REMIND_DAYS.includes(Number(pre.erinnern)) ? String(pre.erinnern) : '0') : '30';
  document.getElementById('docRemindSelect').value = remind;
  document.getElementById('docNoteInput').value = d ? d.notiz : (pre ? pre.notiz : '');
  document.getElementById('docEditError').classList.add('hidden');
  document.getElementById('deleteDocBtn').classList.toggle('hidden', !d);
  document.getElementById('saveDocBtn').textContent = d ? 'Speichern' : 'Ablegen';
  const cat = docCategory(catId);
  document.getElementById('docBuyBlock').open = cat.fields === 'kauf' || !!(d && (d.kaufdatum || d.betrag > 0 || d.gewaehrleistung_bis || d.garantie_bis)) || !!(pre && pre.buy);
  document.getElementById('docExpiryBlock').open = (cat.fields === 'ablauf' && !(pre && pre.buy)) || !!(d && d.gueltig_bis) || !!(pre && pre.gueltig_bis);
  docVisInit(d ? (d.sichtbar || '') : (pre && pre.sichtbar ? pre.sichtbar : ''));
  docKasseInit(d ? (d.kasse || '') : (pre && pre.kasse ? pre.kasse : ''));
  renderDocCategoryPicker();
  renderDocVehiclePicker();
  renderDocEditFiles();
  updateDocEditUi();
  document.getElementById('docEditModal').classList.remove('hidden');
  armModalSnapshot('docEditModal');
}
function closeDocEditModal() {
  document.getElementById('docEditModal').classList.add('hidden');
  docEditId = null;
  docDraft = null;
  docReleaseBlobUrls();
}
function docVehiclesChanged() {
  return !!docDraft && docDraft.vehicles.slice().sort().join(',') !== docDraft.vehStart;
}
function attemptCloseDocEdit() {
  if (docDraft && (docDraft.filesChanged || docVehiclesChanged()) && !isModalDirty('docEditModal')) {
    if (!confirm('Wirklich abbrechen? Deine Eingaben gehen dabei verloren.')) return;
    closeDocEditModal();
    return;
  }
  attemptCloseModal('docEditModal', closeDocEditModal);
}
function renderDocCategoryPicker() {
  const wrap = document.getElementById('docCategoryPicker');
  wrap.innerHTML = docCategories().map(c => `
    <button type="button" class="pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition ${c.id === docDraft.catId ? 'active' : ''}" data-id="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</button>`).join('');
  wrap.querySelectorAll('.pantry-chip').forEach(b => b.addEventListener('click', () => {
    docDraft.catId = b.dataset.id;
    docDraft.catTouched = true;
    wrap.querySelectorAll('.pantry-chip').forEach(x => x.classList.toggle('active', x === b));
    const cat = docCategory(docDraft.catId);
    if (cat.fields === 'kauf') document.getElementById('docBuyBlock').open = true;
    if (cat.fields === 'ablauf') document.getElementById('docExpiryBlock').open = true;
    docSuggestVehicle();
    updateDocEditUi();
  }));
}
// Category "Auto & Fahrzeuge" (cars & vehicles) and only one active vehicle: assign it right away
function docSuggestVehicle() {
  if (!docDraft || docDraft.vehTouched || docDraft.vehicles.length || docDraft.catId !== 'fahrzeuge') return;
  const act = fzActiveVehicles();
  if (act.length !== 1) return;
  docDraft.vehicles = [act[0].id];
  renderDocVehiclePicker();
}
// Vehicle selection in the popup (several possible, e.g. one policy for two cars)
function renderDocVehiclePicker() {
  const wrap = document.getElementById('docVehicleWrap');
  const box = document.getElementById('docVehiclePicker');
  const info = document.getElementById('docVehicleInfo');
  if (!wrap || !docDraft) return;
  const list = (finance && !isCurrentUserGuest()) ? fzVehicles().filter(v => !fzIsArchived(v) || docDraft.vehicles.includes(v.id)) : [];
  wrap.classList.toggle('hidden', !list.length);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = list.map(v => `
    <button type="button" class="pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition ${docDraft.vehicles.includes(v.id) ? 'active' : ''}" data-veh="${escapeHtml(v.id)}">${escapeHtml(fzKind(v.kind).icon + ' ' + fzName(v) + (v.plate ? ' · ' + fzPlateText(v.plate) : '') + (fzIsArchived(v) ? ' (archiviert)' : ''))}</button>`).join('');
  box.querySelectorAll('[data-veh]').forEach(b => b.addEventListener('click', () => {
    const vid = b.dataset.veh;
    docDraft.vehTouched = true;
    docDraft.vehicles = docDraft.vehicles.includes(vid) ? docDraft.vehicles.filter(x => x !== vid) : [...docDraft.vehicles, vid];
    renderDocVehiclePicker();
  }));
  info.textContent = docDraft.vehicles.length
    ? 'Erscheint zusätzlich beim Fahrzeug – die Zuordnung lässt sich hier oder dort ändern.'
    : 'Optional: einem Fahrzeug zuordnen – das Dokument erscheint dann auch dort.';
}
function renderDocEditFiles() {
  const wrap = document.getElementById('docEditFiles');
  const docId = docEditId || '';
  wrap.innerHTML = docDraft.files.map((f, i) => docTileHtml(docId, f, { key: String(i), removable: true, state: f.kind === 'server' ? '' : (f.kind === 'pending' ? '📴' : 'neu') })).join('');
  docHydrateMedia(wrap);
  wrap.querySelectorAll('[data-docfiledel]').forEach(x => x.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const i = Number(x.dataset.docfiledel);
    const f = docDraft.files[i];
    if (!f) return;
    if (f.kind === 'server') docDraft.removed.push(f.name);
    else if (f.kind === 'pending') docDraft.removedPending.push(f.id);
    docDraft.files.splice(i, 1);
    docDraft.filesChanged = true;
    renderDocEditFiles();
  }));
  wrap.querySelectorAll('[data-docfile]').forEach(b => b.addEventListener('click', () => {
    const f = docDraft.files[Number(b.dataset.docfile)];
    if (!f) return;
    if (f.kind === 'server' && docEditId) docOpenOriginal(docEditId, f.name);
    else { const url = docBlobUrl(f); if (url) openFileViewer(url, { name: f.name, pdf: f.blob ? /pdf/i.test(f.blob.type || '') || docIsPdfName(f.name) : undefined }); }
  }));
}
function docPickFiles(camera) {
  if (!docDraft) return;
  const inp = document.getElementById(camera ? 'docCameraInput' : 'docFileInput');
  inp.value = '';
  inp.click();
}
async function onDocFilesChosen(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!docDraft || !files.length) return;
  const errEl = document.getElementById('docEditError');
  errEl.classList.add('hidden');
  const room = DOC_MAX_FILES - docDraft.files.length;
  if (room <= 0) { errEl.textContent = `Höchstens ${DOC_MAX_FILES} Dateien je Dokument.`; errEl.classList.remove('hidden'); return; }
  const btns = ['docAddCameraBtn', 'docAddFileBtn'].map(id => document.getElementById(id));
  btns.forEach(b => { b.disabled = true; });
  const errors = [];
  try {
    for (const file of files.slice(0, room)) {
      let blob = file;
      let name = file.name || ('foto-' + finTodayIso() + '.jpg');
      const small = await finCompressDocImage(file).catch(() => null);
      if (small) { blob = small; name = name.replace(/\.[^.]+$/, '') + '.jpg'; }
      if (blob.size > DOC_MAX_BYTES) { errors.push(`„${file.name}“ ist zu groß (höchstens 25 MB).`); continue; }
      docDraft.files.push({ kind: 'new', id: 'f' + newRecordId(), blob, name: finSafeFileName(name), size: blob.size || 0, type: blob.type || file.type || '' });
      docDraft.filesChanged = true;
    }
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
  if (files.length > room) errors.push(`Nur ${room} weitere Datei${room === 1 ? '' : 'en'} möglich (höchstens ${DOC_MAX_FILES}).`);
  if (errors.length) { errEl.textContent = errors[0]; errEl.classList.remove('hidden'); }
  // Suggest a title from the first file name (not for camera photos like "image.jpg")
  const titleInp = document.getElementById('docTitleInput');
  if (!titleInp.value.trim()) {
    const first = files[0] && files[0].name ? files[0].name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() : '';
    if (first && !/^(image|img|photo|foto|scan|dsc|pxl)[\s_-]?\d*$/i.test(first) && !/^[0-9a-f-]{16,}$/i.test(first)) { titleInp.value = first.slice(0, 200); docDraft.autoTitle = titleInp.value; }
  }
  renderDocEditFiles();
  // Invoice as PDF: pre-fill empty fields from the content (once per popup)
  const pdf = files.slice(0, room).find(pinnIsPdfFile);
  if (pdf && !docDraft.pdfRead && pdf.size <= DOC_MAX_BYTES) { docDraft.pdfRead = true; docAutofillFromPdf(pdf); }
}
function docGuaranteeDate() {
  const sel = docVal('docGuaranteeSelect');
  if (!sel) return '';
  if (sel === 'x') return vtIsIso(docVal('docGuaranteeDateInput')) ? docVal('docGuaranteeDateInput') : '';
  const base = vtIsIso(docVal('docBuyDateInput')) ? docVal('docBuyDateInput') : '';
  return base ? vtAddMonths(base, Number(sel) * 12, false) : '';
}
function updateDocEditUi() {
  if (!docDraft) return;
  const cat = docCategory(docDraft.catId);
  const hint = DOC_ISSUER_HINTS[cat.id] || ['Aussteller', 'optional, z. B. Praxis, Händler, Behörde'];
  document.getElementById('docIssuerLabel').textContent = hint[0];
  document.getElementById('docIssuerInput').placeholder = hint[1];
  const sel = docVal('docGuaranteeSelect');
  document.getElementById('docGuaranteeDateWrap').classList.toggle('hidden', sel !== 'x');
  // Note on purchase & guarantee
  const today = finTodayIso();
  const buy = docVal('docBuyDateInput');
  const law = docVal('docWarrantyLawInput');
  const gar = docGuaranteeDate();
  const info = document.getElementById('docBuyInfo');
  const parts = [];
  if (vtIsIso(law)) {
    const n = docDaysBetween(today, law);
    parts.push(n >= 0 ? `Gewährleistung noch bis ${vtFmt(law)} (${docInText(n)}).` : `Gewährleistung seit ${vtFmt(law)} abgelaufen.`);
  }
  if (sel && sel !== 'x' && !vtIsIso(buy)) parts.push('Für die Herstellergarantie bitte das Kaufdatum angeben.');
  else if (vtIsIso(gar)) {
    const n = docDaysBetween(today, gar);
    parts.push(n >= 0 ? `Herstellergarantie bis ${vtFmt(gar)} (${docInText(n)}).` : `Herstellergarantie seit ${vtFmt(gar)} abgelaufen.`);
  }
  if (vtIsIso(buy)) {
    parts.push('Gesetzliche Gewährleistung: 2 Jahre ab Kauf (bei Gebrauchtware oft 1 Jahr). Im ersten Jahr muss der Händler beweisen, dass ein Mangel nicht schon beim Kauf bestand.');
  } else if (!parts.length) {
    parts.push('Mit dem Kaufdatum trägt pinn. die gesetzliche Gewährleistung (2 Jahre) automatisch ein.');
  }
  info.textContent = parts.join(' ');
  info.classList.toggle('warn', sel && sel !== 'x' && !vtIsIso(buy));
  // A reminder only makes sense with a date
  const hasDate = vtIsIso(docVal('docExpiryInput')) || vtIsIso(law) || vtIsIso(gar);
  const rem = Number(docVal('docRemindSelect')) || 0;
  const remInfo = document.getElementById('docRemindInfo');
  if (!hasDate) remInfo.textContent = 'Greift, sobald ein Ablaufdatum oder eine Garantie eingetragen ist.';
  else if (!rem) remInfo.textContent = 'Keine Push-Erinnerung.';
  else {
    const m = memberById(docVal('docMemberSelect'));
    remInfo.textContent = (m && !vtIsChildMember(m) ? `Erinnert ${memberLabel(m)}` : 'Erinnert alle Erwachsenen der Familie') + ` ${rem} Tage vor dem Ablauf bzw. Garantie-Ende.`;
  }
}
function onDocBuyDateChanged() {
  const buy = docVal('docBuyDateInput');
  if (vtIsIso(buy) && !docDraft.lawTouched) document.getElementById('docWarrantyLawInput').value = vtAddMonths(buy, 24, false);
  updateDocEditUi();
}
async function saveDocFromModal() {
  if (!docDraft) return;
  const errEl = document.getElementById('docEditError');
  const showErr = (t) => { errEl.textContent = t; errEl.classList.remove('hidden'); };
  errEl.classList.add('hidden');
  if (!docDraft.files.length) { showErr('Bitte mindestens ein Foto oder PDF hinzufügen.'); return; }
  const sel = docVal('docGuaranteeSelect');
  if (sel && sel !== 'x' && !vtIsIso(docVal('docBuyDateInput'))) { document.getElementById('docBuyBlock').open = true; showErr('Für die Herstellergarantie bitte das Kaufdatum angeben.'); return; }
  const priceRaw = docVal('docPriceInput').trim();
  const price = priceRaw ? parseEuro(priceRaw) : 0;
  if (priceRaw && (!isFinite(price) || price < 0)) { document.getElementById('docBuyBlock').open = true; showErr('Bitte einen gültigen Preis eingeben.'); return; }
  const cat = docCategory(docDraft.catId);
  let titel = docVal('docTitleInput').replace(/\s+/g, ' ').trim().slice(0, 200);
  const datum = vtIsIso(docVal('docDateInput')) ? docVal('docDateInput') : '';
  if (!titel) titel = `${cat.label}${datum ? ' vom ' + vtFmt(datum) : ''}`;
  const fields = {
    titel,
    kategorie: cat.id,
    mitglied: docVal('docMemberSelect') || '',
    datum,
    aussteller: docVal('docIssuerInput').replace(/\s+/g, ' ').trim().slice(0, 200),
    betrag: price > 0 ? price : 0,
    kaufdatum: vtIsIso(docVal('docBuyDateInput')) ? docVal('docBuyDateInput') : '',
    gewaehrleistung_bis: vtIsIso(docVal('docWarrantyLawInput')) ? docVal('docWarrantyLawInput') : '',
    garantie_bis: docGuaranteeDate(),
    gueltig_bis: vtIsIso(docVal('docExpiryInput')) ? docVal('docExpiryInput') : '',
    erinnern: Number(docVal('docRemindSelect')) || 0,
    notiz: docVal('docNoteInput').trim().slice(0, 4000),
    sichtbar: docVisValue(),
    kasse: docKasseValue(),
  };
  const isNew = docDraft.isNew;
  const id = isNew ? newRecordId() : docEditId;
  const existing = isNew ? null : docById(id);
  // Only transfer changed fields
  const changed = {};
  Object.keys(fields).forEach(k => { if (!existing || String(existing[k] ?? '') !== String(fields[k] ?? '')) changed[k] = fields[k]; });
  const addFiles = docDraft.files.filter(f => f.kind === 'new').map(({ id: fid, blob, name, size, type }) => ({ id: fid, blob, name, size, type }));
  const btn = document.getElementById('saveDocBtn');
  btn.disabled = true;
  try {
    if (isNew || Object.keys(changed).length || addFiles.length || docDraft.removed.length || docDraft.removedPending.length) {
      await docEnqueueSave(id, isNew, isNew ? fields : changed, addFiles, docDraft.removed, docDraft.removedPending);
    }
  } finally {
    btn.disabled = false;
  }
  // Vehicles: maintain the assignment in both directions, hand the details back to the vehicle
  const vehIds = docDraft.vehicles.filter(x => fzVehicle(x));
  const fzTyp = docDraft.fzTyp;
  const docHsRef = docDraft.hsRef;
  let fzNotes = [];
  let fzChanged = false;
  if (finance) {
    fzChanged = fzSetDocVehicles(id, vehIds);
    if (fzTyp && vehIds.length) fzNotes = fzApplyDocToVehicle(vehIds[0], fzTyp, fields);
    if (fzChanged || fzNotes.length) fzAfterChange();
    // House: uploaded at the home, at an invoice or at a defect
    if (docDraft.hsRef && hsLinkDoc(docDraft.hsRef, id)) hsAfterChange();
  }
  if (isNew) { docFilterCategory = (docFilterCategory && docFilterCategory !== cat.id) ? '' : docFilterCategory; docOnlyDue = false; }
  closeDocEditModal();
  renderDocuments();
  const extra = fzNotes.length ? ' Fahrzeug aktualisiert: ' + fzNotes.join(', ') + '.' : '';
  if (!navigator.onLine) finShowToast('Gespeichert – wird zum NAS übertragen, sobald wieder Verbindung besteht.' + extra);
  else if (isNew && fzTyp) finShowToast(`Abgelegt unter „Dokumente“ → ${cat.label} und beim Fahrzeug.` + extra);
  else if (isNew && docHsRef) finShowToast(`Abgelegt unter „Dokumente“ → ${cat.label} und beim Haus.`);
  else finShowToast((isNew ? 'Dokument abgelegt.' : 'Dokument gespeichert.') + extra);
  docFlush();
}
async function deleteDocFromModal() {
  const d = docById(docEditId);
  if (!d || !confirm(`Dokument „${d.titel || 'Dokument'}“ mit allen Dateien löschen?`)) return;
  await docEnqueueDelete(d);
  if (finance && fzSetDocVehicles(d.id, [])) fzAfterChange();
  if (finance && hsUnlinkDoc(d.id)) hsAfterChange();
  closeDocEditModal();
  renderDocuments();
  finShowToast('Dokument gelöscht.');
  docFlush();
}

/* ---------- Popup: categories ---------- */
let docCatDraft = [];
function openDocCategories() {
  docCatDraft = docCategories().map(c => ({ ...c }));
  renderDocCategoryEditor();
  document.getElementById('docCategoryModal').classList.remove('hidden');
  armModalSnapshot('docCategoryModal');
}
function closeDocCategories() {
  document.getElementById('docCategoryModal').classList.add('hidden');
  docCatDraft = [];
}
function renderDocCategoryEditor() {
  const wrap = document.getElementById('docCategoryEditor');
  const used = new Map();
  docAll().forEach(d => used.set(d.kategorie, (used.get(d.kategorie) || 0) + 1));
  wrap.innerHTML = docCatDraft.map((c, i) => `
    <div class="doc-cat-row flex items-center gap-2" data-idx="${i}">
      <input type="text" data-field="icon" value="${escapeHtml(c.icon || '')}" maxlength="4" class="w-11 shrink-0 rounded-lg border border-ink/15 px-1 py-1.5 text-center text-lg" aria-label="Symbol" />
      <input type="text" data-field="label" data-i18n-value value="${escapeHtml(c.label || '')}" maxlength="40" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="Name" />
      <select data-field="fields" class="w-20 shrink-0 rounded-lg border border-ink/15 px-1.5 py-2 text-xs bg-white" aria-label="Zusatzfelder">
        <option value=""${c.fields ? '' : ' selected'}>–</option>
        <option value="kauf"${c.fields === 'kauf' ? ' selected' : ''}>🧾 Kauf</option>
        <option value="ablauf"${c.fields === 'ablauf' ? ' selected' : ''}>⏳ Frist</option>
      </select>
      ${c.id === 'sonstiges' ? '<span class="w-8 shrink-0"></span>' : `<button type="button" data-action="delete" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="Löschen">×</button>`}
    </div>`).join('');
  wrap.querySelectorAll('[data-idx]').forEach(row => {
    const i = Number(row.dataset.idx);
    row.querySelectorAll('[data-field]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => { docCatDraft[i][inp.dataset.field] = inp.value; });
    });
    const del = row.querySelector('[data-action="delete"]');
    if (del) del.addEventListener('click', () => {
      const c = docCatDraft[i];
      const n = used.get(c.id) || 0;
      if (n && !confirm(`„${c.label}“ wird von ${n} Dokument${n === 1 ? '' : 'en'} verwendet. Diese stehen danach unter „Sonstiges“. Trotzdem löschen?`)) return;
      docCatDraft.splice(i, 1);
      renderDocCategoryEditor();
    });
  });
}
function addDocCategory() {
  docCatDraft.push({ id: 'dk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '', icon: '🏷️', fields: '' });
  renderDocCategoryEditor();
  const inputs = document.querySelectorAll('#docCategoryEditor input[data-field="label"]');
  const last = inputs[inputs.length - 1];
  if (last) setTimeout(() => last.focus(), 30);
}
function saveDocCategories() {
  const cats = docCatDraft
    .map(c => ({ ...c, label: String(c.label || '').replace(/\s+/g, ' ').trim().slice(0, 40), icon: String(c.icon || '').trim().slice(0, 4) }))
    .filter(c => c.label);
  documentCategories = docNormalizeCategories(cats);
  if (docFilterCategory && docFilterCategory !== DOC_FIN_FILTER && !documentCategories.some(c => c.id === docFilterCategory)) docFilterCategory = '';
  closeDocCategories();
  persistState();
  renderDocuments();
}

/* ---------- Start, push link & wiring ---------- */
// After login: load the outbox, fetch the list in the background, transfer what is waiting
async function docStart() {
  if (isCurrentUserGuest()) return;
  docsCacheReadOnce();
  await docOutboxLoad();
  if (docOutbox.some(o => o.familie === finFamilyKey())) docFlush();
  if (currentView === 'dokumente') renderDocuments();
}
// Push message tapped: /?dokument=<ID> opens the document
function docOpenFromUrl() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('dokument') || ''; } catch (e) { id = ''; }
  if (!id) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  if (isCurrentUserGuest()) return;
  setView('dokumente');
  const open = () => { if (docById(id)) openDocDetail(id); };
  if (docById(id)) open();
  else loadDocuments(true).then(open);
}

(function initDocumentsUi() {
  document.getElementById('openDocAddBtn').addEventListener('click', () => openDocEditModal());
  document.getElementById('openDocCategoriesBtn').addEventListener('click', openDocCategories);
  document.getElementById('docSearchInput').addEventListener('input', (e) => { docSearch = e.target.value; renderDocuments(); });
  document.getElementById('docDueToggle').addEventListener('click', () => { docOnlyDue = !docOnlyDue; renderDocuments(); });
  document.getElementById('docCategoryFilter').addEventListener('change', (e) => { docFilterCategory = e.target.value; renderDocuments(); });
  document.getElementById('docMemberFilter').addEventListener('change', (e) => { docFilterMember = e.target.value; renderDocuments(); });
  document.querySelectorAll('.doc-group-btn').forEach(b => b.addEventListener('click', () => { docGroupMode = b.dataset.dgroup; docOnlyDue = false; renderDocuments(); }));
  // Open document (list and "Fristen im Blick" = deadlines at a glance)
  ['docList', 'docDueBox'].forEach(id => document.getElementById(id).addEventListener('click', (e) => {
    const row = e.target.closest('[data-docopen]');
    if (row) openDocDetail(row.dataset.docopen);
  }));

  // View
  document.getElementById('closeDocDetailBtn').addEventListener('click', closeDocDetail);
  document.getElementById('docDetailModal').addEventListener('click', (e) => { if (e.target.id === 'docDetailModal') closeDocDetail(); });

  // Create / edit
  document.getElementById('closeDocEditBtn').addEventListener('click', attemptCloseDocEdit);
  document.getElementById('cancelDocEditBtn').addEventListener('click', attemptCloseDocEdit);
  document.getElementById('docEditModal').addEventListener('click', (e) => { if (e.target.id === 'docEditModal') attemptCloseDocEdit(); });
  document.getElementById('saveDocBtn').addEventListener('click', saveDocFromModal);
  document.getElementById('deleteDocBtn').addEventListener('click', deleteDocFromModal);
  document.getElementById('docAddCameraBtn').addEventListener('click', () => docPickFiles(true));
  document.getElementById('docAddFileBtn').addEventListener('click', () => docPickFiles(false));
  document.getElementById('docFileInput').addEventListener('change', onDocFilesChosen);
  document.getElementById('docCameraInput').addEventListener('change', onDocFilesChosen);
  document.getElementById('docBuyDateInput').addEventListener('change', onDocBuyDateChanged);
  document.getElementById('docDateInput').addEventListener('input', () => { if (docDraft) docDraft.dateTouched = true; });
  document.getElementById('docDateInput').addEventListener('change', () => { if (docDraft) docDraft.dateTouched = true; });
  document.getElementById('docWarrantyLawInput').addEventListener('change', () => { if (docDraft) docDraft.lawTouched = !!docVal('docWarrantyLawInput'); updateDocEditUi(); });
  ['docGuaranteeSelect', 'docGuaranteeDateInput', 'docExpiryInput', 'docRemindSelect', 'docMemberSelect'].forEach(id => document.getElementById(id).addEventListener('change', updateDocEditUi));
  document.getElementById('docTitleInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.getElementById('docIssuerInput').focus(); } });

  // Categories
  document.getElementById('closeDocCategoryBtn').addEventListener('click', () => attemptCloseModal('docCategoryModal', closeDocCategories));
  document.getElementById('cancelDocCategoryBtn').addEventListener('click', () => attemptCloseModal('docCategoryModal', closeDocCategories));
  wireModalOutsideClick('docCategoryModal', closeDocCategories);
  document.getElementById('saveDocCategoryBtn').addEventListener('click', saveDocCategories);
  document.getElementById('addDocCategoryBtn').addEventListener('click', addDocCategory);

  // Image viewer
  document.getElementById('docViewerCloseBtn').addEventListener('click', closeDocViewer);
  document.getElementById('fileViewerCloseBtn').addEventListener('click', (e) => { e.stopPropagation(); closeFileViewer(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fileViewerOpen()) { e.preventDefault(); e.stopImmediatePropagation(); closeFileViewer(); }
  }, true);
  document.getElementById('docViewerPrev').addEventListener('click', (e) => { e.stopPropagation(); docViewerStep(-1); });
  document.getElementById('docViewerNext').addEventListener('click', (e) => { e.stopPropagation(); docViewerStep(1); });
  document.getElementById('docViewerOpenBtn').addEventListener('click', () => {
    const s = docViewerState;
    if (s) docOpenOriginal(s.docId, s.names[s.index]);
  });
  const stage = document.getElementById('docViewerStage');
  let touchX = null, touchY = null, touchN = 0;
  stage.addEventListener('touchstart', (e) => { touchN = e.touches.length; if (touchN === 1) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; } }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null || touchN !== 1 || !e.changedTouches.length) { touchX = null; return; }
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) docViewerStep(dx < 0 ? 1 : -1);
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) closeDocViewer(); // swiping down closes
  }, { passive: true });
  stage.addEventListener('click', (e) => { if (e.target === stage) closeDocViewer(); });
  document.addEventListener('keydown', (e) => {
    if (!docViewerState) return;
    if (e.key === 'Escape') closeDocViewer();
    else if (e.key === 'ArrowLeft') docViewerStep(-1);
    else if (e.key === 'ArrowRight') docViewerStep(1);
  });

  window.addEventListener('online', () => { docFlush(); if (currentView === 'dokumente') { loadDocuments(true); renderDocuments(); } });
  window.addEventListener('offline', () => { if (currentView === 'dokumente') renderDocuments(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !familyRecordId || isCurrentUserGuest()) return;
    docFlush();
    if (currentView === 'dokumente') loadDocuments();
  });
  // Documents from other devices
  setInterval(() => {
    if (document.visibilityState === 'visible' && currentView === 'dokumente' && familyRecordId) loadDocuments(true);
  }, 60 * 1000);
})();


/* ---------- Documents: visibility (whole family / only me / selected) ----------
   Field "sichtbar" (visible): empty = whole family, otherwise profile IDs separated by commas. The server
   gives the document (with its files and reminders) only to these profiles - you are always included yourself. */
// Cash box of a document: empty = family (all profiles except guests), otherwise only the members of the cash box
let docKasseStart = '';
function docKasseName(id) {
  const k = kasseById(id);
  return k ? (k.icon || '💶') + ' ' + kasseDisplayName(k) : '🔒 Kasse';
}
function docKasseInit(v) {
  docKasseStart = v || '';
  const wrap = document.getElementById('docKasseWrap');
  const sel = document.getElementById('docKasseSelect');
  const real = kassenActiveMode() ? kassenRealSorted() : [];
  if (!real.length && !docKasseStart) { wrap.classList.add('hidden'); sel.innerHTML = ''; return; }
  const opts = ['<option value="">👨‍👩‍👧 Familie – alle (Standard)</option>']
    .concat(real.map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml((k.icon || '💶') + ' ' + kasseDisplayName(k))}</option>`));
  if (docKasseStart && !real.some(k => k.id === docKasseStart)) opts.push(`<option value="${escapeHtml(docKasseStart)}">${escapeHtml(docKasseName(docKasseStart))}</option>`);
  sel.innerHTML = opts.join('');
  sel.value = docKasseStart;
  wrap.classList.remove('hidden');
  docKasseInfo();
}
function docKasseInfo() {
  const el = document.getElementById('docKasseInfo');
  const id = document.getElementById('docKasseSelect').value || '';
  const k = id ? kasseById(id) : null;
  if (!id) { el.textContent = 'Alle Profile der Familie sehen das Dokument (keine Gäste).'; return; }
  if (!k) { el.textContent = 'Gehört zu einer Kasse, in der du kein Mitglied mehr bist.'; return; }
  const n = kasseUserIds(k).length;
  el.textContent = `Nur die Mitglieder von „${kasseDisplayName(k)}“ (${n} ${n === 1 ? 'Person' : 'Personen'}) sehen das Dokument und bekommen Erinnerungen dazu.`;
}
function docKasseValue() {
  const wrap = document.getElementById('docKasseWrap');
  if (!wrap || wrap.classList.contains('hidden')) return docKasseStart;
  return document.getElementById('docKasseSelect').value || '';
}
document.getElementById('docKasseSelect').addEventListener('change', docKasseInfo);
let docVisMode = 'familie';
let docVisSet = new Set();
function docVisIds(v) { return String(v || '').split(',').map(x => x.trim()).filter(Boolean); }
function docVisLabel(v) {
  const ids = docVisIds(v);
  const me = currentUser() ? currentUser().id : '';
  if (!ids.length) return 'Ganze Familie';
  if (ids.length === 1 && ids[0] === me) return 'Nur für dich sichtbar';
  return 'Sichtbar für ' + ids.map(id => id === me ? 'dich' : kasseProfileName(id)).join(', ');
}
function docVisInit(v) {
  const me = currentUser() ? currentUser().id : '';
  const ids = docVisIds(v);
  docVisSet = new Set(ids.length ? ids : [me]);
  docVisSet.add(me);
  docVisMode = !ids.length ? 'familie' : (ids.length === 1 && ids[0] === me) ? 'ich' : 'auswahl';
  renderDocVis();
}
function renderDocVis() {
  const me = currentUser() ? currentUser().id : '';
  document.querySelectorAll('.doc-vis-btn').forEach(b => b.classList.toggle('active', b.dataset.docvis === docVisMode));
  const box = document.getElementById('docVisPeople');
  box.classList.toggle('hidden', docVisMode !== 'auswahl');
  if (docVisMode === 'auswahl') {
    box.innerHTML = kassePeople().map(p => `
      <label class="flex items-center gap-2.5 py-1.5 ${p.id === me ? '' : 'cursor-pointer'} select-none">
        <input type="checkbox" class="doc-vis-cb w-4 h-4 shrink-0" value="${escapeHtml(p.id)}" ${docVisSet.has(p.id) || p.id === me ? 'checked' : ''} ${p.id === me ? 'disabled' : ''} />
        ${kasseProfileAvatar(p.id, 24)}
        <span class="flex-1 min-w-0 text-sm truncate">${escapeHtml(kasseProfileName(p.id))}${p.id === me ? ' <span class="text-ink/40">(du)</span>' : ''}</span>
      </label>`).join('');
    box.querySelectorAll('.doc-vis-cb').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) docVisSet.add(cb.value); else docVisSet.delete(cb.value);
      renderDocVisInfo();
    }));
  }
  renderDocVisInfo();
}
function renderDocVisInfo() {
  const el = document.getElementById('docVisInfo');
  el.textContent = docVisMode === 'familie'
    ? 'Alle Profile der Familie sehen das Dokument (keine Gäste).'
    : docVisMode === 'ich' ? 'Nur du siehst das Dokument – auch Admins nicht.' : docVisLabel(docVisValue()) + '. Alle anderen sehen es nicht.';
}
function docVisValue() {
  const me = currentUser() ? currentUser().id : '';
  if (docVisMode === 'familie') return '';
  if (docVisMode === 'ich') return me;
  const valid = new Set(kassePeople().map(p => p.id));
  const ids = [me, ...[...docVisSet].filter(id => id !== me && valid.has(id))];
  return ids.join(',');
}
document.querySelectorAll('.doc-vis-btn').forEach(b => b.addEventListener('click', () => { docVisMode = b.dataset.docvis; renderDocVis(); }));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('dokumente');
