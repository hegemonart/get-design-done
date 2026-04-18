# Phase 13 Regression Baseline

**Locked:** 2026-04-18
**Plugin version:** 1.0.7
**Phase:** 13 — CI/CD

## What this baseline locks

The deterministic output of `/gdd:explore` on `test-fixture/src/` as of
plugin v1.0.7. The release-time smoke test (plan 13-07) diffs against this
baseline on every tag creation; a diff fails the build and surfaces the
manual rollback command.

## Artifacts

- `intel/*.json` — output of `scripts/build-intel.cjs` on `test-fixture/src/`
  (if the script produces artifacts for this fixture; may be empty for a
  CSS-only / small fixture — see phase-11 baseline for prior shape)
- `BASELINE.md` — this manifest
- `README.md` — relock instructions

At lock time the fixture (`test-fixture/src/App.jsx`, `App.css`, `index.css`)
is small enough that `build-intel.cjs` produces no deterministic intel slices
— the baseline is therefore a manifest-only lock. The release-smoke-test
script (`scripts/release-smoke-test.cjs`) treats missing artifacts as
informational, not failures; only byte-level diffs fail the build. This
matches the phase-11 baseline pattern.

## What changed vs phase-11 baseline

Phase 13 does NOT change agent behavior — it only adds CI/CD automation.
The pipeline-output baseline is therefore equivalent to phase-11's modulo
the plugin version string (1.0.5 → 1.0.7). Any unexpected diff vs phase-11
in this baseline reflects a bug, not intentional change.

## Relock procedure

See `CONTRIBUTING.md` §"Baseline relock how-to", or `README.md` in this
directory for the one-shot command.
