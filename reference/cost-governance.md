# Cost Governance - Forecast, Project Cap, and ROI

Phase 39.2 contract. GDD already tracks cost (Phase 10.1 per-task caps, Phase 26 per-runtime
telemetry, Phase 27.5 bandit cost-arbitrage) - but it never *forecasts* spend, never imposes a
*project-level* hard cap, and never shows whether the spend actually *shipped* anything. This file is
the contract for the three pieces that close those gaps: the **forecast model**, the **`project_cap`
hard-halt**, and the **ROI dashboard**. All three are read-only/report-only except the hook, which
only ever *blocks* a spawn - it never spends, edits config, or mutates telemetry.

## Telemetry inputs

- **`.design/telemetry/costs.jsonl`** (OPT-09) - one row per agent spawn:
  `{ ts, agent, tier, tokens_in, tokens_out, cache_hit, est_cost_usd, cycle, phase }`.
  The **`cycle`** field is the join key: grouping `est_cost_usd` by `cycle` gives per-cycle USD totals.
- **`.design/telemetry/events.jsonl`** - the event stream; this phase appends three new `type`s
  (below).
- **Cycle identity** - `.design/STATE.md` frontmatter `cycle:`. There is no `CYCLES.md`; per-cycle
  commit counts are computed on demand from `git log` (the `/hone:stats` precedent).

## Forecast model (`scripts/lib/budget/cost-forecast.cjs`, pure)

Group `costs.jsonl` by `cycle` → an array of per-cycle USD totals. From the **mean** `m` and
**population standard deviation** `σ` of those rates, the three scenarios are:

| Scenario | Per-cycle rate | Meaning |
|---|---|---|
| `best` | `max(0, m − k·σ)` | spend trends down / variance favorable |
| `typical` | `m` | steady state |
| `worst` | `m + k·σ` | spend trends up / variance unfavorable |

`k = 1` by default. The projection over the next `N` cycles is linear: `projectedTotal = rate · N`.
`cyclesToCap(currentSpend, cap, rate)` returns the integer number of cycles until `currentSpend`
reaches `cap` at that rate - `Infinity` when `rate ≤ 0`, `0` when already at/over the cap. This powers
the `/hone:budget` warning **"at the current rate you'll hit cap $X in Y cycles."**

The math is a pure, dep-free, deterministic core (no fs, no clock, no randomness) - `agents/cost-forecaster.md`
and `/hone:budget` read the telemetry and hand the grouped totals in. `--scenario best|typical|worst`
selects the rate.

## Project cap (`scripts/lib/budget/project-cap.cjs` + `hooks/budget-enforcer.ts`)

A **project-level** hard cap, distinct from the existing per-task and per-phase caps. Config lives in
`.design/budget.json`:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `project_cap_usd` | number ≥ 0 | `0` (disabled) | Total project spend ceiling (USD). |
| `project_cap_enforcement_mode` | `enforce` \| `warn` \| `log` | falls back to `enforcement_mode` | How a breach is handled. |

**Disabled by default.** A cap of `0` (or absent / non-finite) means *no project cap* - existing
users see zero behavior change. The classifier `classifyProjectBudget(spend, cap)` returns a level:

| Running spend vs cap | Level | Hook behavior |
|---|---|---|
| `< 50%` | `ok` | nothing |
| `≥ 50%` | `warn-50` | emit `project_cap_warning`, print, allow |
| `≥ 80%` | `warn-80` | emit `project_cap_warning`, print, allow |
| `≥ 100%` | `halt` | emit `project_cap_halt`; under `enforce`, block the spawn |

The cap is enforced in the **PreToolUse:Agent** hook, so the halt is **graceful**: it blocks the
*next* agent spawn, letting the current pipeline stage finish. Under `warn`/`log` mode a `halt`-level
breach prints/records but still allows the spawn (advisory). Running project spend is the sum of
`est_cost_usd` across all `costs.jsonl` rows (a `project-totals.json` fast-path mirrors the Phase 10.1
`phase-totals.json` optimization).

## ROI dashboard (`scripts/lib/budget/roi.cjs`, pure + `/hone:roi`)

Joins per-cycle cost with what actually shipped. **"Shipped"** = a commit that **survived ≥ 14 days**
in `main` (the ROADMAP default - a longer window catches revert-after-bug-discovery); a commit
reverted inside that window counts as `reverted`. `/hone:roi` shells `git log` per cycle for the
shipped/reverted counts and reads per-cycle cost from `costs.jsonl`; `roi.cjs` computes:

- `costPerShipped = costUsd / max(shipped, 1)` - USD per commit that stuck.
- `stickRate = shipped / max(shipped + reverted, 1)` - fraction of commits that survived.

Output is a markdown table (cycle · cost · shipped · reverted · $/shipped · stick rate) plus a TOTAL
row. Markdown only - no GUI.

## Events

Three new free-form `type`s on `.design/telemetry/events.jsonl`:

| Type | Emitted by | Payload (PII-free) |
|---|---|---|
| `budget_forecast` | `cost-forecaster` / `/hone:budget` | `{ scenario, perCycle, projectedTotal, cyclesToCap }` |
| `project_cap_warning` | budget-enforcer hook | `{ pct, spend, cap, level }` at `warn-50` / `warn-80` |
| `project_cap_halt` | budget-enforcer hook | `{ pct, spend, cap, enforcementMode }` at `halt` |

## Boundaries

Forecast is **cycle-scoped** (not per-agent-call). The cap **halts**, it never spends or auto-tunes.
ROI is **markdown**, not a GUI. Nothing here writes `budget.json` - the user sets the cap; GDD only
reads, forecasts, warns, and (at 100% under `enforce`) blocks the next spawn.
