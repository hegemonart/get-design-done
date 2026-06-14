'use strict';

/**
 * scripts/lib/install/converters/codebuddy.cjs — Phase 28.7 (Plan 28.7-06).
 *
 * CodeBuddy SKILL.md converter. Translates Claude-shape source into
 * CodeBuddy's expected shape (uniform skills/<name>/SKILL.md layout —
 * per `runtime-artifact-layout.cjs#codebuddy` which emits the standard
 * skillsKind('skills', 'hone-', ...) entry):
 *
 *   - Frontmatter `name:` normalized to `hone-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/hone-<name>` —
 *     CodeBuddy accepts the Claude shape. Mixed-shape inputs are
 *     normalized via the runtime-slash module.
 *   - Tool names in code fences pass through unchanged — CodeBuddy
 *     accepts the Claude vocabulary (Read/Write/Bash/Edit/Grep/Glob).
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToCodeBuddySkill` in bin/install.js; our modular
 * factor delegates the actual rewrites to ./shared.cjs.
 *
 * This converter follows the same uniform pattern as cursor / windsurf /
 * trae / qwen / copilot / antigravity — it is NOT a special-case
 * runtime. The only special-case converter in Wave 3 is cline.cjs (per
 * D-09: rule-block embedding into `.clinerules`); hermes is OUT of
 * scope per D-10 and intentionally has no converter file.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Convert Claude-source SKILL.md content for the CodeBuddy runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'codebuddy'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'hone-');
  let out = shared.rewriteSlashRefs(body, 'codebuddy');
  out = shared.ensureAdapterHeader(out, 'CodeBuddy');
  return fm + out;
}

module.exports = { convert };
