/**
 * design-tokens/figma.cjs — parse a Figma variable export JSON into
 * a flat token map (Plan 23-08).
 *
 * Consumes the shape returned by mcp__figma__get_variable_defs (and the
 * official Figma Variables Export JSON). Handles either:
 *   * `{ variableCollections: { <id>: { name, modes, variables: { <id>: {name, valuesByMode} } } } }`
 *   * Already-flattened `{ name: value }` map (passes through with format='figma')
 *
 * Mode handling: when a variable has multiple modes, we emit one token
 * per mode using `<collection>.<varName>.<modeName>`. Single-mode
 * variables emit the bare path.
 *
 * Color values are emitted as `rgba(R, G, B, A)` strings; numeric +
 * string values pass through verbatim.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function rgbaFor(c) {
  if (typeof c !== 'object' || c === null) return String(c);
  const r = Math.round((Number(c.r) || 0) * 255);
  const g = Math.round((Number(c.g) || 0) * 255);
  const b = Math.round((Number(c.b) || 0) * 255);
  const a = c.a === undefined ? 1 : Number(c.a);
  return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

function valueToString(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  if (typeof v === 'object') {
    // Color shape: {r, g, b, a?}.
    if (Object.prototype.hasOwnProperty.call(v, 'r') &&
        Object.prototype.hasOwnProperty.call(v, 'g') &&
        Object.prototype.hasOwnProperty.call(v, 'b')) {
      return rgbaFor(v);
    }
    // Alias / reference — emit the full reference id for the consumer to resolve.
    if (v.type === 'VARIABLE_ALIAS' && v.id) return `var(--${v.id})`;
    return JSON.stringify(v);
  }
  return String(v);
}

/**
 * @param {string} filePath
 * @returns {{tokens: Record<string, string>, source: string, format: 'figma', warnings: string[]}}
 */
function readFigma(filePath) {
  const abs = path.resolve(filePath);
  const raw = fs.readFileSync(abs, 'utf8');
  /** @type {string[]} */
  const warnings = [];
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      tokens: {},
      source: abs,
      format: 'figma',
      warnings: [`json-parse-failed: ${err.message}`],
    };
  }

  /** @type {Record<string, string>} */
  const out = {};
  // Branch 1: variableCollections shape.
  if (parsed && typeof parsed === 'object' && parsed.variableCollections) {
    for (const collId of Object.keys(parsed.variableCollections)) {
      const coll = parsed.variableCollections[collId];
      const collName = coll.name || collId;
      const modes = coll.modes || {};
      // modes might be an array of {modeId, name} or a map.
      const modeNames = Array.isArray(modes)
        ? new Map(modes.map((m) => [m.modeId, m.name]))
        : new Map(Object.entries(modes).map(([id, m]) => [id, (m && m.name) || id]));
      const vars = coll.variables || {};
      for (const varId of Object.keys(vars)) {
        const v = vars[varId];
        const varName = v.name || varId;
        const valuesByMode = v.valuesByMode || {};
        const modeIds = Object.keys(valuesByMode);
        if (modeIds.length === 0) {
          warnings.push(`no-modes: ${collName}.${varName}`);
          continue;
        }
        if (modeIds.length === 1) {
          const key = `${collName}.${varName}`;
          out[key] = valueToString(valuesByMode[modeIds[0]]);
        } else {
          for (const mid of modeIds) {
            const modeName = modeNames.get(mid) || mid;
            out[`${collName}.${varName}.${modeName}`] = valueToString(valuesByMode[mid]);
          }
        }
      }
    }
    return { tokens: out, source: abs, format: 'figma', warnings };
  }

  // Branch 2: already-flattened bag.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const k of Object.keys(parsed)) {
      out[k] = valueToString(parsed[k]);
    }
    return { tokens: out, source: abs, format: 'figma', warnings };
  }

  warnings.push('unrecognised-figma-shape');
  return { tokens: out, source: abs, format: 'figma', warnings };
}

module.exports = { readFigma };
