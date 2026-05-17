---
name: gdd-bandit-status
description: "Surface read-only per-(agent, bin, delegate) bandit posterior snapshot — alpha/beta/mean/stddev/count/last-used per arm. Phase 27.5 (v1.27.5) diagnostic. Use when investigating 'why did the bandit pick tier X for agent Y?' or when verifying posterior convergence after enabling adaptive_mode: full."
argument-hint: ""
tools: Read, Bash
---

# gdd-bandit-status

## Role

You are a deterministic, read-only diagnostic skill. You do not spawn agents and do not modify the bandit posterior. You read `.design/telemetry/posterior.json` (the path declared by `scripts/lib/bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH` constant), aggregate per-`(agent, bin, delegate, tier)` arm state, and emit a single Markdown table summarizing the posterior. The user runs this when they want to inspect bandit decisions without touching the posterior.

Strictly read-only per Phase 27.5 D-11. To reset the posterior, use `/gdd:bandit-reset` from Phase 23.5.

## Invocation Contract

- **Input**: none. The skill takes no arguments.
- **Output**: a Markdown bandit-status table to stdout. No JSON wrapper. The table is the entire output.

## Procedure

### 1. Locate the posterior file

Read `.design/telemetry/posterior.json`. If the file does not exist:

- Emit the empty-state message:

  ```
  ## Bandit Posterior Snapshot

  No posterior data yet — run a few pipeline cycles with `adaptive_mode: full` first.

  No posterior data found at `.design/telemetry/posterior.json`.

  Possible reasons:
  - `adaptive_mode` is `static` or `hedge` (bandit is silent — see `.design/budget.json` `adaptive_mode` setting).
  - No spawns have fired since Phase 27.5 wiring landed.
  - Posterior was cleared via `/gdd:bandit-reset`.

  See `reference/bandit-integration.md` for setup guidance.
  ```

- Skip to Section 4 (Record).

### 2. Parse the posterior

Parse the file as JSON. If parsing fails (truncated/corrupted file), emit:

```
## Bandit Posterior Snapshot

Posterior file at `.design/telemetry/posterior.json` exists but is unparseable (truncated or corrupted).

Run `/gdd:bandit-reset` to start fresh, or restore from a backup.
```

The posterior schema is:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "<ISO timestamp>",
  "arms": [
    { "agent": "...", "bin": "...", "tier": "...", "delegate": "...", "alpha": N, "beta": N, "last_used": "...", "count": N }
  ]
}
```

The `delegate` field is optional — when absent, the arm is the Phase 23.5 legacy slice (equivalent to `delegate: 'none'`). The status output renders `delegate: '-'` for legacy arms to distinguish them visually from explicit `'none'` arms.

### 3. Render the table

Compute per arm:

- `mean = alpha / (alpha + beta)` (rounded to 3 decimals)
- `stddev = sqrt(alpha * beta / ((alpha + beta)^2 * (alpha + beta + 1)))` (rounded to 3 decimals)

Sort arms by `(agent ascending, bin ascending, delegate ascending where '-' sorts first, tier ascending where opus < sonnet < haiku is the canonical tier ordering, last_used descending tiebreaker)`. Group rows by agent for readability.

Emit:

```
## Bandit Posterior Snapshot

Per-(agent, bin, delegate, tier) posterior state. Read-only — to reset the posterior, use `/gdd:bandit-reset` (Phase 23.5).

Posterior file: `.design/telemetry/posterior.json` (last updated: <generated_at>)
Total arms: <count>

| Agent           | Bin    | Delegate | Tier   | Alpha | Beta  | Mean  | Stddev | Count | Last Used            |
|-----------------|--------|----------|--------|-------|-------|-------|--------|-------|----------------------|
| <agent>         | <bin>  | <deleg>  | <tier> | <a>   | <b>   | <m>   | <s>    | <c>   | <last_used or '-'>   |

> Mean = alpha / (alpha + beta). Stddev = sqrt(alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))).
> Delegate '-' = Phase 23.5 legacy slice (equivalent to 'none').
> See `reference/bandit-integration.md` for interpretation.
> Read-only — use `/gdd:bandit-reset` to clear posterior state.
```

Format numbers to fixed precision: alpha/beta to 2 decimals, mean/stddev to 3 decimals, count as integer, last_used truncated to the minute precision (`YYYY-MM-DDTHH:MM`).

When `last_used` is null (arm exists but never selected — possible if the arm was created by `ensureArm` without a subsequent `pull`), render `-` in the Last Used column.

After the table, surface a brief best-arm summary per `(agent, bin)` slice — for each unique `(agent, bin)` pair, identify the arm with the highest `mean` (tie-broken by `count` descending) and display it as the "best-arm" recommendation. This helps the operator answer "why did the bandit pick tier X?" at a glance.

### 4. Record

After execution, append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "gdd-bandit-status", "ts": "<ISO timestamp>", "arms_seen": <count>, "posterior_present": <bool>}
```

The skill writes ONLY to `.design/skill-records.jsonl` for telemetry purposes. It never touches `.design/telemetry/posterior.json`.

## Cross-references

- `scripts/lib/bandit-router.cjs` (Phase 23.5) — posterior shape, `DEFAULT_POSTERIOR_PATH` constant, `loadPosterior()` helper.
- `scripts/lib/bandit-router/integration.cjs` (Phase 27.5-01) — production-integration shim.
- `hooks/budget-enforcer.ts` (Phase 27.5-02) — bandit consultation site.
- `scripts/lib/session-runner/index.ts` (Phase 27.5-03) — outcome recording site.
- `scripts/lib/bandit-arbitrage.cjs` (Phase 27.5-04) — automated stale-frontmatter analysis.
- `reference/bandit-integration.md` (Phase 27.5-06) — operator guide.
- `/gdd:bandit-reset` (Phase 23.5) — the ONLY surface that mutates the posterior.

## Record

See Section 4 above.
