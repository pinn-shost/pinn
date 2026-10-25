/* pinn. – Recipe popup (js/rezeptdialog.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: the recipe popup – input mode (free text / structured), "no quantity" warning for ingredients, analysing the text
   (with AI or the own parser), image handling, pickers for kitchen appliances and categories, opening/closing and saving
   (image upload, public sharing). The image frame editor is in js/rezeptbild.js, times/quantities/scaling in js/rezeptmengen.js,
   the parser in js/rezeptparser.js. */

/* ==========================================================
   Recipe modal (free text / structured, image, categories)
   ========================================================== */
function setRecipeInputMode(mode) {
  recipeInputMode = mode;
  document.querySelectorAll('.recipe-input-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('freitextBlock').classList.toggle('hidden', mode !== 'freitext');
  document.getElementById('structuredFieldsBlock').classList.toggle('hidden', mode !== 'strukturiert');
}
document.querySelectorAll('.recipe-input-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setRecipeInputMode(btn.dataset.mode));
});

// Checks whether at least one (non-heading) line has no recognisable quantity - e.g.
// relevant for the accuracy of the shopping list, since such ingredients cannot be summed there.
// Ingredients that are usually given without a quantity ("Salz", "Pfeffer", "Öl zum Braten",
// "Petersilie nach Belieben") are not a mistake in the recipe and therefore trigger no notice.
const TO_TASTE_BASICS = /^(?:(?:etwas|wenig|ein wenig|reichlich|ggf\.?|evtl\.?)\s+)?(?:(?:schwarzer|weißer|weisser|bunter|frisch(?:er)? gemahlener|gemahlener|grobes|grober|feines|jod-?)\s+)*(?:Salz|Meersalz|Jodsalz|Steinsalz|Kräutersalz|Pfeffer|Muskat(?:nuss)?|Wasser|Eiswürfel)(?:\s*(?:,|und|&|\+|\/)\s*(?:(?:schwarzer|weißer|weisser|bunter|frisch(?:er)? gemahlener|gemahlener)\s+)*(?:Salz|Pfeffer|Muskat(?:nuss)?|Zucker))*(?:\s*[,(].*)?$/i;
const TO_TASTE_PHRASES = /(?:^|[\s,(])(?:nach\s+(?:Geschmack|Belieben|Bedarf|Wahl)|n\.\s?B\.|n\.\s?G\.|zum\s+(?:Abschmecken|Würzen|Bestreuen|Bestäuben|Braten|Anbraten|Ausbacken|Frittieren|Einfetten|Fetten|Garnieren|Servieren|Dekorieren|Verzieren|Beträufeln|Bepinseln|Bestreichen|Kochen)|für\s+die\s+(?:Form|Arbeitsfläche|Pfanne)|optional|etwas)(?=$|[\s,.)])/i;
function isToTasteIngredient(line) {
  const t = line.trim();
  return TO_TASTE_BASICS.test(t) || TO_TASTE_PHRASES.test(t);
}

function hasUnquantifiedIngredients(lines) {
  return lines.some(line => line.trim() && !isLikelyGroupHeader(line) && !parseLeadingQuantity(line) && !isToTasteIngredient(line));
}

// Marks the ingredients field red + shows the warning if ingredients without a quantity were detected -
// called both after analysing and when saving.
function checkIngredientsQuantityWarning() {
  const lines = document.getElementById('rIngredients').value.split('\n');
  const hasWarning = hasUnquantifiedIngredients(lines);
  const textarea = document.getElementById('rIngredients');
  textarea.classList.toggle('border-red-500', hasWarning);
  textarea.classList.toggle('border-ink/15', !hasWarning);
  document.getElementById('ingredientsQuantityWarning').classList.toggle('hidden', !hasWarning);
  return hasWarning;
}

// Own parser (on the device, also offline)
function analyzeRecipeTextLocal(raw) {
  const parsed = parseRecipeText(raw);
  document.getElementById('rTitle').value = parsed.title;
  document.getElementById('rIngredients').value = parsed.ingredients.join('\n');
  document.getElementById('rSteps').value = parsed.steps.join('\n');
  setRecipeInputMode('strukturiert'); // switch straight to checking/completing the detected fields
  checkIngredientsQuantityWarning();
}
// "Text analysieren": with AI (if switched on), otherwise or on errors the own parser.
// Returns true if fields are filled afterwards.
async function analyzeRecipeText() {
  const raw = document.getElementById('importText').value;
  if (!raw.trim()) return false;
  const isLink = /^https?:\/\/\S+$/i.test(raw.trim());
  // Load the status later if necessary (e.g. popup opened right after the start)
  if (isLink && !recipeKiStatus && navigator.onLine) { try { await recipeKiLoadStatus(); } catch (e) { /* ignore */ } }
  if (recipeKiEnabled()) {
    const ok = await recipeKiImport({ text: raw.trim() }, isLink ? tk('recipe.ai.page') : tk('recipe.ai.text'));
    if (ok) return true;
    // For links the AI's error message stays (with the real reason) - don't overwrite it
    if (isLink) return false;
  }
  if (isLink) {
    let msg;
    if (!navigator.onLine) msg = tk('recipe.link.offline');
    else if (!recipeKiStatus) msg = tk('recipe.link.serverDown');
    else if (!recipeKiStatus.aktiv) msg = tk('recipe.link.notSetUp');
    else if (!recipeKiWanted()) msg = tk('recipe.link.tickAi');
    else msg = tk('recipe.link.onlyAi');
    recipeKiShowInfo(msg, true);
    return false;
  }
  analyzeRecipeTextLocal(raw);
  return true;
}
document.getElementById('analyzeBtn').addEventListener('click', () => { analyzeRecipeText(); });

function handleRecipeImageFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { pendingRecipeImage = reader.result; renderRecipeImagePreview(); };
  reader.readAsDataURL(file);
}
document.getElementById('rImageFile').addEventListener('change', (e) => handleRecipeImageFile(e.target.files[0]));
document.getElementById('rImageCapture').addEventListener('change', (e) => handleRecipeImageFile(e.target.files[0]));
document.getElementById('rRemoveImage').addEventListener('click', () => {
  pendingRecipeImage = null;
  document.getElementById('rImageFile').value = '';
  document.getElementById('rImageCapture').value = '';
  renderRecipeImagePreview();
});

