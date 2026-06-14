// sdk/mcp/hone-mcp/tools/shared.ts
//
// Shared helpers for hone-mcp tools. resolveProjectRoot() implements the
// D-05 walk-up algorithm: scan from process.cwd() upward looking for
// `.design/` OR `.planning/` OR `.claude-plugin/plugin.json` — first
// match wins. Override: if process.env.GDD_PROJECT_ROOT is set, return
// it without walking.
//
// shared.ts itself is server-side infrastructure (it's the helper layer
// for tools, not a tool); it MAY import `node:fs` and `node:path`
// directly. The thin-wrapper rule (D-06) and the lint that will land
// in Plan 27.7-03 target individual TOOL files in this same directory,
// NOT this shared helper module.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { toToolError } from '../../../errors/classification.ts';
import type { ToolErrorPayload } from '../../../errors/classification.ts';

/** Public tool-handler response shape (consistent across all tools). */
export type ToolResponse =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: ToolErrorPayload['error'] };

/**
 * Shorthand for a `{success:true, data}` return with a plain object.
 */
export function okResponse(data: Record<string, unknown>): ToolResponse {
  return { success: true, data };
}

/**
 * Map an error into a tool-response `{success:false, error}` object.
 * Single entry point for every handler — keeps the error-shape decision
 * in one place.
 *
 * Plan 27.7-02 Warning #5 projection: when the underlying error carries
 * a `code === 'directory_not_found'` property (set by
 * SnapshotNotFoundError / IntelNotFoundError / ReflectionsNotFoundError),
 * we surface it as `error.mcp_code` so MCP clients can distinguish a
 * missing-data-source from a genuine bug. The original `code`/`kind`
 * pair stays intact for the GDD error taxonomy.
 */
export function errorResponse(err: unknown): ToolResponse {
  const payload = toToolError(err);
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'directory_not_found'
  ) {
    const error = { ...payload.error, mcp_code: 'directory_not_found' };
    return { success: false, error: error as ToolErrorPayload['error'] };
  }
  return { success: false, error: payload.error };
}

/**
 * Resolve <root>/.design/STATE.md. State path can be pinned via
 * `process.env.GDD_STATE_PATH` (mirrors the hone-state server).
 */
export function resolveStatePath(): string {
  const override = process.env['GDD_STATE_PATH'];
  if (typeof override === 'string' && override.length > 0) {
    return override;
  }
  return join(resolveProjectRoot(), '.design', 'STATE.md');
}

/** Resolve <root>/.planning/ROADMAP.md. */
export function resolveRoadmapPath(): string {
  return join(resolveProjectRoot(), '.planning', 'ROADMAP.md');
}

/** Resolve <root>/.design/intel. */
export function resolveIntelDir(): string {
  return join(resolveProjectRoot(), '.design', 'intel');
}

/** Resolve <root>/.design/telemetry. */
export function resolveTelemetryDir(): string {
  return join(resolveProjectRoot(), '.design', 'telemetry');
}

/** Resolve <root>/.design/reflections. */
export function resolveReflectionsDir(): string {
  return join(resolveProjectRoot(), '.design', 'reflections');
}

/** Resolve <root>/.design/snapshots. */
export function resolveSnapshotsDir(): string {
  return join(resolveProjectRoot(), '.design', 'snapshots');
}

/**
 * Walk up from a starting directory looking for any of the three GDD
 * project markers: `.design/`, `.planning/`, or `.claude-plugin/plugin.json`.
 * First match wins; resolves to the absolute path of the directory that
 * contains the marker.
 *
 * Override: `process.env.GDD_PROJECT_ROOT` short-circuits the walk and
 * is returned verbatim (after path resolution). This is useful for
 * tests and for users who want to pin a project root explicitly.
 *
 * REPO-BOUNDARY GUARD (audit S8): the upward walk STOPS at the first `.git`
 * directory it encounters. If a `.git` boundary is hit BEFORE any GDD marker
 * is found, the walk does NOT continue into the parent repository — that
 * would let a nested, unrelated checkout resolve to a PARENT repo's
 * `.design/`/`.planning/`, leaking another project's state into this one
 * (cross-project info bleed). At a `.git` boundary we check the boundary
 * directory itself for a marker (a repo root legitimately holds `.design/`),
 * then treat "no marker at or below this repo root" as not-found.
 *
 * Throws `Error('gdd project root not found: ...')` when no marker is
 * found before either the first `.git` boundary or the filesystem root.
 * Callers in tool handlers should catch and forward via `errorResponse()`.
 */
export function resolveProjectRoot(startCwd: string = process.cwd()): string {
  const override = process.env['GDD_PROJECT_ROOT'];
  if (typeof override === 'string' && override.length > 0) {
    return resolve(override);
  }

  let dir = resolve(startCwd);
  while (true) {
    if (
      existsSync(join(dir, '.design')) ||
      existsSync(join(dir, '.planning')) ||
      existsSync(join(dir, '.claude-plugin', 'plugin.json'))
    ) {
      return dir;
    }
    // S8: a `.git` here marks a repository boundary. We already checked this
    // directory for a marker above and found none, so do not walk PAST the
    // repo root into a parent (possibly unrelated) project.
    if (existsSync(join(dir, '.git'))) {
      throw new Error(
        `gdd project root not found: hit repo boundary at ${dir} ` +
          `(.git) before any GDD marker, starting from ${startCwd}`,
      );
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached filesystem root — give up.
      throw new Error(
        `gdd project root not found: walked up to ${dir} from ${startCwd}`,
      );
    }
    dir = parent;
  }
}
