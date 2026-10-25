/* pinn. – Shopping lists: views, popups & settings (js/einkaufslisten.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the shopping overview and detail view (openShoppingList, renderShoppingOverview, renderShoppingDetail), reordering
   the list cards by drag & drop, the rows of a shopping slip (wireShoppingRows), the combined view of a planned shopping trip,
   the popups to move content and to create/edit a list (shop, logo, main shop), Settings → Shopping (category order, main shop,
   special lists), the main-shop popup and the wiring of the shopping page (initShoppingLists). */

/* ---------- Overview / detail view ---------- */
function openShoppingList(id, opts = {}) {
  if (!getShoppingList(id)) return;
  currentShoppingListId = id;
  shoppingBackToPlanTaskId = opts.backToPlanTaskId || null;
  currentShoppingPlanTaskId = null;
  const input = document.getElementById('shoppingAddInput');
  input.value = '';
  hideShoppingSuggestions();
  renderShoppingList();
  const scroller = document.querySelector('#shoppingDetail .overflow-y-auto');
  if (scroller) scroller.scrollTop = 0;
}
// Combined view of a planned shopping trip (several lists, clearly separated)
function openShoppingPlanView(taskId) {
  currentShoppingListId = null;
  shoppingBackToPlanTaskId = null;
  currentShoppingPlanTaskId = taskId;
  const input = document.getElementById('shoppingAddInput');
  input.value = '';
  hideShoppingSuggestions();
  renderShoppingList();
  const scroller = document.querySelector('#shoppingDetail .overflow-y-auto');
  if (scroller) scroller.scrollTop = 0;
}
// Tapping a shopping task: one list -> that list, several -> combined
function openShoppingForTask(taskId) {
  const plan = shoppingPlanForTask(taskId);
  const ids = plan ? plan.listIds.filter(id => getShoppingList(id)) : [];
  if (!ids.length || !isViewAllowed('einkauf')) return;
  setView('einkauf');
  if (ids.length === 1) openShoppingList(ids[0]);
  else openShoppingPlanView(taskId);
}
function showShoppingOverview() {
  // Switched from the combined view into a single list? Then back there.
  if (currentShoppingListId && shoppingBackToPlanTaskId && shoppingPlanForTask(shoppingBackToPlanTaskId)) {
    openShoppingPlanView(shoppingBackToPlanTaskId);
    return;
  }
  currentShoppingListId = null;
  currentShoppingPlanTaskId = null;
  shoppingBackToPlanTaskId = null;
  const input = document.getElementById('shoppingAddInput');
  input.value = '';
  input.blur();
  hideShoppingSuggestions();
  renderShoppingList();
}

function renderShoppingList() {
  const overviewEl = document.getElementById('shoppingOverview');
  const detailEl = document.getElementById('shoppingDetail');
  // Menu item „Listen“: shopping is one of several list types. If a shopping list is opened directly
  // (task, search, overview …), the switch jumps to „Einkauf“ automatically.
  if (currentShoppingListId || currentShoppingPlanTaskId) { listsTab = 'einkauf'; listsDetailId = null; }
  renderListsTabs();
  if (listsTab !== 'einkauf') {
    overviewEl.classList.add('hidden'); overviewEl.classList.remove('flex');
    detailEl.classList.add('hidden'); detailEl.classList.remove('flex');
    renderGenericLists();
    return;
  }
  lsHideGenericViews();
  if (currentShoppingListId && !getShoppingList(currentShoppingListId)) currentShoppingListId = null;
  if (currentShoppingPlanTaskId && !shoppingCombinedListIds().length) currentShoppingPlanTaskId = null;
  const inDetail = !!currentShoppingListId || !!currentShoppingPlanTaskId;
  overviewEl.classList.toggle('hidden', inDetail);
  overviewEl.classList.toggle('flex', !inDetail);
  detailEl.classList.toggle('hidden', !inDetail);
  detailEl.classList.toggle('flex', inDetail);
  if (inDetail) renderShoppingDetail();
  else renderShoppingOverview();
}

function renderShoppingOverview() {
  // If a change comes in while dragging (e.g. from another device), only redraw after
  // releasing - otherwise the dragged card would disappear under the finger.
  if (shoppingDrag) { shoppingDragRenderPending = true; return; }
  initShoppingListDatesIfEmpty();
  const grid = document.getElementById('shoppingListGrid');
  const mode = shoppingMealMode();
  const stammId = shoppingStammladenId();
  const stammList = stammId ? getShoppingList(stammId) : null;
  const hideMeal = shoppingMealListHidden();
  const cards = allShoppingLists().filter(list => !(hideMeal && list.id === SHOPPING_MEAL_LIST_ID)).map(list => {
    const { count, preview } = shoppingListSummary(list.id);
    const color = shoppingListColor(list);
    const isStamm = list.id === stammId;
    const previewHtml = preview.length
      ? preview.map(n => `<span class="block truncate">${escapeHtml(n)}</span>`).join('') + (count > preview.length ? `<span class="block text-ink/35">${escapeHtml(tk('shop.moreItems', { n: count - preview.length }))}</span>` : '')
      : `<span class="block italic text-ink/35">${listHasRecipeItems(list.id) ? tk('shop.nothingPlanned') : tk('shop.empty')}</span>`;
    let subtitle = '';
    if (list.id === SHOPPING_MEAL_LIST_ID) {
      if (mode === 'mirror' && stammList) subtitle = escapeHtml(tk('shop.mirroredTo', { name: stammList.name || '' }));
      else if (mode === 'direct' && stammList) subtitle = escapeHtml(tk('shop.ownEntriesIngredientsTo', { name: stammList.name || '' }));
      else subtitle = escapeHtml(tk('shop.recipesOwnEntries'));
    } else if (isStamm) {
      subtitle = mode === 'mirror' ? tk('shop.mainMealMirrored')
        : mode === 'direct' ? tk('shop.mainInclMeal')
        : tk('shop.mainShop');
    } else {
      const rules = shoppingActiveRules().filter(r => r.listId === list.id);
      if (rules.length) subtitle = rules.map(r => r.icon).join('') + ' ' + escapeHtml(tk('shop.rule.name')) + ' · ' + escapeHtml(rules.map(r => r.name).join(', '));
    }
    return `
      <button type="button" class="shopping-list-card relative text-left rounded-2xl bg-white border border-ink/10 shadow-sm hover:shadow-md hover:border-pine/40 transition p-4 pt-5 flex flex-col gap-3 min-h-[11rem] overflow-hidden select-none" data-list-id="${escapeHtml(list.id)}">
        <span class="absolute top-0 left-0 right-0 h-1.5" style="background:${color}"></span>
        <div class="flex items-start justify-between gap-2">
          ${shoppingListLogoHtml(list, 52)}
          ${count ? `<span class="shrink-0 min-w-[1.75rem] h-7 px-2 rounded-full bg-pine text-white text-xs font-semibold grid place-items-center">${count}</span>` : ''}
        </div>
        <div class="min-w-0">
          <div class="font-serif text-base leading-tight truncate">${escapeHtml(list.name || '')}</div>
          ${subtitle ? `<div class="text-[11px] ${isStamm ? 'text-mustard' : 'text-ink/40'} truncate">${subtitle}</div>` : ''}
        </div>
        <div class="text-xs text-ink/55 leading-snug min-w-0 mt-auto">${previewHtml}</div>
      </button>
    `;
  }).join('');
  grid.innerHTML = cards + ('\n    <button type="button" id="shoppingNewListCard" class="rounded-2xl border-2 border-dashed border-ink/15 text-ink/40 hover:text-pine hover:border-pine transition p-4 min-h-[11rem] flex flex-col items-center justify-center gap-2 select-none">\n      <span class="text-3xl leading-none">+</span>\n      <span class="text-sm">' + tk('lists.modal.newTitle') + '</span>\n    </button>\n  ');
  grid.querySelectorAll('.shopping-list-card').forEach(card => {
    card.addEventListener('click', () => {
      if (shoppingDragSuppressClick) return;
      openShoppingList(card.dataset.listId);
    });
  });
  document.getElementById('shoppingNewListCard').addEventListener('click', () => {
    if (shoppingDragSuppressClick) return;
    openShoppingListModal();
  });
}

/* ---------- Reorder shopping lists by drag & drop (like app icons on the iPhone) ----------
   Touch: press and hold a card until it lifts, then drag - the other cards
   move aside with an animation and wiggle slightly. Mouse: drag the card with the button held down.
   The order (incl. meal planning) is stored in shoppingListOrder in the family record and is
   therefore the same on all devices (also offline, sent later). */
const SHOPPING_DRAG_LONGPRESS_MS = 380;
const SHOPPING_DRAG_ANIM_MS = 230;

