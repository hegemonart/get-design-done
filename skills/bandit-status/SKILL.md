---
name: gdd-bandit-status
description: "Surface read-only per-(agent, bin, delegate) bandit posterior snapshot — alpha/beta/mean/stddev/count/last-used per arm. Phase 27.5 (v1.27.5) diagnostic. Use when investigating 'why did the bandit pick tier X for agent Y?' or when verifying posterior convergence after enabling adaptive_mode: full."
argument-hint: ""
tools: Read, Bash
---

# gdd-bandit-status

## Role

You are a deterministic, read-only diagnostic skill. You do not spawn agents and do not modify the posterior. You read `.design/telemetry/posterior.json` (path declared by `scripts/lib/bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH`), aggregate per-`(agent, bin, delegate, tier)` arm state, and emit a single Markdown table. Read-only per Phase 27.5 D-11 — to reset, use `/gdd:bandit-reset` (Phase 23.5). See `./reference/bandit-integration.md` for setup, interpretation, and convergence guidance.

## Invocation Contract

- **Input**: none.
- **Output**: a Markdown bandit-status table to stdout. The table is the entire output.

## Procedure

### 1. Locate the posterior file

Read `.design/telemetry/posterior.json`. Missing → emit empty-state message:

```
## Bandit Posterior Snapshot

No posterior data yet — run a few pipeline cycles with `adaptive_mode: full` first.

No posterior data found at `.design/telemetry/posterior.json`.

Possible reasons:
- `adaptive_mode` is `static` or `hedge` (bandit silent — see `.design/budget.json`).
- No spawns have fired since Phase 27.5 wiring landed.
- Posterior was cleared via `/gdd:bandit-reset`.

See `reference/bandit-integration.md` for setup guidance.
```

Skip to Section 4 (Record). Parse failure (truncated/corrupted) → emit `Posterior file exists but is unparseable. Run /gdd:bandit-reset to start fresh, or restore from a backup.`

### 2. Parse the posterior

Schema:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "<ISO>",
  "arms": [{ "agent": "...", "bin": "...", "tier": "...", "delegate": "...", "alpha": N, "beta": N, "last_used": "...", "count": N }]
}
```

The `delegate` field is optional — absent = Phase 23.5 legacy slice (rendered as `-` in the table).

### 3. Render the table

Compute per arm: `mean = alpha / (alpha + beta)` (3 decimals), `stddev = sqrt(alpha*beta / ((alpha+beta)^2 * (alpha+beta+1)))` (3 decimals).

Sort by `(agent ASC, bin ASC, delegate ASC where '-' first, tier ASC opus<sonnet<haiku, last_used DESC)`. Group by agent for readability.

Emit:

```
## Bandit Posterior Snapshot

Per-(agent, bin, delegate, tier) posterior state. Read-only — to reset use `/gdd:bandit-reset` (Phase 23.5).

Posterior file: `.design/telemetry/posterior.json` (last updated: <generated_at>)
Total arms: <count>

| Agent | Bin | Delegate | Tier | Alpha | Beta | Mean | Stddev | Count | Last Used |
|-------|-----|----------|------|-------|------|------|--------|-------|-----------|
| ...   | ... | ...      | ...  | ...   | ...  | ...  | ...    | ...   | ...       |

> Mean = alpha / (alpha + beta). Stddev = sqrt(alpha*beta / ((alpha+beta)^2 * (alpha+beta+1))).
> Delegate '-' = Phase 23.5 legacy slice (equivalent to 'none').
> See `reference/bandit-integration.md` for interpretation.
> Read-only — use `/gdd:bandit-reset` to clear posterior state.
```

Precision: alpha/beta 2 decimals; mean/stddev 3 decimals; count integer; `last_used` truncated to minute (`YYYY-MM-DDTHH:MM`); null `last_used` renders `-`.

After the table, surface a per-`(agent, bin)` best-arm summary: for each unique pair, identify highest-mean arm (tie-broken by `count` DESC) — answers "why did the bandit pick tier X?" at a glance.

### 4. Record

Append one JSONL line to `.design/skill-records.jsonl`: `{"skill":"gdd-bandit-status","ts":"<ISO>","arms_seen":<count>,"posterior_present":<bool>}`. Skill writes ONLY to skill-records.jsonl (telemetry); never touches the posterior.

## Cross-references

- `./reference/bandit-integration.md` — operator guide; interpretation patterns.
- `scripts/lib/bandit-router.cjs` (Phase 23.5) — posterior shape, `DEFAULT_POSTERIOR_PATH`, `loadPosterior()`.
- `scripts/lib/bandit-router/integration.cjs` (27.5-01), `hooks/budget-enforcer.ts` (27.5-02), `scripts/lib/session-runner/index.ts` (27.5-03), `scripts/lib/bandit-arbitrage.cjs` (27.5-04), `/gdd:bandit-reset` (Phase 23.5) — only surface that mutates the posterior.
