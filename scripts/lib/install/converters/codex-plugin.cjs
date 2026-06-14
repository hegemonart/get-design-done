'use strict';

/**
 * scripts/lib/install/converters/codex-plugin.cjs — Phase 28.8 (Plan 28-8-C1).
 *
 * Codex Plugin distribution-channel converter. Emits a Codex-plugin-shape
 * bundle (`.codex-plugin/plugin.json` + verbatim-copied `skills/` tree)
 * from our `skills/` canonical source. Consumed by Plan 28-8-X1's
 * scripts/build-distribution-bundles.cjs (downstream — this module is
 * the contract, X1 wires the build pipeline).
 *
 * Per CONTEXT D-05 (additive): this is a NEW kind, alongside the
 * existing scripts/lib/install/converters/codex.cjs (Phase 28.7
 * file-drop AGENTS.md surface). codex.cjs is UNCHANGED. Tier-1 and
 * Tier-2 surfaces coexist as documented in
 * .planning/research/codex-plugins-2026-05-19.md § vs AGENTS.md.
 *
 * Per CONTEXT D-06 (skills are shared source): skill content is copied
 * verbatim during bundle emission — Codex consumes the same SKILL.md
 * shape we already produce for Phase 28.5 authoring contract. No
 * per-skill content rewriting in this converter.
 *
 * Per CONTEXT D-14 (no new catalog): we do NOT emit a Codex-specific
 * marketplace.json — Codex's legacy-compat path consumes our existing
 * .claude-plugin/marketplace.json directly.
 *
 * GDD-original pattern (no gsd-build/get-shit-done counterpart): Tier-2
 * distribution channels do not exist in the upstream multi-runtime install
 * reference. Mirrors the cursor-marketplace.cjs sibling (Plan 28-8-B1).
 *
 * Pure / side-effect-free for `buildManifest`. `convert` performs
 * filesystem writes (it's a bundle emitter) and is the impure boundary.
 * All test invocations use tmpdir per CONTEXT D-10.
 *
 * Exports:
 *   - `buildManifest(sources)` — pure function, returns the Codex manifest
 *     object ready to `JSON.stringify(obj, null, 2)`.
 *   - `convert({ skillsDir, outDir, manifest })` — file-emission function
 *     for `build-distribution-bundles.cjs`. The only side-effect surface;
 *     touches only paths under `outDir`.
 *   - `MANIFEST_REQUIRED_FIELDS` — frozen 3-tuple of required spec fields.
 *   - `CURATED_KEYWORDS` — frozen 10-tag default keyword subset.
 */

const fs = require('node:fs');
const path = require('node:path');

const {
  MCP_SERVER_PRIMARY,
  DISPLAY_NAME,
  COMMAND_PREFIX_FLAT,
} = require('../../pkg-identity.cjs');

// Per research § Top-level fields: name, version, description are the only
// strictly-required spec fields. All other manifest fields are optional.
const MANIFEST_REQUIRED_FIELDS = Object.freeze(['name', 'version', 'description']);

// Curated keyword subset for Codex marketplace card display.
// Per research § Schema Mapping `keywords` row: keep to ~10 design-relevant
// terms (our package.json carries 50+ tags). The intersection of these tags
// with package.json#keywords drives `curateKeywords()` below.
const CURATED_KEYWORDS = Object.freeze([
  'design',
  'ui',
  'ux',
  'frontend',
  'pipeline',
  'design-system',
  'accessibility',
  'figma',
  'wcag',
  'agent-sdk',
]);

// ── Private helpers ────────────────────────────────────────────────────

function stripNpmScope(name) {
  if (typeof name !== 'string') return name;
  return name.replace(/^@[^/]+\//, '');
}

function stripGitSuffix(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/\.git$/, '');
}

