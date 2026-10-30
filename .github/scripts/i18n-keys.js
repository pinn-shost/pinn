#!/usr/bin/env node
/* pinn. – tool for the key-based language files (.github/scripts/i18n-keys.js, since 1.111.0)

   pb_public/i18n/<code>.i18n.js holds every text of a language under a key. While the app moves from German
   source texts to keys (roadmap step 6), this tool takes the translations that already exist in the old
   dictionaries (pb_public/lang/<code>.js, German text → translation) and writes them under a key into every
   key file – German included. No translation has to be typed again and none gets lost.

   Usage:
     node .github/scripts/i18n-keys.js add <key> "<German text>" [--ctx <c>] [--names a,b] [--force]
     node .github/scripts/i18n-keys.js import <map.json> [--force]
     node .github/scripts/i18n-keys.js set <key> <lang> "<text>"        one text by hand (e.g. a new text)
     node .github/scripts/i18n-keys.js remove <key>
     node .github/scripts/i18n-keys.js format                            rewrite every file in the standard layout

   add      looks the German text up in every old dictionary: exact texts (with the context "<c>|text" first,
            see data-i18n-ctx) or, for texts with placeholders, the patterns. Numbered placeholders get names:
            --names n,name turns {0} into {n} and {1} into {name}. A text ending in ":" or "…" also matches the
            dictionary entry without it, and symbols or emojis at the start/end ("🗓 Kalender", "+ Liste") are kept
            while the text between them is looked up – the same way the old dictionaries translate on the screen.
            For a flat share, a variant "<key>#wg" is added wherever the flat share terms of js/sprachen.js (TERMS)
            change the text – except for keys of the areas that always keep the family terms (NO_WG below: sign-in,
            main admin, the switch between family and flat share, backups & updates).
   import   the same for many keys from a JSON file:
              { "settings.region.title": "Sprache & Region",
                "settings.region.save": { "de": "Speichern", "ctx": "fz" },
                "tasks.open": { "plural": { "one": "{0} offene Aufgabe", "other": "{0} offene Aufgaben" }, "names": ["n"] } }
            For a plural text every German form is looked up on its own; languages with a single form (zh, ja, ko)
            take the translation of "other". Forms German does not have (e.g. Russian "few") are written by hand.
   Nothing is written if a translation is missing or uses a placeholder with a German ending ({1|s}) – such a text
   needs a plural entry by hand. An existing key is only replaced with --force.
   The old dictionaries are never changed (the same German text may still be used elsewhere). */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./common');

const I18N_DIR = path.join(ROOT, 'pb_public', 'i18n');
const LANG_DIR = path.join(ROOT, 'pb_public', 'lang');
const SPRACHEN = path.join(ROOT, 'pb_public', 'js', 'sprachen.js');
const K = require(path.join(ROOT, 'pb_hooks', 'pinn-textkern.js'));
// Keys of these areas never get a flat share variant: their screens keep the family terms (data-no-term).
// maint.* = backups & updates: they always concern every family on the server.
// std.* = standard names of stored data (categories, places, units …): shown as they are, see js/standardnamen.js.
const NO_WG = ['login.', 'mainAdmin.', 'settings.household.', 'maint.', 'std.'];
const noWg = key => NO_WG.some(p => key.startsWith(p));

/* ---------- languages (from PINN_LANGUAGES in js/sprachen.js) ---------- */
function languages() {
  const src = fs.readFileSync(SPRACHEN, 'utf8');
  const block = src.slice(src.indexOf('window.PINN_LANGUAGES = ['), src.indexOf('];', src.indexOf('window.PINN_LANGUAGES = [')));
  const out = [];
  const re = /\{\s*code:\s*'([a-z]{2})',\s*name:\s*'([^']*)'[^\n]*/g;
  let m;
  while ((m = re.exec(block))) out.push({ code: m[1], name: m[2], hidden: /hidden:\s*true/.test(m[0]), file: (/file:\s*'([^']*)'/.exec(m[0]) || [])[1] || '' });
  return out;
}

