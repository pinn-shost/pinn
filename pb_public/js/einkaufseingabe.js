/* pinn. – Shopping: input bar & export (js/einkaufseingabe.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: own entries via the input bar with suggestions from earlier input, the quantity popup (category, list, plus/minus),
   keeping the input bar and popup above the keyboard on iPhone/iPad (visualViewport), the period buttons, finishing a shopping
   trip and the export text for copying and sharing (copyTextRobust). */

/* ---------- Shopping: own entries (input bar, suggestions, quantity popup) ---------- */

function shoppingHistoryKey(name) {
  return 'h:' + name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Suggestions from earlier input: matches at the start of a word first, then by frequency and
// last use. Items already open on the list are not suggested.
function getShoppingSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const openNames = new Set(shoppingItemsOfList(activeShoppingListId()).filter(it => !it.done).map(it => (it.name || '').trim().toLowerCase()));
  return shoppingHistory
    .filter(h => h && h.name && !openNames.has(h.name.trim().toLowerCase()))
    .map(h => {
      const n = h.name.toLowerCase();
      let rank = -1;
      if (n.startsWith(q)) rank = 0;
      else if (n.split(/[\s\-]+/).some(w => w.startsWith(q))) rank = 1;
      else if (n.includes(q)) rank = 2;
      return { h, rank };
    })
    .filter(x => x.rank >= 0 && x.h.name.toLowerCase() !== q)
    .sort((a, b) => a.rank - b.rank || (b.h.count || 0) - (a.h.count || 0) || (b.h.lastUsed || 0) - (a.h.lastUsed || 0))
    .slice(0, 5)
    .map(x => x.h);
}

function hideShoppingSuggestions() {
  const el = document.getElementById('shoppingSuggestions');
  el.classList.add('hidden');
  el.classList.remove('flex');
  el.innerHTML = '';
}

function renderShoppingSuggestions() {
  const input = document.getElementById('shoppingAddInput');
  const el = document.getElementById('shoppingSuggestions');
  const list = getShoppingSuggestions(input.value);
  if (!list.length) { hideShoppingSuggestions(); return; }
  // flex-col-reverse: the first (best) suggestion is at the very bottom, right above the input field.
  el.innerHTML = list.map(h => `
    <div class="flex items-center gap-1 rounded-xl border border-ink/10 bg-white shadow-md">
      <button type="button" class="shopping-suggestion flex-1 min-w-0 text-left px-3 py-2 text-sm text-ink/80 truncate" data-hid="${escapeHtml(h.id)}">
        ${escapeHtml(h.name)}${h.lastQty ? `<span class="text-ink/40"> · ${escapeHtml(h.lastQty)}</span>` : ''}
      </button>
      <button type="button" class="shopping-suggestion-remove shrink-0 w-8 h-8 mr-1 rounded-full text-ink/30 hover:text-ink hover:bg-ink/5 grid place-items-center text-base leading-none" data-hid="${escapeHtml(h.id)}" aria-label="Aus den Vorschlägen entfernen">×</button>
    </div>
  `).join('');
  el.classList.remove('hidden');
  el.classList.add('flex');
  if (typeof syncShoppingKeyboardLayout === 'function') syncShoppingKeyboardLayout();
  el.querySelectorAll('.shopping-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = shoppingHistory.find(x => x.id === btn.dataset.hid);
      if (!h) return;
      input.value = h.name;
      hideShoppingSuggestions();
      openShoppingItemModal({ name: h.name });
    });
  });
  el.querySelectorAll('.shopping-suggestion-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      shoppingHistory = shoppingHistory.filter(x => x.id !== btn.dataset.hid);
      persistState();
      renderShoppingSuggestions();
      input.focus();
    });
  });
}

// Quantity popup: state of the popup currently open
let shoppingModalEditId = null;

