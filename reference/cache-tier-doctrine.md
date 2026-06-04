# Cache-Tier Doctrine

The Anthropic prompt cache has a 5-minute TTL and is invalidated by a single byte change in the prefix. Every agent body imports `reference/shared-preamble.md` as the first thing it reads; that import expands to a flat byte block at the top of every agent's prompt. Stable bytes there mean stable cache; churning bytes there mean every agent's cache misses on every spawn.

This doctrine pins the bytes that have to stay stable.

## The four tiers

| Tier | Lifetime | Files | Edit cost |
|------|----------|-------|-----------|
| **L0** | Framework-invariant | `reference/meta-rules.md` + `reference/shared-preamble.md` | Invalidates cache for every agent simultaneously. CI gate enforces SHA-256 stability; ratchet via `--rebaseline` only when the framework genuinely changes. |
| **L1** | Per-agent stable | Agent body itself (role, tools contract, output format) | Invalidates cache for the one agent. Edits are routine. |
| **L2** | Per-spawn dynamic | `<required_reading>` block + per-invocation prompt | Never caches. Edits are free. |
| **L3** | Reference-only | `reference/*.md` other than L0 | Loaded per-agent on demand; not part of the cache prefix. Edits do not affect cache. |

## The L0 contract

1. **Two files, no more.** L0 = `reference/meta-rules.md` (framework-invariant rules: required reading, writes protocol, deviation handling, completion markers, context-exhaustion + budget) + `reference/shared-preamble.md` (the aggregator that imports meta-rules and contributes the design-family pillar lists). Any third L0 file requires a doctrine update.
2. **Byte-stable across cycles.** Section heading text, prose order, ordering of bulleted lists, even whitespace runs; all are essential. An edit that "just rewords a sentence" still invalidates cache for every agent for one session per agent.
3. **CI gate enforces stability.** `scripts/check-cache-tiers.cjs` computes SHA-256 of each L0 file and compares to `test/fixtures/baselines/l0-hashes.json`. Drift fails the build. A real edit requires `--rebaseline` and a baseline-hash commit alongside the L0 edit.
4. **Pre-warming exists for legitimate L0 edits.** Run `/gdd:warm-cache` after an L0 edit lands to pre-load the new prefix so the next real spawn is a hit rather than a miss.

## What goes where

- A new design-pillar list shared by 5 design-family skills → `shared-preamble.md` (L0). Costs cache miss; ratchet the L0 baseline.
- A new validator rule for a single agent → that agent body (L1). No L0 impact.
- A per-invocation context block; the brief, the must-haves, the user's specific request → `<required_reading>` (L2). No cache implications either way.
- A reference catalog of heuristics, anti-patterns, WCAG thresholds → `reference/*.md` (L3). No cache implications.

## Verification

- `npm run validate:registry-tiers` - confirms `registry.json` entries' `tier` field is one of L0/L1/L2/L3.
- `npm run validate:cache-tiers` - confirms L0 file SHA-256 matches the baseline.
- Both run in CI as part of the default test suite.

## When to ratchet

Ratchet (`--rebaseline`) only when:

1. Framework invariant changes (rare).
2. A design-pillar list shared by ≥3 skills needs updating.
3. A factual claim that EVERY agent must know becomes false.

If any of those three is true: edit the L0 file, run `node scripts/check-cache-tiers.cjs --rebaseline`, commit both the L0 edit and the updated baseline. Reviewers see the L0-hash diff and understand the cache cost.

If none of the three is true: the edit belongs in L1 (an agent body), L2 (a per-spawn block), or L3 (a reference doc). Reject the L0 edit; relocate.
