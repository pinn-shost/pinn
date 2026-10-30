/* pinn. – Recipes: list, favourites, public recipes & detail page (js/rezepte.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the recipe list with search and filters, favourites per family, public recipes of all families on the server
   (loading, showing, taking over as an own copy), the favourites bar, the week slider of planned meals with „Gekocht“,
   the recipe detail page and the meal list of the overview (renderOverviewMealList), plus the wiring of the recipe filters.
   Since 1.118.3 deleting asks first and moves the recipe to the recycle bin; a long press on a card of the week slider
   opens the meal actions – both live in js/rezeptaktionen.js. */

function isPlannedThisWeek(recipeId) {
  const { monday, sunday } = actualCurrentWeekRange();
  const from = isoDate(monday), to = isoDate(sunday);
  return mealPlan.some(p => p.recipeId === recipeId && p.date >= from && p.date <= to);
}

// Filters of the recipe list (like in the pantry): search, category and kitchen-appliance dropdown.
// Empty = no restriction.
let recipeFilterCategory = '';
let recipeFilterTool = '';
let recipeSearch = '';
// Fixed filter "Favoriten" (cannot be deleted, not one of the recipe categories)
let recipeFavoritesFilterActive = false;

/* ---------- Favourites (per family) ----------
   Own recipes are remembered by their ID, public recipes of other families by
   'pub:<ID>'. The own recipe shared publicly is the same recipe in both lists. */
const RECIPE_HEART_SVG = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

function recipeFavKey(r) {
  if (!r) return '';
  const p = r.publicEntry;
  if (p) return p.eigene && p.rezeptId ? String(p.rezeptId) : 'pub:' + p.id;
  return String(r.id);
}
function isRecipeFavorite(key) {
  return !!key && recipeFavorites.some(f => f.id === key);
}
function setRecipeFavorite(key, on) {
  if (!key) return;
  const has = isRecipeFavorite(key);
  if (on && !has) recipeFavorites.push({ id: key, at: Date.now() });
  else if (!on && has) recipeFavorites = recipeFavorites.filter(f => f.id !== key);
}
function recipeFavButtonHtml(key, extraClass = '') {
  const fav = isRecipeFavorite(key);
  return `<span role="button" tabindex="0" class="recipe-fav-btn ${extraClass} ${fav ? 'is-fav' : ''}" data-fav-key="${escapeHtml(key)}" aria-pressed="${fav}" aria-label="${escapeHtml(fav ? tk('recipe.unfavourite') : tk('recipe.markFavourite'))}" title="${escapeHtml(fav ? tk('recipe.favourite') : tk('recipe.markFavourite'))}">${RECIPE_HEART_SVG}</span>`;
}
function refreshRecipeFavButtons(key) {
  const fav = isRecipeFavorite(key);
  document.querySelectorAll('.recipe-fav-btn[data-fav-key]').forEach(el => {
    if (el.dataset.favKey !== key) return;
    el.classList.toggle('is-fav', fav);
    el.setAttribute('aria-pressed', String(fav));
    el.setAttribute('aria-label', fav ? tk('recipe.unfavourite') : tk('recipe.markFavourite'));
    el.title = fav ? tk('recipe.favourite') : tk('recipe.markFavourite');
  });
}
function toggleRecipeFavorite(key) {
  if (!key) return;
  setRecipeFavorite(key, !isRecipeFavorite(key));
  persistState();
  refreshRecipeFavButtons(key);
  // With the favourites filter active, a removed recipe disappears from the list right away
  const detail = document.getElementById('recipeDetailView');
  const detailOpen = detail && !detail.classList.contains('hidden');
  if (!detailOpen && (recipeFavoritesFilterActive || currentView === 'uebersicht')) renderRecipesForCurrentView();
  else if (!detailOpen && currentView === 'rezepte') renderRecipeFavSlider();
}
// Wire up the heart buttons in a container (a tap toggles, it does NOT open the recipe)
function wireRecipeFavButtons(container) {
  container.querySelectorAll('.recipe-fav-btn[data-fav-key]:not(.recipe-fav-badge)').forEach(btn => {
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleRecipeFavorite(btn.dataset.favKey); });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleRecipeFavorite(btn.dataset.favKey); }
    });
  });
}

