---
name: gdd-update
description: "Update get-design-done to the latest release. Preserves .design/config.json and ./.claude/skills/."
argument-hint: "[--dry-run] [--version <tag>]"
tools: Read, Write, Bash
disable-model-invocation: true
---

# gdd-update

Updates the `get-design-done` plugin to the latest release (or a specific tag), preserving user-local state.

## Steps

1. **Pre-flight check** — read current version from `.claude-plugin/plugin.json` (fallback: `plugin.json` at project root). Print current version and, when available, the latest release tag from GitHub.
2. **Dry-run** — if `--dry-run` is passed, print the planned steps and exit without making changes.
3. **Backup** — read `.design/config.json` into memory. Snapshot the file list under `./.claude/skills/` so we can detect collisions later.
4. **Pull update** — run `claude plugin install hegemonart/get-design-done` (or `claude plugin install hegemonart/get-design-done@<tag>` when `--version <tag>` is passed). This re-syncs all plugin files from the release.
5. **Restore config** — write `.design/config.json` back from the in-memory backup. The installer may reset the config to defaults; this step guarantees user settings survive.
6. **Preserve local skills** — `./.claude/skills/` is project-local and outside the plugin tree. Re-list the directory and confirm none of the pre-update files disappeared. Warn loudly if any did.
7. **Post-update advisory** — print:

   > Run `/gdd:reapply-patches` if you have customized any `reference/` files to restore your modifications.

8. Print the new version and the changelog URL (`https://github.com/hegemonart/get-design-done/releases`).

## Output

End every invocation with:

```
## UPDATE COMPLETE
```

## Implementation note

The actual update mechanism is the standard `claude plugin install` re-install path. This skill only orchestrates the pre-/post-preservation steps around it.
