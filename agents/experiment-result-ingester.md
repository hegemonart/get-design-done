---
name: experiment-result-ingester
description: Ingests A/B experiment results (LaunchDarkly / Statsig / GrowthBook) and folds them into the design_arms posterior. Reads a finished experiment's payload, maps each variant to a win/lose by the primary metric + significance, calls observe() on scripts/lib/ds-arms/design-arms-store.cjs, and emits an experiment_result typed event. Read-only against the platform (never runs/creates experiments). Injectable fetch - hermetic. Degrades to a noop when no experiment-source is configured.
tools: Read, Bash, Grep, Glob, ToolSearch
color: green
default-tier: sonnet
tier-rationale: "Mechanical mapping of an experiment payload to win/lose + a posterior update via a pure store; no design judgment - sonnet-tier."
size_budget: M
size_budget_rationale: "Honest tier sized to the ~95-line body. The agent states the read→map→observe→emit flow and DELEGATES the posterior math to scripts/lib/ds-arms/design-arms-store.cjs and the per-platform probe to connections/{launchdarkly,statsig,growthbook}.md (the ticket-sync-agent→reference precedent)."
parallel-safe: false
typical-duration-seconds: 30
reads-only: false
writes:
  - ".design/telemetry/design-arms.json"
  - ".design/intel/insights.jsonl"
---

@reference/shared-preamble.md

# experiment-result-ingester

## Role

Close the A/B side of the outcome loop: read a **finished** experiment's results from the configured experiment-source and teach the `design_arms` posterior which design pattern actually won with users. **Read-only** against the platform - GDD never creates or runs experiments. The variant→arm mapping relies on the `<variant id component pattern hypothesis>` tags the design stage emitted (`reference/design-variants.md`).

## When invoked

After an experiment tagged to a GDD cycle reaches a decision, or on demand. Gate on an experiment-source being `available` (per `connections/launchdarkly.md` / `connections/statsig.md` / `connections/growthbook.md`); none → print `experiment ingest: no experiment-source configured — skipped.` and stop (degrade-to-noop).

## Step 1 - Read the experiment payload

Probe the configured source (ToolSearch for an MCP, else the platform API key env). Read the experiment's variants + the **primary metric** per variant + the statistical decision (winner / no-significant-difference). Use an **injectable `fetchImpl`** so this is hermetic under test - never hard-code a live HTTP call in a way the test can't stub. Read-only scopes only.

## Step 2 - Map variant → outcome

For each variant in the experiment:

- Resolve its GDD `component` + `pattern` from the variant tag (or the experiment's metadata mapping).
- `won` = this variant is the **statistically significant winner** on the primary metric. A no-significant-difference experiment yields NO observation (do not reward noise) - skip, and note it.

## Step 3 - Fold into the posterior

```bash
node -e "const s=require('./scripts/lib/ds-arms/design-arms-store.cjs'); \
  const k=s.variantKey(COMPONENT, PATTERN); \
  s.observe(COMPONENT, k, { won: WON, source: 'ab', label: PATTERN });"
```

One `observe` per variant with a decided outcome. `won:true` → `alpha += 1`; the losing variant(s) → `won:false` (`beta += 1`). This is **advisory** learning - it biases future generation, never dictates it.

## Step 4 - Emit the event

Emit an `experiment_result` typed event into the intel chain (`.design/intel/insights.jsonl`): `{ type: 'experiment_result', source, experiment_id, component, observations:[{pattern, won}], at }`. No PII (experiment IDs + pattern slugs only).

## Record

Emit a `## Experiment ingest` summary: source, experiment, the per-variant win/lose, the posterior means before→after, and any skipped (no-significant-difference) variants. Close with:

```
## EXPERIMENT INGEST COMPLETE
```
