// tests/hooks-ts-rewrite.test.ts — Plan 20-13.
//
// Validates the TS rewrite of the three runtime hooks:
//   * hooks/budget-enforcer.ts          (PreToolUse:Agent)
//   * hooks/context-exhaustion.ts       (PostToolUse, any tool)
//   * hooks/gdd-read-injection-scanner.ts (PostToolUse:Read)
//
// Suite coverage:
//   1. File layout — .ts exists, .js deleted, hooks.json entries are .ts.
//   2. Behavior equivalence — feed each fixture stdin into the hook via
//      `node --experimental-strip-types <hook>.ts` and assert the
//      resulting stdout shape against the expected fixture.
//   3. Event emission — every hook invocation under a temp telemetry
//      dir produces a hook.fired event in events.jsonl.
//   4. Budget schema — reference/schemas/budget.schema.json is Draft-07
//      and BudgetSchema exists in the codegen output.
//   5. Reflector migration — design-reflector.md contains the
//      Event-Stream Mode section.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { REPO_ROOT } from './helpers.ts';

// ── paths ───────────────────────────────────────────────────────────────────

const HOOKS_DIR = join(REPO_ROOT, 'hooks');
const BUDGET_HOOK = join(HOOKS_DIR, 'budget-enforcer.ts');
const CONTEXT_HOOK = join(HOOKS_DIR, 'context-exhaustion.ts');
const INJECTION_HOOK = join(HOOKS_DIR, 'gdd-read-injection-scanner.ts');
const HOOKS_JSON = join(HOOKS_DIR, 'hooks.json');
const FIXTURES_DIR = join(REPO_ROOT, 'tests', 'fixtures', 'hooks');

const BUDGET_SCHEMA = join(
  REPO_ROOT,
  'reference',
  'schemas',
  'budget.schema.json',
);
const GENERATED_DTS = join(
  REPO_ROOT,
  'reference',
  'schemas',
  'generated.d.ts',
);
const REFLECTOR_PATH = join(REPO_ROOT, 'agents', 'design-reflector.md');

// ── harness ─────────────────────────────────────────────────────────────────

interface RunResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

/**
 * Run a hook script via `node --experimental-strip-types <hook>` with the
 * given stdin payload. Returns the structured result; no assertion here.
 *
 * We route cwd through a temp dir so the hook writes its event stream
 * to `<tmp>/.design/telemetry/events.jsonl` rather than polluting the
 * repo's real telemetry. Callers pass `tmpCwd` for that isolation.
 */
function runHook(hookPath: string, stdin: string, tmpCwd: string): RunResult {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', hookPath],
    {
      input: stdin,
      encoding: 'utf8',
      timeout: 15000,
      cwd: tmpCwd,
      // Inherit PATH (Windows `spawn` needs it) but nothing else — mirrors
      // IN-02 minimal-env posture used by the budget-enforcer aggregator.
      env: {
        ...(typeof process.env['PATH'] === 'string'
          ? { PATH: process.env['PATH'] }
          : {}),
        ...(typeof process.env['SystemRoot'] === 'string'
          ? { SystemRoot: process.env['SystemRoot'] }
          : {}),
      },
    },
  );
  return {
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    status: r.status,
  };
}

function makeTempCwd(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  // Prime .design/ so the hook's telemetry writes land somewhere.
  mkdirSync(join(dir, '.design', 'telemetry'), { recursive: true });
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

function readFixture<T>(name: string): T {
  const abs = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(abs, 'utf8')) as T;
}

function readEventsJsonl(tmpCwd: string): unknown[] {
  const p = join(tmpCwd, '.design', 'telemetry', 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as unknown);
}

interface HookFiredEventLike {
  type: string;
  payload?: { hook?: string; decision?: string };
}

function findHookFired(
  events: unknown[],
  hookName: string,
): HookFiredEventLike | null {
  for (const ev of events) {
    if (typeof ev !== 'object' || ev === null) continue;
    const e = ev as HookFiredEventLike;
    if (e.type === 'hook.fired' && e.payload?.hook === hookName) return e;
  }
  return null;
}

