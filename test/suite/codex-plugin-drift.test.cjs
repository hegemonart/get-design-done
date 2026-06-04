'use strict';
/**
 * test/suite/codex-plugin-drift.test.cjs
 *
 * Backstops scripts/check-codex-plugin-drift.cjs by running it as the CI
 * suite's own subprocess. Without this test, a regression in the gate (or
 * a freshly merged edit to package.json / .claude-plugin / README that
 * drifts the committed Codex/Cursor mirrors) goes unnoticed until the
 * separate `npm run validate:codex-plugin` step runs.
 *
 * Pattern mirrors test/suite/feature-counts.test.cjs (the equivalent
 * baseline-ratchet backstop for marketing-surface counts).
 *
 * Per Phase 28.8 / Q7: generator emits, committed mirrors, drift gate in CI.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GATE = path.join(REPO_ROOT, 'scripts', 'check-codex-plugin-drift.cjs');

test('codex-plugin-drift: committed .codex-plugin/plugin.json + .cursor-plugin/plugin.json match generator', () => {
  const r = spawnSync(process.execPath, [GATE, '--check'], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    const detail = (r.stderr || '') + (r.stdout || '');
    assert.fail(
      `check-codex-plugin-drift gate reported drift:\n\n${detail}\n\n` +
      `Run \`npm run validate:codex-plugin -- --rebaseline\` to regenerate ` +
      `the committed snapshots from generator output.`
    );
  }
});
