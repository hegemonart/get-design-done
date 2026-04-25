#!/usr/bin/env node
/**
 * _js-harness.cjs — child process worker for js-const.cjs.
 *
 * Reads argv[2] as a file path, attempts to require() it (CJS first,
 * then dynamic import for ESM), extracts tokens per recognised shapes,
 * prints `{tokens: ..., error?: string}` JSON on stdout, exits 0.
 *
 * Never throws — errors are returned as JSON so the parent can render
 * them as warnings.
 */

'use strict';

const target = process.argv[2];

function main() {
  if (!target) {
    return { tokens: {}, error: 'no-target' };
  }
  // Try CJS require first.
  try {
    // eslint-disable-next-line node/no-missing-require, global-require
    const mod = require(target);
    return { tokens: extract(mod) };
  } catch (cjsErr) {
    // Fall through to dynamic import.
  }
  // ESM dynamic import — async; wrap in IIFE.
  return new Promise((resolve) => {
    const url = require('node:url').pathToFileURL(target).href;
    import(url).then(
      (mod) => {
        const candidate = mod.tokens ?? mod.default?.tokens ?? mod.default ?? mod;
        resolve({ tokens: extract(candidate) });
      },
      (err) => resolve({ tokens: {}, error: `import-failed: ${err.message || String(err)}` }),
    );
  });
}

function extract(mod) {
  if (mod && typeof mod === 'object') {
    if (mod.tokens && typeof mod.tokens === 'object') return mod.tokens;
    if (mod.default && typeof mod.default === 'object' && mod.default.tokens) {
      return mod.default.tokens;
    }
    return mod;
  }
  return {};
}

Promise.resolve(main()).then(
  (result) => {
    try {
      process.stdout.write(JSON.stringify(result));
    } catch {
      process.stdout.write(JSON.stringify({ tokens: {}, error: 'stringify-failed' }));
    }
    process.exit(0);
  },
  (err) => {
    process.stdout.write(JSON.stringify({ tokens: {}, error: String(err) }));
    process.exit(0);
  },
);
