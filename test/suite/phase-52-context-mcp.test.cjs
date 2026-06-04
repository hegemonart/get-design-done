'use strict';
// test/suite/phase-52-context-mcp.test.cjs
// ---------------------------------------------------------------------------
// Phase 52 (DesignContext keystone) — gdd_context_query MCP tool + context skill.
//
// Covers:
//   - the tool module exports name / schemaPath / handle (mirrors every other
//     gdd-mcp tool module);
//   - handle returns a STRUCTURED result on a temp graph (success when the
//     sibling query engine is present, structured engine-unavailable error when
//     it is not — the engine is authored by Phase 52 sibling A in parallel);
//   - handle returns a GRACEFUL no-graph result when .design/context-graph.json
//     is absent (this path runs BEFORE the engine load, so it is deterministic);
//   - tools/index TOOL_COUNT === 13 (cap raised 12 -> 13, D5);
//   - the context SKILL.md frontmatter is valid and documents the query ops.
//
// macOS symlink discipline: every tmpdir is canonicalized via fs.realpathSync.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TOOLS_DIR = path.join(REPO_ROOT, 'sdk', 'mcp', 'gdd-mcp', 'tools');
const SKILL_PATH = path.join(REPO_ROOT, 'scripts', 'skill-templates', 'context', 'SKILL.md');
const QUERY_ENGINE = path.join(REPO_ROOT, 'scripts', 'lib', 'design-context-query.cjs');

const OPS = ['nodes', 'edges', 'path', 'consumers-of', 'unreachable', 'cycles', 'coverage'];

/** Canonicalized tmpdir — macOS symlink discipline. */
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  return fs.realpathSync(d);
}

/** Dynamic-import a .ts module under --experimental-strip-types. */
async function loadTool(toolName) {
  const file = path.join(TOOLS_DIR, toolName + '.ts');
  const url = new URL('file://' + file.replace(/\\/g, '/'));
  return await import(url.href);
}

/** Pin GDD_PROJECT_ROOT for the body of `fn`. */
async function withProjectRoot(root, fn) {
  const prev = process.env.GDD_PROJECT_ROOT;
  process.env.GDD_PROJECT_ROOT = root;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.GDD_PROJECT_ROOT;
    else process.env.GDD_PROJECT_ROOT = prev;
  }
}

/** Write a minimal, schema-shaped DesignContext graph to <root>/.design/. */
function writeGraph(root) {
  const dir = path.join(root, '.design');
  fs.mkdirSync(dir, { recursive: true });
  const graph = {
    schema_version: '1.0.0',
    generated_at: '2026-06-03T00:00:00Z',
    nodes: [
      { id: 'token:color/brand', type: 'token', name: 'Brand', summary: 'Brand color', tags: ['color'], complexity: 'simple' },
      { id: 'component:Button', type: 'component', name: 'Button', summary: 'Primary button', tags: ['action'], complexity: 'moderate' },
    ],
    edges: [
      { source: 'component:Button', target: 'token:color/brand', type: 'uses-token', direction: 'forward', weight: 1 },
    ],
  };
  fs.writeFileSync(path.join(dir, 'context-graph.json'), JSON.stringify(graph), 'utf8');
}

// ---------------------------------------------------------------------------
// Module surface
// ---------------------------------------------------------------------------

test('52: gdd_context_query exports name/schemaPath/handle', async () => {
  const mod = await loadTool('gdd_context_query');
  assert.equal(mod.name, 'gdd_context_query');
  assert.equal(typeof mod.schemaPath, 'string');
  assert.match(mod.schemaPath, /gdd_context_query\.schema\.json$/);
  assert.equal(typeof mod.handle, 'function');
});

// ---------------------------------------------------------------------------
// Temp graph — structured result (engine present) OR structured error (absent)
// ---------------------------------------------------------------------------

test('52: handle returns a structured result on a temp graph', async () => {
  const root = tmp('mcp-context-graph');
  writeGraph(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_context_query');
    const res = await mod.handle({ op: 'nodes' });
    // Always a structured ToolResponse envelope — never an uncaught throw.
    assert.equal(typeof res, 'object');
    assert.equal(typeof res.success, 'boolean');
    if (fs.existsSync(QUERY_ENGINE)) {
      // Sibling A has shipped the engine — expect a success result.
      assert.equal(res.success, true);
      assert.equal(res.data.op, 'nodes');
      assert.equal(res.data.graph_present, true);
      assert.ok('result' in res.data);
    } else {
      // Engine not present yet — expect the structured engine-unavailable error.
      assert.equal(res.success, false);
      assert.match(res.error.message, /query engine unavailable/i);
    }
  });
});

test('52: handle rejects an unknown op with a structured error', async () => {
  const root = tmp('mcp-context-badop');
  writeGraph(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_context_query');
    const res = await mod.handle({ op: 'not-a-real-op' });
    assert.equal(res.success, false);
    assert.match(res.error.message, /op is required/i);
  });
});

// ---------------------------------------------------------------------------
// No graph — graceful structured result (deterministic; runs before engine load)
// ---------------------------------------------------------------------------

test('52: handle returns a graceful no-graph result when context-graph.json absent', async () => {
  const root = tmp('mcp-context-missing');
  // Satisfy the project-root walk with .design/ present but no graph file.
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_context_query');
    const res = await mod.handle({ op: 'coverage' });
    assert.equal(res.success, true);
    assert.equal(res.data.graph_present, false);
    assert.equal(res.data.op, 'coverage');
    assert.equal(res.data.result, null);
  });
});

// ---------------------------------------------------------------------------
// Registry cap
// ---------------------------------------------------------------------------

test('52: tools/index TOOL_COUNT === 13', async () => {
  const file = path.join(TOOLS_DIR, 'index.ts');
  const url = new URL('file://' + file.replace(/\\/g, '/'));
  const m = await import(url.href);
  assert.equal(m.TOOL_COUNT, 13);
  assert.equal(m.TOOL_MODULES.length, 13);
  const names = m.TOOL_MODULES.map((t) => t.name);
  assert.ok(names.includes('gdd_context_query'), 'gdd_context_query missing from registry');
});

// ---------------------------------------------------------------------------
// Skill frontmatter + documented ops
// ---------------------------------------------------------------------------

test('52: context SKILL.md frontmatter is valid and documents the query ops', () => {
  assert.ok(fs.existsSync(SKILL_PATH), 'scripts/skill-templates/context/SKILL.md missing');
  const text = fs.readFileSync(SKILL_PATH, 'utf8');

  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(fm, 'frontmatter block missing');
  const block = fm[1];

  assert.match(block, /^name:\s*gdd-context\s*$/m, 'name must be gdd-context');
  assert.match(block, /^description:\s*"/m, 'description must be a quoted string');
  assert.match(block, /^argument-hint:\s*"/m, 'argument-hint required');
  assert.match(block, /^tools:\s*Read,\s*Bash\s*$/m, 'tools must be "Read, Bash"');
  // v3 description form ends with an "Activates for" activation sentence.
  assert.match(block, /Activates for/i, 'description must include an activation sentence');

  // Every op must be documented somewhere in the body.
  for (const op of OPS) {
    assert.ok(text.includes(op), 'op not documented in skill body: ' + op);
  }
  // The skill must reference the engine and the graph path.
  assert.ok(text.includes('scripts/lib/design-context-query.cjs'), 'skill must cite the query engine');
  assert.ok(text.includes('.design/context-graph.json'), 'skill must cite the graph path');
});
