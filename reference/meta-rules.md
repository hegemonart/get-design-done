# Meta-Rules (L0)

These rules are framework-invariant across the GDD pipeline. They do not change between cycles, phases, or tasks. Every agent imports `reference/shared-preamble.md`, which aggregates `reference/meta-rules.md` first.

**Tier: L0** (frozen prefix; stabilizes the Anthropic 5-min prompt-cache prefix across agent spawns — the churning L2 body below does NOT invalidate this).

---

## Required Reading Discipline

When the orchestrator's prompt contains a `<required_reading>` block, you MUST read every file it lists with the `Read` tool before taking any other action. Paths prefixed with `@` are file paths — pass them directly to `Read`. Skipping required reading is a hard violation: you will produce stale output that the downstream verifier catches, wasting a full spawn cycle.

## Writes Protocol

Only write files declared in your frontmatter `writes:` list. Agents with `reads-only: true` must never call `Write` or `Edit` on any file. If the task appears to require writing outside your declared scope, stop and return a `<blocker>` in STATE.md rather than expanding your write surface.

If your agent runs in a phase that enforces atomic commits (most do), commit only files in your declared `writes:` list. Use the repo commit convention: `docs(phase-N-P): short imperative description` for documentation-class changes, `feat(phase-N-P): ...` for new capability, `fix(phase-N-P): ...` for bug fixes. Phase and plan numbers come from `.design/STATE.md` `phase:` and the invoking plan's frontmatter.

## Deviation Handling

If an expected file is missing, a required reading entry fails to load, or the prompt references an artifact that contradicts STATE.md, **stop** before taking any destructive action. Return a structured blocker to STATE.md and terminate your response with your completion marker:

```markdown
<blocker>
type: missing-artifact | stale-state | contract-violation
detail: <one sentence>
suggested-fix: <one sentence or leave blank>
</blocker>

## {STAGE} COMPLETE
```

## Completion Markers

Valid completion markers per agent class (from `agents/README.md` §Completion Markers):
- Research agent → `## RESEARCH COMPLETE`
- Planning agent → `## PLANNING COMPLETE`
- Execution agent → `## EXECUTION COMPLETE`
- Verification agent → `## VERIFICATION COMPLETE`
- Stage-specific agents → the stage name: `## SCAN COMPLETE`, `## DISCOVER COMPLETE`, `## PLAN COMPLETE`, `## DESIGN COMPLETE`, `## VERIFY COMPLETE`.

The orchestrator detects failure by reading STATE.md for a `<blocker>`, not by the absence of a marker. Always emit the marker.

## Context-Exhaustion & Budget Awareness

A PostToolUse hook at `hooks/context-exhaustion.js` watches your tool output for the string `<context-exhaustion>` in your response. If you determine you cannot finish the task in the remaining context, emit:

```xml
<context-exhaustion>
reason: <one-sentence cause — e.g., "required_reading totals 47KB exceeding remaining context">
resume-hint: <one-sentence instruction for a resumption spawn>
</context-exhaustion>
```

…before your completion marker. The hook captures this into STATE.md so the orchestrator can re-spawn you with a narrower scope. Do not guess when you're near exhaustion — only emit when a concrete obstacle (file too large to read, required diff too wide) forced the call.

A PreToolUse hook at `hooks/budget-enforcer.js` intercepts every `Task` spawn (including the one that invoked you). The hook may:
- **Short-circuit** your spawn with a cached result from `.design/cache-manifest.json` (transparent — you never run).
- **Downgrade** your tier to Haiku at the 80% per-task cap soft-threshold, silently (`auto_downgrade_on_cap: true` in `.design/budget.json`, D-03).
- **Hard-block** your spawn at the 100% per-task or per-phase cap with an actionable error (D-02).

Implication for you as the agent: **do not assume a specific model tier is live.** Your output must be correct whether you run on Haiku, Sonnet, or Opus. If a task genuinely requires reasoning density beyond Haiku, the `size_budget` + `default-tier` combination should have been set at authoring time so the router routes it correctly — the remedy is a frontmatter update (a Phase 11 reflector proposal), not a mid-run assumption.

---

*Framework-invariant meta-rules. Aggregated by `reference/shared-preamble.md`.*
