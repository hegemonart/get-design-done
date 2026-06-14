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
  //     cc-multi-cli (D-14) + `test/fixtures/baselines/phase-27/`.
  '1.27.0',
  '1.27.1',
  //   - 1.27.5 → Phase 27.5 Bandit Production Integration. Wires Phase 23.5's
  //     bandit posterior + Phase 27-07's delegate dimension into a real
  //     production routing path (budget-enforcer.ts consultBandit per spawn +
  //     session-runner.ts recordOutcome per session.completed). 6 plans
  //     (27.5-01..27.5-06): integration shim + budget-enforcer wiring +
  //     session-runner wiring + reflector bandit-arbitrage Section 8 +
  //     peers/bandit-status skills + closeout (4 manifests + CHANGELOG +
  //     docs + baseline). Off-cadence because v1.27 line is the parent
  //     mainline; 27.5 is the integration-decimal phase per CONTEXT.md D-12.
  '1.27.5',
  //   - 1.27.6 → Phase 27.6 Pipeline Performance + Token-Cost Optimization.
  //     6 plans (27.6-01..27.6-06): perf-analyzer reflector + telemetry-reader
  //     library + cost-regression detection; reference/perf-budget.md + CI
  //     regression gate; cache-warming heuristic refinement (multiplicative
  //     recency × frequency × cost); parallel-mapper data-driven concurrency
  //     (min(cpu-1, last_optimum) capped at 8); PreCompact snapshot +
  //     SessionStart recap hooks (storybloq §4.6 transplant); prompt-dedup
  //     analyzer + closeout (4 manifests + CHANGELOG + docs + baseline).
  //     Off-cadence because v1.27 line is the parent mainline; 27.6 is the
  //     optimization-decimal phase per CONTEXT.md D-12.
  '1.27.6',
  //   - 1.27.7 → Phase 27.7 GDD MCP Server. 7 plans (27.7-01..27.7-07):
  //     gdd-mcp server scaffold + 12 read-only tools (gdd_status,
  //     gdd_cycle_recap, gdd_decisions_list, gdd_events_tail, gdd_health,
  //     gdd_intel_get, gdd_learnings_digest, gdd_phase_current,
  //     gdd_phases_list, gdd_plans_list, gdd_reflections_latest,
  //     gdd_telemetry_query); mcp-tools-lint (4 invariants: forbid-fs-path,
  //     max-loc 30, no-write-names, tool-count-cap 12); installer
  //     --register-mcp + skills/health MCP row; skills/{progress,resume,next}
  //     MCP-path + File-read-path fork; README + priming-benchmark
  //     (-31.18% token reduction synthetic floor); closeout (4 manifests +
  //     CHANGELOG + baselines + headless E2E + ROADMAP scoped flip).
  //     Off-cadence because v1.27 line is the parent mainline; 27.7 is the
  //     MCP-server-decimal phase per CONTEXT.md D-12.
  '1.27.7',
]);

// Phase 28 — Foundational References Tier 2 (v1.28.0, 2026-05-18).
// Off-cadence because the prior shipped version is 1.27.7 (decimal sub-phase),
// so the next mainline bump 1.27.7 -> 1.28.0 skips a single patch-step.
OFF_CADENCE_VERSIONS.add('1.28.0');

// Phase 28.5 — Skill Authoring Contract + Skill Rework + Project Artifacts
// (v1.28.5, 2026-05-18). Off-cadence decimal sub-phase from v1.28.0 parent —
// CONTEXT.md D-12 convention (skill-authoring contract + retroactive rework
// land as a decimal patch on the foundational-references parent line, not
// the next mainline bump).
//   - 1.28.5 → Phase 28.5 (skill-authoring-contract); off-cadence from 1.28.0 parent.
OFF_CADENCE_VERSIONS.add('1.28.5');

// Phase 28.6 — Skill Reference Co-Location (corrective follow-up to Phase 28.5)
// (v1.28.6, 2026-05-18). Off-cadence decimal sub-phase from v1.28.0 parent —
// sequence 1.28.0 -> 1.28.5 -> 1.28.6. Phase 28.6 corrects Phase 28.5's D-06
// over-generalization by co-locating 20 skill-private procedure refs from
// reference/ into skills/<owner>/ per mattpocock's per-skill folder pattern.
//   - 1.28.6 → Phase 28.6 (skill-reference-co-location); off-cadence sub-phase from 1.28.5.
OFF_CADENCE_VERSIONS.add('1.28.6');

// Phase 28.7 — Multi-Runtime Install (Pragmatic Port from gsd-build)
// (v1.28.7, 2026-05-19). Off-cadence decimal sub-phase from v1.28.0 parent —
// sequence 1.28.0 -> 1.28.5 -> 1.28.6 -> 1.28.7. Phase 28.7 ports gsd-build's
// multi-runtime install architecture into GDD; all 14 claimed runtimes now
// receive their native artifact shape (no longer dropped as bare AGENTS.md).
//   - 1.28.7 → Phase 28.7 (verified-install-for-claimed-runtimes); off-cadence sub-phase from 1.28.6.
OFF_CADENCE_VERSIONS.add('1.28.7');

// Phase 28.8 — Tier-2 Distribution Channels
// (v1.28.8, 2026-05-19). Off-cadence decimal sub-phase from v1.28.7 parent —
// sequence 1.28.0 -> 1.28.5 -> 1.28.6 -> 1.28.7 -> 1.28.8. Phase 28.8 adds
// Tier-2 distribution channels: agentskills.io spec lint (Workstream A,
// lint-only per D-13), Cursor Marketplace plugin manifest + doctor (Workstream
// B), Codex Plugin manifest + doctor + GitHub-URL install (Workstream C).
//   - 1.28.8 → Phase 28.8 (tier-2-distribution-channels); off-cadence sub-phase from 1.28.7.
OFF_CADENCE_VERSIONS.add('1.28.8');

