---
name: quality-gate
description: "Stage 4.5 of the pipeline. Detects, runs, and classifies project quality commands (lint / typecheck / test / visual-regression) between /gdd:design and /gdd:verify; writes the most recent run to STATE.md <quality_gate>. Non-blocking on timeout (warn + proceed); failures spawn design-fixer until the loop converges or max_iters is reached."
tools: Read, Write, Edit, Bash, Grep, Glob, Task
color: amber
model: inherit
default-tier: haiku
tier-rationale: "Orchestration of pre-detected commands and a downstream Haiku classifier. The skill itself does no synthesis — Bash runs do all the work, the classifier agent owns the routing decision."
size_budget: M
parallel-safe: conditional-on-touches
typical-duration-seconds: 180
reads-only: false
writes:
  - ".design/STATE.md"
  - ".design/events.jsonl"
---

@reference/shared-preamble.md

# quality-gate

## Role

You are the Stage 4.5 gate that runs between `/gdd:design` and `/gdd:verify`. You answer one question: *does this project's own quality tooling pass against the current working tree?*

You are NOT a design checker, an a11y checker, or a verifier. You are a thin façade over the project's existing `lint` / `typecheck` / `test` / visual-regression scripts. You exist so that the verify stage can refuse entry when those scripts fail (and so that the fix loop can be bounded and observable).

You write exactly two artifacts:
1. The `<quality_gate>` block in `.design/STATE.md` (one most-recent `<run/>` element).
2. Lifecycle events in `.design/events.jsonl` (per Step 6 below).

You never block on timeout. You never block on a "skipped" detection result. You only mark `status="fail"` when the fix loop reaches `max_iters` without converging — and even then it is the verify stage's job to refuse entry; YOU exit successfully so the user sees the report regardless.

## Configuration Surface

Read once at start, from `.design/config.json` (all keys optional; defaults documented):

| Key | Default | Purpose |
|-----|---------|---------|
| `quality_gate.commands` | `null` | Authoritative list of commands. When provided, skips auto-detection. Each entry is a string the shell can run (e.g. `"npm run lint"`). |
| `quality_gate.timeout_seconds` | `600` | Total wall-clock budget for Step 2. On timeout: warn + proceed (D-07). |
| `quality_gate.max_iters` | `3` | Hard cap on Step 4 fix-loop iterations. |

Missing config file is not an error — defaults apply.

## Step 1 — Detection chain

Per D-06, resolve the active command list with this 3-tier fallback. Stop at the first tier that produces ≥ 1 command:

### Tier 1 — Authoritative config

If `.design/config.json` carries `quality_gate.commands` and the array is non-empty, use it verbatim. Skip Tier 2 and Tier 3.

### Tier 2 — Auto-detect from `package.json#scripts`

If `package.json` exists at the project root, read its `scripts` object. Match script names against the following allowlist (case-sensitive, exact match unless noted):

| Script name | Notes |
|-------------|-------|
| `lint` | Always include if present. |
| `typecheck` | Always include if present. |
| `tsc` | Include if `typecheck` is absent (substitute, not duplicate). |
| `test` | Include if present. |
| `chromatic` | Include if present (visual-regression). |
| `test:visual` | Include if present (visual-regression). |

**Excluded by name** (intentionally — too slow for a Stage 4.5 gate):
- `test:e2e`
- `test:integration` (only if a separate `test` exists)
- Any script whose name starts with `dev:`, `build:`, `start:`.

For each matched script, the command to run is `npm run <script-name>` (use `pnpm run` or `yarn` only if the project's root carries a corresponding lockfile and the user's `.design/config.json` lists `quality_gate.package_manager`; otherwise default to `npm run` for portability).

If `package.json` does not exist, or `scripts` is empty, or no allowlisted name matches, advance to Tier 3.

### Tier 3 — Skip with notice

Emit a `quality_gate_skipped` event with `reason: "no commands resolved"` (Step 6). Write a `<run/>` element with `status="skipped"`, `commands_run=""`, `iteration=0`, `started_at` and `completed_at` set to the same timestamp. Exit successfully with status `skipped`. The verify-entry gate (Plan 25-07 territory) does NOT block on `skipped`.

## Step 2 — Parallel run

Open Step 2 by emitting `quality_gate_started` with the resolved command list (Step 6).