(function attachShoppingListDrag() {
  const grid = document.getElementById('shoppingListGrid');
  if (!grid) return;
  let press = null; // { card, x, y, mode: 'touch'|'mouse', timer }

  const cardsOf = () => [...grid.querySelectorAll('.shopping-list-card')];
  const inRect = (x, y, r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

  function cancelPress() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
  }

  function suppressNextClick() {
    shoppingDragSuppressClick = true;
    setTimeout(() => { shoppingDragSuppressClick = false; }, 450);
  }

  function startDrag(card, x, y, mode) {
    if (shoppingDrag || !grid.contains(card)) return;
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('data-list-id');
    ghost.classList.add('shopping-drag-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', height: rect.height + 'px', margin: '0',
      zIndex: '400', pointerEvents: 'none',
      transition: `transform ${SHOPPING_DRAG_ANIM_MS}ms cubic-bezier(.2,.8,.2,1)`,
      transform: 'scale(1)',
    });
    document.body.appendChild(ghost);
    ghost.offsetWidth; // Fix the start state so the lifting is animated
    ghost.style.transform = 'scale(1.07)';
    card.classList.add('shopping-drag-slot');
    grid.classList.add('shopping-reordering');
    document.body.classList.add('shopping-dragging');
    shoppingDrag = { card, ghost, mode, offX: x - rect.left, offY: y - rect.top, x, y, lockUntil: 0, raf: null, ending: false };
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* ignore */ }
    shoppingDrag.raf = requestAnimationFrame(autoScrollLoop);
  }

  // Other cards glide from their old to their new position (FLIP animation).
  function flipMove(cards, mutate) {
    const first = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
    mutate();
    cards.forEach(c => { c.style.transition = 'none'; c.style.transform = ''; });
    const last = new Map(cards.map(c => [c, c.getBoundingClientRect()]));
    cards.forEach(c => {
      if (c === shoppingDrag.card) return;
      const a = first.get(c), b = last.get(c);
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      c.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    grid.offsetWidth;
    cards.forEach(c => {
      if (c === shoppingDrag.card) return;
      c.style.transition = `transform ${SHOPPING_DRAG_ANIM_MS}ms cubic-bezier(.2,.8,.2,1)`;
      c.style.transform = '';
    });
  }

  function reorderAt(x, y) {
    const d = shoppingDrag;
    if (!d || d.ending || performance.now() < d.lockUntil) return;
    const cards = cardsOf();
    let target = cards.find(c => c !== d.card && inRect(x, y, c.getBoundingClientRect()));
    // Over the "Neue Liste" card: to the end
    const newCard = document.getElementById('shoppingNewListCard');
    if (!target && newCard && inRect(x, y, newCard.getBoundingClientRect())) {
      target = cards[cards.length - 1];
      if (target === d.card) return;
    }
    if (!target) return;
    const from = cards.indexOf(d.card), to = cards.indexOf(target);
    if (from === to) return;
    flipMove(cards, () => { if (to > from) target.after(d.card); else target.before(d.card); });
    d.lockUntil = performance.now() + SHOPPING_DRAG_ANIM_MS * 0.7;
  }

  function moveDrag(x, y) {
    const d = shoppingDrag;
    if (!d || d.ending) return;
    d.x = x; d.y = y;
    d.ghost.style.left = (x - d.offX) + 'px';
    d.ghost.style.top = (y - d.offY) + 'px';
    reorderAt(x, y);
  }

  // Scroll on automatically at the top/bottom edge so places far away can be reached too.
  function autoScrollLoop() {
    const d = shoppingDrag;
    if (!d || d.ending) return;
    const sc = grid.parentElement;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const edge = 70;
      let v = 0;
      if (d.y < r.top + edge) v = -Math.min(18, Math.ceil((r.top + edge - d.y) / 5));
      else if (d.y > r.bottom - edge) v = Math.min(18, Math.ceil((d.y - (r.bottom - edge)) / 5));
      if (v) {
        const before = sc.scrollTop;
        sc.scrollTop += v;
        if (sc.scrollTop !== before) reorderAt(d.x, d.y);
      }
    }
    d.raf = requestAnimationFrame(autoScrollLoop);
  }

  function endDrag() {
    const d = shoppingDrag;
    if (!d || d.ending) return;
    d.ending = true;
    cancelAnimationFrame(d.raf);
    suppressNextClick();
    grid.classList.remove('shopping-reordering');
    document.body.classList.remove('shopping-dragging');
    const r = d.card.getBoundingClientRect();
    d.ghost.style.transition = `left ${SHOPPING_DRAG_ANIM_MS}ms cubic-bezier(.2,.8,.2,1), top ${SHOPPING_DRAG_ANIM_MS}ms cubic-bezier(.2,.8,.2,1), transform ${SHOPPING_DRAG_ANIM_MS}ms cubic-bezier(.2,.8,.2,1)`;
    d.ghost.style.left = r.left + 'px';
    d.ghost.style.top = r.top + 'px';
    d.ghost.style.transform = 'scale(1)';
    setTimeout(() => {
      d.ghost.remove();
      d.card.classList.remove('shopping-drag-slot');
      cardsOf().forEach(c => { c.style.transition = ''; c.style.transform = ''; });
      shoppingDrag = null;
      const current = allShoppingLists().map(l => l.id);
      let ids = cardsOf().map(c => c.dataset.listId).filter(Boolean);
      // Keep hidden lists (meal planning in mode "Direkt") at their previous place
      current.forEach((id, i) => {
        if (ids.includes(id)) return;
        const prev = current.slice(0, i).reverse().find(x => ids.includes(x));
        const pos = prev ? ids.indexOf(prev) + 1 : 0;
        ids = [...ids.slice(0, pos), id, ...ids.slice(pos)];
      });
      if (ids.length && JSON.stringify(ids) !== JSON.stringify(current)) {
        shoppingListOrder = ids;
        persistState();
      }
      if (shoppingDragRenderPending) {
        shoppingDragRenderPending = false;
        if (currentView === 'einkauf') renderShoppingList();
      }
    }, SHOPPING_DRAG_ANIM_MS + 20);
  }

  // ----- Touch (iPhone/iPad): press and hold, then drag -----
  grid.addEventListener('touchstart', (e) => {
    if (shoppingDrag) return;
    if (e.touches.length !== 1) { cancelPress(); return; }
    const card = e.target.closest('.shopping-list-card');
    if (!card || !grid.contains(card)) return;
    const t = e.touches[0];
    cancelPress();
    const p = { card, x: t.clientX, y: t.clientY, mode: 'touch', timer: null };
    p.timer = setTimeout(() => {
      if (press !== p) return;
      press = null;
      startDrag(p.card, p.x, p.y, 'touch');
    }, SHOPPING_DRAG_LONGPRESS_MS);
    press = p;
  }, { passive: true });

  grid.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    if (press && press.mode === 'touch') {
      // Finger moves before lifting: normal scrolling, no dragging
      if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > 8) cancelPress();
      return;
    }
    if (shoppingDrag && shoppingDrag.mode === 'touch') {
      if (e.cancelable) e.preventDefault();
      moveDrag(t.clientX, t.clientY);
    }
  }, { passive: false });

  const touchFinish = (e) => {
    if (press && press.mode === 'touch') cancelPress();
    if (shoppingDrag && shoppingDrag.mode === 'touch') {
      if (e.cancelable) e.preventDefault();
      endDrag();
    }
  };
  grid.addEventListener('touchend', touchFinish, { passive: false });
  grid.addEventListener('touchcancel', touchFinish, { passive: false });

  // No context menu / no magnifier while holding
  grid.addEventListener('contextmenu', (e) => {
    if (press || shoppingDrag || e.target.closest('.shopping-list-card')) e.preventDefault();
  });
  grid.addEventListener('dragstart', (e) => e.preventDefault());

  // ----- Mouse (desktop): drag with the button held down -----
  grid.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || shoppingDrag || (press && press.mode === 'touch')) return;
    const card = e.target.closest('.shopping-list-card');
    if (!card || !grid.contains(card)) return;
    press = { card, x: e.clientX, y: e.clientY, mode: 'mouse', timer: null };
  });
  document.addEventListener('mousemove', (e) => {
    if (press && press.mode === 'mouse') {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) {
        const p = press;
        press = null;
        startDrag(p.card, p.x, p.y, 'mouse');
        moveDrag(e.clientX, e.clientY);
      }
      return;
    }
    if (shoppingDrag && shoppingDrag.mode === 'mouse') {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
    }
  });
  document.addEventListener('mouseup', () => {
    if (press && press.mode === 'mouse') cancelPress();
    if (shoppingDrag && shoppingDrag.mode === 'mouse') endDrag();
  });
})();

