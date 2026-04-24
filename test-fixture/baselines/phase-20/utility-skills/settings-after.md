---
name: gdd-settings
description: "Manage .design/config.json settings. Subcommands: profile, parallelism, cleanup, show."
argument-hint: "<profile <name>|parallelism <key> <value>|cleanup|show>"
tools: Read, Write, AskUserQuestion, Bash, mcp__gdd_state__get, mcp__gdd_state__frontmatter_update
---

# gdd-settings

Manages `.design/config.json` — the per-project config for model profile and parallelism. See `reference/config-schema.md` for the full schema. This skill also supports patching non-stage STATE.md frontmatter keys (`cycle`, `wave`, custom keys) via `mcp__gdd_state__frontmatter_update`. See **STATE.md frontmatter** below.

## Subcommands

### `show`

Print the current `.design/config.json` contents, nicely formatted. If the file is missing, print the defaults with a note that no config exists yet. Also call `mcp__gdd_state__get` to print the current STATE.md frontmatter keys (cycle, wave, model_profile) alongside config.json for a unified view.

### `profile <name>`

Set `model_profile` to one of `quality`, `balanced`, `budget`. Validate the value; reject anything else with the list of allowed values. Read current config, merge the change, write back. Confirm with the new value.

### `parallelism <key> <value>`

Set one field under `parallelism`. Supported keys and value types:

| Key | Type |
|---|---|
| `enabled` | bool (`true`/`false`) |
| `max_parallel_agents` | int |
| `min_tasks_to_parallelize` | int |
| `min_estimated_savings_seconds` | int |
| `require_disjoint_touches` | bool |
| `worktree_isolation` | bool |

Validate type; reject otherwise. Read current config, merge, write back. Confirm.

### `cleanup`

Use `AskUserQuestion` to pick one or more cleanup actions, then confirm each before executing:

1. Delete `.design/*.md` artifacts (excludes `config.json`, `STATE.md`, `backlog/`).
2. Reset `.design/STATE.md` to the template at `reference/STATE-TEMPLATE.md`.
3. Clear `.design/backlog/` directory contents.

## Config Read/Write Pattern

Always:

1. Read current `.design/config.json` (use defaults below if missing).
2. Merge the single field being changed — never overwrite unrelated fields.
3. Write back as pretty JSON (2-space indent, trailing newline).

## STATE.md frontmatter

For any STATE.md frontmatter patch (cycle, wave, or project-custom keys), call `mcp__gdd_state__frontmatter_update({ patch: { <key>: <value> } })`. Do not `Edit` or `Write` STATE.md directly.

**Stage-patch guard:** this skill cannot patch `stage`. If the user attempts to set `stage` here, reject with: "Use /gdd:brief, /gdd:explore, etc. for stage transitions. The settings skill is for non-stage frontmatter only." The MCP tool itself rejects `stage` patches with a VALIDATION error (surfaced by `mcp__gdd_state__frontmatter_update`), which this prose surfaces up-front so the user gets a clear message before the tool round-trip.

This surface is STATE.md-only. `.design/config.json` mutations continue to use `Read` + `Write` directly (out of scope for the 11-tool MCP catalog).

## Default Config

If `.design/config.json` does not exist, create it with:

```json
{
  "model_profile": "balanced",
  "parallelism": {
    "enabled": true,
    "max_parallel_agents": 5,
    "min_tasks_to_parallelize": 2,
    "min_estimated_savings_seconds": 30,
    "require_disjoint_touches": true,
    "worktree_isolation": false,
    "per_stage_override": {}
  }
}
```

## Output

End every invocation with:

```
## SETTINGS COMPLETE
```
