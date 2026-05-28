# Capability-Gap Stage-0 → Stage-1 Gate Specification

> Phase 29 reference doc. Specifies the deterministic gate that decides when
> the reflector has gathered enough `capability_gap` signal to surface a
> one-time opt-in prompt for Stage-1 (incubator authoring of new agents /
> skills). **No code path in this repository auto-flips the stage** —
> D-01 is the discipline.

---

## 1. Overview

Phase 29 ships in two stages:

- **Stage 0** (Wave A, v1.29.0) emits `capability_gap` events from
  `/gdd:fast` no-skill-match (Plan 29-01), `gdd-router` unmatched-intent
  (Plan 29-01), and the reflector pattern-detection pass (Plan 29-02).
- **Stage 1** (Wave B) layers incubator authoring of agents and skills on
  top of the Stage-0 signal (Plans 29-04 / 29-05 / 29-06).

The transition Stage 0 → Stage 1 is **gated on data**, not on a calendar
date or a release. The reflector aggregates events into per-cycle
clusters (`scripts/lib/reflector-capability-gap-aggregator.cjs`) and
evaluates a deterministic stability function against the project's
cycle history. When the gate is crossed, `/gdd:apply-reflections`
emits a **one-time user-facing prompt** in the cycle markdown — never
an auto-stage-flip. The user opting in is a separate explicit action,
out of scope for this gate spec.

Reference: **Phase 29 CONTEXT.md decision D-01** (two-stage approach;
user opts in per a one-time prompt; if data is thin, Stage 1 never
auto-enables).

---

## 2. Default thresholds

The gate has three knobs, all set in `.design/config.json`
under the `capability_gap_gate` key. Defaults:

| Knob | Default | Meaning |
|------|---------|---------|
| `K` | `3` | Minimum number of **stable clusters** required to cross the gate. |
| `M` | `10` | Minimum number of **consecutive cycles** a cluster must appear in to be considered for stability. |
| `stddev_threshold` | `0.05` | Maximum allowed posterior `stddev(Beta(α, β))` for a cluster to be considered stable. |

All three are overridable via `.design/config.json`:

```jsonc
{
  "capability_gap_gate": {
    "K": 3,
    "M": 10,
    "stddev_threshold": 0.05
  }
}
```

Reference: **Phase 29 CONTEXT.md decision D-03** (defaults are starting
points; first-N-users data should refine).

