/* pinn. – Recipe parser (js/rezeptparser.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: parseRecipeText – the rule-based recognition that turns pasted free text (or text read from a PDF/photo)
   into title, ingredients and steps. Used by the recipe popup (js/rezeptdialog.js) and the PDF/photo import (js/pdflesen.js). */

/* ==========================================================
   RECIPE PARSER (rule-based – simulates the AI recognition)
   ========================================================== */
function parseRecipeText(raw) {
  const rawLines = raw.split('\n').map(l => l.trim());
  const lines = rawLines.filter(l => l.length > 0);
  if (lines.length === 0) return { title: '', ingredients: [], steps: [] };

  // Headings in all app languages, so a recipe typed after the example placeholder is recognised
  const ingredientsHeaderRE = /^(zutaten|ingredients|ingrédients|ingredientes|ingredienti|材料|재료)\s*[:：]?\s*$/i;
  const stepsHeaderRE = /^(zubereitung|zubereitungsschritte|anleitung|schritte|method|directions|instructions|preparation|steps|préparation|étapes|preparación|instrucciones|pasos|preparazione|procedimento|preparação|modo de preparo|做法|步骤|作り方|手順|만드는 법|조리법)\s*[:：]?\s*$/i;
  const bulletRE = /^[-*•]\s*/;
  const numberedRE = /^\d+[.)]\s*/;
  const quantityRE = /^\d+([.,]\d+)?\s*(g|kg|ml|l|el|tl|stück|stk|prise|pck|dose|bund|zehe|scheibe[n]?|cups?|tbsp|tsp|oz|lb)\b/i;
  const clean = (l) => l.replace(bulletRE, '').replace(numberedRE, '').trim();

  let title = lines[0];
  let bodyStart = 1;
  if (bulletRE.test(title) || numberedRE.test(title) || quantityRE.test(clean(title))) {
    title = tk('recipe.imported');
    bodyStart = 0;
  }

  const body = lines.slice(bodyStart);
  const ingIdx = body.findIndex(l => ingredientsHeaderRE.test(l));
  const stepIdx = body.findIndex(l => stepsHeaderRE.test(l));

  let ingredients = [];
  let steps = [];

  if (ingIdx !== -1 || stepIdx !== -1) {
    if (ingIdx !== -1 && stepIdx !== -1) {
      const from = Math.min(ingIdx, stepIdx);
      const to = Math.max(ingIdx, stepIdx);
      const firstBlock = body.slice(from + 1, to).map(clean).filter(Boolean);
      const secondBlock = body.slice(to + 1).map(clean).filter(Boolean);
      if (ingIdx < stepIdx) { ingredients = firstBlock; steps = secondBlock; }
      else { steps = firstBlock; ingredients = secondBlock; }
    } else if (ingIdx !== -1) {
      ingredients = body.slice(ingIdx + 1).map(clean).filter(Boolean);
    } else {
      steps = body.slice(stepIdx + 1).map(clean).filter(Boolean);
    }
  } else {
    body.forEach(l => {
      const c = clean(l);
      if (!c) return;
      const looksLikeIngredient = bulletRE.test(l) || numberedRE.test(l) || quantityRE.test(c) || c.split(' ').length <= 4;
      if (looksLikeIngredient) ingredients.push(c); else steps.push(c);
    });
  }

  return { title: title.trim(), ingredients, steps };
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezeptparser');
