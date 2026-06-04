# Known Failure Modes (Phase 30 Triage Gate)

This file is the **catalogue of locally-fixable failure modes** that the
Phase 30 issue-reporter consults *before* prompting the user to file a
GitHub issue. The triage gate runs first (D-07): when an entry matches
the user's error, the gate surfaces `this looks like X — try Y` and
exits the report flow without prompting. `--force-report` bypasses the
gate but still requires consent (D-11).

## Schema

Each entry is a single fenced ```yaml block with this flat key:value shape.

### Schema v1 (Phase 30, matcher-consumed) - original 6 fields

These six fields are consumed by `scripts/lib/issue-reporter/triage-matcher.cjs`
(`matchKnownFailure(errorContext)`). The matcher reads ONLY these fields and
ignores everything else gracefully (D-04 backward-compat).

- `id` - stable identifier (kebab-case or `KFM-NNN` numeric). Required.
- `pattern` - JavaScript regex string. Matched against
  `[error.message, error.stack].filter(Boolean).join("\n")`. Required.
- `diagnosis` - one-sentence plain-English root cause. Required.
- `remedy` - one-sentence user-runnable action. Required.
- `severity` - advisory only, one of `low` / `medium` / `high`. Required.
- `propose_report` - boolean. If `true`, this mode is on the D-11
  whitelist: 30-04 may *propose* `--report` at error time for this
  class. Defaults to `false`. Advisory; the matcher does not act on it.

### Schema v2 (Phase 30.5 D-02) - additive fields

These five fields are required on every entry from Phase 30.5 onward.
They are NOT consumed by the Phase 30 matcher (D-04 backward-compat
invariant); they exist for human authors, retrospective harvesting, and
future tooling (e.g. the Phase 30.5-02 fuzzy matcher, the Phase 30.5-03
reflector incubator). Adding them does not change the matcher's
behaviour for the original 6 fields.

- `symptom` - string, 1–3 sentences. Plain-English description of what
  the user sees when this failure mode hits. Required.
  *Example:* `'Build fails with EUSAGE about a missing or stale lockfile after a package.json edit.'`
- `root_cause` - string, 1–2 sentences. Technical explanation of why
  the failure happens. Required.
  *Example:* `'npm ci enforces lockfile parity with package.json; manually editing one without the other breaks parity.'`
- `fix` - string (single line; multi-step encoded as `1) … 2) … 3) …`).
  Step-by-step user-runnable remedy. The original `remedy` field stays
  as the short matcher-consumed one-liner; `fix` is the fuller version
  with prerequisites and verification steps. The two MAY differ. Required.
  *Example:* `1) Run npm install once locally. 2) Stage the updated package-lock.json. 3) Commit and re-run npm ci.`
- `related_phases` - number[] (YAML flow style: `[12, 24]`). Phase numbers
  this mode touches. Empty array `[]` is allowed when the mode is
  cross-cutting and not tied to a specific phase. Required.
  *Example:* `[12, 14.6, 24]`
- `first_observed_cycle` - string. Cycle slug like `cycle-2026-05`, or
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

### KFM-001 - EACCES on `.design/` write

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

### KFM-002 - `gh` CLI not on PATH

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

### KFM-003 - Node.js version mismatch

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

### KFM-004 - Figma token missing

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

### KFM-005 - Git working tree dirty

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

### KFM-006 - `.planning/` directory missing

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

### KFM-007 - `reference/registry.json` invalid JSON

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

### KFM-008 - MCP server unreachable

When the Figma / GDD MCP servers are not running, commands depending
on them fail with a clear connection-refused class of error.

```yaml
id: KFM-008
pattern: '(MCP.*(unreachable|ECONNREFUSED|not connected)|mcp.*server.*not.*running|connection refused.*ws://)'
diagnosis: 'An MCP server (Figma, GDD-state, or GDD-tools) is not reachable; the plugin cannot route tool calls through it.'
remedy: 'Start the relevant MCP server (see sdk/mcp/) and confirm `claude mcp list` shows it as connected.'
severity: medium
propose_report: true
symptom: 'A command depending on an MCP server fails with `MCP unreachable`, `ECONNREFUSED`, `mcp server not running`, or `connection refused ws://...`. Tool calls routed through MCP never reach their target.'
root_cause: 'The local MCP transport (WebSocket or stdio bridge) is not bound. The MCP server process is either not started, crashed silently, or is listening on a different port than the client expects.'
fix: '1) Run `claude mcp list` and check the status column for the failing server. 2) If it shows `disconnected`, start it: `sdk/mcp/<name>/server.ts` or the launcher script for that server. 3) Confirm the port matches the value in `mcp.json` or `.mcp.json`. 4) Re-run the failing command. If the server crashes on start, this is a maintainer report path (propose_report:true).'
related_phases: [27.7, 33.6]
first_observed_cycle: 'pre-30.5'
```

### KFM-009 - Plugin file accidentally deleted

A user-side `git clean -fdx` or aggressive editor refactor can remove
plugin files. This is a re-install path, not a bug report path - but
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

### KFM-010 - Disk full / ENOSPC

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

### KFM-011 - `validate-skill-length` pre-commit hook fails

The local pre-commit hook `scripts/validate-skill-length.cjs` rejects
SKILL.md files exceeding the agentskills.io length budget. A commit is
blocked until the offending skill is trimmed or the `--fix` autoformatter
is run.

```yaml
id: KFM-011
pattern: '(validate-skill-length|skill.*exceeds.*(line|character)|SKILL\.md.*(too long|over.*budget))'
diagnosis: 'A SKILL.md file exceeds the agentskills.io length budget; the validate-skill-length pre-commit hook is blocking the commit.'
remedy: 'Run `node scripts/validate-skill-length.cjs --fix` to auto-trim, then re-stage and commit.'
severity: low
propose_report: true
symptom: 'A `git commit` aborts with `validate-skill-length` warnings: one or more `SKILL.md` files exceed the per-skill line or character budget. The commit never lands.'
root_cause: 'The pre-commit hook enforces the agentskills.io length contract (Phase 28.5). When a recent edit pushes a skill over budget, the hook fails fast to keep skills shippable.'
fix: '1) Inspect the hook output — it names each offending file and its measured size. 2) Run `node scripts/validate-skill-length.cjs --fix` to autoformat any auto-trimmable bloat. 3) If the file still exceeds budget, manually shorten descriptions or move detail into a `reference/` sidecar. 4) `git add` the trimmed file and re-run `git commit`. This is on the propose_report whitelist because recurring trips often indicate the budget itself needs reconsideration.'
related_phases: [28.5, 28.6]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-012 - `npm ci` lockfile drift

