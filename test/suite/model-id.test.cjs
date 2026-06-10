'use strict';
// test/suite/model-id.test.cjs — covers scripts/lib/model-id.cjs (normalize + tier).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeModelId,
  tierForModelId,
  KNOWN_TIER_BY_ID,
  ALIAS_MAP,
} = require('../../scripts/lib/model-id.cjs');

test('normalizeModelId: strips [1m] variant, lowercased, brackets removed', () => {
  assert.deepEqual(normalizeModelId('claude-opus-4-8[1m]'), {
    base: 'claude-opus-4-8',
    variant: '1m',
  });
  assert.deepEqual(normalizeModelId('claude-fable-5[1m]'), {
    base: 'claude-fable-5',
    variant: '1m',
  });
  assert.deepEqual(normalizeModelId('claude-opus-4-8[200K]'), {
    base: 'claude-opus-4-8',
    variant: '200k',
  });
});

test('normalizeModelId: no variant → variant null', () => {
  assert.deepEqual(normalizeModelId('claude-sonnet-4-6'), {
    base: 'claude-sonnet-4-6',
    variant: null,
  });
});

test('normalizeModelId: null / undefined / empty → { base:"", variant:null }', () => {
  assert.deepEqual(normalizeModelId(null), { base: '', variant: null });
  assert.deepEqual(normalizeModelId(undefined), { base: '', variant: null });
  assert.deepEqual(normalizeModelId(''), { base: '', variant: null });
  assert.deepEqual(normalizeModelId('   '), { base: '', variant: null });
});

test('normalizeModelId: does NOT strip date stamps from base', () => {
  assert.deepEqual(normalizeModelId('claude-opus-4-8-20260101'), {
    base: 'claude-opus-4-8-20260101',
    variant: null,
  });
  assert.deepEqual(normalizeModelId('claude-opus-4-8-20260101[1m]'), {
    base: 'claude-opus-4-8-20260101',
    variant: '1m',
  });
});

test('tierForModelId: each known id resolves via the exact map', () => {
  assert.equal(tierForModelId('claude-opus-4-8'), 'opus');
  assert.equal(tierForModelId('claude-opus-4-7'), 'opus');
  assert.equal(tierForModelId('claude-sonnet-4-7'), 'sonnet');
  assert.equal(tierForModelId('claude-sonnet-4-6'), 'sonnet');
  assert.equal(tierForModelId('claude-sonnet-4-5'), 'sonnet');
  assert.equal(tierForModelId('claude-haiku-4-5'), 'haiku');
});

test('tierForModelId: family-pattern fallback for ids not in the known map', () => {
  // Not pinned in KNOWN_TIER_BY_ID, but the tier word is a token → resolved.
  assert.equal(KNOWN_TIER_BY_ID['claude-opus-4-9'], undefined);
  assert.equal(tierForModelId('claude-opus-4-9'), 'opus');
  assert.equal(tierForModelId('claude-sonnet-9-9'), 'sonnet');
  assert.equal(tierForModelId('claude-haiku-9-9'), 'haiku');
});

test('tierForModelId: [1m] variant does not break tiering', () => {
  assert.equal(tierForModelId('claude-opus-4-8[1m]'), 'opus');
  assert.equal(tierForModelId('claude-sonnet-4-6[200k]'), 'sonnet');
});

test('tierForModelId: unknown families → null (conservative, not guessed)', () => {
  assert.equal(tierForModelId('claude-fable-5'), null);
  assert.equal(tierForModelId('claude-fable-5[1m]'), null);
  assert.equal(tierForModelId('gpt-5'), null);
});

test('tierForModelId: null / empty input → null', () => {
  assert.equal(tierForModelId(null), null);
  assert.equal(tierForModelId(undefined), null);
  assert.equal(tierForModelId(''), null);
});

test('ALIAS_MAP is empty by design (extension point)', () => {
  assert.deepEqual(ALIAS_MAP, {});
});
