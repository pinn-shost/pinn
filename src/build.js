#!/usr/bin/env node
/* pinn. – build script for pb_public/index.html (src/build.js, since 1.101.0)

   The app page is no longer edited as one big file. Its HTML lives in small parts under src/:
     src/rahmen.html      the frame: <head> (meta tags, stylesheets, the few inline scripts), <body> with the
                          include markers, the main inline script and the list of <script src="js/…"> files
     src/teile/**.html    one file per screen, page (teile/seiten/) or group of popups (teile/popups/)
     src/version.txt      the app version (one line, e.g. 1.101.0)
   This script puts them together and writes pb_public/index.html. The finished file is committed to the
   repository as well, because pinn. installs and updates straight from the release ZIP – nothing is built on
   the NAS. Only Node.js is needed (no npm packages).

   Usage (from the repository folder):
     node src/build.js            build pb_public/index.html
     node src/build.js --check    only compare: exit code 1 if pb_public/index.html does not match src/
                                  (for GitHub Actions and before every release)

   Rules for the files in src/:
   - An include marker is a line that contains nothing but  <!-- @include <path> -->  (path relative to
     src/teile/). The whole line is replaced by the part, exactly as it is (indentation included). Parts may
     include other parts. Every file under src/teile/ must be used exactly once.
   - {{VERSION}} is replaced by the version from src/version.txt (APP_VERSION and the ?v= of every
     js/ and css/ file, so browsers load the new files after an update).
   - {{PINN_APP_PARTS}} and {{PINN_APP_STYLES}} (lists of the start check) are filled in from the
     <script src="js/…"> and <link rel="stylesheet" href="css/…"> lines in document order. A new file in js/ or
     css/ therefore only needs its line in src/rahmen.html – plus its name in pinn-setup.sh (checked here).
   The build stops with a message if something does not fit (missing part, unused part, unknown placeholder,
   file missing in pb_public/, file not listed in pinn-setup.sh). */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = __dirname;
const PARTS_DIR = path.join(SRC, 'teile');
const FRAME = path.join(SRC, 'rahmen.html');
const VERSION_FILE = path.join(SRC, 'version.txt');
const OUT = path.join(ROOT, 'pb_public', 'index.html');
const SETUP = path.join(ROOT, 'pinn-setup.sh');
const NOTICE = '<!-- Built by src/build.js from the files in src/ – please edit those, not this file. -->';
const INCLUDE_RE = /^\s*<!-- @include ([a-z0-9][a-z0-9/_-]*\.html) -->\s*$/;

function fail(msg) {
  console.error('build: ' + msg);
  process.exit(1);
}
// Read a text file; Windows line endings (CRLF) are turned into LF, so the result is the same on every system
function read(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { fail('cannot read ' + rel(file)); }
  return text.replace(/\r\n/g, '\n');
}
function rel(file) { return path.relative(ROOT, file).split(path.sep).join('/'); }

// All part files below src/teile/ (relative paths with "/")
function listParts(dir, prefix) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const relName = prefix ? prefix + '/' + name : name;
    if (fs.statSync(full).isDirectory()) out = out.concat(listParts(full, relName));
    else if (name.endsWith('.html')) out.push(relName);
  }
  return out;
}

// Replace every include line by the content of its part (recursively)
function expand(text, from, used, stack) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (line.includes('@include') && !INCLUDE_RE.test(line)) {
      fail(from + ':' + (i + 1) + ': malformed include marker (expected a line with only  <!-- @include <path>.html -->)');
    }
    const m = line.match(INCLUDE_RE);
    if (!m) { out.push(line); return; }
    const name = m[1];
    if (stack.includes(name)) fail('include loop: ' + stack.concat(name).join(' → '));
    if (used.has(name)) fail(name + ' is included twice (second time in ' + from + ':' + (i + 1) + ')');
    const file = path.join(PARTS_DIR, name);
    if (!fs.existsSync(file)) fail(from + ':' + (i + 1) + ': part src/teile/' + name + ' not found');
    used.add(name);
    let part = read(file);
    if (part.endsWith('\n')) part = part.slice(0, -1);
    out.push(expand(part, 'src/teile/' + name, used, stack.concat(name)));
  });
  return out.join('\n');
}

// Names of the app files in document order, e.g. js/ausblick.js?v=… → ausblick
function fileNames(html, re) {
  const names = [];
  let m;
  while ((m = re.exec(html))) names.push(m[1]);
  return names;
}

