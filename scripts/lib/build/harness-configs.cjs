'use strict';
// Phase 42 — per-harness build/compile config. The base record (id / name / configDir) comes from the
// Phase 41.5 manifest SoT (scripts/lib/manifest/harnesses.json); this layer adds the four placeholder
// substitutions + frontmatter-strip rules + the dist bundle slug. Adding a 15th harness = one manifest
// entry (+ an optional OVERRIDES row); everything else falls back to DEFAULTS.
//
// command_prefix is the ONLY field that affects the byte-identical Claude round-trip: it MUST be '/gdd:'
// for claude (the migration replaced literal '/gdd:' with {{command_prefix}}; the Claude compile reverses it).

const { readHarnesses } = require('../manifest/index.cjs');

const DEFAULTS = {
  command_prefix: '/gdd:',
  config_file: 'config.json',
  model: 'your configured model',
  ask_instruction: 'ask your agent',
  stripFrontmatter: [],
};

// Per-harness overrides. Only `codex` diverges on command_prefix (its custom-prompt grammar is flat,
// `/gdd-audit`, not the namespaced `/gdd:audit`); the rest share Claude's slash-command namespace.
const OVERRIDES = {
  claude:      { bundleSlug: 'claude-code', command_prefix: '/gdd:', config_file: '.claude/settings.json',     model: 'your configured Claude model',      ask_instruction: 'ask Claude Code' },
  codex:       { command_prefix: '/gdd-',  config_file: '.codex/config.toml',        model: 'your configured Codex model',       ask_instruction: 'ask Codex' },
  gemini:      { command_prefix: '/gdd:',  config_file: '.gemini/settings.json',     model: 'your configured Gemini model',      ask_instruction: 'ask Gemini' },
  qwen:        { command_prefix: '/gdd:',  config_file: '.qwen/settings.json',       model: 'your configured Qwen model',        ask_instruction: 'ask Qwen Code' },
  kilo:        { command_prefix: '/gdd:',  config_file: '.kilo/config.json',         model: 'your configured Kilo model',        ask_instruction: 'ask Kilo Code' },
  copilot:     { command_prefix: '/gdd:',  config_file: '.copilot/config.json',      model: 'your configured Copilot model',     ask_instruction: 'ask Copilot' },
  cursor:      { command_prefix: '/gdd:',  config_file: '.cursor/settings.json',     model: 'your configured Cursor model',      ask_instruction: 'ask Cursor' },
  windsurf:    { command_prefix: '/gdd:',  config_file: '.windsurf/settings.json',   model: 'your configured Windsurf model',    ask_instruction: 'ask Cascade' },
  antigravity: { command_prefix: '/gdd:',  config_file: '.antigravity/config.json',  model: 'your configured Antigravity model', ask_instruction: 'ask Antigravity' },
  augment:     { command_prefix: '/gdd:',  config_file: '.augment/config.json',      model: 'your configured Augment model',     ask_instruction: 'ask Augment' },
  trae:        { command_prefix: '/gdd:',  config_file: '.trae/config.json',         model: 'your configured Trae model',        ask_instruction: 'ask Trae' },
  codebuddy:   { command_prefix: '/gdd:',  config_file: '.codebuddy/config.json',    model: 'your configured CodeBuddy model',   ask_instruction: 'ask CodeBuddy' },
  cline:       { command_prefix: '/gdd:',  config_file: '.cline/config.json',        model: 'your configured Cline model',       ask_instruction: 'ask Cline' },
  opencode:    { command_prefix: '/gdd:',  config_file: '.opencode/config.json',     model: 'your configured OpenCode model',    ask_instruction: 'ask OpenCode' },
};

function buildConfigs(opts) {
  const { harnesses } = readHarnesses(opts);
  return harnesses.map((h) => {
    const ov = OVERRIDES[h.id] || {};
    return {
      id: h.id,
      name: h.name,
      configDir: h.config_dir,
      bundleSlug: ov.bundleSlug || h.id,
      ...DEFAULTS,
      ...ov,
    };
  });
}

const CONFIGS = buildConfigs();

function byId(id) {
  return CONFIGS.find((c) => c.id === id) || null;
}

function claude() {
  return byId('claude');
}

module.exports = { CONFIGS, byId, claude, buildConfigs, DEFAULTS };
