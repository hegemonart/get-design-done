# Retrieval Contract — 3-Layer Search

When an agent or skill needs information from `.design/` artifacts or the `reference/` library, apply this protocol in order. Token economy matters — ladder from cheapest to most expensive.

## Layer 1 — Search (~50–100 tokens per hit)

Open `reference/registry.json` or the intel index at `.design/intel/`. Read one row per candidate: `{name, path, type, tier, description}`. This is enough to decide whether to descend further.

- `list({type})` — everything tagged with a given type (e.g., `"heuristic"`, `"motion"`, `"preamble"`).
- `find(name)` — direct lookup for a specific reference file by short name.

## Layer 2 — Metadata (~200–300 tokens per hit)

Open the candidate file's frontmatter + first 20 lines + heading outline. Decide if the full body is on the critical path.

## Layer 3 — Full document (~500–1000+ tokens)

Read the file with the `Read` tool. Only do this when layers 1 and 2 confirmed the doc is load-bearing for the current task.

## Token economy

A `/gdd:recall "term"` query that returns 5 Layer-1 hits ≈ 400 tokens. Opening all 5 full docs blind ≈ 4000 tokens. **Always ladder.** Skipping to Layer 3 is the #1 cause of context exhaustion in long pipeline runs.

## FTS5 backend (Phase 19.5)

Layer 1 becomes `scripts/lib/design-search.cjs` — same protocol, same output shape, but backed by `.design/search.db` instead of grep. Agents do not need to change anything; the backend swap is transparent.

## Phase 27.6 — Shared-Context Dedup (D-11)

When >= 3 distinct agents in the same cycle read the same `reference/*.md` file, the Phase 14.5 retrieval-contract preamble is extended with a "shared context loaded once" marker — subsequent agents see a content-hash reference instead of the full file body. This reduces redundant token consumption per cycle.

The detection lives in `scripts/lib/prompt-dedup/index.cjs::detectDuplicateReferenceReads` and runs at retrieval-contract injection time. The threshold (3 agents) matches Phase 27.6 D-11 and is tunable via the `threshold` argument to `detectDuplicateReferenceReads`.

Operator opt-out: set `GDD_DEDUP_OPT_OUT=1` in the spawning agent's environment to bypass dedup for that read.

Event emission: each dedup decision emits a `dedup.injection` event via `appendEvent` so the Phase 27.6-01 perf-analyzer can surface "the same file is read N agents times per cycle" as a `[CONTEXT-WASTE]` proposal.

Cross-references:

- `scripts/lib/prompt-dedup/index.cjs` — analyzer + injection text builder.
- `tests/prompt-dedup.test.cjs` — detection rule tests.
- `agents/perf-analyzer.md` — consumes `dedup.injection` events for cross-cycle analysis.

---

*Imported by every skill that reads `.design/` artifacts: `/gdd:progress`, `/gdd:resume`, `/gdd:reflect`, `/gdd:pause`, `/gdd:recall` (Phase 19.5+), `/gdd:timeline` (Phase 19.5+). Tier: preamble. Phase: 14.5.*
