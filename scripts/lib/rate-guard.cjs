// scripts/lib/rate-guard.cjs
//
// Plan 20-14 — per-provider rate-limit bookkeeping.
//
// Parses the standard rate-limit header families and persists per-provider
// state to `.design/rate-limits/<provider>.json` under atomic-write +
// file-lock. Consumed by `hooks/budget-enforcer.ts` to short-circuit agent
// spawns when the provider is rate-limited.
//
// Header families supported (case-insensitive keys):
//   - retry-after: seconds (numeric) or HTTP-date (per RFC 7231 §7.1.3)
//   - x-ratelimit-remaining-requests / -tokens: integer
//   - x-ratelimit-reset-requests / -tokens: Unix seconds
//   - anthropic-ratelimit-requests-remaining: integer
//   - anthropic-ratelimit-requests-reset: ISO-8601 timestamp
//
// Most-restrictive precedence: when a single response carries multiple
// limit-ish headers (e.g. x-ratelimit-remaining-requests AND
// x-ratelimit-remaining-tokens) the lower `remaining` wins and the later
// `resetAt` wins. This matches the D-01 rule in the plan.
//
// State-file writes are atomic (temp + rename) and coordinated by
// scripts/lib/lockfile.cjs so two child processes hitting `ingestHeaders`
// concurrently can never corrupt the file. The lock is scoped to the
// state file, not to the provider directory, so different providers can
// update in parallel.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { acquire } = require('./lockfile.cjs');

const STATE_DIR_REL = path.join('.design', 'rate-limits');
const LOCK_MAX_WAIT_MS = 3_000;

/**
 * Resolve the state-file path for a given provider. `provider` is
 * normalized to lowercase with basic sanitization so callers can't
 * escape the rate-limits directory via "../" or similar.
 */
function stateFileFor(provider) {
  if (typeof provider !== 'string' || provider.length === 0) {
    throw new Error('rate-guard: provider must be a non-empty string');
  }
  // Reject path separators and control characters; keep alnum + hyphen +
  // underscore + dot only. No .. allowed.
  const normalized = provider.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(normalized)) {
    throw new Error(`rate-guard: provider name '${provider}' contains illegal characters`);
  }
  return path.join(process.cwd(), STATE_DIR_REL, `${normalized}.json`);
}

/**
 * Normalize a headers record to case-insensitive lookup. Accepts plain
 * objects, Map, and the native Fetch Headers interface.
 */
function getHeader(headers, name) {
  if (headers === null || headers === undefined) return undefined;
  const lowerName = name.toLowerCase();

  // Native Headers
  if (typeof headers.get === 'function') {
    const v = headers.get(lowerName);
    return v === null ? undefined : v;
  }

  // Map
  if (headers instanceof Map) {
    for (const [k, v] of headers.entries()) {
      if (typeof k === 'string' && k.toLowerCase() === lowerName) return v;
    }
    return undefined;
  }

  // Plain object — walk keys case-insensitively.
  if (typeof headers === 'object') {
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === lowerName) return headers[k];
    }
  }
  return undefined;
}

/**
 * Parse a `retry-after` value into an ISO resetAt.
 * Accepts:
 *   - integer seconds ("30")
 *   - HTTP-date ("Mon, 24 Apr 2026 00:00:00 GMT")
 * Returns null if the value can't be interpreted.
 */
