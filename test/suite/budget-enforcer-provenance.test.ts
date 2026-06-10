// tests/budget-enforcer-provenance.test.ts | Phase 59.5 P1.
//
// Covers the runtime-model BYOK/unverified provenance guard added in
// Phase 59.5:
//
//   1. reference/schemas/runtime-models.schema.json accepts an OPTIONAL
//      `status` enum ("verified" | "byok" | "unverified") on a runtime
//      entry — a row that omits `status` is still shape-valid, and a row
//      carrying an out-of-enum value is rejected.
//   2. hooks/budget-enforcer.ts does NOT hard-block a spawn whose resolved
//      per-runtime model comes from a byok/unverified runtime row, even
//      when the estimated cost is over the per-task cap. A verified runtime
//      under the identical over-cap scenario still hard-blocks (control).
//
// The hook is spawned for real (node --experimental-strip-types) against a
// throw-away `.design/` scaffold in an isolated temp dir, mirroring
// test/suite/budget-enforcer-resilience.test.ts. No fixtures are written
// into the real repo tree.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

/** Walk up to the repo root — same scheme as the resilience test. */
function findRepoRoot(): string {
  let dir: string = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      const pkgPath: string = join(dir, 'package.json');
      const pkg: { name?: string } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch {
      // not this level
    }
    const parent: string = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd());
}

const REPO_ROOT = findRepoRoot();
const BUDGET_HOOK = join(REPO_ROOT, 'hooks', 'budget-enforcer.ts');
const SCHEMA_PATH = join(REPO_ROOT, 'reference', 'schemas', 'runtime-models.schema.json');

interface HookResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runHook(stdin: string, cwd: string): HookResult {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', BUDGET_HOOK],
    {
      cwd,
      input: stdin,
      encoding: 'utf8',
      // GDD_NO_AGGREGATOR: suppress the detached aggregator child so it
      // doesn't hold the temp cwd open and trip a Windows EPERM on teardown.
      env: { ...process.env, GDD_TEST_MODE: '1', GDD_NO_AGGREGATOR: '1' },
    },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

/**
 * Build an Agent stdin envelope. `runtime` is threaded onto
 * tool_input.context.router_decision.runtime, which is the precedence the
 * hook's provenance guard (and cost-recording block) read first.
 */
function agentStdin(runtime: string, estCostUsd: number): string {
  return JSON.stringify({
    tool_name: 'Agent',
    tool_input: {
      subagent_type: 'design-verifier',
      _est_cost_usd: estCostUsd,
      _tokens_in_est: 100,
      _tokens_out_est: 100,
      context: { router_decision: { runtime } },
    },
  });
}

/** Scaffold a temp `.design/` with STATE.md + a tiny per-task budget cap. */
function scaffold(prefix: string, perTaskCapUsd: number): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');
  writeFileSync(
    join(dir, '.design', 'budget.json'),
    JSON.stringify({
      per_task_cap_usd: perTaskCapUsd,
      per_phase_cap_usd: 1000,
      enforcement_mode: 'enforce',
      auto_downgrade_on_cap: false,
      project_cap_usd: 0,
    }),
  );
  return {
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

// ── (1) schema accepts the optional `status` enum ────────────────────────────

test('runtime-models schema: defines an optional status enum of the three allowed values', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as {
    definitions: {
      runtimeEntry: {
        required: string[];
        properties: { status?: { enum?: string[] } };
      };
    };
  };
  const statusProp = schema.definitions.runtimeEntry.properties.status;
  assert.ok(statusProp, 'runtimeEntry must declare a `status` property');
  assert.deepEqual(
    [...(statusProp.enum ?? [])].sort(),
    ['byok', 'unverified', 'verified'],
    'status enum must be exactly verified|byok|unverified',
  );
  assert.ok(
    !schema.definitions.runtimeEntry.required.includes('status'),
    'status must be OPTIONAL so verified rows may omit it',
  );
});

test('runtime-models schema: Ajv accepts a row with status and a row without it; rejects a bad value', () => {
  // Ajv is a devDependency; if it cannot be resolved offline, fall back to a
  // structural assertion (the enum-shape test above already covers the schema
  // contract). This keeps the test deterministic in a sandboxed environment.
  // createRequire is anchored on a repo filesystem path (not import.meta) so
  // this file stays CommonJS-compatible under the Node16 tsconfig.
  let Ajv: unknown;
  try {
    const req = createRequire(join(REPO_ROOT, 'package.json'));
    Ajv = req('ajv');
  } catch {
    Ajv = null;
  }
  if (Ajv === null) {
    assert.ok(true, 'ajv unavailable offline — structural enum test covers the contract');
    return;
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object;
  // Compile the WHOLE schema (so the `$ref: #/definitions/modelRow` refs
  // resolve) and validate a full document carrying a single runtime entry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ajv = new (Ajv as any)({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const entry = (status?: string): Record<string, unknown> => ({
    id: 'cline',
    ...(status !== undefined ? { status } : {}),
    tier_to_model: { opus: { model: 'x' }, sonnet: { model: 'x' }, haiku: { model: 'x' } },
    reasoning_class_to_model: { high: { model: 'x' }, medium: { model: 'x' }, low: { model: 'x' } },
    provenance: [
      { source_url: 'x', retrieved_at: '2026-04-29T00:00:00.000Z', last_validated_cycle: 'c' },
    ],
  });
  const doc = (status?: string): Record<string, unknown> => ({
    $schema_version: 1,
    runtimes: [entry(status)],
  });

  assert.equal(validate(doc('byok')), true, 'status: byok must validate');
  assert.equal(validate(doc('verified')), true, 'status: verified must validate');
  assert.equal(validate(doc(undefined)), true, 'omitting status must validate (optional)');
  assert.equal(
    validate(doc('not-a-real-status')),
    false,
    'an out-of-enum status must be rejected',
  );
});

