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

## Step 4 — Inline glossary maintenance (CONTEXT.md)

When a fuzzy phrase is resolved into a sharper term, or a new domain concept is named
during the interview: write to `./CONTEXT.md` IMMEDIATELY (do NOT batch). Use the schema
in `./../../reference/context-md-format.md` — H2 heading per term, body paragraph,
optional `**Aliases:**` line for term-merging. Multi-context repos use `CONTEXT-MAP.md`
plus per-area `<area>/CONTEXT.md`. CONTEXT.md is lazy-created on the first term write.

## Step 5 — Session wrap: ADR-offer scan

For each decision recorded this session, check ALL three criteria from
`./../../reference/adr-format.md`: (a) **hard-to-reverse**, (b) **surprising-without-context**,
(c) **real-tradeoff**. If ALL three hold, offer to author `docs/adr/NNNN-<slug>.md`. If
ANY criterion fails, the decision stays in STATE.md `<decisions>`. Routine choices are
NEVER auto-promoted.

## Step 6 — Report

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
