---
phase: 31
name: figma-extractor-sync
version_target: v1.31.0
depends_on: [14]
soft_coupled: [23]
status: planned
spike: 001-figma-offcontext-extractor
---

# Phase 31 — Figma Off-Context Extractor + Variables Sync Plugin — CONTEXT

## Goal

Ship `gsd-figma-extract` — a plugin command that pulls a Figma design system from REST API into a compact, queryable local digest (DESIGN.md + tokens.json + components.json) **without** raw JSON ever entering Claude context — plus a thin Figma plugin "GDD Sync" that fills the Variables-API-Enterprise gap by reading `figma.variables` from inside Figma and POSTing JSON to a localhost receiver.

End state: any user on any Figma plan can run one command, click one button in Figma, and walk away with a compact LLM-readable spec for their entire DS.

## Spike outcomes (the evidence)

Validated by **Spike 001** (commit `c3a9cf6`, `.planning/spikes/001-figma-offcontext-extractor/`):

| Metric | Result |
|---|---|
| Compression | **898×** (223 MB raw → 254 KB digest) |
| DESIGN.md size | 15.7K tokens (under 20K target) ✓ |
| Components captured | 127 sets + 40 singletons (with variants/props/defaults) ✓ |
| Wall time | ~33s for the full pull |
| Claude tokens during extraction | **0** ✓ |
| Figma MCP calls | **0** ✓ |
| Cost vs Figma MCP for same data | orders of magnitude cheaper |

Two known gaps from the spike, both addressed by this phase:

1. **Variables API → 403 (Enterprise-only)** — solved by Path C (Figma plugin posts to localhost receiver).
2. **Legacy styles → 0 tokens** — solved by Path B (two-step `/styles` + `/nodes?ids=` lookup).

## Key Decisions

- **D-01: Two-stage pipeline (extract → digest) stays separated.** Confirmed by spike. Re-run digest without re-pulling.
- **D-02: Variant rollup default-on.** Skip COMPONENT children of COMPONENT_SET; record variants as a field on the parent. Spike showed naive walk inflates by 16×.
- **D-03: Drop `geometry=paths` query param.** Saves ~30% raw size; geometry is thrown away in digest.
- **D-04: Three-path token extraction with fallback chain:**
  1. **Path A — Variables API** (`/files/:key/variables/local`): primary on Enterprise; skip 403 silently.
  2. **Path B — `/styles` + `/nodes?ids=`** two-step: fixes spike's 0-tokens bug for legacy-styles DSs.
  3. **Path C — Plugin sync**: Figma plugin posts variables to localhost receiver — works on Free tier.
  - Resolution priority on conflict: Variables > plugin sync > styles. `--prefer-styles` escape hatch.
- **D-05: Figma plugin "GDD Sync" as separate package** at `figma-plugin/`. TypeScript, ≤500 LOC. Single button "Export to GDD".
- **D-06: Receiver is ephemeral and 127.0.0.1-only.** Listens only during the active extract run. Refuses non-localhost connections. Closes on receipt or timeout.
- **D-07: Plugin distribution: dev-build now, Community submission as follow-up.** Don't block v1.31.0 on Figma's review queue.
- **D-08: `--component <name>` filter on digest** for per-component slicing (~500 tokens vs ~16K full).
- **D-09: Raw cache gitignored.** Reproducible from `pull.cjs`. `digest/` artifacts may be committed.
- **D-10: Token never logged or persisted.** `FIGMA_TOKEN` from env only; static-analysis test in CI scans for any persistence/log primitives that include the token variable.
- **D-11: Cache invalidation: content-based via Figma's `version` field**, fall back to 1h wall-clock TTL.
- **D-12: Off-context guarantee enforced statically.** Skill never instructs reading `raw/*.json`. Asserted by test.
- **D-13: Plugin emits ALL local variables**, not just published-collection ones — easier to audit. Filter at digest stage.

## Cost comparison (the why)

| | Off-context script (this phase) | Figma MCP for whole DS |
|---|---|---|
| Claude tokens consumed | 0 (extract) + ~15K (digest read) | ~50–500K+ |
| Figma MCP tool calls | 0 | 100+ |
| Wall time | ~33s | tens of minutes |
| Per-re-run cost | free | linearly expensive |

This phase is the **economic alternative to Figma MCP for whole-DS workflows**. Figma MCP remains correct for spot questions on individual components.

## Out of scope (rejected, deferred)

- Code Connect mapping / component → React codegen (separate downstream phase).
- Automatic GitHub sync of digest (webhook + auth surface too large).
- Multi-file extracts (one `file_key` per run for v1).
- Component instance counting / usage analytics.
- Pixel-perfect rendering / image export via `figma.exportAsync`.
- Real-time sync / file-watching (run-on-demand only).
- Receiver on non-localhost port or with auth (no proportional benefit).
- Custom DTCG-format export from the plugin (canonical transform happens in digest).

## Open questions for `/gsd-discuss-phase 31`

- Plugin distribution: dev-build only in v1.31.0, or block on Community publish? Default: ship dev-install path now, Community as a checkbox in 31-10 (not blocking version cut).
- Receiver port (5179): hardcoded or CLI override? Default: hardcoded.
- Three-path conflict resolution: confirm Variables > plugin sync > styles. Default: yes, with `--prefer-styles` escape.
- Plugin emits all variables or only published collections? Default: all.
- Cache invalidation strategy: content-based via `version` field with 1h TTL fallback. Default: yes.

## Files and references

- Spike artifacts: `.planning/spikes/001-figma-offcontext-extractor/`
- Spike commit: `c3a9cf6`
- Roadmap entry: `.planning/ROADMAP.md` § Phase 31
- Authority feeds: `reference/external-design-md/` (paws-and-paths sample, used as DESIGN.md format reference)
- Output format seed: `output-format/` (GDD canonical DESIGN.md format — Phase 14 deliverable)
