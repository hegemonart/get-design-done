---
name: gdd-update
description: "Update get-design-done to the latest release. Preserves .design/config.json and ./.claude/skills/."
argument-hint: "[--dry-run] [--version <tag>] [--show-privacy-diff]"
tools: Read, Write, Bash
disable-model-invocation: true
---

# gdd-update

Updates the `get-design-done` plugin to the latest release (or a specific tag), preserving user-local state.

## Steps

1. **Pre-flight check** - read current version from `.claude-plugin/plugin.json` (fallback: `plugin.json` at project root). Print current version and, when available, the latest release tag from GitHub.
2. **Dry-run** - if `--dry-run` is passed, print the planned steps and exit without making changes.
3. **Backup** - read `.design/config.json` into memory. Snapshot the file list under `./.claude/skills/` so we can detect collisions later. **Additionally, snapshot the text contents of `scripts/lib/pseudonymize.cjs`, `scripts/lib/issue-reporter/payload-assembly.cjs`, and `scripts/lib/issue-reporter/destination.cjs` to a tempdir (mirroring the same relative paths under that tempdir's root). This is the OLD tree used by the privacy-diff step below. Also read the previous-version string from `.design/privacy-diff-last-version.txt` if it exists, into a variable `prevVersion` (null if the file is absent).** (Plan 30-07 D-09)
4. **Pull update** - run `claude plugin install hegemonart/get-design-done` (or `claude plugin install hegemonart/get-design-done@<tag>` when `--version <tag>` is passed). This re-syncs all plugin files from the release.
5. **Restore config** - write `.design/config.json` back from the in-memory backup. The installer may reset the config to defaults; this step guarantees user settings survive.
5.5. **Privacy diff** - `const pd = require('./scripts/lib/issue-reporter/privacy-diff.cjs');` Compute `showDiff = pd.shouldAutoShow(prevVersion, currentVersion, oldTreeTempdir, repoRoot) || flags.showPrivacyDiff`. If `showDiff` is true: call `pd.computePrivacyDiff(oldTreeTempdir, repoRoot)`, pass the result to `pd.renderPrivacyDiff`, and print the returned markdown to stdout under a clear "## Privacy-critical changes" banner. If `--show-privacy-diff` was passed but `prevVersion === null` (first-ever upgrade), print: "Privacy diff requested but no previous version is recorded. Snapshot file `.design/privacy-diff-last-version.txt` will be written now; the next upgrade will be able to diff against this version." After printing (or skipping), write `currentVersion` to `.design/privacy-diff-last-version.txt` so the next upgrade compares against THIS version. (Plan 30-07 D-09)
6. **Preserve local skills** - `./.claude/skills/` is project-local and outside the plugin tree. Re-list the directory and confirm none of the pre-update files disappeared. Warn loudly if any did.
7. **Post-update advisory** - print:

   > Run `{{command_prefix}}reapply-patches` if you have customized any `reference/` files to restore your modifications.

7.5. **Deprecation advisory** (Phase 39.5) - load the path-migration registry and report anything that
   crossed into `deprecated` or `removed` over the `[prevVersion → currentVersion]` window:

   ```bash
   node -e '
     const fs = require("fs");
     const dr = require("./scripts/lib/deprecation-registry.cjs");
     const entries = dr.parseDeprecations(fs.readFileSync("reference/DEPRECATIONS.md","utf8"));
     const crossed = entries.filter(e =>
       dr.classify(e, currentVersion) !== "pending" &&
       (prevVersion == null || dr.classify(e, prevVersion) !== dr.classify(e, currentVersion)));
     console.log(JSON.stringify(crossed));
   '
   ```

   If any entry crossed, print a `## Deprecations in this update` list (old → new + status) and point
   the user at **`{{command_prefix}}migrate`** to rewrite their local references. If none crossed, say nothing.

8. Print the new version and the changelog URL (`https://github.com/hegemonart/get-design-done/releases`).

## Output

End every invocation with:

```
## UPDATE COMPLETE
```

## Implementation note

The actual update mechanism is the standard `claude plugin install` re-install path. This skill only orchestrates the pre-/post-preservation steps around it.
