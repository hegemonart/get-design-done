# Get Design Done

Agent-orchestrated design pipeline for Claude Code. One entry point that routes design work through a 5-stage workflow — **Scan → Discover → Plan → Design → Verify** — using 22 specialized agents, Figma + Refero + Pinterest MCP connections, and Claude Design handoff integration.

## Install

### 1. Add the marketplace

```bash
claude plugin marketplace add hegemonart/get-design-done
```

### 2. Install the plugin

```bash
claude plugin install get-design-done@get-design-done
```

This installs the pipeline skill and triggers the bootstrap hook, which provisions the companion library `~/.claude/libs/awesome-design-md` on first run.

## Usage

Run in any project directory:

```
@get-design-done scan          — Map existing design system → DESIGN.md + debt roadmap
@get-design-done discover      — Discovery interview + baseline audit → DESIGN-CONTEXT.md
@get-design-done plan          — Decompose into tasks → DESIGN-PLAN.md
@get-design-done design        — Execute tasks → DESIGN-SUMMARY.md
@get-design-done verify        — Score + audit → DESIGN-VERIFICATION.md
```

Invoke without arguments for pipeline status and auto-routing to the next stage.

### Standalone commands (work without running the pipeline first)

```
@get-design-done handoff <path>  — Skip pipeline; parse Claude Design bundle → verify → optional Figma write-back
@get-design-done style Button    — Generate component handoff doc → .design/DESIGN-STYLE-Button.md
@get-design-done darkmode        — Audit dark mode architecture + contrast → .design/DARKMODE-AUDIT.md
@get-design-done compare         — Delta between baseline and verification result → .design/COMPARE-REPORT.md
```

## Commands

All commands are invoked as `/gdd:<name>`.

**Pipeline stages**: `brief`, `explore`, `plan`, `design`, `verify`, `audit`

**Lifecycle**: `new-project`, `new-cycle`, `complete-cycle`

**Ergonomics**: `progress`, `health`, `todo`, `stats`, `next`, `help`

**Capture**: `note`, `plant-seed`, `add-backlog`, `review-backlog`

**Exploration**: `sketch`, `sketch-wrap-up`, `spike`, `spike-wrap-up`, `map`

**Execution**: `do`, `fast`, `quick`, `ship`, `undo`, `pr-branch`, `debug`

**Session**: `pause`, `resume`, `list-assumptions`, `discuss`

**Standalone**: `style`, `darkmode`, `compare`, `handoff`

**Settings**: `settings`, `update`, `reapply-patches`

See the root `SKILL.md` for one-line descriptions of each command.

## Pipeline overview

Each stage is orchestrated by a thin skill that spawns specialized agents:

| Stage | Agents spawned | Output |
|-------|----------------|--------|
| scan | — (direct analysis) | DESIGN.md, DESIGN-DEBT.md |
| discover | design-context-builder, design-context-checker | DESIGN-CONTEXT.md |
| plan | design-phase-researcher, design-planner, design-plan-checker | DESIGN-PLAN.md |
| design | design-executor (per task) | DESIGN-SUMMARY.md |
| verify | design-verifier, design-auditor, design-integration-checker, design-fixer | DESIGN-VERIFICATION.md |

All pipeline artifacts are written to `.design/` inside your project.

## Knowledge Layer (v1.0.4)

The knowledge layer gives the design pipeline persistent memory and O(1) lookups
across all design surface files.

### Intel Store (`.design/intel/`)

A queryable set of JSON slices that index the design surface:

| Slice | Contents |
|-------|----------|
| `files.json` | All tracked skill/agent/reference/script/hook files with mtime and git hash |
| `exports.json` | Named exports: skill commands and agent names |
| `symbols.json` | Markdown headings and section anchors |
| `tokens.json` | Design token references (color, spacing, typography, radius) |
| `components.json` | Component names and their referencing files |
| `patterns.json` | Design pattern classifications by concern |
| `dependencies.json` | @-reference and reads-from relationships |
| `decisions.json` | Architectural decisions from DESIGN-CONTEXT.md |
| `debt.json` | Design debt items from DESIGN-DEBT.md |
| `graph.json` | Cross-reference graph: nodes (files) + edges (dependencies) |

Build the intel store: `node scripts/build-intel.cjs --force`
Incremental updates: invoke the `gdd-intel-updater` agent after any file edits.

### New Commands

| Command | Purpose |
|---------|---------|
| `/gdd:analyze-dependencies` | Token fan-out, component call-graph, decision traceability, circular dep detection |
| `/gdd:skill-manifest` | Browse all registered skills and agents from the intel store |
| `/gdd:extract-learnings` | Extract project patterns from `.design/` artifacts → propose reference updates |

