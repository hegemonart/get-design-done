'use strict';
/**
 * scripts/lib/live/session-store.cjs — Phase 47 (Live Mode) session persistence.
 *
 * The substrate behind `/hone:live`: the user picks a DOM element on a dev
 * server, the agent generates N design variants, the user accepts/discards, and
 * the session survives a crash / `--resume`. This module owns the per-session
 * record on disk at:
 *
 *   <projectRoot>/.design/live-sessions/<session-id>.json
 *
 * Each record is a single JSON document conforming to
 * reference/schemas/live-session.schema.json — `{schema_version, session_id,
 * started_at, ended_at|null, status, url?, dev_server?, events:[...]}` — where
 * `events` is an append-only log of `{kind:'pick'|'generate'|'accept'|'discard',
 * at, ...}` entries.
 *
 * Design constraints (mirrors scripts/lib/pin/store.cjs + ds-arms store):
 *   - Pure, dependency-free CommonJS. Only `fs` + `path`. No network.
 *   - NO top-level Date.now()/Math.random()/new Date(). Time + id are injected
 *     (`now` / `id` / `sessionId`) so every behaviour is deterministic and
 *     hermetically testable. The clock is only ever read from caller input.
 *   - Atomic writes: contents go to `<dest>.tmp` then fs.renameSync into place,
 *     so an interrupted write never leaves a half-written session (and never a
 *     stray `.tmp`).
 *   - Every entry point takes an explicit `projectRoot`; all paths are built
 *     with path.join so the module is cross-platform.
 *
 * Ships in the npm package (scripts/lib/ is in package.json `files`), so it must
 * stay runtime-safe — no dev-only requires.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = '47.0';

/** Statuses an active session can hold. */
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_COMPLETED = 'completed';
const STATUS_ABANDONED = 'abandoned';

/** Event kinds recognised in the append-only log. */
const EVENT_KINDS = Object.freeze(['pick', 'generate', 'accept', 'discard']);

/** Directory (relative to projectRoot) that holds every session record. */
const SESSIONS_SUBDIR = path.join('.design', 'live-sessions');

/**
 * Absolute path to the live-sessions directory for a project.
 * @param {string} projectRoot
 * @returns {string}
 */
function sessionsDir(projectRoot) {
  if (!projectRoot) throw new TypeError('session-store: projectRoot is required');
  return path.join(projectRoot, SESSIONS_SUBDIR);
}

/**
 * Absolute path to a single session record.
 * @param {string} projectRoot
 * @param {string} sessionId
 * @returns {string}
 */
function sessionPath(projectRoot, sessionId) {
  if (!sessionId) throw new TypeError('session-store: sessionId is required');
  // Guard against path traversal in the id — a session id is a flat token, never
  // a path. We reject any separator or `..` rather than silently joining it.
  const id = String(sessionId);
  if (id.includes('/') || id.includes('\\') || id === '.' || id === '..') {
    throw new Error(`session-store: invalid sessionId "${id}" (must not contain path separators)`);
  }
  return path.join(sessionsDir(projectRoot), `${id}.json`);
}

/** Atomic write: write to `<dest>.tmp` then rename into place. */
function atomicWriteJson(dest, value) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try {
    fs.renameSync(tmp, dest);
  } catch (e) {
    // Never leave a stray .tmp behind on a failed rename.
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Derive a stable session id WITHOUT touching a global clock or RNG. The id is
 * built purely from caller-supplied inputs so it is deterministic in tests.
 *
 * Preference order:
 *   1. explicit `id` (the injectable)
 *   2. a slug of `now` (the injected timestamp) — e.g. "2026-06-03T01:02:03Z"
 *      becomes "session-2026-06-03t01-02-03z"
 *
 * @param {{ id?: string, now?: string }} args
 * @returns {string}
 */
function deriveSessionId(args = {}) {
  if (args.id != null && String(args.id).length) return String(args.id);
  if (args.now != null && String(args.now).length) {
    const slug = String(args.now)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug.length) return `session-${slug}`;
  }
  throw new TypeError(
    'session-store.newSession: provide an explicit sessionId, or inject `id`/`now` to derive one ' +
      '(no internal clock/RNG by design)',
  );
}

