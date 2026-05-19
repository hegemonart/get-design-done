---
phase: 28.8
plan: 28-8-X1
subsystem: distribution-bundler
tags: [tier-2, distribution, bundler, cursor-marketplace, codex-plugin, agentskills-io, deterministic]
dependency_graph:
  requires:
    - 28-8-A1 (lint-agentskills-spec.cjs — passthrough channel assumes clean source)
    - 28-8-B1 (cursor-marketplace.cjs converter — actual API: {buildManifest, convert})
    - 28-8-C1 (codex-plugin.cjs converter — actual API: {buildManifest, convert})
    - runtimes.cjs entries with kind: 'cursor-marketplace' (id 15) and 'codex-plugin' (id 16)
  provides:
    - scripts/build-distribution-bundles.cjs (Tier-2 multi-channel bundler orchestrator)
    - package.json scripts.build:bundles
    - .gitignore dist/ rule
    - tests/build-distribution-bundles.test.cjs (12 tests, 0 skip)
  affects:
    - dist/ output tree (created on build, not committed)
tech-stack:
  added: []
  patterns:
    - "Dependency injection via runtimesModule parameter for test isolation"
    - "Adapter-pattern divergence handling: bundler adapts to actual converter shape, converters unmodified"
    - "Two-key compat shim: passes both `claudePlugin` and `claudePluginJson` to converters"
    - "Best-effort ancillary-source loading (.claude-plugin/plugin.json, README first paragraph)"
    - "Deterministic recursive copy: sorted readdir + 0o644 mode + no timestamps"
    - "Lexicographic channel ordering for stable stdout + filesystem traversal"
key-files:
  created:
    - scripts/build-distribution-bundles.cjs (549 lines)
    - tests/build-distribution-bundles.test.cjs (403 lines)
  modified:
    - package.json (added scripts.build:bundles)
    - .gitignore (added dist/ block)
decisions:
  - "Adapted to actual Wave-B converter shape ({buildManifest, convert}) rather than the plan's hypothesized shape ({convertSkill, MANIFEST_PATH}). Adapter documented inline. Converters unmodified per D-05."
  - "Pass BOTH `claudePlugin` and `claudePluginJson` keys to converters — cursor-marketplace uses the latter, codex-plugin uses the former; sending both is the smallest-surface adapter."
  - "Wave-B integration tests run unguarded (B1 + C1 present) — `t.skip()` retained as fail-safe but the 12-test suite passes 12/12 with zero skips today."
metrics:
  duration: "~30 minutes (start 8:17pm GMT+3, end ~8:47pm GMT+3, 4 commits)"
  task_count: 2
  file_count: 4
  test_count: 12
  test_skipped: 0
  test_failed: 0
  npm_test_total: 2626
  npm_test_pass: 2592
  npm_test_fail: 0
  npm_test_skipped: 34
  completed_date: "2026-05-19"
---

# Phase 28.8 Plan 28-8-X1: build-distribution-bundles.cjs (shared-source / multi-channel bundler) Summary

Shipped the Wave-C convergence orchestrator that fans canonical `skills/` into three channel-specific bundles under `dist/` from a single CLI invocation. Discovers Tier-2 channels by inspecting `scripts/lib/install/runtimes.cjs` for entries with `kind: 'cursor-marketplace'` or `kind: 'codex-plugin'` (data-driven, no hardcoded channel-ID lists in the discovery path) and adds a hardcoded `agentskills-io` passthrough per D-02/D-13. Deterministic: two runs produce byte-identical output. Tier-1 install paths under `scripts/install.cjs` + `scripts/lib/install/installer.cjs` are untouched.

## What Shipped

| Artifact | Lines | Role |
|----------|-------|------|
| `scripts/build-distribution-bundles.cjs` | 549 | Bundler orchestrator. Exports `buildAllChannels`, `buildChannel`, `discoverTier2Channels`, `enumerateSkills`, `loadAncillarySources`, `main`, `parseArgs`, `EXIT_CODES`. CLI: `--help`, `--channel <id>`, bare. |
| `tests/build-distribution-bundles.test.cjs` | 403 | 12-test suite using `node:test` + `node:assert/strict` per Phase 28.5+ idiom. All tmpdir per D-10. |
| `package.json` (modified) | +1 line | `scripts.build:bundles = "node scripts/build-distribution-bundles.cjs"` |
| `.gitignore` (modified) | +5 lines | `dist/` excluded as build artifact |

