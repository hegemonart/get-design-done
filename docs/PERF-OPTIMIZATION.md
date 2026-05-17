# Pipeline Performance Optimization — Operator Guide

Phase 27.6 (v1.27.6, 2026-05-18) turns the Phase 22 telemetry stream into actionable perf optimizations. After 27.5 wired the bandit into production, `costs.jsonl` and `trajectories/<cycle>.jsonl` finally measure real spawns; this phase consumes that data and surfaces:

- cross-cycle token-cost regressions per agent
- cache-warming heuristic refinement
- data-driven parallel-mapper concurrency
- PreCompact snapshot + SessionStart recap for session continuity
- prompt-deduplication for the retrieval-contract preamble

This guide explains how each surface fires, how to interpret its output, and how to tune thresholds when the defaults misbehave.

## What shipped in v1.27.6

| Plan | Artifact | Purpose |
|------|----------|---------|
| 27.6-01 | `agents/perf-analyzer.md` + `scripts/lib/perf-analyzer/` | Reflector-tier cross-cycle analyzer reading `.design/telemetry/{costs,trajectories,events}.jsonl`. Surfaces top-3 token-cost regressions per agent + cache-hit-rate deltas + p95 latency spikes. |
| 27.6-02 | `reference/perf-budget.md` + `tests/perf-budget.test.cjs` | Per-agent token-cost budget table + CI regression gate. Fails on >25% regression vs baseline across 3 cycles (D-01). |
| 27.6-03 | `scripts/lib/cache/gdd-cache-manager.cjs` | Cache-warming heuristic: multiplicative `recency × frequency × cost` (D-06). LRU eviction within warmed set. Emits `cache.warm_decision` summary events. |
| 27.6-04 | `scripts/lib/parallelism-engine/concurrency-tuner.cjs` | Data-driven concurrency resolver reading `parallelism.verdict` events. Default = `min(cpu-1, last_observed_optimum)` capped at 8 (D-07). |
| 27.6-05 | `hooks/gdd-precompact-snapshot.js` + `hooks/gdd-sessionstart-recap.js` | Storybloq §4.6 transplant. PreCompact snapshot to `.design/snapshots/<ts>.json` (D-08); SessionStart recap to stderr + JSON sidecar (D-09). |
| 27.6-06 | `scripts/lib/prompt-dedup/index.cjs` + retrieval-contract extension | D-11 dedup: when ≥ 3 agents in same cycle read same `reference/*.md`, the retrieval-contract preamble adds a "shared context loaded once" marker. |

## How the CI regression gate fires

**File:** `tests/perf-budget.test.cjs`.

**Trigger:** Any agent whose p50 USD-cost exceeds baseline × `1 + perf_regression_threshold` across the last 3 distinct cycles fails the gate (D-01).

**Defaults:**

- `perf_regression_threshold`: `0.25` (25%). Source of truth: `reference/perf-budget.md` per-agent table.
- Baseline: `test-fixture/baselines/phase-27-6/perf-baseline.json` (synthetic per D-03; recalibrate after 1-2 real cycles).

**Cold-start tolerance:** The gate skips silently (CI green) when:

- `perf-baseline.json` is missing or malformed, OR
- `costs.jsonl` has fewer than 3 distinct cycles for the agent.

**Override:** Add a top-level key to `.design/budget.json`:

```json
{"perf_regression_threshold": 0.30}
```

This raises the bar to 30% (looser gate). Set lower for stricter enforcement.

## How to read perf-analyzer proposals

**Spawn:** Reflector-tier (D-04) — fires via `/gdd:reflect` or `/gdd:audit`, NOT per cycle. Running per-cycle wastes tokens; analysis is cross-cycle by nature.

**Output:** `.design/perf/<cycle-slug>.md` with 4 sections:

1. **Top-3 token-cost regressions** — agents whose p50 jumped >25% vs prior cycle.
2. **Cache-hit-rate deltas** — agents whose hit rate dropped >10 percentage points.
3. **p95 latency spikes** — wall-clock outliers beyond 2× median.
4. **Roll-up summary** — overall cycle cost vs prior cycle.

Each `[REGRESSION]` proposal includes a hypothesis (e.g., "context-engine churn after Phase X added Y") and `next_action` (e.g., "investigate retrieval-contract preamble bloat").

**Apply proposals:** Operator review via `/gdd:apply-reflections`. The reflector emits proposals; the operator decides which to act on.

## Cache-warming tuning

**Heuristic:** `score = recency × frequency × cost` (D-06). Top-N entries get warmed at session start. LRU eviction within the warmed set; next-rank candidate replaces evicted slot.

**Default top-N:** 10. Tunable via `.design/budget.json#cache_warm_topn` (future key reserved).

**False-positive emission:** When more than 20% of warmed entries get evicted before use within a single cycle (D-02), the cache layer emits a `cache.warm_decision` summary event with `{warmed_count, evicted_before_use_count, ratio}`. The perf-analyzer surfaces this as a `[CACHE-MISS]` proposal at reflection time.

**Tuning knob:** `.design/budget.json#cache_warming_falsepositive_threshold` (default `0.20`).

## Parallel-mapper concurrency

**Resolver:** `scripts/lib/parallelism-engine/concurrency-tuner.cjs::resolveConcurrency`.

**Algorithm (D-07):** `min(cpu_count - 1, last_observed_optimum)`, capped at 8.

**Inputs:**

