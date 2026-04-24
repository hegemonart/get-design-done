# gdd-state MCP — Connection Specification

This file is the connection specification for the `gdd-state` MCP server within the get-design-done pipeline. `gdd-state` is a **local stdio MCP server** that ships with the plugin. It exposes 11 typed tools for reading and mutating `.design/STATE.md` and emits typed telemetry events on every successful mutation. Starting in Phase 20+, `gdd-state` is the **sole mutation surface** for STATE.md — stage SKILLs stop using `Read+regex+Write` and call these tools instead.

Unlike the remote/desktop connections (Figma, Refero, Preview, …), `gdd-state` is an **internal** connection: it does not reach out to any external service. It wraps the existing `scripts/lib/gdd-state/` module (see Plans 20-01, 20-02, 20-04) and emits events via `scripts/lib/event-stream/` (Plan 20-06). Every mutation tool emits a `state.mutation` event; `transition_stage` additionally emits `state.transition` on both pass and gate-veto.

---

## Setup

**Prerequisites:**

- The `@hegemonart/get-design-done` plugin installed (the server script ships in `scripts/mcp-servers/gdd-state/`).
- Node 22+ with `--experimental-strip-types` (the server is a TypeScript file run directly via strip-types — no build step).

### Option A — Project-scoped install (dev repo)

For local development against the plugin source tree:

```
claude mcp add gdd-state --transport stdio "node --experimental-strip-types ./scripts/mcp-servers/gdd-state/server.ts"
```

### Option B — Plugin-installed, global resolution

When the plugin is installed globally via `npm i -g @hegemonart/get-design-done`:

```
claude mcp add gdd-state --transport stdio "node --experimental-strip-types $(npm root -g)/@hegemonart/get-design-done/scripts/mcp-servers/gdd-state/server.ts"
```

Restart the Claude Code session after install.

**Configuration:**

The server resolves the STATE.md path from `process.env.GDD_STATE_PATH ?? .design/STATE.md`. Resolution is relative to the server's CWD at startup. When multiple projects run concurrently, each Claude Code session spawns its own server instance rooted at that session's project directory — the env override is only needed in the rare case where STATE.md lives somewhere other than `.design/`.

**Verification:**

After session restart:

```
ToolSearch({ query: "mcp__gdd_state", max_results: 1 })
```

A single non-empty match is sufficient — the server ships 11 tools, all prefixed `mcp__gdd_state__`.

---

## Probe Pattern

The `gdd-state` probe is **ToolSearch-only**. The server is local and always available once installed, so a keyword match on the tool prefix is sufficient evidence that the MCP is registered.

```
Step GS1 — ToolSearch check:
  ToolSearch({ query: "mcp__gdd_state", max_results: 1 })
  → Empty result     → gdd-state: not_configured  (fall back to direct import — see Fallback Behavior)
  → Non-empty result → gdd-state: available

Write gdd-state status to STATE.md <connections>.
```

No live tool call is required in the probe. Unlike Figma (which can be registered but error on auth/network), `gdd-state` is a local process — its presence in the tool list implies it will respond to calls. Each stage skill that probes should call `gdd_state__probe_connections` to write the resolved status back; the server's own probe result is recorded alongside every other connection.

---

## Tools

Tool names are static — the server always exposes `mcp__gdd_state__<tool>`. No prefix resolution is required.

