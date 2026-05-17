---
name: perf-budget
phase: 27.6
version: 1.0.0
type: meta-rules
description: Per-agent token-cost budget reference and CI regression-gate documentation. Budgets sourced from current p50 + 25% buffer (Phase 27.6 D-05); CI gate fails on >25% regression vs baseline across 3 cycles (D-01); thresholds configurable via .design/budget.json.
---

# Per-Agent Performance Budgets — Phase 27.6

This reference documents the token-cost budgets that the pipeline measures itself against. Two surfaces consume this document:

1. `tests/perf-budget.test.cjs` — CI regression gate. Fails the build when any agent's p50 USD-cost has regressed > 25% vs baseline across the last 3 cycles.
2. `agents/perf-analyzer.md` — cross-cycle reflector. Reads the same budget + telemetry; surfaces top-3 regressions as `[REGRESSION]` proposals.

Phase 27.5 (v1.27.5, shipped 2026-05-17) made production telemetry real by wiring the bandit into routing. Phase 27.6 reads what 27.5 writes.

---

## How budgets are derived

Per **D-05**, each per-agent budget is the agent's current p50 USD-cost plus a 25% buffer (`p50 × 1.25`). The buffer absorbs natural cycle-to-cycle variance without firing the gate, while still flagging genuine cost growth.

Per **D-03**, the v1.27.6 baseline data lives at `test-fixture/baselines/phase-27-6/perf-baseline.json` and is built from **synthetic cycle replay**. Real-cycle calibration ships as a follow-up after 1-2 production cycles accumulate, via the commit:

```
chore(27.6): recalibrate perf-budget against measured cycles
```

Per **D-01**, the regression-gate threshold is **25%**, configurable via `.design/budget.json#perf_regression_threshold`. A minimum of **3 distinct cycles** must be observed per agent before that agent is evaluated for regression. Agents with fewer than 3 cycles are silently skipped (cold-start tolerance).

This conservative-then-tighten discipline matches Phase 23.5 `PRIOR_STRENGTH` calibration — start wide to avoid noise, tighten once enough samples accumulate to compute realistic p95 bounds.

---

## Per-agent budget table

| Agent | p50 budget (USD) | Buffer | Hit-rate baseline | p95 wall (ms) | Notes |
|---|---|---|---|---|---|
| design-verifier | 0.04 | 0.05 (+25%) | 0.55 | 12000 | Stage 5; reads DESIGN-VERIFICATION.md scoring rubric |
| design-planner | 0.08 | 0.10 (+25%) | 0.40 | 18000 | Stage 3; opus default |
| design-executor | 0.06 | 0.075 (+25%) | 0.50 | 15000 | Stage 4 |
| design-context-checker | 0.02 | 0.025 (+25%) | 0.65 | 6000 | Gate; pre-stage validator |
| design-reflector | 0.10 | 0.125 (+25%) | 0.35 | 22000 | XL reflector tier |
| design-discussant | 0.05 | 0.0625 (+25%) | 0.45 | 11000 | Spawned by `/gdd:discuss` |
| perf-analyzer | 0.10 | 0.125 (+25%) | 0.30 | 22000 | XL reflector tier (this phase) |

These values are **seed numbers**, re-calibrated after 1-2 real production cycles. The authoritative numbers live in `test-fixture/baselines/phase-27-6/perf-baseline.json` (created at Phase 27.6 closeout in Plan 27.6-06). The CI gate reads that file at runtime, not this table.

When the baseline JSON is **absent** (first run after this plan lands but before 27.6-06), the gate passes silently with a stderr notice — it does NOT block Wave A from shipping.

---

## CI Regression Gate

File: `tests/perf-budget.test.cjs`

Algorithm (single source of truth — re-uses `detectCostRegressions` from `scripts/lib/perf-analyzer/cost-regression.cjs`):

1. Load `test-fixture/baselines/phase-27-6/perf-baseline.json`. If absent, exit early — gate passes with stderr notice. (Phase 27.6-06 creates this file at closeout.)
2. Load `.design/telemetry/costs.jsonl` via `loadCosts`. If absent or empty, exit early — no data to regress against.
3. Read `perf_regression_threshold` from `.design/budget.json` (default 25 per D-01).
4. Call `detectCostRegressions({rows, baseline: parsedBaseline.agents, thresholdPct, cyclesRequired: 3})`.
5. If `result.regressions.length === 0`, gate passes.
6. Otherwise, fail the test with the regression details (agent, baseline_p50_usd, current_p50_usd, delta_pct, cycles_observed).

