'use strict';
/**
 * parse-contract.cjs — shared helper for validating agent output contracts.
 *
 * Agents that emit structured JSON blocks (e.g. motion-mapper) use this helper
 * to validate and extract the structured data from their output. Works without
 * optional dependencies: pure-JS JSON schema validation for the motion-map contract.
 *
 * Usage:
 *   const { parseMotionMap, validate } = require('./parse-contract.cjs');
 *   const result = parseMotionMap(markdownString);
 *   if (result.ok) console.log(result.data);
 *   else console.error(result.error);
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// JSON block extraction
// ---------------------------------------------------------------------------

/**
 * Extract the first ```json ... ``` fenced block from a markdown string.
 * Returns { ok: true, raw: string } or { ok: false, error: string }.
 */
function extractJsonBlock(markdown) {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) {
    return { ok: false, error: 'No ```json ... ``` block found in output' };
  }
  return { ok: true, raw: match[1] };
}

/**
 * Parse a JSON string. Returns { ok: true, data } or { ok: false, error }.
 */
function parseJson(raw) {
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `JSON parse error: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Motion map contract validation (hand-written — no ajv dependency required)
// ---------------------------------------------------------------------------

const VALID_EASINGS = new Set([
  'linear',
  'quad', 'quad-in', 'quad-out', 'quad-in-out',
  'cubic', 'cubic-in', 'cubic-out', 'cubic-in-out',
  'poly', 'poly-in', 'poly-out', 'poly-in-out',
  'sin', 'sin-in', 'sin-out', 'sin-in-out',
  'circle', 'circle-in', 'circle-out', 'circle-in-out',
  'exp', 'exp-in', 'exp-out', 'exp-in-out',
  'elastic', 'elastic-in', 'elastic-out', 'elastic-in-out',
  'back', 'back-in', 'back-out', 'back-in-out',
  'bounce', 'bounce-in', 'bounce-out', 'bounce-in-out',
  'bezier',
]);

const VALID_TRANSITION_FAMILIES = new Set([
  '3d', 'blur', 'cover', 'destruction', 'dissolve', 'distortion', 'grid', 'light',
]);

const VALID_DURATION_CLASSES = new Set([
  'instant', 'quick', 'standard', 'slow', 'narrative',
]);

const VALID_TRIGGERS = new Set([
  'user-gesture', 'state-change', 'scroll-progress', 'time', 'loop',
]);

/**
 * Validate a single AnimationBinding object.
 * Returns an array of error strings (empty = valid).
 */
function validateBinding(binding, index) {
  const errors = [];
  const ctx = `animations[${index}]`;

  if (typeof binding.id !== 'string' || !binding.id) {
    errors.push(`${ctx}.id: required string`);
  }
  if (!binding.location || typeof binding.location.file !== 'string' || typeof binding.location.line !== 'number') {
    errors.push(`${ctx}.location: required {file: string, line: number}`);
  }

  // Easing: either a canonical string or a custom object
  const easing = binding.easing;
  if (easing === undefined || easing === null) {
    errors.push(`${ctx}.easing: required`);
  } else if (typeof easing === 'string') {
    if (!VALID_EASINGS.has(easing)) {
      errors.push(`${ctx}.easing: "${easing}" is not a canonical easing. Use one of: ${[...VALID_EASINGS].join(', ')} — or use { type: "custom", justification: "..." }`);
    }
  } else if (typeof easing === 'object') {
    if (easing.type !== 'custom') {
      errors.push(`${ctx}.easing.type: must be "custom" for object form`);
    }
    if (typeof easing.justification !== 'string' || !easing.justification.trim()) {
      errors.push(`${ctx}.easing.justification: required non-empty string when using custom easing`);
    }
  } else {
    errors.push(`${ctx}.easing: must be string (canonical name) or object { type: "custom", justification, value? }`);
  }

  // transition_family: optional, but if present must be valid
  if (binding.transition_family !== undefined) {
    if (!VALID_TRANSITION_FAMILIES.has(binding.transition_family)) {
      errors.push(`${ctx}.transition_family: "${binding.transition_family}" is not a valid family. Use one of: ${[...VALID_TRANSITION_FAMILIES].join(', ')}`);
    }
  }

  // duration_class: required
  if (!VALID_DURATION_CLASSES.has(binding.duration_class)) {
    errors.push(`${ctx}.duration_class: required, must be one of: ${[...VALID_DURATION_CLASSES].join(', ')}`);
  }

  // trigger: required
  if (!VALID_TRIGGERS.has(binding.trigger)) {
    errors.push(`${ctx}.trigger: required, must be one of: ${[...VALID_TRIGGERS].join(', ')}`);
  }

  return errors;
}

/**
 * Validate a parsed motion-map object against the contract.
 * Returns { ok: true, data } or { ok: false, errors: string[] }.
 */
function validateMotionMap(data) {
  const errors = [];

  if (data.schema_version !== '1.0.0') {
    errors.push(`schema_version: must be "1.0.0", got "${data.schema_version}"`);
  }
  if (typeof data.generated_at !== 'string') {
    errors.push('generated_at: required ISO-8601 string');
  }
  if (!Array.isArray(data.animations)) {
    errors.push('animations: required array');
  } else {
    data.animations.forEach((b, i) => {
      errors.push(...validateBinding(b, i));
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract, parse, and validate a motion-map JSON block from agent output markdown.
 *
 * @param {string} markdown - Full markdown output from motion-mapper
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function parseMotionMap(markdown) {
  const extracted = extractJsonBlock(markdown);
  if (!extracted.ok) return { ok: false, error: extracted.error };

  const parsed = parseJson(extracted.raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const validated = validateMotionMap(parsed.data);
  if (!validated.ok) {
    return {
      ok: false,
      error: `Motion map contract violations:\n${validated.errors.map(e => `  - ${e}`).join('\n')}`,
    };
  }

  return { ok: true, data: validated.data };
}

/**
 * Generic JSON block extractor and parser (no schema validation).
 * Use for contracts without a built-in validator.
 */
function parseGenericContract(markdown) {
  const extracted = extractJsonBlock(markdown);
  if (!extracted.ok) return { ok: false, error: extracted.error };
  return parseJson(extracted.raw);
}

/**
 * Load the motion-map JSON schema from the reference directory.
 * Used by external validators (e.g., ajv if available).
 */
function loadMotionMapSchema(projectRoot) {
  const schemaPath = path.join(
    projectRoot || process.cwd(),
    'reference/output-contracts/motion-map.schema.json',
  );
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

module.exports = {
  parseMotionMap,
  parseGenericContract,
  loadMotionMapSchema,
  validateMotionMap,
  extractJsonBlock,
  parseJson,
  // Exported for testing
  _validateBinding: validateBinding,
  VALID_EASINGS,
  VALID_TRANSITION_FAMILIES,
  VALID_DURATION_CLASSES,
  VALID_TRIGGERS,
};
