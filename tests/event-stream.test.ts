// tests/event-stream.test.ts — Plan 20-06 (SDK-08).
//
// Covers EventWriter (JSONL serialization, truncation, non-throwing append,
// directory auto-create), EventBus (subscribe/unsubscribe/subscribeAll),
// and the appendEvent() composed path (persist + broadcast + _meta stamping).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { tmpdir } from 'node:os';

import {
  EventWriter,
  EventBus,
  DEFAULT_EVENTS_PATH,
  DEFAULT_MAX_LINE_BYTES,
  appendEvent,
  getBus,
  getWriter,
  reset,
  subscribe,
  subscribeAll,
} from '../scripts/lib/event-stream/index.ts';
import type {
  BaseEvent,
  StateMutationEvent,
  StateTransitionEvent,
} from '../scripts/lib/event-stream/index.ts';

function mkTmp(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fixtureEvent(overrides: Partial<BaseEvent> = {}): BaseEvent {
  return {
    type: 'test.event',
    timestamp: '2026-04-24T06:00:00.000Z',
    sessionId: 'test-session-01',
    payload: { hello: 'world' },
    ...overrides,
  };
}

// ── EventWriter: construction & path resolution ──────────────────────────────

test('EventWriter: default path is .design/telemetry/events.jsonl (relative)', () => {
  const w = new EventWriter();
  assert.ok(w.path.endsWith(DEFAULT_EVENTS_PATH.replace(/\//g, sep)) || w.path.endsWith(DEFAULT_EVENTS_PATH));
  assert.equal(w.maxLineBytes, DEFAULT_MAX_LINE_BYTES);
});

test('EventWriter: absolute path passed through unchanged', () => {
  const { dir, cleanup } = mkTmp('event-writer-abs-');
  try {
    const abs = join(dir, 'custom.jsonl');
    const w = new EventWriter({ path: abs });
    assert.equal(w.path, abs);
  } finally {
    cleanup();
  }
});

test('EventWriter: relative path resolved against process.cwd()', () => {
  const w = new EventWriter({ path: 'custom/events.jsonl' });
  assert.ok(isAbsolute(w.path));
  assert.ok(w.path.endsWith('events.jsonl'));
});

// ── EventWriter: append behavior ─────────────────────────────────────────────

test('EventWriter.append: writes one JSONL line per event', () => {
  const { dir, cleanup } = mkTmp('event-writer-append-');
  try {
    const path = join(dir, 'events.jsonl');
    const w = new EventWriter({ path });
    w.append(fixtureEvent({ type: 'a' }));
    w.append(fixtureEvent({ type: 'b' }));
    w.append(fixtureEvent({ type: 'c' }));
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[0]!).type, 'a');
    assert.equal(JSON.parse(lines[1]!).type, 'b');
    assert.equal(JSON.parse(lines[2]!).type, 'c');
  } finally {
    cleanup();
  }
});

test('EventWriter.append: each line is newline-terminated', () => {
  const { dir, cleanup } = mkTmp('event-writer-nl-');
  try {
    const path = join(dir, 'events.jsonl');
    const w = new EventWriter({ path });
    w.append(fixtureEvent());
    const raw = readFileSync(path, 'utf8');
    assert.ok(raw.endsWith('\n'));
  } finally {
    cleanup();
  }
});

test('EventWriter.append: auto-creates parent directory', () => {
  const { dir, cleanup } = mkTmp('event-writer-mkdir-');
  try {
    const path = join(dir, 'nested', 'deep', 'events.jsonl');
    const w = new EventWriter({ path });
    assert.equal(existsSync(dirname(path)), false);
    w.append(fixtureEvent());
    assert.ok(existsSync(path));
  } finally {
    cleanup();
  }
});

test('EventWriter.append: truncates oversized payloads, preserves envelope', () => {
  const { dir, cleanup } = mkTmp('event-writer-trunc-');
  try {
    const path = join(dir, 'events.jsonl');
    const w = new EventWriter({ path, maxLineBytes: 256 });
    const huge = 'x'.repeat(2000);
    const ev = fixtureEvent({
      type: 'big',
      stage: 'explore',
      cycle: 'cycle-1',
      payload: { blob: huge },
    });
    w.append(ev);
    const line = readFileSync(path, 'utf8').trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.type, 'big');
    assert.equal(parsed.stage, 'explore');
    assert.equal(parsed.cycle, 'cycle-1');
    assert.equal(parsed._truncated, true);
    assert.deepEqual(parsed.payload, { _truncated_placeholder: true });
    assert.equal(parsed.sessionId, 'test-session-01');
  } finally {
    cleanup();
  }
});

test('EventWriter.append: does NOT throw when parent path is a file (captures error)', () => {
  const { dir, cleanup } = mkTmp('event-writer-err-');
  try {
    const conflictingFile = join(dir, 'blocker');
    writeFileSync(conflictingFile, 'not-a-dir');
    const path = join(conflictingFile, 'events.jsonl'); // blocker is a file, not a dir
    const w = new EventWriter({ path });
    assert.doesNotThrow(() => w.append(fixtureEvent()));
    assert.ok(w.writeErrors >= 1);
    assert.ok(w.lastError instanceof Error);
  } finally {
    cleanup();
  }
});

test('EventWriter.append: counts all errors on sustained failure', () => {
  const { dir, cleanup } = mkTmp('event-writer-errs-');
  try {
    const conflictingFile = join(dir, 'blocker');
    writeFileSync(conflictingFile, 'not-a-dir');
    const path = join(conflictingFile, 'events.jsonl');
    const w = new EventWriter({ path });
    w.append(fixtureEvent());
    w.append(fixtureEvent());
    w.append(fixtureEvent());
    assert.equal(w.writeErrors, 3);
  } finally {
    cleanup();
  }
});

test('EventWriter.serialize: small payload passes through unchanged', () => {
  const w = new EventWriter({ path: '/dev/null', maxLineBytes: 64 * 1024 });
  const ev = fixtureEvent({ payload: { small: true } });
  const line = w.serialize(ev);
  assert.ok(line.endsWith('\n'));
  const parsed = JSON.parse(line.trim());
  assert.equal(parsed._truncated, undefined);
  assert.deepEqual(parsed.payload, { small: true });
});

// ── EventBus: subscribe / unsubscribe ────────────────────────────────────────

test('EventBus.subscribe: handler fires on matching type', () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.subscribe('t1', (ev) => seen.push(ev.type));
  bus.emit('t1', fixtureEvent({ type: 't1' }));
  bus.emit('t2', fixtureEvent({ type: 't2' }));
  assert.deepEqual(seen, ['t1']);
});

