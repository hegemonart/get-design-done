'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

function parseSemver(v) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function isExactPatchBump(from, to) {
  const a = parseSemver(from);
  const b = parseSemver(to);
  return a.major === b.major &&
         a.minor === b.minor &&
         b.patch === a.patch + 1;
}

// Version sequence per roadmap: v1.0.0 → v1.0.1 → ... → v1.0.7
// Phase 12 did not ship a manifest bump in this worktree; 1.0.6 included for
// sequence continuity but the tree jumps 1.0.5 → 1.0.7 at Phase 13 closeout.
const EXPECTED_SEQUENCE = [
  '1.0.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5', '1.0.6', '1.0.7'
];

// Off-cadence decimal patches (CONTEXT.md D-29): four-segment versions that
// attach a sub-patch to an already-shipped 3-segment release without
// disturbing the parent cadence. These are accepted for plugin.json / marketplace.json
// but do NOT participate in the exact-patch-bump sequence check above.
//   - 1.0.7.2 → Phase 13.2 (external-authority-watcher); skips 1.0.7.1 which
//     was reserved for Phase 13.1 (Figma MCP consolidation) per ROADMAP.
//   - 1.13.3 → Phase 13.3 (plugin-update-checker); Phase 13.3 changed the
//     versioning scheme from sequential patch (1.0.x) to milestone.phase.patch
//     (1.MM.P). Off-cadence from the old 1.0.x sequence.
//   - 1.14.0 → Phase 14 (AI-native design tool connections); first mainline
//     release under the new milestone.phase.patch scheme.
//   - 1.14.1 → Security hardening patch (shell injection, CI pinning, prompt
//     injection consolidation, spend aggregation fixes).
//   - 1.14.2 → Multi-format Claude Design handoff ingestion (URL fetch, ZIP,
//     PDF, PPTX entry points; format-dispatch in synthesizer).
//   - 1.14.3 → Plugin manifest fix: drop `"./"` from skills (loader rejects
//     it as path escape) and drop redundant `hooks` pointer (auto-detected).
//   - 1.14.4 → Figma MCP: variant-agnostic probe, current canonical URL
//     (mcp.figma.com/mcp), plugin-install path, desktop-variant auto-detect.
//   - 1.14.5 → Safety + Recall Floor scaffolding (Phase 14.5 CI/test hygiene).
//   - 1.14.6 → Phase 14.5 Safety + Recall Floor (shipped on main).
//   - 1.14.7 → Phase 14.6 Test Coverage Completion closeout (shipped on main).
//   - 1.14.8 → Phase 14.7 First-Run Proof Path (/gdd:start skill, nudge hook,
//     design-start-writer agent, detect-ui-root + findings-engine helpers).
//   - 1.20.0 → Phase 20 SDK foundation (gdd-sdk-foundation milestone). Jumps
//     the 1.19.x sequence to mark the shift from "design pipeline" to
//     "typed SDK + MCP server + resilience primitives + event stream".
//     16 plans complete (20-00 through 20-15): TS toolchain, gdd-state
//     module, transition gates, prompt sanitizer, GDDError taxonomy,
//     gdd-state MCP server (11 tools), event stream foundation, 5 stage
//     skill migrations, 6 utility skill migrations, hooks TS rewrite,
//     resilience primitives (jittered-backoff / rate-guard /
//     error-classifier / iteration-budget). Closeout shipped the
//     race-condition test (4 workers × 500 ops), phase-20 regression
//     baseline, v1.20.0 CHANGELOG, and version-sync across manifests.
//   - 1.21.0 → Phase 21 GDD SDK Headless (gdd-sdk-headless milestone).
//     12 plans (21-01 through 21-12): session-runner, context-engine,
//     tool-scoping, logger, pipeline-runner state machine, 3 parallel
//     runners (explore-parallel / discuss-parallel / init), gdd-sdk CLI
//     (run/stage/query/audit/init), cross-harness layer (Codex + Gemini
//     support via AGENTS.md / GEMINI.md), E2E headless test harness.
//     Closeout shipped README + CHANGELOG + manifest bumps + Phase-21
//     regression baseline.
const OFF_CADENCE_VERSIONS = new Set([
  '1.0.7.2',
  '1.13.3',
  '1.14.0',
  '1.14.1',
  '1.14.2',
  '1.14.3',
  '1.14.4',
  '1.14.5',
  '1.14.6',
  '1.14.7',
  '1.14.8',
  '1.15.0',
  '1.16.0',
  '1.17.0',
  '1.18.0',
  '1.19.0',
  '1.19.5',
  '1.19.6',
  '1.20.0',
  '1.21.0',
  '1.22.0',
  '1.23.0',
  '1.23.5',
  '1.24.0',
  '1.24.1',
  '1.24.2',
  //   - 1.25.0 → Phase 25 Pipeline Hardening (gdd-pipeline-hardening
  //     milestone). 9 plans (25-01 through 25-09): prototype gate
  //     (agent + STATE <prototyping> block + sketch/spike-wrap-up
  //     dual-writes + decision-injector outcomes); router S/M/L/XL
  //     complexity_class additive to legacy fast/quick/full path;
  //     quality-gate Stage 4.5 (skill + Haiku classifier agent +
  //     STATE <quality_gate> block + 6 events.jsonl lifecycle events
  //     + verify entry-gate refuses on fail); Stop-hook turn closeout
  //     (gdd-turn-closeout.js + portable Skill mirror + hooks.json
  //     wiring). Closeout shipped 5 new tests + Phase-25 baseline +
  //     CHANGELOG.
  '1.25.0',
  //   - 1.26.0 → Phase 26 Headless Model Resolver (gdd-headless-model-
  //     resolver milestone). 9 plans (26-01 through 26-09): per-runtime
  //     tier→model adapter (`reference/runtime-models.md` + JSON schema
  //     + parser); `tier-resolver.cjs` + `runtime-detect.cjs` with the
  //     fallback chain D-04 (runtime-specific → claude → null + event)
  //     and Phase 24 env-var lookup chain D-05; installer emits
  //     `models.json` per runtime config-dir at install; router output
  //     gains `resolved_models` field next to `model_tier_overrides`
  //     (additive — strict superset per D-07); `budget-enforcer.cjs`
  //     shared backend reads `resolved_models` and per-runtime
  //     `reference/prices/{claude,codex,gemini,qwen}.md` sub-tables;
  //     reflector cross-runtime cost-arbitrage proposal at >50% spread
  //     (D-09); `reasoning-class: high|medium|low` runtime-neutral
  //     alias for `default-tier` (additive D-10); frontmatter validator
  //     accepts the alias + enforces equivalence; intel-updater keeps
  //     both fields current. Closeout shipped 4 new tests + Phase-26
  //     baseline + CHANGELOG + `docs/MULTI-RUNTIME-MODELS.md` ops guide.
  '1.26.0',
  //   - 1.27.0 → Phase 27 Peer-CLI Delegation Layer (gdd-peer-cli-
  //     delegation milestone). 11 feature plans (27-01..27-11) + closeout
  //     (27-12). Closes the OUTBOUND half of multi-runtime: Phase 24 made
  //     gdd installable on 14 runtimes; Phase 21 made the same pipeline
  //     run on each; Phase 26 made tier→model resolve correctly per
  //     runtime; v1.27.0 adds the missing piece — a host running CC can
  //     OPTIONALLY delegate `gemini-research` / `codex-execute` /
  //     `cursor-debug` etc. role calls to local peer-CLIs for cost or
  //     quality wins, with transparent fallback to in-process Anthropic
  //     SDK on peer-absent / peer-error (D-07). Wave A (27-01..27-03):
  //     ACP client (line-delimited JSON-RPC over stdio for Gemini /
  //     Cursor / Copilot / Qwen) + ASP client (Codex App Server Protocol)
  //     + spawn-cmd (Windows .cmd EINVAL fix per D-04) + broker-lifecycle
  //     (long-lived per `(peer, workspace)` per D-03). Wave B (27-04,
  //     27-05): 5 per-peer thin adapters + central registry dispatch +
  //     `reference/peer-cli-capabilities.md` capability matrix (D-05).
  //     Wave C (27-06..27-08): agent frontmatter `delegate_to:` (additive
  //     D-06) + session-runner peer-first dispatch + Phase 23.5 bandit
  //     posterior `delegate?` context dimension (D-08) + Phase 22 event
  //     chain `runtime_role: host|peer` + `peer_id` + `peer_call_*`
  //     events (D-09). Wave D (27-09..27-11): `/gdd:peers` capability
  //     matrix command (D-10) + `peer-cli-customize` + `peer-cli-add`
  //     skills + `peerBinary` field on runtimes.cjs + install-time peer-
  //     detection nudge (opt-in per D-11). Closeout (27-12) shipped 2
  //     new tests (peer-cli-end-to-end + phase-27-baseline) + version-
  //     agnostic baseline refactor of phase-2{4,5,6}-baseline tests
  //     (Phase 26 lesson per D-12) + manifests + CHANGELOG + ops guide
  //     `docs/PEER-DELEGATION.md` + `reference/peer-protocols.md`
  //     ACP+ASP cheat sheet + `NOTICE` Apache-2.0 attribution for
  //     cc-multi-cli (D-14) + `test-fixture/baselines/phase-27/`.
  '1.27.0',
  '1.27.1',
]);

