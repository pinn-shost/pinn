/* pinn. – js/vorrat.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/vorrat2.js (js/ausblick.js stays last and
   starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.54.0, only the comments were translated):
   - Pantry (page "Vorrat") – items with stock, unit, minimum stock, category, storage location,
     stores and note; filter, search and grouping; plural forms of units (1 Dose · 2 Dosen)
   - Reconciling the pantry with the shopping lists (low stock appears on the lists, ticking off and
     buying books the quantity back into the pantry)
   - The popups for items and for storage locations & categories, and their click wiring
   35 functions and 13 variables, 20 statements run while this file loads (only click, input and
   key listeners, the unit tables and the popup wiring; no timers and no calls into other files).
   The pantry settings and the lists of categories and locations (pantrySettings, pantryCategories,
   pantryLocations …) stay in the inline script of index.html, which loads before this file.
   index.html only calls the functions of this file later (when the user acts or from bootApp),
   never while it is still loading. */

/* ==========================================================
   Pantry
   ----------------------------------------------------------
   - Items with stock, unit, optional minimum stock, category, storage location, stores, note.
   - Filter by location/category, search, "Knapp" (low stock); display grouped by category, location or A–Z.
   - If the stock falls below the minimum stock, the item automatically appears on every list of the
     chosen stores (without a choice: meal planning) - with the missing quantity. Shopping entries
     from the pantry carry "pantryId" and are marked "🥫 Vorrat" on the list.
   - Ticking an item off on one list removes it from the other lists.
   - When a shopping trip is finished (list or planned shopping), the bought quantity is booked back
     into the pantry - also for self-entered items with the same name.
   - Everything lives in the family record: works offline, identical on all devices.
   ========================================================== */
let pantryGroupMode = 'category';
let pantryFilterLocation = '';
let pantryFilterCategory = '';
let pantryOnlyLow = false;
let pantryOnlyExpiring = false;
let pantrySearch = '';
let pantryEditId = null;
let pantryDraft = null;


/* ---------- Units: singular/plural automatically (1 Dose · 2 Dosen) ----------
   Units are free text. Known package units (German, English, French, Spanish) are shown in
   singular or plural depending on the quantity – no matter whether "Dose", "Dosen" or "Dose(n)"
   was entered. Unknown words stay as they are (German words ending in -e/-ung get the usual
   ending). Weights and measures (g, kg, ml, l, EL …) never change. */
const UNIT_FORMS = [
  ['Stück', 'Stück'], ['Dose', 'Dosen'], ['Packung', 'Packungen'], ['Flasche', 'Flaschen'], ['Kiste', 'Kisten'], ['Rolle', 'Rollen'],
  ['Tube', 'Tuben'], ['Glas', 'Gläser'], ['Tüte', 'Tüten'], ['Tafel', 'Tafeln'], ['Schachtel', 'Schachteln'], ['Beutel', 'Beutel'],
  ['Becher', 'Becher'], ['Spray', 'Sprays'], ['Sprühflasche', 'Sprühflaschen'], ['Paket', 'Pakete'], ['Karton', 'Kartons'],
  ['Sack', 'Säcke'], ['Netz', 'Netze'], ['Bund', 'Bund'], ['Kopf', 'Köpfe'], ['Zehe', 'Zehen'], ['Scheibe', 'Scheiben'],
  ['Stange', 'Stangen'], ['Kanister', 'Kanister'], ['Eimer', 'Eimer'], ['Riegel', 'Riegel'], ['Kapsel', 'Kapseln'],
  ['Tablette', 'Tabletten'], ['Portion', 'Portionen'], ['Pad', 'Pads'], ['Tab', 'Tabs'], ['Kasten', 'Kästen'], ['Box', 'Boxen'],
  ['Topf', 'Töpfe'], ['Schale', 'Schalen'], ['Laib', 'Laibe'], ['Brot', 'Brote'], ['Sixpack', 'Sixpacks'], ['Träger', 'Träger'],
  ['Fläschchen', 'Fläschchen'], ['Päckchen', 'Päckchen'], ['Döschen', 'Döschen'], ['Pck', 'Pck'], ['Pkg', 'Pkg'], ['Fl.', 'Fl.'], ['Stk', 'Stk'], ['Stk.', 'Stk.'],
  ['can', 'cans'], ['tin', 'tins'], ['pack', 'packs'], ['package', 'packages'], ['packet', 'packets'], ['bottle', 'bottles'], ['jar', 'jars'],
  ['box', 'boxes'], ['bag', 'bags'], ['roll', 'rolls'], ['tube', 'tubes'], ['piece', 'pieces'], ['carton', 'cartons'], ['crate', 'crates'],
  ['loaf', 'loaves'], ['bar', 'bars'], ['bunch', 'bunches'], ['head', 'heads'], ['clove', 'cloves'], ['tub', 'tubs'], ['pot', 'pots'],
  ['boîte', 'boîtes'], ['paquet', 'paquets'], ['bouteille', 'bouteilles'], ['rouleau', 'rouleaux'], ['sachet', 'sachets'], ['pièce', 'pièces'],
  ['canette', 'canettes'], ['brique', 'briques'], ['tablette', 'tablettes'], ['barquette', 'barquettes'], ['flacon', 'flacons'],
  ['lata', 'latas'], ['paquete', 'paquetes'], ['botella', 'botellas'], ['bote', 'botes'], ['frasco', 'frascos'], ['rollo', 'rollos'],
  ['bolsa', 'bolsas'], ['caja', 'cajas'], ['tubo', 'tubos'], ['pieza', 'piezas'], ['tarro', 'tarros'], ['barra', 'barras'],
];
const UNIT_MEASURES = new Set(['g', 'gr', 'gramm', 'kg', 'kilo', 'kilogramm', 'mg', 'ml', 'cl', 'dl', 'l', 'lt', 'liter', 'litre', 'litres', 'litro', 'litros',
  'oz', 'lb', 'lbs', 'fl oz', 'pint', 'pints', 'cup', 'cups', 'tasse', 'tasses', 'taza', 'tazas', 'el', 'tl', 'msp', 'prise', 'prisen', 'tbsp', 'tsp', 'pinch',
  'cs', 'cc', 'cda', 'cdta', 'pizca', 'pincée', 'm', 'cm', 'mm', 'meter', 'qm', 'm²', 'kwh', 'wh', '%']);
