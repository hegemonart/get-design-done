'use strict';
// Phase 44 C2 (SC#10) — regression baseline: HARNESSES.md is a faithful generated view of the SoT
// (the committed file IS the golden; build:harnesses:check drift-gates it) + freshness behavior at three
// age thresholds from a fixture matrix.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { render } = require('../../scripts/generate-harnesses-md.cjs');
const { checkFreshness, ageInDays, WARN_DAYS, FAIL_DAYS } = require('../../scripts/lib/harness-freshness.cjs');
const { readHarnesses } = require('../../scripts/lib/manifest/index.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'baselines', 'phase-44', 'freshness-cases.json'), 'utf8'));

test('44-baseline-render: committed HARNESSES.md equals the generated view (drift gate)', () => {
  const committed = fs.readFileSync(path.join(ROOT, 'HARNESSES.md'), 'utf8');
  assert.equal(committed, render(), 'HARNESSES.md is stale — run `npm run build:harnesses`');
});

test('44-baseline-structure: HARNESSES.md has a row per harness + a Last verified stamp', () => {
  const md = render();
  assert.match(md, /Last verified:/);
  const ids = readHarnesses().harnesses.map((h) => h.id);
  for (const id of ids) assert.ok(md.includes(`\`${id}\``), `HARNESSES.md missing harness ${id}`);
});

test('44-baseline-thresholds: freshness at recent / aging / stale (SC#10, status-aware)', () => {
  const nowMs = Date.parse(FIXTURE.nowMs_date);
  const r = checkFreshness({ nowMs, harnesses: FIXTURE.harnesses });
  const byId = Object.fromEntries(r.map((x) => [x.id, x.freshness]));
  assert.equal(byId.recent, 'ok', '~13d → ok');
  assert.equal(byId.aging, 'warn', '~79d → warn');
  assert.equal(byId.stale, 'fail', '~213d → fail');
  assert.equal(byId['untested-null'], 'n/a', 'untested + null last_verified → n/a (never fails)');
});

test('44-baseline-ageInDays: thresholds + null/garbage handling', () => {
  const now = Date.parse('2026-06-02');
  assert.ok(ageInDays('2026-05-20', now) < WARN_DAYS);
  assert.ok(ageInDays('2026-03-15', now) >= WARN_DAYS && ageInDays('2026-03-15', now) < FAIL_DAYS);
  assert.ok(ageInDays('2025-11-01', now) >= FAIL_DAYS);
  assert.equal(ageInDays(null, now), Infinity);
  assert.equal(ageInDays('not-a-date', now), Infinity);
});

test('44-baseline-live: the live matrix has no tested harness past the fail threshold', () => {
  const fails = checkFreshness().filter((x) => x.freshness === 'fail');
  assert.deepEqual(fails, [], `stale tested harnesses: ${fails.map((f) => f.id).join(', ')}`);
});
