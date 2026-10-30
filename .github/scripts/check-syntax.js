#!/usr/bin/env node
/* pinn. – syntax check of every script in the repository (.github/scripts/check-syntax.js, since 1.102.0)

   Usage:  node .github/scripts/check-syntax.js

   Checks without running anything:
   - JavaScript: pb_public/js/*.js, pb_public/lang/*.js, pb_public/i18n/*.js, pb_public/*.js, pb_hooks/*.js, src/*.js and the scripts
     in .github/scripts/ – parsed as classic scripts (like the browser and PocketBase load them, no modules).
   - The inline <script> blocks of every HTML file in pb_public/ (index.html is the built page).
   - JSON files (manifest.json …) must parse.
   - Shell scripts (*.sh): "sh -n" (POSIX sh, as on the NAS). Skipped with a note if there is no "sh"
     (e.g. on Windows without Git Bash) – GitHub Actions always has it. */

'use strict';
const vm = require('vm');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, rel, read, filesIn, walk, inlineScripts, reporter } = require('./common');

const r = reporter('Syntax');
const isJs = n => n.endsWith('.js');

// Parse a script without running it; returns null or "line: message"
function parse(code, filename, firstLine) {
  try {
    new vm.Script(code, { filename, lineOffset: (firstLine || 1) - 1 });
    return null;
  } catch (e) {
    const m = String(e.stack || '').match(new RegExp(filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)'));
    return (m ? 'line ' + m[1] + ': ' : '') + e.message;
  }
}

// 1) JavaScript files
const jsFiles = [].concat(
  filesIn('pb_public/js', isJs),
  filesIn('pb_public/lang', isJs),
  filesIn('pb_public/i18n', isJs),
  filesIn('pb_public', isJs),
  filesIn('pb_hooks', isJs),
  filesIn('src', isJs),
  filesIn('.github/scripts', isJs)
);
jsFiles.forEach(file => {
  const err = parse(read(file), rel(file));
  if (err) r.fail(rel(file), err);
});
r.info(jsFiles.length + ' JavaScript files');

// 2) Inline scripts of the HTML pages
let inline = 0;
walk(path.join(ROOT, 'pb_public'), n => n.endsWith('.html')).forEach(file => {
  inlineScripts(read(file)).forEach(s => {
    inline++;
    if (s.module) return; // no modules in pinn. – nothing to compare against
    const err = parse(s.code, rel(file), s.line);
    if (err) r.fail(rel(file), 'inline script (from line ' + s.line + '): ' + err);
  });
});
r.info(inline + ' inline scripts in pb_public/*.html');

// 3) JSON
const jsonFiles = walk(ROOT, n => n.endsWith('.json'));
jsonFiles.forEach(file => {
  try { JSON.parse(read(file)); } catch (e) { r.fail(rel(file), e.message); }
});
r.info(jsonFiles.length + ' JSON files');

// 4) Shell scripts
const shFiles = walk(ROOT, n => n.endsWith('.sh'));
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;
if (!hasSh) {
  r.info('no "sh" on this computer – ' + shFiles.length + ' shell scripts NOT checked (GitHub Actions does it)');
} else {
  shFiles.forEach(file => {
    const res = spawnSync('sh', ['-n', file], { encoding: 'utf8' });
    if (res.status !== 0) r.fail(rel(file), 'sh -n: ' + String(res.stderr || res.stdout).trim());
  });
  r.info(shFiles.length + ' shell scripts (sh -n)');
}

r.done();
