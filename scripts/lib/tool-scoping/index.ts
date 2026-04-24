// scripts/lib/tool-scoping/index.ts — public surface for the per-stage
// allowed-tools enforcement module.
//
// Exported API:
//   * Types          — Stage, Scope, ScopeInput, ScopeViolation
//   * Registry       — STAGE_SCOPES, NATIVE_TOOLS, isMcpTool, isNativeTool
//   * Frontmatter    — parseAgentTools, parseAgentToolsByName
//   * Computation    — computeScope       (pure, no I/O)
//   * Checking       — checkTool          (pure predicate, returns violation|null)
//   * Enforcement    — enforceScope       (throws ValidationError on denial)
//
// Precedence contract (agentTools vs stage default):
//   undefined/null   → stage default applies
//   []               → scope narrows to MCP-only (no native)
//   string[]         → replaces stage default entirely (override wins)
//
// MCP tools (`mcp__*`) are always allowed — they're appended to the
// scope without checking against the stage filter.
//
// Consumed by:
//   * Plan 21-01 `session-runner`  — computes `allowedTools` for each session.
//   * Plan 21-05 `pipeline-runner` — picks the correct scope per stage.

import { ValidationError } from '../gdd-errors/index.ts';
import type { Scope, ScopeInput, ScopeViolation, Stage } from './types.ts';
import {
  NATIVE_TOOLS,
  STAGE_SCOPES,
  isMcpTool,
  isNativeTool,
} from './stage-scopes.ts';
import {
  parseAgentTools,
  parseAgentToolsByName,
} from './parse-agent-tools.ts';

// ---------------------------------------------------------------------------
// Re-exports — keep the module's public surface on the index file.
// ---------------------------------------------------------------------------

export type { Scope, ScopeInput, ScopeViolation, Stage } from './types.ts';
export {
  NATIVE_TOOLS,
  STAGE_SCOPES,
  isMcpTool,
  isNativeTool,
} from './stage-scopes.ts';
export {
  parseAgentTools,
  parseAgentToolsByName,
} from './parse-agent-tools.ts';

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** The recognized Stage values; kept in sync with Stage union type. */
const KNOWN_STAGES: readonly Stage[] = Object.freeze([
  'brief',
  'explore',
  'plan',
  'design',
  'verify',
  'init',
  'custom',
]);

function isKnownStage(s: string): s is Stage {
  return (KNOWN_STAGES as readonly string[]).includes(s);
}

/**
 * Deduplicate + sort alphabetically so `computeScope` output is
 * deterministic across runs.
 */
function normalize(list: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(list)).sort());
}

// ---------------------------------------------------------------------------
// computeScope — pure, no I/O
// ---------------------------------------------------------------------------

/**
 * Compute the final `Scope` for a session. Honors precedence:
 *   agentTools (frontmatter) > STAGE_SCOPES default
 *
 * MCP tools in `additional` are always allowed — they're appended to the
 * result without being filtered. Native tools in `additional` are
 * merged into the scope; `enforceScope` (not this function) decides
 * whether they pass the stage filter.
 *
 * Returns a frozen `Scope` object. `.denied` = NATIVE_TOOLS \
 * (.allowed ∩ NATIVE_TOOLS) — the set of native tools explicitly not
 * permitted on this session.
 *
 * This function is pure: no filesystem access, no globals. All I/O
 * (parsing agent frontmatter) is the caller's responsibility via
 * `parseAgentTools`.
 */
export function computeScope(input: ScopeInput): Scope {
  if (!isKnownStage(input.stage)) {
    throw new ValidationError(
      `unknown stage: ${String(input.stage)}`,
      'INVALID_STAGE',
      { stage: input.stage, knownStages: [...KNOWN_STAGES] },
    );
  }

  const stage: Stage = input.stage;
  const stageDefault = STAGE_SCOPES[stage];

  // Determine base allowed list.
  //   agentTools present (non-null/undefined) → use it (even if empty).
  //   agentTools absent → use stage default.
  let base: readonly string[];
  if (input.agentTools !== undefined && input.agentTools !== null) {
    base = input.agentTools;
  } else {
    base = stageDefault.allowed;
  }

  // Union with caller-supplied additional tools (typically MCP).
  const additional: readonly string[] = input.additional ?? [];
  const combined: readonly string[] = normalize([...base, ...additional]);

  // Derive denied = NATIVE_TOOLS \ (combined ∩ NATIVE_TOOLS).
  const nativeAllowed: Set<string> = new Set(
    combined.filter((t) => isNativeTool(t)),
  );
  const denied: readonly string[] = Object.freeze(
    NATIVE_TOOLS.filter((t) => !nativeAllowed.has(t)).slice().sort(),
  );

  // bashMutation tracks the stage-level flag (authoritative this phase;
  // agent overrides do not propagate here — Phase 22 revisits).
  return Object.freeze({
    stage,
    allowed: combined,
    denied,
    bashMutation: stageDefault.bashMutation,
  });
}

// ---------------------------------------------------------------------------
// checkTool — pure predicate
// ---------------------------------------------------------------------------

/**
 * Validate that `requestedTool` is permitted by `scope`. Returns a
 * `ScopeViolation` when denied; `null` when allowed.
 *
 * MCP tools (`mcp__*`) always pass — MCP servers declare their own
 * security perimeter. The stage filter only gates native harness tools.
 */
export function checkTool(
  scope: Scope,
  requestedTool: string,
): ScopeViolation | null {
  if (isMcpTool(requestedTool)) return null;
  if (scope.allowed.includes(requestedTool)) return null;

  return Object.freeze({
    code: 'TOOL_NOT_ALLOWED' as const,
    tool: requestedTool,
    stage: scope.stage,
    message:
      `tool "${requestedTool}" is not permitted by the "${scope.stage}" scope ` +
      `(allowed: ${scope.allowed.length === 0 ? '(empty — MCP only)' : scope.allowed.join(', ')})`,
  });
}

// ---------------------------------------------------------------------------
// enforceScope — throws on violation
// ---------------------------------------------------------------------------

/**
 * Enforce scope at session creation: validates all caller-supplied
 * tools against the scope and throws `ValidationError` on the first
 * violation. Returns the validated allowed list, ready for
 * `session-runner`'s `allowedTools` parameter.
 *
 * Throws:
 *   * `ValidationError('INVALID_STAGE', ...)` — unknown stage name.
 *   * `ValidationError('TOOL_NOT_ALLOWED', ...)` — additional tool
 *     violates the effective scope (context = {stage, tool, allowed}).
 *
 * Empty allowed list is NOT an error here — MCP-only agents are a
 * supported configuration.
 */
export function enforceScope(input: ScopeInput): readonly string[] {
  // Compute the full post-merge scope (for the return value).
  const scope: Scope = computeScope(input);

  // Additional tools must be validated against the EFFECTIVE base scope
  // (agent override or stage default) — NOT against the post-union
  // scope, otherwise every additional tool would trivially pass because
  // computeScope already folded it in.
  //
  // The "base" scope for this check is computeScope without `additional`.
  const baseScope: Scope = computeScope({
    stage: input.stage,
    ...(input.agentTools !== undefined ? { agentTools: input.agentTools } : {}),
  });

  const additional: readonly string[] = input.additional ?? [];
  for (const tool of additional) {
    const violation: ScopeViolation | null = checkTool(baseScope, tool);
    if (violation !== null) {
      throw new ValidationError(violation.message, violation.code, {
        stage: scope.stage,
        tool,
        allowed: [...baseScope.allowed],
      });
    }
  }

  return scope.allowed;
}
