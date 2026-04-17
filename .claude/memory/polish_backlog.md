---
name: polish backlog — known rough edges in ultimate-design
description: Things that are known to need improvement, not yet done
type: project
---

# Polish Backlog

**Why:** Track known rough edges so future sessions can continue without re-discovering them.
**How to apply:** When the user says "let's polish" or "what needs work", start here.

## Known Rough Edges

### Skills

**discover/SKILL.md:**
- Baseline audit bash commands assume `src/` directory exists — needs fallback for other layouts (app/, lib/, etc.)
- Auto mode doesn't yet handle Tailwind-only projects that have no explicit CSS files
- Gray area identification is currently described but not given a concrete list of common gray areas to always check (font change risk, token layer introduction risk, component rebuild vs. restyle)

**plan/SKILL.md:**
- No `--research` mode (was in v1, was removed in v2 rebuild) — could be valuable for complex projects
- Task Action field is described as "self-contained" but no examples are given inline — agents spawned in parallel mode may need more context

**design/SKILL.md:**
- Color task execution guide doesn't cover oklch color space specifically (only mentions hex/rgb)
- The "decision authority" section is vague — needs a clearer escalation path (when to ask vs. proceed)
- Component task type has no execution guide (unlike typography, color, accessibility, motion which all have guides)

**scan/SKILL.md:**
- Bash grep patterns are not tested — may fail on Windows paths or non-standard project structures
- `--full` mode is described but the per-file component analysis isn't detailed
- The recommended fix order algorithm in DESIGN-DEBT.md is hand-wavy — no concrete logic for how to determine dependency ordering
- Component inventory uses `grep -rln` for primitive detection — could produce false positives

**verify/SKILL.md:**
- NNG heuristic scoring requires reading the codebase to infer H-02 (real world match), H-06 (recognition vs recall), H-07 (flexibility/efficiency) — these are hard to score from code alone without running the app; should note when to mark as ? VISUAL
- Phase 1 re-audit uses same bash commands as scan — could import or reference scan logic rather than duplicating

### Reference Files

**reference/audit-scoring.md:**
- Visual Hierarchy (weight 20%) is the hardest to auto-score — the rubric is valid but the auto-checkable items are thin; needs more concrete grep patterns

**reference/typography.md:**
- Font pairings list doesn't have a "pick by brand archetype" quick guide — users have to read the whole list
- No guidance on variable fonts

**reference/motion.md:**
- Spring physics section is mentioned but not elaborated (React Spring / Framer Motion specific patterns)
- No guidance on scroll-triggered animations specifically

## Not Started Yet

- A `style` guide command for generating component-level design specs (the "handoff" phase that was in v1's design:design-handoff)
- Dark mode audit as a dedicated scan mode
- A `compare` command for diffing DESIGN.md snapshots over time
- Integration with the awesome-design-md bootstrap to pull brand archetypes into scan

## What's Working Well (don't break)

- The reference file system — self-contained, readable, specific
- The BAN/SLOP two-tier anti-pattern structure with grep patterns
- The weighted scoring formula and grade table in audit-scoring.md
- The NNG heuristic 0–4 scoring rubric in heuristics.md
- The pipeline artifact XML-tagged format (makes it easy for agents to extract sections)
- The --parallel mode architecture (conflict detection via Touches: fields)
