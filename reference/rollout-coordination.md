# Rollout Coordination - the `<rollout_status>` contract + the verify→prod loop

How GDD tracks a design from "PR merged" to "live for 100% of users", and feeds the **actual deployment percentage** back into the `design_arms` posterior so a variant's reward reflects how widely it was really shipped. The deterministic classifier is `scripts/lib/rollout/rollout-status.cjs`; the orchestration is `agents/rollout-coordinator.md` + `/hone:rollout-status`. GDD **reads** the feature-flag service (via the Phase 38 LaunchDarkly/Statsig/GrowthBook connections) - it never drives the rollout.

---

## Rollout states

A cycle's rollout is classified from a normalized flag state (`{ stagingEnabled, prodEnabled, prodPercent }`):

| State | Meaning |
|---|---|
| `unrolled` | not in staging or prod |
| `staging-only` | enabled in staging (or prod-enabled at 0%) - no prod traffic |
| `canary-N%` | live to N% of prod (0 < N < 100) |
| `prod-100%` | fully rolled out |

`deployedPct(flagState)` returns the live prod percentage (0 when not in prod).

## The `<rollout_status>` STATE block

The coordinator writes one block per cycle into `.design/STATE.md`:

```xml
<rollout_status>
cycle: 2026-06-checkout-redesign
state: canary-10%
deployed_pct: 10
flag_service: launchdarkly
last_changed: 2026-05-20
stuck: false
</rollout_status>
```

`state` ∈ the four states above; `deployed_pct` 0–100; `stuck` is `true` when a **partial** rollout (`staging-only`/`canary-N%`) has not advanced for ≥ the threshold.

## Stuck detection

`isStuck(state, daysSinceChange, threshold)` - a partial rollout that has not progressed for ≥ `threshold` days (default **14**, configurable via `.design/config.json rollout.stuck_days`). `prod-100%` and `unrolled` are never stuck. `/hone:rollout-status` surfaces stuck cycles ("canary-10% for 18 days - advance or roll back?"). GDD **notifies**; it does not auto-advance or roll back (read-only - D-02).

## Feeding `design_arms` (deployed_pct weighting)

When a cycle's variant reaches prod, the coordinator folds the outcome into the `design_arms` posterior weighted by how widely it deployed (D-03, linear):

```js
const { deployedWeight } = require('scripts/lib/rollout/rollout-status.cjs');
const { variantKey, observe } = require('scripts/lib/ds-arms/design-arms-store.cjs');
observe(component, variantKey(component, pattern),
        { won, weight: deployedWeight(deployed_pct), source: 'verify_outcome' });
```

`deployedWeight(pct) = pct/100` - a variant rolled to 10% contributes a 0.1-weight observation; a fully-rolled variant contributes 1.0. This keeps the bandit honest: a "win" that only reached 10% of users is weak evidence. `verify_outcome` is a **slow-loop** reward, distinct from internal lint/test signals.

## Events (Phase 22 chain)

The coordinator emits free-form `type` events (registered in `reference/schemas/events.schema.json`):

- `rollout_started` - first prod exposure (`unrolled`/`staging-only` → `canary-N%`).
- `rollout_advanced` - canary % increased, or → `prod-100%`.
- `rollout_stuck` - a partial rollout crossed the stuck threshold.
- `verify_outcome` - the outcome fed to `design_arms` (carries `deployed_pct` + `weight`).

All event payloads are PII-free (cycle id, component, pattern slug, percentages - no user data).
