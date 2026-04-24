---
name: verify
description: "Stage 5 of 5 — spawns design-auditor, design-verifier, and design-integration-checker in sequence; interprets pass/gap result; handles gap-response loop with inline fix (Phase 5 will add AGENT-12 remediation agent). Thin orchestrator."
argument-hint: "[--auto]"
user-invocable: true
---

# Get Design Done — Verify

**Stage 5 of 5** in the get-design-done pipeline. Thin orchestrator. Verification intelligence lives in three agents: design-auditor, design-verifier, and design-integration-checker.

---

## State Integration

1. Read `.design/STATE.md`.
   - If missing: create minimal skeleton from `reference/STATE-TEMPLATE.md` with `stage=verify`, `status=in_progress`; log warning to user: "No STATE.md found — creating minimal skeleton."
   - If present and `stage==verify` and `status==in_progress`: RESUME — if `.design/DESIGN-VERIFICATION.md` exists, pick up from the gap-response loop (skip re-spawning agents, go to Step 2). Otherwise re-spawn all three agents from Step 1.
   - Otherwise: normal transition — set `stage=verify`, `status=in_progress`, `task_progress=0/3`.
2. Update `<connections>`, `last_checkpoint`. Write STATE.md.

---

### Probe Preview connection

Run at stage entry, after reading STATE.md:

```
Step P1 — ToolSearch check:
  ToolSearch({ query: "Claude_Preview", max_results: 5 })
  → Empty result      → preview: not_loaded  (MCP not registered — skip all Preview steps in this stage)
  → Non-empty result  → proceed to Step P2

Step P2 — Live tool call:
  call mcp__Claude_Preview__preview_list
  → Success                               → preview: available
  → Error containing "permission"/blocked → preview: permission_denied
  → Any other error                       → preview: unreachable

Write preview status to .design/STATE.md <connections>.
```

When `preview: available`, the design-verifier agent runs Phase 4B — Screenshot Evidence to resolve `? VISUAL` heuristic flags with real screenshot evidence. See `agents/design-verifier.md` Phase 4B for the screenshot evidence loop.

---

### Probe Storybook connection

Run at stage entry, after reading STATE.md:

Step B1 — Project detection:
  Bash: ls .storybook/ 2>/dev/null || grep -l '"storybook"' package.json 2>/dev/null
  → Found → storybook_project: true → proceed to Step B2
  → Not found → storybook: not_configured (skip all Storybook steps)

Step B2 — Dev server detection:
  Bash: curl -sf http://localhost:6006/index.json 2>/dev/null | head -1
  → Returns JSON → storybook: available
  → Fails → Bash: curl -sf http://localhost:6006/stories.json 2>/dev/null | head -1
      → Returns JSON → storybook: available (compat endpoint)
      → Fails → storybook: unavailable

Write storybook status to .design/STATE.md `<connections>`.

---

### Storybook A11y Loop (when storybook: available)

If `storybook: available` in STATE.md `<connections>`:
1. Run: Bash: npx storybook test --ci 2>&1 | tee .design/storybook-a11y-report.txt
2. Read .design/storybook-a11y-report.txt — pass to design-verifier as additional a11y evidence
3. design-verifier reads this file in its a11y gap analysis section and annotates DESIGN-VERIFICATION.md with per-story violations

If storybook: unavailable — skip this section; run standard WCAG grep-based a11y checks only.
If storybook: not_configured — skip; emit no note (opt-in feature).

---

### Probe Chromatic connection

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

### Chromatic Visual Delta (when chromatic: available)

After design executor has run (when verifying post-design):
1. Run: Bash: npx chromatic --project-token $CHROMATIC_PROJECT_TOKEN --output json 2>&1 | tee .design/chromatic-results.json
2. Pass .design/chromatic-results.json to design-verifier for narration (see design-verifier.md Chromatic Delta Narration section)
If chromatic: unavailable or not_configured: skip; note in DESIGN-VERIFICATION.md "visual regression check skipped".

---

**DESIGN-PLAN.md prerequisite check:**
- **Normal mode:** Check that `.design/DESIGN-PLAN.md` exists. If missing, block with: "Verify requires DESIGN-PLAN.md. Run `/gdd:plan` first, or use `--post-handoff` if starting from a Claude Design handoff bundle."
- **Post-handoff mode** (`post_handoff=true` OR STATE.md `status: handoff-sourced`): Skip the DESIGN-PLAN.md check entirely — handoff workflows have no DESIGN-PLAN.md.

Abort only if no `.design/` directory exists (user has not run prior stages). Output: "No .design/ directory found. Run /get-design-done:discover first."

---

