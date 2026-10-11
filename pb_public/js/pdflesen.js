/* pinn. – js/pdflesen.js
   Part of the pinn. web app (pb_public/index.html). Loaded as a classic <script>, no build step:
   all top-level functions and variables share one global scope with the inline script in
   index.html and the other files in js/. Load order matters – see index.html.
   Loaded first of the files in js/, right before js/appstart.js and js/pinnwand.js (js/ausblick.js
   stays last and starts the app with bootApp()).

   Contents (moved unchanged from index.html in 1.47.0, only the comments were translated):
   - Reading PDFs (pdf…) – lines of a PDF with font size, dates and amounts, invoice/receipt
     detection; pre-fills documents (docAutofillFromPdf) and expenses (expenseAutofillFromPdf)
   - Recipes from PDF (recipeFromPdfLines, importRecipeFromPdf) and with AI (Google Gemini, recipeKi…)
   - Recipes from photos with text recognition (Tesseract.js, recipeOcr…, importRecipeFromPhotos)
   index.html only calls these functions later (when the user acts or from bootApp), never while it
   is still loading – that is why this file may come after the inline script. */

/* ==========================================================
   Reading PDFs: invoices/receipts and recipes
   ----------------------------------------------------------
   Uses the same pdf.js reader as the depot import (self-hosted under
   pb_public/vendor/pdfjs/, only loaded with the first PDF). Everything runs on the device -
   the PDF does not leave it.
   - Documents: when a PDF is added to a document, empty fields are pre-filled:
     title, category, date, issuer/shop, purchase date, price, manufacturer warranty,
     "valid until" and the invoice number as a note.
   - Finances: a PDF receipt on a new expense fills in amount, description, date and shop.
   - Recipes: "Read PDF" in the recipe popup recognises title, ingredients, preparation, servings
     and times.
   Scanned PDFs without a text layer cannot be read this way (no text recognition).
   ========================================================== */
const PDF_MONTHS = { januar: 1, jan: 1, februar: 2, feb: 2, 'märz': 3, maerz: 3, 'mär': 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12 };

// Lines of a PDF with font size: [{ text, size, page }]
async function pinnPdfLines(file, maxPages = 6) {
  const lib = await finLoadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const lines = [];
  const pages = Math.min(doc.numPages, maxPages);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = [];
    tc.items.forEach(it => {
      const str = String(it.str || '').replace(/\s+/g, ' ').trim();
      if (!str || !it.transform) return;
      const x = it.transform[4], y = it.transform[5];
      const size = Math.abs(it.transform[3]) || Math.abs(it.height) || 0;
      let row = rows.find(r => Math.abs(r.y - y) < Math.max(2.5, Math.min(r.size, size || r.size) * 0.45));
      if (!row) { row = { y, size, parts: [] }; rows.push(row); }
      row.size = Math.max(row.size, size);
      row.parts.push({ x, str });
    });
    rows.sort((a, b) => b.y - a.y);
    rows.forEach(r => {
      const text = r.parts.sort((a, b) => a.x - b.x).map(q => q.str).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, size: Math.round(r.size * 10) / 10, page: p, x0: Math.round(Math.min(...r.parts.map(q => q.x))) });
    });
  }
  try { doc.destroy(); } catch (e) { /* ignore */ }
  return lines;
}
function pinnPdfErrorText(err) {
  if (err && err.code === 'nopdfjs') return 'PDF lässt sich nicht auslesen: pdf.js fehlt auf dem NAS (pb_public/vendor/pdfjs/pdf.min.mjs und pdf.worker.min.mjs).';
  if (err && /password/i.test(String(err.name || '') + String(err.message || ''))) return 'Die PDF ist mit einem Passwort geschützt und lässt sich nicht auslesen.';
  return 'Die PDF ließ sich nicht auslesen.';
}
function pinnIsPdfFile(f) { return !!f && (/pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || '')); }