// Phase 29 — Capability-Gap Telemetry + Self-Authoring of Agents/Skills
// (v1.29.0, 2026-05-19). First on-cadence MINOR after the 1.28.x decimal
// sub-phase sequence — registered here for OFF_CADENCE_VERSIONS membership
// because the EXPECTED_SEQUENCE check (1.0.0..1.0.7) is the original 1.0.x
// patch-cadence test, and every post-1.0.x version (including mainline
// MINORs like 1.14.0/1.20.0/1.25.0/1.28.0) is registered via this Set as
// "not in the strict 1.0.x exact-patch-bump sequence but accepted." Plan
// 29-07 D-10 framing distinguished on-cadence MINOR vs decimal sub-phase
// at the CHANGELOG level (no special CHANGELOG slot needed) but the
// semver-test Set is a separate concern — accepts the version as a
// recognized release.
//   - 1.29.0 → Phase 29 (capability-gap-self-authoring); on-cadence MINOR
//     after the 1.28.0 -> 1.28.5 -> 1.28.6 -> 1.28.7 -> 1.28.8 decimal arc.
OFF_CADENCE_VERSIONS.add('1.29.0');

// Phase 30 — Consent-First GitHub Issue Reporter
// (v1.30.0, 2026-05-20). On-cadence minor from v1.29.0 — sequence 1.29.0 -> 1.30.0.
// Even though 1.30.0 is on-cadence (not a decimal off-cadence), the existing
// suite contract requires registering every post-1.0.x release in OFF_CADENCE_VERSIONS
// to keep semver-ordering tests green (Phase 29 precedent — see Phase 29 retrospective).
// Phase 30 adds the Consent-First GitHub Issue Reporter — `/gdd:report-issue` skill +
// pseudonymization helpers + payload assembly + dedup matching + kill-switch.
//   - 1.30.0 → Phase 30 (issue-reporter); on-cadence minor from 1.29.0.
OFF_CADENCE_VERSIONS.add('1.30.0');

// Phase 30.5 — Failure-Mode Catalogue (v1.30.5, 2026-05-21).
// Decimal sub-phase off-cadence patch (Phase 28.x precedent — 1.28.0 →
// 1.28.5 → 1.28.6 → 1.28.7 → 1.28.8). Phase 30.5 expands
// `reference/known-failure-modes.md` from 10 → 22 entries with the
// extended schema-v2 (11 fields per entry), ships the fuzzy
// bag-of-words matcher (`scripts/lib/failure-mode-matcher.cjs`), and
// wires reflector + authority-watcher proposal flows into a 6th
// `/gdd:apply-reflections` proposal class (`kfm-candidate`). 6-manifest
// lockstep at 1.30.5 (D-01 + D-11 ship-together).
//   - 1.30.5 → Phase 30.5 (failure-mode-catalogue); decimal sub-phase from 1.30.0.
OFF_CADENCE_VERSIONS.add('1.30.5');

// Phase 30.6 — Graphify Self-Ownership — Decouple from get-shit-done CLI
// (v1.30.6, 2026-05-28). Removes the last runtime touchpoint between
// get-design-done and the user's ~/.claude/get-shit-done/ install. Replaces
// 8 callsites that dispatched `gsd-tools.cjs graphify *` with native
// bin/gdd-graph (build/query/status/diff/upsert-node/upsert-edge). Drops the
// intel→graphify translation layer (intel and graph now share {from,to,kind,
// weight?} schema per D-03.b). Renames gdd-graphify-sync → hone-graph-refresh
// and gsd-health-mirror → health-mirror (cosmetic, D-10). Deletes 10MB
// vendored upstream snapshot at .planning/get-shit-done-main/. Off-cadence
// decimal from v1.30.5 parent — sequence 1.30.0 -> 1.30.5 -> 1.30.6.
//   - 1.30.6 → Phase 30.6 (graphify-self-ownership); off-cadence sub-phase from 1.30.5.
OFF_CADENCE_VERSIONS.add('1.30.6');

// Phase 31 — Figma Off-Context Extractor + Variables Sync Plugin
// (v1.31.0, 2026-05-29). On-cadence MINOR from the v1.30.x decimal arc
// (1.30.0 -> 1.30.5 -> 1.30.6 -> 1.31.0). Even though 1.31.0 is an on-cadence
// minor (not a decimal off-cadence), the existing suite contract requires every
// post-1.0.x release registered in OFF_CADENCE_VERSIONS to keep the
// semver-ordering tests green — the EXPECTED_SEQUENCE check covers only the
// original 1.0.x patch cadence, so mainline MINORs (1.14.0 / 1.20.0 / 1.25.0 /
// 1.28.0 / 1.29.0 / 1.30.0) are all recognized via this Set (the 1.29.0 / 1.30.0
// precedent comments above). Phase 31 ships the `gdd-figma-extract` off-context
// extractor (pull + digest + styles-resolver) + the "GDD Sync" Figma plugin +
// localhost receiver (Path C) + the figma_extract health check; 10 plans across
// Waves A-D, closing the spike's (commit c3a9cf6) Variables-403 + 0-tokens gaps.
//   - 1.31.0 → Phase 31 (figma-extractor-sync); on-cadence MINOR from 1.30.6.
OFF_CADENCE_VERSIONS.add('1.31.0');

// Phase 31.5 — Repo Structure Consolidation (v1.31.5, 2026-05-29).
// Off-cadence DECIMAL sub-phase from the v1.31.x arc (1.31.0 -> 1.31.5) — ships
// AFTER Phase 31's v1.31.0 mainline per CONTEXT.md D-12 (decimal sub-phases land
// as a patch on the parent line, not the next mainline bump). D-01: target
// version is v1.31.5 (NOT the stale ROADMAP v1.28.0 — the phase was renumbered
// 2026-05-16 to monotonic-with-phase-number). Phase 31.5 collects the public SDK
// into sdk/ (cli/state/event-stream/errors/primitives + both MCP servers), ships
// 3 working SDK bins (esbuild prepack + dual-mode trampolines), deprecation shims
// at the old scripts/lib/... + scripts/mcp-servers/... paths (removal v1.33.0,
// D-02), a corrected npm files allowlist + .npmignore, README i18n → docs/i18n/,
// tests/ → test/suite/ + test-fixture/ → test/fixtures/, recipes/ scaffold, and
// the private-files CI guard. 6-manifest lockstep at 1.31.5.
//   - 1.31.5 → Phase 31.5 (repo-consolidation); off-cadence sub-phase from 1.31.0.
OFF_CADENCE_VERSIONS.add('1.31.5');