`npm ci` enforces strict parity between `package.json` and
`package-lock.json`. A manual edit to one without the other surfaces as
an `EUSAGE` error with the lockfile path called out.

```yaml
id: KFM-012
pattern: '(npm error code EUSAGE|can only install (packages )?with an existing package-lock\.json|npm ci.*lockfile)'
diagnosis: 'package-lock.json is out of sync with package.json; npm ci refuses to install when the lockfile is missing or drifted.'
remedy: 'Run `npm install` once locally to regenerate the lockfile, commit the updated package-lock.json, then re-run `npm ci`.'
severity: medium
propose_report: false
symptom: 'CI or a clean install fails with `npm error code EUSAGE` and a message about `npm ci` only working with an existing, up-to-date `package-lock.json`.'
root_cause: 'A manual edit to `package.json` (e.g. bumping a version) without a follow-up `npm install` leaves the lockfile drifted. `npm ci` rejects drift to keep installs reproducible.'
fix: '1) Pull the latest main if needed. 2) Run `npm install` (NOT `npm ci`) to regenerate the lockfile from `package.json`. 3) Inspect the diff with `git diff package-lock.json` — should match the package.json change. 4) Stage and commit the updated lockfile. 5) Re-run `npm ci`.'
related_phases: [25]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-013 - lychee transient SSL failure on whitelisted hosts

The link-check job (lychee) reports intermittent TLS errors on a small
set of well-known authority hosts (`heydonworks.com`,
`ryanmulligan.dev`, `adamwathan.me`). These are usually transient and
clear on re-run; persistent failures warrant an allowlist entry.

```yaml
id: KFM-013
pattern: '(lychee.*\[ERROR\].*(heydonworks\.com|ryanmulligan\.dev|adamwathan\.me)|SSL.*handshake.*(heydonworks|ryanmulligan|adamwathan))'
diagnosis: 'lychee link-check hit a transient TLS/SSL failure on one of the whitelisted authority hosts; likely a flaky CDN handshake rather than a real broken link.'
remedy: 'Rerun the link-check job; if 3 consecutive runs fail, add the host to lychee allowlist in .lycheeignore or workflow config.'
severity: low
propose_report: false
symptom: 'The `link-check` workflow fails with `lychee [ERROR]` lines naming `heydonworks.com`, `ryanmulligan.dev`, or `adamwathan.me`, often with a TLS handshake or `SSL` error in the message.'
root_cause: 'These hosts sit behind CDNs that occasionally renegotiate TLS sessions mid-flight from CI runners. lychee surfaces the failure as a hard error even when the URL is reachable on retry.'
fix: '1) Open the failed Actions run and re-run only failed jobs. 2) If the same host fails three times in a row, edit `.lycheeignore` (or the equivalent allowlist in the workflow) and add the URL or hostname. 3) Re-run the workflow.'
related_phases: [13.2, 18]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-014 - `gh pr merge` fast-forward warning (cosmetic)

