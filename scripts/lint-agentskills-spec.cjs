#!/usr/bin/env node
'use strict';
/**
 * scripts/lint-agentskills-spec.cjs — agentskills.io spec lint.
 *
 * Phase 28.8 Plan 28-8-A1 (D-13 `lint-only` outcome).
 * See .planning/research/agentskills-io-2026-05-19.md § Implementation Implications
 * → Plan 28-8-A1 — what to ship — for the source-of-truth rule list.
 *
 * Walks `skills/<name>/SKILL.md` and applies the following rules per skill:
 *
 *   R1 (FAIL) — frontmatter contains a non-empty `name`.
 *   R2 (FAIL) — `name` matches /^[a-z0-9]+(-[a-z0-9]+)*$/ AND length ≤ 64.
 *   R3 (FAIL) — `name` matches the parent directory (allow bare slug OR `gdd-`-prefixed
 *               slug, because source-tree uses bare and install-tree uses prefixed per
 *               Phase 28.7 D-05).
 *   R4 (FAIL) — `description` is non-empty AND ≤ 1024 chars (spec hard cap).
 *   R5 (FAIL) — SKILL.md body line count ≤ 500 (spec readability guidance).
 *
 *   W1 (WARN) — both `tools` and `allowed-tools` are present. `allowed-tools` is marked
 *               Experimental in the spec; pick one form to avoid drift.
 *   W2 (WARN) — description length > 200 chars (Phase 28.5 D-01 advisory; distinct
 *               from R4's 1024-char hard cap).
 *   W3        — reserved slot (covered today by R2). No emission.
 *
 * CLI:
 *   node scripts/lint-agentskills-spec.cjs               # default: lint ./skills
 *   node scripts/lint-agentskills-spec.cjs <dir>         # lint <dir>/<name>/SKILL.md
 *   node scripts/lint-agentskills-spec.cjs --json        # emit JSON instead of table
 *
 * Exit codes:
 *   0 — no FAIL rows (WARN rows do NOT fail the run)
 *   1 — at least one FAIL row
 *   2 — internal error (I/O failure, parse exception, bad CLI arg)
 *
 * Empty / missing skills directory:
 *   Prints `Lint: no skills found at <dir> — nothing to lint.` and exits 0.
 *
 * Exports (for tests):
 *   lint(skillsDir, opts?) → { rows, summary, emptyDir }
 *   main(argv) → number (exit code; pure — does NOT call process.exit)
 *   parseFrontmatter(content) → { frontmatter, body, hasFrontmatter }
 *   lintSkill(skillDir, skillName) → Array<{status, skill, rule, detail}>
 */

const fs = require('fs');
const path = require('path');

const NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX = 64;
const DESC_MAX = 1024;
const DESC_ADVISORY = 200;
const BODY_MAX_LINES = 500;
const DETAIL_TRUNCATE = 100;

/**
 * Parse YAML-ish frontmatter at the top of a markdown document.
 *
 * Zero-dep: handles only what our Phase 28.5 frontmatter contract emits:
 * - leading `---\n` block delimited by `\n---\n`
 * - scalar `key: value` lines (no nested maps, no arrays)
 * - surrounding single or double quotes stripped from value
 * - for values containing colons (URLs in description), the substring after the FIRST `:`
 *   is taken — so `description: "https://example.com"` works.
 *
 * Returns:
 *   { frontmatter: object, body: string, hasFrontmatter: boolean }
 *
 * If the opening delimiter is missing or the closing delimiter is not found, returns
 * `hasFrontmatter: false` with `frontmatter: {}` and `body` set to the original content.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content, hasFrontmatter: false };
  }
  const block = match[1];
  const body = match[2];
  const frontmatter = {};
  const lines = block.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Lint a single skill directory. Returns one or more rows.
 *
 * Row shape: { status: 'PASS'|'WARN'|'FAIL', skill: string, rule: string, detail: string }
 *
 * If no rule fires, returns a single PASS row with rule='-' and detail='-'.
 */
