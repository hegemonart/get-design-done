# Requirements: ultimate-design v3

**Defined:** 2026-04-17
**Revised:** 2026-04-17 (added agent layer, state machine, connections, distribution cleanup)
**Core Value:** Any developer can run the full pipeline on a real project and receive measurable, specific design improvement — not generic AI advice.

## v1 Requirements

### Distribution Cleanup

- [x] **DIST-01**: `.gitignore` excludes `.planning/`, `.claude/memory/`, `.claude/settings.local.json` — dev artifacts stay local
- [x] **DIST-02**: `.planning/` and `.claude/memory/` removed from git tracking via `git rm --cached` (plugin distribution stays clean)
- [x] **DIST-03**: README.md documents what the plugin distributes (SKILL.md, skills/, agents/, reference/, connections/, hooks/, scripts/) vs what is dev-only

### Platform Foundation

- [x] **PLAT-01**: All bash grep patterns use POSIX-compatible syntax (`-E` with `|`) instead of GNU-only `\|`
- [x] **PLAT-02**: `grep` calls across all skills include `-E` flag and work on macOS, Windows Git Bash, and Linux
- [x] **PLAT-03**: `.gitattributes` enforces LF line endings for all `*.md` and `*.sh` files
- [x] **PLAT-04**: Bootstrap script path normalization works on Windows (no hardcoded Unix paths)

### State Machine

- [x] **STATE-01**: `.design/STATE.md` template defined (stage, wave, task progress, locked decisions, must-have status, blockers, timestamps) — a single source of pipeline truth
- [x] **STATE-02**: Every pipeline stage reads `.design/STATE.md` at entry and writes an updated version at completion
- [x] **STATE-03**: Resume capability — stages detect mid-wave state from STATE.md and continue from the last checkpoint without restarting

### Agent Infrastructure

- [x] **AGENT-00**: `agents/` directory created with `README.md` documenting agent architecture, completion marker conventions, required_reading pattern, frontmatter schema, and how stages invoke agents

### Core Agents (Phase 1 of agent layer)

- [x] **AGENT-01**: `agents/design-planner.md` — reads DESIGN-CONTEXT.md → produces DESIGN-PLAN.md with wave-ordered tasks, `Touches:` and `Parallel:` fields, acceptance criteria per task
- [x] **AGENT-02**: `agents/design-executor.md` — executes one plan task, makes atomic commit (`feat(design-NN): ...`), writes `.design/tasks/task-NN.md`, applies deviation rules
- [x] **AGENT-03**: `agents/design-verifier.md` — goal-backward verification against must-haves, spawns design-fixer if gaps, iterates until pass or escalate
- [x] **AGENT-04**: `agents/design-phase-researcher.md` — pre-plan research on design patterns for the project type (SaaS, dashboard, e-commerce, etc.)
- [x] **AGENT-05**: `agents/design-plan-checker.md` — validates DESIGN-PLAN.md will achieve brief goals before execution (goal-backward on plan, not on code)

### Stage Wrapper Rewrites

- [x] **STAGE-01**: `skills/discover/SKILL.md` becomes a thin orchestrator that spawns design-context-builder + design-context-checker (no inline interview logic in the skill). Note: Phase 2 scope — minimal STATE.md wrapper preserving v2.1.0 interview logic verbatim; design-context-builder + design-context-checker spawns added in Phase 3 (AGENT-08).
- [x] **STAGE-02**: `skills/plan/SKILL.md` becomes an orchestrator that spawns design-phase-researcher (optional) + design-pattern-mapper + design-planner + design-plan-checker. Note: Phase 2 scope — spawns design-phase-researcher (optional) + design-planner + design-plan-checker; design-pattern-mapper spawn added in Phase 3 (AGENT-09).
- [x] **STAGE-03**: `skills/design/SKILL.md` becomes an orchestrator that spawns design-executor agents per task with wave coordination and parallel/sequential routing
- [x] **STAGE-04**: `skills/verify/SKILL.md` becomes an orchestrator that spawns design-auditor + design-verifier + design-integration-checker. Note: Phase 2 scope — spawns design-verifier only; design-auditor + design-integration-checker spawns added in Phase 3 (AGENT-10, AGENT-11).

### Quality Gate Agents (Phase 2 of agent layer)

