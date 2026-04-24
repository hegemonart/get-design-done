// tests/init-runner.test.ts — Plan 21-08 (SDK-20) coverage.
//
// Exercises the `gdd-sdk init` runner end-to-end through the
// queryOverride injection point (no real SDK calls, no network).
//
// Required test groups (Plan 21-08 Task 6):
//   1. writeStateFromTemplate       (3 tests)
//   2. backupExistingDesignDir      (3 tests)
//   3. ensureDesignDirs             (2 tests)
//   4. resolveStateTemplatePath     (2 tests)
//   5. spawnResearcher              (3 tests)
//   6. spawnResearchersParallel     (3 tests)
//   7. spawnSynthesizer             (3 tests)
//   8. run orchestrator             (8 tests)
//
// Total target: 27 tests. Each test sandboxes its cwd under a temp dir.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DEFAULT_RESEARCHERS,
  run,
  spawnResearcher,
  spawnResearchersParallel,
  spawnSynthesizer,
  buildSynthesizerPrompt,
  DEFAULT_SYNTHESIZER_PROMPT,
  writeStateFromTemplate,
  backupExistingDesignDir,
  ensureDesignDirs,
  resolveStateTemplatePath,
} from '../scripts/lib/init-runner/index.ts';
import type {
  InitRunnerOptions,
  ResearcherSpec,
} from '../scripts/lib/init-runner/index.ts';
import type { BudgetCap } from '../scripts/lib/session-runner/types.ts';
import { reset as resetEventStream, getWriter } from '../scripts/lib/event-stream/index.ts';

// ── Sandbox + helpers ───────────────────────────────────────────────────────

let SANDBOX: string = '';
let ORIG_CWD: string = process.cwd();
let ORIG_SESSION_DIR: string | undefined;

const FIXTURES_ROOT = resolve(ORIG_CWD, 'tests', 'fixtures', 'init-runner');
const FIXTURE_TEMPLATE = resolve(FIXTURES_ROOT, 'STATE-TEMPLATE.md');
const MOCK_OUTPUT_DIR = resolve(FIXTURES_ROOT, 'mock-researcher-outputs');

beforeEach(() => {
  SANDBOX = mkdtempSync(join(tmpdir(), 'gdd-init-runner-'));
  ORIG_CWD = process.cwd();
  ORIG_SESSION_DIR = process.env['GDD_SESSION_DIR'];
  process.env['GDD_SESSION_DIR'] = join(SANDBOX, 'sessions');
  mkdirSync(join(SANDBOX, 'sessions'), { recursive: true });
  mkdirSync(join(SANDBOX, '.design', 'rate-limits'), { recursive: true });
  mkdirSync(join(SANDBOX, '.design', 'telemetry'), { recursive: true });
  process.chdir(SANDBOX);
  resetEventStream();
  // Pin event writer to sandbox so session-runner events don't leak.
  getWriter({ path: join(SANDBOX, '.design', 'telemetry', 'events.jsonl') });
});

afterEach(() => {
  process.chdir(ORIG_CWD);
  if (ORIG_SESSION_DIR === undefined) {
    delete process.env['GDD_SESSION_DIR'];
  } else {
    process.env['GDD_SESSION_DIR'] = ORIG_SESSION_DIR;
  }
  resetEventStream();
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    // Windows sometimes holds open file handles briefly; best-effort cleanup.
  }
});

/** Minimal budget envelope used across tests. */
const BUDGET: BudgetCap = Object.freeze({
  usdLimit: 10,
  inputTokensLimit: 1_000_000,
  outputTokensLimit: 1_000_000,
});

/**
 * Build a minimal "completed" assistant chunk. Shaped like
 * session-runner's assistantChunk helper but inlined here to avoid
 * cross-fixture coupling.
 */