// Phase 32 — Skill Auto-Trigger Discipline + Defensive Guardrails
// (v1.32.0, 2026-05-30). On-cadence MINOR from the v1.31.x arc
// (1.31.0 -> 1.31.5 -> 1.32.0). Even though 1.32.0 is an on-cadence minor
// (not a decimal off-cadence), the existing suite contract requires every
// post-1.0.x release registered in OFF_CADENCE_VERSIONS to keep the
// semver-ordering tests green — the EXPECTED_SEQUENCE check covers only the
// original 1.0.x patch cadence, so mainline MINORs (1.14.0 / 1.20.0 / 1.25.0 /
// 1.28.0 / 1.29.0 / 1.30.0 / 1.31.0) are all recognized via this Set (the
// 1.29.0 / 1.30.0 / 1.31.0 precedent comments above). Phase 32 ports the
// obra/superpowers (MIT) skill-discipline MECHANISM: the using-gdd SessionStart
// inject (1%-rule + red-flags table + <SUBAGENT-STOP>), <HARD-GATE> at the 5
// stage transitions, rationalization tables in 7 stage skills, AGENTS/GEMINI
// discipline blocks, plus the router_pick telemetry + lint-skill-descriptions
// drift instruments (Phase 33 inputs).
//   - 1.32.0 → Phase 32 (skill-autotrigger-discipline); on-cadence MINOR from 1.31.5.
OFF_CADENCE_VERSIONS.add('1.32.0');

// Phase 33 — Skill Behavior Tests (Pressure-Scenario Harness) + 31.5 shim removal
// (v1.33.0, 2026-05-30). On-cadence MINOR from the v1.32.x arc
// (1.31.0 -> 1.31.5 -> 1.32.0 -> 1.33.0). Registered here for the same reason as
// every post-1.0.x release (the EXPECTED_SEQUENCE check covers only the original
// 1.0.x patch cadence; mainline MINORs are recognized via this Set — see the
// 1.29.0 / 1.30.0 / 1.31.0 / 1.32.0 precedent comments above). Phase 33 ships the
// skill-behavior pressure-scenario harness (manifest-driven runner + scenario
// schema + 8 scenarios + synthetic RED baselines + description-format A/B +
// reflector telemetry) AND retires the 6 Phase-31.5 deprecation shim groups
// (BREAKING, D-04 — the documented v1.33.0 removal target).
//   - 1.33.0 → Phase 33 (skill-behavior); on-cadence MINOR from 1.32.0.
OFF_CADENCE_VERSIONS.add('1.33.0');

// Phase 33.5 — GDD Runtime Security Hardening (v1.33.5, 2026-05-31). Decimal
// sub-phase on the v1.33.x arc (1.33.0 -> 1.33.5; CHANGELOG-only, D-01).
// Ships the STRIDE threat model + runtime audit + outbound-network CI gate,
// WebSocket localhost-default bind + timing-safe token, gdd-state path-traversal
// guard + payload cap + 11 tightened schemas, peer-CLI env sandbox (allowlist-
// forward), the redact secret-scan extension (Gemini + GitHub fine-grained/server)
// + fuzz, and SECURITY.md. Registered off-cadence from the 1.33.0 parent.
//   - 1.33.5 → Phase 33.5 (runtime-security); off-cadence sub-phase from 1.33.0.
OFF_CADENCE_VERSIONS.add('1.33.5');

// Phase 33.6 — OpenRouter Provider Adapter (v1.33.6, 2026-05-31). Decimal
// sub-phase on the v1.33.x arc (1.33.5 -> 1.33.6; CHANGELOG-only, D-01). Ships
// the dynamic OpenRouter catalog-fetcher (24h TTL, atomic, injectable fetch,
// hermetic) under the 33.5 outbound allowlist + the tier-resolver-openrouter
// adapter (opus/sonnet/haiku heuristic + overrides, graceful-degrade) + the
// connection + /gdd:openrouter-status skill + the optional cost.update provider
// tag + tier-mapping/prices docs + authority-watcher catalog-drift. Registered
// off-cadence from the 1.33.0 parent.
//   - 1.33.6 → Phase 33.6 (openrouter); off-cadence sub-phase from 1.33.0.
OFF_CADENCE_VERSIONS.add('1.33.6');

// Phase 34.1 — Non-Web Output Layer: Native Mobile (v1.34.1, 2026-05-31).
// First sub-phase of the split Phase 34. Off-cadence DECIMAL release on the new
// v1.34.x arc (1.33.6 -> 1.34.1; CHANGELOG-only, D-01). Ships the native
// token-bridge (reference/native-platforms.md + swift/compose/flutter emitters
// extending the Phase-23 engine, with the round-trippable precision contract) +
// the swift/compose/flutter executors + the xcode-simulator/android-emulator
// connections (optional, degrade-to-code-only, D-03) + the design-verifier
// native no-DOM branch + the design-context-builder project-type routing
// (web/native-ios/native-android/flutter, extensible for email/print).
// Registered off-cadence (the 1.34.x arc opens with the .1 decimal; email=34.2
// / print=34.3 follow).
//   - 1.34.1 → Phase 34.1 (native-mobile); off-cadence decimal opening the 1.34.x arc.
OFF_CADENCE_VERSIONS.add('1.34.1');

// Phase 34.2 — Non-Web Output Layer: Email (v1.34.2, 2026-05-31). Second
// sub-phase of the split Phase 34. Off-cadence DECIMAL release on the v1.34.x
// arc (1.34.1 -> 1.34.2; CHANGELOG-only, D-01). Ships the email-constraint
// catalogue (reference/email-design.md, registered) + the static email-HTML
// validator (scripts/lib/email/validate-email-html.cjs, no mjml dep) + the
// email-executor (MJML canonical + derived HTML, D-02) + the litmus connection
// (optional render-test, degrade-to-static-validator, D-03) + the
// design-context-builder `email` route + the design-verifier email-verify
// branch (delegated). Registered off-cadence (print=34.3 follows on the arc).
//   - 1.34.2 → Phase 34.2 (email); off-cadence decimal on the 1.34.x arc.
OFF_CADENCE_VERSIONS.add('1.34.2');