- [x] **AGENT-06**: `agents/design-context-builder.md` — detects existing design system state, asks only unanswered questions, produces DESIGN-CONTEXT.md with `<decisions>`, `<must_haves>`, `<canonical_refs>`, `<constraints>`, `<deferred>` sections
- [x] **AGENT-07**: `agents/design-context-checker.md` — validates DESIGN-CONTEXT.md before planning (6 quality dimensions: copy specificity, color contract, typography scale, spacing scale, registry safety, must-have testability)
- [x] **AGENT-08**: `agents/design-auditor.md` — retroactive audit against 6 pillars (copy, visuals, color, typography, spacing, experience) with 1–4 scores and priority fix list
- [x] **AGENT-09**: `agents/design-pattern-mapper.md` — maps existing design patterns in codebase before planning (colors in use, spacing tokens, component conventions) — brownfield-critical
- [x] **AGENT-10**: `agents/design-assumptions-analyzer.md` — surfaces hidden design assumptions with evidence quotes and confidence levels before discover asks questions
- [x] **AGENT-11**: `agents/design-integration-checker.md` — verifies design decisions are wired through code post-execution (not just described in DESIGN-SUMMARY.md)

### Connections Layer

- [x] **CONN-00**: `connections/` directory created with `connections.md` (index, capability matrix, extensibility guide for adding future connections)
- [x] **CONN-01**: `connections/figma.md` — Figma MCP setup instructions + per-tool capability coverage (`get_variable_defs`, `get_design_context`, `get_screenshot`) + which stages use each
- [x] **CONN-02**: `connections/refero.md` — Refero MCP setup (migrated from `reference/refero.md`), fallback behavior when unavailable
- [x] **CONN-03**: Figma MCP integrated into scan stage — reads design tokens if available, logs source provenance
- [x] **CONN-04**: Figma MCP integrated into discover stage — pre-populates `<decisions>` from Figma variables when available
- [x] **CONN-05**: Refero MCP integrated into discover stage — pulls reference screenshots for R-01/R-02 collection with graceful fallback to awesome-design-md
- [x] **CONN-06**: Connection availability detection in every stage — stages check for MCP presence before calling tools and document in STATE.md which connections were used

### Scan Polish

- [x] **SCAN-01**: Component inventory detection replaced with a more accurate pattern (reduce false positives from `grep -rln`)
- [x] **SCAN-02**: `--full` mode per-file component analysis is fully specified with concrete output format
- [x] **SCAN-03**: DESIGN-DEBT.md dependency ordering uses concrete logic (priority score = severity weight × effort weight, tiebreak by file count)
- [x] **SCAN-04**: Fallback paths handle non-standard layouts (app/, lib/, pages/, src/) without breaking

### Discover Polish

- [x] **DISC-01**: Baseline audit bash commands fall back gracefully when `src/` does not exist (checks app/, lib/, pages/ in order)
- [x] **DISC-02**: Auto mode detects Tailwind-only projects (no CSS files) and adjusts audit commands accordingly
- [x] **DISC-03**: Gray areas checklist is concrete and embedded: font-change risk, token-layer introduction risk, component rebuild vs restyle decision

### Plan Polish

- [x] **PLAN-01**: Task Action field includes inline examples for parallel-mode agents (self-contained prompt templates)
- [x] **PLAN-02**: `--research` mode is documented — either re-added with defined scope or explicitly removed with rationale

### Design Polish

- [x] **DSGN-01**: Component task execution guide added (matching depth of typography, color, accessibility, motion guides)
- [x] **DSGN-02**: Decision authority section defines clear escalation path: proceed autonomously / flag and proceed / stop and ask
- [x] **DSGN-03**: Color task execution guide covers oklch color space (12–18% L for dark mode, chroma desaturation rules)

### Verify Polish

- [x] **VRFY-01**: NNG heuristics that require visual inspection are flagged `? VISUAL` with clear explanation of why
- [x] **VRFY-02**: Phase 1 re-audit references shared grep patterns rather than duplicating scan logic verbatim

### Reference File Polish

- [x] **REF-01**: `reference/audit-scoring.md` — additional grep patterns for Visual Hierarchy auto-scoring
- [x] **REF-02**: `reference/typography.md` — pick-by-brand-archetype quick guide (3–5 archetypes with recommended pairings)
- [x] **REF-03**: `reference/typography.md` — variable fonts section added (axis guidance, fallback strategy)
- [x] **REF-04**: `reference/motion.md` — spring physics patterns for React Spring and Framer Motion
- [x] **REF-05**: `reference/motion.md` — scroll-triggered animation guidance (threshold, once vs repeat, performance)