function sortedRecipes(source = recipes) {
  let arr = [...source];
  if (recipeFavoritesFilterActive) arr = arr.filter(r => isRecipeFavorite(recipeFavKey(r)));
  if (recipeFilterCategory) arr = arr.filter(r => (r.categories || []).includes(recipeFilterCategory));
  if (recipeFilterTool) arr = arr.filter(r => (r.tools || []).includes(recipeFilterTool));
  const q = recipeSearch.trim().toLowerCase();
  if (q) arr = arr.filter(r => recipeSearchText(r).includes(q));
  switch (document.getElementById('recipeSort').value) {
    case 'titel': arr.sort((a, b) => a.title.localeCompare(b.title, sysLocale())); break;
    case 'schnellste': arr.sort((a, b) => totalTime(a) - totalTime(b)); break;
    case 'geplant': arr.sort((a, b) => (isPlannedThisWeek(b.id) ? 1 : 0) - (isPlannedThisWeek(a.id) ? 1 : 0) || a.title.localeCompare(b.title, sysLocale())); break;
    default: arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return arr;
}

/* ---------- Public recipes (all families of the server) ----------
   Recipes with the checkbox "Rezept öffentlich teilen" set are mirrored by the server on saving into the
   collection "oeffentliche_rezepte" (pb_hooks/pinn-rezepte.js). Here they are read, shown
   and, on request, taken over as an own copy (incl. a copy of the image). */
let recipeListSource = 'eigene'; // 'eigene' | 'oeffentlich'
let publicRecipes = [];          // [{ id, rezeptId, familie, eigene, updated, data: {...} }]
let publicRecipesLoadedAt = 0;
let publicRecipesLoading = false;
let publicRecipesError = '';
const PUBLIC_RECIPES_MAX_AGE_MS = 60 * 1000;

function setRecipeListSource(source) {
  recipeListSource = source === 'oeffentlich' ? 'oeffentlich' : 'eigene';
  document.querySelectorAll('.recipe-source-btn').forEach(b => b.classList.toggle('active', b.dataset.source === recipeListSource));
  if (recipeListSource === 'oeffentlich') loadPublicRecipes(false);
  renderRecipesForCurrentView();
}
document.querySelectorAll('.recipe-source-btn').forEach(btn => {
  btn.addEventListener('click', () => setRecipeListSource(btn.dataset.source));
});

async function loadPublicRecipes(force) {
  if (publicRecipesLoading) return;
  if (!force && publicRecipesLoadedAt && Date.now() - publicRecipesLoadedAt < PUBLIC_RECIPES_MAX_AGE_MS) return;
  publicRecipesLoading = true;
  publicRecipesError = '';
  try {
    const res = await apiFetch('/api/pinn/rezepte/oeffentlich', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404) {
      publicRecipesError = tk('recipe.pub.noHook');
    } else {
      publicRecipes = Array.isArray(body.rezepte) ? body.rezepte : [];
      if (body.error) publicRecipesError = tk('recipe.pub.loadFailedMsg', { msg: body.error });
    }
    publicRecipesLoadedAt = Date.now();
  } catch (err) {
    publicRecipesError = tk('recipe.pub.offline');
    publicRecipesLoadedAt = Date.now(); // don't retry right away - again on the next opening
  } finally {
    publicRecipesLoading = false;
  }
  const detail = document.getElementById('recipeDetailView');
  if (currentView === 'rezepte' && recipeListSource === 'oeffentlich' && detail && detail.classList.contains('hidden')) {
    renderRecipesForCurrentView();
  } else if (currentView === 'rezepte' && detail && detail.classList.contains('hidden')) {
    renderRecipeFavSlider();
  }
}

// Bring an entry of the public list into the shape of a recipe (for the list and the detail page)
function publicEntryToRecipe(p) {
  const d = (p && p.data) || {};
  return {
    id: 'pub:' + p.id,
    title: d.title || tk('recipe.untitled'),
    ingredients: Array.isArray(d.ingredients) ? d.ingredients : [],
    steps: Array.isArray(d.steps) ? d.steps : [],
    servings: d.servings || 2,
    prepTime: d.prepTime || 0,
    cookTime: d.cookTime || 0,
    categories: Array.isArray(d.categories) ? d.categories : [],
    tools: Array.isArray(d.tools) ? d.tools : [], // names here, not IDs
    image: d.image || null,
    imageFrame: normRecipeImageFrame(d.imageFrame),
    createdAt: d.createdAt || Date.parse(p.updated) || 0,
    publicEntry: p,
  };
}

// Origin text of a public recipe. Recipes of deleted families live in the
// "Rezepte Familie" (with the name of the original family, if known).
function publicRecipeOriginLabel(p) {
  if (!p) return '';
  if (p.verwaist) return tk('recipe.pub.poolFamily') + (p.herkunft ? ' ' + tk('recipe.pub.originally', { name: p.herkunft }) : '');
  return tk('recipe.pub.family', { name: p.familie || '' });
}

function adoptedCopyOf(p) {
  return recipes.find(r => r.quelle && r.quelle.publicId === p.id) || null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error(tk('recipe.imageUnreadable')));
    fr.readAsDataURL(blob);
  });
}

// Take over a public recipe as an own copy. The image is copied along so the copy
// is kept even if the other family changes or deletes its recipe. Kitchen appliances and
// categories are matched to the own ones by name - unknown ones are left out.
async function adoptPublicRecipe(p, btn) {
  const already = adoptedCopyOf(p);
  if (already) return already;
  const d = p.data || {};
  const btnLabel = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = tk('recipe.pub.adopting'); }
  try {
    let image = null;
    let imageRecordId = null;
    if (d.image) {
      try {
        const res = await fetch(d.image, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const up = await uploadRecipeImage(await blobToDataUrl(await res.blob()));
        image = up.path;
        imageRecordId = up.recordId;
      } catch (err) {
        console.warn('Could not copy the image of the public recipe:', err);
      }
    }
    const lower = v => String(v || '').trim().toLowerCase();
    const tools = [];
    (Array.isArray(d.tools) ? d.tools : []).forEach(label => {
      const t = kitchenTools.find(k => lower(k.label) === lower(label));
      if (t && !tools.includes(t.id)) tools.push(t.id);
    });
    const categories = [];
    (Array.isArray(d.categories) ? d.categories : []).forEach(c => {
      const own = recipeCategories.find(x => lower(x) === lower(c));
      if (own && !categories.includes(own)) categories.push(own);
    });
    const copy = {
      id: 'r' + Date.now(),
      title: d.title || tk('recipe.untitled'),
      ingredients: Array.isArray(d.ingredients) ? [...d.ingredients] : [],
      steps: Array.isArray(d.steps) ? [...d.steps] : [],
      servings: d.servings || 2,
      prepTime: d.prepTime || 0,
      cookTime: d.cookTime || 0,
      categories,
      image,
      imageRecordId,
      tools,
      createdAt: Date.now(),
      oeffentlich: false,
      quelle: { publicId: p.id, familie: p.verwaist ? 'Rezepte Familie' : (p.familie || '') },
    };
    const adoptedFrame = image ? normRecipeImageFrame(d.imageFrame) : null;
    if (adoptedFrame) copy.imageFrame = adoptedFrame;
    recipes.unshift(copy);
    // If the public recipe was already a favourite, it stays one as an own copy too
    if (isRecipeFavorite('pub:' + p.id)) setRecipeFavorite(copy.id, true);
    saveRecipes();
    return copy;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btnLabel; }
  }
}

// Search text of a recipe: title, categories and ingredients
function recipeSearchText(r) {
  return [r.title || '', ...(r.categories || []), ...(r.ingredients || []).map(i => typeof i === 'string' ? i : '')].join(' ').toLowerCase();
}
function recipeIsFiltered() {
  return !!(recipeFilterCategory || recipeFilterTool || recipeSearch.trim() || recipeFavoritesFilterActive);
}
function recipeOnlyFavoritesFilter() {
  return recipeFavoritesFilterActive && !recipeFilterCategory && !recipeFilterTool && !recipeSearch.trim();
}
// Fill the filter row of the recipe list (dropdowns in the style of the pantry page)
function renderRecipeFilters() {
  const catSel = document.getElementById('recipeCategoryFilter');
  const toolSel = document.getElementById('recipeToolFilter');
  const cats = activeCategories();
  const tools = kitchenTools.filter(t => t.active !== false);
  if (recipeFilterCategory && !cats.includes(recipeFilterCategory)) recipeFilterCategory = '';
  if (recipeFilterTool && !tools.some(t => t.id === recipeFilterTool)) recipeFilterTool = '';
  catSel.innerHTML = '<option value="">' + escapeHtml(tk('pantry.allCategories')) + '</option>' + cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(i18nT(c))}</option>`).join('');
  toolSel.innerHTML = '<option value="">' + escapeHtml(tk('recipe.allTools')) + '</option>' + tools.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(i18nT(t.label))}</option>`).join('');
  catSel.value = recipeFilterCategory;
  toolSel.value = recipeFilterTool;
  toolSel.classList.toggle('hidden', !tools.length);
  const fav = document.getElementById('recipeFavoritesToggle');
  fav.classList.toggle('active', recipeFavoritesFilterActive);
  fav.setAttribute('aria-pressed', String(recipeFavoritesFilterActive));
  fav.textContent = (recipeFavoritesFilterActive ? '♥' : '♡') + ' ' + tk('recipe.favourites');
  const search = document.getElementById('recipeSearchInput');
  if (document.activeElement !== search && search.value !== recipeSearch) search.value = recipeSearch;
}