## Commits

| Hash | Type | Message |
|------|------|---------|
| `4b7cc6d` | feat | `feat(28-8-X1): build-distribution-bundles.cjs orchestrator` |
| `ff258a4` | chore | `chore(28-8-X1): wire build:bundles npm script + dist/ gitignore` |
| `c72698f` | test | `test(28-8-X1): bundler tests` |
| `01b5951` | fix | `fix(28-8-X1): re-add dist/ to .gitignore (lost in prior commit collision)` |

## Verification Results

All gates from the plan's `<verify>` + `<success_criteria>` blocks:

| Gate | Result |
|------|--------|
| Bundler exports all 6 required functions + `EXIT_CODES` | PASS |
| `EXIT_CODES.OK === 0`, `CONVERTER_ERROR === 1`, `MISSING_DEPENDENCY === 2` | PASS |
| `node scripts/build-distribution-bundles.cjs --help` exits 0 with usage text | PASS |
| `node scripts/build-distribution-bundles.cjs` (no args, real repo) produces 3 dirs: `cursor-marketplace/`, `codex-plugin/`, `agentskills-io/` | PASS (file counts: 91/91/90) |
| Each Tier-2 bundle has its channel-specific manifest at documented path; passthrough has none | PASS |
| Two consecutive runs produce byte-identical `dist/` trees | PASS (verified via `diff -r` exit 0 + Test 12 sha256-snapshot check) |
| `node scripts/build-distribution-bundles.cjs --channel cursor-marketplace` produces only that channel | PASS |
| Missing converter → exit 2 with informative stderr | PASS (`MISSING_CONVERTER`) |
| Converter throw → exit 1, error names channel + skill | PASS (`CONVERTER_EXEC_FAILED`, error message includes skill name "alpha") |
| `package.json` `scripts.build:bundles` correctly wired | PASS |
| `.gitignore` matches `^dist/?$` | PASS (line 45) |
| Tier-2 channel discovery is data-driven (no hardcoded IDs in discovery) | PASS |
| `agentskills-io` hardcoded as passthrough | PASS (`PASSTHROUGH_CHANNEL` frozen const) |
| `dist/codex-plugin/.codex-plugin/marketplace.json` does NOT exist (D-14) | PASS |
| `dist/cursor-marketplace/.cursor-plugin/plugin.json` exists (D-15) | PASS |
| Determinism rules enforced (sorted readdir, 0o644, no Date.now/PID/random in script) | PASS |
| `node --test tests/build-distribution-bundles.test.cjs` | PASS 12/12 |
| `npm test` (full suite) green | PASS 2592/2626 (34 skip, 0 fail) |
| Phase 28.7 install tests unaffected | PASS 98/102 (4 skip, 0 fail) |

## Adapter Divergence (key implementation note)

The plan's `<interfaces>` block hypothesized the Wave-B converter contract as:

```js
{
  convertSkill({ skillName, skillDir, sourceRoot }) → Array<{relPath, content}>,
  buildManifest({ skillNames, packageJson, sourceRoot }) → string,
  MANIFEST_PATH: '.cursor-plugin/plugin.json' | '.codex-plugin/plugin.json',
}
```

The actual shape that B1 (`27432c8`) and C1 (`31e4752`) shipped is:

```js
{
  buildManifest(sources, opts) → manifest OBJECT,
  convert({ skillsDir, outDir, manifest }, opts) → { manifestPath, outDir },
  CURATED_KEYWORDS: Object.freeze([...]),
}
```

