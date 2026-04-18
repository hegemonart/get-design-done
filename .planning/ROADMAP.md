# Roadmap: get-design-done v3

## Overview

v3 transforms get-design-done from a linear pipeline into a GSD-style agent-orchestrated system.

**Pipeline shape (canonical, effective Phase 7):**

```
Brief → Explore → Plan → Design → Verify → (next phase)
```

- **Brief** — user states the design problem, audience, constraints, success metrics. Produces `.design/BRIEF.md`. New stage (pre-v3 pipeline had no formal intake — users ran `scan` cold).
- **Explore** — unifies former `scan` + `discover`. Inventory current system (via parallel mappers) AND gather context/references/decisions (via discussant + synthesizer + connections + sketch/spike findings). Produces `DESIGN.md`, `DESIGN-DEBT.md`, `DESIGN-CONTEXT.md`.
- **Plan** — unchanged. Produces `DESIGN-PLAN.md` with wave-ordered tasks.
- **Design** — unchanged. Atomic-commit execution.
- **Verify** — unchanged. Goal-backward verification + gap-response loop.
- **(next phase)** — `/gdd:next` routes to the next cycle/phase based on STATE.md. Closes the loop.

Phases 1–6 built the plugin under the legacy `scan → discover → plan → design → verify` layout. Phase 7 Wave A includes plan **07-00** to migrate the skill directory structure and stage labels to the new shape.

**Command namespace**: all user-facing commands are invoked as `/gdd:<name>` (short form). The plugin name `get-design-done` remains in manifests and install URLs; `gdd` is the command namespace exposed to users. Mechanism (plugin alias vs short_name vs namespace rename) to be decided during plan 07-00.

Each stage is a thin orchestrator that spawns specialized agents — modeled on GSD's planner/executor/verifier/checker pattern. Phase 1 lays the foundation (cross-platform bash, distribution cleanup, explicit state machine, agent + connection scaffolding). Phase 2 builds the 5 core agents and rewrites the stages to use them. Phase 3 adds 6 quality-gate agents plus clears the existing polish backlog. Phase 4 formalizes Figma and Refero as connections with a plug-in model for future ones. Phase 5 ships 3 automation agents plus the three new commands (style, darkmode, compare). Phase 6 validates and ships the renamed plugin as **get-design-done v1.0.0** (version reset on rename — the `3.0.0` seen in early planning docs referred to the legacy `ultimate-design` codebase). Phase 7 is the GSD parity + exploration phase — adds the design-discussant agent, progress/health/todo/pause/resume commands, parallel codebase mappers, research synthesizer, audit-cycle + validate-cycle, model profiles, the roadmap/milestone abstraction layer, light upstream parity (forensic audit, `--all`, parallel discuss, Socratic refinement, read-injection scanner, agent size-budget), AND the sketch/spike exploration flow with project-local skills at `./.claude/skills/` that codifies findings and auto-loads into future sessions. Phase 8 adds visual-truth + design-side-write connections + the Graphify knowledge-graph connection — Preview/Playwright, Storybook + Chromatic, figma-writer (proposal→confirm wrapping `use_figma`), and connections/graphify.md for pre-search context. Phase 9 integrates Claude Design (Anthropic Labs) as a first-class connection and adds Pinterest MCP as a reference source. Phase 10 builds the native knowledge layer (`.design/intel/` queryable store, dependency analysis, skill manifest, learnings extraction, architectural responsibility mapping, flow diagrams, context-exhaustion auto-recording) — the memory infrastructure downstream phases depend on. Phase 10.1 (INSERTED decimal phase, ships as v1.0.4.1 off-cadence) lands the optimization layer + cost governance — a `gdd-router` skill, `gdd-cache-manager` with `/gdd:warm-cache`, `.design/budget.json` + a PreToolUse hook enforcing model tiers and caps, lazy checker spawning, streaming synthesizer pattern, `.design/telemetry/costs.jsonl` + `.design/agent-metrics.json`, and `/gdd:optimize` recommendations — targeting 50–70% per-task token-cost reduction while preserving the quality floor. Phase 11 closes the improvement loop on top of Phases 10 + 10.1 — post-cycle reflector consuming learnings + telemetry, frontmatter feedback loop, reference-file proposal generator, budget-config feedback, discussant question-quality learning, and a global skills layer at `~/.claude/gdd/global-skills/`. Phase 12 ships the test suite (ported GSD patterns + gdd-unique coverage including optimization-layer enforcement + regression baselines). Phase 13 layers full CI/CD on top — cross-platform matrix validation, lint, schema checks, security scanning, branch protection, and release automation that auto-tags, auto-releases from CHANGELOG, and smoke-tests freshly-installed tagged versions. Phase 14 integrates AI-native design tools (**paper.design** + **pencil.dev**) via their MCP servers, adds paper/pencil writer agents following the figma-writer proposal→confirm pattern, and defines a unified canvas-connection interface so future tools (Subframe, v0.dev, Galileo AI, Builder.io Visual Copilot, Locofy, Anima, Plasmic, TeleportHQ) plug in via the same contract — closing the **canvas → code → verify → canvas** round-trip.

**Naming convention**: commands documented as `/gdd:<name>` (short form). Full plugin name remains `get-design-done` in manifests and install URLs; `gdd` is the command invocation short form.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation + Distribution + Infrastructure** — Cross-platform bash, gitignore cleanup, state machine, agents/ + connections/ scaffolding
 (completed 2026-04-17)
