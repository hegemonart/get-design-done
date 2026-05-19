---
phase: 28.8
plan: Z1
subsystem: distribution
type: execute
wave: D
status: complete
completed: 2026-05-19
version_shipped: v1.28.8
tags: [closeout, manifest-lockstep, changelog, baselines, roadmap, state, off-cadence, tier-2-distribution-channels]
requires: [28-8-01, 28-8-02, 28-8-03, 28-8-A1, 28-8-A2, 28-8-B1, 28-8-B2, 28-8-C1, 28-8-C2, 28-8-X1, 28-8-X2]
provides:
  - 4-manifest lockstep at v1.28.8 (D-08)
  - 2 additional Tier-2 manifests at v1.28.8 (.cursor-plugin/plugin.json + .codex-plugin/plugin.json)
  - CHANGELOG ## [1.28.8] - 2026-05-19 block
  - OFF_CADENCE_VERSIONS registration for 1.28.8
  - Phase 28.8 baseline test suite (16 version-agnostic tests)
  - 5 new Phase 28.8 baseline files
  - 4 prior-phase manifests-version.txt forward-props (28.7, 28.6, 28.5, 28)
  - +1 Rule-3 forward-prop (phase-27-7/manifests-version.txt)
  - README.md + 6 translated READMEs Tier-2 install paths
  - ROADMAP add Phase 28.8 section + scoped flip
  - STATE.md v1.28.8 closeout
