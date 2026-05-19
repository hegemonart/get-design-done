---
phase: 28.8
plan: B2
subsystem: install-doctor
tags: [tier-2, distribution, cursor-marketplace, doctor, read-only, D-16, multi-step-publish]
requires:
  - 28-8-B1 (cursor-marketplace converter + .cursor-plugin/plugin.json shipped)
  - CONTEXT D-09 revised (D-16: multi-step publish flow)
  - CONTEXT D-10 (tmpdir-only test discipline)
  - CONTEXT D-16 (4-state maintainer-local marketplace-state.json schema)
provides:
  - reportCursorMarketplace({projectRoot}) pure read-only reporter for Plan 28-8-X2 (Tier-2 doctor aggregator) to wrap
  - MARKETPLACE_STATES frozen enum (NOT_SUBMITTED / SUBMITTED_PENDING / APPROVED_PUBLISHED / REJECTED) for downstream callers
  - formatCursorMarketplaceReport(report) text renderer for shared CLI output style across Tier-2 channels
  - validateManifest(parsed) shape validator for B1-shaped .cursor-plugin/plugin.json (re-used by Plan 28-8-C2 if it mirrors validator shape)
  - --doctor CLI flag in scripts/install.cjs + section-module dispatch pattern (runDoctor) for Plan 28-8-C2 and Plan 28-8-X2 to extend
  - docs/cursor-marketplace-field-test.md self-contained runbook for the maintainer post-merge publish flow
affects:
  - scripts/install.cjs (+61 lines: --doctor flag, runDoctor() dispatcher, helpText entry, top-comment)
  - .gitignore (+4 lines: .cursor-plugin/marketplace-state.json local-only state file)
tech-stack:
  added: []
  patterns:
    - "Tier-2 channel reporter (pure, read-only, structured-return) — distinct from Tier-1 file-drop converters"
    - "Section-module pattern for --doctor CLI: each channel's reporter is independently loadable + composable in runDoctor()"
    - "Maintainer-typo safety: unknown marketplace-state.json status throws with bad value in message (no silent fallback)"
    - "Validator-by-shape: validateManifest mirrors B1's defensive throws as an inverse fn (validate parsed, not assemble)"
    - "Multi-step publish flow documentation pattern: explicit state-machine table mapping doctor output → maintainer action"
key-files:
  created:
    - scripts/lib/install/doctor-cursor-marketplace.cjs
    - docs/cursor-marketplace-field-test.md
    - tests/cursor-marketplace-doctor.test.cjs
    - tests/fixtures/cursor-marketplace/state-not-submitted.json
    - tests/fixtures/cursor-marketplace/state-submitted-pending.json
    - tests/fixtures/cursor-marketplace/state-approved-published.json
    - tests/fixtures/cursor-marketplace/state-rejected.json
  modified:
    - scripts/install.cjs
    - .gitignore
decisions:
  - "Doctor module exports validateManifest in addition to the plan's required pair (reportCursorMarketplace + MARKETPLACE_STATES). Rationale: B1's converter does NOT export validateManifest (its buildManifest is the assembly-direction validator; doctor needs the inverse — validate-parsed). Exporting the validator from the doctor module keeps the inverse adjacent to its caller without duplicating B1's schema logic."
  - "Doctor module ALSO exports formatCursorMarketplaceReport (the text renderer). Rationale: rendering logic stays adjacent to the data shape; install.cjs imports both pure fns rather than building its own formatter. Plan 28-8-X2 aggregator can wrap the formatter unchanged."
  - "Section-module dispatch (runDoctor) lives in install.cjs rather than a new lib file. Rationale: B2 only has one channel section to wire; introducing a doctor-tier2.cjs aggregator pre-emptively was rejected as YAGNI. Plan 28-8-X2 may extract runDoctor into lib/install/doctor.cjs once a third Tier-2 channel exists. Explicit forward-pointer comment in install.cjs flags the extraction point for C2 and X2."
  - "Malformed JSON in marketplace-state.json THROWS (T-04 mitigation) rather than returning a structured error. Rationale: maintainer-typo safety — a silent fallback would mask the typo on every --doctor run. The threat register approves this (T-04 disposition: mitigate)."
  - "Unknown status string in marketplace-state.json THROWS with bad value in message. Rationale: same as above — maintainer must see and fix typos explicitly (`status: 'in-orbit'` → throw with 'in-orbit' in message)."
