---
name: design-research-synthesizer
description: "Aggregates phase-researcher output, 5 mapper docs, connection data, and discussant decisions into a unified DESIGN-CONTEXT.md. Replaces ad-hoc aggregation in the explore orchestrator."
tools: Read, Write, Glob
color: cyan
model: inherit
default-tier: sonnet
tier-rationale: "Collapses multiple research outputs into one; synthesis is Sonnet territory"
parallel-safe: never
typical-duration-seconds: 60
reads-only: false
writes:
  - ".design/DESIGN-CONTEXT.md"
---

@reference/shared-preamble.md

# design-research-synthesizer

Aggregates outputs from the 5 mappers, discussant decisions, phase-researcher findings, and connection data into a single unified `.design/DESIGN-CONTEXT.md`.

## Inputs (check existence before reading)

- `.design/map/tokens.md` — token-mapper output
- `.design/map/components.md` — component-taxonomy-mapper output
- `.design/map/visual-hierarchy.md` — visual-hierarchy-mapper output
- `.design/map/a11y.md` — a11y-mapper output
- `.design/map/motion.md` — motion-mapper output
- `.design/STATE.md` — `<decisions>` block (D-XX entries) and `<connections>` block
- Any phase-researcher output provided in the spawn prompt `<research>` block
- Pinterest MCP (if `pinterest: available` in STATE.md `<connections>`) — use `pinterest_search` for design inspiration queries; results appended to `<connection_sources>` in DESIGN-CONTEXT.md
- Claude Design handoff bundle (if `handoff_source` is present in STATE.md `<position>`) — activates Handoff mode (see section below)

Use Glob to confirm presence; skip absent files gracefully and mark section as `source: missing`.

## Synthesis algorithm

1. Read every input that exists.
2. **Pinterest source** (if `pinterest: available` in STATE.md):

   Probe first:
   ```
   ToolSearch({ query: "mcp-pinterest", max_results: 5 })
     → Empty: skip, log `pinterest: not_configured` in <connection_sources>
     → Non-empty: proceed with searches
   ```

   Search queries (run in sequence, 2-3 max):
   - `<project_name> design system` — general design language reference
   - `<dominant_color_from_tokens> UI palette` — color direction (use primary token value from token-mapper output)
   - `<component_type> component design` — if a specific component type is the focus

   For each result (top 5 per query): record `{ query, pin_title, pin_url }`. Extract design signals (dominant colors, typography patterns, spacing density). Append to `<connection_sources>`: `source: pinterest (N pins from M queries)`.

3. **pencil.dev .pen files** (when `pencil-dev: available` in STATE.md):

   Read `<pen_sources>` block from DESIGN-CONTEXT.md (written by design-context-builder Step 0B).

   For each .pen component: merge declared design-tokens into the synthesis output:
   - Token key/value pairs from `.pen` frontmatter → added to `<token_system>` section
   - If a .pen token value differs from a grep-found implementation value → flag as `DIVERGE` in synthesis output

   Add to `<connection_sources>` block: `source: pencil.dev (N components read from .pen files)`

   Note in synthesis header: `pen-sources: N components read from .pen files` (or `pen-sources: 0 — pencil-dev not_configured` if skipped).

4. Produce `.design/DESIGN-CONTEXT.md` with the following sections, each wrapped in XML tags:
   - `<token_system>` — from token-mapper
   - `<component_inventory>` — from component-taxonomy-mapper
   - `<visual_hierarchy>` — from visual-hierarchy-mapper
   - `<a11y_baseline>` — from a11y-mapper
   - `<motion_system>` — from motion-mapper
   - `<decisions>` — D-XX items from STATE.md (numbered, deduplicated)
   - `<research_findings>` — from phase-researcher (if present)
   - `<handoff_context>` — handoff bundle summary (if handoff mode active; see section below)
   - `<connection_sources>` — active connections and what each contributed (including Pinterest and Claude Design status)
4. Tag each section with a `source:` line (e.g., `source: token-mapper v1.0.1`).
5. De-duplicate across sections; when two inputs conflict, prefer the more recent (by mtime) and note the conflict.
6. Write `.design/DESIGN-CONTEXT.md` with frontmatter:
   ```yaml
   ---
   status: complete
   generated: <ISO timestamp>
   sources: [tokens, components, visual-hierarchy, a11y, motion, decisions, research]
   ---
   ```

## Handoff mode

Handoff mode activates when `handoff_source` is present in `.design/STATE.md <position>`. In this mode, the synthesizer's primary input is the Claude Design handoff bundle rather than the 5 mapper outputs.

### Activation check

