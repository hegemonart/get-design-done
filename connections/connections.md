# Connections — Index and Capability Matrix

This directory contains connection specifications for external tools and MCPs that the get-design-done pipeline integrates with. Each connection has its own spec file. This file is the index.

---

## Active Connections

| Connection | Status | Spec File | Notes |
|-----------|--------|-----------|-------|
| Figma | Active | [`connections/figma.md`](connections/figma.md) | Uses `mcp__figma-desktop__*` tools (official Figma Desktop MCP) |
| Refero | Active | [`connections/refero.md`](connections/refero.md) | Uses `mcp__refero__*` tools (verify names via ToolSearch) |
| Preview | Active | [`connections/preview.md`](connections/preview.md) | Uses `mcp__Claude_Preview__*` tools |
| Storybook | Active | [`connections/storybook.md`](connections/storybook.md) | HTTP probe: `localhost:6006/index.json` |
| Chromatic | Active | [`connections/chromatic.md`](connections/chromatic.md) | CLI: `npx chromatic`; env: `CHROMATIC_PROJECT_TOKEN` |
| Figma Writer | Active | [`connections/figma-writer.md`](connections/figma-writer.md) | Uses `mcp__figma__use_figma` (remote MCP) |
| Graphify | Active | [`connections/graphify.md`](connections/graphify.md) | CLI: `graphify`; `gsd-tools graphify *` |
| Pinterest | Active | [`connections/pinterest.md`](connections/pinterest.md) | `mcp__mcp-pinterest__*` tools (ToolSearch-only probe; headless scraping, no API key) |
| Claude Design | Active | [`connections/claude-design.md`](connections/claude-design.md) | No MCP — bundle file probe; enables `/gdd:handoff` pipeline + bidirectional write-back via figma-writer |

---

## Capability Matrix

Each cell describes what the connection contributes at that pipeline stage, or `—` if it is not used.

| Connection | scan | discover | plan | design | verify |
|-----------|------|----------|------|--------|--------|
| Figma | token augmentation via `get_variable_defs` (CONN-03) | decisions pre-populate via `get_variable_defs` (CONN-04) | — | — | — |
| Refero | — | reference search via `mcp__refero__search`; fallback → awesome-design-md (CONN-05) | — | — | — |
| Preview | — | — | — | — | screenshots for `? VISUAL` checks (VIS-02) |
| Storybook | — | component inventory (STB-01) | change-risk via story count (STB-02) | `.stories.tsx` stub (STB-03) | a11y per story (STB-02) |
| Chromatic | — | — | change-risk scoping (CHR-02) | — | visual delta narration (CHR-01) |
| Figma Writer | — | — | — | write tokens/annotations/Code Connect (FWR-01..04) | — |
| Graphify | — | — | dependency scoping (GRF-03) | — | orphan detection (GRF-04) |
| Pinterest | probe only | visual reference search via `pinterest_search`; fallback → Refero → awesome-design-md | — | — | — |
| Claude Design | bundle probe → `claude_design: available` | synthesizer handoff mode — parses bundle → D-XX decisions; discussant `--from-handoff` confirms | — (skipped in handoff) | — (skipped in handoff) | Handoff Faithfulness section; bidirectional write-back via figma-writer `implementation-status` mode |

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

**Preview probe (execute at stage entry, after reading STATE.md):**

```
Step P1 — ToolSearch check:
  ToolSearch({ query: "Claude_Preview", max_results: 5 })
  → Empty result      → preview: not_configured
  → Non-empty result  → proceed to Step P2

Step P2 — Live tool call:
  call mcp__Claude_Preview__preview_list
  → Success (list returned, may be empty)  → preview: available
  → Error                                   → preview: unavailable

Write preview status to STATE.md <connections>.
```

**Storybook probe (execute at stage entry, after reading STATE.md):**

```
Step S1 — HTTP check (Storybook 8):
  Bash: curl -sf http://localhost:6006/index.json 2>/dev/null
  → Success (JSON)    → storybook: available
  → Failure           → proceed to Step S2

Step S2 — HTTP fallback (Storybook 7):
  Bash: curl -sf http://localhost:6006/stories.json 2>/dev/null
  → Success (JSON)    → storybook: available
  → Failure           → storybook: not_configured

Write storybook status to STATE.md <connections>.
```

