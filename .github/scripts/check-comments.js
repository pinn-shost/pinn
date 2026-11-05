#!/usr/bin/env node
/* pinn. – every code comment is written in English (.github/scripts/check-comments.js, since 1.129.1)

   Usage:  node .github/scripts/check-comments.js [--list]

   Since 1.129.0 all comments of the project are English. This check keeps it that way: it reads the comments of
   - JavaScript: pb_public/js, pb_public/i18n, pb_public/*.js, pb_hooks, src, .github/scripts (lexer scan() from common.js),
   - HTML: src/rahmen.html and src/teile/**  (<!-- … -->, inline <script> and <style>; pb_public/index.html is built from them),
   - CSS: pb_public/css/*.css and pb_public/vendor/pinn.css,
   - shell scripts, docker-compose.yaml, env.txt, caddy/Caddyfile, .gitignore and the YAML files in .github/ (# comments),
   and reports a comment that still looks German: a word with ä, ö, ü or ß, or a common German word (und, nicht, oder, egal,
   weiter, Hilfen, Kleinkram …).
   Not counted (so stored texts, field names and examples may stay German):
   - quoted text: „…“ "…" '…' «…» `…`
   - text in { … } and [ … ] (field lists such as { werte, stand })
   - text in { … } and [ … ] that is still open at the end of the comment (multi-line field lists)
   - tokens with _ . / ( ) = : < > $ @ # ? & - (names, paths, routes, URL parameters) and words in capitals (MIT, TÜV)
   A real German example therefore belongs in quotes:  // "Knoblauchzehe" ↔ "Knoblauch"
   --list prints every reported comment in full. Exit code 1 if a German comment was found. */

'use strict';
const path = require('path');
const { ROOT, rel, read, filesIn, walk, lineOf, scan, reporter } = require('./common');

const r = reporter('Comments in English');
const LIST = process.argv.includes('--list');

// Common German words that do not exist (or hardly ever appear) in English comments.
// Not included on purpose: English words (also, an, in, so, will, war, man, hat, die, falls, standard) and German words
// that are field names in pinn. (familie, fehler, liste, erledigt, benutzer, datei, wert, schritt, alle, bis, neu …).
const GERMAN = new Set((
  'und oder nicht nichts kein keine keinen keiner wird werden wurde wurden ist sind sein war waren wenn dann sonst ' +
  'egal weiter leer noch nur auch schon immer jetzt hier dort mit ohne auf aus bei beim nach vom zum zur ' +
  'der das den dem des ein eine einen einem einer eines alles jede jeder jedes ' +
  'gibt soll sollen muss müssen kann können darf dürfen damit weil denn aber sowie bzw usw ggf evtl ' +
  'hilfen kleinkram merker merkliste versand texte rechte uhrzeit knoten sammlungen schritte ' +
  'darstellung felder speichern abgebrochen vorhanden gelöscht ignorieren aufbereitung kursverlauf ' +
  'profilname wanduhr kalenderliste terminerinnerungen zugestellte dieselben anderem liefern diese dieser dieses ' +
  'zeile zeilen eintrag einträge knopf'
).split(' '));

