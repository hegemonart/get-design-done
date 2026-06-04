'use strict';
/**
 * test/suite/no-internal-refs.test.cjs
 *
 * Backstops scripts/validate-no-internal-refs.cjs by running it in the
 * test suite. New Phase NN / Plan NN-MM / .planning/ / D-NN references
 * appearing in any shipped surface (beyond the file's baseline count)
 * fails CI immediately, rather than being caught only by maintainers
 * remembering to run the gate.
 *
 * Re-baseline (after a legitimate cleanup commit) via:
 *   npm run validate:no-internal-refs -- --rebaseline
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'validate-no-internal-refs.cjs');

test('no-internal-refs: no shipped surface regressed beyond its baseline', () => {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    const detail = (r.stderr || '') + (r.stdout || '');
    assert.fail(`Internal-ref leak regression:\n\n${detail}`);
  }
});
