#!/usr/bin/env node
/* pinn. – runs every repository check in a row (.github/scripts/check-all.js, since 1.102.0)

   Usage:  node .github/scripts/check-all.js [path to a pocketbase program]

   The same checks as GitHub Actions (.github/workflows/check.yml), for your own computer before a pull
   request. Only Node.js is needed. Exit code 1 if any check failed; all checks run anyway, so you see
   every problem at once. With the path of a PocketBase program, the PocketBase smoke test
   (smoke-pocketbase.js – the second job on GitHub) runs as well. */

'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT } = require('./common');

const steps = [
  ['Build (pb_public/index.html matches src/)', ['src/build.js', '--check']],
  ['Syntax', ['.github/scripts/check-syntax.js']],
  ['Lint', ['.github/scripts/check-lint.js']],
  ['Hooks', ['.github/scripts/check-hooks.js']],
  ['Setup clean-up list', ['.github/scripts/check-setup.js']],
  ['Language files', ['.github/scripts/check-lang.js']],
  ['Text keys', ['.github/scripts/check-keys.js']],
];
if (process.argv[2]) steps.push(['PocketBase smoke test', ['.github/scripts/smoke-pocketbase.js', path.resolve(process.argv[2])]]);
const failed = [];
steps.forEach(([title, args]) => {
  console.log('\n— ' + title);
  const res = spawnSync(process.execPath, args.map((a, i) => (i ? a : path.join(ROOT, a))), { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) failed.push(title);
});
console.log('');
if (failed.length) {
  console.error('✗ failed: ' + failed.join(', '));
  process.exit(1);
}
console.log('✓ all checks passed');
