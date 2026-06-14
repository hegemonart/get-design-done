---
name: hone-export
description: "Packages a completed design cycle (.design artifacts + decisions + screenshots) into a stakeholder-shareable artifact - self-contained HTML, print-styled PDF (Paged.js-compatible), or a Notion page. Redacts secrets; --pseudonymize masks identity for external sharing; --pr posts the HTML preview as a PR comment. Use to hand a design-review packet to PMs/execs/brand who aren't in the repo."
argument-hint: "<cycle-id> --format html|pdf|notion [--pseudonymize] [--pr]"
user-invocable: true
tools: Read, Write, Bash, Glob, Grep, ToolSearch, Task
---

# /hone:export

Turns a completed cycle's in-repo design output into a shareable artifact. Closes the gap that `.design/*.md` lives only in the repo - stakeholders not in code can't consume it. The format contract + source set live in `../../reference/export-formats.md`; the Notion write-path in `../../connections/notion.md`.

## Steps

1. **Resolve the cycle.** `<cycle-id>` (or the current cycle from `.design/STATE.md`). Read the **source set**: `EXPERIENCE.md` (Phase 19.5), `.design/DESIGN.md`, `.design/DESIGN-VERIFICATION.md`, `.design/DESIGN-AUDIT.md` (if present), the decision log, and any Preview/Chromatic screenshots.
2. **Redact (always) + pseudonymize (opt-in).** Pass every section through `scripts/lib/redact.cjs` (secrets). If `--pseudonymize`, additionally apply `scripts/lib/pseudonymize.cjs` (git identity / paths / hostname) for external sharing. Honor `GDD_DISABLE_NOTION` for the notion format.
3. **Assemble per `--format`:**
   - **`html`** (default) - `node -e "require('scripts/lib/export/build-html.cjs').buildHtml({...})"` → a **self-contained** HTML (inline CSS, base64-embedded screenshots, no external refs). Write to `.design/export/<cycle>.html`.
   - **`pdf`** - the same `buildHtml({ ..., print: true })` (Paged.js-compatible `@page` print CSS). Write `.design/export/<cycle>.print.html`; instruct the user to render it via Paged.js / headless-Chrome (GDD ships **no** PDF runtime - D-02).
   - **`notion`** - probe the Notion MCP (`ToolSearch({query:"notion"})`); if `available`, create a page from the same source (nested toggles + image upload) per `connections/notion.md`; if `not_configured`/disabled → degrade to the `html` format + a note.
4. **`--pr`** - hand the generated HTML preview to `agents/pr-commenter.md` (via `Task`) to post as a PR comment (degrade-to-noop if no PR / pr-commenter unavailable).
5. **Print the artifact path** (and the Notion URL / PR comment status when applicable).

## Do Not

- Do not add a PDF/markdown runtime dependency (`paged`/`puppeteer`/`pdfkit`/a markdown lib) - `build-html.cjs` is pure and the PDF is render-it-yourself print HTML (D-02).
- Do not emit an un-redacted artifact - redact is mandatory; pseudonymize is the external-sharing opt-in.
- Do not block on Notion/PR - both degrade to a noop / the html file.

## EXPORT COMPLETE