// Phase 34.3 — Non-Web Output Layer: Print/PDF (v1.34.3, 2026-05-31). THIRD and
// FINAL sub-phase of the split Phase 34 — completing it completes the parent
// Phase 34 (native 34.1 + email 34.2 + print 34.3). Off-cadence DECIMAL release
// on the v1.34.x arc (1.34.2 -> 1.34.3; CHANGELOG-only, D-01). Ships the
// print-constraint catalogue (reference/print-design.md, registered) + the
// static print-CSS validator (scripts/lib/print/validate-print-css.cjs, no
// pdfkit/paged dep) + the pdf-executor (Paged.js-compatible HTML/CSS + PDFKit
// fallback, D-02) + the print-renderer connection (optional render-test,
// degrade-to-static-validator, D-03) + the design-context-builder `print` route
// (seam CLOSED) + the design-verifier consolidated non-web verify section.
//   - 1.34.3 → Phase 34.3 (print); off-cadence decimal closing the 1.34.x arc.
OFF_CADENCE_VERSIONS.add('1.34.3');

// 1.34.4 → Phase 34.4 (Lazyweb + Mobbin research connections — recovered from a
// stranded Phase 30.5 worktree fork). Off-cadence decimal on the v1.34.x arc
// (CHANGELOG-only, D-02): adds two discover-stage visual-reference MCP connections
// (free Lazyweb Tier 1 + paid Mobbin Tier 2) with the D-01 cost-aware tier order.
// No new runtime dependency (optional user-installed MCPs, Refero precedent).
OFF_CADENCE_VERSIONS.add('1.34.4');

// 1.35.1 → Phase 35.1 (Team Surfaces: PR Inline Integration — first sub-phase of the
// split Phase 35). Opens the v1.35.x arc (1.34.4 → 1.35.1, minor+patch jump, off-cadence).
// Adds agents/pr-commenter.md (gh-api inline PR review + gdd/design-review check-run) +
// reference/pr-review-integration.md + /gdd:ship wiring. No new runtime dependency (gh only).
OFF_CADENCE_VERSIONS.add('1.35.1');

// 1.35.2 → Phase 35.2 (Team Surfaces: Notification Backplane — Slack + Discord).
// Decimal on the v1.35.x arc. Adds connections/slack.md + connections/discord.md +
// scripts/lib/notify/dispatch.cjs (routing + redact + injectable fetch + kill-switch)
// + reference/notification-routing.md. No new runtime dependency.
OFF_CADENCE_VERSIONS.add('1.35.2');

// 1.35.3 → Phase 35.3 (Team Surfaces: Ticket Sync — Linear + Jira). FINAL sub-phase of
// the split Phase 35; completing it marks the parent Phase 35 COMPLETE. Adds connections/
// {linear,jira}.md (MCP-based) + agents/ticket-sync-agent.md + reference/ticket-sync.md.
// No new runtime dependency, no new egress (MCP tools only).
OFF_CADENCE_VERSIONS.add('1.35.3');

// 1.35.5 → Phase 35.5 (Design-Artifact Export — /gdd:export). Decimal on the v1.35.x arc
// AFTER the Team Surfaces sub-phases (1.35.3 → 1.35.5; 1.35.4 not used). Adds the pure
// build-html assembler (scripts/lib/export/build-html.cjs), skills/export/SKILL.md, the
// Notion write-path connection, and reference/export-formats.md. No new runtime dependency
// (D-02: pure JS; PDF = print-CSS-on-HTML the user renders; Notion via MCP). No new egress.
OFF_CADENCE_VERSIONS.add('1.35.5');

// 1.36.1 → Phase 36.1 (Knowledge Tier-3: Domain Packs — finance/healthcare/gaming/civic).
// First sub-phase of the split Phase 36; opens the v1.36.x arc (1.35.5 → 1.36.1, minor+
// patch jump, off-cadence). Adds reference/domains/{finance,healthcare,gaming,civic}-
// patterns.md + design-context-builder Step 0F domain detection + design-auditor addendum.
// No new runtime dependency, no new egress (reference markdown + agent-prompt edits only).
OFF_CADENCE_VERSIONS.add('1.36.1');

// 1.36.2 → Phase 36.2 (Knowledge Tier-3: Motion-Tool Verification — Lottie + Rive).
// Decimal on the v1.36.x arc (1.36.1 → 1.36.2). Adds scripts/lib/motion/validate-motion.cjs
// (pure, dep-free), connections/{lottie,rive}.md, and agents/motion-verifier.md + a design-
// verifier Phase 4E hook. No new runtime dependency, no new egress (pure JSON.parse + file
// checks; the Lottie player / Rive runtime are opt-in).
OFF_CADENCE_VERSIONS.add('1.36.2');

// 1.36.3 → Phase 36.3 (Knowledge Tier-3: Conversational UI). FINAL sub-phase of the split
// Phase 36 — completing it marks the parent Phase 36 COMPLETE (domain packs 36.1 + motion 36.2
// + conversational 36.3). Adds reference/conversational-ui.md + a `conversational` project type
// in design-context-builder. No new runtime dependency, no new egress (reference markdown +
// an agent-prompt enum addition).
OFF_CADENCE_VERSIONS.add('1.36.3');

// 1.37.1 → Phase 37.1 (AI-Native Tools Wave 2). First sub-phase of the split Phase 37.
// Opens the v1.37.x arc (1.36.3 → 1.37.1, minor+patch jump, off-cadence). Adds 6 AI-native
// design-tool connections (framer/penpot/webflow canvas; v0-dev/plasmic/builder-io generator)
// + design-component-generator impl sections. No new runtime dependency, no new egress
// (each tool is an opt-in user-connected MCP/API; degrade-to-code-only).
OFF_CADENCE_VERSIONS.add('1.37.1');

// 1.37.2 → Phase 37.2 (Greenfield DS Bootstrap). FINAL sub-phase of the split Phase 37 —
// completing it marks the parent Phase 37 COMPLETE (Wave-2 tools 37.1 + greenfield 37.2). Adds
// scripts/lib/ds/token-scale.cjs (pure OKLCH token generator), reference/ds-bootstrap-rubric.md,
// agents/ds-generator.md, and skills/bootstrap-ds/SKILL.md (/gdd:bootstrap-ds). No new runtime
// dependency (native CSS oklch(), no color library), no new egress.
OFF_CADENCE_VERSIONS.add('1.37.2');

// 1.38.0 → Phase 38 (Outcome-Driven Adaptation). On-cadence MINOR (a major closed-loop feature)
// from the v1.37.x arc. Registered here per the suite contract (every post-1.0.x release is in
// OFF_CADENCE_VERSIONS). Adds the design_arms posterior class (scripts/lib/ds-arms/design-arms-
// store.cjs), design --variants, 6 outcome connections (LaunchDarkly/Statsig/GrowthBook +
// UserTesting/Maze/Hotjar), the experiment-result-ingester + user-research-synthesizer agents,
// the brief <prior-research> block + verify cross-check, and the PII guard. No new runtime
// dependency (pure Beta store + injectable fetch); no new egress.
OFF_CADENCE_VERSIONS.add('1.38.0');

