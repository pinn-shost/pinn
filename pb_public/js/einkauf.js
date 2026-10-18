/* pinn. – Shopping: data & rules (js/einkauf.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: summing up the ingredients of the planned recipes (computeShoppingList, normalizeForGrouping, breakdown on
   long press), categories on the shopping lists (SHOPPING_CATEGORIES, keyword detection, family order, plus/minus steps),
   the list model (SHOPPING_STORES, allShoppingLists, getShoppingList, current list/plan state), the main shop and its modes,
   special lists for ingredients (e.g. butcher), list logos and adding up quantities when moving list content
   (mergeShoppingQty, moveShoppingListContent). The views are in js/einkaufslisten.js, the input bar in js/einkaufseingabe.js. */

/* ==========================================================
   Shopping: ingredients of the recipes planned in the chosen period, summed up
   ========================================================== */

// Combines all ingredients of the recipes planned in the period [fromISO, toISO]. Lines with
// a recognisable quantity are grouped by their remaining text (unit+name) and the quantities
// added up - if a recipe is planned several times in the period, it counts several times.
// Ingredients without a recognisable quantity (e.g. "Salz") are listed only once, not counted.
// Sub-heading lines (e.g. "Burgersauce:") are not included.
// Important: the serving scaling of a single meal is NOT included (mealPlan stores no
// number of people per date for that) - the base quantities stored in the recipe count.
// Combines singular and plural of the same ingredient when summing ("Zwiebel"/"Zwiebeln") by
// cutting common German plural endings off the GROUPING key (not off the
// display - there the wording found first stays). This is a heuristic, not
// real grammar detection: it covers the common, regular cases (Zwiebel/n, Tomate/n,
// Kartoffel/n, Karotte/n), but does NOT recognise irregular plurals (e.g. Apfel/Äpfel,
// Ei/Eier) - those still stay as two separate lines.
function normalizeForGrouping(text) {
  let n = text.trim().toLowerCase();
  if (n.endsWith('en') && n.length > 5) n = n.slice(0, -2);
  else if (n.endsWith('n') && n.length > 4) n = n.slice(0, -1);
  else if (n.endsWith('e') && n.length > 4) n = n.slice(0, -1);
  return n;
}

// Planned meals with a recipe in the period whose ingredients have NOT yet been transferred
// to another shopping list.
function shoppingRelevantMeals(fromISO, toISO) {
  const transferred = new Set(shoppingTransferred.map(x => String(x.id)));
  return mealPlan.filter(p => p.recipeId && p.date >= fromISO && p.date <= toISO && !transferred.has(String(p.id)));
}
// Planned meals with a recipe in the period whose ingredients have already been transferred.
function shoppingTransferredMealsInRange(fromISO, toISO) {
  const transferred = new Set(shoppingTransferred.map(x => String(x.id)));
  return mealPlan.filter(p => p.recipeId && p.date >= fromISO && p.date <= toISO && transferred.has(String(p.id)));
}

function computeShoppingList(fromISO, toISO) {
  const relevantMeals = shoppingRelevantMeals(fromISO, toISO);

  const grouped = new Map(); // key (lower case) -> { totalMin, totalMax, restText }
  const unquantified = new Map(); // key (lower case) -> original text
  const recipeIdsUsed = new Set();

  // Every planned meal is counted SEPARATELY with its own number of servings (stored when
  // planning) - important when the same recipe is planned several times in the week, but each time for
  // a different number of people (e.g. Monday for 2, Wednesday for 4).
  relevantMeals.forEach(p => {
    const r = recipes.find(x => x.id === p.recipeId);
    if (!r) return;
    recipeIdsUsed.add(r.id);
    const baseServings = r.servings || 2;
    const plannedServings = p.servings || baseServings; // old entries without servings: like the base quantity
    const factor = plannedServings / baseServings;
    (r.ingredients || []).forEach(line => {
      if (isLikelyGroupHeader(line)) return;
      const parsed = parseLeadingQuantity(line);
      if (parsed) {
        const key = normalizeForGrouping(parsed.rest);
        const entry = grouped.get(key) || { totalMin: 0, totalMax: 0, restText: parsed.rest.trim() };
        entry.totalMin += parsed.min * factor;
        entry.totalMax += parsed.max * factor;
        grouped.set(key, entry);
      } else {
        const key = line.trim().toLowerCase();
        if (!unquantified.has(key)) unquantified.set(key, line.trim());
      }
    });
  });

  // hasQuantity items keep min/max separate from the remaining text (unit+name) - for a plain
  // number min===max, with at least one range ingredient in the sum min<max (3 + (1 to 2)
  // = 4-5); displayTextFor() takes care of that when displaying.
  const routeOf = (text) => { const r = shoppingIngredientRuleFor(text); return r ? r.listId : ''; };
  const quantifiedItems = [...grouped.entries()]
    .map(([key, e]) => ({ key: 'q:' + key, hasQuantity: true, minValue: e.totalMin, maxValue: e.totalMax, unitName: e.restText, groupKey: key, sortKey: e.restText.toLowerCase(), route: routeOf(e.restText) }));
  const unquantifiedItems = [...unquantified.entries()]
    .map(([key, text]) => ({ key: 'u:' + key, hasQuantity: false, text, groupKey: text.toLowerCase(), sortKey: text.toLowerCase(), route: routeOf(text) }));
  const items = [...quantifiedItems, ...unquantifiedItems].sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de'));

  return { items, mealCount: relevantMeals.length, recipeCount: recipeIdsUsed.size };
}

// Determines for a single ingredient which planned meals (recipe + quantity) it is made
// up of - for the long-press breakdown in the shopping list.
function computeIngredientBreakdown(item, fromISO, toISO) {
  const relevantMeals = shoppingRelevantMeals(fromISO, toISO);
  const contributions = [];
  relevantMeals.forEach(p => {
    const r = recipes.find(x => x.id === p.recipeId);
    if (!r) return;
    const baseServings = r.servings || 2;
    const plannedServings = p.servings || baseServings;
    const factor = plannedServings / baseServings;
    (r.ingredients || []).forEach(line => {
      if (isLikelyGroupHeader(line)) return;
      if (item.hasQuantity) {
        const parsed = parseLeadingQuantity(line);
        if (parsed && normalizeForGrouping(parsed.rest) === item.groupKey) {
          contributions.push({ recipeTitle: r.title, min: parsed.min * factor, max: parsed.max * factor });
        }
      } else if (!parseLeadingQuantity(line) && line.trim().toLowerCase() === item.groupKey) {
        contributions.push({ recipeTitle: r.title, min: null, max: null });
      }
    });
  });
  return contributions;
}