| Tool                                 | Mutates? | Emits event?                     | Purpose                                                                                                     |
| ------------------------------------ | -------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `mcp__gdd_state__get`                | No       | —                                | Read current STATE.md (parsed). Optional `{ fields: string[] }` projection.                                 |
| `mcp__gdd_state__update_progress`    | Yes      | `state.mutation`                 | Update `<position>.task_progress` and/or `<position>.status`.                                               |
| `mcp__gdd_state__transition_stage`   | Yes      | `state.transition` (pass + fail) | Run the gate and advance `<position>.stage` on pass. Gate-veto returns `{success:false}`; server never crashes. |
| `mcp__gdd_state__add_blocker`        | Yes      | `state.mutation`                 | Append one entry to `<blockers>`. Defaults stage to current and date to today (UTC).                        |
| `mcp__gdd_state__resolve_blocker`    | Yes      | `state.mutation`                 | Remove one `<blockers>` entry by 0-based index or exact text match.                                         |
| `mcp__gdd_state__add_decision`       | Yes      | `state.mutation`                 | Append one entry to `<decisions>`. Auto-allocates `D-N`.                                                    |
| `mcp__gdd_state__add_must_have`      | Yes      | `state.mutation`                 | Append one entry to `<must_haves>`. Auto-allocates `M-N`.                                                   |
| `mcp__gdd_state__set_status`         | Yes      | `state.mutation`                 | Update `<position>.status`. Thin wrapper for prose that only changes status.                                |
| `mcp__gdd_state__checkpoint`         | Yes      | `state.mutation`                 | Bump `frontmatter.last_checkpoint` and append a `<timestamps>` entry.                                       |
| `mcp__gdd_state__probe_connections`  | Yes      | `state.mutation`                 | Merge probe results into `<connections>`. Overwrites keys; never deletes.                                   |
| `mcp__gdd_state__frontmatter_update` | Yes      | `state.mutation`                 | Patch frontmatter fields. Rejects `pipeline_state_version` and `stage` (use `transition_stage`).            |

**Tool response envelope (consistent across all 11 tools):**

```json
{
  "success": true,
  "data":    { /* tool-specific */ }
}
```

or

```json
{
  "success": false,
  "error": {
    "code":    "VALIDATION_STATUS_INVALID",
    "message": "status \"running\" is not one of initialized/in_progress/completed/blocked",
    "kind":    "validation",
    "context": { }
  }
}
```

`kind` is one of `validation`, `state_conflict`, `operation_failed`, `unknown` — matching the GDDError taxonomy in `scripts/lib/gdd-errors/`. Callers branch on `kind` to decide whether to retry, surface to the operator, or fall back. Full Draft-07 schemas live at `scripts/mcp-servers/gdd-state/schemas/*.schema.json` and the combined manifest is at `reference/schemas/mcp-gdd-state-tools.schema.json`.

**Scoped out of Phase 20:**

- `gdd_state__config_update` (mentioned in the ROADMAP prose but NOT in the numerical success criterion of "11 tools"). `.design/config.json` is a separate artifact from STATE.md; its mutation surface is tracked for Phase 21+.

---

## Pipeline Integration

`gdd-state` is **required, not optional**. It replaces the pre-Phase-20 `Read+regex+Write` pattern that every stage skill used to mutate STATE.md by hand. Skipping this connection is the pre-Phase-20 regression path.

| Stage   | Skill/Agent                           | Tool used                                                                                                                                                                                                                                                        | Purpose                                                                                                                                                             |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| brief    | `skills/brief/SKILL.md`               | `gdd_state__get`, `gdd_state__update_progress`, `gdd_state__set_status`, `gdd_state__add_must_have`, `gdd_state__add_decision`, `gdd_state__checkpoint`, `gdd_state__transition_stage`, `gdd_state__frontmatter_update`                                        | Initialize STATE.md position; record brief-derived decisions and must-haves; gate-advance to `explore` on completion.                                                |
| explore  | `skills/explore/SKILL.md`             | `gdd_state__get`, `gdd_state__probe_connections`, `gdd_state__add_decision`, `gdd_state__update_progress`, `gdd_state__checkpoint`, `gdd_state__transition_stage`                                                                                              | Run the 12-connection probe and write all 12 results with a single `probe_connections` call; record exploration-phase decisions; gate-advance to `plan`.             |
| plan     | `skills/plan/SKILL.md`                | `gdd_state__get`, `gdd_state__add_decision`, `gdd_state__add_must_have`, `gdd_state__update_progress`, `gdd_state__checkpoint`, `gdd_state__transition_stage`                                                                                                  | Record locked decisions and plan-derived must-haves; gate-advance to `design`.                                                                                       |
| design   | `skills/design/SKILL.md`              | `gdd_state__get`, `gdd_state__update_progress`, `gdd_state__checkpoint`, `gdd_state__add_decision`, `gdd_state__resolve_blocker`, `gdd_state__transition_stage`                                                                                                | Tick task_progress; resolve design-stage blockers; gate-advance to `verify`.                                                                                         |
| verify   | `skills/verify/SKILL.md`              | `gdd_state__get`, `gdd_state__update_progress`, `gdd_state__add_must_have` (status updates), `gdd_state__add_blocker` (on failure), `gdd_state__set_status` (`completed`/`blocked`), `gdd_state__checkpoint`                                                 | Execute must-have checks, flip `pass`/`fail`, append blockers on regressions, finalize status.                                                                       |

