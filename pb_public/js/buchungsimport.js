/* pinn. – Import income and expenses from a bank file (js/buchungsimport.js, since 1.162.0)
   Classic script, no build step: loaded after js/finanzen.js; it reuses the CSV helpers of js/sparen.js
   (finCsvParse, finDetectDelim, finImportNum, finImportDate, finNormHeader, finHashId) and the booking queue of
   js/finanzen.js (finQueueRead, finQueueWrite, rebuildAusgaben, finFlushQueue).
   What it does:
   - A small button next to "+ Transaction" (Expenses tab) opens a popup. The person chooses a CSV file of the bank
     (e.g. ING "Umsatzanzeige" as CSV, DKB, N26, Sparkasse, or any table with date, amount and text).
   - Separator, header row, encoding and the columns (date, payee, purpose, amount or debit / credit) are detected;
     the columns can be changed. A negative amount is an expense, a positive one is income (switchable).
   - A preview lists every row with a tick box and a category. The category is suggested from the payee: first from
     what the family booked before and chose in earlier imports, then from a few common keywords.
   - The ID of a booking is built from the row itself, so importing the same file (or an overlapping one) again
     never creates a booking twice; known rows are shown as "already there".
   - Nothing leaves the device except the normal booking sync; the file itself is not stored. */

