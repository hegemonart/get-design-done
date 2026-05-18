'use strict';
// scripts/lib/intel-store/index.cjs — Plan 27.7-02
//
// Slice reader over <rootDir>/.design/intel/<slice_id>.json. Different
// surface from scripts/lib/design-search.cjs (which does cross-cycle
// FTS/grep recall) — see CONTEXT.md Warning #7.
//
// Surface:
//   class IntelNotFoundError extends Error    — code='directory_not_found'
//   async readSlice(rootDir, sliceId)         — parsed slice | null
//   listSlices(rootDir)                       — string[] of slice ids

const fs = require('node:fs');
const path = require('node:path');

class IntelNotFoundError extends Error {
  constructor(dir) {
    super('source directory not found: ' + dir);
    this.name = 'IntelNotFoundError';
    this.code = 'directory_not_found';
    this.dir = dir;
  }
}

/** Read slice <rootDir>/.design/intel/<sliceId>.json. Returns parsed
 *  JSON or `null` if the slice file is missing. Throws
 *  IntelNotFoundError when the intel directory itself is absent. */
async function readSlice(rootDir, sliceId) {
  const dir = path.join(rootDir, '.design', 'intel');
  if (!fs.existsSync(dir)) {
    throw new IntelNotFoundError(dir);
  }
  const file = path.join(dir, sliceId + '.json');
  if (!fs.existsSync(file)) return null;
  const body = await fs.promises.readFile(file, 'utf8');
  return JSON.parse(body);
}

/** List slice ids (file basenames without extension) under .design/intel/.
 *  Throws IntelNotFoundError when the directory is absent. */
function listSlices(rootDir) {
  const dir = path.join(rootDir, '.design', 'intel');
  if (!fs.existsSync(dir)) {
    throw new IntelNotFoundError(dir);
  }
  const entries = fs.readdirSync(dir);
  const ids = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    ids.push(name.slice(0, -'.json'.length));
  }
  return ids;
}

module.exports = { readSlice, listSlices, IntelNotFoundError };