For each command produced by Step 1, spawn a **separate** `Bash` invocation; collect `{command, exit_code, stdout, stderr}` for each. Run them concurrently — the gate's wall-clock budget is the slowest command, not their sum.

The combined wall-clock budget is `quality_gate.timeout_seconds` (default 600). If the budget elapses before all commands complete:

1. Emit `quality_gate_timeout` with the names of commands that did not finish.
2. Mark `status="timeout"`, `commands_run=<comma-joined attempted names>`, and treat unfinished commands as having no failure to classify.
3. Skip Step 3 / Step 4 (no fix loop on timeout — it would just compound the slowness).
4. Proceed to Step 5 (STATE write) and Step 6 (final event).
5. **Exit successfully.** Verify entry treats `timeout` as a warn, not a block.

If all commands complete within budget, advance to Step 3.

## Step 3 — Classification

Spawn the `quality-gate-runner` agent via the `Task` tool. Pass an input payload of the shape:

```json
{
  "outputs": [
    {"command": "npm run lint", "exit_code": 0, "stderr": ""},
    {"command": "npm run typecheck", "exit_code": 1, "stderr": "<verbatim stderr>"},
    {"command": "npm run test", "exit_code": 0, "stderr": ""}
  ]
}
```

The agent emits a single JSON object on stdout (see `agents/quality-gate-runner.md`):

```json
{
  "status": "pass" | "fail",
  "classified_failures": {
    "lint": ["…"],
    "type": ["…"],
    "test": ["…"],
    "visual": ["…"]
  }
}
```

When `status === "pass"`, advance directly to Step 5 with `iteration` equal to the current loop counter (starts at `1` on the first pass).

When `status === "fail"`, advance to Step 4.

## Step 4 — Fix loop (D-08)

If `iteration >= quality_gate.max_iters` (default 3), the loop is exhausted:
- Emit `quality_gate_fail` with the final classified failures.
- Mark `status="fail"`, persist the final `iteration`, and proceed to Step 5.
- **Exit successfully.** Verify entry refuses on `status="fail"`; YOU do not throw.

Otherwise, increment `iteration` and emit `quality_gate_iteration` with the current value. Spawn the existing `design-fixer` agent (Phase 5) via `Task` with classified failures as context — pass the same shape produced by Step 3 plus the original `outputs[]` for verbatim error context. After the fixer returns, restart from Step 2 (re-run all commands; do not prune to "only the previously failing ones" — fixes can introduce regressions in formerly-clean commands).

The loop terminates when either Step 3 returns `status="pass"` or `iteration` reaches `max_iters`.

## Step 5 — STATE write

Open `.design/STATE.md`. Mutate the parsed state's `quality_gate` field to:

```ts
{
  run: {
    started_at: <ISO 8601 — captured at Step 2 entry>,
    completed_at: <ISO 8601 — now>,
    status: <"pass" | "fail" | "timeout" | "skipped">,
    iteration: <final loop counter>,
    commands_run: <comma-joined names of commands that completed>,
    extra_attrs: {},
  },
}
```

Persist via `mcp__gdd_state__set_quality_gate` (the underlying mutator wiring is named in this contract; the SDK MCP layer wraps every mutator method, so the surface inherits free from the parser/mutator extension landed in this plan). Until the MCP tool exists (Plan 25-07 surfaces it in the verify-stage integration), use the `apply()` mutator from `scripts/lib/gdd-state/mutator.ts` directly:

```ts
apply(raw, (state) => {
  state.quality_gate = { run };
  return state;
});
```

Either path is acceptable. The on-disk shape is identical.

## Step 6 — Event emission (D-09)

Emit lifecycle events to `.design/events.jsonl` via the existing `appendEvent()` surface exported from `scripts/lib/event-stream/index.ts` — the same module Phase 22 telemetry, the budget-enforcer, the read-injection scanner, and the gdd-state MCP server already write through. Do not roll a bespoke writer; the singleton in `event-stream/index.ts` is persist-first / broadcast-second and never throws on the persist path, which is the contract this skill relies on.

Import shape:

```ts
import { appendEvent } from '../../scripts/lib/event-stream/index.ts';
```

