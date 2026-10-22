#!/usr/bin/env node
/* pinn. – creates or updates a language file (pb_public/lang/<code>.js) with the Claude API.
   Source: the German originals (keys of en.js), the English texts serve as reference for meaning and terms.
   usage: ANTHROPIC_API_KEY=… node .github/scripts/translate.js --lang pt [--model claude-opus-5-5] [--parallel 4]
   - Texts that already exist in pb_public/lang/<code>.js or in the cache (.translate-cache/<code>.json) and still
     pass the check are reused, so a re-run only translates new or changed texts.
   - Every answer is checked (placeholders, see check-lang.js). Failed texts are retried one by one;
     whatever still fails falls back to English and is listed in translate-report-<code>.txt. */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadLang, validate, LANG_DIR, ROOT } = require('./check-lang.js');

const LANGS = {
  pt: { name: 'Portuguese (Brazil, pt-BR)', notes: 'Use “você”. Quotation marks “ ”.' },
  it: { name: 'Italian', notes: 'Use the informal “tu”. Quotation marks « » or “ ” – pick one and keep it.' },
  zh: { name: 'Simplified Chinese (zh-CN)', notes: 'Use full-width Chinese punctuation (，。：？！) and quotation marks “ ”. No spaces between Chinese characters; one space around Latin words and numbers is fine.' },
  ja: { name: 'Japanese', notes: 'Use polite but short UI language (です/ます for sentences, plain nouns for labels and buttons). Quotation marks 「 」. Japanese punctuation (、。).' },
  ko: { name: 'Korean', notes: 'Use the polite 해요체 for sentences, short nouns for labels and buttons. Quotation marks “ ” or ‘ ’.' },
  fr: { name: 'French', notes: 'Use “tu”. Quotation marks « » with narrow spaces as usual in French.' },
  es: { name: 'Spanish', notes: 'Use “tú”. Quotation marks « » or “ ”.' },
  ru: { name: 'Russian', notes: 'Use “ты”. Quotation marks « ». Russian plurals cannot be expressed with {n|s}: rephrase so no plural ending is needed.' }
};

// ---------- arguments ----------
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const CODE = arg('lang', '');
const MODEL = arg('model', 'claude-opus-5-5');
const PARALLEL = Math.max(1, Math.min(8, parseInt(arg('parallel', '4'), 10) || 4));
const BATCH_CHARS = parseInt(arg('batch-chars', '7000'), 10) || 7000;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(CODE) || CODE === 'en' || CODE === 'de') fail('Please give a language code, e.g. --lang pt (not en/de).');
if (!API_KEY) fail('ANTHROPIC_API_KEY is missing (GitHub: Settings → Secrets and variables → Actions → New repository secret).');
const LANG = LANGS[CODE] || { name: CODE, notes: '' };

const OUT_FILE = path.join(LANG_DIR, CODE + '.js');
const CACHE_DIR = path.join(ROOT, '.translate-cache');
const CACHE_FILE = path.join(CACHE_DIR, CODE + '.json');
const REPORT_FILE = path.join(ROOT, 'translate-report-' + CODE + '.txt');

function fail(msg) { console.error('✗ ' + msg); process.exit(1); }
function log(msg) { console.log('[' + CODE + '] ' + msg); }

// ---------- source texts ----------
const en = loadLang(path.join(LANG_DIR, 'en.js')).data;
// One list of all texts; kind "e" = exact, "p" = pattern. id is the position in this list.
const items = [];
for (const [de, t] of Object.entries(en.exact)) items.push({ kind: 'e', de, en: t });
for (const [de, t] of en.patterns) items.push({ kind: 'p', de, en: t });
const keyOf = it => it.kind + '\u0000' + it.de + '\u0000' + it.en;

// ---------- reuse: cache and existing file ----------
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) { cache = {}; }
let existing = null;
if (fs.existsSync(OUT_FILE)) {
  try { existing = loadLang(OUT_FILE).data; } catch (err) { log('existing file ignored: ' + err.message); }
}
const result = new Array(items.length);
items.forEach((it, i) => {
  const c = cache[keyOf(it)];
  if (typeof c === 'string' && !validate(it.de, it.en, c).length) { result[i] = c; return; }
  if (existing) {
    let old;
    if (it.kind === 'e' && Object.prototype.hasOwnProperty.call(existing.exact, it.de)) old = existing.exact[it.de];
    if (it.kind === 'p') { const p = existing.patterns.find(x => x[0] === it.de); if (p) old = p[1]; }
    // Reuse only real translations, not English fallbacks of an earlier run
    if (typeof old === 'string' && old !== it.en && !validate(it.de, it.en, old).length) result[i] = old;
  }
});
function saveCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  items.forEach((it, i) => { if (typeof result[i] === 'string') cache[keyOf(it)] = result[i]; });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

