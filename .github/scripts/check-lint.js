#!/usr/bin/env node
/* pinn. – project rules for the app and the hooks (.github/scripts/check-lint.js, since 1.102.0)

   Usage:  node .github/scripts/check-lint.js

   pinn. has no bundler: the files in pb_public/js/ are classic scripts that share ONE global scope with the
   inline scripts of index.html, in the order of the <script src="js/…"> lines. A general linter does not know
   that, so this script checks the rules that matter here:
   1. Every pb_public/js/<name>.js registers itself once with  (window.PINN_PARTS = …).push('<name>')
      – the start check of index.html relies on it.
   2. Every file in pb_public/js/ and pb_public/css/ is loaded by src/rahmen.html (no forgotten files).
      The other direction (listed but missing) is checked by  node src/build.js --check.
   3. Global names: a top-level let/const/class may exist only once in the whole page (otherwise the browser
      stops that file with "Identifier has already been declared"); the same name must not be both a
      let/const/class and a function/var; a function declared twice silently replaces the first one – only
      the names in KNOWN_DUPLICATE_FUNCTIONS are allowed.
   4. pb_hooks/: hook files end in ".pb.js" (not "_pb.js"); every  require(`${__hooks}/x.js`)  points to a
      file that exists.
   5. No leftover merge conflict markers in text files.

   "Top level" means: the line starts outside of every block, string and comment (the small lexer scan() in
   common.js). Code inside functions and IIFEs is not global and is not counted. */

'use strict';
const path = require('path');
const { ROOT, rel, read, exists, filesIn, walk, lineOf, inlineScripts, scan, reporter } = require('./common');

// Functions that are declared twice on purpose / for historical reasons (the later one wins).
// Empty since 1.119.1 (i18nT now lives only in js/standardnamen.js).
const KNOWN_DUPLICATE_FUNCTIONS = [];

const r = reporter('Lint');
const INDEX = path.join(ROOT, 'pb_public', 'index.html');
const FRAME = path.join(ROOT, 'src', 'rahmen.html');

// ---------- 1 + 2: registration and use of the app files ----------
const frame = exists(FRAME) ? read(FRAME) : '';
if (!frame) r.fail('src/rahmen.html', 'missing');
const listedJs = new Set((frame.match(/<script src="js\/[^"?]+/g) || []).map(s => s.slice(16)));
const listedCss = new Set((frame.match(/href="css\/[^"?]+/g) || []).map(s => s.slice(10)));

const jsFiles = filesIn('pb_public/js', n => n.endsWith('.js'));
jsFiles.forEach(file => {
  const name = path.basename(file, '.js');
  const text = read(file);
  const re = new RegExp("PINN_PARTS\\s*\\|\\|\\s*\\[\\]\\)\\.push\\(\\s*['\"]" + name.replace(/[^a-z0-9]/gi, '\\$&') + "['\"]\\s*\\)", 'g');
  const n = (text.match(re) || []).length;
  if (n !== 1) r.fail(rel(file), n ? 'registers itself ' + n + ' times' : "does not register itself – add  (window.PINN_PARTS = window.PINN_PARTS || []).push('" + name + "');  at the end");
  if (!listedJs.has(path.basename(file))) r.fail(rel(file), 'not loaded – add its <script src> line to src/rahmen.html (and the name to pinn-setup.sh)');
});
filesIn('pb_public/css', n => n.endsWith('.css')).forEach(file => {
  if (!listedCss.has(path.basename(file))) r.fail(rel(file), 'not loaded – add its <link> line to src/rahmen.html (and the name to pinn-setup.sh)');
});
r.info(jsFiles.length + ' app files in pb_public/js/');

