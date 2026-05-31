# Print-Renderer — Connection Specification

This file is the connection specification for the print-render within the get-design-done pipeline. It lives in `connections/` alongside the other connection specs (the closest analog is `connections/preview.md`, the headless-Chrome visual-truth connection). See the connection index for the full connection capability matrix (the print-renderer row is added at the 34.3 closeout).

---

The print-render is the **verify stage's RENDERED proof for the `print` project type**. It renders the `pdf-executor`'s **Paged.js-compatible print HTML/CSS** to a **paginated PDF / page image** — the print analog of `preview.md`'s browser screenshots. Its pipeline role: after the `pdf-executor` generates the print HTML/CSS (validated by the static checker), the verify stage uses the print-render — **when available** — to surface print breakage the static validator cannot see (actual pagination, bleed placement, font embedding in the PDF, raster resolution), and narrates the result in plain English.

**Key relationship to the static validator:** the print-render is the *rendered* complement to the *static* checker `scripts/lib/print/validate-print-css.cjs`. The static validator deterministically checks constraint **classes** (`@page` present, bleed/crop-marks signal, CMYK awareness, font-embed, 300dpi — `PR-PAGE/BLEED/CMYK/FONT/DPI`); the print-render checks the **rendered output** — what actually paginates and rasterizes. The print-render is **optional** — its absence is a quality reduction, not a blocking error (D-03).

---

## Setup

**Prerequisites:**

- **PRIMARY — Paged.js via headless Chrome:** the same headless-Chrome family `preview.md` uses. Paged.js consumes the `@page`/bleed print CSS and paginates in headless Chrome, producing a paginated PDF. No bundled dependency is required to *probe*; the render is opt-in — like the Preview MCP, prefer a built-in / no-external-package path where possible, and where a tool IS needed it is opt-in (never installed by the pipeline).
- **ALTERNATIVE — PDFKit for Chrome-less runtimes:** where no headless Chrome is available, PDFKit constructs the page box programmatically (`new PDFDocument({ size, margins })`), embeds fonts (`doc.registerFont(...)`), and places the bleed. This is the documented Chrome-less render path.

Per **D-02 / D-10** there is **NO bundled `pdfkit`/`paged`/`puppeteer`/`playwright` dependency** and **no live render in the default `npm test`** — the print-render is an optional, opt-in enhancement the maintainer wires up in the verify stage when a renderer is present.

**Verification:**

```bash
command -v chromium 2>/dev/null || command -v chrome 2>/dev/null || command -v node 2>/dev/null
```

---

## Why the print-render is useful

Print rendering breakage is invisible to both code review and the static validator. A print stylesheet can pass every static class-check (`validatePrintCss` returns `ok: true`) and still render broken: a table splits badly across a page boundary because a `break-inside: avoid` was missing, the bleed box does not actually extend past the trim, an `@font-face` fails to embed and the RIP substitutes a metrically-different face (reflowing the layout), a raster image that *claimed* 300dpi is upscaled and pixelates.

The static validator checks constraint **classes**; it cannot render. The print-render renders the **actual** document to a paginated PDF / page image, so pagination, bleed placement, font embedding, and raster resolution surface as visible output rather than a press reject weeks later.

---

## When to use the print-render

**Verify stage:** After the `pdf-executor` generates the print HTML/CSS, run the print-render — when available — to capture a paginated PDF / page proof and check for rendered breakage. The verify stage narrates the delta and notes it in `DESIGN-VERIFICATION.md`.

The print-render is **not** used at generation time. The `pdf-executor` needs no headless Chrome, no Paged.js runtime, no PDFKit, and no network to produce the print HTML/CSS — generation is gated by the static validator only (D-04/D-10).

---

## Availability Probe

The print-render is consumed via a CLI/binary presence check (headless Chrome / PDFKit), not ToolSearch.

**Step PR1 — renderer presence:**

```bash
command -v chromium 2>/dev/null || command -v chrome 2>/dev/null
```

- A headless-Chrome binary (for Paged.js) OR a PDFKit-capable runtime is found → proceed to Step PR2
- Neither → `print-renderer: not_configured` (skip all print-render steps)

**Step PR2 — render capability check:**

- A renderer is present and invokable → `print-renderer: available`
- Present but not invokable (missing flag, sandbox error) → `print-renderer: unavailable`

**Write the print-renderer status to `.design/STATE.md` `<connections>` immediately after probing** — the three-value schema `preview.md` uses (`available` / `unavailable` / `not_configured`).

---

## Fallback Behavior

When the print-render is `not_configured` or `unavailable`, the verify stage degrades gracefully — no error is raised.

**verify stage (`skills/verify/SKILL.md` + `agents/design-verifier.md`):**

- `print-renderer: unavailable` → skip the rendered PDF/page proof; **degrade** to the static validator `scripts/lib/print/validate-print-css.cjs` (the `PR-PAGE/BLEED/CMYK/FONT/DPI` class-checks), then a **code-only** structural audit of the print HTML/CSS; note in `DESIGN-VERIFICATION.md`: "Print render-test skipped — no headless Chrome / PDFKit; verified via the static print-CSS validator + a code-only structural audit."
- `print-renderer: not_configured` → same as unavailable; note: "Print render-test skipped — print-render not configured; verified via the static validator + a code-only audit. (Alternative: PDFKit on a Chrome-less runtime.)"

**Graceful degradation required:** the pipeline must continue when the print-render is unavailable. Missing rendered-PDF data is a **quality reduction, not a blocking error** (D-03 — the print-render is an enhancement, never hard-required, mirroring the 34.1 simulator / 34.2 Litmus connections). The static validator is always available and is the deterministic floor; the print-render is the rendered ceiling on top of it. Neither stage appends a `<blocker>` for a missing print-render connection. If a `must_have` explicitly requires rendered-PDF evidence, THEN append a blocker.

---

## STATE.md Integration

Every stage that probes the print-render writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
preview: available
print-renderer: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|---|---|
| `available` | A headless-Chrome (Paged.js) or PDFKit renderer is present AND invokable |
| `unavailable` | A renderer binary is present but the render call errored (missing flag, sandbox) |
| `not_configured` | No headless Chrome and no PDFKit runtime — the print-render is not set up |

The verify stage re-probes at stage entry (renderer availability can change between sessions). If STATE.md already carries a `print-renderer:` status from a prior stage in the SAME session, that status can be trusted for the rest of that session.

---

## Caveats and Pitfalls

1. **The print-render is an enhancement, not a requirement.** Its absence degrades to the static validator + a code-only audit and never blocks the pipeline (D-03). Do not gate a print build on a rendered PDF.

2. **Physical-unit / DPI gotchas.** The page is a physical object — `mm`/`pt`/`in` have fixed physical sizes, `px` does not across RIPs. A render at the wrong DPI (72/96 screen vs 300 print) misrepresents raster sharpness; render at the document's declared output resolution. Bleed (~3mm) and crop marks live in the trim waste — confirm the rendered PDF actually carries them.

3. **No bundled render dependency.** Do NOT add `pdfkit`/`paged`/`puppeteer`/`playwright` to `package.json` to make this connection work — the render is opt-in and the maintainer supplies the renderer. The default `npm test` stays hermetic (D-10).

4. **Do NOT edit the connection index here.** The print-renderer's Active-Connections entry and Capability-Matrix row are added by the 34.3 closeout plan, not by this spec (the 34.1/34.2 disjointness pattern).
