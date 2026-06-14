'use strict';
/**
 * Plan 30-04 — destination immutability static-grep test.
 *
 * Locks D-02: hardcoded destination repo, statically + at runtime immutable.
 *
 * - destination.cjs exports DESTINATION_REPO === 'hegemonart/hone'.
 * - The module export is frozen; reassignment throws in strict mode.
 * - destination.cjs is the ONLY file under scripts/lib/issue-reporter/ that
 *   contains the literal repo string — every other module imports it.
 * - No other gh-repo-shaped string (e.g. 'foo/bar') appears under
 *   scripts/lib/issue-reporter/ inside source code (excluding comments).
 *
 * Synthetic, deterministic. No fs writes, no spawn. Per D-13.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const ISSUE_REPORTER_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter');
const DESTINATION_FILE = path.join(ISSUE_REPORTER_DIR, 'destination.cjs');

/** Recursively walk a directory; return absolute paths of all matching files. */
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

test('30-04 D-02.S1: destination.cjs exports DESTINATION_REPO === hegemonart/hone', () => {
  // Always re-require to avoid contamination from other tests.
  delete require.cache[require.resolve(DESTINATION_FILE)];
  const mod = require(DESTINATION_FILE);
  assert.equal(mod.DESTINATION_REPO, 'hegemonart/hone');
});

test('30-04 D-02.S2: destination.cjs exports are frozen (Object.isFrozen)', () => {
  delete require.cache[require.resolve(DESTINATION_FILE)];
  const mod = require(DESTINATION_FILE);
  assert.equal(Object.isFrozen(mod), true);
});

test('30-04 D-02.S3: reassigning DESTINATION_REPO throws in strict mode', () => {
  delete require.cache[require.resolve(DESTINATION_FILE)];
  const mod = require(DESTINATION_FILE);
  assert.throws(() => {
    'use strict';
    mod.DESTINATION_REPO = 'attacker/repo';
  }, /Cannot assign to read only property|read only|Cannot redefine/);
});

test('30-04 D-02.S4: destination.cjs is the only file under issue-reporter/ that contains the literal repo string', () => {
  const allFiles = walk(ISSUE_REPORTER_DIR, (f) =>
    /\.(cjs|mjs|js|ts)$/.test(f)
  );
  const culprits = [];
  for (const f of allFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes("'hegemonart/hone'") ||
        content.includes('"hegemonart/hone"')) {
      if (path.resolve(f) !== path.resolve(DESTINATION_FILE)) {
        culprits.push(path.relative(REPO_ROOT, f));
      }
    }
  }
  assert.deepEqual(
    culprits,
    [],
    `destination.cjs must be the sole carrier of 'hegemonart/hone'. Offenders: ${culprits.join(', ')}`
  );
});

test('30-04 D-02.S5: no other gh-repo-shaped string appears under issue-reporter/', () => {
  // Match strings shaped like "<owner>/<repo>" inside single or double quotes,
  // restricted to plausible repo chars. Ignore the destination itself and a
  // few unrelated cases (paths, URLs already filtered by extension list).
  const REPO_RE = /['"]([a-z0-9_.-]+\/[a-z0-9_.-]+)['"]/gi;
  const ALLOWED = new Set(['hegemonart/hone']);

  const allFiles = walk(ISSUE_REPORTER_DIR, (f) =>
    /\.(cjs|mjs|js|ts)$/.test(f)
  );
  /** @type {Array<string>} */
  const findings = [];
  for (const f of allFiles) {
    const raw = fs.readFileSync(f, 'utf8');
    // Strip line + block comments so doc-only mentions don't trip the test.
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
    let m;
    REPO_RE.lastIndex = 0;
    while ((m = REPO_RE.exec(stripped)) !== null) {
      const candidate = m[1];
      // Skip obvious non-repo paths: must NOT start with './' or '../',
      // must NOT look like 'scripts/lib' or 'src/foo' (i.e. relative paths).
      if (candidate.startsWith('./') || candidate.startsWith('../')) continue;
      if (candidate.startsWith('node:')) continue;
      // owner/repo is exactly two slashes worth — reject longer paths.
      if (candidate.split('/').length !== 2) continue;
      // Reject if it looks like a require path (scripts, src, lib, etc.).
      const pathish = ['scripts', 'src', 'lib', 'test', 'tests', 'node_modules', 'dist', 'build'];
      if (pathish.includes(candidate.split('/')[0])) continue;
      if (ALLOWED.has(candidate)) continue;
      findings.push(`${path.relative(REPO_ROOT, f)}: ${candidate}`);
    }
  }
  assert.deepEqual(
    findings,
    [],
    `Found gh-repo-shaped strings other than hegemonart/hone: ${findings.join(' | ')}`
  );
});