const UNIT_SG = new Map(), UNIT_PL = new Map();
UNIT_FORMS.forEach(([sg, pl]) => { UNIT_SG.set(sg.toLowerCase(), [sg, pl]); UNIT_PL.set(pl.toLowerCase(), [sg, pl]); });
function unitIsMeasure(unit) { return UNIT_MEASURES.has(String(unit || '').trim().toLowerCase().replace(/\.$/, '')); }
// Same unit regardless of singular/plural ("Dose" = "Dosen" = "Dose(n)")
function unitKey(unit) {
  const u = String(unit || '').trim().replace(/\((?:n|en|e|s|es|er|x)\)$/i, '').trim().toLowerCase();
  const f = UNIT_SG.get(u) || UNIT_PL.get(u);
  return f ? f[0].toLowerCase() : u;
}
function keepCase(src, word) {
  const c = String(src || '').charAt(0);
  return c && c === c.toUpperCase() && c !== c.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word.charAt(0).toLowerCase() + word.slice(1);
}
function unitForCount(unit, n) {
  const raw = String(unit || '').trim();
  if (!raw || unitIsMeasure(raw)) return raw;
  const one = Number(n) === 1;
  const paren = raw.match(/^(.*?)\s*\(([a-zäöüé]{1,3})\)$/i);
  if (paren) {
    const f = UNIT_SG.get(paren[1].trim().toLowerCase());
    if (f) return keepCase(raw, one ? f[0] : f[1]);
    return one ? paren[1].trim() : paren[1].trim() + paren[2];
  }
  const low = raw.toLowerCase();
  const f = UNIT_SG.get(low) || UNIT_PL.get(low);
  if (f) return keepCase(raw, one ? f[0] : f[1]);
  // Unknown German noun: "Pipette" -> "Pipetten", "Füllung" -> "Füllungen"
  if (!one && /^[A-ZÄÖÜ][a-zäöüß]+$/.test(raw)) {
    if (/e$/.test(raw)) return raw + 'n';
    if (/(ung|heit|keit)$/.test(raw)) return raw + 'en';
  }
  return raw;
}
// "2 Dose" -> "2 Dosen" (display only; what was entered stays stored)
function qtyPretty(text) {
  const t = String(text || '').trim();
  if (!t) return { num: '', unit: '', measure: false, full: '' };
  const p = parseShoppingQtyParts(t);
  if (!p || !p.unit) return { num: t, unit: '', measure: false, full: t };
  const unit = unitForCount(p.unit, p.min === p.max ? p.min : 2);
  const num = t.slice(0, t.length - p.unit.length).trim();
  return { num, unit, measure: unitIsMeasure(unit), full: num + ' ' + unit };
}
function fmtQtyUnit(n, unit) { const v = Math.round((Number(n) || 0) * 100) / 100; return fmtPantryNum(v) + (unit ? ' ' + unitForCount(unit, v) : ''); }

function pantryNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}
function fmtPantryNum(n) {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return numDec(String(r));
}
function pantryCategory(id) { return pantryCategories.find(c => c.id === id) || pantryCategories.find(c => c.id === 'sonstiges') || { id: 'sonstiges', label: 'Sonstiges', icon: '📦' }; }
function pantryLocation(id) { return pantryLocations.find(c => c.id === id) || null; }
function pantryIsLow(p) { const min = pantryNum(p.minQty); return min !== null && min > 0 && (pantryNum(p.qty) || 0) < min; }
function pantryStockText(p) { return fmtQtyUnit(pantryNum(p.qty) || 0, p.unit); }
function pantryNameKey(name) { return String(name || '').trim().toLowerCase(); }
function pantryTargetLists(p) {
  const ids = (p.stores || []).filter(id => getShoppingList(id));
  if (ids.length) return ids;
  // Without an own shop: onto the main shop (if one is set), not onto the meal-planning list (since 1.118.2)
  const stamm = shoppingStammladenId();
  if (stamm && getShoppingList(stamm)) return [stamm];
  return [SHOPPING_MEAL_LIST_ID];
}
function pantryNeedText(p) {
  const need = Math.max((pantryNum(p.minQty) || 0) - (pantryNum(p.qty) || 0), 0);
  const amount = need > 0 ? Math.ceil(need * 100) / 100 : 1;
  return fmtQtyUnit(amount, p.unit);
}
// Shopping entry -> pantry item (via pantryId or, for self-entered ones, via the name)
function pantryItemForShopping(it) {
  if (!it) return null;
  if (it.pantryId) { const p = pantryItems.find(x => x.id === it.pantryId); if (p) return p; }
  const key = pantryNameKey(it.name);
  return key ? pantryItems.find(x => pantryNameKey(x.name) === key) || null : null;
}

// Reconcile pantry -> shopping lists (only local changes trigger this)
function syncPantryToShopping() {
  let changed = false;
  let list = shoppingItems.slice();
  pantryItems.forEach(p => {
    const linked = list.filter(it => it.pantryId === p.id);
    if (pantryIsLow(p)) {
      if (linked.some(it => it.done)) return; // already in the shopping cart
      const targets = pantryTargetLists(p);
      const needText = pantryNeedText(p);
      targets.forEach(listId => {
        const onList = linked.find(it => itemListId(it) === listId);
        if (!onList) {
          list.push({ id: 'si' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: p.name, qty: needText, note: '', done: false, createdAt: Date.now(), listId, pantryId: p.id, auto: true });
          changed = true;
        } else if (onList.auto && (onList.qty !== needText || onList.name !== p.name)) {
          list = list.map(x => x.id === onList.id ? { ...x, qty: needText, name: p.name } : x);
          changed = true;
        }
      });
      // Stores deselected: remove automatically created entries there
      const drop = new Set(linked.filter(it => it.auto && !it.done && !targets.includes(itemListId(it))).map(it => it.id));
      if (drop.size) { list = list.filter(x => !drop.has(x.id)); changed = true; }
    } else {
      // enough in stock again: remove automatically created, open entries
      const drop = new Set(linked.filter(it => it.auto && !it.done).map(it => it.id));
      if (drop.size) { list = list.filter(x => !drop.has(x.id)); changed = true; }
    }
  });
  // Detach entries of deleted pantry items (they stay as normal entries)
  list = list.map(it => {
    if (it.pantryId && !pantryItems.some(p => p.id === it.pantryId)) { changed = true; const { pantryId, auto, ...rest } = it; return rest; }
    return it;
  });
  if (changed) shoppingItems = list;
  return changed;
}
// Ticked off on one list -> take the same pantry items off all other lists
function removePantrySiblings(items) {
  const drop = new Set();
  items.forEach(it => {
    if (!it.pantryId) return;
    shoppingItems.forEach(x => { if (x.pantryId === it.pantryId && x.id !== it.id && !x.done) drop.add(x.id); });
  });
  if (drop.size) shoppingItems = shoppingItems.filter(x => !drop.has(x.id));
}
// Book purchased entries back into the pantry. Quantity: number from the quantity field (otherwise 1).
function bookPurchasedIntoPantry(items) {
  const add = new Map();
  items.forEach(it => {
    const p = pantryItemForShopping(it);
    if (!p) return;
    const parts = parseShoppingQtyParts(it.qty || '');
    const amount = parts ? parts.max : 1;
    add.set(p.id, (add.get(p.id) || 0) + (amount > 0 ? amount : 1));
  });
  if (!add.size) return 0;
  pantryItems = pantryItems.map(p => add.has(p.id)
    ? { ...p, qty: Math.round(((pantryNum(p.qty) || 0) + add.get(p.id)) * 100) / 100, updatedAt: Date.now() }
    : p);
  // Siblings on other lists no longer exist afterwards
  const ids = new Set(add.keys());
  const boughtIds = new Set(items.map(it => it.id));
  shoppingItems = shoppingItems.filter(x => !(x.pantryId && ids.has(x.pantryId) && !boughtIds.has(x.id) && x.auto && !x.done));
  if (currentView === 'vorrat') setTimeout(renderPantry, 0);
  return add.size;
}

