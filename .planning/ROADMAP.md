# Roadmap: ultimate-design v3

## Overview

v3 transforms ultimate-design from a linear pipeline into a GSD-style agent-orchestrated system. The pipeline keeps its five stages (scan → discover → plan → design → verify), but each stage becomes a thin orchestrator that spawns specialized agents — modeled on GSD's planner/executor/verifier/checker pattern. Phase 1 lays the foundation (cross-platform bash, distribution cleanup, explicit state machine, agent + connection scaffolding). Phase 2 builds the 5 core agents and rewrites the stages to use them. Phase 3 adds 6 quality-gate agents plus clears the existing polish backlog. Phase 4 formalizes Figma and Refero as connections with a plug-in model for future ones. Phase 5 ships 3 automation agents plus the three new commands (style, darkmode, compare). Phase 6 validates and bumps to 3.0.0.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation + Distribution + Infrastructure** — Cross-platform bash, gitignore cleanup, state machine, agents/ + connections/ scaffolding
 (completed 2026-04-17)
- [x] **Phase 2: Core Agents + Stage Orchestration** — 5 core agents (planner, executor, verifier, phase-researcher, plan-checker) + 4 stage wrapper rewrites (completed 2026-04-17)
- [x] **Phase 3: Quality Gate Agents + Pipeline Polish** — 6 quality gate agents + existing backlog polish (completed 2026-04-17)
- [ ] **Phase 4: Connections Layer** — Figma MCP, Refero MCP, extensibility pattern
- [ ] **Phase 5: Automation Agents + New Commands** — 3 automation agents + style + darkmode + compare
- [ ] **Phase 6: Validation + Version Bump** — Plugin validate, smoke test, version 3.0.0

## Phase Details

### Phase 1: Foundation + Distribution + Infrastructure
**Goal**: Plugin repo is clean for user distribution, bash patterns are cross-platform, an explicit state machine exists, and the agents/ + connections/ scaffolding is in place for Phase 2
**Depends on**: Nothing (first phase)
**Requirements**: DIST-01, DIST-02, DIST-03, PLAT-01, PLAT-02, PLAT-03, PLAT-04, STATE-01, STATE-02, STATE-03, AGENT-00, CONN-00, SCAN-04
**Success Criteria** (what must be TRUE):
  1. Fresh `git clone` of the plugin repo contains no `.planning/`, no `.claude/memory/`, no `.claude/settings.local.json` — the user gets only what the plugin distributes
  2. Running any pipeline stage on macOS or Windows Git Bash produces the same grep match counts as on Linux (no silent false-negatives)
  3. `.gitattributes` enforces LF line endings and `git status` shows no unexpected diffs after checkout on Windows
  4. `.design/STATE.md` is initialized after scan; all subsequent stages read and update it — a killed session resumes from the last checkpoint
  5. `agents/README.md` and `connections/connections.md` exist and define the conventions for Phase 2+
**Plans**: 5 plans (1 gap closure)

Plans:
- [ ] 01-01-PLAN.md — Distribution cleanup: .gitignore additions, untrack .planning/ and .claude/memory/, README Distribution section (DIST-01/02/03)
- [ ] 01-02-PLAN.md — Cross-platform bash: .gitattributes LF enforcement, bootstrap.sh Windows path normalization, POSIX grep migration in scan+verify SKILL.md, SCAN-04 source-root fallback (PLAT-01/02/03/04, SCAN-04)
- [ ] 01-03-PLAN.md — State machine template: reference/STATE-TEMPLATE.md with XML sections and write contract (STATE-01/02/03)
- [ ] 01-04-PLAN.md — Infrastructure scaffolding: agents/README.md authoring contract, connections/connections.md capability matrix, git mv refero.md → connections/ (AGENT-00, CONN-00)
- [ ] 01-05-PLAN.md — Gap closure: migrate 6 residual grep -rn patterns in scan/verify SKILL.md to POSIX ERE with -E flag + POSIX word-boundary replacement (PLAT-02, re-opened)

