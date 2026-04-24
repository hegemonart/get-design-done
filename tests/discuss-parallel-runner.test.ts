// tests/discuss-parallel-runner.test.ts — Plan 21-07 (SDK-19).
//
// Minimal smoke coverage for the discuss-parallel-runner module.
// Full integration tests deferred to phase closeout alongside pipeline-runner
// E2E coverage.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  run,
  DEFAULT_DISCUSSANTS,
  spawnDiscussantsParallel,
  spawnAggregator,
} from '../scripts/lib/discuss-parallel-runner/index.ts';

test('DEFAULT_DISCUSSANTS: exactly 4 variants covering the canonical angles', () => {
  assert.equal(DEFAULT_DISCUSSANTS.length, 4);
  const names = DEFAULT_DISCUSSANTS.map((d) => d.name);
  for (const expected of ['user-journey', 'technical-constraint', 'brand-fit', 'accessibility']) {
    assert.ok(names.includes(expected as (typeof names)[number]), `expected ${expected} in ${names.join(',')}`);
  }
});

test('DEFAULT_DISCUSSANTS: each spec has prompt + DISCUSSION COMPLETE instruction', () => {
  for (const spec of DEFAULT_DISCUSSANTS) {
    assert.ok(spec.name);
    assert.ok(spec.prompt);
    assert.ok(
      spec.prompt.includes('DISCUSSION COMPLETE'),
      `${spec.name} must reference DISCUSSION COMPLETE block`,
    );
  }
});

test('DEFAULT_DISCUSSANTS: outer array is frozen', () => {
  assert.equal(Object.isFrozen(DEFAULT_DISCUSSANTS), true);
});

test('public API shape', () => {
  assert.equal(typeof run, 'function');
  assert.equal(typeof spawnDiscussantsParallel, 'function');
  assert.equal(typeof spawnAggregator, 'function');
});