- `cpu_count`: from `os.cpus().length`.
- `last_observed_optimum`: max `intended_concurrency` from the most recent successful (non-contended) `parallelism.verdict` event in `.design/telemetry/events.jsonl`.
- Hard ceiling: 8 (prevents process-spawn storms).

**Env override:** `GDD_CONCURRENCY_CEILING=4` caps the ceiling at 4 for the current process.

**Explicit override:** `opts.concurrency` passed to the runner always wins (back-compat). The resolver only kicks in when the caller omits the field.

**Wired into:**

- `explore-parallel-runner.ts`
- `discuss-parallel-runner.ts`

## PreCompact snapshots + SessionStart recap

**PreCompact hook** (`hooks/gdd-precompact-snapshot.js`, D-08):

- Fires immediately before Claude Code's PreCompact event.
- Writes `.design/snapshots/<ISO-timestamp>.json` atomically (`.tmp` + rename via `scripts/lib/lockfile.cjs::acquire`).
- Schema: `{schema_version, timestamp, cycle_id, state_md_sections, last_n_events, last_n_decisions}`.
- Retention: last 10 (LRU); older snapshots pruned.

**SessionStart recap** (`hooks/gdd-sessionstart-recap.js`, D-09):

- Fires at session boot.
- Reads most-recent snapshot, computes diff (new decisions, new events, cycle change, time elapsed).
- Stderr output: human-readable markdown summary.
- JSON sidecar: `.design/snapshots/last-recap.json` for downstream tools (`/gdd:resume`, `/gdd:progress`).

## Harness fallback (Codex)

Codex does NOT emit `PreCompact` (D-10). The harness-aware path:

- Set `CLAUDE_HARNESS=codex` or `GDD_HARNESS=codex` to opt in to the no-op behavior.
- Both hooks emit a one-line stderr notice and exit 0 (no crash, no orphan files).
- Full Codex `pre-large-context-action` interception is a Phase 45 dependency (harness-matrix.json).

Until Phase 45 ships, Codex users get a graceful degradation — no snapshot, no recap, but no crashes.

## Prompt deduplication

**Trigger (D-11):** When ≥ 3 distinct agents in the same cycle read the same `reference/*.md` file, the retrieval-contract preamble prepends a "shared context loaded once" marker. Subsequent agents see a content-hash reference instead of the full file body.

**Analyzer:** `scripts/lib/prompt-dedup/index.cjs`. Exports `detectDuplicateReferenceReads`, `buildPreambleInjection`, `emitDedupInjection`.

**Opt-out:** `GDD_DEDUP_OPT_OUT=1` in the spawning agent's environment bypasses dedup for that read.

**Event emission:** Each dedup decision emits a `dedup.injection` event for cross-cycle analysis by the perf-analyzer.

## Recalibration (D-03 follow-up)

v1.27.6 ships **synthetic baselines** built from cycle replay. After 1-2 real production cycles accumulate, the baseline must be re-locked against measured data.

**Process:**

1. Wait for `costs.jsonl` to accumulate ≥ 2 cycles of real production data.
2. Regenerate `test-fixture/baselines/phase-27-6/perf-baseline.json` from the actual costs.
3. Update `reference/perf-budget.md` table to reflect measured p50 values.
4. Commit: `chore(27.6): recalibrate perf-budget against measured cycles`.

This calibration is a follow-up patch, not a CI gate. The synthetic baseline is conservative enough that real-cycle data should fit within the 25% buffer until calibration tightens it.

## Troubleshooting

**"CI gate fires false positive."**

- Check `perf_regression_threshold` override in `.design/budget.json`. Raise to 30-40% if natural variance is high.
- Check baseline freshness — if `perf-baseline.json` is months stale and the codebase has changed, re-lock per the recalibration process above.

**"Snapshot file appears truncated."**

- This should never happen — the atomicity guarantee says `.tmp` + rename. If you see truncation, you may see orphan `.tmp` files (which are silently tolerated and never observed at the target path), but the target file is always whole. File a bug if you see a partial `.json` at the canonical path.

**"Codex session has no recap."**

- Expected per D-10. SessionStart recap depends on PreCompact snapshots, which Codex does not emit. Phase 45 dependency.

**"Cache hit rate is dropping."**

- Check perf-analyzer's `[CACHE-MISS]` proposals at next reflection.
- Verify the warming heuristic's score distribution — if all entries score similarly, the multiplicative composition is degenerate; adjust the input data or the threshold knobs.

**"Concurrency tuner picked a value that maxes out my CPU."**

- Set `GDD_CONCURRENCY_CEILING=2` (or similar) to cap the ceiling.
- Or pass explicit `opts.concurrency = 2` — overrides the resolver entirely.

## Cross-references

- `reference/perf-budget.md` — per-agent budget table.
- `agents/perf-analyzer.md` — cross-cycle reflector spec.
- `scripts/lib/perf-analyzer/` — telemetry-reader library.
- `scripts/lib/cache/gdd-cache-manager.cjs` — cache-warming heuristic.
- `scripts/lib/parallelism-engine/concurrency-tuner.cjs` — concurrency resolver.
- `scripts/lib/prompt-dedup/index.cjs` — D-11 dedup analyzer.
- `hooks/gdd-precompact-snapshot.js` + `hooks/gdd-sessionstart-recap.js` — snapshot/recap hooks.
- `tests/perf-budget.test.cjs` — CI regression gate.
- `reference/retrieval-contract.md` — Phase 14.5 preamble (extended by D-11 dedup section).
- `.planning/phases/27.6-pipeline-performance-token-cost-optimization/CONTEXT.md` — D-01..D-12 decisions.
