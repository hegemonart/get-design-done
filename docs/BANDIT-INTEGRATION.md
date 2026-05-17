# Bandit Integration — Operator Guide

**Phase 27.5 (v1.27.5).** This guide covers the user-facing surface of gdd's production bandit-router integration: when bandit picks the tier, how to enable or disable it, how to inspect the posterior, and how to troubleshoot decisions that don't match expectations.

Phase 23.5 shipped the bandit primitives. Phase 27-07 added the `delegate?` arm dimension. Phase 27.5 wires both into a real production routing path. After v1.27.5, frontmatter `default-tier:` is the cold-start prior — a default. The bandit picks the final tier from measurement when `adaptive_mode: full` is enabled.

For the developer cheat sheet (signatures, exports, call-site map), see `reference/bandit-integration.md`.

---

## When the bandit fires

Bandit consultation happens at the `hooks/budget-enforcer.ts` PreToolUse hook, per Agent spawn, after `resolved_models` is computed and before the SDK call. Three conditions must all hold for the bandit to override the frontmatter default tier:

1. `adaptive_mode` in `.design/budget.json` is set to `full`. The ladder is `static` (default) → `hedge` → `full`. Only `full` activates the bandit (D-07).
2. The agent's frontmatter does NOT contain an explicit `tier_override:` key. When set, `tier_override:` bypasses the bandit and pins the tier deterministically (D-05).
3. The router's 80% budget auto-downgrade did not already lower the tier. When the budget guard fires, frontmatter and bandit are both bypassed in favor of the cheaper tier.

If any condition fails, the bandit is silent and `default-tier:` (or `tier_override:`, or the budget-guard downgrade) is the final answer.

The bandit's effect is to override `resolved_models[agent]` via `tier-resolver.cjs`, mapping the bandit-selected tier through the runtime-specific model table. `model_tier_overrides[agent]` is left unchanged (preserves back-compat per D-03). A `bandit.tier_selected` event is emitted per spawn for observability.

---

## How to enable or disable the bandit

### Enable globally

Edit `.design/budget.json` and set:

```json
{
  "adaptive_mode": "full"
}
```

The Phase 23.5 ladder is `static` (no bandit, frontmatter authoritative), `hedge` (no bandit, measurement-only), `full` (bandit on). Default is `static`.

### Disable globally

Set `adaptive_mode` back to `static` (or omit the key). Bandit consultation goes silent; `default-tier:` resumes being the final answer.

### Disable per-agent

Add `tier_override:` to the agent's frontmatter to pin the tier and bypass the bandit deterministically. Use this for security-sensitive agents (auth, secrets handling, billing) where bandit exploration is unacceptable:

```yaml
---
name: my-secure-agent
default-tier: sonnet
tier_override: sonnet
---
```

`default-tier:` and `tier_override:` mean different things:

- `default-tier:` is the cold-start prior. The bandit measures against this value when seeding new arms and uses it when `adaptive_mode !== 'full'`.
- `tier_override:` is the authoritative answer the bandit does not get to override. When set, the bandit is bypassed entirely and the override tier is used.

You can ship `default-tier: opus` (signal intent) and `tier_override: sonnet` (deterministic pin) on the same agent — they don't conflict.

### Disable for one cycle only

Run with `GDD_BANDIT_BYPASS=1` in the environment. This is the same effect as flipping `adaptive_mode` to `static` for the duration of the cycle without modifying budget.json. Useful for debugging.

---

## How to inspect the posterior

### Live snapshot via `/gdd:bandit-status`

Run the read-only diagnostic skill:

```text
/gdd:bandit-status
```

Output is a Markdown table grouped by `(agent, bin, delegate)` with one row per tier and columns for `alpha`, `beta`, `mean`, `stddev`, `count`, `last_used`. Read this when investigating "the bandit picked X but I expected Y" or when verifying convergence after enabling `adaptive_mode: full`.

The skill is strictly read-only per Phase 27.5 D-11. To reset the posterior, use `/gdd:bandit-reset` from Phase 23.5.

### Direct posterior file

The posterior is persisted at `.design/telemetry/posterior.json` (Phase 23.5 D-08, unchanged by Phase 27.5 per D-06). The path is owned by the `DEFAULT_POSTERIOR_PATH` constant in `scripts/lib/bandit-router.cjs`.

