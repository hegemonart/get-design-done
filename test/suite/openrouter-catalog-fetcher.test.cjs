'use strict';
// Plan 33.6-01 — OpenRouter catalog-fetcher contract (SC#3 + SC#9; D-02/D-06/D-07/D-08/D-10).
//
// Drives scripts/lib/openrouter/catalog-fetcher.cjs entirely through an
// INJECTED stub `fetchImpl` (D-07 — NO live network in `npm test`) over a
// tmpdir `cachePath`. Asserts:
//   1. cold fetch maps the OpenRouter /models shape into the CONTEXT cache shape
//      and ATOMICALLY writes it; stub called exactly once.
//   2. TTL skip — a fresh cache returns cached models WITHOUT calling fetchImpl.
//   3. stale cache (older than ttlHours) re-fetches + re-writes.
//   4. transient-then-success retries (stub rejects/HTTP-5xx once then succeeds);
//      a near-zero backoff keeps the test sub-second.
//   5. graceful no-key — empty cache → null; stale cache → stale models; NEVER throws.
//   6. readCatalog round-trips the fixture + returns null on a corrupt file (no throw).
//   7. the 33.5 outbound gate (scripts/scan-outbound-network.cjs) exits 0 now that
//      scripts/lib/openrouter/** is allowlisted (D-06).
//
// Hermetic: stub fetch + tmpdir cachePath, NO OPENROUTER_API_KEY required.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_PATH = path.join(
  REPO_ROOT,
  'test',
  'fixtures',
  'baselines',
  'phase-33-6',
  'openrouter-catalog.json',
);

const { fetchCatalog, readCatalog } = require('../../scripts/lib/openrouter/catalog-fetcher.cjs');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Load the shared Wave-A fixture once; it mirrors the CONTEXT cache shape.
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

// The OpenRouter /models API returns { data: [ { id, name, context_length,
// pricing:{prompt,completion, ...}, <extra fields> } ] }. Build that wire shape
// from the fixture cache models, adding noise fields the mapper must DROP.
function wireResponseFromFixture() {
  return {
    data: FIXTURE.models.map((m) => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      pricing: {
        prompt: m.pricing.prompt,
        completion: m.pricing.completion,
        request: '0', // noise — must be dropped
        image: '0', // noise — must be dropped
      },
      // Extra top-level fields the mapper must drop:
      description: 'a model',
      top_provider: { max_completion_tokens: 4096 },
      per_request_limits: null,
    })),
  };
}

// A stub fetchImpl returning a Fetch-Response-like object. `headers` is a Map so
// rate-guard's getHeader (Map branch) can read it.
function okStub(body) {
  let calls = 0;
  const impl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => body,
    };
  };
  impl.calls = () => calls;
  return impl;
}

// A stub that fails (HTTP 503 → NETWORK_TRANSIENT) on attempt 1, then succeeds.
function transientThenOkStub(body) {
  let calls = 0;
  const impl = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: false, status: 503, headers: new Map(), json: async () => ({}) };
    }
    return { ok: true, status: 200, headers: new Map(), json: async () => body };
  };
  impl.calls = () => calls;
  return impl;
}

// A stub that ALWAYS throws (network error → NETWORK_TRANSIENT) so retries exhaust.
function alwaysThrowStub() {
  let calls = 0;
  const impl = async () => {
    calls += 1;
    const e = new Error('socket hang up');
    e.code = 'ECONNRESET';
    throw e;
  };
  impl.calls = () => calls;
  return impl;
}

function freshTmpCache() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-or-cat-'));
  return { dir, cachePath: path.join(dir, 'openrouter-models.json') };
}

function seedCache(cachePath, fetchedAtMs) {
  const seeded = {
    fetched_at: new Date(fetchedAtMs).toISOString(),
    ttl_hours: 24,
    source: 'https://openrouter.ai/api/v1/models',
    models: FIXTURE.models,
  };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(seeded, null, 2), 'utf8');
}

// Pin "now" so TTL math is deterministic.
const NOW_MS = Date.parse('2026-06-01T12:00:00.000Z');
const now = () => new Date(NOW_MS);

// Near-zero backoff so the retry test never sleeps real seconds.
const FAST_BACKOFF = { baseMs: 0, maxMs: 0, factor: 1, jitter: 0 };

// ── Tests ───────────────────────────────────────────────────────────────────

