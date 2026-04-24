// tests/tool-scoping.test.ts — per-stage allowed-tools enforcement tests.
//
// Plan 21-03 acceptance:
//   * STAGE_SCOPES: frozen, 7-stage table, verify denies Write/Edit/Task,
//     design uniquely has bashMutation=true.
//   * parseAgentTools: 4 YAML shapes + wildcard + empty + missing file
//     + missing frontmatter + quoted entries.
//   * computeScope (pure): agent override > stage default; MCP append;
//     empty override → MCP-only; dedupe + alpha sort; denied correctness.
//   * checkTool: MCP always pass, native miss → violation record.
//   * enforceScope: compliant caller → scope.allowed; denial throws
//     ValidationError with context = {stage, tool, allowed}; unknown
//     stage throws INVALID_STAGE; MCP-only additional list passes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

import {
  NATIVE_TOOLS,
  STAGE_SCOPES,
  computeScope,
  checkTool,
  enforceScope,
  isMcpTool,
  isNativeTool,
  parseAgentTools,
  parseAgentToolsByName,
  type Scope,
  type Stage,
} from '../scripts/lib/tool-scoping/index.ts';
import { ValidationError, GDDError } from '../scripts/lib/gdd-errors/index.ts';

const FIX = (name: string): string =>
  resolve('tests/fixtures/tool-scoping', name);

// ==========================================================================
// STAGE_SCOPES invariants
// ==========================================================================

test('STAGE_SCOPES: frozen table — mutation throws in strict mode', () => {
  assert.ok(Object.isFrozen(STAGE_SCOPES), 'STAGE_SCOPES itself is frozen');
  assert.ok(
    Object.isFrozen(STAGE_SCOPES.verify),
    'verify entry is frozen',
  );
  assert.ok(
    Object.isFrozen(STAGE_SCOPES.verify.allowed),
    'verify.allowed array is frozen',
  );
  // Attempting to assign a new property to a frozen object in strict
  // mode (module code is always strict) throws TypeError.
  assert.throws(() => {
    (STAGE_SCOPES as unknown as { verify: unknown }).verify = 'nope';
  }, TypeError);
});

test('STAGE_SCOPES: every Stage key present', () => {
  const expected: readonly Stage[] = [
    'brief',
    'explore',
    'plan',
    'design',
    'verify',
    'init',
    'custom',
  ];
  for (const s of expected) {
    assert.ok(s in STAGE_SCOPES, `missing stage: ${s}`);
  }
  // Exactly these keys, no extras.
  assert.deepEqual(
    Object.keys(STAGE_SCOPES).sort(),
    [...expected].sort(),
  );
});

test('STAGE_SCOPES: verify scope contains NO Write, Edit, or Task', () => {
  const verify = STAGE_SCOPES.verify;
  assert.ok(!verify.allowed.includes('Write'), 'verify forbids Write');
  assert.ok(!verify.allowed.includes('Edit'), 'verify forbids Edit');
  assert.ok(!verify.allowed.includes('Task'), 'verify forbids Task');
  // And what verify DOES permit, for regression safety.
  assert.deepEqual([...verify.allowed], ['Read', 'Grep', 'Glob', 'Bash']);
});

test('STAGE_SCOPES: design has bashMutation=true; all others false', () => {
  assert.equal(STAGE_SCOPES.design.bashMutation, true);
  assert.equal(STAGE_SCOPES.brief.bashMutation, false);
  assert.equal(STAGE_SCOPES.explore.bashMutation, false);
  assert.equal(STAGE_SCOPES.plan.bashMutation, false);
  assert.equal(STAGE_SCOPES.verify.bashMutation, false);
  assert.equal(STAGE_SCOPES.init.bashMutation, false);
  assert.equal(STAGE_SCOPES.custom.bashMutation, false);
});

// ==========================================================================
// isMcpTool / isNativeTool
// ==========================================================================

test('isMcpTool: identifies mcp__-prefixed tool names', () => {
  assert.equal(isMcpTool('mcp__gdd_state__get'), true);
  assert.equal(isMcpTool('mcp__figma__export'), true);
  assert.equal(isMcpTool('Read'), false);
  assert.equal(isMcpTool(''), false);
  assert.equal(isMcpTool('mcp_'), false, 'single underscore is not MCP');
  assert.equal(isMcpTool('MCP__x__y'), false, 'case-sensitive');
});

test('isNativeTool: matches NATIVE_TOOLS exactly', () => {
  for (const t of NATIVE_TOOLS) {
    assert.equal(isNativeTool(t), true, `${t} is native`);
  }
  assert.equal(isNativeTool('mcp__x__y'), false);
  assert.equal(isNativeTool('Unknown'), false);
  assert.equal(isNativeTool(''), false);
});

