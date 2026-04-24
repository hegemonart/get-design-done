// scripts/lib/tool-scoping/types.ts — type definitions for per-stage
// allowed-tools enforcement.
//
// See ./index.ts for the public API surface. Types are kept in this file
// so fixtures, tests, and callers can import them without pulling the
// full parser/compute machinery.

/**
 * Canonical pipeline stage name. `custom` is the escape valve for
 * callers that manage their own scope entirely; it has no defaults.
 */
export type Stage =
  | 'brief'
  | 'explore'
  | 'plan'
  | 'design'
  | 'verify'
  | 'init'
  | 'custom';

/**
 * Computed scope for a headless Agent SDK session. Produced by
 * `computeScope`; consumed by `checkTool`, `enforceScope`, and
 * `session-runner`'s `allowedTools` parameter.
 *
 * `allowed` is a flattened, deduplicated, alphabetically sorted list
 * (deterministic output — stable across runs).
 *
 * `denied` is `NATIVE_TOOLS \ allowed_native`: the set of native
 * harness tools explicitly NOT permitted on this session. MCP tools
 * are never in `denied` — they always pass.
 */
export interface Scope {
  readonly stage: Stage;
  /** Flattened, deduplicated, sorted list of allowed tool names. */
  readonly allowed: readonly string[];
  /** Native tools explicitly denied by the stage (e.g., verify denies Write). */
  readonly denied: readonly string[];
  /**
   * Whether bash mutations are permitted (stage-level flag, advisory —
   * hard gating is future work in Phase 22's `gdd-router`).
   */
  readonly bashMutation: boolean;
}

/**
 * Input to `computeScope` / `enforceScope`.
 *
 * `agentTools` precedence rules (documented in stage-scopes.ts):
 *   undefined / null    → stage default applies
 *   []                  → scope narrows to MCP-only (empty native list)
 *   string[] (non-empty)→ overrides stage defaults entirely
 *
 * `additional` is unioned with the scope (caller-supplied, e.g.,
 * `mcp__gdd_state__*` tool names the session needs access to).
 */
export interface ScopeInput {
  readonly stage: Stage;
  /** Optional agent-frontmatter override (from parseAgentTools). */
  readonly agentTools?: readonly string[] | null;
  /** Additional tools to union with the scope (caller-supplied). */
  readonly additional?: readonly string[];
}

/**
 * Structured denial record returned by `checkTool`. `enforceScope`
 * lifts these into `ValidationError` instances (from gdd-errors).
 *
 * `tool` is absent when the violation is not tool-specific
 * (e.g., `INVALID_STAGE`, `EMPTY_SCOPE`).
 */
export interface ScopeViolation {
  readonly code: 'TOOL_NOT_ALLOWED' | 'INVALID_STAGE' | 'EMPTY_SCOPE';
  readonly tool?: string;
  readonly stage: Stage;
  readonly message: string;
}
