# Print Design — Constraint Catalogue

This reference is the **print/PDF constraint catalogue**: the hard print-production rules a
print-ready document MUST honor. Print is a *constrained* output surface — the screen-RGB
HTML/CSS the web executor emits has no `@page` box model, no bleed/crop marks, no CMYK
color space, no font embedding, and no 300dpi raster guidance, so it cannot be sent to a
press as-is. This file is the **authority** that the `pdf-executor` (Phase 34.3-02) generates
against and the design-verifier's print branch (34.3-03) audits against; neither re-derives
these rules. The deterministic subset of this catalogue is checked by
[`scripts/lib/print/validate-print-css.cjs`](../scripts/lib/print/validate-print-css.cjs),
whose emitted `rule` ids are the constraint-ids defined below (the spec is the authority).

It is the print sibling of the other non-web output references. The files have distinct jobs
and must not be confused:

| File | Job |
| --- | --- |
| `reference/platforms.md` (Phase 19) | Interaction **conventions** — navigation, safe areas, gestures, native typography, haptics. *Behavioral* knowledge for native/web screens. |
| `reference/native-platforms.md` (Phase 34.1) | The native **token bridge** — maps canonical CSS tokens to SwiftUI / Jetpack Compose / Flutter with a precision contract. *Token-identity* knowledge for native generators. |
| `reference/email-design.md` (Phase 34.2) | The email **constraint catalogue** — table layout, inline styles, MSO comments, dark-mode `color-scheme`. *Structural* knowledge an email template implements. |
| `reference/print-design.md` (Phase 34.3, this file) | The print **constraint catalogue** — the `@page` box model, bleed + crop marks, CMYK awareness, font embedding, and 300dpi raster fallback. *Production* knowledge a print/PDF document implements. |

Per **D-02** there is **no bundled `pdfkit` / `paged` / `puppeteer` / `playwright`
dependency**: the `pdf-executor` generates **Paged.js-compatible print HTML/CSS** as its
canonical artifact, and the PDF is rendered by the agent's contract or the *optional*
print-render connection, never by a build step. Per **D-03** print verify is this
catalogue's *static* validator plus an *optional* Paged.js-headless-Chrome / PDFKit
render-test connection that degrades to the static validator when absent. Per **D-10** the
static checks are deterministic (same CSS/HTML string → same result), with no network and
no PDF runtime, so the default `npm test` stays green on any machine.

Each constraint carries a **rule-id** (`PR-<CLASS>-NN`). Section 8 marks exactly which ids
the static validator asserts versus which are render-tested guidance only.

---

## 1. Purpose

