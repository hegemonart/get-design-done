/**
 * print/validate-print-css.cjs — static print-CSS constraint validator
 * (Phase 34.3-01).
 *
 * Pure, deterministic regex/string analysis of a print CSS/HTML STRING. Same
 * input -> identical output. It checks the statically-verifiable SUBSET of the
 * constraint catalogue in `reference/print-design.md` §8 — the spec is the
 * authority; the `rule` ids emitted here are constraint-ids defined there.
 *
 * WHAT IS CHECKED (the five deterministic classes, emitted in a stable order):
 *   PR-PAGE-01  an `@page` rule is present — the print box model. Its absence in
 *               a print stylesheet means no defined page geometry. (Absence flagged.)
 *   PR-BLEED-01 a bleed box / crop-marks signal is present — a CSS `bleed:`
 *               declaration, a `marks:` (crop|cross) declaration, or a documented
 *               bleed/crop-marks note. (Total absence flagged.)
 *   PR-CMYK-01  a CMYK-awareness signal is present — a `cmyk(` color, a
 *               `color-profile` / `@color-profile` reference, or a documented CMYK
 *               note. (Total RGB-only absence flagged.)
 *   PR-FONT-01  a font-embed signal is present — an `@font-face` rule carrying a
 *               `src:` (embedded font), or a documented font-embed/outline note. A
 *               bare system-font-stack with no embed is flagged.
 *   PR-DPI-01   a 300dpi raster-fallback signal is present — an `image-resolution:`
 *               declaration (300dpi / from-image), a `min-resolution` query, or a
 *               documented 300dpi note. (Absence flagged.)
 *
 * WHAT IS *NOT* CHECKED (catalogued in reference/print-design.md as render-tested
 * guidance — verified by the optional Paged.js-headless-Chrome / PDFKit render
 * connection at 34.3-02, never by this validator): exact overprint/knockout
 * behavior, ICC-profile correctness / on-press gamut matching, trap/registration,
 * true vector tessellation, and per-output preflight (PR-*-02/03, PR-UNIT-01,
 * PR-COLOR-01..03).
 *
 * PURITY (D-02 / D-10): operates only on the passed string — no fs of the
 * document, no network, no child-process spawn, no pdfkit/paged/puppeteer/
 * playwright runtime import, no Date, no process.env. This file has zero
 * require() calls (node builtins included).
 */

'use strict';

