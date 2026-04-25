/**
 * design-tokens/index.cjs — facade over the four token readers
 * (Plan 23-08).
 *
 * Auto-detects format from extension + content sniff, dispatches to
 * css-vars / js-const / tailwind / figma. Returns the uniform
 * `{tokens, source, format, warnings}` shape from each reader.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readCssVars } = require('./css-vars.cjs');
const { readJsConst } = require('./js-const.cjs');
const { readTailwind } = require('./tailwind.cjs');
const { readFigma } = require('./figma.cjs');

/**
 * @typedef {Object} TokenSet
 * @property {Object<string, string>} tokens
 * @property {string} source
 * @property {'css-vars'|'js-const'|'tailwind'|'figma'} format
 * @property {string[]} [warnings]
 */

/**
 * Sniff format from a file's extension + a head-snippet of its content.
 *
 * @param {string} filePath
 * @returns {'css-vars'|'js-const'|'tailwind'|'figma'}
 */
function detectFormat(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css-vars';
  if (
    /tailwind\.config\.(js|cjs|mjs|ts)$/.test(lower) ||
    lower.endsWith('tailwind.config.js')
  ) {
    return 'tailwind';
  }
  if (lower.endsWith('.json')) {
    // Sniff: variableCollections → figma, else js-const path with the JSON.
    try {
      const head = fs.readFileSync(filePath, 'utf8').slice(0, 4096);
      if (head.includes('"variableCollections"')) return 'figma';
    } catch {
      /* fall through */
    }
    return 'figma';
  }
  // Default: any other JS/TS file is js-const.
  return 'js-const';
}

/**
 * Read tokens from a file with auto-detected format.
 *
 * @param {string} filePath
 * @returns {TokenSet}
 */
function read(filePath) {
  const format = detectFormat(filePath);
  switch (format) {
    case 'css-vars':
      return readCssVars(filePath);
    case 'tailwind':
      return readTailwind(filePath);
    case 'figma':
      return readFigma(filePath);
    case 'js-const':
    default:
      return readJsConst(filePath);
  }
}

/**
 * Read multiple files into separate TokenSets.
 *
 * @param {string[]} filePaths
 * @returns {TokenSet[]}
 */
function readAll(filePaths) {
  if (!Array.isArray(filePaths)) {
    throw new TypeError('design-tokens: filePaths must be an array');
  }
  return filePaths.map((p) => read(p));
}

module.exports = {
  read,
  readAll,
  detectFormat,
  // re-export for callers that already know the format
  readCssVars,
  readJsConst,
  readTailwind,
  readFigma,
};
