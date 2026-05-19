'use strict';

/**
 * scripts/lib/install/converters/cline.cjs — Phase 28.7 (Plan 28.7-06).
 *
 * Cline SKILL.md converter — SPECIAL CASE per Phase 28.7 D-09.
 *
 * Cline does not have a `skills/<name>/SKILL.md` directory model. Per
 * `runtime-artifact-layout.cjs#cline`, its `kinds: []` is intentionally
 * empty and `layout.specialCase = 'clinerules-embed'` routes through
 * this converter. Instead of one SKILL.md file per skill, all installed
 * skills are concatenated into a single `.clinerules` file written at
 * `<cline-config>/.clinerules`. That file contains a stack of markdown
 * rule-blocks, one per skill, with a `## gdd-<skillName>` heading and
 * description + body prose.
 *
 * This file exports TWO functions:
 *
 *   1. `convert(content, skillName, opts) → string`
 *      Converts ONE Claude-source SKILL.md into a `.clinerules`-format
 *      rule-block. The block is a markdown fragment — NOT a complete
 *      file. The installer (Plan 28.7-08) invokes this for each skill,
 *      accumulates the blocks, then calls `buildClinerulesFile` to
 *      assemble the final file.
 *
 *   2. `buildClinerulesFile(skillBlocks) → string`
 *      Concatenates an array of `{ name, block }` entries into the
 *      final `.clinerules` file content. Prepends a 4-line header
 *      explaining the file's origin (auto-generated from gdd skills).
 *
 * Output shape (one block):
 *
 *     ## gdd-<skillName>
 *
 *     <description from source frontmatter>
 *
 *     <body content, slash-rewritten, prose preserved>
 *
 * The block contains NO YAML frontmatter (cline rules are pure
 * markdown), NO `<!-- ... adapter -->` HTML comment (rules-format does
 * not embed adapter headers), and NO `name:` field — the `## gdd-<name>`
 * heading IS the skill identifier in cline's rule-block model.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. gsd-build's equivalent path is the `cline: kinds: []` +
 * `.clinerules` write special-case in their bin/install.js monolith;
 * our modular factor moves the rule-block emission here and lets the
 * installer (Plan 28.7-08) handle the disk write.
 *
 * Wave-3 scope note: this is the only special-case converter in Wave 3
 * (Plan 28.7-06). The other Wave 3 converter (codebuddy.cjs) follows
 * the uniform skills-dir pattern. Per Phase 28.7 D-10, hermes is OUT of
 * scope — no hermes.cjs is created. Hermes was the other special-case
 * runtime in gsd-build's full set (nested skills/gsd/<name>/ layout per
 * upstream #2841), but it is intentionally absent from GDD's 14-runtime
 * set (Phase 24 D-02 runtime list invariant — see Phase 28.7 D-03).
 *
 * Pure / side-effect-free: no fs, no env, no path. Both exports are
 * deterministic string → string transforms; the installer writes the
 * assembled file via its own fs surface.
 */

const shared = require('./shared.cjs');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `description:` value from a frontmatter block.
 *
 * Matches the first `description: <value>` line; tolerates leading
 * whitespace, surrounding quotes (single or double), and CRLF endings.
 * Returns the trimmed value string, or `''` if not present.
 *
 * Note: we don't parse YAML here — a single regex over the raw
 * frontmatter is sufficient because SKILL.md descriptions are always
 * single-line strings (multi-line YAML scalars are not used in the
 * GDD source set).
 *
 * @param {string|null} frontmatter
 * @returns {string}
 */
