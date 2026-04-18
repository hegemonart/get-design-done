---
phase: 12
plan: "04"
name: Config + commands + hooks + system tests
subsystem: tests
tags: [testing, config, commands, hooks, frontmatter, schema, semver]
dependency_graph:
  requires: [12-01]
  provides: [config-schema-tests, command-skill-parity-tests, hook-integrity-tests, system-correctness-tests]
  affects: [tests/]
tech_stack:
  added: []
  patterns: [node:test, node:assert/strict, scaffoldDesignDir helper, readFrontmatter helper]
key_files:
  created:
    - tests/config.test.cjs
    - tests/commands.test.cjs
    - tests/command-count-sync.test.cjs
    - tests/hook-validation.test.cjs
    - tests/atomic-write.test.cjs
    - tests/frontmatter.test.cjs
    - tests/model-profiles.test.cjs
    - tests/verify-health.test.cjs
    - tests/worktree-safety.test.cjs
    - tests/semver-compare.test.cjs
    - tests/schema-drift.test.cjs
  modified:
    - tests/helpers.cjs
decisions:
  - "hook-validation.test.cjs uses regex that extracts path segment after ${CLAUDE_PLUGIN_ROOT} env var, then resolves relative to REPO_ROOT"
  - "schema-drift.test.cjs uses embedded template extraction (BEGIN/END TEMPLATE markers) since STATE-TEMPLATE.md stores frontmatter inside a code block, not as top-level YAML"
  - "semver-compare.test.cjs uses marketplaceJson.metadata.version (not top-level .version) to match actual marketplace.json structure"
  - "helpers.cjs default STATE.md updated to include wave/started_at/last_checkpoint to match STATE-TEMPLATE.md canonical schema"
metrics:
  duration: "4 minutes"
  completed: "2026-04-18"
  tasks_completed: 3
  files_changed: 12
---

# Phase 12 Plan 04: Config + commands + hooks + system tests Summary

Eleven test files covering .design/config.json schema validation, command-skill parity, hook file integrity, atomic write patterns, frontmatter edge cases, model profile validation, health output contract, worktree isolation, semver bump sequence, and schema drift detection between STATE-TEMPLATE.md and scaffoldDesignDir output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 01 | Config/commands/hook-validation tests | b6b5b82 | tests/config.test.cjs, commands.test.cjs, command-count-sync.test.cjs, hook-validation.test.cjs |
| 02 | Atomic-write/frontmatter/model-profiles/health/worktree/semver tests | 5c94c24 | tests/atomic-write.test.cjs, frontmatter.test.cjs, model-profiles.test.cjs, verify-health.test.cjs, worktree-safety.test.cjs, semver-compare.test.cjs |
| 03 | Schema-drift test | 6535861 | tests/schema-drift.test.cjs, tests/helpers.cjs |

## Test Results

All 35 tests pass (11 new + 5 prior regression-baseline + existing):

```
tests 35 | pass 35 | fail 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] hook-validation.test.cjs regex extracted wrong path segment**
- **Found during:** Task 01 verification
- **Issue:** The original regex `['"${}A-Z_]*([./][^'"}\s]+)` matched `/scripts/bootstrap.sh` without the REPO_ROOT prefix, producing an absolute path starting with `/` that didn't resolve
- **Fix:** Rewrote regex to capture the path segment after `${VAR_NAME}` in group 1, then joins with REPO_ROOT when the extracted path starts with `/`
- **Files modified:** tests/hook-validation.test.cjs
- **Commit:** b6b5b82

**2. [Rule 1 - Bug] schema-drift.test.cjs extractFrontmatterFields found no fields in STATE-TEMPLATE.md**
- **Found during:** Task 03 verification
- **Issue:** STATE-TEMPLATE.md has no top-level YAML frontmatter — the `---` block is embedded inside a fenced code block between `==== BEGIN TEMPLATE ====` markers. The regex `/^---\n/` found nothing.
- **Fix:** Added fallback path in `extractFrontmatterFields` that looks for the embedded template block via `BEGIN TEMPLATE ====` marker and extracts frontmatter from inside it
- **Files modified:** tests/schema-drift.test.cjs
- **Commit:** 6535861

**3. [Rule 1 - Bug] helpers.cjs default STATE.md missing fields from STATE-TEMPLATE.md canonical schema**
- **Found during:** Task 03 — schema-drift test third case correctly flagged `wave`, `started_at`, `last_checkpoint` as missing
- **Issue:** scaffoldDesignDir's default STATE.md had `pipeline_state_version`, `stage`, `cycle`, `model_profile` but not `wave`, `started_at`, `last_checkpoint` — a real schema drift the test was designed to catch
- **Fix:** Added the three missing fields to the default state in helpers.cjs so the scaffold matches the canonical template
- **Files modified:** tests/helpers.cjs
- **Commit:** 6535861

**4. [Rule 1 - Bug] semver-compare.test.cjs used wrong path for marketplace.json version**
- **Found during:** Task 02 implementation review (pre-emptive fix before running)
- **Issue:** Plan's template used `marketplaceJson.version` but the actual marketplace.json stores version at `metadata.version`, not top-level
- **Fix:** Used `marketplaceJson.metadata ? marketplaceJson.metadata.version : marketplaceJson.version` for safe access
- **Files modified:** tests/semver-compare.test.cjs
- **Commit:** 5c94c24

## Known Stubs

None. All tests exercise real project artifacts (skills/, hooks.json, plugin.json, STATE-TEMPLATE.md, agents/).

## Self-Check: PASSED

- tests/config.test.cjs: FOUND
- tests/schema-drift.test.cjs: FOUND
- commit b6b5b82: FOUND
- commit 5c94c24: FOUND
- commit 6535861: FOUND
- All 35 tests pass: VERIFIED