Validation: `K` must be a positive integer, `M` a positive integer,
`stddev_threshold` a number in `(0, 1]`. The evaluator silently falls
back to defaults if any value is invalid (T-29.03-02 mitigation in the
plan's threat model).

---

## 3. Stability formula

A cluster `c` is **stable** iff both conditions hold:

1. **Consecutive presence.** `c` appears in `≥ M` consecutive cycles
   somewhere within the observed history. (The most recent unbroken
   run is what matters — if a cluster missed a cycle, the run resets
   and only the longest streak counts.)
2. **Narrow posterior.** The closed-form posterior standard deviation
   of the Beta distribution satisfies:

   ```
   stddev(Beta(α, β)) = sqrt( (α · β) / ((α + β)² · (α + β + 1)) )
   ```

   with the Laplace prior (matches Phase 23.5's bandit-router posterior
   store):

   ```
   α = appearances + 1
   β = (cycles_observed − appearances) + 1
   ```

   where `appearances` is the total number of cycles in which `c` was
   present (across the full history, not just the M-window) and
   `cycles_observed = history.length`.

**Worked example.** A cluster present in 25 of the 30 observed cycles
with a longest consecutive run of 18 has `α = 26`, `β = 6`, so
`stddev ≈ sqrt((26·6)/(32²·33)) ≈ sqrt(0.0154) ≈ 0.124`. That fails
the default `stddev_threshold = 0.05`. To clear `0.05`, that same
cluster would need closer to 30/30 presence or a longer history.

**Cross-link.** The closed-form Beta-stddev is shared with Phase 23.5
(see `scripts/lib/bandit-arbitrage.cjs` and the
"Bandit-arbitrage analysis" section in `agents/design-reflector.md`).
The same posterior is what gates frontmatter-tier corrections; here it
gates stage transition.

---

## 4. Evaluation cadence

Gate evaluation runs every time `/gdd:apply-reflections` is invoked.
Inputs:

1. The reflector pass collects all cycle markdown files in
   `.design/reflections/` and parses the `## Capability gaps observed`
   sections (emitted by `renderGapsSection` in
   `scripts/lib/reflector-capability-gap-aggregator.cjs`).
2. The per-cycle cluster lists are folded into a history array of
   `{ cycle_slug, clusters }` entries.
3. `evaluateStageGate(history, config)` is called once and returns:

   ```ts
   { crossed: boolean, stable_cluster_ids: string[], cycles_observed: number }
   ```

4. If `crossed === true` and the project has not previously opted in
   (see § 6), the prompt in § 5 is emitted into the cycle markdown.

The evaluation is **deterministic** (no randomness), **idempotent**
(no side-effects in the evaluator), and **read-only** with respect to
`.design/config.json` — that file is only updated by the user's
explicit opt-in action, never by the reflector.

---

## 5. Gate-crossed prompt

When the gate crosses for the first time, `/gdd:apply-reflections`
appends the following verbatim block to the cycle markdown:

> ```markdown
> ## Stage-0 → Stage-1 gate crossed — opt-in required
>
> Capability-gap detection has accumulated enough signal across recent
> cycles to consider enabling Stage-1 (incubator authoring of new
> agents / skills). The gate is informational only — **nothing has
> changed in the runtime**, and Stage-1 will NOT auto-enable. Per
> Phase 29 CONTEXT.md decision D-01, the user opts in explicitly.
>
> - Stable clusters observed: **<N>** (≥K = <K>)
> - Cycles observed: **<cycles_observed>** (≥M = <M>)
> - Stable cluster IDs (truncated):
>   - `<cluster_id_1>`
>   - `<cluster_id_2>`
>   - `<cluster_id_3>`
>
> If you want to enable Stage-1 incubator authoring (Plans 29-04 / 29-05),
> opt in with the project-local command below. You can always opt out
> later by deleting the timestamps from `.design/config.json` (§ 7).
>
> <!-- Phase 30.6 (D-09) update: per the convention adopted across the
>      knowledge layer in v1.30.6, project-local config flips are direct
>      edits to .design/config.json — no CLI subcommand. The canonical
>      opt-in is therefore: edit .design/config.json to add
>      { "capability_gap_gate": { "opted_in_at": "<ISO date>" } }.
>      Plan 29-05 (apply-reflections extension) surfaces this as a guided
>      prompt rather than a CLI invocation. -->
>
> This prompt is emitted at most once per project. If you ignore it,
> the gate continues to evaluate every cycle but does not re-prompt
> (the `user_prompted_at` timestamp in `.design/config.json` suppresses
> it). To re-trigger the prompt for a fresh round of evaluation, delete
> `capability_gap_gate.user_prompted_at` from `.design/config.json`.
> ```

The wiring side of this — actually writing the `user_prompted_at`
timestamp and routing the opt-in confirmation — is deferred to
**Plan 29-05** (`/gdd:apply-reflections` extension). This document
specifies the prompt text and behavior; 29-05 implements the
state-machine that consumes it.

---

## 6. Opt-in semantics

Two timestamps in `.design/config.json` track the project's gate state:

```jsonc
{
  "capability_gap_gate": {
    "K": 3,
    "M": 10,
    "stddev_threshold": 0.05,
    "user_prompted_at": "2026-05-19T22:00:00.000Z",   // set when § 5 emitted
    "opted_in_at": "2026-05-19T22:05:00.000Z"         // set when user opts in
  }
}
```

- **`user_prompted_at`** is set the first time the gate crosses and the
  prompt block is rendered. The prompt is not re-emitted while this
  timestamp is present.
- **`opted_in_at`** is set when the user explicitly opts into Stage-1.
  Stage-1 incubator authoring (Plans 29-04+) becomes active once this
  timestamp is present. **Stage 1 is NEVER enabled by the reflector
  setting this timestamp itself** — D-01 lock.

Once `opted_in_at` is set, the gate stops emitting prompts entirely
(it's a one-shot mechanism, not a continuous nudge).

---

## 7. Reset / override

Operators can manually reset the gate by editing `.design/config.json`:

| Effect desired | Action |
|----------------|--------|
| Re-prompt on next gate cross | Delete `capability_gap_gate.user_prompted_at`. |
| Revert from Stage-1 to Stage-0 | Delete `capability_gap_gate.opted_in_at`. (Stage-1 artifacts in `.design/reflections/incubator/` are NOT removed by this; deletion is the user's call.) |
| Tighten / loosen thresholds | Edit `K` / `M` / `stddev_threshold` directly. Out-of-range values silently fall back to defaults (§ 2). |

Reset is **explicit** and **idempotent**. The reflector never writes
to these fields on its own — the only writers are (a) the
`/gdd:apply-reflections` opt-in path (Plan 29-05) and (b) the human
operator editing the file by hand.

---

## 8. Test fixtures

Executable examples that exercise the gate live in
`tests/reflector-capability-gap-aggregation.test.cjs`:

- **T3** — 30 cycles × 3 always-present clusters → gate crosses with
  default K=3 / M=10 / stddev_threshold=0.05.
- **T3b** — 10 cycles × 1 always-present cluster → gate does NOT
  cross (posterior stddev ≈ 0.077 with α=11, β=1 is above the 0.05
  threshold; M=10 is the lower bound on observations, not a
  sufficient condition for stability).
- **T4** — 30 cycles, 2 always-present clusters + 1 "noisy" cluster
  present in only the first 4 cycles → gate does NOT cross
  (`stable_cluster_ids.length === 2 < K=3`).
- **T4b** — 5 cycles total → gate does NOT cross (`cycles_observed < M`).
- **T7** — Confirms `K` and `stddev_threshold` overrides flow through
  `normalizeConfig` and reach the evaluation.

These fixtures are synthetic and inline (D-11). The gate evaluator
never reads `.design/gep/events.jsonl` directly in CI — fixtures
seed the cluster lists by hand.

---

## Decisions referenced

- **D-01** — Two-stage approach: Stage 0 telemetry-only ships first;
  Stage 1 authoring gated on data; user opts in per a one-time prompt;
  no auto-flip.
- **D-03** — Default `K=3` / `M=10` / `stddev_threshold=0.05`,
  overridable via `.design/config.json`.
- **D-11** — Tests use synthetic fixtures (no live event chain reads).
- **Phase 23.5** — Posterior `stddev(Beta(α, β))` closed form and
  Laplace prior convention reused here.