function pantryCommit() {
  syncPantryToShopping();
  persistState();
  renderPantry();
  if (currentView === 'einkauf') renderShoppingList();
}

/* ---------- Display ---------- */
function renderPantryFilters() {
  const locSel = document.getElementById('pantryLocationFilter');
  const catSel = document.getElementById('pantryCategoryFilter');
  locSel.innerHTML = '<option value="">' + escapeHtml(tk('pantry.allPlaces')) + '</option>' + pantryLocations.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml((l.icon ? l.icon + ' ' : '') + l.label)}</option>`).join('');
  catSel.innerHTML = '<option value="">' + escapeHtml(tk('pantry.allCategories')) + '</option>' + pantryCategories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</option>`).join('');
  if (pantryFilterLocation && !pantryLocation(pantryFilterLocation)) pantryFilterLocation = '';
  if (pantryFilterCategory && !pantryCategories.some(c => c.id === pantryFilterCategory)) pantryFilterCategory = '';
  locSel.value = pantryFilterLocation;
  catSel.value = pantryFilterCategory;
  document.querySelectorAll('.pantry-group-btn').forEach(b => {
    const active = b.dataset.pgroup === pantryGroupMode;
    b.classList.toggle('bg-pine', active);
    b.classList.toggle('text-white', active);
    b.classList.toggle('text-ink/60', !active);
  });
  document.getElementById('pantryLowToggle').classList.toggle('active', pantryOnlyLow);
  document.getElementById('pantryExpToggle').classList.toggle('active', pantryOnlyExpiring);
}

function pantryRowHtml(p) {
  const low = pantryIsLow(p);
  const loc = pantryLocation(p.location);
  const cat = pantryCategory(p.category);
  const onList = shoppingItems.some(it => it.pantryId === p.id && !it.done);
  const inCart = shoppingItems.some(it => it.pantryId === p.id && it.done);
  const min = pantryNum(p.minQty);
  const meta = [];
  if (pantryGroupMode !== 'category') meta.push(`${cat.icon || ''} ${cat.label}`);
  if (pantryGroupMode !== 'location' && loc) meta.push(`${loc.icon || ''} ${loc.label}`);
  if (min !== null && min > 0) meta.push(tk('pantry.minShort', { qty: fmtQtyUnit(min, p.unit) }));
  const expD = pantryExpiryDays(p);
  if (expD !== null && expD > pantrySettings.mhdDays) meta.push(tk('pantry.bestBeforeShort', { date: pantryShortDate(p.bestBefore) }));
  const expPill = pantryExpiryPillHtml(p);
  return `
    <div class="pantry-row flex items-stretch rounded-xl border ${low ? 'border-red-200' : 'border-ink/10'} bg-white overflow-hidden" data-id="${escapeHtml(p.id)}">
      <div class="w-1.5 shrink-0 ${low ? 'pantry-low-bar' : 'bg-transparent'}"></div>
      <button type="button" class="pantry-open flex-1 min-w-0 text-left px-3 py-2.5">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="font-medium text-sm truncate">${escapeHtml(p.name)}</span>
          ${expPill}
          ${onList ? '<span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-pine/10 text-pine whitespace-nowrap">' + escapeHtml(tk('pantry.onList')) + '</span>' : ''}
          ${inCart ? '<span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-pine/10 text-pine whitespace-nowrap">' + escapeHtml(tk('pantry.inCart')) + '</span>' : ''}
        </div>
        ${meta.length || p.note ? `<div class="text-[11px] text-ink/45 truncate mt-0.5">${escapeHtml([...meta, p.note || ''].filter(Boolean).join(' · '))}</div>` : ''}
      </button>
      <div class="flex items-center gap-1 pr-2 shrink-0">
        <button type="button" class="pantry-step pantry-minus w-8 h-8 rounded-full border border-ink/15 text-ink/60 hover:text-pine hover:border-pine grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('shop.oneLess'))}">−</button>
        <span class="min-w-[3.5rem] text-center text-sm font-semibold ${low ? 'text-red-600' : ''}">${escapeHtml(pantryStockText(p))}</span>
        <button type="button" class="pantry-step pantry-plus w-8 h-8 rounded-full border border-ink/15 text-ink/60 hover:text-pine hover:border-pine grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('shop.oneMore'))}">+</button>
      </div>
    </div>`;
}

