'use strict';

/**
 * scripts/lib/install/doctor-codex-plugin.cjs — Phase 28.8 (Plan 28-8-C2).
 *
 * Codex Plugin doctor-mode reporter. Pure, read-only function that
 * surfaces the maintainer's local Codex Plugin readiness state to
 * `scripts/install.cjs --doctor`.
 *
 * Phase 28.8 D-03: Codex install-by-URL works today — `codex plugin
 * marketplace add hegemonart/hone` is a single command per
 * developers.openai.com/codex/plugins/build. This reporter inspects the
 * local repo for the artifacts that the Codex CLI consumes during that
 * single step:
 *   - `.codex-plugin/plugin.json` (manifest, built by Plan 28-8-C1)
 *   - `.claude-plugin/marketplace.json` (catalog reused per D-14)
 *
 * Phase 28.8 D-10: tmpdir-safe. Read-only fs access; no writes anywhere;
 * no `codex` CLI invocation; no access to `~/.codex/`. The cache install
 * path is COMPUTED (pure string composition via `os.homedir()`), NOT
 * verified. The maintainer verifies the cache after running the field-
 * test command on a Codex-installed machine (see
 * the maintainer field-test notes).
 *
 * Phase 28.8 D-14: the `.claude-plugin/marketplace.json` catalog file is
 * reused from Claude Code's marketplace per Codex's legacy-compatible
 * catalog path. Whenever the catalog is present, `reusedFromClaude` is
 * true — there is no separate Codex-specific catalog artifact.
 *
 * Phase 28.8 D-16: Codex is single-step (D-03). The multi-step pattern
 * is Cursor Marketplace's domain (see doctor-cursor-marketplace.cjs).
 * No review-window state machine here — verdict is binary:
 * `ready-to-install` or `manifest-only-not-ready`.
 *
 * Design pattern (mirrors doctor-cursor-marketplace.cjs from Plan B2):
 *   - `checkCodexPlugin(projectRoot)` returns a structured result object.
 *   - `renderCodexPluginSection(result)` formats it as text.
 *   - `computeCacheSimulationPath(...)` is pure string composition.
 *
 * Exports:
 *   - `checkCodexPlugin(projectRoot)` — structured readiness status.
 *   - `computeCacheSimulationPath(marketplaceName, pluginName, version)` —
 *     pure path composition; no fs access.
 *   - `renderCodexPluginSection(result)` — text formatter for the doctor
 *     section.
 *   - `MARKETPLACE_NAME` / `PLUGIN_NAME` / `MANIFEST_REL_PATH` /
 *     `CATALOG_REL_PATH` — exposed for test cross-checks.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Identity SoT (Phase 61 rebrand, REBRAND-02): marketplace/plugin name from the
// frozen seam (scripts/lib/pkg-identity.cjs), not a hardcoded 'get-design-done'.
const { MARKETPLACE_NAME, PLUGIN_NAME } = require('../pkg-identity.cjs');
const MANIFEST_REL_PATH = '.codex-plugin/plugin.json';
const CATALOG_REL_PATH = '.claude-plugin/marketplace.json';

// Sentinel rendered when neither manifest nor package.json yields a version.
const VERSION_PLACEHOLDER = '<version-from-package.json>';

// Reuse C1's required-fields tuple. Lazy-require keeps the doctor module
// independent of the converter's runtime cost when only the formatter is
// imported (e.g., for a unit test of `computeCacheSimulationPath`).
function loadConverterRequiredFields() {
  // eslint-disable-next-line global-require
  const c1 = require('./converters/codex-plugin.cjs');
  return c1.MANIFEST_REQUIRED_FIELDS;
}

/**
 * Validate a parsed `.codex-plugin/plugin.json` object against the C1
 * spec (required fields + kebab-case name + semver version). Returns
 * `{valid, errors}` — never throws. Mirrors the validateManifest helper
 * in doctor-cursor-marketplace.cjs but uses Codex schema rules.
 *
 * @param {*} parsed                                  Parsed JSON value.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCodexManifest(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['manifest is not a JSON object'] };
  }

  const required = loadConverterRequiredFields();
  for (const field of required) {
    if (parsed[field] === undefined || parsed[field] === null) {
      errors.push(`missing required field "${field}"`);
    }
  }

  if (parsed.name !== undefined && parsed.name !== null) {
    if (typeof parsed.name !== 'string' || parsed.name.length === 0) {
      errors.push('name must be a non-empty string');
    } else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(parsed.name)) {
      errors.push('name must be kebab-case (lowercase letters, digits, single hyphens)');
    }
  }

  if (parsed.version !== undefined && parsed.version !== null) {
    if (typeof parsed.version !== 'string' || !/^\d+\.\d+\.\d+/.test(parsed.version)) {
      errors.push('version must be semver-shaped (x.y.z)');
    }
  }

  if (parsed.description !== undefined && parsed.description !== null) {
    if (typeof parsed.description !== 'string' || parsed.description.length === 0) {
      errors.push('description must be a non-empty string');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Safely read + parse a JSON file. Returns `{exists, parsed, error}`.
 * @param {string} filePath
 * @returns {{ exists: boolean, parsed: *, error: string|null }}
 */
