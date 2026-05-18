'use strict';
// scripts/lib/snapshot-reader/index.cjs — Plan 27.7-02
//
// Read latest snapshot under .design/snapshots/ (written by
// hooks/gdd-precompact-snapshot.js; see Phase 27.6 Plan 05).
//
// Surface:
//   class SnapshotNotFoundError extends Error  — code='directory_not_found'
//   async readLatestSnapshot(rootDir)          — { since, snapshot } | null
//
// `since` is the snapshot's embedded `timestamp` (ISO 8601), falling
// back to the file's mtime if absent.

const fs = require('node:fs');
const path = require('node:path');

class SnapshotNotFoundError extends Error {
  constructor(dir) {
    super('source directory not found: ' + dir);
    this.name = 'SnapshotNotFoundError';
    this.code = 'directory_not_found';
    this.dir = dir;
  }
}

/**
 * Read the newest *.json file under <rootDir>/.design/snapshots/.
 * Returns `{ since, snapshot }` or `null` when the directory exists
 * but contains no snapshot files. Throws SnapshotNotFoundError when
 * the directory itself is missing.
 */
async function readLatestSnapshot(rootDir) {
  const dir = path.join(rootDir, '.design', 'snapshots');
  if (!fs.existsSync(dir)) {
    throw new SnapshotNotFoundError(dir);
  }
  const entries = await fs.promises.readdir(dir);
  const candidates = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (name === 'last-recap.json') continue;
    const full = path.join(dir, name);
    try {
      const stat = await fs.promises.stat(full);
      candidates.push({ full, mtime: stat.mtimeMs });
    } catch {
      // ignore — race with retention prune
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  const winner = candidates[0];
  const body = await fs.promises.readFile(winner.full, 'utf8');
  let snapshot;
  try {
    snapshot = JSON.parse(body);
  } catch (err) {
    // Malformed snapshot — surface a parseable error
    throw new Error(
      'snapshot parse failed: ' + winner.full + ': ' + (err && err.message ? err.message : String(err)),
    );
  }
  const since =
    typeof snapshot.timestamp === 'string' && snapshot.timestamp.length > 0
      ? snapshot.timestamp
      : new Date(winner.mtime).toISOString();
  return { since, snapshot };
}

module.exports = { readLatestSnapshot, SnapshotNotFoundError };