// ── Suite 1: file layout ────────────────────────────────────────────────────

test('hooks-ts-rewrite: all three .ts hooks exist under hooks/', () => {
  assert.ok(existsSync(BUDGET_HOOK), `missing: ${BUDGET_HOOK}`);
  assert.ok(existsSync(CONTEXT_HOOK), `missing: ${CONTEXT_HOOK}`);
  assert.ok(existsSync(INJECTION_HOOK), `missing: ${INJECTION_HOOK}`);
});

test('hooks-ts-rewrite: legacy .js hooks are deleted', () => {
  assert.ok(
    !existsSync(join(HOOKS_DIR, 'budget-enforcer.js')),
    'hooks/budget-enforcer.js should be deleted',
  );
  assert.ok(
    !existsSync(join(HOOKS_DIR, 'context-exhaustion.js')),
    'hooks/context-exhaustion.js should be deleted',
  );
  assert.ok(
    !existsSync(join(HOOKS_DIR, 'gdd-read-injection-scanner.js')),
    'hooks/gdd-read-injection-scanner.js should be deleted',
  );
});

test('hooks-ts-rewrite: Plan 20-13 owned hooks use .ts + --experimental-strip-types', () => {
  const raw = readFileSync(HOOKS_JSON, 'utf8');
  const data = JSON.parse(raw) as { hooks: Record<string, unknown[]> };

  // Flatten every command string under hooks.{PreToolUse,PostToolUse}.
  const commands: string[] = [];
  for (const key of ['PreToolUse', 'PostToolUse']) {
    const entries = data.hooks[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const e = entry as { hooks?: Array<{ type?: string; command?: string }> };
      for (const h of e.hooks ?? []) {
        if (h.type === 'command' && typeof h.command === 'string') {
          commands.push(h.command);
        }
      }
    }
  }

  // Plan 20-13 owns exactly these three hooks. Hooks added by other
  // phases (e.g. gdd-bash-guard.js, gdd-protected-paths.js) are owned
  // by those phases' migration timelines and may still be .js here.
  const owned = [
    'budget-enforcer',
    'context-exhaustion',
    'gdd-read-injection-scanner',
  ];
  for (const base of owned) {
    const matches = commands.filter((c) => c.includes(`/hooks/${base}.`));
    assert.ok(
      matches.length >= 1,
      `hooks.json must register /hooks/${base}.ts via node --experimental-strip-types`,
    );
    for (const cmd of matches) {
      assert.ok(
        cmd.includes(`/hooks/${base}.ts`),
        `Plan 20-13 owned hook ${base} must reference .ts, got: ${cmd}`,
      );
      assert.ok(
        !cmd.includes(`/hooks/${base}.js`),
        `Plan 20-13 owned hook ${base} must not reference .js, got: ${cmd}`,
      );
      assert.ok(
        /--experimental-strip-types/.test(cmd),
        `Plan 20-13 owned hook ${base} must use --experimental-strip-types: ${cmd}`,
      );
    }
  }
});

// ── Suite 2: behavior equivalence via fixtures ──────────────────────────────