function openShoppingItemModal({ name = '', editId = null } = {}) {
  const modal = document.getElementById('shoppingItemModal');
  const nameInput = document.getElementById('shoppingItemNameInput');
  const qtyInput = document.getElementById('shoppingQtyInput');
  const noteInput = document.getElementById('shoppingNoteInput');
  const titleEl = document.getElementById('shoppingItemModalTitle');
  const hintEl = document.getElementById('shoppingItemModalHint');
  const confirmBtn = document.getElementById('confirmShoppingItemBtn');
  const deleteBtn = document.getElementById('deleteShoppingItemBtn');
  const listSelect = document.getElementById('shoppingItemListSelect');
  const activeListId = activeShoppingListId();

  let existing = editId ? shoppingItems.find(x => x.id === editId) : null;
  // If the same item is already open on this list, that entry is updated instead of added twice.
  let isDuplicate = false;
  if (!existing && name) {
    const dup = shoppingItemsOfList(activeListId).find(x => !x.done && (x.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) { existing = dup; isDuplicate = true; }
  }
  shoppingModalEditId = existing ? existing.id : null;

  if (existing) {
    nameInput.value = existing.name || '';
    qtyInput.value = existing.qty || '';
    noteInput.value = existing.note || '';
  } else {
    const hist = shoppingHistory.find(x => x.id === shoppingHistoryKey(name));
    nameInput.value = hist ? hist.name : name.trim();
    qtyInput.value = (hist && hist.lastQty) || '1';
    noteInput.value = '';
  }

  // Category: detected automatically or chosen by the user (remembered for the next shopping trip)
  const histCat = (() => { const h = shoppingHistory.find(x => x.id === shoppingHistoryKey(nameInput.value)); return h && h.cat && shoppingCategoryById(h.cat) ? h.cat : ''; })();
  const catSel = document.getElementById('shoppingItemCategorySelect');
  catSel.dataset.cat = existing ? (existing.cat && shoppingCategoryById(existing.cat) ? existing.cat : '') : histCat;
  renderShoppingItemCategorySelect();

  // List selectable - this way a single entry can also be moved to another list.
  listSelect.innerHTML = allShoppingLists().map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name || '')}</option>`).join('');
  listSelect.value = existing ? itemListId(existing) : activeListId;

  titleEl.textContent = editId ? tk('lists.item.editTitle') : tk('shop.entry.onList');
  hintEl.classList.toggle('hidden', !isDuplicate);
  confirmBtn.textContent = existing ? tk('common.save') : tk('common.add');
  deleteBtn.classList.toggle('hidden', !editId);

  modal.classList.remove('hidden');
  document.getElementById('shoppingAddInput').blur();
}

// Choice „Automatisch (erkannte Kategorie)“ + all categories in the family's order
function renderShoppingItemCategorySelect() {
  const sel = document.getElementById('shoppingItemCategorySelect');
  if (!sel) return;
  const chosen = sel.dataset.cat || '';
  const it = shoppingModalEditId ? shoppingItems.find(x => x.id === shoppingModalEditId) : null;
  const auto = shoppingItemCategory({ name: document.getElementById('shoppingItemNameInput').value, pantryId: it ? it.pantryId : '' });
  const autoCat = shoppingCategoryById(auto);
  sel.innerHTML = `<option value="">✨ ${escapeHtml(tk('shop.entry.auto'))}${autoCat ? ' · ' + escapeHtml(i18nT(autoCat.label)) : ''}</option>` +
    shoppingCategoriesOrdered().map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + i18nT(c.label))}</option>`).join('');
  sel.value = chosen;
}

function closeShoppingItemModal() {
  document.getElementById('shoppingItemModal').classList.add('hidden');
  shoppingModalEditId = null;
  syncShoppingKeyboardLayout();
}

/* ---------- Keyboard (iPhone/iPad): keep the input bar and quantity popup above the keyboard ----------
   Because #appRoot has a fixed position, iOS pushes nothing up when the keyboard appears - the
   keyboard simply covers the bottom of the screen. The visualViewport API measures the area that is
   actually visible: while the keyboard is open, the input bar (with suggestions) floats
   right above the keyboard, and the quantity popup is centred in the visible area.
   Meanwhile a placeholder keeps the bar's space free so nothing jumps. */