## Post-Handoff Mode

When `--post-handoff` flag is present OR STATE.md `<position>` contains `status: handoff-sourced`:

1. **Skip DESIGN-PLAN.md prerequisite check** (no plan exists in handoff flows)
2. **Pass `post_handoff: true` to design-verifier** spawn prompt (see Step 1b below)
3. **Pass `handoff_path`** from STATE.md to design-verifier spawn prompt
4. **DESIGN-VERIFICATION.md** will include a `## Handoff Faithfulness` section generated by design-verifier (see `agents/design-verifier.md` Handoff Faithfulness Phase)

Also pass post-handoff context to design-auditor: auditor skips DESIGN-PLAN.md reads and focuses on implementation-vs-bundle gap analysis.

---

## Flag Parsing

- `--auto` → `auto_mode=true` (no interactive prompts; skip visual UAT interactive steps; on gaps: save-and-exit rather than prompt for fix)
- `--post-handoff` → `post_handoff=true` (relax DESIGN-PLAN.md prerequisite; instruct verifier to add Handoff Faithfulness section; see ## Post-Handoff Mode below)

---

## Parallelism Decision (before agent spawns)

- Read `.design/config.json` `parallelism` (or defaults from `reference/config-schema.md`).
- Apply rules from `reference/parallelism-rules.md`.
- `design-verifier` depends on `design-auditor` output (rule 1) → serial between those two. `design-integration-checker` is independent of the auditor's *file* output but runs after verifier in the current sequence; if config opts in, `design-auditor` and `design-integration-checker` can parallelize (disjoint writes). Default: serial.
- Write `<parallelism_decision>` to STATE.md before spawning.

## Step 1 — Spawn Auditor + Verifier + Integration Checker

Initialize iteration counter to 0 (used for fix loop limit in Step 3).

Three agents run in sequence. Each waits for its completion marker before the next is spawned.

**Note on lazy gates (Plan 10.1-04 / D-21):** Each full checker is preceded by a cheap Haiku gate that reads the diff and may return `{spawn: false}` to short-circuit. When gated out, `lazy_skipped: true` is appended to `.design/telemetry/costs.jsonl`. Gates: `design-verifier-gate` (before 1b), `design-integration-checker-gate` (before 1c). `design-context-checker-gate` is wired into `skills/discover/SKILL.md` Step 1.75.

### 1a. Run design-auditor first (retrospective 6-pillar audit)

```
Task("design-auditor", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
@.design/DESIGN-PLAN.md
@.design/tasks/
@reference/audit-scoring.md
</required_reading>

You are the design-auditor agent. Run the 6-pillar retrospective audit (copy, visual hierarchy,
color, typography, layout/spacing, experience design) against the completed design work.

Score each pillar 1–4. Write your findings to .design/DESIGN-AUDIT.md.

This audit SUPPLEMENTS the 7-category 0-10 system in reference/audit-scoring.md — do not replace
or contradict it. Your output will be read by design-verifier as additional context.

Emit `## AUDIT COMPLETE` when done.
""")
```

Wait for `## AUDIT COMPLETE` in the agent response. Once detected, update STATE.md `task_progress=1/3`.

### 1b-gate. Lazy gate — should design-verifier run?

Spawn the cheap Haiku gate before the expensive verifier:

    Task("design-verifier-gate", """
    <required_reading>
    @.design/STATE.md
    </required_reading>

    You are the design-verifier-gate. Read the diff since the last verified commit
    and decide whether design-verifier should spawn.

    Context:
      diff_files: <output of `git diff --name-only <baseline_sha>..HEAD`>
      diff_body: <output of `git diff <baseline_sha>..HEAD` truncated to 4000 lines>
      baseline_sha: <from .design/STATE.md last_verified_sha, or HEAD~1 if absent>

    Apply the heuristic. Emit JSON + `## GATE COMPLETE`.
    """)

Wait for `## GATE COMPLETE`. Parse the JSON:

- `spawn: false` → append pending telemetry row `{ts, agent: "design-verifier", tier: "skipped", tokens_in: 0, tokens_out: 0, cache_hit: false, est_cost_usd: 0, lazy_skipped: true, gate_rationale: "<from gate>", cycle, phase}` (PreToolUse hook from 10.1-01 flushes on next tool use; orchestrator MAY stub-append directly to `.design/telemetry/costs.jsonl` until 10.1-05 lands). Skip 1b. Set `task_progress=2/3`. Emit `design-verifier skipped — gate rationale: <rationale>`.
- `spawn: true` → proceed to 1b as currently written.

### 1b. Run design-verifier (reads auditor output as additional input)

```
Task("design-verifier", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-AUDIT.md
@.design/DESIGN-PLAN.md
@.design/DESIGN-CONTEXT.md
@.design/tasks/
@reference/audit-scoring.md
@reference/heuristics.md
@reference/review-format.md
@reference/accessibility.md
</required_reading>

You are the design-verifier agent. Run the 5-phase verification against completed design work.

DESIGN-AUDIT.md (above) contains a retrospective 6-pillar qualitative audit from design-auditor.
Read it as supplementary signal — incorporate the priority fix list into your Phase 5 gap analysis
where relevant. The auditor's 1–4 scores complement your 0–10 category scores; they do not
replace your Phase 1 category scoring.

Context:
  auto_mode: <true|false>
  re_verify: false
  post_handoff: <true|false — true when --post-handoff flag active or STATE.md status==handoff-sourced>
  handoff_path: <value from STATE.md handoff_path, or empty string>

Write .design/DESIGN-VERIFICATION.md. If post_handoff is true, include ## Handoff Faithfulness section
(see agents/design-verifier.md Handoff Faithfulness Phase). If gaps found, emit `## GAPS FOUND` followed
by structured gap list, then `## VERIFICATION COMPLETE`. If no gaps, just emit `## VERIFICATION COMPLETE`.
""")
```

Wait for `## VERIFICATION COMPLETE` in the agent response. Once detected, update STATE.md `task_progress=2/3`.

