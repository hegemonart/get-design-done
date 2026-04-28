---
name: gdd-router
description: "Routes a /gdd command to fast|quick|full path + S|M|L|XL complexity_class and returns {path, complexity_class, model_tier_overrides, estimated_cost_usd, cache_hits}. Deterministic — no model call. Invoked once at command entry before any Agent spawn. Read by hooks/budget-enforcer.js."
argument-hint: "<intent-string> [<target-artifacts-csv>]"
tools: Read, Bash, Grep
---

# gdd-router

## Role

You are a deterministic routing skill. You do not spawn agents. You read `.design/budget.json`, `reference/model-prices.md`, `.design/cache-manifest.json` (if present), and the agent frontmatter list, then emit a single JSON object describing the planned spawn graph. The budget-enforcer hook (`hooks/budget-enforcer.js`) consumes your output on every `Agent` tool call.

## Invocation Contract

- **Input**: `intent-string` (e.g., `"run discover stage on greenfield project"`) + optional comma-separated list of target artifacts (files this command will touch).
- **Output**: a single JSON object to stdout — nothing else on the line, no prose wrapper:
  ```json
  {
    "path": "fast",
    "complexity_class": "M",
    "model_tier_overrides": {"design-verifier": "haiku"},
    "estimated_cost_usd": 0.034,
    "cache_hits": ["design-context-builder:abc123"]
  }
  ```
- `path` enum: `fast` (single Haiku + no checkers), `quick` (Sonnet mappers + Haiku verify), `full` (Opus planners + full quality gates). Stays unchanged for back-compat per D-05.
- `complexity_class` enum: `S | M | L | XL` (Phase 25 / D-04, D-05). Additive to `path` — existing consumers reading only `path` keep working. Mapping is documented in the Path Selection Heuristic table below.
- `model_tier_overrides` merges agent frontmatter `default-tier` with `.design/budget.json.tier_overrides` — budget.json wins per D-04.
- `estimated_cost_usd` is the sum of per-spawn estimates using the D-06 formula and `reference/model-prices.md`.
- `cache_hits` is a list of `{agent}:{input-hash}` strings that exist in `.design/cache-manifest.json` and are within TTL; emitting a hit lets the hook short-circuit that spawn per D-05.

## Path Selection Heuristic

The router emits both `path` (legacy 3-tier enum) and `complexity_class` (Phase 25 4-tier enum). The canonical mapping is:

| complexity_class | path | Behavior |
|------------------|------|----------|
| `S` | `fast` (short-circuited) | Skip router itself, skip cache-manager, skip telemetry write. Deterministic no-op decision. |
| `M` | `fast` | Single Haiku + no checkers. |
| `L` | `quick` | Sonnet mappers + Haiku verify. |
| `XL` | `full` | Opus planners + full quality gates. Recommends worktree-isolation default + mandatory inter-stage checkpoint + reflector auto-spawn. |

Bucket assignment:

| Signal | complexity_class | path |
|--------|------------------|------|
| Command is `/gdd:help`, `/gdd:stats`, `/gdd:note`, `/gdd:health`, single-Haiku skill | `S` | `fast` (short-circuited — see below) |
| Command is `/gdd:scan`, `/gdd:brief`, `/gdd:sketch`, `/gdd:spike`, `/gdd:fast` | `M` | `fast` |
| Command spawns exactly one agent (no orchestration), not in S list | `M` | `fast` |
| Command is `/gdd:explore`, `/gdd:discover`, standalone `/gdd:verify`, standalone `/gdd:plan` | `L` | `quick` |
| Command spawns parallel mappers but no planners/auditors (`/gdd:discover` in `--auto` mode) | `L` | `quick` |
| Command is `/gdd:next`, `/gdd:do`, `/gdd:autonomous`, end-to-end Brief→Verify, anything spawning planners + auditors + verifiers in series | `XL` | `full` |
| Command spawns planners, auditors, verifiers, or integration-checkers (`/gdd:plan`, `/gdd:verify`, `/gdd:audit`) and is not standalone | `XL` | `full` |
| `--dry-run` flag present on any command | downgrade one tier (XL→L→M→S; `path` follows the mapping table) |

### S-class short-circuit

When `complexity_class` would be `S`, the router itself **does not run** for that invocation — the deterministic skip list is encoded in the `/gdd:*` SKILL.md entry of the matching command. The budget-enforcer hook treats "no router decision payload + matching command name" as the S-class signal and skips enforcement entirely (no telemetry row, no cache lookup, no event emission). When the router *is* invoked explicitly (e.g., debugging) it still emits `complexity_class: "S"` in the JSON for observability, but the runtime path is the no-op.

## Cost Estimation Algorithm

```
total = 0
for each agent in planned spawn graph:
  tier = resolve_tier(agent)   # budget.json tier_overrides > agent frontmatter default-tier
  (in_tok, out_tok) = token_range_from_size_budget(agent.size_budget)  # from reference/model-prices.md
  (in_rate, out_rate) = price_from_tier(tier)
  total += (in_tok / 1e6) * in_rate + (out_tok / 1e6) * out_rate
return total
```

## Cache-Hit Detection

Delegate to `skills/cache-manager/SKILL.md` (Plan 10.1-02). The router lists candidate `{agent}:{input-hash}` tuples; the cache-manager confirms freshness against TTL from `budget.json.cache_ttl_seconds`.

## Integration Point

Every `/gdd:*` SKILL.md's first substantive step is: spawn the router via `Task` or inline invocation; receive the JSON blob; pass it to downstream agents as context so the budget-enforcer hook has the router decision available in tool_input metadata when the first Agent spawn fires.

## Failure Modes

If `.design/budget.json` is missing, assume defaults from `reference/config-schema.md` per D-12. If `reference/model-prices.md` is missing, emit `estimated_cost_usd: null` and log a warning — do not block.

## Non-Goals

The router does not: (a) make a model call, (b) write files, (c) enforce budget caps (that's the hook's job), (d) learn from history (Phase 11 reflector territory per D-07).
