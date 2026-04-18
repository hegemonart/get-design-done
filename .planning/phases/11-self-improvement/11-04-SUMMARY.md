# Summary 11-04: Discussant Question-Quality Feedback + Global Skills Layer

**Status**: Complete  
**Date**: 2026-04-18

## Delivered

- **`agents/design-discussant.md`** — Step 5 (Answer Quality Logging) added. After each Q&A exchange appends one JSON record to `.design/learnings/question-quality.jsonl`. Classifies quality as high/medium/low/skipped automatically from answer characteristics.
- **`agents/design-reflector.md`** — **Discussant Question Quality** section added. Reads `question-quality.jsonl`, aggregates per question_id, flags (skipped+low)/total > 0.6 across ≥3 cycles, emits `[QUESTION]` proposals.
- **`~/.claude/gdd/global-skills/README.md`** — Global skills directory created at user's Claude config dir. README documents naming convention, how to populate (via `/gdd:apply-reflections`), and scope (inform but don't override project-local decisions).
- **`skills/explore/SKILL.md`** — Step 2.5 extended to also read `~/.claude/gdd/global-skills/*.md` when directory exists. Loaded under `<global_conventions>` sub-block.
- **`skills/plan/SKILL.md`** — Required-reading block extended with global skills glob entry.
- **`skills/design/SKILL.md`** — Pre-execution conventions section extended to include global skills in executor required-reading.

## Acceptance Criteria

- [x] `agents/design-discussant.md` logs answer quality to `.design/learnings/question-quality.jsonl`
- [x] Quality classification (high/medium/low/skipped) is automatic
- [x] `agents/design-reflector.md` has **Discussant Question Quality** section with `[QUESTION]` proposals
- [x] `~/.claude/gdd/global-skills/README.md` exists
- [x] explore, plan, design stages each load global skills when directory exists
- [x] `skills/apply-reflections/SKILL.md` has full `[GLOBAL-SKILL]` promotion flow (delivered in 11-03)
- [x] `SKILL.md` argument-hint includes `reflect` and `apply-reflections` (delivered in 11-01)
