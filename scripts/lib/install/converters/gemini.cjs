'use strict';

/**
 * scripts/lib/install/converters/gemini.cjs — Phase 28.7 (Plan 28.7-07).
 *
 * Gemini CLI command-file converter. Translates Claude-shape SKILL.md
 * source into the command-format output Gemini expects under
 * `<config>/commands/gdd/<name>.md` (see Phase 28.7 D-05 +
 * `runtime-artifact-layout.cjs#gemini`, which stages this converter via
 * `commandsKind('commands/gdd', 'gdd-', ...)`).
 *
 * Translation rules:
 *
 *   - Frontmatter `name:` normalized to `gdd-<skill>` (no double-prefix).
 *   - Slash references in prose pass through as `/gdd-<name>` — Gemini
 *     accepts the Claude-canonical slash shape via `runtime-slash.cjs`
 *     (rt: 'gemini' → `/gdd-`). Legacy colon and shell-variable forms
 *     are normalized to `/gdd-`.
 *   - Tool names in code fences are rewritten per `GEMINI_TOOL_MAP`
 *     (Phase 28.7 D-06 — reuse Phase 21 `reference/gemini-tools.md`
 *     authoritative table). Source of truth for the map is the Phase 21
 *     reference doc, NOT this file; the constant below is a frozen
 *     snapshot of that table as of `Last verified: 2026-04-24`. If
 *     Gemini ships a tool-vocabulary change, update
 *     `reference/gemini-tools.md` FIRST and then re-sync the constant.
 *     Currently mapped:
 *       Read       → read_file
 *       Write      → write_file
 *       Edit       → replace
 *       Bash       → run_shell_command
 *       Grep       → search_file_content
 *       Glob       → glob
 *       WebSearch  → google_web_search
 *       WebFetch   → web_fetch
 *     `Task` is intentionally absent — per Phase 21 gemini-tools.md
 *     "Known gaps", Gemini handles Task via a nested-CLI invocation, not
 *     a tool call; skills that rely on Task fall back to documentation
 *     prose ("on Gemini this becomes a nested gemini CLI run") that the
 *     converter leaves untouched.
 *   - Prose mentions of tool names (e.g. "use the Bash tool") are NOT
 *     rewritten — only the parenthesized invocation form inside fenced
 *     blocks gets rewritten. This matches the codex + augment converter
 *     policies (Phase 28.7 D-06 invocation-only convention).
 *   - A 1-line HTML adapter header is injected at the top of the body
 *     to record that this file was auto-generated from Claude source.
 *
 * Wave 4 layout note: Gemini uses `commands/gdd/<name>.md` (nested
 * `gdd/` subdirectory under `commands/`), distinct from OpenCode + Kilo
 * which use the XDG singular `command/<name>.md` layout. Both shapes
 * are command-format runtimes — they differ only in destSubpath, which
 * is encoded in `runtime-artifact-layout.cjs#commandsKind`.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent function is
 * `convertClaudeCommandToGeminiCommand` in bin/install.js; our modular
 * factor delegates the actual rewrites to ./shared.cjs and follows the
 * same `tool-map + slash-rewrite + adapter-header` pattern as the codex
 * (CODEX_TOOL_MAP) and augment (AUGMENT_TOOL_MAP) converters.
 *
 * Phase 21 reference cite (D-06): reference/gemini-tools.md is the
 * canonical, version-pinned source for the tool-name mapping. Do not
 * edit GEMINI_TOOL_MAP without first updating that file.
 *
 * Pure / side-effect-free: no fs, no env, no path. `convert` is a
 * deterministic string → string transform.
 */

const shared = require('./shared.cjs');

/**
 * Claude tool name → Gemini tool name. Locked by Phase 21
 * `reference/gemini-tools.md` (per Phase 28.7 D-06). Skills referenced
 * as `Read(...)`, `Write(...)`, etc. in Claude-source code fences are
 * rewritten to Gemini's vocabulary at install time.
 *
 * Note: `Task` is intentionally absent. Per Phase 21 gemini-tools.md
 * "Known gaps", Gemini handles Task via nested-CLI invocation (not a
 * tool call); the converter leaves `Task(...)` references untouched so
 * fallback prose ("on Gemini this becomes a nested gemini CLI run")
 * is still readable.
 *
 * Frozen to prevent accidental mutation. The same Object.freeze pattern
 * is used by CODEX_TOOL_MAP (shared.cjs) and AUGMENT_TOOL_MAP
 * (augment.cjs).
 */
const GEMINI_TOOL_MAP = Object.freeze({
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'replace',
  Bash: 'run_shell_command',
  Grep: 'search_file_content',
  Glob: 'glob',
  WebSearch: 'google_web_search',
  WebFetch: 'web_fetch',
});

/**
 * Convert Claude-source SKILL.md content for the Gemini runtime.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'gemini'`. Currently informational only.
 * @returns {string}
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const fm = shared.buildFrontmatter(frontmatter, skillName, 'gdd-');
  let out = shared.rewriteSlashRefs(body, 'gemini');
  out = shared.rewriteCodeFenceTools(out, GEMINI_TOOL_MAP);
  out = shared.ensureAdapterHeader(out, 'Gemini');
  return fm + out;
}

module.exports = { convert, GEMINI_TOOL_MAP };
