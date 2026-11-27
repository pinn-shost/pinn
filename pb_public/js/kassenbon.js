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

/* Receipts look different in every country (since 1.169.1). The words for total, amount due, payment, tax, deposit, discount and
   loyalty programmes are listed for all app languages (compared after kbLow: lower case, accents removed).
   Amounts with comma or dot, thousands with dot, comma or space, currency before or after the amount; currencies
   without cents (yen, won, forint) are recognised when the receipt shows no amounts with two decimals. */
function kbLow(s) {
  return String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/æ/g, 'ae')
    .replace(/ı/g, 'i').replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}
function kbEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const KB_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// mode 'start': word at the start of the line; 'word': whole word anywhere; 'end': also as the end of a compound
// ("einwegpfand", "sofortrabatt"). Words in Chinese/Japanese/Korean match anywhere (no spaces between words).
function kbWordsRe(words, mode) {
  const lat = [], cjk = [];
  words.forEach(w => { const l = kbEsc(kbLow(w)); if (KB_CJK.test(w)) cjk.push(l); else lat.push(l); });
  const lead = mode === 'start' ? '^[^\\p{L}\\p{N}]*' : (mode === 'word' ? '(?:^|[^\\p{L}\\p{N}])' : '');
  const alts = [];
  if (lat.length) alts.push(lead + '(?:' + lat.join('|') + ')(?![\\p{L}\\p{N}])');
  if (cjk.length) alts.push((mode === 'start' ? '^[^\\p{L}\\p{N}]*' : '') + '(?:' + cjk.join('|') + ')');
  return new RegExp(alts.join('|'), 'u');
}
const KB_W = {
  sub: ['zwischensumme', 'subtotal', 'sub-total', 'sub total', 'sous-total', 'sous total', 'subtotale', 'subtotaal', 'podsuma',
    'промежуточный итог', 'подытог', 'ara toplam', 'проміжний підсумок', 'mezisoučet', 'delsumma', 'mellemsum', 'delsum', 'välisumma',
    'részösszeg', '小计', '小計', '소계'],
  total: ['summe', 'gesamt', 'gesamtsumme', 'gesamtbetrag', 'endsumme', 'total', 'totale', 'totale complessivo', 'totaal', 'importe total',
    'montant', 'suma', 'razem', 'итог', 'итого', 'всего', 'сумма', 'toplam', 'genel toplam', 'разом', 'всього', 'сума', 'celkem',
    'celková částka', 'summa', 'totalt', 'i alt', 'yhteensä', 'összesen', 'végösszeg', '合计', '合計', '总计', '總計', 'お買上', '합계', '총액', '총합계'],
  due: ['zu zahlen', 'zu zahlender betrag', 'à payer', 'net à payer', 'total à payer', 'a pagar', 'total a pagar', 'da pagare', 'te betalen',
    'do zapłaty', 'к оплате', 'ödenecek', 'до сплати', 'k úhradě', 'k zaplacení', 'att betala', 'at betale', 'å betale', 'maksettava',
    'fizetendő', '应付', '應付', '实付', '實付', 'お支払', 'ご請求', '받을금액', '결제금액', '청구금액', 'amount due', 'balance due', 'to pay', 'total due'],
  tender: ['geg', 'gegeben', 'rückgeld', 'bar', 'visa', 'mastercard', 'maestro', 'girocard', 'ec-karte', 'ec karte', 'kartenzahlung',
    'betrag eur', 'amex', 'paypal', 'kreditkarte', 'carte', 'carte bancaire', 'cb', 'espèces', 'rendu', 'monnaie rendue', 'efectivo',
    'tarjeta', 'cambio', 'contanti', 'contante', 'pagamento', 'bancomat', 'carta di credito', 'resto', 'multibanco', 'mb way', 'numerário',
    'troco', 'pinnen', 'pin', 'contant', 'wisselgeld', 'gotówka', 'karta', 'reszta', 'наличными', 'наличные', 'безналичными', 'карта',
    'сдача', 'nakit', 'kredi kartı', 'para üstü', 'готівка', 'картка', 'решта', 'hotově', 'platba', 'vráceno', 'kontant', 'kontanter',
    'kort', 'kortbetalning', 'växel', 'dankort', 'byttepenge', 'bankaxept', 'bankkort', 'vipps', 'vekselpenger', 'käteinen', 'pankkikortti',
    'korttimaksu', 'vaihtoraha', 'készpénz', 'bankkártya', 'kártya', 'visszajáró', '现金', '現金', '微信', '支付宝', '找零', '找赎', 'お預',
    'お釣', '釣銭', 'クレジット', '현금', '카드', '거스름', 'cash', 'card', 'change', 'apple pay', 'google pay', 'contactless', 'debit'],
  tax: ['mwst', 'ust', 'netto', 'steuer', 'mehrwertsteuer', 'umsatzsteuer', 'brutto', 'tva', 'iva', 'btw', 'vat', 'ptu',
    'sprzedaż opodatkowana', 'ндс', 'kdv', 'topkdv', 'пдв', 'dph', 'moms', 'mva', 'alv', 'áfa', 'tax', '税', '부가세', '과세', '면세'],
  bonus: ['bonus', 'bonus-guthaben', 'punkte', 'punktestand', 'guthaben', 'payback', 'deutschlandcard', 'lidl plus', 'points', 'point',
    'fidélité', 'clubcard', 'nectar', 'puntos', 'punti', 'punten', 'punkty', 'saldo', 'баллы', 'баллов', 'бонус', 'бонусы', 'бали', 'балів',
    'puan', 'poäng', 'poeng', 'pisteet', 'plussa', 'plussa-pisteet', 'pont', 'pontok', '积分', '積分', 'ポイント', '포인트', '적립'],
  save: ['savings', 'you saved', 'économisé', 'économie', 'ahorro', 'ha ahorrado', 'risparmio', 'hai risparmiato', 'poupou', 'poupança',
    'voordeel', 'oszczędzasz', 'oszczędności', 'экономия', 'сэкономили', 'tasarruf', 'kazancınız', 'економія', 'ušetřil', 'ušetřili',
    'sparat', 'sparet', 'gespart', 'ersparnis', 'säästit', 'säästö', 'megtakarítás', '节省', '節省', '已省', 'お得', '절약'],
  deposit: ['pfand', 'leergut', 'leerg', 'leihgebinde', 'consigne', 'deposit', 'envase', 'vuoto', 'cauzione', 'statiegeld', 'emballage',
    'kaucja', 'залог', 'тара', 'depozito', 'застава', 'záloha', 'pant', 'pantti', 'betétdíj', '押金', 'デポジット', '보증금', '공병'],
  discount: ['coupon', 'rabatt', 'nachlass', 'gutschein', 'preisvorteil', 'aktion', 'mitarbeiter', 'remise', 'réduction', 'promo',
    'descuento', 'desconto', 'dto', 'oferta', 'sconto', 'promozione', 'korting', 'actie', 'rabat', 'upust', 'promocja', 'скидка', 'акция',
    'indirim', 'kampanya', 'знижка', 'акція', 'sleva', 'alennus', 'tarjous', 'etu', 'kedvezmény', 'akció', '折扣', '优惠', '優惠', '値引',
    '割引', '할인', 'discount', 'voucher', 'offer'],
  noitem: ['tse', 'signatur', 'beleg-nr', 'bon-nr', 'trace-nr', 'terminal', 'kundenbeleg', 'kartennr', 'tel', 'telefon', 'fax', 'uid',
    'st-nr', 'steuer-nr', 'nip', 'инн', 'тел', 'vergi', 'ičo', 'dič', 'org.nr', 'cvr', 'y-tunnus', 'adószám', 'iban', 'bic', '사업자',
    '電話', '电话', '登録番号', '税号'],
};
const KB_RE = {
  sub: kbWordsRe(KB_W.sub, 'start'), total: kbWordsRe(KB_W.total, 'start'), due: kbWordsRe(KB_W.due, 'start'),
  tender: kbWordsRe(KB_W.tender, 'start'), tax: kbWordsRe(KB_W.tax, 'word'), bonus: kbWordsRe(KB_W.bonus, 'word'),
  save: kbWordsRe(KB_W.save, 'word'), deposit: kbWordsRe(KB_W.deposit, 'end'), discount: kbWordsRe(KB_W.discount, 'end'),
  noitem: kbWordsRe(KB_W.noitem, 'word'),
};
// [words, shop name, only in the head of the receipt (word is too common)]
const KB_STORE_LIST = [
  [['rewe'], 'REWE'], [['lidl'], 'Lidl'], [['aldi'], 'ALDI'], [['edeka'], 'EDEKA'], [['kaufland'], 'Kaufland'], [['penny'], 'Penny'],
  [['rossmann'], 'Rossmann'], [['müller', 'mueller'], 'Müller', true], [['tegut'], 'tegut'], [['globus'], 'Globus'], [['norma'], 'Norma', true],
  [['netto'], 'Netto', true], [['budni'], 'Budni'], [['bio company'], 'Bio Company'], [['alnatura'], 'Alnatura'],
  [['tesco'], 'Tesco'], [["sainsbury's", 'sainsburys'], "Sainsbury's"], [['asda'], 'Asda'], [['morrisons'], 'Morrisons'],
  [['waitrose'], 'Waitrose'], [['boots'], 'Boots', true], [['superdrug'], 'Superdrug'],
  [['carrefoursa'], 'CarrefourSA'], [['carrefour'], 'Carrefour'], [['e.leclerc', 'leclerc'], 'E.Leclerc'], [['auchan'], 'Auchan'],
  [['intermarché'], 'Intermarché'], [['monoprix'], 'Monoprix'], [['franprix'], 'Franprix'],
  [['mercadona'], 'Mercadona'], [['eroski'], 'Eroski'], [['alcampo'], 'Alcampo'], [['consum'], 'Consum', true], [['dia'], 'Dia', true],
  [['esselunga'], 'Esselunga'], [['conad'], 'Conad'], [['eurospin'], 'Eurospin'], [['despar'], 'Despar'],
  [['continente'], 'Continente'], [['pingo doce'], 'Pingo Doce'], [['minipreço'], 'Minipreço'],
  [['albert heijn'], 'Albert Heijn'], [['jumbo'], 'Jumbo', true], [['kruidvat'], 'Kruidvat'], [['etos'], 'Etos', true],
  [['biedronka'], 'Biedronka'], [['żabka'], 'Żabka'], [['stokrotka'], 'Stokrotka'], [['dino'], 'Dino', true], [['hebe'], 'Hebe', true],
  [['пятёрочка'], 'Пятёрочка'], [['магнит'], 'Магнит'], [['перекрёсток'], 'Перекрёсток'], [['ашан'], 'Ашан'], [['вкусвилл'], 'ВкусВилл'],
  [['лента'], 'Лента', true], [['сільпо'], 'Сільпо'], [['атб'], 'АТБ', true], [['новус'], 'Novus'], [['фора'], 'Фора', true],
  [['migros'], 'Migros'], [['bim'], 'BİM', true], [['a101'], 'A101'], [['şok'], 'ŞOK', true], [['gratis'], 'Gratis', true], [['watsons'], 'Watsons'],
  [['billa'], 'Billa'], [['albert'], 'Albert', true], [['teta'], 'Teta', true],
  [['willys'], 'Willys'], [['hemköp'], 'Hemköp'], [['ica'], 'ICA', true], [['apotek'], 'Apotek', true],
  [['føtex'], 'Føtex'], [['bilka'], 'Bilka'], [['rema 1000'], 'REMA 1000'], [['meny'], 'Meny', true], [['matas'], 'Matas'],
  [['kiwi'], 'Kiwi', true], [['bunnpris'], 'Bunnpris'], [['joker'], 'Joker', true],
  [['k-citymarket', 'k-supermarket', 'k-market', 'k-ruoka'], 'K-Ruoka'], [['s-market'], 'S-market'], [['prisma'], 'Prisma', true],
  [['alepa'], 'Alepa'], [['tokmanni'], 'Tokmanni'], [['cba'], 'CBA', true], [['coop'], 'Coop', true], [['spar'], 'Spar', true],
  [['ローソン', 'lawson'], 'ローソン'], [['セブン-イレブン', 'セブンイレブン', '7-eleven'], '7-Eleven'], [['ファミリーマート', 'familymart'], 'ファミリーマート'],
  [['イオン', 'aeon'], 'イオン'], [['永辉'], '永辉'], [['盒马'], '盒马'], [['沃尔玛', 'walmart'], 'Walmart'], [['家乐福'], '家乐福'],
  [['이마트', 'emart'], '이마트'], [['홈플러스'], '홈플러스'], [['롯데마트'], '롯데마트'], [['gs25'], 'GS25'],
];
const KB_STORES = [[/dm-?drogerie|dm-rabatte|\bdm\.de\b|\bdmbio\b/i, 'dm', false]]
  .concat(KB_STORE_LIST.map(([w, name, head]) => [kbWordsRe(w, 'word'), name, !!head]));