/* ---------- key files ---------- */
function keyFile(code) { return path.join(I18N_DIR, code + '.i18n.js'); }
function loadKeys(code) {
  const file = keyFile(code);
  if (!fs.existsSync(file)) return null;
  const calls = [];
  const window = { PINN_I18N: { keys: (c, data) => calls.push({ code: c, data }) } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file, timeout: 10000 });
  if (calls.length !== 1) throw new Error(path.basename(file) + ': needs exactly one PINN_I18N.keys(…) call, found ' + calls.length);
  return calls[0];
}
// Sort: by key without variant, the plain key before its "#wg" variant
function order(a, b) {
  const [ab, av = ''] = a.split('#'), [bb, bv = ''] = b.split('#');
  return ab < bb ? -1 : ab > bb ? 1 : av < bv ? -1 : av > bv ? 1 : 0;
}
function writeKeys(lang, data) {
  const keys = Object.keys(data).sort(order);
  const lines = keys.map((k, i) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(data[k]) + (i < keys.length - 1 ? ',' : ''));
  const head = '/* pinn. – texts ' + lang.name + ' (' + lang.code + '), key based – pb_public/i18n/' + lang.code + '.i18n.js\n' +
    '   One line per key, sorted. A text is a string or an object with plural forms (' + K.forms(lang.code).join(', ') + ').\n' +
    '   Placeholders {name} are filled by the app. "<key>#wg" = variant for a flat share.\n' +
    '   English (en) is the reference. How to add or change texts: .github/CONTRIBUTING.md → "Texts". */\n';
  const body = 'window.PINN_I18N && window.PINN_I18N.keys(' + JSON.stringify(lang.code) + ', {\n' + lines.join('\n') + (lines.length ? '\n' : '') + '});\n';
  fs.mkdirSync(I18N_DIR, { recursive: true });
  fs.writeFileSync(keyFile(lang.code), head + body);
}

/* ---------- old dictionaries ---------- */
const oldCache = {};
function loadOld(code) {
  if (code in oldCache) return oldCache[code];
  const file = path.join(LANG_DIR, code + '.js');
  if (!fs.existsSync(file)) return (oldCache[code] = null);
  const calls = [];
  const window = { PINN_I18N: { load: (c, data) => calls.push(data) } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file, timeout: 20000 });
  const d = calls[0] || { exact: {}, patterns: [] };
  return (oldCache[code] = { exact: d.exact || {}, patterns: new Map((d.patterns || []).map(p => [p[0], p[1]])) });
}
// Translation of a German text in one old dictionary (null = not found)
function lookup(code, de, ctx) {
  const d = loadOld(code);
  if (!d) return null;
  const one = s => {
    if (ctx && Object.prototype.hasOwnProperty.call(d.exact, ctx + '|' + s)) return d.exact[ctx + '|' + s];
    if (Object.prototype.hasOwnProperty.call(d.exact, s)) return d.exact[s];
    if (d.patterns.has(s)) return d.patterns.get(s);
    return null;
  };
  const core = s => {
    let out = one(s);
    if (out === null) {
      const m = /^([\s\S]*?)(\s*[:…]+)$/.exec(s);
      if (m) { const stem = one(m[1]); if (stem !== null) out = stem + m[2]; }
    }
    return out;
  };
  let out = core(de);
  if (out === null) {
    // Symbols/emojis at the edges stay as they are (like trLoose in js/sprachen.js)
    const m = /^([^A-Za-zÄÖÜäöüßÀ-ÿ0-9{]*)([\s\S]*?)([^A-Za-zÄÖÜäöüßÀ-ÿ0-9}]*)$/.exec(de);
    if (m && (m[1] || m[3]) && m[2]) { const mid = core(m[2]); if (mid !== null) out = m[1] + mid + m[3]; }
  }
  return out;
}
// Numbered placeholders → names; texts with German endings ({1|s}) are refused
function rename(text, names, where) {
  if (/\{\w+\|[^{}]*\}/.test(text)) throw new Error(where + ': uses a placeholder with a German ending (' + text + ') – write a plural entry by hand');
  return text.replace(/\{(\d+)\}/g, (all, i) => {
    if (!names || !names[+i]) throw new Error(where + ': placeholder {' + i + '} has no name – use --names');
    return '{' + names[+i] + '}';
  });
}