/* ---------- Small helpers: dates & amounts ---------- */
function pdfIsoOk(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1950 && y <= 2100)) return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return '';
  return y + '-' + pad2(m) + '-' + pad2(d);
}
function pdfDatesIn(text) {
  const out = [];
  const s = String(text || '');
  let m;
  const reNum = /(^|[^\d])(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g;
  while ((m = reNum.exec(s))) {
    let y = Number(m[4]);
    if (m[4].length === 2) y += y > 60 ? 1900 : 2000;
    const iso = pdfIsoOk(y, Number(m[3]), Number(m[2]));
    if (iso) out.push({ iso, at: m.index });
  }
  const reIso = /(^|[^\d])((?:19|20)\d{2})-(\d{2})-(\d{2})(?!\d)/g;
  while ((m = reIso.exec(s))) {
    const iso = pdfIsoOk(Number(m[2]), Number(m[3]), Number(m[4]));
    if (iso) out.push({ iso, at: m.index });
  }
  const reTxt = /(^|[^\d])(\d{1,2})\.?\s+(januar|jan|februar|feb|märz|maerz|mär|mrz|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez)\.?\s+(\d{4})(?!\d)/gi;
  while ((m = reTxt.exec(s))) {
    const iso = pdfIsoOk(Number(m[4]), PDF_MONTHS[m[3].toLowerCase()] || 0, Number(m[2]));
    if (iso) out.push({ iso, at: m.index });
  }
  return out.sort((a, b) => a.at - b.at).map(x => x.iso);
}
// Amounts in a line (German format "1.234,56", also "12.99 €")
function pdfAmountsIn(text) {
  const out = [];
  const s = String(text || '');
  let m;
  const reDe = /(^|[^\d.,])(-?\d{1,3}(?:\.\d{3})+,\d{2}|-?\d+,\d{2})(?![\d,])(?!\s*%)/g;
  while ((m = reDe.exec(s))) {
    const v = parseEuro(m[2]);
    if (isFinite(v)) out.push(v);
  }
  const reEn = /(?:€|EUR)\s*(\d{1,6}\.\d{2})(?!\d)|(^|[^\d.,])(\d{1,6}\.\d{2})\s*(?:€|EUR)/gi;
  while ((m = reEn.exec(s))) {
    const v = Number(m[1] || m[3]);
    if (isFinite(v)) out.push(v);
  }
  return out;
}
function pdfCleanName(s) {
  return String(s || '')
    .split(/\s[·|•]\s|\s{2,}|,\s*(?=\S*\d)|\s-\s(?=.*\d{4,5})/)[0]
    .replace(/\b(rechnung|kassenbon|quittung|lieferschein|seite \d+.*)$/i, '')
    .replace(/[\s,;:·|-]+$/, '')
    .trim()
    .slice(0, 60);
}

/* ---------- Invoices & receipts ---------- */
const PDF_KNOWN_SHOPS = [
  ['amazon', 'Amazon'], ['media ?markt', 'MediaMarkt'], ['saturn', 'Saturn'], ['otto(?:\\.de)?\\b(?! ?gmbh & co)', 'Otto'], ['ikea', 'IKEA'],
  ['lidl', 'Lidl'], ['aldi', 'Aldi'], ['rewe', 'REWE'], ['edeka', 'Edeka'], ['kaufland', 'Kaufland'], ['netto', 'Netto'], ['penny', 'Penny'],
  ['rossmann', 'Rossmann'], ['dm-drogerie', 'dm'], ['obi', 'OBI'], ['bauhaus', 'Bauhaus'], ['hornbach', 'Hornbach'], ['toom', 'toom'],
  ['apple', 'Apple'], ['zalando', 'Zalando'], ['cyberport', 'Cyberport'], ['notebooksbilliger', 'notebooksbilliger.de'], ['alternate', 'Alternate'],
  ['conrad', 'Conrad'], ['thomann', 'Thomann'], ['tchibo', 'Tchibo'], ['decathlon', 'Decathlon'], ['euronics', 'Euronics'], ['expert', 'expert'],
  ['galeria', 'Galeria'], ['xxxlutz', 'XXXLutz'], ['poco', 'POCO'], ['h&m', 'H&M'], ['douglas', 'Douglas'], ['fressnapf', 'Fressnapf'],
  ['ebay', 'eBay'], ['check24', 'Check24'], ['telekom', 'Telekom'], ['vodafone', 'Vodafone'], ['1&1', '1&1'], ['bosch', 'Bosch'],
];
const PDF_DOC_TYPES = [
  ['auftragsbestätigung', 'Auftragsbestätigung'], ['bestellbestätigung', 'Bestellbestätigung'], ['versicherungsschein', 'Versicherungsschein'],
  ['steuerbescheid', 'Steuerbescheid'], ['gehaltsabrechnung', 'Gehaltsabrechnung'], ['entgeltabrechnung', 'Gehaltsabrechnung'], ['lohnabrechnung', 'Lohnabrechnung'],
  ['garantieschein', 'Garantieschein'], ['garantiekarte', 'Garantieschein'], ['kassenbon', 'Kassenbon'], ['kassenbeleg', 'Kassenbon'],
  ['arztbrief', 'Arztbrief'], ['befundbericht', 'Befund'], ['befund', 'Befund'], ['bescheid', 'Bescheid'], ['kontoauszug', 'Kontoauszug'],
  ['zeugnis', 'Zeugnis'], ['lieferschein', 'Lieferschein'], ['gutschrift', 'Gutschrift'], ['mahnung', 'Mahnung'], ['quittung', 'Quittung'],
  ['rechnung', 'Rechnung'], ['invoice', 'Rechnung'], ['angebot', 'Angebot'], ['police', 'Police'], ['vertrag', 'Vertrag'],
];
// Category detection for the default document categories: [category, pattern, weight]
const PDF_CATEGORY_HINTS = [
  ['gesundheit', /\b(arzt|ärztin|praxis|patient|diagnose|befund|klinik|klinikum|krankenhaus|therapie|labor|impf|zahnarzt|kieferorthop|physiotherap|apotheke|goä|krankenkasse|arbeitsunfähig)/g, 2],
  ['kaufbelege', /\b(rechnung|kassenbon|kassenbeleg|quittung|artikel|bestellung|lieferschein|garantie|gewährleistung|mwst|ust\.|zzgl|inkl\.|versandkosten|warenkorb|seriennummer)/g, 1],
  ['versicherungen', /\b(versicherung|versicherungsschein|police|versicherungsnehmer|beitragsrechnung|schadensmeldung|schadennummer)/g, 2],
  ['steuern', /\b(finanzamt|steuerbescheid|einkommensteuer|steuer-?id|steuernummer|bürgeramt|landratsamt|behörde|bescheid)/g, 2],
  ['wohnen', /\b(miete|mietvertrag|vermieter|nebenkosten|betriebskosten|stadtwerke|heizkosten|abschlag|zählerstand|strom|erdgas|grundsteuer|wohnung)/g, 1.5],
  ['arbeit', /\b(gehaltsabrechnung|entgeltabrechnung|lohnabrechnung|arbeitgeber|arbeitsvertrag|bruttobezüge|nettobezüge|lohnsteuer)/g, 2],
  ['bank', /\b(kontoauszug|depotauszug|kreditvertrag|darlehen|kontostand|sparkasse|volksbank|kreditkartenabrechnung)/g, 1.5],
  ['schule', /\b(zeugnis|schule|schuljahr|klassenlehrer|kita|kindergarten|elternbrief|halbjahr|versetzung)/g, 2],
  ['fahrzeuge', /\b(kfz|fahrzeug|kennzeichen|hauptuntersuchung|tüv|dekra|zulassung|inspektion|werkstatt|fahrgestell)/g, 1.5],
  ['haustiere', /\b(tierarzt|tierärztin|tierklinik|hund|katze|impfpass für|heimtier|chipnummer)/g, 2],
  ['ausweise', /\b(personalausweis|reisepass|geburtsurkunde|heiratsurkunde|urkunde|führerschein|aufenthalt)/g, 2],
  ['anleitungen', /\b(bedienungsanleitung|gebrauchsanweisung|betriebsanleitung|montageanleitung|sicherheitshinweise)/g, 2.5],
];
function pdfFindIssuer(lines) {
  const head = lines.slice(0, 40).map(l => l.text);
  const all = lines.map(l => l.text).join('\n').toLowerCase();
  // Known shops (the most frequent mention wins)
  let best = null;
  PDF_KNOWN_SHOPS.forEach(([pat, name]) => {
    const re = new RegExp('(^|[^a-zäöüß0-9])' + pat + '($|[^a-zäöüß])', 'g');
    const n = (all.match(re) || []).length;
    if (n && (!best || n > best.n)) best = { n, name };
  });
  if (best) return best.name;
  // Company, practice, authority in the header of the invoice
  const company = head.find(t => /\b(GmbH|AG|KG|e\.\s?K\.|UG|SE|OHG|GbR|mbH|Inc\.?|Ltd\.?|B\.V\.|S\.à r\.l\.)(\s|$|,)/.test(t) && !/(amtsgericht|registergericht|hrb|ust-?id|geschäftsführ|sitz der)/i.test(t));
  if (company) return pdfCleanName(company);
  const inst = head.find(t => /^(praxis|dr\.|apotheke|klinik|klinikum|stadtwerke|finanzamt|stadt |gemeinde|landratsamt|tierarzt|tierarztpraxis|zahnarzt)/i.test(t));
  if (inst) return pdfCleanName(inst);
  return '';
}
function pdfFindDate(lines) {
  const texts = lines.map(l => l.text);
  const today = finTodayIso();
  const ok = iso => iso && iso <= vtAddDays(today, 1) && iso >= '1990-01-01';
  const labels = [/(rechnungsdatum|rechnungs-datum|belegdatum|invoice date)/i, /(kaufdatum|lieferdatum|leistungsdatum|bestelldatum|ausstellungsdatum|ausgestellt am|datum der ausstellung)/i, /\bdatum\b/i];
  for (const re of labels) {
    for (let i = 0; i < texts.length; i++) {
      if (!re.test(texts[i]) || /(geburt|geb\.|fällig|zahlbar bis|gültig)/i.test(texts[i])) continue;
      const d = [...pdfDatesIn(texts[i]), ...(texts[i + 1] ? pdfDatesIn(texts[i + 1]) : [])].find(ok);
      if (d) return d;
    }
  }
  for (const t of texts.slice(0, 50)) {
    if (/(geburt|geb\.|fällig|zahlbar bis|gültig|seit)/i.test(t)) continue;
    const d = pdfDatesIn(t).find(ok);
    if (d) return d;
  }
  return '';
}
function pdfFindTotal(lines) {
  const texts = lines.map(l => l.text);
  const strong = /(gesamtbetrag|rechnungsbetrag|endbetrag|zahlbetrag|zu zahlen|zahlungsbetrag|gesamtsumme|bruttobetrag|summe brutto|brutto ?summe|gesamt ?\(?brutto|gesamtpreis|rechnungssumme|endsumme|total)/i;
  const weak = /\b(summe|gesamt|betrag|bar|ec-?karte|girocard|kartenzahlung)\b/i;
  const bad = /(zwischensumme|netto|mwst|mehrwertsteuer|ust|umsatzsteuer|steuer|rabatt|versand|anzahlung|bereits bezahlt|gegeben|rückgeld|pfand)/i;
  const pick = (re, avoidBad) => {
    let found = [];
    texts.forEach((t, i) => {
      if (!re.test(t) || (avoidBad && bad.test(t))) return;
      let a = pdfAmountsIn(t);
      if (!a.length && texts[i + 1]) a = pdfAmountsIn(texts[i + 1]);
      found = found.concat(a.filter(v => v > 0));
    });
    return found.length ? Math.max(...found) : 0;
  };
  const v = pick(strong, false) || pick(weak, true);
  if (v) return Math.round(v * 100) / 100;
  const euro = texts.filter(t => /€|EUR/.test(t)).flatMap(pdfAmountsIn).filter(x => x > 0);
  return euro.length ? Math.max(...euro) : 0;
}
function pdfFindProduct(lines) {
  const texts = lines.map(l => l.text);
  const hi = texts.findIndex(t => /\b(artikel|bezeichnung|beschreibung|produkt|artikelbezeichnung|leistung|position)\b/i.test(t) && /(menge|anz|preis|betrag|stk|€|eur|summe|einzel)/i.test(t));
  if (hi < 0) return '';
  for (const raw of texts.slice(hi + 1, hi + 6)) {
    if (/(summe|gesamt|versand|mwst|ust|zwischensumme|rabatt|seite)/i.test(raw)) break;
    const t = raw
      .replace(/-?\d{1,3}(?:\.\d{3})*,\d{2}\s*(€|eur)?/gi, ' ')
      .replace(/\b\d+(?:[.,]\d+)?\s*(x|stk\.?|stück|st\.)(?=\s|$)/gi, ' ')
      .replace(/(^|\s)(pos\.?\s*)?\d{1,3}(?=\s)/gi, ' ')
      .replace(/\b[A-Z0-9-]*\d[A-Z0-9-]{4,}\b/g, ' ')
      .replace(/[€|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length >= 3 && /[a-zäöüß]{3}/i.test(t)) return t.slice(0, 70);
  }
  return '';
}
function pdfParseInvoice(lines) {
  const texts = lines.map(l => l.text);
  const all = texts.join('\n');
  const lower = all.toLowerCase();
  const r = { issuer: '', date: '', total: 0, invoiceNo: '', type: '', category: '', guaranteeYears: 0, guaranteeDate: '', validUntil: '', product: '' };
  // Type of document (earliest mention in the header)
  let typeAt = Infinity;
  const head = texts.slice(0, 30).join('\n').toLowerCase();
  PDF_DOC_TYPES.forEach(([pat, name]) => {
    const m = new RegExp('(^|[^a-zäöüß])' + pat, 'i').exec(head);
    if (m && m.index < typeAt) { typeAt = m.index; r.type = name; }
  });
  // Category
  let bestScore = 0;
  PDF_CATEGORY_HINTS.forEach(([cat, re, w]) => {
    const n = (lower.match(re) || []).length;
    const score = Math.min(n, 6) * w;
    if (score > bestScore) { bestScore = score; r.category = cat; }
  });
  if (bestScore < 2) r.category = '';
  r.issuer = pdfFindIssuer(lines);
  r.date = pdfFindDate(lines);
  r.total = pdfFindTotal(lines);
  const no = /(?:rechnungs?[- ]?(?:nr|nummer)|beleg[- ]?(?:nr|nummer)|invoice\s*(?:no|number)|bestell[- ]?(?:nr|nummer)|auftrags[- ]?(?:nr|nummer))\.?\s*:?\s*#?\s*([A-Z0-9][A-Z0-9\-\/.]{2,30})/i.exec(all);
  if (no && /\d/.test(no[1])) r.invoiceNo = no[1].replace(/[.\-/]+$/, '');
  const g = /(\d{1,2})\s*(?:jahre?|j\.)\s*(?:hersteller-?)?garantie/i.exec(all) || /garantie(?:zeit|dauer)?\s*:?\s*(\d{1,2})\s*jahr/i.exec(all);
  if (g) { const y = Number(g[1]); if (y >= 1 && y <= 10) r.guaranteeYears = y; }
  const gd = /garantie\s*bis\s*:?\s*([0-9.\-]+\s*\w*\s*\d{0,4})/i.exec(all);
  if (gd) r.guaranteeDate = pdfDatesIn(gd[1])[0] || '';
  const vu = /(gültig\s*bis|ablaufdatum|läuft ab am|gültigkeit bis|nächste (?:hu|hauptuntersuchung))\s*:?\s*([^\n]{0,30})/i.exec(all);
  if (vu) r.validUntil = pdfDatesIn(vu[2])[0] || '';
  r.product = pdfFindProduct(lines);
  return r;
}

/* ---------- Documents: pre-fill the popup ---------- */
async function docAutofillFromPdf(file) {
  const info = document.getElementById('docPdfInfo');
  const show = (text, warn) => { info.textContent = text; info.classList.toggle('warn', !!warn); info.classList.remove('hidden'); };
  show('⏳ PDF wird ausgelesen …');
  let lines = [];
  try { lines = await pinnPdfLines(file, 4); }
  catch (err) { if (docDraft) show(pinnPdfErrorText(err), true); return; }
  if (!docDraft) return;
  if (lines.filter(l => /[a-zäöü]{3}/i.test(l.text)).length < 3) { show('Die PDF enthält keinen lesbaren Text (z. B. eingescannt) – bitte die Angaben selbst eintragen.', true); return; }
  const r = pdfParseInvoice(lines);
  const filled = [];
  const set = (id, val) => { const el = document.getElementById(id); if (el && !el.value.trim() && val) { el.value = val; return true; } return false; };
  // Category only for new documents and only as long as none has been chosen manually
  // Recognise the vehicle by licence plate or VIN
  const fzHit = (!isCurrentUserGuest() && finance) ? fzMatchVehicleInText(lines.map(l => l.text).join('\n')) : null;
  if (fzHit && !docDraft.vehTouched && !docDraft.vehicles.includes(fzHit.id)) {
    docDraft.vehicles = [fzHit.id];
    if (docDraft.isNew && !docDraft.catTouched && !r.category) r.category = 'fahrzeuge';
    filled.push('Fahrzeug ' + fzName(fzHit));
  }
  if (docDraft.isNew && !docDraft.catTouched && r.category && docCategories().some(c => c.id === r.category) && docDraft.catId !== r.category) {
    docDraft.catId = r.category;
    renderDocCategoryPicker();
    filled.push('Kategorie');
  }
  docSuggestVehicle();
  renderDocVehiclePicker();
  const cat = docCategory(docDraft.catId);
  const buy = cat.fields === 'kauf' || docDraft.buyFields;
  if (buy) document.getElementById('docBuyBlock').open = true;
  if (cat.fields === 'ablauf' && !docDraft.buyFields) document.getElementById('docExpiryBlock').open = true;
  // Title
  const titleEl = document.getElementById('docTitleInput');
  if (docDraft.fzTyp) {
    // Uploaded on a vehicle: keep the vehicle title, append shop/garage or item
    const add = (docDraft.fzTyp === 'rechnung' && r.product) ? r.product : r.issuer;
    if (add && docDraft.fzTitle && titleEl.value === docDraft.fzTitle) { titleEl.value = (docDraft.fzTitle + ' · ' + add).slice(0, 200); filled.push('Titel'); }
  } else {
    let title = '';
    if (cat.fields === 'kauf' && r.product) title = r.product;
    else if (r.type && r.issuer) title = `${r.type} ${r.issuer}`;
    else title = r.type || r.issuer || '';
    if (title && (!titleEl.value.trim() || titleEl.value === docDraft.autoTitle)) { titleEl.value = title.slice(0, 200); docDraft.autoTitle = ''; filled.push('Titel'); }
  }
  if (r.date && !docDraft.dateTouched) {
    document.getElementById('docDateInput').value = r.date;
    filled.push('Datum');
  }
  if (set('docIssuerInput', r.issuer)) filled.push(DOC_ISSUER_HINTS[cat.id] ? DOC_ISSUER_HINTS[cat.id][0] : 'Aussteller');
  if (buy) {
    const buyEl = document.getElementById('docBuyDateInput');
    if (r.date && (!buyEl.value || (docDraft.autoBuy && buyEl.value === docDraft.autoBuy)) && buyEl.value !== r.date) {
      buyEl.value = r.date;
      docDraft.autoBuy = '';
      onDocBuyDateChanged();
      filled.push('Kaufdatum', 'Gewährleistung');
    }
    if (r.total > 0 && set('docPriceInput', euroInputValue(r.total))) filled.push('Preis ' + fmtEur(r.total));
    const gSel = document.getElementById('docGuaranteeSelect');
    if (!gSel.value) {
      if (r.guaranteeDate) { gSel.value = 'x'; document.getElementById('docGuaranteeDateInput').value = r.guaranteeDate; filled.push('Garantie'); }
      else if (r.guaranteeYears && [1, 2, 3, 5, 10].includes(r.guaranteeYears)) { gSel.value = String(r.guaranteeYears); filled.push('Garantie'); }
    }
  }
  const expEl = document.getElementById('docExpiryInput');
  if (r.validUntil && (!expEl.value || (docDraft.autoExpiry && expEl.value === docDraft.autoExpiry)) && expEl.value !== r.validUntil) {
    expEl.value = r.validUntil;
    docDraft.autoExpiry = '';
    document.getElementById('docExpiryBlock').open = true;
    filled.push('Gültig bis');
  }
  if (r.invoiceNo) {
    const noLine = (/(bestell|auftrag)/i.test(r.type) ? 'Bestellnr. ' : 'Rechnungsnr. ') + r.invoiceNo;
    const noteEl = document.getElementById('docNoteInput');
    if (!noteEl.value.trim()) { noteEl.value = noLine; filled.push('Rechnungsnr.'); }
    else if (docDraft.fzTyp && !noteEl.value.includes(r.invoiceNo)) { noteEl.value = (noLine + '\n' + noteEl.value).slice(0, 4000); filled.push('Rechnungsnr.'); }
  }
  updateDocEditUi();
  if (filled.length) show('✨ Aus der PDF übernommen: ' + filled.join(', ') + ' – bitte kurz prüfen.');
  else show('In der PDF wurden keine passenden Angaben gefunden – bitte selbst eintragen.', true);
}

/* ---------- Finances: pre-fill a new expense from a PDF receipt ---------- */
async function expenseAutofillFromPdf(file) {
  const amountEl = document.getElementById('expenseAmountInput');
  if (!amountEl || amountEl.value.trim()) return; // only for new, still empty expenses
  finShowToast('⏳ Beleg wird ausgelesen …');
  let lines = [];
  try { lines = await pinnPdfLines(file, 3); }
  catch (err) { finShowToast(pinnPdfErrorText(err), true); return; }
  const modal = document.getElementById('expenseModal');
  if (!modal || modal.classList.contains('hidden') || amountEl.value.trim()) return;
  if (lines.filter(l => /[a-zäöü]{3}/i.test(l.text)).length < 3) { finShowToast('Der Beleg enthält keinen lesbaren Text – bitte Betrag selbst eintragen.', true); return; }
  const r = pdfParseInvoice(lines);
  const filled = [];
  if (r.total > 0) {
    amountEl.value = euroInputValue(r.total);
    amountEl.dispatchEvent(new Event('input', { bubbles: true }));
    filled.push(fmtEur(r.total));
  }
  const titleEl = document.getElementById('expenseTitleInput');
  const title = r.product || (r.issuer ? (r.type && r.type !== 'Rechnung' && r.type !== 'Kassenbon' ? r.type + ' ' : '') + r.issuer : '');
  if (title && !titleEl.value.trim()) { titleEl.value = title.slice(0, 200); filled.push('Beschreibung'); }
  if (r.date) { document.getElementById('expenseDateInput').value = r.date; filled.push('Datum'); }
  const storeEl = document.getElementById('expenseStoreInput');
  if (r.issuer && storeEl && !storeEl.value.trim()) { storeEl.value = r.issuer; filled.push('Laden'); }
  const noteEl = document.getElementById('expenseNoteInput');
  if (r.invoiceNo && noteEl && !noteEl.value.trim()) noteEl.value = 'Rechnungsnr. ' + r.invoiceNo;
  finShowToast(filled.length ? '✨ Aus dem Beleg übernommen: ' + filled.join(', ') + ' – bitte kurz prüfen.' : 'Im Beleg wurden keine passenden Angaben gefunden.', !filled.length);
}

/* ---------- Recipes ---------- */
const RECIPE_PDF_TIME = /(\d+(?:[.,]\d+)?)\s*(min(?:\.|uten?)?|std\.?|stunden?|h)\b/i;
function recipePdfMinutes(text) {
  const m = RECIPE_PDF_TIME.exec(text || '');
  if (!m) return 0;
  const v = parseFloat(m[1].replace(',', '.')) || 0;
  return Math.round(/^(std|stunde|h)/i.test(m[2]) ? v * 60 : v);
}
function recipeFromPdfLines(rawLines) {
  const noise = /(https?:\/\/|www\.|©|copyright|alle rechte|^seite\s+\d+|^\d+\s*(\/|von)\s*\d+$|^\d+$|rezept drucken|^drucken$|^teilen$|jetzt bewerten|kommentare?\b|^\s*$)/i;
  const lines = rawLines.filter(l => !noise.test(l.text) && !/^\d{1,2}\.\d{1,2}\.\d{2,4}(,?\s*\d{1,2}:\d{2})?$/.test(l.text));
  if (!lines.length) return null;
  const ingHead = t => /^zutaten\b/i.test(t) && t.length < 50 && !RECIPE_PDF_TIME.test(t);
  const stepHead = t => /^(zubereitung|anleitung|so geht'?s|und so geht'?s|so wird'?s gemacht|arbeitsschritte|schritte|methode|zubereitungsschritte)\b\s*:?/i.test(t) && t.length < 50 && !RECIPE_PDF_TIME.test(t);
  const metaLine = t => /^(portionen|personen|schwierigkeit|kalorien|kcal|nährwerte|pro portion|brennwert|eiweiß|fett|kohlenhydrate|gesamtzeit|arbeitszeit|vorbereitung|vorbereitungszeit|zubereitungszeit|kochzeit|backzeit|garzeit|ruhezeit|wartezeit|koch-|back-)\b/i.test(t)
    || (/(arbeitszeit|kochzeit|backzeit|zubereitungszeit|vorbereitungszeit|gesamtzeit|ruhezeit|garzeit)/i.test(t) && RECIPE_PDF_TIME.test(t) && t.length < 90);
  // Title: largest font high up on page 1
  const top = lines.filter(l => l.page === 1).slice(0, 12).filter(l => /[a-zäöüß]{3}/i.test(l.text) && !ingHead(l.text) && !stepHead(l.text) && !metaLine(l.text));
  let titleLine = top[0] || lines[0];
  top.forEach(l => { if (l.size > titleLine.size + 0.5) titleLine = l; });
  const title = titleLine.text.replace(/\s*[-–|]\s*(chefkoch|rezept).*$/i, '').slice(0, 120);
  const all = lines.map(l => l.text);
  const allText = all.join('\n');

  // Servings & times
  let servings = 0;
  const sv = /(?:für|ergibt|reicht für|zutaten für)\s*(\d{1,2})\s*(?:personen|portionen|pers\.?|port\.?|stück|stk\.?)/i.exec(allText)
    || /(\d{1,2})\s*(?:personen|portionen)\b/i.exec(allText)
    || /(?:portionen|personen)\s*:?\s*(\d{1,2})\b/i.exec(allText);
  if (sv) servings = Math.max(1, Math.min(40, Number(sv[1]) || 0));
  let prep = 0, cook = 0;
  all.forEach(t => {
    const parts = t.split(/(?=arbeitszeit|vorbereitung|zubereitungszeit|kochzeit|backzeit|garzeit|koch-\/backzeit|ruhezeit|gesamtzeit)/i);
    parts.forEach(p => {
      if (!prep && /^(arbeitszeit|vorbereitung|vorbereitungszeit|zubereitungszeit|aktive zeit)/i.test(p)) prep = recipePdfMinutes(p);
      else if (!cook && /^(kochzeit|backzeit|garzeit|koch-\/backzeit|koch-|back-)/i.test(p)) cook = recipePdfMinutes(p);
    });
  });

  const clean = t => t.replace(/^[-*•·▪►✓☐□]\s*/, '').replace(/^(schritt\s*)?\d+\s*[.):]\s*/i, '').trim();
  const iIdx = all.findIndex(ingHead);
  const sIdx = all.findIndex(stepHead);
  let ingLines = [];
  let stepLines = [];
  if (iIdx >= 0 && sIdx >= 0) {
    if (iIdx < sIdx) { ingLines = all.slice(iIdx + 1, sIdx); stepLines = all.slice(sIdx + 1); }
    else { stepLines = all.slice(sIdx + 1, iIdx); ingLines = all.slice(iIdx + 1); }
  } else if (iIdx >= 0) {
    const rest = all.slice(iIdx + 1);
    const cut = rest.findIndex(t => t.length > 60 && /[.!]$/.test(t));
    ingLines = cut >= 0 ? rest.slice(0, cut) : rest;
    stepLines = cut >= 0 ? rest.slice(cut) : [];
  } else if (sIdx >= 0) {
    ingLines = all.slice(0, sIdx).filter(t => t !== titleLine.text);
    stepLines = all.slice(sIdx + 1);
  } else {
    const parsed = parseRecipeText([titleLine.text, ...all.filter(t => t !== titleLine.text && !metaLine(t))].join('\n'));
    return { title, ingredients: parsed.ingredients, steps: parsed.steps, servings, prep, cook };
  }
  const ingredients = ingLines
    .filter(t => !metaLine(t) && t !== titleLine.text)
    .map(clean)
    .filter(t => t && !/:$/.test(t) && t.length <= 90);
  // Steps: join wrapped lines together again
  const steps = [];
  stepLines.filter(t => !metaLine(t)).forEach(raw => {
    const isNew = /^([-*•·▪►]|(schritt\s*)?\d+\s*[.):])/i.test(raw);
    const t = clean(raw);
    if (!t) return;
    const prev = steps[steps.length - 1];
    if (!prev || isNew || (/[.!?:]$/.test(prev) && /^[A-ZÄÖÜ]/.test(t))) steps.push(t);
    else if (/-$/.test(prev) && /^[a-zäöüß]/.test(t)) steps[steps.length - 1] = prev.slice(0, -1) + t;
    else steps[steps.length - 1] = prev + ' ' + t;
  });
  return { title, ingredients, steps, servings, prep, cook };
}
// Result quality, to compare two evaluations
function recipeImportScore(r) {
  if (!r) return 0;
  return (r.title ? 1 : 0) + Math.min(r.ingredients.length, 40) + Math.min(r.steps.length, 30) * 1.5
    - r.ingredients.filter(t => t.length > 80).length * 2;
}
// Scanned PDF (no text layer): render the pages as an image with pdf.js and read them with text recognition
async function recipeOcrPdfPages(file, maxPages, show) {
  const lib = await finLoadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const count = Math.min(doc.numPages, maxPages);
  clearTimeout(recipeOcrIdleTimer);
  let current = 1;
  recipeOcrProgress = (m) => {
    if (m && m.status === 'recognizing text') show(`⏳ Eingescannte PDF wird gelesen${count > 1 ? ` (Seite ${current}/${count})` : ''} … ${Math.round((m.progress || 0) * 100)} %`);
    else if (m && /loading language|loading tesseract|initializ/i.test(m.status || '')) show('⏳ Texterkennung wird geladen …');
  };
  const pages = [];
  try {
    const worker = await recipeOcrGetWorker();
    try { await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' }); } catch (e) { /* optional */ }
    for (let p = 1; p <= count; p++) {
      current = p;
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2200 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      let res;
      try { res = await worker.recognize(canvas, {}, { text: true, blocks: true }); }
      catch (e) { res = await worker.recognize(canvas); }
      pages.push(recipeOcrLines((res && res.data) || {}, p));
    }
  } finally {
    recipeOcrProgress = null;
    recipeOcrScheduleIdle();
    try { doc.destroy(); } catch (e) { /* ignore */ }
  }
  return pages;
}
/* ---------- Recipes with AI (Google Gemini) ----------
   If PINN_GEMINI_KEY is set on the server, the recipe popup shows the checkbox "Evaluate with
   AI" (remembered per device, on by default). Text, photos, PDF or a recipe link are then sent
   to /api/pinn/ki/rezept on your own server, which talks to Google Gemini - the app loads no
   foreign code and does not know the key. If the AI fails (offline, quota, no recipe
   recognised), pinn. evaluates on the device as before.
*/
const LS_RECIPE_KI = 'pinnRecipeKi';
const RECIPE_KI_MAX_PDF = 12 * 1024 * 1024;
let recipeKiStatus = null;         // { aktiv, modell } from the server
let recipeKiStatusPromise = null;
let recipeKiBusy = false;

function recipeKiLoadStatus() {
  recipeKiUpdateToggle();
  if (recipeKiStatus || recipeKiStatusPromise || !navigator.onLine) return recipeKiStatusPromise || Promise.resolve(recipeKiStatus);
  recipeKiStatusPromise = (async () => {
    try {
      const res = await apiFetch('/api/pinn/ki/status', { cache: 'no-store' });
      if (res.ok) recipeKiStatus = await res.json();
    } catch (e) { /* offline - try again later */ }
    recipeKiStatusPromise = null;
    recipeKiUpdateToggle();
    return recipeKiStatus;
  })();
  return recipeKiStatusPromise;
}
function recipeKiWanted() {
  try { return localStorage.getItem(LS_RECIPE_KI) !== '0'; } catch (e) { return true; }
}
function recipeKiEnabled() {
  return !!(recipeKiStatus && recipeKiStatus.aktiv && navigator.onLine && recipeKiWanted());
}
function recipeKiUpdateToggle() {
  const wrap = document.getElementById('recipeKiToggleWrap');
  const hint = document.getElementById('recipeKiHint');
  const box = document.getElementById('recipeKiToggle');
  const aktiv = !!(recipeKiStatus && recipeKiStatus.aktiv);
  if (wrap) wrap.style.display = aktiv ? 'flex' : 'none';
  if (box) box.checked = recipeKiWanted();
  if (hint) hint.style.display = aktiv && recipeKiWanted() ? '' : 'none';
  const ta = document.getElementById('importText');
  if (ta && !ta.dataset.basePlaceholder) ta.dataset.basePlaceholder = ta.placeholder;
  if (ta) ta.placeholder = aktiv && recipeKiWanted()
    ? 'Rezepttext einfügen – oder einen Link zu einer Rezeptseite, z. B.\nhttps://www.chefkoch.de/rezepte/…\n\n' + ta.dataset.basePlaceholder
    : ta.dataset.basePlaceholder;
}
(function initRecipeKiToggle() {
  const box = document.getElementById('recipeKiToggle');
  if (box) box.addEventListener('change', () => {
    try { localStorage.setItem(LS_RECIPE_KI, box.checked ? '1' : '0'); } catch (e) { /* ignore */ }
    recipeKiUpdateToggle();
  });
})();

function recipeKiShowInfo(text, isErr) {
  const info = document.getElementById('recipePdfInfo');
  if (!info) return;
  info.textContent = text;
  info.classList.toggle('text-red-500', !!isErr);
  info.classList.toggle('text-ink/50', !isErr);
  info.classList.remove('hidden');
}

function recipeKiReadBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || '').replace(/^data:[^,]*,/, ''));
    fr.onerror = () => reject(fr.error || new Error('Datei nicht lesbar'));
    fr.readAsDataURL(blob);
  });
}
async function recipeKiFilePart(file, mime) {
  return { mime: mime || file.type || 'application/octet-stream', daten: await recipeKiReadBase64(file), name: file.name || '' };
}
// Shrink the photo to max. 2000 px (long side) as JPEG - saves upload and quota, the
// text stays easy to read. If the image cannot be decoded (e.g. HEIC on a PC), the
// original is sent along as long as it is not too big.
async function recipeKiImagePart(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bild nicht lesbar'));
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Bild nicht umwandelbar');
    return { mime: 'image/jpeg', daten: await recipeKiReadBase64(blob), name: file.name || '' };
  } catch (e) {
    const t = String(file.type || '').toLowerCase();
    if (/^image\/(jpeg|png|webp|heic|heif)$/.test(t) && file.size <= 4 * 1024 * 1024) return recipeKiFilePart(file, t);
    throw e;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Take the AI result into the form (categories/devices only if the family has them)
function recipeKiApply(r) {
  document.getElementById('importText').value = '';
  document.getElementById('rTitle').value = r.title || document.getElementById('rTitle').value || 'Neues Rezept';
  document.getElementById('rIngredients').value = (r.ingredients || []).join('\n');
  document.getElementById('rSteps').value = (r.steps || []).join('\n');
  if (r.servings) setFormServings(r.servings);
  if (r.prepTime) document.getElementById('rPrep').value = r.prepTime;
  if (r.cookTime) document.getElementById('rCook').value = r.cookTime;
  const cats = (r.categories || []).map(n => recipeCategories.find(c => c.toLowerCase() === String(n).toLowerCase())).filter(Boolean);
  if (cats.length) { pendingRecipeCategories = [...new Set(cats)]; renderRecipeCategoriesPicker(); }
  const tools = (r.tools || []).map(n => kitchenTools.find(t => String(t.label || '').toLowerCase() === String(n).toLowerCase())).filter(Boolean).map(t => t.id);
  if (tools.length) { pendingRecipeTools = [...new Set([...pendingRecipeTools, ...tools])]; renderRecipeToolsPicker(); }
  if (r.bild && typeof r.bild === 'string' && r.bild.startsWith('data:image/') && !pendingRecipeImage) {
    pendingRecipeImage = r.bild;
    renderRecipeImagePreview();
  }
  const info = document.getElementById('recipePdfInfo');
  if (info) info.classList.add('hidden');
  setRecipeInputMode('strukturiert');
  checkIngredientsQuantityWarning();
}

// Sends text/files to the AI. true = form filled, false = please evaluate yourself.
async function recipeKiImport(payload, label) {
  if (recipeKiBusy) return false;
  recipeKiBusy = true;
  const analyzeBtn = document.getElementById('analyzeBtn');
  const saveBtn = document.getElementById('saveRecipeBtn');
  const btnLabel = analyzeBtn ? analyzeBtn.textContent : '';
  if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = '✨ KI liest …'; }
  if (saveBtn) saveBtn.disabled = true;
  const steps = ['✨ KI liest das Rezept …', '✨ Zutaten werden sortiert …', '✨ Zubereitung wird aufbereitet …', '✨ Fast fertig …'];
  let n = 0;
  recipeKiShowInfo(label === 'Rezeptseite' ? '✨ Rezeptseite wird geladen …' : steps[0]);
  const ticker = setInterval(() => { n = Math.min(n + 1, steps.length - 1); recipeKiShowInfo(steps[n]); }, 5000);
  try {
    const body = {
      text: payload.text || '',
      dateien: payload.dateien || [],
      kategorien: recipeCategories.filter(c => categoryActive[c] !== false),
      geraete: kitchenTools.filter(t => t.active !== false).map(t => t.label).filter(Boolean),
    };
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 150000) : null;
    let res;
    try {
      res = await apiFetch('/api/pinn/ki/rezept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
    } finally { if (timer) clearTimeout(timer); }
    let data = {};
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok || !data.rezept) throw new Error(data.error || ('Server-Fehler ' + res.status));
    const r = data.rezept;
    recipeKiApply(r);
    const parts = [`${r.ingredients.length} Zutat${r.ingredients.length === 1 ? '' : 'en'}`, `${r.steps.length} Schritt${r.steps.length === 1 ? '' : 'e'}`];
    if (r.servings) parts.push(`${r.servings} Portionen`);
    if (r.bild) parts.push('mit Bild');
    finShowToast('✨ Rezept per KI übernommen (' + parts.join(', ') + ') – bitte kurz prüfen.');
    return true;
  } catch (err) {
    const msg = err && err.name === 'AbortError' ? 'Die KI hat zu lange gebraucht.' : (err && err.message ? err.message : 'Unbekannter Fehler');
    console.warn('KI-Auswertung:', err);
    recipeKiShowInfo(label === 'Rezeptseite'
      ? 'Rezept-Link nicht eingelesen: ' + msg + ' Alternativ den Rezepttext kopieren und hier einfügen.'
      : 'KI nicht verfügbar: ' + msg + ' – pinn. wertet jetzt selbst aus …', true);
    if (label !== 'Rezeptseite') finShowToast('KI nicht verfügbar – pinn. wertet selbst aus.', true);
    return false;
  } finally {
    clearInterval(ticker);
    recipeKiBusy = false;
    if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = btnLabel || 'Text analysieren'; }
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function importRecipeFromPdf(file) {
  const info = document.getElementById('recipePdfInfo');
  const show = (text, isErr) => { info.textContent = text; info.classList.toggle('text-red-500', !!isErr); info.classList.toggle('text-ink/50', !isErr); info.classList.remove('hidden'); };
  if (!pinnIsPdfFile(file)) { show('Bitte eine PDF-Datei wählen.', true); return; }
  if (recipeKiEnabled() && file.size <= RECIPE_KI_MAX_PDF) {
    let part = null;
    try { part = await recipeKiFilePart(file, 'application/pdf'); } catch (e) { part = null; }
    if (part && await recipeKiImport({ dateien: [part] }, 'PDF')) return;
  }
  show('⏳ PDF wird ausgelesen …');
  let lines = [];
  try { lines = await pinnPdfLines(file, 6); }
  catch (err) { show(pinnPdfErrorText(err), true); return; }

  let r = null;
  let allText = '';
  let scanned = false;
  if (lines.filter(l => /[a-zäöü]{3}/i.test(l.text)).length < 3) {
    // No text layer (scanned/photographed) -> text recognition as with photos
    scanned = true;
    let pages;
    try { pages = await recipeOcrPdfPages(file, 6, show); }
    catch (err) { show(err && (err.code === 'noocr' || err.code === 'noocrdata') ? 'Die PDF ist eingescannt. ' + recipeOcrErrorText(err) : pinnPdfErrorText(err), true); return; }
    const res = recipeFromOcrPages(pages, { keepOrder: true });
    r = res.recipe;
    allText = res.lines.map(l => l.text).join('\n');
    if (res.lines.filter(l => /[a-zäöü]{3}/i.test(l.text)).length < 3) { show('In der PDF war kein lesbarer Text zu finden – bitte den Rezepttext selbst einfügen.', true); return; }
  } else {
    // Same evaluator as for photos (headings, subheadings, numbering, quantities);
    // for safety also the previous PDF evaluator - the better result wins.
    const noise = /(©|copyright|alle rechte|^seite\s+\d+|^\d+\s*(\/|von)\s*\d+$|^\d+$|^\d{1,2}\.\d{1,2}\.\d{2,4}(,?\s*\d{1,2}:\d{2})?$)/i;
    const byPage = new Map();
    lines.forEach(l => {
      if (noise.test(l.text)) return;
      if (!byPage.has(l.page)) byPage.set(l.page, []);
      byPage.get(l.page).push({ text: l.text, size: l.size, page: l.page, x0: typeof l.x0 === 'number' ? l.x0 : null, y0: null, y1: null, conf: null });
    });
    const pages = [...byPage.keys()].sort((a, b) => a - b).map(k => byPage.get(k));
    let rNew = null, rOld = null;
    try { rNew = recipeFromOcrPages(pages, { keepOrder: true }).recipe; } catch (e) { console.warn('PDF-Auswertung (neu):', e); }
    try { rOld = recipeFromPdfLines(lines); } catch (e) { console.warn('PDF-Auswertung (alt):', e); }
    r = recipeImportScore(rNew) >= recipeImportScore(rOld) ? rNew : rOld;
    allText = lines.map(l => l.text).join('\n');
  }

  if (!r || (!r.ingredients.length && !r.steps.length)) {
    // Nothing usable recognised: put the text into the free-text field for reworking
    document.getElementById('importText').value = allText;
    show('Zutaten und Zubereitung waren nicht eindeutig – der Text steht jetzt oben im Feld, bitte kurz aufräumen und „Text analysieren“ tippen.', true);
    return;
  }
  document.getElementById('importText').value = '';
  document.getElementById('rTitle').value = r.title || 'Importiertes Rezept';
  document.getElementById('rIngredients').value = r.ingredients.join('\n');
  document.getElementById('rSteps').value = r.steps.join('\n');
  if (r.servings) setFormServings(r.servings);
  if (r.prep) document.getElementById('rPrep').value = r.prep;
  if (r.cook) document.getElementById('rCook').value = r.cook;
  info.classList.add('hidden');
  setRecipeInputMode('strukturiert');
  checkIngredientsQuantityWarning();
  const parts = [`${r.ingredients.length} Zutat${r.ingredients.length === 1 ? '' : 'en'}`, `${r.steps.length} Schritt${r.steps.length === 1 ? '' : 'e'}`];
  if (r.servings) parts.push(`${r.servings} Portionen`);
  finShowToast('✨ Rezept aus der ' + (scanned ? 'eingescannten ' : '') + 'PDF übernommen (' + parts.join(', ') + ') – bitte kurz prüfen.');
}
(function initPdfAutofill() {
  const inp = document.getElementById('recipePdfInput');
  if (inp) inp.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importRecipeFromPdf(f);
  });
})();