function truncate(str, n) {
  if (typeof str !== 'string') return str;
  if (str.length <= n) return str;
  // Prefer ending at sentence boundary, then word boundary, then hard cut.
  const head = str.slice(0, n);
  const sentenceEnd = head.lastIndexOf('. ');
  if (sentenceEnd > n * 0.6) return head.slice(0, sentenceEnd + 1);
  const wordEnd = head.lastIndexOf(' ');
  if (wordEnd > n * 0.6) return head.slice(0, wordEnd);
  return head;
}

function capitalize(str) {
  if (typeof str !== 'string' || str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Curate keywords to the ≤10-element CURATED_KEYWORDS intersection with
 * the source array. If the whitelist isn't a subset of source, fall back
 * to `source.slice(0, 10)`. Always returns a fresh array (callers may
 * mutate without polluting the frozen module constant).
 */
function curateKeywords(arr) {
  if (!Array.isArray(arr)) return CURATED_KEYWORDS.slice();
  const sourceSet = new Set(arr);
  const intersected = CURATED_KEYWORDS.filter((k) => sourceSet.has(k));
  if (intersected.length > 0) return intersected;
  return arr.slice(0, 10);
}

/**
 * Copy a directory tree recursively. Vanilla fs only — no deps. Mirrors
 * the helper used by cursor-marketplace.cjs (Plan 28-8-B1).
 */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
    // symlinks + other: ignored (skills tree is regular files only).
  }
}

// ── Public exports ─────────────────────────────────────────────────────

/**
 * Build the Codex Plugin manifest object from GDD source artifacts.
 * Pure function — no fs, env, or path access.
 *
 * Field-by-field source mapping per research § Schema Mapping:
 *
 *   name        ← marketplaceJson.plugins[0].name (canonical, kebab-case)
 *                  → claudePlugin.name → stripNpmScope(packageJson.name)
 *   version     ← packageJson.version (verbatim, lockstep per D-08)
 *   description ← packageJson.description (verbatim)
 *   author      ← claudePlugin.author (canonical, has url)
 *                  → marketplaceJson.plugins[0].author → packageJson.author
 *   homepage    ← packageJson.homepage
 *   repository  ← stripGitSuffix(packageJson.repository.url)
 *   license     ← packageJson.license
 *   keywords    ← curateKeywords(packageJson.keywords) → ≤10 entries
 *   skills      ← static "./skills/"
 *   mcpServers  ← inline { gdd-mcp: { command: "npx", args: [...] } }
 *   interface   ← 9 sub-fields per Schema Mapping table:
 *                  displayName, shortDescription, longDescription,
 *                  developerName, category, capabilities, websiteURL,
 *                  defaultPrompt, brandColor
 *
 * OMITTED (per research § Manifest Format "Omitted fields"):
 *   apps, hooks (off-by-default), interface.privacyPolicyURL,
 *   interface.termsOfServiceURL, interface.composerIcon, interface.logo,
 *   interface.screenshots
 *
 * @param {Object} sources                            Source metadata.
 * @param {Object} sources.packageJson                Parsed package.json.
 * @param {Object} [sources.claudePlugin]             Parsed .claude-plugin/plugin.json.
 * @param {Object} [sources.marketplaceJson]          Parsed .claude-plugin/marketplace.json.
 * @param {string} [sources.readmeFirstPara]          README.md first paragraph
 *                                                    for interface.longDescription.
 * @returns {Object}                                  Manifest object ready
 *                                                    to JSON.stringify with 2-space indent.
 */
