'use strict';
// tests/figma-extract-health.test.cjs — Plan 31-09 (Wave C.3)
//
// Exercises the 6th health check (figma_extract) added to
// scripts/lib/health-mirror/index.cjs. Covers all THREE detail states across
// token-set / token-missing / Free-tier scenarios, the FIGMA_PERSONAL_ACCESS_TOKEN
// fallback, the malformed-marker no-throw guarantee, the D-10 token-non-leak
// invariant, and the additive invariant (existing 5 checks + figma_extract 6th).
//
// The Free-tier signal mirrors what scripts/lib/figma-extract/pull.cjs records
// on a Variables 403: <rootDir>/.figma-extract-cache/raw/<key>/_meta.json with a
// totals[] entry { name:'variables', skipped:true, reason:'HTTP 403' }.
//
// D-10: tests NEVER assert on a real token value. The token-set state uses a
// sentinel string solely to prove the sentinel does NOT appear in the detail.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getHealthChecks } = require('../../scripts/lib/health-mirror/index.cjs');

// A clearly-fake sentinel — used only to assert it never leaks into detail (D-10).
const SENTINEL_TOKEN = 'figd_SENTINEL_DO_NOT_LEAK_31_09';

// --- helpers ---------------------------------------------------------------

/** Create an isolated temp project root for a single test. */
function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-31-09-health-'));
}

