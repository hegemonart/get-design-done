'use strict';
// scripts/lib/reflections-reader/index.cjs — Plan 27.7-02
//
// Read post-cycle reflections from <rootDir>/.design/reflections/.
//
// Surface:
//   class ReflectionsNotFoundError extends Error  — code='directory_not_found'
//   async readLatestReflection(rootDir)           — { cycle, path, content } | null
//   async readNReflections(rootDir, n)            — same shape, sorted desc by mtime
//   digestReflections(reflections)                — string, <= 5120 chars

const fs = require('node:fs');
const path = require('node:path');

const DIGEST_CAP_BYTES = 5120;

class ReflectionsNotFoundError extends Error {
  constructor(dir) {
    super('source directory not found: ' + dir);
    this.name = 'ReflectionsNotFoundError';
    this.code = 'directory_not_found';
    this.dir = dir;
  }
}

async function listReflectionFiles(dir) {
  const entries = await fs.promises.readdir(dir);
  const candidates = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    try {
      const stat = await fs.promises.stat(full);
      candidates.push({ name, full, mtime: stat.mtimeMs });
    } catch {
      // ignore — race with concurrent write
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates;
}

/** Extract a cycle id from a reflection filename. Convention: filenames
 *  like `2026-05-17-cycle27.7.md` or `cycle-NN.md`; we pick the first
 *  `cycle*` token, falling back to the basename. */
function extractCycle(name) {
  const m = name.match(/cycle[-_]?[\w.]+/i);
  if (m) return m[0];
  return name.replace(/\.md$/, '');
}

async function readLatestReflection(rootDir) {
  const dir = path.join(rootDir, '.design', 'reflections');
  if (!fs.existsSync(dir)) {
    throw new ReflectionsNotFoundError(dir);
  }
  const files = await listReflectionFiles(dir);
  if (files.length === 0) return null;
  const f = files[0];
  const content = await fs.promises.readFile(f.full, 'utf8');
  return { cycle: extractCycle(f.name), path: f.full, content };
}

async function readNReflections(rootDir, n) {
  const dir = path.join(rootDir, '.design', 'reflections');
  if (!fs.existsSync(dir)) {
    throw new ReflectionsNotFoundError(dir);
  }
  const files = await listReflectionFiles(dir);
  const take = Math.max(0, Math.min(n, files.length));
  const out = [];
  for (let i = 0; i < take; i++) {
    const f = files[i];
    const content = await fs.promises.readFile(f.full, 'utf8');
    out.push({ cycle: extractCycle(f.name), path: f.full, content });
  }
  return out;
}

/** Aggregate reflections into a compact digest <= 5 KB. Strategy: take
 *  the first 300 chars of each reflection's body (skipping any leading
 *  frontmatter `---` block); join with `\n---\n`; truncate at the cap. */
function digestReflections(reflections) {
  const parts = [];
  for (const r of reflections) {
    let body = r.content;
    // Strip leading YAML frontmatter if present
    if (body.startsWith('---')) {
      const closing = body.indexOf('\n---', 3);
      if (closing !== -1) body = body.slice(closing + 4).trim();
    }
    const excerpt = body.slice(0, 300).trim();
    parts.push('[' + r.cycle + '] ' + excerpt);
  }
  let joined = parts.join('\n---\n');
  if (joined.length > DIGEST_CAP_BYTES) {
    joined = joined.slice(0, DIGEST_CAP_BYTES);
  }
  return joined;
}

module.exports = {
  readLatestReflection,
  readNReflections,
  digestReflections,
  ReflectionsNotFoundError,
};
