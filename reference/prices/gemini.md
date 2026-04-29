# Google — Gemini CLI Price Table

**Runtime:** `gemini` (Google Gemini CLI)
**Phase 26 D-08 sub-table.** Pricing for the Gemini 2.5 tier referenced in `reference/runtime-models.md` under `id: "gemini"`.

**Provenance:** `<TODO: confirm at https://ai.google.dev/pricing>` — retrieved 2026-04-29 (placeholder — v1.26.0 ships with seed numbers; runtime adapter authors confirm and PR before v1.27).

**Status:** placeholder values reflect public Gemini 2.5 tier positioning at v1.26.0 ship time. Cost-aggregator will surface drift if measured spend deviates from these figures by more than 20% after 10+ cycles.

## Pricing (USD per 1M tokens)

| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
|-------|------|--------------|---------------|----------------------|
| gemini-2.5-pro | opus | 1.25 | 10.00 | 0.31 |
| gemini-2.5-flash | sonnet | 0.30 | 2.50 | 0.075 |
| gemini-2.5-flash-lite | haiku | 0.10 | 0.40 | 0.025 |

## Estimator formula

Same shape as `reference/prices/claude.md`.

## Update protocol

1. Confirm authoritative numbers at https://ai.google.dev/pricing and update; remove `<TODO>` tag.
2. New model added to `reference/runtime-models.md` under `id: "gemini"`: add a row here.