function lintSkill(skillDir, skillName) {
  const skillPath = path.join(skillDir, 'SKILL.md');
  let content;
  try {
    content = fs.readFileSync(skillPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [
        {
          status: 'FAIL',
          skill: skillName,
          rule: 'IO',
          detail: 'SKILL.md not found',
        },
      ];
    }
    throw err;
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const rows = [];

  const name = (frontmatter.name || '').trim();
  const description = (frontmatter.description || '').trim();
  const hasTools = Object.prototype.hasOwnProperty.call(frontmatter, 'tools');
  const hasAllowedTools = Object.prototype.hasOwnProperty.call(frontmatter, 'allowed-tools');

  // R1
  if (!name) {
    rows.push({
      status: 'FAIL',
      skill: skillName,
      rule: 'R1',
      detail: 'frontmatter missing or empty `name`',
    });
  } else {
    // R2
    if (!NAME_REGEX.test(name) || name.length > NAME_MAX) {
      rows.push({
        status: 'FAIL',
        skill: skillName,
        rule: 'R2',
        detail: `name "${name}" fails slug regex /^[a-z0-9]+(-[a-z0-9]+)*$/ or exceeds ${NAME_MAX} chars`,
      });
    }
    // R3 — name must match parent dir (bare or gdd-prefixed)
    if (
      name !== skillName &&
      name !== `gdd-${skillName}` &&
      skillName !== `gdd-${name}`
    ) {
      rows.push({
        status: 'FAIL',
        skill: skillName,
        rule: 'R3',
        detail: `name "${name}" does not match parent dir "${skillName}" (allowed: bare slug or gdd-prefixed slug per Phase 28.7 D-05)`,
      });
    }
  }

  // R4
  if (!description) {
    rows.push({
      status: 'FAIL',
      skill: skillName,
      rule: 'R4',
      detail: 'description missing or empty',
    });
  } else if (description.length > DESC_MAX) {
    rows.push({
      status: 'FAIL',
      skill: skillName,
      rule: 'R4',
      detail: `description: ${description.length} chars (>${DESC_MAX} hard cap)`,
    });
  }

  // R5 — body line count
  const bodyLines = body ? body.split(/\r?\n/).length : 0;
  if (bodyLines > BODY_MAX_LINES) {
    rows.push({
      status: 'FAIL',
      skill: skillName,
      rule: 'R5',
      detail: `body ${bodyLines} lines (>${BODY_MAX_LINES} spec guidance)`,
    });
  }

  // W1 — both tools and allowed-tools present
  if (hasTools && hasAllowedTools) {
    rows.push({
      status: 'WARN',
      skill: skillName,
      rule: 'W1',
      detail: '`tools` and `allowed-tools` both present; spec marks `allowed-tools` Experimental — pick one to avoid drift',
    });
  }

  // W2 — description over advisory cap but under hard cap
  if (
    description &&
    description.length > DESC_ADVISORY &&
    description.length <= DESC_MAX
  ) {
    rows.push({
      status: 'WARN',
      skill: skillName,
      rule: 'W2',
      detail: `description: ${description.length} chars (>${DESC_ADVISORY} advisory cap, Phase 28.5 D-01)`,
    });
  }

  // W3 — reserved (covered by R2).

  if (rows.length === 0) {
    rows.push({
      status: 'PASS',
      skill: skillName,
      rule: '-',
      detail: '-',
    });
  }
  return rows;
}

/**
 * Walk a skills directory and lint each child subdirectory containing SKILL.md.
 *
 * Returns:
 *   { rows: Array, summary: {total, pass, warn, fail}, emptyDir: boolean }
 */
function lint(skillsDir, opts) {
  const _opts = opts || {};
  if (!fs.existsSync(skillsDir)) {
    return {
      rows: [],
      summary: { total: 0, pass: 0, warn: 0, fail: 0 },
      emptyDir: true,
    };
  }
  let stat;
  try {
    stat = fs.statSync(skillsDir);
  } catch (err) {
    return {
      rows: [],
      summary: { total: 0, pass: 0, warn: 0, fail: 0 },
      emptyDir: true,
    };
  }
  if (!stat.isDirectory()) {
    return {
      rows: [],
      summary: { total: 0, pass: 0, warn: 0, fail: 0 },
      emptyDir: true,
    };
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skillDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, 'SKILL.md')))
    .sort();

  if (skillDirs.length === 0) {
    return {
      rows: [],
      summary: { total: 0, pass: 0, warn: 0, fail: 0 },
      emptyDir: true,
    };
  }

  const rows = [];
  for (const skillName of skillDirs) {
    const skillDir = path.join(skillsDir, skillName);
    const skillRows = lintSkill(skillDir, skillName);
    for (const row of skillRows) rows.push(row);
  }

  const summary = {
    total: skillDirs.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    warn: rows.filter((r) => r.status === 'WARN').length,
    fail: rows.filter((r) => r.status === 'FAIL').length,
  };

  return { rows, summary, emptyDir: false };
}

