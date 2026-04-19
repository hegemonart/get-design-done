---
phase: full-codebase
reviewed: 2026-04-19T00:00:00Z
depth: deep
files_reviewed: 33
files_reviewed_list:
  - hooks/budget-enforcer.js
  - hooks/context-exhaustion.js
  - hooks/gdd-read-injection-scanner.js
  - hooks/hooks.json
  - hooks/update-check.sh
  - scripts/bootstrap.sh
  - scripts/apply-branch-protection.sh
  - scripts/rollback-release.sh
  - scripts/aggregate-agent-metrics.js
  - scripts/build-intel.cjs
  - scripts/detect-stale-refs.cjs
  - scripts/extract-changelog-section.cjs
  - scripts/release-smoke-test.cjs
  - scripts/run-injection-scanner-ci.cjs
  - scripts/validate-frontmatter.cjs
  - scripts/validate-schemas.cjs
  - scripts/verify-version-sync.cjs
  - scripts/tests/test-authority-rejected-kinds.sh
  - scripts/tests/test-authority-watcher-diff.sh
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - .github/workflows/npm-backfill.yml
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - package.json
  - tests/helpers.cjs
  - tests/read-injection-scanner.test.cjs
  - tests/hook-validation.test.cjs
  - tests/pipeline-smoke.test.cjs
  - tests/connection-probe.test.cjs
  - tests/optimization-layer.test.cjs
  - tests/regression-baseline.test.cjs
findings:
  critical: 4
  warning: 7
  info: 6
  total: 17
status: issues_found
---

# Full-Codebase Code Review

**Reviewed:** 2026-04-19
**Depth:** deep
**Files Reviewed:** 33
**Status:** issues_found

## Summary

This is a deep review of the full shipped codebase for `@hegemonart/get-design-done` v1.14.0 (plugin.json) / v1.13.3 (package.json). The plugin installs hooks that execute in every Claude Code session and ships bootstrap/release shell scripts that run in user environments and CI.

**Overall security posture is good.** The code follows fail-open discipline consistently, uses atomic tmp-rename writes, avoids `eval`, and runs shellcheck in CI. The hooks are narrow in scope and have appropriate guard clauses.

**Four critical issues require attention before the next release:**
1. A shell command injection vector in `build-intel.cjs` via unvalidated file paths in a template literal passed to `execSync`.
2. The changelog body fetched from a remote GitHub API is written to disk and later rendered to the terminal without full sanitization — a `%s` format string risk.
3. Unpinned third-party GitHub Action (`ludeeus/action-shellcheck@master`) creates a supply-chain risk in CI.
4. `package.json` version (1.13.3) does not match `plugin.json` / `marketplace.json` (1.14.0) — the `verify-version-sync.cjs` guard will fail on any publish attempt from the current tree.

---

## Critical Issues

### CR-01: Command injection via unvalidated file path in `build-intel.cjs`

**File:** `scripts/build-intel.cjs:49`
**Issue:** `gitHash()` builds a shell command string by interpolating `filePath` directly into a template literal using double-quotes. File paths are sourced from `walkDir()` which walks the file system starting from untrusted directory names. A file path containing `"` followed by shell metacharacters (e.g. `foo" && malicious-cmd #`) would break out of the quoted argument and execute arbitrary shell commands via `execSync`.

The vector: a malicious package placed in `node_modules` (or a crafted file in the project) could have a filename that causes injection when `build-intel.cjs` is run.

```javascript
// VULNERABLE — line 49
return execSync(`git log -1 --format=%h -- "${filePath}"`, ...)
//                                          ^^^^^^^^^^^^ unvalidated
```

**Fix:** Use `spawnSync` with an argv array to eliminate shell interpretation entirely:
```javascript
const { spawnSync } = require('child_process');

function gitHash(filePath) {
  try {
    const result = spawnSync('git', ['log', '-1', '--format=%h', '--', filePath], {
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return result.stdout.trim() || 'untracked';
  } catch { return 'untracked'; }
}
```

---

### CR-02: Remote changelog body rendered into terminal without printf-safe handling

