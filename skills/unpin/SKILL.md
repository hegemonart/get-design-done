---
name: gdd-unpin
description: "Removes pinned skill aliases across harness dirs, deleting only stubs that carry the gdd pin marker. Use when you no longer want a pinned shortcut and want hand-written skills left untouched."
argument-hint: "<skill-name>"
tools: Read, Bash
---

# /gdd:unpin

**Role:** Remove the pinned shortcut aliases for one gdd skill from every installed harness `skills/` directory. Only stubs that carry the marker line `<!-- gdd-pinned-skill source=<skill> -->` as their first non-empty line are deleted, so a hand-authored or unrelated SKILL.md is never touched.

## Steps

1. **Read the argument.** The skill name to unpin comes from `$ARGUMENTS` (for example `darkmode`). If it is empty, ask the user which skill to unpin and stop.

2. **Run the unpin CLI.** Invoke the shipped script, passing the skill name. The plugin root resolves via `CLAUDE_PLUGIN_ROOT` (falling back to the current directory when that variable is absent):

    ```bash
    node "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/scripts/lib/pin/cli.cjs" unpin "<skill-name>"
    ```

    The CLI scans every harness `skills/` directory under the current project, checks each candidate stub for the gdd pin marker, deletes the ones that carry it, and refuses (skips with a warning) any file that does not.

3. **Report the result.** The CLI prints one line per harness it removed a stub from, plus a warning for any file it refused to delete. Relay that summary verbatim. Exit codes: 0 means at least one stub was removed, 1 means nothing was removed (no matching pinned stubs found), 2 means an error.

## Do Not

- Do not delete skill files by hand. Always go through the CLI so the marker check protects hand-written skills.
- Do not force-remove a file the CLI refused. A refusal means the file lacks the gdd pin marker and is not a pinned alias; leave it in place.

## UNPIN COMPLETE