function renderPantry() {
  const section = document.getElementById('pantrySection');
  if (!section) return;
  renderPantryFilters();
  const listEl = document.getElementById('pantryList');
  const emptyEl = document.getElementById('pantryEmpty');
  const lowInfo = document.getElementById('pantryLowInfo');
  const search = pantryNameKey(pantrySearch);
  const lowAll = pantryItems.filter(pantryIsLow);
  lowInfo.classList.toggle('hidden', !lowAll.length);
  lowInfo.textContent = lowAll.length
    ? tk('pantry.lowInfo', { n: lowAll.length })
    : '';

  const expAll = pantryItems.filter(pantryIsExpiring);
  const expInfo = document.getElementById('pantryExpInfo');
  const expBad = expAll.filter(p => pantryExpiryDays(p) < 0).length;
  const expSoon = expAll.length - expBad;
  expInfo.classList.toggle('hidden', !expAll.length);
  expInfo.classList.toggle('bad', expBad > 0);
  document.getElementById('pantryExpInfoText').textContent = expAll.length
    ? '⏳ ' + [expBad ? tk('pantry.expiredN', { n: expBad }) : '', expSoon ? tk('pantry.expiringN', { n: expSoon }) : ''].filter(Boolean).join(' · ')
    : '';

  const items = pantryItems.filter(p =>
    (!pantryFilterLocation || p.location === pantryFilterLocation) &&
    (!pantryFilterCategory || pantryCategory(p.category).id === pantryFilterCategory) &&
    (!pantryOnlyLow || pantryIsLow(p)) &&
    (!pantryOnlyExpiring || pantryIsExpiring(p)) &&
    (!search || pantryNameKey(p.name).includes(search) || pantryNameKey(p.note).includes(search)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' }));

  if (!items.length) {
    listEl.innerHTML = '';
    emptyEl.textContent = pantryItems.length ? tk('pantry.noneSelected') : tk('pantry.empty');
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  let groups;
  if (pantryGroupMode === 'mhd') {
    const dOf = p => pantryExpiryDays(p);
    const byDate = (a, b) => (dOf(a) ?? 99999) - (dOf(b) ?? 99999) || (a.name || '').localeCompare(b.name || '', 'de', { sensitivity: 'base' });
    groups = [
      { title: tk('pantry.group.expired'), icon: '⚠️', test: d => d !== null && d < 0 },
      { title: tk('pantry.group.todayTomorrow'), icon: '⏳', test: d => d !== null && d >= 0 && d <= 1 },
      { title: tk('pantry.group.next7'), icon: '🗓️', test: d => d !== null && d >= 2 && d <= 7 },
      { title: tk('pantry.group.later'), icon: '✅', test: d => d !== null && d > 7 },
      { title: tk('pantry.group.noBestBefore'), icon: '❔', test: d => d === null },
    ].map(g => ({ title: g.title, icon: g.icon, items: items.filter(p => g.test(dOf(p))).sort(byDate) })).filter(g => g.items.length);
  } else if (pantryGroupMode === 'alpha') {
    const map = new Map();
    items.forEach(p => {
      const letter = (p.name || '#').trim().charAt(0).toUpperCase().replace(/[ÄÖÜ]/, m => ({ 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' })[m]) || '#';
      const key = /[A-Z]/.test(letter) ? letter : '#';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ title: k, icon: '', items: v }));
  } else if (pantryGroupMode === 'location') {
    groups = [...pantryLocations, { id: '', label: tk('pantry.noPlace'), icon: '❔' }]
      .map(l => ({ title: l.label, icon: l.icon, items: items.filter(p => (l.id ? p.location === l.id : !pantryLocation(p.location))) }))
      .filter(g => g.items.length);
  } else {
    groups = pantryCategories
      .map(c => ({ title: c.label, icon: c.icon, items: items.filter(p => pantryCategory(p.category).id === c.id) }))
      .filter(g => g.items.length);
  }

  listEl.innerHTML = groups.map(g => `
    <div>
      <h3 class="text-xs uppercase tracking-wide text-ink/40 mb-2 flex items-center gap-1.5">${g.icon ? `<span class="text-sm">${escapeHtml(g.icon)}</span>` : ''}${escapeHtml(g.title)}<span class="text-ink/30 normal-case tracking-normal">· ${g.items.length}</span></h3>
      <div class="flex flex-col gap-1.5">${g.items.map(pantryRowHtml).join('')}</div>
    </div>`).join('');

  listEl.querySelectorAll('.pantry-row').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('.pantry-open').addEventListener('click', () => openPantryItemModal(id));
    row.querySelector('.pantry-minus').addEventListener('click', () => pantryAdjust(id, -1));
    row.querySelector('.pantry-plus').addEventListener('click', () => pantryAdjust(id, 1));
  });
}

function pantryStepSize(unit) {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'g' || u === 'ml') return 50;
  if (u === 'kg' || u === 'l') return 0.5;
  return 1;
}
function pantryAdjust(id, dir) {
  pantryItems = pantryItems.map(p => {
    if (p.id !== id) return p;
    const next = Math.max(0, Math.round(((pantryNum(p.qty) || 0) + dir * pantryStepSize(p.unit)) * 100) / 100);
    return { ...p, qty: next, bestBefore: next > 0 ? (p.bestBefore || '') : '', updatedAt: Date.now() };
  });
  const p = pantryItems.find(x => x.id === id);
  const wasOn = shoppingItems.some(it => it.pantryId === id && !it.done);
  pantryCommit();
  const isOn = shoppingItems.some(it => it.pantryId === id && !it.done);
  if (p && !wasOn && isOn) finShowToast(tk('pantry.lowToast', { name: p.name }));
}

/* ---------- Popup: item ---------- */
function renderPantryChips(containerId, list, selectedId, onSelect) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = list.map(c => `
    <button type="button" class="pantry-chip px-2.5 py-1.5 rounded-lg border border-ink/15 text-xs text-ink/70 transition ${c.id === selectedId ? 'active' : ''}" data-id="${escapeHtml(c.id)}">${escapeHtml((c.icon ? c.icon + ' ' : '') + c.label)}</button>`).join('');
  wrap.querySelectorAll('.pantry-chip').forEach(b => b.addEventListener('click', () => {
    wrap.querySelectorAll('.pantry-chip').forEach(x => x.classList.toggle('active', x === b));
    onSelect(b.dataset.id);
  }));
}
function renderPantryStorePicker() {
  const wrap = document.getElementById('pantryStorePicker');
  wrap.innerHTML = allShoppingLists().map(list => {
    const active = pantryDraft.stores.includes(list.id);
    return `
      <label class="plan-list-chip relative flex flex-col items-center gap-1 rounded-xl border border-ink/10 px-1.5 py-2.5 text-center cursor-pointer select-none ${active ? 'active' : ''}">
        <input type="checkbox" class="pantry-store-cb" value="${escapeHtml(list.id)}" ${active ? 'checked' : ''} style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;" />
        <span class="plan-check absolute top-1 right-1 w-4 h-4 rounded-full bg-pine text-white grid place-items-center text-[10px] leading-none">✓</span>
        ${shoppingListLogoHtml(list, 30)}
        <span class="text-[11px] leading-tight w-full truncate">${escapeHtml(list.name || '')}</span>
      </label>`;
  }).join('');
  wrap.querySelectorAll('.pantry-store-cb').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) { if (!pantryDraft.stores.includes(cb.value)) pantryDraft.stores.push(cb.value); }
    else pantryDraft.stores = pantryDraft.stores.filter(x => x !== cb.value);
    cb.closest('.plan-list-chip').classList.toggle('active', cb.checked);
  }));
}