function renderRecipesForCurrentView() {
  const titleEl = document.getElementById('recipeSectionTitle');
  closeRecipeDetailPage();
  const sourceToggle = document.getElementById('recipeSourceToggle');
  sourceToggle.classList.toggle('hidden', currentView === 'uebersicht');
  sourceToggle.classList.toggle('flex', currentView !== 'uebersicht');
  document.querySelectorAll('.recipe-source-btn').forEach(b => b.classList.toggle('active', b.dataset.source === recipeListSource));
  document.getElementById('recipeFilterBar').classList.toggle('hidden', currentView === 'uebersicht');
  if (currentView === 'uebersicht') {
    titleEl.textContent = tk('recipe.plannedThisWeek');
    document.getElementById('recipeFavSliderWrap').classList.add('hidden');
    document.getElementById('recipeList').innerHTML = '';
    renderRecipeWeekSlider();
    const noneThisWeek = document.getElementById('recipeWeekSliderWrap').classList.contains('hidden');
    document.getElementById('emptyRecipes').textContent = tk('recipe.nothingThisWeek');
    document.getElementById('emptyRecipes').classList.toggle('hidden', !noneThisWeek);
    document.getElementById('recipeCount').textContent = '';
  } else if (recipeListSource === 'oeffentlich') {
    titleEl.textContent = tk('recipe.publicTitle');
    renderRecipeFilters();
    renderPublicRecipeList();
  } else {
    titleEl.textContent = tk('recipe.title');
    renderRecipeFilters();
    renderFullRecipeList();
  }
  renderRecipeTrashButton(); // only in the recipes tab, own list, with something in the recycle bin
}

// List of the public recipes of all families. Own shared recipes are marked and open
// the own recipe; other families' recipes can be viewed and taken over.
function renderPublicRecipeList() {
  const list = document.getElementById('recipeList');
  const empty = document.getElementById('emptyRecipes');
  const count = document.getElementById('recipeCount');
  document.getElementById('recipeWeekSliderWrap').classList.add('hidden');
  document.getElementById('recipeFavSliderWrap').classList.add('hidden');
  list.innerHTML = '';
  if (!publicRecipesLoadedAt) {
    count.textContent = '';
    empty.textContent = tk('recipe.pub.loading');
    empty.classList.remove('hidden');
    loadPublicRecipes(false);
    return;
  }
  loadPublicRecipes(false); // refresh an outdated list in the background
  const all = publicRecipes.map(publicEntryToRecipe);
  const visible = sortedRecipes(all);
  const isFiltered = recipeIsFiltered();
  count.textContent = visible.length
    ? tk('recipe.pub.count', { n: visible.length }) + (isFiltered ? ' ' + tk('recipe.filteredOf', { total: all.length }) : '')
    : '';
  empty.textContent = publicRecipesError
    || (recipeOnlyFavoritesFilter() ? tk('recipe.pub.noFav')
      : isFiltered ? tk('recipe.pub.noneMatch')
      : tk('recipe.pub.none'));
  empty.classList.toggle('hidden', visible.length > 0 && !publicRecipesError);

  visible.forEach(r => {
    const p = r.publicEntry;
    const copy = p.eigene ? null : adoptedCopyOf(p);
    const card = document.createElement('div');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.className = 'recipe-card w-full text-left rounded-xl border border-ink/10 bg-white overflow-hidden fade-in px-4 py-3 flex items-start gap-3 cursor-pointer';
    const timeLabel = totalTime(r) ? `🕐 ${formatRecipeDuration(totalTime(r))}` : null;
    const sourceBadge = p.eigene
      ? '<span class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pine/10 text-pine">' + escapeHtml(tk('recipe.pub.yours')) + '</span>'
      : `<span class="inline-block mt-1 text-[11px] text-ink/50">${escapeHtml(tk('lists.ofPerson', { name: publicRecipeOriginLabel(p) }))}</span>`;
    let action = '';
    if (!p.eigene) {
      action = copy
        ? '<span class="px-2.5 py-1 rounded-lg text-[11px] text-pine bg-pine/10">' + escapeHtml(tk('recipe.pub.adopted')) + '</span>'
        : '<button type="button" class="adopt-recipe px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-pine hover:border-pine transition">' + escapeHtml(tk('recipe.pub.adopt')) + '</button>';
    }
    card.innerHTML = `
      <div class="recipe-thumb w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-ink/5">${r.image ? `<img src="${recipeImageSrc(r.image, true, r.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt="" onerror="this.remove()"${recipeImgStyleAttr(r)} />` : '<div class="w-full h-full grid place-items-center text-2xl opacity-30">🍽️</div>'}${recipeFavButtonHtml(recipeFavKey(r))}</div>
      <div class="flex-1 min-w-0">
        <div class="font-serif text-base font-bold truncate">${escapeHtml(r.title)}</div>
        <div class="text-xs text-ink/40 mt-0.5">${escapeHtml(timeLabel || tk('recipe.ingredientsN', { n: r.ingredients.length }) + ' · ' + tk('recipe.stepsN', { n: r.steps.length }))}</div>
        ${sourceBadge}
        ${action ? `<div class="flex items-center gap-1.5 mt-2 flex-wrap">${action}</div>` : ''}
      </div>
    `;
    const open = () => {
      if (p.eigene) {
        const own = recipes.find(x => x.id === p.rezeptId);
        if (own) { openRecipeDetailPage(own.id); return; }
      }
      openRecipeDetailPage(null, p);
    };
    card.addEventListener('click', (e) => {
      if (e.target.closest('.adopt-recipe') || e.target.closest('.recipe-fav-btn')) return;
      open();
    });
    wireRecipeFavButtons(card);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('.recipe-fav-btn')) open(); });
    const adoptBtn = card.querySelector('.adopt-recipe');
    if (adoptBtn) adoptBtn.addEventListener('click', async () => {
      await adoptPublicRecipe(p, adoptBtn);
      renderRecipesForCurrentView();
    });
    list.appendChild(card);
  });
}

function renderFullRecipeList() {
  const list = document.getElementById('recipeList');
  const empty = document.getElementById('emptyRecipes');
  const count = document.getElementById('recipeCount');
  const visible = sortedRecipes();
  const isFiltered = recipeIsFiltered();
  count.textContent = visible.length
    ? tk('recipe.count', { n: visible.length }) + (isFiltered ? ' ' + tk('recipe.filteredOf', { total: recipes.length }) : '')
    : '';
  empty.textContent = !recipes.length ? tk('recipe.empty')
    : recipeOnlyFavoritesFilter() ? tk('recipe.noFav')
    : isFiltered ? tk('recipe.noneMatch') : tk('recipe.empty');
  list.innerHTML = '';
  empty.classList.toggle('hidden', visible.length > 0);

  visible.forEach(r => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'recipe-card w-full text-left rounded-xl border border-ink/10 bg-white overflow-hidden fade-in px-4 py-3 flex items-start gap-3';
    const timeLabel = totalTime(r) ? `🕐 ${formatRecipeDuration(totalTime(r))}` : null;
    const plannedBadge = (isPlannedThisWeek(r.id) ? '<span class="inline-block mt-1 mr-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-mustard-50 text-mustard border border-mustard/30">' + escapeHtml(tk('recipe.plannedThisWeek')) + '</span>' : '')
      + (r.oeffentlich ? '<span class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pine/10 text-pine">' + escapeHtml(tk('recipe.public')) + '</span>' : '');
    card.innerHTML = `
      <div class="recipe-thumb w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-ink/5">${r.image ? `<img src="${recipeImageSrc(r.image, true, r.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(r)} />` : '<div class="w-full h-full grid place-items-center text-2xl opacity-30">🍽️</div>'}${recipeFavButtonHtml(recipeFavKey(r))}</div>
      <div class="flex-1 min-w-0">
        <div class="font-serif text-base font-bold truncate">${escapeHtml(r.title)}</div>
        <div class="text-xs text-ink/40 mt-0.5">${escapeHtml(timeLabel || tk('recipe.ingredientsN', { n: r.ingredients.length }) + ' · ' + tk('recipe.stepsN', { n: r.steps.length }))}</div>
        ${plannedBadge}
        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
          <button class="plan-recipe px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-mustard hover:border-mustard transition" data-id="${r.id}" title="${escapeHtml(tk('recipe.planForDay'))}">${escapeHtml(tk('recipe.planShort'))}</button>
          <button class="edit-recipe px-2.5 py-1 rounded-lg border border-ink/15 text-[11px] text-ink/60 hover:text-pine hover:border-pine transition" data-id="${r.id}" title="${hasUnquantifiedIngredients(r.ingredients) ? escapeHtml(tk('recipe.hasUnquantified')) : ''}">${hasUnquantifiedIngredients(r.ingredients) ? '⚠️ ' : ''}${escapeHtml(tk('common.edit'))}</button>
        </div>
      </div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.edit-recipe') || e.target.closest('.plan-recipe') || e.target.closest('.recipe-fav-btn')) return;
      openRecipeDetailPage(r.id);
    });
    wireRecipeFavButtons(card);
    card.querySelector('.plan-recipe').addEventListener('click', () => openMealModal(isoDate(new Date()), 'mittag', r.id));
    card.querySelector('.edit-recipe').addEventListener('click', () => openRecipeModal(r.id));
    list.appendChild(card);
  });

  // When searching or filtering only the result list counts - "Diese Woche geplant" and the
  // favourites bar are left out then.
  renderRecipeWeekSlider();
  renderRecipeFavSlider();
}

