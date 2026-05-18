---
name: zoom-out
description: "Asks the agent to go up a layer of abstraction and map the relevant modules and callers using the project's CONTEXT.md vocabulary. Use when the user is working in an unfamiliar area of code and needs orientation before deep work."
disable-model-invocation: true
argument-hint: "[scope]"
---

Source: mattpocock/skills (MIT) — adapted with permission. See `../NOTICE` for the full attribution block.

# Zoom Out

**Role:** Give the user a map, not a fix.

I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary (`CONTEXT.md`) vocabulary.

When invoked, produce a one-screen map that names:

1. **Modules in scope** — one-line description of each, using terms from `CONTEXT.md` (see `./../reference/context-md-format.md` for the schema). Do not invent terms.
2. **Callers** — who calls these modules from elsewhere, with file paths.
3. **Seams** — where data crosses module boundaries, named per `./../reference/architecture-vocabulary.md`.

Do not propose fixes. Do not write code. The output is a map.

If `CONTEXT.md` is absent, suggest `/gdd:discuss` to start one, but still produce the map using basenames and inferred terms.

## ZOOM-OUT COMPLETE