/* ---------- Rows of a shopping slip (single list and combined view) ---------- */
/* ---------- Rows of the shopping list ----------
   Designed like the other lists of the app (pantry): cards with a border, grouped by categories.
   Tapping the item strikes it through (own entries: in the cart, recipe ingredients: still have it)
   and moves it down to „Abgehakt“. Plus/minus next to the quantity changes it directly,
   a long press opens editing or the breakdown as before. */
let shoppingJustToggledKey = '';
function shoppingQtyControlsHtml(kind, id, qtyText, muted, pantry = false) {
  const q = qtyPretty(qtyText);
  // Pantry items: on the phone only the number („2“ instead of „2 Packungen“) – weight & amount („500 g“) stay
  const inner = q.unit
    ? `<span>${escapeHtml(q.num)}</span><span class="${pantry && !q.measure ? 'sq-u-hide' : ''}"> ${escapeHtml(q.unit)}</span>`
    : escapeHtml(q.num || '1');
  const title = q.full ? ` title="${escapeHtml(q.full)}"` : '';
  if (muted) return qtyText ? `<span class="shop-qty-val shrink-0 text-sm text-ink/30 line-through px-2"${title}>${inner}</span>` : '';
  return `
        <div class="shop-qty flex items-center gap-1 pr-2 shrink-0">
          <button type="button" class="shop-qty-btn shop-qty-minus" data-kind="${kind}" data-id="${escapeHtml(id)}" data-dir="-1" aria-label="${escapeHtml(tk('shop.oneLess'))}">−</button>
          <span class="shop-qty-val text-center text-sm font-semibold ${qtyText ? '' : 'text-ink/35 font-normal'}"${title}>${inner}</span>
          <button type="button" class="shop-qty-btn shop-qty-plus" data-kind="${kind}" data-id="${escapeHtml(id)}" data-dir="1" aria-label="${escapeHtml(tk('shop.oneMore'))}">+</button>
        </div>`;
}
function shoppingManualRowHtml(it) {
  const { qty, note } = manualItemQtyNote(it);
  const muted = !!it.done;
  const pItem = pantryItemForShopping(it);
  const fresh = shoppingJustToggledKey === 'm:' + it.id;
  return `
    <div class="shop-row ${muted ? 'is-done' : ''} ${fresh ? 'shop-row-fresh' : ''}">
      <button type="button" class="shopping-manual-row shop-row-main flex-1 min-w-0 flex items-center gap-3 text-left select-none" data-manual-id="${escapeHtml(it.id)}">
        <span class="shop-check" aria-hidden="true">${muted ? '✓' : ''}</span>
        <span class="flex-1 min-w-0">
          <span class="flex items-center gap-1.5 min-w-0"><span class="shop-name truncate">${escapeHtml(truncateTitle(it.name || '', 40))}</span>${pItem ? `<span class="pantry-tag shrink-0 ${muted ? 'opacity-40' : ''}" title="${escapeHtml(tk('shop.pantryStock', { stock: pantryStockText(pItem) }))}">${escapeHtml(tk('shop.pantryTag'))}</span>` : ''}</span>
          ${note ? `<span class="shop-note block truncate">${escapeHtml(note)}</span>` : ''}
        </span>
      </button>
      ${shoppingQtyControlsHtml('m', it.id, qty, muted, !!pItem)}
    </div>`;
}
function shoppingRecipeRouteTagHtml(item, muted) {
  if (!item.route) return '';
  const list = getShoppingList(item.route);
  const rule = shoppingActiveRules().find(r => r.listId === item.route);
  if (!list) return '';
  return `<span class="shrink-0 max-w-[45%] truncate text-[10px] font-sans px-1.5 py-0.5 rounded-full bg-mustard/15 text-mustard ${muted ? 'opacity-40' : ''}" title="${escapeHtml(tk('shop.onListNamed', { name: list.name || '' }))}">${rule ? rule.icon : '➜'} ${escapeHtml(list.name || '')}</span>`;
}
function shoppingRecipeRowHtml(item, showRoute = false) {
  const adj = getShoppingItemAdjustment(item.key);
  const muted = adj.excluded;
  const { label, qtyText } = shoppingRecipeLabelQty(item);
  const fresh = shoppingJustToggledKey === 'r:' + item.key;
  const qtyHtml = item.hasQuantity
    ? shoppingQtyControlsHtml('r', item.key, qtyText, muted)
    : '';
  return `
    <div class="shop-row ${muted ? 'is-done' : ''} ${fresh ? 'shop-row-fresh' : ''}">
      <button type="button" class="shopping-item-row shop-row-main flex-1 min-w-0 flex items-center gap-3 text-left select-none" data-item-key="${escapeHtml(item.key)}">
        <span class="shop-check" aria-hidden="true">${muted ? '✓' : ''}</span>
        <span class="flex-1 min-w-0">
          <span class="flex items-center gap-1.5 min-w-0"><span class="shop-name truncate">${escapeHtml(truncateTitle(label, 40))}</span>${showRoute ? shoppingRecipeRouteTagHtml(item, muted) : ''}</span>
          <span class="shop-note block truncate">🍽️ <span>${escapeHtml(muted ? tk('shop.stillAtHome') : tk('shop.fromMealPlan'))}</span></span>
        </span>
      </button>
      ${qtyHtml}
    </div>`;
}
// Content of a list: open items by category (order from the settings), below it
// everything checked off. Own entries come before the recipe ingredients within their category.
function shoppingGroupedBodyHtml(manual, recipeItems, showRoute) {
  const openManual = manual.filter(it => !it.done);
  const doneManual = manual.filter(it => it.done);
  const openRecipe = [], doneRecipe = [];
  (recipeItems || []).forEach(i => (getShoppingItemAdjustment(i.key).excluded ? doneRecipe : openRecipe).push(i));
  const groups = shoppingCategoriesOrdered().map(c => ({
    cat: c,
    manual: openManual.filter(it => shoppingItemCategory(it) === c.id),
    recipe: openRecipe.filter(i => shoppingAutoCategory(shoppingRecipeLabelQty(i).label) === c.id),
  })).filter(g => g.manual.length || g.recipe.length);
  const groupHtml = groups.map(g => `
    <div class="shop-group">
      <h3 class="shop-group-head"><span class="text-sm">${escapeHtml(g.cat.icon || '')}</span>${escapeHtml(g.cat.label)}<span class="text-ink/30 normal-case tracking-normal">· ${g.manual.length + g.recipe.length}</span></h3>
      <div class="flex flex-col gap-1.5">${g.manual.map(shoppingManualRowHtml).join('')}${g.recipe.map(i => shoppingRecipeRowHtml(i, showRoute)).join('')}</div>
    </div>`).join('');
  const doneCount = doneManual.length + doneRecipe.length;
  const doneHtml = doneCount ? `
    <div class="shop-group shop-group-done">
      <h3 class="shop-group-head"><span class="text-sm">✓</span>${tk('shop.checkedOff')}<span class="text-ink/30 normal-case tracking-normal">· ${doneCount}</span></h3>
      <div class="flex flex-col gap-1.5">${doneManual.map(shoppingManualRowHtml).join('')}${doneRecipe.map(i => shoppingRecipeRowHtml(i, showRoute)).join('')}</div>
    </div>` : '';
  if (!groupHtml && doneCount) return ('<p class="text-sm text-pine text-center py-1">' + tk('shop.allChecked') + '</p>') + doneHtml;
  return groupHtml + doneHtml;
}
// Check off all own entries of a list or reopen them
function toggleAllShoppingItemsOfList(listId) {
  const manual = shoppingItemsOfList(listId);
  if (!manual.length) return;
  const allDone = manual.every(it => it.done);
  const ids = new Set(manual.map(it => it.id));
  shoppingItems = shoppingItems.map(x => ids.has(x.id) ? { ...x, done: !allDone } : x);
  if (!allDone) removePantrySiblings(manual.filter(it => it.pantryId));
  else syncPantryToShopping();
  persistState();
  renderShoppingList();
}
// Own entries: tap = check off (in the cart), long press = edit/delete.
// Recipe ingredients: tap = "Hab ich noch zu Hause", long press = breakdown.
// Plus/minus: change the quantity directly (recipe ingredients only for this shopping trip).
function wireShoppingRows(rootEl, recipeItems, from, to) {
  rootEl.querySelectorAll('.shopping-manual-row').forEach(row => {
    const id = row.dataset.manualId;
    let suppressClick = false;
    attachIngredientLongPress(row, () => {
      suppressClick = true;
      const it = shoppingItems.find(x => x.id === id);
      if (it) openShoppingItemModal({ editId: it.id });
    });
    row.addEventListener('pointerdown', () => { suppressClick = false; });
    row.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      const it = shoppingItems.find(x => x.id === id);
      if (!it) return;
      shoppingItems = shoppingItems.map(x => x.id === id ? { ...x, done: !x.done } : x);
      if (!it.done && it.pantryId) removePantrySiblings([it]); // checked off: take it off the other lists
      else if (it.done && it.pantryId) syncPantryToShopping(); // open again: back onto the other lists if needed
      shoppingJustToggledKey = 'm:' + id;
      persistState();
      renderShoppingList();
    });
  });
  rootEl.querySelectorAll('.shopping-item-row').forEach(row => {
    const item = (recipeItems || []).find(i => i.key === row.dataset.itemKey);
    if (!item) return;
    let suppressClick = false;
    attachIngredientLongPress(row, () => { suppressClick = true; showIngredientBreakdown(item, from, to); });
    row.addEventListener('pointerdown', () => { suppressClick = false; });
    row.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      const adj = getShoppingItemAdjustment(item.key);
      shoppingListAdjustments.set(item.key, { ...adj, excluded: !adj.excluded });
      shoppingJustToggledKey = 'r:' + item.key;
      renderShoppingList();
    });
  });
  rootEl.querySelectorAll('.shop-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dir = Number(btn.dataset.dir) || 1;
      const id = btn.dataset.id;
      shoppingJustToggledKey = '';
      if (btn.dataset.kind === 'm') {
        const it = shoppingItems.find(x => x.id === id);
        if (!it) return;
        const next = shoppingStepQtyText(it.qty, dir);
        if (next === String(it.qty || '').trim()) return;
        shoppingItems = shoppingItems.map(x => x.id === id ? { ...x, qty: next } : x);
        persistState();
      } else {
        const item = (recipeItems || []).find(i => i.key === id);
        if (!item) return;
        const adj = getShoppingItemAdjustment(id);
        const before = shoppingRecipeLabelQty(item).qtyText;
        const delta = (Number(adj.delta) || 0) + dir;
        shoppingListAdjustments.set(id, { ...adj, delta });
        if (shoppingRecipeLabelQty(item).qtyText === before) { shoppingListAdjustments.set(id, adj); return; }
      }
      renderShoppingList();
    });
  });
  shoppingJustToggledKey = '';
}

