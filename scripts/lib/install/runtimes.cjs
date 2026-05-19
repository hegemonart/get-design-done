'use strict';

// Per-runtime install matrix for the get-design-done plugin.
//
// Each entry is pure data describing how to install / uninstall the plugin
// into one runtime. The 14 runtimes listed below are roadmap-locked
// (Phase 24 D-02). Two `kind`s exist:
//
//   - `claude-marketplace` — register a marketplace entry + flip
//     `enabledPlugins[<plugin>@<marketplace>]` in settings.json. Claude
//     Code only.
//
//   - `multi-artifact` — per Phase 28.7: install one or more artifact kinds
//     (skills, commands, agents) using runtime-artifact-layout.cjs +
//     per-runtime converters at scripts/lib/install/converters/<runtime>.cjs.
//     Replaces the broken Phase 24 `agents-md` placeholder which dropped a
//     single AGENTS.md file per runtime (Phase 28.7 D-02 + D-08). The actual
//     install logic now lives in installer.cjs → runtime-artifact-layout.cjs;
//     `files:` is intentionally absent on these entries because destination
//     paths are computed by the artifact-layout resolver.
//
// Adding a new runtime: append to RUNTIMES below, append the same id to the
// alphabetised baseline at test-fixture/baselines/phase-24/runtimes.txt,
// and add a matching branch in runtime-artifact-layout.cjs (Phase 28.7).

const REPO = 'hegemonart/get-design-done';
const MARKETPLACE_NAME = 'get-design-done';
const PLUGIN_NAME = 'get-design-done';