// --- PR-PAGE-01: an @page rule is present ---------------------------------
// Require an actual @page RULE (an optional `:pseudo` selector then a `{` block),
// not the bare token — so negative prose like "NO @page rule" in a comment does
// not count as a present rule.
const AT_PAGE_RE = /@page\b[^;{}]*\{/i;

// --- PR-BLEED-01: a bleed box / crop-marks signal -------------------------
// A CSS `bleed:` descriptor, a `marks:` (crop|cross) descriptor, or a
// documented bleed/crop-marks note. The declaration forms require a value after
// the colon (so a negative-prose "NO bleed box" comment does NOT match); the
// note form requires the word "crop"/"registration" adjacent to "mark(s)".
const BLEED_DECL_RE = /\bbleed\s*:\s*\S/i;
const MARKS_DECL_RE = /\bmarks\s*:\s*(?:crop|cross)\b/i;
const CROP_MARKS_NOTE_RE = /\b(?:crop|registration)\s+marks?\b/i;

// --- PR-CMYK-01: a CMYK-awareness signal ----------------------------------
// A cmyk() color, a color-profile / @color-profile reference, or a documented
// "CMYK" note (the word CMYK anywhere — a comment recording production intent).
const CMYK_FN_RE = /\bcmyk\s*\(/i;
const COLOR_PROFILE_RE = /@?color-profile\b/i;
const CMYK_NOTE_RE = /\bCMYK\b/i;

// --- PR-FONT-01: a font-embed signal --------------------------------------
// An @font-face rule whose body carries a `src:` (an embedded font), or a
// documented font-embed/outline note.
const FONT_FACE_SRC_RE = /@font-face\s*\{[^{}]*\bsrc\s*:/i;
const FONT_EMBED_NOTE_RE = /\b(?:font[\s-]*embed(?:ding|ded)?|embed(?:ded)?\s+font|outline(?:d)?\s+(?:to\s+)?(?:vector|font)|font[\s-]*outline)\b/i;

// --- PR-DPI-01: a 300dpi raster-fallback signal ---------------------------
// An image-resolution declaration, a min-resolution query, or a documented
// 300dpi note (300 immediately followed by dpi/ppi, optionally spaced/hyphenated).
const IMAGE_RESOLUTION_RE = /\bimage-resolution\s*:/i;
const MIN_RESOLUTION_RE = /\bmin-resolution\b/i;
const DPI_300_NOTE_RE = /\b300\s*-?\s*(?:dpi|ppi)\b/i;

/**
 * Validate a print CSS/HTML string against the statically-checkable constraint
 * subset of reference/print-design.md §8.
 *
 * @param {string} input the print CSS (or HTML carrying a print stylesheet);
 *   the caller reads the file and passes the content — this function never
 *   touches the filesystem
 * @param {{ checks?: string[] }} [opts] reserved for future toggles; default
 *   runs all five classes
 * @returns {{ ok: boolean, violations: Array<{ rule: string, detail: string }> }}
 *   `ok === (violations.length === 0)`; each violation's `rule` is a catalogued
 *   constraint-id and `detail` is a short human string.
 */
function validatePrintCss(input, opts) {
  if (typeof input !== 'string') {
    throw new TypeError('validatePrintCss(input): input must be a string');
  }
  void opts; // reserved
  /** @type {Array<{ rule: string, detail: string }>} */
  const violations = [];

  // --- PR-PAGE-01: an @page rule is present (the print box model) -----------
  if (!AT_PAGE_RE.test(input)) {
    violations.push({
      rule: 'PR-PAGE-01',
      detail: 'a print stylesheet must declare an @page rule (the print box model — size/margin/marks); none found',
    });
  }

  // --- PR-BLEED-01: a bleed box / crop-marks signal -------------------------
  const hasBleed =
    BLEED_DECL_RE.test(input) ||
    MARKS_DECL_RE.test(input) ||
    CROP_MARKS_NOTE_RE.test(input);
  if (!hasBleed) {
    violations.push({
      rule: 'PR-BLEED-01',
      detail: 'declare a bleed box / crop marks (a `bleed:` declaration, a `marks: crop|cross` declaration, or a documented bleed/crop-marks note) so edge-to-edge content survives the trim',
    });
  }

  // --- PR-CMYK-01: a CMYK-awareness signal ----------------------------------
  const hasCmyk =
    CMYK_FN_RE.test(input) ||
    COLOR_PROFILE_RE.test(input) ||
    CMYK_NOTE_RE.test(input);
  if (!hasCmyk) {
    violations.push({
      rule: 'PR-CMYK-01',
      detail: 'signal CMYK awareness (a cmyk() color, a color-profile/@color-profile reference, or a documented CMYK-target note); print is subtractive CMYK, not screen RGB',
    });
  }

  // --- PR-FONT-01: a font-embed signal --------------------------------------
  const hasFontEmbed =
    FONT_FACE_SRC_RE.test(input) ||
    FONT_EMBED_NOTE_RE.test(input);
  if (!hasFontEmbed) {
    violations.push({
      rule: 'PR-FONT-01',
      detail: 'embed or outline fonts (an @font-face with an embedded src:, or a documented font-embed/outline note); print RIPs have no web fonts and no system-font fallback',
    });
  }

  // --- PR-DPI-01: a 300dpi raster-fallback signal ---------------------------
  const hasDpi =
    IMAGE_RESOLUTION_RE.test(input) ||
    MIN_RESOLUTION_RE.test(input) ||
    DPI_300_NOTE_RE.test(input);
  if (!hasDpi) {
    violations.push({
      rule: 'PR-DPI-01',
      detail: 'provide a 300dpi raster-fallback signal (image-resolution: 300dpi/from-image, a min-resolution query, or a documented 300dpi note); screen 72/96dpi rasters pixelate in print',
    });
  }

  return { ok: violations.length === 0, violations };
}

module.exports = { validatePrintCss };
