# Builder.io — Connection Specification

This file is the connection specification for Builder.io Visual Copilot within the hone pipeline. Builder.io Visual Copilot is an AI-native **generator-category** tool — it converts designs (Figma frames, imported layouts) into framework code and generates UI components from descriptions. It integrates via the Builder MCP / Visual Copilot or via a direct API key. See `connections/connections.md` for the full connection index and capability matrix.

**Scope this phase: PULL-ONLY.** Builder.io is used to *ingest patterns* and *generate* code into the pipeline. Write-back (publishing components or content models back to Builder.io spaces) is **deferred** — not wired this phase. See [21st.dev](21st-dev.md) for the sibling generator-category spec.

---

## Setup

### Prerequisites

**Path A — Builder MCP / Visual Copilot (preferred):**
- A [Builder.io](https://www.builder.io) account
- The Builder MCP or Visual Copilot enabled in your Claude environment
- No additional manual setup when the connector is enabled

**Path B — API key fallback:**
- A Builder.io account and API key (public/private key for your Builder space)
- `BUILDER_API_KEY` environment variable set
- MCP server install (example):
  ```bash
  claude mcp add builder-io --transport http https://mcp.builder.io/sse \
    -e BUILDER_API_KEY=$BUILDER_API_KEY
  ```

### Verification

```
ToolSearch({ query: "builder", max_results: 5 })
```

Non-empty results including a Builder generate/figma-import tool → connector available (Path A).
Empty → check `BUILDER_API_KEY`; if set, install Path B and restart the Claude Code session.

---

## Probe Pattern

Builder.io uses a **MCP-first, env-fallback** probe. Check for Builder tools first; fall back to the API key env var.

```
ToolSearch({ query: "builder", max_results: 5 })
→ Non-empty  → builder-io: available (MCP / Visual Copilot)
→ Empty      → check BUILDER_API_KEY env var
               set    → builder-io: available (API key path)
               unset  → builder-io: not_configured
```

Three-value schema written to `.design/STATE.md` `<connections>`:

| Value | Meaning |
|-------|---------|
| `available` | Builder MCP tools found, OR `BUILDER_API_KEY` is set |
| `not_configured` | No Builder tools and no API key — skip all Builder.io steps |
| `error` | Tools present but probe/auth failed — degrade, surface the error, never block |

Write result to STATE.md `<connections>`: `builder-io: <status>`

Fallback: when `not_configured`, the generator stage skips Builder.io and falls back to another generator (if available) or degrades to manual code-only build.

---

## Builder.io Tools

Builder.io exposes Visual Copilot capabilities through MCP tools. Names and exact signatures vary by connector version — discover them via the probe (`ToolSearch({ query: "builder" })`) rather than hardcoding. Described generically, the relevant **pull-only** capabilities are:

| Capability | Stage | Purpose |
|------------|-------|---------|
| Figma → code generate | generator | Convert a selected Figma frame/URL into framework code (React, Vue, Svelte, Angular, etc.) |
| Describe → component generate | generator | Generate a UI component from a natural-language description |
| Pull / ingest pattern | generator | Fetch an existing Builder block/pattern as a starting point for adaptation |

### Typical generate inputs (generic)

| Input | Values | Notes |
|-------|--------|-------|
| `source` | Figma frame URL / selection, or description | Pull-side input — the design or spec to convert |
| `framework` | `"react" \| "vue" \| "svelte" \| "angular"` | Auto-detected from the project in the explore stage |
| `styling` | `"tailwind" \| "css" \| "styled-components"` | Auto-detected; defaults to the project's active styling |

Returns generated source code (and, where supported, a preview reference) for the generator stage to consume.

---

## Pipeline Integration

Builder.io is wired as a **generator-category** connection: it feeds the **generator** stage only.

| Stage | What Builder.io provides |
|-------|--------------------------|
| generator | Figma → code / describe → component generation via `agents/design-component-generator.md` |
| generator | Pull / ingest an existing Builder pattern as adaptation source |

### Generator wiring

The generator stage dispatches to Builder.io through the `<!-- impl: builder-io -->` section of `agents/design-component-generator.md`. That agent:

1. Reads `builder-io: available` from STATE.md `<connections>` before dispatching.
2. Resolves the generate inputs (Figma source or description; `framework`; `styling`) from project context.
3. Calls the Builder generate/pull capability and captures the returned source code.
4. Writes the generated component into the project as a **proposal**, not a direct commit.

### Pull-only scope (write-back deferred)

This phase wires **ingest + generate only**:

- **Ingest**: pull existing Builder patterns/blocks as adaptation sources.
- **Generate**: Figma → code and describe → component into the pipeline.
- **NO write-back**: the pipeline does **not** publish components, content models, or edits back to Builder.io spaces this phase. Write-back / roundtrip is explicitly **deferred** to a later phase.

### Proposal → confirm

Generated code is **never** auto-inserted. The generator surfaces the result as a proposal; the design-executor confirms adoption with the user before the code is written into the working tree. This mirrors the decision-gate pattern used by sibling generators (see [21st.dev](21st-dev.md)) — the agent surfaces candidates, the user/executor decides.

---

## Fallback Behavior

When `builder-io: not_configured`:
- Print: `Builder.io not configured — Visual Copilot generator skipped.`
- Falls back to another generator-category connection if one is `available` (e.g. 21st.dev, Magic Patterns).
- If no generator is configured, the generator stage **degrades to code-only**: the design-executor proceeds with a manual component build.
- Builder.io **never blocks** the pipeline — a missing or errored connection only removes one generator option; the generator stage always has a code-only path.

When `builder-io: error`:
- Surface the probe/auth error to the user, mark the connection degraded, and fall back as above. Do not retry in a loop and do not block.

---

Do NOT edit the connection index here — the 37.1 wiring plan adds the Active-Connections row + matrix entry.
