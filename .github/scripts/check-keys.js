#!/usr/bin/env node
/* pinn. – checks the key-based texts (.github/scripts/check-keys.js, since 1.111.0)

   Usage:  node .github/scripts/check-keys.js

   Errors (exit code 1):
   1. pb_public/js/textkern.js and pb_hooks/pinn-textkern.js are not byte-identical, or the plural rules disagree
      with the rules of Node.js (Intl.PluralRules) for 0 … 2000 and decimals.
   2. FILE_VERSION in js/sprachen.js differs from src/version.txt (devices would keep old language files).
   3. A language of PINN_LANGUAGES (not hidden) has no pb_public/i18n/<code>.i18n.js, a file cannot be loaded,
      has not exactly one PINN_I18N.keys("<code>", {…}) call or names the wrong language.
   4. Compared with English (en.i18n.js, the reference): a key is missing (hidden languages: one warning with the
      progress – they are translated step by step, since 1.120.0), a text
      is empty or no string/plural object, a plural text lacks a form its language needs (js/textkern.js → FORMS)
      or has an unknown form, a placeholder {name} is missing or unknown, a "<key>#wg" variant has no plain key.
   5. A key used in the code – tk('key') in pb_public/js/ and pb_public/*.js, data-tk="key", data-tk-html="key",
      data-tk-attr="name:key" in src/, key literals ("push.…") in pb_hooks/ (since 1.117.0: push texts of the
      server, pinn-pushtext.js) – does not exist in English; the English text written inside an element
      with data-tk in src/ differs from en.i18n.js (the HTML keeps the English text, so it stays readable).
   6. js/sprachen.js does not work as expected in a small simulated page (tk, data-tk, flat share variants,
      hidden languages, every language loads only its i18n file – the old dictionaries in lang/ are gone since 1.119.3;
      an unlocked hidden language also loads English, which fills the keys it does not have yet).
   Warnings: keys in en.i18n.js that no code uses, extra keys in a language, texts identical to English. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT, rel, read, exists, walk, reporter } = require('./common');
const { languages, loadKeys, I18N_DIR } = require('./i18n-keys');

const r = reporter('Text keys');
const warnings = [];
const KERN_APP = path.join(ROOT, 'pb_public', 'js', 'textkern.js');
const KERN_HOOK = path.join(ROOT, 'pb_hooks', 'pinn-textkern.js');
const SPRACHEN = path.join(ROOT, 'pb_public', 'js', 'sprachen.js');
const CATS = ['zero', 'one', 'two', 'few', 'many', 'other'];

/* 1. text core */
let K = null;
if (!exists(KERN_APP) || !exists(KERN_HOOK)) r.fail('textkern', 'pb_public/js/textkern.js or pb_hooks/pinn-textkern.js is missing');
else {
  if (fs.readFileSync(KERN_APP, 'utf8') !== fs.readFileSync(KERN_HOOK, 'utf8')) r.fail(rel(KERN_HOOK), 'differs from pb_public/js/textkern.js – copy the file over');
  K = require(KERN_HOOK);
  let bad = 0;
  for (const code of Object.keys(K.RULES)) {
    let pr, prDec;
    try { pr = new Intl.PluralRules(code === 'pt' ? 'pt-BR' : code); prDec = new Intl.PluralRules(code === 'pt' ? 'pt-BR' : code, { minimumFractionDigits: 1 }); } catch (e) { continue; }
    for (let n = 0; n <= 2000; n++) {
      for (const s of [String(n), n + '.5', n + '.0']) {
        let want = (s.endsWith('.0') ? prDec : pr).select(Number(s));
        if (want === 'many' && code !== 'ru') want = 'other';   // round millions, left out on purpose
        if (K.plural(code, s) !== want && ++bad <= 5) r.fail('textkern', code + ' ' + s + ': ' + K.plural(code, s) + ', expected ' + want);
      }
    }
    if (!K.FORMS[code]) r.fail('textkern', 'FORMS has no entry for ' + code);
  }
}

/* 2. file version */
const version = exists(path.join(ROOT, 'src', 'version.txt')) ? read(path.join(ROOT, 'src', 'version.txt')).trim() : '';
const fv = (/var FILE_VERSION = '([^']+)'/.exec(read(SPRACHEN)) || [])[1];
if (!fv) r.fail('js/sprachen.js', 'FILE_VERSION not found');
else if (version && fv !== version) r.fail('js/sprachen.js', "FILE_VERSION is '" + fv + "', src/version.txt says '" + version + "'");