const RUNTIMES = Object.freeze([
  {
    id: 'claude',
    displayName: 'Claude Code',
    configDirEnv: 'CLAUDE_CONFIG_DIR',
    configDirFallback: '.claude',
    kind: 'claude-marketplace',
    files: [],
    marketplaceEntry: {
      name: MARKETPLACE_NAME,
      pluginName: PLUGIN_NAME,
      repo: REPO,
    },
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    configDirEnv: 'OPENCODE_CONFIG_DIR',
    configDirFallback: '.config/opencode',
    kind: 'multi-artifact',
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    configDirEnv: 'GEMINI_CONFIG_DIR',
    configDirFallback: '.gemini',
    kind: 'multi-artifact',
    // Phase 27 (Plan 27-11): peer-CLI delegation binary, ACP protocol.
    peerBinary: process.platform === 'win32' ? 'gemini.cmd' : 'gemini',
  },
  {
    id: 'kilo',
    displayName: 'Kilo Code',
    configDirEnv: 'KILO_CONFIG_DIR',
    configDirFallback: '.kilo',
    kind: 'multi-artifact',
  },
  {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    configDirEnv: 'CODEX_HOME',
    configDirFallback: '.codex',
    kind: 'multi-artifact',
    // Phase 27 (Plan 27-11): peer-CLI delegation binary, ASP protocol.
    peerBinary: process.platform === 'win32' ? 'codex.cmd' : 'codex',
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot CLI',
    configDirEnv: 'COPILOT_CONFIG_DIR',
    configDirFallback: '.copilot',
    kind: 'multi-artifact',
    // Phase 27 (Plan 27-11): peer-CLI delegation binary, ACP protocol.
    peerBinary: process.platform === 'win32' ? 'copilot.cmd' : 'copilot',
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    configDirEnv: 'CURSOR_CONFIG_DIR',
    configDirFallback: '.cursor',
    kind: 'multi-artifact',
    // Phase 27 (Plan 27-11): peer-CLI delegation binary, ACP protocol.
    peerBinary: process.platform === 'win32' ? 'cursor-agent.cmd' : 'cursor-agent',
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    configDirEnv: 'WINDSURF_CONFIG_DIR',
    configDirFallback: '.windsurf',
    kind: 'multi-artifact',
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    configDirEnv: 'ANTIGRAVITY_CONFIG_DIR',
    configDirFallback: '.antigravity',
    kind: 'multi-artifact',
  },
  {
    id: 'augment',
    displayName: 'Augment',
    configDirEnv: 'AUGMENT_CONFIG_DIR',
    configDirFallback: '.augment',
    kind: 'multi-artifact',
  },
  {
    id: 'trae',
    displayName: 'Trae',
    configDirEnv: 'TRAE_CONFIG_DIR',
    configDirFallback: '.trae',
    kind: 'multi-artifact',
  },
  {
    id: 'qwen',
    displayName: 'Qwen Code',
    configDirEnv: 'QWEN_CONFIG_DIR',
    configDirFallback: '.qwen',
    kind: 'multi-artifact',
    // Phase 27 (Plan 27-11): peer-CLI delegation binary, ACP protocol.
    peerBinary: process.platform === 'win32' ? 'qwen.cmd' : 'qwen',
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    configDirEnv: 'CODEBUDDY_CONFIG_DIR',
    configDirFallback: '.codebuddy',
    kind: 'multi-artifact',
  },
  {
    id: 'cline',
    displayName: 'Cline',
    configDirEnv: 'CLINE_CONFIG_DIR',
    configDirFallback: '.cline',
    kind: 'multi-artifact',
  },
  // Phase 28.8 (Plan B1) — Tier-2 distribution channel. 15th entry, kind
  // 'cursor-marketplace'. Separate from the existing `id: 'cursor'` entry
  // (kind: 'multi-artifact') which remains the Tier-1 file-drop install
  // target. Per CONTEXT D-05 (additive), the two coexist — file-drop users
  // and marketplace consumers are independent flows.
  //
  // build-distribution-bundles.cjs (Plan 28-8-X1) and install.cjs --doctor
  // (Plan 28-8-B2) consult this entry. The regular install flow skips it
  // because `configDir` is null — detect-runtimes never matches it on disk.
  //
  // No `configDirEnv` / `configDirFallback` because Tier-2 channels are
  // out-of-band distribution bundles, not per-user runtime install dirs.
  // runtime-artifact-layout.cjs is NOT extended for this kind — Tier-2
  // bypasses the artifact-layout pipeline entirely.
  {
    id: 'cursor-marketplace',
    displayName: 'Cursor Marketplace',
    configDir: null,
    configDirFallback: null,
    kind: 'cursor-marketplace',
  },
  // Phase 28.8 (Plan 28-8-C1) — Tier-2 distribution channel. 16th entry,
  // kind 'codex-plugin'. Separate from the existing `id: 'codex'` entry
  // (kind: 'multi-artifact') which remains the Tier-1 file-drop AGENTS.md
  // install target (Phase 28.7). Per CONTEXT D-05 (additive), the two
  // coexist — file-drop users and marketplace consumers are independent
  // flows. Installed via `codex plugin marketplace add hegemonart/get-design-done`
  // per .planning/research/codex-plugins-2026-05-19.md § Distribution Mechanism.
  //
  // build-distribution-bundles.cjs (Plan 28-8-X1) and install.cjs --doctor
  // (Plan 28-8-C2) consult this entry. The regular install flow skips it
  // because `configDir` is null — detect-runtimes never matches it on disk.
  //
  // No `configDirEnv` / `configDirFallback` because Tier-2 channels are
  // out-of-band distribution bundles, not per-user runtime install dirs.
  // runtime-artifact-layout.cjs is NOT extended for this kind — Tier-2
  // bypasses the artifact-layout pipeline entirely (consumed by
  // build-distribution-bundles.cjs, not the multi-artifact installer).
  //
  // D-14: Codex reuses our existing `.claude-plugin/marketplace.json` via
  // documented legacy-compat catalog path — no separate Codex catalog file.
  {
    id: 'codex-plugin',
    displayName: 'Codex Plugin',
    configDir: null,
    configDirFallback: null,
    kind: 'codex-plugin',
  },
]);

const BY_ID = new Map(RUNTIMES.map((r) => [r.id, r]));

