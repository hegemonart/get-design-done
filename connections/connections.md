# Connections — Index and Capability Matrix

This directory contains connection specifications for external tools and MCPs that the ultimate-design pipeline integrates with. Each connection has its own spec file. This file is the index.

---

## Active Connections

| Connection | Status | Spec File | Notes |
|-----------|--------|-----------|-------|
| Figma | Active | [`connections/figma.md`](connections/figma.md) | Uses `mcp__figma-desktop__*` tools (official Figma Desktop MCP) |
| Refero | Active | [`connections/refero.md`](connections/refero.md) | Uses `mcp__refero__*` tools (verify names via ToolSearch) |

---

## Capability Matrix

Each cell describes what the connection contributes at that pipeline stage, or `—` if it is not used.

| Connection | scan | discover | plan | design | verify |
|-----------|------|----------|------|--------|--------|
| Figma | token augmentation via `get_variable_defs` (CONN-03) | decisions pre-populate via `get_variable_defs` (CONN-04) | — | — | — |
| Refero | — | reference search via `mcp__refero__search`; fallback → awesome-design-md (CONN-05) | — | — | — |
| Storybook (future) | — | — | — | — | components |
| Linear (future) | — | — | — | — | tickets |
| GitHub (future) | — | — | commits | — | PRs |

**Column definitions:**

- **scan** — what the connection provides when the scan stage runs (design tokens, source metadata)
- **discover** — what the connection provides during discovery (visual references, design decisions)
- **plan** — what the connection contributes to planning artifacts
- **design** — what the connection provides during design execution
- **verify** — what the connection checks or surfaces during verification

---

## Connection Probe Pattern

This is the canonical probe pattern. All stages copy this prose inline — SKILL.md files have no include mechanism, so each stage repeats the relevant subset verbatim. The specification lives here; stages copy from it.

**Why ToolSearch first:** MCP tools may be in the deferred tool set (not loaded into context at session start when many servers are registered). Calling a deferred tool directly fails silently. ToolSearch loads the tools into context and confirms presence in a single call — always call it before any MCP tool invocation.

**Three-value status schema (fixed — do not extend):**

| Status | Meaning |
|--------|---------|
| `available` | MCP tool confirmed present and responsive |
| `unavailable` | MCP tool is in the session but errored (app offline, auth failure, rate-limited) |
| `not_configured` | ToolSearch returned empty — MCP not registered in this session |

**STATE.md format:**

```xml
<connections>
figma: available
refero: not_configured
</connections>
```

`<connections>` is the single source of truth across stages. Every stage reads it before deciding whether to invoke an MCP tool. Every stage writes to it after probing.

---

**Figma probe (execute at stage entry, after reading STATE.md):**

```
Step A1 — ToolSearch check:
  ToolSearch({ query: "select:mcp__figma-desktop__get_metadata", max_results: 1 })
  → Empty result      → figma: not_configured  (skip all Figma steps)
  → Non-empty result  → proceed to Step A2

Step A2 — Live tool call:
  call mcp__figma-desktop__get_metadata
  → Success           → figma: available
  → Error             → figma: unavailable  (skip all Figma steps)

Write figma status to STATE.md <connections>.
```

**Refero probe (execute at stage entry, after reading STATE.md):**

```
Step B1 — ToolSearch check:
  ToolSearch({ query: "refero", max_results: 5 })
  → Empty result      → refero: not_configured  (use fallback chain)
  → Non-empty result  → refero: available

Write refero status to STATE.md <connections>.
```

Note: Refero probe is ToolSearch-only (no live tool call). ToolSearch presence is sufficient; a live Refero search as probe would waste tokens before confirming the connection is even needed.

---

**Graceful degradation required:** stages MUST continue when a connection is `unavailable` or `not_configured`. Skip connection-dependent steps. If a missing connection prevents a `must_have` from being satisfied, append a `<blocker>` to `.design/STATE.md` and continue.

For full per-connection fallback details, see the spec files: [`connections/figma.md`](connections/figma.md) and [`connections/refero.md`](connections/refero.md).

---

## Extensibility Guide

To add a new connection to the pipeline:

1. **Create the spec file.** Write `connections/<connection-name>.md` following the structure of `connections/refero.md`: what the tool does, when to use it, available MCP tools, search/invocation strategy, fallbacks, anti-patterns.

2. **Register in this file.** Add a row to the Active Connections table above (status, spec file path, MCP tool prefix).

3. **Update the Capability Matrix.** Add a row for the new connection. Mark the stages it feeds with a short capability noun; use `—` for stages it does not affect.

4. **Declare the MCP.** If the connection uses an MCP server, ensure the server is declared in `.claude-plugin/plugin.json` or documented as a user-supplied MCP in the spec file.

5. **Wire into stage skills (Phase 2+ work).** Update the relevant stage `SKILL.md` files to probe the connection at entry and write its status to `.design/STATE.md <connections>`.

6. **Update relevant agents (Phase 2+ work).** If agents will use the connection's tools, list the MCP tools in the agent's `tools` frontmatter field.

---

## Notes

- `connections/` is infrastructure scaffolding introduced in Phase 1. Stage integration (wiring detection and graceful degradation into each stage) is Phase 2 work.
- Future connections (Storybook, Linear, GitHub) are placeholder rows in the matrix. Actual spec files and stage wiring are added when those phases land.
- The capability matrix columns map to the five pipeline stages: `scan | discover | plan | design | verify`.
