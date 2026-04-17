---
name: ultimate-design project context
description: What this plugin is, its architecture, why it's built the way it is, current version state
type: project
---

# ultimate-design Plugin — Project Context

**Repo:** https://github.com/hegemonart/ultimate-design
**Current version:** 2.1.0
**Owner:** hegemonart

## What It Is

A Claude Code plugin that provides a self-contained 4-stage design pipeline:
`scan → discover → plan → design → verify`

Installed via: `claude plugin install hegemonart/ultimate-design`

## Architecture — Key Decisions

**Why self-contained (no sub-skill dependencies):**
The original v1 depended on `impeccable` and `ui-ux-pro-max` skills. These had sub-skills
(impeccable-audit, impeccable-typeset, impeccable-colorize, etc.) which required those plugins
to be installed separately. The user wanted zero dependencies so the plugin works standalone.
All design knowledge was extracted from those skills and embedded in `reference/` files.

**The reference/ system:**
Instead of routing to external skills, all stages read from embedded reference files:
- `reference/accessibility.md` — full WCAG 2.1 AA spec + checklists
- `reference/audit-scoring.md` — 7-category weighted scoring system (A–F grades)
- `reference/heuristics.md` — NNG 10 heuristics (0–4 scoring), Gestalt, Fitts, Hick, Miller
- `reference/motion.md` — Emil Kowalski's animation framework (5-question decision sequence)
- `reference/typography.md` — modular scale systems, 50+ curated font pairings by use case
- `reference/anti-patterns.md` — BAN-01..09 with grep patterns, SLOP-01..12 (AI-slop tells)
- `reference/priority-matrix.md` — 10-category priority matrix (kept from v1)
- `reference/checklists.md` — pre-delivery checklists (kept from v1)
- `reference/review-format.md` — review output format (kept from v1)
- `reference/refero.md` — refero MCP usage guide (optional dependency)

**Pipeline artifact flow:**
Each stage produces a file that the next stage reads:
- scan → `DESIGN.md` + `.design/DESIGN-DEBT.md`
- discover → `.design/DESIGN-CONTEXT.md` (has `<domain>`, `<audience>`, `<goals>`, `<brand>`, `<references>`, `<decisions>`, `<constraints>`, `<canonical_refs>`, `<must_haves>`, `<baseline_audit>`)
- plan → `.design/DESIGN-PLAN.md` (wave-ordered tasks with `Touches:` and `Parallel:` fields for --parallel mode)
- design → `.design/DESIGN-SUMMARY.md` (merged from `.design/tasks/task-NN.md` per-task files)
- verify → `.design/DESIGN-VERIFICATION.md` (category scores + NNG scores + must-have results + gap plan)

**Why the scan skill exists:**
Added as a "codescan equivalent for design" — runs before the pipeline to map the existing
design system without requiring a user interview. Produces DESIGN.md (snapshot) and
DESIGN-DEBT.md (prioritized backlog with P0–P3 severity + XS–XL effort estimates).
Key feature: "quick wins" (P1 severity + XS/S effort) tagged with ⚡.

**--parallel mode:**
Plan stage adds `Touches:` and `Parallel:` fields per task. Design stage partitions Wave 1
into a "parallel batch" (non-conflicting tasks) spawned as concurrent `Agent(isolation: "worktree")`
calls, plus a "sequential tail" for conflicting tasks. Wave 2+ always sequential.

**Only optional dependency:** refero MCP for pulling reference screenshots during discover.

## Plugin Config

- Skills: `./` (root SKILL.md) + `./skills/` (stage sub-skills)
- Hooks: `./hooks/hooks.json` (SessionStart → bootstrap.sh for awesome-design-md)
- No marketplace dependencies
- Validated: `claude plugin validate .` passes

## What Was Extracted From Previous Dependencies

From `impeccable`: BAN list (border-left on cards, gradient text), font reflex list,
visual anti-pattern catalog, motion anti-patterns, UX copy anti-patterns.

From `emil-design-eng`: The full animation decision framework — 5 questions in order
(should animate at all? purpose? easing? duration? only transform+opacity?),
frequency table (100+/day = never animate), press feedback rules (scale 0.95–0.98),
stagger rules (30–50ms, cap at 6–8 items), exit = 60–70% of enter duration.

From `ui-ux-pro-max`/`anthropic-skills`: NNG 10 heuristics with 0–4 scoring,
Gestalt principles, Fitts/Hick/Miller laws, Von Restorff, Jakob's Law, Zeigarnik effect.
