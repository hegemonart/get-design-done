'use strict';
// scripts/lib/mcp-tools-lint/index.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-03 — static lint for the gdd-mcp tools directory.
//
// 4 invariants enforced (origin: Phase 27.7 CONTEXT decisions):
//
//   forbid-fs-path (D-06):  No direct `node:fs`/`node:path` (or bare `fs`/
//                           `path`) imports inside individual tool .ts
//                           files. Tools must be thin wrappers — all
//                           filesystem I/O routes through scripts/lib/*
//                           helpers (gdd-state, intel-store, etc.). The
//                           `index.ts` and `shared.ts` siblings ARE
//                           infrastructure and are exempt.
//
//   max-loc (D-06):         Each tool .ts file ≤ 30 non-blank-non-comment
//                           LOC. Exempt: index.ts, shared.ts.
//
//   no-write-names (D-04):  Hard-block every write-verb tool name. A tool
//                           name matching /_(create|update|delete|append|
//                           clear|write|set)(_|$)/ is rejected. The MCP
//                           server is read-only by design.
//
//   tool-count-cap (D-03):  ≤ 12 files matching `gdd_*.ts` glob in the
//                           tools directory. Hard cap. Adding a 13th tool
//                           requires re-scoping in a new plan.
//
// Public API:
//   lintMcpToolsDir({dir, maxLoc?, toolCap?, exemptions?}) →
//     { violations: LintViolation[], summary: { files_scanned, violations_count } }
//
// Consumed by tests/gdd-mcp-tools-lint.test.cjs and
// tests/phase-27-7-baseline.test.cjs (Plan 27.7-07).

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_EXEMPTIONS = new Set(['index.ts', 'shared.ts']);
const DEFAULT_MAX_LOC = 30;
const DEFAULT_TOOL_CAP = 12;
const TOOL_FILE_GLOB = /^gdd_[a-z0-9_]+\.ts$/;