### Phase 2: Core Agents + Stage Orchestration
**Goal**: The pipeline runs through specialized agents — discover/plan/design/verify become thin orchestrators that spawn the right agent for each sub-task, matching GSD's planner/executor/verifier pattern
**Depends on**: Phase 1 (needs state machine + agent scaffolding)
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, STAGE-01, STAGE-02, STAGE-03, STAGE-04
**Success Criteria** (what must be TRUE):
  1. All 5 core agents exist in `agents/` with complete frontmatter (name, description, tools, color), required_reading sections, and documented completion markers
  2. `plan` stage spawns design-phase-researcher (optional per config) + design-planner + design-plan-checker and no longer inlines task decomposition in the skill
  3. `design` stage spawns design-executor per task with wave coordination; each task produces an atomic git commit and a `.design/tasks/task-NN.md`
  4. `verify` stage spawns design-verifier which iterates (gaps → fix → re-verify) instead of linear 5-phase execution
  5. End-to-end pipeline still works on a test project — no regressions vs v2.1.0 behavior
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — design-planner + design-phase-researcher + design-plan-checker agents, plan stage orchestrator rewrite (AGENT-01, AGENT-04, AGENT-05, STAGE-02)
- [x] 02-02-PLAN.md — design-executor agent + design stage orchestrator rewrite with wave coordination and atomic commits (AGENT-02, STAGE-03)
- [ ] 02-03-PLAN.md — design-verifier agent + verify stage orchestrator rewrite with gap-response loop (AGENT-03, STAGE-04)
- [ ] 02-04-PLAN.md — discover minimal STATE.md wrapper + end-to-end smoke test on fixture (STAGE-01)

### Phase 3: Quality Gate Agents + Pipeline Polish
**Goal**: Six quality-gate agents are integrated into the pipeline and every known rough edge in the polish backlog is resolved — the pipeline produces accurate results for Next.js App Router, Remix, SvelteKit, and Tailwind-only projects
**Depends on**: Phase 2 (quality gates plug into agent-orchestrated stages)
**Requirements**: AGENT-06, AGENT-07, AGENT-08, AGENT-09, AGENT-10, AGENT-11, SCAN-01, SCAN-02, SCAN-03, DISC-01, DISC-02, DISC-03, PLAN-01, PLAN-02, DSGN-01, DSGN-02, DSGN-03, VRFY-01, VRFY-02, REF-01, REF-02, REF-03, REF-04, REF-05
**Success Criteria** (what must be TRUE):
  1. `discover` spawns design-context-builder → design-context-checker; DESIGN-CONTEXT.md is approved before planning begins
  2. `verify` spawns design-auditor (6 pillars scored 1–4) + design-integration-checker (wiring verification) as part of its iterative loop
  3. Running scan on a Next.js App Router project (no `src/`) produces a valid DESIGN.md with component inventory — no empty sections
  4. Running discover on a Tailwind-only project (no CSS files) completes without error and audits Tailwind config instead of CSS grep
  5. Brownfield project: design-pattern-mapper surfaces existing colors/spacing/components before planning so plan doesn't conflict with established patterns
  6. All five reference files contain the new content sections (archetypes, variable fonts, spring physics, scroll-triggered animations, Visual Hierarchy grep patterns)
**Plans**: TBD

Plans:
- [ ] 03-01: design-context-builder + design-context-checker + discover orchestrator update
- [ ] 03-02: design-auditor + design-integration-checker + verify orchestrator update
- [ ] 03-03: design-pattern-mapper + design-assumptions-analyzer + plan orchestrator update
- [ ] 03-04: Scan polish — component detection, --full mode, DESIGN-DEBT ordering
- [ ] 03-05: Plan + design + verify polish — task templates, --research doc, execution guides, oklch, decision authority, VISUAL flags
- [ ] 03-06: Reference file expansions — audit-scoring, typography archetypes + variable fonts, motion spring physics + scroll-triggered

