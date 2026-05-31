#!/usr/bin/env node
// scripts/validate-incubator-scope.cjs — Plan 29-05
//
// Phase 29 D-05: scope guard for incubator-draft promotion.
//
// Purpose
//   Enforce that a drafted incubator artifact can only resolve to one of:
//     * `agents/<slug>.md`                  (Phase 28.5 agent files)
//     * `skills/<slug>/SKILL.md`            (Phase 28.5 skill files)
//   Any other path (script, hook, runtime, transport, root-escape, absolute
//   path outside the repo, traversal segment) is rejected with a non-zero
//   exit and an informative error message.
//
//   This script is invoked BEFORE any file write inside
//   `scripts/lib/apply-reflections/incubator-proposals.cjs#applyAccept`, and
//   is the second non-bypassable line of defense after the floor enforced by
//   `scripts/lib/incubator-author.cjs#safeWritePath` at draft-time.
//
// Non-bypassable (D-05)
//   No flag, env var, or argument disables the check. Promotion targets that
//   fail the regex check throw — period. There is no opt-out flag, no
//   environment override, and the CLI offers no escape hatch. (The scan in
//   test/suite/apply-reflections-incubator.test.cjs grep-asserts the absence of
//   bypass tokens in this file's source, so even adding such an option in
//   future would break the build.)
//
// API
//   validateScope(targetPath, { repoRoot } = {})
//     → { ok: true }                 // accepted
//     → throws Error(...)            // rejected; message names offending path + allowed patterns
//
// CLI
//   node scripts/validate-incubator-scope.cjs <path>
//     exit 0 + `[scope-guard] ok: <relPath>` on success
//     exit 1 + descriptive stderr on failure
//
// Style: zero deps beyond node:fs + node:path (matches scripts/lib/incubator-author.cjs).

'use strict';

const path = require('node:path');

// Allowed target patterns — slug rules match the Phase 28.5 frontmatter slug
// regex (lowercase, digits, hyphens; must start with [a-z0-9]).
const SLUG_RE_FRAGMENT = '[a-z0-9][a-z0-9-]*';
const AGENT_RE = new RegExp(`^agents/${SLUG_RE_FRAGMENT}\\.md$`);
const SKILL_RE = new RegExp(`^skills/${SLUG_RE_FRAGMENT}/SKILL\\.md$`);

/**
 * Validate that a target path is in scope for incubator promotion.
 *
 * Algorithm:
 *   1. Resolve to absolute path under repoRoot.
 *   2. Reject if the resolved path escapes repoRoot (path traversal or
 *      absolute path pointing outside the repository).
 *   3. Compute repo-relative path with forward-slash normalization.
 *   4. Reject if the relative path doesn't match exactly one of the two
 *      allowed patterns.
 *
 * @param {string} targetPath - file path to validate; relative paths are
 *   resolved against repoRoot.
 * @param {{repoRoot?: string}} [opts] - configuration. repoRoot defaults to
 *   process.cwd().
 * @returns {{ok: true}} on success.
 * @throws {Error} on any rejection. Message includes the offending path and
 *   the allowed patterns.
 */
function validateScope(targetPath, opts) {
  const o = opts || {};
  const repoRoot = path.resolve(o.repoRoot || process.cwd());

  if (typeof targetPath !== 'string' || !targetPath.length) {
    throw new Error(
      `[scope-guard] invalid input: targetPath must be a non-empty string. ` +
        `Allowed: ${AGENT_RE.source} or ${SKILL_RE.source}`,
    );
  }

  // Resolve relative to repoRoot. Absolute paths bypass repoRoot prefixing;
  // that's fine — the prefix check below catches them anyway.
  const resolved = path.resolve(repoRoot, targetPath);

  // Step 1: confirm resolved path is inside repoRoot. We compare with a
  // trailing separator to avoid `repoRoot-evil/...` slipping past a startsWith
  // check.
  const rootWithSep = repoRoot + path.sep;
  if (!(resolved === repoRoot || resolved.startsWith(rootWithSep))) {
    throw new Error(
      `[scope-guard] path escapes repository: ${targetPath} → ${resolved} ` +
        `(outside ${repoRoot}). Allowed: agents/<slug>.md or skills/<slug>/SKILL.md`,
    );
  }

  // Step 2: compute repo-relative path and normalize separators to '/'
  // (Windows uses '\\' natively).
  const rel = path.relative(repoRoot, resolved).replace(/\\/g, '/');

  // Step 3: match exactly one of the allowed shapes.
  if (AGENT_RE.test(rel) || SKILL_RE.test(rel)) {
    return { ok: true };
  }

  throw new Error(
    `[scope-guard] path not in allowed scope: ${rel} ` +
      `(input: ${targetPath}). Allowed patterns: ` +
      `agents/<slug>.md (regex ${AGENT_RE.source}) ` +
      `or skills/<slug>/SKILL.md (regex ${SKILL_RE.source}). ` +
      `Note: scope guard is non-bypassable per Phase 29 D-05.`,
  );
}

module.exports = { validateScope };

// -------------------------------------------------------------------
// CLI entry
// -------------------------------------------------------------------

if (require.main === module) {
  const input = process.argv[2];
  if (!input) {
    console.error('[scope-guard] usage: node scripts/validate-incubator-scope.cjs <path>');
    process.exit(1);
  }
  try {
    validateScope(input);
    const rel = path.relative(process.cwd(), path.resolve(process.cwd(), input)).replace(/\\/g, '/');
    console.log(`[scope-guard] ok: ${rel}`);
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