/* ---------- Recipes from photos (text recognition / OCR) ----------
   Photo(s) of a recipe (cookbook, magazine, recipe card, screenshot) are read directly on the
   device with Tesseract.js - no image leaves the device, no code from foreign servers.
   Tesseract is self-hosted under pb_public/vendor/tesseract/ and only loaded with the first photo;
   Tesseract then caches the language file on the device (IndexedDB).
   The recognised lines (with text height for title detection) go through the same evaluator
   as the PDF import (recipeFromPdfLines). Several photos = several pages, in selection order. */
const RECIPE_OCR_BASE = 'vendor/tesseract/';
let recipeOcrLibPromise = null;
let recipeOcrWorkerPromise = null;
let recipeOcrProgress = null;   // current progress callback (the logger is fixed to the worker)
let recipeOcrIdleTimer = null;

function recipeOcrLoadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => { el.remove(); reject(new Error('Laden fehlgeschlagen: ' + src)); };
    document.head.appendChild(el);
  });
}
function recipeOcrLoadLib() {
  if (window.Tesseract && window.Tesseract.createWorker) return Promise.resolve(window.Tesseract);
  if (recipeOcrLibPromise) return recipeOcrLibPromise;
  recipeOcrLibPromise = (async () => {
    for (const src of [RECIPE_OCR_BASE + 'tesseract.min.js', 'vendor/tesseract.min.js']) {
      try { await recipeOcrLoadScript(src); if (window.Tesseract && window.Tesseract.createWorker) return window.Tesseract; }
      catch (e) { /* try the next path */ }
    }
    const err = new Error('Tesseract fehlt');
    err.code = 'noocr';
    throw err;
  })();
  recipeOcrLibPromise.catch(() => { recipeOcrLibPromise = null; });
  return recipeOcrLibPromise;
}
function recipeOcrGetWorker() {
  if (recipeOcrWorkerPromise) return recipeOcrWorkerPromise;
  recipeOcrWorkerPromise = (async () => {
    const T = await recipeOcrLoadLib();
    const abs = (rel) => new URL(rel, location.href).href;
    try {
      return await T.createWorker('deu', 1, {
        workerPath: abs(RECIPE_OCR_BASE + 'worker.min.js'),
        corePath: abs(RECIPE_OCR_BASE + 'core'),
        langPath: abs(RECIPE_OCR_BASE + 'lang'),
        workerBlobURL: false,
        gzip: true,
        logger: (m) => { if (recipeOcrProgress) recipeOcrProgress(m); },
      });
    } catch (e) {
      const err = new Error('Tesseract-Worker: ' + (e && e.message ? e.message : e));
      err.code = 'noocrdata';
      throw err;
    }
  })();
  recipeOcrWorkerPromise.catch(() => { recipeOcrWorkerPromise = null; });
  return recipeOcrWorkerPromise;
}
// After 2 minutes without a photo, end the worker - saves memory on the phone
function recipeOcrScheduleIdle() {
  clearTimeout(recipeOcrIdleTimer);
  recipeOcrIdleTimer = setTimeout(async () => {
    const pr = recipeOcrWorkerPromise;
    recipeOcrWorkerPromise = null;
    if (pr) { try { (await pr).terminate(); } catch (e) { /* ignore */ } }
  }, 120000);
}
function recipeOcrErrorText(err) {
  if (err && err.code === 'noocr') return 'Foto-Erkennung nicht möglich: Tesseract fehlt auf dem NAS (pb_public/vendor/tesseract/tesseract.min.js).';
  if (err && err.code === 'noocrdata') return 'Foto-Erkennung nicht möglich: Dateien der Texterkennung unvollständig (pb_public/vendor/tesseract/worker.min.js, core/ und lang/deu.traineddata.gz).';
  if (err && err.code === 'noimage') return 'Das Foto ließ sich nicht öffnen – bitte als JPG/PNG oder direkt mit der Kamera aufnehmen.';
  return 'Foto konnte nicht gelesen werden: ' + (err && err.message ? err.message : err);
}
// Shrink/enlarge the photo to an easily readable size, greyscale + a bit more contrast
async function recipeOcrPrepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => { const e = new Error('Bild'); e.code = 'noimage'; reject(e); };
      i.src = url;
    });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const long = Math.max(w0, h0) || 1;
    let scale = 1;
    if (long > 2400) scale = 2400 / long;
    else if (long < 1400) scale = Math.min(2, 1400 / long);
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        g = (g - 128) * 1.35 + 128;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(data, 0, 0);
    } catch (e) { /* continue without preparation */ }
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
// Lines from the Tesseract result (v5: data.lines, v6: data.blocks -> paragraphs -> lines),
// with position (x0/y0/y1) and confidence - the evaluator needs the position for headings,
// the status bar and for joining several screenshots.
function recipeOcrLines(data, page) {
  let raw = Array.isArray(data.lines) ? data.lines.slice() : [];
  if (!raw.length && Array.isArray(data.blocks)) {
    data.blocks.forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => raw.push(l))));
  }
  let out = raw.map(l => ({
    text: String(l.text || '').replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim(),
    x0: l.bbox ? l.bbox.x0 : null,
    y0: l.bbox ? l.bbox.y0 : null,
    y1: l.bbox ? l.bbox.y1 : null,
    size: l.bbox ? Math.max(0, l.bbox.y1 - l.bbox.y0) : 0,
    conf: typeof l.confidence === 'number' ? l.confidence : null,
    page,
  }));
  if (!out.length && data.text) {
    out = String(data.text).split('\n').map(t => ({ text: t.replace(/\s+/g, ' ').trim(), x0: null, y0: null, y1: null, size: 0, conf: null, page }));
  }
  return out.filter(l => l.text);
}

