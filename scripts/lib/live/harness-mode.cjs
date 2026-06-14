'use strict';
/**
 * scripts/lib/live/harness-mode.cjs — Phase 47 (Live Mode) capability gate.
 *
 * `/hone:live` drives the Claude Preview MCP at runtime (preview_inspect /
 * preview_click / preview_eval / preview_screenshot). That whole loop is only
 * available on a harness whose capability matrix reports `mcp_support: true`.
 * Harnesses without MCP support cannot inject the runtime or read picks back, so
 * live mode degrades to a screenshot-only experience on them.
 *
 * This module is the single source of truth for that gate. It reads the canonical
 * harness record (scripts/lib/manifest/harnesses.cjs, a typed re-export of
 * harnesses.json) and projects each harness onto one of two live-mode strings:
 *
 *   'puppeteer' — full live mode: the harness has mcp_support, the skill probes
 *                 Preview, injects scripts/lib/live/runtime.cjs, and hot-swaps
 *                 variants in place. (Named for the Preview MCP's Playwright /
 *                 puppeteer-class browser driver, not a bundled dependency: there
 *                 is NO bundled puppeteer; the skill drives the MCP.)
 *   'degraded'  — screenshot-only: no mcp_support, so no live injection. The skill
 *                 falls back to generating variants and capturing static
 *                 screenshots, and says so up front.
 *
 * Design constraints (mirror the other scripts/lib/live/* modules):
 *   - Pure, dependency-free apart from the manifest re-export. No fs, no network,
 *     no Date / Math.random. Cross-platform (no path work, no OS calls).
 *   - The harness list is injectable so tests can pass a fixture; it defaults to
 *     the real manifest.
 *
 * Exports:
 *   - liveModeFor(harnessId, harnesses?) -> 'puppeteer' | 'degraded'
 *   - degradedHarnesses(harnesses?)      -> string[] of ids in degraded mode
 *   - isMcpSupported(harnessId, harnesses?) -> boolean
 *   - MODE_FULL / MODE_DEGRADED          -> the two mode string constants
 */

const MODE_FULL = 'puppeteer';
const MODE_DEGRADED = 'degraded';

/** Lazily resolve the default harness list (the typed re-export of harnesses.json). */
function defaultHarnesses() {
  return require('../manifest/harnesses.cjs');
}

/** Find a harness record by id in a list. Returns undefined when absent. */
function findHarness(harnessId, harnesses) {
  const list = Array.isArray(harnesses) ? harnesses : defaultHarnesses();
  return list.find((h) => h && h.id === harnessId);
}

/**
 * True when the named harness reports `capability_matrix.mcp_support === true`.
 * Unknown harness ids and harnesses missing the flag are treated as false (no
 * MCP -> no live injection).
 */
function isMcpSupported(harnessId, harnesses) {
  const h = findHarness(harnessId, harnesses);
  return Boolean(h && h.capability_matrix && h.capability_matrix.mcp_support === true);
}

/**
 * Live mode for a harness: 'puppeteer' when mcp_support is true, else 'degraded'.
 * An unknown harness id degrades (fail safe to screenshot-only).
 *
 * @param {string} harnessId
 * @param {Array=} harnesses  Optional injected list; defaults to the manifest.
 * @returns {'puppeteer'|'degraded'}
 */
function liveModeFor(harnessId, harnesses) {
  return isMcpSupported(harnessId, harnesses) ? MODE_FULL : MODE_DEGRADED;
}

/**
 * The ids of every harness currently in degraded (screenshot-only) live mode,
 * in manifest order.
 *
 * @param {Array=} harnesses  Optional injected list; defaults to the manifest.
 * @returns {string[]}
 */
function degradedHarnesses(harnesses) {
  const list = Array.isArray(harnesses) ? harnesses : defaultHarnesses();
  return list
    .filter((h) => h && h.id && !isMcpSupported(h.id, list))
    .map((h) => h.id);
}

module.exports = {
  liveModeFor,
  degradedHarnesses,
  isMcpSupported,
  MODE_FULL,
  MODE_DEGRADED,
};
