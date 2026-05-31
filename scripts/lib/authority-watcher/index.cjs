/**
 * scripts/lib/authority-watcher/index.cjs — Plan 30.5-03 Task 2.
 *
 * Programmatic surface for the authority-watcher pipeline. The user-facing
 * fetcher lives in `agents/design-authority-watcher.md` (Phase 13.2 — runs
 * inside Claude's sub-agent harness with `WebFetch`). This module is the
 * pure-CommonJS counterpart that consumes already-fetched article records
 * and emits structured events for the Phase 30.5-03 reflector pipeline.
 *
 * D-06 ship: kfm-candidate event class. When an article's title matches
 * the failure-mode whitelist patterns (case-insensitive), we emit a single
 * `kfm-candidate` event. Reflector (Plan 30.5-03 Task 1) consumes these
 * events into the SAME incubator draft surface as capability_gap clusters.
 *
 * Public API:
 *   classifyArticles(articles, options?) → Array<Event>
 *   matchesKfmWhitelist(title) → boolean
 *   buildKfmCandidate(article, options?) → Event
 *
 * Article shape (subset — matches the watcher agent's normalised entries):
 *   { id: string, title: string, url?: string, link?: string,
 *     summary?: string, feed_id?: string, published?: string }
 *
 * Event shape (validates against reference/schemas/events.schema.json
 * KfmCandidatePayload, allOf[1] branch):
 *   {
 *     type: 'kfm-candidate',
 *     timestamp: '<ISO>',
 *     sessionId: '<id>',
 *     payload: { event_id, source: 'authority_watcher', article_url,
 *                article_title, suggested_symptom,
 *                suggested_pattern_hint, raw_excerpt },
 *     event_type: 'kfm-candidate' // duplicate of `type` for ergonomic .filter()
 *   }
 *
 * No `fs` writes — this module returns events for the caller (the agent's
 * Bash sandbox) to persist. Zero npm deps.
 */

'use strict';

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

/**
 * Whitelist patterns per Plan 30.5-03 Task 2 step 2. Each pattern matches
 * a title that is plausibly about a failure mode / troubleshooting topic.
 * Case-insensitive, deliberately broad — false positives are gated by
 * the apply-reflections user-review step.
 */
const KFM_WHITELIST_PATTERNS = Object.freeze([
  /common errors/i,
  /failure modes/i,
  /troubleshooting/i,
  /known issues/i,
  /pitfalls/i,
]);

const MAX_RAW_EXCERPT = 500;

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function asString(x) {
  return typeof x === 'string' ? x : '';
}

/**
 * Truncate to maxLen with a `…` (single char, byte-counted) suffix.
 * Returns at most maxLen characters including the suffix.
 */
function truncateExcerpt(text, maxLen) {
  const s = asString(text);
  if (s.length <= maxLen) return s;
  // Hard truncate at maxLen, keep the last char as ellipsis.
  return `${s.slice(0, maxLen - 1)}…`;
}

/**
 * Derive a one-line symptom string from an article record. Preference
 * order: explicit title (≤180 chars), then first 180 chars of summary.
 */
function deriveSymptom(article) {
  const title = asString(article && article.title).trim();
  if (title.length > 0) {
    return title.slice(0, 180);
  }
  const summary = asString(article && article.summary).trim().replace(/\s+/g, ' ');
  if (summary.length > 0) {
    return summary.slice(0, 180);
  }
  return 'untitled';
}

/**
 * Best-effort regex fragment hint. We DO NOT emit a real regex — this is
 * a keyword bag the user is expected to refine via the apply-reflections
 * edit action. Empty string is legal (schema allows empty `suggested_pattern_hint`).
 */
