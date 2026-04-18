#!/usr/bin/env node
'use strict';
// Extract the `## [<version>]` section of CHANGELOG.md and print to stdout.
// Used by .github/workflows/release.yml to build the GitHub Release body.
//
// Usage: node scripts/extract-changelog-section.cjs <version>
// Example: node scripts/extract-changelog-section.cjs 1.0.7
//
// Exit codes:
//   0 — section found, body printed
//   1 — no matching section
//   2 — missing or empty version argument

const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').trim();
if (!version) {
  console.error('Usage: node scripts/extract-changelog-section.cjs <version>');
  process.exit(2);
}

const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  console.error(`ERROR: CHANGELOG.md not found at ${changelogPath}`);
  process.exit(1);
}

const body = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
const lines = body.split('\n');
const headingRe = new RegExp(`^##\\s*\\[${version.replace(/\./g, '\\.')}\\]`);
const nextHeadingRe = /^##\s*\[/;

let capture = false;
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!capture) {
    if (headingRe.test(line)) capture = true;
    continue;
  }
  // Stop at next version heading or a standalone horizontal rule
  if (nextHeadingRe.test(line)) break;
  if (line.trim() === '---') break;
  out.push(line);
}

if (!capture) {
  console.error(`ERROR: no section for version ${version}`);
  process.exit(1);
}

// Trim leading + trailing blank lines
while (out.length && out[0].trim() === '') out.shift();
while (out.length && out[out.length - 1].trim() === '') out.pop();

process.stdout.write(out.join('\n') + '\n');