function rmRoot(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Write a raw-pull _meta.json under <root> exactly as pull.cjs would on a
 * Variables 403. If `body` is provided it is written verbatim (for the
 * malformed-marker case); otherwise a well-formed 403-skip marker is written.
 */
function writeFreeTierMarker(root, fileKey = 'ABC123key', body) {
  const dir = path.join(root, '.figma-extract-cache', 'raw', fileKey);
  fs.mkdirSync(dir, { recursive: true });
  const metaPath = path.join(dir, '_meta.json');
  if (typeof body === 'string') {
    fs.writeFileSync(metaPath, body);
    return metaPath;
  }
  const meta = {
    file_key: fileKey,
    fetched_at: new Date().toISOString(),
    version: 'v1',
    totals: [
      { name: 'file', bytes: 100, ms: 5 },
      { name: 'variables', bytes: 0, ms: 0, skipped: true, reason: 'HTTP 403' },
      { name: 'styles', bytes: 50, ms: 3 },
    ],
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return metaPath;
}

/**
 * Run `fn` with FIGMA_TOKEN / FIGMA_PERSONAL_ACCESS_TOKEN forced to the given
 * values, restoring the original env afterward (try/finally so a failing
 * assertion never bleeds env into the next test).
 */
async function withTokenEnv({ token, patToken }, fn) {
  const origToken = process.env.FIGMA_TOKEN;
  const origPat = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
  try {
    if (token === undefined) delete process.env.FIGMA_TOKEN;
    else process.env.FIGMA_TOKEN = token;
    if (patToken === undefined) delete process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
    else process.env.FIGMA_PERSONAL_ACCESS_TOKEN = patToken;
    return await fn();
  } finally {
    if (origToken === undefined) delete process.env.FIGMA_TOKEN;
    else process.env.FIGMA_TOKEN = origToken;
    if (origPat === undefined) delete process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
    else process.env.FIGMA_PERSONAL_ACCESS_TOKEN = origPat;
  }
}

function figmaCheck(result) {
  return result.checks.find((c) => c.name === 'figma_extract');
}

// --- tests -----------------------------------------------------------------

test('31-09: token unset → figma_extract detail = "figma extract: token missing" (status warn)', async () => {
  const root = makeRoot();
  try {
    await withTokenEnv({ token: undefined, patToken: undefined }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      assert.ok(fx, 'figma_extract check must exist');
      assert.equal(fx.detail, 'figma extract: token missing');
      assert.equal(fx.status, 'warn');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: token set + no Free-tier marker → "figma extract: ready (token set)" (status ok)', async () => {
  const root = makeRoot();
  try {
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: undefined }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      assert.equal(fx.detail, 'figma extract: ready (token set)');
      assert.equal(fx.status, 'ok');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: token set + Free-tier marker present → "figma extract: plugin sync needed for variables (Free tier detected)" (status warn)', async () => {
  const root = makeRoot();
  try {
    writeFreeTierMarker(root);
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: undefined }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      assert.equal(
        fx.detail,
        'figma extract: plugin sync needed for variables (Free tier detected)'
      );
      assert.equal(fx.status, 'warn');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: FIGMA_PERSONAL_ACCESS_TOKEN alone counts as token set (fallback env)', async () => {
  const root = makeRoot();
  try {
    await withTokenEnv({ token: undefined, patToken: SENTINEL_TOKEN }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      // No marker → ready; the point is the fallback env satisfies "token set".
      assert.equal(fx.detail, 'figma extract: ready (token set)');
      assert.equal(fx.status, 'ok');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: malformed/garbage Free-tier marker → check does NOT throw, defaults to ready', async () => {
  const root = makeRoot();
  try {
    // Write non-JSON garbage where _meta.json is expected.
    writeFreeTierMarker(root, 'ABC123key', '{ this is not valid json ::: <<<');
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: undefined }, async () => {
      let result;
      await assert.doesNotReject(async () => {
        result = await getHealthChecks(root);
      }, 'getHealthChecks must not reject on a malformed marker');
      const fx = figmaCheck(result);
      // Malformed marker is ignored → safe default is ready (no false alarm).
      assert.equal(fx.detail, 'figma extract: ready (token set)');
      assert.equal(fx.status, 'ok');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: a non-403 variables skip marker is NOT treated as Free tier (ready)', async () => {
  const root = makeRoot();
  try {
    // Variables skipped for a transient/other reason — not a Free-tier 403 signal.
    const dir = path.join(root, '.figma-extract-cache', 'raw', 'OTHERkey');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, '_meta.json'),
      JSON.stringify({
        file_key: 'OTHERkey',
        totals: [
          { name: 'variables', bytes: 0, ms: 0, skipped: true, reason: 'Figma API 500' },
        ],
      })
    );
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: undefined }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      assert.equal(fx.detail, 'figma extract: ready (token set)');
      assert.equal(fx.status, 'ok');
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: the token VALUE never appears in the detail (D-10 non-leak)', async () => {
  const root = makeRoot();
  try {
    // Cover both ready and Free-tier branches — neither may echo the token.
    writeFreeTierMarker(root);
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: SENTINEL_TOKEN }, async () => {
      const fx = figmaCheck(await getHealthChecks(root));
      assert.ok(
        !fx.detail.includes(SENTINEL_TOKEN),
        'token value must NEVER appear in the figma_extract detail (D-10)'
      );
      assert.ok(
        !fx.detail.includes('figd_'),
        'no token-shaped substring should leak into the detail'
      );
    });
  } finally {
    rmRoot(root);
  }
});

test('31-09: getHealthChecks returns the checks in stable order through dashboard_reachable 10th (additive invariant)', async () => {
  const root = makeRoot();
  try {
    // Minimal complete project surface so the prior checks resolve normally.
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    fs.mkdirSync(path.join(root, '.design'), { recursive: true });
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# CLAUDE');
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'pkg', version: '1.0.0' })
    );
    await withTokenEnv({ token: SENTINEL_TOKEN, patToken: undefined }, async () => {
      const result = await getHealthChecks(root);
      const names = result.checks.map((c) => c.name);
      assert.deepEqual(names, [
        'claude_md',
        'planning_dir',
        'design_dir',
        'package_json',
        'issue_reporter',
        'figma_extract',
        'skill_discipline',
        'harness_freshness',
        'stack_addendums',
        'dashboard_reachable',
      ]);
      // Every check has a valid status enum.
      for (const c of result.checks) {
        assert.ok(['ok', 'warn', 'fail'].includes(c.status), 'invalid status: ' + c.status);
      }
    });
  } finally {
    rmRoot(root);
  }
});