const FORBIDDEN_IMPORT_PATTERNS = Object.freeze([
  /from\s+['"]node:fs['"]/,
  /from\s+['"]node:fs\/promises['"]/,
  /from\s+['"]node:path['"]/,
  /from\s+['"]fs['"]/,
  /from\s+['"]path['"]/,
  /require\s*\(\s*['"]node:fs['"]\s*\)/,
  /require\s*\(\s*['"]node:fs\/promises['"]\s*\)/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /require\s*\(\s*['"]node:path['"]\s*\)/,
  /require\s*\(\s*['"]path['"]\s*\)/,
]);

// Write-verb pattern: matches when the verb is preceded by `_` and either
// followed by `_` or end-of-string. e.g. `gdd_decision_append` matches;
// `gdd_appendix_list` does NOT (the verb must be the trailing token of a
// `_`-separated name).
const WRITE_NAME_PATTERN = /_(create|update|delete|append|clear|write|set)(?:_|$)/;

const RULES = Object.freeze([
  'forbid-fs-path',
  'max-loc',
  'no-write-names',
  'tool-count-cap',
]);

/**
 * Count non-blank-non-comment lines.
 * - Blank lines (whitespace-only) → excluded.
 * - Lines whose first non-whitespace char is `//` (line comment) → excluded.
 * - Lines starting with `/*` or `*` (block comment opener/continuation) → excluded.
 */
function countLoc(text) {
  return text.split('\n').filter((line) => {
    const t = line.trim();
    if (t.length === 0) return false;
    if (t.startsWith('//')) return false;
    if (t.startsWith('/*')) return false;
    if (t.startsWith('*')) return false;
    return true;
  }).length;
}

/**
 * Scan source text line-by-line for the FORBIDDEN_IMPORT_PATTERNS.
 * Returns [{rule, line, message}, …] (file is filled by the caller).
 */
function scanForbiddenImports(text) {
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of FORBIDDEN_IMPORT_PATTERNS) {
      const m = line.match(re);
      if (m) {
        violations.push({
          rule: 'forbid-fs-path',
          line: i + 1,
          message: 'forbidden import: ' + m[0],
        });
        break; // one violation per line is enough.
      }
    }
  }
  return violations;
}

/**
 * Extract the `export const name = '…'` value. Tolerates `"` or `'` quotes
 * and arbitrary whitespace. Returns {name, line} or null.
 */
function extractToolName(text) {
  const lines = text.split('\n');
  const re = /export\s+const\s+name\s*(?::\s*[A-Za-z<>{}\s,|]+)?\s*=\s*['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) return { name: m[1], line: i + 1 };
  }
  return null;
}

/**
 * Main entry point. Scans `dir` for *.ts files, applies the 4 rules,
 * and returns a structured result.
 *
 * @param {{dir: string, maxLoc?: number, toolCap?: number, exemptions?: Set<string>}} opts
 * @returns {{violations: Array<{file: string, rule: string, line: number, message: string}>, summary: {files_scanned: number, violations_count: number}}}
 */
function lintMcpToolsDir(opts) {
  if (!opts || typeof opts.dir !== 'string' || opts.dir.length === 0) {
    throw new Error('lintMcpToolsDir: opts.dir is required');
  }
  const dir = opts.dir;
  const maxLoc = typeof opts.maxLoc === 'number' ? opts.maxLoc : DEFAULT_MAX_LOC;
  const toolCap =
    typeof opts.toolCap === 'number' ? opts.toolCap : DEFAULT_TOOL_CAP;
  const exemptions =
    opts.exemptions instanceof Set ? opts.exemptions : DEFAULT_EXEMPTIONS;

  const violations = [];

  const entries = fs.readdirSync(dir);
  const tsFiles = entries.filter((e) => e.endsWith('.ts'));

  // Rule D — tool-count-cap (matches `gdd_*.ts` files only; index/shared
  // never count toward the cap).
  const toolFiles = entries.filter((e) => TOOL_FILE_GLOB.test(e));
  if (toolFiles.length > toolCap) {
    violations.push({
      file: dir,
      rule: 'tool-count-cap',
      line: 0,
      message: 'count=' + toolFiles.length + ' > cap=' + toolCap,
    });
  }

  // Rules A, B, C — per-file scans.
  for (const fname of tsFiles) {
    const text = fs.readFileSync(path.join(dir, fname), 'utf8');
    const isExempt = exemptions.has(fname);

    // Rule A — forbid-fs-path (skip exemptions).
    if (!isExempt) {
      const fsViolations = scanForbiddenImports(text);
      for (const v of fsViolations) {
        violations.push({ file: fname, ...v });
      }
    }

    // Rule B — max-loc (skip exemptions).
    if (!isExempt) {
      const loc = countLoc(text);
      if (loc > maxLoc) {
        violations.push({
          file: fname,
          rule: 'max-loc',
          line: 0,
          message: 'loc=' + loc + ' > max=' + maxLoc,
        });
      }
    }

    // Rule C — no-write-names. Applies to ALL ts files including
    // exemptions (you should not even define a write-named symbol in
    // index.ts or shared.ts — that would be a different bug).
    const ext = extractToolName(text);
    if (ext && WRITE_NAME_PATTERN.test(ext.name)) {
      violations.push({
        file: fname,
        rule: 'no-write-names',
        line: ext.line,
        message: 'write tool name: ' + ext.name,
      });
    }
  }

  return {
    violations,
    summary: {
      files_scanned: tsFiles.length,
      violations_count: violations.length,
    },
  };
}

module.exports = {
  lintMcpToolsDir,
  RULES,
  DEFAULT_EXEMPTIONS,
  DEFAULT_MAX_LOC,
  DEFAULT_TOOL_CAP,
  FORBIDDEN_IMPORT_PATTERNS,
  WRITE_NAME_PATTERN,
};
