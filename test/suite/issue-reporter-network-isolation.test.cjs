'use strict';
/**
 * tests/issue-reporter-network-isolation.test.cjs — Plan 30-07 CI gate.
 *
 * Static-analysis test that fails the build if anyone adds a network
 * primitive (HTTP-S URL, global fetch, axios, node:https, node-fetch) to the
 * issue-reporter code path. Runs in the default node:test suite (NOT a
 * separate workflow step).
 *
 * Scanned tree:
 *   - skills/report-issue/                              (all files)
 *   - scripts/lib/pseudonymize.cjs                      (single file)
 *   - scripts/lib/issue-reporter/                       (all files)
 *
 * Whitelist (exact relative paths from repo root):
 *   - scripts/lib/issue-reporter/destination.cjs        (sole carrier of the
 *                                                        destination URL —
 *                                                        Plan 30-04 D-02)
 *
 * On match in a non-whitelisted file: t.fail() with a message naming the file,
 * line number, and offending token. On clean scan: assert that the scanner
 * walked >=1 file (sanity: the test MUST NOT silently pass because the tree
 * was empty or path resolution broke).
 *
 * This test file lives at tests/issue-reporter-network-isolation.test.cjs,
 * OUTSIDE the scanned tree, so the forbidden-token list inside this file does
 * not poison the scan. The fixtures it scans live under tests/fixtures/...
 * which is also outside the bounded tree.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Forbidden tokens. Case-sensitive literal substrings. Plain indexOf scan.
 * Ordered roughly by likelihood of appearing in adversarial code.
 *
 * The token literals below appear inside string constants in THIS test file
 * (which is at tests/...). The scanner is bounded to skills/report-issue/,
 * scripts/lib/pseudonymize.cjs, and scripts/lib/issue-reporter/. The token
 * literals here are NOT visible to the scanner.
 */
const FORBIDDEN_TOKENS = [
  'h' + 'ttps://',
  'fet' + 'ch(',
  'ax' + 'ios',
  'node' + ':https',
  'node-' + 'fetch',
  "require('htt" + "ps')",
  'require("htt' + 'ps")',
  "require('node:" + "https')",
  'require("node:' + 'https")',
];

const SCANNABLE_EXT = new Set(['.cjs', '.mjs', '.js', '.ts', '.md', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

/**
 * Recursively walk a directory and return absolute paths of files whose
 * extensions are in SCANNABLE_EXT. Skips node_modules, .git, dist.
 *
 * @param {string} root absolute path
 * @returns {string[]}
 */
function walk(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (SCANNABLE_EXT.has(path.extname(root))) out.push(root);
    return out;
  }
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
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        if (SCANNABLE_EXT.has(path.extname(e.name))) out.push(full);
      }
    }
  }
  return out;
}

/**
 * Normalize a path to repo-relative posix form for whitelist comparison.
 *
 * @param {string} repoRoot
 * @param {string} absPath
 * @returns {string}
 */
