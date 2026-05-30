'use strict';
// test/suite/bin-shims.test.cjs
// ---------------------------------------------------------------------------
// Plan 31-5-05 (SDK-03 / SDK-04, D-08) — pins the two MCP-server bin
// trampolines added alongside the gdd-mcp move into sdk/mcp/gdd-mcp/.
//
// Both bin/gdd-state-mcp and bin/gdd-mcp clone the proven bin/gdd-sdk
// pattern: a CJS trampoline that spawns `node --experimental-strip-types`
// against the real TS server entry under sdk/mcp/*/server.ts and forwards
// argv + exit code. The raw `.ts` bin entries they replace could not run
// under npm's auto-generated Windows .cmd shim (no way to inject the
// --experimental-strip-types flag).
//
// These tests assert:
//   1. bin/gdd-state-mcp is a node trampoline targeting sdk/mcp/gdd-state/server.ts
//   2. bin/gdd-mcp       is a node trampoline targeting sdk/mcp/gdd-mcp/server.ts
//   3. package.json bin maps gdd-state-mcp + gdd-mcp to the bin/ trampolines (no raw .ts)
//   4. the unchanged bins (gdd-sdk, gdd-graph, gdd-events, get-design-done) are intact
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
 * Shared assertions for a trampoline file: node shebang, 'use strict',
 * spawns node --experimental-strip-types, resolves an entry path ending in
 * the expected sdk/mcp/<server>/server.ts, and that entry file exists.
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

  // Spawns node with the experimental-strip-types flag (the whole point).
  assert.match(
    src,
    /--experimental-strip-types/,
    'bin/' + binName + ' must spawn node --experimental-strip-types',
  );
  assert.match(
    src,
    /child_process/,
    'bin/' + binName + ' must use node:child_process spawn (trampoline shape)',
  );
  // Forwards argv and re-raises signals like bin/gdd-sdk.
  assert.match(
    src,
    /process\.argv\.slice\(2\)/,
    'bin/' + binName + ' must forward argv to the TS entry',
  );
  assert.match(
    src,
    /process\.kill\(process\.pid, signal\)/,
    'bin/' + binName + ' must re-raise the child signal (gdd-sdk pattern)',
  );

  // The resolved entry path must end in sdk/mcp/<server>/server.ts.
  const expectedEntry = path.resolve(
    BIN_DIR,
    '..',
    'sdk',
    'mcp',
    serverSegment,
    'server.ts',
  );
  const expectedTail = 'sdk/mcp/' + serverSegment + '/server.ts';
  assert.ok(
    fwd(expectedEntry).endsWith(expectedTail),
    'computed entry must end in ' + expectedTail,
  );
  // The trampoline source must name the entry segments (defends against a
  // copy-paste that points the wrong server at the wrong entry).
  const segRe = new RegExp("'mcp',\\s*'" + serverSegment + "',\\s*'server\\.ts'");
  assert.match(
    src,
    segRe,
    'bin/' + binName + " entry must resolve sdk/mcp/" + serverSegment + "/server.ts",
  );

  // The real TS entry file the trampoline launches must exist on disk.
  assert.ok(
    fs.existsSync(expectedEntry),
    'entry file must exist: ' + expectedTail,
  );
}

describe('31-5-05: MCP bin trampolines', () => {
  test('31-5-05: bin/gdd-state-mcp is a trampoline targeting sdk/mcp/gdd-state/server.ts', () => {
    assertTrampoline('gdd-state-mcp', 'gdd-state');
  });

  test('31-5-05: bin/gdd-mcp is a trampoline targeting sdk/mcp/gdd-mcp/server.ts', () => {
    assertTrampoline('gdd-mcp', 'gdd-mcp');
  });

  test('31-5-05: package.json bin maps gdd-state-mcp + gdd-mcp to the bin/ trampolines (no raw .ts)', () => {
    const bin = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin;
    assert.equal(
      bin['gdd-state-mcp'],
      './bin/gdd-state-mcp',
      'bin.gdd-state-mcp must point at the ./bin/gdd-state-mcp trampoline',
    );
    assert.equal(
      bin['gdd-mcp'],
      './bin/gdd-mcp',
      'bin.gdd-mcp must point at the ./bin/gdd-mcp trampoline',
    );
    // No bin value may be a raw .ts entry anymore (Windows-shim wart).
    for (const [name, value] of Object.entries(bin)) {
      assert.ok(
        !/\.ts$/.test(value),
        'no bin entry may be a raw .ts path: ' + name + ' = ' + value,
      );
    }
    // All three SDK bins resolve to ./bin/ trampolines.
    for (const sdkBin of ['gdd-sdk', 'gdd-state-mcp', 'gdd-mcp']) {
      assert.match(
        bin[sdkBin],
        /^\.\/bin\//,
        sdkBin + ' must be a ./bin/ trampoline, got ' + bin[sdkBin],
      );
    }
  });

  test('31-5-05: the unchanged bins are intact', () => {
    const bin = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin;
    assert.equal(bin['gdd-sdk'], './bin/gdd-sdk', 'gdd-sdk bin unchanged');
    assert.equal(bin['gdd-graph'], './bin/gdd-graph', 'gdd-graph bin unchanged');
    assert.equal(
      bin['gdd-events'],
      './scripts/cli/gdd-events.mjs',
      'gdd-events bin unchanged',
    );
    assert.equal(
      bin['get-design-done'],
      './scripts/install.cjs',
      'get-design-done bin unchanged',
    );
  });
});
