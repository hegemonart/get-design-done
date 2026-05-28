// scripts/lib/graph/token-estimate.mjs — Plan 30.6-03 Task 1
//
// Token-budget heuristic per D-04: ceil(JSON.stringify(payload).length / 4).
// Crude approximation of the Anthropic tokenizer's chars-per-token ratio;
// overridable via GDD_GRAPH_TOKEN_FACTOR env var for test seams (D-04 +
// RESEARCH.md §Query algorithm).
//
// This module is the single place to swap heuristic for a real tokenizer
// (tiktoken, anthropic-tokenizer, etc.) if/when we want a more faithful
// budget calculation. All callers funnel through estimateTokens().

/**
 * Estimate the token count of a payload.
 *
 * @param {unknown} payload - string OR JSON-serializable value
 * @returns {number} ceiling of chars/divisor; divisor = GDD_GRAPH_TOKEN_FACTOR
 *                   (when finite, positive number) or 4 (default)
 */
export function estimateTokens(payload) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  // JSON.stringify can return undefined for symbol/function inputs — guard.
  const safe = typeof str === 'string' ? str : '';
  const envFactor = Number(process.env.GDD_GRAPH_TOKEN_FACTOR);
  const divisor =
    Number.isFinite(envFactor) && envFactor > 0 ? envFactor : 4;
  return Math.ceil(safe.length / divisor);
}
