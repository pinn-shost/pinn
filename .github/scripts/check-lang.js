#!/usr/bin/env node
/* pinn. – checks the language files in pb_public/lang against the English reference (en.js).
   usage: node .github/scripts/check-lang.js [lang ...] [--warn-missing]
   Without arguments every file in pb_public/lang except en.js is checked.
   Errors (exit code 1): file cannot be loaded, wrong language code, broken or wrong placeholders,
   missing texts (only warnings with --warn-missing). Warnings: extra texts, texts identical to English.
   Also used as a module by translate.js (loadLang, validate). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const LANG_DIR = path.join(ROOT, 'pb_public', 'lang');

// Load a language file by running it with a stub of window.PINN_I18N.load.
// The app uses only the FIRST load() call of a file (later calls are ignored), so exactly one call is required.
function loadLang(file) {
  const calls = [];
  const window = { PINN_I18N: { load: (code, data) => { calls.push({ code, data }); } } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file, timeout: 10000 });
  if (calls.length !== 1) {
    throw new Error(calls.length
      ? 'PINN_I18N.load is called ' + calls.length + ' times – the app only uses the first call, keep exactly one'
      : 'no PINN_I18N.load("<code>", {exact, patterns}) call found');
  }
  const got = calls[0];
  if (!got.data || typeof got.data.exact !== 'object' || !Array.isArray(got.data.patterns)) {
    throw new Error('PINN_I18N.load needs an object with "exact" (object) and "patterns" (array)');
  }
  return got;
}

// Placeholder tokens of a text. The app (js/sprachen.js, fill) understands:
//   {0} {jahr}            a value, filled in and translated by the app
//   {1|a}                 "a" if the German value is not empty, otherwise nothing   (e.g. {1|s} plural)
//   {1|a|b}               "a" if the value is not empty, otherwise "b"              (e.g. {1|ões|ão})
//   {1|x=a|b}             "a" if the value is exactly "x", otherwise "b"            (e.g. {2|ag=y|ies})
// JSON-like examples such as {"a": 1} are plain text, not placeholders.
const TOKEN = /\{\w+(?:\|[^{}]*)?\}/g;
const BARE = /^\{(\w+)\}$/;
const COND = /^\{(\w+)\|[^{}=|]*=[^{}|]*(?:\|[^{}|]*)?\}$/;
const OPT = /^\{(\w+)\|[^{}=|]*(?:\|[^{}|=]*)?\}$/;

function parseTokens(text) {
  const out = { bare: new Set(), cond: new Set(), errors: [], braces: (text.replace(TOKEN, '').match(/[{}]/g) || []).join('') };
  for (const t of text.match(TOKEN) || []) {
    let m;
    if ((m = BARE.exec(t))) out.bare.add(m[1]);
    else if ((m = COND.exec(t)) || (m = OPT.exec(t))) out.cond.add(m[1]);
    else out.errors.push('invalid placeholder ' + t);
  }
  return out;
}
function namesOf(text) {
  return new Set((text.match(TOKEN) || []).map(t => (/^\{(\w+)/.exec(t) || [])[1]).filter(Boolean));
}

/* Check one translation against the German original and the English reference.
   Rules: a value used plainly in English ({0}) must stay plainly in the translation; a value that English
   only uses conditionally ({1|s}) carries a German word ending, so the translation may use it
   conditionally ({1|a|b}, {1|x=a|b}) or leave it out, but never plainly. Names must exist in the German text.
   Returns a list of problems (empty = ok). */
function validate(de, en, tr) {
  const problems = [];
  if (typeof tr !== 'string') return ['not a string'];
  if (!tr.trim() && en.trim()) return ['empty'];
  const deNames = namesOf(de);
  const e = parseTokens(en);
  const t = parseTokens(tr);
  problems.push(...t.errors);
  // Literal braces (outside placeholders) must stay as in English
  if (t.braces !== e.braces) problems.push('braces changed');
  for (const n of [...t.bare, ...t.cond]) {
    if (!deNames.has(n)) problems.push('unknown placeholder {' + n + '}');
  }
  for (const n of e.bare) {
    if (!t.bare.has(n) && !t.cond.has(n)) problems.push('missing {' + n + '}');
  }
  for (const n of t.bare) {
    if (!e.bare.has(n) && e.cond.has(n)) problems.push('{' + n + '} must not be used plainly (German ending)');
  }
  return [...new Set(problems)];
}

