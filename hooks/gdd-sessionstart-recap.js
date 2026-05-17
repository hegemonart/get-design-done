#!/usr/bin/env node
/**
 * hooks/gdd-sessionstart-recap.js — Plan 27.6-05
 *
 * Claude Code SessionStart hook. Emits a "what changed while you were
 * away" diff between the most-recent PreCompact snapshot and the
 * current STATE.md.
 *
 * Phase 27.6 D-09: markdown summary to stderr + structured JSON to
 *   `.design/snapshots/last-recap.json` (the JSON is a sidecar for
 *   downstream tools: progress dashboard, resume skill).
 * Phase 27.6 D-10: harness-aware Codex no-op (Phase 45 dep for full
 *   pre-large-context recap integration).
 *
 * Silent-on-failure: tolerable errors exit 0 with breadcrumb.
 * Emits `recap.emitted` event via lazy appendEvent (best-effort).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SNAPSHOT_DIR = path.resolve(process.cwd(), '.design', 'snapshots');
const STATE_MD_PATH = path.resolve(process.cwd(), '.design', 'STATE.md');
const EVENTS_PATH = path.resolve(process.cwd(), '.design', 'telemetry', 'events.jsonl');
const RECAP_JSON_PATH = path.join(SNAPSHOT_DIR, 'last-recap.json');
const SCHEMA_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Harness detection (D-10) — mirrors gdd-precompact-snapshot.js
// ---------------------------------------------------------------------------

function detectHarness() {
  const explicit = (process.env.CLAUDE_HARNESS || process.env.GDD_HARNESS || '')
    .toLowerCase()
    .trim();
  if (explicit === 'codex' || explicit === 'codex-cli') return 'codex';
  return 'claude-code';
}

// ---------------------------------------------------------------------------
// Lazy event-stream emit (best-effort)
// ---------------------------------------------------------------------------

function getAppendEvent() {
  try {
    const m = require('../scripts/lib/event-stream');
    if (m && typeof m.appendEvent === 'function') return m.appendEvent;
  } catch {
    /* swallow — event-stream is optional infrastructure */
  }
  return function noopAppend(_ev) {
    /* no-op */
  };
}

// ---------------------------------------------------------------------------
// STATE.md tolerant parser (lighter than the PreCompact version — only
// needs frontmatter + a flat decisions list for the diff)
// ---------------------------------------------------------------------------

function readStateMd() {
  if (!fs.existsSync(STATE_MD_PATH)) return { frontmatter: {}, decisions: [] };
  let body;
  try {
    body = fs.readFileSync(STATE_MD_PATH, 'utf8');
  } catch {
    return { frontmatter: {}, decisions: [] };
  }

  const frontmatter = {};
  const fmMatch = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.+)$/);
      if (m) frontmatter[m[1]] = m[2].trim();
    }
  }

  // All D-XX entries anywhere in the body — broad sweep is fine for diff.
  const decisions = [];
  const dRe = /D-\d+:[^\n]+/g;
  let m2;
  while ((m2 = dRe.exec(body)) !== null) {
    decisions.push(m2[0].trim());
  }
  return { frontmatter, decisions };
}

// ---------------------------------------------------------------------------
// Snapshot discovery — highest-mtime *.json (excluding last-recap.json)
// ---------------------------------------------------------------------------

function findLatestSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return null;
  let files;
  try {
    files = fs.readdirSync(SNAPSHOT_DIR);
  } catch {
    return null;
  }
  const candidates = files.filter(
    (f) => f.endsWith('.json') && f !== 'last-recap.json' && !f.endsWith('.tmp'),
  );
  if (candidates.length === 0) return null;

  let best = null;
  let bestMtime = -1;
  for (const name of candidates) {
    const full = path.join(SNAPSHOT_DIR, name);
    try {
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime > bestMtime) {
        best = full;
        bestMtime = mtime;
      }
    } catch {
      /* swallow */
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Event count since snapshot timestamp (JSONL-tolerant)
// ---------------------------------------------------------------------------

function countEventsSince(isoTimestamp) {
  if (!fs.existsSync(EVENTS_PATH)) return 0;
  let body;
  try {
    body = fs.readFileSync(EVENTS_PATH, 'utf8');
  } catch {
    return 0;
  }
  let count = 0;
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t.length === 0) continue;
    try {
      const ev = JSON.parse(t);
      if (typeof ev.timestamp === 'string' && ev.timestamp > isoTimestamp) {
        count++;
      }
    } catch {
      /* tolerate malformed */
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const harness = detectHarness();
  if (harness === 'codex') {
    // D-10: SessionStart on Codex skips recap; Phase 45 dep for full
    // pre-large-context-action integration.
    process.stderr.write('[gdd-sessionstart-recap] codex harness no-op (Phase 45 dep)\n');
    process.exit(0);
  }

  const snapshotPath = findLatestSnapshot();
  if (!snapshotPath) {
    process.stderr.write('[gdd-sessionstart-recap] no prior snapshot\n');
    process.exit(0);
  }

  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  } catch (err) {
    process.stderr.write(
      '[gdd-sessionstart-recap] snapshot unreadable: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
    process.exit(0);
  }

  const current = readStateMd();
  const priorDecisions = Array.isArray(snapshot.last_n_decisions)
    ? snapshot.last_n_decisions
    : [];
  const priorSet = new Set(priorDecisions);
  const newDecisions = current.decisions.filter((d) => !priorSet.has(d));
  const newEventCount = countEventsSince(snapshot.timestamp || '1970-01-01T00:00:00.000Z');

  const priorCycle = snapshot.cycle_id || 'unknown';
  const currentCycle = current.frontmatter.milestone || 'unknown';
  const cycleChanged = priorCycle !== currentCycle ? `${priorCycle} → ${currentCycle}` : null;

  const snapshotTime = snapshot.timestamp ? new Date(snapshot.timestamp).getTime() : 0;
  const timeElapsedMs =
    snapshotTime > 0 && Number.isFinite(snapshotTime) ? Date.now() - snapshotTime : 0;

  // Markdown summary to stderr (D-09).
  const md = [
    '## Session Recap',
    `Snapshot taken: ${snapshot.timestamp || 'unknown'}`,
    `Time elapsed: ${(timeElapsedMs / 60000).toFixed(1)} min`,
    cycleChanged ? `Cycle: ${cycleChanged}` : `Cycle: ${currentCycle} (unchanged)`,
    `New decisions: ${newDecisions.length}`,
    ...newDecisions.slice(0, 5).map((d) => `  - ${d}`),
    `New events since snapshot: ${newEventCount}`,
    '',
  ].join('\n');
  process.stderr.write(md + '\n');

  // JSON sidecar (D-09) — atomic .tmp + rename for consistency.
  const recap = {
    schema_version: SCHEMA_VERSION,
    previous_snapshot: snapshotPath,
    current_timestamp: new Date().toISOString(),
    diff: {
      new_decisions: newDecisions,
      new_events_since_snapshot: newEventCount,
      cycle_changed: cycleChanged,
      time_elapsed_ms: timeElapsedMs,
    },
  };

  try {
    // mkdir -p for safety — directory should exist if snapshotPath was found,
    // but defensive ensure for race conditions.
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    fs.writeFileSync(RECAP_JSON_PATH + '.tmp', JSON.stringify(recap, null, 2), 'utf8');
    fs.renameSync(RECAP_JSON_PATH + '.tmp', RECAP_JSON_PATH);
  } catch (err) {
    process.stderr.write(
      '[gdd-sessionstart-recap] sidecar write failed: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
  }

  // Best-effort event emit.
  const appendEvent = getAppendEvent();
  try {
    appendEvent({
      type: 'recap.emitted',
      timestamp: new Date().toISOString(),
      sessionId: process.env.GDD_SESSION_ID || 'sessionstart-hook',
      payload: {
        new_decisions: newDecisions.length,
        new_events: newEventCount,
        time_elapsed_ms: timeElapsedMs,
        harness,
      },
    });
  } catch {
    /* swallow */
  }

  // Emit non-blocking continue verdict on stdout.
  try {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    /* swallow */
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  try {
    process.stderr.write(
      '[gdd-sessionstart-recap] uncaught: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
  } catch {
    /* swallow */
  }
  process.exit(0);
}
