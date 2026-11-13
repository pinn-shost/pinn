/* pinn. – Quick windows of the shortcuts (js/kurzfenster.js, since 1.150.0)
   Part of the pinn. web app (pb_public/index.html). Classic script, no build step: all top-level names share
   one global scope with the other files in js/ (prefix kz…, CSS classes kz-… and the hp-… sheet of the health page).

   A tap (most apps, since 1.150.2) or a long press (or right click) on an app of the shortcuts tile opens a small
   window at the bottom for exactly this function with its most important actions – e.g. drinking: pick a drink and an amount, undo the last entry; hand washing: plus and
   minus; shopping: add an item and tick items off. The window stays open after an action, so several things can
   be done in a row; every action shows a short notice at the bottom (since 1.150.2). The button "Open" at the bottom
   closes the window and goes to the page of the function (js/kurzbefehle.js → kzOpenPage).
   Every window is built by one function in KZ_SHEETS (returns the HTML of the body); actions are in kzSheetAct.
   Undo of drinking: the last entry of the day can be taken back for 10 minutes; once it has been taken back the
   button stays greyed out until the 10 minutes are over, then it disappears. */

var kzSheetApp = '';
var kzSheetOpenedAt = 0;
var kzSheetState = {};
var kzSheetTimer = 0;
var kzUndone = null;                 // { at: ms of the entry, label } – a drink was just taken back
var KZ_UNDO_MS = 10 * 60 * 1000;

function kzT(key, vars) { return tk('shortcut.sheet.' + key, vars); }
function kzToday() { return isoDate(new Date()); }
// Time of an entry made with ghId(): the id starts with Date.now() in base 36 (8 characters) + 5 random ones
function kzIdTime(id) {
  const s = String(id || '');
  const n = parseInt(s.slice(0, -5), 36);
  return isFinite(n) && n > 1e12 ? n : 0;
}
function kzBtn(act, label, extra, cls) {
  return `<button type="button" class="${cls || 'kz-btn'}" data-kzs="${act}"${extra || ''}>${label}</button>`;
}
function kzData(pairs) { return Object.keys(pairs).map(k => ` data-${k}="${escapeHtml(String(pairs[k]))}"`).join(''); }
function kzRow(act, check, text, sub, pairs) {
  return `<button type="button" class="kz-row${check === 'on' ? ' is-on' : ''}" data-kzs="${act}"${kzData(pairs || {})}>
    ${check ? `<span class="kz-check">${check === 'on' ? '✓' : ''}</span>` : ''}
    <span class="kz-row-text">${escapeHtml(text)}</span>${sub ? `<span class="kz-row-sub">${escapeHtml(sub)}</span>` : ''}</button>`;
}
function kzEmpty(text) { return `<p class="kz-empty">${escapeHtml(text)}</p>`; }

