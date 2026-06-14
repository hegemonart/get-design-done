---
name: hone-paper-write
description: "Push design decisions from `.design/DESIGN-CONTEXT.md` into the active paper.design canvas by dispatching the `design-paper-writer` agent in one of three modes (annotate / tokenize / roundtrip). Use when the user has completed a design pipeline cycle and wants the decisions reflected in their paper.design canvas. Operates proposal->confirm with `--dry-run`."
argument-hint: "<annotate|tokenize|roundtrip> [--dry-run]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# gdd-paper-write

Dispatches the `design-paper-writer` agent to write design decisions back to the active paper.design canvas. The shared probe pattern (ToolSearch → live call → STATE.md write) and connection handshake are documented at `../../reference/shared-preamble.md#connection-handshake-summary` and `../../connections/paper-design.md`.

## Usage

```
/get-design-done paper-write <mode> [--dry-run]
```

Modes:
- `annotate` - add design decision comments to canvas nodes
- `tokenize` - sync CSS token values to paper.design node styles
- `roundtrip` - write implementation status back as text/HTML layers

Flags:
- `--dry-run` - emit the proposal without executing any paper.design writes

paper.design has no team-library concept, so there is no `--confirm-shared` flag. Every write still requires an explicit `yes` confirmation (unless `--dry-run` is set).

## Prerequisites

1. paper.design MCP registered. Install: `claude mcp add paper-design --transport http https://mcp.paper.design/sse` then restart the session. See `../../connections/paper-design.md` for the full probe pattern and budget rules.
2. `.design/DESIGN-CONTEXT.md` exists (run `discover` first)
3. `.design/STATE.md` `<connections>` shows `paper-design: available`. If `not_configured` or `unavailable`, the agent will STOP with a diagnostic.

Budget: the agent tracks `budget_used` in STATE.md `<connections>` and warns when usage reaches 90/100 on the free tier.

## Required Reading

Read `.design/STATE.md` and `.design/DESIGN-CONTEXT.md` before dispatching the agent.

## Dispatch

```
Task("design-paper-writer", """
mode: <annotate|tokenize|roundtrip>
dry_run: <true|false>
required_reading:
  - .design/STATE.md
  - .design/DESIGN-CONTEXT.md
""")
```

Pass `mode` from the first positional argument; `dry_run` from `--dry-run`.
Wait for the agent's completion marker before returning.