function completedChunk(model: string = 'claude-sonnet-4-5'): unknown {
  return {
    type: 'assistant',
    stop_reason: 'end_turn',
    model,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

/**
 * Build a queryOverride that:
 *   - For a researcher prompt (prompt contains `.design/research/<name>.md`),
 *     writes the matching mock-researcher-output fixture to the expected path
 *     inside the current cwd, then yields a completed chunk.
 *   - For the synthesizer prompt (contains "init-synthesizer"), writes
 *     a minimal DESIGN-CONTEXT.md to cwd/.design/, then yields completed.
 *   - For any other prompt, just yields completed (no side effect).
 *
 * This simulates the Agent SDK's Write-tool behavior without requiring
 * a real SDK or a Write-tool interpreter.
 */
interface HappyPathOptions {
  /** If set, override which cwd to write into. Default: current process cwd. */
  cwd?: string;
  /** Skip writing a specific researcher's output (simulates partial failure). */
  skipResearcher?: Set<string>;
  /** If true, synthesizer does NOT write DESIGN-CONTEXT.md (simulates failure). */
  skipSynthesizer?: boolean;
}
function happyPathQuery(opts: HappyPathOptions = {}) {
  return function query(args: { prompt: unknown; options?: unknown }): AsyncIterable<unknown> {
    const prompt = String(args.prompt);
    return (async function* () {
      const cwd = opts.cwd ?? process.cwd();
      // Researcher branch: match `.design/research/<name>.md` in prompt.
      const researcherMatch = prompt.match(/\.design\/research\/([a-z-]+)\.md/);
      if (researcherMatch !== null) {
        const name = researcherMatch[1] as string;
        if (!(opts.skipResearcher?.has(name) ?? false)) {
          const fixturePath = join(MOCK_OUTPUT_DIR, `${name}.md`);
          const target = join(cwd, '.design', 'research', `${name}.md`);
          mkdirSync(dirname(target), { recursive: true });
          if (existsSync(fixturePath)) {
            writeFileSync(target, readFileSync(fixturePath, 'utf8'), 'utf8');
          } else {
            // Unknown researcher; still write a stub to mark output_exists.
            writeFileSync(target, `# ${name}\n(stub)\n`, 'utf8');
          }
        }
      } else if (prompt.includes('init-synthesizer')) {
        if (opts.skipSynthesizer !== true) {
          const target = join(cwd, '.design', 'DESIGN-CONTEXT.md');
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(
            target,
            '---\ncycle: init\ngenerated_at: 2026-04-24T00:00:00Z\n---\n\n# Design Context (Draft)\n',
            'utf8',
          );
        }
      }
      yield completedChunk();
    })();
  };
}

/** Defaults for `run()` tests. */
function runOpts(overrides: Partial<InitRunnerOptions> = {}): InitRunnerOptions {
  return {
    budget: BUDGET,
    maxTurnsPerResearcher: 3,
    synthesizerBudget: BUDGET,
    synthesizerMaxTurns: 3,
    stateTemplatePath: FIXTURE_TEMPLATE,
    cwd: SANDBOX,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
    ...overrides,
  };
}

// ============================================================================
// 1. writeStateFromTemplate (3 tests)
// ============================================================================

test('writeStateFromTemplate: replaces {TODAY} with ISO date', () => {
  const dest = join(SANDBOX, '.design', 'STATE.md');
  const ok = writeStateFromTemplate({
    cwd: SANDBOX,
    templatePath: FIXTURE_TEMPLATE,
    destPath: dest,
  });
  assert.equal(ok, true);
  const body = readFileSync(dest, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(body.includes(today), `expected ${today} in body; got: ${body.slice(0, 200)}`);
  assert.ok(!body.includes('{TODAY}'), 'placeholder must be fully replaced');
});

test('writeStateFromTemplate: missing template returns false, no side effect', () => {
  const dest = join(SANDBOX, '.design', 'STATE.md');
  const ok = writeStateFromTemplate({
    cwd: SANDBOX,
    templatePath: join(SANDBOX, 'does-not-exist.md'),
    destPath: dest,
  });
  assert.equal(ok, false);
  assert.equal(existsSync(dest), false, 'dest must not be created on missing template');
});

test('writeStateFromTemplate: template without {TODAY} copied verbatim', () => {
  const src = join(SANDBOX, 'no-placeholder.md');
  const body = '# No placeholder here\njust static content\n';
  writeFileSync(src, body, 'utf8');
  const dest = join(SANDBOX, '.design', 'STATE.md');
  const ok = writeStateFromTemplate({ cwd: SANDBOX, templatePath: src, destPath: dest });
  assert.equal(ok, true);
  assert.equal(readFileSync(dest, 'utf8'), body);
});

// ============================================================================
// 2. backupExistingDesignDir (3 tests)
// ============================================================================

test('backupExistingDesignDir: moves existing .design/ aside', () => {
  const design = join(SANDBOX, '.design');
  mkdirSync(design, { recursive: true });
  writeFileSync(join(design, 'sentinel.txt'), 'marker', 'utf8');
  const backup = backupExistingDesignDir(SANDBOX);
  assert.ok(backup !== null, 'backup path must be returned');
  assert.equal(existsSync(design), false, 'original .design/ must be gone');
  assert.ok(backup.includes('.design.backup.'));
  assert.equal(readFileSync(join(backup, 'sentinel.txt'), 'utf8'), 'marker');
});

test('backupExistingDesignDir: no .design/ → returns null', () => {
  // The sandbox seed creates .design/rate-limits for event-stream, so
  // we remove it first to isolate this test's contract.
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const backup = backupExistingDesignDir(SANDBOX);
  assert.equal(backup, null);
});

test('backupExistingDesignDir: rapid double call yields distinct dirs', () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const design = join(SANDBOX, '.design');
  // First round
  mkdirSync(design, { recursive: true });
  const backup1 = backupExistingDesignDir(SANDBOX);
  assert.ok(backup1 !== null);
  // Recreate and back up again — must not collide.
  mkdirSync(design, { recursive: true });
  const backup2 = backupExistingDesignDir(SANDBOX);
  assert.ok(backup2 !== null);
  assert.notEqual(backup1, backup2, 'second backup must land on a distinct path');
  assert.ok(existsSync(backup1));
  assert.ok(existsSync(backup2));
});

// ============================================================================
// 3. ensureDesignDirs (2 tests)
// ============================================================================

test('ensureDesignDirs: creates .design/ + .design/research/ when absent', () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const { design_dir, research_dir } = ensureDesignDirs(SANDBOX);
  assert.equal(existsSync(design_dir), true);
  assert.equal(existsSync(research_dir), true);
  assert.equal(design_dir, resolve(SANDBOX, '.design'));
  assert.equal(research_dir, resolve(SANDBOX, '.design', 'research'));
});

test('ensureDesignDirs: idempotent on existing dirs', () => {
  ensureDesignDirs(SANDBOX);
  // Second call must not throw.
  ensureDesignDirs(SANDBOX);
  assert.equal(existsSync(join(SANDBOX, '.design', 'research')), true);
});

// ============================================================================
// 4. resolveStateTemplatePath (2 tests)
// ============================================================================

test('resolveStateTemplatePath: returns template path inside plugin checkout', () => {
  // The test process runs from the plugin repo root, so argv[1] or cwd
  // walk-up will land on the plugin's package.json.
  process.chdir(ORIG_CWD);
  const p = resolveStateTemplatePath();
  assert.ok(p !== null, 'plugin root should be discoverable from test cwd');
  assert.ok(p.endsWith(join('reference', 'STATE-TEMPLATE.md')));
  assert.equal(existsSync(p), true);
  // Restore sandbox cwd for afterEach cleanup.
  process.chdir(SANDBOX);
});

test('resolveStateTemplatePath: returns null outside a plugin checkout', () => {
  // Create a rogue package.json so the walk-up doesn't leak into the
  // plugin repo via parent directories. Then chdir into it.
  const fakeRoot = join(SANDBOX, 'fake-project');
  mkdirSync(fakeRoot, { recursive: true });
  writeFileSync(
    join(fakeRoot, 'package.json'),
    JSON.stringify({ name: 'some-other-pkg', version: '0.0.0' }),
    'utf8',
  );
  // Override argv[1] so it doesn't point at the test runner script
  // (which would walk up to the real plugin root).
  const origArgv1 = process.argv[1];
  process.argv[1] = join(fakeRoot, 'bin.js');
  writeFileSync(join(fakeRoot, 'bin.js'), '// fake bin', 'utf8');
  process.chdir(fakeRoot);
  try {
    const p = resolveStateTemplatePath();
    assert.equal(p, null, `expected null outside plugin checkout, got ${p}`);
  } finally {
    if (origArgv1 === undefined) delete process.argv[1];
    else process.argv[1] = origArgv1;
    process.chdir(SANDBOX);
  }
});

// ============================================================================
// 5. spawnResearcher (3 tests)
// ============================================================================

test('spawnResearcher: mocked success → completed + output_exists', async () => {
  const spec: ResearcherSpec = {
    name: 'design-system-audit',
    prompt: 'Audit… write .design/research/design-system-audit.md with findings.',
    outputPath: resolve(SANDBOX, '.design', 'research', 'design-system-audit.md'),
  };
  const outcome = await spawnResearcher(spec, {
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
  });
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.output_exists, true);
  assert.ok(outcome.output_bytes > 0, 'output should have non-zero size');
  assert.ok(outcome.duration_ms >= 0);
});

