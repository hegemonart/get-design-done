---
name: plan
description: "Stage 3 of 5 — reads DESIGN-CONTEXT.md, spawns design-phase-researcher (optional) + design-planner + design-plan-checker, writes DESIGN-PLAN.md. Thin orchestrator."
argument-hint: "[--auto] [--parallel]"
user-invocable: true
---

# Get Design Done — Plan

**Stage 3 of 5** in the get-design-done pipeline. Thin orchestrator. All planning intelligence lives in agents/design-planner.md.

## State Integration

1. Read `.design/STATE.md`.
   - If missing: create minimal skeleton from `reference/STATE-TEMPLATE.md` with stage=plan, status=in_progress, task_progress=0/3, and log warning "STATE.md not found — created fresh. If this is a resumed session, run /get-design-done:scan first."
   - If present and frontmatter stage==plan and `<position>` status==in_progress: RESUME — skip already-complete agent invocations (use task_progress numerator as source of truth).
   - Otherwise: normal transition — set frontmatter stage=plan, `<position>` stage=plan, status=in_progress, task_progress=0/3.
2. Update `<connections>` by probing MCP availability (figma, refero).
3. Update last_checkpoint. Write STATE.md.

Abort with a clear error only if the user is trying to plan without DESIGN-CONTEXT.md — that is the true prerequisite, not STATE.md.

## Flag Parsing

Parse $ARGUMENTS:
- `--auto` → auto_mode=true (skip approvals, skip optional research)
- `--parallel` → parallel_mode=true (planner fills Touches:/Parallel: fields)

## Parallelism Decision (before any multi-agent spawn)

- Read `.design/config.json` `parallelism` (or defaults from `reference/config-schema.md`).
- Apply rules from `reference/parallelism-rules.md`.
- Plan's pipeline is inherently sequential (researcher → pattern-mapper → planner → checker). Expected verdict: **serial** (rule 1).
- Write `<parallelism_decision>` to STATE.md with the verdict and reason before spawning agents.

## Probe Chromatic connection

Run at stage entry, after reading STATE.md:

Step C1 — CLI presence:
  Bash: command -v chromatic 2>/dev/null || npx chromatic --version 2>/dev/null
  → found → proceed to Step C2
  → not found → chromatic: not_configured (skip all Chromatic steps)

Step C2 — Token check:
  Bash: test -n "${CHROMATIC_PROJECT_TOKEN}"
  → true → chromatic: available
  → false → chromatic: unavailable

Also check: if storybook: not_configured → chromatic effectively unavailable (emit note, do not run).
Write chromatic status to .design/STATE.md <connections>.

## Chromatic Change-Risk Scoping (when chromatic: available)

Before writing DESIGN-PLAN.md, if chromatic: available:
1. Identify token/component files to be changed (from DESIGN-CONTEXT.md scope)
2. Run: Bash: npx chromatic --project-token $CHROMATIC_PROJECT_TOKEN --trace-changed=expanded --dry-run 2>&1
3. Parse output — count story files that depend on changed source files
4. Pass story count to design-planner.md (see design-planner.md Chromatic Change-Risk section)
If unavailable: design-planner proceeds without story-count annotation.

## Step 1 — Optional Research (skip if auto_mode)

Complexity heuristic: if DESIGN-CONTEXT.md `<domain>` spans 3+ scopes OR `<decisions>` count > 6 → spawn design-phase-researcher. Otherwise skip.

If spawning:

```
Task("design-phase-researcher", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
</required_reading>

You are the design-phase-researcher agent. Identify the project type from DESIGN-CONTEXT.md
and research relevant design patterns, pitfalls, and stack-specific conventions.

Output file: .design/DESIGN-RESEARCH.md
Target: ~100 lines, ~2 min budget.

Emit `## RESEARCH COMPLETE` when done.
""")
```

Wait for `## RESEARCH COMPLETE`. Update STATE.md task_progress 1/3.

## Step 1.5 — Pattern Mapping (mandatory, brownfield protection)

```
Task("design-pattern-mapper", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
@reference/audit-scoring.md
</required_reading>

You are design-pattern-mapper. Grep the codebase for existing design patterns
(color tokens, spacing scale, typography conventions, component styling) and
write .design/DESIGN-PATTERNS.md. Classify by design concern — NOT by code
architecture (no controllers, services, middleware vocabulary).

Output file: .design/DESIGN-PATTERNS.md
Emit `## MAPPING COMPLETE` when done.
""")
```

Wait for `## MAPPING COMPLETE`. Update STATE.md task_progress 1/3.