Stage SKILL rewrites in Plans 20-07 through 20-11 will switch each skill from `Read+Write` to these tools. Until those plans land, the tools are exposed but not yet consumed — Plan 20-05 ships only the surface.

---

## Fallback Behavior

If the `gdd-state` MCP is **not_configured** (ToolSearch returned empty), skills fall back to the pre-Phase-20 path by importing the `scripts/lib/gdd-state/` module directly:

```ts
import { read, mutate, transition } from '@hegemonart/get-design-done/scripts/lib/gdd-state/index.js';
```

This path bypasses the event stream (no `state.mutation` or `state.transition` events are emitted) but preserves mutation safety through the same lockfile + atomic-rename protocol. It exists for two reasons:

1. **Standalone CLI usage.** Users running `node` scripts against the plugin outside a Claude Code session do not have MCP; the direct import lets them still mutate STATE.md safely.
2. **Degraded operation.** If the MCP server fails to register for any reason (e.g. a session state bug), skills continue to function with the tradeoff of losing event telemetry for that session. Compared to crashing the stage, this is the right tradeoff — telemetry is observability; the STATE.md mutation is the user's primary concern.

Stages do not append a `<blocker>` for a missing `gdd-state` connection — the fallback path keeps mutation safety. If a downstream consumer specifically requires events (e.g. a Phase 22+ dashboard), that consumer is responsible for surfacing the absent MCP as its own problem.

---

## STATE.md Integration

Unlike external MCPs, `gdd-state` is the thing that **writes** to `<connections>`. Stage skills record its own probe result alongside every other connection:

```xml
<connections>
gdd-state: available
figma: available
refero: not_configured
preview: available
</connections>
```

**Status values:**

| Value            | Meaning                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `available`      | `ToolSearch` returned ≥1 result matching `mcp__gdd_state`. Server is registered and tools are loadable.        |
| `unavailable`    | Never used for `gdd-state` — the server either is or is not in the session. Reserved for symmetry.             |
| `not_configured` | `ToolSearch` returned empty. Fall back to the direct module import; events are not emitted this session.       |

---

## Caveats and Pitfalls

- **Do not run multiple `gdd-state` instances against the same `.design/`.** The module's lockfile (see `scripts/lib/gdd-state/lockfile.ts`) guarantees per-process safety, but spawning two separate MCP servers against the same STATE.md wastes locks and produces duplicate events. One server per Claude Code session is the design contract.

- **Event ordering follows successful mutation, not request receipt.** `appendEvent()` is called only after `mutate()` returns successfully. A failed mutation produces a `{success:false, error}` response with no event emitted. The `state.transition` event is a deliberate exception: gate vetoes emit `state.transition` with `pass:false` because gate failures are themselves observable telemetry.

- **`frontmatter_update` cannot patch `stage`.** It returns a validation error — stages must use `transition_stage` which runs the gate and emits the right event.

- **`resolve_blocker` returns `operation_failed` for no-match.** This is a non-throw failure: the caller's input was well-formed, the operation simply cannot complete. Branch on `kind === 'operation_failed'` to decide whether to retry with different inputs or surface to the operator.

- **Session-id is process-level, not pipeline-level.** Every event emitted by a single server process carries the same `sessionId`. Long-running sessions will emit many events under one ID; correlation across sessions is via the cycle / stage fields, not sessionId.

- **Schema files are loaded at server startup.** Edits to the per-tool JSON Schemas require a server restart to take effect. Restart the Claude Code session or re-run `claude mcp add` after schema edits.

- **STATE.md path resolution.** The server resolves `.design/STATE.md` relative to its CWD at startup. If the parent Claude Code session starts in a subdirectory of your repo, set `GDD_STATE_PATH` to the absolute path to avoid "file not found" errors on the first tool call.
