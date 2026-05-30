'use strict';
/**
 * TST-26 — connection-probe
 *
 * Validates probe logic for all 8 connections and the mockMCP helper.
 * Each connection doc must declare the three verdicts (available, unavailable,
 * not_configured) and a probe mechanism consistent with its type.
 *
 * Note: claude-design is not an MCP, so its expected-tool regex is loose — it
 * references the claude-design product by name rather than an mcp__* tool.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, mockMCP } = require('./helpers.ts');

const CONNECTIONS = [
  { name: 'figma',         probeType: 'mcp',    expectedTool: /mcp__figma/i },
  { name: 'refero',        probeType: 'mcp',    expectedTool: /mcp__refero/i },
  { name: 'preview',       probeType: 'mcp',    expectedTool: /mcp__preview|preview_/i },
  { name: 'storybook',     probeType: 'http',   expectedTool: /localhost:6006/i },
  { name: 'chromatic',     probeType: 'cli',    expectedTool: /chromatic/i },
  { name: 'graphify',      probeType: 'config', expectedTool: /graph\.json|graphify/i },
  { name: 'claude-design', probeType: 'other',  expectedTool: /claude.?design/i },
  { name: 'pinterest',     probeType: 'mcp',    expectedTool: /mcp__pinterest|pinterest/i },
];

for (const conn of CONNECTIONS) {
  const docPath = path.join(REPO_ROOT, 'connections', `${conn.name}.md`);

  test(`connection-probe: ${conn.name} doc exists`, () => {
    assert.ok(fs.existsSync(docPath), `expected connection doc at ${docPath}`);
  });

  test(`connection-probe: ${conn.name} declares all three verdicts`, () => {
    const body = fs.readFileSync(docPath, 'utf8');
    for (const verdict of ['available', 'unavailable', 'not_configured']) {
      assert.match(
        body,
        new RegExp(verdict, 'i'),
        `${conn.name}.md should mention "${verdict}" (case-insensitive)`
      );
    }
  });

  test(`connection-probe: ${conn.name} probe mechanism matches expected type`, () => {
    const body = fs.readFileSync(docPath, 'utf8');
    assert.match(
      body,
      conn.expectedTool,
      `${conn.name}.md should contain a substring matching ${conn.expectedTool}`
    );
  });
}

test('connection-probe: mockMCP resolves to available verdict on successful call', () => {
  const mock = mockMCP('figma', {
    get_metadata: () => ({ version: '1.0.0' }),
  });
  const result = mock.call('get_metadata');
  assert.ok(result.version, 'probe call should return a version');
  mock.assertCalled('get_metadata');
});

test('connection-probe: mockMCP throws on unexpected tool name (unavailable verdict)', () => {
  const mock = mockMCP('figma', {});
  assert.throws(
    () => mock.call('nonexistent_tool'),
    /unexpected tool call/i
  );
});

test('connection-probe: CONNECTIONS array contains exactly 8 entries', () => {
  assert.equal(CONNECTIONS.length, 8, 'expected 8 connections');
  const names = CONNECTIONS.map(c => c.name).sort();
  assert.deepEqual(names, [
    'chromatic',
    'claude-design',
    'figma',
    'graphify',
    'pinterest',
    'preview',
    'refero',
    'storybook',
  ]);
});