Differences and how the bundler adapted (without modifying converters, per the plan's explicit "Adapter divergence handling" clause and D-05):

| Plan-hypothesized | Wave-B actual | Bundler adaptation |
|-------------------|---------------|--------------------|
| `convertSkill()` (per-skill, returns file list) | `convert()` (bundle-level, writes files directly to outDir) | Bundler calls `convert()` once per channel, not per skill. Bundler still enumerates skills upfront so error messages can list skill names. |
| `buildManifest()` returns string | `buildManifest()` returns object | Bundler passes the object straight to `convert()` — converters JSON.stringify internally. |
| `MANIFEST_PATH` export | Not exported (paths hardcoded inside `convert()` as `.cursor-plugin/plugin.json` / `.codex-plugin/plugin.json`) | Bundler doesn't need to know the manifest path — `convert()` writes it. |
| `buildManifest` accepts `{ skillNames, packageJson, sourceRoot }` | `buildManifest` accepts `{ packageJson, claudePlugin / claudePluginJson, marketplaceJson, readmeFirstPara }` | Bundler builds `sources` from `packageJson` + best-effort `loadAncillarySources(sourceRoot)`. Passes BOTH `claudePlugin` and `claudePluginJson` keys because cursor-marketplace.cjs reads the "Json" suffix and codex-plugin.cjs reads the bare name. |

The adapter is documented inline in `scripts/build-distribution-bundles.cjs` at the module header and at `buildChannel()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Re-added `dist/` to `.gitignore`**
- **Found during:** Final verification gate run (after commit `c72698f`)
- **Issue:** My `chore(28-8-X1)` commit `ff258a4` was supposed to add a `dist/` block to `.gitignore` alongside an unrelated `.cursor-plugin/marketplace-state.json` line from a parallel Wave-B2 edit (the file was modified between my Read and Edit calls). The Edit succeeded mid-flight but a linter pass during commit kept only the B2 line and dropped my `dist/` line. The plan's verify regex `^dist/?$` failed.
- **Fix:** Added a new commit `01b5951` that restores the `dist/` block.
- **Files modified:** `.gitignore` (added 5 lines)
- **Commit:** `01b5951`

**2. [Rule 3 - Blocking] Adapted to actual converter API divergence**
- **Found during:** Task 1 — reading B1 + C1 converter sources before authoring orchestrator
- **Issue:** The plan's `<interfaces>` documented a `{ convertSkill, buildManifest → string, MANIFEST_PATH }` contract that the Wave-B converters did NOT ship. The actual contract is `{ buildManifest → object, convert, CURATED_KEYWORDS }`.
- **Fix:** Adapted `buildChannel()` to invoke `convert()` once per channel (not `convertSkill()` per skill); pass a manifest object (not string) directly; no `MANIFEST_PATH` lookup needed because `convert()` writes the manifest itself. Also passes both `claudePlugin` and `claudePluginJson` accessor keys for compatibility with either converter. Documented inline.
- **Files modified:** `scripts/build-distribution-bundles.cjs`
- **Commit:** `4b7cc6d`
- **Rationale:** Plan's "Adapter divergence handling" clause + D-05 (no edits to existing files) explicitly prescribe this approach. Converters are the authoritative contract.

**3. [Rule 2 - Missing Critical] Best-effort ancillary-source loader**
- **Found during:** Task 1 — actual converter API consumes more than just `packageJson`
- **Issue:** Both real Wave-B converters consume `.claude-plugin/plugin.json` (priority source for `name` / `author`) and `.claude-plugin/marketplace.json` (priority source for `category`). The plan's hypothesized API only mentioned `packageJson`. Without these, the manifests would have lower-fidelity field values.
- **Fix:** Added `loadAncillarySources(sourceRoot)` — best-effort, swallow-on-parse-error reader for `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and README first paragraph. Returns absent keys (not throws) when sources are missing, so tmpdir test fixtures without these files still work.
- **Files modified:** `scripts/build-distribution-bundles.cjs`
- **Commit:** `4b7cc6d`

### Out-of-scope discoveries

- Parallel Wave B2 work (`8c6d9ed` + `68fddf6`) landed mid-execution touching `scripts/install.cjs` + new files `scripts/lib/install/doctor-cursor-marketplace.cjs` + `docs/cursor-marketplace-field-test.md` + `tests/fixtures/cursor-marketplace/`. Per scope-boundary rule, I did not touch these — they are B2's responsibility. Untracked files at session end are B2's; X1 has none.

## Authentication Gates

None — entirely offline work, no API calls.

## STRIDE Mitigations Implemented

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-28.8-X1-01 (Tampering / require kind-derived path) | mitigate | `converterPath` constructed only from `kind` field in version-controlled `runtimes.cjs`. Documented inline. |
| T-28.8-X1-02 (Tampering / --channel arg path-traversal) | mitigate | `channelFilter` compared via string equality against discovered channel IDs, never used as path component. Test 7 (`--channel bogus` → exit 2) covers. |
| T-28.8-X1-03 (Tampering / symlinks in skills/) | mitigate | `copyDirRecursive` only propagates `entry.isFile()` + `entry.isDirectory()`. Symlinks silently skipped. Documented inline. |
| T-28.8-X1-04 (DoS / tmpfile race) | accept | Single-process maintainer script. Bundler does NOT use tmpfile-then-rename anymore (direct `writeFileSync` is sufficient for the single-writer model). Documented. |
| T-28.8-X1-05 (InfoDisc / packageJson in manifest) | accept | All inputs are public-repo content; bundle output IS the public publishing surface. |
| T-28.8-X1-06 (Tampering / dist/ checked in) | mitigate | `.gitignore` excludes `dist/`. |
| T-28.8-X1-07 (Repudiation / partial bundle on converter throw) | mitigate | `ensureCleanDir(bundleRoot)` runs at start of each `buildChannel`. Partial state stays for inspection until next clean run; exit 1 surfaces failure. |
| T-28.8-X1-08 (Elevation / file mode) | mitigate | Explicit `mode: 0o644` on every `writeFileSync`. |

## Test Coverage Detail

12 tests in `tests/build-distribution-bundles.test.cjs`:

1. `discoverTier2Channels filters by kind + always includes agentskills-io passthrough` — fixture runtimes module with mixed kinds; assert only Tier-2 kinds + passthrough emerge
2. `agentskills-io bundle is passthrough copy of skills/ — byte-identical, no manifest` — passthrough byte-identity for both `SKILL.md` and supporting files
3. `buildAllChannels — passthrough determinism (two runs byte-identical)` — sha256 snapshot diff
4. `--channel agentskills-io filter — only that channel built`
5. `main(--help) returns 0 and prints usage to stdout`
6. `main(unknown arg) returns 2 with error + usage on stderr`
7. `main(--channel bogus) returns 2 with informative error message`
8. `missing converter file — buildChannel throws MISSING_CONVERTER`
9. `converter convert() throws — buildChannel surfaces CONVERTER_EXEC_FAILED`
10. `converter buildManifest() throws — buildChannel surfaces MANIFEST_BUILD_FAILED`
11. `buildAllChannels with real Wave-B converters — 3 bundles + correct manifest paths` (integration, asserts D-14 + D-15)
12. `buildAllChannels with real Wave-B converters — full determinism (two runs byte-identical)` (integration, sha256 snapshot diff across all 3 channels)

Tests 11+12 use the real Wave-B converters and tmpdir source roots, fail-loud rather than skip (B1+C1 present). Skip guards retained as fail-safe.

## Known Stubs

None. The bundler is fully wired end-to-end against real Wave-B converters and the canonical `skills/` tree.

## Threat Flags

None — no new security-relevant surface beyond the documented STRIDE register.

## Self-Check: PASSED

- `scripts/build-distribution-bundles.cjs`: FOUND (549 lines)
- `tests/build-distribution-bundles.test.cjs`: FOUND (403 lines)
- Commit `4b7cc6d` (feat): FOUND
- Commit `ff258a4` (chore): FOUND
- Commit `c72698f` (test): FOUND
- Commit `01b5951` (fix): FOUND
- `package.json` build:bundles wired: VERIFIED
- `.gitignore` dist/ matches `^dist/?$`: VERIFIED (line 45)
- `npm test` green: VERIFIED (2592/2626 pass, 0 fail, 34 skip)
- Tier-1 install tests green: VERIFIED (98/102 pass, 0 fail)
- Bundler smoke test (real repo): VERIFIED (3 channels, byte-identical determinism via `diff -r` exit 0)
