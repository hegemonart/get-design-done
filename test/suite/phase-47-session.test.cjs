// test/suite/phase-47-session.test.cjs — Phase 47 (Live Mode): session persistence
//
// Proves scripts/lib/live/session-store.cjs:
//   - newSession() writes a valid session file (status in_progress, started_at,
//     empty events) and that file validates against
//     reference/schemas/live-session.schema.json,
//   - appendEvent() grows `events` in order and rejects unknown kinds / missing `at`,
//   - loadSession() round-trips,
//   - listSessions() enumerates for resume offers,
//   - resumeInfo() reports the last event + resumability,
//   - endSession() sets ended_at + a terminal status,
//   - writes are interrupt-safe (no stray .tmp left behind),
//   - the module never reaches for a global clock/RNG (time + id are injected),
//   - a recorded fixture replays to a reproducible final state
//     (test/fixtures/baselines/phase-47/session-replay.json).
//
// Uses Ajv (a repo dep — scripts/validate-schemas.ts relies on it) to validate
// the on-disk session against the Draft-07 schema. Temp projects live under
// os.tmpdir() and are removed in teardown.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let Ajv;
try {
  Ajv = require('ajv');
} catch {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}
let addFormats = null;
try {
  // ajv-formats is also a repo dep (used by validate-schemas via ajv-formats@3).
  // It teaches Ajv the date-time format our schema declares. Optional: if it is
  // not resolvable we compile with strict:false (unknown formats are then a
  // no-op rather than an error), so the test still runs.
  addFormats = require('ajv-formats');
} catch {
  addFormats = null;
}

const store = require('../../scripts/lib/live/session-store.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'live-session.schema.json');
const FIXTURE_PATH = path.join(
  REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-47', 'session-replay.json',
);

const SCHEMA = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

/** Compile the live-session schema. strict:false to tolerate Draft-07 constructs Ajv 8 warns on. */
function makeValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  if (addFormats) addFormats(ajv);
  return ajv.compile(SCHEMA);
}

/** Fresh temp project root; caller is responsible for nothing — teardown handles it. */
function mkTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hone-live-session-'));
}

/** Recursively remove a temp dir, ignoring errors. */
function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

const FIXED_NOW = '2026-06-03T09:00:00.000Z';

// ---------------------------------------------------------------------------
// 1. The schema itself is a valid Draft-07 schema with the expected shape.
// ---------------------------------------------------------------------------
test('47-session: live-session schema is valid Draft-07 with required keys + status enum', () => {
  assert.match(String(SCHEMA.$schema || ''), /draft-07/, '$schema must declare Draft-07');
  assert.equal(SCHEMA.type, 'object', 'schema type must be object');
  assert.equal(SCHEMA.additionalProperties, false, 'additionalProperties must be false at top level');

  const required = SCHEMA.required || [];
  for (const key of ['schema_version', 'session_id', 'status', 'started_at', 'ended_at', 'events']) {
    assert.ok(required.includes(key), `required must include "${key}"`);
  }

  const statusEnum = (SCHEMA.properties.status || {}).enum || [];
  assert.deepEqual(
    [...statusEnum].sort(),
    ['abandoned', 'completed', 'in_progress'],
    'status enum must be exactly in_progress|completed|abandoned',
  );

  const kindEnum = (((SCHEMA.properties.events || {}).items || {}).properties || {}).kind;
  assert.ok(kindEnum && Array.isArray(kindEnum.enum), 'events.items.kind must declare an enum');
  assert.deepEqual(
    [...kindEnum.enum].sort(),
    ['accept', 'discard', 'generate', 'pick'],
    'event kind enum must be exactly pick|generate|accept|discard',
  );

  // Event items must stay open so generate/pick/accept payloads can vary.
  assert.equal(
    SCHEMA.properties.events.items.additionalProperties,
    true,
    'event items must allow additionalProperties (payloads vary by kind)',
  );

  assert.doesNotThrow(() => makeValidator(), 'schema must compile under Ajv');
});

