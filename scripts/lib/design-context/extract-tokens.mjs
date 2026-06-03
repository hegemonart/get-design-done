#!/usr/bin/env node
// scripts/lib/design-context/extract-tokens.mjs — Phase 52 (DesignContext graph), executor B.
//
// Deterministic, dependency-free token extractor. Regex-scans source roots for
// design tokens (color / spacing / typography / radius / shadow) and emits a
// Fragment (schema_version 52.0) to stdout. The structural pass fills
// id/type/name/subtype + `uses-token` edges (component -> token, where a
// component file references a token value); the LLM/mapper phase fills
// summary/tags/complexity later — so summary defaults to '' and complexity to
// 'moderate' (the validator soft-warns on these stubs).
//
// Idiom mirrors scripts/lib/detect/engine.cjs walk(): dep-free fs recursion
// with a SKIP_DIRS set, scannable-extension filter, regex content scan. No
// network, no optional deps, no top-level Date.now() (stamped only in main()).
//
// Public API:
//   extract(roots, opts?) -> Fragment   (pure; opts.generatedAt to stamp)
//   main()                              -> prints Fragment JSON to stdout

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAPPER = 'token-mapper';
const SCHEMA_VERSION = '52.0';

const SCANNABLE_EXT = new Set([
  '.css', '.scss', '.sass', '.less',
  '.tsx', '.jsx', '.ts', '.js', '.mjs', '.cjs',
  '.vue', '.svelte', '.html', '.htm',
]);
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '.design', '.planning', 'out', '.cache', '.turbo', '.svelte-kit',
]);

// A file is treated as a "component" file (a `uses-token` edge source) when it
// is a component-bearing extension. CSS/SCSS are token *definition* surfaces,
// not components, so they never originate `uses-token` edges.
const COMPONENT_EXT = new Set(['.tsx', '.jsx', '.vue', '.svelte']);

/** Recursively collect scannable files under `root` (a file or dir). */
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

/** Slugify an arbitrary token value/name into an id-safe fragment. */
function slug(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'x';
}

function stubNode(id, type, name, extra) {
  return {
    id,
    type,
    name,
    summary: '',          // LLM phase fills this
    tags: [],
    complexity: 'moderate', // LLM phase refines this
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Token matchers. Each returns { subtype, name, value } objects per match.
// ---------------------------------------------------------------------------

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_COLOR = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^)]*\)/g;
const CSS_VAR_DEF = /(--[a-z][a-z0-9-]*)\s*:\s*([^;}\n]+)/gi;
const TW_COLOR = /\b(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

const SPACING_DECL = /\b(?:padding|margin|gap|inset|top|right|bottom|left|row-gap|column-gap)(?:-[a-z]+)?\s*:\s*(-?[0-9]*\.?[0-9]+(?:px|rem|em))\b/gi;
const TW_SPACING = /\b(?:p|m|gap|space|inset)(?:[xytrbl])?-(?:px|0|0\.5|\d{1,2}(?:\.5)?)\b/g;

const FONT_SIZE = /font-size\s*:\s*([0-9]*\.?[0-9]+(?:px|rem|em))/gi;
const FONT_WEIGHT = /font-weight\s*:\s*([1-9]00|normal|bold|bolder|lighter)\b/gi;
const FONT_FAMILY = /font-family\s*:\s*([^;}\n]+)/gi;
const TW_TEXT = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/g;
const TW_FONTWEIGHT = /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;

const RADIUS_DECL = /border-radius\s*:\s*([0-9]*\.?[0-9]+(?:px|rem|em|%)|9999px|50%)/gi;
const TW_RADIUS = /\brounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full))?\b/g;

const SHADOW_DECL = /box-shadow\s*:\s*([^;}\n]+)/gi;
const TW_SHADOW = /\bshadow(?:-(?:sm|md|lg|xl|2xl|inner|none))?\b/g;

function collect(re, content, mapFn) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(content)) !== null) {
    const t = mapFn(m);
    if (t) out.push(t);
    if (m.index === re.lastIndex) re.lastIndex++; // guard zero-width
  }
  return out;
}

