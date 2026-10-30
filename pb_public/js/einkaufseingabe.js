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
      <button type="button" class="shopping-suggestion-remove shrink-0 w-8 h-8 mr-1 rounded-full text-ink/30 hover:text-ink hover:bg-ink/5 grid place-items-center text-base leading-none" data-hid="${escapeHtml(h.id)}" aria-label="${escapeHtml(tk('shop.removeFromSuggestions'))}">×</button>
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
// ("500 g" -> "550 g"); the step follows the size of the amount (shoppingQtyStepSize in js/einkauf.js).
function stepShoppingQty(direction) {
  const input = document.getElementById('shoppingQtyInput');
  input.value = shoppingStepQtyText(input.value, direction);
}

function submitShoppingAddInput() {
  const input = document.getElementById('shoppingAddInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  hideShoppingSuggestions();
  // Several items in one go („Milch, Eier und 2 Brot“): recognise them like a pasted message
  if (shopPasteSplit(name).length >= 2) { openShopPaste(name); return; }
  openShoppingItemModal({ name });
}

/* ---------- Paste a message (e.g. WhatsApp): recognise items and put them on the list (since 1.118.2) ----------
   Pasting a longer text into the input bar (or a text with several items) opens a popup with what was
   recognised: name, quantity and a green note if the item is in the pantry, already on the list or comes
   from the meal planning. Works offline and without AI – simple rules in German, English, French, Spanish,
   Italian and Portuguese: chat prefixes („[29.10., 14:03] Anna:“), polite phrases („Kauf bitte noch …“),
   separators (lines, commas, „und“, bullets) and quantities in front of or behind the name („2x Butter“,
   „Milch 2 l“, „ein Brot“). */
const SHOP_PASTE_NUMWORDS = {
  ein: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12, paar: 2,
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, dozen: 12,
  un: 1, une: 1, deux: 2, trois: 3, uno: 1, una: 1, dos: 2, tres: 3, due: 2, tre: 3, um: 1, uma: 1, dois: 2, duas: 2, três: 3,
};
const SHOP_PASTE_UNITS = 'g|gr|gramm|kg|kilo|mg|ml|cl|l|liter|litre|stk|stück|st|pck|pkg|packung|packungen|packs?|päckchen|dose|dosen|can|cans|flasche|flaschen|bottles?|glas|gläser|becher|bund|bunch|tüte|tüten|beutel|bags?|kiste|kisten|netz|rolle|rollen|tafel|tafeln|scheiben|kopf|köpfe|x';
const SHOP_PASTE_FILLER = [
  /\b(kauf|kaufe|kaufst|besorg|besorge|besorgst|hol|hole|holst|bring|bringe|bringst)\b(\s+(du|mir|uns))?(\s+(bitte|bitte noch|noch|auch|mal))*\b/gi,
  /\b(kannst du|könntest du|wir brauchen|ich brauche|es fehlt|es fehlen|fehlt|fehlen|brauchen noch|wir haben kein(e|en)?)\b/gi,
  /\b(mitbringen|mitnehmen|einkaufen|besorgen|kaufen|holen)\b/gi,
  /\b(mit|ein|mal)\s*$/gi,
  /\b(bitte|noch|auch|danke|dankeschön|lg|liebe grüße|bussi|kuss)\b/gi,
  /\b(please|could you|can you|pick up|get us|grab|buy|we need|we're out of|thanks|thank you)\b/gi,
  /\b(s'il te plaît|stp|peux-tu|achète|achète-moi|merci|il faut|por favor|compra|puedes comprar|gracias|per favore|compra|grazie|por favor|compre|obrigad[oa])\b/gi,
];
function shopPasteLooksLikeList(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\n/.test(t)) return true;
  const parts = t.split(/,|;|\s+und\s+|\s+and\s+|\s+et\s+|\s+y\s+|\s+e\s+/i).filter(x => x.trim());
  return parts.length >= 2 || t.length > 40;
}
function shopPasteSplit(text) {
  let t = String(text || '').replace(/\r/g, '');
  // Chat prefixes of WhatsApp, Signal & co. at the start of a line
  t = t.replace(/^\s*\[?\d{1,2}[./]\d{1,2}[./]?\d{0,4},?\s+\d{1,2}:\d{2}(:\d{2})?\]?\s*(-\s*)?[^:\n]{1,40}:\s*/gm, '');
  const pieces = [];
  t.split(/\n+/).forEach(line => {
    let l = line.replace(/^\s*([-*•·▪►✓☐□+]|\d+[.)])\s*/, '').trim();
    if (!l) return;
    // Lead-ins up to a colon („Einkaufen:“, „Bitte noch mitbringen:“)
    l = l.replace(/^[^:]{0,40}:\s*(?=\S)/, m => (/\d/.test(m) ? m : ''));
    if (/^[^:]{0,40}:$/.test(l)) return; // a lead-in line on its own („Bitte noch mitbringen:“)
    l.split(/\s*[,;]\s*|\s+(?:und|sowie|and|et|y|e)\s+|\s+&\s+/i).forEach(x => { if (x && x.trim()) pieces.push(x.trim()); });
  });
  return pieces;
}
function shopPasteParsePiece(raw) {
  let t = ' ' + String(raw || '') + ' ';
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');
  SHOP_PASTE_FILLER.forEach(re => { t = t.replace(re, ' '); });
  t = t.replace(/[!?.…]+\s*$/g, '').replace(/^[\s,.;:–-]+|[\s,;:–-]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!t || !/[A-Za-zÄÖÜäöüßÀ-ÿ\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/.test(t)) return null;
  let qty = '';
  const U = SHOP_PASTE_UNITS;
  let m = new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*(' + U + ')?\\.?\\s+(.+)$', 'i').exec(t)
       || new RegExp('^(\\d+(?:[.,]\\d+)?)(' + U + ')\\b\\.?\\s*(.+)$', 'i').exec(t);
  if (m) {
    const unit = (m[2] || '').toLowerCase() === 'x' ? '' : (m[2] || '');
    qty = (m[1] + (unit ? ' ' + unit : '')).trim();
    t = m[3];
  } else if ((m = new RegExp('^(.+?)\\s+(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(' + U + ')?\\.?$', 'i').exec(t))) {
    const unit = (m[3] || '').toLowerCase() === 'x' ? '' : (m[3] || '');
    qty = (m[2] + (unit ? ' ' + unit : '')).trim();
    t = m[1];
  } else if ((m = /^(\S+)\s+(.+)$/.exec(t)) && SHOP_PASTE_NUMWORDS[m[1].toLowerCase()] && m[2].length > 1) {
    const n = SHOP_PASTE_NUMWORDS[m[1].toLowerCase()];
    const u = new RegExp('^(' + U + ')\\s+(.+)$', 'i').exec(m[2]);
    qty = u ? n + ' ' + u[1] : (n > 1 ? String(n) : '');
    t = u ? u[2] : m[2];
  }
  t = t.replace(/^(x|stück|stk|of|de|d'|di|da|do)\s+/i, '').replace(/\s+(x)$/i, '').trim();
  if (!t || t.length < 2) return null;
  const name = t.length > 60 ? t.slice(0, 60).trim() : t;
  return { name: name.charAt(0).toUpperCase() + name.slice(1), qty };
}
// Recognised entries with hints (pantry / already on the list / meal planning)
function shopPasteAnalyse(text, listId) {
  const out = [], seen = new Set();
  shopPasteSplit(text).forEach(p => {
    const x = shopPasteParsePiece(p);
    if (!x) return;
    const key = x.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(x);
  });
  let meal = [];
  try {
    const { from, to, valid } = shoppingRangeValues();
    if (valid) meal = recipeShoppingEntries(from, to).map(r => normalizeForGrouping(r.name));
  } catch (e) { meal = []; }
  return out.slice(0, 60).map((x, i) => {
    const pItem = typeof pantryItemForShopping === 'function' ? pantryItemForShopping({ name: x.name }) : null;
    const norm = normalizeForGrouping(x.name);
    const dup = shoppingItemsOfList(listId).find(it => !it.done && (it.name || '').trim().toLowerCase() === x.name.toLowerCase());
    return { id: 'p' + i, name: x.name, qty: x.qty, on: true, pantry: pItem, dup: !!dup, meal: !!norm && meal.some(n => n && (n === norm || n.includes(norm) || norm.includes(n))) };
  });
}
let shopPasteRows = [];
function shopPasteTagsHtml(r) {
  const tags = [];
  if (r.pantry) tags.push('🥫 ' + tk('shop.fromPantry', { stock: pantryStockText(r.pantry) }));
  if (r.meal) tags.push('🍽️ ' + tk('shop.paste.inMealPlan'));
  if (r.dup) tags.push('✓ ' + tk('shop.paste.alreadyOnList'));
  return tags.length ? `<div class="shop-paste-tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : '';
}
function renderShopPaste() {
  const box = document.getElementById('shopPasteList');
  box.innerHTML = shopPasteRows.map(r => `
    <div class="shop-paste-row${r.on ? '' : ' is-off'}" data-pid="${r.id}">
      <input type="checkbox" class="w-5 h-5 shrink-0 mt-2" data-pfield="on" ${r.on ? 'checked' : ''} aria-label="${escapeHtml(r.name)}" />
      <div class="flex-1 min-w-0">
        <div class="flex gap-2">
          <input type="text" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1.5 text-base" data-pfield="name" value="${escapeHtml(r.name)}" autocomplete="off" />
          <input type="text" class="w-24 shrink-0 rounded-lg border border-ink/15 px-2 py-1.5 text-base text-center" data-pfield="qty" value="${escapeHtml(r.qty)}" placeholder="${escapeHtml(tk('shop.entry.quantity'))}" autocomplete="off" />
        </div>
        ${shopPasteTagsHtml(r)}
      </div>
    </div>`).join('') || `<p class="text-sm text-ink/50">${escapeHtml(tk('shop.paste.nothing'))}</p>`;
  const n = shopPasteRows.filter(r => r.on && r.name.trim()).length;
  const btn = document.getElementById('shopPasteAddBtn');
  btn.textContent = tk('shop.paste.addN', { n });
  btn.disabled = !n;
  btn.classList.toggle('opacity-40', !n);
}
function openShopPaste(text) {
  const listId = activeShoppingListId();
  shopPasteRows = shopPasteAnalyse(text, listId);
  const sel = document.getElementById('shopPasteListSelect');
  sel.innerHTML = allShoppingLists().map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name || '')}</option>`).join('');
  sel.value = listId;
  renderShopPaste();
  document.getElementById('shopPasteModal').classList.remove('hidden');
  document.getElementById('shoppingAddInput').blur();
}
function closeShopPaste() {
  document.getElementById('shopPasteModal').classList.add('hidden');
  shopPasteRows = [];
}
function confirmShopPaste() {
  const sel = document.getElementById('shopPasteListSelect').value;
  const listId = getShoppingList(sel) ? sel : activeShoppingListId();
  const now = Date.now();
  let added = 0;
  const fresh = [];
  shopPasteRows.filter(r => r.on && r.name.trim()).forEach((r, i) => {
    const name = r.name.trim().replace(/\s+/g, ' ');
    const qty = r.qty.trim();
    const dup = shoppingItemsOfList(listId).find(it => !it.done && (it.name || '').trim().toLowerCase() === name.toLowerCase());
    const pItem = typeof pantryItemForShopping === 'function' ? pantryItemForShopping({ name }) : null;
    if (dup) {
      shoppingItems = shoppingItems.map(x => x.id === dup.id ? { ...x, qty: qty ? mergeShoppingQty(x.qty, qty) : x.qty } : x);
    } else {
      const hist = shoppingHistory.find(x => x.id === shoppingHistoryKey(name));
      const item = { id: 'si' + (now + i) + Math.random().toString(36).slice(2, 6), name, qty: qty || (hist && hist.lastQty) || '', note: '', cat: (hist && hist.cat) || '', done: false, createdAt: now + i, listId };
      if (pItem) item.pantryId = pItem.id;
      fresh.push(item);
    }
    rememberShoppingInput(name, qty, undefined);
    added++;
  });
  if (!added) return;
  // New entries at the top, in the order of the message
  if (fresh.length) shoppingItems = [...fresh, ...shoppingItems];
  persistState();
  closeShopPaste();
  const input = document.getElementById('shoppingAddInput');
  input.value = '';
  hideShoppingSuggestions();
  renderShoppingList();
  try { if (typeof finShowToast === 'function') finShowToast(tk('shop.paste.added', { n: added })); } catch (e) { /* ignore */ }
}
(function initShopPaste() {
  const input = document.getElementById('shoppingAddInput');
  input.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData) ? (e.clipboardData || window.clipboardData).getData('text') : '';
    if (!shopPasteLooksLikeList(text)) return;
    e.preventDefault();
    openShopPaste(text);
  });
  const box = document.getElementById('shopPasteList');
  const onEdit = (e) => {
    const row = e.target.closest('[data-pid]');
    const f = e.target.dataset.pfield;
    if (!row || !f) return;
    const r = shopPasteRows.find(x => x.id === row.dataset.pid);
    if (!r) return;
    if (f === 'on') { r.on = e.target.checked; row.classList.toggle('is-off', !r.on); }
    else r[f] = e.target.value;
    const n = shopPasteRows.filter(x => x.on && x.name.trim()).length;
    const btn = document.getElementById('shopPasteAddBtn');
    btn.textContent = tk('shop.paste.addN', { n });
    btn.disabled = !n;
    btn.classList.toggle('opacity-40', !n);
  };
  box.addEventListener('input', onEdit);
  box.addEventListener('change', (e) => { if (e.target.dataset.pfield === 'on') onEdit(e); });
  document.getElementById('shopPasteAddBtn').addEventListener('click', confirmShopPaste);
  document.getElementById('shopPasteCancelBtn').addEventListener('click', closeShopPaste);
  document.getElementById('shopPasteCloseBtn').addEventListener('click', closeShopPaste);
  document.getElementById('shopPasteModal').addEventListener('click', (e) => { if (e.target.id === 'shopPasteModal') closeShopPaste(); });
})();

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
