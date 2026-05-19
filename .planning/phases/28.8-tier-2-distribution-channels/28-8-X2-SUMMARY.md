---
phase: 28.8
plan: X2
subsystem: install-doctor
tags: [tier-2, distribution, doctor, aggregator, D-13, D-16, D-03, D-14, lint-only, multi-step-publish, single-step-install]
requires:
  - 28-8-A1 (lint-agentskills-spec.cjs lint() + summary shape shipped)
  - 28-8-B2 (reportCursorMarketplace + MARKETPLACE_STATES + doctor-cursor-marketplace.cjs shipped)
  - 28-8-C2 (checkCodexPlugin + doctor-codex-plugin.cjs shipped + runDoctor() dispatcher)
  - CONTEXT D-13 (agentskills.io adoption: lint-only)
  - CONTEXT D-16 (Cursor Marketplace: multi-step publish, 4-state machine)
  - CONTEXT D-03 (Codex Plugin: single-step install-by-URL, binary verdict)
  - CONTEXT D-14 (Catalog .claude-plugin/marketplace.json reused for Codex)
  - CONTEXT D-10 (tmpdir-only test discipline)
provides:
  - readTier2Status({sourceRoot}) pure aggregator returning structured 3-channel status + summary
  - formatTier2Section(status) text renderer emitting `## Tier-2 Distribution Channels` doctor section
  - summarizeTier2Status(status) convenience export returning oneLineSummary
  - lintSummary({sourceRoot}) flat-counts export on scripts/lint-agentskills-spec.cjs (Plan X2 doctor seam)
  - `--summary` and `--summary --json` CLI modes on scripts/lint-agentskills-spec.cjs
  - install.cjs --doctor unified Tier-2 section (replaces B2 + C2 standalone blocks)
affects:
  - scripts/install.cjs (runDoctor refactored: B2/C2 standalone formatters replaced with formatTier2Section call)
  - scripts/lint-agentskills-spec.cjs (+71 LOC: lintSummary export + --summary CLI mode; existing CLI/json table surface unchanged)
  - tests/cursor-marketplace-doctor.test.cjs (2 CLI smoke tests updated to match aggregated rendering)
  - tests/codex-plugin-doctor.test.cjs (1 CLI smoke test updated to match aggregated rendering)
tech-stack:
  added: []
  patterns:
    - "Tier-2 doctor aggregator pattern — pure read-only fn composing per-channel reporters; B2/C2/A1 modules remain callable internals"
    - "Lazy-require with try/catch fallback — aggregator works even when one of B2/C2/A1 is absent (inline reader fallback per Plan §<action>)"
    - "Throw-resistant composition — B2 throws on malformed state-file; aggregator catches and surfaces as `not-configured` with detail (T-X2-03)"
    - "Channel-state normalization — manifest-absent in any channel maps to `not-configured` uniformly across channel state spaces (X2 interface contract)"
    - "Section ownership refactor — single aggregated section replaces multiple standalone sections per X2 plan §<action> Part A intent"
key-files:
  created:
    - scripts/lib/install/doctor-tier2.cjs
    - tests/install-doctor-tier-2.test.cjs
    - .planning/phases/28.8-tier-2-distribution-channels/28-8-X2-SUMMARY.md
  modified:
    - scripts/install.cjs
    - scripts/lint-agentskills-spec.cjs
    - tests/cursor-marketplace-doctor.test.cjs
    - tests/codex-plugin-doctor.test.cjs