// ── (2) the hook degrades hard enforcement for unverified runtimes ───────────

test('budget-enforcer: an unverified/byok runtime over the per-task cap does NOT hard-block', () => {
  const { dir, cleanup } = scaffold('gdd-prov-byok-', 0.01);
  try {
    // estCost 5.00 >> per_task_cap 0.01 → would hard-block a verified runtime.
    // `cline` is a byok runtime (status: byok), so the guard degrades the
    // hard cap to advisory and the spawn proceeds.
    const r = runHook(agentStdin('cline', 5.0), dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean; stopReason?: string };
    assert.equal(
      parsed.continue,
      true,
      `byok runtime must not be hard-blocked; got stopReason=${parsed.stopReason ?? 'undefined'}`,
    );
    assert.ok(
      r.stderr.includes('degraded to advisory') || r.stderr.includes('BYOK/unverified'),
      `expected an advisory-degradation warning on stderr, got: ${r.stderr}`,
    );
  } finally { cleanup(); }
});

test('budget-enforcer: a verified runtime over the per-task cap STILL hard-blocks (control)', () => {
  const { dir, cleanup } = scaffold('gdd-prov-verified-', 0.01);
  try {
    // Same over-cap scenario, but `claude` is verified → full hard enforcement.
    const r = runHook(agentStdin('claude', 5.0), dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean; stopReason?: string };
    assert.equal(parsed.continue, false, 'verified runtime over cap must still hard-block');
    assert.ok(
      typeof parsed.stopReason === 'string' && parsed.stopReason.includes('Budget cap reached'),
      `expected a budget-cap stopReason, got: ${parsed.stopReason ?? 'undefined'}`,
    );
  } finally { cleanup(); }
});

test('budget-enforcer: an unverified runtime UNDER the per-task cap proceeds normally (no false advisory)', () => {
  const { dir, cleanup } = scaffold('gdd-prov-under-', 100);
  try {
    // estCost 0.01 well under cap 100 → no cap pressure at all. The guard must
    // not invent a block, and there is nothing to degrade.
    const r = runHook(agentStdin('cline', 0.01), dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean };
    assert.equal(parsed.continue, true, 'under-cap spawn must proceed');
  } finally { cleanup(); }
});
