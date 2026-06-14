---
name: hone-router
description: "Routes a /gdd command to fast|quick|full path + S|M|L|XL complexity_class and returns {path, complexity_class, model_tier_overrides, resolved_models, estimated_cost_usd, cache_hits}. A SKILL.md prompt the model executes to emit a routing-decision JSON from rule tables (no separate agent spawn). Optional/advisory - invoked only by the skills that opt into routing; the budget-enforcer hook tolerates its absence. Read by hooks/budget-enforcer.ts."
argument-hint: "<intent-string> [<target-artifacts-csv>]"
tools: Read, Bash, Grep
---

# hone-router

## Role

You are a deterministic routing skill. You do not spawn agents. You read `.design/budget.json`, `reference/model-prices.md`, `.design/cache-manifest.json` (if present), and the agent frontmatter list, then emit a single JSON object describing the planned spawn graph. The budget-enforcer hook (`hooks/budget-enforcer.ts`) consumes your output on every `Agent` tool call.

## Invocation Contract

- **Input**: `intent-string` (e.g., `"run discover stage on greenfield project"`) + optional comma-separated list of target artifacts (files this command will touch).
- **Output**: a single JSON object to stdout - nothing else on the line, no prose wrapper:
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
- `complexity_class` enum: `S | M | L | XL` (Phase 25 / D-04, D-05). Additive to `path` - existing consumers reading only `path` keep working. Mapping is documented in the Path Selection Heuristic table below.
- `model_tier_overrides` merges agent frontmatter `default-tier` with `.design/budget.json.tier_overrides` - budget.json wins per D-04. Enum stays `opus|sonnet|haiku` for back-compat across all 14 runtimes; consumers that need the **concrete** model name for the active runtime read `resolved_models` instead.
- `resolved_models` is a per-agent map of concrete model IDs for the runtime in use (Phase 26 / D-07). Keys are agent names; values are runtime-specific model strings (e.g. `"gpt-5"` under codex, `"gemini-2.5-pro"` under gemini, `"claude-opus-4-7"` under claude) or `null` when the resolver can supply no model (missing tier-map row, missing tier on the row). Additive to `model_tier_overrides` - existing consumers reading the tier-name map keep working unchanged; new consumers (budget-enforcer cost computation, cost telemetry, bandit posterior store) read `resolved_models` for runtime-correct cost. See **Runtime-aware model resolution** below for the computation contract.
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

Existing consumers reading any subset of the older fields keep working unchanged across these bumps - the schema is a strict superset at every phase boundary. New fields are documented inline in this skill rather than in a separate JSON-schema file (the SKILL is the contract - same convention Phase 25 followed for `complexity_class`).

## Path Selection Heuristic

The router emits `path` (3-tier: `fast|quick|full`, legacy enum, stable for back-compat) AND `complexity_class` (4-tier: `S|M|L|XL`, Phase 25 / D-04 additive). Full mapping table, bucket-assignment signal list, `--dry-run` downgrade rule, and the S-class short-circuit semantics live in `./router-rules.md#path-selection-heuristic`. The S-class short-circuit is essential: when `complexity_class` would be `S`, the router does not run; the deterministic skip list lives in the `/hone:*` SKILL.md entry, and the budget-enforcer hook treats "no payload + matching command name" as the S signal.

## Cost Estimation Algorithm

Standard cost-estimation pseudocode (sum over planned spawn graph; per-agent `(in_tok / 1e6) * in_rate + (out_tok / 1e6) * out_rate` using `./reference/model-prices.md`) lives in `./router-rules.md#cost-estimation-algorithm`.

## Runtime-aware model resolution

Computation contract for `resolved_models`, implementation surfaces (`scripts/lib/runtime-detect.cjs` + `scripts/lib/tier-resolver.cjs`), per-agent emission rules (including the JSON-`null` contract), and the Claude-runtime back-compat assertion live in `./router-rules.md#runtime-aware-model-resolution`. Top-line: `model_tier_overrides` keeps its `opus|sonnet|haiku` enum for back-compat; `resolved_models` runs the per-runtime translation additively on top.

## Cache-Hit Detection

Delegate to `skills/cache-manager/SKILL.md` (Plan 10.1-02). The router lists candidate `{agent}:{input-hash}` tuples; the cache-manager confirms freshness against TTL from `budget.json.cache_ttl_seconds`.

## Integration Point

The router is **optional and advisory**, not a universal first step. Only the handful of skills that explicitly opt into routing reference it (today: the root pipeline `SKILL.md` / `/hone:handoff`, and `/hone:style` documents that it deliberately does *not* invoke the router because it is a leaf invocation). The pipeline stage skills (explore / plan / design / verify) do **not** spawn the router. When a skill does invoke it, the flow is: invoke the router via `Task` or inline invocation; receive the JSON blob; pass it to downstream agents as context so the budget-enforcer hook has the router decision available in tool_input metadata when the first Agent spawn fires.

When no skill supplies a router decision, the budget-enforcer hook reads `tool_input.context.router_decision` as absent and falls back to its legacy back-compat path - the router's absence is tolerated by design, never an error.

## Failure Modes

If `.design/budget.json` is missing, assume defaults from `reference/config-schema.md` per D-12. If `reference/model-prices.md` is missing, emit `estimated_cost_usd: null` and log a warning - do not block.

## Emitting capability_gap on unmatched intent

When the router cannot resolve `intent-string` to a known agent (no `description` match, no `default-tier` rule, no path-selection fallback), emit ONE `capability_gap` event with `source: "router"` before returning the conservative-fallback JSON. Feeds Phase 29 Stage-0 telemetry - see `./capability-gap-emitter.md` for the synchronous Node snippet, semantic notes (suggested_kind = `"agent"`, MCP-probe exclusion per D-08, back-compat invariant on router output), and the opaque-extras payload routing through `appendChainEvent`.

## Emitting router_pick on a resolved pick

When the router DID resolve a pick - it has the `path`/`complexity_class`/`resolved_models` decision and is about to return the decision JSON - emit ONE `router_pick` event (`source: "router"`) recording which skill/agent was auto-picked, as the last step before returning. Side-effect only; the output JSON contract is UNCHANGED. Feeds the D-02 under-reached-skill instrument (Phase 33 baselines per-skill pick rates) - see `./router-pick-emitter.md` for the synchronous Node snippet, the 7-field no-PII payload (context_hash only - never the raw prompt), and the opaque-extras routing through `appendChainEvent`.

## Non-Goals

The router does not: (a) make a model call, (b) write files, (c) enforce budget caps (that's the hook's job), (d) learn from history (Phase 11 reflector territory per D-07).
The router does not author capability-gap CLUSTERS - Stage-0 emit is single-event-per-failure. Aggregation across events is Plan 29-03's reflector pass.
