// scripts/lib/graph/schema.mjs — Plan 30.6-02 Task 1
//
// Ajv-compiled validator factory for .design/graph/graph.json (schema 1.0,
// frozen at Phase 30.6 per D-03). Compile-once + memoized so callers can
// invoke compileValidator() liberally without paying per-call cost.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read schema via fs.readFileSync rather than `import ... with { type:'json' }`
// to keep this working on Node 22+ without flag tweaks across runtimes.
const schemaJson = JSON.parse(
  readFileSync(join(__dirname, 'schema.json'), 'utf8'),
);

export const SCHEMA_VERSION = '1.0';
export const SCHEMA = schemaJson;

let _validator = null;

/**
 * Returns a compiled Ajv validator function for the native graph schema.
 * Memoized: subsequent calls return the same instance (no recompile).
 *
 * Strict mode is disabled so additionalProperties:true on nodes/edges is
 * honored (forward-compat lenience per 30.6-01 RESEARCH.md).
 *
 * @returns {(payload: unknown) => boolean} validator with .errors after a failed call
 */
export function compileValidator() {
  if (_validator) return _validator;
  // Ajv ESM: the default export is the constructor.
  const AjvCtor = Ajv.default || Ajv;
  const ajv = new AjvCtor({ strict: false, allErrors: true });
  _validator = ajv.compile(schemaJson);
  return _validator;
}

// Test-only hook: reset the memo so test runs can verify compile-once semantics
// without polluting other suites. Not part of the public CLI surface.
export function _resetValidatorMemoForTests() {
  _validator = null;
}
