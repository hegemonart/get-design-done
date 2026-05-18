---
name: gdd-pr-branch
description: "Create a clean PR branch by filtering out .design/ and .planning/ commits. Code-review-ready branch for the design implementation work."
argument-hint: "[<base-branch>]"
tools: Read, Write, Bash
disable-model-invocation: true
---

# /gdd:pr-branch

Produces a branch that contains only code changes (under `src/`) so reviewers are not forced to read through `.design/` planning churn.

## Steps

1. **Determine base**: Use the argument if provided; otherwise read the current branch's merge base with `main` via `git merge-base HEAD main`.
2. **List commits**: `git log --oneline <base>..HEAD` via Bash.
3. **Classify each commit**: For each SHA, run `git show --name-only <sha>` and inspect the changed paths:
   - **code-only**: all paths under `src/` (or other code dirs, not `.design/` / `.planning/`) → include
   - **design-only**: all paths under `.design/` or `.planning/` → skip
   - **mixed**: both kinds → include and log a note
4. **Get cycle name**: Read `.design/STATE.md` for the current `cycle:` ID (default `cycle-1`).
5. **Create branch**: `git checkout -b pr/<cycle>-clean <base>`.
6. **Cherry-pick**: For every included SHA (in original order), run `git cherry-pick <sha>`. On conflict, abort the whole operation with a clear message and reset to the pre-op branch.
7. **Print summary**: "PR branch `pr/<cycle>-clean` created with <N> commits. `.design/` and `.planning/` commits excluded. Mixed commits flagged: <list>."

## Do Not

- Do not rewrite history on the original branch.
- Do not include `.design/` or `.planning/` paths — if a mixed commit contains them, the cherry-pick carries them through, but reviewers are warned.
- Do not push the branch automatically — let `/gdd:ship` or the user push.

## PR-BRANCH COMPLETE
