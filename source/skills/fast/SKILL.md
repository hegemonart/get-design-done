---
name: gdd-fast
description: "Trivial inline design task. No subagents, no planning documents, no pipeline stages. Just do the thing described."
argument-hint: "<task description>"
tools: Read, Write, Edit, Bash, Grep, Glob
disable-model-invocation: true
---

# {{command_prefix}}fast

The leanest possible execution path. No subagents, no STATE.md update, no DESIGN-*.md artifacts. Read the target file, apply the change inline, commit.

## When to use

- "Change this button's border-radius to 8px"
- "Add a hover state to the nav links"
- "Fix the mobile breakpoint on the hero"
- Single-file or single-component obvious changes

## When NOT to use

- Multi-component changes.
- Anything touching tokens used across the app.
- Anything requiring a design decision (taste, tradeoff, scope).
- Use `{{command_prefix}}quick` or the full pipeline instead.

## Steps

1. Parse the task description from the argument.
2. Use Grep/Glob to locate the target file(s). If ambiguous (>2 candidates), stop and ask the user which to edit — do not guess.
3. Read the target file(s).
4. Apply the described change with Edit.
5. Run a relevant sanity check (grep for the old value to confirm it's gone; grep for the new value to confirm it's in).
6. Commit with message: `fix: <task description>` (one commit, one change).
7. Print: "Done: <summary of what changed>."

## Do Not

- No subagent spawns.
- No `.design/` writes.
- No STATE.md mutation.
- No pipeline stage invocation.
- Do not proceed if the change turns out to be non-trivial — bail out and recommend `{{command_prefix}}quick` or the full pipeline.
- Do not skip the `capability_gap` emit on bail-out — Stage-0 telemetry depends on it (Phase 29 D-01).

## Emitting capability_gap on no-skill-match

If step 2 cannot locate any candidate files for the task description (or all candidates are filtered out as off-topic), or if the change in step 4 turns out to be non-trivial in a way that has no obvious resolution without a dedicated skill/agent, emit ONE `capability_gap` event before returning control to the user. This feeds Phase 29 Stage-0 telemetry — the reflector pattern-detection pass (Plan 29-02) and aggregation (Plan 29-03) read these events from the chain file (`.design/gep/events.jsonl`) to surface recurring capability gaps in `{{command_prefix}}apply-reflections`.

Synchronous emitter call (via Bash):

```bash
node -e '
const { appendChainEvent } = require("./scripts/lib/event-chain.cjs");
const { createHash, randomUUID } = require("node:crypto");
const intent = process.env.GDD_INTENT || "";
const payload = {
  event_id: randomUUID(),
  parent_event_id: null,
  source: "fast",
  context_hash: createHash("sha256").update(intent).digest("hex"),
  intent_summary: intent.slice(0, 256),
  suggested_kind: "skill",
  evidence_refs: [],
};
appendChainEvent({
  agent: "fast",
  outcome: "capability_gap",
  payload,
  type: "capability_gap",
  timestamp: new Date().toISOString(),
  sessionId: process.env.GDD_SESSION_ID || "fast-cli",
});
'
```

Notes:
- `evidence_refs` is empty `[]` for fast (no trajectory in `{{command_prefix}}fast` — that path is too lean by design).
- `parent_event_id` is null (root event for the fast bail-out).
- `suggested_kind` is `"skill"` because fast bail-outs are usually narrow primitives, not multi-step workflows. Plan 29-03's aggregator may upgrade to `"agent"` if a `context_hash` cluster shows multi-step usage.
- The emitter MUST NOT block — `appendChainEvent` already swallows IO errors via its existing try/catch (see `scripts/lib/event-chain.cjs:97-105`).
- The 7-field payload is preserved verbatim through `appendChainEvent`'s opaque-extras pattern; the chain row carries `type`, `timestamp`, `sessionId`, `payload` as opaque caller-supplied fields and is projected back to the events-schema envelope shape by readers (Plan 29-03 aggregator).

Trigger conditions:
- **Trigger 1**: Step 2 returns zero candidate files for the task description (target is genuinely missing).
- **Trigger 2**: Step 2 returns more than 2 candidates AND the user bail-out in step 2 fires (stop and ask).
- **Trigger 3**: Step 4 reveals the change is non-trivial in a way that has no obvious primitive resolution (the `## Do Not` "Do not proceed" line fires).

MCP-probe failures (connection down, transport-layer errors) do NOT emit `capability_gap` — those are Phase 22 connection-status concerns (D-08).

## FAST COMPLETE
