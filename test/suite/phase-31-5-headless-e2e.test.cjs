'use strict';
// test/suite/phase-31-5-headless-e2e.test.cjs — Plan 31-5-09 (TARBALL-02 / SC#9).
//
// The third regression net of Phase 31.5: the FUNCTIONAL install verifier.
// Unit tests verify modules in-repo and the tarball-golden test (31-5-08)
// diffs the packed file list, but neither proves the package actually WORKS
// when a user installs it. A bin trampoline can resolve an absolute path that
// exists in the repo yet was dropped from `package.json#files` — the golden
// diff would still pass while the installed package is broken. Only
// pack → install → run exercises the package exactly as a consumer gets it.
//
// THE LOOP (run ONCE, memoized, shared across every test):
//   1. `npm pack --silent` produces the REAL .tgz in a temp working dir.
//   2. `npm install <tgz> --no-save` into a fresh mkdtemp consumer dir — a
//      clean environment, NOT the repo's node_modules. This unpacks the
//      tarball to <temp>/node_modules/@hegemonart/get-design-done exactly as
//      `npm i @hegemonart/get-design-done` would.
//   3. installRoot = <temp>/node_modules/@hegemonart/get-design-done.
//
// WHY full `npm install` (not extract-only):
//   The package has runtime deps (ajv, @modelcontextprotocol/sdk). A bare
//   `tar -xzf` of the tarball would leave those unresolved and the MCP
//   handshake / gdd-sdk legs would fail on a missing-module error that has
//   nothing to do with the tarball's own contents. `npm install <tgz>` is
//   both faithful (it IS the user's install command) and resolves deps. We
//   pass --prefer-offline --no-audit --no-fund so it reuses the repo's
//   already-downloaded packages and stays inside CI's time budget. See
//   SUMMARY for the approach rationale.
//
// CROSS-PLATFORM GATES (inherited from the proven Plan-27.7 headless E2E):
//   • Windows: `npm pack` symlink handling can produce false-negative
//     tarballs (Phase 27.6/27.7 Blocker #2 lesson). The pack→install legs are
//     skipped on win32 with a documented reason; POSIX CI exercises the full
//     path, Windows CI passes via skipped (zero-failure) exit.
//   • CI: spawn-based MCP stdio handshakes are environment-sensitive (handshake
//     timeouts even at 30s in constrained runners). The two handshake legs are
//     gated on CI — the same protocol surface is covered in-process by
//     test/suite/gdd-mcp-server.test.cjs + test/suite/mcp-gdd-state.test.ts.
//     The OFFLINE legs (bins resolve, primitives import, runtime subtrees
//     present, gdd-sdk --help / gdd-graph status exit 0) run on CI — no live
//     API key required for any assertion here.
//
// Test-level tagging: every test name prefixed `31-5-09:`. A final cleanup
// test runs unconditionally (safe even when prior legs skipped) and a
// process-exit hook is the belt-and-suspenders so we never litter the user's
// tmp dir with a multi-hundred-MB install tree.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// Serialize this pack against the other pack-invoking test files (which run in
// parallel child processes under `node --test`) so a concurrent pack's
// `postpack --clean` can't strip sdk/cli/index.js out of THIS tarball mid-stream.
// See test/helpers/sdk-pack-lock.cjs for the full race writeup.
const { withPackLock } = require('../helpers/sdk-pack-lock.cjs');

const IS_WINDOWS = process.platform === 'win32';
const IS_CI = !!process.env.CI;
const SKIP_REASON_WIN =
  'skipped on Windows: npm pack symlink handling may produce false-negative tarballs (Phase 27.7 Blocker #2 acceptance)';
const SKIP_REASON_CI =
  'skipped on CI: spawn-based MCP stdio handshake is environment-sensitive; protocol surface covered in-process by test/suite/gdd-mcp-server.test.cjs + test/suite/mcp-gdd-state.test.ts';

// Repo root: this file lives at test/suite/, repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PKG_NAME = '@hegemonart/get-design-done';

// realpath the tmp dir — macOS os.tmpdir() returns /var which is a symlink to
// /private/var; path comparisons / module resolution false-fail otherwise
// (Phase 27.6 lesson).
function tmp(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-')));
}

