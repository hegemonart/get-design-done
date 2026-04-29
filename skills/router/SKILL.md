---
name: gdd-router
description: "Routes a /gdd command to fast|quick|full path + S|M|L|XL complexity_class and returns {path, complexity_class, model_tier_overrides, resolved_models, estimated_cost_usd, cache_hits}. Deterministic — no model call. Invoked once at command entry before any Agent spawn. Read by hooks/budget-enforcer.js."
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
    "resolved_models": {
      "design-reflector": "gpt-5",
      "design-context-checker": "gpt-5-nano",
      "design-verifier": "gpt-5-nano"
    },
    "estimated_cost_usd": 0.034,
    "cache_hits": ["design-context-builder:abc123"]
  }
  ```
- `path` enum: `fast` (single Haiku + no checkers), `quick` (Sonnet mappers + Haiku verify), `full` (Opus planners + full quality gates). Stays unchanged for back-compat per D-05.
- `complexity_class` enum: `S | M | L | XL` (Phase 25 / D-04, D-05). Additive to `path` — existing consumers reading only `path` keep working. Mapping is documented in the Path Selection Heuristic table below.
- `model_tier_overrides` merges agent frontmatter `default-tier` with `.design/budget.json.tier_overrides` — budget.json wins per D-04. Enum stays `opus|sonnet|haiku` for back-compat across all 14 runtimes; consumers that need the **concrete** model name for the active runtime read `resolved_models` instead.
- `resolved_models` is a per-agent map of concrete model IDs for the runtime in use (Phase 26 / D-07). Keys are agent names; values are runtime-specific model strings (e.g. `"gpt-5"` under codex, `"gemini-2.5-pro"` under gemini, `"claude-opus-4-7"` under claude) or `null` when the resolver can supply no model (missing tier-map row, missing tier on the row). Additive to `model_tier_overrides` — existing consumers reading the tier-name map keep working unchanged; new consumers (budget-enforcer cost computation, cost telemetry, bandit posterior store) read `resolved_models` for runtime-correct cost. See **Runtime-aware model resolution** below for the computation contract.
- `estimated_cost_usd` is the sum of per-spawn estimates using the D-06 formula and `reference/model-prices.md`.
- `cache_hits` is a list of `{agent}:{input-hash}` strings that exist in `.design/cache-manifest.json` and are within TTL; emitting a hit lets the hook short-circuit that spawn per D-05.

### Output schema versioning

The router output contract is additive across phases. The current shape (Phase 26, v1.26.0) carries:

| Field | Added in | Status |
|-------|----------|--------|
| `path` | v1.10.1 (10.1-01) | stable |
| `model_tier_overrides` | v1.10.1 (10.1-01) | stable, enum unchanged |
| `estimated_cost_usd` | v1.10.1 (10.1-01) | stable |
| `cache_hits` | v1.10.1 (10.1-01) | stable |
| `complexity_class` | v1.25.0 (25-02) | stable, additive |
| `resolved_models` | v1.26.0 (26-04) | stable, additive |

Existing consumers reading any subset of the older fields keep working unchanged across these bumps — the schema is a strict superset at every phase boundary. New fields are documented inline in this skill rather than in a separate JSON-schema file (the SKILL is the contract — same convention Phase 25 followed for `complexity_class`).

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
- `scripts/lib/tier-resolver.cjs` — `resolve(runtime, tier, opts?) → model | null`. Translates `opus|sonnet|haiku` to the concrete model the runtime understands using the `reference/runtime-models.md` mapping (Phase 26 / Wave A). Fallback chain (D-04): runtime-specific entry → `claude` row default with `tier_resolution_fallback` event → `null` with `tier_resolution_failed` event. Never throws; `null` is a valid output the consumer must handle.

Per-agent emission rules:

- One key per agent in the planned spawn graph (same key set the cost-estimation loop iterates over). Keys MUST match agent names exactly so consumers can join `resolved_models` against `model_tier_overrides` and the spawn graph by name.
- Value is the concrete model string returned by `tier-resolver.resolve(runtime, tier)`.
- When the resolver returns `null` (missing tier-map row, missing tier, garbage input), the value is JSON `null` — NOT omitted, NOT the empty string. Consumers (budget-enforcer, telemetry) MUST handle `null`: typically by skipping the cost row for that spawn and emitting their own diagnostic event, never by crashing.
- When `complexity_class` is `S` and the router itself short-circuits (see **S-class short-circuit** above), no payload is emitted at all and `resolved_models` does not exist for that invocation — the budget-enforcer's "no router decision payload" branch already handles this case.

Back-compat assertion: a router invocation in a Claude runtime (or any environment where `runtime-detect.detect()` returns `null` and the router falls back to `'claude'`) produces `resolved_models` values that are the canonical Anthropic model IDs (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`) for the corresponding tiers. Pre-Phase-26 consumers that ignore `resolved_models` see the same `model_tier_overrides` they always saw (Plan 26-09 owns the runtime fixture diff that asserts this).

## Cache-Hit Detection

Delegate to `skills/cache-manager/SKILL.md` (Plan 10.1-02). The router lists candidate `{agent}:{input-hash}` tuples; the cache-manager confirms freshness against TTL from `budget.json.cache_ttl_seconds`.

## Integration Point

Every `/gdd:*` SKILL.md's first substantive step is: spawn the router via `Task` or inline invocation; receive the JSON blob; pass it to downstream agents as context so the budget-enforcer hook has the router decision available in tool_input metadata when the first Agent spawn fires.

## Failure Modes

If `.design/budget.json` is missing, assume defaults from `reference/config-schema.md` per D-12. If `reference/model-prices.md` is missing, emit `estimated_cost_usd: null` and log a warning — do not block.

## Non-Goals

The router does not: (a) make a model call, (b) write files, (c) enforce budget caps (that's the hook's job), (d) learn from history (Phase 11 reflector territory per D-07).
