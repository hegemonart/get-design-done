'use strict';

// Per-runtime install/uninstall orchestrator. Returns a structured Result
// for every runtime touched so the caller can render a per-runtime summary.

const fs = require('node:fs');
const path = require('node:path');

const { getRuntime, getRuntimeModels } = require('./runtimes.cjs');
const { resolveConfigDir } = require('./config-dir.cjs');
const {
  mergeClaudeSettings,
  removeClaudeSettings,
  buildAgentsFileContent,
  isPluginOwned,
} = require('./merge.cjs');

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

function installRuntime(runtimeId, opts) {
  const runtime = getRuntime(runtimeId);
  const dryRun = Boolean(opts && opts.dryRun);
  const configDir = resolveConfigDir(runtimeId, opts);

  let result;
  if (runtime.kind === 'claude-marketplace') {
    result = installClaudeMarketplace(runtime, configDir, dryRun);
  } else if (runtime.kind === 'agents-md') {
    result = installAgentsMd(runtime, configDir, dryRun);
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

  let result;
  if (runtime.kind === 'claude-marketplace') {
    result = uninstallClaudeMarketplace(runtime, configDir, dryRun);
  } else if (runtime.kind === 'agents-md') {
    result = uninstallAgentsMd(runtime, configDir, dryRun);
  } else {
    throw new Error(`Unsupported runtime kind: ${runtime.kind}`);
  }

  // Phase 26 D-06 — clean up the models.json we wrote on install.
  // Idempotent: missing file → unchanged; foreign file (no fingerprint) is
  // left alone, mirroring the AGENTS.md skipped-foreign discipline.
  result.modelsJson = uninstallModelsJson(runtime, configDir, dryRun);
  return result;
}

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

function installAgentsMd(runtime, configDir, dryRun) {
  ensureDir(configDir, dryRun);
  const fileName = (runtime.files && runtime.files[0]) || 'AGENTS.md';
  const target = path.join(configDir, fileName);
  const desired = buildAgentsFileContent(runtime);

  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    if (current === desired) {
      return {
        runtime: runtime.id,
        path: target,
        action: 'unchanged',
        dryRun,
      };
    }
    if (!isPluginOwned(current)) {
      // Don't clobber unrelated user-authored AGENTS.md / GEMINI.md.
      return {
        runtime: runtime.id,
        path: target,
        action: 'skipped-foreign',
        dryRun,
        reason: `Existing ${fileName} was not authored by this plugin; refusing to overwrite. Move it aside or pass --force (not yet supported) to replace.`,
      };
    }
    if (!dryRun) atomicWrite(target, desired);
    return {
      runtime: runtime.id,
      path: target,
      action: 'updated',
      dryRun,
    };
  }
  if (!dryRun) atomicWrite(target, desired);
  return {
    runtime: runtime.id,
    path: target,
    action: 'created',
    dryRun,
  };
}

function uninstallAgentsMd(runtime, configDir, dryRun) {
  const fileName = (runtime.files && runtime.files[0]) || 'AGENTS.md';
  const target = path.join(configDir, fileName);
  if (!fs.existsSync(target)) {
    return {
      runtime: runtime.id,
      path: target,
      action: 'unchanged',
      dryRun,
    };
  }
  const current = fs.readFileSync(target, 'utf8');
  if (!isPluginOwned(current)) {
    return {
      runtime: runtime.id,
      path: target,
      action: 'skipped-foreign',
      dryRun,
      reason: `Existing ${fileName} was not authored by this plugin; not removing.`,
    };
  }
  if (!dryRun) fs.unlinkSync(target);
  return {
    runtime: runtime.id,
    path: target,
    action: 'removed',
    dryRun,
  };
}

// Phase 26 D-06 — `models.json` emission per runtime config-dir.
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
    if (runtime.kind === 'agents-md') {
      const fileName = (runtime.files && runtime.files[0]) || 'AGENTS.md';
      const target = path.join(configDir, fileName);
      if (!fs.existsSync(target)) continue;
      try {
        const content = fs.readFileSync(target, 'utf8');
        if (isPluginOwned(content)) installed.push(runtime.id);
      } catch {
        // ignore
      }
    }
  }
  return installed;
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
};