let shoppingBarFloating = false;
function syncShoppingKeyboardLayout() {
  const vv = window.visualViewport;
  const bar = document.getElementById('shoppingAddBar');
  const spacer = document.getElementById('shoppingAddBarSpacer');
  const input = document.getElementById('shoppingAddInput');
  const modal = document.getElementById('shoppingItemModal');
  if (!bar || !spacer || !input) return;

  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const keyboardOpen = !!vv && (layoutHeight - (vv.height + vv.offsetTop) > 80 || layoutHeight - vv.height > 120);
  const visibleBottom = vv ? vv.offsetTop + vv.height : layoutHeight;

  // Input bar
  const barShouldFloat = keyboardOpen && document.activeElement === input && modal.classList.contains('hidden');
  if (barShouldFloat) {
    if (!shoppingBarFloating) {
      const rect = bar.getBoundingClientRect();
      spacer.style.height = rect.height + 'px';
      spacer.classList.remove('hidden');
      bar.style.position = 'fixed';
      bar.style.left = rect.left + 'px';
      bar.style.width = rect.width + 'px';
      bar.style.zIndex = '250';
      bar.style.transform = 'translateY(-100%)';
      bar.style.paddingBottom = '0.5rem'; // The home indicator is behind the keyboard
      shoppingBarFloating = true;
    }
    bar.style.top = visibleBottom + 'px';
  } else if (shoppingBarFloating) {
    ['position', 'left', 'width', 'zIndex', 'transform', 'paddingBottom', 'top'].forEach(k => { bar.style[k] = ''; });
    bar.style.paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)';
    spacer.classList.add('hidden');
    spacer.style.height = '';
    shoppingBarFloating = false;
  }

  // Quantity popup: centre it in the visible area above the keyboard
  if (modal && !modal.classList.contains('hidden') && keyboardOpen && vv) {
    modal.style.top = vv.offsetTop + 'px';
    modal.style.height = vv.height + 'px';
    modal.style.bottom = 'auto';
  } else if (modal) {
    modal.style.top = '';
    modal.style.height = '';
    modal.style.bottom = '';
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncShoppingKeyboardLayout);
  window.visualViewport.addEventListener('scroll', syncShoppingKeyboardLayout);
}
window.addEventListener('resize', syncShoppingKeyboardLayout);
document.getElementById('shoppingItemNameInput').addEventListener('input', renderShoppingItemCategorySelect);
document.getElementById('shoppingItemCategorySelect').addEventListener('change', (e) => { e.target.dataset.cat = e.target.value; });
['shoppingItemNameInput', 'shoppingQtyInput', 'shoppingNoteInput'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('focus', () => [0, 100, 300, 600].forEach(ms => setTimeout(syncShoppingKeyboardLayout, ms)));
  el.addEventListener('blur', () => setTimeout(syncShoppingKeyboardLayout, 150));
});

function rememberShoppingInput(name, qty, cat) {
  const id = shoppingHistoryKey(name);
  const existing = shoppingHistory.find(x => x.id === id);
  const catPart = cat === undefined ? {} : { cat: cat || '' };
  if (existing) {
    shoppingHistory = shoppingHistory.map(x => x.id === id
      ? { ...x, name, count: (x.count || 0) + 1, lastUsed: Date.now(), lastQty: qty, ...catPart }
      : x);
  } else {
    shoppingHistory = [...shoppingHistory, { id, name, count: 1, lastUsed: Date.now(), lastQty: qty, ...catPart }];
  }
  // Limit the history so the family record does not grow needlessly: the entries used least often and
  // not used for the longest time drop out first.
  const MAX_HISTORY = 300;
  if (shoppingHistory.length > MAX_HISTORY) {
    const keep = new Set([...shoppingHistory]
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, MAX_HISTORY)
      .map(x => x.id));
    shoppingHistory = shoppingHistory.filter(x => keep.has(x.id));
  }
}

function confirmShoppingItem() {
  const name = document.getElementById('shoppingItemNameInput').value.trim().replace(/\s+/g, ' ');
  const qty = document.getElementById('shoppingQtyInput').value.trim();
  const note = document.getElementById('shoppingNoteInput').value.trim();
  if (!name) { document.getElementById('shoppingItemNameInput').focus(); return; }
  const selectedListId = document.getElementById('shoppingItemListSelect').value;
  const listId = getShoppingList(selectedListId) ? selectedListId : activeShoppingListId();
  const catVal = document.getElementById('shoppingItemCategorySelect').value;
  const cat = shoppingCategoryById(catVal) ? catVal : '';

  if (shoppingModalEditId) {
    const editId = shoppingModalEditId;
    shoppingItems = shoppingItems.map(x => x.id === editId ? { ...x, name, qty, note, cat, done: false, listId } : x);
  } else {
    // Add new own entries at the top so the last added one is visible right away.
    shoppingItems = [{ id: 'si' + Date.now() + Math.random().toString(36).slice(2, 6), name, qty, note, cat, done: false, createdAt: Date.now(), listId }, ...shoppingItems];
  }
  rememberShoppingInput(name, qty, cat);

  persistState();

  closeShoppingItemModal();
  const input = document.getElementById('shoppingAddInput');
  input.value = '';
  hideShoppingSuggestions();
  renderShoppingList();
}