### Automation Agents (Phase 3 of agent layer)

- [ ] **AGENT-12**: `agents/design-fixer.md` — applies fix list from DESIGN-VERIFICATION.md gaps atomically with per-fix commits, enables verify→fix loop without manual re-planning
- [x] **AGENT-13**: `agents/design-advisor.md` — researches a single gray area with a 5-column comparison table + rationale (called from discover when gray areas need more than judgment)
- [x] **AGENT-14**: `agents/design-doc-writer.md` — generates handoff docs / component specs from DESIGN-SUMMARY.md (powers the `style` command)

### style Command

- [x] **STYL-01**: `style` command exists at `skills/style/SKILL.md` and is routed from root `SKILL.md`
- [x] **STYL-02**: `style` produces `.design/DESIGN-STYLE-[ComponentName].md` per component (not a flat file)
- [x] **STYL-03**: Post-pipeline mode: invokes design-doc-writer agent with DESIGN-SUMMARY.md as input
- [x] **STYL-04**: Pre-pipeline fallback mode: invokes design-doc-writer with DESIGN.md + source file for current-state spec
- [x] **STYL-05**: Output includes: spacing tokens, color tokens, typography scale, component states, AI-slop detection flag, token semantic health score (raw-hex-in-components ratio)

### darkmode Command

- [x] **DARK-01**: `darkmode` command exists at `skills/darkmode/SKILL.md` and is routed from root `SKILL.md`
- [x] **DARK-02**: Detects dark mode implementation architecture (CSS custom properties, Tailwind `dark:`, JS class toggle) before auditing
- [x] **DARK-03**: Audits contrast of all text/background pairs in dark context (WCAG 4.5:1 body, 3:1 large)
- [x] **DARK-04**: Checks semantic token dark mode overrides exist for all color tokens used in light mode
- [x] **DARK-05**: Detects dark-specific anti-patterns: images/SVGs without dark variant, pure-black backgrounds (BAN-05 in dark context), forced-colors media query absence
- [x] **DARK-06**: Checks `color-scheme` meta property and `prefers-color-scheme` media query presence
- [x] **DARK-07**: Produces `.design/DARKMODE-AUDIT.md` (separate from DESIGN.md — read-only, no score writeback)

### compare Command

- [ ] **COMP-01**: `compare` command exists at `skills/compare/SKILL.md` and is routed from root `SKILL.md`
- [ ] **COMP-02**: Scoped to delta between existing `DESIGN.md` baseline score and current `DESIGN-VERIFICATION.md` scores (no snapshot mechanism required)
- [ ] **COMP-03**: Outputs: score delta per category, anti-pattern delta (resolved vs new), must-have pass/fail change
- [ ] **COMP-04**: Flags design drift: score regression in a category not covered by any explicit design task in `DESIGN-PLAN.md`
- [ ] **COMP-05**: Produces `.design/COMPARE-REPORT.md`

### Validation

- [ ] **VAL-01**: `claude plugin validate .` passes clean after all v3 changes
- [ ] **VAL-02**: Root `SKILL.md` argument-hint, Command Reference table, and Jump Mode section all updated for style/darkmode/compare
- [ ] **VAL-03**: Plugin version bumped to 3.0.0 in all manifest files (`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`)

## v2 Requirements

### Future agents

- **V2-01**: design-debugger agent (investigates design regressions with evidence + fix hypothesis) — defer until design-fixer exists and shows patterns
- **V2-02**: design-intel-updater (maintains `.design/intel/` knowledge base for fast lookups) — defer until pipeline stabilizes
- **V2-03**: design-completeness-auditor (Nyquist-style must-have evidence validator) — defer; design-verifier + design-integration-checker cover v3 needs

### Future commands

- **V2-04**: `--research` mode for plan stage (complex projects) — deferred pending scope definition
- **V2-05**: Dark mode score writeback to DESIGN.md — deferred (two-sources-of-truth risk)
- **V2-06**: Multi-snapshot compare (DESIGN.md snapshot naming convention) — deferred; v3 uses simpler baseline-vs-verification approach
- **V2-07**: `darkmode` fix execution — deferred; fixes belong in design skill's color task

### Future connections

- **V2-08**: Storybook MCP — component inventory + story state audit
- **V2-09**: Linear MCP — create design debt tickets from DESIGN-DEBT.md
- **V2-10**: GitHub MCP — open PRs from design task commits

### Reference expansions

