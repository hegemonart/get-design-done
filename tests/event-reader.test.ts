// tests/event-reader.test.ts — Plan 22-05 reader + aggregator
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readEvents, aggregate } from '../scripts/lib/event-stream/reader.ts';
import type { BaseEvent } from '../scripts/lib/event-stream/types.ts';

function makeFile(events: BaseEvent[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-reader-'));
  const path = join(dir, 'events.jsonl');
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return path;
}

test('22-05: readEvents yields each line as parsed BaseEvent', async () => {
  const path = makeFile([
    { type: 'stage.entered', timestamp: '2026-01-01T00:00:00.000Z', sessionId: 's', payload: {} },
    { type: 'stage.exited', timestamp: '2026-01-01T00:00:01.000Z', sessionId: 's', payload: {} },
  ]);
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({ path })) out.push(ev);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.type, 'stage.entered');
  assert.equal(out[1]?.type, 'stage.exited');
  rmSync(path, { force: true });
});

test('22-05: readEvents type filter (string) returns only matches', async () => {
  const path = makeFile([
    { type: 'stage.entered', timestamp: '2026-01-01T00:00:00.000Z', sessionId: 's', payload: {} },
    { type: 'hook.fired', timestamp: '2026-01-01T00:00:01.000Z', sessionId: 's', payload: {} },
    { type: 'stage.entered', timestamp: '2026-01-01T00:00:02.000Z', sessionId: 's', payload: {} },
  ]);
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({ path, type: 'stage.entered' })) out.push(ev);
  assert.equal(out.length, 2);
  rmSync(path, { force: true });
});

test('22-05: readEvents type filter (RegExp) groups by namespace', async () => {
  const path = makeFile([
    { type: 'stage.entered', timestamp: '2026-01-01T00:00:00.000Z', sessionId: 's', payload: {} },
    { type: 'stage.exited', timestamp: '2026-01-01T00:00:01.000Z', sessionId: 's', payload: {} },
    { type: 'hook.fired', timestamp: '2026-01-01T00:00:02.000Z', sessionId: 's', payload: {} },
  ]);
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({ path, type: /^stage\./ })) out.push(ev);
  assert.equal(out.length, 2);
  rmSync(path, { force: true });
});

test('22-05: readEvents predicate runs after type filter', async () => {
  const path = makeFile([
    { type: 'cost.update', timestamp: '2026-01-01T00:00:00.000Z', sessionId: 's', payload: { usd: 0.5 } },
    { type: 'cost.update', timestamp: '2026-01-01T00:00:01.000Z', sessionId: 's', payload: { usd: 2.5 } },
    { type: 'stage.entered', timestamp: '2026-01-01T00:00:02.000Z', sessionId: 's', payload: {} },
  ]);
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({
    path,
    type: 'cost.update',
    predicate: (ev) => Number((ev.payload as { usd?: number }).usd ?? 0) > 1,
  })) {
    out.push(ev);
  }
  assert.equal(out.length, 1);
  assert.equal((out[0]?.payload as { usd: number }).usd, 2.5);
  rmSync(path, { force: true });
});

test('22-05: readEvents since/until bounds (inclusive)', async () => {
  const path = makeFile([
    { type: 'a', timestamp: '2026-01-01T00:00:00.000Z', sessionId: 's', payload: {} },
    { type: 'a', timestamp: '2026-01-01T00:00:01.000Z', sessionId: 's', payload: {} },
    { type: 'a', timestamp: '2026-01-01T00:00:02.000Z', sessionId: 's', payload: {} },
  ]);
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({
    path,
    since: '2026-01-01T00:00:01.000Z',
    until: '2026-01-01T00:00:01.999Z',
  })) {
    out.push(ev);
  }
  assert.equal(out.length, 1);
  assert.equal(out[0]?.timestamp, '2026-01-01T00:00:01.000Z');
  rmSync(path, { force: true });
});

test('22-05: readEvents skips invalid JSON lines silently', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-reader-bad-'));
  const path = join(dir, 'events.jsonl');
  writeFileSync(
    path,
    [
      JSON.stringify({ type: 'a', timestamp: 't', sessionId: 's', payload: {} }),
      '{this is not json',
      JSON.stringify({ type: 'b', timestamp: 't', sessionId: 's', payload: {} }),
    ].join('\n') + '\n',
  );
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({ path })) out.push(ev);
  assert.equal(out.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('22-05: readEvents on missing path yields zero events (no throw)', async () => {
  const out: BaseEvent[] = [];
  for await (const ev of readEvents({ path: '/no/such/file/anywhere.jsonl' })) out.push(ev);
  assert.equal(out.length, 0);
});

test('22-05: aggregate counts by type, stage, cycle, agent + totals', async () => {
  const events: BaseEvent[] = [
    {
      type: 'stage.entered',
      timestamp: 't',
      sessionId: 's',
      stage: 'plan',
      cycle: 'c1',
      payload: { agent: 'design-planner' },
    },
    {
      type: 'stage.entered',
      timestamp: 't',
      sessionId: 's',
      stage: 'plan',
      cycle: 'c1',
      payload: { agent: 'design-planner' },
    },
    {
      type: 'error',
      timestamp: 't',
      sessionId: 's',
      stage: 'verify',
      cycle: 'c1',
      payload: { code: 'E', message: 'm', kind: 'k' },
    },
    {
      type: 'hook.fired',
      timestamp: 't',
      sessionId: 's',
      cycle: 'c2',
      payload: { hook: 'budget-enforcer', decision: 'allow' },
      _truncated: true,
    },
  ];
  const path = makeFile(events);
  const events2 = readEvents({ path });
  const agg = await aggregate(events2);
  assert.equal(agg.totals.count, 4);
  assert.equal(agg.totals.error_count, 1);
  assert.equal(agg.totals.truncated_count, 1);
  assert.equal(agg.byType['stage.entered'], 2);
  assert.equal(agg.byType['error'], 1);
  assert.equal(agg.byStage['plan'], 2);
  assert.equal(agg.byStage['verify'], 1);
  assert.equal(agg.byCycle['c1'], 3);
  assert.equal(agg.byCycle['c2'], 1);
  assert.equal(agg.byAgent['design-planner'], 2);
  rmSync(path, { force: true });
});
