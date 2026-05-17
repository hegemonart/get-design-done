---
name: bandit-integration
phase: 27.5
version: 1.0.0
type: meta-rules
description: Bandit posterior + production-integration shim cheat sheet — signatures, reward function semantics, adaptive_mode gate, posterior path conventions.
---

# Bandit Integration — Developer Cheat Sheet

**Phase 27.5 (v1.27.5).** Reference for the bandit production-integration surface. Authoring or modifying a caller of the bandit posterior? Debugging a routing decision at the code level? Start here.

For ops-level guidance (when bandit fires, how to disable, posterior inspection), see `docs/BANDIT-INTEGRATION.md`.

In-scope modules:

- `scripts/lib/bandit-router.cjs` (Phase 23.5 primitives).
- `scripts/lib/bandit-router/integration.cjs` (Phase 27.5 shim).

---

## The two-stage architecture

Phase 23.5 ships the bandit primitives — Thompson-sampling pull, posterior update, computeReward, atomic persistence. Phase 27-07 added the `delegate?` arm dimension (5 peer-CLI arms + the local `none` arm). Both phases shipped library-only with no production callers.

Phase 27.5 ships the production-integration shim that wraps the primitives behind two purpose-built entry points and hides the `pull` vs `pullWithDelegate` choice. Callers pass a `delegate` argument and the shim routes internally.

### Phase 23.5 + 27-07 surface — `scripts/lib/bandit-router.cjs`

Exports: `pull`, `update`, `pullWithDelegate`, `updateWithDelegate`, `computeReward`, `loadPosterior`, `savePosterior`, `reset`, `decayArm`, `sampleBeta`, `priorFor`, `binForGlobCount`, `DEFAULT_DELEGATES`, `DELEGATE_NONE`, `TIER_PRIOR`, `PRIOR_STRENGTH`, `TOUCHES_BINS`, `DEFAULT_POSTERIOR_PATH`, `SCHEMA_VERSION`.

The two-pair primitive split:

- `pull({agent, bin, ...})` / `update({agent, bin, tier, reward, ...})` — operate on the `(agent, bin, tier)` arm slice. Equivalent to `delegate='none'`.
- `pullWithDelegate({agent, bin, delegates, ...})` / `updateWithDelegate({agent, bin, tier, delegate, reward, ...})` — operate on the `(agent, bin, tier, delegate)` arm slice for any `delegate ∈ DEFAULT_DELEGATES`.

### Phase 27.5 surface — `scripts/lib/bandit-router/integration.cjs`

Exports: `consultBandit`, `recordOutcome`, `DELEGATE_NONE`.

Routing rules (D-05, D-07):

1. `agentFrontmatter.tier_override` set → bypass bandit, return `tier_override`.
2. `adaptiveMode !== 'full'` → bandit silent, return `frontmatter.default_tier`.
3. `adaptiveMode === 'full'` + delegate `'none'` or undefined → call `pull()`.
4. `adaptiveMode === 'full'` + delegate is a peer name → call `pullWithDelegate({delegates: [delegate]})`.

`recordOutcome` is symmetric on the adaptive-mode gate.

---

## `consultBandit` signature

```javascript
consultBandit({
  agent: string,            // required
  bin: string,              // required: 'tiny' | 'small' | 'medium' | 'large'
  delegate: string,         // 'none' or one of DEFAULT_DELEGATES
  agentFrontmatter: {
    tier_override?: string,
    default_tier?: string,
  },
  adaptiveMode?: 'static' | 'hedge' | 'full',  // omit to read on-disk
  baseDir?: string,         // override workspace root (test-injection)
  posteriorPath?: string,   // override posterior file path (test-injection)
}) → {
  tier: 'haiku' | 'sonnet' | 'opus',
  decision_log: {
    source: 'frontmatter' | 'tier_override_bypass' | 'bandit_pull' | 'bandit_pull_with_delegate',
    samples?: { haiku?: number, sonnet?: number, opus?: number },
    delegate?: string,
    adaptive_mode: string,
    reason?: string,
  },
}
```

`decision_log.source` is the audit trail — it tells observability tools which routing branch ran. Tests use it to assert the correct path was taken.

---

## `recordOutcome` signature

```javascript
recordOutcome({
  agent: string,
  bin: string,
  delegate: string,
  tier: string,
  status: string,           // SessionResult.status — only 'completed' triggers reward.solidify_pass
  costUsd?: number,
  adaptiveMode?: 'static' | 'hedge' | 'full',
  baseDir?: string,
  posteriorPath?: string,
}) → void  // best-effort per D-04 — write errors are swallowed
```

