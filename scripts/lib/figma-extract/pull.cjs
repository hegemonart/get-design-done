'use strict';
// scripts/lib/figma-extract/pull.cjs — Plan 31-01 (Wave A.1)
// Productionized from spike 001 (.planning/spikes/001-figma-offcontext-extractor/extract.mjs).
//
// RAW-PULL stage of the two-stage Figma extractor pipeline. Pulls the 5 Figma
// REST endpoints the spike validated into a local cache dir, writing JSON to
// disk ONLY. Raw response bodies are never returned to a caller that could log
// them — they go straight to <outDir>/<name>.json. The digest/markdown stage
// (Plan 31-02) consumes the cache; this file does ZERO digest work.
//
// Decisions honored:
//   D-01  Two-stage separation: pull.cjs only pulls + caches. No digest here.
//   D-03  geometry=paths is DROPPED — the file endpoint is /files/:key with no
//         geometry query param. Saves ~30% raw size for data the digest throws away.
//   D-10  FIGMA_TOKEN is read from process.env.FIGMA_TOKEN (fallback
//         FIGMA_PERSONAL_ACCESS_TOKEN) only. It is NEVER written to disk and
//         NEVER passed to console.log / the logger seam. (31-10 ships a static
//         analysis test scanning this dir for token persistence/logging.)
//   D-11  Cache invalidation is content-based via Figma's `version` field, with
//         a 1h wall-clock TTL fallback when no version field is available.
//
// Hardening over the spike: retry-with-backoff on transient 429/5xx, structured
// per-endpoint timing emitted to an injectable logger seam (NOT raw bodies),
// file-URL-or-bare-key input via parse-url.cjs, version-based cache skip.

const fs = require('node:fs');
const path = require('node:path');
const { parseFigmaFileKey } = require('./parse-url.cjs');

const FIGMA_API_BASE = 'https://api.figma.com/v1';

// Endpoint inventory mirroring the spike's 5 pulls. D-03: the file endpoint is
// `/files/${k}` with NO `?geometry=paths`. Each entry: { name, path(key)→string,
// optional?:bool }. `optional` endpoints (Path A Variables) may 403 on
// non-Enterprise plans and are skipped gracefully rather than aborting the run.
const DEFAULT_ENDPOINTS = [
  { name: 'file', path: (k) => `/files/${k}` },
  { name: 'variables', path: (k) => `/files/${k}/variables/local`, optional: true },
  { name: 'styles', path: (k) => `/files/${k}/styles` },
  { name: 'components', path: (k) => `/files/${k}/components` },
  { name: 'component_sets', path: (k) => `/files/${k}/component_sets` },
];

// Retry/backoff tuning. Bounded — never an infinite loop.
const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
const BACKOFF_BASE_MS = 250; // base × 2^attempt, capped
const BACKOFF_CAP_MS = 4000;
const TTL_MS = 60 * 60 * 1000; // 1h wall-clock fallback (D-11)

const noopLogger = { info() {}, warn() {}, error() {} };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransient(status) {
  return status === 429 || status >= 500;
}

/**
 * Fetch a Figma API path with timing + bounded retry/backoff on transient errors.
 * Returns { json, ms, bytes } on success. Throws a structured Error after the
 * retry budget is exhausted, or immediately on a non-transient error.
 *
 * The token lives only inside `headers` (caller-provided); it is NEVER logged.
 */
async function fetchJson(apiPath, { fetchImpl, headers, logger, sleepImpl }) {
  const url = `${FIGMA_API_BASE}${apiPath}`;
  const wait = sleepImpl || sleep;
  let lastErr;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetchImpl(url, { headers });
    } catch (networkErr) {
      // Treat raw network/transport failures as transient too.
      lastErr = networkErr;
      logger.warn({ event: 'fetch_error', path: apiPath, attempt, message: networkErr.message });
      if (attempt < MAX_ATTEMPTS - 1) {
        await wait(Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS));
        continue;
      }
      const e = new Error(`Figma API network failure on ${apiPath}: ${networkErr.message}`);
      e.path = apiPath;
      throw e;
    }

    const ms = Date.now() - t0;

    if (res.ok) {
      const json = await res.json();
      const bytes = Buffer.byteLength(JSON.stringify(json), 'utf8');
      return { json, ms, bytes };
    }

    // Non-2xx. Read a short body prefix for diagnostics — NEVER the token.
    let bodyPrefix = '';
    try {
      const text = await res.text();
      bodyPrefix = String(text).slice(0, 200);
    } catch {
      bodyPrefix = '';
    }

    if (isTransient(res.status) && attempt < MAX_ATTEMPTS - 1) {
      logger.warn({ event: 'transient_retry', path: apiPath, status: res.status, attempt });
      await wait(Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS));
      lastErr = new Error(`Figma API ${res.status} on ${apiPath}`);
      continue;
    }

    // Non-transient, or transient budget exhausted → structured throw.
    const err = new Error(`Figma API ${res.status} on ${apiPath}: ${bodyPrefix}`);
    err.status = res.status;
    err.path = apiPath;
    throw err;
  }

  // Defensive: loop only exits via return/throw above, but guard anyway.
  const err = lastErr || new Error(`Figma API request failed on ${apiPath}`);
  err.path = apiPath;
  throw err;
}

