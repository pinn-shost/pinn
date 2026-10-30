/* pinn. – js/vertraege.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/fahrzeuge.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.51.0, only the comments were translated):
   - Contracts (page "Verträge", vt…) – list with filters, search and sorting; date calculation of the
     notice period (vtStatus, the same calculation as on the server); popups to view, create / edit and
     cancel a contract; contract categories; overview tile with upcoming cancellation deadlines;
     push link /?vertrag=<ID>
   - Automatic linking of recurring expenses from House and Vehicles (rent, loan, vehicle tax, taxes & levies)
     with their contracts
   - Documents of contracts and receipts of expenses (collection "finanz_dokumente"): upload, shrinking of
     photos, short-lived file token, viewer
   - Wiring of the events of the Finanzen page (period switch, swiping over the budget card, expense popup,
     completing the shopping, settings)
   103 functions and 37 variables. index.html only calls these functions later (when the user acts or from
   bootApp), never while it is still loading – that is why this file may come after the inline script.
   Six statements run while this file loads (a click listener for the document lists, the file-token timer,
   the listener of the Kasse switch, the click listener of the overview tile, initContractsUi and
   initFinanceUi); they only register listeners and a timer. */

/* ==========================================================
   Finances → Contracts (page "Verträge", vt…, fin…)
   ----------------------------------------------------------
   - Contracts are kept small in the family record (finance.contracts) and are synchronised like
     everything else - they can be created and changed offline:
       { id, name, provider, category (contract category), holder (member), customerNo, contractNo,
         start, termType: 'fixed' | 'open' | 'once', minMonths, firstEnd, renewMonths,
         notice: { value, unit: 'days'|'weeks'|'months' }, noticeMonthEnd,
         recurringId (recurring booking with the costs),
         reminder: { on, days, last, to: [member IDs] }, extraReminder: { date, text },
         cancel: { sent, effective, confirmed } | null, contact: { phone, email, web, address }, note }
   - Costs = an ordinary recurring booking (finance.recurring, field contract = contract ID). That way it
     appears automatically in the expenses, in the budget and in the evaluation. When the contract is
     cancelled, the booking ends at the end of the contract (untilByContract); withdrawing the
     cancellation undoes that.
   - Contract categories (finance.contractCategories) with a matching expense category (finCat),
     managed directly on the page (slider icon at the top right, as in the pantry "Vorrat").
   - Notice period: calculated from the end of the term, the renewal and the notice (vtStatus - the same
     calculation is on the server in pb_hooks/pinn-vertraege.js). Push reminder X days beforehand
     (optionally additionally 3 days beforehand) to the selected members; plus a freely selectable own
     reminder.
   - Documents (contract, invoice, cancellation, confirmation …) and receipts for single expenses are
     stored as protected files in the PocketBase collection "finanz_dokumente" (bezug 'vertrag:<ID>' or
     'ausgabe:<ID>'). Photos are shrunk before uploading. Files are opened via a short-lived
     file token - the files can never be fetched publicly.
   ========================================================== */
const FIN_DOC_COLLECTION = 'finanz_dokumente';
const FIN_DOC_MAX_BYTES = 25 * 1024 * 1024;
const FIN_DOC_IMAGE_MAX_PX = 2400;
const LS_FIN_DOCS = 'pinn.finanzen.dokumente';
const FIN_DOC_TYPES = [
  { id: 'vertrag', get label() { return tk('contract.docType.doc'); }, icon: '📄' },
  { id: 'rechnung', get label() { return tk('contract.docType.invoice'); }, icon: '🧾' },
  { id: 'beleg', get label() { return tk('contract.docType.receipt'); }, icon: '🧾' },
  { id: 'kuendigung', get label() { return tk('contract.docType.cancellation'); }, icon: '✉️' },
  { id: 'bestaetigung', get label() { return tk('contract.docType.confirmation'); }, icon: '✅' },
  { id: 'schreiben', get label() { return tk('contract.docType.correspondence'); }, icon: '📨' },
  { id: 'fzschein', get label() { return tk('contract.docType.registration'); }, icon: '🪪', fz: true },
  { id: 'hubericht', get label() { return tk('contract.docType.inspection'); }, icon: '🔍', fz: true },
  { id: 'werkstatt', get label() { return tk('contract.docType.workshop'); }, icon: '🔧', fz: true },
  { id: 'garantie', get label() { return tk('contract.docType.warranty'); }, icon: '🛡️', fz: true },
  { id: 'sonstiges', get label() { return tk('contract.docType.other'); }, icon: '📎' },
];
const VT_REMIND_DAYS = [7, 14, 30, 60, 90];
const VT_RENEW_MONTHS = [1, 3, 6, 12, 24, 36];
let vtFilterStatus = 'aktiv';   // 'aktiv' (active) | 'gekuendigt' (cancelled) | 'alle' (all)
let vtFilterCategory = '';
let vtSearch = '';
let vtOnlyDue = false;
let vtSort = 'frist';           // 'frist' (deadline) | 'name' | 'kosten' (costs)
let vtDetailId = null;
let vtEditId = null;
let vtSaving = false;
let vtCheckTimer = null;

