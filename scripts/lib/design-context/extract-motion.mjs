#!/usr/bin/env node
// scripts/lib/design-context/extract-motion.mjs — Phase 52 (DesignContext graph), executor B.
//
// Deterministic, dependency-free motion extractor. Regex-scans source for CSS
// transitions / @keyframes / animations, Tailwind motion utilities, and JS
// libs (framer-motion, GSAP) plus easing tokens, and emits a Fragment
// (schema_version 52.0) of `motion-fragment` + `state` nodes with
// `transitions-to` edges (state -> state for keyframe-style enter/exit pairs and
// for AnimatePresence enter/exit; otherwise the motion-fragment links the two
// canonical states it animates between).
//
// Semantics mirror agents/motion-mapper.md (easing / duration / trigger /
// library). Structural pass only: summary='' and complexity='moderate' are
// stubs the LLM/mapper phase fills later. No network, no deps, no top-level
// Date.now() (stamped in main()).
//
// Public API:
//   extract(roots, opts?) -> Fragment   (pure)
//   main()                              -> prints Fragment JSON to stdout

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAPPER = 'motion-mapper';
const SCHEMA_VERSION = '52.0';

const SCANNABLE_EXT = new Set([
  '.css', '.scss', '.sass', '.less',
  '.tsx', '.jsx', '.ts', '.js', '.mjs',
  '.vue', '.svelte', '.html', '.htm',
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
// Motion matchers.
// ---------------------------------------------------------------------------

const KEYFRAMES = /@keyframes\s+([A-Za-z0-9_-]+)/g;
const CSS_TRANSITION = /transition\s*:\s*([^;}\n]+)/gi;
const CSS_ANIMATION = /\banimation\s*:\s*([^;}\n]+)/gi;
const TW_MOTION = /\b(?:animate-[a-z-]+|duration-\d+|ease-(?:linear|in|out|in-out)|transition(?:-[a-z]+)?)\b/g;
const FRAMER = /\b(?:framer-motion|motion\.(?:div|span|button|ul|li|a|section|nav|header|footer)|useAnimation|useSpring|useTransform|whileHover|whileTap|AnimatePresence|layoutId)\b/g;
const GSAP = /\b(?:gsap|TweenMax|TimelineMax)\.(?:to|from|fromTo|timeline)\b/g;
const EASING = /cubic-bezier\(([^)]+)\)/g;
const REDUCED_MOTION = /prefers-reduced-motion/g;

// Trigger heuristics.
function triggerFor(content, snippet) {
  if (/whileHover|:hover/.test(snippet)) return 'hover';
  if (/whileTap|:active|onClick|onPress/.test(snippet)) return 'press';
  if (/useScroll|animation-timeline|ScrollTimeline|whileInView/.test(content)) return 'scroll';
  if (/AnimatePresence|exit=|mount|unmount/.test(content)) return 'mount-unmount';
  return 'state-change';
}

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

  const addState = (name) => {
    const id = `state:${slug(name)}`;
    if (!nodeMap.has(id)) nodeMap.set(id, stubNode(id, 'state', name, {}));
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
      const reducedMotion = (content.match(REDUCED_MOTION) || []).length > 0;

      // @keyframes -> motion-fragment + an idle->active transition pair.
      for (const kf of collect(KEYFRAMES, content, (m) => m[1])) {
        const id = `motion-fragment:${slug(kf)}`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', kf, {
            library: 'css-keyframes',
            trigger: triggerFor(content, kf),
            reduced_motion_handled: reducedMotion,
          }));
        }
        const idle = addState(`${kf}-idle`);
        const active = addState(`${kf}-active`);
        addEdge(idle, active, 'transitions-to', 0.6);
      }

      // CSS transition decls -> a motion-fragment named by file+property.
      const transitions = collect(CSS_TRANSITION, content, (m) => m[1].trim());
      transitions.forEach((decl, i) => {
        const prop = decl.split(/\s+/)[0] || 'all';
        const id = `motion-fragment:${slug(baseName)}-transition-${slug(prop)}-${i}`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} transition (${prop})`, {
            library: 'css',
            trigger: triggerFor(content, decl),
            reduced_motion_handled: reducedMotion,
          }));
        }
      });

      // CSS animation shorthand -> motion-fragment.
      collect(CSS_ANIMATION, content, (m) => m[1].trim()).forEach((decl, i) => {
        const id = `motion-fragment:${slug(baseName)}-animation-${i}`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} animation`, {
            library: 'css',
            trigger: triggerFor(content, decl),
            reduced_motion_handled: reducedMotion,
          }));
        }
      });

      // Framer-motion usage -> motion-fragment + (if AnimatePresence) enter/exit states.
      const framerHits = (content.match(FRAMER) || []);
      if (framerHits.length) {
        const id = `motion-fragment:${slug(baseName)}-framer`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} (framer-motion)`, {
            library: 'framer-motion',
            trigger: triggerFor(content, content),
            reduced_motion_handled: reducedMotion,
          }));
        }
        if (/AnimatePresence/.test(content)) {
          const enter = addState(`${baseName}-enter`);
          const exit = addState(`${baseName}-exit`);
          addEdge(enter, exit, 'transitions-to', 0.7);
        }
      }

      // GSAP usage -> motion-fragment.
      if ((content.match(GSAP) || []).length) {
        const id = `motion-fragment:${slug(baseName)}-gsap`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} (gsap)`, {
            library: 'gsap',
            trigger: triggerFor(content, content),
            reduced_motion_handled: reducedMotion,
          }));
        }
      }

      // Tailwind motion utilities -> a single motion-fragment per file (low
      // weight). Skip pure stylesheets: bare `transition` there is plain CSS,
      // already captured by CSS_TRANSITION above (avoids a duplicate node).
      const isStyle = ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less';
      if (!isStyle && (content.match(TW_MOTION) || []).length) {
        const id = `motion-fragment:${slug(baseName)}-tw`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} (tailwind motion)`, {
            library: 'tailwind',
            trigger: triggerFor(content, content),
            reduced_motion_handled: reducedMotion,
          }));
        }
      }

      // Easing tokens -> tag onto a per-file easing motion-fragment (informational).
      const easings = collect(EASING, content, (m) => m[1].trim());
      if (easings.length) {
        const id = `motion-fragment:${slug(baseName)}-easing`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, stubNode(id, 'motion-fragment', `${baseName} easing`, {
            library: 'easing',
            easings: easings.slice(0, 8),
            reduced_motion_handled: reducedMotion,
          }));
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
