'use strict';
/**
 * test/suite/registry-tiers.test.cjs
 *
 * Backstops scripts/validate-registry-tiers.cjs in the test suite so that
 * any reintroduction of a model-tier value (haiku/sonnet/opus) on a
 * reference/registry.json entry fails the build, not just an opt-in
 * script. v1.57.1 had insight-line.schema mis-tagged with tier:"haiku"
 * (a paste-error from a sibling agent's default-tier field).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'validate-registry-tiers.cjs');

test('registry-tiers: every tiered entry uses L0/L1/L2/L3 (not haiku/sonnet/opus)', () => {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: 'utf8',
    timeout: 10_000,
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    const detail = (r.stderr || '') + (r.stdout || '');
    assert.fail(`validate-registry-tiers gate reported invalid tier values:\n\n${detail}`);
  }
});