/* ---------- Date calculation (identical to pb_hooks/pinn-vertraege.js) ---------- */
function vtIsIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function vtParts(iso) { return [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))]; }
function vtIso(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
function vtDim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function vtAddDays(iso, n) {
  const p = vtParts(iso);
  const t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return vtIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
// keepEom: if the day is the last day of the month, it stays there (Dec 31 + 3 months = Mar 31)
function vtAddMonths(iso, n, keepEom) {
  const p = vtParts(iso);
  const eom = keepEom && p[2] === vtDim(p[0], p[1]);
  const idx = p[0] * 12 + (p[1] - 1) + n;
  const ny = Math.floor(idx / 12), nm = idx - ny * 12 + 1;
  const dim = vtDim(ny, nm);
  return vtIso(ny, nm, eom ? dim : Math.min(p[2], dim));
}
function vtMonthEnd(iso) { const p = vtParts(iso); return vtIso(p[0], p[1], vtDim(p[0], p[1])); }
function vtDiffDays(a, b) {
  const pa = vtParts(a), pb2 = vtParts(b);
  return Math.round((Date.UTC(pb2[0], pb2[1] - 1, pb2[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
function vtNotice(c) {
  const n = (c && c.notice && typeof c.notice === 'object') ? c.notice : {};
  const v = Math.max(0, Math.min(120, parseInt(n.value, 10) || 0));
  return { value: v, unit: ['days', 'weeks', 'months'].includes(n.unit) ? n.unit : 'months' };
}
function vtMinusNotice(iso, notice) {
  if (!notice.value) return iso;
  if (notice.unit === 'days') return vtAddDays(iso, -notice.value);
  if (notice.unit === 'weeks') return vtAddDays(iso, -7 * notice.value);
  return vtAddMonths(iso, -notice.value, true);
}
function vtPlusNotice(iso, notice) {
  if (!notice.value) return iso;
  if (notice.unit === 'days') return vtAddDays(iso, notice.value);
  if (notice.unit === 'weeks') return vtAddDays(iso, 7 * notice.value);
  return vtAddMonths(iso, notice.value, false);
}
function vtTermType(c) { return ['fixed', 'open', 'once'].includes(c && c.termType) ? c.termType : 'fixed'; }
function vtFirstEnd(c) {
  if (vtIsIso(c.firstEnd)) return c.firstEnd;
  const m = parseInt(c.minMonths, 10) || 0;
  if (vtIsIso(c.start) && m > 0) return vtAddDays(vtAddMonths(c.start, m, false), -1);
  return '';
}
function vtRenew(c) {
  const r = parseInt(c.renewMonths, 10);
  return VT_RENEW_MONTHS.includes(r) ? r : 12;
}
// State on a given day: { state: 'aktiv'|'gekuendigt'|'beendet', kind, end, termEnd, nextEnd, deadline, daysLeft, earliestEnd, unknown }
function vtStatus(c, today) {
  const kind = vtTermType(c);
  const cancel = c && c.cancel && vtIsIso(c.cancel.effective) ? c.cancel : null;
  if (cancel) return { kind, state: cancel.effective < today ? 'beendet' : 'gekuendigt', end: cancel.effective, daysLeft: vtDiffDays(today, cancel.effective) };
  const notice = vtNotice(c);
  if (kind === 'once') {
    const end = vtFirstEnd(c);
    if (!end) return { kind, state: 'aktiv', unknown: true };
    return { kind, state: end < today ? 'beendet' : 'aktiv', end, daysLeft: vtDiffDays(today, end) };
  }
  if (kind === 'open') {
    let earliest = vtPlusNotice(today, notice);
    if (c.noticeMonthEnd) earliest = vtMonthEnd(earliest);
    return { kind, state: 'aktiv', earliestEnd: earliest };
  }
  const first = vtFirstEnd(c);
  if (!first) return { kind, state: 'aktiv', unknown: true };
  const R = vtRenew(c);
  let k = 0;
  let end = first;
  if (end < today) {
    const p1 = vtParts(first), p2 = vtParts(today);
    k = Math.max(0, Math.floor(((p2[0] - p1[0]) * 12 + (p2[1] - p1[1])) / R) - 1);
    end = vtAddMonths(first, k * R, true);
    for (let g = 0; g < 400 && end < today; g++) { k++; end = vtAddMonths(first, k * R, true); }
  }
  const termEnd = end;
  let kk = k, nextEnd = end, deadline = vtMinusNotice(end, notice);
  for (let g = 0; g < 400 && deadline < today; g++) { kk++; nextEnd = vtAddMonths(first, kk * R, true); deadline = vtMinusNotice(nextEnd, notice); }
  return { kind, state: 'aktiv', termEnd, nextEnd, deadline, daysLeft: vtDiffDays(today, deadline), renew: R, missed: nextEnd !== termEnd };
}
function vtReminder(c) {
  const r = (c && c.reminder && typeof c.reminder === 'object') ? c.reminder : {};
  const days = VT_REMIND_DAYS.includes(parseInt(r.days, 10)) ? parseInt(r.days, 10) : 30;
  return { on: r.on !== false, days, last: r.last !== false, to: Array.isArray(r.to) ? r.to.filter(x => typeof x === 'string') : [] };
}
// Earliest possible end of the contract if the cancellation is sent on the day sentIso
function vtEarliestEnd(c, sentIso) {
  const s = vtStatus({ ...c, cancel: null }, sentIso);
  if (s.kind === 'open') return s.earliestEnd || '';
  if (s.kind === 'once') return s.end || '';
  return s.nextEnd || '';
}

/* ---------- Display helpers ---------- */
function vtFmt(iso) { return vtIsIso(iso) ? new Date(iso + 'T00:00:00').toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
function vtInDays(n) { return n <= 0 ? tk('contract.today') : n === 1 ? tk('contract.tomorrow') : tk('contract.daysLeftN', { n }); }
function vtMonthsText(n) { return tk('contract.monthsN', { n }); }
function vtNoticeText(c) {
  const n = vtNotice(c);
  if (!n.value) return tk('contract.noDeadline');
  return n.unit === 'days' ? tk('contract.daysN', { n: n.value }) : n.unit === 'weeks' ? tk('contract.weeksN', { n: n.value }) : tk('contract.monthsN', { n: n.value });
}
function vtIntervalLabel(id) {
  const L = { weekly: 'contract.interval.weekly', biweekly: 'contract.interval.biweekly', monthly: 'contract.interval.monthly', quarterly: 'contract.interval.quarterly', yearly: 'contract.interval.yearly' };
  return tk(L[id] || 'contract.interval.monthly');
}
function vtFileSize(bytes) {
  const b = Number(bytes) || 0;
  if (!b) return '';
  if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
  return numDec((b / 1024 / 1024).toFixed(1)) + ' MB';
}
function vtIsChildMember(m) { return !!m && (isKidPageEnabled(m) || /^(kind|tochter|sohn)$/i.test(String(m.role || '').trim())); }
function vtFullName(m) {
  if (!m) return '';
  const n = String(m.name || '').trim();
  // In a shared flat (WG) the name does not indicate a common surname
  return (lastName && n && !/\s/.test(n) && householdType !== 'wg') ? n + ' ' + lastName : n;
}

/* ---------- Categories ---------- */
function vtNormalizeCategories(list) {
  const cats = (Array.isArray(list) && list.length)
    ? list.filter(c => c && typeof c.id === 'string' && c.id).map(c => ({ ...c }))
    : VT_DEFAULT_CATEGORIES.map(c => ({ ...c }));
  if (!cats.some(c => c.id === 'sonstiges')) cats.push({ ...VT_DEFAULT_CATEGORIES[VT_DEFAULT_CATEGORIES.length - 1] });
  if (!cats.some(c => c.id === 'abgaben')) {
    const ab = VT_DEFAULT_CATEGORIES.find(c => c.id === 'abgaben');
    const idx = cats.findIndex(c => c.id === 'sonstiges');
    if (idx >= 0) cats.splice(idx, 0, { ...ab }); else cats.push({ ...ab });
  }
  return cats;
}
function vtCategories() { return (finance && Array.isArray(finance.contractCategories) && finance.contractCategories.length) ? finance.contractCategories : VT_DEFAULT_CATEGORIES; }
function vtCategory(id) {
  const cats = vtCategories();
  return cats.find(c => c.id === id) || cats.find(c => c.id === 'sonstiges') || VT_DEFAULT_CATEGORIES[VT_DEFAULT_CATEGORIES.length - 1];
}
function vtCatColor(cat) { return /^#[0-9a-fA-F]{6}$/.test((cat && cat.color) || '') ? cat.color : '#9A9A9A'; }

/* ---------- Contracts & costs ---------- */
function vtContracts() { return (finance && Array.isArray(finance.contracts)) ? finance.contracts : []; }
function vtContract(id) { return vtContracts().find(c => c.id === id) || null; }
function vtRec(c) { return (c && c.recurringId && finance) ? (finance.recurring.find(r => r.id === c.recurringId) || null) : null; }
function vtCost(c, today = finTodayIso()) {
  const r = vtRec(c);
  if (!r) return null;
  const running = finRecIsRunning(r, today) && !!finRecStart(r);
  const out = { r, running, amount: finRecurringAmountFor(r, today), interval: finRecInterval(r), monthly: running ? finRecMonthly(r, today) : 0, next: running ? finRecNext(r, today) : '', parts: [r] };
  // Further bookings on the same contract (e.g. rental contract: base rent, utilities, heating costs)
  const extra = finance.recurring.filter(x => x.id !== r.id && x.contract === c.id);
  if (!extra.length) return out;
  out.parts = [r, ...extra];
  const run = out.parts.filter(x => finRecIsRunning(x, today) && !!finRecStart(x));
  out.running = run.length > 0;
  out.monthly = run.reduce((s, x) => s + finRecMonthly(x, today), 0);
  const sameIv = run.length && run.every(x => finRecInterval(x) === finRecInterval(run[0]));
  out.interval = sameIv ? finRecInterval(run[0]) : 'monthly';
  out.amount = sameIv ? run.reduce((s, x) => s + finRecurringAmountFor(x, today), 0) : Math.round(out.monthly * 100) / 100;
  out.next = run.map(x => finRecNext(x, today)).filter(Boolean).sort()[0] || '';
  return out;
}
function vtStatusView(c, today = finTodayIso()) {
  const s = vtStatus(c, today);
  const rem = vtReminder(c);
  const out = { s, tone: 'ok', label: '', sub: '', sortKey: '9999' };
  if (c && c.fixkosten && s.state === 'aktiv') { out.label = tk('contract.fixedCosts'); out.sub = tk('contract.notCancellable'); out.sortKey = '9999'; return out; }
  if (s.state === 'beendet') { out.tone = 'muted'; out.label = tk('contract.endedOn', { date: vtFmt(s.end) }); out.sortKey = 'z' + s.end; return out; }
  if (s.state === 'gekuendigt') {
    const conf = !!(c.cancel && c.cancel.confirmed);
    out.tone = conf ? 'muted' : 'warn';
    out.label = tk('contract.cancelledAsOf', { date: vtFmt(s.end) });
    out.sub = conf ? tk('contract.confirmationReceived') : tk('contract.confirmationPending');
    out.sortKey = s.end;
    return out;
  }
  if (s.unknown) { out.tone = 'muted'; out.label = tk('contract.termMissing'); out.sub = tk('contract.addForNotice'); out.sortKey = '9997'; return out; }
  if (s.kind === 'open') { out.label = tk('contract.cancelAnytime'); out.sub = tk('contract.earliestAsOf', { date: vtFmt(s.earliestEnd) }); out.sortKey = '9998'; return out; }
  if (s.kind === 'once') {
    out.label = tk('contract.endsOn', { date: vtFmt(s.end) });
    out.sub = vtInDays(s.daysLeft);
    out.sortKey = s.end;
    if (s.daysLeft <= rem.days) out.tone = 'warn';
    return out;
  }
  out.label = tk('contract.cancellableUntil', { date: vtFmt(s.deadline) });
  out.sub = vtInDays(s.daysLeft) + ' · ' + tk('contract.asOf', { date: vtFmt(s.nextEnd) });
  out.sortKey = s.deadline;
  if (s.daysLeft <= 7) out.tone = 'urgent';
  else if (s.daysLeft <= rem.days) out.tone = 'warn';
  return out;
}
// What is due? (overview tile, notice at the top) -> [{ c, date, tone, title, sub, when }]
function vtDueList(today = finTodayIso()) {
  if (!finance) return [];
  const out = [];
  vtContracts().forEach(c => {
    const s = vtStatus(c, today);
    const rem = vtReminder(c);
    const window = rem.on ? rem.days : 14;
    if (s.state === 'aktiv' && s.kind === 'fixed' && !s.unknown && s.daysLeft <= window) {
      out.push({ c, date: s.deadline, tone: s.daysLeft <= 7 ? 'urgent' : 'warn', title: c.name, sub: tk('contract.dueSub', { date: vtFmt(s.deadline), renew: vtMonthsText(s.renew) }), when: vtInDays(s.daysLeft), days: s.daysLeft });
    } else if (s.state === 'aktiv' && s.kind === 'once' && !s.unknown && s.daysLeft <= window) {
      out.push({ c, date: s.end, tone: 'warn', title: c.name, sub: tk('contract.endsOnLower', { date: vtFmt(s.end) }), when: vtInDays(s.daysLeft), days: s.daysLeft });
    }
    const x = c.extraReminder || {};
    if (vtIsIso(x.date) && s.state !== 'beendet') {
      const d = vtDiffDays(today, x.date);
      if (d <= 7 && d >= -3) out.push({ c, date: x.date, tone: d <= 0 ? 'warn' : 'ok', title: c.name, sub: '🔔 ' + (x.text || tk('event.reminder')), when: d < 0 ? tk('contract.sinceDaysN', { n: -d }) : vtInDays(d), days: d });
    }
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
// Recurring expenses without a contract (suggestion „als Vertrag anlegen“ = create as contract)
function vtUnlinkedRecurring() {
  const today = finTodayIso();
  return finance.recurring.filter(r => !r.allowanceFor && !(r.contract && vtContract(r.contract))
    && r.category !== FIN_SAVINGS_CATEGORY && r.category !== FIN_INCOME_CATEGORY
    && finRecIsRunning(r, today) && finRecurringAmountFor(r, today) > 0);
}
function vtReminderTargetsLabel(c) {
  const rem = vtReminder(c);
  const names = rem.to.map(id => memberById(id)).filter(Boolean).map(memberLabel);
  if (names.length) return names.join(', ');
  const h = c.holder ? memberById(c.holder) : null;
  return h ? memberLabel(h) : tk('contract.allAdults');
}
function vtApplyCancelToRecurring(c) {
  if (!c || !c.recurringId) return;
  const eff = c.cancel && vtIsIso(c.cancel.effective) ? c.cancel.effective : '';
  finance.recurring = finance.recurring.map(r => {
    if (r.id !== c.recurringId && r.contract !== c.id) return r;
    if (eff) return { ...r, until: eff, untilByContract: true, contract: c.id };
    if (r.untilByContract) return { ...r, until: '', untilByContract: false };
    return r;
  });
}
// After every change: save, redraw, the server checks the family's due reminders
function vtAfterChange() {
  Promise.resolve(persistState()).then(vtScheduleServerCheck).catch(() => { /* to be supplied later */ });
  if (currentView === 'finanzen') renderFinance();
  if (currentView === 'fahrzeuge') renderVehicles();
  if (currentView === 'haus') renderHouse();
  renderFinRecurringEditor();
  refreshOverviewTiles();
}
function vtScheduleServerCheck() {
  clearTimeout(vtCheckTimer);
  vtCheckTimer = setTimeout(() => {
    if (!navigator.onLine || isCurrentUserGuest()) return;
    apiFetch('/api/pinn/vertraege/pruefen', { method: 'POST' }).catch(() => { /* the schedule takes over */ });
  }, 5000);
}

/* ---------- Documents (contracts & receipts) ---------- */
let finDocs = [];            // { id, bezug, name, typ, datum, groesse, datei, created }
let finDocsLoaded = false;
let finDocsLoadedAt = 0;
let finDocsError = '';       // '' | 'offline' | 'missing'
let finDocsLoading = null;
let finDocToken = '';
let finDocTokenAt = 0;
const finDocUploading = {};  // bezug (reference) -> number of running uploads
let finDocPick = null;       // { mode: 'contract' | 'expense', bezug, typ }

function finDocFromRecord(r) {
  return { id: r.id, bezug: r.bezug || '', name: r.name || '', typ: r.typ || 'sonstiges', datum: r.datum || '', groesse: Number(r.groesse) || 0, datei: r.datei || '', created: r.created || '' };
}
function finDocsCacheWrite() {
  try { localStorage.setItem(LS_FIN_DOCS, JSON.stringify({ familie: finFamilyKey(), list: finDocs })); } catch (e) { /* ignore */ }
}
function finDocsFor(bezug) { return finDocs.filter(d => d.bezug === bezug); }
function finDocType(id) { return FIN_DOC_TYPES.find(t => t.id === id) || FIN_DOC_TYPES[FIN_DOC_TYPES.length - 1]; }
async function loadFinDocs(force = false) {
  if (isCurrentUserGuest() || !finFamilyKey()) return;
  if (finDocsLoading) return finDocsLoading;
  if (!force && Date.now() - finDocsLoadedAt < 60 * 1000) return;
  if (!finDocsLoaded && !finDocs.length) {
    try {
      const c = JSON.parse(localStorage.getItem(LS_FIN_DOCS) || 'null');
      if (c && c.familie === finFamilyKey() && Array.isArray(c.list)) finDocs = c.list;
    } catch (e) { /* ignore */ }
  }
  finDocsLoading = (async () => {
    try {
      const list = await pb.collection(FIN_DOC_COLLECTION).getFullList({ filter: pb.filter('familie = {:f}', { f: finFamilyKey() }), sort: '-created', requestKey: null });
      finDocs = list.map(finDocFromRecord);
      finDocsLoaded = true;
      finDocsError = '';
      finDocsCacheWrite();
    } catch (err) {
      finDocsError = (err && err.status === 404) ? 'missing' : 'offline';
    } finally {
      finDocsLoadedAt = Date.now();
      finDocsLoading = null;
    }
    finDocsChanged();
  })();
  return finDocsLoading;
}
function finDocsChanged() {
  try {
    if (currentView === 'finanzen' && finTab === 'vertraege') renderContracts();
    if (currentView === 'finanzen' && finTab === 'ausgaben') renderFinance();
    const dm = document.getElementById('contractDetailModal');
    if (vtDetailId && dm && !dm.classList.contains('hidden')) renderContractDetail();
    const em = document.getElementById('expenseModal');
    if (em && !em.classList.contains('hidden')) renderExpenseDocs();
    if (currentView === 'fahrzeuge' && fzTab === 'liste' && fzDetailId) renderVehicles();
    if (fzModalState && fzModalState.mode === 'log') fzRenderLogDocs();
  } catch (e) { /* finance not ready yet */ }
}
function finDocBaseUrl(path) {
  if (typeof pb.buildURL === 'function') return pb.buildURL(path);
  if (typeof pb.buildUrl === 'function') return pb.buildUrl(path);
  return String(PB_URL || '').replace(/\/$/, '') + path;
}
function finDocUrl(d) {
  const url = finDocBaseUrl(`/api/files/${FIN_DOC_COLLECTION}/${encodeURIComponent(d.id)}/${encodeURIComponent(d.datei)}`);
  return finDocToken ? url + '?token=' + encodeURIComponent(finDocToken) : url;
}
// Short-lived file token (the documents are protected and can never be fetched publicly)
async function ensureFinDocToken(force = false) {
  if (!force && finDocToken && Date.now() - finDocTokenAt < 90 * 1000) return finDocToken;
  try {
    const res = await apiFetch('/api/files/token', { method: 'POST' });
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j && j.token) { finDocToken = j.token; finDocTokenAt = Date.now(); }
    }
  } catch (e) { /* offline */ }
  return finDocToken;
}
function refreshDocLinks() {
  document.querySelectorAll('a.fin-doc-link[data-doc]').forEach(a => {
    const d = finDocs.find(x => x.id === a.dataset.doc);
    if (d) a.href = finDocUrl(d);
  });
}
function finDocRowsHtml(docs, bezug) {
  const rows = docs.map(d => {
    const t = finDocType(d.typ);
    const isPdf = /\.pdf$/i.test(d.datei);
    const isImg = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(d.datei);
    const icon = isImg ? '🖼️' : isPdf ? t.icon : '📎';
    const meta = [t.label, vtFmt(d.datum), vtFileSize(d.groesse)].filter(Boolean).join(' · ');
    return `
      <div class="fin-doc-row flex items-center gap-1.5 rounded-xl border border-ink/10 pl-2.5 pr-1 py-1.5">
        <a class="fin-doc-link flex-1 min-w-0 flex items-center gap-2.5 py-0.5" data-doc="${escapeHtml(d.id)}" href="${escapeHtml(finDocUrl(d))}" target="_blank" rel="noopener">
          <span class="text-xl leading-none shrink-0">${icon}</span>
          <span class="min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(d.name || d.datei || tk('search.type.doc'))}</span>
            <span class="block text-[11px] text-ink/45 truncate">${escapeHtml(meta)}</span>
          </span>
        </a>
        <button type="button" data-doc-edit="${escapeHtml(d.id)}" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-pine hover:bg-ink/5 grid place-items-center text-sm" aria-label="${escapeHtml(tk('contract.rename'))}" title="${escapeHtml(tk('contract.rename'))}">✎</button>
        <button type="button" data-doc-del="${escapeHtml(d.id)}" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('common.delete'))}" title="${escapeHtml(tk('common.delete'))}">×</button>
      </div>`;
  }).join('');
  const up = finDocUploading[bezug] || 0;
  const upHtml = up ? `<div class="flex items-center gap-2 rounded-xl border border-dashed border-ink/20 px-3 py-2 text-xs text-ink/50"><span class="fin-etf-spin">⏳</span> ${escapeHtml(tk('contract.uploadingN', { n: up }))}</div>` : '';
  return rows + upHtml;
}
function finDocStatusHint() {
  if (finDocsError === 'missing') return ('<p class="text-xs text-red-500">' + escapeHtml(tk('contract.filesVertraegePbJs')) + '</p>');
  if (finDocsError === 'offline' && !finDocsLoaded) return ('<p class="text-xs text-ink/45">' + escapeHtml(tk('contract.offlineDocumentsAreOnly')) + '</p>');
  return '';
}
function finSafeFileName(name) {
  const clean = String(name || 'dokument').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return (clean || 'dokument').slice(-120);
}
// Shrink photos (longest side 2400 px, JPEG) - PDFs & co. stay unchanged
function finCompressDocImage(file) {
  return new Promise(resolve => {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '')) { resolve(null); return; }
    let url = '';
    try { url = URL.createObjectURL(file); } catch (e) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const max = Math.max(w, h);
        if (!max || (max <= FIN_DOC_IMAGE_MAX_PX && file.size < 1.5 * 1024 * 1024 && /jpeg|png|webp/i.test(file.type))) { URL.revokeObjectURL(url); resolve(null); return; }
        const scale = Math.min(1, FIN_DOC_IMAGE_MAX_PX / max);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(b => resolve(b && b.size < file.size * 1.1 ? b : null), 'image/jpeg', 0.85);
      } catch (e) { URL.revokeObjectURL(url); resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
async function finUploadDoc(file, bezug, typ) {
  let blob = file;
  let fileName = file.name || 'dokument';
  const small = await finCompressDocImage(file).catch(() => null);
  if (small) { blob = small; fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg'; }
  if (blob.size > FIN_DOC_MAX_BYTES) { const e = new Error(tk('contract.tooLargeMax25', { name: file.name })); e.local = true; throw e; }
  const display = String(file.name || tk('search.type.doc')).replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 200) || tk('search.type.doc');
  const form = new FormData();
  form.append('datei', blob, finSafeFileName(fileName));
  form.append('bezug', bezug);
  form.append('name', display);
  form.append('typ', typ || 'sonstiges');
  form.append('datum', finTodayIso());
  form.append('groesse', String(blob.size || 0));
  form.append('erstellt_von', (currentUser() && currentUser().id) || '');
  form.append('familie', finFamilyKey());
  if (kassenServer === true && activeKasseId) form.append('kasse', activeKasseId);
  const rec = await pb.collection(FIN_DOC_COLLECTION).create(form, { requestKey: null });
  const doc = finDocFromRecord(rec);
  finDocs = [doc, ...finDocs.filter(d => d.id !== doc.id)];
  finDocsLoaded = true;
  finDocsError = '';
  finDocsCacheWrite();
  return doc;
}
function finDocErrorText(err, file) {
  if (err && err.local) return err.message;
  const st = err && err.status;
  if (st === 404) return tk('contract.vertraegePbJsPinn');
  if (st === 400) return tk('contract.wasNotAcceptedPdf', { name: (file && file.name) || tk('contract.file') });
  if (st === 403) return tk('contract.noPermissionDocuments');
  if (!st) return tk('contract.noConnectionNasPlease');
  return tk('contract.uploadFailed', { error: (err && err.message) || tk('common.unknownError') });
}
async function finUploadMany(files, bezug, typ) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  if (!navigator.onLine) { finShowToast(tk('contract.noConnectionDocumentsCan'), true); return; }
  finDocUploading[bezug] = (finDocUploading[bezug] || 0) + list.length;
  finDocsChanged();
  let ok = 0;
  const errors = [];
  for (const f of list) {
    try {
      await finUploadDoc(f, bezug, typ);
      ok++;
    } catch (err) {
      errors.push(finDocErrorText(err, f));
    } finally {
      finDocUploading[bezug] = Math.max(0, (finDocUploading[bezug] || 1) - 1);
      finDocsChanged();
    }
  }
  let extra = '';
  if (ok && typ === 'bestaetigung' && /^vertrag:/.test(bezug)) {
    const c = vtContract(bezug.slice(8));
    if (c && c.cancel && !c.cancel.confirmed) {
      finance.contracts = finance.contracts.map(x => x.id === c.id ? { ...x, cancel: { ...x.cancel, confirmed: true } } : x);
      vtAfterChange();
      extra = ' ' + tk('contract.cancelMarkedConfirmed');
    }
  }
  if (errors.length) finShowToast(errors[0], true);
  else finShowToast(tk('contract.docsSavedN', { n: ok }) + extra);
}
async function finDeleteDoc(id) {
  await pb.collection(FIN_DOC_COLLECTION).delete(id, { requestKey: null });
  finDocs = finDocs.filter(d => d.id !== id);
  finDocsCacheWrite();
}
// Remove all documents of a contract / an expense (e.g. when deleting it)
async function finDeleteDocsFor(bezug) {
  if (isCurrentUserGuest()) return;
  if (!finDocsLoaded) await loadFinDocs(true);
  const docs = finDocsFor(bezug);
  if (!docs.length) return;
  let failed = 0;
  for (const d of docs) {
    try { await finDeleteDoc(d.id); } catch (e) { failed++; }
  }
  finDocsChanged();
  if (failed) finShowToast(tk('contract.docsDeleteFailedN', { n: failed }), true);
}
function finPickDocs(target) {
  if (isCurrentUserGuest()) return;
  finDocPick = target;
  const inp = document.getElementById('finDocFileInput');
  inp.value = '';
  inp.click();
}
async function onFinDocFilesChosen(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  const target = finDocPick;
  finDocPick = null;
  if (!target || !files.length) return;
  if (target.mode === 'fzlog-new') {
    // New vehicle entry: receipts are uploaded after saving
    fzLogPending = fzLogPending.concat(files).slice(0, 10);
    fzRenderLogDocs();
    return;
  }
  if (target.mode === 'expense' && !(editingExpenseId && expenseModalMode.existing)) {
    // New expense: receipts are uploaded after saving
    expenseDocPending = expenseDocPending.concat(files).slice(0, 10);
    renderExpenseDocs();
    const pdf = files.find(pinnIsPdfFile);
    if (pdf) expenseAutofillFromPdf(pdf); // Amount, date, shop from the invoice
    return;
  }
  await finUploadMany(files, target.bezug, target.typ);
}
// Clicks in document lists (contract and expense)
document.addEventListener('click', async (ev) => {
  const link = ev.target.closest('a.fin-doc-link[data-doc]');
  if (link) {
    const d = finDocs.find(x => x.id === link.dataset.doc);
    if (!d) return;
    // PDFs and images in the own viewer (with close X), other file types externally as before
    if (docIsPdfName(d.datei) || docIsImageName(d.datei)) {
      ev.preventDefault();
      const ready = (finDocToken && Date.now() - finDocTokenAt < 100 * 1000) ? Promise.resolve() : ensureFinDocToken(true).then(refreshDocLinks);
      openFileViewer(ready.then(() => finDocUrl(d)), { name: d.datei });
      return;
    }
    if (!finDocToken || Date.now() - finDocTokenAt > 100 * 1000) {
      // Token expired: open the window immediately (otherwise it is blocked), set the address afterwards
      ev.preventDefault();
      const w = window.open('', '_blank');
      await ensureFinDocToken(true);
      refreshDocLinks();
      if (w) w.location.href = finDocUrl(d);
      else finShowToast(tk('contract.pleaseTapAgain'));
    }
    return;
  }
  const del = ev.target.closest('[data-doc-del]');
  if (del) {
    const d = finDocs.find(x => x.id === del.dataset.docDel);
    if (!d || !confirm(tk('contract.deleteDocument', { name: d.name || d.datei }))) return;
    try { await finDeleteDoc(d.id); finDocsChanged(); finShowToast(tk('contract.documentDeleted')); }
    catch (err) { finShowToast(tk('contract.deletingFailedNoConnection'), true); }
    return;
  }
  const edit = ev.target.closest('[data-doc-edit]');
  if (edit) {
    const d = finDocs.find(x => x.id === edit.dataset.docEdit);
    if (!d) return;
    const name = prompt(tk('contract.nameDocument'), d.name || '');
    if (name == null) return;
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!clean || clean === d.name) return;
    try {
      await pb.collection(FIN_DOC_COLLECTION).update(d.id, { name: clean }, { requestKey: null });
      finDocs = finDocs.map(x => x.id === d.id ? { ...x, name: clean } : x);
      finDocsCacheWrite();
      finDocsChanged();
    } catch (err) { finShowToast(tk('contract.renamingFailedNoConnection'), true); }
    return;
  }
  const pend = ev.target.closest('[data-pending-del]');
  if (pend) {
    expenseDocPending.splice(Number(pend.dataset.pendingDel), 1);
    renderExpenseDocs();
  }
});
// Keep the file token fresh as long as a document list is visible
setInterval(() => {
  if (document.visibilityState !== 'visible' || !document.querySelector('a.fin-doc-link')) return;
  ensureFinDocToken(true).then(refreshDocLinks);
}, 60 * 1000);

/* ---------- Receipts on an expense ---------- */
let expenseDocPending = []; // for new expenses: files that are uploaded after saving
function finExpenseDocsSetup(expense, isRec) {
  expenseDocPending = [];
  const wrap = document.getElementById('expenseDocsWrap');
  if (!wrap) return;
  wrap.classList.toggle('hidden', !!isRec || isCurrentUserGuest());
  renderExpenseDocs();
  if (expense && !isCurrentUserGuest()) {
    loadFinDocs();
    if (finDocsFor('ausgabe:' + expense.id).length) ensureFinDocToken().then(refreshDocLinks);
  }
}
function renderExpenseDocs() {
  const list = document.getElementById('expenseDocsList');
  if (!list) return;
  const id = editingExpenseId;
  const bezug = id ? 'ausgabe:' + id : '';
  const docs = bezug ? finDocsFor(bezug) : [];
  const pending = expenseDocPending.map((f, i) => `
    <div class="flex items-center gap-2 rounded-xl border border-dashed border-ink/20 pl-2.5 pr-1 py-1.5">
      <span class="text-lg shrink-0">📎</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm truncate">${escapeHtml(f.name || tk('contract.file'))}</span>
        <span class="block text-[11px] text-ink/45">${escapeHtml(tk('contract.uploadOnSave'))} · ${escapeHtml(vtFileSize(f.size))}</span>
      </span>
      <button type="button" data-pending-del="${i}" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('common.remove'))}">×</button>
    </div>`).join('');
  const rows = finDocRowsHtml(docs, bezug);
  list.innerHTML = (rows + pending) || ('<p class="text-xs text-ink/40 italic">' + escapeHtml(tk('contract.receiptInvoiceWarrantyDocument')) + '</p>');
  if (docs.length) list.insertAdjacentHTML('beforeend', finDocStatusHint());
}

/* ---------- Page: Contracts ---------- */
/* ---------- Link automatically ----------
   Recurring expenses from other areas get their matching contract with a category:
   - House (rent): base rent, utilities, heating costs and parking space -> one rental contract (housing),
     open-ended with the notice period from House, landlord as contact
   - House (ownership): loan instalment -> loan contract (ends with the fixed-interest period), building
     insurance -> insurance, house fee (Hausgeld) -> housing, property tax and waste/sewage -> taxes & levies
   - Vehicles: vehicle tax -> taxes & levies (at the vehicle)
   - Other recurring expenses with tax/broadcasting fee/levy in the name -> taxes & levies
   Taxes, levies and fees are "running fixed costs" (fixkosten: true): no cancelling, no deadline
   reminder. Deleted automatic contracts do not come back (finance.contractAutoSkip).
   Runs idempotently when Finanzen is opened and after saving in House. */
const VT_ABGABE_RE = /(kfz[- ]?steuer|grundsteuer|hundesteuer|zweitwohnungssteuer|rundfunk|beitragsservice|\bgez\b|kurtaxe|straßenreinigung|abwassergebühr|müllgebühr|abfallgebühr|kirchensteuer)/i;
function vtAutoLink() {
  if (!finance || !Array.isArray(finance.recurring) || isCurrentUserGuest()) return false;
  try { if (typeof childLockActive === 'function' && childLockActive()) return false; } catch (e) { /* ignore */ }
  // Create the names in the language of the app (afterwards they are ordinary, editable entries)
  const today = finTodayIso();
  const skip = new Set(finance.contractAutoSkip || []);
  let contracts = vtContracts().slice();
  let recurring = finance.recurring.slice();
  let changed = false;
  const free = r => r && !r.allowanceFor && !(r.contract && contracts.some(c => c.id === r.contract)) && finRecIsRunning(r, today);
  const recById = id => (id ? recurring.find(r => r.id === id) : null) || null;
  const base = (key, f) => ({
    id: 'v' + newRecordId().slice(0, 14), auto: key, name: f.name, provider: f.provider || '', category: f.category,
    holder: '', customerNo: '', contractNo: '', start: vtIsIso(f.start) ? f.start : '',
    termType: f.termType || 'open', minMonths: 0, firstEnd: vtIsIso(f.firstEnd) ? f.firstEnd : '', renewMonths: 12,
    notice: f.notice || { value: 0, unit: 'months' }, noticeMonthEnd: false,
    reminder: { on: !!f.remind, days: f.remindDays || 30, last: !!f.remind, to: [] },
    extraReminder: f.extra && vtIsIso(f.extra.date) && f.extra.date > today ? f.extra : { date: '', text: '' },
    contact: f.contact || { phone: '', email: '', web: '', address: '' }, note: '', vehicle: f.vehicle || '',
    home: f.home || '', fixkosten: !!f.fixkosten, cancel: null, recurringId: '', created: today, updated: today,
  });
  // Get the contract for the key or create it, and attach the bookings to it
  const attach = (key, recs, make) => {
    recs = recs.filter(free);
    if (!recs.length) return;
    let c = contracts.find(x => x.auto === key);
    if (!c) {
      if (skip.has(key)) return;
      c = base(key, make());
      contracts.push(c);
    }
    const ids = new Set(recs.map(r => r.id));
    recurring = recurring.map(r => ids.has(r.id) ? { ...r, contract: c.id } : r);
    if (!c.recurringId || !recurring.some(r => r.id === c.recurringId)) {
      const main = recs[0].id;
      contracts = contracts.map(x => x.id === c.id ? { ...x, recurringId: main } : x);
    }
    changed = true;
  };
  // House
  (typeof hsHomes === 'function' ? hsHomes() : []).forEach(h => {
    const fix = h.fix || {};
    const rec = k => recById(fix[k] && fix[k].recId);
    const name = hsName(h);
    const ll = h.landlord || {};
    const contact = { phone: ll.phone || '', email: ll.email || '', web: '', address: ll.address || '' };
    if (h.mode !== 'eigentum' && h.mode !== 'vermietet') {
      attach('haus-miete:' + h.id, ['rent', 'nk', 'heat', 'stellplatz'].map(rec).filter(Boolean), () => ({
        name: tk('home.docType.mietvertrag') + ' · ' + name, provider: ll.name || '', category: 'wohnen', termType: 'open',
        notice: { value: Math.max(0, Math.min(24, Number(h.rent && h.rent.notice) || 3)), unit: 'months' },
        start: h.moveIn, contact, home: h.id,
      }));
    } else {
      const loan = (h.own && h.own.loan) || {};
      attach('haus-kredit:' + h.id, [rec('loan')].filter(Boolean), () => {
        const f = { name: tk('home.group.kredit') + ' · ' + name, provider: loan.bank || '', category: 'kredit', fixkosten: true, start: loan.start, home: h.id };
        // Reminder half a year before the end of the fixed-interest period (compare follow-up financing)
        if (vtIsIso(loan.fixedUntil)) f.extra = { date: vtAddDays(loan.fixedUntil, -180), text: tk('home.fixedInterestPeriodEnds') + ': ' + vtFmt(loan.fixedUntil) + ' – ' + tk('contract.compareFollowUpFinancing') };
        return f;
      });
      attach('haus-gebaeude:' + h.id, [rec('gebaeude')].filter(Boolean), () => ({
        name: tk('home.fix.gebaeude') + ' · ' + name, category: 'versicherung', termType: 'fixed', notice: { value: 3, unit: 'months' }, remind: true, home: h.id,
      }));
      attach('haus-hausgeld:' + h.id, [rec('hausgeld')].filter(Boolean), () => ({
        name: tk('home.fix.hausgeld') + ' · ' + name, provider: ll.name || '', category: 'wohnen', fixkosten: true, contact, home: h.id,
      }));
      attach('haus-grundsteuer:' + h.id, [rec('grundsteuer')].filter(Boolean), () => ({
        name: tk('home.fix.grundsteuer') + ' · ' + name, category: 'abgaben', fixkosten: true, home: h.id,
      }));
      attach('haus-abgaben:' + h.id, [rec('abgaben')].filter(Boolean), () => ({
        name: tk('home.fix.abgaben') + ' · ' + name, category: 'abgaben', fixkosten: true, home: h.id,
      }));
    }
  });
  // Vehicles: vehicle tax
  (typeof fzVehicles === 'function' ? fzVehicles() : []).forEach(v => {
    const r = recById(v.taxRecId);
    if (!r) return;
    attach('fz-steuer:' + v.id, [r], () => ({ name: tk('vehicle.vehicleTax') + ' · ' + fzName(v), provider: tk('vehicle.customsOffice'), category: 'abgaben', fixkosten: true, vehicle: v.id }));
  });
  // Other recurring expenses that are clearly taxes or levies
  recurring.filter(r => free(r) && r.category !== FIN_SAVINGS_CATEGORY && finRecurringAmountFor(r, today) > 0 && VT_ABGABE_RE.test(String(r.title || '')))
    .forEach(r => attach('rec:' + r.id, [r], () => ({ name: r.title, category: 'abgaben', fixkosten: true })));
  if (!changed) return false;
  finance.contracts = contracts;
  finance.recurring = recurring;
  return true;
}

function renderContracts() {
  const pane = document.getElementById('finPaneVertraege');
  if (!pane || !finance) return;
  loadFinDocs(); // in the background (number of documents)
  const today = finTodayIso();
  document.querySelectorAll('.contract-status-btn').forEach(b => b.classList.toggle('active', b.dataset.cstatus === vtFilterStatus));
  document.getElementById('contractDueToggle').classList.toggle('active', vtOnlyDue);
  const catSel = document.getElementById('contractCategoryFilter');
  const cats = vtCategories();
  if (vtFilterCategory && !cats.some(c => c.id === vtFilterCategory)) vtFilterCategory = '';
  catSel.innerHTML = ('<option value="">' + escapeHtml(tk('household.allCategories')) + '</option>') + cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</option>`).join('');
  catSel.value = vtFilterCategory;
  document.getElementById('contractSortSelect').value = vtSort;
  const searchInp = document.getElementById('contractSearchInput');
  if (searchInp.value !== vtSearch && document.activeElement !== searchInp) searchInp.value = vtSearch;

  const all = vtContracts().map(c => ({ c, v: vtStatusView(c, today), cost: vtCost(c, today), cat: vtCategory(c.category) }));
  const monthly = all.reduce((s, x) => (x.cost && x.cost.running && x.cost.amount > 0) ? s + x.cost.monthly : s, 0);
  const activeCount = all.filter(x => x.v.s.state === 'aktiv').length;
  const cancelledCount = all.filter(x => x.v.s.state === 'gekuendigt').length;
  const byCat = new Map();
  all.forEach(x => {
    if (!(x.cost && x.cost.running && x.cost.amount > 0)) return;
    const e = byCat.get(x.cat.id) || { cat: x.cat, total: 0, n: 0 };
    e.total += x.cost.monthly; e.n++;
    byCat.set(x.cat.id, e);
  });
  const catRows = [...byCat.values()].sort((a, b) => b.total - a.total);
  const maxCat = catRows.length ? catRows[0].total : 0;

  const summary = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('contract.fixedFromContracts'))}</div>
          <div class="font-serif text-2xl">${fmtEur(monthly)} <span class="text-sm text-ink/45 font-sans">${escapeHtml(tk('contract.perMonthSlash'))}</span></div>
          <div class="text-xs text-ink/50">${escapeHtml(tk('contract.perYearConverted', { amount: fmtEur(monthly * 12) }))}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('contract.contracts'))}</div>
          <div class="font-serif text-2xl">${activeCount}</div>
          <div class="text-xs text-ink/50">${escapeHtml(cancelledCount ? tk('contract.cancelledN', { n: cancelledCount }) : tk('contract.running'))}</div>
        </div>
      </div>
      ${catRows.length ? `<div class="flex flex-col gap-2 mt-4">${catRows.map(e => `
        <button type="button" class="vt-cat-row w-full text-left" data-vtcat="${escapeHtml(e.cat.id)}">
          <div class="flex items-center justify-between gap-2 text-xs mb-1">
            <span class="truncate">${escapeHtml((e.cat.icon ? e.cat.icon + ' ' : '') + e.cat.label)} <span class="text-ink/40">· ${e.n}</span></span>
            <span class="shrink-0 font-medium">${fmtEur(e.total)}</span>
          </div>
          <div class="vt-bar"><span style="width:${maxCat ? Math.max(4, Math.round(e.total / maxCat * 100)) : 0}%;background:${vtCatColor(e.cat)}"></span></div>
        </button>`).join('')}</div>` : ''}
    </div>`;

  const due = vtDueList(today);
  const dueHtml = due.length ? `
    <div class="rounded-2xl border border-mustard/40 bg-mustard/10 p-4">
      <div class="text-sm font-medium mb-2">${escapeHtml(tk('contract.takeCareNow'))}</div>
      <div class="flex flex-col gap-1.5">${due.map(d => `
        <button type="button" class="vt-due-row w-full flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2 text-left" data-vtopen="${escapeHtml(d.c.id)}">
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(d.title)}</span>
            <span class="block text-xs text-ink/55 truncate">${escapeHtml(d.sub)}</span>
          </span>
          <span class="vt-chip ${d.tone}">${escapeHtml(d.when)}</span>
        </button>`).join('')}</div>
    </div>` : '';

  const unlinked = vtUnlinkedRecurring();
  const suggestHtml = unlinked.length ? `
    <details class="vt-suggest rounded-2xl bg-white border border-ink/10 shadow-sm px-4 py-3">
      <summary class="text-sm cursor-pointer select-none">💡 ${escapeHtml(tk('contract.unlinkedN', { n: unlinked.length }))}</summary>
      <p class="text-xs text-ink/50 mt-2 mb-2">${escapeHtml(tk('contract.tappingCreatesContractFrom'))}</p>
      <div class="flex flex-wrap gap-1.5">${unlinked.slice(0, 20).map(r => {
        const cat = finCategory(r.category);
        return `<button type="button" class="pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition" data-vtfromrec="${escapeHtml(r.id)}">${escapeHtml((cat.icon ? cat.icon + ' ' : '') + (r.title || cat.label))} · ${fmtEur(finRecurringAmountFor(r, today))}</button>`;
      }).join('')}</div>
    </details>` : '';

  const q = vtSearch.trim().toLowerCase();
  let list = all.filter(x => {
    const st = x.v.s.state;
    if (vtFilterStatus === 'aktiv' && st !== 'aktiv') return false;
    if (vtFilterStatus === 'gekuendigt' && st === 'aktiv') return false;
    if (vtFilterCategory && x.cat.id !== vtFilterCategory) return false;
    if (vtOnlyDue && !(x.v.tone === 'warn' || x.v.tone === 'urgent')) return false;
    if (q) {
      const hay = [x.c.name, x.c.provider, x.c.customerNo, x.c.contractNo, x.c.note, x.cat.label].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byName = (a, b) => String(a.c.name || '').localeCompare(String(b.c.name || ''), 'de');
  if (vtSort === 'name') list.sort(byName);
  else if (vtSort === 'kosten') list.sort((a, b) => ((b.cost && b.cost.monthly) || 0) - ((a.cost && a.cost.monthly) || 0) || byName(a, b));
  else list.sort((a, b) => a.v.sortKey.localeCompare(b.v.sortKey) || byName(a, b));

  const cards = list.map(x => {
    const c = x.c;
    const holder = c.holder ? memberById(c.holder) : null;
    const sub = [c.provider, x.cat.label, holder ? memberLabel(holder) : ''].filter(Boolean).map(escapeHtml).join(' · ');
    const nDocs = finDocsFor('vertrag:' + c.id).length;
    const costHtml = x.cost
      ? `<span class="block text-sm font-semibold${x.cost.running ? '' : ' text-ink/40'}">${fmtEur(x.cost.amount)}</span><span class="block text-[11px] text-ink/45">${x.cost.running ? escapeHtml(vtIntervalLabel(x.cost.interval)) : escapeHtml(tk('contract.endedLower'))}</span>`
      : '<span class="block text-[11px] text-ink/40">' + escapeHtml(tk('contract.noCosts')) + '</span>';
    return `
      <button type="button" class="vt-card w-full flex items-start gap-3 rounded-2xl bg-white border border-ink/10 shadow-sm p-3.5 text-left transition${x.v.s.state === 'beendet' ? ' opacity-60' : ''}" data-vtopen="${escapeHtml(c.id)}">
        <span class="shrink-0 w-11 h-11 rounded-full grid place-items-center text-xl" style="background:${vtCatColor(x.cat)}22">${escapeHtml(x.cat.icon || '📄')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(c.name || tk('contract.docType.doc'))}</span>
          <span class="block text-xs text-ink/45 truncate">${sub || '&nbsp;'}</span>
          <span class="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span class="vt-chip ${x.v.tone}">${escapeHtml(x.v.label)}</span>
            ${x.v.sub ? `<span class="text-[11px] text-ink/45 truncate">${escapeHtml(x.v.sub)}</span>` : ''}
          </span>
        </span>
        <span class="shrink-0 text-right">
          ${costHtml}
          ${nDocs ? `<span class="block text-[11px] text-ink/45 mt-1">📎 ${nDocs}</span>` : ''}
        </span>
      </button>`;
  }).join('');

  const filtered = !!(q || vtFilterCategory || vtOnlyDue || vtFilterStatus !== 'aktiv');
  let empty = '';
  if (!list.length) {
    empty = vtContracts().length
      ? `<p class="text-sm text-ink/40 italic text-center py-6">${filtered ? tk('contract.noContractsSelection') : tk('contract.noRunningContracts')}</p>`
      : `<div class="rounded-2xl bg-white border border-dashed border-ink/20 p-6 text-center">
          <div class="text-3xl mb-2">📄</div>
          <div class="font-serif text-lg mb-1">${escapeHtml(tk('contract.noContractsYet'))}</div>
          <p class="text-xs text-ink/50 mb-4">${escapeHtml(tk('contract.insuranceElectricityPhoneStreaming'))}</p>
          <button type="button" id="vtEmptyAddBtn" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('contract.createFirstContract'))}</button>
        </div>`;
  }
  pane.innerHTML = summary + dueHtml + suggestHtml + (list.length ? `<div class="flex flex-col gap-2">${cards}</div>` : empty);

  pane.querySelectorAll('[data-vtopen]').forEach(b => b.addEventListener('click', () => openContractDetail(b.dataset.vtopen)));
  pane.querySelectorAll('[data-vtcat]').forEach(b => b.addEventListener('click', () => {
    vtFilterCategory = vtFilterCategory === b.dataset.vtcat ? '' : b.dataset.vtcat;
    renderContracts();
  }));
  pane.querySelectorAll('[data-vtfromrec]').forEach(b => b.addEventListener('click', () => {
    const r = finance.recurring.find(x => x.id === b.dataset.vtfromrec);
    if (r) openContractModal({ fromRecurring: r });
  }));
  const emptyBtn = document.getElementById('vtEmptyAddBtn');
  if (emptyBtn) emptyBtn.addEventListener('click', () => openContractModal());
}

/* ---------- Popup: view contract ---------- */
function openContractDetail(id) {
  const c = vtContract(id);
  if (!c) { finShowToast(tk('contract.contractNoLongerExists'), true); return; }
  vtDetailId = id;
  renderContractDetail();
  document.getElementById('contractDetailModal').classList.remove('hidden');
  loadFinDocs(true);
  ensureFinDocToken().then(refreshDocLinks);
}
function closeContractDetail() {
  document.getElementById('contractDetailModal').classList.add('hidden');
  vtDetailId = null;
}
function renderContractDetail() {
  const body = document.getElementById('contractDetailBody');
  if (!body) return;
  const c = vtContract(vtDetailId);
  if (!c) { closeContractDetail(); return; }
  const today = finTodayIso();
  const v = vtStatusView(c, today);
  const s = v.s;
  const cat = vtCategory(c.category);
  const cost = vtCost(c, today);
  const rem = vtReminder(c);
  const holder = c.holder ? memberById(c.holder) : null;

  let costHtml = ('<p class="text-xs text-ink/45">' + escapeHtml(tk('contract.noRunningCostsStored')) + '</p>');
  if (cost) {
    const startRec = finRecStart(cost.r);
    const dates = startRec ? finRecDates(cost.r, startRec, today) : [];
    const paid = dates.reduce((t, d) => t + Math.max(0, finRecurringAmountFor(cost.r, d)), 0);
    const yearStart = today.slice(0, 4) + '-01-01';
    const paidYear = dates.filter(d => d >= yearStart).reduce((t, d) => t + Math.max(0, finRecurringAmountFor(cost.r, d)), 0);
    const fcat = finCategory(cost.r.category);
    const hist = (Array.isArray(cost.r.history) ? cost.r.history : []).filter(h => h && h.from).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
    const histHtml = hist.length > 1 ? `
      <details class="mt-2"><summary class="text-xs text-ink/50 cursor-pointer select-none">${escapeHtml(tk('contract.priceHistoryN', { n: hist.length - 1 }))}</summary>
        <div class="mt-1">${hist.map((h, i) => {
          const prev = i ? Number(hist[i - 1].amount) || 0 : null;
          const diff = prev != null ? (Number(h.amount) || 0) - prev : 0;
          return `<div class="vt-row"><span>${escapeHtml(tk('contract.fromDate', { date: vtFmt(h.from) }))}</span><span>${fmtEur(h.amount)}${prev != null && Math.abs(diff) > 0.001 ? ` <span style="color:${diff > 0 ? FIN_RED : FIN_GREEN}">(${diff > 0 ? '+' : '−'}${fmtEur(Math.abs(diff))})</span>` : ''}</span></div>`;
        }).join('')}</div>
      </details>` : '';
    costHtml = `
      <div class="vt-tiles">
        ${vtCostTile(escapeHtml(tk('contract.costs')), fmtEur(cost.amount), escapeHtml(vtIntervalLabel(cost.interval)))}
        ${vtCostTile(escapeHtml(tk('contract.perYear')), fmtEur(cost.running ? cost.monthly * 12 : 0), escapeHtml(cost.running ? tk('contract.converted') : tk('contract.endedLower')))}
        ${vtCostTile(escapeHtml(tk('contract.paid')), fmtEur(paid), escapeHtml(tk('contract.ofWhichInYear', { amount: fmtEur(paidYear), year: today.slice(0, 4) })))}
      </div>
      <p class="text-xs text-ink/50 mt-2">${cost.next ? `${escapeHtml(tk('contract.nextDebit'))} <b>${escapeHtml(finDayLabel(cost.next))}</b> · ` : (cost.running ? '' : escapeHtml(tk('contract.debitEnded')) + ' · ')}${escapeHtml(tk('contract.expenseCatLabel', { cat: (fcat.icon ? fcat.icon + ' ' : '') + i18nT(fcat.label) }))}${cost.r.paidBy && memberById(cost.r.paidBy) ? ' · ' + escapeHtml(tk('contract.paidByName', { name: memberLabel(memberById(cost.r.paidBy)) })) : ''}</p>
      ${histHtml}
      ${cost.parts && cost.parts.length > 1 ? `<div class="mt-2">${cost.parts.map(p => `<div class="vt-row"><span>${escapeHtml(p.title || finCategory(p.category).label)}</span><span><span class="vt-amt">${fmtEur(finRecurringAmountFor(p, today))}</span> <span class="text-ink/45">${escapeHtml(vtIntervalLabel(finRecInterval(p)))}${finRecIsRunning(p, today) ? '' : (' ' + tk('contract.ended'))}</span></span></div>`).join('')}</div>` : ''}`;
  }

  const rows = [];
  const kind = vtTermType(c);
  if (vtIsIso(c.start)) rows.push([tk('event.start'), vtFmt(c.start)]);
  if (kind === 'fixed') {
    const mm = parseInt(c.minMonths, 10) || 0;
    rows.push([tk('contract.term'), mm ? tk('contract.termFixedMin', { min: vtMonthsText(mm), renew: vtMonthsText(vtRenew(c)) }) : tk('contract.termFixed', { renew: vtMonthsText(vtRenew(c)) })]);
    rows.push([tk('contract.noticePeriod'), tk('contract.noticeToTermEnd', { notice: vtNoticeText(c) })]);
    if (s.state === 'aktiv' && s.termEnd) rows.push([tk('contract.currentTermEnd'), vtFmt(s.termEnd)]);
  } else if (c.fixkosten) {
    rows.push([tk('contract.kind'), tk('contract.fixedCostsLong')]);
  } else if (kind === 'open') {
    rows.push([tk('contract.term'), tk('contract.termOpen')]);
    rows.push([tk('contract.noticePeriod'), c.noticeMonthEnd ? tk('contract.noticeToMonthEnd', { notice: vtNoticeText(c) }) : vtNoticeText(c)]);
  } else {
    rows.push([tk('contract.term'), tk('contract.termOnce')]);
    if (vtFirstEnd(c)) rows.push([tk('event.endsOn'), vtFmt(vtFirstEnd(c))]);
  }
  if (c.cancel && vtIsIso(c.cancel.effective)) {
    if (vtIsIso(c.cancel.sent)) rows.push([tk('contract.cancelledOn'), vtFmt(c.cancel.sent)]);
    rows.push([tk('contract.effectiveAs'), vtFmt(c.cancel.effective)]);
    rows.push([tk('contract.confirmation'), c.cancel.confirmed ? tk('contract.receivedCheck') : tk('contract.stillPending')]);
  } else if (kind !== 'open') {
    rows.push([tk('event.reminder'), rem.on ? (rem.last && rem.days > 3 ? tk('contract.remindDaysPlus3', { n: rem.days, to: vtReminderTargetsLabel(c) }) : tk('contract.remindDays', { n: rem.days, to: vtReminderTargetsLabel(c) })) : tk('contract.off')]);
  }
  if (c.extraReminder && vtIsIso(c.extraReminder.date)) rows.push([tk('contract.ownReminder'), vtFmt(c.extraReminder.date) + (c.extraReminder.text ? ' · ' + c.extraReminder.text : '')]);

  const contact = c.contact || {};
  const infoRows = [];
  if (holder) infoRows.push([tk('contract.contractHolder'), memberLabel(holder)]);
  if (c.customerNo) infoRows.push([tk('contract.customerNumber'), c.customerNo, true]);
  if (c.contractNo) infoRows.push([tk('contract.contractNumber'), c.contractNo, true]);
  const webUrl = contact.web ? (/^https?:\/\//i.test(contact.web) ? contact.web : 'https://' + contact.web) : '';
  const contactBtns = [
    contact.phone ? `<a href="tel:${escapeHtml(String(contact.phone).replace(/[^\d+]/g, ''))}" class="px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition">📞 ${escapeHtml(contact.phone)}</a>` : '',
    contact.email ? `<a href="mailto:${escapeHtml(contact.email)}" class="px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition truncate">✉️ ${escapeHtml(contact.email)}</a>` : '',
    webUrl ? `<a href="${escapeHtml(webUrl)}" target="_blank" rel="noopener" class="px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition truncate">${escapeHtml(tk('contract.customerPortal'))}</a>` : '',
  ].filter(Boolean).join('');

  const docs = finDocsFor('vertrag:' + c.id);
  const bezug = 'vertrag:' + c.id;
  let defType = docs.length ? 'rechnung' : 'vertrag';
  if (c.cancel && !docs.some(d => d.typ === 'kuendigung')) defType = 'kuendigung';
  if (c.cancel && !c.cancel.confirmed) defType = 'bestaetigung';
  const docTypeOpts = FIN_DOC_TYPES.filter(t => t.id !== 'beleg' && !t.fz).map(t => `<option value="${t.id}"${t.id === defType ? ' selected' : ''}>${escapeHtml(t.icon + ' ' + t.label)}</option>`).join('');
  const docRows = finDocRowsHtml(docs, bezug);

  const canCancel = s.state === 'aktiv' && kind !== 'once' && !c.fixkosten;
  const isCancelled = !!(c.cancel && vtIsIso(c.cancel.effective));

  body.innerHTML = `
    <div class="flex items-start gap-3 mb-3 pr-6">
      <span class="shrink-0 w-12 h-12 rounded-full grid place-items-center text-2xl" style="background:${vtCatColor(cat)}22">${escapeHtml(cat.icon || '📄')}</span>
      <div class="flex-1 min-w-0">
        <h3 class="font-serif text-lg leading-tight">${escapeHtml(c.name || tk('contract.docType.doc'))}</h3>
        <div class="text-xs text-ink/50 truncate">${escapeHtml([c.provider, cat.label].filter(Boolean).join(' · '))}</div>
      </div>
    </div>
    ${c.vehicle && fzVehicle(c.vehicle) ? `<button type="button" data-act="fz-open" class="mb-3 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition">${escapeHtml(fzKind(fzVehicle(c.vehicle).kind).icon)} ${escapeHtml(fzShortName(fzVehicle(c.vehicle)))} ›</button>` : ''}
    <div class="vt-status-box ${v.tone} mb-4">
      <div class="text-sm font-semibold">${escapeHtml(v.label)}</div>
      ${v.sub ? `<div class="text-xs opacity-80">${escapeHtml(v.sub)}</div>` : ''}
      ${s.state === 'aktiv' && kind === 'fixed' && s.missed ? `<div class="text-xs opacity-80 mt-1">${escapeHtml(tk('contract.missedExtends', { date: vtFmt(s.termEnd), end: vtFmt(s.nextEnd) }))}</div>` : ''}
    </div>

    <h4 class="vt-detail-h">${escapeHtml(tk('contract.costs2'))}</h4>
    ${costHtml}

    <h4 class="vt-detail-h">📅 ${escapeHtml(tk('contract.termAndCancel'))}</h4>
    <div>${rows.map(r => `<div class="vt-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></div>`).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-3">
      ${canCancel ? ('<button type="button" data-act="cancel" class="px-3 py-1.5 rounded-lg border border-red-300 text-xs text-red-500 hover:bg-red-50 transition">' + escapeHtml(tk('contract.cancel')) + '</button>') : ''}
      ${isCancelled ? '<button type="button" data-act="cancel" class="px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 hover:text-pine hover:border-pine transition">✉️ ' + escapeHtml(tk('contract.cancelAndLetter')) + '</button>' : ''}
    </div>

    ${(infoRows.length || contactBtns || contact.address) ? `
      <h4 class="vt-detail-h">${tk('contract.contractDetailsContact')}</h4>
      <div>${infoRows.map(r => `<div class="vt-row"><span>${escapeHtml(r[0])}</span><span>${r[2] ? `<button type="button" class="font-mono text-ink/80 hover:text-pine" data-copy="${escapeHtml(r[1])}" title="${escapeHtml(tk('common.copy'))}">${escapeHtml(r[1])} ⧉</button>` : escapeHtml(r[1])}</span></div>`).join('')}</div>
      ${contactBtns ? `<div class="flex flex-wrap gap-2 mt-2">${contactBtns}</div>` : ''}
      ${contact.address ? `<p class="text-xs text-ink/55 mt-2" style="white-space:pre-line">${escapeHtml(contact.address)}</p>` : ''}` : ''}

    <h4 class="vt-detail-h">${escapeHtml(tk('contract.documents'))} <span class="text-ink/40 font-normal normal-case">${docs.length || ''}</span></h4>
    <div class="flex items-center gap-2 mb-2">
      <select id="vtDocTypeSelect" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white" aria-label="${escapeHtml(tk('contract.typeDocument'))}">${docTypeOpts}</select>
      <button type="button" data-act="doc-add" class="shrink-0 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition whitespace-nowrap">${escapeHtml(tk('contract.upload'))}</button>
    </div>
    <div class="flex flex-col gap-1.5">${docRows || ('<p class="text-xs text-ink/40 italic">' + escapeHtml(tk('contract.contractInvoicesCancellationConfirmation')) + '</p>')}</div>
    ${finDocStatusHint()}

    ${c.note ? `<h4 class="vt-detail-h">${escapeHtml(tk('contract.note'))}</h4><p class="text-sm text-ink/70" style="white-space:pre-line">${escapeHtml(c.note)}</p>` : ''}

    <div class="flex items-center gap-2 mt-5">
      <div class="flex-1"></div>
      <button type="button" data-act="close" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5 transition">${escapeHtml(tk('common.close'))}</button>
      <button type="button" data-act="edit" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('common.edit'))}</button>
    </div>`;

  body.querySelectorAll('[data-act="cancel"]').forEach(b => b.addEventListener('click', () => openContractCancel(c.id)));
  body.querySelector('[data-act="edit"]').addEventListener('click', () => openContractModal({ contract: c }));
  body.querySelector('[data-act="close"]').addEventListener('click', closeContractDetail);
  const fzBtn = body.querySelector('[data-act="fz-open"]');
  if (fzBtn) fzBtn.addEventListener('click', () => { const vid = c.vehicle; closeContractDetail(); fzOpenVehicle(vid); });
  body.querySelector('[data-act="doc-add"]').addEventListener('click', () => {
    if (!navigator.onLine) { finShowToast(tk('contract.noConnectionDocumentsCan'), true); return; }
    finPickDocs({ mode: 'contract', bezug, typ: document.getElementById('vtDocTypeSelect').value || 'sonstiges' });
  });
  body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => vtCopyText(b.dataset.copy, tk('common.copied'))));
}
function vtCopyText(text, okMsg) {
  const done = () => finShowToast(okMsg || tk('common.copied'));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => vtCopyFallback(text, done));
  } else vtCopyFallback(text, done);
}
function vtCopyFallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch (e) { finShowToast(tk('contract.copyingNotPossible'), true); }
  ta.remove();
}

/* ---------- Popup: create / edit contract ---------- */
let vtDraftCategory = 'sonstiges';
let vtDraftRemindTo = [];
let vtFinCatTouched = false;
let vtFirstEndTouched = false;
let vtLinkRecId = '';
let vtPresetHome = ''; // House: assign a new contract directly to a home
function vtVal(id) { const el = document.getElementById(id); return el ? String(el.value || '') : ''; }
function vtSet(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }
// fromRecurring: adopt an existing recurring expense as a contract
// Kasse (separate finance area) of the contract: new contracts go into the selected Kasse (default: the one just shown;
// „Familie (alle)“ = no Kasse of its own). Switching also switches the view so that categories,
// vehicles and recurring bookings match the Kasse.
function vtSetupKasse(isEdit) {
  const wrap = document.getElementById('cfKasseWrap');
  const sel = document.getElementById('cfKasse');
  if (!kassenActiveMode() || !kassen.length || !activeKasse()) { wrap.classList.add('hidden'); return; }
  const list = kassenSorted().slice().sort((a, b) => (a.art === 'familie' ? 0 : 1) - (b.art === 'familie' ? 0 : 1));
  sel.innerHTML = list.map(k => `<option value="${escapeHtml(k.id)}">${escapeHtml((k.icon || '💶') + ' ' + kasseDisplayName(k) + (k.art === 'familie' ? (' ' + tk('contract.withoutOwnFund')) : ''))}</option>`).join('');
  sel.value = activeKasseId;
  sel.disabled = !!isEdit;
  wrap.classList.remove('hidden');
  vtKasseInfo(isEdit);
}
function vtKasseInfo(isEdit) {
  const el = document.getElementById('cfKasseInfo');
  const k = activeKasse();
  if (!el) return;
  if (!k) { el.textContent = ''; return; }
  const n = kasseUserIds(k).length;
  el.textContent = (k.art === 'familie'
    ? tk('contract.allProfilesFamilySee')
    : tk('contract.onlyFundMembersN', { n }))
    + (isEdit ? (' ' + tk('contract.fundExistingContractCannot')) : '');
}
function onVtKasseChanged() {
  const id = vtVal('cfKasse');
  if (!id || id === activeKasseId || vtEditId || !kasseById(id)) return;
  const keepFinCat = vtVal('cfFinCat');
  const keepPaid = vtVal('cfPaidBy');
  kassenSetActive(id);
  vtLinkRecId = '';
  vtDraftCategory = vtCategory(vtDraftCategory).id;
  renderVtCategoryPicker();
  vtFillFinCatSelect(keepFinCat);
  vtFillLinkRecSelect(null);
  fillFinPaidBySelect('cfPaidBy', keepPaid);
  const fzVehList = fzVehicles().filter(x => !fzIsArchived(x));
  const fzSelEl = document.getElementById('cfVehicle');
  fzSelEl.innerHTML = ('<option value="">' + escapeHtml(tk('contract.noVehicle')) + '</option>') + fzVehList.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(fzKind(x.kind).icon + ' ' + fzName(x))}</option>`).join('');
  fzSelEl.value = '';
  document.getElementById('cfVehicleWrap').classList.toggle('hidden', !fzVehList.length);
  vtKasseInfo(false);
  updateContractFormUi();
  finShowToast((tk('fund.fund') + ' ') + kasseDisplayName(activeKasse()));
}
document.getElementById('cfKasse').addEventListener('change', onVtKasseChanged);
function openContractModal({ contract = null, fromRecurring = null, preset = null } = {}) {
  if (isCurrentUserGuest()) return;
  const today = finTodayIso();
  vtEditId = contract ? contract.id : null;
  const c = contract || {};
  const rec = contract ? vtRec(contract) : fromRecurring;
  vtLinkRecId = (!contract && fromRecurring) ? fromRecurring.id : '';
  vtPresetHome = (!contract && preset && preset.home) ? String(preset.home) : '';
  document.getElementById('contractModalTitle').textContent = contract ? tk('contract.editContract') : tk('contract.newContract');
  vtSetupKasse(!!contract);
  vtSet('cfName', c.name || (fromRecurring ? fromRecurring.title || '' : '') || (preset && preset.name) || '');
  vtSet('cfProvider', c.provider || '');
  vtDraftCategory = vtCategory(c.category || (fromRecurring ? vtGuessCategory(fromRecurring) : ((preset && preset.category) || 'sonstiges'))).id;
  // Vehicle (menu „Fahrzeuge“)
  const fzVehList = fzVehicles().filter(x => !fzIsArchived(x) || x.id === c.vehicle);
  const fzSelEl = document.getElementById('cfVehicle');
  fzSelEl.innerHTML = ('<option value="">' + escapeHtml(tk('contract.noVehicle')) + '</option>') + fzVehList.map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(fzKind(x.kind).icon + ' ' + fzName(x))}</option>`).join('');
  fzSelEl.value = (c.vehicle && fzVehicle(c.vehicle)) ? c.vehicle : ((preset && preset.vehicle && fzVehicle(preset.vehicle)) ? preset.vehicle : '');
  document.getElementById('cfVehicleWrap').classList.toggle('hidden', !fzVehList.length);
  renderVtCategoryPicker();

  // Costs
  vtSet('cfAmount', rec ? euroInputValue(finRecurringAmountFor(rec, today)) : '');
  vtSet('cfInterval', rec ? finRecInterval(rec) : 'monthly');
  vtSet('cfCostStart', rec ? (finRecStart(rec) || today) : (vtIsIso(c.start) && c.start > today ? c.start : today));
  fillFinPaidBySelect('cfPaidBy', rec ? rec.paidBy : (currentMember() ? currentMember().id : ''));
  vtFillFinCatSelect(rec ? rec.category : (vtCategory(vtDraftCategory).finCat || 'abos'));
  vtFinCatTouched = !!rec;
  vtFillLinkRecSelect(contract);

  // Term
  vtSet('cfTermType', vtTermType(c));
  vtSet('cfStart', vtIsIso(c.start) ? c.start : '');
  const mm = parseInt(c.minMonths, 10) || 0;
  const computed = vtIsIso(c.start) && mm ? vtAddDays(vtAddMonths(c.start, mm, false), -1) : '';
  vtFirstEndTouched = !!(vtIsIso(c.firstEnd) && c.firstEnd !== computed);
  vtSet('cfMinTerm', vtFirstEndTouched ? 'x' : (mm && [1, 3, 6, 12, 24, 36].includes(mm) ? String(mm) : (contract ? (vtIsIso(c.firstEnd) ? 'x' : '') : '12')));
  vtSet('cfFirstEnd', vtIsIso(c.firstEnd) ? c.firstEnd : computed);
  vtSet('cfRenew', String(contract ? vtRenew(c) : 12));
  const n = contract ? vtNotice(c) : { value: 1, unit: 'months' };
  vtSet('cfNoticeValue', String(n.value));
  vtSet('cfNoticeUnit', n.unit);
  document.getElementById('cfNoticeMonthEnd').checked = !!c.noticeMonthEnd;

  // Reminder
  const rem = vtReminder(c);
  document.getElementById('cfRemindOn').checked = rem.on;
  vtSet('cfRemindDays', String(rem.days));
  document.getElementById('cfRemindLast').checked = rem.last;
  vtDraftRemindTo = rem.to.filter(id => memberById(id));
  renderVtRemindTo();
  const x = c.extraReminder || {};
  vtSet('cfExtraDate', vtIsIso(x.date) ? x.date : '');
  vtSet('cfExtraText', x.text || '');

  // Contract data & contact
  const holderSel = document.getElementById('cfHolder');
  holderSel.innerHTML = '<option value="">–</option>' + members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</option>`).join('');
  holderSel.value = (c.holder && memberById(c.holder)) ? c.holder : (!contract && currentMember() ? currentMember().id : '');
  vtSet('cfCustomerNo', c.customerNo || '');
  vtSet('cfContractNo', c.contractNo || '');
  const ct = c.contact || {};
  vtSet('cfPhone', ct.phone || '');
  vtSet('cfEmail', ct.email || '');
  vtSet('cfWeb', ct.web || '');
  vtSet('cfAddress', ct.address || '');
  document.getElementById('cfMoreBlock').open = !!(c.customerNo || c.contractNo || ct.phone || ct.email || ct.web || ct.address);
  vtSet('cfNote', c.note || '');

  document.getElementById('deleteContractBtn').classList.toggle('hidden', !contract);
  document.getElementById('contractModalError').classList.add('hidden');
  updateContractFormUi();
  document.getElementById('contractModal').classList.remove('hidden');
  armModalSnapshot('contractModal');
  if (!isMobile()) setTimeout(() => document.getElementById('cfName').focus(), 50);
}
function closeContractModal() {
  document.getElementById('contractModal').classList.add('hidden');
  vtEditId = null;
  vtLinkRecId = '';
}
// Guess the contract category from the expense category of a booking
function vtGuessCategory(r) {
  const t = String((r && r.title) || '').toLowerCase();
  const rules = [
    [/steuer|rundfunk|beitragsservice|\bgez\b|abgabe|gebühr|kurtaxe/, 'abgaben'],
    [/versicher|haftpflicht|hausrat|kasko|allianz|huk|debeka|ergo|axa|generali|r\+v|devk|lebensvers|rechtsschutz/, 'versicherung'],
    [/strom|gas|energie|stadtwerke|eon|e\.on|vattenfall|enbw|rwe|fernwärme|wasser/, 'energie'],
    [/internet|dsl|glasfaser|telekom|vodafone|1&1|o2|kabel|festnetz/, 'internet'],
    [/handy|mobil|smartphone|congstar|aldi talk|simyo|fraenk|winsim/, 'mobilfunk'],
    [/netflix|spotify|disney|prime|dazn|sky|youtube|apple|icloud|audible|abo|streaming|rtl\+|joyn|paramount|wow/, 'streaming'],
    [/miete|nebenkosten|wohn|hausgeld|rundfunk|gez/, 'wohnen'],
    [/auto|kfz|leasing|tankkarte|adac|deutschlandticket|bahncard|carsharing/, 'auto'],
    [/fitness|gym|verein|mitglied|urban sports|mcfit|sport/, 'freizeit'],
    [/kredit|darlehen|finanzierung|raten/, 'kredit'],
    [/zeitung|zeitschrift|magazin|spiegel|zeit|faz|süddeutsche/, 'zeitung'],
  ];
  for (const [re, id] of rules) if (re.test(t) && vtCategories().some(c => c.id === id)) return id;
  const byFin = vtCategories().find(c => c.finCat && c.finCat === (r && r.category) && c.id !== 'sonstiges');
  return byFin ? byFin.id : 'sonstiges';
}
function renderVtCategoryPicker() {
  const wrap = document.getElementById('cfCategoryPicker');
  wrap.innerHTML = vtCategories().map(c => `
    <button type="button" class="pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition ${c.id === vtDraftCategory ? 'active' : ''}" data-id="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</button>`).join('');
  wrap.querySelectorAll('.pantry-chip').forEach(b => b.addEventListener('click', () => {
    vtDraftCategory = b.dataset.id;
    wrap.querySelectorAll('.pantry-chip').forEach(x => x.classList.toggle('active', x === b));
    if (!vtFinCatTouched) {
      const fc = vtCategory(vtDraftCategory).finCat;
      if (fc && finance.categories.some(k => k.id === fc)) vtSet('cfFinCat', fc);
    }
  }));
}
function vtFillFinCatSelect(selected) {
  const sel = document.getElementById('cfFinCat');
  const cats = finActiveCategories().filter(c => c.id !== FIN_INCOME_CATEGORY && c.id !== FIN_SAVINGS_CATEGORY);
  const cur = finCategory(selected);
  if (cur && !cats.some(c => c.id === cur.id)) cats.push(cur);
  sel.innerHTML = cats.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</option>`).join('');
  sel.value = cur ? cur.id : (cats[0] ? cats[0].id : 'sonstiges');
}
function vtFillLinkRecSelect(contract) {
  const wrap = document.getElementById('cfLinkRecWrap');
  const sel = document.getElementById('cfLinkRec');
  const hasRec = contract && vtRec(contract);
  const options = hasRec ? [] : vtUnlinkedRecurring();
  if (vtLinkRecId && !options.some(r => r.id === vtLinkRecId)) {
    const r = finance.recurring.find(x => x.id === vtLinkRecId);
    if (r) options.unshift(r);
  }
  if (!options.length) { wrap.classList.add('hidden'); sel.innerHTML = ''; return; }
  const today = finTodayIso();
  sel.innerHTML = ('<option value="">' + escapeHtml(tk('contract.createNew')) + '</option>') + options.map(r => {
    const cat = finCategory(r.category);
    return `<option value="${escapeHtml(r.id)}">${escapeHtml((r.title || cat.label) + ' · ' + fmtEur(finRecurringAmountFor(r, today)) + ' ' + vtIntervalLabel(finRecInterval(r)))}</option>`;
  }).join('');
  sel.value = vtLinkRecId || '';
  wrap.classList.remove('hidden');
}
function onVtLinkRecChanged() {
  vtLinkRecId = vtVal('cfLinkRec');
  const r = vtLinkRecId ? finance.recurring.find(x => x.id === vtLinkRecId) : null;
  const today = finTodayIso();
  if (r) {
    vtSet('cfAmount', euroInputValue(finRecurringAmountFor(r, today)));
    vtSet('cfInterval', finRecInterval(r));
    vtSet('cfCostStart', finRecStart(r) || today);
    vtFillFinCatSelect(r.category);
    vtFinCatTouched = true;
    fillFinPaidBySelect('cfPaidBy', r.paidBy || '');
    if (!vtVal('cfName').trim()) vtSet('cfName', r.title || '');
  } else {
    vtFinCatTouched = false;
  }
  updateContractFormUi();
}
function renderVtRemindTo() {
  const wrap = document.getElementById('cfRemindTo');
  const adults = members.filter(m => !vtIsChildMember(m));
  if (!adults.length) { wrap.innerHTML = ('<span class="text-xs text-ink/40">' + escapeHtml(tk('lists.noMembers')) + '</span>'); return; }
  wrap.innerHTML = adults.map(m => `
    <button type="button" class="vt-remind-chip pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition ${vtDraftRemindTo.includes(m.id) ? 'active' : ''}" data-id="${escapeHtml(m.id)}">${vtDraftRemindTo.includes(m.id) ? '✓ ' : ''}${escapeHtml(memberLabel(m))}</button>`).join('');
  wrap.querySelectorAll('.vt-remind-chip').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.id;
    vtDraftRemindTo = vtDraftRemindTo.includes(id) ? vtDraftRemindTo.filter(x => x !== id) : [...vtDraftRemindTo, id];
    renderVtRemindTo();
  }));
}
// Draft from the form (only the term fields - for the preview of the deadline)
function vtDraftTerm() {
  const minSel = vtVal('cfMinTerm');
  return {
    termType: vtVal('cfTermType') || 'fixed',
    start: vtVal('cfStart'),
    minMonths: /^\d+$/.test(minSel) ? Number(minSel) : 0,
    firstEnd: vtVal('cfFirstEnd'),
    renewMonths: Number(vtVal('cfRenew')) || 12,
    notice: { value: Math.max(0, Math.min(120, parseInt(vtVal('cfNoticeValue'), 10) || 0)), unit: vtVal('cfNoticeUnit') || 'months' },
    noticeMonthEnd: document.getElementById('cfNoticeMonthEnd').checked,
    reminder: { on: document.getElementById('cfRemindOn').checked, days: Number(vtVal('cfRemindDays')) || 30 },
  };
}
function updateContractFormUi() {
  const d = vtDraftTerm();
  const kind = d.termType;
  document.getElementById('cfMinTermWrap').classList.toggle('hidden', kind !== 'fixed');
  document.getElementById('cfRenewWrap').classList.toggle('hidden', kind !== 'fixed');
  document.getElementById('cfFirstEndWrap').classList.toggle('hidden', kind === 'open');
  document.getElementById('cfFirstEndLabel').textContent = kind === 'once' ? tk('event.endsOn') : tk('contract.termEnds');
  document.getElementById('cfNoticeWrap').classList.toggle('hidden', kind === 'once');
  document.getElementById('cfNoticeMonthEndWrap').classList.toggle('hidden', kind !== 'open');
  document.getElementById('cfNoticeSuffix').textContent = kind === 'open' ? '' : tk('contract.atEndTerm');
  document.getElementById('cfRemindOnLabel').textContent = kind === 'once' ? tk('contract.remindGoodTimeBefore') : tk('contract.remindGoodTimeBefore2');
  const remOn = document.getElementById('cfRemindOn').checked;
  document.getElementById('cfRemindBlock').classList.toggle('hidden', !remOn || kind === 'open');
  document.getElementById('cfRemindOn').closest('label').classList.toggle('hidden', kind === 'open');
  document.getElementById('cfRemindLastWrap').classList.toggle('hidden', (Number(vtVal('cfRemindDays')) || 30) <= 3);

  // Preview of the deadline
  const info = document.getElementById('cfTermInfo');
  const today = finTodayIso();
  const s = vtStatus(d, today);
  let text = '';
  let warn = false;
  if (kind === 'open') text = tk('contract.info.open', { date: vtFmt(s.earliestEnd) });
  else if (s.unknown) text = kind === 'once' ? tk('contract.info.enterEnd') : tk('contract.info.enterStart');
  else if (kind === 'once') text = s.state === 'beendet' ? tk('contract.info.ended', { date: vtFmt(s.end) }) : tk('contract.info.endsAuto', { date: vtFmt(s.end), when: vtInDays(s.daysLeft) });
  else {
    text = tk('contract.info.cancellable', { date: vtFmt(s.deadline), when: vtInDays(s.daysLeft), end: vtFmt(s.nextEnd), renew: vtMonthsText(s.renew) });
    if (s.missed) text += ' ' + tk('contract.info.missed', { date: vtFmt(s.termEnd) });
    warn = s.daysLeft <= (d.reminder.on ? d.reminder.days : 14);
    if (d.reminder.on && !warn) text += ' ' + tk('contract.info.remindOn', { date: vtFmt(vtAddDays(s.deadline, -d.reminder.days)) });
  }
  info.textContent = text;
  info.classList.toggle('warn', warn);

  // Cost hint
  const costInfo = document.getElementById('cfCostInfo');
  const amountRaw = vtVal('cfAmount').trim();
  const amount = amountRaw ? parseEuro(amountRaw) : NaN;
  const cs = vtVal('cfCostStart');
  if (amountRaw && isFinite(amount) && amount > 0 && vtIsIso(cs)) {
    const probe = { start: cs, interval: vtVal('cfInterval') || 'monthly' };
    const next = finRecNext(probe, today);
    const monthly = amount * finIntervalInfo(probe.interval).perYear / 12;
    costInfo.textContent = (next ? tk('contract.cost.bookedNext', { rhythm: finRecDescribe(probe), date: finDayLabel(next) }) : tk('contract.cost.booked', { rhythm: finRecDescribe(probe) }))
      + ' ' + tk('contract.cost.perMonth', { amount: fmtEur(monthly) })
      + (cs < today && !vtLinkRecId && !(vtEditId && vtRec(vtContract(vtEditId))) ? ' ' + tk('contract.cost.backfill', { date: vtFmt(cs) }) : '');
  } else if (!amountRaw) {
    costInfo.textContent = tk('contract.withoutAmountNoTransactions');
  } else costInfo.textContent = '';
}
function onVtStartOrMinChanged() {
  const minSel = vtVal('cfMinTerm');
  const start = vtVal('cfStart');
  if (/^\d+$/.test(minSel) && vtIsIso(start)) {
    vtSet('cfFirstEnd', vtAddDays(vtAddMonths(start, Number(minSel), false), -1));
    vtFirstEndTouched = false;
  }
  updateContractFormUi();
}
function onVtFirstEndChanged() {
  vtFirstEndTouched = true;
  const minSel = vtVal('cfMinTerm');
  const start = vtVal('cfStart');
  if (/^\d+$/.test(minSel) && vtIsIso(start) && vtAddDays(vtAddMonths(start, Number(minSel), false), -1) !== vtVal('cfFirstEnd')) vtSet('cfMinTerm', 'x');
  updateContractFormUi();
}
async function saveContractFromModal() {
  if (vtSaving) return;
  const errEl = document.getElementById('contractModalError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); errEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  errEl.classList.add('hidden');
  const today = finTodayIso();
  const name = vtVal('cfName').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return showErr(tk('contract.pleaseEnterNameContract'));
  const existing = vtEditId ? vtContract(vtEditId) : null;
  const id = existing ? existing.id : 'v' + newRecordId().slice(0, 14);
  const term = vtDraftTerm();
  if (term.termType !== 'open' && vtIsIso(term.firstEnd) && vtIsIso(term.start) && term.firstEnd < term.start) return showErr(tk('contract.endTermBeforeStart'));
  const extraDate = vtVal('cfExtraDate');
  const email = vtVal('cfEmail').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showErr(tk('contract.emailAddressDoesnT'));

  // Costs
  const amountRaw = vtVal('cfAmount').trim();
  const hasCost = amountRaw !== '';
  const amount = hasCost ? parseEuro(amountRaw) : NaN;
  if (hasCost && (!isFinite(amount) || amount <= 0)) return showErr(tk('contract.pleaseEnterValidAmount'));
  if (hasCost && amount > 1000000) return showErr(tk('fin.err.tooBig'));
  const interval = vtVal('cfInterval') || 'monthly';
  const costStart = vtVal('cfCostStart');
  if (hasCost && !vtIsIso(costStart)) return showErr(tk('contract.pleaseSpecifyFromWhen'));
  const finCat = vtVal('cfFinCat') || 'sonstiges';
  const paidBy = vtVal('cfPaidBy');

  const contract = {
    ...(existing || {}),
    id, name,
    provider: vtVal('cfProvider').replace(/\s+/g, ' ').trim().slice(0, 120),
    category: vtDraftCategory,
    holder: vtVal('cfHolder'),
    customerNo: vtVal('cfCustomerNo').trim().slice(0, 80),
    contractNo: vtVal('cfContractNo').trim().slice(0, 80),
    start: vtIsIso(term.start) ? term.start : '',
    termType: term.termType,
    minMonths: term.termType === 'fixed' ? term.minMonths : 0,
    firstEnd: term.termType === 'open' ? '' : (vtIsIso(term.firstEnd) ? term.firstEnd : ''),
    renewMonths: term.renewMonths,
    notice: term.notice,
    noticeMonthEnd: term.termType === 'open' && term.noticeMonthEnd,
    reminder: { on: term.reminder.on, days: term.reminder.days, last: document.getElementById('cfRemindLast').checked, to: vtDraftRemindTo.filter(x => memberById(x)) },
    extraReminder: { date: vtIsIso(extraDate) ? extraDate : '', text: vtVal('cfExtraText').trim().slice(0, 200) },
    contact: { phone: vtVal('cfPhone').trim().slice(0, 60), email: email.slice(0, 120), web: vtVal('cfWeb').trim().slice(0, 300), address: vtVal('cfAddress').trim().slice(0, 500) },
    note: vtVal('cfNote').trim().slice(0, 2000),
    vehicle: fzVehicle(vtVal('cfVehicle')) ? vtVal('cfVehicle') : '',
    created: (existing && existing.created) || today,
    updated: today,
  };
  if (!contract.cancel) contract.cancel = null;
  if (!existing && vtPresetHome) contract.home = vtPresetHome;

  let recId = (existing && existing.recurringId && finance.recurring.some(r => r.id === existing.recurringId)) ? existing.recurringId : '';
  if (!recId && vtLinkRecId && finance.recurring.some(r => r.id === vtLinkRecId)) recId = vtLinkRecId;
  let applyFrom = null;
  if (hasCost) {
    if (recId) {
      const r = finance.recurring.find(x => x.id === recId);
      const scope = finScopeNeeded(r, amount, costStart, interval);
      if (scope) {
        vtSaving = true;
        let answer = null;
        try { answer = await finAskChangeScope({ ...scope, newAmount: amount, start: costStart, title: name }); }
        finally { vtSaving = false; }
        if (!answer) return; // cancelled - the popup stays open
        applyFrom = answer.from;
      }
      finUpsertRecurring(recId, { title: name, amount, category: finCat, paidBy, note: r.note || '', link: r.link || '', interval, start: costStart, contract: id }, applyFrom);
    } else {
      const r = finUpsertRecurring(null, { title: name, amount, category: finCat, paidBy, note: '', link: '', interval, start: costStart, contract: id });
      recId = r.id;
    }
    contract.recurringId = recId;
  } else if (recId && existing && existing.recurringId === recId) {
    const r = finance.recurring.find(x => x.id === recId);
    if (!confirm(tk('contract.noMoreRunningCosts', { name: (r && r.title) || name }))) return;
    if (r && finRecIsRunning(r, today)) finEndRecurring(recId);
    finance.recurring = finance.recurring.map(x => x.id === recId ? { ...x, contract: '' } : x);
    contract.recurringId = '';
  } else {
    contract.recurringId = '';
  }
  vtApplyCancelToRecurring(contract);
  finance.contracts = existing ? finance.contracts.map(x => x.id === id ? contract : x) : [...finance.contracts, contract];
  closeContractModal();
  vtAfterChange();
  if (existing) {
    if (vtDetailId === id) renderContractDetail();
    finShowToast(tk('contract.saved') + (applyFrom ? ' ' + tk('contract.newAmountFrom', { date: vtFmt(applyFrom) }) : ''));
  } else {
    openContractDetail(id);
    finShowToast(hasCost ? tk('contract.createdWithCost', { amount: fmtEur(amount), interval: vtIntervalLabel(interval), cat: i18nT(finCategory(finCat).label) }) : tk('contract.created'));
  }
}
async function deleteContractFromModal() {
  const c = vtContract(vtEditId);
  if (!c) return;
  if (!finDocsLoaded) await loadFinDocs(true);
  const nDocs = finDocsFor('vertrag:' + c.id).length;
  const rec = vtRec(c);
  const today = finTodayIso();
  let msg = tk('contract.deleteContract', { name: c.name });
  if (rec && finRecIsRunning(rec, today)) msg += (' ' + tk('contract.recurringTransactionEndsToday'));
  if (nDocs) msg += ' ' + tk('contract.docsAlsoDeletedN', { n: nDocs });
  if (!confirm(msg)) return;
  if (rec) {
    if (finRecIsRunning(rec, today)) finEndRecurring(rec.id);
    finance.recurring = finance.recurring.map(r => r.id === rec.id ? { ...r, contract: '', untilByContract: false } : r);
  }
  finance.contracts = finance.contracts.filter(x => x.id !== c.id);
  finance.recurring = finance.recurring.map(r => r.contract === c.id ? { ...r, contract: '', untilByContract: false } : r);
  if (c.auto) finance.contractAutoSkip = [...new Set([...(finance.contractAutoSkip || []), c.auto])];
  closeContractModal();
  closeContractDetail();
  vtAfterChange();
  finShowToast(tk('contract.contractDeleted'));
  finDeleteDocsFor('vertrag:' + c.id);
}

/* ---------- Popup: cancel ---------- */
let vtCancelId = null;
let vtCancelEffTouched = false;
let vtLetterTouched = false;
function openContractCancel(id) {
  const c = vtContract(id);
  if (!c) return;
  vtCancelId = id;
  const today = finTodayIso();
  const cancelled = !!(c.cancel && vtIsIso(c.cancel.effective));
  const sent = cancelled && vtIsIso(c.cancel.sent) ? c.cancel.sent : today;
  vtSet('ccSent', sent);
  vtSet('ccEffective', cancelled ? c.cancel.effective : vtEarliestEnd(c, sent));
  vtCancelEffTouched = cancelled;
  vtLetterTouched = false;
  document.getElementById('ccConfirmed').checked = !!(cancelled && c.cancel.confirmed);
  document.getElementById('contractCancelTitle').textContent = cancelled ? tk('contract.cancellation', { name: c.name }) : tk('contract.cancel2', { name: c.name });
  document.getElementById('ccRevokeBtn').classList.toggle('hidden', !cancelled);
  document.getElementById('ccSaveBtn').textContent = cancelled ? tk('common.save') : tk('contract.saveAsCancelled');
  document.getElementById('ccMailBtn').classList.toggle('hidden', !(c.contact && c.contact.email));
  updateContractCancelUi(true);
  document.getElementById('contractCancelModal').classList.remove('hidden');
  armModalSnapshot('contractCancelModal');
}
function closeContractCancel() {
  document.getElementById('contractCancelModal').classList.add('hidden');
  vtCancelId = null;
}
function updateContractCancelUi(regenLetter) {
  const c = vtContract(vtCancelId);
  if (!c) return;
  const sent = vtVal('ccSent');
  if (!vtCancelEffTouched && vtIsIso(sent)) vtSet('ccEffective', vtEarliestEnd(c, sent));
  const eff = vtVal('ccEffective');
  const info = document.getElementById('ccInfo');
  const kind = vtTermType(c);
  const earliest = vtIsIso(sent) ? vtEarliestEnd(c, sent) : '';
  let text = '';
  if (kind === 'open') text = tk('contract.cc.open', { notice: vtNoticeText(c), sent: vtFmt(sent), date: vtFmt(earliest) });
  else if (earliest) {
    const dl = vtMinusNotice(earliest, vtNotice(c));
    text = tk('contract.cc.fixed', { notice: vtNoticeText(c), until: vtFmt(dl), date: vtFmt(earliest) });
  } else text = tk('contract.withoutEndTermEnd');
  const rec = vtRec(c);
  if (rec && vtIsIso(eff)) text += ` ${tk('contract.debitEnds', { date: vtFmt(eff) })}`;
  info.textContent = text;
  if (regenLetter || !vtLetterTouched) vtSet('ccLetter', vtLetter(c, eff));
}
function vtLetter(c, effIso) {
  const holder = (c.holder && memberById(c.holder)) || currentMember();
  const holderName = vtFullName(holder);
  const ct = c.contact || {};
  const lines = [];
  if (holderName) lines.push(holderName, '');
  lines.push(c.provider || c.name || '');
  if (ct.address) ct.address.split(/\r?\n/).forEach(l => lines.push(l));
  lines.push('', vtFmt(finTodayIso()), '');
  lines.push(c.name ? tk('contract.letter.subjectNamed', { name: c.name }) : tk('contract.letter.subject'));
  if (c.customerNo) lines.push(tk('contract.letter.customerNo', { no: c.customerNo }));
  if (c.contractNo) lines.push(tk('contract.letter.contractNo', { no: c.contractNo }));
  lines.push('', tk('contract.dearSirMadam'), '');
  lines.push(vtIsIso(effIso)
    ? tk('contract.iHerebyGiveNotice', { date: vtFmt(effIso) })
    : tk('contract.iHerebyGiveNotice2'));
  lines.push('', tk('contract.pleaseConfirmWritingReceipt'));
  if (vtRec(c)) lines.push(tk('contract.iRevokeDirectDebit'));
  lines.push(tk('contract.iObjectBeingContacted'));
  lines.push('', tk('contract.kindRegards'), '', holderName || '');
  return lines.join('\n');
}
function saveContractCancel() {
  const c = vtContract(vtCancelId);
  if (!c) return;
  const sent = vtVal('ccSent');
  const eff = vtVal('ccEffective');
  if (!vtIsIso(eff)) { document.getElementById('ccEffective').focus(); finShowToast(tk('contract.pleaseEnterWhenCancellation'), true); return; }
  const upd = { ...c, cancel: { sent: vtIsIso(sent) ? sent : finTodayIso(), effective: eff, confirmed: document.getElementById('ccConfirmed').checked } };
  finance.contracts = finance.contracts.map(x => x.id === c.id ? upd : x);
  vtApplyCancelToRecurring(upd);
  closeContractCancel();
  vtAfterChange();
  if (vtDetailId === c.id) renderContractDetail();
  finShowToast((vtRec(upd) ? tk('contract.cancelledDebitEnds', { date: vtFmt(eff) }) : tk('contract.cancelledAsOfToast', { date: vtFmt(eff) })) + ' ' + tk('contract.cancelTip'));
}
function revokeContractCancel() {
  const c = vtContract(vtCancelId);
  if (!c || !confirm(tk('contract.withdrawCancellationContractThen'))) return;
  const upd = { ...c, cancel: null };
  finance.contracts = finance.contracts.map(x => x.id === c.id ? upd : x);
  vtApplyCancelToRecurring(upd);
  closeContractCancel();
  vtAfterChange();
  if (vtDetailId === c.id) renderContractDetail();
  finShowToast(tk('contract.cancellationWithdrawn'));
}
function mailContractCancel() {
  const c = vtContract(vtCancelId);
  if (!c || !c.contact || !c.contact.email) return;
  const subject = c.customerNo ? tk('contract.mail.subjectNo', { name: c.name, no: c.customerNo }) : tk('contract.mail.subject', { name: c.name });
  location.href = `mailto:${encodeURIComponent(c.contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(vtVal('ccLetter'))}`;
}

/* ---------- Popup: contract categories (directly on the page, as in the pantry "Vorrat") ---------- */
let vtCatDraft = null;
function openContractCategories() {
  vtCatDraft = vtCategories().map(c => ({ ...c }));
  renderContractCategoryEditor();
  document.getElementById('contractCategoryModal').classList.remove('hidden');
  armModalSnapshot('contractCategoryModal');
}
function closeContractCategories() {
  document.getElementById('contractCategoryModal').classList.add('hidden');
  vtCatDraft = null;
}
function renderContractCategoryEditor() {
  const wrap = document.getElementById('contractCategoryEditor');
  const finCats = finance.categories.filter(c => c.id !== FIN_INCOME_CATEGORY && c.id !== FIN_SAVINGS_CATEGORY);
  wrap.innerHTML = vtCatDraft.map((c, i) => `
    <div class="rounded-xl border border-ink/10 p-2" data-idx="${i}">
      <div class="flex items-center gap-2">
        <input type="text" data-field="icon" value="${escapeHtml(c.icon || '')}" maxlength="4" class="w-11 shrink-0 rounded-lg border border-ink/15 px-1 py-1.5 text-center text-lg" aria-label="${escapeHtml(tk('household.icon'))}" />
        <input type="text" data-field="label" data-i18n-value value="${escapeHtml(c.label || '')}" maxlength="40" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('common.name'))}" />
        ${c.id === 'sonstiges' ? '<span class="w-8 shrink-0"></span>' : ('<button type="button" data-action="delete" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="' + escapeHtml(tk('common.delete')) + '">×</button>')}
      </div>
      <div class="flex items-center gap-2 mt-1.5">
        <span class="text-[11px] text-ink/45 shrink-0 w-11 text-center">💶</span>
        <select data-field="finCat" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white" aria-label="${escapeHtml(tk('contract.expenseCategory'))}">
          ${finCats.map(f => `<option value="${escapeHtml(f.id)}"${f.id === (c.finCat || 'sonstiges') ? ' selected' : ''}>${escapeHtml(tk('contract.expensesCat', { cat: (f.icon ? f.icon + ' ' : '') + i18nT(f.label) }))}</option>`).join('')}
        </select>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('[data-idx]').forEach(row => {
    const i = Number(row.dataset.idx);
    row.querySelectorAll('[data-field]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { vtCatDraft[i][inp.dataset.field] = inp.value; }));
    const del = row.querySelector('[data-action="delete"]');
    if (del) del.addEventListener('click', () => {
      const item = vtCatDraft[i];
      const used = vtContracts().filter(c => c.category === item.id).length;
      if (used && !confirm(tk('contract.catUsedN', { name: item.label, n: used }))) return;
      vtCatDraft.splice(i, 1);
      renderContractCategoryEditor();
    });
  });
}
function addContractCategory() {
  vtCatDraft.push({ id: 'vk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '', icon: '🏷️', color: FIN_CUSTOM_PALETTE[vtCatDraft.length % FIN_CUSTOM_PALETTE.length], finCat: 'sonstiges' });
  renderContractCategoryEditor();
  const inputs = document.querySelectorAll('#contractCategoryEditor input[data-field="label"]');
  const last = inputs[inputs.length - 1];
  if (last) setTimeout(() => last.focus(), 30);
}
function saveContractCategories() {
  const cats = vtCatDraft.map(c => ({ ...c, label: String(c.label || '').trim().slice(0, 40), icon: String(c.icon || '').trim().slice(0, 4) })).filter(c => c.label);
  if (!cats.some(c => c.id === 'sonstiges')) cats.push({ ...VT_DEFAULT_CATEGORIES[VT_DEFAULT_CATEGORIES.length - 1] });
  const ids = new Set(cats.map(c => c.id));
  finance.contractCategories = cats;
  finance.contracts = finance.contracts.map(c => ids.has(c.category) ? c : { ...c, category: 'sonstiges' });
  closeContractCategories();
  vtAfterChange();
}

/* ---------- Overview tile: upcoming cancellation deadlines ---------- */
function renderContractTile() {
  const body = document.getElementById('contractTileBody');
  const range = document.getElementById('contractTileRange');
  if (!body || !range) return;
  if (!finance || isCurrentUserGuest()) { body.innerHTML = ''; range.textContent = ''; return; }
  const list = vtTileList();
  range.textContent = list.length ? tk('contract.tile.dueN', { n: list.length }) : '';
  if (!list.length) { body.innerHTML = ('<p class="text-sm text-ink/40 italic">' + escapeHtml(tk('contract.noCancellationDeadlineDue')) + '</p>'); return; }
  body.innerHTML = `<div class="ov-bday-list">${list.slice(0, 6).map(d => {
    const month = new Date(d.date + 'T00:00:00').toLocaleDateString(sysLocale(), { month: 'short' }).replace('.', '');
    const key = vtTileKey(d);
    return `
      <div class="ov-bday-swipe" data-bday-key="${key}">
      <button type="button" class="ov-bday-action" data-vt-hide="${key}">${escapeHtml(tk('overview.hide'))}</button>
      <button type="button" class="ov-bday-row vt-tile-row w-full text-left${d.tone === 'urgent' ? ' is-urgent' : ''}" data-vtopen="${escapeHtml(d.c.id)}">
        <div class="ov-bday-date"><b>${Number(d.date.slice(8, 10))}</b><span>${escapeHtml(month)}</span></div>
        <div class="ov-bday-text">
          <div class="ov-bday-name">${escapeHtml(d.title)}</div>
          <div class="ov-bday-sub">${escapeHtml(d.sub)}</div>
        </div>
        <div class="ov-bday-when"${d.tone === 'urgent' ? ' style="color:#B3302B"' : ''}>${escapeHtml(d.when)}</div>
        <span class="ov-bday-x" role="button" tabindex="0" data-vt-hide="${key}" aria-label="${escapeHtml(tk('overview.hide'))}" title="${escapeHtml(tk('overview.hide'))}">×</span>
      </button>
      </div>`;
  }).join('')}</div>`;
}
// Hiding by swiping (like birthdays): key = contract + date, so the next deadline of the same contract shows again
function vtTileKey(d) { return bdayKey({ n: d.c.id + '|' + (d.sub || '').slice(0, 2), m: d.date.slice(0, 7), d: d.date.slice(8) }); }
function vtTileList() { return vtDueList(finTodayIso()).filter(d => !(overviewVtHidden && overviewVtHidden.has(vtTileKey(d)))); }
function vtHideTileItem(key) {
  if (!key) return;
  const finish = () => {
    if (!overviewVtHidden) overviewVtHidden = new Set();
    overviewVtHidden.add(key);
    saveOverviewPrefs();
  };
  const wrap = document.querySelector(`#contractTileBody .ov-bday-swipe[data-bday-key="${key}"]`);
  if (!wrap) { finish(); return; }
  wrap.classList.add('is-gone');
  setTimeout(finish, 230);
}
attachOverviewSwipe(document.getElementById('contractTileBody'), vtHideTileItem);
document.getElementById('contractTileBody').addEventListener('click', (e) => {
  const hide = e.target.closest('[data-vt-hide]');
  if (hide) { e.stopPropagation(); vtHideTileItem(hide.dataset.vtHide); return; }
  if (e.target.closest('.ov-bday-swipe.is-open')) return;
  const row = e.target.closest('[data-vtopen]');
  if (!row) return;
  setView('finanzen');
  finSetTab('vertraege');
  openContractDetail(row.dataset.vtopen);
});
// Push message tapped: /?vertrag=<ID> opens the contract
function vtOpenFromUrl() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('vertrag') || ''; } catch (e) { id = ''; }
  if (!id) return;
  try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
  if (isCurrentUserGuest() || !vtContract(id)) return;
  setView('finanzen');
  finSetTab('vertraege');
  openContractDetail(id);
}

/* ---------- Wiring ---------- */
(function initContractsUi() {
  document.getElementById('finDocFileInput').addEventListener('change', onFinDocFilesChosen);
  document.getElementById('contractSearchInput').addEventListener('input', (e) => { vtSearch = e.target.value; renderContracts(); });
  document.getElementById('contractDueToggle').addEventListener('click', () => { vtOnlyDue = !vtOnlyDue; renderContracts(); });
  document.querySelectorAll('.contract-status-btn').forEach(b => b.addEventListener('click', () => { vtFilterStatus = b.dataset.cstatus; renderContracts(); }));
  document.getElementById('contractCategoryFilter').addEventListener('change', (e) => { vtFilterCategory = e.target.value; renderContracts(); });
  document.getElementById('contractSortSelect').addEventListener('change', (e) => { vtSort = e.target.value; renderContracts(); });

  // View
  document.getElementById('closeContractDetailBtn').addEventListener('click', closeContractDetail);
  document.getElementById('contractDetailModal').addEventListener('click', (e) => { if (e.target.id === 'contractDetailModal') closeContractDetail(); });

  // Create / edit
  document.getElementById('closeContractModalBtn').addEventListener('click', () => attemptCloseModal('contractModal', closeContractModal));
  document.getElementById('cancelContractBtn').addEventListener('click', () => attemptCloseModal('contractModal', closeContractModal));
  wireModalOutsideClick('contractModal', closeContractModal);
  document.getElementById('saveContractBtn').addEventListener('click', saveContractFromModal);
  document.getElementById('deleteContractBtn').addEventListener('click', deleteContractFromModal);
  document.getElementById('cfLinkRec').addEventListener('change', onVtLinkRecChanged);
  document.getElementById('cfFinCat').addEventListener('change', () => { vtFinCatTouched = true; });
  ['cfAmount'].forEach(id => document.getElementById(id).addEventListener('input', updateContractFormUi));
  ['cfInterval', 'cfCostStart', 'cfTermType', 'cfRenew', 'cfNoticeUnit', 'cfNoticeMonthEnd', 'cfRemindOn', 'cfRemindDays'].forEach(id => document.getElementById(id).addEventListener('change', updateContractFormUi));
  document.getElementById('cfNoticeValue').addEventListener('input', updateContractFormUi);
  document.getElementById('cfStart').addEventListener('change', onVtStartOrMinChanged);
  document.getElementById('cfMinTerm').addEventListener('change', onVtStartOrMinChanged);
  document.getElementById('cfFirstEnd').addEventListener('change', onVtFirstEndChanged);
  document.getElementById('cfName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.getElementById('cfProvider').focus(); } });

  // Cancel
  document.getElementById('closeContractCancelBtn').addEventListener('click', () => attemptCloseModal('contractCancelModal', closeContractCancel));
  document.getElementById('ccCancelBtn').addEventListener('click', () => attemptCloseModal('contractCancelModal', closeContractCancel));
  wireModalOutsideClick('contractCancelModal', closeContractCancel);
  document.getElementById('ccSaveBtn').addEventListener('click', saveContractCancel);
  document.getElementById('ccRevokeBtn').addEventListener('click', revokeContractCancel);
  document.getElementById('ccSent').addEventListener('change', () => updateContractCancelUi(false));
  document.getElementById('ccEffective').addEventListener('change', () => { vtCancelEffTouched = true; updateContractCancelUi(false); });
  document.getElementById('ccLetter').addEventListener('input', () => { vtLetterTouched = true; });
  document.getElementById('ccCopyBtn').addEventListener('click', () => vtCopyText(vtVal('ccLetter'), tk('contract.cancellationLetterCopied')));
  document.getElementById('ccMailBtn').addEventListener('click', mailContractCancel);

  // Categories
  document.getElementById('closeContractCategoryBtn').addEventListener('click', () => attemptCloseModal('contractCategoryModal', closeContractCategories));
  document.getElementById('cancelContractCategoryBtn').addEventListener('click', () => attemptCloseModal('contractCategoryModal', closeContractCategories));
  wireModalOutsideClick('contractCategoryModal', closeContractCategories);
  document.getElementById('saveContractCategoryBtn').addEventListener('click', saveContractCategories);
  document.getElementById('addContractCategoryBtn').addEventListener('click', addContractCategory);

  // Receipts on expenses
  document.getElementById('expenseDocAddBtn').addEventListener('click', () => {
    finPickDocs({ mode: 'expense', bezug: editingExpenseId ? 'ausgabe:' + editingExpenseId : '', typ: 'beleg' });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentView === 'finanzen' && finTab === 'vertraege') { loadFinDocs(); renderContracts(); }
  });
})();

/* ---------- Events ---------- */
(function initFinanceUi() {
  document.querySelectorAll('.fin-period-btn').forEach(btn => btn.addEventListener('click', () => {
    if (finPeriod === btn.dataset.period) return;
    // When the grouping changes, jump to the period that contains the previously selected one
    const cur = finPeriodRange(finPeriod, finOffset);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const anchor = (today >= cur.start && today <= cur.end) ? isoDate(today) : cur.startIso;
    finPeriod = btn.dataset.period;
    finOffset = 0;
    finJumpToDate(anchor);
    renderFinance();
  }));
  document.getElementById('finPrevBtn').addEventListener('click', () => { finOffset--; renderFinance(); });
  document.getElementById('finNextBtn').addEventListener('click', () => { finOffset++; renderFinance(); });
  document.getElementById('finTodayBtn').addEventListener('click', () => { finOffset = 0; renderFinance(); });
  document.getElementById('openExpenseModalBtn').addEventListener('click', () => {
    if (finTab === 'sparen') openExpenseModal({ preset: { category: FIN_SAVINGS_CATEGORY, link: finDefaultGoalLink(finSavingsDepot) } });
    else if (finTab === 'taschengeld') openAllowanceModal(null);
    else if (finTab === 'vertraege') openContractModal();
    else openExpenseModal();
  });
  document.querySelectorAll('.fin-tab-btn').forEach(btn => btn.addEventListener('click', () => finSetTab(btn.dataset.fintab)));
  document.getElementById('openFinanceSettingsBtn').addEventListener('click', () => { if (finTab === 'vertraege') openContractCategories(); else openFinanceSettings(); });

  // Swiping over the budget card switches the period
  const card = document.getElementById('finBudgetCard');
  let sx = null, sy = null;
  card.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
  card.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null; sy = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { finOffset += dx < 0 ? 1 : -1; renderFinance(); }
  }, { passive: true });

  // Expense popup
  document.getElementById('closeExpenseModalBtn').addEventListener('click', closeExpenseModal);
  document.getElementById('cancelExpenseBtn').addEventListener('click', closeExpenseModal);
  document.getElementById('saveExpenseBtn').addEventListener('click', saveExpenseFromModal);
  document.getElementById('deleteExpenseBtn').addEventListener('click', deleteFromExpenseModal);
  document.getElementById('endRecurringBtn').addEventListener('click', endRecurringFromModal);
  document.getElementById('expenseRepeatSelect').addEventListener('change', updateExpenseRecurringUi);
  document.getElementById('expenseLinkSelect').addEventListener('change', (e) => { expenseModalLink = e.target.value; expenseLinkAuto = false; expenseLinkTouched = true; expenseDepotTouched = true; });
  document.getElementById('expenseDateInput').addEventListener('change', updateExpenseRecurringUi);
  document.getElementById('expenseModal').addEventListener('click', (e) => { if (e.target.id === 'expenseModal') closeExpenseModal(); });
  document.getElementById('expenseAmountInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveExpenseFromModal(); } });
  document.getElementById('expenseAmountInput').addEventListener('input', updateExpenseSignUi);
  const signBtn = document.getElementById('expenseSignBtn');
  signBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // Keep keyboard/focus in the amount field
  signBtn.addEventListener('mousedown', (e) => e.preventDefault());
  signBtn.addEventListener('click', toggleExpenseSign);

  // Changed amount: from when?
  document.querySelectorAll('#finScopeModal input[name="finScope"]').forEach(inp => inp.addEventListener('change', () => finScopeSelect(inp.value)));
  document.getElementById('finScopeDate').addEventListener('focus', () => { if (finScopeValue() !== 'date') finScopeSelect('date'); });
  document.getElementById('finScopeDate').addEventListener('change', () => { if (finScopeValue() !== 'date') finScopeSelect('date'); else updateFinScopeDateSub(); });
  document.getElementById('finScopeDate').addEventListener('input', updateFinScopeDateSub);
  document.getElementById('closeFinScopeBtn').addEventListener('click', () => finScopeFinish(null));
  document.getElementById('cancelFinScopeBtn').addEventListener('click', () => finScopeFinish(null));
  document.getElementById('saveFinScopeBtn').addEventListener('click', confirmFinScope);
  document.getElementById('finScopeModal').addEventListener('click', (e) => { if (e.target.id === 'finScopeModal') finScopeFinish(null); });

  // Complete shopping
  document.getElementById('closeCheckoutBtn').addEventListener('click', closeShoppingCheckout);
  document.getElementById('checkoutSaveBtn').addEventListener('click', () => finishShoppingCheckout(true));
  document.getElementById('checkoutSkipBtn').addEventListener('click', () => finishShoppingCheckout(false));
  document.getElementById('checkoutAmountInput').addEventListener('input', updateCheckoutBudgetHint);
  document.getElementById('checkoutDateInput').addEventListener('change', updateCheckoutBudgetHint);
  document.getElementById('checkoutAmountInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finishShoppingCheckout(true); } });
  document.getElementById('shoppingCheckoutModal').addEventListener('click', (e) => { if (e.target.id === 'shoppingCheckoutModal') closeShoppingCheckout(); });

  // Settings
  document.getElementById('closeFinanceSettingsBtn').addEventListener('click', closeFinanceSettings);
  document.getElementById('cancelFinanceSettingsBtn').addEventListener('click', closeFinanceSettings);
  document.getElementById('saveFinanceSettingsBtn').addEventListener('click', saveFinanceSettings);
  document.getElementById('finBudgetInput').addEventListener('input', updateFinBudgetInfo);
  const budgetSignBtn = document.getElementById('finBudgetSignBtn');
  budgetSignBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // Keep keyboard/focus in the amount field
  budgetSignBtn.addEventListener('mousedown', (e) => e.preventDefault());
  budgetSignBtn.addEventListener('click', toggleFinBudgetSign);
  document.getElementById('finAddCategoryBtn').addEventListener('click', addFinCategory);
  document.getElementById('finAddRecurringBtn').addEventListener('click', () => openExpenseModal({ asRecurring: true }));
  document.getElementById('finExportBtn').addEventListener('click', () => exportFinanceCsv(Number(document.getElementById('finExportYear').value)));
  document.getElementById('financeSettingsModal').addEventListener('click', (e) => { if (e.target.id === 'financeSettingsModal') closeFinanceSettings(); });
  initSavingsAndAllowanceUi();

  window.addEventListener('online', () => finFlushQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && familyRecordId) {
      if (currentView === 'finanzen') loadAusgaben(); else finFlushQueue();
    }
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('vertraege');

// Cost tile in the contract popup (1.62): the amount stays in one line, the tiles wrap on small phones
function vtCostTile(label, value, sub) {
  return `
    <div class="rounded-xl bg-ink/5 px-3 py-2.5 min-w-0">
      <div class="text-[10px] uppercase tracking-wide text-ink/40 truncate">${label}</div>
      <div class="vt-tile-v">${value}</div>
      ${sub ? `<div class="text-[11px] text-ink/50 leading-snug">${sub}</div>` : ''}
    </div>`;
}
