/* pinn. – js/finanzen.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/kassen.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.58.0, only the comments were translated):
   - Amounts & currency – parsing and formatting of amounts, currency signs and amount placeholders
     (fmtEur, parseEuro, curSym …, applyCurrencyMarkup)
   - Categories & settings – default finance data, categories, household budget = income ± adjustment (fin…)
   - Queue & cache – local queue for new/changed/deleted expenses, offline cache, loading from the server
     (loadAusgaben, finFlushQueue …)
   - Recurring entries – weekly to yearly, amount history, planned entries up to two years ahead (finRec…)
   - Periods & evaluation – week/month/year ranges, statistics, budget card, trend chart, entry list,
     empty states and the fund diagnosis (renderFinance, runKassenDiagnose)
   - Category picker – custom categories directly from the picker („+ Eigene“)
   - Popup for expenses and recurring expenses – income via minus, assignment to depot/position/child,
     the "changed amount: from when?" question, ending recurring entries, saving and deleting
   99 functions and 38 variables. index.html only calls these functions later (when the user acts or from
   bootApp), never while it is still loading – that is why this file may come after the inline script.
   Two statements run while this file loads: applyCurrencyMarkup() (adapts currency signs in the HTML)
   and the click listener on #financeScroll. */

/* ==========================================================
   Finance - expenses & income, household budget, categories, recurring entries
   ----------------------------------------------------------
   - Income entries are entries with a negative amount (minus before the sum in the entry form).
     They do not count towards budget spending; they are shown separately as income and
     in the balance (income - expenses).
   - Household budget = sum of the income in the period (one-off and recurring; recurring income is counted
     even before it is booked, e.g. the salary at the end of the month) ± a fixed adjustment per month
     (finance.budgetAdjust, in the finance settings). Week = monthly budget × 12 / 52.
   - Savings plans (recurring entries of the category „Sparen“) are ordinary expenses: on the execution
     day they are credited to the depot and deducted in the expenses. They can be created in
     the expenses, in the depot („🔁 Sparrate“) and directly at the position (e.g. at the ETF).
   - If the amount of a recurring entry changes, it applies from today by default; if there are already
     earlier entries, the app asks whether it should apply retroactively from a date or to all of them instead.
   - Custom categories can be created directly in the category picker („+ Eigene“) or in the
     finance settings.
   - Expenses live in the PocketBase collection "ausgaben" (server logic: pb_hooks/pinn-finanzen.js).
   - Budget, categories, recurring expenses and the remembered category per shopping list are kept
     small in the family record (finance) and are synced like everything else.
   - New/changed/deleted expenses first go into a local queue and are then
     sent to the server. Without a connection (e.g. in the shop) the entry stays saved locally
     and is sent automatically later. The app assigns the ID, so duplicate entries never occur.
   - Recurring entries (weekly, every 2 weeks, monthly, quarterly, yearly) are not
     stored individually but calculated for each period.
   - At the top a switch toggles between three areas:
     · Ausgaben    - budget, history, entries (as before)
     · Sparen      - everything from the category „Sparen“, split across depots (including junior depots for kids):
                     the overall summary at the top, the depots below; a depot opens with its positions
                     (ETF, share, derivative … or a classic savings goal), savings plan, history and entries.
                     An entry under „Sparen“ is a deposit; with a minus (income) it is a withdrawal.
                     Entries can be assigned to a position (link = 'spar:<position ID>') or only to a
                     depot (link = 'depot:<depot ID>').
     · Taschengeld - per child a recurring amount under the category „Kinder“ (link = 'kind:<member ID>'),
                     optionally with a tracked balance; via a checkbox in the child settings also visible on the
                     kids' page.
   ========================================================== */
const FIN_GREEN = '#2F9E5B';
const FIN_RED = '#D94A45';
const LS_FIN_QUEUE = 'pinn.finanzen.queue';
const LS_FIN_CACHE = 'pinn.finanzen.cache';
let finServerList = [];   // expenses confirmed by the server
let ausgaben = [];        // display: server state + own changes not yet sent
let ausgabenLoaded = false;
let finPeriod = 'month';  // 'week' | 'month' | 'year'
let finOffset = 0;
let finDetailOpen = false;
let finCategoryFilter = null;
let finFlushing = false;
let finRetryTimer = null;
let finQueueMemory = null;
let finToastTimer = null;
const LS_FIN_TAB = 'pinn.finanzen.tab';
let finTab = (() => { try { const t = localStorage.getItem(LS_FIN_TAB); return ['ausgaben', 'sparen', 'taschengeld', 'vertraege'].includes(t) ? t : 'ausgaben'; } catch (e) { return 'ausgaben'; } })();
const FIN_SAVINGS_CATEGORY = 'sparen';
const FIN_KIDS_CATEGORY = 'kinder';
const finEurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const finEurFmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function fmtEur(v) { return finEurFmt.format(Math.round((v || 0) * 100) / 100); }
function fmtEur0(v) { return finEurFmt0.format(Math.round(v || 0)); }

// Amount from an input (name is historical – applies to every currency): comma or dot, thousands separator
// and currency sign allowed, see PINN_REGION.parse. Calculations always use a dot.
function parseEuro(str) {
  const v = window.PINN_REGION ? PINN_REGION.parse(str) : NaN;
  return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}
function euroInputValue(v) {
  if (v == null || v === '' || !isFinite(Number(v))) return '';
  const nk = window.PINN_REGION ? Math.min(2, PINN_REGION.digits) : 2;
  return window.PINN_REGION ? PINN_REGION.input(v, nk) : Number(v).toFixed(2).replace('.', ',');
}
// Currency sign of the selected currency (e.g. €, $, CHF)
function curSym() { return (window.PINN_REGION && PINN_REGION.symbol) || '€'; }
// Placeholder for amount fields, e.g. "0,00" or "0.00"
function curZero() { return window.PINN_REGION ? PINN_REGION.zero() : '0,00'; }
// Whole-number amount without currency sign (chart labels)
function curPlain0(v) { return window.PINN_REGION ? PINN_REGION.num(Math.round(v || 0), 0, 0) : String(Math.round(v || 0)); }
// Decimal number in the selected format ("1.5" → "1,5")
function numDec(x) { return window.PINN_REGION ? PINN_REGION.dec(x) : String(x).replace('.', ','); }
// Adapt fixed currency signs and amount placeholders in the HTML to the selected currency
function applyCurrencyMarkup(root) {
  (root || document).querySelectorAll('.cur-sym').forEach(el => { el.textContent = curSym(); });
  (root || document).querySelectorAll('input[data-cur-zero]').forEach(el => { el.placeholder = curZero(); });
  const pd = document.getElementById('planDoneTotal');
  if (pd && !root) pd.textContent = fmtEur(0);
}
applyCurrencyMarkup();
function newRecordId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(15);
  try { crypto.getRandomValues(arr); } catch (e) { for (let i = 0; i < 15; i++) arr[i] = Math.floor(Math.random() * 256); }
  return Array.from(arr, b => chars[b % 36]).join('');
}
function finFamilyKey() { return (currentUser() && currentUser().familie) || ''; }
function finMonthKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
function finIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
function finTodayIso() { return isoDate(new Date()); }

/* ---------- Categories & settings ---------- */
function defaultFinance() {
  return {
    budgetAdjust: 0, // Household budget = income of the period + this adjustment per month (± euro)
    categories: FIN_DEFAULT_CATEGORIES.map(c => ({ ...c, active: true, budget: null })),
    listCategories: {}, // Shopping list -> last selected category
    // Recurring entries: { id, title, amount, category, interval, start: 'YYYY-MM-DD', until: 'YYYY-MM-DD' | '',
    //   paidBy, note, link, allowanceFor, history: [{id, from, amount}] }
    //   (older entries: only day + since 'YYYY-MM' / until 'YYYY-MM' = monthly - still understood)
    recurring: [],
    depots: [],         // Depots: { id, name, icon, color, type: 'depot'|'junior', kid (member ID), bank, created }
    savingsGoals: [],   // Positions/savings goals: { id, depot, kind, name, icon, color, target, targetDate, startBalance, isin, startShares, created }
    pocketMoney: [],    // Pocket-money balance per child: { id: member ID, track, start: 'YYYY-MM-DD', startBalance }
    pocketLedger: [],   // Movements in the child's balance: { id, kid, date, amount (+ received / − spent), note, expenseId }
    etfTrades: [],      // imported depot transactions: { id, goal, isin, date, type: 'buy'|'sell', amount, shares, price, fee, source }
    contracts: [],      // Contracts (Finance → Contracts), structure see section „Finanzen → Verträge“
    contractCategories: VT_DEFAULT_CATEGORIES.map(c => ({ ...c })),
    vehicles: [],       // Vehicles (menu „Fahrzeuge“), structure see section „Fahrzeuge“
    vehicleLog: [],     // Vehicles: fuel, charging, workshop … (same ID as the expense in finance)
    homes: [],          // House (menu „Haus“), structure see section „Haus“
    homeLog: [],        // House: bills & costs (booked ones = expense with the same ID)
    homeDefects: [],    // House: defects
    homeProjects: [],   // House: refurbishment / renovation plan
    homeMeters: [],     // House: meters (electricity, gas, water …)
    homeReadings: [],   // House: meter readings
    homePlants: [],     // Home → garden & plants
    homeKeys: [],       // Home → keys
    contractAutoSkip: [], // Contracts: automatically created ones that were deleted (do not create again)
  };
}
function normalizeFinance(f) {
  const d = defaultFinance();
  if (!f || typeof f !== 'object') return d;
  const cats = (Array.isArray(f.categories) && f.categories.length)
    ? f.categories.filter(c => c && c.id).map(c => ({ ...c }))
    : d.categories;
  // Add standard categories that were introduced later (e.g. savings, insurance, income).
  // Standard categories cannot be deleted, only hidden - so missing ones are new.
  FIN_DEFAULT_CATEGORIES.forEach(dc => {
    if (cats.some(c => c.id === dc.id)) return;
    const nc = { ...dc, active: true, budget: null };
    const idx = cats.findIndex(c => c.id === 'sonstiges');
    if (idx >= 0 && dc.id !== 'sonstiges') cats.splice(idx, 0, nc); else cats.push(nc);
  });
  // Depots: if there is none yet or positions hang on no valid depot, the main depot is created
  // with a fixed ID - so several devices never create two different main depots.
  const goalsN = Array.isArray(f.savingsGoals) ? f.savingsGoals.filter(g => g && g.id) : [];
  const depots = Array.isArray(f.depots) ? f.depots.filter(x => x && typeof x.id === 'string' && x.id).map(x => ({ ...x })) : [];
  const depotIds = new Set(depots.map(x => x.id));
  if (!depotIds.has(FIN_MAIN_DEPOT) && (!depots.length || goalsN.some(g => !g.depot || !depotIds.has(g.depot)))) {
    depots.unshift({ id: FIN_MAIN_DEPOT, name: tk('depot.mainName'), icon: '💼', color: '#3D5A80', type: 'depot', kid: '', bank: '', created: '' });
  }
  return {
    budgetAdjust: (typeof f.budgetAdjust === 'number' && isFinite(f.budgetAdjust)) ? Math.round(f.budgetAdjust * 100) / 100 : 0,
    categories: cats,
    depots,
    listCategories: (f.listCategories && typeof f.listCategories === 'object' && !Array.isArray(f.listCategories)) ? { ...f.listCategories } : {},
    recurring: Array.isArray(f.recurring) ? f.recurring.filter(r => r && r.id) : [],
    savingsGoals: Array.isArray(f.savingsGoals) ? f.savingsGoals.filter(g => g && g.id) : [],
    etfTrades: Array.isArray(f.etfTrades) ? f.etfTrades.filter(t => t && t.id && t.goal && t.date) : [],
    pocketMoney: Array.isArray(f.pocketMoney) ? f.pocketMoney.filter(p => p && p.id) : [],
    pocketLedger: Array.isArray(f.pocketLedger) ? f.pocketLedger.filter(l => l && l.id && l.kid) : [],
    contracts: Array.isArray(f.contracts) ? f.contracts.filter(c => c && typeof c.id === 'string' && c.id) : [],
    contractCategories: vtNormalizeCategories(f.contractCategories),
    vehicles: Array.isArray(f.vehicles) ? f.vehicles.filter(v => v && typeof v.id === 'string' && v.id) : [],
    vehicleLog: Array.isArray(f.vehicleLog) ? f.vehicleLog.filter(l => l && typeof l.id === 'string' && l.id && l.vehicle) : [],
    homes: Array.isArray(f.homes) ? f.homes.filter(h => h && typeof h.id === 'string' && h.id) : [],
    homeLog: Array.isArray(f.homeLog) ? f.homeLog.filter(l => l && typeof l.id === 'string' && l.id && l.home) : [],
    homeDefects: Array.isArray(f.homeDefects) ? f.homeDefects.filter(d => d && typeof d.id === 'string' && d.id && d.home) : [],
    homeProjects: Array.isArray(f.homeProjects) ? f.homeProjects.filter(p => p && typeof p.id === 'string' && p.id && p.home) : [],
    homeMeters: Array.isArray(f.homeMeters) ? f.homeMeters.filter(m => m && typeof m.id === 'string' && m.id && m.home) : [],
    homeReadings: Array.isArray(f.homeReadings) ? f.homeReadings.filter(r => r && typeof r.id === 'string' && r.id && r.meter) : [],
    homePlants: Array.isArray(f.homePlants) ? f.homePlants.filter(x => x && typeof x.id === 'string' && x.id && x.home) : [],
    homeKeys: Array.isArray(f.homeKeys) ? f.homeKeys.filter(x => x && typeof x.id === 'string' && x.id && x.home) : [],
    contractAutoSkip: Array.isArray(f.contractAutoSkip) ? f.contractAutoSkip.filter(k => typeof k === 'string').slice(-300) : [],
  };
}
function finCategory(id) {
  return finance.categories.find(c => c.id === id)
    || finance.categories.find(c => c.id === 'sonstiges')
    || FIN_DEFAULT_CATEGORIES[FIN_DEFAULT_CATEGORIES.length - 1];
}
function finActiveCategories() { return finance.categories.filter(c => c.active !== false); }
function finIsIncome(e) { return (Number(e && e.amount) || 0) < 0; }
function finDefaultExpenseCategory() {
  const act = finActiveCategories();
  if (act.some(c => c.id === 'lebensmittel')) return 'lebensmittel';
  const first = act.find(c => c.id !== FIN_INCOME_CATEGORY);
  return first ? first.id : 'sonstiges';
}
function finDefaultIncomeCategory() {
  return finActiveCategories().some(c => c.id === FIN_INCOME_CATEGORY) ? FIN_INCOME_CATEGORY : null;
}
function finDefaultCategoryForList(listId) {
  const remembered = finance.listCategories[listId];
  if (remembered && finActiveCategories().some(c => c.id === remembered)) return remembered;
  const list = getShoppingList(listId);
  const byStore = list && list.store ? FIN_STORE_CATEGORY[list.store] : null;
  const wanted = byStore || 'lebensmittel';
  if (finActiveCategories().some(c => c.id === wanted)) return wanted;
  const first = finActiveCategories()[0];
  return first ? first.id : 'sonstiges';
}
function finBudgetFor(monthly, period) {
  if (!monthly) return null;
  if (period === 'week') return monthly * 12 / 52;
  if (period === 'year') return monthly * 12;
  return monthly;
}
// Income between startIso and endIso for the budget: one-off income plus recurring
// income of the whole period (including upcoming income, e.g. the salary at the end of the month)
function finBudgetIncomeIn(startIso, endIso) {
  let inc = 0;
  ausgaben.forEach(e => {
    if (e.date < startIso || e.date > endIso) return;
    const a = Number(e.amount) || 0;
    if (a < 0) inc -= a;
  });
  finance.recurring.forEach(r => {
    finRecDates(r, startIso, endIso).forEach(d => { const a = finRecurringAmountFor(r, d); if (a < 0) inc -= a; });
  });
  return Math.round(inc * 100) / 100;
}
// Household budget of a period: income + adjustment. budget = null if nothing is left.
function finBudgetInfo(period, range) {
  const adjM = Number(finance.budgetAdjust) || 0;
  let income, adjust;
  if (period === 'week') {
    // Week: proportional share of the month in which most of the week lies (Thursday)
    const thu = new Date(range.start); thu.setDate(thu.getDate() + 3);
    const mStart = new Date(thu.getFullYear(), thu.getMonth(), 1);
    const mEnd = new Date(thu.getFullYear(), thu.getMonth() + 1, 0);
    income = finBudgetIncomeIn(isoDate(mStart), isoDate(mEnd)) * 12 / 52;
    adjust = adjM * 12 / 52;
  } else if (period === 'year') {
    income = finBudgetIncomeIn(range.startIso, range.endIso);
    adjust = adjM * 12;
  } else {
    income = finBudgetIncomeIn(range.startIso, range.endIso);
    adjust = adjM;
  }
  income = Math.round(income * 100) / 100;
  adjust = Math.round(adjust * 100) / 100;
  const total = Math.round((income + adjust) * 100) / 100;
  return { budget: total > 0 ? total : null, income, adjust };
}
// Budget of the current month (for hints when booking and when shopping)
function finCurrentMonthBudget() {
  const range = finPeriodRange('month', 0);
  return { range, budget: finBudgetInfo('month', range).budget };
}
function finBudgetFormula(info) {
  if (!info.adjust) return tk('fin.budget.fromIncome');
  return tk('fin.budget.incomeAdjusted', { income: fmtEur0(info.income), sign: info.adjust > 0 ? '+' : '−', adjust: fmtEur0(Math.abs(info.adjust)) });
}
function finPeriodWord(period) { return period === 'week' ? tk('fin.period.week') : period === 'year' ? tk('fin.period.year') : tk('fin.period.month'); }

