// scripts/mcp-servers/gdd-mcp/tools/index.ts
//
// Tool registry for `gdd-mcp`. Plan 27.7-02 populates with 12 read-only
// tools. The 12-tool cap is D-03 (hard); enforced at module load by a
// runtime check + by tests in Plan 27.7-03.
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
 * Canonical tool registry. 12 tools (D-03 hard cap). Order is
 * alphabetical (after `gdd_status` which leads as the canonical entry).
 * All tools are advertised equivalently in `tools/list`.
 */
export const TOOL_MODULES: readonly ToolModule[] = [
  gdd_status,
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

/** Canonical count. The plan caps this at 12 — if you add a tool past
 *  that bound, update the plan, the combined schema, and the lint
 *  test (Plan 27.7-03). */
export const TOOL_COUNT: number = TOOL_MODULES.length;

// Module-load runtime assertion of the 12-tool cap (D-03). A compile-time
// type guard is fragile against `readonly ToolModule[]` (the length type
// widens to `number`); the runtime check is cheap, deterministic, and
// fails fast on server boot if the registry ever drifts past the cap.
if (TOOL_COUNT > 12) {
  throw new Error(
    `gdd-mcp: TOOL_COUNT=${TOOL_COUNT} exceeds the 12-tool cap (D-03). ` +
      'Add tool past 12 requires re-scoping in a new plan.',
  );
}
