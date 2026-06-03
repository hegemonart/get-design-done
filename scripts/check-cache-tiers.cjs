#!/usr/bin/env node
'use strict';
/**
 * scripts/check-cache-tiers.cjs
 *
 * CI gate: assert L0 cache-prefix byte-stability.
 *
 * L0 files are the prefix every agent imports first. Anthropic's 5-min
 * prompt cache means every byte change invalidates the prefix for every
 * agent simultaneously, costing 10x on subsequent spawns until the
 * cache re-warms.
 *
 * This gate records SHA-256 of each L0 file in
 * test/fixtures/baselines/l0-hashes.json. CI fails when a hash drifts.
 *
 * The maintainer can ratchet the baseline after an INTENTIONAL L0 edit:
 *   node scripts/check-cache-tiers.cjs --rebaseline
 * which commits the new hashes alongside the L0 edit. Reviewers see
 * the L0-hash change in the diff and know cache will miss for one
 * session per agent on next spawn.
 *
 * See reference/cache-tier-doctrine.md for the full L0/L1/L2/L3 contract.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'test', 'fixtures', 'baselines', 'l0-hashes.json');

// L0 file set — keep in sync with reference/cache-tier-doctrine.md
const L0_FILES = [
  'reference/meta-rules.md',
  'reference/shared-preamble.md',
];

function sha256(filePath) {
  const body = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(body).digest('hex');
}

function buildCurrent() {
  const out = {};
  for (const rel of L0_FILES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.error(`check-cache-tiers: missing L0 file ${rel}`);
      process.exit(1);
    }
    out[rel] = sha256(full);
  }
  return out;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { hashes: {}, generated_at: null };
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return { hashes: {}, generated_at: null }; }
}

function writeBaseline(hashes) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  const body = JSON.stringify(
    { generated_at: new Date().toISOString(), hashes },
    null,
    2,
  ) + '\n';
  fs.writeFileSync(BASELINE_PATH, body, 'utf8');
}

const REBASELINE = process.argv.includes('--rebaseline');

const current = buildCurrent();

if (REBASELINE) {
  writeBaseline(current);
  console.log(`check-cache-tiers: REBASELINED ${L0_FILES.length} L0 file(s).`);
  console.log('  Reviewers MUST notice the L0-hash diff and accept the cache miss.');
  process.exit(0);
}

const baseline = loadBaseline().hashes || {};
const drift = [];
for (const [file, hash] of Object.entries(current)) {
  const baselineHash = baseline[file];
  if (baselineHash && baselineHash !== hash) {
    drift.push({ file, expected: baselineHash, actual: hash });
  } else if (!baselineHash) {
    drift.push({ file, expected: '(not in baseline)', actual: hash });
  }
}

if (drift.length === 0) {
  console.log(`check-cache-tiers: OK (${L0_FILES.length} L0 file(s) match baseline hashes)`);
  process.exit(0);
}

console.error('check-cache-tiers: L0 BYTE DRIFT DETECTED');
console.error('');
console.error('One or more L0 cache-prefix file(s) changed bytes. This invalidates');
console.error('Anthropic prompt cache for every agent on the next session start.');
console.error('');
console.error('If the L0 edit is intentional (framework invariant change):');
console.error('  1. Confirm the edit is the ONLY L0 change in this commit/PR');
console.error('  2. Rebaseline: `node scripts/check-cache-tiers.cjs --rebaseline`');
console.error('  3. Commit the updated test/fixtures/baselines/l0-hashes.json');
console.error('');
console.error('If the edit was accidental: revert the file and rerun.');
console.error('');
for (const d of drift) {
  console.error(`  ${d.file}`);
  console.error(`    expected sha256: ${d.expected}`);
  console.error(`    actual sha256:   ${d.actual}`);
}
console.error('');
console.error('See reference/cache-tier-doctrine.md for the L0 discipline.');
process.exit(1);
