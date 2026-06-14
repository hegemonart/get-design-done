# Notion — Connection Specification

This file is the connection specification for Notion within the hone pipeline. See `connections/connections.md` for the index + capability matrix (the notion row is added at the 35.5 closeout).

---

Notion is the **export write-path** for `/hone:export --format notion` (Phase 35.5). GDD generates a Notion page from a completed cycle's design artifacts — a stakeholder-shareable design-review packet. MCP-based (`mcp__notion__*`) — GDD calls MCP tools, not raw HTTP; no bundled Notion SDK, no new outbound egress. Outbound content is redacted; degrades to the self-contained HTML format when Notion is absent or disabled.

---

## Setup

**Prerequisites:** the Notion MCP server connected to your workspace (OAuth on first use). No GDD-held token.

```
# register the Notion MCP per Notion's MCP docs, then restart the session
```

**Verification:**

```
ToolSearch({ query: "notion", max_results: 10 })
```

Expect Notion page/block tools (`mcp__notion__*`). If empty → `notion: not_configured`. Verify exact tool names via ToolSearch; do not hardcode.

---

## What GDD does

On `/hone:export --format notion`, GDD creates a page from the export source set (EXPERIENCE.md + DESIGN.md + DESIGN-VERIFICATION.md + decisions + screenshots): headings → toggle/section blocks, screenshots → image-upload blocks. Every text block is **redacted** (`scripts/lib/redact.cjs`); `--pseudonymize` additionally masks identity. Write-only (export); GDD does not read/sync Notion content.

## Redaction + kill-switch + degrade

- Every block body passes through `scripts/lib/redact.cjs` (the single chokepoint).
- Kill-switch: `GDD_DISABLE_NOTION=1` (env) or `.design/config.json` `"export": { "notion": { "enabled": false } }`. `gsd-health` surfaces it.
- **Degrade:** `notion: not_configured` / disabled / an MCP error → `/hone:export` falls back to the self-contained `html` format + a note (the export never fails on Notion absence — D-03/D-07).

## STATE.md integration + probe

```xml
<connections>
notion: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | ToolSearch returned `mcp__notion__*` tools AND not disabled |
| `unavailable` | tools present but a call errored (auth/rate) |
| `not_configured` | ToolSearch empty — Notion MCP not registered |

**Probe (ToolSearch-only):** `ToolSearch({ query: "notion", max_results: 5 })` → empty → `not_configured`, non-empty → `available`. Which stages probe: the export skill only (Notion is an export target, not a pipeline-stage connection).

## Anti-pattern

Don't post un-redacted artifacts; don't treat Notion as a read/sync source (export write-path only — bidirectional sync is out of scope); don't hard-require Notion (always degrade to the HTML file). Confluence is explicitly out of scope this phase (Notion-only).
