# Connections — Index and Capability Matrix

This directory contains connection specifications for external tools and MCPs that the get-design-done pipeline integrates with. Each connection has its own spec file. This file is the index.

**Getting started:** run `/gdd:connections` for the interactive onboarding wizard — it probes all 18 connections, recommends setup based on your project type, and walks you through installing each one (auto-run for reversible MCP adds, copy-command for everything else). You can also run `/gdd:connections list` for a read-only status check or `/gdd:connections <name>` to jump to a single connection's setup.

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
| OpenRouter | Active | [`connections/openrouter.md`](connections/openrouter.md) | Model-router (no MCP); env: `OPENROUTER_API_KEY` (optional `OPENROUTER_BASE_URL`); opt-in tier-resolution overlay, graceful-degrade-to-native |
| Xcode Simulator | Active | [`connections/xcode-simulator.md`](connections/xcode-simulator.md) | **Optional** (macOS-only); CLI: `simctl` (no MCP); native-iOS rendered evidence for verify; degrade-to-code-only when absent (D-03) |
| Android Emulator | Active | [`connections/android-emulator.md`](connections/android-emulator.md) | **Optional**; CLI: `adb` / `emulator` (no MCP); native-Android rendered evidence for verify; degrade-to-code-only when absent (D-03) |
| Litmus | Active | [`connections/litmus.md`](connections/litmus.md) | **Optional** render-test (email; Email-on-Acid alternative); cross-client rendered screenshots for verify; degrade-to-static-validator / code-only when absent (D-03) |
| Print-Renderer | Active | [`connections/print-renderer.md`](connections/print-renderer.md) | **Optional** print render-test (Paged.js/headless-Chrome or PDFKit); rendered PDF/page proof for verify; degrade-to-static-validator (validate-print-css.cjs) / code-only when absent (D-03) |
| Lazyweb | Active | [`connections/lazyweb.md`](connections/lazyweb.md) | **Free** bearer-token MCP `lazyweb_search` / `lazyweb_health` (ToolSearch-only probe; copy-command setup, no auto-run); discover **Tier 1** — tried first (D-01) |
| Mobbin | Active | [`connections/mobbin.md`](connections/mobbin.md) | **Paid** HTTP MCP `claude mcp add mobbin --transport http https://api.mobbin.com/mcp` (ToolSearch-only probe; auto-run-safe, OAuth); discover **Tier 2** — mobile/flow-level (D-01) |
| Slack | Active | [`connections/slack.md`](connections/slack.md) | **Notify** (Team Surfaces) — `SLACK_WEBHOOK_URL` incoming webhook; routed+redacted pipeline events; `GDD_DISABLE_SLACK` kill-switch; degrade-to-noop |
| Discord | Active | [`connections/discord.md`](connections/discord.md) | **Notify** (Team Surfaces) — `DISCORD_WEBHOOK_URL` channel webhook; parity with Slack; `GDD_DISABLE_DISCORD` kill-switch; degrade-to-noop |
| Linear | Active | [`connections/linear.md`](connections/linear.md) | **Ticket-sync** (Team Surfaces) — `mcp__linear__*` (ToolSearch probe); bidirectional cycle↔issue; redact + `GDD_DISABLE_LINEAR` kill-switch; degrade-to-noop |
| Jira | Active | [`connections/jira.md`](connections/jira.md) | **Ticket-sync** (Team Surfaces) — Atlassian MCP `mcp__atlassian__*` (ToolSearch probe); parity with Linear; `GDD_DISABLE_JIRA` kill-switch; degrade-to-noop |

---

## Capability Matrix

Each cell describes what the connection contributes at that pipeline stage, or `—` if it is not used.

