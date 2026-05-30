#!/usr/bin/env node
'use strict';

// scripts/run-behavior-tests.cjs — the `npm run test:behavior` driver (Phase 33, D-06).
//
// Behavior tests are OPT-IN and key-gated (D-06 — LLM non-determinism keeps live
// agent runs OUT of the default `npm test` / CI). This driver:
//
//   - When ANTHROPIC_API_KEY is UNSET: prints a clear skip message and exits 0
//     (so `npm run test:behavior` is safe to run anywhere — CI included — without
//     a key; it simply no-ops).
//   - When ANTHROPIC_API_KEY is SET: runs the pressure-scenario harness (the
//     33-01 runner) over every manifest under test/suite/skill-behavior/scenarios/
//     using a REAL invoker. The real invoker is NOT bundled (D-03 — the harness is
//     invoker-agnostic and ships no @anthropic-ai/sdk dependency); a maintainer
//     wires one by exporting GDD_BEHAVIOR_INVOKER=<path-to-module> whose default
//     export is `invokeAgent(prompt, opts) -> { text }` (peer-CLI ACP spawn or a
//     thin keyed SDK adapter). Without that module the driver explains how to wire
//     it and exits non-zero so a keyed-but-unwired run is not silently green.
//
// This driver is maintainer-only (not in the npm `files` allowlist).

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCENARIO_DIR = path.join(REPO_ROOT, 'test', 'suite', 'skill-behavior', 'scenarios');

function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      'test:behavior — SKIPPED: ANTHROPIC_API_KEY is not set.\n' +
        '  Behavior (pressure-scenario) tests are opt-in (D-06) and require a real\n' +
        '  agent invoker. The default `npm test` stub suite covers the harness\n' +
        '  structurally and stays CI-green. To run the live behavior pass:\n' +
        '    ANTHROPIC_API_KEY=… GDD_BEHAVIOR_INVOKER=./path/to/invoker.cjs npm run test:behavior',
    );
    process.exit(0);
  }

  const invokerPath = process.env.GDD_BEHAVIOR_INVOKER;
  if (!invokerPath) {
    console.error(
      'test:behavior — ANTHROPIC_API_KEY is set but GDD_BEHAVIOR_INVOKER is not.\n' +
        '  The harness is invoker-agnostic and ships no Anthropic SDK dependency (D-03).\n' +
        '  Point GDD_BEHAVIOR_INVOKER at a module exporting `invokeAgent(prompt, opts)\n' +
        '  -> { text }` (a peer-CLI ACP spawn of a local claude/codex, or a thin keyed\n' +
        '  SDK adapter), then re-run. See docs/research/description-format-ab.md and\n' +
        '  CONTRIBUTING.md ("How to add a pressure scenario").',
    );
    process.exit(1);
  }

  const { runScenario, loadManifest } = require('./lib/skill-behavior/runner.cjs');
  const invokeAgent = require(path.resolve(REPO_ROOT, invokerPath));
  const invoke = typeof invokeAgent === 'function' ? invokeAgent : invokeAgent.invokeAgent;
  if (typeof invoke !== 'function') {
    console.error(`test:behavior — GDD_BEHAVIOR_INVOKER (${invokerPath}) must export invokeAgent(prompt, opts) -> { text }`);
    process.exit(1);
  }

  const manifests = fs
    .readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  let failures = 0;
  for (const file of manifests) {
    const manifest = loadManifest(path.join(SCENARIO_DIR, file));
    const result = runScenario(manifest, { invokeAgent: invoke });
    const status = result.pass ? 'PASS' : 'FAIL';
    if (!result.pass) failures += 1;
    console.log(
      `${status}  ${result.scenario}  (compliance=${result.compliance_hits} violations=${result.violation_hits})`,
    );
  }

  console.log(`\ntest:behavior — ${manifests.length} scenarios, ${failures} failing.`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