var BIMP_RULES_KEY = 'pinn.buchimport.regeln';
var BIMP_MAX_ROWS = 3000;
var BIMP_FIELDS = [
  { id: 'date', re: /^(buchungstag|buchungsdatum|buchung|datum|date|booking date|bookingdate|transaktionsdatum|umsatzdatum|valuta|wertstellung)/ },
  { id: 'payee', re: /(auftraggeber|empf(ä|ae)nger|zahlungspflichtiger|zahlungsempf|beg(ü|ue)nstigter|payee|counterparty|name zahlungs|partner|beneficiary)/ },
  { id: 'purpose', re: /(verwendungszweck|zweck|beschreibung|description|reference|memo|details|buchungstext|text)/ },
  { id: 'amount', re: /^(betrag|amount|umsatz|wert|summe)(?!.*(w(ä|ae)hrung|currency))/ },
  { id: 'debit', re: /^(soll|debit|ausgang|belastung|ausgabe)/ },
  { id: 'credit', re: /^(haben|credit|eingang|gutschrift|einnahme)/ },
];
// Keywords (lower case) -> category id; only used when the category exists and is active
var BIMP_KEYWORDS = [
  ['lebensmittel', /(rewe|edeka|lidl|aldi|kaufland|netto|penny|tegut|globus|norma|bäckerei|baeckerei|metzger|marktkauf|denn's|alnatura)/],
  ['drogerie', /(\bdm\b|dm-drogerie|rossmann|müller drogerie|mueller drogerie)/],
  ['gesundheit', /(apotheke|arzt|zahnarzt|praxis|klinik|optiker|fielmann)/],
  ['mobilitaet', /(tankstelle|aral|shell|esso|total|jet |bahn|db vertrieb|flixbus|parkhaus|parken|adac|kfz|sixt|uber|bvg|mvv|hvv|rmv)/],
  ['essen_gehen', /(restaurant|lieferando|pizza|mcdonald|burger|café|cafe|bistro|starbucks|imbiss|wolt)/],
  ['abos', /(netflix|spotify|disney|amazon prime|prime video|apple\.com|google|telekom|vodafone|o2|1&1|congstar|dazn|youtube|rundfunk|ard zdf)/],
  ['versicherungen', /(versicherung|allianz|huk|axa|ergo|debeka|signal iduna|haftpflicht)/],
  ['haushalt', /(ikea|obi|hornbach|bauhaus|toom|stadtwerke|strom|gas |wasser|vattenfall|eon|e\.on|miete|hausverwaltung)/],
  ['freizeit', /(kino|theater|schwimmbad|fitness|sportverein|verein|museum|zoo|freizeitpark)/],
  ['kleidung', /(h&m|zara|c&a|zalando|about you|primark|deichmann|decathlon)/],
  ['einkommen', /(gehalt|lohn|besoldung|rente|kindergeld|erstattung|steuererstattung)/],
];
var bimp = null; // current import: { fileName, rows, headerIdx, header, map, flip, items[], skip: Set }

function bimpRules() {
  try { const r = JSON.parse(localStorage.getItem(BIMP_RULES_KEY) || '{}'); return (r && typeof r === 'object') ? r : {}; } catch (e) { return {}; }
}
function bimpKey(payee) {
  return String(payee || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim().slice(0, 28);
}
// payee key -> category id, learned from the existing bookings (newest wins) and from earlier imports
function bimpLearned() {
  const map = {};
  (ausgaben || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(e => {
    const k = bimpKey(e.title || e.store);
    if (k && e.category && e.category !== FIN_SAVINGS_CATEGORY) map[k] = e.category;
  });
  return Object.assign(map, bimpRules());
}
function bimpGuessCategory(payee, purpose, isIncome, learned) {
  const active = finActiveCategories().map(c => c.id);
  const k = bimpKey(payee);
  if (k && learned[k] && active.includes(learned[k])) return learned[k];
  if (isIncome) return active.includes(FIN_INCOME_CATEGORY) ? FIN_INCOME_CATEGORY : finDefaultExpenseCategory();
  const text = (String(payee) + ' ' + String(purpose)).toLowerCase();
  for (const [cat, re] of BIMP_KEYWORDS) {
    if (cat !== FIN_INCOME_CATEGORY && active.includes(cat) && re.test(text)) return cat;
  }
  return finDefaultExpenseCategory();
}

function bimpAutoMap(header) {
  const norm = header.map(finNormHeader);
  const map = {}; const used = new Set();
  BIMP_FIELDS.forEach(f => {
    let idx = -1;
    if (f.id === 'purpose') {
      // the real purpose text wins over the kind of booking (ING: "Buchungstext" = "Lastschrift")
      for (const part of ['verwendungszweck|zweck', 'beschreibung|description|reference|memo|details', 'buchungstext|text']) {
        idx = norm.findIndex((h, i) => !used.has(i) && h && h.length < 60 && new RegExp(part).test(h));
        if (idx >= 0) break;
      }
    } else {
      idx = norm.findIndex((h, i) => !used.has(i) && h && h.length < 60 && f.re.test(h));
    }
    if (idx >= 0) { map[f.id] = idx; used.add(idx); } else map[f.id] = -1;
  });
  return map;
}
function bimpFindHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const norm = rows[i].map(finNormHeader);
    const hasDate = norm.some(h => h && h.length < 40 && BIMP_FIELDS[0].re.test(h));
    const hasAmount = norm.some(h => h && h.length < 40 && (BIMP_FIELDS[3].re.test(h) || BIMP_FIELDS[4].re.test(h) || BIMP_FIELDS[5].re.test(h)));
    if (hasDate && hasAmount && !rows[i].some(c => /\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(c))) return i;
  }
  return -1;
}

// Evaluate the rows with the current column assignment
function bimpBuild() {
  const b = bimp, m = b.map;
  const col = (r, k) => (m[k] >= 0 ? (r[m[k]] || '') : '');
  const known = new Set((ausgaben || []).map(x => x.id));
  const learned = bimpLearned();
  const seen = {};
  const items = [];
  let skipped = 0;
  b.rows.slice(b.headerIdx + 1, b.headerIdx + 1 + BIMP_MAX_ROWS).forEach((r, i) => {
    const date = finImportDate(col(r, 'date'));
    let v = finImportNum(col(r, 'amount'));
    if (!isFinite(v) && (m.debit >= 0 || m.credit >= 0)) {
      const d = finImportNum(col(r, 'debit')), c = finImportNum(col(r, 'credit'));
      if (isFinite(c) && c !== 0) v = Math.abs(c);
      else if (isFinite(d) && d !== 0) v = -Math.abs(d);
    }
    if (!date || !isFinite(v) || v === 0) { skipped++; return; }
    if (b.flip) v = -v;
    const amount = finRound(-v); // pinn.: expense positive, income negative
    if (Math.abs(amount) > 1000000) { skipped++; return; }
    const payee = String(col(r, 'payee')).replace(/\s+/g, ' ').trim().slice(0, 100);
    const purpose = String(col(r, 'purpose')).replace(/\s+/g, ' ').trim().slice(0, 300);
    const base = [date, amount.toFixed(2), payee, purpose].join('|');
    seen[base] = (seen[base] || 0) + 1;
    const id = ('b' + finHashId(base + '#' + seen[base]).slice(1) + '000000000000000').replace(/[^a-z0-9]/g, 'x').slice(0, 15);
    const prev = b.items && b.items.find(x => x.id === id);
    items.push({
      idx: i, id, date, amount, payee, purpose, dup: known.has(id),
      category: prev ? prev.category : bimpGuessCategory(payee || purpose, purpose, amount < 0, learned),
    });
  });
  b.items = items;
  b.skipped = skipped;
  if (!b.skip) b.skip = new Set();
}

async function bimpReadFile(file) {
  const errEl = document.getElementById('bimpError');
  errEl.classList.add('hidden');
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { errEl.textContent = tk('depot.fileTooLargeMax'); errEl.classList.remove('hidden'); return; }
  document.getElementById('bimpFileLabel').textContent = file.name;
  const buf = await file.arrayBuffer();
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
  text = text.replace(/^﻿/, '');
  const rows = finCsvParse(text, finDetectDelim(text));
  if (rows.length < 2) { errEl.textContent = tk('depot.noTableRowsWere'); errEl.classList.remove('hidden'); return; }
  let headerIdx = bimpFindHeader(rows);
  if (headerIdx < 0) headerIdx = 0;
  const header = rows[headerIdx];
  bimp = { fileName: file.name, rows, headerIdx, header, map: bimpAutoMap(header), flip: false, items: [], skip: new Set() };
  bimpBuild();
  bimpRender();
}

function bimpCatOptions(sel) {
  return finActiveCategories().map(c => `<option value="${escapeHtml(c.id)}" ${c.id === sel ? 'selected' : ''}>${escapeHtml(i18nT(c.label))}</option>`).join('');
}
function bimpRender() {
  const b = bimp, body = document.getElementById('bimpBody');
  if (!b) { body.classList.add('hidden'); body.innerHTML = ''; bimpUpdateButton(); return; }
  const colOpts = (sel) => `<option value="-1">${escapeHtml(tk('depot.none'))}</option>` + b.header.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${escapeHtml(h || ((tk('depot.column') + ' ') + (i + 1)))}</option>`).join('');
  const colSel = (id, label) => `<label class="block min-w-0"><span class="block text-[10px] uppercase tracking-wide text-ink/40 mb-0.5">${escapeHtml(label)}</span><select data-bimpcol="${id}" class="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-xs bg-white">${colOpts(b.map[id])}</select></label>`;
  const open = b.items.filter(x => !x.dup);
  const nOut = open.filter(x => x.amount > 0 && !b.skip.has(x.id)).length;
  const nIn = open.filter(x => x.amount < 0 && !b.skip.has(x.id)).length;
  const nDup = b.items.length - open.length;
  const rowsHtml = b.items.map(it => {
    const off = it.dup || b.skip.has(it.id);
    return `<div class="flex items-center gap-2 py-1.5 border-b border-ink/5 ${it.dup ? 'opacity-45' : ''}" data-bimprow="${escapeHtml(it.id)}">
      <input type="checkbox" data-bimptick="${escapeHtml(it.id)}" class="shrink-0" ${off ? '' : 'checked'} ${it.dup ? 'disabled' : ''} />
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline justify-between gap-2"><span class="text-xs truncate">${escapeHtml(it.payee || it.purpose || '–')}</span><span class="text-xs font-medium shrink-0 ${it.amount < 0 ? 'text-pine' : ''}">${escapeHtml(it.amount < 0 ? '+' + fmtEur(-it.amount) : fmtEur(it.amount))}</span></div>
        <div class="text-[10px] text-ink/40 truncate">${escapeHtml(new Date(it.date + 'T00:00:00').toLocaleDateString(sysLocale()))}${it.dup ? ' · ' + escapeHtml(tk('bimp.dup')) : (it.payee && it.purpose ? ' · ' + escapeHtml(it.purpose) : '')}</div>
      </div>
      ${it.dup ? '' : `<select data-bimpcat="${escapeHtml(it.id)}" class="shrink-0 w-[8.5rem] rounded-lg border border-ink/15 px-1.5 py-1 text-[11px] bg-white">${bimpCatOptions(it.category)}</select>`}
    </div>`;
  }).join('');
  body.innerHTML = `
    <details class="mb-3"><summary class="text-xs text-ink/50 cursor-pointer select-none">${escapeHtml(tk('bimp.columns'))}</summary>
      <div class="grid grid-cols-2 gap-2 mt-2">${colSel('date', tk('fin.date'))}${colSel('payee', tk('bimp.payee'))}${colSel('purpose', tk('bimp.purpose'))}${colSel('amount', tk('depot.amount'))}</div>
      <label class="flex items-center gap-2 text-xs text-ink/60 mt-2"><input type="checkbox" id="bimpFlip" ${b.flip ? 'checked' : ''} />${escapeHtml(tk('bimp.flip'))}</label>
    </details>
    <p class="text-xs text-ink/60 mb-2">${escapeHtml(tk('bimp.found', { out: nOut, inc: nIn, dup: nDup }))}</p>
    ${b.items.length ? `<div class="max-h-[40vh] overflow-y-auto rounded-lg border border-ink/10 px-2">${rowsHtml}</div>` : `<p class="text-xs text-red-500">${escapeHtml(tk('bimp.noRows'))}</p>`}`;
  body.classList.remove('hidden');
  bimpUpdateButton();
}
function bimpSelected() { return bimp ? bimp.items.filter(x => !x.dup && !bimp.skip.has(x.id)) : []; }
function bimpUpdateButton() {
  const btn = document.getElementById('bimpSaveBtn');
  const n = bimpSelected().length;
  btn.disabled = !n;
  btn.textContent = n ? tk('bimp.import', { n }) : tk('depot.import');
}
function bimpSave() {
  const sel = bimpSelected();
  if (!sel.length) return;
  const me = (currentUser() && currentUser().id) || '';
  const now = new Date().toISOString();
  const rules = bimpRules();
  const ops = finQueueRead();
  const kasse = (kassenServer === true) ? activeKasseId : '';
  sel.forEach(it => {
    const data = {
      id: it.id, amount: it.amount, date: it.date, category: it.category, title: it.payee || it.purpose.slice(0, 80),
      note: it.payee ? it.purpose.slice(0, 200) : '', paidBy: '', link: '', split: '', store: '', listId: '', items: [],
      createdBy: me, created: now, ...(kasse ? { kasse } : {}),
    };
    ops.push({ opId: newRecordId(), type: 'save', data });
    const k = bimpKey(it.payee);
    if (k) rules[k] = it.category;
  });
  finQueueWrite(ops);
  try { localStorage.setItem(BIMP_RULES_KEY, JSON.stringify(rules)); } catch (e) { /* ignore */ }
  rebuildAusgaben();
  finFlushQueue();
  const dates = sel.map(x => x.date).sort();
  bimpClose();
  finJumpToDate(dates[dates.length - 1]);
  renderFinance();
  finShowToast(tk('bimp.done', { n: sel.length }));
}

function bimpOpen() {
  bimp = null;
  document.getElementById('bimpFile').value = '';
  document.getElementById('bimpFileLabel').textContent = tk('bimp.select');
  document.getElementById('bimpError').classList.add('hidden');
  bimpRender();
  document.getElementById('bimpModal').classList.remove('hidden');
}
function bimpClose() {
  document.getElementById('bimpModal').classList.add('hidden');
  bimp = null;
}

function bimpInit() {
  const addBtn = document.getElementById('openExpenseModalBtn');
  if (!addBtn || document.getElementById('bimpModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div id="bimpModal" class="hidden fixed inset-0 bg-ink/30 backdrop-blur-sm z-[320] grid place-items-center p-4 sm:p-6">
    <div class="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto fade-in">
      <button id="bimpCloseBtn" type="button" class="absolute top-3 right-3 w-7 h-7 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5 transition grid place-items-center text-lg leading-none select-none" aria-label="${escapeHtml(tk('common.close'))}">×</button>
      <h3 class="font-serif text-lg mb-1 pr-6">${escapeHtml(tk('bimp.title'))}</h3>
      <p class="text-xs text-ink/50 mb-4">${escapeHtml(tk('bimp.intro'))}</p>
      <label class="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-ink/20 px-4 py-5 text-sm text-ink/60 hover:border-pine hover:text-pine transition cursor-pointer">
        <input id="bimpFile" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain,text/comma-separated-values" class="hidden" />
        <span aria-hidden="true">📄</span><span id="bimpFileLabel" class="truncate"></span>
      </label>
      <p id="bimpError" class="hidden text-xs text-red-500 mt-3"></p>
      <div id="bimpBody" class="hidden mt-4"></div>
      <div class="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-ink/10">
        <button id="bimpCancelBtn" type="button" class="px-3 py-2 rounded-lg border border-ink/15 text-sm text-ink/60 hover:bg-ink/5 transition">${escapeHtml(tk('common.cancel'))}</button>
        <button id="bimpSaveBtn" type="button" disabled class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90 transition disabled:opacity-40">${escapeHtml(tk('depot.import'))}</button>
      </div>
    </div></div>`;
  document.body.appendChild(wrap.firstElementChild);
  const btn = document.createElement('button');
  btn.id = 'bimpOpenBtn'; btn.type = 'button';
  btn.className = 'w-9 h-9 rounded-lg border border-ink/15 text-ink/60 hover:text-pine hover:border-pine transition grid place-items-center text-base leading-none';
  btn.textContent = '⤓';
  btn.setAttribute('aria-label', tk('bimp.title')); btn.title = tk('bimp.title');
  addBtn.parentNode.insertBefore(btn, addBtn);
  btn.addEventListener('click', bimpOpen);
  document.getElementById('bimpCloseBtn').addEventListener('click', bimpClose);
  document.getElementById('bimpCancelBtn').addEventListener('click', bimpClose);
  document.getElementById('bimpSaveBtn').addEventListener('click', bimpSave);
  document.getElementById('bimpModal').addEventListener('click', (e) => {
    if (e.target.id !== 'bimpModal') return;
    if (bimp && !confirm(tk('depot.cancelImport'))) return;
    bimpClose();
  });
  document.getElementById('bimpFile').addEventListener('change', (e) => {
    bimpReadFile(e.target.files && e.target.files[0]).catch(err => {
      const el = document.getElementById('bimpError');
      el.textContent = (tk('depot.fileCouldNotRead') + ' ') + err.message;
      el.classList.remove('hidden');
    });
  });
  const body = document.getElementById('bimpBody');
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (!bimp) return;
    if (t.dataset.bimpcol) { bimp.map[t.dataset.bimpcol] = Number(t.value); bimpBuild(); bimpRender(); }
    else if (t.id === 'bimpFlip') { bimp.flip = t.checked; bimp.items = []; bimpBuild(); bimpRender(); }
    else if (t.dataset.bimptick) { if (t.checked) bimp.skip.delete(t.dataset.bimptick); else bimp.skip.add(t.dataset.bimptick); bimpRender(); }
    else if (t.dataset.bimpcat) { const it = bimp.items.find(x => x.id === t.dataset.bimpcat); if (it) it.category = t.value; }
  });
  // The button only belongs to the expenses tab
  const orig = renderFinance;
  renderFinance = function () {
    const r = orig.apply(this, arguments);
    btn.classList.toggle('hidden', finTab !== 'ausgaben' || addBtn.classList.contains('hidden'));
    return r;
  };
  btn.classList.toggle('hidden', finTab !== 'ausgaben');
}
bimpInit();

(window.PINN_PARTS = window.PINN_PARTS || []).push('buchungsimport');
