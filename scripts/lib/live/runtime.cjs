'use strict';
/**
 * scripts/lib/live/runtime.cjs — Phase 47 (Live Mode) browser-side runtime.
 *
 * The `/hone:live` skill injects a small browser runtime into the running dev
 * server via the Claude Preview MCP `preview_eval` tool. That runtime does two
 * jobs:
 *
 *   1. PICK — install a one-shot click handler that captures the element the
 *      user clicks and reports `{selector, computedStyle subset, boundingRect,
 *      tagName, classList}` back to the agent (the live_pick payload).
 *   2. SWAP — apply one of the N generated design variants in-place by setting a
 *      `data-hone-variant="N"` attribute on the picked element and applying that
 *      variant's inline style / markup, and read back which variant is live.
 *
 * Why a string and not a real module: `preview_eval` ships a JS source string to
 * the page and evaluates it there. There is no bundler in the loop, so the
 * runtime is authored here as a plain template string (`RUNTIME_JS`) and injected
 * verbatim. The IIFE is idempotent: re-injecting it rebinds the same singleton on
 * `window.__gddLive` rather than stacking duplicate listeners.
 *
 * Design constraints (mirror the other scripts/lib/live/* modules):
 *   - Pure, dependency-free CommonJS. No `fs`, no network, no Date.now() at the
 *     module top level. `buildSelector` is a pure function of its input.
 *   - Cross-platform: this file is plain JS text; nothing here touches the OS.
 *   - Ships in the npm package (scripts/lib/ is in package.json `files`), so it
 *     stays runtime-safe (no dev-only requires).
 *
 * Exports:
 *   - RUNTIME_JS      the browser IIFE source string injected via preview_eval.
 *   - pickReportShape a plain object documenting the live_pick payload fields.
 *   - buildSelector   pure helper a test can assert against (id > data-attr >
 *                     nth-of-type class path), shared with the in-page logic.
 *   - DATA_ATTR       the variant marker attribute name ("data-hone-variant").
 *   - GLOBAL_KEY      the window singleton key ("__gddLive").
 */

/** The attribute the runtime stamps on the picked element to mark the live variant. */
const DATA_ATTR = 'data-hone-variant';

/** The window-singleton key the IIFE installs itself under (idempotent re-inject). */
const GLOBAL_KEY = '__gddLive';

/**
 * Shape of the payload the runtime reports for a pick. Documented here so the
 * skill and the tests agree on the contract without parsing RUNTIME_JS. Values
 * are field descriptions, not live data.
 */
const pickReportShape = {
  selector: 'string — a stable CSS selector for the picked element (see buildSelector)',
  tagName: 'string — lowercased tag name, e.g. "button"',
  classList: 'string[] — the element classList as an array',
  boundingRect: 'object — {x, y, width, height, top, right, bottom, left} from getBoundingClientRect',
  computedStyle:
    'object — a curated subset of getComputedStyle: color, backgroundColor, fontSize, ' +
    'fontWeight, fontFamily, lineHeight, padding, margin, borderRadius, borderColor, ' +
    'borderWidth, display, boxShadow',
  variant: 'number|null — the current data-hone-variant value on the element, or null',
};

/**
 * Pure selector strategy, shared with the in-page runtime by being inlined into
 * RUNTIME_JS below. Strategy, most-specific first:
 *   1. `#id`                        when the element has an id.
 *   2. `[data-testid="..."]`        when a stable data-testid / data-test is present.
 *   3. `tag.class1.class2:nth-of-type(k)` — tag + (up to 2) classes + structural
 *      nth-of-type index among same-tag siblings, for everything else.
 *
 * @param {{id?:string, dataTestId?:string, tagName?:string, classList?:string[], nthOfType?:number}} elInfo
 * @returns {string}
 */
function buildSelector(elInfo) {
  const info = elInfo || {};
  if (info.id) return `#${info.id}`;
  if (info.dataTestId) return `[data-testid="${info.dataTestId}"]`;
  const tag = (info.tagName || 'div').toLowerCase();
  const classes = Array.isArray(info.classList) ? info.classList.filter(Boolean).slice(0, 2) : [];
  const classPart = classes.length ? '.' + classes.join('.') : '';
  const nth = Number.isInteger(info.nthOfType) && info.nthOfType > 0 ? `:nth-of-type(${info.nthOfType})` : '';
  return `${tag}${classPart}${nth}`;
}

/**
 * The browser-side runtime, authored as a plain string. Injected verbatim by the
 * skill via `preview_eval`. The in-page `buildSelector` mirrors the exported one
 * above (kept in sync by the phase-47-runtime test asserting both prefer id over
 * class). The IIFE is idempotent: it reuses window.__gddLive if already present.
 */
