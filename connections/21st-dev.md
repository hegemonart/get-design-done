# 21st.dev Magic MCP — Connection Specification

This file is the connection specification for the 21st.dev Magic MCP within the hone pipeline. 21st.dev is a component-generator tool — it searches a marketplace of pre-built components and generates new ones via AI. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

### Prerequisites
- Node.js ≥ 18
- A 21st.dev account and API key at [21st.dev](https://21st.dev)
- `TWENTY_FIRST_API_KEY` environment variable set

### Install command (Claude Code)

```bash
npx @21st-dev/magic@latest init
```

This sets up the local MCP server. Add to Claude Code settings:
```json
{
  "mcpServers": {
    "21st-magic": {
      "command": "npx",
      "args": ["@21st-dev/magic@latest"],
      "env": { "TWENTY_FIRST_API_KEY": "${TWENTY_FIRST_API_KEY}" }
    }
  }
}
```

### Verification

```
ToolSearch({ query: "mcp__21st", max_results: 5 })
```

Expect non-empty results including `21st_magic_component_builder` or `21st_magic_component_search`. If empty, re-run `npx @21st-dev/magic@latest init` and restart Claude Code session.

---

## Probe Pattern

```
ToolSearch({ query: "mcp__21st", max_results: 5 })
→ Empty       → 21st-dev: not_configured (skip all 21st.dev steps)
→ Non-empty   → 21st-dev: available
```

Write result to STATE.md `<connections>`: `21st-dev: <status>`

Fallback: when `not_configured`, the explore stage skips the prior-art gate and proceeds with custom component generation.

---

## 21st.dev Magic MCP Tools

| Tool | Stage | Purpose |
|------|-------|---------|
| `21st_magic_component_search` | explore | Semantic search of marketplace; returns top N matching components with fit scores |
| `21st_magic_component_builder` | design | Generate component with multiple variations from a description |
| `21st_magic_component_get` | design | Fetch full source code for a specific marketplace component |
| `svgl_get_brand_logo` | explore + design | Fetch brand logo/icon SVG by brand name (SVGL integration) |

---

## Pipeline Integration

| Stage | What 21st.dev provides |
|-------|------------------------|
| explore | **Prior-art gate**: `21st_magic_component_search` before any greenfield build; top-3 in `<prior-art>` block in DESIGN.md |
| explore | **Brand assets**: `svgl_get_brand_logo` for logo/icon lookups by brand name |
| design | `21st_magic_component_builder` for component scaffolding via `design-component-generator` agent |

### Prior-Art Gate Logic

Before building any custom component:
1. `21st_magic_component_search(component_description, limit: 3)`
2. Evaluate top result fit score (0–100):
   - **≥ 80%**: surface as `<prior-art>` block in DESIGN.md; recommend adoption
   - **< 80%**: note top candidate for reference; proceed with custom build
3. Design-executor confirms adoption with user before calling `21st_magic_component_get`

This is a **decision gate** — the agent surfaces candidates, the user/executor decides. No automatic code insertion.

### SVGL Brand Logo Integration

`svgl_get_brand_logo(brand_name, format: "svg")` returns SVG markup for major brands (GitHub, Vercel, Stripe, etc.). Wire into explore stage for brand asset lookups — eliminates manual SVG hunting.

---

## Fallback Behavior

When `21st-dev: not_configured`:
- Prior-art gate is skipped. Print: `21st.dev not configured — prior-art gate skipped.`
- Custom component generation proceeds normally.
- Brand logo lookups fall back to icon library references in `reference/iconography.md` (Phase 15).