### Phase 4: Connections Layer
**Goal**: Figma and Refero MCPs are first-class connections with documented setup, graceful fallback, and a documented pattern for adding future connections (Storybook, Linear, GitHub)
**Depends on**: Phase 3 (connections are invoked from agent-orchestrated stages)
**Requirements**: CONN-01, CONN-02, CONN-03, CONN-04, CONN-05, CONN-06
**Success Criteria** (what must be TRUE):
  1. `connections/figma.md` + `connections/refero.md` document setup, per-tool capabilities, and fallback behavior — a new user can enable either connection by following the guide
  2. Scan stage reads Figma variables when Figma MCP is available and logs the source in DESIGN.md; falls back to code-only analysis when not
  3. Discover stage pre-populates `<decisions>` from Figma and `<references>` from Refero when available; completes without either
  4. `connections/connections.md` capability matrix shows which stages use which connection and includes an extensibility guide for adding a new connection
  5. Every stage records in STATE.md which connections were active during that run — a reader can trace which outputs came from which source
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Connection documentation + canonical availability probe (connections/figma.md NEW, connections/refero.md + connections.md UPDATE) (CONN-01, CONN-02, CONN-06)
- [ ] 04-02-PLAN.md — Figma MCP wiring: scan State Integration + Step 2A Token Augmentation; design-context-builder Step 0 Pre-population (CONN-03, CONN-04)
- [ ] 04-03-PLAN.md — Refero MCP wiring: design-context-builder Area 5 with three-tier fallback (Refero → awesome-design-md → WebFetch); discover/SKILL.md concrete probe queries (CONN-05)

### Phase 5: Automation Agents + New Commands
**Goal**: Three automation agents (fixer, advisor, doc-writer) close the verify→fix loop, handle gray-area research, and generate handoff docs — and three new commands (style, darkmode, compare) ship using them
**Depends on**: Phase 3 (automation agents are invoked by the pipeline + new commands); Phase 4 optional (commands work without connections but benefit from them)
**Requirements**: AGENT-12, AGENT-13, AGENT-14, STYL-01, STYL-02, STYL-03, STYL-04, STYL-05, DARK-01, DARK-02, DARK-03, DARK-04, DARK-05, DARK-06, DARK-07, COMP-01, COMP-02, COMP-03, COMP-04, COMP-05
**Success Criteria** (what must be TRUE):
  1. design-verifier + design-fixer close the verify→fix loop automatically — a gap in DESIGN-VERIFICATION.md is resolved without the user re-planning
  2. design-advisor produces a comparison table for any gray area flagged in discover — replaces "user best guess" with researched trade-offs
  3. `@ultimate-design style Button` invokes design-doc-writer and produces `.design/DESIGN-STYLE-Button.md` with all required token sections (works post-pipeline and pre-pipeline)
  4. `@ultimate-design darkmode` detects dark mode architecture, runs the audit, and produces `.design/DARKMODE-AUDIT.md` with a P0–P3 fix list
  5. `@ultimate-design compare` produces `.design/COMPARE-REPORT.md` with per-category delta, anti-pattern delta, and design-drift flagging
  6. None of the new commands pollute the pipeline artifact namespace — all use distinct prefixes
**Plans**: TBD

Plans:
- [ ] 05-01: design-fixer agent + integrate into verify loop
- [ ] 05-02: design-advisor agent + integrate into discover gray-area resolution
- [ ] 05-03: design-doc-writer agent + style command (SKILL.md, two modes, router update)
- [ ] 05-04: darkmode command — SKILL.md, architecture detection, audit checks, router update
- [ ] 05-05: compare command — SKILL.md, delta logic, drift detection, router update

### Phase 6: Validation + Version Bump
**Goal**: The plugin passes formal validation, all commands work on a real Windows Git Bash project, and the version is 3.0.0
**Depends on**: Phases 4 and 5
**Requirements**: VAL-01, VAL-02, VAL-03
**Success Criteria** (what must be TRUE):
  1. `claude plugin validate .` exits 0 with no errors or warnings after all v3 changes
  2. Root SKILL.md argument-hint frontmatter, Command Reference table, and Jump Mode section all list style, darkmode, and compare — invoking any of them routes correctly
  3. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` both show version `3.0.0`
  4. `claude plugin install hegemonart/ultimate-design` on a fresh Claude Code instance installs cleanly and the pipeline runs end-to-end
**Plans**: TBD

Plans:
- [ ] 06-01: Root SKILL.md routing audit + plugin validate + version bump + marketplace.json sync

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation + Distribution + Infrastructure | 5/5 | Complete   | 2026-04-17 |
| 2. Core Agents + Stage Orchestration | 4/4 | Complete   | 2026-04-17 |
| 3. Quality Gate Agents + Pipeline Polish | 6/6 | Complete   | 2026-04-17 |
| 4. Connections Layer | 0/3 | Not started | - |
| 5. Automation Agents + New Commands | 0/5 | Not started | - |
| 6. Validation + Version Bump | 0/1 | Not started | - |
