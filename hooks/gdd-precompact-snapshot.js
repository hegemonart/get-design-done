#!/usr/bin/env node
/**
 * hooks/gdd-precompact-snapshot.js — Plan 27.6-05
 *
 * Claude Code PreCompact hook. Immediately before context compaction,
 * writes an atomic snapshot of STATE.md sections + last-N event-chain
 * entries + last-N decisions to `.design/snapshots/<ts>.json`.
 *
 * Phase 27.6 D-08: atomic .tmp + rename via sdk/primitives/lockfile.cjs.
 *   - Lockfile serializes concurrent PreCompact writers.
 *   - .tmp + rename guarantees no partial file ever appears at target path
 *     (a SIGKILL between writeFileSync and renameSync leaves an orphan
 *     .tmp file, never a corrupted snapshot).
 *
 * Phase 27.6 D-10: harness-aware — Codex has no PreCompact, so on
 *   harness=codex this is a one-line stderr no-op (Phase 45 dep for
 *   full pre-large-context-action interception).
 *
 * Silent-on-failure: tolerable errors exit 0 with stderr breadcrumb.
 * Emits `snapshot.written` event via lazy appendEvent (best-effort).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RETENTION_COUNT = 10;
const EVENTS_TAIL_COUNT = 50;
const DECISIONS_TAIL_COUNT = 10;
const SCHEMA_VERSION = '1.0.0';

/**
 * Resolve the bundle of paths the hook reads/writes, anchored at `cwd`.
 *
 * Originally these resolved at module load via `process.cwd()`, which is
 * the wrong anchor when Claude Code invokes the hook from a worktree
 * (the harness's cwd at module load can differ from the project root).
 * Resolving against `payload.cwd` matches how 8 sibling hooks already work.
 */
function computePaths(cwd) {
  return {
    snapshotDir: path.resolve(cwd, '.design', 'snapshots'),
    stateMdPath: path.resolve(cwd, '.design', 'STATE.md'),
    eventsPath: path.resolve(cwd, '.design', 'telemetry', 'events.jsonl'),
  };
}

// ---------------------------------------------------------------------------
// Harness detection (D-10)
// ---------------------------------------------------------------------------

function detectHarness() {
  const explicit = (process.env.CLAUDE_HARNESS || process.env.GDD_HARNESS || '')
    .toLowerCase()
    .trim();
  if (explicit === 'codex' || explicit === 'codex-cli') return 'codex';
  // Default — Claude Code (only harness that emits PreCompact today).
  return 'claude-code';
}

// ---------------------------------------------------------------------------
// Lazy event-stream emit (best-effort — never blocks the hook)
// ---------------------------------------------------------------------------

function getAppendEvent() {
  try {
    const m = require('../sdk/event-stream');
    if (m && typeof m.appendEvent === 'function') return m.appendEvent;
  } catch {
    /* swallow — event-stream is optional infrastructure */
  }
  return function noopAppend(_ev) {
    /* no-op */
  };
}

// ---------------------------------------------------------------------------
// STATE.md tolerant parser — extracts frontmatter + decisions + blockers
// ---------------------------------------------------------------------------

