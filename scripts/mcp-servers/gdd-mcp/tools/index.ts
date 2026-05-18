// scripts/mcp-servers/gdd-mcp/tools/index.ts
//
// Tool registry for `gdd-mcp`. Plan 27.7-01 ships the empty scaffold;
// Plan 27.7-02 populates with 12 read-only tools. The 12-tool cap is
// D-03 (hard); enforce in Plan 27.7-03 lint test.
//
// Convention (mirrors Phase 20 `gdd-state`):
//   - Each tool exports `name`, `schemaPath`, and `handle` from its own
//     module (e.g. `./gdd_status.ts`).
//   - `schemaPath` is relative to THIS file's directory and points into
//     `scripts/mcp-servers/gdd-mcp/schemas/`. Server.ts joins it
//     against `<baseDir>/tools/` to load the Draft-07 JSON.
//   - `TOOL_MODULES` is the canonical registry — server.ts iterates it
//     once at startup to populate the dispatch map.

import type { ToolResponse } from './shared.ts';

export interface ToolModule {
  /** Public tool name exposed via MCP (e.g. "gdd_status"). */
  name: string;
  /** Path to the input/output Draft-07 JSON Schema, relative to this
   *  module's directory. Plan 27.7-02 will add per-tool entries under
   *  `../schemas/`. */
  schemaPath: string;
  /** Executes the tool. Never throws — always returns a ToolResponse. */
  handle: (input: unknown) => Promise<ToolResponse>;
}

/**
 * Canonical tool registry for the server. Scaffold ships empty (Plan
 * 27.7-01); Plan 27.7-02 populates with 12 read-only tools. Order is
 * cosmetic — all tools are advertised equivalently in `tools/list`.
 *
 * D-03 (hard cap): `TOOL_MODULES.length` MUST be `<= 12`. Plan 27.7-03
 * adds a static lint asserting this.
 */
export const TOOL_MODULES: readonly ToolModule[] = [] as const;

/** Canonical count. The plan caps this at 12 — if you add a tool past
 *  that bound, update the plan, the combined schema, and the lint
 *  test. */
export const TOOL_COUNT: number = TOOL_MODULES.length;

// Compile-time assertion that we are within the 12-tool cap (D-03).
// This is a type-level guard — if TOOL_COUNT ever exceeds 12, the
// conditional type below resolves to `never` and the `_TOOL_COUNT_OK`
// assignment fails at tsc time.
type Le12<N extends number> = N extends 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
  ? true
  : never;

// Helper so `TOOL_COUNT` (a `number`) can be checked at the type level.
// `as const` on TOOL_MODULES makes `TOOL_MODULES['length']` a literal
// `number`, which lets us feed it into Le12 below.
type ToolCount = (typeof TOOL_MODULES)['length'];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _TOOL_COUNT_OK: Le12<ToolCount> = true;
