# Model Tiers - Selection Guide + Per-Agent Map

**Purpose:** Source of truth for the `default-tier: haiku|sonnet|opus` frontmatter field carried by every agent at `agents/*.md`. Tiers are one of three Anthropic model classes - priced in `reference/model-prices.md`.

Phase 10.1 (OPT-06) locked the initial per-agent tier assignment. Phase 11's `design-reflector` (`agents/design-reflector.md`) proposes refinements from measured `.design/agent-metrics.json` data; no auto-apply - proposals flow through `/hone:apply-reflections` and `/hone:optimize`.

---

## Tier Assignment Rules

### haiku - Verifiers and checkers with deterministic rubrics

Pick `haiku` when the agent is:
- Applying a fixed scoring rubric (`design-verifier` runs five deterministic passes with numeric category scores).
- Producing a boolean + rationale answer (`design-plan-checker`, `design-context-checker`, `design-integration-checker` all return "gaps found" + structured list).
- Performing a read-only state sync (`hone-graph-refresh` mirrors graph state - no reasoning density beyond schema matching).
- Running at high frequency where cost compounds (checkers run on every `/hone:verify` pass - cost multiplies with iterations).

Haiku's ~20x price advantage over Opus per 1M tokens (see `reference/model-prices.md`) makes it correct for deterministic-rubric work where the marginal quality gain of larger models is negligible.

### sonnet - Researchers, mappers, doc-writers, executors, fixers

Pick `sonnet` when the agent is:
- Doing open-ended pattern recognition on codebase data (`a11y-mapper`, `component-taxonomy-mapper`, `design-pattern-mapper`, `motion-mapper`, `token-mapper`, `visual-hierarchy-mapper`).
- Synthesizing prose from structured input (`design-doc-writer`, `design-research-synthesizer`, `design-context-builder`).
- Executing a concrete plan under supervision (`design-executor`, `design-fixer`, `design-figma-writer`).
- Conducting targeted research under a time budget (`design-phase-researcher` - 2-minute web-search budget).
- Updating / extracting / maintaining project state (`hone-intel-updater`, `hone-learnings-extractor`, `design-auditor`).

Sonnet balances reasoning density against cost. This is the default - if you're uncertain about an agent's role, it's probably sonnet.

### opus - Planners, critics, advisors, strategic reflectors

Pick `opus` when the agent is:
- Proposing a plan that downstream executors will follow (`design-planner` - the plan becomes the contract for the whole design stage).
- Critiquing or advising on ambiguity (`design-advisor`, `design-assumptions-analyzer` - these agents question the prompt itself).
- Facilitating interactive decision-gathering (`design-discussant`).
- Cross-phase strategic reasoning (`design-reflector` - Phase 11 - proposes changes to the plugin itself from measured data).

Opus cost (~5x Sonnet, ~25x Haiku) is justified only when a single wrong decision cascades into many downstream agent spawns. Planners fit. Mappers don't.

---

## Per-Agent Tier Map

| Agent | Role class | default-tier | Rationale |
|-------|------------|--------------|-----------|
| design-verifier | Verifier | haiku | Runs a deterministic 5-pass scoring rubric; Haiku handles structured grading without quality loss. |
| design-plan-checker | Checker | haiku | Checks the plan against a fixed schema - boolean + gap-list output. |
| design-context-checker | Checker | haiku | Checks context completeness against a schema - boolean + gap-list output. |
| design-integration-checker | Checker | haiku | Checks cross-artifact references - deterministic link-integrity work. |
| hone-graph-refresh | Refresh agent | haiku | Rebuilds graph at .design/graph/graph.json from intel slices - no reasoning density required. |
| a11y-mapper | Mapper | sonnet | Open-ended a11y pattern recognition across many files; Sonnet's breadth matters. |
| component-taxonomy-mapper | Mapper | sonnet | Classifies components by role - requires nuance Haiku lacks, not enough to warrant Opus. |
| design-auditor | Worker | sonnet | Emits structured findings from code inspection; Sonnet balances depth with cost. |
| design-context-builder | Builder | sonnet | Assembles DESIGN-CONTEXT.md from discover outputs - prose synthesis. |
| design-doc-writer | Writer | sonnet | Produces polished prose documentation; Sonnet's style quality is sufficient. |
| design-executor | Executor | sonnet | Follows an Opus-authored plan - executes rather than plans. |
| design-figma-writer | Writer | sonnet | Emits Figma-formatted output from existing spec. |
| design-fixer | Fixer | sonnet | Applies targeted fixes to a localized artifact; structured input, structured diff output. |
| design-pattern-mapper | Mapper | sonnet | Catalogs design patterns present in codebase. |
| design-phase-researcher | Researcher | sonnet | Time-budgeted research on project-type conventions. |
| design-research-synthesizer | Synthesizer | sonnet | Collapses multiple research outputs into one; synthesis is Sonnet territory. |
| hone-intel-updater | Updater | sonnet | Refreshes .planning/intel/ files from current codebase. |
| hone-learnings-extractor | Extractor | sonnet | Pulls decisions + lessons + patterns from phase artifacts. |
| motion-mapper | Mapper | sonnet | Inventories motion patterns - open-ended visual reasoning. |
| token-mapper | Mapper | sonnet | Extracts design tokens from source - pattern recognition across files. |
| visual-hierarchy-mapper | Mapper | sonnet | Maps visual hierarchy signals - breadth across many files. |
| design-advisor | Advisor | opus | Questions prompts to surface ambiguity - wrong advice cascades. |
| design-assumptions-analyzer | Critic | opus | Surfaces essential assumptions before planning - one wrong assumption derails the phase. |
| design-discussant | Facilitator | opus | Interactive decision gathering - user-facing, quality-critical. |
| design-planner | Planner | opus | Authors DESIGN-PLAN.md - the contract every downstream agent follows. |
| design-reflector | Strategic reflector | opus | Phase 11 - reads telemetry + proposes changes to the plugin itself. |

