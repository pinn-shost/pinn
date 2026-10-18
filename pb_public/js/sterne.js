/* pinn. – Kids page: stars & rewards (js/sterne.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the star model (kid.stars, kidStarLog, balance, bonus), the star counter and reward shop on the kids page
   (kidBankHtml, kidRenderShop, kidRedeem, kidDecide, payout of pocket-money rewards), the stars per child under
   Finance → Pocket money (kidStarsFinHtml) and the popup to edit rewards (openKidRewardsEditor, initKidRewardsUi).
   The kids page itself is in index.html. */

/* ==========================================================
   Stars & rewards (kids page)
   ----------------------------------------------------------
   - m.kid.stars = { on, bonus, rewards: [{ id, emoji, title, cost, type: 'geld'|'medien'|'wunsch', value }] }
     Every task of the kids page earns t.stars stars (1–3, default 1); bonus = extra stars when all
     tasks of the current time of day are done.
   - m.kidStarLog = [{ id, d, n, k: 'task'|'bonus'|'extra'|'tausch', t, e, r, typ, val, s, ts }]
     List with fixed IDs (e.g. 't-<task>-<day>') so changes from several devices merge cleanly
     (pinnMergeIdList). Entries older than about 4 months move into m.kidStarBase = { n, bis }.
   - Redeeming: the child picks a reward, the stars are reserved at once (s = 'offen').
     Parents confirm on the kids page or under Finance → Pocket money; if a parent taps on the
     kids page themselves, it counts as confirmed. Pocket-money rewards land in the child's balance
     (if kept) and as an expense under „Kinder“ – in the fund where the pocket money is kept.
     Declined (s = 'nein') = the stars count again.
   ========================================================== */
const KID_REWARD_TYPES = [
  { id: 'geld', label: 'Taschengeld', icon: '💶' },
  { id: 'medien', label: 'Medienzeit', icon: '📺' },
  { id: 'wunsch', label: 'Wunsch', icon: '🎁' },
];
const KID_REWARD_EMOJIS = ['💶', '🪙', '🐷', '📺', '🎮', '📱', '🎧', '🍦', '🍫', '🍕', '🍿', '🎬', '🎡', '🏊', '⚽', '🧸', '📚', '🎨', '🛝', '🐴', '🎁', '⭐', '🌙', '🚲'];
let kidShopView = null;       // open rewards view on the kids page: { confirm: reward ID }
let kidRewardsEdit = [];      // working copy in the „Belohnungen bearbeiten“ popup
let kidRewardsEmojiFor = null;

