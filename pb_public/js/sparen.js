/* pinn. – js/sparen.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/vertraege.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.52.0, only the comments were translated):
   - Savings (page "Finanzen", tab "Sparen") – depots and junior depots, positions and savings goals,
     evaluation (value, profit/loss, course), ETFs and securities with current prices, import of depot
     transactions from CSV and PDF, the popups for position, depot and savings instalment
   - Pocket money (tab "Taschengeld") – plans per child, balance with movements, popup, display on the child page
   - The events of the savings goal, pocket money and balance popups, and the short feedback at the bottom (finShowToast)
   133 functions and 30 variables. index.html only calls these functions later (when the user acts or from
   bootApp), never while it is still loading – that is why this file may come after the inline script.
   No statement runs while this file loads. js/vertraege.js, which comes right after this file, calls
   initSavingsAndAllowanceUi() while it loads – that is why this file has to come before js/vertraege.js. */

/* ==========================================================
   Savings & pocket money ("Sparen & Taschengeld")
   ----------------------------------------------------------
   Savings
   - The basis are all bookings of the category „Sparen“ (one-off and recurring, up to today):
     positive amount = deposit into the savings, negative amount (minus) = withdrawal.
   - Depots (finance.depots, also junior depots for children) bundle positions. Every position
     (finance.savingsGoals, field depot) belongs to exactly one depot; bookings follow their position or
     are assigned only to the depot via link 'depot:<ID>'. Bookings without a valid assignment count
     towards the main depot (fixed ID 'haupt', or the first depot).
   - Display: overall overview of the depots that the own profile counts (personal setting
     finDepotsOut), below it a card per depot with value and a small chart; tapping opens the depot.
   - Savings goal with an ISIN = ETF savings plan: value at the current price (see „ETFs / Wertpapiere“ below).
   - Savings goals (finance.savingsGoals) collect the bookings assigned to them (link 'spar:<goal ID>')
     plus an optional opening balance („schon gespart“ = already saved). Bookings that are not assigned count as
     „Ohne Sparziel“ (without savings goal). If a goal is deleted, its bookings are kept.
   Pocket money
   - One recurring booking per child (finance.recurring with allowanceFor = member ID) under the
     category „Kinder“ and link 'kind:<member ID>' - so it appears automatically in the expenses.
     If the rhythm or start changes, the old plan is ended after the last payout and a new one is
     created - what was paid out so far stays unchanged.
   - Optionally a balance is kept (finance.pocketMoney): opening balance + all payouts +
     entered movements (finance.pocketLedger: spent / received).
   - With the tick „Taschengeld auf der Kinderseite anzeigen“ (m.kid.showAllowance) the child sees the amount,
     the next payout and - if kept - its balance.
   Everything is stored small in the family record (finance) and synchronised like the rest; nothing is
   calculated or stored in the background, only when displaying.
   ========================================================== */
const FIN_GOAL_ICONS = ['🎯', '📈', '🏢', '🎲', '🏖️', '✈️', '🚗', '🏠', '🛋️', '🎓', '💻', '📱', '🚲', '🎁', '🎄', '💍', '👶', '🐶', '🛟', '🌱', '🐷'];
// Kinds of positions: everything except „Sparziel“ (savings goal) has an ISIN and therefore a price
const FIN_GOAL_KINDS = [
  { id: 'etf', label: 'ETF', icon: '📈' },
  { id: 'aktie', get label() { return tk('depot.kind.share'); }, icon: '🏢' },
  { id: 'fonds', get label() { return tk('depot.kind.fund'); }, icon: '🧺' },
  { id: 'derivat', get label() { return tk('depot.kind.derivative'); }, icon: '🎲' },
  { id: 'anleihe', get label() { return tk('depot.kind.bond'); }, icon: '📜' },
  { id: 'wertpapier', get label() { return tk('depot.kind.other'); }, icon: '📄' },
  { id: 'ziel', get label() { return tk('depot.kind.goal'); }, icon: '🎯' },
];
const FIN_DEPOT_ICONS = ['💼', '🏦', '📈', '💰', '🐷', '🌱', '🧒', '👧', '👦', '🐣', '🎓', '🛟', '🏠', '⭐'];
const FIN_DEPOT_COLORS = ['#3D5A80', '#2F9E5B', '#E07A5F', '#8E6BBF', '#2A9D8F', '#D4A017', '#C0567A', '#4A6FA5'];
const FIN_GOAL_COLORS = ['#2F9E5B', '#3D5A80', '#E07A5F', '#D4A017', '#8E6BBF', '#2A9D8F', '#C0567A', '#4A6FA5'];
const FIN_KID_RHYTHM = {
  get weekly() { return tk('pocket.rhythm.weekly'); }, get biweekly() { return tk('pocket.rhythm.biweekly'); },
  get monthly() { return tk('pocket.rhythm.monthly'); }, get quarterly() { return tk('pocket.rhythm.quarterly'); },
  get yearly() { return tk('pocket.rhythm.yearly'); },
};
const finOpenKidMoves = new Set(); // expanded „Letzte Bewegungen“ (latest movements) per child

function finRound(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function finLinkParse(link) {
  const m = /^(spar|kind|depot|fahrzeug):([A-Za-z0-9_-]{1,50})$/.exec(String(link || ''));
  return m ? { type: m[1], id: m[2] } : null;
}
function finGoal(id) { return (finance && finance.savingsGoals.find(g => g.id === id)) || null; }
function finLinkLabel(link) {
  const l = finLinkParse(link);
  if (!l) return '';
  if (l.type === 'spar') {
    const g = finGoal(l.id);
    if (!g) return '';
    const name = (g.icon ? g.icon + ' ' : '') + (g.name || tk('depot.position'));
    const d = finDepots().length > 1 ? finDepot(finGoalDepotId(g)) : null;
    return d ? name + ' · ' + (d.name || tk('depot.mainName')) : name;
  }
  if (l.type === 'depot') {
    const d = finDepot(l.id);
    return d ? finDepotLabel(d) : '';
  }
  if (l.type === 'fahrzeug') return fzLinkLabel(l.id);
  const m = memberById(l.id);
  return m ? tk('depot.forName', { name: memberLabel(m) }) : '';
}

/* ---------- Savings: depots ----------
   finance.depots: { id, name, icon, color, type: 'depot' | 'junior', kid (member ID for a junior depot), bank, created }
   Which depots count towards the own overview is stored in finDepotsOut (hidden depots,
   saved with the personal design - so it applies per profile on all devices). */
let finSavingsDepot = null;       // opened depot (null = overall overview)
let finDepotPickerOpen = false;   // selection „Gesamtübersicht“ (overall overview) expanded
function finDepots() { return (finance && Array.isArray(finance.depots)) ? finance.depots : []; }
function finDepot(id) { return finDepots().find(d => d.id === id) || null; }
function finFallbackDepotId() {
  const ds = finDepots();
  if (ds.some(d => d.id === FIN_MAIN_DEPOT)) return FIN_MAIN_DEPOT;
  return ds.length ? ds[0].id : '';
}
function finGoalDepotId(g) { return (g && g.depot && finDepot(g.depot)) ? g.depot : finFallbackDepotId(); }
function finGoalsInDepot(depotId) { return finance.savingsGoals.filter(g => finGoalDepotId(g) === depotId); }
// depot of an (already resolved) assignment
function finLinkDepotId(link) {
  const l = finLinkParse(link);
  if (l && l.type === 'spar') { const g = finGoal(l.id); if (g) return finGoalDepotId(g); }
  if (l && l.type === 'depot' && finDepot(l.id)) return l.id;
  return finFallbackDepotId();
}
function finDepotIncluded(id) { return !finDepotsOut.includes(id); }
function finIncludedDepotIds() { return finDepots().filter(d => finDepotIncluded(d.id)).map(d => d.id); }
function finDepotColor(d) { return d && /^#[0-9a-fA-F]{6}$/.test(d.color || '') ? d.color : '#3D5A80'; }
function finDepotLabel(d) { return d ? (d.icon ? d.icon + ' ' : '') + (d.name || tk('depot.mainName')) : ''; }
function finDepotSub(d) {
  if (!d) return '';
  const parts = [];
  if (d.type === 'junior') {
    const m = d.kid ? memberById(d.kid) : null;
    parts.push(tk('depot.juniorDepot') + (m ? ' · ' + tk('depot.forName', { name: memberLabel(m) }) : ''));
  } else parts.push(tk('depot.mainName'));
  if (d.bank) parts.push(d.bank);
  return parts.join(' · ');
}
function finSetDepotIncluded(id, on) {
  const set = new Set(finDepotsOut);
  if (on) set.delete(id); else set.add(id);
  finDepotsOut = [...set].filter(x => finDepot(x)).slice(0, 30);
  savePersonalDesign();
}
function finOpenDepot(id) {
  finSavingsDepot = id && finDepot(id) ? id : null;
  finEtfChartSel = 'all';
  const sc = document.getElementById('financeScroll');
  if (sc) sc.scrollTop = 0;
  renderSavings();
}
function finGoalKind(g) {
  if (g && FIN_GOAL_KINDS.some(k => k.id === g.kind)) return g.kind;
  return g && finValidIsin(g.isin) ? 'etf' : 'ziel';
}
function finKindInfo(kind) { return FIN_GOAL_KINDS.find(k => k.id === kind) || FIN_GOAL_KINDS[0]; }
function finGoalOptionLabel(g) {
  const kind = finGoalKind(g);
  return (g.icon ? g.icon + ' ' : '') + (g.name || tk('depot.position')) + (kind !== 'ziel' ? ' · ' + finKindInfo(kind).label : '');
}
function finSignedEur(v) {
  const r = finRound(v);
  return (r > 0 ? '+ ' : r < 0 ? '− ' : '') + fmtEur(Math.abs(r));
}
function finSetTab(tab) {
  if (!['ausgaben', 'sparen', 'taschengeld', 'vertraege'].includes(tab)) return;
  if (tab === 'taschengeld' && !wgShowAllowanceTab()) tab = 'ausgaben';
  if (tab === 'sparen' && finTab === 'sparen') finSavingsDepot = null; // „Sparen“ tapped again = back to the overall overview
  finTab = tab;
  try { localStorage.setItem(LS_FIN_TAB, tab); } catch (e) { /* ignore */ }
  const sc = document.getElementById('financeScroll');
  if (sc) sc.scrollTop = 0;
  renderFinance();
}
// Default for a new savings booking: the only position in the depot, or the depot itself
function finDefaultGoalLink(depotId = null) {
  const ds = finDepots();
  const did = (depotId && finDepot(depotId)) ? depotId : (ds.length === 1 ? ds[0].id : '');
  if (did) {
    const goals = finGoalsInDepot(did);
    return goals.length === 1 ? 'spar:' + goals[0].id : 'depot:' + did;
  }
  const goals = finance.savingsGoals;
  return goals.length === 1 ? 'spar:' + goals[0].id : '';
}
function finTile(label, value, sub = '') {
  return `
    <div class="rounded-xl bg-ink/5 px-3 py-2.5 min-w-0">
      <div class="text-[10px] uppercase tracking-wide text-ink/40 truncate">${label}</div>
      <div class="text-base font-semibold leading-tight mt-0.5">${value}</div>
      ${sub ? `<div class="text-[11px] text-ink/50 truncate">${sub}</div>` : ''}
    </div>`;
}
function finMonthsUntil(iso) {
  const now = new Date();
  const d = new Date(iso + 'T00:00:00');
  return Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
}

/* ---------- Savings: evaluation ---------- */
// All savings movements up to toIso: bookings of the category „Sparen“ (one-off + recurring) and imported
// depot transactions. Bookings without an assignment are matched to a savings goal via name/ISIN in the
// description. For ETF goals with an import, bookings only count after the last imported day.
function finSavingsEntries(toIso = finTodayIso()) {
  const real = ausgaben.filter(e => e.category === FIN_SAVINGS_CATEGORY && e.date && e.date <= toIso);
  const rec = finRecurringEntries('1970-01-01', toIso).filter(e => e.category === FIN_SAVINGS_CATEGORY);
  const out = [];
  real.concat(rec).forEach(e => {
    const link = finResolveSavingsLink(e);
    const l = finLinkParse(link);
    const g = l && l.type === 'spar' ? finGoal(l.id) : null;
    if (g && g.importedUntil && e.date <= g.importedUntil) return; // already contained in the import
    out.push(link === e.link ? e : { ...e, link });
  });
  finance.etfTrades.forEach(t => {
    if (t.date > toIso || !finGoal(t.goal)) return;
    const sign = t.type === 'sell' ? -1 : 1;
    out.push({
      id: t.id, trade: true, date: t.date, category: FIN_SAVINGS_CATEGORY, link: 'spar:' + t.goal,
      amount: sign * (Number(t.amount) || 0), shares: Number(t.shares) > 0 ? sign * Number(t.shares) : null,
      title: t.type === 'sell' ? tk('depot.saleImport') : tk('depot.purchaseImport'), created: '',
    });
  });
  return out;
}
// Evaluation for the selected depots (null = all). allEntries: finSavingsEntries() calculated beforehand.
function finSavingsOverview(depotIds = null, allEntries = null) {
  const todayIso = finTodayIso();
  const inSet = id => !depotIds || depotIds.includes(id);
  const entries = (allEntries || finSavingsEntries(todayIso)).filter(e => inSet(finLinkDepotId(e.link)));
  const sixAgo = finPeriodRange('month', -6).startIso;
  const goals = finance.savingsGoals.filter(g => inSet(finGoalDepotId(g)))
    .map(g => ({ goal: g, balance: Number(g.startBalance) || 0, recent: 0, rate: 0, entries: [], etf: null }));
  const byId = new Map(goals.map(x => [x.goal.id, x]));
  let unassigned = 0, unassignedCount = 0;
  const loose = [];
  entries.forEach(e => {
    const amt = Number(e.amount) || 0;
    const l = finLinkParse(e.link);
    const slot = (l && l.type === 'spar') ? byId.get(l.id) : null;
    if (slot) {
      slot.balance += amt;
      slot.entries.push(e);
      if (e.date >= sixAgo) slot.recent += amt;
    } else {
      unassigned += amt;
      unassignedCount++;
      loose.push(e);
    }
  });
  // Savings rate per position: recurring deposits (converted per month); otherwise the average of the last 6 months
  finance.recurring.filter(r => r.category === FIN_SAVINGS_CATEGORY && finRecIsRunning(r, todayIso)).forEach(r => {
    const l = finLinkParse(finResolveSavingsLink(r));
    const slot = (l && l.type === 'spar') ? byId.get(l.id) : null;
    if (slot) slot.rate += finRecMonthly(r, todayIso);
  });
  goals.forEach(x => {
    x.balance = finRound(x.balance);
    x.invested = x.balance;
    if (x.rate <= 0 && x.recent > 0) x.rate = x.recent / 6;
    // Security (ETF, share …): value at the current price instead of the sum of the deposits
    if (finIsEtfGoal(x.goal)) {
      x.etf = finEtfState(x.goal, x.entries, todayIso);
      x.balance = x.etf.value;
      x.invested = x.etf.invested;
    }
  });
  const total = finRound(goals.reduce((s, x) => s + x.balance, 0) + unassigned);
  const invested = finRound(goals.reduce((s, x) => s + x.invested, 0) + unassigned);
  return { entries, goals, loose, unassigned: finRound(unassigned), unassignedCount, total, invested, gain: finRound(total - invested) };
}
// Savings rate (per month) of the running recurring „Sparen“ bookings in the selected depots
function finSavingsRate(depotIds = null) {
  const todayIso = finTodayIso();
  const recs = finance.recurring.filter(r => r.category === FIN_SAVINGS_CATEGORY && finRecIsRunning(r, todayIso)
    && (!depotIds || depotIds.includes(finLinkDepotId(finResolveSavingsLink(r)))));
  return { rate: recs.reduce((s, r) => s + finRecMonthly(r, todayIso), 0), count: recs.length };
}
// Course of value vs. paid in (month ends up to today) across all positions and loose bookings of an evaluation
function finValueTimeline(ov, maxPoints = 48) {
  const todayIso = finTodayIso();
  let start = todayIso;
  ov.goals.forEach(x => {
    if ((Number(x.goal.startBalance) || Number(x.goal.startShares)) && finGoalStartDate(x.goal) < start) start = finGoalStartDate(x.goal);
    x.entries.forEach(e => { if (e.date < start) start = e.date; });
  });
  ov.loose.forEach(e => { if (e.date < start) start = e.date; });
  if (start >= todayIso) return [];
  const s = new Date(start + 'T00:00:00');
  const now = new Date();
  const months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  const step = Math.max(1, Math.ceil(months / maxPoints));
  const dates = [start];
  for (let k = step; k < months + 1; k += step) {
    const iso = isoDate(new Date(s.getFullYear(), s.getMonth() + k, 0)); // month end
    if (iso > start && iso < todayIso) dates.push(iso);
  }
  dates.push(todayIso);
  return dates.map(date => {
    let value = 0, invested = 0;
    ov.goals.forEach(x => {
      if (x.etf) {
        const st = finEtfState(x.goal, x.entries, date);
        value += st.value; invested += st.invested;
        return;
      }
      let b = finGoalStartDate(x.goal) <= date ? (Number(x.goal.startBalance) || 0) : 0;
      x.entries.forEach(e => { if (e.date <= date) b += Number(e.amount) || 0; });
      value += b; invested += b;
    });
    ov.loose.forEach(e => { if (e.date <= date) { const a = Number(e.amount) || 0; value += a; invested += a; } });
    return { date, value: finRound(value), invested: finRound(invested) };
  });
}
function finGoalForecast(x) {
  const g = x.goal;
  const target = Number(g.target) || 0;
  if (!target) return (x.rate > 0 && !finGoalRatePlans(g.id).length) ? tk('depot.savingsPlanPerMonth', { amount: fmtEur0(x.rate) }) : '';
  const rest = finRound(target - x.balance);
  if (rest <= 0) return tk('depot.goalReached');
  const parts = [tk('depot.goalLeft', { amount: fmtEur(rest) })];
  const todayIso = finTodayIso();
  if (g.targetDate && g.targetDate > todayIso) {
    const need = rest / finMonthsUntil(g.targetDate);
    const until = new Date(g.targetDate + 'T00:00:00').toLocaleDateString(sysLocale(), { month: 'short', year: 'numeric' });
    parts.push(tk('depot.monthUntil', { amount: fmtEur0(Math.ceil(need)), until }));
  } else if (g.targetDate) {
    parts.push(tk('depot.targetDatePassed'));
  }
  if (x.rate > 0) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + Math.ceil(rest / x.rate));
    parts.push(tk('depot.atMonthApprox', { amount: fmtEur0(x.rate), date: d.toLocaleDateString(sysLocale(), { month: 'short', year: 'numeric' }) }));
  }
  return parts.join(' · ');
}

/* ---------- Savings: ETFs / securities with current prices ----------
   A savings goal with an ISIN is an ETF savings plan. Every deposit (every savings instalment too) is
   converted into shares at the closing price of its day, every withdrawal is treated as a sale at the
   price of its day. Value = shares × current price. „Schon eingezahlt“ (already paid in) + „Anteile schon im Depot“
   (shares already in the depot) form the state before pinn. (without shares, „Schon eingezahlt“ is converted at
   the price on the day the goal was created).
   The server fetches the prices (pb_hooks/pinn-kurse.js, cached); the app also remembers them on the
   device so that values are shown offline as well. Order fees and taxes are not taken into account. */
