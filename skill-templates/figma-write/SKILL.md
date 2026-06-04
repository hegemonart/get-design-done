---
name: gdd-figma-write
description: "Write design decisions from `.design/DESIGN-CONTEXT.md` back into the active Figma file by dispatching the `design-figma-writer` agent in one of three modes (annotate / tokenize / mappings). Use when the user has completed a design pipeline cycle and wants the decisions (layer comments, variable bindings, or Code Connect mappings) reflected in Figma. Operates proposal→confirm with `--dry-run` and `--confirm-shared` flags."
---

# gdd-figma-write

Dispatches the `design-figma-writer` agent to write design decisions back to the open Figma file. The shared probe pattern (ToolSearch → live call → STATE.md write) and connection handshake are documented at `../../reference/shared-preamble.md#connection-handshake-summary` and `../../connections/figma.md`.

## Usage

```
/get-design-done figma-write <mode> [--dry-run] [--confirm-shared]
```

Modes:
- `annotate` - add design decision comments to Figma layers
- `tokenize` - bind hard-coded color/spacing/type values to Figma variables
- `mappings` - write Code Connect component↔code file mappings

Flags:
- `--dry-run` - emit the proposal without executing any Figma writes
- `--confirm-shared` - authorize writes to shared team library components

## Prerequisites

1. Remote Figma MCP registered (writes are remote-only). Preferred: `claude plugin install figma@claude-plugins-official`. Manual: `claude mcp add --transport http figma https://mcp.figma.com/mcp`.
2. `.design/DESIGN-CONTEXT.md` exists (run `discover` first)
3. `.design/STATE.md` `<connections>` shows `figma: available (…, writes=true)`. If `writes=false` (desktop-only variant), writes are not supported - the agent will STOP with an instruction to install the remote MCP.

## Required Reading

Read `.design/STATE.md` and `.design/DESIGN-CONTEXT.md` before dispatching the agent.

## Dispatch

```
Task("design-figma-writer", """
mode: <annotate|tokenize|mappings>
dry_run: <true|false>
confirm_shared: <true|false>
required_reading:
  - .design/STATE.md
  - .design/DESIGN-CONTEXT.md
""")
```

Pass `mode` from the first positional argument; `dry_run` from `--dry-run`;
`confirm_shared` from `--confirm-shared`. Wait for the agent's completion
marker before returning.
