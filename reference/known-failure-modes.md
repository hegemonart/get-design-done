# Known Failure Modes (Phase 30 Triage Gate)

This file is the **catalogue of locally-fixable failure modes** that the
Phase 30 issue-reporter consults *before* prompting the user to file a
GitHub issue. The triage gate runs first (D-07): when an entry matches
the user's error, the gate surfaces `this looks like X — try Y` and
exits the report flow without prompting. `--force-report` bypasses the
gate but still requires consent (D-11).

## Schema

Each entry is a single fenced ```yaml block with this flat key:value shape:

- `id` — stable identifier (kebab-case or `KFM-NNN` numeric). Required.
- `pattern` — JavaScript regex string. Matched against
  `[error.message, error.stack].filter(Boolean).join("\n")`. Required.
- `diagnosis` — one-sentence plain-English root cause. Required.
- `remedy` — one-sentence user-runnable action. Required.
- `severity` — advisory only, one of `low` / `medium` / `high`. Required.
- `propose_report` — boolean. If `true`, this mode is on the D-11
  whitelist: 30-04 may *propose* `--report` at error time for this
  class. Defaults to `false`. Advisory; the matcher does not act on it.

## Matching policy

- **First match wins.** Entries are evaluated in file order. The matcher
  returns the first entry whose regex tests true against the haystack.
  No severity ranking, no aggregation, no blending.
- **Invalid regex is non-fatal.** An entry whose `pattern` fails to
  compile is skipped with a `console.warn`, never crashes the matcher.
- **Missing catalogue is non-fatal.** If this file is absent or
  unparseable, `matchKnownFailure` returns `{ matched: false }` and
  warns once.

Consumed by `scripts/lib/issue-reporter/triage-matcher.cjs`
(`matchKnownFailure(errorContext)`). Wired into `skills/report-issue`
(Plan 30-04) before the consent prompt.

## Entries

### KFM-001 — EACCES on `.design/` write

Permission failure when the plugin writes into `.design/`. Common after
`sudo`-cloning a repo or running CI as a user without write access to
the project root.

```yaml
id: KFM-001
pattern: 'EACCES.*\.design'
diagnosis: 'Permission denied writing to .design/ — the plugin cannot persist its work-product directory.'
remedy: 'Run `chown -R "$USER" .design` (or recreate the directory as your normal user) and retry the command.'
severity: medium
propose_report: false
```

### KFM-002 — `gh` CLI not on PATH

The Phase 30 outbound submission path requires the user's `gh` CLI
(D-05). If it's missing, Plan 30-06 falls back to clipboard + URL.
This entry catches the typical shell-spawn error.

```yaml
id: KFM-002
pattern: '(gh: command not found|spawn gh ENOENT|''gh'' is not recognized)'
diagnosis: 'GitHub CLI (`gh`) is not installed or not on PATH; the issue reporter''s outbound path relies on it.'
remedy: 'Install gh from https://cli.github.com and run `gh auth login`, then retry. (Or use the clipboard fallback: the payload is already on disk under .design/issue-drafts/.)'
severity: low
propose_report: false
```

### KFM-003 — Node.js version mismatch

`package.json` declares `engines.node: ">=22"`. Older Node versions
crash on the `--experimental-strip-types` test runner, or fail subtle
TypeScript-import behaviour.

```yaml
id: KFM-003
pattern: '(engine "node" is incompatible|Unsupported engine|SyntaxError.*Unexpected token.*satisfies|--experimental-strip-types)'
diagnosis: 'Active Node.js version is below the plugin''s required >=22; modern syntax features and the strip-types test runner are unavailable.'
remedy: 'Upgrade Node to >=22 (e.g. `nvm install 22 && nvm use 22`) and rerun.'
severity: high
propose_report: false
```

### KFM-004 — Figma token missing

Figma-aware flows expect `FIGMA_TOKEN` (or the documented env-var alias)
to be present. The 401/missing-env error class is recognisable.

```yaml
id: KFM-004
pattern: '(FIGMA_TOKEN.*(not set|missing|undefined)|Figma.*401|figma.*unauthor)'
diagnosis: 'FIGMA_TOKEN environment variable is missing or invalid; Figma-dependent commands cannot authenticate.'
remedy: 'Generate a personal access token at https://www.figma.com/developers/api#access-tokens and `export FIGMA_TOKEN=<token>` in your shell profile.'
severity: medium
propose_report: false
```

### KFM-005 — Git working tree dirty

Several phase-tooling commands assume a clean working tree (clean
checkpoints between cycles). A dirty tree surfaces as a stderr line
the matcher can recognise.

```yaml
id: KFM-005
pattern: '(working tree (is )?(not clean|dirty)|uncommitted changes|Changes not staged for commit)'
diagnosis: 'Git working tree has uncommitted changes; the command requires a clean checkpoint before proceeding.'
remedy: 'Commit, stash (`git stash -u`), or discard your local changes, then rerun the command.'
severity: low
propose_report: false
```

### KFM-006 — `.planning/` directory missing

GSD/GDD project commands assume `.planning/` has been initialised by
`/gsd:new-project`. A bare ENOENT on that path is a clear self-fix.

```yaml
id: KFM-006
pattern: 'ENOENT.*\.planning'
diagnosis: '.planning/ directory does not exist; the project has not been initialised yet.'
remedy: 'Run `/gsd:new-project` to bootstrap the planning structure, then retry.'
severity: medium
propose_report: false
```

### KFM-007 — `reference/registry.json` invalid JSON

The Phase 14.5 registry is hand-edited; a stray trailing comma or
unquoted key surfaces here. Self-fixable, not a maintainer issue.

```yaml
id: KFM-007
pattern: '(reference/registry\.json.*(SyntaxError|JSON|Unexpected token)|Unexpected token.*registry\.json)'
diagnosis: 'reference/registry.json failed to parse as JSON — likely a trailing comma or unbalanced brace from a recent edit.'
remedy: 'Open reference/registry.json in your editor; the JSON parser error message will pinpoint the line. Fix the syntax and retry.'
severity: medium
propose_report: false
```

### KFM-008 — MCP server unreachable

When the Figma / GDD MCP servers are not running, commands depending
on them fail with a clear connection-refused class of error.

```yaml
id: KFM-008
pattern: '(MCP.*(unreachable|ECONNREFUSED|not connected)|mcp.*server.*not.*running|connection refused.*ws://)'
diagnosis: 'An MCP server (Figma, GDD-state, or GDD-tools) is not reachable; the plugin cannot route tool calls through it.'
remedy: 'Start the relevant MCP server (see scripts/mcp-servers/) and confirm `claude mcp list` shows it as connected.'
severity: medium
propose_report: true
```

### KFM-009 — Plugin file accidentally deleted

A user-side `git clean -fdx` or aggressive editor refactor can remove
plugin files. This is a re-install path, not a bug report path — but
it's on the whitelist because users typically can't tell it apart from
an upstream regression.

```yaml
id: KFM-009
pattern: 'Cannot find module.*(scripts/lib/|skills/.*SKILL\.md|reference/.*\.md)'
diagnosis: 'A plugin file is missing — most often the result of a local `git clean` or a partial install.'
remedy: 'Reinstall the plugin: `npm install -g @hegemonart/get-design-done` (or pull the repo fresh in dev). If the file should exist, the error message gives its path.'
severity: medium
propose_report: true
```

### KFM-010 — Disk full / ENOSPC

Out-of-space failures masquerade as obscure write errors. Self-fixable
by freeing space; not a maintainer report path.

```yaml
id: KFM-010
pattern: '(ENOSPC|no space left on device|disk full)'
diagnosis: 'Disk is full — no space left on the device the plugin is writing to.'
remedy: 'Free space (e.g. clear `.design/cache/`, prune old worktrees, empty trash) and retry.'
severity: high
propose_report: false
```
