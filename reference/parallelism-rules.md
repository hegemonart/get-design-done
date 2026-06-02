# Parallelism Rules for get-design-done

The decision engine reads these rules at every stage spawn point and writes its verdict to STATE.md `<parallelism_decision>`. Parallelism is computed, not hardcoded.

---

## Hard Rules - Always Serial (override everything)

1. **Sequential dependency** - Agent B requires output from Agent A → serial.
2. **Shared write conflict** - Two agents write to the same file path (intersecting `writes:` fields) → serial.
3. **Interactive agent** - Agent requires `AskUserQuestion` during execution → serial. Interactive agents cannot be parallelized.
4. **Single task** - Only 1 candidate in the wave → serial (nothing to parallelize).
5. **Overlapping Touches** - Two tasks have overlapping `Touches:` fields (same file paths) → serial.
6. **Schema migrations** - Any agent altering database schema (migrations, `ALTER TABLE`, index changes) → serial within its wave.
7. **Rate-limited external API** - Agents calling an external API with shared rate limits (same auth token, same quota) → serial.

## Soft Rules - Prefer Serial (yield to config overrides)

8. **Below savings threshold** - `sum(typical-duration-seconds) - max(typical-duration-seconds) < config.min_estimated_savings_seconds` (default 30s) → prefer serial.
9. **All candidates fast** - Every candidate has `typical-duration-seconds < 10` → parallel overhead may exceed savings → prefer serial.
10. **Beyond max_parallel_agents cap** - N candidates > `config.max_parallel_agents` → split into sequential waves of `max_parallel_agents` each.
11. **Worktree isolation unavailable** - `worktree_isolation: true` in config but git worktrees not available → fall back to serial.
12. **Below min_tasks_to_parallelize** - Fewer than `config.min_tasks_to_parallelize` (default 2) eligible → serial.
13. **Large context** - Any candidate's `<required_reading>` total is >100K tokens - risk of context bloat in concurrent dispatch → prefer serial.
14. **Token-costly agents** - Agents tagged `model: opus` with `typical-duration-seconds > 120s` - prefer serial to avoid bursty spend unless explicitly opted in.

---

## Decision Algorithm

```
FOR each spawn point in a stage orchestrator:
  candidates = tasks_in_current_wave

  # Hard checks (short-circuit to serial)
  IF len(candidates) < 2                                         → serial (rule 4)
  IF any candidate is interactive                                → serial (rule 3)
  FOR each pair (A, B) in candidates:
    IF A.writes ∩ B.writes ≠ ∅                                  → serial (rule 2)
    IF A.Touches ∩ B.Touches ≠ ∅ AND config.require_disjoint_touches
                                                                 → serial (rule 5)
    IF A.depends_on(B) OR B.depends_on(A)                       → serial (rule 1)
  IF any candidate mutates schema                                → serial (rule 6)
  IF rate_limit_sharing(candidates)                              → serial (rule 7)

  # Soft checks (config-adjustable)
  IF len(candidates) < config.min_tasks_to_parallelize           → serial (rule 12)
  est_savings = sum(typical-duration-seconds) - max(typical-duration-seconds)
  IF est_savings < config.min_estimated_savings_seconds          → serial (rule 8)
  IF all(c.typical-duration-seconds < 10 for c in candidates)    → serial (rule 9)
  IF worktree_required_but_unavailable()                          → serial (rule 11)
  IF context_pressure(candidates) > 100K                         → serial (rule 13)

  # Cap
  IF len(candidates) > config.max_parallel_agents:
    return split_into_waves(candidates, config.max_parallel_agents)

  → verdict: parallel

WRITE verdict to STATE.md <parallelism_decision>
```

---

## State Output Format

```xml
<parallelism_decision>
  stage: explore
  verdict: parallel
  reason: "5 mappers, all parallel-safe: auto, Touches disjoint, savings est. 165s"
  agents: ["token-mapper", "component-taxonomy-mapper", "visual-hierarchy-mapper", "a11y-mapper", "motion-mapper"]
  ruled_out: []
  timestamp: 2026-04-18T05:00:00Z
</parallelism_decision>
```

### Serial verdict example

```xml
<parallelism_decision>
  stage: plan
  verdict: serial
  reason: "sequential dependency — design-planner consumes design-phase-researcher output (rule 1)"
  agents: ["design-phase-researcher", "design-pattern-mapper", "design-planner", "design-plan-checker"]
  ruled_out: ["parallel: rule 1"]
  timestamp: 2026-04-18T05:10:00Z
</parallelism_decision>
```

### Parallel verdict example

```xml
<parallelism_decision>
  stage: verify
  verdict: parallel
  reason: "design-auditor + design-integration-checker — disjoint writes, both parallel-safe: auto, savings est 60s"
  agents: ["design-auditor", "design-integration-checker"]
  ruled_out: []
  timestamp: 2026-04-18T05:20:00Z
</parallelism_decision>
```

---

## Why this is a first-class primitive

"Why didn't it parallelize?" becomes a one-file STATE.md read - not a guess. Every stage orchestrator computes and writes a verdict before any multi-agent spawn. Operators can audit the decision without rerunning.
