# .design/config.json Schema

The config file is created on first `/gdd:settings` call or when any stage initializes a new project. It controls model selection (profile) and how stages dispatch agents in parallel.

## Full Schema

```json
{
  "model_profile": "balanced",
  "parallelism": {
    "enabled": true,
    "max_parallel_agents": 5,
    "min_tasks_to_parallelize": 2,
    "min_estimated_savings_seconds": 30,
    "require_disjoint_touches": true,
    "worktree_isolation": false,
    "per_stage_override": {
      "explore": { "max_parallel_agents": 5 },
      "design":  { "max_parallel_agents": 3 }
    }
  }
}
```

## Default Config

If no `.design/config.json` exists, stages and `/gdd:settings` assume:

```json
{
  "model_profile": "balanced",
  "parallelism": {
    "enabled": true,
    "max_parallel_agents": 5,
    "min_tasks_to_parallelize": 2,
    "min_estimated_savings_seconds": 30,
    "require_disjoint_touches": true,
    "worktree_isolation": false,
    "per_stage_override": {}
  }
}
```

## Fields

### `model_profile`

| Value | Planner / Researcher | Executor | Verifier / Checker |
|---|---|---|---|
| `"quality"`  | Opus   | Sonnet | Sonnet |
| `"balanced"` (default) | Opus   | Sonnet | Haiku  |
| `"budget"`   | Sonnet | Sonnet | Sonnet |

Agents authored with `model: inherit` read the active profile at spawn time. Agents that hard-code `model:` in their frontmatter ignore the profile.

### `parallelism.enabled`

Master switch. When `false`, all stages run serially regardless of other settings.

### `parallelism.max_parallel_agents`

Cap on simultaneous agent spawns. Default: `5`.

### `parallelism.min_tasks_to_parallelize`

Minimum tasks in a wave before parallelism is considered. Default: `2`.

### `parallelism.min_estimated_savings_seconds`

Minimum estimated wall-clock savings (sum of `typical-duration-seconds` for would-be parallel agents, minus serial cost) before parallelism is chosen. Default: `30`.

### `parallelism.require_disjoint_touches`

When `true`, agents whose `Touches:` fields overlap are never parallelized. Default: `true` (safe).

### `parallelism.worktree_isolation`

When `true`, parallel agents run in dedicated git worktrees. Default: `false` (lower overhead, shared working tree).

### `parallelism.per_stage_override`

Keyed by stage name (`brief`, `explore`, `plan`, `design`, `verify`). Any field above may be overridden per stage.

### `connections.skip`

Optional array of connection names the user has explicitly opted out of. `/gdd:connections` reads this list and never re-prompts for skipped connections. Users re-enable a skipped connection by invoking `/gdd:connections <name>` directly (bypasses the skip list for that run).

```json
{
  "connections": {
    "skip": ["pinterest", "graphify"]
  }
}
```

Valid names: `figma`, `refero`, `preview`, `storybook`, `chromatic`, `graphify`, `pinterest`, `claude-design`, `paper-design`, `pencil-dev`, `21st-dev`, `magic-patterns`.

### `connections_onboarding` (scratch block)

Transient state written by `/gdd:connections` while a setup flow is in progress. Not hand-edited. Shape:

```json
{
  "connections_onboarding": {
    "started_at": "<ISO 8601>",
    "pending_verification": ["figma", "chromatic"]
  }
}
```

`/gdd:connections` deletes this block when `pending_verification` drains. Its presence after a session restart is the signal that a resume is required (the skill jumps straight to verification).

## How Agents Read The Profile

Stages are the only code that read `.design/config.json`. When spawning an agent, the stage:

1. Reads `model_profile` from config.
2. Injects it into the agent prompt (e.g., `model_profile: balanced`) so the agent can reason about its own budget.
3. Selects the concrete model per the profile table above and passes it to the `Task` tool.

Agents never read config directly — the profile is always injected at spawn time.

## .design/budget.json Schema (Phase 10.1)

Governs the optimization layer introduced in Phase 10.1. Read by every `Agent` tool spawn via `hooks/budget-enforcer.js` (PreToolUse). Bootstrap writes defaults if the file is missing.

## Full Schema

```json
{
  "per_task_cap_usd": 2.00,
  "per_phase_cap_usd": 20.00,
  "tier_overrides": {
    "design-verifier": "haiku",
    "design-planner": "opus"
  },
  "auto_downgrade_on_cap": true,
  "cache_ttl_seconds": 3600,
  "enforcement_mode": "enforce"
}
```

## Default Config

```json
{
  "per_task_cap_usd": 2.00,
  "per_phase_cap_usd": 20.00,
  "tier_overrides": {},
  "auto_downgrade_on_cap": true,
  "cache_ttl_seconds": 3600,
  "enforcement_mode": "enforce"
}
```

## Fields

### `per_task_cap_usd`

Hard ceiling per agent spawn; breach triggers D-02 block.

### `per_phase_cap_usd`

Cumulative ceiling across all spawns within the current phase (read from `.design/STATE.md phase:` field).

### `tier_overrides`

