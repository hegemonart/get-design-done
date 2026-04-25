/**
 * mmr-rerank.cjs — Maximal Marginal Relevance post-pass on top-K
 * (Plan 23.5-03).
 *
 * Solves the "all 5 surfaced learnings are about the same thing"
 * failure mode in the Phase 14.5 decision-injector. Greedy selection
 * with the standard MMR criterion:
 *
 *   nextItem = argmax_{i ∉ selected}  λ * relevance(i) − (1 − λ) * max_sim(i, selected)
 *
 * Similarity is token-overlap (Jaccard on case-folded word n-grams,
 * default n=2). No external deps, no embedding API.
 *
 * Pure helper — caller supplies the candidates and a relevance score
 * already computed by upstream (e.g. grep hit count, BM25, or the
 * decision-injector's existing rank function). MMR re-ranks ONLY.
 */

'use strict';

const DEFAULT_LAMBDA = 0.7;
const DEFAULT_NGRAM = 2;
const TOKEN_RE = /[\p{L}\p{N}_-]+/gu;

/**
 * Tokenize a string into case-folded alphanumeric+underscore+dash runs.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const matches = text.toLowerCase().match(TOKEN_RE);
  return matches ? matches : [];
}

/**
 * Build a Set of word n-grams from a string.
 *
 * @param {string} text
 * @param {number} n
 * @returns {Set<string>}
 */
function ngrams(text, n) {
  const toks = tokenize(text);
  if (toks.length < n) return new Set(toks);
  const out = new Set();
  for (let i = 0; i <= toks.length - n; i++) {
    out.add(toks.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * Jaccard similarity between two strings on word n-grams.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [n]
 * @returns {number} 0..1
 */
function similarity(a, b, n = DEFAULT_NGRAM) {
  const A = ngrams(a, n);
  const B = ngrams(b, n);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Re-rank an array of items using the MMR criterion.
 *
 * @param {Array<{text: string, relevance?: number}>} items
 * @param {{lambda?: number, k?: number, ngram?: number, textOf?: (item: object) => string, relevanceOf?: (item: object) => number}} [opts]
 * @returns {Array<object>} subset of input in MMR-selected order
 */
function rerank(items, opts = {}) {
  if (!Array.isArray(items)) {
    throw new TypeError('mmr-rerank.rerank: items must be an array');
  }
  if (items.length === 0) return [];
  const lambda = typeof opts.lambda === 'number' ? opts.lambda : DEFAULT_LAMBDA;
  const ngram = typeof opts.ngram === 'number' ? opts.ngram : DEFAULT_NGRAM;
  const k = typeof opts.k === 'number' && opts.k > 0 ? Math.min(opts.k, items.length) : items.length;
  const textOf =
    typeof opts.textOf === 'function'
      ? opts.textOf
      : (it) => (typeof it === 'string' ? it : (it && typeof it.text === 'string' ? it.text : ''));
  const relOf =
    typeof opts.relevanceOf === 'function'
      ? opts.relevanceOf
      : (it) => {
          if (it && typeof it.relevance === 'number') return it.relevance;
          if (it && typeof it.score === 'number') return it.score;
          return 1;
        };

  // Pre-tokenize candidates.
  const grams = items.map((it) => ngrams(textOf(it), ngram));
  const relevance = items.map((it) => relOf(it));
  const remaining = items.map((_, i) => i);
  /** @type {number[]} */
  const selected = [];

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (const i of remaining) {
      let maxSim = 0;
      for (const j of selected) {
        const sim = jaccard(grams[i], grams[j]);
        if (sim > maxSim) maxSim = sim;
      }
      const score = lambda * relevance[i] - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    selected.push(bestIdx);
    const pos = remaining.indexOf(bestIdx);
    if (pos !== -1) remaining.splice(pos, 1);
  }
  return selected.map((i) => items[i]);
}

/**
 * Jaccard between two pre-built ngram sets. Faster than calling
 * `similarity()` from the rerank loop.
 *
 * @param {Set<string>} A
 * @param {Set<string>} B
 * @returns {number}
 */
function jaccard(A, B) {
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

module.exports = {
  rerank,
  similarity,
  tokenize,
  ngrams,
  jaccard,
  DEFAULT_LAMBDA,
  DEFAULT_NGRAM,
};