GitHub's CLI surfaces a "Not possible to fast-forward" warning after a
successful server-side merge in some workflow combinations. The merge
already landed; the warning is purely cosmetic.

```yaml
id: KFM-014
pattern: '(Not possible to fast-forward, do you want to continue|gh pr merge.*warning.*fast-forward)'
diagnosis: 'gh pr merge surfaced a fast-forward warning, but the server-side merge already succeeded; the local branch is just lagging.'
remedy: 'Verify the PR is merged on GitHub (gh pr view --json state); the warning is cosmetic and can be ignored. Pull main to sync your local branch.'
severity: low
propose_report: false
symptom: 'After `gh pr merge`, the CLI prints `Not possible to fast-forward, do you want to continue?` even though the PR shows as merged on github.com. The user is unsure whether the merge happened.'
root_cause: 'The local main branch has diverged from origin/main between the start of `gh pr merge` and its post-merge sync step. The server-side merge succeeded; the local refs just need a `git pull` to catch up.'
fix: '1) Confirm the merge with `gh pr view <number> --json state,mergedAt`. 2) If `state` is `MERGED`, the warning is cosmetic. 3) Run `git checkout main && git pull origin main` to sync local refs. 4) Continue with the next workflow step.'
related_phases: [25]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-015 - CodeQL `js/incomplete-sanitization` false positive

CodeQL flags `js/incomplete-sanitization` on regex-based input that
operates on an enum-constrained value. The alert is a false positive in
that narrow case but cannot be silenced without an inline justification.

```yaml
id: KFM-015
pattern: '(js/incomplete-sanitization|CodeQL.*incomplete[- ]sanitization)'
diagnosis: 'CodeQL flagged js/incomplete-sanitization on input that is already constrained to an enum/whitelist; common false-positive class.'
remedy: 'Add a CodeQL justification comment (`// codeql[js/incomplete-sanitization]`) explaining the enum constraint, then dismiss the alert with reason "false positive — input is enum-constrained".'
severity: low
propose_report: false
symptom: 'A CodeQL scan reports `js/incomplete-sanitization` on a line that sanitises user-supplied input which is already constrained to a small enum (e.g. `low|medium|high`).'
root_cause: 'CodeQL''s data-flow analysis cannot prove that an upstream check restricts the input to an enum, so it conservatively flags the regex-based normaliser as incomplete sanitization.'
fix: '1) Confirm via code inspection that the input is genuinely enum-constrained upstream (e.g. validated by a `SEVERITIES.has(x)` check). 2) Add an inline justification comment immediately above the flagged line: `// codeql[js/incomplete-sanitization] — input is enum-constrained by SEVERITIES.has() at line N`. 3) Open the alert in GitHub Security tab and dismiss with reason "False positive". 4) Push the justification comment so future scans also surface it.'
related_phases: [25, 27.5]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-016 - `gitleaks` false positive on documentation examples