/* ---------- Queue & cache ---------- */
function finQueueRead() {
  let q = finQueueMemory;
  try { const raw = localStorage.getItem(LS_FIN_QUEUE); q = raw ? JSON.parse(raw) : null; } catch (e) { q = finQueueMemory; }
  if (!q || q.familie !== finFamilyKey() || !Array.isArray(q.ops)) return [];
  return q.ops;
}
function finQueueWrite(ops) {
  const q = { familie: finFamilyKey(), ops };
  finQueueMemory = q;
  try { localStorage.setItem(LS_FIN_QUEUE, JSON.stringify(q)); } catch (e) { /* memory only */ }
}
function finCacheWrite() {
  try { localStorage.setItem(LS_FIN_CACHE, JSON.stringify({ familie: finFamilyKey(), list: finServerList })); } catch (e) { /* ignore */ }
}
function finCacheRead() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_FIN_CACHE) || 'null');
    if (c && c.familie === finFamilyKey() && Array.isArray(c.list)) return c.list;
  } catch (e) { /* ignore */ }
  return null;
}
function rebuildAusgaben() {
  const map = new Map(finServerList.map(x => [x.id, x]));
  finQueueRead().forEach(op => {
    if (op.type === 'save' && op.data && op.data.id) map.set(op.data.id, { ...(map.get(op.data.id) || {}), ...op.data, pending: true });
    else if (op.type === 'delete') map.delete(op.id);
  });
  ausgaben = kassenFilterEntries([...map.values()]);
}

async function finPost(url, payload) {
  const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(body.message || tk('fin.err.server')); err.retry = true; throw err; }
  if (body.error) throw new Error(body.error);
  return body;
}

async function finFlushQueue() {
  if (finFlushing || isCurrentUserGuest()) return; // the next authorised profile sends what was booked
  finFlushing = true;
  let changed = false;
  let blocked = false;
  try {
    for (let guard = 0; guard < 200; guard++) {
      const ops = finQueueRead();
      if (!ops.length) break;
      const op = ops[0];
      try {
        if (op.type === 'save') {
          const r = await finPost('/api/pinn/finanzen/speichern', op.data);
          if (r.ausgabe) finServerList = [...finServerList.filter(x => x.id !== r.ausgabe.id), r.ausgabe];
        } else {
          await finPost('/api/pinn/finanzen/loeschen', { id: op.id });
          finServerList = finServerList.filter(x => x.id !== op.id);
        }
      } catch (err) {
        if (err instanceof TypeError || err.retry) { blocked = true; break; } // no connection - try again later
        finShowToast(tk('fin.err.notSaved', { error: err.message }), true);
      }
      finQueueWrite(finQueueRead().filter(o => o.opId !== op.opId));
      changed = true;
    }
  } finally {
    finFlushing = false;
  }
  if (changed) {
    finCacheWrite();
    rebuildAusgaben();
    if (currentView === 'finanzen') renderFinance();
  }
  clearTimeout(finRetryTimer);
  if (blocked && finQueueRead().length) finRetryTimer = setTimeout(finFlushQueue, 30 * 1000);
}

function finQueueSave(data) {
  if (kassenServer === true && !data.kasse) data = { ...data, kasse: activeKasseId };
  const ops = finQueueRead().filter(o => !(o.type === 'save' && o.data && o.data.id === data.id));
  ops.push({ opId: newRecordId(), type: 'save', data });
  finQueueWrite(ops);
  rebuildAusgaben();
  finFlushQueue();
}
function finQueueDelete(id) {
  const ops = finQueueRead().filter(o => !(o.type === 'save' && o.data && o.data.id === id));
  ops.push({ opId: newRecordId(), type: 'delete', id });
  finQueueWrite(ops);
  rebuildAusgaben();
  finFlushQueue();
}

async function loadAusgaben() {
  if (isCurrentUserGuest()) return; // Guests have no access to finance
  await kassenLoad(false);
  if (!ausgabenLoaded && !finServerList.length) {
    const cached = finCacheRead();
    if (cached) { finServerList = cached; rebuildAusgaben(); if (currentView === 'finanzen') renderFinance(); }
  }
  await finFlushQueue();
  try {
    const res = await apiFetch('/api/pinn/finanzen', { cache: 'no-store' });
    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result.ausgaben) && !result.error) {
        finServerList = result.ausgaben;
        ausgabenLoaded = true;
        finCacheWrite();
      }
    }
  } catch (err) { /* offline - keep working with the cached state */ }
  rebuildAusgaben();
  if (currentView === 'finanzen') renderFinance();
}

