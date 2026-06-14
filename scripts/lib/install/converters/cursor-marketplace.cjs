'use strict';

/**
 * scripts/lib/install/converters/cursor-marketplace.cjs — Phase 28.8 (Plan B1).
 *
 * Cursor Marketplace Tier-2 distribution-channel converter. SEPARATE from
 * Phase 28.7's `cursor.cjs` SKILL.md file-drop converter — that one rewrites
 * per-skill content for the runtime install path. THIS one builds the
 * `.cursor-plugin/plugin.json` manifest and emits the marketplace bundle
 * layout consumed by `build-distribution-bundles.cjs` (Plan 28-8-X1).
 *
 * Architecture note: per CONTEXT D-05 (additive), Tier-1 file-drop and
 * Tier-2 marketplace coexist — `cursor.cjs` is UNCHANGED. Per CONTEXT D-06,
 * `skills/` is the SHARED source; this converter passes skill content
 * through verbatim (Cursor accepts Claude-compatible SKILL.md per Wave A
 * research, so no per-skill content transform is required at the Tier-2
 * bundle layer).
 *
 * Source mapping: see `.planning/research/cursor-marketplace-2026-05-19.md`
 * § Schema Mapping (lines 234-256) for the authoritative field-by-field spec.
 *
 * GDD-original pattern (no gsd-build/get-shit-done counterpart): Tier-2
 * distribution channels do not exist in the upstream multi-runtime install
 * reference (CONTEXT line 34). No port attribution required.
 *
 * Exports:
 *   - `buildManifest(sources, opts)` — pure function, returns the manifest
 *     object ready to `JSON.stringify(obj, null, 2)`.
 *   - `convert({ skillsDir, outDir, manifest }, opts)` — file-emission
 *     function for `build-distribution-bundles.cjs`. The only side-effect
 *     surface; touches only paths under `outDir`.
 *   - `CURATED_KEYWORDS` — frozen 8-tag default keyword subset.
 */

const fs = require('node:fs');
const path = require('node:path');

// Curated keyword subset for Cursor's marketplace card display.
// Per Wave A research § Schema Mapping `keywords` row: marketplace card
// surfaces ~5-8 tags — picking the most Cursor-user-relevant subset out
// of the 60+ tags in package.json.keywords.
const CURATED_KEYWORDS = Object.freeze([
  'design',
  'ui',
  'ux',
  'frontend',
  'design-system',
  'accessibility',
  'figma',
  'skill',
]);

/**
 * Build the .cursor-plugin/plugin.json manifest object from GDD source
 * artifacts. Pure function — no fs, env, or path access.
 *
 * Field-by-field source mapping per Wave A research § Schema Mapping:
 *
 *   name        ← claudePluginJson.name (canonical, kebab-case)
 *   description ← packageJson.description (verbatim)
 *   version     ← packageJson.version (verbatim, lockstep per D-08)
 *   author      ← {name: claudePluginJson.author.name} (transform)
 *   homepage    ← packageJson.homepage (verbatim, omit if absent)
 *   repository  ← packageJson.repository.url with trailing .git stripped
 *   license     ← packageJson.license (verbatim, omit if absent)
 *   keywords    ← opts.keywords || CURATED_KEYWORDS
 *
 * OMITTED (per research § Schema Mapping rationale):
 *   logo, rules, agents, skills, commands, hooks, mcpServers
 *
 * @param {Object} sources                            Source metadata.
 * @param {Object} sources.packageJson                Parsed package.json.
 * @param {Object} [sources.claudePluginJson]         Parsed .claude-plugin/plugin.json.
 * @param {Object} [opts]
 * @param {string[]} [opts.keywords]                  Override keyword subset
 *   (defaults to CURATED_KEYWORDS).
 * @returns {Object}                                  Manifest object,
 *   keys in documented order, ready to JSON.stringify with 2-space indent.
 */
