---
name: router-rules
type: heuristic
version: 1.0.0
phase: 28.5
tags: [router, path-selection, complexity-class, model-tier, runtime-resolution, cost-estimation]
last_updated: 2026-05-18
---

# Router Path-Selection + Runtime Resolution Rules

Extracted from `skills/router/SKILL.md` per Phase 28.5 D-10 (extract-then-link, never delete
content). The router SKILL keeps its invocation contract, output schema versioning table,
integration point, and failure modes. The path-selection heuristic tables, the cost
estimation algorithm, and the runtime-aware model resolution computation contract live
here so the SKILL stays under the 100-line cap.

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

## Runtime-aware model resolution

The router emits `resolved_models` alongside `model_tier_overrides` so downstream consumers (budget-enforcer cost computation, Phase 22 cost telemetry, Phase 23.5 bandit posterior store) can read the **concrete model ID** for the active runtime without re-deriving it from the tier name. The resolution is per-agent and additive — `model_tier_overrides` keeps its `opus|sonnet|haiku` enum for back-compat across all 14 runtimes, and `resolved_models` runs the runtime-specific translation on top of it.

Computation contract (per D-07):

```
runtime = runtimeDetect.detect() ?? 'claude'
for each agent in planned spawn graph:
  tier = resolve_tier(agent)                          # same merge as model_tier_overrides
  resolved_models[agent] = tierResolver.resolve(runtime, tier)
                                                       # → concrete model string OR null
```

Implementation surfaces (Phase 26 / Wave A):

- `scripts/lib/runtime-detect.cjs` — `detect() → runtime-id | null`. Reads the same `*_CONFIG_DIR` / `*_HOME` env-vars Phase 24's installer uses (single source of truth in `scripts/lib/install/runtimes.cjs`). Returns `null` when no recognized runtime env-var is set; the router falls back to `'claude'` so the resolver always has a runtime ID to work with.
- `scripts/lib/tier-resolver.cjs` — `resolve(runtime, tier, opts?) → model | null`. Translates `opus|sonnet|haiku` to the concrete model the runtime understands using the `./runtime-models.md` mapping (Phase 26 / Wave A). Fallback chain (D-04): runtime-specific entry → `claude` row default with `tier_resolution_fallback` event → `null` with `tier_resolution_failed` event. Never throws; `null` is a valid output the consumer must handle.

Per-agent emission rules:

- One key per agent in the planned spawn graph (same key set the cost-estimation loop iterates over). Keys MUST match agent names exactly so consumers can join `resolved_models` against `model_tier_overrides` and the spawn graph by name.
- Value is the concrete model string returned by `tier-resolver.resolve(runtime, tier)`.
- When the resolver returns `null` (missing tier-map row, missing tier, garbage input), the value is JSON `null` — NOT omitted, NOT the empty string. Consumers (budget-enforcer, telemetry) MUST handle `null`: typically by skipping the cost row for that spawn and emitting their own diagnostic event, never by crashing.
- When `complexity_class` is `S` and the router itself short-circuits (see **S-class short-circuit** above), no payload is emitted at all and `resolved_models` does not exist for that invocation — the budget-enforcer's "no router decision payload" branch already handles this case.

Back-compat assertion: a router invocation in a Claude runtime (or any environment where `runtime-detect.detect()` returns `null` and the router falls back to `'claude'`) produces `resolved_models` values that are the canonical Anthropic model IDs (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`) for the corresponding tiers. Pre-Phase-26 consumers that ignore `resolved_models` see the same `model_tier_overrides` they always saw (Plan 26-09 owns the runtime fixture diff that asserts this).
