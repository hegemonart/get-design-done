# Phase 13.3 Baseline — Relock Instructions

To relock this baseline (only if intentional behavior change), run from
the repo root:

```bash
# Capture the repo root explicitly in REPO_ROOT. Do NOT rely on shell
# variables that are only populated after a `cd` — they are unset in
# most fresh invocations (CI runners, direct README paste, subshells).
REPO_ROOT="$(pwd)"
TMPDIR="$(mktemp -d)"

# Clone a clean copy of the repo into TMPDIR, then run build-intel.cjs against
# the test-fixture in the clone. Using the clone avoids touching the working
# tree's .design/ state.
(
  cd "$TMPDIR" \
    && git clone "$REPO_ROOT" . \
    && node "$REPO_ROOT/scripts/build-intel.cjs" .
)

rm -rf test-fixture/baselines/phase-13.3/intel/
if [ -d "$TMPDIR/.design/intel" ]; then
  mkdir -p test-fixture/baselines/phase-13.3/intel
  cp "$TMPDIR/.design/intel/"*.json test-fixture/baselines/phase-13.3/intel/
fi

rm -rf "$TMPDIR"
```

Then update the "What changed" section of `BASELINE.md` with a short note,
update `scripts/release-smoke-test.cjs` if the artifact shape changed, and
commit as part of the phase-13.3 closeout PR.

The release-smoke-test (`scripts/release-smoke-test.cjs --baseline
test-fixture/baselines/phase-13.3`) must exit 0 against the freshly-locked
baseline. CI's release workflow runs this diff on every tag creation.
