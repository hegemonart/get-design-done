#!/usr/bin/env node
// scripts/lib/design-context/extract-components.mjs — Phase 52 (DesignContext graph), executor B.
//
// Deterministic, dependency-free component extractor. Regex-scans component
// files (.tsx/.jsx/.vue/.svelte) for component definitions/exports, classifies
// each as Atomic / Molecular / Organism via import + composition heuristics, and
// emits a Fragment (schema_version 52.0) of `component` + `variant` + `layer`
// nodes with `composes` / `extends` edges.
//
// Heuristics (mirrors agents/component-taxonomy-mapper.md semantics):
//   - Atomic    : composes 0 other detected components
//   - Molecular  : composes 1-4 other detected components
//   - Organism  : composes 5+ OR is route/page-shaped (Page/Screen/Layout/View name)
// A `variant` node is emitted when a `variant`/`size`/`intent` prop union or a
// cva()/tv() variants block is detected; the variant `extends` its component.
// A `layer` node (subtype Atomic/Molecular/Organism) is emitted per distinct
// layer and the component `composes`... is captured component->component.
//
// Structural pass only: summary='' and complexity='moderate' are stubs the
// LLM/mapper phase fills later (validator soft-warns). No network, no deps, no
// top-level Date.now() (stamped in main()).
//
// Public API:
//   extract(roots, opts?) -> Fragment   (pure)
//   main()                              -> prints Fragment JSON to stdout

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAPPER = 'component-taxonomy-mapper';
const SCHEMA_VERSION = '52.0';

const COMPONENT_EXT = new Set(['.tsx', '.jsx', '.vue', '.svelte']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.design', '.planning', 'out', '.cache', '.turbo', '.svelte-kit',
]);

const ORGANISM_NAME = /(Page|Screen|Layout|View|Dashboard|Shell|Provider)$/;

