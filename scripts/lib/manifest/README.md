# `scripts/lib/manifest/` — Cross-Phase Source-of-Truth Root

Phase 41.5. This directory is the **single source-of-truth root** for roadmap-wide cross-phase
metadata. Before it existed, Phase 42 / 44 / 45 / 47 each scoped its own "single source" in a different
corner (`scripts/lib/build/`, `scripts/lib/prose/`, `reference/harness-matrix.json`,
`scripts/skill-metadata.json`) — four formats, four schemas, four CI drift gates. This is the one root,
one schema directory, one validator.

## Files

| File | Owner / writer | Read by |
|---|---|---|
| `harnesses.json` (+ `harnesses.cjs` view) | Phase 41.5 seed → **42** (build config) + **45** (capability matrix) extend it | the build pipeline, the harness matrix, the multi-harness compiler |
| `skills.json` | Phase 41.5 seed (live `skills/` names) → **47** enriches (aliases, pin, description budget) | skill-UX tooling |
| `prose-denylist.json` | Phase 41.5 seed → **43** + **44** | `scripts/lint-prose.cjs` (the editorial gate) |
| `schemas/*.schema.json` | one JSON Schema per manifest file | `scripts/validate-manifest.cjs` |
| `loader.cjs` | Phase 41.5 | every consumer |
| `index.cjs` | Phase 41.5 | every consumer (`readHarnesses` / `readSkills` / `readProseDenylist`) |

## Contract

- **One canonical record, multiple views.** `harnesses.json` is the canonical harness record; Phase 42's
  build config and Phase 45's capability matrix are *views* of it, not separate files. Consumers extend
  the records with new fields (every schema sets `additionalProperties: true`) — they do not fork the file.
- **Read through `index.cjs`.** Never `require` a manifest JSON directly. `readHarnesses()` /
  `readSkills()` / `readProseDenylist()` return a well-shaped object even when the file is absent.
- **Graceful out-of-order shipping.** `loader.cjs` returns an empty manifest + a one-line warning when a
  file is missing or unparseable — a phase that ships before its data exists never crashes. (D-03)
- **mtime cache.** A manifest is re-read only when its file mtime changes. (D-02)
- **One CI gate.** `scripts/validate-manifest.cjs` (`npm run validate:manifest`) ajv-validates every
  manifest against its schema. This is the only drift gate — 43/44/45/47 do NOT add their own.

## Migration note (for Phase 42 / 43 / 44 / 45 / 47 plan-phases)

When you plan your phase, **target this root from day one**. Do not create
`scripts/lib/build/harness-configs.cjs`, `scripts/lib/prose/denylist.json`,
`reference/harness-matrix.json`, or `scripts/skill-metadata.json` as new SoTs — extend
`manifest/harnesses.json` / `manifest/prose-denylist.json` / `manifest/skills.json` instead, read them
via `index.cjs`, and let `validate-manifest.cjs` be your drift gate. (Phase 46's SoT-consolidation
paragraph delegates here.)

## Boundaries

This root holds **structured cross-phase data** (JSON + typed readers). It does not unify with the
`reference/*.md` prose registries (a different consumer pattern), and it does not auto-generate
frontmatter (Phase 46 territory).