const QUOTES = /„[^“”"\n]*[“”"]|"[^"\n]*"|'[^'\n]*'|«[^»\n]*»|`[^`\n]*`/g;
// Only the prose of a comment: no quotes, no { … } / [ … ], no code-like tokens
function prose(text) {
  let t = text.replace(/^\/\*+!?|\*+\/$|^\/\/+|^#+|^<!--|-->$/g, ' ').replace(QUOTES, ' ');
  for (let k = 0; k < 4; k++) t = t.replace(/\{[^{}]*\}|\[[^\[\]]*\]/g, ' ');
  t = t.replace(/[{\[][^]*$/, ' ').replace(/^[^]*[}\]]/, ' ');
  return t.replace(/\S*[_./()=:<>$@#?&\\-]\S*/g, ' ');
}
function germanWord(text) {
  const words = prose(text).match(/[A-Za-zÄÖÜäöüß]+/g) || [];
  return words.find(w => !/^[A-ZÄÖÜ]{2,}$/.test(w) && (/[äöüÄÖÜß]/.test(w) || GERMAN.has(w.toLowerCase()))) || null;
}

let files = 0, comments = 0;
const SELF = rel(__filename);
function check(file, list) {
  files++;
  if (rel(file) === SELF) return; // this file names the German words it looks for
  list.forEach(c => {
    comments++;
    const w = germanWord(c.text);
    if (!w) return;
    // report the line of the comment that holds the word
    const lines = c.text.split('\n');
    const k = Math.max(0, lines.findIndex(l => new RegExp('(^|[^A-Za-zÄÖÜäöüß])' + w + '($|[^A-Za-zÄÖÜäöüß])').test(l)));
    const short = (LIST ? c.text : lines[k]).replace(/\s+/g, ' ').trim();
    r.fail(rel(file) + ':' + (c.line + k), '"' + w + '" – ' + (LIST || short.length <= 110 ? short : short.slice(0, 107) + '…'));
  });
}
function jsComments(code, firstLine) {
  return scan(code).comments.map(c => ({ text: code.slice(c.start, c.end), line: lineOf(code, c.start) + (firstLine || 1) - 1 }));
}
function regexComments(text, re, offsetLine) {
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push({ text: m[0], line: lineOf(text, m.index) + (offsetLine || 1) - 1 });
  return out;
}
function hashComments(text) {
  const out = [];
  text.split('\n').forEach((l, i) => {
    if (/^\s*#!/.test(l) && i === 0) return;                         // shebang
    const m = l.match(/(^|\s)#(?![!{#])(.*)$/);                         // "# …" at the start or after a space
    if (m) out.push({ text: '#' + m[2], line: i + 1 });
  });
  return out;
}

// 1) JavaScript
const isJs = n => n.endsWith('.js');
[].concat(
  filesIn('pb_public/js', isJs), filesIn('pb_public/i18n', isJs), filesIn('pb_public', isJs),
  filesIn('pb_hooks', isJs), filesIn('src', isJs), filesIn('.github/scripts', isJs)
).forEach(file => check(file, jsComments(read(file))));

// 2) HTML sources (comments, inline scripts and styles)
[path.join(ROOT, 'src', 'rahmen.html'), path.join(ROOT, 'index.html')]
  .concat(walk(path.join(ROOT, 'src', 'teile'), n => n.endsWith('.html')))
  .forEach(file => {
    const html = read(file);
    let list = regexComments(html, /<!--[\s\S]*?-->/g);
    let m;
    const scriptRe = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = scriptRe.exec(html))) list = list.concat(jsComments(m[1], lineOf(html, m.index + m[0].indexOf(m[1]))));
    const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    while ((m = styleRe.exec(html))) list = list.concat(regexComments(m[1], /\/\*[\s\S]*?\*\//g, lineOf(html, m.index + m[0].indexOf(m[1]))));
    check(file, list);
  });

// 3) CSS
filesIn('pb_public/css', n => n.endsWith('.css')).concat(filesIn('pb_public/vendor', n => n.endsWith('.css')))
  .forEach(file => check(file, regexComments(read(file), /\/\*[\s\S]*?\*\//g)));

// 4) Shell scripts, Compose, env, Caddyfile, .gitignore, YAML in .github
filesIn('.', n => /\.sh$|^docker-compose\.yaml$|^env\.txt$|^\.gitignore$/.test(n))
  .concat(filesIn('caddy', n => n === 'Caddyfile'))
  .concat(walk(path.join(ROOT, '.github'), n => /\.ya?ml$/.test(n)))
  .forEach(file => check(file, hashComments(read(file))));

r.info(files + ' files, ' + comments + ' comments');
r.done('no German comments');