// ---------- prompt ----------
const SYSTEM = [
  'You translate the user interface of "pinn.", a self-hosted family organizer app (calendar, tasks, household chores,',
  'shopping lists, pantry, recipes, meal plan, finances with shared money pots, documents, vehicles, home, pets, location sharing,',
  'emergency info, kids page with stars). Users are families or flatshares; the German original addresses them with “du”.',
  '',
  'Target language: ' + LANG.name + '. ' + LANG.notes,
  '',
  'You get a JSON array of entries {"i": id, "de": German original, "en": English translation}.',
  'Translate the German original into the target language. Use the English text as reference for meaning and for consistent',
  'terms (e.g. “Kasse” = “Fund”, “Pinnwand” = “Board”, “Vorrat” = “Pantry”, “WG” = “Flatshare”) – translate those terms',
  'naturally, then use the same word everywhere.',
  '',
  'Rules:',
  '- Keep it short and natural like in a good mobile app. Buttons and labels stay short.',
  '- Keep exactly: emojis, symbols (✓ ✗ ➜ × · • → …), numbers, units, line breaks (\\n), URLs, e-mail addresses, the brand “pinn.”',
  '  and product names (PocketBase, iCloud, Google, Apple, Android, iPhone, iPad, Home Assistant, Traccar, WireGuard, FRITZ!Box,',
  '  DuckDNS, GitHub, Ko-fi, Buy Me a Coffee, Docker, NAS, PDF, ETF, ISIN).',
  '- Placeholders in curly braces are filled in by the app:',
  '  * {0}, {1}, {t}, {jahr} … are values. Keep every one that the English text uses as plain {n}, unchanged; you may move them.',
  '  * In German, some placeholders only carry a word ending (e.g. “Schritt{1}”: the value is empty for one, “e” or “en” for several).',
  '    The English text then writes {1|s} (value not empty → “s”) or {1|x=A|B} (value is exactly “x” → A, otherwise B).',
  '    In your language write the endings that fit, with the same logic: {1|PLURAL|SINGULAR} for the {1|s} case',
  '    (Italian “pass{1|i|o}”, Portuguese “refeiç{1|ões|ão}”) and {1|x=SINGULAR|PLURAL} for the {1|x=…} case, where x is the',
  '    value from the English text. Whole words may be used too: {1|Tutte le|La}. If your language has no plural ending',
  '    (Chinese, Japanese, Korean) simply leave the placeholder out. Never write such a placeholder plainly as {n}.',
  '  * Never invent new placeholders or change the names inside the braces.',
  '- Keys starting with "nt|" are notification sentence templates – translate them as full sentences, placeholders as above.',
  '',
  'Answer with ONLY a JSON object mapping each id (as string) to its translation, e.g. {"0":"…","1":"…"}.',
  'No explanations, no markdown, every id exactly once.'
].join('\n');

// ---------- API ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function callClaude(userText, maxTokens) {
  for (let attempt = 1; ; attempt++) {
    let res, body;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM, messages: [{ role: 'user', content: userText }] })
      });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      if (attempt >= 6) throw err;
      await sleep(2000 * attempt * attempt);
      continue;
    }
    if (res.ok) return body;
    const msg = (body && body.error && body.error.message) || res.statusText;
    // Wrong key, model or request: stop right away instead of burning retries
    if ([400, 401, 403, 404].includes(res.status)) fail('API error ' + res.status + ': ' + msg);
    if (attempt >= 8) throw new Error('API error ' + res.status + ': ' + msg);
    const retryAfter = parseFloat(res.headers.get('retry-after') || '0');
    await sleep(Math.max(retryAfter * 1000, 3000 * attempt * attempt));
  }
}

function parseAnswer(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in answer');
  return JSON.parse(text.slice(a, b + 1));
}

