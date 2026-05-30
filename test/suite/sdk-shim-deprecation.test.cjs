'use strict';
// test/suite/sdk-shim-deprecation.test.cjs — Plan 31-5-06 (SDK-05, D-02).
//
// 31-5-06: prove the 10 deprecation-shim re-exports re-created at the OLD
// SDK paths (after 31-5-04/05 moved the real code into sdk/) behave
// correctly for undocumented EXTERNAL importers during the v1.31.5 → v1.32.0
// → v1.33.0 grace window:
//
//   (a) Re-export parity — importing the OLD path yields the SAME public
//       surface as importing the sdk/ counterpart. For the 4 primitive
//       .cjs the shim is `module.exports = require(sdk)` so the module IS
//       the same object reference (===). For the 4 TS index + 2 mcp
//       server.ts the shim is `export * from sdk` so the namespace export
//       keys match.
//   (b) Warning-fires-EXACTLY-ONCE — importing a shim emits one
//       'DeprecationWarning' whose message names the old path, the sdk/
//       path, and removal v1.33.0 (D-02, NOT the stale v1.29.0). Importing
//       the same shim a second time in the same process does NOT re-warn
//       (module-level `warned` guard + Node module cache).
//
// ISOLATION APPROACH for warning-count: a CJS module is cached on first
// require, so its module-load `emitWarning` fires once *per process*. To
// count emissions deterministically per case we run each warning assertion
// in an ISOLATED CHILD PROCESS (`execFileSync('node', ['-e', script])`).
// The child installs a `process.on('warning')` listener BEFORE requiring
// the shim, requires it (twice, to prove the once-guard), and prints one
// `GDD_WARN::<message>` line per captured DeprecationWarning to stdout. The
// parent counts those lines. TS shims run the same child with
// `--experimental-strip-types` so `require()` of a `.ts` entry resolves
// (same runtime flag `npm test` uses). Parity (non-count) assertions run
// in-process since they don't depend on emission count.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { REPO_ROOT } = require('./helpers.ts');

// ---------------------------------------------------------------------------
// The 10 shims: old path (relative to repo root) → sdk/ counterpart it
// re-exports. `kind` selects the parity strategy + child runtime flags.
// ---------------------------------------------------------------------------

const PRIMITIVE_SHIMS = [
  { old: 'scripts/lib/error-classifier.cjs', sdk: 'sdk/primitives/error-classifier.cjs' },
  { old: 'scripts/lib/iteration-budget.cjs', sdk: 'sdk/primitives/iteration-budget.cjs' },
  { old: 'scripts/lib/jittered-backoff.cjs', sdk: 'sdk/primitives/jittered-backoff.cjs' },
  { old: 'scripts/lib/lockfile.cjs', sdk: 'sdk/primitives/lockfile.cjs' },
];

const TS_INDEX_SHIMS = [
  { old: 'scripts/lib/cli/index.ts', sdk: 'sdk/cli/index.ts' },
  { old: 'scripts/lib/gdd-state/index.ts', sdk: 'sdk/state/index.ts' },
  { old: 'scripts/lib/event-stream/index.ts', sdk: 'sdk/event-stream/index.ts' },
  { old: 'scripts/lib/gdd-errors/index.ts', sdk: 'sdk/errors/index.ts' },
];

const MCP_SERVER_SHIMS = [
  { old: 'scripts/mcp-servers/gdd-state/server.ts', sdk: 'sdk/mcp/gdd-state/server.ts' },
  { old: 'scripts/mcp-servers/gdd-mcp/server.ts', sdk: 'sdk/mcp/gdd-mcp/server.ts' },
];

const abs = (rel) => path.join(REPO_ROOT, rel);

/**
 * Run `requireTarget` in a fresh child process, capturing every
 * DeprecationWarning it emits. The child requires the target `requireCount`
 * times to exercise the once-per-import guard. Returns the array of
 * captured warning messages (length === number of emissions).
 *
 * @param {string} relTarget repo-relative path to require
 * @param {boolean} stripTypes pass --experimental-strip-types (for .ts targets)
 * @param {number} requireCount how many times the child requires the target
 * @returns {string[]} captured DeprecationWarning messages
 */