// Smooth out typical OCR mix-ups, remove web addresses/decoration
function recipeOcrFixText(t) {
  return String(t)
    .replace(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:de|com|at|ch|net|org|eu|info)(?:\/\S*)?\b/gi, ' ')
    .replace(/^[«»"'`„“]+\s*/, '')
    .replace(/(\d)\s+9\b(?=\s+[A-ZÄÖÜ])/g, '$1 g')      // "250 9 Mehl" -> "250 g Mehl" (flour)
    .replace(/(\d)g\b/g, '$1 g')
    .replace(/(\d)\s*ml\b/gi, '$1 ml')
    .replace(/\s*[—–_=~-]{3,}\s*$/, '')                // Divider lines after headings
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const RECIPE_OCR_ING_HEAD = /^(zutaten(liste)?|einkaufsliste|du brauchst|das brauchst du|was du brauchst|ingredients)\b[\s:]*(f[üu]r\b.*)?$/i;
const RECIPE_OCR_STEP_HEAD = /^(zubereitung|anleitung(en)?|so geht'?s|und so geht'?s|so wird'?s gemacht|arbeitsschritte|schritte|methode|zubereitungsschritte|instructions)\b[\s:]*$/i;
const RECIPE_OCR_FOOTER = /^(gefällt dir|gefallt dir|speichere es|merkliste|merken\b|.*\bsterne\b.*:\)|keywords?\b|schlagw|kommentar|rezept drucken|drucken$|teilen$|jetzt bewerten|das könnte dir|das konnte dir|ähnliche rezepte|ahnliche rezepte|newsletter|werbung|anzeige)/i;
const RECIPE_OCR_NOISE = /^(kleiner|normal|größer|grosser|groBer)(\s+(kleiner|normal|größer|grosser|groBer))*$/i;

// Comparison key and similarity (bigram Dice) - robust against single misread letters
function recipeOcrKey(t) {
  return String(t).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'b').replace(/[^a-z0-9]/g, '');
}
function recipeOcrSimilar(a, b) {
  const x = recipeOcrKey(a), y = recipeOcrKey(b);
  if (x.length < 6 || y.length < 6) return x === y && x.length > 0;
  if (x === y) return true;
  const short = x.length < y.length ? x : y, long = short === x ? y : x;
  if (short.length >= 14 && long.includes(short)) return true;
  const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const gx = grams(x), gy = grams(y);
  let hit = 0;
  gx.forEach((n, g) => { hit += Math.min(n, gy.get(g) || 0); });
  return (2 * hit) / (x.length + y.length - 2) >= 0.8;
}

// Clean up one page: status bar (clock at the top) with everything above it, footer area (save, keywords …),
// uncertain fragments and web addresses removed.
function recipeOcrCleanPage(lines) {
  let ls = lines.slice();
  const bar = ls.slice(0, 6).find(l => /^\d{1,2}[:.]\d{2}\b/.test(l.text) && l.y1 !== null);
  if (bar) {
    const limit = bar.y1 + 4;
    ls = ls.filter(l => l === bar ? false : (l.y0 === null || l.y0 > limit));
  }
  // Only cut off the footer area if it really is at the bottom (after the steps or in the lower half)
  const firstStep = ls.findIndex(l => /^(schritt\s*)?\d{1,2}\s*[.):]\s+[A-ZÄÖÜ]/.test(l.text) || RECIPE_OCR_STEP_HEAD.test(recipeOcrFixText(l.text)));
  const footIdx = ls.findIndex((l, i) => (i > ls.length * 0.4 || (firstStep >= 0 && i > firstStep)) && RECIPE_OCR_FOOTER.test(recipeOcrFixText(l.text)));
  if (footIdx >= 0) ls = ls.slice(0, footIdx);
  return ls
    .map(l => ({ ...l, text: recipeOcrFixText(l.text) }))
    .filter(l => l.text && /[a-zäöüß]{2}|\d/i.test(l.text)
      && !RECIPE_OCR_NOISE.test(l.text)
      && !(l.conf !== null && l.conf < 45)
      && !(l.conf !== null && l.conf < 70 && l.text.length < 12));
}

