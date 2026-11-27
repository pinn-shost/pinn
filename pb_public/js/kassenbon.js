/* pinn. – E-receipts (js/kassenbon.js, since 1.169.0)
   Part of the pinn. web app (pb_public/index.html). Classic script, no build step: all top-level names share one
   global scope with the other files in js/ (prefix kb…, CSS classes kb-…).

   Reads the PDF e-receipt of a shop (REWE, dm, Lidl, ALDI, EDEKA, Rossmann … – everything with a text layer) on the
   device and finishes the shopping with it:
   - ticks off the matching entries of the shopping lists,
   - adds the bought amount to the pantry (option per upload, the last choice is remembered on the device),
   - books the amount paid in Finance (shop, date, items, bonus info in the note).
   Names on receipts are short and in capitals ("BIO H-MILCH 3,8%", "KART. DRILLINGE") – they are compared with the
   list and pantry by words and abbreviations (kbScore). Unsure matches are marked "please check"; everything can be
   changed in the review popup. What the user assigns by hand is learned (shoppingReceiptRules) and used next time.
   Receipts stay 48 h in shoppingReceipts: "Check later" books right away and keeps the rest open; an applied receipt
   can still be corrected (its effects are taken back and applied again).
   Bonus programmes (REWE Bonus credit, PAYBACK points, coupons for later …) are NEVER deducted: they only go into the
   note of the booking. Real discounts on the receipt itself (dm coupons before "Zu zahlender Betrag") are part of the
   amount paid. Deposits (Pfand/Leergut) count for the amount but never go onto lists or into the pantry. */

/* ---------- Reading the receipt ---------- */
const KB_HOURS = 48;
const KB_RULES_MAX = 800;
const KB_PANTRY_KEY = 'pinn.kassenbon.vorrat';
const KB_STORES = [
  [/\brewe\b/i, 'REWE', false], [/dm-?drogerie|dm-rabatte|\bdm\.de\b|\bdmbio\b|deine payback kartennr[\s\S]*dm/i, 'dm', false],
  [/\blidl\b/i, 'Lidl', false], [/\baldi\b/i, 'ALDI', false], [/\bedeka\b/i, 'EDEKA', false], [/\bkaufland\b/i, 'Kaufland', false],
  [/\bpenny\b/i, 'Penny', false], [/\brossmann\b/i, 'Rossmann', false], [/\bm(ü|ue)ller\b/i, 'Müller', false], [/\btegut\b/i, 'tegut', false],
  [/\bglobus\b/i, 'Globus', false], [/\bnorma\b/i, 'Norma', false], [/\bnetto\b(?!\s*[\d,]|\s+steuer)/i, 'Netto', true],
  [/\bbudni\b/i, 'Budni', false], [/\bbio company\b/i, 'Bio Company', false], [/\balnatura\b/i, 'Alnatura', false],
];
const KB_DRUGSTORES = ['dm', 'Rossmann', 'Müller', 'Budni'];
// Lines that are never items (totals, payment, tax table …)
const KB_TOTAL = /^(zwischensumme|summe|total|gesamt(summe|betrag)?|zu zahlen(der betrag)?|endsumme)\b/i;
const KB_PAY = /^(zu zahlender betrag|geg\.|gegeben|r(ü|ue)ckgeld|visa|mastercard|maestro|girocard|ec[- ]?karte|bar\b|kartenzahlung|betrag eur|amex|paypal)/i;
const KB_NOT_ITEM = /(mwst|netto|steuer|brutto|bonus|punkte|guthaben|payback|tse-|signatur|beleg-?nr|trace-?nr|terminal|kundenbeleg)/i;
const KB_ITEM = /^(.*?\S)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s*(?:EUR|€))?(?:\s+(§?[A-Z0-9]{1,2}))?(?:\s*\*)?\s*$/;
const KB_QTY_PCS = /^(\d+)\s*(?:stk|st|x)\.?\s*x?\s*(\d+,\d{2})\b/i;
const KB_QTY_KG = /^(\d+,\d{1,3})\s*kg\s*x\s*(\d+,\d{2})/i;
const KB_DEPOSIT = /(pfand|leergut|leerg\.|leihgebinde)/i;
const KB_DISCOUNT = /(coupon|rabatt|nachlass|gutschein|preisvorteil|aktion|sofortrabatt|mitarbeiter)/i;

