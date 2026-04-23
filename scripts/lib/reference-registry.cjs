'use strict';
/**
 * scripts/lib/reference-registry.cjs — typed index over reference/*.md.
 *
 * Exports:
 *   list({type}) → Entry[]            (filter by type; omit to return all)
 *   find(name)   → Entry | null       (exact-name lookup)
 *   validateRegistry({cwd})           → { ok, missingInRegistry, danglingInRegistry, duplicates }
 *   loadRegistry({cwd}) → Registry    (read-through; caches at module scope)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REGISTRY_PATH = path.join(REPO_ROOT, 'reference', 'registry.json');

let _cache = null;
let _cachePath = null;

function loadRegistry({ cwd } = {}) {
  const p = cwd ? path.join(cwd, 'reference', 'registry.json') : DEFAULT_REGISTRY_PATH;
  if (_cache && _cachePath === p) return _cache;
  _cachePath = p;
  _cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  return _cache;
}

function list({ type, cwd } = {}) {
  const reg = loadRegistry({ cwd });
  if (!type) return reg.entries.slice();
  return reg.entries.filter(e => e.type === type);
}

function find(name, { cwd } = {}) {
  const reg = loadRegistry({ cwd });
  return reg.entries.find(e => e.name === name) || null;
}

/**
 * Walk reference/*.md + reference/*.json (excluding schemas/**, data/**) and
 * compare to the registry. Returns:
 *   - missingInRegistry : files on disk not referenced by any entry
 *   - danglingInRegistry: entries whose paths do not exist on disk
 *   - duplicates         : entries sharing the same `name` OR the same `path`
 */
function validateRegistry({ cwd } = {}) {
  const root = cwd || REPO_ROOT;
  const refDir = path.join(root, 'reference');
  const reg = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(refDir, 'registry.json'), 'utf8')); }
    catch { return { entries: [] }; }
  })();

  const onDisk = new Set();
  for (const leaf of walk(refDir)) {
    const rel = path.relative(root, leaf).replace(/\\/g, '/');
    // Exclude registry itself, all .schema.json files (non-registerable),
    // schemas tree, data tree, and non-md/non-json files.
    if (rel === 'reference/registry.json') continue;
    if (rel.endsWith('.schema.json')) continue;
    if (rel.startsWith('reference/schemas/')) continue;
    if (rel.startsWith('reference/data/')) continue;
    if (!/\.(md|json)$/.test(rel)) continue;
    onDisk.add(rel);
  }

  const registryPaths = new Set(reg.entries.map(e => e.path));
  const missingInRegistry = [...onDisk].filter(p => !registryPaths.has(p)).sort();
  const danglingInRegistry = reg.entries
    .filter(e => !fs.existsSync(path.join(root, e.path)))
    .map(e => ({ name: e.name, path: e.path }));

  const nameCount = {}, pathCount = {};
  for (const e of reg.entries) {
    nameCount[e.name] = (nameCount[e.name] || 0) + 1;
    pathCount[e.path] = (pathCount[e.path] || 0) + 1;
  }
  const duplicates = [];
  for (const [k, v] of Object.entries(nameCount)) if (v > 1) duplicates.push({ kind: 'name', key: k, count: v });
  for (const [k, v] of Object.entries(pathCount)) if (v > 1) duplicates.push({ kind: 'path', key: k, count: v });

  return {
    ok: missingInRegistry.length === 0 && danglingInRegistry.length === 0 && duplicates.length === 0,
    missingInRegistry,
    danglingInRegistry,
    duplicates,
  };
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

module.exports = { list, find, validateRegistry, loadRegistry };