Each emission is a single `appendEvent({...})` call with `type` set to one of the six names in the table below. Pass the event-specific payload fields verbatim — `appendEvent` stamps `_meta` (pid, host, source) and the JSONL writer captures the canonical `ts` from the writer surface. The `cycle` and `stage` fields are stamped by the same path used elsewhere in Phase 22+ (consumers match on `type`; treat `ts`, `cycle`, `stage` as injected, not caller-supplied).

One event per JSONL line. Schema and lifecycle map:

| Event | When (lifecycle position) | Required fields |
|-------|---------------------------|-----------------|
| `quality_gate_started` | Step 2 entry — fired ONCE per skill invocation, immediately before any `Bash` spawn. Carries the resolved command list from Step 1 so downstream telemetry can correlate `started` → terminal event. | `commands` (string[]), `timeout_seconds` (number), `max_iters` (number) |
| `quality_gate_iteration` | Step 4 entry — fired ONCE per retry, with `iteration` set to the new (post-increment) loop counter. The first run is implicit (covered by `started`); only retries `≥ 2` emit `iteration`. | `iteration` (int ≥ 2) |
| `quality_gate_pass` | Step 3 returned `status: "pass"` — terminal happy path. Fires before Step 5 (STATE write) so a consumer tailing the stream sees the verdict before the on-disk run record. | `iteration` (final loop counter), `commands_run` (string[]) |
| `quality_gate_fail` | Step 4 reached `max_iters` without convergence — terminal failure path. The verify-entry gate (Step 2.5 of `skills/verify/SKILL.md`) is the sole consumer that *acts* on this; this skill exits successfully regardless. | `iteration` (final loop counter, equal to `max_iters`), `classified_failures` (object — same shape as `quality-gate-runner` agent output) |
| `quality_gate_timeout` | Step 2 wall-clock budget elapsed — terminal warn path (per D-07 verify treats this as a warning, not a block). Fires before Step 5 STATE write, same ordering as `pass`/`fail`. | `unfinished_commands` (string[]) |
| `quality_gate_skipped` | Step 1 Tier 3 fired (no commands resolved) — terminal no-op path. Fires before the synthetic `<run/>` is written to STATE.md. | `reason` (string — e.g. `"no commands resolved"`) |

All six events carry the standard `ts`, `cycle`, `stage` fields injected by `appendEvent` / the writer. Do not invent additional event names — the verify-entry gate, reflector, and Phase 22 telemetry consumers match on this exact list. Do not emit any of these names from any path other than the lifecycle positions above (e.g., do not emit `quality_gate_started` again on a Step 4 retry — that's what `quality_gate_iteration` is for).

**Failure-mode contract:** `appendEvent()` swallows persist failures internally. If the writer cannot open `.design/events.jsonl`, the skill MUST still proceed — the event stream is observability, not correctness. The STATE.md write in Step 5 is the durable record consumers MUST rely on; events.jsonl is the supplementary timeline.

## Output Contract

Emit a single JSON object on stdout summarizing the run for the caller:

```json
{
  "status": "pass",
  "iteration": 1,
  "commands_run": ["npm run lint", "npm run typecheck", "npm run test"],
  "started_at": "2026-04-29T10:00:00Z",
  "completed_at": "2026-04-29T10:01:42Z"
}
```

Schema:
- `status` — `pass | fail | timeout | skipped`.
- `iteration` — final loop counter; `0` for `skipped`.
- `commands_run` — array of command strings actually executed.
- `started_at` / `completed_at` — ISO 8601, copied from the STATE write.

The skill exits with shell exit code `0` on every terminal status — including `fail`. The verify-entry gate is the sole consumer of the `fail` status; this skill never throws to the orchestrator.

## Constraints

- **Do not** prune the command list across iterations — always re-run everything in Step 2.
- **Do not** spawn `quality-gate-runner` more than once per loop iteration. Spawn `design-fixer` more than once if and only if the loop iterates.
- **Do not** read or write any STATE block other than `<quality_gate>` and `<position>` (the latter only as required by the standard write contract; the gate is a checkpoint, not a stage transition, so `<position>` updates are limited to `last_checkpoint`).
- **Do not** invoke verify or design — Stage 4.5 sits strictly between them.
- Treat exit codes via the standard convention: `0` = clean; non-zero = failure to be classified. Do not interpret stderr content for the pass/fail decision — the agent does that classification, you do not.