// Task (incl. a just checked-off, not yet confirmed state) for the planned shopping trip
function shoppingPlanTask(taskId) {
  const t = deriveTasks().find(x => x.id === taskId);
  if (t && taskDoneOverrides.has(t.id)) t.done = taskDoneOverrides.get(t.id);
  return t || null;
}

/* ---------- Combined view: several lists of a planned shopping trip ----------
   Every list gets its own head (logo, name, number open, "Alle", "Öffnen") and its
   own slip with a colour bar in the shop colour - so it stays clear at a glance what belongs in
   which shop. Checking off & co. work exactly as on the single list. */
function renderShoppingCombinedDetail() {
  const taskId = currentShoppingPlanTaskId;
  const listIds = shoppingCombinedListIds();
  const lists = listIds.map(id => getShoppingList(id));
  const task = shoppingPlanTask(taskId);
  const plan = shoppingPlanForTask(taskId);
  const hasMeal = listIds.some(listHasRecipeItems);
  const contentEl = document.getElementById('shoppingListContent');
  const metaEl = document.getElementById('shoppingListMeta');
  const emptyEl = document.getElementById('emptyShoppingList');
  const actionsEl = document.getElementById('shoppingListActions');

  document.getElementById('shoppingDetailLogo').innerHTML =
    `<div class="shopping-combined-logos">${lists.slice(0, 3).map(l => shoppingListLogoHtml(l, 30)).join('')}</div>`;
  document.getElementById('shoppingDetailTitle').textContent = (task && task.title) || tk('shop.shoppingAt', { names: lists.map(l => l.name || '').join(', ') });
  document.getElementById('editShoppingListBtn').classList.add('hidden');
  document.getElementById('openShoppingMoveBtn').classList.add('hidden');
  document.getElementById('shoppingDateRangeBlock').classList.toggle('hidden', !hasMeal);
  document.getElementById('clearDoneShoppingItemsBtn').classList.add('hidden');

  const { from, to, valid: rangeValid } = shoppingRangeValues();
  let recipeItems = [];
  if (hasMeal && rangeValid) recipeItems = computeShoppingList(from, to).items;

  const totalOpen = listIds.reduce((sum, id) => sum + shoppingListSummary(id).count, 0);
  const metaParts = [tk('shop.listsMerged', { n: lists.length }), tk('shop.itemsOpen', { n: totalOpen })];
  if (task && task.dueDate) metaParts.push((tk('shop.due') + ' ') + fmtDateTime(task.dueDate, null));
  metaEl.textContent = metaParts.join(' · ');
  emptyEl.classList.add('hidden');

  const sectionsHtml = lists.map(list => {
    const isMeal = listHasRecipeItems(list.id);
    const manual = shoppingItemsOfList(list.id);
    const items = isMeal ? recipeItemsForList(list.id, recipeItems) : [];
    const showRoute = list.id === SHOPPING_MEAL_LIST_ID;
    const { count } = shoppingListSummary(list.id);
    const color = shoppingListColor(list);
    const allDone = manual.length > 0 && manual.every(it => it.done);
    const body = (manual.length || items.length)
      ? shoppingGroupedBodyHtml(manual, items, showRoute)
      : `<p class="text-sm text-ink/35 italic text-center py-2">${isMeal ? tk('shop.nothingPlannedPeriod') : tk('shop.listEmpty')}</p>`;
    return `
      <section class="shopping-combined-section mx-auto w-full max-w-xl" style="--list-color:${color}">
        <div class="shopping-combined-head">
          ${shoppingListLogoHtml(list, 30)}
          <div class="flex-1 min-w-0">
            <div class="font-serif text-base leading-tight truncate">${escapeHtml(list.name || '')}</div>
            <div class="text-[11px] text-ink/50 leading-tight">${count ? escapeHtml(tk('shop.nOpen', { n: count })) : escapeHtml(tk('shop.nothingOpen'))}</div>
          </div>
          ${manual.length ? `<button type="button" class="shopping-section-all shrink-0 px-2.5 py-1 rounded-lg border border-ink/15 bg-white text-[11px] text-ink/60 hover:text-pine hover:border-pine transition" data-list-id="${escapeHtml(list.id)}">${allDone ? tk('shop.selectNone') : tk('shop.selectAll')}</button>` : ''}
          <button type="button" class="shopping-section-open shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium hover:bg-white/60 transition" style="color:${color}" data-list-id="${escapeHtml(list.id)}">${escapeHtml(tk('shop.open'))}</button>
        </div>
        <div class="shopping-combined-paper shop-list-body px-3 py-3">
          ${body}
        </div>
      </section>`;
  }).join('');

  contentEl.innerHTML = `<div class="flex flex-col gap-5">${sectionsHtml}</div>`;

  actionsEl.classList.remove('hidden');
  actionsEl.classList.add('flex');
  const finishBtn = document.getElementById('finishShoppingPlanBtn');
  finishBtn.classList.toggle('hidden', !task || !!task.done || !!(plan && plan.bookedAt));

  contentEl.querySelectorAll('.shopping-section-all').forEach(btn => {
    btn.addEventListener('click', () => toggleAllShoppingItemsOfList(btn.dataset.listId));
  });
  contentEl.querySelectorAll('.shopping-section-open').forEach(btn => {
    btn.addEventListener('click', () => openShoppingList(btn.dataset.listId, { backToPlanTaskId: taskId }));
  });
  wireShoppingRows(contentEl, recipeItems, from, to);
}