/* ---------- Recurring entries (weekly to yearly) ---------- */
const FIN_INTERVALS = [
  { id: 'weekly', get label() { return tk('fin.interval.weekly'); }, perYear: 52 },
  { id: 'biweekly', get label() { return tk('fin.interval.biweekly'); }, perYear: 26 },
  { id: 'monthly', get label() { return tk('fin.interval.monthly'); }, perYear: 12 },
  { id: 'quarterly', get label() { return tk('fin.interval.quarterly'); }, perYear: 4 },
  { id: 'yearly', get label() { return tk('fin.interval.yearly'); }, perYear: 1 },
];
// Weekday names (Sunday first, like Date.getDay()) in the language of the app
function finWeekdayName(day) { return new Date(2000, 0, 2 + day).toLocaleDateString(sysLocale(), { weekday: 'long' }); }
function finIsoAddDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
function finRecInterval(r) {
  return FIN_INTERVALS.some(i => i.id === (r && r.interval)) ? r.interval : 'monthly';
}
function finIntervalInfo(id) { return FIN_INTERVALS.find(i => i.id === id) || FIN_INTERVALS[2]; }
// First booking day (older entries only know since 'YYYY-MM' + day)
function finRecStart(r) {
  if (r && /^\d{4}-\d{2}-\d{2}$/.test(r.start || '')) return r.start;
  if (r && /^\d{4}-\d{2}$/.test(r.since || '')) {
    const y = Number(r.since.slice(0, 4)), m = Number(r.since.slice(5, 7));
    const dim = new Date(y, m, 0).getDate();
    return r.since + '-' + pad2(Math.min(Math.max(1, Number(r.day) || 1), dim));
  }
  return '';
}
// Last possible booking day ('' = keeps running). Older entries: 'YYYY-MM' = until the end of the month.
function finRecUntil(r) {
  if (!r || !r.until) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(r.until)) return r.until;
  if (/^\d{4}-\d{2}$/.test(r.until)) {
    const y = Number(r.until.slice(0, 4)), m = Number(r.until.slice(5, 7));
    return r.until + '-' + pad2(new Date(y, m, 0).getDate());
  }
  return '';
}
// All booking days of a recurring entry between fromIso and toIso (inclusive)
function finRecDates(r, fromIso, toIso) {
  const start = finRecStart(r);
  if (!start) return [];
  const until = finRecUntil(r);
  let end = toIso;
  if (until && until < end) end = until;
  let from = fromIso < start ? start : fromIso;
  if (from > end) return [];
  const iv = finRecInterval(r);
  const s0 = new Date(start + 'T00:00:00');
  const out = [];
  if (iv === 'weekly' || iv === 'biweekly') {
    const step = iv === 'weekly' ? 7 : 14;
    const diff = Math.round((new Date(from + 'T00:00:00') - s0) / 86400000);
    let k = Math.max(0, Math.floor(diff / step) - 1);
    for (let guard = 0; guard < 5000; guard++, k++) {
      const iso = isoDate(new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + k * step));
      if (iso > end) break;
      if (iso >= from) out.push(iso);
    }
  } else {
    const stepM = iv === 'quarterly' ? 3 : iv === 'yearly' ? 12 : 1;
    // Monthly booking day: for older entries the stored day (e.g. the 31st), otherwise the day of the start
    const day = (!r.start && Number(r.day)) ? Number(r.day) : s0.getDate();
    const f = new Date(from + 'T00:00:00');
    const monthsDiff = (f.getFullYear() - s0.getFullYear()) * 12 + (f.getMonth() - s0.getMonth());
    let k = Math.max(0, Math.floor(monthsDiff / stepM) - 1);
    for (let guard = 0; guard < 5000; guard++, k++) {
      const mIdx = s0.getMonth() + k * stepM;
      const y = s0.getFullYear() + Math.floor(mIdx / 12), m = ((mIdx % 12) + 12) % 12;
      const dim = new Date(y, m + 1, 0).getDate();
      const iso = y + '-' + pad2(m + 1) + '-' + pad2(Math.min(Math.max(1, day), dim));
      if (iso > end) break;
      if (iso >= from) out.push(iso);
    }
  }
  return out;
}
// Next booking day from (and including) fromIso - '' if ended
function finRecNext(r, fromIso = finTodayIso()) {
  return finRecDates(r, fromIso, finIsoAddDays(fromIso, 400))[0] || '';
}
// Amount on a day (changes apply from history[].from; older entries: from = 'YYYY-MM')
function finRecurringAmountFor(r, key) {
  const hist = (Array.isArray(r.history) ? r.history : []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  let amt = Number(r.amount) || 0;
  if (hist.length) amt = Number(hist[0].amount) || 0;
  hist.forEach(h => { if (h.from <= key) amt = Number(h.amount) || 0; });
  return amt;
}
// Amount converted to one month (for summaries)
function finRecMonthly(r, key = finTodayIso()) {
  return finRecurringAmountFor(r, key) * finIntervalInfo(finRecInterval(r)).perYear / 12;
}
function finRecIsRunning(r, todayIso = finTodayIso()) {
  const until = finRecUntil(r);
  return !until || until >= todayIso;
}
// "every Monday", "every month on the 5th", "every 3 months on the 5th (Jan, Apr, Jul, Oct)" …
function finRecDescribe(r) {
  const start = finRecStart(r);
  if (!start) return '';
  const d = new Date(start + 'T00:00:00');
  const iv = finRecInterval(r);
  const day = (!r.start && Number(r.day)) ? Number(r.day) : d.getDate();
  if (iv === 'weekly') return tk('fin.rec.weekly', { weekday: finWeekdayName(d.getDay()) });
  if (iv === 'biweekly') return tk('fin.rec.biweekly', { weekday: finWeekdayName(d.getDay()) });
  if (iv === 'quarterly') {
    const months = [0, 3, 6, 9].map(o => new Date(2000, (d.getMonth() + o) % 12, 1).toLocaleDateString(sysLocale(), { month: 'short' }).replace('.', ''));
    return tk('fin.rec.quarterly', { day, months: months.join(', ') });
  }
  if (iv === 'yearly') return tk('fin.rec.yearly', { date: d.toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long' }) });
  return tk('fin.rec.monthly', { day });
}
function finRecurringEntries(startIso, endIso) {
  const todayIso = finTodayIso();
  const to = endIso < todayIso ? endIso : todayIso;
  const out = [];
  if (to < startIso) return out;
  finance.recurring.forEach(r => {
    finRecDates(r, startIso, to).forEach(date => {
      out.push({
        id: 'rec_' + r.id + '_' + date, recurringId: r.id, amount: finRecurringAmountFor(r, date), date,
        category: r.category, title: r.title || '', paidBy: r.paidBy || '', note: r.note || '', items: [], store: '',
        link: r.link || '', contract: r.contract || '', split: Array.isArray(r.split) ? r.split : [],
      });
    });
  });
  return out;
}
// Planned entries: recurring entries AFTER today, up to the end of the year after next (so
// always at least two years ahead). Ended or cancelled entries end with their until.
// They never count as spent – only in future periods and as „noch geplant“.
function finPlanHorizon() { return (new Date().getFullYear() + 2) + '-12-31'; }
function finPlannedEntries(startIso, endIso) {
  const tomorrow = finIsoAddDays(finTodayIso(), 1);
  const from = startIso > tomorrow ? startIso : tomorrow;
  const hz = finPlanHorizon();
  const to = endIso < hz ? endIso : hz;
  const out = [];
  if (!finance || to < from) return out;
  finance.recurring.forEach(r => {
    finRecDates(r, from, to).forEach(date => {
      out.push({
        id: 'plan_' + r.id + '_' + date, recurringId: r.id, amount: finRecurringAmountFor(r, date), date, planned: true,
        category: r.category, title: r.title || '', paidBy: r.paidBy || '', note: r.note || '', items: [], store: '',
        link: r.link || '', contract: r.contract || '', split: Array.isArray(r.split) ? r.split : [],
      });
    });
  });
  return out;
}
function finEntriesInRange(startIso, endIso) {
  const real = ausgaben.filter(e => e.category !== FIN_SETTLE_CATEGORY && e.date >= startIso && e.date <= endIso);
  return real.concat(finRecurringEntries(startIso, endIso));
}

/* ---------- Periods & evaluation ---------- */
function finPeriodRange(period, offset) {
  const now = new Date();
  let start, end, label, short, longShort;
  if (period === 'week') {
    start = startOfWeek(now); start.setDate(start.getDate() + offset * 7);
    end = new Date(start); end.setDate(end.getDate() + 6);
    const kw = finIsoWeek(start);
    const dfmt = (x, y) => x.toLocaleDateString(sysLocale(), y ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: '2-digit', month: '2-digit' });
    label = tk('fin.period.weekLabel', { week: kw, from: dfmt(start), to: dfmt(end, true) });
    short = tk('fin.period.weekShort', { week: kw });
    longShort = tk('fin.period.weekNo', { week: kw });
  } else if (period === 'year') {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(now.getFullYear() + offset, 11, 31);
    label = String(start.getFullYear());
    short = label;
    longShort = label;
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = start.toLocaleDateString(sysLocale(), { month: 'long', year: 'numeric' });
    short = start.toLocaleDateString(sysLocale(), { month: 'short' }).replace('.', '');
    longShort = start.toLocaleDateString(sysLocale(), { month: 'long' });
  }
  start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
  return { start, end, startIso: isoDate(start), endIso: isoDate(end), label, short, longShort, days: Math.round((end - start) / 86400000) + 1 };
}
function finStats(range) {
  // Future period: everything that is due on a recurring basis (planned). Current period: booked up to
  // today, plus separately „noch geplant“ until the end of the period.
  const future = range.startIso > finTodayIso();
  const planned = finPlannedEntries(range.startIso, range.endIso);
  const entries = future ? planned : finEntriesInRange(range.startIso, range.endIso);
  const plannedOut = Math.round(planned.reduce((s, e) => s + Math.max(0, Number(e.amount) || 0), 0) * 100) / 100;
  let total = 0;       // expenses (positive)
  let income = 0;      // income (as a positive value)
  let expenseCount = 0;
  const byCat = new Map();
  const byIncomeCat = new Map();
  const byMember = new Map();
  entries.forEach(e => {
    const amt = Number(e.amount) || 0;
    const cat = finCategory(e.category);
    if (amt < 0) {
      income += -amt;
      const ic = byIncomeCat.get(cat.id) || { cat, total: 0, count: 0 };
      ic.total += -amt; ic.count++;
      byIncomeCat.set(cat.id, ic);
      return;
    }
    total += amt;
    expenseCount++;
    const c = byCat.get(cat.id) || { cat, total: 0, count: 0 };
    c.total += amt; c.count++;
    byCat.set(cat.id, c);
    if (e.paidBy && kassePartById(e.paidBy)) {
      const b = byMember.get(e.paidBy) || { member: kassePartById(e.paidBy), total: 0, count: 0 };
      b.total += amt; b.count++;
      byMember.set(e.paidBy, b);
    }
  });
  total = Math.round(total * 100) / 100;
  income = Math.round(income * 100) / 100;
  return {
    future, planned, plannedOut,
    entries, total, income, expenseCount, balance: Math.round((income - total) * 100) / 100,
    byCat: [...byCat.values()].sort((a, b) => b.total - a.total),
    byIncomeCat: [...byIncomeCat.values()].sort((a, b) => b.total - a.total),
    byMember: [...byMember.values()].sort((a, b) => b.total - a.total),
  };
}

/* ---------- Display ---------- */
// What do expenses/savings show instead of the overview? '' = normal, 'kasse' = no fund yet,
// 'depot' = savings without a depot, 'laden' / 'fehler' = funds not there yet or not reachable
function finEmptyKind() {
  if (isCurrentUserGuest() || !currentUser()) return '';
  if (finTab !== 'ausgaben' && finTab !== 'sparen') return '';
  if (kassenServer === true) {
    if (!kasseIsReal(activeKasse())) return 'kasse';
    if (finTab === 'sparen' && finance && !finDepots().length && !(Array.isArray(finance.savingsGoals) && finance.savingsGoals.length)) return 'depot';
    return '';
  }
  if (kassenServer === null) return kassenLastError ? 'fehler' : 'laden';
  return '';
}
function finEmptyStateHtml(kind) {
  const sparen = finTab === 'sparen';
  const T = {
    kasse: ['💶', tk('fund.empty.title'),
      tk('fund.empty.text') + (sparen ? ' ' + tk('fund.empty.thenDepot') : ''),
      [['kasse', tk('fund.empty.create')]],
      tk('fund.empty.hint')],
    depot: ['📈', tk('depot.empty.title'),
      tk('depot.empty.text'),
      [['depot', tk('depot.empty.create')]],
      tk('depot.empty.belongsTo', { name: kasseDisplayName(activeKasse()) })],
    laden: ['⏳', tk('fund.loading.title'), tk('fund.loading.text'), [], ''],
    fehler: ['⚠️', tk('fund.error.title'), kassenLastError || tk('fund.error.text'), [['retry', tk('common.retry')], ['diag', tk('fund.error.details')]], tk('fund.error.hint')],
  };
  const t = T[kind] || T.kasse;
  return `
    <div class="fin-empty">
      <div class="fin-empty-icon">${t[0]}</div>
      <h3 class="fin-empty-title font-serif">${escapeHtml(t[1])}</h3>
      <p class="fin-empty-text">${escapeHtml(t[2])}</p>
      ${t[3].length ? `<div class="fin-empty-actions">${t[3].map(a => `<button type="button" class="fin-empty-btn" data-fin-empty="${a[0]}">${escapeHtml(a[1])}</button>`).join('')}</div>` : ''}
      ${t[4] ? `<p class="fin-empty-hint">${escapeHtml(t[4])}</p>` : ''}
      ${kind === 'fehler' ? `<pre id="finDiagOut" class="fin-diag hidden"></pre><button type="button" id="finDiagCopy" class="kasse-quick-btn hidden" data-fin-empty="diagcopy">📋 ${escapeHtml(tk('common.copy'))}</button>` : ''}
    </div>`;
}
// Error details: check loading the funds step by step (each step its own request)
let finDiagRunning = false;
async function runKassenDiagnose() {
  const out = document.getElementById('finDiagOut');
  if (!out || finDiagRunning) return;
  finDiagRunning = true;
  out.classList.remove('hidden');
  const u = currentUser();
  // Technical support text: always plain English (it is copied and passed on)
  const lines = [`pinn. ${APP_VERSION} · ${new Date().toISOString()} · profile ${u ? u.id : '?'}`, 'Message: ' + (kassenLastError || '–')];
  const show = () => { const o = document.getElementById('finDiagOut'); if (o) o.textContent = lines.join('\n'); };
  show();
  const step = async (schritt, extra = {}) => {
    const label = schritt + (extra.index != null ? ' ' + extra.index : '');
    lines.push(label + ': …'); show();
    let line;
    let result = null;
    try {
      const res = await apiFetch('/api/pinn/kassen/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ schritt, ...extra }),
      });
      const txt = await res.text();
      let body = null;
      try { body = JSON.parse(txt); } catch (e) { body = null; }
      if (!res.ok || !body || body.error || body.ergebnis === undefined) {
        line = `${label}: ERROR ${res.status} – ${body ? (body.error || body.message || JSON.stringify(body)) : txt.slice(0, 300)}`;
      } else {
        result = body.ergebnis;
        line = `${label}: ${JSON.stringify(result)}`;
      }
    } catch (e) {
      line = `${label}: no connection (${e && e.message})`;
    }
    lines[lines.length - 1] = line;
    show();
    return result;
  };
  try {
    await step('profil');
    await step('liste');
    await step('umzug');
    await step('gruppe');
    const liste = await step('liste');
    const n = Array.isArray(liste) ? Math.min(liste.length, 40) : 0;
    for (let i = 0; i < n; i++) await step('kasse', { index: i });
    await step('antwort');
  } finally {
    finDiagRunning = false;
    lines.push('Done.');
    show();
    const c = document.getElementById('finDiagCopy');
    if (c) c.classList.remove('hidden');
  }
}
document.getElementById('financeScroll').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-fin-empty]');
  if (!b) return;
  const a = b.dataset.finEmpty;
  if (a === 'kasse') openKasseEdit('');
  else if (a === 'depot') openDepotModal();
  else if (a === 'retry') { kassenLastError = ''; renderFinance(); kassenLoad(true); }
  else if (a === 'diag') runKassenDiagnose();
  else if (a === 'diagcopy') { const o = document.getElementById('finDiagOut'); if (o) vtCopyText(o.textContent, tk('fund.error.copied')); }
});

