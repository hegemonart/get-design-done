# ultimate-design

## What This Is

A Claude Code plugin providing a self-contained 4-stage design pipeline: `scan → discover → plan → design → verify`. Installed via `claude plugin install hegemonart/ultimate-design` with zero external skill dependencies — all design knowledge is embedded in `reference/` files. v3 advances the project to systematic polish of all pipeline stages plus three new commands: `style`, `darkmode`, and `compare`.

## Core Value

Any developer can run the full pipeline on a real project and receive measurable, specific design improvement — not generic AI advice.

## Requirements

### Validated

- ✓ Self-contained pipeline (no sub-skill dependencies) — v2
- ✓ reference/ system (accessibility, scoring, heuristics, motion, typography, anti-patterns) — v2
- ✓ scan skill: DESIGN.md + DESIGN-DEBT.md artifact production — v2
- ✓ Artifact XML-tagging for downstream extraction — v2
- ✓ --parallel mode via Agent worktrees — v2
- ✓ Plugin validates via `claude plugin validate .` — v2

### Active

**Polish — scan/SKILL.md**
- [ ] Bash grep patterns hardened for Windows paths and non-standard project layouts
- [ ] --full mode per-file component analysis fully specified
- [ ] DESIGN-DEBT.md dependency ordering uses concrete logic (not hand-wavy)
- [ ] Component inventory false-positive rate reduced (beyond grep -rln primitives)

**Polish — discover/SKILL.md**
- [ ] Fallback for non-src layouts (app/, lib/, etc.) in baseline audit bash commands
- [ ] Tailwind-only projects handled in auto mode (no explicit CSS files)
- [ ] Concrete gray areas checklist embedded (font-change risk, token-layer risk, component rebuild vs restyle)

**Polish — plan/SKILL.md**
- [ ] Task Action field has inline examples for parallel-mode agents
- [ ] --research mode re-evaluated and documented (removed in v2, reconsidered for v3)

**Polish — design/SKILL.md**
- [ ] Component task execution guide added (parity with typography, color, accessibility, motion)
- [ ] Decision authority section has clear escalation path (when to ask vs. proceed)
- [ ] oklch color space covered in color task execution guide

**Polish — verify/SKILL.md**
- [ ] NNG heuristics that require visual inspection flagged as `? VISUAL` with explanation
- [ ] Phase 1 re-audit references scan logic rather than duplicating it

**Polish — reference files**
- [ ] audit-scoring.md: additional grep patterns for Visual Hierarchy auto-scoring
- [ ] typography.md: pick-by-brand-archetype quick guide + variable fonts guidance
- [ ] motion.md: Spring physics patterns (React Spring / Framer Motion) + scroll-triggered animations

**New commands**
- [ ] `style` command: component-level design specs / developer handoff (was in v1 as design:design-handoff)
- [ ] `darkmode` command: dedicated dark mode scan mode
- [ ] `compare` command: diff DESIGN.md snapshots over time to track design progress

**Validation**
- [ ] `claude plugin validate .` passes clean after all changes

### Out of Scope

- Marketplace dependencies — plugin stays zero-dependency
- Real-time UI rendering — this is a text-based pipeline, not a visual tool
- OAuth / user accounts — no backend, no auth
- Mobile app — CLI plugin only

## Context

- **Repo:** https://github.com/hegemonart/ultimate-design
- **Current version:** v2.1.0 → shipping v3.0.0
- **Stack:** Claude Code plugin (SKILL.md + hooks + reference files), bash scripts
- **Plugin config:** Skills in `./` (root) + `./skills/`, hooks in `./hooks/hooks.json`
- **Only optional dependency:** refero MCP for pulling reference screenshots in discover
- **Polish source:** Known rough edges catalogued in `.claude/memory/polish_backlog.md`

## Constraints

- **Zero dependencies:** Plugin must work standalone — no external skill installs required
- **Plugin validation:** All changes must keep `claude plugin validate .` green
- **Reference architecture:** New knowledge goes into `reference/` files, not hardcoded in skills
- **Artifact format:** XML-tagged sections must be preserved for pipeline stage compatibility

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-contained reference/ system | Eliminate sub-skill dependency failures | ✓ Good |
| XML-tagging artifact sections | Downstream skills extract only what they need | ✓ Good |
| Agent worktrees for parallel mode | True isolation, no file conflicts | ✓ Good |
| v3 = polish first, then new commands | Clear debt before expanding surface area | — Pending |

---
*Last updated: 2026-04-17 after initialization*
