---
name: gdd-rollout-status
description: "Shows where a finished design cycle actually is in production rollout — unrolled / staging-only / canary-N% / prod-100% — by reading the feature-flag service (LaunchDarkly/Statsig/GrowthBook) via the rollout-coordinator. Surfaces STUCK rollouts (a canary that hasn't advanced for N days) and the design_arms outcome weighting. Read-only — GDD never advances or rolls back; it reports and notifies. Use after {{command_prefix}}ship to track the post-merge journey."
argument-hint: "[<cycle>] [--all] [--stuck]"
user-invocable: true
tools: Read, Bash, Grep, Glob, ToolSearch, Task
---

# {{command_prefix}}rollout-status

Closes the visibility gap after `{{command_prefix}}ship`: a PR merges, but staging → canary → 100% rollout happens outside GDD. This skill reports where each cycle's design actually is in production, by delegating to `agents/rollout-coordinator.md` (which reads the feature-flag service via the Phase 38 connections). **Read-only** - it reports + notifies; it never advances or rolls back a rollout. Contract + the `<rollout_status>` schema: `../../reference/rollout-coordination.md`.

## Invocation

| Command | Behavior |
|---|---|
| `{{command_prefix}}rollout-status` | The current cycle's rollout state (from `.design/STATE.md <rollout_status>`, refreshed via the coordinator). |
| `{{command_prefix}}rollout-status <cycle>` | A specific cycle's rollout state. |
| `{{command_prefix}}rollout-status --all` | Every cycle with a `<rollout_status>` block - a rollout dashboard. |
| `{{command_prefix}}rollout-status --stuck` | Only the **stuck** rollouts (partial rollouts that haven't advanced for ≥ the threshold). |

## Steps

1. **Probe the flag service.** Check a flag connection is `available` (`connections/launchdarkly.md` / `statsig.md` / `growthbook.md`). None → print `rollout-status: no flag service configured — connect one via {{command_prefix}}connections.` and exit.
2. **Delegate to `rollout-coordinator`** (via `Task`): it reads the service, classifies via `scripts/lib/rollout/rollout-status.cjs`, refreshes the `<rollout_status>` block, and reports state + deployed % + stuck.
3. **Render.** Show each cycle: `state` · `deployed_pct` · `last_changed` · `stuck?`. For `--stuck`, list only stuck cycles with the days-since-change and an advance-or-rollback suggestion.
4. **Do not act.** Never run a flag-service mutation, advance a canary, or roll back - GDD reports; the human + the flag service decide.

## Output

End with:

```
## ROLLOUT-STATUS COMPLETE
```
