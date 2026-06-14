'use strict';
// Phase 41.5 — manifest/loader.cjs — the ONE shared reader for every cross-phase SoT manifest under
// scripts/lib/manifest/. Phases 42 (harnesses), 43/44 (prose denylist), 45 (capability matrix), and
// 47 (skill metadata) all read through here instead of hand-rolling their own loader + drift gate.
//
// Graceful (D-03): a missing or unparseable manifest returns the caller's `fallback` (an empty
// manifest) plus a one-line stderr warning — NEVER a throw — so a phase shipping before its data file
// exists does not crash. File-mtime cache (D-02): a file is re-read only when its mtime changes.
//
// Dep-free (no ajv here — validation lives in scripts/validate-manifest.cjs, the CI gate). No require
// of any third-party module.

const fs = require('node:fs');
const path = require('node:path');

const MANIFEST_DIR = __dirname;
const _cache = new Map(); // absPath -> { mtimeMs, data }

/** Clear the in-process cache (tests). */
function reset() { _cache.clear(); }

/**
 * Load a manifest JSON by base name (no extension).
 * @param {string} name e.g. 'harnesses' | 'skills' | 'prose-denylist'
 * @param {{ dir?: string, fallback?: any, quiet?: boolean }} [opts]
 * @returns the parsed manifest, or `fallback` (default {}) on missing/parse-error.
 */
function load(name, opts) {
  const o = opts || {};
  const dir = o.dir || MANIFEST_DIR;
  const fallback = Object.prototype.hasOwnProperty.call(o, 'fallback') ? o.fallback : {};
  const abs = path.join(dir, `${name}.json`);

  // Open once and operate on the file descriptor (fstat for the mtime-cache key,
  // then read from the same fd). A single handle resolves the path exactly once,
  // at open, so there is no statSync→readFileSync TOCTOU window.
  let fd;
  try { fd = fs.openSync(abs, 'r'); } catch {
    if (!o.quiet) process.stderr.write(`manifest: ${name}.json not found — using empty fallback (a consumer phase may not have shipped its data yet)\n`);
    return fallback;
  }
  try {
    const stat = fs.fstatSync(fd);
    const cached = _cache.get(abs);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
    const raw = fs.readFileSync(fd, 'utf8');
    try {
      const data = JSON.parse(raw);
      _cache.set(abs, { mtimeMs: stat.mtimeMs, data });
      return data;
    } catch (e) {
      if (!o.quiet) process.stderr.write(`manifest: ${name}.json parse error (${e.message}) — using empty fallback\n`);
      return fallback;
    }
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { load, reset, MANIFEST_DIR };