function kidRid(p) { return (p || 'r') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function kidDefaultRewards() {
  return [
    ['📺', '30 Min. Medienzeit', 'medien', 30, 8],
    ['🎮', '1 Std. Medienzeit', 'medien', 60, 15],
    ['💶', '1 € extra', 'geld', 1, 10],
    ['🍦', 'Eis essen gehen', 'wunsch', 0, 20],
    ['🎬', 'Kinoabend', 'wunsch', 0, 60],
  ].map(([emoji, title, type, value, cost]) => {
    // Suggestions in the chosen language (the titles are stored and no longer translated)
    let t = title;
    try { if (window.PINN_I18N && PINN_I18N.t) t = PINN_I18N.t(title) || title; } catch (e) { t = title; }
    if (type === 'geld') t = t.replace('€', kidCurSymbol());
    return { id: kidRid(), emoji, title: t, type, value, cost };
  });
}
function normalizeKidStars(s) {
  const x = (s && typeof s === 'object') ? s : {};
  const types = new Set(KID_REWARD_TYPES.map(t => t.id));
  const rewards = Array.isArray(x.rewards) ? x.rewards.filter(r => r && r.id && r.title).map(r => ({
    id: String(r.id),
    emoji: r.emoji || '🎁',
    title: String(r.title).slice(0, 60),
    type: types.has(r.type) ? r.type : 'wunsch',
    value: Math.max(0, Math.min(100000, Number(r.value) || 0)),
    cost: Math.max(1, Math.min(9999, Math.round(Number(r.cost) || 1))),
  })) : [];
  return { on: !!x.on, bonus: Math.max(0, Math.min(5, Math.round(Number(x.bonus) || 0))), rewards };
}
function kidStarsOn(m) { return !!(m && m.kid && m.kid.enabled && m.kid.stars && m.kid.stars.on); }
function kidStarLog(m) { return Array.isArray(m && m.kidStarLog) ? m.kidStarLog.filter(e => e && e.id) : []; }
function kidStarBalance(m) {
  const base = (m && m.kidStarBase && Number(m.kidStarBase.n)) || 0;
  return base + kidStarLog(m).reduce((s, e) => s + (e.s === 'nein' ? 0 : (Number(e.n) || 0)), 0);
}
function kidStarPending(m) { return kidStarLog(m).filter(e => e.k === 'tausch' && e.s === 'offen'); }
// Summarise old entries – with a fixed cut-off date (start of month), so two devices get the same result
function kidStarCompact(m) {
  const cutoff = isoDate(new Date(Date.now() - 120 * 86400000)).slice(0, 7) + '-01';
  const log = kidStarLog(m);
  const old = log.filter(e => (e.d || '') < cutoff && !(e.k === 'tausch' && e.s === 'offen'));
  if (!old.length) return;
  const base = (m.kidStarBase && typeof m.kidStarBase === 'object') ? m.kidStarBase : { n: 0, bis: '' };
  m.kidStarBase = { n: (Number(base.n) || 0) + old.reduce((s, e) => s + (e.s === 'nein' ? 0 : (Number(e.n) || 0)), 0), bis: cutoff };
  const drop = new Set(old.map(e => e.id));
  m.kidStarLog = log.filter(e => !drop.has(e.id));
}
// When checking off/undoing on the kids page: credit the stars or take them off again
function kidStarsOnToggle(m, task, nowDone, period, allDone) {
  if (!kidStarsOn(m) || !task) return 0;
  const today = isoDate(new Date());
  const st = normalizeKidStars(m.kid.stars);
  const tid = 't-' + task.id + '-' + today;
  const bid = 'b-' + period + '-' + today;
  let log = kidStarLog(m).filter(e => e.id !== tid);
  let gained = 0;
  if (nowDone) {
    const n = Math.max(1, Math.min(3, Number(task.stars) || 1));
    log.push({ id: tid, d: today, n, k: 'task', t: task.title, ts: Date.now() });
    gained += n;
  }
  const hadBonus = log.some(e => e.id === bid);
  if (allDone && st.bonus > 0 && !hadBonus) {
    log.push({ id: bid, d: today, n: st.bonus, k: 'bonus', t: 'Alles geschafft', ts: Date.now() });
    gained += st.bonus;
  }
  if (!allDone && hadBonus) log = log.filter(e => e.id !== bid);
  m.kidStarLog = log;
  kidStarCompact(m);
  return gained;
}
// May the signed-in profile confirm wishes? (not the child itself, no child lock, no guests)
function kidCanApprove(m) {
  try {
    if (!m || childLockActive() || isCurrentUserGuest()) return false;
    if (typeof isDashboardKidSession === 'function' && isDashboardKidSession()) return false;
    const me = currentMember();
    return !!me && me.id !== m.id;
  } catch (e) { return false; }
}

/* ---------- Kids page: star counter and rewards ---------- */
function kidBankHtml(m) {
  if (!kidStarsOn(m)) return '';
  const pend = kidStarPending(m).length;
  return `<button type="button" class="kid-bank" id="kidBankBtn">
    <span class="kid-bank-star" aria-hidden="true">⭐</span>
    <span class="kid-bank-num" id="kidBankNum" data-no-i18n>${kidStarBalance(m)}</span>
    <span class="kid-bank-label">Sterne</span>
    <span class="kid-bank-shop"><span>🎁 Belohnungen</span>${pend ? `<span class="kid-bank-pend" data-no-i18n>${pend}</span>` : ''}</span>
  </button>`;
}
function kidRefreshBank(m, gained) {
  const btn = document.getElementById('kidBankBtn');
  if (!btn || !m) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = kidBankHtml(m);
  const fresh = tmp.firstElementChild;
  if (!fresh) { btn.remove(); return; }
  btn.replaceWith(fresh);
  if (gained > 0) {
    fresh.classList.add('bump');
    const r = fresh.getBoundingClientRect();
    const fly = document.createElement('span');
    fly.className = 'kid-bank-plus';
    fly.textContent = '+' + gained;
    fly.style.left = (r.left + r.width / 2) + 'px';
    fly.style.top = (r.top) + 'px';
    document.body.appendChild(fly);
    setTimeout(() => fly.remove(), 1200);
  }
}
function kidOpenShop(confirmId) {
  const m = memberById(kidPageMemberId);
  if (!m || !kidStarsOn(m)) return;
  kidShopView = { confirm: confirmId || '' };
  kidRenderShop();
}
function kidCloseShop() {
  kidShopView = null;
  const el = document.querySelector('#kidPage .kid-shop');
  if (el) el.remove();
}
function kidRenderShop() {
  const page = document.getElementById('kidPage');
  const m = memberById(kidPageMemberId);
  if (!m || !kidShopView || !kidStarsOn(m)) { kidCloseShop(); return; }
  let box = page.querySelector('.kid-shop');
  if (!box) {
    box = document.createElement('div');
    box.className = 'kid-shop';
    box.addEventListener('click', kidShopClick);
    page.appendChild(box);
  }
  const st = normalizeKidStars(m.kid.stars);
  const bal = kidStarBalance(m);
  const parent = kidCanApprove(m);
  const conf = kidShopView.confirm ? st.rewards.find(r => r.id === kidShopView.confirm) : null;
  let inner;
  if (conf) {
    inner = `<div class="kid-shop-confirm">
      <div class="kid-shop-big">${escapeHtml(conf.emoji)}</div>
      <div class="kid-shop-q">${escapeHtml(conf.title)}</div>
      <div class="kid-shop-cost"><span data-no-i18n>${conf.cost}</span> ⭐</div>
      <div class="kid-shop-ask">Eintauschen?</div>
      <div class="kid-shop-actions">
        <button type="button" class="kid-shop-btn no" data-shop="back">Doch nicht</button>
        <button type="button" class="kid-shop-btn yes" data-shop="buy" data-id="${kidAttr(conf.id)}">Ja, bitte! 🎉</button>
      </div>
    </div>`;
  } else {
    const cards = st.rewards.map(r => {
      const can = bal >= r.cost;
      return `<button type="button" class="kid-reward${can ? ' can' : ''}" data-shop="pick" data-id="${kidAttr(r.id)}">
        <span class="kid-reward-emoji">${escapeHtml(r.emoji)}</span>
        <span class="kid-reward-title">${escapeHtml(r.title)}</span>
        <span class="kid-reward-cost"><span data-no-i18n>${r.cost}</span> ⭐</span>
        ${can ? '' : `<span class="kid-reward-miss">noch ${r.cost - bal} ⭐</span>`}
      </button>`;
    }).join('');
    const pend = kidStarPending(m).map(e => `<div class="kid-pend-row">
        <span class="kid-pend-emoji">${escapeHtml(e.e || '🎁')}</span>
        <span class="kid-pend-main"><span class="kid-pend-title">${escapeHtml(e.t || '')}</span><span class="kid-pend-sub">⏳ wartet auf OK</span></span>
        ${parent ? `<button type="button" class="kid-pend-btn no" data-shop="nein" data-id="${kidAttr(e.id)}" aria-label="Ablehnen">✕</button><button type="button" class="kid-pend-btn ok" data-shop="ok" data-id="${kidAttr(e.id)}">OK</button>` : ''}
      </div>`).join('');
    inner = `<div class="kid-shop-head">
        <div class="kid-shop-title">🎁 Belohnungen</div>
        <div class="kid-shop-bal"><span>Du hast</span> <b data-no-i18n>${bal}</b> ⭐</div>
      </div>
      ${pend ? `<div class="kid-pend">${pend}</div>` : ''}
      ${cards ? `<div class="kid-rewards">${cards}</div>` : '<p class="kid-shop-empty">Noch keine Belohnungen – frag deine Eltern! 😊</p>'}`;
  }
  box.innerHTML = `<div class="kid-shop-box">
    <button type="button" class="kid-shop-x" data-shop="close" aria-label="Schließen">✕</button>
    ${inner}
  </div>`;
}
function kidShopClick(ev) {
  if (ev.target.classList && ev.target.classList.contains('kid-shop')) { kidCloseShop(); return; }
  const b = ev.target.closest('[data-shop]');
  if (!b) return;
  const act = b.dataset.shop;
  const id = b.dataset.id;
  const m = memberById(kidPageMemberId);
  if (!m) return;
  if (act === 'close') kidCloseShop();
  else if (act === 'back') { kidShopView.confirm = ''; kidRenderShop(); }
  else if (act === 'pick') {
    const r = normalizeKidStars(m.kid.stars).rewards.find(x => x.id === id);
    if (!r) return;
    if (kidStarBalance(m) < r.cost) {
      b.classList.remove('wiggle');
      void b.offsetWidth;
      b.classList.add('wiggle');
      kidPlaySound('undo');
      return;
    }
    kidShopView.confirm = id;
    kidRenderShop();
    kidPlaySound('done');
  } else if (act === 'buy') kidRedeem(m, id);
  else if (act === 'ok' || act === 'nein') kidDecide(m, id, act === 'ok');
}
function kidRedeem(m, rewardId) {
  const r = normalizeKidStars(m.kid.stars).rewards.find(x => x.id === rewardId);
  if (!r || kidStarBalance(m) < r.cost) { kidShopView.confirm = ''; kidRenderShop(); return; }
  const entry = { id: kidRid('x'), d: isoDate(new Date()), n: -r.cost, k: 'tausch', t: r.title, e: r.emoji, r: r.id, typ: r.type, val: r.value, s: 'offen', ts: Date.now() };
  m.kidStarLog = [...kidStarLog(m), entry];
  const parent = kidCanApprove(m);
  if (parent) kidApply(m, entry, true); // a parent taps themselves: confirmed right away
  saveMembers();
  if (!parent) {
    apiFetch('/api/pinn/aufgaben/belohnung', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: m.id, titel: r.title, sterne: r.cost }),
    }).catch(() => { /* continue without notification */ });
  }
  kidShopView.confirm = '';
  kidRenderShop();
  kidRefreshBank(m, 0);
  kidConfettiRain();
  kidPlaySound('win');
}
function kidApply(m, e, ok) {
  const me = currentMember();
  m.kidStarLog = kidStarLog(m).map(x => x.id === e.id ? { ...x, s: ok ? 'ok' : 'nein', by: me ? me.id : '' } : x);
  if (ok && e.typ === 'geld' && Number(e.val) > 0) {
    try { kidRewardPayout(m, e); } catch (err) { console.warn('Belohnung: Buchung fehlgeschlagen', err); }
  }
}
function kidDecide(m, entryId, ok) {
  const e = kidStarLog(m).find(x => x.id === entryId && x.s === 'offen');
  if (!e) return;
  kidApply(m, e, ok);
  saveMembers();
  if (kidShopView) kidRenderShop();
  if (kidPageMemberId === m.id) kidRefreshBank(m, 0);
  if (typeof currentView !== 'undefined' && currentView === 'finanzen') renderFinance();
  if (typeof finShowToast === 'function') finShowToast(ok ? `Belohnung für ${memberLabel(m)} bestätigt.` : `Abgelehnt – ${memberLabel(m)} bekommt die Sterne zurück.`);
}
// Booking in the fund where the child's pocket money is kept (otherwise in the default or active fund)
function kidWithAllowanceFinance(m, fn) {
  if (typeof kassenActiveMode !== 'function' || !kassenActiveMode()) { if (finance) fn(); return; }
  const order = [activeKasse(), ...kassenSorted().filter(k => k.id !== activeKasseId)].filter(Boolean);
  let target = order.find(k => {
    const f = k.id === activeKasseId ? finance : normalizeFinance(kasseWorkingData(k));
    return f && (f.recurring.some(r => r.allowanceFor === m.id) || f.pocketMoney.some(p => p.id === m.id));
  });
  if (!target) target = kasseById(kasseDefaultId()) || activeKasse();
  if (!target || target.id === activeKasseId) { if (finance) fn(); return; }
  kassenCapture();
  const prev = { id: activeKasseId, fin: finance, json: kasseWorkingJson };
  activeKasseId = target.id;
  finance = normalizeFinance(kasseWorkingData(target));
  kasseWorkingJson = JSON.stringify(finance);
  try {
    fn();
    kassenCapture();
  } finally {
    activeKasseId = prev.id;
    finance = prev.fin;
    kasseWorkingJson = prev.json;
    try { rebuildAusgaben(); } catch (e) { /* ignore */ }
  }
}
function kidRewardPayout(m, e) {
  if (isCurrentUserGuest()) return;
  const amount = finRound(Number(e.val) || 0);
  if (!(amount > 0)) return;
  kidWithAllowanceFinance(m, () => {
    const date = finTodayIso();
    const expId = newRecordId();
    finQueueSave({
      id: expId, amount, date, category: FIN_KIDS_CATEGORY, title: '⭐ ' + (e.t || 'Belohnung'),
      note: '', paidBy: currentMember() ? currentMember().id : '', link: 'kind:' + m.id,
      store: '', listId: '', items: [], createdBy: (currentUser() && currentUser().id) || '', created: new Date().toISOString(),
    });
    const pocket = finPocket(m.id);
    if (pocket && pocket.track) {
      finance.pocketLedger = [...finance.pocketLedger, { id: 'p' + newRecordId(), kid: m.id, date, amount, note: '⭐ ' + (e.t || ''), expenseId: expId }].slice(-1500);
    }
  });
}
// Push link "/?sterne=<member>": open the kids page with the rewards
function kidStarsHandleUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const id = params.get('sterne');
    if (!id) return;
    params.delete('sterne');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    const m = memberById(id);
    if (m && isKidPageEnabled(m)) {
      openKidPage(m.id);
      if (kidStarsOn(m)) kidOpenShop();
    }
  } catch (e) { /* ignore */ }
}

