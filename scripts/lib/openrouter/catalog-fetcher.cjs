'use strict';
// scripts/lib/openrouter/catalog-fetcher.cjs — Plan 33.6-01 (Wave A.1)
//
// The plugin's FIRST plugin-side outbound REST client. Fetches the OpenRouter
// model catalog (https://openrouter.ai/api/v1/models), maps it into the CONTEXT
// cache shape, and writes it ATOMICALLY to .design/cache/openrouter-models.json
// with a 24h TTL skip-if-fresh. The fetch is gated behind an INJECTABLE
// `fetchImpl` (default global `fetch`) so the entire default test suite is
// hermetic (D-07) and there is NO new runtime dependency — no axios/node-fetch/
// undici (D-10). The fetch( egress is allowlisted via scripts/lib/openrouter/**
// in scripts/security/outbound-allowlist.json (D-06), with a matching egress
// entry in reference/gdd-threat-model.md.
//
// Decisions honored:
//   D-02  Catalog TTL = 24h default (overridable via ttlHours; the caller wires
//         .design/config.json#openrouter_catalog_ttl_hours — the fetcher just
//         takes ttlHours).
//   D-06  fetch( is allowlisted via scripts/lib/openrouter/**; threat-model has
//         the OpenRouter-egress entry.
//   D-07  fetchImpl is injectable (default global fetch); no live network in tests.
//   D-08  Graceful degrade — fetchCatalog NEVER throws. No key / fetch-fail /
//         parse-fail → cached-if-any-else-null. Tier resolution falls back to the
//         native provider.
//   D-10  No new dependency — global fetch + sdk/primitives (jittered-backoff,
//         error-classifier) + scripts/lib/rate-guard.cjs only.
//
// The OPENROUTER_API_KEY is read from process.env, sent ONLY as an Authorization:
// Bearer header, and is NEVER persisted to the cache nor written to any log seam.

const fs = require('node:fs');
const path = require('node:path');

const { delayMs, sleep } = require('../../../sdk/primitives/jittered-backoff.cjs');
const { classify, FailoverReason } = require('../../../sdk/primitives/error-classifier.cjs');
const rateGuard = require('../rate-guard.cjs');

// Repo root is three levels up from scripts/lib/openrouter/.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_CACHE_PATH = path.join(REPO_ROOT, '.design', 'cache', 'openrouter-models.json');

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const MODELS_PATH = '/models';
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries — bounded, never infinite (D-08).
const PROVIDER = 'openrouter'; // rate-guard provider key.

/**
 * Read + parse the catalog cache at `cachePath`. Returns the `models[]` array, or
 * null when the file is missing, corrupt, or shape-invalid. NEVER throws.
 *
 * @param {object} [opts]
 * @param {string} [opts.cachePath] defaults to <repo>/.design/cache/openrouter-models.json
 * @returns {Array<object>|null}
 */
function readCatalog(opts) {
  const cachePath = (opts && typeof opts.cachePath === 'string' && opts.cachePath) || DEFAULT_CACHE_PATH;
  try {
    if (!fs.existsSync(cachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.models)) return null;
    return parsed.models;
  } catch {
    // Corrupt JSON / read error → treat as no cache.
    return null;
  }
}

/**
 * Read the full parsed cache object (not just models) for TTL inspection.
 * Returns the parsed object or null. NEVER throws.
 */