// Join several photos/screenshots into one text:
// 1. page with title/"Zutaten" (ingredients) first (no matter in which order they were selected)
// 2. take overlapping areas (screenshots scroll on) only once
function recipeOcrMergePages(pages, opts = {}) {
  const clean = pages.map(recipeOcrCleanPage).filter(p => p.length);
  if (!clean.length) return [];
  if (opts.keepOrder) {
    // PDF: pages are already sorted correctly; take recurring header/footer lines only once
    const onPages = new Map();
    clean.forEach((p, pi) => new Set(p.map(l => recipeOcrKey(l.text))).forEach(k => { if (!onPages.has(k)) onPages.set(k, new Set()); onPages.get(k).add(pi); }));
    const seen = new Set();
    const out = [];
    clean.forEach(p => p.forEach(l => {
      const k = recipeOcrKey(l.text);
      if (clean.length > 1 && k.length >= 4 && onPages.get(k).size > 1) { if (seen.has(k)) return; seen.add(k); }
      out.push(l);
    }));
    return out;
  }
  const score = p => {
    const i = p.findIndex(l => RECIPE_OCR_ING_HEAD.test(l.text));
    return i >= 0 ? 2 : (p.some(l => RECIPE_OCR_STEP_HEAD.test(l.text)) ? 1 : 0);
  };
  let rest = clean.map((p, i) => ({ p, i, s: score(p) }));
  rest.sort((a, b) => b.s - a.s || a.i - b.i);
  let merged = rest.shift().p.slice();
  while (rest.length) {
    // Next page: the one with the best overlap with the current end, otherwise selection order
    let best = null;
    rest.forEach((cand, ci) => {
      const tail = merged.slice(-40);
      let firstB = -1, lastB = -1, firstA = -1, misses = 0, hits = 0;
      for (let b = 0; b < cand.p.length; b++) {
        const a = tail.findIndex(l => recipeOcrSimilar(l.text, cand.p[b].text));
        if (a >= 0) {
          if (firstB < 0) { firstB = b; firstA = merged.length - tail.length + a; }
          lastB = b; hits++; misses = 0;
        } else if (firstB >= 0 && ++misses >= 3) break;
        else if (firstB < 0 && b >= 6) break;
      }
      const ok = hits >= 2;
      if (!best || (ok && (!best.ok || hits > best.hits))) best = { ci, ok, hits, firstA, firstB };
    });
    const cand = rest.splice(best.ci, 1)[0];
    if (best.ok) merged = merged.slice(0, best.firstA).concat(cand.p.slice(best.firstB)); // the new page replaces the (possibly cut off) end
    else merged = merged.concat(cand.p);
  }
  return merged;
}