function readJsonFileSafe(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { exists: false, parsed: null, error: null };
    }
    return { exists: false, parsed: null, error: 'read failed: ' + e.message };
  }
  try {
    return { exists: true, parsed: JSON.parse(raw), error: null };
  } catch (e) {
    return { exists: true, parsed: null, error: 'JSON parse error: ' + e.message };
  }
}

/**
 * Compute the install cache path WITHOUT touching the filesystem outside
 * `projectRoot` (or anywhere, actually — this is pure string composition).
 * The path schema is documented in research § Plugin cache layout:
 *
 *   ~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/
 *
 * Per D-10 we do NOT verify this path exists — `codex` CLI may not be
 * installed locally. The maintainer field-test (post-merge, on a Codex-
 * installed machine) is the only place this path is actually checked.
 *
 * @param {string} marketplaceName  Catalog `.name` field (default
 *                                  'hone' for Hone).
 * @param {string} pluginName       Manifest `.name` field (same as
 *                                  marketplaceName for Hone).
 * @param {string|null|undefined} version  Manifest `.version` field, or
 *                                          null/undefined to render the
 *                                          `<version-from-package.json>`
 *                                          placeholder.
 * @returns {string}                Absolute path with `~` expanded to
 *                                  `os.homedir()`. Forward slashes per
 *                                  Codex docs convention.
 */
function computeCacheSimulationPath(marketplaceName, pluginName, version) {
  const home = os.homedir().replace(/\\/g, '/');
  const ver = (typeof version === 'string' && version.length > 0)
    ? version
    : VERSION_PLACEHOLDER;
  return home + '/.codex/plugins/cache/' + marketplaceName + '/' + pluginName + '/' + ver + '/';
}

/**
 * Read-only Codex Plugin readiness reporter. Inspects `projectRoot` for
 * the manifest + catalog artifacts and returns a structured verdict.
 *
 * No writes, no network, no `codex` CLI invocation. Tmpdir-safe per D-10.
 *
 * @param {string} projectRoot                       Path to inspect.
 * @returns {{
 *   manifest: {
 *     present: boolean,
 *     path: string,
 *     valid: boolean | null,
 *     version: string | null,
 *     errors: string[],
 *   },
 *   catalog: {
 *     present: boolean,
 *     path: string,
 *     referencesCodexPlugin: boolean,
 *     reusedFromClaude: boolean,
 *   },
 *   cacheSimulation: {
 *     path: string,
 *     verified: false,
 *     note: string,
 *   },
 *   verdict: 'ready-to-install' | 'manifest-only-not-ready',
 *   verdictReasons: string[],
 * }}
 */
