# Phase 18 Regression Baseline

**Version:** v1.18.0  
**Locked:** 2026-04-24

This directory locks the regression baseline for Phase 18 (Advanced Craft References + Motion Vocabulary).

## New references shipped

| File | Type | Req |
|------|------|-----|
| `reference/variable-fonts-loading.md` | typography | REF-14 |
| `reference/image-optimization.md` | performance | REF-15 |
| `reference/css-grid-layout.md` | layout | REF-16 |
| `reference/motion-advanced.md` | motion | REF-17 |
| `reference/motion-easings.md` | motion | MOT-01 |
| `reference/motion-interpolate.md` | motion | MOT-02 |
| `reference/motion-transition-taxonomy.md` | motion | MOT-03 |
| `reference/output-contracts/motion-map.schema.json` | output-contract | MOT-04 |
| `reference/motion-spring.md` | motion | MOT-05 |

## Regression checks

Tests that must pass against this baseline:

1. `scripts/tests/test-motion-provenance.sh` — RN-MIT attribution present in all motion-vocabulary files; no Remotion/ citations
2. `scripts/validate-schemas.cjs` — registry.json validates against registry.schema.json
3. `scripts/validate-frontmatter.cjs agents/` — all agent frontmatter valid
4. `scripts/detect-stale-refs.cjs` — no stale cross-references in new files
