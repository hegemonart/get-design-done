'use strict';
/*
 * scripts/lib/model-id.cjs — model-id normalization + tiering (pure, dependency-free).
 *
 * WHY THIS EXISTS
 * ---------------
 * Two unrelated callers need to reason about model ids in identical ways:
 *   - scripts/lib/session-runner/index.ts (routing: which tier am I running?)
 *   - scripts/lib/budget-enforcer.cjs       (pricing: what does this model cost?)
 * Each previously carried its own ad-hoc parsing, which drifted. This module is
 * the single source of truth so a new model family is a DATA edit here (or in the
 * price tables), never a logic change scattered across callers.
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. TIER IS FOR ROUTING. `tierForModelId` answers "opus | sonnet | haiku" so the
 *    router can pick an agent class. It is NOT a pricing key on its own — pricing
 *    also depends on the exact id and (later) the context-window variant.
 *
 * 2. NULL MEANS UNKNOWN — PRICE CONSERVATIVELY + LOUDLY. We deliberately return
 *    `null` for ids we cannot confidently classify rather than guessing a tier.
 *    A wrong tier guess silently mis-routes or mis-prices. Callers MUST treat
 *    null as "unknown model — assume the most expensive plausible price AND warn",
 *    never as a tier and never as free. Do NOT add heuristic fallbacks that
 *    invent a tier for arbitrary strings.
 *
 * 3. VARIANT SUFFIX IS FOR CONTEXT-WINDOW-AWARE PRICING (LATER). Ids may carry a
 *    bracketed variant such as `claude-opus-4-8[1m]` or `...[200k]`. The variant
 *    encodes a context-window SKU that can have different per-token pricing. We
 *    split it off cleanly (`{ base, variant }`) so tiering operates on `base`
 *    while a future price table can key on `(base, variant)`. Date stamps in the
 *    base (e.g. `claude-opus-4-8-20260101`) are NOT variants and are left intact.
 *
 * 4. NEW FAMILIES ARE A DATA EDIT, NOT A CODE CHANGE. To onboard a new model:
 *      - if its id contains the tier word (opus/sonnet/haiku), the family-pattern
 *        rule already handles it — optionally pin it in KNOWN_TIER_BY_ID;
 *      - if its id does NOT contain the tier word (e.g. a hypothetical
 *        `claude-fable-5`), add one line to ALIAS_MAP (see comment there);
 *      - pricing specifics go in the caller's price table keyed on the exact id.
 */

/**
 * KNOWN_TIER_BY_ID — explicit, exact-id → tier pins.
 * Seeded with the currently-shipping ids. Exact matches win over pattern rules,
 * so this is also the place to OVERRIDE a family-pattern result if a specific
 * sku is mis-classified by the generic regex. Keys are the normalized `base`
 * (no bracket variant).
 */
const KNOWN_TIER_BY_ID = Object.freeze({
  'claude-opus-4-8': 'opus',
  'claude-opus-4-7': 'opus',
  'claude-sonnet-4-7': 'sonnet',
  'claude-sonnet-4-6': 'sonnet',
  'claude-sonnet-4-5': 'sonnet',
  'claude-haiku-4-5': 'haiku',
});

/**
 * ALIAS_MAP — extension point for families whose id does NOT contain the tier word.
 *
 * Currently EMPTY by design. The family-pattern rule (step c in tierForModelId)
 * already covers any id literally containing `opus`/`sonnet`/`haiku`. Use this map
 * ONLY for a future lineup whose product name omits the tier word.
 *
 * Example — when Anthropic publishes the `claude-fable-5` sku lineup and we learn
 * it maps to opus-class routing, add (keyed on normalized base):
 *
 *     'claude-fable-5': 'opus',
 *
 * Until the lineup is public we leave it empty rather than guess — an unknown
 * `claude-fable-5` correctly resolves to null (conservative pricing + warning).
 */
const ALIAS_MAP = Object.freeze({
  // 'claude-fable-5': 'opus',  // <- add when the fable-5 sku lineup is public
});

const VARIANT_RE = /\[([^\]]*)\]\s*$/; // trailing bracketed suffix, e.g. [1m] / [200k]
const FAMILY_RE = /(?:^|-)(opus|sonnet|haiku)(?:-|$)/;

/**
 * normalizeModelId(id) → { base, variant }
 *
 * Splits off a single trailing bracketed variant suffix (e.g. `[1m]`, `[200k]`),
 * returning it lowercased with brackets removed as `variant`, and the remaining
 * trimmed id as `base`. Date stamps in the base are preserved. Null/empty/
 * undefined input yields `{ base: '', variant: null }`.
 *
 * @param {string|null|undefined} id
 * @returns {{ base: string, variant: string|null }}
 */
function normalizeModelId(id) {
  if (id == null) return { base: '', variant: null };
  const s = String(id).trim();
  if (s === '') return { base: '', variant: null };

  const m = s.match(VARIANT_RE);
  if (m) {
    const variant = m[1].trim().toLowerCase();
    const base = s.slice(0, m.index).trim();
    return { base, variant: variant === '' ? null : variant };
  }
  return { base: s, variant: null };
}

/**
 * tierForModelId(id) → 'opus' | 'sonnet' | 'haiku' | null
 *
 * Resolution order:
 *   (a) normalize → work on `base`;
 *   (b) exact match in KNOWN_TIER_BY_ID;
 *   (c) family-pattern: base contains the tier word as a token;
 *   (d) ALIAS_MAP (families whose id omits the tier word);
 *   (e) otherwise null — UNKNOWN. Callers must price conservatively + loudly,
 *       NOT treat null as a tier.
 *
 * @param {string|null|undefined} id
 * @returns {'opus'|'sonnet'|'haiku'|null}
 */
function tierForModelId(id) {
  const { base } = normalizeModelId(id);
  if (base === '') return null;

  // (b) exact known-id pin
  if (Object.prototype.hasOwnProperty.call(KNOWN_TIER_BY_ID, base)) {
    return KNOWN_TIER_BY_ID[base];
  }

  // (c) family-pattern (tier word appears as a token in the id)
  const fam = base.match(FAMILY_RE);
  if (fam) return fam[1];

  // (d) alias for families whose id omits the tier word
  if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, base)) {
    return ALIAS_MAP[base];
  }

  // (e) unknown → null (conservative pricing + loud warning is the caller's job)
  return null;
}

module.exports = { normalizeModelId, tierForModelId, KNOWN_TIER_BY_ID, ALIAS_MAP };
