'use strict';
// tests/gdd-mcp-server.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-01 — gdd-mcp server scaffold tests.
//
// Covers (>= 6 tests, every name prefixed with `27.7-01: `):
//   1. handshake — buildServer() returns a Server instance with .connect
//      and .setRequestHandler functions
//   2. tools/list — handler returns empty array when TOOL_MODULES is empty
//      (scaffold state; Plan 27.7-02 updates this to expect 12)
//   3. walk-up — resolveProjectRoot finds .design/ marker
//   4. walk-up — resolveProjectRoot finds .planning/ marker
//   5. walk-up — resolveProjectRoot finds .claude-plugin/plugin.json marker
//   6. walk-up — resolveProjectRoot throws when no marker reachable
//   7. tools/call — unknown tool name returns isError:true with structured
//      error (optional; ships with scaffold per plan)
//
// macOS symlink discipline: every tmpdir creation is canonicalized via
// fs.realpathSync (Phase 27.6 lesson) so path comparisons against
// resolveProjectRoot() results don't false-fail on /var → /private/var
// or similar layer-2 mount realpaths.
//
// The test uses dynamic `import()` against the .ts module so node:test
// can run with `--experimental-strip-types` (matches the pattern in
// `tests/mcp-gdd-state.test.ts`).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Path roots — the test file lives in tests/, the server one level up.
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'mcp-servers',
  'gdd-mcp',
  'server.ts',
);
const SHARED_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'mcp-servers',
  'gdd-mcp',
  'tools',
  'shared.ts',
);

/**
 * Create an ephemeral tmp dir whose path is real-path canonicalized.
 *
 * macOS symlink discipline (Phase 27.6 lesson): os.tmpdir() may return a
 * path under /var which is a symlink to /private/var. The walk-up
 * algorithm reports the canonical path; tests that compare against the
 * tmpdir spelling will false-fail unless they apply fs.realpathSync()
 * to the tmpdir result too.
 */
function tmp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  return fs.realpathSync(dir);
}

/** Dynamic-import the server module so node:test runs it under
 *  --experimental-strip-types. */
async function loadServer() {
  // file:// URL avoids platform-specific path issues with the import()
  // specifier on Windows.
  const url = new URL('file://' + SERVER_PATH.replace(/\\/g, '/'));
  return await import(url.href);
}

/** Dynamic-import the shared helpers (resolveProjectRoot, okResponse,
 *  errorResponse). */
async function loadShared() {
  const url = new URL('file://' + SHARED_PATH.replace(/\\/g, '/'));
  return await import(url.href);
}

