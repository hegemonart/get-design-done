# Known Failure Modes (Phase 30 Triage Gate)

This file is the **catalogue of locally-fixable failure modes** that the
Phase 30 issue-reporter consults *before* prompting the user to file a
GitHub issue. The triage gate runs first (D-07): when an entry matches
the user's error, the gate surfaces `this looks like X — try Y` and
exits the report flow without prompting. `--force-report` bypasses the
gate but still requires consent (D-11).

## Schema

Each entry is a single fenced ```yaml block with this flat key:value shape.

### Schema v1 (Phase 30, matcher-consumed) — original 6 fields

These six fields are consumed by `scripts/lib/issue-reporter/triage-matcher.cjs`
(`matchKnownFailure(errorContext)`). The matcher reads ONLY these fields and
ignores everything else gracefully (D-04 backward-compat).

- `id` — stable identifier (kebab-case or `KFM-NNN` numeric). Required.
- `pattern` — JavaScript regex string. Matched against
  `[error.message, error.stack].filter(Boolean).join("\n")`. Required.
- `diagnosis` — one-sentence plain-English root cause. Required.
- `remedy` — one-sentence user-runnable action. Required.
- `severity` — advisory only, one of `low` / `medium` / `high`. Required.
- `propose_report` — boolean. If `true`, this mode is on the D-11
  whitelist: 30-04 may *propose* `--report` at error time for this
  class. Defaults to `false`. Advisory; the matcher does not act on it.

### Schema v2 (Phase 30.5 D-02) — additive fields

These five fields are required on every entry from Phase 30.5 onward.
They are NOT consumed by the Phase 30 matcher (D-04 backward-compat
invariant); they exist for human authors, retrospective harvesting, and
future tooling (e.g. the Phase 30.5-02 fuzzy matcher, the Phase 30.5-03
reflector incubator). Adding them does not change the matcher's
behaviour for the original 6 fields.

- `symptom` — string, 1–3 sentences. Plain-English description of what
  the user sees when this failure mode hits. Required.
  *Example:* `'Build fails with EUSAGE about a missing or stale lockfile after a package.json edit.'`
- `root_cause` — string, 1–2 sentences. Technical explanation of why
  the failure happens. Required.
  *Example:* `'npm ci enforces lockfile parity with package.json; manually editing one without the other breaks parity.'`
- `fix` — string (single line; multi-step encoded as `1) … 2) … 3) …`).
  Step-by-step user-runnable remedy. The original `remedy` field stays
  as the short matcher-consumed one-liner; `fix` is the fuller version
  with prerequisites and verification steps. The two MAY differ. Required.
  *Example:* `'1) Run `npm install` once locally. 2) Stage the updated package-lock.json. 3) Commit and re-run `npm ci`.'`
- `related_phases` — number[] (YAML flow style: `[12, 24]`). Phase numbers
  this mode touches. Empty array `[]` is allowed when the mode is
  cross-cutting and not tied to a specific phase. Required.
  *Example:* `[12, 14.6, 24]`
- `first_observed_cycle` — string. Cycle slug like `cycle-2026-05`, or
  `pre-30.5` for entries harvested from before this catalogue formalised
  the schema. Required.
  *Example:* `'cycle-2026-05'`

The Phase 30 matcher (`scripts/lib/issue-reporter/triage-matcher.cjs`)
consumes ONLY the original 6 fields per D-04. The 5 additive fields are
for human authors, retrospective harvesting, and future tooling.

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
symptom: 'Commands that write into `.design/` (state snapshots, reflection drafts, issue drafts) fail with `EACCES: permission denied`. The plugin cannot persist its work-product directory.'
root_cause: 'The `.design/` directory was created by a different user (often root after a `sudo`-clone) or its permissions were tightened so the current user lacks write access.'
fix: '1) Identify the owner with `ls -ld .design` and `id -u`. 2) Run `sudo chown -R "$USER" .design` to reclaim ownership. 3) Alternatively, `rm -rf .design && mkdir .design` if the directory contains no state you need. 4) Re-run the command that failed.'
related_phases: [11, 22, 29]
first_observed_cycle: 'pre-30.5'
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
symptom: 'The `/gdd:report-issue` flow exits during the outbound submission step with `gh: command not found`, `spawn gh ENOENT`, or (on Windows) `''gh'' is not recognized as an internal or external command`.'
root_cause: 'Phase 30 D-05 routes the outbound submission through the user''s `gh` CLI; when `gh` is absent or off `PATH`, the spawn fails before any network call.'
fix: '1) Install `gh` from https://cli.github.com (`brew install gh`, `winget install GitHub.cli`, or distro package). 2) Run `gh auth login` and pick GitHub.com + your preferred protocol. 3) Verify with `gh auth status`. 4) Re-run `/gdd:report-issue`. As a fallback, the issue draft is already saved under `.design/issue-drafts/` — open it and file manually via the GitHub web UI.'
related_phases: [30]
first_observed_cycle: 'pre-30.5'
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
symptom: 'npm warns `engine "node" is incompatible` / `Unsupported engine`, or Node throws `SyntaxError: Unexpected token "satisfies"`, or the test runner fails to recognise `--experimental-strip-types`.'
root_cause: 'The plugin declares `engines.node: ">=22"` in `package.json` and uses Node 22-only syntax (e.g. `satisfies` operator in TypeScript-stripped tests). Older Node runtimes cannot parse the source.'
fix: '1) Check active version with `node -v`. 2) If <22, run `nvm install 22 && nvm use 22` (Linux/macOS) or `nvm-windows install 22` / `winget install OpenJS.NodeJS`. 3) Reopen the shell or re-source `~/.nvmrc`. 4) Verify with `node -v` then re-run the command.'
related_phases: [12, 14.6, 24]
first_observed_cycle: 'pre-30.5'
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
symptom: 'Figma-aware commands abort with `FIGMA_TOKEN not set`, return HTTP 401 from `api.figma.com`, or emit `figma: unauthorized`.'
root_cause: 'Figma flows authenticate via a personal access token in `FIGMA_TOKEN`. When the env var is unset, expired, or revoked, the API rejects every request.'
fix: '1) Visit https://www.figma.com/developers/api#access-tokens and generate a new token. 2) `export FIGMA_TOKEN=<token>` in `~/.zshrc` / `~/.bashrc` (or `$Env:FIGMA_TOKEN` in PowerShell). 3) Open a new shell and verify with `echo $FIGMA_TOKEN`. 4) Re-run the failing command.'
related_phases: [13.2, 18, 19.6]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A phase-tooling command (e.g. `/gsd:execute-phase`, milestone closeout) aborts with `working tree is not clean`, `uncommitted changes`, or `Changes not staged for commit`.'
root_cause: 'Several GSD/GDD tooling commands assume a clean git checkpoint between cycles so commits remain atomic and easy to revert. A dirty working tree breaks that invariant.'
fix: '1) Run `git status` to see which files are dirty. 2) If the changes are wanted, stage them individually with `git add <path>` and `git commit -m "..."`. 3) If they''re scratch work, `git stash -u` (preserves them) or `git checkout -- <path>` (discards them). 4) Re-run the original command.'
related_phases: [22, 23.5, 25]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A GSD/GDD command fails with `ENOENT: no such file or directory, open ''.planning/STATE.md''` or a similar `ENOENT` referencing the `.planning/` tree.'
root_cause: 'GSD/GDD commands read project state from `.planning/` (STATE.md, ROADMAP.md, REQUIREMENTS.md, phases/). The directory must be bootstrapped by `/gsd:new-project` before any other workflow command will work.'
fix: '1) Verify you''re in the project root with `pwd` / `ls`. 2) If `.planning/` is genuinely missing, run `/gsd:new-project` to scaffold it. 3) If you expected `.planning/` to exist (cloned repo), check whether it was excluded by `.gitignore` — `.planning/` is local-only in some projects. 4) Re-run the failing command.'
related_phases: [22, 23.5]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A tool that loads the Phase 14.5 reference registry crashes with `SyntaxError: Unexpected token` or `JSON.parse` failure referencing `reference/registry.json`.'
root_cause: 'reference/registry.json is hand-edited as part of new-phase work; a trailing comma, unquoted key, or unbalanced brace from a recent edit breaks JSON.parse on the next consumer.'
fix: '1) Open `reference/registry.json` in your editor — the JSON parser error message includes the offending line/column. 2) Look for trailing commas (JSON forbids them), unquoted keys, or unbalanced braces/brackets. 3) Validate with `node -e "JSON.parse(require(''fs'').readFileSync(''reference/registry.json''))"` — silent exit means success. 4) Re-run the failing command.'
related_phases: [14.5, 25]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A command depending on an MCP server fails with `MCP unreachable`, `ECONNREFUSED`, `mcp server not running`, or `connection refused ws://...`. Tool calls routed through MCP never reach their target.'
root_cause: 'The local MCP transport (WebSocket or stdio bridge) is not bound. The MCP server process is either not started, crashed silently, or is listening on a different port than the client expects.'
fix: '1) Run `claude mcp list` and check the status column for the failing server. 2) If it shows `disconnected`, start it: `scripts/mcp-servers/<name>.cjs` or the launcher script for that server. 3) Confirm the port matches the value in `mcp.json` or `.mcp.json`. 4) Re-run the failing command. If the server crashes on start, this is a maintainer report path (propose_report:true).'
related_phases: [27.7, 33.6]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A command errors out with `Cannot find module` referencing a path under `scripts/lib/`, `skills/.../SKILL.md`, or `reference/*.md`. From the user''s perspective, a file that should ship with the plugin is gone.'
root_cause: 'The file was removed locally — most often by an aggressive `git clean -fdx`, a worktree teardown that swept up tracked files, or an incomplete reinstall. The error path tells you exactly which file is missing.'
fix: '1) Note the missing path from the error. 2) `git status` to confirm it''s gone (not just renamed). 3) `git checkout HEAD -- <path>` to restore from the current commit. 4) If the file was never committed locally, run `npm install -g @hegemonart/get-design-done` (or pull the repo fresh in dev mode). 5) Re-run the failing command. (propose_report:true because a missing plugin file can also indicate an upstream packaging bug.)'
related_phases: [24, 25]
first_observed_cycle: 'pre-30.5'
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
symptom: 'A write operation fails with `ENOSPC`, `no space left on device`, or `disk full`. The error often surfaces from a seemingly unrelated path (cache write, log append, snapshot save).'
root_cause: 'The filesystem holding `.design/`, the repo, or the npm cache has run out of free blocks or inodes. Node''s `fs.writeFile` (and downstream tools) propagate the kernel''s `ENOSPC` directly.'
fix: '1) Check free space with `df -h` (Linux/macOS) or `Get-PSDrive` (PowerShell). 2) Clear local caches: `rm -rf .design/cache/`, `npm cache clean --force`, prune stale `git worktree list` entries. 3) Empty system trash / Recycle Bin. 4) If the issue is inodes (not blocks), check with `df -i` and clean small-file-heavy dirs (`node_modules`, build artifacts). 5) Re-run the command.'
related_phases: [22, 24, 29]
first_observed_cycle: 'pre-30.5'
```
