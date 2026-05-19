'use strict';

// Per-runtime install/uninstall orchestrator. Returns a structured Result
// for every runtime touched so the caller can render a per-runtime summary.
//
// Phase 28.7 (Plan 28.7-08) refactor — the previous `agents-md` kind (which
// dropped a single AGENTS.md/GEMINI.md placeholder per runtime, see Phase
// 28.7 D-02 "broken placeholder") is replaced with `multi-artifact`. For
// `multi-artifact` runtimes, we delegate to `runtime-artifact-layout.cjs`
// for the destination layout, then drive each kind through the matching
// per-runtime converter at `./converters/<runtime>.cjs`.
//
// Special case (Phase 28.7 D-09): cline is rules-based. Its layout returns
// `kinds: []` and `specialCase: 'clinerules-embed'`. We aggregate all
// skills through cline.cjs's `buildClinerulesFile` and write a single
// `.clinerules` file in the runtime's config dir.
//
// Carry-forward invariants (do NOT regress):
//   - claude branch (claude-marketplace) is untouched — settings.json
//     merge + flip enabledPlugins.
//   - models.json side-effect emission per runtime (Phase 26 D-06).
//   - Foreign-file protection — never clobber a user-authored file that
//     lacks any plugin fingerprint.
//   - Idempotent re-install (re-run = unchanged outcome).
//   - Atomic write via `${target}.tmp-${pid}` rename.
//   - Default scope = global (Phase 28.7 D-07).

const fs = require('node:fs');
const path = require('node:path');

const { getRuntime, getRuntimeModels } = require('./runtimes.cjs');
const { resolveConfigDir } = require('./config-dir.cjs');
const {
  mergeClaudeSettings,
  removeClaudeSettings,
  isPluginOwned,
} = require('./merge.cjs');
const {
  resolveRuntimeArtifactLayout,
  findInstallSourceRoot,
} = require('./runtime-artifact-layout.cjs');

// Phase 26 D-06 — schema for the per-runtime models.json file emitted into
// each runtime's config directory at install time. Forward-compatible: new
// fields land additive; breaking changes bump `schema_version`.
const MODELS_JSON_SCHEMA_VERSION = 1;
const MODELS_JSON_FILE = 'models.json';
const MODELS_JSON_SOURCE = 'reference/runtime-models.md';
const MODELS_JSON_FINGERPRINT_KEY = 'generated_by';
const MODELS_JSON_FINGERPRINT_VALUE = 'get-design-done';

function loadJsonOr(empty, filePath) {
  if (!fs.existsSync(filePath)) return empty;
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) return empty;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const friendly = new Error(
      `get-design-done installer: cannot parse ${filePath} as JSON\n  ${err.message}\n  Fix the file manually or delete it, then re-run.`,
    );
    friendly.code = 'EINSTALLER_BAD_JSON';
    friendly.path = filePath;
    throw friendly;
  }
}

function atomicWrite(target, contents) {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, target);
}

function ensureDir(dir, dryRun) {
  if (fs.existsSync(dir)) return false;
  if (!dryRun) fs.mkdirSync(dir, { recursive: true });
  return true;
}

// ---------------------------------------------------------------------------
// Public API — installRuntime / uninstallRuntime / detectInstalled
// ---------------------------------------------------------------------------

function installRuntime(runtimeId, opts) {
  const runtime = getRuntime(runtimeId);
  const dryRun = Boolean(opts && opts.dryRun);
  const configDir = resolveConfigDir(runtimeId, opts);
  const scope = (opts && opts.scope) || 'global';

  let result;
  if (runtime.kind === 'claude-marketplace') {
    result = installClaudeMarketplace(runtime, configDir, dryRun);
  } else if (runtime.kind === 'multi-artifact') {
    result = installMultiArtifact(runtime, configDir, dryRun, { scope });
  } else {
    throw new Error(`Unsupported runtime kind: ${runtime.kind}`);
  }

  // Phase 26 D-06 — emit per-runtime models.json into the same config-dir.
  // Side-effect attached to the primary result so existing callers see the
  // unchanged shape AND get visibility into the second file.
  result.modelsJson = installModelsJson(runtime, configDir, dryRun, opts);
  return result;
}