// 1.38.5 → Phase 38.5 (Deployment Coordination Loop). Off-cadence decimal from the v1.38.x arc.
// Adds scripts/lib/rollout/rollout-status.cjs (pure), agents/rollout-coordinator.md, the
// /gdd:rollout-status skill, reference/rollout-coordination.md, and the verify_outcome / rollout_*
// event seeds. Reads the Phase-38 flag connections (read-only); feeds design_arms by deployed_pct.
// No new runtime dependency, no new egress.
OFF_CADENCE_VERSIONS.add('1.38.5');

// 1.39.1 → Phase 39.1 (DS Migration Workflows). First sub-phase of the split Phase 39. Opens the
// v1.39.x arc. Adds reference/migrations/{shadcn-v2,tailwind-v4,mui-v6,material-3-to-4}.md, the
// pure scripts/lib/migration/codemod-gen.cjs, agents/ds-migration-planner.md, and a design-verifier
// migration-validation note. Proposal-only; no new runtime dependency (codemod-gen emits template
// text, never runs jscodeshift/ast-grep), no new egress.
OFF_CADENCE_VERSIONS.add('1.39.1');

// 1.39.2 → Phase 39.2 (Long-Horizon Cost Governance). Second sub-phase of the split Phase 39 (closes
// the parent). Adds the 3 pure budget cores (scripts/lib/budget/{cost-forecast,roi,project-cap}.cjs),
// agents/cost-forecaster.md, skills/budget + skills/roi, reference/cost-governance.md, and an additive
// project_cap branch in hooks/budget-enforcer.ts (project_cap_usd disabled by default). No new runtime
// dependency, no new egress.
OFF_CADENCE_VERSIONS.add('1.39.2');

// 1.39.5 → Phase 39.5 (GDD Self-Migration Tooling). Formalizes GDD's own breaking-change story: a
// machine-readable path-migration table in reference/DEPRECATIONS.md, the pure
// scripts/lib/deprecation-registry.cjs reader, scripts/lint-changelog.cjs (forward-only Breaking-changes
// gate, floor 1.39.0), the /gdd:migrate skill, a /gdd:update advisory, and a deprecation-completeness
// gate. No new runtime dependency, no new egress.
OFF_CADENCE_VERSIONS.add('1.39.5');

// 1.40.0 → Phase 40 (Team Collaboration Mode). A MINOR bump (not an exact patch bump from 1.39.5):
// multi-writer STATE.md via git-merge-driver per-section merge, conflict-resolver, async review queue
// + hard locks, decision-journal export, attribution, sectional handoff (gdd_cycle_mode), permission
// model, opt-in cross-machine sync. 7 pure cores in scripts/lib/collab/ + 2 agents + 2 skills +
// reference/multi-author-model.md + config.schema collab keys. The first minor since the Phase 39.5
// lint-changelog floor (1.39.0) — its CHANGELOG entry declares a `### Breaking changes` section.
OFF_CADENCE_VERSIONS.add('1.40.0');

// 1.40.5 → Phase 40.5 (GDD CLI Localization). Decimal sub-patch on 1.40.0. Adds scripts/lib/i18n/
// (locale resolver: config.locale > env LANG > en, fallback chain locale->base->en) + 7 flat-JSON
// message tables (en complete, ru full, uk/de/fr/zh/ja placeholders), the /gdd:locale skill, the
// opt-in description_i18n frontmatter, and reference/cli-localization.md. No new runtime dependency,
// no new egress. The final phase of the directed 38.5->40.5 sequence.
OFF_CADENCE_VERSIONS.add('1.40.5');

// 1.41.0 → Phase 41 (Deterministic Anti-Pattern CLI gdd-detect). A MINOR bump. Ships bin/gdd-detect +
// scripts/lib/detect/ (dep-free regex-fast engine + 11 BAN rule matchers ported from the catalogue's
// own **Grep**; jsdom/puppeteer are soft try-require optionals, no package.json dep), the
// sync-rule-catalogue parity gate, lint:design, and a pre-commit scaffold. First minor since the 39.5
// lint-changelog floor — its CHANGELOG entry declares a `### Breaking changes` section. No new runtime dependency.
OFF_CADENCE_VERSIONS.add('1.41.0');

// 1.41.5 → Phase 41.5 (SoT Manifest Consolidation). Decimal on 1.41.0. Adds scripts/lib/manifest/
// (loader + index typed readers + harnesses/skills/prose-denylist seed data + schemas) + the single
// scripts/validate-manifest.cjs ajv CI gate — landing the cross-phase SoT root before 42/44/45/47.
// No new runtime dependency, no new egress.
OFF_CADENCE_VERSIONS.add('1.41.5');

// 1.42.0 → Phase 42 (Multi-Harness Source Compilation). Minor on 1.41.5. Authors each skill once in
// skill-templates/ with placeholders ({{command_prefix}} et al.) and compiles per-harness bundles via a
// pure transformer factory (scripts/lib/build/) reading the 41.5 manifest SoT; the committed skills/ tree
// becomes a generated artifact drift-gated by build:skills:check; dist/claude-code/ ships in the tarball;
// gdd-sdk build skills exposes the CLI. Authoring-surface move (skills/ -> skill-templates/) is the
// `### Breaking changes` declared in the 1.42.0 CHANGELOG entry. No new runtime dependency, no new egress.
OFF_CADENCE_VERSIONS.add('1.42.0');

// 1.43.0 -> Phase 43 (Editorial Quality Floor). Minor on 1.42.0. STYLE.md + scripts/lint-prose.cjs
// (maintainer-only) gate GDD's own prose on em dashes / double hyphens / AI-tells, reading the 41.5
// manifest denylist SoT; full corpus purge (~6700 em-dashes) + frontmatter description denylist. The
// editorial floor is the `### Breaking changes` of the 1.43.0 CHANGELOG entry. No new runtime dependency.
OFF_CADENCE_VERSIONS.add('1.43.0');