function checkFile(code, en, opts) {
  const errors = [];
  const warnings = [];
  const file = path.join(LANG_DIR, code + '.js');
  let lang;
  try { lang = loadLang(file); } catch (err) { return { errors: [file + ': ' + err.message], warnings }; }
  if (lang.code !== code) errors.push('language code is "' + lang.code + '", file name says "' + code + '"');
  const missingList = opts.warnMissing ? warnings : errors;
  let same = 0;

  // exact texts
  for (const [de, enText] of Object.entries(en.exact)) {
    if (!Object.prototype.hasOwnProperty.call(lang.data.exact, de)) { missingList.push('missing exact: ' + short(de)); continue; }
    const tr = lang.data.exact[de];
    for (const p of validate(de, enText, tr)) errors.push('exact "' + short(de) + '": ' + p);
    if (tr === enText && /[a-z]{4}/i.test(enText) && enText.split(' ').length > 2) same++;
  }
  for (const de of Object.keys(lang.data.exact)) {
    if (!Object.prototype.hasOwnProperty.call(en.exact, de)) warnings.push('extra exact (not in en.js): ' + short(de));
  }

  // patterns (order matters for matching, compare by German text)
  const trPat = new Map();
  for (const p of lang.data.patterns) {
    if (!Array.isArray(p) || p.length !== 2) { errors.push('broken pattern entry ' + short(JSON.stringify(p))); continue; }
    trPat.set(p[0], p[1]);
  }
  const enOrder = en.patterns.map(p => p[0]);
  for (const [de, enText] of en.patterns) {
    if (!trPat.has(de)) { missingList.push('missing pattern: ' + short(de)); continue; }
    for (const p of validate(de, enText, trPat.get(de))) errors.push('pattern "' + short(de) + '": ' + p);
  }
  const enSet = new Set(enOrder);
  for (const de of trPat.keys()) if (!enSet.has(de)) warnings.push('extra pattern (not in en.js): ' + short(de));
  const order = lang.data.patterns.map(p => p[0]).filter(de => enSet.has(de));
  const expected = enOrder.filter(de => trPat.has(de));
  if (order.join('\u0000') !== expected.join('\u0000')) warnings.push('pattern order differs from en.js');
  if (same) warnings.push(same + ' longer texts are identical to English (untranslated?)');
  return { errors, warnings };
}

function short(s) { s = String(s).replace(/\s+/g, ' '); return s.length > 70 ? s.slice(0, 67) + '…' : s; }

function main() {
  const args = process.argv.slice(2);
  const opts = { warnMissing: args.includes('--warn-missing') };
  let codes = args.filter(a => !a.startsWith('--'));
  if (!codes.length) codes = fs.readdirSync(LANG_DIR).filter(f => /^[a-z]{2}(-[A-Z]{2})?\.js$/.test(f) && f !== 'en.js').map(f => f.slice(0, -3)).sort();
  const en = loadLang(path.join(LANG_DIR, 'en.js')).data;
  let failed = false;
  for (const code of codes) {
    const r = checkFile(code, en, opts);
    const head = code + '.js: ' + r.errors.length + ' error(s), ' + r.warnings.length + ' warning(s)';
    console.log((r.errors.length ? '✗ ' : '✓ ') + head);
    r.errors.slice(0, 50).forEach(x => console.log('  error: ' + x));
    if (r.errors.length > 50) console.log('  … ' + (r.errors.length - 50) + ' more errors');
    r.warnings.slice(0, 20).forEach(x => console.log('  warning: ' + x));
    if (r.warnings.length > 20) console.log('  … ' + (r.warnings.length - 20) + ' more warnings');
    if (r.errors.length) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { loadLang, validate, LANG_DIR, ROOT };
if (require.main === module) main();