function renderShoppingDetail() {
  if (currentShoppingPlanTaskId) { renderShoppingCombinedDetail(); return; }
  document.getElementById('finishShoppingPlanBtn').classList.add('hidden');
  const listId = currentShoppingListId;
  const list = getShoppingList(listId);
  const isMeal = listId === SHOPPING_MEAL_LIST_ID;
  const contentEl = document.getElementById('shoppingListContent');
  const metaEl = document.getElementById('shoppingListMeta');
  const emptyEl = document.getElementById('emptyShoppingList');
  const actionsEl = document.getElementById('shoppingListActions');
  const clearDoneBtn = document.getElementById('clearDoneShoppingItemsBtn');

  document.getElementById('shoppingDetailLogo').innerHTML = shoppingListLogoHtml(list, 34);
  document.getElementById('shoppingDetailTitle').textContent = list.name || '';
  const showsRecipes = listHasRecipeItems(listId);
  const mealMode = shoppingMealMode();
  const stammId = shoppingStammladenId();
  const stammList = stammId ? getShoppingList(stammId) : null;
  const editBtn = document.getElementById('editShoppingListBtn');
  editBtn.classList.remove('hidden');
  editBtn.textContent = isMeal ? '⭐' : '✎';
  editBtn.setAttribute('aria-label', isMeal ? tk('shop.setMainShop') : tk('lists.editList'));
  editBtn.title = isMeal ? tk('shop.setMainShop') : tk('lists.editList');
  document.getElementById('shoppingDateRangeBlock').classList.toggle('hidden', !showsRecipes);

  // Recipe ingredients are on the meal planning and (mirrored/direct) in the main shop - they
  // depend on the period, the own entries do not.
  const { from, to, valid: rangeValid } = shoppingRangeValues();
  let items = [], mealCount = 0, recipeCount = 0, transferredCount = 0;
  let routedAway = []; // Ingredients that are on a special list from here
  if (showsRecipes && rangeValid) {
    let allItems;
    ({ items: allItems, mealCount, recipeCount } = computeShoppingList(from, to));
    items = recipeItemsForList(listId, allItems);
    if (!isMeal && listShowsRecipes(listId)) routedAway = allItems.filter(i => i.route && i.route !== listId && !getShoppingItemAdjustment(i.key).excluded);
    transferredCount = shoppingTransferredMealsInRange(from, to).length;
  }

  // Note on how meal planning and main shop are currently connected
  let linkNote = '';
  if (isMeal && stammList && mealMode === 'mirror') linkNote = escapeHtml(tk('shop.autoMirroredTo', { name: stammList.name || '' }));
  else if (isMeal && stammList && mealMode === 'direct') linkNote = escapeHtml(tk('shop.ingredientsDirectlyOn', { name: stammList.name || '' }));
  else if (!isMeal && listId === stammId && mealMode === 'mirror') linkNote = tk('shop.mainIngredientsMirrored');
  else if (!isMeal && listId === stammId && mealMode === 'direct') linkNote = tk('shop.mainIngredients');
  else if (!isMeal && listId === stammId) linkNote = tk('shop.mainShop');
  const ruleHere = shoppingActiveRules().filter(r => r.listId === listId);
  if (!isMeal && ruleHere.length) {
    const ruleNote = ruleHere.map(r => r.icon).join('') + ' ' + escapeHtml(tk('shop.ruleFromMeal', { names: ruleHere.map(r => r.name).join(', ') }));
    linkNote = linkNote ? linkNote + ' · ' + ruleNote : ruleNote;
  }
  if (routedAway.length) {
    const byList = new Map();
    routedAway.forEach(i => byList.set(i.route, (byList.get(i.route) || 0) + 1));
    const notes = [...byList.entries()].map(([id, n]) => {
      const l = getShoppingList(id); const r = shoppingActiveRules().find(x => x.listId === id);
      return `${r ? r.icon : '➜'} ${escapeHtml(tk('shop.ingredientsTo', { n, name: (l && l.name) || '' }))}`;
    });
    linkNote = (linkNote ? linkNote + ' · ' : '') + notes.join(' · ');
  }

  if (!showsRecipes) {
    metaEl.innerHTML = linkNote;
  } else if (!rangeValid) {
    metaEl.innerHTML = (linkNote ? linkNote + ' · ' : '') + (from && to ? tk('shop.endBeforeStart') : '');
  } else {
    const parts = [];
    if (linkNote) parts.push(linkNote);
    if (mealCount) parts.push(escapeHtml(tk('shop.plannedMeals', { n: mealCount }) + ' ' + tk('shop.fromRecipes', { n: recipeCount })));
    if (transferredCount) parts.push(`${escapeHtml(tk('shop.mealsTransferred', { n: transferredCount }))} – <button type="button" id="restoreTransferredMealsBtn" class="underline hover:text-pine">${escapeHtml(tk('shop.showAgain'))}</button>`);
    metaEl.innerHTML = parts.join(' · ');
    const restoreBtn = document.getElementById('restoreTransferredMealsBtn');
    if (restoreBtn) restoreBtn.addEventListener('click', () => {
      const ids = new Set(shoppingTransferredMealsInRange(from, to).map(p => String(p.id)));
      shoppingTransferred = shoppingTransferred.filter(x => !ids.has(String(x.id)));
      persistState();
      renderShoppingList();
    });
  }

  const manual = shoppingItemsOfList(listId);
  const hasAny = manual.length > 0 || items.length > 0;
  const hasOpen = manual.some(it => !it.done) || items.some(item => !getShoppingItemAdjustment(item.key).excluded);
  document.getElementById('openShoppingMoveBtn').classList.toggle('hidden', !hasOpen);

  if (showsRecipes) {
    emptyEl.textContent = transferredCount && !mealCount
      ? tk('shop.ingredientsElsewhere')
      : (!listShowsRecipes(listId) && mealCount)
        ? tk('shop.noRuleIngredient')
        : tk('shop.noRecipeMeal');
    emptyEl.classList.toggle('hidden', !rangeValid || items.length > 0 || (!isMeal && manual.length > 0));
  } else if (isMeal && mealMode === 'direct' && stammList) {
    emptyEl.textContent = tk('shop.directOnlyOwn', { name: stammList.name || '' });
    emptyEl.classList.toggle('hidden', manual.length > 0);
  } else {
    emptyEl.textContent = tk('shop.listStillEmpty');
    emptyEl.classList.toggle('hidden', manual.length > 0);
  }
  actionsEl.classList.toggle('hidden', !hasAny);
  actionsEl.classList.toggle('flex', hasAny);
  clearDoneBtn.classList.toggle('hidden', !manual.some(it => it.done));

  if (!hasAny) { contentEl.innerHTML = ''; return; }

  const allManualDone = manual.length > 0 && manual.every(it => it.done);
  const selectAllHtml = manual.length ? `
    <div class="mx-auto w-full max-w-xl flex justify-end mb-2">
      <button type="button" id="shoppingSelectAllBtn" class="px-3 py-1.5 rounded-lg border border-ink/15 bg-white text-xs text-ink/60 hover:text-pine hover:border-pine transition">${allManualDone ? tk('shop.checkNone') : tk('shop.checkAll')}</button>
    </div>` : '';
  contentEl.innerHTML = selectAllHtml + `
    <div id="shoppingListPaper" class="shop-list-body mx-auto w-full max-w-xl">
      ${shoppingGroupedBodyHtml(manual, items, isMeal)}
    </div>
  `;

  // At the top: check off all own entries at once (or reopen them all)
  const selectAllBtn = document.getElementById('shoppingSelectAllBtn');
  if (selectAllBtn) selectAllBtn.addEventListener('click', () => toggleAllShoppingItemsOfList(listId));

  wireShoppingRows(contentEl, items, from, to);
}

/* ---------- Popup: move content ---------- */
function openShoppingMoveModal() {
  const src = getShoppingList(currentShoppingListId);
  if (!src) return;
  const { manual, recipe } = collectOpenShoppingEntries(src.id);
  const total = manual.length + recipe.length;
  // The main shop is at the very top as target (preselected)
  const stammId = shoppingStammladenId();
  const targets = allShoppingLists().filter(l => l.id !== src.id)
    .sort((a, b) => (b.id === stammId) - (a.id === stammId));
  const infoEl = document.getElementById('shoppingMoveInfo');
  const targetsEl = document.getElementById('shoppingMoveTargets');
  const emptyEl = document.getElementById('shoppingMoveEmpty');

  infoEl.textContent = tk('shop.moveInfo', { n: total, name: src.name })
    + (listHasRecipeItems(src.id) ? (' ' + tk('shop.moveNotHome')) : '')
    + (src.id === SHOPPING_MEAL_LIST_ID && shoppingActiveRules().length ? (' ' + tk('shop.moveRulesStay')) : '');

  targetsEl.innerHTML = '';
  emptyEl.classList.add('hidden');
  if (!total) {
    emptyEl.textContent = tk('shop.moveNothingOpen');
    emptyEl.classList.remove('hidden');
  } else if (!targets.length) {
    emptyEl.innerHTML = (tk('shop.moveNoOther') + ' <button type="button" id="shoppingMoveNewListBtn" class="underline text-pine">' + tk('shop.main.createOne') + '</button>');
    emptyEl.classList.remove('hidden');
    document.getElementById('shoppingMoveNewListBtn').addEventListener('click', () => {
      closeShoppingMoveModal();
      openShoppingListModal(null, { reopenMove: true });
    });
  } else {
    targetsEl.innerHTML = targets.map(l => {
      const { count } = shoppingListSummary(l.id);
      const isStamm = l.id === stammId;
      return `
        <button type="button" class="shopping-move-target w-full flex items-center gap-3 rounded-xl border ${isStamm ? 'border-pine bg-pine/5 ring-1 ring-pine' : 'border-ink/10'} hover:border-pine hover:bg-pine/5 transition px-3 py-2.5 text-left" data-list-id="${escapeHtml(l.id)}">
          ${shoppingListLogoHtml(l, 36)}
          <span class="flex-1 min-w-0">
            <span class="block truncate text-sm font-medium">${escapeHtml(l.name || '')}</span>
            ${isStamm ? ('<span class="block text-[11px] text-mustard">' + tk('shop.mainShop') + '</span>') : ''}
          </span>
          <span class="shrink-0 text-xs text-ink/40">${count ? count + ' offen' : 'leer'}</span>
        </button>
      `;
    }).join('') + ('\n      <button type="button" id="shoppingMoveNewListBtn" class="w-full rounded-xl border-2 border-dashed border-ink/15 text-ink/40 hover:text-pine hover:border-pine transition px-3 py-2.5 text-sm">' + tk('shop.createNewList') + '</button>\n    ');
    targetsEl.querySelectorAll('.shopping-move-target').forEach(btn => {
      btn.addEventListener('click', () => {
        const toId = btn.dataset.listId;
        moveShoppingListContent(src.id, toId);
        closeShoppingMoveModal();
        openShoppingList(toId);
      });
    });
    document.getElementById('shoppingMoveNewListBtn').addEventListener('click', () => {
      closeShoppingMoveModal();
      openShoppingListModal(null, { reopenMove: true });
    });
  }
  document.getElementById('shoppingMoveModal').classList.remove('hidden');
}
function closeShoppingMoveModal() {
  document.getElementById('shoppingMoveModal').classList.add('hidden');
}