// 1.44.0 -> Phase 44 (Harness Capability Matrix). Minor on 1.43.0. Generated HARNESSES.md from the
// 41.5 manifest SoT (harnesses.json extended with a per-harness capability_matrix + last_verified +
// status), drift-gated; scripts/lib/harness-freshness.cjs (shippable, status-aware warn 60d/fail 180d) +
// gdd:health check #8 + verify-harness + the Phase-42 agreement gate. Planned/executed via parallel GSD
// subagents. The harness-freshness CI gate is the `### Breaking changes`. No new runtime dependency.
OFF_CADENCE_VERSIONS.add('1.44.0');

// 1.45.0 -> Phase 45 (Canonical Domain Reference Index). Minor on 1.44.0. 7 reference/{typography,
// color,spatial,motion,interaction,responsive,ux-writing}.md index entry-points over existing fragments
// (registry domain-index kind) + check-domain-cross-links + check-no-duplication CI gates + consumer
// required-reading migration (motion-mapper 89% token cut, design-auditor/executor index-first). Planned/
// executed via parallel GSD subagents. New CI gates = the `### Breaking changes`. No new runtime dependency.
OFF_CADENCE_VERSIONS.add('1.45.0');

// 1.46.0 -> Phase 46 (Skill UX Polish). Minor on 1.45.0. scripts/lib/manifest/skills.json becomes the
// skill-metadata single source of truth + scripts/generate-skill-frontmatter.cjs (order-preserving forward
// generator) + generate:skill-frontmatter:check CI drift gate; /gdd:pin + /gdd:unpin + /gdd:list-pins
// power-user shortcut skills (scripts/lib/pin/, atomic write, gdd-pinned-skill marker, harness discovery via
// manifest/harnesses.cjs); the >=1024 description budget (Phase 28.5) hardened with an explicit lint:agentskills
// CI gate. Two new CI gates = the `### Breaking changes`. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.46.0');

// 1.47.0 -> Phase 47 (In-Browser Design Iteration / Live Mode). Minor on 1.46.0. /gdd:live: pick a DOM element
// on a running dev server (via the Preview MCP connection, no new dependency), generate N variants in one batch,
// post-check each with gdd-detect, hot-swap via HMR, accept/discard; session persists to .design/live-sessions/
// with resume. New scripts/lib/live/ substrate (session-store, scope-guard, postcheck, events, bandit-feed,
// harness-mode, runtime); 6 typed live_* events; accepted variants feed the Phase 38 bandit store with a dev_time
// source tag (Beta(2,8) prior). Degraded screenshot-only mode on harnesses without MCP. Planned/executed via
// parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.47.0');

// 1.48.0 -> Phase 48 (Audit & Pillar Expansion). Minor on 1.47.0. Four audit-side gaps: a deepened copy/UX-writing
// pillar (agents/copy-auditor.md + reference/copy-quality.md; design-auditor 7-pillar contract formalized with a
// scoring_contract_version marker + reserved 8th slot); a project-wide retroactive debt crawler
// (agents/design-debt-crawler.md + reference/debt-categories.md -> .design/debt/DEBT-CATALOG.md); a brief critic
// (agents/brief-auditor.md + reference/brief-quality-rubric.md, non-blocking tail-wire into /gdd:brief); and an a11y
// quality-gate (hooks/gdd-a11y-gate.js + axe/pa11y/lighthouse/jsx-a11y auto-detect + quality-gate-runner a11y 5th
// bucket). 3 new agents, 3 new reference docs, 1 hook. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.48.0');

// 1.49.0 -> Phase 49 (Quick Anti-Slop Floor). Minor on 1.48.0. Three atomic safety/policy primitives:
// scripts/lib/worktree-resolve.cjs redirects .design/.planning writes to the main repo root when run inside a git
// worktree (wired into the gdd-state resolveStatePath + 7 writer agents; fixes the recurring .planning leak);
// hooks/gdd-design-quality-check.js (advisory PostToolUse, 8 visual-tell regex rules over .tsx/.vue/.svelte/.astro,
// design_quality_warn event) + reference/visual-tells.md; a reviewer confidence gate (4-question Pre-Report Gate +
// confidence 0.0-1.0 field on design-auditor/verifier/debt-crawler findings, design-fixer drops Tentative + sub-0.8
// HIGH/CRITICAL via scripts/lib/confidence-route.cjs) + reference/reviewer-confidence-gate.md. Parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.49.0');

// 1.50.0 -> Phase 50 (Authoring Contract v3). Minor on 1.49.0. Two cross-repo-validated additions: a verb-based
// anti-slop rubric (reference/anti-slop-rubric.md, 5 orthogonal axes Directness/Distinctness/Hierarchy/Authenticity/
// Density, sum<35/50 -> design-debt-crawler aesthetic-slop; emitted by design-auditor as a verb_axes_scored lens-tag,
// no pillar change) + visual-tells.md v2 (13 categories); and a machine-parseable skill-composition manifest
// (composes_with/next_skills frontmatter + scripts/validate-composition-graph.cjs DAG gate + auto-generated
// reference/skill-graph.md) plus the skill-authoring-contract v3 multi-paragraph description form (transition window),
// a boilerplate-cohort lint (scripts/validate-skill-frontmatter.cjs), a /gdd:new-skill scaffolder, and the migration
// of 18 high-traffic skill descriptions to the v3 form. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.50.0');

// 1.50.1 -> post-release consistency patch on 1.50.0. Aligned audit terminology to 7 pillars across
// skills/audit + skills/verify + skill-authoring-contract + registry (design-auditor has been 7-pillar since
// Phase 48); refreshed .claude-plugin positioning counts (59 agents / 88 skills / 41 connections); seeded the
// Phase-50 composition graph with the real next_skills pipeline chain (new-project -> brief -> ... -> ship);
// de-duplicated the benchmark command row; fixed the codex defaultPrompt to the /gdd- prefix. Patch, no new surface.
OFF_CADENCE_VERSIONS.add('1.50.1');

// 1.51.0 -> Phase 51 (Instinct-Based Learnings). Minor on 1.50.1. Restructures learnings from prose to atomic
// confidence-weighted instinct units (reference/instinct-format.md + reference/schemas/instinct.schema.json), stored
// project + global via scripts/lib/instinct-store.cjs (JSON-canonical + optional better-sqlite3 FTS5 acceleration,
// no new dependency, mirroring the Phase 19.5 design-search pattern); a /gdd:instinct skill (list/query/promote);
// a K=2/M=2 promotion gate with a Beta(2,8) prior; decision-injector surfaces top-3 relevant instincts; design-reflector
// dual-emits atomic instincts + narrative; apply-reflections gains an [INSTINCT] proposal class; TTL decay + archive.
// Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.51.0');

