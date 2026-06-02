---
name: gdd-reapply-patches
description: "Reapply user modifications to reference/ files after a plugin update. Detects customizations via git diff against pristine baseline."
argument-hint: "[--dry-run]"
tools: Read, Write, Bash
disable-model-invocation: true
---

# gdd-reapply-patches

Re-applies user customizations to `reference/*.md` files after `/gdd:update` resyncs the plugin. Customizations are detected by diffing each `reference/` file against a pristine baseline stored in `.gdd-baseline/`.

## Steps

1. **Detect baseline** — check for `.gdd-baseline/reference/`. If it does not exist, warn the user and offer to initialize it from the current `reference/` state (no diffs will be generated on this run; the next `/gdd:update` will use the new baseline).
2. **Generate diffs** — for each `reference/*.md`, run `git diff --no-index .gdd-baseline/reference/<file> reference/<file>` (or plain `diff -u`). Non-empty diffs are candidate user patches.
3. **Review patches** — for each non-empty diff, print the hunk and ask: `Apply this customization to the updated reference/<file>? (yes/no/view)`. `view` shows the full diff; `yes` queues the patch; `no` skips it.
4. **Apply** — for each confirmed patch, apply it with `patch -p0` or with a targeted `Edit` call. Log every applied patch.
5. **Refresh baseline** — after applying, copy the current `reference/*.md` tree into `.gdd-baseline/reference/` to record the new pristine-for-this-user state.
6. **Dry-run** — if `--dry-run` is passed, perform steps 1–3 but do not apply patches or refresh the baseline.

## Design note

`.gdd-baseline/` is per-install and user-local. It must be gitignored by the host project — it is never committed to the plugin repo.

## Output

End every invocation with:

```
## REAPPLY-PATCHES COMPLETE
```