/* ---------- Health ---------- */
function kzHealthBody(inner) {
  const h = kzHealthData();
  if (!h) return kzEmpty(ghState.loaded ? kzT('healthNone') : kzT('loading'));
  return inner(h);
}
function kzDrinkUndoHtml(h) {
  const day = kzToday();
  const log = h.d.drink.log[day] || [];
  const last = log[log.length - 1];
  const at = last ? kzIdTime(last.id) : 0;
  const live = last && at && Date.now() - at < KZ_UNDO_MS;
  if (live) {
    const what = ghNum(last.ml) + ' ml ' + tk(ghDrinkById(last.kind).key);
    return `<button type="button" class="kz-undo" data-kzs="undodrink" data-id="${escapeHtml(last.id)}">↩ ${escapeHtml(kzT('undo', { what }))}</button>`;
  }
  if (kzUndone && Date.now() - kzUndone.at < KZ_UNDO_MS) return `<button type="button" class="kz-undo" disabled>↩ ${escapeHtml(kzT('undone'))}</button>`;
  return '';
}
function kzSheetSchedule() {
  clearTimeout(kzSheetTimer);
  kzSheetTimer = 0;
  if (kzSheetApp !== 'trinken') return;
  const h = kzHealthData();
  if (!h) return;
  const log = h.d.drink.log[kzToday()] || [];
  const last = log[log.length - 1];
  const times = [];
  if (last && kzIdTime(last.id)) times.push(kzIdTime(last.id) + KZ_UNDO_MS);
  if (kzUndone) times.push(kzUndone.at + KZ_UNDO_MS);
  const next = times.filter(x => x > Date.now()).sort((a, b) => a - b)[0];
  if (next) kzSheetTimer = setTimeout(() => { if (kzSheetApp === 'trinken') kzSheetRender(); }, next - Date.now() + 300);
}
function kzDrinkSheet() {
  return kzHealthBody((h) => {
    const total = ghDrinkTotal(h.d);
    const goal = h.d.drink.goal;
    const pick = kzSheetState.drink ? ghDrinkById(kzSheetState.drink) : null;
    const items = pick
      ? GH_AMOUNTS.map(ml => `<button type="button" class="hp-pick" data-kzs="ml" data-v="${ml}">${ghVesselSvg(pick, ml / 500)}<span class="hp-pick-t">${ghNum(ml)} ml</span></button>`).join('')
      : GH_DRINKS.map(dr => `<button type="button" class="hp-pick" data-kzs="drink" data-v="${dr.id}">${ghVesselSvg(dr, 0.75)}<span class="hp-pick-t">${escapeHtml(tk(dr.key))}</span></button>`).join('');
    const pct = goal ? Math.min(100, Math.round(total / goal * 100)) : 0;
    return `<div class="kz-big">${escapeHtml(tk('shortcut.sub.drink', { ml: ghNum(total), goal: ghNum(goal) }))}</div>
      <div class="kz-bar"><i style="width:${pct}%"></i></div>
      <p class="kz-hint">${escapeHtml(ghDrinkHint(total, goal))}</p>
      <div class="kz-step">${pick ? `<button type="button" class="kz-back" data-kzs="drinkback">‹ ${escapeHtml(tk('cal.back'))}</button>` : ''}<span>${escapeHtml(pick ? tk('gh.drink.howMuch', { drink: tk(pick.key) }) : tk('gh.drink.what'))}</span></div>
      <div class="hp-pick-grid">${items}</div>
      ${kzDrinkUndoHtml(h)}`;
  });
}
function kzLogDrink(kind, ml) {
  const h = kzHealthData();
  if (!h || !kind || !ml) return;
  const now = new Date();
  const entry = { id: ghId(), t: pad2(now.getHours()) + ':' + pad2(now.getMinutes()), kind, ml };
  const day = kzToday();
  try { finShowToast(tk('gh.drink.logged', { ml: ghNum(ml), drink: tk(ghDrinkById(kind).key) })); } catch (e) { /* no toast */ }
  ghChange(h.id, (d) => {
    const list = d.drink.log[day] || [];
    if (!list.some(x => x.id === entry.id)) list.push(entry);
    d.drink.log[day] = list;
  });
  kzUndone = null;
  kzSheetState.drink = null;
}
function kzUndoDrink(id) {
  const h = kzHealthData();
  if (!h) return;
  const day = kzToday();
  const at = kzIdTime(id);
  ghChange(h.id, (d) => { d.drink.log[day] = (d.drink.log[day] || []).filter(x => x.id !== id); });
  kzUndone = { at: at || Date.now() };
}
function kzHandsSheet() {
  return kzHealthBody((h) => {
    const n = Number(h.d.hands.log[kzToday()]) || 0;
    return `<div class="kz-count">
      <button type="button" class="kz-round" data-kzs="handsminus" aria-label="−"${n ? '' : ' disabled'}>−</button>
      <div class="kz-count-n">${ghNum(n)}<small>${escapeHtml(kzT('handsToday'))}</small></div>
      <button type="button" class="kz-round plus" data-kzs="handsplus" aria-label="+">+</button>
    </div>`;
  });
}
function kzHandsStep(step) {
  const h = kzHealthData();
  if (!h) return;
  const day = kzToday();
  let count = 0;
  ghChange(h.id, (d) => {
    d.blocks.hands = true;
    d.hands.log[day] = Math.max(0, (Number(d.hands.log[day]) || 0) + step);
    count = d.hands.log[day];
  });
  finShowToast(tk('shortcut.handsDone', { n: ghNum(count) }));
}
function kzMedsSheet() {
  return kzHealthBody((h) => {
    const slots = ghMedSlots(h.d);
    if (!slots.length) return kzEmpty(kzT('medsNone'));
    const taken = h.d.meds.taken[kzToday()] || [];
    const open = slots.filter(s => !taken.includes(s.key)).length;
    return `<p class="kz-hint">${escapeHtml(open ? tk('shortcut.sub.meds', { n: open }) : kzT('medsDone'))}</p>` +
      slots.map(s => kzRow('med', taken.includes(s.key) ? 'on' : 'off', s.med.name + (s.med.dose ? ' (' + s.med.dose + ')' : ''), s.time, { key: s.key })).join('');
  });
}
function kzMedToggle(key) {
  const h = kzHealthData();
  if (!h || !key) return;
  const day = kzToday();
  const slot = ghMedSlots(h.d).find(x => x.key === key);
  const name = slot ? slot.med.name : '';
  const wasTaken = (h.d.meds.taken[day] || []).includes(key);
  if (name) finShowToast(kzT(wasTaken ? 'medOpen' : 'medTaken', { name }));
  ghChange(h.id, (d) => {
    const was = (d.meds.taken[day] || []).includes(key);
    const list = (d.meds.taken[day] || []).filter(k => k !== key);
    if (!was) list.push(key);
    d.meds.taken[day] = list;
  });
}