function truncateTitle(title, maxLen) {
  return title.length > maxLen ? title.slice(0, maxLen - 1) + '…' : title;
}

// Formats a quantity as a single number (min===max) or as a range "4-5" if at least one
// contribution was a range ("1-2 Zwiebeln") - 3 + (1 to 2) then gives 4-5.
function formatQuantityRange(min, max) {
  return min === max ? formatScaledNumber(min) : `${formatScaledNumber(min)}-${formatScaledNumber(max)}`;
}

// Shows the breakdown like a written addition: recipe (shortened) on the left, quantity on the right,
// from the second line on with "+" in front, below it a line and the sum.
// Extracts the bare unit (g, kg, ml, l, Stück ...) from the remaining text of an ingredient
// (e.g. "g Spaghetti" -> "g"), so it can stand next to every single quantity in the breakdown
// without repeating the whole remaining text (incl. the food name). EL/TL no longer occur
// here, because they are already converted to ml when parsed.
function extractUnitFromRest(rest) {
  const m = rest.match(/^(g|kg|ml|l|Stück|Stk|Prise|Pck|Dose|Bund|Zehe|Scheiben?|Stangen?)\b/i);
  return m ? m[1] : '';
}

function showIngredientBreakdown(item, fromISO, toISO) {
  const contributions = computeIngredientBreakdown(item, fromISO, toISO);
  document.getElementById('ingredientBreakdownTitle').textContent = item.hasQuantity ? item.unitName : item.text;
  const rowsEl = document.getElementById('ingredientBreakdownRows');

  if (!contributions.length) {
    rowsEl.innerHTML = '<p class="text-ink/40 italic font-sans">Keine Rezept-Zuordnung gefunden.</p>';
  } else if (!item.hasQuantity) {
    // No numbers to sum up - simply list the recipes the ingredient comes from
    rowsEl.innerHTML = contributions.map(c => `<div class="truncate">${escapeHtml(truncateTitle(c.recipeTitle, 26))}</div>`).join('');
  } else {
    const unit = extractUnitFromRest(item.unitName);
    const unitSuffix = unit ? ' ' + unit : '';
    const sumMin = contributions.reduce((s, c) => s + c.min, 0);
    const sumMax = contributions.reduce((s, c) => s + c.max, 0);
    const rowsHtml = contributions.map((c, i) => `
      <div class="flex items-baseline gap-2">
        <span class="flex-1 min-w-0 truncate">${escapeHtml(truncateTitle(c.recipeTitle, 18))}</span>
        <span class="shrink-0 text-right">${i > 0 ? '+ ' : ''}${formatQuantityRange(c.min, c.max)}${unitSuffix}</span>
      </div>
    `).join('');
    rowsEl.innerHTML = rowsHtml + `
      <div class="flex items-baseline gap-2 border-t border-ink/30 mt-1 pt-1">
        <span class="flex-1 min-w-0"></span>
        <span class="shrink-0 text-right font-bold">${formatQuantityRange(sumMin, sumMax)}${unitSuffix}</span>
      </div>
    `;
  }
  document.getElementById('ingredientBreakdownModal').classList.remove('hidden');
}
function closeIngredientBreakdownModal() {
  document.getElementById('ingredientBreakdownModal').classList.add('hidden');
}
document.getElementById('closeIngredientBreakdownBtn').addEventListener('click', closeIngredientBreakdownModal);
document.getElementById('ingredientBreakdownModal').addEventListener('click', (e) => {
  if (e.target.id === 'ingredientBreakdownModal') closeIngredientBreakdownModal();
});

// Own, simple long-press detection (instead of attachLongPress, which is tailored to calendar
// appointments) - calls any callback instead of always showEventDetail.
function attachIngredientLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0, startY = 0, moved = false;
  const HOLD_MS = 480;
  const TOLERANCE = 12;
  el.addEventListener('pointerdown', (e) => {
    moved = false;
    startX = e.clientX; startY = e.clientY;
    clearTimeout(timer);
    timer = setTimeout(() => { if (!moved) onLongPress(); }, HOLD_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - startX) > TOLERANCE || Math.abs(e.clientY - startY) > TOLERANCE) {
      moved = true;
      clearTimeout(timer);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
    el.addEventListener(type, () => clearTimeout(timer));
  });
}

function initShoppingListDatesIfEmpty() {
  const fromEl = document.getElementById('shoppingListFrom');
  const toEl = document.getElementById('shoppingListTo');
  if (fromEl.value && toEl.value) return;
  const { monday, sunday } = actualCurrentWeekRange();
  fromEl.value = isoDate(monday);
  toEl.value = isoDate(sunday);
}

// Manual adjustments for supplies already at home - only for the current session,
// not saved: { excluded: bool }
let shoppingListAdjustments = new Map();

function getShoppingItemAdjustment(key) {
  return shoppingListAdjustments.get(key) || { excluded: false };
}

function displayTextFor(item) {
  if (!item.hasQuantity) return item.text;
  return `${formatQuantityRange(item.minValue, item.maxValue)} ${item.unitName}`;
}

// Separator on the shopping slip between own entries and recipe ingredients - runs once
// across the whole slip width (excess characters are cut off).
const SHOPPING_SEPARATOR_TEXT = '—————';

function manualItemQtyNote(it) {
  return { qty: (it.qty || '').trim(), note: (it.note || '').trim() };
}

/* ---------- Categories on the shopping lists ----------
   Every item automatically lands in a category (the same categories as in the pantry). It is detected
   by keywords in the name - the longest match wins ("Erdbeerjoghurt" -> Milch, not
   Obst; "Paprikapulver" -> Gewürze). "=wort" only matches as a whole word ("=ei" does not catch "Eier"
   in "Eiernudeln"). A pantry item brings its own category; a category chosen in the item popup
   always takes precedence and is remembered for the next shopping trip. The order
   (e.g. how the shop is laid out) is set by the family under Settings → Shopping. */