`{agent_name: "haiku"|"sonnet"|"opus"}` per-agent tier override; wins over agent frontmatter `default-tier` per D-04.

### `auto_downgrade_on_cap`

When `true`, hook silently rewrites tier → haiku at 80% of `per_task_cap_usd` per D-03; logged as `tier_downgraded: true` in telemetry. At 100% hard-cap, D-02 behavior applies regardless.

### `cache_ttl_seconds`

TTL driving `.design/cache-manifest.json` entry expiry per D-08 Layer B.

### `enforcement_mode`

`enforce | warn | log` per D-11. `enforce` (default) is D-02 behavior; `warn` prints warnings but allows spawn; `log` is advisory-only (useful for adoption on existing projects mid-flight).

## Bootstrap behavior

If `.design/budget.json` is missing when any `/gdd:*` command runs, `scripts/bootstrap.sh` writes the Default Config values (per D-12). Don't block the spawn — defaults are sensible.

## .design/telemetry/costs.jsonl + .design/agent-metrics.json (Phase 10.1)

Phase 10.1 introduces two measurement artifacts written by `hooks/budget-enforcer.js` (PreToolUse on `Agent` spawns) and `scripts/aggregate-agent-metrics.ts` (detached child of the hook + refresh step of `/gdd:optimize`). Both files live under the gitignored `.design/` directory — they are local session state, not committed.

### .design/telemetry/costs.jsonl

Append-only ledger. One JSON object per line. Written by `hooks/budget-enforcer.js` on every PreToolUse decision: spawn allowed, spawn blocked by cap, tier downgraded, cache-hit short-circuit, lazy-gate skip. Consumed by the Phase 11 reflector (`agents/design-reflector.md`) and by `/gdd:optimize`.

**Row schema** (verbatim from ROADMAP criterion 7):

```json
{
  "ts": "<ISO-8601 timestamp>",
  "agent": "<agent name>",
  "tier": "<haiku | sonnet | opus | cache | gate>",
  "tokens_in": <int>,
  "tokens_out": <int>,
  "cache_hit": <bool>,
  "est_cost_usd": <float>,
  "cycle": "<v1.0.x>",
  "phase": "<phase slug>"
}
```

**Extra diagnostic fields** (optional; Phase 11 reflector ignores unknown fields gracefully):

- `tier_downgraded: <bool>` — set when soft-threshold downgrade fired (D-03).
- `enforcement_mode: <"enforce" | "warn" | "log">` — mirrors `.design/budget.json.enforcement_mode` at the time of decision.
- `lazy_skipped: <bool>` — set when plan 10.1-04 gate agent declined to spawn the full checker.
- `block_reason: <"per_task_cap" | "per_phase_cap">` — set when hook blocked the spawn.

**Guarantees:**

- Writes are `fs.appendFileSync` — OS-level atomic per line.
- The file is **never truncated or rotated** by the hook in v1. Log rotation is a Phase 12 concern.
- Consumers must be tolerant of malformed lines (partial writes from crashed processes) — skip-and-continue is the canonical pattern.
- Rows log only token counts, agent name, tier, cost, cycle, phase. **No prompt or response content is logged** — the schema is information-disclosure-safe by construction.

### .design/agent-metrics.json

Per-agent aggregate derived from `costs.jsonl` by `scripts/aggregate-agent-metrics.ts`. Written atomically via tmp-file + rename. Overwritten in full on every refresh — not append-only. Consumers should treat it as a snapshot.

**Schema:**

```json
{
  "generated_at": "<ISO-8601 timestamp>",
  "agents": {
    "<agent-name>": {
      "typical_duration_seconds": <number | null>,
      "default_tier": "<haiku | sonnet | opus | null>",
      "parallel_safe": <bool | null>,
      "reads_only": <bool | null>,
      "total_spawns": <int>,
      "total_cost_usd": <float>,
      "total_tokens_in": <int>,
      "total_tokens_out": <int>,
      "cache_hit_rate": <float 0..1>,
      "lazy_skip_rate": <float 0..1>
    }
  }
}
```

**Field sources:**

- `typical_duration_seconds`, `default_tier`, `parallel_safe`, `reads_only` — read from `agents/{agent}.md` frontmatter (kebab-case in the markdown; re-keyed to snake_case in JSON). Null if the agent file is absent or the field is missing.
- `total_spawns`, `total_cost_usd`, `total_tokens_in`, `total_tokens_out` — summed across all `costs.jsonl` rows for this agent.
- `cache_hit_rate = cache_hits / total_spawns` (clamped when total_spawns = 0).
- `lazy_skip_rate = lazy_skips / total_spawns` (same).

**Phase 11 reflector contract:** the fields `typical_duration_seconds`, `default_tier`, `parallel_safe`, `reads_only`, `total_spawns`, `total_cost_usd` are the exact inputs the reflector feeds into its frontmatter-update proposals (see `.planning/phases/11-self-improvement/11-02-PLAN.md`). Do not rename or drop these fields without a reflector contract update.

### Gitignore