## Step 1.6 — Assumptions Analysis (optional, same flag as research)

If assumptions analysis enabled (skip if auto_mode):

```
Task("design-assumptions-analyzer", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
@.design/DESIGN-PATTERNS.md
</required_reading>

You are design-assumptions-analyzer. Surface hidden design assumptions with
confidence levels and evidence citations.

Emit `## ANALYSIS COMPLETE` when done.
""")
```

Wait for `## ANALYSIS COMPLETE`.

## Step 2 — Plan

```
Task("design-planner", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
@reference/audit-scoring.md
@.design/DESIGN-PATTERNS.md
[@.design/DESIGN-RESEARCH.md — only include if research step ran]
[@.design/DESIGN-ASSUMPTIONS.md — only include if assumptions analysis ran]
[@.design/sketches/*/WINNER.md — include all completed sketch winners if present]
[@.design/spikes/*/FINDINGS.md — include all completed spike findings if present]
[@./.claude/skills/design-*-conventions.md — include all project-local design conventions if present]
[@~/.claude/gdd/global-skills/*.md — include all global skills if directory exists; global conventions inform but do not override project-local D-XX decisions]
</required_reading>

You are the design-planner agent. Read DESIGN-CONTEXT.md and produce .design/DESIGN-PLAN.md
with wave-ordered tasks, acceptance criteria, and (if parallel mode) Touches:/Parallel: fields.

Context:
- Pipeline stage: plan
- auto_mode: <true|false>
- parallel_mode: <true|false>

Output file: .design/DESIGN-PLAN.md
Format: per agents/design-planner.md Output Format section.

Emit `## PLANNING COMPLETE` when done.
""")
```

Wait for `## PLANNING COMPLETE`. Update STATE.md task_progress 2/3.

## Step 3 — Check

```
Task("design-plan-checker", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-PLAN.md
@.design/DESIGN-CONTEXT.md
</required_reading>

You are the design-plan-checker agent. Validate DESIGN-PLAN.md will achieve DESIGN-CONTEXT.md
brief goals across 5 dimensions: requirement coverage, task completeness, wave ordering,
must-have derivation, auto mode compliance.

Context:
- auto_mode: <true|false>

Output: structured result as response text (no file). Start with `## PLAN CHECK RESULT: PASS`
or `## PLAN CHECK RESULT: ISSUES FOUND`.

Emit `## PLAN CHECK COMPLETE` when done.
""")
```

Wait for `## PLAN CHECK COMPLETE`. Update STATE.md task_progress 3/3.

If `## PLAN CHECK RESULT: ISSUES FOUND` and any BLOCKER issues:
- Present issues to user and offer: (a) revise plan now — re-spawn design-planner with issue list, (b) accept and proceed, (c) abort.
- If auto_mode: auto-accept WARNING issues, abort on BLOCKER issues.

## State Update (exit)

1. Set `<position>` status=completed.
2. Set `<timestamps>` plan_completed_at=now.
3. Update last_checkpoint. Write STATE.md.

## After Completion

Print user-facing summary:
- Plan tasks: N waves, M total tasks
- Files: .design/DESIGN-PLAN.md (and .design/DESIGN-RESEARCH.md if research ran)
- Next: `/get-design-done:design` to execute the plan

## PLAN COMPLETE

---

## Exploration artifacts & project-local conventions

When building the planner spawn prompt, also glob for:
- `.design/sketches/*/WINNER.md` — winning sketch rationale (informs directional tasks)
- `.design/spikes/*/FINDINGS.md` — spike verdicts (inform task feasibility)
- `./.claude/skills/design-*-conventions.md` — project-local design conventions

Include each matching file in `<files_to_read>` / `<required_reading>` so the planner sees them when creating tasks. Spike findings from `.design/spikes/` inform task feasibility; sketch winners inform directional choice; project-local conventions override defaults.

## --research mode (removed)

V2-04 deferred the `--research` flag. Rationale: complexity of an additional
agent spawn + Context7 integration outweighs the benefit of discover-stage
auto-detect for most projects. Use /discover's Auto Mode for research-assisted
discovery instead.

The optional research step that already exists (Step 1, triggered by complexity
heuristic: 3+ domain scopes OR 6+ decisions) covers the core use case without
a separate CLI flag.

If --research is reintroduced in a future version, define its scope in
ROADMAP.md V2+ and update this section.
