# Phase 13.3 Regression Baseline

**Locked:** 2026-04-19
**Plugin version:** 1.0.7.3
**Phase:** 13.3 — Plugin Update Checker

## What this baseline locks

The deterministic output of `/gdd:explore` on `test-fixture/src/` as of
plugin v1.0.7.3. The release-time smoke test diffs against this baseline
on every tag creation; a diff fails the build and surfaces the manual
rollback command.

## Artifacts

- `intel/*.json` — output of `scripts/build-intel.cjs` on `test-fixture/src/`
  (if the script produces artifacts for this fixture; may be empty for a
  CSS-only / small fixture — see phase-13 baseline for prior shape)
- `BASELINE.md` — this manifest
- `README.md` — relock instructions

At lock time the fixture (`test-fixture/src/App.jsx`, `App.css`, `index.css`)
is small enough that `build-intel.cjs` produces no deterministic intel slices
— the baseline is therefore a manifest-only lock, matching the phase-13
pattern. The release-smoke-test script (`scripts/release-smoke-test.cjs`)
treats missing artifacts as informational, not failures; only byte-level
diffs fail the build.

## What changed vs phase-13 baseline

Phase 13.3 does NOT change pipeline output — it only adds:
- a SessionStart hook (`hooks/update-check.sh`)
- a Haiku-tier enrichment agent (`agents/design-update-checker.md`)
- a manual slash command (`skills/check-update/SKILL.md`)
- a schema field (`update_dismissed`)
- footer banners on 6 safe-window skills (no change to their core output)

None of these touch the pipeline stages (brief → explore → plan → design
→ verify) or the intel-build script. The pipeline-output baseline is
therefore equivalent to phase-13's modulo the plugin version string
(1.0.7 → 1.0.7.3). Any unexpected diff vs phase-13 in this baseline
reflects a bug, not intentional change.

## Relock procedure

See `README.md` in this directory, or `CONTRIBUTING.md` §"Baseline
relock how-to" for the one-shot command.
