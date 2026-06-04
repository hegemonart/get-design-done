---
name: gdd-list-pins
description: "Lists pinned skill aliases per harness with their source skill and pin timestamp. Use when you want to see which gdd skills have been pinned as standalone shortcuts and where."
tools: Read, Bash
---

# /gdd:list-pins

**Role:** Show every pinned skill alias across the installed harness `skills/` directories. For each one, report the harness it lives in, the on-disk alias directory name, the source skill it points at (from the `<!-- gdd-pinned-skill source=<skill> -->` marker), and when it was pinned (the file modification time).

## Steps

1. **Run the list CLI.** Invoke the shipped script (it takes no arguments). The plugin root resolves via `CLAUDE_PLUGIN_ROOT` (falling back to the current directory when that variable is absent):

    ```bash
    node "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/scripts/lib/pin/cli.cjs" list
    ```

    The CLI scans each harness `skills/` directory under the current project, finds the stubs carrying the gdd pin marker, and prints one line per pinned alias in the form `[<config-dir>] <alias> -> source=<skill> (pinned <timestamp>)`.

2. **Report the result.** Relay the CLI output verbatim. Exit codes: 0 means one or more pinned aliases were found, 1 means none were found (nothing has been pinned yet), 2 means an error.

## Do Not

- Do not scan the harness directories by hand. The CLI already enforces the marker check, so only genuine gdd pins are listed.

## LIST-PINS COMPLETE
