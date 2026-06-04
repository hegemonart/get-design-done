'use strict';
/**
 * test/suite/feature-counts.test.cjs
 *
 * Asserts the marketing/user-facing surfaces' agent/skill/connection/MCP-tool
 * counts agree with the filesystem reality. Backstops scripts/check-feature-counts.cjs
 * by running it in the same process as the rest of the test suite — if drift
 * sneaks back in on a new release, the test fails and the CI build fails too.
 *
 * History: this plugin spent multiple releases drifting between
 * "37 agents" / "22+ agents" / "59 agents" while the filesystem said 61.
 * Cf. v1.50.1 "consistency patch" — the drift returned 7 versions later
 * because nothing structural pinned the numbers. This test is that pin.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'check-feature-counts.cjs');

test('feature-counts: shipped surfaces agree with filesystem (no count drift)', () => {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: 'utf8',
    timeout: 10_000,
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    const detail = (r.stderr || '') + (r.stdout || '');
    assert.fail(`check-feature-counts gate reported drift:\n\n${detail}`);
  }
});
