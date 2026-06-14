---
name: hone-openrouter-status
description: "Read-only OpenRouter catalog + tier-mapping diagnostic - surfaces catalog freshness (fetched_at vs the 24h TTL), the last-fetch timestamp, the resolved opus/sonnet/haiku → model mappings (via the Phase-33.6 adapter), and a per-tier preview. Use when investigating which OpenRouter model a tier resolves to, or whether the catalog cache is fresh/stale. Phase 33.6 (v1.33.6) diagnostic - {{command_prefix}}openrouter-status."
argument-hint: "[--refresh]"
tools: Read, Bash
disable-model-invocation: true
---

# gdd-openrouter-status

## Role

You are a deterministic, read-only diagnostic skill. You do **not** spawn agents and you do **not** modify the catalog cache. You read `.design/cache/openrouter-models.json` (the Phase-33.6-01 catalog cache) via `scripts/lib/openrouter/catalog-fetcher.cjs#readCatalog`, resolve the `opus`/`sonnet`/`haiku` tiers via `scripts/lib/tier-resolver-openrouter.cjs#resolve`, and emit a single Markdown status block. Read-only - to refresh the catalog you pass `--refresh` (a single opt-in fetch gated on `OPENROUTER_API_KEY`); there is no other mutation. See `connections/openrouter.md` for setup and `reference/openrouter-tier-mapping.md` for the resolution heuristic.

This is `disable-model-invocation: true` (mirroring `skills/cache-manager/SKILL.md`): the skill is user-invoked only - the model must not auto-spawn it. It never makes a model call.

## Invocation Contract

- **Input**: optional `--refresh`. When absent, the skill is purely read-only (cache + resolve). When `--refresh` is set AND `OPENROUTER_API_KEY` is present, it calls the Phase-33.6-01 fetcher once to refresh the cache before reading; when `--refresh` is set but no key is present, it prints the empty-state/no-key message and does NOT fetch.
- **Output**: a Markdown OpenRouter-status block to stdout. The block is the entire output.

## Procedure

### 1. (Optional) refresh

If `--refresh` is set and `OPENROUTER_API_KEY` is present, run a single fetch to refresh the cache:

```bash
node -e "require('./scripts/lib/openrouter/catalog-fetcher.cjs').fetchCatalog().then(()=>{}).catch(()=>{})"
```

This is the ONLY mutation the skill performs, and only on explicit `--refresh`. The fetch never throws (D-08); a failure degrades to the existing cache.

### 2. Read the catalog cache

Read `.design/cache/openrouter-models.json` via `readCatalog`. Missing or empty → emit the empty-state message and stop:

```
## OpenRouter Status

No OpenRouter catalog yet — set OPENROUTER_API_KEY and run a cycle, or `{{command_prefix}}openrouter-status --refresh`.

Tier resolution is currently falling back to the native provider (graceful degrade — D-08).
```

### 3. Compute freshness

Read `fetched_at` from the cache object and compare against the 24h TTL (D-02): `age = now - fetched_at`. `age < 24h` → **fresh**; otherwise → **stale** (a stale catalog still resolves - the adapter uses the last good cache).

### 4. Resolve the tiers

For each of `opus`, `sonnet`, `haiku`, resolve via the adapter (it reads `.design/config.json#openrouter_tier_overrides` and applies the heuristic over the cached catalog):

```bash
node -e "const r=require('./scripts/lib/tier-resolver-openrouter.cjs');for(const t of ['opus','sonnet','haiku'])console.log(t, '->', r.resolve(t) || '(null → native fallback)')"
```

A `null` for a tier means OpenRouter has no pick → the native provider resolves that tier (D-08). Note any tier that resolved from an explicit `openrouter_tier_overrides` pin vs the heuristic.

### 5. Print the status block

```
## OpenRouter Status

Catalog source: <source URL from cache>
Last fetched:   <fetched_at>  (<fresh | stale> — TTL 24h)
Models in catalog: <count>

| Tier   | Resolved model id                | Source             |
|--------|----------------------------------|--------------------|
| opus   | <id or (null → native fallback)> | <override | heuristic> |
| sonnet | <id or (null → native fallback)> | <override | heuristic> |
| haiku  | <id or (null → native fallback)> | <override | heuristic> |

> Resolution: override (`.design/config.json#openrouter_tier_overrides`) wins, else the closed-vs-open + pricing heuristic over the catalog.
> A null resolution means tier resolution falls back to the native provider (D-08).
> Read-only — this skill never modifies the cache; use `--refresh` to re-fetch (needs OPENROUTER_API_KEY).
```

## Completion marker

End the output with:

```
## OPENROUTER-STATUS COMPLETE
```
