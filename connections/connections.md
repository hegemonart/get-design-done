# Connections — Index and Capability Matrix

This directory contains connection specifications for external tools and MCPs that the get-design-done pipeline integrates with. Each connection has its own spec file. This file is the index.

**Getting started:** run `/gdd:connections` for the interactive onboarding wizard — it probes all 12 connections, recommends setup based on your project type, and walks you through installing each one (auto-run for reversible MCP adds, copy-command for everything else). You can also run `/gdd:connections list` for a read-only status check or `/gdd:connections <name>` to jump to a single connection's setup.

---

## Active Connections

| Connection | Status | Spec File | Notes |
|-----------|--------|-----------|-------|
| gdd-state | Active | [`connections/gdd-state.md`](connections/gdd-state.md) | Local stdio MCP shipped with the plugin; required for STATE.md mutation in Phase 20+ (skills fall back to direct module import when not registered) |
| Figma | Active | [`connections/figma.md`](connections/figma.md) | Auto-detects any Figma MCP variant (remote reads+writes, desktop reads-only); prefix resolved at probe time |
| Refero | Active | [`connections/refero.md`](connections/refero.md) | Uses `mcp__refero__*` tools (verify names via ToolSearch) |
| Preview | Active | [`connections/preview.md`](connections/preview.md) | Uses `mcp__Claude_Preview__*` tools |
| Storybook | Active | [`connections/storybook.md`](connections/storybook.md) | HTTP probe: `localhost:6006/index.json` |
| Chromatic | Active | [`connections/chromatic.md`](connections/chromatic.md) | CLI: `npx chromatic`; env: `CHROMATIC_PROJECT_TOKEN` |
| Graphify | Active | [`connections/graphify.md`](connections/graphify.md) | CLI: `graphify`; `gsd-tools graphify *` |
| Pinterest | Active | [`connections/pinterest.md`](connections/pinterest.md) | `mcp__mcp-pinterest__*` tools (ToolSearch-only probe; headless scraping, no API key) |
| Claude Design | Active | [`connections/claude-design.md`](connections/claude-design.md) | No MCP — bundle file probe; enables `/gdd:handoff` pipeline + bidirectional write-back via figma-writer |
| paper.design | Active | [`connections/paper-design.md`](connections/paper-design.md) | Uses `mcp__paper-design__*` tools; free tier: 100 calls/week |
| pencil.dev | Active | [`connections/pencil-dev.md`](connections/pencil-dev.md) | File-based; `.pen` YAML specs; git-tracked; no MCP |
| 21st.dev Magic MCP | Active | [`connections/21st-dev.md`](connections/21st-dev.md) | Uses `mcp__21st*` tools; `TWENTY_FIRST_API_KEY` required |
| Magic Patterns | Active | [`connections/magic-patterns.md`](connections/magic-patterns.md) | Claude connector (`mcp__magic_patterns*`) + API key fallback |

---

## Capability Matrix

Each cell describes what the connection contributes at that pipeline stage, or `—` if it is not used.

| Connection | scan | discover | plan | design | verify | canvas | generator |
|-----------|------|----------|------|--------|--------|--------|-----------|
| gdd-state | STATE mutation (init position, probe_connections, add_decision) | STATE mutation (add_decision, add_must_have, transition gate) | STATE mutation (locked decisions, must_haves, transition gate) | STATE mutation (update_progress, resolve_blocker, transition gate) | STATE mutation (must_have pass/fail, add_blocker, set_status) | — | — |
| Figma | token augmentation via `get_variable_defs` (CONN-03) | decisions pre-populate via `get_variable_defs` (CONN-04) | — | write tokens/annotations/Code Connect via `use_figma` (FWR-01..04) | — | — | — |
| Refero | — | reference search via `mcp__refero__search`; fallback → awesome-design-md (CONN-05) | — | — | — | — | — |
| Preview | — | — | — | — | screenshots for `? VISUAL` checks (VIS-02) | — | — |
| Storybook | — | component inventory (STB-01) | change-risk via story count (STB-02) | `.stories.tsx` stub (STB-03) | a11y per story (STB-02) | — | — |
| Chromatic | — | — | change-risk scoping (CHR-02) | — | visual delta narration (CHR-01) | — | — |
| Graphify | — | — | dependency scoping (GRF-03) | — | orphan detection (GRF-04) | — | — |
| Pinterest | probe only | visual reference search via `pinterest_search`; fallback → Refero → awesome-design-md | — | — | — | — | — |
| Claude Design | bundle probe → `claude_design: available` | synthesizer handoff mode — parses bundle → D-XX decisions; discussant `--from-handoff` confirms | — (skipped in handoff) | — (skipped in handoff) | Handoff Faithfulness section; bidirectional write-back via figma-writer `implementation-status` mode | — | — |
| paper.design | — | canvas read: `get_selection`, `get_jsx`, `get_computed_styles` | — | paper-writer: annotate/tokenize/roundtrip | `get_screenshot` for `? VISUAL` | ✓ | — |
| pencil.dev | `.pen` discovery | `.pen` as canonical design source | — | pencil-writer: annotate/roundtrip | spec-vs-impl diff | ✓ | — |
| 21st.dev | — | prior-art gate: marketplace search before greenfield build | — | component-generator (21st impl) | — | — | ✓ |
| Magic Patterns | — | — | — | component-generator (magic-patterns impl) | preview_url → `? VISUAL` check | — | ✓ |