function recipeFromOcrPages(pages, opts = {}) {
  const lines = recipeOcrMergePages(pages, opts);
  if (!lines.length) return { lines, recipe: null };
  const texts = lines.map(l => l.text);
  const allText = texts.join('\n');
  const isIngHead = t => RECIPE_OCR_ING_HEAD.test(t);
  const isStepHead = t => RECIPE_OCR_STEP_HEAD.test(t);
  const metaLine = t => /^(portionen|personen|schwierigkeit|kalorien|kcal|nährwerte|pro portion|brennwert|eiweiß|fett|kohlenhydrate|gesamtzeit|arbeitszeit|vorbereitung|vorbereitungszeit|zubereitungszeit|kochzeit|backzeit|garzeit|ruhezeit|wartezeit)\b/i.test(t)
    || (/(arbeitszeit|kochzeit|backzeit|zubereitungszeit|vorbereitungszeit|gesamtzeit|ruhezeit|garzeit)/i.test(t) && RECIPE_PDF_TIME.test(t) && t.length < 90);

  const iIdx = texts.findIndex(isIngHead);
  let sIdx = texts.findIndex((t, i) => isStepHead(t) && i > iIdx);
  if (sIdx < 0) sIdx = texts.findIndex(isStepHead);

  // Title: largest font before the ingredients (or in the first lines)
  const headEnd = iIdx > 0 ? iIdx : Math.min(lines.length, 8);
  const titleCands = lines.slice(0, headEnd).filter(l => /[a-zäöüß]{3}/i.test(l.text) && !metaLine(l.text) && !/^\d+\s*[.)]/.test(l.text));
  let titleLine = titleCands[0] || null;
  titleCands.forEach(l => { if (l.size > titleLine.size * 1.15) titleLine = l; });
  const title = titleLine ? titleLine.text.replace(/\s*[-–|]\s*(chefkoch|rezept).*$/i, '').slice(0, 120) : '';

  // Servings & times
  let servings = 0;
  const sv = /(?:für|ergibt|reicht für|zutaten für)\s*(\d{1,2})\s*(?:personen|portionen|pers\.?|port\.?|stück|stk\.?)/i.exec(allText)
    || /(\d{1,2})\s*(?:personen|portionen)\b/i.exec(allText)
    || /(?:portionen|personen)\s*:?\s*(\d{1,2})\b/i.exec(allText);
  if (sv) servings = Math.max(1, Math.min(40, Number(sv[1]) || 0));
  let prep = 0, cook = 0;
  texts.forEach(t => {
    t.split(/(?=arbeitszeit|vorbereitung|zubereitungszeit|kochzeit|backzeit|garzeit|ruhezeit|gesamtzeit)/i).forEach(p => {
      if (!prep && /^(arbeitszeit|vorbereitung|vorbereitungszeit|zubereitungszeit|aktive zeit)/i.test(p)) prep = recipePdfMinutes(p);
      else if (!cook && /^(kochzeit|backzeit|garzeit)/i.test(p)) cook = recipePdfMinutes(p);
    });
  });

  // Determine the areas
  let ingPart = [], stepPart = [];
  const after = (i) => lines.slice(i + 1);
  if (iIdx >= 0 && sIdx >= 0) {
    if (iIdx < sIdx) { ingPart = lines.slice(iIdx + 1, sIdx); stepPart = after(sIdx); }
    else { stepPart = lines.slice(sIdx + 1, iIdx); ingPart = after(iIdx); }
  } else if (iIdx >= 0) {
    // No "Zubereitung" (preparation) heading: ingredients end at the first numbered step / long sentence
    const r = after(iIdx);
    const cut = r.findIndex(l => /^\d{1,2}\s*[.)]\s+[A-ZÄÖÜ]/.test(l.text) || (l.text.length > 60 && /[.!]$/.test(l.text)));
    ingPart = cut >= 0 ? r.slice(0, cut) : r;
    stepPart = cut >= 0 ? r.slice(cut) : [];
  } else if (sIdx >= 0) {
    ingPart = lines.slice(0, sIdx).filter(l => l !== titleLine);
    stepPart = after(sIdx);
  } else {
    const parsed = parseRecipeText(texts.filter(t => !metaLine(t)).join('\n'));
    return { lines, recipe: { title: title || parsed.title, ingredients: parsed.ingredients, steps: parsed.steps, servings, prep, cook } };
  }

  // Ingredients: remove bullet characters (also misread as "e", "¢", "o"), skip subheadings
  // ("Für die Brühe", "Für den Teig:" – for the broth, for the dough). Decimal quantities like "4.5-6" are left untouched.
  const bullet = /^([-*•·▪►✓☐□°¢©®]|[eoc](?=\s+[\dA-ZÄÖÜ½¼¾]))\s*/;
  const ingredients = [];
  const bulletX = ingPart.filter(l => bullet.test(l.text) && l.x0 !== null).map(l => l.x0);
  const ingX = bulletX.length ? Math.min(...bulletX) : null;
  ingPart.forEach(l => {
    const raw = l.text;
    if (metaLine(raw)) return;
    const hasBullet = bullet.test(raw);
    const t = raw.replace(bullet, '').trim();
    if (!t) return;
    const isSub = !hasBullet && (/:$/.test(t) || /^f(ü|u|i)r\s+(die|den|das|dich|\d)?/i.test(t) || (ingX !== null && l.x0 !== null && l.x0 < ingX - 12 && !/\d/.test(t)));
    if (isSub) return;
    // Line break within an ingredient (indented, without a bullet, starting in lower case)
    const prev = ingredients[ingredients.length - 1];
    if (prev && !hasBullet && ingX !== null && l.x0 !== null && l.x0 > ingX + 12 && /^[a-zäöü(]/.test(t)) { ingredients[ingredients.length - 1] = prev + ' ' + t; return; }
    if (t.length <= 110) ingredients.push(t);
  });

  // Steps: with numbered instructions only split at the numbers; subheadings
  // ("Dann das Frikassee kochen" – then cook the fricassee) are further left than the numbers and are skipped.
  const numRe = /^(schritt\s*)?(\d{1,2})\s*[.):]\s+(?=\S)/i;
  const numbered = stepPart.filter(l => numRe.test(l.text));
  const numX = numbered.filter(l => l.x0 !== null).map(l => l.x0);
  const minNumX = numX.length ? Math.min(...numX) : null;
  const steps = [];
  stepPart.forEach((l, idx) => {
    const raw = l.text.replace(/^[-*•·▪►]\s*/, '');
    if (!raw || metaLine(raw)) return;
    const isNum = numRe.test(raw);
    const t = raw.replace(numRe, '').trim();
    if (!t) return;
    const prev = steps[steps.length - 1];
    if (numbered.length >= 2) {
      if (!isNum) {
        const next = stepPart[idx + 1];
        const leftOfNumbers = minNumX !== null && l.x0 !== null && l.x0 < minNumX - 8;
        const headingLike = !/[.!?,;]$/.test(t) && t.length < 70 && (!next || numRe.test(next.text));
        if (leftOfNumbers || (!prev && headingLike) || (headingLike && /[.!?]$/.test(prev || '') && l.x0 === null)) return; // Subheading
      }
      if (isNum || !prev) steps.push(t);
      else if (/-$/.test(prev) && /^[a-zäöüß]/.test(t)) steps[steps.length - 1] = prev.slice(0, -1) + t;
      else steps[steps.length - 1] = prev + ' ' + t;
      return;
    }
    const isNew = isNum || /^[-*•·▪►]/.test(l.text);
    if (!prev || isNew || (/[.!?:]$/.test(prev) && /^[A-ZÄÖÜ]/.test(t))) steps.push(t);
    else if (/-$/.test(prev) && /^[a-zäöüß]/.test(t)) steps[steps.length - 1] = prev.slice(0, -1) + t;
    else steps[steps.length - 1] = prev + ' ' + t;
  });

  return { lines, recipe: { title, ingredients, steps, servings, prep, cook } };
}