metrics:
  duration: ~30 minutes
  completed: 2026-05-19
  tasks: 2
  commits_for_plan: 3
  tests_added: 19
  loc_added_doctor: 366
  loc_added_tests: 473
  loc_added_field_test_doc: 145
---

# Phase 28.8 Plan B2: Cursor Marketplace Doctor + Multi-Step Field-Test Docs Summary

Tier-2 Cursor Marketplace distribution-channel **doctor reporter** wired
into `scripts/install.cjs --doctor` per Phase 28.8 D-16: a pure, read-
only function that parses `.cursor-plugin/plugin.json` (B1-shipped) plus
the maintainer-local `.cursor-plugin/marketplace-state.json` (gitignored)
and surfaces 4 distinct publish states — `not-submitted` /
`submitted-pending` / `approved-published` / `rejected`. Plus the multi-
step field-test runbook documenting the post-merge maintainer flow with
the explicit no-SLA caveat (D-16 honest-accounting framing).

## What ships

- `scripts/lib/install/doctor-cursor-marketplace.cjs` — pure reporter
  module. 366 LOC. Exports `reportCursorMarketplace`, `MARKETPLACE_STATES`,
  `formatCursorMarketplaceReport`, `validateManifest`. No fs writes; no
  network calls; tmpdir-safe by construction.
- `scripts/install.cjs` — `--doctor` flag dispatch. Early-return BEFORE
  any runtime selection so the doctor cannot trigger install side
  effects. `runDoctor()` top-level fn uses section-module pattern: each
  Tier-2 channel reporter is lazy-required + invoked + formatted in its
  own `try/catch` block; failure in one section logs inline and does
  not prevent other sections from running. C2 (Codex) and X2
  (aggregator) plug their sections into `runDoctor()` as sibling
  blocks without refactoring B2's structure.
- `docs/cursor-marketplace-field-test.md` — 145-line self-contained
  runbook. Maintainer-only post-merge flow: submit application →
  record submitted-pending → await review → publish via UI → record
  approved-published. Explicit no-SLA blockquote, 4-row doctor-states
  reference table, see-also forward-link to the (future) Codex field-
  test doc.
- `.gitignore` — `.cursor-plugin/marketplace-state.json` entry
  (maintainer-local state, never committed per D-16).
- `tests/cursor-marketplace-doctor.test.cjs` — 19 tests, 473 LOC,
  tmpdir-only per D-10.
- 4 fixtures under `tests/fixtures/cursor-marketplace/` — one per D-16
  state value, schemas match the plan's `<interfaces>` exactly.

## Doctor architecture chosen (modular pattern for C2 to plug in)

The plan asked for a "modular pattern so C2 can hang Codex section off
it". B2 chose **option B-prime** (variant of the plan's two suggested
options):

- **Top-level `runDoctor()` function in `scripts/install.cjs`.** Each
  channel reporter is its own pure module under `scripts/lib/install/`.
  `runDoctor` dispatches to each by lazy-requiring + invoking its
  `report*()` fn + formatting the result.
- **No `scripts/lib/install/doctor-tier2.cjs` aggregator file yet.**
  YAGNI — only one section exists today. Plan 28-8-X2 extracts the
  aggregator if/when the section count justifies it; explicit forward-
  pointer comment in `runDoctor()` flags this.
- **C2's plug-in shape:** add a sibling `try/catch` block in
  `runDoctor()` that lazy-requires `./lib/install/doctor-codex-plugin.cjs`
  and formats its report. C2 ships its own `report*()` + formatter in
  the new module file, no install.cjs surgery beyond the new block.

This gives C2 zero structural refactor cost, while leaving room for X2
to graduate `runDoctor` into a proper aggregator if a third Tier-2
channel lands.

## Test coverage

19 tests, all passing in tmpdir:

