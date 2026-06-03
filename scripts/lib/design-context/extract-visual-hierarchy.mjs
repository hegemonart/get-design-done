#!/usr/bin/env node
// scripts/lib/design-context/extract-visual-hierarchy.mjs — Phase 52, executor B.
//
// Deterministic, dependency-free visual-hierarchy extractor. Regex-scans source
// for heading structure (<h1>..<h6>), type-scale steps (Tailwind text-* + CSS
// font-size), focal/hero weight signals, and layout patterns (flex/grid/
// F-/Z-/centered), and emits a Fragment (schema_version 52.0) of `layer` +
// `pattern` nodes with `composes` edges (heading-level layer -> next deeper
// level, capturing the document outline) and `referenced-by` edges
// (component file -> pattern it exhibits).
//
// Semantics mirror agents/visual-hierarchy-mapper.md (headings / type-scale /
// focal weight / layout patterns). Structural pass: summary='' and
// complexity='moderate' are stubs the LLM/mapper phase fills later. No network,
// no deps, no top-level Date.now() (stamped in main()).
//
// Public API:
//   extract(roots, opts?) -> Fragment   (pure)
//   main()                              -> prints Fragment JSON to stdout

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAPPER = 'visual-hierarchy-mapper';
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
// Visual-hierarchy matchers.
// ---------------------------------------------------------------------------

const HEADING = /<h([1-6])\b/g;
const TW_TEXT_SCALE = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g;
const CSS_FONTSIZE = /font-size\s*:\s*([0-9.]+(?:px|rem|em))/gi;
const HERO = /\b(?:hero|headline|display-[a-z0-9]+|page-title|page-heading)\b/g;
const LAYOUT = /\b(?:justify-(?:center|between|around|evenly)|items-center|grid-template|grid-cols-\d+|flex-(?:row|col)|flex-direction)\b/g;
const CENTERED = /\b(?:mx-auto|justify-center|items-center|place-items-center|text-center)\b/g;

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
  const headingLevels = new Set();      // numeric levels seen (1..6) across corpus
  const typeScaleSteps = new Set();     // text-* scale steps seen

  const addNode = (id, type, name, extra) => {
    if (!nodeMap.has(id)) nodeMap.set(id, stubNode(id, type, name, extra || {}));
    return id;
  };
  const addEdge = (source, target, type, weight) => {
    const key = `${source}--${type}-->${target}`;
    if (!edgeSet.has(key)) edgeSet.set(key, { source, target, type, direction: 'forward', weight });
  };

  for (const root of rootList) {
    for (const abs of walk(root)) {
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const ext = path.extname(abs).toLowerCase();
      const baseName = path.basename(abs, ext);
      const compId = `component:${slug(baseName)}`;

      // Heading levels -> layer nodes (one per level seen).
      for (const lvl of collect(HEADING, content, (m) => Number(m[1]))) {
        headingLevels.add(lvl);
        addNode(`layer:heading-h${lvl}`, 'layer', `Heading level h${lvl}`, { subtype: 'Template', level: lvl });
      }

      // Type-scale steps -> pattern nodes (the scale vocabulary in use).
      for (const step of collect(TW_TEXT_SCALE, content, (m) => m[1])) {
        typeScaleSteps.add(step);
        addNode(`pattern:type-scale-${slug(step)}`, 'pattern', `Type scale: text-${step}`, { step });
      }
      for (const size of collect(CSS_FONTSIZE, content, (m) => m[1])) {
        addNode(`pattern:type-scale-${slug(size)}`, 'pattern', `Type scale: ${size}`, { size });
      }

      // Focal / hero signals -> pattern node + referenced-by from the file.
      if ((content.match(HERO) || []).length) {
        const pid = addNode('pattern:focal-hero', 'pattern', 'Focal/hero emphasis', {});
        addEdge(compId, pid, 'referenced-by', 0.5);
      }

      // Layout patterns.
      if ((content.match(CENTERED) || []).length) {
        const pid = addNode('pattern:layout-centered-column', 'pattern', 'Centered column layout', {});
        addEdge(compId, pid, 'referenced-by', 0.4);
      } else if ((content.match(LAYOUT) || []).length) {
        const pid = addNode('pattern:layout-flow', 'pattern', 'Flex/grid flow layout', {});
        addEdge(compId, pid, 'referenced-by', 0.4);
      }
    }
  }

  // composes edges: connect each heading level to the next-deeper one present,
  // capturing the document-outline shape (h1 composes h2 composes h3 ...).
  const sortedLevels = [...headingLevels].sort((a, b) => a - b);
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    const src = `layer:heading-h${sortedLevels[i]}`;
    const dst = `layer:heading-h${sortedLevels[i + 1]}`;
    addEdge(src, dst, 'composes', 0.5);
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