### 1c-gate. Lazy gate — should design-integration-checker run?

Same pattern as 1b-gate:

    Task("design-integration-checker-gate", """
    <required_reading>
    @.design/STATE.md
    </required_reading>

    You are the design-integration-checker-gate. Read the diff and decide whether
    design-integration-checker should spawn.

    Context:
      diff_files: <git diff --name-only output>
      diff_body: <git diff output, truncated>
      baseline_sha: <from STATE.md or HEAD~1>

    Apply the heuristic. Emit JSON + `## GATE COMPLETE`.
    """)

Wait for `## GATE COMPLETE`. Parse JSON:

- `spawn: false` → append `lazy_skipped: true` telemetry row (same shape), skip 1c, set `task_progress=3/3`, emit `design-integration-checker skipped — gate rationale: <rationale>`.
- `spawn: true` → proceed to 1c as currently written.

### 1c. Run design-integration-checker (post-verification decision wiring check)

```
Task("design-integration-checker", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
@.design/DESIGN-VERIFICATION.md
</required_reading>

You are the design-integration-checker agent. Verify that each D-XX design decision recorded
in DESIGN-CONTEXT.md is actually reflected in the source code.

Check each decision by type:
- Typography decisions → grep font-size/scale values against declared scale
- Color decisions → grep for removed colors (expect 0 hits) and added tokens (expect ≥1 hit)
- Layout/spacing decisions → grep spacing values against declared grid
- Component decisions → grep for old patterns (expect 0) and new patterns (expect ≥1)

Return: Connected count, Orphaned count, Missing count with per-decision evidence.
Emit `## INTEGRATION CHECK COMPLETE` when done.
""")
```

Wait for `## INTEGRATION CHECK COMPLETE` in the agent response. Once detected, update STATE.md `task_progress=3/3`.

**Note:** Integration-checker findings (Orphaned and Missing decisions) are treated as additional gaps and fed into the gap-response loop in Step 2 alongside verifier gaps.

---

## Step 2 — Interpret Result

Check agent responses for gaps. Gaps come from two sources:
- design-verifier: `## GAPS FOUND` marker in the verifier response (G-NN entries)
- design-integration-checker: Orphaned or Missing decisions in the integration checker response (any decision with status Orphaned or Missing is a gap)

### Consolidate gaps:

Merge verifier gaps (G-NN entries) and integration-checker gaps (Orphaned/Missing D-XX decisions) into a single gap list. Integration-checker Orphaned decisions become MAJOR gaps; Missing decisions become BLOCKER gaps (a decision that was never applied).

### If NO gaps from either source (PASS):

- Update STATE.md `<must_haves>`: set each M-XX `status=pass`.
- Go to **State Update (exit)** with status=completed.

### If GAPS FOUND (from either source):

- Parse all gaps (verifier + integration-checker combined).
- Count gaps by severity (BLOCKER, MAJOR, MINOR, COSMETIC).
- If `auto_mode=true`: preserve DESIGN-VERIFICATION.md, update STATE.md `status=blocked`, append `<blockers>` entry: "[verify] [ISO date]: N blockers found — see .design/DESIGN-VERIFICATION.md and integration-checker output". Exit with message:
  ```
  Verification failed — N gaps found (X blockers, Y majors, Z minors, W cosmetics).
  Report: .design/DESIGN-VERIFICATION.md
  Fix gaps and re-run: /get-design-done:verify
  ```
- If `auto_mode=false`: present gap summary and menu (go to Step 3).

---

## Step 3 — Gap Response Loop

Present to the user:

```
━━━ Verification found N gaps ━━━
  BLOCKER: X
  MAJOR:   Y
  MINOR:   Z
  COSMETIC:W

Options:
  [1] Fix now   — inline fix for addressable gaps, then re-verify
  [2] Save and exit — work preserved; fix in a later session
  [3] Accept as-is  — mark verify complete despite gaps (not recommended for blockers)

Choose:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### If user chose [2] Save and exit:

- Preserve DESIGN-VERIFICATION.md.
- Update STATE.md: `<position> status=blocked`.
- Append `<blockers>`: "[verify] [ISO date]: N gaps outstanding — see .design/DESIGN-VERIFICATION.md".
- Write STATE.md.
- Exit:
  ```
  Gaps saved. Resume with: /get-design-done:verify
  Report: .design/DESIGN-VERIFICATION.md
  ```

### If user chose [3] Accept as-is:

- Update STATE.md `<must_haves>`: set `status=fail` for each unmet must-have, but proceed to exit.
- Append `<blockers>`: "[verify] [ISO date]: accepted with N unresolved gaps".
- Go to **State Update (exit)** with status=completed.

### If user chose [1] Fix now:

Check fix iteration counter. If counter >= 3:
```
Maximum fix iterations (3) reached. Saving current state and exiting.
Outstanding gaps remain — see .design/DESIGN-VERIFICATION.md.
```
Treat as Save and exit (option 2 above).

Otherwise: increment iteration counter and spawn design-fixer:

Task("design-fixer", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-VERIFICATION.md
@.design/DESIGN-CONTEXT.md
</required_reading>

Fix all BLOCKER and MAJOR gaps from ## Phase 5 — Gaps in DESIGN-VERIFICATION.md.
For each gap: apply the targeted fix to the file/location in the gap's Location field.
After each fix, make an atomic commit: fix(design-gap-GNN): [gap title].

Context:
  auto_mode: <true|false>

Emit ## FIX COMPLETE when all in-scope gaps have been attempted (partial success is still ## FIX COMPLETE).
Write a <blocker> entry to .design/STATE.md for any gap that could not be fixed.
""")

