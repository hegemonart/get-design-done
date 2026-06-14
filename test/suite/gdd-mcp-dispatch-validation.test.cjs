'use strict';
// test/suite/hone-mcp-dispatch-validation.test.cjs
// ---------------------------------------------------------------------------
// Plan 60-1-01 / HARDEN-01 (Task 2) — the hone-mcp tools/call dispatcher must
// validate every tool's arguments against its advertised input JSON Schema
// (ajv) BEFORE invoking the handler.
//
// Key proof (W1 finding): hone_intel_get's REAL input schema
// (additionalProperties:false, required:["slice_id"], string slice_id) must be
// the one compiled — NOT the permissive `{type:'object'}` fallback that
// loadTools() emits for malformed wrappers. The fallback would ACCEPT
// `{slice_id:'real', evil:1}` (additionalProperties default true) and would let
// the handler read the real slice and SUCCEED. The real schema REJECTS the
// extra property pre-handler. We assert that rejection — which can ONLY come
// from the genuine compiled schema — to pin it in force.
//
// DISCRIMINATING DESIGN: the legacy handler already does its own ad-hoc
// slice_id checks, so `{}`/`{slice_id:123}`/`../etc/passwd` produce errors with
// OR without dispatcher validation. To prove dispatcher-level validation we use
// a REAL on-disk slice: an extra/unknown property on an OTHERWISE-VALID call
// that would read a real file must flip from SUCCESS (no validation) to ERROR
// (additionalProperties:false enforced pre-handler).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SERVER_PATH = path.join(REPO_ROOT, 'sdk', 'mcp', 'hone-mcp', 'server.ts');

async function loadServer() {
  const url = new URL('file://' + SERVER_PATH.replace(/\\/g, '/'));
  return await import(url.href);
}

async function loadCallSchema() {
  const types = await import('@modelcontextprotocol/sdk/types.js');
  return types.CallToolRequestSchema;
}

async function callTool(server, callSchema, name, args) {
  const method = callSchema.shape.method.value; // 'tools/call'
  const handler = server._requestHandlers.get(method);
  assert.equal(typeof handler, 'function', 'tools/call handler is registered');
  const req = { method, params: { name, arguments: args } };
  return await handler(req, {});
}

function parseStructured(result) {
  if (result && result.structuredContent) return result.structuredContent;
  const text = result && result.content && result.content[0] && result.content[0].text;
  return text ? JSON.parse(text) : null;
}

/** Make a project root with a real intel slice and point the handler's
 *  resolveProjectRoot() at it via the GDD_PROJECT_ROOT env override. We do NOT
 *  chdir — server.ts resolves its schema dir from cwd, so cwd must stay the
 *  repo root; only the handler's project root is redirected. Returns restore().
 */
function withProjectRoot(prefix, sliceId, sliceBody) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-')));
  fs.mkdirSync(path.join(dir, '.design', 'intel'), { recursive: true });
  if (sliceId) {
    fs.writeFileSync(
      path.join(dir, '.design', 'intel', sliceId + '.json'),
      JSON.stringify(sliceBody),
    );
  }
  const savedOverride = process.env.GDD_PROJECT_ROOT;
  process.env.GDD_PROJECT_ROOT = dir;
  return {
    dir,
    restore() {
      if (savedOverride !== undefined) process.env.GDD_PROJECT_ROOT = savedOverride;
      else delete process.env.GDD_PROJECT_ROOT;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('HARDEN-01 dispatch: hone_intel_get with {} (missing required slice_id) returns isError pre-handler', async () => {
  const mod = await loadServer();
  const callSchema = await loadCallSchema();
  const server = mod.buildServer();
  const result = await callTool(server, callSchema, 'hone_intel_get', {});
  assert.equal(result.isError, true);
  const body = parseStructured(result);
  assert.equal(body.success, false);
  assert.ok(body.error, 'structured error present');
});

test('HARDEN-01 dispatch: hone_intel_get with {slice_id:123} (wrong type) returns isError', async () => {
  const mod = await loadServer();
  const callSchema = await loadCallSchema();
  const server = mod.buildServer();
  const result = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 123 });
  assert.equal(result.isError, true);
});