- **V2-11**: oklch exact chroma desaturation ratios (verified against browser rendering) — needs empirical validation
- **V2-12**: Brand archetype expansion beyond 5 archetypes

## Out of Scope

| Feature | Reason |
|---------|--------|
| CI/CD integration | Plugin is an audit tool, not a pipeline runner |
| Real-time UI rendering | Text-based pipeline, no visual tool |
| Figma file writing | Read-only integration; no bidirectional sync |
| Code generation / auto-fix for non-accessibility | Audit and spec only — implementation belongs to design skill |
| Mobile app | CLI plugin only |
| External skill dependencies | Zero-dependency constraint is a hard requirement |
| Chromatic / Storybook integration | Out of scope for v3; competitive positioning deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | Phase 1 | Complete |
| DIST-02 | Phase 1 | Complete |
| DIST-03 | Phase 1 | Complete |
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| PLAT-04 | Phase 1 | Complete |
| STATE-01 | Phase 1 | Complete |
| STATE-02 | Phase 1 | Complete |
| STATE-03 | Phase 1 | Complete |
| AGENT-00 | Phase 1 | Complete |
| CONN-00 | Phase 1 | Complete |
| SCAN-04 | Phase 1 | Complete |
| AGENT-01 | Phase 2 | Complete |
| AGENT-02 | Phase 2 | Complete |
| AGENT-03 | Phase 2 | Complete |
| AGENT-04 | Phase 2 | Complete |
| AGENT-05 | Phase 2 | Complete |
| STAGE-01 | Phase 2 | Complete |
| STAGE-02 | Phase 2 | Complete |
| STAGE-03 | Phase 2 | Complete |
| STAGE-04 | Phase 2 | Complete |
| AGENT-06 | Phase 3 | Complete |
| AGENT-07 | Phase 3 | Complete |
| AGENT-08 | Phase 3 | Complete |
| AGENT-09 | Phase 3 | Complete |
| AGENT-10 | Phase 3 | Complete |
| AGENT-11 | Phase 3 | Complete |
| SCAN-01 | Phase 3 | Complete |
| SCAN-02 | Phase 3 | Complete |
| SCAN-03 | Phase 3 | Complete |
| DISC-01 | Phase 3 | Complete |
| DISC-02 | Phase 3 | Complete |
| DISC-03 | Phase 3 | Complete |
| PLAN-01 | Phase 3 | Complete |
| PLAN-02 | Phase 3 | Complete |
| DSGN-01 | Phase 3 | Complete |
| DSGN-02 | Phase 3 | Complete |
| DSGN-03 | Phase 3 | Complete |
| VRFY-01 | Phase 3 | Complete |
| VRFY-02 | Phase 3 | Complete |
| REF-01 | Phase 3 | Complete |
| REF-02 | Phase 3 | Complete |
| REF-03 | Phase 3 | Complete |
| REF-04 | Phase 3 | Complete |
| REF-05 | Phase 3 | Complete |
| CONN-01 | Phase 4 | Complete |
| CONN-02 | Phase 4 | Complete |
| CONN-03 | Phase 4 | Complete |
| CONN-04 | Phase 4 | Complete |
| CONN-05 | Phase 4 | Complete |
| CONN-06 | Phase 4 | Complete |
| AGENT-12 | Phase 5 | Pending |
| AGENT-13 | Phase 5 | Complete |
| AGENT-14 | Phase 5 | Complete |
| STYL-01 | Phase 5 | Complete |
| STYL-02 | Phase 5 | Complete |
| STYL-03 | Phase 5 | Complete |
| STYL-04 | Phase 5 | Complete |
| STYL-05 | Phase 5 | Complete |
| DARK-01 | Phase 5 | Complete |
| DARK-02 | Phase 5 | Complete |
| DARK-03 | Phase 5 | Complete |
| DARK-04 | Phase 5 | Complete |
| DARK-05 | Phase 5 | Complete |
| DARK-06 | Phase 5 | Complete |
| DARK-07 | Phase 5 | Complete |
| COMP-01 | Phase 5 | Pending |
| COMP-02 | Phase 5 | Pending |
| COMP-03 | Phase 5 | Pending |
| COMP-04 | Phase 5 | Pending |
| COMP-05 | Phase 5 | Pending |
| VAL-01 | Phase 6 | Pending |
| VAL-02 | Phase 6 | Pending |
| VAL-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 73 total
- Mapped to phases: 73
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-17*
*Last updated: 2026-04-17 after agent layer + state machine + connections + distribution expansion*