test('hooks-ts-rewrite: budget-enforcer allow-path produces continue:true + modified_tool_input', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-budget-allow-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'budget-enforcer-allow.stdin.json'),
      'utf8',
    );
    const expected = readFixture<{
      continue: boolean;
      suppressOutput: boolean;
      modified_tool_input: Record<string, unknown>;
    }>('budget-enforcer-allow.expected.stdout.json');

    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    assert.ok(r.stdout.length > 0, 'expected stdout payload');

    const parsed = JSON.parse(r.stdout) as {
      continue: boolean;
      suppressOutput: boolean;
      modified_tool_input?: Record<string, unknown>;
    };
    assert.equal(parsed.continue, expected.continue);
    assert.equal(parsed.suppressOutput, expected.suppressOutput);
    assert.ok(parsed.modified_tool_input, 'expected modified_tool_input');
    assert.equal(
      parsed.modified_tool_input?.['subagent_type'],
      expected.modified_tool_input['subagent_type'],
    );
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: budget-enforcer block-path produces continue:false + budget-cap message', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-budget-block-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'budget-enforcer-block.stdin.json'),
      'utf8',
    );
    const expected = readFixture<{
      continue: boolean;
      suppressOutput: boolean;
      message_pattern: string;
    }>('budget-enforcer-block.expected.stdout.json');

    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as {
      continue: boolean;
      suppressOutput: boolean;
      message?: string;
    };
    assert.equal(parsed.continue, expected.continue);
    assert.equal(parsed.suppressOutput, expected.suppressOutput);
    assert.ok(
      typeof parsed.message === 'string' &&
        parsed.message.includes(expected.message_pattern),
      `expected message to include "${expected.message_pattern}" (got: ${parsed.message ?? 'undefined'})`,
    );
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: context-exhaustion below-threshold produces empty stdout', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-ctx-ok-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'context-exhaustion-ok.stdin.json'),
      'utf8',
    );

    const r = runHook(CONTEXT_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    assert.equal(
      r.stdout.trim(),
      '',
      `expected empty stdout (got: ${r.stdout})`,
    );
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: gdd-read-injection-scanner clean content produces empty stdout', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-scan-clean-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'gdd-read-injection-scanner-clean.stdin.json'),
      'utf8',
    );

    const r = runHook(INJECTION_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    assert.equal(
      r.stdout.trim(),
      '',
      `expected empty stdout (got: ${r.stdout})`,
    );
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: gdd-read-injection-scanner matched content produces warning message', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-scan-blocked-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'gdd-read-injection-scanner-blocked.stdin.json'),
      'utf8',
    );
    const expected = readFixture<{
      continue: boolean;
      suppressOutput: boolean;
      message_pattern: string;
    }>('gdd-read-injection-scanner-blocked.expected.stdout.json');

    const r = runHook(INJECTION_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as {
      continue: boolean;
      suppressOutput: boolean;
      message?: string;
    };
    assert.equal(parsed.continue, expected.continue);
    assert.equal(parsed.suppressOutput, expected.suppressOutput);
    assert.ok(
      typeof parsed.message === 'string' &&
        parsed.message.includes(expected.message_pattern),
      `expected message to include "${expected.message_pattern}" (got: ${parsed.message ?? 'undefined'})`,
    );
  } finally {
    cleanup();
  }
});

// ── Suite 3: event-stream emission ──────────────────────────────────────────

test('hooks-ts-rewrite: budget-enforcer emits hook.fired event on allow path', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-budget-event-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'budget-enforcer-allow.stdin.json'),
      'utf8',
    );
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0);

    const events = readEventsJsonl(dir);
    const fired = findHookFired(events, 'budget-enforcer');
    assert.ok(fired !== null, 'expected a hook.fired event from budget-enforcer');
    assert.ok(
      ['allow', 'log', 'warn', 'downgrade'].includes(fired?.payload?.decision ?? ''),
      `unexpected decision: ${fired?.payload?.decision ?? 'undefined'}`,
    );
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: budget-enforcer emits hook.fired event with decision=block on cap breach', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-budget-block-event-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'budget-enforcer-block.stdin.json'),
      'utf8',
    );
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0);

    const events = readEventsJsonl(dir);
    const fired = findHookFired(events, 'budget-enforcer');
    assert.ok(fired !== null, 'expected a hook.fired event');
    assert.equal(fired?.payload?.decision, 'block');
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: context-exhaustion emits hook.fired event with decision=ok', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-ctx-event-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'context-exhaustion-ok.stdin.json'),
      'utf8',
    );
    const r = runHook(CONTEXT_HOOK, stdin, dir);
    assert.equal(r.status, 0);

    const events = readEventsJsonl(dir);
    const fired = findHookFired(events, 'context-exhaustion');
    assert.ok(fired !== null, 'expected a hook.fired event');
    assert.equal(fired?.payload?.decision, 'ok');
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: gdd-read-injection-scanner emits hook.fired event with decision=allow on clean', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-scan-clean-event-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'gdd-read-injection-scanner-clean.stdin.json'),
      'utf8',
    );
    const r = runHook(INJECTION_HOOK, stdin, dir);
    assert.equal(r.status, 0);

    const events = readEventsJsonl(dir);
    const fired = findHookFired(events, 'gdd-read-injection-scanner');
    assert.ok(fired !== null, 'expected a hook.fired event');
    assert.equal(fired?.payload?.decision, 'allow');
  } finally {
    cleanup();
  }
});