The gate is intentionally **low-noise**:

- Skips agents with fewer than 3 distinct cycles of data (avoids false positives during cold-start).
- Only fires on the **regression rule** — NOT on cache-hit-rate drops or p95 latency spikes; those surface as `agents/perf-analyzer.md` proposals only.
- Top-3 cap on the regressions list — a "noisy day" can flag at most three agents, never the entire roster.

The gate runs as a regular `node --test` entry under the `tests/**/*.test.cjs` glob — no special CI wiring required. If you can run `npm test`, you run the gate.

---

## Tuning the Gate

Override the regression threshold by adding to `.design/budget.json`:

```json
{
  "perf_regression_threshold": 30
}
```

Override the cache-warming false-positive tolerance (used by Phase 27.6-03):

```json
{
  "cache_warming_falsepositive_threshold": 25
}
```

**Defaults** (per Phase 27.6 D-01 + D-02):

- `perf_regression_threshold: 25`
- `cache_warming_falsepositive_threshold: 20`

After 5 measured cycles accumulate, re-tune based on observed natural variance. The 25%-default is conservative — likely too loose once real telemetry stabilizes. The first tightening pass belongs to a measurement-gated follow-up, not v1.27.6 itself.

---

## Recalibration (Phase 27.6 D-03 follow-up)

v1.27.6 ships with synthetic-cycle-replay baselines. After 1-2 real production cycles accumulate, re-lock the baseline:

```
chore(27.6): recalibrate perf-budget against measured cycles
```

That commit:

1. Re-runs the baseline-fixture build against real telemetry.
2. Updates `test-fixture/baselines/phase-27-6/perf-baseline.json` with the measured p50, hit_rate, and p95_ms per agent.
3. Bumps the budget numbers in this document to match.
4. Optionally tightens `perf_regression_threshold` from 25 toward 15-20 if measured variance permits.

The synthetic baseline is **not a hack** — it's the documented v1 path per spec Success Criterion #7. Real-cycle data simply doesn't exist yet at v1.27.6 cut, because Phase 27.5 only shipped 2026-05-17.

---

## Cross-references

- `agents/perf-analyzer.md` — cross-cycle reflector that reads the same baseline. Surfaces top-3 cost regressions, hit-rate deltas, and p95 spikes as `[REGRESSION]` proposals per `/gdd:reflect`.
- `scripts/lib/perf-analyzer/cost-regression.cjs` — **single source of truth** for the regression rule. The CI gate re-uses `detectCostRegressions` from this module; it does NOT re-implement the rule.
- `scripts/lib/perf-analyzer/index.cjs` — telemetry loader (`loadCosts`, `loadTrajectories`). JSONL-tolerant; blank lines silently ignored, malformed lines counted in `skipped_count`.
- `tests/perf-budget.test.cjs` — the CI gate itself. Always-green when no baseline + no data; fails on >25% regression vs baseline once both exist.
- `reference/bandit-integration.md` — Phase 27.5 routing reference (precursor; the bandit picks tier **within** the budget — the gate evaluates whether the picked tier behaved within budget).
- `.design/budget.json` — operator-tunable thresholds. Optional file; absent file means defaults (`perf_regression_threshold: 25`, `cache_warming_falsepositive_threshold: 20`).
- `test-fixture/baselines/phase-27-6/perf-baseline.json` — authoritative per-agent p50 / hit_rate / p95_ms values. Created in Plan 27.6-06 closeout.

---

## Boundary semantics (matching detectCostRegressions)

- **>= threshold** is a regression. A current p50 exactly 25% above baseline (e.g., baseline 0.05, current 0.0625) fires the gate. This matches the Phase 27.6-01 test contract.
- **base = 0 + current > 0** → flagged as `delta_pct: Infinity`. A previously-zero-cost agent becoming non-zero is always a regression.
- **base = 0 + current = 0** → NOT a regression (both `delta_pct = 0`).
- **Missing baseline entry** → agent silently skipped (no false positive on new agents that haven't been calibrated yet).

The gate's "fail loud, false-positive rare" character comes from these boundary choices plus the 3-cycle minimum — together they make the gate safe to wire into CI without flaking on first-run noise.