// ---------- 3: global names across the whole page ----------
// Top-level declarations of one script: [{ name, kind, line }] (+ .unclean if the lexer lost track)
const DECL_RE = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(let|const|var|class)\s+([A-Za-z_$][\w$]*)/;
function declarations(code, firstLine) {
  const s = scan(code);
  const out = [];
  if (!s.clean) out.unclean = true;
  code.split('\n').forEach((text, i) => {
    if (!s.topLines.has(i)) return;
    const m = text.trim().match(DECL_RE);
    if (!m) return;
    if (m[1]) out.push({ name: m[1], kind: 'function', line: firstLine + i });
    else out.push({ name: m[3], kind: m[2], line: firstLine + i });
  });
  return out;
}

// Scripts in load order: inline scripts of index.html where they stand, js/ files at their <script src> line
const units = [];
if (exists(INDEX)) {
  const html = read(INDEX);
  inlineScripts(html).forEach(s => units.push({ where: 'pb_public/index.html', pos: s.line, decls: declarations(s.code, s.line) }));
  const re = /<script src="js\/([^"?]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const file = path.join(ROOT, 'pb_public', 'js', m[1]);
    if (exists(file)) units.push({ where: 'pb_public/js/' + m[1], pos: lineOf(html, m.index), decls: declarations(read(file), 1) });
  }
  units.sort((a, b) => a.pos - b.pos);
} else {
  r.fail('pb_public/index.html', 'missing – run  node src/build.js');
}

const seen = new Map(); // name → first declaration
let total = 0;
const lexical = k => k === 'let' || k === 'const' || k === 'class';
units.forEach(u => u.decls.forEach(d => {
  total++;
  const at = u.where + ':' + d.line;
  const prev = seen.get(d.name);
  if (!prev) { seen.set(d.name, Object.assign({ at }, d)); return; }
  const where = '"' + d.name + '" (' + d.kind + ') at ' + at + ' – already declared as ' + prev.kind + ' at ' + prev.at;
  if (lexical(d.kind) || lexical(prev.kind)) r.fail(at, 'global name declared twice: ' + where + ' (the browser stops the later script)');
  else if (d.kind === 'function' && prev.kind === 'function' && !KNOWN_DUPLICATE_FUNCTIONS.includes(d.name)) r.fail(at, 'function declared twice: ' + where + ' (the later one silently replaces the first)');
  else if (d.kind !== prev.kind) r.fail(at, 'name used for a function and a var: ' + where);
}));
units.filter(u => u.decls.unclean).forEach(u => r.info('note: ' + u.where + ' (from line ' + u.pos + ') could not be followed to the end – its global names may be incomplete'));
r.info(seen.size + ' global names (' + total + ' top-level declarations in ' + units.length + ' scripts)');

// ---------- 4: hooks ----------
const hookFiles = filesIn('pb_hooks', n => n.endsWith('.js'));
hookFiles.forEach(file => {
  const name = path.basename(file);
  if (/_pb\.js$/.test(name)) r.fail(rel(file), 'hook files are named with a dot: ' + name.replace(/_pb\.js$/, '.pb.js'));
  const text = scan(read(file)).masked; // commented-out code does not count
  const re = /require\(\s*(?:`\$\{__hooks\}\/([^`]+)`|__hooks\s*\+\s*["']\/([^"']+)["'])\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const target = m[1] || m[2];
    if (!exists(path.join(ROOT, 'pb_hooks', target))) r.fail(rel(file) + ':' + lineOf(text, m.index), 'requires pb_hooks/' + target + ', which does not exist');
  }
});
r.info(hookFiles.length + ' files in pb_hooks/');

// ---------- 5: merge conflict markers ----------
const TEXT = /\.(js|html|css|md|sh|json|ya?ml|txt)$|^Caddyfile$/;
walk(ROOT, n => TEXT.test(n)).forEach(file => {
  const text = read(file);
  const m = text.match(/^(<<<<<<<|>>>>>>>) /m);
  if (m) r.fail(rel(file) + ':' + lineOf(text, m.index), 'merge conflict marker "' + m[1] + '"');
});

r.done();