const RUNTIME_JS = `
(function () {
  var GLOBAL_KEY = ${JSON.stringify(GLOBAL_KEY)};
  var DATA_ATTR = ${JSON.stringify(DATA_ATTR)};

  // Idempotent: reuse the singleton on re-inject so listeners never stack.
  if (window[GLOBAL_KEY] && window[GLOBAL_KEY].__installed) {
    return window[GLOBAL_KEY];
  }

  // --- pure selector strategy (mirror of runtime.cjs buildSelector) ---
  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + el.id;
    var testId = el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test'));
    if (testId) return '[data-testid="' + testId + '"]';
    var tag = (el.tagName || 'DIV').toLowerCase();
    var classes = [];
    if (el.classList && el.classList.length) {
      for (var i = 0; i < el.classList.length && classes.length < 2; i++) classes.push(el.classList[i]);
    }
    var classPart = classes.length ? '.' + classes.join('.') : '';
    var nth = '';
    if (el.parentNode) {
      var sameTag = [];
      var sibs = el.parentNode.children || [];
      for (var j = 0; j < sibs.length; j++) if (sibs[j].tagName === el.tagName) sameTag.push(sibs[j]);
      if (sameTag.length > 1) {
        var idx = sameTag.indexOf(el) + 1;
        if (idx > 0) nth = ':nth-of-type(' + idx + ')';
      }
    }
    return tag + classPart + nth;
  }

  // --- curated computed-style subset for the pick report ---
  var STYLE_KEYS = [
    'color', 'backgroundColor', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight',
    'padding', 'margin', 'borderRadius', 'borderColor', 'borderWidth', 'display', 'boxShadow'
  ];
  function styleSubset(el) {
    var out = {};
    var cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (!cs) return out;
    for (var i = 0; i < STYLE_KEYS.length; i++) out[STYLE_KEYS[i]] = cs[STYLE_KEYS[i]];
    return out;
  }

  function report(el) {
    var r = el.getBoundingClientRect ? el.getBoundingClientRect() : {};
    var classList = [];
    if (el.classList) for (var i = 0; i < el.classList.length; i++) classList.push(el.classList[i]);
    var v = el.getAttribute(DATA_ATTR);
    return {
      selector: buildSelector(el),
      tagName: (el.tagName || '').toLowerCase(),
      classList: classList,
      boundingRect: {
        x: r.x, y: r.y, width: r.width, height: r.height,
        top: r.top, right: r.right, bottom: r.bottom, left: r.left
      },
      computedStyle: styleSubset(el),
      variant: v == null ? null : Number(v)
    };
  }

  var state = {
    __installed: true,
    picked: null,          // last picked element
    lastReport: null,      // last pick report (read by the agent after a click)
    originals: new WeakMap() // element -> {style, html} captured before first swap
  };

  // --- PICK: one-shot capture click handler ---
  function onPick(ev) {
    var el = ev.target;
    if (!el || el.nodeType !== 1) return;
    ev.preventDefault();
    ev.stopPropagation();
    state.picked = el;
    state.lastReport = report(el);
    document.removeEventListener('click', onPick, true);
    state.picking = false;
    return state.lastReport;
  }
  state.pick = function () {
    state.picking = true;
    document.addEventListener('click', onPick, true);
    return true;
  };
  state.getLastPick = function () { return state.lastReport; };

  // --- SWAP: apply / read a variant on the picked (or given) element ---
  function captureOriginal(el) {
    if (!state.originals.has(el)) {
      state.originals.set(el, { style: el.getAttribute('style'), html: el.innerHTML });
    }
  }
  // variant = {n:Number, style?:Object, html?:String}
  state.swapVariant = function (variant, el) {
    var target = el || state.picked;
    if (!target || !variant) return null;
    captureOriginal(target);
    target.setAttribute(DATA_ATTR, String(variant.n));
    if (variant.style && typeof variant.style === 'object') {
      for (var k in variant.style) if (Object.prototype.hasOwnProperty.call(variant.style, k)) {
        target.style[k] = variant.style[k];
      }
    }
    if (typeof variant.html === 'string') target.innerHTML = variant.html;
    return Number(target.getAttribute(DATA_ATTR));
  };
  state.currentVariant = function (el) {
    var target = el || state.picked;
    if (!target) return null;
    var v = target.getAttribute(DATA_ATTR);
    return v == null ? null : Number(v);
  };
  state.revert = function (el) {
    var target = el || state.picked;
    if (!target) return false;
    var orig = state.originals.get(target);
    if (orig) {
      if (orig.style == null) target.removeAttribute('style'); else target.setAttribute('style', orig.style);
      target.innerHTML = orig.html;
    }
    target.removeAttribute(DATA_ATTR);
    return true;
  };

  // expose the pure helper for assertions / debugging
  state.buildSelector = buildSelector;

  window[GLOBAL_KEY] = state;
  return state;
})();
`;

module.exports = {
  RUNTIME_JS,
  pickReportShape,
  buildSelector,
  DATA_ATTR,
  GLOBAL_KEY,
};
