// scripts/lib/event-stream/index.ts — GDD-DEPRECATION-SHIM (Plan 31-5-06, SDK-05, D-02).
//
// Thin deprecation shim. The real implementation moved to
// sdk/event-stream/index.ts in Plan 31-5-04 (SDK consolidation). This file
// is re-created at the OLD path so undocumented EXTERNAL importers (anyone
// who reached into node_modules/@hegemonart/get-design-done/scripts/lib/
// event-stream/index.ts directly) keep working for one minor grace window.
//
// REMOVED IN v1.33.0 (D-02). Grace window: 1.31.5 ships with shims →
// 1.32.0 still has them → 1.33.0 removes them. Internal callers already use
// the sdk/ path (Plan 31-5-04/05) — this shim is external-only; 31-5-10's
// no-stale-internal-refs guard excludes files carrying the
// GDD-DEPRECATION-SHIM marker above.
//
// Runs under --experimental-strip-types, so `export *` re-export is
// strip-types-clean.

import { emitWarning } from 'node:process';

let warned = false;
if (!warned) {
  warned = true;
  emitWarning(
    'scripts/lib/event-stream/index.ts is deprecated; import sdk/event-stream instead. Removed in v1.33.0.',
    'DeprecationWarning',
  );
}

export * from '../../../sdk/event-stream/index.ts';