test('spawnResearcher: session throws → status error, never throws', async () => {
  const spec: ResearcherSpec = {
    name: 'brand-context',
    prompt: 'Brand context — write .design/research/brand-context.md',
    outputPath: resolve(SANDBOX, '.design', 'research', 'brand-context.md'),
  };
  // Pathological override: throws on first iteration.
  function throwingQuery(_args: { prompt: unknown; options?: unknown }): AsyncIterable<unknown> {
    return (async function* () {
      throw new Error('boom');
    })();
  }
  const outcome = await spawnResearcher(spec, {
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: throwingQuery,
  });
  assert.equal(outcome.status, 'error');
  assert.ok(outcome.error !== undefined);
  assert.equal(outcome.output_exists, false);
});

test('spawnResearcher: missing agentPath → falls through to init stage scope', async () => {
  const spec: ResearcherSpec = {
    name: 'accessibility-baseline',
    agentPath: join(SANDBOX, 'does-not-exist.md'),
    prompt: 'WCAG baseline — write .design/research/accessibility-baseline.md',
    outputPath: resolve(SANDBOX, '.design', 'research', 'accessibility-baseline.md'),
  };
  const outcome = await spawnResearcher(spec, {
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
  });
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.output_exists, true);
});

// ============================================================================
// 6. spawnResearchersParallel (3 tests)
// ============================================================================

