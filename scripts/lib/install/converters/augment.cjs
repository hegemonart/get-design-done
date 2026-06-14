'use strict';

/**
 * scripts/lib/install/converters/augment.cjs — Phase 28.7 (Plan 28.7-05).
 *
 * Augment Code SKILL.md converter. Translates Claude-shape source into
 * Augment's expected shape:
 *
 *   - Frontmatter `name:` normalized to `hone-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/hone-<name>` —
 *     Augment accepts the Claude shape for slash references.
 *   - Tool names in code fences are rewritten per `AUGMENT_TOOL_MAP`:
 *       Bash → launch-process
 *       Edit → str-replace-editor
 *     Read/Write/Grep/Glob/WebSearch/WebFetch pass through unchanged —
 *     Augment recognizes the Claude vocabulary for those tools.
 *   - Prose mentions of tool names (e.g. "use the Bash tool") are NOT
 *     rewritten — only the parenthesized invocation form inside fenced
 *     blocks gets rewritten. This matches the codex converter's policy
 *     (Phase 28.7 D-06).
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToAugmentSkill` in bin/install.js; our modular
 * factor delegates the actual rewrites to ./shared.cjs.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Claude tool name → Augment tool name. Per Augment's documented tool
 * surface (launch-process for shell execution, str-replace-editor for
 * file edits). Frozen to prevent accidental mutation.
 *
 * Future: extract AUGMENT_TOOL_MAP to reference/augment-tools.md per
 * the Phase 21 pattern (cf. CODEX_TOOL_MAP in shared.cjs) if scope grows
 * beyond two entries.
 */
const AUGMENT_TOOL_MAP = Object.freeze({
  Bash: 'launch-process',
  Edit: 'str-replace-editor',
});

/**
 * Convert Claude-source SKILL.md content for the Augment runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'augment'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'hone-');
  let out = shared.rewriteSlashRefs(body, 'augment');
  out = shared.rewriteCodeFenceTools(out, AUGMENT_TOOL_MAP);
  out = shared.ensureAdapterHeader(out, 'Augment');
  return fm + out;
}

module.exports = { convert, AUGMENT_TOOL_MAP };
