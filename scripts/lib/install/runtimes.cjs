'use strict';

// Per-runtime install matrix for the get-design-done plugin.
//
// Each entry is pure data describing how to install / uninstall the plugin
// into one runtime. The 14 runtimes listed below are roadmap-locked
// (Phase 24 D-02). Two `kind`s exist:
//
//   - `claude-marketplace` — register a marketplace entry + flip
//     `enabledPlugins[<name>@<marketplace>]` in settings.json. Today only
//     Claude Code uses this.
//
//   - `agents-md` — drop a runtime-specific instructions file (AGENTS.md /
//     GEMINI.md) into the runtime's config directory. Most modern AI coding
//     CLIs follow this convention.
//
// Adding a new runtime: append to RUNTIMES below, append the same id to the
// alphabetised baseline at test-fixture/baselines/phase-24/runtimes.txt.

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
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    configDirEnv: 'GEMINI_CONFIG_DIR',
    configDirFallback: '.gemini',
    kind: 'agents-md',
    files: ['GEMINI.md'],
  },
  {
    id: 'kilo',
    displayName: 'Kilo Code',
    configDirEnv: 'KILO_CONFIG_DIR',
    configDirFallback: '.kilo',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    configDirEnv: 'CODEX_HOME',
    configDirFallback: '.codex',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'copilot',
    displayName: 'GitHub Copilot CLI',
    configDirEnv: 'COPILOT_CONFIG_DIR',
    configDirFallback: '.copilot',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    configDirEnv: 'CURSOR_CONFIG_DIR',
    configDirFallback: '.cursor',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'windsurf',
    displayName: 'Windsurf',
    configDirEnv: 'WINDSURF_CONFIG_DIR',
    configDirFallback: '.windsurf',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'antigravity',
    displayName: 'Antigravity',
    configDirEnv: 'ANTIGRAVITY_CONFIG_DIR',
    configDirFallback: '.antigravity',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'augment',
    displayName: 'Augment',
    configDirEnv: 'AUGMENT_CONFIG_DIR',
    configDirFallback: '.augment',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'trae',
    displayName: 'Trae',
    configDirEnv: 'TRAE_CONFIG_DIR',
    configDirFallback: '.trae',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'qwen',
    displayName: 'Qwen Code',
    configDirEnv: 'QWEN_CONFIG_DIR',
    configDirFallback: '.qwen',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    configDirEnv: 'CODEBUDDY_CONFIG_DIR',
    configDirFallback: '.codebuddy',
    kind: 'agents-md',
    files: ['AGENTS.md'],
  },
  {
    id: 'cline',
    displayName: 'Cline',
    configDirEnv: 'CLINE_CONFIG_DIR',
    configDirFallback: '.cline',
    kind: 'agents-md',
    files: ['AGENTS.md'],
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

module.exports = {
  RUNTIMES,
  REPO,
  MARKETPLACE_NAME,
  PLUGIN_NAME,
  getRuntime,
  listRuntimes,
  listRuntimeIds,
  getRuntimeModels,
  _resetRuntimeModelsCache,
};
