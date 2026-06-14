'use strict';

// Phase 61 rebrand: consume the brand seam so the installed skill name carries
// the canonical `hone-` prefix instead of the hardcoded legacy `gdd-`. The
// converters pass `SKILL_PREFIX` through to buildFrontmatter (replacing the
// historical `'hone-'` literal).
const { SKILL_PREFIX } = require('../../pkg-identity.cjs');

/**
 * scripts/lib/install/converters/shared.cjs — Phase 28.7 (Plan 28.7-04).
 *
 * Shared helpers for per-runtime SKILL.md content converters. Each
 * runtime-specific converter (cursor.cjs, codex.cjs, copilot.cjs,
 * antigravity.cjs in Wave 1; windsurf/augment/trae/qwen in Wave 2; etc.)
 * composes these utilities to translate Claude-source SKILL.md content
 * into the runtime's expected shape.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's `convertClaudeCommandTo<Runtime>Skill` family
 * bundled all per-runtime conversion logic into a single bin/install.js
 * monolith; our modular re-implementation factors the shared rewrites
 * here and leaves runtime-specific composition to per-runtime files.
 *
 * Exports (D-05):
 *   - extractFrontmatterAndBody(content)
 *       → { frontmatter: string|null, body: string }
 *   - rewriteSlashRefs(body, targetRuntime) → string
 *       Rewrites in-prose `/hone-name`, `hone-name`, `/hone:name`, `$hone-name`
 *       references to the runtime-canonical form via
 *       `../runtime-slash.cjs#formatGddSlash`. Only operates on prose;
 *       fenced code blocks are passed through untouched.
 *   - rewriteCodeFenceTools(body, toolMap) → string
 *       The inverse: ONLY rewrites inside fenced code blocks. Replaces
 *       `OldName(` with `NewName(` for every `{ OldName: NewName }` in
 *       `toolMap`. Used by the codex converter to apply CODEX_TOOL_MAP.
 *   - ensureAdapterHeader(body, runtimeDisplay) → string
 *       Prepends a 2-3 line HTML comment ("Auto-generated from Claude
 *       SKILL.md") before the first non-blank body line. Idempotent —
 *       running it twice does not duplicate the header.
 *   - buildFrontmatter(originalFrontmatter, skillName, runtimePrefix) → string
 *       Re-emits a YAML frontmatter block. `name:` is normalized to
 *       `<runtimePrefix><skillName>` (stripping the prefix if it was
 *       already present in the source). Other fields (description,
 *       tools, etc.) round-trip verbatim. Returns a string ending in
 *       `\n---\n`.
 *   - CODEX_TOOL_MAP
 *       Frozen constant — Phase 21 `reference/codex-tools.md` mapping
 *       (Read→read_file, Write/Edit→apply_patch, Bash/Grep/Glob→shell,
 *       WebSearch→web_search, WebFetch→shell).
 *
 * Pure / side-effect-free at module load and at every export call:
 *   - No fs / path top-level requires (all transforms operate on the
 *     `content` string argument).
 *   - No env mutation.
 *   - No globals.
 * The only external runtime require is `../runtime-slash.cjs`, lazy-
 * loaded inside `rewriteSlashRefs` to keep the static dependency graph
 * thin (this file is also imported by Wave 2/3/4 plans which may not
 * need slash rewrites if their target runtime is Claude-shape).
 *
 * Per Phase 28.7 D-08 the converter cluster is intentionally modular
 * (one file per runtime, none re-export each other). shared.cjs is the
 * sole cross-runtime module — used by all 13 converters.
 *
 * Per Phase 28.7 D-06 only the codex converter applies CODEX_TOOL_MAP;
 * the other 12 runtimes accept Claude-compatible tool names verbatim.
 *
 * Conventions:
 *   - "frontmatter" = YAML between leading `---` delimiters; matches
 *     `^---\r?\n([\s\S]*?)\r?\n---\r?\n` (CRLF tolerant — Phase 28.6
 *     Windows-line-ending lesson).
 *   - "body" = everything after the closing `---`.
 *   - "code fence" = ```...``` block (3+ backticks, language tag optional).
 *     We use a coarse fence-aware splitter — backtick variants and
 *     tilde fences are not currently supported (out of scope; the
 *     plugin's SKILL.md sources use triple-backtick exclusively).
 */