**Column definitions:**

- **scan** — what the connection provides when the scan stage runs (design tokens, source metadata)
- **discover** — what the connection provides during discovery (visual references, design decisions)
- **plan** — what the connection contributes to planning artifacts
- **design** — what the connection provides during design execution
- **verify** — what the connection checks or surfaces during verification
- **canvas** — whether the connection provides bidirectional canvas read+write (see `reference/ai-native-tool-interface.md`)
- **generator** — whether the connection provides AI component generation (see `reference/ai-native-tool-interface.md`)

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

The probe is variant-agnostic — it resolves any server whose prefix matches `/figma/i` (e.g., `figma`, `Figma`, `figma-desktop`, UUID-prefixed remote instances) and records the resolved prefix plus writes capability. Remote MCP exposes `use_figma` (writes-capable). Desktop MCP exposes reads only.

```
Step A1 — Keyword ToolSearch:
  ToolSearch({ query: "figma get_metadata use_figma", max_results: 10 })

  Parse tool names for:
    /^mcp__([^_]*figma[^_]*)__get_metadata$/i  → read-capable prefix set
    /^mcp__([^_]*figma[^_]*)__use_figma$/i     → write-capable prefix set

  Empty read set → figma: not_configured (skip all Figma steps)
  One+ matches  → proceed to Step A2

Step A2 — Tiebreaker selection:
  Preference order when multiple read prefixes match:
    (1) both-sets > reads-only
    (2) `figma` > others
    (3) non-`figma-desktop` > desktop
    (4) alphabetical

Step A3 — Live tool call on resolved prefix:
  call mcp__<prefix>__get_metadata
  → Success → figma: available (prefix=mcp__<prefix>__, writes=<true|false>)
  → Error   → figma: unavailable (skip all Figma steps)

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

For full per-connection fallback details, see the spec files: [`connections/figma.md`](connections/figma.md), [`connections/refero.md`](connections/refero.md), [`connections/preview.md`](connections/preview.md), [`connections/storybook.md`](connections/storybook.md), [`connections/chromatic.md`](connections/chromatic.md), and [`connections/graphify.md`](connections/graphify.md).

---

## Extensibility Guide

To add a new connection to the pipeline:

1. **Create the spec file.** Write `connections/<connection-name>.md` following the structure of `connections/refero.md`: what the tool does, when to use it, available MCP tools, search/invocation strategy, fallbacks, anti-patterns.

2. **Register in this file.** Add a row to the Active Connections table above (status, spec file path, MCP tool prefix).

3. **Update the Capability Matrix.** Add a row for the new connection. Mark the stages it feeds with a short capability noun; use `—` for stages it does not affect.

4. **Declare the MCP.** If the connection uses an MCP server, ensure the server is declared in `.claude-plugin/plugin.json` or documented as a user-supplied MCP in the spec file. For read+write remote MCPs, use `connections/figma.md` as the model. For read-only remote MCPs with headless / API-key-free setup, use `connections/pinterest.md`.

5. **Wire into stage skills (Phase 2+ work).** Update the relevant stage `SKILL.md` files to probe the connection at entry and write its status to `.design/STATE.md <connections>`.

6. **Update relevant agents (Phase 2+ work).** If agents will use the connection's tools, list the MCP tools in the agent's `tools` frontmatter field.

---

## Notes

- `connections/` is infrastructure scaffolding introduced in Phase 1. Stage integration (wiring detection and graceful degradation into each stage) is Phase 2 work.
- Phase 8 added five new active connections. Linear and GitHub remain planned for a future phase.
- Phase 14 added four AI-native design tool connections (paper.design, pencil.dev, 21st.dev, Magic Patterns) and the canvas/generator capability columns.
- Phase 20 added `gdd-state` — a local stdio MCP server shipped with the plugin that owns STATE.md mutation across every pipeline stage. Unlike external connections, `gdd-state` is required (fallback to direct module import preserves mutation safety but loses event telemetry). See [`connections/gdd-state.md`](connections/gdd-state.md).
- The capability matrix columns map to the five pipeline stages: `scan | discover | plan | design | verify`, plus `canvas` and `generator` sub-categories.

---

## Future AI-Native Tools (Backlog)

Candidate tools to integrate using the contract in `reference/ai-native-tool-interface.md`.

| Tool | Sub-category | Priority |
|------|-------------|----------|
| Subframe | canvas | high |
| v0.dev | generator | high |
| Galileo AI | generator | medium |
| Builder.io Visual Copilot | canvas + generator | medium |
| Locofy | generator | low |
| Anima | canvas | low |
| Plasmic | generator | medium |
| TeleportHQ | generator | low |

To add any of these: follow the steps in `reference/ai-native-tool-interface.md §Extending with Future Tools`.
