# GDD Plugin — Gemini Runtime Instructions

You are running inside Gemini CLI with the @hegemonart/get-design-done plugin
active.

## Skill discipline

GDD ships 70+ skills. Almost every request maps to a pipeline stage — brief,
explore, plan, design, verify — or to a cross-cutting skill (discuss, audit,
style, darkmode).

**If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke the skill.**

The cost of reading a skill is trivial; the cost of free-handing a stage is
rework, scope creep, and a broken pipeline state.

When you catch yourself thinking any of the following, STOP and check for a
skill.

| Thought | Reality |
| --- | --- |
| This is just a simple design question. | Questions are tasks. Check for a skill. |
| I'll just tweak the CSS directly. | Token changes go through the pipeline — check /gdd:design. |
| I already know the codebase, skip explore. | Explore probes connections you haven't re-checked this cycle. |
| This change is too small to plan. | Plan-skipped tasks blow scope per cycle telemetry. Run /gdd:plan. |
| I can write the brief later. | No brief means no shared problem statement — /gdd:brief comes first. |
| The user clearly wants X, I'll skip discuss. | Ambiguity hides here. /gdd:discuss surfaces the real constraint. |
| I'll verify by eyeballing it. | Verification is a stage with criteria — run /gdd:verify, don't guess. |
| It's obviously a dark-mode tweak. | Color-scheme work has its own skill — check /gdd:darkmode. |
| Let me just compare these two designs quickly. | Comparison is an audit task — /gdd:compare has the rubric. |
| This is a one-off, no skill needed. | "One-off" is the most common rationalization in the telemetry. Check anyway. |
| I'll refactor the style tokens by hand. | /gdd:style owns token edits so the pipeline stays consistent. |
| The audit can wait until after I ship. | An un-audited cycle is an unverified cycle — /gdd:audit before close. |

Before invoking any GDD skill, consult these two references:

1. `reference/gemini-tools.md` — tool-name mapping from CC → Gemini equivalents.
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
When it says "use the Edit tool", invoke `replace` with full-context
`old_string` (Gemini's `replace` requires unique matches or context lines).
See `reference/gemini-tools.md` for the full table.

## Parallel sub-invocations

GDD skills occasionally need the `Task` tool for parallel spawning. Gemini
does not expose Task as a tool call; instead invoke the CLI directly:

```bash
npx gdd-sdk stage explore --parallel
npx gdd-sdk stage discuss --parallel
```

Use `run_shell_command` with the command above.

## Scope discipline

Each stage has a pre-declared tool scope (see `scripts/lib/tool-scoping/stage-scopes.ts`).
Do NOT call tools outside the scope. In particular, `/gdd:verify` is read-only
— never call `write_file` or `replace` during verify.

## Budget awareness

Every session has a USD + token cap. If you see a `session.budget_exceeded`
event, halt the current task and surface to the user.