// ---------------------------------------------------------------------------
// CODEX_TOOL_MAP — Phase 21 reference (D-06)
// ---------------------------------------------------------------------------

/**
 * Claude tool name → Codex tool name. Locked by Phase 21
 * `reference/codex-tools.md`. Skills referenced as `Read(...)`,
 * `Write(...)`, etc. in Claude-source code fences are rewritten to
 * Codex's vocabulary at install time.
 *
 * Note: `Task` is intentionally absent. Per Phase 21 codex-tools.md
 * "Known gaps", Codex does not expose nested-session as a tool call;
 * skills that rely on Task call the hone-sdk CLI via `shell(...)`. The
 * codex converter leaves `Task(...)` references untouched so prose
 * fallback prose ("on Codex this becomes shell('npx hone-sdk ...')") is
 * still readable.
 *
 * Frozen to prevent accidental mutation by downstream converters.
 */
const CODEX_TOOL_MAP = Object.freeze({
  Read: 'read_file',
  Write: 'apply_patch',
  Edit: 'apply_patch',
  Bash: 'shell',
  Grep: 'shell',
  Glob: 'shell',
  WebSearch: 'web_search',
  WebFetch: 'shell',
});

// ---------------------------------------------------------------------------
// extractFrontmatterAndBody — YAML frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Split a SKILL.md content string into its YAML frontmatter and body.
 *
 * Matches the leading `---\n...\n---\n` block (CRLF tolerant). If no
 * frontmatter is present, returns `{ frontmatter: null, body: content }`.
 *
 * @param {string} content
 * @returns {{ frontmatter: string|null, body: string }}
 */
function extractFrontmatterAndBody(content) {
  if (typeof content !== 'string' || content === '') {
    return { frontmatter: null, body: content || '' };
  }
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: content };
  return { frontmatter: m[1], body: m[2] };
}

// ---------------------------------------------------------------------------
// Code-fence-aware splitter (internal)
// ---------------------------------------------------------------------------

/**
 * Split `body` into alternating segments of [prose, fence, prose, fence, ...].
 * Index 0 (and every even index) is prose; every odd index is a complete
 * fenced code block (including the opening/closing ``` lines).
 *
 * This lets `rewriteSlashRefs` operate ONLY on even indices and
 * `rewriteCodeFenceTools` operate ONLY on odd indices, without either
 * leaking into the other's domain.
 *
 * Coarse: a fence is any line beginning with three backticks (with or
 * without a language tag) up to the next such line. Nested fences are
 * not supported (irrelevant for our SKILL.md sources).
 *
 * @param {string} body
 * @returns {string[]}  alternating prose / fence segments
 */
function splitByCodeFence(body) {
  // Match a complete fenced block: opening ```[lang]\n ... \n``` (closing
  // fence on its own line). The opening fence's backticks must be at the
  // start of a line to avoid matching inline triple-backticks in prose.
  // The pattern is non-greedy so consecutive fences each form one segment.
  const fenceRe = /(^```[^\n]*\n[\s\S]*?\n```)/gm;
  return body.split(fenceRe);
}

// ---------------------------------------------------------------------------
// rewriteSlashRefs — prose-only slash rewrite
// ---------------------------------------------------------------------------

/**
 * Rewrite every in-prose `/hone-name`, `hone-name`, `/hone:name`, `gdd:name`,
 * `$hone-name`, `$gdd:name` reference to the canonical slash form for
 * `targetRuntime` (via `runtime-slash.cjs#formatGddSlash`).
 *
 * Operates on prose only — fenced code blocks pass through unchanged.
 * (For codex, that means tool calls like `Bash(command="/hone-x")` keep
 * the slash form in shell strings — those are runtime-evaluated by the
 * codex shell, not the Codex tool surface, so they must remain unchanged.)
 *
 * Inline code spans (`` `...` ``) are also passed through — they're prose
 * to the markdown renderer but Claude's literal-form quoting (`` `/hone-x` ``)
 * appears in user-facing text and should usually be rewritten too. We
 * therefore DO rewrite inside inline code spans (the regex doesn't
 * special-case them). This matches gsd-build's behavior — converters
 * rewrite slash references everywhere except fenced blocks.
 *
 * Pattern: `\b[/$]?gdd[-:][a-z0-9-]+\b` (case-insensitive on prefix; the
 * skill-name portion `[a-z0-9-]+` matches the actual skill-name
 * convention — lowercase + dashes + digits).
 *
 * Defensive: if `targetRuntime` is omitted, defaults to `'claude'` (i.e.
 * `/hone-<name>` shape).
 *
 * @param {string} body
 * @param {string} [targetRuntime]
 * @returns {string}
 */