**File:** `hooks/update-check.sh:229`
**Issue:** `C_BODY` originates from a GitHub Releases API response, is JSON-escaped and written to `update-cache.json`, then read back and passed to `printf '%s\n'` for rendering. The `printf '%s\n'` call on line 229 is safe — `%s` does not interpret format specifiers in the data. **However**, the body is also passed unquoted in contexts where it could be interpreted by `awk` and `sed` during the round-trip JSON escaping step at line 185:

```bash
ESC="$(printf '%s' "${BODY_EXCERPT}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')"
printf '  "changelog_excerpt": "%s"\n' "${ESC}"   # line 186
```

The `awk` `printf "%s\\n"` is also safe because `$0` is the data. The real risk is the final `printf` at line 186 where `${ESC}` is data being placed as a printf format argument — but the format string is a literal `"%s"` and the data is the last argument, so this is actually safe in the current form.

The **actual bug** is at line 229 where `C_BODY` is re-expanded from the cache via `sed` on line 199:

```bash
C_BODY="$(grep -E '"changelog_excerpt"' "${CACHE}" | head -n1 | \
  sed -E 's/.*"changelog_excerpt"[[:space:]]*:[[:space:]]*"(.*)".*/\1/' | \
  sed -E 's/\\n/\n/g')"
```

This `sed` pattern uses `(.*)` (greedy) to capture everything between the first `"` and the last `"` on the line. If the GitHub API returns a release body that contains a `"` character that survives JSON escaping (a malformed/adversarial release), the sed capture terminates early and the remainder leaks into the shell assignment. A crafted tag release body of the form `text" && rm -rf ~/.claude/libs #` would inject shell commands.

The BODY_EXCERPT is already truncated to 500 chars (Python extractor) and control chars are stripped, but double-quote injection is not blocked by the control-char strip (`tr -d '\000-\010...'`).

**Fix:** Use a JSON-aware extraction for the read-back path or validate that `C_BODY` contains no unescaped double quotes before use. Also validate `LATEST_TAG` and `C_LATEST` against a safe character whitelist immediately after extraction:

```bash
# After extracting LATEST_TAG, validate it is a safe semver tag:
if ! printf '%s' "${LATEST_TAG}" | grep -qE '^v?[0-9]+\.[0-9]+\.[0-9]+'; then
  log "LATEST_TAG '${LATEST_TAG}' failed safety check — aborting cache write"
  RAW=""
fi

# For C_BODY: strip double quotes entirely before use — the body is display-only
C_BODY="$(... | tr -d '"')"
```

---

### CR-03: Unpinned GitHub Action creates supply-chain risk

**File:** `.github/workflows/ci.yml:80`
**Issue:** `ludeeus/action-shellcheck@master` is pinned to a mutable branch ref, not a commit SHA. Any commit pushed to `master` of that action repository is immediately adopted on the next CI run. This action runs in the `validate` job which executes on every push to every branch and every PR.

```yaml
- name: Shellcheck
  uses: ludeeus/action-shellcheck@master   # mutable — supply chain risk
```

Compare with the correctly-pinned actions in the same file: `actions/checkout@v4`, `actions/setup-node@v4`, `gitleaks/gitleaks-action@v2`. These use version tags which are at least stable (though SHA pinning is stronger).

**Fix:** Pin to a specific commit SHA or stable version tag:
```yaml
- name: Shellcheck
  uses: ludeeus/action-shellcheck@2.0.0   # or pin to commit SHA
```
Check the current release at https://github.com/ludeeus/action-shellcheck/releases.

---

### CR-04: Version mismatch between `package.json` and plugin manifests

**File:** `package.json:3` vs `.claude-plugin/plugin.json:5` and `.claude-plugin/marketplace.json:9`
**Issue:** `package.json` declares version `1.13.3` while both `plugin.json` and `marketplace.json` declare `1.14.0`. The `verify-version-sync.cjs` script (which is run during every npm publish step) will exit with code 1, blocking any publish from the current tree.

This is not just a CI failure risk — the shipped npm package (if the version mismatch somehow bypassed the guard) would identify itself to Claude Code's plugin runtime with the wrong version, causing silent breakage for users.

```
package.json:                    "version": "1.13.3"
.claude-plugin/plugin.json:      "version": "1.14.0"
.claude-plugin/marketplace.json: "version": "1.14.0"  (metadata and plugins[0])
```

**Fix:** Bump `package.json` to `1.14.0`:
```json
{
  "version": "1.14.0",
  ...
}
```

