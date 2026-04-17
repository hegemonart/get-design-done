---
name: design philosophy behind ultimate-design skill decisions
description: The "why" behind how skills are written — tone, level of specificity, what to avoid
type: feedback
---

# Design Philosophy — How Skills Should Be Written

**Why:** These decisions were made over multiple sessions to ensure the pipeline produces
real design improvement, not performative process.

## Core principle: Real data, not vibes

Skills must reference specific, measurable thresholds — not general advice.
- ✓ "body text contrast ≥ 4.5:1" 
- ✗ "ensure good contrast"
- ✓ "line-height 1.5–1.75 on body"
- ✗ "use comfortable line height"

## Skills execute directly, don't route to sub-skills

The v1 mistake: skills that just said "run impeccable-audit" with no embedded knowledge.
That's not a skill, that's a shortcut with a dependency. Every skill must be able to
execute its task from reference files alone.

## GSD pipeline model (adapted for design)

The pipeline is modeled on GSD (Get Shit Done) planning framework:
- Each stage: clear inputs → processing → locked outputs
- Artifacts are in XML-tagged sections (`<domain>`, `<decisions>`, `<must_haves>`) 
  so downstream skills can extract only what they need
- Goal-backward verification: must-haves are defined early, checked at the end
- Gray areas are surfaced explicitly in discover (not papered over with defaults)

## Scan is an initializer, not a pipeline stage

scan runs once, produces reference artifacts (DESIGN.md, DESIGN-DEBT.md).
The pipeline (discover→plan→design→verify) runs iteratively.
scan should never be required — the pipeline works without it.

## Anti-pattern catalog philosophy

Anti-patterns have two tiers:
- BAN: never acceptable, always flag, always fix (−3 points each)
- SLOP: AI-slop tells that signal no design thought happened (−1 point each)

The "AI-Slop Test": "if I told someone AI made this, would they believe me immediately?"
If yes → redo. This is the primary quality gate, not a checklist.

The reflex font list and AI-default palette (#6366f1 + #8b5cf6 + #06b6d4) are the most
reliable slop detectors — these appear in 80%+ of AI-generated UIs.

## User questioning style in discover

- Push back on generic brand words ("modern", "clean") — demand specific
- The NOT is as important as the tone words
- Gray areas need explicit resolution before planning, not defaults
- One focused question per area, not a list of 10 sub-questions
