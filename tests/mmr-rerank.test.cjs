// tests/mmr-rerank.test.cjs — Plan 23.5-03 MMR re-rank
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  rerank,
  similarity,
  tokenize,
  ngrams,
  jaccard,
  DEFAULT_LAMBDA,
  DEFAULT_NGRAM,
} = require('../scripts/lib/mmr-rerank.cjs');

test('23.5-03: tokenize lowercases + splits on word boundaries', () => {
  assert.deepEqual(tokenize('Hello, World—Foo_Bar 123'), ['hello', 'world', 'foo_bar', '123']);
});

test('23.5-03: tokenize empty input returns []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

test('23.5-03: ngrams produces n-grams of given size', () => {
  const g = ngrams('alpha beta gamma delta', 2);
  assert.ok(g.has('alpha beta'));
  assert.ok(g.has('beta gamma'));
  assert.ok(g.has('gamma delta'));
  assert.equal(g.size, 3);
});

test('23.5-03: ngrams short input falls back to unigrams', () => {
  const g = ngrams('alpha', 2);
  assert.ok(g.has('alpha'));
});

test('23.5-03: similarity between identical strings is 1', () => {
  assert.equal(similarity('design tokens for buttons', 'design tokens for buttons'), 1);
});

test('23.5-03: similarity between disjoint strings is 0', () => {
  assert.equal(similarity('alpha beta gamma', 'omega phi rho'), 0);
});

test('23.5-03: similarity is symmetric', () => {
  const a = 'colour token primary brand';
  const b = 'primary brand colour token';
  // Order differs → bigram sets may differ. But by Jaccard it's symmetric.
  const sa = similarity(a, b);
  const sb = similarity(b, a);
  assert.equal(sa, sb);
});

test('23.5-03: similarity is non-zero on partial overlap', () => {
  const s = similarity('design tokens primary', 'design tokens secondary');
  assert.ok(s > 0 && s < 1);
});

test('23.5-03: rerank picks diverse items when relevance is uniform', () => {
  // 5 items, 4 about colour tokens, 1 about something else. With λ=0.7
  // and uniform relevance, the diverse item should appear in the top 2.
  const items = [
    { text: 'colour primary token brand red', relevance: 1 },
    { text: 'colour secondary token brand blue', relevance: 1 },
    { text: 'colour accent token brand green', relevance: 1 },
    { text: 'colour neutral token brand grey', relevance: 1 },
    { text: 'spacing scale four eight twelve', relevance: 1 },
  ];
  const top = rerank(items, { k: 2, lambda: 0.5 });
  assert.equal(top.length, 2);
  // First pick is highest-relevance — could be any since uniform.
  // Second pick should be the spacing item (max-sim ~0 vs the colour ones).
  const texts = top.map((t) => t.text);
  assert.ok(
    texts.includes('spacing scale four eight twelve'),
    `expected spacing in top 2, got ${JSON.stringify(texts)}`,
  );
});

test('23.5-03: rerank with λ=1 collapses to relevance ordering', () => {
  const items = [
    { text: 'token primary', relevance: 0.3 },
    { text: 'token secondary', relevance: 0.9 },
    { text: 'spacing scale', relevance: 0.5 },
  ];
  const top = rerank(items, { lambda: 1 });
  // Pure relevance: 0.9, 0.5, 0.3
  assert.equal(top[0].text, 'token secondary');
  assert.equal(top[1].text, 'spacing scale');
  assert.equal(top[2].text, 'token primary');
});

test('23.5-03: rerank with λ=0 collapses to pure diversity', () => {
  const items = [
    { text: 'colour primary token', relevance: 1 },
    { text: 'colour primary token', relevance: 1 }, // dup
    { text: 'spacing scale eight', relevance: 0.1 },
  ];
  const top = rerank(items, { lambda: 0, k: 2 });
  // First pick is item 0 (any with relevance argmax). Second pick must
  // be the diverse one — pure diversity, dup gets 0 due to identical text.
  assert.equal(top.length, 2);
  assert.notEqual(top[0].text, top[1].text);
  assert.equal(top[1].text, 'spacing scale eight');
});

test('23.5-03: rerank honors textOf + relevanceOf overrides', () => {
  const items = [
    { name: 'colour primary token brand', score: 1 },
    { name: 'colour secondary token brand', score: 1 },
    { name: 'spacing scale fluid', score: 0.9 },
  ];
  const top = rerank(items, {
    k: 2,
    lambda: 0.5,
    textOf: (it) => it.name,
    relevanceOf: (it) => it.score,
  });
  assert.equal(top.length, 2);
  const names = top.map((t) => t.name);
  assert.ok(
    names.includes('spacing scale fluid'),
    `expected spacing-scale in top 2, got ${JSON.stringify(names)}`,
  );
});

test('23.5-03: rerank empty input returns []', () => {
  assert.deepEqual(rerank([]), []);
});

test('23.5-03: rerank throws on non-array input', () => {
  assert.throws(() => rerank('not an array'), /array/);
});

test('23.5-03: rerank k > items.length truncates to length', () => {
  const items = [
    { text: 'one', relevance: 1 },
    { text: 'two', relevance: 1 },
  ];
  const top = rerank(items, { k: 100 });
  assert.equal(top.length, 2);
});

test('23.5-03: defaults — λ = 0.7, n = 2', () => {
  assert.equal(DEFAULT_LAMBDA, 0.7);
  assert.equal(DEFAULT_NGRAM, 2);
});

test('23.5-03: jaccard with empty sets returns 0', () => {
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
  assert.equal(jaccard(new Set(['a']), new Set()), 0);
});

test('23.5-03: solves the "all 5 hits about color tokens" failure mode', () => {
  // Realistic scenario: 7 candidates, 5 about colour tokens (very
  // similar), 2 about layout. MMR should surface at least one
  // non-colour result in the top 4.
  const items = [
    { text: 'D-13 chosen tier per agent', relevance: 0.95 },
    { text: 'D-13 chosen tier per agent again', relevance: 0.94 },
    { text: 'D-13 chosen tier per agent token', relevance: 0.93 },
    { text: 'D-13 chosen tier per agent budget', relevance: 0.92 },
    { text: 'D-13 chosen tier per agent confidence', relevance: 0.91 },
    { text: 'L-7 layout uses CSS grid breakpoints', relevance: 0.6 },
    { text: 'L-12 typography clamp scale fluid', relevance: 0.55 },
  ];
  const top = rerank(items, { k: 4 });
  const layoutCount = top.filter((t) => /layout|typography/.test(t.text)).length;
  assert.ok(layoutCount >= 1, `MMR failed to surface non-D-13 results: ${JSON.stringify(top.map((t) => t.text))}`);
});