function rewriteSlashRefs(body, targetRuntime) {
  if (typeof body !== 'string' || body === '') return body || '';
  const { formatGddSlash } = require('../runtime-slash.cjs');
  const rt = targetRuntime || 'claude';

  const segments = splitByCodeFence(body);
  // Pattern: optional `/` or `$` prefix, the canonical `hone-`/`hone:` brand
  // (or the legacy `gdd-`/`gdd:` alias, still accepted on input), then the
  // skill-name token. Skill names are lowercase + dashes + digits per
  // convention; the regex is case-insensitive on the brand letters to accept
  // malformed inputs. formatGddSlash re-emits the canonical `hone` form.
  const slashRe = /[/$]?(?:hone|gdd)[-:][a-z][a-z0-9-]*/gi;

  for (let i = 0; i < segments.length; i++) {
    // Even indices are prose; odd are fenced code blocks (passthrough).
    if (i % 2 === 1) continue;
    segments[i] = segments[i].replace(slashRe, (match) =>
      formatGddSlash(match, rt)
    );
  }
  return segments.join('');
}

// ---------------------------------------------------------------------------
// rewriteCodeFenceTools — fence-only tool-name rewrite
// ---------------------------------------------------------------------------

/**
 * Rewrite Claude tool names to runtime-equivalent names INSIDE fenced
 * code blocks only. For every `{ OldName: NewName }` in `toolMap`,
 * replace `\bOldName(` with `NewName(` in every fenced block.
 *
 * Prose mentions of tool names (e.g. "Use the Bash tool to ...") are
 * left untouched — they're documentation about the Claude vocabulary
 * and the converter's adapter header tells the user we've adapted the
 * underlying calls. Only the actual code-fenced invocation form gets
 * rewritten.
 *
 * Used by the codex converter with CODEX_TOOL_MAP. Other converters
 * pass an empty map (and the function is a no-op).
 *
 * @param {string} body
 * @param {Record<string,string>} toolMap
 * @returns {string}
 */