function buildManifest(sources) {
  if (!sources || typeof sources !== 'object') {
    throw new Error('codex-plugin.buildManifest: sources is required');
  }
  const { packageJson, claudePlugin, marketplaceJson, readmeFirstPara } = sources;

  if (!packageJson || typeof packageJson !== 'object') {
    throw new Error('codex-plugin.buildManifest: sources.packageJson is required');
  }

  // name — required, kebab-case. Priority: marketplaceJson > claudePlugin >
  // package.json (with scope stripped).
  let name;
  if (
    marketplaceJson
    && Array.isArray(marketplaceJson.plugins)
    && marketplaceJson.plugins[0]
    && typeof marketplaceJson.plugins[0].name === 'string'
  ) {
    name = marketplaceJson.plugins[0].name;
  } else if (claudePlugin && typeof claudePlugin.name === 'string') {
    name = claudePlugin.name;
  } else if (typeof packageJson.name === 'string') {
    name = stripNpmScope(packageJson.name);
  } else {
    throw new Error('codex-plugin.buildManifest: name is required (no source)');
  }

  // version — required, semver-shaped.
  if (typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+/.test(packageJson.version)) {
    throw new Error(
      'codex-plugin.buildManifest: packageJson.version is required and must be semver-shaped'
    );
  }
  const version = packageJson.version;

  // description — required, free text.
  if (typeof packageJson.description !== 'string' || packageJson.description.length === 0) {
    throw new Error('codex-plugin.buildManifest: packageJson.description is required');
  }
  const description = packageJson.description;

  // author — prefer claudePlugin (has url), then marketplace, then package.json.
  let author;
  if (
    claudePlugin
    && claudePlugin.author
    && typeof claudePlugin.author === 'object'
    && typeof claudePlugin.author.name === 'string'
  ) {
    author = Object.assign({}, claudePlugin.author);
  } else if (
    marketplaceJson
    && Array.isArray(marketplaceJson.plugins)
    && marketplaceJson.plugins[0]
    && marketplaceJson.plugins[0].author
    && typeof marketplaceJson.plugins[0].author === 'object'
  ) {
    author = Object.assign({}, marketplaceJson.plugins[0].author);
  } else if (typeof packageJson.author === 'string') {
    author = { name: packageJson.author };
  } else if (
    packageJson.author
    && typeof packageJson.author === 'object'
    && typeof packageJson.author.name === 'string'
  ) {
    author = Object.assign({}, packageJson.author);
  } else {
    author = { name: 'unknown' };
  }

  // homepage — verbatim, omit if absent.
  const homepage =
    typeof packageJson.homepage === 'string' && packageJson.homepage.length > 0
      ? packageJson.homepage
      : undefined;

  // repository — string or object form, strip trailing .git for cleaner display.
  let repository;
  if (packageJson.repository) {
    let rawUrl;
    if (typeof packageJson.repository === 'string') {
      rawUrl = packageJson.repository;
    } else if (
      typeof packageJson.repository === 'object'
      && typeof packageJson.repository.url === 'string'
    ) {
      rawUrl = packageJson.repository.url;
    }
    if (rawUrl) {
      repository = stripGitSuffix(rawUrl);
    }
  }

  // license — verbatim, omit if absent.
  const license =
    typeof packageJson.license === 'string' && packageJson.license.length > 0
      ? packageJson.license
      : undefined;

  // keywords — curated ≤10-tag subset.
  const keywords = curateKeywords(packageJson.keywords || []);

  // skills — static path string per build doc complete-manifest example.
  const skills = './skills/';

  // mcpServers — inline object form (D-14 minimalism: no separate .mcp.json
  // artifact in this plan). The bin name `hone-mcp` (from the identity seam) is
  // verified against package.json#bin during integration.
  const mcpServers = {
    [MCP_SERVER_PRIMARY]: {
      command: 'npx',
      args: ['-y', `--package=${packageJson.name}`, MCP_SERVER_PRIMARY],
    },
  };

  // interface — 9-field install-surface metadata per Schema Mapping table.
  const developerName = (author && typeof author.name === 'string')
    ? author.name
    : 'hegemonart';

  const categoryRaw =
    (marketplaceJson
      && Array.isArray(marketplaceJson.plugins)
      && marketplaceJson.plugins[0]
      && typeof marketplaceJson.plugins[0].category === 'string')
      ? marketplaceJson.plugins[0].category
      : 'design';
  const category = capitalize(categoryRaw);

  const interfaceObj = {
    displayName: DISPLAY_NAME,
    shortDescription: truncate(description, 120),
    longDescription: (typeof readmeFirstPara === 'string' && readmeFirstPara.length > 0)
      ? readmeFirstPara
      : description,
    developerName,
    category,
    capabilities: ['Read', 'Write'],
    websiteURL: homepage || '',
    // Codex uses the flat command prefix uniformly (not the `/hone:` namespaced
    // form Claude Code uses). Both lines use the same seam-sourced prefix to
    // avoid the documented inconsistency (audit P1 #4 — committed manifest had
    // mixed namespaced and flat forms).
    defaultPrompt: [
      `Run ${COMMAND_PREFIX_FLAT}brief to start a design cycle.`,
      `Run ${COMMAND_PREFIX_FLAT}explore to audit a screen.`,
    ],
    brandColor: '#10A37F',
  };

  // Assemble in documented order. Omit undefined fields so JSON.stringify
  // produces a clean diff (matches cursor-marketplace.cjs convention).
  const manifest = {};
  manifest.name = name;
  manifest.version = version;
  manifest.description = description;
  manifest.author = author;
  if (homepage !== undefined) manifest.homepage = homepage;
  if (repository !== undefined) manifest.repository = repository;
  if (license !== undefined) manifest.license = license;
  manifest.keywords = keywords;
  manifest.skills = skills;
  manifest.mcpServers = mcpServers;
  manifest.interface = interfaceObj;

  return manifest;
}