function buildManifest(sources, opts) {
  const opts2 = opts || {};
  const pkg = sources && sources.packageJson;
  const claudePlugin = sources && sources.claudePluginJson;

  if (!pkg || typeof pkg !== 'object') {
    throw new Error('cursor-marketplace: sources.packageJson is required');
  }

  // name — prefer .claude-plugin/plugin.json.name (canonical, already
  // kebab-case as "hone"); fall back to stripping npm scope
  // prefix from package.json.name.
  let name;
  if (claudePlugin && typeof claudePlugin.name === 'string') {
    name = claudePlugin.name;
  } else if (typeof pkg.name === 'string') {
    name = pkg.name.replace(/^@[^/]+\//, '');
  } else {
    throw new Error('cursor-marketplace: name is required (no source)');
  }

  // description — required (we want predictable failure if package.json
  // is malformed).
  if (typeof pkg.description !== 'string' || pkg.description.length === 0) {
    throw new Error('cursor-marketplace: packageJson.description is required');
  }
  const description = pkg.description;

  // version — required, semver-shaped.
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+/.test(pkg.version)) {
    throw new Error(
      'cursor-marketplace: packageJson.version is required and must be semver-shaped'
    );
  }
  const version = pkg.version;

  // author — resolve in order: claudePluginJson.author.name → pkg.author
  // (string form) → pkg.author.name. Email only if claudePluginJson source
  // carries one (GDD does not today).
  let authorName;
  let authorEmail;
  if (
    claudePlugin
    && claudePlugin.author
    && typeof claudePlugin.author === 'object'
    && typeof claudePlugin.author.name === 'string'
  ) {
    authorName = claudePlugin.author.name;
    if (typeof claudePlugin.author.email === 'string') {
      authorEmail = claudePlugin.author.email;
    }
  } else if (typeof pkg.author === 'string' && pkg.author.length > 0) {
    authorName = pkg.author;
  } else if (
    pkg.author
    && typeof pkg.author === 'object'
    && typeof pkg.author.name === 'string'
  ) {
    authorName = pkg.author.name;
    if (typeof pkg.author.email === 'string') {
      authorEmail = pkg.author.email;
    }
  } else {
    throw new Error('cursor-marketplace: author.name is required (no source)');
  }
  const author = authorEmail
    ? { name: authorName, email: authorEmail }
    : { name: authorName };

  // homepage — verbatim, omit if absent.
  const homepage =
    typeof pkg.homepage === 'string' && pkg.homepage.length > 0
      ? pkg.homepage
      : undefined;

  // repository — package.json may store as object {type, url} or string.
  // Strip trailing .git for cleaner display.
  let repository;
  if (pkg.repository) {
    let rawUrl;
    if (typeof pkg.repository === 'string') {
      rawUrl = pkg.repository;
    } else if (typeof pkg.repository === 'object'
      && typeof pkg.repository.url === 'string') {
      rawUrl = pkg.repository.url;
    }
    if (rawUrl) {
      repository = rawUrl.replace(/\.git$/, '');
    }
  }

  // license — verbatim, omit if absent.
  const license =
    typeof pkg.license === 'string' && pkg.license.length > 0
      ? pkg.license
      : undefined;

  // keywords — opts override → CURATED_KEYWORDS default. Always materialize
  // a fresh array (don't expose the frozen module-level constant directly
  // in user-mutable output).
  const keywords =
    Array.isArray(opts2.keywords) && opts2.keywords.length > 0
      ? opts2.keywords.slice()
      : CURATED_KEYWORDS.slice();

  // Assemble in documented order: name, description, version, author,
  // homepage, repository, license, keywords. Omit undefined fields so
  // JSON.stringify produces a clean diff.
  const manifest = {};
  manifest.name = name;
  manifest.description = description;
  manifest.version = version;
  manifest.author = author;
  if (homepage !== undefined) manifest.homepage = homepage;
  if (repository !== undefined) manifest.repository = repository;
  if (license !== undefined) manifest.license = license;
  manifest.keywords = keywords;

  return manifest;
}