// ---------------------------------------------------------------------------
// Memoized pack→install. Runs at most ONCE for the whole file regardless of
// how many tests call it; the heavy leg (30-90s) must not repeat per-test.
// Returns { skip, reason } when the platform gate is closed so callers can
// short-circuit to a passing/skipped test.
// ---------------------------------------------------------------------------
const state = {
  done: false,
  skip: false,
  reason: '',
  workDir: null, // holds the .tgz
  installDir: null, // the consumer dir
  installRoot: null, // <installDir>/node_modules/<PKG_NAME>
  tarball: null,
};

function ensureInstall() {
  if (state.done) return state;
  state.done = true;

  if (IS_WINDOWS) {
    state.skip = true;
    state.reason = SKIP_REASON_WIN;
    return state;
  }

  // 1. Pack the real tarball into a dedicated temp working dir so we never
  //    leave a .tgz in the repo root (which would dirty git status + risk a
  //    stray `git add`). `npm pack --pack-destination <dir>` lands it there.
  state.workDir = tmp('gdd-31-5-09-pack');
  const packed = withPackLock(() =>
    spawnSync(
      'npm',
      ['pack', '--silent', '--pack-destination', state.workDir],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    ),
  );
  assert.equal(
    packed.status,
    0,
    'npm pack failed:\n' + (packed.stderr || '') + (packed.stdout || ''),
  );
  // npm pack prints the tarball filename on stdout (last non-empty line).
  const lines = (packed.stdout || '').trim().split('\n').filter(Boolean);
  const tarballName = lines.length ? lines[lines.length - 1].trim() : '';
  let tarball = path.join(state.workDir, tarballName);
  if (!tarballName || !fs.existsSync(tarball)) {
    // Fallback: --silent output can be suppressed in some npm versions; locate
    // the single .tgz the pack-destination now contains.
    const tgz = fs
      .readdirSync(state.workDir)
      .filter((f) => f.endsWith('.tgz'));
    assert.equal(
      tgz.length,
      1,
      'expected exactly one .tgz in pack dir, found: ' + JSON.stringify(tgz),
    );
    tarball = path.join(state.workDir, tgz[0]);
  }
  state.tarball = tarball;

  // 2. Install the tarball into a fresh consumer dir (NOT the repo).
  state.installDir = tmp('gdd-31-5-09-install');
  // Minimal scaffold so `npm install --no-save` does not walk up to a parent
  // project and so npm treats this dir as the install target.
  fs.writeFileSync(
    path.join(state.installDir, 'package.json'),
    JSON.stringify({ name: 'gdd-e2e-consumer', version: '0.0.0', private: true }),
  );
  const installed = spawnSync(
    'npm',
    [
      'install',
      tarball,
      '--no-save',
      '--no-audit',
      '--no-fund',
      '--prefer-offline',
      '--silent',
    ],
    { cwd: state.installDir, encoding: 'utf8' },
  );
  assert.equal(
    installed.status,
    0,
    'npm install <tarball> failed:\n' +
      (installed.stderr || '') +
      (installed.stdout || ''),
  );

  // 3. Resolve install root the way a consumer's resolver would.
  state.installRoot = path.join(
    state.installDir,
    'node_modules',
    '@hegemonart',
    'get-design-done',
  );
  assert.ok(
    fs.existsSync(state.installRoot),
    'install root missing: ' + state.installRoot,
  );
  return state;
}

function cleanup() {
  for (const dir of [state.installDir, state.workDir]) {
    if (dir && fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort — never throw out of cleanup */
      }
    }
  }
  state.installDir = null;
  state.workDir = null;
}

// Belt-and-suspenders: if the process exits abnormally (a hung leg killed,
// an assertion crash) the unconditional cleanup test below may not run.
// Scrub on exit too so we never strand a multi-hundred-MB install tree.
process.on('exit', cleanup);

// ---------------------------------------------------------------------------