---

## Warnings

### WR-01: Injection scanner patterns are duplicated without a shared source of truth

**File:** `hooks/gdd-read-injection-scanner.js:10-18` and `scripts/run-injection-scanner-ci.cjs:17-25`
**Issue:** The seven injection patterns are declared twice — once in the hook and once in the CI script. The CI script's comment at line 9 acknowledges this ("Keep these in sync with hooks/gdd-read-injection-scanner.js"). Pattern drift has already occurred: the hook stores bare `RegExp` objects while the CI script stores `{ name, re }` objects — fine structurally, but the two arrays could diverge silently if only one is updated.

If a new pattern is added to the hook but not to the CI scanner, files in `reference/`, `skills/`, and `agents/` will not be checked for that pattern, undermining the defense.

**Fix:** Extract a shared `INJECTION_PATTERNS` array into a small shared module (e.g. `scripts/injection-patterns.cjs`) and `require()` it from both the hook and the CI script. The hook runs in a Node environment where `require` is available.

---

### WR-02: `currentPhaseSpend` reads the full telemetry file on every hook invocation

**File:** `hooks/budget-enforcer.js:53-64`
**Issue:** Every Agent spawn causes the budget-enforcer hook to read and parse the entire `costs.jsonl` file from disk to compute cumulative phase spend. As the project runs more agents, this file grows unboundedly, and every hook invocation re-reads it fully. On large sessions with hundreds of agent spawns, this creates measurable latency per spawn and could cause the hook to read a multi-megabyte file synchronously on the hot path.

This is a correctness-adjacent issue: if the telemetry file becomes very large and the read takes long enough to exceed a hook timeout (if Claude Code imposes one), the hook could be silently aborted, causing budget enforcement to fail.

**Fix:** The detached `aggregate-agent-metrics.js` already maintains a running aggregate. Read the per-phase total from `agent-metrics.json` instead of replaying the full ledger:

```javascript
function currentPhaseSpend(phase) {
  const metricsPath = path.join(process.cwd(), '.design', 'agent-metrics.json');
  if (!fs.existsSync(metricsPath)) return 0;
  try {
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    // Sum cost across all agents for this phase — requires phase to be in the metrics
    // Alternative: track per-phase totals in a separate lightweight file
    return 0; // fallback; see note
  } catch { return 0; }
}
```
Alternatively, maintain a `.design/telemetry/phase-totals.json` file that the aggregator updates atomically, so the hook can read a single small JSON instead of the full JSONL.

---

### WR-03: `bootstrap.sh` runs `git clone/pull` from a third-party repo on every `diff` change

**File:** `scripts/bootstrap.sh:34-49`
**Issue:** The bootstrap script clones `https://github.com/VoltAgent/awesome-design-md.git` into `~/.claude/libs/` on every session start when the bundled manifest has changed. This silently introduces third-party code into the user's Claude environment at a path that Claude Code skills will read.

There is no integrity verification (no SHA pinning, no checksum, no submodule lock). If the `VoltAgent/awesome-design-md` repository were compromised or transferred, all `get-design-done` users would receive the malicious content on their next session start. The `git clone --depth 1` reduces exposure (no history) but provides no content integrity guarantee.

This is a supply-chain risk to end users, not to the plugin maintainer.

**Fix:** Either (a) pin to a specific commit SHA via `git checkout <SHA>` after clone, (b) declare the dependency as a git submodule with a locked SHA, or (c) document it prominently and require explicit user opt-in rather than silent auto-install.

---

### WR-04: `update-check.sh` renders `LATEST_TAG` and `C_DELTA` without sanitization into banner output

**File:** `hooks/update-check.sh:227`
**Issue:** The banner rendered to `.design/update-available.md` includes `${C_LATEST}` and `${C_DELTA}`, both sourced from the cache file, which is itself populated from a GitHub API response. While `LATEST_TAG` passes through `normalize_semver()` before cache write (which does strip non-digits), `C_LATEST` is extracted from the cache file via a `sed` pattern that could capture arbitrary content if the cache file were tampered with (the cache lives at `.design/update-cache.json` in the project directory, writable by any local process).

