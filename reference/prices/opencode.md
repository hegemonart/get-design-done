# OpenCode — Price Table (stub)

**Runtime:** `opencode` (OpenCode)
**Phase 26 D-08 sub-table — STUB.** Placeholder so the price-table router (`reference/model-prices.md`) has a complete link list for all 14 runtimes. Runtime adapter authors fill this in with provenance citations in a later cycle.

**Provenance:** `<TODO: confirm at https://opencode.ai/docs>` — pending.

**Note:** OpenCode is a BYO-API-key runtime — actual pricing is determined by whichever provider key the user supplies. The `tier_to_model` row in `reference/runtime-models.md` chooses a default model per tier; this table prices that default. Users of other providers should override locally.

## Pricing (USD per 1M tokens)

| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
|-------|------|--------------|---------------|----------------------|
| _TBD_ | opus | <TODO> | <TODO> | <TODO> |
| _TBD_ | sonnet | <TODO> | <TODO> | <TODO> |
| _TBD_ | haiku | <TODO> | <TODO> | <TODO> |

The budget-enforcer treats unparseable rows as missing and falls back to `reference/prices/claude.md` per the D-08 fallback chain.

## Update protocol

1. Confirm authoritative numbers at the runtime author's pricing docs and update; remove `<TODO>` tags.
2. Add provenance citation matching the `reference/runtime-models.md` row for `id: "opencode"`.
