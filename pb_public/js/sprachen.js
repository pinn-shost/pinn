/* pinn. – Languages (js/sprachen.js)
   Part of the app code that used to be an inline script in the <head> of index.html (since 1.100.0 its own file,
   loaded with <script src> at exactly the same place). Classic script, no build step. It must run while the
   page is being parsed: after js/ruhemodus.js and before js/region.js, PocketBase and all other files in js/.
   The language file (lang/<code>.js) is added with document.write right behind this script, so it also runs
   before js/region.js.
   Contents: PINN_LANGUAGES (list of languages with flag), window.PINN_I18N (current language, switchTo, wohnform,
   setWohnform, t, load, fail), the flat share terms (TERMS), the dictionary lookup (exact entries and patterns
   with placeholders) and the MutationObserver that translates every displayed text. It also wraps alert/confirm/
   prompt, the date methods (toLocale…String) and CanvasRenderingContext2D.fillText for the chosen language.
   Everything sits in one IIFE – the only global names are PINN_LANGUAGES and PINN_I18N. */

/* ==========================================================
   Languages (i18n)
   ----------------------------------------------------------
   The code of pinn. is written in German. Every other language has its own small file
   under pb_public/lang/<code>.js that is only loaded when someone has chosen that language –
   nothing is loaded for German. Translation works on the displayed texts
   (MutationObserver): every new or changed text is looked up in the dictionary once.
   New language: copy lang/en.js, translate it, adjust the code in the call at the bottom of that file
   and add a line to PINN_LANGUAGES here (js/sprachen.js) – the dropdown in the settings grows
   by itself.
   Order of the language choice: stored on the device (or in the profile, after sign-in) →
   language of the device, if available → English (default).
   ========================================================== */