async function importRecipeFromPhotos(files) {
  const info = document.getElementById('recipePdfInfo');
  const show = (text, isErr) => { info.textContent = text; info.classList.toggle('text-red-500', !!isErr); info.classList.toggle('text-ink/50', !isErr); info.classList.remove('hidden'); };
  const images = [...files].filter(f => f && (/^image\//i.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name || ''))).slice(0, 6);
  if (!images.length) { show('Bitte ein Foto wählen.', true); return; }
  if (recipeKiEnabled()) {
    show(`⏳ Foto${images.length > 1 ? 's werden' : ' wird'} vorbereitet …`);
    const parts = [];
    for (const img of images) {
      try { const part = await recipeKiImagePart(img); if (part) parts.push(part); } catch (e) { /* then without this photo */ }
    }
    if (parts.length === images.length && await recipeKiImport({ dateien: parts }, images.length > 1 ? 'Fotos' : 'Foto')) return;
  }
  if (!navigator.onLine && !recipeOcrWorkerPromise && !(window.Tesseract && window.Tesseract.createWorker)) {
    show('Für die erste Foto-Erkennung wird die Verbindung zum NAS gebraucht (Texterkennung laden).', true);
    return;
  }
  clearTimeout(recipeOcrIdleTimer);
  show('⏳ Texterkennung wird vorbereitet …');
  let worker;
  let current = 1;
  recipeOcrProgress = (m) => {
    if (!m) return;
    const pageInfo = images.length > 1 ? ` (Foto ${current}/${images.length})` : '';
    if (m.status === 'recognizing text') show(`⏳ Text wird erkannt${pageInfo} … ${Math.round((m.progress || 0) * 100)} %`);
    else if (/loading language|loading tesseract|initializ/i.test(m.status || '')) show('⏳ Texterkennung wird geladen …');
  };
  const pages = [];
  try {
    worker = await recipeOcrGetWorker();
    try { await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' }); } catch (e) { /* optional */ }
    for (let i = 0; i < images.length; i++) {
      current = i + 1;
      show(`⏳ Foto ${images.length > 1 ? current + '/' + images.length + ' ' : ''}wird vorbereitet …`);
      const canvas = await recipeOcrPrepareImage(images[i]);
      let res;
      try { res = await worker.recognize(canvas, {}, { text: true, blocks: true }); }
      catch (e) { res = await worker.recognize(canvas); }
      pages.push(recipeOcrLines((res && res.data) || {}, i + 1));
    }
  } catch (err) {
    recipeOcrProgress = null;
    show(recipeOcrErrorText(err), true);
    return;
  }
  recipeOcrProgress = null;
  recipeOcrScheduleIdle();

  const { lines, recipe: r } = recipeFromOcrPages(pages);
  if (lines.filter(l => /[a-zäöü]{3}/i.test(l.text)).length < 3) {
    show('Auf dem Foto war kaum Text zu erkennen – bitte gerade, scharf und bei gutem Licht fotografieren.', true);
    return;
  }
  if (!r || (!r.ingredients.length && !r.steps.length)) {
    document.getElementById('importText').value = lines.map(l => l.text).join('\n');
    show('Zutaten und Zubereitung waren nicht eindeutig – der erkannte Text steht jetzt oben im Feld, bitte kurz aufräumen und „Text analysieren“ tippen.', true);
    return;
  }
  document.getElementById('importText').value = '';
  document.getElementById('rTitle').value = r.title || 'Rezept vom Foto';
  document.getElementById('rIngredients').value = r.ingredients.join('\n');
  document.getElementById('rSteps').value = r.steps.join('\n');
  if (r.servings) setFormServings(r.servings);
  if (r.prep) document.getElementById('rPrep').value = r.prep;
  if (r.cook) document.getElementById('rCook').value = r.cook;
  info.classList.add('hidden');
  setRecipeInputMode('strukturiert');
  checkIngredientsQuantityWarning();
  const parts = [`${r.ingredients.length} Zutat${r.ingredients.length === 1 ? '' : 'en'}`, `${r.steps.length} Schritt${r.steps.length === 1 ? '' : 'e'}`];
  if (r.servings) parts.push(`${r.servings} Portionen`);
  finShowToast('✨ Rezept vom Foto übernommen (' + parts.join(', ') + ') – bitte kurz prüfen, Texterkennung kann sich vertun.');
}
(function initPhotoAutofill() {
  const inp = document.getElementById('recipePhotoInput');
  if (inp) inp.addEventListener('change', (e) => {
    const files = e.target.files ? [...e.target.files] : [];
    e.target.value = '';
    if (files.length) importRecipeFromPhotos(files);
  });
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('pdflesen');
