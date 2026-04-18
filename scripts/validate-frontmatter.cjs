#!/usr/bin/env node
'use strict';
// CI-friendly frontmatter validator for agents/*.md.
// Enforces the Phase 7 agent frontmatter hygiene contract.
// Exits 0 on success, 1 on any violation. One finding per stdout line.

const fs = require('fs');
const path = require('path');
const { readFrontmatter } = require('../tests/helpers.cjs');

const REQUIRED_FIELDS = [
  'name',
  'description',
  'tools',
  'color',
  'parallel-safe',
  'typical-duration-seconds',
  'reads-only',
  'writes',
];

function walkMd(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const targets = args.length ? args : ['agents/'];
  const files = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) {
      console.error(`${t}: path does not exist`);
      process.exit(1);
    }
    const stat = fs.statSync(t);
    if (stat.isDirectory()) files.push(...walkMd(t));
    else files.push(t);
  }

  let violations = 0;
  for (const f of files) {
    const fm = readFrontmatter(f);
    if (Object.keys(fm).length === 0) {
      // README.md under agents/ may have no frontmatter — skip
      if (path.basename(f).toLowerCase() === 'readme.md') continue;
      console.log(`${f}:frontmatter: missing`);
      violations++;
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!(field in fm) || fm[field] === undefined || fm[field] === null || fm[field] === '') {
        console.log(`${f}:${field}: missing`);
        violations++;
      }
    }
  }

  console.log(`summary: ${files.length} file(s) checked, ${violations} violation(s)`);
  process.exit(violations === 0 ? 0 : 1);
}

main();
