# OpenRouter — Connection Specification

This file is the connection specification for OpenRouter within the hone pipeline. OpenRouter is a **model aggregator** — one API key fronts dozens of upstream providers (Anthropic Claude, OpenAI GPT, Meta Llama, Google Gemini, DeepSeek, Qwen, Mistral, …). GDD treats it as a **tier-router**: the Phase-33.6 adapter (`scripts/lib/tier-resolver-openrouter.cjs`) maps GDD's `opus`/`sonnet`/`haiku` tiers onto a concrete OpenRouter catalog model id. It is **not** a canvas or visual-design tool — it does not read or write design surfaces. See `connections/connections.md` for the full connection index and capability matrix.

OpenRouter is **opt-in alongside** native provider auth, never OpenRouter-only (D-08). When it is not configured, tier resolution falls back to the native provider via the existing `scripts/lib/tier-resolver.cjs` fallback chain — nothing breaks.

---

## Setup

### Prerequisites

- An OpenRouter account and API key at [openrouter.ai](https://openrouter.ai).
- `OPENROUTER_API_KEY` environment variable set — this is the **only** required secret. It is sent solely as an `Authorization: Bearer` header by the catalog fetcher (Phase 33.6-01) and is **never** persisted to the cache or any log.
- **OPTIONAL** `OPENROUTER_BASE_URL` environment variable — point the catalog fetch at a custom upstream (a self-hosted proxy, or a Vertex/Bedrock/Azure-fronting gateway). Defaults to `https://openrouter.ai/api/v1`. The cache always records the canonical public `source` URL regardless of `OPENROUTER_BASE_URL`.
- **OPTIONAL** opt-in flag — set `openrouter_enabled: true` in `.design/config.json` to route tiers through OpenRouter even before a key triggers a fetch. The presence of `OPENROUTER_API_KEY` also enables the consultation path. When neither is set, the OpenRouter adapter is never consulted (default behavior unchanged — D-08).
- **OPTIONAL** tier pins — `.design/config.json#openrouter_tier_overrides` (e.g. `{ "opus": "anthropic/claude-opus-4-7" }`) force a specific catalog id for a tier; the override wins over the heuristic (D-03).

### Verification

```
node -e "console.log(process.env.OPENROUTER_API_KEY ? 'available' : 'not_configured')"
```

Key present → the catalog fetch (Phase 33.6-01) can run and the adapter resolves tiers from the dynamic catalog. Absent → `not_configured`; native auth stays primary and tier resolution falls back to the native provider.

To inspect the resolved catalog + tier mappings on demand, run `/hone:openrouter-status` (read-only — see `skills/openrouter-status/SKILL.md`).

---

## Probe Pattern

OpenRouter has no MCP surface — it is probed by environment variable, not ToolSearch.

```
Step OR1 — Env check:
  OPENROUTER_API_KEY set   → openrouter: available
  OPENROUTER_API_KEY unset → openrouter: not_configured
```

Write the result to STATE.md `<connections>`: `openrouter: <status>`.

`not_configured` is a normal, expected state — it is **not** an error. The pipeline continues with native auth.

---

## OpenRouter Capability

The capability classification for the `connections/connections.md` matrix:

| Capability | Value | Rationale |
|------------|-------|-----------|
| canvas | **no** | OpenRouter does not read or write a design canvas. |
| generator | **yes** | It fronts text/code generation models the pipeline can call. |
| model-router | **yes** | Its defining capability — it routes a GDD tier to a concrete upstream model id. |

OpenRouter is a model **provider/router**, not a design tool. Per D-12 it lives **only** in the tier-resolution layer (the adapter), not in the Phase-24 install registry (`scripts/lib/install/runtimes.cjs`) — you do not install GDD "into" OpenRouter.

---

## Pipeline Integration

| Stage | What OpenRouter provides |
|-------|--------------------------|
| (all stages, model selection) | When opted in, the tier resolver consults the OpenRouter catalog (Phase 33.6-02 adapter) to map `opus`/`sonnet`/`haiku` → a concrete catalog model id. |
| cost telemetry | Cost rows tag `provider: openrouter` when a model was resolved via the adapter (Phase 33.6-03, SC#6) — additive/back-compat with the Phase-27 `runtime_role`/`peer_id` cost-row fields. |
| drift | The authority-watcher diffs the OpenRouter catalog weekly and surfaces `deprecated`/`withdrawn` models that match a configured `openrouter_tier_overrides` pin (SC#8). |

The catalog is **dynamically fetched** with a 24h TTL cache at `.design/cache/openrouter-models.json` (gitignored runtime artifact) — there is no static catalog file. `reference/prices.openrouter.md` is a catalog-derived price snapshot (a derived view, not authority); `reference/openrouter-tier-mapping.md` documents the resolution heuristic.

---

## Fallback Behavior

OpenRouter resolution is **graceful-degrade-to-native** (D-08). The adapter returns `null` — and the caller falls back to the native provider via the existing `scripts/lib/tier-resolver.cjs` fallback chain — in every one of these cases:

- `openrouter: not_configured` (no `OPENROUTER_API_KEY`, opt-in flag off).
- The catalog cache is missing.
- The catalog is stale and cannot be re-fetched (no key, network failure, rate-limited).
- No catalog model matches the requested tier and no override pins it.

When `not_configured`:
- Print: `OpenRouter not configured — tier resolution uses the native provider.`
- The native provider (resolved from `reference/runtime-models.md`) remains primary.

OpenRouter is **never** the only path. Native auth is always the floor; OpenRouter is an opt-in overlay on top of it. The adapter `resolve(tier)` never throws — any error (unknown tier, corrupt config, corrupt cache) degrades to `null` and the native fallback takes over.
