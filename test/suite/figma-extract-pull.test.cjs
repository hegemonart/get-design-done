'use strict';
// tests/figma-extract-pull.test.cjs — Plan 31-01 (Wave A.1)
//
// Offline coverage for scripts/lib/figma-extract/pull.cjs. Every test injects a
// fetch stub (makeFetchStub) and a logger spy — NO live Figma network calls in
// CI. Each test that writes uses a fresh mkdtemp outDir and cleans up.
//
// All tests are tagged "31-01:" in their names (>= 12 required).
//
// Coverage:
//   - parse-url integration (full /file/ URL → key)
//   - D-03: geometry=paths absent from every request URL
//   - cache files written (file.json + _meta.json) + _meta shape
//   - D-04: 403 variables → graceful skip, run still succeeds
//   - retry+backoff: 429-then-200 retried; persistent 500 → bounded throw
//   - D-11: version-match cache hit (heavy endpoints NOT fetched);
//           TTL fallback fresh vs stale; forceRefresh bypass
//   - D-10: token never written to any file, never passed to logger;
//           missing token throws without interpolating the token

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { pull } = require('../../scripts/lib/figma-extract/pull.cjs');
const FIXTURE = require('../../test/fixtures/figma/files-response.json');

const FILE_URL = 'https://www.figma.com/file/IAHNrYoqIh56SCxgv3PjCS/Sample-DS?node-id=0-1';
const FILE_KEY = 'IAHNrYoqIh56SCxgv3PjCS';

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-figma-pull-'));
}

function rm(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

// A logger spy that records every call's argument (so tests can assert the
// token never appears in any structured log line).
function makeLoggerSpy() {
  const entries = [];
  const sink = (o) => entries.push(o);
  return {
    logger: { info: sink, warn: sink, error: sink },
    entries,
    stringified: () => entries.map((e) => JSON.stringify(e)).join('\n'),
  };
}

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });
const fail = (status, text = '') => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => text,
});

/**
 * Build an injectable fetchImpl from a routes table. Routes are tried in order;
 * each route is { match: (url) => bool, handler: (url, calls) => responseLike }.
 * Records every URL it was called with on `.calls` and the X-Figma-Token header
 * on `.tokens`. A response can be a function (for stateful retry sequences).
 */
function makeFetchStub(routes) {
  const calls = [];
  const tokens = [];
  const fetchImpl = async (url, opts) => {
    calls.push(url);
    tokens.push(opts && opts.headers ? opts.headers['X-Figma-Token'] : undefined);
    for (const route of routes) {
      if (route.match(url)) {
        const r = typeof route.handler === 'function' ? route.handler(url, calls) : route.handler;
        return r;
      }
    }
    return fail(404, 'no route');
  };
  fetchImpl.calls = calls;
  fetchImpl.tokens = tokens;
  return fetchImpl;
}

// Route matchers. The version probe is `/files/:key?depth=1`; the heavy file
// pull is `/files/:key` with NO query. Distinguish them precisely.
const isProbe = (u) => u.includes(`/files/${FILE_KEY}?depth=1`);
const isHeavyFile = (u) => u.includes(`/files/${FILE_KEY}`) && !u.includes('?') && !/\/(variables|styles|components|component_sets)/.test(u);
const isVariables = (u) => u.includes('/variables/local');
const isStyles = (u) => u.endsWith('/styles');
const isComponents = (u) => u.endsWith('/components');
const isComponentSets = (u) => u.endsWith('/component_sets');

// A "happy path" route set: probe + all 5 endpoints return 200.
function happyRoutes(fixture = FIXTURE) {
  return [
    { match: isProbe, handler: () => ok({ version: fixture.version, name: fixture.name }) },
    { match: isVariables, handler: () => ok({ meta: { variables: {}, variableCollections: {} } }) },
    { match: isStyles, handler: () => ok({ meta: { styles: [] } }) },
    { match: isComponents, handler: () => ok({ meta: { components: [] } }) },
    { match: isComponentSets, handler: () => ok({ meta: { component_sets: [] } }) },
    { match: isHeavyFile, handler: () => ok(fixture) },
  ];
}

// Fast sleep so retry/backoff tests don't actually wait.
const fastSleep = async () => {};

// ── tests ────────────────────────────────────────────────────────────────────

