'use strict';
// scripts/lib/mapper-spawn.cjs - Phase 54 (Composable Reference Addendums), executor B (COMP-01).
//
// Pre-spawn composition step for the explore mappers. Given a mapper name + a
// detected stack fingerprint, select the matching stack-addendum registry
// entries, read their bodies from the reference dir, and concat them into a
// single "## Stack-specific guidance" block that the runner appends to
// spec.prompt BEFORE spawnMapper (the agent bodies are NOT edited; addendums
// ride in spec.prompt).
//
// Design notes:
//   * PURE w.r.t. its inputs: takes a stack OBJECT (does NOT import
//     detect/stack.cjs - independent of executor A) and an explicit registry
//     object + refDir. Reads addendum file bodies via node:fs only.
//   * DEP-FREE (node:fs + node:path only) and NEVER throws. An absent
//     registry, an entry with no readable file, or a malformed stack all
//     degrade to an empty block; detected-but-unmatched stacks land in
//     `missing` so the runner can raise the fallback flag (R6).
//   * CAP 3 per spawn: at most one DS + one framework + one motion addendum.
//     A 4th category (or a second entry in the same category) is ignored.
//
// Matching rule (so executor F wires it + executors C/D/E name addendums
// consistently): each stack-addendum entry resolves to a {category, key}:
//   - category: explicit entry.kind / entry.category if present
//       ('system'|'framework'|'motion'), else inferred from the path dir
//       (reference/systems/* -> 'system', reference/frameworks/* ->
//       'framework', reference/motion/* -> 'motion').
//   - key: explicit entry.stack if present, else the path basename without
//       '.md', else the trailing '-'-segment of entry.name. Compared
//       case-insensitively.
//   The detected stack supplies the values to match:
//     stack.ds          matches a 'system'   addendum whose key === ds
//     stack.framework   matches a 'framework' addendum whose key === framework
//     stack.motion_libs matches a 'motion'    addendum whose key is in the list
//   The first matching entry per (category, value) wins; later duplicates are
//   skipped. This keeps the cap at 1+1+1 = 3 without any category priority math.

const fs = require('node:fs');
const path = require('node:path');

const BLOCK_HEADER = '## Stack-specific guidance';
const ADDENDUM_SEPARATOR = '\n\n---\n\n';

// Map a detected-stack field onto the addendum category it selects from.
// Order is the canonical 1 DS + 1 framework + 1 motion fill order.
const CATEGORY_ORDER = ['system', 'framework', 'motion'];

/** Lowercase + trim a value to a comparable key, or '' for non-strings. */
function normKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Path basename without a trailing `.md` (forward-slash + back-slash safe). */
function baseNameNoExt(p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  const tail = p.replace(/\\/g, '/').split('/').pop() || '';
  return tail.replace(/\.md$/i, '');
}

/**
 * Classify a stack-addendum registry entry into { category, key }.
 * `category` is one of CATEGORY_ORDER or null when it cannot be determined;
 * `key` is the normalized stack identifier ('' when absent).
 */