affects:
  - package.json
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - .cursor-plugin/plugin.json
  - .codex-plugin/plugin.json
  - CHANGELOG.md
  - tests/semver-compare.test.cjs
  - tests/phase-28.8-baseline.test.cjs
  - test-fixture/baselines/phase-28.8/* (5 files, new)
  - test-fixture/baselines/phase-28.7/manifests-version.txt
  - test-fixture/baselines/phase-28.6/manifests-version.txt
  - test-fixture/baselines/phase-28.5/manifests-version.txt
  - test-fixture/baselines/phase-28/manifests-version.txt
  - test-fixture/baselines/phase-27-7/manifests-version.txt
  - README.md + README.de.md + README.fr.md + README.it.md + README.ja.md + README.ko.md + README.zh-CN.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
key-files:
  created:
    - test-fixture/baselines/phase-28.8/manifests-version.txt
    - test-fixture/baselines/phase-28.8/converter-inventory.txt
    - test-fixture/baselines/phase-28.8/tier-2-channels.txt
    - test-fixture/baselines/phase-28.8/registry-diff.txt
    - test-fixture/baselines/phase-28.8/cross-link-integrity.txt
    - tests/phase-28.8-baseline.test.cjs
  modified:
    - package.json (1.28.7 -> 1.28.8)
    - .claude-plugin/plugin.json (1.28.7 -> 1.28.8)
    - .claude-plugin/marketplace.json (metadata.version + plugins[0].version both 1.28.7 -> 1.28.8)
    - .cursor-plugin/plugin.json (1.28.7 -> 1.28.8)
    - .codex-plugin/plugin.json (1.28.7 -> 1.28.8)
    - CHANGELOG.md (## [1.28.8] block prepended)
    - tests/semver-compare.test.cjs (OFF_CADENCE_VERSIONS.add('1.28.8'))
    - README.md + 6 translated READMEs (Tier-2 install paths added)
    - test-fixture/baselines/phase-28.7/manifests-version.txt (1.28.7 -> 1.28.8)
    - test-fixture/baselines/phase-28.6/manifests-version.txt (1.28.7 -> 1.28.8)
    - test-fixture/baselines/phase-28.5/manifests-version.txt (1.28.5 -> 1.28.8)
    - test-fixture/baselines/phase-28/manifests-version.txt (1.28.7 -> 1.28.8)
    - test-fixture/baselines/phase-27-7/manifests-version.txt (1.28.7 -> 1.28.8) — Rule 3 fix
    - .planning/ROADMAP.md (Phase 28.8 section added + overview flipped)
    - .planning/STATE.md (v1.28.8 closeout)
decisions:
  - 4-manifest lockstep (D-08) — all 4 standard slots + 2 Tier-2 slots at 1.28.8
  - OFF_CADENCE register for 1.28.8 (decimal sub-phase from 1.28.7)
  - CHANGELOG cites all Wave A/B/C deliverables + D-05 backward-compat note
  - README authoritative in English; 6 translations link back to English for details
  - Phase 28.8 baselines and 4 prior-phase forward-props per D-08 + 1 Rule-3 fix (phase-27-7)
  - ROADMAP entry CREATED (not flipped — section did not pre-exist in ROADMAP) — same pattern as Phase 28.7
  - All 12 plan checkboxes pre-flipped to [x] inside the new section
  - Manual STATE edit (no gsd-tools state commands) per Phase 28.7 lessons learned
  - D-14 catalog reuse: .claude-plugin/marketplace.json serves both Claude Code marketplace AND Codex catalog
  - D-05 backward-compat: scripts/lib/install/converters/cursor.cjs + codex.cjs UNCHANGED (file-drop Tier-1 paths preserved)
metrics:
  start_time: 2026-05-19T20:59:00.000Z
  duration: ~17 minutes
  completed_tasks: 4
  total_tasks: 4
  files_touched: 23
  commits: 7
  tests_pass: 2639
  tests_fail: 0
  tests_skipped: 34
roadmap_flips:
  inline_plan_checkboxes: 12
  overview_entries: 1
  total_x_markers_added: 13
  scope_confirmed: phase-28.8-section-only-no-cross-phase-edits
---

# Phase 28.8 Plan Z1: Tier-2 Distribution Channels Closeout — v1.28.8 Summary

Ships **v1.28.8** with all 12 Phase 28.8 plans landed: agentskills.io compliance lint (Wave A) + Cursor Marketplace + Codex Plugin manifests + doctors (Wave B) + bundle builder + Tier-2 doctor aggregation (Wave C) + closeout (Wave D). Tier-2 channels are additive opt-in — Phase 28.7 file-drop install (cursor.cjs, codex.cjs) UNCHANGED per D-05 backward-compat.

## One-liner

Phase 28.8 closeout bumps 4+2=6 manifest slots to 1.28.8 in lockstep, registers OFF_CADENCE '1.28.8', adds CHANGELOG block citing all Wave A/B/C deliverables, ships 16-test version-agnostic baseline suite, creates 5 Phase 28.8 baselines + forward-props 5 prior-phase manifests-version.txt files (28.7, 28.6, 28.5, 28, +27-7 Rule-3 fix), updates README + 6 translated READMEs with Tier-2 install paths per channel, and inserts Phase 28.8 ROADMAP section with all 12 plan checkboxes pre-flipped — full repo `npm test` 100% green.

## What shipped

### 6-manifest lockstep at v1.28.8

| File                                | Slot                          | From    | To      |
|-------------------------------------|-------------------------------|---------|---------|
| `package.json`                      | `version`                     | 1.28.7  | 1.28.8  |
| `.claude-plugin/plugin.json`        | `version`                     | 1.28.7  | 1.28.8  |
| `.claude-plugin/marketplace.json`   | `metadata.version`            | 1.28.7  | 1.28.8  |
| `.claude-plugin/marketplace.json`   | `plugins[0].version`          | 1.28.7  | 1.28.8  |
| `.cursor-plugin/plugin.json`        | `version` (Tier-2 manifest)   | 1.28.7  | 1.28.8  |
| `.codex-plugin/plugin.json`         | `version` (Tier-2 manifest)   | 1.28.7  | 1.28.8  |

Verified post-commit via `node -e "..."` cross-manifest version-equality check.

### OFF_CADENCE + CHANGELOG

- `tests/semver-compare.test.cjs`: `OFF_CADENCE_VERSIONS.add('1.28.8')` appended with comment block citing sequence 1.28.0 → 1.28.5 → 1.28.6 → 1.28.7 → 1.28.8.
- `CHANGELOG.md`: new `## [1.28.8] - 2026-05-19` entry at top with Added / Changed / Documentation / Backward compatibility sections covering all Wave A/B/C deliverables.

### Phase 28.8 baselines (5 new files)

```
test-fixture/baselines/phase-28.8/
  manifests-version.txt        1.28.8
  converter-inventory.txt      4 NEW Wave A/B/C scripts
  tier-2-channels.txt          cursor-marketplace, codex-plugin
                               (agentskills-io is lint-only per D-13, not a runtime kind)
  registry-diff.txt            no registry changes
  cross-link-integrity.txt     PASS
```

### Prior-phase baseline forward-props

| Baseline                                                | From    | To      |
|---------------------------------------------------------|---------|---------|
| `test-fixture/baselines/phase-28.7/manifests-version.txt` | 1.28.7  | 1.28.8  |
| `test-fixture/baselines/phase-28.6/manifests-version.txt` | 1.28.7  | 1.28.8  |
| `test-fixture/baselines/phase-28.5/manifests-version.txt` | 1.28.5  | 1.28.8  |
| `test-fixture/baselines/phase-28/manifests-version.txt`   | 1.28.7  | 1.28.8  |
| `test-fixture/baselines/phase-27-7/manifests-version.txt` | 1.28.7  | 1.28.8  | (Rule 3 — see Deviations)

phase-27-5 and phase-27-6 baselines use PIN-style semver-shape assertions (immune to version bumps); no forward-prop needed.

### 16-test baseline suite

`tests/phase-28.8-baseline.test.cjs`:

1-4. 4-manifest lockstep (D-08) — version-agnostic against `package.json#version`.
5. CHANGELOG `## [VERSION] - 2026-05-19` block at top (full RegExp escape per CodeQL).
6. OFF_CADENCE_VERSIONS registers VERSION (full RegExp escape).
7-11. 5 baseline manifests-version.txt files all equal VERSION (phase-28.8 + 4 fwd-props).
12. Tier-2 converter + script inventory exists + require()s cleanly (4 NEW scripts).
13. `.cursor-plugin/plugin.json` exists + parses + required keys + version === VERSION.
14. `.codex-plugin/plugin.json` exists + parses + required keys + version === VERSION.
15. D-14 catalog reuse: `.claude-plugin/marketplace.json` parses + has plugins[] array + NO separate `.codex-plugin/marketplace.json`.
16. README inventory: 7 READMEs each contain literal `codex plugin marketplace add hegemonart/get-design-done` + agentskills.io + Cursor (case-insensitive).

All 16 pass. Version-agnostic (no hardcoded '1.28.8' in test logic).

### READMEs (7 files: en + 6 translations)

- `README.md`: new "Tier-2 Distribution Channels (v1.28.8+)" subsection under Getting Started covering all 3 channels (agentskills.io portability, Cursor Marketplace pending-publish, Codex Plugin GitHub-URL install).
- `README.de.md` / `.fr.md` / `.it.md` / `.ja.md` / `.ko.md` / `.zh-CN.md`: short Tier-2 section in target language; install commands verbatim English; link back to README.md as authoritative source.

Phase 28.7 file-drop paths preserved per D-05 backward-compat — both Tier-1 and Tier-2 documented.

### ROADMAP — added + scoped flip

- Overview line 93: `- [x] [Phase 28.8](#phase-288-tier-2-distribution-channels-inserted) — Tier-2 Distribution Channels — INSERTED — v1.28.8`.
- New section: `### Phase 28.8: Tier-2 Distribution Channels (INSERTED)` between Phase 28.7 and Phase 29, with all 12 plan checkboxes pre-flipped to `[x]`:
  - 28-8-01, 28-8-02, 28-8-03 (Wave A research)
  - 28-8-A1, 28-8-A2, 28-8-B1, 28-8-B2, 28-8-C1, 28-8-C2 (Wave B converters + manifests + doctors)
  - 28-8-X1, 28-8-X2 (Wave C bundler + doctor aggregation)
  - 28-8-Z1 (Wave D closeout)
- Total: 12 inline + 1 overview = **13 `[x]` markers** added in Phase 28.8 scope.
- `git diff .planning/ROADMAP.md` confirms scope: only Phase 28.8 section added + overview line inserted; no other phase touched.

### STATE.md (manual edit)

- `status:` overhauled with v1.28.8 closeout summary.
- `last_updated:` 2026-05-19T18:00:00.000Z.
- `progress.total_phases` 9 → 10, `completed_phases` 7 → 8.
- `progress.total_plans` 62 → 74, `completed_plans` 62 → 74.
- Current Position released bumped to v1.28.8.
- Added "Maintainer ship-out follow-ups (Phase 28.8 v1.28.8 post-merge)" section with Cursor publisher application + Codex install-by-URL steps.
- Near-term integration list adds 28.8 strikethrough.
- Phases shipped header: "40 through v1.28.7" → "41 through v1.28.8".
- Phases shipped table: appended Phase 28.8 row.

No `gsd-tools state` commands used per Phase 28.7 lessons learned.

## Verification snapshot

| Check                                              | Result                          |
|----------------------------------------------------|---------------------------------|
| All 6 manifest slots at 1.28.8                     | OK (6/6)                        |
| OFF_CADENCE_VERSIONS has '1.28.8'                  | OK                              |
| CHANGELOG top entry is `## [1.28.8] - 2026-05-19`  | OK                              |
| 5 Phase 28.8 baselines exist                       | OK                              |
| 5 forward-propped baselines at 1.28.8              | OK (28.7, 28.6, 28.5, 28, 27-7) |
| 7 READMEs reference Tier-2 channels                | OK (all 3 channels in each)     |
| 16-test baseline suite                             | 16 pass / 0 fail                |
| ROADMAP `[x] 28-8-*` count                         | 12                              |
| ROADMAP `[ ] 28-8-*` count                         | 0                               |
| ROADMAP `[x] [Phase 28.8]` overview                | 1                               |
| STATE.md reflects v1.28.8                          | OK                              |
| D-05 — cursor.cjs / codex.cjs file-drop unchanged  | OK (`git diff` empty)           |
| D-14 — no separate .codex-plugin/marketplace.json  | OK                              |
| Full `npm test`                                    | 2639 pass / 0 fail / 34 skipped |
| `--doctor` Tier-2 section all 3 channels render    | OK                              |
| `build-distribution-bundles.cjs` 3 channel outputs | OK (agentskills-io 90, codex-plugin 91, cursor-marketplace 91 files) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Forward-propped `phase-27-7/manifests-version.txt` 1.28.7 → 1.28.8**

- **Found during:** Task 4 (`npm test`)
- **Issue:** `tests/phase-27-7-baseline.test.cjs:45` enforces strict equality between `phase-27-7/manifests-version.txt` and `package.json#version`. Test failed at full-suite run: `'1.28.7' !== '1.28.8'`.
- **Fix:** Updated `test-fixture/baselines/phase-27-7/manifests-version.txt` from `1.28.7` to `1.28.8`. Confirmed `phase-27-5` and `phase-27-6` baselines use PIN-style semver-shape assertions and do not need fwd-prop.
- **Files modified:** `test-fixture/baselines/phase-27-7/manifests-version.txt`
- **Commit:** `90e1213 fix(28-8-Z1): forward-prop phase-27-7/manifests-version.txt 1.28.7 -> 1.28.8`

Plan listed only `phase-28.7`, `phase-28.6`, `phase-28.5`, `phase-28` for forward-prop but missed `phase-27-7` (which uses hyphen-separated naming, distinct from the dot-naming of `phase-28.7`). Other `phase-27-*` baselines were verified to not need fwd-prop.

### Authentication gates

None.

### Architectural decisions

None — closeout strictly followed plan + D-XX decisions from CONTEXT.md.

## Self-Check

- All 6 commits exist in git log: 245dea0, b28e8ef, ec0b346, e480a60, ca23c00, f67268d, 90e1213.
- All 5 created baseline files exist under `test-fixture/baselines/phase-28.8/`.
- `tests/phase-28.8-baseline.test.cjs` exists (226 lines, 16 tests).
- `npm test` 100% green (2639 pass / 0 fail).

## Self-Check: PASSED

## Commits (this plan)

| # | Hash    | Type   | Description                                                           |
|---|---------|--------|-----------------------------------------------------------------------|
| 1 | 245dea0 | chore  | bump 6 manifests + register OFF_CADENCE 1.28.8                        |
| 2 | b28e8ef | docs   | CHANGELOG v1.28.8 entry                                               |
| 3 | ec0b346 | docs   | README + 6 translated READMEs with Tier-2 install paths               |
| 4 | e480a60 | chore  | phase-28.8 baselines + forward-prop prior manifests-version           |
| 5 | ca23c00 | test   | phase-28.8 baseline test suite (16 tests, version-agnostic)           |
| 6 | f67268d | docs   | ROADMAP add Phase 28.8 section + scoped flip + STATE v1.28.8 closeout |
| 7 | 90e1213 | fix    | forward-prop phase-27-7/manifests-version.txt 1.28.7 -> 1.28.8 (Rule 3) |

(The plan suggested ~7 commits — exactly 7 landed including the Rule 3 fix.)

## Maintainer ship-out (post-merge, manual)

Per D-09 (revised) + D-16, the maintainer initiates the publish + PR + tag flow:

1. **Push branch + open PR for v1.28.8.** (Local state ready; no auto-push from this plan.)
2. **After PR merge to main, tag the merge commit `v1.28.8`** and push the tag.
3. **Cursor Marketplace (D-04 + D-16, application-gated, multi-step):**
   - Submit publisher application at `cursor.com/marketplace/publish` per `docs/cursor-marketplace-field-test.md`.
   - Awaits Cursor team review approval (no published SLA).
   - On approval, publish manifest from `.cursor-plugin/plugin.json` via marketplace UI.
   - Verify via `node scripts/install.cjs --doctor` Tier-2 section (state should advance: `submitted-pending` → `approved-published`).
4. **Codex Plugin (D-03, single-step, install-by-URL):**
   - Run `codex plugin marketplace add hegemonart/get-design-done` against the live repo URL per `docs/codex-plugin-field-test.md`.
   - Verify via `node scripts/install.cjs --doctor` Tier-2 section (state should reflect installed/ready).

## Known follow-ups

- **Cursor publisher application** — not yet submitted (post-merge maintainer step per D-16 multi-step field-test).
- **Codex install-by-URL field-test** — pending live-repo invocation post-merge.
- **phase-27-7 baseline** retroactively forward-propped this phase (Rule 3 fix); future closeouts should include `phase-27-7/manifests-version.txt` in the forward-prop list alongside `phase-28.*` and `phase-28`.

## Phase 28.8 retrospective notes

- **Wave A lint-only branch (D-13)** — Phase 28.5 frontmatter contract already matched the 2 required agentskills.io spec fields (`name` + `description`); recommendation downgraded "adopt + consolidate converters" to "lint-only" + 5 skill renames + 13 cross-ref rewrites. Outcome: zero new converter file; one new lint script.
- **Codex catalog reuse (D-14)** — `.claude-plugin/marketplace.json` serves both Claude Code marketplace AND Codex catalog discovery via `codex plugin marketplace add owner/repo`. Saved authoring a separate `.codex-plugin/marketplace.json`. Structural advantage of Phase 28's marketplace.json design.
- **Cursor manifest format confirmed (D-15)** — `.cursor-plugin/plugin.json` per `cursor.com/docs/reference/plugins`. Earlier memory note ("no separate manifest exists") was RETRACTED — superseded by primary docs. Source-of-truth re-verify discipline (D-07) caught the stale observation.
- **Cursor application-gated field-test (D-16)** — D-09 revised from "maintainer runs `cursor marketplace publish` post-merge" to multi-step: submit publisher application → await Cursor team review → on approval publish manifest. Doctor reports application status. Honest accounting of review-window gate.
- **6-manifest discipline** — Plan called for 4-manifest lockstep + 2 new Tier-2 manifests. Tracked as "6-manifest lockstep" in the baseline test for Phase 28.9+.
- **Cross-naming-convention forward-prop oversight** — Plan listed only `phase-28.*` and `phase-28` for forward-prop; `phase-27-7` (hyphen naming) needed fwd-prop too. Rule 3 fix applied at Task 4. Future closeouts should sweep across BOTH naming conventions when surveying baseline forward-prop scope.
- **STATE.md edits manual (no gsd-tools state commands)** — per Phase 28.7 lessons learned; the tool's plan-counting model diverged from filesystem state in 28.7. Manual edit confirms-correct + audit-traceable.
- **D-05 backward-compat verified** — `git diff scripts/lib/install/converters/cursor.cjs scripts/lib/install/converters/codex.cjs` empty. Tier-1 file-drop install untouched.
