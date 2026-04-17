# Figma MCP — Connection Specification

This file is the connection specification for the official Figma Desktop MCP within the get-design-done pipeline. It provides the setup guide, tool inventory, per-stage usage, probe pattern, fallback behavior, and anti-patterns. See `connections/connections.md` for the full connection index and capability matrix.

---

## Setup

**Prerequisites:**

- Figma desktop app installed and running
- Dev Mode enabled in the Figma desktop app (File menu → Enable Dev Mode, or toggle in the toolbar)

**Install command (Claude Code):**

```
claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp
```

After running this command, restart the Claude Code session. The MCP server connects via HTTP to the Figma desktop app's local MCP endpoint.

**Verification:**

After session restart, run:

```
ToolSearch({ query: "figma-desktop", max_results: 10 })
```

Expect non-empty results listing `mcp__figma-desktop__*` tools. If results are empty, the desktop app is not running or Dev Mode is not enabled — fix both and restart.

**Warning — wrong MCP confusion:**

This spec targets the **official Figma Desktop MCP** (`mcp__figma-desktop__*` prefix, server name `figma-desktop`, HTTP transport).

Do NOT confuse with the southleft `figma-console-mcp` package (registered as `"figma-console"` in `~/.claude/mcp.json`, uses `figma_*` prefix). Both can be active simultaneously. The pipeline uses `mcp__figma-desktop__*` exclusively — it is stable, official, and requires no external package dependency beyond the Figma desktop app.

---

## Tools

All tools use the `mcp__figma-desktop__` prefix.

| Tool | Full name | Returns | Phase 4 use |
|------|-----------|---------|-------------|
| `get_variable_defs` | `mcp__figma-desktop__get_variable_defs` | Variable collection tree: collection ID, mode names, variable names (hierarchical, e.g. `colors/primary/500`), resolved values (hex for COLOR, float for FLOAT), descriptions, scopes | **In scope** — scan: token augmentation (CONN-03); discover: decisions pre-population (CONN-04) |
| `get_design_context` | `mcp__figma-desktop__get_design_context` | Structured React+Tailwind component tree of the current Figma selection | **In scope (secondary)** — discover: existing design decisions for established Figma systems |
| `get_screenshot` | `mcp__figma-desktop__get_screenshot` | Screenshot image of the selected Figma layer or frame | Out of scope Phase 4 |
| `get_metadata` | `mcp__figma-desktop__get_metadata` | Lightweight XML outline: layer IDs, names, types, position/size. Works with no selection open. | **In scope** — used as the availability probe (no file must be open) |
| `get_code_connect_map` | `mcp__figma-desktop__get_code_connect_map` | Maps Figma component instances to code implementations (file paths, framework labels) | Out of scope Phase 4 |
| `create_design_system_rules` | `mcp__figma-desktop__create_design_system_rules` | Generates rule files for design system alignment during code generation | Out of scope Phase 4 |

`get_metadata` is preferred for probing because it works without a file or selection open, keeping the probe lightweight. `get_variable_defs` is the primary workhorse for token extraction and decisions pre-population.

---

## Which Stages Use This Connection

| Stage | Skill/Agent | Tool used | Purpose |
|-------|------------|-----------|---------|
| scan | `skills/scan/SKILL.md` | `get_variable_defs` | Token augmentation — supplements grep-based CSS token extraction with Figma variable definitions (CONN-03) |
| discover | `agents/design-context-builder.md` | `get_variable_defs` | Decisions pre-population — pre-fills D-XX color/spacing/typography decisions from Figma variables before the interview (CONN-04) |
| plan | — | — | Not currently used |
| verify | — | — | Not currently used |

Both scan and discover call `get_variable_defs` with no explicit selection to retrieve all variables in the active Figma file. If no file is open, the call errors and the stage falls back to its non-Figma path.

---

## Availability Probe

**Call ToolSearch first — always.** In Claude Code sessions with many MCP servers, `mcp__figma-desktop__*` tools may be in the deferred tool set (not loaded into context at session start). Calling a deferred tool directly fails silently or errors. ToolSearch loads the tools into context and confirms their presence in a single call.

**Figma probe sequence:**

```
Step 1 — ToolSearch check:
  ToolSearch({ query: "select:mcp__figma-desktop__get_metadata", max_results: 1 })
  → Empty result      → figma: not_configured  (MCP not registered or app not running)
  → Non-empty result  → proceed to Step 2

Step 2 — Live tool call:
  call mcp__figma-desktop__get_metadata
  → Success           → figma: available
  → Error             → figma: unavailable
```

Write the result to `.design/STATE.md <connections>` immediately after probing.

---

## Fallback Behavior

When figma is `not_configured` or `unavailable`, stages degrade gracefully — no error is raised.

**scan stage:**

- Skip Step 2A (Figma Token Augmentation)
- Rely on grep-based CSS custom property extraction alone
- DESIGN.md token section uses `source: CSS custom properties` (not `source: figma-variables`)
- `figma_variables_used: false` in DESIGN.md frontmatter

**discover stage (design-context-builder):**

- Skip Step 0 (Figma Pre-population)
- Populate D-XX decisions via interview only (manual elicitation from the user)
- DESIGN-CONTEXT.md omits the "Token decisions pre-populated from Figma variables" note

Neither stage appends a `<blocker>` for a missing Figma connection — Figma is an enhancement, not a requirement. If a `must_have` explicitly requires Figma data, THEN append a blocker.

---

## STATE.md Integration

Every stage writes its probe result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | `get_metadata` returned a successful response |
| `unavailable` | Tool is in the session but errored (app offline, no file open, rate-limited) |
| `not_configured` | ToolSearch returned empty for `figma-desktop` — MCP not registered |

The `<connections>` schema is minimal by design. Traceability of which outputs came from Figma is handled via source annotations in DESIGN.md (`source: figma-variables`) and DESIGN-CONTEXT.md ("pre-populated from Figma variables"), not via richer STATE.md fields.

---

## Caveats and Pitfalls

- **`get_variable_defs` returns resolved values, not alias chains.** If a semantic token (`colors/semantic/brand`) aliases a primitive (`colors/blue/500`), only the resolved hex is returned. When recording variables in DESIGN.md, use the variable NAME alongside the hex: `colors/semantic/brand = #3B82F6`. Add a note: "resolved value — may alias a primitive; verify in Figma if the token layer matters."

- **`get_variable_defs` requires an open Figma file.** If no file is open in the desktop app, the call errors. The probe falls to `unavailable` in this case — the stage skips Figma steps and continues with non-Figma fallbacks.

- **Multi-mode variables (Light/Dark).** Variables may carry values for multiple modes. When present, extract both: `#3B82F6 (light) / #60A5FA (dark)`. DESIGN.md can note dark-mode token existence in the color section.

- **Deferred-tool loading.** Always call `ToolSearch` before any `mcp__figma-desktop__*` tool invocation. This applies at every stage entry, even if Figma was `available` in a previous run — tool availability can change between sessions.

- **Wrong-MCP confusion.** This spec covers `mcp__figma-desktop__*` (official Figma Desktop MCP). The southleft `figma-console-mcp` uses `figma_*` prefix and serves different use cases. Do not mix them. If ToolSearch returns results prefixed `figma_` but not `mcp__figma-desktop__`, the Figma Desktop MCP is still not configured.