function extractDescription(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'string') return '';
  const m = frontmatter.match(/^\s*description\s*:\s*(.*)$/m);
  if (!m) return '';
  let v = m[1].trim();
  // Strip surrounding quotes if present.
  const quoted = v.match(/^["'](.*)["']$/);
  if (quoted) v = quoted[1];
  return v;
}

/**
 * Normalize the skill name by stripping any prior `gdd-`/`gsd-` prefix
 * (case-insensitive) so we never emit `gdd-gdd-foo`. Matches
 * `shared.buildFrontmatter`'s normalization for consistency.
 *
 * @param {string} skillName
 * @returns {string}
 */
function normalizeSkillName(skillName) {
  return String(skillName || '').replace(/^(gdd-|gsd-)/i, '');
}

// ---------------------------------------------------------------------------
// convert — produce a single rule-block for one skill
// ---------------------------------------------------------------------------

/**
 * Convert ONE Claude-source SKILL.md into a `.clinerules`-format rule
 * block (a markdown fragment, not a complete file).
 *
 * The returned block has this shape:
 *
 *     ## gdd-<skillName>
 *
 *     <description if present>
 *
 *     <body content, slash-rewritten via rewriteSlashRefs(body, 'cline')>
 *
 * Trailing newline is included; leading whitespace is stripped from the
 * body so the heading is the first non-blank line. The installer
 * (Plan 28.7-08) accumulates these blocks and joins them via
 * `buildClinerulesFile`.
 *
 * @param {string} content        Full source SKILL.md content (frontmatter + body).
 * @param {string} skillName      The bare skill name (e.g. `'help'`, `'explore'`).
 *   `gdd-`/`gsd-` prefixes are stripped to prevent double-prefix.
 * @param {{ runtime?: string }} [opts]  Optional context — `runtime` defaults
 *   to `'cline'`. Currently informational only.
 * @returns {string}  The rule-block markdown fragment.
 */
function convert(content, skillName, opts) {
  const { frontmatter, body } = shared.extractFrontmatterAndBody(content);
  const description = extractDescription(frontmatter);
  const bareName = normalizeSkillName(skillName);

  // Slash refs rewrite to `/gdd-name` form — cline accepts Claude-shape
  // slashes (runtime-slash.cjs emits `/gdd-` for every non-codex runtime,
  // and cline is not codex). Trim leading/trailing whitespace so the
  // heading directly precedes the body content.
  const prose = shared.rewriteSlashRefs(body, 'cline').trim();

  const heading = `## gdd-${bareName}`;
  const descLine = description ? `${description}\n\n` : '';

  return `${heading}\n\n${descLine}${prose}\n`;
}

// ---------------------------------------------------------------------------
// buildClinerulesFile — assemble the final .clinerules file content
// ---------------------------------------------------------------------------

/**
 * Assemble a final `.clinerules` file from an array of per-skill blocks.
 *
 * Prepends a 4-line header citing the gdd origin so anyone reading the
 * generated `.clinerules` file knows it is auto-generated and the
 * authoritative source is the upstream SKILL.md files. Blocks are
 * separated by a blank line (`\n\n`), and the file ends with a single
 * trailing newline.
 *
 * Called by Plan 28.7-08's installer after invoking `convert()` on each
 * skill. Pure transform — does NOT write to disk.
 *
 * Accepts either of two shapes per entry (for installer flexibility):
 *   - `{ name: string, block: string }` — preferred, name is informational
 *   - `{ skillName: string, content: string }` — alternative legacy/test shape
 *
 * @param {Array<{ name?: string, skillName?: string, block?: string, content?: string }>} skillBlocks
 * @returns {string}  The full `.clinerules` content (ready to write).
 */
function buildClinerulesFile(skillBlocks) {
  const header = [
    '# get-design-done rules',
    '',
    '<!-- Auto-generated from gdd SKILL.md sources. Edit upstream skills, not this file. -->',
    '',
  ].join('\n');

  // Defensive: empty / non-array → header-only file.
  if (!Array.isArray(skillBlocks) || skillBlocks.length === 0) {
    return header + '\n';
  }

  const body = skillBlocks
    .map((entry) => {
      // Accept either `block` or `content` keys.
      if (!entry || typeof entry !== 'object') return '';
      const text = typeof entry.block === 'string'
        ? entry.block
        : typeof entry.content === 'string'
          ? entry.content
          : '';
      return text.trim();
    })
    .filter((s) => s.length > 0)
    .join('\n\n');

  return header + body + '\n';
}

module.exports = { convert, buildClinerulesFile };