// ==========================================================================
// parseAgentTools — one test per fixture shape + edge cases
// ==========================================================================

test('parseAgentTools: inline comma list → string[]', () => {
  const out = parseAgentTools(FIX('agent-inline.md'));
  assert.deepEqual(out, ['Read', 'Write', 'Grep']);
});

test('parseAgentTools: YAML block list → string[]', () => {
  const out = parseAgentTools(FIX('agent-yaml-list.md'));
  assert.deepEqual(out, ['Read', 'Write']);
});

test('parseAgentTools: flow-style [Read, Write] → string[]', () => {
  const out = parseAgentTools(FIX('agent-flow.md'));
  assert.deepEqual(out, ['Read', 'Write']);
});

test('parseAgentTools: wildcard "*" → null (forward-compat escape)', () => {
  const out = parseAgentTools(FIX('agent-wildcard.md'));
  assert.equal(out, null);
});

test('parseAgentTools: empty flow [] → [] (MCP-only narrow)', () => {
  const out = parseAgentTools(FIX('agent-empty.md'));
  assert.deepEqual(out, []);
});

test('parseAgentTools: missing tools key → null', () => {
  const out = parseAgentTools(FIX('agent-no-tools-key.md'));
  assert.equal(out, null);
});

test('parseAgentTools: missing frontmatter → null', () => {
  const out = parseAgentTools(FIX('agent-no-frontmatter.md'));
  assert.equal(out, null);
});

test('parseAgentTools: ENOENT (missing file) → null', () => {
  const out = parseAgentTools(FIX('does-not-exist.md'));
  assert.equal(out, null);
});

test('parseAgentTools: quoted entries have quotes stripped', () => {
  const out = parseAgentTools(FIX('agent-quoted.md'));
  assert.deepEqual(out, ['Read', 'Write']);
});

test('parseAgentToolsByName: resolves <root>/<name>.md', () => {
  const out = parseAgentToolsByName(
    'agent-inline',
    'tests/fixtures/tool-scoping',
  );
  assert.deepEqual(out, ['Read', 'Write', 'Grep']);
  assert.equal(
    parseAgentToolsByName('nonexistent', 'tests/fixtures/tool-scoping'),
    null,
  );
});

// ==========================================================================
// computeScope — branch coverage
// ==========================================================================

test('computeScope: brief default → STAGE_SCOPES.brief.allowed (sorted)', () => {
  const s: Scope = computeScope({ stage: 'brief' });
  assert.deepEqual(
    [...s.allowed],
    [...STAGE_SCOPES.brief.allowed].sort(),
  );
  assert.equal(s.stage, 'brief');
  assert.equal(s.bashMutation, false);
});

test('computeScope: verify default → read-only set', () => {
  const s: Scope = computeScope({ stage: 'verify' });
  assert.deepEqual([...s.allowed], ['Bash', 'Glob', 'Grep', 'Read']);
  assert.ok(!s.allowed.includes('Write'));
  assert.ok(!s.allowed.includes('Edit'));
  assert.ok(!s.allowed.includes('Task'));
});

test('computeScope: design with agent override ["Read","Grep"] narrows scope', () => {
  const s: Scope = computeScope({
    stage: 'design',
    agentTools: ['Read', 'Grep'],
  });
  assert.deepEqual([...s.allowed], ['Grep', 'Read']);
  // bashMutation still tracks stage-level — design keeps true regardless
  // of narrower override (documented precedence).
  assert.equal(s.bashMutation, true);
});

test('computeScope: explore with empty override [] → empty + MCP-only', () => {
  const s: Scope = computeScope({ stage: 'explore', agentTools: [] });
  assert.deepEqual([...s.allowed], []);
  // Every native tool should end up in denied.
  for (const nt of NATIVE_TOOLS) {
    assert.ok(s.denied.includes(nt), `${nt} should be denied`);
  }
});

test('computeScope: additional MCP tool appended to allowed', () => {
  const s: Scope = computeScope({
    stage: 'verify',
    additional: ['mcp__gdd_state__get'],
  });
  assert.ok(s.allowed.includes('mcp__gdd_state__get'));
  // And it must NOT appear in denied (MCP never denied).
  assert.ok(!s.denied.includes('mcp__gdd_state__get'));
});

test('computeScope: additional Write on verify → included (enforce denies, not compute)', () => {
  const s: Scope = computeScope({
    stage: 'verify',
    additional: ['Write'],
  });
  assert.ok(
    s.allowed.includes('Write'),
    'computeScope folds additional into allowed — enforcement is checkTool/enforceScope',
  );
});

test('computeScope: dedupe + alphabetical sort', () => {
  const s: Scope = computeScope({
    stage: 'design',
    agentTools: ['Read', 'Read', 'Grep'],
    additional: ['Grep', 'mcp__a__b', 'Read'],
  });
  assert.deepEqual([...s.allowed], ['Grep', 'Read', 'mcp__a__b']);
});

