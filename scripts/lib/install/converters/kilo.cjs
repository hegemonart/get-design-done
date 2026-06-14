'use strict';

/**
 * scripts/lib/install/converters/kilo.cjs — Phase 28.7 (Plan 28.7-07).
 *
 * Kilo command-file converter. Translates Claude-shape SKILL.md source
 * into the command-format output Kilo expects under its XDG
 * `command/<name>.md` slash-command directory (see Phase 28.7 D-05 +
 * `runtime-artifact-layout.cjs#kilo`, which stages this converter via
 * `commandsKind('command', 'hone-', ...)`).
 *
 * Translation rules:
 *
 *   - Frontmatter `name:` normalized to `hone-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/hone-<name>` — Kilo
 *     accepts the Claude-canonical slash shape via the
 *     `runtime-slash.cjs` map (rt: 'kilo' → `/gdd-`). Legacy colon and
 *     shell-variable forms are normalized to `/gdd-`.
 *   - Tool names in code fences pass through unchanged — per Phase 21
 *     verification, Kilo accepts the Claude vocabulary
 *     (Read/Write/Bash/Edit/Grep/Glob) natively. No tool-map rewrite.
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Wave 4 layout note: Kilo uses the same `command/<name>.md` flat
 * layout as OpenCode (its sibling Wave 4 runtime). The converter is
 * structurally identical to opencode.cjs — only the runtime string
 * and adapter-display label differ. Both runtimes share the XDG
 * `command/` directory convention (singular `command`, not the
 * Gemini-style `commands/gdd/` nested path).
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToKiloCommand` in bin/install.js; our modular
 * factor delegates the actual rewrites to ./shared.cjs and follows
 * the same uniform pattern as opencode / cursor / qwen.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Convert Claude-source SKILL.md content for the Kilo runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'kilo'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'hone-');
  let out = shared.rewriteSlashRefs(body, 'kilo');
  out = shared.ensureAdapterHeader(out, 'Kilo');
  return fm + out;
}

module.exports = { convert };
