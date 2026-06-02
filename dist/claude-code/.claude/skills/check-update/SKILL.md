---
name: gdd-check-update
description: "Manual plugin-update check. Shows cached state by default; --refresh bypasses the 24h TTL; --dismiss hides the nudge until a newer release ships; --prompt spawns design-update-checker for a richer summary."
argument-hint: "[--refresh] [--dismiss] [--prompt]"
tools: Read, Write, Bash, Task
---

# /gdd:check-update

**Role:** Manual entry point for the plugin-update checker. The SessionStart hook (`hooks/update-check.sh`) already runs on its own 24h cadence and writes `.design/update-cache.json` + `.design/update-available.md`. This command lets the user inspect / force / dismiss / enrich that state on demand. See `./reference/heuristics.md` §"Version-cadence" for the off-cadence / preview-suffix handling background.

## Flags

| Flag | Effect |
|------|--------|
| *(none)* | Print cached state. If cache is older than 24h, trigger `--refresh` implicitly. |
| `--refresh` | Invoke `hooks/update-check.sh --refresh` — bypasses the 24h TTL and re-fetches immediately. |
| `--dismiss` | Write `update_dismissed: "<latest_tag>"` to `.design/config.json` atomically and delete `.design/update-available.md`. Sticky until a newer release ships. |
| `--prompt` | Spawn `design-update-checker` agent (Haiku) to produce a 3–5-line "what this release changes for you" summary. Does not alter the banner or cache. |

Flags combine: `--refresh --prompt` is valid (re-fetch, then enrich). `--dismiss` is the only flag that mutates `.design/config.json`.

## Steps

1. **Parse flags.** Detect `--refresh`, `--dismiss`, `--prompt` in `$ARGUMENTS`. Unknown flag → `Unknown flag: <flag>` and exit.

2. **`--refresh` path** (if set):

    ```bash
    bash "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/hooks/update-check.sh" --refresh
    ```

    This re-fetches `/releases/latest`, rewrites `.design/update-cache.json`, and re-renders `.design/update-available.md` subject to state/dismissal gates.

3. **Read cache.** After any optional refresh, read `.design/update-cache.json`. If missing: print `No cache. Network may be unreachable or the hook has not run yet. Try /gdd:check-update --refresh.` and exit.

4. **`--dismiss` path** (if set): Compute new config contents and write atomically via the env-prefix Python heredoc pattern below. The pattern is load-bearing — passing variables as trailing `KEY=VALUE` argv treats them as `sys.argv`, not `os.environ`. Use env-prefix form only.

    ```bash
    CONFIG_PATH=".design/config.json"
    LATEST_TAG="$(grep -E '"latest_tag"' .design/update-cache.json | head -n1 | sed -E 's/.*"latest_tag"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
    [ -n "$LATEST_TAG" ] || { echo 'No latest_tag in cache — nothing to dismiss.'; exit 0; }
    mkdir -p .design
    CONFIG_PATH="$CONFIG_PATH" LATEST_TAG="$LATEST_TAG" python3 <<'PY'
    import json, os, sys, tempfile
    config_path = os.environ['CONFIG_PATH']
    latest_tag = os.environ['LATEST_TAG']
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict): data = {}
    except (FileNotFoundError, json.JSONDecodeError): data = {}
    data['update_dismissed'] = latest_tag
    target_dir = os.path.dirname(config_path) or '.'
    fd, tmp_path = tempfile.mkstemp(prefix='config.', suffix='.tmp', dir=target_dir)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2); f.write('\n')
        os.replace(tmp_path, config_path)
    except Exception:
        try: os.unlink(tmp_path)
        except OSError: pass
        sys.exit(1)
    PY
    rm -f .design/update-available.md
    echo "Dismissed $LATEST_TAG. The nudge will return when a newer release ships."
    ```

    D-14 atomic-write invariant: `os.replace()` (POSIX `rename(2)`) is atomic on the same filesystem. The `json.load → set single key → json.dump` round-trip preserves every unknown top-level key (e.g. `model_profile`, `parallelism`) verbatim.

5. **Print default state** (always, unless exited early):

    ```
    ━━━ /gdd:check-update ━━━
    Current:   v<X.Y.Z>
    Latest:    v<A.B.C>   (delta: <major|minor|patch|off-cadence|none>)
    Newer:     <true|false>
    Checked:   <ISO time of checked_at>
    Dismissed: <tag or "no">
    ━━━━━━━━━━━━━━━━━━━━━━━━━━
    ```

    Parse fields from `.design/update-cache.json` via `grep + sed` (no jq dep). Read dismissal from `.design/config.json` via the same pattern as `hooks/update-check.sh`.

6. **`--prompt` path** (if set): Spawn `design-update-checker` via Task tool with context `{current_tag, latest_tag, delta, release_body}`. Display response verbatim below the banner. Agent ends with `## UPDATE-CHECKER COMPLETE`.

## Do Not

- Do not fetch from GitHub directly — always go through `hooks/update-check.sh --refresh` so caching + state-guard + dismissal logic stays in one place.
- Do not modify `.design/update-available.md` except to delete on `--dismiss`.
- Do not rewrite `.design/config.json` wholesale — the atomic Python rewrite preserves every unknown key (D-14).
- Do not pass variables to the Python heredoc via trailing `KEY=VALUE` argv — env-prefix form only.

## Completion marker

```
## CHECK-UPDATE COMPLETE
```
