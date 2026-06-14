# pencil.dev — Connection Specification

This file is the connection specification for pencil.dev within the hone pipeline. pencil.dev uses git-tracked `.pen` files as its source of truth — no MCP server is required. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites
- pencil.dev VS Code or Cursor extension installed from the marketplace
- One or more `.pen` files in the project (typically at project root or in `src/`)

### Verification

Run in the project directory:
```bash
find . -name "*.pen" -not -path "*/node_modules/*" | head -5
```
One or more results = pencil.dev is in use.

No MCP server install needed — the pipeline reads and writes `.pen` files directly via standard file tools.

---

## Probe Pattern

pencil.dev does not use MCP tools. Probe is file-based.

```bash
PEN_FILES=$(find . -name "*.pen" -not -path "*/node_modules/*" 2>/dev/null)
if [ -n "$PEN_FILES" ]; then
  echo "pencil-dev: available"
else
  echo "pencil-dev: not_configured"
fi
```

Write result to STATE.md `<connections>`: `pencil-dev: available` or `pencil-dev: not_configured`.

---

## .pen File Format

`.pen` files are YAML-front-matter component specs:

```yaml
---
component: Button
variant: primary
state: default
design-tokens:
  bg: brand-primary-500
  text: white
  radius: 6px
  padding: "8px 16px"
---

Notes: Primary CTA button. Use for the main action in any modal or form.
```

- `component` — component name (must match the implementation filename)
- `variant` — variant label (matches Storybook story name where applicable)
- `state` — `default | hover | focus | disabled | error`
- `design-tokens` — key/value map of token names to values (CSS variables or literal values)
- Body prose — optional implementation notes

`.pen` files are **git-tracked source of truth**. Commits to `.pen` files must be atomic — spec and implementation changes committed together when possible.

---

## Pipeline Integration

| Stage | What pencil.dev provides |
|-------|--------------------------|
| explore | `.pen` file discovery; synthesizer merges `.pen` declarations with code grep results |
| verify | Spec-vs-implementation diff: `.pen` declared token values vs. actual token values in code |
| design | `design-pencil-writer` agent: annotate + roundtrip modes; atomic git commits on `.pen` writes |

**Architectural advantage:** Both the design spec (`.pen` file) and implementation (source code) are version-controlled. Pre-merge diff verification is uniquely strong compared to tools where the design lives outside git.

---

## Fallback Behavior

When `pencil-dev: not_configured`:
- All pencil.dev steps are skipped silently.
- A one-line diagnostic is printed: `pencil.dev not configured — no .pen files found.`
- Pipeline continues normally.
