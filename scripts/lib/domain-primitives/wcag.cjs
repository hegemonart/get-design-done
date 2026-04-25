/**
 * domain-primitives/wcag.cjs — minimal WCAG validator (Plan 23-09).
 *
 * Three checks (no axe-core dep):
 *   1. Contrast ratio (WCAG 1.4.3 / 1.4.6) — given fg + bg colors,
 *      compute the ratio. Pass: ≥4.5 (AA normal text), fail: <4.5.
 *   2. Tap target size (WCAG 2.5.5 AAA / 2.5.8 AA) — given width+height
 *      in CSS pixels, fail if either dimension <24 (AA) or <44 (AAA).
 *   3. ARIA label presence — given a snippet of HTML, look for
 *      <button>, <a>, <input> elements without an accessible name
 *      (no text content AND no aria-label/aria-labelledby).
 *
 * All inputs are passed by the caller — this module does not parse
 * arbitrary CSS or run a browser. Each check returns an Array<HeuristicHit>.
 */

'use strict';

/**
 * @typedef {Object} HeuristicHit
 * @property {string} rule_id
 * @property {'P0'|'P1'|'P2'|'P3'} severity
 * @property {string} summary
 * @property {string} [evidence]
 * @property {number} [line]
 * @property {string} file
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.match(HEX_RE);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relLuminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG 1.4.3 contrast ratio between two colors.
 * @param {string} fgHex
 * @param {string} bgHex
 * @returns {number} 1.0 to 21.0
 */
function contrastRatio(fgHex, bgHex) {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return NaN;
  const lf = relLuminance(fg);
  const lb = relLuminance(bg);
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Check contrast against AA (4.5:1) or AAA (7:1) threshold.
 *
 * @param {{file: string, fg: string, bg: string, level?: 'AA'|'AAA', context?: string}} input
 * @returns {HeuristicHit[]}
 */
function checkContrast(input) {
  if (!input || typeof input.fg !== 'string' || typeof input.bg !== 'string') return [];
  const ratio = contrastRatio(input.fg, input.bg);
  const level = input.level ?? 'AA';
  const minimum = level === 'AAA' ? 7 : 4.5;
  if (Number.isNaN(ratio)) {
    return [{
      rule_id: 'wcag/1.4.3',
      severity: 'P2',
      summary: `unparseable color: fg=${input.fg} bg=${input.bg}`,
      file: input.file,
    }];
  }
  if (ratio >= minimum) return [];
  return [{
    rule_id: level === 'AAA' ? 'wcag/1.4.6' : 'wcag/1.4.3',
    severity: ratio < 3 ? 'P0' : 'P1',
    summary: `Contrast ratio ${ratio.toFixed(2)} below ${level} minimum ${minimum}:1`,
    evidence: `fg=${input.fg}, bg=${input.bg}, ratio=${ratio.toFixed(2)}`,
    file: input.file,
  }];
}

/**
 * Check tap target size (WCAG 2.5.5 / 2.5.8).
 *
 * @param {{file: string, width: number, height: number, level?: 'AA'|'AAA', name?: string}} input
 * @returns {HeuristicHit[]}
 */
function checkTapTarget(input) {
  if (!input || typeof input.width !== 'number' || typeof input.height !== 'number') return [];
  const level = input.level ?? 'AA';
  const min = level === 'AAA' ? 44 : 24;
  if (input.width >= min && input.height >= min) return [];
  return [{
    rule_id: level === 'AAA' ? 'wcag/2.5.5' : 'wcag/2.5.8',
    severity: 'P1',
    summary: `Tap target ${input.width}×${input.height}px below ${level} minimum ${min}×${min}px${input.name ? ` (${input.name})` : ''}`,
    evidence: `${input.width}×${input.height}`,
    file: input.file,
  }];
}

const INTERACTIVE_RE = /<(button|a|input)\b([^>]*)>([\s\S]*?)<\/\1>|<input\b([^>]*)\/?>/gi;

/**
 * Check that interactive elements have an accessible name.
 *
 * @param {{file: string, content: string}} input
 * @returns {HeuristicHit[]}
 */
function checkAriaLabels(input) {
  if (!input || typeof input.content !== 'string') return [];
  const hits = [];
  // Walk lines so we can attach line numbers.
  const lines = input.content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const elementMatches = [...ln.matchAll(/<(button|a|input)\b([^>]*?)(?:\s*\/)?>([^<]*)?/gi)];
    for (const em of elementMatches) {
      const tag = em[1].toLowerCase();
      const attrs = em[2] || '';
      const inner = (em[3] || '').trim();
      const hasAriaLabel = /\baria-labell?e?d?b?y?\s*=/.test(attrs);
      const hasTitle = /\btitle\s*=\s*["'][^"']+["']/.test(attrs);
      const hasAlt = /\balt\s*=\s*["'][^"']+["']/.test(attrs);
      if (tag === 'input') {
        // Inputs with type=submit/button can rely on `value` attr.
        const hasValue = /\bvalue\s*=\s*["'][^"']+["']/.test(attrs);
        if (hasAriaLabel || hasTitle || hasValue) continue;
      } else if (inner.length > 0 || hasAriaLabel || hasTitle || hasAlt) {
        continue;
      }
      hits.push({
        rule_id: 'wcag/4.1.2',
        severity: 'P1',
        summary: `<${tag}> has no accessible name (no text content + no aria-label/title)`,
        evidence: em[0].slice(0, 200),
        line: i + 1,
        file: input.file,
      });
    }
  }
  return hits;
}

module.exports = {
  contrastRatio,
  hexToRgb,
  checkContrast,
  checkTapTarget,
  checkAriaLabels,
};
