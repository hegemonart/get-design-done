---
name: gdd-todo
description: "Design backlog — add/list/pick design tasks. Writes to .design/TODO.md."
argument-hint: "<add|list|pick> [text]"
tools: Read, Write, AskUserQuestion
---

# /gdd:todo

**Role:** Design todo list. Three subcommands: `add`, `list`, `pick`. Backing store: `.design/TODO.md`.

## File format

```markdown
# Design Todos

## P0 — Blocking
- [ ] [2026-04-18] Fix contrast ratio on card headers

## P1 — High
- [ ] [2026-04-18] Align Button focus ring with tokens

## P2 — Normal

## P3 — Nice to have
```

Priority is encoded by section, not inline. Status markers: `[ ]` unchecked, `[x]` done, `[-]` `[in-progress]`, `[p]` `[promoted]`.

## Subcommands

### add [text]
If text omitted, use `AskUserQuestion`: "What todo item? (include priority P0-P3 if known)". Parse leading `P[0-3]` token from text; default P2. Append under the right section as:
```
- [ ] [YYYY-MM-DD] <text without priority token>
```
Create TODO.md from the template above if missing.

### list
Read `.design/TODO.md`. Print all `- [ ]` and `- [-]` items grouped by priority section, with index numbers.

### pick
Read `.design/TODO.md`. Collect unchecked items. Use `AskUserQuestion` to let the user pick one. Rewrite the chosen line as:
```
- [-] [YYYY-MM-DD] [in-progress] <original text>
```
Print "Picked: <item>".

## Constraints

- Do not modify files outside `.design/`.
- Preserve existing sections and ordering on write.

## TODO COMPLETE
