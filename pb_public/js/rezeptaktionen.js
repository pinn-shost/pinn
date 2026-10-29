/* pinn. – Recipes: recycle bin and actions of planned meals (js/rezeptaktionen.js, since 1.118.3)
   Classic script, no build step; loaded right after js/rezepte.js (load order: src/rahmen.html).
   Contents:
   - Recycle bin: deleting a recipe asks first (confirmRecipeDelete) and moves it to recipeTrash (moveRecipeToTrash) –
     together with its planned meals and its favourite mark. recipeTrash belongs to the area "rezepte"
     (pb_hooks/pinn-bereiche.js), so every device of the family sees the same bin. Entries stay RECIPE_TRASH_DAYS days and
     can be restored (restoreRecipeFromTrash) or deleted for good (deleteRecipeForever); the picture of the recipe is only
     removed from the server then. Expired entries are cleared by purgeRecipeTrash (shortly after the start, then hourly).
   - Actions of a planned meal: a long press (or right click) on a card of the week slider opens #mealActionsModal
     (openMealActions): view recipe, edit recipe, move or change the meal (day, meal, servings, other recipe – the meal
     popup in js/essenplanen.js), plan it once more, mark it as cooked, remove it from the meal plan. With the child lock
     only "view" is offered. attachMealLongPress / mealLongPressConsumed keep the tap right after a long press from also
     opening the recipe. */

const RECIPE_TRASH_DAYS = 7;
const RECIPE_TRASH_MS = RECIPE_TRASH_DAYS * 24 * 60 * 60 * 1000;
const RECIPE_TRASH_DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- Recycle bin ---------- */
// Entries that have not expired yet, newest first
function recipeTrashEntries() {
  const now = Date.now();
  return (Array.isArray(recipeTrash) ? recipeTrash : [])
    .filter(x => x && x.id && x.recipe && (Number(x.deletedAt) || 0) + RECIPE_TRASH_MS > now)
    .sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0));
}

// Asks before deleting; mentions upcoming planned meals that disappear along with the recipe
function confirmRecipeDelete(r) {
  if (!r) return false;
  const today = isoDate(new Date());
  const planned = mealPlan.filter(p => p.recipeId === r.id && p.date >= today).length;
  return confirm(planned
    ? tk('recipe.confirmDeletePlanned', { name: r.title, n: planned })
    : tk('recipe.confirmDelete', { name: r.title }));
}

// Moves a recipe (with its meals and favourite mark) to the recycle bin. true = done.
function moveRecipeToTrash(recipeId) {
  const r = recipes.find(x => String(x.id) === String(recipeId));
  if (!r) return false;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const meals = mealPlan.filter(p => p.recipeId === r.id);
  const u = currentUser();
  recipeTrash = (Array.isArray(recipeTrash) ? recipeTrash : []).filter(x => x && String(x.id) !== String(r.id));
  recipeTrash.push({
    id: r.id,
    recipe: clone(r),
    meals: clone(meals),
    favorite: isRecipeFavorite(String(r.id)),
    deletedAt: Date.now(),
    by: (u && u.username) || '',
  });
  recipes = recipes.filter(x => x.id !== r.id);
  setRecipeFavorite(String(r.id), false);
  mealPlan = mealPlan.filter(p => p.recipeId !== r.id);
  saveRecipes(); // saves every area that changed (recipes and meal plan)
  try { renderCalendar(); } catch (e) { /* calendar not built yet */ }
  return true;
}

// Brings a recipe back – with its meals (those not planned again in the meantime) and its favourite mark
function restoreRecipeFromTrash(id) {
  const entry = recipeTrash.find(x => x && String(x.id) === String(id));
  if (!entry) return;
  if (!recipes.some(r => String(r.id) === String(entry.id))) recipes.push(entry.recipe);
  (Array.isArray(entry.meals) ? entry.meals : []).forEach(m => {
    if (m && m.id && !mealPlan.some(p => String(p.id) === String(m.id))) mealPlan.push(m);
  });
  if (entry.favorite) setRecipeFavorite(String(entry.id), true);
  recipeTrash = recipeTrash.filter(x => x !== entry);
  saveRecipes();
  try { renderCalendar(); } catch (e) { /* calendar not built yet */ }
  renderRecipesForCurrentView();
  renderRecipeTrashList();
}