function renderFinance() {
  try { if (vtAutoLink()) Promise.resolve(persistState()).then(vtScheduleServerCheck).catch(() => { /* sent later */ }); } catch (e) { /* ignore */ }
  const section = document.getElementById('financeSection');
  if (!section) return;
  // Expenses and savings: the family group is not a fund -> switch to the first real fund
  if ((finTab === 'ausgaben' || finTab === 'sparen') && kassenActiveMode() && !kasseIsReal(activeKasse())) {
    const s = kasseStandard();
    if (s && s.id !== activeKasseId) { kassenSetActive(s.id); return; }
  }
  renderKassePills();
  // Shared flat without pocket money: tab hidden
  if (finTab === 'taschengeld' && !wgShowAllowanceTab()) finTab = 'ausgaben';
  const allowanceTab = document.getElementById('finTabTaschengeldBtn');
  if (allowanceTab) allowanceTab.classList.toggle('hidden', !wgShowAllowanceTab());
  document.querySelectorAll('.fin-tab-btn').forEach(b => {
    const on = b.dataset.fintab === finTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.getElementById('finPaneAusgaben').classList.toggle('hidden', finTab !== 'ausgaben');
  document.getElementById('finPaneSparen').classList.toggle('hidden', finTab !== 'sparen');
  document.getElementById('finPaneTaschengeld').classList.toggle('hidden', finTab !== 'taschengeld');
  document.getElementById('finPaneVertraege').classList.toggle('hidden', finTab !== 'vertraege');
  document.getElementById('finPeriodBar').classList.toggle('hidden', finTab !== 'ausgaben');
  document.getElementById('finContractBar').classList.toggle('hidden', finTab !== 'vertraege');
  document.getElementById('openExpenseModalBtn').textContent = finTab === 'sparen' ? tk('fin.add.deposit') : finTab === 'taschengeld' ? tk('fin.add.pocket') : finTab === 'vertraege' ? tk('fin.add.contract') : tk('fin.add.entry');
  const finSettingsBtn = document.getElementById('openFinanceSettingsBtn');
  const finSettingsTitle = finTab === 'vertraege' ? tk('fin.settings.contractCats') : tk('fin.settings.title');
  finSettingsBtn.title = finSettingsTitle;
  finSettingsBtn.setAttribute('aria-label', finSettingsTitle);
  const emptyKind = finEmptyKind();
  document.getElementById('finPeriodBar').classList.toggle('hidden', finTab !== 'ausgaben' || !!emptyKind);
  document.getElementById('openExpenseModalBtn').classList.toggle('hidden', !!emptyKind);
  finSettingsBtn.classList.toggle('hidden', !!emptyKind && emptyKind !== 'depot');
  if (finTab === 'ausgaben' && emptyKind) {
    document.getElementById('finBudgetCard').innerHTML = finEmptyStateHtml(emptyKind);
    ['finSplitCard', 'finTrendCard', 'finExpenseListCard'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
    return;
  }
  if (finTab === 'sparen') { renderSavings(); return; }
  if (finTab === 'taschengeld') { renderAllowances(); return; }
  if (finTab === 'vertraege') { renderContracts(); return; }
  loadFinDocs(); // in the background: receipts attached to expenses (📎 in the list)
  document.querySelectorAll('.fin-period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === finPeriod));
  const range = finPeriodRange(finPeriod, finOffset);
  document.getElementById('finPeriodLabel').textContent = range.label;
  document.getElementById('finTodayBtn').classList.toggle('invisible', finOffset === 0);
  const stats = finStats(range);
  renderFinanceBudgetCard(range, stats);
  renderKasseSplitCard();
  renderFinanceTrend();
  renderFinanceList(range, stats);
}

function finBarSegment(pct, color, text, extraClass = '') {
  if (pct <= 0) return '';
  const label = pct >= 16 ? escapeHtml(text) : '';
  return `<div class="${extraClass}" style="width:${pct}%;background:${color}">${label}</div>`;
}

function renderFinanceBudgetCard(range, stats) {
  const el = document.getElementById('finBudgetCard');
  const bInfo = finBudgetInfo(finPeriod, range);
  const budget = bInfo.budget;
  const bForm = finBudgetFormula(bInfo);
  const total = stats.total;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isCurrent = today >= range.start && today <= range.end;
  const isFuture = range.start > today;
  const daysElapsed = isCurrent ? Math.round((today - range.start) / 86400000) + 1 : (isFuture ? 0 : range.days);
  const daysLeft = isCurrent ? range.days - daysElapsed + 1 : 0;

  let headRight = '', barHtml = '', infoLine = '';
  if (budget) {
    const rest = Math.round((budget - total) * 100) / 100;
    if (rest >= 0) {
      const redPct = total > 0 ? Math.max(total / budget * 100, 1.5) : 0;
      barHtml = `<div class="fin-bar">${finBarSegment(redPct, FIN_RED, fmtEur0(total))}${finBarSegment(100 - redPct, FIN_GREEN, fmtEur0(rest))}</div>`;
      headRight = `<div class="text-right"><div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('fin.budget.available'))}</div><div class="font-serif text-2xl" style="color:${FIN_GREEN}">${fmtEur(rest)}</div></div>`;
    } else {
      const budgetPct = budget / total * 100;
      barHtml = `<div class="fin-bar">${finBarSegment(budgetPct, FIN_RED, fmtEur0(budget))}${finBarSegment(100 - budgetPct, '', '+' + fmtEur0(-rest), 'fin-over')}<span class="fin-bar-marker" style="left:${budgetPct}%"></span></div>`;
      headRight = `<div class="text-right"><div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('fin.budget.overTitle'))}</div><div class="font-serif text-2xl" style="color:${FIN_RED}">${fmtEur(-rest)}</div></div>`;
    }
    const pctUsed = Math.round(total / budget * 100);
    const bText = escapeHtml(tk('fin.budget.label', { amount: fmtEur(budget), formula: bForm }));
    if (isCurrent && rest > 0) {
      infoLine = `${bText} · ${escapeHtml(tk('fin.budget.pctUsed', { pct: pctUsed }))} · ${escapeHtml(tk('fin.budget.daysLeft', { n: daysLeft }))} · ${tk('fin.budget.perDay', { amount: '<b>' + escapeHtml(fmtEur(rest / daysLeft)) + '</b>' })}`;
    } else if (isCurrent) {
      infoLine = `${bText} · ${escapeHtml(tk('fin.budget.pctUsed', { pct: pctUsed }))}`;
    } else if (isFuture) {
      infoLine = `${bText} · ${escapeHtml(tk('fin.budget.plannedFromRec'))}`;
    } else {
      infoLine = rest >= 0 ? `${bText} · ${escapeHtml(tk('fin.budget.kept'))} · ${escapeHtml(tk('fin.budget.pctUsed', { pct: pctUsed }))}` : `${bText} · ${escapeHtml(tk('fin.budget.exceededBy', { amount: fmtEur(-rest) }))}`;
    }
  } else {
    if (total > 0) {
      barHtml = `<div class="fin-bar">${stats.byCat.map(c => finBarSegment(c.total / total * 100, c.cat.color, c.cat.icon)).join('')}</div>`;
    } else {
      barHtml = `<div class="fin-bar"></div>`;
    }
    headRight = `<button type="button" id="finSetBudgetBtn" class="shrink-0 px-3 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('fin.budget.adjust'))}</button>`;
    infoLine = (bInfo.income > 0 || bInfo.adjust)
      ? escapeHtml(tk('fin.budget.noneLeft', { formula: bForm }))
      : escapeHtml(tk('fin.budget.noIncome'));
  }

  let detailHtml = '';
  if (finDetailOpen) detailHtml = finDetailHtml(range, stats, budget, { isCurrent, daysElapsed });

  el.innerHTML = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(stats.future ? tk('fin.stat.planned') : tk('fin.stat.spent'))}</div>
          <div class="font-serif text-2xl" style="color:${total > 0 ? FIN_RED : 'inherit'}">${fmtEur(total)}</div>
          ${!stats.future && stats.plannedOut > 0 ? `<div class="text-xs mt-0.5 text-ink/50">${escapeHtml(tk('fin.stat.stillPlanned', { amount: fmtEur(stats.plannedOut) }))}</div>` : ''}
          ${stats.income > 0 ? `<div class="text-xs mt-0.5"><span style="color:${FIN_GREEN}">${escapeHtml(tk('fin.stat.incomePlus', { amount: fmtEur(stats.income) }))}</span> <span class="text-ink/45">· ${escapeHtml(tk('fin.stat.balance'))} <b style="color:${stats.balance >= 0 ? FIN_GREEN : FIN_RED}">${stats.balance >= 0 ? '+' : '−'} ${fmtEur(Math.abs(stats.balance))}</b></span></div>` : ''}
        </div>
        ${headRight}
      </div>
      <button type="button" id="finBarToggle" class="w-full text-left select-none" aria-expanded="${finDetailOpen}">
        ${barHtml}
        <div class="flex items-center justify-between gap-2 mt-2">
          <span class="text-xs text-ink/50 min-w-0">${infoLine}</span>
          <span class="shrink-0 text-xs text-pine">${escapeHtml(finDetailOpen ? tk('fin.stat.less') : tk('fin.stat.details'))}</span>
        </div>
      </button>
      ${detailHtml}
    </div>
  `;

  document.getElementById('finBarToggle').addEventListener('click', () => { finDetailOpen = !finDetailOpen; renderFinance(); });
  const setBtn = document.getElementById('finSetBudgetBtn');
  if (setBtn) setBtn.addEventListener('click', () => openFinanceSettings(true));
  el.querySelectorAll('.fin-cat-row').forEach(row => {
    row.addEventListener('click', () => {
      finCategoryFilter = finCategoryFilter === row.dataset.cat ? null : row.dataset.cat;
      renderFinance();
      if (finCategoryFilter) document.getElementById('finExpenseListCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function finDetailHtml(range, stats, budget, { isCurrent, daysElapsed }) {
  const total = stats.total;
  const count = stats.expenseCount;
  const tiles = [];
  const perDayBase = isCurrent ? daysElapsed : range.days;
  tiles.push([escapeHtml(tk('fin.stat.avgPerDay')), perDayBase > 0 ? fmtEur(total / perDayBase) : '–', '']);
  if (isCurrent && daysElapsed >= 2 && total > 0) {
    const forecast = total / daysElapsed * range.days;
    const note = budget ? (forecast > budget ? `<span style="color:${FIN_RED}">${escapeHtml(tk('fin.stat.overBudget'))}</span>` : `<span style="color:${FIN_GREEN}">${escapeHtml(tk('fin.stat.inBudget'))}</span>`) : escapeHtml(tk('fin.stat.untilEnd'));
    tiles.push([escapeHtml(tk('fin.stat.forecast')), fmtEur0(forecast), note]);
  } else {
    const biggest = stats.entries.filter(e => !finIsIncome(e)).sort((a, b) => b.amount - a.amount)[0];
    tiles.push([escapeHtml(tk('fin.stat.biggest')), biggest ? fmtEur(biggest.amount) : '–', biggest ? escapeHtml(finEntryTitle(biggest)) : '']);
  }
  const prev = finStats(finPeriodRange(finPeriod, finOffset - 1));
  if (prev.total > 0) {
    const diff = (total - prev.total) / prev.total * 100;
    const up = diff > 0;
    tiles.push([escapeHtml(finPeriod === 'week' ? tk('fin.stat.vsPrevWeek') : finPeriod === 'year' ? tk('fin.stat.vsPrevYear') : tk('fin.stat.vsPrevMonth')), `<span style="color:${up ? FIN_RED : FIN_GREEN}">${up ? '▲' : '▼'} ${Math.abs(Math.round(diff))} %</span>`, escapeHtml(tk('fin.stat.before', { amount: fmtEur0(prev.total) }))]);
  } else {
    tiles.push([escapeHtml(finPeriod === 'week' ? tk('fin.stat.prevWeek') : finPeriod === 'year' ? tk('fin.stat.prevYear') : tk('fin.stat.prevMonth')), '–', escapeHtml(tk('fin.stat.noData'))]);
  }
  tiles.push([escapeHtml(tk('fin.expenses')), String(count), count ? 'Ø ' + fmtEur(total / count) : '']);
  if (stats.income > 0) {
    tiles.push([escapeHtml(tk('fin.income')), `<span style="color:${FIN_GREEN}">+ ${fmtEur(stats.income)}</span>`, escapeHtml(tk('fin.entriesN', { n: stats.byIncomeCat.reduce((s, c) => s + c.count, 0) }))]);
    tiles.push([escapeHtml(tk('fin.stat.balance')), `<span style="color:${stats.balance >= 0 ? FIN_GREEN : FIN_RED}">${stats.balance >= 0 ? '+' : '−'} ${fmtEur(Math.abs(stats.balance))}</span>`, escapeHtml(tk('fin.stat.balanceFormula'))]);
  }

  const tilesHtml = tiles.map(([k, v, s]) => `
    <div class="rounded-xl bg-ink/5 px-3 py-2.5 min-w-0">
      <div class="text-[10px] uppercase tracking-wide text-ink/40 truncate">${k}</div>
      <div class="text-base font-semibold leading-tight mt-0.5">${v}</div>
      ${s ? `<div class="text-[11px] text-ink/50 truncate">${s}</div>` : ''}
    </div>`).join('');

  let catHtml = '';
  if (stats.byCat.length) {
    const stack = `<div class="flex h-2.5 rounded-full overflow-hidden mb-3 bg-ink/5">${stats.byCat.map(c => `<div style="width:${c.total / total * 100}%;background:${c.cat.color}"></div>`).join('')}</div>`;
    const rows = stats.byCat.map(c => {
      const share = Math.round(c.total / total * 100);
      const catBudget = finBudgetFor(c.cat.budget, finPeriod);
      let sub = '', mini = '';
      if (catBudget) {
        const rest = catBudget - c.total;
        const redPct = Math.min(100, c.total / catBudget * 100);
        mini = `<div class="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-ink/5"><div style="width:${redPct}%;background:${FIN_RED}"></div><div style="width:${100 - redPct}%;background:${FIN_GREEN}"></div></div>`;
        sub = rest >= 0 ? escapeHtml(tk('fin.cat.leftOf', { amount: fmtEur(rest), budget: fmtEur0(catBudget) })) : `<span style="color:${FIN_RED}">${escapeHtml(tk('fin.cat.overOf', { amount: fmtEur(-rest), budget: fmtEur0(catBudget) }))}</span>`;
      } else {
        mini = `<div class="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-ink/5"><div style="width:${share}%;background:${c.cat.color}"></div></div>`;
        sub = escapeHtml(tk('fin.entriesN', { n: c.count }));
      }
      const active = finCategoryFilter === c.cat.id;
      return `
        <button type="button" class="fin-cat-row w-full text-left flex items-center gap-3 rounded-xl px-2 py-2 transition ${active ? 'bg-pine/10 ring-1 ring-pine/40' : 'hover:bg-ink/5'}" data-cat="${escapeHtml(c.cat.id)}">
          <span class="shrink-0 w-9 h-9 rounded-full grid place-items-center text-lg" style="background:${c.cat.color}22">${escapeHtml(c.cat.icon || '')}</span>
          <span class="flex-1 min-w-0">
            <span class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-medium truncate">${escapeHtml(c.cat.label)}</span>
              <span class="text-sm font-semibold shrink-0">${fmtEur(c.total)}</span>
            </span>
            ${mini}
            <span class="flex justify-between gap-2 text-[11px] text-ink/45 mt-1"><span class="truncate">${sub}</span><span class="shrink-0">${share} %</span></span>
          </span>
        </button>`;
    }).join('');
    catHtml = `<h4 class="text-xs uppercase tracking-wide text-ink/40 mt-5 mb-2">${escapeHtml(tk('fin.byCategory'))}</h4>${stack}<div class="flex flex-col gap-0.5">${rows}</div>`;
  }

  let incomeHtml = '';
  if (stats.byIncomeCat.length) {
    const rows = stats.byIncomeCat.map(c => {
      const share = Math.round(c.total / stats.income * 100);
      const active = finCategoryFilter === c.cat.id;
      return `
        <button type="button" class="fin-cat-row w-full text-left flex items-center gap-3 rounded-xl px-2 py-2 transition ${active ? 'bg-pine/10 ring-1 ring-pine/40' : 'hover:bg-ink/5'}" data-cat="${escapeHtml(c.cat.id)}">
          <span class="shrink-0 w-9 h-9 rounded-full grid place-items-center text-lg" style="background:${c.cat.color}22">${escapeHtml(c.cat.icon || '')}</span>
          <span class="flex-1 min-w-0">
            <span class="flex items-baseline justify-between gap-2">
              <span class="text-sm font-medium truncate">${escapeHtml(c.cat.label)}</span>
              <span class="text-sm font-semibold shrink-0" style="color:${FIN_GREEN}">+ ${fmtEur(c.total)}</span>
            </span>
            <div class="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-ink/5"><div style="width:${share}%;background:${FIN_GREEN}"></div></div>
            <span class="flex justify-between gap-2 text-[11px] text-ink/45 mt-1"><span class="truncate">${escapeHtml(tk('fin.entriesN', { n: c.count }))}</span><span class="shrink-0">${share} %</span></span>
          </span>
        </button>`;
    }).join('');
    incomeHtml = `<h4 class="text-xs uppercase tracking-wide text-ink/40 mt-5 mb-2">${escapeHtml(tk('fin.income'))}</h4><div class="flex flex-col gap-0.5">${rows}</div>`;
  }

  let memberHtml = '';
  if (stats.byMember.length) {
    memberHtml = `<h4 class="text-xs uppercase tracking-wide text-ink/40 mt-5 mb-2">${escapeHtml(tk('fin.paidBy'))}</h4><div class="flex flex-wrap gap-2">${stats.byMember.map(b => `
      <span class="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-ink/5 text-xs">
        <span class="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(b.member)}">${memberAvatarInnerHTML(b.member)}</span>
        <span>${escapeHtml(memberLabel(b.member))}</span><b>${fmtEur(b.total)}</b>
      </span>`).join('')}</div>`;
  }

  return `
    <div class="mt-4 pt-4 border-t border-ink/10 fade-in">
      <div class="grid grid-cols-2 ${tiles.length > 4 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'} gap-2">${tilesHtml}</div>
      ${catHtml || (incomeHtml ? '' : '<p class="text-sm text-ink/40 italic mt-4">' + escapeHtml(tk('fin.noExpensesInPeriod')) + '</p>')}
      ${incomeHtml}
      ${memberHtml}
    </div>`;
}

function renderFinanceTrend() {
  const el = document.getElementById('finTrendCard');
  const n = finPeriod === 'week' ? 8 : finPeriod === 'year' ? 5 : 12;
  let endOff = Math.min(0, finOffset + Math.floor((n - 1) / 3));
  if (endOff < finOffset) endOff = finOffset;
  const cols = [];
  for (let off = endOff - n + 1; off <= endOff; off++) {
    const range = finPeriodRange(finPeriod, off);
    const stats = finStats(range);
    const budget = finBudgetInfo(finPeriod, range).budget;
    cols.push({ off, range, total: stats.total, budget });
  }
  const maxVal = Math.max(1, ...cols.map(c => Math.max(c.total, c.budget || 0)));
  const todayIsoT = finTodayIso();
  cols.forEach(c => { c.future = c.range.startIso > todayIsoT; });
  const withData = cols.filter(c => c.total > 0 && !c.future);
  const avg = withData.length ? withData.reduce((s, c) => s + c.total, 0) / withData.length : 0;
  const H = 128;
  const bars = cols.map(c => {
    const redH = c.total / maxVal * H;
    const greenH = (c.budget && c.total < c.budget) ? (c.budget - c.total) / maxVal * H : 0;
    const overLine = (c.budget && c.total > c.budget) ? `<span class="fin-trend-budgetline" style="bottom:${c.budget / maxVal * H}px"></span>` : '';
    const selected = c.off === finOffset;
    let label = c.range.short;
    // Always reserve the year row so all bars stand at the same height
    if (finPeriod === 'month') label += `<span class="block text-[9px] leading-tight text-ink/35">${(c.range.start.getMonth() === 0 || c.off === endOff - n + 1) ? c.range.start.getFullYear() : '&nbsp;'}</span>`;
    return `
      <button type="button" class="fin-trend-col flex-1 min-w-0 flex flex-col items-center gap-1 select-none${c.future ? ' fin-trend-future' : ''}" data-off="${c.off}" title="${escapeHtml(c.range.label + ': ' + fmtEur(c.total) + (c.future ? ' (' + tk('fin.plannedLower') + ')' : ''))}">
        <span class="text-[10px] ${selected ? 'font-semibold text-ink' : 'text-ink/45'} whitespace-nowrap leading-none h-3" style="display:block;height:12px">${c.total > 0 ? curPlain0(c.total) : ''}</span>
        <span class="fin-trend-track ${selected ? 'selected' : ''}" style="height:${H}px">
          <span class="fin-trend-stack">
            <span style="height:${greenH}px;background:${FIN_GREEN};opacity:${selected ? 1 : 0.55}"></span>
            <span style="height:${redH}px;background:${FIN_RED};opacity:${selected ? 1 : 0.7}"></span>
          </span>
          ${overLine}
        </span>
        <span class="text-[10px] leading-tight text-center ${selected ? 'font-semibold text-pine' : 'text-ink/45'}">${label}</span>
      </button>`;
  }).join('');

  el.innerHTML = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-baseline justify-between gap-3 mb-3">
        <h3 class="font-serif text-base">${escapeHtml(tk('fin.trend.title'))}</h3>
        <span class="text-xs text-ink/45">${avg ? escapeHtml(finPeriod === 'week' ? tk('fin.trend.avgWeek', { amount: fmtEur0(avg) }) : finPeriod === 'year' ? tk('fin.trend.avgYear', { amount: fmtEur0(avg) }) : tk('fin.trend.avgMonth', { amount: fmtEur0(avg) })) : ''}</span>
      </div>
      <div class="flex items-start gap-1 sm:gap-2">${bars}</div>
      <div class="flex items-center gap-4 mt-3 text-[11px] text-ink/50">
        <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${FIN_RED}"></span>${escapeHtml(tk('fin.expenses'))}</span>
        ${cols.some(c => c.budget) ? `<span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${FIN_GREEN}"></span>${escapeHtml(tk('fin.trend.rest'))}</span>` : ''}
      </div>
    </div>`;
  el.querySelectorAll('.fin-trend-col').forEach(btn => btn.addEventListener('click', () => {
    finOffset = Number(btn.dataset.off);
    renderFinance();
  }));
}

function finEntryTitle(e) {
  return finLegacyTitle(e.title) || e.store || finCategory(e.category).label;
}
// Titles that older versions stored in German (imports) are shown in the app language
const FIN_LEGACY_TITLES = { 'Kauf (Import)': 'depot.purchaseImport', 'Verkauf (Import)': 'depot.saleImport', 'Kauf': 'depot.purchase', 'Verkauf': 'depot.sale' };
function finLegacyTitle(t) {
  const k = t && FIN_LEGACY_TITLES[String(t).trim()];
  return k ? tk(k) : (t || '');
}
function finDayLabel(iso) {
  const today = finTodayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === today) return tk('common.today');
  if (iso === isoDate(y)) return tk('fin.yesterday');
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

function renderFinanceList(range, stats) {
  const el = document.getElementById('finExpenseListCard');
  let entries = stats.future ? stats.entries.slice() : stats.entries.concat(stats.planned);
  const filterCat = finCategoryFilter ? finCategory(finCategoryFilter) : null;
  if (filterCat) entries = entries.filter(e => finCategory(e.category).id === filterCat.id);
  entries.sort((a, b) => (a.date === b.date ? String(b.created || '').localeCompare(String(a.created || '')) : (a.date < b.date ? 1 : -1)));
  const pendingCount = finQueueRead().length;

  const groups = [];
  entries.forEach(e => {
    let g = groups[groups.length - 1];
    if (!g || g.date !== e.date) { g = { date: e.date, items: [], out: 0, in: 0 }; groups.push(g); }
    g.items.push(e);
    const amt = Number(e.amount) || 0;
    if (amt < 0) g.in += -amt; else g.out += amt;
  });

  const listHtml = groups.map(g => `
    <div class="mt-3 first:mt-0">
      <div class="flex items-baseline justify-between text-[11px] uppercase tracking-wide text-ink/40 px-1 mb-1">
        <span>${escapeHtml(finDayLabel(g.date))}</span><span>${g.out > 0 ? fmtEur(g.out) : ''}${g.out > 0 && g.in > 0 ? ' · ' : ''}${g.in > 0 ? `<span style="color:${FIN_GREEN}">+ ${fmtEur(g.in)}</span>` : ''}</span>
      </div>
      ${g.items.map(e => {
        const cat = finCategory(e.category);
        const member = e.paidBy ? kassePartById(e.paidBy) : null;
        const subParts = [];
        if (e.title && e.store) subParts.push(escapeHtml(e.store));
        subParts.push(escapeHtml(cat.label));
        if (e.items && e.items.length) subParts.push(tk('fin.itemsN', { n: e.items.length }));
        const linkLabel = finLinkLabel(e.link);
        if (linkLabel) subParts.push(escapeHtml(linkLabel));
        if (member) subParts.push(escapeHtml(memberLabel(member)));
        const kSplit = kasseSplitLabel(e);
        if (kSplit) subParts.push(kSplit);
        if (e.planned) subParts.unshift('<span class="fin-plan-chip">geplant</span>');
        return `
          <button type="button" class="fin-entry w-full flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-ink/5 transition text-left${e.planned ? ' fin-planned' : ''}" data-id="${escapeHtml(e.id)}" data-rec="${escapeHtml(e.recurringId || '')}">
            <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-lg" style="background:${cat.color}22">${escapeHtml(cat.icon || '')}</span>
            <span class="flex-1 min-w-0">
              <span class="block text-sm font-medium truncate">${e.recurringId ? (e.contract && vtContract(e.contract) ? '📄 ' : '🔁 ') : ''}${escapeHtml(finEntryTitle(e))}${!e.recurringId && finDocsFor('ausgabe:' + e.id).length ? ' <span class="text-xs text-ink/45" title="' + escapeHtml(tk('fin.hasReceipt')) + '">📎</span>' : ''}</span>
              <span class="block text-xs text-ink/45 truncate">${subParts.join(' · ')}</span>
            </span>
            <span class="shrink-0 text-sm font-semibold"${finIsIncome(e) ? ` style="color:${FIN_GREEN}"` : ''}>${e.pending ? '<span title="' + escapeHtml(tk('fin.notSynced')) + '">⏳</span> ' : ''}${finIsIncome(e) ? '+ ' + fmtEur(-e.amount) : fmtEur(e.amount)}</span>
          </button>`;
      }).join('')}
    </div>`).join('');

  el.innerHTML = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h3 class="font-serif text-base">${escapeHtml(tk('fin.entries'))} <span class="text-xs text-ink/40 font-sans">${entries.length || ''}</span></h3>
        ${filterCat ? `<button type="button" id="finClearFilterBtn" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-pine/10 text-pine">${escapeHtml(filterCat.icon + ' ' + filterCat.label)} <span class="text-sm leading-none">×</span></button>` : ''}
      </div>
      ${pendingCount ? `<p class="text-xs text-mustard mb-2">⏳ ${escapeHtml(tk('fin.pendingN', { n: pendingCount }))}</p>` : ''}
      ${entries.length ? listHtml : `<p class="text-sm text-ink/40 italic">${escapeHtml(filterCat ? tk('fin.noEntriesInCat') : tk('fin.noEntriesInPeriod'))}</p>`}
    </div>`;

  const clearBtn = document.getElementById('finClearFilterBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => { finCategoryFilter = null; renderFinance(); });
  el.querySelectorAll('.fin-entry').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.rec) {
      const r = finance.recurring.find(x => x.id === btn.dataset.rec);
      if (r) openExpenseModal({ recurring: r });
      return;
    }
    const e = ausgaben.find(x => x.id === btn.dataset.id);
    if (e) openExpenseModal({ expense: e });
  }));
}

/* ---------- Category picker (expense & finishing a shopping trip) ---------- */
// Remembers per select field what should happen on a selection (for „+ Eigene“)
const finPickerHandlers = {};
function renderFinCategoryPicker(containerId, selectedId, onSelect) {
  finPickerHandlers[containerId] = onSelect;
  const wrap = document.getElementById(containerId);
  const cats = finActiveCategories().slice();
  const selected = finCategory(selectedId);
  if (selected && !cats.some(c => c.id === selected.id)) cats.push(selected);
  wrap.innerHTML = cats.map(c => `
    <button type="button" class="fin-cat-chip flex flex-col items-center gap-0.5 rounded-xl border border-ink/10 px-1 py-2 text-center transition ${c.id === selectedId ? 'active' : ''}" data-cat="${escapeHtml(c.id)}" style="--cat:${c.color}">
      <span class="text-xl leading-none">${escapeHtml(c.icon || '')}</span>
      <span class="text-[10px] leading-tight text-ink/70 w-full truncate">${escapeHtml(c.label)}</span>
    </button>`).join('') + `
    <button type="button" class="fin-cat-chip fin-cat-add flex flex-col items-center gap-0.5 rounded-xl border border-ink/25 px-1 py-2 text-center text-ink/50 hover:text-pine hover:border-pine transition" data-action="add">
      <span class="text-xl leading-none">＋</span>
      <span class="text-[10px] leading-tight w-full truncate">${escapeHtml(tk('fin.cat.own'))}</span>
    </button>`;
  wrap.querySelectorAll('.fin-cat-chip[data-cat]').forEach(btn => btn.addEventListener('click', () => {
    wrap.querySelectorAll('.fin-cat-chip[data-cat]').forEach(b => b.classList.toggle('active', b === btn));
    finHideNewCategoryForm(containerId);
    onSelect(btn.dataset.cat);
  }));
  wrap.querySelector('[data-action="add"]').addEventListener('click', () => finShowNewCategoryForm(containerId));
  finHideNewCategoryForm(containerId);
}
function finNewCategoryFormEl(containerId) {
  const wrap = document.getElementById(containerId);
  let form = document.getElementById(containerId + 'NewCat');
  if (!form) {
    form = document.createElement('div');
    form.id = containerId + 'NewCat';
    form.className = 'hidden -mt-2 mb-4 rounded-xl border border-ink/15 p-2.5';
    form.innerHTML = `
      <div class="text-[11px] uppercase tracking-wide text-ink/40 mb-1.5">${escapeHtml(tk('fin.cat.ownTitle'))}</div>
      <div class="flex items-center gap-2">
        <input type="text" data-field="icon" maxlength="4" value="🏷️" class="w-11 shrink-0 rounded-lg border border-ink/15 px-1 py-1.5 text-center text-lg" aria-label="${escapeHtml(tk('fin.cat.symbol'))}" />
        <input type="text" data-field="label" maxlength="40" placeholder="${escapeHtml(tk('fin.cat.namePh'))}" autocomplete="off" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('fin.cat.nameLabel'))}" />
      </div>
      <p data-field="error" class="hidden text-xs text-red-500 mt-1.5"></p>
      <div class="flex items-center justify-end gap-2 mt-2">
        <button type="button" data-action="cancel" class="px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:bg-ink/5 transition">${escapeHtml(tk('common.cancel'))}</button>
        <button type="button" data-action="create" class="px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition">${escapeHtml(tk('common.create'))}</button>
      </div>`;
    wrap.insertAdjacentElement('afterend', form);
    form.querySelector('[data-action="cancel"]').addEventListener('click', () => finHideNewCategoryForm(containerId));
    form.querySelector('[data-action="create"]').addEventListener('click', () => finCreateCategoryFromForm(containerId));
    form.querySelector('[data-field="label"]').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); finCreateCategoryFromForm(containerId); }
    });
  }
  return form;
}
function finShowNewCategoryForm(containerId) {
  const form = finNewCategoryFormEl(containerId);
  form.querySelector('[data-field="icon"]').value = '🏷️';
  form.querySelector('[data-field="label"]').value = '';
  form.querySelector('[data-field="error"]').classList.add('hidden');
  form.classList.remove('hidden');
  const inp = form.querySelector('[data-field="label"]');
  setTimeout(() => { inp.focus(); form.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30);
}
function finHideNewCategoryForm(containerId) {
  const form = document.getElementById(containerId + 'NewCat');
  if (form) form.classList.add('hidden');
}
function finCreateCategoryFromForm(containerId) {
  const form = finNewCategoryFormEl(containerId);
  const label = form.querySelector('[data-field="label"]').value.replace(/\s+/g, ' ').trim().slice(0, 40);
  const icon = form.querySelector('[data-field="icon"]').value.trim() || '🏷️';
  const errEl = form.querySelector('[data-field="error"]');
  if (!label) { errEl.textContent = tk('common.needName'); errEl.classList.remove('hidden'); return; }
  // If the category already exists (even hidden), it is used instead of being created twice
  let cat = finance.categories.find(c => String(c.label || '').toLowerCase() === label.toLowerCase());
  if (cat) {
    if (cat.active === false) finance.categories = finance.categories.map(c => c.id === cat.id ? { ...c, active: true } : c);
  } else {
    cat = { id: 'k' + newRecordId().slice(0, 10), label, icon, color: FIN_CUSTOM_PALETTE[finance.categories.length % FIN_CUSTOM_PALETTE.length], active: true, budget: null };
    const idx = finance.categories.findIndex(c => c.id === 'sonstiges');
    const cats = finance.categories.slice();
    if (idx >= 0) cats.splice(idx, 0, cat); else cats.push(cat);
    finance.categories = cats;
  }
  persistState();
  // If the finance settings are open right now, add it there too (otherwise it would be lost on saving)
  if (finSettingsDraft) {
    const d = finSettingsDraft.find(c => c.id === cat.id);
    if (d) d.active = true;
    else {
      const idx = finSettingsDraft.findIndex(c => c.id === 'sonstiges');
      if (idx >= 0) finSettingsDraft.splice(idx, 0, { ...cat }); else finSettingsDraft.push({ ...cat });
    }
    renderFinCategoryEditor();
  }
  const onSelect = finPickerHandlers[containerId];
  renderFinCategoryPicker(containerId, cat.id, onSelect);
  if (onSelect) onSelect(cat.id, true);
  finShowToast(tk('fin.cat.created', { name: cat.label }));
}
// kasse (optional): its guests without a profile are offered in addition
function fillFinPaidBySelect(selectId, value, kasse) {
  const sel = document.getElementById(selectId);
  const guests = kasse ? kasseGuests(kasse) : [];
  const old = (value && kasseIsGuestId(value) && !guests.some(g => g.id === value)) ? kasseGuestById(value) : null;
  const gOpts = guests.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('')
    + (old ? `<option value="${escapeHtml(old.id)}">${escapeHtml(old.name)}${old.removed ? ' (' + escapeHtml(tk('fin.removedLower')) + ')' : ''}</option>` : '');
  sel.innerHTML = '<option value="">–</option>' + members.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</option>`).join('')
    + (gOpts ? `<optgroup label="Gäste">${gOpts}</optgroup>` : '');
  sel.value = (value && (memberById(value) || guests.some(g => g.id === value) || old)) ? value : '';
  sel.closest('.fin-paidby-wrap').classList.toggle('hidden', !members.length && !gOpts);
}
function finAutoFocusAmount(input) {
  // Do not focus automatically on phones (otherwise the keyboard jumps over the popup)
  if (!isMobile()) setTimeout(() => input.focus(), 50);
}

