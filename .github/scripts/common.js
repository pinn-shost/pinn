/* pinn. – shared helpers for the repository checks (.github/scripts/common.js, since 1.102.0)

   Used by check-syntax.js, check-lint.js and check-hooks.js (scan() is the lexer shared by lint and hooks). Only Node.js is needed (no npm packages),
   so every contributor can run the same checks as GitHub Actions:  node .github/scripts/check-all.js */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// Path relative to the repository folder, always with "/"
function rel(file) { return path.relative(ROOT, file).split(path.sep).join('/'); }

// Read a text file (CRLF → LF, so line numbers are the same on every system)
function read(file) { return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); }

function exists(file) { try { fs.statSync(file); return true; } catch (e) { return false; } }

// Files directly inside a folder whose name matches the test (sorted, absolute paths)
function filesIn(dir, test) {
  const full = path.join(ROOT, dir);
  if (!exists(full)) return [];
  return fs.readdirSync(full).sort()
    .filter(name => test(name) && fs.statSync(path.join(full, name)).isFile())
    .map(name => path.join(full, name));
}

// All files below a folder (recursive), skipping .git and node_modules
function walk(dir, test, out) {
  out = out || [];
  if (!exists(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.git' || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, test, out);
    else if (test(name, full)) out.push(full);
  }
  return out;
}

// Line number (1-based) of a character position
function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

// The inline <script> blocks of an HTML file (no src, JavaScript only) with their first line number
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue;
    const start = m.index + m[0].indexOf('>') + 1;
    out.push({ code: m[2], line: lineOf(html, start), module: /^module$/i.test(type || '') });
  }
  return out;
}

// A small JavaScript lexer: follows strings, template strings (with ${…}), comments, regular expressions and
// braces. Returns
//   masked    the code with every comment replaced by spaces (line breaks and positions stay the same)
//   bare      like masked, but the contents of strings, template strings and regular expressions are blanked too
//   topLines  line numbers (0-based) that start outside of every block, string and comment
//   clean     false if the lexer did not end at the top level (then the results may be incomplete)
const REGEX_BEFORE = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
function scan(code) {
  const stack = [];          // open template strings: brace depth at which their ${ … } returns to the string
  const masked = code.split('');
  const bare = code.split('');
  const blank = i => { if (code[i] !== '\n') bare[i] = ' '; };
  let depth = 0, mode = 'code', lastSig = '', lastWord = '', inClass = false, line = 0;
  const topLines = new Set([0]);
  for (let i = 0; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (c === '\n') {
      line++;
      if (mode === 'line') mode = 'code';
      if (mode === 'code' && depth === 0 && !stack.length) topLines.add(line);
      continue;
    }
    if (mode === 'line') { masked[i] = bare[i] = ' '; continue; }
    if (mode === 'block') { masked[i] = bare[i] = ' '; if (c === '*' && n === '/') { masked[i + 1] = bare[i + 1] = ' '; mode = 'code'; i++; } continue; }
    if (mode === "'" || mode === '"') { blank(i); if (c === '\\') { blank(i + 1); i++; } else if (c === mode) { mode = 'code'; lastSig = 'x'; } continue; }
    if (mode === 'regex') {
      blank(i);
      if (c === '\\') { blank(i + 1); i++; }
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { mode = 'code'; lastSig = 'x'; }
      continue;
    }
    if (mode === 'tpl') {
      blank(i);
      if (c === '\\') { blank(i + 1); i++; }
      else if (c === '`') { mode = 'code'; lastSig = 'x'; }
      else if (c === '$' && n === '{') { blank(i + 1); stack.push(depth); depth++; mode = 'code'; i++; lastSig = '{'; }
      continue;
    }
    // code
    if (c === '/' && n === '/') { masked[i] = masked[i + 1] = bare[i] = bare[i + 1] = ' '; mode = 'line'; i++; continue; }
    if (c === '/' && n === '*') { masked[i] = masked[i + 1] = bare[i] = bare[i + 1] = ' '; mode = 'block'; i++; continue; }
    if (c === "'" || c === '"') { blank(i); mode = c; continue; }
    if (c === '`') { blank(i); mode = 'tpl'; continue; }
    if (c === '/') {
      if (!lastSig || REGEX_BEFORE.has(lastSig) || (lastSig === 'w' && REGEX_WORDS.has(lastWord))) { blank(i); mode = 'regex'; inClass = false; continue; }
      lastSig = '/'; continue;
    }
    if (c === '{') { depth++; lastSig = '{'; continue; }
    if (c === '}') {
      depth--;
      if (stack.length && depth === stack[stack.length - 1]) { stack.pop(); blank(i); mode = 'tpl'; continue; }
      lastSig = '}'; continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i; while (j < code.length && /[A-Za-z0-9_$]/.test(code[j])) j++;
      lastWord = code.slice(i, j); lastSig = 'w'; i = j - 1; continue;
    }
    if (!/\s/.test(c)) lastSig = c;
  }
  const clean = depth === 0 && !stack.length && (mode === 'code' || mode === 'line');
  return { masked: masked.join(''), bare: bare.join(''), topLines, clean };
}

// Collects problems and prints a summary; exit code 1 if there was at least one
function reporter(title) {
  const problems = [];
  return {
    fail(where, msg) { problems.push(where + ': ' + msg); },
    info(msg) { console.log('  ' + msg); },
    done(okMsg) {
      if (problems.length) {
        console.error('✗ ' + title + ' – ' + problems.length + ' problem(s):');
        problems.forEach(p => console.error('  ' + p));
        process.exitCode = 1;
        return false;
      }
      console.log('✓ ' + title + (okMsg ? ' – ' + okMsg : ''));
      return true;
    },
  };
}

module.exports = { ROOT, rel, read, exists, filesIn, walk, lineOf, inlineScripts, scan, reporter };