Note: Storybook 8 index.json does NOT include parameters. Use id, title, name, type, kind, tags fields only.

**Chromatic probe (execute at stage entry, after reading STATE.md):**

```
Step C1 — CLI check:
  Bash: command -v chromatic || npx --yes chromatic --version 2>/dev/null
  → Exits non-zero    → chromatic: not_configured  (skip all Chromatic steps)
  → Exits 0           → proceed to Step C2

Step C2 — Token check:
  Check env var: CHROMATIC_PROJECT_TOKEN
  → Absent or empty   → chromatic: unavailable  (CLI present but not configured)
  → Present           → chromatic: available

Write chromatic status to STATE.md <connections>.
```

Note: First Chromatic run has no baseline — all stories become new snapshots. This is expected; it establishes the baseline.

**Figma Writer probe (execute before any write operation):**

```
Step R1 — ToolSearch check:
  ToolSearch({ query: "mcp__figma__use_figma", max_results: 1 })
  → Empty result      → figma_writer: not_configured
  → Non-empty result  → figma_writer: available

Write figma_writer status to STATE.md <connections>.
```

Note: figma_writer is a separate connection key from figma (desktop). Both can be active simultaneously. There is no `unavailable` state for figma_writer — the ToolSearch-only probe cannot detect auth failures; those surface at execution time.

**Graphify probe (execute at agent entry, before using graph):**

```
Step G1 — Config check:
  node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" graphify status
  → Error or { enabled: false }  → graphify: not_configured
  → { enabled: true }            → proceed to Step G2

Step G2 — Graph file check:
  Check if graphify-out/graph.json exists in project root
  → Absent    → graphify: unavailable  (graph not built yet)
  → Present   → graphify: available

Write graphify status to STATE.md <connections>.
```

---

**Graceful degradation required:** stages MUST continue when a connection is `unavailable` or `not_configured`. Skip connection-dependent steps. If a missing connection prevents a `must_have` from being satisfied, append a `<blocker>` to `.design/STATE.md` and continue.

For full per-connection fallback details, see the spec files: [`connections/figma.md`](connections/figma.md), [`connections/refero.md`](connections/refero.md), [`connections/preview.md`](connections/preview.md), [`connections/storybook.md`](connections/storybook.md), [`connections/chromatic.md`](connections/chromatic.md), [`connections/figma-writer.md`](connections/figma-writer.md), and [`connections/graphify.md`](connections/graphify.md).

---

## Extensibility Guide

To add a new connection to the pipeline:

1. **Create the spec file.** Write `connections/<connection-name>.md` following the structure of `connections/refero.md`: what the tool does, when to use it, available MCP tools, search/invocation strategy, fallbacks, anti-patterns.

2. **Register in this file.** Add a row to the Active Connections table above (status, spec file path, MCP tool prefix).

3. **Update the Capability Matrix.** Add a row for the new connection. Mark the stages it feeds with a short capability noun; use `—` for stages it does not affect.

4. **Declare the MCP.** If the connection uses an MCP server, ensure the server is declared in `.claude-plugin/plugin.json` or documented as a user-supplied MCP in the spec file. For read-only MCP connections, use `connections/figma.md` as the model. For remote MCP write connections, use `connections/figma-writer.md` as the model.

5. **Wire into stage skills (Phase 2+ work).** Update the relevant stage `SKILL.md` files to probe the connection at entry and write its status to `.design/STATE.md <connections>`.

6. **Update relevant agents (Phase 2+ work).** If agents will use the connection's tools, list the MCP tools in the agent's `tools` frontmatter field.

---

## Notes

- `connections/` is infrastructure scaffolding introduced in Phase 1. Stage integration (wiring detection and graceful degradation into each stage) is Phase 2 work.
- Phase 8 added five new active connections. Linear and GitHub remain planned for a future phase.
- The capability matrix columns map to the five pipeline stages: `scan | discover | plan | design | verify`.