window.PINN_LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB', file: 'lang/en.js',
    flag: '<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="fl-gb-c"><path d="M0,0v30h60V0z"/></clipPath><clipPath id="fl-gb-t"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath><g clip-path="url(#fl-gb-c)"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0 60,30M60,0 0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 60,30M60,0 0,30" clip-path="url(#fl-gb-t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>' },
  { code: 'fr', name: 'Français', locale: 'fr-FR', file: 'lang/fr.js',
    flag: '<svg viewBox="0 0 3 2" aria-hidden="true"><path d="M0,0h3v2H0z" fill="#ED2939"/><path d="M0,0h2v2H0z" fill="#fff"/><path d="M0,0h1v2H0z" fill="#002395"/></svg>' },
  { code: 'es', name: 'Español', locale: 'es-ES', file: 'lang/es.js',
    flag: '<svg viewBox="0 0 750 500" aria-hidden="true"><path d="M0,0h750v500H0z" fill="#AA151B"/><path d="M0,125h750v250H0z" fill="#F1BF00"/></svg>' },
  { code: 'it', name: 'Italiano', locale: 'it-IT', file: 'lang/it.js',
    flag: '<svg viewBox=\"0 0 3 2\" aria-hidden=\"true\"><path d=\"M0,0h3v2H0z\" fill=\"#CE2B37\"/><path d=\"M0,0h2v2H0z\" fill=\"#fff\"/><path d=\"M0,0h1v2H0z\" fill=\"#009246\"/></svg>' },
  { code: 'pt', name: 'Português', locale: 'pt-BR', file: 'lang/pt.js',
    flag: '<svg viewBox=\"0 0 20 14\" aria-hidden=\"true\"><path d=\"M0,0h20v14H0z\" fill=\"#009C3B\"/><path d=\"M10,1.6L18,7L10,12.4L2,7z\" fill=\"#FFDF00\"/><circle cx=\"10\" cy=\"7\" r=\"3.1\" fill=\"#002776\"/></svg>' },
  { code: 'zh', name: '中文', locale: 'zh-CN', file: 'lang/zh.js',
    flag: '<svg viewBox=\"0 0 30 20\" aria-hidden=\"true\"><path d=\"M0,0h30v20H0z\" fill=\"#DE2910\"/><path d=\"M5,2.2l1.2,3.7h3.9l-3.1,2.3l1.2,3.7L5,9.6L1.9,11.9l1.2-3.7L0,5.9h3.9z\" fill=\"#FFDE00\"/></svg>' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE', file: '',
    flag: '<svg viewBox="0 0 5 3" aria-hidden="true"><path d="M0,0h5v3H0z"/><path d="M0,1h5v2H0z" fill="#D00"/><path d="M0,2h5v1H0z" fill="#FFCE00"/></svg>' },
];
(function () {
  var KEY = 'pinn.sprache';
  var DEFAULT = 'en';
  var LANGS = window.PINN_LANGUAGES;
  function find(code) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return LANGS[i]; return null; }
  function readStored() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function writeStored(code) { try { localStorage.setItem(KEY, code); } catch (e) { /* private mode/full */ } }
  function deviceLang() {
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < list.length; i++) { var c = String(list[i] || '').slice(0, 2).toLowerCase(); if (find(c)) return c; }
    return '';
  }
  var stored = readStored();
  var code = find(stored) ? stored : (deviceLang() || DEFAULT);
  var lang = find(code) || find(DEFAULT);

  // Living arrangement of the own family: "familie" (default) or "wg" (flat share). Comes with the family data
  // (Settings → Family members) and is remembered on the device, so pinn. shows the matching terms
  // right from the start (family → flat share, family members → flatmates …).
  var WG_KEY = 'pinn.wohnform';
  function readWohnform() { try { return localStorage.getItem(WG_KEY) === 'wg' ? 'wg' : 'familie'; } catch (e) { return 'familie'; } }
  var wohnform = readWohnform();
  function busy() {
    var a = document.activeElement;
    return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.nodeName) || a.isContentEditable);
  }

  var api = window.PINN_I18N = {
    current: lang.code,
    language: lang,
    defaultCode: DEFAULT,
    active: false,
    // Stored language of this device (for the personal settings)
    stored: function () { return find(readStored()) ? readStored() : lang.code; },
    find: find,
    t: function (s) { return s; },
    // Switch language: remember it and reload (switching back needs the original texts)
    switchTo: function (c, noReload) {
      if (!find(c)) return false;
      writeStored(c);
      if (c === lang.code || noReload) return false;
      try {
        if (sessionStorage.getItem('pinn.sprache.reload') === c) return false; // no reload loop
        sessionStorage.setItem('pinn.sprache.reload', c);
      } catch (e) { return false; }
      location.reload();
      return true;
    },
    wohnform: wohnform,
    // Apply the living arrangement: remember it and – if it changed – reload (the original texts
    // are needed for the switch). soft = the change came from another device: if someone is typing,
    // reload only once the input is finished or the app is in the background.
    setWohnform: function (v, soft) {
      v = v === 'wg' ? 'wg' : 'familie';
      try { localStorage.setItem(WG_KEY, v); } catch (e) { return false; }
      if (v === wohnform) return false;
      try {
        if (sessionStorage.getItem('pinn.wohnform.reload') === v) return false; // no reload loop
        sessionStorage.setItem('pinn.wohnform.reload', v);
      } catch (e) { return false; }
      if (!soft || !busy()) { location.reload(); return true; }
      var later = function () {
        if (!document.hidden && busy()) return;
        document.removeEventListener('visibilitychange', later);
        document.removeEventListener('focusout', tick);
        location.reload();
      };
      var tick = function () { setTimeout(later, 400); };
      document.addEventListener('visibilitychange', later);
      document.addEventListener('focusout', tick);
      return true;
    },
    load: function () { /* replaced below when a language file is needed */ },
    fail: function () { document.documentElement.classList.remove('pinn-i18n-wait'); },
  };
  try { if (sessionStorage.getItem('pinn.sprache.reload') === lang.code) sessionStorage.removeItem('pinn.sprache.reload'); } catch (e) { /* ignore */ }
  try { if (sessionStorage.getItem('pinn.wohnform.reload') === wohnform) sessionStorage.removeItem('pinn.wohnform.reload'); } catch (e) { /* ignore */ }
  document.documentElement.lang = lang.code;
  document.documentElement.setAttribute('data-wohnform', wohnform);
  if (!lang.file && wohnform !== 'wg') return; // Original language as a family: load nothing, observe nothing
  var DICT = !!lang.file;    // Dictionary needed (not German)?

  /* Terms for a flat share – applied to the finished text of the chosen language after the
     translation. keep: terms that stay (e.g. Familienstammbuch). Areas with data-no-term
     (sign-in, main admin, version log, living arrangement switch) stay unchanged. */
  function cap(up, s) { return up ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  var FAM_EMOJI = /\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67(?:\u200D\uD83D\uDC66)?/g;
  var WG_EMOJI = '\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1';
  var TERMS = {
    de: { keep: /Familienstammbuch|Familienkutsche/g, rules: [
      [/\b([Jj])edes Familienmitglied\b/g, '$1eder Mitbewohner'],
      [/\b([Dd])as Familienmitglied\b/g, '$1er Mitbewohner'],
      [/\b([Ee])in weiteres Familienmitglied\b/g, '$1inen weiteren Mitbewohner'],
      [/\b(an|für|über|Bitte|bitte) ein Familienmitglied\b/g, '$1 einen Mitbewohner'],
      [/\b([Nn])eues Familienmitglied\b/g, '$1euer Mitbewohner'],
      [/Familienmitgliedern/g, 'Mitbewohnern'],
      [/Familienmitglieds/g, 'Mitbewohners'],
      [/Familienmitglieder/g, 'Mitbewohner'],
      [/Familienmitglied/g, 'Mitbewohner'],
      [/\b(den|allen|zwischen) Familien(?![-\wÄÖÜäöüß])/g, '$1 Haushalten'],
      [/\bFamilien(?![-\wÄÖÜäöüß])/g, 'Haushalte'],
      [/\b[Ff]amilien-(?=[A-Za-zÄÖÜäöü])/g, 'WG-'],
      [/\b([Ff])amilien([a-zäöüß])/g, function (m, f, c) { return 'WG-' + (f === 'F' ? c.toUpperCase() : c); }],
      [/\b[Ff]amilie\b/g, 'WG'],
    ] },
    en: { keep: /family register|[Ff]amily bus/g, rules: [
      [/\b([Ff])amily members\b/g, function (m, f) { return cap(f === 'F', 'flatmates'); }],
      [/\b([Ff])amily member\b/g, function (m, f) { return cap(f === 'F', 'flatmate'); }],
      [/\b([Ff])amilies\b/g, function (m, f) { return cap(f === 'F', 'households'); }],
      [/\b([Ff])amily\b/g, function (m, f) { return cap(f === 'F', 'flatshare'); }],
    ] },
    fr: { keep: /livret de famille|nom de famille|voiture familiale/g, rules: [
      [/\b([Mm])embres de (?:la|ta|votre|cette) famille\b/g, function (m, f) { return cap(f === 'M', 'colocataires'); }],
      [/\b([Mm])embre de (?:la|ta|votre|cette) famille\b/g, function (m, f) { return cap(f === 'M', 'colocataire'); }],
      [/\b([Tt])outes les familles\b/g, '$1ous les foyers'],
      [/\b([Ff])amilles\b/g, function (m, f) { return cap(f === 'F', 'foyers'); }],
      [/\bfamili(?:aux|ales|ale|al)\b/g, 'de la colocation'],
      [/\b([Ff])amille\b/g, function (m, f) { return cap(f === 'F', 'colocation'); }],
    ] },
    es: { keep: /libro de familia|coche familiar/g, rules: [
      [/\b([Mm])iembros de (?:la|tu|esta) familia\b/g, function (m, f) { return cap(f === 'M', 'compañeros de piso'); }],
      [/\b([Mm])iembro de (?:la|tu|esta) familia\b/g, function (m, f) { return cap(f === 'M', 'compañero de piso'); }],
      [/\b([Tt])odas las familias\b/g, '$1odos los hogares'],
      [/\b([Ll])as familias\b/g, '$1os hogares'],
      [/\b([Ff])amilias\b/g, function (m, f) { return cap(f === 'F', 'hogares'); }],
      [/\bde la familia\b/g, 'del piso compartido'],
      [/\ba la familia\b/g, 'al piso compartido'],
      [/\b([Tt])oda la familia\b/g, '$1odo el piso compartido'],
      [/\b([Ll])a familia\b/g, function (m, f) { return cap(f === 'L', 'el piso compartido'); }],
      [/\b([Uu])na familia\b/g, function (m, f) { return cap(f === 'U', 'un piso compartido'); }],
      [/\b([Ee])sta familia\b/g, function (m, f) { return cap(f === 'E', 'este piso compartido'); }],
      [/\b([Oo])tra familia\b/g, function (m, f) { return cap(f === 'O', 'otro piso compartido'); }],
      [/\b([Nn])inguna familia\b/g, function (m, f) { return cap(f === 'N', 'ningún piso compartido'); }],
      [/\bfamiliares\b/g, 'del piso'],
      [/\bfamiliar\b/g, 'del piso'],
      [/\b([Ff])amilia\b/g, function (m, f) { return cap(f === 'F', 'piso compartido'); }],
    ] },
    it: { keep: /libro di famiglia|auto di famiglia/g, rules: [
      [/\b([Mm])embri della famiglia\b/g, function (m, f) { return cap(f === 'M', 'coinquilini'); }],
      [/\b([Mm])embro della famiglia\b/g, function (m, f) { return cap(f === 'M', 'coinquilino'); }],
      [/\b([Tt])utta la famiglia\b/g, '$1utta la casa'],
      [/\b([Tt])utte le famiglie\b/g, '$1utte le case'],
      [/\b([Ll])e famiglie\b/g, '$1e case'],
      [/\b([Ff])amiglie\b/g, function (m, f) { return cap(f === 'F', 'case'); }],
      [/\bfamiliari\b/g, 'coinquilini'],
      [/\bfamiliare\b/g, 'della casa'],
      [/\b([Ff])amiglia\b/g, function (m, f) { return cap(f === 'F', 'casa condivisa'); }],
    ] },
    pt: { keep: /livro de família|carro de família|carro da família/g, rules: [
      [/\b([Mm])embros da família\b/g, function (m, f) { return cap(f === 'M', 'colegas de casa'); }],
      [/\b([Mm])embro da família\b/g, function (m, f) { return cap(f === 'M', 'colega de casa'); }],
      [/\b([Tt])oda a família\b/g, '$1oda a casa'],
      [/\b([Tt])odas as famílias\b/g, '$1odas as casas'],
      [/\b([Ff])amília toda\b/g, function (m, f) { return cap(f === 'F', 'casa toda'); }],
      [/\b([Ff])amílias\b/g, function (m, f) { return cap(f === 'F', 'casas'); }],
      [/\bfamiliares\b/g, 'da casa'],
      [/\bfamiliar\b/g, 'da casa'],
      [/\b([Ff])amília\b/g, function (m, f) { return cap(f === 'F', 'casa compartilhada'); }],
    ] },
    zh: { keep: /家庭医生/g, rules: [
      [/家庭成员/g, '室友'],
      [/全家/g, '整个合租'],
      [/家庭/g, '合租'],
    ] },
  };
  var TERM = wohnform === 'wg' ? (TERMS[lang.code] || TERMS.de) : null;
  var TERM_HINT = /[Ff]amil|[Ff]amigli|[Ff]am\u00EDli|\u5BB6\u5EAD|\u5168\u5BB6|\uD83D\uDC68\u200D\uD83D\uDC69/;
  function term(s) {
    if (!TERM || !s || !TERM_HINT.test(s)) return s;
    var kept = [];
    s = s.replace(TERM.keep, function (m) { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0002'; });
    for (var i = 0; i < TERM.rules.length; i++) s = s.replace(TERM.rules[i][0], TERM.rules[i][1]);
    s = s.replace(FAM_EMOJI, WG_EMOJI);
    if (kept.length) s = s.replace(/\u0001(\d+)\u0002/g, function (m, i) { return kept[+i]; });
    return s;
  }
  function noTermAt(el) { return !!TERM && !!el && !!el.closest && !!el.closest('[data-no-term]'); }

  // Invisible until the first translation (no short flash of the original texts)
  var style = document.createElement('style');
  style.textContent = 'html.pinn-i18n-wait body{visibility:hidden}';
  document.head.appendChild(style);
  document.documentElement.classList.add('pinn-i18n-wait');
  var reveal = function () { document.documentElement.classList.remove('pinn-i18n-wait'); };
  setTimeout(reveal, 4000);

  var exact = null;          // Map: original text -> translation
  var pre = null, suf = null, mid = null; // patterns with placeholders, sorted by first/last word
  var WORD = /[A-Za-zÄÖÜäöüß]{2,}/;
  var cache = new Map();     // pattern texts translated already (limited)
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 1 };   // do not translate the content
  var NOATTR = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  var ATTRS = ['placeholder', 'title', 'alt', 'label'];   // label: groups in dropdowns (optgroup)
  var outText = new WeakMap();
  var valDone = new WeakSet(); // input fields with data-i18n-value (category names) that are translated already
  var CTX_ON = false;          // are there entries with a context, e.g. "fz|Laden" (vehicles: Laden = charging)?
  var EDGE = /^([^A-Za-zÄÖÜäöüßÀ-ÿ0-9]*)([\s\S]*?)([^A-Za-zÄÖÜäöüßÀ-ÿ0-9]*)$/;
  var SPLITS = [' · ', ' | ', ' – ', ', '];
  var loose = new Map();       // results of the partial translation (limited)
  function ctxOf(el) {
    if (!CTX_ON || !el || !el.closest) return '';
    var c = el.closest('[data-i18n-ctx]');
    return c ? c.getAttribute('data-i18n-ctx') || '' : '';
  }

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function compile(de, en) {
    var names = [];
    var parts = de.split(/\{(\d+|[a-z]+)\}/);
    var src = '^';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2) { names.push(parts[i]); src += '([\\s\\S]*?)'; } else src += esc(parts[i]);
    }
    var first = parts[0].match(WORD), last = parts[parts.length - 1].match(/([A-Za-zÄÖÜäöüß]{2,})[^A-Za-zÄÖÜäöüß]*$/);
    var all = de.replace(/\{(\d+|[a-z]+)\}/g, ' ').match(/[A-Za-zÄÖÜäöüß]{2,}/g) || [];
    return { re: null, src: src + '$', names: names, en: en, anchor: all.sort(function (a, b) { return b.length - a.length; })[0] || '',
      first: first ? first[0] : '', last: last ? last[1] : '' };
  }
  function addTo(map, k, p) { var l = map.get(k); if (!l) map.set(k, l = []); l.push(p); }

  function fill(p, m, depth) {
    return p.en.replace(/\{(\d+|[a-z]+)(?:\|([^}|]*)(?:\|([^}]*))?)?\}/g, function (all, name, a, b) {
      var idx = p.names.indexOf(name);
      var v = idx >= 0 ? (m[idx + 1] || '') : '';
      if (a === undefined) return depth < 2 ? tr(v, depth + 1) : v;
      var eq = a.indexOf('=');
      if (eq >= 0) return v === a.slice(0, eq) ? a.slice(eq + 1) : (b || '');
      return v ? a : (b || '');
    });
  }
  function tryList(list, s, depth) {
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.anchor && s.indexOf(p.anchor) < 0) continue;
      if (!p.re) p.re = new RegExp(p.src);
      var m = p.re.exec(s);
      if (m) return fill(p, m, depth);
    }
    return null;
  }
  function trPattern(s, depth) {
    if (cache.has(s)) return cache.get(s);
    var w1 = s.match(WORD), w2 = s.match(/([A-Za-zÄÖÜäöüß]{2,})[^A-Za-zÄÖÜäöüß]*$/);
    var r = (w1 && tryList(pre.get(w1[0]), s, depth)) || (w2 && tryList(suf.get(w2[1]), s, depth)) || tryList(mid, s, depth);
    if (cache.size > 3000) cache.clear();
    cache.set(s, r);
    return r;
  }
  // Whole text: dictionary (with context first), patterns, text with a trailing ":" or "…"
  function trCore(key, depth, ctx) {
    var out;
    if (ctx) { out = exact.get(ctx + '|' + key); if (out !== undefined) return out; }
    out = exact.get(key);
    if (out !== undefined) return out;
    out = trPattern(key, depth);
    if (out !== null) return out;
    var m = /^(.*?)(\s*[:…]+)$/.exec(key);
    if (m) {
      var c = ctx ? exact.get(ctx + '|' + m[1]) : undefined;
      if (c === undefined) c = exact.get(m[1]);
      if (c !== undefined) return c + m[2];
    }
    return null;
  }
  // Like trCore, additionally: split off symbols/emojis at the edges ("🧹 Reinigung") and translate composite
  // texts part by part ("🧹 Reinigung · Mo, Mi"). Returns null if nothing matches.
  function trLoose(key, depth, ctx) {
    var out = trCore(key, depth, ctx);
    if (out !== null || depth > 3) return out;
    var ck = ctx + '\u0001' + key;
    if (loose.has(ck)) return loose.get(ck);
    var res = null;
    var m = EDGE.exec(key);
    if (m && (m[1] || m[3]) && m[2] && WORD.test(m[2])) {
      var c = trLoose(m[2], depth + 1, ctx);
      if (c !== null) res = m[1] + c + m[3];
    }
    for (var i = 0; res === null && i < SPLITS.length; i++) {
      var sep = SPLITS[i];
      if (key.indexOf(sep) < 0) continue;
      var parts = key.split(sep), changed = false, ok = true, j;
      if (i >= 2) for (j = 0; j < parts.length; j++) if (parts[j].split(' ').length > 4) ok = false;
      if (!ok) continue;
      for (j = 0; j < parts.length; j++) {
        if (!WORD.test(parts[j])) continue;
        var t = trLoose(parts[j], depth + 1, ctx);
        if (t !== null) { parts[j] = t; changed = true; }
      }
      if (changed) res = parts.join(sep);
    }
    if (loose.size > 3000) loose.clear();
    loose.set(ck, res);
    return res;
  }
  // Translates a text; spaces at the start/end are kept
  function tr(text, depth, ctx, noTerm) {
    if (!text) return text;
    var res = text;
    if (DICT && WORD.test(text)) {
      var key = norm(text);
      var out = trLoose(key, depth || 0, ctx || '');
      if (out !== null && out !== key) {
        var lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
        res = lead + out + trail;
      }
    }
    return (depth || noTerm) ? res : term(res);
  }

  function doText(n) {
    var d = n.data;
    if (outText.get(n) === d) return;
    var r = tr(d, 0, ctxOf(n.parentNode), noTermAt(n.parentNode));
    if (r !== d) { outText.set(n, r); n.data = r; }
  }
  function doAttrs(el) {
    var ctx = ctxOf(el), nt = noTermAt(el);
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (v && WORD.test(v)) { var r = tr(v, 0, ctx, nt); if (r !== v) el.setAttribute(a, r); }
    }
    // Category names in the settings: only the display is translated, it is saved only
    // when someone changes the field themselves (otherwise the data stays unchanged)
    if (el.nodeName === 'INPUT' && !valDone.has(el) && el.hasAttribute('data-i18n-value')) {
      valDone.add(el);
      var val = el.value;
      if (val && WORD.test(val)) { var rv = tr(val, 0, ctx, nt); if (rv !== val) el.value = rv; }
    }
  }
  function skipEl(el) {
    return SKIP[el.nodeName] === 1 || el.isContentEditable || (el.hasAttribute && el.hasAttribute('data-no-i18n'));
  }
  function walk(root) {
    if (root.nodeType === 3) { var p = root.parentNode; if (p && !skipEl(p) && !(p.closest && p.closest('[data-no-i18n]'))) doText(root); return; }
    if (root.nodeType !== 1 || NOATTR[root.nodeName] || (root.closest && root.closest('[data-no-i18n]'))) return;
    doAttrs(root); // also for input fields (placeholders)
    if (skipEl(root)) return;
    var tw = document.createTreeWalker(root, 5 /* elements + texts */, {
      acceptNode: function (n) {
        if (n.nodeType !== 1 || !skipEl(n)) return 1;
        if (!NOATTR[n.nodeName] && !n.hasAttribute('data-no-i18n')) doAttrs(n);
        return 2; // skip the content
      },
    });
    var n;
    while ((n = tw.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  function onMutations(list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'childList') { for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]); }
      else if (m.type === 'characterData') { var p = m.target.parentNode; if (p && !skipEl(p) && !(p.closest && p.closest('[data-no-i18n]'))) doText(m.target); }
      else if (m.type === 'attributes') { var v = m.target.getAttribute(m.attributeName); if (v && WORD.test(v)) { var r = tr(v, 0, ctxOf(m.target), noTermAt(m.target)); if (r !== v) m.target.setAttribute(m.attributeName, r); } }
    }
  }

  function start(data) {
    exact = new Map(Object.entries(data.exact || {}));
    CTX_ON = Object.keys(data.exact || {}).some(function (k) { return /^[a-z]+\|/.test(k); });
    pre = new Map(); suf = new Map(); mid = [];
    (data.patterns || []).forEach(function (pair) {
      var p = compile(pair[0], pair[1]);
      if (p.first) addTo(pre, p.first, p); else if (p.last) addTo(suf, p.last, p); else mid.push(p);
    });
    api.active = true;
    api.t = function (s, ctx) { return typeof s === 'string' ? tr(s, 0, ctx || '') : s; };
    api.term = term;

    // Messages of the browser
    var nA = window.alert, nC = window.confirm, nP = window.prompt;
    window.alert = function (msg) { return nA.call(window, api.t(msg)); };
    window.confirm = function (msg) { return nC.call(window, api.t(msg)); };
    window.prompt = function (msg, def) { return nP.call(window, api.t(msg), def); };
    // Dates: German format -> format of the chosen language (numbers stay unchanged)
    var loc = lang.locale;
    if (DICT) {
    function fixLoc(l) { return (typeof l === 'string' && /^de/i.test(l)) ? loc : l; }
    ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'].forEach(function (fn) {
      var orig = Date.prototype[fn];
      Date.prototype[fn] = function (l, o) { return orig.call(this, fixLoc(l), o); };
    });
    }
    // Labels in charts (canvas)
    try {
      var fT = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (txt) {
        var a = Array.prototype.slice.call(arguments); a[0] = typeof txt === 'string' ? tr(txt, 0) : txt;
        return fT.apply(this, a);
      };
    } catch (e) { /* no canvas */ }

    new MutationObserver(onMutations).observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS,
    });
    var sweep = function () { if (document.body) walk(document.body); if (document.title) document.title = tr(document.title, 0); reveal(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep); else sweep();
  }
  api.load = function (c, data) {
    if (c !== lang.code || exact) return;
    start(data);
  };
  api.fail = function () { if (!exact) start({}); reveal(); };
  // Raise the version number with every change to the language files, otherwise devices keep using the old file
  if (DICT) document.write('<script src="' + lang.file + '?v=1.107.1" onerror="PINN_I18N.fail()"><\/script>');
  else start({}); // German as a flat share: no dictionary, only the flat share terms
})();

// Marks this file as loaded – the start check in index.html reports missing app files
(window.PINN_PARTS = window.PINN_PARTS || []).push('sprachen');
