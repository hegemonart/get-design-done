'use strict';
// test/suite/bin-shims.test.cjs
// ---------------------------------------------------------------------------
// Plan 31-5-05 (SDK-03 / SDK-04, D-08) — pins the two MCP-server bin
// trampolines added alongside the hone-mcp move into sdk/mcp/hone-mcp/.
//
// Both bin/hone-state-mcp and bin/hone-mcp clone the proven bin/hone-sdk
// pattern: a CJS trampoline that re-launches the real TS server entry under
// sdk/mcp/*/server.ts and forwards argv + exit code. The raw `.ts` bin entries
// they replace could not run under npm's auto-generated Windows .cmd shim (no
// way to inject the --experimental-strip-types flag).
//
// DUAL-MODE (Plan 31-5-9.5, D-16): from a fresh npm install the .ts entries
// live under node_modules, where Node refuses --experimental-strip-types
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). Each trampoline now PREFERS
// the esbuild-compiled sibling `.js` (spawn `node <js>`, no flag) when it
// exists, and falls back to `node --experimental-strip-types <ts>` only for the
// in-repo dev tree. So the strip-types flag is now CONDITIONAL (the fallback
// branch), not unconditional.
//
// These tests assert:
//   1. bin/hone-state-mcp is a dual-mode trampoline targeting sdk/mcp/hone-state/server.{js,ts}
//   2. bin/hone-mcp       is a dual-mode trampoline targeting sdk/mcp/hone-mcp/server.{js,ts}
//   3. package.json bin maps hone-state-mcp + hone-mcp to the bin/ trampolines (no raw .ts)
//   4. the unchanged bins (hone-sdk, hone-graph, hone-events, hone) are intact
//
// All tests carry the `31-5-05:` tag.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BIN_DIR = path.join(REPO_ROOT, 'bin');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

