'use strict';

/**
 * scripts/lib/install/converters/codex.cjs — Phase 28.7 (Plan 28.7-04).
 *
 * Codex SKILL.md converter. Translates Claude-shape source into Codex's
 * expected shape:
 *
 *   - Frontmatter `name:` normalized to `gdd-<skill>` (no double-prefix).
 *   - Slash references in prose rewritten from `/gdd-<name>` to
 *     `$gdd-<name>` (Codex's shell-variable form) via
 *     `../runtime-slash.cjs#formatGddSlash`. Skill names are lowercased
 *     on emission per Codex shell-var convention.
 *   - Tool names in code fences rewritten via `CODEX_TOOL_MAP` from
 *     `reference/codex-tools.md` (Phase 21 D-06 reuse):
 *       Read       → read_file
 *       Write/Edit → apply_patch
 *       Bash/Grep  → shell
 *       Glob       → shell
 *       WebSearch  → web_search
 *       WebFetch   → shell
 *     Task is left untouched (Phase 21 codex-tools.md "Known gaps").
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent is `convertClaudeCommandToCodexSkill`
 * in bin/install.js; our modular factor delegates rewrites to ./shared.cjs
 * and pulls the tool map from the same module's CODEX_TOOL_MAP export.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 *
 * Per Phase 21 codex-tools.md: tool-name rewrites are operative on the
 * code-fenced INVOCATION form (`Bash(command=...)`) only. Prose mentions
 * of the Claude vocabulary ("Use the Bash tool to...") round-trip
 * unchanged — they're documentation, not invocations.
 */

const shared = require('./shared.cjs');

/**
 * Convert Claude-source SKILL.md content for the Codex runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'codex'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'gdd-');
  let out = shared.rewriteSlashRefs(body, 'codex');
  out = shared.rewriteCodeFenceTools(out, shared.CODEX_TOOL_MAP);
  out = shared.ensureAdapterHeader(out, 'Codex');
  return fm + out;
}

module.exports = { convert };