/* ---------- Finance → Pocket money: stars per child ---------- */
function kidStarsFinHtml(m) {
  if (!kidStarsOn(m)) return '';
  const rows = kidStarPending(m).map(e => `
    <div class="flex items-center gap-2 text-xs py-1">
      <span class="text-base shrink-0">${escapeHtml(e.e || '🎁')}</span>
      <span class="flex-1 min-w-0 truncate"><span data-no-i18n>${escapeHtml(e.t || '')}</span> · <span data-no-i18n>${-(Number(e.n) || 0)}</span> ⭐${e.typ === 'geld' && Number(e.val) > 0 ? ` · <span data-no-i18n>${escapeHtml(fmtEur(e.val))}</span>` : ''}</span>
      <button type="button" data-star-act="nein" data-id="${escapeHtml(e.id)}" class="shrink-0 px-2 py-1 rounded-lg border border-ink/15 bg-white text-ink/60 hover:text-red-500 transition">Ablehnen</button>
      <button type="button" data-star-act="ok" data-id="${escapeHtml(e.id)}" class="shrink-0 px-2.5 py-1 rounded-lg bg-pine text-white hover:bg-pine/90 transition">OK</button>
    </div>`).join('');
  return `
    <div class="mt-3 rounded-xl p-3 kid-fin-stars">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-[10px] uppercase tracking-wide text-ink/40">⭐ Sterne</div>
          <div class="text-xl font-semibold" data-no-i18n>${kidStarBalance(m)}</div>
        </div>
        <button type="button" data-star-act="extra" class="px-2.5 py-1.5 rounded-lg border border-ink/15 bg-white text-xs text-ink/70 hover:text-pine hover:border-pine transition">+ Sterne</button>
      </div>
      ${rows ? `<div class="mt-2"><div class="text-[11px] text-ink/50 mb-1">Wartet auf euer OK</div>${rows}</div>` : ''}
    </div>`;
}
function kidStarFinAction(kidId, act, id) {
  const m = memberById(kidId);
  if (!m) return;
  if (act !== 'extra') { kidDecide(m, id, act === 'ok'); return; }
  const raw = prompt('Wie viele Sterne? (Minus zum Abziehen, z. B. -2)', '1');
  if (raw === null) return;
  const n = Math.round(Number(String(raw).replace(',', '.').trim()));
  if (!n || !isFinite(n) || Math.abs(n) > 999) { finShowToast('Bitte eine ganze Zahl eingeben, z. B. 2 oder -1.', true); return; }
  const why = prompt('Wofür? (optional)', n > 0 ? 'Extra-Sterne' : 'Korrektur');
  if (why === null) return;
  m.kidStarLog = [...kidStarLog(m), { id: kidRid('e'), d: isoDate(new Date()), n, k: 'extra', t: String(why).trim().slice(0, 60) || 'Extra-Sterne', ts: Date.now() }];
  kidStarCompact(m);
  saveMembers();
  renderFinance();
  if (kidPageMemberId === m.id) renderKidPage();
}