function kbMoney(s) { return Number(String(s || '').replace(/\./g, '').replace(',', '.')) || 0; }
function kbRound(n) { return Math.round(n * 100) / 100; }
function kbRound3(n) { return Math.round(n * 1000) / 1000; } // pantry amounts (kg with grams)
function kbPretty(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const letters = s.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s; // already mixed case (dm)
  return s.toLowerCase().replace(/(^|[\s.\-/(])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase());
}
function kbStoreOf(texts) {
  const head = texts.slice(0, 8).join('\n');
  const all = texts.join('\n');
  // The shop name in the head wins; otherwise a clear hint anywhere (dm has no name at the top)
  for (const [re, name] of KB_STORES) if (re.test(head)) return name;
  for (const [re, name, headOnly] of KB_STORES) if (!headOnly && re.test(all)) return name;
  const first = texts.find(t => /[A-Za-zÄÖÜäöü]{3}/.test(t) && !/\d{2}\.\d{2}\.\d{4}/.test(t));
  return first ? kbPretty(first).slice(0, 40) : '';
}
// Bonus programmes: only information for the note, never part of the amount
function kbBonusNote(all, store) {
  const one = all.replace(/\s+/g, ' ');
  const parts = [];
  let m = /hast du\s+(\d+,\d{2})\s*EUR\s+(?:\S+\s+)?Bonus-Guthaben\s+gesammelt/i.exec(one);
  if (m) parts.push(tk('kb.bonusEarned', { prog: (store || 'REWE') + ' Bonus', amount: fmtEur(kbMoney(m[1])) }));
  m = /Aktuelles\s+Bonus-Guthaben:?\s*(\d+,\d{2})/i.exec(one);
  if (m) parts.push(tk('kb.bonusBalance', { amount: fmtEur(kbMoney(m[1])) }));
  m = /Punkte f(?:ü|ue)r diesen Einkauf\s*([\d.]+)\s*°?\s*P/i.exec(one);
  if (m) {
    const eq = /Dies entspricht\s*(\d+,\d{2})\s*EUR/i.exec(one);
    parts.push(tk('kb.points', { prog: /payback/i.test(one) ? 'PAYBACK' : (/deutschlandcard/i.test(one) ? 'DeutschlandCard' : tk('kb.pointsProg')), n: m[1], amount: eq ? fmtEur(kbMoney(eq[1])) : '–' }));
  }
  m = /Punktestand vor Einkauf:?\s*([\d.]+)/i.exec(one);
  if (m) parts.push(tk('kb.pointsBefore', { n: m[1] }));
  if (!parts.length && /lidl plus|payback|deutschlandcard|bonus-?guthaben/i.test(one)) parts.push(tk('kb.bonusSeen'));
  return parts.join(' · ');
}
// lines: text lines of the PDF (top to bottom). -> receipt or null
function kbParse(lines) {
  const texts = lines.map(l => String(l && l.text !== undefined ? l.text : l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const all = texts.join('\n');
  const store = kbStoreOf(texts);
  const items = [];
  let phase = 'head';
  let sum = 0, pay = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const last = items[items.length - 1];
    // Amount lines under an item ("2 Stk x 2,99", "1,180 kg x 19,90 EUR/kg")
    let q = KB_QTY_KG.exec(t);
    if (q && last && phase === 'items') { last.kg = Number(q[1].replace(',', '.')) || 0; last.unitPrice = kbMoney(q[2]); continue; }
    q = KB_QTY_PCS.exec(t);
    if (q && last && phase === 'items' && !/[A-Za-zÄÖÜäöü]{3}/.test(t.slice(q[0].length))) { last.qty = Number(q[1]) || 1; last.unitPrice = kbMoney(q[2]); continue; }
    if (KB_TOTAL.test(t)) {
      const m = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(t);
      if (/^zu zahlen/i.test(t)) { if (m) pay = kbMoney(m[1]); phase = 'end'; continue; }
      if (/^zwischensumme/i.test(t)) { phase = 'discounts'; continue; }
      if (m && !sum) sum = kbMoney(m[1]);
      phase = phase === 'end' ? 'end' : 'after';
      continue;
    }
    if (KB_PAY.test(t)) {
      if (/^zu zahlender betrag/i.test(t)) { const m = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/.exec(t); if (m) pay = kbMoney(m[1]); }
      if (phase !== 'head') phase = 'end';
      continue;
    }
    if (phase === 'end') continue;
    const m = KB_ITEM.exec(t);
    if (!m || KB_NOT_ITEM.test(m[1]) || /^\d{2}\.\d{2}\.\d{4}/.test(m[1])) continue;
    const price = kbMoney(m[2]);
    let name = m[1].replace(/\s+(EUR|€)$/i, '').trim();
    // Coupons and discounts: after the subtotal (dm) or right under an item (negative, not deposit)
    if (price < 0 && !KB_DEPOSIT.test(name) && (phase === 'discounts' || phase === 'after' || KB_DISCOUNT.test(name))) {
      // A discount right under an item belongs to that item (REWE "Rabatt", Lidl "Preisvorteil")
      if (phase === 'items' && last && last.kind === 'item') { last.price = kbRound(last.price + price); last.discount = kbRound((last.discount || 0) + price); continue; }
      items.push({ raw: name, name: kbPretty(name), qty: 1, price, kind: 'discount' });
      continue;
    }
    if (phase === 'after' || phase === 'discounts') continue; // other lines between total and payment (tax, info)
    phase = 'items';
    let qty = 1;
    const pre = /^(\d+)\s*x\s+(\d+,\d{2})\s+(.+)$/i.exec(name); // dm: "3x 4,95 babylove Öko Pants"
    if (pre) { qty = Number(pre[1]) || 1; name = pre[3]; }
    name = name.replace(/\s*\+\s*\d+,\d{2}\s*€?\s*pfand$/i, ''); // dm: "Vöslauer Limo Himb.+0,25€Pfand" (deposit is an own line)
    const kind = KB_DEPOSIT.test(name) ? 'deposit' : 'item';
    items.push({ raw: name, name: kbPretty(name), qty, price, kind });
  }
  if (!items.length) return null;
  const total = pay || sum || kbRound(items.reduce((a, x) => a + x.price, 0));
  const date = (() => { const d = /(\d{2})\.(\d{2})\.(\d{4})/.exec(all); return d ? d[3] + '-' + d[2] + '-' + d[1] : ''; })();
  const time = (() => { const d = /uhrzeit:?\s*(\d{2}):(\d{2})/i.exec(all) || /\b(\d{2}):(\d{2})\b/.exec(all); return d ? d[1] + ':' + d[2] : ''; })();
  const no = /(?:bon-?nr\.?|beleg-?nr\.?|ta-?nummer)\s*:?\s*(\d{2,})/i.exec(all);
  const calc = kbRound(items.reduce((a, x) => a + x.price, 0));
  return {
    store, date, time, total: kbRound(total), sumOk: Math.abs(calc - total) < 0.02, calc,
    receiptNo: no ? no[1] : '', note: kbBonusNote(all, store), items,
  };
}

/* ---------- Comparing names ---------- */
const KB_STOP = new Set(['bio', 'ja', 'rewe', 'beste', 'wahl', 'dm', 'dmbio', 'gut', 'guenstig', 'classic', 'mw', 'eg', 'mehrweg', 'einweg',
  'vf', 'und', 'mit', 'der', 'die', 'das', 'fuer', 'von', 'stk', 'st', 'pck', 'gr', 'kg', 'ml', 'ltr', 'eur', 'xl', 'xxl']);
function kbNorm(s) {
  return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\d+(?:[.,]\d+)?\s*(%|g|kg|ml|l|st|stk)\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
}
// Umlauts are folded twice: "Äpfel" (list) and "AEPFEL"/"APFEL" (receipt) must meet
function kbFold(t) { return t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'); }
function kbTokens(s) { return kbNorm(s).split(' ').filter(t => t.length >= 2 && !KB_STOP.has(t)).map(kbFold); }
function kbKey(s) { return kbTokens(s).join(' '); }
function kbStem(t) { return t.length > 4 ? t.replace(/(en|n|e|s)$/, '') : t; }
function kbSim(r, c) {
  if (r === c || kbStem(r) === kbStem(c)) return 1;
  if (c.length >= 4 && r.length >= 3 && c.startsWith(r)) return 0.85;      // receipt abbreviation: "kart" -> "kartoffeln"
  // German compounds end with the thing itself: "schlagsahne" is a "sahne", but "tomatenmark" is no "tomaten"
  if (c.length >= 4 && (r.endsWith(c) || r.endsWith(kbStem(c)))) return 0.85;
  if (r.length >= 5 && c.includes(r)) return 0.7;                           // "traub" in "weintrauben"
  return 0;
}
// Common receipt words whose list name looks different (folded like kbTokens)
const KB_SYN = {
  toipa: 'toilettenpapier', klopapier: 'toilettenpapier', kuchentucher: 'kuchenrolle', kuchenrolle: 'kuchentucher', pants: 'windeln',
  windel: 'windeln', cheddar: 'kase', gouda: 'kase', emmentaler: 'kase', edamer: 'kase', mozzarella: 'kase',
  hackfl: 'hackfleisch', gem: 'gemischt', schlagsahne: 'sahne', tk: 'tiefkuhl', mineralw: 'wasser', sprudel: 'wasser',
  frischk: 'frischkase', jogh: 'joghurt', kart: 'kartoffeln', zwieb: 'zwiebeln', knobl: 'knoblauch', clementine: 'mandarinen',
};
// How well does a receipt name fit a list/pantry name? 0..1
function kbScore(receiptName, name) {
  const rt0 = kbTokens(receiptName), ct = kbTokens(name);
  const rt = rt0.concat(rt0.map(t => KB_SYN[t]).filter(Boolean));
  if (!rt0.length || !ct.length) return 0;
  const best = ct.map(c => Math.max(...rt.map(r => kbSim(r, c))));
  const top = Math.max(...best);
  if (top < 0.7) return 0;
  return kbRound(0.7 * top + 0.3 * (best.reduce((a, b) => a + b, 0) / best.length));
}
const KB_SURE = 0.8;
const KB_MAYBE = 0.6;
function kbRule(raw) { const k = kbKey(raw); return k ? (shoppingReceiptRules || []).find(r => r.k === k) || null : null; }

/* ---------- State of the open receipt ---------- */
let kbCur = null;   // { id, key, at, store, date, time, total, sumOk, note, category, paidBy, listSel, applied, booked, expenseId, items[] }
// Open list entries – plus the ones this receipt ticked itself (an applied receipt that is corrected)
function kbOpenItems(listSel, r) {
  const own = new Set(((r || kbCur || {}).items || []).map(x => x.eff && x.eff.shopId).filter(Boolean));
  return shoppingItems.filter(it => (!it.done || own.has(it.id)) && (!listSel || itemListId(it) === listSel));
}
// Fills shop/pantry suggestions of all rows that were not set by hand
function kbAutoMatch(r) {
  const cands = kbOpenItems(r.listSel, r);
  const taken = new Set(r.items.filter(x => x.manual && x.shopId).map(x => x.shopId));
  const pairs = [];
  r.items.forEach((x, n) => {
    if (x.kind !== 'item' || x.manual) return;
    x.shopId = ''; x.pantryId = ''; x.sure = false;
    const rule = kbRule(x.raw);
    if (rule) {
      if (rule.p && pantryItems.some(p => p.id === rule.p) && !rule.xp) x.pantryId = rule.p;
      if (rule.s && !rule.x) {
        const it = cands.find(c => kbKey(c.name) === rule.s && !taken.has(c.id));
        if (it) { x.shopId = it.id; taken.add(it.id); }
      }
      x.sure = true; x.ruled = true;
      return;
    }
    cands.forEach(c => { const s = kbScore(x.raw, c.name); if (s >= KB_MAYBE) pairs.push({ n, id: c.id, s }); });
    let bestP = null, bestPs = 0;
    pantryItems.forEach(p => { const s = kbScore(x.raw, p.name); if (s > bestPs) { bestPs = s; bestP = p; } });
    if (bestP && bestPs >= KB_SURE) x.pantryId = bestP.id;
    x.pScore = bestPs;
  });
  // Greedy: best pairs first, every list entry and every receipt line at most once
  pairs.sort((a, b) => b.s - a.s).forEach(p => {
    const x = r.items[p.n];
    if (x.shopId || taken.has(p.id)) return;
    x.shopId = p.id; x.score = p.s; taken.add(p.id);
  });
  r.items.forEach(x => {
    if (x.kind !== 'item' || x.manual || x.ruled) return;
    const s = x.shopId ? x.score : 0;
    // Sure: a good list match, or nothing on the list but a clear pantry match
    x.sure = (x.shopId && s >= KB_SURE) || (!x.shopId && x.pantryId && x.pScore >= 0.9) || false;
    if (x.shopId && !x.pantryId) { // what is on the list and known in the pantry
      const it = shoppingItems.find(i => i.id === x.shopId);
      const p = it && pantryItemForShopping(it);
      if (p) x.pantryId = p.id;
    }
  });
  r.items.forEach(x => { if (x.kind === 'item') x.pantryAdd = x.manualAdd ? x.pantryAdd : kbPantryAmount(x, pantryItems.find(p => p.id === x.pantryId)); });
}
// Amount for the pantry in its own unit: weight items in kg/g, everything else as pieces
function kbPantryAmount(x, p) {
  const u = String((p && p.unit) || '').toLowerCase();
  if (x.kg && u === 'kg') return kbRound3(x.kg);
  if (x.kg && u === 'g') return Math.round(x.kg * 1000);
  return x.qty || 1;
}
function kbBestList(r) {
  let best = '', n = 0;
  allShoppingLists().forEach(l => {
    const c = kbOpenItems(l.id, r);
    const hits = r.items.filter(x => x.kind === 'item' && c.some(it => kbScore(x.raw, it.name) >= KB_SURE)).length;
    if (hits > n) { n = hits; best = l.id; }
  });
  return best;
}
function kbGuessCategory(store) {
  if (!finance) return 'lebensmittel';
  const ok = id => finActiveCategories().some(c => c.id === id);
  const prev = ausgaben.find(a => a.store === store && a.category && ok(a.category));
  if (prev) return prev.category;
  const want = KB_DRUGSTORES.includes(store) ? 'drogerie' : 'lebensmittel';
  return ok(want) ? want : finDefaultExpenseCategory();
}
function kbCanBook() {
  return !isCurrentUserGuest() && typeof finance !== 'undefined' && !!finance && typeof finQueueSave === 'function' && isViewAllowed('finanzen');
}
function kbPantryDefault() { try { return localStorage.getItem(KB_PANTRY_KEY) !== '0'; } catch (e) { return true; } }

/* ---------- Opening a PDF ---------- */
function kbPick(listId) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'application/pdf,.pdf';
  inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; if (f) kbReadFile(f, listId || ''); });
  inp.click();
}
async function kbReadFile(file, listId) {
  if (!pinnIsPdfFile(file)) { finShowToast(tk('kb.onlyPdf'), true); return; }
  finShowToast(tk('pdf.readingReceipt'));
  let lines = [];
  try { lines = await pinnPdfLines(file, 4); } catch (err) { finShowToast(pinnPdfErrorText(err), true); return; }
  const r = kbParse(lines);
  if (!r || r.items.filter(x => x.kind === 'item').length < 1) { finShowToast(tk('kb.notReadable'), true); return; }
  kbStart(r, listId);
}
function kbStart(parsed, listId) {
  kbPrune();
  const key = [parsed.store, parsed.date, parsed.time, parsed.total.toFixed(2), parsed.receiptNo].join('|');
  const known = shoppingReceipts.find(x => x.key === key);
  if (known) { kbOpenReview(known.id); finShowToast(tk('kb.alreadyRead')); return; }
  const twin = ausgaben.find(a => a.date === parsed.date && Math.abs((a.amount || 0) - parsed.total) < 0.005 && kbNorm(a.store || '') === kbNorm(parsed.store));
  if (twin && !confirm(tk('kb.maybeBooked', { store: parsed.store, amount: fmtEur(parsed.total) }))) return;
  const r = {
    id: 'kb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key, at: Date.now(),
    store: parsed.store, date: parsed.date || finTodayIso(), time: parsed.time, total: parsed.total, sumOk: parsed.sumOk, note: parsed.note,
    category: kbGuessCategory(parsed.store), paidBy: currentMember() ? currentMember().id : '', listSel: '', applied: false, booked: false, expenseId: '',
    optShop: true, optPantry: kbPantryDefault(), optFin: kbCanBook() && !twin,
    items: parsed.items.map(x => ({ raw: x.raw, name: x.name, qty: x.qty || 1, kg: x.kg || 0, price: x.price, kind: x.kind })),
  };
  r.listSel = listId && getShoppingList(listId) ? listId : kbBestList(r);
  kbAutoMatch(r);
  kbCur = r;
  kbRenderReview();
}

