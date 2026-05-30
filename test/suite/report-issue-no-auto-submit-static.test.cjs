'use strict';
/**
 * Plan 30-04 — no-auto-submit static-grep test.
 *
 * Locks D-03: consent is the ONLY submission path. There is no
 * `--yes` flag, no `GDD_AUTO_REPORT=1`, no env-var or flag bypass.
 *
 * This test walks every file under skills/report-issue/ AND
 * scripts/lib/issue-reporter/ and fails the build if it finds any
 * `process.env.<NAME>` read where <NAME> contains REPORT, ISSUE, or
 * AUTO_REPORT (case-insensitive).
 *
 * EDITOR is intentionally NOT in the forbidden list — it's a POSIX
 * convention used by every CLI tool (git, crontab, gh itself) and
 * is the canonical way to let the user inspect the draft before
 * consenting. See CONTEXT.md D-03 + D-04 for the rationale.
 *
 * Belt + suspenders with the runtime check in consent-prompt.cjs
 * (Task 2). The static test catches anyone writing the code; the
 * runtime check catches anyone bypassing it via dynamic property
 * access.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = [
  path.join(REPO_ROOT, 'skills', 'report-issue'),
  path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter'),
];

// Process.env lookups, ANY style: process.env.NAME, process.env['NAME'],
// process.env["NAME"]. Match the identifier inside.
const ENV_READ_RE = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s*\])/g;
const FORBIDDEN_RE = /(REPORT|ISSUE|AUTO_REPORT)/i;

function walk(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

test('30-04 D-03.S1: no env-var bypass code paths under skills/report-issue/ or scripts/lib/issue-reporter/', () => {
  /** @type {Array<string>} */
  const offenders = [];
  for (const root of SCAN_DIRS) {
    const files = walk(root, (f) => /\.(cjs|mjs|js|ts|md)$/.test(f));
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, idx) => {
        ENV_READ_RE.lastIndex = 0;
        let m;
        while ((m = ENV_READ_RE.exec(line)) !== null) {
          const name = m[1] || m[2] || '';
          if (FORBIDDEN_RE.test(name)) {
            offenders.push(
              `${path.relative(REPO_ROOT, f)}:${idx + 1}: process.env.${name}`
            );
          }
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Found process.env reads matching /REPORT|ISSUE|AUTO_REPORT/i — D-03 forbids auto-submit env-var bypasses. Offenders:\n  ${offenders.join('\n  ')}`
  );
});

test('30-04 D-03.S2: no --yes / --no-confirm flag occurrences in report-issue surface', () => {
  // String-based, conservative: looks for the literal flag strings that
  // would indicate someone added an auto-confirm bypass.
  const FORBIDDEN_FLAGS = ['--yes', '--no-confirm', '--auto-confirm', '--auto-submit'];
  /** @type {Array<string>} */
  const offenders = [];
  for (const root of SCAN_DIRS) {
    const files = walk(root, (f) => /\.(cjs|mjs|js|ts)$/.test(f));
    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf8');
      // Strip comments before scanning to avoid catching doc-only mentions.
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
      const lines = stripped.split(/\r?\n/);
      lines.forEach((line, idx) => {
        for (const flag of FORBIDDEN_FLAGS) {
          if (line.includes(`'${flag}'`) || line.includes(`"${flag}"`)) {
            offenders.push(
              `${path.relative(REPO_ROOT, f)}:${idx + 1}: ${flag}`
            );
          }
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Found consent-bypass flag strings in report-issue surface — D-03 forbids them. Offenders:\n  ${offenders.join('\n  ')}`
  );
});

test('30-04 D-03.S3: scan dirs exist (sanity guard — prevents accidental empty pass)', () => {
  // If both scan directories vanished, the test above would silently pass.
  // This sanity guard makes that case fail loudly.
  const present = SCAN_DIRS.filter((d) => fs.existsSync(d));
  assert.ok(
    present.length > 0,
    `None of the scan dirs exist: ${SCAN_DIRS.join(', ')}. Did the report-issue surface get deleted?`
  );
});
