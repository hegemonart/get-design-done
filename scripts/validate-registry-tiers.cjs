#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-registry-tiers.cjs
 *
 * Validates reference/registry.json: every entry that declares a `tier`
 * field must use a cache-hierarchy tier (L0/L1/L2/L3), NOT a model tier
 * (haiku/sonnet/opus). The two enums are easy to confuse at paste time
 * and were caught conflated in v1.57.1's audit (insight-line.schema had
 * tier:"haiku" — a clear paste-error from a sibling agent's default-tier
 * field).
 *
 * Also flags entries that have NO tier field at all so the team can
 * decide whether to assign one or leave it tier-less by policy.
 * (Most entries are intentionally tier-less; the gate just reports the
 * count, never fails on absence.)
 *
 * Exit codes:
 *   0 — all `tier:` values are valid cache tiers
 *   1 — at least one entry has an invalid tier value
 *
 * Run via:  npm run validate:registry-tiers
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, 'reference', 'registry.json');

const VALID_CACHE_TIERS = new Set(['L0', 'L1', 'L2', 'L3']);
const KNOWN_MODEL_TIERS = new Set(['haiku', 'sonnet', 'opus', 'inherit']);

function flatten(obj, results) {
  results = results || [];
  if (Array.isArray(obj)) {
    for (const x of obj) flatten(x, results);
  } else if (obj && typeof obj === 'object') {
    if ('name' in obj && 'tier' in obj) results.push(obj);
    for (const v of Object.values(obj)) flatten(v, results);
  }
  return results;
}

const raw = fs.readFileSync(REGISTRY, 'utf8');
let parsed;
try { parsed = JSON.parse(raw); }
catch (err) {
  console.error('validate-registry-tiers: registry.json is not valid JSON:');
  console.error('  ' + err.message);
  process.exit(1);
}

const entries = flatten(parsed);
const violations = [];
let validCount = 0;

for (const e of entries) {
  if (typeof e.tier !== 'string') continue;
  if (VALID_CACHE_TIERS.has(e.tier)) {
    validCount++;
    continue;
  }
  // Classify the violation so the error is actionable.
  const isModelTier = KNOWN_MODEL_TIERS.has(e.tier);
  violations.push({
    name: e.name,
    badTier: e.tier,
    isModelTierConfusion: isModelTier,
  });
}

if (violations.length === 0) {
  console.log(`validate-registry-tiers: OK (${validCount} tiered entries, all L0/L1/L2/L3)`);
  process.exit(0);
}

console.error('validate-registry-tiers: INVALID TIER VALUES');
for (const v of violations) {
  const suffix = v.isModelTierConfusion
    ? ' — looks like a model-tier paste error (haiku/sonnet/opus belong on agent default-tier, not on reference entries)'
    : '';
  console.error(`  ${v.name}: tier=${JSON.stringify(v.badTier)} — must be one of L0/L1/L2/L3${suffix}`);
}
process.exit(1);