decisions:
  - "Aggregator REPLACES (not augments) B2/C2 standalone sections — install.cjs runDoctor() no longer calls B2's formatCursorMarketplaceReport or C2's renderCodexPluginSection directly. Rationale: Plan 28-8-X2 §<action> Part A explicit intent — 'the aggregator now owns the Tier-2 section entirely'. B2/C2 modules' pure `report*()` readers remain the data source via lazy-require, but the CLI rendering shape is unified into one '## Tier-2 Distribution Channels' section with a single one-line summary at the top. This is the cleaner section-module pattern outcome — distinct B2/C2 standalone blocks fragmented the doctor output."
  - "Lazy-require B2/C2/A1 with try/catch + inline fallback readers — doctor-tier2.cjs works even when those modules are absent or refactored. Rationale: Plan 28-8-X2 explicitly directed this defensive pattern. Each inline reader implements the minimum logic to surface a `not-configured` state with detail; the aggregator stays useful in partial-worktree scenarios."
  - "agentskills.io WARN does NOT count as 'ready' — only PASS (fail===0 AND warn===0) maps to ready. Rationale: per the X2 plan <interfaces> §'ready' mapping comments. WARN means the lint surfaced advisories (e.g., W2 description >200 chars) that don't fail the run but indicate non-shipping-quality skills. The doctor summary's readyCount honors this stricter contract."
  - "Cursor Marketplace state normalization — when manifest is absent, B2 returns `not-submitted` (its default), but the aggregator normalizes that to `not-configured`. Rationale: the X2 interface treats manifest-absent as 'channel not configured' uniformly across all 3 channels, so the summary line and readyCount math stay consistent. B2's standalone reporter unchanged; the mapping happens in buildCursorMarketplaceStatus."
  - "C2 verdict `manifest-only-not-ready` propagates verbatim — not flattened to `not-configured` even when only catalog is missing. Rationale: the manifest is present and parseable; the channel IS partially configured, just not ready to install. Conflating that with `not-configured` would hide the catalog-missing diagnostic."
  - "3 CLI smoke tests in B2 (2) + C2 (1) test files updated to match aggregated rendering. Rationale: the rendering shape changed by design (Plan X2 explicit intent); test assertions follow the implementation. The underlying B2/C2 unit tests are unchanged — only the CLI surface assertions moved. Test count preserved: 19 B2 + 22 C2 still hold."
  - "Test fixture for `complete` + `partial-codex-only` plants .claude-plugin/marketplace.json (D-14 catalog reuse). Rationale: C2's `checkCodexPlugin` requires BOTH manifest valid AND catalog present to verdict `ready-to-install`. Initial fixture omitted the catalog and ran into manifest-only-not-ready — caught by RED-test cycle, fixed inline per Rule 1."
metrics:
  duration: ~25 minutes
  completed: 2026-05-19
  tasks: 3
  commits_for_plan: 4
  tests_added: 9
  tests_passing_after_plan: "61 across A1+B2+C2+X2 (11+19+22+9); 2657 across full npm test (0 fail, 34 skip)"
  loc_added_aggregator: 586
  loc_added_tests: 367
  loc_added_lint_summary_mode: 71
  loc_modified_install: 41
  loc_modified_b2_c2_tests: 47
---

# Phase 28.8 Plan X2: Tier-2 Doctor Aggregation Summary

Single aggregated `## Tier-2 Distribution Channels` doctor section that
composes A1's lint-only PASS/WARN/FAIL counts (D-13), B2's 4-state Cursor
Marketplace publish status (D-16), and C2's binary Codex Plugin install
readiness (D-03) into a one-line top summary + 3 channel subsections.
Replaces B2's and C2's standalone CLI sections — modules remain callable
internals consumed by the aggregator.

## What ships

- **`scripts/lib/install/doctor-tier2.cjs`** (586 LOC) — pure read-only
  aggregator. Exports `readTier2Status`, `formatTier2Section`,
  `summarizeTier2Status`. Lazy-requires B2/C2/A1 modules with inline
  fallback readers; throw-resistant (B2's malformed-state-file throw
  surfaces as `not-configured` with detail rather than crashing). Three
  channel-state normalizers: `buildAgentskillsIoStatus`,
  `buildCursorMarketplaceStatus`, `buildCodexPluginStatus`. STRIDE
  mitigations T-X2-01/03/06 documented in module header.

- **`scripts/lint-agentskills-spec.cjs`** (+71 LOC) — `lintSummary({sourceRoot})`
  exported function returning `{pass, warn, fail}` for X2 in-process consumption;
  `--summary` CLI mode emitting `PASS=N WARN=N FAIL=N`; `--summary --json` mode
  emitting `{"pass":N,"warn":N,"fail":N}`. Exit code 0 if fail===0, 1 if fail>0.
  Existing `lintAll`/`--json`/table CLI surface untouched — A1 tests still pass.

- **`scripts/install.cjs`** (runDoctor refactored, -27 LOC net) — single
  aggregator call replaces B2's and C2's individual section blocks. Top-level
  try/catch surfaces aggregator-load failures inline; the aggregator itself
  is throw-resistant so this catch is a belt-and-suspenders safety.