function deleteShoppingItemFromModal() {
  if (!shoppingModalEditId) return;
  const id = shoppingModalEditId;
  shoppingItems = shoppingItems.filter(x => x.id !== id);
  persistState();
  closeShoppingItemModal();
  renderShoppingList();
}

// Plus/minus changes the leading number in the quantity field and keeps a unit behind it
// ("500 g" -> "550 g"). For g/ml it counts in steps of 50, for kg/l in steps of 0.5,
// otherwise in whole steps. It cannot go below one step.
function stepShoppingQty(direction) {
  const input = document.getElementById('shoppingQtyInput');
  input.value = shoppingStepQtyText(input.value, direction);
}

function submitShoppingAddInput() {
  const input = document.getElementById('shoppingAddInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  hideShoppingSuggestions();
  openShoppingItemModal({ name });
}

(function initShoppingAddBar() {
  const input = document.getElementById('shoppingAddInput');
  input.addEventListener('input', renderShoppingSuggestions);
  input.addEventListener('focus', renderShoppingSuggestions);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitShoppingAddInput(); }
    if (e.key === 'Escape') hideShoppingSuggestions();
  });
  // When leaving the field, hide the suggestions with a slight delay so a tap on a
  // suggestion still arrives first.
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== input) {
        hideShoppingSuggestions();
        syncShoppingKeyboardLayout();
      }
    }, 250);
  });
  input.addEventListener('focus', () => {
    syncShoppingKeyboardLayout();
    // iOS slides the keyboard out with an animation - measure again several times meanwhile
    [100, 300, 600].forEach(ms => setTimeout(syncShoppingKeyboardLayout, ms));
  });
  document.getElementById('shoppingAddBtn').addEventListener('click', submitShoppingAddInput);

  document.getElementById('shoppingQtyMinusBtn').addEventListener('click', () => stepShoppingQty(-1));
  document.getElementById('shoppingQtyPlusBtn').addEventListener('click', () => stepShoppingQty(1));
  document.getElementById('confirmShoppingItemBtn').addEventListener('click', confirmShoppingItem);
  document.getElementById('cancelShoppingItemBtn').addEventListener('click', closeShoppingItemModal);
  document.getElementById('closeShoppingItemModalBtn').addEventListener('click', closeShoppingItemModal);
  document.getElementById('deleteShoppingItemBtn').addEventListener('click', () => {
    if (confirm(tk('shop.entry.confirmDelete'))) deleteShoppingItemFromModal();
  });
  document.getElementById('shoppingItemModal').addEventListener('click', (e) => {
    if (e.target.id === 'shoppingItemModal') closeShoppingItemModal();
  });
  ['shoppingItemNameInput', 'shoppingQtyInput', 'shoppingNoteInput'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); confirmShoppingItem(); }
      if (e.key === 'Escape') closeShoppingItemModal();
    });
  });

  // Instead of simply deleting the checked-off items: finish the shopping trip and book the amount paid
  // (categorised) in finance - or clean up without an amount.
  document.getElementById('clearDoneShoppingItemsBtn').addEventListener('click', () => {
    openShoppingCheckout(currentShoppingListId || SHOPPING_MEAL_LIST_ID);
  });
  // Combined shopping trip: check off the task -> "Einkauf erledigt" (book amounts per shop)
  document.getElementById('finishShoppingPlanBtn').addEventListener('click', () => {
    const task = currentShoppingPlanTaskId ? shoppingPlanTask(currentShoppingPlanTaskId) : null;
    if (!task || task.done) return;
    toggleTaskDone(task).finally(() => { if (currentView === 'einkauf') renderShoppingList(); });
    renderShoppingList();
  });
})();

