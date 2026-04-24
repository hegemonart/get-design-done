'use strict';
/**
 * relevance-counter.cjs — tracks per-learning signal counts.
 *
 * Signals: 'cited' | 'surfaced' | 'dismissed'
 *
 * Writes to `.design/learnings/.relevance.json` under an atomic-write
 * pattern (write tmp → rename) guarded by a `.relevance.lock` file so
 * concurrent agents don't clobber each other.
 *
 * Public API:
 *   record(id, signal, designDir)  → void
 *   load(designDir)                → { [id]: { cited, surfaced, dismissed, last_used } }
 *   shouldPromote(id, designDir)   → boolean  (cited >= 8)
 *   shouldPrune(id, age, designDir) → boolean (cited === 0 and age >= 4 cycles)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SIGNALS = new Set(['cited', 'surfaced', 'dismissed']);
const PROMOTE_THRESHOLD = 8;

function _counterPath(designDir) {
  return path.join(designDir, 'learnings', '.relevance.json');
}

function _lockPath(designDir) {
  return path.join(designDir, 'learnings', '.relevance.lock');
}

function _acquireLock(lockPath, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Check for stale lock (> 30s old)
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > 30000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch { /* lock was removed between our check and unlink */ }
      // Brief spin
      const end = Date.now() + 50;
      while (Date.now() < end) { /* spin */ }
    }
  }
  return false;
}

function _releaseLock(lockPath) {
  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
}

function load(designDir) {
  const p = _counterPath(designDir);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Record a signal for a learning entry id.
 * @param {string} id      Learning ID (e.g. "L-01")
 * @param {'cited'|'surfaced'|'dismissed'} signal
 * @param {string} designDir  Path to the .design/ directory
 */
function record(id, signal, designDir) {
  if (!SIGNALS.has(signal)) throw new Error(`Unknown signal: ${signal}`);
  fs.mkdirSync(path.join(designDir, 'learnings'), { recursive: true });

  const lockPath = _lockPath(designDir);
  if (!_acquireLock(lockPath)) {
    // Non-fatal — skip the update rather than corrupting the store
    return;
  }

  try {
    const data = load(designDir);
    if (!data[id]) {
      data[id] = { cited: 0, surfaced: 0, dismissed: 0, last_used: null };
    }
    data[id][signal]++;
    data[id].last_used = new Date().toISOString();

    // Atomic write: tmp → rename
    const counterPath = _counterPath(designDir);
    const tmp = counterPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, counterPath);
  } finally {
    _releaseLock(lockPath);
  }
}

function shouldPromote(id, designDir) {
  const data = load(designDir);
  return (data[id]?.cited ?? 0) >= PROMOTE_THRESHOLD;
}

/**
 * @param {string} id
 * @param {number} ageCycles  number of cycles since last_used (or since created)
 * @param {string} designDir
 */
function shouldPrune(id, ageCycles, designDir) {
  const data = load(designDir);
  const entry = data[id];
  if (!entry) return false;
  return entry.cited === 0 && ageCycles >= 4;
}

module.exports = { record, load, shouldPromote, shouldPrune };
