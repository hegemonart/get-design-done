---
name: optimize
description: "Reads .design/telemetry/costs.jsonl + .design/agent-metrics.json, runs rule-based analysis, writes .design/OPTIMIZE-RECOMMENDATIONS.md. Pure advisory — no auto-apply. User reviews + decides."
argument-hint: "[--refresh] [--min-spawns=N]"
user-invocable: true
tools: Read, Bash, Grep, Write
---

# /gdd:optimize — Optimization Advisor

## Role

Read the telemetry ledger (`.design/telemetry/costs.jsonl`) and per-agent aggregate (`.design/agent-metrics.json`), apply a fixed set of rule-based heuristics, and emit recommendations to `.design/OPTIMIZE-RECOMMENDATIONS.md`. Never modify agent files, budget config, or cache state. Output is a markdown table of proposals the user reviews manually, mirroring Phase 11 `/gdd:apply-reflections`. **Advisory only**: never edits `agents/*.md`, `.design/budget.json`, `.design/cache-manifest.json`. Never makes model calls — every rule is deterministic. See `./reference/heuristics.md` §"Optimization rules" for the full rule catalog.

## Refresh Step

Before analysis, invoke the aggregator:

```bash
node --experimental-strip-types scripts/aggregate-agent-metrics.ts
```

Idempotent. If `--refresh` absent and `.design/agent-metrics.json` generated within 60s, skip.

## Inputs

- `.design/telemetry/costs.jsonl` — append-only; tolerant of malformed lines.
- `.design/agent-metrics.json` — per-agent aggregate; source of truth for `cache_hit_rate`, `lazy_skip_rate`, `total_cost_usd`, `total_spawns`.
- `agents/*.md` — frontmatter cross-reference for tier override churn + typical-duration drift.
- `.design/budget.json` — `tier_overrides` table (optional).

## Optional Arguments

- `--refresh` — force aggregator refresh even if metrics file is fresh.
- `--min-spawns=N` — only emit recommendations for agents with ≥ N spawns (default 5).

## Rules

Rule-based analysis. Full thresholds + emission templates in `./reference/heuristics.md` §"Optimization rules"; here, the short rule catalog:

- **R1 — Low cache hit rate.** IF `total_spawns >= --min-spawns` AND `cache_hit_rate < 0.20` → propose batching + investigate shared-preamble ordering.
- **R2 — Expensive + rarely lazy-skipped.** IF `total_cost_usd > 0.50` AND `lazy_skip_rate < 0.10` → propose adding a lazy gate at `agents/{agent}-gate.md` (Plan 10.1-04 pattern).
- **R3 — Tier override churn.** IF measured `tier` differs from frontmatter `default-tier` for multiple rows → propose updating frontmatter or removing budget.json override.
- **R4 — Typical duration drift.** IF measured `typical_duration_seconds` differs from frontmatter by > 50% → propose frontmatter update. (v1 only computes wall-clock duration if both spawn + complete rows have matching correlation IDs; otherwise flag "insufficient data".)

## Output Format

Write `.design/OPTIMIZE-RECOMMENDATIONS.md`:

```markdown
# Optimization Recommendations

**Generated:** {ISO-8601 timestamp}
**Telemetry rows analyzed:** {N}
**Agents analyzed:** {M}
**Min spawns threshold:** {--min-spawns value}

> Advisory only. No changes have been applied. Review each proposal and apply manually via the suggested action.

## Proposals

| Rule | Agent | Current | Proposed | Rationale |
|------|-------|---------|----------|-----------|
| R1 | ... | ... | ... | ... |

## Summary

- R1 matches: {count}
- R2 matches: {count}
- R3 matches: {count}
- R4 matches: {count}

## OPTIMIZE COMPLETE
```

The `## OPTIMIZE COMPLETE` marker is the completion sentinel.

## No Auto-Apply

This skill **never modifies** `agents/*.md`, `.design/budget.json`, `.design/cache-manifest.json`, or any other configuration. **Never auto-applies** proposals. If the user wants to act, they do so manually. Discipline mirrors `/gdd:apply-reflections` from Phase 11.

## Integration with Phase 11 Reflector

The Phase 11 reflector (`agents/design-reflector.md`) reads both `costs.jsonl` and `agent-metrics.json` on its own cadence. `/gdd:optimize` is user-facing; the reflector is automation-facing. Outputs land in different files (`.design/OPTIMIZE-RECOMMENDATIONS.md` vs `.design/reflections/*.md`) and never collide.

## Non-Goals

- Does not make model calls (rule-based, deterministic).
- Does not modify config.
- Does not propose changes outside the four rules — future rules added by future phases.
- Does not learn from history — Phase 11 reflector territory.

## Failure Modes

- Missing `.design/telemetry/costs.jsonl` → emit `No telemetry data yet — run /gdd:* commands to accumulate data, then retry.` + `## OPTIMIZE COMPLETE`.
- Missing `.design/agent-metrics.json` after refresh → emit `Aggregator failed — check node --experimental-strip-types scripts/aggregate-agent-metrics.ts output manually.`
- Zero rules matched → write `No recommendations — all agents within healthy thresholds.` + `## OPTIMIZE COMPLETE`.
