#!/usr/bin/env node
// Ensures package.json, .claude-plugin/plugin.json, and .claude-plugin/marketplace.json
// all declare the same version before we publish. Exits non-zero on mismatch.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const plugin = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin/plugin.json'), 'utf8'));
const marketplace = JSON.parse(fs.readFileSync(path.join(repoRoot, '.claude-plugin/marketplace.json'), 'utf8'));

const versions = {
  'package.json': pkg.version,
  '.claude-plugin/plugin.json': plugin.version,
  '.claude-plugin/marketplace.json (metadata)': marketplace.metadata && marketplace.metadata.version,
  '.claude-plugin/marketplace.json (plugins[0])': marketplace.plugins && marketplace.plugins[0] && marketplace.plugins[0].version,
};

const unique = [...new Set(Object.values(versions).filter(Boolean))];

if (unique.length !== 1) {
  console.error('Version mismatch across manifests:');
  for (const [file, v] of Object.entries(versions)) {
    console.error(`  ${file}: ${v}`);
  }
  process.exit(1);
}

console.log(`All manifests at version ${unique[0]}`);