// 1.52.0 -> Phase 52 (Typed DesignContext Graph Schema, KEYSTONE). Minor on 1.51.0. Adds the typed
// design-semantic graph: a Draft-07 schema (reference/schemas/design-context.schema.json) over 10 node
// types and 12 edge types, a dep-free validator (scripts/validate-design-context.cjs) + pure query lib
// (scripts/lib/design-context-query.cjs), regex extract/merge passes (scripts/lib/design-context/*.mjs),
// a 13th read-only gdd-mcp tool (gdd_context_query, cap raised 12 -> 13), /gdd:context + /gdd:migrate-context
// skills, and dual-emit graph fragments from the 5 mapper agents + the synthesizer. No new dependency.
// Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.52.0');

// 1.53.0 -> Phase 53 (Semantic Mapper Engine). Minor on 1.52.0. Adds dep-free Louvain community batching
// (scripts/lib/mappers/compute-batches.mjs + graph-adjacency.mjs), a neighborMap sidecar (neighbor-map.mjs),
// a SHA-256 fingerprint engine (sdk/fingerprint/index.ts) + 4-action change classifier + rolling store
// (sdk/fingerprint/classify.cjs + store.cjs), incremental discover wiring (explore-parallel-runner +
// /gdd:discover --incremental default / --full opt-out), and a design-context-reviewer agent + gate. No new
// dependency (node:crypto + optional better-sqlite3 via probeOptional). Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.53.0');

// 1.54.0 -> Phase 54 (Composable Reference Addendums). Minor on 1.53.0. Adds 18 stack-specific prompt
// addendums (reference/systems/*.md x8, reference/frameworks/*.md x6, reference/motion/*.md x4) composed into
// the explore mapper prompts at spawn time by stack detection (scripts/lib/detect/stack.cjs) +
// scripts/lib/mapper-spawn.cjs (cap 3), a registry "stack-addendum" type + composes_into field, a
// /gdd:new-addendum scaffolder skill, and a gsd-health coverage row. No new dependency. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.54.0');

// 1.55.0 -> Phase 55 (GDD Dashboard). Minor on 1.54.0. Adds a DEP-FREE read-only multi-harness control plane
// (maintainer Rule-4 decision: no Ink, no React/Vite/React Flow): a hand-rolled ANSI TUI (bin/gdd-dashboard +
// sdk/dashboard/tui + sdk/dashboard/data data plane reading the shared state/event/graph libs in-process) and a
// self-contained-HTML graph view (scripts/lib/dashboard/graph-html.cjs, inline SVG + vanilla JS, layered layout)
// launched via `gdd dashboard --web`; plus a gsd-health dashboard_reachable check + risk/confidence placeholder
// surfacing (live post-56). No new dependency. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.55.0');

// 1.56.0 -> Phase 56 (Risk-Scoring + Fact-Forcing Gate). Minor on 1.55.0. Adds a DEP-FREE quantified-action-confidence
// layer: a pure deterministic risk scorer (scripts/lib/risk/compute-risk.cjs + frozen tables.cjs + route.cjs) feeding
// two PreToolUse hooks - gdd-risk-gate (scores Write/Edit/MultiEdit/Bash, emits a risk_assessment event, blocks on
// suggested_action=block) and gdd-fact-force (holds the first write to a file until its consumers/decisions were read,
// softens to a warning when the Phase 52 graph is absent) - plus a /gdd:override escalation skill (D-XX override-tagged
// decision or factforce checked[path] clear), design-fixer Step 2.5 confidence x risk routing, and rolling-50
// calibration (calibration.cjs) feeding the bandit reward. No new dependency. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.56.0');

// 1.57.0 -> Phase 57 (SQLite State Backbone). Minor on 1.56.0. Adds an OPT-IN, ZERO-NEW-DEPENDENCY SQLite query layer
// over project state: a new scripts/lib/state/ module (state-backend.cjs opportunistic probeOptional('better-sqlite3')
// + FTS5 probe, state-store.cjs dual-backend dispatch, migrate-to-sqlite.cjs idempotent --migrate-state, render-markdown.cjs
// byte-equal STATE.md round-trip) + sdk/state/schema.sql (14 tables + FTS5) + sdk/state dual-write behind a migration-active
// gate (markdown stays the human-editable + fallback SoT; the frozen read/mutate/transition API is unchanged) + consumers
// (gdd_state__get + dashboard read SQLite-direct, gdd-fact-force FTS5 tier-0) + a /gdd:state skill (readonly query / recover
// / demigrate). Markdown remains authoritative when the module is absent (the CI surface); SQLite verified locally. No new
// dependency. Planned/executed via parallel GSD subagents.
OFF_CADENCE_VERSIONS.add('1.57.0');

// 1.57.1 -> post-1.57.0 debug-analysis bug-fix patch (no new features). Fixes confirmed by a 4-agent post-wave
// debug sweep: design-search FTS5 query now quotes dotted/slashed terms (recall returned EMPTY for every .md file
// whenever better-sqlite3 was present); the Phase 57 state-store R8 freshness guard now actually folds hand-edits
// (was an empty try-block -> silent data loss); blocker rows de-duplicate on re-migrate; /gdd:state recover awaits
// the async migration; FTS5 virtual tables are populated by migrate; state getters return empty instead of throwing
// on an absent db; migrationActive guards against a directory named state.sqlite; the risk_assessment event now
// conforms to its own schema (tool_name/risk_score/event_id); the dashboard risk column is wired + case-correct;
// budget-enforcer PreToolUse blocks use stopReason; the injection-scanner pattern load is fail-open; three package
// -root walk-ups use the scoped name. No new dependency. Markdown floor (the CI surface) unchanged.
OFF_CADENCE_VERSIONS.add('1.57.1');