/* 3. files */
const langs = languages();
const data = {};
for (const lang of langs) {
  const file = path.join(I18N_DIR, lang.code + '.i18n.js');
  if (!exists(file)) { if (!lang.hidden) r.fail(rel(file), 'missing'); continue; }
  try {
    const got = loadKeys(lang.code);
    if (got.code !== lang.code) r.fail(rel(file), 'language code is "' + got.code + '"');
    data[lang.code] = got.data;
  } catch (e) { r.fail(rel(file), e.message); }
}
for (const f of fs.existsSync(I18N_DIR) ? fs.readdirSync(I18N_DIR) : []) {
  // Translated version logs (versionslog.<code>.js, e.g. versionslog.en.js since 1.119.1) are loaded on demand by
  // js/versionslog.js – they are not text-key files and are checked by the syntax step only.
  if (/^versionslog\.[a-z]{2}\.js$/.test(f)) continue;
  const m = /^([a-z]{2})\.i18n\.js$/.exec(f);
  if (!m || !langs.some(l => l.code === m[1])) r.fail('pb_public/i18n/' + f, 'not a language of PINN_LANGUAGES (js/sprachen.js)');
}

/* 4. against English */
const names = s => new Set((String(s).match(/\{(\w+)\}/g) || []).map(t => t.slice(1, -1)));
const namesOf = e => { const out = new Set(); if (typeof e === 'string') names(e).forEach(n => out.add(n)); else for (const f of Object.keys(e)) names(e[f]).forEach(n => out.add(n)); return out; };
const en = data.en;
if (!en) r.fail('pb_public/i18n/en.i18n.js', 'missing – English is the reference');
else {
  for (const lang of langs) {
    const d = data[lang.code];
    if (!d) continue;
    const where = 'i18n/' + lang.code + '.i18n.js';
    let same = 0;
    for (const key of Object.keys(d)) {
      const v = d[key];
      const plain = key.split('#')[0];
      if (key.includes('#') && (!/#wg$/.test(key) || !Object.prototype.hasOwnProperty.call(d, plain))) r.fail(where, key + ': a variant needs "#wg" and the plain key ' + plain);
      if (typeof v === 'string') { if (!v.trim()) r.fail(where, key + ': empty'); }
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const f of Object.keys(v)) {
          if (!CATS.includes(f)) r.fail(where, key + ': unknown plural form "' + f + '"');
          else if (typeof v[f] !== 'string' || !v[f].trim()) r.fail(where, key + ': form "' + f + '" is empty');
        }
        if (K) for (const f of K.forms(lang.code)) if (!(f in v)) r.fail(where, key + ': plural form "' + f + '" missing (' + lang.code + ' needs ' + K.forms(lang.code).join(', ') + ')');
      } else r.fail(where, key + ': must be a string or an object with plural forms');
      if (lang.code === 'en') continue;
      if (!Object.prototype.hasOwnProperty.call(en, plain)) { warnings.push(where + ': ' + key + ' is not in en.i18n.js'); continue; }
      const ref = Object.prototype.hasOwnProperty.call(en, key) ? en[key] : en[plain];
      const a = namesOf(ref), b = namesOf(v);
      for (const n of a) if (!b.has(n)) r.fail(where, key + ': placeholder {' + n + '} missing');
      for (const n of b) if (!a.has(n)) r.fail(where, key + ': unknown placeholder {' + n + '}');
      if (typeof v === 'string' && v === ref && v.split(' ').length > 2 && /[a-z]{4}/i.test(v)) same++;
    }
    if (lang.code !== 'en') {
      const missing = [];
      for (const key of Object.keys(en)) {
        if (key.includes('#') || Object.prototype.hasOwnProperty.call(d, key)) continue;
        if (lang.hidden) missing.push(key);
        else r.fail(where, key + ': missing');
      }
      if (missing.length) {
        const total = Object.keys(en).filter(k => !k.includes('#')).length;
        warnings.push(where + ': hidden language, ' + (total - missing.length) + ' of ' + total + ' keys translated (' +
          Math.floor(100 * (total - missing.length) / total) + ' %) – next: ' + missing.slice(0, 3).join(', ') + ' …');
      }
    }
    if (same) warnings.push(where + ': ' + same + ' longer texts are identical to English (untranslated?)');
  }
}

