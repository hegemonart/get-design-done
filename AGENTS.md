# GDD Plugin — Codex Runtime Instructions

You are running inside Codex CLI with the @hegemonart/get-design-done plugin
active. Before invoking any GDD skill, consult these two references:

1. `reference/codex-tools.md` — tool-name mapping from CC → Codex equivalents.
2. `skills/<stage>/SKILL.md` — the stage skill you're executing.

## How to invoke a stage

Run a single stage headlessly:

```bash
npx gdd-sdk stage <name>
```

Run full pipeline:

```bash
npx gdd-sdk run
```

## STATE.md mutations

Every mutation to `.design/STATE.md` MUST go through the `gdd-state` MCP server.
The 11 tools are prefixed `mcp__gdd_state__*`. Never edit STATE.md by hand.

## Tool translation

When a skill prose says "use the Read tool", invoke `read_file` instead.
See `reference/codex-tools.md` for the full table.

## Parallel sub-invocations

GDD skills occasionally need the `Task` tool for parallel spawning. Codex
does not expose Task as a tool call; instead invoke the CLI directly:

```bash
npx gdd-sdk stage explore --parallel
npx gdd-sdk stage discuss --parallel
```

## Scope discipline

Each stage has a pre-declared tool scope (see `scripts/lib/tool-scoping/stage-scopes.ts`).
Do NOT call tools outside the scope. In particular, `/gdd:verify` is read-only
— never call `apply_patch` or `write_file` during verify.

## Budget awareness

Every session has a USD + token cap. If you see a `session.budget_exceeded`
event, halt the current task and surface to the user.
