# Ultimate Design

Master design orchestration skill for Claude Code. One entry point that routes design work through **Discover → Define → Design → Deliver → Defend** across the full design toolkit — `impeccable`, `emil-design-eng`, `anthropic-skills`, `design`, and `ui-ux-pro-max`.

See [SKILL.md](./SKILL.md) for the full routing map and workflow.

## Install

### 1. Add the marketplace

```bash
claude plugin marketplace add hegemonart/ultimate-design
```

### 2. Install the plugin

```bash
claude plugin install ultimate-design@ultimate-design
```

This installs the orchestrator skill and triggers the bootstrap hook, which provisions the companion library `~/.claude/libs/awesome-design-md` on first run.

### 3. Install declared dependencies

Ultimate Design depends on two upstream plugins. Add their marketplaces if you don't already have them, then install:

```bash
# impeccable — design vocabulary + 18 design commands
claude plugin marketplace add pbakaus/impeccable
claude plugin install impeccable@impeccable

# ui-ux-pro-max — styles, palettes, typography, charts
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
claude plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

On Claude Code 2.1.110+ with cross-marketplace resolution enabled, the `dependencies` field in `plugin.json` will auto-install these when the marketplaces are known.

## Optional companions

### emil-design-eng

The `emil-design-eng` skill (Emil Kowalski's design engineering philosophy) has no canonical public plugin source. Ultimate Design references it as an optional routing target. If you have a copy, place it at `~/.claude/skills/emil-design-eng/` and the routing map picks it up automatically. If not, ultimate-design gracefully falls back to impeccable variants for animation and polish work.

### refero MCP

Ultimate Design's Phase 1 (Discover) uses the `refero` MCP server to pull concrete visual references. `refero` is **not included** in this plugin because it requires an API token that not every user has.

To enable `refero`, add it to your Claude Code config manually:

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

Without `refero`, the Discover phase falls back to `~/.claude/libs/awesome-design-md/` (provisioned automatically) and the Figma MCP if available.

## What the bootstrap hook does

On `SessionStart`, the plugin checks whether companion resources are present and clones what's missing:

| Resource | Location | Source |
| --- | --- | --- |
| awesome-design-md library | `~/.claude/libs/awesome-design-md/` | [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) |

The hook is idempotent: it compares a bundled manifest against a marker in `${CLAUDE_PLUGIN_DATA}` and skips work if nothing changed. It runs `git pull --ff-only` for subsequent sessions. Failures are logged to stderr and do not block Claude Code startup.

## Uninstall

```bash
claude plugin uninstall ultimate-design@ultimate-design
```

To also wipe the cached bootstrap state:

```bash
claude plugin uninstall ultimate-design@ultimate-design   # data dir is removed by default
```

The hook does **not** touch `~/.claude/libs/awesome-design-md/` or `~/.claude/skills/emil-design-eng/` on uninstall. Remove those manually if you want a clean slate.

## Develop locally

```bash
claude --plugin-dir ./ultimate-design
/reload-plugins   # after editing
```

Validate before pushing:

```bash
claude plugin validate .
```

## License

MIT. See [LICENSE](./LICENSE) (add if missing).
