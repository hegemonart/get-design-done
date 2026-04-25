// tests/event-stream-redact-integration.test.ts — Plan 22-02 wire-in
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EventWriter } from '../scripts/lib/event-stream/writer.ts';
import type { BaseEvent } from '../scripts/lib/event-stream/types.ts';

test('22-02: writer redacts secrets from payload before disk-write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-redact-'));
  const path = join(dir, 'events.jsonl');
  try {
    const w = new EventWriter({ path });
    const ev: BaseEvent = {
      type: 'tool_call.completed',
      timestamp: '2026-04-25T00:00:00.000Z',
      sessionId: 'sess-1',
      payload: {
        token: 'sk-ant-AAAAAAAAAAAAAAAAAAAA',
        ghp: 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    };
    w.append(ev);
    const onDisk = readFileSync(path, 'utf8');
    assert.match(onDisk, /\[REDACTED:anthropic\]/);
    assert.match(onDisk, /\[REDACTED:github_pat\]/);
    assert.doesNotMatch(onDisk, /sk-ant-/);
    assert.doesNotMatch(onDisk, /ghp_AAAAA/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-02: writer leaves non-secret payload unchanged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-redact-pass-'));
  const path = join(dir, 'events.jsonl');
  try {
    const w = new EventWriter({ path });
    const ev: BaseEvent = {
      type: 'stage.entered',
      timestamp: '2026-04-25T00:00:00.000Z',
      sessionId: 'sess-2',
      payload: { stage: 'plan', detail: 'normal text, nothing to redact' },
    };
    w.append(ev);
    const parsed = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(parsed.payload.stage, 'plan');
    assert.equal(parsed.payload.detail, 'normal text, nothing to redact');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
