/**
 * redact.cjs — secret scrubbing for event-stream payloads (Plan 22-02).
 *
 * Deep-walks a value, replacing any string that matches a known secret
 * pattern with a `[REDACTED:<type>]` placeholder. Non-mutating — returns
 * a new structure; the input is not modified.
 *
 * Called from `event-stream/writer.ts` at serialize time so every event
 * that hits disk (and every bus subscriber) sees the redacted form.
 *
 * Patterns are intentionally conservative: false-positives on redaction
 * are low-cost (logged telemetry becomes slightly harder to read); false-
 * negatives (real secrets leaking) are high-cost. When in doubt, match.
 *
 * Adding a pattern: append an entry to `PATTERNS` with a stable `type`
 * key. The type string is the label emitted into the placeholder.
 */

'use strict';

/** @type {Array<{type: string, re: RegExp}>} */
const PATTERNS = [
  // PEM first — must redact before generic base64 patterns would hit.
  {
    type: 'pem',
    re: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g,
  },
  // JWT — 3 dot-separated base64url segments, beginning with eyJ.
  {
    type: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  // Anthropic API keys (sk-ant-…) — matched before generic sk- to win.
  {
    type: 'anthropic',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  // Stripe live secret key.
  {
    type: 'stripe',
    re: /\bsk_live_[A-Za-z0-9]{20,}\b/g,
  },
  // Slack tokens — xoxb/xoxp/xoxa/xoxr/xoxs.
  {
    type: 'slack',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  // GitHub personal access token.
  {
    type: 'github_pat',
    re: /\bghp_[A-Za-z0-9]{36,}\b/g,
  },
  // AWS access key ID.
  {
    type: 'aws',
    re: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  // Generic OpenAI-style sk-… (last in the sk-* family — lower priority
  // than anthropic/stripe which start with `sk_live_`/`sk-ant-`).
  {
    type: 'sk',
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
];

/**
 * Redact every secret-shaped substring in `s`, returning the scrubbed
 * string. Patterns are applied in `PATTERNS` order — more-specific
 * patterns (anthropic, stripe) first so they win over the generic
 * `sk-` catch-all.
 *
 * @param {string} s
 * @returns {string}
 */
function redactString(s) {
  if (typeof s !== 'string' || s.length < 10) return s;
  let out = s;
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0; // safety: `g` flag carries state across calls
    out = out.replace(re, `[REDACTED:${type}]`);
  }
  return out;
}

/**
 * Deep-walk `value`, redacting every string encountered. Arrays and
 * plain objects recurse; everything else returns unchanged.
 *
 * Cycle-safe via a WeakSet.
 *
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {unknown}
 */
function redact(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;

  const visited = seen ?? new WeakSet();
  if (visited.has(/** @type {object} */ (value))) return value;
  visited.add(/** @type {object} */ (value));

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, visited));
  }

  // Plain object. Don't try to preserve class instances — event payloads
  // are expected to be JSON-shaped bags.
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(/** @type {object} */ (value))) {
    out[key] = redact(/** @type {Record<string, unknown>} */ (value)[key], visited);
  }
  return out;
}

module.exports = {
  redact,
  redactString,
  PATTERNS,
};