function captureWarnings(relTarget, stripTypes, requireCount = 1) {
  const target = abs(relTarget);
  // Child script: install listener, then require N times WITH THE MODULE
  // CACHE INTACT (no cache clearing). The once-per-import guard is precisely
  // that requiring the SAME cached module repeatedly evaluates it only once,
  // so it warns only once. Printing a sentinel-prefixed line per warning lets
  // the parent count reliably even if Node prints its own
  // (Use `node --trace-deprecation`) hint to stderr.
  const child = [
    'process.on("warning",(w)=>{if(w.name==="DeprecationWarning"){process.stdout.write("GDD_WARN::"+w.message+"\\n");}});',
    `const t=${JSON.stringify(target)};`,
    `for(let i=0;i<${requireCount};i++){require(t);}`,
  ].join('');
  const args = stripTypes ? ['--experimental-strip-types', '-e', child] : ['-e', child];
  const out = execFileSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out
    .split('\n')
    .filter((l) => l.startsWith('GDD_WARN::'))
    .map((l) => l.slice('GDD_WARN::'.length));
}

// ---------------------------------------------------------------------------
// Tests 1–4: re-export parity for the TS index shims.
// The runner runs under --experimental-strip-types so require() of a .ts
// entry resolves. Each shim emits a warning on first require (fine here —
// the parity assertion does not depend on emission count).
// ---------------------------------------------------------------------------

for (const { old, sdk } of TS_INDEX_SHIMS) {
  test(`31-5-06: TS shim ${old} re-exports the same surface as ${sdk}`, () => {
    const shimMod = require(abs(old));
    const sdkMod = require(abs(sdk));
    const shimKeys = Object.keys(shimMod).sort();
    const sdkKeys = Object.keys(sdkMod).sort();
    assert.deepEqual(
      shimKeys,
      sdkKeys,
      `${old} export names must equal ${sdk}; shim=[${shimKeys}] sdk=[${sdkKeys}]`,
    );
    assert.ok(sdkKeys.length > 0, `${sdk} must export at least one value`);
  });
}

// ---------------------------------------------------------------------------
// Tests 5–8: re-export parity for the 4 primitive .cjs shims.
// The shim is `module.exports = require(sdk)`, so the shim's exports object
// IS the sdk module's exports object — strict === reference equality.
// ---------------------------------------------------------------------------

for (const { old, sdk } of PRIMITIVE_SHIMS) {
  test(`31-5-06: primitive shim ${old} re-exports (===) ${sdk}`, () => {
    const shimMod = require(abs(old));
    const sdkMod = require(abs(sdk));
    assert.equal(
      shimMod,
      sdkMod,
      `${old} must re-export the exact sdk module object (module.exports = require(sdk))`,
    );
    assert.deepEqual(
      Object.keys(shimMod).sort(),
      Object.keys(sdkMod).sort(),
      `${old} keys must match ${sdk}`,
    );
  });
}

// ---------------------------------------------------------------------------
// Test 9: warning-fires-exactly-once for a CJS primitive shim, with a
// SECOND require in the same child proving the guard holds.
// ---------------------------------------------------------------------------