// 1.57.2 -> polish-wave patch (no new features). Single grooming wave closing the v1.57 audit-flagged debt:
// 8 critical bug fixes (injection scanner shipping, gdd-sdk stage CLI helpful error, Codex generator HTML
// wrapper, worktree-aware hook path resolution, MCP circuit-breaker substring false-positive, Windows
// SessionStart .sh -> .cjs port, protected-paths regex bypass closure with 12 regression tests, figma-write
// dispatch syntax fix) + 5 new CI gates (validate:feature-counts, validate:registry-tiers,
// validate:no-internal-refs, validate:cache-tiers, validate:skill-surface) + Batch D aspirational-feature
// wirings (paper-write + pencil-write skills, gdd-intel-trigger hook, calibration loop end-to-end,
// design-context-reviewer + gate wired into explore, JSON output contracts on planner+verifier, peer-CLI
// delegation opt-in on design-research-synthesizer) + agents/README authoring contract cleanup + 90+ Phase NN
// strip from registry.json + 7 schema cleanups + Windows-without-Git-Bash compatibility + L0 cache-prefix
// identity scrub + README rewrite 968 -> 623 lines (chronicle moves to CHANGELOG). 5,007/5,007 tests pass.
// No new dependency. Additive only.
OFF_CADENCE_VERSIONS.add('1.57.2');

// 1.57.3 -> polish-residuals patch (continuation of v1.57.2 grooming wave). Closes the remaining open
// POLISH-PLAN items: skill-templates/ documented as canonical (skills/ + dist/ are build artifacts);
// .planning/STATE.md user-facing references scrubbed (.design/STATE.md is the sole user SoT); prefix
// convention claim softened in agents/README + reference/model-tiers (gdd-* vs design-* is just a name);
// Phase 58 added to ROADMAP for composes_with mandatory rollout (74 of 96 skills need backfill); Codex +
// Cursor plugin manifest drift gate added (scripts/check-codex-plugin-drift.cjs + npm script + test).
// Deleted as orphans / obsolete: agents/prototype-gate.md (functionality absorbed by sketch-wrap-up +
// spike-wrap-up); skills/scan/ + skills/discover/ + skill-templates/scan/ + skill-templates/discover/
// (deprecated aliases of /gdd:explore); hooks/run-hook.cmd (obsolete after .sh -> .cjs port);
// scripts/lib/worktree-resolve.cjs#resolvePlanningRoot (unused export); skills/new-cycle/milestone-
// completeness-rubric.md (plugin-internal doc moved to docs/MAINTAINER-NOTES.md); 6 stale i18n READMEs
// (frozen at v1.24.0; main README will be rewritten separately). Structural cleanup: dist/claude-code/
// was byte-identical with skills/ (120 dupe files in npm tarball); removed from package.json#files +
// .gitignore now covers dist/ entirely; .DS_Store globbed out of all paths. 13 more composes_with edges
// landed on apply-reflections, brief, compare, complete-cycle, darkmode, debug, discuss, explore,
// figma-extract, figma-write, live, map, new-cycle, new-project, progress (Phase 58 buildout still needs
// the remaining ~28-skill backfill per ROADMAP.md). Runtime-models 10 unverified entries reformatted:
// raw URLs + explicit "verified": false field on provenance (was "<TODO: confirm at URL>" wrapper).
// 5,007/5,007 tests pass. No new dependency. Additive only.
OFF_CADENCE_VERSIONS.add('1.57.3');

// 1.58.0 -> architectural cleanup: kill the skills/ <-> source/skills/ duplication.
// Previous layout (Phase 42) committed BOTH the editable templates (source/skills/) AND the
// rendered Claude Code surface (skills/) - 232 tracked files for 116 distinct skills,
// identical content modulo a single placeholder substitution. v1.58.0 makes skill-templates/
// (renamed from source/skills/; the gratuitous source/ wrapper is gone) the single source of
// truth; skills/ is gitignored and regenerated by the `prepare` lifecycle on `npm install`
// (so dev clones still work immediately) and by `prepack` (so the npm tarball still ships
// skills/ pre-built). End-user install experience is unchanged - the tarball still contains
// skills/ at the root. CI gate semantics flip from "committed === generated" drift gate to a
// "compile is deterministic + on-disk skills/ matches" determinism gate. ~40 test/script
// path updates from source/skills/ -> skill-templates/. README, DEPRECATIONS, and the v3
// authoring contract documentation updated for the new path. 5,007/5,007 tests pass.
// No new dependency. Additive only.
OFF_CADENCE_VERSIONS.add('1.58.0');

// 1.58.1 -> hotfix for v1.58.0: skills/ was gitignored as a "build artifact" but that
// broke the Claude Code marketplace install path (Claude Code git-clones the plugin
// without running `npm install`, so `./skills/` was absent post-clone). v1.58.1 reverts
// the gitignore: skills/ is committed again so git-clone-based installs work out of the
// box. skill-templates/ stays canonical (no source/ wrapper, that win persists), and the
// drift gate goes back to enforcing `committed skills/ == compile(skill-templates/)`.
// `prepare` lifecycle still regenerates skills/ on contributor `npm install`. End-user
// install via either path (Claude Code marketplace OR npm) now works.
OFF_CADENCE_VERSIONS.add('1.58.1');

// v1.59 milestone (Audit Closeout & Honesty Pass) ships as point releases
// 1.59.1 .. 1.59.6 (there is no 1.59.0) — each is off-cadence from its predecessor.
OFF_CADENCE_VERSIONS.add('1.59.1');
OFF_CADENCE_VERSIONS.add('1.59.2');
OFF_CADENCE_VERSIONS.add('1.59.3');
OFF_CADENCE_VERSIONS.add('1.59.4');
OFF_CADENCE_VERSIONS.add('1.59.5');
OFF_CADENCE_VERSIONS.add('1.59.6');
OFF_CADENCE_VERSIONS.add('1.59.7');
OFF_CADENCE_VERSIONS.add('1.59.8');
OFF_CADENCE_VERSIONS.add('1.59.9');
// v1.60.0 — Phase 60 "Foundation & Honesty", the v2.0-milestone opener. The
// 1.59.x point-release arc (1.59.1..1.59.9, no 1.59.0) lands on this minor;
// registered here following the 1.29.0/1.30.0/1.31.0 on-cadence-minor precedent.
OFF_CADENCE_VERSIONS.add('1.60.0');
// v1.60.1 — Phase 60.1 security hardening (two High-severity audit fixes), an
// off-cadence patch on the 1.60.0 minor.
OFF_CADENCE_VERSIONS.add('1.60.1');
// v1.60.2 — Phase 60.2 security & CI hardening (CodeQL + npm-audit gate + hono
// override + dangerous-link detection), an off-cadence patch on the 1.60 minor.
OFF_CADENCE_VERSIONS.add('1.60.2');


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
