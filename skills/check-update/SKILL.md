---
name: gdd-check-update
description: "Manual plugin-update check. Shows cached state by default; --refresh bypasses the 24h TTL; --dismiss hides the nudge until a newer release ships; --prompt spawns design-update-checker for a richer summary."
argument-hint: "[--refresh] [--dismiss] [--prompt]"
tools: Read, Write, Bash, Task
---

# /gdd:check-update

**Role:** Manual entry point for the plugin-update checker. The SessionStart hook (`hooks/update-check.sh`) already runs on its own 24h cadence and writes `.design/update-cache.json` + `.design/update-available.md`. This command lets the user inspect / force / dismiss / enrich that state on demand.

## Flags

| Flag | Effect |
|---|---|
| *(none)* | Print cached state (latest_tag, delta, is_newer). If the cache is older than 24h, trigger `--refresh` implicitly. |
| `--refresh` | Invoke `hooks/update-check.sh --refresh` — bypasses the 24h TTL and re-fetches immediately. |
| `--dismiss` | Write `update_dismissed: "<latest_tag>"` to `.design/config.json` atomically and delete `.design/update-available.md`. Sticky until a newer release ships. |
| `--prompt` | Spawn `design-update-checker` agent (Haiku) to produce a 3–5-line "what this release changes for you" summary. Does not alter the banner or cache. |

Flags can be combined: `--refresh --prompt` is valid (re-fetch, then enrich). `--dismiss` is the only flag that mutates `.design/config.json`.

## Steps

1. **Parse flags.** Detect `--refresh`, `--dismiss`, `--prompt` in `$ARGUMENTS`. Any unknown flag: print `Unknown flag: <flag>` and exit.

2. **--refresh path** (if `--refresh` in flags):
    Run the hot-path hook with the refresh flag:
    ```bash
    bash "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/hooks/update-check.sh" --refresh
    ```
    This re-fetches `/releases/latest`, rewrites `.design/update-cache.json`, and re-renders `.design/update-available.md` subject to the same state/dismissal gates.

3. **Read cache.** After any optional refresh, read `.design/update-cache.json`. If it does not exist:
    - Print: `No cache. Network may be unreachable or the hook has not run yet. Try /gdd:check-update --refresh.`
    - Exit.

4. **Dismiss path** (if `--dismiss` in flags):
    Compute new config contents and write atomically. The python heredoc receives CONFIG_PATH and LATEST_TAG via the ENVIRONMENT (env-prefix form — `KEY=VALUE python3 <<PY`), NOT via trailing argv. Passing `python3 -c '...' KEY=VALUE` makes Python treat the assignments as `sys.argv`, which the old draft did incorrectly; env-prefix form is the portable fix.

    ```bash
    CONFIG_PATH=".design/config.json"
    LATEST_TAG="$(grep -E '"latest_tag"' .design/update-cache.json | head -n1 | sed -E 's/.*"latest_tag"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    [ -n "$LATEST_TAG" ] || { echo 'No latest_tag in cache — nothing to dismiss.'; exit 0; }

    mkdir -p .design

    # Env-prefix form: CONFIG_PATH and LATEST_TAG are placed into the child process env,
    # then python3 reads them via os.environ. Heredoc body is flat at column 0 (required —
    # any leading indentation breaks Python parsing in a heredoc).
    CONFIG_PATH="$CONFIG_PATH" LATEST_TAG="$LATEST_TAG" python3 <<'PY'
import json, os, sys, tempfile

config_path = os.environ['CONFIG_PATH']
latest_tag = os.environ['LATEST_TAG']

# Load existing config if present; otherwise start fresh. Preserve every unknown key.
try:
    with open(config_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if not isinstance(data, dict):
        data = {}
except (FileNotFoundError, json.JSONDecodeError):
    data = {}

# Set ONLY the dismissal key — every other pre-existing key is preserved verbatim.
data['update_dismissed'] = latest_tag

# Atomic write: write to tmp on the SAME filesystem, then os.replace() (POSIX rename(2)).
target_dir = os.path.dirname(config_path) or '.'
fd, tmp_path = tempfile.mkstemp(prefix='config.', suffix='.tmp', dir=target_dir)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    os.replace(tmp_path, config_path)  # atomic on same filesystem
except Exception as exc:
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
    sys.exit(1)
PY

    # Remove the rendered banner (user dismissed — stop showing it until a newer release ships).
    rm -f .design/update-available.md
    echo "Dismissed $LATEST_TAG. The nudge will return when a newer release ships."
    ```

    D-14 atomic-write invariant: `os.replace()` (POSIX `rename(2)`) is atomic on the same filesystem — an interrupted write leaves the original config intact. The `json.load → set single key → json.dump` round-trip guarantees every unknown top-level key (e.g. `model_profile`, `parallelism`) is preserved verbatim.

5. **Print default state** (always, unless the skill exited early):
    ```
    ━━━ /gdd:check-update ━━━
    Current:   v<X.Y.Z>
    Latest:    v<A.B.C>   (delta: <major|minor|patch|off-cadence|none>)
    Newer:     <true|false>
    Checked:   <ISO time of checked_at>
    Dismissed: <tag or "no">
    ━━━━━━━━━━━━━━━━━━━━━━━━━━
    ```
    Parse these fields from `.design/update-cache.json` using `grep + sed` (no jq dependency). Read dismissal from `.design/config.json` via the same pattern as hooks/update-check.sh:
    ```bash
    [ -f .design/config.json ] && grep -E '"update_dismissed"' .design/config.json | sed -E 's/.*"update_dismissed"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
    ```

6. **--prompt path** (if `--prompt` in flags):
    Spawn the `design-update-checker` agent via the Task tool. Pass as context:
    - `current_tag` — from `.design/update-cache.json`
    - `latest_tag` — from `.design/update-cache.json`
    - `delta` — from `.design/update-cache.json`
    - `release_body` — the `changelog_excerpt` from the cache (may be pre-truncated to 500 chars; that's fine — the agent knows)

    Display the agent's inline response verbatim below the state banner. The agent ends with `## UPDATE-CHECKER COMPLETE` — the skill's own completion marker (below) is the final line.

## Defaults

- No flags → behave as: `--refresh (only if cache >24h old) → print state`. Silent no-op if cache is fresh and there is no newer version.

## Do Not

- Do not fetch from GitHub in this skill directly — always go through `hooks/update-check.sh --refresh` so the caching + state-guard + dismissal logic stays in one place.
- Do not modify `.design/update-available.md` except to delete it on `--dismiss`. The hot-path hook is the only writer of that banner (D-06).
- Do not rewrite `.design/config.json` wholesale — the atomic python rewrite preserves every unknown key (D-14).
- Do not pass variables to the python heredoc via trailing `KEY=VALUE` argv — that assigns to `sys.argv`, not `os.environ`. Use env-prefix form only.

## Completion marker

Last line of output:

```
## CHECK-UPDATE COMPLETE
```
