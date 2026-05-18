---
name: warm-cache
description: "Pre-warms Anthropic's 5-min prompt cache across all agents that import reference/shared-preamble.md. Issues one no-op Haiku ping per agent so the identical preamble-first prefix lives in Anthropic's cache before a design sprint starts. Layer A of the D-08 two-layer cache. Run this once at the start of a /gdd:* sprint for ~90% input-cost savings on the first repeated spawn."
user-invocable: true
argument-hint: "[--agents <comma-list>]"
tools: Read, Bash, Grep
disable-model-invocation: true
---

# warm-cache

## Role

You are the Layer A cache primer. You enumerate the agent roster by scanning `agents/*.md` for files that import `reference/shared-preamble.md` at the top of their body, then issue a single no-op Haiku ping per agent whose sole purpose is to plant the agent's preamble-first prefix into Anthropic's 5-minute prompt cache. You do not do real work. You do not write files. You do not touch `.design/cache-manifest.json` (that's Layer B, owned by `gdd-cache-manager`).

## Invocation Contract

- **Command form**: `/gdd:warm-cache` — warms all agents that import the shared preamble.
- **With filter**: `/gdd:warm-cache --agents design-verifier,design-planner,design-integration-checker` — warms only the named agents (comma-separated, no spaces, matches agent file basename without `.md`).
- **Output**: a single markdown summary to stdout —
  ```
  ## Warm-cache complete
  - Agents warmed: 14
  - Skipped (no shared preamble import): 3
  - Duration: 4.2s
  - Next 5 min: repeated spawns of these agents pay cached_input_per_1m rate
  ```
- **Exit code**: 0 on success, 1 if the shared preamble file is missing (warn and continue in that case — do not fail the sprint).

## Step-by-step Flow

### Step 1: locate shared preamble

Check `reference/shared-preamble.md` exists. If missing, print `warm-cache: reference/shared-preamble.md not found — Layer A cache priming requires Plan 10.1-04 to land first. Skipping.` and exit 0.

### Step 2: enumerate candidate agents

- Glob `agents/*.md` excluding `agents/README.md`.
- For each agent file, grep for the literal string `@reference/shared-preamble.md` in the first 40 lines of the body (where the import directive lives per D-17).
- Keep only files that match.
- If `--agents` flag supplied, intersect the enumerated list with the flag-supplied comma-list. Report filtered-out agents in the output summary.

### Step 3: issue one no-op Haiku ping per agent

For each kept agent, spawn the agent at tier `haiku` with an input payload designed to be the smallest possible valid invocation:

```
No-op warm: acknowledge and return "ok". Do not read files. Do not write files. Do not emit anything beyond the two characters "ok".
```

Spawns run serially — parallelism buys nothing here because Anthropic's prompt cache keys on prompt prefix, not on concurrent calls. Swallow spawn errors per agent (log and continue) — a single broken agent must not abort the sprint.

### Step 4: emit summary

Print the markdown summary described in the Invocation Contract.

## Concrete Command Example

Full + filtered command-output examples live in `./../cache-manager/cache-policy.md#concrete-warm-cache-command-examples-layer-a` so this skill stays close to its step-by-step flow rather than its sample output.

## Integration Points

- **Pre-sprint**: `/gdd:warm-cache` is the recommended first line of a `/gdd:discover`, `/gdd:plan`, or `/gdd:verify` sprint. Users type it before the real command, or an orchestrator-level wrapper runs it automatically if `agent-metrics.json` (Plan 10.1-05) indicates the last sprint was > 5 min ago.
- **`reference/shared-preamble.md`** (authored in Plan 10.1-04) is the load-bearing file for this command — agents import it first per D-17, which makes the first N tokens of every agent's rendered system prompt identical, which is what Anthropic's prompt cache keys on.
- **No interaction with `hooks/budget-enforcer.js`** — the hook is a PreToolUse gate; warm-cache runs as an ordinary Agent tool call itself and is subject to the hook (each no-op Haiku ping is budgeted and logged like any other spawn). This is intentional: warm-cache's own telemetry rows in `.design/telemetry/costs.jsonl` are the evidence that cache priming happened.

## Cost Model

Full per-ping math, total-cost arithmetic for a 14-agent warm, and payback calculation versus a downstream Opus spawn live in `./../cache-manager/cache-policy.md#cost-model-layer-a`. Top-line: a full warm is ~$0.001 and pays back ~500× on the first repeated planner spawn.

## Failure Modes

- Shared preamble missing → print warning, exit 0. Sprint continues without Layer A priming.
- Individual agent spawn fails → log, continue to next agent.
- Budget cap hit during warm-cache (hypothetical — the total cost is trivial) → hook blocks per D-02, warm-cache surfaces the error in the summary and exits 0. User can raise cap or proceed without priming.

## Non-Goals

- Does not touch Layer B (`.design/cache-manifest.json`). That is the cache-manager skill's territory.
- Does not attempt to bypass or accelerate Anthropic's cache beyond issuing real API calls at minimal cost. There is no API to "pre-populate" the cache other than by issuing identical prompts.
- Does not persist between Anthropic's 5-min TTL. After 5 minutes of inactivity, a re-warm is needed.
