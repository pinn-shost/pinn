/* pinn. – Region: country, currency, number format, emergency numbers (js/region.js)
   Part of the app code that used to be an inline script in index.html. Classic script, no build step:
   it is loaded with <script src> in the <head> of index.html, at exactly the place of the former inline script, so it
   still runs while the <head> is parsed, after js/ruhemodus.js and the language script, before all other app files (the load order is listed in index.html
   and in pinn-setup.sh).
   Contents: window.PINN_REGION (countries, currencies, formats, money/num/parse, emergency numbers) and the switch of
   Intl.NumberFormat / Number.prototype.toLocaleString for German formats. Runs after the language script (i18n) and sets
   the class cur-before on <html> before the first paint. */

/* ==========================================================
   Region: country, currency, number format, emergency numbers
   ----------------------------------------------------------
   Applies per profile (Settings → Language & region) and is also remembered on the device, so that
   pinn. formats correctly right from the start. Internally pinn. always calculates with a dot as decimal
   separator; only display and input follow the chosen format.
   - Amounts: Intl.NumberFormat with German format (e.g. „de-DE“ + EUR) is switched automatically to the
     country, currency and number format – symbol in front or behind, as usual in the country.
   - Input: PINN_REGION.parse() understands comma and dot („1.234,56“, „1,234.56“, „12.99“, „5.000“).
   - Emergency numbers per country: emergency pass, SOS popup and „Ich bin unterwegs“.
   New country: one row in COUNTRIES (code, number locale, currency, police, ambulance, fire brigade,
   general emergency number or '').
   ========================================================== */
