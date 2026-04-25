/**
 * design-tokens/css-vars.cjs — extract custom-property declarations
 * from CSS / SCSS source (Plan 23-08).
 *
 * Parses any `--name: value;` declarations regardless of selector
 * context. Last-write-wins on duplicate names. Block comments stripped.
 * Strips the `--` prefix in the returned token map.
 *
 * Not supported (caller-warned via warnings):
 *   * SCSS `$var: value;` syntax — use the JS reader for SCSS exports
 *   * calc() / var() reference resolution — values returned verbatim
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CUSTOM_PROP_RE = /--([A-Za-z0-9][A-Za-z0-9_-]*)\s*:\s*([^;]+?)\s*(?=[;}])/g;
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const SCSS_VAR_RE = /^\s*\$[A-Za-z][A-Za-z0-9_-]*\s*:/m;

/**
 * Read a CSS/SCSS file and extract `--token: value;` declarations.
 *
 * @param {string} filePath
 * @returns {{tokens: Record<string, string>, source: string, format: 'css-vars', warnings: string[]}}
 */
function readCssVars(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  const stripped = raw.replace(BLOCK_COMMENT_RE, '');
  /** @type {string[]} */
  const warnings = [];
  if (SCSS_VAR_RE.test(stripped)) {
    warnings.push('scss-vars-detected: $var: ... declarations are not parsed by css-vars.cjs');
  }
  /** @type {Record<string, string>} */
  const tokens = {};
  CUSTOM_PROP_RE.lastIndex = 0;
  let m;
  while ((m = CUSTOM_PROP_RE.exec(stripped)) !== null) {
    const name = m[1];
    const value = m[2].trim();
    tokens[name] = value;
  }
  return {
    tokens,
    source: abs,
    format: 'css-vars',
    warnings,
  };
}

module.exports = { readCssVars };
