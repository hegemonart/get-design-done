---
name: hone-roi
description: "Shows whether GDD spend actually shipped anything. Joins per-cycle cost (.design/telemetry/costs.jsonl) with what each cycle shipped - commits that SURVIVED in main vs commits that were reverted - and reports cost-per-shipped-commit + a stick rate per cycle. 'Shipped' = a commit surviving >= the window (default 14 days), which catches revert-after-bug-discovery. Markdown table, not a GUI. Read-only - it reads git log + cost telemetry and reports. Use to see which cycles were worth their spend."
argument-hint: "[--since <date>] [--window-days 14]"
user-invocable: true
tools: Read, Bash, Grep, Glob
---

# /hone:roi

Closes the loop on cost: `/hone:budget` forecasts *spend*, this shows the *return*. It joins per-cycle
cost with the commits that actually stuck, so you can see cost-per-shipped-commit and which cycles
were worth it. **Read-only** - it reads `git log` + cost telemetry and prints a table. Contract +
the "shipped" definition: `../../reference/cost-governance.md`.

## Invocation

| Command | Behavior |
|---|---|
| `/hone:roi` | ROI table across all cycles with cost telemetry (14-day stick window). |
| `/hone:roi --since <date>` | Only cycles since `<date>`. |
| `/hone:roi --window-days N` | "Shipped" = a commit surviving ≥ N days (default 14). |

## Steps

1. **Check telemetry exists.** No `.design/telemetry/costs.jsonl` (or zero rows) → print
   `roi: no cost telemetry yet — run a cycle first.` and exit.
2. **Per-cycle cost.** Group `est_cost_usd` in `costs.jsonl` by `cycle`.
3. **Per-cycle shipped / reverted.** For each cycle, use `git log` to count, in that cycle's date
   range: commits still present in `main` and older than the window = **shipped**; commits that a
   later `revert` removed (or that were reverted within the window) = **reverted**. (A commit younger
   than the window is "too new to score" - exclude it, don't count it as shipped.)
4. **Join + compute** via the pure helper - never hand-compute:

   ```bash
   node -e '
     const { computeRoi, roiTableMarkdown } = require("./scripts/lib/budget/roi.cjs");
     const cycles = JSON.parse(process.argv[1]); // [{cycle,costUsd,commitsShipped,commitsReverted},...]
     console.log(roiTableMarkdown(computeRoi(cycles)));
   ' "$CYCLES_JSON"
   ```

5. **Render** the markdown table (cycle · cost · shipped · reverted · $/shipped · stick rate) plus the
   TOTAL row. A high `$/shipped` with a low stick rate is the signal that a cycle burned budget
   without lasting output.
6. **Do not act.** Reporting only - never revert, re-run, or change budget.

## Output

End with:

```
## ROI COMPLETE
```