(function () {
  var KEY = 'pinn.region';
  var COUNTRIES = [
    ['DE', 'de-DE', 'EUR', '110', '112', '112', '112'],
    ['AT', 'de-AT', 'EUR', '133', '144', '122', '112'],
    ['CH', 'de-CH', 'CHF', '117', '144', '118', '112'],
    ['LI', 'de-LI', 'CHF', '117', '144', '118', '112'],
    ['LU', 'fr-LU', 'EUR', '113', '112', '112', '112'],
    ['BE', 'nl-BE', 'EUR', '101', '112', '112', '112'],
    ['NL', 'nl-NL', 'EUR', '112', '112', '112', '112'],
    ['FR', 'fr-FR', 'EUR', '17', '15', '18', '112'],
    ['MC', 'fr-MC', 'EUR', '17', '18', '18', '112'],
    ['ES', 'es-ES', 'EUR', '091', '112', '112', '112'],
    ['AD', 'ca-AD', 'EUR', '110', '118', '118', '112'],
    ['PT', 'pt-PT', 'EUR', '112', '112', '112', '112'],
    ['IT', 'it-IT', 'EUR', '113', '118', '115', '112'],
    ['MT', 'en-MT', 'EUR', '112', '112', '112', '112'],
    ['GB', 'en-GB', 'GBP', '999', '999', '999', '999'],
    ['IE', 'en-IE', 'EUR', '112', '112', '112', '112'],
    ['DK', 'da-DK', 'DKK', '112', '112', '112', '112'],
    ['NO', 'nb-NO', 'NOK', '112', '113', '110', ''],
    ['SE', 'sv-SE', 'SEK', '112', '112', '112', '112'],
    ['FI', 'fi-FI', 'EUR', '112', '112', '112', '112'],
    ['IS', 'is-IS', 'ISK', '112', '112', '112', '112'],
    ['PL', 'pl-PL', 'PLN', '997', '999', '998', '112'],
    ['CZ', 'cs-CZ', 'CZK', '158', '155', '150', '112'],
    ['SK', 'sk-SK', 'EUR', '158', '155', '150', '112'],
    ['HU', 'hu-HU', 'HUF', '107', '104', '105', '112'],
    ['SI', 'sl-SI', 'EUR', '113', '112', '112', '112'],
    ['HR', 'hr-HR', 'EUR', '192', '194', '193', '112'],
    ['RS', 'sr-Latn-RS', 'RSD', '192', '194', '193', ''],
    ['BA', 'bs-BA', 'BAM', '122', '124', '123', ''],
    ['RO', 'ro-RO', 'RON', '112', '112', '112', '112'],
    ['BG', 'bg-BG', 'EUR', '112', '112', '112', '112'],
    ['GR', 'el-GR', 'EUR', '100', '166', '199', '112'],
    ['CY', 'el-CY', 'EUR', '112', '112', '112', '112'],
    ['TR', 'tr-TR', 'TRY', '112', '112', '112', '112'],
    ['EE', 'et-EE', 'EUR', '112', '112', '112', '112'],
    ['LV', 'lv-LV', 'EUR', '110', '113', '112', '112'],
    ['LT', 'lt-LT', 'EUR', '112', '112', '112', '112'],
    ['UA', 'uk-UA', 'UAH', '102', '103', '101', '112'],
    ['US', 'en-US', 'USD', '911', '911', '911', '911'],
    ['CA', 'en-CA', 'CAD', '911', '911', '911', '911'],
    ['MX', 'es-MX', 'MXN', '911', '911', '911', '911'],
    ['BR', 'pt-BR', 'BRL', '190', '192', '193', ''],
    ['AR', 'es-AR', 'ARS', '911', '107', '100', ''],
    ['CL', 'es-CL', 'CLP', '133', '131', '132', ''],
    ['CO', 'es-CO', 'COP', '123', '123', '123', '123'],
    ['PE', 'es-PE', 'PEN', '105', '106', '116', ''],
    ['AU', 'en-AU', 'AUD', '000', '000', '000', '000'],
    ['NZ', 'en-NZ', 'NZD', '111', '111', '111', '111'],
    ['ZA', 'en-ZA', 'ZAR', '10111', '10177', '10177', '112'],
    ['IL', 'he-IL', 'ILS', '100', '101', '102', ''],
    ['AE', 'en-AE', 'AED', '999', '998', '997', ''],
    ['SA', 'en-SA', 'SAR', '999', '997', '998', ''],
    ['EG', 'en-EG', 'EGP', '122', '123', '180', ''],
    ['MA', 'fr-MA', 'MAD', '19', '15', '15', ''],
    ['IN', 'en-IN', 'INR', '112', '108', '101', '112'],
    ['CN', 'zh-CN', 'CNY', '110', '120', '119', ''],
    ['JP', 'ja-JP', 'JPY', '110', '119', '119', ''],
    ['KR', 'ko-KR', 'KRW', '112', '119', '119', ''],
    ['TW', 'zh-TW', 'TWD', '110', '119', '119', ''],
    ['HK', 'en-HK', 'HKD', '999', '999', '999', '999'],
    ['SG', 'en-SG', 'SGD', '999', '995', '995', ''],
    ['TH', 'th-TH', 'THB', '191', '1669', '199', ''],
    ['PH', 'en-PH', 'PHP', '911', '911', '911', '911'],
    ['ID', 'id-ID', 'IDR', '110', '118', '113', '112'],
    ['MY', 'ms-MY', 'MYR', '999', '999', '994', '999'],
    ['VN', 'vi-VN', 'VND', '113', '115', '114', ''],
  ];
  // Additional selectable currencies (all national currencies above are included anyway)
  var EXTRA_CURRENCIES = ['RUB'];
  // Number format: thousands and decimal separator (auto = as usual in the chosen country)
  var FORMATS = {
    de: { group: '.', decimal: ',', sample: '1.234,56' },
    en: { group: ',', decimal: '.', sample: '1,234.56' },
    fr: { group: '\u202f', decimal: ',', sample: '1 234,56' },
    ch: { group: '\u2019', decimal: '.', sample: '1\u2019234.56' },
    sp: { group: ' ', decimal: '.', sample: '1 234.56' },
  };
  var NF = Intl.NumberFormat.__pinnOrig || Intl.NumberFormat;   // original (in case it was already replaced)

  function findCountry(c) { for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i][0] === c) return COUNTRIES[i]; return null; }
  var CURRENCIES = (function () {
    var seen = {}, out = [];
    COUNTRIES.concat(EXTRA_CURRENCIES.map(function (x) { return [null, null, x]; })).forEach(function (r) { if (!seen[r[2]]) { seen[r[2]] = 1; out.push(r[2]); } });
    return out.sort();
  })();
  function readStored() {
    try { var o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  // Country of the device: „de-AT“ → AT; language only („de“) → typical country of that language; otherwise Germany
  function deviceCountry() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(String(list[i] || ''));
      if (m && findCountry(m[1].toUpperCase())) return m[1].toUpperCase();
    }
    var byLang = { de: 'DE', fr: 'FR', es: 'ES', it: 'IT', nl: 'NL', pt: 'PT', pl: 'PL', da: 'DK', sv: 'SE', nb: 'NO', fi: 'FI', cs: 'CZ', hu: 'HU', el: 'GR', tr: 'TR', ja: 'JP', zh: 'CN', ko: 'KR' };
    for (var j = 0; j < list.length; j++) { var l = String(list[j] || '').slice(0, 2).toLowerCase(); if (byLang[l]) return byLang[l]; }
    return 'DE';
  }
  function cleanSettings(o) {
    o = o || {};
    var land = findCountry(String(o.land || '').toUpperCase()) ? String(o.land).toUpperCase() : '';
    var w = String(o.waehrung || '').toUpperCase();
    var waehrung = CURRENCIES.indexOf(w) >= 0 ? w : 'auto';
    var zahlen = FORMATS[o.zahlen] ? o.zahlen : 'auto';
    return { land: land, waehrung: waehrung, zahlen: zahlen };
  }

  // Compute the complete settings of a country/format (without the replaced formatters)
  function partsOf(nf, v) { try { return nf.formatToParts(v); } catch (e) { return []; } }
  function localeOf(row) {
    var loc = row[1] + '-u-nu-latn';
    try { new NF(loc); } catch (e) { loc = row[1]; }
    return loc;
  }
  function currencyNF(loc, cur) {
    try { return new NF(loc, { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }); }
    catch (e) { return new NF(loc, { style: 'currency', currency: cur }); }
  }
  function compute(set) {
    var row = findCountry(set.land) || findCountry(deviceCountry()) || COUNTRIES[0];
    var loc = localeOf(row);
    var cur = set.waehrung !== 'auto' ? set.waehrung : row[2];
    var g = '.', d = ',';
    partsOf(new NF(loc, { minimumFractionDigits: 2, useGrouping: true }), 1234567.5).forEach(function (p) {
      if (p.type === 'group') g = p.value;
      if (p.type === 'decimal') d = p.value;
    });
    var over = FORMATS[set.zahlen] || null;
    if (over) { g = over.group; d = over.decimal; }
    if (d !== ',' && d !== '.') d = '.';
    var mnf = currencyNF(loc, cur);
    var nk = 2;
    try { nk = mnf.resolvedOptions().maximumFractionDigits; } catch (e) { nk = 2; }
    var sym = cur, vorne = false, sawNum = false;
    partsOf(mnf, 1).forEach(function (p) {
      if (p.type === 'integer') sawNum = true;
      if (p.type === 'currency') { sym = p.value; vorne = !sawNum; }
    });
    return {
      row: row, locale: loc, currency: cur, group: g, decimal: d, override: over, digits: nk, symbol: sym, before: vorne,
      notruf: { polizei: row[3], rettung: row[4], feuer: row[5], allgemein: row[6] || '' },
    };
  }
  function sameSet(a, b) { return a.land === b.land && a.waehrung === b.waehrung && a.zahlen === b.zahlen; }

  var stored = cleanSettings(readStored());
  var C = compute(stored);
  if (!stored.land) stored.land = C.row[0];

  function relabel(nf) {
    if (!C.override) return nf;
    var fp = nf.formatToParts.bind(nf);
    try {
      Object.defineProperty(nf, 'format', {
        configurable: true,
        value: function (v) { return fp(v).map(function (p) { return p.type === 'decimal' ? C.decimal : p.type === 'group' ? C.group : p.value; }).join(''); },
      });
    } catch (e) { /* keeps the country format */ }
    return nf;
  }
  function isDe(l) {
    if (typeof l === 'string') return /^de(-|$)/i.test(l);
    return Array.isArray(l) && typeof l[0] === 'string' && /^de(-|$)/i.test(l[0]);
  }
  // Formatter in the country or chosen format; EUR becomes the chosen currency
  function makeNF(o) {
    var opt = o ? Object.assign({}, o) : {};
    if (opt.currency && String(opt.currency).toUpperCase() === 'EUR') opt.currency = C.currency;
    if (opt.style === 'currency' && !opt.currencyDisplay) {
      try { return relabel(new NF(C.locale, Object.assign({}, opt, { currencyDisplay: 'narrowSymbol' }))); } catch (e) { /* old browser */ }
    }
    return relabel(new NF(C.locale, opt));
  }
  function PinnNumberFormat(l, o) {
    if (isDe(l)) { try { return makeNF(o); } catch (e) { /* normal below */ } }
    return new NF(l, o);
  }
  PinnNumberFormat.prototype = NF.prototype;
  PinnNumberFormat.supportedLocalesOf = NF.supportedLocalesOf;
  PinnNumberFormat.__pinnOrig = NF;
  try { Intl.NumberFormat = PinnNumberFormat; } catch (e) { /* not overwritable */ }
  var numTL = Number.prototype.toLocaleString.__pinnOrig || Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) {
    if (isDe(l)) { try { return makeNF(o).format(Number(this)); } catch (e) { /* normal below */ } }
    return numTL.call(this, l, o);
  };
  Number.prototype.toLocaleString.__pinnOrig = numTL;

  function inputNum(v, dec) {
    if (v === '' || v == null || !isFinite(Number(v))) return '';
    var x = Number(v);
    var s = dec == null ? String(Math.round(x * 1000) / 1000) : x.toFixed(dec);
    return s.replace('.', C.decimal);
  }
  // Number from an input: comma or dot, thousands separators, currency signs and spaces allowed
  function parse(str) {
    var s = String(str == null ? '' : str).replace(/[\u2212\u2013\u2014]/g, '-');
    s = s.replace(/[\s\u00a0\u202f'\u2019\u00b4`]/g, '').replace(/[^\d.,\-]/g, '');
    if (!s || !/\d/.test(s)) return NaN;
    var neg = s.indexOf('-') >= 0;
    s = s.replace(/-/g, '');
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) {
      var dec = lc > ld ? ',' : '.';
      s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
      if (s.split('.').length > 2) return NaN;
    } else if (lc >= 0 || ld >= 0) {
      var sep = lc >= 0 ? ',' : '.';
      var cnt = s.split(sep).length - 1;
      if (cnt > 1) s = s.split(sep).join('');
      else if (sep !== C.decimal && /^\d{1,3}[.,]\d{3}$/.test(s)) s = s.replace(sep, ''); // „5.000“ or „5,000“ = thousands
      else s = s.replace(sep, '.');
    }
    var v = Number(s);
    if (!isFinite(v)) return NaN;
    return neg ? -v : v;
  }
  function nameOf(type, code) {
    var loc = (window.PINN_I18N && PINN_I18N.language && PINN_I18N.language.locale) || 'en-GB';
    try { return new Intl.DisplayNames([loc], { type: type }).of(code) || code; } catch (e) { return code; }
  }
  function flag(code) {
    try { return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65, 0x1F1E6 + code.charCodeAt(1) - 65); } catch (e) { return ''; }
  }
  function werteOf(set) {
    var x = compute(set);
    return {
      land: x.row[0], waehrung: set.waehrung, zahlen: set.zahlen,
      geldSym: x.symbol, geldVorne: x.before, geldDez: x.decimal, geldTsd: x.group, geldNk: x.digits,
      notrufPolizei: x.notruf.polizei, notrufRettung: x.notruf.rettung, notrufFeuer: x.notruf.feuer,
    };
  }

  window.PINN_REGION = {
    COUNTRIES: COUNTRIES, CURRENCIES: CURRENCIES, FORMATS: FORMATS,
    land: C.row[0], currency: C.currency, locale: C.locale,
    decimal: C.decimal, group: C.group, symbol: C.symbol, symbolBefore: C.before, digits: C.digits,
    notruf: C.notruf,
    // Selection stored on this device (land, waehrung = code or 'auto', zahlen = format or 'auto')
    stored: function () { var s = cleanSettings(readStored()); if (!s.land) s.land = C.row[0]; return s; },
    // Remember the selection. true = differs from the one currently shown (pinn. has to reload)
    save: function (o) {
      var next = cleanSettings(o);
      if (!next.land) next.land = C.row[0];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* private/full */ }
      return !sameSet(next, stored);
    },
    // Reload so the new selection applies everywhere (at most once per selection – no loop)
    reload: function () {
      var want = JSON.stringify(cleanSettings(readStored()));
      try {
        if (sessionStorage.getItem('pinn.region.reload') === want) return false;
        sessionStorage.setItem('pinn.region.reload', want);
      } catch (e) { return false; }
      location.reload();
      return true;
    },
    // Values for the profile (the server uses them for amounts in push messages and the emergency numbers)
    werte: function (set) { return werteOf(cleanSettings(set || readStored())); },
    preview: function (set) {
      var x = compute(cleanSettings(set));
      var mnf = currencyNF(x.locale, x.currency);
      var money = partsOf(mnf, 1234.56).map(function (p) { return p.type === 'decimal' ? x.decimal : p.type === 'group' ? x.group : p.value; }).join('');
      return { money: money, notruf: x.notruf, currency: x.currency, row: x.row };
    },
    numSample: function (land) {
      var row = findCountry(land) || C.row;
      return partsOf(new NF(localeOf(row), { minimumFractionDigits: 2, useGrouping: true }), 1234.56).map(function (p) { return p.value; }).join('');
    },
    country: findCountry, flag: flag,
    countryName: function (c) { return nameOf('region', c); },
    currencyName: function (c) { return nameOf('currency', c); },
    // Display
    money: function (v, dec) {
      var o = { style: 'currency', currency: C.currency };
      if (dec != null) { o.minimumFractionDigits = Math.min(dec, C.digits); o.maximumFractionDigits = Math.min(dec, C.digits); }
      return makeNF(o).format(Number(v) || 0);
    },
    num: function (v, minD, maxD) {
      return makeNF({ minimumFractionDigits: minD || 0, maximumFractionDigits: maxD == null ? (minD || 0) : maxD }).format(Number(v) || 0);
    },
    // Number for an input field (without thousands separators)
    input: inputNum,
    parse: parse,
    zero: function () { return C.digits ? '0' + C.decimal + new Array(C.digits + 1).join('0') : '0'; },
    // Decimal point of a finished number („1.5“) in the chosen format („1,5“)
    dec: function (s) { return String(s).replace('.', C.decimal); },
  };
  document.documentElement.classList.toggle('cur-before', C.before);
  try { if (sessionStorage.getItem('pinn.region.reload') === JSON.stringify(cleanSettings(readStored()))) sessionStorage.removeItem('pinn.region.reload'); } catch (e) { /* ignore */ }
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('region');
