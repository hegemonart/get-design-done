# Phase 13 Baseline — Relock Instructions

To relock this baseline (only if intentional behavior change), run from
the repo root:

```bash
TMPDIR=$(mktemp -d)
cp -r test-fixture/src/* "$TMPDIR/"
(cd "$TMPDIR" && node "$OLDPWD/scripts/build-intel.cjs" .)
rm -rf test-fixture/baselines/phase-13/intel/
if [ -d "$TMPDIR/.design/intel" ]; then
  mkdir -p test-fixture/baselines/phase-13/intel
  cp "$TMPDIR/.design/intel/"*.json test-fixture/baselines/phase-13/intel/
fi
```

Then update the "What changed" section of `BASELINE.md` with a short note,
update `scripts/release-smoke-test.cjs` if the artifact shape changed, and
commit as part of the phase-closeout PR.

The release-smoke-test (`scripts/release-smoke-test.cjs --baseline
test-fixture/baselines/phase-13`) must exit 0 against the freshly-locked
baseline. CI's release workflow runs this diff on every tag creation.
