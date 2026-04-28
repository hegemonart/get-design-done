# `.design/STATE.md` Template

This is the canonical template for the design pipeline's runtime state file.

**How stages use this template:**
- At scan stage entry, if `.design/STATE.md` does not exist, scan copies this template to `.design/STATE.md` and fills the frontmatter `started_at` and `last_checkpoint` with the current ISO 8601 timestamp.
- Every subsequent stage (discover, plan, design, verify) reads `.design/STATE.md` at entry and updates it at completion, per the Write Contract below.
- `.design/` is gitignored (not distributed with the plugin); only this template ships.

**Distinction from `.planning/STATE.md`:**
- `.planning/STATE.md` is GSD development state — used by the developers building this plugin.
- `.design/STATE.md` is pipeline runtime state — used by the pipeline when it runs in a user's project.
- Keep them strictly separate. Cross-references between them are deferred to Phase 6 per CONTEXT.md.

---

## Template body

Copy the block below (between the `==== BEGIN TEMPLATE ====` and `==== END TEMPLATE ====` markers) to `.design/STATE.md` at scan entry.

```
==== BEGIN TEMPLATE ====
---
pipeline_state_version: 1.0
stage: brief
cycle: ""
wave: 1
started_at: <ISO 8601 timestamp — set once at scan entry>
last_checkpoint: <ISO 8601 timestamp — updated at each stage exit>
---

# Pipeline State — <project name>

<position>
stage: brief
wave: 1
task_progress: 0/0
status: initialized
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>
<!-- handoff_source: "claude-design-html" | "claude-design-bundle" | "manual" | "" (empty = normal pipeline) -->
<!-- handoff_path: path to the handoff bundle file or directory; empty for normal pipeline runs -->
<!-- skipped_stages: comma-separated list of stages bypassed by handoff routing (e.g., "scan, discover, plan") -->

<decisions>
<!-- Filled by discover stage. Format: -->
<!-- D-01: [decision text] (locked | tentative) -->
</decisions>

<must_haves>
<!-- Filled by discover stage. Format: -->
<!-- M-01: [observable behavior description] | status: pending -->
<!-- Valid status values: pending | pass | fail -->
</must_haves>

<prototyping>
<!-- Phase 25: appended by sketch-wrap-up / spike-wrap-up + the prototype-gate. -->
<!-- Three child element types, each on its own line: -->
<!-- <sketch slug="…" cycle="…" decision="D-XX" status="resolved"/> -->
<!-- <spike slug="…" cycle="…" decision="D-XX" verdict="yes|no|partial" status="resolved"/> -->
<!-- <skipped at="explore|plan" cycle="…" reason="…"/> -->
<!-- The block is omitted entirely on fresh files; add it only when the first -->
<!-- sketch / spike / skipped entry is appended. -->
</prototyping>

<quality_gate>
<!-- Phase 25 (Plan 25-03): written by the quality-gate skill (Stage 4.5). -->
<!-- Houses a single most-recent <run/> entry — append-mode would be overkill. -->
<!-- Format: -->
<!-- <run started_at="…" completed_at="…" status="pass|fail|timeout|skipped" iteration="N" commands_run="lint,typecheck,test"/> -->
<!-- The block is omitted entirely on fresh files; add it only when the first -->
<!-- gate completion overwrites the entry. -->
</quality_gate>

<connections>
<!-- Detected at scan entry or via /gdd:connections; updated if connections become available mid-pipeline. -->
<!-- Format: <connection_name>: <available | unavailable | not_configured> -->
<!-- Key normalization: hyphens become underscores; leading digits are spelled out (21st-dev → twenty_first). -->
figma: not_configured
refero: not_configured
preview: not_configured
storybook: not_configured
chromatic: not_configured
graphify: not_configured
pinterest: not_configured
claude_design: not_configured
paper_design: not_configured
pencil_dev: not_configured
twenty_first: not_configured
magic_patterns: not_configured
</connections>

<blockers>
<!-- Active blockers preventing stage completion. -->
<!-- Format: [stage] [ISO date]: [description] -->
</blockers>

<parallelism_decision>
<!-- Written by each stage orchestrator after computing parallelism verdict -->
<!-- Format:
stage: explore
verdict: parallel | serial
reason: "2 mappers, disjoint Touches, savings est. 45s"
agents: ["token-mapper", "component-taxonomy-mapper"]
-->
</parallelism_decision>

<todos>
<!-- Mirror of .design/TODO.md counts for quick lookup by /gdd:progress and /gdd:stats. -->
<!-- Format:
pending: 0
in_progress: 0
done: 0
-->
</todos>

<timestamps>
started_at: <ISO 8601>
last_checkpoint: <ISO 8601>
brief_completed_at: ~
explore_completed_at: ~
plan_completed_at: ~
design_completed_at: ~
verify_completed_at: ~
</timestamps>
==== END TEMPLATE ====
```

---

## Field reference

### Frontmatter

| Field | Type | Set by | Purpose |
|-------|------|--------|---------|
| `pipeline_state_version` | float | fixed at `1.0` | Forward-compat marker for future format changes |
| `stage` | enum | every stage at entry | Current stage — one of: `brief|explore|plan|design|verify` |
| `cycle` | string | lifecycle commands | Cycle identifier for Wave B multi-cycle projects (default: empty string) |
| `wave` | int | every stage | Wave number within current stage |
| `started_at` | ISO 8601 | scan at creation | Immutable — never updated after creation |
| `last_checkpoint` | ISO 8601 | every stage at exit | Updated on every stage transition and on mid-stage checkpoint |

### `<position>`

Mirrors frontmatter stage/wave plus progress and status. Duplication is intentional — frontmatter is scannable by tooling; `<position>` is scannable by prose reading.