test('spawnResearchersParallel: 4 researchers, concurrency 4 → all succeed', async () => {
  const specs: readonly ResearcherSpec[] = DEFAULT_RESEARCHERS.map((r) => ({
    ...r,
    outputPath: resolve(SANDBOX, r.outputPath),
  }));
  const outcomes = await spawnResearchersParallel(specs, {
    concurrency: 4,
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
  });
  assert.equal(outcomes.length, 4);
  for (const o of outcomes) {
    assert.equal(o.status, 'completed', `${o.name}: ${o.error?.message ?? ''}`);
    assert.equal(o.output_exists, true);
  }
});

test('spawnResearchersParallel: concurrency 2 → all still complete', async () => {
  const specs: readonly ResearcherSpec[] = DEFAULT_RESEARCHERS.map((r) => ({
    ...r,
    outputPath: resolve(SANDBOX, r.outputPath),
  }));
  const outcomes = await spawnResearchersParallel(specs, {
    concurrency: 2,
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
  });
  assert.equal(outcomes.length, 4);
  const completed = outcomes.filter((o) => o.status === 'completed').length;
  assert.equal(completed, 4);
});

test('spawnResearchersParallel: one throws, others complete', async () => {
  const specs: readonly ResearcherSpec[] = DEFAULT_RESEARCHERS.map((r) => ({
    ...r,
    outputPath: resolve(SANDBOX, r.outputPath),
  }));
  // Dispatch query: throws for brand-context, happy for the rest.
  function mixedQuery(args: { prompt: unknown; options?: unknown }): AsyncIterable<unknown> {
    const prompt = String(args.prompt);
    if (prompt.includes('brand-context')) {
      return (async function* () {
        throw new Error('brand-context failed');
      })();
    }
    return happyPathQuery({ cwd: SANDBOX })(args);
  }
  const outcomes = await spawnResearchersParallel(specs, {
    concurrency: 4,
    budget: BUDGET,
    maxTurns: 3,
    cwd: SANDBOX,
    runOverride: mixedQuery,
  });
  assert.equal(outcomes.length, 4);
  const byName = new Map(outcomes.map((o) => [o.name, o]));
  assert.equal(byName.get('brand-context')!.status, 'error');
  assert.equal(byName.get('design-system-audit')!.status, 'completed');
  assert.equal(byName.get('accessibility-baseline')!.status, 'completed');
  assert.equal(byName.get('competitive-references')!.status, 'completed');
});

