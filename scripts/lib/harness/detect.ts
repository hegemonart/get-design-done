// scripts/lib/harness/detect.ts — Plan 21-10 (SDK-22 / SDK-23).
//
// Harness detection runtime. Inspects the process env (or an injected
// env map for tests) and reports which agent harness the current process
// is running inside: Claude Code, OpenAI Codex CLI, Google Gemini CLI,
// or `unknown` when no harness can be identified.
//
// Precedence (highest wins):
//   1. `GDD_HARNESS` — explicit override. Accepts 'claude-code' | 'codex'
//      | 'gemini' | 'unknown' verbatim. Anything else → 'unknown'.
//   2. `CLAUDECODE=1` OR `CLAUDE_CODE=1` → 'claude-code'.
//   3. `CODEX_CLI_VERSION` set (any truthy value) → 'codex'.
//   4. `GEMINI_CLI_VERSION` set (any truthy value) → 'gemini'.
//   5. Fallback → 'unknown'.
//
// This module is pure — no side effects, no caching. Callers that want
// process-wide caching go through `scripts/lib/harness/index.ts`, which
// layers a `currentHarness()` helper on top.

export type Harness = 'claude-code' | 'codex' | 'gemini' | 'unknown';

/** The four canonical harness identifiers this plugin recognizes. */
export const KNOWN_HARNESSES: readonly Harness[] = Object.freeze([
  'claude-code',
  'codex',
  'gemini',
  'unknown',
]);

/**
 * Detect which agent harness the current process is running inside.
 *
 * Reads the supplied env map (defaults to `process.env`). Precedence is
 * documented at the top of this file — the explicit `GDD_HARNESS` override
 * wins over implicit env-var detection to make tests and simulated fixtures
 * deterministic.
 */
export function detectHarness(env?: NodeJS.ProcessEnv): Harness {
  const e: NodeJS.ProcessEnv = env ?? process.env;

  // 1. Explicit override wins.
  const override: string | undefined = e.GDD_HARNESS;
  if (override !== undefined && override !== '') {
    if (isHarness(override)) return override;
    // Any other non-empty string → 'unknown' (override is present but invalid).
    return 'unknown';
  }

  // 2. Claude Code: either CLAUDECODE or CLAUDE_CODE set to "1".
  if (e.CLAUDECODE === '1' || e.CLAUDE_CODE === '1') {
    return 'claude-code';
  }

  // 3. Codex: CODEX_CLI_VERSION present (any non-empty value).
  if (e.CODEX_CLI_VERSION !== undefined && e.CODEX_CLI_VERSION !== '') {
    return 'codex';
  }

  // 4. Gemini: GEMINI_CLI_VERSION present (any non-empty value).
  if (e.GEMINI_CLI_VERSION !== undefined && e.GEMINI_CLI_VERSION !== '') {
    return 'gemini';
  }

  return 'unknown';
}

/**
 * True for harnesses that this plugin fully supports (Claude Code, Codex,
 * Gemini). False for `'unknown'`.
 *
 * Callers use this as a gate before invoking harness-specific code paths;
 * an unknown harness falls back to CC-native tool names (see
 * `tool-map.ts TOOL_MAPS.unknown`).
 */
export function isSupportedHarness(h: Harness): boolean {
  return h === 'claude-code' || h === 'codex' || h === 'gemini';
}

/**
 * Narrow an arbitrary string to the `Harness` union. Not exported — used
 * only by `detectHarness` to validate the `GDD_HARNESS` override.
 */
function isHarness(s: string): s is Harness {
  return (
    s === 'claude-code' ||
    s === 'codex' ||
    s === 'gemini' ||
    s === 'unknown'
  );
}