`gitleaks` flags literal example tokens (`ghp_…`, `sk-ant-…`) in
`reference/*.md` documentation. These are educational examples, not real
credentials, but the scanner cannot tell them apart.

```yaml
id: KFM-016
pattern: '(gitleaks.*finding.*reference/|gitleaks.*(ghp_|sk-ant-).*reference)'
diagnosis: 'gitleaks flagged a documentation example as a real secret; the path under reference/ contains an illustrative token literal, not a live credential.'
remedy: 'Either add the file path to .gitleaks.toml allowlist OR rewrite the example to use a clearly-fake placeholder like `EXAMPLE_TOKEN_REDACTED`.'
severity: low
propose_report: false
symptom: 'A `gitleaks` scan in CI fails with a finding pointing at a `reference/*.md` file containing a string that pattern-matches a token shape (e.g. `ghp_…` for a GitHub PAT or `sk-ant-…` for an Anthropic key).'
root_cause: 'gitleaks rules are pattern-based and cannot distinguish an example literal in documentation from a real leaked credential. Docs that include token shapes for teaching purposes trip the scanner.'
fix: '1) Confirm via `git log -p <file>` that the token is example-only and was never live. 2) Edit `.gitleaks.toml` and add the file path under `[allowlist] paths`. OR rewrite the example to use an obviously-fake placeholder like `ghp_EXAMPLE_REDACTED`. 3) Push the change and re-run the scan. 4) If the leak was real, follow secret-rotation playbook instead.'
related_phases: [25]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-017 - `release.yml` version mismatch with `plugin.json`

The Phase 25 release safeguard rejects a `workflow_dispatch` invocation
whose input version doesn't match the version declared in `plugin.json`.
This is the manifest-lockstep guard catching a forgotten bump.

```yaml
id: KFM-017
pattern: '(release\.yml.*version (mismatch|does not match)|workflow_dispatch.*plugin\.json.*version)'
diagnosis: 'release.yml refused the workflow_dispatch because input version disagrees with plugin.json; the lockstep version guard is intentionally blocking.'
remedy: 'Either correct the dispatch input to match plugin.json, or bump plugin.json (and the other 5 manifests) to the target version and re-dispatch.'
severity: medium
propose_report: false
symptom: 'A manual `workflow_dispatch` of `release.yml` fails immediately with an error about input version not matching `plugin.json`. The release does not proceed.'
root_cause: 'Phase 25 added a manifest-lockstep guard to `release.yml`: the dispatch input version MUST match `plugin.json` exactly. The guard catches the case where someone tries to release a version without first bumping all 6 manifests.'
fix: '1) Read the current `plugin.json` version. 2) If the dispatch input was a typo, re-dispatch with the correct version. 3) If you genuinely intended a new version, run the 6-manifest lockstep bump first: `plugin.json`, `package.json`, `package-lock.json`, `README.md`, `CHANGELOG.md`, the SDK version constant. 4) Commit the bumps, then re-dispatch `release.yml`.'
related_phases: [25]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-018 - `npm publish` 404 after `NPM_TOKEN` rotation

`npm publish` returns `404 Not Found` from the registry when the
`NPM_TOKEN` secret has been rotated upstream but the GitHub repo secret
still holds the old value. (Common after npm''s May 2026 Mini
Shai-Hulud forced rotation.)

```yaml
id: KFM-018
pattern: '(npm error 404|Not Found - PUT https://registry\.npmjs\.org/|npm publish.*401.*registry\.npmjs)'
diagnosis: 'npm publish failed with 404/401 against the registry; the most common cause in 2026 is a rotated NPM_TOKEN that the repo secret has not caught up to.'
remedy: 'Regenerate token at npmjs.com, update NPM_TOKEN repo secret in GitHub Settings, retry the release workflow.'
severity: medium
propose_report: false
symptom: 'A release run''s `npm publish` step fails with `npm error 404 Not Found - PUT https://registry.npmjs.org/<package>` or a 401 on the same URL. No version is published.'
root_cause: 'Either the `NPM_TOKEN` secret in the GitHub repo settings was rotated upstream (npmjs.com revoked the old token, common during the May 2026 Mini Shai-Hulud incident), or the token never had publish scope for the package.'
fix: '1) Log into npmjs.com → Access Tokens. 2) Generate a new Automation token with publish scope for the package. 3) In GitHub: Settings → Secrets → update `NPM_TOKEN` with the new value. 4) Re-dispatch the release workflow. 5) If the failure persists, verify the package name in `package.json` matches what npm expects and that 2FA settings allow automation tokens.'
related_phases: [25]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-019 - macOS symlinked tmpdir comparison failure

Tests that compare a tmpdir-derived path against an expected absolute
path fail on macOS because `/var/folders/...` is a symlink to
`/private/var/folders/...`. The string comparison sees mismatched
prefixes; `fs.realpathSync` resolves them.

```yaml
id: KFM-019
pattern: '(/var/folders/.*\/private/var/folders|AssertionError.*expected.*\/private\/var|tmpdir.*symlink.*realpath)'
diagnosis: 'macOS tmpdir is a symlink (/var/folders/ -> /private/var/folders/); a string equality test against tmpdir path fails because one side is resolved and the other isn''t.'
remedy: 'Wrap tmpdir reads in fs.realpathSync before comparing; or normalize both sides to realpath at assertion time.'
severity: low
propose_report: true
symptom: 'A unit test that uses `os.tmpdir()` fails on macOS with an assertion showing `/private/var/folders/...` on one side and `/var/folders/...` on the other. Same test passes on Linux.'
root_cause: 'macOS''s `/var/folders` is a symlink to `/private/var/folders`. `os.tmpdir()` returns the unresolved form, but some Node APIs (especially after a `process.chdir` into the tmpdir) return the resolved form. String equality fails on the prefix.'
fix: '1) In test setup, wrap the tmpdir path: `const TMP = fs.realpathSync(os.tmpdir())`. 2) Use `TMP` consistently throughout the test. 3) For any assertion that receives a path from a Node API after `chdir`, also pass it through `fs.realpathSync`. 4) Re-run the test. propose_report:true because this is recurring developer-experience friction that warrants a tracked tooling issue.'
related_phases: [12, 14.6]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-020 - Windows CRLF vs LF byte-comparison mismatch

Tests that byte-compare file contents fail on Windows because
`git show HEAD:<file>` returns LF line endings while
`fs.readFileSync` after checkout returns CRLF (when `core.autocrlf` is
`true`). Normalisation or `.gitattributes` resolves it.

```yaml
id: KFM-020
pattern: '(core\.autocrlf|CRLF.*(mismatch|conversion)|AssertionError.*(CRLF|line endings|eol)|git.*autocrlf.*true)'
diagnosis: 'Windows checkout converted LF to CRLF; byte-comparison between `git show HEAD:` (LF) and the working tree (CRLF) fails.'
remedy: 'Either set .gitattributes `* text=auto eol=lf` for the affected files, or normalize both sides with `.replace(/\\r\\n/g,"\\n")` before comparison.'
severity: medium
propose_report: true
symptom: 'A test that byte-compares file contents passes on Linux/macOS but fails on Windows with an `AssertionError` showing `\\r\\n` on one side and `\\n` on the other.'
root_cause: 'Windows git has `core.autocrlf=true` by default; on checkout, LF in the repo is converted to CRLF in the working tree. `git show HEAD:<file>` returns the LF-form, but `fs.readFileSync` after a normal checkout returns CRLF. Byte equality fails.'
fix: '1) Decide whether the file should be EOL-normalised: if yes, add `<glob> text=auto eol=lf` to `.gitattributes`, run `git add --renormalize .`, commit. 2) Or normalise both sides at compare time: `expected.replace(/\\r\\n/g,"\\n") === actual.replace(/\\r\\n/g,"\\n")`. 3) For test-fixture binary-ish files, also consider `<glob> -text` to disable EOL handling entirely. 4) Re-run the Windows test. propose_report:true because Windows-specific test failures are easy to miss in Linux-only CI.'
related_phases: [12, 14.6, 24]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-021 - Skill name contains colon (agentskills.io slug regex)

Skills named with a colon (e.g. `get-design-done:foo`) fail the
agentskills.io spec validator. The spec reserves colons for namespace
delimiters at the registry level; on-disk skill folders must use
hyphens.

```yaml
id: KFM-021
pattern: '(agentskills\.io.*(slug|name).*invalid|skill name.*contains colon|SKILL.*invalid.*slug)'
diagnosis: 'Skill folder name contains a colon, which the agentskills.io spec reserves for registry-level namespacing; on-disk skill slugs must be hyphen-separated.'
remedy: 'Rename the skill folder to use a hyphen (e.g. `get-design-done:foo` -> `get-design-done-foo`) and update any cross-references.'
severity: medium
propose_report: false
symptom: 'A skill-validation step (or the publishing flow) rejects a skill folder with an error like `skill name "get-design-done:foo" is not a valid agentskills.io slug` or `slug must match /^[a-z0-9][a-z0-9-]*$/`.'
root_cause: 'The agentskills.io spec slug regex `/^[a-z0-9][a-z0-9-]*$/` excludes colons; colons are reserved at the registry level for namespacing. On-disk skill folders must use hyphens only.'
fix: '1) Rename the folder: `git mv skills/get-design-done:foo skills/get-design-done-foo`. 2) Update any cross-references in `plugin.json`, `README.md`, and other skills'' frontmatter `requires:` arrays. 3) Search-and-replace the old slug with the new one across `reference/` and `commands/`. 4) Re-run the validation.'
related_phases: [28.5, 28.6]
first_observed_cycle: 'cycle-2026-05'
```

### KFM-022 - Dependabot alert on transitive optional peer not in resolved tree

Dependabot opens an alert for a vulnerable transitive dependency that is
declared as an optional or peer dep upstream and is NOT actually
installed (`npm ls <dep>` shows nothing). The alert is dismissible with
"not vulnerable - not in resolved tree".

```yaml
id: KFM-022
pattern: '(Dependabot.*alert.*(transitive|optional|peer)|npm ls.*empty.*Dependabot)'
diagnosis: 'Dependabot opened an alert on a transitive optional/peer dependency that is not actually present in the resolved npm tree; the alert is real for some users but not for this install.'
remedy: 'Dismiss alert with reason "not vulnerable — transitive optional peer, not in resolved tree"; verify with `npm ls <dep>` (empty output confirms).'
severity: low
propose_report: false
symptom: 'A new Dependabot alert names a deeply-nested dependency the project does not directly use. Running `npm ls <dep>` from the project root returns empty output (no path to the package).'
root_cause: 'Dependabot reads `package-lock.json` and flags any package whose version matches a known CVE. Optional/peer transitive deps that npm did NOT install (because the host platform or peer mismatch ruled them out) still appear in the lockfile metadata, so Dependabot flags them even though they''re absent from the resolved tree.'
fix: '1) Verify absence: `npm ls <dep>` from the project root — empty output confirms the package is not installed. 2) Open the alert in GitHub Security tab → Dismiss → reason "Not vulnerable" with note "transitive optional peer; npm ls returns empty; not in resolved tree". 3) Optionally pin or update the parent dependency in a follow-up to remove the lockfile reference entirely. 4) Re-run any scan that depends on Dependabot state.'
related_phases: [25, 27.5]
first_observed_cycle: 'cycle-2026-05'
```
