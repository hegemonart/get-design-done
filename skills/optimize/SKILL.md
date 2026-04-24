---
name: optimize
description: "Reads .design/telemetry/costs.jsonl + .design/agent-metrics.json, runs rule-based analysis, writes .design/OPTIMIZE-RECOMMENDATIONS.md. Pure advisory — no auto-apply. User reviews + decides."
argument-hint: "[--refresh] [--min-spawns=N]"
user-invocable: true
tools: Read, Bash, Grep, Write
---

# /gdd:optimize — Optimization Advisor

## Role

You are the optimization advisor. You read the telemetry ledger (`.design/telemetry/costs.jsonl`) and the per-agent metrics aggregate (`.design/agent-metrics.json`), apply a fixed set of rule-based heuristics, and emit recommendations to `.design/OPTIMIZE-RECOMMENDATIONS.md`. You never modify agent files, budget config, or cache state. Your output is a markdown table of proposals the user reviews manually, mirroring the Phase 11 `/gdd:apply-reflections` discipline.

This skill is **advisory only**. It never edits `agents/*.md`, `.design/budget.json`, `.design/cache-manifest.json`, or any other configuration. The skill never makes model calls — every rule is deterministic.

## Refresh Step

Before analysis, invoke the aggregator to ensure metrics are current:

```bash
node --experimental-strip-types scripts/aggregate-agent-metrics.ts
```

This is idempotent. If `--refresh` flag is absent and `.design/agent-metrics.json` was generated within the last 60 seconds, the skill may skip this step.

## Inputs

- `.design/telemetry/costs.jsonl` — append-only; skill reads tail. Tolerant of malformed lines.
- `.design/agent-metrics.json` — per-agent aggregate produced by `scripts/aggregate-agent-metrics.ts`. Source of truth for `cache_hit_rate`, `lazy_skip_rate`, `total_cost_usd`, `total_spawns`.
- `agents/*.md` — frontmatter cross-reference when checking tier override churn + typical-duration drift.
- `.design/budget.json` — `tier_overrides` table for cross-check (optional; proceed if missing).

## Optional Arguments

- `--refresh` — force aggregator refresh even if metrics file is fresh.
- `--min-spawns=N` — only emit recommendations for agents with ≥ N spawns (default: 5; raise for high-traffic projects to suppress noise).

## Rules

Rule-based analysis, applied in this order. Each rule inspects per-agent aggregates and emits zero or more rows to the recommendations table.

   **Rule R1 — Low cache hit rate.**
   > IF an agent has `total_spawns >= --min-spawns` AND `cache_hit_rate < 0.20`
   > THEN emit: `"Consider batching tasks for agent {agent} — cache hit rate is {rate*100}%. Investigate cache-aligned ordering (see reference/shared-preamble.md) and whether input paths can be normalized."`
   > PROPOSED: Batch similar tasks; confirm shared-preamble import ordering.

   **Rule R2 — Expensive and rarely lazy-skipped.**
   > IF an agent has `total_cost_usd > 0.50` AND `lazy_skip_rate < 0.10`
   > THEN emit: `"Agent {agent} is expensive (${cost}) and rarely skipped ({rate*100}% lazy-skip). Consider adding a lazy gate heuristic at agents/{agent}-gate.md (see plan 10.1-04 pattern)."`
   > PROPOSED: Add lazy-gate agent.

   **Rule R3 — Tier override churn.**
   > IF for multiple telemetry rows an agent's recorded `tier` differs from its frontmatter `default-tier` (e.g., frontmatter says `opus` but measured rows consistently show `haiku` from budget.json override or soft-threshold downgrade)
   > THEN emit: `"Tier override churn detected for {agent}: frontmatter says {frontmatter-tier} but measured tier is {measured-tier} in {N} of last {M} rows. Consider updating frontmatter default-tier or removing the budget.json override."`
   > PROPOSED: Update frontmatter default-tier OR prune budget.json tier_overrides entry.

   **Rule R4 — Typical duration drift.**
   > IF measured `typical_duration_seconds` (computed as average wall-clock duration from telemetry `ts` deltas when paired spawn/complete rows exist; fall back to frontmatter value if pairing unavailable in v1) differs from frontmatter `typical-duration-seconds` by more than 50%
   > THEN emit: `"Typical duration for {agent} has drifted: frontmatter {old}s vs measured {new}s ({delta_pct}% drift). Update frontmatter typical-duration-seconds: {new}."`
   > PROPOSED: Edit agents/{agent}.md frontmatter.

   (Note: v1 only computes wall-clock duration if the telemetry ledger carries both spawn and complete rows with matching correlation IDs. If it doesn't — 10.1's PreToolUse-only writer doesn't — Rule R4 flags "insufficient data" for affected agents rather than emitting a false proposal. Phase 11 reflector can add a PostToolUse writer to close this gap; out of 10.1 scope.)

## Output Format

Write `.design/OPTIMIZE-RECOMMENDATIONS.md` with this exact structure:

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
| R1 | design-verifier | cache_hit_rate: 8% | Batch tasks; audit shared-preamble ordering | Low cache reuse; likely causing 3× cost on repeated calls |
| R2 | design-planner | $1.23 cost, 2% lazy-skip | Add agents/design-planner-gate.md | High spend with minimal gating |
| R3 | design-verifier | frontmatter opus / measured haiku (9/12 rows) | Update frontmatter default-tier: haiku | budget.json overrides are effectively permanent |

## Summary

- R1 matches: {count}
- R2 matches: {count}
- R3 matches: {count}
- R4 matches: {count}

## OPTIMIZE COMPLETE
```

The `## OPTIMIZE COMPLETE` marker is the completion sentinel — automated graders and downstream tools detect completion by grepping for this exact line.

## No Auto-Apply

This skill **never modifies** `agents/*.md`, `.design/budget.json`, `.design/cache-manifest.json`, or any other configuration. It **never auto-applies** proposals. It only writes `.design/OPTIMIZE-RECOMMENDATIONS.md`. If the user wants to act on a proposal, they do so manually (or via a future Phase 12 command that cross-references these proposals).

The discipline mirrors `/gdd:apply-reflections` from Phase 11: advisory output, user review, manual application.

## Integration with Phase 11 Reflector

The Phase 11 reflector (`agents/design-reflector.md`) reads both `costs.jsonl` and `agent-metrics.json` on its own cadence. `/gdd:optimize` is the user-facing advisor; the reflector is the automation-facing one. Both output to different files (`.design/OPTIMIZE-RECOMMENDATIONS.md` vs `.design/reflections/*.md`) and never collide.

## Non-Goals

- Does not make model calls (rule-based, deterministic).
- Does not modify config.
- Does not propose changes outside the four rules — future rules added by future phases.
- Does not learn from history — Phase 11 reflector territory.

## Failure Modes

- Missing `.design/telemetry/costs.jsonl` → emit a single line `"No telemetry data yet — run one or more /gdd:* commands to accumulate data, then retry."` and still write the `## OPTIMIZE COMPLETE` marker.
- Missing `.design/agent-metrics.json` after refresh → emit `"Aggregator failed — check \`node --experimental-strip-types scripts/aggregate-agent-metrics.ts\` output manually."`.
- Zero rules matched → still write the recommendations file with `"No recommendations — all agents within healthy thresholds."` and the `## OPTIMIZE COMPLETE` marker.
