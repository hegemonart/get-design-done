// tests/concurrency-tuner.test.cjs — Plan 27.6-04 (PERF-07)
//
// Coverage for scripts/lib/parallelism-engine/concurrency-tuner.cjs:
//   * resolveConcurrency: cpu floor, optimum override, hard ceiling cap,
//     env-var ceiling override, no-event fallback
//   * readLastObservedOptimum: absent file, malformed lines, "last wins"
//   * emitParallelismVerdict: tolerates missing event-stream
//
// Run: node --test tests/concurrency-tuner.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  resolveConcurrency,
  readLastObservedOptimum,
  emitParallelismVerdict,
  DEFAULT_HARD_CEILING,
} = require('../scripts/lib/parallelism-engine/concurrency-tuner.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-conc-${prefix}-`));
}

/**
 * Write a `.design/telemetry/events.jsonl` file with the supplied lines
 * inside `baseDir`. Each `lines` entry is written verbatim (callers can
 * inject malformed lines as raw strings).
 */
function writeEventsJsonl(baseDir, lines) {
  const telemetryDir = join(baseDir, '.design', 'telemetry');
  mkdirSync(telemetryDir, { recursive: true });
  writeFileSync(join(telemetryDir, 'events.jsonl'), lines.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Sanity check on the constant
// ---------------------------------------------------------------------------

test('27.6-04: DEFAULT_HARD_CEILING equals 8 per D-07', () => {
  assert.equal(DEFAULT_HARD_CEILING, 8);
});

// ---------------------------------------------------------------------------
// resolveConcurrency — cpu base, no event history
// ---------------------------------------------------------------------------

test('27.6-04: resolveConcurrency returns min(cpu-1, 8) when no event history', () => {
  const dirA = tmp('a');
  const dirB = tmp('b');
  try {
    // cpu=16 → base=15, ceiling=8 → expect 8 (ceiling caps)
    assert.equal(
      resolveConcurrency({ cpuCount: 16, baseDir: dirA }),
      8,
      'cpu=16 with no events should cap at hard ceiling 8',
    );
    // cpu=4 → base=3, ceiling=8 → expect 3 (base wins)
    assert.equal(
      resolveConcurrency({ cpuCount: 4, baseDir: dirB }),
      3,
      'cpu=4 with no events should return cpu-1=3',
    );
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('27.6-04: resolveConcurrency clamps to 1 when cpuCount=1', () => {
  // cpu=1 → base=max(1, 1-1)=max(1, 0)=1 — must never drop to 0
  assert.equal(resolveConcurrency({ cpuCount: 1 }), 1);
});

// ---------------------------------------------------------------------------
// resolveConcurrency — explicit optimum
// ---------------------------------------------------------------------------

test('27.6-04: resolveConcurrency uses lastObservedOptimum when smaller than cpu-1', () => {
  // min(min(16-1, 4), 8) = min(4, 8) = 4
  assert.equal(
    resolveConcurrency({ cpuCount: 16, lastObservedOptimum: 4 }),
    4,
    'lastObservedOptimum=4 should beat the larger cpu-1=15 base',
  );
});

test('27.6-04: resolveConcurrency hard ceiling 8 caps lastObservedOptimum=20', () => {
  // min(min(16-1, 20), 8) = min(15, 8) = 8 — the ceiling cap kicks in
  assert.equal(
    resolveConcurrency({ cpuCount: 16, lastObservedOptimum: 20 }),
    8,
    'lastObservedOptimum=20 must be capped at DEFAULT_HARD_CEILING=8',
  );
});

// ---------------------------------------------------------------------------
// readLastObservedOptimum — JSONL parsing
// ---------------------------------------------------------------------------

test('27.6-04: readLastObservedOptimum returns null when events.jsonl absent', () => {
  const dir = tmp('absent');
  try {
    assert.equal(readLastObservedOptimum({ baseDir: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-04: readLastObservedOptimum parses observed_concurrency from JSONL fixture (last wins)', () => {
  const dir = tmp('parse');
  try {
    writeEventsJsonl(dir, [
      JSON.stringify({
        type: 'parallelism.verdict',
        timestamp: '2026-05-17T00:00:00.000Z',
        sessionId: 's1',
        payload: {
          task_ids: ['a'],
          verdict: 'parallel',
          reason: 'disjoint',
          observed_concurrency: 3,
        },
      }),
      JSON.stringify({
        type: 'cost.update',
        timestamp: '2026-05-17T00:01:00.000Z',
        sessionId: 's1',
        payload: { agent: 'x', tier: 'sonnet', usd: 0.01, tokens_in: 0, tokens_out: 0 },
      }),
      JSON.stringify({
        type: 'parallelism.verdict',
        timestamp: '2026-05-17T00:02:00.000Z',
        sessionId: 's1',
        payload: {
          task_ids: ['b'],
          verdict: 'parallel',
          reason: 'disjoint',
          observed_concurrency: 5,
        },
      }),
    ]);
    // The LAST matching event wins — sequential read order
    assert.equal(readLastObservedOptimum({ baseDir: dir }), 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-04: readLastObservedOptimum tolerates malformed lines', () => {
  const dir = tmp('malformed');
  try {
    writeEventsJsonl(dir, [
      'not-json-at-all',
      JSON.stringify({
        type: 'parallelism.verdict',
        timestamp: '2026-05-17T00:00:00.000Z',
        sessionId: 's1',
        payload: {
          task_ids: ['a'],
          verdict: 'parallel',
          reason: 'disjoint',
          observed_concurrency: 7,
        },
      }),
      '{"broken":',
      '   ', // whitespace-only line
    ]);
    // Malformed lines must be skipped silently; the one good event wins.
    assert.equal(readLastObservedOptimum({ baseDir: dir }), 7);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27.6-04: readLastObservedOptimum returns null when no parallelism.verdict events have observed_concurrency', () => {
  const dir = tmp('no-match');
  try {
    writeEventsJsonl(dir, [
      // Wrong type
      JSON.stringify({
        type: 'cost.update',
        timestamp: '2026-05-17T00:00:00.000Z',
        sessionId: 's1',
        payload: { agent: 'x', tier: 'sonnet', usd: 0.01, tokens_in: 0, tokens_out: 0 },
      }),
      // Right type but missing observed_concurrency (legacy 27.6-pre payload)
      JSON.stringify({
        type: 'parallelism.verdict',
        timestamp: '2026-05-17T00:01:00.000Z',
        sessionId: 's1',
        payload: { task_ids: ['a'], verdict: 'parallel', reason: 'disjoint' },
      }),
    ]);
    assert.equal(readLastObservedOptimum({ baseDir: dir }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// resolveConcurrency — env override + JSONL integration
// ---------------------------------------------------------------------------

test('27.6-04: resolveConcurrency env override GDD_CONCURRENCY_CEILING=4 caps to 4', () => {
  const prior = process.env.GDD_CONCURRENCY_CEILING;
  process.env.GDD_CONCURRENCY_CEILING = '4';
  try {
    // Without env override this would cap at 8; with env=4 it caps at 4.
    assert.equal(
      resolveConcurrency({ cpuCount: 16, lastObservedOptimum: 20 }),
      4,
      'GDD_CONCURRENCY_CEILING=4 should override the default hard ceiling 8',
    );
  } finally {
    if (prior === undefined) {
      delete process.env.GDD_CONCURRENCY_CEILING;
    } else {
      process.env.GDD_CONCURRENCY_CEILING = prior;
    }
  }
});

test('27.6-04: resolveConcurrency reads optimum from JSONL when not passed explicitly', () => {
  const dir = tmp('integrate');
  try {
    writeEventsJsonl(dir, [
      JSON.stringify({
        type: 'parallelism.verdict',
        timestamp: '2026-05-17T00:00:00.000Z',
        sessionId: 's1',
        payload: {
          task_ids: ['a'],
          verdict: 'parallel',
          reason: 'disjoint',
          observed_concurrency: 2,
        },
      }),
    ]);
    // optimum=2 from JSONL beats cpu-1=15; ceiling=8 doesn't engage
    assert.equal(
      resolveConcurrency({ cpuCount: 16, baseDir: dir }),
      2,
      'resolveConcurrency should auto-load optimum from events.jsonl',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// emitParallelismVerdict — tolerance
// ---------------------------------------------------------------------------

test('27.6-04: emitParallelismVerdict does not throw under unavailable event-stream', () => {
  assert.doesNotThrow(() =>
    emitParallelismVerdict({
      task_ids: ['a'],
      verdict: 'parallel',
      reason: 'disjoint',
      intended_concurrency: 4,
      observed_concurrency: 4,
      contention_detected: false,
      wall_clock_ms: 1500,
      sessionId: 'test',
    }),
  );
});

test('27.6-04: emitParallelismVerdict accepts minimal legacy payload (back-compat)', () => {
  // The pre-27.6 payload shape was {task_ids, verdict, reason} — no new
  // fields. Emit must still succeed without intended_/observed_/etc.
  assert.doesNotThrow(() =>
    emitParallelismVerdict({
      task_ids: ['a', 'b'],
      verdict: 'sequential',
      reason: 'conflicting touches',
    }),
  );
});