const LS_FIN_QUOTES = 'pinn.kurse.cache';
let finQuotes = (() => {
  try { const c = JSON.parse(localStorage.getItem(LS_FIN_QUOTES) || '{}'); return (c && typeof c === 'object') ? c : {}; } catch (e) { return {}; }
})();
let finQuotesLoading = false;
let finQuotesLastLoad = 0;
let finQuotesError = '';
let finEtfChartSel = 'all';

function finNormIsin(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function finValidIsin(s) {
  s = String(s || '');
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(s)) return false;
  let digits = '';
  for (const c of s) digits += /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
function finParseShares(str) {
  let s = String(str == null ? '' : str).replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return isFinite(v) && v >= 0 ? Math.round(v * 1e6) / 1e6 : NaN;
}
function finFmtShares(v) { return (Number(v) || 0).toLocaleString('de-DE', { maximumFractionDigits: 4 }); }
function finFmtPct(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' %'; }
function finIsEtfGoal(g) { return !!(g && finValidIsin(g.isin)); }
function finEtfGoals() { return finance.savingsGoals.filter(finIsEtfGoal); }
function finMergeHistory(a, b) {
  const map = new Map();
  (a || []).forEach(x => map.set(x[0], x[1]));
  (b || []).forEach(x => map.set(x[0], x[1]));
  return [...map.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1));
}
function finQuotesSave() {
  try { localStorage.setItem(LS_FIN_QUOTES, JSON.stringify(finQuotes)); } catch (e) { /* storage full - ignore */ }
}
// Price on a day: last closing price on or before that day; after the course the current price
function finPriceAt(q, iso) {
  if (!q) return 0;
  const h = Array.isArray(q.history) ? q.history : [];
  if (!h.length) return q.price > 0 ? q.price : 0;
  if (iso > h[h.length - 1][0]) return q.price > 0 ? q.price : h[h.length - 1][1];
  let lo = 0, hi = h.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid][0] <= iso) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (idx >= 0) return h[idx][1];
  // Shortly before the first known price (weekend/holiday): take the first one
  const gap = Math.round((new Date(h[0][0] + 'T00:00:00') - new Date(iso + 'T00:00:00')) / 86400000);
  return gap <= 10 ? h[0][1] : 0;
}
function finGoalStartDate(g) { return /^\d{4}-\d{2}-\d{2}$/.test(g.created || '') ? g.created : finTodayIso(); }
// State of an ETF savings goal on a day (default: today)
function finEtfState(g, entries, atIso = finTodayIso()) {
  const q = finQuotes[g.isin] || null;
  let shares = 0, invested = 0, unpriced = 0;
  const startCost = Number(g.startBalance) || 0;
  const startShares = Number(g.startShares) || 0;
  const startDate = finGoalStartDate(g);
  const withStart = startDate <= atIso || atIso === finTodayIso();
  if (withStart) {
    invested += startCost;
    if (startShares > 0) shares += startShares;
    else if (startCost) {
      const p = finPriceAt(q, startDate);
      if (p) shares += startCost / p; else unpriced += startCost;
    }
  }
  entries.forEach(e => {
    if (e.date > atIso) return;
    const a = Number(e.amount) || 0;
    invested += a;
    if (e.shares) { shares += e.shares; return; } // imported transaction with real shares
    const p = finPriceAt(q, e.date);
    if (p) shares += a / p; else unpriced += a;
  });
  if (shares < 0 && shares > -1e-6) shares = 0;
  const today = finTodayIso();
  const price = atIso >= today ? ((q && q.price > 0) ? q.price : finPriceAt(q, atIso)) : finPriceAt(q, atIso);
  const value = price ? shares * price + unpriced : invested;
  const gain = value - invested;
  return {
    q, price, shares, unpriced,
    invested: finRound(invested), value: finRound(value), gain: finRound(gain),
    gainPct: invested > 0 ? gain / invested * 100 : 0,
    hasPrice: !!price,
    dayPct: (q && q.price > 0 && q.prev > 0) ? (q.price / q.prev - 1) * 100 : null,
  };
}
// Course of value vs. paid in (month ends up to today) for the selected ETF goals
function finEtfTimeline(slots) {
  const todayIso = finTodayIso();
  let start = todayIso;
  slots.forEach(x => {
    if ((Number(x.goal.startBalance) || Number(x.goal.startShares)) && finGoalStartDate(x.goal) < start) start = finGoalStartDate(x.goal);
    x.entries.forEach(e => { if (e.date < start) start = e.date; });
  });
  if (start >= todayIso) return [];
  const s = new Date(start + 'T00:00:00');
  const now = new Date();
  const months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth());
  const step = Math.max(1, Math.ceil(months / 48));
  const dates = [start];
  for (let k = step; k < months + 1; k += step) {
    const d = new Date(s.getFullYear(), s.getMonth() + k, 0); // month end
    const iso = isoDate(d);
    if (iso > start && iso < todayIso) dates.push(iso);
  }
  dates.push(todayIso);
  return dates.map(date => {
    let value = 0, invested = 0;
    slots.forEach(x => {
      const st = finEtfState(x.goal, x.entries, date);
      value += st.value; invested += st.invested;
    });
    return { date, value: finRound(value), invested: finRound(invested) };
  });
}
function finEtfChartSvg(points, heightPx = 150) {
  if (points.length < 2) return '';
  const W = 320, H = 130;
  const max = Math.max(1, ...points.map(p => Math.max(p.value, p.invested))) * 1.06;
  const x = i => (i / (points.length - 1) * W).toFixed(1);
  const y = v => (H - Math.max(0, v) / max * (H - 6)).toFixed(1);
  const line = key => points.map((p, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(p[key])).join(' ');
  const last = points[points.length - 1];
  const color = last.value >= last.invested ? FIN_GREEN : FIN_RED;
  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="block w-full" style="height:${heightPx}px" role="img" aria-label="${escapeHtml(tk('depot.valueDepositsOverTime'))}">
      <path d="${line('value')} L${W} ${H} L0 ${H} Z" fill="${color}" fill-opacity="0.12"></path>
      <path d="${line('invested')}" fill="none" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.5" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"></path>
      <path d="${line('value')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>
    </svg>`;
}
// Fetch prices from the server (at most every 10 minutes, unless force)
async function loadEtfQuotes(force = false, onlyIsins = null) {
  if (finQuotesLoading || isCurrentUserGuest()) return;
  const goals = finEtfGoals();
  const isins = onlyIsins || [...new Set(goals.map(g => g.isin))];
  if (!isins.length) return;
  if (!force && !onlyIsins && Date.now() - finQuotesLastLoad < 10 * 60 * 1000) return;
  const entries = finSavingsEntries();
  const todayIso = finTodayIso();
  const req = isins.map(isin => {
    let ab = finIsoAddDays(todayIso, -30);
    goals.filter(g => g.isin === isin).forEach(g => {
      const link = 'spar:' + g.id;
      entries.forEach(e => { if (e.link === link && e.date < ab) ab = e.date; });
      if (Number(g.startBalance) && finGoalStartDate(g) < ab) ab = finGoalStartDate(g);
    });
    ab = finIsoAddDays(ab, -7);
    const c = finQuotes[isin];
    const hasHist = c && Array.isArray(c.history) && c.history.length && c.histFrom && c.histFrom <= ab;
    return { isin, ab, bis: hasHist ? c.history[c.history.length - 1][0] : '' };
  });
  finQuotesLoading = true;
  if (currentView === 'finanzen' && finTab === 'sparen') finUpdateEtfRefreshBtn();
  try {
    const r = await finPost('/api/pinn/kurse', { isins: req, frisch: !!force });
    Object.values(r.kurse || {}).forEach(k => {
      if (!k || !k.isin) return;
      const old = finQuotes[k.isin] || {};
      if (!(k.price > 0) && old.price > 0) { finQuotes[k.isin] = { ...old, error: k.error || '' }; return; }
      const incoming = Array.isArray(k.history) ? k.history : [];
      const history = k.delta ? finMergeHistory(old.history, incoming) : incoming;
      const histFrom = k.delta ? (old.histFrom || k.histFrom) : k.histFrom;
      finQuotes[k.isin] = { ...k, history, histFrom, loadedAt: Date.now() };
    });
    finQuotesError = '';
    finQuotesSave();
  } catch (err) {
    finQuotesError = (err instanceof TypeError || err.retry) ? tk('depot.noConnectionServerLast') : err.message;
  } finally {
    finQuotesLoading = false;
    finQuotesLastLoad = Date.now();
    if (currentView === 'finanzen' && finTab === 'sparen') renderSavings();
  }
}
function finUpdateEtfRefreshBtn() {
  const b = document.getElementById('finEtfRefresh');
  if (b) b.innerHTML = finQuotesLoading ? '<span class="fin-etf-spin">↻</span>' : '↻';
}
function finEtfDepotHtml(ov) {
  const slots = ov.goals.filter(x => x.etf);
  if (!slots.length) return '';
  const tot = slots.reduce((a, x) => ({ value: a.value + x.etf.value, invested: a.invested + x.etf.invested }), { value: 0, invested: 0 });
  const gain = finRound(tot.value - tot.invested);
  const gainPct = tot.invested > 0 ? gain / tot.invested * 100 : 0;
  const gColor = gain >= 0 ? FIN_GREEN : FIN_RED;
  if (finEtfChartSel !== 'all' && !slots.some(x => x.goal.id === finEtfChartSel)) finEtfChartSel = 'all';
  const chartSlots = finEtfChartSel === 'all' ? slots : slots.filter(x => x.goal.id === finEtfChartSel);
  const points = finEtfTimeline(chartSlots);
  const chips = slots.length > 1 ? `<div class="flex flex-wrap gap-1.5 mt-4">
      <button type="button" class="fin-etf-chip px-2.5 py-1 rounded-full border border-ink/15 text-xs ${finEtfChartSel === 'all' ? 'active' : ''}" data-sel="all">${escapeHtml(tk('errorLog.all'))}</button>
      ${slots.map(x => `<button type="button" class="fin-etf-chip px-2.5 py-1 rounded-full border border-ink/15 text-xs ${finEtfChartSel === x.goal.id ? 'active' : ''}" data-sel="${escapeHtml(x.goal.id)}">${escapeHtml((x.goal.icon ? x.goal.icon + ' ' : '') + (x.goal.name || x.goal.isin))}</button>`).join('')}
    </div>` : '';
  const firstDate = points.length ? new Date(points[0].date + 'T00:00:00').toLocaleDateString(sysLocale(), { month: 'short', year: 'numeric' }) : '';
  const chart = points.length >= 2 ? `
    <div class="mt-3 text-ink">${finEtfChartSvg(points)}</div>
    <div class="flex justify-between text-[10px] text-ink/40 mt-1"><span>${escapeHtml(firstDate)}</span><span>${tk('bell.today')}</span></div>
    <div class="flex items-center gap-4 mt-2 text-[11px] text-ink/50">
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-0.5 rounded" style="background:${points[points.length - 1].value >= points[points.length - 1].invested ? FIN_GREEN : FIN_RED}"></span>${escapeHtml(tk('depot.value'))}</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 border-t-2 border-dashed border-ink/40"></span>${escapeHtml(tk('depot.paid'))}</span>
    </div>`
    : ('<p class="text-xs text-ink/45 mt-3">' + escapeHtml(tk('depot.historyAppearsAsSoon')) + '</p>');
  const rows = slots.map(x => {
    const g = x.goal, st = x.etf, q = st.q;
    const color = /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : FIN_GREEN;
    let sub = `${escapeHtml(finKindInfo(finGoalKind(g)).label)} · ${escapeHtml(g.isin)} · ${escapeHtml(tk('depot.sharesN', { n: finFmtShares(st.shares) }))}`;
    if (st.hasPrice) {
      sub += ` ${tk('depot.price', { amount: fmtEur(st.price) })}`;
      if (st.dayPct !== null) sub += ` <span style="color:${st.dayPct >= 0 ? FIN_GREEN : FIN_RED}">${st.dayPct >= 0 ? '▲' : '▼'} ${finFmtPct(st.dayPct).replace(/^[+−]/, '')}</span>`;
    }
    const warn = !st.hasPrice ? `<span class="block text-[11px]" style="color:${FIN_RED}">${escapeHtml(tk('depot.noPriceAtCost'))}${q && q.error ? ' (' + escapeHtml(q.error.slice(0, 80)) + ')' : ''}</span>`
      : (q && q.currency && q.currency !== 'EUR') ? `<span class="block text-[11px] text-mustard">${escapeHtml(tk('depot.priceNotConvertedEuros', { v: q.currency }))}</span>` : '';
    const imported = g.importedUntil ? `<span class="block text-[11px] text-ink/40 truncate">${escapeHtml(tk('depot.importUntilAfterwardsSavings', { date: new Date(g.importedUntil + 'T00:00:00').toLocaleDateString(sysLocale()) }))}</span>` : '';
    return `
      <button type="button" class="fin-etf-row w-full flex items-center gap-3 py-2.5 border-t border-ink/10 first:border-t-0 text-left" data-goal="${escapeHtml(g.id)}">
        <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl" style="background:${color}22">${escapeHtml(g.icon || '📈')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${escapeHtml(g.name || (q && q.name) || g.isin)}</span>
          <span class="block text-xs text-ink/50 truncate">${sub}</span>
          ${imported}
          ${warn}
        </span>
        <span class="shrink-0 text-right">
          <span class="block text-sm font-semibold">${fmtEur(st.value)}</span>
          <span class="block text-xs" style="color:${st.gain >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(st.gain)}${st.invested > 0 ? ' · ' + finFmtPct(st.gainPct) : ''}</span>
        </span>
      </button>`;
  }).join('');
  const fetched = slots.map(x => x.etf.q && x.etf.q.fetchedAt).filter(Boolean).sort().pop();
  const priceDates = slots.map(x => x.etf.q && x.etf.q.priceDate).filter(Boolean).sort();
  const stand = fetched
    ? tk('depot.pricesFetched', { time: new Date(fetched).toLocaleString(sysLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }) + (priceDates.length ? ' ' + tk('depot.priceDate', { date: new Date(priceDates[0] + 'T00:00:00').toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit' }) }) : '')
    : tk('depot.noPricesLoadedYet');
  return `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('depot.securities'))}</div>
          <div class="font-serif text-3xl">${fmtEur(tot.value)}</div>
          <div class="text-xs text-ink/50 mt-0.5">${escapeHtml(tk('depot.paidIn', { amount: fmtEur(tot.invested) }))} · <b style="color:${gColor}">${finSignedEur(gain)}${tot.invested > 0 ? ' (' + finFmtPct(gainPct) + ')' : ''}</b></div>
        </div>
        <div class="shrink-0 flex items-center gap-2">
        <button type="button" id="finEtfImport" class="w-9 h-9 rounded-lg border border-ink/15 text-ink/60 hover:text-pine hover:border-pine transition grid place-items-center text-base leading-none" aria-label="${escapeHtml(tk('depot.importTransactions'))}" title="${escapeHtml(tk('depot.importTransactions'))}">⤓</button>
        <button type="button" id="finEtfRefresh" class="shrink-0 w-9 h-9 rounded-lg border border-ink/15 text-ink/60 hover:text-pine hover:border-pine transition grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('depot.updatePrices'))}" title="${escapeHtml(tk('depot.updatePrices'))}">${finQuotesLoading ? '<span class="fin-etf-spin">↻</span>' : '↻'}</button>
        </div>
      </div>
      ${chips}
      ${chart}
      <div class="mt-3">${rows}</div>
      ${finQuotesError ? `<p class="text-xs mt-2" style="color:${FIN_RED}">${escapeHtml(finQuotesError)}</p>` : ''}
      <p class="text-[11px] text-ink/40 mt-2">${escapeHtml(stand)}. ${escapeHtml(tk('depot.priceNote'))}</p>
    </div>`;
}
function finWireEtfDepot(pane) {
  const btn = pane.querySelector('#finEtfRefresh');
  if (btn) btn.addEventListener('click', () => loadEtfQuotes(true));
  const impBtn = pane.querySelector('#finEtfImport');
  if (impBtn) impBtn.addEventListener('click', () => openImportModal(finSavingsDepot));
  pane.querySelectorAll('.fin-etf-chip').forEach(b => b.addEventListener('click', () => { finEtfChartSel = b.dataset.sel; renderSavings(); }));
  pane.querySelectorAll('.fin-etf-row').forEach(b => b.addEventListener('click', () => openGoalModal(b.dataset.goal)));
}

/* ---------- Savings: import depot transactions from a file ----------
   CSV export from a depot/broker (e.g. Trade Republic, ING, Portfolio Performance). pinn. detects the
   separator, header row and columns itself (changeable), reads purchases/savings plan executions and
   sales with ISIN, real shares and amounts and assigns them per ISIN to an ETF savings goal
   (existing or new). Distributions, taxes and account movements without an ISIN are skipped.
   Stored in finance.etfTrades: { id, goal, isin, date, type: 'buy'|'sell', amount, shares, price, fee, source }.
   The ID is built from the transaction itself - importing the same file again does not create duplicates.
   For each savings goal pinn. remembers the last imported day (importedUntil): „Sparen“ bookings from the
   expenses (e.g. the monthly savings instalment) only count for this goal after that day - so nothing is
   counted twice and future purchases simply continue via the savings instalment. */
const FIN_IMPORT_FIELDS = [
  { id: 'date', label: tk('fin.date'), re: /^(datum|date|buchungstag|buchungsdatum|handelstag|handelsdatum|ausf(ü|ue)hrungs(tag|datum)|schlusstag|valuta|zeit|time|timestamp|ausf(ü|ue)hrung)/ },
  { id: 'isin', label: 'ISIN', re: /isin/ },
  { id: 'shares', label: tk('depot.shares'), re: /(st(ü|ue)ck|anzahl|anteile|shares|quantity|menge|nominal)/ },
  { id: 'amount', label: tk('depot.amount'), re: /(betrag|value|amount|kurswert|gesamt|total|summe|umsatz|^wert$|endbetrag|investiert)/ },
  { id: 'fee', label: tk('depot.fees'), re: /(geb(ü|ue)hr|fee|provision|entgelt|kosten|commission)/ },
  { id: 'price', label: tk('depot.price2'), re: /(kurs|preis|price)/ },
  { id: 'type', label: tk('contract.kind'), re: /(typ|type|^art|gesch(ä|ae)ftsart|buchungsart|transaktion|vorgang|kategorie|category|richtung|action)/ },
  { id: 'name', label: tk('common.name'), re: /(name|wertpapier|bezeichnung|instrument|titel|security|asset|beschreibung|description|note|notiz|verwendungszweck)/ },
];
let finImport = null;

function finImportNum(v) {
  let s = String(v == null ? '' : v).replace(/[€$£\s\u00a0']/g, '').replace(/[−–—]/g, '-').replace(/[A-Za-z]/g, '');
  if (!s || s === '-') return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc >= 0) s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return isFinite(n) ? n : NaN;
}
function finImportDate(v) {
  const s = String(v || '').trim();
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
  if (m) {
    let y = Number(m[3]); if (y < 100) y += 2000;
    const mo = Number(m[2]), d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return '';
}
function finCsvParse(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}
function finDetectDelim(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 40);
  let best = ';', bestScore = -1;
  [';', ',', '\t', '|'].forEach(d => {
    const counts = lines.map(l => l.split(d).length - 1);
    const max = Math.max(0, ...counts);
    const consistent = counts.filter(c => c === max).length;
    const score = max > 0 ? consistent * 10 + max : 0;
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
}
function finNormHeader(h) { return String(h || '').toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim(); }
function finImportAutoMap(header) {
  const map = {};
  const used = new Set();
  const norm = header.map(finNormHeader);
  FIN_IMPORT_FIELDS.forEach(f => {
    let idx = norm.findIndex((h, i) => !used.has(i) && h && f.re.test(h) && !(f.id === 'price' && /kurswert/.test(h)) && !(f.id === 'amount' && /wertpapier/.test(h)));
    if (idx >= 0) { map[f.id] = idx; used.add(idx); } else map[f.id] = -1;
  });
  return map;
}
function finImportFindHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const norm = rows[i].map(finNormHeader);
    const hits = FIN_IMPORT_FIELDS.filter(f => norm.some(h => h && h.length < 60 && f.re.test(h))).length;
    if (hits >= 2 && !rows[i].some(c => finImportDate(c) && /\d/.test(c) && c.length < 30 && /\d{4}/.test(c))) return i;
  }
  return -1;
}
function finImportClassify(typeText, shares, amount) {
  const t = String(typeText || '').toLowerCase();
  if (/(dividend|aussch(ü|ue)ttung|distribution|ertrag|aussch)/.test(t)) return 'div';
  if (/(verkauf|sell|sale|veräußerung)/.test(t)) return 'sell';
  if (/(steuer|tax|vorabpauschale|zins|interest|einzahlung|deposit|auszahlung|withdraw|transfer|(ü|ue)bertrag|split|kapitalma(ß|ss)nahme|corporate)/.test(t)) return 'skip';
  if (/(kauf|buy|sparplan|savings ?plan|purchase|order|ausf(ü|ue)hrung|erwerb)/.test(t)) return 'buy';
  if (shares < 0) return 'sell';
  return 'buy';
}
function finHashId(str) {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c;
  }
  return 't' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
// Evaluate the rows with the current column assignment
function finImportBuild() {
  const imp = finImport;
  const m = imp.map;
  const col = (r, k) => (m[k] >= 0 ? (r[m[k]] || '') : '');
  const existing = new Set(finance.etfTrades.map(t => t.id));
  const seen = {};
  const out = [];
  let skipped = 0;
  imp.rows.slice(imp.headerIdx + 1).forEach((r, i) => {
    let isin = finNormIsin(col(r, 'isin'));
    if (!finValidIsin(isin)) {
      isin = '';
      for (const c of r) {
        const mm = String(c).toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g) || [];
        const ok = mm.find(finValidIsin);
        if (ok) { isin = ok; break; }
      }
    }
    const date = finImportDate(col(r, 'date'));
    if (!isin || !date) { skipped++; return; }
    let shares = finImportNum(col(r, 'shares'));
    let amount = finImportNum(col(r, 'amount'));
    let price = finImportNum(col(r, 'price'));
    let fee = Math.abs(finImportNum(col(r, 'fee'))) || 0;
    const kind = finImportClassify(col(r, 'type'), isFinite(shares) ? shares : 0, amount);
    shares = Math.abs(shares); amount = Math.abs(amount); price = Math.abs(price);
    if (!(amount > 0) && shares > 0 && price > 0) amount = shares * price;
    if (!(shares > 0) && amount > 0 && price > 0) shares = amount / price;
    if (!(price > 0) && shares > 0 && amount > 0) price = amount / shares;
    let net = amount;
    if (imp.feeAdd && fee) net = kind === 'sell' ? amount - fee : amount + fee;
    const keyBase = [isin, date, kind, (Math.round((amount || 0) * 100) / 100).toFixed(2), (Math.round((shares || 0) * 1e4) / 1e4).toFixed(4)].join('|');
    seen[keyBase] = (seen[keyBase] || 0) + 1;
    const id = finHashId(keyBase + '#' + seen[keyBase]);
    const usable = (kind === 'buy' || kind === 'sell') && net > 0;
    out.push({
      idx: i, id, isin, date, kind, name: String(col(r, 'name')).slice(0, 80),
      shares: shares > 0 ? Math.round(shares * 1e6) / 1e6 : 0,
      price: price > 0 ? Math.round(price * 1e4) / 1e4 : 0,
      amount: finRound(net), fee: finRound(fee),
      dup: existing.has(id), usable,
    });
  });
  imp.items = out;
  imp.skipped = skipped;
  // Groups per ISIN
  const groups = imp.groups || {};
  const next = {};
  out.forEach(it => {
    const g = next[it.isin] || { isin: it.isin, name: '', buy: 0, buySum: 0, sell: 0, sellSum: 0, div: 0, dup: 0 };
    if (!g.name && it.name && !finValidIsin(finNormIsin(it.name))) g.name = it.name;
    if (it.dup) g.dup++;
    else if (it.kind === 'buy' && it.usable) { g.buy++; g.buySum += it.amount; }
    else if (it.kind === 'sell' && it.usable) { g.sell++; g.sellSum += it.amount; }
    else if (it.kind === 'div') g.div++;
    next[it.isin] = g;
  });
  Object.values(next).forEach(g => {
    const prev = groups[g.isin];
    const goal = finance.savingsGoals.find(x => x.isin === g.isin && finGoalDepotId(x) === finImportDepotId);
    g.target = prev ? prev.target : (goal ? goal.id : 'new');
    const q = finQuotes[g.isin];
    if (!g.name && q && q.name) g.name = q.name;
  });
  imp.groups = next;
}
/* ---------- PDF import (e.g. ING depot transactions) ----------
   pdf.js is self-hosted under pb_public/vendor/ and is only loaded when a PDF is really chosen. The text is
   read line by line, grouped into transactions (every transaction starts with a date) and brought into the
   same table form as a CSV export - preview, assignment to the savings goals and duplicate detection then
   work exactly as with the CSV import. */
let finPdfJsPromise = null;
function finLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('Nicht gefunden: ' + src)); };
    document.head.appendChild(s);
  });
}
function finLoadPdfJs() {
  if (window.pdfjsLib && window.pdfjsLib.getDocument) return Promise.resolve(window.pdfjsLib);
  if (finPdfJsPromise) return finPdfJsPromise;
  finPdfJsPromise = (async () => {
    // Module builds (pdf.js 4.x and newer)
    for (const v of [['vendor/pdfjs/pdf.min.mjs', 'vendor/pdfjs/pdf.worker.min.mjs'], ['vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs']]) {
      try {
        const lib = await import(new URL(v[0], location.href).href);
        if (lib && lib.getDocument) { lib.GlobalWorkerOptions.workerSrc = new URL(v[1], location.href).href; return lib; }
      } catch (e) { /* next variant */ }
    }
    // Classic builds (pdf.js 3.x)
    for (const v of [['vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js'], ['vendor/pdf.min.js', 'vendor/pdf.worker.min.js']]) {
      try {
        await finLoadScript(v[0]);
        const lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
        if (lib && lib.getDocument) { lib.GlobalWorkerOptions.workerSrc = v[1]; return lib; }
      } catch (e) { /* next variant */ }
    }
    const err = new Error('pdf.js fehlt');
    err.code = 'nopdfjs';
    throw err;
  })();
  finPdfJsPromise.catch(() => { finPdfJsPromise = null; });
  return finPdfJsPromise;
}
// Text of the PDF as lines (text pieces of the same height on the page = one line)
async function finPdfToLines(buf) {
  const lib = await finLoadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach(it => {
      const str = String(it.str || '').trim();
      if (!str || !it.transform) return;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, str });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => {
      const line = r.parts.sort((a, b) => a.x - b.x).map(q => q.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    });
  }
  try { doc.destroy(); } catch (e) { /* ignore */ }
  return lines;
}
const FIN_PDF_DATE_RE = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b/;
const FIN_PDF_TYPE_RE = /(sparplan\S*|wertpapierkauf|verkauf|kauf|aussch(?:ü|ue)ttung|dividende|ertrag\S*|vorabpauschale|thesaurierung|steuer\S*|einlieferung|auslieferung|depot(?:ü|ue)bertrag|(?:ü|ue)bertrag|zinsen?)/i;
const FIN_PDF_NUM = '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2,6}|-?\\d+,\\d{2,6}';
function finPdfFindIsin(text) {
  const all = String(text).toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g) || [];
  return all.find(finValidIsin) || '';
}
// Does the text contain a transaction (type or number of pieces) - or is it only a header/footer?
function finPdfLooksLikeTrade(text) {
  return FIN_PDF_TYPE_RE.test(text) || /(st(?:ü|ue)ck|stk\.?|anteile)/i.test(text);
}
function finPdfLinesToRows(lines) {
  // 1) Group transactions: every line with a date starts a new transaction, following lines belong to it.
  //    A line with only an ISIN (without a date) is the heading of a securities section.
  const records = [];
  let cur = null, sectionIsin = '', sectionName = '';
  lines.forEach(line => {
    const dm = line.match(FIN_PDF_DATE_RE);
    const isin = finPdfFindIsin(line);
    if (dm && finImportDate(dm[0])) {
      if (cur) records.push(cur);
      cur = { lines: [line], sectionIsin, sectionName };
    } else if (isin && (!cur || !finPdfLooksLikeTrade(cur.lines.join(' ')) || finPdfFindIsin(cur.lines.join(' ')))) {
      if (cur) { records.push(cur); cur = null; }
      sectionIsin = isin;
      sectionName = line.replace(new RegExp(isin, 'i'), ' ').replace(/\b(ISIN|WKN)\b[:\s]*([A-Z0-9]{6}\b)?/gi, ' ').replace(/[|:/]+/g, ' ').replace(/\s+/g, ' ').trim();
    } else if (cur && cur.lines.length < 8) {
      cur.lines.push(line);
    }
  });
  if (cur) records.push(cur);

  // 2) Evaluate every transaction
  const rows = [[tk('fin.date'), 'ISIN', tk('contract.kind'), tk('pantry.item.unitPlaceholder'), tk('depot.price2'), tk('depot.amount'), tk('common.name')]];
  const numRe = () => new RegExp('(' + FIN_PDF_NUM + ')', 'g');
  records.forEach(rec => {
    const text = rec.lines.join(' ');
    const date = finImportDate(text.match(FIN_PDF_DATE_RE)[0]);
    const ownIsin = finPdfFindIsin(text);
    const isin = ownIsin || rec.sectionIsin;
    const sectionName = (!ownIsin || ownIsin === rec.sectionIsin) ? rec.sectionName : '';
    if (!date || !isin) return;
    const typeM = text.match(FIN_PDF_TYPE_RE);
    // Pieces: "Stück 1,234" / "1,234 Stück" / "Stk. 1,234"
    let shares = NaN;
    const sm = text.match(/(?<![\w,.])(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)\s*(?:st(?:ü|ue)ck|stk\.?|anteile)(?![a-zäöü])/i)
      || text.match(/(?:st(?:ü|ue)ck|stk\.?|anteile|nominale?)\s*:?\s*(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)(?![\d])/i);
    if (sm) shares = Math.abs(finImportNum(sm[1]));
    if (!typeM && !(shares > 0)) return; // e.g. headers/footers with a date
    // Amounts: preferably with EUR/€, otherwise all decimal numbers except the number of pieces
    const eur = [];
    const eurRe = new RegExp('(' + FIN_PDF_NUM + ')\\s*(?:EUR|€)|(?:EUR|€)\\s*(' + FIN_PDF_NUM + ')', 'gi');
    let m;
    while ((m = eurRe.exec(text))) { const v = Math.abs(finImportNum(m[1] || m[2])); if (v > 0) eur.push(v); }
    if (!eur.length) {
      const re = numRe();
      while ((m = re.exec(text))) {
        const v = Math.abs(finImportNum(m[1]));
        if (v > 0 && !(shares > 0 && Math.abs(v - shares) < 1e-9)) eur.push(v);
      }
    }
    if (!eur.length) return;
    const amount = Math.max(...eur);
    let price = NaN;
    const pm = text.match(new RegExp('kurs\\s*:?\\s*(?:EUR|€)?\\s*(' + FIN_PDF_NUM + ')', 'i'));
    if (pm) price = Math.abs(finImportNum(pm[1]));
    if (!(price > 0) && shares > 0 && eur.length > 1) {
      const target = amount / shares;
      const cand = eur.filter(v => v !== amount).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      if (cand && Math.abs(cand - target) / target < 0.1) price = cand;
    }
    let type = typeM ? typeM[0] : tk('depot.purchase');
    if (/thesaurierung/i.test(type)) type = tk('depot.accumulationTax');
    const name = (sectionName || text
      .replace(new RegExp(FIN_PDF_DATE_RE.source, 'g'), ' ')
      .replace(new RegExp(isin, 'gi'), ' ')
      .replace(numRe(), ' ')
      .replace(/\b(EUR|€|st(ü|ue)ck|stk\.?|kurs|betrag|ISIN|WKN)\b/gi, ' ')
      .replace(FIN_PDF_TYPE_RE, ' ')
      .replace(/[:|]+/g, ' ')
      .replace(/\s+/g, ' ')).trim().slice(0, 80);
    rows.push([
      date, isin, type,
      shares > 0 ? String(shares) : '',
      price > 0 ? String(price) : '',
      String(amount),
      name,
    ]);
  });
  return rows;
}

let finImportDepotId = ''; // Depot into which is imported (new positions land here)
function finImportFillDepotSelect() {
  const ds = finDepots();
  if (!finDepot(finImportDepotId)) finImportDepotId = finFallbackDepotId();
  const sel = document.getElementById('finImportDepot');
  sel.innerHTML = ds.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(finDepotLabel(d) + (d.type === 'junior' ? ' (Junior)' : ''))}</option>`).join('');
  sel.value = finImportDepotId;
  document.getElementById('finImportDepotWrap').classList.toggle('hidden', ds.length < 2);
}
// Different depot chosen: propose the assignment per ISIN again (existing position in the depot, otherwise new)
function finImportDepotChanged() {
  const did = document.getElementById('finImportDepot').value;
  if (!finDepot(did)) return;
  finImportDepotId = did;
  if (!finImport || !finImport.groups) return;
  Object.values(finImport.groups).forEach(g => {
    if (g.target === 'skip') return;
    const goal = finance.savingsGoals.find(x => x.isin === g.isin && finGoalDepotId(x) === did);
    g.target = goal ? goal.id : 'new';
  });
  renderImportBody();
}
function openImportModal(depotId = null) {
  finImportDepotId = (typeof depotId === 'string' && finDepot(depotId)) ? depotId : (finSavingsDepot || finFallbackDepotId());
  finImportFillDepotSelect();
  finImport = null;
  document.getElementById('finImportFile').value = '';
  document.getElementById('finImportFileLabel').textContent = tk('depot.selectCsvPdfFile');
  document.getElementById('finImportError').classList.add('hidden');
  document.getElementById('finImportBody').classList.add('hidden');
  document.getElementById('finImportBody').innerHTML = '';
  finImportUpdateButton();
  document.getElementById('finImportModal').classList.remove('hidden');
}
function closeImportModal() {
  document.getElementById('finImportModal').classList.add('hidden');
  finImport = null;
}
async function finImportReadFile(file) {
  const errEl = document.getElementById('finImportError');
  errEl.classList.add('hidden');
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { errEl.textContent = tk('depot.fileTooLargeMax'); errEl.classList.remove('hidden'); return; }
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const labelEl = document.getElementById('finImportFileLabel');
    labelEl.textContent = tk('depot.fileReading', { name: file.name });
    let rows = [];
    try {
      rows = finPdfLinesToRows(await finPdfToLines(await file.arrayBuffer()));
    } catch (err) {
      labelEl.textContent = tk('depot.selectCsvPdfFile');
      errEl.textContent = err && err.code === 'nopdfjs'
        ? tk('depot.pdfImportNotPossible')
        : (err && err.name === 'PasswordException' ? tk('depot.pdfReadFailedPw') : tk('depot.pdfReadFailed'));
      errEl.classList.remove('hidden');
      return;
    }
    labelEl.textContent = file.name;
    if (rows.length < 2) {
      errEl.textContent = tk('depot.noSecurityTransactionsWere');
      errEl.classList.remove('hidden');
      return;
    }
    finImport = { fileName: file.name, rows, headerIdx: 0, header: rows[0], map: finImportAutoMap(rows[0]), feeAdd: true, groups: null, excluded: new Set(), pdf: true };
    finImportBuild();
    renderImportBody();
    return;
  }
  document.getElementById('finImportFileLabel').textContent = file.name;
  const buf = await file.arrayBuffer();
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
  text = text.replace(/^\ufeff/, '');
  const delim = finDetectDelim(text);
  const rows = finCsvParse(text, delim);
  if (rows.length < 2) { errEl.textContent = tk('depot.noTableRowsWere'); errEl.classList.remove('hidden'); return; }
  let headerIdx = finImportFindHeader(rows);
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx];
  finImport = { fileName: file.name, rows, headerIdx, header, map: finImportAutoMap(header), feeAdd: true, groups: null, excluded: new Set() };
  finImportBuild();
  renderImportBody();
}
function renderImportBody() {
  const imp = finImport;
  const body = document.getElementById('finImportBody');
  if (!imp) { body.classList.add('hidden'); return; }
  const colOpts = (sel) => `<option value="-1">${escapeHtml(tk('depot.none'))}</option>` + imp.header.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${escapeHtml(h || ((tk('depot.column') + ' ') + (i + 1)))}</option>`).join('');
  const missing = imp.map.date < 0 || (imp.map.amount < 0 && imp.map.shares < 0);
  const items = imp.items;
  const usable = items.filter(it => it.usable && !it.dup);
  const groups = Object.values(imp.groups);
  const multi = finDepots().length > 1;
  const depotSuffix = x => {
    if (!multi) return '';
    const d = finDepot(finGoalDepotId(x));
    return d ? ' – ' + (d.name || tk('depot.mainName')) : '';
  };
  const goalOpts = (g) => {
    const inDepot = x => finGoalDepotId(x) === finImportDepotId;
    const same = finance.savingsGoals.filter(x => x.isin === g.isin && inDepot(x));
    const sameElsewhere = finance.savingsGoals.filter(x => x.isin === g.isin && !inDepot(x));
    const others = finance.savingsGoals.filter(x => x.isin !== g.isin && inDepot(x));
    return [
      ...same.map(x => [x.id, `${x.icon || '📈'} ${x.name || x.isin} (${tk('depot.sameIsin')})`]),
      ['new', tk('depot.newPosition', { name: (g.name || g.isin).slice(0, 40) })],
      ...others.map(x => [x.id, `${x.icon || '🎯'} ${x.name || tk('depot.position')}${x.isin ? ' · ' + x.isin : ''}`]),
      ...sameElsewhere.map(x => [x.id, `${x.icon || '📈'} ${x.name || x.isin} (${tk('depot.sameIsin')}${depotSuffix(x)})`]),
      ['skip', tk('depot.donTImport')],
    ].map(([v, t]) => `<option value="${escapeHtml(v)}" ${g.target === v ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
  };
  const kindLabel = { buy: tk('depot.purchase'), sell: tk('depot.sale'), div: tk('depot.distribution'), skip: tk('depot.skipped') };
  const rowsHtml = items.slice(0, 600).map(it => {
    const selectable = it.usable && !it.dup && (imp.groups[it.isin] || {}).target !== 'skip';
    const checked = selectable && !imp.excluded.has(it.id);
    return `
      <label class="flex items-center gap-2 py-1 text-xs border-t border-ink/5 first:border-t-0 ${selectable ? 'cursor-pointer' : 'opacity-45'}">
        <input type="checkbox" class="fin-imp-row w-4 h-4 shrink-0" data-id="${escapeHtml(it.id)}" ${checked ? 'checked' : ''} ${selectable ? '' : 'disabled'} />
        <span class="shrink-0 w-20">${escapeHtml(new Date(it.date + 'T00:00:00').toLocaleDateString(sysLocale()))}</span>
        <span class="shrink-0 w-20">${escapeHtml(it.dup ? tk('depot.alreadyThere') : kindLabel[it.kind])}</span>
        <span class="flex-1 min-w-0 truncate font-mono">${escapeHtml(it.isin)}</span>
        <span class="shrink-0 w-20 text-right">${it.shares ? finFmtShares(it.shares) : '–'}</span>
        <span class="shrink-0 w-20 text-right font-semibold">${it.amount ? fmtEur(it.amount) : '–'}</span>
      </label>`;
  }).join('');
  body.innerHTML = `
    <div class="rounded-xl bg-ink/5 px-3 py-2.5 text-sm">
      ${tk('depot.tradesFound', { n: '<b>' + usable.length + '</b>' })} · ${escapeHtml(tk('depot.isinsN', { n: groups.length }))}
      ${items.filter(i => i.dup).length ? ` ${tk('depot.alreadyImported', { v: items.filter(i => i.dup).length })}` : ''}
      ${imp.skipped ? `<span class="block text-xs text-ink/50 mt-0.5">${escapeHtml(tk('depot.rowsWithoutIsinDate', { v: imp.skipped }))}</span>` : ''}
    </div>

    <details class="mt-3 rounded-xl border border-ink/10 px-3 py-2" ${missing ? 'open' : ''}>
      <summary class="text-sm cursor-pointer select-none">${escapeHtml(tk('depot.mapColumns'))} ${missing ? '<span class="text-xs" style="color:' + FIN_RED + ('">' + escapeHtml(tk('depot.pleaseCheck')) + '</span>') : ('<span class="text-xs text-ink/45">' + escapeHtml(tk('depot.recognisedAutomatically')) + '</span>')}</summary>
      <div class="grid grid-cols-2 gap-2 mt-3">
        ${FIN_IMPORT_FIELDS.map(f => `
          <label class="block min-w-0">
            <span class="block text-[11px] uppercase tracking-wide text-ink/40 mb-0.5">${f.label}</span>
            <select class="fin-imp-map w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white" data-field="${f.id}">${colOpts(imp.map[f.id])}</select>
          </label>`).join('')}
      </div>
      <label class="flex items-center gap-2 text-xs mt-3 cursor-pointer select-none">
        <input id="finImpFeeAdd" type="checkbox" class="w-4 h-4" ${imp.feeAdd ? 'checked' : ''} ${imp.map.fee < 0 ? 'disabled' : ''} />
        <span>${escapeHtml(tk('depot.addFeesAmountOnly'))}</span>
      </label>
      <p class="text-[11px] text-ink/45 mt-2">${escapeHtml(tk('depot.headerRow', { row: imp.headerIdx + 1 }))}</p>
    </details>

    ${groups.length ? `<h4 class="text-xs uppercase tracking-wide text-ink/40 mt-4 mb-2">${escapeHtml(tk('depot.assignmentPerSecurity', { name: multi ? ' · ' + tk('depot.newPositionsInto', { name: (finDepot(finImportDepotId) || {}).name || tk('depot.mainName') }) : '' }))}</h4>
    <div class="flex flex-col gap-2">
      ${groups.map(g => `
        <div class="rounded-xl border border-ink/10 p-3">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-medium truncate">${escapeHtml(g.name || g.isin)}</span>
            <span class="shrink-0 text-xs font-mono text-ink/50">${escapeHtml(g.isin)}</span>
          </div>
          <div class="text-xs text-ink/50 mt-0.5">${escapeHtml(tk('depot.buysN', { n: g.buy }))} ${g.buy ? fmtEur(g.buySum) : ''}${g.sell ? ` ${tk('depot.sales', { v: g.sell, amount: fmtEur(g.sellSum) })}` : ''}${g.div ? ` ${tk('depot.distributionsNotCounted', { v: g.div })}` : ''}${g.dup ? ` ${tk('depot.alreadyImported', { v: g.dup })}` : ''}</div>
          <select class="fin-imp-goal w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white mt-2" data-isin="${escapeHtml(g.isin)}">${goalOpts(g)}</select>
        </div>`).join('')}
    </div>` : ('<p class="text-sm text-ink/50 mt-4">' + escapeHtml(tk('depot.noTransactionsWithIsin')) + '</p>')}

    ${items.length ? `<details class="mt-3 rounded-xl border border-ink/10 px-3 py-2">
      <summary class="text-sm cursor-pointer select-none">${escapeHtml(tk('depot.checkIndividualTransactions', { v: items.length }))}</summary>
      <div class="mt-2 max-h-72 overflow-y-auto">${rowsHtml}</div>
      ${items.length > 600 ? ('<p class="text-[11px] text-ink/45 mt-1">' + escapeHtml(tk('depot.first600RowsAre')) + '</p>') : ''}
    </details>` : ''}
    <p class="text-[11px] text-ink/45 mt-3">${escapeHtml(tk('depot.afterImportSavingsTransactions'))}</p>`;
  body.classList.remove('hidden');
  body.querySelectorAll('.fin-imp-map').forEach(sel => sel.addEventListener('change', () => {
    imp.map[sel.dataset.field] = Number(sel.value);
    finImportBuild(); renderImportBody();
  }));
  const feeBox = body.querySelector('#finImpFeeAdd');
  if (feeBox) feeBox.addEventListener('change', () => { imp.feeAdd = feeBox.checked; finImportBuild(); renderImportBody(); });
  body.querySelectorAll('.fin-imp-goal').forEach(sel => sel.addEventListener('change', () => {
    imp.groups[sel.dataset.isin].target = sel.value;
    renderImportBody();
  }));
  body.querySelectorAll('.fin-imp-row').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) imp.excluded.delete(cb.dataset.id); else imp.excluded.add(cb.dataset.id);
    finImportUpdateButton();
  }));
  finImportUpdateButton();
}
function finImportSelected() {
  if (!finImport || !finImport.items) return [];
  return finImport.items.filter(it => it.usable && !it.dup && !finImport.excluded.has(it.id)
    && finImport.groups[it.isin] && finImport.groups[it.isin].target !== 'skip');
}
function finImportUpdateButton() {
  const btn = document.getElementById('saveFinImportBtn');
  const n = finImportSelected().length;
  btn.disabled = !n;
  btn.textContent = n ? tk('depot.importTransactions2', { n }) : tk('depot.import');
}
function saveImportFromModal() {
  const sel = finImportSelected();
  if (!sel.length) return;
  const goalFor = {};
  let goals = finance.savingsGoals.slice();
  const newGoals = [];
  Object.values(finImport.groups).forEach(g => {
    if (g.target === 'skip') return;
    const rows = sel.filter(it => it.isin === g.isin);
    if (!rows.length) return;
    if (g.target === 'new' || !goals.some(x => x.id === g.target)) {
      const first = rows.reduce((m, it) => (it.date < m ? it.date : m), rows[0].date);
      const goal = {
        id: 'g' + newRecordId().slice(0, 12), depot: finDepot(finImportDepotId) ? finImportDepotId : finFallbackDepotId(),
        created: first, name: (g.name || g.isin).slice(0, 40), icon: '📈',
        color: FIN_GOAL_COLORS[(goals.length + newGoals.length) % FIN_GOAL_COLORS.length],
        target: null, targetDate: '', startBalance: 0, isin: g.isin, startShares: 0,
      };
      newGoals.push(goal);
      goalFor[g.isin] = goal.id;
    } else {
      goalFor[g.isin] = g.target;
    }
  });
  goals = goals.concat(newGoals);
  const trades = sel.filter(it => goalFor[it.isin]).map(it => ({
    id: it.id, goal: goalFor[it.isin], isin: it.isin, date: it.date, type: it.kind,
    amount: it.amount, shares: it.shares, price: it.price, fee: it.fee, source: String(finImport.fileName || '').slice(0, 60),
  }));
  const maxByGoal = {};
  trades.forEach(t => { if (!maxByGoal[t.goal] || t.date > maxByGoal[t.goal]) maxByGoal[t.goal] = t.date; });
  goals = goals.map(g => {
    const mx = maxByGoal[g.id];
    if (!mx) return g;
    const upd = { ...g, importedUntil: (g.importedUntil && g.importedUntil > mx) ? g.importedUntil : mx };
    if (!upd.isin) { const t = trades.find(x => x.goal === g.id); if (t) upd.isin = t.isin; }
    const firstTrade = trades.filter(x => x.goal === g.id).reduce((m, x) => (x.date < m ? x.date : m), mx);
    if (!upd.created || firstTrade < upd.created) upd.created = firstTrade;
    return upd;
  });
  const existing = new Set(finance.etfTrades.map(t => t.id));
  finance.savingsGoals = goals;
  finance.etfTrades = finance.etfTrades.concat(trades.filter(t => !existing.has(t.id))).slice(-5000);
  persistState();
  closeImportModal();
  renderFinance();
  loadEtfQuotes(true, [...new Set(trades.map(t => t.isin))]);
  finShowToast(tk('depot.transactionsImported', { v: trades.length, v2: newGoals.length ? ', ' + tk('depot.positionsCreatedN', { n: newGoals.length }) : '' }));
}
function removeGoalImports(goalId) {
  const g = finGoal(goalId);
  const n = finance.etfTrades.filter(t => t.goal === goalId).length;
  if (!g || !n) return;
  if (!confirm(tk('depot.removeImportedTransactionsAfterwards', { n, name: g.name }))) return;
  finance.etfTrades = finance.etfTrades.filter(t => t.goal !== goalId);
  finance.savingsGoals = finance.savingsGoals.map(x => {
    if (x.id !== goalId) return x;
    const { importedUntil, ...rest } = x;
    return rest;
  });
  persistState();
  closeGoalModal();
  renderFinance();
  finShowToast(tk('depot.importedTransactionsRemoved'));
}
// „Sparen“ booking without a (valid) assignment: find the savings goal via the name / the ISIN in the description
function finMatchGoalByText(text, depotId = null) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const goals = depotId ? finGoalsInDepot(depotId) : finance.savingsGoals;
  const isins = raw.toUpperCase().match(/[A-Z]{2}[A-Z0-9]{9}[0-9]/g) || [];
  for (const i of isins) { const g = goals.find(x => x.isin === i); if (g) return g; }
  // General words such as „Sparrate“ or „ETF“ do not count
  const STOP = new Set(['sparrate', 'sparplan', 'spar', 'rate', 'etf', 'etfs', 'monatlich', 'monatliche', 'einzahlung', 'kauf', 'ucits', 'acc', 'dist', 'thes', 'aussch', 'für', 'fuer', 'den', 'die', 'der', 'und', 'in', 'auf']);
  const clean = str => String(str || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').split(' ').filter(w => w && !STOP.has(w));
  const tWords = clean(raw);
  if (!tWords.length) return null;
  const t = tWords.join(' ');
  let best = null, bestScore = 0;
  goals.forEach(g => {
    const nWords = clean(g.name);
    if (!nWords.length) return;
    const n = nWords.join(' ');
    let score = 0;
    if (n.length >= 3 && (t.includes(n) || (t.length >= 4 && n.includes(t)))) score = 100 + n.length;
    else {
      const shared = nWords.filter(w => w.length >= 3 && tWords.includes(w)).length;
      if (shared >= 2 || (shared === 1 && nWords.length === 1)) score = shared * 10;
    }
    if (score > bestScore) { best = g; bestScore = score; }
  });
  return best;
}
function finResolveSavingsLink(e) {
  const l = finLinkParse(e.link);
  if (l && l.type === 'spar' && finGoal(l.id)) return e.link;
  if (l && l.type === 'depot' && finDepot(l.id)) return e.link; // deliberately assigned to the depot only
  const g = finMatchGoalByText(e.title) || finMatchGoalByText(e.note);
  return g ? 'spar:' + g.id : (e.link || '');
}