// DISCRIMINATING: this is the test that FAILS without dispatcher validation.
// With a REAL slice on disk, an extra property on an otherwise-valid call would
// be IGNORED by the handler (success) unless additionalProperties:false is
// enforced at the dispatcher. So success here == no validation; error == the
// real compiled schema rejected the unknown prop.
test('HARDEN-01 dispatch: additionalProperties:false rejects an extra prop on an OTHERWISE-VALID call that would read a real slice', async () => {
  const env = withProjectRoot('mcp-disp-addl', 'tokens', { name: 'tokens', ok: true });
  try {
    const mod = await loadServer();
    const callSchema = await loadCallSchema();
    const server = mod.buildServer();
    // Sanity: the clean valid call MUST succeed (proves the slice is readable
    // and the handler path works in this cwd).
    const clean = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 'tokens' });
    const cleanBody = parseStructured(clean);
    assert.ok(!clean.isError, 'clean valid call reaches handler and succeeds');
    assert.equal(cleanBody.success, true);
    // Now the same call WITH an unknown extra property. Without validation the
    // handler ignores `evil` and SUCCEEDS reading tokens.json. With the real
    // schema (additionalProperties:false) the dispatcher REJECTS it.
    const dirty = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 'tokens', evil: 1 });
    assert.equal(dirty.isError, true, 'unknown property rejected by additionalProperties:false');
    const dirtyBody = parseStructured(dirty);
    assert.equal(dirtyBody.success, false);
    assert.ok(!dirtyBody.data, 'no slice data returned for the rejected call (handler not reached)');
  } finally {
    env.restore();
  }
});

test('HARDEN-01 dispatch: REAL schema compiled — additionalProperties rejection proves NOT the open-object fallback', async () => {
  const env = withProjectRoot('mcp-disp-real', 'tokens', { name: 'tokens' });
  try {
    const mod = await loadServer();
    const callSchema = await loadCallSchema();
    const server = mod.buildServer();
    // The `{type:'object'}` fallback has additionalProperties default true, no
    // `required`, no slice_id typing — it would ACCEPT all three of these. The
    // real compiled schema rejects each. At least one (the additionalProperties
    // case on a valid slice) the fallback would have PASSED → distinguishes
    // "real schema" from "handler happened to error."
    const addl = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 'tokens', evil: 1 });
    const missing = await callTool(server, callSchema, 'hone_intel_get', {});
    const wrongType = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 123 });
    assert.equal(addl.isError, true, 'fallback would ACCEPT {slice_id:tokens,evil:1} — real schema rejects');
    assert.equal(missing.isError, true);
    assert.equal(wrongType.isError, true);
  } finally {
    env.restore();
  }
});

test('HARDEN-01 dispatch: a ../-shaped slice_id passes schema but surfaces an error (sink guard), never file contents', async () => {
  const env = withProjectRoot('mcp-disp-trav', null, null);
  try {
    const mod = await loadServer();
    const callSchema = await loadCallSchema();
    const server = mod.buildServer();
    const result = await callTool(server, callSchema, 'hone_intel_get', { slice_id: '../etc/passwd' });
    assert.equal(result.isError, true, 'traversal slice_id surfaces an error');
    const body = parseStructured(result);
    assert.equal(body.success, false);
    assert.ok(!body.data, 'no file data returned for a traversal attempt');
  } finally {
    env.restore();
  }
});

test('HARDEN-01 dispatch: a well-formed call still reaches the handler and succeeds', async () => {
  const env = withProjectRoot('mcp-disp-valid', 'tokens', { name: 'tokens', ok: 1 });
  try {
    const mod = await loadServer();
    const callSchema = await loadCallSchema();
    const server = mod.buildServer();
    const result = await callTool(server, callSchema, 'hone_intel_get', { slice_id: 'tokens' });
    const body = parseStructured(result);
    assert.ok(!result.isError, 'valid call is not an error');
    assert.equal(body.success, true);
    assert.equal(body.data.slice_id, 'tokens');
  } finally {
    env.restore();
  }
});

test('HARDEN-01 dispatch: every registered tool dispatches through validation without crashing', async () => {
  const env = withProjectRoot('mcp-disp-alltools', null, null);
  try {
    const mod = await loadServer();
    const callSchema = await loadCallSchema();
    const server = mod.buildServer();
    const toolsMod = await import(
      new URL('file://' + path.join(REPO_ROOT, 'sdk', 'mcp', 'hone-mcp', 'tools', 'index.ts').replace(/\\/g, '/')).href
    );
    assert.equal(toolsMod.TOOL_MODULES.length, 13, '13 tools registered');
    for (const m of toolsMod.TOOL_MODULES) {
      const result = await callTool(server, callSchema, m.name, {});
      assert.ok(result && (result.isError === true || result.content), 'structured result for ' + m.name);
    }
  } finally {
    env.restore();
  }
});
