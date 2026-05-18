---
name: gdd-plant-seed
description: "Forward-looking design idea with a trigger condition. Seeds surface automatically when trigger is met. Writes to .design/SEEDS.md."
argument-hint: "[--trigger <condition>] [text]"
tools: Read, Write, AskUserQuestion
disable-model-invocation: true
---

# /gdd:plant-seed

**Role:** Capture an idea that is too early to act on now but should surface when a future condition is met. Backing store: `.design/SEEDS.md`.

## Step 1 — Gather inputs

- `<text>`: free-text idea. If empty, ask the user: "What's the seed idea?"
- `--trigger <condition>`: the surfacing condition. If missing, ask: "What trigger condition should surface this idea? (e.g., 'when we add dark mode', 'when the nav component is redesigned', 'at next cycle start')"

## Step 2 — Append to .design/SEEDS.md

Create the file with `# Design Seeds` header if missing. Append:

```markdown
## Seed: <first 60 chars of text>
**Trigger**: <condition>
**Planted**: YYYY-MM-DD
**Status**: dormant

<full text>

---
```

## Step 3 — Surfacing contract

Seeds are surfaced automatically by `/gdd:progress` and `/gdd:health`. Those commands do a keyword match of each seed's trigger text against current STATE.md + `.design/CYCLES.md` content and print any matches as `Seed ready to germinate: <text>`.

This skill does NOT surface seeds itself — it only plants them.

## Output

```
━━━ Seed planted ━━━
Trigger: when we add dark mode
Status: dormant
━━━━━━━━━━━━━━━━━━━━
```

## PLANT-SEED COMPLETE
