'use strict';

/**
 * scripts/lib/install/converters/opencode.cjs — Phase 28.7 (Plan 28.7-07).
 *
 * OpenCode command-file converter. Translates Claude-shape SKILL.md
 * source into the command-format output OpenCode expects under its
 * XDG `command/<name>.md` slash-command directory (see Phase 28.7
 * D-05 + `runtime-artifact-layout.cjs#opencode`, which stages this
 * converter via `commandsKind('command', 'gdd-', ...)`).
 *
 * Translation rules:
 *
 *   - Frontmatter `name:` normalized to `gdd-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/gdd-<name>` —
 *     OpenCode accepts the Claude-canonical slash shape via the
 *     `runtime-slash.cjs` map (rt: 'opencode' → `/gdd-`). Legacy
 *     colon and shell-variable forms are normalized to `/gdd-`.
 *   - Tool names in code fences pass through unchanged — per Phase 21
 *     verification, OpenCode accepts the Claude vocabulary
 *     (Read/Write/Bash/Edit/Grep/Glob) natively. No tool-map rewrite.
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Command-format vs skills-format note: OpenCode is one of three Wave 4
 * runtimes (alongside kilo + gemini) whose layout is a flat
 * `command/<name>.md` file rather than the per-skill folder structure
 * (`skills/<name>/SKILL.md`) used by Wave 1/2/3 runtimes. The converter
 * itself does NOT know its destination directory — the destSubpath is
 * encoded in `runtime-artifact-layout.cjs#commandsKind`. From the
 * converter's perspective, the output is still a single markdown +
 * YAML-frontmatter string; the installer routes it to the right path.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToOpenCodeCommand` in bin/install.js; our
 * modular factor delegates the actual rewrites to ./shared.cjs and
 * follows the same uniform pattern as cursor / qwen / copilot.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Convert Claude-source SKILL.md content for the OpenCode runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'opencode'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'gdd-');
  let out = shared.rewriteSlashRefs(body, 'opencode');
  out = shared.ensureAdapterHeader(out, 'OpenCode');
  return fm + out;
}

module.exports = { convert };