test('31-5-06: primitive shim (lockfile.cjs) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/lib/lockfile.cjs', false, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

// ---------------------------------------------------------------------------
// Test 10: warning-fires-exactly-once for a TS index shim (event-stream),
// also required twice in a fresh child.
// ---------------------------------------------------------------------------

test('31-5-06: TS shim (event-stream/index.ts) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/lib/event-stream/index.ts', true, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

// ---------------------------------------------------------------------------
// Test 11: warning MESSAGE content (SC#5 + D-02). Must name the old path,
// an sdk/ path to switch to, and removal v1.33.0 — and must NOT contain the
// stale v1.29.0. Checked across one CJS + one TS shim.
// ---------------------------------------------------------------------------

test('31-5-06: warning message names old path + sdk/ path + v1.33.0 (CJS primitive), never v1.29.0', () => {
  const [msg] = captureWarnings('scripts/lib/lockfile.cjs', false, 1);
  assert.ok(msg, 'no DeprecationWarning captured for lockfile.cjs');
  assert.match(msg, /scripts\/lib\/lockfile/, `message must name old path: ${msg}`);
  assert.match(msg, /sdk\//, `message must name the sdk/ replacement path: ${msg}`);
  assert.match(msg, /v1\.33\.0/, `message must name removal v1.33.0 (D-02): ${msg}`);
  assert.doesNotMatch(msg, /v1\.29\.0/, `message must NOT carry the stale v1.29.0: ${msg}`);
});

test('31-5-06: warning message names old path + sdk/ path + v1.33.0 (TS index), never v1.29.0', () => {
  const [msg] = captureWarnings('scripts/lib/event-stream/index.ts', true, 1);
  assert.ok(msg, 'no DeprecationWarning captured for event-stream/index.ts');
  assert.match(msg, /scripts\/lib\/event-stream/, `message must name old path: ${msg}`);
  assert.match(msg, /sdk\//, `message must name the sdk/ replacement path: ${msg}`);
  assert.match(msg, /v1\.33\.0/, `message must name removal v1.33.0 (D-02): ${msg}`);
  assert.doesNotMatch(msg, /v1\.29\.0/, `message must NOT carry the stale v1.29.0: ${msg}`);
});

// ---------------------------------------------------------------------------
// Test 12–13: mcp server.ts shims. Re-export parity (importing the OLD path
// resolves the sdk/mcp/*/server.ts library surface — buildServer/runStdio)
// AND warning-fires-once. The server's isMain() entry guard keys off
// process.argv[1] ending with the sdk/ path, so a library-style require of
// the OLD shim path does NOT auto-start the server (argv[1] is `node -e`).
// ---------------------------------------------------------------------------

for (const { old, sdk } of MCP_SERVER_SHIMS) {
  test(`31-5-06: mcp shim ${old} re-exports the same surface as ${sdk}`, () => {
    const shimMod = require(abs(old));
    const sdkMod = require(abs(sdk));
    const shimKeys = Object.keys(shimMod).sort();
    const sdkKeys = Object.keys(sdkMod).sort();
    assert.deepEqual(
      shimKeys,
      sdkKeys,
      `${old} export names must equal ${sdk}; shim=[${shimKeys}] sdk=[${sdkKeys}]`,
    );
    assert.equal(
      typeof shimMod.buildServer,
      'function',
      `${old} must re-export buildServer from ${sdk}`,
    );
  });
}

test('31-5-06: mcp shim (gdd-state/server.ts) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/mcp-servers/gdd-state/server.ts', true, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

test('31-5-06: mcp shim (gdd-mcp/server.ts) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/mcp-servers/gdd-mcp/server.ts', true, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

// ---------------------------------------------------------------------------
// Second-shim once-guard coverage on the OTHER runtime kinds, so the guard
// is proven on more than a single representative file per kind.
// ---------------------------------------------------------------------------

test('31-5-06: primitive shim (error-classifier.cjs) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/lib/error-classifier.cjs', false, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

test('31-5-06: TS shim (cli/index.ts) fires exactly ONE DeprecationWarning even when required twice', () => {
  const msgs = captureWarnings('scripts/lib/cli/index.ts', true, 2);
  assert.equal(
    msgs.length,
    1,
    `expected exactly 1 DeprecationWarning across 2 requires, got ${msgs.length}: ${JSON.stringify(msgs)}`,
  );
});

// ---------------------------------------------------------------------------
// Aggregate guard: NO shim's first require emits zero warnings (silent
// swallow) — every one of the 10 emits at least one DeprecationWarning on
// first import. (Complements the exactly-once checks above.)
// ---------------------------------------------------------------------------

test('31-5-06: all 10 shims emit a DeprecationWarning on first import (none silently swallowed)', () => {
  const all = [
    ...PRIMITIVE_SHIMS.map((s) => ({ ...s, ts: false })),
    ...TS_INDEX_SHIMS.map((s) => ({ ...s, ts: true })),
    ...MCP_SERVER_SHIMS.map((s) => ({ ...s, ts: true })),
  ];
  const silent = [];
  for (const { old, ts } of all) {
    const msgs = captureWarnings(old, ts, 1);
    if (msgs.length < 1) silent.push(old);
  }
  assert.deepEqual(
    silent,
    [],
    `these shims emitted zero DeprecationWarning on first import: ${silent.join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// Test 16: GDD-DEPRECATION-SHIM marker present in every shim (31-5-10's
// no-stale-internal-refs guard excludes files containing this marker).
// ---------------------------------------------------------------------------

test('31-5-06: every shim file carries the GDD-DEPRECATION-SHIM marker comment', () => {
  const fs = require('node:fs');
  const all = [...PRIMITIVE_SHIMS, ...TS_INDEX_SHIMS, ...MCP_SERVER_SHIMS];
  const missing = [];
  for (const { old } of all) {
    const src = fs.readFileSync(abs(old), 'utf8');
    if (!src.includes('GDD-DEPRECATION-SHIM')) missing.push(old);
  }
  assert.deepEqual(
    missing,
    [],
    `shim files missing the GDD-DEPRECATION-SHIM marker: ${missing.join(', ')}`,
  );
});