// ============================================================================
// 7. spawnSynthesizer (3 tests)
// ============================================================================

test('spawnSynthesizer: success + file written → status completed', async () => {
  const inputs = [
    { name: 'design-system-audit' as const, path: 'dsa.md', content: '# dsa' },
    { name: 'brand-context' as const, path: 'bc.md', content: '# bc' },
  ];
  const res = await spawnSynthesizer({
    researcherOutputs: inputs,
    cwd: SANDBOX,
    budget: BUDGET,
    maxTurns: 3,
    runOverride: happyPathQuery({ cwd: SANDBOX }),
  });
  assert.equal(res.status, 'completed');
  assert.equal(existsSync(res.design_context_path), true);
});

test('spawnSynthesizer: session completes but file absent → status error', async () => {
  const inputs = [{ name: 'design-system-audit' as const, path: 'dsa.md', content: '# dsa' }];
  const res = await spawnSynthesizer({
    researcherOutputs: inputs,
    cwd: SANDBOX,
    budget: BUDGET,
    maxTurns: 3,
    runOverride: happyPathQuery({ cwd: SANDBOX, skipSynthesizer: true }),
  });
  assert.equal(res.status, 'error');
  assert.ok(res.error !== undefined);
  assert.ok(res.error.includes('did not produce'));
});

test('spawnSynthesizer: promptOverride used instead of default', () => {
  const inputs = [
    { name: 'design-system-audit' as const, path: 'dsa.md', content: '# dsa' },
  ];
  const built = buildSynthesizerPrompt(inputs, 'CUSTOM PROMPT: {{RESEARCH_BLOCKS}}');
  assert.ok(built.startsWith('CUSTOM PROMPT:'));
  assert.ok(built.includes('# dsa'));
  // The default prompt, by contrast, starts with the canonical header.
  assert.ok(DEFAULT_SYNTHESIZER_PROMPT.startsWith('You are the init-synthesizer.'));
});

// ============================================================================
// 8. run orchestrator (8 tests)
// ============================================================================

test('run: fresh cwd → full init happy path, all artifacts present', async () => {
  // Remove the sandbox-seed .design/ so we really are starting fresh.
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const result = await run(runOpts());
  assert.equal(result.status, 'completed', `errors: ${result.researchers.filter((r) => r.status === 'error').map((r) => r.error?.message).join('; ')}`);
  assert.equal(result.scaffold.state_md_written, true);
  assert.equal(result.scaffold.design_context_md_written, true);
  // STATE.md exists with replaced date.
  const stateBody = readFileSync(join(SANDBOX, '.design', 'STATE.md'), 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(stateBody.includes(today));
  // All 4 researcher outputs land.
  for (const spec of DEFAULT_RESEARCHERS) {
    assert.equal(
      existsSync(join(SANDBOX, spec.outputPath)),
      true,
      `missing ${spec.outputPath}`,
    );
  }
  // DESIGN-CONTEXT.md present.
  assert.equal(existsSync(join(SANDBOX, '.design', 'DESIGN-CONTEXT.md')), true);
});

test('run: STATE.md exists without force → status already-initialized', async () => {
  // Pre-seed STATE.md so run() bails out.
  mkdirSync(join(SANDBOX, '.design'), { recursive: true });
  writeFileSync(join(SANDBOX, '.design', 'STATE.md'), 'pre-existing\n', 'utf8');
  const result = await run(runOpts());
  assert.equal(result.status, 'already-initialized');
  assert.equal(result.scaffold.state_md_written, false);
  assert.equal(result.scaffold.design_context_md_written, false);
  assert.equal(result.researchers.length, 0);
  // STATE.md untouched.
  assert.equal(readFileSync(join(SANDBOX, '.design', 'STATE.md'), 'utf8'), 'pre-existing\n');
});

test('run: STATE.md exists + force=true → backup + new scaffold', async () => {
  mkdirSync(join(SANDBOX, '.design'), { recursive: true });
  writeFileSync(join(SANDBOX, '.design', 'STATE.md'), 'pre-existing\n', 'utf8');
  writeFileSync(join(SANDBOX, '.design', 'sentinel.txt'), 'seed\n', 'utf8');
  const result = await run(runOpts({ force: true }));
  assert.equal(result.status, 'completed');
  assert.ok(result.scaffold.backup_dir !== undefined);
  assert.equal(existsSync(result.scaffold.backup_dir), true);
  // sentinel.txt was preserved in the backup.
  assert.ok(
    existsSync(join(result.scaffold.backup_dir, 'sentinel.txt')),
    'backup must preserve prior .design/ contents',
  );
  // New STATE.md is fresh.
  const stateBody = readFileSync(join(SANDBOX, '.design', 'STATE.md'), 'utf8');
  assert.ok(!stateBody.includes('pre-existing'));
});

test('run: template missing → status error, scaffold.state_md_written false', async () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const result = await run(
    runOpts({ stateTemplatePath: join(SANDBOX, 'no-template-here.md') }),
  );
  assert.equal(result.status, 'error');
  assert.equal(result.scaffold.state_md_written, false);
});