/**
 * Create a new session record on disk.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} [args.sessionId]      explicit id; if omitted, derived from `id`/`now`
 * @param {string} [args.id]             injectable id source (used when sessionId omitted)
 * @param {string} [args.now]            ISO timestamp for started_at + id derivation
 * @param {string} [args.url]            the page the element was picked from
 * @param {string|object} [args.devServer] dev-server descriptor (url/port/command)
 * @returns {{ sessionId: string, path: string, session: object }}
 */
function newSession(args = {}) {
  const { projectRoot } = args;
  if (!projectRoot) throw new TypeError('newSession: projectRoot is required');

  const sessionId = args.sessionId != null && String(args.sessionId).length
    ? String(args.sessionId)
    : deriveSessionId({ id: args.id, now: args.now });

  const startedAt = args.now != null && String(args.now).length ? String(args.now) : null;
  if (!startedAt) {
    throw new TypeError(
      'newSession: `now` (ISO timestamp) is required for started_at (no internal clock by design)',
    );
  }

  const session = {
    schema_version: SCHEMA_VERSION,
    session_id: sessionId,
    status: STATUS_IN_PROGRESS,
    started_at: startedAt,
    ended_at: null,
    events: [],
  };
  if (args.url != null) session.url = String(args.url);
  if (args.devServer != null) session.dev_server = args.devServer;

  const dest = sessionPath(projectRoot, sessionId);
  atomicWriteJson(dest, session);
  return { sessionId, path: dest, session };
}

/**
 * Load a session record, or null if it does not exist / is unparseable.
 * @param {{ projectRoot: string, sessionId: string }} args
 * @returns {object|null}
 */
function loadSession(args = {}) {
  const { projectRoot, sessionId } = args;
  if (!projectRoot) throw new TypeError('loadSession: projectRoot is required');
  if (!sessionId) throw new TypeError('loadSession: sessionId is required');
  const file = sessionPath(projectRoot, sessionId);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.events)) data.events = [];
    return data;
  } catch {
    return null;
  }
}

/**
 * Append an event to a session's `events` log and atomically rewrite the record.
 *
 * The event MUST carry a recognised `kind` and an `at` timestamp — the `at`
 * comes from the caller (no internal clock). Any extra payload fields (e.g.
 * a `generate` event's variant list, a `pick` event's selector + implicated
 * files) are preserved verbatim.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.sessionId
 * @param {object} args.event   { kind, at, ... }
 * @returns {{ sessionId: string, path: string, session: object, eventIndex: number }}
 */
function appendEvent(args = {}) {
  const { projectRoot, sessionId, event } = args;
  if (!projectRoot) throw new TypeError('appendEvent: projectRoot is required');
  if (!sessionId) throw new TypeError('appendEvent: sessionId is required');
  if (!event || typeof event !== 'object') throw new TypeError('appendEvent: event object is required');
  if (!EVENT_KINDS.includes(event.kind)) {
    throw new Error(
      `appendEvent: unknown event.kind "${event.kind}" (expected one of ${EVENT_KINDS.join(', ')})`,
    );
  }
  if (event.at == null || !String(event.at).length) {
    throw new TypeError('appendEvent: event.at (ISO timestamp) is required (no internal clock by design)');
  }

  const session = loadSession({ projectRoot, sessionId });
  if (!session) {
    throw new Error(`appendEvent: no session "${sessionId}" under ${sessionsDir(projectRoot)}`);
  }
  // Normalise the stored event so `kind`/`at` lead, then spread the rest.
  const stored = { kind: event.kind, at: String(event.at) };
  for (const [k, v] of Object.entries(event)) {
    if (k === 'kind' || k === 'at') continue;
    stored[k] = v;
  }
  session.events.push(stored);

  const dest = sessionPath(projectRoot, sessionId);
  atomicWriteJson(dest, session);
  return { sessionId, path: dest, session, eventIndex: session.events.length - 1 };
}

/** The last event in a session, or null if none. */
function lastEventOf(session) {
  if (!session || !Array.isArray(session.events) || session.events.length === 0) return null;
  return session.events[session.events.length - 1];
}

/**
 * List every session for a project, newest activity first, for resume offers.
 *
 * Each entry: `{ sessionId, status, started_at, lastEvent }`. Unparseable /
 * non-session files are skipped. Returns [] when the directory is absent.
 *
 * @param {string} projectRoot
 * @returns {Array<{ sessionId: string, status: string, started_at: string|null, lastEvent: object|null }>}
 */