function openPantryItemModal(id = null) {
  const p = id ? pantryItems.find(x => x.id === id) : null;
  pantryEditId = p ? p.id : null;
  pantryDraft = {
    category: p ? pantryCategory(p.category).id : (pantryFilterCategory || (pantryCategories[0] && pantryCategories[0].id) || 'sonstiges'),
    location: p ? (p.location || '') : (pantryFilterLocation || ''),
    stores: p ? (p.stores || []).filter(x => getShoppingList(x)) : [],
    barcodes: p && Array.isArray(p.barcodes) ? [...p.barcodes] : [],
  };
  document.getElementById('pantryItemModalTitle').textContent = p ? tk('pantry.item.editTitle') : tk('pantry.item.newTitle');
  document.getElementById('pantryNameInput').value = p ? p.name : '';
  document.getElementById('pantryQtyInput').value = p ? fmtPantryNum(pantryNum(p.qty) || 0) : '1';
  document.getElementById('pantryUnitInput').value = p ? (p.unit || '') : '';
  const min = p ? pantryNum(p.minQty) : null;
  document.getElementById('pantryMinInput').value = min !== null && min > 0 ? fmtPantryNum(min) : '';
  document.getElementById('pantryNoteInput').value = p ? (p.note || '') : '';
  document.getElementById('pantryBestBeforeInput').value = p && pantryIsoValid(p.bestBefore) ? p.bestBefore : '';
  renderPantryBarcodeList();
  document.getElementById('pantryItemError').classList.add('hidden');
  document.getElementById('deletePantryItemBtn').classList.toggle('hidden', !p);
  document.getElementById('savePantryItemBtn').textContent = p ? tk('common.save') : tk('common.create');
  renderPantryChips('pantryCategoryPicker', pantryCategories, pantryDraft.category, v => { pantryDraft.category = v; });
  renderPantryChips('pantryLocationPicker', pantryLocations, pantryDraft.location, v => { pantryDraft.location = v; });
  renderPantryStorePicker();
  document.getElementById('pantryItemModal').classList.remove('hidden');
  if (!p && !isMobile()) setTimeout(() => document.getElementById('pantryNameInput').focus(), 50);
  armModalSnapshot('pantryItemModal');
}
function closePantryItemModal() {
  document.getElementById('pantryItemModal').classList.add('hidden');
  pantryEditId = null;
  pantryDraft = null;
}
function savePantryItemFromModal() {
  const name = document.getElementById('pantryNameInput').value.trim();
  const err = document.getElementById('pantryItemError');
  if (!name) { err.textContent = tk('common.needName'); err.classList.remove('hidden'); return; }
  const dup = pantryItems.find(x => x.id !== pantryEditId && pantryNameKey(x.name) === pantryNameKey(name));
  if (dup) { err.textContent = tk('pantry.duplicate', { name: dup.name }); err.classList.remove('hidden'); return; }
  const qty = Math.max(0, pantryNum(document.getElementById('pantryQtyInput').value) || 0);
  const minRaw = pantryNum(document.getElementById('pantryMinInput').value);
  const data = {
    name,
    qty,
    unit: document.getElementById('pantryUnitInput').value.trim(),
    minQty: minRaw !== null && minRaw > 0 ? minRaw : null,
    category: pantryDraft.category,
    location: pantryDraft.location,
    stores: [...pantryDraft.stores],
    note: document.getElementById('pantryNoteInput').value.trim(),
    bestBefore: '',
    barcodes: [...(pantryDraft.barcodes || [])],
    updatedAt: Date.now(),
  };
  const bb = document.getElementById('pantryBestBeforeInput').value;
  data.bestBefore = qty > 0 && pantryIsoValid(bb) ? bb : '';
  if (pantryEditId) pantryItems = pantryItems.map(x => x.id === pantryEditId ? { ...x, ...data } : x);
  else pantryItems = [...pantryItems, { id: 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data }];
  closePantryItemModal();
  pantryCommit();
  pantryScheduleExpiryCheck();
}
function deletePantryItemFromModal() {
  const p = pantryItems.find(x => x.id === pantryEditId);
  if (!p || !confirm(tk('pantry.confirmDelete', { name: p.name }))) return;
  const id = p.id;
  pantryItems = pantryItems.filter(x => x.id !== id);
  // Automatically created, open entries for it disappear from the lists
  shoppingItems = shoppingItems.filter(it => !(it.pantryId === id && it.auto && !it.done));
  closePantryItemModal();
  pantryCommit();
}

