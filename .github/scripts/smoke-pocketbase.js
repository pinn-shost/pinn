#!/usr/bin/env node
/* pinn. – starts a real PocketBase with pb_hooks/ and pb_public/ and tries every route
   (.github/scripts/smoke-pocketbase.js, since 1.102.0)

   Usage:  node .github/scripts/smoke-pocketbase.js <path to the pocketbase program>

   GitHub Actions downloads PocketBase in the version from docker-compose.yaml (x-pocketbase-version) and runs this
   with an empty, temporary data folder – nothing is kept. You can run it yourself with any PocketBase program.
   Fails if:
   - PocketBase does not start with the hooks (or /api/health does not answer within 60 s),
   - the app page "/" is not served or its APP_VERSION differs from src/version.txt,
   - a route with a middleware (sign-in required) answers 404 – then PocketBase did not register it.
   Only reported (warning): public routes that answer 404, 5xx or time out (they may need a configuration or
   the internet), and start-up messages of the hooks that contain "fehlgeschlagen" / "failed" / "error". */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ROOT, read } = require('./common');

const PB = process.argv[2];
const PORT = Number(process.env.PINN_SMOKE_PORT || 8090);
const BASE = 'http://127.0.0.1:' + PORT;
const problems = [];
const warnings = [];
const gh = !!process.env.GITHUB_ACTIONS;
const warn = msg => { warnings.push(msg); console.log((gh ? '::warning::' : 'warning: ') + msg); };
const fail = msg => { problems.push(msg); console.log((gh ? '::error::' : 'error: ') + msg); };
const sleep = ms => new Promise(res => setTimeout(res, ms));

async function request(method, url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const init = { method, signal: ctrl.signal, redirect: 'manual' };
    if (method !== 'GET' && method !== 'HEAD') { init.headers = { 'content-type': 'application/json' }; init.body = '{}'; }
    const res = await fetch(url, init);
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: ctrl.signal.aborted ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!PB || !fs.existsSync(PB)) { console.error('usage: node .github/scripts/smoke-pocketbase.js <pocketbase program>'); process.exit(2); }

  // Routes as the hooks register them (same sandbox as check-hooks.js)
  const routesFile = path.join(os.tmpdir(), 'pinn-routes-' + process.pid + '.json');
  const list = spawnSync(process.execPath, [path.join(__dirname, 'check-hooks.js'), '--routes-json', routesFile], { cwd: ROOT, encoding: 'utf8' });
  if (!fs.existsSync(routesFile)) { console.error(list.stdout + list.stderr); console.error('could not list the routes'); process.exit(1); }
  const routes = JSON.parse(fs.readFileSync(routesFile, 'utf8'));
  fs.unlinkSync(routesFile);

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinn-pb-data-'));
  const args = ['serve', '--http=127.0.0.1:' + PORT, '--dir=' + dataDir,
    '--publicDir=' + path.join(ROOT, 'pb_public'), '--hooksDir=' + path.join(ROOT, 'pb_hooks'), '--hooksWatch=false'];
  console.log('starting: ' + path.basename(PB) + ' ' + args.join(' '));
  const pb = spawn(PB, args, { cwd: dataDir, env: Object.assign({}, process.env), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let exited = null;
  pb.stdout.on('data', d => { log += d; });
  pb.stderr.on('data', d => { log += d; });
  pb.on('exit', code => { exited = code; });
  const stop = () => { if (exited === null) { try { pb.kill('SIGTERM'); } catch (e) { /* ignore */ } } };

  try {
    // 1) start + health
    let healthy = false;
    for (let i = 0; i < 120 && exited === null; i++) {
      const res = await request('GET', BASE + '/api/health', 2000);
      if (res.status === 200) { healthy = true; break; }
      await sleep(500);
    }
    if (!healthy) {
      fail(exited !== null ? 'PocketBase stopped during start (exit code ' + exited + ')' : 'PocketBase did not answer /api/health within 60 s');
      return;
    }
    console.log('✓ PocketBase is running with the hooks');
    await sleep(2000); // let the onBootstrap hooks finish their log lines

    // 2) app page
    const version = read(path.join(ROOT, 'src', 'version.txt')).trim();
    const page = await request('GET', BASE + '/', 10000);
    if (page.status !== 200) fail('"/" answered ' + page.status + ' instead of the app page');
    else if (!page.text.includes("const APP_VERSION = '" + version + "'")) fail('"/" does not contain APP_VERSION ' + version);
    else console.log('✓ app page served (version ' + version + ')');

    // 3) every route
    let ok = 0;
    for (const rt of routes) {
      const url = BASE + rt.path.replace(/\{[^}]*\}/g, '1');
      const res = await request(rt.method, url, 15000);
      const label = rt.method + ' ' + rt.path + ' (' + rt.at + ')';
      if (res.status === 404 && rt.middleware) fail(label + ' answered 404 – PocketBase did not register it');
      else if (res.status === 404) warn(label + ' answered 404 without sign-in (public route – may be a "not found" of the route itself)');
      else if (res.status === 0) warn(label + ': ' + res.text);
      else if (res.status >= 500) warn(label + ' answered ' + res.status + ': ' + res.text.slice(0, 160).replace(/\s+/g, ' '));
      else ok++;
    }
    console.log('✓ ' + ok + ' of ' + routes.length + ' routes answered as expected without sign-in');
  } finally {
    stop();
    await sleep(500);
    // 4) start-up messages of the hooks
    const lines = log.split('\n').filter(l => /fehlgeschlagen|failed|error|panic/i.test(l));
    lines.slice(0, 40).forEach(l => warn('PocketBase log: ' + l.trim().slice(0, 300)));
    if (process.env.PINN_SMOKE_LOG || problems.length) console.log('\n--- PocketBase log ---\n' + log.slice(-20000));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log('');
  if (problems.length) { console.error('✗ PocketBase smoke test – ' + problems.length + ' problem(s), ' + warnings.length + ' warning(s)'); process.exit(1); }
  console.log('✓ PocketBase smoke test' + (warnings.length ? ' – ' + warnings.length + ' warning(s), see above' : ''));
  process.exit(0);
}, e => { console.error(e); process.exit(1); });