/* 5. keys in the code */
const used = new Map();   // key -> first place
const note = (key, where) => { if (!used.has(key)) used.set(key, where); };
const codeFiles = walk(path.join(ROOT, 'pb_public', 'js'), n => n.endsWith('.js'))
  .concat(['einrichtung.js', 'datenexport.js'].map(n => path.join(ROOT, 'pb_public', n)).filter(exists))
  // Server: the hooks read the same language files (pinn-pushtext.js → tk(lang, "push.…", …))
  .concat(walk(path.join(ROOT, 'pb_hooks'), n => n.endsWith('.js')));
for (const file of codeFiles) {
  const src = read(file);
  const re = /(?:^|[^\w.$])tk\(\s*(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g;
  let m;
  while ((m = re.exec(src))) note(m[2], rel(file));
}
// Keys handed over through a helper: a string literal that is a known key in a file using tk() counts as used
const keyLike = /(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)\1/g;
for (const file of codeFiles) {
  const src = read(file);
  if (!/(?:^|[^\w.$])tk\(/.test(src)) continue;
  let m;
  while ((m = keyLike.exec(src))) if (en && Object.prototype.hasOwnProperty.call(en, m[2])) note(m[2], rel(file));
}
const htmlFiles = walk(path.join(ROOT, 'src'), n => n.endsWith('.html'));
const decode = s => s.replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
for (const file of htmlFiles) {
  const src = read(file);
  let m;
  const reAttr = /\bdata-tk(?:-html)?="([^"]*)"/g;
  while ((m = reAttr.exec(src))) note(m[1], rel(file));
  const reList = /\bdata-tk-attr="([^"]*)"/g;
  while ((m = reList.exec(src))) m[1].split(';').forEach(p => { const k = p.slice(p.indexOf(':') + 1).trim(); if (k) note(k, rel(file)); });
  // English text inside simple elements with data-tk
  const reText = /<(\w+)\b[^>]*\bdata-tk="([^"]+)"[^>]*>([^<]*)<\/\1>/g;
  while ((m = reText.exec(src))) {
    const text = decode(m[3]).replace(/\s+/g, ' ').trim();
    if (!text || !en || typeof en[m[2]] !== 'string') continue;
    if (text !== en[m[2]].replace(/\s+/g, ' ').trim()) r.fail(rel(file), 'data-tk="' + m[2] + '": the text in the HTML ("' + text + '") differs from en.i18n.js ("' + en[m[2]] + '")');
  }
}
if (en) {
  for (const [key, where] of used) if (!Object.prototype.hasOwnProperty.call(en, key)) r.fail(where, 'text key "' + key + '" is not in pb_public/i18n/en.i18n.js');
  const unused = Object.keys(en).filter(k => !k.includes('#') && !used.has(k));
  if (unused.length) warnings.push(unused.length + ' key(s) in en.i18n.js not used by any code: ' + unused.slice(0, 8).join(', ') + (unused.length > 8 ? ' …' : ''));
}

