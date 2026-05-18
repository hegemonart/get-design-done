#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-skill-length.cjs — Phase 28.5 skill-authoring-contract validator.
 *
 * Walks skills/, validates per D-01/D-02/D-09/D-11:
 *   - Frontmatter required: name, description
 *   - description length: 20 <= len <= 1024 chars (always strict)
 *   - description format (--strict-description / STRICT_DESCRIPTION=1):
 *     regex `\. Use when .+\.$` (advisory by default per D-02)
 *   - SKILL.md lines: >=250 block, >=100 warn (D-01)
 *   - disable-model-invocation: only on D-09 whitelist
 *
 * Exit codes:
 *   0  clean (no warnings, no blockers)
 *   1  warnings only (>=100 lines but <250 on at least one skill, no other failures)
 *   2  blockers present (>=250 lines, frontmatter missing/invalid, description out of range, etc.)
 *
 * CLI flags:
 *   --quiet               Suppress per-skill output, print summary only.
 *   --strict-description  Enforce `<what>. Use when <triggers>.` regex on description.
 *   --json                Emit machine-readable JSON instead of human-readable text.
 *   --help, -h            Print this usage message.
 *
 * Env:
 *   STRICT_DESCRIPTION=1  Equivalent to --strict-description.
 *   SKILLS_DIR=<path>     Override skills directory (default: ./skills relative to cwd).
 *
 * See reference/skill-authoring-contract.md for the full contract.
 *
 * Line counting: counts every line in the file via split on /\r?\n/ and drops a single
 * trailing empty entry — matches `wc -l` semantics. We count ALL lines (including blanks
 * and comments) because that is what consumes agent context. This mirrors the same
 * counting convention used by tests/agent-size-budget.test.cjs.
 *
 * Validator does NOT enforce skill renames (D-05/D-07) — frontmatter.name is checked for
 * presence only, never compared against a canonical-name list. Whitelist key for
 * disable-model-invocation uses the skill folder name (skills/<dir>/SKILL.md), not the
 * frontmatter.name field.
 */

const fs = require('fs');
const path = require('path');

const WARN_LINES = 100;
const BLOCK_LINES = 250;
const DESC_MIN = 20;
const DESC_MAX = 1024;
// Strict-mode regex: trailing ". Use when <something>." sentence.
// Multiline + non-greedy to tolerate descriptions split across YAML lines.
const STRICT_RE = /\. Use when .+\.\s*$/m;

// D-09 whitelist — skills permitted to set disable-model-invocation: true.
// Keyed on skill folder name (skills/<folder>/SKILL.md), not frontmatter.name.
const DISABLE_INVOCATION_WHITELIST = new Set([
  'help', 'stats', 'note', 'add-backlog', 'todo', 'health', 'settings',
  'next', 'pause', 'resume', 'fast', 'quick', 'pr-branch', 'ship',
  'reapply-patches', 'list-assumptions', 'plant-seed', 'review-backlog',
  'cache-manager', 'warm-cache', 'synthesize', 'timeline', 'start',
  'recall', 'continue', 'update', 'undo', 'zoom-out',
]);

function parseArgs(argv) {
  const flags = { quiet: false, strict: false, json: false };
  for (const a of argv.slice(2)) {
    if (a === '--quiet') flags.quiet = true;
    else if (a === '--strict-description') flags.strict = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { process.stderr.write(`unknown flag: ${a}\n`); process.exit(2); }
  }
  if (process.env.STRICT_DESCRIPTION === '1') flags.strict = true;
  return flags;
}

function printHelp() {
  process.stdout.write([
    'validate-skill-length.cjs — Phase 28.5 skill-authoring-contract validator',
    '',
    'Usage: node scripts/validate-skill-length.cjs [--quiet] [--strict-description] [--json]',
    '',
    'Flags:',
    '  --quiet               Suppress per-skill output, print summary only.',
    '  --strict-description  Enforce `<what>. Use when <triggers>.` regex on description.',
    '  --json                Emit machine-readable JSON.',
    '  --help, -h            Show this message.',
    '',
    'Env:',
    '  STRICT_DESCRIPTION=1  Equivalent to --strict-description.',
    '  SKILLS_DIR=<path>     Override skills directory (default: ./skills).',
    '',
    'Exit codes: 0=clean, 1=warnings only, 2=blockers present.',
    '',
    'See reference/skill-authoring-contract.md for the full contract.',
    '',
  ].join('\n'));
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { ok: false, error: 'missing-frontmatter' };
  }
  // Find the closing `\n---` after the opening one.
  const end = content.indexOf('\n---', 4);
  if (end < 0) return { ok: false, error: 'unterminated-frontmatter' };
  const block = content.slice(4, end);
  const fields = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$/);
    if (m) {
      let value = m[2];
      // Strip wrapping quotes (single or double).
      if (value.length >= 2 &&
          ((value.startsWith('"') && value.endsWith('"')) ||
           (value.startsWith("'") && value.endsWith("'")))) {
        value = value.slice(1, -1);
      }
      // Multi-line description folding: when description: is followed by empty value,
      // gather continuation lines until the next `key:` line.
      if (m[1] === 'description' && value === '') {
        const parts = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (/^[a-zA-Z][a-zA-Z0-9_-]*:/.test(lines[j])) break;
          parts.push(lines[j].trim());
        }
        value = parts.join(' ').trim();
      }
      fields[m[1]] = value;
    }
  }
  return { ok: true, fields, bodyStart: end + 4 };
}

