// scripts/lib/harness/tool-map.ts — Plan 21-10 (SDK-22 / SDK-23).
//
// Cross-harness tool-name lookup table + helpers. Given a Claude Code
// tool name (`Read`, `Write`, `Edit`, etc.) and a harness identifier,
// return the native tool name on that harness. Also supports inverse
// mapping (harness-native name → CC name).
//
// The maps are frozen (Object.freeze at two levels) — consumers cannot
// accidentally mutate the tables. Any mutation attempt throws in strict
// mode, silently no-ops otherwise; tests assert frozenness explicitly
// to lock the invariant.
//
// Task spawning — the CC `Task` tool has no direct native equivalent on
// Codex or Gemini (both require spawning a nested CLI instance as a
// shell subprocess rather than a tool call). The map returns `null`
// for those slots; callers check for null and fall back to a
// `shell("npx gdd-sdk …")` invocation. See AGENTS.md / GEMINI.md.

import type { Harness } from './detect.ts';

/**
 * Canonical Claude Code tool names the plugin references in skill prose.
 * This is the shape against which per-harness maps are typed so that
 * adding a new CC tool to the canonical set fails TSC on every harness
 * map that forgets to include it.
 */
export type CCTool =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'Task'
  | 'WebSearch'
  | 'WebFetch';

/** All nine CC tool names — useful for iteration in tests. */
export const CC_TOOLS: readonly CCTool[] = Object.freeze([
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'Task',
  'WebSearch',
  'WebFetch',
]);

/**
 * Per-harness lookup. Each entry maps every CC tool to its native name
 * on that harness, or `null` when the harness has no direct equivalent
 * (currently only `Task` on Codex + Gemini).
 *
 * The `unknown` row falls back to CC names — callers that cannot identify
 * the harness get a reasonable default that works on Claude Code and
 * fails loudly on any other harness (the harness will refuse an
 * unrecognized tool call).
 */
export const TOOL_MAPS: Readonly<Record<Harness, Readonly<Record<CCTool, string | null>>>> = Object.freeze({
  'claude-code': Object.freeze({
    Read: 'Read',
    Write: 'Write',
    Edit: 'Edit',
    Bash: 'Bash',
    Grep: 'Grep',
    Glob: 'Glob',
    Task: 'Task',
    WebSearch: 'WebSearch',
    WebFetch: 'WebFetch',
  }),
  codex: Object.freeze({
    Read: 'read_file',
    Write: 'apply_patch',
    Edit: 'apply_patch',
    Bash: 'shell',
    Grep: 'shell',
    Glob: 'shell',
    Task: null, // no native Task; use CLI subprocess
    WebSearch: 'web_search',
    WebFetch: 'shell',
  }),
  gemini: Object.freeze({
    Read: 'read_file',
    Write: 'write_file',
    Edit: 'replace',
    Bash: 'run_shell_command',
    Grep: 'search_file_content',
    Glob: 'glob',
    Task: null, // no native Task; use CLI subprocess
    WebSearch: 'google_web_search',
    WebFetch: 'web_fetch',
  }),
  unknown: Object.freeze({
    Read: 'Read',
    Write: 'Write',
    Edit: 'Edit',
    Bash: 'Bash',
    Grep: 'Grep',
    Glob: 'Glob',
    Task: 'Task',
    WebSearch: 'WebSearch',
    WebFetch: 'WebFetch',
  }),
});

/**
 * Return the harness-specific tool name for a CC tool. Returns `null`
 * when the harness has no native equivalent — currently only `Task` on
 * Codex + Gemini. Callers that receive `null` should fall back to a
 * `shell`/`run_shell_command` invocation of `npx gdd-sdk …`.
 */
export function mapTool(harness: Harness, ccTool: CCTool): string | null {
  const row = TOOL_MAPS[harness];
  // Every Harness key is present in TOOL_MAPS by construction (the type
  // forces it). The index result under `noUncheckedIndexedAccess` is
  // still `string | null | undefined`; narrow with a hasOwnProperty
  // check to keep TSC happy.
  const native: string | null | undefined = row[ccTool];
  return native ?? null;
}

/**
 * Inverse of `mapTool` — given a harness-native tool name (e.g.
 * `'read_file'`), return the CC tool it came from (`'Read'`). Returns
 * `null` when the native name is not in the harness's map at all.
 *
 * Note: on Codex several CC tools share a native name (`Write`, `Edit`,
 * `WebFetch` all share `apply_patch` / `shell`). The reverse mapper
 * returns the FIRST CC match walking in declaration order
 * (`Read` → `Write` → `Edit` → …) — callers that need disambiguation
 * between, e.g., create vs. update must consult the full forward map
 * or inspect tool-call arguments.
 */
export function reverseMapTool(harness: Harness, nativeName: string): CCTool | null {
  const row = TOOL_MAPS[harness];
  for (const cc of CC_TOOLS) {
    if (row[cc] === nativeName) return cc;
  }
  return null;
}
