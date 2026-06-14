---
name: hone-next
description: "Routes to the next pipeline stage based on current STATE.md position"
tools: Read, Write, mcp__hone_status, mcp__hone_phase_current, mcp__hone_plans_list
disable-model-invocation: true
---

# Get Design Done - Next

**Role:** Lightweight router. Read `.design/STATE.md` and recommend the next command.

---

## Logic

Two paths - MCP preferred when available, file-read fallback otherwise.

### MCP path (preferred)

When `mcp__hone_phase_current` is exposed (Phase 27.7+, registered via `npx @hegemonart/get-design-done --register-mcp`):

1. Call `mcp__hone_status` (no args) → `{phase, branch, last_decisions, last_completed_plans, blocker_count}`. Gives cycle + branch context for the output block in one call.
2. Call `mcp__hone_phase_current` (no args) → `{phase, stage, task_progress, status}`. Use `stage` to drive the routing table below.
3. (Optional) Call `mcp__hone_plans_list` (no args) → current phase plans + status, to identify the next incomplete plan and refine the recommendation.
4. If `mcp__hone_status` returns a "STATE.md missing" error, print: "No STATE.md found. Run `{{command_prefix}}new-project` to initialize, or `@get-design-done brief` to start the pipeline." and stop. Otherwise, skip to the routing table.

Two to three MCP calls = full routing decision (~3s, ~32k tokens - Storybloq benchmark).

### File-read path (fallback)

When MCP tools are not available, fall back to the legacy flow:

1. Check if `.design/STATE.md` exists.
   - **No STATE.md** → Print: "No STATE.md found. Run `{{command_prefix}}new-project` to initialize, or `@get-design-done brief` to start the pipeline."
2. If STATE.md exists, parse frontmatter `stage:` field. Proceed to the routing table.

This path loads the same context in 1–2 file reads (~20s, ~46.5k tokens - file-reading baseline).

## Routing table

Map the `stage` (from either path above) to the next recommended command:

| Current `stage:` | Recommendation |
|---|---|
| `brief` | Run `@get-design-done explore` to scan and interview |
| `explore` | Run `@get-design-done plan` to create design plan |
| `plan` | Run `@get-design-done design` to execute design tasks |
| `design` | Run `@get-design-done verify` to audit and verify |
| `verify` | Pipeline complete. Run `{{command_prefix}}new-cycle` for next cycle or `{{command_prefix}}ship` to create PR |

## Output

Print the recommendation as a single formatted block:

```
━━━ Next step ━━━
Current stage: <stage>
Status: <status>
→ <recommendation>
━━━━━━━━━━━━━━━━━━
```

## Do Not

- Do not modify STATE.md.
- Do not invoke the next stage automatically - only recommend.

## NEXT COMPLETE