const KB_DRUGSTORES = ['dm', 'Rossmann', 'Müller', 'Budni', 'Boots', 'Superdrug', 'Kruidvat', 'Etos', 'Hebe', 'Watsons', 'Gratis', 'Matas', 'Apotek'];

// Amount patterns (built per receipt: with or without cents)
const KB_CPRE = '(?:[€$£¥￥₩₺₴₽]|' + ['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'CZK', 'HUF', 'SEK', 'DKK', 'NOK', 'TRY', 'UAH', 'RUB', 'JPY', 'KRW', 'CNY', 'RMB']
  .map(c => c + '|' + c.toLowerCase()).join('|') + ')';
const KB_CPOST = '(?:' + ['€', 'EUR', 'eur', 'zł', 'PLN', 'Kč', 'CZK', 'kr', 'SEK', 'DKK', 'NOK', 'Ft', 'HUF', 'TL', '₺', 'грн', '₴', 'руб', 'р', '₽',
  '円', '원', '元', '£', '\\$', 'CHF', 'USD', 'GBP', 'RUB', 'UAH', 'TRY', 'JPY', 'KRW', 'CNY'].join('|') + ')\\.?';
const KB_UNITS = '(?:stk|st|szt|шт|ks|kpl|db|adet|pz|pcs|pc|uds|ud|un|stuks|kg|кг|個|个|개|点)';
function kbRes(zero) {
  const amt = zero ? '(?:\\d{1,3}(?:[.,\\u00a0\\u202f ]\\d{3})+|\\d+)' : '(?:\\d{1,3}(?:[.,\\u00a0\\u202f ]\\d{3})+|\\d+)[.,]\\d{2}';
  const price = `([=*]?\\s*-?\\s*${KB_CPRE}?\\s*[=*]?\\s*-?\\s*${amt}-?)(?:\\s*${KB_CPOST})?`;
  const marks = '(?:\\s*§[0-9A-Z]{1,2}|\\s*[A-ZА-Я][0-9]{0,2}\\*?|\\s+[0-9]{1,2}|\\s*[*※軽#外内])*';
  const per = `(?:\\s*${KB_CPOST})?(?:\\s*\\/\\s*\\p{L}{1,3})?`;
  return {
    zero,
    amt: new RegExp('^' + amt + '$', 'u'),
    item: new RegExp(`^(.*?\\S)\\s+${price}${marks}\\s*$`, 'u'),
    end: new RegExp(`(?:^|\\s|:)${price}${marks}\\s*$`, 'u'),
    // "2 Stk x 2,99", "1,180 kg x 19,90 EUR/kg", "1 х 89.99 =89.99", "0.890 kg @ £1.10/kg"
    qty: new RegExp(`^(\\d+(?:[.,]\\d{1,3})?)\\s*(${KB_UNITS})?\\.?\\s*[x×*@хX]\\s*${KB_CPRE}?\\s*(${amt})${per}(?:\\s*=?\\s*${KB_CPRE}?\\s*(${amt}))?\\s*$`, 'iu'),
    // "0,820 KG 1,99 €/KG" (Finland)
    qtyKg: new RegExp(`^(\\d+[.,]\\d{1,3})\\s*(?:kg|кг)\\s+${KB_CPRE}?\\s*(${amt})\\s*(?:${KB_CPOST})?\\s*\\/\\s*(?:kg|кг)\\s*$`, 'iu'),
    inX: new RegExp(`\\s+(\\d+(?:[.,]\\d{1,3})?)\\s*(${KB_UNITS})?\\.?\\s*[x×*@хX]\\s*${KB_CPRE}?\\s*(${amt})${per}$`, 'iu'),
    inKg: new RegExp(`\\s+(\\d+[.,]\\d{1,3})\\s*(?:kg|кг)\\s+${KB_CPRE}?\\s*(${amt})\\s*(?:${KB_CPOST})?\\s*\\/\\s*(?:kg|кг)$`, 'iu'),
    tabUQ: new RegExp(`\\s+${KB_CPRE}?(${amt})\\s+(\\d{1,3})$`, 'u'),   // unit price, quantity (Korea)
    tabQU: new RegExp(`\\s+(\\d{1,3})\\s+${KB_CPRE}?(${amt})$`, 'u'),   // quantity, unit price (China)
    tailU: new RegExp(`\\s+${KB_CPRE}?(${amt})$`, 'u'),
    pre: new RegExp(`^(\\d+)\\s*[x×]\\s+(${amt})\\s+(.+)$`, 'iu'),      // dm: "3x 4,95 babylove Öko Pants"
  };
}
function kbAmt(s, zero) {
  const str = String(s || '');
  const neg = /-/.test(str);
  const d = str.replace(/[^\d.,]/g, '');
  let n;
  if (zero) n = Number(d.replace(/[.,]/g, ''));
  else { const m = /^(.*)[.,](\d{2})$/.exec(d); n = m ? Number(m[1].replace(/[.,]/g, '') + '.' + m[2]) : Number(d.replace(',', '.')); }
  n = n || 0;
  return neg ? -n : n;
}
function kbMoney(s) { return kbAmt(s, false); }
function kbNum(s) { return Number(String(s || '').replace(',', '.')) || 0; }
function kbRound(n) { return Math.round(n * 100) / 100; }
function kbRound3(n) { return Math.round(n * 1000) / 1000; } // pantry amounts (kg with grams)
function kbZeroDecimals(texts) {
  const n = texts.filter(t => /\d[.,]\d{2}(?!\d)/.test(t.replace(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\.?/g, ' ').replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' '))).length;
  return n < 2;
}
function kbPretty(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters || letters !== letters.toUpperCase() || letters === letters.toLowerCase()) return s; // mixed case or no case (CJK)
  return s.toLowerCase().replace(/(^|[\s.\-/(])(\p{Ll})/gu, (m, a, b) => a + b.toUpperCase());
}
function kbStoreOf(texts) {
  const head = kbLow(texts.slice(0, 8).join('\n'));
  const all = kbLow(texts.join('\n'));
  // The shop name in the head wins; otherwise a clear hint anywhere (dm has no name at the top)
  for (const [re, name] of KB_STORES) if (re.test(head)) return name;
  for (const [re, name, headOnly] of KB_STORES) if (!headOnly && re.test(all)) return name;
  const first = texts.find(t => /\p{L}{2}/u.test(t) && !/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(t));
  return first ? kbPretty(first).slice(0, 40) : '';
}
// Bonus programmes: only information for the note, never part of the amount
function kbBonusNote(texts, store) {
  const one = texts.join(' ').replace(/\s+/g, ' ');
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
  if (parts.length) return parts.join(' · ');
  // Any other country/programme: the receipt's own lines about points or credit, word for word
  const lines = texts.filter(t => KB_RE.bonus.test(kbLow(t)) && !KB_RE.save.test(kbLow(t)) && !/-\s*\d/.test(t));
  const withNum = lines.filter(t => /\d/.test(t)).slice(0, 3).map(t => t.slice(0, 80));
  if (withNum.length) return withNum.join(' · ');
  return lines.length ? tk('kb.bonusSeen') : '';
}
// Date in any common order; day/month order is ambiguous only with "/" (US devices: month first)
function kbDate(texts) {
  const iso = (y, mo, d) => {
    y = Number(y); mo = Number(mo); d = Number(d);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2099) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };
  const us = typeof sysLocale === 'function' && /^en-US/i.test(sysLocale());
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    let m = /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(t);
    if (m && iso(m[1], m[2], m[3])) return { date: iso(m[1], m[2], m[3]), line: i };
    m = /(?:^|[^\d])(20\d{2})([-./])(\d{1,2})\2(\d{1,2})(?!\d)/.exec(t);
    if (m && iso(m[1], m[3], m[4])) return { date: iso(m[1], m[3], m[4]), line: i };
    m = /(?:^|[^\d.,])(\d{1,2})([./-])(\d{1,2})\2(20\d{2}|\d{2})(?![\d,])/.exec(t);
    if (m) {
      const a = Number(m[1]), b = Number(m[3]);
      const monthFirst = a <= 12 && (b > 12 || (m[2] === '/' && us));
      const v = monthFirst ? iso(m[4], a, b) : iso(m[4], b, a);
      if (v) return { date: v, line: i };
    }
  }
  return { date: '', line: -1 };
}
function kbTime(texts, dateLine) {
  const kw = /(?:uhrzeit|zeit|heure|hora|ora|tijd|godz|godzina|время|saat|čas|cas|tid|klo|ido|time|時刻|시간)\D{0,3}(\d{1,2}):(\d{2})/i;
  const plain = /(?:^|[^\d:])(\d{1,2}):(\d{2})(?!\d)/;
  for (const t of texts) { const m = kw.exec(kbLow(t)); if (m) return m[1].padStart(2, '0') + ':' + m[2]; }
  const own = dateLine >= 0 ? plain.exec(texts[dateLine]) : null;
  if (own) return own[1].padStart(2, '0') + ':' + own[2];
  for (const t of texts) { const m = plain.exec(t); if (m && Number(m[1]) < 24) return m[1].padStart(2, '0') + ':' + m[2]; }
  return '';
}
function kbCleanName(s) {
  return String(s || '').replace(/\s*\+\s*\d+[.,]\d{2}\s*€?\s*pfand$/i, '')  // dm: "Vöslauer Limo Himb.+0,25€Pfand" (deposit is an own line)
    .replace(/\s+%\s?\d{1,2}$/, '')                                         // Turkey: tax rate before the price ("SÜT %1 *24,50")
    .replace(new RegExp(`\\s*${KB_CPOST}$`, 'u'), '').replace(/[\s*=:]+$/, '').trim();
}
// Quantity written into the name ("Chleb 2 x2,79", "Banány 0,850 kg x 29,90", "서울우유 2,980 1", "牛奶 2 5.50", "2 LECHE 0,99")
function kbInlineQty(name, price, R, tol) {
  const fits = (q, u) => Math.abs(q * u - Math.abs(price)) <= tol + Math.abs(price) * 0.01;
  let m = R.inX.exec(name);
  if (m) {
    const n = kbNum(m[1]), kg = /[.,]/.test(m[1]) || /kg|кг/i.test(m[2] || '');
    return { name: name.slice(0, m.index), qty: kg ? 1 : (n || 1), kg: kg ? n : 0 };
  }
  m = R.inKg.exec(name);
  if (m) return { name: name.slice(0, m.index), qty: 1, kg: kbNum(m[1]) };
  m = R.tabUQ.exec(name);
  if (m && fits(Number(m[2]), kbAmt(m[1], R.zero))) return { name: name.slice(0, m.index), qty: Number(m[2]) || 1, kg: 0 };
  m = R.tabQU.exec(name);
  if (m && fits(Number(m[1]), kbAmt(m[2], R.zero))) return { name: name.slice(0, m.index), qty: Number(m[1]) || 1, kg: 0 };
  m = /^(\d{1,2})\s+(?=\p{L})/u.exec(name); // Spain/Portugal: count in front of the name
  if (m) {
    const q = Number(m[1]) || 1;
    let rest = name.slice(m[0].length);
    const u = R.tailU.exec(rest);
    if (u && fits(q, kbAmt(u[1], R.zero))) rest = rest.slice(0, u.index);
    return { name: rest, qty: q, kg: 0 };
  }
  m = R.pre.exec(name);
  if (m) return { name: m[3], qty: Number(m[1]) || 1, kg: 0 };
  return null;
}
// Total line whose first word after the keyword is a tax word ("SUMA PTU", "TOTAL TVA") is the tax total, not the receipt total
function kbTaxTotal(low) {
  const w = /^[^\p{L}]*(\p{L}+)/u.exec(low.replace(KB_RE.total, ''));
  return !!(w && KB_RE.tax.test(w[1]));
}
// lines: text lines of the PDF (top to bottom). -> receipt or null
function kbParse(lines) {
  const texts = lines.map(l => String(l && l.text !== undefined ? l.text : l).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const zero = kbZeroDecimals(texts);
  const R = kbRes(zero);
  const tol = zero ? 1.01 : 0.021;
  const store = kbStoreOf(texts);
  const items = [];
  let phase = 'head';
  let sum = 0, pay = 0, pendName = '', pendQty = null;
  const applyQty = (it, q) => { if (q.kg) { it.kg = q.kg; it.qty = 1; } else it.qty = q.qty || 1; if (q.unit) it.unitPrice = q.unit; };
  const addItem = (raw, price) => {
    let name = kbCleanName(raw);
    let qty = 1, kg = 0;
    const iq = kbInlineQty(name, price, R, tol);
    if (iq && /\p{L}/u.test(iq.name)) { name = kbCleanName(iq.name); qty = iq.qty; kg = iq.kg; }
    const kind = KB_RE.deposit.test(kbLow(name)) ? 'deposit' : 'item';
    const it = { raw: name, name: kbPretty(name), qty, price, kind };
    if (kg) it.kg = kg;
    items.push(it);
    phase = 'items';
    pendName = '';
    if (pendQty) {
      const target = Math.abs(Math.abs(price) - pendQty.tot) <= tol ? it : pendQty.prev;
      if (target && target.kind === 'item') applyQty(target, pendQty);
      pendQty = null;
    }
  };
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const low = kbLow(t);
    const last = items[items.length - 1];
    if (KB_RE.save.test(low)) { pendName = ''; continue; } // "you saved …" – already in the prices
    const em = R.end.exec(t);
    const amt = em ? kbAmt(em[1], zero) : null;
    // Amount lines for an item: under it (Germany), above it (France) or carrying the price (Russia, after the name line)
    let q = R.qty.exec(t);
    const qk = q ? null : R.qtyKg.exec(t);
    if ((q || qk) && phase !== 'end' && phase !== 'after') {
      const n = kbNum(q ? q[1] : qk[1]);
      const unit = kbAmt(q ? q[3] : qk[2], zero);
      const isKg = !q || /[.,]/.test(q[1]) || /kg|кг/i.test(q[2] || '');
      const tot = q && q[4] ? Math.abs(kbAmt(q[4], zero)) : kbRound(n * unit);
      const info = { qty: isKg ? 1 : (n || 1), kg: isKg ? n : 0, unit, tot };
      if (pendName) { addItem(pendName, tot); applyQty(items[items.length - 1], info); continue; }
      if (last && last.kind === 'item' && phase === 'items' && Math.abs(Math.abs(last.price) - tot) <= tol + tot * 0.01) { applyQty(last, info); continue; }
      pendQty = { ...info, prev: last && phase === 'items' ? last : null };
      continue;
    }
    if (amt !== null && KB_RE.due.test(low)) { pay = Math.abs(amt); phase = 'end'; continue; }
    if (amt !== null && KB_RE.sub.test(low)) { if (phase !== 'end') phase = 'discounts'; pendName = ''; continue; }
    if (amt !== null && KB_RE.total.test(low) && !kbTaxTotal(low)) { if (!sum) sum = Math.abs(amt); if (phase !== 'end') phase = 'after'; pendName = ''; continue; }
    if ((sum || phase === 'after' || phase === 'discounts') && KB_RE.tender.test(low)) { phase = 'end'; continue; }
    if (phase === 'end') continue;
    const m = R.item.exec(t);
    if (!m) {
      // A name without a price – the price may follow on the next line
      pendName = (phase === 'head' || phase === 'items') && /\p{L}{2}/u.test(t) && !KB_RE.tax.test(low) && !KB_RE.noitem.test(low) && !KB_RE.bonus.test(low) ? t : '';
      continue;
    }
    const price = kbAmt(m[2], zero);
    const name = m[1];
    if (!/\p{L}/u.test(name)) { if (pendName && phase !== 'after' && phase !== 'discounts') addItem(pendName, price); continue; } // "=89.99"
    if (KB_RE.noitem.test(low)) { pendName = ''; continue; }
    const deposit = KB_RE.deposit.test(kbLow(kbCleanName(name)));
    if (price < 0 && !deposit) {
      // A discount right under an item belongs to that item (REWE "Rabatt", Lidl "Preisvorteil", AH "BONUS", 値引)
      if (phase === 'items' && last && last.kind === 'item') { last.price = kbRound(last.price + price); last.discount = kbRound((last.discount || 0) + price); pendName = ''; continue; }
      if (phase !== 'head' || KB_RE.discount.test(low)) items.push({ raw: kbCleanName(name), name: kbPretty(kbCleanName(name)), qty: 1, price, kind: 'discount' });
      pendName = '';
      continue;
    }
    if (KB_RE.tax.test(low) || (KB_RE.bonus.test(low) && !deposit)) { pendName = ''; continue; } // tax table, points info
    if (phase === 'after' || phase === 'discounts') continue; // other lines between total and payment
    addItem(name, price);
  }
  if (pendQty && pendQty.prev && pendQty.prev.kind === 'item') applyQty(pendQty.prev, pendQty);
  if (!items.length) return null;
  const calc = kbRound(items.reduce((a, x) => a + x.price, 0));
  const total = pay || sum || calc;
  const d = kbDate(texts);
  const allLow = kbLow(texts.join('\n'));
  const no = /(?:bon-?nr|beleg-?nr|ta-?nummer|bonnummer|ticket|receipt|transaction|trans|paragon|чек|fis|uctenka|kvitto|kvittering|kuitti|nyugta|单号|レシート|영수증)\.?\s*(?:nr\.?|no\.?|n°|#|№)?\s*:?\s*(\d{2,})/.exec(allLow);
  return {
    store, date: d.date, time: kbTime(texts, d.line), total: kbRound(total), sumOk: Math.abs(calc - total) <= (zero ? 1 : 0.02), calc,
    receiptNo: no ? no[1] : '', note: kbBonusNote(texts, store), items, zero,
  };
}

/* ---------- Comparing names ---------- */
// Filler and brand words that say nothing about the product (already folded like kbTokens)
const KB_STOP = new Set(['bio', 'eko', 'eco', 'organic', 'organique', 'biologico', 'biologisch', 'ekologiczne', 'ekologisk', 'okologisk',
  'luomu', 'organik', 'ja', 'rewe', 'beste', 'wahl', 'dm', 'dmbio', 'gut', 'gunstig', 'classic', 'mw', 'eg', 'mehrweg', 'einweg', 'vf',
  'und', 'mit', 'der', 'die', 'das', 'fur', 'fuer', 'von', 'stk', 'st', 'pck', 'gr', 'kg', 'ml', 'ltr', 'eur', 'xl', 'xxl', 'pcs', 'pc', 'pz',
  'szt', 'шт', 'ks', 'kpl', 'db', 'adet', 'uds', 'ud', 'un', 'pack', 'pk', 'and', 'with', 'the', 'of', 'de', 'la', 'le', 'les', 'du', 'des',
  'et', 'con', 'di', 'del', 'della', 'en', 'het', 'van', 'met', 'na', 'och', 'med', 'og', 'ile', 've', 'ah', 'tesco', 'finest', 'value',
  'sainsbury', 'carrefour', 'auchan', 'hacendado', 'coop', 'ica', 'pirkka', 'rainbow', 'spar', 'kirkland', 'migros', 'eldorado', 'rema',
  'та', 'для']);
function kbNorm(s) {
  return kbLow(s)
    .replace(/\d+(?:[.,]\d+)?\s*(?:%|g|gr|kg|mg|ml|cl|dl|l|lt|ltr|st|stk|szt|шт|г|кг|мл|л|ks|kpl|db|pz|pcs|pc|oz|lb|pt|枚|个|個|개|입)(?![\p{L}])/gu, ' ')
    .replace(/[^\p{L}]+/gu, ' ').trim();
}
// Umlauts are folded twice: "Äpfel" (list) and "AEPFEL"/"APFEL" (receipt) must meet
function kbFold(t) { return t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'); }
// Words; Chinese/Japanese/Korean have no spaces – they are compared in pairs of characters ("おいしい牛乳" contains "牛乳")
function kbTokens(s) {
  const out = [];
  kbNorm(s).replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー]+)/gu, ' $1 ').split(' ').forEach(t => {
    if (!t) return;
    if (KB_CJK.test(t)) {
      const ch = Array.from(t);
      if (ch.length === 1) out.push(t); else for (let i = 0; i < ch.length - 1; i++) out.push(ch[i] + ch[i + 1]);
      return;
    }
    const f = kbFold(t);
    if (t.length >= 2 && !KB_STOP.has(t) && !KB_STOP.has(f)) out.push(f);
  });
  return out;
}
function kbKey(s) { return kbTokens(s).join(' '); }
// Rough stem for plural/case endings of the app languages ("tomatoes"/"tomato", "яблоки"/"яблоко", "elmalar"/"elma")
function kbStem(t) {
  if (KB_CJK.test(t)) return t;
  for (let i = 0; i < 2 && t.length > 4; i++) {
    const s = t.replace(/(lar|ler|en|er|es|ok|ek|ak|n|e|s|a|o|i|y|t|ы|и|а|я|о|е|ь|й|у|ю|і|ї)$/u, '');
    if (s === t) break;
    t = s;
  }
  return t;
}
function kbSim(r, c) {
  if (r === c) return 1;
  if (KB_CJK.test(c)) return Array.from(c).length === 1 && r.includes(c) ? 0.8 : 0;
  if (kbStem(r) === kbStem(c)) return 1;
  if (c.length >= 4 && r.length >= 3 && c.startsWith(r)) return 0.85;      // receipt abbreviation: "kart" -> "kartoffeln"
  // Compounds end with the thing itself: "schlagsahne" is a "sahne", but "tomatenmark" is no "tomaten"
  const cs = kbStem(c);
  if (c.length >= 4 && (r.endsWith(c) || (cs.length >= 4 && r.endsWith(cs)))) return 0.85;
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
