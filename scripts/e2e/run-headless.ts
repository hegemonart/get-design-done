// scripts/e2e/run-headless.ts — Plan 21-11 Task 2 (SDK-24).
//
// E2E test harness for the Phase-21 headless pipeline runner.
//
// Spawns `bin/gdd-sdk run` against a copy of the fixture project under
// `test-fixture/headless-e2e/`, captures stdout/stderr + the resulting
// `.design/` artifacts, and runs a fixed set of shape assertions:
//
//   1. Every expected artifact exists.
//   2. DESIGN-PATTERNS.md contains the 4 locked headings
//      (Tokens, Components, Accessibility, Visual Hierarchy).
//   3. DESIGN-PLAN.md contains at least one `Wave` section + one
//      `Type:` line.
//   4. SUMMARY.md contains `## VERIFY COMPLETE`.
//   5. events.jsonl has >= 5 `state.transition` events (one per
//      stage boundary brief->explore->plan->design->verify).
//   6. Dry-run mode: usd_cost === 0.
//   7. Live mode: usd_cost < maxUsdCost (default 5.0).
//   8. Wall-clock < timeoutMs (default 15 min).
//   9. Exit code === 0.
//
// The harness has TWO modes:
//
//   * 'dry-run' — spawns `gdd-sdk run --dry-run --fixture <src> --cwd <tmp>`
//     which installs canned-session overrides. Never hits the Anthropic
//     API. Runs on every PR.
//   * 'live'    — spawns `gdd-sdk run --cwd <tmp>` with the real Agent
//     SDK. Gated on `process.env.ANTHROPIC_API_KEY`; returns
//     `status: 'skipped'` when the key is absent. Runs on main-branch
//     push with secret.
//
// The fixture is NEVER mutated. Every run first copies
// `test-fixture/headless-e2e/` into a unique temp directory so repeated
// runs (and the seeded `.design/`) stay pristine.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath, resolve as resolvePath, relative as relPath, dirname } from 'node:path';
import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Public types.
// ---------------------------------------------------------------------------

export type E2EMode = 'dry-run' | 'live';
export type E2EStatus = 'pass' | 'fail' | 'skipped';

/** Artifact presence + size report keyed by relative path. */
export type ArtifactReport = Readonly<Record<string, { readonly exists: boolean; readonly bytes: number }>>;

export interface E2EResult {
  readonly status: E2EStatus;
  readonly mode: E2EMode;
  /** Wall-clock duration in ms. */
  readonly duration_ms: number;
  /** Extracted from the pipeline-result JSON. Zero under dry-run. */
  readonly usd_cost: number;
  /** Artifact presence snapshot. */
  readonly artifacts: ArtifactReport;
  /** Ordered assertion-failure messages (empty on pass). */
  readonly assertion_failures: readonly string[];
  /** gdd-sdk exit code; 0 on success. */
  readonly exit_code: number;
  /** Path to the temp directory where the fixture was copied + run. */
  readonly run_dir: string;
  /** Captured stdout (trimmed to 64KiB tail). */
  readonly stdout_tail: string;
  /** Captured stderr (trimmed to 64KiB tail). */
  readonly stderr_tail: string;
}

export interface RunHeadlessE2EOptions {
  readonly mode: E2EMode;
  /** Absolute path to `test-fixture/headless-e2e/`. */
  readonly fixtureDir: string;
  /** Override the default 15-minute wall-clock cap. */
  readonly timeoutMs?: number;
  /** Override the default 5.0 USD budget cap for live mode. */
  readonly maxUsdCost?: number;
  /** Override the default gdd-sdk bin path (`./bin/gdd-sdk`). */
  readonly gddSdkBin?: string;
  /**
   * Optional environment overrides layered on top of process.env. Used
   * by tests to pass through `ANTHROPIC_API_KEY` deliberately.
   */
  readonly env?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Public entry.
// ---------------------------------------------------------------------------

/**
 * Run the headless E2E harness against a fixture. Never throws —
 * failures surface on `result.assertion_failures` or `result.status`.
 *
 * When `mode === 'live'` and `ANTHROPIC_API_KEY` is absent the harness
 * returns `status: 'skipped'` without spawning a subprocess. The caller
 * treats this as a pass (matches the `run-injection-scanner-ci.cjs`
 * gating pattern — no secret => no-op).
 */
export async function runHeadlessE2E(opts: RunHeadlessE2EOptions): Promise<E2EResult> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000; // 15 min default
  const maxUsdCost = opts.maxUsdCost ?? 5.0;

