// scripts/lib/harness/index.ts — Plan 21-10 (SDK-22 / SDK-23).
//
// Public API for the harness module. Re-exports the detect + tool-map
// surfaces and adds a `currentHarness()` helper that caches the
// first-call result for the life of the process.
//
// Why cache? Harness identity is a process-scoped invariant. The env
// vars that drive detection (CLAUDECODE, CODEX_CLI_VERSION,
// GEMINI_CLI_VERSION, GDD_HARNESS) are set by the harness when it
// spawns us — they do not change mid-process. Repeated env reads are
// cheap but the cache avoids any chance of divergent reads if a
// downstream caller mutates process.env (tests sometimes do this, and
// we want `currentHarness()` to stay monotonic within a test unless
// `resetHarnessCache()` is called explicitly).
//
// Use `resetHarnessCache()` in test `beforeEach` to re-read env after
// mutating it.

import { detectHarness, isSupportedHarness, type Harness } from './detect.ts';

export { detectHarness, isSupportedHarness, type Harness } from './detect.ts';
export {
  TOOL_MAPS,
  mapTool,
  reverseMapTool,
  CC_TOOLS,
  type CCTool,
} from './tool-map.ts';

let cached: Harness | undefined = undefined;

/**
 * Cached harness lookup. On first call, reads `process.env` via
 * `detectHarness()` and stores the result. Every subsequent call
 * returns the cached value, regardless of later env mutations.
 *
 * Call `resetHarnessCache()` to force a re-read.
 */
export function currentHarness(): Harness {
  if (cached === undefined) {
    cached = detectHarness(process.env);
  }
  return cached;
}

/**
 * Clear the `currentHarness()` cache. Tests that mutate `process.env`
 * between cases should call this in `beforeEach` (or equivalently)
 * so each case sees a fresh detection.
 */
export function resetHarnessCache(): void {
  cached = undefined;
}

/**
 * True when the currently detected harness exposes MCP protocol support.
 * Used by gdd-sdk audit to decide whether to spawn the gdd-state MCP
 * server or import handlers directly.
 *
 * Claude Code, Codex, and Gemini all speak MCP; only `'unknown'` does not.
 */
export function harnessSupportsMCP(): boolean {
  return isSupportedHarness(currentHarness());
}