test('semver-compare: consecutive versions in sequence are exact patch bumps', () => {
  for (let i = 1; i < EXPECTED_SEQUENCE.length; i++) {
    const from = EXPECTED_SEQUENCE[i - 1];
    const to = EXPECTED_SEQUENCE[i];
    assert.ok(
      isExactPatchBump(from, to),
      `Version jump from ${from} to ${to} is not an exact patch bump (+0.0.1)`
    );
  }
});

test('semver-compare: plugin.json version is in expected sequence', () => {
  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const accepted = EXPECTED_SEQUENCE.includes(pluginJson.version)
    || OFF_CADENCE_VERSIONS.has(pluginJson.version);
  assert.ok(
    accepted,
    `plugin.json version "${pluginJson.version}" is not in expected sequence ${EXPECTED_SEQUENCE.join(' → ')} ` +
      `and is not a recognized off-cadence version (${[...OFF_CADENCE_VERSIONS].join(', ')})`
  );
});

test('semver-compare: plugin.json and marketplace.json versions match', () => {
  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  );
  const marketplaceJson = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8')
  );
  // marketplace.json stores version under metadata.version
  const marketplaceVersion = marketplaceJson.metadata
    ? marketplaceJson.metadata.version
    : marketplaceJson.version;
  assert.equal(
    pluginJson.version,
    marketplaceVersion,
    `plugin.json (${pluginJson.version}) and marketplace.json (${marketplaceVersion}) versions must match`
  );
});