test('computeScope: denied = NATIVE_TOOLS \\ native_allowed', () => {
  const s: Scope = computeScope({ stage: 'verify' });
  const native = new Set(s.allowed.filter((t) => isNativeTool(t)));
  const expectedDenied = NATIVE_TOOLS.filter((t) => !native.has(t)).sort();
  assert.deepEqual([...s.denied], expectedDenied);
});

// ==========================================================================
// checkTool — predicate branches
// ==========================================================================

test('checkTool: MCP tool always allowed', () => {
  const s: Scope = computeScope({ stage: 'verify' });
  assert.equal(checkTool(s, 'mcp__gdd_state__get'), null);
  assert.equal(checkTool(s, 'mcp__figma__export'), null);
});

test('checkTool: native tool in scope → null (allowed)', () => {
  const s: Scope = computeScope({ stage: 'design' });
  assert.equal(checkTool(s, 'Write'), null);
  assert.equal(checkTool(s, 'Bash'), null);
});

test('checkTool: native tool not in scope → ScopeViolation', () => {
  const s: Scope = computeScope({ stage: 'verify' });
  const v = checkTool(s, 'Write');
  assert.notEqual(v, null);
  assert.equal(v?.code, 'TOOL_NOT_ALLOWED');
  assert.equal(v?.tool, 'Write');
  assert.equal(v?.stage, 'verify');
  assert.match(v?.message ?? '', /Write/);
});

test('checkTool: unknown tool name → violation (treated as native miss)', () => {
  const s: Scope = computeScope({ stage: 'design' });
  const v = checkTool(s, 'TotallyFakeTool');
  assert.notEqual(v, null);
  assert.equal(v?.code, 'TOOL_NOT_ALLOWED');
});

test('checkTool: empty scope — only MCP passes', () => {
  const s: Scope = computeScope({ stage: 'custom', agentTools: [] });
  assert.equal(checkTool(s, 'mcp__gdd_state__get'), null);
  assert.notEqual(checkTool(s, 'Read'), null);
});

// ==========================================================================
// enforceScope — throwing behavior
// ==========================================================================

test('enforceScope: compliant caller returns scope.allowed unchanged', () => {
  const out = enforceScope({ stage: 'design' });
  assert.deepEqual(
    [...out],
    [...computeScope({ stage: 'design' }).allowed],
  );
});

test('enforceScope: Write on verify throws ValidationError TOOL_NOT_ALLOWED with context', () => {
  let caught: unknown = null;
  try {
    enforceScope({ stage: 'verify', additional: ['Write'] });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ValidationError, 'is ValidationError');
  assert.ok(caught instanceof GDDError, 'extends GDDError');
  const err = caught as ValidationError;
  assert.equal(err.code, 'TOOL_NOT_ALLOWED');
  assert.equal((err.context as { stage: string }).stage, 'verify');
  assert.equal((err.context as { tool: string }).tool, 'Write');
  assert.ok(
    Array.isArray((err.context as { allowed: unknown }).allowed),
    'allowed is an array in context',
  );
});

test('enforceScope: agent override permits Task on verify → passes', () => {
  const out = enforceScope({
    stage: 'verify',
    agentTools: ['Read', 'Task'],
    additional: ['Task'],
  });
  assert.ok(out.includes('Task'), 'Task allowed via override');
  // Default-verify Write would still throw — override doesn't leak.
  assert.throws(
    () =>
      enforceScope({
        stage: 'verify',
        agentTools: ['Read', 'Task'],
        additional: ['Write'],
      }),
    ValidationError,
  );
});

test('enforceScope: MCP tools in additional → pass + appended', () => {
  const out = enforceScope({
    stage: 'verify',
    additional: ['mcp__gdd_state__get', 'mcp__figma__export'],
  });
  assert.ok(out.includes('mcp__gdd_state__get'));
  assert.ok(out.includes('mcp__figma__export'));
});

test('enforceScope: unknown stage throws ValidationError INVALID_STAGE', () => {
  let caught: unknown = null;
  try {
    enforceScope({ stage: 'bogus' as Stage });
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ValidationError);
  assert.equal((caught as ValidationError).code, 'INVALID_STAGE');
});

test('enforceScope: error is ValidationError subclass of GDDError, not raw Error', () => {
  try {
    enforceScope({ stage: 'verify', additional: ['Edit'] });
    assert.fail('expected throw');
  } catch (err) {
    assert.ok(err instanceof ValidationError);
    assert.ok(err instanceof GDDError);
    assert.equal((err as ValidationError).name, 'ValidationError');
    // context is frozen per gdd-errors contract.
    assert.ok(Object.isFrozen((err as ValidationError).context));
  }
});