function parseRetryAfter(raw) {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (v === '') return null;

  // Pure integer → seconds.
  if (/^\d+$/.test(v)) {
    const secs = Number(v);
    if (!Number.isFinite(secs)) return null;
    return new Date(Date.now() + secs * 1000).toISOString();
  }

  // HTTP-date (RFC 7231). Date.parse handles RFC 1123 / RFC 850 / asctime.
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/** Parse Unix-seconds integer to ISO. */
function parseUnixSeconds(raw) {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (!/^\d+$/.test(v)) return null;
  const secs = Number(v);
  if (!Number.isFinite(secs) || secs <= 0) return null;
  return new Date(secs * 1000).toISOString();
}

/** Parse ISO-8601 to ISO (normalized). Returns null on garbage. */
function parseIso(raw) {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/** Parse an integer remaining-count. Returns null on non-numeric. */
function parseInt32(raw) {
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (!/^-?\d+$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * Distill a headers object into a `{ remaining, resetAt }` tuple using
 * most-restrictive precedence. Either field can end up null if no
 * relevant header is present; caller decides what that means.
 */
function distill(headers) {
  const remainings = [];
  const resets = [];

  // OpenAI-style / de-facto standard
  const remReq = parseInt32(getHeader(headers, 'x-ratelimit-remaining-requests'));
  const remTok = parseInt32(getHeader(headers, 'x-ratelimit-remaining-tokens'));
  const resReq = parseUnixSeconds(getHeader(headers, 'x-ratelimit-reset-requests'));
  const resTok = parseUnixSeconds(getHeader(headers, 'x-ratelimit-reset-tokens'));

  if (remReq !== null) remainings.push(remReq);
  if (remTok !== null) remainings.push(remTok);
  if (resReq !== null) resets.push(resReq);
  if (resTok !== null) resets.push(resTok);

  // Anthropic-style
  const anRem = parseInt32(getHeader(headers, 'anthropic-ratelimit-requests-remaining'));
  const anReset = parseIso(getHeader(headers, 'anthropic-ratelimit-requests-reset'));
  if (anRem !== null) remainings.push(anRem);
  if (anReset !== null) resets.push(anReset);

  // Retry-After (fallback/coarsest)
  const retryAfter = parseRetryAfter(getHeader(headers, 'retry-after'));
  if (retryAfter !== null) {
    // retry-after implies the remaining budget is effectively zero right
    // now — otherwise the server wouldn't be asking us to back off.
    remainings.push(0);
    resets.push(retryAfter);
  }

  const remaining = remainings.length === 0
    ? null
    : remainings.reduce((a, b) => (b < a ? b : a), Number.POSITIVE_INFINITY);
  // Most-restrictive = LATEST reset (we wait longer), not earliest.
  const resetAt = resets.length === 0
    ? null
    : resets
        .map((s) => Date.parse(s))
        .filter(Number.isFinite)
        .reduce((a, b) => (b > a ? b : a), 0);

  return {
    remaining: remaining === null ? null : Number(remaining),
    resetAt: resetAt === null || resetAt === 0 ? null : new Date(resetAt).toISOString(),
  };
}

/**
 * Atomically write `state` to the provider state file under the
 * advisory lock. The `.tmp` file is created in the same directory as
 * the target so the rename is atomic on every POSIX filesystem and on
 * NTFS.
 */
async function atomicWriteState(absPath, state) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const release = await acquire(absPath, { maxWaitMs: LOCK_MAX_WAIT_MS });
  try {
    const tmp = `${absPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, absPath);
  } finally {
    await release();
  }
}

/**
 * Merge the incoming distilled values with any existing state on disk
 * using most-restrictive precedence across calls, not just within a
 * single headers object. This matters when responses arrive
 * out-of-order and an older, less restrictive header shouldn't clobber
 * a newer, more restrictive one.
 */
function mergeState(existing, provider, incoming) {
  const now = new Date().toISOString();

  // Start from the existing state if it's shaped correctly.
  const hasExisting = existing &&
    typeof existing === 'object' &&
    existing.provider === provider &&
    Number.isFinite(existing.remaining) &&
    typeof existing.resetAt === 'string';

  let remaining;
  if (incoming.remaining !== null && hasExisting) {
    remaining = Math.min(existing.remaining, incoming.remaining);
  } else if (incoming.remaining !== null) {
    remaining = incoming.remaining;
  } else if (hasExisting) {
    remaining = existing.remaining;
  } else {
    // No incoming signal, no prior state — defaulting to 1 would be wrong
    // (implies "plenty of budget"), defaulting to 0 would be wrong (blocks
    // the next caller). We leave the provider unset in that case by
    // returning null — callers treat "no state" and "remaining > 0" the
    // same way.
    return null;
  }

  let resetAt;
  if (incoming.resetAt !== null && hasExisting) {
    // Pick the latest reset — "wait longer" is the conservative choice.
    const a = Date.parse(existing.resetAt);
    const b = Date.parse(incoming.resetAt);
    resetAt = new Date(Math.max(a || 0, b || 0)).toISOString();
  } else if (incoming.resetAt !== null) {
    resetAt = incoming.resetAt;
  } else if (hasExisting) {
    resetAt = existing.resetAt;
  } else {
    // remaining is set but resetAt is unknown — default to now + 60s so
    // callers that wake on resetAt eventually get out of the block.
    resetAt = new Date(Date.now() + 60_000).toISOString();
  }

  return {
    provider,
    remaining,
    resetAt,
    updatedAt: now,
  };
}

/**
 * Ingest rate-limit headers for a provider. Parses the known header
 * families, merges with any existing state, and persists atomically.
 *
 * @param {string} provider provider key (normalized to lowercase)
 * @param {object} headers response headers (plain object, Map, or Fetch Headers)
 * @returns {Promise<object|null>} the persisted state, or null when no
 *   rate-limit signal was found in the headers.
 */
async function ingestHeaders(provider, headers) {
  const absPath = stateFileFor(provider);
  const incoming = distill(headers);

  // If nothing relevant was found, no state change.
  if (incoming.remaining === null && incoming.resetAt === null) {
    return null;
  }

  // Read existing (best-effort; tolerate missing/corrupt).
  let existing = null;
  try {
    if (fs.existsSync(absPath)) {
      existing = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    }
  } catch { /* corrupt → treat as no state */ }

  const merged = mergeState(existing, provider.toLowerCase().trim(), incoming);
  if (merged === null) return null;

  await atomicWriteState(absPath, merged);
  return merged;
}

/**
 * Return current state for a provider, or null on miss / parse failure.
 * Callers treat null identically to "no constraint — proceed".
 *
 * @param {string} provider
 * @returns {{provider: string, remaining: number, resetAt: string, updatedAt: string}|null}
 */
function remaining(provider) {
  const absPath = stateFileFor(provider);
  try {
    if (!fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.provider === 'string' &&
      Number.isFinite(parsed.remaining) &&
      typeof parsed.resetAt === 'string' &&
      typeof parsed.updatedAt === 'string'
    ) {
      // If the reset window has already passed, treat as expired so
      // callers get a clean "no constraint" signal without us having to
      // rewrite the file.
      const resetMs = Date.parse(parsed.resetAt);
      if (Number.isFinite(resetMs) && resetMs <= Date.now()) return null;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * If `remaining <= 0`, wait until `resetAt` before resolving. Returns
 * the number of ms actually waited (0 when there was no constraint or
 * the window was already expired).
 *
 * @param {string} provider
 * @returns {Promise<number>}
 */
async function blockUntilReady(provider) {
  const state = remaining(provider);
  if (state === null) return 0;
  if (state.remaining > 0) return 0;

  const resetMs = Date.parse(state.resetAt);
  if (!Number.isFinite(resetMs)) return 0;

  const waitMs = resetMs - Date.now();
  if (waitMs <= 0) return 0;

  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return waitMs;
}

module.exports = {
  ingestHeaders,
  remaining,
  blockUntilReady,
  // internal helpers surfaced for tests only — stable API = first three.
  _internal: { distill, parseRetryAfter, parseUnixSeconds, parseIso, stateFileFor },
};
