'use strict';
// scripts/lib/error-classifier.cjs — GDD-DEPRECATION-SHIM (Plan 31-5-06, SDK-05, D-02).
//
// Thin deprecation shim. The real implementation moved to
// sdk/primitives/error-classifier.cjs in Plan 31-5-04 (SDK consolidation).
// This file is re-created at the OLD path so undocumented EXTERNAL importers
// (anyone who reached into node_modules/@hegemonart/get-design-done/scripts/
// lib/error-classifier.cjs directly) keep working for one minor grace window.
//
// REMOVED IN v1.33.0 (D-02). Grace window: 1.31.5 ships with shims →
// 1.32.0 still has them → 1.33.0 removes them. Internal callers already use
// the sdk/ path (Plan 31-5-04/05) — this shim is external-only and 31-5-10's
// no-stale-internal-refs guard excludes files carrying the GDD-DEPRECATION-SHIM
// marker above.
//
// Emits a DeprecationWarning exactly ONCE per process: the module-level
// `warned` flag plus Node's module cache (this file is evaluated once per
// process regardless of how many times it is required).

let warned = false;
if (!warned) {
  warned = true;
  process.emitWarning(
    'scripts/lib/error-classifier.cjs is deprecated; import sdk/primitives/error-classifier instead. Removed in v1.33.0.',
    'DeprecationWarning',
  );
}

module.exports = require('../../sdk/primitives/error-classifier.cjs');
