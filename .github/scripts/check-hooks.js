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
      pb_public/index.html (pinn-system.js) – the update button depends on both.
      Push texts (pinn-pushtext.js, since 1.117.0): the German messages of the modules are recognised and come out
      in the recipient's language from pb_public/i18n (text keys "push.…"), plural forms and flat share variants
      included; a key named by a pattern exists in every language file.
   5. Database schema (pinn-schema.js, since 1.110.0): every module that creates collections or fields is part of
      the start-up checks, the migration list is ascending, unique and named, and the runner is tested against a
      simulated database (fresh install, second start, failing step, newer database, failing check). */

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

// Escapes every character with a special meaning in a regular expression (backslash included)
function reEscape(text) { return String(text).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'); }

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
      const decl = bare.slice(0, m.index).search(new RegExp(String.raw`(?:let|var)\s+` + reEscape(alias) + String.raw`\b(?![\s\S]*(?:let|var)\s+` + reEscape(alias) + String.raw`\b)`));
      if (decl >= 0) scopeFrom = decl;
    }
    const end = blockEnd(bare, scopeFrom);
    const use = new RegExp(String.raw`(?<![\w$.])` + reEscape(alias) + String.raw`\s*\.\s*([A-Za-z_$][\w$]*)`, 'g');
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
// ---------- 5: database schema (pinn-schema.js) ----------
if (!exists(path.join(HOOKS, 'pinn-schema.js'))) {
  r.fail('pb_hooks/pinn-schema.js', 'missing');
} else {
  const schemaCode = read(path.join(HOOKS, 'pinn-schema.js'));
  const listed = new Set((schemaCode.match(/\$\{__hooks\}\/(pinn-[\w-]+\.js)/g) || []).map(x => x.split('/').pop()));
  modFiles.forEach(file => {
    const name = path.basename(file);
    if (name === 'pinn-schema.js') return;
    const bare = scan(read(file)).bare;
    if (/\bnew\s+Collection\s*\(|\.fields\.add\s*\(/.test(bare) && !listed.has(name)) {
      r.fail(rel(file), 'creates collections or fields but is not part of the start-up checks in pb_hooks/pinn-schema.js');
    }
  });

  // A simulated database: collections by name, records of "pinn_schema", a store, the error log
  function fakeDb(names, applied) {
    const cols = new Set(names);
    const rows = (applied || []).map(v => ({ version: v }));
    const store = new Map();
    const log = [];
    const calls = [];
    const stub = label => new Proxy({}, { get: (t, fn) => () => { calls.push(label + '.' + String(fn)); return true; } });
    const modules = {};
    const globals = {
      $app: {
        store: () => ({ get: k => store.get(k), set: (k, v) => store.set(k, v) }),
        findCollectionByNameOrId: n => { if (!cols.has(n)) throw new Error('missing'); return { name: n }; },
        findRecordsByFilter: (n) => { if (n !== 'pinn_schema' || !cols.has(n)) throw new Error('missing'); return rows.map(x => ({ get: k => x[k] })); },
        save: x => { if (x && x.__col) rows.push(Object.assign({}, x.data)); else if (x && x.name) cols.add(x.name); },
      },
      Collection: function (def) { Object.assign(this, def); },
      Record: function () { this.__col = true; this.data = {}; this.set = (k, v) => { this.data[k] = v; }; },
      console: { log: () => {} },
      require: id => {
        const n = String(id).split('/').pop();
        if (n === 'pinn-protokoll.js') {
          return new Proxy({}, { get: (t, fn) => (...a) => { if (fn === 'fehler' || fn === 'warnung') log.push(fn + ': ' + a[1]); calls.push('pinn-protokoll.js.' + String(fn)); return true; } });
        }
        if (n === 'pinn-system.js') return { installierteVersion: () => '9.9.9', ensureSchema: () => { calls.push('pinn-system.js.ensureSchema'); } };
        return modules[n] || (modules[n] = stub(n));
      },
    };
    return { globals, cols, rows, store, log, calls, modules };
  }
  let lib = null;
  test('pinn-schema.js loads without touching the server', () => {
    lib = loadModule('pinn-schema.js', { $app: forbidden('$app'), $os: forbidden('$os'), require: () => { throw new Error('require while loading'); } });
  });
  if (lib) {
    test('MIGRATIONS: versions 1, 2, 3 … in order, each with a name and an up() function', () => {
      const bad = [];
      lib.MIGRATIONS.forEach((m, i) => {
        if (m.version !== i + 1) bad.push('position ' + (i + 1) + ' has version ' + m.version);
        if (!m.name || typeof m.name !== 'string') bad.push('version ' + m.version + ' has no name');
        if (typeof m.up !== 'function') bad.push('version ' + m.version + ' has no up()');
      });
      if (lib.latest() !== lib.MIGRATIONS.length) bad.push('latest() is ' + lib.latest());
      return bad.join('; ');
    });
    const all = lib.BASELINE_COLLECTIONS;
    test('fresh database: all checks in order, then every step once, recorded', () => {
      const db = fakeDb(all);
      const s2 = loadModule('pinn-schema.js', db.globals);
      const st = s2.ensureCurrent();
      const order = db.calls.filter(c => !c.startsWith('pinn-protokoll.js.fehler')).map(c => c.split('.js.')[0]);
      if (order[0] !== 'pinn-protokoll' || order[1] !== 'pinn-benutzer') return 'checks start with ' + order.slice(0, 2).join(', ');
      if (order.indexOf('pinn-finanzen') > order.indexOf('pinn-kassen')) return 'pinn-finanzen must come before pinn-kassen';
      if (!db.cols.has('pinn_schema')) return 'collection pinn_schema not created';
      return eq({ ok: st.ok, version: st.version, rows: db.rows.map(x => x.version), app: db.rows[0] && db.rows[0].app }, { ok: true, version: lib.latest(), rows: lib.MIGRATIONS.map(m => m.version), app: '9.9.9' });
    });
    test('second call and second start: nothing runs again', () => {
      const db = fakeDb(all.concat('pinn_schema'), lib.MIGRATIONS.map(m => m.version));
      const s2 = loadModule('pinn-schema.js', db.globals);
      s2.ensureCurrent();
      const n = db.calls.length;
      const st = s2.ensureCurrent();
      if (db.calls.length !== n) return 'second ensureCurrent() ran again';
      return eq({ ok: st.ok, version: st.version, rows: db.rows.length }, { ok: true, version: lib.latest(), rows: lib.MIGRATIONS.length });
    });
    test('step 1 with a missing collection: not recorded, reported, retried on the next start', () => {
      const db = fakeDb(all.filter(n => n !== 'ortung'));
      const st = loadModule('pinn-schema.js', db.globals).ensureCurrent();
      if (st.ok || st.schritt !== 1 || db.rows.length) return 'expected a failed step 1, got ' + JSON.stringify(st);
      if (!db.log.some(l => l.includes('ortung'))) return 'error log does not name the missing collection';
      db.cols.add('ortung'); db.store.clear();
      const st2 = loadModule('pinn-schema.js', db.globals).ensureCurrent();
      return eq({ ok: st2.ok, rows: db.rows.length }, { ok: true, rows: lib.MIGRATIONS.length });
    });
    test('database newer than the code: no step runs, warning in the error log', () => {
      const db = fakeDb(all.concat('pinn_schema'), [1, 999]);
      const st = loadModule('pinn-schema.js', db.globals).ensureCurrent();
      if (!st.neuer || st.version !== 999) return 'expected neuer with version 999, got ' + JSON.stringify(st);
      if (db.rows.length !== 2) return 'a step ran on a newer database';
      return db.log.some(l => l.startsWith('warnung')) ? '' : 'no warning in the error log';
    });
    test('a failing check is reported but does not stop the other checks or the steps', () => {
      const db = fakeDb(all);
      db.modules['pinn-muell.js'] = { ensureSchema: () => { throw new Error('kaputt'); } };
      const st = loadModule('pinn-schema.js', db.globals).ensureCurrent();
      if (!db.calls.some(c => c.startsWith('pinn-zuhause.js'))) return 'checks after the failing one did not run';
      return eq({ ok: st.ok, pruefungen: st.pruefungen, rows: db.rows.length, logged: db.log.some(l => l.includes('kaputt')) }, { ok: false, pruefungen: ['muell'], rows: lib.MIGRATIONS.length, logged: true });
    });
  }
}

// Push texts of the server: patterns → text keys of pb_public/i18n (since 1.117.0)
if (exists(path.join(HOOKS, 'pinn-pushtext.js'))) {
  let pt = null;
  const memStore = new Map();
  test('pinn-pushtext.js loads and reads the language files next to the hooks', () => {
    pt = loadModule('pinn-pushtext.js', {
      $os: { readFile: p => { if (String(p).startsWith('/pb_public')) throw new Error('not in a container'); return fs.readFileSync(p); } },
      toString: b => (Buffer.isBuffer(b) ? b.toString('utf8') : String(b)),
      $app: { store: () => ({ get: k => memStore.get(k), set: (k, v) => memStore.set(k, v), remove: k => memStore.delete(k) }) },
    });
    return pt.tk('en', 'push.sos.title', { name: 'Anna' }) === 'SOS: Anna needs help!' ? '' : 'push.sos.title not found in en.i18n.js';
  });
  if (pt) {
    test('push messages in English, French and Japanese (plural forms, names, dates)', () => {
      const m = { tag: 'sos-1', titel: 'SOS: Anna braucht Hilfe!', text: 'Deine Familie wurde alarmiert (1 Gerät) und sieht deinen Standort.' };
      const t = { tag: 'termin-1', titel: 'Zahnarzt um 14:30', text: 'In 15 Minuten · mit Anna, Ben und Carla' };
      return eq([pt.translateFor('en', 'familie', m).text, pt.translateFor('fr', 'familie', t).text, pt.translateFor('ja', 'familie', { tag: 'tagesuebersicht-1', titel: 'Mo, 03.11. 09:00' }).titel],
        ['Your family has been alerted (1 device) and can see your location.', 'Dans 15 minutes · avec Anna, Ben et Carla', '11月3日（月） 09:00']);
    });
    test('flat share: the "#wg" variant is used, texts without a pattern keep their words', () => {
      const m = { tag: 'sos-1', titel: 'Dein Hilferuf wurde gesendet', text: 'Deine Familie wurde alarmiert (2 Geräte) und sieht deinen Standort.' };
      return eq([pt.translateFor('de', 'wg', m).text, pt.translateFor('en', 'wg', { tag: 'x', titel: 'Everything for the family' }).titel],
        ['Deine WG wurde alarmiert (2 Geräte) und sieht deinen Standort.', 'Everything for the flatshare']);
    });
    test('update notice for admins (since 1.118.1) is translated', () => {
      const m = { tag: 'update-1.119.0', titel: '🆕 pinn. 1.119.0 ist da', text: 'Installiert ist 1.118.1. Antippen, um das Update unter Einstellungen → System zu installieren.' };
      const r = pt.translateFor('en', 'familie', m);
      return eq([r.titel, r.text], ['🆕 pinn. 1.119.0 is here', 'Installed: 1.118.1. Tap to install the update under Settings → System.']);
    });
    // Russian (since 1.120.9): three plural forms, dates, quotation marks «…», flat share terms with Cyrillic endings
    test('push messages in Russian (plural forms one/few/many, dates, names stay unchanged)', () => {
      const sos = n => pt.translateFor('ru', 'familie', { tag: 'sos-1', titel: 'SOS: Anna braucht Hilfe!', text: 'Deine Familie wurde alarmiert (' + n + ' Gerät' + (n === 1 ? '' : 'e') + ') und sieht deinen Standort.' });
      const pantry = pt.translateFor('ru', 'familie', { tag: 'vorrat-1', titel: '3 Vorrats-Artikel laufen bald ab', text: 'Milch (in 2 Tagen) · Joghurt (seit 21 Tagen abgelaufen) · Käse (seit gestern abgelaufen)' });
      const day = pt.translateFor('ru', 'familie', { tag: 'tagesuebersicht-1', titel: 'Mo, 03.11. 09:00', text: 'Mittag: Pizza' });
      const board = pt.translateFor('ru', 'familie', { tag: 'pinnwand-1', titel: 'Noch 21 Tage – Urlaub', text: 'Einfach so. 💛' });
      const ev = pt.translateFor('ru', 'familie', { tag: 'termin-1', titel: 'Zahnarzt um 14:30', text: 'In 15 Minuten · mit Anna, Ben und Carla' });
      const kid = pt.translateFor('ru', 'familie', { tag: 'kind-1', titel: 'Max hat alles geschafft! 🏆', text: 'Alle Aufgaben für heute Abend sind erledigt – zuletzt „Zähne putzen“.' });
      return eq([sos(1).text, sos(3).text, sos(5).text, pantry.titel, pantry.text, day.titel + ' / ' + day.text, board.titel, ev.titel + ' / ' + ev.text, kid.text],
        ['Ваша семья оповещена (1 устройство) и видит ваше местоположение.', 'Ваша семья оповещена (3 устройства) и видит ваше местоположение.', 'Ваша семья оповещена (5 устройств) и видит ваше местоположение.',
          '3 позиции в запасах: срок годности скоро истекает', 'Milch (через 2 дня) · Joghurt (срок истёк 21 день назад) · Käse (срок истёк вчера)',
          'Пн, 3.11. 09:00 / Обед: Pizza', 'Остался 21 день – Urlaub', 'Zahnarzt в 14:30 / Через 15 минут · участники: Anna, Ben и Carla',
          'Все задачи выполнены (сегодня вечером) – последняя: «Zähne putzen».']);
    });
    test('Russian contract notice: the month count uses the plural form of the number', () => {
      const c = n => pt.translateFor('ru', 'familie', { tag: 'vertrag-1', titel: 'x', text: 'Kündigung bis 30.11.2026 (in 5 Tagen) zum 31.12.2026 – sonst verlängert er sich um ' + (n === 1 ? 'einen Monat' : n + ' Monate') + '.' }).text;
      return eq([c(1), c(3), c(12)], [
        'Расторгните до 30.11.2026 (через 5 дней), чтобы договор закончился 31.12.2026, – иначе он продлится ещё на 1 месяц.',
        'Расторгните до 30.11.2026 (через 5 дней), чтобы договор закончился 31.12.2026, – иначе он продлится ещё на 3 месяца.',
        'Расторгните до 30.11.2026 (через 5 дней), чтобы договор закончился 31.12.2026, – иначе он продлится ещё на 12 месяцев.']);
    });
    test('Russian flat share: "#wg" variants and the Cyrillic flat share terms (cases are kept, "семейный врач" stays)', () => {
      const m = { tag: 'sos-1', titel: 'x', text: 'Kein Gerät deiner Familie ist für Push angemeldet – bitte zusätzlich anrufen (112).' };
      const free = pt.translateFor('ru', 'wg', { tag: 'x', titel: 'Члены семьи и семейный врач', text: 'Вся семья, всей семье, семьёй. Семейный бюджет и Семейные дела' });
      return eq([pt.translateFor('ru', 'wg', m).text, free.titel, free.text, pt.applyTerms('Для семьи: новые члены семьи', 'ru'), pt.applyTerms('Член семьи, членов семьи', 'ru'), pt.applyTerms('Семья и членам семьи', 'ru')],
        ['Ни одно устройство вашей квартиры не подключено к уведомлениям – позвоните дополнительно (112).', 'Соседи и семейный врач', 'Вся квартира, всей квартире, квартирой. Семейный бюджет и Общие дела',
          'Для квартиры: новые соседи', 'Сосед, соседей', 'Квартира и соседям']);
    });
    test('every push text of English exists as its own text in the Russian language file', () => {
      const keysOf = code => new Set((fs.readFileSync(path.join(ROOT, 'pb_public/i18n/' + code + '.i18n.js'), 'utf8').match(/^  "push\.[^"#]+":/gm) || []).map(x => x.replace(/^\s*"|":$/g, '')));
      const en = keysOf('en'), ru = keysOf('ru');
      const missing = [...en].filter(k => !ru.has(k));
      return missing.length ? 'missing in ru: ' + missing.slice(0, 5).join(', ') : '';
    });
    test('every key of the push patterns exists in every language file', () => {
      const keys = new Set();
      pt.GROUPS.forEach(g => g.rules.forEach(rule => { if (typeof rule[1] === 'string') keys.add(rule[1]); }));
      pt.SHARED.forEach(rule => { if (typeof rule[1] === 'string') keys.add(rule[1]); });
      Object.keys(pt.EXACT).forEach(w => keys.add(pt.EXACT[w]));
      const langs = ['de', 'en', 'fr', 'es', 'it', 'pt', 'zh', 'ja', 'ko', 'ru'];
      const missing = [];
      keys.forEach(k => langs.forEach(l => { if (pt.tk(l, k, { n: 2 }, false) === null) missing.push(l + ':' + k); }));
      return missing.length ? 'missing ' + missing.slice(0, 5).join(', ') : '';
    });
  }
}

// Voice control (pinn-sprache.js): Russian sentences (since 1.121.0), the other languages keep working
if (exists(path.join(HOOKS, 'pinn-sprache.js'))) {
  let vs = null;
  test('pinn-sprache.js loads and still understands German and English', () => {
    vs = loadModule('pinn-sprache.js', {});
    return eq([vs.intentOf('Milch und Eier auf die Einkaufsliste').art, vs.intentOf('Add milk and eggs to the shopping list').items.length], ['kaufen', 2]);
  });
  if (vs) {
    test('voice control in Russian: shopping list, quantities, list name, read list, task, day overview', () => {
      const a = vs.intentOf('Добавь молоко и яйца в список покупок');
      const b = vs.intentOf('Добавь две пачки макарон в список Пятёрочка');
      const c = vs.intentOf('Добавь 2 кг картофеля и 1 литр молока в список покупок');
      const t = vs.intentOf('Напомни завтра вынести мусор');
      const bad = [];
      if (a.art !== 'kaufen' || a.items.map(x => x.name).join() !== 'Молоко,Яйца') bad.push('add');
      if (b.items[0].qty !== '2 пачки' || b.items[0].name !== 'Макароны' || b.laden !== 'Пятёрочка') bad.push('pack/list name');
      if (c.items.map(x => x.qty + ' ' + x.name).join() !== '2 кг Картофель,1 л Молоко') bad.push('kg/litre');
      if (vs.intentOf('Что в списке покупок').art !== 'liste' || vs.intentOf('Что нужно купить').art !== 'liste') bad.push('read list');
      if (t.art !== 'aufgabe' || t.rest !== 'Вынести мусор' || !t.iso) bad.push('task');
      if (vs.intentOf('Что запланировано на сегодня').offset !== 0 || vs.intentOf('Что у нас завтра').offset !== 1) bad.push('day');
      if (vs.intentOf('Милая песня').art !== 'hilfe') bad.push('help');
      return bad.length ? 'wrong: ' + bad.join(', ') : '';
    });
  }
}

r.info(tests + ' unit tests');

r.done();
