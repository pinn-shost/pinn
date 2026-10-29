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

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('essenplanen');
