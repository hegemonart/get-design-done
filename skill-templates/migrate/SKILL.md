---
name: gdd-migrate
description: "Migrates a project off GDD's own deprecated paths after an upgrade. Reads the machine-readable registry in reference/DEPRECATIONS.md (via scripts/lib/deprecation-registry.cjs), scans the project's .design/config.json + any local skill/agent references for paths that are now deprecated or removed at the installed version, and PREVIEWS a diff before changing anything. Interactive by default (confirm per change); --yes auto-applies; --dry-run previews only. Read-first, never silent. Use after {{command_prefix}}update flags a breaking change."
argument-hint: "[--yes] [--dry-run]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# {{command_prefix}}migrate

Closes the GDD-on-GDD gap: when GDD moves or removes its own paths (e.g. the Phase 31.5
`scripts/lib/**` → `sdk/**` reorg), a project that referenced the old paths needs updating. This skill
consults the deprecation registry, finds the stale references **in this project**, and rewrites them -
**after showing you the diff**. It never edits silently. Contract: `../../reference/DEPRECATIONS.md`.

## Invocation

| Command | Behavior |
|---|---|
| `{{command_prefix}}migrate` | Scan + preview every applicable migration, then confirm each before applying. |
| `{{command_prefix}}migrate --dry-run` | Preview only - print the diff, change nothing. |
| `{{command_prefix}}migrate --yes` | Apply every applicable migration without the per-change prompt (still prints what changed). |

## Steps

1. **Resolve the installed version** from `.claude-plugin/plugin.json` (`version`).
2. **Load the registry.** Parse `reference/DEPRECATIONS.md` with the pure helper:

   ```bash
   node -e '
     const fs = require("fs");
     const dr = require("./scripts/lib/deprecation-registry.cjs");
     const entries = dr.parseDeprecations(fs.readFileSync("reference/DEPRECATIONS.md","utf8"));
     const version = require("./.claude-plugin/plugin.json").version;
     // Only entries that are deprecated/removed at the installed version are actionable.
     const actionable = entries.filter(e => dr.classify(e, version) !== "pending");
     console.log(JSON.stringify({ version, actionable }));
   '
   ```

3. **Scan the project** for each actionable entry's `Old` path:
   - `.design/config.json` (string values referencing an old path),
   - project-local skill/agent references (`grep` the repo, excluding `.git/`, `node_modules/`, and
     GDD's own `reference/DEPRECATIONS.md`),
   - any `require(...)`/import of a removed SDK path.
   For a code rewrite, scaffold the edit with `scripts/lib/migration/codemod-gen.cjs` (Phase 39.1) -
   you emit the change as a reviewable patch, you do not run a codemod engine.
4. **Preview.** Print a unified-diff-style preview per file: `Old → New`, the registry status
   (`deprecated` vs `removed`), and the migration hint. If `--dry-run`, stop here.
5. **Confirm + apply.** Without `--yes`, ask per change. With `--yes`, apply all. Use `Write` to make
   the edits; never touch a file the user didn't consent to.
6. **Report.** Summarize: files changed, references rewritten, and any `removed`-status reference that
   still has no replacement wired (flag it loudly - that one breaks at the installed version).

## Boundaries

- **Preview-first.** Nothing changes before you've shown the diff (or `--yes` was passed).
- Migrates **this project's references** to GDD paths - it does not rewrite GDD's own source, and it
  never performs a downgrade (reverse migrations are out of scope).
- Read the registry; never invent a migration that isn't in `reference/DEPRECATIONS.md`.

## Record

Print a `## Migration summary` (version, actionable entries, files changed, unresolved `removed`
references) and append one JSONL line to `.design/intel/insights.jsonl` recording the migration run.
Close with:

```
## MIGRATE COMPLETE
```
