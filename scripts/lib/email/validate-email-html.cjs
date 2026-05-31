/**
 * email/validate-email-html.cjs — static email-HTML constraint validator
 * (Phase 34.2-01).
 *
 * Pure, deterministic regex/string analysis of an email-HTML STRING. Same
 * input -> identical output. It checks the statically-verifiable SUBSET of the
 * constraint catalogue in `reference/email-design.md` §8 — the spec is the
 * authority; the `rule` ids emitted here are constraint-ids defined there.
 *
 * WHAT IS CHECKED (the four deterministic classes, emitted in a stable order):
 *   EM-LAYOUT-01  no `display:flex` / `display:grid` / `position:absolute|fixed`
 *                 (and `sticky`) in any style — modern box primitives email
 *                 clients drop. (Presence is flagged; table layout is expected.)
 *   EM-STYLE-01   no `<style>` block used as the PRIMARY styling mechanism. A
 *                 `<style>` block is flagged when, after removing `@media { … }`
 *                 groups, `@font-face`, `@import` and comments, residual CSS
 *                 rules remain OR the block exceeds a generous size threshold.
 *                 A small `@media`-only dark-mode/responsive block (EM-STYLE-04)
 *                 is tolerated.
 *   EM-MSO-01     a full-email document (has <html>/<body> or a layout <table>)
 *                 contains at least one MSO conditional comment
 *                 (`<!--[if mso]>` / `<!--[if !mso]>`). Absence is flagged.
 *                 A bare fragment is NOT flagged.
 *   EM-DARK-01    a color-scheme signal is present — a `<meta name="color-scheme">`
 *                 and/or a CSS `color-scheme:` declaration and/or a
 *                 `prefers-color-scheme` query. Total absence is flagged. A meta
 *                 alone satisfies it (decoupled from any <style>).
 *
 * WHAT IS *NOT* CHECKED (catalogued in reference/email-design.md as render-tested
 * guidance — verified by the optional Litmus / Email-on-Acid connection at
 * 34.2-02, never by this validator): ~600px width, ghost tables/VML, bulletproof
 * buttons, image width/height/alt, per-client (EM-CLIENT-01..20) pixel quirks.
 *
 * PURITY (D-02 / D-10): operates only on the passed string — no fs of the
 * document, no network, no child-process spawn, no mjml runtime import, no Date,
 * no process.env. This file has zero require() calls (node builtins included).
 */

'use strict';

// Modern box primitives email clients drop (EM-LAYOUT-01). Whitespace-tolerant.
const FLEX_RE = /display\s*:\s*flex\b/i;
const GRID_RE = /display\s*:\s*grid\b/i;
const POSITION_RE = /position\s*:\s*(?:absolute|fixed|sticky)\b/i;

// <style>…</style> block capture (EM-STYLE-01).
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const AT_MEDIA_GROUP_RE = /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi;
const AT_FONTFACE_GROUP_RE = /@font-face\s*\{[^{}]*\}/gi;
const AT_IMPORT_RE = /@import[^;]*;/gi;
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
// A CSS rule = a selector followed by a `{ … }` declaration block.
const CSS_RULE_RE = /[^{}@;]+\{[^{}]*\}/;
// Generous size threshold: a <style> body this large is a primary sheet even if
// it parsed as @media-only (deterministic guard against huge tolerated blocks).
const STYLE_PRIMARY_CHAR_THRESHOLD = 1024;