function readStateSections(paths) {
  if (!fs.existsSync(paths.stateMdPath)) {
    return { frontmatter: {}, decisions: [], blockers: [], session: '' };
  }
  let body;
  try {
    body = fs.readFileSync(paths.stateMdPath, 'utf8');
  } catch {
    return { frontmatter: {}, decisions: [], blockers: [], session: '' };
  }

  // Extract YAML frontmatter (between leading '---' delimiters)
  const frontmatter = {};
  const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) frontmatter[m[1]] = m[2].trim();
    }
  }

  // Decisions: extract D-XX entries from a '<decisions>' or '## Decisions' section
  const decisions = [];
  const decisionsMatch = body.match(
    /(?:<decisions>|## Decisions)([\s\S]*?)(?:<\/decisions>|^##\s|\Z)/m,
  );
  if (decisionsMatch) {
    const dRe = /D-\d+:[^\n]+/g;
    let m2;
    while ((m2 = dRe.exec(decisionsMatch[1])) !== null) {
      decisions.push(m2[0].trim());
    }
  }

  // Blockers: similar to decisions
  const blockers = [];
  const blockersMatch = body.match(
    /(?:<blockers>|## Blockers)([\s\S]*?)(?:<\/blockers>|^##\s|\Z)/m,
  );
  if (blockersMatch) {
    const bRe = /B-\d+:[^\n]+/g;
    let m3;
    while ((m3 = bRe.exec(blockersMatch[1])) !== null) {
      blockers.push(m3[0].trim());
    }
  }

  // Session prefix (first ~500 chars after '## Session' or '<session>')
  const sessionMatch = body.match(/(?:## Session|<session>)([\s\S]{0,500})/);
  const session = sessionMatch ? sessionMatch[1].trim().slice(0, 500) : '';

  return { frontmatter, decisions, blockers, session };
}

// ---------------------------------------------------------------------------
// Events tail reader — JSONL-tolerant (malformed lines are skipped)
// ---------------------------------------------------------------------------

function readEventsTail(paths, count) {
  if (!fs.existsSync(paths.eventsPath)) return [];
  let body;
  try {
    body = fs.readFileSync(paths.eventsPath, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      /* tolerate malformed line — T-27.6.05-05 mitigation */
    }
  }
  return events.slice(-count);
}

// ---------------------------------------------------------------------------
// Retention prune — LRU by mtime, keep last RETENTION_COUNT (D-08)
// ---------------------------------------------------------------------------

function pruneSnapshots(paths) {
  let files;
  try {
    files = fs.readdirSync(paths.snapshotDir);
  } catch {
    return;
  }
  const jsonFiles = files
    .filter((f) => f.endsWith('.json') && f !== 'last-recap.json')
    .map((f) => ({ name: f, full: path.join(paths.snapshotDir, f), mtime: 0 }));

  for (const entry of jsonFiles) {
    try {
      entry.mtime = fs.statSync(entry.full).mtimeMs;
    } catch {
      /* swallow */
    }
  }

  jsonFiles.sort((a, b) => a.mtime - b.mtime);
  while (jsonFiles.length > RETENTION_COUNT) {
    const oldest = jsonFiles.shift();
    try {
      fs.unlinkSync(oldest.full);
    } catch {
      /* swallow — race with another writer; LRU eventually wins */
    }
  }
}

// ---------------------------------------------------------------------------
// Main — atomic write with lockfile serialization
// ---------------------------------------------------------------------------

async function main() {
  const harness = detectHarness();
  if (harness === 'codex') {
    // D-10: Codex has no PreCompact event; emit notice + exit. Tracked in
    // the runtime-parity matrix; full pre-large-context-action interception
    // is on the roadmap.
    process.stderr.write(
      '[gdd-precompact-snapshot] this harness does not emit PreCompact; snapshots disabled\n',
    );
    process.exit(0);
  }

  // Drain stdin and extract payload.cwd. Claude Code pipes a hook-event JSON
  // envelope including the project cwd; we need it to anchor SNAPSHOT_DIR and
  // friends correctly when the harness's process.cwd() at module load may not
  // match (e.g. when invoked from a worktree). Draining also avoids EPIPE on
  // the writer side. Falls back to process.cwd() when stdin is empty or
  // malformed (unit tests, direct invocation).
  let buf = '';
  try {
    for await (const chunk of process.stdin) buf += chunk;
  } catch {
    /* swallow — empty stdin is fine */
  }
  let payload = {};
  try {
    payload = JSON.parse(buf || '{}');
  } catch {
    /* malformed stdin → fall through with empty payload */
  }
  const cwd = (payload && typeof payload.cwd === 'string') ? payload.cwd : process.cwd();
  const paths = computePaths(cwd);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(paths.snapshotDir, ts + '.json');
  const tmpPath = snapshotPath + '.tmp';

  // Ensure snapshot dir exists (mkdir -p semantics).
  try {
    fs.mkdirSync(paths.snapshotDir, { recursive: true });
  } catch {
    /* swallow — write will fail loudly below if truly missing */
  }

  // Acquire lockfile on the target path (T-27.6.05-02 mitigation).
  // The lock file lives at <snapshotPath>.lock and serializes concurrent
  // PreCompact writers; the second writer either waits or fails-silent.
  let release = null;
  try {
    const lockfile = require('../sdk/primitives/lockfile.cjs');
    release = await lockfile.acquire(snapshotPath, {
      staleMs: 60_000,
      maxWaitMs: 10_000,
      pollMs: 50,
    });
  } catch (err) {
    process.stderr.write(
      '[gdd-precompact-snapshot] lock acquire failed: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
    process.exit(0);
  }

  try {
    const sections = readStateSections(paths);
    const events = readEventsTail(paths, EVENTS_TAIL_COUNT);
    const decisions = sections.decisions.slice(-DECISIONS_TAIL_COUNT);
    const cycleId =
      sections.frontmatter && sections.frontmatter.milestone
        ? sections.frontmatter.milestone
        : 'unknown';

    const snapshot = {
      schema_version: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      cycle_id: cycleId,
      state_md_sections: sections,
      last_n_events: events,
      last_n_decisions: decisions,
    };

    const body = JSON.stringify(snapshot, null, 2);

    // Atomic write: .tmp + rename (T-27.6.05-01 mitigation).
    // A SIGKILL between writeFileSync and renameSync leaves <snapshotPath>.tmp
    // orphaned but NEVER a partial file at <snapshotPath> itself.
    try {
      fs.writeFileSync(tmpPath, body, 'utf8');
      fs.renameSync(tmpPath, snapshotPath);
    } catch (err) {
      process.stderr.write(
        '[gdd-precompact-snapshot] atomic write failed: ' +
          (err && err.message ? err.message : String(err)) +
          '\n',
      );
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* swallow orphan cleanup */
      }
      process.exit(0);
    }

    // Retention prune (T-27.6.05-04 DoS mitigation).
    pruneSnapshots(paths);

    // Best-effort event emit.
    const appendEvent = getAppendEvent();
    try {
      appendEvent({
        type: 'snapshot.written',
        timestamp: new Date().toISOString(),
        sessionId: process.env.GDD_SESSION_ID || 'precompact-hook',
        payload: {
          path: snapshotPath,
          size_bytes: Buffer.byteLength(body, 'utf8'),
          events_count: events.length,
          decisions_count: decisions.length,
          harness,
        },
      });
    } catch {
      /* swallow — telemetry never blocks */
    }

    // Emit non-blocking continue verdict on stdout (matches other hooks).
    try {
      process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
    } catch {
      /* swallow */
    }

    process.exit(0);
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        /* swallow — stale-detection reclaims */
      }
    }
  }
}

main().catch((err) => {
  try {
    process.stderr.write(
      '[gdd-precompact-snapshot] uncaught: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
  } catch {
    /* swallow */
  }
  process.exit(0);
});