/* ---------- flat share terms (TERMS in js/sprachen.js) ---------- */
let termsCache = null;
function terms() {
  if (termsCache) return termsCache;
  const src = fs.readFileSync(SPRACHEN, 'utf8');
  const grab = (start) => {
    const i = src.indexOf(start);
    if (i < 0) throw new Error('js/sprachen.js: "' + start + '" not found');
    let depth = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}' && --depth === 0) return src.slice(j, k + 1);
    }
    throw new Error('js/sprachen.js: end of ' + start + ' not found');
  };
  const fam = /var FAM_EMOJI = (\/[^\n]*\/g);/.exec(src);
  const wg = /var WG_EMOJI = ('[^']*');/.exec(src);
  const code = 'function cap(up, s) { return up ? s.charAt(0).toUpperCase() + s.slice(1) : s; }\n' +
    'var FAM_EMOJI = ' + fam[1] + ';\nvar WG_EMOJI = ' + wg[1] + ';\nvar TERMS = ' + grab('var TERMS = {') + ';\nout = { TERMS: TERMS, FAM_EMOJI: FAM_EMOJI, WG_EMOJI: WG_EMOJI };';
  const box = {};
  vm.runInNewContext(code, box);
  return (termsCache = box.out);
}
// Same as term() in js/sprachen.js
function wgText(code, s) {
  const T = terms();
  const t = T.TERMS[code] || T.TERMS.de;
  const kept = [];
  s = s.replace(t.keep, m => { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0002'; });
  for (const [re, rep] of t.rules) s = s.replace(re, rep);
  s = s.replace(T.FAM_EMOJI, T.WG_EMOJI);
  if (kept.length) s = s.replace(/\u0001(\d+)\u0002/g, (m, i) => kept[+i]);
  return s;
}
function wgEntry(code, entry) {
  if (typeof entry === 'string') { const w = wgText(code, entry); return w !== entry ? w : null; }
  const out = {};
  let changed = false;
  for (const f of Object.keys(entry)) { out[f] = wgText(code, entry[f]); if (out[f] !== entry[f]) changed = true; }
  return changed ? out : null;
}

/* ---------- building one key for every language ---------- */
function build(key, spec, langs) {
  if (typeof spec === 'string') spec = { de: spec };
  const names = spec.names || null, ctx = spec.ctx || '';
  const result = {};
  for (const lang of langs) {
    if (lang.code === 'de') {
      if (spec.plural) {
        const o = {};
        for (const f of K.forms('de')) o[f] = rename(spec.plural[f], names, key + ' (de)');
        result.de = o;
      } else result.de = rename(spec.de, names, key + ' (de)');
      continue;
    }
    if (!lang.file) continue;   // no old dictionary (hidden language) – written by hand later
    if (spec.plural) {
      const o = {};
      for (const f of K.forms(lang.code)) {
        const src = spec.plural[f] || spec.plural.other;
        const tr = lookup(lang.code, src, ctx);
        if (tr === null) throw new Error(key + ' (' + lang.code + '): no translation for "' + src + '"');
        o[f] = rename(tr, names, key + ' (' + lang.code + ')');
      }
      result[lang.code] = o;
    } else {
      const tr = lookup(lang.code, spec.de, ctx);
      if (tr === null) throw new Error(key + ' (' + lang.code + '): no translation for "' + spec.de + '"');
      result[lang.code] = rename(tr, names, key + ' (' + lang.code + ')');
    }
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const force = args.includes('--force');
  if (force) args.splice(args.indexOf('--force'), 1);
  const cmd = args[0];
  const langs = languages();
  const files = {};
  for (const l of langs) { const f = loadKeys(l.code); if (f) files[l.code] = f.data; }
  const save = () => { for (const l of langs) if (files[l.code]) writeKeys(l, files[l.code]); };
  const put = (key, spec) => {
    if (!/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(key)) throw new Error(key + ': keys look like area.part.name (letters and digits, dots between)');
    if (!force && files.en && Object.prototype.hasOwnProperty.call(files.en, key)) throw new Error(key + ': exists already (use --force to replace it)');
    const res = build(key, spec, langs);
    for (const code of Object.keys(res)) {
      files[code] = files[code] || {};
      files[code][key] = res[code];
      delete files[code][key + '#wg'];
      const wg = noWg(key) ? null : wgEntry(code, res[code]);
      if (wg) files[code][key + '#wg'] = wg;
    }
  };

  if (cmd === 'add') {
    const ctx = flag('--ctx'), names = flag('--names');
    const [, key, de] = args;
    if (!key || de == null) return usage();
    put(key, { de, ctx: ctx || '', names: names ? names.split(',') : null });
    save();
    console.log('✓ ' + key);
  } else if (cmd === 'import') {
    const map = JSON.parse(fs.readFileSync(path.resolve(args[1]), 'utf8'));
    const errors = [];
    for (const [key, spec] of Object.entries(map)) { try { put(key, spec); } catch (e) { errors.push(e.message); } }
    if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); console.error('nothing written'); process.exit(1); }
    save();
    console.log('✓ ' + Object.keys(map).length + ' key(s) imported');
  } else if (cmd === 'set') {
    const [, key, code, text] = args;
    const lang = langs.find(l => l.code === code);
    if (!key || !lang || text == null) return usage();
    files[code] = files[code] || {};
    files[code][key] = /^\s*\{/.test(text) ? JSON.parse(text) : text;
    save();
    console.log('✓ ' + key + ' (' + code + ')');
  } else if (cmd === 'remove') {
    const key = args[1];
    if (!key) return usage();
    for (const code of Object.keys(files)) { delete files[code][key]; delete files[code][key + '#wg']; }
    save();
    console.log('✓ removed ' + key);
  } else if (cmd === 'format') {
    save();
    console.log('✓ formatted');
  } else usage();
}
function usage() {
  console.log('usage: node .github/scripts/i18n-keys.js add <key> "<German text>" [--ctx c] [--names a,b] [--force]\n' +
    '       node .github/scripts/i18n-keys.js import <map.json> [--force]\n' +
    '       node .github/scripts/i18n-keys.js set <key> <lang> "<text>"\n' +
    '       node .github/scripts/i18n-keys.js remove <key>\n' +
    '       node .github/scripts/i18n-keys.js format');
  process.exitCode = 1;
}

module.exports = { languages, loadKeys, writeKeys, lookup, rename, wgText, wgEntry, noWg, NO_WG, I18N_DIR };
if (require.main === module) {
  try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
