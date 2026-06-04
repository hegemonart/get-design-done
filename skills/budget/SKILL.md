---
name: gdd-budget
description: "Forecasts GDD design-cycle spend before the bill arrives. Reads .design/telemetry/costs.jsonl (cost per cycle) + .design/budget.json (the project_cap), runs the pure cost-forecast model via agents/cost-forecaster.md, and projects the next N cycles - surfacing 'at the current rate you'll hit your $X project cap in Y cycles.' Supports --scenario best|typical|worst and --cycles N. Read-only - it forecasts and warns; it never spends, edits budget.json, or halts (the budget-enforcer hook halts). Use to sanity-check spend trajectory before a long run."
argument-hint: "[--cycles N] [--scenario best|typical|worst]"
user-invocable: true
tools: Read, Bash, Grep, Glob, ToolSearch, Task
---

# /gdd:budget

Closes the long-horizon cost gap: Phase 10.1 per-task caps + Phase 26 per-runtime telemetry track
*cost*, but nothing **forecasts** it. This skill projects the next N cycles of spend and tells you how
many cycles you have before you hit your `project_cap`. **Read-only** - it forecasts and warns; it
never spends, never edits `budget.json`, and never halts (the Phase 25 budget-enforcer hook is the
only thing that blocks a spawn). Contract: `../../reference/cost-governance.md`.

## Invocation

| Command | Behavior |
|---|---|
| `/gdd:budget` | Typical-scenario forecast over the next 5 cycles + cycles-to-cap. |
| `/gdd:budget --cycles N` | Forecast over the next N cycles. |
| `/gdd:budget --scenario best\|typical\|worst` | Pick the projection rate (best / steady / worst). |

## Steps

1. **Check telemetry exists.** No `.design/telemetry/costs.jsonl` (or zero rows) → print
   `budget: no cost telemetry yet — run a cycle first.` and exit.
2. **Delegate to `cost-forecaster`** (via `Task`): it groups `est_cost_usd` by `cycle`, runs the pure
   `scripts/lib/budget/cost-forecast.cjs` model for the requested `--scenario`/`--cycles`, reads
   `project_cap_usd` from `.design/budget.json`, and computes cycles-to-cap.
3. **Render.** Show: the scenario + its per-cycle rate, the best↔worst band, the projected total over
   N cycles, and - when `project_cap_usd > 0` - **"at the `<scenario>` rate (~$X/cycle) you'll reach
   your $`<cap>` project cap in `<Y>` cycles"** (or "not at this rate" when the trend is flat/down).
   When no cap is set, show the trajectory and note that `project_cap_usd` is unset (so the hook won't
   halt).
4. **Do not act.** Never raise/lower the cap, never spend - GDD forecasts; the human sets the budget.

## Output

End with:

```
## BUDGET COMPLETE
```
