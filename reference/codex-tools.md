# Codex CLI Tool Map

Last verified: 2026-04-24

When a GDD skill references a Claude Code tool name, the Codex runtime
translates to the equivalent below. Skills do NOT need to branch — the tool
name in prose is authoritative; Codex resolves via this map.

## Tool-name mapping

| CC name | Codex name | Notes |
| --- | --- | --- |
| `Read` | `read_file` | Takes `path`; returns file content. |
| `Write` | `apply_patch` (create mode) | Requires a diff-style patch; ensure tool call emits `{action:'create', path, content}`. |
| `Edit` | `apply_patch` (update mode) | Emits `{action:'update', path, patch}` with unified diff. |
| `Bash` | `shell` | Takes `{command: string, cwd?, timeout_sec?}`. |
| `Grep` | `shell` | Compose a `rg` / `grep -rn` invocation; no native Codex grep tool. |
| `Glob` | `shell` | Compose `ls` / `find`; no native Codex glob. |
| `Task` | Sub-invocation via nested Codex | Codex spawns nested sessions via its own CLI, not a tool call. Skills requiring Task should prefer the MCP `gdd-state` tool layer instead. |
| `WebSearch` | `web_search` | If enabled in Codex policy. |
| `WebFetch` | `shell` (curl) or `web_search.open` | Prefer curl for deterministic output. |

## MCP server `gdd-state`

The gdd-state MCP server works unchanged on Codex. Configure Codex to load
it by adding to `~/.codex/config.toml`:

```toml
[[mcp_servers]]
name = "gdd-state"
command = "node"
args = ["--experimental-strip-types", "<pkg-root>/scripts/mcp-servers/gdd-state/server.ts"]
```

All 11 tools exposed by the server appear as `mcp__gdd_state__*` in Codex.

## Known gaps

- `Task` spawning: Codex does not expose nested-session as a tool call. For
  now, skills that rely on `Task` (parallel mappers in Plan 21-06, parallel
  discussants in Plan 21-07) should invoke the gdd-sdk CLI as a shell
  subprocess: `shell("npx gdd-sdk stage explore --parallel")`. This is
  documented in AGENTS.md.
- `apply_patch` diff format differs from CC's Edit: Codex expects unified
  diff (`---`/`+++`/`@@` hunks), while CC's Edit takes `old_string`/`new_string`.
  The plugin's skill prose uses Edit's semantics; on Codex the runtime must
  generate the unified diff from the old/new pair. A helper lives at
  `scripts/lib/harness/edit-to-patch.ts` (reserved for Phase 22 wiring).

---

Last verified: 2026-04-24 — tool surface re-checked against Codex CLI docs
current to this date. Revisit whenever Codex ships a tool-vocabulary change.