const SHOPPING_CATEGORIES = PANTRY_DEFAULT_CATEGORIES;
const SHOPPING_CATEGORY_KEYWORDS = {
  tiefkuehl: ['tiefkühl', 'tk-', 'gefrier', 'tiefgefroren', 'tiefgekühlt', '=tk', '=eis', 'eiscreme', 'speiseeis', 'pommes', 'fischstäbchen', 'rahmspinat', 'kroketten', 'tiefkühlpizza', 'eiswürfel'],
  drogerie: ['shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahncreme', 'zahnbürste', 'zahnseide', 'mundspülung', '=deo', 'deodorant', 'creme', 'bodylotion', 'lotion', 'windel', 'toilettenpapier', 'klopapier', 'taschentücher', 'taschentuch', 'tampon', 'binden', 'slipeinlagen', 'rasier', 'spülung', 'pflaster', 'watte', 'wattepads', 'wattestäbchen', 'sonnencreme', 'haargel', 'haarspray', 'feuchttücher', 'kosmetik', 'make-up', 'nagellack', 'schnuller', 'vitamin', 'tabletten', 'medikament', 'kondome', 'handcreme', 'lippenpflege', 'babypuder', 'ohrstäbchen'],
  haushalt: ['spülmittel', 'waschmittel', 'weichspüler', 'müllbeutel', 'mülltüte', 'mülltüten', 'schwamm', 'schwämme', 'putzmittel', 'reiniger', 'spültabs', 'spülmaschinentabs', 'klarspüler', 'regeneriersalz', 'alufolie', 'frischhaltefolie', 'backpapier', 'küchenrolle', 'küchenpapier', 'batterie', 'glühbirne', 'leuchtmittel', 'kerze', 'teelicht', 'servietten', 'gefrierbeutel', 'entkalker', 'lappen', 'wc-', 'toilettenreiniger', 'essigreiniger', 'allzweck', 'feuerzeug', 'streichhölzer', 'katzenstreu', 'hundefutter', 'katzenfutter', 'tierfutter', 'grillkohle', 'blumenerde'],
  getraenke: ['wasser', 'mineralwasser', 'sprudel', 'saft', '=cola', 'limo', 'limonade', 'bier', '=wein', 'rotwein', 'weißwein', 'rosé', 'sekt', 'prosecco', 'schorle', 'eistee', 'energy', 'smoothie', 'tonic', 'spezi', 'fanta', 'sprite', '=pils', 'radler', 'apfelschorle', 'getränk', 'sirup', '=gin', 'wodka', '=rum', 'likör', 'alkoholfrei', 'malzbier', 'kombucha'],
  konserven: ['dose', 'dosen', 'konserve', 'passierte tomaten', 'gehackte tomaten', 'pizzatomaten', 'tomatenmark', 'kidneybohnen', 'kichererbsen in', 'kokosmilch', 'sardine', 'ölsardinen', 'thunfisch in', 'eingelegt', 'gewürzgurken', 'cornichons', 'oliven', 'kapern', 'sauerkraut', 'rotkohl im glas', 'apfelmus', 'fertigsuppe', 'ravioli', 'mais aus der dose'],
  fleisch_fisch: ['fleisch', 'hack', 'hackfleisch', 'schnitzel', 'steak', 'wurst', 'würstchen', 'wiener', 'schinken', 'salami', 'speck', 'bacon', 'huhn', 'hähnchen', 'hühnchen', 'hühnerbrust', 'pute', 'puten', 'truthahn', 'rind', 'rinder', 'schwein', 'lamm', 'gulasch', 'filet', 'bratwurst', 'lachs', 'thunfisch', 'fisch', 'garnele', 'garnelen', 'shrimps', 'krabben', 'kassler', 'leberkäse', 'fleischkäse', 'frikadelle', 'mett', 'chorizo', 'geflügel', '=ente', 'entenbrust', 'forelle', 'kabeljau', 'seelachs', 'hering', 'muscheln', 'aufschnitt', 'roastbeef', 'kotelett', 'braten', 'rouladen', 'mortadella', 'cevapcici'],
  milch: ['milch', 'joghurt', 'jogurt', 'quark', 'käse', 'sahne', 'schlagsahne', 'butter', '=ei', '=eier', 'schmand', 'crème fraîche', 'creme fraiche', 'saure sahne', 'mozzarella', 'parmesan', 'feta', 'frischkäse', 'hüttenkäse', 'kefir', 'buttermilch', 'margarine', 'skyr', 'gouda', 'emmentaler', 'camembert', 'mascarpone', 'ricotta', 'pudding', 'halloumi', 'schmelzkäse', 'kondensmilch', 'grießbrei', 'milchreis', 'kochsahne', 'ayran'],
  brot: ['brot', 'brötchen', 'semmel', 'toast', 'toastbrot', 'baguette', 'croissant', 'brezel', 'laugen', 'ciabatta', 'wraps', 'tortilla', 'tortillas', 'knäckebrot', 'zwieback', 'fladenbrot', 'kuchen', 'berliner', 'muffin', 'bagel', 'burger buns', 'burgerbrötchen', '=buns', 'pita', 'naan', 'aufbackbrötchen', 'vollkornbrot', 'roggenbrot'],
  backen: ['mehl', 'zucker', 'puderzucker', 'vanillezucker', 'backpulver', 'hefe', 'trockenhefe', 'vanille', 'speisestärke', 'stärke', 'kakaopulver', 'backkakao', 'kuvertüre', 'streusel', 'marzipan', 'gelatine', 'natron', 'backmischung', 'mandeln', 'gemahlene mandeln', 'haselnüsse', 'walnüsse', 'nüsse', 'rosinen', 'kokosraspel', 'zuckerguss', 'tortenguss', 'schokotropfen', 'backaroma', 'paniermehl', 'semmelbrösel'],
  fruehstueck: ['müsli', 'cornflakes', 'haferflocken', 'marmelade', 'konfitüre', 'honig', 'nutella', 'aufstrich', 'brotaufstrich', 'nussnougatcreme', 'erdnussbutter', 'kaffee', 'kaffeebohnen', '=tee', 'früchtetee', 'pfefferminztee', 'kräutertee', 'espresso', 'granola', 'porridge', 'cappuccino', 'kaffeepads', 'kaffeekapseln', 'kapseln', 'kakao', 'trinkschokolade', 'cerealien', 'frühstück'],
  suesses: ['schokolade', 'schoko', 'chips', 'keks', 'kekse', 'butterkeks', 'butterkekse', 'gummibär', 'gummibärchen', 'fruchtgummi', 'süßigkeit', 'süßigkeiten', 'bonbon', 'bonbons', 'popcorn', 'salzstangen', 'cracker', 'riegel', 'müsliriegel', 'praline', 'pralinen', 'lakritz', 'erdnüsse', 'flips', 'waffeln', 'kaugummi', 'nachos', 'studentenfutter', 'snack', 'snacks', 'naschen', 'brownie', 'tortillachips'],
  gewuerze: ['salz', 'pfeffer', 'gewürz', 'paprikapulver', 'paprika edelsüß', 'curry', 'currypulver', 'zimt', 'muskat', 'oregano', '=öl', 'olivenöl', 'rapsöl', 'sonnenblumenöl', 'sesamöl', 'essig', 'balsamico', 'senf', 'ketchup', 'mayo', 'mayonnaise', 'soße', 'sauce', 'brühe', 'gemüsebrühe', 'hühnerbrühe', 'rinderbrühe', 'fond', 'sojasoße', 'sojasauce', 'kräuter der provence', 'getrocknete', 'chiliflocken', 'kreuzkümmel', 'kurkuma', 'lorbeer', 'tabasco', 'pesto', 'würze', 'maggi', 'bratensoße', 'grillsoße', 'dressing', 'remoulade', 'sriracha', 'gewürzmischung', 'knoblauchpulver', 'zwiebelpulver', 'vanilleschote'],
  nudeln_reis: ['nudel', 'nudeln', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'tagliatelle', 'lasagne', 'lasagneplatten', 'pasta', 'makkaroni', 'reis', 'basmati', 'risotto', 'couscous', 'bulgur', 'quinoa', 'linsen', 'kichererbsen', 'gnocchi', 'spätzle', 'tortellini', 'glasnudeln', 'mie-nudeln', 'polenta', 'hirse', 'graupen', 'kartoffelpüree', 'püree'],
  obst_gemuese: ['apfel', 'äpfel', 'birne', 'birnen', 'banane', 'bananen', 'orange', 'orangen', 'zitrone', 'zitronen', 'limette', 'limetten', 'mandarine', 'clementine', 'clementinen', 'trauben', 'weintrauben', 'erdbeer', 'erdbeeren', 'himbeer', 'himbeeren', 'heidelbeer', 'heidelbeeren', 'blaubeer', 'blaubeeren', 'kirsche', 'kirschen', 'pfirsich', 'nektarine', 'melone', 'wassermelone', 'ananas', 'mango', 'kiwi', 'avocado', 'beeren', 'obst', 'pflaume', 'pflaumen', 'aprikose', 'granatapfel', 'feigen', 'tomate', 'tomaten', 'cherrytomaten', 'gurke', 'gurken', 'salatgurke', 'paprika', 'salat', 'eisbergsalat', 'karotte', 'karotten', 'möhre', 'möhren', 'zwiebel', 'zwiebeln', 'rote zwiebeln', 'knoblauch', 'kartoffel', 'kartoffeln', 'süßkartoffel', 'zucchini', 'aubergine', 'brokkoli', 'blumenkohl', 'spinat', 'babyspinat', 'kohl', 'weißkohl', 'rotkohl', 'wirsing', 'lauch', 'porree', 'sellerie', 'staudensellerie', 'pilze', 'champignons', 'champignon', 'radieschen', 'rucola', 'kürbis', 'spargel', 'bohnen', 'grüne bohnen', 'erbsen', 'zuckerschoten', 'mais', 'maiskolben', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum', 'koriander', '=dill', 'minze', 'rosmarin', 'thymian', 'gemüse', 'frühlingszwiebel', 'frühlingszwiebeln', 'lauchzwiebeln', 'fenchel', 'rote bete', 'chili', 'chilischote', 'pak choi', 'mangold', 'rosenkohl', 'kohlrabi', 'schalotte', 'schalotten', 'feldsalat', 'kräuter', 'sprossen', 'rhabarber', 'grapefruit'],
};
// With equally long matches the earlier category in this list wins
const SHOPPING_CATEGORY_PRIORITY = ['tiefkuehl', 'drogerie', 'haushalt', 'getraenke', 'konserven', 'fleisch_fisch', 'milch', 'brot', 'backen', 'fruehstueck', 'suesses', 'gewuerze', 'nudeln_reis', 'obst_gemuese'];
function shoppingCategoryById(id) { return SHOPPING_CATEGORIES.find(c => c.id === id) || null; }
function shoppingAutoCategory(name) {
  const text = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return 'sonstiges';
  const words = new Set(text.split(/[^a-zäöüß0-9]+/).filter(Boolean));
  let best = 'sonstiges', bestLen = 0;
  SHOPPING_CATEGORY_PRIORITY.forEach(cat => {
    (SHOPPING_CATEGORY_KEYWORDS[cat] || []).forEach(kw => {
      const whole = kw.charAt(0) === '=';
      const k = whole ? kw.slice(1) : kw;
      const hit = whole ? words.has(k) : text.includes(k);
      if (hit && k.length > bestLen) { best = cat; bestLen = k.length; }
    });
  });
  return best;
}
// Category of an own entry: chosen by the user > pantry item > detected automatically
function shoppingItemCategory(it) {
  if (it && it.cat && shoppingCategoryById(it.cat)) return it.cat;
  const p = it && it.pantryId && typeof pantryItems !== 'undefined' ? pantryItems.find(x => x.id === it.pantryId) : null;
  if (p && p.category && shoppingCategoryById(p.category)) return p.category;
  return shoppingAutoCategory(it ? it.name : '');
}
// Categories in the family's order (newly added ones at the end, „Sonstiges“ without an own choice last)
function shoppingCategoriesOrdered() {
  const ids = SHOPPING_CATEGORIES.map(c => c.id);
  const order = (shoppingCategoryOrder || []).filter((id, i, arr) => ids.includes(id) && arr.indexOf(id) === i);
  ids.forEach(id => { if (!order.includes(id)) order.push(id); });
  return order.map(shoppingCategoryById);
}

// Plus/minus on a quantity: changes the leading number and keeps the unit
// ("500 g" -> "550 g"). For g/ml in steps of 50, for kg/l in steps of 0.5, otherwise whole
// steps. It cannot go below one step. An empty quantity counts as 1.
function shoppingQtyStepSize(unitText) {
  const unit = String(unitText || '').trim().toLowerCase();
  if (/^(g|gr|gramm|ml)\b/.test(unit)) return 50;
  if (/^(kg|l|liter)\b/.test(unit)) return 0.5;
  return 1;
}
function shoppingStepQtyText(raw, direction) {
  raw = String(raw || '').trim();
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  let value = m ? parseFloat(m[1].replace(',', '.')) : (raw ? 0 : 1);
  const rest = m ? m[2].trim() : raw;
  const step = shoppingQtyStepSize(rest);
  value = direction > 0 ? value + step : Math.max(step, value - step);
  value = Math.round(value * 100) / 100;
  const numText = numDec(String(value));
  return rest ? `${numText} ${rest}` : numText;
}
// Recipe ingredient: display name and quantity - incl. a quantity adjusted with plus/minus
function shoppingRecipeLabelQty(item) {
  if (!item.hasQuantity) return { label: item.text, qtyText: '', unit: '' };
  const unit = extractUnitFromRest(item.unitName);
  const label = unit ? item.unitName.slice(unit.length).trim() : item.unitName;
  const step = shoppingQtyStepSize(unit);
  const delta = Number(getShoppingItemAdjustment(item.key).delta) || 0;
  let min = item.minValue, max = item.maxValue;
  if (delta) {
    const d = Math.max(delta * step, step - min); // not below one step
    min = Math.round((min + d) * 100) / 100;
    max = Math.round((max + d) * 100) / 100;
  }
  return { label, qtyText: formatQuantityRange(min, max) + (unit ? ' ' + unit : ''), unit };
}

/* ---------- Shopping: several lists (one per shop) ----------
   The list "Essensplanung" is built in and cannot be deleted: it contains the ingredients of the recipes
   planned in the chosen period plus own entries. All other lists (Rewe, dm ...) are created
   by the family itself (shoppingLists). Every own entry belongs to exactly one list via "listId"
   - entries without listId (from the time before the lists) belong to the meal planning.
   The content of a list can be moved completely to another list; identical items
   are combined there. When the recipe ingredients of the meal planning are moved, the app remembers
   the affected meals (shoppingTransferred) so they don't show up twice. */
const SHOPPING_MEAL_LIST_ID = 'essensplanung';
const SHOPPING_STORES = [
  { key: 'rewe',      name: 'REWE',          domain: 'rewe.de',          color: '#CC071E' },
  { key: 'edeka',     name: 'EDEKA',         domain: 'edeka.de',         color: '#1A4A9C' },
  { key: 'aldisued',  name: 'ALDI SÜD',      domain: 'aldi-sued.de',     color: '#00005F' },
  { key: 'aldinord',  name: 'ALDI Nord',     domain: 'aldi-nord.de',     color: '#00A5E6' },
  { key: 'lidl',      name: 'Lidl',          domain: 'lidl.de',          color: '#0050AA' },
  { key: 'kaufland',  name: 'Kaufland',      domain: 'kaufland.de',      color: '#E10915' },
  { key: 'netto',     name: 'Netto',         domain: 'netto-online.de',  color: '#E8B800' },
  { key: 'penny',     name: 'PENNY',         domain: 'penny.de',         color: '#CD1414' },
  { key: 'tegut',     name: 'tegut',         domain: 'tegut.com',        color: '#E30613' },
  { key: 'globus',    name: 'Globus',        domain: 'globus.de',        color: '#00843D' },
  { key: 'norma',     name: 'NORMA',         domain: 'norma-online.de',  color: '#D5001C' },
  { key: 'dm',        name: 'dm',            domain: 'dm.de',            color: '#1F3F8A' },
  { key: 'rossmann',  name: 'Rossmann',      domain: 'rossmann.de',      color: '#C3002F' },
  { key: 'mueller',   name: 'Müller',        domain: 'mueller.de',       color: '#F39200' },
  { key: 'metro',     name: 'METRO',         domain: 'metro.de',         color: '#003D7C' },
  { key: 'ikea',      name: 'IKEA',          domain: 'ikea.com',         color: '#0058A3' },
  { key: 'obi',       name: 'OBI',           domain: 'obi.de',           color: '#FF7E21' },
  { key: 'hornbach',  name: 'Hornbach',      domain: 'hornbach.de',      color: '#F7931E' },
  { key: 'bauhaus',   name: 'BAUHAUS',       domain: 'bauhaus.info',     color: '#D6001C' },
  { key: 'apotheke',  name: 'Apotheke',      emoji: '💊',                color: '#D6001C' },
  { key: 'baecker',   name: 'Bäckerei',      emoji: '🥖',                color: '#B9842E' },
  { key: 'metzger',   name: 'Metzgerei',     emoji: '🥩',                color: '#A33B3B' },
  { key: 'markt',     name: 'Wochenmarkt',   emoji: '🧺',                color: '#4E7A3A' },
  { key: 'getraenke', name: 'Getränke',      emoji: '🍺',                color: '#C98A1A' },
  { key: 'eigener',   name: 'Eigener Laden', emoji: '🏪',                color: '#00374A', custom: true },
];
let currentShoppingListId = null; // null = overview with all lists
// Planned shopping trip (task) with several lists: the lists are shown in ONE view,
// each as its own slip marked in the shop colour. Only the task ID is stored -
// which lists belong to it always comes fresh from shoppingPlans (changes apply immediately).
let currentShoppingPlanTaskId = null;
// If a single list was opened from the combined view, "Zurück" leads back there.
let shoppingBackToPlanTaskId = null;

function shoppingCombinedListIds() {
  if (!currentShoppingPlanTaskId) return [];
  const plan = shoppingPlans.find(p => p.id === currentShoppingPlanTaskId);
  return plan ? plan.listIds.filter(id => getShoppingList(id)) : [];
}
// List that new entries from the input bar go to (changeable in the quantity popup).
function activeShoppingListId() {
  return currentShoppingListId || shoppingCombinedListIds()[0] || SHOPPING_MEAL_LIST_ID;
}

function shoppingStoreByKey(key) { return SHOPPING_STORES.find(st => st.key === key) || null; }
function mealShoppingList() { return { id: SHOPPING_MEAL_LIST_ID, name: 'Essensplanung', builtIn: true }; }
// Order as set by drag & drop in the overview. Lists that are not (yet) in
// shoppingListOrder (e.g. just created) come at the end in creation order.
function allShoppingLists() {
  const lists = [mealShoppingList(), ...shoppingLists];
  if (!shoppingListOrder.length) return lists;
  const pos = new Map(shoppingListOrder.map((id, i) => [id, i]));
  return lists
    .map((l, i) => ({ l, key: pos.has(l.id) ? pos.get(l.id) : 100000 + i }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.l);
}
function getShoppingList(id) { return allShoppingLists().find(l => l.id === id) || null; }

/* ---------- Main shop ----------
   One of the own shops can be set as the main shop. Depending on the mode, the recipe ingredients
   of the meal planning then automatically land there: mirrored (on both lists, same checked state)
   or directly (only in the main shop). "Manuell" leaves everything as before - the main shop is only
   preselected when moving. Stored in the family record, so it applies on all devices. */
const SHOPPING_MEAL_MODES = [
  { key: 'manual', icon: '✋', label: 'Manuell',  desc: 'Die Essensplanung bleibt eine eigene Liste. Du verschiebst die Zutaten selbst – der Stammladen ist dabei vorausgewählt.' },
  { key: 'mirror', icon: '🔗', label: 'Spiegeln', desc: 'Die Zutaten stehen automatisch auf beiden Listen. Abhaken auf einer Liste hakt sie auch auf der anderen ab.' },
  { key: 'direct', icon: '➜',  label: 'Direkt',   desc: 'Die Zutaten landen nur noch im Stammladen. Die Essensplanung verschwindet aus der Übersicht, solange sie keine eigenen Einträge hat.' },
];
function normalizeShoppingMealTarget(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  return {
    listId: typeof t.listId === 'string' ? t.listId : '',
    mode: ['manual', 'mirror', 'direct'].includes(t.mode) ? t.mode : 'mirror',
  };
}
function shoppingStammladenId() {
  const id = shoppingMealTarget && shoppingMealTarget.listId;
  return id && shoppingLists.some(l => l.id === id) ? id : '';
}
// 'off' (no main shop) | 'manual' | 'mirror' | 'direct'
function shoppingMealMode() {
  if (!shoppingStammladenId()) return 'off';
  return shoppingMealTarget.mode;
}
function shoppingMealModeInfo(mode) { return SHOPPING_MEAL_MODES.find(m => m.key === mode) || null; }
// Does this list show the recipe ingredients of the meal planning?
function listShowsRecipes(listId) {
  const mode = shoppingMealMode();
  if (listId === SHOPPING_MEAL_LIST_ID) return mode !== 'direct';
  return (mode === 'mirror' || mode === 'direct') && listId === shoppingStammladenId();
}
// In mode "Direkt" the meal planning is hidden as long as it has no own entries.
function shoppingMealListHidden() {
  return shoppingMealMode() === 'direct' && !shoppingItemsOfList(SHOPPING_MEAL_LIST_ID).length;
}
/* ---------- Special lists for ingredients (e.g. butcher) ----------
   A rule sends recipe ingredients whose text contains a keyword (part of a word, so that
   "Rinderhack" matches "hack" too) to a list of its own. Exceptions prevent false matches like
   "Hühnerbrühe" or "Sojahack". The first matching active rule wins. The ingredient is then
   NOT in the main shop, but on the meal planning (with a note) and on the special list - both
   share the checked state as with mirroring. */
const SHOPPING_RULE_PRESETS = {
  metzger: {
    name: 'Fleisch & Wurst', icon: '🥩',
    keywords: ['hack', 'mett', 'rind', 'kalb', 'schwein', 'lamm', 'hähnchen', 'hühnchen', 'huhn', 'hühner', 'pute', 'ente', 'gans', 'speck', 'schinken', 'bacon', 'wurst', 'würst', 'salami', 'chorizo', 'kassler', 'leberkäs', 'frikadell', 'steak', 'schnitzel', 'gulasch', 'geschnetzelt', 'kotelett', 'braten', 'keule', 'haxe', 'lende', 'rouladen'],
    exclude: ['brühe', 'fond', 'bouillon', 'soja', 'vegan', 'vegetar', 'veggie', 'tofu', 'seitan', 'bratensoße', 'bratensauce', 'bratfett', 'bratöl', 'gewürz', 'hühnerei', 'eier', 'studentenfutter'],
  },
};
function splitRuleWords(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(/[,;\n]+/);
  return [...new Set(arr.map(w => String(w || '').trim().toLowerCase()).filter(Boolean))];
}
function normalizeShoppingIngredientRules(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(r => r && r.id).map(r => ({
    id: String(r.id),
    preset: r.preset || '',
    name: String(r.name || 'Sonderliste'),
    icon: String(r.icon || '🏷️'),
    listId: typeof r.listId === 'string' ? r.listId : '',
    keywords: splitRuleWords(r.keywords),
    exclude: splitRuleWords(r.exclude),
    active: r.active !== false,
  }));
}
function shoppingActiveRules() {
  return shoppingIngredientRules.filter(r => r.active && r.listId && shoppingLists.some(l => l.id === r.listId) && r.keywords.length);
}
// Matching rule for an ingredient text (or null)
function shoppingIngredientRuleFor(text) {
  const t = String(text || '').toLowerCase();
  for (const r of shoppingActiveRules()) {
    if (r.exclude.some(w => t.includes(w))) continue;
    if (r.keywords.some(w => t.includes(w))) return r;
  }
  return null;
}
function shoppingRuleListIds() { return new Set(shoppingActiveRules().map(r => r.listId)); }
// Does this list get recipe ingredients at all (completely or as a special list)?
function listHasRecipeItems(listId) {
  return listShowsRecipes(listId) || shoppingRuleListIds().has(listId);
}
// Is a certain recipe ingredient on this list?
function recipeItemVisibleOn(listId, item) {
  if (listId === SHOPPING_MEAL_LIST_ID) return listShowsRecipes(listId);
  if (item.route) return item.route === listId;
  return listShowsRecipes(listId);
}
function recipeItemsForList(listId, items) { return (items || []).filter(i => recipeItemVisibleOn(listId, i)); }
// "Home" of a recipe ingredient if it does not move along when moving
function recipeItemHomeListId(item) {
  if (item.route) return item.route;
  const mode = shoppingMealMode();
  return (mode === 'mirror' || mode === 'direct') ? shoppingStammladenId() : SHOPPING_MEAL_LIST_ID;
}

// Choice of the three modes (in the list popup and in the main-shop popup)
function renderShoppingMealModeOptions(containerId, current, onPick) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = SHOPPING_MEAL_MODES.map(m => {
    const active = m.key === current;
    return `
      <button type="button" class="shopping-meal-mode w-full flex items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition ${active ? 'border-pine bg-pine/10 ring-1 ring-pine' : 'border-ink/10 bg-white hover:border-pine/50'}" data-mode="${m.key}">
        <span class="shrink-0 w-6 text-center text-base leading-6">${m.icon}</span>
        <span class="min-w-0">
          <span class="block text-sm font-medium ${active ? 'text-pine' : ''}">${m.label}</span>
          <span class="block text-[11px] text-ink/50 leading-snug">${m.desc}</span>
        </span>
      </button>`;
  }).join('');
  el.querySelectorAll('.shopping-meal-mode').forEach(btn => {
    btn.addEventListener('click', () => onPick(btn.dataset.mode));
  });
}
// Apply main shop/mode. When switching to "Direkt" the open own entries of the
// meal planning move to the main shop as well; pantry items without their own shop choice follow automatically.
function applyShoppingMealTarget(listId, mode) {
  const before = shoppingMealMode();
  shoppingMealTarget = normalizeShoppingMealTarget({ listId: listId || '', mode: mode || shoppingMealTarget.mode });
  const after = shoppingMealMode();
  if (after === 'direct' && before !== 'direct') {
    moveShoppingListContent(SHOPPING_MEAL_LIST_ID, shoppingStammladenId(), { manualOnly: true, skipPersist: true });
  }
  syncPantryToShopping();
  persistState();
}
// If an entry belongs to a list deleted (e.g. on another device), it lands in the
// meal planning instead of becoming invisible.
function itemListId(it) {
  const id = it && it.listId;
  if (!id || id === SHOPPING_MEAL_LIST_ID) return SHOPPING_MEAL_LIST_ID;
  return shoppingLists.some(l => l.id === id) ? id : SHOPPING_MEAL_LIST_ID;
}
function shoppingItemsOfList(listId) { return shoppingItems.filter(it => itemListId(it) === listId); }

function normalizeShoppingDomain(raw) {
  return String(raw || '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[\/?#].*$/, '').replace(/\s+/g, '');
}
function shoppingDomainFor(list) {
  if (!list) return '';
  if (list.domain) return normalizeShoppingDomain(list.domain);
  const store = shoppingStoreByKey(list.store);
  return store && store.domain ? store.domain : '';
}
function shoppingListColor(list) {
  if (!list || list.id === SHOPPING_MEAL_LIST_ID) return 'var(--c-pine)';
  const store = shoppingStoreByKey(list.store);
  return (store && store.color) || '#00374A';
}
function shoppingListInitials(name) {
  const words = String(name || '?').trim().split(/[\s\-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return letters.toUpperCase();
}

// Logo tile of a list. Order: own uploaded image > logo from the shop's website
// (favicon service) > icon or initials in the shop colour. The fallback icon always sits
// behind it - if the logo does not load (offline, unknown site), it simply stays visible.
function shoppingListLogoHtml(list, size = 44) {
  const radius = Math.round(size * 0.26);
  const box = `position:relative;overflow:hidden;display:grid;place-items:center;flex-shrink:0;width:${size}px;height:${size}px;border-radius:${radius}px;`;
  if (!list || list.id === SHOPPING_MEAL_LIST_ID) {
    return `<div style="${box}background:var(--c-pine);"><span style="font-size:${Math.round(size * 0.5)}px;line-height:1;">🍽️</span></div>`;
  }
  const store = shoppingStoreByKey(list.store);
  const color = shoppingListColor(list);
  const domain = shoppingDomainFor(list);
  const fallback = (store && store.emoji && !domain)
    ? `<div style="${box}background:#fff;border:1px solid rgba(37,35,31,0.1);"><span style="font-size:${Math.round(size * 0.5)}px;line-height:1;">${store.emoji}</span>`
    : `<div style="${box}background:${color};"><span style="color:#fff;font-weight:700;font-family:Inter,system-ui,sans-serif;font-size:${Math.round(size * 0.36)}px;line-height:1;">${escapeHtml(shoppingListInitials(list.name))}</span>`;
  let img = '';
  const imgStyle = `position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#fff;padding:${Math.round(size * 0.1)}px;box-sizing:border-box;`;
  if (list.logo) {
    img = `<img src="${escapeHtml(list.logo)}" alt="" style="${imgStyle}" />`;
  } else if (domain) {
    const url = 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(domain);
    img = `<img src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" style="${imgStyle}" onerror="this.remove()" onload="if(this.naturalWidth&&this.naturalWidth<24)this.remove()" />`;
  }
  return fallback + img + '</div>';
}

function shoppingRangeValues() {
  const from = document.getElementById('shoppingListFrom').value;
  const to = document.getElementById('shoppingListTo').value;
  return { from, to, valid: !!(from && to && from <= to) };
}

// Recipe ingredients of the meal planning as simple entries (name + quantity) - as they appear on the
// slip. Ingredients marked "Hab ich noch zu Hause" are deliberately missing here.
function recipeShoppingEntries(from, to) {
  return computeShoppingList(from, to).items
    .filter(item => !getShoppingItemAdjustment(item.key).excluded)
    .map(item => {
      if (!item.hasQuantity) return { name: item.text.trim(), qty: '', route: item.route || '' };
      const { label, qtyText } = shoppingRecipeLabelQty(item);
      const name = String(label || '').trim() || item.unitName.trim();
      return { name, qty: qtyText, route: item.route || '' };
    });
}

// Everything that is still open (not checked off) on a list.
function collectOpenShoppingEntries(listId) {
  const manual = shoppingItemsOfList(listId).filter(it => !it.done);
  let recipe = [], allRecipe = [], mealIds = [];
  if (listHasRecipeItems(listId)) {
    const { from, to, valid } = shoppingRangeValues();
    if (valid) {
      allRecipe = recipeShoppingEntries(from, to);
      recipe = recipeItemsForList(listId, allRecipe);
      mealIds = shoppingRelevantMeals(from, to).map(p => p.id);
    }
  }
  return { manual, recipe, allRecipe, mealIds };
}

function shoppingListSummary(listId) {
  const { manual, recipe } = collectOpenShoppingEntries(listId);
  const names = [...manual.map(it => it.name || ''), ...recipe.map(r => r.name)].filter(Boolean);
  return { count: names.length, preview: names.slice(0, 4) };
}

/* ---------- Adding up quantities when combining ---------- */
function parseShoppingQtyParts(q) {
  const m = String(q || '').trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(.*)$/);
  if (!m) return null;
  const min = parseFloat(m[1].replace(',', '.'));
  const max = m[2] ? parseFloat(m[2].replace(',', '.')) : min;
  if (isNaN(min) || isNaN(max)) return null;
  return { min, max, unit: m[3].trim() };
}
// "2" + "3" = "5", "500 g" + "1 kg" = "1500 g", "1 Pck" + "2 Pck" = "3 Pck". If the quantities
// don't fit together ("1 Glas" + "200 g"), both stay readable: "1 Glas + 200 g".
function mergeShoppingQty(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a) return b;
  if (!b) return a;
  const pa = parseShoppingQtyParts(a), pb = parseShoppingQtyParts(b);
  if (pa && pb) {
    const ua = pa.unit.toLowerCase(), ub = pb.unit.toLowerCase();
    if (ua === ub || unitKey(ua) === unitKey(ub)) {
      const txt = formatQuantityRange(pa.min + pb.min, pa.max + pb.max);
      return pa.unit ? `${txt} ${pa.unit}` : txt;
    }
    const conv = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], l: ['ml', 1000] };
    if (conv[ua] && conv[ub] && conv[ua][0] === conv[ub][0]) {
      const base = conv[ua][0];
      const min = pa.min * conv[ua][1] + pb.min * conv[ub][1];
      const max = pa.max * conv[ua][1] + pb.max * conv[ub][1];
      return `${formatQuantityRange(min, max)} ${base}`;
    }
  }
  return `${a} + ${b}`;
}
function mergeShoppingNote(a, b) {
  const parts = [a, b].map(x => String(x || '').trim()).filter(Boolean);
  return [...new Set(parts)].join(', ');
}