// MSO conditional comments (EM-MSO-01).
const MSO_COMMENT_RE = /<!--\[if\s+(?:!\s*)?mso/i;
// "Full email" signal — only then is a missing MSO comment flagged.
const FULL_EMAIL_RE = /<html[\s>]|<body[\s>]|<table[\s>]/i;

// color-scheme signals (EM-DARK-01) — any one satisfies the check.
const META_COLOR_SCHEME_RE = /<meta\b[^>]*name\s*=\s*["']?\s*color-scheme\b/i;
const CSS_COLOR_SCHEME_RE = /color-scheme\s*:/i;
const PREFERS_COLOR_SCHEME_RE = /prefers-color-scheme/i;

/**
 * Decide whether a captured <style> block body is a PRIMARY styling mechanism.
 * Tolerates an @media-only (responsive/dark) block per EM-STYLE-04.
 *
 * @param {string} body raw inner text of a <style>…</style>
 * @returns {boolean} true when the block carries non-@media rules or is oversized
 */
function isPrimaryStyleBlock(body) {
  if (body.length > STYLE_PRIMARY_CHAR_THRESHOLD) return true;
  const residual = body
    .replace(CSS_COMMENT_RE, '')
    .replace(AT_MEDIA_GROUP_RE, '')
    .replace(AT_FONTFACE_GROUP_RE, '')
    .replace(AT_IMPORT_RE, '');
  return CSS_RULE_RE.test(residual);
}

/**
 * Validate an email-HTML string against the statically-checkable constraint
 * subset of reference/email-design.md §8.
 *
 * @param {string} html the email HTML (the caller reads the file and passes the
 *   content — this function never touches the filesystem)
 * @param {{ checks?: string[] }} [opts] reserved for future toggles; default
 *   runs all four classes
 * @returns {{ ok: boolean, violations: Array<{ rule: string, detail: string }> }}
 *   `ok === (violations.length === 0)`; each violation's `rule` is a catalogued
 *   constraint-id and `detail` is a short human string.
 */
function validateEmailHtml(html, opts) {
  if (typeof html !== 'string') {
    throw new TypeError('validateEmailHtml(html): html must be a string');
  }
  void opts; // reserved
  /** @type {Array<{ rule: string, detail: string }>} */
  const violations = [];

  // --- EM-LAYOUT-01: no flexbox/grid/absolute|fixed positioning -------------
  const layoutHits = [];
  if (FLEX_RE.test(html)) layoutHits.push('display:flex');
  if (GRID_RE.test(html)) layoutHits.push('display:grid');
  if (POSITION_RE.test(html)) layoutHits.push('position:absolute|fixed|sticky');
  if (layoutHits.length > 0) {
    violations.push({
      rule: 'EM-LAYOUT-01',
      detail: `email layout must use role="presentation" tables, not modern box primitives (found ${layoutHits.join(', ')})`,
    });
  }

  // --- EM-STYLE-01: no <style> block as the primary styling mechanism -------
  STYLE_BLOCK_RE.lastIndex = 0;
  let m;
  let primaryStyle = false;
  while ((m = STYLE_BLOCK_RE.exec(html)) !== null) {
    if (isPrimaryStyleBlock(m[1])) {
      primaryStyle = true;
      break;
    }
  }
  if (primaryStyle) {
    violations.push({
      rule: 'EM-STYLE-01',
      detail: 'visual styling must be inline; a <style> block with non-@media rules is stripped by Gmail (only a small @media-only block is tolerated)',
    });
  }

  // --- EM-MSO-01: an MSO conditional comment in a full-email document -------
  if (FULL_EMAIL_RE.test(html) && !MSO_COMMENT_RE.test(html)) {
    violations.push({
      rule: 'EM-MSO-01',
      detail: 'a full email must include an MSO conditional comment (<!--[if mso]> … <![endif]-->) for Outlook\'s Word rendering engine',
    });
  }

  // --- EM-DARK-01: a color-scheme signal is present -------------------------
  const hasColorScheme =
    META_COLOR_SCHEME_RE.test(html) ||
    CSS_COLOR_SCHEME_RE.test(html) ||
    PREFERS_COLOR_SCHEME_RE.test(html);
  if (!hasColorScheme) {
    violations.push({
      rule: 'EM-DARK-01',
      detail: 'declare a color-scheme signal (<meta name="color-scheme">, CSS color-scheme:, or @media prefers-color-scheme) so clients keep the intended palette',
    });
  }

  return { ok: violations.length === 0, violations };
}

module.exports = { validateEmailHtml };
