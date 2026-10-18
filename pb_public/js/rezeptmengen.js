/* pinn. – Recipe times, quantities & scaling (js/rezeptmengen.js)
   Part of the app code that used to be a single block in index.html. Classic script, no build step:
   it is loaded right after the inline script of index.html and before the other files in js/
   (the load order is listed at the bottom of index.html and in pinn-setup.sh).
   Contents: total time and duration display (totalTime, formatRecipeDuration), recognising and converting leading quantities of
   ingredient lines (parseLeadingQuantity, applyUnitConversion, formatScaledNumber, scaleIngredientLine), sub-headings
   (isLikelyGroupHeader), the ingredient/step list (renderRecipeItemsHtml) and the servings control of the recipe form
   (getFormServings, setFormServings). Used by the recipe popup, the recipe pages and the shopping list. */

function totalTime(r) { return (r.prepTime || 0) + (r.cookTime || 0); }

// From 60 minutes on it is shown in hours, rounded to 15-minute steps - if it was actually
// rounded (not a round value like 90 or 120 minutes), a ~ is put in front.
function formatRecipeDuration(totalMinutes) {
  if (!totalMinutes) return null;
  if (totalMinutes < 60) return `${totalMinutes} Min.`;
  const rounded = Math.round(totalMinutes / 15) * 15;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  const timeStr = mins === 0 ? `${hours} Std.` : `${hours} Std. ${mins} Min.`;
  return (rounded !== totalMinutes ? '~' : '') + timeStr;
}

// Recognises a leading quantity at the start of an ingredient line ("200g Mehl" -> 200, "1/2 Zwiebel"
// -> 0.5, "1,5 EL Zucker" -> 1.5). Lines without a recognisable number at the start return null and stay
// unchanged when converting - ingredients are deliberately free text here, not structured fields.
// Converts EL/TL amounts to ml (1 EL = 15ml, 1 TL = 5ml), so they can be combined with
// ml amounts of the same ingredient when summing, instead of staying as a separate, incompatible
// unit.
function applyUnitConversion(min, max, rest) {
  let m;
  if ((m = rest.match(/^(?:EL|Esslöffel)\b\.?\s*(.*)$/i))) {
    return { min: min * 15, max: max * 15, rest: 'ml ' + m[1] };
  }
  if ((m = rest.match(/^(?:TL|Teelöffel)\b\.?\s*(.*)$/i))) {
    return { min: min * 5, max: max * 5, rest: 'ml ' + m[1] };
  }
  return { min, max, rest };
}

// Recognises the leading quantity of an ingredient line. Returns {min, max, rest} - for a
// fixed number min===max, for a range ("1-2 Zwiebeln") min<max, so ranges are carried on correctly
// when summing over several recipes (3 + (1 bis 2) = 4-5). Also recognises
// mixed numbers ("2 1/2"), plain fractions ("1/2"), decimals (point or comma), a
// leading "oder" (alternative ingredient: "oder 200g Butter") and "Prise(n)" with a fixed
// conversion to g.
function parseLeadingQuantity(rawLine) {
  // "oder 200g Butter" -> treat like "200g Butter", only the prefix has to go, quantity and name
  // already follow in the right order.
  let line = rawLine.replace(/^oder\s+/i, '');
  // Allow different dash variants (– — minus) as range separator, not only the
  // plain hyphen - this often comes from copied/pasted recipes and used to be
  // not recognised as a range but pulled the second number into the rest text.
  line = line.replace(/[\u2012\u2013\u2014\u2212]/g, '-');
  // Convert Unicode fraction characters ("½ Zwiebel", "1½ Tassen") to decimals before the other
  // patterns (which rely on normal digits "1/2") try to match - the character is
  // invisible to \d and used to be missed completely (counted as "no quantity recognised").
  const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1/3, '⅔': 2/3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 1/6, '⅚': 5/6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
  line = line.replace(/(\d+)?([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (match, whole, frac) => {
    const value = (whole ? parseInt(whole, 10) : 0) + UNICODE_FRACTIONS[frac];
    return String(value);
  });

  let m;
  // "Prise"/"Prisen" usually has no (or only "eine") number in front - start right
  // with 1g per pinch, before the generic number patterns (which need a leading digit) match.
  m = line.match(/^(?:(\d+)\s+)?(?:eine\s+)?Prisen?\b\s*(.*)$/i);
  if (m) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    return { min: count, max: count, rest: 'g ' + m[2] };
  }
  // Range: "1-2", "1,5-2,5" or "1 bis 2"
  m = line.match(/^(\d+(?:[.,]\d+)?)\s*(?:-|bis)\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i);
  if (m) {
    let min = parseFloat(m[1].replace(',', '.'));
    let max = parseFloat(m[2].replace(',', '.'));
    if (!isNaN(min) && !isNaN(max)) {
      if (min > max) { const t = min; min = max; max = t; } // repair a swapped range
      return applyUnitConversion(min, max, m[3]);
    }
  }
  // Mixed number: "2 1/2"
  m = line.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/);
  if (m) {
    const den = parseInt(m[3], 10);
    if (den) {
      const value = parseInt(m[1], 10) + parseInt(m[2], 10) / den;
      return applyUnitConversion(value, value, m[4]);
    }
  }
  // Plain fraction: "1/2"
  m = line.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (m) {
    const den = parseInt(m[2], 10);
    if (den) {
      const value = parseInt(m[1], 10) / den;
      return applyUnitConversion(value, value, m[3]);
    }
  }
  // Decimal/integer: "2.5", "2,5", "3"
  m = line.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (m) {
    const value = parseFloat(m[1].replace(',', '.'));
    if (!isNaN(value)) return applyUnitConversion(value, value, m[2]);
  }
  return null;
}