/* ---------- Savings: display ----------
   Without an opened depot: overall overview (only the depots that the own profile counts) and below it
   all depots as cards with value, profit/loss and a small chart. Tapping opens the depot with
   key figures, securities, positions, course and bookings. */
function renderSavings() {
  const pane = document.getElementById('finPaneSparen');
  if (!pane) return;
  const emptyKind = finEmptyKind();
  if (emptyKind) { pane.innerHTML = finEmptyStateHtml(emptyKind); return; }
  if (!finance) return;
  if (finSavingsDepot && !finDepot(finSavingsDepot)) finSavingsDepot = null;
  const allEntries = finSavingsEntries(finTodayIso());
  if (finSavingsDepot) renderSavingsDepot(pane, finDepot(finSavingsDepot), allEntries);
  else renderSavingsOverview(pane, allEntries);
  if (finEtfGoals().length) loadEtfQuotes(false);
}
function finSavingsMonthStats(ov) {
  const monthRange = finPeriodRange('month', 0);
  let monthIn = 0, monthOut = 0;
  ov.entries.forEach(e => {
    if (e.date < monthRange.startIso || e.date > monthRange.endIso) return;
    const a = Number(e.amount) || 0;
    if (a >= 0) monthIn += a; else monthOut -= a;
  });
  return { monthRange, monthIn, monthOut, monthNet: finRound(monthIn - monthOut) };
}
function finSavingsMonthLine(ms) {
  return `${escapeHtml(ms.monthRange.longShort)}: <span style="color:${FIN_GREEN}">${escapeHtml(tk('depot.paidInPlus', { amount: fmtEur(ms.monthIn) }))}</span>${ms.monthOut > 0 ? ` · <span style="color:${FIN_RED}">${escapeHtml(tk('depot.withdrawnMinus', { amount: fmtEur(ms.monthOut) }))}</span>` : ''}`;
}
function finSavingsGainLine(ov) {
  if (Math.abs(ov.total - ov.invested) < 0.005) return '';
  const pct = ov.invested > 0 ? ' (' + finFmtPct(ov.gain / ov.invested * 100) + ')' : '';
  return `${escapeHtml(tk('depot.paidInTotal', { amount: fmtEur(ov.invested) }))} · <b style="color:${ov.gain >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(ov.gain)}${pct}</b>`;
}
// Course of the last 12 months (net saved per month)
function finSavingsBars(ov) {
  const months = [];
  for (let off = -11; off <= 0; off++) {
    const r = finPeriodRange('month', off);
    let net = 0;
    ov.entries.forEach(e => { if (e.date >= r.startIso && e.date <= r.endIso) net += Number(e.amount) || 0; });
    months.push({ off, range: r, net: finRound(net) });
  }
  const past6 = months.filter(m => m.off < 0 && m.off >= -6);
  const avg6 = past6.reduce((t, m) => t + m.net, 0) / 6;
  const maxAbs = Math.max(1, ...months.map(m => Math.abs(m.net)));
  const H = 110;
  const html = months.map(m => {
    const h = Math.max(m.net ? 3 : 0, Math.abs(m.net) / maxAbs * H);
    const color = m.net >= 0 ? FIN_GREEN : FIN_RED;
    const cur = m.off === 0;
    let label = m.range.short;
    // Always reserve the year row so that all bars stand at the same height
    label += `<span class="block text-[9px] leading-tight text-ink/35">${(m.range.start.getMonth() === 0 || m.off === -11) ? m.range.start.getFullYear() : '&nbsp;'}</span>`;
    return `
      <div class="flex-1 min-w-0 flex flex-col items-center gap-1" title="${escapeHtml(m.range.label + ': ' + finSignedEur(m.net))}">
        <span class="text-[10px] ${cur ? 'font-semibold text-ink' : 'text-ink/45'} whitespace-nowrap leading-none h-3" style="display:block;height:12px">${m.net ? (m.net < 0 ? '−' : '') + curPlain0(Math.abs(m.net)) : ''}</span>
        <span class="w-full flex items-end justify-center" style="height:${H}px">
          <span class="block rounded-t-md" style="width:68%;max-width:26px;height:${h}px;background:${color};opacity:${cur ? 1 : 0.7}"></span>
        </span>
        <span class="text-[10px] leading-tight text-center ${cur ? 'font-semibold text-pine' : 'text-ink/45'}">${label}</span>
      </div>`;
  }).join('');
  return { html, avg6 };
}
function finSavingsBarsCard(bars) {
  return `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-baseline justify-between gap-3 mb-3">
        <h3 class="font-serif text-base">${escapeHtml(tk('fin.trend.title'))}</h3>
        <span class="text-xs text-ink/45">${escapeHtml(tk('depot.netPerMonth'))}</span>
      </div>
      <div class="flex items-start gap-1 sm:gap-2">${bars.html}</div>
      <div class="flex items-center gap-4 mt-3 text-[11px] text-ink/50">
        <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${FIN_GREEN}"></span>${escapeHtml(tk('depot.legendMoreIn'))}</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:${FIN_RED}"></span>${escapeHtml(tk('depot.legendMoreOut'))}</span>
      </div>
    </div>`;
}
function finValueChartHtml(points) {
  if (points.length < 2) return '';
  const last = points[points.length - 1];
  const firstDate = new Date(points[0].date + 'T00:00:00').toLocaleDateString(sysLocale(), { month: 'short', year: 'numeric' });
  return `
    <div class="mt-3 text-ink">${finEtfChartSvg(points)}</div>
    <div class="flex justify-between text-[10px] text-ink/40 mt-1"><span>${escapeHtml(firstDate)}</span><span>${tk('bell.today')}</span></div>
    <div class="flex items-center gap-4 mt-2 text-[11px] text-ink/50">
      <span class="inline-flex items-center gap-1.5"><span class="w-3 h-0.5 rounded" style="background:${last.value >= last.invested ? FIN_GREEN : FIN_RED}"></span>${escapeHtml(tk('depot.value'))}</span>
      <span class="inline-flex items-center gap-1.5"><span class="w-3 border-t-2 border-dashed border-ink/40"></span>${escapeHtml(tk('depot.paid'))}</span>
    </div>`;
}
// Latest savings bookings (showDepot: show the depot as well in the overall overview)
function finSavingsRecentCard(ov, showDepot) {
  const recent = ov.entries.slice().sort((a, b) => (a.date === b.date ? String(b.created || '').localeCompare(String(a.created || '')) : (a.date < b.date ? 1 : -1))).slice(0, 25);
  const html = recent.map(e => {
    const amt = Number(e.amount) || 0;
    const l = finLinkParse(e.link);
    const g = l && l.type === 'spar' ? finGoal(l.id) : null;
    const d = showDepot ? finDepot(finLinkDepotId(e.link)) : null;
    const color = g && /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : finCategory(FIN_SAVINGS_CATEGORY).color;
    const title = finLegacyTitle(e.title) || (amt < 0 ? tk('depot.withdrawal') : tk('depot.deposit'));
    const where = (g ? (g.name || tk('depot.position')) : tk('depot.withoutPosition')) + (d ? ' · ' + (d.name || tk('depot.mainName')) : '');
    return `
      <button type="button" class="fin-save-row w-full flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-ink/5 transition text-left" data-id="${escapeHtml(e.id)}" data-rec="${escapeHtml(e.recurringId || '')}" data-goal="${e.trade && g ? escapeHtml(g.id) : ''}">
        <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-lg" style="background:${color}22">${escapeHtml(g ? (g.icon || '🎯') : (d && d.icon) || '🐷')}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-sm font-medium truncate">${e.recurringId ? '🔁 ' : e.trade ? '⤓ ' : ''}${escapeHtml(title)}${e.trade && e.shares ? ` <span class="text-xs text-ink/45 font-normal">${escapeHtml(tk('depot.shares2', { v: finFmtShares(Math.abs(e.shares)) }))}</span>` : ''}</span>
          <span class="block text-xs text-ink/45 truncate">${escapeHtml(finDayLabel(e.date))} · ${escapeHtml(where)}</span>
        </span>
        <span class="shrink-0 text-sm font-semibold" style="color:${amt >= 0 ? FIN_GREEN : FIN_RED}">${e.pending ? ('<span title="' + escapeHtml(tk('fin.notSynced')) + '">⏳</span> ') : ''}${finSignedEur(amt)}</span>
      </button>`;
  }).join('');
  return `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-2">
        <h3 class="font-serif text-base">${escapeHtml(tk('depot.savingsTransactions'))}</h3>
        <button type="button" id="finSaveAllBtn" class="text-xs text-pine">${escapeHtml(tk('depot.expenses'))}</button>
      </div>
      ${recent.length ? html : ('<p class="text-sm text-ink/40 italic">' + escapeHtml(tk('depot.noTransactionsUnderSavings')) + '</p>')}
      <p class="text-[11px] text-ink/40 mt-3">${escapeHtml(tk('depot.allTransactionsCategorySavings'))}</p>
    </div>`;
}
function finSavingsButtonsHtml() {
  return `
      <div class="flex flex-wrap gap-2 mt-4">
        <button type="button" id="finSaveDepositBtn" class="px-3 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('fin.add.deposit'))}</button>
        <button type="button" id="finSaveWithdrawBtn" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.withdraw'))}</button>
        <button type="button" id="finSaveRateBtn" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/70 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.savingsPlan'))}</button>
      </div>`;
}
// Events that the overall overview and the depot share
function finWireSavingsPane(pane, depotId) {
  const on = (sel, fn) => { const el = pane.querySelector(sel); if (el) el.addEventListener('click', fn); };
  const deposit = (goalId) => openExpenseModal({ preset: { category: FIN_SAVINGS_CATEGORY, link: goalId ? 'spar:' + goalId : finDefaultGoalLink(depotId) } });
  const withdraw = (goalId) => openExpenseModal({ preset: { category: FIN_SAVINGS_CATEGORY, link: goalId ? 'spar:' + goalId : finDefaultGoalLink(depotId), amountText: '-' } });
  on('#finSaveDepositBtn', () => deposit(null));
  on('#finSaveWithdrawBtn', () => withdraw(null));
  on('#finSaveRateBtn', () => openExpenseModal({ asRecurring: true, preset: { category: FIN_SAVINGS_CATEGORY, link: finDefaultGoalLink(depotId), title: tk('depot.savingsPlan2') } }));
  on('#finSaveAllBtn', () => { finCategoryFilter = FIN_SAVINGS_CATEGORY; finSetTab('ausgaben'); });
  on('#finSaveUnassigned', () => { finCategoryFilter = FIN_SAVINGS_CATEGORY; finSetTab('ausgaben'); });
  pane.querySelectorAll('.fin-goal').forEach(card => {
    const id = card.dataset.goal;
    card.addEventListener('click', (e) => {
      const act = e.target.closest('[data-goal-act]');
      if (act) { e.stopPropagation(); if (act.dataset.goalAct === 'in') deposit(id); else withdraw(id); return; }
      openGoalModal(id);
    });
    card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); openGoalModal(id); } });
  });
  pane.querySelectorAll('.fin-save-row').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.goal) { openGoalModal(btn.dataset.goal); return; }
    if (btn.dataset.rec) {
      const r = finance.recurring.find(x => x.id === btn.dataset.rec);
      if (r) openExpenseModal({ recurring: r });
      return;
    }
    const e = ausgaben.find(x => x.id === btn.dataset.id);
    if (e) openExpenseModal({ expense: e });
  }));
}

