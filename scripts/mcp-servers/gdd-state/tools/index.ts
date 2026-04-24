// scripts/mcp-servers/gdd-state/tools/index.ts
//
// Aggregates the 11 tool handlers. `server.ts` imports from here so the
// registration loop is one call per tool and the tool set is expanded
// by editing a single line.

import * as get from './get.ts';
import * as update_progress from './update_progress.ts';
import * as transition_stage from './transition_stage.ts';
import * as add_blocker from './add_blocker.ts';
import * as resolve_blocker from './resolve_blocker.ts';
import * as add_decision from './add_decision.ts';
import * as add_must_have from './add_must_have.ts';
import * as set_status from './set_status.ts';
import * as checkpoint from './checkpoint.ts';
import * as probe_connections from './probe_connections.ts';
import * as frontmatter_update from './frontmatter_update.ts';

import type { ToolResponse } from './shared.ts';

export interface ToolModule {
  /** Public tool name exposed via MCP (e.g. "gdd_state__add_decision"). */
  name: string;
  /** Path to the input/output Draft-07 JSON Schema, relative to the module. */
  schemaPath: string;
  /** Executes the tool. Never throws — always returns a ToolResponse. */
  handle: (input: unknown) => Promise<ToolResponse>;
}

/**
 * Canonical tool registry for the server. Order is cosmetic — all 11
 * tools are advertised equivalently in `tools/list`. Kept alphabetical
 * after `get` for ease of scanning.
 */
export const TOOL_MODULES: readonly ToolModule[] = [
  get,
  add_blocker,
  add_decision,
  add_must_have,
  checkpoint,
  frontmatter_update,
  probe_connections,
  resolve_blocker,
  set_status,
  transition_stage,
  update_progress,
] as const;

/** Canonical count. The plan locks this at 11 — if you add a tool, update
 *  the plan, the combined schema, and the connection spec. */
export const TOOL_COUNT = TOOL_MODULES.length;
