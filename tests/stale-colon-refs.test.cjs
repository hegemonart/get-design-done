'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const SCAN_DIRS = ['skills', 'agents', 'connections', 'reference'];
const STALE_PATTERN = /\/design:[a-z]/;

function findMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

test('stale-colon-refs: no /design:<cmd> references in markdown files', () => {
  const violations = [];

  for (const scanDir of SCAN_DIRS) {
    const fullDir = path.join(REPO_ROOT, scanDir);
    const mdFiles = findMarkdownFiles(fullDir);

    for (const filePath of mdFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (STALE_PATTERN.test(line)) {
          const rel = path.relative(REPO_ROOT, filePath);
          violations.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found stale /design: command references (should be /gdd:):\n${violations.join('\n')}\n\n` +
    `Replace all /design:<cmd> with /gdd:<cmd> per the Phase 7 namespace rename.`
  );
});