// Picture of a recipe in the bin – only deleted if no other recipe (or bin entry) still uses it
function deleteTrashImage(entry) {
  const recId = entry && entry.recipe && entry.recipe.imageRecordId;
  if (!recId) return;
  const usedElsewhere = recipes.some(r => r.imageRecordId === recId)
    || recipeTrash.some(x => x !== entry && x && x.recipe && x.recipe.imageRecordId === recId);
  if (!usedElsewhere) deleteRecipeImageRecord(recId);
}

function deleteRecipeForever(id) {
  const entry = recipeTrash.find(x => x && String(x.id) === String(id));
  if (!entry) return;
  if (!confirm(tk('recipe.trash.confirmForever', { name: entry.recipe.title || tk('meal.noTitle') }))) return;
  deleteTrashImage(entry);
  recipeTrash = recipeTrash.filter(x => x !== entry);
  saveRecipes();
  renderRecipeTrashButton();
  renderRecipeTrashList();
}

function emptyRecipeTrash() {
  const all = recipeTrash.filter(x => x && x.recipe);
  if (!all.length) return;
  if (!confirm(tk('recipe.trash.confirmEmpty', { n: all.length }))) return;
  all.forEach(deleteTrashImage);
  recipeTrash = [];
  saveRecipes();
  renderRecipeTrashButton();
  renderRecipeTrashList();
}

// Clears expired entries (and their pictures). Not for guests, with the child lock or offline (the picture
// could not be deleted) – the next run tries again.
function purgeRecipeTrash() {
  try {
    if (!familyRecordId || !Array.isArray(recipeTrash) || !recipeTrash.length) return;
    if (isCurrentUserGuest() || childLockActive()) return;
    if (navigator.onLine === false) return;
  } catch (e) { return; }
  const now = Date.now();
  const expired = recipeTrash.filter(x => !x || !x.recipe || (Number(x.deletedAt) || 0) + RECIPE_TRASH_MS <= now);
  if (!expired.length) return;
  expired.forEach(x => { if (x && x.recipe) deleteTrashImage(x); });
  recipeTrash = recipeTrash.filter(x => !expired.includes(x));
  saveRecipes();
  renderRecipeTrashButton();
}
setTimeout(() => {
  purgeRecipeTrash();
  setInterval(purgeRecipeTrash, 60 * 60 * 1000);
}, 20 * 1000);

// Button below the recipe list (recipes tab, own list) – only while something is in the bin
function renderRecipeTrashButton() {
  const btn = document.getElementById('recipeTrashBtn');
  if (!btn) return;
  const n = recipeTrashEntries().length;
  const show = currentView === 'rezepte' && recipeListSource === 'eigene' && n > 0;
  btn.classList.toggle('hidden', !show);
  if (show) btn.textContent = tk('recipe.trash.button', { n });
}