test('EventBus.subscribe: returns unsubscribe closure that detaches', () => {
  const bus = new EventBus();
  let count = 0;
  const off = bus.subscribe('x', () => {
    count += 1;
  });
  bus.emit('x', fixtureEvent({ type: 'x' }));
  off();
  bus.emit('x', fixtureEvent({ type: 'x' }));
  assert.equal(count, 1);
});

test('EventBus.subscribe: multiple subscribers to the same type all fire', () => {
  const bus = new EventBus();
  let a = 0;
  let b = 0;
  bus.subscribe('x', () => {
    a += 1;
  });
  bus.subscribe('x', () => {
    b += 1;
  });
  bus.emit('x', fixtureEvent({ type: 'x' }));
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test('EventBus.subscribeAll: fires on every * emission', () => {
  const bus = new EventBus();
  const received: string[] = [];
  bus.subscribeAll((ev) => received.push(ev.type));
  bus.emit('*', fixtureEvent({ type: 'a' }));
  bus.emit('*', fixtureEvent({ type: 'b' }));
  assert.deepEqual(received, ['a', 'b']);
});

test('EventBus.subscribeAll: unsubscribe closure detaches', () => {
  const bus = new EventBus();
  let count = 0;
  const off = bus.subscribeAll(() => {
    count += 1;
  });
  bus.emit('*', fixtureEvent());
  off();
  bus.emit('*', fixtureEvent());
  assert.equal(count, 1);
});

// ── appendEvent: persist + broadcast ────────────────────────────────────────

test('appendEvent: persists to disk AND broadcasts to bus', () => {
  const { dir, cleanup } = mkTmp('append-event-');
  try {
    reset();
    const path = join(dir, 'events.jsonl');
    getWriter({ path }); // prime singleton with temp path

    const received: BaseEvent[] = [];
    const off = subscribe('e1', (ev) => received.push(ev));

    appendEvent(fixtureEvent({ type: 'e1' }));

    off();
    reset();

    // On disk
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]!).type, 'e1');
    // On bus
    assert.equal(received.length, 1);
    assert.equal(received[0]!.type, 'e1');
  } finally {
    cleanup();
  }
});

test('appendEvent: also fires * subscribers', () => {
  const { dir, cleanup } = mkTmp('append-star-');
  try {
    reset();
    getWriter({ path: join(dir, 'events.jsonl') });

    const allTypes: string[] = [];
    const off = subscribeAll((ev) => allTypes.push(ev.type));

    appendEvent(fixtureEvent({ type: 'a' }));
    appendEvent(fixtureEvent({ type: 'b' }));

    off();
    reset();

    assert.deepEqual(allTypes, ['a', 'b']);
  } finally {
    cleanup();
  }
});

test('appendEvent: stamps _meta when caller omits it', () => {
  const { dir, cleanup } = mkTmp('append-meta-');
  try {
    reset();
    const path = join(dir, 'events.jsonl');
    getWriter({ path });
    const ev = fixtureEvent();
    assert.equal(ev._meta, undefined);
    appendEvent(ev);
    reset();
    const line = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.ok(line._meta);
    assert.equal(line._meta.pid, process.pid);
    assert.equal(typeof line._meta.host, 'string');
    assert.equal(line._meta.source, 'event-stream');
  } finally {
    cleanup();
  }
});