// ---------------------------------------------------------------------------
// 2. newSession() creates a valid file: in_progress, started_at, empty events.
// ---------------------------------------------------------------------------
test('47-session: newSession creates a schema-valid in_progress file with empty events', () => {
  const root = mkTmpProject();
  try {
    const { sessionId, path: file, session } = store.newSession({
      projectRoot: root,
      sessionId: 'sess-1',
      now: FIXED_NOW,
      url: 'http://localhost:3000/',
      devServer: { url: 'http://localhost:3000', port: 3000 },
    });

    assert.equal(sessionId, 'sess-1');
    assert.ok(fs.existsSync(file), 'session file must exist on disk');
    assert.equal(
      file,
      path.join(root, '.design', 'live-sessions', 'sess-1.json'),
      'file must live under .design/live-sessions/',
    );

    assert.equal(session.status, 'in_progress');
    assert.equal(session.started_at, FIXED_NOW);
    assert.equal(session.ended_at, null);
    assert.deepEqual(session.events, []);
    assert.equal(session.schema_version, store.SCHEMA_VERSION);

    // The on-disk record validates against the schema.
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    const validate = makeValidator();
    const ok = validate(onDisk);
    assert.ok(ok, `session file must validate — errors: ${JSON.stringify(validate.errors)}`);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 2b. newSession derives a stable id from injected `now` when sessionId omitted.
// ---------------------------------------------------------------------------
test('47-session: newSession derives a deterministic id from injected now (no clock/RNG)', () => {
  const root = mkTmpProject();
  try {
    const a = store.newSession({ projectRoot: root, now: FIXED_NOW });
    // Same inputs -> same derived id (deterministic).
    const derived = store.deriveSessionId({ now: FIXED_NOW });
    assert.equal(a.sessionId, derived);
    assert.match(a.sessionId, /^session-/, 'derived id should be slug-prefixed');
    assert.ok(!/[^a-z0-9-]/.test(a.sessionId), 'derived id must be a flat slug');

    // Explicit injected id wins.
    assert.equal(store.deriveSessionId({ id: 'explicit-x', now: FIXED_NOW }), 'explicit-x');
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 3. appendEvent grows events in order; loadSession round-trips.
// ---------------------------------------------------------------------------
test('47-session: appendEvent grows events in order and loadSession round-trips', () => {
  const root = mkTmpProject();
  try {
    store.newSession({ projectRoot: root, sessionId: 'sess-2', now: FIXED_NOW });

    store.appendEvent({
      projectRoot: root,
      sessionId: 'sess-2',
      event: { kind: 'pick', at: '2026-06-03T09:00:05.000Z', selector: 'button.cta', implicated: ['src/App.tsx'] },
    });
    store.appendEvent({
      projectRoot: root,
      sessionId: 'sess-2',
      event: { kind: 'generate', at: '2026-06-03T09:00:10.000Z', variant_count: 2 },
    });
    const third = store.appendEvent({
      projectRoot: root,
      sessionId: 'sess-2',
      event: { kind: 'discard', at: '2026-06-03T09:00:15.000Z', variant: 'v-a' },
    });
    assert.equal(third.eventIndex, 2, 'third append should land at index 2');

    const loaded = store.loadSession({ projectRoot: root, sessionId: 'sess-2' });
    assert.equal(loaded.events.length, 3);
    assert.deepEqual(loaded.events.map((e) => e.kind), ['pick', 'generate', 'discard']);
    // Payload fields preserved verbatim.
    assert.equal(loaded.events[0].selector, 'button.cta');
    assert.deepEqual(loaded.events[0].implicated, ['src/App.tsx']);
    assert.equal(loaded.events[1].variant_count, 2);
    assert.equal(loaded.events[2].variant, 'v-a');

    // Still schema-valid after appends.
    const validate = makeValidator();
    assert.ok(validate(loaded), `must validate after appends — ${JSON.stringify(validate.errors)}`);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 3b. appendEvent rejects unknown kind + missing `at` (no internal clock).
// ---------------------------------------------------------------------------
test('47-session: appendEvent rejects unknown kind and missing timestamp', () => {
  const root = mkTmpProject();
  try {
    store.newSession({ projectRoot: root, sessionId: 'sess-3', now: FIXED_NOW });
    assert.throws(
      () => store.appendEvent({ projectRoot: root, sessionId: 'sess-3', event: { kind: 'frobnicate', at: FIXED_NOW } }),
      /unknown event\.kind/,
    );
    assert.throws(
      () => store.appendEvent({ projectRoot: root, sessionId: 'sess-3', event: { kind: 'pick' } }),
      /event\.at .*required/,
    );
    assert.throws(
      () => store.appendEvent({ projectRoot: root, sessionId: 'missing', event: { kind: 'pick', at: FIXED_NOW } }),
      /no session "missing"/,
    );
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 4. loadSession returns null for an unknown session.
// ---------------------------------------------------------------------------
test('47-session: loadSession returns null for an unknown session', () => {
  const root = mkTmpProject();
  try {
    assert.equal(store.loadSession({ projectRoot: root, sessionId: 'nope' }), null);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 5. resumeInfo reports the last event + resumability.
// ---------------------------------------------------------------------------
test('47-session: resumeInfo reports the last event and resumability', () => {
  const root = mkTmpProject();
  try {
    store.newSession({ projectRoot: root, sessionId: 'sess-4', now: FIXED_NOW });

    // No events yet: resumable, no last event.
    let info = store.resumeInfo({ projectRoot: root, sessionId: 'sess-4' });
    assert.equal(info.canResume, true);
    assert.equal(info.lastEvent, null);

    store.appendEvent({
      projectRoot: root, sessionId: 'sess-4',
      event: { kind: 'pick', at: '2026-06-03T09:00:05.000Z', selector: 'h1' },
    });
    store.appendEvent({
      projectRoot: root, sessionId: 'sess-4',
      event: { kind: 'generate', at: '2026-06-03T09:00:10.000Z' },
    });
    info = store.resumeInfo({ projectRoot: root, sessionId: 'sess-4' });
    assert.equal(info.canResume, true);
    assert.equal(info.lastEvent.kind, 'generate', 'lastEvent must be the most recent append');
    assert.match(info.summary, /continue from "generate"/);

    // Unknown session: not resumable.
    const none = store.resumeInfo({ projectRoot: root, sessionId: 'ghost' });
    assert.equal(none.canResume, false);
    assert.equal(none.lastEvent, null);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 6. endSession sets ended_at + a terminal status; then it is not resumable.
// ---------------------------------------------------------------------------
test('47-session: endSession sets ended_at + terminal status and blocks resume', () => {
  const root = mkTmpProject();
  try {
    store.newSession({ projectRoot: root, sessionId: 'sess-5', now: FIXED_NOW });
    const ended = '2026-06-03T09:30:00.000Z';
    const { session } = store.endSession({ projectRoot: root, sessionId: 'sess-5', status: 'completed', now: ended });
    assert.equal(session.status, 'completed');
    assert.equal(session.ended_at, ended);

    const info = store.resumeInfo({ projectRoot: root, sessionId: 'sess-5' });
    assert.equal(info.canResume, false, 'a completed session must not be resumable');
    assert.match(info.summary, /completed/);

    // Still schema-valid once closed.
    const onDisk = store.loadSession({ projectRoot: root, sessionId: 'sess-5' });
    const validate = makeValidator();
    assert.ok(validate(onDisk), `closed session must validate — ${JSON.stringify(validate.errors)}`);

    // Bad status is rejected.
    store.newSession({ projectRoot: root, sessionId: 'sess-5b', now: FIXED_NOW });
    assert.throws(
      () => store.endSession({ projectRoot: root, sessionId: 'sess-5b', status: 'paused', now: ended }),
      /status must be/,
    );
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 7. listSessions enumerates sessions newest-first for resume offers.
// ---------------------------------------------------------------------------
test('47-session: listSessions enumerates sessions for resume offers', () => {
  const root = mkTmpProject();
  try {
    assert.deepEqual(store.listSessions(root), [], 'no dir -> empty list');

    store.newSession({ projectRoot: root, sessionId: 'old', now: '2026-06-03T08:00:00.000Z' });
    store.newSession({ projectRoot: root, sessionId: 'new', now: '2026-06-03T09:00:00.000Z' });
    store.appendEvent({
      projectRoot: root, sessionId: 'new',
      event: { kind: 'pick', at: '2026-06-03T09:00:05.000Z', selector: 'nav' },
    });

    const list = store.listSessions(root);
    assert.equal(list.length, 2);
    assert.equal(list[0].sessionId, 'new', 'newest started_at must sort first');
    assert.equal(list[0].lastEvent.kind, 'pick');
    assert.equal(list[1].sessionId, 'old');
    assert.equal(list[1].lastEvent, null, 'a session with no events reports lastEvent=null');
    for (const entry of list) {
      assert.ok(['sessionId', 'status', 'started_at', 'lastEvent'].every((k) => k in entry));
      assert.equal(entry.status, 'in_progress');
    }
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 8. Interrupt-safe: no stray .tmp left behind after a full lifecycle.
// ---------------------------------------------------------------------------
test('47-session: writes are atomic — no stray .tmp files remain', () => {
  const root = mkTmpProject();
  try {
    store.newSession({ projectRoot: root, sessionId: 'sess-6', now: FIXED_NOW });
    store.appendEvent({
      projectRoot: root, sessionId: 'sess-6',
      event: { kind: 'pick', at: '2026-06-03T09:00:05.000Z' },
    });
    store.endSession({ projectRoot: root, sessionId: 'sess-6', status: 'abandoned', now: '2026-06-03T09:10:00.000Z' });

    const dir = path.join(root, '.design', 'live-sessions');
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(leftovers, [], 'no .tmp files should survive an atomic write');
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 8b. sessionPath rejects path-traversal in the session id.
// ---------------------------------------------------------------------------
test('47-session: sessionPath rejects path separators / traversal in id', () => {
  const root = mkTmpProject();
  try {
    assert.throws(() => store.sessionPath(root, '../escape'), /invalid sessionId/);
    assert.throws(() => store.sessionPath(root, 'a/b'), /invalid sessionId/);
    assert.throws(() => store.sessionPath(root, '..'), /invalid sessionId/);
  } finally {
    rmrf(root);
  }
});

// ---------------------------------------------------------------------------
// 9. Deterministic replay: replay the recorded fixture and assert the final
//    session state is reproducible + schema-valid.
// ---------------------------------------------------------------------------
test('47-session: deterministic replay of session-replay.json reproduces final state', () => {
  const root = mkTmpProject();
  try {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

    // 1) session_start
    const start = fixture.session_start;
    store.newSession({
      projectRoot: root,
      sessionId: start.sessionId,
      now: start.now,
      url: start.url,
      devServer: start.devServer,
    });

    // 2) replay each recorded event in order
    for (const ev of fixture.events) {
      store.appendEvent({ projectRoot: root, sessionId: start.sessionId, event: ev });
    }

    // 3) session_end
    store.endSession({
      projectRoot: root,
      sessionId: start.sessionId,
      status: fixture.session_end.status,
      now: fixture.session_end.now,
    });

    const final = store.loadSession({ projectRoot: root, sessionId: start.sessionId });
    const exp = fixture.expected;

    assert.equal(final.schema_version, exp.schema_version);
    assert.equal(final.session_id, exp.session_id);
    assert.equal(final.status, exp.status);
    assert.equal(final.started_at, exp.started_at);
    assert.equal(final.ended_at, exp.ended_at);
    assert.equal(final.url, exp.url);
    assert.equal(final.events.length, exp.event_count);
    assert.deepEqual(final.events.map((e) => e.kind), exp.event_kinds);

    const accept = final.events.find((e) => e.kind === 'accept');
    assert.ok(accept, 'replay must contain an accept event');
    assert.equal(accept.variant, exp.accepted_variant);

    // The reproduced record validates against the schema.
    const validate = makeValidator();
    assert.ok(validate(final), `replayed session must validate — ${JSON.stringify(validate.errors)}`);
  } finally {
    rmrf(root);
  }
});