/**
 * Convert/emit the codex-plugin bundle into a destination directory.
 * Called by build-distribution-bundles.cjs (Plan 28-8-X1).
 *
 * Per CONTEXT D-06, `skills/` is the shared source — this converter emits
 * the marketplace bundle as:
 *
 *   <outDir>/
 *     .codex-plugin/
 *       plugin.json          ← the manifest object, JSON.stringified
 *     skills/
 *       <each skill copied verbatim from input.skillsDir>
 *
 * Codex consumes Claude-compatible SKILL.md (Phase 28.5 contract is
 * already mattpocock-shaped, which Codex accepts per research § vs
 * AGENTS.md) so no per-skill content transform is required at the
 * Tier-2 bundle layer. The Tier-1 codex.cjs converter remains
 * responsible for any per-runtime SKILL.md rewrites needed by the
 * file-drop install path; those rewrites are irrelevant to a marketplace
 * bundle.
 *
 * Idempotent: rerunning with the same inputs produces identical files.
 * Touches only paths under `outDir`. The source `skillsDir` is read-only.
 *
 * @param {Object} input
 * @param {string} input.skillsDir    Path to source skills/ tree.
 * @param {string} input.outDir       Path to destination bundle directory.
 * @param {Object} input.manifest     Manifest object from buildManifest().
 * @returns {{ manifestPath: string, outDir: string }}
 */
function convert(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('codex-plugin.convert: input is required');
  }
  const { skillsDir, outDir, manifest } = input;
  if (typeof skillsDir !== 'string' || skillsDir.length === 0) {
    throw new Error('codex-plugin.convert: input.skillsDir is required');
  }
  if (typeof outDir !== 'string' || outDir.length === 0) {
    throw new Error('codex-plugin.convert: input.outDir is required');
  }
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('codex-plugin.convert: input.manifest is required');
  }

  // Validate required fields before writing.
  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (!manifest[field]) {
      throw new Error(`codex-plugin: manifest missing required field "${field}"`);
    }
  }

  // Ensure output dir exists.
  fs.mkdirSync(outDir, { recursive: true });

  // Write manifest at <outDir>/.codex-plugin/plugin.json.
  const manifestDir = path.join(outDir, '.codex-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'plugin.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  // Copy skills/ tree verbatim (D-06: skills are shared source, no rewriting).
  if (fs.existsSync(skillsDir)) {
    copyDirRecursive(skillsDir, path.join(outDir, 'skills'));
  }

  return { manifestPath, outDir };
}

module.exports = { buildManifest, convert, MANIFEST_REQUIRED_FIELDS, CURATED_KEYWORDS };