/* ---------- Popup: expense / recurring expense ---------- */
let editingExpenseId = null;
let editingRecurringId = null;
let expenseModalCategory = 'sonstiges';
let expenseModalExtra = { store: '', listId: '', items: [], createdBy: '' };
let expenseModalMode = { recurring: false, existing: false, asRecurring: false };
let expenseCategoryTouched = false; // Category chosen by the user? Then do not switch automatically on minus
let expenseModalLink = '';
let expenseLinkAuto = false;       // Assignment set automatically from the description (may still change while typing)
let expenseLinkTouched = false;    // Position chosen by the user (then no longer automatically from the description)
let expenseDepotTouched = false;   // Depot chosen by the user or preset (automatic assignment only within this depot)
// Assignment: 'spar:<position>' or 'depot:<depot>' (category Sparen) or 'kind:<member>' (category Kinder)

// preset: { category, link, amount (negative = income/withdrawal), title } - e.g. from within „Sparen“
function openExpenseModal({ expense = null, recurring = null, asRecurring = false, preset = null } = {}) {
  // Pocket money has its own popup
  if (recurring && recurring.allowanceFor) { openAllowanceModal(recurring.allowanceFor); return; }
  // Costs of a contract: changes go through the contract (Finance → Contracts)
  if (recurring && recurring.contract && vtContract(recurring.contract)) { openContractDetail(recurring.contract); return; }
  // Fuel, workshop & co. from „Fahrzeuge“: changes go through the vehicle entry
  if (expense && fzLogById(expense.id)) { fzOpenLogModal({ logId: expense.id }); return; }
  editingExpenseId = expense ? expense.id : null;
  editingRecurringId = recurring ? recurring.id : null;
  const isRec = !!recurring || asRecurring;
  const src = expense || recurring || preset || {};
  expenseModalCategory = src.category || finDefaultExpenseCategory();
  expenseCategoryTouched = !!(expense || recurring || (preset && preset.category));
  expenseModalLink = src.link || '';
  expenseLinkAuto = false;
  // Savings: assign older entries without assignment to a position by name/ISIN, as in the evaluation
  if ((src.category || '') === FIN_SAVINGS_CATEGORY) expenseModalLink = finResolveSavingsLink({ link: expenseModalLink, title: src.title || '', note: src.note || '' });
  expenseLinkTouched = /^spar:/.test(expenseModalLink);
  expenseDepotTouched = /^(spar|depot):/.test(expenseModalLink);
  expenseModalMode = { recurring: !!recurring, existing: !!expense, asRecurring: !!asRecurring };
  expenseModalExtra = { store: src.store || '', listId: src.listId || '', items: Array.isArray(src.items) ? src.items : [], createdBy: src.createdBy || '' };

  const amountInput = document.getElementById('expenseAmountInput');
  amountInput.value = recurring ? euroInputValue(finRecurringAmountFor(recurring, finTodayIso()))
    : (preset && preset.amountText != null ? preset.amountText : euroInputValue(src.amount));
  document.getElementById('expenseTitleInput').value = src.title || '';
  document.getElementById('expenseStoreInput').value = src.store || '';
  document.getElementById('expenseNoteInput').value = src.note || '';
  let dateVal = finTodayIso();
  if (expense) dateVal = expense.date;
  if (recurring) dateVal = finRecStart(recurring) || finTodayIso();
  document.getElementById('expenseDateInput').value = dateVal;
  fillFinPaidBySelect('expensePaidBySelect', src.paidBy || (!expense && !recurring && currentMember() ? currentMember().id : ''), kassenActiveMode() ? activeKasse() : null);
  renderFinCategoryPicker('expenseCategoryPicker', expenseModalCategory, finOnExpenseCategoryPicked);
  kasseSplitSetupExpense(src);

  const repeatSel = document.getElementById('expenseRepeatSelect');
  repeatSel.value = recurring ? finRecInterval(recurring) : (asRecurring ? 'monthly' : '');
  // For an existing recurring entry only the rhythm can be changed, not „Einmalig“
  const onceOpt = repeatSel.querySelector('option[value=""]');
  onceOpt.disabled = !!recurring;
  onceOpt.hidden = !!recurring;
  // Existing one-off entry: repetition can be set up afterwards - the entry stays the first one,
  // the recurring entry continues from the next date (not for settlements)
  document.getElementById('expenseRepeatWrap').classList.toggle('hidden', !!expense && (expense.category === FIN_SETTLE_CATEGORY || !!expense.recurringId));
  updateExpenseSignUi();
  document.getElementById('expenseStoreBlock').classList.toggle('hidden', isRec);
  updateExpenseRecurringUi();

  const items = expenseModalExtra.items;
  document.getElementById('expenseItemsBlock').classList.toggle('hidden', !items.length);
  document.getElementById('expenseItemsSummary').textContent = tk('fin.itemsFromList', { n: items.length });
  document.getElementById('expenseItemsList').innerHTML = items.map(n => `<span class="inline-block px-2 py-0.5 rounded-full bg-ink/5 text-xs">${escapeHtml(n)}</span>`).join(' ');

  document.getElementById('deleteExpenseBtn').classList.toggle('hidden', !expense && !recurring);
  document.getElementById('endRecurringBtn').classList.toggle('hidden', !recurring || !!recurring.until);
  document.getElementById('expenseModalError').classList.add('hidden');

  const suggestions = new Set();
  shoppingLists.forEach(l => l.name && suggestions.add(l.name));
  ausgaben.forEach(a => a.store && suggestions.add(a.store));
  document.getElementById('expenseStoreSuggestions').innerHTML = [...suggestions].slice(0, 60).map(s => `<option value="${escapeHtml(s)}"></option>`).join('');
  finExpenseDocsSetup(expense, isRec);

  document.getElementById('expenseModal').classList.remove('hidden');
  finAutoFocusAmount(amountInput);
}
function finOnExpenseCategoryPicked(id) {
  expenseModalCategory = id;
  expenseCategoryTouched = true;
  updateExpenseSignUi(); // Adjust title/hint (e.g. deposit/withdrawal for „Sparen“) and assignment
}
// Assignment: for „Sparen“ first the depot, then the position; for „Kinder“ the child
function updateExpenseLinkUi() {
  const wrap = document.getElementById('expenseLinkWrap');
  const sel = document.getElementById('expenseLinkSelect');
  const label = document.getElementById('expenseLinkLabel');
  const depotWrap = document.getElementById('expenseDepotWrap');
  const depotSel = document.getElementById('expenseDepotSelect');
  const cat = expenseModalCategory;
  let options = null;
  let showDepots = false;
  if (cat === FIN_SAVINGS_CATEGORY) {
    const depots = finDepots();
    const did = finLinkDepotId(expenseModalLink) || (depots[0] && depots[0].id) || '';
    showDepots = depots.length > 1;
    if (showDepots) {
      depotSel.innerHTML = depots.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(finDepotLabel(d) + (d.type === 'junior' ? ' (' + tk('depot.junior') + ')' : ''))}</option>`).join('');
      depotSel.value = did;
    }
    label.textContent = tk('depot.position');
    options = [['depot:' + did, tk('depot.noPosition')]].concat(finGoalsInDepot(did).map(g => ['spar:' + g.id, finGoalOptionLabel(g)]));
    if (!showDepots && options.length < 2) options = null;
    else if (!options.some(o => o[0] === expenseModalLink)) expenseModalLink = 'depot:' + did;
  } else if (cat === FIN_KIDS_CATEGORY) {
    label.textContent = tk('fin.forWhom');
    options = [['', tk('fin.forAll')]].concat(finKidCandidates().map(m => ['kind:' + m.id, memberLabel(m)]));
  }
  depotWrap.classList.toggle('hidden', !showDepots);
  if (!showDepots) depotSel.innerHTML = '';
  if (!options || options.length < 2 && !showDepots) {
    wrap.classList.add('hidden');
    sel.innerHTML = '';
    expenseModalLink = '';
    return;
  }
  sel.innerHTML = options.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join('');
  sel.value = options.some(o => o[0] === expenseModalLink) ? expenseModalLink : options[0][0];
  expenseModalLink = sel.value;
  wrap.classList.remove('hidden');
}
// Different depot chosen in the entry popup: if it has exactly one position, suggest it right away
function onExpenseDepotChanged() {
  const did = document.getElementById('expenseDepotSelect').value;
  if (!finDepot(did)) return;
  expenseDepotTouched = true;
  expenseLinkTouched = false;
  expenseLinkAuto = false;
  const goals = finGoalsInDepot(did);
  const byText = finMatchGoalByText(document.getElementById('expenseTitleInput').value, did);
  expenseModalLink = byText ? 'spar:' + byText.id : (goals.length === 1 ? 'spar:' + goals[0].id : 'depot:' + did);
  expenseLinkAuto = !!byText;
  updateExpenseLinkUi();
}
function finExpenseAmountIsIncome() {
  const raw = String(document.getElementById('expenseAmountInput').value || '').trim();
  return /^[-−–—]/.test(raw);
}
// Minus before the amount = income: adjust title, colour, hint and (unless chosen by the user) category
function updateExpenseSignUi() {
  const income = finExpenseAmountIsIncome();
  const m = expenseModalMode;
  const saving = expenseModalCategory === FIN_SAVINGS_CATEGORY;
  const word = saving ? (income ? 'withdrawal' : 'deposit') : (income ? 'income' : 'expense');
  // Keys written out in full, so the key check finds every one of them
  const TITLES = {
    rec: { withdrawal: 'fin.title.rec.withdrawal', deposit: 'fin.title.rec.deposit', income: 'fin.title.rec.income', expense: 'fin.title.rec.expense' },
    edit: { withdrawal: 'fin.title.edit.withdrawal', deposit: 'fin.title.edit.deposit', income: 'fin.title.edit.income', expense: 'fin.title.edit.expense' },
    newRec: { withdrawal: 'fin.title.newRec.withdrawal', deposit: 'fin.title.newRec.deposit', income: 'fin.title.newRec.income', expense: 'fin.title.newRec.expense' },
    new: { withdrawal: 'fin.title.new.withdrawal', deposit: 'fin.title.new.deposit', income: 'fin.title.new.income', expense: 'fin.title.new.expense' },
  };
  let form;
  if (m.recurring) form = 'rec';
  else if (m.existing) form = 'edit';
  else if (m.asRecurring || document.getElementById('expenseRepeatSelect').value) form = 'newRec';
  else form = 'new';
  const title = tk(TITLES[form][word]);
  document.getElementById('expenseModalTitle').textContent = title;
  document.getElementById('expenseAmountField').classList.toggle('income', income && !saving);
  const hint = document.getElementById('expenseKindHint');
  hint.textContent = saving
    ? (income ? tk('fin.hint.withdrawal') : tk('fin.hint.deposit'))
    : (income ? tk('fin.hint.income') : tk('fin.hint.expense'));
  hint.style.color = income ? FIN_GREEN : '';
  if (!expenseCategoryTouched) {
    const incomeCat = finDefaultIncomeCategory();
    let want = expenseModalCategory;
    if (income && incomeCat) want = incomeCat;
    else if (!income && expenseModalCategory === FIN_INCOME_CATEGORY) want = finDefaultExpenseCategory();
    if (want !== expenseModalCategory) {
      expenseModalCategory = want;
      renderFinCategoryPicker('expenseCategoryPicker', expenseModalCategory, finOnExpenseCategoryPicked);
    }
  }
  updateExpenseLinkUi();
}
// ± key: the number keypad on the iPhone has no minus
function toggleExpenseSign() {
  const inp = document.getElementById('expenseAmountInput');
  const raw = String(inp.value || '').trim();
  inp.value = /^[-−–—]/.test(raw) ? raw.replace(/^[-−–—]\s*/, '') : '-' + raw;
  updateExpenseSignUi();
}
// First date of the repetition when an existing entry becomes recurring: the next one after it
function finExpenseSeriesStart(dateIso, interval) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || '')) return '';
  return finRecDates({ start: dateIso, interval: interval || 'monthly' }, finIsoAddDays(dateIso, 1), finIsoAddDays(dateIso, 400))[0] || '';
}
function updateExpenseRecurringUi() {
  const interval = document.getElementById('expenseRepeatSelect').value;
  const converting = !!editingExpenseId && !!interval; // existing entry becomes recurring
  const isRec = !!editingRecurringId || (!!interval && !editingExpenseId);
  if (expenseModalMode && !expenseModalMode.recurring && !expenseModalMode.existing) updateExpenseSignUi();
  document.getElementById('expenseDateLabel').textContent = isRec ? tk('fin.firstEntryOn') : tk('fin.date');
  document.getElementById('expenseStoreBlock').classList.toggle('hidden', isRec);
  const docsWrap = document.getElementById('expenseDocsWrap');
  if (docsWrap) docsWrap.classList.toggle('hidden', isRec || isCurrentUserGuest());
  const info = document.getElementById('expenseRecurringInfo');
  const dateVal = document.getElementById('expenseDateInput').value;
  if (converting) {
    const next = finExpenseSeriesStart(dateVal, interval);
    if (next) {
      info.textContent = tk('fin.rec.convertInfo', { date: finDayLabel(next), rhythm: finRecDescribe({ start: next, interval }) });
      info.classList.remove('hidden');
    } else {
      info.classList.add('hidden');
    }
    return;
  }
  if (isRec && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const r = editingRecurringId ? finance.recurring.find(x => x.id === editingRecurringId) : null;
    const probe = { start: dateVal, interval: interval || 'monthly' };
    let text = tk('fin.rec.autoBooked', { rhythm: finRecDescribe(probe) });
    const until = r ? finRecUntil(r) : '';
    if (until && until < finTodayIso()) {
      text = tk('fin.rec.endedLast', { date: new Date(until + 'T00:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long', year: 'numeric' }) });
    } else {
      const next = finRecNext(probe);
      if (next) text += ' ' + tk('fin.rec.next', { date: finDayLabel(next) });
    }
    info.textContent = text;
    info.classList.remove('hidden');
  } else {
    info.classList.add('hidden');
  }
}
function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
  editingExpenseId = null;
  editingRecurringId = null;
  expenseDocPending = [];
}
function finSanitizeHistory(r) {
  const start = finRecStart(r);
  let hist = (Array.isArray(r.history) ? r.history : []).filter(h => h && h.from).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  // Merge everything before the start: the last valid amount applies from the start
  const before = hist.filter(h => h.from <= start);
  const after = hist.filter(h => h.from > start);
  const startAmount = before.length ? before[before.length - 1].amount : (after.length ? after[0].amount : r.amount);
  hist = [{ id: start, from: start, amount: startAmount }, ...after];
  r.history = hist.map(h => ({ id: h.from, from: h.from, amount: h.amount }));
}
// Creates or changes a recurring entry (shared by expenses, savings plans and pocket money).
// Amount changes apply from today (or from the start) by default - previous entries keep
// their amount. applyFrom ('YYYY-MM-DD'): new amount applies retroactively from this day (start = for all).
function finUpsertRecurring(id, fields, applyFrom = null) {
  const date = fields.start;
  const base = { title: '', category: 'sonstiges', paidBy: '', note: '', link: '', ...fields,
    day: Number(date.slice(8, 10)), since: date.slice(0, 7), interval: fields.interval || 'monthly' };
  if (id) {
    finance.recurring = finance.recurring.map(r => {
      if (r.id !== id) return r;
      const upd = { ...r, ...base };
      const todayIso = finTodayIso();
      const explicit = /^\d{4}-\d{2}-\d{2}$/.test(applyFrom || '');
      let fromKey = explicit ? applyFrom : (date > todayIso ? date : todayIso);
      if (fromKey < date) fromKey = date;
      if (explicit || Math.abs(finRecurringAmountFor(r, fromKey) - fields.amount) > 0.001) {
        upd.history = (Array.isArray(r.history) ? r.history : []).filter(h => h.from < fromKey).concat([{ id: fromKey, from: fromKey, amount: fields.amount }]);
      }
      if (upd.until && finRecUntil(upd) < date) upd.until = '';
      finSanitizeHistory(upd);
      return upd;
    });
    return finance.recurring.find(r => r.id === id);
  }
  const r = { id: 'r' + newRecordId(), until: '', ...base, history: [{ id: date, from: date, amount: fields.amount }] };
  finance.recurring = [...finance.recurring, r];
  return r;
}
/* ---------- Changed amount: from when? ----------
   Default: only for the future (from today). If there are already earlier entries, the app asks whether the new
   amount should instead apply retroactively from a date or to all previous entries. If the sign
   changes (expense ↔ income or deposit ↔ withdrawal), „für alle“ is preselected - that is
   almost always a correction then. */
let finScopeResolve = null;
let finScopeCtx = null;
// Needed? -> { past: [previous booking days before today], oldAmount } or null
function finScopeNeeded(r, newAmount, newStart, newInterval = null) {
  if (!r) return null;
  const todayIso = finTodayIso();
  if (newStart > todayIso) return null; // starts only in the future - nothing previous affected
  const oldAmount = finRecurringAmountFor(r, todayIso);
  if (Math.abs(oldAmount - newAmount) < 0.005) return null;
  const probe = { ...r, start: newStart, day: Number(newStart.slice(8, 10)), interval: newInterval || finRecInterval(r) };
  const past = finRecDates(probe, newStart, finIsoAddDays(todayIso, -1));
  if (!past.length) return null;
  return { past, oldAmount };
}
function finScopeAmountText(amount, saving) {
  const a = Number(amount) || 0;
  if (saving) return a < 0 ? tk('fin.scope.amountWithdrawal', { amount: fmtEur(-a) }) : tk('fin.scope.amountDeposit', { amount: fmtEur(a) });
  return a < 0 ? tk('fin.scope.amountIncome', { amount: fmtEur(-a) }) : tk('fin.scope.amountExpense', { amount: fmtEur(a) });
}
// Returns a promise: { from: 'YYYY-MM-DD' | null (= from today) } or null (cancelled)
function finAskChangeScope({ past, oldAmount, newAmount, start, saving = false, title = '' }) {
  return new Promise(resolve => {
    if (finScopeResolve) finScopeResolve(null);
    finScopeResolve = resolve;
    finScopeCtx = { past, start };
    const todayIso = finTodayIso();
    const fmtD = iso => new Date(iso + 'T00:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
    const signFlip = (oldAmount < 0) !== (newAmount < 0);
    document.getElementById('finScopeTitle').textContent = title ? tk('fin.scope.titleNamed', { name: title }) : tk('fin.scope.title');
    document.getElementById('finScopeInfo').textContent =
      tk('fin.scope.info', { old: finScopeAmountText(oldAmount, saving), new: finScopeAmountText(newAmount, saving), date: fmtD(past[0]), n: past.length });
    document.getElementById('finScopeFutureSub').textContent = tk('fin.scope.futureSub', { date: fmtD(todayIso) });
    document.getElementById('finScopeAllSub').textContent = tk('fin.scope.allSub', { n: past.length, date: fmtD(past[0]) });
    const dateInp = document.getElementById('finScopeDate');
    dateInp.min = start;
    dateInp.max = todayIso;
    const monthStart = finPeriodRange('month', 0).startIso;
    dateInp.value = monthStart > start ? monthStart : start;
    const hint = document.getElementById('finScopeHint');
    if (signFlip) {
      hint.textContent = saving
        ? tk('fin.scope.flipSaving')
        : tk('fin.scope.flip');
      hint.style.color = FIN_GREEN;
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
    finScopeSelect(signFlip ? 'all' : 'future');
    document.getElementById('finScopeModal').classList.remove('hidden');
  });
}
function finScopeSelect(value) {
  document.querySelectorAll('#finScopeModal input[name="finScope"]').forEach(inp => {
    inp.checked = inp.value === value;
    inp.closest('.fin-scope-opt').classList.toggle('active', inp.checked);
  });
  updateFinScopeDateSub();
}
function finScopeValue() {
  const sel = document.querySelector('#finScopeModal input[name="finScope"]:checked');
  return sel ? sel.value : 'future';
}
function updateFinScopeDateSub() {
  const el = document.getElementById('finScopeDateSub');
  const v = document.getElementById('finScopeDate').value;
  if (!finScopeCtx || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { el.textContent = ''; return; }
  const n = finScopeCtx.past.filter(d => d >= v).length;
  el.textContent = n ? tk('fin.scope.affectsN', { n }) : tk('fin.scope.affectsNone');
}
function finScopeFinish(result) {
  document.getElementById('finScopeModal').classList.add('hidden');
  const res = finScopeResolve;
  finScopeResolve = null;
  finScopeCtx = null;
  if (res) res(result);
}
function confirmFinScope() {
  const v = finScopeValue();
  if (v === 'all') return finScopeFinish({ from: finScopeCtx ? finScopeCtx.start : null });
  if (v === 'date') {
    let d = document.getElementById('finScopeDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { document.getElementById('finScopeDate').focus(); return; }
    const todayIso = finTodayIso();
    if (finScopeCtx && d < finScopeCtx.start) d = finScopeCtx.start;
    if (d > todayIso) d = todayIso;
    return finScopeFinish({ from: d });
  }
  finScopeFinish({ from: null });
}

// Ends a recurring entry after the last booking up to today. false = there was none yet (then removed).
function finEndRecurring(id) {
  const r = finance.recurring.find(x => x.id === id);
  if (!r) return false;
  const past = finRecDates(r, finRecStart(r) || '1970-01-01', finTodayIso());
  if (!past.length) {
    finance.recurring = finance.recurring.filter(x => x.id !== id);
    return false;
  }
  finance.recurring = finance.recurring.map(x => x.id === id ? { ...x, until: past[past.length - 1] } : x);
  return true;
}
let expenseSaving = false;
async function saveExpenseFromModal() {
  if (expenseSaving) return;
  const errEl = document.getElementById('expenseModalError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  const amount = parseEuro(document.getElementById('expenseAmountInput').value);
  if (!isFinite(amount) || amount === 0) return showErr(tk('fin.err.needAmount'));
  if (Math.abs(amount) > 1000000) return showErr(tk('fin.err.tooBig'));
  const isIncome = amount < 0;
  const date = document.getElementById('expenseDateInput').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showErr(tk('fin.err.needDate'));
  const title = document.getElementById('expenseTitleInput').value.trim();
  const note = document.getElementById('expenseNoteInput').value.trim();
  const paidBy = document.getElementById('expensePaidBySelect').value;
  const category = expenseModalCategory;
  const link = finLinkParse(expenseModalLink) ? expenseModalLink : '';
  const interval = document.getElementById('expenseRepeatSelect').value || (editingRecurringId ? 'monthly' : '');
  const convertToRecurring = !!editingExpenseId && !!interval && !editingRecurringId;
  const isRec = !!editingRecurringId || (!!interval && !editingExpenseId);

  if (isRec) {
    let applyFrom = null;
    const recId = editingRecurringId;
    const scope = recId ? finScopeNeeded(finance.recurring.find(x => x.id === recId), amount, date, interval) : null;
    if (scope) {
      expenseSaving = true;
      let answer = null;
      try {
        answer = await finAskChangeScope({ ...scope, newAmount: amount, start: date, saving: category === FIN_SAVINGS_CATEGORY, title });
      } finally {
        expenseSaving = false;
      }
      if (!answer) return; // cancelled - the popup stays open
      applyFrom = answer.from;
    }
    finUpsertRecurring(recId, { title, amount, category, paidBy, note, link, interval, start: date, split: kasseSplitValue('expense') }, applyFrom);
    persistState();
    closeExpenseModal();
    renderFinance();
    renderFinRecurringEditor();
    const savedText = category === FIN_SAVINGS_CATEGORY ? (isIncome ? tk('fin.saved.recWithdrawal') : tk('fin.saved.savingsPlan')) : (isIncome ? tk('fin.saved.recIncome') : tk('fin.saved.recExpense'));
    finShowToast(applyFrom ? tk('fin.saved.retroactive', { text: savedText, date: new Date(applyFrom + 'T00:00:00').toLocaleDateString(sysLocale()) }) : tk('fin.saved.sentence', { text: savedText }));
    if (kidPageMemberId) renderKidPage();
    return;
  }

  const existing = editingExpenseId ? ausgaben.find(x => x.id === editingExpenseId) : null;
  const data = {
    id: editingExpenseId || newRecordId(),
    amount, date, category, title, note, paidBy, link,
    split: kasseSplitValue('expense'),
    ...(existing && existing.kasse ? { kasse: existing.kasse } : {}),
    store: document.getElementById('expenseStoreInput').value.trim(),
    listId: expenseModalExtra.listId || '',
    items: expenseModalExtra.items || [],
    createdBy: existing ? (existing.createdBy || '') : ((currentUser() && currentUser().id) || ''),
    created: existing ? (existing.created || '') : new Date().toISOString(),
  };
  const pendingDocs = expenseDocPending.slice();
  finQueueSave(data);
  // Repetition set up afterwards: this entry stays the first one, the recurring entry
  // starts with the next date (same amount, category, description and split)
  let seriesStart = '';
  if (convertToRecurring) {
    seriesStart = finExpenseSeriesStart(date, interval);
    if (seriesStart) {
      finUpsertRecurring(null, { title: title || data.store || '', amount, category, paidBy, note, link, interval, start: seriesStart, split: data.split });
      persistState();
    }
  }
  closeExpenseModal();
  if (pendingDocs.length) finUploadMany(pendingDocs, 'ausgabe:' + data.id, 'beleg');
  finJumpToDate(date);
  renderFinance();
  if (seriesStart) {
    renderFinRecurringEditor();
    finShowToast(tk('fin.saved.repeatSet', { date: finDayLabel(seriesStart) }));
    return;
  }
  if (category === FIN_SAVINGS_CATEGORY) finShowToast(isIncome ? tk('fin.saved.withdrawn', { amount: fmtEur(-amount) }) : tk('fin.saved.deposited', { amount: fmtEur(amount) }));
  else if (existing) finShowToast(isIncome ? tk('fin.saved.income') : tk('fin.saved.expense'));
  else if (isIncome) finShowToast(tk('fin.saved.incomeUnder', { amount: fmtEur(-amount), cat: i18nT(finCategory(category).label) }));
  else finShowToast(tk('fin.saved.expenseUnder', { amount: fmtEur(amount), cat: i18nT(finCategory(category).label) }) + finBudgetToastSuffix(date));
}
function deleteFromExpenseModal() {
  if (editingRecurringId) {
    if (!confirm(tk('fin.confirm.deleteRec'))) return;
    finance.recurring = finance.recurring.filter(r => r.id !== editingRecurringId);
    persistState();
    closeExpenseModal();
    renderFinance();
    renderFinRecurringEditor();
    return;
  }
  if (!editingExpenseId) return;
  const cur = ausgaben.find(x => x.id === editingExpenseId);
  if (!confirm(cur && finIsIncome(cur) ? tk('fin.confirm.deleteIncome') : tk('fin.confirm.deleteExpense'))) return;
  const deletedId = editingExpenseId;
  finQueueDelete(deletedId);
  closeExpenseModal();
  renderFinance();
  finDeleteDocsFor('ausgabe:' + deletedId); // remove the expense's receipts as well
}
function endRecurringFromModal() {
  const r = finance.recurring.find(x => x.id === editingRecurringId);
  if (!r) return;
  const past = finRecDates(r, finRecStart(r) || '1970-01-01', finTodayIso());
  if (!past.length && !confirm(tk('fin.confirm.endNeverBooked'))) return;
  finEndRecurring(r.id);
  persistState();
  closeExpenseModal();
  renderFinance();
  renderFinRecurringEditor();
  finShowToast(tk('fin.saved.recEnded'));
}
// After booking, show the period in which the entry lies
function finJumpToDate(iso) {
  const range = finPeriodRange(finPeriod, finOffset);
  if (iso >= range.startIso && iso <= range.endIso) return;
  for (let off = 0; off >= -600; off--) {
    const r = finPeriodRange(finPeriod, off);
    if (iso >= r.startIso && iso <= r.endIso) { finOffset = off; return; }
    if (iso > r.endIso) break;
  }
  for (let off = 1; off <= 60; off++) {
    const r = finPeriodRange(finPeriod, off);
    if (iso >= r.startIso && iso <= r.endIso) { finOffset = off; return; }
  }
}
function finBudgetToastSuffix(iso) {
  const { range, budget } = finCurrentMonthBudget();
  if (!budget) return '';
  const today = finTodayIso();
  if (iso < range.startIso || iso > range.endIso || iso > today) return '';
  const rest = budget - finStats(range).total;
  return ' ' + (rest >= 0 ? tk('fin.toast.budgetLeft', { amount: fmtEur(rest) }) : tk('fin.toast.budgetOver', { amount: fmtEur(-rest) }));
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('finanzen');