/** Normalize a path to forward slashes so endsWith checks are OS-agnostic. */
function fwd(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Shared assertions for a DUAL-MODE trampoline file (Plan 31-5-9.5, D-16):
 * node shebang, 'use strict', node:child_process spawn, argv-forward +
 * signal re-raise, an fs.existsSync guard that PREFERS the compiled
 * sdk/mcp/<server>/server.js and FALLS BACK to the .ts entry with
 * --experimental-strip-types, and that the .ts source entry exists on disk.
 */
function assertTrampoline(binName, serverSegment) {
  const binPath = path.join(BIN_DIR, binName);
  assert.ok(fs.existsSync(binPath), 'bin/' + binName + ' must exist');
  const src = fs.readFileSync(binPath, 'utf8');

  // Node shebang (the trampoline is plain CJS launched by `node <bin>`).
  assert.match(
    src.split(/\r?\n/)[0],
    /^#!\/usr\/bin\/env node$/,
    'bin/' + binName + ' must start with `#!/usr/bin/env node`',
  );
  assert.match(src, /'use strict'/, 'bin/' + binName + " must be 'use strict'");

  assert.match(
    src,
    /child_process/,
    'bin/' + binName + ' must use node:child_process spawn (trampoline shape)',
  );
  // Forwards argv and re-raises signals like bin/hone-sdk.
  assert.match(
    src,
    /process\.argv\.slice\(2\)/,
    'bin/' + binName + ' must forward argv to the entry',
  );
  assert.match(
    src,
    /process\.kill\(process\.pid, signal\)/,
    'bin/' + binName + ' must re-raise the child signal (hone-sdk pattern)',
  );

  // DUAL-MODE: must probe the compiled sibling first (fs.existsSync) and only
  // fall back to --experimental-strip-types for the raw .ts dev path. The
  // strip-types flag is now CONDITIONAL, so we assert BOTH halves explicitly.
  assert.match(
    src,
    /existsSync/,
    'bin/' + binName + ' must fs.existsSync-probe the compiled sibling (dual-mode)',
  );
  assert.match(
    src,
    /--experimental-strip-types/,
    'bin/' + binName + ' must keep the --experimental-strip-types fallback (dev .ts path)',
  );

  // The compiled-preferred entry resolves to sdk/mcp/<server>/server.js and the
  // dev-fallback to sdk/mcp/<server>/server.ts. Both tails must be computable.
  const compiledEntry = path.resolve(
    BIN_DIR, '..', 'sdk', 'mcp', serverSegment, 'server.js',
  );
  const sourceEntry = path.resolve(
    BIN_DIR, '..', 'sdk', 'mcp', serverSegment, 'server.ts',
  );
  assert.ok(
    fwd(compiledEntry).endsWith('sdk/mcp/' + serverSegment + '/server.js'),
    'computed compiled entry must end in sdk/mcp/' + serverSegment + '/server.js',
  );
  assert.ok(
    fwd(sourceEntry).endsWith('sdk/mcp/' + serverSegment + '/server.ts'),
    'computed source entry must end in sdk/mcp/' + serverSegment + '/server.ts',
  );
  // The trampoline source must name the entry segments for BOTH the .js and .ts
  // resolution (defends against a copy-paste that points the wrong server at
  // the wrong entry).
  const segReJs = new RegExp("'mcp',\\s*'" + serverSegment + "',\\s*'server\\.js'");
  const segReTs = new RegExp("'mcp',\\s*'" + serverSegment + "',\\s*'server\\.ts'");
  assert.match(
    src, segReJs,
    'bin/' + binName + " must resolve compiled sdk/mcp/" + serverSegment + "/server.js",
  );
  assert.match(
    src, segReTs,
    'bin/' + binName + " must resolve source sdk/mcp/" + serverSegment + "/server.ts",
  );

  // The real .ts source entry the trampoline falls back to must exist on disk
  // (the .js is a gitignored build artifact, so we do NOT assert its presence).
  assert.ok(
    fs.existsSync(sourceEntry),
    'source entry file must exist: sdk/mcp/' + serverSegment + '/server.ts',
  );
}

describe('31-5-05: MCP bin trampolines', () => {
  test('31-5-05: bin/hone-state-mcp is a dual-mode trampoline targeting sdk/mcp/hone-state/server.{js,ts}', () => {
    assertTrampoline('hone-state-mcp', 'hone-state');
  });

  test('31-5-05: bin/hone-mcp is a dual-mode trampoline targeting sdk/mcp/hone-mcp/server.{js,ts}', () => {
    assertTrampoline('hone-mcp', 'hone-mcp');
  });

  test('31-5-05: package.json bin maps hone-state-mcp + hone-mcp to the bin/ trampolines (no raw .ts)', () => {
    const bin = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin;
    assert.equal(
      bin['hone-state-mcp'],
      './bin/hone-state-mcp',
      'bin.hone-state-mcp must point at the ./bin/hone-state-mcp trampoline',
    );
    assert.equal(
      bin['hone-mcp'],
      './bin/hone-mcp',
      'bin.hone-mcp must point at the ./bin/hone-mcp trampoline',
    );
    // No bin value may be a raw .ts entry anymore (Windows-shim wart).
    for (const [name, value] of Object.entries(bin)) {
      assert.ok(
        !/\.ts$/.test(value),
        'no bin entry may be a raw .ts path: ' + name + ' = ' + value,
      );
    }
    // All three SDK bins resolve to ./bin/ trampolines.
    for (const sdkBin of ['hone-sdk', 'hone-state-mcp', 'hone-mcp']) {
      assert.match(
        bin[sdkBin],
        /^\.\/bin\//,
        sdkBin + ' must be a ./bin/ trampoline, got ' + bin[sdkBin],
      );
    }
  });

  test('31-5-05: the unchanged bins are intact', () => {
    const bin = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin;
    assert.equal(bin['hone-sdk'], './bin/hone-sdk', 'hone-sdk bin unchanged');
    assert.equal(bin['hone-graph'], './bin/hone-graph', 'hone-graph bin unchanged');
    assert.equal(
      bin['hone-events'],
      './scripts/cli/hone-events.mjs',
      'hone-events bin unchanged',
    );
    assert.equal(
      bin['hone'],
      './scripts/install.cjs',
      'hone bin unchanged',
    );
  });
});
