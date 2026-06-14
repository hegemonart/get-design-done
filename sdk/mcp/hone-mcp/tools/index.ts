// sdk/mcp/hone-mcp/tools/index.ts
//
// Tool registry for `hone-mcp`. Plan 27.7-02 populated this with 12 read-only
// tools. Phase 52 (DesignContext keystone, D5) adds a 13th read-only tool
// (`hone_context_query`) and bumps the cap 12 -> 13. The cap is D-03 (hard);
// enforced at module load by a runtime check + by tests in Plan 27.7-03.
//
// Convention (mirrors Phase 20 `hone-state`):
//   - Each tool exports `name`, `schemaPath`, and `handle` from its own
//     module (e.g. `./hone_status.ts`).
//   - `schemaPath` is relative to THIS file's directory and points into
//     `sdk/mcp/hone-mcp/schemas/`. Server.ts joins it
//     against `<baseDir>/tools/` to load the Draft-07 JSON.
//   - `TOOL_MODULES` is the canonical registry — server.ts iterates it
//     once at startup to populate the dispatch map.

import type { ToolResponse } from './shared.ts';

import * as hone_context_query from './hone_context_query.ts';
import * as hone_cycle_recap from './hone_cycle_recap.ts';
import * as hone_decisions_list from './hone_decisions_list.ts';
import * as hone_events_tail from './hone_events_tail.ts';
import * as hone_health from './hone_health.ts';
import * as hone_intel_get from './hone_intel_get.ts';
import * as hone_learnings_digest from './hone_learnings_digest.ts';
import * as hone_phase_current from './hone_phase_current.ts';
import * as hone_phases_list from './hone_phases_list.ts';
import * as hone_plans_list from './hone_plans_list.ts';
import * as hone_reflections_latest from './hone_reflections_latest.ts';
import * as hone_status from './hone_status.ts';
import * as hone_telemetry_query from './hone_telemetry_query.ts';

export interface ToolModule {
  /** Public tool name exposed via MCP (e.g. "hone_status"). */
  name: string;
  /** Path to the input/output Draft-07 JSON Schema, relative to this
   *  module's directory. Per-tool entries under `../schemas/`. */
  schemaPath: string;
  /** Executes the tool. Never throws — always returns a ToolResponse. */
  handle: (input: unknown) => Promise<ToolResponse>;
}

/**
 * Canonical tool registry. 13 tools (D-03 cap, raised 12 -> 13 in Phase 52
 * for the read-only `hone_context_query` DesignContext surface, D5). Order is
 * alphabetical (after `hone_status` which leads as the canonical entry).
 * All tools are advertised equivalently in `tools/list`.
 */
export const TOOL_MODULES: readonly ToolModule[] = [
  hone_status,
  hone_context_query,
  hone_cycle_recap,
  hone_decisions_list,
  hone_events_tail,
  hone_health,
  hone_intel_get,
  hone_learnings_digest,
  hone_phase_current,
  hone_phases_list,
  hone_plans_list,
  hone_reflections_latest,
  hone_telemetry_query,
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
    `hone-mcp: TOOL_COUNT=${TOOL_COUNT} exceeds the 13-tool cap (D-03, raised ` +
      'from 12 in Phase 52). Adding a tool past 13 requires re-scoping in a new plan.',
  );
}
