/**
 * reference-resolver.cjs — `type:<key>` → registry entry + excerpt
 * (Plan 23-05).
 *
 * Builds on `scripts/lib/reference-registry.cjs#list` (Phase 14.5).
 * Adds the resolution direction: given a key surfaced by an agent
 * author, return the single matching entry plus a short excerpt
 * suitable for inlining into prompts.
 *
 * Lookup order (first match wins):
 *   1. exact `name` match
 *   2. slug match against path basename without extension
 *   3. singularize fuzzy match (strip trailing 's')
 *   4. type==key AND only one entry exists at that type
 *
 * Ambiguous match → throws RangeError with candidate list.
 * No match → returns null.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const registry = require('./reference-registry.cjs');

/**
 * @typedef {Object} ResolverHit
 * @property {string} name
 * @property {string} path
 * @property {string} type
 * @property {string} excerpt
 * @property {string} [tier]
 */

const DEFAULT_MAX_CHARS = 200;

/**
 * Pull a 200-char excerpt from a markdown file. Strips frontmatter,
 * fences, comments, headers; collapses whitespace; truncates with `'…'`.
 *
 * @param {string} absolutePath
 * @param {{maxChars?: number}} [opts]
 * @returns {string}
 */
function excerptOf(absolutePath, opts = {}) {
  const maxChars = typeof opts.maxChars === 'number' ? opts.maxChars : DEFAULT_MAX_CHARS;
  let raw;
  try {
    raw = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return '';
  }
  // Drop YAML frontmatter.
  raw = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  // Drop fenced code blocks.
  raw = raw.replace(/```[\s\S]*?```/g, '');
  // Drop HTML comments.
  raw = raw.replace(/<!--[\s\S]*?-->/g, '');
  // Drop heading lines.
  raw = raw.replace(/^#{1,6}\s.*$/gm, '');
  // Take first non-empty paragraph.
  const paragraphs = raw.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return '';
  let p = paragraphs[0].replace(/\s+/g, ' ').trim();
  if (p.length > maxChars) {
    p = p.slice(0, Math.max(0, maxChars - 1)) + '…';
  }
  return p;
}

/**
 * Map a registry entry + cwd to a ResolverHit.
 */
function hitFor(entry, cwd) {
  const abs = path.resolve(cwd, entry.path);
  /** @type {ResolverHit} */
  const hit = {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    excerpt: excerptOf(abs),
  };
  if (entry.tier) hit.tier = entry.tier;
  return hit;
}

/**
 * Resolve `type:<key>` (or bare `<key>`) to a single registry hit.
 *
 * @param {string} typeKey
 * @param {{cwd?: string}} [opts]
 * @returns {ResolverHit | null}
 */
function resolve(typeKey, opts = {}) {
  if (typeof typeKey !== 'string' || typeKey.length === 0) return null;
  const cwd = opts.cwd ?? path.resolve(__dirname, '..', '..');
  const key = typeKey.replace(/^type:/, '').trim().toLowerCase();
  if (key.length === 0) return null;
  const all = registry.list({ cwd });

  // 1. Exact name match.
  const exact = all.find((e) => e.name.toLowerCase() === key);
  if (exact) return hitFor(exact, cwd);

  // 2. Slug match against path basename (no extension).
  const bySlug = all.filter((e) => {
    const slug = path.posix.basename(e.path, path.posix.extname(e.path)).toLowerCase();
    return slug === key;
  });
  if (bySlug.length === 1) return hitFor(bySlug[0], cwd);
  if (bySlug.length > 1) {
    throw new RangeError(
      `reference-resolver: ambiguous slug match for "${typeKey}" — candidates: ${bySlug.map((e) => e.name).join(', ')}`,
    );
  }

  // 3. Singularize: strip trailing 's' from key, then prefix-match name.
  if (key.endsWith('s') && key.length > 1) {
    const stem = key.slice(0, -1);
    const stemHits = all.filter((e) => e.name.toLowerCase().startsWith(stem));
    if (stemHits.length === 1) return hitFor(stemHits[0], cwd);
    if (stemHits.length > 1) {
      throw new RangeError(
        `reference-resolver: ambiguous singularize match for "${typeKey}" — candidates: ${stemHits.map((e) => e.name).join(', ')}`,
      );
    }
  }

  // 4. type==key AND single entry at that type.
  const byType = all.filter((e) => e.type.toLowerCase() === key);
  if (byType.length === 1) return hitFor(byType[0], cwd);
  if (byType.length > 1) {
    throw new RangeError(
      `reference-resolver: ambiguous type-only match for "${typeKey}" — multiple entries at type=${key}: ${byType.map((e) => e.name).join(', ')}`,
    );
  }

  return null;
}

/**
 * Bulk resolver — used by the prompt-builder.
 *
 * @param {string[]} typeKeys
 * @param {{cwd?: string, ignoreMissing?: boolean}} [opts]
 * @returns {ResolverHit[]}
 */
function resolveAll(typeKeys, opts = {}) {
  if (!Array.isArray(typeKeys)) {
    throw new TypeError('reference-resolver: typeKeys must be an array');
  }
  /** @type {ResolverHit[]} */
  const hits = [];
  /** @type {string[]} */
  const missing = [];
  for (const k of typeKeys) {
    const h = resolve(k, opts);
    if (h) hits.push(h);
    else missing.push(k);
  }
  if (missing.length > 0 && !opts.ignoreMissing) {
    throw new Error(
      `reference-resolver: unresolved keys: ${missing.join(', ')}. Pass {ignoreMissing: true} to skip.`,
    );
  }
  return hits;
}

module.exports = {
  resolve,
  resolveAll,
  excerptOf,
  DEFAULT_MAX_CHARS,
};