// Moves all open entries from fromId to toId. If the same item is already open there,
// quantity and note are combined instead of creating a second entry. Checked-off entries
// stay on the source list.
function moveShoppingListContent(fromId, toId, opts = {}) {
  if (!fromId || !toId || fromId === toId || !getShoppingList(toId)) return 0;
  const collected = collectOpenShoppingEntries(fromId);
  // manualOnly: own entries only (automatically created pantry entries are handled by the pantry itself)
  const manual = opts.manualOnly ? collected.manual.filter(it => !it.auto) : collected.manual;
  const allRecipe = opts.manualOnly ? [] : collected.allRecipe;
  const mealIds = opts.manualOnly ? [] : collected.mealIds;
  let list = [...shoppingItems];
  const sameName = (x, name) => normalizeForGrouping(x.name || '') === normalizeForGrouping(name || '');
  const findTarget = (name, exceptId) => list.find(x => x.id !== exceptId && itemListId(x) === toId && !x.done && sameName(x, name));
  let moved = 0;

  manual.forEach(it => {
    const target = findTarget(it.name, it.id);
    if (target) {
      list = list
        .map(x => x.id === target.id ? { ...x, qty: mergeShoppingQty(x.qty, it.qty), note: mergeShoppingNote(x.note, it.note) } : x)
        .filter(x => x.id !== it.id);
    } else {
      list = list.map(x => x.id === it.id ? { ...x, listId: toId } : x);
    }
    moved++;
  });

  // Since the meals then count as "übertragen", ALL of their ingredients have to land somewhere:
  // what was visible on this list -> target list (special-list ingredients from the meal planning
  // go to their special list though, e.g. mince to the butcher); the rest -> its own list.
  allRecipe.forEach(r => {
    const visibleHere = recipeItemVisibleOn(fromId, r);
    const dest = (visibleHere && !(fromId === SHOPPING_MEAL_LIST_ID && r.route)) ? toId : recipeItemHomeListId(r);
    const target = list.find(x => itemListId(x) === dest && !x.done && sameName(x, r.name));
    if (target) {
      list = list.map(x => x.id === target.id ? { ...x, qty: mergeShoppingQty(x.qty, r.qty) } : x);
    } else {
      list.push({ id: 'si' + Date.now() + Math.random().toString(36).slice(2, 8), name: r.name, qty: r.qty, note: '', done: false, createdAt: Date.now(), listId: dest });
    }
    if (dest === toId) moved++;
  });

  shoppingItems = list;
  if (mealIds.length) {
    const known = new Set(shoppingTransferred.map(x => String(x.id)));
    const now = Date.now();
    mealIds.forEach(id => { if (!known.has(String(id))) shoppingTransferred.push({ id, at: now }); });
    // Clean-up: entries for meals that no longer exist are not needed by anyone.
    const existing = new Set(mealPlan.map(p => String(p.id)));
    shoppingTransferred = shoppingTransferred.filter(x => existing.has(String(x.id)));
    shoppingListAdjustments = new Map();
  }
  if (!opts.skipPersist) persistState();
  return moved;
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('einkauf');