// Swipeable favourites bar below "Diese Woche geplant" (only recipes tab, own list,
// without an active search/filter). Most recently marked favourites first. Public recipes of other
// families appear as soon as the public list is loaded.
function renderRecipeFavSlider() {
  const wrap = document.getElementById('recipeFavSliderWrap');
  const slider = document.getElementById('recipeFavSlider');
  if (currentView !== 'rezepte' || recipeListSource !== 'eigene' || recipeIsFiltered()) {
    wrap.classList.add('hidden');
    return;
  }
  const favs = [...recipeFavorites].sort((a, b) => (b.at || 0) - (a.at || 0));
  if (favs.some(f => String(f.id).startsWith('pub:')) && !publicRecipesLoadedAt) loadPublicRecipes(false);
  const items = [];
  favs.forEach(f => {
    const key = String(f.id);
    if (key.startsWith('pub:')) {
      const p = publicRecipes.find(x => 'pub:' + x.id === key);
      if (p) items.push({ recipe: publicEntryToRecipe(p), publicEntry: p, key });
    } else {
      const r = recipes.find(x => String(x.id) === key);
      if (r) items.push({ recipe: r, publicEntry: null, key });
    }
  });
  if (!items.length) {
    wrap.classList.add('hidden');
    slider.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  const edgeSpacer = `<div class="shrink-0" style="width:${WEEK_SLIDER_PEEK_PX}px" aria-hidden="true"></div>`;
  slider.innerHTML = edgeSpacer + items.map((it, i) => {
    const r = it.recipe;
    const time = totalTime(r) ? `🕐 ${formatRecipeDuration(totalTime(r))}` : tk('recipe.ingredientsN', { n: r.ingredients.length });
    return `
      <button type="button" class="fav-slider-card shrink-0 w-32 text-left rounded-xl border border-ink/10 bg-white p-2 fade-in" data-index="${i}" style="scroll-snap-align: start;">
        <div class="recipe-thumb w-full aspect-square rounded-lg overflow-hidden bg-ink/5">${recipeFavButtonHtml(it.key, 'recipe-fav-badge')}${r.image ? `<img src="${recipeImageSrc(r.image, true, r.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt="" onerror="this.remove()"${recipeImgStyleAttr(r)} />` : '<div class="w-full h-full grid place-items-center text-2xl opacity-30">🍽️</div>'}</div>
        <div class="font-serif text-sm font-bold mt-1.5 line-clamp-2 leading-tight min-h-[2.25rem]">${escapeHtml(r.title)}</div>
        <div class="text-[11px] text-ink/40 mt-0.5 min-h-[1rem]">${time}</div>
      </button>
    `;
  }).join('') + edgeSpacer;
  slider.querySelectorAll('.fav-slider-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = items[Number(btn.dataset.index)];
      if (!it) return;
      if (it.publicEntry) openRecipeDetailPage(null, it.publicEntry);
      else openRecipeDetailPage(it.recipe.id);
    });
  });
}

// Horizontally swipeable strip of the recipes planned this week above the actual list:
// image as eye-catcher, title in bold below, below that the time with a clock icon in smaller type.
// Week slider from the mealPlan entries of this week (Mon-Sun), in weekday order. On opening it
// automatically jumps so far that today's entry is the first one visible - past
// days slide away to the left ("already eaten, no longer important"), but stay reachable by swiping
// back. Used both in the overview and in the recipes tab.
// true = reposition on the next rendering of the slider (re-armed when entering
// overview/recipes in setView(), see there)
let weekSliderNeedsAutoScroll = true;
// Remembers which reference day it was last positioned to - if that changes (because the
// calendar shows another day), it is repositioned automatically; if it stays the same,
// a position moved manually by swiping in the slider is NOT reset.
let weekSliderLastPositionedDate = null;
const WEEK_SLIDER_PEEK_PX = 28; // how far the card left of the target should still peek in

/* ---------- "Gekocht" in the week slider ----------
   Only for planned meals: a tap asks whether it has been cooked already. Then the
   mealPlan entry gets cooked/cookedAt and disappears from the slider - it stays in the calendar.
   If the meal is moved later, it counts as not cooked again. */
const MEAL_COOKED_SVG = '<svg viewBox="0 0 24 24" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
function mealCookedButtonHtml(mealId) {
  return `<span role="button" tabindex="0" class="meal-cooked-btn" data-meal-id="${escapeHtml(String(mealId))}" aria-label="${escapeHtml(tk('meal.markCooked'))}" title="${escapeHtml(tk('meal.cookedQ'))}">${MEAL_COOKED_SVG}</span>`;
}
function markMealCooked(mealId, btnEl) {
  const entry = mealPlan.find(p => String(p.id) === String(mealId));
  if (!entry) return;
  const recipe = entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : null;
  const title = recipe ? recipe.title : (entry.title || tk('meal.thisMeal'));
  if (btnEl) btnEl.classList.add('is-cooking');
  if (!confirm(tk('meal.alreadyCooked', { name: title }))) {
    if (btnEl) btnEl.classList.remove('is-cooking');
    return;
  }
  entry.cooked = true;
  entry.cookedAt = Date.now();
  saveMealPlan();
  const card = btnEl ? btnEl.closest('.week-slider-card') : null;
  const rerender = () => renderRecipeWeekSlider();
  if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.classList.add('is-leaving');
    setTimeout(rerender, 250);
  } else rerender();
}

function renderRecipeWeekSlider() {
  const wrap = document.getElementById('recipeWeekSliderWrap');
  const slider = document.getElementById('recipeWeekSlider');
  const { monday, sunday } = actualCurrentWeekRange();
  const from = isoDate(monday), to = isoDate(sunday);
  // The reference day is the day CURRENTLY SHOWN in the calendar (today + dayOffset), not rigidly the
  // actual date of today - if you page one day forward in the calendar, the slider moves along.
  // This only works in this direction: the slider itself never triggers calendar navigation.
  const refDate = new Date(); refDate.setDate(refDate.getDate() + dayOffset);
  const refISO = isoDate(refDate);
  // Overview on iPad & computer: smaller cards
  const compactSlider = currentView === 'uebersicht' && !isMobile();

  // Meals marked as "gekocht" disappear from the slider (but stay in the calendar)
  const entries = mealPlan
    .filter(p => p.date >= from && p.date <= to && !p.cooked)
    .sort((a, b) => a.date === b.date
      ? (mealTypeRank(a.mealType) - mealTypeRank(b.mealType))
      : a.date.localeCompare(b.date));

  if (!entries.length || (currentView === 'rezepte' && (recipeListSource !== 'eigene' || recipeIsFiltered()))) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');

  // Fixed edge placeholders at the front and back (same width as the peek) - so the
  // "there is more" edge always exists, even for the very first entry of the week (e.g. Monday), and the
  // scroll calculation below no longer has to distinguish between "first card" and "later card".
  const edgeSpacer = `<div class="shrink-0" style="width:${WEEK_SLIDER_PEEK_PX}px" aria-hidden="true"></div>`;
  slider.innerHTML = edgeSpacer + entries.map(p => {
    const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
    const title = recipe ? recipe.title : (p.title || tk('meal.noTitle'));
    const dayLabel = new Date(p.date).toLocaleDateString(sysLocale(), { weekday: 'short' });
    return `
      <button type="button" class="week-slider-card shrink-0 ${compactSlider ? 'is-compact' : 'w-32 p-2'} text-left rounded-xl border border-ink/10 bg-white fade-in" data-recipe-id="${recipe ? recipe.id : ''}" data-meal-id="${escapeHtml(String(p.id))}" title="${escapeHtml(tk('meal.longPressHint'))}" style="scroll-snap-align: start;">
        <div class="recipe-thumb w-full aspect-square rounded-lg overflow-hidden bg-ink/5">${mealCookedButtonHtml(p.id)}${recipe && isRecipeFavorite(recipe.id) ? recipeFavButtonHtml(recipe.id, 'recipe-fav-badge') : ''}${recipe && recipe.image ? `<img src="${recipeImageSrc(recipe.image, true, recipe.imageFrame)}" loading="lazy" draggable="false" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(recipe)} />` : recipe ? '<div class="w-full h-full grid place-items-center text-2xl opacity-30">🍽️</div>' : `<img src="${NO_RECIPE_MEAL_IMAGE}" draggable="false" class="w-full h-full object-cover opacity-70" alt="" />`}</div>
        <div class="wsc-title font-serif text-sm font-bold mt-1.5 line-clamp-2 leading-tight min-h-[2.25rem]">${escapeHtml(title)}</div>
        <div class="wsc-meta text-[11px] text-ink/40 mt-0.5 min-h-[1rem]" title="${mealTypeLabel(p.mealType, true)}">${dayLabel} · ${mealTypeIcon(p.mealType)}</div>
      </button>
    `;
  }).join('') + edgeSpacer;

  slider.querySelectorAll('.week-slider-card').forEach(btn => {
    // Long press (or right click) opens the meal actions; the click right after it is swallowed
    attachMealLongPress(btn, () => openMealActions(btn.dataset.mealId, btn));
    btn.addEventListener('click', (e) => {
      if (mealLongPressConsumed(btn)) { e.preventDefault(); return; }
      if (e.target.closest('.meal-cooked-btn')) return;
      if (btn.dataset.recipeId) openRecipeDetailPage(btn.dataset.recipeId);
      else openMealActions(btn.dataset.mealId, btn); // meal without a recipe: nothing to open, so show the actions
    });
  });
  slider.querySelectorAll('.meal-cooked-btn[data-meal-id]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); markMealCooked(el.dataset.mealId, el); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); markMealCooked(el.dataset.mealId, el); }
    });
  });

  // The automatic skipping ahead to today ONLY applies in the overview. In the recipes tab the
  // slider should simply show Mon-Sun in order, without hopping along with the calendar day.
  if (currentView !== 'uebersicht') return;

  // Reposition on "opening" OR when the day shown in the calendar has changed -
  // on every other re-render (e.g. after adding/deleting a meal, without the
  // calendar day having changed) do NOT jump again, otherwise it tears away a manually moved
  // position while you are swiping through the week yourself.
  if (weekSliderNeedsAutoScroll || weekSliderLastPositionedDate !== refISO) {
    weekSliderNeedsAutoScroll = false;
    weekSliderLastPositionedDate = refISO;
    const refIndex = entries.findIndex(p => p.date >= refISO);
    const scrollToIndex = refIndex === -1 ? 0 : refIndex;
    requestAnimationFrame(() => {
      // +1, because the front edge placeholder is now the first child
      const targetCard = slider.children[scrollToIndex + 1];
      if (!targetCard) return;
      // The edge placeholder (or, for later cards, a piece of the previous real card)
      // thus always stays partly visible - the same calculation for every position.
      slider.scrollLeft = targetCard.offsetLeft - slider.offsetLeft - WEEK_SLIDER_PEEK_PX;
    });
  }
}

/* ---------- Recipe detail page ---------- */
let recipeDetailCurrentServings = 2;

// publicEntry set = public recipe of another family (view/take over only)
function openRecipeDetailPage(recipeId, publicEntry = null) {
  const r = publicEntry ? publicEntryToRecipe(publicEntry) : recipes.find(x => x.id === recipeId);
  if (!r) return;
  const isForeign = !!publicEntry;

  document.getElementById('recipeListHeader').classList.add('hidden');
  document.getElementById('recipeListContainer').classList.add('hidden');
  document.getElementById('recipeDetailView').classList.remove('hidden');
  document.getElementById('recipeDetailBackLabel').textContent = currentView === 'uebersicht' ? tk('recipe.backOverview') : tk('recipe.title');

  // Opened from the overview, the detail page shows full screen instead of squeezed into the
  // narrow right column - hide calendar/tasks for a moment, the recipes section takes the full
  // width. Undone again in closeRecipeDetailPage() when going back.
  recipeDetailOpenedFromUebersicht = currentView === 'uebersicht';
  if (recipeDetailOpenedFromUebersicht) {
    ['calendarSection', 'taskSection', 'weatherTileSection', 'birthdayTileSection', 'contractTileSection', 'familyTileSection'].forEach(id => document.getElementById(id).classList.add('hidden'));
    const mainGrid = document.getElementById('mainGrid');
    const recipeSection = document.getElementById('recipeSection');
    mainGrid.classList.remove('grid-cols-[1.3fr_1fr]', 'grid-cols-[1.3fr_minmax(0,1fr)]');
    mainGrid.classList.add('grid-cols-1');
    mainGrid.style.gridTemplateRows = '';
    mainGrid.style.gridTemplateColumns = '';
    // Also when "Essen" is hidden in the overview (recipe e.g. opened from the calendar)
    recipeSection.classList.remove('hidden', 'border-t');
    recipeSection.style.gridColumn = '';
    recipeSection.style.gridRow = '';
    recipeSection.style.order = '';
  }

  const heroImg = document.getElementById('recipeDetailHeroImg');
  const heroPlaceholder = document.getElementById('recipeDetailHeroPlaceholder');
  if (r.image) {
    heroImg.onerror = () => { heroImg.classList.add('hidden'); heroPlaceholder.classList.remove('hidden'); };
    heroImg.src = r.image;
    applyRecipeImageFrame(heroImg, r.imageFrame);
    heroImg.classList.remove('hidden');
    heroPlaceholder.classList.add('hidden');
  } else {
    heroImg.classList.add('hidden');
    heroPlaceholder.classList.remove('hidden');
  }

  document.getElementById('recipeDetailTitle').textContent = r.title;

  // Favourite heart in the title image (also for public recipes of other families)
  const detailFavBtn = document.getElementById('recipeDetailFavBtn');
  const detailFavKey = recipeFavKey(r);
  detailFavBtn.dataset.favKey = detailFavKey;
  refreshRecipeFavButtons(detailFavKey);
  detailFavBtn.onclick = (e) => { e.stopPropagation(); toggleRecipeFavorite(detailFavKey); };
  detailFavBtn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRecipeFavorite(detailFavKey); } };

  const metaParts = [];
  if (totalTime(r)) metaParts.push(`🕐 ${formatRecipeDuration(totalTime(r))}`);
  metaParts.push(escapeHtml(tk('recipe.ingredientsN', { n: r.ingredients.length })));
  if (isPlannedThisWeek(r.id)) metaParts.push('<span class="text-mustard font-medium">' + escapeHtml(tk('recipe.plannedThisWeek')) + '</span>');
  document.getElementById('recipeDetailMeta').innerHTML = metaParts.map(p => `<span>${p}</span>`).join('');

  const catWrap = document.getElementById('recipeDetailCategories');
  catWrap.innerHTML = (r.categories || []).map(c => `<span class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-pine/10 text-pine">${escapeHtml(i18nT(c))}</span>`).join('');

  const toolLabels = isForeign
    ? (r.tools || []).filter(Boolean)
    : (r.tools || []).map(id => kitchenToolById(id)).filter(Boolean).map(t => t.label);

  const sourceEl = document.getElementById('recipeDetailSource');
  let sourceText = '';
  if (isForeign) sourceText = tk('recipe.pub.from', { name: publicRecipeOriginLabel(publicEntry) });
  else if (r.oeffentlich) sourceText = tk('recipe.pub.shared');
  else if (r.quelle && r.quelle.familie) sourceText = r.quelle.familie === 'Rezepte Familie' ? tk('recipe.pub.adoptedPool') : tk('recipe.pub.adoptedFrom', { name: r.quelle.familie });
  sourceEl.textContent = sourceText;
  sourceEl.classList.toggle('hidden', !sourceText);
  document.getElementById('recipeDetailToolsWrap').classList.toggle('hidden', !toolLabels.length);
  document.getElementById('recipeDetailTools').textContent = toolLabels.join(', ');

  document.getElementById('recipeDetailSteps').innerHTML = renderRecipeItemsHtml(r.steps, true);

  const baseServings = r.servings || 2;
  recipeDetailCurrentServings = baseServings;
  function renderDetailServings() {
    document.getElementById('recipeDetailServingsLabel').textContent = tk('recipe.persons', { n: recipeDetailCurrentServings });
    const factor = recipeDetailCurrentServings / baseServings;
    document.getElementById('recipeDetailIngredients').innerHTML =
      renderRecipeItemsHtml(r.ingredients, false, (line) => scaleIngredientLine(line, factor));
  }
  renderDetailServings();
  document.getElementById('recipeDetailServingsMinus').onclick = () => {
    recipeDetailCurrentServings = Math.max(1, recipeDetailCurrentServings - 1);
    renderDetailServings();
  };
  document.getElementById('recipeDetailServingsPlus').onclick = () => {
    recipeDetailCurrentServings++;
    renderDetailServings();
  };

  const planBtn = document.getElementById('recipeDetailPlanBtn');
  const editBtn = document.getElementById('recipeDetailEditBtn');
  const deleteBtn = document.getElementById('recipeDetailDeleteBtn');
  const adoptBtn = document.getElementById('recipeDetailAdoptBtn');
  planBtn.classList.toggle('hidden', isForeign);
  editBtn.classList.toggle('hidden', isForeign);
  deleteBtn.classList.toggle('hidden', isForeign);
  adoptBtn.classList.toggle('hidden', !isForeign);
  if (isForeign) {
    const copy = adoptedCopyOf(publicEntry);
    adoptBtn.textContent = copy ? tk('recipe.pub.inMine') : tk('recipe.addToMine');
    adoptBtn.disabled = false;
    adoptBtn.onclick = async () => {
      const own = adoptedCopyOf(publicEntry) || await adoptPublicRecipe(publicEntry, adoptBtn);
      if (!own) return;
      renderRecipesForCurrentView(); // Refresh the list in the background ("✓ Übernommen")
      openRecipeDetailPage(own.id);
    };
    scrollRecipeDetailToTop();
    return;
  }

  planBtn.onclick = () => openMealModal(isoDate(new Date()), 'mittag', r.id);
  const detailEditBtn = document.getElementById('recipeDetailEditBtn');
  const missingQty = hasUnquantifiedIngredients(r.ingredients);
  detailEditBtn.textContent = (missingQty ? '⚠️ ' : '') + tk('common.edit');
  detailEditBtn.title = missingQty ? tk('recipe.hasUnquantified') : '';
  detailEditBtn.onclick = () => openRecipeModal(r.id);
  // Asks first and moves the recipe to the recycle bin (7 days, js/rezeptaktionen.js) – the picture stays until then
  document.getElementById('recipeDetailDeleteBtn').onclick = () => {
    if (!confirmRecipeDelete(r)) return;
    if (!moveRecipeToTrash(r.id)) return;
    closeRecipeDetailPage();
    renderRecipesForCurrentView();
  };

  scrollRecipeDetailToTop();
}

// Always open a recipe at the top: on the Mac the page stayed at the scroll position of the list
// (what scrolled there was partly a parent area or the window) - the shorter
// detail page then appeared at the very bottom. So set the detail page, all areas above it and the
// window to the top and repeat that shortly after opening (image/layout may come
// a little later), but only as long as you haven't scrolled yourself.
function scrollRecipeDetailToTop() {
  const detail = document.getElementById('recipeDetailView');
  if (!detail) return;
  const active = document.activeElement;
  if (active && active !== document.body && !detail.contains(active) && active.closest && active.closest('#recipeSection')) {
    try { active.blur(); } catch (e) { /* ignore */ }
  }
  let userMoved = false;
  const stop = () => { userMoved = true; };
  const evts = ['touchstart', 'wheel', 'mousedown', 'keydown'];
  evts.forEach(t => window.addEventListener(t, stop, { passive: true, capture: true }));
  const reset = () => {
    if (userMoved || detail.classList.contains('hidden')) return;
    let el = detail;
    while (el && el !== document.documentElement) {
      if (el.scrollTop) el.scrollTop = 0;
      el = el.parentElement;
    }
    const se = document.scrollingElement || document.documentElement;
    if (se && se.scrollTop) se.scrollTop = 0;
    if (window.scrollY) window.scrollTo(0, 0);
  };
  reset();
  requestAnimationFrame(() => { reset(); requestAnimationFrame(reset); });
  setTimeout(reset, 120);
  setTimeout(reset, 350);
  setTimeout(() => evts.forEach(t => window.removeEventListener(t, stop, { capture: true })), 600);
}

let recipeDetailOpenedFromUebersicht = false;

function closeRecipeDetailPage() {
  document.getElementById('recipeDetailView').classList.add('hidden');
  document.getElementById('recipeListHeader').classList.remove('hidden');
  document.getElementById('recipeListContainer').classList.remove('hidden');
  if (recipeDetailOpenedFromUebersicht) {
    recipeDetailOpenedFromUebersicht = false;
    // Restore the grid of the overview (personal tiles)
    if (currentView === 'uebersicht') {
      applyOverviewLayout();
      applyMealCardLayout();
    }
  }
}
document.getElementById('recipeDetailBackBtn').addEventListener('click', () => {
  closeRecipeDetailPage();
  // Favourite changed on the detail page -> refresh the filtered list or week slider
  renderRecipesForCurrentView();
});

let expandedMealCardId = null;

function applyMealCardLayout() {
  const mainGrid = document.getElementById('mainGrid');
  if (!mainGrid) return;
  // The column shift only applies to the desktop/iPad view. In the mobile layout (calendar/meals/
  // tasks as tabs instead of columns) the forced grid would squeeze the visible section to a
  // fraction of the width.
  if (currentView !== 'uebersicht') {
    mainGrid.style.gridTemplateColumns = '';
    return;
  }
  let detailOpen = false;
  try { detailOpen = recipeDetailOpenedFromUebersicht; } catch (e) { detailOpen = false; }
  if (detailOpen || isMobile() || isPortraitOrientation()) return;
  // Expanded meal: calendar narrower, meals column wider - otherwise the grid of the overview
  if (expandedMealCardId && overviewCalendarSide) {
    mainGrid.style.gridTemplateColumns = overviewCalendarSide === 'links' ? '0.6fr minmax(0, 1.4fr)' : 'minmax(0, 1.4fr) 0.6fr';
  } else {
    mainGrid.style.gridTemplateColumns = overviewGridColumns;
  }
}

function renderOverviewMealList() {
  const list = document.getElementById('recipeList');
  const empty = document.getElementById('emptyRecipes');
  const count = document.getElementById('recipeCount');
  list.innerHTML = '';

  const { monday, sunday } = currentWeekRange();

  let from, to, emptyText;
  if (calendarMode === 'day') {
    const d = new Date(); d.setDate(d.getDate() + dayOffset);
    from = to = isoDate(d);
    emptyText = tk('meal.noneDay');
  } else {
    from = isoDate(monday); to = isoDate(sunday);
    emptyText = tk('meal.noneWeek');
  }
  empty.textContent = emptyText;

  const entries = mealPlan
    .filter(p => p.date >= from && p.date <= to)
    .sort((a, b) => a.date === b.date ? (mealTypeRank(a.mealType) - mealTypeRank(b.mealType)) : a.date.localeCompare(b.date));

  count.textContent = entries.length ? tk('shop.plannedMeals', { n: entries.length }) + ' · ' + tk('meal.dragHint') : '';
  empty.classList.toggle('hidden', entries.length > 0);

  // If the previously expanded meal no longer occurs in this view (e.g. after
  // a change of week), reset the shift layout.
  if (expandedMealCardId && !entries.some(p => p.id === expandedMealCardId)) {
    expandedMealCardId = null;
  }
  applyMealCardLayout();

  entries.forEach(p => {
    const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
    const title = recipe ? recipe.title : (p.title || tk('meal.noTitle'));
    const mealLabel = mealTypeLabel(p.mealType, true);
    const dayLabel = new Date(p.date).toLocaleDateString(sysLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
    const isExpanded = expandedMealCardId === p.id;

    const card = document.createElement('div');
    card.className = 'recipe-card rounded-xl border border-ink/10 bg-white overflow-hidden fade-in cursor-grab active:cursor-grabbing';
    card.innerHTML = `
      <button class="recipe-toggle w-full text-left px-3 py-2 flex items-center gap-2.5">
        <span class="text-ink/20 text-xs shrink-0" title="${escapeHtml(tk('meal.dragTitle'))}">⠿</span>
        <div class="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-ink/5" style="position: relative;">${recipe && recipe.image ? `<img src="${recipeImageSrc(recipe.image, true, recipe.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(recipe)} />` : ''}</div>
        <div class="flex-1 min-w-0">
          <div class="font-serif text-sm truncate">${escapeHtml(title)}</div>
        </div>
        <span class="chevron text-ink/30 text-xs shrink-0">${isExpanded ? '⌃' : '⌄'}</span>
      </button>
      <div class="recipe-body ${isExpanded ? '' : 'hidden'} px-4 pb-4 border-t border-ink/10 pt-3">
        <div class="text-xs text-ink/40 mb-3">${dayLabel} · ${mealLabel}</div>
        <h4 class="text-xs uppercase tracking-wide text-ink/40 mb-1.5">${escapeHtml(tk('cat.reassign.move'))}</h4>
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <input type="date" class="move-day-select text-sm rounded-lg border border-ink/15 px-2 py-1.5" value="${p.date}" />
          <div class="flex items-center gap-1 bg-ink/5 rounded-full p-1 text-xs">
            ${MEAL_TYPES.map(t => `<button type="button" class="move-meal-btn px-3 py-1 rounded-full transition ${mealTypeInfo(p.mealType).id === t.id ? 'active' : ''}" data-meal="${t.id}">${t.icon} ${t.label}</button>`).join('')}
          </div>
          <button class="apply-move-btn px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium hover:bg-pine/90 transition">${escapeHtml(tk('cat.reassign.move'))}</button>
        </div>
        ${recipe ? `<div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h4 class="text-xs uppercase tracking-wide text-ink/40 mb-1.5">${escapeHtml(tk('recipe.ingredients'))}</h4>
            ${renderRecipeItemsHtml(recipe.ingredients, false)}
          </div>
          <div>
            <h4 class="text-xs uppercase tracking-wide text-ink/40 mb-1.5">${escapeHtml(tk('recipe.method'))}</h4>
            ${renderRecipeItemsHtml(recipe.steps, true)}
          </div>
        </div>` : ''}
        <button class="del-planned-meal text-xs text-ink/40 hover:text-red-500 transition" data-id="${p.id}">${escapeHtml(tk('meal.remove'))}</button>
      </div>
    `;

    attachMealDragSource(card, p.id);

    let localMealType = p.mealType;
    card.querySelectorAll('.move-meal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        localMealType = btn.dataset.meal;
        card.querySelectorAll('.move-meal-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    card.querySelector('.recipe-toggle').addEventListener('click', () => {
      expandedMealCardId = (expandedMealCardId === p.id) ? null : p.id;
      renderOverviewMealList();
    });
    card.querySelector('.apply-move-btn').addEventListener('click', () => {
      const newDate = card.querySelector('.move-day-select').value;
      if (p.date !== newDate) { delete p.cooked; delete p.cookedAt; }
      p.date = newDate;
      p.mealType = localMealType;
      saveMealPlan();
      renderCalendar();
      renderOverviewMealList();
    });
    card.querySelector('.del-planned-meal').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(tk('meal.confirmRemove', { name: title, meal: mealLabel, day: dayLabel }))) return;
      mealPlan = mealPlan.filter(x => x.id !== p.id);
      saveMealPlan();
      expandedMealCardId = null;
      renderCalendar();
      renderOverviewMealList();
    });
    list.appendChild(card);
  });
}

document.getElementById('recipeSort').addEventListener('change', () => renderRecipesForCurrentView());
document.getElementById('recipeSearchInput').addEventListener('input', (e) => { recipeSearch = e.target.value; renderRecipesForCurrentView(); });
document.getElementById('recipeFavoritesToggle').addEventListener('click', () => { recipeFavoritesFilterActive = !recipeFavoritesFilterActive; renderRecipesForCurrentView(); });
document.getElementById('recipeCategoryFilter').addEventListener('change', (e) => { recipeFilterCategory = e.target.value; renderRecipesForCurrentView(); });
document.getElementById('recipeToolFilter').addEventListener('change', (e) => { recipeFilterTool = e.target.value; renderRecipesForCurrentView(); });
document.getElementById('openRecipeSettingsBtn').addEventListener('click', () => openCategorySettingsModal('recipeSettingsModal'));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezepte');
