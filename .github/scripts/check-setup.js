#!/usr/bin/env node
/* pinn. – checks the clean-up list of pinn-setup.sh (.github/scripts/check-setup.js, since 1.102.1)

   Usage:  node .github/scripts/check-setup.js

   pinn-setup.sh moves files that an earlier version installed and the app no longer uses (list OBSOLET, between
   the markers "# >>> obsolete files" and "# <<< obsolete files") to _alt/<date>/ on every install and update.
   A wrong entry would remove a file the app needs, so this script checks:
   1. The list: every entry is a plain path below pb_public/js/, pb_public/css/, pb_public/lang/ or pb_hooks/
      (no "..", no wildcards, no data folders), appears only once, and is NOT a file of this repository,
      NOT loaded by src/rahmen.html or the built pb_public/index.html, and not a file name that pinn-setup.sh
      itself would install (function ziel).
   2. The shell block really works: it is run with "sh" in a temporary folder with made-up files – an obsolete
      file is moved to _alt/ (content kept), a missing file is no problem, a file that index.html still loads
      stays, a file that is not on the list stays, and without index.html nothing is touched. Skipped with a
      note if there is no "sh" (e.g. Windows without Git Bash) – GitHub Actions always has it. */

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, rel, read, exists, reporter } = require('./common');

const r = reporter('Setup clean-up list');
const SETUP = path.join(ROOT, 'pinn-setup.sh');
const ALLOWED = ['pb_public/js/', 'pb_public/css/', 'pb_public/lang/', 'pb_hooks/'];

if (!exists(SETUP)) {
  r.fail('pinn-setup.sh', 'missing');
  r.done();
  process.exit();
}
const script = read(SETUP);
const a = script.indexOf('# >>> obsolete files');
const b = script.indexOf('# <<< obsolete files');
if (a < 0 || b < a) {
  r.fail('pinn-setup.sh', 'markers "# >>> obsolete files" / "# <<< obsolete files" not found');
  r.done();
  process.exit();
}
const block = script.slice(a, b);

// ---------- 1: the list ----------
const m = block.match(/^OBSOLET="([^"]*)"/m);
if (!m) {
  r.fail('pinn-setup.sh', 'line OBSOLET="…" not found between the markers');
}
const entries = m ? m[1].split(/\s+/).filter(Boolean) : [];
const seen = new Set();
const frame = exists(path.join(ROOT, 'src', 'rahmen.html')) ? read(path.join(ROOT, 'src', 'rahmen.html')) : '';
const built = exists(path.join(ROOT, 'pb_public', 'index.html')) ? read(path.join(ROOT, 'pb_public', 'index.html')) : '';
// Names that pinn-setup.sh's ziel() installs (word list of its case branches)
const zielText = (script.match(/\nziel\(\) \{[\s\S]*?\n\}\n/) || [''])[0];
entries.forEach(entry => {
  if (!/^[A-Za-z0-9._\/-]+$/.test(entry) || entry.includes('..') || entry.startsWith('/')) { r.fail(entry, 'not a plain relative path'); return; }
  if (!ALLOWED.some(p => entry.startsWith(p) && entry.length > p.length)) r.fail(entry, 'must be a file below ' + ALLOWED.join(', '));
  if (seen.has(entry)) r.fail(entry, 'listed twice');
  seen.add(entry);
  if (exists(path.join(ROOT, entry))) r.fail(entry, 'this file is part of the repository – the release installs it and the clean-up would move it away again');
  const shown = entry.replace(/^pb_public\//, '');
  if (frame.includes(shown) || built.includes(shown)) r.fail(entry, 'is still loaded by src/rahmen.html / pb_public/index.html');
  const base = path.basename(entry);
  if (new RegExp('(^|[|\\s])' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([|)\\s]|$)').test(zielText)) r.fail(entry, 'pinn-setup.sh (ziel) still installs a file with this name');
});
r.info(entries.length + ' obsolete file(s) on the list');

// ---------- 2: run the block ----------
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;
if (!hasSh) {
  r.info('no "sh" on this computer – the shell block was NOT run (GitHub Actions does it)');
} else if (entries.length) {
  const run = (setup) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinn-setup-test-'));
    try {
      setup(dir);
      const res = spawnSync('sh', ['-c', 'ALT="_alt/test"; ' + block + '\necho "WEG=$WEG"'], { cwd: dir, encoding: 'utf8' });
      const weg = ((res.stdout || '').match(/WEG=(\d+)/) || [])[1];
      return { dir, res, weg: weg === undefined ? null : Number(weg) };
    } catch (e) { return { dir, err: e }; }
  };
  const put = (dir, file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  const has = (dir, file) => fs.existsSync(path.join(dir, file));
  const first = entries[0];
  const cases = [
    ['obsolete file is moved to _alt/ with its content', dir => { put(dir, 'pb_public/index.html', '<script src="js/x.js"></script>'); put(dir, first, 'OLD'); put(dir, 'pb_data/keep.txt', 'DATA'); },
      (o) => o.weg === 1 && !has(o.dir, first) && has(o.dir, '_alt/test/' + first) && fs.readFileSync(path.join(o.dir, '_alt/test', first), 'utf8') === 'OLD' && has(o.dir, 'pb_data/keep.txt') && has(o.dir, 'pb_public/index.html')],
    ['missing file is no problem', dir => { put(dir, 'pb_public/index.html', 'x'); },
      (o) => o.res && o.res.status === 0 && o.weg === 0 && !has(o.dir, '_alt')],
    ['a file that index.html still loads stays', dir => { put(dir, 'pb_public/index.html', '<script src="' + first.replace(/^pb_public\//, '') + '?v=1"></script>'); put(dir, first, 'IN USE'); },
      (o) => o.weg === 0 && has(o.dir, first) && !has(o.dir, '_alt')],
    ['other files stay', dir => { put(dir, 'pb_public/index.html', 'x'); put(dir, 'pb_public/js/other.js', 'KEEP'); put(dir, 'pb_hooks/a.pb.js', 'KEEP'); },
      (o) => o.weg === 0 && has(o.dir, 'pb_public/js/other.js') && has(o.dir, 'pb_hooks/a.pb.js')],
    ['without index.html nothing is touched', dir => { put(dir, first, 'OLD'); },
      (o) => o.weg === 0 && has(o.dir, first) && !has(o.dir, '_alt')],
  ];
  cases.forEach(([label, setup, ok]) => {
    const o = run(setup);
    let good = false;
    try { good = !o.err && ok(o); } catch (e) { good = false; }
    if (!good) r.fail('shell block', 'test "' + label + '" failed' + (o.res ? ' (' + String(o.res.stderr || o.res.stdout).trim().slice(0, 200) + ')' : ''));
    fs.rmSync(o.dir, { recursive: true, force: true });
  });
  r.info(cases.length + ' tests of the shell block');
}

r.done();