describe('31-5-09: headless E2E install verification (pack → install → run)', () => {
  // One install for the whole suite. `before` failures surface as the suite
  // failing (correct — a broken pack/install IS the regression we guard).
  before(
    () => {
      ensureInstall();
    },
    // Headroom for the pack-serialization lock: worst-case the pack waits behind
    // the other pack tests before its own pack + install runs.
    { timeout: 300000 },
  );

  after(() => {
    cleanup();
  });

  // -- Test 1: all 8 bins resolve from the installed tarball ----------------
  // Read package.json#bin FROM THE INSTALL (not the repo) and assert every
  // mapped path exists under installRoot. This is the core "tarball ships
  // what bin advertises" assertion — offline, runs on CI. (Phase 41 added
  // gdd-detect — the deterministic anti-pattern CLI — as the 7th bin; Phase 55
  // added gdd-dashboard — the read-only control-plane TUI — as the 8th.)
  test(
    '31-5-09: all 8 bins resolve from the installed tarball',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return; // platform gate
      const pkg = JSON.parse(
        fs.readFileSync(path.join(st.installRoot, 'package.json'), 'utf8'),
      );
      const EXPECTED_BINS = [
        'gdd-dashboard',
        'gdd-detect',
        'gdd-events',
        'gdd-graph',
        'gdd-mcp',
        'gdd-sdk',
        'gdd-state-mcp',
        'get-design-done',
      ];
      for (const name of EXPECTED_BINS) {
        assert.ok(
          pkg.bin && typeof pkg.bin[name] === 'string',
          'installed package.json#bin missing entry: ' + name,
        );
        const mapped = path.join(st.installRoot, pkg.bin[name]);
        assert.ok(
          fs.existsSync(mapped),
          `bin '${name}' maps to ${pkg.bin[name]} which is absent from the install: ${mapped}`,
        );
      }
      // Sanity: exactly the 8 documented bins, no more no less.
      assert.deepEqual(
        Object.keys(pkg.bin).sort(),
        EXPECTED_BINS.slice().sort(),
        'installed package advertises an unexpected bin set',
      );
    },
  );

  // -- Test 2: gdd-sdk --help exits 0 from the install ----------------------
  // Invoke via `node <installRoot>/bin/gdd-sdk` (process.execPath) rather than
  // the .bin/.cmd shim — avoids Windows .cmd spawn quirks and is exactly what
  // the npm shim does internally (the bin is a CJS trampoline).
  test(
    '31-5-09: gdd-sdk --help exits 0 from the install',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const bin = path.join(st.installRoot, 'bin', 'gdd-sdk');
      const r = spawnSync(process.execPath, [bin, '--help'], {
        cwd: st.installRoot,
        encoding: 'utf8',
        timeout: 60000,
      });
      assert.equal(
        r.status,
        0,
        'gdd-sdk --help exit ' +
          r.status +
          '\nstdout:\n' +
          (r.stdout || '') +
          '\nstderr:\n' +
          (r.stderr || ''),
      );
    },
  );

  // -- Test 3: gdd-graph status exits 0 from the install --------------------
  // Proves D-09/D-14: gdd-graph dynamic-imports scripts/lib/graph/index.mjs at
  // runtime, so a successful `status` means that subtree shipped AND resolves.
  test(
    '31-5-09: gdd-graph status exits 0 from the install (D-09/D-14 runtime subtree)',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const bin = path.join(st.installRoot, 'bin', 'gdd-graph');
      const r = spawnSync(process.execPath, [bin, 'status'], {
        cwd: st.installRoot,
        encoding: 'utf8',
        timeout: 60000,
      });
      assert.equal(
        r.status,
        0,
        'gdd-graph status exit ' +
          r.status +
          '\nstdout:\n' +
          (r.stdout || '') +
          '\nstderr:\n' +
          (r.stderr || ''),
      );
    },
  );

  // -- Test 4: gdd-events --help exits 0 from the install -------------------
  // gdd-events.mjs uses a `#!/usr/bin/env -S node --experimental-strip-types`
  // shebang. We invoke with the explicit flag (the npm .cmd shim cannot pass
  // it on Windows, but we're gated off win32 here anyway) so it runs the same
  // on POSIX CI.
  test(
    '31-5-09: gdd-events --help exits 0 from the install',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const bin = path.join(st.installRoot, 'scripts', 'cli', 'gdd-events.mjs');
      assert.ok(fs.existsSync(bin), 'gdd-events.mjs absent from install: ' + bin);
      const r = spawnSync(
        process.execPath,
        ['--experimental-strip-types', bin, '--help'],
        { cwd: st.installRoot, encoding: 'utf8', timeout: 60000 },
      );
      assert.equal(
        r.status,
        0,
        'gdd-events --help exit ' +
          r.status +
          '\nstdout:\n' +
          (r.stdout || '') +
          '\nstderr:\n' +
          (r.stderr || ''),
      );
    },
  );

  // -- Test 5: get-design-done installer bin resolves (existence + shebang) -
  // We deliberately DO NOT run the real installer (it would mutate the host
  // machine's runtime config dirs). Existence + a node shebang is the safe
  // assertion that the install entrypoint shipped and is launchable.
  test(
    '31-5-09: get-design-done install bin resolves with a node shebang (no real install run)',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const bin = path.join(st.installRoot, 'scripts', 'install.cjs');
      assert.ok(fs.existsSync(bin), 'install.cjs absent from install: ' + bin);
      const firstLine = fs
        .readFileSync(bin, 'utf8')
        .split('\n', 1)[0]
        .trim();
      assert.match(
        firstLine,
        /^#!.*node/,
        'install.cjs first line must be a node shebang, got: ' + firstLine,
      );
    },
  );

  // -- Test 6: gdd-state-mcp completes an MCP handshake from the install ----
  // Spawn the installed bin trampoline (→ sdk/mcp/gdd-state/server.ts), send a
  // JSON-RPC initialize over stdio, assert a serverInfo.name response, tear
  // down. Bounded by a timeout so a hung server fails fast. CI-gated (see
  // header) — in-process coverage lives in mcp-gdd-state.test.ts.
  test(
    '31-5-09: gdd-state-mcp completes an MCP handshake from the install',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : IS_CI ? SKIP_REASON_CI : false },
    async () => {
      const st = ensureInstall();
      if (st.skip) return;
      const info = await mcpHandshake(
        path.join(st.installRoot, 'bin', 'gdd-state-mcp'),
        st.installRoot,
      );
      assert.equal(
        info.name,
        'gdd-state',
        'gdd-state-mcp serverInfo.name must be "gdd-state", got: ' +
          JSON.stringify(info),
      );
      assert.equal(typeof info.version, 'string', 'serverInfo.version present');
    },
  );

  // -- Test 7: gdd-mcp completes an MCP handshake from the install ----------
  // Same pattern for gdd-mcp (→ sdk/mcp/gdd-mcp/server.ts). gdd-mcp reads its
  // version from package.json#version, so serverInfo.name is the stable
  // assertion (version is checked exhaustively by the 27.7 in-process test).
  test(
    '31-5-09: gdd-mcp completes an MCP handshake from the install',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : IS_CI ? SKIP_REASON_CI : false },
    async () => {
      const st = ensureInstall();
      if (st.skip) return;
      const info = await mcpHandshake(
        path.join(st.installRoot, 'bin', 'gdd-mcp'),
        st.installRoot,
      );
      assert.equal(
        info.name,
        'gdd-mcp',
        'gdd-mcp serverInfo.name must be "gdd-mcp", got: ' +
          JSON.stringify(info),
      );
      assert.equal(typeof info.version, 'string', 'serverInfo.version present');
    },
  );

  // -- Test 8: sdk/primitives/* + barrel/cli resolve in the install ---------
  // require() the 4 typed primitives from installRoot and assert their
  // documented export surface (the README import-path table, 31-5-04, must
  // hold in the tarball). Also assert sdk/index.ts + sdk/cli/index.ts ship.
  test(
    '31-5-09: sdk/primitives/* import-resolve + sdk barrel/cli ship in the install',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const primDir = path.join(st.installRoot, 'sdk', 'primitives');
      // Expected export surface per primitive (the public helpers the README
      // documents). A require that resolves but is missing exports would mean
      // a truncated/wrong file shipped.
      const EXPECTED = {
        'lockfile.cjs': ['acquire', 'renameWithRetry'],
        'error-classifier.cjs': ['classify', 'RETRYABLE', 'SUGGESTED_ACTIONS'],
        'iteration-budget.cjs': ['consume', 'refund', 'remaining', 'reset'],
        'jittered-backoff.cjs': ['delayMs', 'sleep', 'DEFAULTS'],
      };
      for (const [file, exportsList] of Object.entries(EXPECTED)) {
        const abs = path.join(primDir, file);
        assert.ok(fs.existsSync(abs), 'primitive absent from install: ' + abs);
        // require from the installed copy — proves it import-resolves as a
        // consumer would, not just exists on disk.
        const mod = require(abs);
        for (const exp of exportsList) {
          assert.ok(
            exp in mod,
            `primitive ${file} missing export '${exp}' in the install (exports: ${Object.keys(mod).join(',')})`,
          );
        }
        // .d.cts type sidecar must ship alongside (D-05).
        assert.ok(
          fs.existsSync(abs.replace(/\.cjs$/, '.d.cts')),
          'primitive type sidecar absent: ' + file.replace(/\.cjs$/, '.d.cts'),
        );
      }
      // The barrel + CLI entry (D-04) must ship.
      assert.ok(
        fs.existsSync(path.join(st.installRoot, 'sdk', 'index.ts')),
        'sdk/index.ts barrel absent from install',
      );
      assert.ok(
        fs.existsSync(path.join(st.installRoot, 'sdk', 'cli', 'index.ts')),
        'sdk/cli/index.ts absent from install',
      );
    },
  );

  // -- Test 9: runtime subtrees present in the install (D-09/D-14/D-15) -----
  // The figma-extract SKILL runs `node scripts/lib/figma-extract/*.cjs` and
  // gdd-graph runs scripts/lib/graph/index.mjs — both at RUNTIME from the
  // installed package. If `package.json#files` dropped these subtrees the
  // package would be silently broken for those features. Assert a real file
  // under each ships.
  test(
    '31-5-09: runtime subtrees scripts/lib/graph + scripts/lib/figma-extract ship (D-09/D-14/D-15)',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const st = ensureInstall();
      if (st.skip) return;
      const graphIndex = path.join(
        st.installRoot,
        'scripts',
        'lib',
        'graph',
        'index.mjs',
      );
      assert.ok(
        fs.existsSync(graphIndex),
        'scripts/lib/graph/index.mjs absent from install (gdd-graph broken): ' +
          graphIndex,
      );
      const figmaPull = path.join(
        st.installRoot,
        'scripts',
        'lib',
        'figma-extract',
        'pull.cjs',
      );
      assert.ok(
        fs.existsSync(figmaPull),
        'scripts/lib/figma-extract/pull.cjs absent from install (figma-extract SKILL broken): ' +
          figmaPull,
      );
      // The figma-extract dir must contain its full .cjs surface, not a stub —
      // assert several known runtime modules ship.
      for (const f of ['digest.cjs', 'receiver.cjs', 'walk.cjs', 'render-md.cjs']) {
        assert.ok(
          fs.existsSync(
            path.join(st.installRoot, 'scripts', 'lib', 'figma-extract', f),
          ),
          'figma-extract runtime module absent from install: ' + f,
        );
      }
    },
  );

  // -- Cleanup: unconditional, safe even when prior legs skipped ------------
  test('31-5-09: cleanup temp install + tarball dirs', () => {
    cleanup();
    assert.ok(true);
  });
});