function classifyEntry(entry) {
  // Category: explicit kind/category wins, else infer from the path directory.
  let category = null;
  const explicitKind = normKey(entry.kind || entry.category);
  if (explicitKind === 'system' || explicitKind === 'ds' || explicitKind === 'design-system') {
    category = 'system';
  } else if (explicitKind === 'framework') {
    category = 'framework';
  } else if (explicitKind === 'motion') {
    category = 'motion';
  } else if (typeof entry.path === 'string') {
    const p = entry.path.replace(/\\/g, '/');
    if (/(^|\/)reference\/systems\//i.test(p) || /(^|\/)systems\//i.test(p)) category = 'system';
    else if (/(^|\/)reference\/frameworks\//i.test(p) || /(^|\/)frameworks\//i.test(p)) category = 'framework';
    else if (/(^|\/)reference\/motion\//i.test(p) || /(^|\/)motion\//i.test(p)) category = 'motion';
  }

  // Key: explicit `stack` field wins, else path basename, else name tail.
  let key = normKey(entry.stack);
  if (key === '') key = normKey(baseNameNoExt(entry.path));
  if (key === '') {
    // Fall back to the trailing '-'-segment of the entry name
    // (e.g. "addendum-system-tailwind" -> "tailwind").
    const nameParts = normKey(entry.name).split('-').filter(Boolean);
    key = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
  }

  return { category, key };
}

/** True when `entry` is a stack-addendum that composes into `mapperName`. */
function composesInto(entry, mapperName) {
  if (!entry || entry.type !== 'stack-addendum') return false;
  const list = entry.composes_into;
  if (!Array.isArray(list)) return false;
  return list.some((m) => normKey(m) === normKey(mapperName));
}

/**
 * Read an addendum body from disk. Returns the trimmed file contents, or null
 * when the file is missing / unreadable / empty. `entry.path` is resolved
 * relative to `refDir` when it is not already absolute; a leading
 * `reference/` segment is tolerated so registry paths (which are repo-root
 * relative, e.g. "reference/systems/tailwind.md") resolve against a refDir
 * that already points at the reference dir.
 */
function readAddendumBody(entry, refDir) {
  if (typeof entry.path !== 'string' || entry.path.length === 0) return null;
  const rel = entry.path.replace(/\\/g, '/');
  const candidates = [];
  if (path.isAbsolute(rel)) {
    candidates.push(rel);
  } else {
    candidates.push(path.resolve(refDir, rel));
    // refDir may itself be the `reference/` dir; strip a redundant leading
    // `reference/` so "reference/systems/x.md" still resolves.
    const stripped = rel.replace(/^reference\//i, '');
    if (stripped !== rel) candidates.push(path.resolve(refDir, stripped));
  }
  for (const abs of candidates) {
    let body;
    try {
      body = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const trimmed = body.replace(/\s+$/, '').replace(/^﻿/, '');
    if (trimmed.trim().length > 0) return trimmed;
  }
  return null;
}

/**
 * Compose the stack-specific guidance block for one mapper.
 *
 * @param {string} mapperName  the mapper the addendums must compose into
 *                             (e.g. "token-mapper").
 * @param {{ds?: string|null, framework?: string|null, motion_libs?: string[]}} stack
 *                             the detected stack fingerprint (executor A shape).
 *                             Null / undefined / {} -> empty block.
 * @param {{registry?: object, refDir?: string, cap?: number}} [opts]
 *        - registry: the parsed reference/registry.json object ({ entries: [] }).
 *        - refDir:   directory addendum `path`s resolve against (repo root or
 *                    the reference/ dir).
 *        - cap:      max addendums in the block (default 3).
 * @returns {{block: string, used: string[], missing: string[]}}
 *        - block:   "## Stack-specific guidance" text (incl. trailing bodies),
 *                   or '' when nothing matched.
 *        - used:    names (or path basenames) of the addendums included, in
 *                   system -> framework -> motion order.
 *        - missing: detected stack values that had NO matching addendum, in the
 *                   same order (drives the fallback flag).
 */
function composeAddendums(mapperName, stack, opts) {
  const used = [];
  const missing = [];
  const empty = () => ({ block: '', used, missing });

  const o = opts || {};
  const cap = Number.isInteger(o.cap) && o.cap >= 0 ? o.cap : 3;
  const refDir = typeof o.refDir === 'string' && o.refDir.length > 0 ? o.refDir : process.cwd();

  if (!stack || typeof stack !== 'object' || cap === 0) return empty();

  const registry = o.registry;
  const entries = registry && Array.isArray(registry.entries) ? registry.entries : [];

  // The detected value we want to match, per category.
  const detected = {
    system: normKey(stack.ds),
    framework: normKey(stack.framework),
    // motion is a list; take the first non-empty entry (cap allows only one
    // motion addendum, so the leading detected lib wins).
    motion: Array.isArray(stack.motion_libs)
      ? normKey(stack.motion_libs.find((m) => normKey(m) !== ''))
      : '',
  };

  // Pre-classify candidate entries (only those composing into this mapper).
  const candidates = [];
  for (const entry of entries) {
    if (!composesInto(entry, mapperName)) continue;
    const { category, key } = classifyEntry(entry);
    if (category === null || key === '') continue;
    candidates.push({ entry, category, key });
  }

  const bodies = [];
  for (const category of CATEGORY_ORDER) {
    if (used.length >= cap) break;
    const want = detected[category];
    if (want === '') continue; // nothing detected in this category

    const hit = candidates.find((c) => c.category === category && c.key === want);
    if (!hit) {
      // Detected this stack but no addendum registered for it -> fallback flag.
      missing.push(want);
      continue;
    }
    const body = readAddendumBody(hit.entry, refDir);
    if (body === null) {
      // Entry exists but the file is missing/empty: treat as no coverage.
      missing.push(want);
      continue;
    }
    bodies.push(body);
    used.push(typeof hit.entry.name === 'string' && hit.entry.name.length > 0
      ? hit.entry.name
      : hit.key);
  }

  if (bodies.length === 0) return empty();

  const block = `${BLOCK_HEADER}\n\n${bodies.join(ADDENDUM_SEPARATOR)}`;
  return { block, used, missing };
}

/**
 * Pre-spawn mutation helper for the explore runner. Composes the addendum
 * block for `spec.name` and, when non-empty, APPENDS it to `spec.prompt`
 * (separated by a blank line). Returns the same `spec` object (mutated in
 * place) plus the compose metadata so the caller can surface `missing`.
 *
 * Backward-compatible + additive: an empty block leaves `spec.prompt`
 * byte-for-byte unchanged. Never throws: a malformed spec returns unchanged
 * with empty metadata.
 *
 * @param {{name?: string, prompt?: string}} spec  a MapperSpec-shaped object.
 * @param {object} stack  detected stack (see composeAddendums).
 * @param {object} [opts] registry/refDir/cap (see composeAddendums).
 * @returns {{spec: object, block: string, used: string[], missing: string[]}}
 */
function applyAddendums(spec, stack, opts) {
  if (!spec || typeof spec !== 'object') {
    return { spec, block: '', used: [], missing: [] };
  }
  const mapperName = typeof spec.name === 'string' ? spec.name : '';
  const { block, used, missing } = composeAddendums(mapperName, stack, opts);
  if (block !== '') {
    const base = typeof spec.prompt === 'string' ? spec.prompt : '';
    spec.prompt = base === '' ? block : `${base}\n\n${block}`;
  }
  return { spec, block, used, missing };
}

module.exports = {
  composeAddendums,
  applyAddendums,
  // Exported for unit-level coverage + reuse by the runner wiring (executor F).
  classifyEntry,
  composesInto,
  BLOCK_HEADER,
};