/**
 * Write one endpoint's JSON to <outDir>/<name>.json and emit structured timing.
 * Returns { name, bytes, ms }. The logger receives only { endpoint, bytes, ms } —
 * never the body, never the token (D-10).
 */
function save(outDir, name, data, meta, logger) {
  const filePath = path.join(outDir, `${name}.json`);
  const body = JSON.stringify(data);
  fs.writeFileSync(filePath, body);
  const bytes = Buffer.byteLength(body, 'utf8');
  logger.info({ event: 'endpoint_saved', endpoint: name, bytes, ms: meta.ms });
  return { name, bytes, ms: meta.ms };
}

function readMetaIfPresent(outDir) {
  const metaPath = path.join(outDir, '_meta.json');
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Productionized Figma REST puller.
 *
 * @param {object} opts
 * @param {string} opts.input        - required: bare file key OR full Figma file URL
 * @param {string} opts.outDir       - required: raw/ cache dir to write *.json into
 * @param {string} [opts.token]      - defaults to env FIGMA_TOKEN / FIGMA_PERSONAL_ACCESS_TOKEN
 * @param {Function} [opts.fetchImpl]- injectable fetch (defaults to global fetch)
 * @param {object} [opts.logger]     - { info(obj), warn(obj), error(obj) } structured sink
 * @param {Date}   [opts.now]        - deterministic clock for TTL tests
 * @param {boolean}[opts.forceRefresh]- bypass version/TTL cache check
 * @param {Function}[opts.sleepImpl] - injectable sleep for fast backoff tests
 * @returns {Promise<{fileKey,version,cached,endpoints,outDir}>}
 *
 * Effect: writes <outDir>/file.json, styles.json, components.json,
 * component_sets.json (+ variables.json when Path A succeeds) and
 * <outDir>/_meta.json { file_key, fetched_at, version, totals }.
 * NEVER returns raw response bodies. NEVER logs/persists `token`.
 */
async function pull(opts) {
  const {
    input,
    outDir,
    token,
    fetchImpl = globalThis.fetch,
    logger = noopLogger,
    now,
    forceRefresh = false,
    sleepImpl,
  } = opts || {};

  if (!input) {
    throw new TypeError('pull: opts.input (file key or URL) is required');
  }
  if (!outDir) {
    throw new TypeError('pull: opts.outDir (cache dir) is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('pull: a fetch implementation is required (global fetch or opts.fetchImpl)');
  }

  // D-10: token from env only when not explicitly injected. NEVER interpolate
  // the resolved token into any message, log line, or file.
  const tok = token || process.env.FIGMA_TOKEN || process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
  if (!tok) {
    throw new Error(
      'FIGMA_TOKEN not set. Export FIGMA_TOKEN=figd_… (get one at ' +
        'https://www.figma.com/developers/api#access-tokens).'
    );
  }

  const headers = { 'X-Figma-Token': tok };
  const fileKey = parseFigmaFileKey(input);
  const clock = now instanceof Date ? now : new Date();

  fs.mkdirSync(outDir, { recursive: true });

  // ── Version probe (D-11) ────────────────────────────────────────────────
  // Cheapest file call that still returns the `version` field. depth=1 avoids
  // pulling the full (potentially hundreds-of-MB) node tree just to compare.
  let probedVersion = null;
  try {
    const probe = await fetchJson(`/files/${fileKey}?depth=1`, {
      fetchImpl,
      headers,
      logger,
      sleepImpl,
    });
    probedVersion = probe.json && probe.json.version != null ? probe.json.version : null;
    logger.info({ event: 'version_probe', endpoint: 'file_probe', version: probedVersion, ms: probe.ms });
  } catch (probeErr) {
    // Probe failure should not be fatal on its own — fall through to TTL logic
    // and let the heavy pull surface a real error if the file is unreachable.
    logger.warn({ event: 'version_probe_failed', message: probeErr.message });
    probedVersion = null;
  }

  // ── Cache check (D-11) ──────────────────────────────────────────────────
  const cachedMeta = readMetaIfPresent(outDir);
  if (!forceRefresh && cachedMeta) {
    const versionMatch =
      probedVersion != null && cachedMeta.version != null && cachedMeta.version === probedVersion;

    let ttlFresh = false;
    if (probedVersion == null && cachedMeta.fetched_at) {
      const age = clock.getTime() - new Date(cachedMeta.fetched_at).getTime();
      ttlFresh = Number.isFinite(age) && age >= 0 && age < TTL_MS;
    }

    if (versionMatch || ttlFresh) {
      logger.info({
        event: 'cache_hit',
        reason: versionMatch ? 'version_match' : 'ttl_fresh',
        version: probedVersion != null ? probedVersion : cachedMeta.version || null,
      });
      return {
        fileKey,
        version: probedVersion != null ? probedVersion : cachedMeta.version || null,
        cached: true,
        endpoints: [],
        outDir,
      };
    }
  }

  // ── Heavy pull ──────────────────────────────────────────────────────────
  const endpoints = [];
  for (const ep of DEFAULT_ENDPOINTS) {
    const apiPath = ep.path(fileKey);
    if (ep.optional) {
      // Path A (Variables): may 403 on non-Enterprise plans → graceful skip.
      try {
        const result = await fetchJson(apiPath, { fetchImpl, headers, logger, sleepImpl });
        endpoints.push(save(outDir, ep.name, result.json, result, logger));
      } catch (e) {
        const reason = e.status ? `HTTP ${e.status}` : e.message;
        logger.warn({ event: 'endpoint_skipped', endpoint: ep.name, reason });
        endpoints.push({ name: ep.name, bytes: 0, ms: 0, skipped: true, reason });
      }
    } else {
      const result = await fetchJson(apiPath, { fetchImpl, headers, logger, sleepImpl });
      endpoints.push(save(outDir, ep.name, result.json, result, logger));
    }
  }

  // ── Persist _meta.json (D-11 shape, extends spike _meta with version) ─────
  const meta = {
    file_key: fileKey,
    fetched_at: clock.toISOString(),
    version: probedVersion,
    totals: endpoints,
  };
  fs.writeFileSync(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));
  logger.info({ event: 'pull_complete', fileKey, version: probedVersion, endpoints: endpoints.length });

  return { fileKey, version: probedVersion, cached: false, endpoints, outDir };
}

module.exports = { pull, DEFAULT_ENDPOINTS, FIGMA_API_BASE };

// ── CLI entry ───────────────────────────────────────────────────────────────
// Usage: node scripts/lib/figma-extract/pull.cjs <file-url-or-key> [--out <dir>] [--force]
//        node scripts/lib/figma-extract/pull.cjs --help
// FIGMA_TOKEN must be set in the environment (never passed as a flag — D-10).
if (require.main === module) {
  const argv = process.argv.slice(2);

  const HELP = `gdd figma-extract pull — raw Figma REST puller (Plan 31-01)

Usage:
  node scripts/lib/figma-extract/pull.cjs <file-url-or-key> [options]

Arguments:
  <file-url-or-key>   A Figma file URL (https://www.figma.com/file/<key>/… or
                      /design/<key>/…) OR a bare file key.

Options:
  --out <dir>         Raw cache output dir.
                      Default: .figma-extract-cache/raw/<file-key>
  --force             Bypass version/TTL cache and re-pull all endpoints.
  -h, --help          Show this help.

Environment:
  FIGMA_TOKEN                   Personal access token (required).
  FIGMA_PERSONAL_ACCESS_TOKEN   Fallback token env var.
  (The token is read from the environment only — never accepted as a flag,
   never logged, never written to disk. — D-10)

Notes:
  - Drops geometry=paths from the file endpoint (D-03).
  - Skips a 403 Variables endpoint gracefully (Path A, D-04).
  - Content-version cache invalidation with 1h TTL fallback (D-11).
  - Writes JSON to disk only; raw bodies never printed (off-context, D-01).
`;

  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  // Minimal flag parse — first non-flag token is the input.
  let input = null;
  let outDir = null;
  let forceRefresh = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') {
      forceRefresh = true;
    } else if (a === '--out') {
      outDir = argv[++i];
    } else if (!a.startsWith('-') && input === null) {
      input = a;
    }
  }

  if (!input) {
    process.stderr.write('ERROR: a Figma file URL or key is required.\n\n' + HELP);
    process.exit(1);
  }

  // Resolve default outDir lazily so we have the parsed key in the path.
  (async () => {
    try {
      const fileKey = parseFigmaFileKey(input);
      const resolvedOut =
        outDir || path.join('.figma-extract-cache', 'raw', fileKey);

      // CLI logger → structured JSON lines on stderr (never the token/body).
      const cliLogger = {
        info: (o) => process.stderr.write(JSON.stringify({ level: 'info', ...o }) + '\n'),
        warn: (o) => process.stderr.write(JSON.stringify({ level: 'warn', ...o }) + '\n'),
        error: (o) => process.stderr.write(JSON.stringify({ level: 'error', ...o }) + '\n'),
      };

      const result = await pull({
        input,
        outDir: resolvedOut,
        logger: cliLogger,
        forceRefresh,
      });

      process.stdout.write(
        JSON.stringify(
          {
            fileKey: result.fileKey,
            version: result.version,
            cached: result.cached,
            outDir: result.outDir,
            endpoints: result.endpoints.map((e) => ({
              name: e.name,
              bytes: e.bytes,
              ms: e.ms,
              skipped: e.skipped || false,
            })),
          },
          null,
          2
        ) + '\n'
      );
      process.exit(0);
    } catch (e) {
      // Surface the message (which never contains the token) on stderr.
      process.stderr.write('FAILED: ' + e.message + '\n');
      process.exit(1);
    }
  })();
}