/* ---------- Member popup: edit rewards ---------- */
function kidCurSymbol() {
  try { const s = fmtEur(0).replace(/[\d\s.,\u00a0\u202f-]/g, ''); return s || '€'; } catch (e) { return '€'; }
}
function openKidRewardsEditor() {
  if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
  const st = normalizeKidStars(pendingKidConfig.stars);
  kidRewardsEdit = st.rewards.map(r => ({ ...r }));
  kidRewardsEmojiFor = null;
  const name = document.getElementById('newMemberName').value.trim();
  document.getElementById('kidRewardsTitle').textContent = name ? `Belohnungen für ${name}` : 'Belohnungen';
  document.getElementById('kidRewardsBonus').value = String(st.bonus);
  document.getElementById('kidRewardsStatus').textContent = '';
  renderKidRewardsList();
  document.getElementById('kidRewardsModal').classList.remove('hidden');
  armModalSnapshot('kidRewardsModal');
}
function closeKidRewardsModal() { document.getElementById('kidRewardsModal').classList.add('hidden'); }
function renderKidRewardsList() {
  const list = document.getElementById('kidRewardsList');
  if (!kidRewardsEdit.length) { list.innerHTML = '<p class="text-xs text-ink/30 italic">Noch keine Belohnungen</p>'; return; }
  const cur = kidCurSymbol();
  list.innerHTML = kidRewardsEdit.map(r => {
    const types = KID_REWARD_TYPES.map(t => `<option value="${t.id}"${t.id === r.type ? ' selected' : ''}>${t.icon} ${t.label}</option>`).join('');
    const picker = kidRewardsEmojiFor === r.id
      ? `<div class="flex flex-wrap gap-1 mt-1.5 p-2 rounded-lg bg-ink/5">${KID_REWARD_EMOJIS.map(e =>
          `<button type="button" class="kid-rw-pick w-9 h-9 rounded-lg text-xl grid place-items-center hover:bg-white" data-emoji="${kidAttr(e)}">${e}</button>`).join('')}</div>`
      : '';
    const unit = r.type === 'geld' ? cur : r.type === 'medien' ? 'Min.' : '';
    return `<div class="kid-edit-row kid-rw-row" data-id="${kidAttr(r.id)}">
      <div class="flex items-center gap-1.5">
        <button type="button" class="kid-rw-emoji w-10 h-10 shrink-0 rounded-lg bg-ink/5 text-xl grid place-items-center" title="Bild wählen">${escapeHtml(r.emoji || '🎁')}</button>
        <input type="text" class="kid-rw-title flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-2 text-sm" maxlength="40" placeholder="z. B. Eis essen gehen" value="${kidAttr(r.title)}" />
        <button type="button" class="kid-rw-del w-8 h-8 shrink-0 rounded-lg text-ink/40 hover:text-red-500 transition" title="Entfernen" aria-label="Belohnung entfernen">✕</button>
      </div>
      <div class="flex items-center gap-1.5 mt-1 pl-[46px] flex-wrap">
        <select class="kid-rw-type rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white">${types}</select>
        <span class="kid-rw-valwrap inline-flex items-center gap-1${r.type === 'wunsch' ? ' hidden' : ''}">
          <input type="text" inputmode="decimal" class="kid-rw-value w-16 rounded-lg border border-ink/15 px-2 py-1 text-xs" value="${kidAttr(r.valueRaw !== undefined ? r.valueRaw : (r.value ? (r.type === 'geld' ? euroInputValue(r.value) : String(r.value)) : ''))}" />
          <span class="text-xs text-ink/50"${r.type === 'geld' ? ' data-no-i18n' : ''}>${escapeHtml(unit)}</span>
        </span>
        <span class="inline-flex items-center gap-1 ml-auto">
          <span class="text-xs text-ink/50">kostet</span>
          <input type="text" inputmode="numeric" class="kid-rw-cost w-16 rounded-lg border border-ink/15 px-2 py-1 text-xs" value="${kidAttr(r.costRaw !== undefined ? r.costRaw : String(r.cost || ''))}" />
          <span class="text-xs">⭐</span>
        </span>
      </div>
      ${picker}
    </div>`;
  }).join('');
}
function kidRewardsRow(el) {
  const row = el.closest('.kid-rw-row');
  return row ? kidRewardsEdit.find(r => r.id === row.dataset.id) : null;
}
(function initKidRewardsUi() {
  const list = document.getElementById('kidRewardsList');
  list.addEventListener('input', (e) => {
    const r = kidRewardsRow(e.target);
    if (!r) return;
    if (e.target.classList.contains('kid-rw-title')) r.title = e.target.value;
    else if (e.target.classList.contains('kid-rw-value')) r.valueRaw = e.target.value;
    else if (e.target.classList.contains('kid-rw-cost')) r.costRaw = e.target.value;
  });
  list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('kid-rw-type')) return;
    const r = kidRewardsRow(e.target);
    if (!r) return;
    const old = r.type;
    r.type = e.target.value;
    const icons = KID_REWARD_TYPES.map(t => t.icon);
    if (icons.includes(r.emoji) || !r.emoji) r.emoji = (KID_REWARD_TYPES.find(t => t.id === r.type) || {}).icon || '🎁';
    if (old !== r.type) { r.value = 0; delete r.valueRaw; }
    renderKidRewardsList();
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.classList.contains('kid-rw-pick')) {
      const r = kidRewardsEdit.find(x => x.id === kidRewardsEmojiFor);
      if (r) r.emoji = btn.dataset.emoji;
      kidRewardsEmojiFor = null;
      renderKidRewardsList();
      return;
    }
    const r = kidRewardsRow(btn);
    if (!r) return;
    if (btn.classList.contains('kid-rw-emoji')) {
      kidRewardsEmojiFor = kidRewardsEmojiFor === r.id ? null : r.id;
      renderKidRewardsList();
    } else if (btn.classList.contains('kid-rw-del')) {
      kidRewardsEdit = kidRewardsEdit.filter(x => x !== r);
      renderKidRewardsList();
    }
  });
  document.getElementById('kidRewardsAdd').addEventListener('click', () => {
    const r = { id: kidRid(), emoji: '🎁', title: '', type: 'wunsch', value: 0, cost: 10 };
    kidRewardsEdit.push(r);
    kidRewardsEmojiFor = null;
    renderKidRewardsList();
    const input = document.querySelector(`#kidRewardsList .kid-rw-row[data-id="${r.id}"] .kid-rw-title`);
    if (input) input.focus();
  });
  document.getElementById('kidRewardsDefaults').addEventListener('click', () => {
    if (kidRewardsEdit.length && !confirm('Alle Belohnungen durch die Vorschläge ersetzen?')) return;
    kidRewardsEdit = kidDefaultRewards();
    kidRewardsEmojiFor = null;
    renderKidRewardsList();
  });
  document.getElementById('kidRewardsApply').addEventListener('click', () => {
    const status = document.getElementById('kidRewardsStatus');
    status.textContent = '';
    const out = [];
    for (const r of kidRewardsEdit) {
      const title = String(r.title || '').trim();
      if (!title) continue;
      const cost = Math.round(Number(String(r.costRaw !== undefined ? r.costRaw : r.cost).replace(',', '.')));
      if (!(cost >= 1 && cost <= 9999)) { status.textContent = `Bitte bei „${title}“ angeben, wie viele Sterne es kostet.`; return; }
      let value = 0;
      if (r.type !== 'wunsch') {
        const raw = r.valueRaw !== undefined ? r.valueRaw : String(r.value || '');
        value = r.type === 'geld' ? parseEuro(raw) : Math.round(Number(String(raw).replace(',', '.')));
        if (!(value > 0)) { status.textContent = r.type === 'geld' ? `Bitte bei „${title}“ den Betrag eingeben.` : `Bitte bei „${title}“ die Minuten eingeben.`; return; }
      }
      out.push({ id: r.id, emoji: r.emoji || '🎁', title: title.slice(0, 60), type: r.type, value: r.type === 'geld' ? finRound(value) : value, cost });
    }
    if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
    const st = normalizeKidStars(pendingKidConfig.stars);
    pendingKidConfig = { ...pendingKidConfig, stars: { ...st, bonus: Number(document.getElementById('kidRewardsBonus').value) || 0, rewards: out } };
    updateMemberKidSection();
    closeKidRewardsModal();
  });
  document.getElementById('kidRewardsCancel').addEventListener('click', () => attemptCloseModal('kidRewardsModal', closeKidRewardsModal));
  wireModalOutsideClick('kidRewardsModal', closeKidRewardsModal);
  document.getElementById('memberKidStars').addEventListener('change', (e) => {
    if (!pendingKidConfig) pendingKidConfig = normalizeKidConfig(null);
    const st = normalizeKidStars(pendingKidConfig.stars);
    st.on = e.target.checked;
    if (st.on && !st.rewards.length) { st.rewards = kidDefaultRewards(); st.bonus = st.bonus || 1; }
    pendingKidConfig = { ...pendingKidConfig, stars: st };
    updateMemberKidSection();
  });
  document.getElementById('memberKidRewardsEdit').addEventListener('click', openKidRewardsEditor);
  document.getElementById('kidTaskGroups').addEventListener('change', (e) => {
    if (!e.target.classList.contains('kid-edit-stars')) return;
    const row = e.target.closest('.kid-edit-row');
    const task = row && kidEditTasks.find(t => t.id === row.dataset.id);
    if (task) task.stars = Math.max(1, Math.min(3, Number(e.target.value) || 1));
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sterne');