/* ---------- Popup: create / edit list ---------- */
let shoppingListModalEditId = null;
let shoppingListModalStore = 'rewe';
let shoppingListModalLogo = '';
let shoppingListModalReopenMove = false;
let shoppingListModalStamm = false;       // Checkbox "Als Stammladen festlegen"
let shoppingListModalStammMode = 'mirror'; // chosen mode in the list popup

function shoppingListModalDraft() {
  return {
    id: shoppingListModalEditId || 'draft',
    name: document.getElementById('shoppingListNameInput').value.trim() || shoppingStoreName(shoppingStoreByKey(shoppingListModalStore)) || '',
    store: shoppingListModalStore,
    domain: shoppingListModalStore === 'eigener' ? normalizeShoppingDomain(document.getElementById('shoppingListDomainInput').value) : '',
    logo: shoppingListModalLogo,
  };
}
function renderShoppingListModalStamm() {
  document.getElementById('shoppingListStammCheck').checked = shoppingListModalStamm;
  document.getElementById('shoppingListStammModeBlock').classList.toggle('hidden', !shoppingListModalStamm);
  renderShoppingMealModeOptions('shoppingListStammModes', shoppingListModalStammMode, (mode) => {
    shoppingListModalStammMode = mode;
    renderShoppingListModalStamm();
  });
}
function updateShoppingListModalPreview() {
  document.getElementById('shoppingListLogoPreview').innerHTML = shoppingListLogoHtml(shoppingListModalDraft(), 52);
  document.getElementById('removeShoppingListLogoBtn').classList.toggle('hidden', !shoppingListModalLogo);
  document.getElementById('shoppingListDomainBlock').classList.toggle('hidden', shoppingListModalStore !== 'eigener');
}
function renderShoppingStorePicker() {
  const el = document.getElementById('shoppingStorePicker');
  el.innerHTML = SHOPPING_STORES.map(st => {
    const active = st.key === shoppingListModalStore;
    return `
      <button type="button" class="shopping-store-option flex flex-col items-center gap-1 rounded-xl p-1.5 transition ${active ? 'bg-pine/10 ring-2 ring-pine' : 'hover:bg-ink/5'}" data-store="${st.key}">
        ${shoppingListLogoHtml({ id: 'store-' + st.key, name: shoppingStoreName(st), store: st.key }, 40)}
        <span class="text-[10px] leading-tight text-ink/60 text-center w-full truncate">${escapeHtml(shoppingStoreName(st))}</span>
      </button>
    `;
  }).join('');
  el.querySelectorAll('.shopping-store-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const nameInput = document.getElementById('shoppingListNameInput');
      const prev = shoppingStoreByKey(shoppingListModalStore);
      const next = shoppingStoreByKey(btn.dataset.store);
      // Only take over the name if none is set yet or it is still the name of the previously
      // chosen shop - don't overwrite a name typed in by the user.
      const current = nameInput.value.trim();
      if (!current || (prev && (current === prev.name || current === shoppingStoreName(prev)))) nameInput.value = next.custom ? '' : shoppingStoreName(next);
      shoppingListModalStore = next.key;
      renderShoppingStorePicker();
      updateShoppingListModalPreview();
      if (next.custom) nameInput.focus();
    });
  });
}
function openShoppingListModal(editId = null, opts = {}) {
  const existing = editId ? shoppingLists.find(l => l.id === editId) : null;
  shoppingListModalEditId = existing ? existing.id : null;
  shoppingListModalReopenMove = !!opts.reopenMove;
  shoppingListModalStore = existing ? (existing.store || 'eigener') : 'rewe';
  shoppingListModalLogo = existing ? (existing.logo || '') : '';
  document.getElementById('shoppingListModalTitle').textContent = existing ? tk('lists.editList') : tk('shop.list.newTitle');
  document.getElementById('shoppingListNameInput').value = existing ? (existing.name || '') : (shoppingStoreName(shoppingStoreByKey('rewe')));
  document.getElementById('shoppingListDomainInput').value = existing ? (existing.domain || '') : '';
  document.getElementById('saveShoppingListBtn').textContent = existing ? tk('common.save') : tk('common.create');
  document.getElementById('deleteShoppingListBtn').classList.toggle('hidden', !existing);
  shoppingListModalStamm = !!existing && existing.id === shoppingStammladenId();
  shoppingListModalStammMode = shoppingMealTarget.mode || 'mirror';
  renderShoppingListModalStamm();
  renderShoppingStorePicker();
  updateShoppingListModalPreview();
  ladenModalOpen(existing ? existing.id : '');
  kasseListModalSetup(existing);
  document.getElementById('shoppingListModal').classList.remove('hidden');
}
function closeShoppingListModal(afterSave = false) {
  document.getElementById('shoppingListModal').classList.add('hidden');
  const reopen = shoppingListModalReopenMove;
  shoppingListModalEditId = null;
  shoppingListModalReopenMove = false;
  document.getElementById('shoppingListLogoFile').value = '';
  if (reopen && afterSave && currentShoppingListId) openShoppingMoveModal();
}
function saveShoppingListFromModal() {
  const draft = shoppingListModalDraft();
  if (!draft.name) { document.getElementById('shoppingListNameInput').focus(); return; }
  let savedId = shoppingListModalEditId;
  if (shoppingListModalEditId) {
    const id = shoppingListModalEditId;
    shoppingLists = shoppingLists.map(l => l.id === id ? { ...l, name: draft.name, store: draft.store, domain: draft.domain, logo: draft.logo, kasse: kasseListModalValue(l.kasse) } : l);
  } else {
    savedId = 'sl' + Date.now() + Math.random().toString(36).slice(2, 6);
    shoppingLists = [...shoppingLists, { id: savedId, name: draft.name, store: draft.store, domain: draft.domain, logo: draft.logo, kasse: kasseListModalValue(''), createdAt: Date.now() }];
  }
  ladenModalSave(savedId, draft.name);
  const wasStamm = savedId === shoppingStammladenId();
  if (shoppingListModalStamm) {
    if (!wasStamm || shoppingListModalStammMode !== shoppingMealTarget.mode) applyShoppingMealTarget(savedId, shoppingListModalStammMode);
    else persistState();
  } else if (wasStamm) {
    applyShoppingMealTarget('', shoppingMealTarget.mode);
  } else {
    persistState();
  }
  closeShoppingListModal(true);
  renderShoppingList();
  renderShoppingSettings();
}
function deleteShoppingListFromModal() {
  const id = shoppingListModalEditId;
  const list = shoppingLists.find(l => l.id === id);
  if (!list) return;
  const count = shoppingItemsOfList(id).length;
  const msg = tk('shop.confirmDeleteList', { name: list.name }) + (count ? ' ' + tk('shop.entriesDeletedToo', { n: count }) : '');
  if (!confirm(msg)) return;
  shoppingItems = shoppingItems.filter(it => it.listId !== id);
  shoppingLists = shoppingLists.filter(l => l.id !== id);
  ladenQueueDelete(id); // Remove the shop's address/place
  if (shoppingMealTarget.listId === id) {
    shoppingMealTarget = { ...shoppingMealTarget, listId: '' };
    syncPantryToShopping();
  }
  shoppingIngredientRules = shoppingIngredientRules.map(r => r.listId === id ? { ...r, listId: '' } : r);
  persistState();
  shoppingListModalReopenMove = false;
  closeShoppingListModal();
  if (currentShoppingListId === id) currentShoppingListId = null;
  renderShoppingList();
  renderShoppingSettings();
}
// Own logo: stored as image data, scaled down to at most 128 px, so the
// family record stays small.
function readShoppingLogoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(tk('shop.fileUnreadable')));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(tk('shop.invalidImage')));
      img.onload = () => {
        const MAX = 128;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let data = canvas.toDataURL('image/png');
        if (data.length > 60000) {
          const c2 = document.createElement('canvas');
          c2.width = w; c2.height = h;
          const ctx2 = c2.getContext('2d');
          ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, w, h);
          ctx2.drawImage(img, 0, 0, w, h);
          data = c2.toDataURL('image/jpeg', 0.85);
        }
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Settings → Shopping: main shop & special lists ---------- */
// Order of the categories on the shopping lists (Settings → Shopping)
let shopCatFreshId = '';
function renderShoppingCategorySettings() {
  const wrap = document.getElementById('settingsShopCategories');
  if (!wrap) return;
  const cats = shoppingCategoriesOrdered();
  wrap.innerHTML = cats.map((c, i) => `
    <div class="shop-cat-row ${c.id === shopCatFreshId ? 'shop-cat-fresh' : ''}" data-cat="${escapeHtml(c.id)}">
      <span class="w-6 text-center text-[11px] text-ink/35 shrink-0">${i + 1}.</span>
      <span class="text-base shrink-0">${escapeHtml(c.icon || '')}</span>
      <span class="flex-1 min-w-0 text-sm truncate">${escapeHtml(c.label)}</span>
      <button type="button" class="shop-cat-move" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="${escapeHtml(tk('common.moveUp'))}">▲</button>
      <button type="button" class="shop-cat-move" data-move="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(tk('common.moveDown'))}">▼</button>
    </div>`).join('');
  shopCatFreshId = '';
  wrap.querySelectorAll('.shop-cat-move').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.closest('.shop-cat-row').dataset.cat;
    const order = shoppingCategoriesOrdered().map(c => c.id);
    const i = order.indexOf(id);
    const j = i + Number(btn.dataset.move);
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    shoppingCategoryOrder = order;
    shopCatFreshId = id;
    persistState();
    renderShoppingCategorySettings();
    if (currentView === 'einkauf') renderShoppingList();
  }));
}
function resetShoppingCategoryOrder() {
  if (!shoppingCategoryOrder.length) return;
  shoppingCategoryOrder = [];
  persistState();
  renderShoppingCategorySettings();
  if (currentView === 'einkauf') renderShoppingList();
}