| Category                                 | Test count | Notes                                                                       |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 4-state fixture coverage                 | 4          | One per D-16 state; each asserts state value + state-specific fields + guidance text |
| Absent-resource scenarios                | 3          | absent state file → not-submitted; empty .cursor-plugin/; no .cursor-plugin/ at all   |
| Manifest validity matrix                 | 3          | valid+match (versionMatch=true); valid+mismatch; invalid (missing fields)            |
| Error-path (T-04 mitigation)             | 2          | malformed JSON in state file → throws; unknown status → throws with bad value in msg |
| Read-only invariant (T-06 mitigation)    | 1          | Directory snapshot + per-file mtime/size diff before vs after reporter call         |
| CLI smoke (install.cjs --doctor)         | 2          | One in approved-published fixture tmpdir, one in clean tmpdir → not-submitted        |
| validateManifest unit tests              | 3          | Full-shape acceptance, non-object rejection, non-semver version rejection           |
| Format output shape pin                  | 1          | 5-line section: header + Manifest + Schema validity + Application + Next step       |

**D-10 enforcement evidence:** `grep -E "fetch\(|http\.get|https\.get|http\.request|https\.request"` returns zero matches across `tests/cursor-marketplace-doctor.test.cjs` and `scripts/lib/install/doctor-cursor-marketplace.cjs`. No live `cursor.com` network calls in tests. All FS writes occur inside `mkdtempSync` roots, removed via `rmSync({recursive:true, force:true})` in `try/finally`.

## Commit log (B2 scope)

| Commit  | Type   | Files                                                                                  |
| ------- | ------ | -------------------------------------------------------------------------------------- |
| 8c6d9ed | feat   | scripts/lib/install/doctor-cursor-marketplace.cjs + scripts/install.cjs (--doctor)     |
| 68fddf6 | docs   | docs/cursor-marketplace-field-test.md                                                  |
| 6d7dd77 | test   | tests/cursor-marketplace-doctor.test.cjs + 4 fixtures                                  |

(`.gitignore` change for `.cursor-plugin/marketplace-state.json` was
committed under X1's commit `ff258a4` due to parallel-worktree race
between B2 and X1 — see Deviations.)

## Deviations from Plan

### Parallel-worktree race observations (NOT rule deviations)

The B2 executor ran in parallel with A2 and X1 (per orchestrator
constraints). Two cross-contamination effects observed in `git log`:

1. **`.gitignore` B2 entry landed in X1's commit `ff258a4`.** X1's
   commit message describes "wire build:bundles npm script + dist/
   gitignore" but the actual diff added B2's
   `.cursor-plugin/marketplace-state.json` ignore block (not X1's
   `dist/` block, which X1 had to re-add in commit `01b5951`).
2. **A2's `.planning/research/agentskills-io-compat/*.md` files
   (6 files) landed in B2's commit `8c6d9ed`.** B2's commit message
   describes only the doctor module + install.cjs --doctor wiring,
   but the diff also includes A2's research files because they were
   staged in the shared index when B2 ran `git commit`.

Per the executor's destructive-git prohibition, no `git reset` /
`git rebase` was performed to clean these up — the net effect is
preserved (all intended file content is committed; only the
commit-message attribution is fuzzy across parallel commits).
**Acceptance:** functional correctness over commit-message hygiene
when destructive history rewrite is the alternative.

### Auto-added: `validateManifest` + `formatCursorMarketplaceReport` exports

**Rule 2 — Missing critical functionality.** Plan asked for
`reportCursorMarketplace` + `MARKETPLACE_STATES` exports only. Doctor
shipped two additional exports:

- `validateManifest(parsed)` — schema validator for parsed manifest
  objects. The plan said "reuse B1's validator" but B1's
  `cursor-marketplace.cjs` does NOT export a `validateManifest` fn —
  it exports `buildManifest` (assembly direction) + `convert` +
  `CURATED_KEYWORDS`. B1's defensive throws inside `buildManifest`
  validate sources, not parsed manifests. The doctor needs the
  inverse direction (validate-parsed). Rather than duplicate B1's
  schema rules in a different module, B2 exports the inverse fn
  from the doctor module and the test suite uses it directly. C2
  can mirror this pattern for `.codex-plugin/plugin.json` if its
  schema diverges; X2 can later consolidate into a shared validator
  if both schemas converge.
- `formatCursorMarketplaceReport(report)` — text renderer co-located
  with the data shape so install.cjs imports both pure fns rather
  than re-implementing the formatter inline. X2 (aggregator) can
  wrap the formatter unchanged.

