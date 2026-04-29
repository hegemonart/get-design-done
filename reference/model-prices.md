# Model Prices — Router

**Phase 26 D-08 router.** This file used to carry a single Anthropic-only price table. As of v1.26.0 it links to per-runtime sub-tables — one file per runtime under `reference/prices/`. Budget-enforcer + cost-aggregator load the sub-table for the active runtime (resolved via `scripts/lib/runtime-detect.cjs`) and tag every `events.jsonl` cost row with the runtime ID.

For the model→tier mapping (which model name corresponds to opus/sonnet/haiku per runtime), see `reference/runtime-models.md`.

## Per-runtime sub-tables

| Runtime | Path | Status |
|---------|------|--------|
| Claude Code | [`reference/prices/claude.md`](./prices/claude.md) | canonical (v1.26.0) |
| OpenAI Codex CLI | [`reference/prices/codex.md`](./prices/codex.md) | seed (v1.26.0; provenance `<TODO>`) |
| Google Gemini CLI | [`reference/prices/gemini.md`](./prices/gemini.md) | seed (v1.26.0; provenance `<TODO>`) |
| Alibaba Qwen CLI | [`reference/prices/qwen.md`](./prices/qwen.md) | seed (v1.26.0; provenance `<TODO>`) |
| Kilo Code | [`reference/prices/kilo.md`](./prices/kilo.md) | stub |
| GitHub Copilot CLI | [`reference/prices/copilot.md`](./prices/copilot.md) | stub |
| Cursor | [`reference/prices/cursor.md`](./prices/cursor.md) | stub |
| Windsurf | [`reference/prices/windsurf.md`](./prices/windsurf.md) | stub |
| Antigravity | [`reference/prices/antigravity.md`](./prices/antigravity.md) | stub |
| Augment Code | [`reference/prices/augment.md`](./prices/augment.md) | stub |
| Trae | [`reference/prices/trae.md`](./prices/trae.md) | stub |
| CodeBuddy | [`reference/prices/codebuddy.md`](./prices/codebuddy.md) | stub |
| Cline | [`reference/prices/cline.md`](./prices/cline.md) | stub |
| OpenCode | [`reference/prices/opencode.md`](./prices/opencode.md) | stub |

**Sub-table format:** every file under `reference/prices/` carries the same canonical header row:

```
| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
```

Extra columns may be appended at the right edge by runtime adapter authors without breaking the parser (forward-compatible).

## Estimator formula

```
est_cost_usd =
  (input_tokens / 1_000_000) * input_per_1m
  + (output_tokens / 1_000_000) * output_per_1m
```

When `cache_hit: true`, the formula re-runs with `cached_input_per_1m` in place of `input_per_1m` for the input portion. See `skills/router/SKILL.md` (D-08) for the cache-hit semantics.

## Fallback chain (D-08)

When a cost lookup misses (model not present in the runtime's sub-table, or runtime sub-table is a stub), `scripts/lib/budget-enforcer.cjs` falls back to `reference/prices/claude.md` and emits a `cost_lookup_fallback` event. This keeps the pipeline running on stub runtimes while authority-watcher (Phase 13.2) flags drift for follow-up.

If `claude.md` ALSO misses the model, the spawn proceeds with `cost_usd: null` and a `cost_lookup_failed` event — the existing fail-open contract from Phase 20-13.

## Transitional fallback (v1.25 and earlier)

For v1.25.x and earlier the single Anthropic price table lived inline in this file. That table is preserved at `reference/prices/claude.md` byte-for-byte (as of the v1.26.0 split, modulo the surrounding prose). Hooks/skills that pinned to specific row strings should rebase those references to the new path.

## Update protocol

1. Pricing change for a single runtime: edit only that runtime's file in `reference/prices/`. Commit as `chore(reference/prices/<runtime>): update <runtime> pricing YYYY-MM-DD`.
2. New runtime added to the 14-runtime map (`scripts/lib/install/runtimes.cjs` + `reference/runtime-models.md`): create `reference/prices/<runtime>.md`, add a row to the table above, and add a `reference/registry.json` entry under `type: "data"`.
3. size_budget revisions: requires a Phase 11 reflector proposal under `[FRONTMATTER]` scope. Token ranges are runtime-neutral and live in `reference/prices/claude.md` as the canonical reference.