Schema:

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-05-17T12:00:00.000Z",
  "arms": [
    {
      "agent": "design-discussant",
      "bin": "medium",
      "tier": "sonnet",
      "delegate": "none",
      "alpha": 12.3,
      "beta": 3.7,
      "last_used": "2026-05-17T11:55:00.000Z",
      "count": 16
    }
  ]
}
```

Each arm is a unique `(agent, bin, tier, delegate?)` slice. The `delegate` field is optional — arms without it are equivalent to the `none` slice (local-call only).

### Reading the arm statistics

- **`mean = alpha / (alpha + beta)`** — expected reward in `[0, 1]`. Higher is better.
- **`stddev = sqrt(αβ / ((α + β)² (α + β + 1)))`** — narrower means more confident. A wide stddev with few samples means the arm hasn't converged yet; treat the mean as noisy.
- **`count`** — number of pulls. Phase 23.5 D-15 recommends ≥3 pulls before treating a pick as stable.
- **`last_used`** — ISO timestamp of the last update. Older than 30 days means the discounted Thompson decay has shrunk this arm's effective weight (Phase 23.5 D-12).

### Resetting the posterior

To wipe the posterior and start fresh (e.g., after a major refactor that invalidates priors):

```text
/gdd:bandit-reset
```

This deletes `.design/telemetry/posterior.json`. The next `consultBandit()` call will re-seed from `TIER_PRIOR` (Phase 23.5).

---

## Troubleshooting: "bandit picked X but I expected Y"

Work down this checklist in order:

1. **Is `adaptive_mode` actually `full`?** Run `cat .design/budget.json` and confirm. If it reads `static` or `hedge`, the bandit is silent and `default-tier:` was the final answer — not the bandit (D-07).

2. **Does the agent's frontmatter have `tier_override:` set?** Run `grep -l tier_override agents/*.md` (or the relevant agents directory). If `tier_override:` is present, the bandit was bypassed entirely (D-05). The override tier wins.

3. **Did the 80% budget auto-downgrade fire?** Check the spawn's `bandit.tier_selected` event in `.design/telemetry/events.jsonl` for the cycle. Filter to `event_type === 'bandit.tier_selected'` and look at the payload. The `source` field tells you which branch ran:
   - `frontmatter` — `adaptive_mode !== 'full'`; bandit silent.
   - `tier_override_bypass` — explicit override set; bandit bypassed.
   - `bandit_pull` — `adaptive_mode === 'full'`, no delegate, bandit picked via `pull()`.
   - `bandit_pull_with_delegate` — same but with a specific delegate arm.

4. **Has the bandit accumulated enough data?** Run `/gdd:bandit-status` and find the `(agent, bin, delegate)` row. If `count < 3`, the pick is statistically unstable — early Thompson sampling is high-variance. Wait for more cycles or seed more aggressively via `default-tier:`.

5. **Is the posterior unexpectedly biased?** Inspect the `alpha` and `beta` values directly in `.design/telemetry/posterior.json`. If `alpha` is massive and `beta` is tiny for the picked tier, the bandit is confident — confirm the reward signal isn't wrong. If both are small, the prior is dominating; try `/gdd:bandit-reset` and re-seed.

6. **Is the reward signal misaligned with intent?** The reward function is two-stage lexicographic (D-08). Stage 1 requires `status === 'completed'` (else reward = 0). Stage 2 rewards cheaper successful spawns. If your agent is "succeeding" but cost is high, the bandit will favor cheaper tiers even if they're lower quality. Adjust `lambda` in `.design/budget.json` to weight cost less.

---

## Reward function semantics

The reward function is two-stage lexicographic (D-08, unchanged from Phase 23.5):

- **Stage 1 (correctness):** if `solidify_pass === true` (which means `status === 'completed'` at the session-runner level), the spawn can earn reward. If false, reward is `0` regardless of cost.
- **Stage 2 (cost):** for successful spawns, `reward = 1 - lambda * normalize(cost_usd + epsilon * wall_time_ms)`. Defaults: `lambda = 0.3`, `epsilon = 0.05`, `normalize` maps `[0, $5]` to `[0, 1]`.

Properties:

- A cheap successful spawn gets high reward (near `1.0`).
- An expensive successful spawn gets lower but still positive reward.
- A failure gets reward `0` regardless of cost — wasted spend is not rewarded.

Phase 27.5 uses `wall_time_ms: 0` always (D-08 left unchanged). Cost is the dominant signal. Tune `lambda` if you want a different cost-vs-correctness tradeoff.

---

## Cross-references

- `reference/bandit-integration.md` — developer cheat sheet (signatures, exports, integration entry points).
- `reference/peer-protocols.md` — Phase 27 ACP/ASP protocol cheat sheet (peer-delegation transport).
- `docs/PEER-DELEGATION.md` — Phase 27 operator guide for peer-CLI delegation.
- `scripts/lib/bandit-router.cjs` — Phase 23.5 primitives (`pull`, `update`, `pullWithDelegate`, `updateWithDelegate`, `computeReward`, `loadPosterior`, `savePosterior`).
- `scripts/lib/bandit-router/integration.cjs` — Phase 27.5 production-integration shim (`consultBandit`, `recordOutcome`).
- `hooks/budget-enforcer.ts` — bandit consultation site (per spawn).
- `scripts/lib/session-runner/index.ts` — `recordOutcome` call site (per `session.completed`).
- `agents/design-reflector.md` Section 8 — bandit-arbitrage analysis surfacing stale-frontmatter proposals.
