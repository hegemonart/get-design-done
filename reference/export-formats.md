# Export Formats - the `/gdd:export` contract

How `/gdd:export <cycle> --format html|pdf|notion [--pseudonymize] [--pr]` turns a completed cycle's in-repo design output into a stakeholder-shareable artifact. Dep-free: the HTML/PDF assembler is pure (`scripts/lib/export/build-html.cjs`); Notion is MCP-based; no `paged`/`puppeteer`/`pdfkit`/markdown-lib runtime.

---

## Source set (what gets packaged)

In cycle order: `EXPERIENCE.md` (Phase 19.5 cross-cycle memory) · `.design/DESIGN.md` · `.design/DESIGN-VERIFICATION.md` · `.design/DESIGN-AUDIT.md` (if present) · the decision log (`D-XX`) · Preview/Chromatic screenshots (base64-embedded for html/pdf).

## Formats

- **`html`** (default) - `buildHtml({ title, subtitle, sections, images })` → a **single self-contained HTML** file: inline `<style>`, base64-embedded images, **zero external references** (safe to email / drop in Drive). Written to `.design/export/<cycle>.html`.
- **`pdf`** - the same `buildHtml({ ..., print: true })` (adds a Paged.js-compatible `@page` print stylesheet). Written to `.design/export/<cycle>.print.html`; **the user renders it** via Paged.js / headless-Chrome. GDD ships **no** PDF runtime (the print-executor precedent, D-02).
- **`notion`** - a Notion page via the Notion MCP (`connections/notion.md`): headings → section/toggle blocks, screenshots → image-upload blocks. Degrades to the `html` file when the Notion MCP is `not_configured`/disabled.

## Privacy (redact always; pseudonymize opt-in)

Every section is passed through `scripts/lib/redact.cjs` (secrets - the floor). `--pseudonymize` additionally applies `scripts/lib/pseudonymize.cjs` (git identity / paths / hostname / repo origin) - use it when sharing externally. Default (no flag) = redact only.

## PR integration (`--pr`)

`--pr` hands the generated self-contained HTML preview to `agents/pr-commenter.md` (Phase 35.1) to post as a PR comment - degrade-to-noop when there's no PR or pr-commenter is unavailable (never blocks the export).

## Self-contained guarantee (html/pdf)

`build-html.cjs` emits no external `src=`/`<link>`/`<script>` - CSS is inline, images are base64 `data:` URIs. Content links (`<a href="https://…">`) are preserved (they're references, not essential resources). Deterministic: same input → byte-identical output (the regression baseline freezes a fixture render).

## Out of scope

Confluence (Notion-only this phase); Figma export (Phase 31); video walkthroughs; collaborative editing (read-only handoff); bidirectional Notion sync (export write-path only); a bundled PDF/markdown runtime (D-02).
