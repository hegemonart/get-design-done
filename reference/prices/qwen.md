# Alibaba — Qwen CLI Price Table

**Runtime:** `qwen` (Alibaba Qwen CLI)
**Phase 26 D-08 sub-table.** Pricing for the Qwen 3 tier referenced in `reference/runtime-models.md` under `id: "qwen"`.

**Provenance:** `<TODO: confirm at https://www.alibabacloud.com/help/en/model-studio/billing-for-models>` — retrieved 2026-04-29 (placeholder — v1.26.0 ships with seed numbers; runtime adapter authors confirm and PR before v1.27).

**Status:** placeholder values reflect public Model Studio tier positioning at v1.26.0 ship time. Cost-aggregator will surface drift if measured spend deviates from these figures by more than 20% after 10+ cycles.

## Pricing (USD per 1M tokens)

| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
|-------|------|--------------|---------------|----------------------|
| qwen3-max | opus | 2.40 | 9.60 | 0.24 |
| qwen3-plus | sonnet | 0.40 | 1.20 | 0.04 |
| qwen3-flash | haiku | 0.05 | 0.40 | 0.005 |

## Estimator formula

Same shape as `reference/prices/claude.md`.

## Update protocol

1. Confirm authoritative numbers at https://www.alibabacloud.com/help/en/model-studio/billing-for-models and update; remove `<TODO>` tag.
2. New model added to `reference/runtime-models.md` under `id: "qwen"`: add a row here.