**Files modified:** `scripts/lib/install/doctor-cursor-marketplace.cjs`.

**Commit:** `8c6d9ed`.

### Out-of-scope items deferred (not fixed by B2)

Several files in the working tree are owned by parallel executors
(A2 + X1) and are NOT modified by B2:

- `.planning/research/agentskills-io-compat/*.md` — A2's research
  artifacts (6 files).
- `scripts/build-distribution-bundles.cjs` — X1's bundler orchestrator.
- `tests/build-distribution-bundles.test.cjs` — X1's bundler tests.
- `package.json scripts.build:bundles` — X1's npm script.
- `.gitignore dist/` — X1's bundle output exclusion.

None of these block B2's verify gates.

## Threat Flags

None. B2's surface introduces no new network endpoints, no new auth
paths, no new file-access patterns beyond the two specific JSON files
listed in CONTEXT D-16. The `--doctor` CLI flag is an additive read-
only mode; it cannot trigger install or uninstall by construction
(early-dispatch in `main()` before runtime-selection logic).

All `<threat_model>` STRIDE rows from the plan are addressed:

- **T-01 Tampering (state file)** — accepted; local-only, gitignored.
- **T-02 Information disclosure (stdout)** — accepted; only public/semi-public fields echoed.
- **T-03 DoS** — accepted; O(1) reads, bounded JSON.
- **T-04 Tampering/Spoofing (malformed JSON)** — mitigated by throw-with-message + test (lines 232-260 in test file).
- **T-05 Repudiation** — accepted; local-only.
- **T-06 Elevation of privilege (--doctor side effects)** — mitigated by early-dispatch + read-only-invariant test (lines 305-335 in test file).
- **T-07 Information disclosure (rejection-reason verbatim)** — accepted; field-test doc warns gitignored.

## Self-Check: PASSED

- Files created:
  - `scripts/lib/install/doctor-cursor-marketplace.cjs` — FOUND
  - `docs/cursor-marketplace-field-test.md` — FOUND
  - `tests/cursor-marketplace-doctor.test.cjs` — FOUND
  - `tests/fixtures/cursor-marketplace/state-not-submitted.json` — FOUND
  - `tests/fixtures/cursor-marketplace/state-submitted-pending.json` — FOUND
  - `tests/fixtures/cursor-marketplace/state-approved-published.json` — FOUND
  - `tests/fixtures/cursor-marketplace/state-rejected.json` — FOUND
- Files modified:
  - `scripts/install.cjs` — FOUND (--doctor flag + runDoctor() + helpText entry)
  - `.gitignore` — FOUND (.cursor-plugin/marketplace-state.json — landed in X1's commit ff258a4 per Deviations §)
- Commits in git history:
  - `8c6d9ed` — `feat(28-8-B2): cursor-marketplace doctor module + install.cjs --doctor` — FOUND
  - `68fddf6` — `docs(28-8-B2): cursor marketplace multi-step field-test runbook` — FOUND
  - `6d7dd77` — `test(28-8-B2): cursor-marketplace doctor — 19 tests across 4 D-16 fixtures` — FOUND
- Plan verify gate: PASS (`node -e ...` smoke test) — confirmed via Task 1 verify and Task 2 verify
- Plan acceptance gates: ALL PASS
  - exports check: 4 exports (2 required + 2 extra per Rule 2) ✓
  - --doctor exits 0 in repo root: confirmed ✓
  - --help lists --doctor: confirmed (count=1) ✓
  - .gitignore entry exactly once: confirmed (grep -c = 1) ✓
  - field-test doc: 145 lines (≥ 50), 6 headings, 1 no-SLA blockquote, 4-state table ✓
  - 4 fixtures all valid JSON ✓
  - doctor test suite: 19 tests passing, 0 failing (target ≥ 12) ✓
  - manifest validity matrix: valid+match, valid+mismatch, invalid — all covered ✓
  - malformed + unknown status — both throw with descriptive message ✓
  - read-only invariant test: PASSES ✓
  - CLI smoke test: PASSES ✓
- D-10 grep enforcement: `grep -E "fetch\(|http\.get|https\.get|http\.request|https\.request"` count in B2 sources = 0 (PASS)
- Full project test suite: 2592 pass / 0 fail / 34 skipped (pre-existing tests + B2's 19 new tests all green)