test('31-01: parseFigmaFileKey integration — pull accepts a full /file/ URL and resolves the key', async () => {
  const dir = tmpDir();
  try {
    const fetchImpl = makeFetchStub(happyRoutes());
    const res = await pull({ input: FILE_URL, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    assert.equal(res.fileKey, FILE_KEY, 'fileKey must be resolved from the /file/ URL');
    assert.equal(res.cached, false);
  } finally {
    rm(dir);
  }
});

test('31-01: file endpoint URL contains NO geometry=paths', async () => {
  const dir = tmpDir();
  try {
    const fetchImpl = makeFetchStub(happyRoutes());
    await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    const offenders = fetchImpl.calls.filter((u) => /geometry=paths/.test(u));
    assert.equal(offenders.length, 0, `geometry=paths must never appear; found: ${offenders.join(', ')}`);
    // And the heavy file call must have actually happened.
    assert.ok(fetchImpl.calls.some(isHeavyFile), 'heavy file endpoint must be fetched');
  } finally {
    rm(dir);
  }
});

test('31-01: writes file.json + _meta.json to outDir', async () => {
  const dir = tmpDir();
  try {
    const fetchImpl = makeFetchStub(happyRoutes());
    await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    assert.ok(fs.existsSync(path.join(dir, 'file.json')), 'file.json must exist');
    assert.ok(fs.existsSync(path.join(dir, '_meta.json')), '_meta.json must exist');
    assert.ok(fs.existsSync(path.join(dir, 'styles.json')), 'styles.json must exist');
    assert.ok(fs.existsSync(path.join(dir, 'components.json')), 'components.json must exist');
    assert.ok(fs.existsSync(path.join(dir, 'component_sets.json')), 'component_sets.json must exist');
  } finally {
    rm(dir);
  }
});

test('31-01: _meta.json records file_key + fetched_at + version + totals', async () => {
  const dir = tmpDir();
  try {
    const fetchImpl = makeFetchStub(happyRoutes());
    const now = new Date('2026-05-29T00:00:00.000Z');
    await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, now, sleepImpl: fastSleep });
    const meta = JSON.parse(fs.readFileSync(path.join(dir, '_meta.json'), 'utf8'));
    assert.equal(meta.file_key, FILE_KEY);
    assert.equal(meta.fetched_at, now.toISOString());
    assert.equal(meta.version, FIXTURE.version);
    assert.ok(Array.isArray(meta.totals), 'totals must be an array of per-endpoint records');
    assert.ok(meta.totals.find((t) => t.name === 'file'), 'totals must include the file endpoint');
  } finally {
    rm(dir);
  }
});

test('31-01: 403 on variables endpoint → recorded as skipped, run still succeeds', async () => {
  const dir = tmpDir();
  try {
    // variables endpoint returns 403 (Enterprise-only); everything else 200.
    const routes403 = [
      { match: isProbe, handler: () => ok({ version: FIXTURE.version }) },
      { match: isVariables, handler: () => fail(403, 'Forbidden: Enterprise only') },
      { match: isStyles, handler: () => ok({ meta: { styles: [] } }) },
      { match: isComponents, handler: () => ok({ meta: {} }) },
      { match: isComponentSets, handler: () => ok({ meta: {} }) },
      { match: isHeavyFile, handler: () => ok(FIXTURE) },
    ];
    const fetchImpl = makeFetchStub(routes403);
    const res = await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    assert.equal(res.cached, false);
    const vars = res.endpoints.find((e) => e.name === 'variables');
    assert.ok(vars, 'variables endpoint must be present in endpoints[]');
    assert.equal(vars.skipped, true, 'variables endpoint must be marked skipped on 403');
    assert.ok(vars.reason, 'a skip reason must be captured');
    // variables.json must NOT be written when skipped.
    assert.ok(!fs.existsSync(path.join(dir, 'variables.json')), 'no variables.json on 403 skip');
    // The rest still succeeded.
    assert.ok(fs.existsSync(path.join(dir, 'file.json')));
  } finally {
    rm(dir);
  }
});