/**
 * Copy a directory tree recursively. Vanilla fs only — no deps.
 * Returns the list of relative paths written (relative to `dest`).
 */
function copyDirRecursive(src, dest, relPrefix) {
  const written = [];
  const stack = [{ s: src, d: dest, rel: relPrefix || '' }];
  while (stack.length > 0) {
    const { s, d, rel } = stack.pop();
    fs.mkdirSync(d, { recursive: true });
    const entries = fs.readdirSync(s);
    for (const entry of entries) {
      const sp = path.join(s, entry);
      const dp = path.join(d, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      const stat = fs.statSync(sp);
      if (stat.isDirectory()) {
        stack.push({ s: sp, d: dp, rel: relPath });
      } else if (stat.isFile()) {
        fs.copyFileSync(sp, dp);
        written.push(relPath);
      }
      // symlinks + other: ignored (skills tree is regular files only)
    }
  }
  return written;
}

/**
 * Convert/emit the cursor-marketplace bundle into a destination directory.
 * Called by build-distribution-bundles.cjs (Plan 28-8-X1).
 *
 * Per CONTEXT D-06, `skills/` is the shared source — this converter emits
 * the marketplace bundle as:
 *
 *   <outDir>/
 *     .cursor-plugin/
 *       plugin.json          ← the manifest object, JSON.stringified
 *     skills/
 *       <each skill copied verbatim from input.skillsDir>
 *
 * Cursor accepts Claude-compatible SKILL.md so no per-skill content
 * transform is required at this layer. The Tier-1 cursor.cjs converter
 * remains responsible for the per-runtime SKILL.md rewrites needed by the
 * file-drop install path; those rewrites are irrelevant to a marketplace
 * bundle (Cursor's marketplace reads the SKILL.md content directly).
 *
 * Idempotent: rerunning with the same inputs produces identical files
 * (no partial-state corruption, no append-only emissions).
 *
 * Touches only paths under `outDir`. The source `skillsDir` is read-only.
 *
 * @param {Object} input
 * @param {string} input.skillsDir                    Path to source skills/ tree.
 * @param {string} input.outDir                       Path to destination bundle directory.
 * @param {Object} input.manifest                     Manifest object from buildManifest().
 * @param {Object} [opts]
 * @returns {{ filesWritten: string[] }}              Sorted relative paths under outDir.
 */
function convert(input, opts) {
  if (!input || typeof input !== 'object') {
    throw new Error('cursor-marketplace.convert: input is required');
  }
  const { skillsDir, outDir, manifest } = input;
  if (typeof skillsDir !== 'string' || skillsDir.length === 0) {
    throw new Error('cursor-marketplace.convert: input.skillsDir is required');
  }
  if (typeof outDir !== 'string' || outDir.length === 0) {
    throw new Error('cursor-marketplace.convert: input.outDir is required');
  }
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('cursor-marketplace.convert: input.manifest is required');
  }

  const skillsStat = fs.statSync(skillsDir);
  if (!skillsStat.isDirectory()) {
    throw new Error(
      `cursor-marketplace.convert: skillsDir is not a directory: ${skillsDir}`
    );
  }

  const written = [];

  // Create outDir if absent.
  fs.mkdirSync(outDir, { recursive: true });

  // Write manifest at <outDir>/.cursor-plugin/plugin.json.
  const manifestDir = path.join(outDir, '.cursor-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'plugin.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
  written.push('.cursor-plugin/plugin.json');

  // Copy skills/ tree verbatim under <outDir>/skills.
  const skillsDest = path.join(outDir, 'skills');
  const copied = copyDirRecursive(skillsDir, skillsDest, 'skills');
  for (const rel of copied) {
    written.push(rel);
  }

  written.sort();
  return { filesWritten: written };
}

module.exports = { buildManifest, convert, CURATED_KEYWORDS };