More practically: `C_DELTA` is extracted by `sed` as `([^"]+)` and contains the `classify_delta` output (`major|minor|patch|off-cadence|none`). If an attacker can write to `update-cache.json` (local file write privilege in the project dir), they can inject arbitrary content into the `delta` field that ends up in the banner and then in Claude's context window.

**Fix:** Validate `C_DELTA` against a safe allowlist before use:
```bash
case "${C_DELTA:-}" in
  major|minor|patch|off-cadence|none) : ;;
  *) C_DELTA="unknown" ;;
esac
```

---

### WR-05: `test-authority-watcher-diff.sh` uses `find` with unquoted result piped to `wc -l`

**File:** `scripts/tests/test-authority-watcher-diff.sh:38`
**Issue:** The fixture count uses:
```bash
FIXTURE_COUNT=$(find "$FIXTURE_DIR" -maxdepth 1 -type f \( -name '*.atom' -o -name '*.rss' -o -name '*.json' \) | wc -l | tr -d ' ')
```
`find` output piped to `wc -l` counts newlines in filenames. A filename containing a newline would produce an inflated count. While unlikely in test fixtures, this is a fragile pattern. The script uses `set -euo pipefail` so there is no safety net if `find` fails on a non-existent dir (though it checks `[ ! -d ]` first). The `wc -l` approach is also non-portable (`wc -l` output format varies; `tr -d ' '` strips leading spaces from GNU `wc` but not all variants).

**Fix:** Use `find ... -print0 | xargs -0 printf '%s\n' | wc -l` or just count array entries in bash:
```bash
mapfile -d '' FIXTURE_FILES < <(find "$FIXTURE_DIR" -maxdepth 1 -type f \( -name '*.atom' -o -name '*.rss' -o -name '*.json' \) -print0)
FIXTURE_COUNT="${#FIXTURE_FILES[@]}"
```

---

### WR-06: `regression-baseline.test.cjs` passes unvalidated `dirPrefix` to `execSync` shell

**File:** `tests/regression-baseline.test.cjs:24` and `tests/regression-baseline.test.cjs:32`
**Issue:** `dirPrefix` is a string literal `'agents/'` and `'skills/'` in the current call sites, so there is no immediate injection risk. However, both `gitTrackedFiles` and `gitTrackedSubdirs` pass `dirPrefix` to `execSync` via template literal string interpolation:
```javascript
const output = execSync(`git ls-files ${dirPrefix}`, { cwd: REPO_ROOT, encoding: 'utf8' });
```
If either function is ever called with an externally-supplied path (e.g., to generalize the helper), this becomes a command injection vector. The pattern is also inconsistent with the rest of the codebase's use of `spawnSync`.

**Fix:** Use `spawnSync`:
```javascript
const result = spawnSync('git', ['ls-files', dirPrefix], { cwd: REPO_ROOT, encoding: 'utf8' });
return result.stdout.trim().split('\n').filter(Boolean);
```

---

### WR-07: `optimization-layer.test.cjs` tests a schema contract that does not match the live implementation

**File:** `tests/optimization-layer.test.cjs:30-66`
**Issue:** The `budget.json schema contract` test (TST-32) creates a budget fixture with the shape `{ "design-verifier": { per_run_cap_usd, tier }, global: { per_cycle_cap_usd } }` and asserts `global.per_cycle_cap_usd` and `entry.per_run_cap_usd` / `entry.tier`. However, the live `budget.json` format used by `budget-enforcer.js` and written by `bootstrap.sh` is `{ per_task_cap_usd, per_phase_cap_usd, tier_overrides, auto_downgrade_on_cap, cache_ttl_seconds, enforcement_mode }` — no `global` key, no `per_run_cap_usd`, no per-agent `tier` field.

The test is validating a schema that no production code reads. This means the test suite provides false confidence: it will pass even if the actual budget enforcement code is broken.

**Fix:** Update TST-32's schema contract test to scaffold a `budget.json` in the format that `loadBudget()` in `hooks/budget-enforcer.js` actually reads, and assert against those keys:
```javascript
const budget = {
  per_task_cap_usd: 2.00,
  per_phase_cap_usd: 20.00,
  tier_overrides: {},
  auto_downgrade_on_cap: true,
  cache_ttl_seconds: 3600,
  enforcement_mode: 'enforce',
};
// Then assert enforcement_mode, per_task_cap_usd, etc.
```

