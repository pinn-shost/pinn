#!/usr/bin/env node
/* pinn. – checks and tests for the server hooks in pb_hooks/ (.github/scripts/check-hooks.js, since 1.102.0)

   Usage:  node .github/scripts/check-hooks.js [--list] [--routes-json <file>]

   PocketBase loads every pb_hooks/*.pb.js at start. Mistakes there only show up on the NAS, so this script runs
   the hooks in a sandbox that stands in for PocketBase (routerAdd, cronAdd, onBootstrap, $app, $apis …) –
   without a database and without network:
   1. Every *.pb.js runs without an error and registers its routes, cron jobs and event hooks with functions.
      A route (method + path) or cron job name registered twice fails; paths must start with "/", methods must be
      known, cron expressions must have 5 valid fields. --list prints all routes, --routes-json writes them to a
      file (for smoke-pocketbase.js).
   2. *.pb.js files declare nothing at the top level: PocketBase runs every handler in its own isolated context,
      so a handler can never see a function or variable declared outside of it – shared code belongs in a
      module (pinn-*.js) that the handler loads with require().
   3. Every shared module (pb_hooks/*.js that is not a *.pb.js) loads, and every property used directly on a
      require() of it – require(`${__hooks}/x.js`).name, a variable holding it (x.name) or { name } = require(…) –
      is exported by that module.
   4. Unit tests: version compare of the update check and reading APP_VERSION from the built
      pb_public/index.html (pinn-system.js) – the update button depends on both. */

'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { ROOT, rel, read, exists, filesIn, lineOf, scan, reporter } = require('./common');

const r = reporter('Hooks');
const HOOKS = path.join(ROOT, 'pb_hooks');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// ---------- sandbox ----------
// A value that accepts everything: any property, any call, "new" – stands in for $app, $apis, Record …
function anything() {
  const fn = function () {};
  return new Proxy(fn, {
    get(t, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === Symbol.iterator) return function* () {};
      if (key === 'then') return undefined; // not a Promise
      return anything();
    },
    apply() { return anything(); },
    construct() { return anything(); },
  });
}
// A value that throws on any use (for "loading must not touch the server")
function forbidden(name) {
  return new Proxy(function () {}, {
    get(t, key) { if (key === Symbol.toPrimitive) return () => name; throw new Error(name + '.' + String(key) + ' used while loading'); },
    apply() { throw new Error(name + '() used while loading'); },
  });
}
// Line in a hook file from the current stack (for messages)
function callerLine(file) {
  const m = String(new Error().stack).split('\n').find(l => l.includes(file));
  const n = m && m.match(/:(\d+):\d+\)?$/);
  return n ? file + ':' + n[1] : file;
}

const PB_NAMES = ['$app', '$apis', '$os', '$http', '$security', '$dbx', '$filesystem', '$mails', '$template', '$tokens',
  'DynamicModel', 'Record', 'Collection', 'ApiError', 'BadRequestError', 'NotFoundError', 'ForbiddenError',
  'UnauthorizedError', 'TooManyRequestsError', 'InternalServerError', 'MailerMessage', 'Cookie', 'SubscriptionMessage',
  'sleep', 'readerToString', 'arrayOf', 'migrate'];

