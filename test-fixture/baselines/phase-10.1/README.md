# Phase 10.1 Regression Baseline

**Status:** Locked when both `pre-baseline-cost-report.md` and `cost-report.md` report `status: locked`. Until then, reports carry `status: pending-first-run` and this directory is a methodology-only scaffolding.

## Purpose

Phase 10.1's success criterion 12 requires measured proof of ≥50% per-task token-cost reduction on `test-fixture/` versus the pre-10.1 baseline, with no regression on DESIGN-VERIFICATION.md gap count. Phase 12's regression test suite diffs against the locked baselines to catch drift.

## Methodology (per CONTEXT.md D-18 / D-19 / D-20)

### Step 1 — Identify pre-10.1 SHA

```bash
# Find the commit immediately BEFORE plan 01 (router + hook) landed.
# This is the pre-optimization baseline.
git log --oneline phase/10.1-optimization-layer ^main | tail -1
# First feat(10.1-01) commit is the landing point; its parent is PRE_OPT_SHA.
# Expected: parent of 8b509e6 feat(10.1-01): add model-prices.md + budget.json schema section
```

Record the SHA as `PRE_OPT_SHA` below.

`PRE_OPT_SHA=<fill-in>`

### Step 2 — Run pre-10.1 baseline

```bash
git checkout "$PRE_OPT_SHA"

# Snapshot the fixture in a working worktree so we don't pollute main
cd test-fixture/
# Invoke the minimal smoke pipeline — scan + discover + plan + design + verify
# Capture costs from the Anthropic API response headers OR from Claude Code's
# internal token ledger (whichever is available at measurement time).
/gdd:scan .
/gdd:discover
/gdd:plan
/gdd:design
/gdd:verify
```

Write per-agent costs (and total) to `pre-baseline-cost-report.md`. Mark `status: locked`.
Capture DESIGN-VERIFICATION.md gap count as `pre_gap_count`.

### Step 3 — Return to post-10.1 head and re-run

```bash
git checkout main   # or the post-10.1 merge commit
cd test-fixture/
# Clear any stale .design/ state so the run is clean
rm -rf .design/telemetry .design/cache-manifest.json .design/agent-metrics.json
/gdd:scan .
/gdd:discover
/gdd:plan
/gdd:design
/gdd:verify
```

Telemetry will accumulate in `.design/telemetry/costs.jsonl`. Summarize per-agent totals to `cost-report.md`. Mark `status: locked`.
Capture DESIGN-VERIFICATION.md gap count as `post_gap_count`.

### Step 4 — Verify acceptance

- `(pre_total_cost_usd - post_total_cost_usd) / pre_total_cost_usd >= 0.50`
- `post_gap_count <= pre_gap_count`

Both checks must pass for the baseline to lock. If the cost reduction is <50%, investigate cache hit rates, tier-downgrade frequency, and lazy-gate effectiveness in `.design/OPTIMIZE-RECOMMENDATIONS.md` before re-running.

## Files in this directory

- `README.md` — this file (methodology + acceptance criteria)
- `pre-baseline-cost-report.md` — pre-10.1 run cost breakdown
- `cost-report.md` — post-10.1 run cost breakdown + comparison

## Phase 12 Integration

Phase 12's regression-baseline test (`tests/**/regression-baseline.test.cjs`) reads `cost-report.md` and diffs against the locked numbers. A >10% upward drift in any per-agent cost flags a regression.
