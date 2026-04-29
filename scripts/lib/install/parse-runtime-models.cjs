'use strict';
/**
 * parse-runtime-models.cjs — pure parser for reference/runtime-models.md.
 *
 * Reads the per-runtime tier→model adapter source-of-truth (Phase 26 D-01..D-03)
 * and returns a structured object with one entry per runtime. Used by:
 *
 *   - scripts/lib/install/installer.cjs (26-03) at install time to emit
 *     `models.json` per runtime config-dir.
 *   - scripts/lib/tier-resolver.cjs (26-02) at runtime to resolve
 *     (runtime, tier) → model.
 *
 * Pure-JS validation against the strict schema at
 * `reference/schemas/runtime-models.schema.json`. No optional dependencies.
 *
 * Public API:
 *   parseRuntimeModels({ cwd? }) → {
 *     runtimes: [{ id, tier_to_model, reasoning_class_to_model, provenance, single_tier? }, ...],
 *     schema_version: 1
 *   }
 *   parseRuntimeModelsFromString(markdown) → same shape
 *
 * Throws an Error with a specific message on the first validation failure
 * (fail-fast: install-time validation catches typos before runtime).
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_PATH = path.join(REPO_ROOT, 'reference', 'runtime-models.md');

// Mirrors scripts/lib/install/runtimes.cjs RUNTIMES list (Phase 24 D-02 lock).
// Re-declared rather than imported to keep this parser dependency-free for
// downstream consumers that may want to call it from outside the install/ tree.
// Round-trip tested by tests/parse-runtime-models.test.cjs against the canonical
// runtimes.cjs list.
const KNOWN_RUNTIME_IDS = Object.freeze([
  'claude',
  'codex',
  'gemini',
  'qwen',
  'kilo',
  'copilot',
  'cursor',
  'windsurf',
  'antigravity',
  'augment',
  'trae',
  'codebuddy',
  'cline',
  'opencode',
]);

const TIER_KEYS = Object.freeze(['opus', 'sonnet', 'haiku']);
const REASONING_CLASS_KEYS = Object.freeze(['high', 'medium', 'low']);

/**
 * Extract every ```json ... ``` fenced block from a markdown string.
 * Returns an array of { raw, lineNumber } objects.
 */
function extractJsonBlocks(markdown) {
  const blocks = [];
  const re = /```json\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    // Compute 1-indexed line number of the fence opening for error messages.
    const lineNumber = markdown.slice(0, m.index).split('\n').length;
    blocks.push({ raw: m[1], lineNumber });
  }
  return blocks;
}

function validateModelRow(row, where) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`${where}: expected object, got ${typeof row}`);
  }
  if (typeof row.model !== 'string' || row.model.length === 0) {
    throw new Error(`${where}: 'model' must be a non-empty string`);
  }
  const allowedKeys = new Set(['model', 'provider_model_id']);
  for (const k of Object.keys(row)) {
    if (!allowedKeys.has(k)) {
      throw new Error(`${where}: unknown key '${k}' (allowed: ${[...allowedKeys].join(', ')})`);
    }
  }
  if (row.provider_model_id !== undefined) {
    if (typeof row.provider_model_id !== 'string' || row.provider_model_id.length === 0) {
      throw new Error(`${where}: 'provider_model_id' must be a non-empty string when present`);
    }
  }
}

function validateProvenance(arr, where) {
  if (!Array.isArray(arr) || arr.length < 1) {
    throw new Error(`${where}: 'provenance' must be a non-empty array`);
  }
  arr.forEach((row, i) => {
    const w = `${where}[${i}]`;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`${w}: expected object`);
    }
    for (const required of ['source_url', 'retrieved_at', 'last_validated_cycle']) {
      if (typeof row[required] !== 'string' || row[required].length === 0) {
        throw new Error(`${w}: '${required}' must be a non-empty string`);
      }
    }
    // ISO-8601 sanity check (Date.parse accepts the canonical form we emit).
    if (Number.isNaN(Date.parse(row.retrieved_at))) {
      throw new Error(`${w}: 'retrieved_at' must be a valid ISO 8601 timestamp (got ${JSON.stringify(row.retrieved_at)})`);
    }
    const allowedKeys = new Set(['source_url', 'retrieved_at', 'last_validated_cycle', 'note']);
    for (const k of Object.keys(row)) {
      if (!allowedKeys.has(k)) {
        throw new Error(`${w}: unknown key '${k}' (allowed: ${[...allowedKeys].join(', ')})`);
      }
    }
    if (row.note !== undefined && typeof row.note !== 'string') {
      throw new Error(`${w}: 'note' must be a string when present`);
    }
  });
}

function validateRuntimeEntry(entry, where) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${where}: expected object`);
  }
  // Required keys
  for (const required of ['id', 'tier_to_model', 'reasoning_class_to_model', 'provenance']) {
    if (!(required in entry)) {
      throw new Error(`${where}: missing required key '${required}'`);
    }
  }
  // id enum check
  if (typeof entry.id !== 'string' || !KNOWN_RUNTIME_IDS.includes(entry.id)) {
    throw new Error(
      `${where}: 'id' must be one of ${KNOWN_RUNTIME_IDS.join('|')} (got ${JSON.stringify(entry.id)})`,
    );
  }
  // No unknown top-level keys
  const allowedKeys = new Set(['id', 'single_tier', 'tier_to_model', 'reasoning_class_to_model', 'provenance']);
  for (const k of Object.keys(entry)) {
    if (!allowedKeys.has(k)) {
      throw new Error(`${where}: unknown key '${k}' (allowed: ${[...allowedKeys].join(', ')})`);
    }
  }
  if (entry.single_tier !== undefined && typeof entry.single_tier !== 'boolean') {
    throw new Error(`${where}: 'single_tier' must be a boolean when present`);
  }

  // tier_to_model: requires opus/sonnet/haiku
  if (!entry.tier_to_model || typeof entry.tier_to_model !== 'object' || Array.isArray(entry.tier_to_model)) {
    throw new Error(`${where}.tier_to_model: expected object`);
  }
  for (const tier of TIER_KEYS) {
    if (!(tier in entry.tier_to_model)) {
      throw new Error(`${where}.tier_to_model: missing required tier '${tier}'`);
    }
  }
  for (const k of Object.keys(entry.tier_to_model)) {
    if (!TIER_KEYS.includes(k)) {
      throw new Error(`${where}.tier_to_model: unknown tier '${k}' (allowed: ${TIER_KEYS.join('|')})`);
    }
    validateModelRow(entry.tier_to_model[k], `${where}.tier_to_model.${k}`);
  }

  // reasoning_class_to_model: requires high/medium/low
  if (!entry.reasoning_class_to_model || typeof entry.reasoning_class_to_model !== 'object' || Array.isArray(entry.reasoning_class_to_model)) {
    throw new Error(`${where}.reasoning_class_to_model: expected object`);
  }
  for (const klass of REASONING_CLASS_KEYS) {
    if (!(klass in entry.reasoning_class_to_model)) {
      throw new Error(`${where}.reasoning_class_to_model: missing required class '${klass}'`);
    }
  }
  for (const k of Object.keys(entry.reasoning_class_to_model)) {
    if (!REASONING_CLASS_KEYS.includes(k)) {
      throw new Error(`${where}.reasoning_class_to_model: unknown class '${k}' (allowed: ${REASONING_CLASS_KEYS.join('|')})`);
    }
    validateModelRow(entry.reasoning_class_to_model[k], `${where}.reasoning_class_to_model.${k}`);
  }

  validateProvenance(entry.provenance, `${where}.provenance`);
}