// Multi-select picker for kitchen appliances in the recipe form: chips to select/deselect, the state lives
// in pendingRecipeTools until saving. Appliances already selected but hidden in the meantime
// stay visible when editing, so they don't vanish without a comment.
function renderRecipeToolsPicker() {
  const wrap = document.getElementById('rToolsPicker');
  wrap.innerHTML = '';
  const visible = kitchenTools.filter(t => t.active !== false || pendingRecipeTools.includes(t.id));
  if (!visible.length) {
    wrap.innerHTML = '<p class="text-xs text-ink/30 italic">' + escapeHtml(tk('recipe.edit.noTools')) + '</p>';
    return;
  }
  visible.forEach(tool => {
    const isSelected = pendingRecipeTools.includes(tool.id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'px-3 py-1.5 rounded-full text-xs font-medium border transition ' + (isSelected ? 'bg-pine text-white border-pine' : 'bg-white text-ink/60 border-ink/15 hover:border-pine hover:text-pine');
    chip.textContent = tool.label;
    chip.addEventListener('click', () => {
      if (pendingRecipeTools.includes(tool.id)) pendingRecipeTools = pendingRecipeTools.filter(id => id !== tool.id);
      else pendingRecipeTools.push(tool.id);
      renderRecipeToolsPicker();
    });
    wrap.appendChild(chip);
  });
}

// Multi-select picker for recipe categories (chips, like the kitchen-appliance picker). Categories
// are plain strings instead of {id,label} objects, hence no .id access here.
function renderRecipeCategoriesPicker() {
  const wrap = document.getElementById('rCategoriesPicker');
  wrap.innerHTML = '';
  const visible = recipeCategories.filter(c => categoryActive[c] !== false || pendingRecipeCategories.includes(c));
  if (!visible.length) {
    wrap.innerHTML = '<p class="text-xs text-ink/30 italic">' + escapeHtml(tk('recipe.edit.noCats')) + '</p>';
    return;
  }
  visible.forEach(cat => {
    const isSelected = pendingRecipeCategories.includes(cat);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'px-3 py-1.5 rounded-full text-xs font-medium border transition ' + (isSelected ? 'bg-pine text-white border-pine' : 'bg-white text-ink/60 border-ink/15 hover:border-pine hover:text-pine');
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      if (pendingRecipeCategories.includes(cat)) pendingRecipeCategories = pendingRecipeCategories.filter(c => c !== cat);
      else pendingRecipeCategories.push(cat);
      renderRecipeCategoriesPicker();
    });
    wrap.appendChild(chip);
  });
}

function openRecipeModal(existingId = null) {
  const pdfInfo = document.getElementById('recipePdfInfo');
  if (pdfInfo) pdfInfo.classList.add('hidden');
  recipeKiLoadStatus();
  editingRecipeId = existingId;
  const r = existingId ? recipes.find(x => x.id === existingId) : null;

  document.getElementById('recipeModalTitle').textContent = r ? tk('recipe.edit.editTitle') : tk('recipe.edit.newTitle');
  document.getElementById('importText').value = '';
  document.getElementById('rTitle').value = r ? r.title : '';
  document.getElementById('rIngredients').value = r ? r.ingredients.join('\n') : '';
  document.getElementById('rSteps').value = r ? r.steps.join('\n') : '';
  setFormServings(r && r.servings ? r.servings : 2);
  document.getElementById('rPrep').value = r && r.prepTime ? r.prepTime : '';
  document.getElementById('rCook').value = r && r.cookTime ? r.cookTime : '';
  pendingRecipeCategories = r ? [...(r.categories || (r.category ? [r.category] : []))] : [activeCategories()[0]].filter(Boolean);
  renderRecipeCategoriesPicker();
  pendingRecipeImage = r ? (r.image || null) : null;
  pendingRecipeImageFrame = { ...RECIPE_FRAME_DEFAULT, ...((r && normRecipeImageFrame(r.imageFrame)) || {}) };
  pendingRecipeImageFrameFor = pendingRecipeImage;
  renderRecipeImagePreview();
  pendingRecipeTools = r ? [...(r.tools || [])] : [];
  renderRecipeToolsPicker();
  // New recipes are public by default (the checkbox can be removed before saving)
  document.getElementById('rPublic').checked = r ? !!r.oeffentlich : true;
  // Existing recipe -> show the detail fields directly; new recipe -> free-text entry first
  setRecipeInputMode(r ? 'strukturiert' : 'freitext');
  document.getElementById('ingredientsQuantityWarning').classList.add('hidden');
  document.getElementById('rIngredients').classList.remove('border-red-500');
  document.getElementById('rIngredients').classList.add('border-ink/15');

  document.getElementById('recipeModal').classList.remove('hidden');
  armModalSnapshot('recipeModal');
}

