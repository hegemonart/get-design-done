# Design Variants + the `design_arms` Outcome Loop

How `/gdd:design --variants N` generates competing, hypothesis-tagged design variants, and how external outcomes (A/B experiments + user research) feed the `design_arms` posterior so the design stage learns **which patterns win with users** - not just which pass lint/test. The posterior math lives in `scripts/lib/ds-arms/design-arms-store.cjs`; the ingest agents are `agents/experiment-result-ingester.md` (A/B) + `agents/user-research-synthesizer.md` (research).

---

## The variant tag

When `--variants N` is set (default **N = 2**, the A/B baseline), the design stage emits N competing variants, each carrying an **explicit, testable hypothesis**:

```html
<variant id="A" component="primary-cta" pattern="cta-bold-filled"
         hypothesis="A bolder, filled primary CTA raises checkout conversion" />
<variant id="B" component="primary-cta" pattern="cta-outline-secondary"
         hypothesis="A lower-pressure outline CTA reduces accidental taps" />
```

- **`id`** - A, B, C… (stable within a cycle).
- **`component`** - the `component_type` the arm is keyed on (e.g. `primary-cta`, `pricing-card`, `signup-form`).
- **`pattern`** - a short pattern slug → hashed to `variant_pattern_hash` via `variantKey(component, pattern)`.
- **`hypothesis`** - a falsifiable prediction in user-outcome terms (conversion, completion, error rate). This is the contract an A/B test or research finding later resolves.

A variant without a hypothesis is not a variant - it's an opinion. The stage refuses to tag one without it.

## The `design_arms` posterior (advisory)

Each `(component_type, variant_pattern_hash)` is an **arm** with a Beta posterior, conservative **Beta(2, 8)** prior (posterior mean 0.2 - a pattern must EARN trust from real outcomes; the Phase 29 fairness-gate pattern). Distinct from the routing bandit's `routing_arms` (`scripts/lib/bandit-router.cjs`) - design_arms learn from **users**, not from internal pass/fail.

**Before generation**, the design stage may consult the posterior:

```js
const { variantKey, pull } = require('scripts/lib/ds-arms/design-arms-store.cjs');
const arm = pull('primary-cta', variantKey('primary-cta', 'cta-bold-filled'));
// arm.mean = 0.70  → "cta-bold-filled has a 70% win rate — bias toward it"
```

**D-03 - advisory, never directive.** The posterior *biases* which patterns the stage proposes (and how it orders variants), but the **user always wins**: if the posterior favors A and the user asks for B, generate B. Surface the posterior as a note ("heads-up: pattern A has won 7/10 prior experiments"), never as a veto.

## Closing the loop (outcome ingest)

1. **A/B** - `experiment-result-ingester` reads a LaunchDarkly / Statsig / GrowthBook result, maps each variant to a win/lose, and calls `observe(component, hash, { won, source: 'ab' })`. Emits an `experiment_result` event (Phase 22 chain).
2. **Research** - `user-research-synthesizer` reads UserTesting / Maze / Hotjar reports (**pseudonymized first** - D-05), extracts findings, and folds qualitative signal as `observe(..., { source: 'research', weight })`.
3. **Dev-time** (Phase 47, later) - live-accepted variants observe with `source: 'dev_time'` under a conservative discount.

`observe(won: true)` increments `alpha`; `won: false` increments `beta`. Over many experiments the posterior mean converges on the pattern's true win rate, and the design stage's bias tracks reality.

## Store API (summary)

| Function | Purpose |
|---|---|
| `variantKey(componentType, pattern)` | stable arm key (inline FNV-1a; dependency-free) |
| `pull(componentType, hash)` | the arm's `{ alpha, beta, mean, count, seen }` (Beta(2,8) prior if unseen) |
| `observe(componentType, hash, { won, weight?, source? })` | fold one outcome; persists atomically |
| `all()` | every arm + posterior mean (for ranking) |

Persists to `.design/telemetry/design-arms.json` (atomic write); never touches `posterior.json` (the routing bandit).
