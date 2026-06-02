// test/suite/phase-47-events.test.cjs — Phase 47 (Live Mode) telemetry emitter.
// Exercises scripts/lib/live/events.cjs: emitLiveEvent appends a schema-valid record to a
// temp project's event stream; an unknown type is rejected; the 6 live types are exported;
// every emitted record, projected to the events.schema.json envelope, validates.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const { emitLiveEvent, LIVE_EVENT_TYPES } = require('../../scripts/lib/live/events.cjs');
const { readChain } = require('../../scripts/lib/event-chain.cjs');

let Ajv;
try {
  Ajv = require('ajv');
} catch (err) {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}

const SCHEMA_PATH = resolve(__dirname, '../..', 'reference', 'schemas', 'events.schema.json');
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

function makeValidator() {
  // strict:false + allErrors:true — mirrors router-pick-event.test.cjs (the schema uses
  // if/then + definitions which trigger Ajv 8 strict warnings but are valid Draft-07).
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(SCHEMA);
}

function mkTmpProject() {
  return mkdtempSync(join(tmpdir(), 'live-events-test-'));
}

function rmTmpProject(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/** A fixed injectable clock so timestamps are deterministic. */
const FIXED_NOW = () => Date.parse('2026-06-03T12:00:00.000Z');

// ---------------------------------------------------------------------------
// (a) The 6 live event types are exported.

test('47-events: exports exactly the 6 live event types', () => {
  assert.deepEqual(
    [...LIVE_EVENT_TYPES],
    [
      'live_session_start',
      'live_pick',
      'live_generate',
      'live_accept',
      'live_discard',
      'live_session_end',
    ],
  );
});

// ---------------------------------------------------------------------------
// (b) emitLiveEvent appends a schema-valid record to a temp project's stream.

test('47-events: emitLiveEvent appends a schema-valid record to a temp project', () => {
  const dir = mkTmpProject();
  try {
    const ret = emitLiveEvent({
      projectRoot: dir,
      type: 'live_session_start',
      sessionId: 'live-sess-1',
      payload: { picker: 'dom', target: '#hero' },
      now: FIXED_NOW,
    });

    // Return value is the projected envelope.
    assert.equal(ret.type, 'live_session_start');
    assert.equal(ret.sessionId, 'live-sess-1');
    assert.equal(ret.timestamp, '2026-06-03T12:00:00.000Z', 'injectable clock drives the timestamp');
    assert.equal(typeof ret.event_id, 'string');
    assert.ok(ret.event_id.length > 0);

    // The row landed in the temp project's event-chain file (.design/gep/events.jsonl under baseDir).
    const streamPath = join(dir, '.design', 'gep', 'events.jsonl');
    assert.equal(existsSync(streamPath), true, 'event stream file created under projectRoot');

    const records = Array.from(readChain({ baseDir: dir }));
    assert.equal(records.length, 1, 'exactly one record appended');

    // Project the appended row to the events.schema.json envelope and validate it.
    const projected = {
      type: records[0].type,
      timestamp: records[0].timestamp,
      sessionId: records[0].sessionId,
      payload: records[0].payload,
    };
    const validator = makeValidator();
    const ok = validator(projected);
    if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
    assert.equal(ok, true, 'projected live_session_start record validates against events.schema.json');
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (c) Every one of the 6 types, when emitted, validates against the schema.

test('47-events: all 6 live types emit schema-valid records', () => {
  const dir = mkTmpProject();
  try {
    const validator = makeValidator();
    for (const type of LIVE_EVENT_TYPES) {
      emitLiveEvent({
        projectRoot: dir,
        type,
        sessionId: 'live-sess-all',
        payload: { type },
        now: FIXED_NOW,
      });
    }
    const records = Array.from(readChain({ baseDir: dir }));
    assert.equal(records.length, LIVE_EVENT_TYPES.length, 'one record per live type');
    for (const rec of records) {
      const projected = {
        type: rec.type,
        timestamp: rec.timestamp,
        sessionId: rec.sessionId,
        payload: rec.payload,
      };
      const ok = validator(projected);
      if (!ok) console.error(`errs for ${rec.type}:`, JSON.stringify(validator.errors, null, 2));
      assert.equal(ok, true, `${rec.type} validates against events.schema.json`);
      assert.ok(LIVE_EVENT_TYPES.includes(rec.type), 'emitted type is a known live type');
    }
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (d) An unknown event type is rejected (closed allow-list).

test('47-events: emitLiveEvent rejects an unknown type', () => {
  const dir = mkTmpProject();
  try {
    assert.throws(
      () =>
        emitLiveEvent({
          projectRoot: dir,
          type: 'live_bogus',
          sessionId: 'x',
          payload: {},
          now: FIXED_NOW,
        }),
      /unknown live event type/i,
      'unknown live type is rejected',
    );
    // Nothing should have been written for the rejected emit.
    const streamPath = join(dir, '.design', 'gep', 'events.jsonl');
    assert.equal(existsSync(streamPath), false, 'no record written for a rejected type');
  } finally {
    rmTmpProject(dir);
  }
});

test('47-events: emitLiveEvent requires a non-empty sessionId', () => {
  const dir = mkTmpProject();
  try {
    assert.throws(
      () => emitLiveEvent({ projectRoot: dir, type: 'live_pick', sessionId: '', now: FIXED_NOW }),
      /sessionId is required/i,
    );
  } finally {
    rmTmpProject(dir);
  }
});

// ---------------------------------------------------------------------------
// (e) The emitter does not touch the repo's real event stream (hermetic via baseDir).

test('47-events: temp-project emit leaves the repo stream untouched', () => {
  const defaultPath = resolve(process.cwd(), '.design', 'gep', 'events.jsonl');
  const existedBefore = existsSync(defaultPath);
  const sizeBefore = existedBefore ? readFileSync(defaultPath, 'utf8').length : 0;

  const dir = mkTmpProject();
  try {
    emitLiveEvent({
      projectRoot: dir,
      type: 'live_accept',
      sessionId: 'iso-check',
      payload: { variant: 'v2' },
      now: FIXED_NOW,
    });
  } finally {
    rmTmpProject(dir);
  }

  if (existedBefore) {
    const sizeAfter = readFileSync(defaultPath, 'utf8').length;
    assert.equal(sizeAfter, sizeBefore, 'repo .design/gep/events.jsonl untouched');
  } else {
    assert.equal(existsSync(defaultPath), false, 'repo stream not created by the test');
  }
});