```
Read .design/STATE.md
  → <position> contains handoff_source → activate handoff mode
  → <position> has no handoff_source   → skip this section, run normal synthesis
```

### Parsing algorithm (handoff mode)

1. **Resolve the bundle** from STATE.md fields in priority order:

   ```
   handoff_url present   → fetch URL with WebFetch tool
                           check Content-Type:
                             text/html               → use response body as html_content (goto step 2)
                             application/zip         → save to .design/handoff/bundle.zip, goto ZIP branch
                             other                   → warn user, abort handoff mode
   handoff_path present  → check extension:
                             .html                   → read file, goto step 2
                             .zip                    → goto ZIP branch
                             .pdf                    → goto PDF branch
                             .pptx / .pptx           → goto PPTX branch
   neither present       → warn "no handoff_path or handoff_url in STATE.md", abort handoff mode
   ```

   **ZIP branch:** Extract `.design/handoff/bundle.zip` to `.design/handoff/extracted/`. Find primary HTML (`index.html`, `design.html`, or first `.html` at root). Find spec file (`readme.md`, `spec.md`, or first `.md` at root). Set html_content + spec_content. Delete `.design/handoff/extracted/` after parsing.

   **PDF branch:** Extract all text content (Bash: `pdftotext <file> -` or python `pdfminer`). Set text_content. Skip to step 3b.

   **PPTX branch:** Extract slide text (Bash: unzip `.pptx`, parse `ppt/slides/*.xml` for `<a:t>` text nodes). Set text_content. Skip to step 3b.

2. **Parse HTML export** (primary — html_content available):
   - Extract all CSS custom properties from `<style>` blocks: grep for `--[a-z]+-[a-z-]+:\s*[^;]+`
   - Categorize by prefix:
     - `--color-*` → `[Color]` decisions
     - `--spacing-*` or `--space-*` → `[Spacing]` decisions
     - `--font-*` or `--text-*` → `[Typography]` decisions
     - `--radius-*` or `--rounded-*` → `[Radius]` decisions
     - `--shadow-*` → `[Shadow]` decisions
     - All others → `[Token]` decisions
   - Extract component names from `class="component-*"` or `data-component="*"` patterns → `[Component]` decisions
   - Detect layout patterns: `display: grid`, `display: flex` in component-level sections → `[Layout]` decisions

3. **Parse spec text** (secondary):

   3a. **Spec markdown / JSON** (if html_content path had a `.md` sibling, or ZIP contained spec):
   - Grep for `Decision:`, `Rationale:`, `Token:`, `Component:` prefixes
   - Treat found lines as pre-formed D-XX entries

   3b. **PDF / PPTX text** (text_content only, no HTML):
   - Grep text_content for same prefixes as 3a
   - Also grep for hex colors (`#[0-9a-fA-F]{3,6}`), rem/px values (`[\d.]+rem|[\d]+px`), font names
   - Tag ALL entries `(tentative — text-only, no CSS confirmation)`
   - Note in STATE.md: `handoff_format: pdf` or `handoff_format: pptx` with caveat that token values need user confirmation

4. **Translate to D-XX decisions**:
   - CSS custom property: `D-NN: [Category] Token name: value (source: claude-design-handoff) (tentative — confirm with user)`
   - Explicit spec markdown decision: `D-NN: [Category] decision text (source: claude-design-handoff) (locked — from handoff spec)`
   - Inferred component/layout: `D-NN: [Category] inferred text (source: claude-design-handoff) (tentative — inferred)`
   - PDF/PPTX text value: `D-NN: [Category] extracted text (source: claude-design-pdf/pptx) (tentative — text-only, no CSS confirmation)`

5. **Append to STATE.md `<decisions>` block** under `### Handoff-sourced decisions` subsection header.

6. **Write `<handoff_context>` section in DESIGN-CONTEXT.md** with:
   - Bundle path
   - Parse summary (N color tokens, N spacing tokens, N components found)
   - Confidence distribution (locked/tentative/inferred counts)
   - Gaps: decision categories NOT found in the bundle (these become discussant questions in `--from-handoff` mode)

## Output

Single file: `.design/DESIGN-CONTEXT.md`.


## Record

At run-end, append one JSONL line to `.design/intel/insights.jsonl`:

```json
{"ts":"<ISO-8601>","agent":"<name>","cycle":"<cycle from STATE.md>","stage":"<stage from STATE.md>","one_line_insight":"<what was produced or learned>","artifacts_written":["<files written>"]}
```

Schema: `reference/schemas/insight-line.schema.json`. Use an empty `artifacts_written` array for read-only agents.

## SYNTHESIZE COMPLETE
