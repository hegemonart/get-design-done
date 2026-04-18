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
// Keep this list in sync with reference/DEPRECATIONS.md.
const PATTERNS = [
  { name: '/design: namespace', regex: /\/design:[a-z-]+/g },
  {
    name: 'design-context-builder (legacy)',
    // word-boundary; exclude when appearing as part of a longer identifier
    regex: /\bdesign-context-builder\b(?!-)/g,
  },
  {
    name: 'design-pattern-mapper (single blob)',
    regex: /\bdesign-pattern-mapper\b(?![a-z-])/g,
  },
  { name: 'scan/SKILL.md (legacy stage)', regex: /\bscan\/SKILL\.md\b/g },
  { name: 'discover/SKILL.md (legacy stage)', regex: /\bdiscover\/SKILL\.md\b/g },
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
  path.relative(REPO_ROOT, DEPRECATIONS_PATH),
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
      const rel = path.relative(REPO_ROOT, full);
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