function renderRecipeTrashList() {
  const modal = document.getElementById('recipeTrashModal');
  if (!modal || modal.classList.contains('hidden')) return;
  const list = document.getElementById('recipeTrashList');
  const entries = recipeTrashEntries();
  const locked = childLockActive();
  document.getElementById('recipeTrashEmpty').classList.toggle('hidden', entries.length > 0);
  document.getElementById('recipeTrashEmptyAllBtn').classList.toggle('hidden', !entries.length || locked);
  const now = Date.now();
  list.innerHTML = entries.map(x => {
    const r = x.recipe;
    const date = new Date(Number(x.deletedAt) || now).toLocaleDateString(sysLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
    const daysLeft = Math.max(1, Math.ceil(((Number(x.deletedAt) || now) + RECIPE_TRASH_MS - now) / RECIPE_TRASH_DAY_MS));
    const when = x.by ? tk('recipe.trash.deletedBy', { date, name: x.by }) : tk('recipe.trash.deletedOn', { date });
    const thumb = r.image
      ? `<img src="${recipeImageSrc(r.image, true, r.imageFrame)}" loading="lazy" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(r)} />`
      : '<div class="w-full h-full grid place-items-center text-lg opacity-30">🍽️</div>';
    return `<div class="recipe-trash-row" data-id="${escapeHtml(String(x.id))}">
      <div class="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-ink/5" style="position: relative;">${thumb}</div>
      <div class="flex-1 min-w-0">
        <div class="font-serif text-sm font-bold truncate">${escapeHtml(r.title || tk('meal.noTitle'))}</div>
        <div class="text-[11px] text-ink/40">${escapeHtml(when)} · ${escapeHtml(tk('recipe.trash.daysLeft', { n: daysLeft }))}</div>
      </div>
      ${locked ? '' : `<div class="flex flex-col items-end gap-1 shrink-0">
        <button type="button" class="trash-restore px-2.5 py-1 rounded-lg bg-pine text-white text-[11px] font-medium hover:bg-pine/90 transition">${escapeHtml(tk('recipe.trash.restore'))}</button>
        <button type="button" class="trash-forever text-[11px] text-ink/40 hover:text-red-500 transition">${escapeHtml(tk('recipe.trash.deleteForever'))}</button>
      </div>`}
    </div>`;
  }).join('');
  list.querySelectorAll('.recipe-trash-row').forEach(row => {
    const id = row.dataset.id;
    const restore = row.querySelector('.trash-restore');
    const forever = row.querySelector('.trash-forever');
    if (restore) restore.addEventListener('click', () => restoreRecipeFromTrash(id));
    if (forever) forever.addEventListener('click', () => deleteRecipeForever(id));
  });
}

function openRecipeTrashModal() {
  document.getElementById('recipeTrashModal').classList.remove('hidden');
  renderRecipeTrashList();
}
function closeRecipeTrashModal() {
  document.getElementById('recipeTrashModal').classList.add('hidden');
  renderRecipeTrashButton();
}
document.getElementById('recipeTrashBtn').addEventListener('click', openRecipeTrashModal);
document.getElementById('closeRecipeTrashBtn').addEventListener('click', closeRecipeTrashModal);
document.getElementById('recipeTrashDoneBtn').addEventListener('click', closeRecipeTrashModal);
document.getElementById('recipeTrashEmptyAllBtn').addEventListener('click', emptyRecipeTrash);
document.getElementById('recipeTrashModal').addEventListener('click', (e) => {
  if (e.target.id === 'recipeTrashModal') closeRecipeTrashModal();
});

/* ---------- Long press on a planned meal ---------- */
const MEAL_HOLD_MS = 480;
const MEAL_HOLD_TOLERANCE = 10;
// Calls onLongPress after holding a finger/mouse button still; scrolling the slider cancels it.
// A right click (or the long-press menu of Android) does the same.
function attachMealLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0, startY = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    el.classList.remove('is-pressing');
  };
  const fire = () => {
    cancel();
    el._mealLongPress = true;
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* ignore */ }
    onLongPress();
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    el._mealLongPress = false;
    startX = e.clientX; startY = e.clientY;
    cancel();
    el.classList.add('is-pressing');
    timer = setTimeout(fire, MEAL_HOLD_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > MEAL_HOLD_TOLERANCE || Math.abs(e.clientY - startY) > MEAL_HOLD_TOLERANCE) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => el.addEventListener(type, cancel));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (el._mealLongPress || !document.getElementById('mealActionsModal').classList.contains('hidden')) return;
    fire();
  });
}
// true = the click belongs to a long press that already opened the actions (swallow it once)
function mealLongPressConsumed(el) {
  if (!el._mealLongPress) return false;
  el._mealLongPress = false;
  return true;
}

/* ---------- Actions of a planned meal ---------- */
function closeMealActions() {
  document.getElementById('mealActionsModal').classList.add('hidden');
}