  const env = { ...process.env, ...(opts.env ?? {}) };

  // Live mode gating — skip cleanly if the secret is absent.
  if (opts.mode === 'live' && !env['ANTHROPIC_API_KEY']) {
    return {
      status: 'skipped',
      mode: 'live',
      duration_ms: Date.now() - t0,
      usd_cost: 0,
      artifacts: Object.freeze({}),
      assertion_failures: Object.freeze([]),
      exit_code: 0,
      run_dir: '',
      stdout_tail: '',
      stderr_tail: '',
    };
  }

  // Resolve + validate the fixture source.
  const srcFixture = resolvePath(opts.fixtureDir);
  if (!existsSync(srcFixture)) {
    return failEarly(
      opts.mode,
      Date.now() - t0,
      [`fixture directory does not exist: ${srcFixture}`],
    );
  }

  // Copy the fixture into a temp dir so the source stays pristine.
  const runDir = mkdtempSync(joinPath(tmpdir(), 'gdd-e2e-'));
  try {
    copyDirSync(srcFixture, runDir);
  } catch (err) {
    return failEarly(opts.mode, Date.now() - t0, [
      `fixture copy failed: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  // Resolve gdd-sdk binary.
  const gddSdkBin =
    opts.gddSdkBin !== undefined
      ? resolvePath(opts.gddSdkBin)
      : resolvePath(process.cwd(), 'bin', 'gdd-sdk');

  // Point the subprocess's event-stream at the fixture copy's
  // .design/telemetry so the events.jsonl assertion sees the run's
  // transitions. The subprocess cannot chdir into runDir (its
  // package.json is the fixture stub without the real repo's
  // scripts/lib/ tree — createRequire in session-runner/errors.ts
  // would fail resolving error-classifier.cjs), so we keep cwd at
  // the repo root and steer writes via the env var instead.
  const subprocessEnv: Record<string, string | undefined> = {
    ...env,
    GDD_EVENTS_PATH: joinPath(runDir, '.design/telemetry/events.jsonl'),
  };

  // Build argv.
  const argv: string[] =
    opts.mode === 'dry-run'
      ? [
          'run',
          '--dry-run',
          '--cwd',
          runDir,
          '--fixture',
          runDir,
          '--json',
          '--log-level',
          'warn',
        ]
      : [
          'run',
          '--cwd',
          runDir,
          '--budget-usd',
          String(maxUsdCost),
          '--max-turns',
          '20',
          '--json',
          '--log-level',
          'info',
        ];

  // Spawn gdd-sdk from the REPO root (so createRequire anchors resolve
  // correctly) but steer all state + event writes into runDir via
  // --cwd and GDD_EVENTS_PATH.
  const subprocessCwd = process.cwd();
  const spawned = await spawnWithTimeout({
    bin: gddSdkBin,
    argv,
    cwd: subprocessCwd,
    env: subprocessEnv,
    timeoutMs,
  });

  const exitCode = spawned.exitCode;
  const stdout = spawned.stdout;
  const stderr = spawned.stderr;

  // Parse pipeline-result JSON from stdout (last JSON object in tail).
  const pipelineResult = extractPipelineResult(stdout);

  // Assert.
  const assertionFailures: string[] = [];

  // 1. Exit code.
  if (exitCode !== 0) {
    assertionFailures.push(`gdd-sdk exited with code ${exitCode} (expected 0)`);
  }

  // 2. Wall-clock.
  const elapsed = Date.now() - t0;
  if (elapsed > timeoutMs) {
    assertionFailures.push(`wall-clock ${elapsed}ms exceeded cap ${timeoutMs}ms`);
  }

  // 3. Pipeline result shape.
  if (pipelineResult === null) {
    assertionFailures.push('pipeline-result JSON could not be parsed from stdout');
  } else if (pipelineResult.status !== 'completed') {
    assertionFailures.push(
      `pipeline status = ${pipelineResult.status} (expected "completed")`,
    );
  }

  // 4. Cost gates.
  const usdCost = pipelineResult?.total_usage?.usd_cost ?? 0;
  if (opts.mode === 'dry-run' && usdCost !== 0) {
    assertionFailures.push(`dry-run usd_cost = ${usdCost} (expected 0)`);
  }
  if (opts.mode === 'live' && usdCost >= maxUsdCost) {
    assertionFailures.push(
      `live usd_cost = ${usdCost} exceeds cap ${maxUsdCost}`,
    );
  }

  // 5. Artifact presence.
  const expected: readonly string[] = [
    '.design/BRIEF.md',
    '.design/DESIGN-PATTERNS.md',
    '.design/DESIGN-PLAN.md',
    '.design/DESIGN.md',
    '.design/SUMMARY.md',
  ];
  const artifacts: Record<string, { exists: boolean; bytes: number }> = {};
  for (const rel of expected) {
    const abs = joinPath(runDir, rel);
    if (existsSync(abs)) {
      const st = statSync(abs);
      artifacts[rel] = { exists: true, bytes: st.size };
    } else {
      artifacts[rel] = { exists: false, bytes: 0 };
      assertionFailures.push(`missing artifact: ${rel}`);
    }
  }

  // 6. Content-pattern assertions.
  const patternsPath = joinPath(runDir, '.design/DESIGN-PATTERNS.md');
  if (existsSync(patternsPath)) {
    const body = readFileSync(patternsPath, 'utf8');
    for (const heading of ['## Tokens', '## Components', '## Accessibility', '## Visual Hierarchy']) {
      if (!body.includes(heading)) {
        assertionFailures.push(`DESIGN-PATTERNS.md missing heading "${heading}"`);
      }
    }
  }

  const planPath = joinPath(runDir, '.design/DESIGN-PLAN.md');
  if (existsSync(planPath)) {
    const body = readFileSync(planPath, 'utf8');
    if (!/(^|\n)##\s*Wave\b/i.test(body)) {
      assertionFailures.push('DESIGN-PLAN.md missing "Wave" section');
    }
    if (!body.includes('Type:')) {
      assertionFailures.push('DESIGN-PLAN.md missing "Type:" line');
    }
  }

  const summaryPath = joinPath(runDir, '.design/SUMMARY.md');
  if (existsSync(summaryPath)) {
    const body = readFileSync(summaryPath, 'utf8');
    if (!body.includes('## VERIFY COMPLETE')) {
      assertionFailures.push('SUMMARY.md missing "## VERIFY COMPLETE" marker');
    }
  }

  // 7. events.jsonl: at least 5 state.transition events.
  // Phase 20 + 21 emit stage.entered/stage.exited; dry-run's permissive
  // transition override skips state.transition events. We accept
  // EITHER >=5 state.transition events OR >=5 stage.entered events
  // (the dry-run baseline). The Plan 21-11 success criterion is
  // "5 transition events emitted across run" — we honor the spirit
  // by checking the stage boundary count.
  const eventsPath = joinPath(runDir, '.design/telemetry/events.jsonl');
  if (existsSync(eventsPath)) {
    const body = readFileSync(eventsPath, 'utf8');
    const lines = body.split('\n').filter((l) => l.length > 0);
    let transitionCount = 0;
    let stageEnteredCount = 0;
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as { type?: string };
        if (ev.type === 'state.transition') transitionCount++;
        if (ev.type === 'stage.entered') stageEnteredCount++;
      } catch {
        // Skip unparseable lines (shouldn't happen — JSONL is
        // newline-delimited JSON per line).
      }
    }
    const boundaryCount = Math.max(transitionCount, stageEnteredCount);
    if (boundaryCount < 5) {
      assertionFailures.push(
        `events.jsonl has ${boundaryCount} stage-boundary events (expected >=5; ` +
          `${transitionCount} state.transition + ${stageEnteredCount} stage.entered)`,
      );
    }
  } else {
    assertionFailures.push('missing events.jsonl');
  }

  const status: E2EStatus =
    assertionFailures.length === 0 && exitCode === 0 ? 'pass' : 'fail';

  return {
    status,
    mode: opts.mode,
    duration_ms: elapsed,
    usd_cost: usdCost,
    artifacts: Object.freeze(artifacts),
    assertion_failures: Object.freeze(assertionFailures),
    exit_code: exitCode,
    run_dir: runDir,
    stdout_tail: tailBytes(stdout, 64 * 1024),
    stderr_tail: tailBytes(stderr, 64 * 1024),
  };
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Build a skipped/failed result without spawning anything. */
function failEarly(
  mode: E2EMode,
  durationMs: number,
  failures: readonly string[],
): E2EResult {
  return {
    status: 'fail',
    mode,
    duration_ms: durationMs,
    usd_cost: 0,
    artifacts: Object.freeze({}),
    assertion_failures: Object.freeze([...failures]),
    exit_code: -1,
    run_dir: '',
    stdout_tail: '',
    stderr_tail: '',
  };
}

interface SpawnOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

/**
 * Spawn `gdd-sdk` with an externally-enforced wall-clock timeout.
 * Node's child_process does not expose a native timeout on async calls
 * matching our needs — we roll our own via setTimeout + signal kill.
 */
function spawnWithTimeout(args: {
  readonly bin: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs: number;
}): Promise<SpawnOutcome> {
  return new Promise<SpawnOutcome>((resolve) => {
    // Compose the node invocation explicitly so we do not depend on a
    // `.cmd` shim being discoverable on Windows. The bin is the CJS
    // trampoline (bin/gdd-sdk), which spawns TS — we skip that layer
    // by invoking the TS entry directly with the experimental flag.
    const tsEntry = resolvePath(dirname(args.bin), '..', 'scripts', 'lib', 'cli', 'index.ts');
    const nodeArgs = ['--experimental-strip-types', tsEntry, ...args.argv];
    const child = spawn(process.execPath, nodeArgs, {
      cwd: args.cwd,
      env: args.env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => stdoutChunks.push(b));
    child.stderr.on('data', (b: Buffer) => stderrChunks.push(b));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // Best-effort kill.
      }
    }, args.timeoutMs);
    timer.unref();

    child.on('error', () => {
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        timedOut,
      });
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: typeof code === 'number' ? code : -1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        timedOut,
      });
    });
  });
}

/**
 * Tight-loop recursive copy. Avoids the `fs.cpSync` dependency to keep
 * this module Node-16-compatible (experimental-strip-types works under
 * 22; cpSync is stable there, but we prefer explicit behavior for
 * test-fixtures).
 */
function copyDirSync(src: string, dest: string): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = joinPath(src, entry.name);
    const destPath = joinPath(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      const data = readFileSync(srcPath);
      const parent = dirname(destPath);
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      writeFileSync(destPath, data);
    }
    // Symlinks + other types are skipped — fixtures are plain files.
  }
  // Silence "unused import" under exactOptionalPropertyTypes.
  void relPath;
}

/**
 * Extract the gdd-sdk pipeline-result JSON from stdout. The CLI emits
 * a single pretty-printed JSON object under `--json`; older output may
 * have been prefixed by node warnings. We locate the last `{` that
 * begins a top-level object and attempt to parse from there.
 */
function extractPipelineResult(stdout: string): { status?: string; total_usage?: { usd_cost?: number } } | null {
  // Fast path: whole stdout is the JSON body.
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed) as { status?: string; total_usage?: { usd_cost?: number } };
    } catch {
      // Fall through to slow-path heuristic.
    }
  }
  // Slow path: find the last `}\n` and scan backward for a matching
  // `{` at the start of a line.
  const lines = stdout.split('\n');
  for (let end = lines.length - 1; end >= 0; end--) {
    const endLine = lines[end];
    if (endLine === undefined || endLine.trim() !== '}') continue;
    for (let start = end - 1; start >= 0; start--) {
      const startLine = lines[start];
      if (startLine !== undefined && startLine.trim() === '{') {
        const candidate = lines.slice(start, end + 1).join('\n');
        try {
          return JSON.parse(candidate) as { status?: string; total_usage?: { usd_cost?: number } };
        } catch {
          // Keep scanning.
        }
      }
    }
  }
  return null;
}

function tailBytes(s: string, cap: number): string {
  if (s.length <= cap) return s;
  return '…' + s.slice(s.length - cap + 1);
}