function formatScaledNumber(n) {
  const oneDecimal = Math.round(n * 10) / 10;
  return Number.isInteger(oneDecimal) ? String(oneDecimal) : numDec(String(oneDecimal));
}

// Recognises sub-heading lines in ingredients/preparation, as they occur in extensive
// recipes with several components ("A) Vorteig:", "Burgersauce:", "Patties:").
// Criterion: the line ends with a colon and is short - this reliably also recognises
// ingredient headings in recipes with many ingredients without quantity (e.g. "Salz", "Ketchup"), where
// a quantity-based detection would wrongly mark almost every ingredient as a heading.
// Only known gap: a heading without any colon (e.g. "Am Vortag (ca. 12h Reife)")
// is then not highlighted separately but shown like a normal line.
function isLikelyGroupHeader(line) {
  const t = line.trim();
  if (!t) return false;
  if (/:\s*$/.test(t) && t.split(/\s+/).length <= 6) return true;
  // Sub-heading without a colon in the style of Chefkoch & co.: "Für die Marinade",
  // "Für den Teig" - short, starts with "Für der/die/das/den" and contains no quantity.
  return /^für\s+(?:den|die|das|der|einen|eine|ein)\s+\S+(?:\s+\S+){0,3}$/i.test(t) && !/\d/.test(t);
}

// Builds ingredients/preparation as a list in which heading lines are set apart visually and the
// numbering of the preparation steps counts through cleanly (headings themselves are not
// counted) - independent of the original numbering in the imported text.
function renderRecipeItemsHtml(items, numbered, transformLine) {
  if (!items.length) return `<p class="text-sm text-ink/30 italic">Keine Angaben</p>`;
  let n = 0;
  return `<div class="flex flex-col ${numbered ? 'gap-2' : 'gap-1'}">` + items.map(line => {
    if (isLikelyGroupHeader(line)) {
      return `<div class="text-xs font-semibold uppercase tracking-wide text-ink/50 mt-2 first:mt-0">${escapeHtml(line)}</div>`;
    }
    n++;
    const displayText = transformLine ? transformLine(line) : line;
    return numbered
      ? `<div class="flex gap-2 text-sm text-ink/80"><span class="text-ink/40 shrink-0">${n}.</span><span>${escapeHtml(displayText)}</span></div>`
      : `<div class="flex gap-2 text-sm text-ink/80"><span class="text-ink/30 shrink-0">•</span><span>${escapeHtml(displayText)}</span></div>`;
  }).join('') + `</div>`;
}

function scaleIngredientLine(line, factor) {
  const parsed = parseLeadingQuantity(line);
  if (!parsed) return line;
  const scaledMin = parsed.min * factor;
  const scaledMax = parsed.max * factor;
  const scaledText = scaledMin === scaledMax
    ? formatScaledNumber(scaledMin)
    : `${formatScaledNumber(scaledMin)}-${formatScaledNumber(scaledMax)}`;
  return parsed.rest ? `${scaledText} ${parsed.rest}` : scaledText;
}

// Servings control in the form: directly sets the stored number of servings of the recipe (no
// additional number field needed any more). Converting the ingredients live is done by the recipe card in
// the list once the recipe is saved - here in the form you simply enter quantities directly for the
// entered number of servings.
function getFormServings() { return parseInt(document.getElementById('rServingsValue').textContent, 10) || 2; }
function setFormServings(n) { document.getElementById('rServingsValue').textContent = Math.max(1, n); }
document.getElementById('rServingsMinusBtn').addEventListener('click', () => setFormServings(getFormServings() - 1));
document.getElementById('rServingsPlusBtn').addEventListener('click', () => setFormServings(getFormServings() + 1));

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('rezeptmengen');
