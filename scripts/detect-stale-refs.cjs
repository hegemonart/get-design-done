#!/usr/bin/env node
'use strict';
// Detect deprecated namespace and stage/agent references in shipped markdown.
// Reads reference/DEPRECATIONS.md as the authoritative list of stale tokens.
// Exits 0 if clean, 1 on any match.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEPRECATIONS_PATH = path.join(REPO_ROOT, 'reference/DEPRECATIONS.md');

// Patterns checked against every .md file body (not against DEPRECATIONS.md itself).
// Scope: only truly unambiguous deprecations — names that must not appear anywhere
// outside DEPRECATIONS.md. Current-but-historically-renamed agents/skills
// (design-context-builder, design-pattern-mapper, scan/, discover/) are NOT
// flagged here because they still exist as live files in the tree; the
// rename/split documented in DEPRECATIONS.md was partial, so static detection
// would over-fire. Cover those cases via targeted review rather than grep.
const PATTERNS = [
  { name: '/design: namespace (replaced by /gdd:)', regex: /\/design:[a-z-]+/g },
];

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.planning',
  '.claude',
  '.design',
  'test-fixture',
  '.git',
]);

const EXCLUDE_FILES = new Set([
  // Normalize to forward-slashes so Windows matches this set correctly.
  path.relative(REPO_ROOT, DEPRECATIONS_PATH).split(path.sep).join('/'),
]);

function ensureDeprecationsExists() {
  if (fs.existsSync(DEPRECATIONS_PATH)) return;
  const stub = [
    '# Deprecated Namespaces and Names',
    '',
    'Auto-generated stub — edit this file to declare deprecations authoritatively.',
    '',
    '## Stale command namespaces',
    '- `/design:*` — replaced by `/gdd:*`',
    '',
    '## Stale agent names',
    '- `design-context-builder` — replaced',
    '- `design-pattern-mapper` (as single blob) — replaced',
    '',
    '## Stale stage names',
    '- `scan` — folded into `/gdd:explore`',
    '- `discover` — folded into `/gdd:explore`',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(DEPRECATIONS_PATH), { recursive: true });
  fs.writeFileSync(DEPRECATIONS_PATH, stub, 'utf8');
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(REPO_ROOT, full).split(path.sep).join('/');
      if (EXCLUDE_FILES.has(rel)) continue;
      out.push(full);
    }
  }
}

function main() {
  ensureDeprecationsExists();
  const files = [];
  walk(REPO_ROOT, files);

  let findings = 0;
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const { name, regex } of PATTERNS) {
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(lines[i])) !== null) {
          const rel = path.relative(REPO_ROOT, file);
          console.log(`${rel}:${i + 1}: ${name} → ${m[0]}`);
          findings++;
        }
      }
    }
  }

  console.log(`summary: ${files.length} files scanned, ${findings} stale refs found`);
  process.exit(findings === 0 ? 0 : 1);
}

main();
