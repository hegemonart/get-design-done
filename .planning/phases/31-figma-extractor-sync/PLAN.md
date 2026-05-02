---
phase: 31
name: figma-extractor-sync
version_target: v1.31.0
depends_on: [14]
soft_coupled: [23]
status: planned
---

# Phase 31 — Figma Off-Context Extractor + Variables Sync Plugin — PLAN

See `CONTEXT.md` for goal, decisions D-01 through D-13, spike outcomes, and out-of-scope notes.

## Wave A — Productionize spike (parallel, disjoint files)

| Plan | Surface | Touches |
|------|---------|---------|
| 31-01 | `pull.cjs` — productionized `extract.mjs`: drops `geometry=paths`, structured logging, retry+backoff, per-endpoint timing, accepts file URL or key, content-version cache invalidation | `scripts/lib/figma-extract/pull.cjs` (new), `scripts/lib/figma-extract/parse-url.cjs` (new), `tests/figma-extract-pull.test.cjs` (new), `test-fixture/figma/files-response.json` (new — sanitized) |
| 31-02 | `digest.cjs` — productionized `digest.mjs`: variant rollup default-on, three-path token assembly skeleton, stable DESIGN.md section ordering | `scripts/lib/figma-extract/digest.cjs` (new), `scripts/lib/figma-extract/walk.cjs` (new — node-tree walker w/ rollup), `scripts/lib/figma-extract/render-md.cjs` (new), `tests/figma-extract-digest.test.cjs` (new) |
| 31-03 | Two-step `/styles` + `/nodes?ids=` lookup (fixes spike's 0-tokens bug) | `scripts/lib/figma-extract/styles-resolver.cjs` (new), `tests/figma-extract-styles.test.cjs` (new), `test-fixture/figma/styles-response.json` (new), `test-fixture/figma/nodes-response.json` (new) |

## Wave B — Figma plugin + receiver (parallel after A)

| Plan | Surface | Touches |
|------|---------|---------|
| 31-04 | `figma-plugin/` scaffolding: `manifest.json` (network access scoped to `localhost`), `code.ts` sandbox, `ui.html`, build via `@figma/plugin-typings` | `figma-plugin/manifest.json` (new), `figma-plugin/code.ts` (new), `figma-plugin/ui.html` (new), `figma-plugin/package.json` (new), `figma-plugin/tsconfig.json` (new), `figma-plugin/README.md` (new), `tests/figma-plugin-manifest.test.cjs` (new) |
| 31-05 | Plugin variables export: reads `figma.variables.getLocalVariableCollections()` + `getLocalVariables()`, resolves aliases, includes mode metadata, POSTs to `localhost:5179/variables` | `figma-plugin/src/export-variables.ts` (new), `figma-plugin/src/payload-schema.ts` (new — shared with receiver), `tests/figma-plugin-export.test.cjs` (new — runs against figma-typings mocks) |
| 31-06 | `receiver.cjs` — ephemeral 127.0.0.1:5179 server: payload schema validation, writes `raw/variables.json`, exits on receipt or timeout | `scripts/lib/figma-extract/receiver.cjs` (new), `scripts/lib/figma-extract/payload-schema.json` (new), `tests/figma-extract-receiver.test.cjs` (new — covers lifecycle + non-localhost refusal + schema rejection) |

## Wave C — UX + integration (parallel after B)

| Plan | Surface | Touches |
|------|---------|---------|
| 31-07 | `skills/figma-extract/SKILL.md` (Phase 28.5-compliant, ≤100 lines): orchestrates pull → optional plugin-sync wait → digest. Static test asserts SKILL never reads `raw/*.json`. | `skills/figma-extract/SKILL.md` (new), `commands/figma-extract.md` (new — thin alias), `tests/figma-extract-skill-isolation.test.cjs` (new — static analysis on raw/ reads) |
| 31-08 | `--component <name>` filter on digest: per-component slice (~500 tokens), supports glob | `scripts/lib/figma-extract/digest.cjs` (extend), `tests/figma-extract-component-filter.test.cjs` (new) |
| 31-09 | `gsd-health` extension: `figma extract: ready (token set)` / `figma extract: token missing` / `figma extract: plugin sync needed for variables (Free tier detected)` | `scripts/lib/health.cjs` or wherever Phase 13 health lives (extend), `tests/figma-extract-health.test.cjs` (new — covers three states) |

## Wave D — Closeout

| Plan | Surface | Touches |
|------|---------|---------|
| 31-10 | Tests + golden fixture + manifests + CHANGELOG + NOTICE + baseline + **roadmap closeout (rule #14)** | `test-fixture/baselines/phase-31/{design-md,components-json,tokens-json,health-line,manifest-network-scope,token-isolation-static}.txt` (new), `tests/phase-31-baseline.test.cjs` (new), `tests/phase-31-end-to-end.test.cjs` (new — drives pull + digest against offline fixtures), `tests/figma-extract-token-isolation.test.cjs` (new — static analysis: no `writeFile.*FIGMA_TOKEN`, no `console.log.*FIGMA_TOKEN` in `scripts/lib/figma-extract/`), `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` (keywords: `figma`, `extractor`, `design-system-sync`), `CHANGELOG.md` (v1.31.0 entry), `README.md` (new "Figma off-context extraction" section), `NOTICE` (extend if any third-party patterns adopted), **`.planning/ROADMAP.md` § Phase 31** (flip checkboxes 31-01..31-10 + status table cells + version-sequence prose) |

## Acceptance Criteria

- [ ] `gsd-figma-extract <file_key>` runs end-to-end on the spike's test DS (Free tier) and produces non-empty digest including `## Tokens` section.
- [ ] Off-context guarantee: skill never reads `raw/*.json`; static test enforces.
- [ ] Two-stage pipeline: re-running `digest.cjs` against existing `raw/` produces identical output without re-pulling.
- [ ] Variant rollup default-on: digest on spike fixture produces 167 entries, not 2,593.
- [ ] Path A (Variables API): on Enterprise fixture, populates token section from `/variables/local`.
- [ ] Path B (`/styles` + `/nodes`): on legacy-styles fixture, produces non-empty `tokens.json` (fixes spike bug).
- [ ] Path C (plugin sync): plugin POSTs valid payload to receiver; receiver writes `raw/variables.json`; digest consumes it. End-to-end test using fixture plugin payload.
- [ ] Conflict resolution: Variables > plugin sync > styles. `--prefer-styles` escape works. Tested.
- [ ] Plugin manifest declares only `localhost` in `networkAccess.allowedDomains`. Asserted by test.
- [ ] Receiver: refuses non-localhost connections (test mocks remote IP); validates payload schema (rejects malformed); closes on receipt and on timeout.
- [ ] Receiver port hardcoded to 5179; not exposed via env or CLI flag.
- [ ] `geometry=paths` is NOT in the request URL. Asserted by test on intercepted fetch.
- [ ] `--component <name>` filter produces per-component slice ≤ 1K tokens for typical component; supports glob.
- [ ] `gsd-health` shows three figma-extract states correctly across token-set/missing/plugin-needed scenarios.
- [ ] Token isolation: static-analysis test passes — no persistence or logging of `FIGMA_TOKEN` in `scripts/lib/figma-extract/`.
- [ ] Compression + size targets: digest ≤ 25 KB and DESIGN.md ≤ 20K tokens for the spike's 167-component fixture. Snapshot test against committed golden DESIGN.md.
- [ ] Cache invalidation: re-pull skipped when `version` field unchanged; falls back to 1h TTL when `version` not present.
- [ ] All 10 sub-plan checkboxes flipped + Phase 31 status table cell green + version-sequence prose in roadmap mentions v1.31.0.
- [ ] CHANGELOG.md v1.31.0 entry includes the spike → phase trail (mention `c3a9cf6`).

## Dependencies between sub-plans

```
31-01 ──┐
31-02 ──┼── all parallel (Wave A; disjoint files)
31-03 ──┘
   │
   ▼
31-04 ──┐
31-05 ──┼── 31-04, 31-06 disjoint; 31-05 depends on 31-04 (plugin shell) and 31-06 (receiver schema is shared)
31-06 ──┘
   │
   ▼
31-07 ──┐
31-08 ──┼── parallel (Wave C; 31-08 extends digest from 31-02; 31-07/31-09 disjoint)
31-09 ──┘
   │
   ▼
31-10 ── closeout (sequential — locks all baselines)
```

## Risk register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Figma plugin manifest schema changes | Low | Pin to known stable manifest version; CI test on schema |
| Figma REST rate limits during pull | Low (Figma is generous on read) | Retry+backoff in `pull.cjs`; cache invalidation reduces re-pulls |
| Localhost port 5179 conflict | Low | Hardcoded; if conflict reported in the wild, change in patch release. Out of scope to add CLI override (D-07). |
| Plugin Community publish blocked by review | Medium | D-07 — ship dev-install path first; Community as follow-up |
| Test-DS-shaped fixtures expose private design content | Medium | Sanitize all fixtures before commit; replace real names with `Sample/*`; CI test asserts no real org names |
| Figma plugin sandbox can't read all variables on huge DSs (memory) | Low | Plugin streams collection-by-collection if `getLocalVariables()` count > 5000 |
| Digest format drift breaks downstream consumers | Medium | Snapshot test on golden DESIGN.md; bump only on intentional format change with CHANGELOG note |

## What we're explicitly NOT building

- Code Connect mapping / component → React codegen.
- Automatic GitHub sync of the digest.
- Multi-file extracts.
- Component instance counting / usage analytics.
- Pixel-perfect image export.
- Real-time / file-watching sync.
- Receiver on a non-localhost port or with auth.
- Custom DTCG export from the plugin (canonical transform stays in digest).

(See CONTEXT.md "Out of scope" for full rationale.)
