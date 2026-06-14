# paper.design MCP — Connection Specification

This file is the connection specification for paper.design within the hone pipeline. paper.design is a canvas tool — it treats the design canvas as both source AND destination, enabling a full canvas→code→verify→canvas round-trip. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites
- A paper.design account
- paper.design MCP server registered in your Claude Code session

### Install command (Claude Code)

```bash
claude mcp add paper-design --transport http https://mcp.paper.design/sse
```

After running this command, restart the Claude Code session.

### Verification

```
ToolSearch({ query: "mcp__paper", max_results: 5 })
```

Expect non-empty results including `mcp__paper-design__get_selection` or similar. If empty, re-run the install command above and restart the Claude Code session.

### Budget

paper.design **free tier**: 100 MCP calls/week. Pro tier: 1M calls/week. The pipeline tracks `budget_used` in STATE.md `<connections>` and warns at 90 calls.

---

## Probe Pattern

```
ToolSearch({ query: "mcp__paper", max_results: 5 })
→ Empty       → paper-design: not_configured (skip all paper.design steps)
→ Non-empty   → proceed to live call

call mcp__paper-design__get_selection
→ Success     → paper-design: available
→ Error       → paper-design: unavailable
```

Write result to STATE.md `<connections>`: `paper-design: <status>`

Also write initial budget state:
```xml
<connections>
paper-design: available | budget_used: 0 | budget_limit: 100
</connections>
```

---

## paper.design MCP Tools

| Tool | Stage | Purpose |
|------|-------|---------|
| `mcp__paper-design__get_selection` | explore | JSON of selected canvas elements (id, type, name, bounds) |
| `mcp__paper-design__get_jsx` | explore | React JSX string of selected component tree |
| `mcp__paper-design__get_computed_styles` | explore | CSS computed styles for current selection |
| `mcp__paper-design__get_screenshot` | verify | Base64 PNG screenshot of selected canvas element |
| `mcp__paper-design__add_comment` | design | Add annotation comment to a canvas node |
| `mcp__paper-design__update_styles` | design | Update CSS properties of a canvas node |
| `mcp__paper-design__set_text_content` | design | Write text content to a canvas text layer |
| `mcp__paper-design__write_html` | design | Write HTML snippet to a canvas layer |

---

## Pipeline Integration

| Stage | What paper.design provides |
|-------|---------------------------|
| explore | Canvas read: `get_selection` (node list), `get_jsx` (React component tree), `get_computed_styles` (CSS values) → merged into DESIGN-CONTEXT.md |
| design | `design-paper-writer` agent: annotate / tokenize / roundtrip modes via write tools |
| verify | `get_screenshot` for components flagged `? VISUAL` — element-scoped (complements route-scoped Preview screenshots) |

### Canvas Read (Explore Stage)

The explore stage context-builder reads the paper.design canvas via:

1. `mcp__paper-design__get_selection` — get selected element IDs and names
2. `mcp__paper-design__get_jsx` — get full React component tree of selection
3. `mcp__paper-design__get_computed_styles` — get computed CSS values

Results are merged into DESIGN-CONTEXT.md as a `<canvas_sources>` block alongside Figma variables, Refero refs, and other sources.

### Write-Back (Design Stage)

The `design-paper-writer` agent handles write-back in three modes:
- **annotate** — add design-decision comments to canvas nodes (`add_comment`)
- **tokenize** — sync CSS token values to paper.design node styles (`update_styles`)
- **roundtrip** — write implementation status back as text/HTML layers (`set_text_content`, `write_html`)

All writes require user confirmation via proposal→confirm flow. See `agents/design-paper-writer.md`.

### Screenshot Verification (Verify Stage)

`mcp__paper-design__get_screenshot(node_id)` captures a PNG of a specific canvas element.

- Canvas-element-scoped (NOT route-scoped like Phase 8 Preview)
- Both are complementary: paper.design → canvas component view; Preview → rendered browser route
- Screenshots saved to `.design/screenshots/paper-<component>-<date>.png`

---

## Budget Tracking

After every write tool call, increment `budget_used` in STATE.md:

```xml
<connections>
paper-design: available | budget_used: 12 | budget_limit: 100
</connections>
```

Warn when `budget_used >= 90`: `Warning: paper.design budget at 90/100 calls this week.`

Read tools (`get_selection`, `get_jsx`, `get_computed_styles`, `get_screenshot`) also consume budget — track them as well.

---

## Fallback Behavior

When `paper-design: not_configured`:
- Skip all paper.design steps. Print: `paper.design not configured — canvas integration skipped.`
- Explore stage proceeds with code-only context (grep + Figma + Storybook if available).
- Verify stage uses Preview screenshots only (no canvas-element screenshots).
- Design stage does not offer paper-writer.

When `paper-design: unavailable`:
- Update STATE.md to `paper-design: unavailable`.
- Print: `paper.design unavailable — check MCP connection and try again.`
- Degrade as above.
