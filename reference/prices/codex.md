# OpenAI — Codex CLI Price Table

**Runtime:** `codex` (OpenAI Codex CLI)
**Phase 26 D-08 sub-table.** Pricing for the OpenAI Codex tier referenced in `reference/runtime-models.md` under `id: "codex"`.

**Provenance:** `<TODO: confirm at https://openai.com/api/pricing/>` — retrieved 2026-04-29 (placeholder — v1.26.0 ships with seed numbers; runtime adapter authors confirm and PR before v1.27).

**Status:** placeholder values are taken from public OpenAI tier-positioning at the time of v1.26.0 ship. The cost-aggregator will surface drift if measured spend per spawn diverges from these figures by more than 20% after 10+ cycles.

## Pricing (USD per 1M tokens)

| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
|-------|------|--------------|---------------|----------------------|
| gpt-5 | opus | 1.25 | 10.00 | 0.13 |
| gpt-5-mini | sonnet | 0.25 | 2.00 | 0.03 |
| gpt-5-nano | haiku | 0.05 | 0.40 | 0.01 |

## Estimator formula

Same shape as `reference/prices/claude.md`; see that file for the formula and `size_budget` ranges. Token ranges are runtime-neutral.

## Update protocol

1. Confirm authoritative numbers at https://openai.com/api/pricing/ and update the table; remove the `<TODO>` provenance tag.
2. New model added to `reference/runtime-models.md` under `id: "codex"`: add a row here with the matching model string and tier.
