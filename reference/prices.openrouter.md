# OpenRouter - Catalog-Derived Price Snapshot

**Phase 33.6 (v1.33.6).** This file is a **catalog-derived snapshot** of OpenRouter per-model prices - it is **generated from** `.design/cache/openrouter-models.json` (the dynamic catalog fetched by `scripts/lib/openrouter/catalog-fetcher.cjs`), **not** a hand-maintained authority. The **live source of truth is the dynamic catalog**; this table is a derived, illustrative view that can go stale between catalog fetches.

Unlike the per-runtime tables under `reference/prices/` (Phase 26 D-08, hand-curated authority with provenance), OpenRouter's prices live in the upstream `/models` response and are refreshed on the 24h TTL. To inspect the current resolved prices, run `/hone:openrouter-status` or read the cache directly. For the tier→model resolution heuristic see `reference/openrouter-tier-mapping.md`.

OpenRouter quotes prices **per token** (USD), for `prompt` (input) and `completion` (output) separately.

## Representative sample (per token, USD)

Derived from the fixture catalog at `test/fixtures/baselines/phase-33-6/openrouter-catalog.json` (a snapshot mirror of the cache shape). Actual live prices come from the catalog at fetch time.

| model id | prompt $/tok | completion $/tok |
|----------|--------------|------------------|
| `anthropic/claude-opus-4-7` | 0.000015 | 0.000075 |
| `anthropic/claude-sonnet-4-7` | 0.000003 | 0.000015 |
| `meta-llama/llama-3.1-70b-instruct` | 0.00000052 | 0.00000075 |
| `meta-llama/llama-3.1-8b-instruct` | 0.00000002 | 0.00000005 |
| `qwen/qwen-2.5-72b-instruct` | 0.00000038 | 0.0000004 |

## Notes

- **Derived view, not authority.** Do not hand-edit prices here to "fix" cost math - fix the catalog fetch instead. This file documents the *shape* and *source* of OpenRouter pricing for the registry round-trip and for human reference.
- **Per-token vs per-1M.** The native runtime tables (`reference/prices/<runtime>.md`) quote `input_per_1m` / `output_per_1m`; OpenRouter's catalog quotes per-token. Multiply by 1,000,000 to compare (e.g. `anthropic/claude-opus-4-7` ≈ $15 input / $75 output per 1M tokens).
- **Cost telemetry.** When a model is resolved via the OpenRouter adapter, the cost row tags `provider: openrouter` (Phase 33.6-03, SC#6) - see `scripts/lib/budget-enforcer.cjs#buildCostEventPayload`.
- **Drift.** The authority-watcher diffs the catalog weekly and surfaces `deprecated`/`withdrawn` models matching a configured `openrouter_tier_overrides` pin (SC#8) - see `scripts/lib/authority-watcher/index.cjs#diffOpenRouterCatalog`.
