#!/usr/bin/env node
'use strict';

// Component-directory detection helper for /gdd:start (Phase 14.7-02).
// Deterministic, read-only, pure Node — no LLM, no subprocess, no interactive prompts.
//
// Contract:
//   detectUiRoot(cwd) -> { kind, path, confidence, reason } | { kind: "backend-only", path: null, confidence, reason } | null
//
// `path` is always relative to cwd and uses forward slashes.

const fs = require('fs');
const path = require('path');

const UI_EXT = new Set(['.tsx', '.jsx', '.ts', '.js', '.svelte', '.vue']);
const BACKEND_DEPS = ['express', 'fastify', 'koa', '@nestjs/core', 'hapi', 'restify'];
const UI_DEPS = ['react', 'preact', 'vue', 'svelte', 'solid-js', '@remix-run/react', 'next'];

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function hasUiFiles(absDir) {
  let stack;
  try {
    stack = [absDir];
  } catch {
    return false;
  }
  // Bounded BFS — stop at 3 levels deep or after 200 entries to keep fast.
  let checked = 0;
  let depth = 0;
  const maxEntries = 200;
  const maxDepth = 3;
  while (stack.length && checked < maxEntries && depth < maxDepth) {
    const next = [];
    for (const dir of stack) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isFile()) {
          if (UI_EXT.has(path.extname(e.name))) return true;
          checked += 1;
          if (checked >= maxEntries) return false;
        } else if (e.isDirectory()) {
          next.push(full);
        }
      }
    }
    stack = next;
    depth += 1;
  }
  return false;
}

function firstExistingUiDir(cwd, relPath) {
  const abs = path.join(cwd, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return null;
  if (!hasUiFiles(abs)) return null;
  return relPath.split(path.sep).join('/');
}

function firstMonorepoAppsComponents(cwd) {
  const appsDir = path.join(cwd, 'apps');
  if (!fs.existsSync(appsDir) || !fs.statSync(appsDir).isDirectory()) return null;
  let children;
  try {
    children = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const rel = `apps/${c.name}/components`;
    const abs = path.join(cwd, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory() && hasUiFiles(abs)) {
      return rel;
    }
  }
  return null;
}

function detectFramework(pkg) {
  if (!pkg) return 'unknown';
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps.next) return 'next';
  if (deps['@remix-run/react'] || deps['@remix-run/node']) return 'remix';
  if (deps['react-scripts']) return 'cra';
  if (deps.vite) return 'vite';
  if (deps.svelte || deps['@sveltejs/kit']) return 'svelte';
  if (deps.vue) return 'vue';
  if (deps.solid) return 'solid';
  if (deps.astro) return 'astro';
  if (deps.react || deps.preact) return 'react';
  return 'unknown';
}

function hasAnyDep(pkg, names) {
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return names.some((n) => Object.prototype.hasOwnProperty.call(deps, n));
}

function detectUiRoot(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = readJsonSafe(pkgPath);

  // Priority-ordered checks. First match wins.
  const checks = [
    { rel: 'packages/ui/src', kind: 'monorepo-ui-pkg', confidence: 0.95 },
    { rel: null, custom: firstMonorepoAppsComponents, kind: 'monorepo-apps', confidence: 0.9 },
    { rel: 'app/components', kind: 'next-app-router', confidence: 0.9 },
    { rel: 'src/app/components', kind: 'next-app-router-src', confidence: 0.85 },
    { rel: 'src/components', kind: 'src-components', confidence: 0.85 },
    { rel: 'components', kind: 'root-components', confidence: 0.8 },
  ];

  for (const c of checks) {
    const found = c.custom ? c.custom(cwd) : firstExistingUiDir(cwd, c.rel);
    if (found) {
      const framework = detectFramework(pkg);
      return {
        kind: c.kind,
        path: found,
        confidence: c.confidence,
        reason: `Found UI files at ${found} (framework=${framework}, kind=${c.kind})`,
        framework,
      };
    }
  }

  // Routes-based detection — Svelte/Remix sometimes colocate inside routes
  const routesAbs = path.join(cwd, 'src/routes');
  if (fs.existsSync(routesAbs) && fs.statSync(routesAbs).isDirectory() && hasUiFiles(routesAbs)) {
    return {
      kind: 'routes-based',
      path: 'src/routes',
      confidence: 0.7,
      reason: 'Found UI files inline at src/routes — framework colocation pattern',
      framework: detectFramework(pkg),
    };
  }

  // Backend-only path — package.json present with only backend deps and no UI deps
  if (pkg) {
    const isBackend = hasAnyDep(pkg, BACKEND_DEPS) && !hasAnyDep(pkg, UI_DEPS);
    if (isBackend) {
      return {
        kind: 'backend-only',
        path: null,
        confidence: 0.9,
        reason: `Backend-only repo detected (deps: ${BACKEND_DEPS.filter((d) =>
          Object.prototype.hasOwnProperty.call(
            { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) },
            d
          )
        ).join(', ')}) — frontend-only diagnostic applies`,
        framework: 'backend',
      };
    }
  }

  return null;
}

module.exports = detectUiRoot;
module.exports.detectUiRoot = detectUiRoot;

if (require.main === module) {
  const cwd = process.argv[2] || process.cwd();
  const result = detectUiRoot(path.resolve(cwd));
  if (result == null) {
    process.stdout.write(JSON.stringify({ kind: null, path: null, confidence: 0, reason: 'No UI directory detected and no backend signal either.' }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}