test('hooks-ts-rewrite: gdd-read-injection-scanner emits hook.fired event with decision=block on match', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-scan-block-event-');
  try {
    const stdin = readFileSync(
      join(FIXTURES_DIR, 'gdd-read-injection-scanner-blocked.stdin.json'),
      'utf8',
    );
    const r = runHook(INJECTION_HOOK, stdin, dir);
    assert.equal(r.status, 0);

    const events = readEventsJsonl(dir);
    const fired = findHookFired(events, 'gdd-read-injection-scanner');
    assert.ok(fired !== null, 'expected a hook.fired event');
    assert.equal(fired?.payload?.decision, 'block');
  } finally {
    cleanup();
  }
});

// ── Suite 4: budget schema ──────────────────────────────────────────────────

test('hooks-ts-rewrite: reference/schemas/budget.schema.json is a valid Draft-07 schema', () => {
  assert.ok(existsSync(BUDGET_SCHEMA), `missing: ${BUDGET_SCHEMA}`);
  const raw = readFileSync(BUDGET_SCHEMA, 'utf8');
  const parsed = JSON.parse(raw) as {
    $schema?: string;
    type?: string;
    title?: string;
    properties?: Record<string, unknown>;
  };
  assert.ok(
    typeof parsed.$schema === 'string' && /draft-07/.test(parsed.$schema),
    'schema must declare $schema: http://json-schema.org/draft-07/schema#',
  );
  assert.equal(parsed.type, 'object');
  assert.ok(parsed.properties, 'schema must declare properties');
  // Key fields the hook consumes:
  for (const f of [
    'per_task_cap_usd',
    'per_phase_cap_usd',
    'tier_overrides',
    'auto_downgrade_on_cap',
    'cache_ttl_seconds',
    'enforcement_mode',
  ]) {
    assert.ok(
      parsed.properties?.[f],
      `budget schema must declare property "${f}"`,
    );
  }
});

test('hooks-ts-rewrite: generated.d.ts exports BudgetSchema', () => {
  assert.ok(existsSync(GENERATED_DTS), `missing: ${GENERATED_DTS}`);
  const raw = readFileSync(GENERATED_DTS, 'utf8');
  assert.ok(
    /export\s+(interface|type)\s+BudgetSchema\b/.test(raw) ||
      /export\s+type\s+BudgetSchema\s*=/.test(raw),
    'generated.d.ts must export BudgetSchema',
  );
});

// ── Suite 5: reflector event-stream mode ────────────────────────────────────

test('hooks-ts-rewrite: design-reflector.md contains Event-Stream Mode section', () => {
  const body = readFileSync(REFLECTOR_PATH, 'utf8');
  assert.ok(
    /##\s+Event-Stream Mode \(Phase 20 onwards\)/.test(body),
    'design-reflector.md must have an "Event-Stream Mode (Phase 20 onwards)" section',
  );
  assert.ok(
    /reflection\.proposal/.test(body),
    'Event-Stream Mode section must reference reflection.proposal event type',
  );
  assert.ok(
    /events\.jsonl/.test(body),
    'Event-Stream Mode section must reference events.jsonl',
  );
});

// Silence unused-import warning — `sep` is imported for future portability
// but not currently used. Reference it so strict mode stays quiet.
void sep;
void mkdirSync;
void writeFileSync;