function parseRuntimeModelsFromString(markdown, sourceLabel) {
  const label = sourceLabel || '<runtime-models markdown>';
  if (typeof markdown !== 'string' || markdown.length === 0) {
    throw new Error(`${label}: empty or non-string input`);
  }

  const blocks = extractJsonBlocks(markdown);
  if (blocks.length < 2) {
    // We expect at least the schema-version block + 1 runtime block.
    throw new Error(`${label}: expected at least one schema-version block and one runtime block, found ${blocks.length} fenced json blocks`);
  }

  // First block MUST be the { "$schema_version": <int> } header.
  let schemaVersion = null;
  let firstParsed;
  try {
    firstParsed = JSON.parse(blocks[0].raw);
  } catch (err) {
    throw new Error(`${label}: first json block (line ${blocks[0].lineNumber}) failed to parse: ${err.message}`);
  }
  if (
    !firstParsed ||
    typeof firstParsed !== 'object' ||
    Array.isArray(firstParsed) ||
    !('$schema_version' in firstParsed) ||
    Object.keys(firstParsed).length !== 1
  ) {
    throw new Error(`${label}: first json block (line ${blocks[0].lineNumber}) must be { "$schema_version": <int> } and nothing else`);
  }
  if (firstParsed.$schema_version !== 1) {
    throw new Error(
      `${label}: $schema_version must be 1 (got ${JSON.stringify(firstParsed.$schema_version)}). Bump the parser when the schema breaks forward.`,
    );
  }
  schemaVersion = firstParsed.$schema_version;

  // Remaining blocks are runtime entries.
  const runtimes = [];
  const seenIds = new Set();
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    let parsed;
    try {
      parsed = JSON.parse(block.raw);
    } catch (err) {
      throw new Error(`${label}: json block at line ${block.lineNumber} failed to parse: ${err.message}`);
    }
    const where = `${label}#runtimes[${i - 1}] (line ${block.lineNumber})`;
    validateRuntimeEntry(parsed, where);
    if (seenIds.has(parsed.id)) {
      throw new Error(`${where}: duplicate runtime id '${parsed.id}' (already seen earlier in the file)`);
    }
    seenIds.add(parsed.id);
    runtimes.push(parsed);
  }

  return { schema_version: schemaVersion, runtimes };
}

function parseRuntimeModels({ cwd } = {}) {
  const filePath = cwd ? path.join(cwd, 'reference', 'runtime-models.md') : DEFAULT_PATH;
  let markdown;
  try {
    markdown = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    const wrapped = new Error(
      `parse-runtime-models: cannot read ${filePath}\n  ${err.message}`,
    );
    wrapped.code = 'EPARSE_RUNTIME_MODELS_READ';
    wrapped.path = filePath;
    throw wrapped;
  }
  return parseRuntimeModelsFromString(markdown, filePath);
}

module.exports = {
  parseRuntimeModels,
  parseRuntimeModelsFromString,
  KNOWN_RUNTIME_IDS,
  TIER_KEYS,
  REASONING_CLASS_KEYS,
};