Both files sit inside `.design/`, which is already `.gitignore`d at the project root. No changes to `.gitignore` required. A `.gitkeep` at `.design/telemetry/` ensures the directory ships empty but present (see plan 10.1-05 Task 06).

### Refresh cadence

The aggregator is invoked as a detached child process by `hooks/budget-enforcer.js` after every telemetry row write. It is also invoked directly by `/gdd:optimize` before analysis. There is no cron, no daemon, and no scheduled task — metrics are always at most one spawn stale.

## .design/cache-manifest.json Schema (Phase 10.1)

Authored and maintained by `skills/cache-manager/SKILL.md`. Read by `hooks/budget-enforcer.js` (PreToolUse on Agent spawns) for short-circuiting cached spawns per D-05. Layer B of the D-08 two-layer cache. Flat KV shape — keys are SHA-256 hex of the deterministic input-hash, values are entry objects. Schema version 1.

## Full Schema

```json
{
  "a3f1e4b2c5...": {
    "agent": "design-verifier",
    "result": "<base64-encoded-result-or-file-path>",
    "written_at": "2026-04-18T12:00:00Z",
    "ttl_seconds": 3600,
    "expires_at": "2026-04-18T13:00:00Z"
  },
  "f7e2d8a1b9...": {
    "agent": "design-planner",
    "result": ".design/cache-blobs/f7e2d8a1b9.md",
    "written_at": "2026-04-18T12:05:00Z",
    "ttl_seconds": 3600,
    "expires_at": "2026-04-18T13:05:00Z"
  }
}
```

## Empty Initial State

```json
{}
```

## Fields

### `<sha256-hex>` (key)

64-character lowercase SHA-256 hex produced by `skills/cache-manager/SKILL.md` Phase 1 (`computeInputHash(agent_path, input_file_paths)`). See that skill for the canonical algorithm.

### `agent`

String — the `agents/<name>.md` basename without extension (e.g., `design-verifier`). Human-readable debug aid; not load-bearing for lookup.

### `result`

String — either (a) a base64-encoded blob (for small results, typically < 16KB), or (b) a filesystem path under `.design/cache-blobs/<sha-prefix>.md` for larger results. Writers choose based on size; readers handle both transparently.

### `written_at`

String — ISO-8601 UTC timestamp at write time. Produced by `new Date().toISOString()`.

### `ttl_seconds`

Integer — copied from `.design/budget.json.cache_ttl_seconds` at write time (default 3600). Preserved in the entry so a later budget.json change does not retroactively invalidate or extend existing entries.

### `expires_at`

String — ISO-8601 UTC timestamp equal to `written_at + ttl_seconds`. Precomputed at write time; readers never recompute. Stale entries (`Date.now() > expires_at`) are treated as misses.

## TTL semantics

- TTL default source: `.design/budget.json.cache_ttl_seconds` (default 3600s = 1 hour, per Plan 10.1-01 schema).
- TTL is copied into each entry at write time — **not** recomputed on read. Budget.json changes do not retroactively affect existing entries.
- `expires_at` = `written_at + ttl_seconds`, computed once, stored in the entry.
- Stale entries are **not** actively purged (lazy cleanup): they remain in the file until overwritten by a new write with the same key, or pruned manually. A proactive reaper is out of v1 scope.
- Readers (`hooks/budget-enforcer.js`) check `Date.now() / 1000 > Date.parse(expires_at) / 1000`; if true, return miss.

## Read/Write contract

- **Single writer**: `skills/cache-manager/SKILL.md` Phase 4 (`write-result-on-completion`). Other code must not write this file directly.
- **Multiple readers**: `hooks/budget-enforcer.js`, any orchestrator that runs Phase 2 (`lookup`) for dry-run planning. Readers treat malformed JSON as "manifest absent" (empty cache) — do not throw.
- **Concurrency**: Claude Code agent spawns are serialized at the hook level (PreToolUse is synchronous). No file locking is needed at v1 scale. Concurrent writes from parallel orchestrators are theoretically possible but exceedingly rare; last-writer-wins is acceptable (cache miss on next read re-populates).

## Bootstrap behavior

If `.design/cache-manifest.json` is missing when `hooks/budget-enforcer.js` reads it, the hook treats every lookup as a miss and the spawn proceeds normally. No bootstrap action is required — the manifest is created lazily on first successful spawn when `skills/cache-manager/SKILL.md` Phase 4 fires. Unlike `.design/budget.json`, missing cache-manifest.json is the **correct** initial state on a fresh repo.

## Cross-references

- `skills/cache-manager/SKILL.md` — producer; documents the four-phase contract.
- `hooks/budget-enforcer.js` (Plan 10.1-01) — reader; short-circuits spawns on hit.
- `.design/budget.json` — provides `cache_ttl_seconds` default.
- `.design/telemetry/costs.jsonl` (Plan 10.1-05) — records `cache_hit: true` rows with zero tokens and zero cost when the short-circuit fires.
- D-05, D-08, D-09 in `.planning/phases/10.1-optimization-layer-cost-governance/10.1-CONTEXT.md` — decision lineage.
