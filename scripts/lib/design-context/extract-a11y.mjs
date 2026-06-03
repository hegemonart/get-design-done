#!/usr/bin/env node
// scripts/lib/design-context/extract-a11y.mjs — Phase 52 (DesignContext graph), executor B.
//
// Deterministic, dependency-free accessibility extractor. Regex-scans source
// for ARIA attributes, role=, keyboard handlers, focus states, semantic
// landmarks, skip links, and image alt coverage, and emits a Fragment
// (schema_version 52.0) of `a11y-pattern` nodes with `documented-by` /
// `referenced-by` edges:
//   - component file --referenced-by--> a11y-pattern  (the file exhibits the pattern)
//   - a11y-pattern --documented-by--> wcag:<criterion> node  (when a known pattern
//     maps to a WCAG criterion we recognize)
//
// Semantics mirror agents/a11y-mapper.md (ARIA / keyboard / focus / landmarks /
// alt). Static-only — no live browser. Structural pass: summary='' and
// complexity='moderate' are stubs the LLM/mapper phase fills later. No network,
// no deps, no top-level Date.now() (stamped in main()).
//
// Public API:
//   extract(roots, opts?) -> Fragment   (pure)
//   main()                              -> prints Fragment JSON to stdout

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAPPER = 'a11y-mapper';
const SCHEMA_VERSION = '52.0';

const SCANNABLE_EXT = new Set([
  '.tsx', '.jsx', '.ts', '.js',
  '.vue', '.svelte', '.html', '.htm',
  '.css', '.scss',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.design', '.planning', 'out', '.cache', '.turbo', '.svelte-kit',
]);

function walk(root) {
  const out = [];
  let st;
  try { st = fs.statSync(root); } catch { return out; }
  if (st.isFile()) {
    if (SCANNABLE_EXT.has(path.extname(root).toLowerCase())) out.push(root);
    return out;
  }
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(full); }
      else if (e.isFile() && SCANNABLE_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}
function stubNode(id, type, name, extra) {
  return { id, type, name, summary: '', tags: [], complexity: 'moderate', ...extra };
}

// ---------------------------------------------------------------------------
// A11y matchers + WCAG mapping.
// ---------------------------------------------------------------------------

const ARIA_ATTR = /\baria-([a-z]+)\s*=/g;
const ROLE_ATTR = /\brole\s*=\s*["']([a-z]+)["']/g;
const KEYBOARD = /\b(?:tabIndex|tabindex|onKeyDown|onKeyPress|onKeyUp|on:keydown)\b/g;
const FOCUS_STATE = /:focus(?:-visible)?|focus-visible:|focus:/g;
const LANDMARK = /<(header|nav|main|section|article|aside|footer)\b/g;
const SKIP_LINK = /(?:skip-nav|skip-to-content|skip-link|#main-content)/g;
const IMG_TAG = /<img\b[^>]*>/gi;

// pattern-id -> WCAG criterion it satisfies/relates to.
const WCAG_FOR_PATTERN = {
  'aria-attributes': '4.1.2',
  'role-semantics': '4.1.2',
  'keyboard-support': '2.1.1',
  'focus-visible': '2.4.7',
  'semantic-landmarks': '1.3.1',
  'skip-link': '2.4.1',
  'image-alt': '1.1.1',
};

function collect(re, content, mapFn) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const v = mapFn(m);
    if (v != null) out.push(v);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Pure extractor.
 * @param {string[]|string} roots
 * @param {{generatedAt?: string}} [opts]
 * @returns {object} Fragment
 */
export function extract(roots, opts = {}) {
  const rootList = (Array.isArray(roots) ? roots : [roots]).filter(Boolean);
  const nodeMap = new Map();
  const edgeSet = new Map();

  const addPattern = (patternId, name, extra) => {
    const id = `a11y-pattern:${patternId}`;
    if (!nodeMap.has(id)) nodeMap.set(id, stubNode(id, 'a11y-pattern', name, extra || {}));
    return id;
  };
  const addEdge = (source, target, type, weight) => {
    const key = `${source}--${type}-->${target}`;
    if (!edgeSet.has(key)) edgeSet.set(key, { source, target, type, direction: 'forward', weight });
  };
  // a11y-pattern --documented-by--> wcag criterion node.
  const linkWcag = (patternKey, patternNodeId) => {
    const crit = WCAG_FOR_PATTERN[patternKey];
    if (!crit) return;
    const wid = `pattern:wcag-${slug(crit)}`;
    if (!nodeMap.has(wid)) nodeMap.set(wid, stubNode(wid, 'pattern', `WCAG ${crit}`, { criterion: crit }));
    addEdge(patternNodeId, wid, 'documented-by', 0.8);
  };

  for (const root of rootList) {
    for (const abs of walk(root)) {
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const ext = path.extname(abs).toLowerCase();
      const baseName = path.basename(abs, ext);
      const compId = `component:${slug(baseName)}`;

      // Detect each pattern family present in this file.
      const aria = collect(ARIA_ATTR, content, (m) => m[1]);
      const roles = collect(ROLE_ATTR, content, (m) => m[1]);
      const kbd = (content.match(KEYBOARD) || []).length;
      const focus = (content.match(FOCUS_STATE) || []).length;
      const landmarks = collect(LANDMARK, content, (m) => m[1]);
      const skip = (content.match(SKIP_LINK) || []).length;
      const imgs = collect(IMG_TAG, content, (m) => m[0]);

      const families = [];
      if (aria.length) families.push(['aria-attributes', 'ARIA attributes', { attributes: [...new Set(aria)].slice(0, 12) }]);
      if (roles.length) families.push(['role-semantics', 'ARIA role semantics', { roles: [...new Set(roles)].slice(0, 12) }]);
      if (kbd) families.push(['keyboard-support', 'Keyboard navigation', {}]);
      if (focus) families.push(['focus-visible', 'Focus-visible states', {}]);
      if (landmarks.length) families.push(['semantic-landmarks', 'Semantic landmarks', { landmarks: [...new Set(landmarks)] }]);
      if (skip) families.push(['skip-link', 'Skip link', {}]);
      if (imgs.length) {
        const withAlt = imgs.filter((t) => /\balt\s*=/.test(t)).length;
        families.push(['image-alt', 'Image alt coverage', { images: imgs.length, with_alt: withAlt }]);
      }

      for (const [key, name, extra] of families) {
        const pid = addPattern(key, name, extra);
        // The file *references* the a11y pattern.
        addEdge(compId, pid, 'referenced-by', 0.5);
        // The pattern is *documented-by* the WCAG criterion.
        linkWcag(key, pid);
      }
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    mapper: MAPPER,
    generated_at: opts.generatedAt || '',
    nodes: [...nodeMap.values()],
    edges: [...edgeSet.values()],
  };
}

export function main(argv = process.argv.slice(2)) {
  const roots = argv.length ? argv : [process.cwd()];
  const fragment = extract(roots, { generatedAt: new Date().toISOString() });
  process.stdout.write(JSON.stringify(fragment, null, 2) + '\n');
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