**Row count:** 26 - matches the agent suite ls. Every row has a rationale; no blank rationales.

---

## Override Precedence

When the budget-enforcer hook resolves which tier to spawn an agent at, it walks this precedence (D-04):

1. **`.design/budget.json.tier_overrides[{agent_name}]`** - per-project configuration. Wins over frontmatter. Use this knob when the project has budget constraints that differ from the plugin defaults.
2. **Agent frontmatter `default-tier`** (this file's per-agent map) - plugin default. Set at authoring time.
3. **Hardcoded fallback `"sonnet"`** - belt-and-suspenders in `hooks/budget-enforcer.ts` for agents that somehow lack the frontmatter field. Should never fire in practice after Phase 10.1.

Plus two modifiers that can override the above at spawn time:

- **`auto_downgrade_on_cap: true`** (D-03): at 80% of `per_task_cap_usd`, the hook force-downgrades the tier to `haiku` for the remainder of the task, regardless of the precedence chain. Logged as `tier_downgraded: true` in `.design/telemetry/costs.jsonl`.
- **Hard-cap block** (D-02): at 100% of `per_task_cap_usd` or `per_phase_cap_usd`, the hook blocks the spawn outright. Tier is irrelevant - nothing runs.

---

## When to Upgrade or Downgrade

The plugin ships with the Per-Agent Tier Map above as a well-reasoned baseline. **Do not hand-edit agent frontmatter `default-tier` fields without evidence.** Two legitimate paths to change a tier assignment:

1. **Phase 11 reflector proposal.** `agents/design-reflector.md` reads `.design/agent-metrics.json` and surfaces cases where measured `gap_rate` or `deviation_rate` suggests a tier is too low (verifier missed gaps a Sonnet would catch) or too high (planner over-reasoned simple plans a Sonnet would handle). Proposals flow through `/hone:apply-reflections` - user-reviewed, never auto-applied.
2. **Budget constraint.** Project-level override via `.design/budget.json.tier_overrides` - does not require touching the frontmatter.

Signals that a tier move might be warranted (Phase 11 reflector's heuristics):
- **Downgrade signal** (Sonnet → Haiku, or Opus → Sonnet): agent's `gap_rate < 10%` over ≥ 10 runs AND measured output length < 25% of `size_budget` ceiling → agent is over-provisioned.
- **Upgrade signal** (Haiku → Sonnet, or Sonnet → Opus): agent's `deviation_rate > 15%` over ≥ 5 runs (agent frequently misinterprets prompt) → reasoning density may be the bottleneck.

Phase 11's reflector encodes these heuristics. This section documents the philosophy so contributors understand why an edit to this file shows up in a reflector proposal.

---

## Integration Points

- **`hooks/budget-enforcer.ts`** (Plan 10.1-01 Task 04) - implements the precedence chain above. `resolveTier(agent, agentDefaultTier, overrides)` is the concrete function.
- **`skills/router/SKILL.md`** (Plan 10.1-01 Task 03) - consults this file's tier map + `reference/model-prices.md` to produce `estimated_cost_usd` pre-spawn.
- **`skills/optimize/SKILL.md`** (Plan 10.1-04) - advisory command; may suggest tier moves based on telemetry + this doc's heuristics.
- **`agents/design-reflector.md`** (Phase 11, already merged) - may propose edits to this file + paired frontmatter updates. Proposals land in `.design/reflections/` for user review.

---

*Maintained as part of Phase 10.1 (OPT-06). Edits to the Per-Agent Tier Map MUST be paired with matching frontmatter edits in `agents/*.md` - the two are the same fact stored twice (router cross-checks). A mismatch indicates drift; Phase 11 reflector detects and reports it.*
