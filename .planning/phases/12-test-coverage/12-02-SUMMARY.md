---
plan: 12-02
phase: 12
name: Regression baseline capture + diff harness
subsystem: tests
completed: "2026-04-18"
duration: "5 min"
tasks_completed: 2
files_created: 7
files_modified: 1
tags: [testing, regression, baseline, snapshot]
dependency_graph:
  requires: [12-01]
  provides: [phase-6-baseline, regression-diff-harness]
  affects: [tests/regression-baseline.test.cjs, test-fixture/baselines/phase-6/]
tech_stack:
  added: []
  patterns: [locked-baseline-snapshot, manifest-diff-test]
key_files:
  created:
    - test-fixture/baselines/phase-6/agent-list.txt
    - test-fixture/baselines/phase-6/skill-list.txt
    - test-fixture/baselines/phase-6/connection-list.txt
    - test-fixture/baselines/phase-6/plugin-version.txt
    - test-fixture/baselines/phase-6/agent-frontmatter-snapshot.json
    - test-fixture/baselines/phase-6/README.md
    - tests/regression-baseline.test.cjs
  modified:
    - package.json
decisions:
  - "[Phase 12-02]: Phase 6 baseline locks 14 agents, 12 skill dirs, 3 connection docs at plugin v1.0.0"
  - "[Phase 12-02]: Baseline captures manifest + frontmatter snapshot (not full file content) — lower maintenance burden"
  - "[Phase 12-02]: Version test uses >= baseline (not exact match) — allows future phases to bump version without re-lock"
requirements_satisfied: [TST-04, TST-05]
---

# Phase 12 Plan 02: Regression Baseline Capture + Diff Harness Summary

Phase 6 regression baseline locked with 14-agent manifest, 8-committed-skill-dir manifest, 3-connection-doc manifest, and agent frontmatter snapshot. Diff harness uses git ls-files for committed-state enumeration and runs 5 tests as part of the normal test suite.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Capture Phase 6 baseline snapshot | 9cba861 | test-fixture/baselines/phase-6/ (6 files) |
| 2 | Create regression-baseline.test.cjs | 2517e38 | tests/regression-baseline.test.cjs, package.json |
| fix | Use git ls-files for committed-file enumeration | 7d28c08 | tests/regression-baseline.test.cjs, skill-list.txt |

## What Was Built

**test-fixture/baselines/phase-6/** — snapshot of the plugin's structural metadata at Phase 6 (v1.0.0):
- `agent-list.txt`: 14 `design-*.md` agents sorted
- `skill-list.txt`: 8 committed skill directories sorted (untracked dirs excluded)
- `connection-list.txt`: 3 connection doc files sorted
- `plugin-version.txt`: `1.0.0`
- `agent-frontmatter-snapshot.json`: parsed frontmatter for all 14 agents (name, description, tools, color, model)
- `README.md`: re-lock procedure with explicit human-confirmation requirement

**tests/regression-baseline.test.cjs** — diff harness with 5 tests:
1. Agent list exact match against committed `agents/` files (via git ls-files)
2. Skill directory list exact match against committed `skills/` subdirs (via git ls-files)
3. Connection doc list exact match against `connections/`
4. Plugin version >= baseline (allows forward progression, blocks regression)
5. Agent frontmatter integrity — all baseline agents still exist with required fields (name, description, tools, color)

## Verification

```
npm test
> node --test "tests/**/*.cjs"

✔ tests\helpers.cjs (71ms)
✔ baseline: agent-list matches committed agents/ files (53ms)
✔ baseline: skill-list matches committed skills/ directories (51ms)
✔ baseline: connection-list matches connections/ directory (1ms)
✔ baseline: plugin version matches plugin-version.txt (1ms)
✔ baseline: agent frontmatter snapshot — no agent has lost required fields (8ms)
tests: 6 pass
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed npm test glob pattern for Windows**
- **Found during:** Task 2 verification
- **Issue:** `npm test` used single-quoted glob `'tests/**/*.cjs'` which CMD/PowerShell does not expand — node --test received the literal string as a path and found no files, reporting 0 tests run
- **Fix:** Changed package.json test script to use double-quoted glob `"tests/**/*.cjs"` which node's built-in glob expander handles correctly on all platforms
- **Files modified:** package.json
- **Commit:** 2517e38

**2. [Rule 1 - Bug] Use git ls-files instead of readdirSync for committed-file enumeration**
- **Found during:** Post-task 2 verification run
- **Issue:** `readdirSync` includes untracked working-tree files. The repo has untracked `design-discussant.md` in agents/ and extra skill dirs (discuss/, health/, list-assumptions/, etc.) from future-phase work. This caused false-positive test failures immediately after the baseline was created.
- **Fix:** Agent and skill tests now use `execSync('git ls-files ...')` to enumerate only committed files. `skill-list.txt` updated from 12 dirs to 8 committed dirs. Connection-list kept as `readdirSync` (connections/ has no untracked files).
- **Files modified:** tests/regression-baseline.test.cjs, test-fixture/baselines/phase-6/skill-list.txt
- **Commit:** 7d28c08

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced.

## Self-Check: PASSED
