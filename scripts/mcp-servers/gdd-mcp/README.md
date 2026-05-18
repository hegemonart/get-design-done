# gdd-mcp

Read-only MCP server exposing GDD project state — STATE.md sections, phases, decisions, plans, telemetry, intel slices, latest reflections — as 12 typed MCP tools. Sessions prime in 3 MCP calls instead of 100+ file reads, on the same project a per-session reduction of −30% tokens and ~34× wall-clock speedup (see benchmark below).

Phase 27.7. Mirror of the `scripts/mcp-servers/gdd-state/` Phase 20 pattern. v1 is read-only — mutation belongs to slash-skills and the lockfile-safe `gdd-state-mcp` writers (Phase 20 surface).

## Tools

| Name | Input | Output (one-line summary) |
|------|-------|---------------------------|
| `gdd_status` | `{}` | Current cycle phase, branch, last-3 decisions, last-3 completed plans, blocker count |
| `gdd_phase_current` | `{}` | Current phase + stage + task_progress + status from STATE.md `<position>` |
| `gdd_phases_list` | `{}` | Phases from ROADMAP.md overview parse |
| `gdd_plans_list` | `{phase?}` | Plans for the current (or specified) phase from STATE.md `<plans>` |
| `gdd_decisions_list` | `{status?}` | D-XX decisions from STATE.md `<decisions>`, optionally filtered |
| `gdd_intel_get` | `{slice_id, shape?}` | Slice query against `.design/intel/` with optional key projection |
| `gdd_telemetry_query` | `{type?, since?, limit?}` | Typed reader over `.design/telemetry/*.jsonl` |
| `gdd_cycle_recap` | `{since_snapshot?}` | Diff vs the last Phase 27.6 snapshot (STATE sections + decisions + plans) |
| `gdd_reflections_latest` | `{}` | Latest cycle reflection excerpt from `.design/reflections/` (≤4 KB) |
| `gdd_learnings_digest` | `{cycles?}` | Compact lessons digest of recent reflections (≤5 KB) |
| `gdd_events_tail` | `{type?, limit?}` | Last N events from event-chain with optional type filter |
| `gdd_health` | `{}` | Read-only mirror of `skills/health/SKILL.md` checks payload |

All tools are thin wrappers (≤30 LOC) over `scripts/lib/*` helpers. The lint rule at `scripts/lib/mcp-tools-lint/` enforces no direct `fs.*`/`path.*` imports and zero write-tool names (`_create`, `_update`, `_delete`, `_append`, `_clear`, `_write`, `_set`). The 12-tool cap is hard (D-03) — adding a 13th requires a new plan.

Schemas live under `reference/schemas/mcp-gdd-tools.schema.json` (Draft-07). Tool sources are under `scripts/mcp-servers/gdd-mcp/tools/*.ts`.

## Manual registration

```bash
# Opt-in via installer (idempotent, detects Claude Code + Codex CLIs):
npx @hegemonart/get-design-done --register-mcp

# Or manual (Claude Code):
claude mcp add gdd-mcp -s user -- gdd-mcp

# Or manual (Codex):
codex mcp add gdd-mcp -- gdd-mcp
```

Dismiss the gdd-health MCP-registration nudge by setting `.design/config.json` to `{"mcp_nudge": false}`.

## When to prefer MCP vs file reads

| Scenario | Use MCP | Use file reads |
|----------|---------|----------------|
| Cold-boot priming (`/gdd:progress`, `/gdd:resume`, `/gdd:next`) | Yes — 3 calls, ~3 s, ~32k tokens | Fallback only when MCP unavailable |
| Mid-cycle context refresh in stage skills | Yes — 1–2 targeted calls | Fallback only |
| Editing STATE.md sections | No — use `mcp__gdd_state__*` (Phase 20) | N/A |
| Listing all skills | No — slash-skills + `scripts/list-skills.cjs` | N/A |
| Reading arbitrary untracked files | No | Yes — Read tool |

**Benchmark** (synthetic fixture at `test-fixture/baselines/phase-27-7/priming-benchmark.json`, modeled on Storybloq v1.2.0 measured numbers):

- MCP path: 3 calls, ~3 s, ~32k tokens
- File-read path: 5–10 reads, ~101 s, ~46.5k tokens
- Reduction: −31% tokens, ~34× wall-clock speedup

Per CONTEXT.md D-09 the benchmark is informational — failure to hit the −30% target surfaces as a Phase 27.7 success-criterion regression in closeout (Plan 27.7-07), NOT a CI hard-fail. After 5–10 real cycles, the synthetic fixture is replaced with measured GDD numbers (research-tail item).

## See also

- `scripts/mcp-servers/gdd-state/` — Phase 20 STATE.md mutation MCP (write surface)
- `scripts/lib/mcp-tools-lint/` — Static analysis enforcing thin-wrapper discipline
- `reference/schemas/mcp-gdd-tools.schema.json` — Tool input/output schemas (Draft-07)
- `.planning/phases/27.7-gdd-mcp-server/CONTEXT.md` — Phase 27.7 decisions and rationale
