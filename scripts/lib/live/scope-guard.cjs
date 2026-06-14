'use strict';
/**
 * scripts/lib/live/scope-guard.cjs — Phase 47 (Live Mode) write-scope guard.
 *
 * `/hone:live` lets the agent rewrite the source files behind a picked DOM
 * element. To keep that powerful loop safe, EVERY write the live session makes
 * must be inside an explicitly enumerated allow-set:
 *
 *   (a) the session's own bookkeeping: anything under `.design/live-sessions/`
 *       and `.design/telemetry/` (relative to projectRoot), and
 *   (b) the `implicated` source files — the concrete files the picked element
 *       maps to (passed in by the caller from the element→source mapping).
 *
 * Anything else — a random repo file, a `package.json`, a `..` escape out of the
 * project — is rejected. This is the runtime backstop for the same intent the
 * Editor/Write protected-paths list expresses at author time.
 *
 * Resolution rules:
 *   - All paths are resolved to absolute with path.resolve so `..` segments are
 *     collapsed BEFORE comparison (a `../../etc/passwd` can never sneak past a
 *     string-prefix check).
 *   - Containment uses a normalized, separator-terminated prefix so that
 *     `.design/live-sessions-evil/x` does NOT count as inside
 *     `.design/live-sessions/` (sibling-directory false positive).
 *   - On case-insensitive / Windows filesystems we still compare case-sensitive
 *     prefixes after resolve; the implicated set is matched by exact resolved
 *     path, which is the conservative choice (a guard that is too strict fails
 *     closed, never open).
 *
 * Pure, dependency-free CommonJS (`path` only — no `fs`, no network, no clock).
 * Cross-platform via path.resolve / path.join.
 */

const path = require('path');

/** The two project-relative directory roots always writable by a live session. */
const ALWAYS_ALLOWED_SUBDIRS = Object.freeze([
  path.join('.design', 'live-sessions'),
  path.join('.design', 'telemetry'),
]);

/**
 * True when `child` is the same path as, or nested inside, `parentDir`.
 * Both inputs must already be absolute + resolved. Uses a separator-terminated
 * prefix so sibling dirs that share a name prefix are NOT treated as inside.
 */
function isWithin(parentDir, child) {
  if (child === parentDir) return true;
  const withSep = parentDir.endsWith(path.sep) ? parentDir : parentDir + path.sep;
  return child.startsWith(withSep);
}

/**
 * Normalize the allowed write-set for a live session into a flat, resolved
 * structure the predicates can test against.
 *
 * @param {object} args
 * @param {string} args.projectRoot           project root (required to anchor the always-allowed dirs)
 * @param {Array<string>} [args.implicated]   source files the picked element maps to
 * @returns {{ dirs: string[], files: Set<string> }}
 *   `dirs` — resolved directory prefixes any descendant of which is allowed.
 *   `files` — resolved exact file paths that are allowed.
 */
function enumerateScope(args = {}) {
  const { projectRoot } = args;
  if (!projectRoot) throw new TypeError('enumerateScope: projectRoot is required');
  const root = path.resolve(projectRoot);

  const dirs = ALWAYS_ALLOWED_SUBDIRS.map((rel) => path.resolve(root, rel));

  const files = new Set();
  const implicated = Array.isArray(args.implicated) ? args.implicated : [];
  for (const f of implicated) {
    if (f == null || !String(f).length) continue;
    // Implicated paths may be absolute or relative-to-projectRoot; resolve both
    // against the root so callers can pass either form.
    files.add(path.resolve(root, String(f)));
  }
  return { dirs, files };
}

/**
 * Whether `targetPath` is inside the enumerated scope.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.targetPath            the path about to be written
 * @param {Array<string>} [args.implicated]   element→source files
 * @returns {boolean}
 */
function isInScope(args = {}) {
  const { projectRoot, targetPath } = args;
  if (!projectRoot) throw new TypeError('isInScope: projectRoot is required');
  if (targetPath == null || !String(targetPath).length) {
    throw new TypeError('isInScope: targetPath is required');
  }
  const root = path.resolve(projectRoot);
  const target = path.resolve(root, String(targetPath));
  const { dirs, files } = enumerateScope({ projectRoot, implicated: args.implicated });

  if (files.has(target)) return true;
  for (const d of dirs) {
    if (isWithin(d, target)) return true;
  }
  return false;
}

/**
 * Throw unless `targetPath` is inside the enumerated scope. The error message
 * enumerates the allowed set so a violation is diagnosable.
 *
 * @param {object} args  same shape as isInScope
 * @returns {{ targetPath: string, resolved: string }} on success
 */
function assertInScope(args = {}) {
  const { projectRoot, targetPath } = args;
  if (!projectRoot) throw new TypeError('assertInScope: projectRoot is required');
  if (targetPath == null || !String(targetPath).length) {
    throw new TypeError('assertInScope: targetPath is required');
  }
  if (isInScope(args)) {
    const root = path.resolve(projectRoot);
    return { targetPath: String(targetPath), resolved: path.resolve(root, String(targetPath)) };
  }
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, String(targetPath));
  const { dirs, files } = enumerateScope({ projectRoot, implicated: args.implicated });
  const allowed = [
    ...dirs.map((d) => `${d}${path.sep}* (always-allowed)`),
    ...[...files].map((f) => `${f} (implicated)`),
  ];
  throw new Error(
    `scope-guard: refusing to write "${resolved}" — outside the live-session write scope.\n` +
      `Allowed:\n  ${allowed.length ? allowed.join('\n  ') : '(none)'}`,
  );
}

module.exports = {
  assertInScope,
  isInScope,
  enumerateScope,
  // exported for callers + tests
  isWithin,
  ALWAYS_ALLOWED_SUBDIRS,
};