function rewriteCodeFenceTools(body, toolMap) {
  if (typeof body !== 'string' || body === '') return body || '';
  if (!toolMap || typeof toolMap !== 'object') return body;
  const keys = Object.keys(toolMap);
  if (keys.length === 0) return body;

  const segments = splitByCodeFence(body);
  for (let i = 0; i < segments.length; i++) {
    // Even indices are prose (skip); odd are fenced code blocks.
    if (i % 2 === 0) continue;
    let fence = segments[i];
    for (const oldName of keys) {
      const newName = toolMap[oldName];
      // \b<OldName>\(   — word boundary then literal `(`.
      // Escape the old name even though tool names are alphanumeric;
      // future map entries may include `_` or `.` (still safe under \b).
      const re = new RegExp(
        '\\b' + oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(',
        'g'
      );
      fence = fence.replace(re, newName + '(');
    }
    segments[i] = fence;
  }
  return segments.join('');
}

// ---------------------------------------------------------------------------
// ensureAdapterHeader — idempotent header injection
// ---------------------------------------------------------------------------

/**
 * Prepend a 2-line HTML comment "Auto-generated from Claude SKILL.md"
 * before the first non-blank line of `body`. Idempotent — running it
 * twice produces a single header.
 *
 * Format:
 *   `<!-- gdd: auto-generated from Claude SKILL.md. <runtimeDisplay> adapter -->\n\n`
 *
 * Detection: if `body` already contains a `<runtimeDisplay> adapter`
 * marker (anywhere in the first 500 chars — fast scan), the header is
 * NOT re-prepended. This is the idempotency guarantee.
 *
 * @param {string} body
 * @param {string} runtimeDisplay  e.g. `'Cursor'`, `'Codex'`, `'Copilot'`,
 *   `'Antigravity'`. Used inside the comment text verbatim.
 * @returns {string}
 */
function ensureAdapterHeader(body, runtimeDisplay) {
  if (typeof body !== 'string') return body;
  const display = String(runtimeDisplay || 'Adapter');

  const marker = display + ' adapter';
  // Fast scan first ~500 chars — header is always at the very top if
  // present; we don't need to scan the whole body.
  const head = body.slice(0, 500);
  if (head.indexOf(marker) !== -1) {
    return body;
  }

  const header =
    '<!-- gdd: auto-generated from Claude SKILL.md. ' +
    display +
    ' adapter -->\n\n';

  // Preserve any leading blank lines — insert the header before the
  // first non-blank line. (If body starts with blank lines, those are
  // retained between header and first real content.)
  const m = body.match(/^(\s*)([\s\S]*)$/);
  /* istanbul ignore next — regex always matches non-null body. */
  if (!m) return header + body;
  return header + m[2];
}

// ---------------------------------------------------------------------------
// buildFrontmatter — name-prefix normalization + frontmatter re-emit
// ---------------------------------------------------------------------------

/**
 * Re-emit a YAML frontmatter block. Behavior:
 *
 *   - If `originalFrontmatter` is `null` or empty, emit a minimal block
 *     containing only `name: <runtimePrefix><skillName>`.
 *   - If `originalFrontmatter` is non-empty, rewrite its `name:` field
 *     to `<runtimePrefix><skillName>` (stripping any prior `hone-` or
 *     `gsd-` prefix on the existing name to avoid `hone-hone-`-style
 *     duplication). All other fields round-trip verbatim — we do NOT
 *     parse YAML; we operate on the raw text with a line-by-line scan.
 *   - If the original has no `name:` field, prepend one.
 *
 * Returns a complete frontmatter string with leading/trailing `---`
 * delimiters and a trailing newline (ready to concatenate with body).
 *
 * @param {string|null} originalFrontmatter
 * @param {string} skillName  the bare skill name (e.g. `'sample'`,
 *   `'explore'`) WITHOUT runtime prefix.
 * @param {string} runtimePrefix  e.g. `'hone-'`.
 * @returns {string}
 */
function buildFrontmatter(originalFrontmatter, skillName, runtimePrefix) {
  // Phase 61 rebrand: callers historically pass the legacy `'gdd-'` literal
  // (and the D-05 frozen file-drop converters MUST stay byte-identical, so we
  // cannot edit their call sites). Normalize any legacy brand prefix to the
  // canonical seam value here so the emitted `name:` carries `hone-`.
  let prefix = String(runtimePrefix || '');
  if (/^(hone-|gsd-)$/i.test(prefix)) prefix = SKILL_PREFIX;
  // Normalize input name: strip any prior hone-/hone-/gsd- prefix
  // (case-insensitive) so we never emit hone-hone-foo (or legacy gdd-gdd-foo).
  const bareName = String(skillName || '').replace(/^(hone-|gdd-|gsd-)/i, '');
  const finalName = prefix + bareName;

  if (!originalFrontmatter || originalFrontmatter.trim() === '') {
    return '---\nname: ' + finalName + '\n---\n';
  }

  // Line-by-line rewrite of the `name:` field. We never touch description,
  // tools, or any other field — they round-trip verbatim.
  const lines = originalFrontmatter.split(/\r?\n/);
  let nameSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*name\s*:\s*)(.*)$/);
    if (m) {
      nameSeen = true;
      // Replace the value with `finalName`. Preserve surrounding quotes
      // if the original value had them (very common in SKILL.md sources
      // — `name: "hone-help"`).
      const quoted = m[2].match(/^["'](.*)["']\s*$/);
      const replacement = quoted ? '"' + finalName + '"' : finalName;
      lines[i] = m[1] + replacement;
      break;  // only rewrite the first `name:` occurrence
    }
  }
  if (!nameSeen) {
    // Prepend a `name:` line if the original had none.
    lines.unshift('name: ' + finalName);
  }

  return '---\n' + lines.join('\n') + '\n---\n';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  extractFrontmatterAndBody,
  rewriteSlashRefs,
  rewriteCodeFenceTools,
  ensureAdapterHeader,
  buildFrontmatter,
  CODEX_TOOL_MAP,
  SKILL_PREFIX,
};