/* ---------- Savings: overall overview ---------- */
function renderSavingsOverview(pane, allEntries) {
  const depots = finDepots();
  const inc = finIncludedDepotIds();
  const ov = finSavingsOverview(inc, allEntries);
  const ms = finSavingsMonthStats(ov);
  const rt = finSavingsRate(inc);
  // Income without withdrawals from the savings (as a minus booking under „Sparen“ they are „Einnahmen“ as well)
  const income = finStats(ms.monthRange).byIncomeCat.filter(c => c.cat.id !== FIN_SAVINGS_CATEGORY).reduce((t, c) => t + c.total, 0);
  const quote = income > 0 ? Math.round(ms.monthNet / income * 100) : null;
  const bars = finSavingsBars(ov);
  const gainLine = finSavingsGainLine(ov);
  const chart = ov.goals.some(x => x.etf) ? finValueChartHtml(finValueTimeline(ov, 48)) : '';

  const cards = depots.map(d => {
    const dov = finSavingsOverview([d.id], allEntries);
    const pts = finValueTimeline(dov, 24);
    const incl = finDepotIncluded(d.id);
    const color = finDepotColor(d);
    const n = dov.goals.length;
    const perf = Math.abs(dov.gain) >= 0.005
      ? `<span style="color:${dov.gain >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(dov.gain)}${dov.invested > 0 ? ' · ' + finFmtPct(dov.gain / dov.invested * 100) : ''}</span>`
      : `<span class="text-ink/45">${escapeHtml(tk('depot.positionsN', { n }))}</span>`;
    return `
      <button type="button" class="fin-depot-card ${incl ? '' : 'is-out'} w-full rounded-xl border border-ink/10 p-3 text-left hover:bg-ink/5" data-depot="${escapeHtml(d.id)}" aria-label="${escapeHtml((tk('depot.mainName') + ' ') + (d.name || '') + (' ' + tk('depot.open')))}">
        <span class="flex items-center gap-3">
          <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl" style="background:${color}22">${escapeHtml(d.icon || '💼')}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(d.name || tk('depot.mainName'))}</span>
            <span class="block text-xs text-ink/50 truncate">${escapeHtml(finDepotSub(d))}</span>
          </span>
          <span class="shrink-0 text-right">
            <span class="block text-sm font-semibold">${fmtEur(dov.total)}</span>
            <span class="block text-xs">${perf}</span>
          </span>
        </span>
        ${pts.length >= 2 ? `<span class="block mt-2 text-ink">${finEtfChartSvg(pts, 44)}</span>` : ''}
        ${incl ? '' : ('<span class="block mt-2"><span class="fin-depot-tag out">' + escapeHtml(tk('depot.notYourTotalOverview')) + '</span></span>')}
      </button>`;
  }).join('');
  const picker = (finDepotPickerOpen && depots.length > 1) ? `
    <div class="rounded-xl bg-ink/5 px-3 py-2.5 mb-3">
      <div class="text-[11px] uppercase tracking-wide text-ink/40 mb-1">${escapeHtml(tk('depot.myTotalOverview'))}</div>
      ${depots.map(d => `
        <label class="fin-depot-incl-row flex items-center gap-2 py-1.5 text-sm cursor-pointer select-none">
          <input type="checkbox" class="fin-depot-incl w-4 h-4 shrink-0" data-depot="${escapeHtml(d.id)}" ${finDepotIncluded(d.id) ? 'checked' : ''} />
          <span class="truncate">${escapeHtml(finDepotLabel(d))}</span>
        </label>`).join('')}
      <p class="text-[11px] text-ink/45 mt-1">${escapeHtml(tk('depot.appliesOnlyYourProfile'))}</p>
    </div>` : '';

  pane.innerHTML = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('depot.savedTotalTitle'))}${depots.length > 1 ? ' · ' + escapeHtml(tk('depot.ofDepotsN', { k: inc.length, n: depots.length })) : ''}</div>
          <div class="font-serif text-3xl" style="color:${ov.total >= 0 ? FIN_GREEN : FIN_RED}">${fmtEur(ov.total)}</div>
          ${gainLine ? `<div class="text-xs text-ink/50 mt-0.5">${gainLine}</div>` : ''}
          <div class="text-xs text-ink/50 mt-0.5">${finSavingsMonthLine(ms)}</div>
        </div>
        <span class="fin-piggy shrink-0" aria-hidden="true">🐷</span>
      </div>
      ${!inc.length ? `<p class="text-xs mt-2" style="color:${FIN_RED}">${escapeHtml(tk('depot.noDepotYourTotal'))}</p>` : ''}
      ${chart}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        ${finTile(tk('depot.savingsPlan2'), rt.rate ? fmtEur(rt.rate) : '–', rt.rate ? tk('depot.perMonthRecurring', { v: rt.count }) : tk('depot.noRecurring'))}
        ${finTile(tk('depot.month'), `<span style="color:${ms.monthNet >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(ms.monthNet)}</span>`, 'netto')}
        ${finTile(tk('depot.savingsRate'), quote !== null ? quote + ' %' : '–', quote !== null ? tk('depot.income') : tk('depot.noIncomeBooked'))}
        ${finTile(tk('depot.6Months'), fmtEur0(bars.avg6), tk('depot.perMonth'))}
      </div>
      ${finSavingsButtonsHtml()}
    </div>

    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h3 class="font-serif text-base">${escapeHtml(tk('depot.depots'))}</h3>
        <div class="flex items-center gap-2">
          ${depots.length > 1 ? `<button type="button" id="finDepotPickBtn" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${finDepotPickerOpen ? tk('common.done') : tk('depot.selection')}</button>` : ''}
          <button type="button" id="finAddDepotBtn" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.depot'))}</button>
        </div>
      </div>
      ${picker}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${cards}</div>
      <p class="text-[11px] text-ink/40 mt-3">${escapeHtml(tk('depot.tapDepotPositionsPrices'))}</p>
    </div>

    ${finSavingsBarsCard(bars)}
    ${finSavingsRecentCard(ov, depots.length > 1)}`;

  finWireSavingsPane(pane, null);
  pane.querySelectorAll('.fin-depot-card').forEach(b => b.addEventListener('click', () => finOpenDepot(b.dataset.depot)));
  const addBtn = pane.querySelector('#finAddDepotBtn');
  if (addBtn) addBtn.addEventListener('click', () => openDepotModal(null));
  const pickBtn = pane.querySelector('#finDepotPickBtn');
  if (pickBtn) pickBtn.addEventListener('click', () => { finDepotPickerOpen = !finDepotPickerOpen; renderSavings(); });
  pane.querySelectorAll('.fin-depot-incl').forEach(cb => cb.addEventListener('change', () => {
    finSetDepotIncluded(cb.dataset.depot, cb.checked);
    renderSavings();
  }));
}

/* ---------- Savings: one depot ---------- */
function renderSavingsDepot(pane, d, allEntries) {
  const ov = finSavingsOverview([d.id], allEntries);
  const ms = finSavingsMonthStats(ov);
  const rt = finSavingsRate([d.id]);
  const bars = finSavingsBars(ov);
  const gainLine = finSavingsGainLine(ov);
  const color = finDepotColor(d);
  const incl = finDepotIncluded(d.id);

  // Positions
  const goalCards = ov.goals.map(x => {
    const g = x.goal;
    const gColor = /^#[0-9a-fA-F]{6}$/.test(g.color || '') ? g.color : FIN_GREEN;
    const target = Number(g.target) || 0;
    const pct = target ? Math.max(0, Math.min(100, Math.round(x.balance / target * 100))) : 0;
    const reached = target && x.balance >= target;
    const forecast = finGoalForecast(x);
    const kind = finGoalKind(g);
    return `
      <div class="fin-goal rounded-xl border border-ink/10 p-3 cursor-pointer hover:bg-ink/5 transition" data-goal="${escapeHtml(g.id)}" role="button" tabindex="0" aria-label="${escapeHtml((tk('depot.position') + ' ') + (g.name || '') + ' bearbeiten')}">
        <div class="flex items-center gap-3">
          <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl" style="background:${gColor}22">${escapeHtml(g.icon || finKindInfo(kind).icon)}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium truncate">${escapeHtml(g.name || tk('depot.position'))}</span>
            <span class="block text-xs text-ink/50 truncate">${target ? tk('depot.ofTarget', { amount: fmtEur(x.balance), target: fmtEur0(target) }) : `${fmtEur(x.balance)} ${x.etf ? tk('depot.value') : tk('depot.saved')}`}${kind !== 'ziel' ? ' · ' + escapeHtml(finKindInfo(kind).label) : ''}</span>
            ${x.etf ? `<span class="block text-[11px] truncate"><span class="text-ink/45">${escapeHtml(tk('depot.paidInLower', { amount: fmtEur(x.etf.invested) }))} · </span><span style="color:${x.etf.gain >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(x.etf.gain)}${x.etf.invested > 0 ? ' (' + finFmtPct(x.etf.gainPct) + ')' : ''}</span></span>` : ''}
          </span>
          ${target ? `<span class="shrink-0 text-sm font-semibold" style="color:${gColor}">${reached ? '✓' : pct + ' %'}</span>` : ''}
        </div>
        ${target ? `<div class="fin-goal-bar mt-2.5"><span class="${reached ? 'fin-goal-reached' : ''}" style="width:${pct}%;background:${gColor}"></span></div>` : ''}
        ${forecast ? `<div class="text-[11px] text-ink/50 mt-1.5">${escapeHtml(forecast)}</div>` : ''}
        ${(() => { const rl = finGoalRateLine(g.id); return rl ? `<div class="text-[11px] mt-1.5" style="color:${FIN_GREEN}">${escapeHtml(rl)}</div>` : ''; })()}
        <div class="flex gap-2 mt-2.5">
          <button type="button" data-goal-act="in" class="flex-1 px-2 py-1.5 rounded-lg bg-ink/5 text-xs hover:text-pine transition">${escapeHtml(tk('fin.add.deposit'))}</button>
          <button type="button" data-goal-act="out" class="flex-1 px-2 py-1.5 rounded-lg bg-ink/5 text-xs hover:text-pine transition">${escapeHtml(tk('depot.withdraw'))}</button>
        </div>
      </div>`;
  }).join('');
  const unassignedHtml = (ov.unassigned !== 0 || (!ov.goals.length && ov.unassignedCount)) ? `
    <button type="button" id="finSaveUnassigned" class="w-full flex items-center gap-3 mt-3 pt-3 border-t border-ink/10 text-left">
      <span class="shrink-0 w-10 h-10 rounded-full grid place-items-center text-xl bg-ink/5">🐷</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-medium">${escapeHtml(tk('depot.withoutPosition'))}</span>
        <span class="block text-xs text-ink/50">${ov.goals.length ? tk('depot.assignPositionWhenEditing') : tk('depot.transactionsAssignedOnlyDepot')}</span>
      </span>
      <span class="shrink-0 text-sm font-semibold">${fmtEur(ov.unassigned)}</span>
    </button>` : '';

  pane.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <button type="button" id="finDepotBack" class="fin-depot-back px-2.5 py-1.5 rounded-lg text-sm text-ink/60 hover:text-pine hover:bg-ink/5 transition">${escapeHtml(tk('depot.allDepots'))}</button>
      <button type="button" id="finDepotEdit" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.editDepot'))}</button>
    </div>

    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40 truncate">${escapeHtml(finDepotSub(d))}</div>
          <div class="font-serif text-lg truncate">${escapeHtml(d.name || tk('depot.mainName'))}</div>
          <div class="font-serif text-3xl" style="color:${ov.total >= 0 ? FIN_GREEN : FIN_RED}">${fmtEur(ov.total)}</div>
          ${gainLine ? `<div class="text-xs text-ink/50 mt-0.5">${gainLine}</div>` : ''}
          <div class="text-xs text-ink/50 mt-0.5">${finSavingsMonthLine(ms)}</div>
          ${incl ? '' : ('<div class="mt-1.5"><span class="fin-depot-tag out">' + escapeHtml(tk('depot.notYourTotalOverview')) + '</span></div>')}
        </div>
        <span class="shrink-0 w-12 h-12 rounded-full grid place-items-center text-2xl" style="background:${color}22" aria-hidden="true">${escapeHtml(d.icon || '💼')}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        ${finTile(tk('depot.savingsPlan2'), rt.rate ? fmtEur(rt.rate) : '–', rt.rate ? tk('depot.perMonthRecurring', { v: rt.count }) : tk('depot.noRecurring'))}
        ${finTile(tk('depot.month'), `<span style="color:${ms.monthNet >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(ms.monthNet)}</span>`, 'netto')}
        ${finTile(tk('depot.6Months'), fmtEur0(bars.avg6), tk('depot.perMonth'))}
        ${finTile(tk('depot.positions'), String(ov.goals.length), ov.goals.filter(x => x.etf).length ? tk('depot.withPrice', { v: ov.goals.filter(x => x.etf).length }) : tk('depot.withoutPrice'))}
      </div>
      ${finSavingsButtonsHtml()}
    </div>

    ${finEtfDepotHtml(ov)}

    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h3 class="font-serif text-base">${escapeHtml(tk('depot.positions'))}</h3>
        <div class="flex items-center gap-2">
          <button type="button" id="finImportBtn" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition" title="${escapeHtml(tk('depot.importDepotTransactionsFrom'))}">${escapeHtml(tk('depot.import2'))}</button>
          <button type="button" id="finAddGoalBtn" class="px-2.5 py-1 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.position2'))}</button>
        </div>
      </div>
      ${ov.goals.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${goalCards}</div>`
        : ('<p class="text-sm text-ink/45">' + escapeHtml(tk('depot.createPositionEtfShare')) + '</p>')}
      ${unassignedHtml}
    </div>

    ${finSavingsBarsCard(bars)}
    ${finSavingsRecentCard(ov, false)}`;

  finWireSavingsPane(pane, d.id);
  pane.querySelector('#finDepotBack').addEventListener('click', () => finOpenDepot(null));
  pane.querySelector('#finDepotEdit').addEventListener('click', () => openDepotModal(d.id));
  pane.querySelector('#finAddGoalBtn').addEventListener('click', () => openGoalModal(null, d.id));
  pane.querySelector('#finImportBtn').addEventListener('click', () => openImportModal(d.id));
  finWireEtfDepot(pane);
}