function openMealActions(mealId, cardEl) {
  const p = mealPlan.find(x => String(x.id) === String(mealId));
  if (!p) return;
  const recipe = p.recipeId ? recipes.find(r => r.id === p.recipeId) : null;
  const title = recipe ? recipe.title : (p.title || tk('meal.noTitle'));
  const dayLabel = new Date(p.date).toLocaleDateString(sysLocale(), { weekday: 'long', day: 'numeric', month: 'short' });
  const mealLabel = mealTypeLabel(p.mealType, true);

  document.getElementById('mealActionsThumb').innerHTML = recipe && recipe.image
    ? `<img src="${recipeImageSrc(recipe.image, true, recipe.imageFrame)}" class="w-full h-full object-cover" alt=""${recipeImgStyleAttr(recipe)} />`
    : recipe ? '<div class="w-full h-full grid place-items-center text-xl opacity-30">🍽️</div>'
      : `<img src="${NO_RECIPE_MEAL_IMAGE}" class="w-full h-full object-cover opacity-70" alt="" />`;
  document.getElementById('mealActionsTitle').textContent = title;
  document.getElementById('mealActionsMeta').textContent = dayLabel + ' · ' + mealLabel
    + (p.servings ? ' · ' + tk('recipe.persons', { n: p.servings }) : '');

  const locked = childLockActive();
  const actions = [];
  if (recipe) actions.push({ icon: '👁️', label: tk('meal.act.view'), run: () => openRecipeDetailPage(recipe.id) });
  if (!locked) {
    if (recipe) actions.push({ icon: '✏️', label: tk('meal.act.edit'), run: () => openRecipeModal(recipe.id) });
    actions.push({ icon: '📅', label: tk('meal.act.move'), run: () => openMealModal(p.date, p.mealType, p.recipeId || null, p.id) });
    if (recipe) actions.push({ icon: '➕', label: tk('meal.act.again'), run: () => openMealModal(isoDate(new Date()), p.mealType, recipe.id) });
    if (!p.cooked) actions.push({ icon: '✓', label: tk('meal.markCooked'), run: () => markMealCookedNow(p.id, cardEl) });
    actions.push({
      icon: '🗑️', label: tk('meal.remove'), danger: true,
      run: () => {
        if (!confirm(tk('meal.confirmRemove', { name: title, meal: mealLabel, day: dayLabel }))) return;
        mealPlan = mealPlan.filter(x => x.id !== p.id);
        saveMealPlan();
        renderCalendar();
        renderRecipesForCurrentView();
      },
    });
  }
  const list = document.getElementById('mealActionsList');
  list.innerHTML = actions.map((a, i) => `<button type="button" class="meal-action-btn${a.danger ? ' is-danger' : ''}" data-act="${i}">
      <span class="mab-ico" aria-hidden="true">${a.icon}</span><span>${escapeHtml(a.label)}</span>
    </button>`).join('');
  list.querySelectorAll('.meal-action-btn').forEach(btn => btn.addEventListener('click', () => {
    const a = actions[Number(btn.dataset.act)];
    closeMealActions();
    if (a) a.run();
  }));
  document.getElementById('mealActionsModal').classList.remove('hidden');
}

// "Mark as cooked" from the actions: no second question – the card leaves the slider like with the tick
function markMealCookedNow(mealId, cardEl) {
  const entry = mealPlan.find(p => String(p.id) === String(mealId));
  if (!entry) return;
  entry.cooked = true;
  entry.cookedAt = Date.now();
  saveMealPlan();
  const rerender = () => renderRecipeWeekSlider();
  if (cardEl && cardEl.isConnected && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cardEl.classList.add('is-leaving');
    setTimeout(rerender, 250);
  } else rerender();
}

document.getElementById('mealActionsCancel').addEventListener('click', closeMealActions);
document.getElementById('mealActionsModal').addEventListener('click', (e) => {
  if (e.target.id === 'mealActionsModal') closeMealActions();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('mealActionsModal').classList.contains('hidden')) closeMealActions();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezeptaktionen');