test('31-01: 429 then 200 on file endpoint → retried, eventually succeeds', async () => {
  const dir = tmpDir();
  try {
    let fileAttempts = 0;
    const routes = [
      { match: isProbe, handler: () => ok({ version: FIXTURE.version }) },
      { match: isVariables, handler: () => ok({ meta: {} }) },
      { match: isStyles, handler: () => ok({ meta: {} }) },
      { match: isComponents, handler: () => ok({ meta: {} }) },
      { match: isComponentSets, handler: () => ok({ meta: {} }) },
      {
        match: isHeavyFile,
        handler: () => {
          fileAttempts += 1;
          return fileAttempts === 1 ? fail(429, 'rate limited') : ok(FIXTURE);
        },
      },
    ];
    const fetchImpl = makeFetchStub(routes);
    const res = await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    assert.ok(fileAttempts >= 2, 'file endpoint must have been retried at least once');
    assert.equal(res.cached, false);
    const fileEp = res.endpoints.find((e) => e.name === 'file');
    assert.ok(fileEp && !fileEp.skipped, 'file endpoint must eventually succeed');
    assert.ok(fs.existsSync(path.join(dir, 'file.json')));
  } finally {
    rm(dir);
  }
});

test('31-01: persistent 500 on file endpoint → throws structured Error after bounded retries (no hang)', async () => {
  const dir = tmpDir();
  try {
    let fileAttempts = 0;
    const routes = [
      { match: isProbe, handler: () => ok({ version: FIXTURE.version }) },
      {
        match: isHeavyFile,
        handler: () => {
          fileAttempts += 1;
          return fail(500, 'internal error');
        },
      },
    ];
    const fetchImpl = makeFetchStub(routes);
    await assert.rejects(
      () => pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep }),
      (err) => {
        assert.equal(err.status, 500, 'thrown error must carry the HTTP status');
        assert.match(err.message, /500/);
        return true;
      }
    );
    // Bounded — exactly MAX_ATTEMPTS (4) tries, not infinite.
    assert.ok(fileAttempts >= 2 && fileAttempts <= 6, `bounded retries, got ${fileAttempts}`);
  } finally {
    rm(dir);
  }
});

test('31-01: version probe match + existing _meta → cached:true, heavy endpoints NOT fetched', async () => {
  const dir = tmpDir();
  try {
    // Seed an existing _meta.json with a known version.
    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ file_key: FILE_KEY, fetched_at: '2020-01-01T00:00:00.000Z', version: 'v1', totals: [] })
    );
    const routes = [
      { match: isProbe, handler: () => ok({ version: 'v1' }) },
      // Heavy/other endpoints would 500 if called — they must NOT be.
      { match: isHeavyFile, handler: () => fail(500, 'should not be called') },
      { match: isStyles, handler: () => fail(500, 'should not be called') },
      { match: isComponents, handler: () => fail(500, 'should not be called') },
    ];
    const fetchImpl = makeFetchStub(routes);
    const res = await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, sleepImpl: fastSleep });
    assert.equal(res.cached, true, 'matching version must produce a cache hit');
    assert.equal(res.version, 'v1');
    assert.deepEqual(res.endpoints, [], 'no endpoints pulled on a cache hit');
    // Only the probe should have been called.
    assert.ok(!fetchImpl.calls.some(isHeavyFile), 'heavy file endpoint must NOT be fetched on cache hit');
    assert.ok(!fetchImpl.calls.some(isStyles), 'styles must NOT be fetched on cache hit');
    assert.ok(!fetchImpl.calls.some(isComponents), 'components must NOT be fetched on cache hit');
  } finally {
    rm(dir);
  }
});

test('31-01: no version field + fetched_at within 1h → cached:true (TTL fallback)', async () => {
  const dir = tmpDir();
  try {
    const now = new Date('2026-05-29T12:00:00.000Z');
    // fetched 30 min ago → within 1h TTL.
    const fetchedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ file_key: FILE_KEY, fetched_at: fetchedAt, version: null, totals: [] })
    );
    const routes = [
      // Probe returns NO version field → forces TTL path.
      { match: isProbe, handler: () => ok({ name: 'Sample/DS' }) },
      { match: isHeavyFile, handler: () => fail(500, 'should not be called') },
    ];
    const fetchImpl = makeFetchStub(routes);
    const res = await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, now, sleepImpl: fastSleep });
    assert.equal(res.cached, true, 'fresh TTL must produce a cache hit when no version field');
    assert.ok(!fetchImpl.calls.some(isHeavyFile), 'heavy endpoint must not be called on TTL cache hit');
  } finally {
    rm(dir);
  }
});

