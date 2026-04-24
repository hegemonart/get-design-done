# Gemini CLI Tool Map

Last verified: 2026-04-24

When a GDD skill references a Claude Code tool name, the Gemini runtime
translates to the equivalent below. Skills do NOT need to branch — the tool
name in prose is authoritative; Gemini resolves via this map.

## Tool-name mapping

| CC name | Gemini name | Notes |
| --- | --- | --- |
| `Read` | `read_file` | Takes `absolute_path`. |
| `Write` | `write_file` | Takes `path`, `content`; overwrites. |
| `Edit` | `replace` | Takes `file_path`, `old_string`, `new_string`. Semantics match CC. |
| `Bash` | `run_shell_command` | Takes `{command: string, directory?}`. |
| `Grep` | `search_file_content` | Native grep wrapper. |
| `Glob` | `glob` | Native glob wrapper. |
| `Task` | Sub-invocation via nested gemini CLI | Same gap as Codex. |
| `WebSearch` | `google_web_search` | Built-in. |
| `WebFetch` | `web_fetch` | Built-in. |

## MCP server `gdd-state`

The gdd-state MCP server works unchanged on Gemini. Configure Gemini to load
it by adding to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "gdd-state": {
      "command": "node",
      "args": ["--experimental-strip-types", "<pkg-root>/scripts/mcp-servers/gdd-state/server.ts"]
    }
  }
}
```

All 11 tools exposed by the server appear as `mcp__gdd_state__*` in Gemini.

## Known gaps

- `Task` spawning: same as Codex — prefer `run_shell_command("npx gdd-sdk stage ...")`.
  See GEMINI.md for invocation details.
- Gemini's `replace` has stricter uniqueness requirements than CC's Edit;
  when `old_string` appears more than once, Gemini requires context lines.
  Skill prose that calls Edit should include surrounding context in
  `old_string` to satisfy both harnesses.

---

Last verified: 2026-04-24 — tool surface re-checked against Gemini CLI docs
current to this date. Revisit whenever Gemini ships a tool-vocabulary change.
