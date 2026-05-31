# OpenRouter Tier-Mapping Heuristic

How `scripts/lib/tier-resolver-openrouter.cjs` maps GDD's tier vocabulary onto a
dynamic OpenRouter catalog model id. This document is the human-readable companion
to that adapter; the adapter's `resolve(tier, opts)` is the canonical, executable
source of the mapping. Phase 33.6, decision D-03 (heuristic + override), D-04
(tier vocabulary), D-08 (graceful-null → native fallback).

## What it maps

The plugin speaks one tier vocabulary everywhere a model tier is named in
frontmatter or config: `opus`, `sonnet`, `haiku` — the same `VALID_TIERS` the
Phase-26 `tier-resolver.cjs` enforces. OpenRouter, by contrast, exposes a flat
catalog of provider-prefixed model ids (`anthropic/claude-opus-4-7`,
`meta-llama/llama-3.1-8b-instruct`, `qwen/qwen-2.5-72b-instruct`, …). The adapter
bridges the two by assigning each GDD tier to one internal capability bucket and
then picking the catalog id that best fits that bucket.

The ROADMAP's SC#4 names the buckets `high` / `medium` / `low`; those are the
heuristic's INTERNAL labels. They map one-to-one to the public tiers (D-04):

- `opus`   ← HIGH   bucket
- `sonnet` ← MEDIUM bucket
- `haiku`  ← LOW    bucket

The adapter's public `resolve(tier)` always speaks `opus` / `sonnet` / `haiku`;
`high` / `medium` / `low` never leak across the API boundary.

## The buckets

- **opus (HIGH) = top-tier closed.** The most capable closed-vendor model in the
  catalog — the priciest premium id from a closed namespace. This is the
  "spare-no-expense, hardest reasoning" slot.
- **sonnet (MEDIUM) = mid / top-open.** A capable model that sits below the opus
  pick — typically the mid-priced closed model, or the strongest open model when
  no second closed tier is present. The everyday workhorse slot.
- **haiku (LOW) = cheap open.** The cheapest capable OPEN model — the
  fast/inexpensive slot for high-volume, low-stakes calls.

## The signals

The heuristic is computed from fields already present on each catalog model, so it
stays deterministic for a fixed catalog (no clock, no randomness — important so the
33.6-04 golden baseline is stable):

- **Namespace (closed vs open).** The id prefix before the `/` names the vendor.
  `anthropic`, `openai`, `google` are treated as CLOSED (premium, frontier).
  `meta-llama`, `qwen`, `mistralai`, `deepseek` are treated as OPEN (commodity,
  cheap). The closed/open split is the primary axis: opus and sonnet prefer closed,
  haiku requires open.
- **Pricing.** Each model carries `pricing.prompt` / `pricing.completion` as string
  decimals (USD per token). Parsed to Number, the completion price is the tie-break:
  highest completion price wins the opus slot; lowest completion price wins the
  haiku slot. Models with unparseable or missing pricing sort last.
- **Context length.** `context_length` is a secondary capability signal used only to
  break a pricing tie (longer context is treated as more capable).

For the canonical fixture catalog (closed `anthropic/claude-opus-4-7` +
`anthropic/claude-sonnet-4-7`, open `meta-llama/llama-3.1-70b-instruct`,
`meta-llama/llama-3.1-8b-instruct`, `qwen/qwen-2.5-72b-instruct`) the heuristic
resolves opus → `anthropic/claude-opus-4-7` (top closed, highest completion price),
sonnet → `anthropic/claude-sonnet-4-7` (mid closed), and haiku →
`meta-llama/llama-3.1-8b-instruct` (cheapest open).

## The override escape hatch

The heuristic is a sensible default, not a straitjacket. A user can pin any tier to
an exact catalog id via `.design/config.json`:

```
{
  "openrouter_tier_overrides": {
    "opus": "anthropic/claude-opus-4-7",
    "haiku": "meta-llama/llama-3.1-8b-instruct"
  }
}
```

An override **wins** over the heuristic: when `openrouter_tier_overrides[tier]` is a
non-empty string, the adapter returns it verbatim — even if that id is not present
in the live catalog (the user's explicit choice is honored over catalog membership).
Tests inject the same map via `opts.overrides` instead of reading the live config
file, so the override path is exercised hermetically. The config read is best-effort:
a missing file, a missing key, or corrupt JSON degrades to an empty override map
rather than throwing.

## The graceful-null contract

OpenRouter is opt-in ALONGSIDE native provider auth — never OpenRouter-only (D-08).
When no catalog is available (no cache, an empty `models[]`, or a `readCatalog` that
returns null) AND no override applies to the requested tier, `resolve` returns
`null`. A `null` is not an error: it is the signal that the caller (the router /
budget-enforcer, wired in 33.6-03) should fall back to the native provider via the
existing `scripts/lib/tier-resolver.cjs` fallback chain. The adapter NEVER throws —
an unknown tier, a missing config, a corrupt cache, or garbage options all degrade to
`null` (or to an override when one applies). This keeps OpenRouter a strictly
additive capability: turning it off, or having it fail to fetch, can never break a
resolution that would have succeeded natively.
