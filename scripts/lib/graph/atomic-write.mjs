// scripts/lib/graph/atomic-write.mjs — Plan 30.6-02 Task 1
//
// Atomic JSON write seam per D-05: writeFile(tmp) + rename(tmp, target) in
// the SAME directory (Windows atomicity guarantee — fs.rename is only
// atomic across same-volume same-device renames). No proper-lockfile.
// Single-writer assumption for the design pipeline; revisit in Phase 41
// if multi-writer becomes a real need.

import {
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { dirname, basename, join } from 'node:path';

/**
 * Atomically write a JSON payload to `target` using the tmp+rename pattern.
 *
 * Guarantees:
 *   - Readers either see the previous file or the new file, never a
 *     partial write.
 *   - If rename fails, the tmp file is unlinked (no orphan tmp files).
 *   - Tmp file lives in the SAME directory as target (Windows-safe).
 *
 * @param {string} target  - Absolute or repo-relative path to final file
 * @param {unknown} payload - JSON-serializable value (stringified pretty 2-space)
 */
export function atomicWriteJson(target, payload) {
  const parent = dirname(target);
  const base = basename(target);
  const tmp = join(
    parent,
    `.${base}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
  );

  // Defense per D-05: assert tmp is in same dir as target (cross-device
  // rename is NOT atomic on Windows).
  if (dirname(tmp) !== parent) {
    throw new Error(
      `atomicWriteJson invariant: tmp not in same dir as target (tmp=${tmp}, target=${target})`,
    );
  }

  mkdirSync(parent, { recursive: true });

  const body = JSON.stringify(payload, null, 2) + '\n';

  try {
    writeFileSync(tmp, body, 'utf8');
    renameSync(tmp, target);
  } catch (err) {
    // Clean up orphan tmp file on failure (best-effort).
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        // Swallow cleanup errors — original throw takes precedence.
      }
    }
    throw err;
  }
}
