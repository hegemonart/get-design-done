---
name: gdd-note
description: "Zero-friction idea capture during any stage. Appends to .design/NOTES.md. Subcommands: add, list, promote."
argument-hint: "<add|list|promote> [text|line-number]"
tools: Read, Write
disable-model-invocation: true
---

# /gdd:note

**Role:** Ephemeral design notes. Zero ceremony — no priority, no due date. Backing store: `.design/NOTES.md`.

## File format

```markdown
# Design Notes

- [2026-04-18 04:55] Consider revisiting the card border-radius after Phase 7 ships
- [2026-04-18 05:10] [promoted → todo] Try a glassmorphism treatment for the sidebar
```

## Subcommands

### add [text]
Create `.design/NOTES.md` with header if missing. Append one line:
```
- [YYYY-MM-DD HH:MM] <text>
```
If text omitted, append a blank timestamped entry for the user to fill later:
```
- [YYYY-MM-DD HH:MM] 
```

### list
Read `.design/NOTES.md`. Print each note line with its line number for use with `promote`.

### promote [line-number]
Read the note at that line. Delegate to `/gdd:todo add` by writing a new P2 entry into `.design/TODO.md` directly (format: `- [ ] [YYYY-MM-DD] <text>` under `## P2 — Normal`). Rewrite the original note line in NOTES.md with `[promoted → todo]` prefix before the text:
```
- [2026-04-18 05:10] [promoted → todo] <original text>
```

## Constraints

- Never overwrite prior notes on `add`.
- Preserve exact line order on `promote`.

## NOTE COMPLETE