function getRuntime(id) {
  const r = BY_ID.get(id);
  if (!r) {
    throw new RangeError(
      `Unknown runtime "${id}". Known: ${[...BY_ID.keys()].join(', ')}`,
    );
  }
  return r;
}

function listRuntimes() {
  return RUNTIMES;
}

function listRuntimeIds() {
  return RUNTIMES.map((r) => r.id);
}

// Phase 26 D-06 — `tier_to_model` lookup helper.
//
// `getRuntimeModels(runtimeId, { cwd? })` resolves the per-runtime tier→model
// adapter from `reference/runtime-models.md` via `parse-runtime-models.cjs`.
// Returns `null` when the runtime has no entry in runtime-models.md (i.e.,
// the data source ships rows for fewer than 14 runtimes during the rolling
// research tail described in CONTEXT D-02). Caller is responsible for
// degrading gracefully (e.g., installer skips models.json emission when null).
//
// The parsed payload is cached per `cwd` to avoid re-reading the markdown
// on each runtime in a multi-runtime install loop.

const _modelsCache = new Map();

function getParsedRuntimeModels(opts) {
  const cwd = (opts && opts.cwd) || null;
  const cacheKey = cwd || '<default>';
  if (_modelsCache.has(cacheKey)) return _modelsCache.get(cacheKey);
  // Lazy require avoids a hard dep cycle if runtimes.cjs is imported in
  // contexts that don't ship the reference/ tree (theoretical — not used today).
  const { parseRuntimeModels } = require('./parse-runtime-models.cjs');
  const parsed = parseRuntimeModels(cwd ? { cwd } : {});
  _modelsCache.set(cacheKey, parsed);
  return parsed;
}

function getRuntimeModels(runtimeId, opts) {
  // Validate the runtime id up-front — this catches typos in the installer
  // entry rather than silently returning null for "claud" vs "claude".
  getRuntime(runtimeId);
  const parsed = getParsedRuntimeModels(opts);
  const entry = parsed.runtimes.find((r) => r.id === runtimeId);
  return entry || null;
}

// Test-only hook: drop the cached parse result. Used by tests that mutate
// the source markdown between assertions.
function _resetRuntimeModelsCache() {
  _modelsCache.clear();
}

// Phase 27 (Plan 27-11) — peer-CLI detection helpers.
//
// `listPeerCapableRuntimes()` returns the entries that carry a `peerBinary`
// field — the 5 runtimes that gdd can DELEGATE to (codex, gemini, cursor,
// copilot, qwen). The other 9 runtimes (claude, opencode, kilo, windsurf,
// antigravity, augment, trae, codebuddy, cline) are install targets only.
//
// `detectInstalledPeers({ which? })` checks each peer-capable runtime's
// `peerBinary` against the system PATH and returns the IDs of the peers
// that are installed locally. The `which` parameter is injectable for
// tests — the production caller passes a real `which`/`where` shim.

function listPeerCapableRuntimes() {
  return RUNTIMES.filter((r) => typeof r.peerBinary === 'string');
}

function detectInstalledPeers(opts) {
  const opts2 = opts || {};
  const whichFn = opts2.which || _defaultWhich;
  const detected = [];
  for (const r of listPeerCapableRuntimes()) {
    try {
      if (whichFn(r.peerBinary)) {
        detected.push(r.id);
      }
    } catch (_e) {
      // ENOENT / non-zero exit = not installed; never throw.
    }
  }
  return detected;
}

function _defaultWhich(binary) {
  const { execSync } = require('node:child_process');
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = execSync(`${cmd} ${binary}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return out.length > 0 ? out.split(/\r?\n/)[0] : null;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  RUNTIMES,
  REPO,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  getRuntime,
  listRuntimes,
  listRuntimeIds,
  getRuntimeModels,
  listPeerCapableRuntimes,
  detectInstalledPeers,
  _resetRuntimeModelsCache,
};