function readCacheObject(cachePath) {
  try {
    if (!fs.existsSync(cachePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Is the cache object fresh relative to `nowMs` under `ttlHours`?
 * A missing/unparseable fetched_at is treated as stale (forces a re-fetch).
 */
function isFresh(cacheObj, ttlHours, nowMs) {
  if (!cacheObj || typeof cacheObj.fetched_at !== 'string') return false;
  const fetchedMs = Date.parse(cacheObj.fetched_at);
  if (!Number.isFinite(fetchedMs)) return false;
  const ageMs = nowMs - fetchedMs;
  return ageMs >= 0 && ageMs < ttlHours * 3600_000;
}

/**
 * Map an OpenRouter /models response into the CONTEXT cache shape. Defensive:
 * tolerates missing fields, keeps ONLY id/name/context_length/pricing.{prompt,
 * completion}, drops everything else. The /models response is untrusted input —
 * it is mapped, never eval'd.
 *
 * @param {object} body the parsed { data: [...] } response
 * @param {string} fetchedAtIso ISO timestamp to stamp
 * @param {number} ttlHours
 * @param {string} sourceUrl
 * @returns {{fetched_at:string, ttl_hours:number, source:string, models:Array<object>}}
 */
function mapResponse(body, fetchedAtIso, ttlHours, sourceUrl) {
  const data = body && Array.isArray(body.data) ? body.data : [];
  const models = [];
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || entry.id.length === 0) continue;
    const pricing = entry.pricing && typeof entry.pricing === 'object' ? entry.pricing : {};
    models.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : entry.id,
      context_length: Number.isFinite(entry.context_length) ? entry.context_length : null,
      pricing: {
        prompt: pricing.prompt !== undefined && pricing.prompt !== null ? String(pricing.prompt) : null,
        completion:
          pricing.completion !== undefined && pricing.completion !== null
            ? String(pricing.completion)
            : null,
      },
    });
  }
  return {
    fetched_at: fetchedAtIso,
    ttl_hours: ttlHours,
    source: sourceUrl,
    models,
  };
}

/**
 * Atomically write `obj` (JSON) to `cachePath`: write a per-pid temp file in the
 * same directory, then rename over the target. mkdir -p the dir first. The
 * rename is atomic on POSIX and NTFS. NEVER throws — write failure degrades.
 *
 * @returns {boolean} true on success, false on any failure.
 */
function atomicWrite(cachePath, obj) {
  try {
    const dir = path.dirname(cachePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
    try {
      fs.renameSync(tmp, cachePath);
    } catch (renameErr) {
      // Best-effort cleanup of the temp file so we never leave litter behind.
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      throw renameErr;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform the live fetch with bounded jittered-backoff retry on retryable
 * classes (NETWORK_TRANSIENT / RATE_LIMITED), feeding any rate-limit headers to
 * rate-guard. Non-retryable classes (AUTH_ERROR / VALIDATION / ...) stop
 * immediately. Returns the parsed response body on success, or null on any
 * exhausted/non-retryable failure. NEVER throws.
 *
 * @returns {Promise<object|null>}
 */
async function fetchWithRetry({ fetchImpl, url, apiKey, backoffOpts }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Respect any prior rate-limit window before issuing the request.
    try {
      await rateGuard.blockUntilReady(PROVIDER);
    } catch {
      /* rate-guard is best-effort — never let it break the fetch */
    }

    let res;
    let thrown = null;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
    } catch (networkErr) {
      thrown = networkErr;
    }

    // A thrown/rejected fetch → classify the raw error.
    if (thrown) {
      const { reason } = classify(thrown);
      if (reason === FailoverReason.NETWORK_TRANSIENT || reason === FailoverReason.RATE_LIMITED) {
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(attempt, backoffOpts);
          continue;
        }
      }
      // Non-retryable, or retries exhausted.
      return null;
    }

    // Feed response headers to rate-guard (best-effort) so a 429/limit window is
    // recorded for the next call.
    try {
      if (res && res.headers) await rateGuard.ingestHeaders(PROVIDER, res.headers);
    } catch {
      /* best-effort */
    }

    if (res && res.ok) {
      try {
        return await res.json();
      } catch {
        // A 200 with an unparseable body is a transient-ish anomaly; retry if budget remains.
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(attempt, backoffOpts);
          continue;
        }
        return null;
      }
    }

    // Non-OK HTTP — classify by status.
    const status = res && Number.isFinite(res.status) ? res.status : 0;
    const { reason } = classify({ status });
    if (reason === FailoverReason.NETWORK_TRANSIENT || reason === FailoverReason.RATE_LIMITED) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(attempt, backoffOpts);
        continue;
      }
      return null;
    }
    // AUTH_ERROR / VALIDATION / NETWORK_PERMANENT / etc. — do NOT retry.
    return null;
  }
  return null;
}

