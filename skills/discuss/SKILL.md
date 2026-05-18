---
name: gdd-discuss
description: "Adaptive design interview command that spawns design-discussant in normal / --all / --spec mode to gather decisions via one-question-at-a-time AskUserQuestion, writing D-XX entries to STATE.md <decisions>. Use when locking design decisions outside the main pipeline or backfilling missing context."
argument-hint: "[topic] [--all] [--spec] [--cycle <name>]"
tools: Read, Write, Task
---

# /gdd:discuss

**Role:** You are the `/gdd:discuss` command. You spawn the `design-discussant` agent with the right mode and context.

## Step 1 — Read state

Read `.design/STATE.md`. Note:
- Current `cycle:` frontmatter value
- Highest existing `D-XX` number under `<decisions>`

If `.design/STATE.md` does not exist, tell the user to run `/gdd:brief` first and stop.

## Step 2 — Parse arguments

Inspect `$ARGUMENTS`:
- Free-text before flags → `<topic>`
- `--all` → batch gray-areas mode
- `--spec` → Socratic ambiguity scoring mode
- `--cycle <name>` → scope decisions to that cycle

## Step 3 — Spawn design-discussant

```
Task("design-discussant", """
<required_reading>
@.design/STATE.md
@.design/BRIEF.md
@.design/DESIGN-CONTEXT.md
@./.claude/skills
</required_reading>

<mode>{normal|--all|--spec}</mode>
<topic>{topic or omit}</topic>
<cycle>{cycle-name or omit}</cycle>

Run an adaptive design interview. Append D-XX decisions to STATE.md <decisions> block.
Emit `## DISCUSS COMPLETE` when done.
""")
```

Use only the modes the user actually passed. Missing flags → `<mode>normal</mode>`.

## Step 4 — Report

Wait for `## DISCUSS COMPLETE`. Re-read STATE.md. Count new D-XX entries since Step 1. Print:

```
━━━ Discuss complete ━━━
New decisions: N (D-XX through D-YY)
Mode: normal | --all | --spec
Cycle: <name or "default">
━━━━━━━━━━━━━━━━━━━━━━━━
```

## Constraints

- Do not run the interview yourself — always spawn the agent.
- Do not touch files outside `.design/`.

## DISCUSS COMMAND COMPLETE