test('33.6-01: cold fetch maps + atomically writes cache', async () => {
  const { dir, cachePath } = freshTmpCache();
  try {
    const stub = okStub(wireResponseFromFixture());
    const models = await fetchCatalog({
      fetchImpl: stub,
      now,
      cachePath,
      ttlHours: 24,
      apiKey: 'sk-or-test',
      backoffOpts: FAST_BACKOFF,
    });

    assert.ok(Array.isArray(models), 'returns a models array');
    assert.equal(models.length, FIXTURE.models.length, 'all fixture models mapped');
    assert.equal(stub.calls(), 1, 'fetchImpl called exactly once on a cold fetch');

    // The cache file was written with the CONTEXT shape.
    assert.ok(fs.existsSync(cachePath), 'cache file written at cachePath');
    const written = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(typeof written.fetched_at, 'string', 'fetched_at stamped');
    assert.equal(written.ttl_hours, 24, 'ttl_hours stamped');
    assert.equal(written.source, 'https://openrouter.ai/api/v1/models', 'source stamped');
    assert.ok(Array.isArray(written.models), 'models[] written');

    // Mapping kept only the contract fields and dropped noise.
    const opus = written.models.find((m) => m.id === 'anthropic/claude-opus-4-7');
    assert.ok(opus, 'opus model present');
    assert.deepEqual(
      Object.keys(opus).sort(),
      ['context_length', 'id', 'name', 'pricing'],
      'mapped model has only id/name/context_length/pricing',
    );
    assert.deepEqual(
      Object.keys(opus.pricing).sort(),
      ['completion', 'prompt'],
      'pricing has only prompt/completion (noise dropped)',
    );

    // No leftover temp file from the atomic write.
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    assert.deepEqual(leftovers, [], 'no .tmp leftovers — rename completed the atomic write');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: TTL skip returns cached without fetching', async () => {
  const { dir, cachePath } = freshTmpCache();
  try {
    seedCache(cachePath, NOW_MS - 1 * 3600_000); // 1h old — fresh under 24h TTL
    const stub = okStub(wireResponseFromFixture());

    const models = await fetchCatalog({
      fetchImpl: stub,
      now,
      cachePath,
      ttlHours: 24,
      apiKey: 'sk-or-test',
      backoffOpts: FAST_BACKOFF,
    });

    assert.ok(Array.isArray(models) && models.length === FIXTURE.models.length, 'returns cached models');
    assert.equal(stub.calls(), 0, 'fetchImpl NOT called when cache is fresh (TTL skip)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: stale cache re-fetches', async () => {
  const { dir, cachePath } = freshTmpCache();
  try {
    seedCache(cachePath, NOW_MS - 25 * 3600_000); // 25h old — stale under 24h TTL
    const stub = okStub(wireResponseFromFixture());

    const models = await fetchCatalog({
      fetchImpl: stub,
      now,
      cachePath,
      ttlHours: 24,
      apiKey: 'sk-or-test',
      backoffOpts: FAST_BACKOFF,
    });

    assert.ok(Array.isArray(models), 'returns models');
    assert.equal(stub.calls(), 1, 'stale cache triggers a re-fetch');
    const written = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    assert.equal(written.fetched_at, now().toISOString(), 'cache fetched_at re-stamped to now');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: transient-then-success retries', async () => {
  const { dir, cachePath } = freshTmpCache();
  try {
    const stub = transientThenOkStub(wireResponseFromFixture());

    const models = await fetchCatalog({
      fetchImpl: stub,
      now,
      cachePath,
      ttlHours: 24,
      apiKey: 'sk-or-test',
      backoffOpts: FAST_BACKOFF, // near-zero sleep — fast
    });

    assert.ok(Array.isArray(models) && models.length === FIXTURE.models.length, 'eventually returns models');
    assert.ok(stub.calls() >= 2, 'a transient failure triggered at least one retry');
    assert.ok(fs.existsSync(cachePath), 'cache written after the successful retry');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: AUTH_ERROR is not retried (non-retryable degrades)', async () => {
  const { dir, cachePath } = freshTmpCache();
  try {
    let calls = 0;
    const authStub = async () => {
      calls += 1;
      return { ok: false, status: 401, headers: new Map(), json: async () => ({}) };
    };

    // No cache + auth failure → null, and NOT retried (single attempt).
    const models = await fetchCatalog({
      fetchImpl: authStub,
      now,
      cachePath,
      ttlHours: 24,
      apiKey: 'sk-or-bad',
      backoffOpts: FAST_BACKOFF,
    });

    assert.equal(models, null, 'auth failure with no cache degrades to null');
    assert.equal(calls, 1, 'AUTH_ERROR is NOT retried (single attempt, no backoff loop)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: no key degrades to cached-if-any-else-null, never throws', async () => {
  // (a) no apiKey + empty cache → null
  {
    const { dir, cachePath } = freshTmpCache();
    try {
      const stub = okStub(wireResponseFromFixture());
      let result;
      await assert.doesNotReject(async () => {
        result = await fetchCatalog({ fetchImpl: stub, now, cachePath, ttlHours: 24, apiKey: undefined });
      }, 'no-key + empty cache must not throw');
      assert.equal(result, null, 'no key + empty cache → null');
      assert.equal(stub.calls(), 0, 'no key → fetchImpl never called');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // (b) no apiKey + seeded STALE cache → returns stale models (stale-but-present)
  {
    const { dir, cachePath } = freshTmpCache();
    try {
      seedCache(cachePath, NOW_MS - 100 * 3600_000); // very stale
      const stub = okStub(wireResponseFromFixture());
      let result;
      await assert.doesNotReject(async () => {
        result = await fetchCatalog({ fetchImpl: stub, now, cachePath, ttlHours: 24, apiKey: undefined });
      }, 'no-key + stale cache must not throw');
      assert.ok(Array.isArray(result) && result.length === FIXTURE.models.length, 'no key + stale cache → stale models');
      assert.equal(stub.calls(), 0, 'no key → fetchImpl never called even with a stale cache');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // (c) key present but ALL fetches fail (exhausted) + stale cache → stale models, no throw
  {
    const { dir, cachePath } = freshTmpCache();
    try {
      seedCache(cachePath, NOW_MS - 100 * 3600_000);
      const stub = alwaysThrowStub();
      let result;
      await assert.doesNotReject(async () => {
        result = await fetchCatalog({
          fetchImpl: stub,
          now,
          cachePath,
          ttlHours: 24,
          apiKey: 'sk-or-test',
          backoffOpts: FAST_BACKOFF,
        });
      }, 'exhausted retries with a stale cache must not throw');
      assert.ok(Array.isArray(result) && result.length === FIXTURE.models.length, 'exhausted + stale cache → stale models');
      assert.ok(stub.calls() >= 2, 'retries were attempted before degrading');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // (d) key present but ALL fetches fail + NO cache → null, no throw
  {
    const { dir, cachePath } = freshTmpCache();
    try {
      const stub = alwaysThrowStub();
      let result;
      await assert.doesNotReject(async () => {
        result = await fetchCatalog({
          fetchImpl: stub,
          now,
          cachePath,
          ttlHours: 24,
          apiKey: 'sk-or-test',
          backoffOpts: FAST_BACKOFF,
        });
      }, 'exhausted retries with no cache must not throw');
      assert.equal(result, null, 'exhausted + no cache → null');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('33.6-01: readCatalog round-trips fixture + null on corrupt', () => {
  // Round-trip the shared fixture.
  const models = readCatalog({ cachePath: FIXTURE_PATH });
  assert.ok(Array.isArray(models), 'readCatalog returns the models array for a valid cache');
  assert.equal(models.length, FIXTURE.models.length, 'all fixture models returned');
  assert.ok(
    models.some((m) => m.id === 'anthropic/claude-opus-4-7'),
    'fixture model ids preserved',
  );

  // Corrupt file → null, no throw.
  const { dir, cachePath } = freshTmpCache();
  try {
    fs.writeFileSync(cachePath, '{ this is : not json,,, ', 'utf8');
    let res;
    assert.doesNotThrow(() => {
      res = readCatalog({ cachePath });
    }, 'readCatalog must not throw on a corrupt file');
    assert.equal(res, null, 'corrupt cache → null');

    // Missing file → null, no throw.
    const missing = path.join(dir, 'does-not-exist.json');
    assert.doesNotThrow(() => {
      res = readCatalog({ cachePath: missing });
    }, 'readCatalog must not throw on a missing file');
    assert.equal(res, null, 'missing cache → null');

    // Shape-invalid (no models[]) → null.
    fs.writeFileSync(cachePath, JSON.stringify({ fetched_at: 'x', models: 'nope' }), 'utf8');
    res = readCatalog({ cachePath });
    assert.equal(res, null, 'shape-invalid cache (models not an array) → null');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('33.6-01: outbound gate exits 0 with openrouter allowlisted', () => {
  const res = spawnSync(process.execPath, ['scripts/scan-outbound-network.cjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(
    res.status,
    0,
    `scan:outbound must exit 0 with scripts/lib/openrouter/** allowlisted.\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`,
  );
});
