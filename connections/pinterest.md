# Pinterest MCP — Connection Specification

This file is the connection specification for Pinterest MCP within the get-design-done pipeline. Its primary role is to provide visual reference collection in the discover stage — users search Pinterest for design patterns, color palettes, and UI inspiration that feed into the research-synthesizer as reference inputs. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

**Prerequisites:**

- Pinterest MCP installed and registered in Claude Code. The recommended package is `terryso/mcp-pinterest` (headless scraping, no API key required).

**Install command (Claude Code):**

```
npx -y @smithery/cli install mcp-pinterest --client claude
```

This registers the server with the name `mcp-pinterest`. After running, restart the Claude Code session.

**Alternative package:**

```
npx @iflow-mcp/pinterest-mcp-server
```

If using the alternative, the server name may differ — run the verification step below to confirm.

**Verification:**

After session restart, run:

```
ToolSearch({ query: "mcp-pinterest", max_results: 5 })
```

Expect non-empty results listing `mcp__mcp-pinterest__*` tools. If results are empty, the Pinterest MCP is not registered — run the install command above and restart.

**Warning — prefix depends on registration name:**

Pinterest MCP tool names in Claude Code follow the pattern `mcp__<server-name>__<tool-name>`. The default Smithery install uses `mcp-pinterest` as the server name, giving the prefix `mcp__mcp-pinterest__`. However, if registered with a different name (e.g., `pinterest`), the prefix becomes `mcp__pinterest__`. **Always verify via ToolSearch at runtime — never hardcode the prefix.** The stage probe handles this automatically.

---

## Tools

Tool names below assume the default `mcp-pinterest` server registration. Actual names may differ — confirm via ToolSearch.

| Tool shortname | Expected full name | Returns | Pipeline use |
|----------------|-------------------|---------|--------------|
| `pinterest_search` | `mcp__mcp-pinterest__pinterest_search` | Array of pin objects (url, title, image_url, description) | **Primary discover tool** — search by keyword for design inspiration |
| `pinterest_get_image_info` | `mcp__mcp-pinterest__pinterest_get_image_info` | Pin metadata (title, description, board, creator, tags) | Detail enrichment for a specific pin URL |
| `pinterest_search_and_download` | `mcp__mcp-pinterest__pinterest_search_and_download` | Search results + local image downloads | Heavy mode — only use if offline image analysis is required |

**Recommended for pipeline use:** `pinterest_search` only. It returns pin metadata without downloading images, keeping token cost and latency low. `pinterest_get_image_info` is used when a specific pin needs deeper attribution. `pinterest_search_and_download` should only be used when the user explicitly needs local image files.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Tools used | Purpose |
|-------|------------|------------|---------|
| discover | `agents/design-research-synthesizer.md` | `pinterest_search` | Search for visual inspiration matching the project's design direction; results feed into `<connection_sources>` section of DESIGN-CONTEXT.md |

Pinterest is a reference source only — it feeds the synthesizer alongside Refero, awesome-design-md, and Figma variables. It does NOT modify STATE.md decisions directly.

---

## Availability Probe

**Pinterest uses the ToolSearch-only probe pattern** — identical to Refero. No live tool call is needed to confirm availability.

```
Step P1 — ToolSearch check (discover stage entry):
  ToolSearch({ query: "mcp-pinterest", max_results: 5 })
  → Empty result      → pinterest: not_configured  (skip Pinterest; fall through to Refero)
  → Non-empty result  → pinterest: available
```

**No live call at probe time.** Unlike Preview (which calls `preview_list`), Pinterest requires no live probe call. ToolSearch presence is sufficient — the tool will be called only when a search query is needed.

Write the result to `.design/STATE.md <connections>` immediately after probing in scan stage.

**Fallback chain (discover stage):**

Pinterest falls into the reference-source fallback chain as the first tier:

```
Pinterest (if available)
  → Refero (if available)
    → awesome-design-md (always available — static curated list in reference/)
```

When Pinterest is available, search it first. When Pinterest is `not_configured`, skip silently and proceed to Refero. The synthesizer uses whichever sources are available — there is no minimum required source count.

---

## Fallback Behavior

When Pinterest is `not_configured`:

- Skip the Pinterest search step in the synthesizer entirely
- Do NOT emit a warning or blocker to the user — Pinterest is an enhancement, not a requirement
- Proceed to Refero in the fallback chain
- The `<connection_sources>` section of DESIGN-CONTEXT.md should note: `pinterest: not_configured — skipped`

When Pinterest is `available` but `pinterest_search` returns an error or empty results:

- Log the error in DESIGN-CONTEXT.md `<connection_sources>` section
- Set `pinterest: unavailable` in STATE.md `<connections>`
- Proceed to Refero

---

## STATE.md Integration

Scan stage probes Pinterest at pipeline entry and writes the result to `<connections>`:

```xml
<connections>
figma: available
refero: not_configured
preview: available
storybook: not_configured
chromatic: not_configured
graphify: not_configured
pinterest: available
claude_design: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | ToolSearch returned non-empty results for `mcp-pinterest` |
| `not_configured` | ToolSearch returned empty — Pinterest MCP not registered in this session |
| `unavailable` | Tool is present but `pinterest_search` errored or returned empty on first call |

---

## Caveats and Pitfalls

1. **Headless scraping may be rate-limited.** `terryso/mcp-pinterest` uses headless browser scraping, not the official Pinterest API. Rate limits or IP blocks are possible if too many searches are made in quick succession. Limit to 2-3 searches per discover session. The pipeline naturally constrains this by searching once per design concern (color, typography, layout) rather than repeatedly.

2. **No authentication required — but content is public only.** Pinterest MCP accesses only public pins. Private boards and pins are not accessible. This is by design for the pipeline use case — design inspiration should be sourced from publicly shareable references.

3. **Tool prefix uncertainty — always use ToolSearch.** Never call `mcp__mcp-pinterest__pinterest_search` directly without first confirming via ToolSearch that the tool exists under that name. If the user registered the server as `pinterest` (no `mcp-` prefix), the tool would be `mcp__pinterest__pinterest_search`. The probe pattern above handles this automatically.

4. **Image URLs may be ephemeral.** Pinterest image URLs (CDN links) can expire or change. Do not cache image URLs in STATE.md or DESIGN-CONTEXT.md for more than one session. Reference search results by pin title and query context, not by image URL.

5. **Results are inspiration, not specifications.** Pinterest references are inputs to the synthesizer, which extracts design signals (dominant colors, typography patterns, spacing density). Do not treat a Pinterest search result as a binding design decision — it informs the D-XX discussion in the discover stage.