function renderShoppingSettings() {
  renderShoppingCategorySettings();
  const wrap = document.getElementById('settingsIngredientRules');
  if (!wrap) return;
  // Main shop
  const stammId = shoppingStammladenId();
  const stamm = stammId ? getShoppingList(stammId) : null;
  const modeInfo = shoppingMealModeInfo(shoppingMealMode());
  document.getElementById('settingsStammLogo').innerHTML = stamm
    ? shoppingListLogoHtml(stamm, 34)
    : '<div class="w-[34px] h-[34px] rounded-[9px] border-2 border-dashed border-ink/20 grid place-items-center text-ink/35">–</div>';
  document.getElementById('settingsStammName').textContent = stamm ? '⭐ ' + (stamm.name || '') : tk('shop.noMainShop');
  document.getElementById('settingsStammMode').textContent = stamm && modeInfo ? modeInfo.icon + ' ' + modeInfo.label : tk('shop.mealOwnList');

  // Special lists
  document.getElementById('settingsAddMeatRuleBtn').classList.toggle('hidden', shoppingIngredientRules.some(r => r.preset === 'metzger'));
  if (!shoppingIngredientRules.length) {
    wrap.innerHTML = ('<p class="text-sm text-ink/40 italic">' + tk('shop.rule.none') + '</p>');
    return;
  }
  const listOptions = (sel) => ('<option value="">' + tk('shop.rule.chooseList') + '</option>') + shoppingLists.map(l =>
    `<option value="${escapeHtml(l.id)}" ${l.id === sel ? 'selected' : ''}>${escapeHtml(l.name || '')}${l.id === stammId ? (' ' + tk('shop.rule.mainSuffix')) : ''}</option>`).join('');
  wrap.innerHTML = shoppingIngredientRules.map(r => {
    const list = r.listId ? getShoppingList(r.listId) : null;
    const warn = !shoppingLists.length
      ? ('<p class="text-[11px] text-mustard mt-1">' + tk('shop.rule.createListFirst') + '</p>')
      : (!list ? ('<p class="text-[11px] text-mustard mt-1">' + tk('shop.rule.chooseListHint') + '</p>') : '');
    return `
      <div class="rounded-xl border border-ink/10 bg-white px-3 py-3 ${r.active ? '' : 'opacity-70'}" data-rule-id="${escapeHtml(r.id)}">
        <div class="flex items-center gap-2 mb-2.5">
          <span class="text-xl leading-none shrink-0">${escapeHtml(r.icon)}</span>
          <input type="text" class="rule-name flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm font-medium" value="${escapeHtml(r.name)}" maxlength="40" />
          <label class="shrink-0 flex items-center gap-1.5 text-xs text-ink/60 cursor-pointer select-none">
            <input type="checkbox" class="rule-active w-4 h-4" ${r.active ? 'checked' : ''} /> ${escapeHtml(tk('shop.rule.active'))}
          </label>
        </div>
        <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1">${tk('shop.rule.toList')}</label>
        <div class="flex items-center gap-2">
          ${list ? `<div class="shrink-0">${shoppingListLogoHtml(list, 30)}</div>` : ''}
          <select class="rule-list flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm bg-white">${listOptions(r.listId)}</select>
        </div>
        ${warn}
        <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1 mt-3">${tk('shop.rule.keywords')}</label>
        <textarea class="rule-keywords w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm leading-snug" rows="3" placeholder="${escapeHtml(tk('shop.rule.keywordsPlaceholder'))}">${escapeHtml(r.keywords.join(', '))}</textarea>
        <label class="block text-[11px] uppercase tracking-wide text-ink/40 mb-1 mt-2">${tk('shop.rule.exclude')}</label>
        <textarea class="rule-exclude w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm leading-snug" rows="2" placeholder="${escapeHtml(tk('shop.rule.excludePlaceholder'))}">${escapeHtml(r.exclude.join(', '))}</textarea>
        <p class="text-[11px] text-ink/40 mt-1">${tk('shop.rule.partWord')}</p>
        <div class="flex flex-wrap items-center gap-2 mt-3">
          ${r.preset && SHOPPING_RULE_PRESETS[r.preset] ? ('<button type="button" class="rule-reset px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/60 hover:text-pine hover:border-pine transition">' + tk('shop.rule.defaultKeywords') + '</button>') : ''}
          <div class="flex-1"></div>
          <button type="button" class="rule-delete px-2.5 py-1.5 rounded-lg border border-red-300 text-xs text-red-500 hover:bg-red-50 transition">${tk('common.remove')}</button>
        </div>
      </div>`;
  }).join('');

  const update = (id, patch, rerender) => {
    shoppingIngredientRules = shoppingIngredientRules.map(r => r.id === id ? { ...r, ...patch } : r);
    persistState();
    if (currentView === 'einkauf') renderShoppingList();
    if (rerender) renderShoppingSettings();
  };
  wrap.querySelectorAll('[data-rule-id]').forEach(card => {
    const id = card.dataset.ruleId;
    card.querySelector('.rule-name').addEventListener('change', (e) => update(id, { name: e.target.value.trim() || tk('shop.rule.name') }, false));
    card.querySelector('.rule-active').addEventListener('change', (e) => update(id, { active: e.target.checked }, true));
    card.querySelector('.rule-list').addEventListener('change', (e) => update(id, { listId: e.target.value }, true));
    card.querySelector('.rule-keywords').addEventListener('change', (e) => update(id, { keywords: splitRuleWords(e.target.value) }, false));
    card.querySelector('.rule-exclude').addEventListener('change', (e) => update(id, { exclude: splitRuleWords(e.target.value) }, false));
    const resetBtn = card.querySelector('.rule-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      const r = shoppingIngredientRules.find(x => x.id === id);
      const preset = r && SHOPPING_RULE_PRESETS[r.preset];
      if (!preset || !confirm(tk('shop.rule.confirmReset'))) return;
      update(id, { keywords: [...preset.keywords], exclude: [...preset.exclude] }, true);
    });
    card.querySelector('.rule-delete').addEventListener('click', () => {
      const r = shoppingIngredientRules.find(x => x.id === id);
      if (!r || !confirm(tk('shop.rule.confirmRemove', { name: r.name }))) return;
      shoppingIngredientRules = shoppingIngredientRules.filter(x => x.id !== id);
      persistState();
      if (currentView === 'einkauf') renderShoppingList();
      renderShoppingSettings();
    });
  });
}
function addShoppingIngredientRule(presetKey) {
  const preset = presetKey ? SHOPPING_RULE_PRESETS[presetKey] : null;
  // If there already is a butcher list, it is preselected directly
  const guess = presetKey === 'metzger' ? shoppingLists.find(l => l.store === 'metzger') : null;
  shoppingIngredientRules = [...shoppingIngredientRules, {
    id: 'ir' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    preset: presetKey || '',
    name: preset ? preset.name : tk('shop.rule.customName'),
    icon: preset ? preset.icon : '🏷️',
    listId: guess ? guess.id : '',
    keywords: preset ? [...preset.keywords] : [],
    exclude: preset ? [...preset.exclude] : [],
    active: true,
  }];
  persistState();
  if (currentView === 'einkauf') renderShoppingList();
  renderShoppingSettings();
}
document.getElementById('settingsStammBtn').addEventListener('click', openShoppingStammModal);
document.getElementById('settingsAddMeatRuleBtn').addEventListener('click', () => addShoppingIngredientRule('metzger'));
document.getElementById('settingsAddCustomRuleBtn').addEventListener('click', () => addShoppingIngredientRule(''));
document.getElementById('settingsShopCatReset').addEventListener('click', resetShoppingCategoryOrder);