Phase 19 shipped platform *references*; Phase 23 shipped the token engine; Phase 34.1 added
native generators; Phase 34.2 added the email catalogue. Print/PDF is the last untouched
product surface, and its constraints are unlike screen, native, and email alike: a physical
trim with bleed and registration marks, a *subtractive* CMYK color space instead of additive
screen RGB, a print RIP with **no web fonts** (fonts must be embedded or outlined), and a
300dpi raster floor (vs the screen's 72/96dpi). Instead of each print document being authored
from memory, the constraints live once here (the catalogue) and once in the validator (the
statically-checkable subset), and the executor + verifier consume them. This file is the
single SC#9-print authority.

The catalogue is **prose + tables**, not an implementation. Illustrative snippets are kept to
2–3 lines. The implementation is `validate-print-css.cjs`.

---

## 2. The print box model — `@page`

Print uses the CSS **`@page`** rule to define the page box: its `size` (a named page such as
`A4` / `Letter`, or an explicit `WIDTH HEIGHT` with physical units), its `margin`, and its
`marks` (`crop` / `cross`). Screen CSS has no page box at all — content flows in one
continuous viewport — so a print stylesheet that omits `@page` has no defined page geometry
and cannot paginate predictably. Paged.js consumes the `@page` CSS to paginate in headless
Chrome; PDFKit instead constructs the page box programmatically (`new PDFDocument({ size,
margins })`).

| Rule-id | Constraint |
| --- | --- |
| **PR-PAGE-01** | A print stylesheet MUST declare an `@page` rule — the print box model. Its absence means no defined page geometry. *(Statically checkable: absence of an `@page` rule is flagged.)* |
| PR-PAGE-02 | The `@page` rule SHOULD set `size` (named `A4`/`Letter` or explicit physical `WIDTH HEIGHT`) and `margin`; use `@page :first` / `:left` / `:right` for cover/spread-specific geometry. |
| PR-PAGE-03 | Control pagination with `break-before` / `break-after` / `break-inside: avoid` (and the legacy `page-break-*`) so headings, tables, and figures do not split badly across page boundaries. |

```css
@page { size: A4; margin: 12mm; marks: crop cross; bleed: 3mm; }
```

---

## 3. Bleed + crop marks

Print is **trimmed** to a bleed box: any color or image that should reach the physical edge
must extend ~**3mm past the trim line** (the *bleed*), so that slight cutting variance never
exposes a white paper edge. **Crop/registration marks** tell the printer (and the trimming
guillotine) exactly where to cut, and align the CMYK separations on press. Screen CSS has no
notion of either. The CSS print idioms are the `bleed:` descriptor and `marks: crop` (and/or
`cross`) on `@page`; Paged.js supports both. A safe area is kept *inside* the trim so no
critical content sits in the cut-tolerance band.

| Rule-id | Constraint |
| --- | --- |
| **PR-BLEED-01** | A print document targeting edge-to-edge output MUST signal a bleed box / crop marks — a CSS `bleed:` declaration, a `marks: crop\|cross` declaration, or a documented bleed/crop-marks convention. *(Statically checkable: total absence of any bleed/marks signal is flagged.)* |
| PR-BLEED-02 | Bleed is conventionally **3mm** (≈0.125in); registration marks sit in the trim waste outside the bleed box so they are removed when the sheet is cut. |
| PR-BLEED-03 | Keep a **safe area** inside the trim (≈3–5mm) — critical text and logos stay inside it so cut tolerance never clips them. |

---

## 4. CMYK awareness

Print is **subtractive CMYK** (cyan/magenta/yellow/key-black ink on paper), not the additive
screen **RGB** the web executor emits. Pure-RGB output risks visible color shift on press:
bright RGB blues/greens fall outside the CMYK gamut and reproduce duller, and an untagged
document leaves the RIP to guess a conversion. A print artifact must therefore signal CMYK
awareness — a `cmyk()` color, a `color-profile` / `@color-profile` reference (an ICC/CMYK
target profile), or an explicit documented CMYK-target note. Exact ICC-profile correctness
and on-press gamut matching are **render-tested**, not statically assertable (see §8).

| Rule-id | Constraint |
| --- | --- |
| **PR-CMYK-01** | A print document MUST show CMYK awareness — a `cmyk()` color value, a `color-profile` / `@color-profile` reference, or a documented CMYK-target note. *(Statically checkable: total absence of any CMYK-awareness signal — pure screen-RGB only — is flagged.)* |
| PR-CMYK-02 | Prefer named spot/`cmyk()` values for brand colors that must match on press; flag wide-gamut RGB (`display-p3`, neon RGB) that will not survive CMYK conversion. |
| PR-CMYK-03 | Rich black (e.g. `C30 M30 Y30 K100`) for large solid areas; pure `K100` for small text to avoid registration fringing. *(ICC correctness is render-tested — §8.)* |

```css
:root { color-profile: url(./CoatedFOGRA39.icc); }   /* CMYK target */
.brand { color: cmyk(0% 80% 95% 0%); }
```

---

## 5. Font embedding

Print **RIPs have no web fonts** and no system-font-stack fallback chain — whatever font is
referenced must be **embedded** in the document (`@font-face` with an embedded `src:`) or the
text must be **outlined to vector**. A bare `font-family: Arial, sans-serif` system-font-stack
assumption is a print bug: the RIP may substitute a metrically-different face (reflowing the
layout) or fail to render the glyphs at all. PDFKit embeds fonts via `doc.registerFont(…)`;
Paged.js relies on `@font-face` declarations resolved before pagination.

| Rule-id | Constraint |
| --- | --- |
| **PR-FONT-01** | Fonts MUST be embedded or outlined — an `@font-face` rule with an embedded `src:`, or a documented font-embed/outline note. A bare system-font-stack assumption (no embed) is a print bug. *(Statically checkable: absence of any font-embed signal is flagged.)* |
| PR-FONT-02 | Embed only the weights/styles actually used (subset where possible) to keep the PDF small; ensure the license permits embedding. |
| PR-FONT-03 | Outline display/headline type to vector when exact rendering matters more than text selectability; keep body copy as embedded text for accessibility and reflow. |

```css
@font-face { font-family: "Brand"; src: url(./Brand.woff2) format("woff2"); }
```

---

## 6. 300dpi raster fallback

Raster/image assets need **300dpi** at final print size or they pixelate — screen assets are
authored at 72/96dpi, which is ~3–4× too coarse for press. **Vector is preferred** wherever
possible (logos, icons, rules) because it is resolution-independent; where raster is
unavoidable (photography), it must carry a 300dpi guarantee. The CSS signals are
`image-resolution: 300dpi` (or `from-image`), a `min-resolution` media query, or a documented
300dpi note.

| Rule-id | Constraint |
| --- | --- |
| **PR-DPI-01** | Raster assets MUST carry a 300dpi raster-fallback signal — an `image-resolution:` declaration (`300dpi` / `from-image`), a `min-resolution` query, or a documented 300dpi note. *(Statically checkable: absence of any 300dpi signal is flagged.)* |
| PR-DPI-02 | Prefer vector (SVG/PDF) for logos, icons, and line art so they stay crisp at any output size; reserve raster for continuous-tone photography. |
| PR-DPI-03 | Size raster assets so their *effective* resolution at the placed dimensions is ≥300dpi; upscaling a 72dpi screen asset does not add real detail. |

---

## 7. Print color + units

Print prefers **physical units** (`mm` / `cm` / `pt` / `in`) over screen `px`, because the
page is a physical object — `px` has no fixed physical size across RIPs. Print-safe color,
overprint, and knockout are production concerns the executor should honor; most are
**render-tested guidance** (see §8), not statically asserted by the validator.

| Rule-id | Constraint |
| --- | --- |
| PR-UNIT-01 | Use physical units (`mm`/`cm`/`pt`/`in`) for page geometry, margins, and bleed; reserve `px` for screen. *(Guidance.)* |
| PR-COLOR-01 | **Overprint vs knockout** — small black text overprints (prints on top) to avoid registration gaps; light-on-dark knocks out. *(Render-tested — §8.)* |
| PR-COLOR-02 | **Trap/registration** — adjacent CMYK separations are trapped (slightly overlapped) so misregistration on press shows no white gap. *(Render-tested — §8.)* |
| PR-COLOR-03 | **True vector tessellation** — complex vector fills/gradients must tessellate without seams in the RIP. *(Render-tested — §8.)* |

---

## 8. Statically-checkable vs render-tested

This table is the **contract** the validator's `rule` ids map to. The five rule-ids below are
the deterministic subset that `scripts/lib/print/validate-print-css.cjs` asserts via
regex/string analysis of the supplied print CSS/HTML string. Every other rule-id in this
catalogue is **render-tested guidance** — verified by the optional Paged.js-headless-Chrome /
PDFKit render-test connection (34.3-02), never asserted by the static validator.

| Rule-id | Check | Statically checked by the validator? | How verified otherwise |
| --- | --- | --- | --- |
| **PR-PAGE-01** | An `@page` rule is present (the print box model) | **YES** — absence flagged | — |
| **PR-BLEED-01** | A bleed box / crop-marks signal is present (`bleed:` / `marks:` / a documented bleed-marks note) | **YES** — total absence flagged | — |
| **PR-CMYK-01** | A CMYK-awareness signal is present (`cmyk(` / `color-profile` / `@color-profile` / a CMYK note) | **YES** — total absence (pure RGB) flagged | — |
| **PR-FONT-01** | A font-embed signal is present (`@font-face` with `src:` / a font-embed/outline note) | **YES** — absence flagged | — |
| **PR-DPI-01** | A 300dpi raster-fallback signal is present (`image-resolution:` / `min-resolution` / a 300dpi note) | **YES** — absence flagged | — |
| PR-PAGE-02..03 | `size`/`margin` set, sensible page breaks | No | Render test (paginated output) |
| PR-BLEED-02..03 | 3mm bleed value, marks in trim waste, safe area | No | Render test (preflight) |
| PR-CMYK-02..03 | In-gamut brand colors, rich-black vs K100, **ICC-profile correctness** | No | Render test (press proof / ICC) |
| PR-FONT-02..03 | Subsetted/licensed embeds, vector outlining | No | Render test (PDF inspect) |
| PR-DPI-02..03 | Vector-preferred, effective ≥300dpi at placed size | No | Render test (preflight) |
| PR-UNIT-01, PR-COLOR-01..03 | Physical units, **overprint/knockout**, **trap/registration**, **true vector tessellation** | No | Render test (press / RIP) |

Notes on the five statically-checked rules:

- **Each check is a presence/absence test.** The validator flags the *total absence* of a
  catalogued signal class in the supplied string; the presence of **any one** accepted signal
  for a class satisfies it. The checks are independent, so a document can satisfy four classes
  and trip exactly one.
- **CMYK awareness is satisfied by any of three signals.** A `cmyk()` color, a
  `color-profile` / `@color-profile` reference, **or** a documented `/* CMYK … */` note each
  satisfy PR-CMYK-01 on their own — a fully RGB document with an explicit CMYK-target note
  still passes (the note records the production intent the RIP needs).
- **Render-tested rules are out of the static validator's scope by design.** Overprint
  behavior, ICC-profile correctness, trap/registration, and true vector tessellation require
  an actual PDF RIP / rendering engine — they are catalogued here as executor guidance and
  verified by the optional print-render connection, never asserted statically (D-03 / D-10).

---

## 9. Cross-references

- [`reference/email-design.md`](./email-design.md) — the email-constraint sibling
  (table layout, inline styles, MSO comments, dark mode). The non-web siblings share the
  catalogue-plus-static-validator shape.
- [`reference/native-platforms.md`](./native-platforms.md) — the native token-bridge sibling
  (SwiftUI / Compose / Flutter). The other non-web output surface.
- [`reference/platforms.md`](./platforms.md) — the interaction-conventions sibling.
- [`scripts/lib/print/validate-print-css.cjs`](../scripts/lib/print/validate-print-css.cjs)
  — the deterministic static validator that asserts the §8 subset; its `rule` ids are the
  constraint-ids defined here.
- [`reference/registry.json`](./registry.json) — this catalogue is registered as the
  `print-design` entry (type `heuristic`, phase `34.3`) so the registry round-trip test
  (`test/suite/reference-registry.test.cjs`) stays green (D-05, the 34.1-01 / 34.2-01 lesson).