| Connection | scan | discover | plan | design | verify | canvas | generator | notify | ticket-sync |
|-----------|------|----------|------|--------|--------|--------|-----------|--------|------------|
| gdd-state | STATE mutation (init position, probe_connections, add_decision) | STATE mutation (add_decision, add_must_have, transition gate) | STATE mutation (locked decisions, must_haves, transition gate) | STATE mutation (update_progress, resolve_blocker, transition gate) | STATE mutation (must_have pass/fail, add_blocker, set_status) | — | — | — | — |
| Figma | token augmentation via `get_variable_defs` (CONN-03) | decisions pre-populate via `get_variable_defs` (CONN-04) | — | write tokens/annotations/Code Connect via `use_figma` (FWR-01..04) | — | — | — | — | — |
| Refero | — | reference search via `mcp__refero__search`; fallback → awesome-design-md (CONN-05) | — | — | — | — | — | — | — |
| Preview | — | — | — | — | screenshots for `? VISUAL` checks (VIS-02) | — | — | — | — |
| Storybook | — | component inventory (STB-01) | change-risk via story count (STB-02) | `.stories.tsx` stub (STB-03) | a11y per story (STB-02) | — | — | — | — |
| Chromatic | — | — | change-risk scoping (CHR-02) | — | visual delta narration (CHR-01) | — | — | — | — |
| Graphify | — | — | dependency scoping (GRF-03) | — | orphan detection (GRF-04) | — | — | — | — |
| Pinterest | probe only | visual reference search via `pinterest_search`; fallback → Refero → awesome-design-md | — | — | — | — | — | — | — |
| Claude Design | bundle probe → `claude_design: available` | synthesizer handoff mode — parses bundle → D-XX decisions; discussant `--from-handoff` confirms | — (skipped in handoff) | — (skipped in handoff) | Handoff Faithfulness section; bidirectional write-back via figma-writer `implementation-status` mode | — | — | — | — |
| paper.design | — | canvas read: `get_selection`, `get_jsx`, `get_computed_styles` | — | paper-writer: annotate/tokenize/roundtrip | `get_screenshot` for `? VISUAL` | ✓ | — | — | — |
| pencil.dev | `.pen` discovery | `.pen` as canonical design source | — | pencil-writer: annotate/roundtrip | spec-vs-impl diff | ✓ | — | — | — |
| 21st.dev | — | prior-art gate: marketplace search before greenfield build | — | component-generator (21st impl) | — | — | ✓ | — | — |
| Magic Patterns | — | — | — | component-generator (magic-patterns impl) | preview_url → `? VISUAL` check | — | ✓ | — | — |
| OpenRouter | — | — | — | — | — | — | ✓ (model-router: tier→model resolution, all stages) | — | — |
| Xcode Simulator | — | — | — | native iOS code-gen target (swift-executor / emitSwift) | rendered SwiftUI snapshot when simulator available, else degrade to code-only structural audit (D-03) | — | — | — | — |
| Android Emulator | — | — | — | native Android code-gen target (compose-executor / emitCompose) | rendered Compose screenshot when emulator available, else degrade to code-only structural audit (D-03) | — | — | — | — |
| Litmus | — | — | — | email render-test target (email-executor) | cross-client rendered evidence when Litmus available, else degrade to the static email-HTML validator / code-only (D-03) | — | — | — | — |
| Print-Renderer | — | — | — | print render-test target (pdf-executor) | rendered PDF/page evidence when the print-render is available, else degrade to the static print-CSS validator / code-only (D-03) | — | — | — | — |
| Lazyweb | — | reference search via `lazyweb_search` (**Tier 1 — free, tried first**; D-01); complements refero/pinterest | — | — | — | — | — | — | — |
| Mobbin | — | reference search via mobbin tools (**Tier 2 — paid, mobile/flow-level**; D-01); complements refero/lazyweb | — | — | — | — | — | — | — |
| Slack | — | — | — | — | — | — | — | verify-fail/audit-pass/ship → Slack webhook (routed, redacted, degrade-to-noop; D-04/D-05) | — |
| Discord | — | — | — | — | — | — | — | parity with Slack — events → Discord webhook (routed, redacted, degrade-to-noop) | — |
| Linear | — | — | — | — | — | — | — | — | bidirectional cycle↔issue: read comments (decision-injector) + transition + redacted summary on completion (D-03) |
| Jira | — | — | — | — | — | — | — | — | parity with Linear — Atlassian MCP; transition + redacted summary on completion |

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

**Lazyweb probe (execute at stage entry, after reading STATE.md):**

```
Step D1 — ToolSearch check:
  ToolSearch({ query: "lazyweb", max_results: 5 })
  → Empty result      → lazyweb: not_configured  (use fallback chain)
  → Non-empty result  → lazyweb: available

Write lazyweb status to STATE.md <connections>.
```

**Mobbin probe (execute at stage entry, after reading STATE.md):**

```
Step E1 — ToolSearch check:
  ToolSearch({ query: "mobbin", max_results: 5 })
  → Empty result      → mobbin: not_configured  (use fallback chain)
  → Non-empty result  → mobbin: available

Write mobbin status to STATE.md <connections>.
```

**Linear probe (ToolSearch-only — ticket-sync):**

```
Step H1 — ToolSearch({ query: "linear", max_results: 5 })
  → Empty / GDD_DISABLE_LINEAR=1 → linear: not_configured
  → Non-empty                    → linear: available
```

**Jira probe (ToolSearch-only — ticket-sync, Atlassian MCP):**

```
Step I1 — ToolSearch({ query: "atlassian jira", max_results: 5 })
  → Empty / GDD_DISABLE_JIRA=1   → jira: not_configured
  → Non-empty                    → jira: available
```

**Slack probe (env-based, no MCP):**

```
Step F1 — Bash: test -n "$SLACK_WEBHOOK_URL"
  → empty / GDD_DISABLE_SLACK=1    → slack: not_configured
  → non-empty                      → slack: available
```

**Discord probe (env-based, no MCP):**

```
Step G1 — Bash: test -n "$DISCORD_WEBHOOK_URL"
  → empty / GDD_DISABLE_DISCORD=1  → discord: not_configured
  → non-empty                      → discord: available
```

Note: Lazyweb + Mobbin probes are ToolSearch-only (no live call). The discover stage resolves reference sources **cost-aware (D-01): Lazyweb (free) → Mobbin / Refero (paid, whichever is bound + subscribed) → Pinterest → awesome-design-md → WebFetch.**

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
Step G1 — Config check (per D-09 direct read, no CLI subcommand):
  Bash: node -e "try{const c=JSON.parse(require('fs').readFileSync('.design/config.json','utf8'));process.stdout.write(String(c.graphify?.enabled===true))}catch{process.stdout.write('false')}"
  → false → graphify: not_configured
  → true  → proceed to Step G2

Step G2 — Graph file check (native CLI):
  Bash: node bin/gdd-graph status --format json
  → { configured: true, exists: true }  → graphify: available
  → { configured: true, exists: false } → graphify: unavailable  (graph not built yet)
  → { configured: false, exists: ... }  → graphify: not_configured  (mirrors G1)

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
