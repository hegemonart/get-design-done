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

const SCHEMA_VERSION = '1.0.0';

/**
 * Resolve the bundle of paths the hook reads/writes, anchored at `cwd`.
 *
 * Phase 27.6 originally resolved these at module load via `process.cwd()`,
 * which is the wrong anchor when Claude Code invokes the hook from a
 * worktree (the harness's cwd at module load can be the parent / `.claude`
 * directory, not the project root). Resolving against `payload.cwd` matches
 * how 8 sibling hooks already work (gdd-protected-paths, gdd-fact-force,
 * gdd-decision-injector, gdd-mcp-circuit-breaker, gdd-a11y-gate,
 * gdd-design-quality-check, gdd-risk-gate, gdd-turn-closeout).
 */
function computePaths(cwd) {
  const snapshotDir = path.resolve(cwd, '.design', 'snapshots');
  return {
    snapshotDir,
    stateMdPath: path.resolve(cwd, '.design', 'STATE.md'),
    eventsPath: path.resolve(cwd, '.design', 'telemetry', 'events.jsonl'),
    recapJsonPath: path.join(snapshotDir, 'last-recap.json'),
  };
}

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
// Event emit (best-effort) — delegate to the shared _hook-emit helper, which
// uses the SDK writer when loadable (modern Node) and an inline JSONL appender
// otherwise. The previous direct `require('../sdk/event-stream')` resolved to
// the `.ts` ESM index and threw under plain `node` on Node 22.0–22.17, leaving
// recap.emitted permanently no-op'd. emitEvent lands the line on every Node.
// ---------------------------------------------------------------------------

function getEmitEvent() {
  try {
    const m = require('./_hook-emit.js');
    if (m && typeof m.emitEvent === 'function') return m.emitEvent;
  } catch {
    /* swallow — telemetry is optional infrastructure */
  }
  return function noopEmit(_ev) {
    /* no-op */
  };
}

// ---------------------------------------------------------------------------
// STATE.md tolerant parser (lighter than the PreCompact version — only
// needs frontmatter + a flat decisions list for the diff)
// ---------------------------------------------------------------------------

function readStateMd(paths) {
  if (!fs.existsSync(paths.stateMdPath)) return { frontmatter: {}, decisions: [] };
  let body;
  try {
    body = fs.readFileSync(paths.stateMdPath, 'utf8');
  } catch {
    return { frontmatter: {}, decisions: [] };
  }

  const frontmatter = {};
  // Tolerate CRLF line endings — the STATE.md mutator preserves CRLF, so a
  // strict `\n`-only anchor fails to match the frontmatter block on Windows
  // checkouts and the recap silently reports an empty cycle/decisions diff.
  const fmMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
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

function findLatestSnapshot(paths) {
  if (!fs.existsSync(paths.snapshotDir)) return null;
  let files;
  try {
    files = fs.readdirSync(paths.snapshotDir);
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
    const full = path.join(paths.snapshotDir, name);
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

function countEventsSince(paths, isoTimestamp) {
  if (!fs.existsSync(paths.eventsPath)) return 0;
  let body;
  try {
    body = fs.readFileSync(paths.eventsPath, 'utf8');
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

async function main() {
  const harness = detectHarness();
  if (harness === 'codex') {
    // D-10: SessionStart on Codex skips recap. Tracked in the runtime-parity
    // matrix; full pre-large-context-action integration is on the roadmap.
    process.stderr.write('[gdd-sessionstart-recap] codex harness no-op\n');
    process.exit(0);
  }

  // Drain stdin and extract payload.cwd (Claude Code SessionStart pipes a JSON
  // envelope). Falls back to process.cwd() when stdin is empty (unit tests,
  // direct invocation).
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

  const snapshotPath = findLatestSnapshot(paths);
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

  const current = readStateMd(paths);
  const priorDecisions = Array.isArray(snapshot.last_n_decisions)
    ? snapshot.last_n_decisions
    : [];
  const priorSet = new Set(priorDecisions);
  const newDecisions = current.decisions.filter((d) => !priorSet.has(d));
  const newEventCount = countEventsSince(paths, snapshot.timestamp || '1970-01-01T00:00:00.000Z');

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
    fs.mkdirSync(paths.snapshotDir, { recursive: true });
    fs.writeFileSync(paths.recapJsonPath + '.tmp', JSON.stringify(recap, null, 2), 'utf8');
    fs.renameSync(paths.recapJsonPath + '.tmp', paths.recapJsonPath);
  } catch (err) {
    process.stderr.write(
      '[gdd-sessionstart-recap] sidecar write failed: ' +
        (err && err.message ? err.message : String(err)) +
        '\n',
    );
  }

  // Best-effort event emit.
  const emitEvent = getEmitEvent();
  try {
    emitEvent({
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

// `main` is async: a sync try/catch cannot observe a rejected promise, so a
// throw inside an `await` boundary would escape as an unhandled rejection and
// exit non-zero — violating the silent-exit-0 contract for SessionStart hooks.
// Attach `.catch` so every failure mode is swallowed and we exit 0.
main().catch((err) => {
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
});
