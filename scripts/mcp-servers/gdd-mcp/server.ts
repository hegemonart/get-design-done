// scripts/mcp-servers/gdd-mcp/server.ts — GDD-DEPRECATION-SHIM (Plan 31-5-06, SDK-05, D-02).
//
// Thin deprecation shim. The real MCP `gdd-mcp` server moved to
// sdk/mcp/gdd-mcp/server.ts in Plan 31-5-05 (SDK consolidation, D-08). This
// file is re-created at the OLD path so undocumented EXTERNAL importers /
// invokers (anyone who reached into node_modules/@hegemonart/get-design-done/
// scripts/mcp-servers/gdd-mcp/server.ts directly) keep working for one minor
// grace window.
//
// REMOVED IN v1.33.0 (D-02). Grace window: 1.31.5 ships with shims →
// 1.32.0 still has them → 1.33.0 removes them. The canonical invocation is
// now the `bin/gdd-mcp` trampoline (Plan 31-5-05); internal callers already
// use the sdk/ path. This shim is external-only; 31-5-10's
// no-stale-internal-refs guard excludes files carrying the
// GDD-DEPRECATION-SHIM marker above.
//
// Re-exporting the sdk/ server keeps the library surface (buildServer,
// runStdio, SERVER_NAME, SERVER_VERSION, TOOL_DESCRIPTIONS, TOOL_READONLY)
// reachable via the old path. The sdk/ server's own isMain() entry guard
// keys off process.argv[1] ending with its own sdk/ path, so a re-export
// does NOT auto-start the server — direct execution should go through the
// bin trampoline. Runs under --experimental-strip-types.

import { emitWarning } from 'node:process';

let warned = false;
if (!warned) {
  warned = true;
  emitWarning(
    'scripts/mcp-servers/gdd-mcp/server.ts is deprecated; use the bin/gdd-mcp trampoline or import sdk/mcp/gdd-mcp instead. Removed in v1.33.0.',
    'DeprecationWarning',
  );
}

export * from '../../../sdk/mcp/gdd-mcp/server.ts';
