'use strict';

// Per-runtime install/uninstall orchestrator. Returns a structured Result
// for every runtime touched so the caller can render a per-runtime summary.

const fs = require('node:fs');
const path = require('node:path');

const { getRuntime } = require('./runtimes.cjs');
const { resolveConfigDir } = require('./config-dir.cjs');
const {
  mergeClaudeSettings,
  removeClaudeSettings,
  buildAgentsFileContent,
  isPluginOwned,
} = require('./merge.cjs');

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

  if (runtime.kind === 'claude-marketplace') {
    return installClaudeMarketplace(runtime, configDir, dryRun);
  }
  if (runtime.kind === 'agents-md') {
    return installAgentsMd(runtime, configDir, dryRun);
  }
  throw new Error(`Unsupported runtime kind: ${runtime.kind}`);
}

function uninstallRuntime(runtimeId, opts) {
  const runtime = getRuntime(runtimeId);
  const dryRun = Boolean(opts && opts.dryRun);
  const configDir = resolveConfigDir(runtimeId, opts);

  if (runtime.kind === 'claude-marketplace') {
    return uninstallClaudeMarketplace(runtime, configDir, dryRun);
  }
  if (runtime.kind === 'agents-md') {
    return uninstallAgentsMd(runtime, configDir, dryRun);
  }
  throw new Error(`Unsupported runtime kind: ${runtime.kind}`);
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
};
