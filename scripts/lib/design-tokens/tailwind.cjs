/**
 * design-tokens/tailwind.cjs — extract tokens from a Tailwind config
 * (Plan 23-08).
 *
 * Reuses the js-const subprocess harness to evaluate the config (which
 * may be CJS or ESM, plain JS or .ts via type-strip), then walks
 * `theme` + `theme.extend` into a flat token map keyed by
 * `<scale>.<key>` (e.g. `colors.brand.500`, `spacing.4`).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HARNESS_PATH = path.join(__dirname, '_js-harness.cjs');

function flatten(val, prefix, out) {
  if (val === null || val === undefined) return;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    out[prefix] = String(val);
    return;
  }
  if (Array.isArray(val)) {
    out[prefix] = JSON.stringify(val);
    return;
  }
  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flatten(val[k], next, out);
    }
  }
}

/**
 * Read a Tailwind config. Prefers `theme.extend` over base `theme` for
 * each scale (matching Tailwind merge semantics: extend extends).
 *
 * @param {string} filePath
 * @returns {{tokens: Record<string, string>, source: string, format: 'tailwind', warnings: string[]}}
 */
function readTailwind(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`tailwind: file not found: ${abs}`);
  }
  const r = spawnSync(process.execPath, [HARNESS_PATH, abs], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  /** @type {string[]} */
  const warnings = [];
  if (r.status !== 0) {
    return {
      tokens: {},
      source: abs,
      format: 'tailwind',
      warnings: [`harness-exit-${r.status}: ${(r.stderr || '').slice(0, 400)}`],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    return {
      tokens: {},
      source: abs,
      format: 'tailwind',
      warnings: [`harness-output-parse-failed: ${err.message}`],
    };
  }
  if (parsed.error) warnings.push(parsed.error);
  /** @type {Record<string, string>} */
  const out = {};
  const config = parsed.tokens ?? {};
  // The harness returns the module exports (or `tokens` field). Tailwind
  // configs export an object with a `theme` field. Some configs export
  // `{theme, plugins, …}` directly.
  const theme = config.theme || config;
  // Base theme.
  if (theme && typeof theme === 'object') {
    for (const scale of Object.keys(theme)) {
      if (scale === 'extend') continue;
      flatten(theme[scale], scale, out);
    }
  }
  // theme.extend overrides per-scale.
  if (theme && theme.extend && typeof theme.extend === 'object') {
    for (const scale of Object.keys(theme.extend)) {
      flatten(theme.extend[scale], scale, out);
    }
  }
  return { tokens: out, source: abs, format: 'tailwind', warnings };
}

module.exports = { readTailwind };
