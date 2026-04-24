// tests/e2e-headless.test.ts — Plan 21-11 Task 4 (SDK-24).
//
// End-to-end headless integration test. Proves the Phase-21 runner
// stack (session-runner -> context-engine -> tool-scoping -> pipeline-
// runner) composes correctly by spawning `bin/gdd-sdk run` against
// the fixture at `test-fixture/headless-e2e/` and asserting artifact
// shape.
//
// Two tests:
//   1. 'dry-run mode: full pipeline with mocked sessions' — always runs.
//      Uses --dry-run (canned SessionResults, zero API cost).
//   2. 'live mode: full pipeline with real Anthropic API' — gated on
//      ANTHROPIC_API_KEY + GDD_E2E_LIVE=1. On PR builds the gate is
//      open only when a maintainer pushes with the secret explicitly
//      wired (CI workflow). The test short-circuits to a pass when the
//      secret is absent so PR builds see the dry-run coverage only.
//
// These tests deliberately do NOT import `runHeadlessE2E` from a
// relative path that requires the module resolver to walk up; we
// resolve the absolute project root via `process.cwd()` because
// node:test runs with cwd at the repo root (see package.json scripts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { runHeadlessE2E } from '../scripts/e2e/run-headless.ts';

/**
 * Resolve the fixture directory against the repo root. `process.cwd()`
 * is the repo root under `npm test` (node:test is invoked from the
 * package.json script). In the `node --test tests/e2e-headless.test.ts`
 * direct invocation we assume the caller cd'd to the repo root.
 */
const fixtureDir: string = path.resolve(process.cwd(), 'test-fixture/headless-e2e');

test('e2e-headless: dry-run mode completes the full 5-stage pipeline', async () => {
  const result = await runHeadlessE2E({
    mode: 'dry-run',
    fixtureDir,
    // Generous cap; dry-run normally completes in < 5s.
    timeoutMs: 60_000,
  });

  if (result.status !== 'pass') {
    // Surface diagnostic detail in the failure message.
    const detail =
      `exit_code=${result.exit_code}\n` +
      `duration_ms=${result.duration_ms}\n` +
      `assertion_failures:\n  - ${result.assertion_failures.join('\n  - ')}\n` +
      `stderr_tail:\n${result.stderr_tail}\n` +
      `stdout_tail:\n${result.stdout_tail}\n`;
    assert.fail(`E2E dry-run failed:\n${detail}`);
  }

  assert.strictEqual(result.status, 'pass');
  assert.strictEqual(result.exit_code, 0);
  assert.strictEqual(result.usd_cost, 0, 'dry-run MUST cost zero USD');
  assert.deepStrictEqual([...result.assertion_failures], []);

  // Artifact spot-checks — the harness already asserts these, but we
  // surface them here for readable failure output.
  const a = result.artifacts;
  assert.ok(a['.design/BRIEF.md']?.exists, 'BRIEF.md should exist');
  assert.ok(a['.design/DESIGN-PATTERNS.md']?.exists, 'DESIGN-PATTERNS.md should exist');
  assert.ok(a['.design/DESIGN-PLAN.md']?.exists, 'DESIGN-PLAN.md should exist');
  assert.ok(a['.design/DESIGN.md']?.exists, 'DESIGN.md should exist');
  assert.ok(a['.design/SUMMARY.md']?.exists, 'SUMMARY.md should exist');
});

test(
  'e2e-headless: live mode with real Anthropic API (gated on ANTHROPIC_API_KEY + GDD_E2E_LIVE)',
  { timeout: 15 * 60 * 1000 },
  async () => {
    // Gate: live mode only when BOTH the API key AND the explicit
    // opt-in flag are present. node:test does not expose a native
    // skip(); early-return yields a passing test and the CI log line
    // documents the skip reason.
    if (!process.env['ANTHROPIC_API_KEY']) {
      // eslint-disable-next-line no-console
      console.log('# skip e2e-headless live: ANTHROPIC_API_KEY not set');
      return;
    }
    if (process.env['GDD_E2E_LIVE'] !== '1') {
      // eslint-disable-next-line no-console
      console.log('# skip e2e-headless live: GDD_E2E_LIVE!=1 (default; set to run)');
      return;
    }

    const result = await runHeadlessE2E({
      mode: 'live',
      fixtureDir,
      timeoutMs: 15 * 60 * 1000,
      maxUsdCost: 5.0,
    });

    if (result.status === 'skipped') {
      // Harness agreed the gate was closed (belt-and-suspenders). Pass.
      // eslint-disable-next-line no-console
      console.log('# skip e2e-headless live: harness reported skipped');
      return;
    }

    if (result.status !== 'pass') {
      const detail =
        `exit_code=${result.exit_code}\n` +
        `duration_ms=${result.duration_ms}\n` +
        `usd_cost=${result.usd_cost}\n` +
        `assertion_failures:\n  - ${result.assertion_failures.join('\n  - ')}\n` +
        `stderr_tail:\n${result.stderr_tail}\n`;
      assert.fail(`E2E live-mode failed:\n${detail}`);
    }

    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.exit_code, 0);
    assert.ok(
      result.usd_cost < 5.0,
      `live usd_cost = ${result.usd_cost} (cap: 5.0)`,
    );
    assert.deepStrictEqual([...result.assertion_failures], []);
  },
);