Wait for `## FIX COMPLETE` in the agent response before continuing.

After the design-fixer spawn returns `## FIX COMPLETE`, re-spawn design-verifier with `re_verify=true` and loop to Step 2:

```
Task("design-verifier", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-AUDIT.md
@.design/DESIGN-PLAN.md
@.design/DESIGN-CONTEXT.md
@.design/tasks/
@reference/audit-scoring.md
@reference/heuristics.md
@reference/review-format.md
@reference/accessibility.md
</required_reading>

You are the design-verifier agent. This is a re-verification run after inline fixes.

DESIGN-AUDIT.md contains the retrospective 6-pillar audit from design-auditor (read as supplementary context).

Context:
  auto_mode: <true|false>
  re_verify: true

Focus verification on previously-failed must-haves first. Run full 5-phase pass.
Write updated .design/DESIGN-VERIFICATION.md. Emit ## GAPS FOUND (if any), then ## VERIFICATION COMPLETE.
""")
```

---

## State Update (exit)

1. `<position> status=completed` (or `blocked` for save-and-exit).
2. `<timestamps> verify_completed_at=<ISO date now>`.
3. Update `last_checkpoint`. Write STATE.md.

---

## After Completion

Print summary:

```
━━━ Verify complete ━━━
Status: PASS | FAIL | ACCEPTED-WITH-GAPS
Gaps:   X blockers, Y majors, Z minors, W cosmetics

Agents run:
  design-auditor              → .design/DESIGN-AUDIT.md (6-pillar qualitative)
  design-verifier-gate        → JSON gate decision (may skip design-verifier)
  design-verifier             → .design/DESIGN-VERIFICATION.md (7-category + heuristics + UAT)
  design-integration-checker-gate → JSON gate decision (may skip design-integration-checker)
  design-integration-checker  → inline (D-XX decision wiring)

Reports:
  Qualitative audit: .design/DESIGN-AUDIT.md
  Full verification: .design/DESIGN-VERIFICATION.md

Next: [if pass] pipeline complete — run /get-design-done:discover for next session
      [if fail] fix gaps and re-run /get-design-done:verify
━━━━━━━━━━━━━━━━━━━━━
```

## VERIFY COMPLETE