- [x] **Phase 2: Core Agents + Stage Orchestration** — 5 core agents (planner, executor, verifier, phase-researcher, plan-checker) + 4 stage wrapper rewrites (completed 2026-04-17)
- [x] **Phase 3: Quality Gate Agents + Pipeline Polish** — 6 quality gate agents + existing backlog polish (completed 2026-04-17)
- [x] **Phase 4: Connections Layer** — Figma MCP, Refero MCP, extensibility pattern (completed 2026-04-17)
- [x] **Phase 5: Automation Agents + New Commands** — 3 automation agents + style + darkmode + compare (completed 2026-04-17)
- [x] **Phase 6: Validation + Version Bump** — Plugin validate, smoke test, renamed to get-design-done and reset to **v1.0.0** (legacy `ultimate-design` was at v3.0.0; rename shipped as a fresh 1.0.0 release) (completed 2026-04-18)
- [ ] **Phase 7: GSD Parity + Exploration — Discussant, Ergonomics, Sketch/Spike, Architecture Uplift** — design-discussant, progress/health/todo/pause/resume, parallel mappers, research synthesizer, audit-cycle + validate-cycle, model profiles, cycle/milestone layer, insert/remove stages, debug/quick, upstream parity (forensic/`--all`/parallel-discuss/Socratic/injection-scanner/size-budget), sketch + spike + project-local skills + pipeline integration
- [ ] **Phase 8: Visual + Design-Side Connections + Knowledge Graph** — connections/preview.md (Playwright / Claude Preview MCP), connections/storybook.md, connections/chromatic.md, agents/design-figma-writer.md (wraps Figma `use_figma` MCP) with proposal→confirm pattern
- [ ] **Phase 9: Claude Design Integration + Pinterest Connection** — Claude Design handoff auto-landing, `--from-handoff` entry point, Pinterest MCP as reference source, connections/claude-design.md (formerly Phase 7)
- [ ] **Phase 10: Knowledge Layer** — `.design/intel/` queryable store (files, exports, symbols, tokens, components, patterns, dependencies); `/gdd:analyze-dependencies`, `/gdd:skill-manifest`, `/gdd:extract-learnings`; architectural responsibility mapping in phase-researcher; flow-diagram directive; context-exhaustion auto-recording. Foundation for Phase 10.1 (optimization reads intel as a cache) and Phase 11 (self-improvement reads learnings).
- [ ] **Phase 10.1: Optimization Layer + Cost Governance** — INSERTED — `gdd-router` skill (intent → fast/quick/full routing); `gdd-cache-manager` skill + `/gdd:warm-cache` (prompt-cache discipline, batching, 5-min TTL awareness); `.design/budget.json` config + PreToolUse hook enforcing model tiers, hard caps, and lazy-spawn gates; model-tier audit (verifiers/checkers → Haiku, researchers → Sonnet, planners → Opus); `.design/telemetry/costs.jsonl` + `.design/agent-metrics.json` tracker (per-agent duration, gap-rate, deviation-rate, context-cost); `/gdd:optimize` cost-recommendation command; streaming synthesizer pattern for parallel-agent output merge; shared cached preamble extracted from agent prompts. Target: 50–70% token-cost reduction per task with quality floor preserved. Ships as v1.0.4.1 (off-cadence patch — decimal phase does not shift the v1.0.5 → v1.0.6 → v1.0.7 sequence of Phases 11/12/13).
- [ ] **Phase 11: Self-Improvement** — post-cycle reflector consuming Phase 10 learnings + Phase 10.1 telemetry; `.design/agent-metrics.json` feedback loop (reflector proposes `typical-duration-seconds` / `default-tier` / `parallel-safe` updates from measured data); reference-update proposer (mines learnings for reference/ file additions); budget-config feedback loop; global skills layer at `~/.claude/gdd/global-skills/`; discussant question-quality feedback loop; `/gdd:reflect` on demand + `/gdd:apply-reflections` for user-reviewed promotion.
- [ ] **Phase 12: Test Coverage** — port GSD's 100+ structural/categorical tests (adapted to gdd), add gdd-unique coverage (pipeline smoke, mapper schema, parallelism decision engine, sketch determinism, cycle lifecycle, connection probes, figma-writer dry-run, reflection proposals, optimization-layer enforcement (router decisions, cache-manager correctness, budget-hook blocking, lazy-spawn gates), deprecation redirects, NNG heuristic coverage, Touches: analysis). Basic CI setup. Regression baselines per phase locked in from this point forward.
- [ ] **Phase 13: CI/CD** — full CI pipeline on top of Phase 12's basic test-runner: cross-platform matrix (Node 22/24 × Linux/macOS/Windows), markdown + JSON schema lint, frontmatter validator, stale-ref detector, `claude plugin validate .` in CI, shellcheck on bash scripts, secrets scanning (gitleaks), injection-scanner CI mode, agent size-budget enforcement, PR template + branch protection, auto-tag on version bump, GitHub Release automation from CHANGELOG.md, release-time smoke test, README badges, CONTRIBUTING.md.
- [ ] **Phase 14: AI-Native Design Tool Connections** — `connections/paper-design.md` (wraps paper.design's 24-tool MCP, bidirectional — canvas elements are real HTML/CSS), `connections/pencil-dev.md` (wraps pencil.dev MCP — `.pen` files live in git as source of truth), paper/pencil writer agents following figma-writer's proposal→confirm pattern, unified canvas-connection interface so future AI-native design tools (Subframe, v0.dev, Galileo, Builder.io, Locofy, Anima) plug in consistently. Closes the canvas→code→verify→canvas round-trip.

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
**Plans**: 5 plans

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
  3. `@get-design-done style Button` invokes design-doc-writer and produces `.design/DESIGN-STYLE-Button.md` with all required token sections (works post-pipeline and pre-pipeline)
  4. `@get-design-done darkmode` detects dark mode architecture, runs the audit, and produces `.design/DARKMODE-AUDIT.md` with a P0–P3 fix list
  5. `@get-design-done compare` produces `.design/COMPARE-REPORT.md` with per-category delta, anti-pattern delta, and design-drift flagging
  6. None of the new commands pollute the pipeline artifact namespace — all use distinct prefixes
**Plans**: 5 plans

Plans:
- [x] 05-01-PLAN.md — design-fixer agent + integrate into verify loop
- [ ] 05-02-PLAN.md — design-advisor agent + integrate into discover gray-area resolution
- [ ] 05-03-PLAN.md — design-doc-writer agent + style command (SKILL.md, two modes, router update)
- [ ] 05-04-PLAN.md — darkmode command — SKILL.md, architecture detection, audit checks, router update
- [ ] 05-05-PLAN.md — compare command — SKILL.md, delta logic, drift detection, router update

### Phase 6: Validation + Version Bump
**Goal**: The plugin passes formal validation, all commands work on a real Windows Git Bash project, and ships as get-design-done **v1.0.0** (version reset on rename — legacy ultimate-design was v3.0.0).
**Depends on**: Phases 4 and 5
**Requirements**: VAL-01, VAL-02, VAL-03
**Success Criteria** (what must be TRUE):
  1. `claude plugin validate .` exits 0 with no errors or warnings after all v3 changes
  2. Root SKILL.md argument-hint frontmatter, Command Reference table, and Jump Mode section all list style, darkmode, and compare — invoking any of them routes correctly
  3. `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` both show version `1.0.0` (rename reset; ultimate-design legacy was v3.0.0)
  4. `claude plugin install hegemonart/get-design-done` on a fresh Claude Code instance installs cleanly and the pipeline runs end-to-end
**Status**: ✓ COMPLETE (2026-04-18)
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md — Rename to get-design-done, reset version to 1.0.0 (plugin.json + marketplace.json; legacy ultimate-design was v3.0.0), description refresh, validate both manifests (VAL-01, VAL-02, VAL-03)

### Phase 7: GSD Parity + Exploration — Discussant, Ergonomics, Sketch/Spike, Architecture Uplift
**Goal**: Close the GSD parity gap AND ship exploration-before-commit. Design decisions are gathered through adaptive questioning (not a fixed script), the pipeline is navigable via explicit state commands, codebase mapping runs in parallel through scoped agents, the plugin supports multi-cycle design work, and designers can explore directions via `/gdd:sketch` (multi-variant HTML) and `/gdd:spike` (design feasibility experiments) with wrap-up flows that codify findings as project-local skills auto-loaded on every future session.
**Depends on**: Phase 6 (stable v1.0.0 baseline). Can run in parallel with Phase 8 (see "Parallelization" at end of roadmap).
**Requirements**: GSD-01 through GSD-20, SKT-01 through SKT-04, SPK-01 through SPK-04, PLS-01 through PLS-04 (to be defined during plan-phase)

**Scope discipline (post-critique trims — 2026-04-18):**

Items explicitly **dropped** to keep the phase coherent:
- `/gdd:insert-stage`, `/gdd:remove-stage` — premature; no demonstrated need; the 5-stage pipeline has been stable since v1
- Standalone `/gdd:spec-phase` command — Socratic refinement + ambiguity scoring fold into the discussant as a mode (`/gdd:discuss --spec` or the discussant detecting ambiguity internally). Avoids four overlapping question-asking mechanisms.

Items **restored** after initial dropping:
- `/gdd:reapply-patches` — originally deferred as premature; restored to Wave A plan 07-03b because it must ship with `/gdd:update` (update without reapply clobbers user `reference/` tweaks).

Items explicitly **consolidated**:
- `/gdd:todo` + `/gdd:check-todos` → one `/gdd:todo` command with subcommands (`add`, `list`, `pick`)
- `/gdd:audit-cycle` + `/gdd:validate-cycle` → one `/gdd:audit` command with `--retroactive` flag for validation mode
- `/gdd:set-profile` → moved under `/gdd:settings profile <name>` (not a standalone command)
- `/gdd:cleanup` → moved under `/gdd:settings cleanup` (not a standalone command)

Net command count: **24 → 17 new commands in this phase**. Remaining: discuss, progress, health, todo, settings, map, audit, pause, resume, new-cycle, debug, quick, sketch, sketch-wrap-up, spike, spike-wrap-up, plus flags on existing commands.

**Wave structure — three ship checkpoints:**

Phase 7 merges to `main` **three times**, at the end of each wave. If priorities shift mid-phase, any wave boundary is a clean stopping point with shippable functionality.

| Wave | Plans | Ships | Dependency out |
|------|-------|-------|----------------|
| **A — Foundation** | 07-00, 07-01, 07-02, 07-02b, 07-03, 07-03b, 07-08 | Pipeline reshape + `/gdd:` namespace + `/gdd:help`; discussant (evolved from context-builder) + `/gdd:list-assumptions`; progress/health/todo/stats (with `--forensic`); idea capture layer (note/plant-seed/backlog/review-backlog); settings schema (model_profile + parallelism); maintenance commands (`/gdd:update` + `/gdd:reapply-patches`); agent hygiene + injection scanner + parallel-safety frontmatter | Plugin runs on canonical pipeline shape with new discussant; decision-engine data in place; full ergonomics layer; users can upgrade safely |
| **B — Architecture** | 07-04, 07-04b, 07-05, 07-06, 07-06b, 07-07 | 5 mappers (2 splits + 3 new); wave-native pipeline (decision engine live across all stages); research synthesizer; `/gdd:audit` wrapping existing verifier/auditor; cycle layer; pause/resume/debug/quick; lifecycle commands (new-project/complete-cycle/fast); workflow router + ship + undo + pr-branch | Architecture final — sketch/spike can plug in cleanly; verify→ship loop closed |
| **C — Exploration + Closeout** | 07-09, 07-10, 07-11, 07-12 | Sketch + spike commands with their own integration hooks; project-local skills + CLAUDE.md auto-load + required_reading extensions; phase closeout (version bump, README/manifest refresh, CHANGELOG, baseline lock) | Phase 7 complete at v1.0.1 |

**Success Criteria** (what must be TRUE, grouped by wave):

*After Wave A:*
  1. `/gdd:discuss [topic]` spawns `design-discussant` (evolved from `design-context-builder`, with detection stripped out) — asks one question at a time, adapts, writes numbered D-XX decisions to STATE.md `<decisions>` block (no new DECISIONS.md artifact). Stops when sufficient for planning. `--all` batches gray areas; `--spec` adds ambiguity scoring on top of normal questioning. Parallel discuss supported across independent cycles.
  2. `discover` stage orchestrator invokes `design-discussant` as its first step; interview logic in `skills/discover/SKILL.md` is removed from the skill.
  3. `/gdd:progress` reads STATE.md and routes to next action. `--forensic` flag runs a 6-check integrity audit (stale artifacts, missing transitions, token drift, aged DESIGN-DEBT, cycle alignment, connection status).
  4. `/gdd:health` reports `.design/` state — stale DESIGN.md vs code mtime, missing artifacts, token drift, aged DESIGN-DEBT entries, broken state transitions.
  5. `/gdd:todo <add|list|pick>` captures, lists, and picks backlog items.
  6. `.design/config.json` exposes full schema: `model_profile` (quality/balanced/budget) + `parallelism` object (enabled, max_parallel_agents, min_tasks_to_parallelize, min_estimated_savings_seconds, require_disjoint_touches, worktree_isolation, per_stage_override). `/gdd:settings` command supports `profile <name>`, `parallelism <key> <value>`, `cleanup` subcommands.
  7. Every agent's frontmatter declares `parallel-safe: always|never|conditional-on-touches`, `typical-duration-seconds`, `reads-only`, and `writes` — the data the decision engine reads in Wave B.
  8. Agent size-budget enforced per role (line-count tiers); boilerplate extracted to `@file` includes across all 14+ agents. `gdd-read-injection-scanner` PostToolUse hook active.
  8a. `/gdd:update` pulls latest release, re-syncs plugin files, preserves `.design/config.json` + `./.claude/skills/`. `/gdd:reapply-patches` reapplies user modifications to `reference/` against pristine baseline via git diff. Both ship together; update is safe to run without losing local customizations.

*After Wave B:*
  9. `/gdd:map` dispatches 5 mappers — 2 from splitting existing `design-pattern-mapper` (`token-mapper`, `component-taxonomy-mapper`) + 3 new (`visual-hierarchy-mapper`, `a11y-mapper`, `motion-mapper`). Each writes one doc under `.design/map/`. Scan stage consumes these instead of running serial grep.
  10. **Wave-native pipeline**: every skill orchestrator (scan, discover, plan, design, verify) uses the parallelism decision engine (reads settings + rules + agent data, writes verdict to STATE.md `<parallelism_decision>`). `reference/parallelism-rules.md` codifies hard rules (sequential dep, shared write, interactive agent, single task, overlapping Touches) and soft rules (est-savings threshold, fast-agent bias, wave-cap splitting). Parallel-when-needed, not reflexively.
  11. `design-research-synthesizer` consumes phase-researcher + mappers + connections (Figma/Refero/Pinterest/Storybook) + discussant output → unified `DESIGN-CONTEXT.md`.
  12. `/gdd:audit` is a command wrapping existing `design-verifier` + `design-auditor` — no new agent. `--retroactive` invokes verifier with cycle-span scope.
  13. `/gdd:pause` writes a handoff; `/gdd:resume` restores context. Killed mid-cycle sessions restart without re-running completed stages.
  14. `/gdd:new-cycle` creates a cycle; STATE.md `cycle:` frontmatter field is active; `.design/CYCLES.md` tracks. Pipeline runs scope to the active cycle. Hierarchy is explicit: Cycle > Run > Wave > Task.
  15. `/gdd:debug` starts a symptom-driven investigation with persistent state; `reference/debugger-philosophy.md` codifies the approach. `/gdd:quick` runs the pipeline with optional agents skipped.

*After Wave C:*
  16. `/gdd:sketch [topic]` creates `.design/sketches/<slug>/` with intake + N standalone HTML variants (default 3). `--quick` bypasses intake. No `/gdd:new-project` prerequisite. Integration hooks ship with this plan: scan detects prior sketches, planner includes findings in `<files_to_read>`, design-stage offers sketch as a route when directionally open.
  17. `/gdd:sketch-wrap-up` walks sketches, elicits winner + rationale, groups by design area, writes project skills to `./.claude/skills/design-<area>-conventions.md`. Summary in `.design/sketches/SUMMARY.md`.
  18. `/gdd:spike [question]` creates `.design/spikes/<slug>/` with question + throwaway artifact + findings log. `--quick` bypasses intake. Integration hooks ship with this plan: scan detects prior spikes, planner includes findings, verify surfaces pending exploration.
  19. `/gdd:spike-wrap-up` codifies findings into `./.claude/skills/design-<topic>-findings.md`; summary in `.design/spikes/SUMMARY.md`.
  20. Project-local skills at `./.claude/skills/` auto-load via routing injected into project CLAUDE.md. Discussant, planner, and executor `<required_reading>` blocks extended to include `./.claude/skills/*.md`. Future gdd invocations inherit codified decisions — no re-asking. `/gdd:progress` surfaces pending sketch/spike work; `/gdd:pause` captures active sketch/spike context in handoff.
  21. Sketch variants render as standalone HTML (no build step) — browser-openable directly, screenshot-able by Phase 8 preview/playwright later. Artifacts usable without Phase 8.

**Architectural principles applied (post-critique, 2026-04-18):**

1. **Discussant evolves `design-context-builder`, not a new agent.** Current builder does both detection + interview — two jobs. Split: detection → `design-pattern-mapper` (exists) + Wave B specialist mappers; interview → rename/narrow builder to `design-discussant`.
2. **Mappers: 2 splits + 3 new, not 5 new from scratch.** Split existing `design-pattern-mapper` → `token-mapper` + `component-taxonomy-mapper`; add `visual-hierarchy-mapper`, `a11y-mapper`, `motion-mapper`.
3. **`/gdd:audit` is a command wrapping existing `design-verifier` + `design-auditor`, not a new agent.** `--retroactive` flag invokes verifier with cycle-span scope.
4. **DECISIONS.md does not exist as a new artifact.** STATE.md `<decisions>` block already has D-XX numbering — discussant writes there. One source of truth.
5. **Hierarchy pinned**: `Cycle` (goal) > `Pipeline run` (scan→verify) > `Wave` (parallel batch) > `Task` (atomic commit). STATE.md gains a `cycle:` frontmatter field.
6. **Plan 07-07 dissolved**: `--forensic` → into 07-02; parallel discuss → into 07-01; injection scanner → into 07-08.
7. **Plan 07-12 dissolved**: integration hooks ship with their respective Wave C plans (07-09/10/11).
8. **New plan 07-04b — Wave-native pipeline**: parallelism is **computed** (from settings × rules × data), not specified per task. Every stage orchestrator uses the decision engine.

**Parallelism: settings + rules, not reflex**

Parallelism is a first-class architectural primitive, not a per-task flag. See plans 07-03, 07-04b, and 07-08 for where it lives:

- **Settings** (`.design/config.json` → `parallelism` object; user-tunable via `/gdd:settings parallelism ...`):
  - `enabled`, `max_parallel_agents`, `min_tasks_to_parallelize`, `min_estimated_savings_seconds`, `require_disjoint_touches`, `worktree_isolation`, `per_stage_override`
- **Rules** (`reference/parallelism-rules.md` — hard + soft):
  - Hard: sequential dependency, shared writes, interactive agent, single task, overlapping `Touches:` → serial
  - Soft: below est-savings threshold, all candidates fast (<10s), beyond cap → prefer serial or split into waves
- **Data** (declarative, read by decision engine):
  - Agent frontmatter: `parallel-safe: always|never|conditional-on-touches`, `typical-duration-seconds`, `reads-only`, `writes`
  - Plan `Touches:` field (already exists) is the load-bearing signal for independence

Every orchestrator spawn point calls the decision engine and writes its verdict to STATE.md `<parallelism_decision>` so "why didn't it parallelize?" is a one-file read, not a guess.

**Plans**: 17 plans across 3 waves (7 Wave A + 6 Wave B + 4 Wave C)

**Wave A — Foundation (7 plans; ships to `main` after all 7 merge):**
- [ ] 07-00-PLAN.md — **Pipeline reshape + command namespace + help**: migrate stages to canonical `Brief → Explore → Plan → Design → Verify → (next phase)` shape; `skills/scan/` + `skills/discover/` merge into `skills/explore/`; new `skills/brief/` stage (Brief produces BRIEF.md — absorbs GSD's `/gsd-ui-phase` UI-SPEC concept for frontend-first scope); `skills/*/SKILL.md` stage labels updated (4-of-5 / 5-of-5 numbering); commands exposed under `/gdd:<name>` namespace (mechanism decided here: plugin alias vs short_name vs namespace rename); `/gdd:next` routes to next cycle/phase based on STATE.md; `/gdd:help` lists all commands with one-line descriptions; STATE.md `stage:` enum updated to `brief|explore|plan|design|verify`; all agent references to "scan"/"discover" pipeline stages updated (PIPE-01, PIPE-02, PIPE-03, PIPE-04)
- [ ] 07-01-PLAN.md — Rename + narrow `design-context-builder` → `design-discussant` (strip detection, keep adaptive questioning with `--all` and `--spec` modes); parallel discuss across independent cycles; `/gdd:discuss` command; discussant writes D-XX to STATE.md `<decisions>` (no new DECISIONS.md artifact); `/gdd:list-assumptions` command surfaces hidden design assumptions before planning (design is assumption-heavy — "users will scan F-pattern", "mobile-first", "brand tolerates motion"); **explore** orchestrator re-wiring (GSD-01, GSD-02, GSD-03, GSD-04)
- [ ] 07-02-PLAN.md — `/gdd:progress` (with `--forensic` 6-check integrity audit); `/gdd:health`; `/gdd:todo` (add/list/pick subcommands); `/gdd:stats` (cycle stats: phases, plans, decisions, commits, timeline, git metrics); STATE.md schema extensions (`cycle:` frontmatter field, `<parallelism_decision>` section) (GSD-05, GSD-06, GSD-07)
- [ ] 07-02b-PLAN.md — **Idea capture layer**: `/gdd:note` (zero-friction idea capture during any stage — append, list, promote to todos); `/gdd:plant-seed` (forward-looking ideas with trigger conditions — "when we add dark mode, revisit typography hierarchy" — surfaces at right cycle); `/gdd:add-backlog` (parking lot at `.design/backlog/`); `/gdd:review-backlog` (promote backlog items to active cycle). Complements existing `/gdd:todo` with different timescales: note = ephemeral, todo = now, plant-seed = future-triggered, backlog = parking lot (GSD-08, GSD-09, GSD-10)
- [ ] 07-03-PLAN.md — `.design/config.json` full schema: `model_profile` + `parallelism` object (enabled, max_parallel_agents, min thresholds, worktree_isolation, per_stage_override); agent frontmatter reads profile; `/gdd:settings` command with `profile <name>`, `parallelism <key> <value>`, `cleanup` subcommands (GSD-07, GSD-08)
- [ ] 07-03b-PLAN.md — **Maintenance commands**: `/gdd:update` (pulls latest gdd from release channel, runs installer, re-syncs skills/commands/agents, preserves `.design/config.json` and `./.claude/skills/`); `/gdd:reapply-patches` (after update, reapplies user modifications to `reference/` files detected via git diff against pristine baseline — so customizations survive upgrades); update+reapply ship together because update without reapply-patches silently clobbers local reference tweaks (GSD-08b, GSD-08c)
- [ ] 07-08-PLAN.md — Agent hygiene: size-budget enforcement (line-count tiers per role); `@file` boilerplate extraction across all 14+ agents; **add `parallel-safe`, `typical-duration-seconds`, `reads-only`, `writes` frontmatter to every agent**; `gdd-read-injection-scanner` PostToolUse hook (GSD-09, GSD-10, GSD-11)

**Wave B — Architecture (6 plans; ships to `main` after all 6 merge):**
- [ ] 07-04-PLAN.md — Mappers: split existing `design-pattern-mapper` → `token-mapper` + `component-taxonomy-mapper`; add `visual-hierarchy-mapper`, `a11y-mapper`, `motion-mapper` (3 new); `/gdd:map` orchestrator dispatches all 5 in parallel via decision engine; scan stage consumes `.design/map/*.md` (GSD-12)
- [ ] 07-04b-PLAN.md — **Wave-native pipeline (architectural)**: ship `reference/parallelism-rules.md` (hard + soft rules); parallelism decision engine implementation; integrate into every skill orchestrator (scan, discover, plan, design, verify); each orchestrator writes its verdict to STATE.md `<parallelism_decision>` (GSD-13, GSD-14)
- [ ] 07-05-PLAN.md — `design-research-synthesizer` agent (consumes phase-researcher + mappers + connections + discussant output → unified DESIGN-CONTEXT.md); `/gdd:audit` command wraps existing `design-verifier` + `design-auditor` (with `--retroactive` for cycle-span scope); `/gdd:pause` + `/gdd:resume` (GSD-15, GSD-16, GSD-17)
- [ ] 07-06-PLAN.md — Cycle/milestone layer: `/gdd:new-cycle` creates cycle scope; STATE.md `cycle:` field active; `.design/CYCLES.md` tracks; `/gdd:debug` + `reference/debugger-philosophy.md`; `/gdd:quick` mode skips optional agents (GSD-18, GSD-19, GSD-20)
- [ ] 07-06b-PLAN.md — **Lifecycle + fast**: `/gdd:new-project` (initialize new gdd project with deep context gathering — produces PROJECT.md, replaces today's "just run scan cold" cold-start); `/gdd:complete-cycle` (archive cycle artifacts, prep for next cycle); `/gdd:fast` (trivial inline task — even leaner than `/gdd:quick`, no subagents, no planning) (GSD-21, GSD-22, GSD-23)
- [ ] 07-07-PLAN.md — **Workflow router + ship + safety**: `/gdd:do` (natural-language router — "redesign header" dispatches to discuss/sketch/plan/design automatically; parses intent, maps to command, confirms before executing); `/gdd:ship` (post-verify PR flow — closes the verify→merge gap; creates PR, invokes code review, preps for merge); `/gdd:undo` (safe revert using cycle manifest + dependency checks — design has atomic commits, undo should be safe); `/gdd:pr-branch` (strip `.design/` and `.planning/` commits for clean code-review PR branch) (GSD-24, GSD-25, GSD-26, GSD-27)

**Wave C — Exploration + Phase Closeout (4 plans; ships to `main` after all 4 merge):**
- [ ] 07-09-PLAN.md — `/gdd:sketch` + `/gdd:sketch-wrap-up`; `.design/sketches/` layout; multi-variant standalone HTML generation; **sketch integration hooks** (scan detection, planner `<files_to_read>`, design-stage route option) (SKT-01, SKT-02, SKT-03, SKT-04)
- [ ] 07-10-PLAN.md — `/gdd:spike` + `/gdd:spike-wrap-up`; `.design/spikes/` layout; throwaway-experiment templates (HTML/CSS/JS/a11y-scan); **spike integration hooks** (scan detection, planner `<files_to_read>`, verify pending-work notices) (SPK-01, SPK-02, SPK-03, SPK-04)
- [ ] 07-11-PLAN.md — `./.claude/skills/` project-local skill layer: convention + CLAUDE.md auto-load routing injection; skill templates (`design-<area>-conventions.md`, `design-<topic>-findings.md`); wrap-up commands write to both `./.claude/skills/` and `.design/*/SUMMARY.md`; **discussant + planner + executor `<required_reading>` extended to include `./.claude/skills/*.md`**; `/gdd:progress` surfaces pending sketch/spike work; `/gdd:pause` captures active sketch/spike context (PLS-01, PLS-02, PLS-03, PLS-04)
- [ ] 07-12-PLAN.md — **Phase closeout**: bump version to v1.0.1; refresh README.md (new commands, pipeline diagram, discussant flow, sketch/spike section); refresh plugin.json + marketplace.json (version, description, keywords); create `CHANGELOG.md` at repo root with v1.0.1 entry + migration notes from DEPRECATIONS.md; lock regression baseline at `test-fixture/baselines/phase-07/` (MAN-01, MAN-02, MAN-03, MAN-04)

### Phase 8: Visual + Design-Side Connections + Knowledge Graph
**Goal**: Close the `? VISUAL` gap in verify, add Storybook as an authoritative component inventory + state-enumeration source, add Chromatic for component-level visual regression, enable Figma-side writes via a proposal→confirm `design-figma-writer` wrapping the official `use_figma` MCP, and add a knowledge-graph connection (Graphify) that agents consult pre-search for richer cross-references between tokens, components, pages, decisions, and debt.
**Depends on**: Phase 6 (stable v1.0.0 baseline). Can run in parallel with Phase 7 (see "Parallelization" at end of roadmap).
**Requirements**: VIS-01 through VIS-05, FWR-01 through FWR-04, STB-01 through STB-03, CHR-01 through CHR-02, GRF-01 through GRF-04 (to be defined during plan-phase)
**Success Criteria** (what must be TRUE):
  1. `connections/preview.md` documents setup, probe pattern, and fallback for the Playwright MCP (and the `mcp__Claude_Preview__*` tool family). Stages that benefit (verify, design, compare, darkmode) probe and degrade gracefully.
  2. Verify stage consumes real screenshots for NNG heuristics currently flagged `? VISUAL` — contrast cascade, rhythm, hierarchy, dark-mode parity, focus-visible, per-route. Flags are replaced with concrete visual evidence or pass marks.
  3. `compare` command produces per-route screenshot diffs (before/after) embedded in `.design/COMPARE-REPORT.md` alongside the existing text delta.
  4. `connections/storybook.md` — probes for `.storybook/` or `storybook` in package.json; when present, **explore** stage reads `stories.json` as authoritative component inventory (zero grep false-positives), per-story a11y-addon output feeds verify, verify iterates every declared state.
  5. New component scaffolding in design stage also emits a `.stories.tsx` stub when Storybook is present — design work ships with its own catalog.
  6. `connections/chromatic.md` — explicit opt-in connection (per-project token via env var). Verify reads Chromatic's latest build delta; design review agent narrates visual changes in plain English; plan stage queries "which stories reference this token" for change-risk scoping.
  7. `agents/design-figma-writer.md` wraps `mcp__figma-desktop__use_figma` — three modes: **annotate** (post DESIGN-DEBT findings as comments/callouts on affected frames), **tokenize** (sync CSS tokens → Figma variables with proposal preview), **mappings** (bulk Code Connect via `add_code_connect_map` / `send_code_connect_mappings`).
  8. Every figma-writer operation runs in **proposal→confirm** mode by default — agent emits the JS it would run + a diff preview, user approves before execution. `--dry-run` flag emits without executing. Writes to a shared team file require `--confirm-shared`.
  9. `connections/graphify.md` — wraps the external Graphify tool. When present, `/gdd:graphify` builds a knowledge graph over code + `.design/` artifacts + Figma export (if available) + `./.claude/skills/`. Graph nodes: components, tokens (color/spacing/typography/motion), pages/routes, DESIGN-DEBT items, D-XX decisions, M-XX must-haves, Figma variables, anti-patterns, a11y findings. Graph edges: *component uses token*, *page renders component*, *debt violates decision*, *anti-pattern detected at element*, *Figma variable maps to CSS variable*. Agents consult the graph pre-search: `design-integration-checker` answers "which D-XX are wired?" as O(1) lookup; `design-planner` queries "which components touch this token?" for change-risk scoping; `/gdd:health` flags orphan tokens + unreferenced debt.
  10. Fallback behavior is explicit and documented: when Storybook absent, explore falls back to grep inventory; when Chromatic absent, verify runs without regression input; when `use_figma` absent, figma-writer is skipped; when Graphify absent, agents fall back to current grep/read patterns. All fallbacks logged in STATE.md `<connections>`.
  11. `connections/connections.md` capability matrix updated with preview, storybook, chromatic, figma-writer, graphify rows.
  12. Phase closes out at v1.0.2 with refreshed README, manifests, CHANGELOG entry, and regression baseline locked at `test-fixture/baselines/phase-08/`.
**Plans**: 7 plans (6 feature + 1 closeout)

Plans:
- [ ] 08-01-PLAN.md — `connections/preview.md` + availability probe + verify/compare/darkmode stage integration for visual evidence (VIS-01, VIS-02, VIS-03, VIS-04, VIS-05)
- [x] 08-02-PLAN.md — `connections/storybook.md` + explore/verify integration (stories.json as inventory, addon-a11y as verify input, per-story state coverage gate) + design-stage `.stories.tsx` scaffolding (STB-01, STB-02, STB-03)
- [x] 08-03-PLAN.md — `connections/chromatic.md` + verify delta-narration + plan-stage change-risk scoping (CHR-01, CHR-02)
- [x] 08-04-PLAN.md — `agents/design-figma-writer.md` (annotate + tokenize + mappings modes) + proposal→confirm UX + dry-run + shared-file guard (FWR-01, FWR-02, FWR-03, FWR-04)
- [ ] 08-05-PLAN.md — **Graphify knowledge-graph connection**: `connections/graphify.md` + `/gdd:graphify` command; graph schema spec (nodes: components, tokens, pages, D-XX decisions, M-XX must-haves, DESIGN-DEBT items, anti-patterns, a11y findings, Figma variables; edges: uses, renders, violates, derives-from, maps-to); pre-search consultation wiring in `design-integration-checker`, `design-planner`, `/gdd:health` (GRF-01, GRF-02, GRF-03, GRF-04)
- [ ] 08-06-PLAN.md — `connections/connections.md` capability matrix update (preview, storybook, chromatic, figma-writer, graphify rows) + cross-reference in agent required_reading + README connections section
- [ ] 08-07-PLAN.md — **Phase closeout**: bump version to v1.0.2; refresh README.md (new connections table, capability matrix link, visual-verification note); refresh plugin.json + marketplace.json (version, description, keywords — add "visual-regression", "graphify", "storybook"); append CHANGELOG.md v1.0.2 entry; lock regression baseline at `test-fixture/baselines/phase-08/` (MAN-05, MAN-06)

### Phase 9: Claude Design Integration + Pinterest Connection
**Goal**: get-design-done is a first-class post-handoff verification layer for Claude Design (claude.ai/design, Anthropic Labs) — users can land from a Claude Design handoff bundle with a single command, skip the full pipeline, and get a verified implementation. Pinterest MCP is added as a reference-collection source in the discover stage. With Phase 8's figma-writer, handoffs become **bidirectional** — implementation status and Code Connect mappings can be written back to the source Figma file.
**Depends on**: Phase 7 + Phase 8 (handoff adapter is built on top of research-synthesizer, discussant, STATE/cycle schema, and Phase 8 visual-diff + figma-writer primitives)
**Requirements**: CDES-01, CDES-02, CDES-03, CDES-04, CDES-05, CDES-06 (NEW — bidirectional write-back), PINS-01
**Success Criteria** (what must be TRUE):
  1. `/get-design-done handoff` (or `--from-handoff`) initializes STATE.md from a Claude Design handoff bundle, feeds the bundle into `design-research-synthesizer` so D-XX decisions land in STATE.md `<decisions>` (the source of truth, per Phase 7), and routes directly to verify via the `/gdd:progress` router — no scan/discover required
  2. `connections/claude-design.md` documents the handoff bundle format, the adapter pattern, and the `DESIGN.md → Claude Design onboarding` reverse workflow
  3. `connections/pinterest.md` documents Pinterest MCP setup, probe pattern, and fallback chain; the capability matrix in `connections/connections.md` is updated (follows Phase 8 connection-doc template)
  4. Pinterest MCP is wired as a source input to `design-research-synthesizer` alongside Refero, awesome-design-md, Storybook (when present), and Figma variables — unified reference surface, no per-agent fallback chains
  5. `DESIGN-VERIFICATION.md` produced by post-handoff verify includes a "Handoff Faithfulness" section that consumes Phase 8's visual-diff + delta-narration primitives — pixel-level compare between handoff render and implemented render, narrated in plain English
  6. Verify stage recognizes `source: handoff` cycles and skips the DESIGN-PLAN.md prerequisite check, running correctly on handoff-only input
  7. **NEW** — Bidirectional handoff: after a successful implementation, `design-figma-writer` posts implementation status (which frames are built, which are pending, which diverge) as annotations on the source Figma file and registers Code Connect mappings via `add_code_connect_map` / `send_code_connect_mappings`. Runs under the standard proposal→confirm guard.

> **⚠ Plans below are PROVISIONAL — drafted before Phases 7 and 8 land.**
> Phases 7 and 8 reshape the architecture Phase 9 plugs into:
> - Phase 7 replaces `design-context-builder` Area-5 fallback logic with `design-research-synthesizer` unified inputs; extends STATE.md schema for cycles/progress/pause; registers new commands through a central registry; introduces the discussant as the question-asking primitive.
> - Phase 8 freezes the connection-doc template; provides visual-diff + delta-narration primitives; ships `design-figma-writer` which enables write-back.
>
> **Replan Phase 9 via `/gsd:plan-phase 9` after Phases 7 + 8 merge to `main`.** The goals and requirements above stay stable; the plan list will be rewritten against the post-7/8 architecture. Sketch of the post-replan shape is below for forward-planning reference only — do not execute from this list.

**Plans** (provisional post-replan sketch — subject to change):

- [ ] 09-01-PLAN.md — `connections/pinterest.md` following Phase 8 connection template (PINS-01, partial CDES-01)
- [ ] 09-02-PLAN.md — `connections/claude-design.md` + handoff bundle format spec + capability matrix update (CDES-01)
- [ ] 09-03-PLAN.md — Handoff as synthesizer input: research-synthesizer reads handoff bundle, emits D-XX decisions to STATE.md `<decisions>` (Phase 7 source of truth); discussant `--from-handoff` mode skips questions the bundle already answers (CDES-02, CDES-03 — replaces original 09-02)
- [ ] 09-04-PLAN.md — `handoff` command registered through Phase 7 command registry; verify post-handoff routing through `/design:progress` + cycle machinery (CDES-04 — replaces original 09-03 routing piece)
- [ ] 09-05-PLAN.md — Handoff Faithfulness as Phase 8 visual-diff + narration consumer; DESIGN-VERIFICATION.md section generated from screenshot delta + narrated changes (CDES-05 — replaces original 09-03 text-scoring piece)
- [ ] 09-06-PLAN.md — **NEW** — Bidirectional handoff: implementation-status annotations + Code Connect mappings written back via `design-figma-writer`; proposal→confirm guard; `--dry-run` support (CDES-06)
- [ ] 09-07-PLAN.md — Pinterest as `design-research-synthesizer` source input (replaces original 09-04 Area-5 three-tier fallback, which no longer exists post-Phase-7)
- [ ] 09-08-PLAN.md — **Phase closeout**: bump version to v1.0.3; refresh README.md (handoff section, Pinterest note, bidirectional-handoff capability); refresh plugin.json + marketplace.json (version, description, keywords — add "claude-design", "handoff", "pinterest"); append CHANGELOG.md v1.0.3 entry; lock regression baseline at `test-fixture/baselines/phase-09/` (MAN-07, MAN-08)

### Phase 10: Knowledge Layer
**Goal**: Build the memory infrastructure that makes real self-improvement possible. A queryable `.design/intel/` store indexes the design surface (files, exports, symbols, tokens, components, patterns, dependencies, decisions, debt, findings) with incremental updates. Commands surface dependencies, skills, and learnings. Agents consult the intel store pre-search — replacing speculative greps with O(1) lookups. This phase is infrastructure; users feel it as "gdd is smarter about what exists in my project."
**Depends on**: Phase 8 (graphify connection ships the external-tool wrapper; Phase 10 goes beyond it with native gdd-specific intel).
**Requirements**: KNW-01 through KNW-10 (to be defined during plan-phase)
**Success Criteria** (what must be TRUE):
  1. `.design/intel/` persistent JSON store indexes the project: `files.json`, `exports.json`, `symbols.json`, `tokens.json` (with usage counts), `components.json` (with consumer lists), `patterns.json`, `dependencies.json`, `decisions.json` (D-XX → code locations), `debt.json` (DESIGN-DEBT items → affected nodes). Schema versioned; migration path documented.
  2. `gdd-intel-updater` agent performs incremental updates — only re-indexes files changed since last update (mtime-based + git hash). Runs on `/gdd:explore` entry and after `/gdd:design` commits.
  3. `/gdd:analyze-dependencies` surfaces token fan-out, component call-graph, decision-to-code traceability, and circular dependencies. Replaces today's narrow `design-integration-checker` grep patterns with graph-native queries.
  4. `/gdd:skill-manifest` pre-computes which project-local and global skills exist at session start — faster agent startup, explicit skill visibility.
  5. `/gdd:extract-learnings` runs post-cycle; extracts what worked, what misfired, which decisions recurred, which anti-patterns were detected multiple times. Writes to `.design/learnings/<cycle-slug>.md` and proposes additions to `reference/anti-patterns.md`, `reference/heuristics.md`, or new reference files. User reviews; nothing ships without explicit accept.
  6. `phase-researcher` / `design-phase-researcher` adds **Architectural Responsibility Mapping** and **Flow-diagram directive** — produces a section in DESIGN-CONTEXT.md showing component responsibilities and data/interaction flows (Mermaid).
  7. **Context-exhaustion auto-recording hook** — PostToolUse hook detects context pressure and auto-writes STATE.md `<paused>` block with resumption instructions. A killed long session resumes from the last coherent checkpoint.
  8. Every agent's `<required_reading>` gains a **conditional** block: if `.design/intel/` is present, read the relevant intel slice (components.json, tokens.json, decisions.json) instead of grepping. Fallback to grep when intel absent or stale.
  9. Graphify connection from Phase 8 feeds the intel store when available — the external graph populates `.design/intel/graph.json`; queries prefer intel store but fall back to live graphify calls.
  10. Intel store is gitignored (regenerable); only schema definitions ship in `reference/intel-schema.md`.
**Plans**: 5 plans

Plans:
- [ ] 10-01-PLAN.md — `.design/intel/` schema (`reference/intel-schema.md`) + initial index builder + `gdd-intel-updater` agent for incremental updates (KNW-01, KNW-02)
- [ ] 10-02-PLAN.md — `/gdd:analyze-dependencies` command; token fan-out, component call-graph, decision traceability, circular dep detection; graph queries atop intel store (KNW-03)
- [ ] 10-03-PLAN.md — `/gdd:skill-manifest` + `/gdd:extract-learnings`; `.design/learnings/` artifact layout; reference-file proposal generator with user-review flow (KNW-04, KNW-05)
- [ ] 10-04-PLAN.md — Architectural Responsibility Mapping + Flow-diagram directive in phase-researcher; Mermaid generation; DESIGN-CONTEXT.md section addition (KNW-06)
- [ ] 10-05-PLAN.md — Context-exhaustion auto-recording hook; STATE.md `<paused>` resumption block; agent `<required_reading>` conditional intel slices; Graphify → intel store feed (KNW-07, KNW-08, KNW-09, KNW-10)
- [ ] 10-06-PLAN.md — **Phase closeout**: bump version to v1.0.4; refresh README.md (knowledge layer section, intel store, new commands: analyze-dependencies, skill-manifest, extract-learnings); refresh plugin.json + marketplace.json (version, description, keywords — add "knowledge-graph", "intel"); append CHANGELOG.md v1.0.4 entry; lock regression baseline at `test-fixture/baselines/phase-10/` (MAN-09, MAN-10)

### Phase 10.1: Optimization Layer + Cost Governance (INSERTED)
**Goal**: Cut GDD per-task token cost by 50–70% vs today's default agent-spawn behavior — without dropping the quality floor — by introducing a cross-cutting router, cache manager, budget enforcer, and measurement layer that every command and agent spawn passes through. Establishes the telemetry Phase 11's reflector depends on.
**Depends on**: Phase 10 (intel store + learnings — router reads intel for precomputed answers; cache manager shares the graph query path). All agents from Phases 1–10 exist and can be audited for tier appropriateness.
**Requirements**: OPT-01 through OPT-10 (to be defined during plan-phase)
**Success Criteria** (what must be TRUE):
  1. **`gdd-router` skill** is invoked as the first step of every `/gdd:*` command. Given task intent + target artifacts, it returns `{path: fast|quick|full, model_tier_overrides, estimated_cost_usd, cache_hits}`. Cheap Haiku 4.5 call; gates every downstream spawn.
  2. **`gdd-cache-manager` skill** maintains `.design/cache-manifest.json` tracking warm agent prompts. `/gdd:warm-cache` pre-warms common agent system prompts in a single shot before a design sprint. Cache TTL config respects the 5-min prompt-cache window.
  3. **`.design/budget.json` config** — `per_task_cap_usd`, `per_phase_cap_usd`, `tier_overrides` (per-agent model), `auto_downgrade_on_cap`, `cache_ttl_seconds`. Read by every agent spawn. Hard caps enforced.
  4. **`PreToolUse` hook on Agent spawns** — intercepts every subagent invocation. Consults router decision, consults graph/intel for cached answers, consults budget tier overrides. Short-circuits spawn if answer exists; enforces tier from config; blocks on cap breach; logs token estimate to telemetry. Without the hook, optimization is advisory; with it, violations are impossible.
  5. **Model-tier audit complete** — every agent in `agents/` has a recommended tier in its frontmatter (`default-tier: haiku|sonnet|opus`) with rationale. Verifiers/checkers default Haiku; researchers/mappers default Sonnet; planners/critics default Opus. Overridable via `budget.json`.
  6. **Lazy checker spawning** — expensive quality-gate agents (design-verifier, UI-checker equivalents, security-auditor equivalents) are gated on cheap heuristics (did design-system paths change? did copy strings change?). Cheap Haiku gate runs first; full agent only on signal.
  7. **Cost telemetry** — `.design/telemetry/costs.jsonl` appends per-agent-spawn: `{ts, agent, tier, tokens_in, tokens_out, cache_hit, est_cost_usd, cycle, phase}`. Every phase run logs. Dataset for Phase 11's reflector.
  8. **`.design/agent-metrics.json` tracker** aggregates telemetry per agent: actual duration, gap-rate, deviation-rate, context-cost. Updated incrementally. Read by Phase 11's reflector to propose frontmatter updates.
  9. **`/gdd:optimize` command** reads telemetry + metrics, generates actionable cost-cut recommendations ("Planner agent costs avg $2.30/run but only changed spec in 20% of runs — consider gating", "Researcher cache hit rate is 15% — batch tasks"). No auto-apply; pure advisory.
  10. **Shared cached preamble** extracted from duplicated agent prompts — framework reference, deviation rules, commit conventions — into one preamble all agents import. First agent pays full cost, rest ride cache.
  11. **Streaming synthesizer pattern** — when orchestrators spawn N parallel agents (mappers, researchers), a Haiku synthesizer merges outputs to a compact summary before returning to main context. Main context eats the summary, not the raw N× reports.
  12. **Measured outcome**: baseline pipeline run on `test-fixture/` costs ≤50% of pre-Phase-10.1 baseline for the same work, with no regression on DESIGN-VERIFICATION.md gap count. Evidence captured in `test-fixture/baselines/phase-10.1/cost-report.md`.
**Plans**: 6 plans

Plans:
- [ ] 10.1-01-PLAN.md — `gdd-router` skill + `.design/budget.json` schema + PreToolUse hook enforcing tier overrides, cap checks, and cached-answer short-circuits (OPT-01, OPT-02, OPT-03)
- [ ] 10.1-02-PLAN.md — `gdd-cache-manager` skill + `/gdd:warm-cache` command + `.design/cache-manifest.json` + cache-aware agent-prompt ordering convention documented in `agents/README.md` (OPT-04, OPT-05)
- [ ] 10.1-03-PLAN.md — Model-tier audit: add `default-tier` + rationale to every agent's frontmatter; extract shared cached preamble; document tier-selection guide in `reference/model-tiers.md` (OPT-06, OPT-07)
- [ ] 10.1-04-PLAN.md — Lazy checker spawning: Haiku gate agents for design-verifier / security-audit / UI-check triggers; streaming synthesizer pattern for parallel-mapper + parallel-researcher orchestrators (OPT-08)
- [ ] 10.1-05-PLAN.md — Cost telemetry (`.design/telemetry/costs.jsonl`) + `.design/agent-metrics.json` tracker + `/gdd:optimize` recommendation command + cost-report generation for baselines (OPT-09, OPT-10)
- [ ] 10.1-06-PLAN.md — **Phase closeout**: bump version to v1.0.4.1 (off-cadence decimal-phase patch); refresh README.md (optimization layer section, budget config, warm-cache command, optimize command, model tiers); refresh plugin.json + marketplace.json (version, description, keywords — add "cost-optimization", "cache-aware", "budget"); append CHANGELOG.md v1.0.4.1 entry; lock regression baseline at `test-fixture/baselines/phase-10.1/` including `cost-report.md` (MAN-10a, MAN-10b)

### Phase 11: Self-Improvement
**Goal**: Leverage Phase 10's knowledge layer to close the improvement loop. Post-cycle reflection becomes data-driven — the plugin observes what worked, what misfired, and proposes concrete changes to its own reference files, agent frontmatter, and discussant question pool. User reviews every proposed change; nothing auto-ships. Over N cycles, the plugin gets sharper on *this user's projects* — less noise, fewer redundant questions, better-tuned duration estimates, richer reference knowledge.
**Depends on**: Phase 10 (consumes `.design/intel/` + `.design/learnings/` — without learnings, reflection has nothing to reflect on). Phase 10.1 (consumes `.design/telemetry/costs.jsonl` + `.design/agent-metrics.json` — reflector proposes frontmatter updates from measured data, so Phase 10.1's measurement layer must exist first).
**Requirements**: SLF-01 through SLF-08 (to be defined during plan-phase)
**Success Criteria** (what must be TRUE):
  1. `design-reflector` agent runs at cycle completion (hooked into `/gdd:audit`). Reads `.design/intel/`, `.design/learnings/`, `.design/telemetry/costs.jsonl`, `.design/agent-metrics.json`, STATE.md history, and DESIGN-VERIFICATION.md. Produces `.design/reflections/<cycle-slug>.md` with: what surprised us, which decisions recurred, which agents over/under-performed on cost vs quality, which anti-patterns appeared N times, which discussant questions got low-value answers.
  2. **Frontmatter feedback loop**: reflector reads Phase 10.1's `.design/agent-metrics.json` and proposes updates to agent frontmatter (`typical-duration-seconds` from measured data, `default-tier` downgrades when Haiku proved sufficient, `parallel-safe` downgrades if conflicts seen, `reads-only: false` if write patterns detected). User reviews via `/gdd:apply-reflections` — diff + confirm.
  3. **Reference-update proposer**: when N≥3 cycles flag the same missing anti-pattern, same missing heuristic, or same reference gap, reflector drafts an addition to `reference/anti-patterns.md` / `reference/heuristics.md` / a new reference file. User reviews and applies via `/gdd:apply-reflections`.
  4. **Discussant question-quality feedback**: discussant logs which questions got "don't know / doesn't matter / not relevant" answers. After N cycles, reflector proposes pruning or rewording low-value questions. User reviews.
  5. **Global skills layer**: `~/.claude/gdd/global-skills/` — cross-project codified decisions (e.g., "I always use oklch colors"). Loaded alongside project-local `./.claude/skills/` via CLAUDE.md routing. Populated from reflections that user promotes from project-local to global.
  6. **Budget-config feedback loop**: reflector proposes updates to `.design/budget.json` when telemetry shows sustained over/underspend per agent or consistent cap breaches. User reviews.
  7. `/gdd:reflect` runs the reflector on demand (not just at cycle completion). Useful for mid-cycle retrospectives or when investigating "why did the last verify fail?" or "why did this cycle cost 3× the last one?"
  8. All reflector outputs are **proposals**, never auto-applied. User-review discipline parallels figma-writer's proposal→confirm from Phase 8. `--dry-run` previews without writing reflection file.
**Plans**: 5 plans

Plans:
- [ ] 11-01-PLAN.md — `design-reflector` agent + `.design/reflections/` artifact layout + `/gdd:reflect` command + integration with `/gdd:audit` (SLF-01, SLF-02)
- [ ] 11-02-PLAN.md — Frontmatter feedback-loop proposer (reads Phase 10.1's agent-metrics.json; proposes `typical-duration-seconds`, `default-tier`, `parallel-safe`, `reads-only` updates); budget-config feedback-loop proposer (SLF-03, SLF-04)
- [ ] 11-03-PLAN.md — Reference-update proposer (N-cycle pattern detection → reference/ file additions); `/gdd:apply-reflections` review + apply command; user-review discipline (SLF-05, SLF-06)
- [ ] 11-04-PLAN.md — Discussant question-quality feedback loop; global skills layer at `~/.claude/gdd/global-skills/`; promotion flow from project-local to global (SLF-07, SLF-08)
- [ ] 11-05-PLAN.md — **Phase closeout**: bump version to v1.0.5; refresh README.md (self-improvement section, reflector flow, global skills, reference-update proposer, budget feedback loop); refresh plugin.json + marketplace.json (version, description, keywords — add "self-improvement", "reflection"); append CHANGELOG.md v1.0.5 entry; lock regression baseline at `test-fixture/baselines/phase-11/` (MAN-11, MAN-12)

### Phase 12: Test Coverage
**Goal**: gdd has a real test suite — currently zero tests exist. Port GSD's structural/categorical test patterns (adapted to gdd's agents + commands + pipeline), add gdd-unique coverage for features GSD doesn't have (visual verification, mapper JSON schemas, parallelism decision engine verdicts, sketch variant determinism, connection probes with mocked MCPs, figma-writer dry-run discipline, reflection-proposal safety). Every prior phase's regression baseline (constraint 10) is locked down from this phase forward — no later phase ships without passing the full suite.
**Depends on**: All prior phases (tests validate their features). Can start partial work earlier, but final coverage requires features shipped by 7–11.
**Requirements**: TST-01 through TST-30 (to be defined during plan-phase)
**Rationale — why Phase 12 and not inline**: Testing-as-we-go was attempted in Phases 1–6; the result is zero tests. Separating the test-infrastructure phase acknowledges reality: building tests properly requires a test runner, CI pipeline, fixtures, mocked MCPs, and a full agent-size-budget pattern — none of which are trivial. Dedicating a phase ensures coverage actually lands instead of being perpetually deferred. Tests for features shipped in Phases 7–11 are written in Phase 12 retrospectively using locked regression baselines as ground truth.

**Success Criteria** (what must be TRUE):

*Infrastructure (Wave A):*
  1. `tests/` directory exists with a Node test runner (node:test + node:assert/strict, matching GSD's convention). `package.json` adds `"scripts": { "test": "node --test tests/" }`.
  2. CI (GitHub Actions) runs the test suite on every push + PR across Node 22 + 24 matrix + Linux/macOS/Windows matrix.
  3. `tests/helpers.cjs` provides shared fixtures + mock MCPs + fake `.design/` scaffolder.
  4. `test-fixture/baselines/phase-<N>/` — regression baselines for Phases 7–11 plus Phase 10.1 captured as golden files (Phase 10.1's baseline includes `cost-report.md`); Phase 12 parses and compares.

*Ported from GSD with gdd-specific tuning (Wave B):*
  5. **`agent-frontmatter.test.cjs`** — every `agents/design-*.md` has required fields (name, description, tools, color) + Phase 7 additions (parallel-safe, typical-duration-seconds, reads-only, writes)
  6. **`agent-size-budget.test.cjs`** — tiered line-count limits (XL/LARGE/DEFAULT); rationale required in PR to raise
  7. **`agent-required-reading-consistency.test.cjs`** — `<required_reading>` blocks reference real files; no stale `@file` paths
  8. **`config.test.cjs`** — `.design/config.json` schema validation (model_profile + parallelism object)
  9. **`commands.test.cjs`** / **`command-count-sync.test.cjs`** — every command in README/SKILL.md exists; every skill's argument-hint frontmatter is consistent
  10. **`hook-validation.test.cjs`** — `hooks/hooks.json` entries point to real files; hooks execute without errors
  11. **`stale-colon-refs.test.cjs`** — no `/design:<cmd>` refs left after pipeline reshape; all commands use `/gdd:` namespace
  12. **`schema-drift.test.cjs`** — `reference/STATE-TEMPLATE.md` matches what stages actually write
  13. **`atomic-write.test.cjs`** — `.design/STATE.md` writes are atomic (no half-written files under concurrent stage exits)
  14. **`frontmatter.test.cjs`** — frontmatter parser handles edge cases (quoted arrays, multi-line values, Windows CRLF)
  15. **`model-profiles.test.cjs`** — profile resolution per agent (quality/balanced/budget)
  16. **`read-injection-scanner.test.cjs`** — PostToolUse hook blocks known injection patterns
  17. **`verify-health.test.cjs`** — `/gdd:health` output shape matches contract
  18. **`worktree-safety.test.cjs`** — `--parallel` mode prevents cross-worktree file writes; no `git clean` in worktree context
  19. **`semver-compare.test.cjs`** — version bump sequence validator (1.0.1 → 1.0.2 → 1.0.3, no jumps)

*gdd-unique coverage (Wave C):*
  20. **`pipeline-smoke.test.cjs`** — runs Brief → Explore → Plan → Design → Verify end-to-end on `test-fixture/`; diffs output against locked baseline per phase
  21. **`mapper-schema.test.cjs`** — validates `.design/map/*.json` emits from each of the 5 mappers against JSON schemas in `reference/intel-schema.md` (enables Phase 10 intel consumption)
  22. **`parallelism-engine.test.cjs`** — given (settings + task list + agent frontmatter), decision engine verdict matches expected serial/parallel/wave breakdown per rule in `reference/parallelism-rules.md`
  23. **`sketch-determinism.test.cjs`** — `/gdd:sketch` with identical inputs produces N variants with deterministic structure (same files, same sections, content may vary per model but skeleton locked)
  24. **`cycle-lifecycle.test.cjs`** — `/gdd:new-cycle` → stage progression → `/gdd:audit` → cycle complete; STATE.md `cycle:` frontmatter transitions correctly; CYCLE-SUMMARY.md shape matches contract (enables Phase 10 learnings extraction)
  25. **`connection-probe.test.cjs`** — each connection (figma, refero, preview, storybook, chromatic, graphify, claude-design, pinterest) probe logic works with mocked MCP responses (available / unavailable / not_configured)
  26. **`figma-writer-dry-run.test.cjs`** — figma-writer in `--dry-run` mode never invokes `use_figma`; proposal output matches contract
  27. **`reflection-proposal.test.cjs`** — `design-reflector` output is always proposal-shaped; `/gdd:apply-reflections` requires explicit confirmation; no auto-apply path
  28. **`deprecation-redirect.test.cjs`** — references to deprecated names (`scan`, `discover`, `design-pattern-mapper`, `design-context-builder`) log deprecation warning with migration guidance per DEPRECATIONS.md
  29. **`nng-coverage.test.cjs`** — every NNG heuristic declared in `reference/heuristics.md` is covered by at least one verifier check OR flagged `? VISUAL` with reasoning
  30. **`touches-analysis.test.cjs`** — plan tasks' `Touches:` field is parseable; parallelism engine correctly identifies disjoint/overlapping sets
  31. **`intel-consistency.test.cjs`** (Phase 10) — `.design/intel/` JSON stays in sync with filesystem on incremental updates; no orphan entries after file deletion
  32. **`regression-baseline.test.cjs`** — every phase's locked `test-fixture/baselines/phase-<N>/` output matches current pipeline execution; fails on drift, prompts explicit baseline re-lock

**Plans**: 6 plans across 3 waves

**Wave A — Infrastructure (2 plans):**
- [x] 12-01-PLAN.md — Test runner setup (node:test + node:assert/strict); `tests/` directory + `tests/helpers.cjs`; `package.json` scripts; CI workflow (GitHub Actions matrix: Node 22/24 × Linux/macOS/Windows) (TST-01, TST-02, TST-03)
- [x] 12-02-PLAN.md — Regression baseline capture: lock Phase 7–11 + Phase 10.1 outputs to `test-fixture/baselines/phase-<N>/`; baseline-diff test harness; baseline re-lock workflow with explicit user confirmation (TST-04, TST-05)

**Wave B — Ported structural tests (2 plans):**
- [ ] 12-03-PLAN.md — Agent hygiene: frontmatter validation, size-budget tiers, required_reading consistency, stale-ref detection (TST-06, TST-07, TST-08, TST-09)
- [ ] 12-04-PLAN.md — Configuration + commands + hooks: config.json schema, command-count sync, hook validation, atomic-write, frontmatter parser, model-profile resolution, verify-health shape, worktree safety, semver sequence (TST-10 through TST-17)

**Wave C — gdd-unique tests (2 plans):**
- [ ] 12-05-PLAN.md — Pipeline + data: pipeline-smoke, mapper-schema, parallelism-engine, touches-analysis, cycle-lifecycle, intel-consistency (Phase 10), regression-baseline (TST-18 through TST-24)
- [ ] 12-06-PLAN.md — Feature correctness: sketch-determinism, connection-probe (all 8 connections mocked), figma-writer-dry-run, reflection-proposal, optimization-layer enforcement (router decisions, budget-hook blocking, cache-manager correctness, lazy-spawn gates), deprecation-redirect, NNG coverage, injection-scanner (TST-25 through TST-32)
- [ ] 12-07-PLAN.md — **Phase closeout**: bump version to v1.0.6; refresh README.md (testing section, CI badge, coverage summary); refresh plugin.json + marketplace.json (version, description, keywords — add "tested", "ci"); append CHANGELOG.md v1.0.6 entry; **from this point forward, every PR MUST pass the test suite** — add CONTRIBUTING.md note (MAN-13, MAN-14)

**Implementation notes — what gdd borrows from GSD and what's new:**

| Source of test | Approach | Count |
|----------------|----------|-------|
| **Borrowed** — near-1:1 port from GSD (~100 structural tests GSD ships), adapted to gdd schema + file paths | Read GSD test, swap path/name constants, adapt assertions | ~15 test files (Wave B) |
| **Adapted** — GSD has the concept but gdd needs gdd-specific logic (parallelism engine, cycle lifecycle, model profiles) | Same scaffolding pattern, gdd's actual decision logic | ~8 test files (Wave B + C) |
| **Net-new** — gdd concepts GSD doesn't have (NNG heuristics, visual verification, sketch variants, connection mocks for Figma/Storybook/Chromatic/Graphify, figma-writer, reflection proposals) | Written from scratch | ~10 test files (Wave C) |

### Phase 13: CI/CD
**Goal**: Full continuous-integration pipeline layered on Phase 12's basic test runner. Every push validates markdown + JSON schemas + frontmatter + links + shell scripts across Linux/macOS/Windows and Node 22/24. Every version bump auto-tags, auto-releases, and runs a release-time smoke test that installs the tagged plugin fresh and runs the pipeline on `test-fixture/`. PR template + branch protection enforce version-bump + CHANGELOG + baseline relock per phase closeout. This is the automation wrapper that makes constraints 10–13 self-enforcing instead of manual discipline.
**Depends on**: Phase 12 (tests must exist before CI orchestrates them). Sequential, not parallel.
**Requirements**: CICD-01 through CICD-15 (to be defined during plan-phase)

**Success Criteria** (what must be TRUE):

*After Wave A (Validation + Lint):*
  1. `.github/workflows/ci.yml` runs on every push + PR with matrix: Node 22/24 × Linux/macOS/Windows. All green is required to merge (via branch protection configured in Wave B).
  2. Markdown lint passes (link checker, heading structure, line-length caps per Phase 12 size-budget). Broken `@file` references and broken Markdown links fail the build.
  3. JSON schema validation runs on `plugin.json`, `marketplace.json`, `hooks/hooks.json`, `.design/config.json` schema, `.design/intel/*.json` schema (from Phase 10). Schemas live in `reference/schemas/`.
  4. Frontmatter validator enforces every `agents/*.md` frontmatter conforms (per Phase-7 hygiene spec: name, description, tools, color, parallel-safe, typical-duration-seconds, reads-only, writes).
  5. Stale-ref detector fails on any `/design:*` (legacy namespace) or references to deprecated agent names (`design-context-builder`, `design-pattern-mapper` as single blob, `scan`/`discover` stages) per DEPRECATIONS.md.
  6. `claude plugin validate .` runs headlessly in CI (when CLI supports it; fallback: schema-only validation).
  7. `shellcheck` passes on `scripts/bootstrap.sh` and any other shell files. Hardcoded-path detection flags OS-specific paths.

*After Wave B (Security + Quality gates):*
  8. `gitleaks` (or equivalent) scans every PR for accidentally committed secrets. Historical git history scanned on initial setup.
  9. `gdd-read-injection-scanner` hook runs in CI mode against all shipped `reference/*`, `skills/**/SKILL.md`, `agents/*.md`. Catches prompt-injection attempts in shipped content.
  10. Agent size-budget test from Phase 12 runs blockingly — agents exceeding their tier fail the build; rationale required in PR to raise.
  11. PR template at `.github/pull_request_template.md` checklist: phase affected / version bumped Y-N / CHANGELOG updated Y-N / baselines relocked Y-N / tests pass. Self-review workflow for solo maintainer.
  12. Branch protection on `main`: required status checks (all CI green), no force-push, linear history. CODEOWNERS file pins review paths.

*After Wave C (Release automation + closeout):*
  13. Version-bump detector: workflow triggers when `plugin.json` `version` field changes in a merged commit. Auto-creates git tag `v<version>`, auto-creates GitHub Release with the matching `CHANGELOG.md` v-entry as release body.
  14. **Release-time smoke test**: on tag creation, a fresh GitHub Actions runner does `git clone` → install tagged version → invokes `/gdd:explore` on `test-fixture/` → diffs output against `test-fixture/baselines/phase-<N>/`. Failure rolls back the release tag.
  15. Marketplace publish webhook fires on successful tag (placeholder until a marketplace registry exists; no-op today but workflow step is in place).
  16. README CI badges render (build status, test count, coverage %, latest version, license).
  17. CONTRIBUTING.md documents the CI/CD contract: branch strategy, PR checklist, required checks, version-bump workflow, how to relock baselines.
  18. Phase closes out at v1.0.7 with refreshed README, manifests, CHANGELOG entry, and regression baseline locked at `test-fixture/baselines/phase-13/`.

**Plans**: 8 plans across 3 waves

**Wave A — Validation + Lint (3 plans):**
- [ ] 13-01-PLAN.md — Base `.github/workflows/ci.yml` with cross-platform matrix (Node 22/24 × Linux/macOS/Windows); runs Phase 12 test suite on every push/PR; fast-fail ordering (CICD-01, CICD-02)
- [ ] 13-02-PLAN.md — Markdown + JSON lint: link checker, markdown structure rules, `reference/schemas/` JSON schemas for plugin.json/marketplace.json/hooks.json/config.json/intel schemas; frontmatter validator; stale-ref detector (CICD-03, CICD-04, CICD-05)
- [ ] 13-03-PLAN.md — Plugin validation: `claude plugin validate .` CI integration (or schema-only fallback); `shellcheck` on bash scripts; hardcoded-path detection (CICD-06, CICD-07)

**Wave B — Security + Quality gates (2 plans):**
- [ ] 13-04-PLAN.md — Secrets scanning (`gitleaks`); injection-scanner CI mode against all shipped files; dependency audit placeholder; blocking agent size-budget enforcement (CICD-08, CICD-09, CICD-10)
- [ ] 13-05-PLAN.md — PR template + branch protection config + CODEOWNERS; version-bump required note; baseline-relock checklist item (CICD-11, CICD-12)

**Wave C — Release automation + closeout (3 plans):**
- [ ] 13-06-PLAN.md — Auto-tag workflow: detect `plugin.json` version bump on `main`, create `v<version>` tag, create GitHub Release with CHANGELOG.md matching entry as body (CICD-13)
- [ ] 13-07-PLAN.md — Release-time smoke test: fresh-checkout install of tag → run `/gdd:explore` on `test-fixture/` → diff vs baseline; rollback-on-fail; marketplace webhook placeholder (CICD-14)
- [ ] 13-08-PLAN.md — **Phase closeout**: bump to v1.0.7; README CI badges (build, tests, coverage, version); CONTRIBUTING.md documenting CI/CD contract; append CHANGELOG.md v1.0.7 entry; lock regression baseline at `test-fixture/baselines/phase-13/` (CICD-15, MAN-15, MAN-16)

**CI/CD design notes:**

- **No parallel with Phase 12**: CI/CD extends Phase 12's workflow file. Sequential execution.
- **Direct-to-main workflow preserved**: user's existing workflow is direct pushes to `main`. CI runs on every push; branch protection in Wave B is configurable — can start "advisory" (checks run but don't block) and tighten later.
- **MCP mocking**: connection probes in CI use Phase 12's mocked MCP fixtures (Figma, Refero, Preview, Storybook, Chromatic, Graphify). Real MCPs never called from CI.
- **Artifact preservation**: every CI run uploads `.design/` outputs as workflow artifacts for post-hoc debugging. Retained 30 days.
- **Performance gate**: agent-size-budget is a perf gate — larger agents cost more context per spawn. Phase 12 has the test; Phase 13 makes it blocking.
- **Cross-runtime scope**: gdd targets Claude Code primarily. Multi-runtime support (Codex, Cline, Cursor) per GSD's pattern is deferred to later phases.
- **Token-usage tracking**: baseline pipeline runs emit `.design/telemetry/costs.jsonl` + `cost-report.md` from Phase 10.1's optimization layer. Phase 13 CI reads the cost report and alerts on cost regression vs prior baseline — no new infrastructure needed here.

### Phase 14: AI-Native Design Tool Connections
**Goal**: Integrate gdd with AI-native design tools that ship their own MCP servers — **paper.design** and **pencil.dev** — and establish a unified canvas-connection interface so future AI-native design tools (Subframe, v0.dev, Galileo AI, Builder.io Visual Copilot, Locofy, Anima, Plasmic, TeleportHQ) plug in via the same contract. These tools differ architecturally from Phase 8's rendering/verification connections (Preview, Storybook, Chromatic) and from Phase 8's Figma writer — they **are the canvas**, not a verification layer or a reference source. gdd reads the canvas, runs the full Brief→Verify pipeline on the implementation it produces, and writes results back as annotations on the canvas. Closes the **canvas → code → verify → canvas** round-trip in one tool.
**Depends on**: Phase 8 (follows frozen connection-doc template from plan 08-01; follows figma-writer proposal→confirm pattern from plan 08-04). Can run in parallel with Phases 9/10/11/12/13/14 once Phase 8 has merged its 08-01 template.
**Target version**: v1.0.8
**Requirements**: AIDT-01 through AIDT-12 (to be defined during plan-phase)

**Success Criteria** (what must be TRUE):

*paper.design integration:*
  1. `connections/paper-design.md` documents setup (install command, auth flow), probe pattern (ToolSearch for `mcp__paper*` tools), per-tool capability matrix (all 24 MCP tools catalogued), and fallback behavior (degrade to code-only when absent).
  2. Explore stage reads selection via `get_selection`, component tree via `get_jsx`, design intent via `get_computed_styles`; synthesizer consumes these as input alongside existing sources (Figma variables, Refero refs, Pinterest refs, Storybook metadata).
  3. Verify stage attaches screenshots via `get_screenshot` for NNG heuristics flagged `? VISUAL` (overlaps with Phase 8 Preview but paper.design is canvas-scoped — single component in isolation — while Preview is route-scoped).
  4. `agents/paper-writer.md` follows figma-writer's proposal→confirm pattern — three modes: **annotate** (post DESIGN-DEBT findings as canvas comments), **tokenize** (sync CSS tokens → paper.design design-tokens via `update_styles`), **roundtrip** (write implementation status back as text layers via `set_text_content` / `write_html`).
  5. MCP-call budgeting: free tier = 100/week, Pro = 1M/week. Agent tracks usage, warns before exhaustion, reports current usage in STATE.md `<connections>` — integrates with Phase 10.1's budget hook.

*pencil.dev integration:*
  6. `connections/pencil-dev.md` documents setup (VS Code/Cursor extension install, `.pen` file discovery), probe pattern, and `.pen` file handling (git-tracked source of truth).
  7. Explore stage discovers `.pen` files in the project, treats them as canonical design source (like Storybook's `stories.json` is canonical for inventory). Synthesizer merges `.pen` declarations with code implementation.
  8. `agents/pencil-writer.md` writes DESIGN-DEBT annotations + implementation status back into `.pen` files via pencil.dev MCP. Commits to git atomically (same pattern as design-executor).
  9. Because `.pen` files are git-tracked, verify stage can run pre-merge diff: "does the implementation match the `.pen` spec?" — stronger than Figma comparison because both sides are version-controlled.

*Unified canvas-connection interface:*
  10. `reference/canvas-connection-interface.md` documents a capability-based contract: `read(selection) → { jsx, styles, screenshot, metadata }`, `write(proposal) → { confirmed | rejected }`, `probe() → { available | unavailable | not_configured }`. Any future AI-native design tool with an MCP implements this surface to integrate.
  11. `connections/connections.md` capability matrix gains a **"canvas"** column distinguishing canvas-tool connections (paper, pencil, future) from rendering (preview, storybook, chromatic), reference (refero, pinterest, graphify), and design-system (figma-desktop, figma-writer).
  12. Backlog entry in `connections/connections.md` lists candidate tools (Subframe, v0.dev, Galileo AI, Builder.io Visual Copilot, Locofy, Anima, Plasmic, TeleportHQ) with priority tags — so future additions follow the same contract without reinvention.
  13. Phase closes out at v1.0.8 with refreshed README (canvas connections section, paper + pencil walkthroughs), manifest keywords, CHANGELOG entry, baseline locked.

**Plans**: 6 plans across 3 waves

**Wave A — paper.design (2 plans):**
- [ ] 14-01-PLAN.md — `connections/paper-design.md` (setup + probe + 24-tool matrix + fallback); explore-stage read integration (selection, jsx, computed styles); verify-stage screenshot integration; MCP-call budget tracking in STATE.md (AIDT-01, AIDT-02, AIDT-03)
- [ ] 14-02-PLAN.md — `agents/paper-writer.md` (annotate / tokenize / roundtrip modes; proposal→confirm + dry-run + shared-file guard following figma-writer template) (AIDT-04)

**Wave B — pencil.dev + unified interface (3 plans):**
- [ ] 14-03-PLAN.md — `connections/pencil-dev.md` (setup + `.pen` file discovery + probe); explore-stage integration (`.pen` as canonical design source); synthesizer merges `.pen` with code (AIDT-05, AIDT-06)
- [ ] 14-04-PLAN.md — `agents/pencil-writer.md` (annotate + roundtrip modes, atomic git commits on `.pen` writes); pre-merge spec-vs-implementation diff in verify stage (AIDT-07, AIDT-08)
- [ ] 14-05-PLAN.md — `reference/canvas-connection-interface.md` (capability-based contract spec); `connections/connections.md` capability matrix with "canvas" column; backlog entry for Subframe / v0.dev / Galileo / Builder.io / Locofy / Anima / Plasmic / TeleportHQ (AIDT-09, AIDT-10, AIDT-11)

**Wave C — closeout (1 plan):**
- [ ] 14-06-PLAN.md — **Phase closeout**: bump to v1.0.8; refresh README.md (canvas connections section, paper + pencil setup walkthroughs, capability matrix); refresh plugin.json + marketplace.json (version, keywords: "paper-design", "pencil-dev", "ai-native-design"); append CHANGELOG.md v1.0.8 entry; lock regression baseline at `test-fixture/baselines/phase-14/` (AIDT-12, MAN-17, MAN-18)

**Phase 14 design notes:**

- **Architectural distinction** — canvas connections are a new category alongside rendering / reference / design-system. Matrix row in `connections/connections.md` must reflect this.
- **Unified interface prevents fragmentation** — without plan 14-05's contract, every new AI-native design tool would need a bespoke integration. With it, adding Subframe or v0.dev becomes a connection-doc + capability-mapping exercise, not a new architecture.
- **paper.design free-tier limit** — 100 MCP calls/week. Agents must track and warn before exhaustion; Pro unlock optional per user. Integrates with Phase 10.1's budget governance.
- **pencil.dev git-tracked `.pen` files** — unique property. Enables pre-merge diff verification that other canvas tools can't offer. The `.pen` file becomes part of the review artifact.
- **Overlap with Phase 8 Preview** — paper.design screenshots via `get_screenshot` overlap with Phase 8's Preview/Playwright route rendering. Not redundant: paper is canvas-element-scoped (one component in isolation); Preview is route-scoped (full page context). Both shipped; agent picks per task scope.
- **Round-trip closes the design loop** — Figma (Phase 8) is reference + annotate. paper + pencil (Phase 14) is full round-trip — canvas is source AND destination. Distinguishing this in docs matters.

## Parallelization: Phase 7 + Phase 8

Phase 7 and Phase 8 can run in parallel in separate Claude Code sessions via git worktrees, with one coordination discipline at the seams. The two phases address **orthogonal axes**:

- **Phase 7** = internal pipeline/agent architecture. Primarily touches `agents/` (new: discussant, 5 mappers, synthesizer), `skills/*/SKILL.md` (discover orchestrator rewire, scan orchestrator rewire), `reference/STATE-TEMPLATE.md`, `.design/config.json` schema, new commands under a command surface.
- **Phase 8** = external connection layer. Primarily touches `connections/` (4 new docs), `agents/design-figma-writer.md` (1 new file), capability matrix. Stage-integration edits in `skills/*/SKILL.md` are the only surface that overlaps with Phase 7.

**Recommended parallel execution:**

1. Both phases start in separate worktrees (e.g., `wt-phase-7`, `wt-phase-8`), each branched off `main`.
2. Phase 7 lands its **skill orchestrator rewrites first** (plans 07-01 through 07-04 touch `skills/discover/SKILL.md`, `skills/scan/SKILL.md`, agent lists). Merge to `main`.
3. Phase 8's **isolated-file work** (connections/*.md, figma-writer agent) happens in parallel through the entire Phase 7 run — zero overlap.
4. Phase 8's **stage-integration plans (08-01, 08-02, 08-03)** rebase off `main` after Phase 7 merges its skill rewrites. These plans add connection probes into the newly-rewritten skill orchestrators — cleaner merge than applying probes to the old skill layout.
5. Final merge window: after both phases ship, a small `connections/connections.md` capability matrix reconciliation plan merges both phases' matrix additions.

**What not to do in parallel:**
- Both phases editing the same SKILL.md orchestrator simultaneously — serialize via the "Phase 7 first" rule above.
- Merging plugin.json changes concurrently — command registration goes through Phase 7; Phase 8 adds no new commands, only connection-probe flags.
- Shared REQUIREMENTS.md edits without rebase — each phase appends its own requirement block (GSD-* vs. VIS-*/FWR-*/STB-*/CHR-*) so additions don't collide, but phase-level table-of-contents edits need rebase.

**Trigger**: Kick off Phase 7 in session A with `/gsd:plan-phase 7`. In session B, kick off Phase 8 with `/gsd:plan-phase 8` **after Phase 7 Wave A merges to `main`** (Wave A ships the pipeline reshape + discussant + skill orchestrator rewrites, which is the only real seam between 7 and 8). Phase 8's isolated-file work (connection docs, figma-writer agent) can start immediately in parallel with Wave A. Phase 9 starts after both 7 and 8 are complete.

**Phase 7 wave checkpoints** give Phase 8 three clean rebase points — Wave A merge (minimum for Phase 8 integration plans), Wave B merge (preferred — architecture final), Wave C merge (Phase 7 done). Phase 8 does NOT need to wait for Wave C before merging its own plans; Wave C is exploration-layer work that doesn't reshape Phase 8's surface.

### Design constraints for Phase 7 + 8 — honor these to avoid rework in Phase 9/10/10.1/11

Phase 7 and 8 can run fully in parallel AND avoid double-work downstream **only if** these design constraints are honored during plan-phase and execution:

**Phase 7 must:**

1. **Mappers emit structured JSON as primary output**, markdown as rendered view. `.design/map/tokens.json` is the source of truth; `.design/map/tokens.md` is a pretty-print. Phase 10's `.design/intel/` reads JSON directly — zero re-serialization work.
2. **Agent frontmatter is extensible**. Mark `typical-duration-seconds` as "initial estimate, may be augmented." Phase 10.1 adds `default-tier` (tier override); Phase 11's reflector adds `measured-duration-seconds` without replacing. Document the extension path in `agents/README.md`.
3. **`/gdd:audit` uses list-based agent dispatch**, not hardcoded call to verifier + auditor. A list of audit agents that the command iterates. Phase 11 adds `design-reflector` to the list — zero Phase 7 refactor.
4. **Cycle completion writes a standard SUMMARY artifact** at `.design/cycles/<slug>/CYCLE-SUMMARY.md` with fixed sections: decisions, deviations, metrics, gaps, outcome. Phase 10 parses it; Phase 10.1 instruments it (telemetry entries per cycle); Phase 11 reflects on it. Agreeing on the shape NOW avoids later archeology.
5. **STATE.md schema versioned via `pipeline_state_version`** — commit to semver + migration notes when Phase 10/10.1/11 extend. Prevents silent breakage.
6. **Pipeline reshape (plan 07-00) is a breaking change but still bumps to v1.0.1** per sequential-versioning rule. Renaming skills + stages + STATE `stage:` enum breaks mid-flight users — migration guidance lands in DEPRECATIONS.md (plan 07-00) + release notes, not a version jump.
7. **DEPRECATIONS.md** lands in plan 07-00 documenting every renamed/merged/retired component (scan → explore, discover → explore, `design-pattern-mapper` → split, `design-context-builder` → `design-discussant`). Users get migration guidance.

**Phase 8 must:**

8. **Connection-doc template freezes in plan 08-01** (preview). All subsequent connection plans (08-02 storybook, 08-03 chromatic, 08-05 graphify) follow it. Phase 9 pre-work waits for the freeze.
9. **Graphify connection emits to a standard location** (`.design/graphify-output.json` or equivalent). Phase 10's native intel-updater consumes it opportunistically — graphify stays as the visualization/export layer, intel-updater stays as the query layer.

### Continuous improvement gaps (apply to every phase going forward)

10. **End-of-phase regression baseline**: each phase's final plan MUST include "run pipeline end-to-end on `test-fixture/`, capture output, commit as regression baseline under `test-fixture/baselines/phase-<N>/`." Without this, we drift; Phase 6 was the last validation phase.
11. **Version-bump + release cadence per phase** — sequential patch bumps, no version jumping: Phase 6 shipped v1.0.0. Phase 7 → v1.0.1. Phase 8 → v1.0.2. Phase 9 → v1.0.3. Phase 10 → v1.0.4. Phase 10.1 (INSERTED Optimization Layer) → v1.0.4.1 (off-cadence patch; does not shift subsequent cadence). Phase 11 → v1.0.5. Phase 12 → v1.0.6. Phase 13 → v1.0.7. Phase 14 → v1.0.8. Version bump is a task in each phase's final plan (not an afterthought). Breaking changes (like plan 07-00's pipeline reshape) are documented in DEPRECATIONS.md and release notes — versioning stays sequential per user directive.
12. **Deprecation audit** runs in `/gdd:health` from Phase 7 onwards — surfaces any user reference to deprecated agent names or stage labels, suggests migrations.
13. **README + manifest refresh per phase** — each phase's final plan MUST update README.md + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` so they reflect shipped state. Specifically:
    - README.md: command list, feature bullets, install section, stage diagram (Brief → Explore → Plan → Design → Verify → next after Phase 7), connection matrix (after Phase 8), bullet-point changelog pointer
    - `plugin.json`: `version`, `description`, `keywords` (add new feature keywords as phases ship)
    - `marketplace.json`: `version`, `description`, `keywords`
    - New artifact `CHANGELOG.md` at repo root: append entry per phase with date + target version + plan list — per Keep a Changelog format, matching GSD's convention
    - Each phase's final plan includes a "Manifest + README refresh" task that runs after all feature plans in the phase merge. No phase is "complete" until README accurately describes shipped reality — otherwise new users see a lying README.

### Phase 9 pre-work (optional third worktree)

Phase 9's plans as currently listed are **provisional** — Phase 7 reshapes its inputs (synthesizer replaces Area-5 fallback chains, discussant owns questioning, STATE schema expands, sketch/spike findings feed into context) and Phase 8 reshapes its primitives (connection-doc template, visual-diff machinery, figma-writer enabling bidirectional handoff). Plans 09-02/03/04 as originally written will dissolve into new plans against the post-7/8 architecture; plan 09-01 mostly survives.

**Safe parallel pre-work in a third worktree (`wt-phase-9-prep`):**
1. Research the Claude Design handoff bundle format (field catalogue, adapter requirements, sample bundles for fixtures)
2. Research Pinterest MCP capabilities (tools, auth, rate limits, probe pattern)
3. Draft `connections/pinterest.md` — **after** Phase 8's 08-01 freezes the connection-doc template
4. Draft `connections/claude-design.md` — same gating as (3)
5. Build test fixtures: sample handoff bundles + expected STATE.md `<decisions>` output (D-XX entries) for later validation

**Do NOT pre-work in parallel:**
- 09-03, 09-04, 09-05, 09-06, 09-07 plans — they depend on final Phase-7/8 architecture
- Any edits to `agents/design-context-builder.md`, `reference/STATE-TEMPLATE.md`, `plugin.json`, `skills/verify/SKILL.md`, or `connections/connections.md` — these are all being actively reshaped by Phases 7 and 8

**Transition**: After Phases 7 and 8 merge, rebase `wt-phase-9-prep` onto `main`, run `/gsd:plan-phase 9` to generate the final plan list against the new architecture, then execute. The research notes and drafted connection docs feed directly into the replanned Phase 9 — roughly ~30% of Phase 9's work is recoverable from pre-work, ~70% waits.

## Progress

**Execution Order:**
Phases 1 → 6 execute in numeric order. Phases 7 and 8 can run in parallel (see Parallelization section). Phase 9 depends on both 7 and 8. Phase 10 depends on Phase 8 (graphify connection). Phase 10.1 (INSERTED optimization layer) depends on Phase 10 — router reads intel as a cache; telemetry + cost governance lands before reflection has anything to reflect on. Phase 11 (self-improvement) depends on Phase 10 (learnings) + Phase 10.1 (telemetry + agent-metrics). Phase 12 depends on all prior phases (tests validate their features; regression baselines lock from here forward — including cost-report baseline from Phase 10.1). Phase 13 depends on Phase 12 (CI/CD orchestrates tests) — sequential, not parallel.

**Version sequence** (sequential patch bumps per user directive — no version jumps even on breaking changes): v1.0.0 (Phase 6) → v1.0.1 (Phase 7) → v1.0.2 (Phase 8) → v1.0.3 (Phase 9) → v1.0.4 (Phase 10) → **v1.0.4.1 (Phase 10.1 — INSERTED Optimization Layer, off-cadence patch)** → v1.0.5 (Phase 11 — Self-Improvement) → v1.0.6 (Phase 12 — Test Coverage) → v1.0.7 (Phase 13 — CI/CD) → v1.0.8 (Phase 14 — AI-Native Design Tool Connections).

| Phase | Plans Complete | Status | Target version | Completed |
|-------|----------------|--------|----------------|-----------|
| 1. Foundation + Distribution + Infrastructure | 5/5 | Complete | — | 2026-04-17 |
| 2. Core Agents + Stage Orchestration | 4/4 | Complete | — | 2026-04-17 |
| 3. Quality Gate Agents + Pipeline Polish | 6/6 | Complete | — | 2026-04-17 |
| 4. Connections Layer | 3/3 | Complete | — | 2026-04-17 |
| 5. Automation Agents + New Commands | 5/5 | Complete | — | 2026-04-17 |
| 6. Validation + Version Bump | 1/1 | Complete | v1.0.0 (rename reset) | 2026-04-18 |
| 7. GSD Parity + Exploration — Discussant, Ergonomics, Sketch/Spike, Pipeline Reshape | 0/17 (7 Wave A + 6 Wave B + 4 Wave C incl. closeout) | Planned | v1.0.1 | - |
| 8. Visual + Design-Side Connections + Knowledge Graph | 0/7 (6 feature + 1 closeout) | 3/7 | In Progress|  |
| 9. Claude Design Integration + Pinterest Connection | 0/8 (7 provisional + 1 closeout — replan after 7 + 8) | Planned | v1.0.3 | - |
| 10. Knowledge Layer — `.design/intel/`, learnings, dependencies, responsibility mapping | 0/6 (5 feature + 1 closeout) | Planned | v1.0.4 | - |
| **10.1. Optimization Layer + Cost Governance (INSERTED)** — router, cache manager, budget enforcement, telemetry, model tiers, lazy spawning, /gdd:optimize | 0/6 (5 feature + 1 closeout) | Planned | v1.0.4.1 | - |
| 11. Self-Improvement — reflector, frontmatter feedback, reference-update proposer, budget feedback, global skills | 0/5 (4 feature + 1 closeout) | Planned | v1.0.5 | - |
| 12. Test Coverage — ported GSD patterns + gdd-unique tests + optimization-layer tests + basic CI + regression baselines | 2/7 (6 plans + 1 closeout across 3 waves) | In Progress | v1.0.6 | - |
| 13. CI/CD — lint, validate, security, release automation, branch protection, smoke-on-release | 0/8 (7 plans + 1 closeout across 3 waves) | Planned | v1.0.7 | - |
| 14. AI-Native Design Tool Connections — paper.design + pencil.dev + unified canvas interface | 0/6 (5 plans + 1 closeout across 3 waves) | Planned | v1.0.8 | - |

## Deferred commands backlog (GSD-parity commands not yet scheduled)

After auditing all 80 GSD commands, these are medium-value ports deferred out of Phase 7 to avoid scope bloat. Each has a target phase where it fits logically. Not committed to a plan yet — will be scheduled when the target phase is planned.

| GSD command | Target phase | Why deferred | Fit |
|-------------|--------------|--------------|-----|
| `/gsd-code-review` + `/gsd-code-review-fix` | Phase 8 or Phase 10 | Code review on design-stage output before ship; overlaps with `design-fixer` but adds bug/security/quality axis | Adds `/gdd:code-review` + `/gdd:code-review-fix` commands; new `design-code-reviewer` agent |
| `/gsd-forensics` | Phase 11 | Post-mortem investigation for failed flows — pairs with reflector, not useful without learnings data | `/gdd:forensics` reads cycle history + agent metrics (from Phase 10.1 telemetry) to diagnose "what went wrong" |
| `/gsd-profile-user` → `/gdd:profile-designer` | Phase 11 | Designer behavior profile feeds self-improvement; needs cycle history | "Always starts with typography", "hates long forms" → feeds discussant question prioritization |
| `/gsd-docs-update` | Phase 10 | Design-system docs sync — needs intel store to verify doc claims against actual tokens/components | `/gdd:docs-update` generates/updates DESIGN-SYSTEM.md + component docs verified against `.design/intel/` |
| `/gsd-session-report` | Phase 10.1 | Token usage + work summary + outcomes — sits on top of Phase 10.1 telemetry; feeds Phase 11 reflector | `/gdd:session-report` at cycle end reads `.design/telemetry/costs.jsonl` + `.design/agent-metrics.json` and emits a human-readable summary |
| `/gsd-manager` | Later (post-Phase-11) | Interactive command center for multi-cycle parallel work — needs cycle layer mature + multiple active cycles | `/gdd:manager` surfaces all active cycles in one TUI view |
| `/gsd-thread` | Later (post-Phase-11) | Persistent context threads for parallel design work | `/gdd:thread` — typography redesign + component refactor as parallel threads |
| `/gsd-list-workspaces` + `/gsd-new-workspace` + `/gsd-remove-workspace` + `/gsd-workstreams` | Later | Workspace management for parallel gdd work across projects | `/gdd:workspace <list\|new\|remove>` + `/gdd:workstreams` |
| `/gsd-audit-uat` | Phase 10 | Cross-cycle UAT audit — outstanding verify items across cycles | `/gdd:audit-uat` reports unresolved must-haves across cycle history |
| `/gsd-plan-milestone-gaps` | Phase 10 | Post-audit gap closure — creates phases to close identified gaps | `/gdd:plan-gaps` after `/gdd:audit` creates the gap-closure cycle |
| `/gsd-milestone-summary` | Phase 10 | Cycle onboarding doc for team sharing | `/gdd:cycle-summary` generates comprehensive handoff doc from cycle artifacts |
| `/gsd-audit-fix` | Later | Autonomous audit-to-fix — more aggressive than `design-fixer`; overlaps, requires user trust threshold | Could land as `/gdd:audit --fix` mode |

**Explicitly skipped (low-value for gdd)**:

- `/gsd-inbox` (GitHub issue triage — not design-specific)
- `/gsd-ai-integration-phase` + `/gsd-eval-review` (AI-framework selection — not relevant; gdd IS the AI/design framework)
- `/gsd-ultraplan-phase` (BETA, remote plan offload — specific Claude Code cloud feature)
- `/gsd-autonomous` (run all phases autonomously — too aggressive for design, human-in-loop is the point)
- `/gsd-review` (cross-AI peer review — niche, not design-specific)
- `/gsd-secure-phase` (threat mitigation check — code-centric, not design)
- `/gsd-import` + `/gsd-from-gsd2` (Phase 9 covers the handoff import use case)
- `/gsd-ui-phase` (overlaps with gdd's Brief stage — folded into 07-00)
- `/gsd-ui-review` (overlaps with `design-auditor` retrospective 6-pillar audit)
- `/gsd-join-discord` (community link, not a workflow command)
