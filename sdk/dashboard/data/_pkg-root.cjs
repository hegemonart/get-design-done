'use strict';
/**
 * sdk/dashboard/data/_pkg-root.cjs — Phase 55 (GDD Dashboard, dep-free).
 *
 * Package-root walk-up for sibling resolution (the Phase 53/54 lesson): never
 * resolve a cross-tree sibling via a fixed `__dirname`-relative `../../..`
 * jump, because that breaks the moment a file is copied/moved or the layout
 * shifts. Instead, walk UP from this file's directory until we find the GDD
 * package.json (identified by `name === '@hegemonart/hone'`), and
 * resolve all in-repo siblings relative to that root.
 *
 * Even though these dashboard `.cjs` files are NOT esbuild-bundled (R8 — the
 * bin trampoline runs them directly so the Phase 53 __dirname-rewrite trap
 * does not apply), keeping the walk-up makes the data plane robust to future
 * bundling or relocation. Pure + dependency-free; memoized per process.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Memoized resolved package root (computed once per process). */
let _cachedRoot = null;

/**
 * Walk up from `startDir` looking for the GDD package root. The GDD root is
 * the first ancestor whose package.json declares `name: "@hegemonart/hone"`;
 * if no such marker is found (e.g. running from an unusual layout), fall back
 * to the FIRST ancestor that has any package.json, then to `startDir`.
 *
 * @param {string} startDir
 * @returns {string} absolute package-root directory
 */
function findPackageRoot(startDir) {
  let dir = path.resolve(startDir);
  let firstWithPkg = null;
  // Bound the climb defensively (deep trees / odd mounts).
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json');
    let pkg = null;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch {
      pkg = null;
    }
    if (pkg) {
      if (firstWithPkg === null) firstWithPkg = dir;
      if (pkg.name === '@hegemonart/hone') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return firstWithPkg || path.resolve(startDir);
}

/**
 * Resolved GDD package root, memoized. Computed by walking up from THIS file's
 * directory (`__dirname`) — which is correct regardless of the caller's cwd.
 * @returns {string}
 */
function packageRoot() {
  if (_cachedRoot === null) _cachedRoot = findPackageRoot(__dirname);
  return _cachedRoot;
}

/**
 * Absolute path to an in-repo file given its repo-relative path.
 * @param {string} relPath e.g. 'scripts/lib/install/runtime-homes.cjs'
 * @returns {string}
 */
function resolveFromPackageRoot(relPath) {
  return path.join(packageRoot(), relPath);
}

/**
 * require() an in-repo sibling .cjs module by its repo-relative path, resolved
 * via the package-root walk-up. Use ONLY for .cjs siblings — .ts libs must be
 * loaded via dynamic import(pathToFileURL) (a .cjs cannot static-require a .ts).
 *
 * @param {string} relPath e.g. 'scripts/lib/design-context-query.cjs'
 * @returns {*} the required module
 */
function requireFromPackageRoot(relPath) {
  return require(resolveFromPackageRoot(relPath));
}

module.exports = {
  findPackageRoot,
  packageRoot,
  resolveFromPackageRoot,
  requireFromPackageRoot,
};
