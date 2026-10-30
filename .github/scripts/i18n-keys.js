#!/usr/bin/env node
/* pinn. – tool for the key-based language files (.github/scripts/i18n-keys.js, since 1.111.0; rewritten in 1.119.3)

   pb_public/i18n/<code>.i18n.js holds every text of a language under a key – German included, English is the
   reference. Since 1.119.3 the old dictionaries (pb_public/lang/) are gone, so new texts are written by hand in
   every language. This tool writes them into the files in the standard layout (sorted, one line per key) and adds
   the flat share variant "<key>#wg" automatically wherever the flat share terms below change the text.

   Usage:
     node .github/scripts/i18n-keys.js put <map.json>                  many keys in every language at once
     node .github/scripts/i18n-keys.js set <key> <lang> "<text>"        one text of one language by hand
     node .github/scripts/i18n-keys.js remove <key>                     a key (and its flat share variant) everywhere
     node .github/scripts/i18n-keys.js format                           rewrite every file in the standard layout
     node .github/scripts/i18n-keys.js todo <lang> <out.json> [prefix …] keys a language still lacks, with the English text
     node .github/scripts/i18n-keys.js lang <lang> <map.json>           many texts of ONE language (e.g. a hidden language)

   put      reads a JSON file { "<key>": { "de": "…", "en": "…", "fr": "…", … }, "<old key>": null } – every
            language that is offered (not hidden) is required; hidden languages are written when given. A plural
            text is an object of forms ({ "one": "…", "other": "…" }; js/textkern.js → FORMS says which forms a
            language needs, e.g. Russian one/few/many/other); zh, ja and ko keep only "other". null removes the key.
            The "#wg" variant is created from the flat share terms – except for keys of the areas that always keep
            the family terms (NO_WG below). An own variant can be given as "<key>#wg": { … } after the plain key.
   todo     (since 1.120.0) writes { "<key>": <English text>, … } of every key the language does not have yet –
            only keys starting with one of the prefixes, if given (e.g. common. nav. settings.). Translate the
            texts in this file and write them back with "lang".
   lang     (since 1.120.0) reads { "<key>": "<text>" | { plural forms } | null } and writes only this language –
            for a language that is translated step by step (Russian, hidden: true in js/sprachen.js). Plural forms,
            placeholders and unknown keys are checked against English; the "#wg" variant is created as with put.
   set      writes one text as it is (a text starting with "{" is read as JSON, e.g. plural forms); no "#wg" variant
            is created – set "<key>#wg" by hand if needed.
   Check the result with  node .github/scripts/check-keys.js. */

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./common');

const I18N_DIR = path.join(ROOT, 'pb_public', 'i18n');
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
  while ((m = re.exec(block))) out.push({ code: m[1], name: m[2], hidden: /hidden:\s*true/.test(m[0]) });
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

/* ---------- flat share terms ----------
   Applied to a finished text to suggest its "#wg" variant (moved here from js/sprachen.js in 1.119.3 – the app
   itself only uses the variants in the files). keep: terms that stay (e.g. Familienstammbuch). A new language
   needs its own entry, otherwise the German rules are used (which change nothing in other scripts). */