/**
 * Fetch (or load-from-cache) the OpenRouter model catalog.
 *
 * Order of operations:
 *   1. readCatalog → if a cache is present AND fresh (within ttlHours of now)
 *      → return cache.models WITHOUT calling fetchImpl (TTL skip).
 *   2. else if no apiKey → return cache.models if a cache is present (stale ok),
 *      else null. (Graceful — never fetches without a key.)
 *   3. else fetch <baseUrl>/models via fetchImpl (Authorization: Bearer <apiKey>),
 *      retrying transient/rate-limited failures on a jittered-backoff curve with
 *      rate-guard awareness; non-retryable classes stop.
 *   4. on success → map to the CONTEXT cache shape → atomic write → return models.
 *   5. on exhausted/failed fetch → return cache.models if present else null.
 *
 * NEVER throws (D-08). The whole body is wrapped; any escaped error degrades to
 * cached-if-any-else-null.
 *
 * @param {object} [opts]
 * @param {function} [opts.fetchImpl] injectable fetch (default global fetch — D-07/D-10)
 * @param {function} [opts.now] () => Date, for deterministic TTL (default () => new Date())
 * @param {string}   [opts.cachePath] default <repo>/.design/cache/openrouter-models.json
 * @param {number}   [opts.ttlHours] default 24 (D-02)
 * @param {string}   [opts.apiKey] default process.env.OPENROUTER_API_KEY
 * @param {string}   [opts.baseUrl] default process.env.OPENROUTER_BASE_URL || the OpenRouter base
 * @param {object}   [opts.backoffOpts] passed to jittered-backoff (tests pass near-zero)
 * @returns {Promise<Array<object>|null>}
 */
async function fetchCatalog(opts) {
  const o = opts || {};
  const fetchImpl = typeof o.fetchImpl === 'function' ? o.fetchImpl : globalThis.fetch;
  const nowFn = typeof o.now === 'function' ? o.now : () => new Date();
  const cachePath =
    typeof o.cachePath === 'string' && o.cachePath.length > 0 ? o.cachePath : DEFAULT_CACHE_PATH;
  const ttlHours = Number.isFinite(o.ttlHours) ? o.ttlHours : 24;
  const apiKey = 'apiKey' in o ? o.apiKey : process.env.OPENROUTER_API_KEY;
  const baseUrl =
    (typeof o.baseUrl === 'string' && o.baseUrl) || process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;
  const backoffOpts = o.backoffOpts;

  try {
    const nowMs = nowFn().getTime();
    const cacheObj = readCacheObject(cachePath);

    // 1. TTL skip — fresh cache short-circuits the fetch entirely.
    if (cacheObj && isFresh(cacheObj, ttlHours, nowMs)) {
      return cacheObj.models;
    }

    // 2. No key → never fetch; degrade to cached-if-any-else-null.
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
      return cacheObj ? cacheObj.models : null;
    }

    // 3. Fetch with bounded retry.
    const sourceUrl = `${baseUrl}${MODELS_PATH}`;
    const body = await fetchWithRetry({ fetchImpl, url: sourceUrl, apiKey, backoffOpts });

    // 5. Exhausted / failed → degrade to cached-if-any-else-null.
    if (body === null) {
      return cacheObj ? cacheObj.models : null;
    }

    // 4. Success → map + atomic write.
    const fetchedAtIso = nowFn().toISOString();
    // source stays the canonical OpenRouter models URL even when a custom baseUrl
    // is used, so the cache's `source` is the public contract value.
    const mapped = mapResponse(body, fetchedAtIso, ttlHours, `${DEFAULT_BASE_URL}${MODELS_PATH}`);
    atomicWrite(cachePath, mapped); // best-effort; a write failure still returns the models
    return mapped.models;
  } catch {
    // Absolute backstop — fetchCatalog NEVER throws (D-08).
    const fallback = readCatalog({ cachePath });
    return fallback;
  }
}

module.exports = { fetchCatalog, readCatalog, _internal: { mapResponse, isFresh, atomicWrite } };
// `delayMs` is part of the resilience-primitive contract (jittered-backoff) and
// is exercised indirectly via `sleep`; reference it so linters/readers see the
// full retry-curve seam is wired.
void delayMs;
