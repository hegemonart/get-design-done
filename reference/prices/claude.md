# Anthropic — Claude Code Price Table

**Runtime:** `claude` (Claude Code)
**Phase 26 D-08 sub-table.** Authoritative pricing for the Anthropic models referenced in `reference/runtime-models.md` under `id: "claude"`. Read by `scripts/lib/budget-enforcer.cjs` (and indirectly by `hooks/budget-enforcer.ts`) to compute `est_cost_usd` per spawn.

**Provenance:** https://docs.anthropic.com/en/docs/about-claude/pricing — retrieved 2026-04-29, cycle `2026-04-29-v1.26`.

## Pricing (USD per 1M tokens)

| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
|-------|------|--------------|---------------|----------------------|
| claude-haiku-4-5 | haiku | 1.00 | 5.00 | 0.10 |
| claude-sonnet-4-7 | sonnet | 3.00 | 15.00 | 0.30 |
| claude-sonnet-4-6 | sonnet | 3.00 | 15.00 | 0.30 |
| claude-opus-4-7 | opus | 15.00 | 75.00 | 1.50 |

## size_budget → conservative token ranges

Agent frontmatter carries `size_budget: S|M|L|XL`. The router uses these conservative token ranges to compute a pre-spawn `est_cost_usd` without a live model call:

| size_budget | input_tokens (conservative max) | output_tokens (conservative max) |
|-------------|----------------------------------|-----------------------------------|
| S | 4000 | 1000 |
| M | 10000 | 2500 |
| L | 25000 | 6000 |
| XL | 60000 | 15000 |

## Estimator formula

```
est_cost_usd =
  (input_tokens / 1_000_000) * input_per_1m
  + (output_tokens / 1_000_000) * output_per_1m
```

When `cache_hit: true`, the formula re-runs with `cached_input_per_1m` in place of `input_per_1m` for the input portion.

## Update protocol

1. Pricing change: update the table above; commit as `chore(reference/prices): update Anthropic pricing YYYY-MM-DD`.
2. New model name added to `reference/runtime-models.md` under `id: "claude"`: add a row here with the same model string in the `Model` column. Tier comes from the canonical `tier_to_model` mapping.
3. size_budget revision: requires a Phase 11 reflector proposal under `[FRONTMATTER]` scope; do not hand-edit agent ranges.
