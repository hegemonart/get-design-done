---
name: gdd-undo
description: "Safe design change revert. Uses git log to find design commits, checks dependencies, reverts safely."
argument-hint: "[<commit SHA>]"
tools: Read, Write, Bash, AskUserQuestion
disable-model-invocation: true
---

# /gdd:undo

Safe rollback for design-related commits. Uses git history plus file-overlap dependency checks before reverting.

## Steps

1. **List candidates**: Run `git log --oneline -n 20 --grep="design\|feat\|fix"` via Bash. Filter for commits whose scope matches phase prefixes (`design(`, `feat(07`, etc.) or touch files under `src/` related to design changes.
2. **Present choice**: If no SHA was passed as argument, print the last 10 design-related commits and ask (AskUserQuestion): "Which commit to undo? (or enter commit SHA)"
3. **Dependency scan**: For the chosen SHA, run `git show --name-only <sha>` to get touched files. Then run `git log <sha>..HEAD --name-only` to find later commits that modified any of those same files. These are potential dependencies.
4. **Dependency decision**:
   - If none found: proceed to step 5.
   - If found: print "Reverting this commit may break: <later commits>. Proceed anyway? (yes/no)" and abort on "no".
5. **Stage the revert**: Run `git revert <sha> --no-commit`. Show the resulting diff via `git diff --cached`.
6. **Confirm**: Ask (AskUserQuestion): "Apply this revert? (yes/no)"
7. **Commit or abort**: On yes, `git commit -m "revert: <original subject>"`. On no, `git reset` to unstage.

## Do Not

- Do not force-push.
- Do not revert commits on `main` without the user confirming branch context.
- Do not silently skip dependency warnings.

## UNDO COMPLETE