test('31-01: no version field + fetched_at older than 1h → re-pull (cached:false)', async () => {
  const dir = tmpDir();
  try {
    const now = new Date('2026-05-29T12:00:00.000Z');
    // fetched 90 min ago → stale.
    const fetchedAt = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ file_key: FILE_KEY, fetched_at: fetchedAt, version: null, totals: [] })
    );
    const routes = [
      { match: isProbe, handler: () => ok({ name: 'Sample/DS' }) }, // no version
      { match: isVariables, handler: () => ok({ meta: {} }) },
      { match: isStyles, handler: () => ok({ meta: {} }) },
      { match: isComponents, handler: () => ok({ meta: {} }) },
      { match: isComponentSets, handler: () => ok({ meta: {} }) },
      { match: isHeavyFile, handler: () => ok(FIXTURE) },
    ];
    const fetchImpl = makeFetchStub(routes);
    const res = await pull({ input: FILE_KEY, outDir: dir, token: 'figd_x', fetchImpl, now, sleepImpl: fastSleep });
    assert.equal(res.cached, false, 'stale TTL must trigger a re-pull');
    assert.ok(fetchImpl.calls.some(isHeavyFile), 'heavy endpoint must be re-fetched when stale');
  } finally {
    rm(dir);
  }
});

test('31-01: forceRefresh:true bypasses version-match cache → re-pull', async () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({ file_key: FILE_KEY, fetched_at: new Date().toISOString(), version: 'v1', totals: [] })
    );
    const fetchImpl = makeFetchStub(
      happyRoutes(FIXTURE).map((r) => (r.match === isProbe ? { match: isProbe, handler: () => ok({ version: 'v1' }) } : r))
    );
    const res = await pull({
      input: FILE_KEY,
      outDir: dir,
      token: 'figd_x',
      fetchImpl,
      forceRefresh: true,
      sleepImpl: fastSleep,
    });
    assert.equal(res.cached, false, 'forceRefresh must bypass a matching-version cache');
    assert.ok(fetchImpl.calls.some(isHeavyFile), 'heavy endpoint must be fetched under forceRefresh');
  } finally {
    rm(dir);
  }
});

test('31-01: FIGMA_TOKEN never written to any file in outDir AND never passed to logger', async () => {
  const dir = tmpDir();
  const SENTINEL = 'figd_SECRET_TOKEN_DO_NOT_LEAK';
  try {
    const { logger, stringified } = makeLoggerSpy();
    const fetchImpl = makeFetchStub(happyRoutes());
    await pull({ input: FILE_KEY, outDir: dir, token: SENTINEL, fetchImpl, logger, sleepImpl: fastSleep });

    // 1. The token MUST have reached the request header (functional correctness).
    assert.ok(fetchImpl.tokens.includes(SENTINEL), 'token must be sent in the X-Figma-Token header');

    // 2. The token MUST NOT appear in the logger spy.
    assert.ok(!stringified().includes(SENTINEL), 'token must NEVER appear in any logger call');

    // 3. The token MUST NOT appear in any file written under outDir.
    for (const f of fs.readdirSync(dir)) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.ok(!content.includes(SENTINEL), `token must NEVER be written to disk (found in ${f})`);
    }
  } finally {
    rm(dir);
  }
});

test('31-01: missing token (no env, no opts.token) → throws without interpolating the token', async () => {
  const dir = tmpDir();
  const savedA = process.env.FIGMA_TOKEN;
  const savedB = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
  try {
    delete process.env.FIGMA_TOKEN;
    delete process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
    const fetchImpl = makeFetchStub(happyRoutes());
    await assert.rejects(
      () => pull({ input: FILE_KEY, outDir: dir, fetchImpl, sleepImpl: fastSleep }),
      (err) => {
        assert.match(err.message, /FIGMA_TOKEN/, 'error must mention FIGMA_TOKEN env var');
        // The message must not interpolate any actual secret-looking value.
        assert.ok(!/figd_[A-Za-z0-9]/.test(err.message), 'error must not contain a real token value');
        return true;
      }
    );
    // No network call should have happened (token check is first).
    assert.equal(fetchImpl.calls.length, 0, 'no fetch should occur when the token is missing');
  } finally {
    if (savedA !== undefined) process.env.FIGMA_TOKEN = savedA;
    if (savedB !== undefined) process.env.FIGMA_PERSONAL_ACCESS_TOKEN = savedB;
    rm(dir);
  }
});