document.getElementById('openRecipeModalBtn').addEventListener('click', () => openRecipeModal(null));
function closeRecipeModal() { document.getElementById('recipeModal').classList.add('hidden'); }
document.getElementById('cancelRecipe').addEventListener('click', () => attemptCloseModal('recipeModal', closeRecipeModal));
wireModalOutsideClick('recipeModal', closeRecipeModal);

document.getElementById('saveRecipeBtn').addEventListener('click', async () => {
  // If it has not been analysed yet (free-text mode with text in it), catch up on the analysis before
  // saving from the fields - otherwise title/ingredients/preparation would still be empty.
  if (recipeInputMode === 'freitext' && document.getElementById('importText').value.trim()) {
    if (recipeKiBusy) return;
    const ok = await analyzeRecipeText();
    if (!ok) return;
  }

  const title = document.getElementById('rTitle').value.trim() || tk('recipe.untitled');
  const ingredients = document.getElementById('rIngredients').value.split('\n').map(s => s.trim()).filter(Boolean);
  const steps = document.getElementById('rSteps').value.split('\n').map(s => s.trim()).filter(Boolean);
  const servings = getFormServings();
  const prepTime = parseInt(document.getElementById('rPrep').value, 10) || 0;
  const cookTime = parseInt(document.getElementById('rCook').value, 10) || 0;
  const categories = [...pendingRecipeCategories];
  const oeffentlich = document.getElementById('rPublic').checked;

  if (checkIngredientsQuantityWarning()) {
    if (!confirm(tk('recipe.edit.confirmNoQty'))) return;
  }

  // Shrink a newly chosen image (data:...) and upload it as a file of its own. If that fails (e.g.
  // collection missing), it is saved embedded in reduced size and moved automatically later.
  const existing = editingRecipeId ? recipes.find(x => x.id === editingRecipeId) : null;
  const oldRecordId = existing ? existing.imageRecordId : null;
  let image = pendingRecipeImage;
  let imageRecordId = (existing && pendingRecipeImage === existing.image) ? oldRecordId : null;
  if (typeof image === 'string' && image.startsWith('data:')) {
    const btn = document.getElementById('saveRecipeBtn');
    const btnLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = tk('recipe.edit.savingImage');
    try {
      const up = await uploadRecipeImage(image);
      image = up.path;
      imageRecordId = up.recordId;
    } catch (err) {
      console.warn('Image upload failed, storing a smaller embedded copy:', err);
      try {
        const blob = await compressImageDataUrl(image);
        image = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      } catch (e2) { /* keep the original image */ }
      imageRecordId = null;
    } finally {
      btn.disabled = false;
      btn.textContent = btnLabel;
    }
  }
  // Clean up the old image if it was replaced or removed
  if (oldRecordId && oldRecordId !== imageRecordId) deleteRecipeImageRecord(oldRecordId);
  // Only save the image frame if it differs from centred/no zoom
  const imageFrame = image ? normRecipeImageFrame(pendingRecipeImageFrame) : null;

  if (existing) {
    Object.assign(existing, { title, ingredients, steps, servings, prepTime, cookTime, categories, image, imageRecordId, tools: [...pendingRecipeTools], oeffentlich });
    delete existing.category;
    if (imageFrame) existing.imageFrame = imageFrame;
    else delete existing.imageFrame;
  } else {
    const fresh = { id: 'r' + Date.now(), title, ingredients, steps, servings, prepTime, cookTime, categories, image, imageRecordId, tools: [...pendingRecipeTools], createdAt: Date.now(), oeffentlich };
    if (imageFrame) fresh.imageFrame = imageFrame;
    recipes.unshift(fresh);
  }
  // Fetch the list of public recipes anew from the server the next time it is shown after saving
  publicRecipesLoadedAt = 0;
  saveRecipes().finally(() => { publicRecipesLoadedAt = 0; });
  document.getElementById('recipeModal').classList.add('hidden');
  renderRecipesForCurrentView();
});

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezeptdialog');