/* ---------- Review popup ---------- */
function kbItemsOf(r) { return r.items.filter(x => x.kind === 'item'); }
function kbRowHtml(x, n) {
  const it = x.shopId ? shoppingItems.find(i => i.id === x.shopId) : null;
  const p = x.pantryId === '__new' ? null : (x.pantryId ? pantryItems.find(q => q.id === x.pantryId) : null);
  const meta = [x.kg ? String(x.kg).replace('.', ',') + ' kg' : (x.qty > 1 ? x.qty + '×' : ''), fmtEur(x.price)].filter(Boolean).join(' · ');
  const chips = [];
  if (it) chips.push(`<span class="kb-chip">🛒 ${escapeHtml(it.name)}</span>`);
  if (kbCur.optPantry && (p || x.pantryId === '__new')) chips.push(`<span class="kb-chip kb-chip-p">🥫 +${escapeHtml(String(x.pantryAdd).replace('.', ','))} ${escapeHtml(p ? p.name : x.name)}</span>`);
  const unsure = !x.sure && !x.manual && (x.shopId || x.score);
  const none = !chips.length;
  return `<div class="kb-row${unsure ? ' kb-unsure' : ''}" data-kbrow="${n}">
    <button type="button" class="kb-row-main" data-kbedit="${n}">
      <span class="min-w-0 flex-1 text-left">
        <span class="block text-sm truncate">${escapeHtml(x.name)}</span>
        <span class="block text-[11px] text-ink/45">${escapeHtml(meta)}</span>
      </span>
      <span class="kb-chips">${chips.join('')}${unsure ? `<span class="kb-check">${escapeHtml(tk('kb.pleaseCheck'))}</span>` : ''}${none && !unsure ? `<span class="kb-none">${escapeHtml(tk('kb.notAssigned'))}</span>` : ''}</span>
    </button>
    <div class="kb-edit hidden" data-kbeditbox="${n}"></div>
  </div>`;
}
function kbEditHtml(x, n) {
  const cands = kbOpenItems(kbCur.listSel);
  const extra = x.shopId && !cands.some(c => c.id === x.shopId) ? shoppingItems.filter(i => i.id === x.shopId) : [];
  const shopOpts = [['', tk('kb.noListEntry')]].concat(cands.concat(extra)
    .map(c => [c.id, c.name + (kbCur.listSel ? '' : ' · ' + ((getShoppingList(itemListId(c)) || {}).name || ''))]));
  const pantryOpts = [['', tk('kb.notInPantry')], ['__new', tk('kb.newInPantry', { name: x.name })]]
    .concat(pantryItems.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, p.name + (p.unit ? ' (' + p.unit + ')' : '')]));
  const sel = (id, opts, val) => `<select data-kbf="${id}" data-n="${n}" class="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm bg-white">${opts.map(o => `<option value="${escapeHtml(o[0])}"${o[0] === val ? ' selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>`;
  return `
    <label class="block text-[11px] text-ink/45 mb-0.5">${escapeHtml(tk('kb.listEntry'))}</label>${sel('shop', shopOpts, x.shopId || '')}
    ${kbCur.optPantry ? `<div class="flex items-end gap-2 mt-2">
      <div class="flex-1 min-w-0"><label class="block text-[11px] text-ink/45 mb-0.5">${escapeHtml(tk('kb.pantry'))}</label>${sel('pantry', pantryOpts, x.pantryId || '')}</div>
      <div class="w-20 shrink-0"><label class="block text-[11px] text-ink/45 mb-0.5">${escapeHtml(tk('kb.amount'))}</label><input data-kbf="add" data-n="${n}" inputmode="decimal" value="${escapeHtml(String(x.pantryAdd || '').replace('.', ','))}" class="w-full rounded-lg border border-ink/15 px-2 py-1.5 text-sm" /></div>
    </div>` : ''}
    <button type="button" data-kbok="${n}" class="mt-2 px-3 py-1.5 rounded-lg bg-pine text-white text-xs font-medium">${escapeHtml(tk('kb.rowOk'))}</button>`;
}
function kbRenderReview() {
  const r = kbCur;
  if (!r || typeof fzOpenModal2 !== 'function') return;
  const items = kbItemsOf(r);
  const deposits = r.items.filter(x => x.kind === 'deposit');
  const discounts = r.items.filter(x => x.kind === 'discount');
  const depSum = kbRound(deposits.reduce((a, x) => a + x.price, 0));
  const disSum = kbRound(discounts.reduce((a, x) => a + x.price, 0));
  const unsure = items.filter(x => !x.sure && !x.manual && (x.shopId || x.score)).length;
  const lists = [['', tk('kb.allLists')]].concat(allShoppingLists().map(l => [l.id, l.name || '']));
  const cats = finance ? finActiveCategories().filter(c => c.id !== FIN_INCOME_CATEGORY) : [];
  const canBook = kbCanBook() && !r.booked;
  const hoursLeft = Math.max(1, Math.ceil((r.at + KB_HOURS * 3600000 - Date.now()) / 3600000));
  const html = `
    <h3 class="font-serif text-lg mb-0.5 pr-6">🧾 ${escapeHtml(r.store || tk('kb.receipt'))}</h3>
    <div class="text-xs text-ink/50 mb-2">${escapeHtml([r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString(sysLocale()) : '', r.time].filter(Boolean).join(' · '))} · <b class="text-ink/80">${escapeHtml(fmtEur(r.total))}</b>${r.sumOk ? ' ✓' : ` <span class="text-amber-700">(${escapeHtml(tk('kb.sumDiffers', { calc: fmtEur(kbCalc(r)) }))})</span>`}</div>
    ${r.note ? `<div class="kb-bonus mb-2">🎁 ${escapeHtml(r.note)}<span class="block text-[10px] opacity-70">${escapeHtml(tk('kb.bonusNotDeducted'))}</span></div>` : ''}
    ${r.applied ? `<p class="text-[11px] text-ink/50 mb-2">${escapeHtml(tk('kb.appliedChange', { h: hoursLeft }))}</p>` : ''}
    <div class="kb-opts mb-2">
      <label class="kb-opt"><input type="checkbox" data-kbo="optShop" ${r.optShop ? 'checked' : ''}/> <span>${escapeHtml(tk('kb.optShop'))}</span></label>
      ${r.optShop ? `<select data-kbo="listSel" class="ml-6 mb-1 rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white">${lists.map(o => `<option value="${escapeHtml(o[0])}"${o[0] === r.listSel ? ' selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>` : ''}
      <label class="kb-opt"><input type="checkbox" data-kbo="optPantry" ${r.optPantry ? 'checked' : ''}/> <span>${escapeHtml(tk('kb.optPantry'))}</span></label>
      ${r.booked ? `<div class="kb-opt text-pine">✓ ${escapeHtml(tk('kb.booked'))}</div>` : (kbCanBook() ? `<label class="kb-opt"><input type="checkbox" data-kbo="optFin" ${r.optFin ? 'checked' : ''}/> <span>${escapeHtml(tk('kb.optFin', { amount: fmtEur(r.total) }))}</span></label>
      ${r.optFin ? `<div class="ml-6 flex gap-2 mb-1">
        <select data-kbo="category" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white">${cats.map(c => `<option value="${escapeHtml(c.id)}"${c.id === r.category ? ' selected' : ''}>${escapeHtml((c.icon || '') + ' ' + i18nT(c.label))}</option>`).join('')}</select>
        <select data-kbo="paidBy" class="flex-1 min-w-0 rounded-lg border border-ink/15 px-2 py-1 text-xs bg-white">${fzMemberOptions().map(o => `<option value="${escapeHtml(o[0])}"${o[0] === r.paidBy ? ' selected' : ''}>${escapeHtml(o[1])}</option>`).join('')}</select>
      </div>` : ''}` : '')}
    </div>
    ${unsure ? `<p class="kb-unsure-hint mb-2">${escapeHtml(tk('kb.unsureN', { n: unsure }))}</p>` : ''}
    <div class="kb-list">${kbListHtml(r)}</div>
    ${deposits.length || discounts.length ? `<div class="text-[11px] text-ink/50 mt-2">${[deposits.length ? tk('kb.deposits', { amount: fmtEur(depSum) }) : '', discounts.length ? tk('kb.discounts', { amount: fmtEur(disSum) }) : ''].filter(Boolean).map(escapeHtml).join(' · ')}</div>` : ''}
    <div class="flex items-center gap-2 mt-4 flex-wrap">
      ${r.applied ? '' : `<button type="button" id="kbLater" class="text-xs text-ink/55 hover:text-ink hover:underline">${escapeHtml(tk(canBook && r.optFin ? 'kb.laterBook' : 'kb.later'))}</button>`}
      <div class="flex-1"></div>
      <button type="button" id="kbCancel" class="px-3 py-2 rounded-lg text-sm text-ink/60 hover:text-ink">${tk('common.cancel')}</button>
      <button type="button" id="kbApply" class="px-4 py-2 rounded-lg bg-pine text-white text-sm font-medium hover:bg-pine/90">${escapeHtml(tk(r.applied ? 'kb.applyAgain' : 'kb.apply'))}</button>
    </div>`;
  const body = document.getElementById('fzModal2Body');
  const scroll = body && !document.getElementById('fzModal2').classList.contains('hidden') ? body.parentElement.scrollTop : 0;
  fzOpenModal2(html, (b) => {
    if (scroll) b.parentElement.scrollTop = scroll;
    b.addEventListener('click', kbOnClick);
    b.addEventListener('change', kbOnChange);
    const rest = b.querySelector('.kb-rest');
    if (rest) rest.addEventListener('toggle', () => { if (kbCur) kbCur.restOpen = rest.open; });
    document.getElementById('kbCancel').addEventListener('click', () => { kbCur = null; fzCloseModal2(); });
    document.getElementById('kbApply').addEventListener('click', kbApply);
    const later = document.getElementById('kbLater');
    if (later) later.addEventListener('click', kbLater);
  });
}
// Assigned and unsure rows first; the rest (nothing found) folded below, still assignable
function kbHasMatch(x) { return !!(x.shopId || (kbCur.optPantry && x.pantryId) || x.score || x.manual); }
function kbListHtml(r) {
  const top = [], rest = [];
  r.items.forEach((x, n) => { if (x.kind === 'item') (kbHasMatch(x) ? top : rest).push(kbRowHtml(x, n)); });
  return top.join('') + (rest.length ? `<details class="kb-rest"${top.length && !r.restOpen ? '' : ' open'}><summary>${escapeHtml(tk('kb.otherItems', { n: rest.length }))}</summary><div class="kb-list-inner">${rest.join('')}</div></details>` : '');
}
function kbCalc(r) { return kbRound(r.items.reduce((a, x) => a + x.price, 0)); }
function kbOnClick(e) {
  const ed = e.target.closest('[data-kbedit]');
  if (ed) {
    const n = Number(ed.dataset.kbedit);
    const box = document.querySelector(`[data-kbeditbox="${n}"]`);
    const open = box.classList.contains('hidden');
    document.querySelectorAll('.kb-edit').forEach(x => { x.classList.add('hidden'); x.innerHTML = ''; });
    if (open) { box.innerHTML = kbEditHtml(kbCur.items[n], n); box.classList.remove('hidden'); }
    return;
  }
  const ok = e.target.closest('[data-kbok]');
  if (ok) { const x = kbCur.items[Number(ok.dataset.kbok)]; x.manual = true; x.sure = true; kbRenderReview(); }
}
function kbOnChange(e) {
  const r = kbCur;
  const o = e.target.closest('[data-kbo]');
  if (o) {
    const k = o.dataset.kbo;
    r[k] = o.type === 'checkbox' ? o.checked : o.value;
    if (k === 'optPantry') { try { localStorage.setItem(KB_PANTRY_KEY, o.checked ? '1' : '0'); } catch (err) { /* private mode */ } }
    if (k === 'listSel') kbAutoMatch(r);
    kbRenderReview();
    return;
  }
  const f = e.target.closest('[data-kbf]');
  if (!f) return;
  const x = r.items[Number(f.dataset.n)];
  x.manual = true; x.sure = true;
  if (f.dataset.kbf === 'shop') {
    x.shopId = f.value;
    if (f.value && !x.pantryId) { const it = shoppingItems.find(i => i.id === f.value); const p = it && pantryItemForShopping(it); if (p) { x.pantryId = p.id; x.pantryAdd = kbPantryAmount(x, p); } }
  } else if (f.dataset.kbf === 'pantry') {
    x.pantryId = f.value;
    x.pantryAdd = kbPantryAmount(x, pantryItems.find(p => p.id === f.value));
  } else if (f.dataset.kbf === 'add') {
    const v = parseFloat(String(f.value).replace(',', '.'));
    x.pantryAdd = v > 0 ? v : 0; x.manualAdd = true;
    return; // keep the editor open while typing
  }
  const n = Number(f.dataset.n);
  const row = document.querySelector(`[data-kbrow="${n}"] .kb-row-main`);
  if (row) { const tmp = document.createElement('div'); tmp.innerHTML = kbRowHtml(x, n); row.replaceWith(tmp.querySelector('.kb-row-main')); }
  const box = document.querySelector(`[data-kbeditbox="${n}"]`);
  if (box) box.innerHTML = kbEditHtml(x, n);
}

/* ---------- Applying ---------- */
function kbBook(r) {
  if (r.booked || !r.optFin || !kbCanBook()) return false;
  const lines = r.items.filter(x => x.kind !== 'deposit').map(x => (x.kg ? String(x.kg).replace('.', ',') + ' kg ' : (x.qty > 1 ? x.qty + '× ' : '')) + x.name + ' · ' + fmtEur(x.price));
  const dep = kbRound(r.items.filter(x => x.kind === 'deposit').reduce((a, x) => a + x.price, 0));
  if (dep) lines.push(tk('kb.depositLine', { amount: fmtEur(dep) }));
  const id = newRecordId();
  finQueueSave({
    id, amount: r.total, date: r.date, category: r.category || 'lebensmittel', title: tk('kb.expenseTitle', { store: r.store || tk('kb.receipt') }),
    note: r.note || '', paidBy: r.paidBy || '', link: '', store: r.store || '', listId: r.listSel || '', items: lines,
    createdBy: (currentUser() && currentUser().id) || '', created: new Date().toISOString(),
  });
  r.booked = true; r.expenseId = id;
  return true;
}
// Takes back what an earlier "apply" did (to correct a receipt within 48 h)
function kbRevert(r) {
  const undoShop = new Set(), undoPantry = {};
  r.items.forEach(x => {
    const e = x.eff;
    if (!e) return;
    if (e.shopId) undoShop.add(e.shopId);
    if (e.pantryId && e.add) undoPantry[e.pantryId] = (undoPantry[e.pantryId] || 0) + e.add;
    delete x.eff;
  });
  if (undoShop.size) shoppingItems = shoppingItems.map(it => undoShop.has(it.id) && it.done ? { ...it, done: false } : it);
  if (Object.keys(undoPantry).length) pantryItems = pantryItems.map(p => undoPantry[p.id] ? { ...p, qty: kbRound3(Math.max(0, (pantryNum(p.qty) || 0) - undoPantry[p.id])), updatedAt: Date.now() } : p);
}
function kbLearn(r) {
  let rules = (shoppingReceiptRules || []).slice();
  r.items.forEach(x => {
    if (x.kind !== 'item' || !x.manual) return;
    const k = kbKey(x.raw);
    if (!k) return;
    const it = x.shopId ? shoppingItems.find(i => i.id === x.shopId) : null;
    const rule = { k, s: it ? kbKey(it.name) : '', p: x.pantryId && x.pantryId !== '__new' ? x.pantryId : '', x: it ? 0 : 1, xp: x.pantryId ? 0 : (r.optPantry ? 1 : 0), t: Date.now() };
    rules = rules.filter(q => q.k !== k);
    rules.push(rule);
  });
  rules.sort((a, b) => (b.t || 0) - (a.t || 0));
  shoppingReceiptRules = rules.slice(0, KB_RULES_MAX);
}
function kbApply() {
  const r = kbCur;
  if (!r) return;
  if (r.applied) kbRevert(r);
  let ticked = 0, stocked = 0;
  const newPantry = [];
  r.items.forEach(x => {
    if (x.kind !== 'item') return;
    const eff = {};
    if (r.optShop && x.shopId && shoppingItems.some(i => i.id === x.shopId && !i.done)) {
      shoppingItems = shoppingItems.map(i => i.id === x.shopId ? { ...i, done: true } : i);
      eff.shopId = x.shopId; ticked++;
    }
    if (r.optPantry && x.pantryId && x.pantryAdd > 0) {
      let pid = x.pantryId;
      if (pid === '__new') {
        pid = 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        newPantry.push({ id: pid, name: x.name.slice(0, 80), qty: 0, unit: x.kg ? 'kg' : '', minQty: null, category: '', location: '', stores: [], note: '', bestBefore: '', barcodes: [], updatedAt: Date.now() });
        x.pantryId = pid;
      }
      eff.pantryId = pid; eff.add = x.pantryAdd; stocked++;
    }
    if (eff.shopId || eff.pantryId) x.eff = eff;
  });
  if (newPantry.length) pantryItems = [...pantryItems, ...newPantry];
  const adds = {};
  r.items.forEach(x => { if (x.eff && x.eff.pantryId) adds[x.eff.pantryId] = (adds[x.eff.pantryId] || 0) + x.eff.add; });
  if (Object.keys(adds).length) pantryItems = pantryItems.map(p => adds[p.id] ? { ...p, qty: kbRound3((pantryNum(p.qty) || 0) + adds[p.id]), updatedAt: Date.now() } : p);
  const booked = kbBook(r);
  kbLearn(r);
  r.applied = true;
  kbStore(r);
  fzCloseModal2();
  kbCur = null;
  if (stocked && typeof pantryCommit === 'function') pantryCommit(); else persistState();
  if (currentView === 'einkauf') renderShoppingList();
  finShowToast([tk('kb.doneTicked', { n: ticked }), r.optPantry ? tk('kb.doneStocked', { n: stocked }) : '', booked ? tk('kb.doneBooked', { amount: fmtEur(r.total) }) : ''].filter(Boolean).join(' · '));
}
// "Check later": book now (if chosen), keep the receipt open for 48 h
function kbLater() {
  const r = kbCur;
  if (!r) return;
  const booked = kbBook(r);
  kbStore(r);
  fzCloseModal2();
  kbCur = null;
  persistState();
  if (currentView === 'einkauf') renderShoppingList();
  finShowToast(booked ? tk('kb.laterBooked', { amount: fmtEur(r.total) }) : tk('kb.laterSaved'));
}
function kbStore(r) {
  const keep = { ...r, items: r.items.map(x => { const c = { ...x }; delete c.score; delete c.pScore; delete c.ruled; return c; }), restOpen: false };
  shoppingReceipts = [...(shoppingReceipts || []).filter(x => x.id !== r.id), keep];
}
function kbPrune() {
  const min = Date.now() - KB_HOURS * 3600000;
  const before = (shoppingReceipts || []).length;
  shoppingReceipts = (shoppingReceipts || []).filter(x => Number(x.at) > min);
  return before !== shoppingReceipts.length;
}
function kbOpenReview(id) {
  const r = (shoppingReceipts || []).find(x => x.id === id);
  if (!r) return;
  kbCur = JSON.parse(JSON.stringify(r));
  if (!kbCur.applied) kbAutoMatch(kbCur); // list may have changed since
  kbRenderReview();
}
function kbForget(id) {
  shoppingReceipts = (shoppingReceipts || []).filter(x => x.id !== id);
  persistState();
  if (currentView === 'einkauf') renderShoppingList();
}

/* ---------- Receipts of the last 48 h on the shopping overview ---------- */
function kbPendingHtml() {
  if (kbPrune()) persistState();
  const list = (shoppingReceipts || []).slice().sort((a, b) => b.at - a.at);
  if (!list.length) return '';
  return `<div class="kb-pending mb-3">${list.map(r => {
    const h = Math.max(1, Math.ceil((r.at + KB_HOURS * 3600000 - Date.now()) / 3600000));
    const d = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString(sysLocale(), { day: 'numeric', month: 'numeric' }) : '';
    return `<div class="kb-pending-row${r.applied ? '' : ' is-open'}">
      <button type="button" class="flex-1 min-w-0 text-left" data-kbopen="${escapeHtml(r.id)}">
        <span class="block text-sm font-medium truncate">🧾 ${escapeHtml([r.store, d, fmtEur(r.total)].filter(Boolean).join(' · '))}</span>
        <span class="block text-[11px] ${r.applied ? 'text-ink/45' : 'text-amber-700'}">${escapeHtml(tk(r.applied ? 'kb.pendingApplied' : 'kb.pendingOpen', { h }))}</span>
      </button>
      <button type="button" class="shrink-0 w-7 h-7 rounded-full text-ink/40 hover:text-ink hover:bg-ink/5" data-kbforget="${escapeHtml(r.id)}" aria-label="${escapeHtml(tk('overview.hide'))}" title="${escapeHtml(tk('overview.hide'))}">×</button>
    </div>`;
  }).join('')}</div>`;
}
function kbRenderPending() {
  const box = document.getElementById('kbPendingBox');
  if (box) box.innerHTML = kbPendingHtml();
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const o = e.target.closest && e.target.closest('[data-kbopen]');
    if (o) { kbOpenReview(o.dataset.kbopen); return; }
    const f = e.target.closest && e.target.closest('[data-kbforget]');
    if (f) { kbForget(f.dataset.kbforget); return; }
    const b = e.target.closest && e.target.closest('[data-kbpick]');
    if (b) kbPick(b.dataset.kbpick === '1' ? (currentShoppingListId || '') : '');
  });
}

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('kassenbon');