- `task_progress`: `<completed>/<total>` — e.g. `3/7` means 3 of 7 tasks in the current stage complete
- `status`: one of
  - `initialized` — scan just created the file, no work done
  - `in_progress` — stage is actively running
  - `completed` — stage finished successfully; next stage may begin
  - `blocked` — stage cannot proceed; see `<blockers>`

### `<decisions>`

Discover stage populates. Each decision:
- `D-<NN>`: sequential identifier
- `[decision text]`: human-readable statement
- `(locked | tentative)`: `locked` means downstream stages must honor; `tentative` means open for revision by subsequent stages

### `<must_haves>`

Discover stage populates with observable behaviors. Verify stage updates status.
- `M-<NN>`: sequential identifier
- `[description]`: testable behavior or artifact
- `status`: `pending` (default), `pass` (verify confirmed), `fail` (verify rejected)

### `<prototyping>`

Phase 25 surface (D-01). A checkpoint log — NOT a stage. Tracks sketch and spike outcomes plus cycle-scoped skip suppressions for the prototype gate.

- `<sketch slug=… cycle=… decision=D-XX status=resolved/>` — written by `sketch-wrap-up` after a sketch resolves into a D-XX decision.
- `<spike slug=… cycle=… decision=D-XX verdict=yes|no|partial status=resolved/>` — written by `spike-wrap-up` after a spike resolves; `verdict` captures the answer.
- `<skipped at=… cycle=… reason=…/>` — written by the prototype gate when the user declines to sketch/spike at a firing point. Cycle-scoped suppression (D-02): a `<skipped/>` entry suppresses re-asking for the rest of the named cycle.

The block is **optional** — fresh STATE.md files do not carry it. The serializer omits the block entirely when no entries exist; appending the first entry is what materializes the block.

### `<quality_gate>`

Phase 25 surface (Plan 25-03 / D-06..D-09). Captures the most recent run of the Stage 4.5 quality gate (lint / typecheck / test / visual-regression) between Design and Verify. The block houses a single self-closing `<run/>` element — append-mode is overkill, so each gate completion overwrites the entry.

- `started_at` — ISO 8601 at which the parallel command run entered.
- `completed_at` — ISO 8601 at which the gate produced its terminal status.
- `status` — `pass | fail | timeout | skipped`. `pass` clears the verify-entry gate; `fail` blocks; `timeout` warns + proceeds (D-07); `skipped` indicates the detection chain resolved zero commands.
- `iteration` — non-negative integer fix-loop count (D-08). `1` = single clean pass; `N === max_iters` with `status === 'fail'` = bounded exhaustion.
- `commands_run` — comma-separated names of the commands actually executed in Step 2 (e.g., `lint,typecheck,test`). Empty string when `status === 'skipped'`.

The block is **optional** — fresh STATE.md files do not carry it. The serializer omits the block entirely when `quality_gate === null`; the SKILL writes the first `<run/>` to materialize it.

### `<connections>`

One line per external connection. Detected at scan entry via MCP availability probes.
- `available`: MCP tool present and responding
- `unavailable`: MCP configured but not responding (auth failure, offline, etc.)
- `not_configured`: MCP not present in session

### `<blockers>`

Append-only log of active blockers. Format: `[stage] [ISO date]: [description]`. Cleared manually when blocker resolves (do not auto-clear — preserve the record).

### `<timestamps>`

Per-stage completion record. `~` means not yet completed. Updated at each stage's successful exit.

---

## Write Contract

Every stage that runs in the pipeline MUST follow this contract when reading and writing `.design/STATE.md`:

**At entry:**
1. Read `.design/STATE.md`. If the file does not exist and the current stage is `scan`, create it from this template with `started_at` = now and `last_checkpoint` = now; otherwise abort with a clear error ("run scan first").
2. Parse frontmatter `stage` and `<position>` `status`.
3. If `stage == current_stage` and `status == in_progress`: RESUME — pick up from `task_progress` offset; do not reset progress.
4. If `stage != current_stage`: this is a normal stage transition. Set frontmatter `stage = current_stage`, `<position>` `stage = current_stage`, `<position>` `status = in_progress`, `<position>` `task_progress = 0/<total>`.
5. Update `<connections>` by probing each MCP tool; write the detected status.
6. Update `last_checkpoint` to now.
7. Write `.design/STATE.md`.

**During execution (mid-stage checkpoints):**
- After each task completes, update `<position>` `task_progress` and `last_checkpoint`. Write `.design/STATE.md`.
- This enables resume if the stage is interrupted.

**At exit (successful completion):**
1. Set `<position>` `status = completed`.
2. Set the corresponding `<stage>_completed_at` timestamp in `<timestamps>`.
3. Update `last_checkpoint`.
4. Write `.design/STATE.md`.

**At exit (blocked):**
1. Set `<position>` `status = blocked`.
2. Append to `<blockers>`: `[<stage>] [<ISO date>]: <blocker description>`.
3. Update `last_checkpoint`.
4. Write `.design/STATE.md`.

**Resume semantics (STATE-03):**
- A stage re-invoked with `status == in_progress` and `stage == self` must resume from `task_progress` without re-running completed tasks.
- The `task_progress` numerator is the ONLY source of truth for resume. Consumers must NOT infer resume point from timestamps alone.

---

## Notes for Phase 2 implementors

- Do not add new top-level XML sections without updating this template.
- The write contract is non-negotiable — stages that skip the read-at-entry step break resume.
- `<decisions>` and `<must_haves>` identifiers are sequential per-project, not globally unique. A new pipeline run on the same project starts at `D-01` / `M-01`.
- When in doubt, prefer appending new fields to existing sections over introducing new sections — preserves compatibility with `pipeline_state_version: 1.0`.
