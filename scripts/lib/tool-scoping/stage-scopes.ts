// scripts/lib/tool-scoping/stage-scopes.ts — frozen per-stage default
// scope registry and native-tool classifier.
//
// The locked table below is the single source of truth for what each
// pipeline stage is permitted. DO NOT MODIFY without a follow-up plan:
// widening a stage here silently expands every headless session that
// falls back to defaults.
//
// MCP tools (`mcp__*`) are NEVER in this registry — they're always
// permitted and bypass the native filter entirely. See `isMcpTool`.

import type { Stage } from './types.ts';

/**
 * Shape of a single registry entry. Frozen at module load.
 */
interface StageDefault {
  readonly allowed: readonly string[];
  readonly bashMutation: boolean;
}

/**
 * Per-stage default scope table. Every `Stage` key must have an entry —
 * `computeScope` relies on this for invariant lookup.
 *
 * Locked contract (see PLAN 21-03):
 *   brief   — Read/Write/Edit/Grep/Glob/Bash (Bash read-only, advisory)
 *   explore — Read/Grep/Glob/Bash/WebSearch/WebFetch/Task (Bash read-only)
 *   plan    — Read/Write/Edit/Grep/Glob/Bash/Task (Bash read-only)
 *   design  — Read/Write/Edit/Grep/Glob/Bash/Task (Bash mutation ALLOWED)
 *   verify  — Read/Grep/Glob/Bash (NO Write/Edit/Task; Bash read-only)
 *   init    — Read/Write/Grep/Glob/Bash/Task/WebSearch/WebFetch (bootstrap)
 *   custom  — empty (caller-provided only; no defaults)
 */
export const STAGE_SCOPES: Readonly<Record<Stage, StageDefault>> =
  Object.freeze({
    brief: Object.freeze({
      allowed: Object.freeze(['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash']),
      bashMutation: false,
    }),
    explore: Object.freeze({
      allowed: Object.freeze([
        'Read',
        'Grep',
        'Glob',
        'Bash',
        'WebSearch',
        'WebFetch',
        'Task',
      ]),
      bashMutation: false,
    }),
    plan: Object.freeze({
      allowed: Object.freeze([
        'Read',
        'Write',
        'Edit',
        'Grep',
        'Glob',
        'Bash',
        'Task',
      ]),
      bashMutation: false,
    }),
    design: Object.freeze({
      allowed: Object.freeze([
        'Read',
        'Write',
        'Edit',
        'Grep',
        'Glob',
        'Bash',
        'Task',
      ]),
      bashMutation: true,
    }),
    verify: Object.freeze({
      allowed: Object.freeze(['Read', 'Grep', 'Glob', 'Bash']),
      bashMutation: false,
    }),
    init: Object.freeze({
      allowed: Object.freeze([
        'Read',
        'Write',
        'Grep',
        'Glob',
        'Bash',
        'Task',
        'WebSearch',
        'WebFetch',
      ]),
      bashMutation: false,
    }),
    custom: Object.freeze({
      allowed: Object.freeze([]),
      bashMutation: false,
    }),
  });

/**
 * Authoritative list of native (harness-managed) tool names. Anything
 * NOT in this list and NOT MCP-prefixed is unknown and treated as a
 * native miss by `checkTool`.
 *
 * Order matches the documented stage scopes; tests assert that every
 * tool referenced in STAGE_SCOPES is a member of NATIVE_TOOLS.
 */
export const NATIVE_TOOLS: readonly string[] = Object.freeze([
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'Bash',
  'Task',
  'WebSearch',
  'WebFetch',
]);

/** MCP tools carry the `mcp__` prefix by convention. */
const MCP_PREFIX = 'mcp__';

/**
 * True when `name` is an MCP tool. MCP tools always pass scope checks —
 * each MCP server declares its own security perimeter, so the stage
 * filter only gates native harness tools.
 */
export function isMcpTool(name: string): boolean {
  return typeof name === 'string' && name.startsWith(MCP_PREFIX);
}

/**
 * True when `name` is a known native harness tool. Used by
 * `computeScope` to split caller-supplied lists into native vs MCP
 * buckets.
 */
export function isNativeTool(name: string): boolean {
  return NATIVE_TOOLS.includes(name);
}
