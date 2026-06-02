---
name: gdd-spike-wrap-up
description: "Close a spike — capture findings, write decision to STATE.md, update SUMMARY.md."
argument-hint: "[slug]"
tools: Read, Write, Glob, AskUserQuestion
---

# Get Design Done — Spike Wrap-Up

**Role:** Close an open spike — capture the verdict, write findings, record a D-XX decision in STATE.md so `plan` sees it when creating tasks. See `./reference/cycle-handoff-preamble.md` for the cycle-handoff framing this archive feeds into.

## Step 1 — Find spike

- Glob `.design/spikes/*/`.
- If `[slug]` provided → use it directly.
- If multiple pending (no `FINDINGS.md`) → AskUserQuestion: "Which spike are you wrapping up?"
- If none → print `No open spikes. Run /gdd:spike first.` and exit.

## Step 2 — Re-surface hypothesis

Read `.design/spikes/<slug>/HYPOTHESIS.md`. Show the hypothesis + success/failure criteria to the user.

## Step 3 — Elicit findings

AskUserQuestion in sequence:

1. "Did it meet success criteria? (yes / no / partial)"
2. "What was learned? (1–3 sentences)"
3. "Recommendation? (adopt / reject / needs more investigation)"

## Step 4 — Write FINDINGS.md

Write `.design/spikes/<slug>/FINDINGS.md`:

```markdown
# Findings: <slug>

**Verdict**: yes / no / partial
**Recommendation**: adopt / reject / needs more investigation
**Completed**: YYYY-MM-DD HH:MM

## What was learned
<1–3 sentences>

## Next steps
<1–2 bullets>
```

## Step 5 — Record decision in STATE.md

Append under `<decisions>`: `D-XX: spike/<slug> — <verdict> — <recommendation>\n  Rationale: <one line>\n  Source: .design/spikes/<slug>/FINDINGS.md`. Compute `D-XX` as max existing `D-NN` + 1 (scan for `D-\d+:`, zero-pad to 2 digits). Prefer MCP `gdd_state` typed mutator when available: `mcp__gdd_state__add_decision({id, text, status:"locked"})`.

## Step 6 — Append `<prototyping>` outcome to STATE.md

Coupled with Step 5 — both must succeed so the spike resolution surfaces in `<decisions>` (downstream stages) and `<prototyping>` (planner via decision-injector). Use **same `D-XX`**. Append under `<prototyping>`: `<spike slug="<slug>" cycle="<cycle>" decision="D-XX" verdict="yes|no|partial" status="resolved"/>`. `<cycle>` from STATE.md frontmatter (`cycle:` field; empty string valid for single-cycle Wave A); `verdict` from Step 3.

If `<prototyping>` block does not exist, materialize between `<must_haves>` and `<connections>` per STATE template; append `<spike …/>` as first child.

Prefer MCP typed mutator (byte-identical output): `mcp__gdd_state__add_prototyping({type:"spike", slug, cycle, decision:"D-XX", verdict, status:"resolved"})`. Without MCP, edit `.design/STATE.md` directly via Read + Write.

## Step 7 — Update spikes SUMMARY.md

Append to `.design/spikes/SUMMARY.md` (create if missing):

```
- <slug> (YYYY-MM-DD) — verdict: <yes|no|partial> — recommendation: <adopt|reject|more> — D-XX
```

## After writing

```
━━━ Spike wrapped ━━━
Slug: <slug>
Verdict: <verdict>
Decision recorded: D-XX
Prototyping entry: <spike slug="<slug>" cycle="<cycle>" decision="D-XX" verdict="<verdict>" status="resolved"/>
FINDINGS.md written.
━━━━━━━━━━━━━━━━━━━━
```

## Do Not

- Do not delete the `scratch/` directory — it's a record of what was tried.
- Do not promote scratch code to `src/` automatically — require a follow-up plan task.

## SPIKE-WRAP-UP COMPLETE