/* ---------- Shopping ---------- */
function kzShopListId() { return getShoppingList(kzSheetState.list) ? kzSheetState.list : activeShoppingListId(); }
function kzShopSheet() {
  const listId = kzShopListId();
  const lists = allShoppingLists();
  const open = shoppingItemsOfList(listId).filter(x => !x.done);
  const sel = lists.length > 1 ? `<select class="kz-select" data-kzs-change="shoplist" aria-label="${escapeHtml(kzT('list'))}">${lists.map(l => `<option value="${escapeHtml(l.id)}"${l.id === listId ? ' selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}</select>` : '';
  return `${sel}<div class="kz-add"><input type="text" class="kz-input" id="kzShopInput" data-kz-enter="shopadd" placeholder="${escapeHtml(kzT('shopPlaceholder'))}" autocomplete="off" />${kzBtn('shopadd', escapeHtml(kzT('add')), '', 'kz-btn primary')}</div>` +
    (open.length ? open.slice(0, 8).map(it => kzRow('shoptick', 'off', it.name, it.qty || '', { id: it.id })).join('') + (open.length > 8 ? `<p class="kz-hint">+ ${open.length - 8}</p>` : '') : kzEmpty(kzT('shopEmpty')));
}
function kzShopAdd() {
  const input = document.getElementById('kzShopInput');
  const name = input ? input.value.trim().replace(/\s+/g, ' ') : '';
  if (!name) { if (input) input.focus(); return; }
  const listId = kzShopListId();
  const dup = shoppingItemsOfList(listId).find(it => !it.done && (it.name || '').trim().toLowerCase() === name.toLowerCase());
  if (dup) { finShowToast(kzT('shopDup', { name })); return; }
  const now = Date.now();
  const hist = shoppingHistory.find(x => x.id === shoppingHistoryKey(name));
  const item = { id: 'si' + now + Math.random().toString(36).slice(2, 6), name, qty: (hist && hist.lastQty) || '', note: '', cat: (hist && hist.cat) || '', done: false, createdAt: now, listId };
  const pItem = typeof pantryItemForShopping === 'function' ? pantryItemForShopping({ name }) : null;
  if (pItem) item.pantryId = pItem.id;
  shoppingItems = [item, ...shoppingItems];
  rememberShoppingInput(name, item.qty, undefined);
  persistState();
  try { renderShoppingList(); } catch (e) { /* page not built */ }
  finShowToast(kzT('shopAdded', { name }));
}
function kzShopTick(id) {
  const it = shoppingItems.find(x => x.id === id);
  if (!it) return;
  shoppingItems = shoppingItems.map(x => x.id === id ? { ...x, done: !x.done } : x);
  if (!it.done) finShowToast(kzT('shopTicked', { name: it.name }));
  if (!it.done && it.pantryId && typeof removePantrySiblings === 'function') removePantrySiblings([it]);
  persistState();
  try { renderShoppingList(); } catch (e) { /* page not built */ }
}

/* ---------- Tasks, cleaning plan, events, meals ---------- */
function kzOpenTasks(household) {
  const today = kzToday();
  return deriveTasks().filter(t => !t.done && !!t.household === household && (!t.dueDate || t.dueDate <= today))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
}
function kzTaskSheet(household) {
  const list = kzOpenTasks(household);
  const rows = list.slice(0, 8).map(t => kzRow('task', 'off', t.title, t.dueDate && t.dueDate < kzToday() ? new Date(t.dueDate + 'T12:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'short' }) : (t.fromTime || ''), { id: t.id })).join('');
  const more = list.length > 8 ? `<p class="kz-hint">+ ${list.length - 8}</p>` : '';
  return (rows ? rows + more : kzEmpty(kzT(household ? 'noCleaning' : 'noTasks'))) + (household ? '' : kzBtn('newtask', '＋ ' + escapeHtml(kzT('newTask')), '', 'kz-btn primary wide'));
}
function kzTaskTick(id) {
  const t = deriveTasks().find(x => x.id === id);
  if (!t) return;
  toggleTaskDone(t);
  finShowToast(kzT('taskDone', { name: t.title }));
}
function kzEventSheet() {
  const today = kzToday();
  const list = events.filter(e => e.date === today && isEventVisibleAsCalendarEntry(e)).sort(calListCompare);
  const rows = list.slice(0, 8).map(ev => `<div class="kz-row static"><span class="kz-row-sub first">${escapeHtml((ev.fullDayFiller || !ev.time) ? tk('cal.allDay') : ev.time + (ev.endTime ? '–' + ev.endTime : ''))}</span><span class="kz-row-text">${escapeHtml(ev.title)}</span></div>`).join('');
  return (rows || kzEmpty(kzT('noEvents'))) + (list.length > 8 ? `<p class="kz-hint">+ ${list.length - 8}</p>` : '') + kzBtn('newevent', '＋ ' + escapeHtml(kzT('newEvent')), '', 'kz-btn primary wide');
}
function kzMealSheet() {
  const today = kzToday();
  const meals = mealPlan.filter(p => p.date === today).sort((a, b) => mealTypeRank(a.mealType) - mealTypeRank(b.mealType));
  const rows = meals.map(p => {
    const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
    const title = recipe ? recipe.title : (p.title || tk('common.untitled'));
    return `<div class="kz-meal"><div class="kz-meal-t"><span>${mealTypeIcon(p.mealType)}</span><b>${escapeHtml(title)}</b><small>${escapeHtml(mealTypeLabel(p.mealType, true))}</small></div>
      <div class="kz-meal-b">${recipe ? kzBtn('recipe', escapeHtml(kzT('recipe')), kzData({ id: recipe.id })) : ''}${p.cooked ? `<span class="kz-done">✓ ${escapeHtml(kzT('cooked'))}</span>` : kzBtn('cooked', '✓ ' + escapeHtml(kzT('cooked')), kzData({ id: p.id }))}</div></div>`;
  }).join('');
  return (rows || kzEmpty(kzT('noMeals'))) + kzBtn('planmeal', '＋ ' + escapeHtml(kzT('planMeal')), '', 'kz-btn primary wide');
}

/* ---------- Pin board, chat, home, pets, pantry ---------- */
function kzNoteSheet() {
  return `<textarea class="kz-input kz-area" id="kzNoteInput" rows="3" maxlength="2000" placeholder="${escapeHtml(kzT('notePlaceholder'))}"></textarea>` +
    kzBtn('notepin', '📌 ' + escapeHtml(kzT('notePin')), '', 'kz-btn primary wide');
}
function kzNotePin() {
  const input = document.getElementById('kzNoteInput');
  const text = input ? input.value.trim() : '';
  if (!text) { if (input) input.focus(); return; }
  const n = pwNewNoteBase('note');
  n.text = text.slice(0, 2000);
  const soft = PW_COLORS.slice(0, 6);
  n.color = soft[Math.floor(Math.random() * soft.length)].id;
  pinboard = [n, ...pinboard];
  persistState();
  try { pwRerenderAll(); } catch (e) { /* board not built */ }
  finShowToast(kzT('notePinned'));
  if (input) input.value = '';
}
function kzChatSheet() { return `<p class="kz-hint">${escapeHtml(kzT('chatHint'))}</p>`; }
function kzHomeSheet() {
  const tabs = [['uebersicht', 'homeOverview'], ['garten', 'homeGarden'], ['wartung', 'homeMaint'], ['zaehler', 'homeMeters'], ['maengel', 'homeDefects'], ['kosten', 'homeCosts']];
  return `<div class="kz-chips">${tabs.map(([id, k]) => kzBtn('hsopen', escapeHtml(kzT(k)), kzData({ tab: id }), 'kz-chip')).join('')}</div>`;
}
function kzPetSheet() {
  const pets = ptActive();
  if (!pets.length) return kzEmpty(kzT('petsNone'));
  return pets.map(p => {
    const times = ptFeedTimes(p);
    const fed = times.filter(t => ptFedSlot(p, t)).length;
    const slots = times.length ? `<div class="kz-chips">${times.map(t => kzBtn('pettoggle', (ptFedSlot(p, t) ? '✓ ' : '') + escapeHtml(t), kzData({ pet: p.id, slot: t }), 'kz-chip' + (ptFedSlot(p, t) ? ' on' : ''))).join('')}</div>` : `<p class="kz-hint">${escapeHtml(kzT('petNoTimes'))}</p>`;
    return `<div class="kz-pet"><div class="kz-pet-h"><b>${escapeHtml(p.name)}</b>${times.length ? `<small>${fed} / ${times.length} ${escapeHtml(kzT('petFed'))}</small>` : ''}</div>${slots}${times.length && fed < times.length ? kzBtn('petnext', '🍽 ' + escapeHtml(kzT('petFeed')), kzData({ pet: p.id }), 'kz-btn primary wide') : ''}</div>`;
  }).join('');
}
function kzPantrySheet() {
  const low = pantryItems.filter(p => pantryIsLow(p));
  const exp = pantryItems.filter(p => pantryIsExpiring(p) && !pantryIsLow(p));
  const part = (title, list) => list.length ? `<h5 class="kz-group">${escapeHtml(title)}</h5>` + list.slice(0, 6).map(p => `<div class="kz-row static"><span class="kz-row-text">${escapeHtml(p.name)}</span><span class="kz-row-sub">${escapeHtml(p.qty != null && p.qty !== '' ? String(p.qty) + (p.unit ? ' ' + p.unit : '') : '')}</span></div>`).join('') : '';
  return (part(kzT('pantryLow'), low) + part(kzT('pantryExpiring'), exp)) || kzEmpty(kzT('pantryOk'));
}

/* ---------- Finances ---------- */
function kzExpenseSheet(income) {
  const cats = income ? '' : `<div class="kz-chips">${finActiveCategories().filter(c => c.id !== FIN_INCOME_CATEGORY).map(c => `<button type="button" class="kz-chip${kzSheetState.cat === c.id ? ' on' : ''}" data-kzs="expcat" data-id="${escapeHtml(c.id)}">${escapeHtml(c.icon || '')} ${escapeHtml(i18nT(c.label))}</button>`).join('')}</div>`;
  return `<div class="kz-add"><input type="text" inputmode="decimal" class="kz-input kz-amount" id="kzAmountInput" placeholder="${escapeHtml(kzT('amount'))}" autocomplete="off" /></div>
    <div class="kz-add"><input type="text" class="kz-input" id="kzTitleInput" data-kz-enter="expsave" placeholder="${escapeHtml(kzT(income ? 'incomeTitle' : 'expenseTitle'))}" autocomplete="off" /></div>
    ${cats}${kzBtn('expsave', escapeHtml(kzT('save')), kzData({ income: income ? 1 : 0 }), 'kz-btn primary wide')}`;
}
function kzExpenseSave(income) {
  const raw = (document.getElementById('kzAmountInput') || {}).value || '';
  const title = ((document.getElementById('kzTitleInput') || {}).value || '').trim();
  const amount = parseEuro(raw);
  if (!isFinite(amount) || amount <= 0) { const i = document.getElementById('kzAmountInput'); if (i) i.focus(); return; }
  const category = income ? (finDefaultIncomeCategory() || undefined) : (kzSheetState.cat || undefined);
  const preset = { amountText: (income ? '-' : '') + raw.trim().replace(/^[-−–—]\s*/, ''), title };
  if (category) preset.category = category;
  kzSheetClose();
  // The normal saving path (categories, cash boxes, budget notice): open the form filled in and save it
  openExpenseModal({ preset });
  saveExpenseFromModal();
}
function kzFinanceSheet() {
  return `<div class="kz-chips">${kzBtn('newexp', '− ' + escapeHtml(tk('shortcut.app.ausgabe')), '', 'kz-chip')}${kzBtn('newinc', '+ ' + escapeHtml(tk('shortcut.app.einnahme')), '', 'kz-chip')}</div>`;
}

/* ---------- Safety ---------- */
function kzSosSheet() {
  return `<p class="kz-hint">${escapeHtml(kzT('sosHint'))}</p><button type="button" id="famSosBtn" class="fam-sos-btn" data-kzs="sos">${escapeHtml(famSosLabel())}</button>`;
}
function kzWaySheet() {
  const g = famMyDevice();
  const on = !!(g && famUnterwegs(g));
  return `<p class="kz-hint">${escapeHtml(kzT(on ? 'wayOn' : 'wayOff'))}</p>
    ${kzBtn(on ? 'wayoff' : 'wayon', on ? escapeHtml(kzT('wayEnd')) : '🚶 ' + escapeHtml(kzT('wayStart')), '', 'kz-btn primary wide')}
    ${kzBtn('sendloc', '📍 ' + escapeHtml(kzT('sendLocation')), '', 'kz-btn wide')}`;
}

var KZ_SHEETS = {
  trinken: kzDrinkSheet, haende: kzHandsSheet, medikamente: kzMedsSheet,
  einkauf: kzShopSheet, aufgabe: () => kzTaskSheet(false), putzplan: () => kzTaskSheet(true), termin: kzEventSheet, kochen: kzMealSheet,
  zettel: kzNoteSheet, chat: kzChatSheet, pflanzen: kzHomeSheet, haustier: kzPetSheet, vorrat: kzPantrySheet,
  ausgabe: () => kzExpenseSheet(false), einnahme: () => kzExpenseSheet(true), finanzen: kzFinanceSheet,
  sos: kzSosSheet, unterwegs: kzWaySheet,
};

/* ---------- Window ---------- */
function kzSheetEl() {
  let ov = document.getElementById('kzSheetOverlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'kzSheetOverlay';
  ov.className = 'hp-overlay kz-overlay fixed inset-0 hidden';
  ov.addEventListener('click', (e) => {
    if (e.target === ov) { if (Date.now() - kzSheetOpenedAt > 400) kzSheetClose(); return; }
    const b = e.target.closest('[data-kzs]');
    if (b && !b.disabled) kzSheetAct(b.dataset.kzs, b);
  });
  ov.addEventListener('change', (e) => {
    const s = e.target.closest('[data-kzs-change]');
    if (s && s.dataset.kzsChange === 'shoplist') { kzSheetState.list = s.value; kzSheetRender(); }
  });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { kzSheetClose(); return; }
    const f = e.target.closest ? e.target.closest('[data-kz-enter]') : null;
    if (f && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kzSheetAct(f.dataset.kzEnter, f); }
  });
  document.body.appendChild(ov);
  return ov;
}
function kzSheetRender() {
  const a = kzApp(kzSheetApp);
  const ov = document.getElementById('kzSheetOverlay');
  if (!a || !ov) return;
  let body = '';
  try { body = (KZ_SHEETS[a.id] || (() => ''))(); } catch (e) { console.error('kurzfenster', a.id, e); body = kzEmpty(kzT('healthNone')); }
  ov.innerHTML = `<div class="hp-sheet kz-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(kzLabel(a))}">
    <div class="kz-sheet-head">${kzIconHtml(a, true)}<div class="kz-sheet-title">${escapeHtml(kzLabel(a))}</div><button type="button" class="hp-x big" data-kzs="close" aria-label="${escapeHtml(tk('common.close'))}">×</button></div>
    <div class="kz-sheet-body">${body}</div>
    <div class="kz-sheet-foot">${kzBtn('open', escapeHtml(kzT('open')) + ' ›', '', 'kz-open')}</div>
  </div>`;
  kzSheetSchedule();
}
async function kzSheetOpen(id) {
  const a = kzApp(id);
  if (!a || !kzAvailable(a)) return;
  if (kzSheetApp === id && !document.getElementById('kzSheetOverlay').classList.contains('hidden')) return;
  kzSheetApp = id;
  kzSheetState = {};
  kzSheetOpenedAt = Date.now();
  const ov = kzSheetEl();
  kzSheetRender();
  ov.classList.remove('hidden');
  if (a.health) {
    await kzHealthReady();
    if (kzSheetApp === id) kzSheetRender();
  } else if (id === 'unterwegs' || id === 'sos') {
    try { await famLoadStatus(); } catch (e) { /* offline */ }
    if (kzSheetApp === id) kzSheetRender();
  }
}
function kzSheetClose() {
  // A running SOS countdown is cancelled with the window (nothing is sent by accident)
  try { if (typeof famSosUntil !== 'undefined' && famSosUntil) famSosPress(); } catch (e) { /* ignore */ }
  clearTimeout(kzSheetTimer);
  const ov = document.getElementById('kzSheetOverlay');
  if (ov) ov.classList.add('hidden');
  kzSheetApp = '';
  try { renderShortcutsTile(); } catch (e) { /* tile not built */ }
}
function kzSheetAct(act, el) {
  const a = kzApp(kzSheetApp);
  if (!a) return;
  const v = el && el.dataset ? el.dataset.v : '';
  // Pop-ups of other pages are only called from inside this function (child lock)
  switch (act) {
    case 'close': kzSheetClose(); return;
    case 'open': kzSheetClose(); kzOpenPage(a.id); return;
    case 'drink': kzSheetState.drink = v; break;
    case 'drinkback': kzSheetState.drink = null; break;
    case 'ml': kzLogDrink(kzSheetState.drink, Number(v)); break;
    case 'undodrink': kzUndoDrink(el.dataset.id); break;
    case 'handsplus': kzHandsStep(1); break;
    case 'handsminus': kzHandsStep(-1); break;
    case 'med': kzMedToggle(el.dataset.key); break;
    case 'shopadd': kzShopAdd(); { const i = document.getElementById('kzShopInput'); kzSheetRender(); const n = document.getElementById('kzShopInput'); if (n && i) n.focus(); } return;
    case 'shoptick': kzShopTick(el.dataset.id); break;
    case 'task': kzTaskTick(el.dataset.id); setTimeout(kzSheetRender, 120); return;
    case 'newtask': kzSheetClose(); openTaskModal(); return;
    case 'newevent': kzSheetClose(); openAddEventModal(); return;
    case 'planmeal': kzSheetClose(); openMealModal(kzToday(), 'abend'); return;
    case 'recipe': kzSheetClose(); openRecipeDetailPage(el.dataset.id); return;
    case 'cooked': kzMealCooked(el.dataset.id); break;
    case 'notepin': kzNotePin(); return;
    case 'hsopen': kzSheetClose(); hsOpen(el.dataset.tab); return;
    case 'petnext': ptFeedNext(el.dataset.pet); break;
    case 'pettoggle': kzPetToggle(el.dataset.pet, el.dataset.slot); break;
    case 'expcat': kzSheetState.cat = kzSheetState.cat === el.dataset.id ? '' : el.dataset.id; kzSheetKeepInputs(); return;
    case 'expsave': kzExpenseSave(kzSheetApp === 'einnahme' || el.dataset.income === '1'); return;
    case 'newexp': kzSheetClose(); openExpenseModal(); return;
    case 'newinc': kzSheetClose(); openExpenseModal({ preset: { amountText: '-' } }); return;
    case 'sos': famSosPress(); return;
    case 'wayon': famSetUnterwegs(true, el).then(() => { if (kzSheetApp) kzSheetRender(); }); return;
    case 'wayoff': famSetUnterwegs(false, el).then(() => { if (kzSheetApp) kzSheetRender(); }); return;
    case 'sendloc': kzSendLocation(el); return;
  }
  kzSheetRender();
}
function kzMealCooked(planId) {
  const p = mealPlan.find(x => x.id === planId);
  markMealCooked(planId, null);
  if (!p) return;
  const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
  finShowToast(kzT('mealCooked', { name: recipe ? recipe.title : (p.title || tk('common.untitled')) }));
}
function kzPetToggle(petId, slot) {
  const p = ptById(petId);
  const was = p ? !!ptFedSlot(p, slot) : true;
  ptToggleFeed(petId, slot);
  if (p && !was && ptFedSlot(p, slot)) finShowToast(tk('pet.fed2', { name: p.name, slot }));
}
// Re-draw but keep what was typed into the fields
function kzSheetKeepInputs() {
  const keep = {};
  document.querySelectorAll('#kzSheetOverlay input, #kzSheetOverlay textarea').forEach(i => { if (i.id) keep[i.id] = i.value; });
  kzSheetRender();
  Object.keys(keep).forEach(id => { const i = document.getElementById(id); if (i) i.value = keep[id]; });
}
async function kzSendLocation(btn) {
  if (btn) btn.disabled = true;
  try {
    const pos = await famGetPosition();
    if (!pos) { finShowToast(tk('loc.alarmCouldNotSent'), true); return; }
    await famPost('standort', pos);
    finShowToast(kzT('locationSent'));
  } catch (e) {
    finShowToast(e.message || tk('common.actionFailed'), true);
  } finally { if (btn) btn.disabled = false; }
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kurzfenster');
