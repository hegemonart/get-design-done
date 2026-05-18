---
name: gdd-debug
description: "Symptom-driven design debugger with persistent state. Phase 1 builds a feedback loop; Phase 2 hypothesizes. Writes findings to .design/DEBUG.md. Use when a symptom needs systematic, one-variable-at-a-time tracking."
argument-hint: "[<symptom description>]"
tools: Read, Write, Grep, Glob, AskUserQuestion, Task
---

# /gdd:debug

Systematic, checkpoint-driven design debugger. Loads framing from `./../reference/debugger-philosophy.md` (five principles) and the feedback-loop construction catalog from `./debug-feedback-loops.md` (10 priority-ordered loop paths). Phase 1 builds the loop; Phase 2 generates hypotheses. Writes every step to `.design/DEBUG.md` so killed sessions can resume.

## Steps

1. **Load philosophy + feedback-loop catalog**: Read `reference/debugger-philosophy.md` (five principles) and `./debug-feedback-loops.md` (10 construction paths; iterate-on-loop discipline). Keep both in mind for the entire session.
2. **Symptom**: If no symptom argument was passed, ask (AskUserQuestion): "What design symptom are you investigating? (observable only — 'cards look crowded', not 'padding is wrong')"
3. **Resume check**: Read `.design/DEBUG.md` if it exists. If there is an open session with no `### Fix Proposal` block, ask: "Resume existing session '<symptom>' or start a new one?"
4. **Ground truth load**: Read `.design/DESIGN-PLAN.md` (goals), `.design/STATE.md` `<decisions>` block (D-XX items), and any source files pointed at by the symptom.
5. **Phase 1 — Build a feedback loop**: Before ANY hypothesizing, build a deterministic, fast, agent-runnable pass/fail signal that reproduces the symptom. See `./debug-feedback-loops.md` for the 10 construction paths in priority order (failing test > curl > CLI fixture > headless browser > trace replay > throwaway harness > fuzz > bisect > differential > HITL bash). Iterate on the loop itself (cache setup, narrow scope, pin time, seed RNG, isolate filesystem, freeze network) before iterating on the bug. For non-deterministic bugs: raise reproduction rate to at least 30%, not clean repro. **Do not proceed to Phase 2 (hypothesis generation) until you have a loop you believe in.**
6. **Optional rendered-output check**: Use ToolSearch to see if Playwright/Preview MCP tools are available. If yes, capture rendered state. If no, fall back to code-only analysis.
7. **Phase 2 — Investigation loop** (one hypothesis at a time) — for each step:
   - Form one hypothesis (one variable).
   - Investigate (read files, grep, measure). Re-run the Phase 1 feedback loop to confirm the hypothesis pinpoints the symptom.
   - Append to `.design/DEBUG.md`:

     ```markdown
     ## <symptom> — <date>
     ### Hypothesis <N>
     ### Investigation
     ### Finding
     ```

   - Ask (AskUserQuestion): "Continue investigating? (yes / found it / dead end)"
8. **When found**: Write `### Fix Proposal` block with a concrete patch description. Re-run the Phase 1 loop to confirm the fix flips it from fail to pass. Ask: "Create a todo with `/gdd:todo add`, or execute the fix now?"

## Do Not

- Do not change multiple variables at once.
- Do not modify global tokens to fix a single component without explicit user approval.
- Do not close the DEBUG.md session without a finding (mark as "dead end" if abandoned).

## DEBUG COMPLETE
