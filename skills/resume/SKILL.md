---
name: gdd-resume
description: "Restore session context from .design/HANDOFF.md and route to where work left off."
argument-hint: ""
tools: Read, Write, Bash, Glob
---

@reference/retrieval-contract.md
@reference/cycle-handoff-preamble.md

# /gdd:resume

Inverse of `/gdd:pause`. Reads the handoff file, prints a clear "you were here" summary, and routes to the next command.

## Steps

1. Try to read `.design/HANDOFF.md`. If missing, read `.design/STATE.md` and infer position from the `stage:` and `cycle:` fields.
2. Print a summary in this exact shape:
   ```
   Last paused: <timestamp>
   You were: <in-progress description>
   Next step: <next>
   Active sketch: <path or none>
   Open todos: <N>
   ```
3. **Staleness check** — compare mtime of `.design/` artifacts vs `src/` (via Glob + Bash `stat` when available). If `src/` has commits/changes newer than the last pipeline artifact, warn: "Source has changed since last pipeline run — consider re-running explore or verify."
4. **Route recommendation** based on stage:
   - `brief` → "Run `@get-design-done brief`"
   - `explore` → "Run `@get-design-done explore`"
   - `plan` → "Run `@get-design-done plan`"
   - `design` → "Run `@get-design-done design` to continue"
   - `verify` → "Run `@get-design-done verify`"
5. Do not auto-execute the next command — just recommend.

## Do Not

- Do not delete HANDOFF.md (leave it; next `/gdd:pause` overwrites it).
- Do not modify STATE.md.

## RESUME COMPLETE
