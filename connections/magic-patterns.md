# Magic Patterns — Connection Specification

This file is the connection specification for Magic Patterns within the hone pipeline. Magic Patterns is a component-generator tool — it generates DS-aware UI components from natural-language descriptions. It integrates via the Magic Patterns Claude connector (no manual setup when enabled) or via a direct API key. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites

**Path A — Claude connector (preferred):**
- Magic Patterns Claude connector enabled in your Claude environment
- No additional setup required

**Path B — API key fallback:**
- A Magic Patterns account and API key at [magicpatterns.com](https://magicpatterns.com)
- `MAGIC_PATTERNS_API_KEY` environment variable set
- MCP server install:
  ```bash
  claude mcp add magic-patterns --transport http https://mcp.magicpatterns.com/sse \
    -e MAGIC_PATTERNS_API_KEY=$MAGIC_PATTERNS_API_KEY
  ```

### Verification

```
ToolSearch({ query: "mcp__magic_patterns", max_results: 5 })
```

Non-empty results including `magic_patterns_generate` → Claude connector available (Path A).
Empty → install Path B and restart Claude Code session.

---

## Probe Pattern

Magic Patterns uses a two-path probe. Check Claude connector first; fall back to API key path.

```
ToolSearch({ query: "mcp__magic_patterns", max_results: 5 })
→ Non-empty  → magic-patterns: available (Claude connector)
→ Empty      → check MAGIC_PATTERNS_API_KEY env var
               set → magic-patterns: available (API key path)
               unset → magic-patterns: not_configured
```

Write result to STATE.md `<connections>`: `magic-patterns: <status>`

Fallback: when `not_configured`, the design stage skips Magic Patterns and falls back to 21st.dev (if available) or manual component build.

---

## Magic Patterns Tools

| Tool | Stage | Purpose |
|------|-------|---------|
| `magic_patterns_generate` | design | Generate component from description; returns `{ code, preview_url, component_id }` |
| `magic_patterns_annotate` | design | Post DESIGN-DEBT findings back to a component by ID |
| `magic_patterns_regenerate` | design | Roundtrip: regenerate with updated description |

### `magic_patterns_generate` parameters

| Parameter | Values | Notes |
|-----------|--------|-------|
| `description` | string | Natural-language component spec |
| `design_system` | `"shadcn" \| "tailwind" \| "mantine" \| "chakra"` | Auto-detected from project in explore stage |
| `quality_mode` | `"fast" \| "best"` | `fast` for explore iterations; `best` for final design stage output |

---

## Pipeline Integration

| Stage | What Magic Patterns provides |
|-------|------------------------------|
| explore | DS detection → STATE.md `<design_system>` block for generator targeting |
| design | `magic_patterns_generate(description, design_system, quality_mode: "best")` → component source + `preview_url` |
| verify | `preview_url` from generate response → feeds Phase 8 Preview `? VISUAL` check |
| design | `magic_patterns_annotate(component_id, feedback)` → roundtrip mode; post DESIGN-DEBT notes back |

### Design-System Auto-Detection

Before invoking `magic_patterns_generate`, the explore stage detects the project's active design system (see `agents/design-context-builder.md` Step 0C):

1. Check `gdd.config.json` (if present): read `designSystem` field → use directly if set.
2. Scan `package.json` dependencies:
   - `@shadcn/ui` or `shadcn` present → `"shadcn"`
   - `@mantine/core` or `@mantine/hooks` present → `"mantine"`
   - `@chakra-ui/react` present → `"chakra"`
   - `tailwindcss` present → `"tailwind"`
3. Default: `"tailwind"`

Write result to STATE.md `<design_system>` block.

### Preview Integration

`magic_patterns_generate` returns `preview_url`. The design-component-generator agent writes this URL to STATE.md `<generator>` block. The verify stage's `? VISUAL` check reads `preview_url` from STATE.md and opens it in Phase 8 Preview for visual comparison.

---

## Fallback Behavior

When `magic-patterns: not_configured`:
- Print: `Magic Patterns not configured — component generator skipped.`
- Falls back to 21st.dev if `21st-dev: available`.
- If both not configured, design stage proceeds with manual component build.