test('appendEvent: preserves caller-supplied _meta', () => {
  const { dir, cleanup } = mkTmp('append-meta-keep-');
  try {
    reset();
    const path = join(dir, 'events.jsonl');
    getWriter({ path });
    const ev = fixtureEvent({
      _meta: { pid: 9999, host: 'custom-host', source: 'custom-module' },
    });
    appendEvent(ev);
    reset();
    const line = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(line._meta.pid, 9999);
    assert.equal(line._meta.host, 'custom-host');
    assert.equal(line._meta.source, 'custom-module');
  } finally {
    cleanup();
  }
});

// ── Module singletons + reset() ──────────────────────────────────────────────

test('getWriter: returns same singleton on subsequent calls', () => {
  reset();
  const { dir, cleanup } = mkTmp('singleton-writer-');
  try {
    const w1 = getWriter({ path: join(dir, 'events.jsonl') });
    const w2 = getWriter({ path: join(dir, 'other.jsonl') }); // opts ignored on 2nd call
    assert.equal(w1, w2);
    reset();
  } finally {
    cleanup();
  }
});

test('getBus: returns same singleton on subsequent calls', () => {
  reset();
  const b1 = getBus();
  const b2 = getBus();
  assert.equal(b1, b2);
  reset();
});

test('reset: clears writer + bus singletons', () => {
  reset();
  const { dir, cleanup } = mkTmp('reset-singletons-');
  try {
    const w1 = getWriter({ path: join(dir, 'a.jsonl') });
    const b1 = getBus();
    reset();
    const w2 = getWriter({ path: join(dir, 'b.jsonl') });
    const b2 = getBus();
    assert.notEqual(w1, w2);
    assert.notEqual(b1, b2);
    assert.ok(w2.path.endsWith('b.jsonl'));
    reset();
  } finally {
    cleanup();
  }
});

test('reset: detaches existing bus subscribers', () => {
  reset();
  const { dir, cleanup } = mkTmp('reset-subs-');
  try {
    getWriter({ path: join(dir, 'events.jsonl') });
    let count = 0;
    subscribeAll(() => {
      count += 1;
    });
    appendEvent(fixtureEvent());
    assert.equal(count, 1);
    reset();
    // After reset, the old subscriber no longer fires
    getWriter({ path: join(dir, 'events2.jsonl') });
    appendEvent(fixtureEvent());
    assert.equal(count, 1);
    reset();
  } finally {
    cleanup();
  }
});

// ── Typed subtypes round-trip ────────────────────────────────────────────────

test('StateMutationEvent: typed subtype serializes without type narrowing loss', () => {
  const { dir, cleanup } = mkTmp('typed-mutation-');
  try {
    reset();
    const path = join(dir, 'events.jsonl');
    getWriter({ path });
    const ev: StateMutationEvent = {
      type: 'state.mutation',
      timestamp: new Date().toISOString(),
      sessionId: 'session-x',
      payload: { tool: 'update_progress', diff: { fromStage: 'explore', toStage: 'plan' } },
    };
    appendEvent(ev);
    reset();
    const line = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(line.type, 'state.mutation');
    assert.equal(line.payload.tool, 'update_progress');
  } finally {
    cleanup();
  }
});

test('StateTransitionEvent: blockers array persists intact', () => {
  const { dir, cleanup } = mkTmp('typed-transition-');
  try {
    reset();
    const path = join(dir, 'events.jsonl');
    getWriter({ path });
    const ev: StateTransitionEvent = {
      type: 'state.transition',
      timestamp: new Date().toISOString(),
      sessionId: 'session-y',
      payload: { from: 'explore', to: 'plan', blockers: ['b1', 'b2'], pass: false },
    };
    appendEvent(ev);
    reset();
    const line = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.deepEqual(line.payload.blockers, ['b1', 'b2']);
    assert.equal(line.payload.pass, false);
  } finally {
    cleanup();
  }
});

// ── Concurrency smoke test ───────────────────────────────────────────────────

test('EventWriter.append: N in-process appends all land (no interleaving)', () => {
  const { dir, cleanup } = mkTmp('event-concurrency-');
  try {
    const path = join(dir, 'events.jsonl');
    const w = new EventWriter({ path });
    const N = 100;
    for (let i = 0; i < N; i += 1) {
      w.append(fixtureEvent({ type: `t${i}`, payload: { i } }));
    }
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, N);
    // Each line must be valid standalone JSON.
    for (const l of lines) {
      const p = JSON.parse(l);
      assert.ok(typeof p.type === 'string');
      assert.equal(typeof p.payload.i, 'number');
    }
  } finally {
    cleanup();
  }
});

test('events.jsonl file grows monotonically across appends', () => {
  const { dir, cleanup } = mkTmp('event-monotonic-');
  try {
    const path = join(dir, 'events.jsonl');
    const w = new EventWriter({ path });
    let prev = 0;
    for (let i = 0; i < 10; i += 1) {
      w.append(fixtureEvent({ payload: { n: i } }));
      const size = statSync(path).size;
      assert.ok(size > prev, `expected size > ${prev}, got ${size}`);
      prev = size;
    }
  } finally {
    cleanup();
  }
});