/* ---------- Popup: set main shop (from the meal planning) ---------- */
let shoppingStammModalListId = '';
let shoppingStammModalMode = 'mirror';

function renderShoppingStammModal() {
  const picker = document.getElementById('shoppingStammListPicker');
  const noLists = document.getElementById('shoppingStammNoLists');
  const modeWrap = document.getElementById('shoppingStammModeWrap');
  noLists.classList.toggle('hidden', shoppingLists.length > 0);
  picker.classList.toggle('hidden', !shoppingLists.length);
  const off = !shoppingStammModalListId;
  const lists = allShoppingLists().filter(l => l.id !== SHOPPING_MEAL_LIST_ID);
  picker.innerHTML = `
    <button type="button" class="shopping-stamm-option flex flex-col items-center justify-center gap-1 rounded-xl p-2 transition ${off ? 'bg-pine/10 ring-2 ring-pine' : 'border border-ink/10 hover:bg-ink/5'}" data-list-id="">
      <div class="w-10 h-10 rounded-[10px] border-2 border-dashed border-ink/20 grid place-items-center text-ink/40 text-lg leading-none">–</div>
      <span class="text-[10px] leading-tight text-ink/60 text-center w-full truncate">${tk('shop.noMainShop')}</span>
    </button>` + lists.map(l => {
      const active = l.id === shoppingStammModalListId;
      return `
        <button type="button" class="shopping-stamm-option flex flex-col items-center gap-1 rounded-xl p-2 transition ${active ? 'bg-pine/10 ring-2 ring-pine' : 'border border-ink/10 hover:bg-ink/5'}" data-list-id="${escapeHtml(l.id)}">
          ${shoppingListLogoHtml(l, 40)}
          <span class="text-[10px] leading-tight text-ink/60 text-center w-full truncate">${active ? '⭐ ' : ''}${escapeHtml(l.name || '')}</span>
        </button>`;
    }).join('');
  picker.querySelectorAll('.shopping-stamm-option').forEach(btn => {
    btn.addEventListener('click', () => {
      shoppingStammModalListId = btn.dataset.listId || '';
      renderShoppingStammModal();
    });
  });
  modeWrap.classList.toggle('hidden', off);
  renderShoppingMealModeOptions('shoppingStammModes', shoppingStammModalMode, (mode) => {
    shoppingStammModalMode = mode;
    renderShoppingStammModal();
  });
}
function openShoppingStammModal() {
  shoppingStammModalListId = shoppingStammladenId();
  shoppingStammModalMode = shoppingMealTarget.mode || 'mirror';
  renderShoppingStammModal();
  document.getElementById('shoppingStammModal').classList.remove('hidden');
}
function closeShoppingStammModal() {
  document.getElementById('shoppingStammModal').classList.add('hidden');
}
function saveShoppingStammModal() {
  const changed = shoppingStammModalListId !== shoppingStammladenId() || shoppingStammModalMode !== shoppingMealTarget.mode;
  if (changed) applyShoppingMealTarget(shoppingStammModalListId, shoppingStammModalMode);
  closeShoppingStammModal();
  renderShoppingSettings();
  // In mode "Direkt" the meal planning without own entries is hidden -> switch to the main shop
  if (currentShoppingListId === SHOPPING_MEAL_LIST_ID && shoppingMealListHidden()) openShoppingList(shoppingStammladenId());
  else renderShoppingList();
}

(function initShoppingLists() {
  document.getElementById('openNewShoppingListBtn').addEventListener('click', () => openShoppingListModal());
  document.getElementById('shoppingBackBtn').addEventListener('click', showShoppingOverview);
  document.getElementById('editShoppingListBtn').addEventListener('click', () => {
    if (currentShoppingListId === SHOPPING_MEAL_LIST_ID) openShoppingStammModal();
    else if (currentShoppingListId) openShoppingListModal(currentShoppingListId);
  });
  document.getElementById('shoppingListStammCheck').addEventListener('change', (e) => {
    shoppingListModalStamm = e.target.checked;
    renderShoppingListModalStamm();
  });
  document.getElementById('saveShoppingStammBtn').addEventListener('click', saveShoppingStammModal);
  document.getElementById('cancelShoppingStammBtn').addEventListener('click', closeShoppingStammModal);
  document.getElementById('closeShoppingStammModalBtn').addEventListener('click', closeShoppingStammModal);
  document.getElementById('shoppingStammModal').addEventListener('click', (e) => {
    if (e.target.id === 'shoppingStammModal') closeShoppingStammModal();
  });
  document.getElementById('shoppingStammNewListBtn').addEventListener('click', () => {
    closeShoppingStammModal();
    openShoppingListModal();
    shoppingListModalStamm = true;
    renderShoppingListModalStamm();
  });
  document.getElementById('openShoppingMoveBtn').addEventListener('click', openShoppingMoveModal);
  document.getElementById('closeShoppingMoveModalBtn').addEventListener('click', closeShoppingMoveModal);
  document.getElementById('shoppingMoveModal').addEventListener('click', (e) => {
    if (e.target.id === 'shoppingMoveModal') closeShoppingMoveModal();
  });

  document.getElementById('saveShoppingListBtn').addEventListener('click', saveShoppingListFromModal);
  document.getElementById('cancelShoppingListBtn').addEventListener('click', () => closeShoppingListModal());
  document.getElementById('closeShoppingListModalBtn').addEventListener('click', () => closeShoppingListModal());
  document.getElementById('deleteShoppingListBtn').addEventListener('click', deleteShoppingListFromModal);
  document.getElementById('shoppingListModal').addEventListener('click', (e) => {
    if (e.target.id === 'shoppingListModal') closeShoppingListModal();
  });
  document.getElementById('shoppingListNameInput').addEventListener('input', updateShoppingListModalPreview);
  document.getElementById('shoppingListNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveShoppingListFromModal(); }
    if (e.key === 'Escape') closeShoppingListModal();
  });
  document.getElementById('shoppingListDomainInput').addEventListener('change', updateShoppingListModalPreview);
  document.getElementById('shoppingListDomainInput').addEventListener('blur', updateShoppingListModalPreview);
  document.getElementById('uploadShoppingListLogoBtn').addEventListener('click', () => document.getElementById('shoppingListLogoFile').click());
  document.getElementById('removeShoppingListLogoBtn').addEventListener('click', () => {
    shoppingListModalLogo = '';
    updateShoppingListModalPreview();
  });
  document.getElementById('shoppingListLogoFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      shoppingListModalLogo = await readShoppingLogoFile(file);
      updateShoppingListModalPreview();
    } catch (err) {
      alert(tk('shop.imageLoadFailed'));
    }
    e.target.value = '';
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('einkaufslisten');
