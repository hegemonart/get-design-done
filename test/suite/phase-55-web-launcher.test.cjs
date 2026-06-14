'use strict';
/**
 * test/suite/phase-55-web-launcher.test.cjs — Phase 55 (GDD Dashboard, dep-free) WEB-03.
 *
 * Hermetic coverage for executor E's web launcher (sdk/cli/commands/dashboard.ts):
 *
 *   55-09-01  `dashboard --web --once` writes a valid HTML file (contains <svg>) + returns 0
 *   55-09-02  `--once` does NOT spawn a browser (injected opener is never called)
 *   55-09-03  `--once` leaves NO server listening (no open handles -> the process can exit)
 *   55-09-04  the ephemeral free-port finder (serveHtml) binds a real port > 0, then closes
 *   55-09-05  headless detection serves + prints the URL but does NOT auto-open the browser
 *   55-09-06  graceful empty graph: --once on a root with NO context-graph still emits valid HTML
 *
 * Everything is hermetic: a tmpdir fixture root, an injected fake opener, captured streams,
 * and the `headless` dep forced. NO real browser launches; NO server is left listening; the
 * launcher .ts module is loaded via --experimental-strip-types (Node 22 `import()` of a .ts URL
 * from this .cjs is gated, so the import is wrapped in a runtime-capability skip).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const CMD_TS = path.join(ROOT, 'sdk', 'cli', 'commands', 'dashboard.ts');

// ---------------------------------------------------------------------------
// A minimal WritableStream-ish capture (matches the dispatcher's stream contract:
// the command only ever calls .write(string)).
// ---------------------------------------------------------------------------
function capture() {
  const chunks = [];
  return {
    buffer: '',
    write(s) {
      chunks.push(String(s));
      this.buffer += String(s);
      return true;
    },
    get text() {
      return chunks.join('');
    },
  };
}

// A synthetic graph with one node per layer so buildGraphHtml emits real <svg> nodes.
const SAMPLE_GRAPH = {
  nodes: [
    { id: 'tok.color.bg', type: 'token', name: 'bg', summary: 'background', tags: ['color'], layer: 'Atomic' },
    { id: 'cmp.button', type: 'component', name: 'Button', summary: 'a button', tags: ['ui'], layer: 'Molecular' },
    { id: 'pat.form', type: 'pattern', name: 'Form', summary: 'a form', tags: [], layer: 'Organism' },
    { id: 'scr.login', type: 'screen', name: 'Login', summary: 'login screen', tags: [], layer: 'Template' },
  ],
  edges: [
    { source: 'cmp.button', target: 'tok.color.bg', type: 'uses', direction: 'forward', weight: 1 },
    { source: 'pat.form', target: 'cmp.button', type: 'uses', direction: 'forward', weight: 1 },
    { source: 'scr.login', target: 'pat.form', type: 'uses', direction: 'forward', weight: 1 },
  ],
};

/** Build a tmpdir project root with `.design/context-graph.json`. Returns the root path. */
function makeFixture(withGraph) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-dash-web-'));
  const designDir = path.join(root, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  if (withGraph) {
    fs.writeFileSync(path.join(designDir, 'context-graph.json'), JSON.stringify(SAMPLE_GRAPH), 'utf8');
  }
  return root;
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

// Build a ParsedArgs-shaped object (frozen like the real parser output).
function parsed(flags) {
  return Object.freeze({
    subcommand: 'dashboard',
    positionals: Object.freeze([]),
    flags: Object.freeze(flags || {}),
    passthrough: Object.freeze([]),
  });
}

// ---------------------------------------------------------------------------
// Load the launcher module (a .ts run via --experimental-strip-types). If this
// Node build cannot import a .ts URL, skip the whole suite rather than fail (the
// trampoline-spawn integration in the full suite still exercises the compiled path).
// ---------------------------------------------------------------------------
let mod = null;
let loadErr = null;
test('55-09: load dashboard launcher module (strip-types)', async () => {
  try {
    mod = await import(pathToFileURL(CMD_TS).href);
  } catch (err) {
    loadErr = err;
  }
  if (!mod) {
    // Surface WHY for CI logs, but do not hard-fail on a runtime that lacks .ts import.
    assert.ok(loadErr, 'expected an import error to be captured when the module is unavailable');
    return;
  }
  assert.equal(typeof mod.dashboardCommand, 'function', 'dashboardCommand export');
  assert.equal(typeof mod.serveHtml, 'function', 'serveHtml export');
  assert.equal(typeof mod.buildDashboardHtml, 'function', 'buildDashboardHtml export');
});

// ---------------------------------------------------------------------------
// 55-09-01 + 55-09-02 + 55-09-03: --web --once writes valid HTML, exit 0, no
// opener call, no lingering server.
// ---------------------------------------------------------------------------
test('55-09-01: dashboard --web --once writes HTML (contains <svg>) + returns 0', async (t) => {
  if (!mod) {
    t.skip('dashboard module unavailable on this runtime');
    return;
  }
  const root = makeFixture(true);
  t.after(() => rmrf(root));

  let openerCalls = 0;
  const fakeOpen = () => {
    openerCalls += 1;
    return true;
  };
  const stdout = capture();
  const stderr = capture();

  const code = await mod.dashboardCommand(parsed({ web: true, once: true }), {
    stdout,
    stderr,
    root,
    openBrowser: fakeOpen,
  });

  assert.equal(code, 0, `expected exit 0, stderr: ${stderr.text}`);

  const outFile = path.join(root, '.design', 'dashboard.html');
  assert.ok(fs.existsSync(outFile), 'dashboard.html should be written under .design/');
  const html = fs.readFileSync(outFile, 'utf8');
  assert.match(html, /<svg/, 'emitted HTML must contain an <svg> element');
  assert.match(html, /<!DOCTYPE html>/, 'emitted HTML must be a full document');
  // The four sample nodes should each render a <g data-id=...> group.
  assert.match(html, /data-id="cmp\.button"/, 'node group present in the HTML');

  // 55-09-02: --once MUST NOT spawn a browser.
  assert.equal(openerCalls, 0, '--once must never call the browser opener');

  // 55-09-03: the stdout reports the artifact path (no "serving at" line == no server).
  assert.match(stdout.text, /Wrote dashboard HTML to/, 'should report the written file');
  assert.doesNotMatch(stdout.text, /serving at/, '--once must not start a server');
});

// 55-09-03 (explicit): after --once resolves there are no lingering server handles.
// If a server were left listening, this test process would have an extra active handle.
test('55-09-03: --once leaves no active server handle', async (t) => {
  if (!mod) {
    t.skip('dashboard module unavailable on this runtime');
    return;
  }
  const root = makeFixture(true);
  t.after(() => rmrf(root));

  const before = process._getActiveHandles ? process._getActiveHandles().length : 0;
  const code = await mod.dashboardCommand(parsed({ web: true, once: true }), {
    stdout: capture(),
    stderr: capture(),
    root,
    openBrowser: () => true,
  });
  assert.equal(code, 0);
  const after = process._getActiveHandles ? process._getActiveHandles().length : 0;
  // A leaked Server would show up as a new active handle. Allow equality (no leak).
  assert.ok(after <= before, `--once must not leak a server handle (before=${before}, after=${after})`);
});

// ---------------------------------------------------------------------------
// 55-09-04: the ephemeral free-port finder binds a real port > 0, then closes.
// ---------------------------------------------------------------------------
test('55-09-04: serveHtml binds an ephemeral free port > 0 (then closes cleanly)', async (t) => {
  if (!mod) {
    t.skip('dashboard module unavailable on this runtime');
    return;
  }
  const served = await mod.serveHtml('<!doctype html><svg></svg>');
  try {
    assert.equal(typeof served.port, 'number', 'port should be a number');
    assert.ok(served.port > 0, `ephemeral port must be > 0 (got ${served.port})`);
    assert.match(served.url, /^http:\/\/127\.0\.0\.1:\d+\/$/, 'url should be a loopback URL with the port');
    assert.ok(served.server.listening, 'server should be listening before close');
  } finally {
    await new Promise((resolve) => served.server.close(() => resolve()));
  }
  assert.equal(served.server.listening, false, 'server must be closed after the test');
});

// ---------------------------------------------------------------------------
// 55-09-05: headless detection serves + prints the URL but does NOT auto-open.
// (Inject headless:true and a fake opener; assert the opener is NOT called and a
// URL is printed. We close the server via SIGINT so no handle leaks.)
// ---------------------------------------------------------------------------
test('55-09-05: headless --web prints the URL and never opens a browser', async (t) => {
  if (!mod) {
    t.skip('dashboard module unavailable on this runtime');
    return;
  }
  const root = makeFixture(true);
  t.after(() => rmrf(root));

  let openerCalls = 0;
  const stdout = capture();
  const stderr = capture();

  // Run the (blocking) serve path in the background; it resolves on SIGINT.
  const runP = mod.dashboardCommand(parsed({ web: true }), {
    stdout,
    stderr,
    root,
    headless: true,
    openBrowser: () => {
      openerCalls += 1;
      return true;
    },
  });

  // Wait until the server has reported its URL (poll the captured stdout briefly).
  const deadline = Date.now() + 5000;
  while (!/serving at http:\/\/127\.0\.0\.1:\d+\//.test(stdout.text) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.match(stdout.text, /serving at http:\/\/127\.0\.0\.1:\d+\//, 'headless mode must print the URL');
  assert.equal(openerCalls, 0, 'headless mode must NOT call the browser opener');

  // Stop the server (the command resolves on SIGINT) and await clean shutdown.
  process.emit('SIGINT');
  const code = await runP;
  assert.equal(code, 0, 'serve path exits 0 after shutdown');
});

// ---------------------------------------------------------------------------
// 55-09-06: graceful empty graph — --once on a root WITHOUT a context-graph still
// emits a valid empty-graph HTML document (never throws).
// ---------------------------------------------------------------------------
test('55-09-06: --once with no context-graph emits a valid empty-graph HTML', async (t) => {
  if (!mod) {
    t.skip('dashboard module unavailable on this runtime');
    return;
  }
  const root = makeFixture(false); // .design/ exists but NO context-graph.json
  t.after(() => rmrf(root));

  const stdout = capture();
  const stderr = capture();
  const code = await mod.dashboardCommand(parsed({ web: true, once: true }), {
    stdout,
    stderr,
    root,
    openBrowser: () => true,
  });
  assert.equal(code, 0, `expected exit 0, stderr: ${stderr.text}`);

  const html = fs.readFileSync(path.join(root, '.design', 'dashboard.html'), 'utf8');
  assert.match(html, /<svg/, 'empty-graph HTML still contains an <svg>');
  assert.match(html, /Empty graph/, 'empty-graph HTML shows the empty-state label');
  // The launcher should note on stderr that it fell back to an empty graph.
  assert.match(stderr.text, /empty graph/i, 'stderr should note the empty-graph fallback');
});
