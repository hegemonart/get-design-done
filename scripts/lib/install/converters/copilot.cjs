'use strict';

/**
 * scripts/lib/install/converters/copilot.cjs — Phase 28.7 (Plan 28.7-04).
 *
 * GitHub Copilot SKILL.md converter. Translates Claude-shape source
 * into Copilot's expected shape:
 *
 *   - Frontmatter `name:` normalized to `gdd-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/gdd-<name>` —
 *     Copilot accepts the Claude shape. Mixed-shape inputs are
 *     normalized via the runtime-slash module.
 *   - Tool names in code fences pass through unchanged — Copilot
 *     accepts the Claude vocabulary (Read/Write/Bash/Edit/Grep/Glob).
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToCopilotSkill` in bin/install.js; our modular
 * factor delegates the actual rewrites to ./shared.cjs.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Convert Claude-source SKILL.md content for the Copilot runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'copilot'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'gdd-');
  let out = shared.rewriteSlashRefs(body, 'copilot');
  out = shared.ensureAdapterHeader(out, 'Copilot');
  return fm + out;
}

module.exports = { convert };