document.getElementById('shoppingListFrom').addEventListener('change', renderShoppingList);
document.getElementById('shoppingListTo').addEventListener('change', renderShoppingList);
document.getElementById('shoppingListThisWeekBtn').addEventListener('click', () => {
  const { monday, sunday } = actualCurrentWeekRange();
  document.getElementById('shoppingListFrom').value = isoDate(monday);
  document.getElementById('shoppingListTo').value = isoDate(sunday);
  renderShoppingList();
});
document.getElementById('shoppingListNextWeekBtn').addEventListener('click', () => {
  const { monday, sunday } = actualCurrentWeekRange();
  const nextMonday = new Date(monday); nextMonday.setDate(nextMonday.getDate() + 7);
  const nextSunday = new Date(sunday); nextSunday.setDate(nextSunday.getDate() + 7);
  document.getElementById('shoppingListFrom').value = isoDate(nextMonday);
  document.getElementById('shoppingListTo').value = isoDate(nextSunday);
  renderShoppingList();
});

// Builds the export text (for copying/sharing) taking the "Hab ich noch" exclusion
// and pantry exclusions into account - excluded lines don't appear there.
// Own entries are at the top, the recipe ingredients below - separated by the separator line.
// Checked-off own entries don't appear either.
function buildShoppingListText(from, to) {
  // Combined shopping trip: every list with its own heading, separated by blank lines
  if (!currentShoppingListId && currentShoppingPlanTaskId) {
    return shoppingCombinedListIds().map(id => {
      const list = getShoppingList(id);
      const body = buildShoppingListTextFor(id, from, to);
      return '== ' + (list.name || '') + ' ==\n' + (body || '(' + tk('shop.nothingOpen') + ')');
    }).join('\n\n');
  }
  return buildShoppingListTextFor(activeShoppingListId(), from, to);
}
function buildShoppingListTextFor(listId, from, to) {
  const manualLines = shoppingItemsOfList(listId)
    .filter(it => !it.done)
    .map(it => {
      const { qty, note } = manualItemQtyNote(it);
      return '- ' + (qty ? qty + ' ' : '') + it.name + (note ? ' (' + note + ')' : '');
    });
  const recipeLines = (listHasRecipeItems(listId) && from && to && from <= to)
    ? recipeItemsForList(listId, computeShoppingList(from, to).items)
        .filter(item => !getShoppingItemAdjustment(item.key).excluded)
        .map(item => { const lq = shoppingRecipeLabelQty(item); return '- ' + (item.hasQuantity ? lq.qtyText + ' ' + lq.label : item.text); })
    : [];
  const parts = [];
  if (manualLines.length) parts.push(manualLines.join('\n'));
  if (recipeLines.length) parts.push(recipeLines.join('\n'));
  return parts.join('\n' + SHOPPING_SEPARATOR_TEXT + '\n');
}

// The modern clipboard API (navigator.clipboard) needs a secure context (HTTPS) and
// is blocked or missing e.g. when opened via the bare NAS IP over HTTP - therefore
// with a fallback via the older execCommand('copy'), which also works over HTTP.
async function copyTextRobust(text) {
  if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) { /* falls through to the fallback */ }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (e) {
    return false;
  }
}

document.getElementById('copyShoppingListBtn').addEventListener('click', async () => {
  const from = document.getElementById('shoppingListFrom').value;
  const to = document.getElementById('shoppingListTo').value;
  const text = buildShoppingListText(from, to);
  const btn = document.getElementById('copyShoppingListBtn');
  const original = btn.textContent;
  const success = await copyTextRobust(text);
  btn.textContent = success ? tk('shop.copiedCheck') : tk('shop.copyFailed');
  setTimeout(() => { btn.textContent = original; }, success ? 1600 : 3000);
});
if (navigator.share) {
  document.getElementById('shareShoppingListBtn').classList.remove('hidden');
  document.getElementById('shareShoppingListBtn').addEventListener('click', async () => {
    const from = document.getElementById('shoppingListFrom').value;
    const to = document.getElementById('shoppingListTo').value;
    const text = buildShoppingListText(from, to);
    const combined = !currentShoppingListId && currentShoppingPlanTaskId;
    const list = getShoppingList(activeShoppingListId());
    const title = combined
      ? tk('shop.shareTitle') + ' – ' + shoppingCombinedListIds().map(id => getShoppingList(id).name || '').join(', ')
      : tk('shop.shareTitle') + (list ? ' – ' + list.name : '');
    try { await navigator.share({ title, text }); } catch (e) { /* cancelled */ }
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('einkaufseingabe');