function countLines(content) {
  if (!content) return 0;
  const lines = content.split(/\r?\n/);
  // wc -l semantics: drop a single trailing empty entry (the newline-terminated final line).
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function validateSkill(skillName, skillPath, flags) {
  const result = {
    name: skillName,
    path: skillPath,
    lines: 0,
    descriptionLength: 0,
    hasRequiredFields: false,
    level: 'clean',
    errors: [],
    warnings: [],
    reasons: [],
  };
  let content;
  try {
    content = fs.readFileSync(skillPath, 'utf8');
  } catch (e) {
    result.errors.push({ code: 'read-failed', message: e.message });
    result.level = 'block';
    result.reasons.push(`read-failed: ${e.message}`);
    return result;
  }
  result.lines = countLines(content);

  const fm = parseFrontmatter(content);
  if (!fm.ok) {
    result.errors.push({ code: 'frontmatter', message: fm.error });
    result.reasons.push(`frontmatter: ${fm.error}`);
    result.level = 'block';
    return result;
  }
  const hasName = Boolean(fm.fields.name);
  const hasDesc = Boolean(fm.fields.description);
  result.hasRequiredFields = hasName && hasDesc;
  if (!hasName) {
    result.errors.push({ code: 'missing-name', message: 'frontmatter.name required' });
    result.reasons.push('missing-name');
  }
  if (!hasDesc) {
    result.errors.push({ code: 'missing-description', message: 'frontmatter.description required' });
    result.reasons.push('missing-description');
  } else {
    const d = fm.fields.description;
    result.descriptionLength = d.length;
    if (d.length < DESC_MIN) {
      result.errors.push({ code: 'description-too-short', message: `${d.length} chars; require >=${DESC_MIN}` });
      result.reasons.push(`description-too-short: ${d.length}`);
    }
    if (d.length > DESC_MAX) {
      result.errors.push({ code: 'description-too-long', message: `${d.length} chars; require <=${DESC_MAX}` });
      result.reasons.push(`description-too-long: ${d.length}`);
    }
    if (flags.strict && !STRICT_RE.test(d)) {
      result.errors.push({ code: 'description-format', message: 'strict mode: missing ". Use when <triggers>." suffix' });
      result.reasons.push('description-format');
    }
  }
  const dmi = fm.fields['disable-model-invocation'];
  if (dmi !== undefined) {
    if (dmi !== 'true' && dmi !== 'false') {
      // Tolerate quoted "true"/"false" — parseFrontmatter strips quotes.
      // Any other shape (e.g. raw "True", "yes") is a block.
      result.errors.push({ code: 'disable-model-invocation-shape', message: `disable-model-invocation must be the boolean true|false, got "${dmi}"` });
      result.reasons.push(`disable-model-invocation-shape: ${dmi}`);
    } else if (dmi === 'true' && !DISABLE_INVOCATION_WHITELIST.has(skillName)) {
      result.errors.push({ code: 'disable-model-invocation', message: `${skillName} not on D-09 whitelist` });
      result.reasons.push('disable-model-invocation-not-whitelisted');
    }
  }
  if (result.lines >= BLOCK_LINES) {
    result.errors.push({ code: 'block-lines', message: `${result.lines} lines; block threshold ${BLOCK_LINES}` });
    result.reasons.push(`block-lines: ${result.lines}`);
  } else if (result.lines >= WARN_LINES) {
    result.warnings.push({ code: 'warn-lines', message: `${result.lines} lines; warn threshold ${WARN_LINES}` });
    result.reasons.push(`warn-lines: ${result.lines}`);
  }
  if (result.errors.length > 0) result.level = 'block';
  else if (result.warnings.length > 0) result.level = 'warn';
  else result.level = 'clean';
  return result;
}

function walkSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (fs.existsSync(skillFile)) out.push({ name: entry.name, path: skillFile });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  const flags = parseArgs(process.argv);
  const root = process.cwd();
  const skillsDir = process.env.SKILLS_DIR || path.join(root, 'skills');
  const skills = walkSkills(skillsDir);
  const results = skills.map(s => validateSkill(s.name, s.path, flags));

  const summary = {
    total: results.length,
    clean: results.filter(r => r.level === 'clean').length,
    warnings: results.filter(r => r.level === 'warn').length,
    blockers: results.filter(r => r.level === 'block').length,
  };

  if (flags.json) {
    process.stdout.write(JSON.stringify({ summary, skills: results }, null, 2) + '\n');
  } else {
    if (!flags.quiet) {
      for (const r of results) {
        if (r.level === 'clean') continue;
        process.stdout.write(`${r.name} (${r.lines} lines):\n`);
        for (const e of r.errors) process.stdout.write(`  BLOCK ${e.code}: ${e.message}\n`);
        for (const w of r.warnings) process.stdout.write(`  WARN  ${w.code}: ${w.message}\n`);
      }
    }
    process.stdout.write(`\nSummary: ${summary.total} skills | ${summary.clean} clean | ${summary.warnings} warn | ${summary.blockers} block\n`);
  }

  if (summary.blockers > 0) process.exit(2);
  if (summary.warnings > 0) process.exit(1);
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  parseFrontmatter,
  countLines,
  validateSkill,
  walkSkills,
  parseArgs,
  DISABLE_INVOCATION_WHITELIST,
  WARN_LINES,
  BLOCK_LINES,
  DESC_MIN,
  DESC_MAX,
  STRICT_RE,
};
