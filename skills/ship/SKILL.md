---
name: gdd-ship
description: "Post-verify PR flow — creates a clean PR branch, invokes code review check, and prepares the PR for merge."
argument-hint: "[--title <PR title>] [--draft]"
tools: Read, Write, Bash, AskUserQuestion, Task
---

# /gdd:ship

Closes the verify → merge gap: runs `/gdd:pr-branch` for a clean branch, assembles a PR body from design artifacts, and creates the PR via `gh`.

## Steps

1. **Pre-flight verify check**: Check that `.design/DESIGN-VERIFICATION.md` exists and shows a pass. If missing or failing, ask: "Verify has not completed / failed. Ship anyway? (yes/no)"
2. **Clean branch**: Invoke `/gdd:pr-branch` to produce a branch with only `src/` commits (no `.design/` or `.planning/` noise). Use the resulting branch for the PR.
3. **PR title**: Use `--title` argument if given, otherwise ask (AskUserQuestion): "PR title?"
4. **PR body**: Auto-generate from:
   - Goals section of `.design/DESIGN-PLAN.md`
   - Summary of `.design/DESIGN-VERIFICATION.md` (per-task pass/fail)
   - Top-line audit score from `.design/DESIGN-AUDIT.md` if present
   Format as Markdown with `## Goals`, `## Verification`, `## Audit` sections.
5. **Create PR**: Run `gh pr create --title "<title>" --body "<body>" [--draft]` via Bash. If `gh` is not installed, print the full body and instruct the user to create the PR manually.
6. **Print PR URL** on success.

## Do Not

- Do not push to `main`/`master` directly.
- Do not include `.design/` or `.planning/` files in the PR branch — that is `/gdd:pr-branch`'s job.
- Do not skip the verify pre-flight silently — always surface a failure and ask.

## Step 7 — Update notice (post-closeout surface)

ONLY on the success path — after the PR has been created and the URL has been printed — emit the plugin-update banner. If PR creation failed earlier, skip this step (do not suggest upgrades in the middle of a PR-creation failure).

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## SHIP COMPLETE