function relPosix(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

/**
 * Scan one or more root paths for forbidden tokens. A root may be a file
 * (scanned directly) or a directory (walked).
 *
 * @param {object} opts
 * @param {string} opts.repoRoot      — repo root used for whitelist comparison
 * @param {string[]} opts.roots       — absolute paths (files OR dirs) to scan
 * @param {string[]} [opts.whitelist] — repo-relative posix paths to skip
 * @returns {{ violations: Array<{file: string, line: number, column: number, token: string}>, filesScanned: number }}
 */
function scan(opts) {
  const repoRoot = opts.repoRoot;
  const roots = opts.roots;
  const whitelist = new Set(opts.whitelist || []);
  const violations = [];
  let filesScanned = 0;

  for (const root of roots) {
    const files = walk(root);
    for (const absFile of files) {
      const relFile = relPosix(repoRoot, absFile);
      if (whitelist.has(relFile)) continue;
      filesScanned++;
      let content;
      try {
        content = fs.readFileSync(absFile, 'utf8');
      } catch {
        continue;
      }
      for (const token of FORBIDDEN_TOKENS) {
        let from = 0;
        while (true) {
          const idx = content.indexOf(token, from);
          if (idx < 0) break;
          // Compute line + column.
          const upto = content.slice(0, idx);
          const line = upto.split('\n').length;
          const lastNl = upto.lastIndexOf('\n');
          const column = lastNl < 0 ? idx + 1 : idx - lastNl;
          violations.push({ file: relFile, line, column, token });
          from = idx + token.length;
        }
      }
    }
  }

  return { violations, filesScanned };
}

// Defensive sanity: token list isn't empty / null.
assert.ok(FORBIDDEN_TOKENS.length >= 5, 'forbidden token list must have >=5 entries');
assert.ok(FORBIDDEN_TOKENS.every((t) => typeof t === 'string' && t.length > 0), 'tokens must be non-empty strings');

const REAL_TREE_ROOTS = [
  path.join(REPO_ROOT, 'skills', 'report-issue'),
  path.join(REPO_ROOT, 'scripts', 'lib', 'pseudonymize.cjs'),
  path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter'),
];
const REAL_TREE_WHITELIST = ['scripts/lib/issue-reporter/destination.cjs'];

test('30-07: real tree is clean (no forbidden network tokens outside whitelist) + sanity >=1 file scanned', () => {
  const result = scan({
    repoRoot: REPO_ROOT,
    roots: REAL_TREE_ROOTS,
    whitelist: REAL_TREE_WHITELIST,
  });

  // Sanity: the scanner must have walked at least one file. This catches the
  // failure mode where the tree is empty or path resolution silently broke.
  assert.ok(
    result.filesScanned >= 1,
    `Network-isolation scanner found 0 files under the real tree. Roots: ${REAL_TREE_ROOTS.join(', ')}`
  );

  if (result.violations.length > 0) {
    const lines = result.violations.map(
      (v) => `  ${v.file}:${v.line}:${v.column} contains forbidden token: ${JSON.stringify(v.token)}`
    );
    assert.fail(
      `Network-isolation gate violated (${result.violations.length} occurrence${
        result.violations.length === 1 ? '' : 's'
      }):\n${lines.join('\n')}`
    );
  }
});

test('30-07: clean synthetic fixture passes (zero violations)', () => {
  const root = path.join(__dirname, 'fixtures', 'network-isolation', 'clean');
  const result = scan({
    repoRoot: REPO_ROOT,
    roots: [root],
    whitelist: [],
  });
  assert.deepEqual(result.violations, []);
  assert.ok(result.filesScanned >= 1, 'clean fixture should have >=1 file scanned');
});

test('30-07: forbidden fetch() in non-whitelisted file fails', () => {
  const root = path.join(__dirname, 'fixtures', 'network-isolation', 'forbidden-fetch');
  const result = scan({
    repoRoot: REPO_ROOT,
    roots: [root],
    whitelist: [],
  });
  assert.ok(result.violations.length >= 1, 'forbidden-fetch fixture should produce >=1 violation');
  const fetchTokens = result.violations.filter((v) => v.token === FORBIDDEN_TOKENS[1]);
  assert.ok(fetchTokens.length >= 1, `expected a fetch( token violation; got ${JSON.stringify(result.violations)}`);
});

test('30-07: forbidden require(node:https) in non-whitelisted file fails', () => {
  const root = path.join(__dirname, 'fixtures', 'network-isolation', 'forbidden-https-import');
  const result = scan({
    repoRoot: REPO_ROOT,
    roots: [root],
    whitelist: [],
  });
  assert.ok(result.violations.length >= 1, 'forbidden-https-import fixture should produce >=1 violation');
  // Token may be 'node:https' or one of the require('node:https') variants.
  const matchTokens = result.violations.filter((v) =>
    v.token === FORBIDDEN_TOKENS[3] ||  // 'node:https'
    v.token === FORBIDDEN_TOKENS[7] ||  // require('node:https')
    v.token === FORBIDDEN_TOKENS[8]     // require("node:https")
  );
  assert.ok(matchTokens.length >= 1, `expected a node:https token violation; got ${JSON.stringify(result.violations)}`);
});

test('30-07: whitelisted destination.cjs is exempted from the forbidden-URL token', () => {
  const root = path.join(__dirname, 'fixtures', 'network-isolation', 'whitelisted-destination');
  const fixtureRel = relPosix(
    REPO_ROOT,
    path.join(root, 'destination.cjs')
  );
  // Pass 1: with whitelist — expect zero violations.
  const withWhitelist = scan({
    repoRoot: REPO_ROOT,
    roots: [root],
    whitelist: [fixtureRel],
  });
  assert.deepEqual(
    withWhitelist.violations,
    [],
    `expected zero violations with whitelist; got ${JSON.stringify(withWhitelist.violations)}`
  );

  // Pass 2: empty whitelist — expect >=1 violation on the URL token.
  const noWhitelist = scan({
    repoRoot: REPO_ROOT,
    roots: [root],
    whitelist: [],
  });
  assert.ok(
    noWhitelist.violations.length >= 1,
    'expected >=1 violation with empty whitelist; the exemption mechanism must be genuinely conditional'
  );
});