/* ---------- Savings: popup position (ETF, share, derivative … or savings goal) ---------- */
let editingGoalId = null;
let goalSaving = false;
// Running savings instalments of a position (recurring bookings of the category „Sparen“ assigned to the position)
function finGoalRatePlans(goalId, todayIso = finTodayIso()) {
  if (!goalId) return [];
  return finance.recurring.filter(r => r.category === FIN_SAVINGS_CATEGORY && !r.allowanceFor
    && finRecIsRunning(r, todayIso) && finResolveSavingsLink(r) === 'spar:' + goalId);
}
// e.g. „250,00 € monatlich · nächste Mo., 5. Oktober“
function finGoalRateLine(goalId) {
  const todayIso = finTodayIso();
  const plans = finGoalRatePlans(goalId, todayIso);
  if (!plans.length) return '';
  return plans.map(r => {
    const next = finRecNext(r, todayIso);
    const iv = finIntervalInfo(finRecInterval(r)).label;
    return `🔁 ${fmtEur(finRecurringAmountFor(r, next || todayIso))} ${iv.charAt(0).toLowerCase() + iv.slice(1)}${next ? ' · ' + tk('depot.nextLower', { date: finDayLabel(next) }) : ''}`;
  }).join(' · ');
}
function updateGoalRateInfo() {
  const info = document.getElementById('finGoalRateInfo');
  const raw = String(document.getElementById('finGoalRateAmount').value || '').trim();
  const amount = raw ? parseEuro(raw) : 0;
  const interval = document.getElementById('finGoalRateInterval').value || 'monthly';
  const start = document.getElementById('finGoalRateStart').value;
  const plan = editingGoalId ? finGoalRatePlans(editingGoalId)[0] : null;
  info.style.color = '';
  if (!raw) {
    info.textContent = plan
      ? tk('depot.leavingEmptyEndsSavings')
      : tk('depot.planHint', { amount: fmtEur0(250) });
    return;
  }
  if (!(amount > 0)) {
    info.textContent = tk('depot.pleaseEnterPositiveAmount');
    info.style.color = FIN_RED;
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) { info.textContent = tk('depot.pleaseChooseDayFirst'); return; }
  const probe = { start, interval };
  const next = finRecNext(probe);
  info.textContent = tk('depot.planInfo', { amount: fmtEur(amount), rhythm: finRecDescribe(probe) }) + (next ? ' ' + tk('fin.rec.next', { date: finDayLabel(next) }) : '');
  info.style.color = FIN_GREEN;
}
function openGoalModal(goalId = null, depotId = null) {
  const g = goalId ? finGoal(goalId) : null;
  editingGoalId = g ? g.id : null;
  const kind = g ? finGoalKind(g) : 'etf';
  document.getElementById('finGoalTitle').textContent = g ? tk('depot.editPosition') : tk('depot.newPosition2');
  // Depot
  const ds = finDepots();
  const depotSel = document.getElementById('finGoalDepot');
  depotSel.innerHTML = ds.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(finDepotLabel(d) + (d.type === 'junior' ? ' (Junior)' : ''))}</option>`).join('');
  depotSel.value = g ? finGoalDepotId(g) : ((depotId && finDepot(depotId)) ? depotId : (finSavingsDepot || finFallbackDepotId()));
  document.getElementById('finGoalDepotWrap').classList.toggle('hidden', ds.length < 2);
  // Type
  document.getElementById('finGoalKind').innerHTML = FIN_GOAL_KINDS.map(k => `<option value="${k.id}">${escapeHtml(k.icon + ' ' + k.label)}</option>`).join('');
  document.getElementById('finGoalKind').value = kind;
  document.getElementById('finGoalName').value = g ? (g.name || '') : '';
  document.getElementById('finGoalIcon').value = g ? (g.icon || finKindInfo(kind).icon) : finKindInfo(kind).icon;
  document.getElementById('finGoalColor').value = (g && /^#[0-9a-fA-F]{6}$/.test(g.color || '')) ? g.color : FIN_GOAL_COLORS[finance.savingsGoals.length % FIN_GOAL_COLORS.length];
  document.getElementById('finGoalTarget').value = g ? euroInputValue(g.target) : '';
  document.getElementById('finGoalDate').value = g && g.targetDate ? g.targetDate : '';
  document.getElementById('finGoalStart').value = g && Number(g.startBalance) ? euroInputValue(g.startBalance) : '';
  document.getElementById('finGoalIsin').value = g && g.isin ? g.isin : '';
  document.getElementById('finGoalShares').value = g && Number(g.startShares) ? numDec(String(g.startShares)) : '';
  document.getElementById('finGoalIsinInfo').classList.add('hidden');
  updateGoalEtfUi();
  if (g && finIsEtfGoal(g)) finShowIsinInfo(finQuotes[g.isin]);
  const trades = g ? finance.etfTrades.filter(t => t.goal === g.id) : [];
  document.getElementById('finGoalImportBox').classList.toggle('hidden', !trades.length);
  if (trades.length) {
    const buys = trades.filter(t => t.type !== 'sell');
    const sum = buys.reduce((t, x) => t + (Number(x.amount) || 0), 0);
    const until = g.importedUntil ? new Date(g.importedUntil + 'T00:00:00').toLocaleDateString(sysLocale()) : '';
    document.getElementById('finGoalImportInfo').textContent =
      tk('depot.importedTransactionsPurchasesSavings', { v: trades.length, v2: buys.length, amount: fmtEur(sum), v3: until ? ' ' + tk('depot.untilDate', { date: until }) : '' });
  }
  // Savings instalment of the position (the first running one; others can be edited in the expenses)
  const plans = g ? finGoalRatePlans(g.id) : [];
  const plan = plans[0] || null;
  const todayIso = finTodayIso();
  document.getElementById('finGoalRateAmount').value = plan ? euroInputValue(finRecurringAmountFor(plan, todayIso)) : '';
  document.getElementById('finGoalRateInterval').value = plan ? finRecInterval(plan) : 'monthly';
  document.getElementById('finGoalRateStart').value = plan ? (finRecStart(plan) || todayIso) : todayIso;
  document.getElementById('finGoalRateStartLabel').textContent = plan ? tk('depot.runningSinceFirstExecution') : tk('depot.firstExecution');
  document.getElementById('finGoalRateState').textContent = plans.length > 1 ? tk('depot.runningHereFirst', { v: plans.length }) : (plan ? tk('depot.running') : '');
  updateGoalRateInfo();
  document.getElementById('finGoalError').classList.add('hidden');
  document.getElementById('deleteFinGoalBtn').classList.toggle('hidden', !g);
  renderGoalIconPicker();
  document.getElementById('finGoalModal').classList.remove('hidden');
  armModalSnapshot('finGoalModal');
  if (!g && !isMobile()) setTimeout(() => document.getElementById('finGoalName').focus(), 50);
}
function updateGoalEtfUi() {
  const kind = document.getElementById('finGoalKind').value;
  const etf = kind !== 'ziel';
  const word = etf ? finKindInfo(kind).label.split(' / ')[0] : tk('depot.savingsGoal');
  document.getElementById('finGoalEtfOpts').classList.toggle('hidden', !etf);
  document.getElementById('finGoalKindHint').textContent = etf
    ? tk('depot.depositsAreConvertedInto')
    : tk('depot.classicSavingsGoalWithout');
  document.getElementById('finGoalName').placeholder = etf ? tk('depot.eGMsciWorld') : tk('depot.eGHolidayEmergency');
  document.getElementById('finGoalSharesLabel').textContent = kind === 'aktie' ? tk('depot.unitsAlreadyDepot') : tk('depot.sharesAlreadyDepot');
  document.getElementById('finGoalStartLabel').textContent = etf ? tk('depot.alreadyPaid') : tk('depot.alreadySaved');
  document.getElementById('finGoalStartHint').textContent = etf
    ? tk('depot.alreadyPaidWhatYou', { word })
    : tk('depot.alreadySavedMoneyThat');
}
function finShowIsinInfo(q, errText) {
  const el = document.getElementById('finGoalIsinInfo');
  if (errText) { el.textContent = errText; el.style.color = FIN_RED; el.classList.remove('hidden'); return; }
  if (!q) { el.classList.add('hidden'); return; }
  if (q.price > 0) {
    const d = q.priceDate ? new Date(q.priceDate + 'T00:00:00').toLocaleDateString(sysLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    el.textContent = `✓ ${q.name ? q.name + ' · ' : ''}${tk('depot.priceIs', { amount: fmtEur(q.price) })}${q.currency && q.currency !== 'EUR' ? ' (' + q.currency + ')' : ''}${d ? ' · ' + tk('depot.asOfDate', { date: d }) : ''}`;
    el.style.color = FIN_GREEN;
  } else {
    el.textContent = q.error ? tk('depot.noPriceFoundErr', { error: q.error }) : tk('depot.noPriceFound');
    el.style.color = FIN_RED;
  }
  el.classList.remove('hidden');
}
async function checkGoalIsin() {
  const inp = document.getElementById('finGoalIsin');
  const isin = finNormIsin(inp.value);
  inp.value = isin;
  if (!finValidIsin(isin)) { finShowIsinInfo(null, tk('depot.thatNotValidIsin')); return; }
  const btn = document.getElementById('finGoalIsinCheck');
  btn.disabled = true;
  btn.textContent = tk('settings.system.checking');
  try {
    const r = await finPost('/api/pinn/kurse', { isins: [{ isin, ab: finIsoAddDays(finTodayIso(), -30) }], frisch: true });
    const k = (r.kurse || {})[isin];
    if (k && k.price > 0) {
      const old = finQuotes[isin];
      // Do not throw away an existing longer course on the device
      if (!old || !old.histFrom || old.histFrom > k.histFrom) finQuotes[isin] = { ...k, loadedAt: Date.now() };
      else finQuotes[isin] = { ...old, price: k.price, prev: k.prev, priceDate: k.priceDate, fetchedAt: k.fetchedAt, name: k.name || old.name, source: k.source, error: '' };
      finQuotesSave();
      const nameInp = document.getElementById('finGoalName');
      if (!nameInp.value.trim() && k.name) nameInp.value = k.name.slice(0, 40);
      const iconInp = document.getElementById('finGoalIcon');
      if (iconInp.value.trim() === '🎯') { iconInp.value = finKindInfo(document.getElementById('finGoalKind').value).icon; renderGoalIconPicker(); }
    }
    finShowIsinInfo(k || { error: tk('depot.noAnswer') });
  } catch (err) {
    finShowIsinInfo(null, (err instanceof TypeError || err.retry) ? tk('common.noConnection') : err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = tk('depot.checkPrice');
  }
}
function renderGoalIconPicker() {
  const cur = document.getElementById('finGoalIcon').value.trim();
  const wrap = document.getElementById('finGoalIconPicker');
  wrap.innerHTML = FIN_GOAL_ICONS.map(ic => `<button type="button" class="fin-icon-pick w-9 h-9 rounded-lg border border-ink/10 grid place-items-center text-lg hover:border-pine transition ${ic === cur ? 'active' : ''}" data-icon="${escapeHtml(ic)}">${escapeHtml(ic)}</button>`).join('');
  wrap.querySelectorAll('.fin-icon-pick').forEach(b => b.addEventListener('click', () => {
    document.getElementById('finGoalIcon').value = b.dataset.icon;
    renderGoalIconPicker();
  }));
}
function closeGoalModal() {
  document.getElementById('finGoalModal').classList.add('hidden');
  editingGoalId = null;
}
async function saveGoalFromModal() {
  if (goalSaving) return;
  const errEl = document.getElementById('finGoalError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  const name = document.getElementById('finGoalName').value.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return showErr(tk('common.needName'));
  const targetRaw = document.getElementById('finGoalTarget').value.trim();
  const target = targetRaw ? parseEuro(targetRaw) : null;
  if (targetRaw && !(target > 0)) return showErr(tk('depot.pleaseEnterValidTarget'));
  const startRaw = document.getElementById('finGoalStart').value.trim();
  const startBalance = startRaw ? parseEuro(startRaw) : 0;
  if (startRaw && (!isFinite(startBalance) || startBalance < 0)) return showErr(tk('depot.pleaseEnterValidAmount'));
  const targetDate = document.getElementById('finGoalDate').value;
  const kind = document.getElementById('finGoalKind').value;
  const isEtf = kind !== 'ziel';
  const depotSel = document.getElementById('finGoalDepot').value;
  const depot = finDepot(depotSel) ? depotSel : finFallbackDepotId();
  const isin = finNormIsin(document.getElementById('finGoalIsin').value);
  if (isEtf && !finValidIsin(isin)) return showErr(tk('depot.pleaseEnterValidIsin'));
  const startShares = isEtf ? finParseShares(document.getElementById('finGoalShares').value) : 0;
  if (isEtf && !isFinite(startShares)) return showErr(tk('depot.pleaseEnterValidNumber'));
  // Savings instalment
  const rateRaw = document.getElementById('finGoalRateAmount').value.trim();
  const rate = rateRaw ? parseEuro(rateRaw) : 0;
  if (rateRaw && !(rate > 0)) return showErr(tk('depot.pleaseEnterPositiveAmount2'));
  if (rate > 1000000) return showErr(tk('depot.savingsPlanTooLarge'));
  const rateInterval = FIN_INTERVALS.some(i => i.id === document.getElementById('finGoalRateInterval').value) ? document.getElementById('finGoalRateInterval').value : 'monthly';
  const rateStart = document.getElementById('finGoalRateStart').value;
  if (rate > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(rateStart)) return showErr(tk('depot.pleaseChooseDayFirst2'));
  const oldGoal = editingGoalId ? finGoal(editingGoalId) : null;
  const ratePlan = oldGoal ? (finGoalRatePlans(oldGoal.id)[0] || null) : null;
  let rateApplyFrom = null;
  if (ratePlan && !(rate > 0)) {
    if (!confirm(tk('depot.savingsPlanWillEnded'))) return;
  } else if (ratePlan) {
    const scope = finScopeNeeded(ratePlan, rate, rateStart, rateInterval);
    if (scope) {
      goalSaving = true;
      let answer = null;
      try {
        answer = await finAskChangeScope({ ...scope, newAmount: rate, start: rateStart, saving: true, title: ratePlan.title || name });
      } finally {
        goalSaving = false;
      }
      if (!answer) return; // cancelled - the popup stays open
      rateApplyFrom = answer.from;
    }
  }
  const data = {
    depot,
    kind: FIN_GOAL_KINDS.some(k => k.id === kind) ? kind : 'ziel',
    isin: isEtf ? isin : '',
    startShares: isEtf ? startShares : 0,
    name,
    icon: document.getElementById('finGoalIcon').value.trim() || '🎯',
    color: /^#[0-9a-fA-F]{6}$/.test(document.getElementById('finGoalColor').value) ? document.getElementById('finGoalColor').value : FIN_GREEN,
    target: target > 0 ? target : null,
    targetDate: /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? targetDate : '',
    startBalance: finRound(startBalance),
  };
  let goalId = editingGoalId;
  if (goalId) {
    finance.savingsGoals = finance.savingsGoals.map(g => g.id === goalId ? { ...g, ...data } : g);
  } else {
    goalId = 'g' + newRecordId().slice(0, 12);
    finance.savingsGoals = [...finance.savingsGoals, { id: goalId, created: finTodayIso(), ...data }];
  }
  // Create, change or end a savings instalment - it is a recurring booking of the category „Sparen“
  // and therefore appears automatically in the depot and in the expenses
  let rateToast = '';
  if (rate > 0) {
    const keepTitle = ratePlan && ratePlan.title && ratePlan.title !== tk('depot.savingsPlan2') && !(oldGoal && ratePlan.title === oldGoal.name);
    finUpsertRecurring(ratePlan ? ratePlan.id : null, {
      title: keepTitle ? ratePlan.title : name,
      amount: finRound(rate),
      category: FIN_SAVINGS_CATEGORY,
      paidBy: ratePlan ? (ratePlan.paidBy || '') : ((currentMember() && currentMember().id) || ''),
      note: ratePlan ? (ratePlan.note || '') : '',
      link: 'spar:' + goalId,
      interval: rateInterval,
      start: rateStart,
    }, rateApplyFrom);
    rateToast = ` ${tk('depot.savingsPlan3', { amount: fmtEur(rate), v: finRecDescribe({ start: rateStart, interval: rateInterval }) })}`;
  } else if (ratePlan) {
    finEndRecurring(ratePlan.id);
    rateToast = (' ' + tk('depot.savingsPlanEnded'));
  }
  persistState();
  closeGoalModal();
  renderFinance();
  renderFinRecurringEditor();
  if (data.isin) loadEtfQuotes(true, [data.isin]);
  finShowToast(tk('depot.positionSaved', { name, rateToast }));
}
function deleteGoalFromModal() {
  const g = finGoal(editingGoalId);
  if (!g) return;
  const extra = Number(g.startBalance) > 0 ? ` ${tk('depot.startingBalanceDropped', { amount: fmtEur(g.startBalance) })}` : '';
  const nTrades = finance.etfTrades.filter(t => t.goal === g.id).length;
  const extraTrades = nTrades ? ` ${tk('depot.importedDepotTransactionsWill', { nTrades })}` : '';
  if (!confirm(tk('depot.deletePositionAssociatedTransactions', { name: g.name, extra, extraTrades }))) return;
  // Bookings stay in the same depot (instead of slipping into the main depot)
  finRelinkSavings('spar:' + g.id, 'depot:' + finGoalDepotId(g));
  finance.savingsGoals = finance.savingsGoals.filter(x => x.id !== g.id);
  finance.etfTrades = finance.etfTrades.filter(t => t.goal !== g.id);
  persistState();
  closeGoalModal();
  renderFinance();
  finShowToast(tk('depot.positionDeleted'));
}
// Re-assign „Sparen“ bookings (recurring ones in the family record, single ones via the queue)
function finRelinkSavings(fromLink, toLink) {
  finance.recurring = finance.recurring.map(r => r.link === fromLink ? { ...r, link: toLink } : r);
  ausgaben.filter(e => e.link === fromLink && e.category === FIN_SAVINGS_CATEGORY).forEach(e => {
    const { pending, ...rest } = e;
    finQueueSave({ ...rest, link: toLink });
  });
}

/* ---------- Savings: popup depot / junior depot ---------- */
let editingDepotId = null;
let depotModalType = 'depot';
function openDepotModal(depotId = null) {
  const d = depotId ? finDepot(depotId) : null;
  editingDepotId = d ? d.id : null;
  depotModalType = d && d.type === 'junior' ? 'junior' : 'depot';
  document.getElementById('finDepotTitle').textContent = d ? tk('depot.editDepot2') : tk('depot.newDepot');
  document.getElementById('finDepotName').value = d ? (d.name || '') : '';
  document.getElementById('finDepotIcon').value = d ? (d.icon || '💼') : '💼';
  document.getElementById('finDepotColor').value = d ? finDepotColor(d) : FIN_DEPOT_COLORS[finDepots().length % FIN_DEPOT_COLORS.length];
  document.getElementById('finDepotBank').value = d ? (d.bank || '') : '';
  document.getElementById('finDepotIncluded').checked = d ? finDepotIncluded(d.id) : true;
  const kidSel = document.getElementById('finDepotKid');
  kidSel.innerHTML = ('<option value="">' + escapeHtml(tk('depot.notAssignedChildYet')) + '</option>')
    + finKidCandidates().map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}</option>`).join('');
  kidSel.value = d && d.kid && memberById(d.kid) ? d.kid : '';
  document.getElementById('finDepotError').classList.add('hidden');
  document.getElementById('deleteFinDepotBtn').classList.toggle('hidden', !d);
  // Flatshare (WG): only offer a junior depot if one already exists
  document.getElementById('finDepotTypeJuniorBtn').classList.toggle('hidden', wgHidesKids() && depotModalType !== 'junior');
  updateDepotModalUi();
  document.getElementById('finDepotModal').classList.remove('hidden');
  armModalSnapshot('finDepotModal');
  if (!d && !isMobile()) setTimeout(() => document.getElementById('finDepotName').focus(), 50);
}
function updateDepotModalUi() {
  const junior = depotModalType === 'junior';
  document.querySelectorAll('.fin-depot-type-btn').forEach(b => {
    const on = b.dataset.depotType === depotModalType;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.getElementById('finDepotKidWrap').classList.toggle('hidden', !junior);
  const kid = junior ? memberById(document.getElementById('finDepotKid').value) : null;
  document.getElementById('finDepotName').placeholder = junior ? (kid ? tk('depot.juniorPhKid', { name: memberLabel(kid) }) : tk('depot.juniorPh')) : tk('depot.eGMyDepot');
  renderDepotIconPicker();
}
function setDepotModalType(type) {
  if (type !== 'depot' && type !== 'junior') return;
  depotModalType = type;
  const icon = document.getElementById('finDepotIcon');
  if (type === 'junior' && ['💼', '🏦', ''].includes(icon.value.trim())) icon.value = '🧒';
  if (type === 'depot' && ['🧒', '👧', '👦', '🐣', ''].includes(icon.value.trim())) icon.value = '💼';
  updateDepotModalUi();
}
function renderDepotIconPicker() {
  const cur = document.getElementById('finDepotIcon').value.trim();
  const wrap = document.getElementById('finDepotIconPicker');
  wrap.innerHTML = FIN_DEPOT_ICONS.map(ic => `<button type="button" class="fin-icon-pick w-9 h-9 rounded-lg border border-ink/10 grid place-items-center text-lg hover:border-pine transition ${ic === cur ? 'active' : ''}" data-icon="${escapeHtml(ic)}">${escapeHtml(ic)}</button>`).join('');
  wrap.querySelectorAll('.fin-icon-pick').forEach(b => b.addEventListener('click', () => {
    document.getElementById('finDepotIcon').value = b.dataset.icon;
    renderDepotIconPicker();
  }));
}
function closeDepotModal() {
  document.getElementById('finDepotModal').classList.add('hidden');
  editingDepotId = null;
}
function saveDepotFromModal() {
  const errEl = document.getElementById('finDepotError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  const junior = depotModalType === 'junior';
  const kidId = junior ? document.getElementById('finDepotKid').value : '';
  const kid = kidId ? memberById(kidId) : null;
  let name = document.getElementById('finDepotName').value.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name && junior) name = (tk('depot.juniorDepot') + (kid ? ' ' + memberLabel(kid) : '')).slice(0, 40);
  if (!name) return showErr(tk('common.needName'));
  const color = document.getElementById('finDepotColor').value;
  const data = {
    name,
    icon: document.getElementById('finDepotIcon').value.trim() || (junior ? '🧒' : '💼'),
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#3D5A80',
    type: junior ? 'junior' : 'depot',
    kid: kid ? kid.id : '',
    bank: document.getElementById('finDepotBank').value.replace(/\s+/g, ' ').trim().slice(0, 40),
  };
  let id = editingDepotId;
  if (id) {
    finance.depots = finance.depots.map(d => d.id === id ? { ...d, ...data } : d);
  } else {
    id = 'd' + newRecordId().slice(0, 12);
    finance.depots = [...finance.depots, { id, created: finTodayIso(), ...data }];
  }
  // Bind positions that were so far only „virtually“ assigned firmly to their depot so that they do not
  // wander when further depots are created
  finance.savingsGoals = finance.savingsGoals.map(g => (g.depot && finDepot(g.depot)) ? g : { ...g, depot: finGoalDepotId(g) });
  persistState();
  const wantIncl = document.getElementById('finDepotIncluded').checked;
  if (wantIncl !== finDepotIncluded(id)) finSetDepotIncluded(id, wantIncl);
  const isNew = !editingDepotId;
  closeDepotModal();
  if (isNew) finSavingsDepot = id; // open the new depot right away
  renderFinance();
  finShowToast(junior ? tk('depot.juniorSaved', { name }) : tk('depot.depotSaved', { name }));
}
function deleteDepotFromModal() {
  const d = finDepot(editingDepotId);
  if (!d) return;
  const others = finDepots().filter(x => x.id !== d.id);
  if (!others.length) {
    const errEl = document.getElementById('finDepotError');
    errEl.textContent = tk('depot.lastDepotCannotDeleted');
    errEl.classList.remove('hidden');
    return;
  }
  const target = others.find(x => x.id === FIN_MAIN_DEPOT) || others[0];
  const goals = finGoalsInDepot(d.id);
  const moveTxt = ' ' + (goals.length ? tk('depot.movePositionsN', { n: goals.length, name: target.name || tk('depot.mainName') }) : tk('depot.moveEntries', { name: target.name || tk('depot.mainName') }));
  if (!confirm(tk('depot.deleteDepot', { name: d.name || tk('depot.mainName'), moveTxt }))) return;
  finance.savingsGoals = finance.savingsGoals.map(g => finGoalDepotId(g) === d.id ? { ...g, depot: target.id } : g);
  finRelinkSavings('depot:' + d.id, 'depot:' + target.id);
  finance.depots = finance.depots.filter(x => x.id !== d.id);
  // bind remaining positions without a fixed depot to their previous depot
  finance.savingsGoals = finance.savingsGoals.map(g => (g.depot && finDepot(g.depot)) ? g : { ...g, depot: target.id });
  persistState();
  if (finDepotsOut.includes(d.id)) finSetDepotIncluded(d.id, true);
  closeDepotModal();
  if (finSavingsDepot === d.id) finSavingsDepot = null;
  renderFinance();
  finShowToast(tk('depot.depotDeleted'));
}

/* ---------- Pocket money: data ---------- */
function finAllowancePlans(kidId) { return finance.recurring.filter(r => r.allowanceFor === kidId); }
function finCurrentAllowance(kidId, todayIso = finTodayIso()) {
  const plans = finAllowancePlans(kidId).filter(r => finRecIsRunning(r, todayIso));
  plans.sort((a, b) => (finRecStart(b) || '').localeCompare(finRecStart(a) || ''));
  return plans[0] || null;
}
function finPocket(kidId) { return finance.pocketMoney.find(p => p.id === kidId) || null; }
// Balance of a child (null = not tracked)
function finPocketState(kidId, todayIso = finTodayIso()) {
  const p = finPocket(kidId);
  if (!p || !p.track) return null;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? p.start : '1970-01-01';
  const moves = [];
  finAllowancePlans(kidId).forEach(r => finRecDates(r, start, todayIso).forEach(d => {
    moves.push({ date: d, amount: finRecurringAmountFor(r, d), note: tk('depot.pocketMoney'), auto: true });
  }));
  finance.pocketLedger.filter(l => l.kid === kidId && l.date >= start && l.date <= todayIso).forEach(l => {
    moves.push({ id: l.id, date: l.date, amount: Number(l.amount) || 0, note: l.note || '', expenseId: l.expenseId || '' });
  });
  moves.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const balance = finRound((Number(p.startBalance) || 0) + moves.reduce((s, m) => s + m.amount, 0));
  return { start, balance, moves };
}
// Members who count as children: child page active, or already pocket money/balance
function finIsKidish(m) {
  return isKidPageEnabled(m) || finance.recurring.some(r => r.allowanceFor === m.id) || finance.pocketMoney.some(p => p.id === m.id);
}
function finAllowanceKids() { return members.filter(finIsKidish); }
function finKidCandidates() { return members.filter(finIsKidish).concat(members.filter(m => !finIsKidish(m))); }

/* ---------- Pocket money: display ---------- */
function renderAllowances() {
  const pane = document.getElementById('finPaneTaschengeld');
  if (!pane) return;
  const todayIso = finTodayIso();
  const year = todayIso.slice(0, 4);
  const kids = finAllowanceKids();
  const monthRange = finPeriodRange('month', 0);
  const monthStats = finStats(monthRange);
  const kidsCat = monthStats.byCat.find(c => c.cat.id === FIN_KIDS_CATEGORY);
  const kidsMonth = kidsCat ? kidsCat.total : 0;
  const allowanceMonth = monthStats.entries.reduce((s, e) => {
    const r = e.recurringId ? finance.recurring.find(x => x.id === e.recurringId) : null;
    return r && r.allowanceFor ? s + (Number(e.amount) || 0) : s;
  }, 0);
  const perMonth = kids.reduce((s, m) => { const p = finCurrentAllowance(m.id, todayIso); return p ? s + finRecMonthly(p, todayIso) : s; }, 0);

  const summary = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('depot.pocketMoneyPerMonth'))}</div>
          <div class="font-serif text-2xl">${fmtEur(perMonth)}</div>
          <div class="text-xs text-ink/50">${escapeHtml(tk('depot.convertedAllChildren'))}</div>
        </div>
        <div class="text-right min-w-0">
          <div class="text-[11px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('pocket.catKids'))} · ${escapeHtml(monthRange.longShort)}</div>
          <div class="font-serif text-2xl" style="color:${kidsMonth > 0 ? FIN_RED : 'inherit'}">${fmtEur(kidsMonth)}</div>
          <div class="text-xs text-ink/50">${escapeHtml(tk('pocket.ofWhich', { amount: fmtEur(allowanceMonth) }))}</div>
        </div>
      </div>
      <button type="button" id="finKidsShowExpenses" class="mt-3 text-xs text-pine">${escapeHtml(tk('depot.seeAllExpensesUnder'))}</button>
    </div>`;

  const cards = kids.map(m => {
    const plan = finCurrentAllowance(m.id, todayIso);
    const pocket = finPocketState(m.id, todayIso);
    const name = escapeHtml(memberLabel(m));
    let tiles = '';
    if (plan) {
      const next = finRecNext(plan, todayIso);
      const paidYear = finAllowancePlans(m.id).reduce((s, r) => s + finRecDates(r, year + '-01-01', todayIso).reduce((t, d) => t + finRecurringAmountFor(r, d), 0), 0);
      tiles = `<div class="grid grid-cols-3 gap-2 mt-3">
        ${finTile(tk('depot.next'), next ? escapeHtml(finDayLabel(next)) : '–', next ? fmtEur(finRecurringAmountFor(plan, next)) : '')}
        ${finTile(tk('depot.perMonth2'), fmtEur(finRecMonthly(plan, todayIso)), tk('depot.converted'))}
        ${finTile(tk('depot.sinceJan'), fmtEur(finRound(paidYear)), 'ausgezahlt')}
      </div>`;
    }
    const others = ausgaben.filter(e => e.category === FIN_KIDS_CATEGORY && e.link === 'kind:' + m.id && e.date && e.date.slice(0, 4) === year && e.date <= todayIso)
      .concat(finRecurringEntries(year + '-01-01', todayIso).filter(e => e.link === 'kind:' + m.id && e.category === FIN_KIDS_CATEGORY && !(finance.recurring.find(r => r.id === e.recurringId) || {}).allowanceFor))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    let pocketHtml = '';
    if (pocket) {
      const open = finOpenKidMoves.has(m.id);
      const moves = pocket.moves.slice(0, 10).map(mv => {
        const inner = `<span class="truncate">${escapeHtml(finDayLabel(mv.date))} · ${escapeHtml(mv.note || (mv.amount < 0 ? tk('fin.stat.spent') : tk('depot.received')))}${mv.auto ? '' : ' <span class="text-ink/35">✕</span>'}</span><span class="shrink-0 font-semibold" style="color:${mv.amount >= 0 ? FIN_GREEN : FIN_RED}">${finSignedEur(mv.amount)}</span>`;
        return mv.auto
          ? `<div class="fin-move-row flex items-center justify-between gap-2 text-xs py-1 px-1">${inner}</div>`
          : `<button type="button" class="fin-move-row w-full flex items-center justify-between gap-2 text-xs py-1 px-1 rounded-lg hover:bg-white/70 text-left" data-move="${escapeHtml(mv.id)}" title="${escapeHtml(tk('depot.deleteEntry'))}">${inner}</button>`;
      }).join('');
      pocketHtml = `
        <div class="mt-3 rounded-xl bg-ink/5 p-3">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div class="text-[10px] uppercase tracking-wide text-ink/40">${escapeHtml(tk('depot.balance'))}</div>
              <div class="text-xl font-semibold" style="color:${pocket.balance >= 0 ? FIN_GREEN : FIN_RED}">${fmtEur(pocket.balance)}</div>
            </div>
            <div class="flex gap-2">
              <button type="button" data-act="out" class="px-2.5 py-1.5 rounded-lg border border-ink/15 bg-white text-xs text-ink/70 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.spent'))}</button>
              <button type="button" data-act="in" class="px-2.5 py-1.5 rounded-lg border border-ink/15 bg-white text-xs text-ink/70 hover:text-pine hover:border-pine transition">${escapeHtml(tk('depot.received2'))}</button>
            </div>
          </div>
          ${pocket.moves.length ? `<details class="fin-kid-moves mt-2"${open ? ' open' : ''}><summary class="text-xs text-ink/50 cursor-pointer select-none">${escapeHtml(tk('depot.recentMovements'))}</summary><div class="mt-1">${moves}</div></details>` : ''}
        </div>`;
    }
    const kidPage = isKidPageEnabled(m);
    const visible = kidPage && m.kid && m.kid.showAllowance;
    const visText = visible ? tk('depot.visibleKidsPage')
      : kidPage ? tk('depot.notVisibleKidsPage')
      : tk('depot.noKidsPageActivated');
    return `
      <div class="fin-kid-card rounded-2xl bg-white border border-ink/10 shadow-sm p-4 sm:p-5" data-kid="${escapeHtml(m.id)}">
        <div class="flex items-center gap-3">
          <span class="w-12 h-12 rounded-full overflow-hidden border-2 shrink-0" style="border-color:${memberBorderColor(m)}">${memberAvatarInnerHTML(m)}</span>
          <div class="flex-1 min-w-0">
            <div class="font-serif text-lg leading-tight truncate">${name}</div>
            <div class="text-xs text-ink/50 truncate">${plan ? `${fmtEur(finRecurringAmountFor(plan, todayIso))} · ${escapeHtml(finRecDescribe(plan))}` : tk('depot.noPocketMoneySet')}</div>
          </div>
          <button type="button" data-act="edit" class="shrink-0 px-3 py-1.5 rounded-lg ${plan ? 'border border-ink/15 text-ink/60' : 'bg-pine text-white'} text-xs hover:opacity-90 transition">${plan ? tk('common.edit') : tk('depot.set')}</button>
        </div>
        ${tiles}
        ${pocketHtml}
        ${kidStarsFinHtml(m)}
        ${others > 0 ? `<p class="text-xs text-ink/50 mt-3">${escapeHtml(tk('depot.moreExpenses', { name, year }))} <b>${fmtEur(finRound(others))}</b></p>` : ''}
        <p class="text-[11px] text-ink/45 mt-3">${visText}</p>
      </div>`;
  }).join('');

  const empty = `
    <div class="rounded-2xl bg-white border border-ink/10 shadow-sm p-5 text-center">
      <div class="text-4xl mb-2">🪙</div>
      <p class="text-sm text-ink/60 mb-3">${escapeHtml(tk('depot.noPocketMoneySet2'))}</p>
      <button type="button" id="finKidsEmptyAdd" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition">${escapeHtml(tk('depot.setPocketMoney'))}</button>
    </div>`;
  const addMore = kids.length && members.some(m => !finIsKidish(m))
    ? `<button type="button" id="finKidsAddOther" class="self-start text-xs text-pine px-1">${escapeHtml(tk('depot.pocketMoneyAnotherFamily'))}</button>` : '';

  pane.innerHTML = summary + (kids.length ? cards + addMore : empty);

  pane.querySelector('#finKidsShowExpenses').addEventListener('click', () => { finCategoryFilter = FIN_KIDS_CATEGORY; finSetTab('ausgaben'); });
  const emptyBtn = pane.querySelector('#finKidsEmptyAdd');
  if (emptyBtn) emptyBtn.addEventListener('click', () => openAllowanceModal(null));
  const addOther = pane.querySelector('#finKidsAddOther');
  if (addOther) addOther.addEventListener('click', () => openAllowanceModal(null));
  pane.querySelectorAll('.fin-kid-card').forEach(card => {
    const kidId = card.dataset.kid;
    card.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.act === 'edit') openAllowanceModal(kidId);
      else openPocketModal(kidId, b.dataset.act);
    }));
    card.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => deletePocketMove(b.dataset.move)));
    card.querySelectorAll('[data-star-act]').forEach(b => b.addEventListener('click', () => kidStarFinAction(kidId, b.dataset.starAct, b.dataset.id)));
    const det = card.querySelector('.fin-kid-moves');
    if (det) det.addEventListener('toggle', () => { if (det.open) finOpenKidMoves.add(kidId); else finOpenKidMoves.delete(kidId); });
  });
}

/* ---------- Pocket money: popup ---------- */
let allowanceKidId = null;   // fixed child (editing) - for new pocket money from the selection
let allowancePlanId = null;  // running plan that is being edited
function allowanceModalKid() {
  return allowanceKidId ? memberById(allowanceKidId) : memberById(document.getElementById('finAllowanceKidSelect').value);
}
function openAllowanceModal(kidId) {
  if (!members.length) { finShowToast(tk('depot.firstCreateFamilyMembers'), true); return; }
  const kid = kidId ? memberById(kidId) : null;
  allowanceKidId = kid ? kid.id : null;
  const todayIso = finTodayIso();
  const kidSel = document.getElementById('finAllowanceKidSelect');
  if (!kid) {
    const free = finKidCandidates().filter(m => !finCurrentAllowance(m.id, todayIso));
    const list = free.length ? free : finKidCandidates();
    kidSel.innerHTML = list.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberLabel(m))}${isKidPageEnabled(m) ? ' ⭐' : ''}</option>`).join('');
  }
  document.getElementById('finAllowanceKidWrap').classList.toggle('hidden', !!kid);
  const target = allowanceModalKid();
  const plan = target ? finCurrentAllowance(target.id, todayIso) : null;
  allowancePlanId = plan ? plan.id : null;
  document.getElementById('finAllowanceTitle').textContent = kid ? tk('depot.pocketMoney2', { name: memberLabel(kid) }) : tk('depot.setPocketMoney');
  document.getElementById('finAllowanceAmount').value = plan ? euroInputValue(finRecurringAmountFor(plan, todayIso)) : '';
  document.getElementById('finAllowanceInterval').value = plan ? finRecInterval(plan) : 'weekly';
  document.getElementById('finAllowanceStart').value = plan ? (finRecStart(plan) || todayIso) : todayIso;
  fillFinPaidBySelect('finAllowancePaidBy', plan ? plan.paidBy : (currentMember() ? currentMember().id : ''));
  const pocket = target ? finPocket(target.id) : null;
  document.getElementById('finAllowanceTrack').checked = !!(pocket && pocket.track);
  document.getElementById('finAllowanceTrackStart').value = (pocket && pocket.start) || todayIso;
  document.getElementById('finAllowanceTrackBalance').value = pocket && Number(pocket.startBalance) ? euroInputValue(pocket.startBalance) : '';
  setAllowanceShowCheckbox();
  updateAllowanceModalUi();
  const hasAny = target && (finAllowancePlans(target.id).length || pocket || finance.pocketLedger.some(l => l.kid === target.id));
  document.getElementById('deleteFinAllowanceBtn').classList.toggle('hidden', !kid || !hasAny);
  document.getElementById('endFinAllowanceBtn').classList.toggle('hidden', !plan);
  document.getElementById('finAllowanceError').classList.add('hidden');
  document.getElementById('finAllowanceModal').classList.remove('hidden');
  armModalSnapshot('finAllowanceModal');
  finAutoFocusAmount(document.getElementById('finAllowanceAmount'));
}
function setAllowanceShowCheckbox() {
  const kid = allowanceModalKid();
  const box = document.getElementById('finAllowanceShowKid');
  const hint = document.getElementById('finAllowanceShowHint');
  const enabled = !!(kid && isKidPageEnabled(kid));
  box.disabled = !enabled;
  box.checked = enabled && !!(kid.kid && kid.kid.showAllowance);
  document.getElementById('finAllowanceShowWrap').classList.toggle('opacity-50', !enabled);
  hint.textContent = enabled
    ? tk('depot.childSeesAmountWhen')
    : tk('depot.noKidsPageActivated2', { name: kid ? memberLabel(kid) : tk('depot.member') });
}
function updateAllowanceModalUi() {
  const start = document.getElementById('finAllowanceStart').value;
  const interval = document.getElementById('finAllowanceInterval').value;
  const info = document.getElementById('finAllowanceInfo');
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const probe = { start, interval };
    const next = finRecNext(probe);
    info.textContent = tk('pocket.bookedInfo', { rhythm: finRecDescribe(probe) }) + (next ? ' ' + tk('pocket.nextPayout', { date: finDayLabel(next) }) : '');
  } else {
    info.textContent = '';
  }
  document.getElementById('finAllowanceTrackOpts').classList.toggle('hidden', !document.getElementById('finAllowanceTrack').checked);
}
function closeAllowanceModal() {
  document.getElementById('finAllowanceModal').classList.add('hidden');
  allowanceKidId = null;
  allowancePlanId = null;
}
function saveAllowanceFromModal() {
  const errEl = document.getElementById('finAllowanceError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  const kid = allowanceModalKid();
  if (!kid) return showErr(tk('depot.pleaseSelectChild'));
  const amount = parseEuro(document.getElementById('finAllowanceAmount').value);
  if (!(amount > 0)) return showErr(tk('fund.pleaseEnterAmount'));
  if (amount > 100000) return showErr(tk('fin.err.tooBig'));
  const interval = document.getElementById('finAllowanceInterval').value || 'weekly';
  const start = document.getElementById('finAllowanceStart').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return showErr(tk('depot.pleaseChooseDateFirst'));
  const track = document.getElementById('finAllowanceTrack').checked;
  const trackStart = document.getElementById('finAllowanceTrackStart').value;
  const trackRaw = document.getElementById('finAllowanceTrackBalance').value.trim();
  const trackBalance = trackRaw ? parseEuro(trackRaw) : 0;
  if (track && !/^\d{4}-\d{2}-\d{2}$/.test(trackStart)) return showErr(tk('depot.pleaseSpecifyFromWhen'));
  if (track && trackRaw && !isFinite(trackBalance)) return showErr(tk('depot.pleaseEnterValidBalance'));
  const todayIso = finTodayIso();

  const fields = {
    title: (tk('depot.pocketMoney') + ' ') + (kid.name || memberLabel(kid)), amount, category: FIN_KIDS_CATEGORY,
    paidBy: document.getElementById('finAllowancePaidBy').value, note: '', link: 'kind:' + kid.id,
    interval, start, allowanceFor: kid.id,
  };
  let plan = allowancePlanId ? finance.recurring.find(r => r.id === allowancePlanId) : finCurrentAllowance(kid.id, todayIso);
  if (plan && (finRecInterval(plan) !== interval || finRecStart(plan) !== start)) {
    // What was already paid out stays as it was: end the old plan after the last payout, create a new one
    const oldStart = finRecStart(plan);
    const paid = start > oldStart ? finRecDates(plan, oldStart, finIsoAddDays(start, -1)).filter(d => d <= todayIso) : [];
    if (paid.length) {
      finance.recurring = finance.recurring.map(r => r.id === plan.id ? { ...r, until: paid[paid.length - 1] } : r);
      plan = null;
    }
  }
  finUpsertRecurring(plan ? plan.id : null, fields);

  const pocket = finPocket(kid.id);
  const others = finance.pocketMoney.filter(p => p.id !== kid.id);
  if (track) finance.pocketMoney = [...others, { id: kid.id, track: true, start: trackStart, startBalance: finRound(trackBalance) }];
  else if (pocket) finance.pocketMoney = [...others, { ...pocket, track: false }];

  const showBox = document.getElementById('finAllowanceShowKid');
  if (isKidPageEnabled(kid) && !!kid.kid.showAllowance !== showBox.checked) {
    kid.kid = { ...kid.kid, showAllowance: showBox.checked };
  }
  persistState();
  closeAllowanceModal();
  renderFinance();
  if (kidPageMemberId) renderKidPage();
  finShowToast(tk('depot.pocketMoneySaved', { name: memberLabel(kid) }));
}
function endAllowanceFromModal() {
  const kid = allowanceModalKid();
  const plan = allowancePlanId ? finance.recurring.find(r => r.id === allowancePlanId) : null;
  if (!kid || !plan) return;
  if (!confirm(tk('depot.endPocketMoneyPrevious', { name: memberLabel(kid) }))) return;
  finEndRecurring(plan.id);
  persistState();
  closeAllowanceModal();
  renderFinance();
  if (kidPageMemberId) renderKidPage();
  finShowToast(tk('depot.pocketMoneyEnded'));
}
function deleteAllowanceFromModal() {
  const kid = allowanceModalKid();
  if (!kid) return;
  if (!confirm(tk('depot.completelyDeletePocketMoney', { name: memberLabel(kid) }))) return;
  finance.recurring = finance.recurring.filter(r => r.allowanceFor !== kid.id);
  finance.pocketMoney = finance.pocketMoney.filter(p => p.id !== kid.id);
  finance.pocketLedger = finance.pocketLedger.filter(l => l.kid !== kid.id);
  persistState();
  closeAllowanceModal();
  renderFinance();
  if (kidPageMemberId) renderKidPage();
  finShowToast(tk('depot.pocketMoneyDeleted'));
}

/* ---------- Pocket money: balance movement (spent / received) ---------- */
let pocketKidId = null;
let pocketKind = 'out';
function openPocketModal(kidId, kind) {
  const kid = memberById(kidId);
  if (!kid) return;
  pocketKidId = kid.id;
  pocketKind = kind === 'in' ? 'in' : 'out';
  document.getElementById('finPocketAmount').value = '';
  document.getElementById('finPocketNote').value = '';
  document.getElementById('finPocketDate').value = finTodayIso();
  document.getElementById('finPocketBook').checked = false;
  document.getElementById('finPocketError').classList.add('hidden');
  updatePocketModalUi();
  document.getElementById('finPocketModal').classList.remove('hidden');
  armModalSnapshot('finPocketModal');
  finAutoFocusAmount(document.getElementById('finPocketAmount'));
}
function updatePocketModalUi() {
  const kid = memberById(pocketKidId);
  const name = kid ? memberLabel(kid) : '';
  document.querySelectorAll('.fin-pocket-kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === pocketKind));
  document.getElementById('finPocketTitle').textContent = pocketKind === 'out' ? tk('pocket.spentTitle', { name }) : tk('pocket.receivedTitle', { name });
  document.getElementById('finPocketBookWrap').classList.toggle('hidden', pocketKind !== 'in');
}
function closePocketModal() {
  document.getElementById('finPocketModal').classList.add('hidden');
  pocketKidId = null;
}
function savePocketFromModal() {
  const errEl = document.getElementById('finPocketError');
  const showErr = (msg) => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  const kid = memberById(pocketKidId);
  if (!kid) return closePocketModal();
  const amount = Math.abs(parseEuro(document.getElementById('finPocketAmount').value));
  if (!(amount > 0)) return showErr(tk('fund.pleaseEnterAmount'));
  if (amount > 100000) return showErr(tk('fin.err.tooBig'));
  const date = document.getElementById('finPocketDate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return showErr(tk('fin.err.needDate'));
  const note = document.getElementById('finPocketNote').value.replace(/\s+/g, ' ').trim().slice(0, 120);
  const entry = { id: 'p' + newRecordId(), kid: kid.id, date, amount: pocketKind === 'out' ? -amount : amount, note, expenseId: '' };
  if (pocketKind === 'in' && document.getElementById('finPocketBook').checked) {
    const expId = newRecordId();
    finQueueSave({
      id: expId, amount, date, category: FIN_KIDS_CATEGORY, title: note || tk('pocket.extraFor', { name: kid.name || memberLabel(kid) }),
      note: '', paidBy: currentMember() ? currentMember().id : '', link: 'kind:' + kid.id,
      store: '', listId: '', items: [], createdBy: (currentUser() && currentUser().id) || '', created: new Date().toISOString(),
    });
    entry.expenseId = expId;
  }
  finance.pocketLedger = [...finance.pocketLedger, entry].slice(-1500);
  persistState();
  closePocketModal();
  renderFinance();
  if (kidPageMemberId) renderKidPage();
  finShowToast(pocketKind === 'out' ? tk('pocket.spentEntered', { amount: fmtEur(amount) }) : tk('pocket.receivedEntered', { amount: fmtEur(amount) }));
}
function deletePocketMove(id) {
  const l = finance.pocketLedger.find(x => x.id === id);
  if (!l) return;
  const linked = l.expenseId && ausgaben.some(x => x.id === l.expenseId);
  if (!confirm(tk('pocket.confirmDeleteEntry', { name: l.note || (l.amount < 0 ? tk('fin.stat.spent') : tk('pocket.received')), amount: finSignedEur(l.amount) }) + (linked ? ' ' + tk('pocket.linkedAlsoDeleted') : ''))) return;
  if (linked) finQueueDelete(l.expenseId);
  finance.pocketLedger = finance.pocketLedger.filter(x => x.id !== id);
  persistState();
  renderFinance();
  if (kidPageMemberId) renderKidPage();
}

/* ---------- Child page: show pocket money ---------- */
function kidMoney(v) {
  const r = finRound(v);
  return Number.isInteger(r) ? fmtEur0(r) : fmtEur(r);
}
function kidNextPayLabel(next, todayIso) {
  if (next === todayIso) return tk('pocket.kid.today');
  if (next === finIsoAddDays(todayIso, 1)) return tk('pocket.kid.tomorrow');
  const d = new Date(next + 'T00:00:00');
  const days = Math.round((d - new Date(todayIso + 'T00:00:00')) / 86400000);
  if (days < 7) return tk('pocket.kid.nextOn', { date: finWeekdayName(d.getDay()) });
  return tk('pocket.kid.nextOn', { date: d.toLocaleDateString(sysLocale(), { day: 'numeric', month: 'long' }) });
}
function kidAllowanceHtmlInner(m) {
  try {
    if (!finance || !m || !m.kid || !m.kid.showAllowance) return '';
    const todayIso = finTodayIso();
    const plan = finCurrentAllowance(m.id, todayIso);
    const pocket = finPocketState(m.id, todayIso);
    if (!plan && !pocket) return '';
    let lines = '';
    if (plan) {
      const next = finRecNext(plan, todayIso);
      lines += `<div class="kid-money-line">${escapeHtml(tk('pocket.kid.yours', { amount: kidMoney(finRecurringAmountFor(plan, next || todayIso)) }))}</div>`;
      lines += `<div class="kid-money-sub">${escapeHtml(FIN_KID_RHYTHM[finRecInterval(plan)] || '')}${next ? ' · ' + escapeHtml(kidNextPayLabel(next, todayIso)) : ''}</div>`;
    }
    if (pocket) lines += `<div class="kid-money-bal">${tk('pocket.kid.inYourBox', { amount: '<b>' + escapeHtml(kidMoney(pocket.balance)) + '</b>' })}</div>`;
    return `<div class="kid-money"><span class="kid-money-pig" aria-hidden="true">🐷</span><div style="min-width:0">${lines}</div></div>`;
  } catch (e) {
    return '';
  }
}

/* ---------- Events: savings goal, pocket money and balance popup ---------- */
function initSavingsAndAllowanceUi() {
  // Savings goal
  document.getElementById('closeFinGoalBtn').addEventListener('click', () => attemptCloseModal('finGoalModal', closeGoalModal));
  document.getElementById('cancelFinGoalBtn').addEventListener('click', () => attemptCloseModal('finGoalModal', closeGoalModal));
  document.getElementById('saveFinGoalBtn').addEventListener('click', saveGoalFromModal);
  document.getElementById('finGoalRateAmount').addEventListener('input', updateGoalRateInfo);
  document.getElementById('finGoalRateInterval').addEventListener('change', updateGoalRateInfo);
  document.getElementById('finGoalRateStart').addEventListener('change', updateGoalRateInfo);
  document.getElementById('deleteFinGoalBtn').addEventListener('click', deleteGoalFromModal);
  document.getElementById('finGoalIcon').addEventListener('input', renderGoalIconPicker);
  document.getElementById('finGoalKind').addEventListener('change', () => {
    updateGoalEtfUi();
    // Change the icon along while the default icon of a kind is still selected
    const icon = document.getElementById('finGoalIcon');
    if (FIN_GOAL_KINDS.some(k => k.icon === icon.value.trim())) {
      icon.value = finKindInfo(document.getElementById('finGoalKind').value).icon;
      renderGoalIconPicker();
    }
  });
  document.getElementById('finGoalIsinCheck').addEventListener('click', checkGoalIsin);
  document.getElementById('finGoalIsin').addEventListener('input', (e) => {
    const v = finNormIsin(e.target.value);
    if (v !== e.target.value) e.target.value = v;
    document.getElementById('finGoalIsinInfo').classList.add('hidden');
  });
  document.getElementById('finGoalIsin').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); checkGoalIsin(); } });
  document.getElementById('finGoalName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveGoalFromModal(); } });
  wireModalOutsideClick('finGoalModal', closeGoalModal);

  document.getElementById('finGoalImportClear').addEventListener('click', () => { if (editingGoalId) removeGoalImports(editingGoalId); });

  // Depot / junior depot
  document.getElementById('closeFinDepotBtn').addEventListener('click', () => attemptCloseModal('finDepotModal', closeDepotModal));
  document.getElementById('cancelFinDepotBtn').addEventListener('click', () => attemptCloseModal('finDepotModal', closeDepotModal));
  document.getElementById('saveFinDepotBtn').addEventListener('click', saveDepotFromModal);
  document.getElementById('deleteFinDepotBtn').addEventListener('click', deleteDepotFromModal);
  document.querySelectorAll('.fin-depot-type-btn').forEach(b => b.addEventListener('click', () => setDepotModalType(b.dataset.depotType)));
  document.getElementById('finDepotKid').addEventListener('change', updateDepotModalUi);
  document.getElementById('finDepotIcon').addEventListener('input', renderDepotIconPicker);
  document.getElementById('finDepotName').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveDepotFromModal(); } });
  wireModalOutsideClick('finDepotModal', closeDepotModal);

  // Import
  document.getElementById('finImportFile').addEventListener('change', (e) => {
    finImportReadFile(e.target.files && e.target.files[0]).catch(err => {
      const el = document.getElementById('finImportError');
      el.textContent = (tk('depot.fileCouldNotRead') + ' ') + err.message;
      el.classList.remove('hidden');
    });
  });
  document.getElementById('finImportDepot').addEventListener('change', finImportDepotChanged);
  document.getElementById('closeFinImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('cancelFinImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('saveFinImportBtn').addEventListener('click', saveImportFromModal);
  document.getElementById('finImportModal').addEventListener('click', (e) => {
    if (e.target.id !== 'finImportModal') return;
    if (finImport && !confirm(tk('depot.cancelImport'))) return;
    closeImportModal();
  });

  // Expense popup: assign a „Sparen“ booking that is named after a position (e.g. the ETF) right away -
  // if the depot is already chosen, only within this depot
  document.getElementById('expenseTitleInput').addEventListener('input', (e) => {
    if (expenseModalCategory !== FIN_SAVINGS_CATEGORY || expenseLinkTouched) return;
    const did = expenseDepotTouched ? finLinkDepotId(expenseModalLink) : null;
    const g = finMatchGoalByText(e.target.value, did);
    let want;
    if (g) want = 'spar:' + g.id;
    else if (expenseLinkAuto) want = 'depot:' + (did || finLinkDepotId(expenseModalLink));
    else return;
    if (want === expenseModalLink) return;
    expenseModalLink = want;
    expenseLinkAuto = !!g;
    updateExpenseLinkUi();
  });
  document.getElementById('expenseDepotSelect').addEventListener('change', onExpenseDepotChanged);

  // Pocket money
  document.getElementById('closeFinAllowanceBtn').addEventListener('click', () => attemptCloseModal('finAllowanceModal', closeAllowanceModal));
  document.getElementById('cancelFinAllowanceBtn').addEventListener('click', () => attemptCloseModal('finAllowanceModal', closeAllowanceModal));
  document.getElementById('saveFinAllowanceBtn').addEventListener('click', saveAllowanceFromModal);
  document.getElementById('endFinAllowanceBtn').addEventListener('click', endAllowanceFromModal);
  document.getElementById('deleteFinAllowanceBtn').addEventListener('click', deleteAllowanceFromModal);
  document.getElementById('finAllowanceInterval').addEventListener('change', updateAllowanceModalUi);
  document.getElementById('finAllowanceStart').addEventListener('change', updateAllowanceModalUi);
  document.getElementById('finAllowanceTrack').addEventListener('change', updateAllowanceModalUi);
  document.getElementById('finAllowanceKidSelect').addEventListener('change', () => { setAllowanceShowCheckbox(); updateAllowanceModalUi(); });
  document.getElementById('finAllowanceAmount').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveAllowanceFromModal(); } });
  wireModalOutsideClick('finAllowanceModal', closeAllowanceModal);

  // Balance
  document.querySelectorAll('.fin-pocket-kind-btn').forEach(b => b.addEventListener('click', () => { pocketKind = b.dataset.kind; updatePocketModalUi(); }));
  document.getElementById('closeFinPocketBtn').addEventListener('click', () => attemptCloseModal('finPocketModal', closePocketModal));
  document.getElementById('cancelFinPocketBtn').addEventListener('click', () => attemptCloseModal('finPocketModal', closePocketModal));
  document.getElementById('saveFinPocketBtn').addEventListener('click', savePocketFromModal);
  document.getElementById('finPocketAmount').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); savePocketFromModal(); } });
  wireModalOutsideClick('finPocketModal', closePocketModal);
}

/* ---------- Short feedback at the bottom ---------- */
function finShowToast(text, isError = false) {
  const el = document.getElementById('finToast');
  if (!el) return;
  el.textContent = text;
  el.style.background = isError ? FIN_RED : '';
  el.classList.remove('hidden');
  clearTimeout(finToastTimer);
  finToastTimer = setTimeout(() => el.classList.add('hidden'), isError ? 5000 : 3500);
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sparen');