function uninstallRuntime(runtimeId, opts) {
  const runtime = getRuntime(runtimeId);
  const dryRun = Boolean(opts && opts.dryRun);
  const configDir = resolveConfigDir(runtimeId, opts);
  const scope = (opts && opts.scope) || 'global';

  let result;
  if (runtime.kind === 'claude-marketplace') {
    result = uninstallClaudeMarketplace(runtime, configDir, dryRun);
  } else if (runtime.kind === 'multi-artifact') {
    result = uninstallMultiArtifact(runtime, configDir, dryRun, { scope });
  } else {
    throw new Error(`Unsupported runtime kind: ${runtime.kind}`);
  }

  // Phase 26 D-06 — clean up the models.json we wrote on install.
  // Idempotent: missing file → unchanged; foreign file (no fingerprint) is
  // left alone, mirroring the foreign-file discipline above.
  result.modelsJson = uninstallModelsJson(runtime, configDir, dryRun);
  return result;
}

// ---------------------------------------------------------------------------
// Claude branch (claude-marketplace) — UNCHANGED from Phase 24 / 26
// ---------------------------------------------------------------------------

function installClaudeMarketplace(runtime, configDir, dryRun) {
  const settingsPath = path.join(configDir, 'settings.json');
  ensureDir(configDir, dryRun);
  const existing = loadJsonOr({}, settingsPath);
  const { next, changed } = mergeClaudeSettings(
    existing,
    runtime.marketplaceEntry,
  );
  if (!changed) {
    return {
      runtime: runtime.id,
      path: settingsPath,
      action: 'unchanged',
      dryRun,
    };
  }
  const formatted = `${JSON.stringify(next, null, 2)}\n`;
  if (!dryRun) atomicWrite(settingsPath, formatted);
  return {
    runtime: runtime.id,
    path: settingsPath,
    action: fs.existsSync(settingsPath) ? 'updated' : 'created',
    dryRun,
  };
}

