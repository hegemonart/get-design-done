---
name: hone-pin
description: "Writes standalone shortcut aliases for a gdd skill across installed harness skill dirs. Use when you want a skill directly discoverable as its own command in every installed runtime."
argument-hint: "<skill-name>"
tools: Read, Bash
---

# /hone:pin

**Role:** Write a standalone shortcut alias (a small SKILL.md stub) for one gdd skill into every installed harness `skills/` directory, so that skill is directly discoverable as its own command in each runtime (Claude Code, Codex, Cursor, Gemini, and the rest).

Each pinned stub starts with the marker line `<!-- gdd-pinned-skill source=<skill> -->`, then carries frontmatter (name, description, argument-hint, tools) pulled from the manifest source of truth, then a one-line body pointing back at the canonical skill. Stubs are written atomically (temp file plus rename), so a failed write never leaves a half-written file.

## Steps

1. **Read the argument.** The skill name to pin comes from `$ARGUMENTS` (for example `darkmode`). If it is empty, ask the user which skill to pin and stop.

2. **Run the pin CLI.** Invoke the shipped script, passing the skill name. The plugin root resolves via `CLAUDE_PLUGIN_ROOT` (falling back to the current directory when that variable is absent):

    ```bash
    node "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/scripts/lib/pin/cli.cjs" pin "<skill-name>"
    ```

    The CLI detects every harness `skills/` directory that exists under the current project (`.claude/skills`, `.cursor/skills`, and so on) and writes the stub into each. Pass `--user` to also create the harness directories that do not exist yet:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT:-$(pwd)}/scripts/lib/pin/cli.cjs" pin "<skill-name>" --user
    ```

3. **Report the result.** The CLI prints one line per harness it wrote to, plus any skips. Relay that summary verbatim. Exit codes: 0 means at least one stub was written, 1 means nothing was written (no harness dirs found, suggest `--user`), 2 means an error (for example an unknown skill name).

## Do Not

- Do not hand-write the stub files. Always go through the CLI so the marker, the manifest-sourced frontmatter, and the atomic write stay consistent.
- Do not pin a skill that is not in the manifest. The CLI rejects unknown skill names with exit code 2; surface that error rather than inventing a stub.

## PIN COMPLETE
