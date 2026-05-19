'use strict';

// Config-dir lookup chain for the get-design-done multi-runtime installer.
//
// Order of precedence (Phase 24 D-03):
//   1. Explicit override (--config-dir <dir> from caller).
//   2. Per-runtime env var (CLAUDE_CONFIG_DIR, OPENCODE_CONFIG_DIR, ...).
//   3. POSIX/Windows fallback at $HOME / $USERPROFILE + the runtime's
//      configDirFallback (e.g. ~/.claude, ~/.gemini, ~/.config/opencode).
//
// resolveConfigDir returns the absolute path the installer should target.
// It does NOT verify the directory exists — that is the caller's job.

const path = require('node:path');
const os = require('node:os');

const { getRuntime, listRuntimes } = require('./runtimes.cjs');

function homeDir() {
  return os.homedir();
}

function resolveConfigDir(runtimeId, opts) {
  const runtime = getRuntime(runtimeId);

  // Phase 28.8 (Plan B1) — Tier-2 distribution-channel runtimes have
  // configDir === null and configDirFallback === null. They are NOT
  // per-user install targets; calling resolveConfigDir on them is a
  // programming error (the regular install flow skips them via
  // detect-runtimes). Throw a clear error rather than crashing on
  // `null.split('/')` further down.
  if (
    runtime.configDirFallback === null
    || typeof runtime.configDirFallback !== 'string'
  ) {
    throw new Error(
      `Runtime "${runtimeId}" is a Tier-2 distribution channel (kind: ${runtime.kind}); ` +
      'it has no per-user config dir. Filter these out before calling resolveConfigDir.'
    );
  }

  const overrides = (opts && opts.env) || process.env;
  const explicit = opts && opts.configDir;

  if (explicit && String(explicit).trim()) {
    return path.resolve(String(explicit).trim());
  }

  const envValue = overrides[runtime.configDirEnv];
  if (envValue && String(envValue).trim()) {
    return path.resolve(String(envValue).trim());
  }

  const home = (opts && opts.home) || homeDir();
  // configDirFallback may use POSIX separators (e.g. ".config/opencode") for
  // cross-runtime portability — path.join + path.resolve normalises to the
  // host platform's separator on output.
  return path.resolve(path.join(home, ...runtime.configDirFallback.split('/')));
}

function resolveAllConfigDirs(opts) {
  const out = {};
  for (const runtime of listRuntimes()) {
    // Phase 28.8 (Plan B1) — Tier-2 distribution channels have no per-user
    // config dir. Skip them so the returned map covers only the per-user
    // install targets (the 14 multi-artifact + claude-marketplace runtimes).
    if (
      runtime.configDirFallback === null
      || typeof runtime.configDirFallback !== 'string'
    ) {
      continue;
    }
    out[runtime.id] = resolveConfigDir(runtime.id, opts);
  }
  return out;
}

module.exports = {
  resolveConfigDir,
  resolveAllConfigDirs,
};