function cap(up, s) { return up ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
const FAM_EMOJI = /\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67(?:\u200D\uD83D\uDC66)?/g;
const WG_EMOJI = '\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1';
// Russian case endings: член семьи → сосед, семья → квартира, семейный → общий
const RU_NEIGHBOUR = { '': '', 'а': 'а', 'у': 'у', 'ом': 'ом', 'е': 'е', 'ы': 'и', 'ов': 'ей', 'ам': 'ям', 'ами': 'ями', 'ах': 'ях' };
const RU_FLAT = { 'ья': 'а', 'ьи': 'ы', 'ье': 'е', 'ью': 'у', 'ьёй': 'ой', 'ьей': 'ой', 'ей': '', 'ьям': 'ам', 'ьями': 'ами', 'ьях': 'ах' };
const RU_COMMON = { 'ый': 'ий', 'ая': 'ая', 'ое': 'ее', 'ые': 'ие', 'ого': 'его', 'ому': 'ему', 'ой': 'ей', 'ом': 'ем', 'ых': 'их', 'ым': 'им', 'ую': 'ую', 'ыми': 'ими' };
const TERMS = {
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
  ja: { keep: /家族登録簿/g, rules: [
    [/家族メンバー/g, 'ルームメイト'],
    [/家族全員/g, 'ルームシェア全員'],
    [/家族/g, 'ルームシェア'],
  ] },
  ko: { keep: /가족관계 등록부|가족용 밴/g, rules: [
    [/가족 구성원이/g, '룸메이트가'],
    [/가족 구성원은/g, '룸메이트는'],
    [/가족 구성원을/g, '룸메이트를'],
    [/가족 구성원과/g, '룸메이트와'],
    [/가족 구성원으로/g, '룸메이트로'],
    [/가족 구성원/g, '룸메이트'],
    [/온 가족/g, '셰어하우스 전체'],
    [/가족 전체/g, '셰어하우스 전체'],
    [/가족이/g, '셰어하우스가'],
    [/가족은/g, '셰어하우스는'],
    [/가족을/g, '셰어하우스를'],
    [/가족과/g, '셰어하우스와'],
    [/가족으로/g, '셰어하우스로'],
    [/가족/g, '셰어하우스'],
  ] },
  // Russian (since 1.120.0): \b does not work for Cyrillic, so the rules use Unicode lookarounds (flag u).
  // семья → квартира and член(ы) семьи → сосед(и) decline in parallel, so each case maps to the same case.
  ru: { keep: /семейн\p{L}*\s+(?:врач|автомобил|бюджет)\p{L}*/giu, rules: [
    [/(?<![\p{L}\p{N}])([Чч])лен(|а|у|ом|е|ы|ов|ам|ами|ах)(\s+(?:вашей|твоей|нашей|этой|своей|всей)?\s*)семьи(?![\p{L}\p{N}])/gu,
      function (m, c, end) { return cap(c === 'Ч', 'сосед' + RU_NEIGHBOUR[end]); }],
    [/(?<![\p{L}\p{N}])([Сс])ем(ья|ьи|ье|ью|ьёй|ьей|ей|ьям|ьями|ьях)(?![\p{L}\p{N}])/gu,
      function (m, c, end) { return cap(c === 'С', 'квартир' + RU_FLAT[end]); }],
    [/(?<![\p{L}\p{N}])([Сс])емейн(ый|ая|ое|ые|ого|ому|ой|ом|ых|ым|ую|ыми)(?![\p{L}\p{N}])/gu,
      function (m, c, end) { return cap(c === 'С', 'общ' + RU_COMMON[end]); }],
  ] },
};

function wgText(code, s) {
  const t = TERMS[code] || TERMS.de;
  const kept = [];
  s = s.replace(t.keep, m => { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0002'; });
  for (const [re, rep] of t.rules) s = s.replace(re, rep);
  s = s.replace(FAM_EMOJI, WG_EMOJI);
  if (kept.length) s = s.replace(/\u0001(\d+)\u0002/g, (m, i) => kept[+i]);
  return s;
}
// Flat share variant of an entry (string or plural object), or null if nothing changes
function wgEntry(code, entry) {
  if (typeof entry === 'string') { const w = wgText(code, entry); return w !== entry ? w : null; }
  const out = {};
  let changed = false;
  for (const f of Object.keys(entry)) { out[f] = wgText(code, entry[f]); if (out[f] !== entry[f]) changed = true; }
  return changed ? out : null;
}

/* ---------- one entry for one language ---------- */
function fit(code, key, e) {
  if (typeof e === 'string') return e;
  if (!e || typeof e !== 'object') throw new Error(key + ' (' + code + '): a text must be a string or an object of plural forms');
  const forms = K.forms(code);
  // zh, ja, ko have a single form: the "other" text of the given forms is kept
  if (forms.length === 1) {
    if (typeof e.other !== 'string') throw new Error(key + ' (' + code + '): plural form "other" missing');
    return { other: e.other };
  }
  const out = {};
  for (const f of forms) {
    if (typeof e[f] !== 'string') throw new Error(key + ' (' + code + '): plural form "' + f + '" missing (' + code + ' needs ' + forms.join(', ') + ')');
    out[f] = e[f];
  }
  // "other" may always be given in addition (Russian: fractions, otherwise js/textkern.js falls back to "few")
  if (typeof e.other === 'string' && !forms.includes('other')) out.other = e.other;
  for (const f of Object.keys(e)) if (!forms.includes(f) && f !== 'other') throw new Error(key + ' (' + code + '): unknown plural form "' + f + '"');
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const langs = languages();
  const files = {};
  for (const l of langs) { const f = loadKeys(l.code); if (f) files[l.code] = f.data; }
  const save = () => { for (const l of langs) if (files[l.code]) writeKeys(l, files[l.code]); };
  const keyOk = key => /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+(#wg)?$/.test(key);

  if (cmd === 'put') {
    if (!args[1]) return usage();
    const map = JSON.parse(fs.readFileSync(path.resolve(args[1]), 'utf8'));
    const errors = [];
    for (const [key, spec] of Object.entries(map)) {
      if (!keyOk(key)) { errors.push(key + ': keys look like area.part.name (letters and digits, dots between)'); continue; }
      if (spec === null) { for (const c of Object.keys(files)) { delete files[c][key]; delete files[c][key + '#wg']; } continue; }
      const own = key.endsWith('#wg');
      for (const l of langs) {
        if (spec[l.code] === undefined) { if (!l.hidden) errors.push(key + ': text for "' + l.code + '" missing'); continue; }
        if (!files[l.code]) { if (l.hidden) files[l.code] = {}; else { errors.push(l.code + '.i18n.js missing'); continue; } }
        try {
          const e = fit(l.code, key, spec[l.code]);
          files[l.code][key] = e;
          if (own) continue;
          delete files[l.code][key + '#wg'];
          const wg = noWg(key) ? null : wgEntry(l.code, e);
          if (wg) files[l.code][key + '#wg'] = wg;
        } catch (e) { errors.push(e.message); }
      }
    }
    if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); console.error('nothing written'); process.exit(1); }
    save();
    console.log('✓ ' + Object.keys(map).length + ' key(s) written');
  } else if (cmd === 'todo') {
    const [, code, out, ...prefixes] = args;
    if (!code || !out || !langs.some(l => l.code === code)) return usage();
    const en = files.en || {};
    const have = files[code] || {};
    const todo = {};
    for (const key of Object.keys(en).sort(order)) {
      if (key.includes('#') || Object.prototype.hasOwnProperty.call(have, key)) continue;
      if (prefixes.length && !prefixes.some(p => key.startsWith(p))) continue;
      todo[key] = en[key];
    }
    fs.writeFileSync(path.resolve(out), JSON.stringify(todo, null, 1) + '\n');
    const total = Object.keys(en).filter(k => !k.includes('#')).length;
    const done = Object.keys(have).filter(k => !k.includes('#') && Object.prototype.hasOwnProperty.call(en, k)).length;
    console.log('✓ ' + Object.keys(todo).length + ' key(s) to translate written to ' + out + ' (' + code + ': ' + done + ' of ' + total + ' done)');
  } else if (cmd === 'lang') {
    const [, code, file] = args;
    const lang = langs.find(l => l.code === code);
    if (!lang || !file) return usage();
    if (code === 'en') throw new Error('English is the reference – use put for new keys');
    const map = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const en = files.en || {};
    const names = e => { const s = new Set(); (typeof e === 'string' ? [e] : Object.values(e)).forEach(t => (String(t).match(/\{(\w+)\}/g) || []).forEach(n => s.add(n))); return [...s].sort().join(','); };
    const data = files[code] = files[code] || {};
    const errors = [];
    for (const [key, spec] of Object.entries(map)) {
      const plain = key.split('#')[0];
      if (!keyOk(key)) { errors.push(key + ': keys look like area.part.name (letters and digits, dots between)'); continue; }
      if (!Object.prototype.hasOwnProperty.call(en, plain)) { errors.push(key + ': not in en.i18n.js'); continue; }
      if (spec === null) { delete data[key]; if (key === plain) delete data[key + '#wg']; continue; }
      try {
        const e = fit(code, key, spec);
        if (names(e) !== names(en[plain])) throw new Error(key + ' (' + code + '): placeholders ' + (names(e) || '–') + ' instead of ' + (names(en[plain]) || '–'));
        data[key] = e;
        if (key !== plain) continue;
        delete data[key + '#wg'];
        const wg = noWg(key) ? null : wgEntry(code, e);
        if (wg) data[key + '#wg'] = wg;
      } catch (e) { errors.push(e.message); }
    }
    if (errors.length) { errors.forEach(e => console.error('✗ ' + e)); console.error('nothing written'); process.exit(1); }
    writeKeys(lang, data);
    const total = Object.keys(en).filter(k => !k.includes('#')).length;
    const done = Object.keys(data).filter(k => !k.includes('#') && Object.prototype.hasOwnProperty.call(en, k)).length;
    console.log('✓ ' + Object.keys(map).length + ' text(s) written to ' + code + '.i18n.js (' + done + ' of ' + total + ' keys)');
  } else if (cmd === 'set') {
    const [, key, code, text] = args;
    const lang = langs.find(l => l.code === code);
    if (!key || !lang || text == null) return usage();
    if (!keyOk(key)) throw new Error(key + ': keys look like area.part.name (letters and digits, dots between)');
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
  console.log('usage: node .github/scripts/i18n-keys.js put <map.json>\n' +
    '       node .github/scripts/i18n-keys.js set <key> <lang> "<text>"\n' +
    '       node .github/scripts/i18n-keys.js remove <key>\n' +
    '       node .github/scripts/i18n-keys.js format\n' +
    '       node .github/scripts/i18n-keys.js todo <lang> <out.json> [prefix …]\n' +
    '       node .github/scripts/i18n-keys.js lang <lang> <map.json>');
  process.exitCode = 1;
}

module.exports = { languages, loadKeys, writeKeys, wgText, wgEntry, noWg, NO_WG, I18N_DIR };
if (require.main === module) {
  try { main(); } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