function checkCodexPlugin(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new Error('checkCodexPlugin: projectRoot is required');
  }

  const manifestPath = path.join(projectRoot, MANIFEST_REL_PATH);
  const catalogPath = path.join(projectRoot, CATALOG_REL_PATH);
  const pkgPath = path.join(projectRoot, 'package.json');

  const manifestRead = readJsonFileSafe(manifestPath);
  const catalogRead = readJsonFileSafe(catalogPath);
  const pkgRead = readJsonFileSafe(pkgPath);

  // ── Manifest ────────────────────────────────────────────────────────
  const manifest = {
    present: false,
    path: manifestPath,
    valid: null,
    version: null,
    errors: [],
  };

  if (manifestRead.exists) {
    manifest.present = true;
    if (manifestRead.error) {
      manifest.valid = false;
      manifest.errors = [manifestRead.error];
    } else {
      const validation = validateCodexManifest(manifestRead.parsed);
      manifest.valid = validation.valid;
      manifest.errors = validation.errors;
      if (manifestRead.parsed && typeof manifestRead.parsed.version === 'string') {
        manifest.version = manifestRead.parsed.version;
      }
    }
  }

  // ── Catalog ─────────────────────────────────────────────────────────
  const catalog = {
    present: false,
    path: catalogPath,
    referencesCodexPlugin: false,
    reusedFromClaude: false,
  };

  if (catalogRead.exists && !catalogRead.error
      && catalogRead.parsed && typeof catalogRead.parsed === 'object') {
    catalog.present = true;
    catalog.reusedFromClaude = true;
    // Reference check: any entry in `plugins[]` with name === manifest.name
    // (or PLUGIN_NAME if manifest absent / unparsed) signals an explicit
    // reference. Per D-14 the catalog is reused regardless.
    const refName = (manifestRead.exists
      && manifestRead.parsed
      && typeof manifestRead.parsed.name === 'string'
      && manifestRead.parsed.name.length > 0)
      ? manifestRead.parsed.name
      : PLUGIN_NAME;
    if (Array.isArray(catalogRead.parsed.plugins)) {
      catalog.referencesCodexPlugin = catalogRead.parsed.plugins.some(
        (entry) => entry && typeof entry === 'object' && entry.name === refName
      );
    }
  } else if (catalogRead.exists && catalogRead.error) {
    // Malformed catalog — mark present but unreusable. Keep
    // referencesCodexPlugin false. reusedFromClaude stays false since
    // we couldn't actually parse it. This is a Rule 1 safety: the
    // doctor should not lie about reusable catalogs.
    catalog.present = true;
    catalog.reusedFromClaude = false;
  }

  // ── Version (prefer manifest, fall back to package.json) ───────────
  let resolvedVersion = manifest.version;
  if (!resolvedVersion
      && pkgRead.exists && !pkgRead.error
      && pkgRead.parsed && typeof pkgRead.parsed.version === 'string') {
    resolvedVersion = pkgRead.parsed.version;
  }

  // ── Cache simulation (computed, never verified) ─────────────────────
  const cacheSimulation = {
    path: computeCacheSimulationPath(MARKETPLACE_NAME, PLUGIN_NAME, resolvedVersion),
    verified: false,
    note: 'codex CLI may not be installed locally — path computed not verified',
  };

  // ── Verdict ─────────────────────────────────────────────────────────
  const verdictReasons = [];
  if (!manifest.present) {
    verdictReasons.push('manifest absent');
  } else if (manifest.valid === false) {
    if (manifest.errors.length > 0 && /JSON parse error/.test(manifest.errors[0])) {
      verdictReasons.push('manifest JSON parse error: ' + manifest.errors[0].replace(/^JSON parse error:\s*/, ''));
    } else {
      verdictReasons.push('manifest schema invalid: ' + (manifest.errors[0] || 'unknown reason'));
    }
  }
  if (!catalog.present) {
    verdictReasons.push('catalog absent');
  }

  const verdict = (manifest.present && manifest.valid === true && catalog.present)
    ? 'ready-to-install'
    : 'manifest-only-not-ready';

  return {
    manifest,
    catalog,
    cacheSimulation,
    verdict,
    verdictReasons,
  };
}

/**
 * Render the inspection result as the doctor section text. Pure — no IO.
 *
 * Output shape (per plan <interfaces>):
 *
 *   Codex Plugin status
 *     manifest .codex-plugin/plugin.json: present (version 1.28.8) — schema valid
 *     catalog .claude-plugin/marketplace.json: present — referenced by codex-plugin per D-14 (legacy-compatible catalog reuse)
 *     install path (computed, not verified): ~/.codex/plugins/cache/hone/hone/1.28.8/
 *     verdict: ready-to-install
 *
 * @param {ReturnType<checkCodexPlugin>} result
 * @returns {string} Multi-line text ending with a trailing newline.
 */
function renderCodexPluginSection(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('renderCodexPluginSection: result is required');
  }

  const lines = ['Codex Plugin status'];

  // Manifest line
  let manifestState;
  if (!result.manifest.present) {
    manifestState = 'absent';
  } else if (result.manifest.errors.length > 0
      && /^JSON parse error/.test(result.manifest.errors[0])) {
    manifestState = 'present — ' + result.manifest.errors[0];
  } else {
    const ver = result.manifest.version
      ? '(version ' + result.manifest.version + ')'
      : '(version unknown)';
    if (result.manifest.valid === true) {
      manifestState = 'present ' + ver + ' — schema valid';
    } else {
      const firstErr = result.manifest.errors[0] || 'unknown error';
      manifestState = 'present ' + ver + ' — schema invalid: ' + firstErr;
    }
  }
  lines.push('  manifest .codex-plugin/plugin.json: ' + manifestState);

  // Catalog line
  let catalogState;
  if (!result.catalog.present) {
    catalogState = 'absent';
  } else if (result.catalog.referencesCodexPlugin) {
    catalogState = 'present — referenced by codex-plugin per D-14 (legacy-compatible catalog reuse)';
  } else {
    catalogState = 'present — would be reused per D-14 (legacy-compatible catalog reuse)';
  }
  lines.push('  catalog .claude-plugin/marketplace.json: ' + catalogState);

  // Install path line — always shows the "computed, not verified" guarantee
  lines.push('  install path (computed, not verified): ' + result.cacheSimulation.path);

  // Verdict line — parenthetical reasons only when non-ready
  let verdictLine = '  verdict: ' + result.verdict;
  if (result.verdict !== 'ready-to-install' && result.verdictReasons.length > 0) {
    verdictLine += ' (' + result.verdictReasons.join('; ') + ')';
  }
  lines.push(verdictLine);

  return lines.join('\n') + '\n';
}

module.exports = {
  checkCodexPlugin,
  computeCacheSimulationPath,
  renderCodexPluginSection,
  validateCodexManifest,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  MANIFEST_REL_PATH,
  CATALOG_REL_PATH,
};