/* ---------- Popup: storage locations & categories ---------- */
let pantrySettingsDraft = null;
function openPantrySettings() {
  pantrySettingsDraft = { locations: pantryLocations.map(x => ({ ...x })), categories: pantryCategories.map(x => ({ ...x })) };
  renderPantrySettingsEditors();
  document.getElementById('pantryMhdDaysSelect').value = String(pantrySettings.mhdDays);
  document.getElementById('pantrySettingsModal').classList.remove('hidden');
  armModalSnapshot('pantrySettingsModal');
}
function closePantrySettings() {
  document.getElementById('pantrySettingsModal').classList.add('hidden');
  pantrySettingsDraft = null;
}
function renderPantrySettingsEditors() {
  [['locations', 'pantryLocationEditor'], ['categories', 'pantryCategoryEditor']].forEach(([key, elId]) => {
    const wrap = document.getElementById(elId);
    wrap.innerHTML = pantrySettingsDraft[key].map((c, i) => `
      <div class="flex items-center gap-2" data-idx="${i}">
        <input type="text" data-field="icon" value="${escapeHtml(c.icon || '')}" maxlength="4" class="w-11 shrink-0 rounded-lg border border-ink/15 px-1 py-1.5 text-center text-lg" aria-label="${escapeHtml(tk('lists.modal.icon'))}" />
        <input type="text" data-field="label" data-i18n-value value="${escapeHtml(c.label || '')}" maxlength="40" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2.5 py-1.5 text-base" aria-label="${escapeHtml(tk('common.name'))}" />
        ${c.id === 'sonstiges' && key === 'categories' ? '<span class="w-8 shrink-0"></span>' : `<button type="button" data-action="delete" class="shrink-0 w-8 h-8 rounded-lg text-ink/40 hover:text-red-500 hover:bg-red-50 grid place-items-center text-lg leading-none" aria-label="${escapeHtml(tk('common.delete'))}">×</button>`}
      </div>`).join('');
    wrap.querySelectorAll('[data-idx]').forEach(row => {
      const i = Number(row.dataset.idx);
      row.querySelectorAll('input[data-field]').forEach(inp => inp.addEventListener('input', () => { pantrySettingsDraft[key][i][inp.dataset.field] = inp.value; }));
      const del = row.querySelector('[data-action="delete"]');
      if (del) del.addEventListener('click', () => {
        const item = pantrySettingsDraft[key][i];
        const field = key === 'locations' ? 'location' : 'category';
        const used = pantryItems.filter(p => p[field] === item.id).length;
        if (used && !confirm(tk(key === 'locations' ? 'pantry.settings.confirmDeletePlace' : 'pantry.settings.confirmDeleteCat', { name: item.label, n: used, other: i18nT(pantryCategory('sonstiges').label) }))) return;
        pantrySettingsDraft[key].splice(i, 1);
        renderPantrySettingsEditors();
      });
    });
  });
}
function savePantrySettings() {
  const clean = arr => arr.map(c => ({ ...c, label: String(c.label || '').trim(), icon: String(c.icon || '').trim() })).filter(c => c.label);
  const locs = clean(pantrySettingsDraft.locations);
  const cats = clean(pantrySettingsDraft.categories);
  if (!cats.some(c => c.id === 'sonstiges')) cats.push({ id: 'sonstiges', label: 'Sonstiges', icon: '📦' });
  pantryLocations = locs;
  pantryCategories = cats;
  const locIds = new Set(locs.map(l => l.id));
  const catIds = new Set(cats.map(c => c.id));
  pantryItems = pantryItems.map(p => ({ ...p, location: locIds.has(p.location) ? p.location : '', category: catIds.has(p.category) ? p.category : 'sonstiges' }));
  pantrySettings = normalizePantrySettings({ ...pantrySettings, mhdDays: document.getElementById('pantryMhdDaysSelect').value });
  closePantrySettings();
  pantryCommit();
  pantryScheduleExpiryCheck();
}

