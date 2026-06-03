'use strict';
/**
 * test/suite/cache-tiers.test.cjs
 *
 * Backstops scripts/check-cache-tiers.cjs by running it in the test
 * suite. Any byte drift in an L0 file (currently
 * reference/meta-rules.md + reference/shared-preamble.md) fails CI —
 * because L0 drift invalidates the Anthropic prompt cache for every
 * agent on the next session start.
 *
 * The maintainer ratchets the baseline only when the L0 edit is
 * deliberate (cf. reference/cache-tier-doctrine.md):
 *   node scripts/check-cache-tiers.cjs --rebaseline
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'check-cache-tiers.cjs');

test('cache-tiers: L0 files match baseline SHA-256 hashes', () => {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: 'utf8',
    timeout: 10_000,
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    const detail = (r.stderr || '') + (r.stdout || '');
    assert.fail(`L0 byte drift:\n\n${detail}`);
  }
});