function listSessions(projectRoot) {
  if (!projectRoot) throw new TypeError('listSessions: projectRoot is required');
  const dir = sessionsDir(projectRoot);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.json')) continue;
    if (e.name.endsWith('.tmp')) continue;
    const sessionId = e.name.slice(0, -'.json'.length);
    const session = loadSession({ projectRoot, sessionId });
    if (!session || session.session_id == null) continue;
    out.push({
      sessionId: session.session_id,
      status: session.status || null,
      started_at: session.started_at || null,
      lastEvent: lastEventOf(session),
    });
  }
  // Stable order: most recently started first; ties broken by id for determinism.
  out.sort((a, b) => {
    const sa = a.started_at || '';
    const sb = b.started_at || '';
    if (sa === sb) return a.sessionId.localeCompare(b.sessionId);
    return sa < sb ? 1 : -1;
  });
  return out;
}

/**
 * Resume information for a single session, so the skill can offer
 * "continue from <last_event>" vs "start fresh".
 *
 * @param {{ projectRoot: string, sessionId: string }} args
 * @returns {{ canResume: boolean, lastEvent: object|null, summary: string }}
 */
function resumeInfo(args = {}) {
  const { projectRoot, sessionId } = args;
  if (!projectRoot) throw new TypeError('resumeInfo: projectRoot is required');
  if (!sessionId) throw new TypeError('resumeInfo: sessionId is required');

  const session = loadSession({ projectRoot, sessionId });
  if (!session) {
    return { canResume: false, lastEvent: null, summary: `no session "${sessionId}"` };
  }
  const last = lastEventOf(session);
  const eventCount = Array.isArray(session.events) ? session.events.length : 0;
  // Only in-progress sessions can be resumed; completed/abandoned ones are done.
  const canResume = session.status === STATUS_IN_PROGRESS;

  let summary;
  if (!canResume) {
    summary = `session "${sessionId}" is ${session.status} — start fresh`;
  } else if (last) {
    summary = `continue from "${last.kind}" (${eventCount} event${eventCount === 1 ? '' : 's'} recorded)`;
  } else {
    summary = `session "${sessionId}" started but has no events yet — continue or start fresh`;
  }
  return { canResume, lastEvent: last, summary };
}

/**
 * Close a session: set `ended_at` and a terminal status.
 *
 * @param {object} args
 * @param {string} args.projectRoot
 * @param {string} args.sessionId
 * @param {('completed'|'abandoned')} args.status
 * @param {string} args.now   ISO timestamp for ended_at (no internal clock)
 * @returns {{ sessionId: string, path: string, session: object }}
 */
function endSession(args = {}) {
  const { projectRoot, sessionId } = args;
  if (!projectRoot) throw new TypeError('endSession: projectRoot is required');
  if (!sessionId) throw new TypeError('endSession: sessionId is required');
  const status = args.status || STATUS_COMPLETED;
  if (status !== STATUS_COMPLETED && status !== STATUS_ABANDONED) {
    throw new Error(`endSession: status must be "${STATUS_COMPLETED}" or "${STATUS_ABANDONED}", got "${status}"`);
  }
  if (args.now == null || !String(args.now).length) {
    throw new TypeError('endSession: `now` (ISO timestamp) is required for ended_at (no internal clock by design)');
  }

  const session = loadSession({ projectRoot, sessionId });
  if (!session) {
    throw new Error(`endSession: no session "${sessionId}" under ${sessionsDir(projectRoot)}`);
  }
  session.status = status;
  session.ended_at = String(args.now);

  const dest = sessionPath(projectRoot, sessionId);
  atomicWriteJson(dest, session);
  return { sessionId, path: dest, session };
}

module.exports = {
  newSession,
  appendEvent,
  loadSession,
  listSessions,
  resumeInfo,
  endSession,
  // exported for callers + tests
  sessionsDir,
  sessionPath,
  deriveSessionId,
  lastEventOf,
  SCHEMA_VERSION,
  SESSIONS_SUBDIR,
  EVENT_KINDS,
  STATUS_IN_PROGRESS,
  STATUS_COMPLETED,
  STATUS_ABANDONED,
};