// ---------------------------------------------------------------------------
// MCP handshake helper — spawn the bin, send a JSON-RPC `initialize` over
// stdio, resolve with serverInfo, tear down. Bounded by a timeout so a hung
// server fails the test fast instead of hanging CI. Mirrors the proven
// handshake in test/suite/gdd-mcp-headless-e2e.test.cjs (Plan 27.7).
// ---------------------------------------------------------------------------
function mcpHandshake(binPath, cwd, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    // Invoke via `node <bin>` (process.execPath) — the bin is a CJS
    // trampoline that re-spawns node with --experimental-strip-types. This
    // sidesteps Windows .cmd-shim quirks (we're gated off win32 anyway) and is
    // exactly what npm's shim does internally.
    const proc = spawn(process.execPath, [binPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let settled = false;
    let buf = '';
    let stderr = '';

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      reject(
        new Error(
          `MCP handshake timeout (${timeoutMs}ms) for ${binPath}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };

    const req =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'gdd-31-5-09-e2e', version: '0.0.0' },
        },
      }) + '\n';

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      // Scan newline-delimited frames for the initialize response (id===1).
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const frame = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!frame.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(frame);
        } catch {
          continue; // partial / non-JSON line — keep scanning
        }
        if (parsed && parsed.id === 1) {
          if (parsed.error) {
            return finish(
              new Error(
                'MCP initialize returned an error: ' +
                  JSON.stringify(parsed.error),
              ),
            );
          }
          const info = (parsed.result && parsed.result.serverInfo) || null;
          if (!info) {
            return finish(
              new Error(
                'MCP initialize response missing result.serverInfo: ' +
                  JSON.stringify(parsed),
              ),
            );
          }
          return finish(null, info);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => finish(err));
    proc.on('exit', (code) => {
      // If the server exits before we read a frame, surface a clear failure
      // rather than hanging until the timeout.
      if (!settled) {
        finish(
          new Error(
            `MCP server exited (code ${code}) before responding\nstderr:\n${stderr}`,
          ),
        );
      }
    });

    proc.stdin.write(req);
  });
}
