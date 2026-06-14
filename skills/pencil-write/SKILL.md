---
name: hone-pencil-write
description: "Update local `.pen` source files with design decisions from `.design/DESIGN-CONTEXT.md` by dispatching the `design-pencil-writer` agent in one of two modes (annotate / roundtrip). Use when the user has completed a design pipeline cycle and wants the decisions reflected in their `.pen` files. Operates proposal->confirm with `--dry-run`."
argument-hint: "<annotate|roundtrip> [--dry-run]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# gdd-pencil-write

Dispatches the `design-pencil-writer` agent to write design decisions back to `.pen` spec files. Unlike Figma/paper.design, pencil.dev keeps `.pen` YAML specs as the project's git-tracked source of truth; no MCP is required and every write is committed atomically. The probe pattern (file-based, no ToolSearch) and integration contract are documented at `../../connections/pencil-dev.md`.

## Usage

```
/get-design-done pencil-write <mode> [--dry-run]
```

Modes:
- `annotate` - append DESIGN-DEBT findings as comments to the relevant `.pen` files
- `roundtrip` - update `.pen` spec frontmatter (design-tokens, state) from verified implementation

There is no `tokenize` mode; `.pen` files are source-of-truth specs, not derived artifacts.

Flags:
- `--dry-run` - emit the proposal without writing or committing any `.pen` changes

## Prerequisites

1. pencil.dev workspace detected; one or more `.pen` files in `cwd` (no MCP install required):
   ```bash
   find . -name "*.pen" -not -path "*/node_modules/*" | head -5
   ```
2. `.design/DESIGN-CONTEXT.md` exists (run `discover` first). For `annotate` mode, `.design/DESIGN-DEBT.md` is also required. For `roundtrip` mode, `.design/DESIGN-VERIFICATION.md` is also required.
3. `.design/STATE.md` `<connections>` shows `pencil-dev: available`. If `not_configured`, no `.pen` files were found at probe time; re-run `discover` or `connections` after adding `.pen` specs.

## Required Reading

Read `.design/STATE.md` and `.design/DESIGN-CONTEXT.md` before dispatching the agent.

## Dispatch

```
Task("design-pencil-writer", """
mode: <annotate|roundtrip>
dry_run: <true|false>
required_reading:
  - .design/STATE.md
  - .design/DESIGN-CONTEXT.md
""")
```

Pass `mode` from the first positional argument; `dry_run` from `--dry-run`.
Wait for the agent's completion marker before returning.
