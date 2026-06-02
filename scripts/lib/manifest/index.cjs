'use strict';
// Phase 41.5 — manifest/index.cjs — typed readers over the shared loader. Every cross-phase consumer
// imports from here: `const { readHarnesses } = require('scripts/lib/manifest')`. Each reader returns
// a well-shaped object even when the underlying file is absent (graceful empty fallback per loader D-03).

const loader = require('./loader.cjs');

/** @returns {{ schema_version: number, generated_at: string|null, harnesses: object[] }} */
function readHarnesses(opts) {
  return loader.load('harnesses', { ...opts, fallback: { schema_version: 1, generated_at: null, harnesses: [] } });
}

/** @returns {{ schema_version: number, skills: object[] }} */
function readSkills(opts) {
  return loader.load('skills', { ...opts, fallback: { schema_version: 1, skills: [] } });
}

/** @returns {{ schema_version: number, tells: object[] }} */
function readProseDenylist(opts) {
  return loader.load('prose-denylist', { ...opts, fallback: { schema_version: 1, tells: [] } });
}

module.exports = {
  readHarnesses, readSkills, readProseDenylist,
  reset: loader.reset, MANIFEST_DIR: loader.MANIFEST_DIR,
};