/** Extract every token reference from one file's content (subtype-tagged). */
function tokensInContent(content, ext) {
  const found = [];
  const isStyle = ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less';

  // --- color ---
  // CSS custom properties whose value is colorish → name them by the var.
  for (const m of collect(CSS_VAR_DEF, content, (mm) => mm)) {
    const [, varName, rawVal] = m;
    const val = rawVal.trim();
    if (/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/.test(val)) {
      found.push({ subtype: 'color', name: varName, value: val });
    } else if (/(?:px|rem|em)\b/.test(val) && /^(?:[0-9.]+(?:px|rem|em)\s*)+$/.test(val)) {
      found.push({ subtype: 'spacing', name: varName, value: val });
    } else if (/(?:[0-9]{3}|bold|normal)/.test(val) && /font|weight|size/i.test(varName)) {
      found.push({ subtype: 'typography', name: varName, value: val });
    }
  }
  for (const v of collect(HEX, content, (mm) => mm[0])) found.push({ subtype: 'color', name: v, value: v });
  for (const v of collect(FUNC_COLOR, content, (mm) => mm[0])) found.push({ subtype: 'color', name: v, value: v });
  for (const v of collect(TW_COLOR, content, (mm) => mm[0])) found.push({ subtype: 'color', name: v, value: v });

  // --- spacing ---
  for (const m of collect(SPACING_DECL, content, (mm) => mm)) found.push({ subtype: 'spacing', name: m[1], value: m[1] });
  for (const v of collect(TW_SPACING, content, (mm) => mm[0])) found.push({ subtype: 'spacing', name: v, value: v });

  // --- typography ---
  for (const m of collect(FONT_SIZE, content, (mm) => mm)) found.push({ subtype: 'typography', name: m[1], value: m[1] });
  for (const m of collect(FONT_WEIGHT, content, (mm) => mm)) found.push({ subtype: 'typography', name: `weight-${m[1]}`, value: m[1] });
  for (const m of collect(FONT_FAMILY, content, (mm) => mm)) found.push({ subtype: 'typography', name: m[1].trim().split(',')[0].replace(/['"]/g, ''), value: m[1].trim() });
  for (const v of collect(TW_TEXT, content, (mm) => mm[0])) found.push({ subtype: 'typography', name: v, value: v });
  for (const v of collect(TW_FONTWEIGHT, content, (mm) => mm[0])) found.push({ subtype: 'typography', name: v, value: v });

  // --- radius ---
  for (const m of collect(RADIUS_DECL, content, (mm) => mm)) found.push({ subtype: 'radius', name: m[1], value: m[1] });
  for (const v of collect(TW_RADIUS, content, (mm) => mm[0])) found.push({ subtype: 'radius', name: v, value: v });

  // --- shadow ---
  for (const m of collect(SHADOW_DECL, content, (mm) => mm)) found.push({ subtype: 'shadow', name: m[1].trim().slice(0, 40), value: m[1].trim() });
  for (const v of collect(TW_SHADOW, content, (mm) => mm[0])) found.push({ subtype: 'shadow', name: v, value: v });

  // Suppress raw-utility noise in pure style files is unnecessary; dedupe by id
  // happens at the fragment level. `isStyle` retained for future weighting.
  void isStyle;
  return found;
}

/**
 * Pure extractor.
 * @param {string[]|string} roots  one or more file/dir roots
 * @param {{generatedAt?: string}} [opts]
 * @returns {{schema_version:string, mapper:string, generated_at:string, nodes:object[], edges:object[]}}
 */
export function extract(roots, opts = {}) {
  const rootList = (Array.isArray(roots) ? roots : [roots]).filter(Boolean);
  const nodeMap = new Map();   // id -> node
  const edgeSet = new Map();   // edgeKey -> edge (dedupe)

  for (const root of rootList) {
    for (const abs of walk(root)) {
      let content;
      try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const ext = path.extname(abs).toLowerCase();
      const hits = tokensInContent(content, ext);
      if (!hits.length) continue;

      // Component-file id (only for `uses-token` edge origin).
      const compId = COMPONENT_EXT.has(ext)
        ? `component:${slug(path.basename(abs, ext))}`
        : null;

      for (const h of hits) {
        const id = `token:${h.subtype}:${slug(h.name)}`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'token', h.name, { subtype: h.subtype, value: h.value }));
        }
        if (compId) {
          const key = `${compId}->${id}`;
          if (!edgeSet.has(key)) {
            edgeSet.set(key, {
              source: compId,
              target: id,
              type: 'uses-token',
              direction: 'forward',
              weight: 0.5,
            });
          }
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

/** CLI entry: roots from argv (default cwd), stamp generated_at, print JSON. */
export function main(argv = process.argv.slice(2)) {
  const roots = argv.length ? argv : [process.cwd()];
  const fragment = extract(roots, { generatedAt: new Date().toISOString() });
  process.stdout.write(JSON.stringify(fragment, null, 2) + '\n');
}

// ESM "run as script" guard (Windows + POSIX safe via pathToFileURL).
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