// Translate a list of item indices; returns the indices that are still missing or invalid
async function translateBatch(idx) {
  const payload = idx.map(i => ({ i, de: items[i].de, en: items[i].en }));
  const chars = payload.reduce((s, p) => s + p.de.length + p.en.length, 0);
  const maxTokens = Math.min(32000, 2000 + Math.ceil(chars * 2.5));
  let body;
  try {
    body = await callClaude(JSON.stringify(payload), maxTokens);
  } catch (err) {
    log('batch failed: ' + err.message);
    return idx;
  }
  const text = (body.content || []).map(c => (c.type === 'text' ? c.text : '')).join('');
  if (body.stop_reason === 'max_tokens' && idx.length > 1) {
    // Answer cut off: split the batch and try both halves
    const h = Math.ceil(idx.length / 2);
    return [...(await translateBatch(idx.slice(0, h))), ...(await translateBatch(idx.slice(h)))];
  }
  let map;
  try { map = parseAnswer(text); } catch (err) {
    if (idx.length > 1) {
      const h = Math.ceil(idx.length / 2);
      return [...(await translateBatch(idx.slice(0, h))), ...(await translateBatch(idx.slice(h)))];
    }
    return idx;
  }
  const left = [];
  for (const i of idx) {
    const tr = map[String(i)];
    if (typeof tr === 'string' && !validate(items[i].de, items[i].en, tr).length) result[i] = tr;
    else left.push(i);
  }
  return left;
}

function makeBatches(list, limit) {
  const batches = [];
  let cur = [], size = 0;
  for (const i of list) {
    const s = items[i].de.length + items[i].en.length + 40;
    if (cur.length && size + s > limit) { batches.push(cur); cur = []; size = 0; }
    cur.push(i); size += s;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

async function runPool(batches, label) {
  let next = 0, done = 0;
  const left = [];
  async function worker() {
    while (next < batches.length) {
      const b = batches[next++];
      left.push(...(await translateBatch(b)));
      done++;
      saveCache();
      log(label + ' ' + done + '/' + batches.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  return left;
}

// ---------- output ----------
function writeFile() {
  const exact = {};
  const patterns = [];
  const fallback = [];
  items.forEach((it, i) => {
    let tr = result[i];
    if (typeof tr !== 'string') { tr = it.en; fallback.push(it); }
    if (it.kind === 'e') exact[it.de] = tr; else patterns.push([it.de, tr]);
  });
  const header = '/* pinn. – language file ' + LANG.name + ' (' + CODE + ')\n' +
    '   Created with .github/scripts/translate.js (model ' + MODEL + ') from the German originals, English as reference.\n' +
    '   Structure: exact = German original text -> translation, patterns = texts with placeholders {0}, {1} …\n' +
    '   Placeholders in the translation: {0} = value (translated as well), {0|s} = "s" if the German value\n' +
    '   is not empty (plural), {0|x=A|B} = A if the value is "x", otherwise B.\n' +
    '   Check: node .github/scripts/check-lang.js ' + CODE + '\n' +
    '   Entries "nt|…": sentence templates of the 🔔 bell (js/hinweise.js → ntT), {0}, {1} … are filled in there. */\n';
  fs.writeFileSync(OUT_FILE, header + 'window.PINN_I18N && window.PINN_I18N.load(' + JSON.stringify(CODE) + ', ' +
    JSON.stringify({ exact, patterns }) + ');\n');
  const lines = [
    'pinn. translation report – ' + LANG.name + ' (' + CODE + '), model ' + MODEL + ', ' + new Date().toISOString(),
    'Texts: ' + items.length + ', translated: ' + (items.length - fallback.length) + ', English fallback: ' + fallback.length,
    ''
  ];
  fallback.forEach(it => lines.push((it.kind === 'e' ? 'exact   ' : 'pattern ') + JSON.stringify(it.de) + '\n        en: ' + JSON.stringify(it.en)));
  fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n');
  return fallback.length;
}

// ---------- main ----------
(async () => {
  const todo = items.map((_, i) => i).filter(i => typeof result[i] !== 'string');
  log(LANG.name + ' · model ' + MODEL + ' · ' + items.length + ' texts, ' + (items.length - todo.length) + ' reused, ' + todo.length + ' to translate');
  if (todo.length) {
    let left = await runPool(makeBatches(todo, BATCH_CHARS), 'batch');
    if (left.length) {
      // Second round: failed texts in small groups, then one by one
      log(left.length + ' texts need a second try');
      left = await runPool(makeBatches(left, 1200), 'retry');
    }
    if (left.length) left = await runPool(left.map(i => [i]), 'single');
    saveCache();
  }
  const fb = writeFile();
  log('written ' + path.relative(ROOT, OUT_FILE) + (fb ? ' – ' + fb + ' texts kept in English, see ' + path.basename(REPORT_FILE) : ' – complete'));
})().catch(err => fail(err.stack || String(err)));