Reward semantics:

- `solidify_pass = (status === 'completed')`.
- If `!solidify_pass`, reward is `0`. If true, reward is `1 - lambda * normalize(costUsd + epsilon * wallTimeMs)`.

Phase 27.5 passes `wallTimeMs: 0` always (D-08 unchanged from Phase 23.5).

---

## `adaptive_mode` gate semantics

Phase 23.5 ladder (D-07):

- `static` — default. Bandit silent. `default-tier:` is authoritative. No reads, no writes.
- `hedge` — measurement-only. Bandit silent on reads, but `recordOutcome` may still write to seed the posterior. Currently identical to `static` in Phase 27.5; reserved for Phase 28+ explicit "hedge mode".
- `full` — bandit active. Reads pick via Thompson sampling; writes update posterior.

The shim respects the gate transparently. Operators flip via `.design/budget.json#adaptive_mode`.

---

## Reward function

`computeReward({solidify_pass, cost_usd, wall_time_ms, lambda?, epsilon?, costNormalizer?}) → number`

Two-stage lexicographic (D-08, unchanged from Phase 23.5):

- Stage 1 — correctness: if `solidify_pass !== true`, return `0`.
- Stage 2 — cost: return `1 - lambda * normalize(cost_usd + epsilon * wall_time_ms)`.

Defaults: `lambda = 0.3`, `epsilon = 0.05`. `normalize` maps `[0, $5]` linearly to `[0, 1]`, clamped.

Cheaper successful spawns get higher reward. Failed spawns are flat zero. Tune `lambda` to weight cost less.

---

## Posterior path

Canonical path: `.design/telemetry/posterior.json` (Phase 23.5 D-08, Phase 27.5 D-06 unchanged). Path is owned by `DEFAULT_POSTERIOR_PATH` constant in `scripts/lib/bandit-router.cjs`.

Test injection: pass `baseDir` (anchors path under a different workspace root) or `posteriorPath` (overrides the file path directly). Both `consultBandit` and `recordOutcome` accept these options.

Write discipline: atomic via `.tmp` + rename. Read failures yield an empty posterior; subsequent writes overwrite. Concurrent writers within the same process are not synchronized — gdd's session-runner is single-threaded.

---

## Call sites

Phase 27.5 wires these consumers:

- **`hooks/budget-enforcer.ts`** (Plan 27.5-02) — per Agent spawn, after `resolved_models` is computed, before SDK call. Calls `consultBandit({agent, bin, delegate, agentFrontmatter, adaptiveMode})`. Overrides `resolved_models[agent]` with the bandit tier via `tier-resolver.cjs`. Emits `bandit.tier_selected` event for observability.
- **`scripts/lib/session-runner/index.ts`** (Plan 27.5-03) — terminal-emit path. Calls `recordOutcome({agent, bin, delegate, tier, status, costUsd})` after every `emit('session.completed', ...)` site (4 sites: rate-limited, peer-success, turn-cap-zero, terminal retry-exit). Posterior write is best-effort; missing optional fields silent.
- **`agents/design-reflector.md` Section 8** (Plan 27.5-04) — bandit-arbitrage analysis. `scripts/lib/bandit-arbitrage.cjs` reads `.design/telemetry/posterior.json` and surfaces stale-frontmatter proposals. Mirrors Phase 26-06's `cost-arbitrage.cjs` shape.
- **`skills/peers/SKILL.md` Step 5 + `skills/bandit-status/SKILL.md`** (Plan 27.5-05) — read-only diagnostic surfaces. `/gdd:peers` posterior delta column populated; `/gdd:bandit-status` renders per-`(agent, bin, delegate, tier)` snapshots.

---

## Cross-references

- `docs/BANDIT-INTEGRATION.md` — operator guide (when bandit fires, how to disable, troubleshooting).
- `reference/peer-protocols.md` — Phase 27 ACP/ASP cheat sheet (peer-CLI delegation transport).
- `scripts/lib/bandit-router.cjs` — Phase 23.5 primitives surface.
- `scripts/lib/bandit-router/integration.cjs` — Phase 27.5 production shim.
- `scripts/lib/bandit-arbitrage.cjs` — Phase 27.5 reflector analyzer (Section 8 of `design-reflector.md`).
- `hooks/budget-enforcer.ts` — bandit consultation site.
- `scripts/lib/session-runner/index.ts` — `recordOutcome` site.