function derivePatternHint(article) {
  const title = asString(article && article.title);
  const summary = asString(article && article.summary);
  // Find ALL-CAPS error-code-shaped tokens (EACCES, ENOENT, EUSAGE, TS6133, etc.)
  const codeRe = /\b[A-Z][A-Z0-9_]{3,15}\b/g;
  const seen = new Set();
  const hits = [];
  for (const src of [title, summary]) {
    const matches = src.match(codeRe) || [];
    for (const m of matches) {
      if (!seen.has(m)) {
        seen.add(m);
        hits.push(m);
      }
      if (hits.length >= 3) break;
    }
    if (hits.length >= 3) break;
  }
  return hits.join('|');
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Returns true if an article title matches any whitelist pattern.
 */
function matchesKfmWhitelist(title) {
  const s = asString(title);
  if (s.length === 0) return false;
  for (const re of KFM_WHITELIST_PATTERNS) {
    if (re.test(s)) return true;
  }
  return false;
}

/**
 * Build a kfm-candidate event from a single article record.
 * Schema-compliant — every required field present + raw_excerpt ≤ 500.
 */
function buildKfmCandidate(article, options) {
  const opts = options || {};
  const articleUrl = asString(article && (article.url || article.link || article.permalink));
  const articleTitle = asString(article && article.title) || 'Untitled';
  const summary = asString(article && article.summary);
  const eventId = opts.eventId || `kfm-cand-${asString(article && article.id) || 'noid'}-${Date.now()}`;
  const timestamp = opts.now || new Date().toISOString();
  const sessionId = opts.sessionId || 'authority-watcher';

  const payload = {
    event_id: eventId,
    source: 'authority_watcher',
    article_url: articleUrl,
    article_title: articleTitle,
    suggested_symptom: deriveSymptom(article),
    suggested_pattern_hint: derivePatternHint(article),
    raw_excerpt: truncateExcerpt(summary, MAX_RAW_EXCERPT),
  };

  return {
    type: 'kfm-candidate',
    timestamp,
    sessionId,
    payload,
    // duplicated at envelope-level for ergonomic .filter() in consumers
    // that don't unpack the payload.
    event_type: 'kfm-candidate',
  };
}

// -------------------------------------------------------------------
// Plan 33.6-03 (SC#8) — OpenRouter catalog drift
// -------------------------------------------------------------------

/**
 * Index a catalog `models[]` by id, keeping only well-formed rows
 * (objects with a non-empty string `id`). Last write wins on dup ids.
 *
 * @param {unknown} models
 * @returns {Map<string, object>}
 */
function indexById(models) {
  const map = new Map();
  if (!Array.isArray(models)) return map;
  for (const m of models) {
    if (m && typeof m === 'object' && typeof m.id === 'string' && m.id.length > 0) {
      map.set(m.id, m);
    }
  }
  return map;
}

/**
 * Best-effort "is this model flagged deprecated?" signal. Tolerant of the
 * several shapes an upstream catalog might use: a boolean `deprecated`,
 * or a `status`/`lifecycle`/`availability` string containing "deprecat".
 *
 * @param {object} model
 * @returns {boolean}
 */
function isDeprecatedFlag(model) {
  if (!model || typeof model !== 'object') return false;
  if (model.deprecated === true) return true;
  for (const key of ['status', 'lifecycle', 'availability', 'state']) {
    const v = model[key];
    if (typeof v === 'string' && /deprecat/i.test(v)) return true;
  }
  return false;
}

/**
 * Stable string-compare of a single pricing field. A pricing field is the
 * catalog's `pricing.prompt` / `pricing.completion` (strings like "0.000003").
 * Compares as strings (the catalog stores them as strings) after a defensive
 * String() coercion; missing → ''.
 */
function priceStr(model, field) {
  if (!model || typeof model !== 'object' || !model.pricing || typeof model.pricing !== 'object') {
    return '';
  }
  const v = model.pricing[field];
  return v === undefined || v === null ? '' : String(v);
}

function pricingChanged(prevModel, currModel) {
  return (
    priceStr(prevModel, 'prompt') !== priceStr(currModel, 'prompt') ||
    priceStr(prevModel, 'completion') !== priceStr(currModel, 'completion')
  );
}

/**
 * Diff a prior vs current OpenRouter catalog (`models[]` arrays) and classify
 * each delta. Plan 33.6-03 / SC#8.
 *
 * Classification per id:
 *   - `new-model`      — id in curr, not in prev.
 *   - `withdrawn`      — id in prev, not in curr.
 *   - `deprecated`     — id in BOTH, and the curr row carries a deprecated/status
 *                        flag (best-effort `isDeprecatedFlag`). Takes precedence
 *                        over a coincident pricing change.
 *   - `pricing-change` — id in BOTH, not deprecated, with a changed
 *                        pricing.prompt or pricing.completion.
 *   - (unchanged ids produce NO entry.)
 *
 * Surfacing (the actionable "a model you pinned is going away" signal):
 *   `surfaced === true` ONLY when `change ∈ {deprecated, withdrawn}` AND the id
 *   is in `options.overrides` (the configured `openrouter_tier_overrides`
 *   values). `new-model` / `pricing-change` are classified but `surfaced:false`
 *   (noise control per CONTEXT). A deprecated/withdrawn id NOT in overrides is
 *   also `surfaced:false`.
 *
 * Pure, zero deps, NEVER throws — garbage inputs degrade to `[]`.
 *
 * @param {Array<object>} prevModels prior catalog `models[]`
 * @param {Array<object>} currModels current catalog `models[]`
 * @param {object} [options]
 * @param {Array<string>} [options.overrides] configured openrouter_tier_overrides id values
 * @returns {Array<{id:string, change:('new-model'|'pricing-change'|'deprecated'|'withdrawn'), surfaced:boolean}>}
 */
function diffOpenRouterCatalog(prevModels, currModels, options) {
  try {
    const prev = indexById(prevModels);
    const curr = indexById(currModels);

    const opts = options && typeof options === 'object' ? options : {};
    const overrideList = Array.isArray(opts.overrides) ? opts.overrides : [];
    const overrides = new Set(overrideList.filter(x => typeof x === 'string' && x.length > 0));

    /** @type {Array<{id:string, change:string, surfaced:boolean}>} */
    const out = [];

    // Deterministic id order: union of all ids, sorted ascending. Keeps the
    // output stable for a fixed input pair (no Date, no randomness).
    const allIds = new Set([...prev.keys(), ...curr.keys()]);
    const sortedIds = [...allIds].sort();

    for (const id of sortedIds) {
      const inPrev = prev.has(id);
      const inCurr = curr.has(id);
      let change = null;

      if (inCurr && !inPrev) {
        change = 'new-model';
      } else if (inPrev && !inCurr) {
        change = 'withdrawn';
      } else {
        // id in both.
        const currModel = curr.get(id);
        if (isDeprecatedFlag(currModel)) {
          change = 'deprecated';
        } else if (pricingChanged(prev.get(id), currModel)) {
          change = 'pricing-change';
        } else {
          continue; // unchanged → no delta
        }
      }

      const actionable = change === 'deprecated' || change === 'withdrawn';
      const surfaced = actionable && overrides.has(id);
      out.push({ id, change, surfaced });
    }

    return out;
  } catch {
    // Absolute backstop — diffOpenRouterCatalog NEVER throws (parity with the
    // never-throws discipline of the 33.6 adapter/fetcher).
    return [];
  }
}

/**
 * Classify a list of fetched articles into events. Emits one kfm-candidate
 * per whitelist-matched article. Other articles produce no events here
 * (the watcher agent's pre-existing classification — heuristic-update,
 * spec-change, etc. — is handled outside this module).
 */
function classifyArticles(articles, options) {
  if (!Array.isArray(articles)) return [];
  const out = [];
  for (const a of articles) {
    if (!a || typeof a !== 'object') continue;
    if (matchesKfmWhitelist(a.title)) {
      out.push(buildKfmCandidate(a, options));
    }
  }
  return out;
}

module.exports = {
  classifyArticles,
  matchesKfmWhitelist,
  buildKfmCandidate,
  // Plan 33.6-03 (SC#8) — OpenRouter catalog weekly-diff classifier. Added as a
  // sibling pure function; the existing API above is unchanged.
  diffOpenRouterCatalog,
  // Exposed for tests / advanced consumers.
  KFM_WHITELIST_PATTERNS,
  MAX_RAW_EXCERPT,
  _deriveSymptom: deriveSymptom,
  _derivePatternHint: derivePatternHint,
  _truncateExcerpt: truncateExcerpt,
  _indexById: indexById,
  _isDeprecatedFlag: isDeprecatedFlag,
  _pricingChanged: pricingChanged,
};