### New Agents

| Agent | Purpose |
|-------|---------|
| `gdd-intel-updater` | Incremental intel store rebuilder |
| `gdd-learnings-extractor` | Structured learning entry extractor |
| `gdd-graphify-sync` | Feeds Graphify knowledge graph from intel store |

### Context Exhaustion Hook

A `PostToolUse` hook (`hooks/context-exhaustion.js`) auto-records a `<paused>` resumption
block in `.design/STATE.md` when session context reaches 85%. Run `/gdd:resume` in the next
session to restore context.

### Architectural Responsibility Map

`design-phase-researcher` now produces two new sections in every `DESIGN-CONTEXT.md`:
- **Architectural Responsibility Map** — file/module → tier → responsibility table
- **Flow Diagram** — Mermaid flowchart of the main user workflow

## Connections (optional)

The pipeline integrates with seven external tools and MCPs. All connections are optional — the pipeline degrades gracefully when any connection is unavailable.

| Connection | Type | Purpose |
|-----------|------|---------|
| Figma Desktop | MCP (`mcp__figma-desktop__*`) | Token extraction, design context pre-population |
| Figma Writer | MCP (`mcp__figma__use_figma`) | Write decisions back to Figma (annotate, tokenize, Code Connect) |
| Refero | MCP (`mcp__refero__*`) | Reference design search during discovery |
| Preview (Playwright) | MCP (`mcp__Claude_Preview__*`) | Live page screenshots for visual verification |
| Storybook | HTTP (`localhost:6006`) | Component inventory, a11y per story, story stubs |
| Chromatic | CLI (`npx chromatic`) | Visual regression delta narration and change-risk scoping |
| Graphify | CLI (`graphify`) | Knowledge graph: component↔token↔decision relationships |

See [`connections/connections.md`](./connections/connections.md) for the full index, capability matrix, and probe patterns.

### Figma MCP

When the official Figma Desktop MCP is active, `scan` reads Figma variables and `discover` pre-populates design decisions from your Figma file. Falls back to code-only analysis when not available. See [`connections/figma.md`](./connections/figma.md) for setup.

### Refero MCP

When Refero is active, `discover` pulls visual references to ground design decisions. Requires an API token:

```json
{
  "mcpServers": {
    "refero": {
      "type": "http",
      "url": "https://mcp.refero.design/mcp",
      "headers": { "Authorization": "Bearer YOUR_REFERO_TOKEN" }
    }
  }
}
```

Falls back to `~/.claude/libs/awesome-design-md/` when unavailable. See [`connections/refero.md`](./connections/refero.md) for setup.

### Pinterest MCP

When the Pinterest MCP (`terryso/mcp-pinterest`) is active, `discover` pulls visual inspiration boards to ground design decisions alongside Refero references. ToolSearch-only probe — no API key required. Falls back to Refero → awesome-design-md when unavailable. See [`connections/pinterest.md`](./connections/pinterest.md) for setup.

### Claude Design handoff

Drop a Claude Design bundle (HTML export from claude.ai/design) into your project root and run `/gdd:handoff <path>`. The pipeline skips Scan → Discover → Plan, parses the bundle CSS custom properties into D-XX design decisions, runs `verify --post-handoff` for Handoff Faithfulness scoring, and optionally writes implementation status back to Figma. See [`connections/claude-design.md`](./connections/claude-design.md) for the full bundle format and adapter pattern.

## Bootstrap hook

On `SessionStart`, the plugin provisions the companion library if missing:

| Resource | Location | Source |
|----------|----------|--------|
| awesome-design-md | `~/.claude/libs/awesome-design-md/` | [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) |

Idempotent — skips work if already present, runs `git pull --ff-only` on subsequent sessions.

## Distribution

**Ships with the plugin:**
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — manifest
- `SKILL.md` — root pipeline router
- `skills/` — stage skills (scan, discover, plan, design, verify, style, darkmode, compare)
- `agents/` — 22 specialized agent specs
- `connections/` — Figma, Refero, Pinterest, Claude Design connection specs
- `reference/` — curated design reference material
- `hooks/`, `scripts/bootstrap.sh`

**Dev-only (gitignored, not distributed):**
- `.planning/` — GSD planning artifacts
- `.claude/memory/` — session-level memory
- `.claude/settings.local.json`

## Develop locally

```bash
claude --plugin-dir ./get-design-done
/reload-plugins
claude plugin validate .
```

## Uninstall

```bash
claude plugin uninstall get-design-done@get-design-done
```

## License

MIT.
