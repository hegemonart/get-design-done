# Get Design Done

Agent-orchestrated design pipeline for Claude Code. One entry point that routes design work through a 5-stage workflow — **Scan → Discover → Plan → Design → Verify** — using 14 specialized agents, Figma + Refero MCP connections, and 3 standalone audit commands.

## Install

### 1. Add the marketplace

```bash
claude plugin marketplace add hegemonart/ultimate-design
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
@get-design-done style Button  — Generate component handoff doc → .design/DESIGN-STYLE-Button.md
@get-design-done darkmode      — Audit dark mode architecture + contrast → .design/DARKMODE-AUDIT.md
@get-design-done compare       — Delta between baseline and verification result → .design/COMPARE-REPORT.md
```

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

## Connections (optional)

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
- `agents/` — 14 specialized agent specs
- `connections/` — Figma + Refero connection specs
- `reference/` — curated design reference material
- `hooks/`, `scripts/bootstrap.sh`

**Dev-only (gitignored, not distributed):**
- `.planning/` — GSD planning artifacts
- `.claude/memory/` — session-level memory
- `.claude/settings.local.json`

## Develop locally

```bash
claude --plugin-dir ./ultimate-design
/reload-plugins
claude plugin validate .
```

## Uninstall

```bash
claude plugin uninstall get-design-done@get-design-done
```

## License

MIT.