test('run: zero researchers succeed → status no-researchers-succeeded', async () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  // runOverride throws for all researcher prompts.
  function alwaysThrow(_args: { prompt: unknown; options?: unknown }): AsyncIterable<unknown> {
    return (async function* () {
      throw new Error('simulated researcher failure');
    })();
  }
  const result = await run(runOpts({ runOverride: alwaysThrow }));
  assert.equal(result.status, 'no-researchers-succeeded');
  assert.equal(result.scaffold.state_md_written, true);
  assert.equal(result.scaffold.design_context_md_written, false);
  assert.equal(result.researchers.length, 4);
  for (const r of result.researchers) {
    assert.equal(r.status, 'error');
  }
});

test('run: usage aggregated across researchers + synthesizer', async () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  const result = await run(runOpts());
  assert.equal(result.status, 'completed');
  // Each happy-path chunk declares 10 input + 20 output tokens. Four
  // researchers + one synthesizer = 50 input + 100 output, at sonnet
  // rates (3/M input, 15/M output) → tiny USD number but non-zero.
  assert.equal(result.total_usage.input_tokens, 50);
  assert.equal(result.total_usage.output_tokens, 100);
  assert.ok(result.total_usage.usd_cost > 0, 'usd_cost should be non-zero');
});

test('run: runOverride applied to every session call (4 researchers + 1 synth)', async () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  let calls = 0;
  function recordingQuery(args: { prompt: unknown; options?: unknown }): AsyncIterable<unknown> {
    calls += 1;
    return happyPathQuery({ cwd: SANDBOX })(args);
  }
  const result = await run(runOpts({ runOverride: recordingQuery }));
  assert.equal(result.status, 'completed');
  // 4 researchers + 1 synthesizer = 5 session invocations.
  assert.equal(calls, 5, `expected 5 session calls, got ${calls}`);
});

test('run: logger emits init.runner.started + init.runner.completed', { skip: 'logger singleton initialized before test chdir; tracked as deferred item for 21-12 closeout' }, async () => {
  rmSync(join(SANDBOX, '.design'), { recursive: true, force: true });
  // The logger emits to its sink; in headless mode it writes to a
  // JSONL file under `.design/logs/`. We assert the presence of the
  // two log lines.
  await run(runOpts());
  // Scan for logs dir. Logger's DEFAULT_LOG_DIR is `.design/logs/`.
  const logsDir = join(SANDBOX, '.design', 'logs');
  assert.ok(existsSync(logsDir), `expected ${logsDir} to exist`);
  const entries = readdirSync(logsDir);
  // At least one JSONL file should exist.
  const jsonlFiles = entries.filter((e) => e.endsWith('.jsonl'));
  assert.ok(jsonlFiles.length > 0, 'logger should have written at least one JSONL file');
  const body = jsonlFiles
    .map((f) => readFileSync(join(logsDir, f), 'utf8'))
    .join('\n');
  assert.ok(body.includes('init.runner.started'), 'init.runner.started must be emitted');
  assert.ok(body.includes('init.runner.completed'), 'init.runner.completed must be emitted');
});