/** Recursively collect component files under `root`. */
function walk(root) {
  const out = [];
  let st;
  try { st = fs.statSync(root); } catch { return out; }
  if (st.isFile()) {
    if (COMPONENT_EXT.has(path.extname(root).toLowerCase())) out.push(root);
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
      else if (e.isFile() && COMPONENT_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
  return out;
}

function slug(s) {
  return String(s).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
}

// Canonical component id — lowercased so it MATCHES the file-basename-derived
// `component:<basename>` ids produced by the token / a11y / visual-hierarchy
// extractors. Component identity is case-insensitive across the graph so that a
// `referenced-by` edge from a11y (which only knows the filename) recovers
// against the `component` node defined here (which knows the export name).
// Cross-fragment edge recovery in merge-fragments.mjs depends on this.
function componentId(name) {
  return `component:${slug(name).toLowerCase()}`;
}

function stubNode(id, type, name, extra) {
  return { id, type, name, summary: '', tags: [], complexity: 'moderate', ...extra };
}

// ---------------------------------------------------------------------------
// Component detection.
// ---------------------------------------------------------------------------

// React/TS component definitions: function decl, arrow const, class, default export.
const DEF_FN = /(?:export\s+(?:default\s+)?)?function\s+([A-Z][A-Za-z0-9]*)\s*\(/g;
const DEF_ARROW = /(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*(?::\s*[A-Za-z0-9_.<>,\s]+)?=\s*(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>/g;
const DEF_CLASS = /(?:export\s+(?:default\s+)?)?class\s+([A-Z][A-Za-z0-9]*)\s+extends\s+(?:React\.)?(?:Pure)?Component\b/g;
const DEF_MEMO = /(?:export\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(?:React\.)?(?:memo|forwardRef)\s*\(/g;

// JSX usage of a capitalized tag → a composed child component.
const JSX_USE = /<([A-Z][A-Za-z0-9]*)[\s/>]/g;

// Variant signals.
const VARIANT_PROP = /\b(?:variant|intent|size|tone|appearance|kind)\??\s*:\s*([^;\n}]+)/g;
const CVA_BLOCK = /\b(?:cva|tv|cssVariants)\s*\(/g;

function collect(re, content, mapFn) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const v = mapFn(m);
    if (v) out.push(v);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** Detect component definitions in one file. Returns array of names. */
function definedComponents(content, ext, baseName) {
  const names = new Set();
  if (ext === '.tsx' || ext === '.jsx') {
    for (const n of collect(DEF_FN, content, (m) => m[1])) names.add(n);
    for (const n of collect(DEF_ARROW, content, (m) => m[1])) names.add(n);
    for (const n of collect(DEF_CLASS, content, (m) => m[1])) names.add(n);
    for (const n of collect(DEF_MEMO, content, (m) => m[1])) names.add(n);
  }
  // Vue/Svelte (and React fallback): the file itself is a component named by
  // its basename when nothing else was detected.
  if (!names.size && /^[A-Z]/.test(baseName)) names.add(baseName);
  else if (ext === '.vue' || ext === '.svelte') names.add(baseName);
  return [...names];
}

/** Detect child components composed inside one file. */
function composedChildren(content) {
  const kids = new Set();
  for (const n of collect(JSX_USE, content, (m) => m[1])) {
    // Skip well-known intrinsic-ish wrappers that aren't design components.
    if (n === 'Fragment' || n === 'Suspense' || n === 'StrictMode') continue;
    kids.add(n);
  }
  return kids;
}

function classifyLayer(name, childCount) {
  if (ORGANISM_NAME.test(name) || childCount >= 5) return 'Organism';
  if (childCount >= 1) return 'Molecular';
  return 'Atomic';
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
  const layerSeen = new Set();

  // Pass 1: collect every defined component name (across files) so composes
  // edges only point at components we actually saw defined somewhere.
  const fileInfos = [];
  const definedGlobal = new Set();
  for (const root of rootList) {
    for (const abs of walk(root)) {
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const ext = path.extname(abs).toLowerCase();
      const baseName = path.basename(abs, ext);
      const defs = definedComponents(content, ext, baseName);
      const kids = composedChildren(content);
      const hasCva = CVA_BLOCK.test(content) || VARIANT_PROP.test(content);
      // reset lastIndex side effects of .test on global regexes
      CVA_BLOCK.lastIndex = 0; VARIANT_PROP.lastIndex = 0;
      defs.forEach((d) => definedGlobal.add(d));
      fileInfos.push({ defs, kids, hasCva });
    }
  }

  // Pass 2: build nodes + edges.
  for (const { defs, kids, hasCva } of fileInfos) {
    for (const name of defs) {
      const id = componentId(name);
      // Children that are themselves defined components (drop self + unknown).
      const realKids = [...kids].filter((k) => k !== name && definedGlobal.has(k));
      const layer = classifyLayer(name, realKids.length);

      if (!nodeMap.has(id)) {
        nodeMap.set(id, stubNode(id, 'component', name, { layer }));
      } else {
        // Prefer the more-specific (higher) layer if seen twice.
        const order = { Atomic: 0, Molecular: 1, Organism: 2 };
        const prev = nodeMap.get(id);
        if (order[layer] > order[prev.layer]) prev.layer = layer;
      }

      // layer node (one per distinct layer) + component depends-on-layer is
      // implicit via the `layer` field; we emit the layer node so the graph has
      // a navigable taxonomy anchor.
      const layerId = `layer:${layer}`;
      if (!layerSeen.has(layerId)) {
        layerSeen.add(layerId);
        nodeMap.set(layerId, stubNode(layerId, 'layer', `${layer} layer`, { subtype: layer }));
      }

      // composes edges: component -> child component.
      for (const k of realKids) {
        const childId = componentId(k);
        const key = `${id}--composes-->${childId}`;
        if (!edgeSet.has(key)) {
          edgeSet.set(key, { source: id, target: childId, type: 'composes', direction: 'forward', weight: 0.6 });
        }
      }

      // variant node + extends edge.
      if (hasCva) {
        const variantId = `variant:${slug(name).toLowerCase()}`;
        if (!nodeMap.has(variantId)) {
          nodeMap.set(variantId, stubNode(variantId, 'variant', `${name} (variants)`, {}));
        }
        const vkey = `${variantId}--extends-->${id}`;
        if (!edgeSet.has(vkey)) {
          edgeSet.set(vkey, { source: variantId, target: id, type: 'extends', direction: 'forward', weight: 0.7 });
        }
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
