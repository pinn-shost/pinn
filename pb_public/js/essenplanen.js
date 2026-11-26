/* pinn. – Plan a meal (js/essenplanen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the meal popup (openMealModal, closeMealModal) with meal type, recipe search with suggestions or free title,
   servings and saving into the meal plan, plus the "add meal" button of the overview. Since 1.118.3 the same popup also changes
   a planned meal (4th parameter = ID of the meal plan entry: day, meal, servings or another recipe). openMealModal is one of the six
   functions wrapped by the child lock at DOMContentLoaded – never pass it on directly while loading. */

/* ---------- Meal planning modal ---------- */
function setMealTypeChoice(mealType) {
  pendingMealType = mealType;
  document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.toggle('active', b.dataset.meal === mealType));
}
document.querySelectorAll('.meal-type-btn').forEach(btn => btn.addEventListener('click', () => setMealTypeChoice(btn.dataset.meal)));

// Recipe choice as a search field with suggestions instead of a dropdown - with many recipes a
// native <select> is useless for scrolling through. pendingMealRecipeId holds the ID actually
// selected; the search field itself only shows the title as text.
let pendingMealRecipeId = null;
function renderMealRecipeSuggestions(query) {
  const box = document.getElementById('mealRecipeSuggestions');
  const q = query.trim().toLowerCase();
  let matches;
  if (q) {
    matches = recipes.filter(r => r.title.toLowerCase().includes(q));
    matches.sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.title.localeCompare(b.title);
    });
  } else {
    matches = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  }
  matches = matches.slice(0, 8);

  if (!matches.length) {
    box.innerHTML = '<p class="px-3 py-2 text-xs text-ink/40 italic">' + escapeHtml(tk('meal.noHits')) + '</p>';
  } else {
    box.innerHTML = matches.map(r => `
      <button type="button" class="meal-recipe-suggestion w-full text-left px-3 py-2 text-sm hover:bg-mustard/10 transition flex items-center gap-2" data-id="${r.id}">
        <div class="w-6 h-6 rounded overflow-hidden shrink-0 bg-ink/5" style="position: relative;">${r.image ? `<img src="${recipeImageSrc(r.image, true, r.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(r)} />` : ''}</div>
        <span class="truncate">${escapeHtml(r.title)}</span>
      </button>
    `).join('');
    box.querySelectorAll('.meal-recipe-suggestion').forEach(btn => {
      // mousedown instead of click: fires BEFORE the blur event of the search field, otherwise the
      // list closes before the click is registered
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const r = recipes.find(x => x.id === btn.dataset.id);
        if (!r) return;
        pendingMealRecipeId = r.id;
        document.getElementById('mealRecipeSearch').value = r.title;
        document.getElementById('clearMealRecipeBtn').classList.remove('hidden');
        setMealServings(r.servings || 2);
        box.classList.add('hidden');
      });
    });
  }
  box.classList.remove('hidden');
}
document.getElementById('mealRecipeSearch').addEventListener('input', (e) => {
  pendingMealRecipeId = null; // Discard the choice as soon as the user keeps typing
  document.getElementById('clearMealRecipeBtn').classList.toggle('hidden', !e.target.value);
  renderMealRecipeSuggestions(e.target.value);
});
document.getElementById('mealRecipeSearch').addEventListener('focus', (e) => renderMealRecipeSuggestions(e.target.value));
document.getElementById('mealRecipeSearch').addEventListener('blur', () => {
  setTimeout(() => document.getElementById('mealRecipeSuggestions').classList.add('hidden'), 120);
});
document.getElementById('clearMealRecipeBtn').addEventListener('click', () => {
  pendingMealRecipeId = null;
  const input = document.getElementById('mealRecipeSearch');
  input.value = '';
  document.getElementById('clearMealRecipeBtn').classList.add('hidden');
  input.focus();
  renderMealRecipeSuggestions('');
});

function getMealServings() { return parseInt(document.getElementById('mealServingsValue').textContent, 10) || 2; }
function setMealServings(n) { document.getElementById('mealServingsValue').textContent = Math.max(1, n); }
document.getElementById('mealServingsMinusBtn').addEventListener('click', () => setMealServings(getMealServings() - 1));
document.getElementById('mealServingsPlusBtn').addEventListener('click', () => setMealServings(getMealServings() + 1));

// editMealId set = change this planned meal instead of adding a new one
let pendingMealEditId = null;
function openMealModal(dayISO, mealType, presetRecipeId, editMealId) {
  const editing = editMealId ? mealPlan.find(p => String(p.id) === String(editMealId)) : null;
  pendingMealEditId = editing ? editing.id : null;
  document.getElementById('mealModalTitle').textContent = tk(editing ? 'meal.editTitle' : 'meal.title');
  pendingMealDay = dayISO;
  setMealTypeChoice(mealType || 'mittag');
  document.getElementById('mealModalDate').value = dayISO;
  const presetRecipe = presetRecipeId ? recipes.find(r => r.id === presetRecipeId) : null;
  pendingMealRecipeId = presetRecipe ? presetRecipe.id : null;
  document.getElementById('mealRecipeSearch').value = presetRecipe ? presetRecipe.title : '';
  document.getElementById('clearMealRecipeBtn').classList.toggle('hidden', !presetRecipe);
  document.getElementById('mealRecipeSuggestions').classList.add('hidden');
  document.getElementById('mealFreeTitle').value = editing && !presetRecipe ? (editing.title || '') : '';
  setMealServings(editing && editing.servings ? editing.servings : (presetRecipe ? (presetRecipe.servings || 2) : 2));
  document.getElementById('mealModal').classList.remove('hidden');
  armModalSnapshot('mealModal');
}
function closeMealModal() { document.getElementById('mealModal').classList.add('hidden'); }
document.getElementById('cancelMeal').addEventListener('click', () => attemptCloseModal('mealModal', closeMealModal));
wireModalOutsideClick('mealModal', closeMealModal);
document.getElementById('saveMeal').addEventListener('click', () => {
  const recipeId = pendingMealRecipeId;
  const freeTitle = document.getElementById('mealFreeTitle').value.trim();
  const chosenDate = document.getElementById('mealModalDate').value || pendingMealDay;
  if (!recipeId && !freeTitle) return;
  const editing = pendingMealEditId ? mealPlan.find(p => String(p.id) === String(pendingMealEditId)) : null;
  pendingMealEditId = null;
  if (editing) {
    // Moved to another day or another recipe: counts as not cooked again
    if (editing.date !== chosenDate || (editing.recipeId || null) !== (recipeId || null)) { delete editing.cooked; delete editing.cookedAt; }
    editing.date = chosenDate;
    editing.mealType = pendingMealType;
    editing.recipeId = recipeId;
    editing.title = recipeId ? null : (freeTitle || null);
    editing.servings = getMealServings();
  } else {
    mealPlan.push({ id: 'p' + Date.now(), date: chosenDate, mealType: pendingMealType, recipeId, title: freeTitle || null, servings: getMealServings() });
  }
  saveMealPlan();
  document.getElementById('mealModal').classList.add('hidden');
  renderCalendar();
  // Recipes tab: refresh the week slider, but never close an open recipe detail page
  if (currentView === 'uebersicht' || (currentView === 'rezepte' && document.getElementById('recipeDetailView').classList.contains('hidden'))) renderRecipesForCurrentView();
});
document.getElementById('addMealOverviewBtn').addEventListener('click', () => openMealModal(isoDate(new Date()), 'mittag'));

/* ---------- Week from the pantry (since 1.168.0) ----------
   Suggests a recipe for every free day of the next 7 days (one meal: lunch or dinner) - recipes whose ingredients are
   mostly in the pantry come first, ingredients that expire soon count extra. ↻ swaps a day to the next candidate,
   ticked days go into the meal plan. Basics (salt, pepper, water, oil, sugar, flour …) are not counted. */
const MEAL_PP_BASICS = /^(salz|pfeffer|wasser|öl|olivenöl|zucker|mehl|salt|pepper|water|oil|olive oil|sugar|flour)\b/i;
function mealIngredientName(line) {
  let rest = String(line || '').trim();
  const q = typeof parseLeadingQuantity === 'function' ? parseLeadingQuantity(rest) : null;
  if (q && typeof q.rest === 'string') rest = q.rest;
  else rest = rest.replace(/^[\d.,/\s-]+/, '');
  const unit = typeof extractUnitFromRest === 'function' ? extractUnitFromRest(rest) : '';
  if (unit) rest = rest.slice(unit.length);
  return rest.replace(/\(.*?\)/g, '').split(',')[0].trim().toLowerCase();
}
function mealPantryScore(r, today) {
  const lines = (r.ingredients || []).filter(l => l && !(typeof isLikelyGroupHeader === 'function' && isLikelyGroupHeader(l)));
  const names = lines.map(mealIngredientName).filter(n => n && !MEAL_PP_BASICS.test(n));
  if (!names.length) return null;
  const stock = (pantryItems || []).filter(p => (pantryNum(p.qty) || 0) > 0);
  const soonDays = (typeof pantrySettings !== 'undefined' && pantrySettings && Number(pantrySettings.mhdDays)) || 3;
  let have = 0;
  const soon = [];
  names.forEach(n => {
    const p = stock.find(x => { const k = String(x.name || '').trim().toLowerCase(); return k && (n === k || n.includes(k) || k.includes(n)); });
    if (!p) return;
    have++;
    if (p.bestBefore && /^\d{4}-\d{2}-\d{2}$/.test(p.bestBefore)) {
      const d = Math.round((new Date(p.bestBefore + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
      if (d >= 0 && d <= soonDays && !soon.includes(p.name)) soon.push(p.name);
    }
  });
  if (!have) return null;
  return { recipe: r, have, total: names.length, soon, score: have / names.length + Math.min(soon.length, 3) * 0.25 };
}
function openPantryWeekSuggest() {
  if (typeof fzOpenModal2 !== 'function') return;
  const today = isoDate(new Date());
  const ranked = recipes.map(r => mealPantryScore(r, today)).filter(x => x && (x.have / x.total >= 0.4 || x.soon.length))
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title));
  const st = { type: 'abend', pick: {}, off: {} };
  const freeDays = () => Array.from({ length: 7 }, (_, i) => addDaysToDateStr(today, i))
    .filter(d => !mealPlan.some(m => m.date === d && (m.mealType || 'mittag') === st.type));
  const assign = () => {
    st.pick = {};
    const used = new Set();
    freeDays().forEach(d => { const c = ranked.findIndex(x => !used.has(x.recipe.id)); if (c >= 0) { st.pick[d] = c; used.add(ranked[c].recipe.id); } });
  };
  const draw = () => {
    const box = document.getElementById('ppDays');
    const days = freeDays();
    if (!ranked.length) { box.innerHTML = `<p class="text-sm text-ink/50 py-2">${escapeHtml(tk('qdone.ppNone'))}</p>`; return; }
    if (!days.length) { box.innerHTML = `<p class="text-sm text-ink/50 py-2">${escapeHtml(tk('qdone.ppFull'))}</p>`; return; }
    box.innerHTML = days.map(d => {
      const c = ranked[st.pick[d]];
      if (!c) return '';
      const label = new Date(d + 'T12:00:00').toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'numeric' });
      const sub = [tk('qdone.ppHave', { n: c.have, total: c.total }), c.soon.length ? '⏳ ' + tk('qdone.ppSoon', { names: c.soon.slice(0, 2).join(', ') }) : ''].filter(Boolean).join(' · ');
      return `<div class="flex items-center gap-2 py-1.5 border-b border-ink/5">
        <input type="checkbox" data-ppday="${d}" ${st.off[d] ? '' : 'checked'} class="shrink-0 w-4 h-4" />
        <span class="w-16 shrink-0 text-xs text-ink/50">${escapeHtml(label)}</span>
        <span class="min-w-0 flex-1"><span class="block text-sm truncate">${escapeHtml(c.recipe.title)}</span><span class="block text-[11px] ${c.soon.length ? 'text-amber-700' : 'text-ink/45'} truncate">${escapeHtml(sub)}</span></span>
        <button type="button" data-ppswap="${d}" class="shrink-0 w-7 h-7 rounded-full border border-ink/15 text-ink/60 hover:border-pine" title="${escapeHtml(tk('qdone.ppSwap'))}" aria-label="${escapeHtml(tk('qdone.ppSwap'))}">↻</button>
      </div>`;
    }).join('');
  };
  fzOpenModal2(`
    <h3 class="font-serif text-lg mb-1 pr-6">🥫 ${escapeHtml(tk('qdone.ppTitle'))}</h3>
    <p class="text-[11px] text-ink/45 mb-3">${escapeHtml(tk('qdone.ppIntro'))}</p>
    <div class="flex items-center gap-1 bg-ink/5 rounded-full p-1 text-xs w-fit mb-3" id="ppType">
      ${MEAL_TYPES.filter(t => t.id !== 'fruehstueck').map(t => `<button type="button" data-pptype="${t.id}" class="meal-type-btn px-3 py-1.5 rounded-full transition${t.id === st.type ? ' active' : ''}">${t.icon} ${escapeHtml(t.label)}</button>`).join('')}
    </div>
    <div id="ppDays" class="mb-2"></div>
    <div class="flex items-center gap-2 mt-3">
      <div class="flex-1"></div>
      <button type="button" id="ppCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">${tk('common.cancel')}</button>
      <button type="button" id="ppSave" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${escapeHtml(tk('qdone.ppPlan'))}</button>
    </div>`, (body) => {
    assign(); draw();
    body.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-pptype]');
      if (tb) { st.type = tb.dataset.pptype; body.querySelectorAll('[data-pptype]').forEach(x => x.classList.toggle('active', x === tb)); st.off = {}; assign(); draw(); return; }
      const sw = e.target.closest('[data-ppswap]');
      if (sw) {
        const d = sw.dataset.ppswap;
        const taken = new Set(Object.keys(st.pick).filter(x => x !== d).map(x => ranked[st.pick[x]].recipe.id));
        for (let k = 1; k <= ranked.length; k++) {
          const c = (st.pick[d] + k) % ranked.length;
          if (!taken.has(ranked[c].recipe.id)) { st.pick[d] = c; break; }
        }
        draw();
      }
    });
    body.addEventListener('change', (e) => { const cb = e.target.closest('[data-ppday]'); if (cb) st.off[cb.dataset.ppday] = !cb.checked; });
    document.getElementById('ppCancel').addEventListener('click', fzCloseModal2);
    document.getElementById('ppSave').addEventListener('click', () => {
      let n = 0;
      Object.keys(st.pick).forEach(d => {
        if (st.off[d]) return;
        const r = ranked[st.pick[d]].recipe;
        mealPlan.push({ id: 'p' + Date.now() + n, date: d, mealType: st.type, recipeId: r.id, title: null, servings: r.servings || 2 });
        n++;
      });
      fzCloseModal2();
      if (!n) return;
      saveMealPlan();
      renderCalendar();
      if (currentView === 'uebersicht' || (currentView === 'rezepte' && document.getElementById('recipeDetailView').classList.contains('hidden'))) renderRecipesForCurrentView();
      finShowToast(tk('qdone.ppPlanned', { n }));
    });
  });
}
document.getElementById('mealPantrySuggestBtn').addEventListener('click', () => { closeMealModal(); openPantryWeekSuggest(); });

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('essenplanen');