function uninstallClaudeMarketplace(runtime, configDir, dryRun) {
  const settingsPath = path.join(configDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    return {
      runtime: runtime.id,
      path: settingsPath,
      action: 'unchanged',
      dryRun,
    };
  }
  const existing = loadJsonOr({}, settingsPath);
  const { next, changed } = removeClaudeSettings(
    existing,
    runtime.marketplaceEntry,
  );
  if (!changed) {
    return {
      runtime: runtime.id,
      path: settingsPath,
      action: 'unchanged',
      dryRun,
    };
  }
  const formatted = `${JSON.stringify(next, null, 2)}\n`;
  if (!dryRun) atomicWrite(settingsPath, formatted);
  return {
    runtime: runtime.id,
    path: settingsPath,
    action: 'removed',
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// Phase 28.7 (Plan 28.7-08) — Multi-artifact branch
// ---------------------------------------------------------------------------

/**
 * Compute the destination path for a single staged item.
 *
 * For `kind === 'skills'`     → <configDir>/<destSubpath>/<itemName>/SKILL.md
 * For `kind === 'commands'`   → <configDir>/<destSubpath>/<itemName>.md
 * For `kind === 'agents'`     → <configDir>/<destSubpath>/<itemName>.md
 *
 * `itemName` already has the prefix applied (e.g. `gdd-explore`) per the
 * StagedArtifact contract documented in runtime-artifact-layout.cjs.
 *
 * @param {string} configDir
 * @param {{kind: string, destSubpath: string}} kindDescriptor
 * @param {string} itemName
 * @returns {string}
 */
function computeDestPath(configDir, kindDescriptor, itemName) {
  const baseDir = path.join(configDir, kindDescriptor.destSubpath);
  if (kindDescriptor.kind === 'skills') {
    return path.join(baseDir, itemName, 'SKILL.md');
  }
  // commands + agents are single-file-per-skill
  return path.join(baseDir, `${itemName}.md`);
}

/**
 * Atomic, fingerprint-aware write of a single converter output to disk.
 *
 * Behavior matrix:
 *   - file does not exist                        → `created` (write)
 *   - exists, plugin-owned, content equal        → `unchanged` (skip)
 *   - exists, plugin-owned, content differs      → `updated` (write)
 *   - exists, NOT plugin-owned                   → `skipped-foreign` (no-op)
 *
 * Recursively ensures the parent directory exists (needed for nested
 * subpaths like `skills/<name>/SKILL.md` and `commands/gdd/<name>.md`).
 *
 * @param {string} target  absolute path to write
 * @param {string} desired desired file content
 * @param {boolean} dryRun
 * @returns {{action: 'created'|'updated'|'unchanged'|'skipped-foreign', reason?: string}}
 */
function writeFingerprinted(target, desired, dryRun) {
  if (fs.existsSync(target)) {
    let current = '';
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch (err) {
      return {
        action: 'skipped-foreign',
        reason: `Could not read existing ${path.basename(target)}: ${err.message}`,
      };
    }
    if (current === desired) {
      return { action: 'unchanged' };
    }
    if (!isPluginOwned(current)) {
      return {
        action: 'skipped-foreign',
        reason: `Existing ${path.basename(target)} was not authored by this plugin; refusing to overwrite. Move it aside or pass --force (not yet supported) to replace.`,
      };
    }
    if (!dryRun) {
      ensureDir(path.dirname(target), dryRun);
      atomicWrite(target, desired);
    }
    return { action: 'updated' };
  }
  if (!dryRun) {
    ensureDir(path.dirname(target), dryRun);
    atomicWrite(target, desired);
  }
  return { action: 'created' };
}

/**
 * Aggregate per-file actions into a single top-level action for the
 * runtime's install result.
 *
 * Priority order (highest severity wins):
 *   - 'skipped-foreign' — surface immediately so the user sees the
 *     refusal (a single foreign file ⇒ runtime action = skipped-foreign).
 *   - 'created'  — at least one file was newly created.
 *   - 'updated'  — at least one file changed in place.
 *   - 'unchanged' — every file already had the desired content.
 *
 * Used by `installMultiArtifact` to summarize a multi-file install.
 *
 * @param {Array<{action: string}>} perFileResults
 * @returns {string}
 */
function aggregateAction(perFileResults) {
  if (perFileResults.length === 0) return 'unchanged';
  const actions = new Set(perFileResults.map((r) => r.action));
  if (actions.has('skipped-foreign')) return 'skipped-foreign';
  if (actions.has('created')) return 'created';
  if (actions.has('updated')) return 'updated';
  return 'unchanged';
}

/**
 * Enumerate the skill names available in the source repo's skills/ dir.
 *
 * A "skill name" is a directory containing a SKILL.md file. Used by both
 * install and uninstall to figure out which artifacts the multi-artifact
 * installer is responsible for in this repo.
 *
 * @param {string} skillsRoot  absolute path to <repo>/skills
 * @returns {string[]}
 */
function listSourceSkills(skillsRoot) {
  if (!fs.existsSync(skillsRoot)) return [];
  return fs
    .readdirSync(skillsRoot)
    .filter((name) => {
      const dir = path.join(skillsRoot, name);
      try {
        if (!fs.statSync(dir).isDirectory()) return false;
        return fs.existsSync(path.join(dir, 'SKILL.md'));
      } catch {
        return false;
      }
    });
}

/**
 * Install all artifacts for a `multi-artifact` runtime.
 *
 * Resolves the per-runtime layout from `runtime-artifact-layout.cjs`,
 * stages every kind through its converter (or special-cases cline),
 * then writes each staged file via `writeFingerprinted`.
 *
 * @param {object} runtime  registry entry from runtimes.cjs
 * @param {string} configDir  absolute path to the runtime's config dir
 * @param {boolean} dryRun
 * @param {{scope?: 'local'|'global'}} [opts]
 * @returns {object} result with `runtime`, `path`, `action`, `dryRun`,
 *   `results` (per-file detail), and optional `reason`.
 */
function installMultiArtifact(runtime, configDir, dryRun, opts) {
  const scope = (opts && opts.scope) || 'global';
  const layout = resolveRuntimeArtifactLayout(runtime.id, configDir, scope);
  const sourceRoot = findInstallSourceRoot(configDir);
  const skillsRoot = path.join(sourceRoot, 'skills');
  const skillNames = listSourceSkills(skillsRoot);

  // Phase 28.7 D-09 special case — cline is rules-based.
  if (layout.specialCase === 'clinerules-embed') {
    return installCline(runtime, configDir, skillsRoot, skillNames, dryRun);
  }

  // Ensure the runtime's config dir exists before any per-kind writes.
  ensureDir(configDir, dryRun);

  const perFile = [];
  for (const kind of layout.kinds) {
    let staged;
    try {
      staged = kind.stage({
        skillsRoot,
        skillNames,
        scope,
        runtime: runtime.id,
        configDir,
      });
    } catch (err) {
      // Converter / layout failure for this kind — surface but don't crash
      // the entire multi-runtime install. Other kinds for the same runtime
      // are still attempted.
      perFile.push({
        kind: kind.kind,
        path: path.join(configDir, kind.destSubpath),
        action: 'skipped-foreign',
        reason: `stage() failed: ${err && err.message ? err.message : err}`,
      });
      continue;
    }
    for (const item of staged) {
      const destPath = computeDestPath(configDir, kind, item.name);
      const writeResult = writeFingerprinted(destPath, item.content, dryRun);
      perFile.push({
        kind: kind.kind,
        path: destPath,
        action: writeResult.action,
        ...(writeResult.reason ? { reason: writeResult.reason } : {}),
      });
    }
  }

  // Top-level path: report the runtime's config dir as the canonical
  // "result path" so the CLI summariser has something useful to print.
  // Per-file detail lives in `results`.
  const action = aggregateAction(perFile);
  const out = {
    runtime: runtime.id,
    path: configDir,
    action,
    dryRun,
    results: perFile,
  };
  // Surface the first skipped-foreign reason at the top level so CLI
  // summariser callers (which only print `r.reason` once) see why we
  // refused.
  if (action === 'skipped-foreign') {
    const firstSkipped = perFile.find((r) => r.action === 'skipped-foreign');
    if (firstSkipped && firstSkipped.reason) out.reason = firstSkipped.reason;
  }
  return out;
}

/**
 * Uninstall all artifacts for a `multi-artifact` runtime.
 *
 * Walks the same layout used at install time, then for each expected
 * destination file:
 *   - file missing                  → 'unchanged'
 *   - file plugin-owned             → 'removed' (unlink)
 *   - file NOT plugin-owned         → 'skipped-foreign' (leave alone)
 *
 * Also tidies up now-empty skill subdirectories (`<configDir>/skills/<name>/`)
 * after removing their SKILL.md. Does NOT remove the top-level
 * `<configDir>/skills/` or `<configDir>/commands/` dirs — those may host
 * user-authored skills/commands alongside ours.
 *
 * @param {object} runtime
 * @param {string} configDir
 * @param {boolean} dryRun
 * @param {{scope?: 'local'|'global'}} [opts]
 * @returns {object}
 */
function uninstallMultiArtifact(runtime, configDir, dryRun, opts) {
  const scope = (opts && opts.scope) || 'global';
  const layout = resolveRuntimeArtifactLayout(runtime.id, configDir, scope);

  // Phase 28.7 D-09 special case — cline.
  if (layout.specialCase === 'clinerules-embed') {
    return uninstallCline(runtime, configDir, dryRun);
  }

  const sourceRoot = findInstallSourceRoot(configDir);
  const skillsRoot = path.join(sourceRoot, 'skills');
  const skillNames = listSourceSkills(skillsRoot);

  const perFile = [];
  const skillDirsToTrim = [];

  for (const kind of layout.kinds) {
    for (const bareName of skillNames) {
      const itemName = (kind.prefix || '') + bareName;
      const destPath = computeDestPath(configDir, kind, itemName);
      if (!fs.existsSync(destPath)) {
        perFile.push({ kind: kind.kind, path: destPath, action: 'unchanged' });
        continue;
      }
      let current;
      try {
        current = fs.readFileSync(destPath, 'utf8');
      } catch (err) {
        perFile.push({
          kind: kind.kind,
          path: destPath,
          action: 'skipped-foreign',
          reason: `Could not read ${path.basename(destPath)}: ${err.message}`,
        });
        continue;
      }
      if (!isPluginOwned(current)) {
        perFile.push({
          kind: kind.kind,
          path: destPath,
          action: 'skipped-foreign',
          reason: `Existing ${path.basename(destPath)} was not authored by this plugin; not removing.`,
        });
        continue;
      }
      if (!dryRun) fs.unlinkSync(destPath);
      perFile.push({ kind: kind.kind, path: destPath, action: 'removed' });

      // If we removed a SKILL.md, remember to trim its now-empty parent.
      if (kind.kind === 'skills') {
        skillDirsToTrim.push(path.dirname(destPath));
      }
    }
  }

  // Trim empty per-skill subdirectories. Don't touch <configDir>/skills/
  // itself — it may host user skills.
  if (!dryRun) {
    for (const dir of skillDirsToTrim) {
      try {
        const remaining = fs.readdirSync(dir);
        if (remaining.length === 0) fs.rmdirSync(dir);
      } catch {
        // Best effort — never throw from cleanup.
      }
    }
  }

  const action = aggregateUninstallAction(perFile);
  const out = {
    runtime: runtime.id,
    path: configDir,
    action,
    dryRun,
    results: perFile,
  };
  if (action === 'skipped-foreign') {
    const firstSkipped = perFile.find((r) => r.action === 'skipped-foreign');
    if (firstSkipped && firstSkipped.reason) out.reason = firstSkipped.reason;
  }
  return out;
}

function aggregateUninstallAction(perFileResults) {
  if (perFileResults.length === 0) return 'unchanged';
  const actions = new Set(perFileResults.map((r) => r.action));
  if (actions.has('skipped-foreign')) return 'skipped-foreign';
  if (actions.has('removed')) return 'removed';
  return 'unchanged';
}

// ---------------------------------------------------------------------------
// Cline special case (Phase 28.7 D-09) — .clinerules file
// ---------------------------------------------------------------------------

/**
 * Install for cline — aggregate all source skills through cline.cjs's
 * convert() helper, then assemble the final `.clinerules` file via
 * `buildClinerulesFile`. Writes one file: `<configDir>/.clinerules`.
 *
 * @param {object} runtime
 * @param {string} configDir
 * @param {string} skillsRoot
 * @param {string[]} skillNames
 * @param {boolean} dryRun
 * @returns {object}
 */
function installCline(runtime, configDir, skillsRoot, skillNames, dryRun) {
  const cline = require('./converters/cline.cjs');
  ensureDir(configDir, dryRun);

  const blocks = skillNames.map((name) => {
    const srcPath = path.join(skillsRoot, name, 'SKILL.md');
    const raw = fs.readFileSync(srcPath, 'utf8');
    return { name, block: cline.convert(raw, name, { runtime: 'cline' }) };
  });

  const desired = cline.buildClinerulesFile(blocks);
  const target = path.join(configDir, '.clinerules');
  const writeResult = writeFingerprinted(target, desired, dryRun);

  return {
    runtime: runtime.id,
    path: target,
    action: writeResult.action,
    dryRun,
    ...(writeResult.reason ? { reason: writeResult.reason } : {}),
    results: [{ kind: 'clinerules', path: target, action: writeResult.action }],
  };
}

/**
 * Uninstall for cline — remove `<configDir>/.clinerules` if it carries a
 * plugin fingerprint (cline-rules header). Foreign files are left alone.
 *
 * @param {object} runtime
 * @param {string} configDir
 * @param {boolean} dryRun
 * @returns {object}
 */
function uninstallCline(runtime, configDir, dryRun) {
  const target = path.join(configDir, '.clinerules');
  if (!fs.existsSync(target)) {
    return {
      runtime: runtime.id,
      path: target,
      action: 'unchanged',
      dryRun,
      results: [{ kind: 'clinerules', path: target, action: 'unchanged' }],
    };
  }
  let current;
  try {
    current = fs.readFileSync(target, 'utf8');
  } catch (err) {
    return {
      runtime: runtime.id,
      path: target,
      action: 'skipped-foreign',
      dryRun,
      reason: `Could not read .clinerules: ${err.message}`,
      results: [
        {
          kind: 'clinerules',
          path: target,
          action: 'skipped-foreign',
          reason: `Could not read .clinerules: ${err.message}`,
        },
      ],
    };
  }
  if (!isPluginOwned(current)) {
    return {
      runtime: runtime.id,
      path: target,
      action: 'skipped-foreign',
      dryRun,
      reason: `Existing .clinerules was not authored by this plugin; not removing.`,
      results: [
        {
          kind: 'clinerules',
          path: target,
          action: 'skipped-foreign',
          reason: `Existing .clinerules was not authored by this plugin; not removing.`,
        },
      ],
    };
  }
  if (!dryRun) fs.unlinkSync(target);
  return {
    runtime: runtime.id,
    path: target,
    action: 'removed',
    dryRun,
    results: [{ kind: 'clinerules', path: target, action: 'removed' }],
  };
}

// ---------------------------------------------------------------------------
// Phase 26 D-06 — models.json emission per runtime config-dir.
// ---------------------------------------------------------------------------
//
// Format (locked by CONTEXT D-06):
//   {
//     "tier_to_model": { "opus": "<model>", "sonnet": "<model>", "haiku": "<model>" },
//     "reasoning_class_to_model": { "high": "<model>", "medium": "<model>", "low": "<model>" },
//     "runtime": "<runtime-id>",
//     "schema_version": 1,
//     "generated_at": "<ISO-timestamp>",
//     "source": "reference/runtime-models.md",
//     "generated_by": "get-design-done"
//   }
//
// `generated_by` is the fingerprint uninstall uses to decide whether the
// file is plugin-owned (mirroring the AGENTS.md fingerprint discipline in
// merge.cjs).

function buildModelsJsonPayload(runtime, opts) {
  const entry = getRuntimeModels(runtime.id, opts);
  if (!entry) return null;
  // Flatten { model: "..." } rows into bare strings per CONTEXT D-06's
  // schema example. provider_model_id (if present in the source) is dropped
  // here — runtime harnesses that need it can re-read runtime-models.md.
  const flatten = (rowMap) => {
    const out = {};
    for (const k of Object.keys(rowMap)) {
      out[k] = rowMap[k].model;
    }
    return out;
  };
  return {
    tier_to_model: flatten(entry.tier_to_model),
    reasoning_class_to_model: flatten(entry.reasoning_class_to_model),
    runtime: runtime.id,
    schema_version: MODELS_JSON_SCHEMA_VERSION,
    generated_at: (opts && opts.now) || new Date().toISOString(),
    source: MODELS_JSON_SOURCE,
    [MODELS_JSON_FINGERPRINT_KEY]: MODELS_JSON_FINGERPRINT_VALUE,
  };
}

function isModelsJsonPluginOwned(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return parsed[MODELS_JSON_FINGERPRINT_KEY] === MODELS_JSON_FINGERPRINT_VALUE;
}

function installModelsJson(runtime, configDir, dryRun, opts) {
  const target = path.join(configDir, MODELS_JSON_FILE);
  const payload = buildModelsJsonPayload(runtime, opts);
  if (!payload) {
    // Runtime has no entry in runtime-models.md (e.g., research tail). Skip
    // emission rather than writing an incomplete file. Surfaces as
    // "skipped-no-data" in install summary so the operator can see why.
    return {
      path: target,
      action: 'skipped-no-data',
      dryRun,
      reason: `No tier→model entry for runtime "${runtime.id}" in ${MODELS_JSON_SOURCE}`,
    };
  }
  ensureDir(configDir, dryRun);

  const desired = `${JSON.stringify(payload, null, 2)}\n`;

  if (fs.existsSync(target)) {
    let current;
    try {
      current = fs.readFileSync(target, 'utf8');
    } catch (err) {
      // Read failure is unusual but non-fatal — surface and continue.
      return {
        path: target,
        action: 'skipped-foreign',
        dryRun,
        reason: `Could not read existing ${MODELS_JSON_FILE}: ${err.message}`,
      };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(current);
    } catch {
      // Corrupted/foreign JSON we did not write — leave it alone.
      return {
        path: target,
        action: 'skipped-foreign',
        dryRun,
        reason: `Existing ${MODELS_JSON_FILE} is not valid JSON; refusing to overwrite.`,
      };
    }
    if (!isModelsJsonPluginOwned(parsed)) {
      return {
        path: target,
        action: 'skipped-foreign',
        dryRun,
        reason: `Existing ${MODELS_JSON_FILE} was not authored by this plugin; refusing to overwrite.`,
      };
    }
    // Compare ignoring `generated_at` so re-runs aren't perpetually "updated"
    // just because the timestamp moved.
    if (modelsJsonContentEqual(parsed, payload)) {
      return { path: target, action: 'unchanged', dryRun };
    }
    if (!dryRun) atomicWrite(target, desired);
    return { path: target, action: 'updated', dryRun };
  }
  if (!dryRun) atomicWrite(target, desired);
  return { path: target, action: 'created', dryRun };
}

function modelsJsonContentEqual(a, b) {
  // Strip `generated_at` from both sides — every other field must match
  // byte-for-byte for the install to be a true no-op.
  const stripTs = (o) => {
    const copy = { ...o };
    delete copy.generated_at;
    return copy;
  };
  return JSON.stringify(stripTs(a)) === JSON.stringify(stripTs(b));
}

function uninstallModelsJson(runtime, configDir, dryRun) {
  const target = path.join(configDir, MODELS_JSON_FILE);
  if (!fs.existsSync(target)) {
    return { path: target, action: 'unchanged', dryRun };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return {
      path: target,
      action: 'skipped-foreign',
      dryRun,
      reason: `Existing ${MODELS_JSON_FILE} is not valid JSON; not removing.`,
    };
  }
  if (!isModelsJsonPluginOwned(parsed)) {
    return {
      path: target,
      action: 'skipped-foreign',
      dryRun,
      reason: `Existing ${MODELS_JSON_FILE} was not authored by this plugin; not removing.`,
    };
  }
  if (!dryRun) fs.unlinkSync(target);
  return { path: target, action: 'removed', dryRun };
}

// ---------------------------------------------------------------------------
// detectInstalled — figure out which runtimes are currently provisioned
// ---------------------------------------------------------------------------
//
// A runtime is "installed" if at least one of its expected destination
// files exists AND carries a plugin fingerprint. For claude this is
// settings.json#enabledPlugins. For multi-artifact runtimes it's any
// plugin-owned SKILL.md / command file / .clinerules file at the
// runtime-layout-resolved location.

function detectInstalled(opts) {
  const installed = [];
  const { listRuntimes } = require('./runtimes.cjs');
  for (const runtime of listRuntimes()) {
    const configDir = resolveConfigDir(runtime.id, opts);
    if (runtime.kind === 'claude-marketplace') {
      const settingsPath = path.join(configDir, 'settings.json');
      if (!fs.existsSync(settingsPath)) continue;
      try {
        const data = loadJsonOr({}, settingsPath);
        const key = `${runtime.marketplaceEntry.pluginName}@${runtime.marketplaceEntry.name}`;
        if (data.enabledPlugins && data.enabledPlugins[key] === true) {
          installed.push(runtime.id);
        }
      } catch {
        // ignore
      }
      continue;
    }
    if (runtime.kind === 'multi-artifact') {
      if (detectMultiArtifactInstalled(runtime, configDir, opts)) {
        installed.push(runtime.id);
      }
    }
  }
  return installed;
}

/**
 * Return true iff at least one expected artifact path for this runtime
 * exists on disk AND is plugin-owned. Best-effort: any fs/layout error
 * is treated as "not installed" (we never throw from detection).
 *
 * @param {object} runtime
 * @param {string} configDir
 * @param {object} [opts]
 * @returns {boolean}
 */
function detectMultiArtifactInstalled(runtime, configDir, opts) {
  try {
    const scope = (opts && opts.scope) || 'global';
    const layout = resolveRuntimeArtifactLayout(runtime.id, configDir, scope);

    // Cline special case — single .clinerules file.
    if (layout.specialCase === 'clinerules-embed') {
      const target = path.join(configDir, '.clinerules');
      if (!fs.existsSync(target)) return false;
      const content = fs.readFileSync(target, 'utf8');
      return isPluginOwned(content);
    }

    // Multi-kind: any plugin-owned SKILL.md / command file counts. We
    // discover candidate names by scanning the destination subpath
    // rather than re-walking the source skills/ tree (detectInstalled
    // is called during peer-detection on user machines where the source
    // dir may not be present).
    for (const kind of layout.kinds) {
      const baseDir = path.join(configDir, kind.destSubpath);
      if (!fs.existsSync(baseDir)) continue;
      let entries;
      try {
        entries = fs.readdirSync(baseDir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        let candidate;
        if (kind.kind === 'skills') {
          candidate = path.join(baseDir, entry, 'SKILL.md');
        } else {
          // commands + agents: <entry>.md (we already see the .md in entry)
          candidate = path.join(baseDir, entry);
        }
        if (!fs.existsSync(candidate)) continue;
        try {
          const content = fs.readFileSync(candidate, 'utf8');
          if (isPluginOwned(content)) return true;
        } catch {
          // unreadable — skip
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  installRuntime,
  uninstallRuntime,
  detectInstalled,
  // Phase 26 D-06 — exported for tests / external tooling that wants to
  // preview the payload without performing a write.
  buildModelsJsonPayload,
  MODELS_JSON_FILE,
  MODELS_JSON_SCHEMA_VERSION,
  MODELS_JSON_SOURCE,
  // Phase 28.7 (Plan 28.7-08) — direct entry points for tests / external
  // tooling that wants to drive the multi-artifact pipeline without going
  // through `installRuntime` (which adds the models.json side-effect).
  installMultiArtifact,
  uninstallMultiArtifact,
};
