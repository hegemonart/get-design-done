// tests/gdd-mcp-headless-e2e.test.cjs — Phase 27.7 headless end-to-end
// regression (ROADMAP SC #11; Blocker #2 acceptance).
//
// Steps the canonical Phase 31.5 headless pattern:
//   1. `npm pack --silent` produces a `.tgz` tarball in CWD.
//   2. Install that tarball into a tmpdir (mkdtempSync + `npm install <tarball>
//      --no-save --silent`).
//   3. Spawn `gdd-mcp` via the installed bin in the tmpdir.
//   4. Send an MCP `initialize` JSON-RPC request over stdio.
//   5. Read the response off stdout; assert handshake serverInfo.name +
//      serverInfo.version match the canonical fixture (version is read
//      dynamically from package.json#version — version-agnostic).
//   6. Send `notifications/initialized` then `tools/list`; assert the
//      response advertises 12 tools.
//   7. Cleanup tarball + tmpdir.
//
// Windows skip path (Blocker #2 acceptance):
//   `npm pack` symlink handling on Windows can produce false-negative
//   tarballs (the symlink discipline lesson from Phase 27.6). All 5 E2E
//   tests are gated `{ skip: process.platform === 'win32' }` with a
//   documented reason. POSIX CI runs all tests; Windows CI passes via
//   skipped (zero-failure) exit.
//
// Test-level tagging: all 5 tests tagged '27.7-07:' per closeout
// discipline. A 6th cleanup test runs unconditionally to scrub tarball
// + tmpdir at the end (no skip — cleanup is always safe to attempt).

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const IS_WINDOWS = process.platform === 'win32';
const SKIP_REASON_WIN = 'skipped on Windows: npm pack symlink handling may produce false-negatives (Blocker #2 acceptance)';

function tmp(prefix) {
  // realpath needed because macOS /var → /private/var symlink (Phase 27.6 lesson)
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-')));
}

describe('27.7-07: gdd-mcp headless E2E (ROADMAP SC #11; Blocker #2)', () => {
  // Module-scoped state passes the tarball + installDir between sequential
  // tests. node:test in CommonJS runs tests in source order by default.
  let tarball = null;
  let installDir = null;

  test(
    '27.7-07: headless E2E — npm pack produces tarball',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      const result = spawnSync('npm', ['pack', '--silent'], { encoding: 'utf8' });
      assert.equal(result.status, 0, 'npm pack failed: ' + (result.stderr || ''));
      const out = (result.stdout || '').trim().split('\n');
      const tarballName = out[out.length - 1];
      assert.ok(
        tarballName && tarballName.endsWith('.tgz'),
        'expected .tgz, got: ' + tarballName,
      );
      tarball = path.resolve(tarballName);
      assert.ok(fs.existsSync(tarball), 'tarball missing on disk: ' + tarball);
    },
  );

  test(
    '27.7-07: headless E2E — tarball installs into tmpdir',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      if (!tarball) {
        assert.fail('previous test did not produce tarball');
      }
      installDir = tmp('gdd-e2e-install');
      // Minimal package.json scaffold so npm install --no-save does not
      // walk up looking for a parent project.
      fs.writeFileSync(
        path.join(installDir, 'package.json'),
        JSON.stringify({ name: 'e2e-test', version: '0.0.0', private: true }),
      );
      const result = spawnSync('npm', ['install', tarball, '--no-save', '--silent'], {
        cwd: installDir,
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, 'npm install failed: ' + (result.stderr || ''));
    },
  );

  test(
    '27.7-07: headless E2E — installed gdd-mcp bin exists',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    () => {
      if (!installDir) {
        assert.fail('previous test did not produce installDir');
      }
      const binPath = path.join(installDir, 'node_modules', '.bin', 'gdd-mcp');
      // On Windows npm installs both a unix-shim (no extension) AND a .cmd
      // wrapper. Either is sufficient evidence the bin is wired.
      assert.ok(
        fs.existsSync(binPath) || fs.existsSync(binPath + '.cmd'),
        'gdd-mcp bin not installed: ' + binPath,
      );
    },
  );

  test(
    '27.7-07: headless E2E — MCP initialize handshake',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    async () => {
      if (!installDir) {
        assert.fail('no installDir from prior test');
      }
      // Version-agnostic — read from the package.json that was just packed.
      const expectedVersion = require('../package.json').version;
      const binPath = path.join(installDir, 'node_modules', '.bin', 'gdd-mcp');
      const proc = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      const handshakeReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '0.0.0' },
        },
      }) + '\n';
      proc.stdin.write(handshakeReq);
      const response = await new Promise((resolve, reject) => {
        let buf = '';
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error('handshake timeout (5s)'));
        }, 5000);
        proc.stdout.on('data', (chunk) => {
          buf += chunk.toString();
          // Find the first newline-delimited JSON-RPC frame.
          const newlineIdx = buf.indexOf('\n');
          if (newlineIdx >= 0) {
            const firstFrame = buf.slice(0, newlineIdx);
            try {
              const parsed = JSON.parse(firstFrame);
              clearTimeout(timeout);
              resolve(parsed);
            } catch {
              /* keep accumulating in case stream chunked mid-frame */
            }
          }
        });
        proc.on('error', reject);
      });
      proc.kill();
      assert.equal(response.jsonrpc, '2.0');
      assert.ok(
        response.result,
        'handshake response missing result: ' + JSON.stringify(response),
      );
      const info = response.result.serverInfo || {};
      assert.equal(info.name, 'gdd-mcp', 'serverInfo.name must be gdd-mcp');
      assert.equal(
        info.version,
        expectedVersion,
        'serverInfo.version must equal package.json#version (' + expectedVersion + ')',
      );
    },
  );

  test(
    '27.7-07: headless E2E — tools/list returns 12 tools',
    { skip: IS_WINDOWS ? SKIP_REASON_WIN : false },
    async () => {
      if (!installDir) {
        assert.fail('no installDir from prior test');
      }
      const binPath = path.join(installDir, 'node_modules', '.bin', 'gdd-mcp');
      const proc = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      const initReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'e2e', version: '0.0.0' },
        },
      }) + '\n';
      const initNotice = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }) + '\n';
      const toolsReq = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }) + '\n';
      proc.stdin.write(initReq + initNotice + toolsReq);
      const response = await new Promise((resolve, reject) => {
        let buf = '';
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error('tools/list timeout (5s)'));
        }, 5000);
        proc.stdout.on('data', (chunk) => {
          buf += chunk.toString();
          const lines = buf.split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.id === 2 && parsed.result) {
                clearTimeout(timeout);
                return resolve(parsed);
              }
            } catch {
              /* keep accumulating */
            }
          }
        });
        proc.on('error', reject);
      });
      proc.kill();
      assert.ok(
        Array.isArray(response.result && response.result.tools),
        'expected tools array in result',
      );
      assert.equal(
        response.result.tools.length,
        12,
        'expected 12 tools, got ' + response.result.tools.length,
      );
    },
  );

  // Cleanup test runs unconditionally — it is safe to attempt cleanup even
  // when previous tests were skipped (no tarball / installDir to clean).
  test('27.7-07: cleanup tarball + installDir', () => {
    if (tarball && fs.existsSync(tarball)) {
      try {
        fs.unlinkSync(tarball);
      } catch (_e) {
        /* best-effort */
      }
    }
    if (installDir && fs.existsSync(installDir)) {
      try {
        fs.rmSync(installDir, { recursive: true, force: true });
      } catch (_e) {
        /* best-effort */
      }
    }
    assert.ok(true);
  });
});