/* ---------- Wiring ---------- */
document.getElementById('openPantryItemBtn').addEventListener('click', () => openPantryItemModal());
document.getElementById('openPantrySettingsBtn').addEventListener('click', openPantrySettings);
document.getElementById('pantrySearchInput').addEventListener('input', (e) => { pantrySearch = e.target.value; renderPantry(); });
document.getElementById('pantryLowToggle').addEventListener('click', () => { pantryOnlyLow = !pantryOnlyLow; renderPantry(); });
document.getElementById('pantryLocationFilter').addEventListener('change', (e) => { pantryFilterLocation = e.target.value; renderPantry(); });
document.getElementById('pantryCategoryFilter').addEventListener('change', (e) => { pantryFilterCategory = e.target.value; renderPantry(); });
document.querySelectorAll('.pantry-group-btn').forEach(b => b.addEventListener('click', () => { pantryGroupMode = b.dataset.pgroup; renderPantry(); }));
document.getElementById('closePantryItemBtn').addEventListener('click', () => attemptCloseModal('pantryItemModal', closePantryItemModal));
document.getElementById('cancelPantryItemBtn').addEventListener('click', () => attemptCloseModal('pantryItemModal', closePantryItemModal));
wireModalOutsideClick('pantryItemModal', closePantryItemModal);
document.getElementById('savePantryItemBtn').addEventListener('click', savePantryItemFromModal);
document.getElementById('deletePantryItemBtn').addEventListener('click', deletePantryItemFromModal);
document.getElementById('pantryNameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); document.getElementById('pantryQtyInput').focus(); } });
document.querySelectorAll('#pantryItemModal [data-step]').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const step = pantryStepSize(document.getElementById('pantryUnitInput').value);
    const cur = pantryNum(input.value) || 0;
    const next = Math.max(0, Math.round((cur + Number(btn.dataset.step) * step) * 100) / 100);
    input.value = (input.id === 'pantryMinInput' && next === 0) ? '' : fmtPantryNum(next);
  });
});
document.getElementById('closePantrySettingsBtn').addEventListener('click', () => attemptCloseModal('pantrySettingsModal', closePantrySettings));
document.getElementById('cancelPantrySettingsBtn').addEventListener('click', () => attemptCloseModal('pantrySettingsModal', closePantrySettings));
wireModalOutsideClick('pantrySettingsModal', closePantrySettings);
document.getElementById('savePantrySettingsBtn').addEventListener('click', savePantrySettings);
document.querySelectorAll('.pantry-add-btn').forEach(btn => btn.addEventListener('click', () => {
  const key = btn.dataset.add;
  pantrySettingsDraft[key].push({ id: (key === 'locations' ? 'loc' : 'cat') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '', icon: key === 'locations' ? '📍' : '🏷️' });
  renderPantrySettingsEditors();
  const inputs = document.querySelectorAll(`#${key === 'locations' ? 'pantryLocationEditor' : 'pantryCategoryEditor'} input[data-field="label"]`);
  const last = inputs[inputs.length - 1];
  if (last) setTimeout(() => last.focus(), 30);
}));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('vorrat');