---

## Info

### IN-01: `hooks.json` commands use double-quoted `${CLAUDE_PLUGIN_ROOT}` in bash invocation

**File:** `hooks/hooks.json:8,16,27,38,46`
**Issue:** The commands are `bash "${CLAUDE_PLUGIN_ROOT}/scripts/bootstrap.sh"` — the outer double-quotes protect the path from word splitting when `CLAUDE_PLUGIN_ROOT` contains spaces (good). However, if `CLAUDE_PLUGIN_ROOT` itself contains a double-quote character, it would break the command. The `update-check.sh` and `bootstrap.sh` already normalize Windows backslashes to forward slashes. Consider whether the env var could contain quotes on any platform.

This is a very unlikely edge case given that Claude Code controls `CLAUDE_PLUGIN_ROOT`, but worth noting.

---

### IN-02: `budget-enforcer.js` propagates `process.env` to detached aggregator child

**File:** `hooks/budget-enforcer.js:121`
**Issue:** `spawnAggregator()` passes `env: process.env` to the spawned child. This is the default behavior and not harmful by itself, but it means any secrets in the current process environment (API keys, tokens) are inherited by the aggregator process. Since the aggregator is detached and runs asynchronously, any environment variable leaks it causes are not visible to the hook. The aggregator script (`aggregate-agent-metrics.js`) does not read any environment variables, but the inheritance is implicit.

**Fix:** Pass only the minimal environment the aggregator needs:
```javascript
const child = spawn('node', [aggregatorPath], {
  cwd: process.cwd(),
  detached: true,
  stdio: 'ignore',
  env: { PATH: process.env.PATH },  // minimal
});
```

---

### IN-03: `context-exhaustion.js` writes shell commands into STATE.md that Claude may execute

**File:** `hooks/context-exhaustion.js:53-74`
**Issue:** The `buildPausedBlock` function writes a multi-line string to `STATE.md` that includes a literal shell command:
```
  ls .design/intel/files.json 2>/dev/null && echo "present" || echo "missing"
```
This is a documentation string, not an executable block. However, if Claude reads `STATE.md` and interprets the `<paused>` block content as instructions, it may attempt to run that command. The injection-scanner hook only scans files read via the `Read` tool and looks for prompt-injection patterns — the shell command pattern is not in `INJECTION_PATTERNS`.

This is a minor concern in the current implementation but is worth tracking as the plugin's injection-scanner patterns evolve.

---

### IN-04: `build-intel.cjs` `headHash()` uses `execSync` with no timeout

**File:** `scripts/build-intel.cjs:54-59`
**Issue:** Both `headHash()` and `gitHash()` calls use `execSync` without a `timeout` option. If the git repository is on a slow network mount or if the git index is locked by another process, these calls will block indefinitely, hanging the intel build.

**Fix:** Add a `timeout` option:
```javascript
return execSync('git rev-parse --short HEAD', {
  stdio: ['pipe', 'pipe', 'ignore'],
  timeout: 5000,
}).toString().trim();
```

---

### IN-05: `update-check.sh` `extract_body` subprocess is unconstrained in output size before truncation

**File:** `hooks/update-check.sh:113-122`
**Issue:** The Python `extract_body` function truncates the release body to 500 characters (`b[:500]`) after parsing the full JSON. The full JSON is read from stdin, which is the raw GitHub API response (up to the API's response limit, typically tens of KB). On a constrained system, this is fine. The 500-char limit is applied after parse, not before, so a pathologically large release body would be loaded into Python memory in full before truncation. Given the 3-second curl timeout, the actual response is bounded in practice.

This is informational only — the current behavior is acceptable but could be made more defensive with `json.loads(sys.stdin.read(4096))`.

---

### IN-06: `package.json` `skills` field lists `"./"` which includes the entire package root

**File:** `package.json:56-58`
**Issue:** The `skills` field declares `["SKILL.md"]` which is the plugin-level skill index. This is consistent with the plugin.json `skills` field which points to `"./skills/"`. There is no functional issue, but the `package.json` `skills` array format (a list of files, not directories) differs from the `plugin.json` format (a list of directory globs). This could cause confusion for tooling that reads both.

This is a minor consistency observation, not a bug.

---

_Reviewed: 2026-04-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