function build() {
  const version = read(VERSION_FILE).trim();
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) fail('src/version.txt: "' + version + '" is not a version like 1.101.0');

  const frame = read(FRAME);
  const used = new Set();
  let html = expand(frame, 'src/rahmen.html', used, []);
  const unused = listParts(PARTS_DIR, '').filter(n => !used.has(n));
  if (unused.length) fail('parts not included anywhere: ' + unused.map(n => 'src/teile/' + n).join(', '));

  html = html.split('{{VERSION}}').join(version);
  const scriptRe = /<script src="js\/([a-z0-9]+)\.js\?v=[^"]*"><\/script>/g;
  const styleRe = /<link rel="stylesheet" href="css\/([a-z0-9]+)\.css\?v=[^"]*">/g;
  const scripts = fileNames(html, scriptRe);
  const styles = fileNames(html, styleRe);
  const quote = list => list.map(n => "'" + n + "'").join(', ');
  for (const key of ['{{PINN_APP_PARTS}}', '{{PINN_APP_STYLES}}']) {
    if (html.split(key).length !== 2) fail(key + ' must appear exactly once');
  }
  html = html.replace('{{PINN_APP_PARTS}}', () => quote(scripts));
  html = html.replace('{{PINN_APP_STYLES}}', () => quote(styles));
  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) fail('unknown placeholder ' + left[0]);

  const appVersion = html.match(/const APP_VERSION = '([^']*)';/g) || [];
  if (appVersion.length !== 1) fail('const APP_VERSION must appear exactly once (found ' + appVersion.length + ')');

  // Every file must exist and be known to pinn-setup.sh (it sorts loose files by name)
  const dupes = l => l.filter((n, i) => l.indexOf(n) !== i);
  if (dupes(scripts).length) fail('js/ files loaded twice: ' + dupes(scripts).join(', '));
  if (dupes(styles).length) fail('css/ files loaded twice: ' + dupes(styles).join(', '));
  const setup = read(SETUP);
  const caseLine = folder => {
    const m = setup.match(new RegExp('\\n\\s*([a-z0-9|.]+)\\) echo "pb_public/' + folder + '/\\$1"'));
    return m ? m[1].split('|') : [];
  };
  const setupJs = caseLine('js'), setupCss = caseLine('css');
  const problems = [];
  for (const n of scripts) {
    if (!fs.existsSync(path.join(ROOT, 'pb_public', 'js', n + '.js'))) problems.push('pb_public/js/' + n + '.js is missing');
    if (!setupJs.includes(n + '.js')) problems.push(n + '.js is not listed in pinn-setup.sh (function ziel)');
  }
  for (const n of styles) {
    if (!fs.existsSync(path.join(ROOT, 'pb_public', 'css', n + '.css'))) problems.push('pb_public/css/' + n + '.css is missing');
    if (!setupCss.includes(n + '.css')) problems.push(n + '.css is not listed in pinn-setup.sh (function ziel)');
  }
  if (problems.length) fail(problems.join('\n       '));

  // Notice for anyone who opens the built file
  if (!html.startsWith('<!DOCTYPE html>\n')) fail('src/rahmen.html must start with <!DOCTYPE html>');
  html = html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + NOTICE + '\n');
  return { html, version, scripts: scripts.length, styles: styles.length, parts: used.size };
}

const result = build();
if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current === result.html) {
    console.log('ok: ' + rel(OUT) + ' matches src/ (version ' + result.version + ')');
    process.exit(0);
  }
  const a = current.split('\n'), b = result.html.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const x = a[i] === undefined ? null : a[i], y = b[i] === undefined ? null : b[i];
  let col = 0;
  while (x !== null && y !== null && col < x.length && x[col] === y[col]) col++;
  const cut = t => t === null ? '(end of file)' : (col > 60 ? '…' : '') + t.slice(Math.max(0, col - 60), col + 100);
  console.error('build: ' + rel(OUT) + ' does not match src/ – first difference in line ' + (i + 1) + ', column ' + (col + 1) + ':');
  console.error('  file:  ' + cut(x));
  console.error('  src/:  ' + cut(y));
  console.error('Run  node src/build.js  and commit the new pb_public/index.html.');
  process.exit(1);
}
fs.writeFileSync(OUT, result.html);
console.log('built ' + rel(OUT) + ' – version ' + result.version + ', ' + result.parts + ' parts, ' +
  result.scripts + ' js/ files, ' + result.styles + ' css/ files, ' + (result.html.match(/\n/g) || []).length + ' lines');