/**
 * Format the row set as an aligned plain-text table.
 *
 * Columns: STATUS  SKILL  RULE  DETAIL
 * DETAIL is truncated to DETAIL_TRUNCATE chars with a `…` suffix for terminal sanity.
 */
function formatTable(rows) {
  const headers = ['STATUS', 'SKILL', 'RULE', 'DETAIL'];
  const display = rows.map((r) => {
    let detail = String(r.detail);
    if (detail.length > DETAIL_TRUNCATE) {
      detail = detail.slice(0, DETAIL_TRUNCATE) + '…';
    }
    return [r.status, r.skill, r.rule, detail];
  });
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...display.map((row) => row[i].length))
  );
  const pad = (cells) =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const out = [pad(headers), sep];
  for (const row of display) out.push(pad(row));
  return out.join('\n');
}

/**
 * Main CLI entry. Pure — returns exit code rather than calling process.exit.
 *
 * argv is the argv slice AFTER node + script (i.e. process.argv.slice(2)).
 */
function main(argv) {
  try {
    let skillsDir = './skills';
    let jsonMode = false;
    for (const arg of argv) {
      if (arg === '--json') {
        jsonMode = true;
      } else if (arg === '--help' || arg === '-h') {
        process.stdout.write(
          'lint-agentskills-spec.cjs — agentskills.io spec lint over skills/<name>/SKILL.md\n' +
            '\n' +
            'Usage:\n' +
            '  node scripts/lint-agentskills-spec.cjs [<dir>] [--json]\n' +
            '\n' +
            'Exit codes:\n' +
            '  0  no FAIL rows (WARN rows do NOT fail the run)\n' +
            '  1  at least one FAIL row\n' +
            '  2  internal error\n'
        );
        return 0;
      } else if (arg.startsWith('--')) {
        process.stderr.write(`lint-agentskills-spec: unknown flag: ${arg}\n`);
        return 2;
      } else {
        skillsDir = arg;
      }
    }

    const result = lint(skillsDir);

    if (result.emptyDir) {
      process.stdout.write(
        `Lint: no skills found at ${skillsDir} — nothing to lint.\n`
      );
      return 0;
    }

    if (jsonMode) {
      process.stdout.write(
        JSON.stringify({ rows: result.rows, summary: result.summary }, null, 2) +
          '\n'
      );
    } else {
      process.stdout.write(formatTable(result.rows) + '\n');
      const { total, pass, warn, fail } = result.summary;
      process.stdout.write(
        `\nLint summary: ${total} skills, ${pass} PASS, ${warn} WARN, ${fail} FAIL\n`
      );
    }

    return result.summary.fail > 0 ? 1 : 0;
  } catch (err) {
    process.stderr.write(
      `lint-agentskills-spec: internal error: ${err && err.message ? err.message : err}\n`
    );
    return 2;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { lint, main, parseFrontmatter, lintSkill };