const moduleCache = new Map();
// Run a pb_hooks module like PocketBase's require() does (shared code, not a *.pb.js)
function loadModule(name, globals) {
  const key = name + (globals ? '#custom' : '');
  if (!globals && moduleCache.has(key)) return moduleCache.get(key);
  const file = path.join(HOOKS, name);
  if (!exists(file)) throw new Error('require(' + name + '): no such file in pb_hooks/');
  const sandbox = baseSandbox();
  Object.assign(sandbox, globals || {});
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  if (!globals) moduleCache.set(key, sandbox.module.exports);
  vm.runInNewContext(read(file), sandbox, { filename: rel(file) });
  if (!globals) moduleCache.set(key, sandbox.module.exports);
  return sandbox.module.exports;
}
function baseSandbox() {
  const s = { __hooks: HOOKS, console, toString: v => String(v) };
  PB_NAMES.forEach(n => { s[n] = anything(); });
  s.require = id => loadModule(String(id).replace(HOOKS + '/', '').replace(/^\.\//, ''));
  return s;
}

// ---------- 1 + 2: run every *.pb.js ----------
const routes = new Map();   // "GET /api/x" → where
const routeInfo = [];       // for --routes-json (used by smoke-pocketbase.js)
const crons = new Map();    // id → where
const events = {};          // onBootstrap … → count
const CRON_RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
function validCron(expr) {
  if (/^@(yearly|annually|monthly|weekly|daily|midnight|hourly)$/.test(expr)) return true;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return fields.every((f, i) => f.split(',').every(part => {
    const m = part.match(/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/);
    if (!m) return false;
    const [lo, hi] = CRON_RANGES[i];
    const nums = [m[2], m[3]].filter(x => x !== undefined).map(Number);
    if (m[4] !== undefined && Number(m[4]) < 1) return false;
    return nums.every(x => x >= lo && x <= hi) && (nums.length < 2 || nums[0] <= nums[1]);
  }));
}

const pbFiles = filesIn('pb_hooks', n => n.endsWith('.pb.js'));
pbFiles.forEach(file => {
  const name = rel(file);
  const code = read(file);
  const s = scan(code);

  // 2) nothing declared at the top level
  code.split('\n').forEach((text, i) => {
    if (s.topLines.has(i) && /^\s*(?:async\s+)?(?:function\b|let\b|const\b|var\b|class\b)/.test(text)) {
      r.fail(name + ':' + (i + 1), 'top-level declaration in a hook file – PocketBase handlers cannot see it; move it into a pinn-*.js module and require() it inside the handler');
    }
  });

  // 1) run it
  const sandbox = baseSandbox();
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  sandbox.routerAdd = (method, route, handler, ...middlewares) => {
    const at = callerLine(name);
    const m = String(method).toUpperCase();
    if (!METHODS.includes(m)) r.fail(at, 'unknown HTTP method "' + method + '"');
    if (typeof route !== 'string' || !route.startsWith('/')) r.fail(at, 'route "' + route + '" must start with "/"');
    if (typeof handler !== 'function') r.fail(at, 'route ' + m + ' ' + route + ' has no handler function');
    const key = m + ' ' + route;
    if (routes.has(key)) r.fail(at, 'route ' + key + ' is already registered at ' + routes.get(key));
    else { routes.set(key, at); routeInfo.push({ method: m, path: route, middleware: middlewares.length > 0, at }); }
  };
  sandbox.routerUse = sandbox.routerPre = (handler) => {
    if (typeof handler !== 'function' && typeof handler !== 'object') r.fail(callerLine(name), 'routerUse without a handler');
    events.routerUse = (events.routerUse || 0) + 1;
  };
  sandbox.cronAdd = (id, expr, handler) => {
    const at = callerLine(name);
    if (!validCron(String(expr))) r.fail(at, 'cron job "' + id + '": invalid schedule "' + expr + '"');
    if (typeof handler !== 'function') r.fail(at, 'cron job "' + id + '" has no handler function');
    if (crons.has(id)) r.fail(at, 'cron job "' + id + '" is already registered at ' + crons.get(id));
    else crons.set(id, at);
  };
  sandbox.cronRemove = () => {};
  // Event hooks (onBootstrap, onRecordCreateRequest …): every on… name the file uses
  new Set(s.masked.match(/\bon[A-Z][A-Za-z]*(?=\s*\()/g) || []).forEach(hook => {
    sandbox[hook] = (handler) => {
      if (typeof handler !== 'function') r.fail(callerLine(name), hook + ' without a handler function');
      events[hook] = (events[hook] || 0) + 1;
    };
  });
  try {
    vm.runInNewContext(code, sandbox, { filename: name });
  } catch (e) {
    r.fail(name, 'fails while PocketBase loads it: ' + e.message);
  }
});
const eventCount = Object.values(events).reduce((a, b) => a + b, 0);
r.info(pbFiles.length + ' hook files: ' + routes.size + ' routes, ' + crons.size + ' cron jobs, ' + eventCount + ' event hooks');
if (process.argv.includes('--list')) {
  [...routes.keys()].sort((a, b) => a.split(' ')[1].localeCompare(b.split(' ')[1]) || a.localeCompare(b))
    .forEach(k => r.info('  ' + k.padEnd(52) + ' ' + routes.get(k)));
}

const jsonAt = process.argv.indexOf('--routes-json');
if (jsonAt > 0 && process.argv[jsonAt + 1]) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(routeInfo, null, 1));

// ---------- 3: shared modules load and export what is used ----------
const modFiles = filesIn('pb_hooks', n => n.endsWith('.js') && !n.endsWith('.pb.js'));
const exportsOf = new Map();
modFiles.forEach(file => {
  const name = path.basename(file);
  try { exportsOf.set(name, loadModule(name)); }
  catch (e) { r.fail(rel(file), 'fails while loading: ' + e.message); }
});
const REQ = String.raw`require\(\s*(?:\x60\$\{__hooks\}\/([\w.-]+)\x60|__hooks\s*\+\s*["']\/([\w.-]+)["'])\s*\)`;
let usages = 0;
// End of the block that contains position i (bare code: strings and comments already blanked)
function blockEnd(bare, i) {
  let depth = 0;
  for (let j = i; j < bare.length; j++) {
    if (bare[j] === '{') depth++;
    else if (bare[j] === '}' && --depth < 0) return j;
  }
  return bare.length;
}
filesIn('pb_hooks', n => n.endsWith('.js')).forEach(file => {
  const sc = scan(read(file));
  const code = sc.masked, bare = sc.bare;
  const check = (mods, prop, index) => {
    usages++;
    const known = mods.filter(m => exportsOf.has(m));
    if (!known.length) return; // module missing or not loadable – reported elsewhere
    if (!known.some(m => Object.prototype.hasOwnProperty.call(Object(exportsOf.get(m)), prop))) {
      r.fail(rel(file) + ':' + lineOf(code, index), '"' + prop + '" is not exported by ' + known.join(' / '));
    }
  };
  let m;
  // require(…).name
  const direct = new RegExp(REQ + String.raw`\s*\.\s*([A-Za-z_$][\w$]*)`, 'g');
  while ((m = direct.exec(code))) check([m[1] || m[2]], m[3], m.index);
  // const { a, b: c } = require(…)
  const destr = new RegExp(String.raw`(?:const|let|var)\s+\{([^}]*)\}\s*=\s*` + REQ, 'g');
  while ((m = destr.exec(code))) {
    const mod = m[2] || m[3];
    m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean).forEach(prop => check([mod], prop, m.index));
  }
  // x = require(…) (with or without const/let/var)  →  x.name, from there to the end of the block of x
  const bind = new RegExp(String.raw`(?<![\w$.])(?:(const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*` + REQ + String.raw`(?!\s*\.)`, 'g');
  while ((m = bind.exec(code))) {
    const alias = m[2], mod = m[3] || m[4];
    let scopeFrom = m.index;
    if (!m[1]) { // plain assignment: the variable was declared earlier (let x = null; … x = require(…))
      const decl = bare.slice(0, m.index).search(new RegExp(String.raw`(?:let|var)\s+` + alias.replace(/\$/g, '\\$') + String.raw`\b(?![\s\S]*(?:let|var)\s+` + alias.replace(/\$/g, '\\$') + String.raw`\b)`));
      if (decl >= 0) scopeFrom = decl;
    }
    const end = blockEnd(bare, scopeFrom);
    const use = new RegExp(String.raw`(?<![\w$.])` + alias.replace(/\$/g, '\\$') + String.raw`\s*\.\s*([A-Za-z_$][\w$]*)`, 'g');
    use.lastIndex = m.index + m[0].length;
    let u;
    while ((u = use.exec(bare)) && u.index < end) check([mod], u[1], u.index);
  }
});
r.info(modFiles.length + ' shared modules, ' + usages + ' uses of their exports checked');

// ---------- 4: unit tests ----------
let tests = 0;
function test(label, fn) {
  tests++;
  try { const msg = fn(); if (msg) r.fail('test "' + label + '"', msg); }
  catch (e) { r.fail('test "' + label + '"', e.message); }
}
const eq = (got, want) => (JSON.stringify(got) === JSON.stringify(want) ? '' : 'expected ' + JSON.stringify(want) + ', got ' + JSON.stringify(got));

if (!exists(path.join(HOOKS, 'pinn-system.js'))) {
  r.fail('pb_hooks/pinn-system.js', 'missing');
} else {
  let sys = null;
  test('pinn-system.js loads without touching the server', () => {
    sys = loadModule('pinn-system.js', { $app: forbidden('$app'), $os: forbidden('$os'), $http: forbidden('$http'), $security: forbidden('$security') });
  });
  if (sys) {
    // Version compare: 1 = first is newer, -1 = older, 0 = same
    const cases = [
      ['1.100.0', '1.99.0', 1], ['1.99.0', '1.100.0', -1], ['v1.100.0', '1.99.0', 1], ['1.102.0', 'v1.102.0', 0],
      ['1.102.0', '1.101.0', 1], ['1.101.1', '1.101.0', 1], ['2.0.0', '1.999.9', 1], ['1.24', '1.23.9', 1],
      ['1.100.0-beta.1', '1.99.0', 1], ['1.100.0-beta.1', '1.100.0', -1], ['1.100.0', '1.100.0-rc.1', 1],
      ['1.67.0-beta.2', '1.67.0-beta.10', -1], ['1.67.0-rc.1', '1.67.0-beta.9', 1], ['1.67.0-beta.1', '1.67.0-beta.1', 0],
    ];
    test('vergleiche() – version compare of the update check', () => cases
      .map(([a, b, want]) => { const got = sys.vergleiche(a, b); return got === want ? '' : a + ' vs ' + b + ': expected ' + want + ', got ' + got; })
      .filter(Boolean).join('; '));

    // installierteVersion() reads APP_VERSION from the built pb_public/index.html
    const indexFile = path.join(ROOT, 'pb_public', 'index.html');
    const versionFile = path.join(ROOT, 'src', 'version.txt');
    if (exists(indexFile) && exists(versionFile)) {
      test('installierteVersion() finds the version of src/version.txt in pb_public/index.html', () => {
        const html = fs.readFileSync(indexFile, 'utf8');
        const store = new Map();
        const s2 = loadModule('pinn-system.js', {
          $os: { stat: () => { throw new Error('no stat in the test'); }, readFile: p => { if (p !== '/pb_public/index.html') throw new Error('unexpected file ' + p); return html; } },
          $app: { store: () => ({ get: k => store.get(k), set: (k, v) => store.set(k, v) }) },
          require: () => { throw new Error('use the fallback'); },
        });
        return eq(s2.installierteVersion(), read(versionFile).trim());
      });
    }
  }
}
r.info(tests + ' unit tests');

r.done();