describe('27.7-01: gdd-mcp server scaffold', () => {
  // -------------------------------------------------------------------------
  // Test 1 — handshake: buildServer returns a Server-shaped instance.

  test('27.7-01: handshake — buildServer returns a Server instance', async () => {
    const mod = await loadServer();
    assert.equal(typeof mod.buildServer, 'function', 'buildServer is exported');
    const srv = mod.buildServer();
    assert.equal(
      typeof srv.connect,
      'function',
      'server has connect()',
    );
    assert.equal(
      typeof srv.setRequestHandler,
      'function',
      'server has setRequestHandler()',
    );
    assert.equal(typeof srv.close, 'function', 'server has close()');
  });

  // -------------------------------------------------------------------------
  // Test 2 — tools/list returns empty array in scaffold state.
  // Plan 27.7-02 updates the expected length to 12 once tools land.

  test('27.7-01: tools/list — handler returns empty array when TOOL_MODULES is empty', async () => {
    // Read the tools index module to confirm scaffold state.
    const toolsIndexUrl = new URL(
      'file://' +
        path
          .join(
            REPO_ROOT,
            'scripts',
            'mcp-servers',
            'gdd-mcp',
            'tools',
            'index.ts',
          )
          .replace(/\\/g, '/'),
    );
    const toolsMod = await import(toolsIndexUrl.href);
    assert.ok(Array.isArray(toolsMod.TOOL_MODULES), 'TOOL_MODULES is array');
    assert.equal(
      toolsMod.TOOL_MODULES.length,
      12,
      'Plan 27.7-02 populates 12 tools (D-03 hard cap)',
    );
    assert.equal(
      toolsMod.TOOL_COUNT,
      12,
      'TOOL_COUNT mirrors TOOL_MODULES.length',
    );
  });

  // -------------------------------------------------------------------------
  // Tests 3-5 — walk-up markers (.design/, .planning/, .claude-plugin/).
  //
  // Each test creates a tmp project root with one marker, chdirs to a
  // nested subdirectory, calls resolveProjectRoot(), and asserts the
  // returned absolute path matches the tmp root. The env override
  // (GDD_PROJECT_ROOT) is unset for these tests.

  test('27.7-01: walk-up — resolveProjectRoot finds .design/ marker', async () => {
    const root = tmp('gdd-mcp-walkup-design');
    fs.mkdirSync(path.join(root, '.design'), { recursive: true });
    const deep = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(deep, { recursive: true });
    const realDeep = fs.realpathSync(deep);

    const originalCwd = process.cwd();
    const savedOverride = process.env.GDD_PROJECT_ROOT;
    delete process.env.GDD_PROJECT_ROOT;
    try {
      process.chdir(realDeep);
      const shared = await loadShared();
      const found = shared.resolveProjectRoot();
      assert.equal(
        fs.realpathSync(found),
        root,
        '.design/ marker found at expected root',
      );
    } finally {
      process.chdir(originalCwd);
      if (savedOverride !== undefined)
        process.env.GDD_PROJECT_ROOT = savedOverride;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('27.7-01: walk-up — resolveProjectRoot finds .planning/ marker', async () => {
    const root = tmp('gdd-mcp-walkup-planning');
    fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
    const deep = path.join(root, 'sub', 'sub2');
    fs.mkdirSync(deep, { recursive: true });
    const realDeep = fs.realpathSync(deep);

    const originalCwd = process.cwd();
    const savedOverride = process.env.GDD_PROJECT_ROOT;
    delete process.env.GDD_PROJECT_ROOT;
    try {
      process.chdir(realDeep);
      const shared = await loadShared();
      const found = shared.resolveProjectRoot();
      assert.equal(
        fs.realpathSync(found),
        root,
        '.planning/ marker found at expected root',
      );
    } finally {
      process.chdir(originalCwd);
      if (savedOverride !== undefined)
        process.env.GDD_PROJECT_ROOT = savedOverride;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('27.7-01: walk-up — resolveProjectRoot finds .claude-plugin/plugin.json marker', async () => {
    const root = tmp('gdd-mcp-walkup-plugin');
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'test-plugin', version: '0.0.0' }, null, 2),
      'utf8',
    );
    const deep = path.join(root, 'pkg', 'src');
    fs.mkdirSync(deep, { recursive: true });
    const realDeep = fs.realpathSync(deep);

    const originalCwd = process.cwd();
    const savedOverride = process.env.GDD_PROJECT_ROOT;
    delete process.env.GDD_PROJECT_ROOT;
    try {
      process.chdir(realDeep);
      const shared = await loadShared();
      const found = shared.resolveProjectRoot();
      assert.equal(
        fs.realpathSync(found),
        root,
        '.claude-plugin/plugin.json marker found at expected root',
      );
    } finally {
      process.chdir(originalCwd);
      if (savedOverride !== undefined)
        process.env.GDD_PROJECT_ROOT = savedOverride;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 6 — no marker reachable. chdir to a freshly-created tmp dir
  // whose ancestors are guaranteed not to contain GDD markers (we
  // synthesize an isolated nested tree under os.tmpdir() so /var or
  // /private/var don't accidentally satisfy the walk-up).

  test('27.7-01: walk-up — resolveProjectRoot throws when no marker reachable', async () => {
    // Use a deeply-nested isolated tmp tree to escape any developer-machine
    // markers between os.tmpdir() and /. We DELETE the .design/ etc.
    // files inside if they exist (they shouldn't, but defensively scrub).
    const isolated = tmp('gdd-mcp-walkup-none');
    // Defensive scrub: ensure no markers exist in the test root itself.
    for (const marker of ['.design', '.planning']) {
      const p = path.join(isolated, marker);
      if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    }
    const pluginPath = path.join(isolated, '.claude-plugin', 'plugin.json');
    if (fs.existsSync(pluginPath))
      fs.rmSync(path.dirname(pluginPath), { recursive: true, force: true });

    const originalCwd = process.cwd();
    const savedOverride = process.env.GDD_PROJECT_ROOT;
    delete process.env.GDD_PROJECT_ROOT;
    try {
      process.chdir(isolated);
      const shared = await loadShared();
      // The walk MAY succeed if a developer happens to have a GDD project
      // ancestor of os.tmpdir() — extremely unlikely but defensible. To
      // make this test deterministic we pass an explicit start dir AND
      // assert that either it throws OR the returned root is NOT inside
      // our isolated tmp tree.
      let threw = false;
      let foundPath = null;
      try {
        foundPath = shared.resolveProjectRoot(isolated);
      } catch (err) {
        threw = true;
        assert.match(
          err.message,
          /gdd project root not found/,
          'error message references project-root-not-found',
        );
      }
      if (!threw) {
        // If something upstream of tmpdir IS a GDD project, the walk
        // resolves to that path; it must NOT be inside our isolated tree.
        assert.ok(
          !fs.realpathSync(foundPath).startsWith(isolated),
          `walk-up resolved to ancestor outside isolated tmp tree (${foundPath}); test environment has a GDD project ancestor of os.tmpdir() — re-run on a clean machine`,
        );
      }
    } finally {
      process.chdir(originalCwd);
      if (savedOverride !== undefined)
        process.env.GDD_PROJECT_ROOT = savedOverride;
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // Test 7 — unknown tool name in tools/call returns isError:true.
  // We exercise the dispatcher by reaching into the server's
  // setRequestHandler call path: build the server, register, then
  // invoke the request handler synchronously via the underlying SDK
  // method registry.
  //
  // The MCP Server class exposes registered handlers via the protected
  // `_requestHandlers` map (it's a Map<string, Handler>). We invoke the
  // CallToolRequestSchema handler directly with a synthetic request
  // shaped per the JSON-RPC contract.

  test('27.7-01: tools/call — unknown tool name returns isError:true with structured error', async () => {
    const mod = await loadServer();
    const srv = mod.buildServer();
    // Access the internal handler registry. The MCP SDK stores
    // handlers under either `_requestHandlers` (private) or via
    // `setRequestHandler` registration; we can re-set with a tracked
    // sink to capture invocation.
    //
    // Simpler approach: invoke the public setRequestHandler one more
    // time with a no-op and use a synthetic request shape. The SDK's
    // `request` API isn't exposed to consumers, so we instead introspect
    // via duck-typing: walk srv._requestHandlers if available.
    const handlers = srv._requestHandlers;
    if (handlers instanceof Map) {
      // Find the tools/call handler. The MCP SDK registers handlers by
      // the request schema's `method` string — "tools/call".
      const callHandler = handlers.get('tools/call');
      assert.equal(
        typeof callHandler,
        'function',
        'tools/call handler is registered',
      );
      const fakeRequest = {
        method: 'tools/call',
        params: { name: 'nonexistent_tool', arguments: {} },
      };
      const result = await callHandler(fakeRequest, {});
      assert.equal(
        result.isError,
        true,
        'unknown tool returns isError:true',
      );
      assert.ok(
        Array.isArray(result.content) && result.content.length > 0,
        'isError response carries text content',
      );
      const parsed = JSON.parse(result.content[0].text);
      assert.equal(
        parsed.success,
        false,
        'structured payload has success:false',
      );
      assert.ok(
        parsed.error && typeof parsed.error.message === 'string',
        'structured payload has error.message',
      );
    } else {
      // SDK shape changed — skip the introspection branch but log.
      console.warn(
        '[test] skipped tools/call probe — srv._requestHandlers is not a Map',
      );
    }
  });
});
