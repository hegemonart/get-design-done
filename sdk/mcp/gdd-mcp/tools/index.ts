// sdk/mcp/gdd-mcp/tools/index.ts
//
// Tool registry for `gdd-mcp`. Plan 27.7-02 populated this with 12 read-only
// tools. Phase 52 (DesignContext keystone, D5) adds a 13th read-only tool
// (`gdd_context_query`) and bumps the cap 12 -> 13. The cap is D-03 (hard);
// enforced at module load by a runtime check + by tests in Plan 27.7-03.
//
// Convention (mirrors Phase 20 `gdd-state`):
//   - Each tool exports `name`, `schemaPath`, and `handle` from its own
//     module (e.g. `./gdd_status.ts`).
//   - `schemaPath` is relative to THIS file's directory and points into
//     `sdk/mcp/gdd-mcp/schemas/`. Server.ts joins it
//     against `<baseDir>/tools/` to load the Draft-07 JSON.
//   - `TOOL_MODULES` is the canonical registry — server.ts iterates it
//     once at startup to populate the dispatch map.

import type { ToolResponse } from './shared.ts';

import * as gdd_context_query from './gdd_context_query.ts';
import * as gdd_cycle_recap from './gdd_cycle_recap.ts';
import * as gdd_decisions_list from './gdd_decisions_list.ts';
import * as gdd_events_tail from './gdd_events_tail.ts';
import * as gdd_health from './gdd_health.ts';
import * as gdd_intel_get from './gdd_intel_get.ts';
import * as gdd_learnings_digest from './gdd_learnings_digest.ts';
import * as gdd_phase_current from './gdd_phase_current.ts';
import * as gdd_phases_list from './gdd_phases_list.ts';
import * as gdd_plans_list from './gdd_plans_list.ts';
import * as gdd_reflections_latest from './gdd_reflections_latest.ts';
import * as gdd_status from './gdd_status.ts';
import * as gdd_telemetry_query from './gdd_telemetry_query.ts';

export interface ToolModule {
  /** Public tool name exposed via MCP (e.g. "gdd_status"). */
  name: string;
  /** Path to the input/output Draft-07 JSON Schema, relative to this
   *  module's directory. Per-tool entries under `../schemas/`. */
  schemaPath: string;
  /** Executes the tool. Never throws — always returns a ToolResponse. */
  handle: (input: unknown) => Promise<ToolResponse>;
}

/**
 * Canonical tool registry. 13 tools (D-03 cap, raised 12 -> 13 in Phase 52
 * for the read-only `gdd_context_query` DesignContext surface, D5). Order is
 * alphabetical (after `gdd_status` which leads as the canonical entry).
 * All tools are advertised equivalently in `tools/list`.
 */
export const TOOL_MODULES: readonly ToolModule[] = [
  gdd_status,
  gdd_context_query,
  gdd_cycle_recap,
  gdd_decisions_list,
  gdd_events_tail,
  gdd_health,
  gdd_intel_get,
  gdd_learnings_digest,
  gdd_phase_current,
  gdd_phases_list,
  gdd_plans_list,
  gdd_reflections_latest,
  gdd_telemetry_query,
] as const;

/** Canonical count. The cap is 13 (raised from 12 in Phase 52) — if you add a
 *  tool past that bound, update the plan, the combined schema, and the lint
 *  test (Plan 27.7-03). */
export const TOOL_COUNT: number = TOOL_MODULES.length;

// Module-load runtime assertion of the 13-tool cap (D-03, raised from 12 in
// Phase 52). A compile-time type guard is fragile against `readonly
// ToolModule[]` (the length type widens to `number`); the runtime check is
// cheap, deterministic, and fails fast on server boot if the registry ever
// drifts past the cap.
if (TOOL_COUNT > 13) {
  throw new Error(
    `gdd-mcp: TOOL_COUNT=${TOOL_COUNT} exceeds the 13-tool cap (D-03, raised ` +
      'from 12 in Phase 52). Adding a tool past 13 requires re-scoping in a new plan.',
  );
}