/* 6. js/sprachen.js in a simulated page */
function simulate(opts) {
  const written = [];
  const store = Object.assign({}, opts.storage || {});
  const classes = new Set();
  const listeners = {};
  const els = (opts.elements || []).map(e => ({
    attrs: Object.assign({}, e.attrs), textContent: e.text || '', innerHTML: '', nodeType: 1,
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    setAttribute(n, v) { this.attrs[n] = String(v); },
  }));
  const document = {
    readyState: 'loading',
    documentElement: { lang: '', setAttribute() {}, classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    head: { appendChild() {} },
    createElement: () => ({}),
    write: s => written.push(s),
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    querySelectorAll: () => els,
    nodeType: 9,
  };
  const window = {
    PINN_TEXTKERN: K,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { languages: opts.device || ['de-DE'], language: 'de-DE' },
    document, setTimeout: () => 0, console: { warn() {} },
    Date,
  };
  window.window = window;
  const ctx = Object.assign(window, { location: { reload() {} }, Set, Map, WeakMap, WeakSet, Object, Array, String, RegExp, JSON });
  vm.runInNewContext(read(SPRACHEN), ctx, { filename: 'sprachen.js', timeout: 5000 });
  const api = ctx.PINN_I18N;
  const src = written.map(w => (/src="([^"?]+)/.exec(w) || [])[1]).filter(Boolean);
  for (const s of src) {
    if (s.startsWith('i18n/') && exists(path.join(ROOT, 'pb_public', s))) vm.runInNewContext(read(path.join(ROOT, 'pb_public', s)), ctx, { filename: s });
  }
  (listeners.DOMContentLoaded || []).forEach(fn => fn());
  return { api, src, els, waiting: classes.has('pinn-i18n-wait'), ctx };
}
if (K && en && data.de) {
  try {
    const key = Object.keys(en).find(k => !k.includes('#') && typeof en[k] === 'string' && !/\{/.test(en[k]));
    const de = simulate({ storage: { 'pinn.sprache': 'de' }, elements: [{ attrs: { 'data-tk': key, 'data-tk-attr': 'title:' + key }, text: en[key] }] });
    if (de.src[0] !== 'i18n/de.i18n.js') r.fail('js/sprachen.js', 'German does not load i18n/de.i18n.js first (got ' + JSON.stringify(de.src) + ')');
    if (de.src.length !== 1) r.fail('js/sprachen.js', 'German should load only its key file, got ' + JSON.stringify(de.src));
    if (de.ctx.tk(key) !== data.de[key]) r.fail('js/sprachen.js', 'tk("' + key + '") does not return the German text');
    if (de.els[0].textContent !== data.de[key] || de.els[0].attrs.title !== data.de[key]) r.fail('js/sprachen.js', 'data-tk / data-tk-attr not applied');
    if (de.waiting) r.fail('js/sprachen.js', 'the page stays hidden after the texts are in place (German)');
    if (de.ctx.tk('no.such.key') !== 'no.such.key') r.fail('js/sprachen.js', 'a missing key should show the key itself');
    const fr = simulate({ storage: { 'pinn.sprache': 'fr' } });
    if (fr.src[0] !== 'i18n/fr.i18n.js' || fr.src.length !== 1) r.fail('js/sprachen.js', 'French should load only i18n/fr.i18n.js (got ' + JSON.stringify(fr.src) + ')');
    if (fr.waiting) r.fail('js/sprachen.js', 'the page stays hidden after the texts are in place (French)');
    if (fr.src.concat(de.src).some(s => /(^|\/)lang\//.test(s))) r.fail('js/sprachen.js', 'still loads an old dictionary from lang/ (removed in 1.119.3)');
    for (const h of langs.filter(l => l.hidden)) {
      const s = simulate({ storage: { 'pinn.sprache': h.code }, device: [h.code] });
      if (s.api.current === h.code) r.fail('js/sprachen.js', 'hidden language ' + h.code + ' can be chosen');
      if (s.api.available().some(l => l.code === h.code)) r.fail('js/sprachen.js', 'hidden language ' + h.code + ' is offered');
      const all = simulate({ storage: { 'pinn.sprache': h.code, 'pinn.sprachen.alle': '1' } });
      if (all.api.current !== h.code) r.fail('js/sprachen.js', 'hidden language ' + h.code + ' cannot be unlocked for testing');
      else {
        if (all.src[0] !== 'i18n/' + h.code + '.i18n.js' || all.src[1] !== 'i18n/en.i18n.js' || all.src.length !== 2) r.fail('js/sprachen.js', 'unlocked hidden language ' + h.code + ' should load its own file, then English (got ' + JSON.stringify(all.src) + ')');
        const own = data[h.code] || {};
        const hasOwn = Object.keys(own).find(k => !k.includes('#') && typeof own[k] === 'string' && !/\{/.test(own[k]));
        const gap = Object.keys(en).find(k => !k.includes('#') && !(k in own) && typeof en[k] === 'string' && !/\{/.test(en[k]));
        if (hasOwn && all.ctx.tk(hasOwn) !== own[hasOwn]) r.fail('js/sprachen.js', 'unlocked hidden language ' + h.code + ': tk("' + hasOwn + '") does not return its own text');
        if (gap && all.ctx.tk(gap) !== en[gap]) r.fail('js/sprachen.js', 'unlocked hidden language ' + h.code + ': a key it does not have yet (' + gap + ') should show the English text');
      }
    }
    const wgKey = Object.keys(data.de).find(k => /#wg$/.test(k));
    if (wgKey) {
      const wg = simulate({ storage: { 'pinn.sprache': 'de', 'pinn.wohnform': 'wg' } });
      if (wg.ctx.tk(wgKey.slice(0, -3)) !== data.de[wgKey]) r.fail('js/sprachen.js', 'flat share variant ' + wgKey + ' not used');
    }
  } catch (e) { r.fail('js/sprachen.js', 'simulation failed: ' + e.message); }
}

const keyCount = en ? Object.keys(en).filter(k => !k.includes('#')).length : 0;
r.info(Object.keys(data).length + ' language file(s), ' + keyCount + ' key(s), ' + used.size + ' used in the code');
warnings.slice(0, 20).forEach(w => console.log('  warning: ' + w));
if (warnings.length > 20) console.log('  … ' + (warnings.length - 20) + ' more warnings');
r.done();
