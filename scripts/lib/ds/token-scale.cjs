'use strict';
/**
 * scripts/lib/ds/token-scale.cjs — Phase 37.2 greenfield token-scale generator.
 *
 * Pure + dep-free (D-01): zero `require`, no color-conversion library. Emits native CSS
 * `oklch(L C H)` strings — modern browsers render OKLCH directly, so no OKLab→sRGB→hex
 * conversion is needed. Deterministic: same input → byte-identical output (hermetic tests).
 *
 * - oklchScale(primary, opts?)  → 9 tint/shade stops {stop, oklch}, anchored at the primary,
 *     interpolating lightness toward white/black and damping chroma at the extremes.
 * - typeScale(baseRem, ratio, steps?) → a modular type scale {step, rem}.
 * - spacingScale(basePx, count?)      → a 4pt/8pt geometric spacing scale (px).
 * - radiusScale(basePx?)              → sm/md/lg/xl/full radii (px / 9999 for full).
 */

const round = (n, d) => {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
};

const DEFAULT_STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/**
 * oklchScale({ l, c, h }, opts) — l ∈ 0..1 (lightness), c ∈ 0..~0.4 (chroma), h ∈ 0..360 (hue).
 * Anchors the `anchorStop` (default 500) at the primary, then interpolates L toward `lLight`
 * for lighter stops and `lDark` for darker stops, damping chroma toward the extremes.
 */
function oklchScale(primary, opts = {}) {
  const { l, c, h } = primary || {};
  if (typeof l !== 'number' || typeof c !== 'number' || typeof h !== 'number') {
    throw new TypeError('oklchScale: primary must be { l:number, c:number, h:number }');
  }
  const stops = opts.stops || DEFAULT_STOPS;
  const anchor = opts.anchorStop || 500;
  const lLight = opts.lLight != null ? opts.lLight : 0.97;
  const lDark = opts.lDark != null ? opts.lDark : 0.22;
  const i500 = stops.indexOf(anchor) === -1 ? Math.floor(stops.length / 2) : stops.indexOf(anchor);

  return stops.map((stop, i) => {
    let L;
    let C;
    if (i === i500) {
      L = l; C = c;
    } else if (i < i500) {
      const t = (i500 - i) / i500;                 // 0..1 toward the lightest stop
      L = l + (lLight - l) * t;
      C = c * (1 - 0.75 * t);                       // damp chroma toward white
    } else {
      const t = (i - i500) / (stops.length - 1 - i500); // 0..1 toward the darkest stop
      L = l + (lDark - l) * t;
      C = c * (1 - 0.45 * t);                       // damp chroma toward black (less than toward white)
    }
    return { stop, oklch: `oklch(${round(L, 3)} ${round(Math.max(C, 0), 4)} ${round(h, 2)})` };
  });
}

/**
 * typeScale(baseRem, ratio, steps) — a modular scale. Returns `steps.length` entries,
 * each `{ step, rem }` with rem = baseRem * ratio^step (step 0 = base). Default steps -1..5.
 */
function typeScale(baseRem = 1, ratio = 1.25, steps = [-1, 0, 1, 2, 3, 4, 5]) {
  if (!(baseRem > 0) || !(ratio > 1)) throw new TypeError('typeScale: baseRem > 0 and ratio > 1 required');
  return steps.map((step) => ({ step, rem: round(baseRem * Math.pow(ratio, step), 3) }));
}

/**
 * spacingScale(basePx, count) — a geometric spacing scale off a 4pt/8pt baseline.
 * Returns `count` entries `{ step, px }` following the standard [1,2,3,4,6,8,12,16,...] multiples.
 */
function spacingScale(basePx = 4, count = 8) {
  if (![4, 8].includes(basePx)) throw new RangeError('spacingScale: basePx must be 4 or 8 (a 4pt/8pt baseline)');
  const mult = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  return mult.slice(0, count).map((m, i) => ({ step: i + 1, px: basePx * m }));
}

/** radiusScale(basePx) — sm/md/lg/xl/full. full = 9999 (pill). */
function radiusScale(basePx = 8) {
  if (!(basePx > 0)) throw new TypeError('radiusScale: basePx > 0 required');
  return {
    sm: round(basePx / 2, 2),
    md: basePx,
    lg: basePx * 2,
    xl: basePx * 3,
    full: 9999,
  };
}

module.exports = { oklchScale, typeScale, spacingScale, radiusScale, DEFAULT_STOPS };