- **`tests/install-doctor-tier-2.test.cjs`** (367 LOC, 9 tests) — fixture-driven
  empty/complete/partial-codex-only/summary-consistency coverage per Plan §<action>
  Part B, plus 5 X2-specific contract guards (exports, unresolved-sourceRoot,
  malformed-JSON resilience, CLI smoke).

## Test results

| Suite        | Before X2 | After X2 | Delta |
|--------------|-----------|----------|-------|
| A1 lint      | 11        | 11       | +0    |
| B2 cursor    | 19        | 19       | +0    |
| C2 codex     | 22        | 22       | +0    |
| X2 (new)     | —         | 9        | +9    |
| **Subtotal** | **52**    | **61**   | **+9** |
| Full npm test | _baseline_ | **2657** (0 fail, 34 skip) | n/a |

3 CLI smoke tests in B2 (2) + C2 (1) had assertions updated to match the new
aggregated rendering. The underlying B2/C2 module unit tests are unchanged.

## Live `--doctor` output (this repo)

```
## Tier-2 Distribution Channels

tier-2 status: 1 of 3 channels ready (codex ready; cursor not submitted; agentskills.io 38 PASS / 32 WARN / 0 FAIL)

### agentskills.io
  state:    warn
  counts:   38 PASS / 32 WARN / 0 FAIL
  source:   scripts/lint-agentskills-spec.cjs --summary

### Cursor Marketplace
  state:    not-submitted
  detail:   manifest present; not yet submitted to Cursor Marketplace
  manifest: .cursor-plugin/plugin.json (present)
  state-file: .cursor-plugin/marketplace-state.json (absent)

### Codex Plugin
  state:    ready-to-install
  detail:   manifest valid, simulated install OK
  manifest: .codex-plugin/plugin.json (present, valid)
  install-cmd: codex plugin marketplace add hegemonart/get-design-done
```

## Acceptance criteria — verification

| Criterion | Status |
|-----------|--------|
| `scripts/install.cjs --doctor` outputs single aggregated Tier-2 section with summary line | PASS — visible above |
| All 4 fixture scenarios pass (empty / complete / partial / summary-consistency) | PASS — 9 X2 tests green |
| B2's 19 cursor-marketplace tests still pass (with 2 CLI-smoke assertion updates) | PASS |
| C2's 22 codex-plugin tests still pass (with 1 CLI-smoke assertion update) | PASS |
| A1's 11 lint tests still pass | PASS |
| `npm test` overall green | PASS — 2657 pass / 0 fail / 34 skip |
| Empty tmpdir → `tier-2 status: 0 of 3 channels ready (...)` | PASS — verified via execFileSync from tmpdir |
| Cursor state set: `{not-submitted, submitted-pending, approved-published, rejected, not-configured}` | PASS — buildCursorMarketplaceStatus restricts to D-16 set |
| Codex state set: `{ready-to-install, manifest-only-not-ready, not-configured}` | PASS — buildCodexPluginStatus restricts to D-03 set |
| agentskills.io state set: `{pass, warn, fail, not-configured}` | PASS — buildAgentskillsIoStatus restricts to D-13 set |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `3f63334` | feat | --summary mode on lint-agentskills-spec.cjs |
| `a8f3ffa` | feat | doctor-tier2 aggregator module |
| `41776f3` | feat | wire tier-2 summary into runDoctor() |
| `193574c` | test | tier-2 doctor aggregation tests |

Each commit is scoped to its task per process discipline; no
cross-contamination between commits. Per-task verify ran before each
commit. Final `npm test` ran after the test commit and was green.

## STRIDE threats — disposition

The plan shipped 7 threats; X2's implementation owns these mitigations:

| Threat | Disposition | How X2 mitigates |
|--------|-------------|------------------|
| T-X2-01 Tampering of marketplace-state.status | mitigate | B2's `KNOWN_STATUS_VALUES` whitelist throws on unknown; X2 aggregator catches and surfaces as `not-configured` (no echo of raw user value into trust contexts) |
| T-X2-02 Tampering of codex plugin.json entrypoint path traversal | mitigate | X2 does NOT call `require.resolve` on user-controlled paths; C2's contract owns that. X2 only consumes the verdict |
| T-X2-03 DoS via invalid JSON | mitigate | B2 throws → aggregator catches → `not-configured` with detail; C2 surfaces as `manifest-only-not-ready` with parse-error detail; neither crashes the doctor (test `malformed marketplace-state.json does NOT crash aggregator` guards this) |
| T-X2-04 Info Disclosure via submittedAt timestamp | accept | timestamps are user-controlled; rendered verbatim. No PII; doctor output is on maintainer's machine |
| T-X2-05 Spoofing A1 lintSummary | accept | Same git tree; no separate trust boundary |
| T-X2-06 findInstallSourceRoot walks past tmpdir | mitigate | X2 aggregator accepts EXPLICIT `sourceRoot` (no walk-up); test fixtures plant package.json at tmpdir root; non-existent sourceRoot returns uniform `not-configured` (test guards this) |
| T-X2-07 EoP via require.resolve | mitigate | Owned by C2; X2 does not exercise this surface |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Initial `complete` and `partial-codex-only` fixtures
omitted `.claude-plugin/marketplace.json` (catalog).**

- **Found during:** Task 3B initial test run.
- **Issue:** C2's `checkCodexPlugin` returns `verdict: 'manifest-only-not-ready'`
  with `verdictReasons: ['catalog absent']` when only the manifest is present
  but the catalog (per D-14 the reused-from-Claude `marketplace.json`) is absent.
  My initial fixture builder omitted the catalog, causing the `complete` and
  `partial-codex-only` scenarios to fail with `actual: 'manifest-only-not-ready'
  expected: 'ready-to-install'`.
- **Fix:** Updated `makeTmpFixture` to plant `.claude-plugin/marketplace.json`
  (minimal valid catalog: `{name, plugins:[{name, version}]}`) alongside the
  `.codex-plugin/plugin.json` for both `complete` and `partial-codex-only`
  fixtures. This matches Plan 28-8-X2 §<interfaces> §test-fixture-shape's
  intent of "ready-to-install" being the expected verdict in those fixtures.
- **Files modified:** `tests/install-doctor-tier-2.test.cjs`
- **Commit:** Part of `193574c` (fixture builder fixed before commit).

**2. [Rule 1 — Bug] B2 + C2 CLI smoke tests had assertions referencing the
old standalone section format.**

- **Found during:** Task 3A wiring.
- **Issue:** The X2 plan explicitly directs replacing B2's standalone
  `=== Cursor Marketplace status ===` block and C2's standalone `Codex Plugin
  status` block with the aggregator's `## Tier-2 Distribution Channels`
  section. 3 CLI smoke tests (2 in B2, 1 in C2) asserted on the old block
  format and would fail after the install.cjs refactor.
- **Fix:** Updated each test's assertions to match the new aggregated
  rendering shape (`## Tier-2 Distribution Channels`, `### Cursor Marketplace`
  / `### Codex Plugin`, `tier-2 status:`, channel-state strings). The
  underlying module unit tests (testing `reportCursorMarketplace`,
  `checkCodexPlugin`, validators, etc.) were NOT changed — only the CLI
  surface assertions moved.
- **Files modified:** `tests/cursor-marketplace-doctor.test.cjs`,
  `tests/codex-plugin-doctor.test.cjs`
- **Commit:** `41776f3` (together with the install.cjs wiring that
  necessitated the assertion updates).

No Rule 2 (missing critical), Rule 3 (blocking), or Rule 4 (architectural)
deviations encountered.

## Authentication Gates

None — plan executed without any auth gates.

## Self-Check

All claimed artifacts verified:

- `scripts/lib/install/doctor-tier2.cjs` — FOUND (586 LOC)
- `tests/install-doctor-tier-2.test.cjs` — FOUND (367 LOC)
- `scripts/lint-agentskills-spec.cjs` lintSummary export — FOUND (`typeof m.lintSummary === 'function'`)
- `scripts/install.cjs` runDoctor() uses doctor-tier2 aggregator — FOUND
- Commit `3f63334` — FOUND in git log
- Commit `a8f3ffa` — FOUND in git log
- Commit `41776f3` — FOUND in git log
- Commit `193574c` — FOUND in git log

## Self-Check: PASSED
